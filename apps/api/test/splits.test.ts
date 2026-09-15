import { describe, expect, it } from "vitest";
import { computeShares } from "../src/domain/splits.js";
import { AppError } from "../src/errors.js";

const alex = "11111111-1111-4111-8111-111111111111";
const bruno = "22222222-2222-4222-8222-222222222222";
const carla = "33333333-3333-4333-8333-333333333333";
const david = "44444444-4444-4444-8444-444444444444";

function expectAppError(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.unreachable("Expected an AppError to be thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    expect((error as AppError).statusCode).toBe(400);
  }
}

describe("computeShares — equal split", () => {
  it("splits evenly when the amount is divisible", () => {
    const shares = computeShares({
      splitType: "equal",
      amount: 1000,
      participants: [{ userId: alex }, { userId: bruno }, { userId: carla }, { userId: david }]
    });

    expect(shares).toEqual([
      { userId: alex, share: 250 },
      { userId: bruno, share: 250 },
      { userId: carla, share: 250 },
      { userId: david, share: 250 }
    ]);
  });

  it("distributes the remainder to the first participants", () => {
    const shares = computeShares({
      splitType: "equal",
      amount: 100,
      participants: [{ userId: alex }, { userId: bruno }, { userId: carla }]
    });

    expect(shares).toEqual([
      { userId: alex, share: 34 },
      { userId: bruno, share: 33 },
      { userId: carla, share: 33 }
    ]);
    expect(shares.reduce((sum, item) => sum + item.share, 0)).toBe(100);
  });

  it("assigns a zero share when there are more people than cents", () => {
    const shares = computeShares({
      splitType: "equal",
      amount: 1,
      participants: [{ userId: alex }, { userId: bruno }]
    });

    expect(shares).toEqual([
      { userId: alex, share: 1 },
      { userId: bruno, share: 0 }
    ]);
  });

  it("splits with a single participant", () => {
    const shares = computeShares({
      splitType: "equal",
      amount: 999,
      participants: [{ userId: alex }]
    });

    expect(shares).toEqual([{ userId: alex, share: 999 }]);
  });

  it("rejects duplicate participants", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "equal",
          amount: 100,
          participants: [{ userId: alex }, { userId: alex }]
        }),
      "DUPLICATE_PARTICIPANT"
    );
  });

  it("rejects shares provided for an equal split", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "equal",
          amount: 100,
          participants: [{ userId: alex, share: 100 }]
        }),
      "INVALID_SPLIT"
    );
  });
});

describe("computeShares — exact split", () => {
  it("accepts shares that sum to the amount", () => {
    const shares = computeShares({
      splitType: "exact",
      amount: 1000,
      participants: [
        { userId: alex, share: 400 },
        { userId: bruno, share: 300 },
        { userId: carla, share: 200 },
        { userId: david, share: 100 }
      ]
    });

    expect(shares).toEqual([
      { userId: alex, share: 400 },
      { userId: bruno, share: 300 },
      { userId: carla, share: 200 },
      { userId: david, share: 100 }
    ]);
  });

  it("allows zero shares", () => {
    const shares = computeShares({
      splitType: "exact",
      amount: 500,
      participants: [
        { userId: alex, share: 500 },
        { userId: bruno, share: 0 }
      ]
    });

    expect(shares).toEqual([
      { userId: alex, share: 500 },
      { userId: bruno, share: 0 }
    ]);
  });

  it("rejects shares that do not sum to the amount", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "exact",
          amount: 1000,
          participants: [
            { userId: alex, share: 400 },
            { userId: bruno, share: 300 }
          ]
        }),
      "INVALID_SPLIT"
    );
  });

  it("rejects a missing share", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "exact",
          amount: 1000,
          participants: [
            { userId: alex, share: 1000 },
            { userId: bruno }
          ]
        }),
      "INVALID_SPLIT"
    );
  });

  it("rejects duplicate participants", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "exact",
          amount: 100,
          participants: [
            { userId: alex, share: 50 },
            { userId: alex, share: 50 }
          ]
        }),
      "DUPLICATE_PARTICIPANT"
    );
  });
});

describe("computeShares — percentage split", () => {
  it("allocates shares proportionally", () => {
    const shares = computeShares({
      splitType: "percentage",
      amount: 10000,
      participants: [
        { userId: alex, percentage: 50 },
        { userId: bruno, percentage: 30 },
        { userId: carla, percentage: 20 }
      ]
    });

    expect(shares).toEqual([
      { userId: alex, share: 5000 },
      { userId: bruno, share: 3000 },
      { userId: carla, share: 2000 }
    ]);
  });

  it("distributes rounding leftovers by largest remainder", () => {
    const shares = computeShares({
      splitType: "percentage",
      amount: 100,
      participants: [
        { userId: alex, percentage: 33.33 },
        { userId: bruno, percentage: 33.33 },
        { userId: carla, percentage: 33.34 }
      ]
    });

    expect(shares).toEqual([
      { userId: alex, share: 33 },
      { userId: bruno, share: 33 },
      { userId: carla, share: 34 }
    ]);
    expect(shares.reduce((sum, item) => sum + item.share, 0)).toBe(100);
  });

  it("accepts decimal percentages that sum to 100", () => {
    const shares = computeShares({
      splitType: "percentage",
      amount: 1000,
      participants: [
        { userId: alex, percentage: 33.33 },
        { userId: bruno, percentage: 66.67 }
      ]
    });

    expect(shares.reduce((sum, item) => sum + item.share, 0)).toBe(1000);
    expect(shares).toEqual([
      { userId: alex, share: 333 },
      { userId: bruno, share: 667 }
    ]);
  });

  it("rejects percentages that do not sum to 100", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "percentage",
          amount: 1000,
          participants: [
            { userId: alex, percentage: 50 },
            { userId: bruno, percentage: 49.99 }
          ]
        }),
      "INVALID_SPLIT"
    );
  });

  it("rejects percentages with more than two decimals", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "percentage",
          amount: 1000,
          participants: [
            { userId: alex, percentage: 50.005 },
            { userId: bruno, percentage: 49.995 }
          ]
        }),
      "INVALID_SPLIT"
    );
  });

  it("rejects a missing percentage", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "percentage",
          amount: 1000,
          participants: [
            { userId: alex, percentage: 100 },
            { userId: bruno }
          ]
        }),
      "INVALID_SPLIT"
    );
  });

  it("rejects share or weight fields on a percentage split", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "percentage",
          amount: 1000,
          participants: [
            { userId: alex, percentage: 100, share: 1000 }
          ]
        }),
      "INVALID_SPLIT"
    );
  });
});

describe("computeShares — weighted shares split", () => {
  it("allocates shares proportionally to the weights", () => {
    const shares = computeShares({
      splitType: "shares",
      amount: 1000,
      participants: [
        { userId: alex, weight: 2 },
        { userId: bruno, weight: 1 },
        { userId: carla, weight: 1 }
      ]
    });

    expect(shares).toEqual([
      { userId: alex, share: 500 },
      { userId: bruno, share: 250 },
      { userId: carla, share: 250 }
    ]);
  });

  it("distributes rounding leftovers in request order", () => {
    const shares = computeShares({
      splitType: "shares",
      amount: 100,
      participants: [
        { userId: alex, weight: 1 },
        { userId: bruno, weight: 1 },
        { userId: carla, weight: 1 }
      ]
    });

    expect(shares).toEqual([
      { userId: alex, share: 34 },
      { userId: bruno, share: 33 },
      { userId: carla, share: 33 }
    ]);
  });

  it("gives a zero weight a zero share", () => {
    const shares = computeShares({
      splitType: "shares",
      amount: 999,
      participants: [
        { userId: alex, weight: 1 },
        { userId: bruno, weight: 0 }
      ]
    });

    expect(shares).toEqual([
      { userId: alex, share: 999 },
      { userId: bruno, share: 0 }
    ]);
  });

  it("rejects an all-zero weight list", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "shares",
          amount: 999,
          participants: [
            { userId: alex, weight: 0 },
            { userId: bruno, weight: 0 }
          ]
        }),
      "INVALID_SPLIT"
    );
  });

  it("rejects a missing weight", () => {
    expectAppError(
      () =>
        computeShares({
          splitType: "shares",
          amount: 999,
          participants: [
            { userId: alex, weight: 1 },
            { userId: bruno }
          ]
        }),
      "INVALID_SPLIT"
    );
  });
});
