#!/usr/bin/env bash
# Restore an OrbitCargo dump into the TARGET database in DATABASE_URL.
# Usage: DATABASE_URL=postgres://...  scripts/restore-db.sh <dump-file>
# Requires: pg_restore on the host.
#
# SAFETY: this overwrites objects in the target database (--clean). NEVER run it
# against production without an explicit, approved recovery plan. Prefer
# restoring into a fresh database and promoting it.
set -euo pipefail

: "${DATABASE_URL:?target DATABASE_URL is required}"
DUMP="${1:?usage: restore-db.sh <dump-file>}"
[ -f "$DUMP" ] || { echo "Dump not found: $DUMP" >&2; exit 1; }

if [[ "$DATABASE_URL" == *"/orbitcargo?"* || "$DATABASE_URL" == *"/orbitcargo" ]]; then
  if [ "${ALLOW_PROD_RESTORE:-}" != "yes" ]; then
    echo "Refusing to restore into what looks like the primary database." >&2
    echo "Set ALLOW_PROD_RESTORE=yes only with an approved recovery plan." >&2
    exit 1
  fi
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" "$DUMP"
echo "Restore complete."
