# OrbitCargo — Phase 13 Progress Report

**Phase:** 13 — Customer App (spec A2–A10; design `ui_kits/customer-app`)
**Status:** ✅ Built. Design-parity screenshot diffs per screen are not added yet (see §5).
**Date:** 2026-10-25

---

## 1. Scope delivered — `/account/*`
The old plain portal (three text pages) is replaced by the Customer App from the design.

- **Shell** (`src/components/portal/CustomerShell.tsx`, styles `.cust-*` in `globals.css`):
  - **Phone:** app bar (navy with the white logo on Home; the logo on the other main tabs; title + Back on detail screens), bell, SO/EN/ع switch, and a **bottom navigation** (Home, Shipments, Finance, Profile).
  - **Computer (≥ 900 px):** navy **sidebar** (Home, Shipments, Finance, Profile, Documents, Notifications, the customer card, Logout) and a white top bar with the title.
- **Home:** welcome, customer card (reference, level of the year, active), four figures (shipments, arrived, air KG, sea CBM), brand banner, Quick Access, latest shipments.
- **Shipments** (year picker, search, All / Air / Sea) and **Shipment details**: 4-step timeline (At origin store → Departed → In transit → Arrived), **no AWB**, the customer's own KG/CBM and packages (MIX shown), invoice link, "Ask about this shipment" on WhatsApp.
- **Finance:** account summary; **Invoices** (search, Paid / Partial / Unpaid) → **invoice paper** (combined rate, optional rows, bank accounts, Somali demurrage warning, Download PDF); **Statement**: payment history with each **receipt** (stamp + signature, Download PDF), breakdown by bank, recent activity, **Statement PDF**.
- **Notifications:** Shipment updates (own), Customer announcements, Flight / container announcements (image, origin, destination, last day, departure date).
- **Documents:** My Packing Lists (download, upload), **My Records** (year summary + records → **Record details**: overview, documents, transactions), **Transfer receipts**.
- **Profile:** customer information, level, language, Edit Profile (name, company, location, cargo category; phone and Gmail change through support), email verified, Logout.
- **Support:** both phone numbers (WhatsApp + Call), quick questions on WhatsApp, working hours, office.

## 2. Data and access
- `src/modules/portal/customerApp.ts`: every read takes the customer id **from the session** (`actor.customerId`), never from the request; staff get "Customers only". A shipment shows only the customer's own lines; invoices, payments, receipts, records and documents are filtered to the customer.
- `invoiceDocumentOf` (shipmentFinance) is shared by the staff invoice paper and the customer's, so both print the same paper.
- Customer profile edits are audited (`customer.self_update`).

## 3. Tests
- `tests/integration/customer-app.test.ts`: two customers on one shipment — each sees only their own goods, invoices, payments and receipts; another customer's invoice/receipt/shipment is refused; staff are refused; profile edits change only the customer's own record.
- E2E smoke updated: a customer lands on the Customer App home (`cust-welcome`).
- Unit 51, integration 172 pass; typecheck and lint clean.

## 4. Translations
All new strings have SO and AR entries (most already existed from the design); Arabic switches the layout to RTL through the existing provider.

## 5. Not done / follow-ups
- Design-parity screenshot diffs (`npm run test:design`) for the customer screens.
- Notification "unread" dots: notifications have no per-customer read state yet.
- ~~Home banner photo~~ — done (2026-10-27): the design's port photo (Pexels 2226458) is served from `public/brand/home-banner.jpg` under a navy shade, so the same-origin CSP is kept.
