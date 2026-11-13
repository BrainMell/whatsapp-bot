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
//   1. git fetch origin <branch-the-box-runs>  (self-heals a dead embedded
//      credential in the remote URL by rewriting it to the plain public URL)
//   2. HEAD == FETCH_HEAD ? "already up to date" : plan the update
//   3. Safety rails: dirty-tree abort, syntax gate on every incoming blob,
//      5-min cooldown, single in-flight update, ancestry + canary gates
//   4. Write core/data/updatebot_state.json (who asked, from -> to)
//   5. Reply the commit list, then pm2 restart the box's bot set
//      (RESTART_APPS from ../git_guard.conf, fallback wa-* pm2 apps)
//   6. On boot, announcePendingUpdate() polls until the WA socket is back
//      and reports "UPDATE COMPLETE" in the chat that ran the command.
//
// 2026-11-13 v2 (Oatmeal, after the "says up to date but isn't" incident):
//   - fetch failure is a HARD abort (never trust a stale origin ref) — Claude
//     shipped that in 0d88b6fc; v2 additionally SELF-HEALS the remote URL so
//     the dead-credential class of failure disappears instead of just reporting
//   - restart ALL bots on the box, not just self: jake/subaru share one work
//     tree, so a jake-run update must reload subaru too (and vice versa)
//   - restart set comes from ../git_guard.conf RESTART_APPS (ops-owned list,
//     excludes wa-miner/bot-generation on purpose); fallback: pm2 apps ^wa-
//   - npm install scrub: box1's nested sharp revives on every npm install and
//     crash-loops jake/subaru — after npm install, any nested sharp* is
//     renamed <dir>.disabled-updatebot and the owner is told
//   - announce bot match treats 'global' as wildcard so QA/standalone runs
//     still get their UPDATE COMPLETE
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
const GUARD_CONF = path.join(ROOT, '..', 'git_guard.conf');
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

// ── v2: remote self-heal ────────────────────────────────────────────────────
// The 2026-11-13 incident root cause: boxes' origin URLs carried an embedded
// GitHub token that GitHub had rejected, so `git fetch` failed and the old
// code reported "already up to date" off a stale origin ref. The repo is
// publicly fetchable, so the cure is to strip the userinfo from the URL.
// Pure helper (exported for QA): https://user:pass@host/... -> https://host/...
// Anything that isn't an https URL with userinfo returns null (nothing to heal).
function plainRemoteUrl(url) {
  const m = String(url || '').trim().match(/^(https?:\/\/)([^\/\s]+@)(.+)$/);
  return m ? m[1] + m[3] : null;
}

// If origin embeds credentials, rewrite it to the plain URL and say so.
// Returns a human note when a rewrite happened, else null.
async function healRemoteOrigin() {
  const cur = await sh('git', ['remote', 'get-url', 'origin'], { timeout: 10000 });
  if (!cur.ok) return null;
  const plain = plainRemoteUrl(cur.out);
  if (!plain || plain === cur.out) return null;
  const set = await sh('git', ['remote', 'set-url', 'origin', plain], { timeout: 10000 });
  return set.ok ? `removed the dead embedded credential from origin (plain public URL)` : null;
}

// ── v2: which pm2 apps does this box restart after a tree update? ───────────
// 1. RESTART_APPS from ../git_guard.conf (ops-owned, per-box, excludes the
//    miner/scraper side apps on purpose)
// 2. fallback: every pm2 app named ^wa- (the bots)
// 3. last resort: this process only (pm_id / name env)
// Pure helper (exported for QA).
function parseRestartApps(confText) {
  const m = String(confText || '').match(/^\s*RESTART_APPS\s*=\s*"?([^"\n]*)"?\s*$/m);
  if (!m) return [];
  return m[1].trim().split(/\s+/).filter(Boolean);
}

async function resolveRestartTargets() {
  // 1. guard conf
  try {
    const apps = parseRestartApps(fs.readFileSync(GUARD_CONF, 'utf8'));
    if (apps.length) return { apps, via: 'git_guard.conf' };
  } catch (e) { /* no conf on this machine */ }
  // 2. pm2 jlist, names starting wa-
  const jl = await sh('pm2', ['jlist'], { timeout: 15000 });
  if (jl.ok) {
    try {
      const apps = JSON.parse(jl.out).map(a => String(a.name)).filter(n => /^wa-/i.test(n));
      if (apps.length) return { apps, via: 'pm2 wa-*' };
    } catch (e) { /* fall through */ }
  }
  // 3. self
  return { apps: [process.env.pm_id ? String(process.env.pm_id) : (process.env.name || 'wa-bot')], via: 'self' };
}

// Resolve target app names (or ids) to pm2 ids and restart them all in one go.
// Returns {ok, ids, err}.
async function restartPm2Apps(targetApps) {
  const jl = await sh('pm2', ['jlist'], { timeout: 15000 });
  const byName = new Map();
  if (jl.ok) {
    try { for (const a of JSON.parse(jl.out)) byName.set(String(a.name), a.pm_id); } catch (e) { /* names unresolved */ }
  }
  const ids = [];
  for (const t of targetApps) {
    const id = byName.has(String(t)) ? byName.get(String(t)) : (/^\d+$/.test(String(t)) ? Number(t) : undefined);
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length) return { ok: false, ids: [], err: 'no pm2 ids resolved for: ' + targetApps.join(',') };
  const r = await sh('pm2', ['restart', ...ids.map(String), '--update-env'], { timeout: 30000 });
  return { ok: r.ok, ids, err: r.ok ? '' : r.err };
}

// ── v2: nested-sharp scrub (box1 hazard) ────────────────────────────────────
// npm install on box1 historically revived a nested sharp 0.30.7; the running
// bot (sharp 0.35.3 at top level) then resolved the nested binding against the
// wrong libvips soname and crash-looped. package.json overrides now cover the
// known wsf path — this scan is the belt-and-braces for any OTHER nested copy.
// Pure helper (exported for QA): returns repo-relative paths of sharp* dirs
// that live inside a nested node_modules. Top-level node_modules/sharp and
// node_modules/@img/* are the real install and are never flagged. Already-
// disabled copies (name contains .disabled) are skipped.
function findNestedSharp(root, maxDepth = 4) {
  const out = [];
  const walkNm = (nmDir, depth) => {
    let entries;
    try { entries = fs.readdirSync(nmDir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
      const p = path.join(nmDir, ent.name);
      if (ent.name === 'node_modules') { walkNm(p, depth); continue; }
      // depth >= 1: only sharp* NESTED inside another package's node_modules.
      // depth 0 children (node_modules/sharp, node_modules/@img/...) are the
      // real install and must never be disabled.
      if (depth >= 1 && /^sharp/i.test(ent.name) && !ent.name.includes('.disabled')) {
        out.push(path.relative(root, p));
        continue;
      }
      if (depth >= maxDepth) continue;
      const sub = path.join(p, 'node_modules');
      try { if (fs.statSync(sub).isDirectory()) walkNm(sub, depth + 1); } catch (e) { /* no nested nm */ }
    }
  };
  walkNm(path.join(root, 'node_modules'), 0);
  return out.sort();
}

// Rename any nested sharp copies out of require() reach. Returns the list
// actually disabled (empty when the tree was already clean).
function scrubNestedSharp() {
  const disabled = [];
  for (const rel of findNestedSharp(ROOT)) {
    try {
      fs.renameSync(path.join(ROOT, rel), path.join(ROOT, rel + '.disabled-updatebot'));
      disabled.push(rel);
    } catch (e) { console.error('[updatebot] sharp scrub failed for', rel, e.message); }
  }
  return disabled;
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
    + (Array.isArray(st.apps) && st.apps.length ? `\n🤖 ⟢ _restarted: ${st.apps.join(', ')}_` : '')
    + (Array.isArray(st.scrubbed) && st.scrubbed.length ? `\n🧼 ⟢ _nested sharp disabled: ${st.scrubbed.join(', ')}_` : '')
    + `\n🟢 ⟢ _Back online — thanks for waiting._`;
}

// ── Boot self-check ─────────────────────────────────────────────────────────
// cardSystem requires this module at boot; 8s later we start polling for the
// WA socket and deliver any pending update announce. Runs in THIS process
// only, so the announce goes out from the same bot that handled the command.
// v2.1: if the command's bot can't deliver (unpaired / socket down), a SIBLING
// bot on the same box takes over after a 2-min grace period — the box shares
// one work tree, so the update is just as done for it. Claim-before-send (the
// state is cleared first) keeps a primary/sibling race from double-posting.
const ANNOUNCE_FALLBACK_MS = 2 * 60 * 1000;
function announcePendingUpdate() {
  const st = readState();
  if (!st || !st.chatId || !st.to) return;
  // Prefer the bot that ran the command (jake/subaru/joker all load this
  // module at boot; without a preference the fastest boot would steal the
  // announce and clear the file before the updating bot is even up).
  // 'global' (QA/standalone runs with no BOT_INSTANCE) is a wildcard.
  const myBotId = processBotId();
  const primaryStale = Date.now() - (st.at || 0) > ANNOUNCE_FALLBACK_MS;
  const mine = !st.bot || st.bot === 'global' || st.bot === myBotId;
  if (!mine && !primaryStale) {
    // Not my announce and the primary still has grace time left — re-check
    // once the grace expires (this boot-only poll has no other trigger).
    setTimeout(() => { try { announcePendingUpdate(); } catch (e) { /* next boot */ } },
      Math.max(30000, ANNOUNCE_FALLBACK_MS - (Date.now() - (st.at || 0)) + 30000));
    return;
  }
  if (Date.now() - (st.at || 0) > STALE_MS) { clearState(); return; }
  let tries = 0;
  const tick = async () => {
    tries++;
    try {
      // Lazy require: avoids a load-time cycle with core/engine.
      const engine = require('../../../engine');
      const sock = engine.getSock ? engine.getSock() : null;
      if (sock && sock.user) {
        const payload = buildAnnounceText(st);
        const deliver = `${st.bot || 'global'}${primaryStale && st.bot !== myBotId ? ' (via ' + myBotId + ' fallback)' : ''}`;
        clearState(); // claim: any other boot/race now sees no pending state
        await sock.sendMessage(st.chatId, { text: payload });
        console.log(`[updatebot] update announce delivered to ${st.chatId} (${deliver})`);
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

  let fetched = await sh('git', ['fetch', 'origin', branch], { timeout: 90000 });
  let healNote = null;
  if (!fetched.ok) {
    // v2: a failed fetch is a HARD abort — but first try the known cure for
    // the dead-embedded-credential remote (repo is publicly fetchable).
    healNote = await healRemoteOrigin();
    if (healNote) {
      console.log('[updatebot] remote healed:', healNote);
      fetched = await sh('git', ['fetch', 'origin', branch], { timeout: 90000 });
    }
  }
  if (!fetched.ok) {
    const healed = healNote
      ? `\n🔧 ⟢ _Tried self-heal (${healNote}) — fetch still failed._`
      : `\n🔧 ⟢ _If this keeps happening, the origin URL may need fixing (plain https URL, no embedded token)._`;
    return reply(`❌ *UPDATE FAILED*\n\n🌀 ⟢ _git fetch for \`${branch}\` didn't make it:_\n\`${fetched.err}\`${healed}\n🛡️ ⟢ _Still running the old version._`);
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

  const { apps: restartApps, via: viaLabel } = await resolveRestartTargets();

  const chatId = (m && m.key && m.key.remoteJid) || senderJid;
  if (!writeState({ chatId, requester: senderJid, bot: processBotId(), from: cur, to: next, branch, commits: logLines.length, subjects: logLines, apps: restartApps, at: Date.now() })) {
    return reply(`❌ *UPDATE FAILED*\n\n🌀 ⟢ _Could not write the update state file — aborting before restart._`);
  }

  const shown = logLines.slice(0, MAX_LOG_LINES).map(l => `• ${l}`).join('\n');
  const more = logLines.length > MAX_LOG_LINES ? `\n_…and ${logLines.length - MAX_LOG_LINES} more_` : '';
  await reply(`🛠️ *BOT UPDATE*\n\n`
    + `🔄 ⟢ _\`${short(cur)}\` → \`${short(next)}\` on \`${branch}\` (${logLines.length} commit${logLines.length === 1 ? '' : 's'})_\n`
    + (statLine ? `📦 ⟢ _${statLine}_\n` : '')
    + (healNote ? `🔧 ⟢ _${healNote}_\n` : '')
    + `🤖 ⟢ _will restart: ${restartApps.join(', ')} (${viaLabel})_\n`
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
      // v2: nested sharp revives on npm install and crash-loops the bots —
      // disable any copy that just came back before the restart puts it in play.
      const scrubbed = scrubNestedSharp();
      if (scrubbed.length) {
        console.log('[updatebot] nested sharp disabled:', scrubbed.join(', '));
        try {
          const st = readState();
          if (st) { st.scrubbed = scrubbed; writeState(st); }
        } catch (e) { /* announce will just omit the scrub line */ }
        await reply(`🧼 ⟢ _npm install brought back nested sharp — disabled it: ${scrubbed.join(', ')}. Bot stays on top-level sharp._`);
      }
    }
    // v2: restart EVERY bot on this box (shared work tree — a jake-run update
    // must reload subaru too, not just the process that ran the command).
    const rr = await restartPm2Apps(restartApps);
    if (!rr.ok) {
      console.error('[updatebot] pm2 restart failed, falling back to process.exit:', rr.err);
      setTimeout(() => process.exit(0), 1000);
    } else {
      console.log(`[updatebot] pm2 restart issued for [${rr.ids.join(', ')}] (${restartApps.join(', ')} via ${viaLabel})`);
    }
    return; // restart handles the rest; the boot poll delivers the announce
  }

  clearState();
  return reply('🧪 _Dry-run: everything checked out, restart skipped (UPDATEBOT_DRYRUN=1)._');
}

// Boot poll: cardSystem requires this module at load on every boot.
setTimeout(() => {
  try { announcePendingUpdate(); } catch (e) { console.error('[updatebot] boot announce check failed:', e.message); }
}, 8000);

module.exports = { cmdUpdateBot, announcePendingUpdate, buildAnnounceText, readState, clearState, STATE_PATH, plainRemoteUrl, parseRestartApps, findNestedSharp, scrubNestedSharp, resolveRestartTargets };
