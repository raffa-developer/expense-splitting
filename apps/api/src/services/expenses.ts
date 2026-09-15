import type { Pool, PoolClient } from "pg";
import type { ExpenseShare, SplitType } from "../domain/splits.js";
import { AppError } from "../errors.js";

export interface ExpenseParticipantDetail {
  user_id: string;
  name: string;
  share: number;
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

export interface ExpenseWrite {
  description: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  shares: ExpenseShare[];
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
               json_build_object('user_id', pu.id, 'name', pu.name, 'share', ep.share)
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

  await client.query(
    `INSERT INTO expense_participants (expense_id, user_id, share)
     SELECT $1, item.user_id, item.share
     FROM unnest($2::uuid[], $3::bigint[]) AS item(user_id, share)`,
    [
      inserted.id,
      write.shares.map((share) => share.userId),
      write.shares.map((share) => share.share)
    ]
  );

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
      write.shares.map((share) => share.userId),
      write.shares.map((share) => share.share)
    ]
  );
  if (participantUpdate.rowCount !== write.shares.length) {
    throw new Error("Failed to update participant balances");
  }

  return inserted.id;
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
