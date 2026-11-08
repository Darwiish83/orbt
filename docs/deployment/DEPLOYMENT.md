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
- `AUTH_URL` — the same public HTTPS origin as `APP_URL` (e.g. `https://orbitcargo.org`).
  Required behind the proxy: without it, the sign-in redirect for a protected page
  is built from the server's own address and sends visitors to
  `https://localhost:3000/login` (verified on a production build). Not yet checked
  at boot — set it by hand.
- `RESEND_API_KEY` (Sending access, limited to `mail.orbitcargo.org`), `EMAIL_DOMAIN=mail.orbitcargo.org`,
  `EMAIL_FROM=OrbitCargo <noreply@mail.orbitcargo.org>` (must send from `EMAIL_DOMAIN`; no fallback sender)
- `TRUSTED_PROXY_HOPS=1` — the reverse proxy (step 8); per-IP login and code-request limits read only its `X-Forwarded-For` entry
- Optional: `OTP_EMAIL_HOURLY_CAP` (default 60 code emails/hour in total), `OTP_IP_MAX_PER_15MIN` (default 10 code requests per IP)

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
   a new `AUTH_SECRET`, `APP_URL=https://<your domain>`,
   `AUTH_URL=https://<your domain>`, `NODE_ENV=production`,
   `RESEND_API_KEY`, `EMAIL_DOMAIN`, `EMAIL_FROM`, `TRUSTED_PROXY_HOPS=1`.
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
7. **Build and run** — the app is built as a standalone server
   (`output: "standalone"` in `next.config.mjs`); `npm start` (`next start`)
   is not the supported way to run that build. Build, then copy the static
   files into it — the build does not, and without them every page loads with
   no JavaScript or styles (verified: `/_next/static/…` returns 404):

   ```bash
   npm run build
   ```

   ```bash
   cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
   ```

   The build also copies `.env` into `.next/standalone/.env`, and every build
   writes it again: after each build keep both owned by the service user and
   private (`chmod 600 .env .next/standalone/.env`). Run the app under systemd as an
   unprivileged user, `Restart=always`, in the project folder:

   ```ini
   WorkingDirectory=/opt/orbitcargo/app
   EnvironmentFile=/opt/orbitcargo/app/.env
   Environment=HOSTNAME=127.0.0.1 PORT=3000
   ExecStart=/usr/bin/node .next/standalone/server.js
   ```

   (Paths are examples; use the clone's folder and `which node`.) Values from
   `EnvironmentFile` take precedence over the copied `.env`.
   `HOSTNAME=127.0.0.1` is required: without it the standalone server listens
   on `0.0.0.0`, every network interface. The app must be reachable **only
   through the reverse proxy** (step 8). Public access to port 3000 must also
   be blocked: the step 1 firewall (only SSH, 80 and 443 open) does that, but
   it is a second layer, not a replacement for the localhost binding — a
   firewall rule can be changed or lost, the binding keeps the port off the
   network either way. Check after starting: `ss -ltnp | grep 3000` must show
   `127.0.0.1:3000`, never `0.0.0.0:3000` or `*:3000`. The app refuses to
   start on a wrong database role.
8. **HTTPS** — Caddy or Nginx in front, with a certificate (Caddy does it
   automatically). The proxy must **overwrite** (or append) `X-Forwarded-For`
   with the real client address. The per-IP login and code-request limits read
   only the entry `TRUSTED_PROXY_HOPS` places from the right — the one our
   proxy wrote — never one a client sent. `TRUSTED_PROXY_HOPS=1` is correct
   **only** when exactly one trusted reverse proxy sits in front of the app,
   sanitizes the client IP headers, and is the only way to reach the app (step
   7). With no proxy, a client could reach the app directly and choose that
   entry itself; with a second proxy or a CDN in front (e.g. Cloudflare), the
   value and the proxy's trusted-proxy settings must change first.
   Nginx: `proxy_set_header X-Forwarded-For $remote_addr;`. Caddy:
   `reverse_proxy 127.0.0.1:3000` without `trusted_proxies`, so it ignores the
   client's header and writes the real address. Verify once live: a request
   sent with `X-Forwarded-For: 6.6.6.6` must be recorded with your real
   address, not `6.6.6.6`.
9. **Email** — `mail.orbitcargo.org` is already verified in Resend (DNS at
   Namecheap: DKIM TXT `resend._domainkey.mail`, CNAMEs `send.mail` and
   `rsend.mail`, DMARC TXT `_dmarc`). Keep those records; set `EMAIL_FROM` as
   above and a new Sending-access key for production.
10. **Backups** — encrypted with `scripts/backup-encrypted.mjs` in host mode
    (see "Backups & restore" below) and copied **off the server** before any
    real customer data is accepted. Scheduling (e.g. nightly, 14 daily + 12
    monthly) is a later step; until then run it daily and before every deploy.
    Test a restore into a scratch database every month.

Later deploys: `git pull`, `npm ci`, `npx prisma generate`, back up,
`npx prisma migrate deploy` (as owner via `MIGRATION_DATABASE_URL`),
`npm run build`, copy `public` and `.next/static` into `.next/standalone`
and `chmod 600` its `.env` (step 7), restart the service.

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

**Encrypted backups (H4).** The server holds only the age **public** key
(`age1…`); the private key stays offline with the owner (password manager +
USB). Nothing on the server can decrypt a backup.

- On the VPS (native PostgreSQL; peer authentication as the `postgres` OS
  user, so no password anywhere). One-time setup: put the public key in
  `/etc/orbitcargo/backup.pub`; create `/var/backups/orbitcargo` owned by
  `postgres`, mode `700`; install the age library outside the app, pinned and
  without install scripts:
  `sudo npm install --prefix /opt/orbitcargo-tools age-encryption@0.3.1 --ignore-scripts`,
  plus `/opt/orbitcargo-tools/age.mjs` containing `export * from "age-encryption";`.
  Then, from the app folder:

  ```bash
  sudo -u postgres env BACKUP_PG_MODE=host BACKUP_DIR=/var/backups/orbitcargo \
    BACKUP_AGE_RECIPIENTS_FILE=/etc/orbitcargo/backup.pub \
    BACKUP_AGE_JS=/opt/orbitcargo-tools/age.mjs node scripts/backup-encrypted.mjs
  ```

  `pg_dump` streams straight into age encryption: no plaintext dump is ever
  written. Output: `<db>-<UTC time>.dump.age` + `.manifest.json` (sizes,
  SHA-256s, table checks, fingerprint, migration head); `last-run.json` says
  success or failure; any failure exits non-zero and leaves no partial file.
- Off the server: copy both files to the owner's PC (outside OneDrive, e.g.
  `C:\OrbitCargo-Backups`), then on the PC, with the private key:
  `node scripts/backup-verify.mjs <file.dump.age>` (decrypts in memory, checks
  the manifest) and `node scripts/backup-restore-drill.mjs <file.dump.age>
  --compare-live` against a copy, or without `--compare-live` (restores into a
  scratch `orbitcargo_drill_<time>` database, checks every table, stored file,
  trigger, policy and grant, then drops it).
- Verified 2026-11-08 (dev, disposable database): host-mode and Docker-mode
  backups both decrypted, matched their manifests, and restored to an
  identical copy (all 50 tables' content, 16 stored files, 26 triggers, 39
  policies, 540 grants, 34 migrations).
- Plain dump (legacy, unencrypted — only for a one-off move between machines):
  `MIGRATION_DATABASE_URL=… scripts/backup-db.sh [out.dump]` — data,
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
