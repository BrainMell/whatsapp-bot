#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// gw_chest_body_fill.js — the chest sprites were shipped as WIREFRAMES: gold
// bars with a fully transparent body (alpha 0 between the frame members), so
// in the scene the floor shows straight through the chest box — a gold cage,
// not a chest (owner 2026-10-06 "items floating / pasted" complaint cluster).
//
// Fix: paint an opaque aged-wood interior BEHIND the existing pixels (only
// alpha<128 px are touched — frame, lock, coins, cavity box all preserved):
//   cache_chest.png         dome rows 3-86   (fill between outermost rim px)
//                           body rows 87-192 (side 13-66 / post 67-89 / front 90-197)
//   cache_chest_open.png    body rows 102-196 (cavity box already opaque)
//   cache_chest_empty.png   body rows 102-196
// + generic pass: small ENCLOSED transparent holes (trim gaps) filled dark.
// Deterministic (seeded rng) so re-runs are byte-stable. Git restores originals.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

const DIR = path.join(__dirname, '..', 'core', 'rpgasset', 'guildwar', 'ruins', 'props');

// seeded rng (mulberry32) — deterministic texture jitter
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// vertical wood gradient + plank seams + per-pixel jitter
function woodColor(yTop, yBot, y, x, top, bot, rand) {
    const t = Math.max(0, Math.min(1, (y - yTop) / Math.max(1, yBot - yTop)));
    let r = top[0] + (bot[0] - top[0]) * t;
    let g = top[1] + (bot[1] - top[1]) * t;
    let b = top[2] + (bot[2] - top[2]) * t;
    const j = (rand() - 0.5) * 14;                       // hand-pixelled jitter
    r += j; g += j * 0.8; b += j * 0.6;
    return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b)), 255];
}

async function patch(file, plan, seed) {
    const p = path.join(DIR, file);
    const img = await loadImage(p);
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, img.width, img.height);
    const d = im.data;
    const W = img.width, H = img.height;
    const A = (x, y) => d[(y * W + x) * 4 + 3];
    let painted = 0;

    // 1) generic: fill small ENCLOSED transparent holes (trim gaps) dark
    const outside = new Uint8Array(W * H);
    const st = [];
    for (let x = 0; x < W; x++) { if (A(x, 0) < 128) st.push(x, 0); if (A(x, H - 1) < 128) st.push(x, H - 1); }
    for (let y = 0; y < H; y++) { if (A(0, y) < 128) st.push(0, y); if (A(W - 1, y) < 128) st.push(W - 1, y); }
    while (st.length) {
        const y = st.pop(), x = st.pop();
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (outside[i] || A(x, y) >= 128) continue;
        outside[i] = 1;
        st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    const holeSeen = new Uint8Array(W * H);
    for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
        const i0 = y0 * W + x0;
        if (A(x0, y0) >= 128 || outside[i0] || holeSeen[i0]) continue;
        // collect component
        const comp = [];
        const q = [x0, y0]; holeSeen[i0] = 1;
        while (q.length) {
            const y = q.pop(), x = q.pop();
            comp.push([x, y]);
            for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const ni = ny * W + nx;
                if (!holeSeen[ni] && A(nx, ny) < 128 && !outside[ni]) { holeSeen[ni] = 1; q.push(nx, ny); }
            }
        }
        if (comp.length < 6 || comp.length > 400) continue;  // only small trim gaps
        const rand = rng(seed + comp.length);
        for (const [x, y] of comp) {
            const i = (y * W + x) * 4;
            const col = woodColor(0, H, y, x, [21, 13, 7], [12, 8, 4], rand);
            d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
            painted++;
        }
    }

    // 2) planned face fills — only alpha<128 px inside the face boxes
    const rand = rng(seed);
    for (const face of plan.faces || []) {
        const { x0, x1, y0, y1, top, bot, seamEvery = 21, rimRule = false } = face;
        for (let y = y0; y <= y1; y++) {
            let lo = x0, hi = x1;
            if (rimRule) {
                // dome rule: fill strictly between the OUTERMOST opaque px of the row
                let min = -1, max = -1;
                for (let x = x0; x <= x1; x++) if (A(x, y) >= 128) { if (min < 0) min = x; max = x; }
                if (min < 0 || max - min < 20) continue;      // empty/fragmented row → skip
                lo = min + 1; hi = max - 1;
            }
            const seam = seamEvery && ((y - y0) % seamEvery === seamEvery - 1);
            for (let x = lo; x <= hi; x++) {
                const i = (y * W + x) * 4;
                if (d[i + 3] >= 128) continue;                 // never paint over existing pixels
                const col = seam ? [10, 6, 3, 255] : woodColor(y0, y1, y, x, top, bot, rand);
                d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
                painted++;
            }
        }
    }

    ctx.putImageData(im, 0, 0);
    fs.writeFileSync(p, c.toBuffer('image/png'));
    console.log(`${file}: painted ${painted} px`);
}

// face palettes: aged dark wood — front catches a little more light than the side
const FRONT_TOP = [46, 32, 18], FRONT_BOT = [26, 17, 10];
const SIDE_TOP = [30, 20, 12], SIDE_BOT = [16, 10, 6];
const POST_TOP = [34, 24, 14], POST_BOT = [18, 12, 7];

(async () => {
    await patch('cache_chest.png', {
        faces: [
            { x0: 4, x1: 216, y0: 3, y1: 86, top: [40, 28, 16], bot: [30, 20, 12], rimRule: true, seamEvery: 0 }, // dome (lighter — lid catches torchlight)
            { x0: 13, x1: 66, y0: 87, y1: 192, top: SIDE_TOP, bot: SIDE_BOT },                                     // left side face
            { x0: 67, x1: 89, y0: 87, y1: 196, top: POST_TOP, bot: POST_BOT },                                     // front-left post gaps
            { x0: 90, x1: 197, y0: 87, y1: 192, top: FRONT_TOP, bot: FRONT_BOT },                                  // front face
        ],
    }, 0xA71C45);
    await patch('cache_chest_open.png', {
        faces: [
            { x0: 13, x1: 66, y0: 102, y1: 190, top: SIDE_TOP, bot: SIDE_BOT },
            { x0: 67, x1: 89, y0: 96, y1: 200, top: POST_TOP, bot: POST_BOT },
            { x0: 90, x1: 197, y0: 102, y1: 196, top: FRONT_TOP, bot: FRONT_BOT },
        ],
    }, 0xB33F91);
    await patch('cache_chest_empty.png', {
        faces: [
            { x0: 13, x1: 66, y0: 102, y1: 190, top: SIDE_TOP, bot: SIDE_BOT },
            { x0: 67, x1: 89, y0: 96, y1: 200, top: POST_TOP, bot: POST_BOT },
            { x0: 90, x1: 197, y0: 102, y1: 196, top: FRONT_TOP, bot: FRONT_BOT },
        ],
    }, 0xC7D22E);
    console.log('chest body fill complete');
})().catch((e) => { console.error(e); process.exit(1); });
