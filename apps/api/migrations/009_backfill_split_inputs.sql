-- Backfill split inputs for expenses created before migration 008.
-- Shares are the source of truth; these derivations reproduce them exactly.

-- Weighted shares: the allocated share is already proportional to the weight,
-- so it round-trips unchanged.
UPDATE expense_participants ep
SET weight = ep.share
FROM expenses e
WHERE e.id = ep.expense_id
  AND e.split_type = 'shares'
  AND ep.weight IS NULL;

-- Percentages: derive basis points from the allocated share, then give the
-- rounding deficit to the participants with the largest remainders so the
-- percentages sum to exactly 10000.
WITH raw AS (
  SELECT
    ep.expense_id,
    ep.user_id,
    (ep.share * 10000) / e.amount AS basis_points,
    (ep.share * 10000) % e.amount AS remainder
  FROM expense_participants ep
  JOIN expenses e ON e.id = ep.expense_id
  WHERE e.split_type = 'percentage'
    AND ep.percentage IS NULL
),
totals AS (
  SELECT expense_id, SUM(basis_points) AS total
  FROM raw
  GROUP BY expense_id
),
ranked AS (
  SELECT
    raw.expense_id,
    raw.user_id,
    raw.basis_points,
    totals.total,
    ROW_NUMBER() OVER (
      PARTITION BY raw.expense_id
      ORDER BY raw.remainder DESC, raw.user_id
    ) AS rank
  FROM raw
  JOIN totals ON totals.expense_id = raw.expense_id
)
UPDATE expense_participants ep
SET percentage = (
  ranked.basis_points
  + CASE WHEN ranked.rank <= (10000 - ranked.total) THEN 1 ELSE 0 END
)::numeric / 100
FROM ranked
WHERE ep.expense_id = ranked.expense_id
  AND ep.user_id = ranked.user_id;
