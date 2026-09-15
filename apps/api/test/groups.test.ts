import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addMember,
  authHeaders,
  closeTestContext,
  createExpense,
  createGroup,
  createTestContext,
  registerUser,
  resetDatabase,
  setupGroupWithMembers,
  userAt,
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

describe("POST /api/groups", () => {
  it("creates a group and adds the creator as a member", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: authHeaders(alex),
      payload: { name: "Lisbon Trip" }
    });

    expect(response.statusCode).toBe(201);
    const group = response.json();
    expect(group).toMatchObject({ name: "Lisbon Trip", currency: "EUR" });

    const detail = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}`,
      headers: authHeaders(alex)
    });
    expect(
      detail.json().members.map((member: { name: string }) => member.name)
    ).toEqual(["Alex"]);
  });

  it("trims the group name", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: authHeaders(alex),
      payload: { name: "  Lisbon Trip  " }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().name).toBe("Lisbon Trip");
  });

  it("rejects a blank name with 400", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: authHeaders(alex),
      payload: { name: "   " }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_NAME");
  });

  it("rejects unknown fields with 400", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: authHeaders(alex),
      payload: { name: "Lisbon Trip", unexpected: true }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("defaults the currency to EUR", async () => {
    const alex = await registerUser(app, "Alex");
    const group = await createGroup(app, "Lisbon Trip", alex);
    expect(group.currency).toBe("EUR");
  });

  it("accepts and normalizes a currency", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: authHeaders(alex),
      payload: { name: "New York Trip", currency: "usd" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().currency).toBe("USD");
  });

  it("rejects an invalid currency", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: authHeaders(alex),
      payload: { name: "Lisbon Trip", currency: "EURO" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/groups", () => {
  it("lists only the groups the caller belongs to", async () => {
    const alex = await registerUser(app, "Alex");
    const bruno = await registerUser(app, "Bruno");
    const carla = await registerUser(app, "Carla");

    const lisbon = await createGroup(app, "Lisbon Trip", alex);
    await addMember(app, lisbon.id, bruno.id, alex);
    await createGroup(app, "Ski Weekend", carla);

    const response = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: authHeaders(alex)
    });

    expect(response.statusCode).toBe(200);
    const groups = response.json();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: "Lisbon Trip",
      member_count: 2
    });
  });
});

describe("GET /api/groups/:id", () => {
  it("returns the group with its members", async () => {
    const { group, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}`,
      headers: authHeaders(creator)
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.name).toBe("Lisbon Trip");
    expect(body.currency).toBe("EUR");
    expect(body.members).toHaveLength(2);
    expect(body.members[0].joined_at).toBeTypeOf("string");
  });

  it("returns 403 for a non-member", async () => {
    const { group } = await setupGroupWithMembers(app, ["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const response = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}`,
      headers: authHeaders(eve)
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("returns 401 without a token", async () => {
    const { group } = await setupGroupWithMembers(app, ["Alex", "Bruno"]);

    const response = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}`
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for an unknown group", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "GET",
      url: "/api/groups/00000000-0000-4000-8000-000000000000",
      headers: authHeaders(alex)
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("GROUP_NOT_FOUND");
  });

  it("returns 400 for a malformed group id", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "GET",
      url: "/api/groups/not-a-uuid",
      headers: authHeaders(alex)
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/groups/:id/members", () => {
  it("adds a member to the group", async () => {
    const { group, creator } = await setupGroupWithMembers(app, ["Alex"]);
    const bruno = await registerUser(app, "Bruno");

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/members`,
      headers: authHeaders(creator),
      payload: { userId: bruno.id }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: bruno.id,
      name: "Bruno",
      email: "bruno@example.com"
    });
    expect(response.json().joined_at).toBeTypeOf("string");
  });

  it("returns 403 when the caller is not a member", async () => {
    const { group } = await setupGroupWithMembers(app, ["Alex"]);
    const eve = await registerUser(app, "Eve");
    const frank = await registerUser(app, "Frank");

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/members`,
      headers: authHeaders(eve),
      payload: { userId: frank.id }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("returns 404 when the group does not exist", async () => {
    const alex = await registerUser(app, "Alex");
    const bruno = await registerUser(app, "Bruno");

    const response = await app.inject({
      method: "POST",
      url: "/api/groups/00000000-0000-4000-8000-000000000000/members",
      headers: authHeaders(alex),
      payload: { userId: bruno.id }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("GROUP_NOT_FOUND");
  });

  it("returns 404 when the user does not exist", async () => {
    const { group, creator } = await setupGroupWithMembers(app, ["Alex"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/members`,
      headers: authHeaders(creator),
      payload: { userId: "00000000-0000-4000-8000-000000000000" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("USER_NOT_FOUND");
  });

  it("returns 409 when the user is already a member", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);
    const bruno = users[1];
    if (!bruno) {
      throw new Error("Missing test user");
    }

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/members`,
      headers: authHeaders(creator),
      payload: { userId: bruno.id }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("ALREADY_MEMBER");
  });
});

describe("DELETE /api/groups/:id/members/:userId", () => {
  it("removes a member from the group", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);
    const bruno = users[1];
    if (!bruno) {
      throw new Error("Missing test user");
    }

    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/members/${bruno.id}`,
      headers: authHeaders(creator)
    });

    expect(response.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}`,
      headers: authHeaders(creator)
    });
    expect(after.json().members).toHaveLength(1);
  });

  it("returns 404 when the user is not a member", async () => {
    const { group, creator } = await setupGroupWithMembers(app, ["Alex"]);
    const eve = await registerUser(app, "Eve");

    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/members/${eve.id}`,
      headers: authHeaders(creator)
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_A_MEMBER");
  });

  it("returns 404 when the group does not exist", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "DELETE",
      url: "/api/groups/00000000-0000-4000-8000-000000000000/members/00000000-0000-4000-8000-000000000000",
      headers: authHeaders(alex)
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("GROUP_NOT_FOUND");
  });
});

describe("DELETE /api/groups/:id", () => {
  it("deletes the group and its related data", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);
    const alex = userAt(users, 0);

    await createExpense(
      app,
      group.id,
      {
        description: "Dinner",
        amount: 1000,
        paidBy: alex.id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      },
      creator
    );

    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}`,
      headers: authHeaders(creator)
    });
    expect(response.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}`,
      headers: authHeaders(creator)
    });
    expect(after.statusCode).toBe(404);

    const list = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: authHeaders(creator)
    });
    expect(list.json()).toEqual([]);

    const { rows } = await context.pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM expenses WHERE group_id = $1`,
      [group.id]
    );
    expect(rows[0]?.count).toBe(0);
  });

  it("returns 403 for a non-member", async () => {
    const { group } = await setupGroupWithMembers(app, ["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}`,
      headers: authHeaders(eve)
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("returns 404 for an unknown group", async () => {
    const alex = await registerUser(app, "Alex");

    const response = await app.inject({
      method: "DELETE",
      url: "/api/groups/00000000-0000-4000-8000-000000000000",
      headers: authHeaders(alex)
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("GROUP_NOT_FOUND");
  });
});
