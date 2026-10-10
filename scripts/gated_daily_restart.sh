#!/usr/bin/env bash
# ── Activity-gated daily restart (round-20, 2026-10-10) ─────────────────
# Replaces wa-joker's raw pm2 cron_restart ('0 5 * * *'), which killed any
# in-memory dungeon/abyss/PVP run in progress at 05:00 UTC (owner:
# "the games keep quiting mid way?????? It happens alot please let's stop
# that ,it happens to dungeons ,abyss blah balb").
# Contract identical to deploy_on_box.sh's deploy gate:
#   * restart NOW only if no chat handled within QUIET_WINDOW seconds
#   * else defer via 60s-poll loop until quiet; FORCE_AFTER_MIN hard cap
#   * skip entirely if the process restarted <30 min ago (RSS bound already
#     fresh from a deploy/crash/daily — a second kick is pure session loss)
#   * FORCE_RESTART=1 bypasses the gate; DRY_RUN=1 prints the decision only
set -u
APPS="${APPS:-wa-joker}"
QUIET_WINDOW="${QUIET_WINDOW:-180}"
FORCE_AFTER_MIN="${FORCE_AFTER_MIN:-45}"
FRESH_UPTIME_MIN="${FRESH_UPTIME_MIN:-30}"
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
all_quiet(){ for A in ${APPS//,/ }; do [ "$(app_age "$A")" -lt "$QUIET_WINDOW" ] && return 1; done; return 0; }
restart_all(){
  for A in ${APPS//,/ }; do
    pm2 describe "$A" >/dev/null 2>&1 && pm2 restart "$A" --update-env >/dev/null 2>&1 || true
    sleep 15
  done
  pm2 save >/dev/null 2>&1 || true
}

if [ "${DRY_RUN:-0}" = "1" ]; then
  for A in ${APPS//,/ }; do echo "$A age=$(app_age "$A")s uptime=$(app_uptime_min "$A")min"; done
  if all_quiet; then echo "DRY: gate OPEN -> would restart now"; else echo "DRY: gate CLOSED -> would defer"; fi
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

if all_quiet; then
  log "gate OPEN -> daily restart of $APPS"
  restart_all
  exit 0
fi

log "gate CLOSED (bot handled a chat <${QUIET_WINDOW}s ago) -> deferring daily restart (games stay alive)"
DEADLINE=$(( $(date +%s) + FORCE_AFTER_MIN * 60 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if all_quiet; then
    log "quiet window reached -> deferred daily restart of $APPS"
    restart_all
    exit 0
  fi
  sleep 60
done
log "force cap ${FORCE_AFTER_MIN}m hit -> restarting $APPS anyway"
restart_all
