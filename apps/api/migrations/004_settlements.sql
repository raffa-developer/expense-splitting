CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  from_user uuid NOT NULL REFERENCES users (id),
  to_user uuid NOT NULL REFERENCES users (id),
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlements_distinct_users CHECK (from_user <> to_user)
);

CREATE INDEX settlements_group_id_idx ON settlements (group_id);
