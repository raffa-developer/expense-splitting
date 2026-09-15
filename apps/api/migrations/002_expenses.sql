ALTER TABLE groups
  ADD COLUMN currency text NOT NULL DEFAULT 'EUR',
  ADD CONSTRAINT groups_currency_format CHECK (currency ~ '^[A-Z]{3}$');

CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  description text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  split_type text NOT NULL CHECK (split_type IN ('equal', 'exact')),
  paid_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX expenses_group_id_idx ON expenses (group_id);

CREATE TABLE expense_participants (
  expense_id uuid NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  share bigint NOT NULL CHECK (share >= 0),
  PRIMARY KEY (expense_id, user_id)
);

CREATE INDEX expense_participants_user_id_idx ON expense_participants (user_id);
