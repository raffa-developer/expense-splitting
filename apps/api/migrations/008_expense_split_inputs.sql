ALTER TABLE expense_participants
  ADD COLUMN percentage numeric(7, 2),
  ADD COLUMN weight bigint;

ALTER TABLE expense_participants
  ADD CONSTRAINT expense_participants_percentage_check
    CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  ADD CONSTRAINT expense_participants_weight_check
    CHECK (weight IS NULL OR weight >= 0);
