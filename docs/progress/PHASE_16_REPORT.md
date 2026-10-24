# OrbitCargo — Phase 16 Progress Report

**Phase:** 16 — Accounting (spec B10; owner's revised admin prompt §11)
**Status:** ✅ Complete. Phase 17 (Money Transfer) next.
**Date:** 2026-10-24
**Decisions applied:** ADR-019 (6 Out categories incl. Profit payout), owner Q4 (per-user PIN).

---

## 1. Access: special access + PIN
- **Accounting** shows only for users with *Special access → Accounting* switched on (Users & Team), or a super admin. Everyone else gets "⛔ No access", **even if they know a PIN**: `loadAuthzUser` removes `accounting:*` when the switch is off.
- **PIN** (4–8 digits): each user chooses their own the first time. It is stored as an Argon2id hash.
  - Wrong PINs are rate-limited: 5 failures in 15 minutes.
  - A correct PIN sets an **8-hour, httpOnly unlock cookie**. The cookie is an HMAC over user id + session epoch + expiry, so it dies at logout, password change, deactivation, or after 8 h.
  - **Lock** clears it.
  - A super admin can **Reset Accounting PIN** in Users & Team.
- **Cost sheets have their own editors**: *Operation cost (Origin)* → `costorigin:write`, *Operation cost (MGQ)* → `costmgq:write`. Both are set per employee as page access. **Period closing** needs `accounting:manage`.

## 2. Tabs (`/accounting`, scoped to the top bar's country + year)

| Tab | What it does |
|---|---|
| **Shipment cost payment** | Air / Sea. Per shipment: Origin / Transit (Air) / Arrived (MGQ) cost, each with *Paid*; total cost, paid, remaining, status, profit. Summary cards. **Sheets** opens three panels: the **Origin sheet**, the **MGQ sheet** (each read-only for people who can't edit it), and **Shipment Cost & Profit** with every formula's result. |
| **Income & Out** | Balance per country plus a **Total balance**. **Per bank / cash**: the admin's count next to what the records say; if the counts don't add up to the balance, an **error** shows the difference. **Income** (automatic): shipment collections, commission (once fully paid), money receive, debt returned. **Out** with filters and **+ Add Out** (below). **What this balance is made of**: Came in / Went out / Remaining for Transfer, Commission, Shipments cost, Somali Transport profit, Mahad profit and Orbit profit. The rows add up to the balance. |
| **Debts** | Lent / Returned / Still owed / status. **Money returned** (amount, bank, date) posts to Income with an IN receipt; it can't exceed what is owed. |
| **Partners profit** | Somali Transport and Mahad (Turkey): earned, paid, **what we hold**. A share is earned only once the shipment's cost is collected. India shows "100% Orbit". |
| **Profit & Expenses** | Orbit share per shipment; Orbit profit − expenses = net. |
| **Commissions** | Agent, shipment, customer, KG, rate, amount, paid, status, **payable only after the customer paid in full**, and payment history. |
| **Receipts** | Every receipt for the country and year (payments, commission, expense, shipment cost, transfer, debt, debt returned, profit payout). Filter and search; reversed ones are struck through. **Download PDF**: a payment voucher (out) or receipt (in) with the company profile. |
| **Overview · Period closing** | H1 / H2 / Full year: revenue, shipment cost, commission, expenses, net profit, collected, outstanding. **Close period**. |

**+ Add Out** has 6 categories (ADR-019):
- **Shipment cost** → shipment → stage. The dropdown shows each stage's cost and what is paid; containers have no Transit.
- **Expenses**.
- **Commission** → every payable agent row. One payment can split across several invoices; each becomes Partial / Paid.
- **Transfer Money**.
- **Debt** → who took it.
- **Profit payout** → partner, never more than what we hold.

Every Out also has **Paid from** (bank/cash), **Sent to**, date and note, and gets a numbered **OUT receipt**. A mistake is **reversed**, never deleted: the out and its receipt stay, marked reversed. A debt that has returns can't be reversed.

## 3. Formulas (`src/modules/accounting/calc.ts`, Decimal, server-side)
Taken from the approved design kit (`AccountingShipCost.jsx`, `AccountingArrival.jsx`).

**Air**
- base = Rate × KG + AWB + Custom + Delivery & Packaging + Fatura (lines) + Branded
- Transfer fee = (base + local delivery) × %
- **Total Origin Cost** = base + local delivery + fee
- Cost rate = (base + fee) ÷ KG
- **Net MGQ** = (QC + Arimas + MGQ Custom rates) × KG + TRPR + Loader + Extra
- Total cost MGQ = Net MGQ + Transit
- Rate MGQ = Total cost MGQ ÷ KG

**Sea**
- Origin = Custom + Freight + Local transport + local delivery + Fatura + Storage + Brand
- **Total Port Charges** = MAERSK + ALBAYRAK + Inland pickup + Scan + QC + Port porters + Truck + Store unloading
- **Import Tax** = Customs duty + Clearance

**Profit** (both modes)
- Total income Somalia = collected − commission
- Total income = that − Transfer money (Sea also adds origin and brand income)
- **Profit** = Total income − Total shipment cost
- Split: Turkey Air 43/50/7, Sea 45/50/5; others 100% Orbit. Stored as configuration (`AppSetting.profitSplit`, defaults in code).

**Stage dues**
- Origin = Total Origin Cost
- Transit = transit cost (Air)
- Arrived = Net MGQ (Air) or Port + Tax (Sea)

## 4. Period closing
- A closed period locks **Finance and Accounting** for the country:
  - Finance: create invoice, edit/delete invoices dated in it, add/edit/delete payments dated in it.
  - Accounting: cost sheets of shipments dated in it, outs, debt returns.
- Closing the **year** stores the closing balance as next year's **Opening balance**, which counts in the balance.

## 5. Database
Backup taken first: `backups/orbitcargo-before-accounting.dump`.

Migration `20261024180000_accounting`:

| Kind | Added |
|---|---|
| Enums | `CostStage`, `OutCategory`, `Partner`, `ClosePeriod` |
| Tables | `ShipmentCostSheet` (origin/MGQ JSON, validated with zod), `CashOut`, `CommissionPayment`, `DebtReturn`, `CashCount`, `PeriodClose` (unique per country/year/period), `OpeningBalance` |
| Column | `User.accountingPinHash` |
| CHECKs | Amounts > 0. A stage only on shipment costs; a partner only on profit payouts. |

**Permissions:** `accounting:read|write|manage`, `costorigin:write`, `costmgq:write` (seeded: 40 permissions).

## 6. Checks performed (actual results)

| Check | Result |
|---|---|
| Type check / Lint | ✅ / ✅ |
| New `accounting.test.ts` | ✅ **7 passed**. Covers: switch on/off (PIN refused without access); PIN length, match, wrong PIN, rate limit; unlock token dies on epoch change, expiry or tampering; the air formula against a worked example (fee 8.6, origin 438.6, MGQ 120 + 60 transit, profit 571.4, split 245.7 / 325.7 / 40, stage dues); sheet editors separated; closed period blocks sheets; balance 930 − 200 − 30 = 700, composition sums to the balance; count mismatch error then match; shipment-cost paid per stage; stage required; reverse keeps the receipt; commission refused before full payment, partial then paid, never over-paid; debt lent / returned / over-return refused; return counted in income; partner earned 600 / 84 and payout capped at what we hold; close year needs `manage`, blocks Finance payments and Accounting outs, carries 100 into 2027. |
| Full integration | ✅ **160 passed** (12 files) |
| Unit | ✅ **49 passed** |
| Browser (dev) | PIN screen → owner set their own PIN. All 9 tab URLs render. Shipment cost shows W-1 origin $35 (fatura + delivery) and profit $235 (400 − 130 commission − 35). Income & Out: Turkey $400, India $0, total $400. |
| Production build | ✅ compiled (`/accounting`, `/print/accounting-receipt/[number]` built) |

## 7. Notes / decisions to confirm
- **Transfer money (Air)** is subtracted from income and credited to Somali Transport, as the design does. Please confirm that is the intended meaning of "Total income = Total income Somalia − Transfer money".
- **Partner realisation:** a partner's share counts only in proportion to the profit actually collected (collected − commission − cost), as in the design.
- **Sea origin sheet:** the spec gives no field list, so the design's fields are used (custom, freight, local transport, storage, brand, transfer, income at origin, brand incomes).
- **Bank count check:** it needs all banks counted. It compares the latest counts with the current balance.
- A user who forgets their PIN needs **another super admin** to reset it. Nobody can reset their own PIN, which would defeat it.
- **Money Receive** (transfers in) is wired as an income source and returns 0 until Phase 17.

