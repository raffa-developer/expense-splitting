import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addMember,
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
import { recomputeGroupBalances } from "../src/services/balances.js";

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

interface BalanceItem {
  user_id: string;
  name: string;
  paid: number;
  owed: number;
  settled: number;
  balance: number;
}

interface BalancesBody {
  currency: string;
  total: number;
  balances: BalanceItem[];
}

function balanceOf(body: BalancesBody, name: string): BalanceItem {
  const item = body.balances.find((entry) => entry.name === name);
  if (!item) {
    throw new Error(`No balance found for ${name}`);
  }
  return item;
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

async function getBalances(
  groupId: string,
  actor: TestUser
): Promise<{ statusCode: number; body: BalancesBody }> {
  const response = await app.inject({
    method: "GET",
    url: `/api/groups/${groupId}/balances`,
    headers: authHeaders(actor)
  });
  return { statusCode: response.statusCode, body: response.json() };
}

describe("GET /api/groups/:id/balances", () => {
  it("matches the worked example from the project brief", async () => {
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

    const { statusCode, body } = await getBalances(group.id, creator);

    expect(statusCode).toBe(200);
    expect(body.currency).toBe("EUR");
    expect(body.total).toBe(24000);
    expect(
      body.balances.map(({ name, paid, owed, balance }) => ({
        name,
        paid,
        owed,
        balance
      }))
    ).toEqual([
      { name: "Alex", paid: 12000, owed: 6000, balance: 6000 },
      { name: "Bruno", paid: 8000, owed: 6000, balance: 2000 },
      { name: "Carla", paid: 4000, owed: 6000, balance: -2000 },
      { name: "David", paid: 0, owed: 6000, balance: -6000 }
    ]);
  });

  it("handles a mix of equal and exact splits", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla",
      "David"
    ]);

    await addEqualExpense(
      group.id,
      userAt(users, 0).id,
      12000,
      users.map((user) => user.id),
      creator
    );
    await createExpense(
      app,
      group.id,
      {
        description: "Hotel",
        amount: 8000,
        paidBy: userAt(users, 1).id,
        splitType: "exact",
        participants: [
          { userId: userAt(users, 0).id, share: 4000 },
          { userId: userAt(users, 1).id, share: 2000 },
          { userId: userAt(users, 2).id, share: 1000 },
          { userId: userAt(users, 3).id, share: 1000 }
        ]
      },
      creator
    );

    const { body } = await getBalances(group.id, creator);

    expect(body.total).toBe(20000);
    expect(
      body.balances.map(({ name, balance }) => ({ name, balance }))
    ).toEqual([
      { name: "Alex", balance: 5000 },
      { name: "Bruno", balance: 3000 },
      { name: "Carla", balance: -4000 },
      { name: "David", balance: -4000 }
    ]);
    expect(body.balances.reduce((sum, item) => sum + item.balance, 0)).toBe(0);
  });

  it("includes members without expenses at zero", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla",
      "David"
    ]);

    await addEqualExpense(
      group.id,
      userAt(users, 0).id,
      1000,
      [userAt(users, 0).id, userAt(users, 1).id],
      creator
    );

    const { body } = await getBalances(group.id, creator);

    expect(balanceOf(body, "Alex")).toMatchObject({ paid: 1000, owed: 500, balance: 500 });
    expect(balanceOf(body, "Bruno")).toMatchObject({ paid: 0, owed: 500, balance: -500 });
    expect(balanceOf(body, "Carla")).toMatchObject({ paid: 0, owed: 0, balance: 0 });
    expect(balanceOf(body, "David")).toMatchObject({ paid: 0, owed: 0, balance: 0 });
    expect(body.total).toBe(1000);
  });

  it("reflects deleted expenses", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno"
    ]);

    const expense = await createExpense(
      app,
      group.id,
      {
        description: "Dinner",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: [{ userId: userAt(users, 0).id }, { userId: userAt(users, 1).id }]
      },
      creator
    );

    const before = await getBalances(group.id, creator);
    expect(before.body.total).toBe(1000);

    await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/expenses/${expense.id}`,
      headers: authHeaders(creator)
    });

    const after = await getBalances(group.id, creator);
    expect(after.body.total).toBe(0);
    expect(after.body.balances.map((item) => item.balance)).toEqual([0, 0]);
  });

  it("keeps balances for members removed from the group", async () => {
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

    const { body } = await getBalances(group.id, creator);

    expect(balanceOf(body, "Bruno")).toMatchObject({ balance: -300 });
    expect(body.total).toBe(900);
    expect(body.balances.reduce((sum, item) => sum + item.balance, 0)).toBe(0);
  });

  it("handles one person paying for everything", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla",
      "David"
    ]);

    await addEqualExpense(
      group.id,
      creator.id,
      10000,
      users.map((user) => user.id),
      creator
    );

    const { body } = await getBalances(group.id, creator);

    expect(balanceOf(body, "Alex").balance).toBe(7500);
    expect(balanceOf(body, "Bruno").balance).toBe(-2500);
    expect(balanceOf(body, "Carla").balance).toBe(-2500);
    expect(balanceOf(body, "David").balance).toBe(-2500);
  });

  it("keeps the sum of balances at zero when splitting does not divide evenly", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla"
    ]);

    await addEqualExpense(
      group.id,
      creator.id,
      100,
      users.map((user) => user.id),
      creator
    );

    const { body } = await getBalances(group.id, creator);

    expect(balanceOf(body, "Alex").balance).toBe(66);
    expect(balanceOf(body, "Bruno").balance).toBe(-33);
    expect(balanceOf(body, "Carla").balance).toBe(-33);
    expect(body.balances.reduce((sum, item) => sum + item.balance, 0)).toBe(0);
  });

  it("returns zero balances for a group without expenses", async () => {
    const { group, creator } = await setupGroupWithMembers(app, ["Alex"]);

    const { statusCode, body } = await getBalances(group.id, creator);

    expect(statusCode).toBe(200);
    expect(body.total).toBe(0);
    expect(body.balances).toHaveLength(1);
    expect(body.balances[0]).toMatchObject({
      name: "Alex",
      paid: 0,
      owed: 0,
      settled: 0,
      balance: 0
    });
  });

  it("returns 403 for a non-member", async () => {
    const { group } = await setupGroupWithMembers(app, ["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const { statusCode } = await getBalances(group.id, eve);

    expect(statusCode).toBe(403);
  });

  it("returns 404 for an unknown group", async () => {
    const { creator } = await setupGroupWithMembers(app, ["Alex"]);

    const { statusCode, body } = await getBalances(
      "00000000-0000-4000-8000-000000000000",
      creator
    );

    expect(statusCode).toBe(404);
    expect((body as unknown as { error?: { code: string } }).error?.code).toBe(
      "GROUP_NOT_FOUND"
    );
  });

  it("returns 400 for a malformed group id", async () => {
    const { creator } = await setupGroupWithMembers(app, ["Alex"]);

    const { statusCode } = await getBalances("not-a-uuid", creator);
    expect(statusCode).toBe(400);
  });

  it("keeps maintained balances identical to a full recomputation", async () => {
    const { group, users, creator } = await setupGroupWithMembers(app, [
      "Alex",
      "Bruno",
      "Carla",
      "David"
    ]);
    const alex = userAt(users, 0);
    const bruno = userAt(users, 1);
    const carla = userAt(users, 2);
    const david = userAt(users, 3);

    await addEqualExpense(
      group.id,
      alex.id,
      1000,
      [alex.id, bruno.id, carla.id],
      creator
    );
    await createExpense(
      app,
      group.id,
      {
        description: "Hotel",
        amount: 9999,
        paidBy: bruno.id,
        splitType: "exact",
        participants: [
          { userId: alex.id, share: 3333 },
          { userId: bruno.id, share: 3333 },
          { userId: carla.id, share: 3333 }
        ]
      },
      creator
    );
    await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/settlements`,
      headers: authHeaders(creator),
      payload: { fromUserId: bruno.id, toUserId: alex.id, amount: 100 }
    });

    const temp = await createExpense(
      app,
      group.id,
      {
        description: "Temp",
        amount: 500,
        paidBy: carla.id,
        splitType: "equal",
        participants: [{ userId: carla.id }, { userId: alex.id }]
      },
      creator
    );
    await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/expenses/${temp.id}`,
      headers: authHeaders(creator)
    });

    await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/members/${david.id}`,
      headers: authHeaders(creator)
    });

    const afterRemoval = await getBalances(group.id, creator);
    expect(
      afterRemoval.body.balances.some((item) => item.user_id === david.id)
    ).toBe(false);

    await addMember(app, group.id, david.id, creator);

    const maintained = await getBalances(group.id, creator);
    const recomputed = await recomputeGroupBalances(context.pool, group.id);

    expect(maintained.body.total).toBe(recomputed.total);
    expect(maintained.body.balances).toHaveLength(recomputed.balances.length);

    const maintainedByUser = new Map(
      maintained.body.balances.map((item) => [item.user_id, item])
    );
    for (const row of recomputed.balances) {
      const item = maintainedByUser.get(row.user_id);
      expect({
        paid: item?.paid,
        owed: item?.owed,
        settled: item?.settled,
        balance: item?.balance
      }).toEqual({
        paid: row.paid,
        owed: row.owed,
        settled: row.settled,
        balance: row.balance
      });
    }
  });
});
