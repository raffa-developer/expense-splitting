import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  authHeaders,
  closeTestContext,
  createExpense,
  createTestContext,
  registerUser,
  resetDatabase,
  setupGroupWithMembers,
  userAt,
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

async function addEqualExpense(
  groupId: string,
  paidBy: string,
  amount: number,
  participantIds: string[],
  actor: TestUser
): Promise<void> {
  await createExpense(
    app,
    groupId,
    {
      description: "Expense",
      amount,
      paidBy,
      splitType: "equal",
      participants: participantIds.map((userId) => ({ userId }))
    },
    actor
  );
}

async function recordSettlement(
  groupId: string,
  payload: { fromUserId: string; toUserId: string; amount: number },
  actor: TestUser
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: "POST",
    url: `/api/groups/${groupId}/settlements`,
    headers: authHeaders(actor),
    payload
  });
  return { statusCode: response.statusCode, body: response.json() };
}

async function getBalances(
  groupId: string,
  actor: TestUser
): Promise<{
  total: number;
  balances: {
    user_id: string;
    name: string;
    paid: number;
    owed: number;
    settled: number;
    balance: number;
  }[];
}> {
  const response = await app.inject({
    method: "GET",
    url: `/api/groups/${groupId}/balances`,
    headers: authHeaders(actor)
  });
  return response.json();
}

function balanceFor(
  balances: Awaited<ReturnType<typeof getBalances>>,
  name: string
): { paid: number; owed: number; settled: number; balance: number } {
  const item = balances.balances.find((balance) => balance.name === name);
  if (!item) {
    throw new Error(`No balance found for ${name}`);
  }
  return item;
}

async function getSuggested(
  groupId: string,
  actor: TestUser
): Promise<{
  from_user_id: string;
  to_user_id: string;
  amount: number;
}[]> {
  const response = await app.inject({
    method: "GET",
    url: `/api/groups/${groupId}/settlement`,
    headers: authHeaders(actor)
  });
  return response.json().transactions;
}

async function getHistory(
  groupId: string,
  actor: TestUser
): Promise<
  {
    id: string;
    from_user_id: string;
    from_name: string;
    to_user_id: string;
    to_name: string;
    amount: number;
  }[]
> {
  const response = await app.inject({
    method: "GET",
    url: `/api/groups/${groupId}/settlements`,
    headers: authHeaders(actor)
  });
  return response.json();
}

describe("POST /api/groups/:id/settlements", () => {
  it("records a settlement and returns both names", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);

    await addEqualExpense(
      group.id,
      userAt(users, 0).id,
      1000,
      users.map((user) => user.id),
      creator
    );

    const { statusCode, body } = await recordSettlement(
      group.id,
      {
        fromUserId: userAt(users, 1).id,
        toUserId: userAt(users, 0).id,
        amount: 200
      },
      creator
    );

    expect(statusCode).toBe(201);
    expect(body).toMatchObject({
      from_user_id: userAt(users, 1).id,
      from_name: "Bruno",
      to_user_id: userAt(users, 0).id,
      to_name: "Alex",
      amount: 200
    });
    expect(body.id).toBeTypeOf("string");
    expect(body.created_at).toBeTypeOf("string");
  });

  it("rejects settling with yourself", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);

    const { statusCode, body } = await recordSettlement(
      group.id,
      {
        fromUserId: userAt(users, 0).id,
        toUserId: userAt(users, 0).id,
        amount: 100
      },
      creator
    );

    expect(statusCode).toBe(400);
    expect((body.error as { code: string }).code).toBe("INVALID_SETTLEMENT");
  });

  it("rejects an unknown user", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);

    const { statusCode, body } = await recordSettlement(
      group.id,
      {
        fromUserId: "00000000-0000-4000-8000-000000000000",
        toUserId: userAt(users, 0).id,
        amount: 100
      },
      creator
    );

    expect(statusCode).toBe(404);
    expect((body.error as { code: string }).code).toBe("USER_NOT_FOUND");
  });

  it("rejects a user who is not part of the group", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);
    const eve = await registerUser(app, "Eve");

    const { statusCode, body } = await recordSettlement(
      group.id,
      {
        fromUserId: eve.id,
        toUserId: userAt(users, 0).id,
        amount: 100
      },
      creator
    );

    expect(statusCode).toBe(400);
    expect((body.error as { code: string }).code).toBe("USER_NOT_IN_GROUP");
  });

  it("rejects a non-positive amount", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);

    const { statusCode, body } = await recordSettlement(
      group.id,
      {
        fromUserId: userAt(users, 1).id,
        toUserId: userAt(users, 0).id,
        amount: 0
      },
      creator
    );

    expect(statusCode).toBe(400);
    expect((body.error as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("returns 403 when the caller is not a member", async () => {
    const { group, users } = await setupGroupWithMembers(app, ["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const { statusCode, body } = await recordSettlement(
      group.id,
      {
        fromUserId: userAt(users, 1).id,
        toUserId: userAt(users, 0).id,
        amount: 100
      },
      eve
    );

    expect(statusCode).toBe(403);
    expect((body.error as { code: string }).code).toBe("FORBIDDEN");
  });

  it("returns 404 for an unknown group", async () => {
    const { users, creator } = await setupGroupWithMembers(app, ["Alex", "Bruno"]);

    const { statusCode, body } = await recordSettlement(
      "00000000-0000-4000-8000-000000000000",
      {
        fromUserId: userAt(users, 0).id,
        toUserId: userAt(users, 1).id,
        amount: 100
      },
      creator
    );

    expect(statusCode).toBe(404);
    expect((body.error as { code: string }).code).toBe("GROUP_NOT_FOUND");
  });
});

describe("GET /api/groups/:id/settlements", () => {
  it("lists the settlement history newest first", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla"
    ]);
    const alex = userAt(users, 0);
    const bruno = userAt(users, 1);
    const carla = userAt(users, 2);

    await addEqualExpense(
      group.id,
      alex.id,
      900,
      users.map((user) => user.id),
      creator
    );

    await recordSettlement(
      group.id,
      { fromUserId: bruno.id, toUserId: alex.id, amount: 100 },
      creator
    );
    await recordSettlement(
      group.id,
      { fromUserId: carla.id, toUserId: alex.id, amount: 150 },
      creator
    );

    const history = await getHistory(group.id, creator);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      from_name: "Carla",
      to_name: "Alex",
      amount: 150
    });
    expect(history[1]).toMatchObject({
      from_name: "Bruno",
      to_name: "Alex",
      amount: 100
    });
  });

  it("returns an empty history for a group without settlements", async () => {
    const { group, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);

    expect(await getHistory(group.id, creator)).toEqual([]);
  });

  it("returns 404 for an unknown group", async () => {
    const { creator } = await setupGroupWithMembers(app, ["Alex"]);

    const response = await app.inject({
      method: "GET",
      url: "/api/groups/00000000-0000-4000-8000-000000000000/settlements",
      headers: authHeaders(creator)
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("DELETE /api/groups/:id/settlements/:settlementId", () => {
  it("removes a recorded payment and reverses the balances", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);
    const alex = userAt(users, 0);
    const bruno = userAt(users, 1);

    await addEqualExpense(
      group.id,
      alex.id,
      1000,
      [alex.id, bruno.id],
      creator
    );
    const recorded = await recordSettlement(
      group.id,
      { fromUserId: bruno.id, toUserId: alex.id, amount: 200 },
      creator
    );
    const settlementId = recorded.body.id as string;

    const before = await getBalances(group.id, creator);
    expect(balanceFor(before, "Bruno")).toMatchObject({
      settled: 200,
      balance: -300
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/settlements/${settlementId}`,
      headers: authHeaders(creator)
    });
    expect(response.statusCode).toBe(204);

    expect(await getHistory(group.id, creator)).toEqual([]);

    const after = await getBalances(group.id, creator);
    expect(balanceFor(after, "Bruno")).toMatchObject({
      settled: 0,
      balance: -500
    });
    expect(balanceFor(after, "Alex")).toMatchObject({
      settled: 0,
      balance: 500
    });
  });

  it("returns 404 when deleting twice", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);
    const alex = userAt(users, 0);
    const bruno = userAt(users, 1);

    await addEqualExpense(group.id, alex.id, 1000, [alex.id, bruno.id], creator);
    const recorded = await recordSettlement(
      group.id,
      { fromUserId: bruno.id, toUserId: alex.id, amount: 200 },
      creator
    );
    const settlementId = recorded.body.id as string;

    await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/settlements/${settlementId}`,
      headers: authHeaders(creator)
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/settlements/${settlementId}`,
      headers: authHeaders(creator)
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("SETTLEMENT_NOT_FOUND");
  });

  it("returns 403 for a non-member", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);
    const alex = userAt(users, 0);
    const bruno = userAt(users, 1);

    await addEqualExpense(group.id, alex.id, 1000, [alex.id, bruno.id], creator);
    const recorded = await recordSettlement(
      group.id,
      { fromUserId: bruno.id, toUserId: alex.id, amount: 200 },
      creator
    );
    const settlementId = recorded.body.id as string;
    const eve = await registerUser(app, "Eve");

    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/settlements/${settlementId}`,
      headers: authHeaders(eve)
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("settlement tracking", () => {
  it("reduces the remaining balances and suggestions as payments are recorded", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla",
      "David"
    ]);
    const david = userAt(users, 3);
    const carla = userAt(users, 2);
    const bruno = userAt(users, 1);
    const alex = userAt(users, 0);
    const everyone = users.map((user) => user.id);

    await addEqualExpense(group.id, alex.id, 12000, everyone, creator);
    await addEqualExpense(group.id, bruno.id, 8000, everyone, creator);
    await addEqualExpense(group.id, carla.id, 4000, everyone, creator);

    const suggestedBefore = await getSuggested(group.id, creator);
    expect(suggestedBefore).toEqual([
      { from_user_id: david.id, from_name: "David", to_user_id: alex.id, to_name: "Alex", amount: 6000 },
      { from_user_id: carla.id, from_name: "Carla", to_user_id: bruno.id, to_name: "Bruno", amount: 2000 }
    ]);

    await recordSettlement(
      group.id,
      { fromUserId: david.id, toUserId: alex.id, amount: 6000 },
      creator
    );

    const afterFirst = await getBalances(group.id, creator);
    expect(afterFirst.total).toBe(24000);
    expect(balanceFor(afterFirst, "David")).toMatchObject({
      settled: 6000,
      balance: 0
    });
    expect(balanceFor(afterFirst, "Alex")).toMatchObject({
      settled: -6000,
      balance: 0
    });
    expect(balanceFor(afterFirst, "Bruno").balance).toBe(2000);
    expect(balanceFor(afterFirst, "Carla").balance).toBe(-2000);

    expect(await getSuggested(group.id, creator)).toEqual([
      { from_user_id: carla.id, from_name: "Carla", to_user_id: bruno.id, to_name: "Bruno", amount: 2000 }
    ]);

    await recordSettlement(
      group.id,
      { fromUserId: carla.id, toUserId: bruno.id, amount: 2000 },
      creator
    );

    expect(await getSuggested(group.id, creator)).toEqual([]);

    const afterSecond = await getBalances(group.id, creator);
    for (const balance of afterSecond.balances) {
      expect(balance.balance).toBe(0);
    }
  });

  it("settles with a member who was removed from the group", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla"
    ]);
    const bruno = userAt(users, 1);

    await addEqualExpense(
      group.id,
      userAt(users, 0).id,
      900,
      users.map((user) => user.id),
      creator
    );
    await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/members/${bruno.id}`,
      headers: authHeaders(creator)
    });

    const { statusCode } = await recordSettlement(
      group.id,
      { fromUserId: bruno.id, toUserId: userAt(users, 0).id, amount: 300 },
      creator
    );

    expect(statusCode).toBe(201);
    const balances = await getBalances(group.id, creator);
    expect(balanceFor(balances, "Bruno")).toMatchObject({
      settled: 300,
      balance: 0
    });
  });
});
