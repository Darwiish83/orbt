# OrbitCargo — Deployment Guide

## Environments

Three isolated environments, each with its **own database and secrets**:

| Env | DB | Secrets | Notes |
|---|---|---|---|
| development | local Docker Postgres (5433) `orbitcargo` | `.env` (git-ignored) | `npm run dev` |
| test | local Docker Postgres (5433) `orbitcargo_test` | `.env.test` (git-ignored) | CI + integration tests |
| production | managed Postgres | injected env / secrets manager | containerized app |

Never commit real `.env*`, credentials, keys, or database dumps. Only
`.env.example` (placeholders) is committed. Secrets are server-only — no
`NEXT_PUBLIC_*` secret is ever defined.

## Required production environment variables

Validated at **boot** (`src/instrumentation.ts` → `src/lib/env.ts`); the process
refuses to start if any are missing/invalid:

- `NODE_ENV=production`
- `DATABASE_URL` — PostgreSQL, least-privilege app role
- `AUTH_SECRET` — ≥ 32 random chars (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
- `APP_URL` — the public **HTTPS** origin
- `DOCUMENTS_DIR` — private storage path (mounted volume) or S3 config (ADR-010)

## Build & run (container)

```bash
# Build the standalone production image
docker build -t orbitcargo:latest .

# Or the full stack (app + postgres) — fill .env first
docker compose -f docker-compose.prod.yml up -d --build
```

The app container runs `prisma migrate deploy` (forward, committed migrations
only) then starts the standalone server on port 3000. Front it with a TLS
terminator (reverse proxy / load balancer); the app sets HSTS and secure,
`httpOnly`, `SameSite` session cookies in production.

## Database migrations

- Development: `npm run db:migrate` (creates + applies).
- Production: `npx prisma migrate deploy` (applies committed migrations only).
- **Never** hand-edit production data or run destructive migrations without an
  approved plan and a verified recent backup (see ROLLBACK_AND_INCIDENT_RESPONSE).

## Backups & restore

- Back up: `DATABASE_URL=… scripts/backup-db.sh [out.dump]` (nightly cron
  recommended; retain per policy; store off-host, encrypted).
- Restore (tested): `DATABASE_URL=<fresh-db> scripts/restore-db.sh out.dump`.
  Restore into a **fresh** database and promote it; the script refuses to
  overwrite the primary DB unless `ALLOW_PROD_RESTORE=yes` (approved recovery).
- The backup→restore round-trip is verified in Phase 9 (row counts matched).

## Observability

- `/api/health` — DB connectivity probe (200 / 503) for load-balancer checks.
- Structured JSON logs with secret redaction (`src/lib/logger.ts`); wire
  `setErrorReporter` to an external monitor (e.g. Sentry) at startup.

## CI

`.github/workflows/ci.yml`: typecheck, lint, unit, migrate + integration
(Postgres service), build, `npm audit`; plus an E2E smoke job.
