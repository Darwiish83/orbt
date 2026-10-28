# OrbitCargo — Deployment Guide

## Environments

Three isolated environments, each with its **own database and secrets**:

| Env | DB | Secrets | Notes |
|---|---|---|---|
| development | local Docker Postgres (5433) `orbitcargo` | `.env` (git-ignored) | `npm run dev` |
| test | local Docker Postgres (5433) `orbitcargo_test`, `orbitcargo_e2e` | `.env.test` (git-ignored) | CI + integration / E2E tests |
| production | PostgreSQL 16 on the VPS (or managed) | the server's `.env`, owner-only | see §VPS below |

Never commit real `.env*`, credentials, keys, or database dumps. Only the
`.example` templates (placeholders) are committed. Secrets are server-only — no
`NEXT_PUBLIC_*` secret is ever defined.

Everything the business owns is in **one PostgreSQL database**: records,
money history, and since ADR-030 every uploaded document and announcement
image (`StoredFile`). One backup = everything; one restore = everything.

## Required production environment variables

Validated at **boot** (`src/instrumentation.ts` → `src/lib/env.ts`, then
`src/db/roleCheck.ts`); the process refuses to serve if any is missing/invalid
or if a database connection is a superuser, skips Row-Level Security, or owns
the tables:

- `NODE_ENV=production`
- `DATABASE_URL` — `orbit_runtime` (the app's least-privilege role)
- `PORTAL_DATABASE_URL` — `orbit_portal` (customer pages, Row-Level Security)
- `AUTH_SECRET` — ≥ 32 random chars (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
- `APP_URL` — the public **HTTPS** origin
- `RESEND_API_KEY`, `EMAIL_FROM` — a verified sending domain

Not on the app server's runtime environment: `MIGRATION_DATABASE_URL`
(`orbit_owner`, only for the migrate step) and `DATABASE_ADMIN_URL` (server
admin, only for `scripts/db-setup-roles.ts` and emergencies).

## VPS (recommended: Ubuntu 24.04, PostgreSQL 16 installed directly)

The owner runs these steps; nothing here needs Docker. Values in `<…>` are
yours; never paste passwords into chat or docs.

1. **Server basics** — non-root sudo user, SSH keys only (password login off),
   `ufw allow OpenSSH`, `ufw allow 80,443/tcp`, `ufw enable`, automatic security
   updates (`unattended-upgrades`).
2. **PostgreSQL 16** — `apt install postgresql-16` (from the PostgreSQL apt
   repository if the distribution has another version). Leave
   `listen_addresses = 'localhost'` (the default): the database is never
   reachable from the internet. Create the database:
   `sudo -u postgres createdb orbitcargo`. Give the `postgres` admin a strong
   password (`sudo -u postgres psql -c '\password postgres'`).
3. **Node 22 + the code** — install Node 22 LTS, `git clone` the private repo
   (deploy key, read-only), `npm ci`, `npx prisma generate`.
4. **Secrets** — create `.env` (`chmod 600`) with
   `DATABASE_URL=postgresql://postgres:<admin password>@localhost:5432/orbitcargo?schema=public`,
   a new `AUTH_SECRET`, `APP_URL=https://<your domain>`, `NODE_ENV=production`,
   `RESEND_API_KEY`, `EMAIL_FROM`.
5. **Roles** — `npx tsx scripts/db-setup-roles.ts`. It keeps the admin URL as
   `DATABASE_ADMIN_URL` and writes `DATABASE_URL` (runtime),
   `PORTAL_DATABASE_URL` and `MIGRATION_DATABASE_URL` with new random
   passwords. Afterwards move `DATABASE_ADMIN_URL` out of `.env` (e.g. into your
   password manager): the running app must not have it.
6. **Data** — either
   - **fresh start:** `npx prisma migrate deploy`, `npx prisma db seed`, then
     `npx tsx scripts/make-super-admin.ts --email <owner's email> --name "<name>" --link`
     (creates the owner as Super Admin; the link sets the password); or
   - **move the current data:** on the old computer
     `scripts/backup-db.sh orbit.dump` (with `MIGRATION_DATABASE_URL` from its
     `.env`, needs `pg_dump`; on the Windows PC without it:
     `docker exec orbitcargo-postgres pg_dump -U orbit_app -d orbitcargo -Fc --no-owner > orbit.dump`);
     copy the file with `scp` (it holds customers'
     data and documents: keep it private, delete copies afterwards); on the VPS
     `scripts/restore-db.sh orbit.dump` with `MIGRATION_DATABASE_URL` from the
     VPS `.env` and `ALLOW_PROD_RESTORE=yes` (the target is named `orbitcargo`),
     then `npx prisma migrate deploy` (nothing to apply = in sync).
     Check with `psql … -qAt -f scripts/db-fingerprint.sql` on **both** sides:
     every line must be identical (row counts, file hashes, triggers, policies,
     grants).
7. **Build and run** — `npm run build`; run `npm start` under systemd as an
   unprivileged user, `Environment=PORT=3000`, `Restart=always`, listening on
   localhost only. The app refuses to start on a wrong database role.
8. **HTTPS** — Caddy or Nginx in front, with a certificate (Caddy does it
   automatically). The proxy must **overwrite** `X-Forwarded-For` with the real
   client address (the per-IP login limit reads it).
9. **Email** — verify the domain in Resend and set `EMAIL_FROM` on it.
10. **Backups** — nightly cron of `scripts/backup-db.sh` (owner role),
    encrypted (e.g. `age` / `gpg`) and copied **off the server**; keep e.g. 14
    daily + 12 monthly. Test a restore into a scratch database every month.

Later deploys: `git pull`, `npm ci`, `npx prisma generate`, back up,
`npx prisma migrate deploy` (as owner via `MIGRATION_DATABASE_URL`),
`npm run build`, restart the service.

## Containers (alternative)

```bash
docker build -t orbitcargo:latest .
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate   # migrations, as orbit_owner
docker compose -f docker-compose.prod.yml up -d app
```

The image starts the server only; migrations are the separate `migrate`
service, so the app container never holds the owner's credentials. Roles are
created once with `scripts/db-setup-roles.ts` against the `db` service.

## Database migrations

- Written with `prisma migrate diff … --script` (see `CLAUDE.md`), applied with
  `npx prisma migrate deploy` (runs as `orbit_owner` via `directUrl`).
- **Never** hand-edit production data or run destructive migrations without an
  approved plan and a verified recent backup (see ROLLBACK_AND_INCIDENT_RESPONSE).

## Backups & restore

- Back up: `MIGRATION_DATABASE_URL=… scripts/backup-db.sh [out.dump]` — data,
  documents and images, grants and Row-Level Security in one file.
- Restore: into a **fresh** database prepared with `scripts/db-setup-roles.ts`:
  `MIGRATION_DATABASE_URL=<fresh-db owner URL> scripts/restore-db.sh out.dump`.
  Objects become owned by `orbit_owner`, the dump's exact grants come back, and
  protective triggers are paused only for the restore session. The script
  refuses the primary database name unless `ALLOW_PROD_RESTORE=yes`.
- Verified 2026-10-27: dev → fresh database, `scripts/db-fingerprint.sql`
  identical on both (462 rows, 16 files with hashes, 24 triggers, 38 policies,
  18 RLS tables, grants), app reads files and is refused deleting invoices.

## Observability

- `/api/health` — DB connectivity probe (200 / 503) for load-balancer checks.
- Structured JSON logs with secret redaction (`src/lib/logger.ts`); wire
  `setErrorReporter` to an external monitor (e.g. Sentry) at startup.

## CI

`.github/workflows/ci.yml`: typecheck, lint, unit, roles + migrate +
integration (Postgres service), build, `npm audit`; plus an E2E smoke job.
