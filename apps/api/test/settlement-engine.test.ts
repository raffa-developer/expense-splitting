import { describe, expect, it } from "vitest";
import {
  computeSettlements,
  type SettlementParticipant,
  type SettlementTransaction
} from "../src/domain/settlement.js";

function participant(userId: string, name: string, balance: number): SettlementParticipant {
  return { userId, name, balance };
}

function expectSettlesExactly(
  participants: SettlementParticipant[],
  transactions: SettlementTransaction[]
): void {
  const net = new Map<string, number>();
  for (const item of participants) {
    net.set(item.userId, 0);
  }

  for (const transaction of transactions) {
    expect(transaction.amount).toBeGreaterThan(0);

    const from = net.get(transaction.fromUserId);
    const to = net.get(transaction.toUserId);
    if (from === undefined || to === undefined) {
      throw new Error("Transaction references an unknown participant");
    }
    net.set(transaction.fromUserId, from - transaction.amount);
    net.set(transaction.toUserId, to + transaction.amount);
  }

  for (const item of participants) {
    expect(net.get(item.userId)).toBe(item.balance);
  }
}

describe("computeSettlements", () => {
  it("returns no transactions for an empty group", () => {
    expect(computeSettlements([])).toEqual([]);
  });

  it("returns no transactions when everyone is settled", () => {
    const participants = [
      participant("a", "Alex", 0),
      participant("b", "Bruno", 0)
    ];

    expect(computeSettlements(participants)).toEqual([]);
  });

  it("settles two people", () => {
    const participants = [
      participant("a", "Alex", 500),
      participant("b", "Bruno", -500)
    ];

    expect(computeSettlements(participants)).toEqual([
      {
        fromUserId: "b",
        fromName: "Bruno",
        toUserId: "a",
        toName: "Alex",
        amount: 500
      }
    ]);
  });

  it("matches the worked example from the project brief", () => {
    const participants = [
      participant("alex", "Alex", 6000),
      participant("bruno", "Bruno", 2000),
      participant("carla", "Carla", -2000),
      participant("david", "David", -6000)
    ];

    expect(computeSettlements(participants)).toEqual([
      {
        fromUserId: "david",
        fromName: "David",
        toUserId: "alex",
        toName: "Alex",
        amount: 6000
      },
      {
        fromUserId: "carla",
        fromName: "Carla",
        toUserId: "bruno",
        toName: "Bruno",
        amount: 2000
      }
    ]);
  });

  it("settles the section 1 example in three transfers", () => {
    const participants = [
      participant("alice", "Alice", 10000),
      participant("bob", "Bob", 5000),
      participant("carlos", "Carlos", -8000),
      participant("diana", "Diana", -7000)
    ];

    const transactions = computeSettlements(participants);

    expect(transactions).toEqual([
      {
        fromUserId: "carlos",
        fromName: "Carlos",
        toUserId: "alice",
        toName: "Alice",
        amount: 8000
      },
      {
        fromUserId: "diana",
        fromName: "Diana",
        toUserId: "bob",
        toName: "Bob",
        amount: 5000
      },
      {
        fromUserId: "diana",
        fromName: "Diana",
        toUserId: "alice",
        toName: "Alice",
        amount: 2000
      }
    ]);
    expectSettlesExactly(participants, transactions);
  });

  it("handles odd cent remainders", () => {
    const participants = [
      participant("a", "Alex", 66),
      participant("b", "Bruno", -33),
      participant("c", "Carla", -33)
    ];

    const transactions = computeSettlements(participants);

    expect(transactions).toEqual([
      {
        fromUserId: "b",
        fromName: "Bruno",
        toUserId: "a",
        toName: "Alex",
        amount: 33
      },
      {
        fromUserId: "c",
        fromName: "Carla",
        toUserId: "a",
        toName: "Alex",
        amount: 33
      }
    ]);
    expectSettlesExactly(participants, transactions);
  });

  it("breaks ties deterministically by user id", () => {
    const participants = [
      participant("c", "Carla", 1000),
      participant("a", "Alex", 1000),
      participant("d", "David", -1000),
      participant("b", "Bruno", -1000)
    ];

    const transactions = computeSettlements(participants);

    expect(
      transactions.map((transaction) => [
        transaction.fromUserId,
        transaction.toUserId,
        transaction.amount
      ])
    ).toEqual([
      ["b", "a", 1000],
      ["d", "c", 1000]
    ]);
  });

  it("never uses more than one transfer per participant with a non-zero balance", () => {
    const participants = [
      participant("a", "Alex", 1000),
      participant("b", "Bruno", 900),
      participant("c", "Carla", 800),
      participant("d", "David", 700),
      participant("e", "Emma", 600),
      participant("f", "Frank", -1100),
      participant("g", "Grace", -1000),
      participant("h", "Henry", -900),
      participant("i", "Ivy", -600),
      participant("j", "Jack", -400)
    ];

    const transactions = computeSettlements(participants);

    expect(transactions.length).toBeLessThanOrEqual(9);
    expectSettlesExactly(participants, transactions);
  });

  it("rejects balances that do not sum to zero", () => {
    expect(() =>
      computeSettlements([
        participant("a", "Alex", 500),
        participant("b", "Bruno", -400)
      ])
    ).toThrowError(/unbalanced/i);
  });
});
