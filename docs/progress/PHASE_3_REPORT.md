# OrbitCargo — Phase 3 Progress Report

**Phase:** 3 — Authentication, sessions, roles, permissions, authorization
**Status:** ✅ Complete. Awaiting approval for Phase 4.
**Date:** 2026-10-18

---

## 1. Scope delivered

- **Authentication** — Auth.js v5 (NextAuth) **Credentials + JWT** sessions (ADR-005). Login/logout via server actions; brand-correct `/login` page replacing the DS fake login.
- **Password hashing** — **Argon2id** (`@node-rs/argon2`, OWASP params) with constant-time-ish verification and a dummy-hash path to avoid user enumeration via timing.
- **Revocable sessions** — per-user `sessionEpoch`; `getSessionUser()` re-loads the user on every protected access and rejects the token if the account is gone/suspended or the epoch no longer matches. Password reset and forced logout bump the epoch → immediate invalidation of all tokens (the piece JWT alone can't do).
- **Password reset** — cryptographically random tokens, **SHA-256 hashed at rest**, **expiring (1h)** and **single-use** (transactional consume); unknown emails return null (no enumeration).
- **Rate limiting** — durable, DB-backed failure tracking (`LoginAttempt`), blocks after 5 failures / 15 min on login (and available for reset).
- **Authorization (deny-by-default, server-side)** — permission catalogue + pure `core.ts`: `requirePermission`, `hasScope`/`requireScope` (country + business year, ADR-002), and `assertCustomerAccess` for **object-level ownership (IDOR prevention)**. Role-assignment guards prevent **self-escalation** and non-super-admins granting `super_admin`.
- **Route protection** — edge middleware (coarse "must be logged in") **plus** a server-side auth gate in the admin layout (defense in depth); the admin shell shows the signed-in user + logout.
- **Schema** — migration `auth_tables`: `PasswordResetToken`, `LoginAttempt`, `User.sessionEpoch` / `lockedUntil`.
- **MFA** — deferred with a documented gap + rollout plan (ADR-006); `mfaEnabled` hook present.

## 2. Checks performed (actual results)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint` | ✅ clean |
| Unit | `npm test` | ✅ 12 passed |
| **Integration (DB)** | `npm run test:integration` | ✅ **26 passed** (9 schema + 17 auth/authz) |
| **E2E (prod build)** | `npm run test:e2e` | ✅ **4 passed** |
| Migration apply (dev + test) | `prisma migrate dev` / `deploy` | ✅ applied |
| Production build | `npm run build` | ✅ builds; `/dashboard` dynamic, middleware active |
| Browser verification | built-in browser | ✅ login → admin shell; unauth → redirect to /login |

**Negative-authorization suite (all pass):** deny-by-default for a role-less user; suspended account → denied; operations staff **cannot** perform finance ops (finance admin can); **cross-customer IDOR** blocked (customer sees only their own); staff without permission blocked; **no self-role-modification**; **non-super-admin cannot grant super_admin**; role assignment denied without `users:manage`. **Auth suite:** Argon2id verify/reject; valid/invalid credential verification; `sessionEpoch` bumped on reset + forced invalidation; reset token single-use + expiry + no-enumeration; rate limit after 5 failures. **E2E:** unauthenticated `/dashboard` → `/login`; invalid credentials → generic error; full login → shell → logout → re-protected.

## 3. Decisions (new)

- **ADR-005** — Auth.js Credentials + JWT with server-side `sessionEpoch` re-check (Credentials can't use DB sessions; this makes JWT revocable).
- **ADR-006** — MFA deferred (documented gap + rollout plan), per the baseline's allowance.

## 4. Issues hit and resolved

- `@node-rs/argon2` `Algorithm` is a const enum (incompatible with `isolatedModules`) → dropped it; Argon2id is the library default.
- Auth.js redirect initially went to port **3000** because `AUTH_URL` was hardcoded → removed `AUTH_URL` in dev and rely on `trustHost` (infers the request origin); set it explicitly in prod.
- E2E against the dev server was flaky due to on-demand route compilation → E2E now runs against a **production build** (deterministic).
- Logout label is localized → test targets a stable `data-testid`.

## 5. Follow-ups / notes (not blocking)

- **MFA (TOTP)** enrollment/verification — implement in a later phase (ADR-006).
- Rate limiting is DB-backed (fine for shared-DB deployments); consider a dedicated store at high load (Phase 9).
- The DS customer login flow (reference + phone + OTP) is **not** yet implemented; Phase 3 uses email+password. The customer portal auth UX is revisited in Phase 6.
- `scripts/create-admin.ts` is a **dev-only** helper (not production seed).

## 6. Exact next step (Phase 4 — awaiting approval)

Customers, shipments, tracking and operations: customer CRUD (scoped), the documented **shipment state machine** with server-validated transitions + append-only events, secure unique tracking numbers, public tracking exposing only an approved subset, server-side pagination/filtering, and the related authorization + invalid-transition + IDOR + tracking-privacy tests.

**STOP — Phase 3 complete. Awaiting approval before Phase 4.**
