import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  authHeaders,
  closeTestContext,
  createTestContext,
  registerUser,
  resetDatabase,
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

describe("error handling", () => {
  it("returns 400 for malformed JSON instead of 500", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{ not valid json"
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBeTypeOf("string");
    expect(body.error.request_id).toBeTypeOf("string");
  });

  it("returns 415 for an unsupported content type", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/xml" },
      payload: "<user />"
    });

    expect(response.statusCode).toBe(415);
    expect(response.json().error.request_id).toBeTypeOf("string");
  });

  it("returns 404 with a request id for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/api/nope" });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(body.error.request_id).toBeTypeOf("string");
  });

  it("returns 401 with a request id for unauthenticated requests", async () => {
    const response = await app.inject({ method: "GET", url: "/api/groups" });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.request_id).toBeTypeOf("string");
  });

  it("includes the request id in domain errors", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "GET",
      url: "/api/groups/00000000-0000-4000-8000-000000000000",
      headers: authHeaders(alex)
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe("GROUP_NOT_FOUND");
    expect(body.error.request_id).toBeTypeOf("string");
  });

  it("honors and echoes the x-request-id header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { "x-request-id": "trace-123" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["x-request-id"]).toBe("trace-123");
    expect(response.json().error.request_id).toBe("trace-123");
  });
});
