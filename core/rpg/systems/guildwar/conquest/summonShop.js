'use strict';
// 🃏 SUMMON SHOP — Aether Gems -> summon cards. Stock rotates so rares/legendaries stay scarce.
const { CFG } = require('./config');
const { CARD_CATALOG } = require('../../summonCards/catalog');
const { mulberry32, hashStr } = require('./mapgen');

const dayKey = (now) => Math.floor(now / 86400e3); const weekKey = (now) => Math.floor(now / (7 * 86400e3));
function stock(now = Date.now()) {
    const cards = Object.values(CARD_CATALOG); const by = (r) => cards.filter((c) => c.rarity === r).sort((a, b) => a.id.localeCompare(b.id));
    const pick = (arr, n, seed) => { const rng = mulberry32(hashStr(seed)); const a = arr.slice(); const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rng() * a.length), 1)[0]); return out; };
    const list = [...by('COMMON'), ...by('UNCOMMON'), ...pick(by('RARE'), 3, 'rare:' + dayKey(now)), ...pick(by('LEGENDARY'), 1, 'leg:' + weekKey(now))];
    return list.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, price: CFG.SHOP_PRICE[c.rarity] }));
}
function render(owned = [], gems = 0, now = Date.now()) {
    const L = [`🃏 *SUMMON SHOP* — you have 💎 ${gems} ${CFG.GEM_NAME}`]; let last = '';
    for (const s of stock(now)) { if (s.rarity !== last) { last = s.rarity; L.push(`\n*${s.rarity}*`); } L.push(`• ${s.name} — 💎${s.price}${owned.includes(s.id) ? ' ✅ owned' : ''}`); }
    L.push('\nBuy: `.j gemshop buy <card>`  (rares rotate daily, legendary weekly)'); return L.join('\n');
}
function buy({ economy, summons, jid, card, now = Date.now() }) {
    const user = economy.getUser(jid); if (!user) return { ok: false, msg: 'Register first.' };
    const id = summons.normalizeCardId ? summons.normalizeCardId(card) : String(card || '').toLowerCase();
    const item = stock(now).find((s) => s.id === id); if (!item) return { ok: false, msg: 'That card is not in stock today. See `.j gemshop`.' };
    if ((user.summonCards || []).some((c) => String(c.cardId).toLowerCase() === id)) return { ok: false, msg: `You already own ${item.name}.` };
    if ((user.gems || 0) < item.price) return { ok: false, msg: `Need 💎${item.price} (you have ${user.gems || 0}).` };
    const r = summons.acquireCard(jid, id, 'gem_shop', 'gem_shop'); if (!r || !r.success) return { ok: false, msg: (r && r.message) || 'Purchase failed.' };
    user.gems -= item.price; if (typeof economy.scheduleSave === 'function') economy.scheduleSave(jid); else if (typeof economy.saveUser === 'function') economy.saveUser(jid);
    return { ok: true, msg: `🃏 Summoned *${item.name}* for 💎${item.price}!`, card: item };
}
module.exports = { stock, render, buy };
