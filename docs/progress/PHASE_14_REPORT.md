# OrbitCargo — Phase 14 Progress Report

**Phase:** 14 — Admin core (spec B2–B8, B12–B15; owner's revised admin prompt §3–§9, §13–§16)
**Status:** ✅ Complete. Phase 16 (Accounting) next, without waiting (owner, 2026-10-24).
**Date:** 2026-10-24

---

## 1. Scope delivered (every page reads and writes through scoped server services)

| Page | Delivered |
|---|---|
| **Top bar** | Year + Country selectors, delivered with Phase 15 and used by every page below. |
| **Dashboard** | Data for the selected year and country, each block only for users who may see that area. Finance cards, shipment cards (Total, Air, Sea, KG, CBM, Packages), Customers & Team, Revenue Overview by month, 4-status counts, monthly Air/Sea chart, payments by bank, recent shipments, outstanding invoices, recent payments, latest notifications. |
| **Shipments** | Air / Sea tabs and a search over code, city and AWB. Cards: Total Shipments, Packages, KG/CBM, Amount (invoice total if invoiced, otherwise the line charges). The list is sorted W-1 → n. **Create / Edit Shipment**: the code is automatic; country, mode and year are fixed after creation; status is not editable here. **Delete** only for an empty shipment that hasn't moved. **Detail**: navy route header; cards for Customers, Packages, Total KG, **AWB KG** (typed, saved on blur) and **Difference** (green at 0, red otherwise), Total Amount. **Customer list** with Add / Edit / Delete and **Notify**. Add Customer has a **customer picker** (type a name or reference; searched on the server), boxes, KG/CBM, **MIX count + KG** ("10 box, 2 mix"), rate, quality per KG, brand, fatura and delivery, with a live preview. |
| **Operations** | Stats: Total, Air, Sea, Packages. Filters: All/Air/Sea, search, status. One row per shipment with its customers. **Change Shipment Status** offers only the next allowed status (Air: Departed → Transit → Arrived; Sea: Departed → Arrived), changes the whole shipment at once and, by default, **notifies every customer on it**. Idempotent per dialog. |
| **Customers** | Shared by every country. Tabs: All / Active / Inactive. Search over reference, name, company, phone and email. **Level** is automatic: KG/CBM of the selected year (ADR-018), shown with its volume. Service column: Air / Sea / Air & Sea. **Add / Edit**: the OR- reference is automatic; duplicate email or phone is refused. **Set Active / Inactive**. **Delete** only for a customer with no history. **Customer details** drawer: shipments, invoices, payments with receipt links, totals. |
| **Users & Team** | **Employees**: ID, name, phone, email, department, roles (plus Accounting / Transfer badges), last login, status. **Add / Edit Employee**: the EMP- ID is automatic; department; roles; **responsible countries**; per-page access (**role default / No access / View only / Full**); special access **Accounting** (on/off) and **Money Transfer** (No / Receiver / Sender + countries); **access period**. Set Active / Inactive. **Roles & Permissions**: each role's level per page, editable by a super admin only. **Activity Log**: from the audit trail, with search, item, date and paging. |
| **Notifications** | All / Announcements / Customer, status filter, search, list with a selected-item panel. **Schedule Announcement**: Air Flight / Sea Container / General with the design's Somali titles and messages; last day, flight/departure date, origin, destination; **optional image** (PNG/JPEG/WebP ≤ 2 MB, private storage, served after an access check); live preview; sent to every customer, or **Scheduled** until a chosen date and then published. |
| **Documents** | Filters: date range (defaults to the business year), Air & Sea, shipment, search. Cards for documents, customer documents and shipment documents. **Upload Customer** (the customer sees it in their app) and **Upload Shipment** (staff only), with document reference, file name, type and the file. Download through the authorized route; delete is soft and needs `documents:manage`. |
| **Reports** | Company report (every allowed country) plus Shipments, Operations, Finance and Customers reports for the selected country and year. Totals, KG/CBM, revenue, collected, outstanding, status breakdown, monthly charts. **Download PDF** opens a print page. |
| **Settings** | **Company Profile**, now **printed on invoices**. **General**: currency, timezone; language is per person in the top bar. **Years**: list with counts, **Create new year**, make current year. **Origin countries**: add in any spelling with the flag found automatically ("shiinaha" → China 🇨🇳); remove only when the country has no shipments (deactivated). **Notifications** switches. **Security**: 2FA status / turn on, **Change password** (current + new + confirm; signs you out). **Appearance**: light only. **System** info. |

## 2. Access control (spec §5), enforced on the server
`loadAuthzUser` now applies, on every request:
1. **Page access overrides**, per module:
   - *No access* removes the module's permissions.
   - *View only* keeps only its `:read` permissions.
   - *Full* grants them all.

   Mapping: `src/modules/authz/modules.ts` (e.g. Operations = `operations:*` + `shipments:status`).
2. **Inactive employee** or **outside the access period** → no permissions and no scope, even with a valid session.
3. **Responsible countries** narrow every role's country scope.

**Guards**
- Only a super admin may grant `super_admin` or change role defaults.
- Nobody may change their own access or status.
- Deactivating someone signs them out (`sessionEpoch`).

## 3. Database
Backup taken first: `backups/orbitcargo-before-admin-core.dump`. Three additive migrations:

| Migration | Adds |
|---|---|
| `20261024150000_admin_core` | `Employee`: `transferCountries`, `accountingAccess`, `accessFrom`, `accessUntil`. `Notification`: `details`, `imageKey`, `imageType`. `ShipmentLine.notifiedAt`. `User.lastLoginAt` (set on sign-in). |
| `20261024160000_app_settings` | `AppSetting` (key → JSON) |
| `20261024170000_document_reference` | `Document.reference` |

Applied to dev and test with `prisma migrate deploy`.

## 4. Security fixes found on the way
- **`getReport`** summed invoices from **every country**, so a country-scoped report manager saw other countries' money. It is now scoped to the user's countries and excludes void invoices. Test added.
- (Phase 15) `listShipments` country-filter widening, already fixed.

## 5. Checks performed (actual results)

| Check | Result |
|---|---|
| Type check / Lint | ✅ / ✅ |
| Unit | ✅ **49 passed** |
| New `admin-core.test.ts` | ✅ **16 passed**. Covers: module overrides (None/View/Full); access period; inactive employee; responsible countries; escalation guards; role defaults (super admin only); AWB KG difference; line edit updates invoice Actual; invoiced customer's last line protected; delete-shipment rules; Notify and bulk status notifications; Operations next status and country scope; level/service/details; customer delete vs Inactive; settings validation and permission; years; countries (alias spelling, unknown, in-use, deactivate); scheduled announcement + image access before/after publishing; customer documents visible only to that customer; shipment upload country scope; report scope fix. |
| Full integration | ✅ **153 passed** (11 files) in ~25 s |
| Browser (dev) | All 15 admin + print routes render with no server error. Dashboard numbers match the data. Shipments total $3,037 (checked by hand). W-1 detail shows "10 box, 2 mix". AWB KG 250 → Difference +2.5 kg. |
| Production build | ✅ compiled; all admin and print routes built |

**Test-suite fix:** the DB reset used `TRUNCATE` (≈50 s per reset on this Windows machine because of file fsyncs, which made the suite time out). It now uses ordered `DELETE`s, computed from the foreign-key graph. Full suite: 1.5 h of timeouts → 25 s.

## 6. Notes / not done
- **Appearance**: dark theme and compact layout are not built (the design system has no dark tokens yet). The page says so.
- **MIX**: the design's numbered shared boxes (MIX 1, MIX 2 with per-box weights) are simplified to the spec's "MIX count + KG" per entry. Entries stack.
- **Notification switches** (Settings) are stored but don't yet gate e-mail sending, which isn't wired for these events.
- **Announcement send date** publishes when notifications are next read (no background job).
