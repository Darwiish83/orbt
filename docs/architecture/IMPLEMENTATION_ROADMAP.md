# OrbitCargo — Implementation Roadmap (Phase 0)

**Status:** Phased plan. **Phase 0 is complete; Phases 1–9 are NOT started and require explicit per-phase approval.**
**Date:** 2026-10-18

Execution rule for every phase after approval: (1) inspect current state & prior phases → (2) state precise scope + acceptance criteria → (3) implement only that phase (+ necessary compatibility fixes) → (4) run relevant tests/security checks → (5) review for regressions and unintended design changes → (6) update docs/migration notes/progress → (7) **stop and wait for approval**. Unresolved major decisions are raised as questions, never invented.

---

## Phase 0 — Audit & planning ✅ (this phase)
**Done:** archive inspected, design inventoried, architecture/data-model/threat-model/permission-matrix/test-strategy drafted; read-only design reference established; original ZIP preserved; nothing overwritten.
**Deliverables:** the seven docs in `docs/`.

## Phase 1 — Application foundation ✅ (complete 2026-10-18 — see progress/PHASE_1_REPORT.md)
**Scope:** Next.js 15 + TS strict + Tailwind (bridged to token CSS vars) + ESLint/Prettier; commit lockfile; env-var validation skeleton + `.env.example`; root layout + navy admin **Shell**/topbar + customer layouts; i18n (EN/SO/AR + RTL) ported from DS dictionaries; `next/font` for Archivo + JetBrains Mono; migrate the **first batch of DS primitives** (Button, Input, Card, Badge, Tag, Icon→`lucide-react`) to typed components; Vitest + Playwright configured.
**Acceptance:** ✅ typecheck/lint clean · ✅ build + prerender · ✅ 12 unit + 4 E2E pass · ✅ token values match DS · ✅ brand parity confirmed in-browser · ✅ SO/AR + RTL working.
**Decisions confirmed:** D1 Tailwind-over-tokens (ADR-003), D4 `lucide-react`, D5 React 19.

## Phase 2 — Domain model & database ✅ (complete 2026-10-18 — see progress/PHASE_2_REPORT.md)
**Scope:** Prisma schema for confirmed entities (DATA_MODEL_PLAN); initial versioned migrations; constraints (FK/unique/check), indexes, deletion policies; decimal money/weight columns; test DB provisioning; **no production seed**.
**Acceptance:** ✅ migration applies cleanly to fresh dev + test DBs · ✅ 9 integration tests (constraints/integrity/decimal) pass · ✅ `migrate status` no drift · ✅ reference-data seed only · ✅ typecheck/lint/unit regression clean.

## Phase 3 — Auth, sessions, roles, permissions ✅ (complete 2026-10-18 — see progress/PHASE_3_REPORT.md)
**Scope:** Auth.js (credentials + JWT with sessionEpoch re-check, ADR-005); Argon2id hashing; password reset (hashed, expiring, single-use); DB-backed rate limiting; **server authorization guards** (deny-by-default, object-level); MFA documented gap + plan (ADR-006); replaced all DS fake-auth.
**Acceptance:** ✅ negative-authorization suite passes (unauthorized, cross-customer IDOR, unauthorized-finance, escalation, self-grant) · ✅ session-invalidation + reset single-use/expiry + rate-limit tests pass · ✅ 26 integration + 4 E2E pass · ✅ typecheck/lint/build clean · no client-trusted authz.

## Phase 4 — Customers, shipments, tracking, operations ✅ (complete 2026-10-18 — see progress/PHASE_4_REPORT.md)
**Scope:** customer CRUD (scoped); shipment service with mode-specific detail; **documented state machine** + server-validated transitions + append-only idempotent events; secure unique tracking numbers; public tracking (approved subset, ADR-008); status vocabulary resolved (ADR-007); server-side pagination/filtering; country/year scoping. Transfer workflow deferred to Phase 7.
**Acceptance:** ✅ invalid-transition, IDOR, tracking-privacy, pagination, duplicate-event tests pass (37 integration + 6 E2E) · ✅ typecheck/lint/build clean · real `/track`, `/shipments`, `/customers` pages on-brand.

## Phase 5 — Quotes, charges, invoices, payments, financial integrity ✅ (complete 2026-10-18 — see progress/PHASE_5_REPORT.md)
**Scope:** generic categorized charge lines (ADR-009); **server-recomputed** totals; invoices; payments + allocations (partial/over/reversal); decimal currency precision/rounding; transactions + idempotency; financial audit; no client-supplied amounts; no invented tax/FX/customs rules.
**Acceptance:** ✅ rounding/partial/overpayment/allocation/currency/idempotency/reversal tests pass (13 finance of 50 integration) · ✅ no float drift · ✅ no hard-delete of financial history · ✅ typecheck/lint/build clean.

## Phase 6 — Private documents, customer portal, notifications
**Scope:** private object storage; validated uploads (type/size/content, safe keys, path-traversal prevention); authz on upload & download; short-lived signed URLs; customer portal (track/shipments/quotes/invoices/documents, self-scoped); notifications/announcements + scheduling.
**Acceptance:** upload/download authz, invalid/oversized upload, traversal tests pass; customers see only their own data.

## Phase 7 — Admin management, reporting, localization, UI completeness
**Scope:** full admin (users/roles, customers, shipments, operations, finance, documents, reports, notifications, settings, transfer, accounting); reporting read-models; complete EN/SO/AR coverage incl. RTL; loading/empty/error/success states in the approved visual language.
**Acceptance:** admin journeys E2E pass; visual-regression parity across admin screens + RTL; no placeholder/fake buttons.

## Phase 8 — Security hardening, integration, E2E, visual regression
**Scope:** CSP + secure headers (tested), CSRF, dependency audit in CI, structured logging + redaction, health checks/monitoring hooks; full integration + E2E + visual-regression sweep.
**Acceptance:** full mandatory scenario set (TEST_STRATEGY §2) passes; CSP verified against fonts/icons/images; no secrets in bundles/logs/source maps.

## Phase 9 — Deployment preparation & launch review
**Scope:** dev/test/prod separation; env-var validation; secret config; production migrations; HTTPS + secure cookies; private storage; **DB backup + tested restore**; error monitoring/logs; CI security checks; rollback & incident-response plan; production launch checklist.
**Acceptance:** backup/restore verified; launch checklist satisfied; **no production-readiness claim while any critical security test fails**; no real `.env`/credentials/dumps committed.

---

### Cross-cutting guardrails (all phases)
No destructive production migrations/deletes without explicit approval + verified recovery; no real payment claims without a verified provider integration; mock data only in isolated dev/test fixtures; preserve the approved OrbitCargo design throughout; never trade security or data integrity for speed or visual convenience.
