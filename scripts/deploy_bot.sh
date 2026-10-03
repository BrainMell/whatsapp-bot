#!/bin/bash
# deploy_bot.sh - safe deploy for the auth-in-git workflow (Box 1).
# Stops the bot, hard-syncs CODE to origin, but PRESERVES live auth dirs
# (instances/*/auth) so a deploy can never kill a working WhatsApp session.
#
# v2 (2026-09-28, after the Subaru session-loss incident):
#   * [2b] verifies the backup BEFORE any git operation - aborts (auth+code
#     untouched) if any creds.json is missing or unparseable
#   * prints a per-instance session table (registered / me) every deploy so a
#     me-less creds.json is VISIBLE before the engine can overwrite it
#   * [4b] post-restore parse check + keeps timestamped snapshots in
#     /home/ubuntu/auth-backups (last 3) - the tmp copy is no longer the only one
#   * engine-side companion: initSocket preserves a me-less creds.json as
#     creds.json.preserve-<ts> instead of letting the fresh-pair flow clobber it
# Usage: bash ~/deploy_bot.sh
set -euo pipefail
BRANCH="audit/fix-pass-1"
cd /home/ubuntu/whatsapp-bot
AUTH_BACKUP=$(mktemp -d /tmp/auth-backup.XXXXXX)

echo "[1/6] stopping whatsapp-bot..."
pm2 stop whatsapp-bot || true

echo "[2/6] backing up live auth dirs to $AUTH_BACKUP ..."
for d in instances/*/auth; do
  [ -d "$d" ] && mkdir -p "$AUTH_BACKUP/$(dirname $d)" && cp -a "$d" "$AUTH_BACKUP/$d"
done

echo "[2b/6] verifying backup + session table (registered/me) ..."
DEPLOY_OK=1
while IFS= read -r -d '' f; do
  inst=$(basename "$(dirname "$(dirname "$f")")")
  if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" 2>/dev/null; then
    echo "  ❌ $inst: creds.json UNPARSEABLE - aborting deploy (code NOT touched)"
    DEPLOY_OK=0
    continue
  fi
  python3 - "$inst" "$f" <<'PY'
import json, sys
inst, path = sys.argv[1], sys.argv[2]
d = json.load(open(path))
reg = bool(d.get("registered"))
me = bool(d.get("me"))
mark = "OK " if (reg and me) else "WARN"
print(f"  [{mark}] {inst}: registered={str(reg).lower()} me={'yes' if me else 'MISSING'}")
PY
done < <(find "$AUTH_BACKUP/instances" -name creds.json -maxdepth 4 -print0 2>/dev/null)
if [ "$DEPLOY_OK" != "1" ]; then
  echo "Backup corrupt - aborting BEFORE any git operation. Live auth + code untouched."
  exit 1
fi

echo "[3/6] fetching + hard-syncing to origin/$BRANCH ..."
git fetch origin
git reset --hard "origin/$BRANCH"

echo "[4/6] restoring live auth dirs over the deployed copies ..."
for d in $AUTH_BACKUP/instances/*/auth; do
  rel=${d#$AUTH_BACKUP/}
  [ -d "$d" ] && rm -rf "/home/ubuntu/whatsapp-bot/$rel" && cp -a "$d" "/home/ubuntu/whatsapp-bot/$rel"
done

echo "[4b/6] post-restore sanity + timestamped snapshot (last 3 kept) ..."
for f in /home/ubuntu/whatsapp-bot/instances/*/auth/creds.json; do
  [ -f "$f" ] || continue
  python3 -c "import json; json.load(open('$f'))" || { echo "FATAL: restored $f unparseable"; exit 1; }
done
mkdir -p /home/ubuntu/auth-backups
cp -a "$AUTH_BACKUP" "/home/ubuntu/auth-backups/deploy-$(date +%Y%m%d-%H%M%S)"
ls -1dt /home/ubuntu/auth-backups/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
rm -rf "$AUTH_BACKUP"

echo "[5/6] starting whatsapp-bot..."
pm2 restart whatsapp-bot 2>/dev/null || pm2 start index.js --name whatsapp-bot
sleep 8
pm2 logs whatsapp-bot --lines 40 --nostream --no-color | tail -40
echo "DONE. Live auth preserved across deploy; code synced to origin/$BRANCH. Snapshots: /home/ubuntu/auth-backups (last 3)."
