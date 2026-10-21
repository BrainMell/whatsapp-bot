'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  BASE ACTIVITIES — what you actually DO at the pond and the hunting grounds
//  (owner 2026-10-20: "first you'll have to make the hunting grounds … fix the
//  pond", "connect as much as you can").  `.j base fish` / `.j base hunt`.
//  Pure-ish: returns { ok, text, banner } — baseBuilder renders the zoom card.
//  Cooldowns live on the Base doc (cooldowns.<kind>) so they survive restarts.
// ═══════════════════════════════════════════════════════════════════════════
const economy = require('./economy');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');

// materials this module introduces (ids are stable; names show in the bag)
const NEW_ITEMS = {
    raw_fish:       { name: 'Pond Minnow',      description: 'A small silver fish from your pond.',           rarity: 'COMMON',   value: 40,   type: 'MATERIAL' },
    river_trout:    { name: 'River Trout',      description: 'A plump trout — good eating.',                  rarity: 'UNCOMMON', value: 140,  type: 'MATERIAL' },
    silver_carp:    { name: 'Silver Carp',      description: 'Scales like coins. Merchants pay well.',        rarity: 'RARE',     value: 480,  type: 'MATERIAL' },
    crystal_koi:    { name: 'Crystal Koi',      description: 'A koi that glows faintly. Prized by alchemists.', rarity: 'EPIC',   value: 1800, type: 'MATERIAL' },
    rabbit_pelt:    { name: 'Rabbit Pelt',      description: 'Soft pelt from a hare.',                        rarity: 'COMMON',   value: 50,   type: 'MATERIAL' },
    venison:        { name: 'Venison Haunch',   description: 'Fresh game meat.',                              rarity: 'UNCOMMON', value: 160,  type: 'MATERIAL' },
    boar_tusk:      { name: 'Boar Tusk',        description: 'A curved tusk — craftsmen love them.',          rarity: 'RARE',     value: 520,  type: 'MATERIAL' },
    stag_antler:    { name: 'Stag Antler',      description: 'Crown of a woodland stag.',                     rarity: 'EPIC',     value: 2000, type: 'MATERIAL' },
};
try { for (const [id, d] of Object.entries(NEW_ITEMS)) if (lootSystem.ITEM_DATABASE && !lootSystem.ITEM_DATABASE[id]) lootSystem.ITEM_DATABASE[id] = d; } catch (e) { /* items degrade to 'Unknown item' */ }

const RULES = {
    fish: {
        cooldownMs: 4 * 60 * 1000, verb: 'cast your line', head: '🎣 Catch of the day',
        // [itemId, weight by pond level 1..3, qty min, qty max]
        table: [['raw_fish', [60, 45, 30], 1, 3], ['river_trout', [30, 35, 35], 1, 2], ['silver_carp', [9, 16, 22], 1, 1], ['crystal_koi', [1, 4, 13], 1, 1]],
        zeni: [20, 60],
    },
    hunt: {
        cooldownMs: 8 * 60 * 1000, verb: 'ride out with the hunting party', head: '🏹 The hunt returns',
        table: [['rabbit_pelt', [55, 42, 30], 1, 3], ['venison', [32, 34, 34], 1, 2], ['boar_tusk', [11, 18, 24], 1, 1], ['stag_antler', [2, 6, 12], 1, 1]],
        zeni: [40, 120],
    },
};

function pick(table, tier) {
    const t = Math.max(0, Math.min(2, tier - 1));
    const total = table.reduce((s, r) => s + r[1][t], 0);
    let roll = Math.random() * total;
    for (const r of table) { roll -= r[1][t]; if (roll <= 0) return r; }
    return table[0];
}
const fmtMs = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };

/**
 * run(kind, userId, tier, lastTs) → { ok, wait?, text, banner, drops }
 * tier: pond level (fish) / barracks level (hunt: the hunting party's strength). Caller persists the cooldown on ok.
 */
async function run(kind, userId, tier, lastTs) {
    const R = RULES[kind];
    if (!R) return { ok: false, text: '❌ Unknown activity.' };
    const now = Date.now();
    if (lastTs && now - lastTs < R.cooldownMs) {
        const wait = R.cooldownMs - (now - lastTs);
        return { ok: false, wait, text: `⏳ Give it a moment — try again in *${fmtMs(wait)}*.` };
    }
    const rolls = 2 + Math.floor((tier - 1) * 1.2) + (Math.random() < 0.25 ? 1 : 0);
    const found = {};
    let full = false;
    for (let i = 0; i < rolls; i++) {
        const [id, , qmin, qmax] = pick(R.table, tier);
        const qty = qmin + Math.floor(Math.random() * (qmax - qmin + 1));
        const res = await inventorySystem.addItem(userId, id, qty, NEW_ITEMS[id] ? { ...NEW_ITEMS[id] } : {});
        if (res && res.success === false) { full = true; break; }
        found[id] = (found[id] || 0) + qty;
    }
    const zeni = R.zeni[0] + Math.floor(Math.random() * (R.zeni[1] - R.zeni[0] + 1)) * tier;
    let paid = 0;
    try { if (economy.addMoney(userId, zeni, kind === 'fish' ? 'Pond: fishing' : 'Hunting grounds')) paid = zeni; } catch (e) { /* best-effort */ }
    const lines = Object.entries(found).map(([id, q]) => `${q}× ${(NEW_ITEMS[id] || lootSystem.getItemInfo(id)).name}`);
    if (!lines.length) return { ok: false, text: full ? '❌ Your bag is full — sell or store some items first.' : '🌫️ Nothing bit this time.' };
    if (paid) lines.push(`+${paid.toLocaleString()} ZENI`);
    const text = `${R.head}\nYou ${R.verb}…\n\n${lines.map((l) => `• ${l}`).join('\n')}${full ? '\n\n⚠️ Bag full — some of the haul was left behind.' : ''}`;
    return { ok: true, text, banner: { head: R.head.replace(/^[^\w]+/, ''), lines }, drops: found };
}

module.exports = { run, RULES, NEW_ITEMS, fmtMs };
