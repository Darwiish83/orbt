# OrbitCargo — Rollback & Incident Response

## Rollback (bad deploy)

1. **App code** — redeploy the previous image tag (immutable tags). The
   standalone server is stateless; traffic shifts back immediately.
2. **Database migrations** — forward-only. Do **not** auto-roll-back schema. If a
   migration caused the issue:
   - Prefer a new **forward** corrective migration.
   - Only restore from backup if data integrity is compromised, following the
     recovery procedure below, with explicit approval.
3. Verify `/api/health` and the smoke E2E against the rolled-back version.

## Database recovery (data loss / corruption)

1. **Stop writes** (put the app in maintenance or scale to zero).
2. Identify the last-good backup (`scripts/backup-db.sh` output; nightly).
3. Restore into a **fresh** database: `DATABASE_URL=<fresh> scripts/restore-db.sh <dump>`.
4. Validate (row counts, spot-check recent records, run integration checks).
5. Repoint `DATABASE_URL` to the restored DB and resume.
6. Never overwrite the primary in place without approval (`ALLOW_PROD_RESTORE=yes`).

> The backup→restore round-trip is tested (Phase 9): a custom-format dump
> restored into a fresh DB reproduced identical row counts.

## Security incident

1. **Contain** — if credentials/sessions may be compromised, rotate `AUTH_SECRET`
   (invalidates all JWTs) and force-suspend affected accounts (bumps
   `sessionEpoch`). Rotate DB and storage credentials.
2. **Assess** — review the append-only `AuditEvent` log (auth, role changes,
   financial mutations, document access, shipment-state changes) and structured
   logs (secrets redacted).
3. **Eradicate & recover** — patch, redeploy, restore data if needed.
4. **Notify** — follow legal/contractual breach-notification obligations.
5. **Post-mortem** — root cause, timeline, and preventive actions; add a
   regression test.

## Key contacts & escalation

- On-call engineer → Engineering lead → Business owner.
- Fill in real names/rotations before launch.
