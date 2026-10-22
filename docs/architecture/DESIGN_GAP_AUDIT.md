# OrbitCargo — Design Gap Audit (Phase 0-B)

**Status:** Planning only. No application code, schema, tests or existing docs were changed.
**Date:** 2026-10-20
**Progress:** D1/D2 decided (ADR-013/014). Phase 10 done — see `docs/progress/PHASE_10_REPORT.md` (§4.4 components ported; W1 fixed for components).
**Scope:** Compare the approved design reference (`design-reference/orbit-cargo-design-system/`) with the implemented application (`src/`, `prisma/`, `tests/`) after Phases 0–9, and plan how to (a) **fix what is wrong** and (b) **add what is missing**.

Existing planning docs (`PROJECT_AUDIT.md`, `ARCHITECTURE.md`, `DATA_MODEL_PLAN.md`, `THREAT_MODEL.md`, `PERMISSION_MATRIX.md`, `TEST_STRATEGY.md`, `IMPLEMENTATION_ROADMAP.md`, `DECISIONS_LOG.md`) remain valid and are **not** overwritten. This document extends them.

---

## 1. Headline finding

The backend foundation (auth, MFA, authorization, schema, finance integrity, documents, audit, deploy) is solid and tested. **The UI is not.** The implementation covers a small fraction of the approved screens, mostly as simplified pages — which the master prompt explicitly forbids ("Do not replace approved screens with simplified placeholder pages").

| Measure | Design reference | Implemented |
|---|---|---|
| Admin UI kit source | ~430 KB JSX across 18 files | ~2,500 lines across 12 pages |
| Customer app screens | 11 screens, mobile **and** desktop shells | 3 pages under `/account` |
| DS primitives | 17 (+13 kit helpers) | 6 (`Badge`, `Button`, `Card`, `Icon`, `Input`, `Tag`) |
| Visual regression | — | 2 snapshots (landing, login) compared against **the app's own baseline**, not against the design |

---

## 2. Method

1. Listed every top-level component in each design file (`ui_kits/**`, `components/**`, `shared/kit.jsx`, `shared/receipt.jsx`).
2. Listed every route, component and module in `src/`, and every model in `prisma/schema.prisma`.
3. Compared screen by screen: navigation, content blocks, actions, data fields, auth flows.
4. Classified each gap as **WRONG** (exists but deviates, must be fixed) or **MISSING** (must be added), and flagged items that need an owner decision.

Limitations: the design kit could not be rendered in the preview pane (local files open as static snapshots, so its React/Babel runtime did not run). Comparison is source-level. Pixel comparison is part of Phase 10.

---

## 3. WRONG — exists but must be fixed

| # | Area | Current | Design / requirement | Fix |
|---|---|---|---|---|
| W1 | Visual regression | `tests/e2e/visual.spec.ts` snapshots the app against itself (2 pages) | Prompt §2: compare **original UI vs implemented UI** at matching viewports | Serve the design kit locally in Playwright, screenshot the same screen at the same viewport, diff against the app |
| W2 | Customer portal shell | `PortalShell` with 3 links (`/account`, `/account/invoices`, `/account/documents`) + Logout | `customer-app/App.jsx`: mobile top `AppBar` (logo, bell + unread count) + 4-tab `BottomNav`; desktop navy sidebar (Home, Shipments, Finance, Profile + Documents, Notifications, customer card) | Rebuild shell to match both layouts |
| W3 | Customer shipments page | Flat row: code · mode · route · badge | `ShipmentCard`: mode tile, tracking no., flags, dashed route, status, weight/CBM, packages; year picker, search, All/Air/Sea filter | Rebuild |
| W4 | Customer invoices page | Simple list | Finance screen: navy account summary, Invoices/Statement tabs, status tags, invoice cards → Invoice detail | Rebuild |
| W5 | Customer login | Email + password (+ TOTP) | Log in with **Customer Reference** + password; new-account flow with email OTP verification; "Forgot password?" | Rebuild flow (see D3, D4) |
| W6 | Staff login | Same shared email/password page | `AdminLogin`: **Employee ID (EMP-000)** → email OTP → create password on first login | Rebuild flow (see D4) |
| W7 | Admin pages | Simplified tables/forms per page (e.g. dashboard 76 lines) | Full compositions in `ui_kits/admin/*` (see §4.2) | Rebuild each page to design |
| W8 | Admin shell | `AdminShell` sidebar filtered by permission | `Shell.jsx` also has business-year selector, `ViewOnly` banner, `NoAccessPage`, `YearEmpty`, `Drawer`, `RowActions`, `ConfirmDelete`, `Toolbar` | Add the missing shell behaviours |
| W9 | Customer data model | `Customer`: ref, name, phone, email, country, status | Design: company, location, cargo category ("What do you buy?"), member since, **customer level A–D** (computed), service mix | Add fields; compute level server-side (see D2) |
| W10 | Charge lines | Generic categorized lines (ADR-009) | Design line = `measure×rate + quality×measure + brandPcs×brandRate + fatura + delivery + other − discount` | Owner decision D1 (left open in DECISIONS_LOG) |

---

## 4. MISSING — must be added

### 4.1 Customer app (`ui_kits/customer-app`)

| Screen | Missing content |
|---|---|
| Home | Welcome; navy customer card (ref, level, Active); 4 counts (shipments, arrived, air KG, sea CBM); hero banner + service chips; 6 quick-access tiles; latest 2 shipments |
| Shipment detail | Navy header with progress bar + moving plane/ship; `TrackingTimeline`; key–value details; "Ask about this shipment" |
| Finance → Statement | Customer ID / member since / totals; date-range payment history; receipt view (`ReceiptSheet`) + download; statement PDF; payment breakdown by bank; recent activity |
| Invoice detail | Full invoice view (`InvoiceDetail.jsx`) |
| Notifications | Status updates + announcements, unread state |
| Documents / Records | Document list + record detail |
| Support | Support contacts + per-shipment enquiry |
| Profile | Avatar; customer info + Edit dialog (ref locked); language SO/EN/AR; notification switch; security; email-verified badge; logout confirm |
| Desktop variant | Split login (headline + form), sidebar layout, centered 760px content |

### 4.2 Admin (`ui_kits/admin`)

| Design file | Missing / incomplete |
|---|---|
| `Dashboard.jsx` | `DashGroup` / `DashList` widgets, business-year scoping |
| `Users.jsx` | Employee form (dept, multiple roles, countries, transfer role, accounting access), per-module default permissions, **Activity log** |
| `Customers.jsx` | Customer form with design fields, level column/badges |
| `AdminShipments.jsx` | `ShipmentForm`, `CustomerPicker`, `LineForm` (per-customer cargo lines with charge fields), full admin shipment detail |
| `Operations.jsx` | Design layout |
| `AdminFinance.jsx` (72 KB) | `CreateInvoiceDialog`, `EditInvoiceDialog`, `InvoicePaper` (printable), `FinBox`/`ActualBox`/`AgentBox` summaries, bank selection, invoice menu |
| `Accounting*.jsx` (~160 KB) | **Entire module absent:** owner gate, cash book, cash/expense/income forms, expenses view, profit view, partner profits, commissions, debts, cost payables, out vouchers, arrival & origin cost sheets, sea profit table, receipts (`GenReceipt`), shipment cost page, operation cost (Turkey / MGQ) |
| `AccountingTransfer.jsx` | Design layout for money transfer (backend exists, ADR-011) |
| `AdminDocuments.jsx` | Design layout + print page (`doc-page.js`, `index-print.html`) |
| `AdminNotifications.jsx` | `ScheduleAnnouncement` (scheduled announcements with route, last day, flight date) |
| `Reports.jsx` | Charts (`Bars`, `Legend`), monthly air/sea/revenue |
| `AdminSettings.jsx` | Design settings sections |

### 4.3 Public portal & mobile kit

- `ui_kits/portal/`: `TrackScreen`, `ShipmentsScreen`, `QuoteScreen` (readme marks these "illustrative"). `/track` exists; quote request flow is missing.
- `ui_kits/mobile/`: Somali-first mobile app (`MTrack`, `MShipments`, `MQuote`). Not built. Overlaps heavily with the customer app (decision D6).

### 4.4 Components

- **Primitives to port:** IconButton, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, Tooltip, TrackingTimeline, ShipmentRow.
- **Kit helpers to port:** DataTable, Stat, Panel, Bars, Legend, KV, SearchBox, Seg, DateField, StatusBadge, Overline, Flag, ReceiptPaper/ReceiptSheet; formatters `money`, `num`, `fdate` (must use decimal-safe server values).
- **Assets:** bank logos (`assets/banks/*`, `shared/bank-logos.js`), country flags (design pulls `flagcdn.com` at runtime → bundle locally to fit the CSP).

### 4.5 Already in place (keep)

Tokens bridged to Tailwind (ADR-003), Archivo + JetBrains Mono, logos, EN/SO/AR dictionaries (`src/i18n/dictionaries/so.json` ~57 KB, `ar.json` ~65 KB) with RTL, the server-side authorization layer, state machine, finance integrity, private documents, MFA, audit log, deploy/backup runbooks.

---

## 5. Design behaviours that must NOT be copied literally

The design kit is a browser-only prototype. These behaviours conflict with security/data rules and will be re-implemented server-side:

| Design behaviour | Why not | Implementation |
|---|---|---|
| All data in `localStorage` (`orbit-admin-db-v3`, etc.) | No persistence, no authz | PostgreSQL via services (already the pattern) |
| `OWNER_PIN` constant gating Accounting in the browser | Client-side secret, trivially bypassed | Server-side permission + step-up re-auth (decision D5) |
| Customer password "at least 6 characters" | Weaker than the current policy | Keep current server policy; adjust copy (decision D4) |
| `lineTotal` computed with JS floats | Prompt §7/§9 forbids float money | Server `Decimal` recalculation (existing `finance/money.ts`) |
| Client-side role → page map (`ROLE_PAGES`) | Not a security boundary | Keep server permissions; use the map only for nav visibility |
| Runtime fetch of Lucide icons / flags from CDNs | CSP + availability | Bundle locally (Icon already does this) |

---

## 6. Decisions needed from the owner

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Charge-line model (open since ADR-009) | (a) keep generic lines; (b) make design fields first-class: rate, quality, brand pcs × rate, fatura, delivery, other, discount | **(b)** — the admin LineForm, InvoicePaper and customer invoice all show these fields |
| D2 | Customer level rule | Design: max of air tier (≥100/300/1000 kg) and sea tier (≥1/4/10 CBM) per business year → D/C/B/A | Adopt as configurable thresholds, confirm the numbers |
| D3 | Customer self-registration | Design lets anyone create an account (OTP to email) and receive a Customer Reference | Allow, but new accounts start **pending** until staff verify? Or active immediately? |
| D4 | Login identifiers & password policy | Customer: Customer Reference + password. Staff: Employee ID + email OTP + password. Design min length 6 (customer) / 8 (staff) | Use design identifiers; enforce **min 8** for everyone; keep TOTP MFA for privileged staff on top of email OTP |
| D5 | Accounting access | Design: owner PIN + `accAccess` flag | Dedicated `accounting:*` permissions + re-enter password (step-up) for owner-only views |
| D6 | Mobile kit vs customer app | Build both, or treat `ui_kits/mobile` as superseded by the responsive customer app | Treat as superseded; reuse its Quote screen in the portal |
| D7 | Accounting business rules | Partner profit splits, commission rates, expense categories, cost stages | Need owner input; categories configurable, no invented percentages |
| D8 | Email OTP delivery | Resend is already wired | Confirm sender domain for production |

---

## 7. Proposed phases (each stops for approval)

> **Superseded 2026-10-20** by `docs/architecture/SPEC_RECONCILIATION.md` §3 (Phases 11–17, aligned to the owner business spec). Kept for history.

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **10 — Component parity + design-diff harness** | Port the 11 missing primitives and 13 kit helpers as typed TSX; add a Playwright harness that serves `design-reference/` locally and screenshots kit screens next to app routes at 390×844 / 384×832 / 1180×760 | Unit tests per component; harness produces side-by-side diffs; typecheck/lint/tests green |
| **11 — Data model additions** | Customer profile fields + level; charge-line fields (per D1); receipts & bank entities; migrations | Migrations apply + roll forward cleanly; integration tests for level calc and line totals (decimal) |
| **12 — Auth flows per design** | Customer ref login + OTP sign-up; staff EMP-ID + OTP first-login password; rate limits; negative tests | Existing auth/MFA tests stay green; new negative tests (OTP reuse, expiry, enumeration) |
| **13 — Customer app** | All §4.1 screens, mobile + desktop shells, EN/SO/AR + RTL | Each screen matches design within the diff threshold; Customer A ↛ Customer B tests on every new query |
| **14 — Admin parity (non-accounting)** | Shell behaviours + all §4.2 pages except Accounting | Per-page design diff; permission tests per action |
| **15 — Accounting module** | §4.2 Accounting files, after D5/D7 | Financial integrity tests (transactions, idempotency, reversals) |
| **16 — Portal quote, final visual regression, launch re-review** | Quote flow, full design-vs-app regression suite, update launch checklist | All suites executed and reported honestly |

Phases 10 and 11 can start without owner input except D1 and D2 (needed for 11). Phase 12 needs D3/D4; Phase 15 needs D5/D7.

---

## 8. Risks

- **Scale:** the Accounting and Admin Finance kits alone are ~230 KB of dense JSX; realistic only as several phases.
- **Inline-style DS:** keeps `style-src 'unsafe-inline'` in the CSP (already documented residual).
- **Schema changes on existing data:** additive migrations only; no destructive changes without a verified backup.
- **Design kit drift:** the local copy is from the 2026-10-18 extraction. If the claude.ai/design project has changed since, re-sync before Phase 13.

---

## 9. Next step

Owner approves this audit and answers D1–D2 (D3–D8 can follow). Then **Phase 10** begins.
