# OrbitCargo — Phase 2 Progress Report

**Phase:** 2 — Domain model, PostgreSQL schema, Prisma migrations
**Status:** ✅ Complete. Awaiting approval for Phase 3.
**Date:** 2026-10-18

---

## 1. Scope delivered

- **Prisma 6.19 + PostgreSQL 16** (dedicated Docker container on port 5433, isolated from the unrelated Postgres on 5432). Dev DB `orbitcargo`, test DB `orbitcargo_test`.
- **Domain schema** (`prisma/schema.prisma`) — 23 models + 16 enums covering: identity/access (User, Role, Permission, RolePermission, UserRole with country/year scope), staff (Employee, EmployeeScope, EmployeePageAccess), Customer, shipments (Shipment + Air/Sea/Road detail + ShipmentLine + append-only ShipmentEvent), finance (Quote, Invoice, ChargeLineItem, Payment, PaymentAllocation), Document, Notification, and append-only AuditEvent.
- **Integrity:** FKs with explicit delete policies (**`Restrict` on financial/history**, `Cascade` only on owned children, `SetNull` where appropriate), unique constraints (customer ref, shipment code composite, invoice number, tracking number, idempotency keys), indexes, enums, and **decimal** money/weight columns (ADR-004).
- **CHECK constraints** (appended to the migration SQL — Prisma can't express them): single-principal user (employee XOR customer), charge-line parent XOR + matching `parentType`, positive payment/allocation amounts, invoice `amountAllocated ≤ total`, non-negative weights/volumes/packages, sane business year.
- **Scoping** (ADR-002): `businessYear` + `country` columns and `EmployeeScope` / `EmployeePageAccess` for per-employee page overrides.
- **One versioned migration** (`20261018135210_init`) applied cleanly to both dev and test DBs.
- **Reference-data seed** (`prisma/seed.ts`) — roles + permission catalogue only, idempotent (upserts). **No fake customers/shipments/payments.**
- **Prisma client singleton** (`src/db/client.ts`); env validation now requires a Postgres `DATABASE_URL`.
- **Integration test harness** (`vitest.integration.config.ts`, `tests/integration/`) running against the real test DB with per-test truncation and a guard that refuses any non-test database.

## 2. Checks performed (actual results)

| Check | Command | Result |
|---|---|---|
| Schema validity | `npx prisma validate` | ✅ valid |
| Migration apply (dev) | `npx prisma migrate dev` | ✅ applied (incl. CHECK constraints) |
| Migration apply (test) | `prisma migrate deploy` (test URL) | ✅ applied |
| Migration status | `npx prisma migrate status` | ✅ up to date, no drift |
| Client generate | `npx prisma generate` | ✅ generated (v6.19.3) |
| Seed | `npx prisma db seed` | ✅ 9 roles, 35 permissions, 85 links |
| **Integration tests** | `npm run test:integration` | ✅ **9 passed** (unique, CHECK ×4, FK Restrict, decimal exactness, audit) |
| Unit tests (regression) | `npm test` | ✅ 12 passed |
| Type check | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint` | ✅ clean |

Integration tests verify the DB **actually rejects**: duplicate customer ref, duplicate event idempotency key, zero/negative payment, dual-principal user, invoice over-allocation, negative line weight, deleting a customer with an invoice (Restrict); and that `1234567.89` round-trips exactly with `currency = USD`.

## 3. Design decisions worth noting

- **Charge-line fields kept generic** (category/quantity/unitPrice/amount). The DS-specific fields (quality, brand, fatura, …) are an **OPEN decision (Phase 5)** and are intentionally not baked in yet.
- **Shipment is a consolidation**; customers attach via `ShipmentLine` (matching the DS, where a W-/C- shipment carries many customers' lines). Mode-specific transport detail lives in separate `AirDetail`/`SeaDetail`/`RoadDetail` tables (prompt §4: don't overload one field).
- **Customer tier (A/B/C/D) is derived, not stored** (per DATA_MODEL_PLAN).
- **Auth tables** (Account/Session/VerificationToken, password-reset tokens) are deferred to Phase 3, where authentication is built.

## 4. Follow-ups / notes (not blocking)

- `package.json#prisma.seed` triggers a Prisma 7 deprecation warning; migrate to `prisma.config.ts` in a later phase.
- Production will use a **least-privilege DB role** and managed secrets (Phase 9); dev uses the container's `orbit_app` role.
- The dedicated Postgres container must be running for `db:*` and integration tests (see `docs/DATABASE.md`).

## 5. Exact next step (Phase 3 — awaiting approval)

Authentication, sessions, roles, permissions and **server-side authorization** with negative-access tests: Auth.js (credentials + sessions), Argon2id hashing, password reset (hashed/expiring/single-use), rate limiting, and the deny-by-default authorization guards + the mandatory negative-authorization test suite (unauthorized, cross-customer, unauthorized-finance, escalation, self-grant). Replaces all design-system fake auth.

**STOP — Phase 2 complete. Awaiting approval before Phase 3.**
