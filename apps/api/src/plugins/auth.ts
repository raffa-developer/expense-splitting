import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AppError } from "../errors.js";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  created_at: Date;
}

const currentUsers = new WeakMap<FastifyRequest, AuthenticatedUser>();

export function getCurrentUser(request: FastifyRequest): AuthenticatedUser {
  const user = currentUsers.get(request);
  if (!user) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  return user;
}

const publicRoutes = new Set([
  "POST /api/auth/register",
  "POST /api/auth/login"
]);

const publicPrefixes = ["/health", "/docs", "/documentation"];

export function registerAuth(app: FastifyInstance, pool: Pool): void {
  app.addHook("preHandler", async (request) => {
    const routeUrl = request.routeOptions.url;
    if (!routeUrl) {
      return;
    }
    if (publicRoutes.has(`${request.method} ${routeUrl}`)) {
      return;
    }
    if (publicPrefixes.some((prefix) => request.url.startsWith(prefix))) {
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const { rows } = await pool.query<AuthenticatedUser>(
      `SELECT id, name, email, created_at FROM users WHERE id = $1`,
      [request.user.sub]
    );

    const user = rows[0];
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    currentUsers.set(request, user);
  });
}
