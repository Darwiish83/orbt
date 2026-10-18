# OrbitCargo — Test Strategy (Phase 0)

**Status:** Strategy only. No tests written or run in Phase 0 (nothing to test yet).
**Date:** 2026-10-18

Core principle: **a passing suite is evidence of the tested behaviour, not proof of absolute security.** Tests are never suppressed, security checks never disabled, and validation never weakened to get a green build. No test is reported as passing unless it was actually executed and its result inspected. Production readiness is not claimed while any critical security test fails.

---

## 1. Test layers & tools

| Layer | Tool | Scope |
|---|---|---|
| Type checking | `tsc --noEmit` (strict) | Every phase. |
| Lint/format | ESLint + Prettier | Every phase. |
| Unit | **Vitest** | Pure domain logic: money/decimal math, totals, tiering, state-machine transitions, validation schemas, code generators. |
| Integration | **Vitest** + test PostgreSQL | Services + repositories + Prisma against a real DB (transactions, constraints, idempotency, concurrency). |
| Migration checks | Prisma | `migrate diff`/`deploy` on a clean DB; schema matches migrations; no drift. |
| Authorization (negative) | Vitest/Playwright | Deny-by-default, IDOR, cross-customer, privilege escalation. |
| E2E | **Playwright** | Critical user journeys across customer + admin. |
| Visual regression | **Playwright screenshots** | Parity vs. `design-reference` at manifest viewports. |
| Dependency audit | `npm audit` / scanner in CI | Known-vuln dependencies. |

A **test database** is provisioned per run (migrated, seeded only with **clearly-labelled test fixtures**; never production/real data).

## 2. Mandatory test scenarios (from the prompt — must all exist and pass before relevant phase sign-off)

- **Unauthorized access** — unauthenticated requests to protected pages/APIs/actions/downloads are rejected.
- **Cross-customer access** — Customer A cannot read/modify Customer B's shipment, invoice, payment, or document (object-level IDOR).
- **Unauthorized financial operation** — operational staff without finance permission cannot create/alter invoices or payments.
- **Role escalation** — a user cannot grant themselves or widen permissions; submitted role/user IDs are ignored.
- **Invalid shipment transitions** — transitions not allowed by the state machine are rejected server-side.
- **Duplicate & concurrent** — duplicate booking / duplicate financial posting / duplicate shipment event blocked by idempotency; concurrent edits resolved by optimistic concurrency without lost updates or double-posting.
- **Uploads** — invalid type, oversized, and content-mismatched uploads rejected; path traversal / unsafe filenames neutralised; download authz enforced.
- **Malformed input / injection** — Zod rejects malformed input; Prisma parameterization prevents SQL injection; no XSS via rendered fields.
- **Financial correctness** — decimal rounding, partial payments, overpayment, allocation, balance = total − allocated; no float drift; currencies never silently mixed.
- **Session & reset** — session invalidation on logout/privilege change; password-reset token is single-use and expires (reuse rejected).
- **Failure handling** — DB transaction rollback on mid-operation failure leaves no partial financial/shipment state.

## 3. Visual-regression approach (preserving the approved design)

- Baseline screenshots captured from the `design-reference` UI kits at the **manifest viewports** (admin `1440x900`, portal `1280x800`, customer app `1200x980`, mobile `1320x900`, plus phone widths).
- Implemented screens compared at matching viewports; diffs reviewed so backend integration (loading/empty/error states) does not drift the approved visuals.
- Tokens, type, spacing, logos, status colours, RTL (Arabic) layout all covered.

## 4. Coverage expectations

- **Domain/finance/authorization logic:** high coverage with explicit negative cases (not just happy path).
- UI primitives: render + interaction + accessibility (focus ring, keyboard, ARIA) tests.
- Coverage thresholds enforced in CI; critical modules (auth, authz, finance) held to a higher bar. Exact numbers set in Phase 1.

## 5. CI gating

Pipeline (per PR / per phase): typecheck → lint → unit → integration (with DB) → migration check → authorization tests → E2E → visual regression → dependency audit. **Red = blocked.** No `.skip`/`.only` or disabled security assertions merged.

## 6. Per-phase application

Each phase runs the **applicable subset** and records actual results in its progress report. Security-critical phases (3, 5, 8) require the full relevant negative-test set to pass before sign-off.
