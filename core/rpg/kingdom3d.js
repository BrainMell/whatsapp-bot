'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  KINGDOM3D — shared hex-world compositor for the guild kingdom + player base
//  Art: KayKit Medieval Hexagon Pack (CC0, Kay Lousberg) — every model is
//  PRE-BAKED to an iso sprite by scripts/kingdom3d/bake_kingdom_sprites.py, so
//  runtime is 2D compositing only (no GL, no 3D math): ~100-250ms per card.
//
//  Grid: pointy-top hexes, odd-r offset (col,row). Edge index order matches the
//  baker: 0=E 1=SE 2=SW 3=W 4=NW 5=NE.
//  Draw order: all terrain tiles back→front, then ground shadows, then objects
//  back→front (the same trick the KayKit promo shots use).
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'rpgasset', 'kingdom3d');
const SQ3 = Math.sqrt(3);

let _manifest = null;
function manifest() {
    if (!_manifest) _manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
    return _manifest;
}
const BAKE_S = () => manifest().S;
const SIN_P = () => Math.sin((manifest().pitch * Math.PI) / 180);
const COS_P = () => Math.cos((manifest().pitch * Math.PI) / 180);

// ── image cache (shared across renders; sprites are tiny) ───────────────────
const _imgs = new Map();
async function loadSprite(file) {
    let p = _imgs.get(file);
    if (!p) {
        p = require('canvas').loadImage(path.join(DIR, file)).catch(() => null);
        _imgs.set(file, p);
    }
    return p;
}
// ── biomes: recoloured terrain/nature sprites live in biomes/<biome>/<file> (same names) ──
let _biomeInfo = null;
function biomeInfo() {
    if (!_biomeInfo) {
        try { _biomeInfo = JSON.parse(fs.readFileSync(path.join(DIR, 'biomes', 'biomes.json'), 'utf8')); _biomeInfo.set = new Set(_biomeInfo.files); }
        catch (e) { _biomeInfo = { files: [], biomes: {}, set: new Set() }; }
    }
    return _biomeInfo;
}
/** file path (relative to DIR) of `file` in `biome`; falls back to the base sprite. */
function biomeFile(file, biome) {
    if (!biome || biome === 'isle') return file;
    const bi = biomeInfo();
    return bi.biomes[biome] && bi.set.has(file) ? `biomes/${biome}/${file}` : file;
}
function spriteMeta(name) { return manifest().sprites[name] || null; }
function hasSprite(name) { return !!manifest().sprites[name]; }

// ── RNG helpers ──────────────────────────────────────────────────────────────
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// ── hex math (odd-r offset, pointy-top) ──────────────────────────────────────
// neighbor deltas by row parity, edge index order E,SE,SW,W,NW,NE
const NB_EVEN = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
const NB_ODD = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];
function neighbor(col, row, dir) {
    const d = (row & 1 ? NB_ODD : NB_EVEN)[dir];
    return [col + d[0], row + d[1]];
}
function dirTo(col, row, c2, r2) {
    for (let d = 0; d < 6; d++) { const n = neighbor(col, row, d); if (n[0] === c2 && n[1] === r2) return d; }
    return -1;
}
/** world x,z of a hex centre (tile model radius: width 2, row pitch √3). */
function hexWorld(col, row) { return { x: 2 * (col + 0.5 * (row & 1)), z: SQ3 * row }; }
function ring(col, row, n) {
    // all cells at hex-distance n (via cube coords)
    const toCube = (c, r) => { const x = c - (r - (r & 1)) / 2; const z = r; return [x, -x - z, z]; };
    const fromCube = (cu) => [cu[0] + (cu[2] - (cu[2] & 1)) / 2, cu[2]];
    const cc = toCube(col, row);
    if (n === 0) return [[col, row]];
    const dirs = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
    let cur = [cc[0] - n, cc[1], cc[2] + n]; // start at the SW corner (redblob dir 4)
    const out = [];
    for (let s = 0; s < 6; s++) {
        for (let i = 0; i < n; i++) { out.push(fromCube(cur)); cur = [cur[0] + dirs[s][0], cur[1] + dirs[s][1], cur[2] + dirs[s][2]]; }
    }
    return out;
}
function hexDist(c1, r1, c2, r2) {
    const tc = (c, r) => { const x = c - (r - (r & 1)) / 2; return [x, r, -x - r]; };
    const a = tc(c1, r1), b = tc(c2, r2);
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

// ── autotile tables (built from the baked per-edge signatures) ───────────────
let _tables = null;
function tables() {
    if (_tables) return _tables;
    const sp = manifest().sprites;
    const road = [], river = [], cross = [], wall = [];
    for (const [name, e] of Object.entries(sp)) {
        if (!name.includes('@')) continue;
        const [base, r] = name.split('@');
        const rot = +r;
        if (base.startsWith('hex_road_') && !/sloped/.test(base)) road.push({ name, base, rot, set: bits(e.edges, 1) });
        else if (base.startsWith('hex_river_crossing')) cross.push({ name, base, rot, water: bits(e.edges, 2), road: bits(e.edges, 1) });
        else if (base.startsWith('hex_river_')) river.push({ name, base, rot, set: bits(e.edges, 2) });
        else if (base.startsWith('wall_') && e.conn) wall.push({ name, base, rot, set: bitsConn(e.conn) });
    }
    _tables = { road, river, cross, wall };
    return _tables;
}
function bits(edges, cls) { let m = 0; edges.forEach((c, i) => { if (c === cls) m |= 1 << i; }); return m; }
function bitsConn(conn) { let m = 0; conn.forEach((c, i) => { if (c) m |= 1 << i; }); return m; }
function popcount(m) { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
function rotMask(m, r) { // rotate a 6-bit mask by r edge steps (edge k -> k - r)
    let out = 0;
    for (let k = 0; k < 6; k++) if (m & (1 << k)) out |= 1 << (((k - r) % 6 + 6) % 6);
    return out;
}

/** best tile whose edge set is exactly `want`, else the largest subset of it. */
function pickBySet(list, want, preferBases) {
    let best = null, bestScore = -1;
    for (const t of list) {
        if ((t.set & ~want) !== 0) continue; // never draw a connection that doesn't exist
        const score = popcount(t.set) * 10 + (t.set === want ? 100 : 0)
            + (preferBases && preferBases.includes(t.base) ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
}

// coast tiles: canonical water-edge sets at rot 0 (read off the baked art)
const COAST_CANON = { 1: ['hex_coast_A', 0b000010], 2: ['hex_coast_B', 0b000110], 3: ['hex_coast_C', 0b000111], 4: ['hex_coast_D', 0b100111] };
function coastFor(mask) {
    // contiguous cyclic run of set bits → [tileBase, rot]
    const n = popcount(mask);
    const canon = COAST_CANON[n];
    if (!canon) return null;
    for (let r = 0; r < 6; r++) if (rotMask(canon[1], r) === mask) return `${canon[0]}@${r}`;
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HexWorld: terrain grid + prop list → canvas
// ═══════════════════════════════════════════════════════════════════════════
class HexWorld {
    /**
     * @param {number} cols
     * @param {number} rows
     * @param {object} o {scale} scale = output pixels per baked pixel (1 = 192px hex)
     */
    constructor(cols, rows, o = {}) {
        this.cols = cols; this.rows = rows;
        this.biome = o.biome || null;               // recolour set (null/'isle' = base sprites)
        this.oobWater = o.oobWater !== false;       // false: beyond the map is NOT sea (land biomes)
        this.scale = o.scale || 0.6;
        this.cell = []; // [row][col] = {land,road,river,door,wall,...}
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) row.push({ water: false, road: false, river: false, wall: false, tile: null, h: 0 });
            this.cell.push(row);
        }
        this.objs = [];   // {name,x,z,y,flip,sc,layer,sort}
        this.overlays = []; // {fn(ctx, proj)} drawn after objects (labels etc.)
    }
    inb(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
    at(c, r) { return this.inb(c, r) ? this.cell[r][c] : null; }
    isWater(c, r) { const k = this.at(c, r); return !k ? this.oobWater : k.water; } // beyond the map = sea (isle only)
    fillWater(pred) { for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (pred(c, r)) this.cell[r][c].water = true; }

    // ── terrain resolution ──
    resolve() {
        // 1. coast clean-up: land cells whose water neighbours are not one run of ≤4 become water
        for (let guard = 0; guard < 8; guard++) {
            let changed = false;
            for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
                const k = this.cell[r][c];
                if (k.water || k.keepLand) continue;
                const m = this._waterMask(c, r);
                if (!m) continue;
                const n = popcount(m);
                if (n >= 5 || !this._contiguous(m) || !coastFor(m)) { k.water = true; changed = true; }
            }
            if (!changed) break;
        }
        const T = tables();
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
            const k = this.cell[r][c];
            k.tile = null;
            if (k.water) { k.tile = 'hex_water'; continue; }
            const wm = this._waterMask(c, r);
            if (wm) { const t = coastFor(wm); if (t) { k.tile = t; k.coast = true; continue; } }
            if (k.river) {
                let want = 0;
                for (let d = 0; d < 6; d++) {
                    const n = neighbor(c, r, d); const nk = this.at(n[0], n[1]);
                    if (!nk || nk.water || nk.river || nk.void) want |= 1 << d;
                }
                if (k.crossRoad) {
                    // pick the crossing whose river line matches and whose road line matches
                    let roadWant = 0;
                    for (let d = 0; d < 6; d++) { const n = neighbor(c, r, d); const nk = this.at(n[0], n[1]); if (nk && (nk.road || nk.door) && !nk.river) roadWant |= 1 << d; }
                    let bestC = null, bs = -1;
                    for (const t of T.cross) {
                        if ((t.water & ~want) !== 0 && t.water !== want) continue;
                        const sc = popcount(t.water & want) * 4 + popcount(t.road & roadWant) * 3 - popcount(t.road & ~roadWant) * 5;
                        if (sc > bs) { bs = sc; bestC = t; }
                    }
                    if (bestC) { k.tile = bestC.name; continue; }
                }
                if (popcount(want) < 2) { // river source / stub: extend straight so a 2-edge tile fits
                    for (let d = 0; d < 6 && popcount(want) < 2; d++) if (want & (1 << d)) want |= 1 << ((d + 3) % 6);
                    if (popcount(want) < 2) want = 0b001001;
                }
                const t = pickBySet(T.river, want, ['hex_river_A_curvy', 'hex_river_A', 'hex_river_B', 'hex_river_C']);
                k.tile = t ? t.name : 'hex_grass';
                continue;
            }
            if (k.road || k.door) {
                let want = 0;
                if (k.links) want = k.links;
                else for (let d = 0; d < 6; d++) {
                    const n = neighbor(c, r, d); const nk = this.at(n[0], n[1]);
                    if (nk && (nk.road || nk.door) && !nk.water) want |= 1 << d;
                }
                if (!want) want = 0b001000; // lone road stub
                const t = pickBySet(T.road, want);
                k.tile = t ? t.name : 'hex_grass';
                continue;
            }
            k.tile = k.field ? 'hex_grass' : 'hex_grass';
        }
    }
    _waterMask(c, r) { let m = 0; for (let d = 0; d < 6; d++) { const n = neighbor(c, r, d); if (this.isWater(n[0], n[1])) m |= 1 << d; } return m; }
    _contiguous(m) {
        if (m === 0 || m === 63) return true;
        let trans = 0;
        for (let i = 0; i < 6; i++) if (((m >> i) & 1) !== ((m >> ((i + 1) % 6)) & 1)) trans++;
        return trans === 2;
    }

    // ── walls: lay a closed/open wall path through cells, piece by connectivity ──
    // cells: [[c,r],...] in order; gates: Set of "c,r" that get gate pieces
    layWall(cells, { closed = true, gates = new Set(), outside = true } = {}) {
        const T = tables();
        const n = cells.length;
        for (let i = 0; i < n; i++) {
            const [c, r] = cells[i];
            const prev = cells[(i - 1 + n) % n], next = cells[(i + 1) % n];
            let want = 0;
            if (closed || i > 0) { const d = dirTo(c, r, prev[0], prev[1]); if (d >= 0) want |= 1 << d; }
            if (closed || i < n - 1) { const d = dirTo(c, r, next[0], next[1]); if (d >= 0) want |= 1 << d; }
            const isGate = gates.has(`${c},${r}`);
            let best = null;
            for (const t of T.wall) {
                if (t.set !== want) continue;
                const b = t.base;
                const gate = /gate/.test(b);
                if (gate !== isGate) continue;
                if (isGate && !/straight_gate|corner_A_gate/.test(b)) continue;
                if (!isGate && /_(inside|outside)$/.test(b) && (outside ? /inside$/.test(b) : /outside$/.test(b))) continue;
                best = t; break;
            }
            if (!best && isGate) for (const t of T.wall) if (t.set === want && /straight$|corner_A_inside|corner_B_inside/.test(t.base)) { best = t; break; }
            if (!best) for (const t of T.wall) if (t.set === want) { best = t; break; }
            if (best) this.put(best.name, c, r, { layer: 'obj', sort: 0.2 });
            this.cell[r][c].wall = true;
        }
    }

    /** explicit road/path link between two adjacent cells (otherwise roads auto-connect to every road neighbour). */
    link(c1, r1, c2, r2) {
        const d = dirTo(c1, r1, c2, r2);
        if (d < 0 || !this.inb(c1, r1) || !this.inb(c2, r2)) return;
        const a = this.cell[r1][c1], b = this.cell[r2][c2];
        a.links = (a.links || 0) | (1 << d);
        b.links = (b.links || 0) | (1 << ((d + 3) % 6));
    }

    /** place a sprite on hex (c,r); dx/dz in world units; h = height above ground. */
    put(name, c, r, o = {}) {
        if (!hasSprite(name)) return;
        const w = o.wx != null ? { x: o.wx, z: o.wz } : hexWorld(c, r);
        this.objs.push({
            name, x: w.x + (o.dx || 0), z: w.z + (o.dz || 0), y: o.h || 0,
            flip: !!o.flip, sc: o.sc || 1, layer: o.layer || 'obj', sort: o.sort || 0, alpha: o.alpha == null ? 1 : o.alpha,
        });
    }
    overlay(fn, c, r, o = {}) { const w = hexWorld(c, r); this.overlays.push({ fn, x: w.x + (o.dx || 0), z: w.z + (o.dz || 0), y: o.h || 0 }); }

    // ── projection ──
    layout(pad = {}) {
        const S = BAKE_S(), k = this.scale;
        const left = pad.left == null ? 30 : pad.left, right = pad.right == null ? 30 : pad.right;
        const top = pad.top == null ? 300 : pad.top, bottom = pad.bottom == null ? 60 : pad.bottom;
        this.W = Math.ceil((2 * this.cols + 1) * S * k + left + right);
        this.ox = left + S * k;           // x of hex(0,0) centre
        this.oy = top;                    // y of hex(0,0) centre (top surface)
        this.H = Math.ceil(this.oy + ((SQ3 * (this.rows - 1) + 1.1547) * SIN_P() + COS_P()) * S * k + bottom);
        if (pad.W) this.W = pad.W;        // fixed-canvas override (full-bleed renders)
        if (pad.H) this.H = pad.H;
        return { W: this.W, H: this.H };
    }

    /** FULL-BLEED layout (owner 2026-10-18: "ion like the floating in the sky thing — fill in
     *  the rest of the space / stretch the generation to cover the full screen"): the grid was
     *  built with `extra` margin cells on every side around the ORIGINAL cols×rows diorama;
     *  canvas stays the ORIGINAL size and the origin shifts so the margin cells hang off every
     *  edge — terrain covers the whole card, no sky void. */
    layoutBleed(origCols, origRows, pad = {}, extra = 0) {
        const S = BAKE_S(), k = this.scale;
        const left = pad.left == null ? 30 : pad.left, right = pad.right == null ? 30 : pad.right;
        const top = pad.top == null ? 300 : pad.top, bottom = pad.bottom == null ? 60 : pad.bottom;
        const W = Math.ceil((2 * origCols + 1) * S * k + left + right);
        const oy0 = top;
        const H = Math.ceil(oy0 + ((SQ3 * (origRows - 1) + 1.1547) * SIN_P() + COS_P()) * S * k + bottom);
        this.W = W; this.H = H;
        this.ox = left + S * k - 2 * extra * S * k;                 // shift left by the extra cols
        this.oy = oy0 - SQ3 * SIN_P() * S * k * extra;              // shift up by the extra rows
        return { W, H };
    }
    proj(x, z, y = 0) {
        const S = BAKE_S(), k = this.scale;
        return { x: this.ox + x * S * k, y: this.oy + z * SIN_P() * S * k - y * COS_P() * S * k };
    }

    async draw(ctx, { drawBackdrop } = {}) {
        const S = BAKE_S(), k = this.scale;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (drawBackdrop) await drawBackdrop(ctx, this);
        // gather unique sprites then preload in one go
        const names = new Set();
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) names.add(this.cell[r][c].tile);
        for (const o of this.objs) names.add(o.name);
        const files = new Set();
        const bf = (f) => biomeFile(f, this.biome);
        for (const n of names) { const m = spriteMeta(n); if (!m) continue; files.add(bf(m.file)); if (m.sh) files.add(m.sh.file); }
        await Promise.all([...files].map(loadSprite));
        const drawSpr = async (m, file, ax, ay, X, Y, sc, flip, alpha) => {
            const img = await loadSprite(file === m.file ? bf(file) : file);
            if (!img) return;
            const w = m.w * k * sc, h = m.h * k * sc;
            const dx = X - (flip ? (m.w - ax) : ax) * k * sc, dy = Y - ay * k * sc;
            if (alpha < 1) ctx.globalAlpha = alpha;
            if (flip) { ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); ctx.restore(); }
            else ctx.drawImage(img, dx, dy, w, h);
            if (alpha < 1) ctx.globalAlpha = 1;
        };
        // 1. terrain, row by row (full-bleed grids extend past the canvas — skip off-card tiles)
        const tw = 2 * S * k, th2 = 2 * S * k;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const kcell = this.cell[r][c];
                if (kcell.void) continue;                 // outside the diorama: backdrop shows through
                const m = spriteMeta(kcell.tile); if (!m) continue;
                const w = hexWorld(c, r);
                const p = this.proj(w.x, w.z, kcell.h || 0);
                if (p.x < -tw || p.x > this.W + tw || p.y < -th2 || p.y > this.H + th2) continue;
                await drawSpr(m, m.file, m.ax, m.ay, p.x, p.y, 1, false, 1);
            }
        }
        const sorted = [...this.objs].sort((a, b) => (a.z - b.z) || (a.sort - b.sort) || (a.x - b.x));
        // 2. shadows
        for (const o of sorted) {
            const m = spriteMeta(o.name); if (!m || !m.sh || o.layer === 'flat') continue;
            const p = this.proj(o.x, o.z, o.y);
            await drawSpr(m.sh, m.sh.file, m.sh.ax, m.sh.ay, p.x, p.y, o.sc, o.flip, o.alpha);
        }
        // 3. objects (flat decals first)
        for (const o of sorted.filter((q) => q.layer === 'flat')) {
            const m = spriteMeta(o.name); const p = this.proj(o.x, o.z, o.y);
            await drawSpr(m, m.file, m.ax, m.ay, p.x, p.y, o.sc, o.flip, o.alpha);
        }
        for (const o of sorted) {
            if (o.layer === 'flat') continue;
            const m = spriteMeta(o.name); const p = this.proj(o.x, o.z, o.y);
            await drawSpr(m, m.file, m.ax, m.ay, p.x, p.y, o.sc, o.flip, o.alpha);
        }
        // 4. overlays (labels, banners)
        for (const ov of this.overlays) { const p = this.proj(ov.x, ov.z, ov.y); ov.fn(ctx, p, k); }
    }
}


/** straight hex line between two cells (inclusive), as [[c,r],...] */
function hexLine(c1, r1, c2, r2) {
    const toCube = (c, r) => { const x = c - (r - (r & 1)) / 2; return [x, -x - r, r]; };
    const a = toCube(c1, r1), b = toCube(c2, r2);
    const n = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const out = [];
    const round = (x, y, z) => {
        let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
        const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
        if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
        return [rx, ry, rz];
    };
    for (let i = 0; i <= n; i++) {
        const t = n === 0 ? 0 : i / n;
        const cu = round(a[0] + (b[0] - a[0]) * t + 1e-6, a[1] + (b[1] - a[1]) * t + 2e-6, a[2] + (b[2] - a[2]) * t - 3e-6);
        out.push([cu[0] + (cu[2] - (cu[2] & 1)) / 2, cu[2]]);
    }
    return out;
}

/** hex outline polygon on the ground plane of cell (c,r) (screen px). */
function hexPath(ctx, world, c, r, inset = 0) {
    const w = hexWorld(c, r);
    const R = 1.1547 - inset;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const p = world.proj(w.x + R * Math.cos(a), w.z + R * Math.sin(a), 0);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
}

/** diorama backdrop: deep teal gradient, faint hex lattice, drifting clouds. */
async function paintBackdrop(ctx, W, H, seed, opts = {}) {
    const rng = mulberry32(seed);
    const top = opts.top || '#2f6f8f', mid = opts.mid || '#1c4a63', bot = opts.bot || '#0e2434';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(0.45, mid); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.2, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    rg.addColorStop(0, 'rgba(255,255,255,0.10)'); rg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    // faint hex lattice
    ctx.save();
    ctx.globalAlpha = 0.07; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    const hr = 62;
    for (let row = -1; row * hr * 1.5 < H + hr; row++) {
        for (let col = -1; col * hr * SQ3 < W + hr; col++) {
            const cx = col * hr * SQ3 + (row & 1 ? hr * SQ3 / 2 : 0), cy = row * hr * 1.5;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); const x = cx + hr * Math.cos(a), y = cy + hr * Math.sin(a); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.closePath(); ctx.stroke();
        }
    }
    ctx.restore();
    // clouds (baked KayKit clouds, tinted by alpha)
    const cl = ['cloud_big', 'cloud_small'];
    for (let i = 0; i < (opts.clouds == null ? 7 : opts.clouds); i++) {
        const name = cl[i % 2]; const m = spriteMeta(name); if (!m) continue;
        const img = await loadSprite(m.file); if (!img) continue;
        const sc = (opts.cloudScale || 0.5) * (0.7 + rng() * 0.7);
        const x = rng() * W, y = (i % 2 ? 0.05 + rng() * 0.2 : 0.5 + rng() * 0.2) * H;
        ctx.globalAlpha = 0.55 + rng() * 0.3;
        ctx.drawImage(img, x - m.ax * sc, y - m.ay * sc, m.w * sc, m.h * sc);
    }
    ctx.globalAlpha = 1;
}

// ── liquid animation (owner 2026-10-18: "the old water used to have [shimmer]? use that to
// make the water and lava animated") — the old 2D renderer toggled two baked water tiles
// (frame%4<2). The hex tiles are single sprites, so the shimmer is painted OVER the scene:
// each liquid cell gets a soft hex tint whose alpha flips between two states at the same
// 220ms rhythm (2 cycles per 14-frame loop); lava glows amber instead of glinting blue.
function paintLiquidAnim(ctx, world, cells, t) {
    if (!cells || !cells.length) return;
    ctx.save();
    for (const q of cells) {
        const p = world.proj(q.x, q.z, 0);
        if (p.x < -60 || p.x > world.W + 60 || p.y < -60 || p.y > world.H + 60) continue;
        const wave = Math.sin(2 * Math.PI * (2 * t + q.ph));
        const on = wave > 0;
        ctx.globalAlpha = q.lava ? (on ? 0.34 : 0.12) : (on ? 0.22 : 0.05);
        ctx.fillStyle = q.lava ? (on && wave > 0.55 ? '#ffd76b' : '#ff9430') : '#cfeaff';
        hexPath(ctx, world, q.c, q.r, 0.06);
        ctx.fill();
        if (q.lava && wave > 0.82) {                              // ember spark at crest
            ctx.globalAlpha = 0.85 * (wave - 0.82) / 0.18;
            ctx.fillStyle = '#ffe9a0';
            ctx.beginPath(); ctx.arc(p.x + (q.ph - 0.5) * 26, p.y - 2, 2.1, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();
}

/** collect the liquid cells of a resolved HexWorld as {c,r,x,z,ph,lava}, capped + seeded. */
function liquidCells(w, { lava = false, cap = 150, seed = 1 } = {}) {
    const out = [];
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
        const k = w.cell[r][c];
        if (k.water && !k.void) { const pw = hexWorld(c, r); out.push({ c, r, x: pw.x, z: pw.z, ph: 0, lava }); }
    }
    if (out.length > cap) {
        const rng = mulberry32(seed);
        for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = out[i]; out[i] = out[j]; out[j] = tmp; }
        out.length = cap;
    }
    for (const q of out) q.ph = (hashStr(`${q.c},${q.r}`) % 1000) / 1000;
    return out;
}

// ── confetti (owner: "the animations for buildings and upgrades with the confetti") —
// celebrated builds/upgrades rain paper scraps over the card. Deterministic per seed+t.
const CONFETTI_COLS = ['#ff5d5d', '#ffc93c', '#4ecdc4', '#7c6ff0', '#ff9ff3', '#6bed8f', '#feca57'];
function paintConfetti(ctx, W, H, t, seed, k) {
    ctx.save();
    for (let i = 0; i < 80; i++) {
        const r1 = mulberry32(seed + 40 + i)(), r2 = mulberry32(seed + 440 + i)(), r3 = mulberry32(seed + 840 + i)();
        const fall = (t * (1.3 + r3 * 0.9) + r1) % 1;
        const x = W * (0.03 + 0.94 * r1) + Math.sin((t + r2) * Math.PI * 4) * 16 * k;
        const y = -20 + fall * (H + 60);
        ctx.globalAlpha = 0.92 * Math.sin(Math.min(1, fall * 1.15) * Math.PI);
        ctx.fillStyle = CONFETTI_COLS[i % CONFETTI_COLS.length];
        const s = (14 + r3 * 14) * k * 2, rot = (t + r2) * Math.PI * 2;   // chunky card-scale scraps (12-25px)
        ctx.translate(x, y); ctx.rotate(rot);
        ctx.fillRect(-s / 2, -s / 4, s, s / 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

module.exports = {
    biomeFile, biomeInfo,
    hexLine, hexPath, paintBackdrop, paintLiquidAnim, liquidCells, paintConfetti, roundRect,
    HexWorld, hexWorld, neighbor, dirTo, ring, hexDist, mulberry32, hashStr,
    hasSprite, spriteMeta, loadSprite, tables, DIR, manifest, popcount, rotMask, SQ3,
};
