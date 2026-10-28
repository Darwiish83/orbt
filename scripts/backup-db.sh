#!/usr/bin/env bash
# Back up the OrbitCargo database (all data AND every stored file, ADR-030) to a
# compressed custom-format dump.
#
# Usage: MIGRATION_DATABASE_URL=postgres://orbit_owner:...@host/db scripts/backup-db.sh [output-file]
#        (or BACKUP_DATABASE_URL=<admin URL>)
# Requires: pg_dump (PostgreSQL client tools) on the host.
#
# Uses the owner role, not the app's: orbit_runtime may not read everything
# (e.g. the migration ledger) by design (ADR-029). Grants and Row-Level
# Security policies are kept in the dump; ownership is not (restore-db.sh
# gives it to orbit_owner on the target).
set -euo pipefail

URL="${BACKUP_DATABASE_URL:-${MIGRATION_DATABASE_URL:-}}"
[ -n "$URL" ] || { echo "Set MIGRATION_DATABASE_URL (owner) or BACKUP_DATABASE_URL (admin)" >&2; exit 1; }
# Prisma's ?schema=public is not a libpq parameter; drop it (keep sslmode etc.).
URL="$(printf '%s' "$URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="${1:-backups/orbitcargo-${TS}.dump}"
mkdir -p "$(dirname "$OUT")"
umask 077 # the dump holds customers' data and documents: owner-only file

pg_dump --format=custom --no-owner --dbname "$URL" --file "$OUT"
echo "Backup written to $OUT ($(du -h "$OUT" | cut -f1))"
