# OrbitCargo — Secrets, Passwords & Accounts

**Date:** 2026-10-27 · **Decisions:** ADR-026, ADR-028 (no authenticator; hardened ID + email + password), ADR-029 (database roles, triggers, Row-Level Security), ADR-030 (files stored in the database) · Owner request: move past test accounts, keep every secret in its proper place, and cover the security risks.

---

## 1. Where every secret lives

| Secret | Where it lives | Never in |
|---|---|---|
| **People's passwords** (staff, customers, owner) | Only as an **Argon2id hash** in the database. Each person keeps their own password in a **password manager** (Bitwarden, 1Password…). | Code, git, docs, chat, email, spreadsheets, sticky notes |
| `AUTH_SECRET` (signs sessions) | `.env` on each machine (git-ignored); production → the host's secret store | Git, chat, screenshots |
| Database role passwords (`DATABASE_URL` = orbit_runtime, `PORTAL_DATABASE_URL` = orbit_portal, `MIGRATION_DATABASE_URL` = orbit_owner, `DATABASE_ADMIN_URL` = server admin) | `.env` / `.env.test`, generated randomly by `scripts/db-setup-roles.ts` (never printed). Production → secret store, **different** passwords; the app server gets only the runtime + portal URLs | Git (`.env.example` only has `CHANGE_ME`), chat, logs |
| `RESEND_API_KEY` (email) | `.env`; production → secret store | Git |
| E2E test passwords | Locally `.env.test` (random per machine). CI: **random for every run**, masked, thrown away with the CI database. | Code (removed from `tests/e2e/constants.ts`) |
| **Database backups** (`.dump`) | Since ADR-030 a dump holds every customer record **and every uploaded document**: owner-only file (`umask 077`), encrypted when it leaves the server, deleted from laptops after a move | Git, email, chat, shared drives |
| One-time codes / reset tokens | DB, hashed (HMAC / SHA-256), short-lived, single-use | Logs (except the dev-only `devCode` line when no email provider is set) |

Templates with placeholders only: `.env.example`, `.env.test.example`.

## 2. Accounts

### Super Admin
- **EMP-003** (owner) is Super Admin (`scripts/make-super-admin.ts`, audited). It was granted without handling any password.
- **The owner sets the password themselves:** `/login` → *First login or forgot password?* → `EMP-003` + their Gmail → 6-digit code by email → new password.
- If the email doesn't arrive, run this **yourself** in your own terminal:
  ```bash
  npx tsx scripts/make-super-admin.ts --employee EMP-003 --link
  ```
  It prints a 15-minute, single-use link. Don't share it, and don't paste it in chat. (Resend in test mode only delivers to the Resend account owner's address until a domain is verified; see §4.)

### New staff
1. Super Admin adds them in **Users & Team** (no password is typed by anyone else).
2. The person signs in at `/login` → *First login or forgot password?* with their Employee ID + email → code → their own password.

**Leavers:** suspend in Users & Team the same day. This revokes all sessions immediately (`sessionEpoch`).

### Customers
Self-register (*New Customer*) or are added by staff. Either way, they set their own password via the emailed code. Staff never know customer passwords.

### Test accounts (suspended 2026-10-27)
`scripts/suspend-test-accounts.ts --apply` suspended 9 demo/test staff, 19 test customers and the test-only `ops_tester` role assignments. **Nothing was deleted.** Backup: `backups/orbitcargo-pre-secrets-cleanup.dump`.

The scripts that created accounts with passwords written in the code (`seed-testers.mjs`, `demo-transaction.ts`, `demo-finance.ts`, `create-admin.ts`) are removed. The E2E suite now uses its **own database** (`E2E_DATABASE_URL`) and its own document folder (`storage/e2e-documents`), so it can never recreate test accounts in real data.

## 3. How a sign-in is protected (ADR-028)

| Layer | Rule |
|---|---|
| Three matching fields | Employee ID / Customer Reference **and** the account's email **and** its password must all belong to the same active account. A customer can never sign in as staff, or the other way round. |
| Password rules | 10–128 characters, letters + numbers, not containing the email name or ID, not a well-known password (`src/modules/auth/passwordPolicy.ts`). Stored only as an Argon2id hash. |
| Guessing limits | 5 failures / 15 min per ID and per email; 20 failures / 15 min per IP (`src/modules/auth/loginGuard.ts`). |
| Lockout | 10 failures in an hour lock the account for 30 minutes, even if the right password is then typed. A successful login clears the lock. |
| No hints | Every failure shows the same message; first-login / forgotten-password codes never reveal whether an account exists. |
| Sessions | 8-hour sessions, httpOnly + Secure cookies in production; a password change or suspension ends every session at once (`sessionEpoch`). |
| Data isolation | Every read checks ownership or permission on the server. Customer B can't list or open customer A's shipments, invoices, receipts, documents, transfer receipts or notifications, nor call staff operations; proven by `tests/integration/isolation.test.ts`. |

## 3b. What the database refuses by itself (ADR-029)

Even with the code or the app's own database password, these are refused **by PostgreSQL**, not just by the app (proven by `tests/integration/db-guards.test.ts`, which sends raw SQL):

| Attempt | Refused by |
|---|---|
| Drop/alter tables, TRUNCATE, create tables or roles, switch triggers or Row-Level Security off, read the migration ledger, run programs | `orbit_runtime` has no such rights |
| Delete or rewrite the audit log, shipment events, invoice revisions, payment allocations | append-only triggers + revoked rights |
| Delete invoices, payments, receipts, outs, transfer receipts, period closes, debt returns | revoked DELETE + triggers |
| Change a receipt's/payment's amount or customer, un-reverse it, renumber or move an invoice, wind back receipt numbers | reversal-only / identity / forward-only triggers |
| Jump a shipment's status (e.g. straight to Arrived), move it backwards, change its mode | status-path trigger |
| Write outs, invoices or invoice lines into a closed period / closed year | closed-period triggers |
| Change, delete or forge a stored document/image (wrong size or hash, filename as key); a customer reading another customer's file bytes | `StoredFile` checks + append-only trigger + Row-Level Security (ADR-030) |
| Run the production app as the admin/owner by mistake | the server refuses to start (`src/db/roleCheck.ts`) |
| A customer connection reading another customer's shipments, invoices, receipts, documents, transfer receipts or notifications; reading accounts, passwords, login history, audit log or accounting; changing anything; filing a document under another customer | Row-Level Security + `orbit_portal` rights; with no customer set it sees nothing |

## 4. Risks and how they are covered

| Risk | Status / mitigation |
|---|---|
| **Old test passwords remain in git history** and in this project's chat history | Every account they belong to is **suspended** (and only ever existed in the local dev DB). The current code no longer contains them. Rewriting git history isn't worth the risk; treat those values as burned. |
| `.env` copied between computers / synced by **OneDrive** | `.env` is in the OneDrive folder, so it is in Microsoft's cloud under the owner's account. Use a strong Microsoft password + MFA. On a computer someone else owns, create a **new** `.env` with new secrets instead of copying yours. Production uses its own secrets, never these. |
| A shared computer stays logged into Claude / GitHub | Sign out of the Claude app and GitHub; remove the GitHub entry from Windows *Credential Manager*. Prefer a fine-grained, expiring GitHub token (only `orbt`) or the person's own account as collaborator. |
| Password in shell history | Removed: no script takes a password argument any more. |
| Brute force / guessing | Per-ID login rate limit (5 failures / 15 min); OTP: 5 tries, 10-min expiry, 5 sends / 15 min; generic error messages. |
| Stolen session after a password change or suspension | `sessionEpoch` bump invalidates all sessions. |
| **No second factor** (ADR-028, owner decision) | Sign-in is ID + email + password. Anyone holding all three can sign in, so: limits per ID / email / IP, 30-minute lockout after 10 failures in an hour, strong-password rules, generic errors. Each person keeps their password only in a password manager and never shares it. |
| Repo goes public by mistake | Keep `orbt` **private**. Secrets aren't in it anyway, but business rules and security design are. |
| Email deliverability | `onboarding@resend.dev` only delivers to the Resend account owner. **Before go-live**, verify the company domain in Resend and set `EMAIL_FROM` to it, otherwise customers and staff won't get codes. |
| Dev database admin password is a simple local value | Local Docker only (port 5433, not exposed beyond this PC by default). The app no longer uses it (ADR-029): it only creates roles and takes backups. Production: strong unique admin password, kept off the app server. |
| The app's own DB password leaks | It is `orbit_runtime`: no DDL, no erasing history, triggers still apply, customer pages use `orbit_portal` under RLS. Rotate with `npx tsx scripts/db-setup-roles.ts --rotate` and restart the app. |

## 5. Before production (checklist)

- [ ] New, random `AUTH_SECRET` (≥ 32 bytes) in the host's secret store. Never reuse dev's.
- [ ] Run `scripts/db-setup-roles.ts` on the production server with its own admin; the app gets only `DATABASE_URL` (orbit_runtime) and `PORTAL_DATABASE_URL` (orbit_portal) from the secret store; `MIGRATION_DATABASE_URL` only in the deploy step.
- [ ] Resend domain verified; `EMAIL_FROM` set to it; API key in the secret store.
- [ ] Reverse proxy sets `X-Forwarded-For` (the per-IP login limit reads it) and strips any value sent by clients.
- [ ] `APP_URL` / `AUTH_URL` = the HTTPS domain.
- [ ] Test accounts never created in production (no seeding scripts exist for them; E2E uses its own DB).
- [ ] Backups encrypted and stored off the server (see `docs/deployment/`).
