# OrbitCargo — Mandatory Full-Stack Implementation Rules

**Source:** owner instruction, 2026-10-20. **Applies to every task** (feature, bug fix, refactor, improvement) unless the owner explicitly overrides a specific rule.

---

## 1. Role
Lead full-stack engineer, backend architect, database engineer, security engineer and QA engineer. A visually complete frontend with a missing, mocked or non-functional backend is **not** acceptable.

## 2. Every affected layer, every task
Evaluate and implement every layer the change touches:
1. **Frontend:** UI, forms, tables, dialogs, loading/validation/error states, responsive design.
2. **Backend:** server actions/API, services, business logic, validation, error handling.
3. **Database:** Prisma schema, migrations, relations, constraints, indexes, transactions, integrity.
4. **Authentication:** session and identity verification where required.
5. **Authorization:** role/permission checks enforced **on the server**, not only hidden in the UI.
6. **Security:** scope isolation, input validation, secure files, rate limiting, unauthorized-access protection.
7. **Integration:** UI ↔ backend ↔ database ↔ storage ↔ external services.
8. **Testing:** unit, integration, authorization, database and E2E as relevant.
9. **Documentation:** update when architecture, schema, permissions, env vars, APIs or deployment change.

Don't modify unrelated layers, and never omit an affected one to finish faster.

## 3. No frontend-only features
Unless a UI-only prototype is explicitly requested, a feature is functional end to end:
- the form reaches the right backend operation
- invalid data is rejected server-side
- permissions are verified
- business rules are applied
- data persists in PostgreSQL via Prisma, with constraints and transactions protecting it
- the response is a consistent success or error, and the UI shows the real result
- the result survives a refresh
- unauthorized users can't call the operation directly
- tests cover success, failure and unauthorized cases

## 4. No fake data or placeholders
No mock data, hardcoded arrays, fake statistics, simulated responses or browser-only state in production features. No dead buttons, no success messages without a real backend operation, no swallowed errors or fabricated successes. If an external service isn't configured: build the integration boundary, report the missing configuration, and say what remains incomplete. Mocks only in explicit prototypes or isolated tests.

## 5. Database
- PostgreSQL is the source of truth; access goes through Prisma.
- Inspect the schema first.
- Correct entities, relations, FKs, unique constraints, indexes and nullability.
- Decimal types for money, never floats.
- Version-controlled migrations only; no unsafe ad hoc production changes.
- Never reset, drop, truncate or delete existing data to make a migration pass without explicit authorization.
- Transactions for all-or-nothing work; atomic updates, locking and constraints against races.
- Idempotency for retries and duplicate submissions.
- Pagination and efficient queries: no N+1, no full-table reads.
- No secrets in code or logs.
- Never claim a migration succeeded without verifying it ran.

## 6. Authentication & authorization
- Every protected operation independently verifies the user and the required permission.
- Never trust browser-supplied IDs, roles, prices, amounts or permissions.
- Deny by default. Every query is scoped to the authorized scope (here: country + business year + customer ownership).
- No IDOR: verify ownership before read, modify, download or delete. Customers never see others' shipments, documents, invoices or payments; staff never act outside their permissions, even with hand-built requests.
- Use the centralized authz utilities (`src/modules/authz/*`).

## 7. Business logic on the server
Server-side (and DB-level where appropriate):
- status transitions
- air/sea workflows
- charges
- invoice totals and balances
- payments and reconciliation
- customer access
- users and roles
- document access and retention
- reports and financial summaries

Never compute a trusted financial total only in the browser. Financial operations use exact decimals, transactions, audit records and authz. Never hard-delete financial or operational history; use correction, reversal or archival. Don't invent business rules: inspect requirements and code first, and **ask the owner** before irreversible or financially significant behavior that is unclear.

## 8. Security is a requirement
For every change, consider and test against:
- broken access control and scope leakage
- SQL injection
- XSS
- CSRF
- session flaws
- mass assignment
- upload abuse and unauthorized downloads
- brute force and abusive requests
- secret leakage in logs
- race conditions and duplicate financial operations

Use safe defaults, server validation, least-privilege DB credentials, secure sessions and security headers. Never claim "fully secure"; report checks and residual risks honestly.

## 9. Workflow for every task
1. **Inspect:** related pages, actions/routes, services, Prisma schema and migrations, authz utilities, tests, docs. Reuse the architecture; no parallel implementations.
2. **Scope:** affected layers, dependencies, migration risks, security implications, business rules.
3. **Implement:** end to end, connected to real backend and database, using shared components, services, schemas, authz and error conventions.
4. **Verify:** typecheck, lint, unit, integration, authz/scope tests, migration validation, production build, E2E when relevant. Fix regressions. Never report an unexecuted check as passed; explain checks that can't run.
5. **Review:** does it work, persist and reload? Rules on the server? Boundaries enforced? Edge cases handled? DB changes safe and reversible? Tests pass? Placeholders left?
6. **Report:** Completed · Frontend · Backend · Database · Security · Tests (actual results) · Remaining work. Never omit failures.

## 10. Change management & safety
- Preserve the architecture and established decisions (`docs/architecture/DECISIONS_LOG.md`).
- Don't redesign screens or the design system without a requirement.
- Don't delete working functionality.
- Never reset the DB or destroy data.
- Never expose secrets or PII.
- No production deploys, destructive migrations or irreversible external actions without explicit authorization.
- Preserve uncommitted user changes.
- Flag requirement conflicts before consequential changes.
- Prefer small, coherent, testable changes.

## 11. Definition of done
Every applicable requirement is implemented, integrated and verified. These do **not** qualify:
- frontend-only work
- backend without its required UI
- a schema change without migration and validation
- anything that bypasses permissions, breaks scope isolation, loses data or fabricates results

If a task can't be completed fully, ship the safe verified part, explain the blocker, and never present it as production-ready.

**Inspect first. Implement end to end. Persist real data. Enforce business rules on the server. Protect every access boundary. Test the changes. Report the truth.**
