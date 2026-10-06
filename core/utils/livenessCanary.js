// ============================================
// LIVENESS CANARY - event-loop stall auto-recovery
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

// ---------- parent side ----------
function startCanaryParent() {
  if (String(process.env.LIVENESS_CANARY || '1') === '0') return;
  const t = tag();
  const f = fileFor(t);

  // fresh stamp with our pid - any orphaned child from a previous life will
  // see a mismatched/dead target pid and exit
  try { fs.writeFileSync(f, JSON.stringify({ pid: process.pid, at: Date.now() })); } catch (e) {}

  const timer = setInterval(() => {
    try { fs.writeFileSync(f, JSON.stringify({ pid: process.pid, at: Date.now() })); } catch (e) {}
  }, TOUCH_MS);
  if (timer.unref) timer.unref();

  const child = fork(__filename, ['--canary-child'], {
    env: { ...process.env, LIVENESS_CHILD: '1', LIVENESS_PARENT_PID: String(process.pid), LIVENESS_TAG: t },
    stdio: 'ignore',
  });
  if (child && child.unref) child.unref();
  if (child && child.disconnect) child.disconnect();

  console.log(`🫀 [Liveness] canary armed (tag=${t}, stall>${STALL_MS / 1000}s -> auto-restart, budget ${KILL_BUDGET}/h)`);
}

// ---------- child side ----------
function startCanaryChild() {
  const t = process.env.LIVENESS_TAG || 'bot';
  const targetPid = parseInt(process.env.LIVENESS_PARENT_PID || '0', 10);
  const f = fileFor(t);
  const kf = killsFor(t);

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
      if (age < STALL_MS) return;

      // kill budget (shared across generations via the kills file)
      let kills = [];
      try { kills = fs.readFileSync(kf, 'utf8').split('\n').filter(Boolean).map(Number); } catch (e) {}
      const recent = kills.filter((ts) => Date.now() - ts < BUDGET_WINDOW_MS);
      if (recent.length >= KILL_BUDGET) {
        stallLog(t, `stand-down: stall-loop suspected (age=${Math.round(age / 1000)}s, ${recent.length} kills/hour) - process left alive for forensics`);
        return;
      }

      stallLog(t, `EVENT LOOP STALLED ${Math.round(age / 1000)}s (pid=${targetPid}) - SIGKILL for pm2 auto-restart`);
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

module.exports = { arm };

if (require.main === module && process.argv.includes('--canary-child')) {
  startCanaryChild();
}
