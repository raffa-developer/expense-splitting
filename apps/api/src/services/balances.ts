import type { Pool } from "pg";

export interface MemberBalance {
  user_id: string;
  name: string;
  paid: number;
  owed: number;
  settled: number;
  balance: number;
}

export interface GroupBalances {
  total: number;
  balances: MemberBalance[];
}

const maintainedQuery = `
  SELECT gb.user_id,
         u.name,
         gb.paid,
         gb.owed,
         gb.settled,
         (gb.paid - gb.owed + gb.settled)::bigint AS balance
  FROM group_balances gb
  JOIN users u ON u.id = gb.user_id
  WHERE gb.group_id = $1
  ORDER BY balance DESC, u.name, gb.user_id
`;

const recomputeQuery = `
  WITH members AS (
    SELECT user_id FROM group_members WHERE group_id = $1
    UNION
    SELECT DISTINCT paid_by FROM expenses WHERE group_id = $1
    UNION
    SELECT DISTINCT ep.user_id
    FROM expense_participants ep
    JOIN expenses e ON e.id = ep.expense_id
    WHERE e.group_id = $1
    UNION
    SELECT DISTINCT from_user FROM settlements WHERE group_id = $1
    UNION
    SELECT DISTINCT to_user FROM settlements WHERE group_id = $1
  ),
  paid AS (
    SELECT paid_by AS user_id, SUM(amount)::bigint AS amount
    FROM expenses
    WHERE group_id = $1
    GROUP BY paid_by
  ),
  owed AS (
    SELECT ep.user_id, SUM(ep.share)::bigint AS amount
    FROM expense_participants ep
    JOIN expenses e ON e.id = ep.expense_id
    WHERE e.group_id = $1
    GROUP BY ep.user_id
  ),
  sent AS (
    SELECT from_user AS user_id, SUM(amount)::bigint AS amount
    FROM settlements
    WHERE group_id = $1
    GROUP BY from_user
  ),
  received AS (
    SELECT to_user AS user_id, SUM(amount)::bigint AS amount
    FROM settlements
    WHERE group_id = $1
    GROUP BY to_user
  )
  SELECT m.user_id,
         u.name,
         COALESCE(p.amount, 0)::bigint AS paid,
         COALESCE(o.amount, 0)::bigint AS owed,
         (COALESCE(s.amount, 0) - COALESCE(r.amount, 0))::bigint AS settled,
         (COALESCE(p.amount, 0) - COALESCE(o.amount, 0)
            + COALESCE(s.amount, 0) - COALESCE(r.amount, 0))::bigint AS balance
  FROM members m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN paid p ON p.user_id = m.user_id
  LEFT JOIN owed o ON o.user_id = m.user_id
  LEFT JOIN sent s ON s.user_id = m.user_id
  LEFT JOIN received r ON r.user_id = m.user_id
  ORDER BY balance DESC, u.name, m.user_id
`;

const rebuildQuery = `
  WITH members AS (
    SELECT user_id FROM group_members WHERE group_id = $1
    UNION
    SELECT DISTINCT paid_by FROM expenses WHERE group_id = $1
    UNION
    SELECT DISTINCT ep.user_id
    FROM expense_participants ep
    JOIN expenses e ON e.id = ep.expense_id
    WHERE e.group_id = $1
    UNION
    SELECT DISTINCT from_user FROM settlements WHERE group_id = $1
    UNION
    SELECT DISTINCT to_user FROM settlements WHERE group_id = $1
  ),
  paid AS (
    SELECT paid_by AS user_id, SUM(amount)::bigint AS amount
    FROM expenses
    WHERE group_id = $1
    GROUP BY paid_by
  ),
  owed AS (
    SELECT ep.user_id, SUM(ep.share)::bigint AS amount
    FROM expense_participants ep
    JOIN expenses e ON e.id = ep.expense_id
    WHERE e.group_id = $1
    GROUP BY ep.user_id
  ),
  sent AS (
    SELECT from_user AS user_id, SUM(amount)::bigint AS amount
    FROM settlements
    WHERE group_id = $1
    GROUP BY from_user
  ),
  received AS (
    SELECT to_user AS user_id, SUM(amount)::bigint AS amount
    FROM settlements
    WHERE group_id = $1
    GROUP BY to_user
  )
  INSERT INTO group_balances (group_id, user_id, paid, owed, settled)
  SELECT $1,
         m.user_id,
         COALESCE(p.amount, 0)::bigint,
         COALESCE(o.amount, 0)::bigint,
         (COALESCE(s.amount, 0) - COALESCE(r.amount, 0))::bigint
  FROM members m
  LEFT JOIN paid p ON p.user_id = m.user_id
  LEFT JOIN owed o ON o.user_id = m.user_id
  LEFT JOIN sent s ON s.user_id = m.user_id
  LEFT JOIN received r ON r.user_id = m.user_id
  ON CONFLICT (group_id, user_id) DO UPDATE
  SET paid = EXCLUDED.paid,
      owed = EXCLUDED.owed,
      settled = EXCLUDED.settled
`;

function assertBalanced(groupId: string, balances: MemberBalance[]): void {
  const balanceSum = balances.reduce((sum, row) => sum + row.balance, 0);
  if (balanceSum !== 0) {
    throw new Error(
      `Balance invariant violated for group ${groupId}: balances sum to ${balanceSum}`
    );
  }
}

export async function getGroupBalances(
  pool: Pool,
  groupId: string
): Promise<GroupBalances> {
  const { rows } = await pool.query<MemberBalance>(maintainedQuery, [groupId]);
  assertBalanced(groupId, rows);

  const total = rows.reduce((sum, row) => sum + row.paid, 0);
  return { total, balances: rows };
}

export async function recomputeGroupBalances(
  pool: Pool,
  groupId: string
): Promise<GroupBalances> {
  const { rows } = await pool.query<MemberBalance>(recomputeQuery, [groupId]);
  assertBalanced(groupId, rows);

  const total = rows.reduce((sum, row) => sum + row.paid, 0);
  return { total, balances: rows };
}

export async function rebuildGroupBalances(
  pool: Pool,
  groupId: string
): Promise<void> {
  await pool.query(rebuildQuery, [groupId]);
}
