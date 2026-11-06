// ============================================
// 🎨 RUINS ROOM DESIGN VARIANTS — pixel-level plate re-texturing
// Owner directive 2026-10-06 ("some of these backgrounds are just a white
// square layered poorly on the floor"): the old flat overlay blobs are DEAD.
// Every variant is now BAKED INTO the plate's own pixels — hue/material remaps
// + texture synthesis that preserve the brick mortar, the AO shading and the
// perspective, so a variant reads as if the room was always built that way.
//
//   • the plates' shared geometry (floor polygon, N-walkway, torch spots) is
//     hand-measured from the art (scripts/measure_plates.js) — identical for
//     all nine door plates
//   • protected pixels are NEVER touched: door mouths (v<0.16), torch flames
//     and their sconce cores (bright warm), chains & gray iron (s<0.12)
//   • deterministic: same (plate, variant, seed) → same pixels, forever
// ============================================
'use strict';
const { createCanvas } = require('canvas');

// the roster: the intact plate (foundation) + 10 room designs.
// keys are STABLE — live event docs already store the old names
// (mossy/cracked/skulls/overgrown/dim) and they all remain valid.
const ROOM_VARIANTS = [
    'intact', 'mossy', 'sandy', 'flooded', 'cracked', 'skulls',
    'overgrown', 'dim', 'skill', 'crystal', 'emberfall',
];

// ── shared geometry (1200×900 plates) ──────────────────────────────────────
// floor polygon control rows: [y, xLeft, xRight] — measured, then hand-tightened
const FLOOR_ROWS = [
    [333, 382, 818], [400, 300, 902], [470, 226, 988], [540, 162, 1062],
    [610, 106, 1122], [680, 56, 1172], [750, 12, 1196], [820, 0, 1200],
    [900, 0, 1200],
];
// the lit walkway strip leading into the N arch (rows above the floor line)
const WALKWAY = { y0: 246, y1: 332, x0: 548, x1: 652 };
// corner crates own these rects — wood must never take floor treatments
const CRATES = [
    { x0: 0, y0: 782, x1: 118, y1: 900 },
    { x0: 1012, y0: 772, x1: 1200, y1: 900 },
];
// torch flame anchors (flame cluster centres, measured): back pair, side-upper pair, side-lower pair
const TORCHES = [
    { x: 420, y: 148 }, { x: 795, y: 148 },
    { x: 256, y: 252 }, { x: 960, y: 252 },
    { x: 56, y: 500 }, { x: 1159, y: 500 },
];
const W = 1200, H = 900;

// ── masks (built once per process) ─────────────────────────────────────────
let _masks = null;
function masks() {
    if (_masks) return _masks;
    const floor = new Uint8Array(W * H);
    for (let i = 0; i < FLOOR_ROWS.length - 1; i++) {
        const [ya, xa0, xa1] = FLOOR_ROWS[i];
        const [yb, xb0, xb1] = FLOOR_ROWS[i + 1];
        for (let y = ya; y < yb; y++) {
            const t = (y - ya) / (yb - ya);
            const l = Math.round(xa0 + (xb0 - xa0) * t);
            const r = Math.round(xa1 + (xb1 - xa1) * t);
            for (let x = l; x <= r; x++) floor[y * W + x] = 1;
        }
    }
    for (const c of CRATES) {
        for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) floor[y * W + x] = 0;
    }
    // per-column top of the floor → wall zone lives above it
    const floorTopCol = new Int16Array(W).fill(H);
    for (let x = 0; x < W; x++) {
        for (let y = 300; y < H; y++) { if (floor[y * W + x]) { floorTopCol[x] = y; break; } }
    }
    // floor edge proximity (0 far inside … 1 on the seam): 5×5 neighbour count
    const edge = new Float32Array(W * H);
    for (let y = 340; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (!floor[y * W + x]) continue;
            let n = 0;
            for (let dy = -5; dy <= 5; dy += 2) {
                const yy = y + dy; if (yy < 0 || yy >= H) continue;
                for (let dx = -5; dx <= 5; dx += 2) {
                    const xx = x + dx; if (xx < 0 || xx >= W) continue;
                    if (floor[yy * W + xx]) n++;
                }
            }
            edge[y * W + x] = 1 - n / 36;
        }
    }
    _masks = { floor, edge, floorTopCol };
    return _masks;
}

// ── colour + noise utils ───────────────────────────────────────────────────
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const chan = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) {
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6; if (h < 0) h += 1;
    }
    return [h, mx === 0 ? 0 : d / mx, mx];
}
function hsv2rgb(h, s, v) {
    h = (h % 1 + 1) % 1;
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        default: r = v; g = p; b = q;
    }
    return [r * 255, g * 255, b * 255];
}
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function strSeed(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
// value-noise with bilinear smoothing + 3-octave fbm
function makeNoise(rng) {
    const SIZE = 256, MASK = 255;
    const g = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    const at = (x, y) => g[(y & MASK) * SIZE + (x & MASK)];
    function noise(x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y) {
        return (noise(x, y) * 0.55 + noise(x * 2.13 + 37, y * 2.13 + 11) * 0.28 + noise(x * 4.31 + 91, y * 4.31 + 53) * 0.17);
    }
    return { noise, fbm };
}

// pixel classifier shared by all treatments: is this plate pixel decor we must
// never repaint? (door mouths / deep shadow, flames & sconce cores, ironwork)
function isProtected(h, s, v) {
    if (v < 0.16) return true;                        // arch mouths, deep AO
    if (v > 0.78 && s > 0.42 && h > 0.05 && h < 0.14) return true; // flames
    if (s < 0.12 && v > 0.25 && v < 0.92) return true; // chains, gray iron
    return false;
}

// ── treatments ─────────────────────────────────────────────────────────────
// Each gets (data, rng, N) where N = {floor, edge, floorTopCol}; mutates data.

function treatMossy(d, rng, N, nz) {
    for (let y = 246; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const isWalk = y <= WALKWAY.y1 && x >= WALKWAY.x0 && x <= WALKWAY.x1;
            if (!isWalk && !N.floor[y * W + x]) {
                // wall-base creep: green climbing the bottom courses of walls
                if (y > 300 && y < 700) {
                    const top = N.floorTopCol[x];
                    if (top < H && y < top && top - y < 64) {
                        const i = (y * W + x) * 4;
                        const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
                        if (isProtected(h, s, v) || s < 0.14) continue;
                        const n = nz.fbm(x * 0.024, y * 0.024);
                        const p = n * 0.8 - (top - y) / 130;
                        if (p > 0.42) {
                            const [r, g, b] = hsv2rgb(h + 0.19, 0.26 + n * 0.16, v * (0.94 + n * 0.1));
                            d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
                        }
                    }
                }
                continue;
            }
            const i = (y * W + x) * 4;
            const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
            if (isProtected(h, s, v)) continue;
            const n = nz.fbm(x * 0.021, y * 0.021);
            const eB = isWalk ? 0.25 : N.edge[y * W + x];
            const mortar = v < 0.42 ? 0.16 : 0;
            const lit = v > 0.7 && s > 0.35 ? 0.34 : 0;   // torch-lit stones stay clean
            const p = n * 0.78 + eB * 0.42 + mortar - lit;
            if (p > 0.56 || (p > 0.47 && (x + y) % 2 === 0)) {
                const g2 = hsv2rgb(h + 0.21, 0.27 + n * 0.17, v * (0.9 + n * 0.18));
                d[i] = chan(g2[0]); d[i + 1] = chan(g2[1]); d[i + 2] = chan(g2[2]);
            }
        }
    }
}

function treatSandy(d, rng, N, nz) {
    for (let y = 246; y < H; y++) {
        const inWalk = y <= WALKWAY.y1;
        for (let x = 0; x < W; x++) {
            if (!N.floor[y * W + x] && !(inWalk && x >= WALKWAY.x0 && x <= WALKWAY.x1)) continue;
            const i = (y * W + x) * 4;
            const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
            if (isProtected(h, s, v)) continue;
            const n = nz.noise(x * 0.5, y * 0.5);          // fine grain
            const drift = nz.fbm(x * 0.007, y * 0.02);      // long dust bands
            let hh = 0.093 + (h - 0.08) * 0.4;              // pull toward tan 33°
            let ss = s * 0.66;
            let vv = v * 1.065 + (n - 0.5) * 0.055;
            if (drift > 0.58) { vv += (drift - 0.58) * 0.22; ss *= 0.92; }
            if (v < 0.42) vv = v * 1.2;                     // mortar lifts to sand
            const [r, g, b] = hsv2rgb(hh, ss, clamp01(vv));
            d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
        }
    }
    // sand accumulated at the wall bases
    for (let x = 0; x < W; x++) {
        const top = N.floorTopCol[x];
        if (top >= H) continue;
        for (let y = Math.max(0, top - 9); y < top; y++) {
            const i = (y * W + x) * 4;
            const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
            if (isProtected(h, s, v) || s < 0.1) continue;
            const [r, g, b] = hsv2rgb(0.09, s * 0.6, Math.min(1, v * 1.1));
            d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
        }
    }
}

function treatFlooded(d, rng, N, nz) {
    for (let y = 246; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (!N.floor[y * W + x] && !(y <= WALKWAY.y1 && x >= WALKWAY.x0 && x <= WALKWAY.x1)) continue;
            const i = (y * W + x) * 4;
            const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
            if (isProtected(h, s, v)) continue;
            const n = nz.fbm(x * 0.013, y * 0.03);
            const shimmer = Math.sin(y * 0.32 + n * 7) * 0.5 + 0.5;
            let hh = h + (0.555 - h) * 0.62;                 // pull blue-teal (murky water)
            let ss = s * 0.78;
            let vv = v * 0.74 + shimmer * 0.05;
            if (n > 0.87 && shimmer > 0.62) { hh = 0.54; ss = 0.12; vv = 0.94; } // glints
            const [r, g, b] = hsv2rgb(hh, ss, clamp01(vv));
            d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
        }
    }
    // warm torch reflections streaking toward the viewer on the wet floor
    for (const t of TORCHES) {
        if (t.y > 330) continue;
        const top = N.floorTopCol[clamp01(t.x) && t.x < W ? t.x : 600] || 333;
        for (let dy = 0; dy < 110; dy++) {
            const y = top + dy;
            if (y >= H) break;
            const fall = 1 - dy / 110;
            for (let dx = -13; dx <= 13; dx++) {
                const x = t.x + dx;
                if (x < 0 || x >= W || !N.floor[y * W + x]) continue;
                const wdt = Math.exp(-(dx * dx) / (2 * (4 + dy * 0.14)));
                const a = fall * wdt * 0.34;
                if (a < 0.02) continue;
                const i = (y * W + x) * 4;
                d[i] = chan(d[i] + 210 * a);
                d[i + 1] = chan(d[i + 1] + 120 * a);
                d[i + 2] = chan(d[i + 2] + 30 * a);
            }
        }
    }
}

function treatCracked(d, rng, N, nz) {
    // perspective cracks: seeded walks with depth-scaled steps
    const crackPix = new Set();
    const starts = [];
    for (let k = 0; k < 11; k++) {
        starts.push({ x: 150 + rng() * 900, y: 360 + rng() * 460, a: rng() * Math.PI * 2 });
    }
    for (const st of starts) {
        let { x, y, a } = st;
        for (let step = 0; step < 34; step++) {
            const depth = 0.7 + 0.7 * ((y - 333) / 567);
            const seg = Math.max(4, 10 * depth);
            a += (rng() - 0.5) * 0.8;
            const nx = x + Math.cos(a) * seg, ny = y + Math.sin(a) * seg * 0.55;
            for (let t = 0; t <= 1; t += 0.2) {
                const px = Math.round(x + (nx - x) * t), py = Math.round(y + (ny - y) * t);
                if (px < 0 || px >= W || py < 0 || py >= H || !N.floor[py * W + px]) continue;
                crackPix.add(py * W + px);
                crackPix.add(py * W + Math.min(W - 1, px + 1));   // 2px dark core reads at zoom
                if (step > 7 && rng() < 0.07) crackPix.add(py * W + Math.max(0, px - 1));
            }
            x = nx; y = ny;
            if (x < 30 || x > W - 30 || y < 350 || y > H - 20) break;
        }
    }
    for (const idx of crackPix) {
        const i = idx * 4;
        const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
        const [r, g, b] = hsv2rgb(h, s * 0.65, v * 0.32);
        d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
    }
    // bevel highlight on one side of each crack
    for (const idx of crackPix) {
        const x = idx % W, y = Math.floor(idx / W);
        const hx = x + 1;
        if (hx >= W || !N.floor[y * W + hx] || crackPix.has(y * W + hx)) continue;
        const i = (y * W + hx) * 4;
        const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
        const [r, g, b] = hsv2rgb(h, s, Math.min(1, v * 1.22));
        d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
    }
    // sunken tiles: darkened brick patches with a deeper rim
    for (let k = 0; k < 7; k++) {
        const cx = 220 + rng() * 760, cy = 390 + rng() * 400;
        const tw = 50 + rng() * 36, th = tw * 0.42;
        for (let y = Math.round(cy - th / 2); y < cy + th / 2; y++) {
            for (let x = Math.round(cx - tw / 2); x < cx + tw / 2; x++) {
                if (x < 0 || x >= W || y < 0 || y >= H || !N.floor[y * W + x]) continue;
                const i = (y * W + x) * 4;
                const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
                if (isProtected(h, s, v)) continue;
                const rim = (x < cx - tw / 2 + 3 || x > cx + tw / 2 - 3 || y < cy - th / 2 + 2 || y > cy + th / 2 - 2);
                const [r, g, b] = hsv2rgb(h, s, v * (rim ? 0.55 : 0.8));
                d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
            }
        }
    }
    // fallen dust under crack crossings
    for (let k = 0; k < 5; k++) {
        const cx = 200 + rng() * 800, cy = 400 + rng() * 400;
        if (!N.floor[Math.round(cy) * W + Math.round(cx)]) continue;
        for (let dy = -5; dy <= 5; dy++) for (let dx = -26; dx <= 26; dx++) {
            const x = Math.round(cx + dx), y = Math.round(cy + dy);
            if (x < 0 || x >= W || y < 0 || y >= H || !N.floor[y * W + x]) continue;
            const fall = 1 - Math.abs(dx) / 26;
            const i = (y * W + x) * 4;
            d[i] = chan(d[i] + 26 * fall); d[i + 1] = chan(d[i + 1] + 22 * fall); d[i + 2] = chan(d[i + 2] + 14 * fall);
        }
    }
}

function treatSkulls(d, rng, N, nz) {
    // cold, drained grade under the bone work
    for (let y = 246; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (!N.floor[y * W + x] && !(y <= WALKWAY.y1 && x >= WALKWAY.x0 && x <= WALKWAY.x1)) continue;
            const i = (y * W + x) * 4;
            const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
            if (isProtected(h, s, v)) continue;
            const [r, g, b] = hsv2rgb(h + 0.012, s * 0.82, v * 0.965);
            d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
        }
    }
}

function treatOvergrown(d, rng, N, nz) {
    // ivy sheets climbing the side walls (per-pixel, density falls with height)
    for (let y = 120; y < 760; y++) {
        for (let x = 0; x < W; x++) {
            if (N.floor[y * W + x]) continue;
            const top = N.floorTopCol[x];
            if (top >= H) continue;
            const above = top - y;
            if (above < -4 || above > 380) continue;
            if (x > 250 && x < 950) continue;             // side walls + corners only
            const i = (y * W + x) * 4;
            const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
            if (isProtected(h, s, v) || s < 0.12) continue;
            const n = nz.fbm(x * 0.032, y * 0.032);
            const p = n * 1.0 - above / 500;
            if (p > 0.4 || (p > 0.33 && (x + y) % 2 === 0)) {
                const deep = above < 60;
                const [r, g, b] = hsv2rgb(0.25 + n * 0.04, 0.34 + n * 0.14, v * (deep ? 0.82 : 0.92) + n * 0.06);
                d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
            }
        }
    }
    // sparse grass tufts rooted in the floor seams
    for (let k = 0; k < 9; k++) {
        const bx = 150 + rng() * 900, by = 400 + rng() * 420;
        if (!N.floor[Math.round(by) * W + Math.round(bx)]) continue;
        const blades = 4 + Math.floor(rng() * 5);
        for (let b = 0; b < blades; b++) {
            const x0 = Math.round(bx + (rng() - 0.5) * 16);
            const hgt = 4 + Math.floor(rng() * 8);
            const lean = rng() < 0.5 ? -1 : 1;
            for (let t = 0; t < hgt; t++) {
                const y = Math.round(by) - t;
                const x = x0 + Math.round(lean * t * 0.22);
                if (y < 0 || x < 0 || x >= W || !N.floor[y * W + x]) break;
                const i = (y * W + x) * 4;
                const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
                if (isProtected(h, s, v)) continue;
                const [r, g, b2] = hsv2rgb(0.26, 0.4, 0.32 + (t / hgt) * 0.22 + rng() * 0.05);
                d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b2);
            }
        }
    }
}

function treatDim(d, rng, N, nz) {
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const inWall = y < N.floorTopCol[x];
            const inFloor = N.floor[y * W + x] || (y <= WALKWAY.y1 && x >= WALKWAY.x0 && x <= WALKWAY.x1);
            if (!inWall && !inFloor) continue;
            const i = (y * W + x) * 4;
            const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
            if (v < 0.03) continue;
            const depth = Math.min(1, Math.max(0, (y - 340) / 480)); // deeper shade toward the viewer
            let vv = v * (inFloor ? 0.84 - depth * 0.05 : 0.87);
            let hh = h + (0.6 - h) * 0.12;
            const [r, g, b] = hsv2rgb(hh, s, clamp01(vv));
            d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
        }
    }
    // torch pools stay warm: additive radial glow around each flame anchor
    for (const t of TORCHES) {
        for (let dy = -110; dy <= 110; dy += 1) {
            const y = t.y + dy;
            if (y < 0 || y >= H) continue;
            for (let dx = -110; dx <= 110; dx += 1) {
                const x = t.x + dx;
                if (x < 0 || x >= W) continue;
                const dist = Math.hypot(dx, dy);
                if (dist > 110) continue;
                const a = (1 - dist / 110) ** 2 * 0.30;
                const i = (y * W + x) * 4;
                d[i] = chan(d[i] + 235 * a);
                d[i + 1] = chan(d[i + 1] + 150 * a);
                d[i + 2] = chan(d[i + 2] + 55 * a);
            }
        }
    }
}

function treatEmberfall(d, rng, N, nz) {
    for (let y = 246; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const inFloor = N.floor[y * W + x] || (y <= WALKWAY.y1 && x >= WALKWAY.x0 && x <= WALKWAY.x1);
            if (!inFloor) {
                // upper wall courses take soot
                if (y < 260 && y > 30) {
                    const i = (y * W + x) * 4;
                    const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
                    if (isProtected(h, s, v) || s < 0.1) continue;
                    const [r, g, b] = hsv2rgb(h, s * 0.9, v * 0.9);
                    d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
                }
                continue;
            }
            const i = (y * W + x) * 4;
            const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
            if (isProtected(h, s, v)) continue;
            const n = nz.fbm(x * 0.045, y * 0.045);
            const ash = nz.fbm(x * 0.006 + 7, y * 0.019 + 3);
            let hh = h + (0.045 - h) * 0.5;
            let ss = s * 0.55;
            let vv = v * 0.87;
            if (ash > 0.6) { vv = Math.min(1, vv + (ash - 0.6) * 0.5); ss *= 0.75; }
            if (v < 0.42 && n > 0.64) {                    // ember glow in the mortar
                hh = 0.055; ss = 0.9; vv = Math.min(1, 0.42 + (n - 0.64) * 1.4);
                if (n > 0.84) { hh = 0.07; ss = 0.95; vv = 0.75; }
            }
            const [r, g, b] = hsv2rgb(hh, ss, clamp01(vv));
            d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
        }
    }
    // drifting embers near the floor edges
    for (let k = 0; k < 12; k++) {
        const x = Math.round(60 + rng() * 1080);
        const y = Math.round(380 + rng() * 460);
        if (!N.floor[y * W + x]) continue;
        const i = (y * W + x) * 4;
        d[i] = 255; d[i + 1] = chan(120 + rng() * 70); d[i + 2] = 40;
        if (rng() < 0.5) { const j = (y * W + x + 1) * 4; d[j] = 255; d[j + 1] = 170; d[j + 2] = 70; }
    }
}

// ── canvas-drawn layers (pixel-art objects, drawn 1:1 into the plate) ──────

// bone cluster: dithered craniums + long bones + scatters, plate-coherent
// palette, 1px dark outline, soft AO — hugs the wall base like the props do.
function drawBoneCluster(ctx, cx, gy, s, rng) {
    const BONE = '#d6c9a2', BONE_LIT = '#e7dcb8', BONE_SH = '#93865f', OUT = '#332c1d';
    ctx.save();
    ctx.translate(cx, gy);
    ctx.scale(s, s);
    // AO bed
    ctx.fillStyle = 'rgba(12,9,5,0.34)';
    ctx.beginPath(); ctx.ellipse(0, 1, 34, 7, 0, 0, Math.PI * 2); ctx.fill();
    const skull = (ox, oy, r, lit) => {
        // cranium: circle + squared jaw, two-tone dither, outline
        ctx.fillStyle = OUT;
        ctx.beginPath(); ctx.arc(ox, oy, r + 1, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(ox - r - 1, oy, 2 * r + 3, r * 0.62 + 2);
        ctx.fillStyle = lit ? BONE_LIT : BONE;
        ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(ox - r, oy, 2 * r, Math.round(r * 0.58));
        ctx.fillStyle = BONE_SH;
        ctx.beginPath(); ctx.arc(ox + r * 0.3, oy + r * 0.28, r * 0.72, 0.3, 1.8); ctx.fill();
        ctx.fillRect(ox - r, oy + Math.round(r * 0.3), 2 * r, Math.round(r * 0.26));
        // sockets + nasal
        ctx.fillStyle = '#241f13';
        ctx.fillRect(ox - Math.round(r * 0.52), oy - Math.round(r * 0.18), Math.max(2, Math.round(r * 0.3)), Math.max(2, Math.round(r * 0.3)));
        ctx.fillRect(ox + Math.round(r * 0.16), oy - Math.round(r * 0.18), Math.max(2, Math.round(r * 0.3)), Math.max(2, Math.round(r * 0.3)));
        ctx.fillRect(ox - 1, oy + Math.round(r * 0.16), 2, Math.max(2, Math.round(r * 0.22)));
    };
    const bone = (x0, y0, x1, y1) => {
        ctx.strokeStyle = OUT; ctx.lineWidth = 4.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = BONE; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.fillStyle = BONE_LIT;
        for (const [kx, ky] of [[x0, y0], [x1, y1]]) { ctx.beginPath(); ctx.arc(kx, ky, 2.2, 0, Math.PI * 2); ctx.fill(); }
    };
    // composition: two craniums, crossed long bones behind, bits in front
    bone(-20, -4, 16, -12); bone(-12, -14, 22, -2);
    skull(-7, -16, 9, true);
    skull(14, -9, 6.5, false);
    ctx.fillStyle = BONE_SH;
    for (let k = 0; k < 5; k++) ctx.fillRect(-26 + rng() * 50, -4 + rng() * 5, 3, 2);
    ctx.restore();
}

// ribcage against a wall base
function drawRibcage(ctx, cx, gy, s, flip) {
    const BONE = '#cfc29a', OUT = '#332c1d';
    ctx.save();
    ctx.translate(cx, gy); ctx.scale(flip ? -s : s, s);
    ctx.fillStyle = 'rgba(12,9,5,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 1, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
    // spine
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-26, -6); ctx.lineTo(24, -10); ctx.stroke();
    ctx.strokeStyle = BONE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-26, -6); ctx.lineTo(24, -10); ctx.stroke();
    // ribs bowing up from the spine
    for (let i = 0; i < 4; i++) {
        const x = -20 + i * 12;
        ctx.strokeStyle = OUT; ctx.lineWidth = 4.4;
        ctx.beginPath(); ctx.arc(x, -8, 13 - i, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        ctx.strokeStyle = BONE; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(x, -8, 13 - i, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    ctx.restore();
}

// luminous crystal cluster (cyan core → deep edge, additive halo)
function drawCrystalCluster(ctx, cx, gy, s, rng) {
    ctx.save();
    ctx.translate(cx, gy); ctx.scale(s, s);
    const g = ctx.createRadialGradient(0, -14, 4, 0, -14, 52);
    g.addColorStop(0, 'rgba(140,225,255,0.30)');
    g.addColorStop(1, 'rgba(90,180,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-56, -70, 112, 86);
    ctx.fillStyle = 'rgba(10,14,20,0.32)';
    ctx.beginPath(); ctx.ellipse(0, 1, 26, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    const shard = (ox, hgt, wd, lean) => {
        ctx.beginPath();
        ctx.moveTo(ox, -hgt);
        ctx.lineTo(ox + wd / 2 + lean, -hgt * 0.32);
        ctx.lineTo(ox + wd * 0.3, 0);
        ctx.lineTo(ox - wd * 0.34, 0);
        ctx.lineTo(ox - wd / 2 + lean, -hgt * 0.32);
        ctx.closePath();
        ctx.fillStyle = '#2c7ba8'; ctx.fill();
        ctx.strokeStyle = '#12374e'; ctx.lineWidth = 1.2; ctx.stroke();
        // lit facet + core
        ctx.beginPath();
        ctx.moveTo(ox, -hgt + 1.5);
        ctx.lineTo(ox + wd * 0.18 + lean * 0.6, -hgt * 0.34);
        ctx.lineTo(ox - wd * 0.1, -hgt * 0.3);
        ctx.closePath();
        ctx.fillStyle = '#8fe3ff'; ctx.fill();
        ctx.fillStyle = '#e9fbff';
        ctx.fillRect(ox - 1, -hgt + 3, 2, Math.max(2, hgt * 0.3));
    };
    shard(-14, 24 + rng() * 8, 10, -1.5);
    shard(2, 38 + rng() * 10, 13, 1);
    shard(15, 20 + rng() * 6, 9, 2.5);
    shard(-4, 14 + rng() * 5, 7, -1);
    ctx.restore();
}

// glyph mark used by the skill ring (small angular rune strokes)
function drawGlyph(ctx, x, y, a, s, rng) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    ctx.strokeStyle = 'rgba(190,245,255,0.9)';
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const k = Math.floor(rng() * 4);
    ctx.beginPath();
    if (k === 0) { ctx.moveTo(-3, -4); ctx.lineTo(3, 0); ctx.lineTo(-3, 4); }
    else if (k === 1) { ctx.moveTo(-3, -4); ctx.lineTo(0, 4); ctx.lineTo(3, -4); }
    else if (k === 2) { ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.moveTo(-3, -1); ctx.lineTo(3, -1); }
    else { ctx.moveTo(-3, -3); ctx.lineTo(3, -3); ctx.moveTo(0, -3); ctx.lineTo(0, 3); ctx.moveTo(-2, 3); ctx.lineTo(2, 3); }
    ctx.stroke();
    ctx.restore();
}

// skill chamber: cool clean grade + perspective rune circle baked onto the floor
function finishSkill(ctx, rng, N) {
    const CX = 600, CY = 618, RX = 208, RY = 66;
    // under-glow wash
    ctx.save();
    const g = ctx.createRadialGradient(CX, CY, 10, CX, CY, RX * 1.35);
    g.addColorStop(0, 'rgba(70,205,255,0.16)');
    g.addColorStop(1, 'rgba(70,205,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(CX, CY, RX * 1.35, RY * 2.1, 0, 0, Math.PI * 2); ctx.fill();
    // outer ring (double stroke) + inner ring, elliptical for perspective
    ctx.globalCompositeOperation = 'lighter';
    for (const [rx, ry, w, a] of [[RX, RY, 5, 0.30], [RX - 3, RY - 2.5, 2.4, 0.75], [RX - 56, RY - 18, 2, 0.5]]) {
        ctx.strokeStyle = `rgba(110,225,255,${a})`;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.ellipse(CX, CY, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // glyph ticks between the rings + cardinal diamonds
    for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        const gx = CX + Math.cos(a) * (RX - 28), gy = CY + Math.sin(a) * (RY - 9);
        drawGlyph(ctx, gx, gy, a, 1.5 + rng() * 0.6, rng);
    }
    ctx.fillStyle = 'rgba(190,245,255,0.85)';
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const gx = CX + Math.cos(a) * RX, gy = CY + Math.sin(a) * RY;
        ctx.beginPath();
        ctx.moveTo(gx, gy - 5); ctx.lineTo(gx + 4, gy); ctx.lineTo(gx, gy + 5); ctx.lineTo(gx - 4, gy);
        ctx.closePath(); ctx.fill();
    }
    // centre sigil
    ctx.strokeStyle = 'rgba(160,235,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(CX, CY, 26, 9, 0, 0, Math.PI * 2); ctx.stroke();
    drawGlyph(ctx, CX, CY, 0, 2.6, rng);
    ctx.restore();
    // faint sigils on the back wall stones
    for (const [sx, sy, ss] of [[350, 210, 2.2], [838, 196, 2.0], [600, 82, 1.7]]) {
        ctx.save();
        ctx.globalAlpha = 0.30;
        drawGlyph(ctx, sx, sy, 0.2, ss, rng);
        ctx.restore();
    }
}

// crystal chamber: cool grade + cluster halo blending
function finishCrystal(ctx, rng, N) {
    ctx.save();
    const g = ctx.createRadialGradient(600, 480, 60, 600, 480, 720);
    g.addColorStop(0, 'rgba(80,170,230,0.05)');
    g.addColorStop(1, 'rgba(30,50,90,0.10)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

// skulls variant object layer
// placement audited against SPAWN_SPOTS w(258,590) e(942,612) n(596,402)
// s(624,780), the door mouths DOORS w(168,505) e(1032,505) n(600,292), the
// HUB panel (x<530, y>610) and the enemy/boss anchors — every cluster hugs a
// wall base in a pocket no actor ever occupies.
function finishSkulls(ctx, rng, N) {
    drawBoneCluster(ctx, 410, 372, 0.95, rng);
    drawBoneCluster(ctx, 800, 375, 0.85, rng);
    drawBoneCluster(ctx, 1100, 700, 1.05, rng);
    drawRibcage(ctx, 1120, 585, 1.05, false);
}

// crystal variant object layer (same audited-pocket rule as the skulls)
function finishCrystalClusters(ctx, rng, N) {
    drawCrystalCluster(ctx, 455, 355, 0.62, rng);
    drawCrystalCluster(ctx, 872, 388, 0.7, rng);
    drawCrystalCluster(ctx, 1085, 655, 1.05, rng);
    drawCrystalCluster(ctx, 355, 435, 0.55, rng);
    // sparkles
    ctx.fillStyle = '#eafcff';
    for (let k = 0; k < 9; k++) {
        const x = 150 + rng() * 900, y = 360 + rng() * 320;
        ctx.fillRect(x, y, 1.6, 1.6);
    }
}

// overgrown variant object layer: hanging vines from the ceiling
function finishOvergrown(ctx, rng, N) {
    const LEAF = ['#4a6c30', '#587c38', '#3d5a26'];
    for (let k = 0; k < 7; k++) {
        const x0 = 150 + rng() * 900;
        if (x0 > 505 && x0 < 695) continue;               // keep the N arch head clear
        const len = 130 + rng() * 150;
        const sway = (rng() - 0.5) * 1.7;
        let vx = x0;
        for (let y = 22; y < 22 + len; y += 2) {
            const t = (y - 22) / len;
            vx += sway * (t * t) * 1.1;
            const px = Math.round(vx), py = Math.round(y);
            ctx.fillStyle = '#3a5226';
            ctx.fillRect(px, py, 2, 2);
            if (y % 8 < 2) {
                const lc = LEAF[Math.floor(rng() * LEAF.length)];
                ctx.fillStyle = lc;
                ctx.fillRect(px - 4, py + (rng() < 0.5 ? -2 : 1), 3, 2);
                ctx.fillRect(px + 3, py + (rng() < 0.5 ? -1 : 2), 3, 2);
            }
            if (y > 22 + len - 5) { ctx.fillStyle = '#6d9448'; ctx.fillRect(px - 1, py, 3, 2); }
        }
    }
}

// ── driver ─────────────────────────────────────────────────────────────────
const _cache = new Map(); // `${plateKey}:${variant}:${seed}` → canvas

async function applyVariant(img, variant, seedKey) {
    if (!variant || variant === 'intact') return img;
    const key = `${seedKey || ''}:${variant}`;
    if (_cache.has(key)) return _cache.get(key);
    if (_cache.size > 240) _cache.clear();              // long-lived workers: bound the cache
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const N = masks();
    const rng = mulberry32(strSeed(`variant:${key}`));
    const nz = makeNoise(rng);
    const id = ctx.getImageData(0, 0, img.width, img.height);
    const d = id.data;
    switch (variant) {
        case 'mossy': treatMossy(d, rng, N, nz); break;
        case 'sandy': treatSandy(d, rng, N, nz); break;
        case 'flooded': treatFlooded(d, rng, N, nz); break;
        case 'cracked': treatCracked(d, rng, N, nz); break;
        case 'skulls': treatSkulls(d, rng, N, nz); break;
        case 'overgrown': treatOvergrown(d, rng, N, nz); break;
        case 'dim': treatDim(d, rng, N, nz); break;
        case 'emberfall': treatEmberfall(d, rng, N, nz); break;
        case 'skill': {
            // clean cool floor grade, then the baked rune circle
            for (let y = 246; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    if (!N.floor[y * W + x] && !(y <= WALKWAY.y1 && x >= WALKWAY.x0 && x <= WALKWAY.x1)) continue;
                    const i = (y * W + x) * 4;
                    const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
                    if (isProtected(h, s, v)) continue;
                    const [r, g, b] = hsv2rgb(h + 0.012, s * 0.94, v * 0.99);
                    d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
                }
            }
            break;
        }
        case 'crystal': {
            for (let y = 246; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    if (!N.floor[y * W + x] && !(y <= WALKWAY.y1 && x >= WALKWAY.x0 && x <= WALKWAY.x1)) continue;
                    const i = (y * W + x) * 4;
                    const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
                    if (isProtected(h, s, v)) continue;
                    const [r, g, b] = hsv2rgb(h + (0.55 - h) * 0.07, s * 0.96, v * 0.985);
                    d[i] = chan(r); d[i + 1] = chan(g); d[i + 2] = chan(b);
                }
            }
            break;
        }
        default: return img;
    }
    ctx.putImageData(id, 0, 0);
    if (variant === 'skulls') finishSkulls(ctx, rng, N);
    else if (variant === 'skill') finishSkill(ctx, rng, N);
    else if (variant === 'crystal') { finishCrystal(ctx, rng, N); finishCrystalClusters(ctx, rng, N); }
    else if (variant === 'overgrown') finishOvergrown(ctx, rng, N);
    _cache.set(key, c);
    return c;
}

// per-variant bake weight at event start (state.js), by ring depth 0..1:
// intact/mossy/sandy common near spawn; damaged & arcane designs rise with depth
function variantWeight(variant, depth) {
    switch (variant) {
        case 'intact': return 3.0 - depth * 1.3;
        case 'mossy': return 2.1;
        case 'sandy': return 1.7;
        case 'flooded': return 0.8 + depth * 0.7;
        case 'cracked': return 1.0 + depth * 1.1;
        case 'skulls': return 0.6 + depth * 1.1;
        case 'overgrown': return 0.9 + depth * 0.9;
        case 'dim': return 0.6 + depth * 1.2;
        case 'skill': return 1.1;
        case 'crystal': return 0.7 + depth * 0.5;
        case 'emberfall': return 0.5 + depth * 1.3;
        default: return 0.8;
    }
}

function clearVariantCache() { _cache.clear(); }

module.exports = {
    ROOM_VARIANTS,
    TORCHES, WALKWAY, FLOOR_ROWS,
    masks, rgb2hsv, hsv2rgb, mulberry32, strSeed, makeNoise, isProtected,
    treatMossy, treatSandy, treatFlooded, treatCracked, treatSkulls,
    treatOvergrown, treatDim, treatEmberfall,
    applyVariant, clearVariantCache, variantWeight,
    drawBoneCluster, drawCrystalCluster,
};
