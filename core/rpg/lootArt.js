'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  LOOT ART — item portraits for the result banners (Task 25, owner 2026-10-23:
//  ".j mine … make it a machine … find some assets like fish assets and animal
//  assets and redo the overlay so that it contains those things").
//
//  • Fish   → Kenney Fish Pack 2.0 sprites (CC0) at core/assets/loot/
//    (trout + koi are CC0 derivatives recoloured at bake time — see CREDITS.md)
//  • Animals → the SAME CC-BY sheets huntPov already slices (core/assets/
//    sprites/, credits there): rabbit pelt → rabbit, venison → doe,
//    boar tusk → boar (tinted), stag antler → stag.
//  • Ores   → the procedural ore icons baked to core/assets/loot/ (10 mine
//    drops), one style for the whole vein ladder.
//
//  artForDrops(drops) → [{ id, qty, img, w, h }] — images pre-cropped to
//  offscreen canvases (crisp pixels for the LPC sheets), ready for
//  drawLootBanner(). Missing files degrade gracefully (item just skips art).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const LOOT_DIR = path.join(__dirname, '..', 'assets', 'loot');
const SPRITE_DIR = path.join(__dirname, '..', 'assets', 'sprites');

const LOOT_FILES = {
    raw_fish: 'fish_pond_minnow.png',
    river_trout: 'fish_river_trout.png',
    silver_carp: 'fish_silver_carp.png',
    crystal_koi: 'fish_crystal_koi.png',
    iron_shard: 'ore_iron_shard.png',
    silver_ore: 'ore_silver_ore.png',
    gold_ore: 'ore_gold_ore.png',
    mythril_ore: 'ore_mythril_ore.png',
    obsidian_chunk: 'ore_obsidian_chunk.png',
    diamond_shard: 'ore_diamond_shard.png',
    fire_shard: 'ore_fire_shard.png',
    mana_crystal: 'ore_mana_crystal.png',
    dark_matter: 'ore_dark_matter.png',
    legendary_shard: 'ore_legendary_shard.png',
};

// hunt drops — crop specs matching huntPov.js SPRITE_ROWS (source faces the
// direction noted; we normalise to face LEFT toward the banner text)
const LOOT_CROPS = {
    rabbit_pelt: { file: 'rabbit_lpc.png', crop: [59, 282, 28, 38], scale: 1.7, flip: false },
    venison: { file: 'deer_female.png', crop: [0, 0, 32, 32], scale: 2.6, flip: true },
    boar_tusk: { file: 'pig_eat.png', crop: [0, 384, 128, 128], scale: 0.72, flip: false, tint: 'boar' },
    stag_antler: { file: 'deer_male.png', crop: [0, 0, 32, 32], scale: 2.6, flip: true },
};

const _fileCache = new Map();     // file → loaded Image | null
const _cropCache = new Map();     // crop key → offscreen canvas | null

function _loadImage(file, dir) {
    const p = path.join(dir, file);
    if (_fileCache.has(p)) return _fileCache.get(p);
    let img = null;
    try {
        const { Image } = require('canvas');
        img = new Image();
        img.src = fs.readFileSync(p);
    } catch (e) { img = null; }
    _fileCache.set(p, img);
    return img;
}

/** boar tint — same per-pixel remap huntPov uses (pink farm pig → boar brown) */
function _tintBoarPixels(c2, w, h) {
    try {
        const d = c2.getImageData(0, 0, w, h), px = d.data;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] === 0) continue;
            const r = px[i], g = px[i + 1], b = px[i + 2];
            if (r > g && g >= b) { px[i] = Math.round(r * 0.40); px[i + 1] = Math.round(g * 0.28); px[i + 2] = Math.round(b * 0.20); }
        }
        c2.putImageData(d, 0, 0);
    } catch (e) { /* tint is cosmetic */ }
}

function _cropImage(spec) {
    const key = JSON.stringify(spec);
    if (_cropCache.has(key)) return _cropCache.get(key);
    let out = null;
    try {
        const src = _loadImage(spec.file, SPRITE_DIR);
        if (src) {
            const { createCanvas } = require('canvas');
            const [sx, sy, sw, sh] = spec.crop;
            const dw = Math.max(1, Math.round(sw * spec.scale)), dh = Math.max(1, Math.round(sh * spec.scale));
            const off = createCanvas(dw, dh), oc = off.getContext('2d');
            oc.imageSmoothingEnabled = false;           // keep LPC pixels crisp
            if (spec.flip) {
                oc.translate(dw, 0); oc.scale(-1, 1);
                oc.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
            } else {
                oc.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
            }
            if (spec.tint === 'boar') _tintBoarPixels(oc, dw, dh);
            out = off;
        }
    } catch (e) { out = null; }
    _cropCache.set(key, out);
    return out;
}

/**
 * artForDrops(drops, max=4) → [{ id, qty, img, w, h }] (insertion order —
 * the banner shows the haul in the order it was rolled).
 */
async function artForDrops(drops = {}, max = 4) {
    const out = [];
    for (const [id, qty] of Object.entries(drops)) {
        if (out.length >= max) break;
        try {
            if (LOOT_FILES[id]) {
                const img = _loadImage(LOOT_FILES[id], LOOT_DIR);
                if (img) out.push({ id, qty, img, w: img.width, h: img.height });
            } else if (LOOT_CROPS[id]) {
                const img = _cropImage(LOOT_CROPS[id]);
                if (img) out.push({ id, qty, img, w: img.width, h: img.height });
            }
        } catch (e) { /* one bad asset never kills the banner */ }
    }
    return out;
}

module.exports = { artForDrops, LOOT_FILES, LOOT_CROPS, LOOT_DIR };
