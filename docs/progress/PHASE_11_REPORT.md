# OrbitCargo — Phase 11 Progress Report

**Phase:** 11 — Data model v2 (`docs/architecture/SPEC_RECONCILIATION.md` §3)
**Status:** ✅ Complete. Awaiting approval for Phase 12.
**Date:** 2026-10-20
**Decisions applied:** ADR-013 (charge lines), ADR-014/018 (level from KG/CBM), ADR-015 (database), ADR-017 (4 statuses), owner answers Q1–Q4.

---

## 1. Scope delivered

**Migration `20261020080000_data_model_v2`** (hand-edited, additive except for the status enum):

| Area | Change |
|---|---|
| Statuses | `ShipmentStatus` = AT_ORIGIN_STORE, DEPARTED, IN_TRANSIT (shown "Transit", Air only), ARRIVED. The data migration runs **before** the enum swap: DELIVERED → ARRIVED; ON_HOLD → last non-hold status from history (else AT_ORIGIN_STORE), and hold events keep a `[legacy ON_HOLD]` note; a Sea shipment in IN_TRANSIT → DEPARTED. |
| Customer | `company`, `location`, `cargoCategory` ("What do you buy?"), `phoneKey` (digits-only, **unique**), `email` **unique** (lowercased). Backfill keeps the key on the earliest customer if a phone is shared. |
| Shipment | `destCode`, `shipDate`, `arrivalDate`; AirDetail `awbKg` (for Total KG − AWB KG). |
| Shipment line | MIX (`mixCount`, `mixKg`), `rate`, `qualityRate`, `brandPcs`, `brandRate`, `fatura`, `delivery`, `other`, `discount`, `note`, `updatedAt`. |
| Invoice | `discount` (total = lines − discount), freight snapshot (`actualMeasure`, `billedMeasure`, `baseRate`, `qualityRate`, `agentName`, `agentRate`), `commissionAmount`. ChargeCategory + `BRAND`, `FATURA`. |
| New tables | `Bank` (+ `Payment.bankId`), `Country`, `BusinessYear` (partial unique index → one current year), `Receipt` (+ `ReceiptDirection`, `ReceiptKind`), `ReceiptSequence`. |
| Integrity | CHECKs: all new money/measure columns ≥ 0, receipt amount > 0, sequence ≥ 1001, year range, ISO-2 format. |

**Server logic (no UI yet beyond the customer form):**
- `modules/shipments/stateMachine.ts`: mode-aware transitions (Air via Transit, Sea direct); ARRIVED terminal; `statusSteps()` for timelines.
- `createShipment`:
  - rejects ROAD (Q2), unknown or inactive origin countries, and years not created in Settings
  - canonicalises the country name
  - defaults the destination to Mogadishu, Somalia (MGQ)
  - stores AWB, date and arrival
- `addShipmentLine`: stacks entries per customer, validates measures by mode (KG vs CBM), whole-number counts, no negatives; audited.
- `modules/finance/charges.ts` (all Decimal, server-side):
  - `lineMeasure`: KG + MIX KG for Air, CBM for Sea
  - `lineTotal`
  - `buildSpecInvoice`: one freight line at the combined rate (base + quality + agent commission); Brand/Fatura/Local Delivery/Others only when entered; discount subtracted above Total; commission and extra measure computed
- `createSpecInvoice` service.
- `modules/finance/receipts.ts`: `RCP-<year>-<n>` from 1001, allocated by a single-statement upsert (row lock) inside the money transaction. `recordPayment` now records the bank and issues the receipt atomically.
- `modules/customers/level.ts`: ADR-014 tiers; `customerVolume()` per year, counting MIX KG.
- `modules/customers/service.ts`:
  - company required
  - duplicate email (any case) and phone (any formatting) rejected with clear messages, with the DB unique index as the backstop
  - new fields
- `modules/reference/data.ts`:
  - banks (Salaam 37215407, Dahabshiil 365258411, Premier 25687140, Cash)
  - countries (Turkey, India; Somalia as destination)
  - year 2026 as current
  - seeded idempotently by `prisma/seed.ts` and restored by the integration-test reset
- `src/config/company.ts`: both phones, hours 08:00–18:00, WhatsApp link.
- Admin "Add customer" form: Company (required), Email, Location, "What do you buy?"; shows duplicate errors.

**Security fix found along the way:** `listCustomers` let a search **replace** the country-scope filter (both used `where.OR`), so a country-scoped staff member searching by name could see other countries' customers. The two are now AND-ed. A regression test covers it.

## 2. Checks performed (actual results)

| Check | Result |
|---|---|
| Migration on a **restored copy** of the dev DB | ✅ applied; 3 DELIVERED → ARRIVED; events kept; phone normalised |
| Migration on dev and test DBs (`prisma migrate deploy`) | ✅ |
| Dev DB backup before migrating | ✅ `backups/orbitcargo-pre-phase11.dump` (28 tables, verified with `pg_restore --list`; `/backups/` is git-ignored) |
| Type check / Lint | ✅ / ✅ |
| New integration suite `data-model-v2.test.ts` | ✅ **23 passed** |
| Full integration | ✅ **111 passed** (9 files; was 88 — +23 Phase 11) |
| Unit | ✅ **49 passed** |
| E2E (smoke + visual, :3400) | ✅ **14 passed** (customer-creation E2E now fills Company) |

## 3. Notes and residual items

- **Prisma client engine file.** `prisma generate` wrote the new client, but could not replace the engine DLL because another session's dev servers (:3000, :3100) hold it open. The engine binary is the same Prisma version, so it works. **Those servers were started before the migration and still run the old client. Restart them** (or `npm run dev` again) before using them; the old client doesn't know the new columns and statuses.
- **Customers are still country-scoped for staff.** Spec §0 says customers are shared across countries; that authorization change lands with the Customers screen in Phase 14.
- **Assumption:** the WhatsApp button uses +252 614111539 (the first phone). Tell me if it should be the other number.
- `scripts/demo-transaction.ts` now uses Turkey (China isn't an origin country) and ends at ARRIVED. Re-running it fails on the duplicate phone. That is intended: duplicates are rejected.
- Invoice creation UI, Payments UI and receipt PDFs come in Phase 15. Receipts for non-payment movements come in Phase 16.

## 4. Next step

**Phase 12 — login flows (ADR-016):**
- **Customer:** Reference + password; first login or forgotten password via Reference + Phone + Email → email OTP → create password; self-registration with the Reference delivered in-app.
- **Staff:** 3-step login (Employee ID → email + code → password), with TOTP kept for privileged staff.

It is waiting for your approval.
