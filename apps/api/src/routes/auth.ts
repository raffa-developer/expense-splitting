import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { getCurrentUser } from "../plugins/auth.js";
import { AppError, isPgError } from "../errors.js";

interface UserRow {
  id: string;
  name: string;
  email: string;
  created_at: Date;
}

const registerBodySchema = {
  type: "object",
  required: ["name", "email", "password"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    email: { type: "string", format: "email", maxLength: 320 },
    password: { type: "string", minLength: 8, maxLength: 128 }
  }
} as const;

const loginBodySchema = {
  type: "object",
  required: ["email", "password"],
  additionalProperties: false,
  properties: {
    email: { type: "string", format: "email", maxLength: 320 },
    password: { type: "string", minLength: 1, maxLength: 128 }
  }
} as const;

const dummyHash = hashPassword("dummy-password-for-timing");

export function registerAuthRoutes(app: FastifyInstance, pool: Pool): void {
  app.post<{ Body: { name: string; email: string; password: string } }>(
    "/api/auth/register",
    {
      schema: { body: registerBodySchema },
      config: {
        idempotency: true,
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const name = request.body.name.trim();
      if (name.length === 0) {
        throw new AppError(400, "INVALID_NAME", "Name must not be empty");
      }

      const email = request.body.email.trim().toLowerCase();
      const passwordHash = await hashPassword(request.body.password);

      try {
        const { rows } = await pool.query<UserRow>(
          `INSERT INTO users (name, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, name, email, created_at`,
          [name, email, passwordHash]
        );

        const user = rows[0];
        if (!user) {
          throw new Error("User insert did not return a row");
        }

        const token = app.jwt.sign({ sub: user.id });
        return reply.status(201).send({ user, token });
      } catch (error) {
        if (isPgError(error, "23505")) {
          throw new AppError(
            409,
            "EMAIL_TAKEN",
            "A user with this email already exists"
          );
        }
        throw error;
      }
    }
  );

  app.post<{ Body: { email: string; password: string } }>(
    "/api/auth/login",
    {
      schema: { body: loginBodySchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request) => {
      const email = request.body.email.trim().toLowerCase();

      const { rows } = await pool.query<UserRow & { password_hash: string | null }>(
        `SELECT id, name, email, created_at, password_hash
         FROM users
         WHERE email = $1`,
        [email]
      );

      const user = rows[0];
      const storedHash = user?.password_hash ?? (await dummyHash);
      const valid = await verifyPassword(request.body.password, storedHash);

      if (!user || !valid) {
        throw new AppError(
          401,
          "INVALID_CREDENTIALS",
          "Invalid email or password"
        );
      }

      const token = app.jwt.sign({ sub: user.id });
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          created_at: user.created_at
        },
        token
      };
    }
  );

  app.get("/api/auth/me", async (request) => {
    return { user: getCurrentUser(request) };
  });
}
