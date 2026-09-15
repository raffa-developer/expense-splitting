export interface SettlementParticipant {
  userId: string;
  name: string;
  balance: number;
}

export interface SettlementTransaction {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
}

interface Side {
  userId: string;
  name: string;
  amount: number;
}

class MaxHeap {
  private readonly items: Side[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: Side): void {
    const items = this.items;
    items.push(item);

    let index = items.length - 1;
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = items[parentIndex];
      const current = items[index];
      if (!parent || !current || compareByAmountDescThenUserId(current, parent) >= 0) {
        break;
      }
      items[parentIndex] = current;
      items[index] = parent;
      index = parentIndex;
    }
  }

  pop(): Side | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();

    if (!last || items.length === 0) {
      return top;
    }

    items[0] = last;
    let index = 0;
    for (;;) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;

      let swapIndex = index;
      const current = items[index];
      const left = items[leftIndex];
      if (current && left && compareByAmountDescThenUserId(left, current) < 0) {
        swapIndex = leftIndex;
      }

      const candidate = items[swapIndex];
      const right = items[rightIndex];
      if (current && candidate && right && compareByAmountDescThenUserId(right, candidate) < 0) {
        swapIndex = rightIndex;
      }

      if (swapIndex === index) {
        break;
      }

      const a = items[index];
      const b = items[swapIndex];
      if (!a || !b) {
        break;
      }
      items[index] = b;
      items[swapIndex] = a;
      index = swapIndex;
    }

    return top;
  }
}

function compareByAmountDescThenUserId(a: Side, b: Side): number {
  if (a.amount !== b.amount) {
    return b.amount - a.amount;
  }
  if (a.userId < b.userId) {
    return -1;
  }
  if (a.userId > b.userId) {
    return 1;
  }
  return 0;
}

export function computeSettlements(
  participants: SettlementParticipant[]
): SettlementTransaction[] {
  const creditors = new MaxHeap();
  const debtors = new MaxHeap();

  let totalCredits = 0;
  let totalDebts = 0;

  for (const participant of participants) {
    if (participant.balance > 0) {
      creditors.push({
        userId: participant.userId,
        name: participant.name,
        amount: participant.balance
      });
      totalCredits += participant.balance;
    } else if (participant.balance < 0) {
      debtors.push({
        userId: participant.userId,
        name: participant.name,
        amount: -participant.balance
      });
      totalDebts -= participant.balance;
    }
  }

  if (totalCredits !== totalDebts) {
    throw new Error(
      `Cannot settle unbalanced debts: credits ${totalCredits} vs debts ${totalDebts}`
    );
  }

  const transactions: SettlementTransaction[] = [];

  while (creditors.size > 0 && debtors.size > 0) {
    const creditor = creditors.pop();
    const debtor = debtors.pop();
    if (!creditor || !debtor) {
      break;
    }

    const amount = Math.min(creditor.amount, debtor.amount);
    transactions.push({
      fromUserId: debtor.userId,
      fromName: debtor.name,
      toUserId: creditor.userId,
      toName: creditor.name,
      amount
    });

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount > 0) {
      creditors.push(creditor);
    }
    if (debtor.amount > 0) {
      debtors.push(debtor);
    }
  }

  return transactions;
}
