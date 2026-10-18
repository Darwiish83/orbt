# OrbitCargo — Production Launch Checklist

Do not claim production readiness while any critical security test is failing.

## Configuration & secrets
- [ ] Production `DATABASE_URL` points at the managed DB with a **least-privilege** app role (not a superuser).
- [ ] `AUTH_SECRET` is a fresh ≥32-char random value from the secrets manager (not reused from dev).
- [ ] `APP_URL` is the public HTTPS origin; boot-time env validation passes.
- [ ] No real `.env*`, keys, or dumps in the repo; only `.env.example`.
- [ ] No `NEXT_PUBLIC_*` secret; source maps disabled; `x-powered-by` off.

## Data & migrations
- [ ] `prisma migrate deploy` applied cleanly; `migrate status` shows no drift.
- [ ] Reference seed (roles/permissions) applied; **no fake customers/payments** seeded.
- [ ] A verified recent backup exists; **restore tested** into a fresh DB.

## Security
- [ ] CSP + security headers present on responses (checked in E2E).
- [ ] Session cookies are Secure, `httpOnly`, `SameSite`; HSTS on.
- [ ] Full negative-authorization suite passes (unauthorized, cross-customer, unauthorized-finance, escalation, self-grant).
- [ ] Rate limiting active on login/reset; password reset single-use + expiring.
- [ ] Private document storage is non-public; upload/download authorized; signed URLs short-lived.
- [ ] Dependency audit reviewed (`npm audit`); no unresolved high/critical.
- [ ] MFA for privileged accounts implemented **or** the documented gap (ADR-006) explicitly accepted by the owner.

## Operations
- [ ] `/api/health` wired to the load balancer; TLS terminates in front of the app.
- [ ] Error monitoring reporter wired (`setErrorReporter`); logs redact secrets.
- [ ] Nightly backups scheduled, retained off-host and encrypted.
- [ ] Rollback & incident-response plan reviewed with on-call.

## Business sign-off (owner)
- [ ] Role/permission matrix approved (DS 7-role set, ADR-001).
- [ ] Charge categories / customs / tax / FX rules provided (not invented).
- [ ] Transfer workflow scope confirmed (ADR-011).
- [ ] Data retention / deletion policy for documents and audit confirmed.
