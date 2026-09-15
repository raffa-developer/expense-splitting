import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addMember,
  authHeaders,
  closeTestContext,
  createGroup,
  createTestContext,
  registerUser,
  resetDatabase,
  TEST_PASSWORD,
  type TestContext,
  type TestUser
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

interface Setup {
  groupId: string;
  users: TestUser[];
  creator: TestUser;
  payload: Record<string, unknown>;
}

async function setup(): Promise<Setup> {
  const alex = await registerUser(app, "Alex");
  const bruno = await registerUser(app, "Bruno");
  const group = await createGroup(app, "Lisbon Trip", alex);
  await addMember(app, group.id, bruno.id, alex);

  return {
    groupId: group.id,
    users: [alex, bruno],
    creator: alex,
    payload: {
      description: "Dinner",
      amount: 1000,
      paidBy: alex.id,
      splitType: "equal",
      participants: [{ userId: alex.id }, { userId: bruno.id }]
    }
  };
}

async function postExpense(
  groupId: string,
  payload: Record<string, unknown>,
  actor: TestUser,
  key?: string
): Promise<{ statusCode: number; headers: Record<string, unknown>; body: unknown }> {
  const response = await app.inject({
    method: "POST",
    url: `/api/groups/${groupId}/expenses`,
    headers:
      key === undefined
        ? authHeaders(actor)
        : { ...authHeaders(actor), "idempotency-key": key },
    payload
  });
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.json()
  };
}

async function listExpenses(
  groupId: string,
  actor: TestUser
): Promise<unknown[]> {
  const response = await app.inject({
    method: "GET",
    url: `/api/groups/${groupId}/expenses`,
    headers: authHeaders(actor)
  });
  return response.json().expenses;
}

describe("idempotency keys", () => {
  it("replays the original response instead of creating the expense twice", async () => {
    const { groupId, creator, payload } = await setup();

    const first = await postExpense(groupId, payload, creator, "dinner-key-1");
    expect(first.statusCode).toBe(201);

    const second = await postExpense(groupId, payload, creator, "dinner-key-1");
    expect(second.statusCode).toBe(201);
    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(second.body).toEqual(first.body);

    expect(await listExpenses(groupId, creator)).toHaveLength(1);
  });

  it("rejects the same key used for a different request", async () => {
    const { groupId, creator, payload } = await setup();

    await postExpense(groupId, payload, creator, "shared-key");
    const response = await postExpense(
      groupId,
      { ...payload, amount: 2000 },
      creator,
      "shared-key"
    );

    expect(response.statusCode).toBe(422);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      "IDEMPOTENCY_KEY_REUSED"
    );
    expect(await listExpenses(groupId, creator)).toHaveLength(1);
  });

  it("does not deduplicate requests without a key", async () => {
    const { groupId, creator, payload } = await setup();

    await postExpense(groupId, payload, creator);
    await postExpense(groupId, payload, creator);

    expect(await listExpenses(groupId, creator)).toHaveLength(2);
  });

  it("treats different keys as different requests", async () => {
    const { groupId, creator, payload } = await setup();

    await postExpense(groupId, payload, creator, "first-key");
    await postExpense(groupId, payload, creator, "second-key");

    expect(await listExpenses(groupId, creator)).toHaveLength(2);
  });

  it("does not consume the key when the request fails", async () => {
    const { groupId, creator, users } = await setup();
    const alex = users[0];
    if (!alex) {
      throw new Error("Missing test user");
    }

    const invalidPayload = {
      description: "Hotel",
      amount: 1000,
      paidBy: alex.id,
      splitType: "exact",
      participants: [{ userId: alex.id, share: 900 }]
    };

    const failed = await postExpense(groupId, invalidPayload, creator, "retry-key");
    expect(failed.statusCode).toBe(400);

    const validPayload = {
      ...invalidPayload,
      participants: [{ userId: alex.id, share: 1000 }]
    };
    const retried = await postExpense(groupId, validPayload, creator, "retry-key");
    expect(retried.statusCode).toBe(201);

    const replayed = await postExpense(groupId, validPayload, creator, "retry-key");
    expect(replayed.headers["idempotency-replayed"]).toBe("true");
    expect(replayed.body).toEqual(retried.body);
    expect(await listExpenses(groupId, creator)).toHaveLength(1);
  });

  it("rejects a blank key", async () => {
    const { groupId, creator, payload } = await setup();

    const response = await postExpense(groupId, payload, creator, "   ");

    expect(response.statusCode).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      "INVALID_IDEMPOTENCY_KEY"
    );
  });

  it("applies to recorded settlements", async () => {
    const { groupId, creator, users, payload } = await setup();
    const alex = users[0];
    const bruno = users[1];
    if (!alex || !bruno) {
      throw new Error("Missing test users");
    }

    await postExpense(groupId, payload, creator, "expense-key");

    const settlementPayload = {
      fromUserId: bruno.id,
      toUserId: alex.id,
      amount: 500
    };

    const record = async (): Promise<number> => {
      const response = await app.inject({
        method: "POST",
        url: `/api/groups/${groupId}/settlements`,
        headers: {
          ...authHeaders(creator),
          "idempotency-key": "settlement-key"
        },
        payload: settlementPayload
      });
      return response.statusCode;
    };

    expect(await record()).toBe(201);
    expect(await record()).toBe(201);

    const history = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/settlements`,
      headers: authHeaders(creator)
    });
    expect(history.json()).toHaveLength(1);
  });

  it("applies to registration", async () => {
    const payload = {
      name: "Alex",
      email: "alex@example.com",
      password: TEST_PASSWORD
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "idempotency-key": "register-key" },
      payload
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "idempotency-key": "register-key" },
      payload
    });
    expect(second.statusCode).toBe(201);
    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(second.json()).toEqual(first.json());

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alex@example.com", password: TEST_PASSWORD }
    });
    expect(login.statusCode).toBe(200);
  });

  it("applies to group creation", async () => {
    const alex = await registerUser(app, "Alex");
    const payload = { name: "Lisbon Trip" };

    const first = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: { ...authHeaders(alex), "idempotency-key": "group-key" },
      payload
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: { ...authHeaders(alex), "idempotency-key": "group-key" },
      payload
    });
    expect(second.statusCode).toBe(201);
    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(second.json()).toEqual(first.json());

    const list = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: authHeaders(alex)
    });
    expect(list.json()).toHaveLength(1);
  });

  it("applies to adding members", async () => {
    const { groupId, creator } = await setup();
    const carla = await registerUser(app, "Carla");
    const payload = { userId: carla.id };

    const first = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/members`,
      headers: { ...authHeaders(creator), "idempotency-key": "member-key" },
      payload
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/members`,
      headers: { ...authHeaders(creator), "idempotency-key": "member-key" },
      payload
    });
    expect(second.statusCode).toBe(201);
    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(second.json()).toEqual(first.json());

    const detail = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}`,
      headers: authHeaders(creator)
    });
    expect(detail.json().members).toHaveLength(3);
  });
});
