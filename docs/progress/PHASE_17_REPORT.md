# OrbitCargo — Phase 17 Progress Report

**Phase:** 17 — Money Transfer (spec B11; owner's revised admin prompt §12)
**Status:** ✅ Complete. With Phases 14–17, the admin panel of the revised prompt is built.
**Date:** 2026-10-24

---

## 1. Scope delivered — `/transfer` ("Money Transfer" in the menu)
The design's **Money Status Report** (`AccountingTransfer.jsx`):

- **Tabs:**
  - **Customer transfer**: money customers send to people.
  - **Operation cost**: origin-cost money only, fully separate, *a record only* (not added to Income, Balance or Shipment cost).
- **Receiver side (left):**
  - Fields: date, amount received, **transfer fee %** (converted to an amount and deducted), currency (USD/EUR/TRY), name/description, and type (Clothes / Medicine / Other) on the customer tab.
  - Columns: **AMOUNT** (to send), **TRANSFER FEE**, **TOTAL AMOUNT** (received).
  - Click the name to edit.
  - **Light orange** = received, not handed to the Sender. **Light green** = handed over; only the Receiver can switch it.
- **Sender side (right):** "+ Add transfer" appears **only on a green row**.
  - The Sender types the amount taken from the customer; **the fee is read from the Receiver's row**; status PAID / PENDING.
  - Edit or delete the transfer side only ("Money Receive stays").
- **Locking:** once the Sender has recorded a row, the Receiver can't edit it, turn it orange, or delete it until the transfer side is removed.
- **Totals:** Money Receive, Money Transfer, Not sent yet, plus the totals row.
- **Months:** tabs up to the current month (the whole year for past years). **Start new month** (Receiver or super admin) opens the next month, up to 12.

## 2. Access (spec §5, §12)
- **Super Admin** sees both sides and every country.
- **Receiver / Sender** come from *Users & Team → Special access → Money Transfer*.
  - `loadAuthzUser` gives `transfer:read` plus `transfer:receive` or `transfer:send`, and **removes any transfer permission a role would otherwise give**.
  - Each person works only in their **Money Transfer countries**. The Sender defaults to **Turkey** only.
- Without a role: "⛔ No access".

## 3. Balance
- **Customer transfers in USD** count as **Money Receive** in Accounting → Income & Out: the balance, the income list, and the *Transfer* row of "What this balance is made of".
- Money sent out is recorded as an Out → **Transfer Money**.
- EUR / TRY rows stay on the report but are **not added to the USD balance**: they can't be summed without an exchange rate.

## 4. Database
Backup taken first: `backups/orbitcargo-before-money-transfer.dump`.

Migration `20261024200000_money_transfer`:

| Kind | Added |
|---|---|
| Enums | `TransferKind`, `TransferTag`, `TransferSendStatus` |
| Tables | `MoneyTransferRow` (soft delete), `TransferMonth` |
| CHECKs | Amount > 0; fee 0–<100 %; month 1–12; sent amount > 0; **a Sender side only after the row was handed over** |

**Permissions:** `transfer:receive`, `transfer:send` (seed: 42 permissions).

**Replaced:** the earlier country-to-country `Transfer` workflow (Phase 6) did not match the spec. Its service, page and 3 tests were removed. The old `Transfer` table had **0 rows** and is left in place, unused; dropping it needs your OK.

## 5. Checks performed (actual results)

| Check | Result |
|---|---|
| Type check / Lint | ✅ / ✅ |
| New `money-transfer.test.ts` | ✅ **5 passed**. Covers: role from the employee setting (role permissions ignored); Sender Turkey-only by default; custom countries. Fee 1.5 % on 1,000 → 15 / 985. The Sender is blocked until the row is green, and only the Receiver turns it green. Fee read from the Receiver; totals. Locks after sending; delete order. Validation: amount, fee, currency, name, year. Country isolation. Months, and Start new month (not for the Sender). Income: USD customer only, not operation or EUR, and it shows in the composition. |
| Full integration | ✅ **162 passed** (13 files) |
| Unit | ✅ **49 passed** |
| Browser (dev) | `/transfer` and the operation tab render; Accounting tabs render after a dev-server restart (a new Prisma client was needed). |
| Production build | ✅ compiled (`/transfer`, `/accounting` built) |
