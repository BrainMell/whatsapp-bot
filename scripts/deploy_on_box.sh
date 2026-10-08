#!/usr/bin/env bash
# Smart deploy for whatsapp-bot (runs ON Box 1).
# Usage: bash scripts/deploy_on_box.sh <branch>
#   SKIP_RESTART=1 bash scripts/deploy_on_box.sh <branch>   # no pm2 restarts
#
# TOPOLOGY (2026-10-03 evening): Box 1 hosts wa-jake + wa-subaru ONLY.
#   wa-joker moved to Box 2 (own IP / own RAM; Box 1 was swap-thrashing
#   with 3 tenants). This script must therefore NEVER pm2-start wa-joker
#   on Box 1, and the idempotency gate only requires Box 1's two apps.
#
# MINING HOLD (task45, 2026-10-08): Box 1 is on mining duty (wa-miner
#   scrapes shoob.gg event cards; jake/subaru are parked at the owner's
#   request and WILL be turned back on later). While ~/MINING_HOLD exists
#   this deploy syncs CODE + AUTH ONLY and never touches pm2 — no restarts,
#   no starts, no resurrects. Owner deletes the hold file when the bots
#   return ("we will turn the bots back on").
#
# Auth precedence rule (fixes historic "old auth over new" disasters):
#   - per instance (Jake/Joker/Subaru): compare git auth commit timestamp
#     vs disk creds.json mtime.
#   - git newer  -> install git's auth (owner provisioning push)
#   - disk newer -> preserve runtime auth (Baileys evolves creds at runtime)
# Every deploy still archives the pre-deploy auth dirs to ~/auth-backups/.
set -u
BRANCH="${1:-audit/fix-pass-1}"
REPO_DIR="$HOME/whatsapp-bot"
BACKUP_ROOT="$HOME/auth-backups"
cd "$REPO_DIR" || exit 1

# ── mining hold gate (task45): code-only mode when the hold file exists ──
HOLD_FILE="$HOME/MINING_HOLD"
if [ -f "$HOLD_FILE" ]; then
  echo "MINING HOLD active ($HOLD_FILE) — code+auth sync only, pm2 will NOT be touched"
fi

echo "=== smart deploy: branch=$BRANCH  $(date -u +%FT%TZ) ==="
git fetch origin || exit 1
TARGET="$BRANCH"

# ── 0. idempotency gate (2026-10-03 incident fix) ──────────────────────
# THREE deploy relays watch this branch (GitHub Action, Box2 cron relay,
# an external polling relay). Before tonight, ONE push triggered up to
# THREE full deploys ~2-3 min apart; the rapid SIGKILLed restarts
# corrupted a Baileys auth file mid-write and logged a tenant out. Gate:
# if the box already runs the target commit AND pm2 is online, this
# invocation is a no-op (still prints the "deploy done" marker so every
# relay consumes its head and stays quiet).
TARGET_HEAD=$(git rev-parse "origin/$TARGET" 2>/dev/null || echo "")
CURRENT_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "")
if [ -n "$TARGET_HEAD" ] && [ "$TARGET_HEAD" = "$CURRENT_HEAD" ] && [ ! -f "$HOLD_FILE" ]; then
  # 3-tenant -> cross-box split (2026-10-03): gate = Box 1's apps online
  # (wa-jake + wa-subaru; wa-joker lives on Box 2 now).
  PSTATE=$(pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const p=JSON.parse(s);const want=['wa-jake','wa-subaru'];const ok=want.every(n=>(p||[]).some(x=>x&&x.name===n&&x.pm2_env&&x.pm2_env.status==='online'));console.log(ok?'online':'no')}catch(e){console.log('no')}})" 2>/dev/null || echo no)
  if [ "$PSTATE" = "online" ]; then
    echo "=== deploy done: skip $(git rev-parse --short HEAD) already deployed, pm2 online $(date -u +%FT%TZ) ==="
    exit 0
  fi
fi

TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_ROOT"

# ── 1. decide auth precedence per instance ─────────────────────────────
declare -A WINNER   # inst -> git|disk|gitonly|diskonly
for inst in Jake Joker Subaru; do
  GIT_TS=$(git log -1 --format=%ct "origin/$TARGET" -- "instances/$inst/auth" 2>/dev/null || echo 0)
  DISK_TS=0
  [ -f "instances/$inst/auth/creds.json" ] && DISK_TS=$(stat -c %Y "instances/$inst/auth/creds.json")
  if [ "$GIT_TS" -eq 0 ] && [ "$DISK_TS" -eq 0 ]; then W=none
  elif [ "$DISK_TS" -eq 0 ]; then W=gitonly
  elif [ "$GIT_TS" -eq 0 ]; then W=diskonly
  elif [ "$GIT_TS" -gt "$DISK_TS" ]; then W=git
  else W=disk; fi
  WINNER[$inst]=$W
  echo "auth[$inst]: git_ts=$GIT_TS disk_ts=$DISK_TS -> $W"
done

# ── 2. archive current auth (always) ───────────────────────────────────
BK="$BACKUP_ROOT/deploy-$TS"
mkdir -p "$BK"
for inst in Jake Joker Subaru; do
  if [ -d "instances/$inst/auth" ]; then
    cp -a "instances/$inst/auth" "$BK/$inst-auth" 2>/dev/null || true
  fi
done
echo "auth archived -> $BK"

# ── 3. stash disk-auth for instances where disk wins ───────────────────
STASH=$(mktemp -d /tmp/auth_keep.XXXX)
for inst in Jake Joker Subaru; do
  case "${WINNER[$inst]}" in
    disk|diskonly)
      if [ -d "instances/$inst/auth" ]; then
        mv "instances/$inst/auth" "$STASH/$inst-auth"
        echo "stashed runtime auth[$inst]"
      fi ;;
  esac
done

# ── 4. code update (tracked auth lands from git here) ──────────────────
git reset --hard "origin/$TARGET" || { echo "RESET FAILED - restoring stashed auth"; }
HEADS=$(git rev-parse --short HEAD)
echo "code -> $HEADS"

# ── 5. restore runtime-wins auth over git's copy ────────────────────────
for inst in Jake Joker Subaru; do
  case "${WINNER[$inst]}" in
    disk|diskonly)
      rm -rf "instances/$inst/auth"
      mv "$STASH/$inst-auth" "instances/$inst/auth"
      echo "restored runtime auth[$inst] (disk newer than git)" ;;
  esac
done
rmdir "$STASH" 2>/dev/null || true

# ── 6. authorize Box2 deploy relay key (idempotent, self-heals relay path) ──
mkdir -p ~/.ssh
RELAY_PUB='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOJw8N7PZ/kOABzUbGDy7Qio4wmj182GIh5QS/1nCK+E ubuntu@probe-amd-e2-micro-2'
touch ~/.ssh/authorized_keys
grep -qF "$RELAY_PUB" ~/.ssh/authorized_keys 2>/dev/null || echo "$RELAY_PUB" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys
echo "relay key authorized: $(grep -c ubuntu@probe-amd-e2-micro-2 ~/.ssh/authorized_keys)"

# ── 7. deps + restart ──────────────────────────────────────────────────
npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -3

# 3-tenant split (2026-10-03): retire the shared fleet process if it
# still exists (one-time migration; delete FIRST so tenants never run
# in two processes at once - that would double-login the same session).
if pm2 describe whatsapp-bot >/dev/null 2>&1; then
  echo "migrating: deleting shared process 'whatsapp-bot' (3-tenant split)"
  pm2 delete whatsapp-bot 2>/dev/null || true
fi

# Staggered restart: keep WhatsApp same-IP reconnection gentle.
# SKIP_RESTART=1 (used for config-only landings) skips all pm2 churn.
# MINING HOLD (task45): force-skip while ~/MINING_HOLD exists.
SKIP_RESTART="${SKIP_RESTART:-0}"
if [ -f "$HOLD_FILE" ]; then SKIP_RESTART=1; fi
if [ "$SKIP_RESTART" != "1" ]; then
  for APP in wa-jake wa-subaru; do
    if pm2 describe "$APP" >/dev/null 2>&1; then
      pm2 restart "$APP" --update-env >/dev/null 2>&1 || true
    fi
    sleep 15
  done
  pm2 start ecosystem.config.js 2>/dev/null || pm2 start index.js --name whatsapp-bot
  pm2 save 2>/dev/null | tail -1
  sleep 6
else
  echo "SKIP_RESTART=1 -> leaving pm2 processes untouched (wa-miner keeps mining; parked bots stay parked)"
fi
echo "=== pm2 ==="
pm2 list
echo "=== boot log tails ==="
for APP in wa-jake wa-subaru; do
  echo "--- $APP ---"
  tail -25 ~/.pm2/logs/$APP-out.log 2>/dev/null | grep -aE "Spawning|PAIRING|Connected|401|logged|Split|error" | tail -6
done
echo "=== deploy done: $HEADS $(date -u +%FT%TZ) ==="
