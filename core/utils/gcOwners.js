// ═══════════════════════════════════════════════════════════════════════════
// 👑 GC OWNER REGISTRY (2026-09-22)
// Per-group protected owner, marked in the DB by the bot owner via
// `.j gcowner @user`. The marked user is IMMUNE to every admin action the
// bots can take on a member of that group: mute, hardmute, kick, warn,
// demote, nuke, the antispam auto-mute, the antibot punishments and the
// antilink security actions. Marking also clears any live mute in that
// group (engine-side).
//
// Storage: SHARED system KV key `_shared_gc_owners` as { chatId: jid } so
// BOTH bots enforce the same immunity (mirrors _shared_global_mods).
//
// Identity matching goes through lidResolver.canonicalRankKey() (LID↔phone
// + device-suffix safe) so an @lid mention matches a phone-form roster
// entry and vice versa. Bare numbers are deliberately NOT equated across
// domains - an @lid number and a phone number are different numbers for
// the same user; only the resolver mapping may bridge them.
//
// Own module (not inline in engine.js) so the QA battery can runtime-test
// the real logic without booting the engine (same pattern as testerSystem).
// ═══════════════════════════════════════════════════════════════════════════
const botConfig = require('../../botConfig');
const system = require('./system');

const gcOwners = new Map(); // chatId -> stored JID (as marked)

// NOTE: system.js also exports get/getFresh lazily used in loadGcOwners.
void system;

async function loadGcOwners() {
  try {
    // 💡 getFresh-first: reads the shared key STRAIGHT from the DB (with a
    // cache fallback) so a marked GC owner is honoured even if the boot-time
    // system cache load failed - the same lesson as the 2026-09-11 stale
    // mod lists fix.
    const system = require('./system');
    const data = await system.getFresh('_shared_gc_owners', null) ?? system.get('_shared_gc_owners', null);
    if (data && typeof data === 'object') {
      for (const [chat, jid] of Object.entries(data)) {
        if (chat && jid) gcOwners.set(chat, jid);
      }
    }
    console.log(`👑 [${botConfig.getBotId()}] Loaded ${gcOwners.size} marked GC owner(s)`);
  } catch (err) {
    console.error("Error loading GC owners:", err.message);
  }
}

async function saveGcOwners() {
  await system.set('_shared_gc_owners', Object.fromEntries(gcOwners));
}

function _normJidSafe(u) {
  try {
    const { jidNormalizedUser } = require('@whiskeysockets/baileys');
    return jidNormalizedUser(u);
  } catch (e) { return u; }
}

async function setGcOwner(chatId, userId) {
  gcOwners.set(chatId, _normJidSafe(userId));
  await saveGcOwners();
}

async function clearGcOwner(chatId) {
  const had = gcOwners.delete(chatId);
  if (had) await saveGcOwners();
  return had;
}

function getGcOwner(chatId) {
  return gcOwners.get(chatId) || null;
}

// Immunity check - LID/phone/device-suffix safe via canonicalRankKey.
function isGcOwner(userId, chatId) {
  if (!userId || !chatId) return false;
  const stored = gcOwners.get(chatId);
  if (!stored) return false;
  try {
    const lidResolver = require('./lidResolver');
    const a = lidResolver.canonicalRankKey(userId);
    const b = lidResolver.canonicalRankKey(stored);
    if (a && a === b) return true;
    // Final fallback: same-domain user-part equality (covers odd suffixes
    // canonicalRankKey leaves untouched).
    const pa = String(a || '').split('@');
    const pb = String(b || '').split('@');
    return pa[0] === pb[0] && pa[1] === pb[1];
  } catch (err) {
    return _normJidSafe(userId) === _normJidSafe(stored);
  }
}

module.exports = {
  loadGcOwners,
  saveGcOwners,
  setGcOwner,
  clearGcOwner,
  getGcOwner,
  isGcOwner,
};
