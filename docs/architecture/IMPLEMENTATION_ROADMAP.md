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

## Phase 6 — Private documents, customer portal, notifications ✅ (complete 2026-10-18 — see progress/PHASE_6_REPORT.md)
**Scope:** private FS storage behind a Storage interface (ADR-010); validated uploads (type/size/magic-byte, random keys, traversal-safe); authz on upload & download; short-lived HMAC signed URLs; self-scoped customer portal (shipments/invoices/documents); notifications service.
**Acceptance:** ✅ upload/download authz, invalid/oversized/traversal, signed-token tests pass (11 document of 61 integration) · ✅ customer portal upload/download E2E (7 total) · ✅ customers see only their own data · ✅ typecheck/lint/build clean.

## Phase 7 — Admin management, reporting, localization, UI completeness ✅ (complete 2026-10-18 — see progress/PHASE_7_REPORT.md)
**Scope:** functional authorized admin pages for every nav item (users/roles, customers, shipments + status, operations, finance create/pay, documents, reports, notifications, settings, transfer); transfer workflow (ADR-011); reporting read-models; RTL + DS-vocabulary i18n with English fallback; loading/empty/error/success states.
**Acceptance:** ✅ 8 admin integration tests (69 total) + 7 E2E pass · ✅ typecheck/lint/build clean · ✅ no placeholder/fake buttons (every button wired to a tested service). Visual-regression baselines are captured in Phase 8.

## Phase 8 — Security hardening, integration, E2E, visual regression ✅ (complete 2026-10-18 — see progress/PHASE_8_REPORT.md)
**Scope:** nonce CSP + secure headers (middleware, tested in E2E), CSRF posture, `npm audit` in CI, structured logging + redaction, health check; full integration + E2E + visual-regression sweep; sourcemaps/powered-by off.
**Acceptance:** ✅ full mandatory scenario set passes (14 unit + 69 integration + 9 smoke + 2 visual E2E) · ✅ CSP verified not to break hydration · ✅ no secrets in bundles/logs/source maps · ✅ CI workflow added.

## Phase 9 — Deployment preparation & launch review
**Scope:** dev/test/prod separation; env-var validation; secret config; production migrations; HTTPS + secure cookies; private storage; **DB backup + tested restore**; error monitoring/logs; CI security checks; rollback & incident-response plan; production launch checklist.
**Acceptance:** backup/restore verified; launch checklist satisfied; **no production-readiness claim while any critical security test fails**; no real `.env`/credentials/dumps committed.

---

### Cross-cutting guardrails (all phases)
No destructive production migrations/deletes without explicit approval + verified recovery; no real payment claims without a verified provider integration; mock data only in isolated dev/test fixtures; preserve the approved OrbitCargo design throughout; never trade security or data integrity for speed or visual convenience.
