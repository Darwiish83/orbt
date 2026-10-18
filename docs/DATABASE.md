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

> These are **local dev credentials for a disposable container** — not
> production secrets. Production uses a least-privilege role and managed
> secrets (Phase 9). Real `.env*` files are git-ignored; only `.env.example`
> is committed.

Manage the container: `docker stop orbitcargo-postgres` / `docker start …` /
`docker rm -f orbitcargo-postgres` (with `docker volume rm orbitcargo_pgdata`
to wipe data).

## Common commands

| Task | Command |
|---|---|
| Apply dev migrations | `npm run db:migrate` |
| Apply migrations (prod-style) | `npm run db:deploy` |
| Regenerate client | `npm run db:generate` |
| Seed reference data (roles/permissions) | `npm run db:seed` |
| Open Prisma Studio | `npm run db:studio` |
| Migration status | `npx prisma migrate status` |
| Integration tests (test DB) | `npm run test:integration` |

Apply migrations to the **test** DB:
```bash
DATABASE_URL="postgresql://orbit_app:orbit_dev_pw@localhost:5433/orbitcargo_test?schema=public" npx prisma migrate deploy
```

## Conventions

- Money/weights are **decimal** columns (`@db.Decimal`), never float (ADR-004).
- CHECK constraints that Prisma can't express are appended to the migration SQL.
- Financial/audit rows use `onDelete: Restrict` — no destructive cascades.
- The seed inserts **reference data only** (roles + permissions). Never seed
  production with fake customers, shipments, or payments.
