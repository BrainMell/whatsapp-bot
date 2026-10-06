// Measure the ruins plates: floor spans per row (center-anchored warm-hue run),
// floor top line, torch flame clusters. Outputs JSON + mask overlay PNGs so the
// geometry can be visually verified before baking variants into pixels.
// Usage: node scripts/measure_plates.js
'use strict';
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

const DIR = path.join(__dirname, '..', 'core', 'rpgasset', 'guildwar', 'ruins');
const OUT = '/home/z/my-project/download/gw_variant_geom';
fs.mkdirSync(OUT, { recursive: true });

function hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) {
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6; if (h < 0) h += 1;
    }
    return { h, s: mx === 0 ? 0 : d / mx, v: mx };
}
// warm floor-brick hue: red→orange→brown, decent saturation
function isWarm(px, i) {
    const { h, s, v } = hsv(px[i], px[i + 1], px[i + 2]);
    return h >= 0.005 && h <= 0.135 && s >= 0.14 && v >= 0.12;
}

function measure(img, name) {
    const W = img.width, H = img.height;
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, W, H).data;

    const at = (x, y) => (y * W + x) * 4;
    const warm = (x, y) => x >= 0 && x < W && y >= 0 && y < H && isWarm(px, at(x, y));

    // center-anchored contiguous run with small gap tolerance (mortar/moss seams)
    const spans = [];
    let floorTop = -1;
    for (let y = 150; y < H; y++) {
        if (!warm(600, y)) { spans.push(null); continue; }
        const gapMax = 7;
        let x0 = 600, x1 = 600, gapL = 0, gapR = 0;
        while (x0 > 0 && gapL <= gapMax) { x0--; if (warm(x0, y)) gapL = 0; else gapL++; }
        x0 += gapL; // back to last warm
        while (x1 < W - 1 && gapR <= gapMax) { x1++; if (warm(x1, y)) gapR = 0; else gapR++; }
        x1 -= gapR;
        const wSpan = x1 - x0 + 1;
        spans.push(wSpan > 90 ? [x0, x1] : null);
        if (floorTop < 0 && wSpan > 120 && y > 200) floorTop = y;
    }
    // torch flames: bright warm clusters in upper half
    const torch = [];
    for (let y = 40; y < 520; y += 2) {
        for (let x = 20; x < W - 20; x += 2) {
            const i = at(x, y);
            const { h, s, v } = hsv(px[i], px[i + 1], px[i + 2]);
            if (h >= 0.06 && h <= 0.13 && s > 0.55 && v > 0.78) torch.push([x, y]);
        }
    }
    // cluster torch points (greedy merge within 60px)
    const flames = [];
    for (const [x, y] of torch) {
        let hit = flames.find((f) => Math.hypot(f.x - x, f.y - y) < 70);
        if (!hit) { hit = { x: 0, y: 0, n: 0 }; flames.push(hit); }
        hit.x += x; hit.y += y; hit.n++;
    }
    for (const f of flames) { f.x = Math.round(f.x / f.n); f.y = Math.round(f.y / f.n); }

    // mask overlay for visual verification
    const mc = createCanvas(W, H);
    const mctx = mc.getContext('2d');
    mctx.drawImage(img, 0, 0);
    const md = mctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) {
        const s = spans[y];
        if (!s) continue;
        for (let x = s[0]; x <= s[1]; x++) {
            const i = (y * W + x) * 4;
            md.data[i] = Math.min(255, md.data[i] * 0.55 + 110);   // red wash on floor
            md.data[i + 1] = md.data[i + 1] * 0.55;
            md.data[i + 2] = md.data[i + 2] * 0.55;
        }
    }
    for (const f of flames) {
        mctx.strokeStyle = '#00e5ff'; mctx.lineWidth = 2;
        mctx.strokeRect(f.x - 16, f.y - 16, 32, 32);
    }
    if (floorTop > 0) { mctx.strokeStyle = '#00ff88'; mctx.beginPath(); mctx.moveTo(0, floorTop); mctx.lineTo(W, floorTop); mctx.stroke(); }
    mctx.putImageData(md, 0, 0);
    // flames+line drawn after putImageData would be wiped — draw markers on a second pass
    mctx.putImageData(md, 0, 0);
    for (const f of flames) { mctx.strokeStyle = '#00e5ff'; mctx.lineWidth = 2; mctx.strokeRect(f.x - 16, f.y - 16, 32, 32); }
    if (floorTop > 0) { mctx.strokeStyle = '#00ff88'; mctx.beginPath(); mctx.moveTo(0, floorTop); mctx.lineTo(W, floorTop); mctx.stroke(); }

    const outPng = path.join(OUT, `mask_${name}.png`);
    fs.writeFileSync(outPng, mc.toBuffer('image/png'));
    // compact spans: sample every 12 rows
    const compact = {};
    for (let y = 0; y < H; y += 12) if (spans[y]) compact[y] = spans[y];
    return { name, W, H, floorTop, flames, spansCompact: compact };
}

(async () => {
    const results = [];
    for (const f of ['ruins_door_LFR.png', 'ruins_door_F.png', 'ruins_door_0.png', 'ruins_door_LR.png']) {
        const img = await loadImage(path.join(DIR, f));
        results.push(measure(img, f.replace('ruins_door_', '').replace('.png', '')));
        console.log('measured', f);
    }
    fs.writeFileSync(path.join(OUT, 'plate_geom.json'), JSON.stringify(results, null, 1));
    console.log('floorTops:', results.map((r) => `${r.name}:${r.floorTop}`));
    console.log('flames:', JSON.stringify(results[0].flames));
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
