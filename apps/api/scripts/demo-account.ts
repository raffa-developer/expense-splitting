import type { Pool, PoolClient } from "pg";
import { hashPassword } from "../src/auth/passwords.js";
import { config } from "../src/config.js";
import { createPool } from "../src/db/pool.js";
import { computeSettlements } from "../src/domain/settlement.js";
import {
  computeShares,
  type ParticipantInput,
  type SplitType
} from "../src/domain/splits.js";
import {
  getGroupBalances,
  recomputeGroupBalances
} from "../src/services/balances.js";
import { insertExpense, type ExpenseWrite } from "../src/services/expenses.js";

const DEMO_PASSWORD = "password123";

const demoPeople: { name: string; email: string }[] = [
  { name: "Alex", email: "alex@demo.local" },
  { name: "Bruno", email: "bruno@demo.local" },
  { name: "Carla", email: "carla@demo.local" },
  { name: "David", email: "david@demo.local" },
  { name: "Eve", email: "eve@demo.local" },
  { name: "Frank", email: "frank@demo.local" },
  { name: "Kevin", email: "kevin@demo.local" },
  { name: "Tomás", email: "tomas@demo.local" },
  { name: "Felipe", email: "felipe@demo.local" },
  { name: "Luís", email: "luis@demo.local" }
];

interface AccountRow {
  id: string;
  name: string;
  email: string;
}

interface Person {
  id: string;
  name: string;
}

type IdLookup = (name: string) => string;

interface GroupSpec {
  name: string;
  members: string[];
  expenses: (id: IdLookup, everyone: ParticipantInput[]) => ExpenseWrite[];
  settlement?: (id: IdLookup) => { from: string; to: string; amount: number } | null;
}

function expenseWrite(
  description: string,
  amount: number,
  paidBy: string,
  splitType: SplitType,
  participants: ParticipantInput[]
): ExpenseWrite {
  return {
    description,
    amount,
    paidBy,
    splitType,
    shares: computeShares({ splitType, amount, participants })
  };
}

const groupSpecs: GroupSpec[] = [
  {
    name: "Weekend Trip",
    members: ["Alex", "Bruno", "Carla", "David", "Eve"],
    expenses: (id, everyone) => [
      expenseWrite("Dinner at Time Out Market", 8400, id("$account"), "equal", everyone),
      expenseWrite("Uber to the venue", 2560, id("Alex"), "equal", everyone),
      expenseWrite("Drinks at Pink Street", 6000, id("Bruno"), "percentage", [
        { userId: id("$account"), percentage: 25 },
        { userId: id("Alex"), percentage: 20 },
        { userId: id("Bruno"), percentage: 25 },
        { userId: id("Carla"), percentage: 10 },
        { userId: id("David"), percentage: 10 },
        { userId: id("Eve"), percentage: 10 }
      ]),
      expenseWrite("Snacks", 1250, id("Carla"), "shares", [
        { userId: id("$account"), weight: 2 },
        { userId: id("Alex"), weight: 1 },
        { userId: id("Bruno"), weight: 1 },
        { userId: id("Carla"), weight: 1 },
        { userId: id("David"), weight: 1 },
        { userId: id("Eve"), weight: 1 }
      ]),
      expenseWrite("Taxi home", 4800, id("$account"), "exact", [
        { userId: id("$account"), share: 1600 },
        { userId: id("Alex"), share: 1600 },
        { userId: id("Bruno"), share: 1600 }
      ])
    ],
    settlement: (id) => ({
      from: id("David"),
      to: id("$account"),
      amount: 500
    })
  },
  {
    name: "Beach Night",
    members: ["Kevin", "Tomás", "Felipe", "Luís", "Alex", "Bruno", "Carla"],
    expenses: (id, everyone) => [
      expenseWrite("Comida + bebidas", 6000, id("Kevin"), "equal", everyone),
      expenseWrite("Uber", 3200, id("Tomás"), "equal", everyone),
      expenseWrite("Álcool", 2500, id("Felipe"), "equal", everyone),
      expenseWrite("Snacks", 3000, id("Luís"), "equal", everyone)
    ]
  }
];

async function findAccount(pool: Pool, email: string): Promise<AccountRow> {
  const { rows } = await pool.query<AccountRow>(
    `SELECT id, name, email FROM users WHERE email = $1`,
    [email]
  );
  const account = rows[0];
  if (!account) {
    throw new Error(
      `No account found for ${email}. Register it in the app first, then run this again.`
    );
  }
  return account;
}

async function ensureDemoUsers(pool: Pool): Promise<void> {
  for (const person of demoPeople) {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [person.name, person.email, passwordHash]
    );
  }
}

async function loadPeople(pool: Pool, names: string[]): Promise<Person[]> {
  const emails = names.map((name) => {
    const person = demoPeople.find((entry) => entry.name === name);
    if (!person) {
      throw new Error(`Unknown demo person ${name}`);
    }
    return person.email;
  });

  const { rows } = await pool.query<Person>(
    `SELECT id, name FROM users WHERE email = ANY($1) ORDER BY name`,
    [emails]
  );
  return rows;
}

async function removePreviousGroup(
  pool: Pool,
  userId: string,
  groupName: string
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT g.id
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.user_id = $1 AND g.name = $2`,
    [userId, groupName]
  );
  for (const group of rows) {
    await pool.query(`DELETE FROM groups WHERE id = $1`, [group.id]);
  }
}

async function insertSettlement(
  client: PoolClient,
  groupId: string,
  fromUserId: string,
  toUserId: string,
  amount: number
): Promise<void> {
  await client.query(
    `INSERT INTO settlements (group_id, from_user, to_user, amount)
     VALUES ($1, $2, $3, $4)`,
    [groupId, fromUserId, toUserId, amount]
  );

  for (const [userId, value] of [
    [fromUserId, amount],
    [toUserId, -amount]
  ] as const) {
    await client.query(
      `INSERT INTO group_balances (group_id, user_id, settled)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO UPDATE
       SET settled = group_balances.settled + EXCLUDED.settled`,
      [groupId, userId, value]
    );
  }
}

async function createDemoGroup(
  pool: Pool,
  account: AccountRow,
  spec: GroupSpec
): Promise<string> {
  const others = await loadPeople(pool, spec.members);
  const people: Person[] = [{ id: account.id, name: account.name }, ...others];
  const byName = new Map(people.map((person) => [person.name, person.id]));

  const id: IdLookup = (name) => {
    const resolved = name === "$account" ? account.name : name;
    const userId = byName.get(resolved);
    if (!userId) {
      throw new Error(`Missing demo person ${name}`);
    }
    return userId;
  };

  const everyone: ParticipantInput[] = people.map((person) => ({
    userId: person.id
  }));

  const writes = spec.expenses(id, everyone);
  const settlement = spec.settlement?.(id) ?? null;

  await removePreviousGroup(pool, account.id, spec.name);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: groupRows } = await client.query<{ id: string }>(
      `INSERT INTO groups (name, currency) VALUES ($1, $2) RETURNING id`,
      [spec.name, "EUR"]
    );
    const group = groupRows[0];
    if (!group) {
      throw new Error("Failed to insert demo group");
    }

    for (const person of people) {
      await client.query(
        `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`,
        [group.id, person.id]
      );
      await client.query(
        `INSERT INTO group_balances (group_id, user_id) VALUES ($1, $2)`,
        [group.id, person.id]
      );
    }

    for (const write of writes) {
      await insertExpense(client, group.id, write);
    }

    if (settlement) {
      await insertSettlement(
        client,
        group.id,
        settlement.from,
        settlement.to,
        settlement.amount
      );
    }

    await client.query("COMMIT");
    return group.id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function printSummary(
  pool: Pool,
  groupId: string,
  name: string
): Promise<void> {
  const { total, balances } = await getGroupBalances(pool, groupId);
  const recomputed = await recomputeGroupBalances(pool, groupId);
  if (JSON.stringify(balances) !== JSON.stringify(recomputed.balances)) {
    throw new Error("Maintained balances do not match a full recomputation");
  }

  const transactions = computeSettlements(
    balances.map((balance) => ({
      userId: balance.user_id,
      name: balance.name,
      balance: balance.balance
    }))
  );

  console.log("");
  console.log(`» ${name} — total ${(total / 100).toFixed(2)} EUR`);
  for (const balance of balances) {
    const sign = balance.balance > 0 ? "+" : "";
    console.log(
      `    ${balance.name.padEnd(8)} ${sign}${(balance.balance / 100).toFixed(2)} EUR`
    );
  }
  console.log("  Suggested settlement:");
  for (const transaction of transactions) {
    console.log(
      `    ${transaction.fromName} -> ${transaction.toName}: ${(transaction.amount / 100).toFixed(2)} EUR`
    );
  }
}

async function main(): Promise<void> {
  const email = process.argv[2] ?? process.env.DEMO_EMAIL;
  if (!email) {
    console.error(
      "Usage: npm run demo -w @expense-splitting/api -- <account-email>"
    );
    process.exit(1);
  }

  const pool = createPool(config.databaseUrl);
  try {
    const account = await findAccount(pool, email);
    await ensureDemoUsers(pool);

    console.log(`Demo groups for ${account.name} <${account.email}>`);
    for (const spec of groupSpecs) {
      const groupId = await createDemoGroup(pool, account, spec);
      await printSummary(pool, groupId, spec.name);
    }

    console.log("");
    console.log(
      "Demo users password: password123 (alex, bruno, carla, david, eve, frank, kevin, tomas, felipe, luis @demo.local)"
    );
  } finally {
    await pool.end();
  }
}

await main();
