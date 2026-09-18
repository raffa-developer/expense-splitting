import type { Pool, PoolClient } from "pg";
import type { SplitType } from "../domain/splits.js";
import { AppError } from "../errors.js";

export interface ExpenseParticipantDetail {
  user_id: string;
  name: string;
  share: number;
  percentage?: number | null;
  weight?: number | null;
}

export interface ExpenseDetail {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  split_type: SplitType;
  paid_by: string;
  paid_by_name: string;
  created_at: Date;
  participants: ExpenseParticipantDetail[];
}

export interface ExpenseWriteParticipant {
  userId: string;
  share: number;
  percentage?: number | undefined;
  weight?: number | undefined;
}

export interface ExpenseWrite {
  description: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  participants: ExpenseWriteParticipant[];
}

export interface ExpenseSnapshot {
  paidBy: string;
  amount: number;
  participants: { userId: string; share: number }[];
}

export interface GroupUserState {
  existingUsers: Set<string>;
  memberIds: Set<string>;
}

function detailQuery(
  condition: string,
  orderBy = "e.created_at, e.id"
): string {
  return `
    SELECT e.id, e.group_id, e.description, e.amount, e.split_type, e.paid_by,
           u.name AS paid_by_name, e.created_at,
           COALESCE(
             json_agg(
               (
                 json_build_object('user_id', pu.id, 'name', pu.name, 'share', ep.share)::jsonb
                 || CASE
                      WHEN ep.percentage IS NOT NULL
                      THEN jsonb_build_object('percentage', ep.percentage)
                      ELSE '{}'::jsonb
                    END
                 || CASE
                      WHEN ep.weight IS NOT NULL
                      THEN jsonb_build_object('weight', ep.weight)
                      ELSE '{}'::jsonb
                    END
               )
               ORDER BY pu.name, pu.id
             ) FILTER (WHERE pu.id IS NOT NULL),
             '[]'::json
           ) AS participants
    FROM expenses e
    JOIN users u ON u.id = e.paid_by
    LEFT JOIN expense_participants ep ON ep.expense_id = e.id
    LEFT JOIN users pu ON pu.id = ep.user_id
    WHERE ${condition}
    GROUP BY e.id, u.name
    ORDER BY ${orderBy}`;
}

export async function findExpenseOr404(
  pool: Pool,
  groupId: string,
  expenseId: string
): Promise<ExpenseDetail> {
  const { rows } = await pool.query<ExpenseDetail>(
    detailQuery("e.group_id = $1 AND e.id = $2"),
    [groupId, expenseId]
  );

  const expense = rows[0];
  if (!expense) {
    throw new AppError(404, "EXPENSE_NOT_FOUND", "Expense not found");
  }
  return expense;
}

export async function findExpensesByIds(
  pool: Pool,
  groupId: string,
  expenseIds: string[]
): Promise<ExpenseDetail[]> {
  const { rows } = await pool.query<ExpenseDetail>(
    detailQuery(
      "e.group_id = $1 AND e.id = ANY($2::uuid[])",
      "array_position($2::uuid[], e.id)"
    ),
    [groupId, expenseIds]
  );
  return rows;
}

export async function listExpensesPage(
  pool: Pool,
  groupId: string,
  limit: number,
  offset: number
): Promise<{ expenses: ExpenseDetail[]; total: number }> {
  const { rows } = await pool.query<ExpenseDetail>(
    `${detailQuery("e.group_id = $1")} LIMIT $2 OFFSET $3`,
    [groupId, limit, offset]
  );

  const { rows: countRows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM expenses WHERE group_id = $1`,
    [groupId]
  );

  return { expenses: rows, total: countRows[0]?.count ?? 0 };
}

async function insertParticipants(
  client: PoolClient,
  expenseId: string,
  participants: ExpenseWriteParticipant[]
): Promise<void> {
  await client.query(
    `INSERT INTO expense_participants (expense_id, user_id, share, percentage, weight)
     SELECT $1, item.user_id, item.share, item.percentage, item.weight
     FROM unnest($2::uuid[], $3::bigint[], $4::numeric[], $5::bigint[])
       AS item(user_id, share, percentage, weight)`,
    [
      expenseId,
      participants.map((participant) => participant.userId),
      participants.map((participant) => participant.share),
      participants.map((participant) => participant.percentage ?? null),
      participants.map((participant) => participant.weight ?? null)
    ]
  );
}

export async function applyExpenseBalances(
  client: PoolClient,
  groupId: string,
  write: ExpenseWrite
): Promise<void> {
  const payerUpdate = await client.query(
    `INSERT INTO group_balances (group_id, user_id, paid)
     VALUES ($1, $2, $3)
     ON CONFLICT (group_id, user_id) DO UPDATE
     SET paid = group_balances.paid + EXCLUDED.paid`,
    [groupId, write.paidBy, write.amount]
  );
  if (payerUpdate.rowCount !== 1) {
    throw new Error("Failed to update payer balance");
  }

  const participantUpdate = await client.query(
    `INSERT INTO group_balances (group_id, user_id, owed)
     SELECT $1, item.user_id, item.share
     FROM unnest($2::uuid[], $3::bigint[]) AS item(user_id, share)
     ON CONFLICT (group_id, user_id) DO UPDATE
     SET owed = group_balances.owed + EXCLUDED.owed`,
    [
      groupId,
      write.participants.map((participant) => participant.userId),
      write.participants.map((participant) => participant.share)
    ]
  );
  if (participantUpdate.rowCount !== write.participants.length) {
    throw new Error("Failed to update participant balances");
  }
}

export async function insertExpense(
  client: PoolClient,
  groupId: string,
  write: ExpenseWrite
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO expenses (group_id, description, amount, split_type, paid_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [groupId, write.description, write.amount, write.splitType, write.paidBy]
  );

  const inserted = rows[0];
  if (!inserted) {
    throw new Error("Expense insert did not return an id");
  }

  await insertParticipants(client, inserted.id, write.participants);
  await applyExpenseBalances(client, groupId, write);

  return inserted.id;
}

export async function updateExpense(
  client: PoolClient,
  groupId: string,
  expenseId: string,
  write: ExpenseWrite
): Promise<void> {
  const updated = await client.query(
    `UPDATE expenses
     SET description = $3, amount = $4, split_type = $5, paid_by = $6
     WHERE id = $1 AND group_id = $2`,
    [expenseId, groupId, write.description, write.amount, write.splitType, write.paidBy]
  );
  if (updated.rowCount !== 1) {
    throw new AppError(404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  await client.query("DELETE FROM expense_participants WHERE expense_id = $1", [
    expenseId
  ]);
  await insertParticipants(client, expenseId, write.participants);
}

export async function lockExpenseOr404(
  client: PoolClient,
  groupId: string,
  expenseId: string
): Promise<ExpenseSnapshot> {
  const { rows } = await client.query<{ paid_by: string; amount: number }>(
    `SELECT paid_by, amount
     FROM expenses
     WHERE id = $1 AND group_id = $2
     FOR UPDATE`,
    [expenseId, groupId]
  );

  const expense = rows[0];
  if (!expense) {
    throw new AppError(404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  const { rows: shareRows } = await client.query<{
    user_id: string;
    share: number;
  }>(
    `SELECT user_id, share
     FROM expense_participants
     WHERE expense_id = $1`,
    [expenseId]
  );

  return {
    paidBy: expense.paid_by,
    amount: expense.amount,
    participants: shareRows.map((row) => ({
      userId: row.user_id,
      share: row.share
    }))
  };
}

export async function reverseExpenseBalances(
  client: PoolClient,
  groupId: string,
  snapshot: ExpenseSnapshot
): Promise<void> {
  const payerUpdate = await client.query(
    `UPDATE group_balances
     SET paid = paid - $3
     WHERE group_id = $1 AND user_id = $2`,
    [groupId, snapshot.paidBy, snapshot.amount]
  );
  if (payerUpdate.rowCount !== 1) {
    throw new Error("Failed to reverse payer balance");
  }

  const participantUpdate = await client.query(
    `UPDATE group_balances AS gb
     SET owed = gb.owed - item.share
     FROM unnest($2::uuid[], $3::bigint[]) AS item(user_id, share)
     WHERE gb.group_id = $1 AND gb.user_id = item.user_id`,
    [
      groupId,
      snapshot.participants.map((participant) => participant.userId),
      snapshot.participants.map((participant) => participant.share)
    ]
  );
  if (participantUpdate.rowCount !== snapshot.participants.length) {
    throw new Error("Failed to reverse participant balances");
  }
}

export async function fetchGroupUserState(
  pool: Pool,
  groupId: string,
  userIds: string[]
): Promise<GroupUserState> {
  const { rows: users } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE id = ANY($1::uuid[])`,
    [userIds]
  );
  const { rows: members } = await pool.query<{ user_id: string }>(
    `SELECT user_id
     FROM group_members
     WHERE group_id = $1 AND user_id = ANY($2::uuid[])`,
    [groupId, userIds]
  );

  return {
    existingUsers: new Set(users.map((user) => user.id)),
    memberIds: new Set(members.map((member) => member.user_id))
  };
}

export function assertPayerAndParticipants(
  state: GroupUserState,
  payerId: string,
  participantIds: string[],
  prefix = ""
): void {
  if (!state.existingUsers.has(payerId)) {
    throw new AppError(404, "USER_NOT_FOUND", `${prefix}Payer not found`);
  }
  if (!state.memberIds.has(payerId)) {
    throw new AppError(
      400,
      "PAYER_NOT_MEMBER",
      `${prefix}The payer is not a member of this group`
    );
  }

  for (const participantId of participantIds) {
    if (!state.existingUsers.has(participantId)) {
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        `${prefix}Participant ${participantId} not found`
      );
    }
    if (!state.memberIds.has(participantId)) {
      throw new AppError(
        400,
        "PARTICIPANT_NOT_MEMBER",
        `${prefix}Participant ${participantId} is not a member of this group`
      );
    }
  }
}
