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
  PSTATE=$(pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const p=JSON.parse(s);const box2=(p||[]).some(x=>x&&x.name==='wa-joker');const want=box2?['wa-joker']:['wa-jake','wa-subaru'];const ok=want.every(n=>(p||[]).some(x=>x&&x.name===n&&x.pm2_env&&x.pm2_env.status==='online'));console.log(ok?'online':'no')}catch(e){console.log('no')}})" 2>/dev/null || echo no)
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

# Staggered restart: keep WhatsApp reconnection gentle.
# SKIP_RESTART=1 (used for config-only landings) skips all pm2 churn.
# MINING HOLD (task45): force-skip while ~/MINING_HOLD exists.
#
# ── ACTIVITY-GATED RESTART (round-20, owner: "the games keep quiting mid
# way?????? It happens alot please let's stop that ,it happens to dungeons
# ,abyss blah balb") ── every pm2 restart wipes ALL in-memory game sessions,
# so unconditional deploy restarts were killing every active dungeon/abyss/
# guild-war run on each push (42 joker restarts on 2026-10-10 alone). Now:
#   * a bot that handled a chat message within DEPLOY_QUIET_WINDOW seconds
#     (default 180) DEFERS its restart to a detached retry loop that fires
#     the moment the box goes quiet (60s poll);
#   * DEPLOY_FORCE_AFTER_MIN (default 45) hard-caps the deferral so deployed
#     code can never go stale — after the cap it restarts even mid-activity;
#   * FORCE_RESTART=1 bypasses the gate (emergency override).
QUIET_WINDOW="${DEPLOY_QUIET_WINDOW:-180}"
FORCE_AFTER_MIN="${DEPLOY_FORCE_AFTER_MIN:-45}"

secs_since_last_message() {  # $1 = pm2 app name -> seconds since last inbound message (999999 = unknown/quiet)
  local APP="$1" LOG LAST TS
  LOG="$HOME/.pm2/logs/${APP}-out.log"
  [ -f "$LOG" ] || { echo 999999; return; }
  LAST=$(grep -a 'Message received' "$LOG" 2>/dev/null | tail -1 | cut -d: -f1-3)
  [ -z "$LAST" ] && { echo 999999; return; }
  TS=$(date -d "$LAST" +%s 2>/dev/null) || { echo 999999; return; }
  echo $(( $(date +%s) - TS ))
}

deferred_restart_spawn() {  # $1 = csv apps, $2 = force-deadline epoch
  local APPS="$1" DEADLINE="$2"
  if pgrep -f "deferred_restart.sh" >/dev/null 2>&1; then
    echo "$(date -u +%FT%TZ) deferred loop already armed - leaving it (it boots whatever is on disk = this deploy)" >> "$HOME/deferred_restart.log"
    return 0
  fi
  cat > "$HOME/deferred_restart.sh" <<EOF
#!/usr/bin/env bash
# generated by deploy_on_box.sh - activity-gated deferred restart (round-20)
APPS="$APPS"
DEADLINE=$DEADLINE
QUIET_WINDOW=$QUIET_WINDOW
restart_all() {
  for A in \${APPS//,/ }; do
    pm2 describe "\$A" >/dev/null 2>&1 && pm2 restart "\$A" --update-env >/dev/null 2>&1 || true
    sleep 15
  done
  pm2 save >/dev/null 2>&1 || true
}
while [ \$(date +%s) -lt \$DEADLINE ]; do
  QUIET=1
  for A in \${APPS//,/ }; do
    LOG="\$HOME/.pm2/logs/\${A}-out.log"
    LAST=\$(grep -a 'Message received' "\$LOG" 2>/dev/null | tail -1 | cut -d: -f1-3)
    if [ -n "\$LAST" ]; then
      TS=\$(date -d "\$LAST" +%s 2>/dev/null || echo 0)
      AGE=\$(( \$(date +%s) - TS ))
      [ "\$AGE" -lt "\$QUIET_WINDOW" ] && QUIET=0
    fi
  done
  if [ "\$QUIET" = "1" ]; then
    echo "\$(date -u +%FT%TZ) ACTIVITY GATE: bots quiet -> deferred restart of \$APPS" >> "\$HOME/deferred_restart.log"
    restart_all
    exit 0
  fi
  sleep 60
done
echo "\$(date -u +%FT%TZ) ACTIVITY GATE: force deadline hit -> restarting \$APPS" >> "\$HOME/deferred_restart.log"
restart_all
EOF
  chmod +x "$HOME/deferred_restart.sh"
  setsid nohup "$HOME/deferred_restart.sh" >/dev/null 2>&1 &
  echo "$(date -u +%FT%TZ) deferred-restart armed for [$APPS], force at $(date -u -d "@$DEADLINE" +%FT%TZ)" >> "$HOME/deferred_restart.log"
}

SKIP_RESTART="${SKIP_RESTART:-0}"
if [ -f "$HOLD_FILE" ]; then SKIP_RESTART=1; fi
if [ "$SKIP_RESTART" != "1" ]; then
  # Box topology guard (incident 2026-10-08 ~10:02Z, deploy b59d5c17):
  # wa-joker present in pm2 == Box 2. Box 2 hosts wa-joker ONLY —
  # never start/restart wa-jake/wa-subaru/wa-miner there (their auth
  # lives on Box 1; starting them here boots UNPAIRED impostors).
  ON_BOX2=$(pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const p=JSON.parse(s);console.log((p||[]).some(x=>x&&x.name==='wa-joker')?'1':'0')}catch(e){console.log('0')}})" 2>/dev/null || echo 0)
  if [ "$ON_BOX2" = "1" ]; then
    echo "Box2 topology: managing wa-joker only (never jake/subaru/miner)"
    AGE=$(secs_since_last_message wa-joker)
    if [ "${FORCE_RESTART:-0}" = "1" ] || [ "$AGE" -ge "$QUIET_WINDOW" ]; then
      [ "${FORCE_RESTART:-0}" = "1" ] && echo "FORCE_RESTART=1 - gate bypassed" || echo "ACTIVITY GATE: wa-joker quiet ${AGE}s -> restarting now"
      pm2 restart wa-joker --update-env >/dev/null 2>&1 || true
      pm2 save 2>/dev/null | tail -1
    else
      echo "ACTIVITY GATE: wa-joker handled a message ${AGE}s ago - deferring restart (games stay alive)"
      deferred_restart_spawn "wa-joker" $(( $(date +%s) + FORCE_AFTER_MIN * 60 ))
    fi
  else
    AGE_J=$(secs_since_last_message wa-jake); AGE_S=$(secs_since_last_message wa-subaru)
    MIN_AGE=$(( AGE_J < AGE_S ? AGE_J : AGE_S ))
    if [ "${FORCE_RESTART:-0}" = "1" ] || [ "$MIN_AGE" -ge "$QUIET_WINDOW" ]; then
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
      echo "ACTIVITY GATE: recent player activity ${MIN_AGE}s ago - deferring restart (games stay alive)"
      deferred_restart_spawn "wa-jake,wa-subaru" $(( $(date +%s) + FORCE_AFTER_MIN * 60 ))
    fi
  fi
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
