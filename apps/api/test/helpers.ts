import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5433/expense_splitter_test";

export interface TestContext {
  pool: Pool;
  app: FastifyInstance;
}

export async function createTestContext(): Promise<TestContext> {
  const pool = createPool(TEST_DATABASE_URL);
  await migrate(pool);
  const app = await buildApp(pool, { rateLimit: false });
  await app.ready();
  return { pool, app };
}

export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query(
    "TRUNCATE TABLE idempotency_keys, group_members, groups, users CASCADE"
  );
}

export async function closeTestContext(context: TestContext): Promise<void> {
  await context.app.close();
  await context.pool.end();
}

export const TEST_PASSWORD = "password123";

export interface TestUser {
  id: string;
  name: string;
  email: string;
  token: string;
}

export function userAt(users: TestUser[], index: number): TestUser {
  const user = users[index];
  if (!user) {
    throw new Error(`No user at index ${index}`);
  }
  return user;
}

export function authHeaders(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.token}` };
}

export async function registerUser(
  app: FastifyInstance,
  name: string,
  email = `${name.toLowerCase()}@example.com`
): Promise<TestUser> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { name, email, password: TEST_PASSWORD }
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to register user: ${response.body}`);
  }

  const body = response.json();
  return {
    id: body.user.id,
    name: body.user.name,
    email: body.user.email,
    token: body.token
  };
}

export async function createGroup(
  app: FastifyInstance,
  name: string,
  actor: TestUser
): Promise<{ id: string; name: string; currency: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers: authHeaders(actor),
    payload: { name }
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to create group: ${response.body}`);
  }
  return response.json();
}

export async function addMember(
  app: FastifyInstance,
  groupId: string,
  userId: string,
  actor: TestUser
): Promise<void> {
  const response = await app.inject({
    method: "POST",
    url: `/api/groups/${groupId}/members`,
    headers: authHeaders(actor),
    payload: { userId }
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to add member: ${response.body}`);
  }
}

export interface CreateExpensePayload {
  description: string;
  amount: number;
  paidBy: string;
  splitType: "equal" | "exact" | "percentage" | "shares";
  participants: {
    userId: string;
    share?: number;
    percentage?: number;
    weight?: number;
  }[];
}

export async function createExpense(
  app: FastifyInstance,
  groupId: string,
  payload: CreateExpensePayload,
  actor: TestUser
): Promise<{
  id: string;
  amount: number;
  split_type: string;
  participants: { user_id: string; name: string; share: number }[];
}> {
  const response = await app.inject({
    method: "POST",
    url: `/api/groups/${groupId}/expenses`,
    headers: authHeaders(actor),
    payload
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to create expense: ${response.body}`);
  }
  return response.json();
}

export async function setupGroupWithMembers(
  app: FastifyInstance,
  names: string[]
): Promise<{
  group: { id: string; name: string; currency: string };
  users: TestUser[];
  creator: TestUser;
}> {
  const users: TestUser[] = [];
  for (const name of names) {
    users.push(await registerUser(app, name));
  }

  const creator = userAt(users, 0);
  const group = await createGroup(app, "Lisbon Trip", creator);

  for (let index = 1; index < users.length; index++) {
    await addMember(app, group.id, userAt(users, index).id, creator);
  }

  return { group, users, creator };
}
