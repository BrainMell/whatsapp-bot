#!/usr/bin/env node
// audit chest sprites: find ENCLOSED transparent regions (holes that show
// the floor through the chest body) — report bbox + area per sprite
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const DIR = path.join(__dirname, '..', 'core', 'rpgasset', 'guildwar', 'ruins', 'props');

async function audit(file) {
    const img = await loadImage(path.join(DIR, file));
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    const W = img.width, H = img.height;
    const alpha = (x, y) => d[(y * W + x) * 4 + 3];
    // flood fill from all border transparent pixels → outside
    const outside = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) { if (alpha(x, 0) < 128) stack.push([x, 0]); if (alpha(x, H - 1) < 128) stack.push([x, H - 1]); }
    for (let y = 0; y < H; y++) { if (alpha(0, y) < 128) stack.push([0, y]); if (alpha(W - 1, y) < 128) stack.push([W - 1, y]); }
    while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (outside[i] || alpha(x, y) >= 128) continue;
        outside[i] = 1;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    // remaining transparent pixels = enclosed holes → connected components
    const seen = new Uint8Array(W * H);
    const holes = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (alpha(x, y) >= 128 || outside[i] || seen[i]) continue;
        let area = 0, minX = x, maxX = x, minY = y, maxY = y;
        const st = [[x, y]];
        seen[i] = 1;
        while (st.length) {
            const [px, py] = st.pop();
            area++;
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
            for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const ni = ny * W + nx;
                if (!seen[ni] && alpha(nx, ny) < 128 && !outside[ni]) { seen[ni] = 1; st.push([nx, ny]); }
            }
        }
        if (area >= 12) holes.push({ area, bbox: [minX, minY, maxX, maxY], w: maxX - minX + 1, h: maxY - minY + 1 });
    }
    holes.sort((a, b) => b.area - a.area);
    console.log(`${file}: ${W}x${H}, ${holes.length} enclosed hole(s)`);
    for (const h of holes.slice(0, 6)) console.log(`   area=${h.area} bbox=${h.bbox} (${h.w}x${h.h})`);
}

(async () => {
    for (const f of ['cache_chest.png', 'cache_chest_open.png', 'cache_chest_empty.png', 'secret_relic.png', 'secret_pedestal_empty.png', 'hazard_spikes.png', 'puzzle_rune.png', 'lore_stele.png', 'cache_rubble.png', 'cache_coins.png', 'cache_dug.png', 'anomaly_rift.png', 'landmark_obelisk.png']) {
        try { await audit(f); } catch (e) { console.log(`${f}: ERR ${e.message}`); }
    }
})();
