'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  HOMESTEAD ROOMS — geometry, build catalogue, house styles and shop gating
//  for the 3D interior (owner 2026-10-24 "interior shop / expansions / loft").
//
//  Coordinates (shared with homestead.js + interior3d/scene.js):
//    main room  : cells x 0..11, y 0..11 (N = 12)
//    annex      : 6 cells deep, 12 wide, glued to ONE side of the main room
//                   e: x 12..17   s: y 12..17   n: y -6..-1   w: x -6..-1
//                 kind 'walled' → wall (with a 2-cell door) between the rooms
//                 kind 'open'   → no wall, the floor simply continues
//    loft       : upper floor over cells x 0..5, y 0..5 (level 1), reached by a
//                 staircase standing on cells x 6..8, y 5 (blocked at level 0)
//    loftWalls  : second-floor walling — the back walls rise a second storey
// ═══════════════════════════════════════════════════════════════════════════

const N = 12;
const DEPTH = 6;
const LOFT = { x0: 0, x1: 6, y0: 0, y1: 6 };
const STAIR_CELLS = [[6, 5], [7, 5], [8, 5]];
const DOOR_GAP = [5, 6];     // door cells along the shared boundary

const SIDES = {
    e: { x0: N, x1: N + DEPTH, y0: 0, y1: N, name: 'East' },
    s: { x0: 0, x1: N, y0: N, y1: N + DEPTH, name: 'South' },
    n: { x0: 0, x1: N, y0: -DEPTH, y1: 0, name: 'North' },
    w: { x0: -DEPTH, x1: 0, y0: 0, y1: N, name: 'West' },
};
const SIDE_ALIAS = { e: 'e', east: 'e', right: 'e', s: 's', south: 's', front: 's', down: 's', n: 'n', north: 'n', back: 'n', up: 'n', w: 'w', west: 'w', left: 'w' };

// ── build catalogue (architecture shop) ─────────────────────────────────────
// minHouse = house structure level required (Hovel 1 / Cottage 2 / Manor 3)
const BUILD = {
    annex_open:   { id: 'annex_open',   name: 'Open Extension',  price: 6000,  minHouse: 2, desc: 'Floor + roof extension with NO wall — the room just gets bigger. Stacks on any side.' },
    annex_walled: { id: 'annex_walled', name: 'Walled Annex',    price: 9000,  minHouse: 2, desc: 'A separate room with its own walls and a doorway to the main hall. Stacks on any side.' },
    loft:         { id: 'loft',         name: 'Top Floor Loft',  price: 12000, minHouse: 2, desc: 'A timber upper floor with stairs and railings — furniture placed up there with `up`.' },
    loft_walls:   { id: 'loft_walls',   name: 'Second-Floor Walling', price: 7000, minHouse: 3, desc: 'Raises the back walls a full second storey around your loft.' },
};
const MAX_ANNEX_BY_HOUSE = { 1: 0, 2: 1, 3: 4 };

// ── house styles ("remade houses") — ALL LOCKED until the owner defines the
// unlock requirements. `unlock` is the single place to wire a rule later:
//   unlock: null            → locked, no rule announced yet
//   unlock: { ... }         → future: checked by isStyleUnlocked()
// The default style is always available.
const STYLES = {
    default:    { id: 'default',    name: 'Standard Build',     tier: 2, desc: 'The classic half-timber homestead.', unlock: 'free' },
    hovel_rust: { id: 'hovel_rust', name: 'Rustic Plank Cabin', tier: 1, desc: 'Weathered pine plank walls, patched roof.', unlock: null },
    brick_row:  { id: 'brick_row',  name: 'Brick Townhouse',    tier: 3, desc: 'Masonry townhouse with warm brick.', unlock: null },
    rubble_keep:{ id: 'rubble_keep',name: 'Rubble Keep',        tier: 4, desc: 'Heavy fieldstone fortress hall.', unlock: null },
    dressed:    { id: 'dressed',    name: 'Dressed-Stone Manor',tier: 5, desc: 'Cut ashlar manor, the finest masonry.', unlock: null },
};

function isStyleUnlocked(rec, id) {
    const s = STYLES[id];
    if (!s) return false;
    if (s.unlock === 'free') return true;
    return (rec.stylesOwned || []).includes(id);
}

// ── geometry ────────────────────────────────────────────────────────────────
function annexList(rec) { return (rec.annex || []).filter((a) => SIDES[a.side]); }

function regionAt(rec, x, y) {
    if (x >= 0 && x < N && y >= 0 && y < N) return 'main';
    for (const a of annexList(rec)) {
        const r = SIDES[a.side];
        if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return a.side;
    }
    return null;
}

function isStairCell(x, y) { return STAIR_CELLS.some(([sx, sy]) => sx === x && sy === y); }

function cellValid(rec, x, y, lvl = 0) {
    if (lvl === 1) return !!rec.upper && x >= LOFT.x0 && x < LOFT.x1 && y >= LOFT.y0 && y < LOFT.y1;
    if (rec.upper && isStairCell(x, y)) return false;
    return regionAt(rec, x, y) !== null;
}

/** footprint check: every cell valid; a footprint may not straddle a walled partition (rugs may). */
function footprintValid(rec, x, y, def, lvl = 0) {
    const regs = new Set();
    for (let ix = 0; ix < def.fw; ix++) for (let iy = 0; iy < def.fh; iy++) {
        if (!cellValid(rec, x + ix, y + iy, lvl)) return false;
        regs.add(regionAt(rec, x + ix, y + iy));
    }
    if (regs.size > 1 && lvl === 0 && def.layer !== 'rug') {
        for (const side of regs) {
            if (side === 'main') continue;
            const a = annexList(rec).find((q) => q.side === side);
            if (a && a.kind === 'walled') return false;
        }
    }
    return true;
}

function areaBounds(rec) {
    let x0 = 0, y0 = 0, x1 = N, y1 = N;
    for (const a of annexList(rec)) {
        const r = SIDES[a.side];
        x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1);
    }
    return { x0, y0, x1, y1 };
}

/** clamp a requested top-left into the bounding box of the buildable area (level 1 → loft) */
function clampTo(rec, x, y, def, lvl = 0) {
    const b = lvl === 1 ? { x0: LOFT.x0, y0: LOFT.y0, x1: LOFT.x1, y1: LOFT.y1 } : areaBounds(rec);
    return { x: Math.max(b.x0, Math.min(b.x1 - def.fw, x)), y: Math.max(b.y0, Math.min(b.y1 - def.fh, y)) };
}

// ── shop gating ─────────────────────────────────────────────────────────────
const RARITY_HOUSE = { common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 3 };
function itemMinHouse(def) { return def.minHouse || RARITY_HOUSE[def.rarity] || 1; }
function themeMinHouse(t) { return t.price <= 9000 ? 1 : (t.price <= 20000 ? 2 : 3); }
const HOUSE_NAMES = { 1: 'Hovel', 2: 'Cottage', 3: 'Manor' };

function annexAllowance(houseLv) { return MAX_ANNEX_BY_HOUSE[Math.max(1, Math.min(3, houseLv))] || 0; }

module.exports = {
    N, DEPTH, LOFT, STAIR_CELLS, DOOR_GAP, SIDES, SIDE_ALIAS, BUILD, STYLES,
    annexList, regionAt, cellValid, footprintValid, areaBounds, clampTo, isStairCell,
    isStyleUnlocked, itemMinHouse, themeMinHouse, annexAllowance, HOUSE_NAMES,
};
