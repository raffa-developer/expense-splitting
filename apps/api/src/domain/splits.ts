import { AppError } from "../errors.js";

export type SplitType = "equal" | "exact" | "percentage" | "shares";

export interface ParticipantInput {
  userId: string;
  share?: number | undefined;
  percentage?: number | undefined;
  weight?: number | undefined;
}

export interface ExpenseShare {
  userId: string;
  share: number;
}

export interface ComputeSharesInput {
  splitType: SplitType;
  amount: number;
  participants: ParticipantInput[];
}

type SplitField = "share" | "percentage" | "weight";

function assertNoDuplicates(participants: ParticipantInput[]): void {
  const seen = new Set<string>();
  for (const participant of participants) {
    if (seen.has(participant.userId)) {
      throw new AppError(
        400,
        "DUPLICATE_PARTICIPANT",
        `Participant ${participant.userId} appears more than once`
      );
    }
    seen.add(participant.userId);
  }
}

function rejectProvidedFields(
  participants: ParticipantInput[],
  fields: SplitField[],
  splitType: SplitType
): void {
  for (const participant of participants) {
    for (const field of fields) {
      if (participant[field] !== undefined) {
        throw new AppError(
          400,
          "INVALID_SPLIT",
          `${field} must not be provided for ${splitType} splits`
        );
      }
    }
  }
}

function allocateByWeights(amount: number, weights: number[]): number[] {
  const amountBig = BigInt(amount);
  const weightBigs = weights.map((weight) => BigInt(weight));
  const totalWeight = weightBigs.reduce((sum, weight) => sum + weight, 0n);

  if (totalWeight <= 0n) {
    throw new AppError(
      400,
      "INVALID_SPLIT",
      "The total weight must be greater than zero"
    );
  }

  const bases: bigint[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];
  let allocated = 0n;

  weightBigs.forEach((weight, index) => {
    const product = amountBig * weight;
    const base = product / totalWeight;
    bases.push(base);
    remainders.push({ index, remainder: product % totalWeight });
    allocated += base;
  });

  const shares = bases.map((base) => Number(base));
  const leftover = Number(amountBig - allocated);

  remainders.sort((a, b) => {
    if (a.remainder !== b.remainder) {
      return a.remainder > b.remainder ? -1 : 1;
    }
    return a.index - b.index;
  });

  for (let extra = 0; extra < leftover; extra++) {
    const entry = remainders[extra];
    if (!entry) {
      break;
    }
    const current = shares[entry.index];
    if (current === undefined) {
      continue;
    }
    shares[entry.index] = current + 1;
  }

  return shares;
}

function toBasisPoints(percentage: number, userId: string): number {
  const scaled = percentage * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new AppError(
      400,
      "INVALID_SPLIT",
      `The percentage for participant ${userId} must have at most two decimal places`
    );
  }
  return rounded;
}

function zipShares(
  participants: ParticipantInput[],
  shares: number[]
): ExpenseShare[] {
  return participants.map((participant, index) => ({
    userId: participant.userId,
    share: shares[index] ?? 0
  }));
}

export function computeShares(input: ComputeSharesInput): ExpenseShare[] {
  assertNoDuplicates(input.participants);

  switch (input.splitType) {
    case "equal": {
      rejectProvidedFields(
        input.participants,
        ["share", "percentage", "weight"],
        "equal"
      );
      const shares = allocateByWeights(
        input.amount,
        input.participants.map(() => 1)
      );
      return zipShares(input.participants, shares);
    }

    case "exact": {
      rejectProvidedFields(input.participants, ["percentage", "weight"], "exact");

      const shares = input.participants.map((participant) => {
        if (participant.share === undefined) {
          throw new AppError(
            400,
            "INVALID_SPLIT",
            `An exact share is required for participant ${participant.userId}`
          );
        }
        return participant.share;
      });

      const total = shares.reduce((sum, share) => sum + share, 0);
      if (total !== input.amount) {
        throw new AppError(
          400,
          "INVALID_SPLIT",
          `Exact shares must sum to ${input.amount} but sum to ${total}`
        );
      }
      return zipShares(input.participants, shares);
    }

    case "percentage": {
      rejectProvidedFields(input.participants, ["share", "weight"], "percentage");

      const basisPoints = input.participants.map((participant) => {
        if (participant.percentage === undefined) {
          throw new AppError(
            400,
            "INVALID_SPLIT",
            `A percentage is required for participant ${participant.userId}`
          );
        }
        return toBasisPoints(participant.percentage, participant.userId);
      });

      const totalBasisPoints = basisPoints.reduce(
        (sum, basisPoint) => sum + basisPoint,
        0
      );
      if (totalBasisPoints !== 10000) {
        throw new AppError(
          400,
          "INVALID_SPLIT",
          `Percentages must sum to 100 but sum to ${(totalBasisPoints / 100).toFixed(2)}`
        );
      }

      return zipShares(
        input.participants,
        allocateByWeights(input.amount, basisPoints)
      );
    }

    case "shares": {
      rejectProvidedFields(input.participants, ["share", "percentage"], "shares");

      const weights = input.participants.map((participant) => {
        if (participant.weight === undefined) {
          throw new AppError(
            400,
            "INVALID_SPLIT",
            `A weight is required for participant ${participant.userId}`
          );
        }
        return participant.weight;
      });

      return zipShares(
        input.participants,
        allocateByWeights(input.amount, weights)
      );
    }
  }
}
