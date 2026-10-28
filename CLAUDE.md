# OrbitCargo — working notes for Claude

**Read and follow `docs/quality/ENGINEERING_RULES.md` for every task.** They are mandatory owner rules: end to end, real data, server-side rules and authz, tests, honest reports.

## Sources of truth
- Business rules: `docs/requirements/ORBIT_BUSINESS_SPEC.md` (owner spec + 2026-10-20 overrides)
- Decisions: `docs/architecture/DECISIONS_LOG.md` (ADR-001 … ADR-018)
- Phase plan: `docs/architecture/SPEC_RECONCILIATION.md` §3 (Phases 11–17); progress reports in `docs/progress/`
- Visual design: `design-reference/orbit-cargo-design-system/` (read-only; `npm run test:design` diffs against it)

## Stack and layout
Next.js 15 App Router + React 19 + TypeScript strict, Prisma 6 / PostgreSQL 16, Auth.js v5 (Credentials, JWT + sessionEpoch), Zod, Vitest, Playwright.
- `src/modules/*`: services and business logic (authz via `src/modules/authz/core.ts`)
- `src/app/*`: routes; server actions call services
- `src/ui/primitives`, `src/ui/kit`: design-system components (inline styles on token CSS vars)
- `src/ui/format.ts`: display formatting of server Decimal strings (never float money)

## Conventions
- The owner writes in Somali; reply in Somali unless they write in English.
- Each phase stops for owner approval. Commit only when asked.
- Money: `Prisma.Decimal` via `src/modules/finance/money.ts`; totals recomputed server-side.
- Errors: `ValidationError` messages are fixed, translatable strings; never leak whether an account exists.
- New UI strings get EN keys plus SO/AR entries in `src/i18n/dictionaries/`.
- Login (ADR-028): ID + email + password only — no authenticator. Hardening in `src/modules/auth/loginGuard.ts` (per-ID/email/IP limits, lockout) and `passwordPolicy.ts`; account isolation locked by `tests/integration/isolation.test.ts`. Never weaken these without owner approval.
- Database (ADR-029): the app connects as `orbit_runtime`, customer pages as `orbit_portal` through `withUserDb` (`src/db/scoped.ts`, Row-Level Security); triggers guard financial history, shipment statuses and closed periods; `tests/integration/db-guards.test.ts` proves it. Roles: `npx tsx scripts/db-setup-roles.ts` (admin = `DATABASE_ADMIN_URL`). Customer-facing reads/writes go through `withUserDb`, never plain `prisma`.
- Files (ADR-030): document and announcement-image bytes are in `StoredFile` via `dbStorage(db)` (`src/modules/documents/storage.ts`), saved in the same transaction as their row (`inTransaction`, `src/db/tx.ts`). Never write files to disk. Backups/restore/moves: `scripts/backup-db.sh`, `restore-db.sh`, `db-fingerprint.sql`; VPS runbook in `docs/deployment/DEPLOYMENT.md`.
- Tailwind preflight is OFF (the design system is content-box); app layout wrappers set `boxSizing: "border-box"` explicitly.

## Commands
- `npm run typecheck`, `npm run lint`, `npm test` (unit), `npm run test:integration` (uses `.env.test` DB)
- E2E: `E2E_PORT=3400 npx playwright test` (another session may hold :3100). Needs `E2E_*` in `.env.test` (template `.env.test.example`); runs against its own DB `orbitcargo_e2e`
- Accounts: `scripts/make-super-admin.ts` (never takes a password), `scripts/suspend-test-accounts.ts`. Never write passwords or secrets in code, docs or chat replies — see `docs/security/SECRETS_AND_ACCOUNTS.md`
- Design parity: `npm run test:design`
- Migrations: write SQL with `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script`, test on a restored copy, then `prisma migrate deploy` (dev and test; it runs as `orbit_owner` via `directUrl` = `MIGRATION_DATABASE_URL`). Every new table needs grants (and RLS if customer-facing) in its migration (ADR-029). Back up first with `docker exec orbitcargo-postgres pg_dump …` into `backups/` (git-ignored).
- `prisma generate` can't replace the engine DLL while other dev servers run (Windows file lock); the types still regenerate.
