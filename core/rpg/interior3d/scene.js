'use strict';
// Builds the 3D room scene from a Homestead state (theme + placed items + rooms).
// World: Z up. Main room centred on the origin; far walls are x=-HALF (left) and y=+HALF (right).
// Grid mapping (matches the legacy 2D iso renderer): grid x runs along the right-hand back wall
// (+x world), grid y runs along the left-hand back wall (−y world).
//   cell (gx,gy) → world x = -HALF + gx·CELL,  y = HALF − gy·CELL
const path = require('path');
const { loadGLB } = require('./glb');
const { Scene } = require('./raster');
const rooms = require('../homesteadRooms');

const MODELS = path.join(__dirname, '..', '..', 'rpgasset', 'interior3d', 'models');
const catalog = require('../../rpgasset/homestead/catalog.json');
const DEFS = new Map((catalog.items || []).map((d) => [d.id, d]));

const N = rooms.N;
const CELL = 0.75;
const HALF = N * CELL / 2;           // 4.5
const WALL_SC_Z = 1.2;               // arch walls are 2.5m; stretched for the larger room
const WALL_H = 2.5 * WALL_SC_Z;      // 3.0
const FLOOR_T = 0.08;
const LOFT_Z = 1.55;
const PIECE = 2.08;

const TIERS = {
    1: ['tier01_rustic_plank_wall', 'tier01_rustic_plank_wall_with_window', null],
    2: ['tier02_half_timber_wall', 'tier02_half_timber_wall_with_window', null],
    3: ['tier03_brick_masonry_wall', 'tier03_brick_masonry_wall_with_window', null],
    4: ['tier04_rubble_stone_wall', 'tier04_rubble_stone_wall_with_window', null],
    5: ['tier05_dressed_stone_wall', 'tier05_dressed_stone_wall_with_window', null],
};
const THEME_WALL = {
    oakhaven:    { tier: 2, tint: [1.14, 1.0, 0.8] },
    stonehearth: { tier: 4, tint: [1.05, 1.0, 0.92] },
    sunspire:    { tier: 1, tint: [1.1, 1.0, 0.8] },
    tidecourt:   { tier: 3, tint: [0.8, 1.0, 1.05] },
    arcaneum:    { tier: 5, tint: [1.0, 0.85, 1.1] },
    blackvault:  { tier: 4, tint: [0.55, 0.55, 0.6] },
};
const THEME_FLOOR = {
    oakhaven: 'floor_mvm_wooddark', stonehearth: 'floor_mvm_brick', sunspire: 'floor_mvm_woodlight',
    tidecourt: 'floor_mvm_redbrick', arcaneum: 'floor_mvm_wooddark', blackvault: 'floor_mvm_unevenbrick',
};

const cellX = (gx) => -HALF + gx * CELL;
const cellY = (gy) => HALF - gy * CELL;      // grid y goes toward −world y

async function model(sub, name) {
    try { return await loadGLB(path.join(MODELS, sub, name.endsWith('.glb') ? name : name + '.glb')); } catch (e) { return null; }
}
function rngMake(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function effFoot(p, d) {
    const r = ((p.r != null ? p.r : (p.f ? 2 : 0)) % 4 + 4) % 4;
    return (r % 2 === 1 && d.fw !== d.fh) ? { fw: d.fh, fh: d.fw, r } : { fw: d.fw, fh: d.fh, r };
}

async function buildScene(state, opts = {}) {
    const sc = new Scene();
    const theme = state.theme || 'oakhaven';
    const rec = { annex: state.annex || [], upper: !!state.upper };
    const annex = rooms.annexList(rec);
    const aKind = (side) => { const a = annex.find((q) => q.side === side); return a ? a.kind : null; };
    const style = rooms.STYLES[state.style] || rooms.STYLES.default;
    const tw = THEME_WALL[theme] || THEME_WALL.oakhaven;
    const tier = state.style && state.style !== 'default' ? style.tier : tw.tier;
    const tint = state.style && state.style !== 'default' ? null : tw.tint;
    const [wallName, winName] = TIERS[tier] || TIERS[2];
    const wallM = await model('arch', wallName), winM = await model('arch', winName);
    const floorM = await model('floors', THEME_FLOOR[theme] || 'floor_mvm_wooddark');
    const rr = rngMake(7);

    // regions (grid rects)
    const rects = [{ x0: 0, y0: 0, x1: N, y1: N, id: 'main' }];
    for (const a of annex) { const r = rooms.SIDES[a.side]; rects.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, id: a.side }); }
    const bnd = rooms.areaBounds(rec);

    // ── slab + floor tiles per region ──
    for (const r of rects) {
        const cx = (cellX(r.x0) + cellX(r.x1)) / 2, cy = (cellY(r.y0) + cellY(r.y1)) / 2;
        sc.addBox([cx, cy, -0.33], [(r.x1 - r.x0) * CELL + 0.2, (r.y1 - r.y0) * CELL + 0.2, 0.5], [0.46, 0.45, 0.42]);
        for (let gx = r.x0; gx < r.x1; gx++) for (let gy = r.y0; gy < r.y1; gy++) {
            const x = cellX(gx) + CELL / 2, y = cellY(gy) - CELL / 2;
            if (floorM) sc.addModel(floorM, { pos: [x, y, -FLOOR_T], scale: [CELL, CELL, 1] });
            else sc.addBox([x, y, -FLOOR_T / 2], [CELL, CELL, FLOOR_T], [0.45, 0.3, 0.17]);
        }
    }
    // stone faces on the camera-facing edges of every region
    for (const r of rects) {
        const nS = Math.round((r.x1 - r.x0) * 2);
        for (let i = 0; i < nS; i++) {
            const t = (i + 0.5) / nS, g = 0.5 + rr() * 0.12;
            sc.addBox([cellX(r.x0) + t * (r.x1 - r.x0) * CELL, cellY(r.y1) - 0.05, -0.34], [(r.x1 - r.x0) * CELL / nS * 0.97, 0.32, 0.6], [g, g * 0.98, g * 0.9]);
        }
        const nE = Math.round((r.y1 - r.y0) * 2);
        for (let i = 0; i < nE; i++) {
            const t = (i + 0.5) / nE, g = 0.5 + rr() * 0.12;
            sc.addBox([cellX(r.x1) + 0.05, cellY(r.y1) + t * (r.y1 - r.y0) * CELL, -0.34], [0.32, (r.y1 - r.y0) * CELL / nE * 0.97, 0.6], [g, g * 0.98, g * 0.9]);
        }
    }

    // ── walls ──
    // run(axis,'R'|'L', boundary b, from, to, {z0, doorCells, win, hs}): R = along gx at fixed gy-boundary (yaw 0),
    // L = along gy at fixed gx-boundary (yaw 90). `from`/`to` in grid cells.
    const doorCells = rooms.DOOR_GAP;
    function runWall(kind, b, from, to, o = {}) {
        const z0 = o.z0 || 0, hs = o.hs || WALL_SC_Z;
        const segs = [];
        if (o.door) {
            const d0 = from + doorCells[0], d1 = from + doorCells[1] + 1;
            if (d0 > from) segs.push([from, d0]);
            if (to > d1) segs.push([d1, to]);
        } else segs.push([from, to]);
        for (const [a, c] of segs) {
            const len = (c - a) * CELL, n = Math.max(1, Math.round(len / PIECE)), pw = len / n, sx = pw / PIECE;
            for (let i = 0; i < n; i++) {
                const mid = a * CELL + (i + 0.5) * pw;
                const isWin = o.win && Math.abs(mid - (o.winAt || (from * CELL + (to - from) * CELL / 2))) < pw / 2 + 1e-6;
                const m = isWin && winM ? winM : wallM;
                if (kind === 'R') sc.addModel(m, { pos: [-HALF + mid, cellY(b) + 0.12 - 0.12 * 0, z0], scale: [sx, 1, 1], sz: hs, tint });
                else sc.addModel(m, { pos: [cellX(b) - 0.12, HALF - mid, z0], yaw: 90, scale: [sx, 1, 1], sz: hs, tint });
                if (isWin && !o.noGlass && z0 === 0) {
                    if (kind === 'L') sc.addBox([cellX(b) - 0.32, HALF - mid, 1.6], [0.04, pw * 0.38, 1.0], [0.93, 0.78, 0.4]);
                    else sc.addBox([-HALF + mid, cellY(b) + 0.32, 1.6], [pw * 0.38, 0.04, 1.0], [0.93, 0.78, 0.4]);
                }
            }
        }
        if (o.door) {   // timber door frame in the gap
            const mid = (from + (doorCells[0] + doorCells[1] + 1) / 2) * CELL;
            const df = null;
            o.frames && o.frames.push({ kind, b, mid });
        }
    }
    const frames = [];
    const kN = aKind('n'), kW = aKind('w'), kE = aKind('e'), kS = aKind('s');
    const winSpot = HALF * 0 + N * CELL * 0.5;
    // main right wall (y=+HALF boundary 0): open n removes it, walled n gets a door
    if (kN !== 'open') runWall('R', 0, 0, N, { door: kN === 'walled', frames, win: false });
    // main left wall: open w removes it, walled w gets a door
    if (kW !== 'open') runWall('L', 0, 0, N, { door: kW === 'walled', frames, win: kW !== 'walled', winAt: N * CELL * 0.5 });
    // continuations of the back walls over side annexes
    if (kW) runWall('R', 0, -rooms.DEPTH, 0, {});
    if (kE) runWall('R', 0, N, N + rooms.DEPTH, { win: true });
    if (kN) runWall('L', 0, -rooms.DEPTH, 0, {});
    if (kS) runWall('L', 0, N, N + rooms.DEPTH, { win: true });
    // far walls of the annexes
    if (kN) runWall('R', -rooms.DEPTH, 0, N, { win: true });
    if (kW) runWall('L', -rooms.DEPTH, 0, N, { win: true });
    // low partitions on the camera-facing sides (so the main room is never hidden)
    const lowSeg = (axis, line, from, to) => {
        const segs = [[from, from + rooms.DOOR_GAP[0]], [from + rooms.DOOR_GAP[1] + 1, to]];
        for (const [a, c] of segs) {
            const len = (c - a) * CELL;
            if (axis === 'x') sc.addBox([cellX(line), (cellY(a) + cellY(c)) / 2, 0.38], [0.2, len, 0.76], [0.55, 0.38, 0.22]);
            else sc.addBox([(cellX(a) + cellX(c)) / 2, cellY(line), 0.38], [len, 0.2, 0.76], [0.55, 0.38, 0.22]);
        }
        const mid = (from + (rooms.DOOR_GAP[0] + rooms.DOOR_GAP[1] + 1) / 2);
        const px = axis === 'x' ? cellX(line) : cellX(mid), py = axis === 'x' ? cellY(mid) : cellY(line);
        for (const s of [-1, 1]) {
            const off = s * (rooms.DOOR_GAP[1] - rooms.DOOR_GAP[0] + 1) * CELL / 2;
            sc.addBox(axis === 'x' ? [px, py + off, 0.55] : [px + off, py, 0.55], [0.18, 0.18, 1.1], [0.35, 0.2, 0.1]);
        }
    };
    if (kE === 'walled') lowSeg('x', N, 0, N);
    if (kS === 'walled') lowSeg('y', N, 0, N);

    // door frames in partitions + exterior door
    const doorM = await model('arch', 'medieval_arch_doorframe');
    for (const f of frames) {
        if (!doorM) break;
        if (f.kind === 'R') sc.addModel(doorM, { pos: [-HALF + f.mid, cellY(f.b) - 0.02, 0], scale: [1.35, 1, 1], sz: 1.2 });
        else sc.addModel(doorM, { pos: [cellX(f.b) - 0.02, HALF - f.mid, 0], yaw: 90, scale: [1.35, 1, 1], sz: 1.2 });
    }
    if (kN !== 'open' && kN !== 'walled' && doorM) {
        const doorC = HALF - 1.5;
        sc.addModel(doorM, { pos: [doorC, HALF - 0.02, 0], scale: [1.15, 1.0, 1.0], sz: 1.2 });
        sc.addBox([doorC, HALF + 0.14, 1.2], [1.02, 0.07, 2.35], [0.38, 0.2, 0.1]);
    }

    // ── loft (upper floor) ──
    if (state.upper) {
        const L = rooms.LOFT, lx0 = cellX(L.x0), lx1 = cellX(L.x1), ly1 = cellY(L.y0), ly0 = cellY(L.y1);
        const w = lx1 - lx0, dp = ly1 - ly0, cx = (lx0 + lx1) / 2, cy = (ly0 + ly1) / 2;
        const nP = Math.round(dp / 0.24);
        for (let i = 0; i < nP; i++) {
            const y = ly0 + (i + 0.5) * dp / nP, g = 0.78 + rr() * 0.4;
            sc.addBox([cx, y, LOFT_Z - 0.06], [w, dp / nP * 0.96, 0.12], [0.52 * g, 0.31 * g, 0.16 * g]);
        }
        sc.addBox([cx, cy, LOFT_Z - 0.16], [w, dp, 0.2], [0.28, 0.16, 0.09]);
        sc.addBox([cx, ly0, LOFT_Z - 0.28], [w + 0.1, 0.14, 0.14], [0.24, 0.13, 0.07]);
        sc.addBox([lx1, cy, LOFT_Z - 0.28], [0.14, dp + 0.1, 0.14], [0.24, 0.13, 0.07]);
        for (const [px, py] of [[lx0 + 0.1, ly0 + 0.08], [(lx0 + lx1) / 2, ly0 + 0.08], [lx1 - 0.08, ly0 + 0.08], [lx1 - 0.08, (ly0 + ly1) / 2], [lx1 - 0.08, ly1 - 0.1]])
            sc.addBox([px, py, LOFT_Z / 2], [0.16, 0.16, LOFT_Z], [0.26, 0.14, 0.08]);
        const rail = await model('arch', 'balcony_railing_segment_2m');
        if (rail) {
            const nF = Math.max(1, Math.round(w / 2)), sf = w / nF / 2.0;
            for (let i = 0; i < nF; i++) sc.addModel(rail, { pos: [lx0 + (i + 0.5) * w / nF, ly0, LOFT_Z], scale: [sf, 1, 1] });
            const nR = Math.max(1, Math.round(dp / 2)), sr = dp / nR / 2.0;
            for (let i = 0; i < nR; i++) {
                const yc = ly0 + (i + 0.5) * dp / nR;
                if (Math.abs(yc - (cellY(5) - CELL / 2)) < 0.9) continue;     // stair landing opening
                sc.addModel(rail, { pos: [lx1 - 0.02, yc, LOFT_Z], yaw: 90, scale: [sr, 1, 1] });
            }
        }
        // stairs: cells x 6..8, y 5 — climb toward −x, top flush with the loft edge
        const nSt = 10, runL = 3 * CELL / nSt, rise = LOFT_Z / nSt, sw = CELL * 0.9, sy = cellY(5) - CELL / 2;
        for (let i = 0; i < nSt; i++) {
            const xc = lx1 + (i + 0.5) * runL, h = LOFT_Z - i * rise, g = 0.85 + (i % 2) * 0.12;
            sc.addBox([xc, sy, h / 2], [runL * 0.98, sw, h], [0.50 * g, 0.29 * g, 0.15 * g]);
        }
        for (const sd of [-sw / 2 - 0.05, sw / 2 + 0.05]) for (let i = 0; i < nSt; i++) {
            const xc = lx1 + (i + 0.5) * runL, h = LOFT_Z - i * rise + 0.12;
            sc.addBox([xc, sy + sd, h / 2], [runL * 1.02, 0.1, h], [0.24, 0.13, 0.07]);
        }
        // second-floor walling: the back walls rise another storey over the loft
        if (state.upperWalls) {
            const R0 = -HALF, ln = L.x1 * CELL, n1 = Math.max(1, Math.round(ln / PIECE)), pw = ln / n1, sx = pw / PIECE;
            for (let i = 0; i < n1; i++) {
                sc.addModel(i === 1 && winM ? winM : wallM, { pos: [R0 + (i + 0.5) * pw, HALF + 0.12, WALL_H], scale: [sx, 1, 1], sz: WALL_SC_Z * 0.8, tint });
                sc.addModel(i === 1 && winM ? winM : wallM, { pos: [-HALF - 0.12, HALF - (i + 0.5) * pw, WALL_H], yaw: 90, scale: [sx, 1, 1], sz: WALL_SC_Z * 0.8, tint });
            }
            sc.addBox([R0 + ln / 2, HALF + 0.2, WALL_H + 2.0 + 0.06], [ln + 0.2, 0.34, 0.12], [0.3, 0.18, 0.1]);
            sc.addBox([-HALF - 0.2, HALF - ln / 2, WALL_H + 2.0 + 0.06], [0.34, ln + 0.2, 0.12], [0.3, 0.18, 0.1]);
        }
    }

    // ── placed items ──
    const placed = (state.placed || []).map((p) => ({ p, def: DEFS.get(p.item) })).filter((o) => o.def);
    for (const o of placed) await addPiece(sc, o.p, o.def);

    // grid overlay (placement preview)
    if (opts.grid) {
        const g = opts.grid, fw = g.fw || 1, fh = g.fh || 1, z = (g.lvl === 1 ? LOFT_Z : 0) + 0.02;
        const col = g.valid !== false ? [0.95, 0.8, 0.25] : [0.9, 0.25, 0.2];
        for (let i = 0; i < fw; i++) for (let j = 0; j < fh; j++) {
            sc.addBox([cellX(g.x + i) + CELL / 2, cellY(g.y + j) - CELL / 2, z], [CELL * 0.9, CELL * 0.9, 0.02], col);
        }
    }

    sc.bounds = { x0: cellX(bnd.x0), x1: cellX(bnd.x1), y0: cellY(bnd.y1), y1: cellY(bnd.y0), zTop: (state.upperWalls ? WALL_H * 1.8 : WALL_H) };
    return sc.finalize();
}


const BED_PALETTES = {
    bed_bedroll: { frame: [0.28, 0.17, 0.09], frameLight: [0.48, 0.31, 0.16], mattress: [0.46, 0.29, 0.17], sheet: [0.75, 0.63, 0.47], blanket: [0.32, 0.18, 0.12], trim: [0.77, 0.55, 0.27], pillow: [0.79, 0.72, 0.59], head: 0.38, roll: true },
    bed_traveller: { frame: [0.25, 0.15, 0.08], frameLight: [0.47, 0.29, 0.13], mattress: [0.79, 0.73, 0.60], sheet: [0.91, 0.85, 0.71], blanket: [0.13, 0.34, 0.38], trim: [0.76, 0.53, 0.25], pillow: [0.91, 0.86, 0.75], head: 0.61 },
    bed_rustic: { frame: [0.20, 0.12, 0.07], frameLight: [0.40, 0.24, 0.11], mattress: [0.77, 0.68, 0.53], sheet: [0.89, 0.80, 0.65], blanket: [0.48, 0.22, 0.12], trim: [0.78, 0.49, 0.20], pillow: [0.91, 0.85, 0.73], head: 0.64 },
    bed_forest: { frame: [0.20, 0.14, 0.08], frameLight: [0.40, 0.30, 0.14], mattress: [0.76, 0.73, 0.60], sheet: [0.88, 0.83, 0.66], blanket: [0.13, 0.32, 0.19], trim: [0.46, 0.58, 0.24], pillow: [0.90, 0.87, 0.72], head: 0.69 },
    bed_lake: { frame: [0.20, 0.13, 0.09], frameLight: [0.38, 0.24, 0.13], mattress: [0.74, 0.79, 0.78], sheet: [0.86, 0.92, 0.91], blanket: [0.08, 0.24, 0.43], trim: [0.24, 0.65, 0.75], pillow: [0.88, 0.93, 0.92], head: 0.68 },
    bed_cloud: { frame: [0.45, 0.48, 0.57], frameLight: [0.68, 0.71, 0.80], mattress: [0.85, 0.86, 0.95], sheet: [0.95, 0.94, 1.00], blanket: [0.45, 0.53, 0.83], trim: [0.77, 0.83, 1.00], pillow: [0.97, 0.96, 1.00], head: 0.78, ornate: true },
    bed_noble: { frame: [0.15, 0.09, 0.05], frameLight: [0.38, 0.24, 0.10], mattress: [0.78, 0.70, 0.55], sheet: [0.92, 0.85, 0.70], blanket: [0.30, 0.12, 0.35], trim: [0.87, 0.66, 0.20], pillow: [0.96, 0.89, 0.73], head: 0.84, ornate: true },
    bed_royal: { frame: [0.11, 0.07, 0.04], frameLight: [0.57, 0.36, 0.10], mattress: [0.80, 0.73, 0.60], sheet: [0.95, 0.88, 0.73], blanket: [0.40, 0.06, 0.12], trim: [0.95, 0.75, 0.28], pillow: [0.98, 0.91, 0.77], head: 0.94, ornate: true },
};
const BED_IDS = new Set(Object.keys(BED_PALETTES));

/** Shared stylised bed geometry: one definition is used in room placement and shop thumbnails. */
function addBedGeometry(sc, id, def, options = {}) {
    const placed = options.placed || { x: 0, y: 0, r: 0, lvl: 0 };
    const foot = options.foot || effFoot(placed, def);
    const centered = options.centered === true;
    const cx = centered ? 0 : cellX(placed.x || 0) + foot.fw * CELL / 2;
    const cy = centered ? 0 : cellY(placed.y || 0) - foot.fh * CELL / 2;
    const z = options.z === undefined ? ((placed.lvl || 0) === 1 ? LOFT_Z : 0) : options.z;
    const yaw = options.yaw === undefined ? (foot.r || 0) * 90 : options.yaw;
    const length = Math.max(def.fw, def.fh) * CELL * 0.86;
    const width = Math.min(def.fw, def.fh) * CELL * 0.72;
    const pal = BED_PALETTES[id] || BED_PALETTES.bed_rustic;
    const radians = yaw * Math.PI / 180;
    const co = Math.cos(radians), si = Math.sin(radians);
    const B = (rx, ry, rz, sx, sy, sz, color) => {
        const bx = rx * co - ry * si, by = rx * si + ry * co;
        sc.addBox([cx + bx, cy + by, z + rz], [sx, sy, sz], color, yaw);
    };

    if (pal.roll) {
        B(0, 0, 0.10, length * 0.96, width * 0.88, 0.16, pal.frame);
        B(0, 0, 0.20, length * 0.88, width * 0.82, 0.08, pal.blanket);
        B(length * 0.28, 0, 0.25, length * 0.20, width * 0.84, 0.04, pal.trim);
        B(-length * 0.28, 0, 0.27, length * 0.17, width * 0.31, 0.06, pal.pillow);
        B(-length * 0.28, 0, 0.305, length * 0.08, width * 0.025, 0.008, pal.trim);
        return { dx: length + 0.16, dy: width + 0.16, dz: 0.43 };
    }

    for (const lx of [-1, 1]) for (const ly of [-1, 1]) {
        B(lx * length * 0.39, ly * width * 0.37, 0.115, 0.10, 0.10, 0.23, pal.frame);
    }
    B(0, 0, 0.205, length * 0.98, width * 0.98, 0.14, pal.frame);
    B(0, -width * 0.445, 0.245, length * 0.93, width * 0.065, 0.13, pal.frameLight);
    B(0, width * 0.445, 0.245, length * 0.93, width * 0.065, 0.13, pal.frameLight);

    B(0, 0, 0.315, length * 0.91, width * 0.84, 0.15, pal.mattress);
    B(0, 0, 0.398, length * 0.87, width * 0.80, 0.025, pal.sheet);
    B(length * 0.145, 0, 0.425, length * 0.56, width * 0.80, 0.035, pal.blanket);
    B(length * 0.355, 0, 0.448, length * 0.11, width * 0.82, 0.025, pal.trim);
    for (const s of [-1, 0, 1]) {
        B(length * (0.02 + s * 0.105), 0, 0.447, length * 0.018, width * 0.62, 0.008, pal.frameLight);
    }
    for (const py of [-1, 1]) {
        B(-length * 0.275, py * width * 0.205, 0.445, length * 0.19, width * 0.31, 0.065, pal.pillow);
        B(-length * 0.275, py * width * 0.205, 0.481, length * 0.13, width * 0.022, 0.008, pal.sheet);
    }

    const head = pal.head || 0.64;
    B(-length * 0.455, 0, head / 2, 0.12, width * 1.12, head, pal.frame);
    B(-length * 0.455 + 0.062, 0, head * 0.52, 0.018, width * 0.78, head * 0.48, pal.frameLight);
    B(-length * 0.455 + 0.075, 0, head * 0.81, 0.026, width * 0.92, 0.075, pal.trim);
    B(length * 0.455, 0, 0.29, 0.09, width * 1.06, 0.34, pal.frame);
    if (pal.ornate) {
        for (const py of [-1, 1]) {
            B(-length * 0.455, py * width * 0.51, head + 0.035, 0.13, 0.13, 0.12, pal.trim);
            B(-length * 0.455 + 0.08, py * width * 0.32, head * 0.58, 0.025, width * 0.10, head * 0.15, pal.trim);
        }
    }
    return { dx: length + 0.20, dy: width + 0.22, dz: head + 0.18 };
}

// ── v5 SHARED PIECE PLACEMENT ────────────────────────────────────────────────
const zOf = (p) => ((p.lvl || 0) === 1 ? LOFT_Z : 0);

/** place ONE furniture piece into a scene — shared by buildScene, the v5
 *  selection-highlight pass and the shop-thumb builder, so a highlighted
 *  piece lands at the EXACT world transform it has in the full room raster */
async function addPiece(sc, p, def) {
    const e = effFoot(p, def);
    if (BED_IDS.has(p.item)) {
        addBedGeometry(sc, p.item, def, { placed: p, foot: e });
        return;
    }
    const m = await model('furniture', p.item);
    if (def.layer === 'rug') {
        const cx = cellX(p.x) + e.fw * CELL / 2, cy = cellY(p.y) - e.fh * CELL / 2, z = zOf(p) + (p.lvl ? 0.01 : 0);
        if (!m) { sc.addBox([cx, cy, z + 0.015], [e.fw * CELL * 0.92, e.fh * CELL * 0.92, 0.03], [0.5, 0.2, 0.2]); return; }
        const dx = m.max[0] - m.min[0], dy = m.max[1] - m.min[1];
        const rot = (dx < dy) !== (e.fw < e.fh);
        const ax = rot ? dy : dx, ay = rot ? dx : dy;
        sc.addModel(m, { pos: [cx, cy, z], yaw: rot ? 90 : 0, scale: [e.fw * CELL * 0.94 / ax, e.fh * CELL * 0.94 / ay, 1], sz: 1.2 });
        return;
    }
    if (def.layer === 'wall') {
        if (!m) return;
        sc.addModel(m, { pos: [cellX(p.x) + CELL / 2, HALF - 0.02, 0.9], scale: 1.6 });
        return;
    }
    const cx = cellX(p.x) + e.fw * CELL / 2, cy = cellY(p.y) - e.fh * CELL / 2, z = zOf(p);
    if (!m) { sc.addBox([cx, cy, z + 0.3], [e.fw * CELL * 0.8, e.fh * CELL * 0.8, 0.6], [0.5, 0.35, 0.2]); return; }
    const dx = m.max[0] - m.min[0], dy = m.max[1] - m.min[1];
    const rot0 = (dx < dy) !== (def.fw < def.fh) && def.fw !== def.fh;     // native long axis vs catalog footprint
    const ax = rot0 ? dy : dx, ay = rot0 ? dx : dy;
    let s = Math.min(def.fw * CELL * 1.02 / ax, def.fh * CELL * 1.02 / ay);
    s = Math.max(0.9, Math.min(s, 2.0));
    const yaw = (rot0 ? 90 : 0) + e.r * 90;
    const midx = (m.min[0] + m.max[0]) / 2, midy = (m.min[1] + m.max[1]) / 2;
    const yr = yaw * Math.PI / 180, co = Math.cos(yr), si = Math.sin(yr);
    sc.addModel(m, { pos: [cx - (midx * co - midy * si) * s, cy - (midx * si + midy * co) * s, z], yaw, scale: s });
}

/** v5 SELECTION HIGHLIGHT — the selected piece built ALONE ({item,x,y,r,f,lvl}
 *  = a placed piece or a pending-placement ghost) so renderInterior can
 *  composite it glowing OVER walls: annex pieces hidden behind the main back
 *  walls, ground pieces under the loft slab — all stay visible while selected
 *  (owner 2026-10-24 21:00Z "anything that is selected should glow and be
 *  visible through walls"). */
async function buildHighlight(hl) {
    const def = DEFS.get(hl && hl.item);
    if (!def) return null;
    const sc = new Scene();
    await addPiece(sc, { item: hl.item, x: hl.x || 0, y: hl.y || 0, r: hl.r, f: hl.f, lvl: hl.lvl || 0 }, def);
    if (!sc.nTri) return null;
    return sc.finalize();
}

/** v5 3D SHOP THUMBS — one furniture piece centred on a floor tile for the
 *  outfitter / inventory cards (owner 2026-10-24 21:00Z: "the items in the
 *  shop, the images are still the old 2d ones not the new 3d ones"). Sets
 *  sc.itemBBox = {dx,dy,dz} of the CENTRED piece for camera auto-fit. */
async function buildItemScene(id) {
    const def = DEFS.get(id);
    if (BED_IDS.has(id) && def) {
        const sc = new Scene();
        const bbox = addBedGeometry(sc, id, def, {
            centered: true,
            placed: { x: 0, y: 0, r: 0, lvl: 0 },
            foot: { fw: def.fw, fh: def.fh, r: 0 },
            z: 0,
        });
        const floorM = await model('floors', THEME_FLOOR.oakhaven);
        if (floorM) sc.addModel(floorM, { pos: [0, 0, -FLOOR_T], scale: [bbox.dx * 1.12, bbox.dy * 1.12, 1] });
        sc.itemBBox = bbox;
        return sc.finalize();
    }

    const m = await model('furniture', id);
    if (!m) return null;
    const sc = new Scene();
    const cx = (m.min[0] + m.max[0]) / 2, cy = (m.min[1] + m.max[1]) / 2;
    const dx = Math.max(m.max[0] - m.min[0], 0.35), dy = Math.max(m.max[1] - m.min[1], 0.35);
    sc.addModel(m, { pos: [-cx, -cy, -m.min[2]] });          // centred on origin, feet on z=0
    const floorM = await model('floors', THEME_FLOOR.oakhaven);
    if (floorM) sc.addModel(floorM, { pos: [0, 0, -FLOOR_T], scale: [dx * 1.18, dy * 1.18, 1] });
    sc.itemBBox = { dx, dy, dz: Math.max(m.max[2] - m.min[2], 0.3) };
    return sc.finalize();
}

module.exports = { buildScene, buildHighlight, buildItemScene, N, CELL, HALF, cellX, cellY, DEFS, THEME_WALL, THEME_FLOOR, LOFT_Z };
