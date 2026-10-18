#!/usr/bin/env bash
# Back up the OrbitCargo database to a compressed custom-format dump.
# Usage: DATABASE_URL=postgres://... scripts/backup-db.sh [output-file]
# Requires: pg_dump (PostgreSQL client tools) on the host.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="${1:-backups/orbitcargo-${TS}.dump}"
mkdir -p "$(dirname "$OUT")"

pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" --file "$OUT"
echo "Backup written to $OUT ($(du -h "$OUT" | cut -f1))"
