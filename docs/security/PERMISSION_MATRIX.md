# OrbitCargo — Permission Matrix (Phase 0 proposal)

**Status:** Role set and scoping **APPROVED 2026-10-18** (ADR-001, ADR-002). Principle: **least privilege, deny by default.** All checks enforced **server-side**; the design system's client-side `accessOf`/`ViewOnly` gating is cosmetic and is **not** a security control.
**Date:** 2026-10-18

> **Resolved:** Use the **DS 7-role set** (+ Customer). Access scoped by **country + business year + per-employee page-level overrides**. The matrix below is now the committed model, not a proposal.

---

## 1. Role reconciliation (RESOLVED — ADR-001: DS 7-role set adopted)

The prompt proposes **6** roles. The design system (`data.js`, `Shell.jsx`) actually uses **7 operational roles** plus Super Admin and Customer, and adds **scoping** (country, business year) and a **transfer role** (send/receive):

| Prompt role | Design-system role(s) | Note |
|---|---|---|
| Super Admin | Super Admin (`meId: 'super'`) | Full access. |
| Operations Manager | **Operation Admin** | Manages operations + staff. |
| Operations Staff | **Operation Staff** | Day-to-day shipments/operations. |
| Finance Staff | **Finance Staff** / **Finance Admin** | DS splits staff vs admin. |
| Customer Support | **Customer Support** | |
| Customer | Customer | External. |
| *(no prompt equivalent)* | **Document Officer** | Documents module. |
| *(no prompt equivalent)* | **Report Manager** | Reports module. |
| *(cross-cutting)* | **transferRole: send/receive** + `trCountries` | Inter-country transfer workflow. |

**Decision needed:** adopt the DS 7-role set (recommended, matches the approved UI), the prompt's 6, or a merged set. Matrix below uses the **DS set** as the concrete proposal; collapse rows if the 6-role set is chosen.

## 2. Permissions (resource:action)

`read` / `write` / `manage` per module: `customers`, `shipments`, `operations`, `transfer`, `finance` (quotes/invoices/payments), `documents`, `notifications`, `reports`, `users` (staff & roles), `settings`, `audit`. Customer-facing: `self:*` (own data only).

## 3. Proposed role → permission matrix

Legend: **M**=manage (incl. create/delete where allowed) · **W**=write/edit · **R**=read · **–**=no access · **own**=own records only. All staff access is further **filtered by assigned country + business year scope**.

| Module | Super Admin | Operation Admin | Operation Staff | Finance Admin | Finance Staff | Customer Support | Document Officer | Report Manager | Customer |
|---|---|---|---|---|---|---|---|---|---|
| Customers | M | W | R | R | R | W | R | R | own (self) |
| Shipments | M | M | W | R | R | R | R | R | own R |
| Shipment status change | M | W | W* | – | – | – | – | – | – |
| Operations/tasks | M | M | W | – | – | R | – | R | – |
| Transfer (send/recv) | M | W (by trRole) | W (by trRole) | R | R | – | – | R | – |
| Quotes | M | R | R | M | W | R | – | R | own R |
| Invoices | M | R | R | M | W | R | – | R | own R |
| Payments | M | – | – | M | W | – | – | R | own R |
| Documents | M | R | R | R | R | R | M | R | own (own docs) |
| Notifications | M | W | R | R | R | W | – | R | own R |
| Reports | M | R | R | R | R | – | – | M | – |
| Users / roles | M | W (staff, no role-grant to self) | – | – | – | – | – | – | – |
| Settings | M | R | – | R | – | – | – | – | – |
| Audit log | R | R (own scope) | – | R (finance) | – | – | – | R | – |

\* Operation Staff may perform only state transitions permitted by the shipment state machine and their country scope.

### Customer (external) — strict self-scope
- May read **only their own** customer account, shipments, tracking, quotes, invoices, payments, documents, notifications.
- May create shipment/quote requests and upload their own documents (subject to validation).
- **No** access to other customers, internal notes, staff data, finance config, or admin surfaces.

## 4. Hard rules (non-negotiable)

- **Deny by default**; grant only listed permissions.
- Authorization enforced on **every** protected page, API route, Server Action, download, mutation, and sensitive query — **object-level**, not just route-level (prevents IDOR).
- Server derives roles/permissions/scope from the **session**, never from client-submitted role/user IDs.
- **No self-escalation:** a user cannot grant themselves or widen their own permissions; role changes require a higher-privileged actor and are audited.
- Account creation, invitations, role changes, suspension, password recovery follow explicit authorization rules.
- Customer financial data is **not** exposed to operational staff lacking finance permission; admin data is **not** exposed to customers.
- Enforced with **automated negative-authorization tests** (TEST_STRATEGY).

## 5. Decisions

**Resolved (2026-10-18):**
1. **Role set** — DS 7-role set adopted (ADR-001). Finance Admin vs Finance Staff distinction kept; Document Officer and Report Manager kept as distinct roles.
2. **Scoping** — country + business-year enforced as access boundaries, **with** per-employee page-level `access{}` overrides retained (ADR-002).

**Still open (not blocking Phase 3 start; resolve before the noted phase):**
- **Transfer module** — send/receive workflow and who may initiate/settle. *(Phase 4)*
- **Audit visibility** — who may read the audit log and at what scope. *(Phase 3)*

The matrix above is the **committed model** for Phase 3 implementation and tests.
