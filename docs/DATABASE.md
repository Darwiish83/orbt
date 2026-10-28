# OrbitCargo — Database runbook

PostgreSQL is the source of truth. Local dev/test uses a **dedicated Docker
Postgres**, isolated from any other Postgres on the machine.

## Local database (Docker)

A dedicated container runs on **port 5433** (host 5432 is used by an unrelated
project and is left untouched):

```bash
docker run -d --name orbitcargo-postgres \
  -e POSTGRES_USER=orbit_app \
  -e POSTGRES_PASSWORD=orbit_dev_pw \
  -e POSTGRES_DB=orbitcargo \
  -p 5433:5432 \
  -v orbitcargo_pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```

Two databases are used:
- `orbitcargo` — development (`.env` → `DATABASE_URL`)
- `orbitcargo_test` — integration tests (`.env.test` → `DATABASE_URL`)

Create the test DB once:
```bash
docker exec orbitcargo-postgres createdb -U orbit_app orbitcargo_test
```

> `orbit_app` is the container's **admin** (superuser). Since ADR-029 the app
> never uses it: it only creates the roles below and takes backups. Real
> `.env*` files are git-ignored; only the `.example` templates are committed.

### Database roles (ADR-029) — run once per machine, before migrating

```bash
npx tsx scripts/db-setup-roles.ts
```

It reads the admin URL from `.env` (`DATABASE_ADMIN_URL`, or `DATABASE_URL` on
the first run), creates three roles with random passwords (never printed) and
writes their URLs into `.env` / `.env.test`:

| Role | Env key | Used for |
|---|---|---|
| `orbit_owner` | `MIGRATION_DATABASE_URL` | owns every object; **migrations only** (Prisma `directUrl`) |
| `orbit_runtime` | `DATABASE_URL` | the app: rows only, guarded by triggers |
| `orbit_portal` | `PORTAL_DATABASE_URL` | customer pages, Row-Level Security per customer |

`--rotate` issues new passwords (restart the app afterwards).

Manage the container: `docker stop orbitcargo-postgres` / `docker start …` /
`docker rm -f orbitcargo-postgres` (with `docker volume rm orbitcargo_pgdata`
to wipe data).

## Common commands

| Task | Command |
|---|---|
| Apply migrations (runs as `orbit_owner`) | `npm run db:deploy` |
| Back up (admin) | `docker exec orbitcargo-postgres pg_dump -U orbit_app -d orbitcargo -Fc --no-owner > backups/<name>.dump` |
| Restore into a fresh DB / compare | `scripts/restore-db.sh`, `scripts/db-fingerprint.sql` (see `docs/deployment/DEPLOYMENT.md`) |
| Regenerate client | `npm run db:generate` |
| Seed reference data (roles/permissions) | `npm run db:seed` |
| Open Prisma Studio | `npm run db:studio` |
| Migration status | `npx prisma migrate status` |
| Integration tests (test DB) | `npm run test:integration` |

Apply migrations to the **test** DB: run `npx prisma migrate deploy` with
`DATABASE_URL` and `MIGRATION_DATABASE_URL` taken from `.env.test`.

New migrations are written with `prisma migrate diff … --script` (see
`CLAUDE.md`), not `prisma migrate dev`: the owner role can't create the shadow
database that `migrate dev` needs. Every new table needs its grants (and RLS if
customer-facing) in the same migration.

## Conventions

- Money/weights are **decimal** columns (`@db.Decimal`), never float (ADR-004).
- CHECK constraints that Prisma can't express are appended to the migration SQL.
- Financial/audit rows use `onDelete: Restrict` — no destructive cascades.
- Documents and announcement images are stored in the database (`StoredFile`,
  ADR-030), so `pg_dump` backs up everything. Old folder files are copied with
  `npx tsx --env-file=.env scripts/move-files-to-db.ts` (check) / `--apply`.
- The database guards history itself (ADR-029): append-only / no-delete /
  reversal-only triggers, the shipment status path and closed periods.
  `tests/integration/db-guards.test.ts` proves each one with raw SQL.
- The seed inserts **reference data only** (roles + permissions). Never seed
  production with fake customers, shipments, or payments.
