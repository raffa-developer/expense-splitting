import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recomputeGroupBalances } from "../src/services/balances.js";
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

interface Setup {
  group: { id: string; name: string; currency: string };
  users: TestUser[];
  creator: TestUser;
  headers: Record<string, string>;
}

async function setup(
  names = ["Alex", "Bruno", "Carla", "David"]
): Promise<Setup> {
  const result = await setupGroupWithMembers(app, names);
  return { ...result, headers: authHeaders(result.creator) };
}

describe("POST /api/groups/:id/expenses — equal split", () => {
  it("creates an expense and splits it equally", async () => {
    const { group, users, headers } = await setup();
    const alex = userAt(users, 0);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 10000,
        paidBy: alex.id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      group_id: group.id,
      description: "Dinner",
      amount: 10000,
      split_type: "equal",
      paid_by: alex.id,
      paid_by_name: "Alex"
    });
    expect(body.participants).toEqual([
      { user_id: userAt(users, 0).id, name: "Alex", share: 2500 },
      { user_id: userAt(users, 1).id, name: "Bruno", share: 2500 },
      { user_id: userAt(users, 2).id, name: "Carla", share: 2500 },
      { user_id: userAt(users, 3).id, name: "David", share: 2500 }
    ]);
  });

  it("distributes the remainder without losing minor units", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Taxi",
        amount: 100,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      }
    });

    expect(response.statusCode).toBe(201);
    const shares = response
      .json()
      .participants.map((p: { share: number }) => p.share);
    expect(shares).toEqual([34, 33, 33]);
    expect(shares.reduce((a: number, b: number) => a + b, 0)).toBe(100);
  });

  it("allows the payer to not be a participant", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Gift",
        amount: 500,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: [{ userId: userAt(users, 1).id }]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().participants).toEqual([
      { user_id: userAt(users, 1).id, name: "Bruno", share: 500 }
    ]);
  });

  it("returns 403 for a non-member", async () => {
    const { group } = await setup(["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers: authHeaders(eve),
      payload: {
        description: "Dinner",
        amount: 100,
        paidBy: eve.id,
        splitType: "equal",
        participants: [{ userId: eve.id }]
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });
});

describe("POST /api/groups/:id/expenses — exact split", () => {
  it("creates an expense with exact shares", async () => {
    const { group, users, headers } = await setup();

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Hotel",
        amount: 10000,
        paidBy: userAt(users, 1).id,
        splitType: "exact",
        participants: [
          { userId: userAt(users, 0).id, share: 4000 },
          { userId: userAt(users, 1).id, share: 3000 },
          { userId: userAt(users, 2).id, share: 2000 },
          { userId: userAt(users, 3).id, share: 1000 }
        ]
      }
    });

    expect(response.statusCode).toBe(201);
    const shares = response
      .json()
      .participants.map((p: { share: number }) => p.share);
    expect(shares).toEqual([4000, 3000, 2000, 1000]);
  });

  it("rejects shares that do not sum to the amount", async () => {
    const { group, users, headers } = await setup();

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Hotel",
        amount: 10000,
        paidBy: userAt(users, 0).id,
        splitType: "exact",
        participants: [
          { userId: userAt(users, 0).id, share: 4000 },
          { userId: userAt(users, 1).id, share: 5000 }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");
  });

  it("rejects a participant without a share", async () => {
    const { group, users, headers } = await setup();

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Hotel",
        amount: 10000,
        paidBy: userAt(users, 0).id,
        splitType: "exact",
        participants: [
          { userId: userAt(users, 0).id, share: 10000 },
          { userId: userAt(users, 1).id }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");
  });
});

describe("POST /api/groups/:id/expenses — validation", () => {
  it("rejects shares provided for an equal split", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 100,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: [{ userId: userAt(users, 1).id, share: 100 }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");
  });

  it("rejects duplicate participants", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 100,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: [{ userId: userAt(users, 1).id }, { userId: userAt(users, 1).id }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("DUPLICATE_PARTICIPANT");
  });

  it("rejects a participant who is not a group member", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 100,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: [{ userId: userAt(users, 1).id }, { userId: eve.id }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("PARTICIPANT_NOT_MEMBER");
  });

  it("rejects an unknown participant", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 100,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: [
          { userId: userAt(users, 1).id },
          { userId: "00000000-0000-4000-8000-000000000000" }
        ]
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("USER_NOT_FOUND");
  });

  it("rejects a payer who is not a group member", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 100,
        paidBy: eve.id,
        splitType: "equal",
        participants: [{ userId: userAt(users, 0).id }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("PAYER_NOT_MEMBER");
  });

  it("rejects an unknown payer", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 100,
        paidBy: "00000000-0000-4000-8000-000000000000",
        splitType: "equal",
        participants: [{ userId: userAt(users, 0).id }]
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("USER_NOT_FOUND");
  });

  it("rejects a non-positive amount", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    for (const amount of [0, -100]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/groups/${group.id}/expenses`,
        headers,
        payload: {
          description: "Dinner",
          amount,
          paidBy: userAt(users, 0).id,
          splitType: "equal",
          participants: [{ userId: userAt(users, 1).id }]
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects a non-integer amount", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 10.5,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: [{ userId: userAt(users, 1).id }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty participant list", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 100,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: []
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a blank description", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "   ",
        amount: 100,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: [{ userId: userAt(users, 1).id }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_DESCRIPTION");
  });

  it("returns 404 for an unknown group", async () => {
    const { users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: "/api/groups/00000000-0000-4000-8000-000000000000/expenses",
      headers,
      payload: {
        description: "Dinner",
        amount: 100,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: [{ userId: userAt(users, 1).id }]
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("GROUP_NOT_FOUND");
  });
});

describe("GET /api/groups/:id/expenses", () => {
  it("lists expenses with their participants", async () => {
    const { group, users, creator } = await setup(["Alex", "Bruno"]);
    const headers = authHeaders(creator);

    for (const description of ["Dinner", "Taxi"]) {
      await createExpense(
        app,
        group.id,
        {
          description,
          amount: 1000,
          paidBy: userAt(users, 0).id,
          splitType: "equal",
          participants: users.map((user) => ({ userId: user.id }))
        },
        creator
      );
    }

    const response = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses`,
      headers
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(2);
    expect(
      body.expenses.map((expense: { description: string }) => expense.description)
    ).toEqual(["Dinner", "Taxi"]);
    expect(body.expenses[0].participants).toHaveLength(2);
    expect(body.expenses[0].amount).toBe(1000);
  });

  it("paginates expenses", async () => {
    const { group, users, creator } = await setup(["Alex", "Bruno"]);
    const headers = authHeaders(creator);

    for (const description of ["First", "Second", "Third"]) {
      await createExpense(
        app,
        group.id,
        {
          description,
          amount: 100,
          paidBy: userAt(users, 0).id,
          splitType: "equal",
          participants: users.map((user) => ({ userId: user.id }))
        },
        creator
      );
    }

    const firstPage = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses?limit=2`,
      headers
    });
    expect(firstPage.statusCode).toBe(200);
    expect(
      firstPage.json().expenses.map((expense: { description: string }) => expense.description)
    ).toEqual(["First", "Second"]);
    expect(firstPage.json().total).toBe(3);
    expect(firstPage.json().limit).toBe(2);

    const secondPage = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses?limit=2&offset=2`,
      headers
    });
    expect(
      secondPage.json().expenses.map((expense: { description: string }) => expense.description)
    ).toEqual(["Third"]);
    expect(secondPage.json().offset).toBe(2);
  });

  it("rejects an invalid limit", async () => {
    const { group, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses?limit=9999`,
      headers
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("returns an empty list for a group without expenses", async () => {
    const { group, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses`,
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      expenses: [],
      total: 0,
      limit: 50,
      offset: 0
    });
  });

  it("returns 404 for an unknown group", async () => {
    const { headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "GET",
      url: "/api/groups/00000000-0000-4000-8000-000000000000/expenses",
      headers
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /api/groups/:id/expenses/:expenseId", () => {
  it("returns a single expense", async () => {
    const { group, users, creator } = await setup(["Alex", "Bruno"]);

    const expense = await createExpense(
      app,
      group.id,
      {
        description: "Dinner",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      },
      creator
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses/${expense.id}`,
      headers: authHeaders(creator)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: expense.id,
      description: "Dinner",
      amount: 1000
    });
    expect(response.json().participants).toHaveLength(2);
  });

  it("returns 404 for an unknown expense", async () => {
    const { group, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses/00000000-0000-4000-8000-000000000000`,
      headers
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("EXPENSE_NOT_FOUND");
  });

  it("returns 400 for a malformed expense id", async () => {
    const { group, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses/not-a-uuid`,
      headers
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("DELETE /api/groups/:id/expenses/:expenseId", () => {
  it("deletes an expense and its participants", async () => {
    const { group, users, creator } = await setup(["Alex", "Bruno"]);

    const expense = await createExpense(
      app,
      group.id,
      {
        description: "Dinner",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      },
      creator
    );

    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/expenses/${expense.id}`,
      headers: authHeaders(creator)
    });
    expect(response.statusCode).toBe(204);

    const { rows: participantRows } = await context.pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM expense_participants
       WHERE expense_id = $1`,
      [expense.id]
    );
    expect(participantRows[0]?.count).toBe(0);

    const after = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses`,
      headers: authHeaders(creator)
    });
    expect(after.json().expenses).toEqual([]);
  });

  it("returns 404 when deleting twice", async () => {
    const { group, users, creator } = await setup(["Alex", "Bruno"]);

    const expense = await createExpense(
      app,
      group.id,
      {
        description: "Dinner",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      },
      creator
    );

    await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/expenses/${expense.id}`,
      headers: authHeaders(creator)
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${group.id}/expenses/${expense.id}`,
      headers: authHeaders(creator)
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("EXPENSE_NOT_FOUND");
  });

  it("returns 404 for an expense of another group", async () => {
    const { group, users, creator } = await setup(["Alex", "Bruno"]);
    const otherGroup = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: authHeaders(creator),
      payload: { name: "Other Trip" }
    });

    const expense = await createExpense(
      app,
      group.id,
      {
        description: "Dinner",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      },
      creator
    );

    const response = await app.inject({
      method: "DELETE",
      url: `/api/groups/${otherGroup.json().id}/expenses/${expense.id}`,
      headers: authHeaders(creator)
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("EXPENSE_NOT_FOUND");
  });
});

describe("POST /api/groups/:id/expenses — percentage split", () => {
  it("creates an expense with percentage shares", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);
    const alex = userAt(users, 0);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 10000,
        paidBy: alex.id,
        splitType: "percentage",
        participants: [
          { userId: userAt(users, 0).id, percentage: 50 },
          { userId: userAt(users, 1).id, percentage: 30 },
          { userId: userAt(users, 2).id, percentage: 20 }
        ]
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.split_type).toBe("percentage");
    expect(body.participants).toEqual([
      { user_id: userAt(users, 0).id, name: "Alex", share: 5000, percentage: 50 },
      { user_id: userAt(users, 1).id, name: "Bruno", share: 3000, percentage: 30 },
      { user_id: userAt(users, 2).id, name: "Carla", share: 2000, percentage: 20 }
    ]);
  });

  it("keeps the shares summing to the amount after rounding", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Taxi",
        amount: 100,
        paidBy: userAt(users, 0).id,
        splitType: "percentage",
        participants: [
          { userId: userAt(users, 0).id, percentage: 33.33 },
          { userId: userAt(users, 1).id, percentage: 33.33 },
          { userId: userAt(users, 2).id, percentage: 33.34 }
        ]
      }
    });

    expect(response.statusCode).toBe(201);
    const shares = response
      .json()
      .participants.map((participant: { share: number }) => participant.share);
    expect(shares).toEqual([33, 33, 34]);
  });

  it("rejects percentages that do not sum to 100", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 10000,
        paidBy: userAt(users, 0).id,
        splitType: "percentage",
        participants: [
          { userId: userAt(users, 0).id, percentage: 50 },
          { userId: userAt(users, 1).id, percentage: 30 },
          { userId: userAt(users, 2).id, percentage: 19.99 }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");
  });

  it("rejects percentages with more than two decimals", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 10000,
        paidBy: userAt(users, 0).id,
        splitType: "percentage",
        participants: [
          { userId: userAt(users, 0).id, percentage: 50.005 },
          { userId: userAt(users, 1).id, percentage: 49.995 }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");
  });

  it("rejects split fields that do not belong to the split type", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Dinner",
        amount: 10000,
        paidBy: userAt(users, 0).id,
        splitType: "percentage",
        participants: [
          { userId: userAt(users, 0).id, percentage: 100, share: 10000 }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");
  });
});

describe("POST /api/groups/:id/expenses — weighted shares", () => {
  it("creates an expense with weighted shares", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Hotel",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "shares",
        participants: [
          { userId: userAt(users, 0).id, weight: 2 },
          { userId: userAt(users, 1).id, weight: 1 },
          { userId: userAt(users, 2).id, weight: 1 }
        ]
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.split_type).toBe("shares");
    expect(body.participants).toEqual([
      { user_id: userAt(users, 0).id, name: "Alex", share: 500, weight: 2 },
      { user_id: userAt(users, 1).id, name: "Bruno", share: 250, weight: 1 },
      { user_id: userAt(users, 2).id, name: "Carla", share: 250, weight: 1 }
    ]);
  });

  it("rejects weights that are all zero", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Hotel",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "shares",
        participants: [
          { userId: userAt(users, 0).id, weight: 0 },
          { userId: userAt(users, 1).id, weight: 0 }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");
  });

  it("rejects a missing weight", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses`,
      headers,
      payload: {
        description: "Hotel",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "shares",
        participants: [
          { userId: userAt(users, 0).id, weight: 1 },
          { userId: userAt(users, 1).id }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");
  });
});

describe("POST /api/groups/:id/expenses/batch", () => {
  const six = ["Alex", "Bruno", "Carla", "David", "Eve", "Frank"];

  it("creates a night out in one request and nets the payers", async () => {
    const { group, users, headers } = await setup(six);
    const ids = users.map((user) => user.id);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses/batch`,
      headers,
      payload: {
        expenses: [
          {
            description: "Food + drinks",
            amount: 12000,
            paidBy: userAt(users, 0).id,
            splitType: "equal",
            participants: ids.map((userId) => ({ userId }))
          },
          {
            description: "Uber",
            amount: 3000,
            paidBy: userAt(users, 1).id,
            splitType: "equal",
            participants: ids.map((userId) => ({ userId }))
          },
          {
            description: "Snacks",
            amount: 1800,
            paidBy: userAt(users, 2).id,
            splitType: "equal",
            participants: ids.map((userId) => ({ userId }))
          }
        ]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(
      response
        .json()
        .expenses.map((expense: { description: string }) => expense.description)
    ).toEqual(["Food + drinks", "Uber", "Snacks"]);

    const balances = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/balances`,
      headers
    });
    const balancesBody = balances.json();
    expect(balancesBody.total).toBe(16800);
    expect(
      Object.fromEntries(
        balancesBody.balances.map(
          (balance: { name: string; balance: number }) => [
            balance.name,
            balance.balance
          ]
        )
      )
    ).toEqual({
      Alex: 9200,
      Bruno: 200,
      Carla: -1000,
      David: -2800,
      Eve: -2800,
      Frank: -2800
    });

    const settlement = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/settlement`,
      headers
    });
    expect(
      settlement
        .json()
        .transactions.map((transaction: { amount: number }) => transaction.amount)
        .sort((a: number, b: number) => b - a)
    ).toEqual([2800, 2800, 2800, 800, 200]);
  });

  it("supports different split types per item", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses/batch`,
      headers,
      payload: {
        expenses: [
          {
            description: "Dinner",
            amount: 3000,
            paidBy: userAt(users, 0).id,
            splitType: "equal",
            participants: users.map((user) => ({ userId: user.id }))
          },
          {
            description: "Taxi",
            amount: 2000,
            paidBy: userAt(users, 2).id,
            splitType: "exact",
            participants: [
              { userId: userAt(users, 0).id, share: 1000 },
              { userId: userAt(users, 1).id, share: 1000 }
            ]
          }
        ]
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.expenses[1]).toMatchObject({
      description: "Taxi",
      split_type: "exact"
    });
    expect(
      body.expenses[1].participants.map(
        (participant: { share: number }) => participant.share
      )
    ).toEqual([1000, 1000]);
  });

  it("is atomic when one item is invalid", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses/batch`,
      headers,
      payload: {
        expenses: [
          {
            description: "Valid",
            amount: 1000,
            paidBy: userAt(users, 0).id,
            splitType: "equal",
            participants: users.map((user) => ({ userId: user.id }))
          },
          {
            description: "Invalid",
            amount: 1000,
            paidBy: userAt(users, 0).id,
            splitType: "exact",
            participants: [{ userId: userAt(users, 0).id, share: 900 }]
          }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");
    expect(response.json().error.message).toContain("expenses[1]");

    const list = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses`,
      headers
    });
    expect(list.json().total).toBe(0);
  });

  it("rejects an empty batch", async () => {
    const { group, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses/batch`,
      headers,
      payload: { expenses: [] }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("replays the whole batch with an idempotency key", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);
    const payload = {
      expenses: ["Dinner", "Taxi"].map((description, index) => ({
        description,
        amount: 1000 + index * 500,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      }))
    };
    const keyHeaders = { ...headers, "idempotency-key": "batch-key" };

    const first = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses/batch`,
      headers: keyHeaders,
      payload
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses/batch`,
      headers: keyHeaders,
      payload
    });
    expect(second.statusCode).toBe(201);
    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(second.json()).toEqual(first.json());

    const list = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses`,
      headers
    });
    expect(list.json().total).toBe(2);
  });

  it("returns 403 for a non-member", async () => {
    const { group, users } = await setup(["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${group.id}/expenses/batch`,
      headers: authHeaders(eve),
      payload: {
        expenses: [
          {
            description: "Dinner",
            amount: 1000,
            paidBy: userAt(users, 0).id,
            splitType: "equal",
            participants: users.map((user) => ({ userId: user.id }))
          }
        ]
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });
});

describe("PUT /api/groups/:id/expenses/:expenseId", () => {
  async function expectMaintainedMatchesRecompute(
    groupId: string,
    headers: Record<string, string>
  ): Promise<void> {
    const maintainedResponse = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/balances`,
      headers
    });
    expect(maintainedResponse.statusCode).toBe(200);
    const maintained = maintainedResponse.json() as {
      total: number;
      balances: {
        user_id: string;
        paid: number;
        owed: number;
        settled: number;
        balance: number;
      }[];
    };
    const recomputed = await recomputeGroupBalances(context.pool, groupId);

    expect(maintained.total).toBe(recomputed.total);
    expect(maintained.balances).toHaveLength(recomputed.balances.length);

    const maintainedByUser = new Map(
      maintained.balances.map((row) => [row.user_id, row])
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
  }

  it("updates the expense and keeps balances equal to recompute", async () => {
    const { group, users, headers } = await setup();
    const alex = userAt(users, 0);
    const bruno = userAt(users, 1);

    const created = await createExpense(
      app,
      group.id,
      {
        description: "Dinner",
        amount: 10000,
        paidBy: alex.id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      },
      alex
    );

    const response = await app.inject({
      method: "PUT",
      url: `/api/groups/${group.id}/expenses/${created.id}`,
      headers,
      payload: {
        description: "Dinner (updated)",
        amount: 12000,
        paidBy: bruno.id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      id: created.id,
      group_id: group.id,
      description: "Dinner (updated)",
      amount: 12000,
      split_type: "equal",
      paid_by: bruno.id,
      paid_by_name: "Bruno"
    });
    expect(body.participants).toEqual([
      { user_id: userAt(users, 0).id, name: "Alex", share: 3000 },
      { user_id: userAt(users, 1).id, name: "Bruno", share: 3000 },
      { user_id: userAt(users, 2).id, name: "Carla", share: 3000 },
      { user_id: userAt(users, 3).id, name: "David", share: 3000 }
    ]);

    await expectMaintainedMatchesRecompute(group.id, headers);
  });

  it("removes a participant and reverses their owed balance", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);
    const alex = userAt(users, 0);
    const carla = userAt(users, 2);

    const created = await createExpense(
      app,
      group.id,
      {
        description: "Taxi",
        amount: 900,
        paidBy: alex.id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      },
      alex
    );

    const response = await app.inject({
      method: "PUT",
      url: `/api/groups/${group.id}/expenses/${created.id}`,
      headers,
      payload: {
        description: "Taxi",
        amount: 900,
        paidBy: alex.id,
        splitType: "equal",
        participants: [
          { userId: userAt(users, 0).id },
          { userId: userAt(users, 1).id }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().participants).toEqual([
      { user_id: userAt(users, 0).id, name: "Alex", share: 450 },
      { user_id: userAt(users, 1).id, name: "Bruno", share: 450 }
    ]);

    const balances = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/balances`,
      headers
    });
    const carlaRow = balances
      .json()
      .balances.find((row: { user_id: string }) => row.user_id === carla.id);
    expect(carlaRow?.owed).toBe(0);

    await expectMaintainedMatchesRecompute(group.id, headers);
  });

  it("round-trips percentage inputs without shifting shares", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);
    const payload = {
      description: "Rent",
      amount: 10000,
      paidBy: userAt(users, 0).id,
      splitType: "percentage" as const,
      participants: [
        { userId: userAt(users, 0).id, percentage: 50 },
        { userId: userAt(users, 1).id, percentage: 25 },
        { userId: userAt(users, 2).id, percentage: 25 }
      ]
    };

    const created = await createExpense(app, group.id, payload, userAt(users, 0));
    const before = created.participants.map((participant) => participant.share);

    const response = await app.inject({
      method: "PUT",
      url: `/api/groups/${group.id}/expenses/${created.id}`,
      headers,
      payload
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.participants).toEqual([
      {
        user_id: userAt(users, 0).id,
        name: "Alex",
        share: before[0],
        percentage: 50
      },
      {
        user_id: userAt(users, 1).id,
        name: "Bruno",
        share: before[1],
        percentage: 25
      },
      {
        user_id: userAt(users, 2).id,
        name: "Carla",
        share: before[2],
        percentage: 25
      }
    ]);

    await expectMaintainedMatchesRecompute(group.id, headers);
  });

  it("returns 404 for an unknown expense", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno"]);

    const response = await app.inject({
      method: "PUT",
      url: `/api/groups/${group.id}/expenses/00000000-0000-4000-8000-000000000000`,
      headers,
      payload: {
        description: "Dinner",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("EXPENSE_NOT_FOUND");
  });

  it("returns 403 for a non-member", async () => {
    const { group, users } = await setup(["Alex", "Bruno"]);
    const eve = await registerUser(app, "Eve");

    const created = await createExpense(
      app,
      group.id,
      {
        description: "Dinner",
        amount: 1000,
        paidBy: userAt(users, 0).id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      },
      userAt(users, 0)
    );

    const response = await app.inject({
      method: "PUT",
      url: `/api/groups/${group.id}/expenses/${created.id}`,
      headers: authHeaders(eve),
      payload: {
        description: "Hacked",
        amount: 1000,
        paidBy: eve.id,
        splitType: "equal",
        participants: [{ userId: eve.id }]
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("rejects invalid splits without changing the expense", async () => {
    const { group, users, headers } = await setup(["Alex", "Bruno", "Carla"]);
    const alex = userAt(users, 0);

    const created = await createExpense(
      app,
      group.id,
      {
        description: "Dinner",
        amount: 1000,
        paidBy: alex.id,
        splitType: "equal",
        participants: users.map((user) => ({ userId: user.id }))
      },
      alex
    );

    const response = await app.inject({
      method: "PUT",
      url: `/api/groups/${group.id}/expenses/${created.id}`,
      headers,
      payload: {
        description: "Dinner",
        amount: 1000,
        paidBy: alex.id,
        splitType: "exact",
        participants: [
          { userId: userAt(users, 0).id, share: 100 },
          { userId: userAt(users, 1).id, share: 100 },
          { userId: userAt(users, 2).id, share: 100 }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SPLIT");

    const current = await app.inject({
      method: "GET",
      url: `/api/groups/${group.id}/expenses/${created.id}`,
      headers
    });
    expect(current.json()).toMatchObject({
      description: "Dinner",
      amount: 1000,
      split_type: "equal"
    });

    await expectMaintainedMatchesRecompute(group.id, headers);
  });
});
