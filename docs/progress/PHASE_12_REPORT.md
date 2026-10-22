# OrbitCargo — Phase 12 Progress Report

**Phase:** 12 — Login flows (ADR-016, owner spec A1 / B1)
**Status:** ✅ Complete. Awaiting approval for Phase 13.
**Date:** 2026-10-20

---

## 1. Scope delivered

The single shared login form of 2026-10-20 is replaced by the spec's two flows.

### Customer — `/login` (design: `ui_kits/customer-app/Login.jsx`)

| Flow | Steps |
|---|---|
| **Existing customer** | Customer Reference + Password → Log in → `/account` |
| **First login / forgot password** | Reference + Phone (+252) + Email → **Send OTP** → 6-digit code → Verify → create password (8+, confirm) → signed in |
| **New customer** | Full name, Phone, Email, Company, Location, What you buy (all required) → OTP → Verify → customer + portal account created with the next **OR-** reference, delivered as an **in-app notification** → create password → signed in |

On desktop the page uses the design's split layout: a navy brand panel with the right-hand 430px column. On mobile it is the navy header with the card. Trust signals (Fast and Secure · Reliable Logistics · Worldwide Coverage) and a "Staff? Admin login" link are included.

### Staff — `/admin/login` (design: `ui_kits/admin/AdminLogin.jsx`)

| Mode | Steps |
|---|---|
| **Sign in** | Employee ID + Gmail + Password (+ Authenticator code for MFA-enrolled staff) → `/dashboard` |
| **Create Password** (first time / forgotten) | 1 Verify: Employee ID → 2 Gmail: email → **Send code** → code → Verify → 3 Password: create + confirm → signed in (MFA staff are sent to Sign in) |

Step 3 asks for the **Orbit** password. The design labels it "Gmail Password", but we never ask for the person's real Gmail password.

### Server side

- `OtpCode` table (migration `20261020120000_otp_codes`). Codes are 6 random digits; only an **HMAC** keyed with `AUTH_SECRET` and bound to the row id is stored.
  - Expiry 10 minutes, single-use (atomic consume).
  - Burned after 5 wrong tries.
  - A resend retires the previous code.
  - At most 5 codes per email + purpose per 15 minutes.
  - Purposes are separate: a customer code cannot verify staff setup.
- **No account enumeration.** Every request answers the same way ("If the details match our records…"); a code is sent **only** when everything matches.
  - Customer: Reference, phone and email on file must match, and the customer must be active.
  - Staff: Employee ID, account email, an active employee, and a non-customer account.
  - Mismatches count towards a per-Reference / per-Employee-ID rate limit.
- **Signup creates nothing until the code verifies.** Customer, portal user, welcome notification and audit entry are then written in **one transaction**. Duplicate email/phone is re-checked at that moment (a staff member may have registered the same person meanwhile).
- **Set-password step:** a short-lived (15 min), single-use token (reuses the reset-token store). It enforces 8+ characters and a matching confirmation before the token is consumed. It activates the account and bumps `sessionEpoch`.
- **Sign-in:** one Credentials provider with two shapes, `customer` (Reference + password) or `staff` (Employee ID + email + password + TOTP). Constant-time password checks (dummy hash) and rate limits per Reference / Employee ID.
- **Redirects:**
  - Staff areas → `/admin/login`; `/account` → `/login`.
  - Logout returns staff to `/admin/login` and customers to `/login`.
- **Email:** `src/lib/otpEmail.ts` sends the code via Resend. Without an email provider (local dev only), the code is written to the server log as `devCode`. In production a missing provider throws.
- **Translations:** EN/SO/AR for every new string (13 added; the design's own strings were already in the dictionaries).

## 2. Checks performed (actual results)

| Check | Result |
|---|---|
| Migration on dev + test DBs | ✅ |
| Type check / Lint | ✅ / ✅ |
| New `login-flows.test.ts` | ✅ **21 passed**: sign-in (both kinds); first login (match, 5 kinds of mismatch, malformed, rate limit); OTP rules (lockout, single-use, expiry, resend retires the old code, stored as hash, send limit); signup (nothing before verify, Reference notification, duplicates, re-check at verify); staff setup (match, 3 kinds of mismatch, wrong-purpose code); password rules; Employee ID backfill |
| Full integration | ✅ **121 passed** (9 files; the 11 shared-field tests were replaced by the 21 flow tests) |
| Unit | ✅ **49 passed** |
| Production build | ✅ `/login` and `/admin/login` built static (only warning: existing `jose`/Edge notice) |
| E2E smoke | ✅ **13 passed**: redirects to the right login; wrong password; first-login screen reveals nothing; signup requires all fields; a customer can't use the admin login; Create Password steps; staff login → shell → logout to `/admin/login`; customer login → portal |
| Visual | ✅ login + **new admin-login** baselines regenerated (pages changed by design) |
| Phone width (800px pane, mobile layout) | ✅ no horizontal overflow on either page |

## 3. Notes and residual items

- **Customers created by staff need an email on file** before they can do "first login". Without one, no code can be sent (otherwise anyone who knows a Reference and phone could take the account). Staff add the email in Customers.
- **Old routes:** `/forgot-password` and `/reset-password` (email-link reset) still work but are no longer linked. Staff reset via "Create Password", customers via the OTP flow. They can be removed later.
- **Existing dev accounts:** customers sign in with their Reference (e.g. `OR-DEMO`). Staff sign in at `/admin/login` with Employee ID + their email + password (e.g. `EMP-002` + `tester@orbit.so`).
- **E2E setup** clears login attempts only for its own test identifiers, so repeated runs don't trip the rate limit.
- The OTP-by-email path is covered by integration tests with a capturing sender. E2E doesn't read real email.

## 4. Next step

**Phase 13 — Customer App** (spec A2–A10): Home, Shipments, Shipment detail, Finance, Invoice, Notifications, Documents/Records, Profile, Support/WhatsApp, on mobile and desktop.

It is waiting for your approval.
