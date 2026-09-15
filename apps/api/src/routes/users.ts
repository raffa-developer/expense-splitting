import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { AppError } from "../errors.js";
import { idParamSchema } from "../schemas.js";

interface UserRow {
  id: string;
  name: string;
  email: string;
  created_at: Date;
}

const searchUsersQuerySchema = {
  type: "object",
  required: ["email"],
  additionalProperties: false,
  properties: {
    email: { type: "string", minLength: 3, maxLength: 320 }
  }
} as const;

function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

export function registerUserRoutes(app: FastifyInstance, pool: Pool): void {
  app.get<{ Querystring: { email: string } }>(
    "/api/users",
    { schema: { querystring: searchUsersQuerySchema } },
    async (request) => {
      const term = `%${escapeLikeTerm(request.query.email.trim().toLowerCase())}%`;

      const { rows } = await pool.query<UserRow>(
        `SELECT id, name, email, created_at
         FROM users
         WHERE email ILIKE $1
         ORDER BY created_at, id
         LIMIT 10`,
        [term]
      );
      return rows;
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/users/:id",
    { schema: { params: idParamSchema } },
    async (request) => {
      const { rows } = await pool.query<UserRow>(
        `SELECT id, name, email, created_at
         FROM users
         WHERE id = $1`,
        [request.params.id]
      );

      const user = rows[0];
      if (!user) {
        throw new AppError(404, "USER_NOT_FOUND", "User not found");
      }
      return user;
    }
  );
}
