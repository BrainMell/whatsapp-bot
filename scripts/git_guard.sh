#!/usr/bin/env bash
# git_guard.sh - protected-fix watchdog + multi-agent wipe guard (2026-10-15)
# Installed: /home/ubuntu/git_guard.sh on BOTH boxes, cron */5.
# Repo copy: scripts/git_guard.sh (keep in sync when editing).
#
# Why: 2026-10-15 a concurrent agent session reset both boxes to a stale
# GitHub base and silently wiped the live XP-wall + leaf-merge fixes.
# GitHub push auth is broken, so origin is STALE; any agent/relay that
# syncs from origin can regress the boxes. This guard makes that class
# of accident self-healing instead of silent.
#
# What it does each cycle:
#   1. skips when an agent holds /home/ubuntu/.agent_lock (fresh < 3h)
#   2. checks content canaries from git_guard.conf in BOTH the HEAD tree and
#      the worktree (catches git resets AND raw file overwrites/rsync wipes)
#   3. repairs:
#        - worktree-only regression -> git checkout -- <files> (restore from HEAD)
#        - HEAD-tree regression     -> merge-forward the newest reflog commit
#          whose tree contains all canaries (NEVER drops commits; if the wiper
#          brought legit new work, the merge keeps it AND restores the fixes)
#        - merge conflict -> abort + alert only (human/agent resolves)
#   4. alerts to /home/ubuntu/AGENT_ALERTS.log + AGENT_ALERTS.flag and
#      pm2-restarts ONLY this box's wa-* apps (RESTART_APPS in conf).
#
# To change protected fixes: update git_guard.conf on BOTH boxes AND the gate
# in scripts/deploy_on_box.sh, in the same commit that changes the fixes.
set -u
CONF="${GUARD_CONF:-/home/ubuntu/git_guard.conf}"
REPO="${GUARD_REPO:-/home/ubuntu/whatsapp-bot}"
LOCK_DIR="/home/ubuntu/.agent_lock"
ALERT_LOG="/home/ubuntu/AGENT_ALERTS.log"
ALERT_FLAG="/home/ubuntu/AGENT_ALERTS.flag"
LOCK_TTL=10800   # 3h

log_ok(){ echo "$(date -u +%FT%TZ) [git_guard] $*" >> /home/ubuntu/git_guard.log; }
alert(){ echo "$(date -u +%FT%TZ) [git_guard] $*" >> "$ALERT_LOG"; touch "$ALERT_FLAG"; log_ok "ALERT: $*"; }
canaries(){ grep -v '^#' "$CONF" 2>/dev/null | grep -P '^[^\t]+\t'; }

# -- 1. agent lock awareness ------------------------------------------------
if [ -d "$LOCK_DIR" ]; then
  now=$(date +%s); mt=$(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo "$now")
  if [ $((now - mt)) -lt $LOCK_TTL ]; then
    log_ok "agent lock held ($(head -1 "$LOCK_DIR/holder" 2>/dev/null)) - skipping cycle"
    exit 0
  fi
  log_ok "stale agent lock (>3h) present - guard proceeding"
fi

[ -f "$CONF" ] || { alert "missing conf $CONF"; exit 1; }
cd "$REPO" 2>/dev/null || { alert "cannot cd $REPO"; exit 1; }

# -- 2. canary check ---------------------------------------------------------
MISS_TREE=""; MISS_WORK=""
while IFS=$'\t' read -r f pat; do
  [ -z "${f:-}" ] && continue
  git show "HEAD:${f}" 2>/dev/null | grep -qE "${pat}" || MISS_TREE="$MISS_TREE $f"
  grep -qE "${pat}" "${f}" 2>/dev/null       || MISS_WORK="$MISS_WORK $f"
done < <(canaries)

if [ -z "$MISS_TREE" ] && [ -z "$MISS_WORK" ]; then
  m=$(date +%M)
  if [ "$((10#$m))" -lt 5 ]; then
    log_ok "OK canaries present HEAD=$(git rev-parse --short HEAD 2>/dev/null)"
  fi
  exit 0
fi

alert "REGRESSION: HEAD=$(git rev-parse --short HEAD 2>/dev/null) branch=$(git branch --show-current 2>/dev/null) tree_missing=[${MISS_TREE# }] worktree_missing=[${MISS_WORK# }]"

# -- 3. repair ----------------------------------------------------------------
if [ -z "$MISS_TREE" ]; then
  # HEAD is fine; someone overwrote working files only (upload/rsync-style wipe)
  if git checkout -- $MISS_WORK 2>/dev/null; then
    alert "REPAIRED worktree from HEAD: restored:${MISS_WORK}"
  else
    alert "REPAIR FAILED: git checkout --${MISS_WORK} errored; manual fix needed"
    exit 1
  fi
else
  BEST=""
  for c in $(git rev-list -g HEAD --max-count=40 2>/dev/null); do
    ok=1
    while IFS=$'\t' read -r f pat; do
      [ -z "${f:-}" ] && continue
      git show "${c}:${f}" 2>/dev/null | grep -qE "${pat}" || { ok=0; break; }
    done < <(canaries)
    if [ "$ok" = "1" ]; then BEST="$c"; break; fi
  done
  if [ -z "$BEST" ]; then
    alert "CANNOT AUTO-REPAIR: none of the last 40 reflog commits contains all protected fixes. Manual resolution required NOW."
    exit 1
  fi
  if git merge-base --is-ancestor "$BEST" HEAD 2>/dev/null; then
    # fixes exist in an ancestor but not HEAD (evil rewrite); restore files
    git checkout -- $MISS_WORK 2>/dev/null && alert "REPAIRED worktree from HEAD: restored:${MISS_WORK}"
  elif git merge --no-edit "$BEST" >/tmp/git_guard_merge.out 2>&1; then
    alert "REPAIRED via merge-forward of $(git rev-parse --short "$BEST") into $(git rev-parse --short HEAD) (fixes restored; any new work preserved)"
  else
    git merge --abort 2>/dev/null
    alert "MERGE CONFLICT: auto-repair aborted (merging $(git rev-parse --short "$BEST")). Manual resolution required. Output: /tmp/git_guard_merge.out"
    exit 1
  fi
fi

# -- 4. restart this box's wa-* apps so live code matches the repaired tree --
eval "$(grep -E '^RESTART_APPS=' "$CONF" | head -1)" 2>/dev/null || RESTART_APPS=""
if [ -n "${RESTART_APPS:-}" ]; then
  if pm2 restart $RESTART_APPS >/dev/null 2>&1; then
    alert "pm2 restarted: $RESTART_APPS (post-repair)"
  else
    alert "WARNING: pm2 restart failed for: $RESTART_APPS"
  fi
fi
