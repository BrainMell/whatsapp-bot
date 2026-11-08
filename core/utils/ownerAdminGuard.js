'use strict';
// 🛡️ OWNER ADMIN SHIELD (2026-11-08, owner directive)
// If the bot owner is demoted from admin in ANY group, every bot that is admin there promotes the owner straight back.
// The ONLY person allowed to demote the owner is the group's creator (WhatsApp doesn't let anyone undo the creator anyway, and a creator
// demoting the owner is a deliberate act we respect). The owner demoting themselves is also respected (stepping down on purpose).
// 🤝 BOT-ADMIN PROTECTION (same day, owner: "bots also make sure no bot is removed from admin unless it's me or the group creator"): the same
// rule covers every registered bot account. Each bot writes its own account ids to the shared KV (`_shared_bot_accounts`) on connect, so siblings
// know each other. A demoted bot is re-promoted by the OTHER admin bots unless the demoter is the owner, the group creator, or another bot
// acting through a permission-checked command.
// Pure decision logic lives here (testable without the engine); engine.js calls enforceOwnerAdmin from its group-participants.update handler.
// Kill switch: OWNER_ADMIN_SHIELD=0.

const lastRestore = new Map();            // `${chat}|${jid}` -> [timestamps]  (loop / rate guard)
const WINDOW_MS = 60 * 1000, MAX_PER_WINDOW = 8;

const asList = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
const jidOf = (p) => { const j = typeof p === 'string' ? p : p && (p.id || p.jid); return j && !String(j).includes('[object') && j !== 'undefined' ? String(j) : null; };

/**
 * Decide what to restore.
 * @param {{action:string, participants:any[], author?:string}} update  baileys group-participants.update payload
 * @param {{owner?:string, ownerPn?:string}} metadata                    group metadata (creator fields)
 * @param {{isOwner:(jid:string)=>boolean, same:(a:string,b:string)=>boolean}} helpers
 * @returns {{restore:string[], reason:string}}
 */
function planRestore(update, metadata, helpers) {
  const none = (reason) => ({ restore: [], reason });
  if (!update || update.action !== 'demote') return none('not-a-demote');
  const { isOwner, same } = helpers, isBot = helpers.isBot || (() => false);
  const demoted = asList(update.participants).map(jidOf).filter(Boolean);
  const owners = demoted.filter((j) => isOwner(j));
  const bots = demoted.filter((j) => !isOwner(j) && isBot(j));
  if (!owners.length && !bots.length) return none('nobody-protected-demoted');
  const author = jidOf(update.author);
  const creators = [metadata && metadata.owner, metadata && metadata.ownerPn].filter(Boolean);
  const byCreator = !!author && creators.some((c) => same(author, c));
  const byOwner = !!author && isOwner(author);
  const restore = [];
  // owner: only the group creator may demote them (or they themselves)
  for (const o of owners) { if (author && (byCreator || same(author, o) || byOwner)) continue; restore.push(o); }
  // bots: only the owner or the group creator may demote them; a sibling bot acting via a (permission-checked) command is also left alone
  for (const b of bots) { if (author && (byCreator || byOwner || isBot(author))) continue; restore.push(b); }
  if (!restore.length) return none(byCreator ? 'demoted-by-group-creator' : byOwner ? 'demoted-by-owner' : 'allowed-actor');
  return { restore, reason: author ? 'demoted-by-non-creator' : 'demoted-by-unknown (restoring)' };
}

function rateOk(chat, jid, now = Date.now()) {
  const k = chat + '|' + jid, arr = (lastRestore.get(k) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) { lastRestore.set(k, arr); return false; }
  arr.push(now); lastRestore.set(k, arr); return true;
}

/** Fire-and-forget safe: never throws. Every admin bot in the group runs this independently, so the owner is back within a round trip. */
async function enforceOwnerAdmin(sock, update, metadata, helpers, log = console.log) {
  try {
    if (process.env.OWNER_ADMIN_SHIELD === '0') return { restored: [], reason: 'disabled' };
    const plan = planRestore(update, metadata, helpers);
    if (!plan.restore.length) return { restored: [], reason: plan.reason };
    const restored = [];
    for (const jid of plan.restore) {
      if (!rateOk(update.id, jid)) { log(`[ownerShield] rate limit hit for ${jid} in ${update.id} - not fighting further`); continue; }
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try { await sock.groupParticipantsUpdate(update.id, [jid], 'promote'); ok = true; }
        catch (e) {
          const msg = String(e && (e.message || e)); const perm = /not-authorized|forbidden|403|admin/i.test(msg);
          if (perm || attempt === 1) { log(`[ownerShield] could not restore ${jid} in ${update.id}: ${msg} ${perm ? '(this bot is not admin - another bot will)' : ''}`); break; }
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      if (ok) { restored.push(jid); log(`🛡️ [ownerShield] owner ${jid} demoted by ${jidOf(update.author) || 'unknown'} in ${update.id} (${plan.reason}) → re-promoted`); }
    }
    return { restored, reason: plan.reason };
  } catch (e) { return { restored: [], reason: 'error:' + (e && e.message) }; }
}

// ── shared bot-account registry (so each bot recognises its siblings) ─────────────────────────────────────────────────────────────
const KEY = '_shared_bot_accounts';
let _botCache = { at: 0, data: {} };
const _num = (j) => String(j || '').split('@')[0].split(':')[0];
async function registerSelf(sock, botId, system) {
  try {
    system = system || require('./system');
    const me = [sock && sock.user && sock.user.id, sock && sock.user && sock.user.lid].filter(Boolean).map(_num).filter(Boolean);
    if (!me.length) return false;
    const cur = (await system.getFresh(KEY, null)) || system.get(KEY, null) || {};
    cur[String(botId || 'bot')] = { nums: Array.from(new Set(me)), at: Date.now() };
    await system.set(KEY, cur); _botCache = { at: Date.now(), data: cur }; return true;
  } catch (e) { return false; }
}
async function loadBotNums(system, maxAgeMs = 60 * 1000) {
  try {
    if (Date.now() - _botCache.at < maxAgeMs) return _botCache.data;
    system = system || require('./system');
    const d = (await system.getFresh(KEY, null)) || system.get(KEY, null) || {};
    _botCache = { at: Date.now(), data: d }; return d;
  } catch (e) { return _botCache.data; }
}
function isRegisteredBot(jid, data) {
  const n = _num(jid); if (!n) return false;
  return Object.values(data || {}).some((b) => b && Array.isArray(b.nums) && b.nums.includes(n));
}

module.exports = { registerSelf, loadBotNums, isRegisteredBot, planRestore, enforceOwnerAdmin, _rateOk: rateOk };
