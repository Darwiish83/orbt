# OrbitCargo — Phase 1 Progress Report

**Phase:** 1 — Application foundation
**Status:** ✅ Complete. Awaiting approval for Phase 2.
**Date:** 2026-10-18

---

## 1. Scope delivered

Foundation only — **no business logic, no database, no authentication** (those are later phases).

- **Next.js 15.5 (App Router) + TypeScript strict** (`noUncheckedIndexedAccess`, etc.); ESLint + Prettier; **committed lockfile** (`package-lock.json`, 502 packages).
- **Tailwind bridged to the DS token CSS variables** (ADR-003): token files copied verbatim into `src/ui/tokens/`; `tailwind.config.ts` maps colours/spacing/radii/shadows/type to the same `var(--…)` values. Exact DS values preserved.
- **`next/font`** self-hosts Archivo (with the `wdth` axis) + JetBrains Mono — removes the Google Fonts CDN dependency; font tokens rebound in `globals.css`.
- **i18n EN/SO/AR + RTL** ported from the DS dictionaries (1,147 entries each for SO/AR) into typed modules under `src/i18n/`, with a provider, `useT()`, RTL `dir` switching, `orbit-lang` persistence, and the SO/EN/ع `LangToggle`.
- **Layouts:** root layout (fonts + i18n provider); navy **admin shell** (248px sidebar + 68px topbar, orange active inset, reversed logo) in `src/components/admin/`; customer layout with navy header; brand **landing page** replacing the old generic test page (does not touch `index.html`).
- **Primitives migrated to typed React** in `src/ui/primitives/`: Button, Badge, Tag, Card, Input, Icon. Icon now uses **`lucide-react`** instead of the DS's runtime CDN `fetch` + `dangerouslySetInnerHTML` (satisfies the threat model).
- **Env validation** (`src/lib/env.ts`, Zod, server-only) + `.env.example` (placeholders only) + `.gitignore` (never commits `.env`).
- **Testing:** Vitest (unit) + Playwright (E2E) configured with smoke tests.

## 2. Checks performed (actual results)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` (`tsc --noEmit`, strict) | ✅ clean |
| Lint | `npm run lint` | ✅ no warnings or errors |
| Unit tests | `npm test` (Vitest) | ✅ **12 passed** (primitives + i18n) |
| Production build | `npm run build` | ✅ compiled; `/`, `/dashboard`, `/track` prerendered |
| E2E smoke | `npm run test:e2e` (Playwright, Chromium) | ✅ **4 passed** (landing, admin shell, SO toggle, AR RTL) |
| Visual check | Browser pane, `/` and `/dashboard` | ✅ on-brand parity confirmed |

## 3. Issues hit and resolved during the phase

- **`lucide-react/dynamic` not in 0.468** — switched `Icon` to the typed `icons` registry (`IconName = keyof typeof icons`, PascalCase). Type-safe and working.
- **next/font Archivo** — can't combine `axes` with an explicit `weight` array on a variable font; removed the weight list (variable font covers 100–900).
- **Playwright reused a foreign server on :3000** — an unrelated dev server is running on port 3000; the suite had connected to it. Fixed by pinning E2E to **port 3100** with `reuseExistingServer: false`.

## 4. Notes / follow-ups (not blocking)

- **Icon bundle size:** `Icon` indexes the whole lucide registry, so all icons bundle. A later performance pass should switch to per-icon code-split imports (or upgrade lucide for a `DynamicIcon`). First Load JS is currently ~213 kB, acceptable for now.
- **Stray `index.html`** at the project root (the old generic test page) is left untouched per the no-delete rule; Next.js does not serve it. Recommend deleting it with your approval in a later phase.
- **Another dev server occupies port 3000** on this machine (not ours). Our dev script still defaults to 3000; consider standardizing on a project port.
- **Visual-regression baselines** are not yet committed; generate with `npm run test:e2e -- --update-snapshots` once screens stabilize (planned for Phase 7/8 sweep).
- `next lint` prints a deprecation notice (removed in Next 16); migrate to the ESLint CLI later.

## 5. Project layout created

```
orbt/
  package.json, package-lock.json, tsconfig.json, next.config.mjs,
  postcss.config.mjs, tailwind.config.ts, vitest.config.ts, vitest.setup.ts,
  playwright.config.ts, .eslintrc.json, .prettierrc.json, .gitignore, .env.example
  public/brand/            orbit-logo.png, orbit-logo-reversed.png
  src/
    app/                   layout.tsx, globals.css, fonts.ts, page.tsx,
                           (admin)/layout.tsx, (admin)/dashboard/page.tsx,
                           (customer)/layout.tsx, (customer)/track/page.tsx
    ui/tokens/             colors/typography/spacing/effects.css (verbatim DS)
    ui/primitives/         Button, Badge, Tag, Card, Input, Icon, index
    components/admin/      AdminShell.tsx, adminNav.ts
    i18n/                  config.ts, I18nProvider.tsx, LangToggle.tsx, dictionaries/
    lib/                   env.ts
  tests/unit/              primitives.test.tsx, i18n.test.ts
  tests/e2e/               smoke.spec.ts
  docs/                    (Phase 0 planning + this report)
  design-reference/        read-only extracted design system
```

## 6. Exact next step (Phase 2 — awaiting approval)

Domain model & database: Prisma schema for the confirmed entities (see `DATA_MODEL_PLAN.md`), initial versioned migrations, constraints/indexes/decimal money columns, and a test database. No production seed.

**STOP — Phase 1 complete. Awaiting approval before Phase 2.**
