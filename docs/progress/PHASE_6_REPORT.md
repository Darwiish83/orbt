# OrbitCargo — Phase 6 Progress Report

**Phase:** 6 — Private documents, customer portal, notifications
**Status:** ✅ Complete. Awaiting approval for Phase 7.
**Date:** 2026-10-18

---

## 1. Scope delivered

- **Private document storage** (ADR-010) — `Storage` interface with a local filesystem implementation **outside the web root**; app-generated **random, sharded storage keys** (never the user filename); storage-root containment check (no path traversal). Swappable for S3 in production.
- **Upload validation** — 10 MB cap, allowed types (PDF/PNG/JPEG/WEBP), **magic-byte content sniffing** with declared-type match; filenames sanitized for display only.
- **Documents service** — upload (customers forced to their own account; staff need `documents:write`), object-level **download authorization** on both ends, scoped list, soft delete (retention), SHA-256 checksum, audit entries.
- **Authorized download route** (`/api/documents/[id]/download`) — streams from private storage to EITHER an authenticated+authorized session OR a valid **short-lived HMAC signed token** bound to the document id; `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- **Customer portal** (`/account`) — gated route group requiring a **customer principal** (staff are bounced to admin; customers are bounced out of admin to the portal); self-scoped pages: shipments, invoices, documents (upload + download). Navy portal shell with nav, language toggle, logout.
- **Notifications service** — create/schedule/send + audience-scoped listing (customers see ALL announcements + their own SENT notifications; staff with `notifications:read` see all).

## 2. Checks performed (actual results)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint` | ✅ clean |
| Migration apply (dev + test) | `prisma migrate dev` / `deploy` | ✅ `document_filename` applied |
| **Integration (DB)** | `npm run test:integration` | ✅ **61 passed** (+11 document tests) |
| Unit | `npm test` | ✅ 12 passed |
| **E2E (prod build)** | `npm run test:e2e` | ✅ **7 passed** (+ customer portal upload/download) |
| Production build | `npm run build` | ✅ builds; `/account/*` + download route dynamic |

**New Phase 6 tests cover:** magic-byte type detection; **declared-vs-actual type mismatch rejected**; **unrecognized** + **oversized** uploads rejected; random sharded keys + byte round-trip; **traversal key refused**; staff upload/download by permission; **customer IDOR** (own-only download/list; a customer upload is forced to their own account); soft-deleted document not served; **signed token** verify/tamper/expiry/mismatch. **E2E:** a customer logs into the portal and uploads + sees a download link through the authorized route.

## 3. Decisions (new)

- **ADR-010** — private FS storage behind a `Storage` interface; server-mediated authorized downloads + signed URLs (production → S3-compatible).

## 4. Notes / deferrals

- **Malware scanning, backup and retention automation** for uploads remain for Phase 9 (deployment/ops).
- Admin notifications **composer UI** and the richer admin document browser are Phase 7 (admin UI completeness); the services exist and are authorized.
- Signed download URLs are implemented and tested; the portal currently links to the session-authorized route (customers are already authenticated), using signed URLs where a session-less link is later needed (e.g. email).

## 5. Exact next step (Phase 7 — awaiting approval)

Admin management, reporting, localization and UI completeness: full admin CRUD (users/roles, customers, shipments with status actions, operations incl. the **transfer send/receive workflow**, finance create-invoice/record-payment, documents, notifications composer, settings), reporting read-models, complete EN/SO/AR coverage incl. RTL, and loading/empty/error/success states in the approved visual language.

**STOP — Phase 6 complete. Awaiting approval before Phase 7.**
