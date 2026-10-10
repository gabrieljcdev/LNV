#!/bin/sh
# Daily backup of the live database (installed by deploy/HOSTING.md step 9).
#   - takes a consistent snapshot while the site is running (sqlite3 .backup, not a plain file copy)
#   - checks the snapshot opens and passes an integrity check, then compresses it
#   - keeps the last 14 days here; if OFFSITE is set (an rclone remote:path) it also copies it off the server
set -eu
DB=${LNV_DB_PATH:-/var/lib/lnv/vinyl_crate.db}
DIR=${BACKUP_DIR:-/var/backups/lnv}
OFFSITE=${OFFSITE:-}
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DIR"
TMP="$DIR/lnv-$STAMP.db"
sqlite3 "$DB" ".backup '$TMP'"
[ "$(sqlite3 "$TMP" 'PRAGMA integrity_check;')" = "ok" ] || { echo "backup failed integrity check" >&2; rm -f "$TMP"; exit 1; }
gzip -f "$TMP"
find "$DIR" -name 'lnv-*.db.gz' -mtime +14 -delete
[ -z "$OFFSITE" ] || rclone copy "$TMP.gz" "$OFFSITE"
echo "backup ok: $TMP.gz ($(du -h "$TMP.gz" | cut -f1))"
