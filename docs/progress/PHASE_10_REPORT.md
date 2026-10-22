# OrbitCargo — Phase 10 Progress Report

**Phase:** 10 — Component parity + design-diff harness (from `docs/architecture/DESIGN_GAP_AUDIT.md` §7)
**Status:** ✅ Complete. Awaiting approval for Phase 11.
**Date:** 2026-10-20

---

## 1. Scope

| Acceptance criterion (audit §7) | Result |
|---|---|
| Port the 11 missing DS primitives as typed TSX | ✅ IconButton, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, Tooltip, TrackingTimeline, ShipmentRow (`src/ui/primitives/`) |
| Port the 13 kit helpers | ✅ Flag, StatusBadge, Overline, Stat, KV, Panel, Bars, Legend, Seg, SearchBox, DateField, DataTable, ReceiptPaper/ReceiptSheet (`src/ui/kit/`) + `money`/`num`/`fdate` (`src/ui/format.ts`) |
| Harness that diffs the design against the app at the same viewport | ✅ `tests/e2e/design-parity.spec.ts` (`npm run test:design`) — fixes audit item **W1** for components |
| Unit tests per component; typecheck/lint/tests green | ✅ see §3 |

Owner decisions **D1** and **D2** were recorded as ADR-013 and ADR-014 in `DECISIONS_LOG.md` (implemented in Phase 11).

## 2. What changed and why

**New components.** These are line-by-line ports of `components/**/*.jsx` and `ui_kits/shared/kit.jsx`, with the same inline styles and token variables. The only additions are things the design omits that don't change how it looks:
- accessibility: `aria-invalid`/`aria-describedby` on Select, a labelled Switch, Dialog labelled by its title and closing on Escape with focus return, `role="alert"` for danger toasts, `aria-current` on the timeline, and Seg exposed as a radiogroup
- `type="button"` defaults
- logical `start`/`end` alignment so RTL works

**Design behaviours replaced (audit §5):**
- **Money formatting.** The design's `money()` used JS floats. `src/ui/format.ts` formats decimal strings with HALF_UP rounding via BigInt (no float), so `"1.005"` becomes `$1.01`.
- **Flags.** The design fetched `flagcdn.com` at runtime. Flags are now bundled locally as `/public/flags/*.svg` from `flag-icons@7.5.0` (MIT, dev dependency, pinned; copied by `scripts/copy-flags.mjs`), so the `img-src 'self'` CSP holds.
- **Bank logos** are copied to `/public/banks/`.
- **Receipts.** The design hashed receipt numbers in the browser. `ReceiptPaper` instead takes a server-issued `receiptNo`.
- **DataTable row links** accept only same-origin paths (`/…`, never `//…` or `https://…`). A unit test covers this.

**Two global fidelity bugs found by the harness, fixed:**
1. **Tailwind preflight** forced `box-sizing: border-box` and reset margins on every element. The design is built on browser defaults (content-box) plus its own `base.css`. Every bordered control, toast and dialog rendered smaller than the design (diffs of 3% on `forms` and `feedback`). Preflight is now off (`tailwind.config.ts`). The app uses almost no Tailwind utilities, so the side effects were limited:
   - The overflow audit at 390px and 1440px (36 page views) found 3 pages overflowing at phone width. They are fixed: the four auth cards now use `boxSizing: "border-box"`, and the track input got `minWidth: 0`.
   - The admin sidebar went from 248 to 272px. This now **matches** the design, whose sidebar is 248px + 12px padding, content-box.
2. **Font fallback.** next/font's metric-adjusted Arial fallback rendered glyphs missing from Archivo's latin subset (e.g. "→") differently from the design's `system-ui` fallback. Set `adjustFontFallback: false` (`src/app/fonts.ts`).

**Harness.**
- `scripts/serve-design.mjs` serves `design-reference/` read-only on 127.0.0.1:3200, with a path-traversal guard. It never executes archive code server-side.
- The `/dev/ds/[card]` pages mirror each design specimen card using the ported components. They return 404 in production.
- The spec writes the **design** screenshot as the baseline on every run, then compares the app against it. That makes it design → app, never app → old app. Those baselines are git-ignored.
- The suite runs on its own ports with separate build dirs (`NEXT_DIST_DIR`), so it never collides with a dev server on :3100. `E2E_PORT` does the same for the main E2E suite.
- It needs network, because the design cards load React/Babel/fonts/icons from CDNs. For that reason it runs locally and is not in CI.

**Stale baseline found.** The committed `login` visual baseline predates the "Forgot your password?" link (commit `4121ea8`) and contained the Next dev-mode badge. So the login visual test was already failing before this phase. I regenerated it after the fixes. Both visual specs now hide the dev badge.

## 3. Checks performed (actual results, 2026-10-20)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint` | ✅ clean |
| Unit | `npm test` | ✅ **49 passed** (was 14; +35 for new components, kit, formatters) |
| Integration (DB) | `npm run test:integration` | ✅ **77 passed** (7 files; no regression — this phase changed no server logic) |
| E2E smoke + visual | `E2E_PORT=3400 npx playwright test` | ✅ **11 passed** (9 smoke + 2 visual) |
| **Design parity** | `npm run test:design` | ✅ **6 passed** at 0.5% threshold. Measured residual diff with threshold 0: `card`, `feedback`, `forms`, `logistics`, `tabs` **0 px**; `core` **3 px** (icon anti-aliasing) |
| Production build | `NEXT_DIST_DIR=.next-build npm run build` | ✅ builds (only warning: existing `jose`/Edge-runtime notice in middleware) |
| Horizontal-overflow audit | temporary Playwright script (not committed) | ✅ 0 overflow on 18 routes × 2 widths after fixes |

## 4. Not done / residual

- **Design parity covers component cards only.** Screen-level comparison (customer app, admin) is added together with each screen in Phases 13–14.
- `flag-icons` adds 2.4 MB of SVGs to `public/` (served on demand, not bundled). These can be trimmed to the needed countries later.
- `npm install` warned that `unrs-resolver` (an existing transitive dev dependency) has install scripts pending approval. This phase did not approve or run them.
- `tsconfig.json` is now in Next's own formatting. Next rewrites it to list each build dir's `types/` folder (`.next-design`, `.next-e2e`, `.next-build`); the content is otherwise unchanged.
- `ECONNRESET … aborted` lines appear in the dev-server log during E2E navigation. They are aborted in-flight requests, not test failures. They were also present before this phase.

## 5. Next step

**Phase 11 — data model additions:**
- Customer profile fields and server-computed level (ADR-014)
- First-class charge-line fields with server-side `Decimal` totals (ADR-013)
- Receipt numbers and bank entities
- Additive migrations

It is waiting for your approval.
