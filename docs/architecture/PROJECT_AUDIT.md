# OrbitCargo — Project Audit (Phase 0)

**Status:** Phase 0 (inspection & planning only). No application code written. No existing files modified or deleted.
**Date:** 2026-10-18
**Author:** Engineering (Phase 0 audit)

---

## 1. What was inspected

| Item | Location | Notes |
|---|---|---|
| Design system archive | `C:\Users\hp\Downloads\orbit cargo design system (1).zip` (8.16 MB) | **Preserved unchanged.** Extracted read-only copy at `design-reference/orbit-cargo-design-system/`. |
| Existing workspace | `C:\Users\hp\OneDrive\Desktop\orbt` | Contained only `index.html` — a generic unrelated "Orbt Test Page" (purple theme). **Not** part of the OrbitCargo brand; left untouched. |
| Additional workspace | `C:\Users\hp\OneDrive\Desktop\main js` (`do/`, `in/`) | Empty scaffolding dirs; no relevant content. |

The archive is **not** a built project: there is **no `package.json`, no lockfile, no build config, no `node_modules`, no TypeScript config**. It is a Claude "Design System" export — raw source plus an in-browser preview runtime.

### File inventory (by type)
- `122` PNG (logos, uploads, screenshots), `1` JPG
- `54` JSX (components + UI kit screens), `17` TS (`.d.ts` type decls only), `10` JS (shared logic + preview runtime)
- `31` HTML (preview/specimen cards + UI kit entry pages)
- `21` MD (readme, SKILL, per-component `.prompt.md`), `7` CSS (tokens), `2` JSON (manifest, lint config)

---

## 2. What the design system actually contains

### 2.1 Brand foundations (authoritative, reusable)
Defined as CSS custom properties in `tokens/*.css` and catalogued in `_ds_manifest.json`:
- **Color:** Navy ramp `--navy-900…50` (primary `--navy-700 #012E6C`), Orange ramp `--orange-700…50` (accent `--orange-500 #FF5B04`), cool navy-tinted grays, semantic green/amber/red/blue. Plus a full **semantic alias layer** (`--surface-*`, `--text-*`, `--action-*`, `--status-*`, `--border-*`).
- **Type:** Archivo (variable, `wdth 100..125`, `wght 400..900`) + JetBrains Mono — loaded from **Google Fonts CDN** (no font files bundled). Full type scale (`--text-display-xl` 64px → `--text-overline` 11px), weights incl. black `850`, tracking/leading tokens.
- **Spacing:** 4px base scale (`--space-0…20`), `--container-max 1200px`, control heights 32/40/48.
- **Effects:** radii 2–10px + pill, three navy-tinted shadows, orange `--focus-ring`, easing/duration tokens, `--overlay-scrim`.
- **Logos:** `assets/orbit-logo.png` (full colour, light grounds), `assets/orbit-logo-reversed.png` (white+orange, dark grounds).

**Verdict:** tokens are clean, complete, framework-agnostic, and directly reusable. They will become the single source of truth for the Tailwind theme.

### 2.2 Components (17 primitives + helpers)
`components/` — each primitive ships `.jsx` + `.d.ts` + `.prompt.md`:
- **core:** Button, IconButton, Badge, Tag, Card, Icon (Icon fetches Lucide SVG from `cdn.jsdelivr.net/npm/lucide-static@0.452.0` and inlines it)
- **forms:** Input, Select, Checkbox, Radio, Switch
- **navigation:** Tabs
- **feedback:** Dialog, Toast, Tooltip
- **logistics:** TrackingTimeline, ShipmentRow

Plus **`ui_kits/shared/kit.jsx`** — a large set of composite helpers used across screens: `DataTable`, `Stat`, `Panel`, `Bars` (bar chart), `Legend`, `KV`, `SearchBox`, `Seg` (segmented control), `DateField`, `StatusBadge`, `Overline`, `Flag`, plus formatters `money`/`num`/`fdate`.

**Implementation style:** React 18 function components with **inline styles that reference the CSS variables** (no Tailwind, no CSS modules). They rely on **global namespace** `window.OrbitDesignSystem_da09b0` and other `window.*` globals rather than ES module imports.

### 2.3 UI kits (screen compositions)
- **`ui_kits/admin/`** — the richest surface. `AdminApp`, `Shell` (navy sidebar nav + topbar), `AdminLogin` (3-step), `Dashboard`, `Users`, `Customers`, `Operations`, `AdminShipments`, `AdminFinance`, `Accounting` (+ `AccountingArrival`, `AccountingReceipts`, `AccountingShipCost`, `AccountingTransfer`), `AdminDocuments`, `Reports`, `AdminNotifications`, `AdminSettings`.
- **`ui_kits/customer-app/`** — mobile+desktop customer app: `Login`, `Home`, `Shipments`, `Finance`, `InvoiceDetail`, `Notifications`, `Records`, `Profile`, `Support`, `Phone` (device frame).
- **`ui_kits/portal/`** — `Track`, `Shipments`, `Quote & book` (explicitly "illustrative, not recreated").
- **`ui_kits/mobile/`** — Somali-first mobile app with bottom tab nav.
- **`ui_kits/shared/`** — `data.js` (seed/business rules), `i18n.jsx` (EN/SO/AR + RTL), `so.js`/`ar.js` (dictionaries), `kit.jsx`, `bus.js` (event bus), `receipt.jsx`, `image-slot.js`, `bank-logos.js`.

### 2.4 Internationalisation (reusable)
Real translation dictionaries exist: `so.js` (~407 lines, Somali), `ar.js` (~416 lines, Arabic). `i18n.jsx` provides a React context, `useT()` lookup, a 3-way `LangToggle` (SO/EN/ع), RTL switching via `document.documentElement.dir`, and persistence in `localStorage['orbit-lang']`.

---

## 3. Embedded business logic discovered (critical for the data model)

`ui_kits/shared/data.js` is not just mock data — it encodes **real business rules** that must be reimplemented server-side:

- **Customer references:** format `OR-####`, allocator `nextCustRef` starts at `OR-3000` and finds the next free integer.
- **Shipment codes:** `W-<n>` for **Air**, `C-<n>` for **Sea**, scoped per `(year, mode, originCountry)`, with collision suffix `@<ISO><year>`. Generators: `nextShipCode`, `uniqShipCode`, plus a renumbering pass.
- **Customer tiers (A/B/C/D):** computed from shipped volume — Air kg thresholds (`≥1000→4, ≥300→3, ≥100→2`) and Sea cbm thresholds (`≥10→4, ≥4→3, ≥1→2`); tier = max of the two. Names: `A·PRO, B·VIP, C·STANDARD, D·BASIC`.
- **Line-item total:** `measure*rate + quality*measure + brandPcs*brandRate + fatura + delivery + other − discount`. **Currently JS floating-point + `toFixed`** — must become server-side decimal (see Threat Model / Data Model).
- **Invoice status:** `paid ≥ total → Paid`, `paid > 0 → Partial Paid`, else `Unpaid`; `balance = total − paid`.
- **Shipment statuses:** `At Origin Store · Departed · In Transit · Arrived` (+ `Delivered`, `On Hold`, `Pending` seen in status-tone map). Readme lists a richer customer-facing vocabulary (`Booked · Picked up · In transit · Delayed · Exception · Out for delivery · Delivered`) — **two vocabularies to reconcile**.
- **Origin countries:** Turkey, India (Guangzhou/Dubai/Jebel Ali are remapped to Istanbul/Mumbai etc. in seed). Country→ISO map + flag URLs via `flagcdn.com`.
- **Employee model:** `id (EMP-###)`, `name/phone/email`, `dept`, `roles[]`, `active`, `trRole` (send/receive/none), `trCountries[]`, `accAccess`, per-page `access{}` overrides, `countries[]` scoping.
- **Scoping dimensions:** every admin view is scoped by **business year** and often by **country** (Turkey/India).
- **Packaging:** "mix"/"box" package counting logic (`ORBIT_MIX`, `fixMixLine`).

**Implication:** the domain is materially richer than the prompt's headline scope. The data model must cover customer tiers, per-country/per-year scoping, transfer (send/receive) workflows, and multi-component charge lines.

---

## 4. Mock data & hardcoded assumptions (must NOT reach production)

| Finding | Location | Risk / action |
|---|---|---|
| **Hardcoded demo credentials** `EMP-001 / m.osman.orbit@gmail.com / orbit2026` | `ui_kits/admin/AdminLogin.jsx` | Demo only. **Never seed.** Replace with real auth. |
| **Fake OTP step** — "send code" accepts any 6-digit | `AdminLogin.jsx` | Replace with real email/OTP or Auth.js flow. |
| **Role impersonation dropdown** — pick "Super Admin" or any employee | `Shell.jsx` (`setMeId`, `mePick`) | Dev convenience; must not exist in prod. |
| **Client-side-only authorization** — `accessOf(emp, page)` + `ViewOnly` wrapper that blocks DOM clicks | `Shell.jsx` | **Not security.** All authz must be enforced server-side. |
| **Data in `localStorage`** (`orbit-admin-db-v3`, `orbit-new-customers`, `orbit-customer-edits`, `orbit-cust-me`, `orbit-lang`) | `data.js` | Becomes PostgreSQL + server session. |
| **JS floating-point money** (`lineTotal`, `money()`) | `data.js`, `kit.jsx` | Authoritative amounts must be DB decimal, computed server-side. |
| **External runtime CDNs** — React/ReactDOM UMD + Babel-standalone (`unpkg`), Lucide (`jsdelivr`), flags (`flagcdn`), images (`pexels`/`unsplash`) | many `index.html`, `Icon.jsx`, `data.js` | Replace CDN React/Babel with a real build; vendor or self-host icons/flags; proxy/whitelist remote images per CSP. |
| **Seed employees** with real-looking Somali names/emails/phones | `data.js` | Illustrative fixtures only; do not seed production. |

---

## 5. The preview runtime (`support.js`) — untrusted-input review

`support.js` (1,911 lines) is header-marked *"GENERATED from dc-runtime/src/*.ts"* — it is the **Claude design-system in-browser preview harness**. Observed behaviour (read, never executed):
- Parses `<x-dc>` template documents, transpiles JSX via **Babel-standalone**, and **evaluates code with `new Function("React","module","exports","require", code)`** (lines ~844, ~1218).
- `fetch(location.href)` to re-read its own document; `postMessage` to `window.parent` for a design-mode channel.

**Assessment:** consistent with a sandboxed preview tool, not malicious. **But in-browser `eval`/transpile has no place in a production app.** It will be **excluded entirely**; production uses a real Next.js/TypeScript build. No bundled script will be executed during this project.

---

## 6. UI integration challenges (for faithful reimplementation)

1. **Styling model mismatch.** Components use **inline styles + CSS variables**, the baseline asks for **Tailwind**. Resolution (proposed): keep the **tokens as CSS variables** and map them into the Tailwind theme so both styles coexist; port primitives largely as-is (inline styles referencing vars remain valid) and migrate incrementally. This preserves the exact approved look. *Decision flagged for approval.*
2. **Globals → modules.** Components depend on `window.OrbitDesignSystem_*` and other `window.*` helpers. They must be rewritten as **ES modules / TypeScript** with explicit imports, without changing rendered output.
3. **React 18 → 19.** Sources target React `18.3.1` UMD; Next.js 15 ships React 19. Components are function/hooks-only (no legacy class/lifecycle APIs observed) so migration should be low-risk, but each must be compiled and type-checked.
4. **Server vs. client components.** Screens are heavily interactive (state, context, effects); they will be **client components**, with data fetched in server components / server actions and passed down.
5. **`.jsx` → `.tsx` + typing.** `.d.ts` files exist and give prop shapes to start from.
6. **Icon strategy.** `Icon.jsx` fetches remote SVG at runtime. Replace with a build-time icon approach (e.g. `lucide-react`) to remove the network dependency and satisfy CSP.
7. **Images.** Remote Pexels/Unsplash placeholders must be replaced with owned assets or an allow-listed, CSP-compatible source; `next/image` remote patterns configured explicitly.
8. **i18n.** Port EN/SO/AR dictionaries + RTL into the app's i18n layer; keep key = English string convention so existing translations transfer directly.

---

## 7. What is missing (gaps to fill in later phases)

- No backend, API, database, or ORM.
- No authentication, password hashing, sessions, CSRF, rate limiting.
- No server-side authorization (only cosmetic client gating).
- No tests of any kind; no CI.
- No font files (CDN only); no offline/icon strategy.
- No real business rules for **customs, taxes, exchange rates, charge policies** (prompt forbids inventing these — must be configurable + flagged).
- No payment provider integration (must not claim real payments).
- No file/object storage for documents.
- No `.env.example`, no environment/secret management.
- No pagination / server-side filtering (SPA filters in-memory).

---

## 8. Files created in Phase 0

Planning docs (new; none pre-existed, nothing overwritten):
- `docs/architecture/PROJECT_AUDIT.md` (this file)
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DATA_MODEL_PLAN.md`
- `docs/security/THREAT_MODEL.md`
- `docs/security/PERMISSION_MATRIX.md`
- `docs/quality/TEST_STRATEGY.md`
- `docs/architecture/IMPLEMENTATION_ROADMAP.md`

Reference copy (read-only, non-authoritative source for visual parity):
- `design-reference/orbit-cargo-design-system/` (extracted from the untouched ZIP)

**No tests or builds were run in Phase 0** (nothing to run yet).

---

## 9. Business decisions

**Resolved 2026-10-18 (see `DECISIONS_LOG.md`):**
1. ✅ **Role set** — DS 7-role set + Customer (ADR-001).
2. ✅ **Scoping model** — country + business-year + per-employee overrides (ADR-002).
6. ✅ **Currency** — USD only, 2-decimal, decimal math (ADR-004).
7. ✅ **Styling** — Tailwind bridged to token CSS vars (ADR-003).

**Still open (not blocking Phase 1; resolve by noted phase):**
3. **Transfer workflow.** `trRole` send/receive + `trCountries` implies an inter-country transfer module — confirm scope. *(Phase 4)*
4. **Shipment status vocabulary.** Reconcile operational set (`At Origin Store/Departed/In Transit/Arrived`) with the customer-facing set in `readme.md`. *(Phase 4)*
5. **Charge line structure.** Confirm the `lineTotal` fields as the canonical charge model and which are configurable. *(Phase 5)*
8. **Tracking privacy.** What a public tracking number may reveal. *(Phase 4)*

---

## 10. Exact next step (Phase 1 — awaiting approval)

Scaffold the application foundation **without touching business logic**: Next.js 15 (App Router) + TypeScript strict, Tailwind wired to the token CSS variables, base layout/Shell, i18n (EN/SO/AR + RTL) ported, and the first batch of design-system primitives migrated to typed React components with **visual-regression parity** against the reference screens. See `IMPLEMENTATION_ROADMAP.md` → Phase 1 for scope and acceptance criteria.

**STOP — Phase 0 complete. Awaiting explicit approval before Phase 1.**
