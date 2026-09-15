CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  scope text NOT NULL,
  request_hash text NOT NULL,
  status_code int NOT NULL DEFAULT 0,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idempotency_keys_created_at_idx ON idempotency_keys (created_at);
