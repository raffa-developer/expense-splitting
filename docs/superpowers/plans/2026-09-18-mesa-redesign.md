# Mesa Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the web app's clinical steel-blue identity with the warm, social Mesa identity across every screen, keeping all routes, flows, data, and locales intact.

**Architecture:** Pure presentation change. New design tokens and fonts in `index.css`, then a sweep through the vendored shadcn primitives, shared components, shell, and pages. `motion` v13 is added for route and overlay animation; Radix + `tw-animate-css` keep handling dialog internals. Person colours derive from the new chart tokens.

**Tech Stack:** React 19, Vite 8, Tailwind v4 (CSS-variable tokens, no config file), shadcn/Radix vendored primitives, `@fontsource` fonts (Gabarito, Karla, DM Mono), `motion` v13, recharts, lucide-react, sonner, react-router-dom v7, next-themes.

**Spec:** `docs/superpowers/specs/2026-09-18-mesa-redesign-design.md`

## Global Constraints

- No API, schema, migration, or route changes. UI only. No new features.
- Every user-visible string must exist in both `en` and `pt-PT` in `src/lib/i18n.tsx`; types enforce parity. Prefer keeping existing copy.
- Tailwind v4: no `tailwind.config`. Theme tokens are CSS variables in `src/index.css`; use them, never ad-hoc hex values in components.
- Imports use the `@/` alias. shadcn components are vendored in `src/components/ui` (new-york/zinc origin) and may be edited directly.
- Money is integer minor units; render with `formatMoney`/`formatSignedMoney` and the `.money` class. Never call `Intl` for money directly.
- `noUncheckedIndexedAccess` is on: guard array/index access.
- Charts: recharts, lazy-loaded, never the default recharts tooltip; keep the custom tooltip components.
- Motion must respect `prefers-reduced-motion`. No transforms when reduced motion is on.
- Radius mapping for the sweep (base `--radius` becomes 14px):
  - controls (button, input, select, dropdown items): `rounded-md` → `rounded-lg`
  - cards and panels: `rounded-lg` → `rounded-xl`
  - dialogs, sheets, hero panels: `rounded-xl`/`rounded-2xl` → `rounded-3xl`
  - checkboxes: `rounded-[4px]` → `rounded-md`
  - pills and avatars: `rounded-full`
- Shadow: `shadow-sm`/`shadow-lg`/custom shadows on surfaces → `shadow-soft` (`--shadow-soft: var(--elevation)`).
- Commands: `npm run typecheck`, `npm run build -w @expense-splitting/web`. Visual iteration runs the Vite dev server on 5173; the only user-facing review target is `http://localhost:8080` after `docker compose up -d --build web --wait`.
- **Do not commit unless the user explicitly asks.** Checkpoints end with verification, not `git commit`.
- Visual harness: `C:\Users\Administrator\AppData\Local\Temp\opencode\mesa-check.py`, created in Task 1 and reused after every visual task.

---

## File Structure

- `apps/web/package.json` — font and motion dependencies.
- `apps/web/src/index.css` — tokens, fonts, base type, shadows.
- `apps/web/src/components/ui/*.tsx` — primitive sweep.
- `apps/web/src/components/logo.tsx`, `app-shell.tsx`, `auth-shell.tsx`, `route-transition.tsx` (new).
- `apps/web/src/App.tsx` — route transition wrapper.
- `apps/web/src/pages/{LoginPage,DashboardPage,GroupsPage,GroupPage}.tsx`.
- `apps/web/src/components/{net-value,animated-money,balances-card,members-card,expenses-card,settle-up-card,expense-dialog,batch-expense-dialog,delete-group-dialog,paid-vs-share-chart,money-flow-graph}.tsx`.
- `apps/web/src/lib/{avatar,chart-theme}.ts` — person colours.
- `apps/web/src/lib/i18n.tsx` — only if a string needs alignment (keep keys).

---

### Task 1: Design foundation — fonts, tokens, base type

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/index.css`
- Create: `C:\Users\Administrator\AppData\Local\Temp\opencode\mesa-check.py`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS variables and `@theme` names every later task uses — `--background`, `--foreground`, `--card`, `--primary`, `--accent`, `--positive`, `--negative`, `--sidebar-positive`, `--sidebar-negative`, `--chart-1..5`, `--shadow-soft` (utility `shadow-soft`), fonts `--font-sans` (Karla), `--font-display` (Gabarito), `--font-mono` (DM Mono), and the `motion` package.

- [ ] **Step 1: Update dependencies**

In `apps/web/package.json`, remove `@fontsource-variable/instrument-sans`, `@fontsource-variable/schibsted-grotesk`, `@fontsource/ibm-plex-mono`; add:

```json
"@fontsource-variable/gabarito": "^5.3.0",
"@fontsource-variable/karla": "^5.3.0",
"@fontsource/dm-mono": "^5.3.0",
"motion": "^13.4.0"
```

Then run `npm install` from the repo root.

- [ ] **Step 2: Replace tokens in `index.css`**

Replace the font imports at the top with:

```css
@import "@fontsource-variable/gabarito";
@import "@fontsource-variable/karla";
@import "@fontsource/dm-mono/400.css";
@import "@fontsource/dm-mono/500.css";
```

Replace the entire `:root` block with (values from the spec):

```css
:root {
  --radius: 0.875rem;
  --elevation: 0 12px 34px rgba(36, 31, 28, 0.07);

  --background: #f6f1ea;
  --foreground: #241f1c;
  --card: #ffffff;
  --card-foreground: #241f1c;
  --popover: #ffffff;
  --popover-foreground: #241f1c;

  --primary: #1e5b4f;
  --primary-foreground: #f4efe8;
  --secondary: #ece4da;
  --secondary-foreground: #3a342f;
  --muted: #eee7de;
  --muted-foreground: #7c746b;
  --accent: #ffe4d6;
  --accent-foreground: #8a3a12;
  --destructive: #c0503c;
  --destructive-foreground: #fff3ee;
  --border: #e4dacf;
  --input: #e4dacf;
  --ring: #1e5b4f;

  --positive: #1f7a6f;
  --negative: #c0503c;

  --chart-1: #2a9d8f;
  --chart-2: #ff8c5a;
  --chart-3: #e9c46a;
  --chart-4: #7a5af8;
  --chart-5: #c0503c;

  --sidebar: #1e5b4f;
  --sidebar-foreground: #f2ede6;
  --sidebar-primary: #ff8c5a;
  --sidebar-primary-foreground: #3a1607;
  --sidebar-accent: rgba(255, 255, 255, 0.12);
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: rgba(255, 255, 255, 0.14);
  --sidebar-ring: #ff9e72;
  --sidebar-positive: #9fe0c8;
  --sidebar-negative: #ffb59a;
}
```

Replace the entire `.dark` block with:

```css
.dark {
  --elevation: 0 14px 34px rgba(0, 0, 0, 0.35);

  --background: #171310;
  --foreground: #f0eae2;
  --card: #211b17;
  --card-foreground: #f0eae2;
  --popover: #241e19;
  --popover-foreground: #f0eae2;

  --primary: #6fbfaa;
  --primary-foreground: #08201a;
  --secondary: #2b241e;
  --secondary-foreground: #ede6dc;
  --muted: #251f1a;
  --muted-foreground: #a79c90;
  --accent: #3a2a20;
  --accent-foreground: #ffc6a8;
  --destructive: #e58270;
  --destructive-foreground: #2a0e07;
  --border: #332b24;
  --input: #3a322a;
  --ring: #6fbfaa;

  --positive: #4fbfae;
  --negative: #e58270;

  --chart-1: #4fbfae;
  --chart-2: #ffa07a;
  --chart-3: #e9c46a;
  --chart-4: #a78bfa;
  --chart-5: #e58270;

  --sidebar: #120f0d;
  --sidebar-foreground: #ede7df;
  --sidebar-primary: #ff9e72;
  --sidebar-primary-foreground: #2a1206;
  --sidebar-accent: rgba(255, 255, 255, 0.08);
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #2a231d;
  --sidebar-ring: #ff9e72;
  --sidebar-positive: #8fdcc4;
  --sidebar-negative: #ffaf94;
}
```

- [ ] **Step 3: Update `@theme inline`**

Change the font tokens to:

```css
--font-sans: "Karla Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
--font-display: "Gabarito Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: "DM Mono", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
```

Add below the existing color mappings:

```css
--color-sidebar-positive: var(--sidebar-positive);
--color-sidebar-negative: var(--sidebar-negative);
--shadow-soft: var(--elevation);
```

- [ ] **Step 4: Base layer and utilities**

In `@layer base`, keep `body { @apply bg-background text-foreground antialiased; }` and the `tnum` feature settings. Keep `h1,h2,h3 { font-family: var(--font-display); letter-spacing: -0.015em; }`. Delete the now-unused `@keyframes rise` and `.animate-rise` utility; keep `.animate-fade`.

- [ ] **Step 5: Create the visual harness**

Create `C:\Users\Administrator\AppData\Local\Temp\opencode\mesa-check.py` with:

```python
import argparse, json, urllib.request
from playwright.sync_api import sync_playwright

DEFAULT_ROUTES = ["/dashboard", "/groups"]

def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request("http://localhost:3000" + path, data=data, method=method)
    if data is not None:
        req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as res:
        text = res.read().decode()
        return json.loads(text) if text else None

def sign_in(page, base):
    page.goto(base)
    page.wait_for_load_state("networkidle")
    page.fill("#email", "alex@demo.local")
    page.fill("#password", "password123")
    page.click("button[type=submit]")
    page.wait_for_url("**/dashboard")
    page.wait_for_timeout(1200)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:5173")
    parser.add_argument("--out", default=r"C:\Users\Administrator\AppData\Local\Temp\opencode\mesa")
    parser.add_argument("--routes", nargs="*", default=DEFAULT_ROUTES)
    parser.add_argument("--locale", default="pt-PT")
    args = parser.parse_args()

    login = api("POST", "/api/auth/login", {"email": "alex@demo.local", "password": "password123"})
    groups = api("GET", "/api/groups", token=login["token"])
    group_id = groups[0]["id"] if groups else None

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(locale=args.locale, viewport={"width": 1440, "height": 960})
        page = ctx.new_page()
        sign_in(page, args.base)
        routes = list(args.routes)
        if group_id:
            routes += [f"/groups/{group_id}", f"/groups/{group_id}?tab=expenses", f"/groups/{group_id}?tab=people"]
        for route in routes:
            page.goto(args.base + route)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(900)
            name = route.replace("/", "_").replace("?", "-").replace("=", "")
            page.screenshot(path=f"{args.out}{name}-light.png", full_page=True)
            page.emulate_media(color_scheme="dark")
            page.wait_for_timeout(400)
            page.screenshot(path=f"{args.out}{name}-dark.png", full_page=True)
            page.emulate_media(color_scheme="light")
        browser.close()
    print("screenshots in", args.out)

main()
```

Run it once with the dev server: `npm run dev:web` in the background, then
`python C:\Users\Administrator\AppData\Local\Temp\opencode\mesa-check.py`. Expected: PNGs written, no errors.

- [ ] **Step 6: Check whether Gabarito has tabular figures**

With the dev server running, in the harness environment run:

```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page()
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    tabular = page.evaluate("""async () => {
      await document.fonts.load('700 64px "Gabarito Variable"');
      const c = document.createElement('canvas').getContext('2d');
      c.font = '700 64px "Gabarito Variable"';
      return c.measureText('111').width === c.measureText('888').width;
    }""")
    print("gabarito tabular:", tabular)
    b.close()
```

Record the result. If `False`, every hero money figure uses `money` (DM Mono 500) instead of Gabarito for the large number.

- [ ] **Step 7: Verify**

Run `npm run typecheck` and `npm run build -w @expense-splitting/web`. Expected: both clean. Open the harness screenshots: the app is recoloured to sand/pine, headings and body use the new fonts, no layout breakage.

---

### Task 2: Money display + form primitives

**Files:**
- Modify: `apps/web/src/components/net-value.tsx`
- Modify: `apps/web/src/components/animated-money.tsx`
- Modify: `apps/web/src/components/ui/{button,input,label,checkbox,select,tabs}.tsx`

**Interfaces:**
- Consumes: Task 1 tokens and fonts.
- Produces: `NetValue` and `AnimatedMoney` APIs unchanged (`net`, `currency`, `className`; `minorUnits`, `currency`, `className`, `animateOnMount`) — later tasks restyle around them.

- [ ] **Step 1: `net-value.tsx`**

Zero state: `text-xs text-muted-foreground` unchanged. Non-zero: `money text-sm font-medium` with `text-positive` / `text-negative` unchanged. No structural change needed beyond the token swap; confirm it renders teal/brick.

- [ ] **Step 2: `animated-money.tsx`**

Keep the animation logic exactly as-is (rAF, 650ms, reduced-motion aware, StrictMode-safe). Only the rendered value is affected by `.money` in CSS. If the Task 1 tabular check returned `False`, pass the parent's `className` through unchanged and let callers choose `money`.

- [ ] **Step 3: `ui/button.tsx`**

Read the file and apply:
- base: `rounded-md` → `rounded-lg`, add `active:scale-[0.98] motion-safe:transition-[transform,background-color,color]`
- `default`: keep `bg-primary text-primary-foreground`, hover `bg-primary/90`
- `outline`: `border-input bg-card hover:bg-muted hover:text-foreground`
- `ghost`: `hover:bg-accent hover:text-accent-foreground`
- `destructive`: `bg-destructive text-destructive-foreground hover:bg-destructive/90`
- focus ring: `focus-visible:ring-[3px] focus-visible:ring-ring/40`

- [ ] **Step 4: `ui/input.tsx`**

`rounded-md` → `rounded-lg`, `bg-transparent` → `bg-card`, `border-input` kept, placeholder `text-muted-foreground`, focus `ring-[3px] ring-ring/30`, height stays `h-9`.

- [ ] **Step 5: `ui/checkbox.tsx`**

`rounded-[4px]` → `rounded-md`; checked fill `bg-primary text-primary-foreground`; focus ring `ring-ring/40`.

- [ ] **Step 6: `ui/select.tsx`**

Trigger: `rounded-md` → `rounded-lg`, `bg-transparent` → `bg-card`, same focus ring. Content: `rounded-xl`, `shadow-soft`, item focus `bg-accent text-accent-foreground`.

- [ ] **Step 7: `ui/tabs.tsx`**

`TabsList`: `rounded-lg bg-muted p-0.5` → `rounded-full bg-muted p-1`. `TabsTrigger`: `rounded-full`, active `bg-card text-foreground shadow-soft`.

- [ ] **Step 8: `ui/label.tsx`**

No visual change beyond inherited tokens; confirm `text-sm font-medium`.

- [ ] **Step 9: Verify**

`npm run typecheck`, `npm run build -w @expense-splitting/web`, harness screenshots. Buttons, fields, selects and tabs read warm and rounded; no blue remains.

---

### Task 3: Surfaces and overlays

**Files:**
- Modify: `apps/web/src/components/ui/{card,badge,alert,skeleton,table,separator,dialog,sheet,dropdown-menu,tooltip,sonner}.tsx`

**Interfaces:**
- Consumes: Task 1 tokens, `shadow-soft`.
- Produces: unchanged component APIs.

- [ ] **Step 1: `ui/card.tsx`**

`rounded-lg border bg-card` → `rounded-xl bg-card shadow-soft`; drop the default border; keep `py-5`; footer/header spacing unchanged.

- [ ] **Step 2: `ui/badge.tsx`**

Variants: `default` pine, `secondary` warm sand, `outline` `border-border text-foreground`, destructive `bg-destructive/12 text-destructive` (no `text-white`). Radius `rounded-full`. Remove unused `success`/`destructiveSubtle`/`muted` variants only if nothing consumes them (grep first).

- [ ] **Step 3: `ui/alert.tsx`**

`rounded-xl bg-card shadow-soft` for default; destructive `border-destructive/25 bg-destructive/10 text-destructive`.

- [ ] **Step 4: `ui/skeleton.tsx`**

`rounded-md bg-muted` → `rounded-xl bg-muted`.

- [ ] **Step 5: `ui/table.tsx`**

Rows: `border-b border-border/60`; head cells `text-muted-foreground text-xs font-medium`; no structural change.

- [ ] **Step 6: `ui/dialog.tsx`** and **`ui/sheet.tsx`**

Overlay: `bg-black/45 backdrop-blur-[2px]`. Content: `rounded-3xl border-0 bg-card p-6 shadow-soft`; close button focus ring `ring-ring/40`. Sheet content keeps side-specific radius (`rounded-l-3xl`/`rounded-r-3xl`).

- [ ] **Step 7: `ui/dropdown-menu.tsx`** and **`ui/tooltip.tsx`**

Content `rounded-xl border-border bg-popover p-1 shadow-soft`; items `rounded-lg focus:bg-accent focus:text-accent-foreground`. Tooltip: `rounded-lg bg-foreground text-background text-xs`.

- [ ] **Step 8: `ui/sonner.tsx`**

Map toast classes to card language: `rounded-xl`, `bg-card`, `text-card-foreground`, `border-border`, `shadow-soft`. Remove `richColors` from the `Toaster` in `main.tsx` so the themed variables win; keep success/error icon colours from tokens.

- [ ] **Step 9: Verify**

`npm run typecheck`, build, harness screenshots with one dialog opened manually in dev to confirm radius, shadow and focus ring.

---

### Task 4: Shell, logo, route transitions, auth shell

**Files:**
- Modify: `apps/web/src/components/logo.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/components/auth-shell.tsx`
- Create: `apps/web/src/components/route-transition.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/main.tsx` (toaster props only)

**Interfaces:**
- Consumes: tokens, fonts, `motion`.
- Produces: `<RouteTransition>` wrapper used by `App.tsx`; sidebar nav and account chip classes later tasks rely on visually.

- [ ] **Step 1: `logo.tsx`**

Wordmark: `font-display font-extrabold tracking-tight` in current foreground; mark: two-tone pine/apricot split circle (keep the existing SVG geometry, swap fills to `var(--primary)` and `var(--accent)`).

- [ ] **Step 2: `route-transition.tsx`**

```tsx
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function RouteTransition({ children, routeKey }: { children: ReactNode; routeKey: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={routeKey}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 1, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

Use it in `App.tsx` inside `RequireAuth`, with the current location available from `useLocation()`:

```tsx
const location = useLocation();
<AppShell>
  <RouteTransition routeKey={location.pathname}>
    <Outlet />
  </RouteTransition>
</AppShell>
```

- [ ] **Step 3: `app-shell.tsx` — sidebar**

- `<aside>`: `bg-sidebar text-sidebar-foreground border-r-0`; remove the old border class.
- `SidebarLink` active: `bg-sidebar-accent text-sidebar-accent-foreground` with `shadow-none rounded-xl`; remove the inset left marker; inactive hover `hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground`.
- Wordmark block: `font-display` and `text-sidebar-foreground`.
- Group list amounts: replace `text-positive`/`text-negative` with `text-sidebar-positive`/`text-sidebar-negative`.
- Group-context panel: active tab `rounded-xl bg-sidebar-accent`, same tokens.
- Account chip: `rounded-xl bg-black/15` in light and `dark:bg-black/30`.
- Mobile drawer `SheetContent`: `bg-sidebar text-sidebar-foreground border-0`, width unchanged.

- [ ] **Step 4: `auth-shell.tsx`**

Replace the `auth-glow` gradient with a two-panel layout: a pine panel (`bg-primary text-primary-foreground`) containing the logo/wordmark and a short line of copy, and a sand panel with the form. Desktop `md:grid md:grid-cols-[1.05fr_1fr]`; mobile stacks with a slim pine header. Remove `auth-glow` usage and its `@utility` in `index.css`.

- [ ] **Step 5: `main.tsx`**

Confirm `richColors` is gone from `<Toaster />` (removed in Task 3); keep `position="bottom-right"` and `closeButton`. No other change.

- [ ] **Step 6: Verify**

Typecheck, build, harness screenshots: shell pine, route transition present and 180ms, mobile drawer warm, login split panel. Toggle dark to confirm `--sidebar` dark tokens.

---

### Task 5: Login / register page

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `AuthShell` from Task 4; form primitives from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Restyle the form**

Tabs stay (login/register). Keep all ids (`#email`, `#password`, `#name`) and the submit `button[type=submit]`. Apply: primary button spans full width (`w-full`), error alert uses the new destructive tint, field spacing `space-y-4`, labels unchanged. No copy changes.

- [ ] **Step 2: Verify**

Typecheck, build, then check `/login` in a fresh signed-out browser context (new Playwright context with no login step, or a private window). Expected: split panel, pine brand side, warm form side.

---

### Task 6: Dashboard

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: tokens, `AnimatedMoney`, `NetValue`, `shadow-soft`, avatar cluster.
- Produces: nothing new; keep all data logic (`currencyTotals`, single/mixed handling, `PositionBand` props).

- [ ] **Step 1: Header**

Greeting `text-3xl font-semibold tracking-tight` stays; add `font-display` implicitly via `h1` base. Button becomes the pine primary pill (`rounded-full px-5`). Keep the `groups?new=1` link.

- [ ] **Step 2: Position band — single currency**

Section: `rounded-3xl bg-card p-6 shadow-soft` (no border). Label: `text-sm text-muted-foreground`. Big value: `font-display font-bold text-4xl sm:text-5xl` when Gabarito is tabular, otherwise `money text-4xl font-medium`; keep `animateOnMount` and the signed count-up. Chips: replace the two label/amount columns with pill blocks — owing `rounded-2xl bg-destructive/10 px-4 py-3` with `text-destructive`, owed `rounded-2xl bg-positive/10 px-4 py-3` with `text-positive`; each shows label (Karla 12.5px semibold) over amount (`.money`). Balance bar: keep geometry, colours `bg-negative/80` / `bg-positive/80`, centre tick `bg-foreground/20`.

- [ ] **Step 3: Avatar cluster with the one hero sequence**

Add a right-aligned overlapping avatar cluster (`flex -space-x-3`) using up to 4 group names hashed through `avatarStyle`/`initialsOf`, each circle `ring-2 ring-card`, wrapper `aria-hidden="true"`. Animate the hero as one sequence with `motion`: the cluster pops in first (scale 0.85 → 1, 40ms stagger, 220ms duration), then the bar widths transition in (already CSS); the count-up starts on mount. Use `useReducedMotion()` to render the final state instantly when reduced motion is on.

- [ ] **Step 4: Position band — mixed currency**

Replace the rows with the same chip language: each currency row is `flex items-center justify-between rounded-2xl bg-muted px-4 py-3`, code in `text-xs text-muted-foreground`, amount `money text-xl font-medium` teal/brick. Keep the `dashboard.mixedCurrencies` note.

- [ ] **Step 5: Group cards**

Replace the flat `<ul>` rows with `<ul className="space-y-3">`; each item `rounded-2xl bg-card px-4 py-3.5 shadow-soft transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0`. Avatars are circles per the spec (`rounded-full`): group mark, name/meta, `NetValue`, and the quick-add icon button. Keep the `dashboard.groupsSubSame`/`groupsSubMixed` caption.

- [ ] **Step 6: Verify**

Typecheck, build, harness screenshots of `/dashboard` in light/dark at 1440 and 390 widths. Expected: warm hero, teal/brick chips, count-up, cards.

---

### Task 7: Groups page

**Files:**
- Modify: `apps/web/src/pages/GroupsPage.tsx`

**Interfaces:**
- Consumes: card language, dialog primitives.
- Produces: nothing new.

- [ ] **Step 1: Header and empty state**

Keep `groups.title`/`groups.subtitle` and `groups.new`. New-group button: pine primary `rounded-full`. Empty state: `rounded-3xl bg-card shadow-soft py-16`.

- [ ] **Step 2: Group cards**

Convert rows to `space-y-3` cards like Task 6 Step 5, including the `ChevronRight` affordance and hover lift. Skeleton rows: `h-16 rounded-2xl`.

- [ ] **Step 3: New-group dialog**

Uses the rethemed `Dialog` automatically. Confirm the select trigger is warm and the create button is pine. No copy changes.

- [ ] **Step 4: Verify**

Typecheck, build, harness screenshots of `/groups`.

---

### Task 8: Group page — header, overview, settle-up, delete dialog

**Files:**
- Modify: `apps/web/src/pages/GroupPage.tsx`
- Modify: `apps/web/src/components/settle-up-card.tsx`
- Modify: `apps/web/src/components/delete-group-dialog.tsx`

**Interfaces:**
- Consumes: `useGroupNavRegistration`, `AnimatedMoney`, `NetValue`, settlement data as today.
- Produces: nothing new; keep the `?tab=` semantics.

- [ ] **Step 1: Header and tab rail**

Header: keep name, members/total line, dialogs, options menu; add the group avatar mark (circle, `avatarStyle`) before the title. Mobile `TabsList` and desktop sidebar tabs both use the pill language.

- [ ] **Step 2: Overview hero**

Mirror the dashboard position band: `rounded-3xl bg-card shadow-soft`, label `group.yourPosition`, big `AnimatedMoney` in `font-display font-bold` (or `money` if Gabarito is not tabular), position word in teal/brick, then the paid/share/settled trio as a bordered sub-grid using `divide-border` lines. Keep all amounts and labels.

- [ ] **Step 3: Empty expenses state**

Card `rounded-3xl shadow-soft`, same copy, buttons pine/apricot.

- [ ] **Step 4: `settle-up-card.tsx`**

- Card `rounded-xl shadow-soft` with no border.
- Transfer rows: `rounded-2xl bg-muted px-4 py-3` with avatar circles, `from → to` names, amount `.money`, and a pine "Mark paid" button.
- Settled state: apricot-tinted block (`bg-accent text-accent-foreground`) with `settle.done`.
- History rows: `rounded-xl`, undo as a ghost button.
- Keep the lazy `money-flow-graph` import and the graph's `motion`-free fade entry. Add a single motion moment: the confirmed row briefly scales to 1.02 using `motion.div` with `whileTap`/`animate` and reduced-motion fallback.

- [ ] **Step 5: `delete-group-dialog.tsx`**

Destructive confirm uses `bg-destructive text-destructive-foreground`; everything else inherits the new dialog language. Copy unchanged.

- [ ] **Step 6: Verify**

Typecheck, build, harness screenshots of `/groups/<id>` (overview) in both themes, plus a recorded settlement in dev to confirm the confirmation state.

---

### Task 9: Expenses — list and dialogs

**Files:**
- Modify: `apps/web/src/components/expenses-card.tsx`
- Modify: `apps/web/src/components/expense-dialog.tsx`
- Modify: `apps/web/src/components/batch-expense-dialog.tsx`

**Interfaces:**
- Consumes: form primitives, cards, dialog language.
- Produces: nothing new; keep all validation and payload behaviour.

- [ ] **Step 1: `expenses-card.tsx`**

Card `rounded-xl shadow-soft`; date group headings `text-xs font-medium text-muted-foreground`; rows `divide-border/60`; payer avatar circles, description Karla medium, amount `.money`; delete action ghost with destructive hover. Load-more button `rounded-full`.

- [ ] **Step 2: `expense-dialog.tsx`**

Keep fields, ids, validation, split-type select and participant checkboxes. Restyle: dialog is already `rounded-3xl`; split-type control becomes the pill `Tabs`. Participant rows `rounded-xl px-3 py-2 hover:bg-muted`. Amount inputs use `.money` and `text-right`.

- [ ] **Step 3: `batch-expense-dialog.tsx`**

Same treatment; the footer total/per-head block becomes `rounded-2xl bg-muted px-4 py-3` with `.money` figures. Keep all column logic and width.

- [ ] **Step 4: Verify**

Typecheck, build, harness screenshots of `/groups/<id>?tab=expenses`, plus manual dialog screenshots (create expense and batch) in dev.

---

### Task 10: People tab — balances, members, charts, graph

**Files:**
- Modify: `apps/web/src/components/balances-card.tsx`
- Modify: `apps/web/src/components/members-card.tsx`
- Modify: `apps/web/src/lib/avatar.ts`
- Modify: `apps/web/src/lib/chart-theme.ts`
- Modify: `apps/web/src/components/paid-vs-share-chart.tsx`
- Modify: `apps/web/src/components/money-flow-graph.tsx`

**Interfaces:**
- Consumes: chart tokens, `avatarStyle`/`initialsOf`.
- Produces: unchanged public APIs (`BalancesCard`, `MembersCard`, `PaidVsShareChart`, `MoneyFlowGraph`).

- [ ] **Step 1: `avatar.ts`**

Keep the deterministic hash and the translucent-mix approach, but derive from the new `--chart-1..5` values. Formula: pick `chart[(hash % 5) + 1]`, then mix with the current surface token via `color-mix`. Avatars stay circles.

- [ ] **Step 2: `chart-theme.ts`**

Read the new variables (`--chart-1` paid / `--chart-2` share, plus axis/grid from `--border` and `--muted-foreground`). Keep the CSS-variable reading pattern.

- [ ] **Step 3: `balances-card.tsx`**

Card `rounded-xl shadow-soft`; remove `px-0`/manual padding hacks in favour of `CardContent` padding; avatar circles; position amounts teal/brick; settled muted.

- [ ] **Step 4: `members-card.tsx`**

Card language, avatar circles, add-member row `rounded-2xl bg-muted p-3`, remove button ghost destructive. Keep the email search and confirm dialog.

- [ ] **Step 5: `paid-vs-share-chart.tsx`**

Keep recharts and the custom `BarTooltip`; update bar fills to `chart-1`/`chart-2`, axes/legend to `muted-foreground`, grid to `border`, bars `radius={6}`. Legend text stays Karla.

- [ ] **Step 6: `money-flow-graph.tsx`**

Node fills from `chart-1..5` via the same person hash; edges `currentColor` at warm opacity; labels `fill: var(--foreground)`; keep label decluttering. No geometry changes.

- [ ] **Step 7: Verify**

Typecheck, build, harness screenshots of `/groups/<id>?tab=people` in both themes at 1440 and 390; confirm the lazy chart loads and the custom tooltip still follows the pointer.

---

### Task 11: Full verification at 8080

**Files:**
- No source changes expected beyond fixes found here.

**Interfaces:**
- Consumes: everything.
- Produces: verified build.

- [ ] **Step 1: Rebuild the container**

`docker compose up -d --build web --wait`. Expected: healthy.

- [ ] **Step 2: Full harness matrix at 8080**

Run `python C:\Users\Administrator\AppData\Local\Temp\opencode\mesa-check.py --base http://localhost:8080 --routes /dashboard /groups` and then the group routes (`/groups/<id>`, `?tab=expenses`, `?tab=people`), in `--locale en-US` and `--locale pt-PT`, plus a 390px mobile pass.

- [ ] **Step 3: Check the details**

- No steel-blue or `#3e7cb1` remains anywhere (`rg -i "3e7cb1|6fa8dc|schibsted|instrument-sans|plex-mono" apps/web/src` returns nothing).
- Reduced motion: emulate `prefers-reduced-motion: reduce` and confirm no transforms on route change or hero reveal.
- Keyboard focus visible on: sidebar links, dashboard action, tabs, dialog close, form fields.
- Both locales render every screen without truncation.

- [ ] **Step 4: Fix and re-verify**

Fix anything the matrix reveals, then repeat Steps 1–3.

- [ ] **Step 5: Report**

Summarize file changes and verification evidence. Ask the user to review at 8080 and whether to commit.
