import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { AppError, isPgError } from "../errors.js";
import { getCurrentUser } from "../plugins/auth.js";
import { groupMemberParamsSchema, idParamSchema, uuidPattern } from "../schemas.js";
import { assertGroupMember, findGroupOr404, type GroupRow } from "../services/groups.js";

interface GroupSummaryRow extends GroupRow {
  member_count: number;
  your_net: number;
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  joined_at: Date;
}

const createGroupBodySchema = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    currency: { type: "string", minLength: 3, maxLength: 3, pattern: "^[a-zA-Z]{3}$" }
  }
} as const;

const addMemberBodySchema = {
  type: "object",
  required: ["userId"],
  additionalProperties: false,
  properties: {
    userId: { type: "string", pattern: uuidPattern }
  }
} as const;

export function registerGroupRoutes(app: FastifyInstance, pool: Pool): void {
  app.post<{ Body: { name: string; currency?: string } }>(
    "/api/groups",
    {
      schema: { body: createGroupBodySchema },
      config: { idempotency: true }
    },
    async (request, reply) => {
      const actor = getCurrentUser(request);

      const name = request.body.name.trim();
      if (name.length === 0) {
        throw new AppError(400, "INVALID_NAME", "Group name must not be empty");
      }

      const currency = (request.body.currency ?? "EUR").toUpperCase();

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const { rows } = await client.query<GroupRow>(
          `INSERT INTO groups (name, currency)
           VALUES ($1, $2)
           RETURNING id, name, currency, created_at`,
          [name, currency]
        );

        const group = rows[0];
        if (!group) {
          throw new Error("Group insert did not return a row");
        }

        await client.query(
          `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`,
          [group.id, actor.id]
        );

        await client.query(
          `INSERT INTO group_balances (group_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (group_id, user_id) DO NOTHING`,
          [group.id, actor.id]
        );

        await client.query("COMMIT");
        return reply.status(201).send(group);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  );

  app.get("/api/groups", async (request) => {
    const actor = getCurrentUser(request);

    const { rows } = await pool.query<GroupSummaryRow>(
      `SELECT g.id, g.name, g.currency, g.created_at,
              COUNT(all_members.user_id)::int AS member_count,
              (COALESCE(gb.paid, 0) - COALESCE(gb.owed, 0)
                 + COALESCE(gb.settled, 0))::bigint AS your_net
       FROM groups g
       JOIN group_members mine ON mine.group_id = g.id AND mine.user_id = $1
       LEFT JOIN group_members all_members ON all_members.group_id = g.id
       LEFT JOIN group_balances gb
         ON gb.group_id = g.id AND gb.user_id = $1
       GROUP BY g.id, gb.paid, gb.owed, gb.settled
       ORDER BY g.created_at DESC, g.id`,
      [actor.id]
    );
    return rows;
  });

  app.get<{ Params: { id: string } }>(
    "/api/groups/:id",
    { schema: { params: idParamSchema } },
    async (request) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const { rows: members } = await pool.query<MemberRow>(
        `SELECT u.id, u.name, u.email, gm.joined_at
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = $1
         ORDER BY gm.joined_at, u.id`,
        [group.id]
      );

      return { ...group, members };
    }
  );

  app.post<{ Params: { id: string }; Body: { userId: string } }>(
    "/api/groups/:id/members",
    {
      schema: { params: idParamSchema, body: addMemberBodySchema },
      config: { idempotency: true }
    },
    async (request, reply) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const { rows: users } = await pool.query<Omit<MemberRow, "joined_at">>(
        `SELECT id, name, email FROM users WHERE id = $1`,
        [request.body.userId]
      );

      const user = users[0];
      if (!user) {
        throw new AppError(404, "USER_NOT_FOUND", "User not found");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const { rows } = await client.query<{ joined_at: Date }>(
          `INSERT INTO group_members (group_id, user_id)
           VALUES ($1, $2)
           RETURNING joined_at`,
          [group.id, user.id]
        );

        await client.query(
          `INSERT INTO group_balances (group_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (group_id, user_id) DO NOTHING`,
          [group.id, user.id]
        );

        await client.query("COMMIT");
        return reply
          .status(201)
          .send({ ...user, joined_at: rows[0]?.joined_at });
      } catch (error) {
        await client.query("ROLLBACK");
        if (isPgError(error, "23505")) {
          throw new AppError(
            409,
            "ALREADY_MEMBER",
            "User is already a member of this group"
          );
        }
        throw error;
      } finally {
        client.release();
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/groups/:id",
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      await pool.query(`DELETE FROM groups WHERE id = $1`, [group.id]);
      return reply.status(204).send();
    }
  );

  app.delete<{ Params: { id: string; userId: string } }>(
    "/api/groups/:id/members/:userId",
    { schema: { params: groupMemberParamsSchema } },
    async (request, reply) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const result = await client.query(
          `DELETE FROM group_members
           WHERE group_id = $1 AND user_id = $2`,
          [group.id, request.params.userId]
        );

        if (result.rowCount === 0) {
          throw new AppError(
            404,
            "NOT_A_MEMBER",
            "User is not a member of this group"
          );
        }

        await client.query(
          `DELETE FROM group_balances
           WHERE group_id = $1 AND user_id = $2
             AND paid = 0 AND owed = 0 AND settled = 0`,
          [group.id, request.params.userId]
        );

        await client.query("COMMIT");
        return reply.status(204).send();
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  );
}
