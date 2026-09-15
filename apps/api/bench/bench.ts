import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import { createPool } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import {
  computeSettlements,
  type SettlementParticipant,
  type SettlementTransaction
} from "../src/domain/settlement.js";
import {
  getGroupBalances,
  recomputeGroupBalances,
  rebuildGroupBalances
} from "../src/services/balances.js";

const BENCH_DATABASE_URL =
  process.env.BENCH_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5433/expense_splitter_bench";

const datasets = [
  { members: 10, expenses: 100 },
  { members: 50, expenses: 1000 },
  { members: 1000, expenses: 100000 }
];

function databaseNameFromUrl(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name) {
    throw new Error("Benchmark database URL must include a database name");
  }
  return name;
}

function urlWithDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function ensureDatabase(url: string): Promise<void> {
  const name = databaseNameFromUrl(url);
  const admin = createPool(urlWithDatabase(url, "postgres"));
  try {
    const { rowCount } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name]
    );
    if (rowCount === 0) {
      await admin.query(`CREATE DATABASE "${name}"`);
      console.log(`Created benchmark database "${name}"`);
    }
  } finally {
    await admin.end();
  }
}

interface CountingPool {
  pool: Pool;
  counts: { value: number };
}

function withQueryCount(pool: Pool): CountingPool {
  const counts = { value: 0 };
  const proxy = new Proxy(pool, {
    get(target, property, receiver) {
      if (property === "query") {
        return (...args: unknown[]) => {
          counts.value += 1;
          return (target.query as unknown as (...queryArgs: unknown[]) => unknown)(
            ...args
          );
        };
      }
      return Reflect.get(target, property, receiver);
    }
  });
  return { pool: proxy as Pool, counts };
}

async function timed<T>(fn: () => Promise<T> | T): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

async function generateDataset(
  pool: Pool,
  memberCount: number,
  expenseCount: number
): Promise<string> {
  await pool.query(
    "TRUNCATE TABLE idempotency_keys, group_members, groups, users CASCADE"
  );

  await pool.query(
    `INSERT INTO users (name, email)
     SELECT 'User ' || lpad(i::text, 5, '0'), 'user' || i || '@bench.local'
     FROM generate_series(1, $1) AS i`,
    [memberCount]
  );

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO groups (name) VALUES ('Bench Group') RETURNING id`
  );
  const group = rows[0];
  if (!group) {
    throw new Error("Failed to create benchmark group");
  }

  await pool.query(
    `INSERT INTO group_members (group_id, user_id)
     SELECT $1, id FROM users`,
    [group.id]
  );

  await pool.query(
    `WITH ids AS (SELECT array_agg(id ORDER BY email) AS arr FROM users)
     INSERT INTO expenses (group_id, description, amount, split_type, paid_by)
     SELECT $1,
            'Expense ' || i,
            100 + (i % 9900),
            'equal',
            ids.arr[1 + ((i * 7919) % array_length(ids.arr, 1))]::uuid
     FROM generate_series(1, $2) AS i, ids`,
    [group.id, expenseCount]
  );

  await pool.query(
    `WITH exp AS (
       SELECT id, amount, row_number() OVER (ORDER BY id) AS rn
       FROM expenses
       WHERE group_id = $1
     ),
     ids AS (SELECT array_agg(id ORDER BY email) AS arr FROM users)
     INSERT INTO expense_participants (expense_id, user_id, share)
     SELECT exp.id,
            ids.arr[1 + ((exp.rn + j) % array_length(ids.arr, 1))]::uuid,
            (exp.amount / 4) + CASE WHEN j < (exp.amount % 4) THEN 1 ELSE 0 END
     FROM exp, ids, generate_series(0, 3) AS j`,
    [group.id]
  );

  return group.id;
}

interface NaiveBalances {
  balances: Map<string, { paid: number; owed: number }>;
  rowsLoaded: number;
}

async function computeBalancesNaively(
  pool: Pool,
  groupId: string
): Promise<NaiveBalances> {
  const expenses = await pool.query<{ paid_by: string; amount: number }>(
    `SELECT paid_by, amount FROM expenses WHERE group_id = $1`,
    [groupId]
  );
  const shares = await pool.query<{ user_id: string; share: number }>(
    `SELECT ep.user_id, ep.share
     FROM expense_participants ep
     JOIN expenses e ON e.id = ep.expense_id
     WHERE e.group_id = $1`,
    [groupId]
  );

  const balances = new Map<string, { paid: number; owed: number }>();
  const entryFor = (userId: string): { paid: number; owed: number } => {
    const existing = balances.get(userId);
    if (existing) {
      return existing;
    }
    const created = { paid: 0, owed: 0 };
    balances.set(userId, created);
    return created;
  };

  for (const row of expenses.rows) {
    entryFor(row.paid_by).paid += row.amount;
  }
  for (const row of shares.rows) {
    entryFor(row.user_id).owed += row.share;
  }

  return {
    balances,
    rowsLoaded: expenses.rows.length + shares.rows.length
  };
}

function settleByRepeatedSorting(
  participants: SettlementParticipant[]
): SettlementTransaction[] {
  const creditors = participants
    .filter((participant) => participant.balance > 0)
    .map((participant) => ({
      userId: participant.userId,
      name: participant.name,
      amount: participant.balance
    }));
  const debtors = participants
    .filter((participant) => participant.balance < 0)
    .map((participant) => ({
      userId: participant.userId,
      name: participant.name,
      amount: -participant.balance
    }));

  const compare = (
    a: { amount: number; userId: string },
    b: { amount: number; userId: string }
  ): number => {
    if (a.amount !== b.amount) {
      return b.amount - a.amount;
    }
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  };

  const transactions: SettlementTransaction[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(compare);
    debtors.sort(compare);

    const creditor = creditors[0];
    const debtor = debtors[0];
    if (!creditor || !debtor) {
      break;
    }

    const amount = Math.min(creditor.amount, debtor.amount);
    transactions.push({
      fromUserId: debtor.userId,
      fromName: debtor.name,
      toUserId: creditor.userId,
      toName: creditor.name,
      amount
    });

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) {
      creditors.shift();
    }
    if (debtor.amount === 0) {
      debtors.shift();
    }
  }

  return transactions;
}

interface BenchRow {
  users: number;
  expenses: number;
  participant_rows: number;
  maintained_ms: number;
  maintained_queries: number;
  recompute_ms: number;
  recompute_queries: number;
  naive_ms: number;
  naive_queries: number;
  rows_loaded: number;
  sorting_settlement_ms: number;
  heap_settlement_ms: number;
  transactions: number;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

async function main(): Promise<void> {
  await ensureDatabase(BENCH_DATABASE_URL);

  const pool = createPool(BENCH_DATABASE_URL);
  const results: BenchRow[] = [];

  try {
    await migrate(pool);

    for (const dataset of datasets) {
      const groupId = await generateDataset(
        pool,
        dataset.members,
        dataset.expenses
      );
      await rebuildGroupBalances(pool, groupId);

      const { rows: participantCountRows } = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM expense_participants ep
         JOIN expenses e ON e.id = ep.expense_id
         WHERE e.group_id = $1`,
        [groupId]
      );
      const participantRows = participantCountRows[0]?.count ?? 0;

      const maintainedCounter = withQueryCount(pool);
      const maintained = await timed(() =>
        getGroupBalances(maintainedCounter.pool, groupId)
      );

      const recomputeCounter = withQueryCount(pool);
      const recomputed = await timed(() =>
        recomputeGroupBalances(recomputeCounter.pool, groupId)
      );

      const naiveCounter = withQueryCount(pool);
      const naive = await timed(() => computeBalancesNaively(naiveCounter.pool, groupId));

      for (const balance of maintained.value.balances) {
        const naiveEntry = naive.value.balances.get(balance.user_id) ?? {
          paid: 0,
          owed: 0
        };
        if (
          naiveEntry.paid !== balance.paid ||
          naiveEntry.owed !== balance.owed
        ) {
          throw new Error(
            `Naive and maintained balances disagree for user ${balance.user_id}`
          );
        }
      }

      const recomputedByUser = new Map(
        recomputed.value.balances.map((balance) => [balance.user_id, balance])
      );
      for (const balance of maintained.value.balances) {
        const other = recomputedByUser.get(balance.user_id);
        if (
          !other ||
          other.paid !== balance.paid ||
          other.owed !== balance.owed ||
          other.settled !== balance.settled ||
          other.balance !== balance.balance
        ) {
          throw new Error(
            `Maintained and recomputed balances disagree for user ${balance.user_id}`
          );
        }
      }

      const participants: SettlementParticipant[] =
        maintained.value.balances.map((balance) => ({
          userId: balance.user_id,
          name: balance.name,
          balance: balance.balance
        }));

      const sorting = await timed(() => settleByRepeatedSorting(participants));
      const heap = await timed(() => computeSettlements(participants));

      if (JSON.stringify(sorting.value) !== JSON.stringify(heap.value)) {
        throw new Error("Heap and sorting settlements produced different results");
      }

      results.push({
        users: dataset.members,
        expenses: dataset.expenses,
        participant_rows: participantRows,
        maintained_ms: round(maintained.ms),
        maintained_queries: maintainedCounter.counts.value,
        recompute_ms: round(recomputed.ms),
        recompute_queries: recomputeCounter.counts.value,
        naive_ms: round(naive.ms),
        naive_queries: naiveCounter.counts.value,
        rows_loaded: naive.value.rowsLoaded,
        sorting_settlement_ms: round(sorting.ms),
        heap_settlement_ms: round(heap.ms),
        transactions: heap.value.length
      });
    }
  } finally {
    await pool.end();
  }

  console.table(results);
}

await main();
