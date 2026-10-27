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
- Tailwind preflight is OFF (the design system is content-box); app layout wrappers set `boxSizing: "border-box"` explicitly.

## Commands
- `npm run typecheck`, `npm run lint`, `npm test` (unit), `npm run test:integration` (uses `.env.test` DB)
- E2E: `E2E_PORT=3400 npx playwright test` (another session may hold :3100). Needs `E2E_*` in `.env.test` (template `.env.test.example`); runs against its own DB `orbitcargo_e2e`
- Accounts: `scripts/make-super-admin.ts` (never takes a password), `scripts/suspend-test-accounts.ts`. Never write passwords or secrets in code, docs or chat replies — see `docs/security/SECRETS_AND_ACCOUNTS.md`
- Design parity: `npm run test:design`
- Migrations: write SQL with `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script`, test on a restored copy, then `prisma migrate deploy` (dev and test). Back up first with `docker exec orbitcargo-postgres pg_dump …` into `backups/` (git-ignored).
- `prisma generate` can't replace the engine DLL while other dev servers run (Windows file lock); the types still regenerate.
