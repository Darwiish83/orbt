# OrbitCargo — Decisions Log

Authoritative record of resolved decisions. Supersedes the "open decision" notes elsewhere in `docs/`.

| # | Date | Decision | Choice | Rationale / impact |
|---|---|---|---|---|
| ADR-001 | 2026-10-18 | **Role set** | **DS 7-role set** + Customer: Super Admin, Operation Admin, Operation Staff, Finance Admin, Finance Staff, Customer Support, Document Officer, Report Manager, Customer. | Matches the approved admin UI (Shell nav, Users screen) exactly. Permission matrix built on these roles. |
| ADR-002 | 2026-10-18 | **Access scoping** | **Country + business year + per-employee page-level overrides.** | Full fidelity to the DS admin behaviour. Staff scoped to assigned countries (Turkey/India) and active business year; `EmployeeScope` carries per-page `accessLevel` overrides. Authorization filters every query by actor's allowed countries/years. |
| ADR-003 | 2026-10-18 | **Styling approach** | **Tailwind bridged to the DS token CSS variables.** | Tokens remain the source of truth as CSS vars (exact approved values); Tailwind `theme.extend` references the same vars. Ported components keep their look; new layout uses Tailwind utilities. Resolves ARCHITECTURE D1. |
| ADR-004 | 2026-10-18 | **Currency model** | **USD only, 2-decimal, decimal math (no JS float).** | Matches the DS (USD only). Amounts stored as Prisma `Decimal`; currency recorded explicitly to allow future expansion without silent mixing. |

| ADR-005 | 2026-10-18 | **Auth session strategy** | **Auth.js v5 (Credentials) + JWT sessions, with a per-user `sessionEpoch` re-checked server-side.** | The baseline mandates Auth.js; Auth.js Credentials only supports JWT sessions (DB sessions need an external IdP). JWT can't be revoked server-side alone, so the authorization layer loads the user on every protected access and compares `sessionEpoch`; password reset / forced logout bumps it to invalidate all tokens immediately. Argon2id for hashing. |
| ADR-006 | 2026-10-18 | **MFA scope (Phase 3)** | **Deferred (documented gap + rollout plan).** `mfaEnabled` hook exists; TOTP enrollment/verification is built in a later phase. | The baseline permits documenting the gap when MFA isn't in the implemented auth config. Keeps Phase 3 bounded to core auth + authorization. See THREAT_MODEL §residual risks. |

| ADR-007 | 2026-10-18 | **Shipment status vocabulary** | **Operational set in the DB; customer-facing labels as a presentation mapping.** | The DB uses `AT_ORIGIN_STORE/DEPARTED/IN_TRANSIT/ARRIVED/DELIVERED/ON_HOLD` (design-system operational set, drives the state machine). The readme's customer-facing words (Booked/Departed/In transit/Arrived/Delayed/Delivered) are produced by `publicStatusLabel` for public tracking only. |
| ADR-008 | 2026-10-18 | **Public tracking privacy** | **Approved subset only:** tracking number, customer-facing status, mode, origin/destination (city, country), and status-change milestone timestamps. | Excludes PII, financials, documents, internal notes, staff identities and raw internal codes. Enforced by an explicit `select` in `publicTracking.ts` and a test asserting the exact key set. |

## Still open (to resolve by the phase noted)
- **Transfer (send/receive) workflow** — schema supports `transferRole`/country scoping, but the operational send/receive flow (who initiates/settles) is **deferred to Phase 7** (admin operations). *(Phase 7)*
- **Charge-line canonical fields** — confirm `measure/rate/quality/brandPcs/brandRate/fatura/delivery/other/discount` as the canonical model and which are configurable. *(Phase 5)*
- **MFA (TOTP)** — deferred with rollout plan (ADR-006); implement before production launch. *(later phase)*
