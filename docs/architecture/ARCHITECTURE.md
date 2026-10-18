# OrbitCargo — Architecture (Phase 0 proposal)

**Status:** Proposal for approval. No code written in Phase 0.
**Date:** 2026-10-18

---

## 1. Goals & constraints

- Preserve the **approved OrbitCargo visual design** exactly (tokens, components, layouts, i18n/RTL).
- Build a **genuinely functional, secure, tested, maintainable** application.
- **Modular monolith** — clear internal boundaries, no premature microservices/Redis/brokers.
- Never trade security or data integrity for speed or visual convenience.

## 2. Technology baseline (proposed)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Server Components + Server Actions + Route Handlers. |
| Language | **TypeScript, `strict: true`** | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` considered. |
| UI runtime | **React 19** (bundled with Next 15) | DS targets React 18.3.1 UMD → migrate (see Audit §6.3). |
| Styling | **Tailwind CSS mapped onto the DS token CSS variables** | Tokens stay the source of truth; see §5. *Decision to confirm.* |
| DB | **PostgreSQL** | Single source of truth. |
| ORM | **Prisma** + versioned migrations | No manual prod DB edits. |
| Auth | **Auth.js (NextAuth v5)**, Credentials + session | Server-enforced; see Threat Model. |
| Validation | **Zod** | Shared schemas for client + server; server is authoritative. |
| Money | **Prisma `Decimal` / `decimal.js`** | No JS float for authoritative amounts. |
| Unit/integration tests | **Vitest** | |
| E2E + visual regression | **Playwright** | Screenshot parity vs. reference at matching viewports. |
| Lint/format | ESLint + Prettier | (DS ships an `oxlint` config for reference only.) |

Dependency versions pinned to compatible, supported releases; **lockfile committed**. No blind major up/downgrades — DS component compatibility is checked before edits.

## 3. Modular-monolith structure (proposed)

```
orbt/
  app/                      # Next.js App Router (routes, layouts, server actions)
    (public)/               # marketing / public tracking
    (customer)/             # customer portal + app (auth: Customer)
    (admin)/                # internal admin (auth: staff roles)
    api/                    # route handlers where needed
  src/
    modules/                # domain modules — the boundaries
      auth/                 # authentication, sessions, password reset
      authz/                # permissions, role matrix, server guards
      customers/
      shipments/            # shipments, events, tracking, state machine
      operations/           # tasks, transfer (send/receive), country/year scoping
      finance/              # quotes, charges, invoices, payments, balances
      documents/            # private file storage, signed URLs
      notifications/
      reporting/
    domain/                 # pure domain types, value objects, state machines
    db/                     # Prisma client, repositories, transactions
    lib/                    # validation (zod), logging, errors, config, money
    ui/                     # migrated design-system components (typed)
      tokens/               # token CSS (from DS), Tailwind theme bridge
      primitives/           # Button, Input, Card, … (from components/)
      composites/           # DataTable, Stat, Panel, … (from kit.jsx)
      logistics/            # TrackingTimeline, ShipmentRow
    i18n/                   # en/so/ar dictionaries, provider, RTL
  prisma/                   # schema.prisma, migrations, seed (dev only)
  tests/                    # vitest + playwright
  docs/                     # these documents
  design-reference/         # read-only extracted DS (visual parity source)
```

**Boundary rules**
- UI components contain **no business logic** — presentation only.
- Routes/Server Actions call **module services**; services call **repositories**; repositories wrap **Prisma**.
- Every service method that touches protected data takes the **authenticated actor** and enforces authorization; no trust in client-supplied IDs/roles.
- Cross-module access goes through a module's public service surface, not its internals.

## 4. Request / data flow

1. **Server Components** fetch data via module services (already authorized) and render.
2. **Mutations** go through **Server Actions** (or route handlers for non-form/API clients): authenticate → authorize → **Zod-validate** → service (transaction, decimal math, idempotency) → audit log → revalidate.
3. **No authoritative totals come from the client.** Server recomputes from validated line items.
4. **Pagination & filtering are server-side** (cursor/limit); the browser never loads full tables.

## 5. Preserving the design (styling bridge)

- Copy `tokens/*.css` into `src/ui/tokens/` and import once in the root layout → CSS variables available globally (exact approved values).
- Configure Tailwind `theme.extend` to **reference the same variables** (e.g. `colors.navy[700] = 'var(--navy-700)'`), so Tailwind utilities and the ported inline styles render identical colours/spacing/radii.
- Migrate DS components to typed React, **keeping their inline-style/token output** so pixels match; adopt Tailwind utilities for new layout only.
- Load Archivo + JetBrains Mono via `next/font` (self-host where possible) to match the CDN appearance without the runtime dependency.
- Added **loading / empty / validation / success / error** states reuse existing tokens and components — no new visual language.
- **Playwright visual regression** compares implemented screens against `design-reference` captures at the manifest's viewports (e.g. admin `1440x900`, portal `1280x800`, customer app `1200x980`).

## 6. Environments & configuration

- Three environments: **development, test, production**, each with its own DB and secrets.
- **Env-var validation at boot** (Zod) — app refuses to start on missing/invalid config.
- Secrets only server-side; **never** exposed via `NEXT_PUBLIC_*`, bundles, or source maps.
- `.env.example` with placeholders only; real `.env*` git-ignored.
- Least-privilege DB credentials per environment.

## 7. Observability & operations

- Structured logging with **sensitive-data redaction** (no passwords, tokens, secrets, full PII in logs).
- Health-check endpoint; error-monitoring hooks.
- **Audit log** for security-sensitive actions (auth, role changes, financial mutations, document access, shipment-state changes).

## 8. Key architectural decisions

**Resolved (2026-10-18 — see DECISIONS_LOG.md):**
- **D1 — Styling:** ✅ **Tailwind-over-tokens bridge** (ADR-003). Tokens stay CSS vars; Tailwind theme references them.
- **D2 — Scoping:** ✅ **Country + business-year + per-employee overrides** as first-class access/data boundaries (ADR-002).
- **Currency:** ✅ **USD only, 2-decimal, decimal math** (ADR-004).
- **Roles:** ✅ **DS 7-role set** (ADR-001).

**Defaults (confirm if you disagree; not blocking Phase 1):**
- **D3 — Monorepo vs. single app:** single Next app, given modular-monolith scope.
- **D4 — Icon/image delivery:** `lucide-react` + owned assets (remove runtime CDN fetch).
- **D5 — React 18 pin vs. 19 migration:** default to React 19 (Next 15), with a compatibility pass on DS components.
