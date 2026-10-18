'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  CONTINENT MAP — Aldafold, the First World (Royal Decree chrome)
//  2026-10-18 owner round: name the planet (Aldafold), Norse continent names,
//  and redraw the map body to match the owner's reference plate: hand-drawn
//  coastlines, sandy shallows, near-shore wave dashes, skerries, textured
//  biomes (mountain ranges, dune fields, oases, lava cracks), an eight-point
//  compass and parchment grain. Storage keys + canonical geometry in
//  continents.js stay frozen — only the DRAWING got the dressing.
//
//    renderContinentMap({ guildName, guild, memberNames })  → Buffer (PNG) | null
//    renderContinentMap()                                   → the plain atlas
//
//  Pure canvas, ~150-300 ms. Never throws (returns null; caller falls back to text).
// ═══════════════════════════════════════════════════════════════════════════
const WM = require('./worldMapRenderer');
const C = require('./continents');
const { PAL, W, H } = WM;

// map window inside the frame
const MX = 70, MY = 196, MW = W - 140, MH = 800;
const px = (x) => MX + x * MW;
const py = (y) => MY + y * MH;

const SEA = {
    top: '#B4CCB6', mid: '#BFD4C0', bot: '#A6BFAF',
    wave: 'rgba(52,96,88,0.34)', waveFar: 'rgba(52,96,88,0.20)',
    shallow: 'rgba(238,228,196,0.55)', shallow2: 'rgba(150,190,178,0.40)',
    ink: 'rgba(42,72,66,0.9)',
};
const FILL = {
    isle:      { base: '#B8CF9A', edge: '#7FA263', trees: ['#4E7A44', '#6B9355', '#3E663A'] },
    desert:    { base: '#EBD398', edge: '#C9A05C' },
    tundra:    { base: '#EDF2F2', edge: '#C2D2DA', pine: '#3E5E74' },
    highlands: { base: '#D9AC64', edge: '#A8762F', trees: ['#B26222', '#96531B', '#7C7A2E', '#C07A2A'] },
    volcanic:  { base: '#4A3E3A', edge: '#2B2321', ember: '#E2531F', emberHot: '#F7A62B' },
};

// ── small utils ──────────────────────────────────────────────────────────────
function _rng(seed) { return C.mulberry32(seed); }
const lerp = (a, b, t) => a + (b - a) * t;

/** letter-spaced centered text (canvas has no letterSpacing API) */
function _spaced(ctx, text, cx, y, font, color, gap = 4) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    const widths = [...String(text)].map((ch) => ctx.measureText(ch).width);
    let total = widths.reduce((s, w) => s + w + gap, -gap);
    let x = cx - total / 2, i = 0;
    for (const ch of String(text)) { ctx.fillText(ch, x, y); x += widths[i++] + gap; }
    ctx.textAlign = 'center';
}

// ── dressed coastline (visual-only wiggle on top of the canonical polygon) ──
const _dressed = new Map();
function dressed(key) {
    if (_dressed.has(key)) return _dressed.get(key);
    const c = C.BY_KEY[key];
    const pts = C.polygon(key);
    const rng = _rng(c.seed * 3 + 11);
    const p1 = rng() * 6.28, p2 = rng() * 6.28, p3 = rng() * 6.28;
    const amp = 0.017 + rng() * 0.006;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        const ex = bx - ax, ey = by - ay, nl = Math.hypot(-ey, ex) || 1e-9;
        const nx = -ey / nl, ny = ex / nl;
        for (let j = 0; j < 6; j++) {
            const t = j / 6, x = ax + ex * t, y = ay + ey * t;
            // sweeping bays first, fjords second, fringe last (owner ref: smooth
            // curves with occasional deep inlets — NOT uniform frizz)
            const d = amp * (0.9 * Math.sin(x * 68 + y * 44 + p1) + 0.35 * Math.sin(x * 240 - y * 160 + p2) + 0.12 * Math.sin(x * 640 + y * 500 + p3));
            out.push([x + nx * d, y + ny * d]);
        }
    }
    _dressed.set(key, out);
    return out;
}

function _pathSmooth(ctx, pts, scale = 1, cx = 0.5, cy = 0.5) {
    const P = pts.map(([x, y]) => [px(lerp(cx, x, scale)), py(lerp(cy, y, scale))]);
    ctx.beginPath();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(P[P.length - 1], P[0]);
    ctx.moveTo(m[0], m[1]);
    for (let i = 0; i < P.length; i++) {
        const n = P[(i + 1) % P.length], mm = mid(P[i], n);
        ctx.quadraticCurveTo(P[i][0], P[i][1], mm[0], mm[1]);
    }
    ctx.closePath();
}

// ── sea ──────────────────────────────────────────────────────────────────────
function _seaBase(ctx) {
    const g = ctx.createLinearGradient(0, MY, 0, MY + MH);
    g.addColorStop(0, SEA.top); g.addColorStop(0.5, SEA.mid); g.addColorStop(1, SEA.bot);
    ctx.fillStyle = g; ctx.fillRect(MX, MY, MW, MH);
    // darker towards the frame edges (the drowned sea deepens offshore)
    const v = ctx.createRadialGradient(px(0.5), py(0.5), 180, px(0.5), py(0.5), 640);
    v.addColorStop(0, 'rgba(70,110,95,0)'); v.addColorStop(1, 'rgba(60,95,82,0.13)');
    ctx.fillStyle = v; ctx.fillRect(MX, MY, MW, MH);
}
function _waveDash(ctx, x, y, l, tilt) {
    ctx.beginPath();
    ctx.moveTo(x - l / 2, y);
    ctx.quadraticCurveTo(x, y - 2.4, x + l / 2, y + tilt);
    ctx.stroke();
}
function _seaWaves(ctx, seed) {
    const r = _rng(seed);
    ctx.strokeStyle = SEA.waveFar; ctx.lineWidth = 1;
    for (let i = 0; i < 90; i++) _waveDash(ctx, MX + r() * MW, MY + r() * MH, 9 + r() * 14, (r() - 0.5) * 1.6);
}
/** dense short dashes hugging every coast (the reference's living shoreline) */
function _coastWaves(ctx, c) {
    const pts = dressed(c.key), r = _rng(c.seed + 41);
    const [ccx, ccy] = c.centre;
    ctx.strokeStyle = SEA.wave; ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i += 3) {
        const [x, y] = pts[i];
        const dx = x - ccx, dy = y - ccy, dl = Math.hypot(dx, dy) || 1e-9;
        const off = 0.016 + r() * 0.026;
        const wx = px(x + (dx / dl) * off), wy = py(y + (dy / dl) * off);
        _waveDash(ctx, wx, wy, 7 + r() * 9, (r() - 0.5) * 2);
        if (r() < 0.5) _waveDash(ctx, wx + 6, wy + 5, 5 + r() * 7, (r() - 0.5) * 2);
    }
}

// ── land dressing ────────────────────────────────────────────────────────────
function _halo(ctx, c) {
    for (const [scale, style, lw] of [[1.05, SEA.shallow, 13], [1.024, SEA.shallow2, 7]]) {
        _pathSmooth(ctx, dressed(c.key), scale, c.centre[0], c.centre[1]);
        ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.stroke();
    }
}
function _coastFill(ctx, c) {
    _pathSmooth(ctx, dressed(c.key));
    ctx.fillStyle = FILL[c.biome].base; ctx.fill();
    // inner beach line (clip keeps it on land — the pale rim inside the coast)
    ctx.save(); _pathSmooth(ctx, dressed(c.key)); ctx.clip();
    _pathSmooth(ctx, dressed(c.key), 0.992, c.centre[0], c.centre[1]);
    ctx.strokeStyle = 'rgba(244,233,200,0.75)'; ctx.lineWidth = 2.6; ctx.stroke();
    // rim shade: land darkens towards its own coast
    const g = ctx.createRadialGradient(px(c.centre[0]), py(c.centre[1]), Math.min(c.rx, c.ry) * MW * 0.25, px(c.centre[0]), py(c.centre[1]), Math.max(c.rx * MW, c.ry * MH) * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(58,42,30,0.20)');
    ctx.fillStyle = g; ctx.fillRect(MX, MY, MW, MH);
    ctx.restore();
}
function _coastStroke(ctx, c, hot) {
    _pathSmooth(ctx, dressed(c.key));
    ctx.strokeStyle = hot ? PAL.wax : SEA.ink; ctx.lineWidth = hot ? 2.8 : 2; ctx.stroke();
}

// ── glyphs ───────────────────────────────────────────────────────────────────
function _peak(ctx, x, y, s, rock, cap, ink) {
    ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.62); ctx.lineTo(x, y - s * 0.78); ctx.lineTo(x + s, y + s * 0.62); ctx.closePath();
    ctx.fillStyle = rock; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * 0.34, y - s * 0.26); ctx.lineTo(x, y - s * 0.78); ctx.lineTo(x + s * 0.34, y - s * 0.26);
    ctx.quadraticCurveTo(x, y - s * 0.10, x - s * 0.34, y - s * 0.26); ctx.closePath(); ctx.fillStyle = cap; ctx.fill();
}
function _tree(ctx, x, y, s, leaf, trunk) {
    ctx.fillStyle = trunk; ctx.fillRect(x - 0.9, y, 1.8, s * 0.55);
    ctx.fillStyle = leaf;
    ctx.beginPath(); ctx.arc(x, y - s * 0.35, s * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - s * 0.38, y - s * 0.05, s * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.38, y - s * 0.05, s * 0.42, 0, Math.PI * 2); ctx.fill();
}
function _pine(ctx, x, y, s, leaf, snow) {
    ctx.fillStyle = leaf;
    ctx.beginPath(); ctx.moveTo(x, y - s * 1.15); ctx.lineTo(x - s * 0.5, y + s * 0.25); ctx.lineTo(x + s * 0.5, y + s * 0.25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = snow;
    ctx.beginPath(); ctx.moveTo(x, y - s * 1.15); ctx.lineTo(x - s * 0.22, y - s * 0.55); ctx.lineTo(x + s * 0.22, y - s * 0.55); ctx.closePath(); ctx.fill();
}
function _dunes(ctx, x, y, s, ink) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(x, y, s * 1.5, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + s * 1.5, y + s * 0.7, s, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    ctx.beginPath(); ctx.arc(x - s * 1.3, y + s * 0.9, s * 0.8, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
}
function _palm(ctx, x, y, s) {
    ctx.strokeStyle = 'rgba(70,52,26,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s * 0.2, y - s * 0.7, x + s * 0.35, y - s); ctx.stroke();
    ctx.strokeStyle = 'rgba(58,92,52,0.9)';
    for (let k = 0; k < 4; k++) {
        const a = -0.4 - k * 0.55;
        ctx.beginPath(); ctx.moveTo(x + s * 0.35, y - s);
        ctx.quadraticCurveTo(x + s * 0.35 + Math.cos(a) * s * 0.5, y - s + Math.sin(a) * s * 0.45, x + s * 0.35 + Math.cos(a) * s * 0.85, y - s + Math.sin(a) * s * 0.7);
        ctx.stroke();
    }
}
function _reeds(ctx, x, y, ink) {
    ctx.strokeStyle = ink; ctx.lineWidth = 0.9;
    for (let k = -1; k <= 1; k++) {
        ctx.beginPath(); ctx.moveTo(x + k * 2.2, y);
        ctx.quadraticCurveTo(x + k * 2.6, y - 4, x + k * 3.2, y - 7 - (k === 0 ? 1.5 : 0)); ctx.stroke();
    }
}
function _hillHump(ctx, x, y, s, ink) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, s, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, s * 0.6, Math.PI, Math.PI * 2); ctx.stroke();
}
function _river(ctx, c, seed, color, lw) {
    const r = _rng(seed), pts = C.polygon(c.key);
    let a = r() * 6.28;
    let x = c.centre[0] + (r() - 0.5) * c.rx * 0.5, y = c.centre[1] + (r() - 0.5) * c.ry * 0.5;
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(px(x), py(y));
    for (let i = 0; i < 10; i++) {
        a += (r() - 0.5) * 0.9;
        x += Math.cos(a) * c.rx * 0.16; y += Math.sin(a) * c.ry * 0.16;
        if (!C.inside(pts, x, y)) break;
        ctx.lineTo(px(x), py(y));
    }
    ctx.stroke();
}
function _crackWalk(ctx, c, seed, hot, core) {
    const r = _rng(seed), pts = C.polygon(c.key);
    let cx = c.centre[0] + (r() - 0.5) * c.rx, cy = c.centre[1] + (r() - 0.5) * c.ry, ca = r() * 6.28;
    const walk = [[px(cx), py(cy)]];
    for (let i = 0; i < 8; i++) {
        ca += (r() - 0.5) * 1.2;
        cx += Math.cos(ca) * c.rx * 0.14; cy += Math.sin(ca) * c.ry * 0.14;
        if (!C.inside(pts, cx, cy)) break;
        walk.push([px(cx), py(cy)]);
    }
    for (const [style, lw] of [[hot, 4.4], [core, 2]]) {   // SAME path, glow under core
        ctx.strokeStyle = style; ctx.lineWidth = lw;
        ctx.beginPath();
        walk.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
    }
}

// ── biome texture painters (called inside a clip of the continent) ──────────
function _texTundra(ctx, c) {
    const r = _rng(c.seed + 101), pts = C.polygon(c.key);
    // two mountain ranges across the land
    for (const [x0, y0, x1, y1, n] of [[-0.62, 0.28, 0.55, -0.05, 10], [-0.15, 0.62, 0.6, 0.45, 8]]) {
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const x = c.centre[0] + lerp(x0, x1, t) * c.rx + (r() - 0.5) * 0.02;
            const y = c.centre[1] + lerp(y0, y1, t) * c.ry + (r() - 0.5) * 0.02;
            if (C.inside(pts, x, y) && C.edgeDist(pts, x, y) > 0.014) _peak(ctx, px(x), py(y), 7.5 + r() * 4.5, '#7E7568', '#F8F8F4', 'rgba(42,60,74,0.9)');
        }
    }
    // a frozen lake the colour of old glass
    const lx = c.centre[0] - c.rx * 0.1, ly = c.centre[1] + c.ry * 0.05;
    ctx.beginPath(); ctx.ellipse(px(lx), py(ly), 22, 9, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#D8E6EC'; ctx.fill(); ctx.strokeStyle = 'rgba(58,42,30,0.55)'; ctx.lineWidth = 0.9; ctx.stroke();
    // snowy pines
    let n = 64;
    for (let i = 0; i < n * 6 && n > 0; i++) {
        const x = c.centre[0] + (r() * 2 - 1) * c.rx, y = c.centre[1] + (r() * 2 - 1) * c.ry * 1.1;
        if (!C.inside(pts, x, y) || C.edgeDist(pts, x, y) < 0.016) continue;
        if (Math.hypot(x - lx, y - ly) < 0.05) continue; // keep the lake clear
        _pine(ctx, px(x), py(y), 4.5 + r() * 3.5, 'rgba(52,84,106,0.9)', '#F4F7F6');
        n--;
    }
}
function _texHighlands(ctx, c) {
    const r = _rng(c.seed + 102), pts = C.polygon(c.key), T = FILL.highlands.trees;
    let n = 175;
    for (let i = 0; i < n * 5 && n > 0; i++) {
        const x = c.centre[0] + (r() * 2 - 1) * c.rx, y = c.centre[1] + (r() * 2 - 1) * c.ry;
        if (!C.inside(pts, x, y) || C.edgeDist(pts, x, y) < 0.015) continue;
        _tree(ctx, px(x), py(y), 5 + r() * 4, T[(r() * T.length) | 0] + (r() < 0.5 ? 'CC' : 'AA'), 'rgba(70,44,20,0.85)');
        n--;
    }
    for (const [ox, oy] of [[-0.45, -0.3], [0.4, 0.35]]) _hillHump(ctx, px(c.centre[0] + ox * c.rx), py(c.centre[1] + oy * c.ry), 14 + r() * 6, 'rgba(90,58,24,0.5)');
    _river(ctx, c, c.seed + 7, 'rgba(74,116,140,0.75)', 1.4);
}
function _texIsle(ctx, c) {
    const r = _rng(c.seed + 103), pts = C.polygon(c.key), T = FILL.isle.trees;
    let n = 160;
    for (let i = 0; i < n * 5 && n > 0; i++) {
        const x = c.centre[0] + (r() * 2 - 1) * c.rx, y = c.centre[1] + (r() * 2 - 1) * c.ry;
        if (!C.inside(pts, x, y) || C.edgeDist(pts, x, y) < 0.015) continue;
        _tree(ctx, px(x), py(y), 5 + r() * 4, T[(r() * T.length) | 0] + (r() < 0.5 ? 'CC' : 'AA'), 'rgba(50,38,20,0.85)');
        n--;
    }
    // salt marshes in the south-west: reed tufts + a brackish pool
    const mx = c.centre[0] - c.rx * 0.30, my = c.centre[1] + c.ry * 0.20;
    ctx.beginPath(); ctx.ellipse(px(mx), py(my), 13, 6, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(126,168,142,0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(58,42,30,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    for (let i = 0; i < 7; i++) _reeds(ctx, px(mx) + (r() - 0.5) * 40, py(my) + (r() - 0.5) * 20, 'rgba(52,88,72,0.8)');
    _river(ctx, c, c.seed + 9, 'rgba(74,116,140,0.75)', 1.4);
}
function _texDesert(ctx, c) {
    const r = _rng(c.seed + 104), pts = C.polygon(c.key);
    let n = 42;
    for (let i = 0; i < n * 5 && n > 0; i++) {
        const x = c.centre[0] + (r() * 2 - 1) * c.rx, y = c.centre[1] + (r() * 2 - 1) * c.ry;
        if (!C.inside(pts, x, y) || C.edgeDist(pts, x, y) < 0.014) continue;
        _dunes(ctx, px(x), py(y), 4 + r() * 3.5, 'rgba(142,90,30,0.6)');
        n--;
    }
    // the oasis at Mirage Wells
    const ox = c.centre[0] + c.rx * 0.30, oy = c.centre[1] + c.ry * 0.15;
    ctx.beginPath(); ctx.ellipse(px(ox), py(oy), 10, 5, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#7FB4C4'; ctx.fill(); ctx.strokeStyle = 'rgba(58,42,30,0.6)'; ctx.lineWidth = 0.9; ctx.stroke();
    for (let i = 0; i < 3; i++) _palm(ctx, px(ox) + 12 + i * 7, py(oy) - 6 + (i % 2) * 8, 4.5);
    // the Bone Road: a dotted caravan track across the land
    let x = c.centre[0] - c.rx * 0.75, y = c.centre[1] - c.ry * 0.1, a = 0.15;
    ctx.fillStyle = 'rgba(96,62,26,0.75)';
    ctx.beginPath(); ctx.moveTo(px(x), py(y));
    for (let i = 0; i < 11; i++) {
        a += (r() - 0.5) * 0.5;
        x += Math.cos(a) * c.rx * 0.13; y += Math.sin(a) * c.ry * 0.22;
        if (!C.inside(pts, x, y)) break;
        ctx.beginPath(); ctx.arc(px(x), py(y), 1.3, 0, Math.PI * 2); ctx.fill();
    }
}
function _texVolcanic(ctx, c) {
    const r = _rng(c.seed + 105), pts = C.polygon(c.key), E = FILL.volcanic.ember, HOTC = FILL.volcanic.emberHot;
    // glowing crack network
    for (let k = 0; k < 3; k++) _crackWalk(ctx, c, c.seed + 200 + k * 13, 'rgba(226,83,31,0.22)', E + 'A0');
    // volcano cones with burning craters
    const cones = [[-0.35, -0.15], [0.25, 0.2], [-0.05, 0.42]];
    for (const [ox, oy] of cones) {
        const x = px(c.centre[0] + ox * c.rx), y = py(c.centre[1] + oy * c.ry), s = 9 + r() * 4;
        ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.6); ctx.lineTo(x, y - s * 0.8); ctx.lineTo(x + s, y + s * 0.6); ctx.closePath();
        ctx.fillStyle = '#241C1A'; ctx.fill(); ctx.strokeStyle = 'rgba(210,190,170,0.5)'; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y - s * 0.8, s * 0.24, s * 0.10, 0, 0, Math.PI * 2);
        ctx.fillStyle = HOTC; ctx.fill();
        ctx.strokeStyle = E; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.72); ctx.quadraticCurveTo(x + s * 0.28, y - s * 0.2, x + s * 0.4, y + s * 0.5); ctx.stroke();
    }
    // the great lava river: glow + core + bright seam on ONE shared path
    let cx = c.centre[0] - c.rx * 0.05, cy = c.centre[1] + c.ry * 0.2, a = 0.9 + r() * 0.5;
    const walk = [[px(cx), py(cy)]];
    for (let i = 0; i < 9; i++) {
        a += (r() - 0.45) * 0.55;
        cx += Math.cos(a) * c.rx * 0.15; cy += Math.sin(a) * c.ry * 0.2;
        if (!C.inside(pts, cx, cy)) break;
        walk.push([px(cx), py(cy)]);
    }
    for (const [style, lw] of [['rgba(226,83,31,0.34)', 6.5], [E, 2.8], [HOTC, 1.1]]) {
        ctx.strokeStyle = style; ctx.lineWidth = lw;
        ctx.beginPath();
        walk.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
    }
    // ash speckles
    ctx.fillStyle = 'rgba(200,190,180,0.16)';
    for (let i = 0; i < 30; i++) {
        const ax = c.centre[0] + (r() * 2 - 1) * c.rx, ay = c.centre[1] + (r() * 2 - 1) * c.ry;
        if (C.inside(pts, ax, ay)) ctx.fillRect(px(ax), py(ay), 1.4, 1.4);
    }
}
const TEX = { tundra: _texTundra, highlands: _texHighlands, isle: _texIsle, desert: _texDesert, volcanic: _texVolcanic };

// ── skerries: tiny offshore islets (visual dressing) ─────────────────────────
function _skerries(ctx, c) {
    const r = _rng(c.seed + 61);
    const n = 3 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
        const a = r() * 6.28, rad = 0.6 + r() * 0.55;
        const bx = c.centre[0] + Math.cos(a) * c.rx * 1.22 * rad * 1.15;
        const by = c.centre[1] + Math.sin(a) * c.ry * 1.22 * rad * 1.15;
        const X = px(bx), Y = py(by), s = 4 + r() * 6;
        if (X < MX + 14 || X > MX + MW - 14 || Y < MY + 14 || Y > MY + MH - 14) continue;
        ctx.save();
        ctx.translate(X, Y); ctx.rotate(r() * 6.28);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
            const t = (k / 8) * 6.28, rr = s * (0.7 + r() * 0.6);
            const x = Math.cos(t) * rr, y = Math.sin(t) * rr * 0.7;
            k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = '#C9CFA6'; ctx.fill();
        ctx.strokeStyle = SEA.ink; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.restore();
        if (c.biome === 'isle' || c.biome === 'highlands') _tree(ctx, X, Y + 1, 3.5, FILL[c.biome].trees[0], 'rgba(50,38,20,0.8)');
        if (c.biome === 'tundra') _peak(ctx, X, Y + 1, 3, '#7E7568', '#F6F6F2', 'rgba(42,60,74,0.8)');
    }
}

// ── compass (eight-point, after the reference) ───────────────────────────────
function _compass(ctx, cx, cy, r) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    // thin diagonals
    ctx.strokeStyle = 'rgba(58,42,30,0.45)';
    for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(0, r * 1.3); ctx.stroke();
    }
    ctx.rotate(-Math.PI / 4 * 4);
    const diamond = (r1, w, fill) => {
        ctx.beginPath(); ctx.moveTo(0, -r1); ctx.lineTo(w, 0); ctx.lineTo(0, r1 * 0.22); ctx.lineTo(-w, 0); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.9; ctx.stroke();
    };
    for (let i = 0; i < 4; i++) { // intercardinal
        ctx.rotate(Math.PI / 2);
        diamond(r * 0.66, r * 0.11, PAL.parchmentDeep);
    }
    ctx.rotate(Math.PI / 4);
    for (let i = 0; i < 4; i++) { // cardinal
        ctx.rotate(Math.PI / 2);
        diamond(r * 1.24, r * 0.15, i === 0 ? PAL.wax : PAL.ink);
    }
    ctx.restore();
    ctx.font = '13px "Cinzel"'; ctx.fillStyle = PAL.ink; ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - r * 1.24 - 6);
}

// ── labels ───────────────────────────────────────────────────────────────────
function _label(ctx, placed, text, x, y, font, color, opts = {}) {
    ctx.font = font; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 10, h = opts.h || 18;
    const hit = (yy) => placed.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 && Math.abs(b.y - yy) < (b.h + h) / 2);
    let yy = y, k = 0;
    while (hit(yy) && k < 8) { k++; yy = y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (h + 3); }
    placed.push({ x, y: yy, w, h });
    if (opts.pill) {
        ctx.fillStyle = 'rgba(238,226,198,0.88)';
        ctx.fillRect(x - w / 2, yy - h + 4, w, h);
        ctx.strokeStyle = 'rgba(107,78,46,0.75)'; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 + 0.5, yy - h + 4.5, w - 1, h - 1);
        ctx.strokeStyle = 'rgba(107,78,46,0.4)'; ctx.lineWidth = 0.6; ctx.strokeRect(x - w / 2 + 2.5, yy - h + 6.5, w - 5, h - 5);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, yy);
    return yy;
}

function _grain(ctx, seed) {
    const r = _rng(seed);
    ctx.save(); ctx.beginPath(); ctx.rect(MX, MY, MW, MH); ctx.clip();
    ctx.fillStyle = 'rgba(120,90,50,0.05)';
    for (let i = 0; i < 900; i++) ctx.fillRect(MX + r() * MW, MY + r() * MH, 1.2, 1.2);
    ctx.fillStyle = 'rgba(255,250,232,0.06)';
    for (let i = 0; i < 420; i++) ctx.fillRect(MX + r() * MW, MY + r() * MH, 1.6, 1.6);
    ctx.restore();
}

function _hamlet(ctx, x, y) {
    ctx.fillStyle = '#F4E6C4'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 4.5, y + 3); ctx.lineTo(x - 4.5, y - 1.5); ctx.lineTo(x, y - 5.5); ctx.lineTo(x + 4.5, y - 1.5); ctx.lineTo(x + 4.5, y + 3); ctx.closePath();
    ctx.fill(); ctx.stroke();
}
function _marker(ctx, x, y) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = PAL.wax; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = PAL.parchment; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 1, y + 6); ctx.lineTo(x - 1, y - 7); ctx.strokeStyle = PAL.parchment; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 1, y - 7); ctx.lineTo(x + 6, y - 4); ctx.lineTo(x - 1, y - 1); ctx.closePath(); ctx.fillStyle = PAL.parchment; ctx.fill();
    ctx.restore();
}

/**
 * @param {{guildName?:string, guild?:object, memberNames?:string[]}} [o]
 * @returns {Promise<Buffer|null>}
 */
async function renderContinentMap(o = {}) {
    try {
        const { createCanvas } = require('canvas');
        WM._ensureFonts();
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');
        WM._bg(ctx);

        const gName = o.guildName || null;
        const place = gName ? C.placementOf(gName, o.guild || {}) : null;
        const home = place ? C.get(place.continent) : null;

        WM._titleBlock(ctx, C.PLANET.kicker, C.PLANET.name.toUpperCase(),
            gName ? `${gName} holds its charter-stone in ${home.name}` : C.PLANET.subtitle);

        // ── the map ──
        ctx.save();
        ctx.beginPath(); ctx.rect(MX, MY, MW, MH); ctx.clip();
        _seaBase(ctx);
        _seaWaves(ctx, 31);
        for (const c of C.CONTINENTS) _halo(ctx, c);
        for (const c of C.CONTINENTS) _skerries(ctx, c);
        for (const c of C.CONTINENTS) _coastWaves(ctx, c);
        for (const c of C.CONTINENTS) {
            _coastFill(ctx, c);                       // base + beach + rim shade
            ctx.save();
            _pathSmooth(ctx, dressed(c.key)); ctx.clip();
            TEX[c.biome](ctx, c);                     // texture ON TOP of the fill
            ctx.restore();
            _coastStroke(ctx, c, home && c.key === home.key);   // ink line last
        }
        _grain(ctx, 77);
        ctx.restore();

        // map frame rules (double, after the reference)
        ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2; ctx.strokeRect(MX, MY, MW, MH);
        ctx.lineWidth = 0.8; ctx.strokeRect(MX - 6, MY - 6, MW + 12, MH + 12);

        // ── guild overlay ──
        const placed = [];
        _spaced(ctx, C.CENTRE_SEA.name.toUpperCase(), px(C.CENTRE_SEA.at[0]), py(C.CENTRE_SEA.at[1]), 'italic 17px "IM Fell Italic"', 'rgba(30,84,90,0.88)', 5);

        let markerPx = null;
        const hamlets = [];
        if (place) {
            const names = (o.memberNames || []).slice(0, 12);
            const sites = C.baseSites(gName, o.guild || {}, Math.max(names.length - 1, 0) || ((o.guild && o.guild.members) ? Math.min((o.guild.members.length || 1) - 1, 11) : 0));
            sites.forEach((s) => hamlets.push([px(s.x), py(s.y)]));
            markerPx = [px(place.marker.x), py(place.marker.y)];
            placed.push({ x: markerPx[0], y: markerPx[1] + 4, w: 44, h: 36 });
            for (const [hx, hy] of hamlets) placed.push({ x: hx, y: hy, w: 14, h: 14 });
        }

        for (const c of C.CONTINENTS) {
            const cx = px(c.centre[0]), cy = py(c.centre[1]);
            for (const [name, ox, oy] of c.regions) {
                const rx = px(c.centre[0] + ox * c.rx), ry = py(c.centre[1] + oy * c.ry);
                ctx.fillStyle = 'rgba(58,42,30,0.55)'; ctx.beginPath(); ctx.arc(rx, ry - 14, 1.8, 0, Math.PI * 2); ctx.fill();
                _label(ctx, placed, name, rx, ry, 'italic 13px "IM Fell Italic"', c.biome === 'volcanic' ? '#F0E2C2' : PAL.ink, { h: 15 });
            }
            _label(ctx, placed, c.name.toUpperCase(), cx, cy, '15px "Cinzel"', c.ink, { pill: true, h: 22 });
        }

        if (place) {
            for (const [hx, hy] of hamlets) _hamlet(ctx, hx, hy);
            _marker(ctx, markerPx[0], markerPx[1]);
            ctx.font = '14px "Cinzel"'; ctx.textAlign = 'center';
            const label = gName.length > 22 ? gName.slice(0, 21) + '…' : gName;
            const tw = ctx.measureText(label).width + 14;
            const ly = markerPx[1] - 24;
            ctx.fillStyle = PAL.wax; ctx.fillRect(markerPx[0] - tw / 2, ly - 14, tw, 20);
            ctx.fillStyle = PAL.parchment; ctx.fillText(label, markerPx[0], ly);
        }

        _compass(ctx, MX + 64, MY + MH - 64, 28);

        // ── plates below the map ──
        const py0 = MY + MH + 24;
        if (place) {
            WM._decreePlate(ctx, 70, py0, 500, 176, `CHARTER-STONE - ${place.marker.region.toUpperCase()}`, [
                `${home.name}: ${home.epithet}`,
                `${(hamlets.length + 1)} ${hamlets.length ? 'hearths' : 'hearth'} stand within a day's walk of the stone.`,
                'Every member home base shares this land,',
                `and answers to the same sky: ${home.biome === 'isle' ? 'the coast' : home.biome}.`,
            ]);
        } else {
            WM._decreePlate(ctx, 70, py0, 500, 176, 'CHOOSE A CONTINENT', [
                'A guild picks its land when it is founded.',
                'The stone is set at a random place in that land,',
                'and every member base grows from the same terrain.',
                'Biomes: coast, dunes, tundra, autumn wood, ashlands.',
            ]);
        }
        WM._decreePlate(ctx, 590, py0, 340, 176, 'CONTINENTS OF ALDAFOLD', C.CONTINENTS.map((c) => `${c.name} - ${c.biome === 'isle' ? 'coast' : c.biome}`));
        WM._waxSealBig(ctx, W / 2, H - 66, 24, 'K');

        WM._frame(ctx);
        return canvas.toBuffer('image/png');
    } catch (e) {
        try { console.error('[continentMapRenderer] render failed:', e.message); } catch (_) { /* noop */ }
        return null;
    }
}

module.exports = { renderContinentMap };
