// ============================================
// 💎 RELICS — session-only rewards (Guild War Overhaul 2026-10-03)
// Relics exist ONLY inside an event: stored on EventPlayer.relics, vanish at
// event end. Carried (not handed-in) relics can be stolen in Ruins PvP.
// Pure helpers here; mutations live in encounters/ruinsPvp via atomic ops.
// ============================================

const CFG = require('./config');

const NAMES = {
    seeker: ['Seeker\u2019s Compass', 'Whisper Vane', 'Relic Lure', 'Divining Shard'],
    blink: ['Blinkstep Idol', 'Rift Pebble', 'Threshold Key', 'Skipstone'],
    ward: ['Iron Ward', 'Aegis Ember', 'Guardian Sigil', 'Bulwark Charm'],
    cross: ['Twinworld Fragment', 'Echo Shard Pair', 'Liminal Bindings'],
    trophy: ['Worldmemory Leaf', 'Core Ember', 'Ruin Heart Splinter'],
};

let _idSeq = 0;
function makeRelic(rng, { category, tier, meta = {} } = {}) {
    const tiers = CFG.RELICS.TIERS;
    const weights = CFG.RELICS.TIER_WEIGHTS;
    const t = tier || rng.weighted(tiers.map((tt, i) => [tt, weights[i]]));
    const cat = category || rng.weighted([['seeker', 4], ['blink', 4], ['ward', 4], ['trophy', 2]]);
    const base = {
        id: `rel_${Date.now().toString(36)}_${(_idSeq++).toString(36)}${Math.floor(rng.next() * 1e4).toString(36)}`,
        name: rng.pick(NAMES[cat] || NAMES.trophy),
        tier: t,
        category: cat,
        charges: cat === 'seeker' || cat === 'blink' ? (cat === 'seeker' ? CFG.RELICS.SEEKER_CHARGES : CFG.RELICS.BLINK_CHARGES) : 0,
        meta,
        acquiredAt: Date.now(),
    };
    if (cat === 'ward') {
        const kind = rng.weighted([['atk', 3], ['def', 3], ['shield', 2], ['flee', 2], ['firststrike', 2]]);
        base.meta = { ...base.meta, kind, fights: CFG.RELICS.WARD_FIGHTS };
    }
    if (cat === 'cross') base.meta = { ...base.meta, piece: rng.pick(['alpha', 'beta']) };
    return base;
}

// tier ordering helpers
const TIER_INDEX = Object.fromEntries(CFG.RELICS.TIERS.map((t, i) => [t, i]));
function tierAtLeast(tier, floor) {
    return (TIER_INDEX[tier] ?? -1) >= (TIER_INDEX[floor] ?? 99);
}
function isStealable(relic) {
    return tierAtLeast(relic.tier, CFG.RELICS.STEALABLE_FROM);
}

// carried relics that expose a player (Rare+)
function exposingRelics(player) {
    return (player.relics || []).filter((r) => CFG.RELICS.CARRY_EXPOSE_TIERS.includes(r.tier));
}

// roll a relic reward for a room (ring scales tier luck: farther = better)
function rollRoomRelic(rng, room) {
    const ringBoost = Math.max(0, (room.ring || 0) - 0.2) * 1.5;
    const shifted = CFG.RELICS.TIER_WEIGHTS.map((w, i) => [CFG.RELICS.TIERS[i], w * (1 + ringBoost * i * 0.35)]);
    return makeRelic(rng, { tier: rng.weighted(shifted) });
}

// hand-in GP (converted to guild points; relic leaves play)
function handinGp(relic) {
    return CFG.RELICS.HANDIN_GP[relic.tier] || 10;
}

// ward effect → combat buff descriptor consumed by guildAdventure/PvP hooks
function wardBuff(relic) {
    const kind = relic.meta?.kind || relic.meta?.get?.('kind');
    switch (kind) {
        case 'atk': return { type: 'attack', value: CFG.RELICS.WARD_ATK, mode: 'mult' };
        case 'def': return { type: 'defense', value: CFG.RELICS.WARD_DEF, mode: 'mult' };
        case 'shield': return { type: 'shield', value: 0.2, mode: 'mult' };
        case 'flee': return { type: 'flee_guarantee', value: 1, mode: 'flag' };
        case 'firststrike': return { type: 'first_strike', value: 1, mode: 'flag' };
        default: return null;
    }
}

module.exports = { makeRelic, rollRoomRelic, handinGp, isStealable, tierAtLeast, exposingRelics, wardBuff, NAMES };
