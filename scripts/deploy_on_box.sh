#!/usr/bin/env bash
# Smart deploy for whatsapp-bot (runs ON Box 1).
# Usage: bash scripts/deploy_on_box.sh <branch>
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
if [ -n "$TARGET_HEAD" ] && [ "$TARGET_HEAD" = "$CURRENT_HEAD" ]; then
  PSTATE=$(pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const p=JSON.parse(s);const w=(p||[]).find(x=>x&&x.name==='whatsapp-bot');console.log(w&&w.pm2_env&&w.pm2_env.status==='online'?'online':'no')}catch(e){console.log('no')}})" 2>/dev/null || echo no)
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
pm2 restart whatsapp-bot 2>/dev/null || pm2 start ecosystem.config.js 2>/dev/null || pm2 start index.js --name whatsapp-bot
pm2 save 2>/dev/null | tail -1
sleep 6
echo "=== pm2 ==="
pm2 list
echo "=== boot log tail ==="
tail -40 ~/.pm2/logs/whatsapp-bot-out.log 2>/dev/null | grep -E "Spawning|PAIRING|Connected|401|logged|error" | tail -15
echo "=== deploy done: $HEADS $(date -u +%FT%TZ) ==="
