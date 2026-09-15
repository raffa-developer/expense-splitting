CREATE TABLE group_balances (
  group_id uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  paid bigint NOT NULL DEFAULT 0 CHECK (paid >= 0),
  owed bigint NOT NULL DEFAULT 0 CHECK (owed >= 0),
  settled bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, user_id)
);

WITH members AS (
  SELECT group_id, user_id FROM group_members
  UNION
  SELECT group_id, paid_by FROM expenses
  UNION
  SELECT e.group_id, ep.user_id
  FROM expense_participants ep
  JOIN expenses e ON e.id = ep.expense_id
  UNION
  SELECT group_id, from_user FROM settlements
  UNION
  SELECT group_id, to_user FROM settlements
),
paid AS (
  SELECT group_id, paid_by AS user_id, SUM(amount)::bigint AS amount
  FROM expenses
  GROUP BY group_id, paid_by
),
owed AS (
  SELECT e.group_id, ep.user_id, SUM(ep.share)::bigint AS amount
  FROM expense_participants ep
  JOIN expenses e ON e.id = ep.expense_id
  GROUP BY e.group_id, ep.user_id
),
sent AS (
  SELECT group_id, from_user AS user_id, SUM(amount)::bigint AS amount
  FROM settlements
  GROUP BY group_id, from_user
),
received AS (
  SELECT group_id, to_user AS user_id, SUM(amount)::bigint AS amount
  FROM settlements
  GROUP BY group_id, to_user
)
INSERT INTO group_balances (group_id, user_id, paid, owed, settled)
SELECT m.group_id,
       m.user_id,
       COALESCE(p.amount, 0)::bigint,
       COALESCE(o.amount, 0)::bigint,
       (COALESCE(s.amount, 0) - COALESCE(r.amount, 0))::bigint
FROM members m
LEFT JOIN paid p ON p.group_id = m.group_id AND p.user_id = m.user_id
LEFT JOIN owed o ON o.group_id = m.group_id AND o.user_id = m.user_id
LEFT JOIN sent s ON s.group_id = m.group_id AND s.user_id = m.user_id
LEFT JOIN received r ON r.group_id = m.group_id AND r.user_id = m.user_id;
