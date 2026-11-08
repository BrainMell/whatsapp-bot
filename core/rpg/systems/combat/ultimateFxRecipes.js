'use strict';
// Per-class ultimate timelines (redesigned 2026-10-27 from the owner's class-by-class notes).
// classRecipe(classId, palette, {IMPACT}) -> track[] | null (null = use the style recipe).
// classMeta(classId) -> {duration, impact, zoom, flatVeil} for the long cinematics.
//
// Owner rules baked in here:
//   * physical classes NEVER lunge at the target (no dash layer): they cut the target in place
//   * sky lasers / ground cracks are NOT sprinkled on everything - only where the skill calls for them
//   * big skills use shake + camera (zoom / vortex / invert) instead of stacking more particles
//   * every cast darkens everything except the target and zooms in (renderer spotlight)

// ground-plane layers render UNDER the combatants (rings/ripple are perspective-
// flattened shockwave ellipses pinned to fighter feet — engine also force-stamps
// them, see ultimateFx.js; owner 2026-10-28: "flat ring effects are overlaying")
const GROUND_LAYERS = new Set(['world', 'circle', 'rift', 'cracks', 'vortex', 'bgfill', 'eclipse', 'dragon', 'staff', 'rings', 'ripple']);

const META = {
    MAGE: { duration: 3.6, impact: 2.0, zoom: 0.02 },
    DRAGON_GOD: { duration: 4.1, impact: 2.55, zoom: 0.02, flatVeil: true },
    DRAGON_LORD: { duration: 3.5, impact: 1.95, zoom: 0.04 },
    REAPER: { duration: 3.4, impact: 1.75, zoom: 0.03 },
    VIRTUOSO: { duration: 3.3, impact: 1.5, zoom: 0.03, flatVeil: true },
    ARCHMAGE: { duration: 3.3, impact: 1.5, zoom: 0.04 },
    GRAND_INVENTOR: { duration: 3.1, impact: 1.45 },
    TIMELORD: { duration: 3.1, impact: 1.3 },
    LICH: { duration: 3.0, impact: 1.2 },
    DEATH_LORD: { duration: 3.1, impact: 1.5 },
    ELEMENTALIST: { duration: 3.0, impact: 1.25 },
    KAGE: { duration: 3.0, impact: 1.25 },
    VOIDWALKER: { duration: 3.1, impact: 1.3, zoom: 0.12 },
    WARLOCK: { duration: 3.0, impact: 1.3 },
    AVATAR: { duration: 3.1, impact: 1.3 },
};
// ☠️ DEATH ANIMATIONS (owner 2026-11-03): enemies / bosses break apart by TYPE (ultimateFxLayers2 `dissolve`)
// 💡 OWNER FIX round 5 (2026-11-07: "the stone type animation … stops half way through"): the
// dissolve runs impact→impact+1.5s (regular) / impact→impact+2.7s (boss) — 0.4+1.5=1.9 and
// 0.65+2.7=3.35 — but the clip DUR capped at 1.8/3.0, so the crumble was cut 0.1/0.35s before
// the sprite finished breaking apart. Durations now outlast every death track.
const DEATH_KINDS = ['FIRE', 'WATER', 'EARTH', 'VOID', 'ICE', 'DUST'];
for (const k of DEATH_KINDS) { META['DEATH_' + k] = { duration: 2.0, impact: 0.4, zoom: 0 }; META['DEATH_' + k + '_BOSS'] = { duration: 3.5, impact: 0.65, zoom: 0.03 }; }
// ⚔️ #5 (owner work-order 2026-11-07 "the death animation should reflect the attack that actually
// killed the enemy"): basic-attack kills open on the ANIMATED BASIC ATTACK — two wind-up slashes +
// an impact burst + the damage-number glow land on the standing sprite during [0, impact), then the
// same element dissolve takes it apart. Regular gains 0.9s (impact 0.4→1.3), boss 0.9s (0.65→1.55).
const ATK = 0.9;
for (const k of DEATH_KINDS) { META['DEATHATTACK_' + k] = { duration: 2.0 + ATK, impact: 0.4 + ATK, zoom: 0 }; META['DEATHATTACK_' + k + '_BOSS'] = { duration: 3.5 + ATK, impact: 0.65 + ATK, zoom: 0.03 }; }
// 🌌 WORLD-SHIFT (owner 2026-10-28): the big skills open with a cosmic cinematic (zoom-blur out ->
// planet + asteroid -> impact -> the arena becomes another world), then play their normal recipe,
// shifted later by SHIFT seconds. planet:false = warp tunnel into another dimension (shorter).
const WORLD = {
    // arenas are RARE (owner): only the skills that really rewrite the map get one
    ARCHMAGE: { kind: 'void', cin: 'ARCHMAGE', lights: true, keepCaster: true },             // SINGULARITY: a black hole eats reality, the fight is in a void
    // everyone else: a bespoke intro sequence, then back onto the normal field (no new map)
    TIMELORD: { cin: 'TIMELORD' },                                         // fall into a clock, hands spin backwards
    AVATAR: { cin: 'AVATAR' },                                             // four elements spiral into the glowing eye
    DEATH_LORD: { cin: 'DEATH_LORD' },                                     // moon becomes a skull, bone hands rise
    REAPER: { cin: 'REAPER' },                                             // one scythe cut splits the world
    LICH: { cin: 'LICH' },                                                 // frost crystallises the frame
    GRAND_INVENTOR: { cin: 'GRAND_INVENTOR' },                             // blueprint draws itself, becomes metal
    VIRTUOSO: { cin: 'VIRTUOSO' },                                         // curtains open on a stage with the equaliser
    // short (1.4s) bespoke intros for every remaining class - ultimateFxCinema2.js; no arena swap, they dissolve back onto the normal field
    NECROMANCER: { cin: 'NECROMANCER', short: true },
    FIGHTER: { cin: 'FIGHTER', short: true },
    WARRIOR: { cin: 'WARRIOR', short: true },
    SAMURAI: { cin: 'SAMURAI', short: true },
    SHOGUN: { cin: 'SHOGUN', short: true },
    BERSERKER: { cin: 'BERSERKER', short: true },
    SCOUT: { cin: 'SCOUT', short: true },
    ROGUE: { cin: 'ROGUE', short: true },
    NINJA: { cin: 'NINJA', short: true },
    NIGHTBLADE: { cin: 'NIGHTBLADE', short: true },
    APPRENTICE: { cin: 'APPRENTICE', short: true },
    DOOMSLAYER: { cin: 'DOOMSLAYER', short: true },
    WARLORD: { cin: 'WARLORD', short: true },
    CHRONOMANCER: { cin: 'CHRONOMANCER', short: true },
    ARTIFICER: { cin: 'ARTIFICER', short: true },
    BARD: { cin: 'BARD', short: true },
    ACOLYTE: { cin: 'ACOLYTE', short: true },
    PALADIN: { cin: 'PALADIN', short: true },
    CLERIC: { cin: 'CLERIC', short: true },
    SAINT: { cin: 'SAINT', short: true },
    MONK: { cin: 'MONK', short: true },
    ZENMASTER: { cin: 'ZENMASTER', short: true },
    TEMPLAR: { cin: 'TEMPLAR', short: true },
    DIVINE_FIST: { cin: 'DIVINE_FIST', short: true },
    DRUID: { cin: 'DRUID', short: true },
    ARCHDRUID: { cin: 'ARCHDRUID', short: true },
    MERCHANT: { cin: 'MERCHANT', short: true },
    TYCOON: { cin: 'TYCOON', short: true },
};
const shiftOf = (cls) => (WORLD[cls] ? (WORLD[cls].short ? 1.3 : (WORLD[cls].cin ? 2.0 : 1.9)) : 0);
function classMeta(cls) {
    const S = shiftOf(cls), m = META[cls] || (S ? {} : null); if (!m) return null;
    return S ? { ...m, duration: (m.duration || 2.7) + S, impact: (m.impact || 1.05) + S } : m;
}

// where the REAL dragon_6.png jaws are (measured from the sprite's alpha: snout = 46.5% of the draw width
// right of the head centre, 9.7% of the draw height ABOVE it) - the breath must leave THIS point
// (owner 2026-11-02: "the dragon flies over then the player shoots flames - there should be a connection")
const dragonMouth = (S) => { const w = 235 * S, h = w * 268 / 228; return [Math.round(0.465 * w), -Math.round(0.097 * h)]; };

function classRecipeBase(cls, p, { IMPACT: I }) {
    const L = (layer, o) => ({ layer, under: GROUND_LAYERS.has(layer), ...o });
    const flash = (c, a = 0.5, at = I, dur = 0.22) => L('wash', { at, dur, color: c, a, add: true });
    const dark = (a = 0.45, at = 0.1, dur = I + 0.4) => L('wash', { at, dur, color: '#05000c', a });
    const casterAura = (col, n = 12) => L('emit', { at: 0.05, dur: 0.8, pos: 'C', box: [60, 20], n, life: 0.6, shape: 'spark', colors: ['#fff', col], v: [0, -80], vr: [50, 30] });

    // 💥 WEIGHT (owner 2026-11-02: "the ninja one doesn't have any weight, the punch feels like random slash effects"):
    // what a heavy hit LOOKS like in the world - a ground shockwave ring + dust kicked up off the floor + a
    // flat sonic ring on the target, all landing on the same frame as the cut/strike.
    function weight(col, at, k = 1) {
        return [
            { fx: 'k_sonic', at, pos: 'T', w: 250 * k, add: true, tint: [col, 0.45], spread: 'enemies', fanGap: 0.06 },
            L('ripple', { at: at + 0.01, pos: 'T', n: 2, gap: 0.07, color: col, r: 150 * k, spread: 'enemies', fanGap: 0.06 }),
            L('emit', { at, dur: 0.55, pos: 'T', off: [0, 40], box: [60 * k, 12], n: Math.round(20 * k), life: 0.6, shape: 'spark', colors: ['#e8dcc0', '#bfae8a', col], v: [0, -150 * k], vr: [210 * k, 60], g: 380 }),
        ];
    }
    // a PUNCH: the caster closes, then fist-sized impacts land ON the target - each blow bigger than the last
    // (burst + sonic + dust + a pop of white), the last one cracks the ground. No slash sprites.
    function blows({ col, mid = '#ffffff', n = 3, gap = 0.15, extra = [], scatter = 22, vy = 0 }) {
        const out = [casterAura(col), L('lunge', { at: I - 0.32, dur: 0.6, color: col })];
        for (let i = 0; i < n; i++) {
            const at = I + i * gap, k = 0.8 + i * 0.4;
            out.push({ fx: 'white_burst', at, pos: 'T', off: [(scatter > 30 ? (((i * 37) % 11) - 5) / 5 * scatter : (i % 2 ? scatter : -scatter)), -40 + i * 6 + (vy ? (((i * 53) % 9) - 4) / 4 * vy : 0)], w: 130 + i * 70, add: true, tint: [col, 0.55], alpha: 0.85, spread: 'enemies', fanGap: 0.06 });
            out.push(...weight(col, at, k));
            out.push(flash(mid, 0.22 + i * 0.08, at, 0.09));
        }
        out.push(L('cracks', { at: I + (n - 1) * gap, pos: 'T', off: [45, 0], n: 9, r: 120, color: col, dur: 0.9 }));
        out.push(L('engulf', { at: I + (n - 1) * gap, pos: 'T', color: col, mid: '#ffffff', r: 430, dur: 0.5, grow: 0.3, a: 0.6 }));
        out.push(L('engulf', { at: I + (n - 1) * gap, pos: 'T', color: col, mid: '#ffffff', r: 430, dur: 0.5, grow: 0.3, a: 0.6 }));
        out.push(...extra);
        return out;
    }
    // ── physical: cuts happen ON the target, the caster stays put ──────────
    function cutSet({ col, mid = '#ffffff', angles, n, len = 150, w = 11, gap = 0.075, burst = true, sprite = 'claw', extra = [] }) {
        return [
            casterAura(col),
            L('lunge', { at: I - 0.32, dur: 0.6, color: col }),
            L('slashes', { at: I - 0.02, n, gap, color: col, mid, len, w, angles }),
            ...(sprite ? [{ fx: sprite, at: I + 0.02, pos: 'T', w: 270, n: 2, jit: [40, 35], gap: 0.1, rot: [-0.5, 0.4], tint: [col, 0.4] }] : []),
            ...(burst ? [L('slashes', { at: I + n * gap - 0.03, n: 6, gap: 0.01, kind: 'burst', color: col, mid, len: 80 })] : []),
            ...extra,
            { fx: 'white_burst', at: I + n * gap - 0.02, pos: 'T', w: 150, add: true, tint: [col, 0.6], alpha: 0.7 },
            ...weight(col, I + n * gap - 0.02, 0.9),
            flash('#ffffff', 0.25, I + n * gap - 0.04, 0.12),
        ];
    }
    function eclipseCuts(col, mid, hits, I2) {
        return [
            dark(0.5),
            L('lunge', { at: I2 - 0.32, dur: 0.6, color: col }),
            L('eclipse', { at: 0.15, pos: 'T', r: 88, dur: I2 + 0.6, color: col, mid }),
            L('slashes', { at: I2 - 0.02, n: hits, gap: 0.07, color: col, mid, len: 200, w: 12, angles: [-0.9, 0.9, 0.0, -0.45, 1.3, 1.57, 0.5] }),
            L('slashes', { at: I2 + hits * 0.07 - 0.03, n: 12, gap: 0.01, kind: 'burst', color: col, mid, len: 150 }),
            { fx: 'dark_a', at: I2, pos: 'T', w: 240, n: 2, gap: 0.12, jit: [30, 20], add: true, tint: [col, 0.6] },
            ...weight(col, I2 + hits * 0.07 - 0.02, 1.15),
            flash(col, 0.4, I2 + hits * 0.07 - 0.04, 0.16),
        ];
    }
    function meteorFall(big, small, size, landW, col) {
        return [
            L('circle', { at: 0.05, pos: 'C', r: 60, dur: 1, color: col }),
            ...(small ? [L('fall', { at: I - 0.42, pos: 'T', kind: 'meteor', n: small, gap: 0.09, fall: 0.34, spreadX: 260, spreadY: 90, land: 'k_regular', landW: 110, color: col })] : []),
            L('fall', { at: I - 0.34, pos: 'T', kind: 'rock', n: 1, fall: 0.34, spreadX: 0, spreadY: 0, slant: -120, size, land: 'k_regular', landW, color: col }),
            L('rings', { at: I + 0.02, pos: 'T', n: 2, gap: 0.12, color: col, r: landW * 0.8 }),
            flash('#ffd28a', 0.4, I, 0.2),
        ];
    }
    function holyBeam(k) {
        return [
            L('circle', { at: 0.1, pos: 'T', r: 100 * k, dur: 1.6, color: '#ffe27a', points: 6, spin: 1.2 }),
            L('pillar', { at: I - 0.2, pos: 'T', w: 110 * k, dur: 0.8, color: '#ffe27a', mid: '#fff6c8', spread: 'enemies', fanGap: 0.09 }),
            { fx: 'holy_pillar', at: I - 0.2, pos: 'T', w: 280, off: [0, -120], n: 3, jit: [90, 0], gap: 0.08, spread: 'enemies', fanGap: 0.08 },
            { fx: 'holy_burst', at: I, pos: 'T', w: 380, add: true, spread: 'enemies', fanGap: 0.08 },
            L('emit', { at: I, dur: 0.9, pos: 'T', box: [120, 40], n: 22, life: 1, shape: 'star', colors: ['#fff2b0', '#ffffff'], v: [0, -60], vr: [50, 20] }),
            L('engulf', { at: I + 0.02, pos: 'T', color: '#ffe27a', mid: '#fff6c8', dur: 1.0, grow: 0.45 }),
            flash('#fff6d0', 0.5),
        ];
    }
    // self buffs: everything happens AROUND the caster (no dash, no wrong-way lunge)
    function auraSelf(col, k, extra = []) {
        return [
            L('emit', { at: 0.2, dur: 1.2, pos: 'C', box: [90, 30], n: 26, life: 1, shape: 'star', colors: [col, '#ffffff'], v: [0, -70], vr: [40, 20] }),
            L('rings', { at: I - 0.1, pos: 'C', n: 3, gap: 0.1, color: col, r: 150 * k }),
            ...extra,
            flash('#ffffff', 0.4, I, 0.2),
        ];
    }
    function natureSet(n) {
        return [
            L('emit', { at: 0.05, dur: 1.2, pos: 'C', box: [100, 30], n: 22, life: 1, shape: 'leaf', colors: ['#6bd44a', '#a8ff7a', '#3f9a2c'], v: [30, -50], vr: [30, 20], size: 6, swirl: 4 }),
            L('circle', { at: 0.1, pos: 'T', r: 100, dur: 1.5, color: '#8aff6a', points: 5 }),
            L('vines', { at: I - 0.3, pos: 'T', n, cross: true, dur: 1.6, color: '#3fa82a', spread: 'enemies', fanGap: 0.08 }),
            { fx: 'vine_slash', at: I + 0.1, pos: 'T', w: 300, n: 3, jit: [60, 40], gap: 0.1, rot: [-0.5, 0.4, 0.8], spread: 'enemies', fanGap: 0.08 },
            L('emit', { at: I, dur: 0.8, pos: 'T', box: [100, 30], n: 20, life: 1, shape: 'leaf', colors: ['#6bd44a', '#a8ff7a'], v: [0, -90], vr: [70, 30], size: 6, swirl: 5 }),
            flash('#d4ffb0', 0.35),
        ];
    }
    function coins(n, ringsCol) {
        return [
            L('emit', { at: 0.05, dur: 0.9, pos: 'C', box: [90, 20], n: 12, life: 0.8, shape: 'coin', v: [0, -90], vr: [40, 30], g: 220, size: 6 }),
            L('swarm', { at: I - 0.85, pos: 'T', kind: 'coin', n, orbit: 0.55, dur: 0.6, pass: 0.22, rad: 125, size: 9, color: '#ffd24a', spread: 'enemies', fanGap: 0.05 }),
            L('slashes', { at: I - 0.02, n: 12, gap: 0.035, color: '#ffd24a', mid: '#fff6b0', len: 150, w: 7, jit: [34, 40] }),
            L('emit', { at: I, dur: 0.9, pos: 'T', box: [120, 30], n: 22, life: 1, shape: 'coin', v: [0, -150], vr: [90, 40], g: 380, size: 6 }),
            { fx: 'white_burst', at: I + 0.35, pos: 'T', w: 260, add: true, tint: ['#ffd24a', 0.7], spread: 'enemies', fanGap: 0.08 },
            ...(ringsCol ? [L('rings', { at: I + 0.3, pos: 'T', n: 3, gap: 0.12, color: ringsCol, r: 190 })] : []),
            flash('#fff0b0', 0.35, I + 0.3, 0.16),
        ];
    }
    function stopTimeSet(col, r) {
        // ⏳ ROUND 2 (owner 2026-10-27: "the time stop should again have a gaint magic clock
        // fade in adn out and place the time freeze effect"): the giant REAL clock face
        // (ticking 12-frame loop) + cosmic mandala halo fades IN over the victim, the icy
        // sustain wash freezes them, a contracting ripple snaps at the impact, and the
        // clock fades OUT. The turn cards stay dimmed while Locked in Time is active
        // (combatIntegration.applyTimeFreezeDim) — the video is only the cast moment.
        return [
            L('wash', { at: 0.04, dur: I + 0.35, color: '#0a1226', a: 0.4 }),
            L('magicClock', { at: 0.06, dur: I + 0.62, pos: 'T', off: [0, -150], r: 232, color: col }),
            L('affect', { at: 0.06, dur: I - 0.04, curve: 'sustain', a: 0.7, add: true }),
            L('emit', { at: 0.1, dur: I - 0.08, pos: 'T', off: [0, -140], box: [180, 120], n: 28, life: 0.8, shape: 'star', colors: [col, '#dff4ff', '#ffffff'], v: [0, -20], vr: [44, 28], swirl: 2.5 }),
            L('ripple', { at: I - 0.05, pos: 'T', n: 3, gap: 0.12, color: '#bfe8ff', r: 200, inward: true, dur: 0.5 }),
            L('affect', { at: I + 0.02, dur: 0.95, curve: 'hold', a: 0.75, add: true }),
            L('emit', { at: I + 0.02, dur: 0.7, pos: 'T', box: [130, 60], n: 18, life: 0.7, shape: 'star', colors: ['#ffffff', col], v: [0, -60], vr: [60, 30] }),
            flash(col, 0.35),
        ];
    }
    // ☠️ death sets: the sprite itself is broken up by LAYERS.dissolve; these are the element's world effects around it
    function deathSet(kind, boss) {
        const k = boss ? 1.6 : 1, pre = I, dis = (mode, ex = {}) => L('dissolve', { at: 0, mode, pre, dur: boss ? 2.7 : 1.5, boom: k, cells: boss ? 700 : 340, ...ex });
        const cam = boss ? [L('camera', { at: pre, dur: 1.3, dz: 0.04 })] : [];
        if (kind === 'FIRE') return [dis('fire'), L('wash', { at: pre * 0.3, dur: pre, color: '#ff7a1a', a: 0.2, add: true }),
            { fx: 'fire_blast', at: pre, pos: 'T', off: [0, -45], w: 300 * k, n: boss ? 3 : 2, jit: [40, 30], gap: 0.1, add: true },
            { fx: 'fire_bomb', at: pre + 0.05, pos: 'T', off: [0, -35], w: 240 * k, add: true, alpha: 0.85 },
            L('rings', { at: pre, pos: 'T', n: 2, gap: 0.1, color: '#ff8a2a', r: 150 * k }),
            L('emit', { at: pre, dur: 1.3, pos: 'T', off: [0, -45], box: [60 * k, 60 * k], n: Math.round(44 * k), life: 1.1, shape: 'spark', colors: ['#fff2b0', '#ff7a1a', '#5a2a18'], v: [0, -130], vr: [170 * k, 80], g: -50 }),
            flash('#ffb05a', 0.32, pre, 0.16), ...cam];
        if (kind === 'WATER') return [dis('water'), L('wash', { at: pre * 0.3, dur: pre, color: '#2a7ad0', a: 0.16, add: true }),
            { fx: 'k_sonic', at: pre + 0.2, pos: 'T', off: [0, 8], w: 250 * k, add: true, tint: ['#6cc0ff', 0.6] },
            L('ripple', { at: pre + 0.15, pos: 'T', n: 3, gap: 0.1, color: '#9bd8ff', r: 170 * k }),
            { fx: 'k_puff', at: pre + 0.15, pos: 'T', off: [0, -10], w: 230 * k, add: true, tint: ['#9bd8ff', 0.5] },
            L('emit', { at: pre + 0.1, dur: 1.0, pos: 'T', off: [0, -25], box: [80 * k, 40], n: Math.round(34 * k), life: 0.9, shape: 'glow', colors: ['#bfe6ff', '#ffffff', '#6cb8ff'], v: [0, -180], vr: [160 * k, 60], g: 520, size: 4 }),
            flash('#bfe6ff', 0.25, pre + 0.15, 0.14), ...cam];
        if (kind === 'EARTH') return [dis('earth'),
            { fx: 'k_ground', at: pre, pos: 'T', off: [0, 5], w: 300 * k },
            { fx: 'k_puff', at: pre + 0.3, pos: 'T', off: [0, -10], w: 300 * k, n: boss ? 3 : 2, jit: [50, 10], gap: 0.12, tint: ['#a08a68', 0.7] },
            L('cracks', { at: pre + 0.25, pos: 'T', n: 7, r: 130 * k, color: '#c9a060', dur: 1.0 }),
            L('emit', { at: pre + 0.2, dur: 1.4, pos: 'T', off: [0, -10], box: [90 * k, 30], n: Math.round(40 * k), life: 1.2, shape: 'glow', colors: ['#b9a27a', '#8a7458', '#d8c8a0'], v: [0, -60], vr: [60 * k, 30], g: -10, size: 5 }), ...cam];
        if (kind === 'VOID') return [dis('void'), L('wash', { at: 0.05, dur: pre + 1.4, color: '#0a0016', a: 0.3 }),
            L('ripple', { at: pre, pos: 'T', n: 4, gap: 0.12, color: '#a56bff', r: 200 * k, inward: true, dur: 0.7 }),
            L('swarm', { at: pre, pos: 'T', kind: 'soul', n: Math.round(24 * k), inward: true, dur: 0.9, pass: 0.3, from: 220 * k, size: 6, color: '#c8a0ff' }),
            { fx: 'k_flash', at: pre + (boss ? 1.25 : 0.95), pos: 'T', off: [0, -45], w: 220 * k, add: true, tint: ['#a56bff', 0.7] },
            L('rings', { at: pre + (boss ? 1.25 : 0.95), pos: 'T', n: 3, gap: 0.08, color: '#e6d4ff', r: 200 * k }),
            flash('#e6d4ff', 0.4, pre + (boss ? 1.25 : 0.95), 0.18), ...cam];
        if (kind === 'ICE') return [dis('ice'), { fx: 'white_burst', at: pre + 0.05, pos: 'T', off: [0, -40], w: 260 * k, add: true, tint: ['#cfeaff', 0.8] },
            L('rings', { at: pre, pos: 'T', n: 2, gap: 0.1, color: '#cfeaff', r: 150 * k }),
            L('emit', { at: pre, dur: 1.0, pos: 'T', off: [0, -40], box: [60 * k, 60 * k], n: Math.round(36 * k), life: 1.0, shape: 'star', colors: ['#ffffff', '#bfe6ff'], v: [0, -80], vr: [140 * k, 80], g: 300 }),
            flash('#e6f6ff', 0.3, pre, 0.14), ...cam];
        return [dis('dust'), { fx: 'k_puff', at: pre + 0.05, pos: 'T', off: [0, -30], w: 240 * k, n: 2, jit: [30, 20], gap: 0.1, tint: ['#d8d0c0', 0.6] },
            L('emit', { at: pre, dur: 1.0, pos: 'T', off: [0, -30], box: [60 * k, 60 * k], n: Math.round(26 * k), life: 1.0, shape: 'glow', colors: ['#e8e0d0', '#b8b0a0'], v: [0, -50], vr: [100 * k, 50], size: 4 }), ...cam];
    }
    // ⚔️ #5: the SAME element death, opened by the animated basic attack — the killing blow
    // (two fast slashes + impact sparks + a white hit-wash) lands on the standing sprite during
    // [0.05, I) — for DEATHATTACK_* recipes I (IMPACT from META) is 1.3 regular / 1.55 boss, so
    // there is room — then the element dissolve takes the sprite apart exactly as before.
    function deathAttackSet(kind, boss) {
        // ⚔️ 2026-11-08: the multi-claw 'slashes' intro is GONE (owner: "made a new weird attack instead of building on the basic attack").
        // The intro window is kept as dead air here — deathOverlay paints the REAL basic-attack animation (hitFx.drawStrikeAnim,
        // same variant/colour as the static card) onto those first frames, so the death opens on the attack that actually killed it.
        const intro = [];
        return [...intro, ...deathSet(kind, boss)];
    }
    const R = {
        ...Object.fromEntries(DEATH_KINDS.flatMap((dk) => [['DEATH_' + dk, () => deathSet(dk, false)], ['DEATH_' + dk + '_BOSS', () => deathSet(dk, true)],
          ['DEATHATTACK_' + dk, () => deathAttackSet(dk, false)], ['DEATHATTACK_' + dk + '_BOSS', () => deathAttackSet(dk, true)]].map(([key, fn]) => [key, fn]))),
        // ── dark arts ──────────────────────────────────────────────────────
        NECROMANCER: () => [
            dark(0.5),
            L('circle', { at: 0.05, pos: 'C', r: 80, dur: 1.4, color: '#9be88a', points: 5 }),
            L('emit', { at: 0.1, dur: 0.9, pos: 'C', box: [90, 20], n: 18, life: 0.8, shape: 'soul', colors: ['#9be88a', '#c8ffc0'], v: [0, -70], vr: [20, 20], swirl: 6 }),
            L('rift', { at: 0.35, pos: 'T', rx: 82, dur: 1.75, color: 'rgba(120,255,140,0.35)', lip: '#8dff9c' }),
            L('hands', { at: 0.45, pos: 'T', n: 6, dur: 1.75, sink: true, grab: 0.8, sinkEnd: 1.35, glow: '#8dff9c' }),
            L('bgfill', { at: 1.25, dur: I + 0.8 - 1.25, pos: [0.5, 0.5], colors: ['#16401f', '#020805'], fin: 0.35, fout: 0.4 }),
            L('emit', { at: 1.3, dur: I - 1.2, pos: [0.5, 0.5], box: [560, 300], n: 36, life: 1.2, shape: 'soul', colors: ['#9be88a', '#c8ffc0'], v: [0, -40], vr: [30, 30], swirl: 4 }),
            L('emit', { at: I + 0.15, dur: 0.8, pos: 'T', box: [80, 20], n: 20, life: 0.9, shape: 'soul', colors: ['#9be88a', '#ffffff'], v: [0, -90], vr: [30, 20], swirl: 5 }),
            { fx: 'necro3', at: I + 0.1, pos: 'T', w: 260, off: [0, 20], add: true, alpha: 0.9 },
            flash('#b7ffb0', 0.35),
        ],
        // little souls rush in from every direction and strike the enemy
        // LICH (owner 2026-11-03): the frozen frame crumbles like glass, the cast zooms out until everyone is small, then the nova
        LICH: () => [
            dark(0.5, 0.1, I + 0.9),
            L('circle', { at: 0.05, pos: 'C', r: 95, dur: 1.4, color: '#7dffe0', points: 6, spin: 2 }),
            L('crumble', { at: 0.1, dur: 1.5, pos: 'T', color: '#bfe8ff', hold: 0.3 }),
            L('shrink', { at: 0.5, dur: 0.7, to: 0.45 }),
            L('swarm', { at: 0.9, pos: 'T', kind: 'soul', n: 34, inward: true, dur: 0.6, pass: 0.3, from: 360, size: 8, color: '#7dffe0', spread: 'enemies', fanGap: 0.05 }),
            L('engulf', { at: I - 0.02, pos: 'T', color: '#7dffe0', mid: '#e6fffb', dur: 1.0, grow: 0.35, a: 0.85 }),
            L('rings', { at: I + 0.02, pos: 'T', n: 4, gap: 0.1, color: '#7dffe0', r: 220 }),
            ...weight('#7dffe0', I, 1.3),
            L('emit', { at: I, dur: 0.9, pos: 'T', n: 30, life: 1, shape: 'soul', colors: ['#7dffe0', '#ffffff'], v: [0, -80], vr: [120, 60], swirl: 4 }),
            flash('#9dfff0', 0.45, I, 0.2),
        ],
        // a chain of souls binds the target to the caster
        DEATH_LORD: () => [
            dark(0.55),
            L('circle', { at: 0.05, pos: 'C', r: 85, dur: 1.5, color: '#c43bff', points: 5 }),
            L('rift', { at: 0.3, pos: 'T', rx: 70, dur: 1.9, color: 'rgba(120,0,160,0.4)', lip: '#d36bff' }),
            L('tether', { at: 0.4, dur: 1.8, color: '#c43bff' }),
            L('focus', { at: 1.2, dur: 1.2, mode: 'drain', hit: I }),
            L('emit', { at: I, dur: 1.0, pos: 'T', box: [70, 40], n: 22, life: 0.9, shape: 'soul', colors: ['#e9c8ff', '#c43bff'], v: [-70, -40], vr: [30, 30] }),
            L('pillar', { at: I - 0.1, pos: 'T', w: 110, dur: 0.8, color: '#c43bff', mid: '#f0d0ff', spread: 'enemies', fanGap: 0.09 }),
            { fx: 'dark_a', at: I, pos: 'T', w: 240, n: 2, gap: 0.12, jit: [30, 20], add: true, tint: ['#c43bff', 0.6] },
            ...weight('#c43bff', I, 1.2),
            flash('#d79bff', 0.4),
        ],
        // the world implodes into a dot; the caster is gone; a GIANT REAL scythe cuts through
        // (owner round 2: "should be a real syth ... doesn't zoom out enough I want um to
        // became tiny and a gaint syth hits") — the roster shrinks to ~0.45 as the vortex
        // pulls, then the Wenrexa dark scythe (CC0, purple-tinted) sweeps the whole stage.
        // REAPER (owner 2026-11-03: "rethinking the scythe"): no scythe art - one reaping stroke splits the whole shrunken world, souls pour out
        REAPER: () => [
            dark(0.45, 0.1, 1.6),
            L('vortex', { at: 0.1, pos: 'T', hy: 40, R: 600, twist: 9, pull: 4.2, hole: 5, rim: '#a58bff', dur: 1.15, inFrac: 0.7, outFrom: 0.9 }),
            L('camera', { at: 1.0, dur: 0.7, dz: -0.09 }),
            L('shrink', { at: 0.95, dur: 0.55, to: 0.45 }),
            L('emit', { at: 0.2, dur: 0.8, pos: 'T', box: [200, 100], n: 24, life: 0.9, shape: 'soul', colors: ['#c5b3ff'], v: [0, -30], vr: [60, 40], swirl: 5 }),
            L('splitcut', { at: I - 0.1, dur: 1.5, pos: 'T', ang: -0.7, color: '#a58bff', open: 190, draw: 0.18, void: '#08041a' }),
            L('emit', { at: I + 0.1, dur: 1.2, pos: 'T', box: [160, 160], n: 36, life: 1.1, shape: 'soul', colors: ['#c5b3ff', '#ffffff'], v: [0, -110], vr: [60, 40] }),
            ...weight('#a58bff', I + 0.1, 1.2),
            flash('#c5b3ff', 0.4, I + 0.1, 0.2),
        ],
        // a soul tears out of the target and flows into the warlock (heal)
        // WARLOCK (owner 2026-11-03: starter was bad): no cinematic - a blood-red night, a huge sigil burns under the target, the soul is torn out
        WARLOCK: () => [
            L('wash', { at: 0.05, dur: I + 0.7, color: '#2a0010', a: 0.55 }),
            L('circle', { at: 0.1, pos: 'T', r: 150, dur: 1.9, color: '#e0287a', points: 5, spin: 1.2 }),
            L('rift', { at: 0.3, pos: 'T', rx: 80, dur: 1.4, color: 'rgba(200,40,100,0.45)', lip: '#ff6aa8' }),
            L('emit', { at: 0.3, dur: 0.8, pos: 'T', box: [70, 30], n: 14, life: 0.8, shape: 'soul', colors: ['#ff9ac8', '#ffffff'], v: [0, -70], vr: [30, 20], swirl: 5 }),
            L('focus', { at: 0.6, dur: 1.0, mode: 'drain', hit: I }),
            L('soulflow', { at: I - 0.15, dur: 0.85, color: '#8dff9c' }),
            { fx: 'dark_b', at: I - 0.1, pos: 'T', w: 320, n: 2, gap: 0.12, jit: [30, 20], alpha: 0.9, tint: ['#e0287a', 0.4] },
            L('engulf', { at: I + 0.05, pos: 'T', color: '#e0287a', mid: '#ffd0e6', dur: 0.9, grow: 0.4, a: 0.7 }),
            flash('#ff9ac8', 0.35, I - 0.05, 0.2),
        ],
        // the background fades to a stage, music is everywhere
        VIRTUOSO: () => [
            L('bgfill', { at: 0.1, dur: 2.6, pos: [0.5, 0.45], colors: ['#3a1a5e', '#0b0418'], fin: 0.5, fout: 0.5 }),
            L('camera', { at: 0.5, dur: 1.2, dz: -0.1 }),
            L('staff', { at: 0.35, dur: 2.2, color: '#d9b3ff', color2: '#ff9ad5' }),
            L('emit', { at: 0.2, dur: 1.8, pos: [0.5, 0.5], box: [560, 300], n: 46, life: 1.2, shape: 'note', colors: ['#d9b3ff', '#ff9ad5', '#ffe27a'], v: [0, -50], vr: [60, 40], size: 7, swirl: 2 }),
            L('rings', { at: I - 0.3, pos: 'C', n: 3, gap: 0.14, color: '#d9b3ff', r: 130 }),
            L('rings', { at: I, pos: 'T', n: 4, gap: 0.1, color: '#ff9ad5', r: 190 }),
            { fx: 'dark_a', at: I, pos: 'T', w: 260, n: 2, gap: 0.12, jit: [40, 20], add: true },
            flash('#e6c4ff', 0.35),
        ],
        // ── blades: cut ON the target ──────────────────────────────────────
        FIGHTER: () => blows({ col: '#bcd6ff', n: 3 }),
        WARRIOR: () => blows({ col: '#ffb070', mid: '#fff0d8', n: 4, gap: 0.12 }),
        // 🗡️ SAMURAI (owner 2026-11-02): the intro draws ONE white line across the sun - the strike keeps it: the caster
        // is already past, the line hangs across the target for a beat, THEN the world catches up and the cut lands
        // SAMURAI (owner 2026-11-03): the intro's slash, many times across the canvas - each cut slices the world off - then the same to the enemy
        SAMURAI: () => [
            casterAura('#9fd0ff'),
            dark(0.35, 0.1, I + 1.3),
            L('lunge', { at: I - 0.32, dur: 0.6, color: '#9fd0ff' }),
            L('splitcut', { at: I - 0.02, dur: 1.15, pos: 'C', ang: -0.22, color: '#9fd0ff', open: 130, draw: 0.14 }),
            L('slashes', { at: I + 0.55, n: 7, gap: 0.06, color: '#ffffff', mid: '#ffffff', len: 300, w: 12, angles: [-0.22, 0.4, -0.7, 0.1, 0.9, -0.45, 1.5] }),
            L('slashes', { at: I + 1.0, n: 14, gap: 0.006, kind: 'burst', color: '#9fd0ff', mid: '#ffffff', len: 150 }),
            ...weight('#9fd0ff', I + 1.0, 1.3),
            flash('#ffffff', 0.5, I + 1.0, 0.16),
        ],
        SHOGUN: () => [dark(0.35), ...cutSet({ col: '#ffd27a', mid: '#fff0c0', angles: [-0.7, 0.7, 0.0, 1.57, -1.2], n: 5, len: 190, w: 14, extra: [L('ripple', { at: I + 0.3, pos: 'T', n: 3, gap: 0.12, color: '#ffd27a', r: 200 })] })],
        // BERSERKER (owner 2026-11-03): not one dash punch - a side-on one-punch-man / JoJo barrage, dozens of fists landing at once
        BERSERKER: () => [
            L('wash', { at: 0.1, dur: I + 0.9, color: '#3a0000', a: 0.35 }),
            L('emit', { at: 0.05, dur: 0.9, pos: 'C', box: [60, 20], n: 24, life: 0.6, shape: 'spark', colors: ['#ff7a2a', '#ffd27a'], v: [0, -120], vr: [60, 30] }),
            L('camera', { at: I - 0.1, dur: 1.0, dz: 0.06 }),
            ...blows({ col: '#ff4a2a', mid: '#ffd8a0', n: 16, gap: 0.04, scatter: 90, vy: 60 }),
        ],
        // assassinate volley — R3 rework (owner 2026-10-27 "Assassinate doesn't
        // animated"): the old arrow rain had no veil/spotlight and 14 thin
        // arrows on a bright field — the impact read as an empty scene on a
        // phone. Now every other-ult standard applies: dim veil + caster aura,
        // aim rings lock the victim, TWO glowing volleys, burst slashes +
        // claw hit + triple rings + hard flash at the kill.
        SCOUT: () => [
            dark(0.5, 0.08, I + 0.55),
            casterAura('#c9ffa8', 14),
            L('emit', { at: 0.1, dur: 0.7, pos: 'C', n: 14, life: 0.5, shape: 'spark', colors: ['#c9ffa8', '#ffffff'], v: [60, -50], vr: [30, 20] }),
            L('rings', { at: 0.35, pos: 'T', n: 2, color: '#e8ffbf', r: 90 }),
            L('fall', { at: I - 0.4, pos: 'T', kind: 'arrow', n: 22, gap: 0.04, fall: 0.28, slant: -110, spreadX: 230, spreadY: 90, color: '#fff7cf', land: 'k_simple', landW: 84, landAdd: true, spread: 'enemies', fanGap: 0.05 }),
            L('fall', { at: I - 0.18, pos: 'T', kind: 'arrow', n: 12, gap: 0.05, fall: 0.24, slant: -95, spreadX: 150, spreadY: 70, color: '#ffe9a0', land: 'k_regular', landW: 110, landAdd: true, spread: 'enemies', fanGap: 0.06 }),
            L('slashes', { at: I + 0.05, n: 10, gap: 0.01, kind: 'burst', color: '#d9ffb0', mid: '#ffffff', len: 160 }),
            { fx: 'claw', at: I + 0.18, pos: 'T', w: 250, n: 2, jit: [26, 18], gap: 0.08, rot: [-0.5, 0.5], tint: ['#c9ffa8', 0.75] },
            L('rings', { at: I + 0.25, pos: 'T', n: 3, color: '#e8ffbf', r: 130 }),
            flash('#fff3c4', 0.5, I + 0.28, 0.16),
        ],
        // rogue: two quick stabs and a critical pop (no lunge)
        ROGUE: () => [
            L('lunge', { at: I - 0.32, dur: 0.6, color: '#9d86ff' }),
            L('slashes', { at: I - 0.02, n: 2, gap: 0.12, kind: 'stab', color: '#9d86ff', mid: '#e6dcff', len: 150, w: 10, angles: [-0.35, 0.3], jit: [14, 20] }),
            L('slashes', { at: I + 0.22, n: 16, gap: 0.008, kind: 'burst', color: '#b9a6ff', mid: '#ffffff', len: 170 }),
            { fx: 'claw', at: I + 0.2, pos: 'T', w: 270, n: 2, jit: [30, 20], gap: 0.08, rot: [-0.6, 0.6], tint: ['#9d86ff', 0.8] },
            flash('#c9bcff', 0.45, I + 0.2, 0.14),
        ],
        // ninja / nightblade: an eclipse behind the target, shadow cuts
        // NINJA (owner 2026-11-03): one pass edge to edge - the whole canvas, enemy included, is a wall that is cut in half and comes apart
        NINJA: () => [
            casterAura('#6fe0ff'),
            dark(0.4, 0.1, I + 1.3),
            L('splitcut', { at: I, dur: 1.3, pos: 'T', ang: -0.12, color: '#6fe0ff', open: 170, draw: 0.12 }),
            L('slashes', { at: I + 0.1, n: 10, gap: 0.01, kind: 'burst', color: '#6fe0ff', mid: '#ffffff', len: 190 }),
            ...weight('#6fe0ff', I + 0.12, 1.4),
            L('emit', { at: I + 0.15, dur: 1.0, pos: 'T', off: [0, -30], box: [260, 40], n: 40, life: 1.0, shape: 'spark', colors: ['#e6fbff', '#6fe0ff'], v: [0, 20], vr: [120, 60], g: 300 }),
            flash('#e6fbff', 0.5, I, 0.12),
        ],
        // NIGHTBLADE (owner 2026-11-03): no portal - lighting only: the field goes to night under a moon, then a weighted strike barrage
        NIGHTBLADE: () => [
            L('wash', { at: 0.05, dur: I + 0.9, color: '#050a28', a: 0.62 }),
            L('emit', { at: 0.1, dur: I + 0.6, pos: [0.5, 0.3], box: [560, 200], n: 40, life: 1.2, shape: 'star', colors: ['#ffffff', '#b8c8ff'], v: [0, 0], vr: [6, 6], size: 3 }),
            { fx: 'k_flash', at: 0.1, pos: [0.82, 0.16], w: 120, dur: I + 0.5, loop: true, add: true, tint: ['#cfe0ff', 0.6] },
            ...blows({ col: '#ff5a7a', mid: '#ffe0e6', n: 5, gap: 0.1 }),
        ],
        // kage: kunai from every direction, the target is dragged down
        // KAGE (owner 2026-11-03: worst one): shadow clones of the caster close in on the target from every side and cut together
        KAGE: () => [
            dark(0.6),
            L('wash', { at: 0.1, dur: I + 0.7, color: '#1a0030', a: 0.4 }),
            L('ghosts', { at: 0.3, dur: I - 0.3 + 0.9, who: 'caster', near: true, add: false, a: 0.7, offs: [[-190, -10], [-120, 15], [-60, -5], [60, 12], [120, -8], [190, 14]], fin: 0.3, fout: 0.4 }),
            L('slashes', { at: I - 0.05, n: 14, gap: 0.04, color: '#b06bff', mid: '#f0e0ff', len: 200, w: 9, angles: [-0.9, 0.9, 0, 1.57, -0.45, 0.45, 1.2] }),
            ...weight('#b06bff', I + 0.4, 1.3),
            L('engulf', { at: I + 0.45, pos: 'T', color: '#b06bff', mid: '#f0e0ff', dur: 0.9, grow: 0.35, a: 0.8 }),
            flash('#b06bff', 0.4, I + 0.45, 0.2),
        ],
        // ── fire / arcane ──────────────────────────────────────────────────
        APPRENTICE: () => meteorFall(true, 6, 46, 190, '#ff7a1a'),
        // ☄️ MAGE (owner 2026-11-02: "the meteorite one was mid"): a meteor SHOWER heralds ONE colossal boulder that
        // takes a full second to fall, lands with a triple shockwave, a flash and a burst of flying rock
        // MAGE (owner 2026-11-03): the enemy is left alone in void-like space, the view pulls back until everyone is tiny, and a meteor swells until it fills the
        // whole frame; the hit is a white flash and an anime-style planet detonating
        MAGE: () => [
            L('wash', { at: 0.05, dur: I + 0.5, color: '#02020a', a: 0.78 }),
            L('bgfill', { at: 0.1, dur: I + 0.3, pos: [0.5, 0.45], colors: ['#14092e', '#000000'], fin: 0.6, fout: 0.4 }),
            L('emit', { at: 0.1, dur: I + 0.2, pos: [0.5, 0.35], box: [600, 260], n: 60, life: 1.4, shape: 'star', colors: ['#ffffff', '#b8c8ff', '#ffd28a'], v: [0, 0], vr: [4, 4], size: 3 }),
            L('shrink', { at: 0.1, dur: 1.0, to: 0.5 }),
            L('circle', { at: 0.2, pos: 'C', r: 70, dur: 1.1, color: '#ff7a1a', points: 6, spin: 1.5 }),
            L('bigmeteor', { at: I - 1.15, dur: 1.15, pos: 'T', size: 640 }),
            L('planetburst', { at: I, dur: 1.4, pos: 'T', r: 125, color: '#ff7a1a' }),
            ...weight('#ff7a1a', I + 0.3, 1.6),
            L('engulf', { at: I + 0.3, pos: 'T', color: '#ff7a1a', mid: '#ffe2a8', dur: 0.9, grow: 0.4, a: 0.7 }),
        ],
        // fire breath straight from the dragonslayer's face
        // DRAGONSLAYER (owner 2026-11-03): no starter - a dragon dives in, the fire comes out of ITS jaws, heavier and with real impact
        DRAGONSLAYER: () => [
            dark(0.4, 0.05, 1.8),
            L('camera', { at: 0.2, dur: 1.0, dz: -0.04 }),
            L('dragon', { at: 0.15, pos: [0.14, 0.34], s: 1.5, dur: 2.2, slide: [-300, -30], slideDur: 0.45, set: 'dragon_head', color: '#3a6a3a', belly: '#e8c070', flame: '#ff7a1a' }),
            L('breath', { at: I - 0.55, from: [0.14, 0.34], offFrom: dragonMouth(1.5), to: 'T', offTo: [0, -50], dur: 1.0, n: 240, life: 0.55, w: 120, size: 1.5, spread: 'enemies', fanGap: 0.1 }),
            { fx: 'fire_blast', at: I, pos: 'T', w: 380, n: 3, jit: [60, 30], gap: 0.1, spread: 'enemies', fanGap: 0.08 },
            { fx: 'fire_bomb', at: I + 0.1, pos: 'T', w: 320, off: [0, -10], add: true, alpha: 0.9 },
            ...weight('#ff8a2a', I, 1.5),
            L('cracks', { at: I, pos: 'T', n: 9, r: 170, color: '#ff8a2a', dur: 0.9 }),
            L('rings', { at: I + 0.1, pos: 'T', n: 3, gap: 0.1, color: '#ff8a2a', r: 220 }),
            flash('#ffb05a', 0.5, I, 0.22),
        ],
        // a smaller dragon, a strong but not final blast — owner round 2: "the dragon lord
        // should have the color be inverted" → the wyvern rides the INVERTED frame set
        DRAGON_LORD: () => [
            dark(0.4, 0.1, 2.0),
            L('camera', { at: 0.25, dur: 1.0, dz: -0.05 }),
            L('dragon', { at: 0.3, pos: [0.14, 0.34], s: 1.35, dur: 2.4, slide: [-300, -30], slideDur: 0.5, set: 'dragon_head_inv', color: '#7a3a2a', belly: '#e8b070', flame: '#ff7a1a' }),
            L('breath', { at: 0.95, from: [0.14, 0.34], offFrom: dragonMouth(1.35), to: 'T', offTo: [0, -50], dur: 0.9, n: 120, life: 0.55, w: 92, size: 1.3, spread: 'enemies', fanGap: 0.1 }),
            { fx: 'fire_blast', at: I, pos: 'T', w: 330, n: 2, jit: [50, 30], gap: 0.12, spread: 'enemies', fanGap: 0.08 },
            L('rings', { at: I + 0.05, pos: 'T', n: 2, gap: 0.12, color: '#ffb050', r: 170, spread: 'enemies', fanGap: 0.08 }),
            flash('#ffc070', 0.35, I, 0.2),
        ],
        // the world goes into a black hole, a pale void, a giant dragon engulfs the scene
        // (owner round 2: "zoom out wayy more so that the characger Sprites look small
        // leave the dragon the same size tho") — roster shrinks to 0.4, dragon keeps s 2.0
        DRAGON_GOD: () => [
            L('vortex', { at: 0.1, pos: 'T', hy: 40, R: 600, twist: 8, pull: 4, hole: 6, rim: '#9fd6ff', dur: 1.2, inFrac: 0.7, outFrom: 0.88 }),
            L('bgfill', { at: 1.05, dur: 1.9, pos: [0.5, 0.5], colors: ['#d8f2ff', '#6fb4e8'], fin: 0.35, fout: 0.45 }),
            L('camera', { at: 1.1, dur: 1.2, dz: -0.1, fin: 0.5 }),
            L('shrink', { at: 1.1, dur: 0.5, to: 0.4, hold: 1.0 }),
            L('dragon', { at: 1.2, pos: [0.12, 0.40], s: 2.0, dur: 2.7, slide: [-420, -60], slideDur: 0.6, color: '#27576a', belly: '#9fe0d0', flame: '#ff9a30' }),
            L('breath', { at: 1.95, from: [0.12, 0.40], offFrom: dragonMouth(2.0), to: 'T', offTo: [0, -50], dur: 1.1, n: 170, life: 0.6, w: 170, size: 2.0, reach: 1.15, spread: 'enemies', fanGap: 0.08 }),
            L('wash', { at: 2.1, dur: 0.75, color: '#ff8a1a', a: 0.85, curve: 'in' }),
            L('wash', { at: 2.45, dur: 0.6, color: '#fff4d0', a: 0.95, add: true }),
            L('emit', { at: 2.2, dur: 1.0, pos: [0.5, 0.5], box: [560, 300], n: 40, life: 0.8, shape: 'spark', colors: ['#ffd27a', '#ff7a1a'], v: [60, -40], vr: [120, 60] }),
        ],
        DOOMSLAYER: () => [
            dark(0.45),
            L('circle', { at: 0.05, pos: 'C', r: 70, dur: 1.1, color: '#ff3a2a' }),
            L('fall', { at: I - 0.42, pos: 'T', kind: 'meteor', n: 8, gap: 0.07, fall: 0.32, spreadX: 240, spreadY: 80, land: 'k_regular', landW: 190, color: '#ff3a2a', spread: 'enemies' }),
            L('engulf', { at: I + 0.1, pos: 'T', color: '#ff3a2a', mid: '#ffd0c0', dur: 1.0, grow: 0.4, a: 0.9 }),
            L('rings', { at: I + 0.15, pos: 'T', n: 2, gap: 0.12, color: '#ff3a2a', r: 180, spread: 'enemies', fanGap: 0.09 }),
            ...weight('#ff3a2a', I + 0.1, 1.3),
            flash('#ffb0a0', 0.3, I + 0.1, 0.18),
        ],
        // spears fall from the sky
        WARLORD: () => [
            L('emit', { at: 0.05, dur: 0.8, pos: 'C', box: [60, 20], n: 12, life: 0.6, shape: 'spark', colors: ['#ffd9a0', '#ff8a2a'], v: [0, -80], vr: [40, 30] }),
            L('fall', { at: I - 0.4, pos: 'T', kind: 'spear', n: 18, gap: 0.05, fall: 0.3, slant: -70, spreadX: 260, spreadY: 90, land: 'k_ground', landW: 80, color: '#ff8a2a', spread: 'enemies', fanGap: 0.06, stay: 0.9 }),
            L('rings', { at: I + 0.2, pos: 'T', n: 2, gap: 0.12, color: '#ffb050', r: 170, spread: 'enemies', fanGap: 0.08 }),
            flash('#ffd9a0', 0.3, I + 0.2, 0.16),
        ],
        // four elements fuse into one prismatic blast
        // ELEMENTALIST (owner 2026-11-04): a SEQUENCE of different elements - rock from the sky, fire from one side, water from the other, then air - each landing in turn, then a final convergence
        ELEMENTALIST: () => [
            L('circle', { at: 0.05, pos: 'C', r: 80, dur: 1.2, color: '#7ad7ff', points: 6 }),
            // 1 - EARTH: a boulder drops straight out of the sky
            L('fall', { at: I - 1.0, pos: 'T', kind: 'rock', n: 1, fall: 0.38, spreadX: 0, spreadY: 0, slant: 0, size: 70, land: 'k_ground', landW: 190, color: '#c9a060' }),
            L('rings', { at: I - 0.62, pos: 'T', n: 2, gap: 0.1, color: '#c9a060', r: 150 }),
            L('cracks', { at: I - 0.62, pos: 'T', n: 6, r: 110, color: '#c9a060', dur: 0.7 }),
            // 2 - FIRE: meteors streak in from one side
            L('fall', { at: I - 0.78, pos: 'T', kind: 'meteor', n: 3, gap: 0.07, fall: 0.36, spreadX: 30, spreadY: 20, slant: -300, land: 'k_regular', landW: 150, color: '#ff6a1a' }),
            { fx: 'fire_blast', at: I - 0.38, pos: 'T', off: [0, -35], w: 280, add: true },
            L('rings', { at: I - 0.38, pos: 'T', n: 2, gap: 0.1, color: '#ff6a1a', r: 150 }),
            // 3 - WATER: a lance of water shards from the opposite side
            L('fall', { at: I - 0.55, pos: 'T', kind: 'shard', n: 7, gap: 0.04, fall: 0.34, spreadX: 40, spreadY: 25, slant: 300, land: 'k_simple', landW: 110, color: '#59d2ff' }),
            { fx: 'k_sonic', at: I - 0.2, pos: 'T', off: [0, 8], w: 260, add: true, tint: ['#6cc0ff', 0.6] },
            L('ripple', { at: I - 0.2, pos: 'T', n: 3, gap: 0.09, color: '#9bd8ff', r: 160 }),
            // 4 - AIR: a cutting gale
            L('fall', { at: I - 0.32, pos: 'T', kind: 'arrow', n: 9, gap: 0.03, fall: 0.3, spreadX: 70, spreadY: 25, slant: -120, land: 'k_simple', landW: 90, color: '#e8ffd0' }),
            L('emit', { at: I - 0.45, dur: 0.8, pos: 'T', box: [120, 50], n: 26, life: 0.7, shape: 'spark', colors: ['#e8ffd0', '#ffffff', '#a8ff7a'], v: [0, -40], vr: [120, 40], swirl: 6 }),
            // finale: all four collide
            { fx: 'white_burst', at: I, pos: 'T', w: 380, add: true, spread: 'enemies', fanGap: 0.08 },
            ...['#c9a060', '#ff6a1a', '#59d2ff', '#a8ff7a'].map((c, i) => L('engulf', { at: I + i * 0.1, pos: 'T', color: c, mid: c, dur: 0.7, grow: 0.5, a: 0.5 })),
            ...weight('#ffe84a', I, 1.4),
            L('emit', { at: I, dur: 0.7, pos: 'T', box: [120, 40], n: 30, life: 0.9, shape: 'spark', colors: ['#ff6a1a', '#59d2ff', '#ffe84a', '#a8ff7a'], v: [0, -80], vr: [100, 50], g: 120 }),
            flash('#ffffff', 0.5, I, 0.2),
        ],
        AVATAR: () => [
            dark(0.4),
            L('circle', { at: 0.05, pos: 'C', r: 105, dur: 1.4, color: '#ffffff', points: 6, spin: 2.2 }),
            L('emit', { at: 0.1, dur: 1.0, pos: 'C', box: [80, 30], n: 26, life: 0.9, shape: 'spark', colors: ['#ff6a1a', '#59d2ff', '#ffe84a', '#a8ff7a'], v: [0, -110], vr: [60, 30] }),
            L('elements', { at: 0.2, dur: I - 0.2 + 0.05, pos: 'T', fuseUp: 120, s: 1.5 }),
            ...['#ff6a1a', '#59d2ff', '#c9a060', '#a8ff7a'].map((c, i) => L('engulf', { at: I + i * 0.16, pos: 'T', color: c, mid: c, dur: 0.7, grow: 0.5, a: 0.55 })),
            L('engulf', { at: I + 0.7, pos: 'T', color: '#ffffff', mid: '#ffffff', dur: 1.1, grow: 0.4, a: 1 }),
            { fx: 'k_sonic', at: I, pos: 'T', w: 360, spread: 'enemies', fanGap: 0.08 },
            L('rings', { at: I, pos: 'T', n: 4, gap: 0.08, color: '#ffffff', r: 220, spread: 'enemies', fanGap: 0.08 }),
            L('emit', { at: I, dur: 0.8, pos: 'T', box: [160, 50], n: 40, life: 1, shape: 'spark', colors: ['#ff6a1a', '#59d2ff', '#ffe84a', '#a8ff7a'], v: [0, -90], vr: [130, 60], g: 120 }),
            flash('#ffffff', 0.6),
        ],
        // ── void / time / tinker ───────────────────────────────────────────
        // black holes open on every enemy and swallow them
        // ARCHMAGE (owner 2026-11-03): the ENEMY (not the caster) is swept up with the world into the singularity; no second black-hole pass;
        // the fight lands in a world of swirling light
        ARCHMAGE: () => [
            L('wash', { at: 0.1, dur: I + 0.8, color: '#04000c', a: 0.25 }),
            L('emit', { at: 0.1, dur: 1.0, pos: 'C', box: [80, 30], n: 22, life: 0.8, shape: 'star', colors: ['#a56bff', '#e6d4ff'], v: [0, -80], vr: [40, 20], swirl: 4 }),
            L('affect', { at: I - 0.3, dur: 0.7, curve: 'hold', a: 0.6, add: true, spread: 'enemies' }),
            L('rings', { at: I, pos: 'T', n: 4, gap: 0.09, color: '#c4a4ff', r: 220, spread: 'enemies', fanGap: 0.06 }),
            { fx: 'k_sonic', at: I, pos: 'T', w: 320, add: true, tint: ['#a56bff', 0.5], spread: 'enemies', fanGap: 0.06 },
            ...weight('#a56bff', I, 1.3),
            L('engulf', { at: I + 0.02, pos: 'T', color: '#a56bff', mid: '#e6d4ff', dur: 0.9, grow: 0.4, a: 0.7 }),
            flash('#c4a4ff', 0.45, I, 0.2),
        ],
        // colours invert (the caster stays normal), zoom in, the enemy just loses health
        // VOIDWALKER (owner 2026-11-03: starter was trash): no shard cinematic - a gate opens under the target in an inverted world and drags it in
        VOIDWALKER: () => [
            L('circle', { at: 0.05, pos: 'C', r: 80, dur: 1.3, color: '#7a4cff', points: 5, spin: 2 }),
            L('invert', { at: 0.2, dur: I + 0.6, fin: 0.12, fout: 0.3 }),
            L('camera', { at: 0.3, dur: 1.0, dz: 0.07 }),
            L('rift', { at: 0.3, pos: 'T', rx: 95, dur: 1.5, color: 'rgba(90,60,255,0.45)', lip: '#d4c4ff' }),
            L('focus', { at: 0.5, dur: 1.1, mode: 'suck', hit: I }),
            L('ripple', { at: I - 0.05, pos: 'T', n: 3, gap: 0.1, color: '#ffffff', r: 190 }),
            ...weight('#7a4cff', I, 1.2),
            flash('#ffffff', 0.4, I, 0.14),
        ],
        // a giant golden clock locks the enemy: "Locked in Time"
        CHRONOMANCER: () => stopTimeSet('#ffd98a', 105),
        // reality rewinds: contracting rings, a clock, afterimages
        // TIMELORD (owner 2026-11-03): a PARADOX - the past and future selves of the enemy stand either side of it and a double of you strikes with you; both take the hit
        TIMELORD: () => [
            L('wash', { at: 0.05, dur: I + 0.5, color: '#1a1204', a: 0.3 }),
            L('circle', { at: 0.05, pos: 'T', off: [0, -120], r: 190, dur: I + 0.2, color: '#ffe27a', clock: true, ratio: 0.84, spin: -1.6, ticks: 24 }),
            L('ripple', { at: 0.25, pos: 'T', n: 5, gap: 0.14, color: '#ffe27a', r: 230, inward: true, dur: 0.7, dash: true }),
            L('ghosts', { at: 0.5, dur: I - 0.5 + 0.8, offs: [[-95, 0], [95, 0]], a: 0.8, link: true, color: '#ffe27a' }),
            L('ghosts', { at: I - 0.5, dur: 1.2, who: 'caster', near: true, add: false, a: 0.75, offs: [[-70, -8]] }),
            L('rings', { at: I, pos: 'T', off: [-95, 0], n: 3, gap: 0.1, color: '#fff3c4', r: 170 }),
            L('rings', { at: I, pos: 'T', off: [95, 0], n: 3, gap: 0.1, color: '#fff3c4', r: 170 }),
            L('slashes', { at: I - 0.02, n: 6, gap: 0.05, color: '#ffe27a', mid: '#ffffff', len: 180, w: 10, jit: [200, 30], angles: [-0.6, 0.6, -0.3, 0.3, 0, 0.9] }),
            ...weight('#ffe27a', I, 1.3),
            flash('#ffe27a', 0.45, I, 0.2),
        ],
        // tech: a targeting reticle, then ONE laser from the sky
        // tech: a targeting reticle that says LOCKED, then ONE laser from the sky that engulfs the screen
        ARTIFICER: () => [
            L('gears', { at: 0.1, pos: 'C', dur: 1.6, color: '#ffb04a', color2: '#8a8a99', glow: '#ffb04a' }),
            L('reticle', { at: 0.2, pos: 'T', dur: I - 0.2 + 0.1, color: '#ff3a3a', label: 'LOCKED' }),
            L('pillar', { at: I - 0.1, pos: 'T', w: 34, dur: 0.6, color: '#ff6a4a', mid: '#ffffff' }),
            L('engulf', { at: I + 0.05, pos: 'T', color: '#ff6a4a', mid: '#fff0e0', dur: 1.0, grow: 0.42 }),
            { fx: 'white_burst', at: I, pos: 'T', w: 240, add: true },
            { fx: 'k_flash', at: I, pos: 'T', w: 200, add: true },
            ...weight('#ffb04a', I, 1.1),
            flash('#ffe0b0', 0.35, I, 0.14),
        ],
        // a giant robot hand slams down and presses the enemy into the ground
        GRAND_INVENTOR: () => [
            L('gears', { at: 0.1, pos: 'C', dur: 1.5, color: '#6de9ff', color2: '#8a8a99', glow: '#6de9ff' }),
            L('robohand', { at: I - 0.45, pos: 'T', dur: 1.6, fall: 0.45, s: 1.7, color: '#59e6ff' }),
            L('focus', { at: I - 0.02, dur: 1.3, mode: 'press', depth: 135, downFrac: 0.12, holdTo: 0.65, hit: I }),
            { fx: 'k_ground', at: I, pos: 'T', w: 280, add: false },
            L('rings', { at: I, pos: 'T', n: 3, gap: 0.09, color: '#6de9ff', r: 190 }),
            L('emit', { at: I, dur: 0.6, pos: 'T', box: [120, 20], n: 18, life: 0.7, shape: 'spark', colors: ['#6de9ff', '#ffffff'], v: [0, -80], vr: [100, 40], g: 260 }),
            flash('#d6fbff', 0.35, I, 0.14),
        ],
        // bard: sound, not lasers
        BARD: () => [
            L('emit', { at: 0.1, dur: 1.2, pos: 'C', box: [100, 40], n: 24, life: 1, shape: 'note', colors: ['#7ad7ff', '#ffe27a', '#ff9ad5'], v: [70, -50], vr: [40, 30], size: 7 }),
            L('ripple', { at: I - 0.35, pos: 'C', n: 3, gap: 0.12, color: '#7ad7ff', r: 130 }),
            L('swarm', { at: I - 0.5, pos: 'T', kind: 'note', n: 14, inward: true, dur: 0.5, pass: 0.3, from: 320, size: 9, color: '#ffe27a' }),
            { fx: 'k_sonic', at: I, pos: 'T', w: 280 },
            L('ripple', { at: I, pos: 'T', n: 3, gap: 0.1, color: '#ffe27a', r: 170 }),
            flash('#dff6ff', 0.35),
        ],
        // ── holy (owner: fine) ─────────────────────────────────────────────
        ACOLYTE: () => holyBeam(0.8),
        // PALADIN: spears of light rain onto the target like the cross on the shield, each landing with weight
        PALADIN: () => [
            L('circle', { at: 0.1, pos: 'T', r: 110, dur: 1.5, color: '#ffe27a', points: 4, spin: 0.6 }),
            L('fall', { at: I - 0.45, pos: 'T', kind: 'spear', n: 10, gap: 0.05, fall: 0.3, slant: -30, spreadX: 150, spreadY: 60, land: 'k_regular', landW: 100, color: '#ffe27a', spread: 'enemies', fanGap: 0.06 }),
            L('pillar', { at: I + 0.15, pos: 'T', w: 120, dur: 0.6, color: '#ffe27a', mid: '#fff6c8', spread: 'enemies', fanGap: 0.09 }),
            L('engulf', { at: I + 0.17, pos: 'T', color: '#ffe27a', mid: '#fff6c8', dur: 1.0, grow: 0.42 }),
            ...weight('#ffe27a', I + 0.15, 1.2),
            flash('#fff6d0', 0.5, I + 0.15, 0.2),
        ],
        // CLERIC: the rose window - five coloured shafts fall in turn, the last one white
        CLERIC: () => [
            L('circle', { at: 0.1, pos: 'T', r: 100, dur: 1.6, color: '#ffe27a', points: 6, spin: 1.2 }),
            ...['#ff7a7a', '#ffb870', '#8aff8a', '#7ac8ff', '#c89aff'].map((c, i) => L('pillar', { at: I - 0.2 + i * 0.09, pos: 'T', off: [(i - 2) * 38, 0], w: 70, dur: 0.55, color: c, mid: '#ffffff', spread: 'enemies', fanGap: 0.09 })),
            L('pillar', { at: I + 0.3, pos: 'T', w: 150, dur: 0.6, color: '#ffffff', mid: '#ffffff', spread: 'enemies', fanGap: 0.09 }),
            { fx: 'holy_burst', at: I + 0.3, pos: 'T', w: 380, add: true, spread: 'enemies', fanGap: 0.08 },
            L('engulf', { at: I + 0.32, pos: 'T', color: '#ffe27a', mid: '#ffffff', dur: 1.0, grow: 0.42 }),
            ...weight('#ffe27a', I + 0.3, 1),
            flash('#fff6d0', 0.5, I + 0.3, 0.2),
        ],
        // SAINT: heaven opens - one wide pillar, a drift of falling feathers, a slow wide halo
        SAINT: () => [
            ...holyBeam(1.2),
            L('emit', { at: I - 0.3, dur: 1.4, pos: 'T', off: [0, -170], box: [240, 20], n: 34, life: 1.3, shape: 'glow', colors: ['#ffffff', '#fff2b0'], v: [0, 70], vr: [30, 20], size: 5 }),
            L('rings', { at: I + 0.1, pos: 'T', n: 3, gap: 0.1, color: '#fff2b0', r: 220 }),
        ],
        // self buffs: aura around the caster
        // MONK: two palm strikes, soft then hard (the lotus opens, the palm lands)
        MONK: () => blows({ col: '#fff2b0', mid: '#fff6d8', n: 2, gap: 0.2 }),
        ZENMASTER: () => auraSelf('#8ae6ff', 1.0, [L('ripple', { at: I - 0.2, pos: 'C', n: 4, gap: 0.12, color: '#8ae6ff', r: 190, rise: 40 })]),
        TEMPLAR: () => [
            ...auraSelf('#fff2b0', 1.1),
            L('ripple', { at: I - 0.3, pos: 'C', n: 2, gap: 0.14, color: '#ffffff', r: 160, rise: 55, ratio: 0.9, dur: 0.9 }),
        ],
        // DIVINE_FIST: the eight gates - a golden barrage of fists, faster and heavier every strike, last one cracks the ground
        DIVINE_FIST: () => blows({ col: '#ffb84a', mid: '#fff0c0', n: 7, gap: 0.085, extra: [L('rings', { at: I + 0.6, pos: 'T', n: 3, gap: 0.1, color: '#ffb84a', r: 230 })] }),
        // GOD_HAND (owner 2026-11-04): a MEDITATION - no hand. The caster sits in stillness, a golden lotus mandala spins and orbs of light gather; enlightenment then crushes the target under its own weight
        GOD_HAND: () => [
            L('wash', { at: 0.1, dur: I + 0.8, color: '#1a1200', a: 0.35 }),
            L('circle', { at: 0.05, pos: 'C', r: 95, dur: I + 0.5, color: '#ffd27a', points: 8, spin: 1.1 }),
            L('circle', { at: 0.25, pos: 'C', r: 62, dur: I + 0.3, color: '#fff2b0', points: 6, spin: -1.6 }),
            L('rings', { at: 0.3, pos: 'C', n: 3, gap: 0.28, color: '#ffd27a', r: 130 }),
            L('emit', { at: 0.1, dur: I, pos: 'C', box: [70, 20], n: 44, life: 1.1, shape: 'glow', colors: ['#ffe9a8', '#ffd27a', '#ffffff'], v: [0, -90], vr: [50, 20], size: 5 }),
            L('emit', { at: I - 0.7, dur: 0.7, pos: 'T', box: [90, 30], n: 22, life: 0.8, shape: 'glow', colors: ['#ffe9a8', '#ffffff'], v: [0, 60], vr: [60, 20], inward: true, size: 4 }),
            L('pillar', { at: I - 0.25, pos: 'T', w: 120, dur: 0.8, color: '#ffd27a', mid: '#fff6d0' }),
            L('focus', { at: I - 0.02, dur: 1.2, mode: 'press', depth: 120, downFrac: 0.12, holdTo: 0.6, hit: I }),
            L('cracks', { at: I, pos: 'T', n: 10, r: 190, color: '#ffd27a', dur: 1.0 }),
            ...weight('#ffd27a', I, 1.5),
            L('rings', { at: I, pos: 'T', n: 3, gap: 0.09, color: '#ffd27a', r: 230 }),
            L('engulf', { at: I + 0.02, pos: 'T', r: 480, color: '#ffd27a', mid: '#fff6d0', dur: 0.6, grow: 0.3, a: 0.6 }),
            flash('#fff6d0', 0.5, I, 0.2),
        ],
        // ── nature / gold ──────────────────────────────────────────────────
        DRUID: () => natureSet(5),
        ARCHDRUID: () => [...natureSet(8), L('rings', { at: I + 0.2, pos: 'T', n: 3, gap: 0.12, color: '#a8ff7a', r: 190 })],
        MERCHANT: () => coins(18, null),
        TYCOON: () => coins(30, '#ffd24a'),
    };
    return R[cls] ? R[cls]() : null;
}

// ── skill-level intensity (owner: "each skill upgrade should make the ability more intense") ──
// k = 0..1 from (skillLevel-1)/(maxLevel-1). Level 1 IS the base look; upgrades grow it. The max level adds
// energy (a ring + sparks + a brighter flash) but NEVER sky lasers or ground cracks (owner: "the level 3s are
// spamming lasers where they don't belong"). Timing never changes so hit sync is untouched.
const SIZE_KEYS = ['w', 'r', 'rx', 'ew', 'eh', 'len'];
const NOSCALE = new Set(['lunge', 'focus', 'bgfill', 'invert', 'vortex', 'camera', 'hidecaster', 'dragon', 'robohand', 'scythe', 'reticle', 'staff', 'shrink', 'magicClock', 'cosmic', 'world', 'cinema', 'dissolve', 'bigmeteor', 'planetburst', 'engulf', 'splitcut', 'crumble', 'ghosts']);
function classRecipe(cls, p, o) {
    const W = WORLD[cls], S = shiftOf(cls);
    if (!W) return classRecipeBase(cls, p, o);
    const base = classRecipeBase(cls, p, { ...o, IMPACT: o.IMPACT - S });      // recipes are written against the un-shifted impact
    if (!base) return base;
    const drop = new Set(W.drop || []);
    const moved = base.filter((t) => !drop.has(t.layer)).map((t) => ({ ...t, at: (t.at || 0) + S, ...(t.hit !== undefined ? { hit: t.hit + S } : {}) }));
    const total = ((META[cls] && META[cls].duration) || 2.7) + S, T3 = W.cin ? 1.75 : 1.7, wAt = T3 - 0.1;
    return [
        W.cin ? { layer: 'cinema', at: 0, dur: W.short ? 1.4 : 2.1, kind: W.cin, world: W.kind, keepCaster: W.keepCaster } : { layer: 'cosmic', at: 0, dur: 2.0, world: W.kind, planet: W.planet },
        ...(W.kind ? [{ layer: 'world', under: true, at: wAt, dur: total - wAt - 0.25, kind: W.kind, sil: W.sil, debris: W.debris, lights: W.lights, fin: 0.25, fout: 0.4 }] : []),
        ...moved,
    ];
}

function scaleTracks(tracks, k, palette, IMPACT) {
    k = Math.max(0, Math.min(1, Number(k) || 0));
    if (!Array.isArray(tracks)) return tracks;
    const f = 1 + 0.22 * k, cnt = 1 + 0.5 * k;
    const out = tracks.map((t) => {
        if (NOSCALE.has(t.layer)) return t;
        const o = { ...t };
        if (o.layer === 'wash') { o.a = Math.min(0.9, (o.a || 0.5) * (1 + 0.25 * k)); return o; }
        for (const key of SIZE_KEYS) if (typeof o[key] === 'number') o[key] = Math.round(o[key] * f);
        if (typeof o.n === 'number' && o.n > 1 && o.layer !== 'hands') o.n = Math.max(1, Math.round(o.n * cnt));
        if (!o.layer && typeof o.alpha === 'number') o.alpha = Math.min(1, o.alpha * (1 + 0.1 * k));
        if (o.layer === 'emit' && typeof o.size === 'number') o.size = o.size * (1 + 0.25 * k);
        return o;
    });
    const col = (palette && palette[1]) || '#ffffff', hi = (palette && palette[0]) || '#ffffff';
    const I = IMPACT;
    if (k >= 0.45) out.push({ layer: 'rings', at: I + 0.05, pos: 'T', n: 2, gap: 0.1, color: col, r: Math.round(140 + 40 * k) });
    if (k >= 0.9) {
        out.push({ layer: 'emit', at: I, dur: 0.6, pos: 'T', box: [110, 30], n: 22, life: 0.8, shape: 'spark', colors: [hi, col], v: [0, -70], vr: [90, 40], g: 120 });
        out.push({ layer: 'wash', at: I, dur: 0.16, color: hi, a: 0.4, add: true });
    }
    return out;
}

module.exports = { classRecipe, scaleTracks, classMeta };
