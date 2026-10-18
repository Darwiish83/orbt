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

## Still open (not blocking Phase 1; to resolve by the phase noted)
- **Transfer (send/receive) workflow** — confirm scope & who initiates/settles. *(Phase 4)*
- **Shipment status vocabulary** — reconcile operational set (`At Origin Store/Departed/In Transit/Arrived`) with the customer-facing set in `readme.md`. *(Phase 4)*
- **Charge-line canonical fields** — confirm `measure/rate/quality/brandPcs/brandRate/fatura/delivery/other/discount` as the canonical model and which are configurable. *(Phase 5)*
- **Public tracking privacy** — exact approved subset exposed via a tracking number. *(Phase 4)*
- **MFA availability** — depends on chosen Auth.js config; implement or document gap + rollout. *(Phase 3)*
