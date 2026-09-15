import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { computeShares, type SplitType } from "../domain/splits.js";
import { AppError } from "../errors.js";
import { getCurrentUser } from "../plugins/auth.js";
import { idParamSchema, uuidPattern } from "../schemas.js";
import { assertGroupMember, findGroupOr404 } from "../services/groups.js";

interface ExpenseRow {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  split_type: SplitType;
  paid_by: string;
  paid_by_name: string;
  created_at: Date;
  participants: { user_id: string; name: string; share: number }[];
}

interface CreateExpenseBody {
  description: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  participants: {
    userId: string;
    share?: number;
    percentage?: number;
    weight?: number;
  }[];
}

const expenseDetailParamsSchema = {
  type: "object",
  required: ["id", "expenseId"],
  properties: {
    id: { type: "string", pattern: uuidPattern },
    expenseId: { type: "string", pattern: uuidPattern }
  }
} as const;

const listExpensesQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    offset: { type: "integer", minimum: 0, default: 0 }
  }
} as const;

const createExpenseBodySchema = {
  type: "object",
  required: ["description", "amount", "paidBy", "splitType", "participants"],
  additionalProperties: false,
  properties: {
    description: { type: "string", minLength: 1, maxLength: 500 },
    amount: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    paidBy: { type: "string", pattern: uuidPattern },
    splitType: { type: "string", enum: ["equal", "exact", "percentage", "shares"] },
    participants: {
      type: "array",
      minItems: 1,
      maxItems: 1000,
      items: {
        type: "object",
        required: ["userId"],
        additionalProperties: false,
        properties: {
          userId: { type: "string", pattern: uuidPattern },
          share: {
            type: "integer",
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER
          },
          percentage: { type: "number", minimum: 0, maximum: 100 },
          weight: { type: "integer", minimum: 0, maximum: 1_000_000 }
        }
      }
    }
  }
} as const;

function expenseDetailQuery(single: boolean): string {
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
    WHERE e.group_id = $1${single ? " AND e.id = $2" : ""}
    GROUP BY e.id, u.name
    ORDER BY e.created_at, e.id`;
}

async function findExpenseOr404(
  pool: Pool,
  groupId: string,
  expenseId: string
): Promise<ExpenseRow> {
  const { rows } = await pool.query<ExpenseRow>(
    expenseDetailQuery(true),
    [groupId, expenseId]
  );

  const expense = rows[0];
  if (!expense) {
    throw new AppError(404, "EXPENSE_NOT_FOUND", "Expense not found");
  }
  return expense;
}

async function assertUsersInGroup(
  pool: Pool,
  groupId: string,
  payerId: string,
  participantIds: string[]
): Promise<void> {
  const ids = [...new Set([payerId, ...participantIds])];

  const { rows: users } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const existingUsers = new Set(users.map((user) => user.id));

  const { rows: members } = await pool.query<{ user_id: string }>(
    `SELECT user_id
     FROM group_members
     WHERE group_id = $1 AND user_id = ANY($2::uuid[])`,
    [groupId, ids]
  );
  const memberIds = new Set(members.map((member) => member.user_id));

  if (!existingUsers.has(payerId)) {
    throw new AppError(404, "USER_NOT_FOUND", "Payer not found");
  }
  if (!memberIds.has(payerId)) {
    throw new AppError(
      400,
      "PAYER_NOT_MEMBER",
      "The payer is not a member of this group"
    );
  }

  for (const participantId of participantIds) {
    if (!existingUsers.has(participantId)) {
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        `Participant ${participantId} not found`
      );
    }
    if (!memberIds.has(participantId)) {
      throw new AppError(
        400,
        "PARTICIPANT_NOT_MEMBER",
        `Participant ${participantId} is not a member of this group`
      );
    }
  }
}

export function registerExpenseRoutes(app: FastifyInstance, pool: Pool): void {
  app.post<{ Params: { id: string }; Body: CreateExpenseBody }>(
    "/api/groups/:id/expenses",
    {
      schema: { params: idParamSchema, body: createExpenseBodySchema },
      config: { idempotency: true }
    },
    async (request, reply) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const description = request.body.description.trim();
      if (description.length === 0) {
        throw new AppError(
          400,
          "INVALID_DESCRIPTION",
          "Description must not be empty"
        );
      }

      const participantIds = request.body.participants.map(
        (participant) => participant.userId
      );

      await assertUsersInGroup(
        pool,
        group.id,
        request.body.paidBy,
        participantIds
      );

      const shares = computeShares({
        splitType: request.body.splitType,
        amount: request.body.amount,
        participants: request.body.participants
      });

      const client = await pool.connect();
      let expenseId: string;
      try {
        await client.query("BEGIN");

        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO expenses (group_id, description, amount, split_type, paid_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            group.id,
            description,
            request.body.amount,
            request.body.splitType,
            request.body.paidBy
          ]
        );

        const inserted = rows[0];
        if (!inserted) {
          throw new Error("Expense insert did not return an id");
        }
        expenseId = inserted.id;

        await client.query(
          `INSERT INTO expense_participants (expense_id, user_id, share)
           SELECT $1, item.user_id, item.share
           FROM unnest($2::uuid[], $3::bigint[]) AS item(user_id, share)`,
          [expenseId, shares.map((item) => item.userId), shares.map((item) => item.share)]
        );

        const payerUpdate = await client.query(
          `INSERT INTO group_balances (group_id, user_id, paid)
           VALUES ($1, $2, $3)
           ON CONFLICT (group_id, user_id) DO UPDATE
           SET paid = group_balances.paid + EXCLUDED.paid`,
          [group.id, request.body.paidBy, request.body.amount]
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
          [group.id, shares.map((item) => item.userId), shares.map((item) => item.share)]
        );
        if (participantUpdate.rowCount !== shares.length) {
          throw new Error("Failed to update participant balances");
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      const expense = await findExpenseOr404(pool, group.id, expenseId);
      return reply.status(201).send(expense);
    }
  );

  app.get<{ Params: { id: string }; Querystring: { limit?: number; offset?: number } }>(
    "/api/groups/:id/expenses",
    { schema: { params: idParamSchema, querystring: listExpensesQuerySchema } },
    async (request) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const limit = request.query.limit ?? 50;
      const offset = request.query.offset ?? 0;

      const { rows } = await pool.query<ExpenseRow>(
        `${expenseDetailQuery(false)} LIMIT $2 OFFSET $3`,
        [group.id, limit, offset]
      );

      const { rows: countRows } = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM expenses WHERE group_id = $1`,
        [group.id]
      );

      return {
        expenses: rows,
        total: countRows[0]?.count ?? 0,
        limit,
        offset
      };
    }
  );

  app.get<{ Params: { id: string; expenseId: string } }>(
    "/api/groups/:id/expenses/:expenseId",
    { schema: { params: expenseDetailParamsSchema } },
    async (request) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);
      return findExpenseOr404(pool, group.id, request.params.expenseId);
    }
  );

  app.delete<{ Params: { id: string; expenseId: string } }>(
    "/api/groups/:id/expenses/:expenseId",
    { schema: { params: expenseDetailParamsSchema } },
    async (request, reply) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const { rows: shareRows } = await client.query<{
          user_id: string;
          share: number;
        }>(
          `SELECT user_id, share
           FROM expense_participants
           WHERE expense_id = $1`,
          [request.params.expenseId]
        );

        const deleted = await client.query<{ paid_by: string; amount: number }>(
          `DELETE FROM expenses
           WHERE id = $1 AND group_id = $2
           RETURNING paid_by, amount`,
          [request.params.expenseId, group.id]
        );

        const expense = deleted.rows[0];
        if (!expense) {
          throw new AppError(404, "EXPENSE_NOT_FOUND", "Expense not found");
        }

        const payerUpdate = await client.query(
          `UPDATE group_balances
           SET paid = paid - $3
           WHERE group_id = $1 AND user_id = $2`,
          [group.id, expense.paid_by, expense.amount]
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
            group.id,
            shareRows.map((row) => row.user_id),
            shareRows.map((row) => row.share)
          ]
        );
        if (participantUpdate.rowCount !== shareRows.length) {
          throw new Error("Failed to reverse participant balances");
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      return reply.status(204).send();
    }
  );
}
