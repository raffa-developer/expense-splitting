# AGENTS.md

Expense splitting engine. npm-workspaces monorepo: `apps/api` (Fastify + TypeScript + raw `pg` SQL) and `apps/web` (React 19 + Vite + Tailwind v4 + shadcn/ui). Postgres 17 via Docker.

Deeper background lives in `README.md` and the original brief `expense-splitting-engine-project.md`.

## Commands

- Postgres for dev/tests: `npm run db:up` — exposed on host port **5433** (5432 is usually taken); the test DB `expense_splitter_test` is created by `docker/initdb` on first volume start.
- Migrations are plain SQL in `apps/api/migrations`; apply with `npm run migrate` (custom runner). The Docker API container runs `dist/db/migrate.js` before boot, so compose environments migrate themselves.
- Full stack: `npm run stack:up` → web :8080, API :3000, Swagger at `/docs`. Local dev: `npm run dev` + `npm run dev:web` (Vite :5173 proxies `/api` and `/health` to :3000).
- `npm test` runs **API tests only** and needs Postgres up. Single file: `npm run test -w @expense-splitting/api -- test/groups.test.ts`; single test: append `-t "creates a group"`.
- Web has no unit tests — verify with `npm run typecheck` and `npm run build`.
- `npm run bench` (own `expense_splitter_bench` DB) and `npm run demo -w @expense-splitting/api -- <account-email>` (writes demo groups straight to the DB) are runnable checks, not just docs.
- No lint/format tooling exists. Verification order: `npm run typecheck` → `npm test` → `npm run build` when both apps are touched.

## Invariants that are easy to break

- Money is integer minor units (`12000` = €120.00). Splits allocate with BigInt largest-remainder so shares always sum exactly (`src/domain/splits.ts`). Never introduce floats.
- `group_balances` is **maintained, not derived**: every money-changing write — expense create/delete, settlement record/delete, group create, member add/remove — must update it inside the same transaction (pattern: `insertExpense` in `src/services/expenses.ts`). `getGroupBalances` asserts Σ balance = 0, and tests assert maintained state equals `recomputeGroupBalances`.
- Expense + participants + balance writes are one transaction; don't split them into separate queries.
- `src/domain/settlement.ts` is a deterministic heap matcher; unit tests assert exact transfer output, so preserve tie-breaking.

## API conventions

- Throw `AppError(statusCode, code, message)`; the handler emits `{ error: { code, message, request_id } }`. Tests assert `error.code` — keep codes stable.
- Fastify JSON-schema validation runs with `removeAdditional: false`: unknown body fields are rejected (400).
- Idempotency is opt-in per route via `config: { idempotency: true }`; new money-mutating POSTs should use it.
- Tests build the app with `rateLimit: false` and truncate tables per test via `test/helpers.ts`; only register/login/health/docs are public.

## Web conventions

- Tailwind v4 (no `tailwind.config`) — theme tokens are CSS variables in `src/index.css`; add colors/fonts there, not as ad-hoc classes.
- shadcn components are vendored in `src/components/ui` (new-york/zinc); import through the `@/` alias.
- Every user-visible string must exist in **both** `en` and `pt-PT` in `src/lib/i18n.tsx` — the types enforce parity, so a missing key fails typecheck.
- Charts are recharts, lazy-loaded, and must not use recharts' default tooltip (breaks dark mode). Use the custom tooltip components (`value-tooltip.tsx`, tooltip inside `paid-vs-share-chart.tsx`).
- `formatMoney` formats with a module-level locale set by `I18nProvider`; don't call `Intl` directly for money.

## Toolchain quirks

- TypeScript 7 in both workspaces: `baseUrl` was removed — `paths` are relative to the tsconfig file.
- `noUncheckedIndexedAccess` is enabled: guard array/index access.
- CI (`.github/workflows/ci.yml`) runs npm ci → typecheck → build → tests against a Postgres 17 service; there `TEST_DATABASE_URL` points at `localhost:5432`, while locally it must use the Docker port 5433.
