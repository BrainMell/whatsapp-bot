'use strict';
// Builds the 3D room scene from a Homestead state (theme + placed items).
// World: Z up, room centred on the origin, far walls are x=-HALF (left) and y=+HALF (right).
// Grid mapping (matches the legacy 2D iso renderer): grid x runs along the right-hand back wall,
// grid y runs along the left-hand back wall.
const path = require('path');
const { loadGLB } = require('./glb');
const { Scene } = require('./raster');

const MODELS = path.join(__dirname, '..', '..', 'rpgasset', 'interior3d', 'models');
const catalog = require('../../rpgasset/homestead/catalog.json');
const DEFS = new Map((catalog.items || []).map((d) => [d.id, d]));

const N = 12;
const CELL = 0.75;
const HALF = N * CELL / 2;           // 4.5
const WALL_SC_Z = 1.2;               // arch walls are 2.5m; stretched for the larger room
const FLOOR_T = 0.08;

const THEME_WALL = {
    oakhaven:    { wall: 'tier02_half_timber_wall', win: 'tier02_half_timber_wall_with_window', tint: null },
    stonehearth: { wall: 'tier04_rubble_stone_wall', win: 'tier04_rubble_stone_wall_with_window', tint: null },
    sunspire:    { wall: 'tier01_rustic_plank_wall', win: 'tier01_rustic_plank_wall_with_window', tint: [1.1, 1.0, 0.8] },
    tidecourt:   { wall: 'tier03_brick_masonry_wall', win: 'tier03_brick_masonry_wall_with_window', tint: [0.8, 1.0, 1.05] },
    arcaneum:    { wall: 'tier05_dressed_stone_wall', win: 'tier05_dressed_stone_wall_with_window', tint: [1.0, 0.85, 1.1] },
    blackvault:  { wall: 'tier04_rubble_stone_wall', win: 'tier04_rubble_stone_wall_with_window', tint: [0.55, 0.55, 0.6] },
};
const THEME_FLOOR = {
    oakhaven: 'floor_mvm_wooddark', stonehearth: 'floor_mvm_brick', sunspire: 'floor_mvm_woodlight',
    tidecourt: 'floor_mvm_redbrick', arcaneum: 'floor_mvm_wooddark', blackvault: 'floor_mvm_unevenbrick',
};

const cellX = (gx) => -HALF + gx * CELL;
const cellY = (gy) => HALF - gy * CELL;      // grid y goes toward -world y

async function model(sub, name) {
    try { return await loadGLB(path.join(MODELS, sub, name.endsWith('.glb') ? name : name + '.glb')); } catch (e) { return null; }
}

function rngMake(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

async function buildScene(state, opts = {}) {
    const sc = new Scene();
    const theme = state.theme || 'oakhaven';
    const tw = THEME_WALL[theme] || THEME_WALL.oakhaven;

    // foundation slab + front stone faces
    sc.addBox([0, 0, -0.33], [N * CELL + 0.2, N * CELL + 0.2, 0.5], [0.46, 0.45, 0.42]);
    const rr = rngMake(7);
    const nS = N * 2;
    for (let i = 0; i < nS; i++) {
        const t = (i + 0.5) / nS, g = 0.5 + rr() * 0.12;
        sc.addBox([-HALF + t * N * CELL, -HALF - 0.05, -0.34], [N * CELL / nS * 0.97, 0.32, 0.6], [g, g * 0.98, g * 0.9]);
        const g2 = 0.5 + rr() * 0.12;
        sc.addBox([HALF + 0.05, -HALF + t * N * CELL, -0.34], [0.32, N * CELL / nS * 0.97, 0.6], [g2, g2 * 0.98, g2 * 0.9]);
    }

    // floor tiles
    const floorM = await model('floors', THEME_FLOOR[theme] || 'floor_mvm_wooddark');
    for (let gx = 0; gx < N; gx++) for (let gy = 0; gy < N; gy++) {
        const x = cellX(gx) + CELL / 2, y = cellY(gy) - CELL / 2;
        if (floorM) sc.addModel(floorM, { pos: [x, y, -FLOOR_T], scale: [CELL, CELL, 1] });
        else sc.addBox([x, y, -FLOOR_T / 2], [CELL, CELL, FLOOR_T], [0.45, 0.3, 0.17]);
    }

    // walls: right (y=+HALF) and left (x=-HALF, yaw 90)
    const wallM = await model('arch', tw.wall), winM = await model('arch', tw.win);
    const pieces = Math.ceil(N * CELL / 2.08);
    const pw = N * CELL / pieces, sx = pw / 2.08;
    for (let i = 0; i < pieces; i++) {
        const c = -HALF + (i + 0.5) * pw;
        sc.addModel(wallM, { pos: [c, HALF + 0.12, 0], scale: [sx, 1, 1], sz: WALL_SC_Z, tint: tw.tint });
        const isWin = i === Math.floor(pieces / 2);
        sc.addModel(isWin && winM ? winM : wallM, { pos: [-HALF - 0.12, -c, 0], yaw: 90, scale: [sx, 1, 1], sz: WALL_SC_Z, tint: tw.tint });
        if (isWin) sc.addBox([-HALF - 0.32, -c, 1.6], [0.04, pw * 0.38, 1.0], [0.93, 0.78, 0.4]);
    }
    const doorC = HALF - 1.5;
    const door = await model('arch', 'medieval_arch_doorframe');
    if (door) sc.addModel(door, { pos: [doorC, HALF - 0.02, 0], scale: [1.15, 1.0, 1.0], sz: 1.2 });
    sc.addBox([doorC, HALF + 0.14, 1.2], [1.02, 0.07, 2.35], [0.38, 0.2, 0.1]);

    const placed = (state.placed || []).map((p) => ({ p, def: DEFS.get(p.item) })).filter((o) => o.def);
    const rugs = placed.filter((o) => o.def.layer === 'rug');
    const items = placed.filter((o) => o.def.layer === 'item');
    const walls = placed.filter((o) => o.def.layer === 'wall');

    for (const { p, def } of rugs) {
        const m = await model('furniture', p.item);
        const fw = def.fw, fh = def.fh;
        const cx = cellX(p.x) + fw * CELL / 2, cy = cellY(p.y) - fh * CELL / 2;
        if (!m) { sc.addBox([cx, cy, 0.015], [fw * CELL * 0.92, fh * CELL * 0.92, 0.03], [0.5, 0.2, 0.2]); continue; }
        const dx = m.max[0] - m.min[0], dy = m.max[1] - m.min[1];
        const rot = (dx < dy) !== (fw < fh);
        const ax = rot ? dy : dx, ay = rot ? dx : dy;
        sc.addModel(m, { pos: [cx, cy, 0.0], yaw: rot ? 90 : 0, scale: [fw * CELL * 0.94 / ax, fh * CELL * 0.94 / ay, 1], sz: 1.2 });
    }

    for (const { p, def } of items) {
        const m = await model('furniture', p.item);
        const fw = def.fw, fh = def.fh;
        const cx = cellX(p.x) + fw * CELL / 2, cy = cellY(p.y) - fh * CELL / 2;
        if (!m) { sc.addBox([cx, cy, 0.3], [fw * CELL * 0.8, fh * CELL * 0.8, 0.6], [0.5, 0.35, 0.2]); continue; }
        const dx = m.max[0] - m.min[0], dy = m.max[1] - m.min[1];
        const rot = (dx < dy) !== (fw < fh) && fw !== fh;
        const ax = rot ? dy : dx, ay = rot ? dx : dy;
        let s = Math.min(fw * CELL * 1.02 / ax, fh * CELL * 1.02 / ay);
        s = Math.max(0.9, Math.min(s, 2.0));
        const yaw = (rot ? 90 : 0) + (p.f ? 180 : 0);
        const midx = (m.min[0] + m.max[0]) / 2, midy = (m.min[1] + m.max[1]) / 2;
        const yr = yaw * Math.PI / 180, co = Math.cos(yr), si = Math.sin(yr);
        const ox = (midx * co - midy * si) * s, oy = (midx * si + midy * co) * s;
        sc.addModel(m, { pos: [cx - ox, cy - oy, 0.0], yaw, scale: s });
    }

    for (const { p } of walls) {
        const m = await model('furniture', p.item);
        if (!m) continue;
        sc.addModel(m, { pos: [cellX(p.x) + CELL / 2, HALF - 0.02, 0.9], scale: 1.6 });
    }

    if (opts.grid) {
        const g = opts.grid, fw = g.fw || 1, fh = g.fh || 1;
        const col = g.valid !== false ? [0.95, 0.8, 0.25] : [0.9, 0.25, 0.2];
        for (let i = 0; i < fw; i++) for (let j = 0; j < fh; j++) {
            sc.addBox([cellX(g.x + i) + CELL / 2, cellY(g.y + j) - CELL / 2, 0.02], [CELL * 0.9, CELL * 0.9, 0.02], col);
        }
    }
    return sc.finalize();
}

module.exports = { buildScene, N, CELL, HALF, cellX, cellY, DEFS, THEME_WALL, THEME_FLOOR };
