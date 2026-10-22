# Orbit Cargo & Logistics — Business Specification (owner-supplied)

**Source:** supplied by the business owner on 2026-10-20, recorded verbatim below.
**Status:** authoritative for business rules, *except* where the owner overrode a point on 2026-10-20. Those overrides are listed first, recorded as ADR-015…ADR-018 in `docs/architecture/DECISIONS_LOG.md`, and take precedence over the text below. The phase plan is in `docs/architecture/SPEC_RECONCILIATION.md`.

## Owner overrides (2026-10-20)

| Spec says | Decision |
|---|---|
| "Data is saved in the browser" | **PostgreSQL database** (ADR-015). Everything persists server-side and survives refresh, devices and browsers. |
| Customer Level from yearly invoiced value (A ≥ $10,000 …) | **Keep ADR-014**: level from yearly KG/CBM. |
| Customer: Reference + Password; Admin: 3-step login | **Adopt the spec's flows** (ADR-016). This replaces the single shared form built on 2026-10-20. |
| Shipment status: only 4 | **Adopt: 4 statuses** (ADR-017). `DELIVERED` and `ON_HOLD` are removed; Transit is Air-only. |

---

# ORBIT CARGO & LOGISTICS — COMPLETE PROMPT (Customer App + Admin Panel)

Build the **frontend** for Orbit Cargo & Logistics: a **Customer App** (iPhone, Samsung, Computer) and an **Admin Panel** (desktop-first, but it must also open in Chrome on a phone). Languages: **English, Somali, Arabic (RTL)**, with a language toggle at the top of every screen. Data is saved in the browser and must survive a refresh.

---

## 0. GLOBAL RULES (apply everywhere)

- **Keep the information architecture as is.** Don't mix Customers, Shipments, Operations, Finance, Accounting, Transfer, Documents, Reports, Notifications, Users and Settings.
- **Year system:** default year is 2026. All data belongs to a year. A new year starts with fresh data, so shipment numbering restarts at W-1 / C-1. Past years stay preserved and viewable.
- **Country:** Turkey and India to start. New countries are added in Settings, and each gets its flag automatically. Every country has its own separate shipments, finance and accounting. **Customers, Users and Settings are not split by country**; all countries share them.
- **Shipment names:** Air = **W-1, W-2, W-3…**, Container = **C-1, C-2…**. Numbering restarts at 1 for each country and each year. Lists always show 1 first, and new shipments are added at the bottom.
- **Customer Reference:** starts at **OR-3000** (OR-3001, OR-3002…) and is assigned automatically. **Duplicate references are rejected**, and one customer can never get two references (a duplicate email or phone is rejected).
- **Shipment status (only 4):**
  1. **At Origin Store**: the goods have reached the origin warehouse. Set automatically when a customer is added to the shipment.
  2. **Departed**: the goods have left the origin country.
  3. **Transit**: air only.
  4. **Arrived**: the goods have reached Mogadishu.

  Status is changed **only in Operations**. One change updates every customer in the shipment at once (all of W-1).
- **Origin** = country (flag + name). **Origin Code** = city (Istanbul, Mumbai). Destination is always Mogadishu, Somalia.
- **Packages:** there is no "Total Boxes"; use **Packages** only, since a package can be a box or a pallet.
- **MIX:** one box shared by several customers. A customer can have "10 box, 2 mix". The MIX KG is added to the customer's KG (MEASURE = KG + MIX KG).
- **Banks (each shown with its logo):** Salaam Bank 37215407 · Dahabshiil Bank 365258411 · Premier Bank 25687140 · Cash.
- **Company address (on every invoice and receipt):**
  - Orbit Cargo & Logistics, Jedmarexan, Howlwadag District, Mogadishu, Somalia
  - Phones: +252 614111539, +252 614145971
  - Hours: 08:00–18:00
  - WhatsApp: a solid green button
- **Receipts:** every money movement in or out gets a numbered receipt (RCP-2026-1001) with a Download PDF option.

---

# A. CUSTOMER APP

## A1. Login
- **Orbit logo, "Welcome to Orbit", "Cargo & Logistics":** brand identity.
- **Existing Customer:** Customer Reference + Password → **Log in**.
  - **First login, or a forgotten password:**
    1. Enter Reference, Phone and **Email**, then **Send OTP**. The OTP arrives by email.
    2. Enter the OTP, then **Verify**.
    3. **Create Password** (at least 6 characters, plus Confirm). The customer then enters the app.
  - *Why:* this keeps accounts secure, and the OTP is only needed once.
- **New Customer → Create New Account:**
  - Fields: Full Name, **Company (required)**, Phone, Email, **Location (free text, not a dropdown)**, **What you buy** (free text).
  - On **Create**:
    - A new reference is generated automatically.
    - The customer is added to **Admin → Customers** automatically.
    - The OTP is sent by email.
    - **The reference is delivered through an in-app notification**, not by email.
- **Fast and Secure · Reliable Logistics · Worldwide Coverage:** trust signals.

## A2. Navigation
Home · Shipments · Finance · Profile, with a 🔔 Notifications bell at the top. On a computer the navigation is a sidebar.

## A3. Home
- **Welcome + Customer info:** name, Reference, **Customer Level** (set by the system), Active status.
- **4 small cards in one row:** Shipments · Delivered · Air Freight KG · Sea Freight CBM.
- **"Your Cargo, Our Priority" banner:** a photo combining port, aircraft and warehouse. No small subtext.
- **Quick Access:** Shipments, Invoices, Documents, My Profile, Support.
- **Year:** the customer sees only the selected year's data.

## A4. Shipments
- Tabs: All · Air Freight · Sea Freight, plus Search.
- **Each card:** W-1/C-1, Status (one of the 4), Origin (country + flag) → Mogadishu, Weight/CBM, Packages, Tracking.
- **Shipment details:** a timeline of the 4 statuses and the customer's data. The AWB is not shown to customers.

## A5. Finance
- **Invoices:** list with Search and Paid / Partial Paid filters.
- **Statement:**
  - From/To dates and Download Statement PDF.
  - **Payment history:** Date, Invoice No., Amount, Bank, Reference, and a **Receipt** button.
- **Account Summary:** Total Invoices, Total Invoiced, Total Paid, Balance Due, Customer ID, Member Since, Total Shipments, Payment Breakdown by Bank, Recent Activity.

## A6. Invoice Details (paper layout)
- Logo and address, invoice info, and the **Air/Sea calculation** (Quantity × Rate = Amount).
- The customer sees a **single combined rate**. Commission and quality charges are included in it and never shown separately.
- **Brand, Fatura, Local Delivery, Others, Discount** appear **only if a value was entered**. Discount is shown above the Total.
- Paid, Balance, Payment status, and bank accounts with logos.
- **Warning (in Somali):** if goods aren't collected within 3 days, **demurrage** charges begin. Place it below the bank accounts.

## A7. Notifications
- **Announcements:** Customer (General), **Air Flight** and **Sea Container**. Each shows Title, Message, image, Origin, Destination, Last Day, Flight/Departure Date, Status and scheduled info.
- **Cargo updates:**
  - New status
  - **Payment received ✓**, with **View Receipt**
  - New reference
  - Payment reminders

## A8. Documents / Records
- **My Packing Lists:** Search, Year and Transport filters, PDF, Shipment, Date, File Size, View/Download.
- **My Records:**
  - Export, From/To dates, Shipment No.
  - Totals: Shipments, KG, CBM, Invoices, Paid Money, Remaining Money.
  - Table: Date, Description, Packages, Invoice, Status, with pagination.

## A9. Customer Record Details
- Record header, with tabs Overview / Documents / Transactions.
- Shipment info, customer info, Status, Paid, Remaining.
- Transaction history.

## A10. Profile / Settings
- **Customer Information:** Full Name, Company, Reference, Phone, Email, Location, Cargo Category, Status.
- **Customer Level:** A PRO / B VIP / C STANDARD / D BASIC.
  - Set automatically from yearly invoiced value: A ≥ $10,000 · B ≥ $3,000 · C ≥ $1,000 · D < $1,000.
  - The customer cannot choose it.
- **Settings:** Language (Somali), Notifications, Edit Profile.
- **Account Security:** App Security, **Email Verification (VERIFIED)**, Logout.
- **Footer:** Orbit Cargo & Logistics · Orbit Cargo ERP • Customer App · Version 1.0.0.

---

# B. ADMIN PANEL

## B1. Admin Login (3 steps)
1. **Verify:** Employee ID.
2. **Gmail:** Gmail address + Gmail Verification code.
3. **Password:** Create/Confirm, or the Gmail password.

Back and Continue buttons on each step. *Why:* each employee verifies once.

## B2. Navigation
- Dashboard · Users & Team · Customers · Shipments · Operations · Finance · **Accounting** · **Money Transfer** · Documents · Reports · Notifications · Settings.
- Top bar: **Year**, **Country** (Turkey/India) and the language toggle.

## B3. Dashboard
Total Revenue, Outstanding, Total Shipments, Air, Sea, Revenue Overview chart, Shipment Status counts (the 4 statuses), statistics.

## B4. Users & Team
- **Table:** Employee ID, Name, Phone, Email, Department, Roles, Last Login, Active/Inactive. Search, Add/Edit/Delete, and employee details.
- **Roles:** Operation Staff, Finance Staff, Operation Admin, Finance Admin, Customer Support, Document Officer, Report Manager.
- **Departments:** Management, Operations, Finance, Customer Service, Documents, Reports.
- **Roles & Permissions / Access Control:** each module is set to **No access**, **View only** (can open but not edit) or **Full**.
- **Special access:**
  - **Accounting** (on/off): only enabled users see the PIN screen. Everyone else sees "⛔ No access".
  - **Money Transfer:** No access / Receiver / Sender, plus the countries that user may work with.
  - **Time-limited access** windows.

## B5. Customers (not split by country)
- Reference (OR-3000+, automatic), Name, Phone, Company, Email, Location, Business, Service, Year.
- Search, Active/Inactive filters, summary, Add/Edit/Delete.
- **Customer Level:** automatic, from yearly value. Never chosen manually.
- **Customer details:** everything about the customer: shipments, invoices, payments, receipts.
- A duplicate reference, email or phone shows an **error**.

## B6. Shipments (by country + year)
- **Tabs:** Air / Sea.
- **Create Shipment:**
  - Code (W-n/C-n, automatic), Date, Arrival.
  - Origin (country + flag), Origin Code (city), Destination, Destination Code.
  - **AWB** (plain text).
  - **Year** selector next to the Create button.
  - Status is not changed here.
- **Top cards:** Total Packages, **Total KG** (sum of all customers' KG), Total CBM, **Total Amount** (sum of all invoices).
- **Shipment details:** Customers · Total Packages · Total KG · Total Amount, plus for Air only:
  - **AWB KG**: entered manually.
  - **Difference**: Total KG − AWB KG. Green when 0, red otherwise.
- **Customer list:** Add/Edit/Delete each customer.
  - **CustomerPicker:** type a name or reference and matches appear.
  - Packages, **KG**.
  - **MIX:** count + KG. One customer can be added several times; entries stack and are summed.
  - Measure (automatic), Brand PCS, Brand Rate, Rate.
  - **Quality:** a rate per kg, flowed into the invoice automatically.
  - Fatura, Delivery, Notification.

## B7. Operations (by country + year)
- Filters: Air/Sea, Search, Status, and Year (at the top).
- Statistics: Total Shipments, Air, Sea, Packages.
- Table with Shipment, Customer, and so on. Open Shipment.
- **Change Shipment Status:** updates the whole shipment at once (Departed / Transit / Arrived). At Origin Store is set automatically.

## B8. Schedule Announcement
- **Type:** **Air Flight / Sea Container / General**.
- **Title:** Air and Sea fill in an automatic, styled title ("Flight notice" / "Container notice").
- **Fields:** Last Day, Flight/Departure Date, Message, Origin, Destination.
- **Image:** shown at the top of the Preview.
- Sent automatically to **every customer in Customers**, then Schedule Announcement.

## B9. Finance (by country + year)
- **Tabs:** **Invoices · Payments · Statement · Invoice History · Reminders**. The left side shows Air/Sea and the shipment list.

**Invoices**
- "Customers in this Shipment" lists each customer with a **Create Invoice** button in their row.
- Once invoiced, the button becomes **⋮**: View / Edit / View History / Delete.
- **Create/Edit Invoice:** Billed KG (Actual KG shown for reference), Rate, and + Add Brand / Fatura / Local Delivery / **Others** / **Discount** / **Agent Commission**.
- **Agent Commission:** Agent/Company + **commission rate** (e.g. $1).
  - Shipment rate + commission = the customer's rate. The customer only sees the combined rate.
  - Commission **does not count as shipment income**.
  - It enters Accounting → Commissions & Income **only once the customer has paid in full**.
- **Extra KG** (Billed > Actual) is logged in Invoice History → KG/CBM added: Actual, Billed, Added, Discount, Extra earned.

**Payments**
- Pick a shipment, then **+ Add Payment**:
  - Customer (type name or reference), with Total / Paid / Balance shown.
  - Amount, Bank (with logo), Date.
- On save:
  - Status updates automatically (Unpaid → Partial Paid → Paid).
  - A **receipt** is created and the customer gets a notification.
- **Table:** #, Payment Date, Reference, Customer, Payment Method, Amount, Status, and a ⋯ menu (View Invoice / View Receipt / Edit / Delete).

**Statement**
- Every money movement: invoices as Debit, payments as Credit, with a running Balance.
- Customer filter, search, PDF.

**Reminders**
- Payment reminders. A reminder comes first; **a penalty or fee is added only after an admin approves it**.

## B10. Accounting (PIN + Special access)

**Shipment cost payment**
- Each shipment's cost is split into stages:
  - **Origin cost**: in the origin country.
  - **Transit cost**: in the transit country (air only).
  - **Arrived cost**: always Mogadishu (MGQ).
- Shows Total cost · Paid · Remaining, plus status.

**Operation cost (Turkey) — sheet**
- **Pulled in automatically:** Date, Week, AWB No, KG, Local delivery, Invoice charge, **Total income Somalia** (the money collected for W-1).
- **Entered manually:** AWB cost, Custom, Delivery & Packaging, Branded charges, Rate, **Transfer money (%)**. The % is converted to an amount automatically: % × origin cost.
- **Calculated automatically:** Cost rate, **Total Origin Cost**, Rate MGQ, Total cost rate, Income rate.
- The Turkey sheet and the Somalia sheet are filled in by different people. Neither can edit the other's sheet.

**Operation cost (MGQ / Mogadishu)**
- **Air:**
  - Quality control, Airport handling (Arimas) and MGQ Custom = **rate × KG** (automatic).
  - All other lines are plain amounts.
  - **Transit to [transit country]**: the label changes with the transit country.
  - **Net MGQ**, **Total Air Cost**, and **Rate = Total Air Cost ÷ KG**.
- **Sea:**
  - **Total Port Charges** = MAERSK + ALBAYRAK + Inland pickup truck + Scan + Quality control + Port porters + Truck + Store unloading.
  - **Import Tax** = Customs duty + Clearance.

**Shipment Cost & Profit** (per shipment)
- Total cost MGQ (pulled from Arrived), Rate MGQ (automatic), Total shipment cost.
- Total income = Total income Somalia − Transfer money.
- **Profit = Total income − Total shipment cost**.
- **Profit split (Turkey only):**
  - Orbit Cargo: Air 43% / Sea 45%
  - Somali Transport: Air 50% / Sea 50%
  - Mahad: Air 7% / Sea 5%
- India = 100% Orbit. Orbit pays its own expenses and salaries out of its share.

**Income & Out**
- Balance per country (Turkey, India), plus a **Total balance**.
- **Per bank** (Salaam, Dahabshiil, Premier, Cash): the admin types in each amount. If the bank amounts don't add up to the balance, show an **error**.
- **Income:** shipment collections (automatic), commission (once fully paid), money received, debts returned.
- **+ Add Out:** choose a Category.
  - **Shipment cost:** choose a shipment (e.g. W-1), then the stage: Origin / Transit / Arrived. Containers have Origin / Arrived only.
  - **Expenses**.
  - **Commission:** every agent who is owed money appears. Pay one, and the status updates automatically to Paid or Partial. One payment can cover several shipments.
  - **Transfer Money**.
  - **Debt**.
- **Sent to:** recipient name + bank or phone number. Every out entry gets a **receipt**.
- **Filters:** Expenses · Shipment cost · Commission · Transfer · Debt.
- **What this balance is made of** (bottom of the page): a table with In / Out / Remaining columns for Transfer · Commission · Shipments cost · Somali Transport profit · Mahad profit · Orbit profit. The rows add up to the country balance.

**Debts**
- Out → Debt (the person) adds them to the list.
- **Money returned** posts to Income automatically.
- Totals: Total lent / Returned / Still owed.

**Partners profit**
- For Somali Transport and Mahad: what they are owed (only after the shipment's cost has been collected) − what has been paid = what we hold.
- Turkey only.

**Profit & Expenses**
- Orbit's profit per shipment and the total per country, minus expenses = net profit.

**Commissions**
- Agent, shipment, customer, KG, rate, amount, status.

**Receipts**
- Every receipt (In/Out, Transfer, Payment, Commission, Expense, Debt…), sorted by type.

**Overview · Period closing**
- Close the books every 6 months or every year. A closed period can't be edited.
- A new year carries the previous balance forward.

## B11. Money Transfer (separate page)
- **Tabs:** **Customer transfer** · **Operation cost (Turkey)**. The second tab is for origin-cost money only, and the two are fully independent.
- **Receiver side (left):**
  - Fields: Date, Description/type (Clothes, Medicine, Other; Customer transfer only), name, **Amount**.
  - **Transfer fee %**: converted to an amount automatically and deducted.
  - **Total amount**.
  - Colour: **light orange** = received but not yet handed to the sender. **Light green** = handed over.
  - Click the name to edit.
- **Sender side (right):**
  - The sender records that the money arrived. The fee is read automatically from the receiver side.
  - The sender can't enter anything until the receiver turns the row green.
- **Access:**
  - The **Super Admin** sees both sides.
  - The sender sees Turkey only, or whichever countries the admin allows.
- **Months:** a **Start new month** button. Previous months stay viewable.
- Money received through transfers flows into Income.

## B12. Documents
- Filters: date range, current business year, Air & Sea, shipment, customer, search.
- Document reference, Upload Customer, Upload Shipment, file name.
- Document list and document records.

## B13. Reports
- Report selection: each section's own report, plus a company-wide one.
- Contents: Total Shipments, Air, Sea, KG, CBM, Revenue, Outstanding, shipment status, monthly counts.

## B14. Notifications
All notifications, filters, list, selected notification, customer announcements, records, and **Schedule Announcement**.

## B15. Settings (not split by country)
- **Company Profile:** name, email, phone, address, support email, support phone.
- **General:** Language, Currency, Timezone.
- **Years:** current year (2026), available years, **Create new year (2027)**, switch years. Data stays separated by year.
- **Countries:** add a country (from a full world list, with its flag added automatically) or remove one.
- **Notifications:** Email, Shipment, Payment, Document, Customer Announcements.
- **Security:** 2FA, Current / New / Confirm Password.
- **Appearance:** Light/Dark theme, Compact layout.
- **System:** Auto Save, system information.

---
**Final rules:**
- Anything that can be calculated **must be automatic**: KG, totals, status, level, reference, fees, profit, balance.
- Every money movement **gets a receipt**.
- Every user sees **only the countries and sections they're allowed**.
