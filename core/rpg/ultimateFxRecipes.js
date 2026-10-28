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
    MAGE: { duration: 3.0, impact: 1.2, zoom: 0.06 },
    DRAGON_GOD: { duration: 4.1, impact: 2.55, zoom: 0.02, flatVeil: true },
    DRAGON_LORD: { duration: 3.5, impact: 1.95, zoom: 0.04 },
    REAPER: { duration: 3.4, impact: 1.75, zoom: 0.03 },
    VIRTUOSO: { duration: 3.3, impact: 1.5, zoom: 0.03, flatVeil: true },
    ARCHMAGE: { duration: 3.3, impact: 1.5, zoom: 0.04 },
    VOIDWALKER: { duration: 3.1, impact: 1.3, zoom: 0.12 },
    GRAND_INVENTOR: { duration: 3.1, impact: 1.45 },
    TIMELORD: { duration: 3.1, impact: 1.3 },
    LICH: { duration: 3.0, impact: 1.2 },
    DEATH_LORD: { duration: 3.1, impact: 1.5 },
    WARLOCK: { duration: 3.0, impact: 1.3 },
    ELEMENTALIST: { duration: 3.0, impact: 1.25 },
    AVATAR: { duration: 3.1, impact: 1.3 },
    KAGE: { duration: 3.0, impact: 1.25 },
};
// 🌌 WORLD-SHIFT (owner 2026-10-28): the big skills open with a cosmic cinematic (zoom-blur out ->
// planet + asteroid -> impact -> the arena becomes another world), then play their normal recipe,
// shifted later by SHIFT seconds. planet:false = warp tunnel into another dimension (shorter).
const WORLD = {
    MAGE: { kind: 'lava', planet: true },          // owner: the asteroid-hits-a-planet idea was for the MAGE ult
    ARCHMAGE: { kind: 'storm', planet: true },
    TIMELORD: { kind: 'gold', planet: true },
    AVATAR: { kind: 'ice', planet: true },
    DEATH_LORD: { kind: 'blood', planet: true },
    KAGE: { kind: 'void', planet: false, sil: true },
    VOIDWALKER: { kind: 'void', planet: false },
    REAPER: { kind: 'void', planet: false },
    LICH: { kind: 'ice', planet: false },
    GRAND_INVENTOR: { kind: 'storm', planet: false },
    WARLOCK: { kind: 'blood', planet: false },
    ELEMENTALIST: { kind: 'storm', planet: false },
    VIRTUOSO: { kind: 'gold', planet: false },
};
const shiftOf = (cls) => (WORLD[cls] ? (WORLD[cls].planet ? 1.9 : 1.5) : 0);
function classMeta(cls) {
    const m = META[cls]; if (!m) return null;
    const S = shiftOf(cls);
    return S ? { ...m, duration: m.duration + S, impact: m.impact + S } : m;
}

function classRecipeBase(cls, p, { IMPACT: I }) {
    const L = (layer, o) => ({ layer, under: GROUND_LAYERS.has(layer), ...o });
    const flash = (c, a = 0.5, at = I, dur = 0.22) => L('wash', { at, dur, color: c, a, add: true });
    const dark = (a = 0.45, at = 0.1, dur = I + 0.4) => L('wash', { at, dur, color: '#05000c', a });
    const casterAura = (col, n = 12) => L('emit', { at: 0.05, dur: 0.8, pos: 'C', box: [60, 20], n, life: 0.6, shape: 'spark', colors: ['#fff', col], v: [0, -80], vr: [50, 30] });

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
            { fx: 'holy_start', at: 0.05, pos: 'C', w: 120, dur: 0.9, loop: true, add: true },
            L('circle', { at: 0.1, pos: 'T', r: 100 * k, dur: 1.6, color: '#ffe27a', points: 6, spin: 1.2 }),
            L('pillar', { at: I - 0.2, pos: 'T', w: 110 * k, dur: 0.8, color: '#ffe27a', mid: '#fff6c8', spread: 'enemies', fanGap: 0.09 }),
            { fx: 'holy_pillar', at: I - 0.2, pos: 'T', w: 280, off: [0, -120], n: 3, jit: [90, 0], gap: 0.08, spread: 'enemies', fanGap: 0.08 },
            { fx: 'holy_burst', at: I, pos: 'T', w: 380, add: true, spread: 'enemies', fanGap: 0.08 },
            L('emit', { at: I, dur: 0.9, pos: 'T', box: [120, 40], n: 22, life: 1, shape: 'star', colors: ['#fff2b0', '#ffffff'], v: [0, -60], vr: [50, 20] }),
            flash('#fff6d0', 0.5),
        ];
    }
    // self buffs: everything happens AROUND the caster (no dash, no wrong-way lunge)
    function auraSelf(col, k, extra = []) {
        return [
            { fx: 'holy_burst', at: 0.05, pos: 'C', w: 300 * k, add: true, tint: [col, 0.4] },
            L('circle', { at: 0.05, pos: 'C', r: 90 * k, dur: 1.7, color: col, points: 6 }),
            { fx: 'holy_loop', at: 0.2, pos: 'C', w: 190 * k, off: [0, -40], dur: 1.6, loop: true, add: true, tint: [col, 0.4] },
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
            L('vines', { at: I - 0.3, pos: 'T', n, dur: 1.6, color: '#3fa82a', spread: 'enemies', fanGap: 0.08 }),
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
    const R = {
        // ── dark arts ──────────────────────────────────────────────────────
        NECROMANCER: () => [
            dark(0.5),
            L('circle', { at: 0.05, pos: 'C', r: 80, dur: 1.4, color: '#9be88a', points: 5 }),
            L('emit', { at: 0.1, dur: 0.9, pos: 'C', box: [90, 20], n: 18, life: 0.8, shape: 'soul', colors: ['#9be88a', '#c8ffc0'], v: [0, -70], vr: [20, 20], swirl: 6 }),
            L('rift', { at: 0.35, pos: 'T', rx: 82, dur: 1.75, color: 'rgba(120,255,140,0.35)', lip: '#8dff9c' }),
            L('hands', { at: 0.45, pos: 'T', n: 6, dur: 1.75, sink: true, grab: 0.8, sinkEnd: 1.35, glow: '#8dff9c' }),
            L('emit', { at: I + 0.15, dur: 0.8, pos: 'T', box: [80, 20], n: 20, life: 0.9, shape: 'soul', colors: ['#9be88a', '#ffffff'], v: [0, -90], vr: [30, 20], swirl: 5 }),
            { fx: 'necro3', at: I + 0.1, pos: 'T', w: 260, off: [0, 20], add: true, alpha: 0.9 },
            flash('#b7ffb0', 0.35),
        ],
        // little souls rush in from every direction and strike the enemy
        LICH: () => [
            dark(0.5),
            L('circle', { at: 0.05, pos: 'C', r: 95, dur: 1.4, color: '#7dffe0', points: 6, spin: 2 }),
            L('swarm', { at: 0.3, pos: 'T', kind: 'soul', n: 34, inward: true, dur: 0.8, pass: 0.32, from: 360, size: 8, color: '#7dffe0', spread: 'enemies', fanGap: 0.05 }),
            L('slashes', { at: I - 0.2, n: 14, gap: 0.03, kind: 'burst', color: '#7dffe0', mid: '#ffffff', len: 110 }),
            L('emit', { at: I, dur: 0.8, pos: 'T', n: 24, life: 0.9, shape: 'soul', colors: ['#7dffe0', '#ffffff'], v: [0, -80], vr: [70, 30], swirl: 4 }),
            L('rings', { at: I + 0.05, pos: 'T', n: 2, gap: 0.12, color: '#7dffe0', r: 150 }),
            flash('#9dfff0', 0.35),
        ],
        // a chain of souls binds the target to the caster
        DEATH_LORD: () => [
            dark(0.55),
            L('circle', { at: 0.05, pos: 'C', r: 85, dur: 1.5, color: '#c43bff', points: 5 }),
            L('rift', { at: 0.3, pos: 'T', rx: 70, dur: 1.9, color: 'rgba(120,0,160,0.4)', lip: '#d36bff' }),
            L('tether', { at: 0.4, dur: 1.8, color: '#c43bff' }),
            L('focus', { at: 1.2, dur: 1.2, mode: 'drain', hit: I }),
            L('emit', { at: I, dur: 1.0, pos: 'T', box: [70, 40], n: 22, life: 0.9, shape: 'soul', colors: ['#e9c8ff', '#c43bff'], v: [-70, -40], vr: [30, 30] }),
            { fx: 'dark_a', at: I, pos: 'T', w: 240, n: 2, gap: 0.12, jit: [30, 20], add: true, tint: ['#c43bff', 0.6] },
            flash('#d79bff', 0.4),
        ],
        // the world implodes into a dot; the caster is gone; a GIANT REAL scythe cuts through
        // (owner round 2: "should be a real syth ... doesn't zoom out enough I want um to
        // became tiny and a gaint syth hits") — the roster shrinks to ~0.45 as the vortex
        // pulls, then the Wenrexa dark scythe (CC0, purple-tinted) sweeps the whole stage.
        REAPER: () => [
            dark(0.45, 0.1, 1.6),
            L('vortex', { at: 0.1, pos: 'T', hy: 40, R: 600, twist: 9, pull: 4.2, hole: 5, rim: '#a58bff', dur: 1.15, inFrac: 0.7, outFrom: 0.9 }),
            L('camera', { at: 1.0, dur: 0.7, dz: -0.09 }),
            L('shrink', { at: 0.95, dur: 0.55, to: 0.45 }),
            L('hidecaster', { at: 1.05, dur: 2.2 }),
            L('emit', { at: 0.2, dur: 0.8, pos: 'T', box: [200, 100], n: 24, life: 0.9, shape: 'soul', colors: ['#c5b3ff'], v: [0, -30], vr: [60, 40], swirl: 5 }),
            L('scythe', { at: I - 0.55, pos: 'T', R: 470, dur: 1.05, color: '#a58bff', mid: '#efe6ff', a0: 0.15, a1: 3.0, art: 'scythe_art', artW: 1.55 }),
            L('slashes', { at: I - 0.03, n: 2, gap: 0.05, color: '#a58bff', mid: '#ffffff', len: 300, w: 16, angles: [-0.5, -0.5] }),
            { fx: 'destroy', at: I + 0.05, pos: 'T', w: 260, n: 2, gap: 0.14, jit: [40, 30], add: true },
            L('emit', { at: I, dur: 0.8, pos: 'T', n: 18, life: 0.9, shape: 'soul', colors: ['#c5b3ff'], v: [0, -100], vr: [40, 20] }),
            flash('#c5b3ff', 0.4, I, 0.2),
        ],
        // a soul tears out of the target and flows into the warlock (heal)
        WARLOCK: () => [
            dark(0.5),
            L('circle', { at: 0.05, pos: 'C', r: 85, dur: 1.5, color: '#c04bff', points: 5, spin: 1.8 }),
            L('rift', { at: 0.3, pos: 'T', rx: 66, dur: 1.4, color: 'rgba(200,60,255,0.4)', lip: '#e08bff' }),
            L('emit', { at: 0.3, dur: 0.8, pos: 'T', box: [70, 30], n: 14, life: 0.8, shape: 'soul', colors: ['#d79bff', '#ffffff'], v: [0, -70], vr: [30, 20], swirl: 5 }),
            L('focus', { at: 0.6, dur: 1.0, mode: 'drain', hit: I }),
            L('soulflow', { at: I - 0.15, dur: 0.85, color: '#8dff9c' }),
            { fx: 'dark_b', at: I - 0.1, pos: 'T', w: 300, n: 2, gap: 0.12, jit: [30, 20], alpha: 0.9, tint: ['#c04bff', 0.4] },
            flash('#d79bff', 0.35, I - 0.05, 0.2),
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
        FIGHTER: () => cutSet({ col: '#bcd6ff', angles: [-0.8, 0.8, 1.57], n: 3, len: 170, w: 14 }),
        WARRIOR: () => cutSet({ col: '#ffb070', angles: [-0.85, 0.85, 0.0, 1.57], n: 4, len: 175, w: 14 }),
        SAMURAI: () => cutSet({ col: '#9fd0ff', angles: [-0.95, 0.2, -0.4, 0.8, -0.15, 1.1, 0.5], n: 7, len: 185, w: 7, gap: 0.055, sprite: null }),
        SHOGUN: () => [dark(0.35), ...cutSet({ col: '#ffd27a', mid: '#fff0c0', angles: [-0.7, 0.7, 0.0, 1.57, -1.2], n: 5, len: 190, w: 14, extra: [L('ripple', { at: I + 0.3, pos: 'T', n: 3, gap: 0.12, color: '#ffd27a', r: 200 })] })],
        BERSERKER: () => [
            L('wash', { at: 0.1, dur: I + 0.5, color: '#3a0000', a: 0.35 }),
            L('emit', { at: 0.05, dur: 0.9, pos: 'C', box: [60, 20], n: 24, life: 0.6, shape: 'spark', colors: ['#ff7a2a', '#ffd27a'], v: [0, -120], vr: [60, 30] }),
            ...cutSet({ col: '#ff4a2a', mid: '#ffd8a0', angles: [-0.9, 0.7, -0.3, 1.2, 0.1, -0.6, 0.95, -1.1, 0.3], n: 9, len: 165, w: 11, gap: 0.05, sprite: 'fire_slash' }),
            L('wash', { at: I, dur: 0.5, color: '#ff2a0a', a: 0.3, add: true }),
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
            { fx: 'dark_a', at: 0.05, pos: 'C', w: 130, dur: 0.9, loop: true, alpha: 0.6 },
            L('lunge', { at: I - 0.32, dur: 0.6, color: '#9d86ff' }),
            L('slashes', { at: I - 0.02, n: 2, gap: 0.12, kind: 'stab', color: '#9d86ff', mid: '#e6dcff', len: 150, w: 10, angles: [-0.35, 0.3], jit: [14, 20] }),
            L('slashes', { at: I + 0.22, n: 16, gap: 0.008, kind: 'burst', color: '#b9a6ff', mid: '#ffffff', len: 170 }),
            { fx: 'claw', at: I + 0.2, pos: 'T', w: 270, n: 2, jit: [30, 20], gap: 0.08, rot: [-0.6, 0.6], tint: ['#9d86ff', 0.8] },
            flash('#c9bcff', 0.45, I + 0.2, 0.14),
        ],
        // ninja / nightblade: an eclipse behind the target, shadow cuts
        NINJA: () => eclipseCuts('#6fe0ff', '#e6fbff', 5, I),
        NIGHTBLADE: () => eclipseCuts('#ff5a7a', '#ffe0e6', 6, I),
        // kage: kunai from every direction, the target is dragged down
        KAGE: () => [
            dark(0.55),
            L('rift', { at: 0.2, pos: 'T', rx: 70, dur: 2.0, color: 'rgba(90,0,140,0.45)', lip: '#b06bff' }),
            L('focus', { at: 0.5, dur: 1.9, mode: 'press', depth: 70, downFrac: 0.35, holdTo: 0.8, hit: I }),
            L('swarm', { at: 0.4, pos: 'T', kind: 'kunai', n: 30, dur: 0.9, pass: 0.2, from: 340, size: 8, color: '#b06bff', rise: 25 }),
            L('slashes', { at: I - 0.05, n: 12, gap: 0.04, color: '#b06bff', mid: '#f0e0ff', len: 160, w: 8, rise: 25 }),
            { fx: 'dark_a', at: I, pos: 'T', w: 240, n: 2, gap: 0.1, jit: [30, 20], add: true, tint: ['#b06bff', 0.6] },
            flash('#b06bff', 0.4, I + 0.2, 0.2),
        ],
        // ── fire / arcane ──────────────────────────────────────────────────
        APPRENTICE: () => meteorFall(true, 6, 46, 190, '#ff7a1a'),
        MAGE: () => meteorFall(true, 0, 78, 280, '#ff7a1a'),
        // fire breath straight from the dragonslayer's face
        DRAGONSLAYER: () => [
            L('emit', { at: 0.05, dur: 0.8, pos: 'C', box: [40, 20], n: 14, life: 0.6, shape: 'spark', colors: ['#ff7a2a', '#ffd27a'], v: [0, -80], vr: [40, 30] }),
            L('breath', { at: I - 0.5, from: 'C', offFrom: [26, -88], to: 'T', offTo: [0, -50], dur: 0.9, n: 110, life: 0.5, w: 72, size: 1.15 }),
            { fx: 'fire_blast', at: I, pos: 'T', w: 320, n: 2, jit: [40, 30], gap: 0.12 },
            { fx: 'fire_bomb', at: I + 0.15, pos: 'T', w: 260, off: [0, -10], add: true, alpha: 0.85 },
            L('rings', { at: I + 0.1, pos: 'T', n: 2, gap: 0.12, color: '#ff8a2a', r: 150 }),
            flash('#ffb05a', 0.35, I, 0.2),
        ],
        // a smaller dragon, a strong but not final blast — owner round 2: "the dragon lord
        // should have the color be inverted" → the wyvern rides the INVERTED frame set
        DRAGON_LORD: () => [
            dark(0.4, 0.1, 2.0),
            L('camera', { at: 0.25, dur: 1.0, dz: -0.05 }),
            L('dragon', { at: 0.3, pos: [0.14, 0.34], s: 1.35, dur: 2.0, set: 'dragon_head_inv', color: '#7a3a2a', belly: '#e8b070', flame: '#ff7a1a' }),
            L('breath', { at: 0.95, from: [0.14, 0.34], offFrom: [160, 24], to: 'T', offTo: [0, -50], dur: 0.9, n: 120, life: 0.55, w: 92, size: 1.3, spread: 'enemies', fanGap: 0.1 }),
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
            L('dragon', { at: 1.35, pos: [0.1, 0.3], s: 2.0, dur: 1.9, color: '#27576a', belly: '#9fe0d0', flame: '#ff9a30' }),
            L('breath', { at: 1.95, from: [0.1, 0.3], offFrom: [236, 40], to: 'T', offTo: [0, -50], dur: 1.1, n: 170, life: 0.6, w: 170, size: 2.0, reach: 1.15, spread: 'enemies', fanGap: 0.08 }),
            L('wash', { at: 2.1, dur: 0.75, color: '#ff8a1a', a: 0.85, curve: 'in' }),
            L('wash', { at: 2.45, dur: 0.6, color: '#fff4d0', a: 0.95, add: true }),
            L('emit', { at: 2.2, dur: 1.0, pos: [0.5, 0.5], box: [560, 300], n: 40, life: 0.8, shape: 'spark', colors: ['#ffd27a', '#ff7a1a'], v: [60, -40], vr: [120, 60] }),
        ],
        DOOMSLAYER: () => [
            dark(0.45),
            L('circle', { at: 0.05, pos: 'C', r: 70, dur: 1.1, color: '#ff3a2a' }),
            L('fall', { at: I - 0.42, pos: 'T', kind: 'meteor', n: 8, gap: 0.07, fall: 0.32, spreadX: 240, spreadY: 80, land: 'k_regular', landW: 190, color: '#ff3a2a', spread: 'enemies' }),
            L('rings', { at: I + 0.15, pos: 'T', n: 2, gap: 0.12, color: '#ff3a2a', r: 180, spread: 'enemies', fanGap: 0.09 }),
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
        ELEMENTALIST: () => [
            L('circle', { at: 0.05, pos: 'C', r: 80, dur: 1.2, color: '#7ad7ff', points: 6 }),
            L('elements', { at: 0.2, dur: I - 0.2 + 0.05, pos: 'T', fuseUp: 110, s: 1 }),
            { fx: 'white_burst', at: I, pos: 'T', w: 380, add: true, spread: 'enemies', fanGap: 0.08 },
            { fx: 'k_sonic', at: I, pos: 'T', w: 300, spread: 'enemies', fanGap: 0.08 },
            L('rings', { at: I, pos: 'T', n: 4, gap: 0.08, color: '#ff6a1a', r: 190, spread: 'enemies', fanGap: 0.08 }),
            L('rings', { at: I + 0.04, pos: 'T', n: 3, gap: 0.08, color: '#59d2ff', r: 160, spread: 'enemies', fanGap: 0.08 }),
            L('emit', { at: I, dur: 0.7, pos: 'T', box: [120, 40], n: 30, life: 0.9, shape: 'spark', colors: ['#ff6a1a', '#59d2ff', '#ffe84a', '#a8ff7a'], v: [0, -80], vr: [100, 50], g: 120 }),
            flash('#ffffff', 0.5),
        ],
        AVATAR: () => [
            dark(0.4),
            L('circle', { at: 0.05, pos: 'C', r: 105, dur: 1.4, color: '#ffffff', points: 6, spin: 2.2 }),
            L('emit', { at: 0.1, dur: 1.0, pos: 'C', box: [80, 30], n: 26, life: 0.9, shape: 'spark', colors: ['#ff6a1a', '#59d2ff', '#ffe84a', '#a8ff7a'], v: [0, -110], vr: [60, 30] }),
            L('elements', { at: 0.2, dur: I - 0.2 + 0.05, pos: 'T', fuseUp: 120, s: 1.5 }),
            { fx: 'white_burst', at: I, pos: 'T', w: 440, add: true, spread: 'enemies', fanGap: 0.08 },
            { fx: 'k_sonic', at: I, pos: 'T', w: 360, spread: 'enemies', fanGap: 0.08 },
            L('rings', { at: I, pos: 'T', n: 4, gap: 0.08, color: '#ffffff', r: 220, spread: 'enemies', fanGap: 0.08 }),
            L('emit', { at: I, dur: 0.8, pos: 'T', box: [160, 50], n: 40, life: 1, shape: 'spark', colors: ['#ff6a1a', '#59d2ff', '#ffe84a', '#a8ff7a'], v: [0, -90], vr: [130, 60], g: 120 }),
            flash('#ffffff', 0.6),
        ],
        // ── void / time / tinker ───────────────────────────────────────────
        // black holes open on every enemy and swallow them
        ARCHMAGE: () => [
            L('wash', { at: 0.1, dur: I + 0.8, color: '#04000c', a: 0.4 }),
            L('circle', { at: 0.05, pos: 'C', r: 90, dur: 1.5, color: '#a56bff', points: 6, spin: 2 }),
            L('emit', { at: 0.1, dur: 1.0, pos: 'C', box: [80, 30], n: 22, life: 0.8, shape: 'star', colors: ['#a56bff', '#e6d4ff'], v: [0, -80], vr: [40, 20], swirl: 4 }),
            L('vortex', { at: 0.45, pos: 'T', hy: 60, R: 200, twist: 8, pull: 3.2, hole: 24, rim: '#b78bff', dur: 1.7, inFrac: 0.35, outFrom: 0.8, spread: 'enemies', fanGap: 0.06 }),
            L('focus', { at: 0.75, dur: 1.4, mode: 'suck', hit: I + 0.3 }),
            L('rings', { at: I + 0.35, pos: 'T', n: 3, gap: 0.1, color: '#a56bff', r: 170, spread: 'enemies', fanGap: 0.06 }),
            flash('#c4a4ff', 0.4, I + 0.4, 0.2),
        ],
        // colours invert (the caster stays normal), zoom in, the enemy just loses health
        VOIDWALKER: () => [
            L('circle', { at: 0.05, pos: 'C', r: 80, dur: 1.3, color: '#7a4cff', points: 5, spin: 2 }),
            L('emit', { at: 0.1, dur: 0.9, pos: 'C', box: [70, 20], n: 18, life: 0.8, shape: 'star', colors: ['#7a4cff', '#e6d4ff'], v: [0, -80], vr: [40, 20], swirl: 4 }),
            L('invert', { at: 0.5, dur: I + 0.55, fin: 0.12, fout: 0.3 }),
            L('camera', { at: 0.5, dur: 1.0, dz: 0.07 }),
            L('ripple', { at: I - 0.05, pos: 'T', n: 3, gap: 0.1, color: '#ffffff', r: 170 }),
            flash('#ffffff', 0.4, I, 0.14),
        ],
        // a giant golden clock locks the enemy: "Locked in Time"
        CHRONOMANCER: () => stopTimeSet('#ffd98a', 105),
        // reality rewinds: contracting rings, a clock, afterimages
        TIMELORD: () => [
            L('wash', { at: 0.05, dur: I + 0.2, color: '#1a1204', a: 0.3 }),
            L('circle', { at: 0.05, pos: 'T', off: [0, -120], r: 190, dur: I + 0.2, color: '#ffe27a', clock: true, ratio: 0.84, spin: -1.6, ticks: 24 }),
            L('ripple', { at: 0.25, pos: 'T', n: 5, gap: 0.14, color: '#ffe27a', r: 230, inward: true, dur: 0.7, dash: true }),
            L('focus', { at: 0.5, dur: 1.0, mode: 'echo', hit: I }),
            L('emit', { at: 0.1, dur: 1.2, pos: 'T', box: [180, 70], n: 24, life: 1, shape: 'star', colors: ['#ffe27a', '#ffffff'], v: [0, -30], vr: [30, 20], swirl: 3 }),
            L('ripple', { at: I, pos: 'T', n: 3, gap: 0.1, color: '#fff3c4', r: 200 }),
            flash('#ffe27a', 0.4),
        ],
        // tech: a targeting reticle, then ONE laser from the sky
        ARTIFICER: () => [
            L('gears', { at: 0.1, pos: 'C', dur: 1.6, color: '#ffb04a', color2: '#8a8a99', glow: '#ffb04a' }),
            L('reticle', { at: 0.2, pos: 'T', dur: I - 0.2 + 0.1, color: '#ff3a3a' }),
            L('pillar', { at: I - 0.1, pos: 'T', w: 34, dur: 0.5, color: '#ff6a4a', mid: '#ffffff' }),
            { fx: 'white_burst', at: I, pos: 'T', w: 240, add: true },
            { fx: 'k_flash', at: I, pos: 'T', w: 200, add: true },
            L('emit', { at: I, dur: 0.5, pos: 'T', box: [60, 20], n: 14, life: 0.6, shape: 'spark', colors: ['#ffb04a', '#ffffff'], v: [0, -90], vr: [80, 40] }),
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
        ACOLYTE: () => holyBeam(0.8), PALADIN: () => holyBeam(1),
        CLERIC: () => holyBeam(0.9), SAINT: () => [...holyBeam(1.2), L('rings', { at: I + 0.1, pos: 'T', n: 3, gap: 0.1, color: '#fff2b0', r: 200 })],
        // self buffs: aura around the caster
        MONK: () => auraSelf('#fff2b0', 0.8),
        ZENMASTER: () => auraSelf('#8ae6ff', 1.0, [L('ripple', { at: I - 0.2, pos: 'C', n: 4, gap: 0.12, color: '#8ae6ff', r: 190, rise: 40 })]),
        TEMPLAR: () => [
            ...auraSelf('#fff2b0', 1.1),
            L('ripple', { at: I - 0.3, pos: 'C', n: 2, gap: 0.14, color: '#ffffff', r: 160, rise: 55, ratio: 0.9, dur: 0.9 }),
        ],
        DIVINE_FIST: () => [
            ...auraSelf('#ffb84a', 0.95),
            // the eight gates open one after another
            L('ripple', { at: 0.3, pos: 'C', n: 8, gap: 0.1, color: '#ffb84a', r: 150, rise: 50, dur: 0.6, lw: 6 }),
            L('emit', { at: 0.4, dur: 1.0, pos: 'C', box: [70, 20], n: 30, life: 0.9, shape: 'spark', colors: ['#ffb84a', '#fff2b0'], v: [0, -130], vr: [40, 30] }),
        ],
        GOD_HAND: () => auraSelf('#fff2b0', 1.3, [L('emit', { at: 0.3, dur: 1.2, pos: 'C', box: [90, 30], n: 30, life: 1, shape: 'glow', colors: ['#ffe27a', '#ffffff'], v: [0, -50], vr: [30, 20], size: 6 })]),
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
const NOSCALE = new Set(['lunge', 'focus', 'bgfill', 'invert', 'vortex', 'camera', 'hidecaster', 'dragon', 'robohand', 'scythe', 'reticle', 'staff', 'shrink', 'magicClock', 'cosmic', 'world']);
function classRecipe(cls, p, o) {
    const W = WORLD[cls], S = shiftOf(cls);
    if (!W) return classRecipeBase(cls, p, o);
    const base = classRecipeBase(cls, p, { ...o, IMPACT: o.IMPACT - S });      // recipes are written against the un-shifted impact
    if (!base) return base;
    const drop = new Set(W.drop || []);
    const moved = base.filter((t) => !drop.has(t.layer)).map((t) => ({ ...t, at: (t.at || 0) + S, ...(t.hit !== undefined ? { hit: t.hit + S } : {}) }));
    const total = (META[cls].duration || 3) + S, T3 = W.planet ? 1.7 : 1.35, wAt = T3 - 0.1;
    return [
        { layer: 'cosmic', at: 0, dur: W.planet ? 2.0 : 1.7, world: W.kind, planet: W.planet },
        { layer: 'world', under: true, at: wAt, dur: total - wAt - 0.25, kind: W.kind, sil: W.sil, fin: 0.25, fout: 0.4 },
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
