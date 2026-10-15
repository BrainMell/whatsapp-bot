#!/usr/bin/env bash
# agentctl.sh — multi-agent coordination CLI (2026-10-15)
# Installed: /home/ubuntu/agentctl.sh on BOTH boxes. Repo copy: scripts/agentctl.sh.
#
# Commands:
#   agentctl lock <name> [--steal]   acquire the box-wide agent lock (atomic mkdir; TTL 3h)
#   agentctl release <name>          release the lock (must match holder name)
#   agentctl status                  lock holder + git state + canaries + alerts + pm2
#   agentctl guard                   run git_guard.sh once right now
#   agentctl sync-peer               push current branch to the peer box + restart peer wa-*
#
# Protocol (see AGENTS.md): take the lock before git/pm2/DB-mutating steps,
# release right after; commit on ONE box, sync-peer, restart only your box.
set -u
LOCK_DIR="/home/ubuntu/.agent_lock"
LOCK_TTL=10800
CONF="/home/ubuntu/git_guard.conf"
ALERT_LOG="/home/ubuntu/AGENT_ALERTS.log"
REPO="/home/ubuntu/whatsapp-bot"

usage(){ sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
conf_kv(){ grep -E "^$1=" "$CONF" 2>/dev/null | head -1 | cut -d= -f2- ; }

cmd_lock(){
  local name="${1:-}"; [ -z "$name" ] && usage
  local steal="${2:-}"
  if [ -d "$LOCK_DIR" ]; then
    local now mt holder
    now=$(date +%s); mt=$(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo "$now")
    holder=$(head -1 "$LOCK_DIR/holder" 2>/dev/null || echo unknown)
    if [ $((now - mt)) -lt $LOCK_TTL ] && [ "$steal" != "--steal" ]; then
      echo "LOCK HELD by: $holder (age $((now - mt))s / TTL ${LOCK_TTL}s)"
      echo "options: coordinate with the other agent, or take over: agentctl lock $name --steal"
      exit 1
    fi
    if [ "$steal" = "--steal" ]; then
      echo "$(date -u +%FT%TZ) agentctl: $name took over lock from: $holder" >> "$ALERT_LOG"
    fi
    rm -rf "$LOCK_DIR"
  fi
  mkdir "$LOCK_DIR" 2>/dev/null || { echo "lost race - lock was taken between check and mkdir"; exit 1; }
  printf '%s | %s | pid %s | %s\n' "$name" "$(hostname)" "$$" "$(date -u +%FT%TZ)" > "$LOCK_DIR/holder"
  echo "LOCK ACQUIRED: $name  (release with: agentctl release $name)"
}

cmd_release(){
  local name="${1:-}"; [ -z "$name" ] && usage
  [ -d "$LOCK_DIR" ] || { echo "no lock present"; exit 0; }
  local holder; holder=$(head -1 "$LOCK_DIR/holder" 2>/dev/null)
  if echo "$holder" | grep -q "^$name |"; then
    rm -rf "$LOCK_DIR"; echo "LOCK RELEASED: $name"
  else
    echo "lock is held by [$holder] - not yours, refusing. To take over: agentctl lock $name --steal"
    exit 1
  fi
}

cmd_status(){
  echo "== agent lock =="
  if [ -d "$LOCK_DIR" ]; then
    echo "HELD: $(cat "$LOCK_DIR/holder" 2>/dev/null) (age $(( $(date +%s) - $(stat -c %Y "$LOCK_DIR") ))s)"
  else
    echo "free"
  fi
  echo
  echo "== git =="
  cd "$REPO" 2>/dev/null || { echo "cannot cd $REPO"; exit 1; }
  echo "branch: $(git branch --show-current)   HEAD: $(git rev-parse --short HEAD)   last: $(git log -1 --format=%cd --date=format:'%FT%TZ')"
  local lr
  lr=$(git rev-list --left-right --count "HEAD...origin/audit/fix-pass-1" 2>/dev/null || echo "n/a")
  echo "local-vs-origin (left=box-only, right=origin-only): $lr"
  echo
  echo "== protected canaries =="
  local rc=0
  while IFS=$'\t' read -r f pat; do
    [ -z "${f:-}" ] && continue
    if grep -qE "$pat" "$f" 2>/dev/null; then
      echo "  OK    $f  ($pat)"
    else
      echo "  MISS  $f  ($pat)   <-- REGRESSED, run: agentctl guard"
      rc=1
    fi
  done < <(grep -v '^#' "$CONF" 2>/dev/null | grep -P '^[^\t]+\t')
  echo
  echo "== last alerts =="
  tail -6 "$ALERT_LOG" 2>/dev/null || echo "(none)"
  [ -f /home/ubuntu/AGENT_ALERTS.flag ] && echo "!! UNREAD ALERT FLAG present — read AGENT_ALERTS.log, then: rm /home/ubuntu/AGENT_ALERTS.flag"
  echo
  echo "== pm2 (wa-*) =="
  pm2 ls --no-color 2>/dev/null | grep -E 'wa-|name' | head -8
  exit $rc
}

cmd_guard(){
  GUARD_CONF="$CONF" bash /home/ubuntu/git_guard.sh
  cat /tmp/git_guard_merge.out 2>/dev/null || true
}

cmd_sync_peer(){
  cd "$REPO" || exit 1
  local br; br=$(git branch --show-current)
  if [ "$br" != "audit/fix-pass-1" ]; then
    echo "REFUSING sync: you are on '$br'. Both boxes deploy audit/fix-pass-1 (owner rule 1: no new branches)."
    exit 1
  fi
  local peer_url; peer_url=$(git remote get-url peer 2>/dev/null) || { echo "no 'peer' remote configured"; exit 1; }
  echo ">> pushing $br -> peer ($peer_url)"
  if ! git push peer "$br" 2>&1; then
    echo "!! push failed — peer worktree dirty or non-fast-forward. Fix on the peer box, do NOT force."
    exit 1
  fi
  local peer_ssh peer_apps
  peer_ssh=$(conf_kv PEER_SSH); peer_apps=$(conf_kv PEER_APPS)
  if [ -n "$peer_ssh" ] && [ -n "$peer_apps" ]; then
    echo ">> restarting peer apps: $peer_apps"
    # shellcheck disable=SC2086
    $peer_ssh "cd ~/whatsapp-bot && git log --oneline -1 && pm2 restart $peer_apps" 2>&1 | tail -4
  fi
  echo "SYNC DONE"
}

case "${1:-}" in
  lock)      shift; cmd_lock "$@" ;;
  release)   shift; cmd_release "$@" ;;
  status)    cmd_status ;;
  guard)     cmd_guard ;;
  sync-peer) cmd_sync_peer ;;
  *) usage ;;
esac
