'use strict';
// Per-class ultimate timelines (2026-10-26). Each class gets its own signature built from
// the CC0 sprite sets (rpgasset/vfx) + the procedural layers in ultimateFxLayers.js.
// classRecipe(classId, palette, {IMPACT}) -> track[] | null (null = use the style recipe).
// Tracks with `layer` are layers; others are sprite tracks (see ultimateFx.js RECIPES docs).

// 💡 VFX LAYERS (2026-10-26, owner: "the summons circle under them / the hole
// should be under"): ground-plane layers render in the UNDER pass - between
// the battlefield bg and the combatants - so circles/rifts/cracks sit beneath
// the fighters while every other fx stays above them. An explicit under in the
// track options still wins.
const GROUND_LAYERS = new Set(['circle', 'rift', 'cracks']);

function classRecipe(cls, p, { IMPACT: I }) {
    const L = (layer, o) => ({ layer, under: GROUND_LAYERS.has(layer), ...o });
    const flash = (c, a = 0.5, at = I, dur = 0.22) => L('wash', { at, dur, color: c, a, add: true });
    const dark = (a = 0.45, at = 0.1, dur = I + 0.4) => L('wash', { at, dur, color: '#05000c', a });
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
        LICH: () => [
            dark(0.55),
            L('circle', { at: 0.05, pos: 'C', r: 95, dur: 1.5, color: '#7dffe0', points: 6, spin: 2 }),
            L('beam', { at: I - 0.3, dur: 0.75, from: 'C', to: 'T', color: '#4be0c0', mid: '#b8fff0', w: 40, offFrom: [20, -50] }),
            L('rings', { at: I, pos: 'T', n: 3, gap: 0.1, color: '#7dffe0', r: 140 }),
            { fx: 'necro2', at: I, pos: 'T', w: 300, n: 2, gap: 0.14, jit: [40, 20], add: true },
            L('emit', { at: I, dur: 0.8, pos: 'T', n: 22, life: 0.9, shape: 'soul', colors: ['#7dffe0', '#ffffff'], v: [0, -80], vr: [60, 30], swirl: 4 }),
            flash('#9dfff0', 0.4),
        ],
        DEATH_LORD: () => [
            dark(0.6),
            L('blackhole', { at: 0.3, pos: 'T', r: 85, dur: 1.9, color: '#8a1020' }),
            L('crescent', { at: I - 0.05, pos: 'T', r: 190, w: 44, color: '#d0182f', mid: '#ff9aa4', n: 2, gap: 0.12, rot: [-0.5, 0.6], dur: 0.42 }),
            L('cracks', { at: I, pos: 'T', n: 8, r: 150, dur: 1.2, color: '#ff2a3a' }),
            { fx: 'necro3', at: I + 0.05, pos: 'T', w: 300, tint: ['#ff2a3a', 0.6], add: true },
            flash('#ff3a4a', 0.45),
        ],
        REAPER: () => [
            dark(0.5),
            L('dash', { at: I - 0.45, dur: 0.4, to: 'T', color: 'rgba(160,120,255,0.6)', off: [-70, 0] }),
            L('crescent', { at: I, pos: 'T', r: 200, w: 50, color: '#a58bff', mid: '#efe6ff', n: 3, gap: 0.1, rot: [-0.7, 0.5, -0.1], span: 2.6, dur: 0.45 }),
            { fx: 'destroy', at: I + 0.1, pos: 'T', w: 220, n: 2, gap: 0.14, jit: [40, 30], add: true },
            L('emit', { at: I, dur: 0.8, pos: 'T', n: 16, life: 0.9, shape: 'soul', colors: ['#c5b3ff'], v: [0, -100], vr: [40, 20] }),
            flash('#c5b3ff', 0.4),
        ],
        WARLOCK: () => [
            dark(0.5),
            L('circle', { at: 0.05, pos: 'T', r: 110, dur: 1.6, color: '#c04bff', points: 5, spin: 1.8 }),
            L('rift', { at: 0.5, pos: 'T', rx: 70, dur: 1.4, color: 'rgba(200,60,255,0.4)', lip: '#e08bff' }),
            { fx: 'dark_b', at: I - 0.3, pos: 'T', w: 330, n: 2, gap: 0.12, jit: [30, 20], alpha: 0.95, tint: ['#c04bff', 0.4] },
            L('pillar', { at: I, pos: 'T', w: 90, dur: 0.6, color: '#b03bff', mid: '#ecc4ff' }),
            flash('#d79bff', 0.45),
        ],
        VIRTUOSO: () => [
            dark(0.35),
            L('emit', { at: 0.1, dur: 1.2, pos: 'C', box: [100, 40], n: 22, life: 1, shape: 'note', colors: ['#d9b3ff', '#ff9ad5'], v: [60, -60], vr: [40, 30], size: 7 }),
            L('rings', { at: I - 0.2, pos: 'C', n: 3, gap: 0.14, color: '#d9b3ff', r: 120 }),
            L('rings', { at: I, pos: 'T', n: 3, gap: 0.1, color: '#ff9ad5', r: 150 }),
            { fx: 'dark_a', at: I, pos: 'T', w: 260, n: 2, gap: 0.12, jit: [40, 20], add: true },
            L('emit', { at: I, dur: 0.6, pos: 'T', box: [80, 30], n: 18, life: 0.9, shape: 'note', colors: ['#d9b3ff', '#fff'], v: [0, -100], vr: [80, 30], size: 7 }),
            flash('#e6c4ff', 0.35),
        ],
        // ── blades ─────────────────────────────────────────────────────────
        FIGHTER: () => bladeSet(p, I, 2, 150), WARRIOR: () => bladeSet(p, I, 2, 170),
        SAMURAI: () => [...dashStrike(I, '#cfe6ff'), L('crescent', { at: I, pos: 'T', r: 190, w: 46, color: '#9fd0ff', mid: '#ffffff', n: 3, gap: 0.09, rot: [-0.9, 0.4, -0.2], dur: 0.4 }), flash('#ffffff', 0.55, I, 0.12)],
        SHOGUN: () => [dark(0.35), ...dashStrike(I, '#ffd27a'), L('crescent', { at: I, pos: 'T', r: 210, w: 52, color: '#ffb84a', mid: '#fff0c0', n: 4, gap: 0.08, rot: [-0.9, 0.5, -0.3, 0.8], dur: 0.4 }), L('rings', { at: I + 0.1, pos: 'T', n: 2, color: '#ffd27a', r: 150 }), flash('#ffe6a8', 0.5, I, 0.14)],
        BERSERKER: () => [
            L('cracks', { at: 0.1, pos: 'C', n: 6, r: 90, dur: 0.9, color: '#ff5a2a' }),
            L('emit', { at: 0.05, dur: 0.9, pos: 'C', box: [60, 20], n: 20, life: 0.6, shape: 'spark', colors: ['#ff7a2a', '#ffd27a'], v: [0, -110], vr: [60, 30] }),
            ...dashStrike(I, '#ff7a3a'),
            L('crescent', { at: I, pos: 'T', r: 190, w: 54, color: '#ff4a1a', mid: '#ffd8a0', n: 3, gap: 0.09, rot: [-0.8, 0.7, -0.2], dur: 0.42 }),
            L('cracks', { at: I, pos: 'T', n: 9, r: 170, dur: 1.2, color: '#ff6a2a' }),
            { fx: 'fire_blast', at: I + 0.05, pos: 'T', w: 330, n: 2, jit: [50, 30], gap: 0.1 },
            flash('#ff9a5a', 0.45),
        ],
        SCOUT: () => [
            L('emit', { at: 0.1, dur: 0.7, pos: 'C', n: 10, life: 0.5, shape: 'spark', colors: ['#c9ffa8'], v: [60, -50], vr: [30, 20] }),
            L('fall', { at: I - 0.35, pos: 'T', kind: 'arrow', n: 14, gap: 0.045, fall: 0.3, slant: -110, spreadX: 210, spreadY: 80, color: '#ffe9a0', land: 'k_simple', landW: 70, landAdd: true, spread: 'enemies', fanGap: 0.05 }),
            L('rings', { at: I + 0.2, pos: 'T', n: 2, color: '#e8ffbf', r: 120 }),
            flash('#fff3c4', 0.3, I + 0.3, 0.15),
        ],
        ROGUE: () => shadowBlade(I, '#9d86ff', 4), NINJA: () => shadowBlade(I, '#6fe0ff', 5),
        KAGE: () => [dark(0.55), ...shadowBlade(I, '#b06bff', 6)],
        NIGHTBLADE: () => [dark(0.5), ...shadowBlade(I, '#ff5a7a', 5)],
        // ── fire / arcane ──────────────────────────────────────────────────
        APPRENTICE: () => [
            L('circle', { at: 0.05, pos: 'C', r: 60, dur: 1, color: '#ffb050' }),
            { fx: 'fire_bomb', at: 0.1, pos: 'C', off: [0, 10], w: 130, dur: 0.9, tint: ['#ff7a1a', 0.35], add: true, alpha: 0.9 },
            L('fall', { at: I - 0.3, pos: 'T', kind: 'meteor', n: 3, gap: 0.12, fall: 0.3, land: 'k_regular', landW: 150, color: '#ff7a1a' }),
            { fx: 'fire_blast', at: I + 0.1, pos: 'T', w: 300, n: 2, jit: [50, 30], gap: 0.1 },
            flash('#ffd28a', 0.4),
        ],
        MAGE: () => meteorStorm(I, 6, 0.08, 'k_regular', 170, '#ff7a1a', '#ffd28a'),
        DRAGONSLAYER: () => [...meteorStorm(I, 5, 0.09, 'k_regular', 190, '#ff6a1a', '#ffcf8a'), { fx: 'fire_slash', at: I + 0.1, pos: 'T', w: 300, n: 3, jit: [30, 20], gap: 0.1, rot: [0.5, -0.9, 0.2] }],
        DRAGON_LORD: () => [...meteorStorm(I, 8, 0.07, 'k_regular', 190, '#ff5a1a', '#ffcf8a'), L('cracks', { at: I + 0.3, pos: 'T', n: 7, r: 160, dur: 1, color: '#ff6a2a' })],
        DRAGON_GOD: () => [dark(0.35), ...meteorStorm(I, 10, 0.06, 'k_sonic', 210, '#ff4a1a', '#fff0c0'), L('rings', { at: I + 0.3, pos: 'T', n: 3, gap: 0.12, color: '#ffb050', r: 200 }), L('cracks', { at: I + 0.3, pos: 'T', n: 9, r: 190, dur: 1.2, color: '#ff6a2a' })],
        DOOMSLAYER: () => [dark(0.45), ...meteorStorm(I, 8, 0.07, 'k_regular', 200, '#ff3a2a', '#ffb0a0'), L('cracks', { at: I + 0.25, pos: 'T', n: 8, r: 170, dur: 1.1, color: '#ff3a2a' })],
        WARLORD: () => [...meteorStorm(I, 6, 0.08, 'k_ground', 180, '#ff8a2a', '#ffd9a0'), L('rings', { at: I + 0.15, pos: 'T', n: 2, color: '#ffb050', r: 170 })],
        ELEMENTALIST: () => [
            L('circle', { at: 0.05, pos: 'C', r: 80, dur: 1.2, color: '#7ad7ff', points: 6 }),
            L('fall', { at: I - 0.3, pos: 'T', kind: 'shard', n: 6, gap: 0.07, fall: 0.28, color: '#bff3ff', land: 'k_simple', landW: 90, landAdd: true, spread: 'enemies' }),
            { fx: 'fire_blast', at: I + 0.1, pos: 'T', w: 300, n: 2, jit: [50, 30], gap: 0.1, spread: 'enemies', fanGap: 0.08 },
            { fx: 'lightning', at: I + 0.1, pos: 'T', w: 260, n: 2, jit: [60, 0], gap: 0.09, off: [0, -80], add: true, spread: 'enemies', fanGap: 0.08 },
            L('cracks', { at: I + 0.1, pos: 'T', n: 6, r: 150, dur: 1, color: '#ffd27a', spread: 'enemies', fanGap: 0.08 }),
            flash('#e8fbff', 0.4),
        ],
        AVATAR: () => [
            dark(0.4),
            L('circle', { at: 0.05, pos: 'C', r: 100, dur: 1.4, color: '#ffffff', points: 6, spin: 2.2 }),
            L('pillar', { at: I - 0.2, pos: 'T', w: 120, dur: 0.8, color: '#7ad7ff', mid: '#ffffff', spread: 'enemies', fanGap: 0.09 }),
            L('fall', { at: I - 0.2, pos: 'T', kind: 'meteor', n: 5, gap: 0.09, fall: 0.3, land: 'k_regular', landW: 170, color: '#ff7a1a', spread: 'enemies' }),
            { fx: 'lightning', at: I + 0.1, pos: 'T', w: 300, n: 3, jit: [70, 0], gap: 0.08, off: [0, -80], add: true, spread: 'enemies', fanGap: 0.08 },
            L('rings', { at: I + 0.1, pos: 'T', n: 3, gap: 0.1, color: '#ffffff', r: 190, spread: 'enemies', fanGap: 0.09 }),
            flash('#ffffff', 0.55),
        ],
        // ── void / time / tinker ───────────────────────────────────────────
        VOIDWALKER: () => voidSet(I, '#7a4cff', 90),
        ARCHMAGE: () => [...voidSet(I, '#a56bff', 110), L('beam', { at: I - 0.25, dur: 0.6, from: 'C', to: 'T', color: '#8a5cff', mid: '#e6d4ff', w: 36, offFrom: [20, -50] })],
        CHRONOMANCER: () => timeSet(I, '#7fe6ff', 100),
        TIMELORD: () => [...timeSet(I, '#ffe27a', 120), L('circle', { at: 0.1, pos: 'C', r: 70, dur: 1.3, color: '#ffe27a', clock: true })],
        ARTIFICER: () => tinkerSet(I, '#ffb04a'),
        GRAND_INVENTOR: () => [...tinkerSet(I, '#6de9ff'), L('beam', { at: I - 0.3, dur: 0.7, from: 'C', to: 'T', color: '#6de9ff', mid: '#d6fbff', w: 44, offFrom: [20, -50] })],
        BARD: () => [
            L('emit', { at: 0.1, dur: 1.2, pos: 'C', box: [100, 40], n: 24, life: 1, shape: 'note', colors: ['#7ad7ff', '#ffe27a', '#ff9ad5'], v: [70, -50], vr: [40, 30], size: 7 }),
            L('rings', { at: I - 0.3, pos: 'C', n: 3, gap: 0.14, color: '#7ad7ff', r: 120 }),
            { fx: 'ice_beam', at: I - 0.35, pos: 'C', to: 'T', dur: 0.4, w: 200, loop: true },
            { fx: 'ice_shards', at: I + 0.05, pos: 'T', w: 300, n: 3, jit: [70, 50], gap: 0.09 },
            L('rings', { at: I, pos: 'T', n: 3, gap: 0.1, color: '#ffe27a', r: 160 }),
            flash('#dff6ff', 0.4),
        ],
        // ── holy ───────────────────────────────────────────────────────────
        ACOLYTE: () => holyBeam(I, 0.8), PALADIN: () => [...holyBeam(I, 1), L('crescent', { at: I + 0.05, pos: 'T', r: 180, w: 44, color: '#ffe27a', mid: '#ffffff', n: 2, gap: 0.12, rot: [-0.6, 0.5], dur: 0.4 })],
        CLERIC: () => holyBeam(I, 0.9), SAINT: () => [...holyBeam(I, 1.2), L('rings', { at: I + 0.1, pos: 'T', n: 3, gap: 0.1, color: '#fff2b0', r: 200 })],
        DIVINE_FIST: () => holySelf(I, 0.9), MONK: () => holySelf(I, 0.8), ZENMASTER: () => holySelf(I, 1), TEMPLAR: () => holySelf(I, 1.1), GOD_HAND: () => [...holySelf(I, 1.3), L('crescent', { at: I, pos: 'T', r: 170, w: 40, color: '#fff2b0', mid: '#fff', n: 3, gap: 0.08, rot: [-0.5, 0.6, -0.1], dur: 0.38 })],
        // ── nature / gold ──────────────────────────────────────────────────
        DRUID: () => natureSet(I, 5), ARCHDRUID: () => [...natureSet(I, 8), L('rings', { at: I + 0.2, pos: 'T', n: 3, gap: 0.12, color: '#a8ff7a', r: 190 })],
        MERCHANT: () => goldSet(I, 14), TYCOON: () => [...goldSet(I, 24), L('rings', { at: I + 0.3, pos: 'T', n: 3, gap: 0.12, color: '#ffd24a', r: 190 })],
    };

    function dashStrike(I, col) {
        return [
            L('dash', { at: I - 0.5, dur: 0.4, to: 'T', color: col, off: [-70, 0] }),
            { fx: 'white_burst', at: I - 0.08, pos: 'T', w: 240, add: true },
        ];
    }
    function bladeSet(p, I, n, r) {
        return [
            L('emit', { at: 0.05, dur: 0.8, pos: 'C', n: 12, life: 0.5, shape: 'spark', colors: ['#fff', p[1]], v: [0, -60], vr: [50, 30] }),
            ...dashStrike(I, p[1]),
            L('crescent', { at: I, pos: 'T', r, w: 44, color: p[1], mid: '#ffffff', n: n + 1, gap: 0.09, rot: [-0.8, 0.5, -0.2], dur: 0.4 }),
            { fx: 'claw', at: I + 0.05, pos: 'T', w: 280, n: 3, jit: [40, 35], gap: 0.09, rot: [-0.5, 0.3, 0.6] },
            L('cracks', { at: I + 0.05, pos: 'T', n: 5, r: 110, dur: 0.9, color: p[1] }),
            flash('#ffffff', 0.45, I, 0.12),
        ];
    }
    function shadowBlade(I, col, hits) {
        return [
            { fx: 'dark_a', at: 0.05, pos: 'C', w: 140, dur: 0.9, loop: true, alpha: 0.7 },
            L('dash', { at: I - 0.55, dur: 0.38, to: 'T', color: col, off: [-70, 0] }),
            L('crescent', { at: I - 0.05, pos: 'T', r: 170, w: 36, color: col, mid: '#ffffff', n: hits, gap: 0.07, rot: [-0.9, 0.7, -0.4, 0.9, 0.1, -0.7], jit: [50, 40], span: 1.8, dur: 0.34 }),
            { fx: 'claw', at: I, pos: 'T', w: 280, n: hits, jit: [60, 50], gap: 0.07, rot: [-0.7, 0.5, -0.3, 0.8], tint: [col, 0.8] },
            L('emit', { at: I, dur: 0.5, pos: 'T', box: [80, 40], n: 16, life: 0.7, shape: 'spark', colors: [col, '#ffffff'], v: [0, -40], vr: [90, 50] }),
            flash(col, 0.4),
        ];
    }
    function meteorStorm(I, n, gap, land, landW, col, fl) {
        return [
            L('circle', { at: 0.05, pos: 'C', r: 70, dur: 1.1, color: col }),
            { fx: 'fire_bomb', at: 0.1, pos: 'C', off: [0, 10], w: 140, dur: 0.9, tint: [col, 0.35], add: true, alpha: 0.9 },
            L('fall', { at: I - 0.35, pos: 'T', kind: 'meteor', n, gap, fall: 0.32, spreadX: 230, land, landW, color: col, landAdd: false, spread: 'enemies' }),
            L('rings', { at: I + 0.15, pos: 'T', n: 2, gap: 0.12, color: col, r: 170, spread: 'enemies', fanGap: 0.09 }),
            flash(fl, 0.2, I + 0.1, 0.15),
        ];
    }
    function voidSet(I, col, r) {
        return [
            L('wash', { at: 0.1, dur: I + 0.9, color: '#04000c', a: 0.55 }),
            L('blackhole', { at: 0.2, pos: 'T', r, dur: 2.2, color: col }),
            { fx: 'dark_bolt', at: I, pos: 'T', w: 340, n: 3, jit: [60, 40], gap: 0.09, tint: [col, 0.6] },
            L('rings', { at: I, pos: 'T', n: 3, gap: 0.1, color: col, r: 190 }),
            flash('#c4a4ff', 0.45),
        ];
    }
    function timeSet(I, col, r) {
        return [
            L('circle', { at: 0.05, pos: 'T', r, dur: 1.8, color: col, clock: true }),
            L('emit', { at: 0.1, dur: 1.2, pos: 'T', box: [160, 60], n: 22, life: 1, shape: 'star', colors: [col, '#ffffff'], v: [0, -30], vr: [30, 20], swirl: 3 }),
            { fx: 'lightning', at: I, pos: 'T', w: 280, n: 3, jit: [70, 0], gap: 0.08, off: [0, -80], add: true, tint: [col, 0.5] },
            L('rings', { at: I, pos: 'T', n: 4, gap: 0.09, color: col, r: 180 }),
            flash(col, 0.4),
        ];
    }
    function tinkerSet(I, col) {
        return [
            L('gears', { at: 0.1, pos: 'C', dur: 1.8, color: col, color2: '#8a8a99', glow: col }),
            L('emit', { at: 0.2, dur: 0.9, pos: 'C', n: 16, life: 0.6, shape: 'spark', colors: [col, '#ffffff'], v: [0, -80], vr: [60, 30] }),
            { fx: 'lightning', at: I - 0.1, pos: 'T', w: 280, n: 3, jit: [70, 0], gap: 0.08, off: [0, -80], add: true, tint: [col, 0.4] },
            { fx: 'fire_blast', at: I, pos: 'T', w: 320, n: 2, jit: [50, 30], gap: 0.1, tint: [col, 0.3] },
            L('rings', { at: I, pos: 'T', n: 3, gap: 0.1, color: col, r: 170 }),
            flash('#ffe0b0', 0.4),
        ];
    }
    function holyBeam(I, k) {
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
    function holySelf(I, k) {
        return [
            { fx: 'holy_burst', at: 0.05, pos: 'C', w: 330, add: true },
            L('circle', { at: 0.05, pos: 'C', r: 90 * k, dur: 1.6, color: '#fff2b0', points: 6 }),
            L('pillar', { at: I - 0.3, pos: 'C', w: 100 * k, dur: 0.9, color: '#fff2b0', mid: '#ffffff' }),
            { fx: 'holy_loop', at: 0.2, pos: 'C', w: 180, off: [0, -40], dur: 1.6, loop: true, add: true },
            L('dash', { at: I - 0.35, dur: 0.35, to: 'T', color: 'rgba(255,240,170,0.6)', off: [-70, 0] }),
            { fx: 'holy_burst', at: I, pos: 'T', w: 340, add: true },
            L('rings', { at: I, pos: 'T', n: 3, gap: 0.09, color: '#fff2b0', r: 170 }),
            flash('#ffffff', 0.5),
        ];
    }
    function natureSet(I, n) {
        return [
            L('emit', { at: 0.05, dur: 1.2, pos: 'C', box: [100, 30], n: 22, life: 1, shape: 'leaf', colors: ['#6bd44a', '#a8ff7a', '#3f9a2c'], v: [30, -50], vr: [30, 20], size: 6, swirl: 4 }),
            L('circle', { at: 0.1, pos: 'T', r: 100, dur: 1.5, color: '#8aff6a', points: 5 }),
            L('cracks', { at: I - 0.3, pos: 'T', n: 7, r: 130, dur: 1.2, color: '#a8ff7a', spread: 'enemies', fanGap: 0.08 }),
            L('vines', { at: I - 0.3, pos: 'T', n, dur: 1.6, color: '#3fa82a', spread: 'enemies', fanGap: 0.08 }),
            { fx: 'vine_slash', at: I + 0.1, pos: 'T', w: 300, n: 3, jit: [60, 40], gap: 0.1, rot: [-0.5, 0.4, 0.8], spread: 'enemies', fanGap: 0.08 },
            L('emit', { at: I, dur: 0.8, pos: 'T', box: [100, 30], n: 20, life: 1, shape: 'leaf', colors: ['#6bd44a', '#a8ff7a'], v: [0, -90], vr: [70, 30], size: 6, swirl: 5 }),
            flash('#d4ffb0', 0.35),
        ];
    }
    function goldSet(I, n) {
        return [
            L('emit', { at: 0.05, dur: 0.9, pos: 'C', box: [90, 20], n: 14, life: 0.8, shape: 'coin', v: [0, -90], vr: [40, 30], g: 220, size: 6 }),
            L('fall', { at: I - 0.4, pos: 'T', kind: 'coin', n: n * 2, gap: 0.035, fall: 0.34, spreadX: 240, spreadY: 80, slant: -40, land: 'k_flash', landW: 70, landAdd: true, color: '#ffd24a', spread: 'enemies', fanGap: 0.05 }),
            L('pillar', { at: I, pos: 'T', w: 90, dur: 0.6, color: '#ffd24a', mid: '#fff0b0', spread: 'enemies', fanGap: 0.09 }),
            { fx: 'white_burst', at: I, pos: 'T', w: 300, add: true, tint: ['#ffd24a', 0.7], spread: 'enemies', fanGap: 0.08 },
            L('emit', { at: I, dur: 0.9, pos: 'T', box: [120, 30], n: 26, life: 1, shape: 'coin', v: [0, -150], vr: [90, 40], g: 380, size: 6 }),
            flash('#fff0b0', 0.4),
        ];
    }
    return R[cls] ? R[cls]() : null;
}

module.exports = { classRecipe };
