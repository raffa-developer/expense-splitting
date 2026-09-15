# Expense Splitting Engine

An expense settlement engine that calculates participant balances and generates optimized debt settlements while maintaining transactional consistency.

Modeled as a lightweight Splitwise-style app: users create groups, record expenses with several split strategies, and the engine computes who owes whom — minimizing the number of transfers needed to settle up.

## Features

- Groups with members and a per-group currency; money stored as integer minor units (`€10.50` → `1050`)
- Expenses with four split types: **equal**, **exact**, **percentage**, and weighted **shares** — all validated server-side with exact rounding (no lost cents)
- Balance engine: `balance = paid − owed + settled`, maintained transactionally on every write
- Settlement optimizer: heap-based largest-debtor/largest-creditor matching (≤ N−1 transfers)
- Settlement tracking: record payments, full history, remaining balances, "mark as paid" flow, and undo
- JWT authentication with scrypt password hashing; membership-enforced authorization
- Idempotency keys for money-mutating requests (expenses, settlements, registration, group/member creation)
- Paginated expense listing; user lookup by email
- OpenAPI 3.0 docs (Swagger UI), structured JSON logs with request ids, rate limiting, consistent error envelope

## Architecture

```text
apps/web (React + Vite)
        │  /api proxy
        ▼
apps/api (Fastify + TypeScript)
        │
        ├── domain/     split allocation, settlement optimization (pure, unit-tested)
        ├── services/   balances (maintained), group lookup/authorization
        ├── routes/     REST endpoints (JSON-schema validated)
        └── plugins/    auth (JWT), idempotency
        ▼
PostgreSQL
        │
        ▼
calculated balances + optimized settlements
```

## Quickstart

Requires Node 24+, Docker, and npm.

```bash
npm install
npm run stack:up      # Postgres + API + web app in Docker
npm run seed          # optional: demo users, group, expenses, and a payment
```

- Web app: <http://localhost:8080>
- API: <http://localhost:3000>, Swagger UI at <http://localhost:3000/docs>

Or run the API and web locally against the Dockerized database:

```bash
npm run db:up         # Postgres on localhost:5433
npm run migrate
npm run dev           # Fastify API on http://localhost:3000
npm run dev:web       # React app on http://localhost:5173
```

- Health check: <http://localhost:3000/health>

## Repository layout

```text
apps/api
  migrations/            raw SQL migrations (001 … 007)
  src/domain/            pure logic: split allocation, settlement optimizer
  src/services/          balances (maintained + recompute), groups
  src/routes/            auth, users, groups, expenses, balances, settlements
  src/plugins/           auth (JWT), idempotency
  bench/                 benchmark harness
  scripts/               demo seed script
  test/                  Vitest integration + unit tests
apps/web
  src/pages/             login, group list, group detail
  src/components/        add expense form, settlement panel
  src/api.ts             typed API client
  nginx.conf             SPA + API proxy config for the container image
docker-compose.yml       Postgres + API + web
```

## API overview

All routes except `/health`, `/docs`, and `/api/auth/register|login` require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create account, returns user + token |
| POST | `/api/auth/login` | Log in, returns user + token |
| GET | `/api/auth/me` | Current user |
| GET | `/api/users?email=` | Search users by email (for adding members) |
| POST / GET | `/api/groups` | Create / list your groups |
| GET / DELETE | `/api/groups/:id` | Group with members / delete group |
| POST / DELETE | `/api/groups/:id/members[/:userId]` | Add / remove members |
| POST / GET | `/api/groups/:id/expenses` | Create expense / list expenses (paginated: `limit`, `offset`) |
| GET / DELETE | `/api/groups/:id/expenses/:expenseId` | Expense detail / delete |
| GET | `/api/groups/:id/balances` | Per-member paid, owed, settled, balance |
| GET | `/api/groups/:id/settlement` | Suggested minimal transfers |
| POST / GET | `/api/groups/:id/settlements` | Record a payment / payment history |
| DELETE | `/api/groups/:id/settlements/:settlementId` | Undo a recorded payment |

Errors use a consistent envelope: `{ "error": { "code", "message", "request_id" } }`.
`POST /api/auth/register`, `POST /api/groups`, `POST .../members`, `POST .../expenses`, and `POST .../settlements`
accept an `Idempotency-Key` header; replays return the original response.

## Testing

```bash
npm run typecheck   # both workspaces
npm test            # 163 API tests (unit + integration against real Postgres)
```

Unit tests cover the split allocator and settlement optimizer edge cases (rounding, ties, zero balances). Integration tests exercise every endpoint against a real database, including idempotency replays, authorization rules, balance invariants, and transactional consistency (`maintained balances === full recomputation`).

## Benchmarks

```bash
npm run bench       # creates a dedicated expense_splitter_bench database
```

Measured on a local machine (Node 24, Postgres 17 in Docker):

| users | expenses | participant rows | maintained read | recompute | naive in-memory |
| --- | --- | --- | --- | --- | --- |
| 10 | 100 | 400 | 1.6 ms · 1 query | 3.2 ms | 3.4 ms · 2 queries · 500 rows |
| 50 | 1,000 | 4,000 | 1.0 ms · 1 query | 6.4 ms | 9.5 ms |
| 1,000 | 100,000 | 400,000 | 4.8 ms · 1 query | 851.5 ms | 610.2 ms · 500,000 rows |

Settlement optimization at 1,000 participants: **17 ms → 1.9 ms** after replacing repeated sorting with binary heaps.

The harness verifies all three balance strategies agree before timing, so the numbers are apples-to-apples.

## Design notes

- **Money as integers.** All amounts are integer minor units; split allocation uses BigInt largest-remainder distribution so shares always sum exactly to the expense amount.
- **Maintained balances.** `group_balances` is updated in the same transaction as expense create/delete and settlement recording, so reads are a single indexed query regardless of history size. A recompute path exists for verification and is asserted equal to maintained state in tests.
- **Idempotency.** Keys are scoped and request-hashed; replays return the stored response, reused keys with different bodies return 422, and failed requests release the key.
- **Transactions everywhere it matters.** Expense + participants + balances, settlement + balances, group create + membership all commit or roll back atomically.
- **Settlement optimizer.** Deterministic heap-based max matching — each transfer zeroes at least one side, producing at most N−1 transfers with stable tie-breaking.

## Environment variables

See `apps/api/.env.example`. Highlights:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` / `TEST_DATABASE_URL` | Postgres connections |
| `JWT_SECRET` | Required when `NODE_ENV=production` (fail-fast) |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `CORS_ORIGINS` | Comma-separated allowlist; unset reflects any origin (dev) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_TIME_WINDOW` | Global rate limit; auth endpoints are stricter |
| `LOG_LEVEL` | pino log level |

## Scripts

| Command | Description |
| --- | --- |
| `npm run stack:up` / `stack:down` | Docker Postgres + API + web |
| `npm run db:up` / `db:down` | Docker Postgres only |
| `npm run migrate` | Apply SQL migrations |
| `npm run seed` | Seed demo users, group, expenses, settlement (API must be running) |
| `npm run dev` / `dev:web` | API / web dev servers |
| `npm run build` | Build API (tsc) and web (vite) |
| `npm test` / `npm run bench` / `npm run typecheck` | Quality gates |
