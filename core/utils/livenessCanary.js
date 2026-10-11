// ============================================
// LIVENESS CANARY v2 - event-loop stall auto-recovery (match-aware)
//
// 2026-10-06 incident: a sync spin somewhere in the murder-mystery resolve
// chain blocked the event loop at 95% CPU for >1h. Heartbeats stopped, the
// bot went silent, and nothing self-healed - because EVERY in-process
// watchdog (setInterval-based) is blocked by the very stall it would need
// to detect.
//
// Fix: an orphan-proof child process watches a heartbeat file the parent
// touches every 15s. If the file goes stale past STALL_MS the child kills
// the parent (SIGKILL) and pm2 restarts it - a >1h silent hang becomes a
// <=90s blip. Kill budget prevents a restart storm if boot itself spins.
//
// 2026-10-11 v2 (owner: "watchdog should calm tf down" - it kept SIGKILLing
// mid-match; a player's quest turn was live 30s before a 78s-stall kill):
// memory-burst stalls under swap pressure (PSI io 75%+) usually RECOVER -
// they just exceed the 75s threshold. Killing them mid-quest destroys a
// live match the bot would have finished. So the parent now also stamps
// lastBattleActivity (every quest/ruins/abyss-style combat turn, see
// noteBattleActivity hooks in guildAdventure). If a battle was live within
// BATTLE_GRACE_MS, the child defers the kill until the stall exceeds
// BATTLE_STALL_MS - a hard ceiling so a TRULY wedged process still gets
// recycled. A 5-min stall that recovers beats a 78s kill that ends the run.
// Deferrals are logged so forensics can see exactly when it held fire.
//
// Orphan safety: the child only ever kills the exact parent PID it was
// spawned by; if that PID is gone (parent died/restarted), the child exits.
// Env kill-switch: LIVENESS_CANARY=0 disables.
// ============================================

const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const TOUCH_MS = parseInt(process.env.LIVENESS_TOUCH_MS || '15000', 10);   // parent heartbeat write cadence
const CHILD_MS = parseInt(process.env.LIVENESS_CHILD_MS || '10000', 10);   // child check cadence
const STALL_MS = parseInt(process.env.LIVENESS_STALL_MS || '75000', 10);   // file older than this = loop is blocked
// v2 battle grace: how long after the last combat turn a stall counts as
// "mid-match", and the stall age at which we stop waiting and kill anyway.
const BATTLE_GRACE_MS = parseInt(process.env.LIVENESS_BATTLE_GRACE_MS || '600000', 10);   // 10 min
const BATTLE_STALL_MS = parseInt(process.env.LIVENESS_BATTLE_STALL_MS || '300000', 10);   // 5 min hard cap
const KILL_BUDGET = 4;    // max kills per hour before standing down
const BUDGET_WINDOW_MS = 3600000;

function tag() {
  // one pm2 process per box hosts the bots - pm_id is unique per box and the
  // /tmp namespaces are per-box anyway, so pm_id alone is collision-proof
  return String(process.env.LIVENESS_TAG || process.env.pm_id || 'bot');
}

function fileFor(t) { return `/tmp/wa-liveness-${t}.stamp`; }
function killsFor(t) { return `/tmp/wa-liveness-${t}.kills`; }
function stallLog(t, msg) {
  const line = `${new Date().toISOString()} 🫀 [Liveness] ${msg}\n`;
  try { fs.appendFileSync(`/tmp/wa-liveness-${t}.stall.log`, line); } catch (e) {}
  try { fs.appendFileSync(`/home/ubuntu/.pm2/liveness-${t}.stall.log`, line); } catch (e) {}
}

// ---------- battle activity (v2) ----------
// Written by game modules (guildAdventure combat pipeline) whenever a live
// match does something - a player action or an automated turn. Pure in-module
// timestamp; the heartbeat timer folds it into the stamp file. Deliberately
// does NOT touch the heartbeat itself: only a healthy loop can renew that.
let lastBattleAt = 0;
function noteBattleActivity() {
  lastBattleAt = Date.now();
}

// ---------- parent side ----------
function startCanaryParent() {
  if (String(process.env.LIVENESS_CANARY || '1') === '0') return;
  const t = tag();
  const f = fileFor(t);

  // fresh stamp with our pid - any orphaned child from a previous life will
  // see a mismatched/dead target pid and exit
  try { fs.writeFileSync(f, JSON.stringify({ pid: process.pid, at: Date.now(), battle: lastBattleAt })); } catch (e) {}

  const timer = setInterval(() => {
    try { fs.writeFileSync(f, JSON.stringify({ pid: process.pid, at: Date.now(), battle: lastBattleAt })); } catch (e) {}
  }, TOUCH_MS);
  if (timer.unref) timer.unref();

  const child = fork(__filename, ['--canary-child'], {
    env: { ...process.env, LIVENESS_CHILD: '1', LIVENESS_PARENT_PID: String(process.pid), LIVENESS_TAG: t },
    stdio: 'ignore',
  });
  if (child && child.unref) child.unref();
  if (child && child.disconnect) child.disconnect();

  console.log(`🫀 [Liveness] canary armed v2 (tag=${t}, stall>${STALL_MS / 1000}s -> auto-restart, battle grace ${BATTLE_STALL_MS / 1000}s while matches live, budget ${KILL_BUDGET}/h)`);
}

// ---------- child side ----------
function startCanaryChild() {
  const t = process.env.LIVENESS_TAG || 'bot';
  const targetPid = parseInt(process.env.LIVENESS_PARENT_PID || '0', 10);
  const f = fileFor(t);
  const kf = killsFor(t);
  let deferredForBattle = false; // log a stall-episode defer once, not every poll

  const alive = (pid) => {
    try { process.kill(pid, 0); return true; } catch (e) { return false; }
  };

  const timer = setInterval(() => {
    try {
      if (!targetPid || !alive(targetPid)) { // parent gone -> nothing to guard
        process.exit(0);
      }
      let stamp = null;
      try { stamp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { stamp = null; }
      // stamp from another generation (pid mismatch) -> stand down
      if (!stamp || stamp.pid !== targetPid) process.exit(0);
      const age = Date.now() - (stamp.at || 0);

      // v2: battle-aware kill threshold
      const battleAt = stamp.battle || 0;
      const battleLive = battleAt > 0 && Date.now() - battleAt < BATTLE_GRACE_MS;
      const threshold = battleLive ? Math.max(STALL_MS, BATTLE_STALL_MS) : STALL_MS;

      if (age < threshold) {
        if (battleLive && age >= STALL_MS && !deferredForBattle) {
          deferredForBattle = true;
          stallLog(t, `holding fire: loop stalled ${Math.round(age / 1000)}s but a match was live ${Math.round((Date.now() - battleAt) / 1000)}s ago - grace cap ${BATTLE_STALL_MS / 1000}s (recovering stalls finish their runs)`);
        }
        if (age < STALL_MS) deferredForBattle = false; // recovered - next episode logs again
        return;
      }

      // kill budget (shared across generations via the kills file)
      let kills = [];
      try { kills = fs.readFileSync(kf, 'utf8').split('\n').filter(Boolean).map(Number); } catch (e) {}
      const recent = kills.filter((ts) => Date.now() - ts < BUDGET_WINDOW_MS);
      if (recent.length >= KILL_BUDGET) {
        stallLog(t, `stand-down: stall-loop suspected (age=${Math.round(age / 1000)}s, ${recent.length} kills/hour) - process left alive for forensics`);
        return;
      }

      stallLog(t, `EVENT LOOP STALLED ${Math.round(age / 1000)}s (pid=${targetPid}${battleLive ? `, battle was live ${Math.round((Date.now() - battleAt) / 1000)}s ago - grace exhausted` : ''}) - SIGKILL for pm2 auto-restart`);
      try { fs.appendFileSync(kf, `${Date.now()}\n`); } catch (e) {}
      try { process.kill(targetPid, 'SIGKILL'); } catch (e) {}
      // our target is dying; exit so a fresh child arrives with the new parent
      setTimeout(() => process.exit(0), 2000).unref();
    } catch (e) {
      try { process.exit(0); } catch (e2) {}
    }
  }, CHILD_MS);
  // NOTE: the child's interval MUST keep the loop alive (do NOT unref) - the
  // child has nothing else pending and an unref'd timer let it exit at boot.
}

function arm() {
  if (String(process.env.LIVENESS_CANARY || '1') === '0') return;
  if (process.env.LIVENESS_CHILD === '1') startCanaryChild();
  else startCanaryParent();
}

module.exports = { arm, noteBattleActivity };

if (require.main === module && process.argv.includes('--canary-child')) {
  startCanaryChild();
}
