import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { computeShares, type SplitType } from "../domain/splits.js";
import { AppError } from "../errors.js";
import { getCurrentUser } from "../plugins/auth.js";
import { idParamSchema, uuidPattern } from "../schemas.js";
import {
  assertPayerAndParticipants,
  fetchGroupUserState,
  findExpenseOr404,
  findExpensesByIds,
  insertExpense,
  listExpensesPage,
  type ExpenseWrite
} from "../services/expenses.js";
import { assertGroupMember, findGroupOr404 } from "../services/groups.js";

interface ExpenseItemBody {
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

const expenseItemBodySchema = {
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

const createExpensesBatchBodySchema = {
  type: "object",
  required: ["expenses"],
  additionalProperties: false,
  properties: {
    expenses: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: expenseItemBodySchema
    }
  }
} as const;

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

function withPrefix<T>(prefix: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError(
        error.statusCode,
        error.code,
        `${prefix}: ${error.message}`
      );
    }
    throw error;
  }
}

function participantIdsOf(item: ExpenseItemBody): string[] {
  return item.participants.map((participant) => participant.userId);
}

function toExpenseWrite(item: ExpenseItemBody): ExpenseWrite {
  const description = item.description.trim();
  if (description.length === 0) {
    throw new AppError(
      400,
      "INVALID_DESCRIPTION",
      "Description must not be empty"
    );
  }

  return {
    description,
    amount: item.amount,
    paidBy: item.paidBy,
    splitType: item.splitType,
    shares: computeShares({
      splitType: item.splitType,
      amount: item.amount,
      participants: item.participants
    })
  };
}

export function registerExpenseRoutes(app: FastifyInstance, pool: Pool): void {
  app.post<{ Params: { id: string }; Body: ExpenseItemBody }>(
    "/api/groups/:id/expenses",
    {
      schema: { params: idParamSchema, body: expenseItemBodySchema },
      config: { idempotency: true }
    },
    async (request, reply) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const participantIds = participantIdsOf(request.body);
      const state = await fetchGroupUserState(pool, group.id, [
        ...new Set([request.body.paidBy, ...participantIds])
      ]);
      assertPayerAndParticipants(state, request.body.paidBy, participantIds);

      const write = toExpenseWrite(request.body);

      const client = await pool.connect();
      let expenseId: string;
      try {
        await client.query("BEGIN");
        expenseId = await insertExpense(client, group.id, write);
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

  app.post<{ Params: { id: string }; Body: { expenses: ExpenseItemBody[] } }>(
    "/api/groups/:id/expenses/batch",
    {
      schema: { params: idParamSchema, body: createExpensesBatchBodySchema },
      config: { idempotency: true }
    },
    async (request, reply) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const items = request.body.expenses;
      const referencedIds = [
        ...new Set(
          items.flatMap((item) => [item.paidBy, ...participantIdsOf(item)])
        )
      ];
      const state = await fetchGroupUserState(pool, group.id, referencedIds);

      const writes = items.map((item, index) => {
        assertPayerAndParticipants(
          state,
          item.paidBy,
          participantIdsOf(item),
          `expenses[${index}]: `
        );
        return withPrefix(`expenses[${index}]`, () => toExpenseWrite(item));
      });

      const client = await pool.connect();
      const expenseIds: string[] = [];
      try {
        await client.query("BEGIN");
        for (const write of writes) {
          expenseIds.push(await insertExpense(client, group.id, write));
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      const expenses = await findExpensesByIds(pool, group.id, expenseIds);
      return reply.status(201).send({ expenses });
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
      const { expenses, total } = await listExpensesPage(
        pool,
        group.id,
        limit,
        offset
      );

      return { expenses, total, limit, offset };
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
