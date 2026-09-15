import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { computeSettlements } from "../domain/settlement.js";
import { AppError } from "../errors.js";
import { getCurrentUser } from "../plugins/auth.js";
import { idParamSchema, uuidPattern } from "../schemas.js";
import { getGroupBalances } from "../services/balances.js";
import { assertGroupMember, findGroupOr404 } from "../services/groups.js";

interface SettlementRow {
  id: string;
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  amount: number;
  created_at: Date;
}

interface CreateSettlementBody {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

const createSettlementBodySchema = {
  type: "object",
  required: ["fromUserId", "toUserId", "amount"],
  additionalProperties: false,
  properties: {
    fromUserId: { type: "string", pattern: uuidPattern },
    toUserId: { type: "string", pattern: uuidPattern },
    amount: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }
  }
} as const;

const settlementRecordParamsSchema = {
  type: "object",
  required: ["id", "settlementId"],
  properties: {
    id: { type: "string", pattern: uuidPattern },
    settlementId: { type: "string", pattern: uuidPattern }
  }
} as const;

export function registerSettlementRoutes(app: FastifyInstance, pool: Pool): void {
  app.get<{ Params: { id: string } }>(
    "/api/groups/:id/settlement",
    { schema: { params: idParamSchema } },
    async (request) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);
      const { balances } = await getGroupBalances(pool, group.id);

      const transactions = computeSettlements(
        balances.map((balance) => ({
          userId: balance.user_id,
          name: balance.name,
          balance: balance.balance
        }))
      );

      return {
        currency: group.currency,
        transactions: transactions.map((transaction) => ({
          from_user_id: transaction.fromUserId,
          from_name: transaction.fromName,
          to_user_id: transaction.toUserId,
          to_name: transaction.toName,
          amount: transaction.amount
        }))
      };
    }
  );

  app.post<{ Params: { id: string }; Body: CreateSettlementBody }>(
    "/api/groups/:id/settlements",
    {
      schema: { params: idParamSchema, body: createSettlementBodySchema },
      config: { idempotency: true }
    },
    async (request, reply) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);
      const { fromUserId, toUserId, amount } = request.body;

      if (fromUserId === toUserId) {
        throw new AppError(
          400,
          "INVALID_SETTLEMENT",
          "The sender and the receiver must be different people"
        );
      }

      const { rows: users } = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE id = ANY($1::uuid[])`,
        [[fromUserId, toUserId]]
      );
      const existingUsers = new Set(users.map((user) => user.id));
      if (!existingUsers.has(fromUserId)) {
        throw new AppError(404, "USER_NOT_FOUND", "Sender not found");
      }
      if (!existingUsers.has(toUserId)) {
        throw new AppError(404, "USER_NOT_FOUND", "Receiver not found");
      }

      const { balances } = await getGroupBalances(pool, group.id);
      const inGroup = new Set(balances.map((balance) => balance.user_id));
      if (!inGroup.has(fromUserId)) {
        throw new AppError(
          400,
          "USER_NOT_IN_GROUP",
          "The sender is not part of this group"
        );
      }
      if (!inGroup.has(toUserId)) {
        throw new AppError(
          400,
          "USER_NOT_IN_GROUP",
          "The receiver is not part of this group"
        );
      }

      const client = await pool.connect();
      let inserted: { id: string; created_at: Date };
      try {
        await client.query("BEGIN");

        const { rows } = await client.query<{ id: string; created_at: Date }>(
          `INSERT INTO settlements (group_id, from_user, to_user, amount)
           VALUES ($1, $2, $3, $4)
           RETURNING id, created_at`,
          [group.id, fromUserId, toUserId, amount]
        );

        const row = rows[0];
        if (!row) {
          throw new Error("Settlement insert did not return an id");
        }
        inserted = row;

        const sender = await client.query(
          `INSERT INTO group_balances (group_id, user_id, settled)
           VALUES ($1, $2, $3)
           ON CONFLICT (group_id, user_id) DO UPDATE
           SET settled = group_balances.settled + EXCLUDED.settled`,
          [group.id, fromUserId, amount]
        );
        if (sender.rowCount !== 1) {
          throw new Error("Failed to update sender balance");
        }

        const receiver = await client.query(
          `INSERT INTO group_balances (group_id, user_id, settled)
           VALUES ($1, $2, $3)
           ON CONFLICT (group_id, user_id) DO UPDATE
           SET settled = group_balances.settled + EXCLUDED.settled`,
          [group.id, toUserId, -amount]
        );
        if (receiver.rowCount !== 1) {
          throw new Error("Failed to update receiver balance");
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      const from = balances.find((balance) => balance.user_id === fromUserId);
      const to = balances.find((balance) => balance.user_id === toUserId);
      if (!from || !to) {
        throw new Error("Settlement participants are missing from balances");
      }

      return reply.status(201).send({
        id: inserted.id,
        from_user_id: fromUserId,
        from_name: from.name,
        to_user_id: toUserId,
        to_name: to.name,
        amount,
        created_at: inserted.created_at
      });
    }
  );

  app.delete<{ Params: { id: string; settlementId: string } }>(
    "/api/groups/:id/settlements/:settlementId",
    { schema: { params: settlementRecordParamsSchema } },
    async (request, reply) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const { rows } = await client.query<{
          from_user: string;
          to_user: string;
          amount: number;
        }>(
          `DELETE FROM settlements
           WHERE id = $1 AND group_id = $2
           RETURNING from_user, to_user, amount`,
          [request.params.settlementId, group.id]
        );

        const settlement = rows[0];
        if (!settlement) {
          throw new AppError(
            404,
            "SETTLEMENT_NOT_FOUND",
            "Settlement not found"
          );
        }

        const sender = await client.query(
          `UPDATE group_balances
           SET settled = settled - $3
           WHERE group_id = $1 AND user_id = $2`,
          [group.id, settlement.from_user, settlement.amount]
        );
        if (sender.rowCount !== 1) {
          throw new Error("Failed to reverse sender balance");
        }

        const receiver = await client.query(
          `UPDATE group_balances
           SET settled = settled + $3
           WHERE group_id = $1 AND user_id = $2`,
          [group.id, settlement.to_user, settlement.amount]
        );
        if (receiver.rowCount !== 1) {
          throw new Error("Failed to reverse receiver balance");
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

  app.get<{ Params: { id: string } }>(
    "/api/groups/:id/settlements",
    { schema: { params: idParamSchema } },
    async (request) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const { rows } = await pool.query<SettlementRow>(
        `SELECT s.id,
                s.from_user AS from_user_id,
                fu.name AS from_name,
                s.to_user AS to_user_id,
                tu.name AS to_name,
                s.amount,
                s.created_at
         FROM settlements s
         JOIN users fu ON fu.id = s.from_user
         JOIN users tu ON tu.id = s.to_user
         WHERE s.group_id = $1
         ORDER BY s.created_at DESC, s.id DESC`,
        [group.id]
      );

      return rows;
    }
  );
}
