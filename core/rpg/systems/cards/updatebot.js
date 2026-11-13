// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  UPDATEBOT  -  updatebot.js                                             ║
// ║  ".j updatebot" — owner-only self-update for the box this bot runs on.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// 💡 2026-11-11 (Mellow): "get all the new commits on the box and make a
// .j updatebot that restarts the bots after getting the latest version,
// yes all 2 boxes."
//
// Per-box flow (each pm2 process updates itself):
//   1. git fetch origin <branch-the-box-runs>
//   2. HEAD == FETCH_HEAD ? "already up to date" : plan the update
//   3. Safety rails: dirty-tree abort, syntax gate on every changed .js,
//      5-min cooldown, single in-flight update
//   4. Write core/data/updatebot_state.json (who asked, from -> to)
//   5. Reply the commit list, then pm2 restart this process
//   6. On boot, announcePendingUpdate() polls until the WA socket is back
//      and reports "UPDATE COMPLETE" in the chat that ran the command.
//
// QA: UPDATEBOT_DRYRUN=1 does everything except the actual restart.
//     UPDATEBOT_BRANCH=<name> overrides the branch (QA harness only).
//
// This file is deliberately dependency-light (fs/path/child_process only,
// botConfig for the prefix) so the command handler and the boot poll can
// run in any context without dragging the card DB along.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const STATE_PATH = path.join(ROOT, 'core', 'data', 'updatebot_state.json');
const STALE_MS = 30 * 60 * 1000;     // pending state older than this = dead run
const COOLDOWN_MS = 5 * 60 * 1000;   // min gap between update checks per process
const MAX_LOG_LINES = 12;            // commit subjects shown in messages
const MAX_SYNTAX_TARGETS = 15;       // node --check cap per update

let _lastRunAt = 0;

function short(sha) { return String(sha || '').slice(0, 7); }

// Context-independent process identity (BOT_INSTANCE env, one tenant per pm2
// app). botConfig.getBotId() only resolves inside per-message ALS scopes —
// the boot announce runs with no store, so it must use this instead (same
// helper the /notify-deploy endpoint uses).
function processBotId() {
  try { return require(path.join(ROOT, 'core', 'utils', 'botInstance')).resolveBotId(); }
  catch (e) { return 'global'; }
}

// Promise-wrapped execFile against the repo (git by default).
function sh(bin, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(bin || 'git', args, { cwd: ROOT, timeout: opts.timeout || 60000, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        out: String(stdout || '').trim(),
        err: String((err && (err.message || stderr)) || stderr || '').slice(0, 400),
      });
    });
  });
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (e) { return null; }
}

function writeState(st) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2));
    return true;
  } catch (e) { console.error('[updatebot] writeState failed:', e.message); return false; }
}

function clearState() {
  try { fs.unlinkSync(STATE_PATH); } catch (e) { /* already gone */ }
}

function buildAnnounceText(st) {
  const n = Number(st.commits || ((st.subjects || []).length));
  const lines = (st.subjects || []).slice(0, MAX_LOG_LINES).map(l => `• ${l}`).join('\n');
  return `✅ *UPDATE COMPLETE*\n\n`
    + `🔄 ⟢ _\`${short(st.from)}\` → \`${short(st.to)}\` on \`${st.branch || 'origin'}\` (${n} commit${n === 1 ? '' : 's'})_\n`
    + (lines ? `\n${lines}\n` : '')
    + `\n🟢 ⟢ _Back online — thanks for waiting._`;
}

// ── Boot self-check ─────────────────────────────────────────────────────────
// cardSystem requires this module at boot; 8s later we start polling for the
// WA socket and deliver any pending update announce. Runs in THIS process
// only, so the announce goes out from the same bot that handled the command.
function announcePendingUpdate() {
  const st = readState();
  if (!st || !st.chatId || !st.to) return;
  // Only the bot that ran the command announces for it (jake/subaru/joker
  // all load this module at boot; without this the fastest boot would steal
  // the announce and clear the file before the updating bot is even up).
  const myBotId = processBotId();
  if (st.bot && myBotId && st.bot !== myBotId) return;
  if (Date.now() - (st.at || 0) > STALE_MS) { clearState(); return; }
  let tries = 0;
  const tick = async () => {
    tries++;
    try {
      // Lazy require: avoids a load-time cycle with core/engine.
      const engine = require('../../../engine');
      const sock = engine.getSock ? engine.getSock() : null;
      if (sock && sock.user) {
        await sock.sendMessage(st.chatId, { text: buildAnnounceText(st) });
        clearState();
        console.log(`[updatebot] update announce delivered to ${st.chatId}`);
        return;
      }
    } catch (e) {
      console.error('[updatebot] announce tick failed:', e.message);
    }
    if (tries < 20) setTimeout(tick, 15000);
    else console.log('[updatebot] announce gave up (socket never ready); state kept for next boot');
  };
  setTimeout(tick, 5000);
}

// ── Command handler (.j updatebot) ──────────────────────────────────────────
async function cmdUpdateBot(senderJid, reply, m = {}) {
  const dry = process.env.UPDATEBOT_DRYRUN === '1';

  // In-flight check first: if an update is being applied, the owner rerunning
  // the command should hear "in progress", not the 5-min cooldown.
  const pending = readState();
  if (pending && pending.to && Date.now() - (pending.at || 0) < STALE_MS) {
    return reply(`🔄 *UPDATE ALREADY IN PROGRESS*\n\n🌀 ⟢ _\`${short(pending.from)}\` → \`${short(pending.to)}\` is being applied. I'll confirm in this chat when I'm back online._`);
  }

  // Dry-run bypasses the cooldown so the QA harness can fire several legs
  // back to back; real runs keep the 5-min throttle.
  if (!dry && Date.now() - _lastRunAt < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - (Date.now() - _lastRunAt)) / 60000);
    return reply(`⏳ *UPDATE COOLDOWN*\n\n🌀 ⟢ _I checked for updates ${mins} min ago. Try again in a bit._`);
  }
  _lastRunAt = Date.now();

  const branch = process.env.UPDATEBOT_BRANCH
    || (await sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).out
    || 'audit/fix-pass-1';

  const fetched = await sh('git', ['fetch', 'origin', branch], { timeout: 90000 });
  if (!fetched.ok) {
    return reply(`❌ *UPDATE FAILED*\n\n🌀 ⟢ _git fetch for \`${branch}\` didn't make it:_\n\`${fetched.err}\`\n🛡️ ⟢ _Still running the old version._`);
  }

  const cur = (await sh('git', ['rev-parse', 'HEAD'])).out;
  const next = (await sh('git', ['rev-parse', 'FETCH_HEAD'])).out;
  if (!cur || !next) {
    return reply(`❌ *UPDATE FAILED*\n\n🌀 ⟢ _Could not resolve HEAD/FETCH_HEAD._\n\`${(cur ? '' : 'HEAD ') || ''}${(next ? '' : 'FETCH_HEAD')}\``);
  }

  if (cur === next) {
    clearState(); // clean up anything stale while we're here
    const subj = (await sh('git', ['log', '-1', '--pretty=%s', 'HEAD'])).out;
    return reply(`✅ *ALREADY UP TO DATE*\n\n🌀 ⟢ _Running the latest \`${branch}\`:_ \`${short(cur)}\`${subj ? `\n📝 ⟢ _${subj}_` : ''}`);
  }

  // Only ever FAST-FORWARD. The boxes are the source of truth (AGENTS.md): if origin is behind or has diverged
  // from this box, pulling would drop live work, so refuse instead of merging/resetting.
  if ((await sh('git', ['merge-base', '--is-ancestor', next, cur])).ok) {
    return reply(`✅ *NOTHING TO PULL*\n\n🌀 ⟢ _This box is already ahead of \`origin/${branch}\` (\`${short(cur)}\` contains \`${short(next)}\`)._`);
  }
  if (!(await sh('git', ['merge-base', '--is-ancestor', cur, next])).ok) {
    return reply(`🚫 *UPDATE BLOCKED — DIVERGED*\n\n🌀 ⟢ _This box has commits origin doesn't, and origin has commits this box doesn't (\`${short(cur)}\` vs \`${short(next)}\`)._\n🛡️ ⟢ _Not touching anything. Sync with \`agentctl sync-peer\` / the other box instead._`);
  }
  // Protected-fix canaries (AGENTS.md): never deploy a head that lacks the owner-ordered fixes.
  for (const [needle, label] of [['POST50_LEVEL_START', 'XP-wall fix'], ['flattenLeaves', 'leaf-merge fix']]) {
    if (!(await sh('git', ['grep', '-q', needle, next, '--', 'core'])).ok) {
      return reply(`🚫 *UPDATE REFUSED — PROTECTED FIX MISSING*\n\n🌀 ⟢ _\`origin/${branch}\` (\`${short(next)}\`) lacks the ${label} (\`${needle}\`)._\n🛡️ ⟢ _Not applying it, so live fixes can't be wiped._`);
    }
  }

  const dirty = (await sh('git', ['status', '--porcelain', '--untracked-files=no'])).out;
  if (dirty) {
    return reply(`🚫 *UPDATE BLOCKED — DIRTY TREE*\n\n🌀 ⟢ _Someone edited files on the box directly._\n🛡️ ⟢ _Refusing to \`git reset --hard\` over local changes. Ask the bot admin to clean the box._`);
  }

  const logLines = (await sh('git', ['log', '--oneline', `${cur}..${next}`])).out.split('\n').filter(Boolean);
  const statLine = (await sh('git', ['diff', '--stat', `${cur}..${next}`])).out.split('\n').filter(Boolean).pop() || '';

  // Syntax gate: every changed .js must pass node --check BEFORE we restart. The new versions are not on disk yet
  // (that was the 2026-11-13 bug: it checked paths that didn't exist / the OLD files), so check the incoming blobs.
  const changedJs = (await sh('git', ['diff', '--name-only', '--diff-filter=ACMR', `${cur}..${next}`, '--', '*.js'])).out.split('\n').filter(Boolean);
  const os = require('os');
  for (const f of changedJs.slice(0, MAX_SYNTAX_TARGETS)) {
    const blob = await sh('git', ['show', `${next}:${f}`], { timeout: 30000 });
    if (!blob.ok) continue;
    const tmp = path.join(os.tmpdir(), `updatebot_chk_${process.pid}_${path.basename(f)}`);
    let chk;
    try { fs.writeFileSync(tmp, blob.out + '\n'); chk = await sh('node', ['--check', tmp], { timeout: 30000 }); }
    finally { try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ } }
    if (!chk.ok) {
      return reply(`🚫 *UPDATE ABORTED*\n\n🌀 ⟢ _Syntax check failed on_ \`${f}\`:\n\`${chk.err}\`\n🛡️ ⟢ _Still running the old version — nothing was changed._`);
    }
  }

  const chatId = (m && m.key && m.key.remoteJid) || senderJid;
  if (!writeState({ chatId, requester: senderJid, bot: processBotId(), from: cur, to: next, branch, commits: logLines.length, subjects: logLines, at: Date.now() })) {
    return reply(`❌ *UPDATE FAILED*\n\n🌀 ⟢ _Could not write the update state file — aborting before restart._`);
  }

  const shown = logLines.slice(0, MAX_LOG_LINES).map(l => `• ${l}`).join('\n');
  const more = logLines.length > MAX_LOG_LINES ? `\n_…and ${logLines.length - MAX_LOG_LINES} more_` : '';
  await reply(`🛠️ *BOT UPDATE*\n\n`
    + `🔄 ⟢ _\`${short(cur)}\` → \`${short(next)}\` on \`${branch}\` (${logLines.length} commit${logLines.length === 1 ? '' : 's'})_\n`
    + (statLine ? `📦 ⟢ _${statLine}_\n` : '')
    + `\n${shown}${more}\n`
    + `\n⏳ ⟢ _Pulling and restarting in a few seconds — I'll confirm here when I'm back online._`);

  if (!dry) {
    // THE MISSING STEP (2026-11-13): the old flow only fetched, so the restart relaunched the SAME code.
    const depsChanged = (await sh('git', ['diff', '--name-only', `${cur}..${next}`, '--', 'package.json', 'package-lock.json'])).out.length > 0;
    const merged = await sh('git', ['merge', '--ff-only', next], { timeout: 90000 });
    if (!merged.ok) {
      clearState();
      return reply(`❌ *UPDATE FAILED*\n\n🌀 ⟢ _Fast-forward to \`${short(next)}\` didn't apply:_\n\`${merged.err}\`\n🛡️ ⟢ _Still on \`${short(cur)}\` — nothing was restarted._`);
    }
    if (depsChanged) {
      const npm = await sh('npm', ['install', '--no-audit', '--no-fund', '--omit=dev'], { timeout: 240000 });
      if (!npm.ok) await reply(`⚠️ _package.json changed and \`npm install\` failed: \`${npm.err}\` — restarting anyway, check the box if something's missing._`);
    }
  }

  if (dry) {
    clearState();
    return reply('🧪 _Dry-run: everything checked out, restart skipped (UPDATEBOT_DRYRUN=1)._');
  }

  // Give the reply a moment to flush, then bounce this pm2 process.
  setTimeout(() => {
    const pmId = process.env.pm_id;
    const args = ['restart', pmId ? String(pmId) : (process.env.name || 'wa-bot'), '--update-env'];
    execFile('pm2', args, { timeout: 30000 }, (err) => {
      if (err) {
        console.error('[updatebot] pm2 restart failed, falling back to process.exit:', err.message);
        setTimeout(() => process.exit(0), 1000);
      } else {
        console.log(`[updatebot] pm2 restart issued (${args.slice(1).join(' ')})`);
      }
    });
  }, 3500);
}

// Boot poll: cardSystem requires this module at load on every boot.
setTimeout(() => {
  try { announcePendingUpdate(); } catch (e) { console.error('[updatebot] boot announce check failed:', e.message); }
}, 8000);

module.exports = { cmdUpdateBot, announcePendingUpdate, buildAnnounceText, readState, clearState, STATE_PATH };
