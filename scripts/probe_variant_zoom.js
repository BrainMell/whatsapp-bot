// Pixel-zoom crops for the variant QA (nearest-neighbour 2.5x) — verify the
// treatments hug the art: arch edges, walkway strip, bone/crystal clusters,
// rune ring edge. Usage: node scripts/probe_variant_zoom.js
'use strict';
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

const SRC = '/home/z/my-project/download/gw_variants_v3';
const OUT = '/home/z/my-project/download/gw_variants_zoom';
fs.mkdirSync(OUT, { recursive: true });

const CROPS = [
    { f: 'after_mossy.png', name: 'mossy_Narch', x: 440, y: 200, w: 340, h: 260 },   // arch mouth + walkway + moss edge
    { f: 'after_skulls.png', name: 'skulls_cluster', x: 120, y: 480, w: 300, h: 220 }, // bone cluster zoom
    { f: 'after_skulls.png', name: 'skulls_ribcage', x: 640, y: 460, w: 300, h: 200 },
    { f: 'after_crystal.png', name: 'crystal_cluster', x: 84, y: 500, w: 300, h: 220 },
    { f: 'after_skill.png', name: 'skill_ring', x: 380, y: 520, w: 440, h: 220 },
    { f: 'after_overgrown.png', name: 'overgrown_vines', x: 60, y: 0, w: 520, h: 240 },
    { f: 'after_flooded.png', name: 'flooded_walkway', x: 460, y: 220, w: 340, h: 240 },
    { f: 'after_emberfall.png', name: 'ember_mortar', x: 420, y: 560, w: 400, h: 240 },
];

(async () => {
    for (const c of CROPS) {
        const img = await loadImage(path.join(SRC, c.f));
        const cv = createCanvas(c.w * 2.5, c.h * 2.5);
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = false;               // nearest-neighbour
        ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, c.w * 2.5, c.h * 2.5);
        const f = path.join(OUT, `zoom_${c.name}.png`);
        fs.writeFileSync(f, cv.toBuffer('image/png'));
        console.log('wrote', f);
    }
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
