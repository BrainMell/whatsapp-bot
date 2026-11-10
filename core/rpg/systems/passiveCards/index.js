'use strict';
// 🃏 Passive card ownership + loadout (mirrors summonCards/system.js: moderator grants only until the owner decides how players earn them).
const { PASSIVE_CATALOG, RARITY, FAMILY, SYNERGIES, ALIASES } = require('./catalog');
const engine = require('./engine');
// 🃏 Slots by ADVENTURER RANK (owner doc 2026-11-10: up to 5, rank-gated). One table = commands, db and combat all read slotsFor().
const RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'GOD'];
const SLOT_RANKS = [['F', 2], ['D', 3], ['B', 4], ['S', 5]];   // [first rank that grants it, slots]
const MAX_SLOTS = 5;
function slotsForRank(rank) { const i = Math.max(0, RANK_ORDER.indexOf(String(rank || 'F').toUpperCase())); let n = 2; for (const [r, k] of SLOT_RANKS) if (i >= RANK_ORDER.indexOf(r)) n = k; return n; }
/** rank needed for slot number n (1-based) */
function rankForSlot(n) { if (n <= 2) return 'F'; for (const [r, k] of SLOT_RANKS) if (k >= n) return r; return 'S'; }
const norm = (v) => { const k = String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); for (const id of Object.keys(PASSIVE_CATALOG)) if (id.replace(/_/g, '') === k) return id; return ALIASES[k] || null; };

function createPassiveCardSystem(economy) {
  if (!economy || typeof economy.getUser !== 'function') throw new TypeError('PassiveCards requires economy.getUser().');
  const userFor = (jid) => (jid ? economy.getUser(jid) : null);
  const save = (jid) => { if (typeof economy.scheduleSave === 'function') economy.scheduleSave(jid); else if (typeof economy.saveUser === 'function') economy.saveUser(jid); };
  const owned = (jid) => { const u = userFor(jid); if (!u) return []; if (!Array.isArray(u.passiveCards)) u.passiveCards = []; return u.passiveCards.filter((e) => e && PASSIVE_CATALOG[e.cardId]); };
  const slotsFor = (jid) => { const u = userFor(jid); return Math.min(MAX_SLOTS, slotsForRank(u && u.adventurerRank)); };
  const sortOwned = (jid) => owned(jid).map((e) => ({ ...PASSIVE_CATALOG[e.cardId], grantedAt: e.grantedAt || 0, grantedBy: e.grantedBy || null })).sort((a, b) => (RARITY[b.rarity].rank - RARITY[a.rarity].rank) || a.name.localeCompare(b.name));
  function getLoadout(jid) { const u = userFor(jid); if (!u) return []; const own = new Set(owned(jid).map((e) => e.cardId)); const lo = (Array.isArray(u.passiveLoadout) ? u.passiveLoadout : []).filter((id) => own.has(id)); return Array.from(new Set(lo)).slice(0, slotsFor(jid)); }
  function resolveRef(jid, raw) { const t = String(raw == null ? '' : raw).trim(); if (/^\d+$/.test(t)) { const c = sortOwned(jid)[Number(t) - 1]; return c ? c.id : null; } return norm(t); }
  function grant(jid, rawId, by) {
    const id = norm(rawId); if (!id) return { success: false, message: 'Unknown passive card. IDs: ' + Object.keys(PASSIVE_CATALOG).join(', ') };
    const u = userFor(jid); if (!u) return { success: false, message: 'Player is not registered.' };
    if (owned(jid).some((e) => e.cardId === id)) return { success: false, message: PASSIVE_CATALOG[id].name + ' is already owned.' };
    u.passiveCards = owned(jid).concat([{ cardId: id, grantedAt: Date.now(), grantedBy: String(by || 'moderator'), source: 'moderator' }]); save(jid);
    return { success: true, card: PASSIVE_CATALOG[id] };
  }
  function revoke(jid, rawId) {
    const u = userFor(jid); if (!u) return { success: false, removed: 0, message: 'Player is not registered.' };
    const t = String(rawId || '').trim().toLowerCase();
    if (!t || t === 'all') { const n = owned(jid).length; u.passiveCards = []; u.passiveLoadout = []; if (n) save(jid); return { success: true, removed: n, message: n ? 'All passive cards revoked.' : 'Player owns no passive cards.' }; }
    const id = norm(t); if (!id) return { success: false, removed: 0, message: 'Unknown passive card.' };
    const had = owned(jid).some((e) => e.cardId === id); u.passiveCards = owned(jid).filter((e) => e.cardId !== id); u.passiveLoadout = getLoadout(jid).filter((x) => x !== id); if (had) save(jid);
    return { success: had, removed: had ? 1 : 0, message: had ? PASSIVE_CATALOG[id].name + ' revoked.' : 'Player does not own ' + PASSIVE_CATALOG[id].name + '.' };
  }
  /** equip(jid, ref, { inCombat }) — loadout changes are blocked in combat. No duplicates; slots by adventurer rank (2..5). */
  function equip(jid, ref, opts) {
    if (opts && opts.inCombat) return { success: false, message: 'You can only change your passive loadout outside combat.' };
    const id = resolveRef(jid, ref); if (!id) return { success: false, message: 'Unknown passive card.' };
    if (!owned(jid).some((e) => e.cardId === id)) return { success: false, message: 'You do not own ' + PASSIVE_CATALOG[id].name + '.' };
    const lo = getLoadout(jid); if (lo.includes(id)) return { success: false, message: PASSIVE_CATALOG[id].name + ' is already equipped.' };
    const slots = slotsFor(jid); if (lo.length >= slots) return { success: false, message: `All ${slots} passive slots are full. Unequip one first.` };
    userFor(jid).passiveLoadout = lo.concat([id]); save(jid); return { success: true, card: PASSIVE_CATALOG[id], slots };
  }
  function unequip(jid, ref, opts) {
    if (opts && opts.inCombat) return { success: false, message: 'You can only change your passive loadout outside combat.' };
    const lo = getLoadout(jid); const t = String(ref || '').trim(); let id = null;
    if (/^[1-5]$/.test(t) && lo[Number(t) - 1]) id = lo[Number(t) - 1]; else id = norm(t);
    if (!id || !lo.includes(id)) return { success: false, message: 'That card is not equipped.' };
    userFor(jid).passiveLoadout = lo.filter((x) => x !== id); save(jid); return { success: true, card: PASSIVE_CATALOG[id] };
  }
  function activeSynergies(jid) { const lo = new Set(getLoadout(jid)); return SYNERGIES.filter((s) => s.cards.every((c) => lo.has(c))); }
  function describe(card, n) { return `${n ? n + '. ' : ''}${card.icon} *${card.name}* [${card.rarity} · ${card.family}]\n   ${card.desc}`; }
  function buildText(jid, prefix) {
    const own = sortOwned(jid), lo = getLoadout(jid), slots = slotsFor(jid); const p = prefix || '.';
    if (!own.length) return '🃏 *Passive Cards*\nYou own no passive cards yet.';
    let t = `🃏 *Passive Cards* — equipped ${lo.length}/${slots}\n`;
    for (let i = 0; i < slots; i++) { const c = PASSIVE_CATALOG[lo[i]]; t += c ? `  [${i + 1}] ${c.icon} ${c.name} — ${c.desc}\n` : `  [${i + 1}] — empty slot —\n`; }
    const syn = activeSynergies(jid); if (syn.length) t += '\n✨ *Synergy:* ' + syn.map((s) => s.text).join(' ') + '\n';
    t += '\n*Collection*\n' + own.map((c, i) => describe(c, i + 1) + (lo.includes(c.id) ? '  ✅' : '')).join('\n');
    t += `\n\n_${p}passive equip <n|name> · ${p}passive unequip <slot|name>_`; return t;
  }
  function collectionInfo(jid) { const u = userFor(jid) || {}; return { owned: sortOwned(jid), loadout: getLoadout(jid), slots: slotsFor(jid), maxSlots: MAX_SLOTS, rankForSlot, rank: String(u.adventurerRank || 'F').toUpperCase(), name: u.name || u.username || '', synergies: activeSynergies(jid) }; }
  async function renderCollectionImage(jid) { return require('./cardRenderer').renderCollection(collectionInfo(jid)); }
  async function renderCardImage(jid, id) {
    const { createCanvas } = require('canvas'); const cr = require('./cardRenderer'); try { await require('../combat/combatHud').preload(); } catch (e) {}
    const lo = getLoadout(jid), has = owned(jid).some((e) => e.cardId === id); const sc = 2, cv = createCanvas(cr.CW * sc + 60, cr.CH * sc + 70), c = cv.getContext('2d');
    c.fillStyle = '#0c0f17'; c.fillRect(0, 0, cv.width, cv.height);
    cr.drawPassiveCard(c, PASSIVE_CATALOG[id], 30, 24, cr.CW * sc, cr.CH * sc, lo.includes(id) ? 'active' : (has ? 'owned' : 'unowned'), { slot: lo.indexOf(id) + 1 });
    return cv.toBuffer('image/jpeg', { quality: 0.92 });
  }
  engine.setSlotsResolver((p) => (p && p.jid ? slotsFor(p.jid) : 2));
  engine.setLoadoutResolver((p) => (p && p.jid ? getLoadout(p.jid) : []));
  return { renderCardImage, collectionInfo, renderCollectionImage, RANK_ORDER, MAX_SLOTS, rankForSlot, slotsForRank, catalog: PASSIVE_CATALOG, normalizeCardId: norm, getOwnedCards: sortOwned, getLoadout, slotsFor, grant, revoke, equip, unequip, resolveRef, activeSynergies, buildText, describe };
}
module.exports = { createPassiveCardSystem, PASSIVE_CATALOG, RARITY, FAMILY, SYNERGIES, engine, normalizeCardId: norm };
