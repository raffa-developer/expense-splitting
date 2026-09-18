# Mesa — Full Frontend Redesign

Date: 2026-09-18
Status: approved for specification
Direction chosen: **C — Mesa** (from three mockups: Ledger, Split, Mesa)

## Purpose

Replace the current cool, clinical visual identity across the whole web app with a warm, social one that still keeps money precise and readable. Structure, routes, flows, and backend behaviour stay as they are; every user-facing surface is rebuilt with the new language.

The name "Mesa" is internal shorthand for the direction, not user-facing copy.

## Direction

Warm canvas, calm structure, colour as information. The app should read as a shared table among friends, not a bank. The identity rests on three things: warm sand surfaces with a pine anchor, people-first composition (larger avatars, person colours that recur in charts and splits), and rounded, soft geometry.

Rejected on purpose: the current steel-blue clinical palette; cream + serif + terracotta; gradient washes; identical SaaS cards with one shadow; neon on black; eyebrow labels and numbered markers.

## 1. Tokens

All tokens live as CSS variables in `apps/web/src/index.css` and are exposed through `@theme inline` exactly as today. `--radius` becomes `0.875rem` (14px).

### Light

| Token | Value |
|---|---|
| `--background` | `#F6F1EA` sand |
| `--foreground` | `#241F1C` espresso |
| `--card` / `--popover` | `#FFFFFF` |
| `--primary` | `#1E5B4F` pine |
| `--primary-foreground` | `#F4EFE8` |
| `--secondary` | `#ECE4DA` |
| `--secondary-foreground` | `#3A342F` |
| `--muted` | `#EEE7DE` |
| `--muted-foreground` | `#7C746B` |
| `--accent` | `#FFE4D6` |
| `--accent-foreground` | `#8A3A12` |
| `--destructive` | `#C0503C` |
| `--destructive-foreground` | `#FFF3EE` |
| `--border` / `--input` | `#E4DACF` |
| `--ring` | `#1E5B4F` |
| `--positive` | `#1F7A6F` |
| `--negative` | `#C0503C` |
| `--chart-1` teal | `#2A9D8F` |
| `--chart-2` apricot | `#FF8C5A` |
| `--chart-3` butter | `#E9C46A` |
| `--chart-4` plum | `#7A5AF8` |
| `--chart-5` brick | `#C0503C` |
| `--sidebar` | `#1E5B4F` |
| `--sidebar-foreground` | `#F2EDE6` |
| `--sidebar-primary` | `#FF8C5A` |
| `--sidebar-primary-foreground` | `#3A1607` |
| `--sidebar-accent` | `rgba(255,255,255,.12)` |
| `--sidebar-accent-foreground` | `#FFFFFF` |
| `--sidebar-border` | `rgba(255,255,255,.14)` |
| `--sidebar-ring` | `#FF9E72` |
| `--sidebar-positive` | `#9FE0C8` |
| `--sidebar-negative` | `#FFB59A` |

`--positive` is deliberately darker than `--chart-1` so money text passes contrast at small sizes; teal fills keep the full saturation.

### Dark

| Token | Value |
|---|---|
| `--background` | `#171310` ember |
| `--foreground` | `#F0EAE2` |
| `--card` | `#211B17` |
| `--popover` | `#241E19` |
| `--primary` | `#6FBFAA` |
| `--primary-foreground` | `#08201A` |
| `--secondary` | `#2B241E` |
| `--secondary-foreground` | `#EDE6DC` |
| `--muted` | `#251F1A` |
| `--muted-foreground` | `#A79C90` |
| `--accent` | `#3A2A20` |
| `--accent-foreground` | `#FFC6A8` |
| `--destructive` | `#E58270` |
| `--destructive-foreground` | `#2A0E07` |
| `--border` | `#332B24` |
| `--input` | `#3A322A` |
| `--ring` | `#6FBFAA` |
| `--positive` | `#4FBFAE` |
| `--negative` | `#E58270` |
| `--chart-1` | `#4FBFAE` |
| `--chart-2` | `#FFA07A` |
| `--chart-3` | `#E9C46A` |
| `--chart-4` | `#A78BFA` |
| `--chart-5` | `#E58270` |
| `--sidebar` | `#120F0D` |
| `--sidebar-foreground` | `#EDE7DF` |
| `--sidebar-primary` | `#FF9E72` |
| `--sidebar-primary-foreground` | `#2A1206` |
| `--sidebar-accent` | `rgba(255,255,255,.08)` |
| `--sidebar-accent-foreground` | `#FFFFFF` |
| `--sidebar-border` | `#2A231D` |
| `--sidebar-ring` | `#FF9E72` |
| `--sidebar-positive` | `#8FDCC4` |
| `--sidebar-negative` | `#FFAF94` |

### Shadows and geometry

- `--shadow-soft` (light): `0 12px 34px rgba(36,31,28,.07)`
- `--shadow-soft` (dark): `0 14px 34px rgba(0,0,0,.35)`
- Radii: controls 12–14, cards 18, hero panels and dialogs 24, pills 999, person and group avatars full circles.
- Separation comes from tint and soft shadow, not hairline borders. Borders remain only where they carry state (inputs, selected pills).

## 2. Typography

| Role | Family | Weights | Notes |
|---|---|---|---|
| Display, hero money, headings | Gabarito | 600–800 | `tracking -0.02em`; hero 56–72px |
| Interface, body | Karla | 400–700 | 15px base, 1.5 line height |
| Data, small money, chips | DM Mono | 400/500 | tabular figures |

Packages: add `@fontsource-variable/gabarito`, `@fontsource-variable/karla`, `@fontsource/dm-mono`; remove `@fontsource-variable/schibsted-grotesk`, `@fontsource-variable/instrument-sans`, `@fontsource/ibm-plex-mono`.

Resolved at build time: Gabarito has no tabular figures, so hero money is set in Gabarito (as the mockup shows) and the hero does not count up — numbers fade and rise instead, so changing digit widths never jitter. DM Mono remains for tables, chips, lists and data labels. The group-detail hero uses the same display treatment.

## 3. Component language

- **Buttons:** pine solid for primary; apricot reserved for celebration/status; ghost buttons with warm tint hover; press scale 0.98. Radius 14.
- **Cards:** white on sand, 18 radius, `--shadow-soft`, padding 20–28. The soft shadow marks elevation, so it belongs to hero cards, cards and overlays only; list rows sit flat on their container. The pine sidebar is the only large dark surface; hero cards stay white with the pine balance.
- **Inputs/selects/checkbox:** warm line, white fill, pine ring, radius 12.
- **Tabs:** pill container in `--muted`, active pill white with soft shadow.
- **Dialogs/sheets:** 24 radius, warm shadow, spring entry.
- **Badges/pills:** semantic tints only (apricot = owing, teal = owed, sand = neutral).
- **Money:** `.money` class kept but switched to DM Mono; semantics teal/brick; amounts right-aligned in lists and pill-backed in cards. Sidebar amounts use `--sidebar-positive`/`--sidebar-negative`.

## 4. Person colours

`lib/avatar.ts` derives avatar hues from the chart tokens. In Mesa the derivation stays but the palette changes, so each person keeps a consistent warm-coded colour across avatars, balance bars, split segments and charts.

## 5. Screens

All existing routes and flows stay. Copy is preserved except where noted; every string remains in en and pt-PT.

- **Login / register:** split panel. Pine brand panel with the wordmark and one direct line on the left; form on sand at the right, stacked on mobile. Remove `auth-glow`.
- **Shell:** pine sidebar with rounded nav pills, group list using sidebar-aware amount colours, account chip at the bottom; mobile keeps the top bar and sheet, rethemed.
- **Dashboard:** greeting and a pine "Nova despesa" action; white hero panel with the Gabarito balance, teal/brick chips, avatar cluster, and the diverging balance bar recoloured to teal/brick; groups as soft cards with amount pills; groups caption and mixed-currency handling kept.
- **Groups:** group list as soft cards with squircle marks; new-group dialog rethemed.
- **Group detail:** overview hero mirrors the dashboard language; settle-up becomes friendlier transfer rows with a clear success state; expenses grouped by date in a white card; people tab gets the re-themed paid-vs-share chart, balances table and members card; the money-flow graph is recoloured to the warm palette.
- **Empty / loading / error:** warm skeletons, friendly empty states with the existing copy, destructive confirmations in brick.

## 6. Motion

Add `motion` v13; keep `tw-animate-css` for Radix primitives with retuned easing (`cubic-bezier(.2,1,.2,1)`).

- Route transitions: 180ms fade with 6px rise on the main content only.
- Dashboard/group hero: the one orchestrated moment per screen — the hero amount fades and rises, then the avatar cluster and chips settle in one sequence.
- Overlays: spring entry/exit via Radix + motion.
- Settle-up: transfer row morphs into its confirmed state.
- No per-card entrance staggers; lists appear with their page.
- `prefers-reduced-motion`: transforms removed, opacity-only or instant.

## 7. Implementation surface

- `index.css`: tokens, fonts, shadows, motion utilities.
- `components/ui/*`: button, card, dialog, dropdown-menu, input, label, select, sheet, tabs, table, badge, alert, checkbox, skeleton, sonner, tooltip.
- Shell and identity: `app-shell.tsx`, `auth-shell.tsx`, `logo.tsx`.
- Pages: `DashboardPage`, `GroupsPage`, `GroupPage`, `LoginPage`.
- Feature components: `net-value`, `animated-money`, `balances-card`, `members-card`, `expenses-card`, `settle-up-card`, `expense-dialog`, `batch-expense-dialog`, `delete-group-dialog`, `paid-vs-share-chart`, `money-flow-graph`.
- `lib/avatar.ts`, `lib/chart-theme.ts`, `lib/i18n.tsx` (only if copy needs alignment), `package.json`.

No API, schema, migration, or route changes. No new features.

## 8. Verification

1. `npm run typecheck`
2. `npm run build -w @expense-splitting/web`
3. `docker compose up -d --build web --wait`
4. Playwright pass against `http://localhost:8080` (and 5173 only for development): login, dashboard, groups, group overview/expenses/people, open each dialog, settle-up flow; light and dark; desktop 1440 and mobile 390; en and pt-PT.
5. Confirm reduced-motion rendering and keyboard focus visibility on primary flows.
