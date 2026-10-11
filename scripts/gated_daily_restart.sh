#!/usr/bin/env bash
# ── Activity-gated daily restart v2 (2026-10-11) ────────────────────────
# v1 (round-20) deferred on CHAT silence only - a player mid-dungeon who
# thinks for >180s between turns looks "quiet" and got restarted under
# (2026-10-11 "pink dildo" complaint: "it doesn't actually wait for
# inactivity"). v2 adds MATCH-awareness:
#   * CHAT gate (unchanged): no inbound message handled in QUIET_WINDOW s
#   * MATCH gate (new): zero AbyssRun docs with status='active' touched in
#     the last ABYSS_STALE_MIN minutes. A fresh run == someone is mid-
#     dungeon RIGHT NOW -> never restart. Stale-active runs (player closed
#     the app mid-run and never retreated) do not block forever.
#     Quiz/ludo/chess need no Mongo gate: their per-question/turn timers
#     (30-60s) self-expire long before QUIET_WINDOW passes.
#   * FORCE-CAP CHANGE: the daily restart is RSS hygiene, not a code
#     deploy - if the box never goes fully quiet within FORCE_AFTER_MIN,
#     v2 SKIPS today's restart instead of killing live matches.
#     FORCE_MODE=kill restores the old force-kill behaviour.
#   * freshness guard unchanged (uptime < FRESH_UPTIME_MIN -> skip, RSS
#     bound already fresh from a deploy/crash/daily)
#   * FORCE_RESTART=1 bypasses everything; DRY_RUN=1 decides only
# The DEPLOY gate (deploy_on_box.sh) shares the MATCH gate but still
# force-lands code at its cap - stale code beats one lost match there.
set -u
APPS="${APPS:-wa-joker}"
QUIET_WINDOW="${QUIET_WINDOW:-180}"
FORCE_AFTER_MIN="${FORCE_AFTER_MIN:-45}"
FORCE_MODE="${FORCE_MODE:-skip}"            # skip | kill  (behaviour at the cap)
ABYSS_STALE_MIN="${ABYSS_STALE_MIN:-15}"
FRESH_UPTIME_MIN="${FRESH_UPTIME_MIN:-30}"
REPO_DIR="${REPO_DIR:-$HOME/whatsapp-bot}"
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || echo /usr/bin/node)}"
LOG="${LOG:-$HOME/gated_daily_restart.log}"
log(){ echo "$(date -u +%FT%TZ) [gated-daily] $*" >> "$LOG"; }

app_age(){  # $1 = pm2 app -> seconds since last inbound message (999999 = quiet/unknown)
  local L="$HOME/.pm2/logs/$1-out.log" LAST TS
  [ -f "$L" ] || { echo 999999; return; }
  LAST=$(grep -a 'Message received' "$L" 2>/dev/null | tail -1 | cut -d: -f1-3)
  [ -z "$LAST" ] && { echo 999999; return; }
  TS=$(date -d "$LAST" +%s 2>/dev/null) || { echo 999999; return; }
  echo $(( $(date +%s) - TS ))
}
app_uptime_min(){  # $1 = pm2 app -> minutes since last (re)start (99999 = unknown)
  pm2 jlist 2>/dev/null | python3 -c "
import sys, json, time
try:
    d = json.load(sys.stdin)
    p = [x for x in d if x.get('name') == '$1'][0]
    print(round((time.time()*1000 - p['pm2_env']['pm_uptime'])/60000))
except Exception:
    print(99999)"
}
abyss_fresh_runs(){  # active abyss runs touched within ABYSS_STALE_MIN; 0 on any error (fail-open)
  local URI OUT
  [ -f "$REPO_DIR/.env" ] || { echo 0; return; }
  URI=$(grep -oP '(?<=^MONGO_URI=).*' "$REPO_DIR/.env" 2>/dev/null | head -1 | tr -d '"' | tr -d "'")
  [ -z "$URI" ] && { echo 0; return; }
  OUT=$(cd "$REPO_DIR" 2>/dev/null && MONGO_URI="$URI" ABYSS_STALE_MS=$((ABYSS_STALE_MIN*60*1000)) \
    timeout 20 "$NODE_BIN" -e '
      const mongoose=require("mongoose");
      mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:8000}).then(async()=>{
        const n=await mongoose.connection.db.collection("abyssruns")
          .countDocuments({status:"active",updatedAt:{$gt:new Date(Date.now()-Number(process.env.ABYSS_STALE_MS))}});
        console.log("ABYSSFRESH="+n);
        await mongoose.disconnect(); process.exit(0);
      }).catch(()=>{console.log("ABYSSFRESH=0");process.exit(0)});' 2>/dev/null \
    | grep -oP '(?<=^ABYSSFRESH=)\d+' | tail -1)
  echo "${OUT:-0}"
}
all_clear(){  # true only when every app is chat-quiet AND nobody is mid-run
  for A in ${APPS//,/ }; do [ "$(app_age "$A")" -lt "$QUIET_WINDOW" ] && return 1; done
  [ "$(abyss_fresh_runs)" -gt 0 ] && return 1
  return 0
}
restart_all(){
  for A in ${APPS//,/ }; do
    pm2 describe "$A" >/dev/null 2>&1 && pm2 restart "$A" --update-env >/dev/null 2>&1 || true
    sleep 15
  done
  pm2 save >/dev/null 2>&1 || true
}

if [ "${DRY_RUN:-0}" = "1" ]; then
  for A in ${APPS//,/ }; do echo "$A age=$(app_age "$A")s uptime=$(app_uptime_min "$A")min"; done
  echo "abyss_fresh_runs=$(abyss_fresh_runs) (stale>${ABYSS_STALE_MIN}m runs don't count)"
  if all_clear; then echo "DRY: gate OPEN -> would restart now"; else echo "DRY: gate CLOSED -> would defer"; fi
  exit 0
fi

# freshness guard: restarted recently for any reason -> RSS bound already reset
for A in ${APPS//,/ }; do
  UP=$(app_uptime_min "$A")
  if [ "$UP" -lt "$FRESH_UPTIME_MIN" ] 2>/dev/null; then
    log "skip: $A uptime ${UP}min < ${FRESH_UPTIME_MIN}min (recent restart, RSS bound fresh)"
    exit 0
  fi
done

if [ "${FORCE_RESTART:-0}" = "1" ]; then
  log "FORCE_RESTART=1 -> daily restart of $APPS (gate bypassed)"
  restart_all
  exit 0
fi

if all_clear; then
  log "gate OPEN (chat quiet + no live abyss run) -> daily restart of $APPS"
  restart_all
  exit 0
fi

log "gate CLOSED (chat <${QUIET_WINDOW}s ago or live abyss run) -> deferring daily restart (games stay alive)"
DEADLINE=$(( $(date +%s) + FORCE_AFTER_MIN * 60 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if all_clear; then
    log "quiet window reached -> deferred daily restart of $APPS"
    restart_all
    exit 0
  fi
  sleep 60
done

if [ "$FORCE_MODE" = "kill" ]; then
  log "force cap ${FORCE_AFTER_MIN}m hit + FORCE_MODE=kill -> restarting $APPS anyway (legacy behaviour)"
  restart_all
else
  if all_clear; then
    log "quiet at force cap -> deferred daily restart of $APPS"
    restart_all
  else
    log "force cap ${FORCE_AFTER_MIN}m hit with activity still live -> SKIPPING today's restart (games stay alive)"
  fi
fi
