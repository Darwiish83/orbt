#!/usr/bin/env bash
# Restore an OrbitCargo dump (data + stored files) into a FRESH database.
#
# Usage: MIGRATION_DATABASE_URL=postgres://orbit_owner:...@host/<fresh-db> scripts/restore-db.sh <dump-file>
# Requires: pg_restore and psql on the host.
#
# Before running it on a new server (e.g. the VPS):
#   1. create an empty database;
#   2. run `npx tsx scripts/db-setup-roles.ts` there (creates orbit_owner /
#      orbit_runtime / orbit_portal and lets orbit_owner build in that database).
# The restore runs as orbit_owner, so every object ends up owned by it, and the
# dump's grants and Row-Level Security come back as they were. Protective
# triggers are paused for this session only (session_replication_role), so
# history can be loaded in any table order; they are active again afterwards.
#
# SAFETY: never run it against a live database without an approved recovery
# plan. It refuses the primary database name unless ALLOW_PROD_RESTORE=yes.
set -euo pipefail

URL="${MIGRATION_DATABASE_URL:?target MIGRATION_DATABASE_URL (orbit_owner) is required}"
# Prisma's ?schema=public is not a libpq parameter; drop it (keep sslmode etc.).
URL="$(printf '%s' "$URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"
DUMP="${1:?usage: restore-db.sh <dump-file>}"
[ -f "$DUMP" ] || { echo "Dump not found: $DUMP" >&2; exit 1; }

if [[ "$URL" == *"/orbitcargo?"* || "$URL" == *"/orbitcargo" ]]; then
  if [ "${ALLOW_PROD_RESTORE:-}" != "yes" ]; then
    echo "Refusing to restore into what looks like the primary database." >&2
    echo "Set ALLOW_PROD_RESTORE=yes only with an approved recovery plan." >&2
    exit 1
  fi
fi

# Tables must come back with exactly the rights in the dump. Without this, the
# default privileges db-setup-roles.ts sets would hand orbit_runtime full rights
# (incl. DELETE on financial history) on every restored table. The dump puts
# the default privileges back at the end.
psql --no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "$URL" \
  --command 'ALTER DEFAULT PRIVILEGES FOR ROLE orbit_owner IN SCHEMA public REVOKE ALL ON TABLES FROM orbit_runtime'

PGOPTIONS="-c session_replication_role=replica" \
  pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error --dbname "$URL" "$DUMP"
echo "Restore complete."
