ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_split_type_check;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_split_type_check
  CHECK (split_type IN ('equal', 'exact', 'percentage', 'shares'));
