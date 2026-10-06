#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// gw_stele_backdrop_strip.js — lore_stele.png shipped with a baked OPAQUE
// backdrop: dark navy/plum fill + a dirt-brown ground band hugging the plinth
// (sides/top are transparent). In-scene it renders as a hard rectangle pasted
// on the floor. Fix: flood-fill from the sprite borders over pixels classified
// as background (dirt browns / navy-plums, tight per-channel tolerance so the
// plinth's own dark navy STONE (34,34,73) survives), then despeckle orphans.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

const P = path.join(__dirname, '..', 'core', 'rpgasset', 'guildwar', 'ruins', 'props', 'lore_stele.png');

// [r, g, b, tol] — per-seed tolerance; the plinth's own navy stone (34,34,73)
// / (51,54,82) must NOT match the teal side backdrop (45,81,93): the green
// channel is the discriminator (g 54 vs g 81) → teal tol stays ≤12.
const SEEDS = [
    // dirt browns sampled from the band (124,79,59) (114,68,52) (102,69,57)
    [124, 79, 59, 24], [114, 68, 52, 24], [102, 69, 57, 24], [88, 60, 48, 22],
    // dirt highlights (187,127,63) — stone tans (201,175,141) stay far away
    [187, 127, 63, 26], [160, 110, 60, 22], [140, 95, 55, 20],
    // navy/plum backdrop corners (0,17,56) (43,29,50)
    [0, 17, 56, 22], [43, 29, 50, 22], [20, 24, 58, 22], [30, 22, 46, 20],
    // teal-navy side backdrop (45,81,93) — plinth navy differs on green
    [48, 80, 92, 12], [40, 70, 84, 10], [55, 88, 100, 10], [45, 81, 93, 12],
];

function isBg(r, g, b) {
    for (const s of SEEDS) {
        if (Math.abs(r - s[0]) <= s[3] && Math.abs(g - s[1]) <= s[3] && Math.abs(b - s[2]) <= s[3]) return true;
    }
    return false;
}

(async () => {
    const img = await loadImage(P);
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, img.width, img.height);
    const d = im.data;
    const W = img.width, H = img.height;
    const bg = new Uint8Array(W * H);
    const st = [];
    const push = (x, y) => st.push(x, y);
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    let erased = 0;
    while (st.length) {
        const y = st.pop(), x = st.pop();
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (bg[i]) continue;
        const o = i * 4;
        if (d[o + 3] === 0) { bg[i] = 1; push(x + 1, y, x - 1, y, x, y + 1, x, y - 1); continue; }
        if (!isBg(d[o], d[o + 1], d[o + 2])) continue;   // stone/moss/glyph → wall
        d[o + 3] = 0;                                     // erase + keep flooding
        bg[i] = 1; erased++;
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    // despeckle: opaque pixels with ≤1 opaque 4-neighbour → gone (dirt crumbs,
    // navy islands cut off from the border flood)
    let speck = 0;
    const alphaAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : d[(y * W + x) * 4 + 3] > 0;
    const kill = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!alphaAt(x, y)) continue;
        const n = alphaAt(x + 1, y) + alphaAt(x - 1, y) + alphaAt(x, y + 1) + alphaAt(x, y - 1);
        if (n <= 1) kill.push(x, y);
    }
    while (kill.length) {
        const y = kill.pop(), x = kill.pop();
        d[(y * W + x) * 4 + 3] = 0; speck++;
    }
    // keep only the LARGEST opaque connected component (the stele + its moss
    // + the plinth grass, which all touch it) — every disconnected fleck
    // (edge grass crumbs, dirt bits, stray coloured dots) goes
    const comp = new Int32Array(W * H).fill(-1);
    const comps = [];
    for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
        const i0 = y0 * W + x0;
        if (d[i0 * 4 + 3] === 0 || comp[i0] >= 0) continue;
        const id = comps.length; let size = 0;
        const q = [x0, y0]; comp[i0] = id;
        while (q.length) {
            const y = q.pop(), x = q.pop(); size++;
            for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const ni = ny * W + nx;
                if (d[ni * 4 + 3] !== 0 && comp[ni] < 0) { comp[ni] = id; q.push(nx, ny); }
            }
        }
        comps.push(size);
    }
    let main = 0;
    for (let i = 1; i < comps.length; i++) if (comps[i] > comps[main]) main = i;
    let flecks = 0;
    for (let i = 0; i < W * H; i++) {
        if (d[i * 4 + 3] !== 0 && comp[i] !== main) { d[i * 4 + 3] = 0; flecks++; }
    }
    ctx.putImageData(im, 0, 0);
    fs.writeFileSync(P, c.toBuffer('image/png'));
    console.log(`lore_stele.png: erased ${erased}px flood + ${speck} speck + ${flecks} fleck px (${comps.length} components, main ${comps[main]})`);
})().catch((e) => { console.error(e); process.exit(1); });
