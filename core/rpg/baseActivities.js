'use strict';
// ===========================================================================
// BASE ACTIVITIES - what you actually DO at the pond and the hunting grounds
// ("first you'll have to make the hunting grounds … fix the
// pond", "connect as much as you can"). `.j base fish` / `.j base hunt`.
// Pure-ish: returns { ok, text, banner } - baseBuilder renders the zoom card.
// Gating: hunt = 25 rides per UTC day (cooldowns.huntDay/Count);
// fish = NO timer at all. State lives on the Base doc so it survives restarts.
// ===========================================================================
const economy = require('./economy');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');

// materials this module introduces (ids are stable; names show in the bag)
const NEW_ITEMS = {
    raw_fish:       { name: 'Pond Minnow',      description: 'A small silver fish from your pond.',           rarity: 'COMMON',   value: 40,   type: 'MATERIAL' },
    river_trout:    { name: 'River Trout',      description: 'A plump trout - good eating.',                  rarity: 'UNCOMMON', value: 140,  type: 'MATERIAL' },
    silver_carp:    { name: 'Silver Carp',      description: 'Scales like coins. Merchants pay well.',        rarity: 'RARE',     value: 480,  type: 'MATERIAL' },
    crystal_koi:    { name: 'Crystal Koi',      description: 'A koi that glows faintly. Prized by alchemists.', rarity: 'EPIC',   value: 1800, type: 'MATERIAL' },
    rabbit_pelt:    { name: 'Rabbit Pelt',      description: 'Soft pelt from a hare.',                        rarity: 'COMMON',   value: 50,   type: 'MATERIAL' },
    venison:        { name: 'Venison Haunch',   description: 'Fresh game meat.',                              rarity: 'UNCOMMON', value: 160,  type: 'MATERIAL' },
    boar_tusk:      { name: 'Boar Tusk',        description: 'A curved tusk - craftsmen love them.',          rarity: 'RARE',     value: 520,  type: 'MATERIAL' },
    stag_antler:    { name: 'Stag Antler',      description: 'Crown of a woodland stag.',                     rarity: 'EPIC',     value: 2000, type: 'MATERIAL' },
};
try { for (const [id, d] of Object.entries(NEW_ITEMS)) if (lootSystem.ITEM_DATABASE && !lootSystem.ITEM_DATABASE[id]) lootSystem.ITEM_DATABASE[id] = d; } catch (e) { /* items degrade to 'Unknown item' */ }

const RULES = {
    fish: {
 // "Remove the timer from the fishing too" -
 // the 4-minute line rest is GONE; the pond is cast-anytime now.
        verb: 'cast your line', head: '🎣 Catch of the day',
 // [itemId, weight by pond level 1..3, qty min, qty max]
        table: [['raw_fish', [60, 45, 30], 1, 3], ['river_trout', [30, 35, 35], 1, 2], ['silver_carp', [9, 16, 22], 1, 1], ['crystal_koi', [1, 4, 13], 1, 1]],
        zeni: [20, 60],
    },
    hunt: {
 // "The .j hunt shouldn't have a timer only a
 // limit per how many times a day" - the 8-minute cooldown is GONE; the
 // hunting party now rides out a fixed number of times per UTC day.
        dailyLimit: 25, verb: 'ride out with the hunting party', head: '🏹 The hunt returns',
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
// UTC calendar day stamp - the hunt limit resets at midnight UTC (1am WAT).
const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
// GIF overlay band for BOTH activities (rarity is only signalled AFTER the
// roll - the overlay painter is chosen by band, never pre-signals it):
// fish: COMMON/UNCOMMON rides quiet, RARE sends a carp close, EPIC brings
// the big koi + splash (dockPov.js).
// hunt: pelt/venison ride quiet, RARE trots a boar through, EPIC steps a
// crowned stag into the clearing + antler glint (huntPov.js).
function bandOf(drops = {}, kind = 'fish') {
    if (kind === 'hunt') {
        if (drops.stag_antler) return 'epic';
        if (drops.boar_tusk) return 'mid';
        return 'low';
    }
    if (drops.crystal_koi) return 'epic';
    if (drops.silver_carp) return 'mid';
    return 'low';
}
// spec §Pond results: the catch line carries item, rarity and sell value.
function itemLine(id, q) {
    const info = (NEW_ITEMS[id] || lootSystem.getItemInfo(id) || {});
    const bits = [info.rarity, info.value ? `sells ${Number(info.value).toLocaleString()}Z` : ''].filter(Boolean);
    return `${q}× ${info.name || id}${bits.length ? ` - ${bits.join(' · ')}` : ''}`;
}

/**
 * run(kind, userId, tier, cd) → { ok, text, banner, drops, dailyUsed?, dailyDay? }
 * tier: pond level (fish) / barracks level (hunt: the hunting party's strength).
 * cd: the Base doc's cooldowns map - hunt keys off cd.huntDay/cd.huntCount
 * (UTC-day counter, Task 19: no timer). Fish has NO gating at all (Task 20:
 * owner removed the timer there too) - cd is only consulted for hunt.
 * Caller persists the day counter on ok (hunt only).
 */
async function run(kind, userId, tier, cd = {}) {
    const R = RULES[kind];
    if (!R) return { ok: false, text: '❌ Unknown activity.' };
    const now = Date.now();
    if (R.dailyLimit) {
        const day = utcDay(now);
        const used = cd.huntDay === day ? (cd.huntCount || 0) : 0;
        if (used >= R.dailyLimit) {
            return { ok: false, dailyUsed: used, dailyDay: day, text: `🏹 The hunting party is spent for today - *${used}/${R.dailyLimit}* hunts used. They rest until midnight UTC, then ride out again.` };
        }
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
    const lines = Object.entries(found).map(([id, q]) => (kind === 'fish' ? itemLine(id, q) : `${q}× ${(NEW_ITEMS[id] || lootSystem.getItemInfo(id)).name}`));
    if (!lines.length) return { ok: false, text: full ? '❌ Your bag is full - sell or store some items first.' : '🌫️ Nothing bit this time.' };
    if (paid) lines.push(`+${paid.toLocaleString()} ZENI`);
    const text = `${R.head}\nYou ${R.verb}…\n\n${lines.map((l) => `• ${l}`).join('\n')}${full ? '\n\n⚠️ Bag full - some of the haul was left behind.' : ''}`;
    const out = { ok: true, text, banner: { head: R.head.replace(/^[^\w]+/, ''), lines }, drops: found };
    if (kind === 'hunt') { out.dailyUsed = (cd.huntDay === utcDay(now) ? (cd.huntCount || 0) : 0) + 1; out.dailyDay = utcDay(now); }
    return out;
}

module.exports = { run, RULES, NEW_ITEMS, fmtMs, bandOf, utcDay, itemLine };
