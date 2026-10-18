# OrbitCargo — Phase 5 Progress Report

**Phase:** 5 — Quotes, charges, invoices, payments, financial integrity
**Status:** ✅ Complete. Awaiting approval for Phase 6.
**Date:** 2026-10-18

---

## 1. Scope delivered

- **Decimal money core** (`money.ts`) — all amounts via `Prisma.Decimal` (decimal.js), HALF_UP to 2dp. **No JavaScript float** for authoritative money (ADR-004).
- **Charge lines** — generic categorized model (ADR-009): amount = `quantity × unitPrice` computed **server-side**; the client never supplies `amount` or totals (the input types have no such field).
- **Invoices** — number generation (`INV-<year>-<seq>`), creation from line items with **server-recomputed total**, issue, void (blocked when payments exist), ownership-scoped get/list. A shared `recomputeInvoice` recomputes total (from lines) and `amountAllocated` (from **non-reversed** payment allocations) and derives status (UNPAID/PARTIAL/PAID/VOID) inside the transaction.
- **Payments** — `recordPayment` with allocations in **one transaction**, **idempotent** on `idempotencyKey`; validates positive amount, allocations ≤ payment, each invoice's **balance** (no overpayment), same **customer**, and **matching currency** (never mixed). `reversePayment` marks the payment reversed (keeps allocation history — no hard delete) and recomputes affected invoices. The DB `amountAllocated ≤ total` CHECK is the concurrency backstop.
- **Quotes** — create (server-computed total), status flow (DRAFT→SENT→ACCEPTED/EXPIRED/CANCELLED), ownership get/list, and **convert accepted quote → invoice**.
- **Audit** — every financial mutation records actor, amount, currency and references.
- **UI** — read-only `/finance` invoices list (number, currency, total, balance, status badge).

## 2. Checks performed (actual results)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint` | ✅ clean |
| Migration apply (dev + test) | `prisma migrate dev` / `deploy` | ✅ `payment_reversal` applied |
| **Integration (DB)** | `npm run test:integration` | ✅ **50 passed** (9 schema + 17 auth + 11 shipments + 13 finance) |
| Unit | `npm test` | ✅ 12 passed |
| E2E (prod build) | `npm run test:e2e` | ✅ 6 passed (from Phase 4; unchanged) |
| Production build | `npm run build` | ✅ builds; `/finance` dynamic |

**New Phase 5 tests cover:** server-computed line amounts + invoice total; **HALF_UP rounding / no float drift** (0.10+0.20+10.335 → 10.64); partial → PARTIAL, full → PAID; **overpayment to an invoice rejected** (rolls back, stays UNPAID); allocations beyond the payment rejected; **currency mismatch rejected**; one payment split across invoices; **payment idempotency** (one row on replay); **reversal** returns the invoice to UNPAID while keeping the allocation + reversed payment rows; void blocked with payments / allowed when empty; finance ops **denied without permission**; quote create/accept/**convert to invoice**; illegal quote transition rejected.

## 3. Decisions (new)

- **ADR-009** — generic categorized charge-line model; DS-specific components are additional categorized lines (additive later if confirmed). Totals always recomputed server-side.

## 4. Notes / deferrals

- **Customs/tax/FX rules are not invented** — charge categories are configurable; rates and policies await business-owner input.
- Full admin **create-invoice / record-payment forms** are light here (services + status actions exist and are tested); richer finance UI is Phase 7.
- Currency is USD-only in practice (ADR-004) but stored explicitly and checked on allocation, so multi-currency is an additive change later.

## 5. Exact next step (Phase 6 — awaiting approval)

Private documents, customer portal and notifications: private object storage with validated uploads (type/size/content, safe keys, path-traversal prevention), authz on upload **and** download with short-lived signed URLs, the self-scoped customer portal (track/shipments/quotes/invoices/documents), and notifications/announcements + scheduling — with the upload/download authorization and invalid/oversized-upload tests.

**STOP — Phase 5 complete. Awaiting approval before Phase 6.**
