'use strict';
// 🛡️ OWNER ADMIN SHIELD (2026-11-08, owner directive)
// If the bot owner is demoted from admin in ANY group, every bot that is admin there promotes the owner straight back.
// The ONLY person allowed to demote the owner is the group's creator (WhatsApp doesn't let anyone undo the creator anyway, and a creator
// demoting the owner is a deliberate act we respect). The owner demoting themselves is also respected (stepping down on purpose).
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
  const { isOwner, same } = helpers;
  const demotedOwners = asList(update.participants).map(jidOf).filter((j) => j && isOwner(j));
  if (!demotedOwners.length) return none('no-owner-demoted');
  const author = jidOf(update.author);
  if (author) {
    const creators = [metadata && metadata.owner, metadata && metadata.ownerPn].filter(Boolean);
    if (creators.some((c) => same(author, c))) return none('demoted-by-group-creator');   // the one allowed demotion
    if (demotedOwners.some((o) => same(author, o)) || isOwner(author)) return none('owner-stepped-down');
  }
  return { restore: demotedOwners, reason: author ? 'demoted-by-non-creator' : 'demoted-by-unknown (restoring)' };
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

module.exports = { planRestore, enforceOwnerAdmin, _rateOk: rateOk };
