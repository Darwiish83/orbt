# OrbitCargo — Phase 15 Progress Report

**Phase:** 15 — Finance (spec B9; owner's revised admin prompt §10, 2026-10-24)
**Status:** ✅ Complete. Moving on to Phase 14 (Admin core): the owner asked on 2026-10-24 for the phases to run back-to-back.
**Date:** 2026-10-24
**Decisions applied:** ADR-015 (PostgreSQL), ADR-018 (level from KG/CBM), ADR-019 (Out categories; Finance before Phase 14).

---

## 1. Scope delivered

### Top bar: Year + Country (pulled forward from Phase 14)
- `src/modules/authz/adminScope.ts` resolves the requested year and country against Settings (`BusinessYear`, active origin `Country`) **and** the user's own role scopes. It falls back to the current year and the first allowed country.
- `ScopeSelect` (top bar) stores the choice in two httpOnly cookies, through a server action that re-validates it. A user with no assigned year or country gets no selector.
- On phones the selectors move to their own full-width row.

### Finance page `/finance` (design `AdminFinance.jsx`)

| Tab | What it does |
|---|---|
| **Invoices** | Air/Sea switch and shipment search. The left list shows the selected country + year's shipments, W-1 first, 5 per page. "Customers in this Shipment" has one row per customer (MIX entries stacked). **Create Invoice** turns into **⋮** (View / Edit / View History / Delete). Also: the invoices table, the shipment financial summary, and the **Invoice Preview** with Download PDF. |
| **Create / Edit Invoice** | Billed KG/CBM with Actual shown and locked, plus the difference. Rate and Quality Control. **+ Add** Brand / Fatura / Local Delivery / Others (description + amount) / Discount / Agent Commission. The agent box shows shipment rate + commission = customer rate, and the commission amount. The live preview is display-only; the server recomputes everything. |
| **Payments** | **+ Add Payment**. Search covers only this shipment's customers. Shows Total / Paid / Balance and the status before → after. Amount defaults to the balance. Bank buttons with logos, and a date. The table has ⋯ View Invoice / View Receipt / Edit Payment / Delete Payment. |
| **Statement** | Invoice = Debit, payment = Credit, running Balance. Customer filter, search, **Download Statement PDF**. |
| **Invoice History** | *Invoice changes*: every changed field, before → after, who and when. *KG / CBM added*: Actual, Billed, Added, Discount, Extra earned. |
| **Reminders** | *Payment reminders*: one at a time or "Send to all"; a reminder only. *Demurrage*: free days and rate per day, days waiting, ± extra free days, fee so far and already charged. **Send Warning** only notifies. **Approve** (finance manager) adds a Demurrage line to the invoice. **Collected** stops the clock. |

### Documents (`/print/…`)
- Invoice, payment receipt and statement pages without the admin shell, A4 print CSS.
- **Download PDF** opens the page, and its button opens the browser's *Save as PDF*.
- The invoice paper (`src/ui/kit/InvoicePaper.tsx`, reusable for the customer app) has:
  - logo and address, the lines that exist, and Discount above Total
  - Paid, Balance and status
  - the three bank accounts with logos
  - the Somali demurrage warning (design text) and the company footer
- The page loads its document through the same scoped services as the Finance screen.

## 2. Backend

| Module | Notes |
|---|---|
| `finance/shipmentFinance.ts` | Shipment list, customers-in-shipment, invoices, payments, create / edit / delete invoice, add / edit / delete payment, invoice and receipt documents. Every function checks the **permission** and the **shipment's country + year scope**. The actual measure is always recomputed from the shipment lines. |
| `finance/ledger.ts` | Statement, invoice revisions, KG added, due invoices, payment reminders, demurrage list / warn / approve / extra days / collected. Read models are bounded (country + year, row caps). |
| `finance/charges.ts` | **Changed:** Quality Control is now its own invoice line (billed × quality rate), as in the design. The customer-facing freight rate is base + agent commission. Others carry a description. |
| `finance/payments.ts` | Split into `recordPaymentTx` / `reversePaymentTx`, so edit = reverse + re-record in **one** transaction. Invoice rows are locked (`FOR UPDATE`) before the balance check. Optional "Payment received ✓" customer notification. Reversal also marks the receipt `reversedAt`. |

**Rules enforced on the server**
- One live invoice per customer per shipment (service check plus a partial unique index).
- The edited total may not fall below what was already paid.
- **Delete invoice = Void**, allowed only when there are no live payments. **Delete payment = reverse**: nothing is hard-deleted, and both receipts stay on file.
- Payments are idempotent per dialog (UUID key). Over-payment and future dates are refused, and a bank is required.
- A penalty reaches an invoice **only** through `approveDemurrage` (`invoices:manage`). It is recomputed on the server and adds only the new part.

**Permissions**

| Action | Permission |
|---|---|
| Read | `invoices:read` |
| Create / edit invoice, reminders, extra days, collected | `invoices:write` |
| Delete invoice, approve demurrage | `invoices:manage` |
| Add payment | `payments:write` |
| Edit / delete payment | `payments:manage` |
| Statement and receipts | also `payments:read` |

## 3. Database

Migration **`20261024090000_finance_v2`** (additive). A backup was taken first: `backups/orbitcargo-before-finance-v2.dump`.

| Change | Detail |
|---|---|
| `ChargeCategory` | + `QUALITY`, `DEMURRAGE` |
| New enum `ReminderKind` | `PAYMENT`, `DEMURRAGE_WARNING` |
| New table `InvoiceRevision` | Append-only, FK Restrict |
| New table `PaymentReminder` | |
| `ShipmentLine` | + `collectedAt`, `extraFreeDays` |
| `Receipt` | + `reversedAt` |
| `Invoice` | Index on `shipmentId`, and partial unique index `Invoice_shipment_customer_live_key` (non-VOID) |

Applied to the dev and test databases with `prisma migrate deploy`.

**Not changed:** the shipment code. It stays globally unique: when Turkey already has W-1, India's W-1 is stored as `W-1@IN2026`, and staff only ever see `W-1`. No migration was needed for "Turkey's W-1 ≠ India's W-1".

## 4. Security fix found on the way
`listShipments` let a `country` filter **replace** a staff member's country scope: an India-only user could list Turkey's shipments by passing `country=Turkey`. The filter now has to fall inside the user's scope. Covered by a test.

## 5. Checks performed (actual results)

| Check | Result |
|---|---|
| Migration on dev + test DBs | ✅ |
| Type check / Lint | ✅ / ✅ (one `no-unused-expressions` warning fixed) |
| Unit | ✅ 49 passed |
| New `finance-v2.test.ts` | ✅ 16 passed. Covers: scope defaults and denial; the scope-leak fix; MIX grouping; server-computed totals (combined rate, quality line, commission apart); one invoice per customer; customer-not-in-shipment; permission and country denial; revisions and the "below paid" guard; void rules; Unpaid → Partial → Paid with receipts and notifications; idempotency, over-payment, bank and future-date refusals; **5 concurrent payments → exactly 3 succeed, total never exceeded**; edit / delete payment keep history; statement running balance and scope; KG added; reminder-only; demurrage approval (permission, extra days, only the new part, kept on edit, stops when collected). |
| Full integration | ✅ **153 passed** (11 files, after Phase 14) |
| Production build | ✅ compiled (Next 15, `.next-build`) |
| Browser (dev) | Create Invoice on W-1 (130 billed / 128 actual, agent $1, discount $10) → **INV-2026-0001 $1,000** (= 910 + 65 + 20 + 15 − 10). Add Payment $400 (Salaam) → PARTIAL, **RCP-2026-1001**, "Payment received ✓" notification in the DB. Statement, Reminders and the print invoice page checked. At 375px, no horizontal page scroll. |

## 6. Remaining / notes
- **PDF** is the browser's *Save as PDF* from the print page. No server-side PDF library was added.
- Demurrage free days / rate per day default to **3 / $5** (spec: 3 days). The rate is not in the spec, so staff set it in the Reminders tab. Confirm the real rate.
- **Commission** is stored per invoice (`commissionAmount`) and is not part of shipment income. Showing it in Accounting → Commissions once the invoice is fully paid is Phase 16.
- **Closed periods** (lock edits after period closing) arrive with Accounting (Phase 16). Finance edits will then be refused for closed periods.
- Dev demo data: `npx tsx scripts/demo-finance.ts <super-admin-email>`.
