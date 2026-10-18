# OrbitCargo — Data Model Plan (Phase 0 proposal)

**Status:** Proposal, derived from business logic found in `design-reference/.../ui_kits/shared/data.js` and screens. Not yet implemented. Field lists are a starting point for Phase 2 and require owner confirmation where flagged.
**Date:** 2026-10-18

Design principles: PostgreSQL as source of truth; normalized models; FKs + unique constraints + indexes + check constraints + explicit deletion policies; **transactions** for multi-step/financial changes; **decimal** money/weights; explicit currency; idempotency where required; **no hard-delete of financial/audit history**; no production seeding with fake data.

---

## 1. Entities (proposed)

### Identity & access
- **User** — `id`, `email` (unique, citext), `passwordHash`, `status` (active/suspended/invited), `mfaEnabled`, `employeeId?` (link to staff), `customerId?` (link to customer), timestamps. A user is **either** staff **or** a customer contact (enforced).
- **Role** — `id`, `key`, `name`. Seeded from the agreed matrix (see PERMISSION_MATRIX).
- **Permission** — `id`, `key` (e.g. `shipments:write`, `finance:read`). 
- **RolePermission** — join (Role ↔ Permission).
- **UserRole** — join (User ↔ Role), optionally **scoped** by `country` / `businessYear` (see §4).
- **Session** — managed by Auth.js (server-side), with rotation/invalidation.
- **PasswordResetToken** — `tokenHash` (not raw), `userId`, `expiresAt`, `usedAt`, single-use.
- **Invitation** — `tokenHash`, `email`, intended role(s), `expiresAt`, `acceptedAt`.
- **AuditEvent** — `id`, `actorUserId`, `action`, `entityType`, `entityId`, `metadata (jsonb, redacted)`, `ip`, `userAgent`, `createdAt`. **Append-only.**

### Staff
- **Employee** — `id` (`EMP-###`), `name`, `phone`, `email`, `department`, `active`, `transferRole` (none/send/receive), timestamps. 
- **EmployeeScope** — `employeeId`, `country`, (optional `page`/`accessLevel` overrides mirroring DS `access{}`). *Scope model to confirm (D2).*

### Customers
- **Customer** — `id`, `ref` (`OR-####`, unique), `name`, `phone`, `email?`, `country?`, `createdAt`, soft-status. **Tier is derived, not stored** (or stored as a cached snapshot per year) — see §3.
- **CustomerContact / User link** — customers log in via a `User` bound to `customerId`.

### Shipments
- **Shipment** — `id`, `code` (e.g. `W-12`/`C-7`, unique **within** year+mode+originCountry; collision suffix policy), `mode` (AIR/SEA/ROAD), `originCountry`, `originCity`, `destCountry`, `destCity`, `status`, `businessYear`, `departedAt?`, `arrivedAt?`, timestamps, `createdByUserId`.
  - **Mode-specific detail kept separate** (do not overload one field):
    - **AirDetail** — AWB number, flight ref, chargeable weight (kg, decimal).
    - **SeaDetail** — container ref(s), B/L number, volume (CBM, decimal).
    - **RoadDetail** — vehicle/driver ref, local route.
- **ShipmentEvent** — `id`, `shipmentId`, `type` (milestone/delay/exception/delivery/scan), `status`, `note?`, `actorUserId`, `occurredAt`, `createdAt`. **Append-only** scan history (powers TrackingTimeline). Idempotency key to prevent duplicate events.
- **TrackingNumber** — unique, securely generated, collision-resistant (see Shipment workflow in Threat/Roadmap). Public tracking exposes an **approved subset** only.

### Finance
- **Quote** — `id`, `customerId`, `shipmentId?`, `currency`, `status` (draft/sent/accepted/expired), `expiresAt?`, totals **computed from line items**.
- **ChargeLineItem** — `id`, `parentType` (QUOTE/INVOICE), `parentId`, `category` (freight/local-delivery/customs-or-tax/service/other — **configurable**), `description`, quantity/`measure` (decimal), `rate` (decimal), plus the DS components (`quality`, `brandPcs`, `brandRate`, `fatura`, `delivery`, `other`, `discount`) **pending confirmation as canonical**, `currency`, computed `amount` (decimal, server-side). 
- **Invoice** — `id`, `number` (unique), `customerId`, `shipmentId?`, `currency`, `status` (unpaid/partial/paid/void), `issuedAt`, totals computed server-side; `balance` derived.
- **Payment** — `id`, `invoiceId?`/`customerId`, `amount` (decimal), `currency`, `method`, `reference`, `receivedAt`, `actorUserId`, idempotency key. **Never float.**
- **PaymentAllocation** — `paymentId`, `invoiceId`, `amount` (handles partial/overpayment/multi-invoice).
- **Reversal/Correction** — explicit records (no hard delete); link to original with `reason`.
- **ChargePolicy / Rate config** — configurable rates, categories, tax-like fees. **No invented customs/tax/FX rules**; unresolved ones documented.

### Documents
- **Document** — `id`, `ownerCustomerId?`/`shipmentId?`, `kind` (invoice/ID/cargo-doc/…), `storageKey` (server-generated, not user filename), `contentType`, `size`, `checksum`, `uploadedByUserId`, `visibility`, `createdAt`, soft-delete/retention fields. Files live in **private object storage**, never a public dir.

### Notifications & reporting
- **Notification / Announcement** — `id`, `audience` (customer/role/all), `type`, `title`, `message`, `status` (draft/scheduled/sent), `scheduledAt?`, `createdByUserId`. (DS has `AdminNotifications` + schedule.)
- **Reporting** — mostly **read models / aggregations** over the above (DS `Reports`, monthly air/sea/revenue). Prefer queries/materialized views over duplicated tables.

---

## 2. Relationships (summary)

- User 1–1 Employee **or** 1–1 Customer (exclusive).
- Customer 1–* Shipment; Shipment 1–1 {Air|Sea|Road}Detail; Shipment 1–* ShipmentEvent.
- Customer 1–* Quote / Invoice / Payment / Document.
- Quote/Invoice 1–* ChargeLineItem; Payment *–* Invoice via PaymentAllocation.
- Role *–* Permission; User *–* Role (scoped).
- Everything security-sensitive → AuditEvent.

## 3. Derived values (not authoritative columns)

- **Customer tier A/B/C/D** — computed from shipped Air kg / Sea CBM per business year (DS thresholds). Store only as an optional cached snapshot; recompute authoritatively.
- **Invoice/quote totals, balances** — computed server-side from line items + allocations; may be **persisted as a materialized total** updated transactionally, never client-supplied.

## 4. Scoping (RESOLVED — ADR-002)

Admin data scoped by **business year + country** (Turkey/India) **with per-employee page-level overrides**. `businessYear` column on year-scoped entities (Shipment, Invoice, …); country on Shipment and `EmployeeScope`; `EmployeeScope` also carries per-page `accessLevel` overrides. Authorization filters every query by the actor's allowed countries/years.

**Currency (RESOLVED — ADR-004):** USD only, 2-decimal, stored as Prisma `Decimal`; `currency` recorded explicitly on money-bearing rows to allow future expansion without silent mixing. No FX/multi-currency logic in scope.

## 5. Integrity rules

- Unique: `Customer.ref`, `Shipment.code` (composite within year+mode+country), `Invoice.number`, `TrackingNumber`, `User.email`.
- Check constraints: non-negative weights/amounts; `balance = total − allocated`; status enums.
- Transactions: shipment state change (+event +notification), invoice issue, payment + allocation.
- Idempotency keys: payment postings, shipment events, booking creation.
- Concurrency: optimistic version/`updatedAt` guard on Shipment and financial records (multiple staff editing).
- Deletion: soft-delete + retention for financial/audit; restrict destructive cascades; corrections via reversal records.

## 6. Open data decisions

See PROJECT_AUDIT §9 — especially charge-line canonical fields (§Finance), currency model, status vocabulary reconciliation, and scope model.
