#!/bin/sh
# Put a backup back (HOSTING.md "Restore"). Usage:  sudo deploy/restore.sh /var/backups/lnv/lnv-2026-10-10_0300.db.gz
# Stops the backend, keeps the current database aside as *.before-restore, restores, starts the backend.
# Optional second argument: an activity backup (/var/backups/lnv/activity-....db.gz) to put back the same way.
set -eu
[ $# -ge 1 ] || { echo "usage: $0 <backup.db.gz> [activity-backup.db.gz]" >&2; exit 1; }
DB=${LNV_DB_PATH:-/var/lib/lnv/vinyl_crate.db}
systemctl stop lnv
[ -f "$DB" ] && mv "$DB" "$DB.before-restore"
rm -f "$DB-wal" "$DB-shm"
gunzip -c "$1" > "$DB"
chown lnv:lnv "$DB"
[ "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" = "ok" ] || { echo "restored file failed its integrity check" >&2; exit 1; }
if [ $# -ge 2 ]; then
  ACT=${LNV_ACTIVITY_DB_PATH:-$(dirname "$DB")/activity.db}
  [ -f "$ACT" ] && mv "$ACT" "$ACT.before-restore"
  rm -f "$ACT-wal" "$ACT-shm"
  gunzip -c "$2" > "$ACT"
  chown lnv:lnv "$ACT"
  [ "$(sqlite3 "$ACT" 'PRAGMA integrity_check;')" = "ok" ] || { echo "restored activity file failed its integrity check" >&2; exit 1; }
fi
systemctl start lnv
echo "restored from $1 (previous database kept as $DB.before-restore)"
