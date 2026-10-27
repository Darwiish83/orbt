# OrbitCargo — Secrets, Passwords & Accounts

**Date:** 2026-10-27 · **Decision:** ADR-026 · Owner request: move past test accounts, keep every secret in its proper place, and cover the security risks.

---

## 1. Where every secret lives

| Secret | Where it lives | Never in |
|---|---|---|
| **People's passwords** (staff, customers, owner) | Only as an **Argon2id hash** in the database. Each person keeps their own password in a **password manager** (Bitwarden, 1Password…). | Code, git, docs, chat, email, spreadsheets, sticky notes |
| **MFA (authenticator) seeds** | DB, encrypted (AES-256-GCM, key from `AUTH_SECRET`); the person's authenticator app | Anywhere else |
| `AUTH_SECRET` (signs sessions, encrypts MFA seeds) | `.env` on each machine (git-ignored); production → the host's secret store | Git, chat, screenshots |
| `DATABASE_URL` password | `.env`; production → secret store, with a **different** password from dev | Git (`.env.example` only has `CHANGE_ME`) |
| `RESEND_API_KEY` (email) | `.env`; production → secret store | Git |
| E2E test passwords + MFA seed | Locally `.env.test` (random per machine). CI: **random for every run**, masked, thrown away with the CI database. | Code (removed from `tests/e2e/constants.ts`) |
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
- **Then turn on MFA:** after signing in, open `/mfa/setup` and scan the code with an authenticator app. Keep the recovery codes in the password manager.

### New staff
1. Super Admin adds them in **Users & Team** (no password is typed by anyone else).
2. The person signs in at `/login` → *First login or forgot password?* with their Employee ID + email → code → their own password.
3. Privileged roles enrol MFA.

**Leavers:** suspend in Users & Team the same day. This revokes all sessions immediately (`sessionEpoch`).

### Customers
Self-register (*New Customer*) or are added by staff. Either way, they set their own password via the emailed code. Staff never know customer passwords.

### Test accounts (suspended 2026-10-27)
`scripts/suspend-test-accounts.ts --apply` suspended 9 demo/test staff, 19 test customers and the test-only `ops_tester` role assignments. **Nothing was deleted.** Backup: `backups/orbitcargo-pre-secrets-cleanup.dump`.

The scripts that created accounts with passwords written in the code (`seed-testers.mjs`, `demo-transaction.ts`, `demo-finance.ts`, `create-admin.ts`) are removed. The E2E suite now uses its **own database** (`E2E_DATABASE_URL`) and its own document folder (`storage/e2e-documents`), so it can never recreate test accounts in real data.

## 3. Risks and how they are covered

| Risk | Status / mitigation |
|---|---|
| **Old test passwords remain in git history** and in this project's chat history | Every account they belong to is **suspended** (and only ever existed in the local dev DB). The current code no longer contains them. Rewriting git history isn't worth the risk; treat those values as burned. |
| `.env` copied between computers / synced by **OneDrive** | `.env` is in the OneDrive folder, so it is in Microsoft's cloud under the owner's account. Use a strong Microsoft password + MFA. On a computer someone else owns, create a **new** `.env` with new secrets instead of copying yours. Production uses its own secrets, never these. |
| A shared computer stays logged into Claude / GitHub | Sign out of the Claude app and GitHub; remove the GitHub entry from Windows *Credential Manager*. Prefer a fine-grained, expiring GitHub token (only `orbt`) or the person's own account as collaborator. |
| Password in shell history | Removed: no script takes a password argument any more. |
| Brute force / guessing | Per-ID login rate limit (5 failures / 15 min); OTP: 5 tries, 10-min expiry, 5 sends / 15 min; generic error messages. |
| Stolen session after a password change or suspension | `sessionEpoch` bump invalidates all sessions. |
| Super Admin without MFA | **Open until the owner enrols** (`/mfa/setup`). `REQUIRE_MFA="false"` in dev `.env` skips forced enrolment. **Production must leave `REQUIRE_MFA` unset** (MFA then becomes mandatory for privileged roles). |
| Repo goes public by mistake | Keep `orbt` **private**. Secrets aren't in it anyway, but business rules and security design are. |
| Email deliverability | `onboarding@resend.dev` only delivers to the Resend account owner. **Before go-live**, verify the company domain in Resend and set `EMAIL_FROM` to it, otherwise customers and staff won't get codes. |
| Dev database password is a simple local value | Local Docker only (port 5433, not exposed beyond this PC by default). Production must use a strong, unique password and least-privilege DB user. |

## 4. Before production (checklist)

- [ ] New, random `AUTH_SECRET` (≥ 32 bytes) in the host's secret store. Never reuse dev's.
- [ ] New DB user/password (least privilege); `DATABASE_URL` only in the secret store.
- [ ] Resend domain verified; `EMAIL_FROM` set to it; API key in the secret store.
- [ ] `REQUIRE_MFA` **unset**; Super Admin and admins enrolled in MFA.
- [ ] `APP_URL` / `AUTH_URL` = the HTTPS domain.
- [ ] Test accounts never created in production (no seeding scripts exist for them; E2E uses its own DB).
- [ ] Backups encrypted and stored off the server (see `docs/deployment/`).
