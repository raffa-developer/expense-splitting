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

interface SettlementTransactionBody {
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  amount: number;
}

interface SettlementBody {
  currency: string;
  transactions: SettlementTransactionBody[];
}

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

async function getSettlement(
  groupId: string,
  actor: TestUser
): Promise<{ statusCode: number; body: SettlementBody }> {
  const response = await app.inject({
    method: "GET",
    url: `/api/groups/${groupId}/settlement`,
    headers: authHeaders(actor)
  });
  return { statusCode: response.statusCode, body: response.json() };
}

async function expectSettlementClears(
  groupId: string,
  actor: TestUser
): Promise<void> {
  const balancesResponse = await app.inject({
    method: "GET",
    url: `/api/groups/${groupId}/balances`,
    headers: authHeaders(actor)
  });
  const balances = balancesResponse.json().balances as {
    user_id: string;
    balance: number;
  }[];

  const settlement = await getSettlement(groupId, actor);

  const net = new Map<string, number>(
    balances.map((balance) => [balance.user_id, 0])
  );

  for (const transaction of settlement.body.transactions) {
    const from = net.get(transaction.from_user_id);
    const to = net.get(transaction.to_user_id);
    if (from === undefined || to === undefined) {
      throw new Error("Settlement references an unknown participant");
    }
    net.set(transaction.from_user_id, from - transaction.amount);
    net.set(transaction.to_user_id, to + transaction.amount);
  }

  for (const balance of balances) {
    expect(net.get(balance.user_id)).toBe(balance.balance);
  }
}

describe("GET /api/groups/:id/settlement", () => {
  it("generates the settlements from the worked example", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla",
      "David"
    ]);
    const everyone = users.map((user) => user.id);

    await addEqualExpense(group.id, userAt(users, 0).id, 12000, everyone, creator);
    await addEqualExpense(group.id, userAt(users, 1).id, 8000, everyone, creator);
    await addEqualExpense(group.id, userAt(users, 2).id, 4000, everyone, creator);

    const { statusCode, body } = await getSettlement(group.id, creator);

    expect(statusCode).toBe(200);
    expect(body.currency).toBe("EUR");
    expect(body.transactions).toEqual([
      {
        from_user_id: userAt(users, 3).id,
        from_name: "David",
        to_user_id: userAt(users, 0).id,
        to_name: "Alex",
        amount: 6000
      },
      {
        from_user_id: userAt(users, 2).id,
        from_name: "Carla",
        to_user_id: userAt(users, 1).id,
        to_name: "Bruno",
        amount: 2000
      }
    ]);
  });

  it("returns no transactions when everyone is settled", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);

    await createExpense(
      app,
      group.id,
      {
        description: "Solo",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "exact",
        participants: [{ userId: userAt(users, 0).id, share: 1000 }]
      },
      creator
    );

    const { statusCode, body } = await getSettlement(group.id, creator);

    expect(statusCode).toBe(200);
    expect(body.transactions).toEqual([]);
  });

  it("returns no transactions for a group without expenses", async () => {
    const { group, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);

    const { body } = await getSettlement(group.id, creator);

    expect(body.transactions).toEqual([]);
  });

  it("clears every balance with a mix of splits", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla",
      "David"
    ]);

    await addEqualExpense(
      group.id,
      userAt(users, 0).id,
      100,
      users.map((user) => user.id),
      creator
    );
    await createExpense(
      app,
      group.id,
      {
        description: "Hotel",
        amount: 9001,
        paidBy: userAt(users, 1).id,
        splitType: "exact",
        participants: [
          { userId: userAt(users, 0).id, share: 1 },
          { userId: userAt(users, 1).id, share: 5000 },
          { userId: userAt(users, 2).id, share: 2000 },
          { userId: userAt(users, 3).id, share: 2000 }
        ]
      },
      creator
    );

    const { body } = await getSettlement(group.id, creator);

    expect(body.transactions.length).toBeGreaterThan(0);
    expect(body.transactions.length).toBeLessThanOrEqual(users.length - 1);
    await expectSettlementClears(group.id, creator);
  });

  it("recomputes after an expense is deleted", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla",
      "David"
    ]);
    const everyone = users.map((user) => user.id);

    await addEqualExpense(group.id, userAt(users, 0).id, 12000, everyone, creator);
    const brunoExpense = await createExpense(
      app,
      group.id,
      {
        description: "Hotel",
        amount: 8000,
        paidBy: userAt(users, 1).id,
        splitType: "equal",
        participants: everyone.map((userId) => ({ userId }))
      },
      creator
    );
    await addEqualExpense(group.id, userAt(users, 2).id, 4000, everyone, creator);

    await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/expenses/${brunoExpense.id}`,
      headers: authHeaders(creator)
    });

    const { body } = await getSettlement(group.id, creator);

    expect(body.transactions).not.toEqual([]);
    await expectSettlementClears(group.id, creator);
  });

  it("keeps settlements for members removed from the group", async () => {
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

    const { body } = await getSettlement(group.id, creator);

    expect(
      body.transactions.some(
        (transaction) =>
          transaction.from_user_id === bruno.id ||
          transaction.to_user_id === bruno.id
      )
    ).toBe(true);
    await expectSettlementClears(group.id, creator);
  });

  it("returns 403 for a non-member", async () => {
    const { group } = await setupGroupWithMembers(app, ["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const { statusCode } = await getSettlement(group.id, eve);

    expect(statusCode).toBe(403);
  });

  it("returns 404 for an unknown group", async () => {
    const { creator } = await setupGroupWithMembers(app, ["Alex"]);

    const { statusCode, body } = await getSettlement(
      "00000000-0000-4000-8000-000000000000",
      creator
    );

    expect(statusCode).toBe(404);
    expect((body as unknown as { error: { code: string } }).error.code).toBe(
      "GROUP_NOT_FOUND"
    );
  });

  it("returns 400 for a malformed group id", async () => {
    const { creator } = await setupGroupWithMembers(app, ["Alex"]);

    const { statusCode } = await getSettlement("not-a-uuid", creator);
    expect(statusCode).toBe(400);
  });
});
