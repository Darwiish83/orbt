# OrbitCargo — Threat Model (Phase 0)

**Status:** Initial threat model. Controls listed are **planned**, not yet implemented or tested. A passing test suite is evidence of tested behaviour, not proof of absolute security.
**Date:** 2026-10-18
**Method:** STRIDE + per-asset review, grounded in the gaps found in the design-system SPA.

---

## 1. Assets to protect

- Customer PII (names, phones, emails, addresses) and **customer-scoped data** (shipments, quotes, invoices, payments, documents).
- **Financial records** (charges, invoices, payments, balances) — integrity is paramount.
- **Private documents** (invoices, identity docs, cargo docs).
- **Credentials & secrets** (password hashes, reset tokens, session secrets, DB creds, storage keys, API keys).
- **Authorization state** (roles, permissions, scopes).
- **Audit trail** (must be tamper-evident/append-only).

## 2. Trust boundaries

- Browser (untrusted) ↔ Next.js server (trusted) — **all authz enforced here**.
- Server ↔ PostgreSQL (least-privilege creds).
- Server ↔ private object storage (signed, authorized access).
- Public tracking surface (unauthenticated) ↔ shipment data (filtered subset).

## 3. Baseline inherited from the design system (all must be replaced)

The DS SPA demonstrates the **exact anti-patterns** to eliminate:
- **Faked auth** — hardcoded `orbit2026`, fake OTP, role-picker impersonation (`AdminLogin.jsx`, `Shell.jsx`).
- **Client-side-only authorization** — `accessOf()` + `ViewOnly` DOM-click blocking; hidden nav items. **Trivially bypassable.**
- **All data in `localStorage`** — no server, no access control.
- **JS floating-point money** — rounding/consistency risk for financial integrity.
- **In-browser `eval`/Babel** (`support.js`) — excluded from production.

## 4. STRIDE analysis & mitigations (planned)

### Spoofing (identity)
- **Threats:** credential stuffing, weak passwords, session hijack/fixation, reset-token reuse.
- **Mitigations:** Auth.js server sessions; **Argon2id** (or scrypt/bcrypt with strong params) password hashing; password policy; **secure, `HttpOnly`, `SameSite`, `Secure` session cookies**; session **rotation on login/privilege change** and invalidation on logout/reset; password reset via **cryptographically random, hashed, expiring, single-use** tokens; rate limiting + lockout/backoff on login & reset; **MFA for privileged staff** (or documented gap + rollout plan).

### Tampering (data integrity)
- **Threats:** forged totals from client, parameter tampering, mass assignment, arbitrary shipment-status changes, duplicate financial postings.
- **Mitigations:** **server recomputes all authoritative totals** from validated line items; **Zod** allow-list validation (no mass assignment); documented **shipment state machine** with server-validated transitions; **transactions + idempotency keys** for financial and event mutations; optimistic concurrency guards; DB check constraints.

### Repudiation
- **Threats:** disputed financial/operational actions.
- **Mitigations:** **append-only AuditEvent** (actor, action, entity, timestamp, ip) for auth, role changes, financial mutations, document access, shipment-state changes; no hard-delete of financial/audit history; corrections as reversal records.

### Information disclosure
- **Threats:** **IDOR / cross-customer access**, over-broad staff access to finance/PII, public-tracking leakage, secrets in bundles/logs/source maps, verbose errors, direct document URLs.
- **Mitigations:** **every query/mutation scoped to the authorized actor** (customers see only their own; staff by permission + country/year scope); object-level checks on every read/download (not just route guards); **public tracking returns an approved subset** — never financials, private docs, internal notes, staff data; secrets server-only (no `NEXT_PUBLIC_*` leakage), source maps restricted; **safe error messages** (no stack traces/PII); documents in **private storage** behind authz with **short-lived signed URLs**; structured logs with **redaction**.

### Denial of service
- **Threats:** brute force, expensive queries, large/zip-bomb uploads, unbounded list endpoints.
- **Mitigations:** rate limiting on auth/reset and sensitive endpoints; **server-side pagination/filtering** (never load full tables); upload **size/type/content** validation; query timeouts; abuse monitoring.

### Elevation of privilege
- **Threats:** self-granted admin, role escalation via request params, horizontal/vertical privilege jumps.
- **Mitigations:** **deny-by-default, least privilege**; server derives the actor's roles/permissions from session — **never from submitted role/user IDs**; users **cannot grant themselves** permissions; role/invite/suspension changes gated by explicit authorization + audit; **automated negative-authorization tests** (see TEST_STRATEGY).

## 5. Application-security controls checklist (planned)

- [ ] Secure authentication + logout; session rotation/invalidation.
- [ ] Strong password hashing (Argon2id / strong params).
- [ ] Reset tokens: random, hashed-at-rest, expiring, single-use.
- [ ] Rate limiting / abuse protection (login, reset, sensitive APIs).
- [ ] Server-side input validation (Zod) on every mutation & sensitive query.
- [ ] Parameterized queries via Prisma (no raw string SQL with user input).
- [ ] XSS prevention; **no `dangerouslySetInnerHTML` with untrusted content**; safe output encoding.
- [ ] CSRF protection appropriate to Server Actions / route handlers.
- [x] Secure HTTP headers + tested **Content Security Policy** — **implemented (Phase 8):** nonce-based `script-src` + `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`, HSTS/XFO/nosniff/Referrer-Policy/Permissions-Policy; verified in E2E not to break hydration. (`style-src 'unsafe-inline'` retained for the inline-style DS — documented residual.)
- [ ] Env-var & secret management; least-privilege DB creds.
- [ ] Safe error handling (no stack traces/sensitive data to client).
- [ ] Audit logging for security-sensitive operations.
- [x] Dependency vulnerability checks in CI (`npm audit`) + committed lockfile — **CI added (Phase 8).**
- [x] Secure file upload/download — **implemented (Phase 6, ADR-010):** type+size validation with magic-byte sniffing, app-generated random storage keys (no user filename), storage-root containment check, object-level authz on upload **and** download, short-lived HMAC signed URLs, files kept outside the web root. (Malware scanning + retention automation remain for Phase 9.)
- [x] No secrets/PII/tokens in logs; **redaction implemented + unit-tested (Phase 8, `lib/logger.ts`).**

## 6. CSP / external-dependency notes

DS relies on external CDNs (React/Babel UMD, `jsdelivr` Lucide, `flagcdn`, `pexels`/`unsplash`). For production: remove runtime React/Babel (real build); deliver icons via `lucide-react`; **self-host or allow-list** flags/images; configure `next/image` remote patterns and CSP `img-src`/`font-src`/`script-src` explicitly and test.

## 7. Residual risks / to be tracked

- Payments: **no real provider integrated** — must not claim real payment processing until one is integrated & verified.
- Customs/tax/FX rules intentionally **not invented** — configurable + documented; business-owner sign-off needed.
- **MFA: deferred (ADR-006).** The Phase 3 Auth.js Credentials config does not yet include TOTP. `mfaEnabled` exists as a schema hook. Rollout plan: add TOTP enrollment (authenticator app) for privileged roles, store the secret encrypted, require a second factor at login for staff with elevated permissions, and provide recovery codes — scheduled for a later phase before production launch.
- Malware scanning for uploads, backup/restore, retention/deletion policies — to be defined (Phase 6/9).

**Nothing here is implemented in Phase 0.** Controls are verified in later phases with the tests in TEST_STRATEGY; production readiness is not claimed while any critical security test fails.
