import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  authHeaders,
  closeTestContext,
  createTestContext,
  registerUser,
  resetDatabase,
  TEST_PASSWORD,
  type TestContext
} from "./helpers.js";

let context: TestContext;
let app: FastifyInstance;

beforeAll(async () => {
  context = await createTestContext();
  app = context.app;
});

afterAll(async () => {
  await closeTestContext(context);
});

beforeEach(async () => {
  await resetDatabase(context.pool);
});

describe("POST /api/auth/register", () => {
  it("registers a user and returns a token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "  Alex  ", email: "Alex@Example.COM", password: TEST_PASSWORD }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user).toMatchObject({ name: "Alex", email: "alex@example.com" });
    expect(body.user.id).toBeTypeOf("string");
    expect(body.user.created_at).toBeTypeOf("string");
    expect(body.user.password_hash).toBeUndefined();
    expect(body.token).toBeTypeOf("string");
  });

  it("rejects a duplicate email with 409", async () => {
    await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "Alex Again", email: "ALEX@example.com", password: TEST_PASSWORD }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects an invalid email with 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "Alex", email: "not-an-email", password: TEST_PASSWORD }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a short password with 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "Alex", email: "alex@example.com", password: "short" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a blank name with 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "   ", email: "alex@example.com", password: TEST_PASSWORD }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_NAME");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials", async () => {
    await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alex@example.com", password: TEST_PASSWORD }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.name).toBe("Alex");
    expect(body.token).toBeTypeOf("string");
  });

  it("accepts emails case-insensitively", async () => {
    await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ALEX@EXAMPLE.COM", password: TEST_PASSWORD }
    });

    expect(response.statusCode).toBe(200);
  });

  it("rejects a wrong password with 401", async () => {
    await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alex@example.com", password: "wrong-password" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password: TEST_PASSWORD }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/auth/me", () => {
  it("returns the authenticated user", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeaders(alex)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({
      id: alex.id,
      name: "Alex",
      email: "alex@example.com"
    });
  });

  it("rejects a missing token with 401", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid token with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer not-a-token" }
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("protected routes", () => {
  it("rejects unauthenticated requests", async () => {
    const response = await app.inject({ method: "GET", url: "/api/groups" });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("requires authentication to search users", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/users?email=alex"
    });

    expect(response.statusCode).toBe(401);
  });

  it("searches users by email", async () => {
    const alex = await registerUser(app, "Alex");
    await registerUser(app, "Bruno");

    const response = await app.inject({
      method: "GET",
      url: "/api/users?email=alex",
      headers: authHeaders(alex)
    });

    expect(response.statusCode).toBe(200);
    const results = response.json();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: "Alex",
      email: "alex@example.com"
    });
  });

  it("requires the email query parameter", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: authHeaders(alex)
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });
});
