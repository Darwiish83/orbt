# OrbitCargo — Business Spec Reconciliation & Revised Phase Plan

**Date:** 2026-10-20
**Inputs:**
- `docs/requirements/ORBIT_BUSINESS_SPEC.md`: owner spec, with the 2026-10-20 overrides
- `docs/architecture/DESIGN_GAP_AUDIT.md`: design vs. app
- ADR-013 … ADR-018

**Supersedes:** the phase table in `DESIGN_GAP_AUDIT.md` §7 (Phases 11–16). Phase 10 is done.

Each phase stops for owner approval. Every new query keeps server-side authorization, plus country and year scoping. Money stays `Decimal` and is recomputed on the server, and every money movement gets a receipt.

---

## 1. What the spec resolves from the open decisions

| Open item | Resolved by the spec |
|---|---|
| D3 — customer self-registration | Allowed. A Reference is issued automatically and delivered in-app; the customer appears in Admin → Customers. |
| D5 — Accounting access | Per-user "Accounting" flag plus a PIN screen. Implemented server-side: PIN hashed and verified on the server, rate-limited, re-asked per session. Never a constant in the browser. |
| D6 — mobile kit | Superseded by the responsive Customer App (iPhone, Samsung, Computer). |
| D7 — accounting rules | Profit split for Turkey: Orbit 43/45%, Somali Transport 50/50%, Mahad 7/5% (Air/Sea). India: 100% Orbit. Commission counts only when the invoice is fully paid. Stage costs: Origin, Transit (Air), Arrived (MGQ). Formulas are in spec §B10. These are stored as configuration, not hard-coded. |
| Bank list | Salaam 37215407, Dahabshiil 365258411, Premier 25687140, Cash. Stored as data with logos. |
| Company identity | Address, two phones, hours 08:00–18:00, WhatsApp → `src/config/company.ts` (to extend). |

## 2. What changes in what's already built

| Area | Today | Spec / decision | Work |
|---|---|---|---|
| Statuses | 6 (incl. DELIVERED, ON_HOLD) | 4, Transit Air-only (ADR-017) | Migration; the dev DB's 3 `DELIVERED` rows → `ARRIVED`. Update state machine, labels and tests. |
| Login | One shared form (email + password + Ref/EMP-ID) | Separate customer and staff flows (ADR-016) | Rebuild in Phase 12. The server-side identifier check and the Employee ID backfill are reused. |
| Mode | AIR / SEA / ROAD | Air (W-n) and Sea/Container (C-n) only | See open question Q2. |
| Customer | ref, name, phone, email, country, status | + company (required), location (free text), "what you buy", member since, level, unique email and phone | Phase 11 |
| Shipment line | packages, kg, cbm | + MIX count/KG, measure = KG + MIX KG, ADR-013 charge fields, quality rate/kg, notification; several entries per customer, summed | Phase 11 |
| Shipment | code, mode, origin, dest, status, year | + origin code (city), destination code, date, arrival, AWB (text), AWB KG and difference (Air) | Phase 11 |
| Invoice | generic lines | billed vs actual KG, rate, brand/fatura/local delivery/others/discount, agent commission (hidden from the customer, combined rate), history log | Phases 11 + 15 |
| Receipts | none as an entity | `RCP-YYYY-####` for every in/out movement, with PDF | Phase 11 (model) + 15/16 (issuing) |
| Countries / Years | origin country as a string; businessYear int | Settings-managed countries (flag automatic) and years (create 2027, switch, carry balances forward) | Phase 11 (model) + 14 (Settings UI) |
| Access control | roles + page access NONE/VIEW/EDIT | Module No/View/Full, Accounting flag, Transfer role + countries, time-limited access | Phase 14 (time windows are new) |

## 3. Revised phases

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **11 — Data model v2** | Everything marked "Phase 11" in §2. Additive migrations plus the status migration. Customer duplicate email/phone guard. Level calculation (ADR-014). Line and invoice totals per ADR-013 (Decimal). Receipt numbering. Bank, Country and BusinessYear entities. | Migrations apply on a copy of the dev DB, and the 3 `DELIVERED` shipments become `ARRIVED`. Integration tests: level tiers, MIX measure, line/invoice totals and rounding, duplicate rejection, receipt numbering under concurrency. Existing suites stay green. |
| **12 — Login flows (ADR-016)** | Customer: Ref + password, OTP first login/reset, self-registration with in-app Reference. Staff: 3-step login, TOTP kept for privileged staff. Remove the shared form. | Negative tests: OTP reuse, expiry, wrong Reference/phone/email combinations, enumeration, rate limits, customer ↛ staff flow and the reverse. E2E for both flows. |
| **13 — Customer App** | Spec A2–A10 on mobile (iPhone/Samsung) and desktop: Home, Shipments, Shipment detail (4-step timeline, no AWB), Finance, Invoice paper (combined rate, optional rows, Somali demurrage warning, banks), Notifications, Documents/Records, Record detail, Profile, Support/WhatsApp. EN/SO/AR + RTL. | Design-parity diffs per screen. Customer A ↛ Customer B on every query. |
| **14 — Admin core** | Shell (Year + Country selectors), Dashboard, Users & Team (module access, Accounting flag, transfer role/countries, time-limited access), Customers, Shipments (CustomerPicker, line form, AWB KG difference), Operations (bulk status), Notifications + Schedule Announcement, Documents, Reports, Settings (company, years, countries, notifications, security, appearance). | Permission tests per action. Country and year isolation tests. Design-parity per screen. |
| **15 — Finance** | Spec B9: Invoices (create/edit/view/history/delete, agent commission, extra-KG log), Payments (status auto, receipt, customer notification), Statement (debit/credit/running balance, PDF), Reminders (penalty only after admin approval). | Financial-integrity tests: idempotency, transactions, partial and over-payment, commission not counted as income until fully paid. |
| **16 — Accounting** | Spec B10: PIN gate, stage costs, Turkey and MGQ sheets (separate editors), cost & profit with configured splits, Income & Out (per-bank reconciliation error), debts, partners' profit, commissions, receipts, period closing (locked), year carry-forward. | Sheet-ownership tests (Turkey editor ↛ MGQ sheet). Closed-period immutability. Profit split arithmetic. |
| **17 — Money Transfer v2 + launch review** | Spec B11: receiver/sender sides, fee %, orange/green handover, sender locked until green, monthly periods, income flow. Full design-parity regression and updated launch checklist. | Role/country tests for sender vs receiver. All suites executed and reported. |

## 4. Open questions for the owner

**Resolved 2026-10-20:** the owner accepted all four defaults below (8-character minimum, ROAD hidden, Home "Delivered" counts Arrived, per-user Accounting PIN).

| # | Question | Default if no answer |
|---|---|---|
| Q1 | Password minimum: the spec says **6** characters; the current policy is **8**. | Keep **8**, which is safer. Only the copy changes. |
| Q2 | Road mode: the spec only has Air (W) and Sea (C). | Hide ROAD from all UI and creation. Keep the enum value so old data stays readable. |
| Q3 | Home card "Delivered", with no Delivered status. | Count **Arrived** shipments (the design kit's label). |
| Q4 | Accounting PIN: one PIN per user, or one shared owner PIN? | **Per user**, set by the user, hashed on the server. |
