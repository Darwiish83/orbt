# OrbitCargo — Phase 4 Progress Report

**Phase:** 4 — Customers, shipments, tracking, operations
**Status:** ✅ Complete. Awaiting approval for Phase 5.
**Date:** 2026-10-18

---

## 1. Scope delivered

- **Customer service** — create (allocates `OR-####` refs from 3000), update, get, and **server-side paginated** list; **object-level ownership** (a customer principal only ever sees its own record) and country scoping for staff.
- **Shipment service** — create (allocates `W-`/`C-`/`R-` codes per mode+country+year, globally unique with `@ISO<year>` collision suffix), list (paginated, filtered, scoped), get (customer principals limited to shipments carrying their own line), add line, assign tracking.
- **Shipment state machine** (`stateMachine.ts`) — documented allowed transitions; `changeShipmentStatus` validates the transition, enforces `shipments:status` + scope, writes an **append-only `ShipmentEvent`** and audit entry in one **transaction**, sets departed/arrived timestamps, and is **idempotent** on `idempotencyKey`.
- **Secure tracking numbers** — `ORB-<year>-<6 Crockford-base32>` from `crypto`, uniqueness-checked with retry.
- **Public tracking** (`publicTracking.ts`) — unauthenticated lookup returning the **approved subset only** (number, customer-facing status, mode, origin/destination, milestone timestamps); internal notes/PII/financials/documents excluded by construction.
- **UI** — real public `/track` page (search + result timeline, no auth); admin `/shipments` list (paginated, status tone badges) and `/customers` list with a working **authorized "new customer" form** (server action → service → revalidate).
- **Decisions resolved** — ADR-007 (status vocabulary), ADR-008 (public tracking privacy).

## 2. Checks performed (actual results)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint` | ✅ clean |
| Unit | `npm test` | ✅ 12 passed |
| **Integration (DB)** | `npm run test:integration` | ✅ **37 passed** (9 schema + 17 auth/authz + 11 shipments/customers) |
| **E2E (prod build)** | `npm run test:e2e` | ✅ **6 passed** |
| Production build | `npm run build` | ✅ builds; `/shipments` `/customers` `/track` dynamic |

**New Phase 4 tests cover:** sequential `W-`/`C-` code + `OR-` ref generation; tracking-number format + uniqueness + idempotent assignment; create-shipment permission **and** country/year scope denial; legal vs **illegal state transitions**; **event idempotency** (no duplicate on repeated key); `shipments:status` required; **public tracking exposes only the whitelisted keys and hides internal notes** (unknown number → null); **customer IDOR** (customer sees only shipments with their own line; cross-customer read rejected); pagination + status filter; customer `getCustomer` ownership + scoped `listCustomers`. **E2E:** public-tracking not-found; authorized customer creation end-to-end.

## 3. Notes / deferrals

- **Operations = shipment status/milestone management** for now; no standalone Task entity was added (not in the data model). The **transfer (send/receive) workflow** is deferred to Phase 7 (admin operations) — the schema already supports `transferRole` + country scoping.
- Full admin **create/edit shipment** forms are intentionally light here; the services + status actions exist and are tested, with richer admin UI planned for Phase 7.
- Customer login via reference + phone + OTP (DS flow) remains a Phase 6 portal concern; staff/customers currently authenticate by email + password.

## 4. Exact next step (Phase 5 — awaiting approval)

Quotes, charges, invoices, payments and financial integrity: confirm the canonical charge-line fields (OPEN decision), server-recomputed totals, payment allocation (partial/over/refund/reversal), currency precision/rounding, transactions + idempotency for financial mutations, financial audit entries, and the rounding/partial-payment/concurrency tests.

**STOP — Phase 4 complete. Awaiting approval before Phase 5.**
