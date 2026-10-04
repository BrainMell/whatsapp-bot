// ============================================
// 🖼️ RUINS ASSET PREP — Guild War presentation overhaul 2026-10-04
// Normalizes the owner-provided Ruins environment photos into the bot's
// asset tree and DERIVES the missing doorway variants:
//   • mirror flips for right-side-only and forward+right combos
//   • a left+right (no forward) composite built by patching the center
//     arch of the LFR plate with the plain wall of the 0-door plate
// Backgrounds are the owner's own art — the room renderer must ONLY use
// these for The Ruins (owner spec §8: do not invent an unrelated style).
// Run: node scripts/prep_ruins_assets.js <uploadDir>
// ============================================

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const OUT_DIR = path.join(__dirname, '..', 'core', 'rpgasset', 'guildwar', 'ruins');
const TARGET_W = 1200, TARGET_H = 900; // 4:3 landscape — WhatsApp-friendly, room for UI strips

// source plates: [uploadPrefix, outName]
const PLATES = [
    ['photo_1', 'ruins_door_L_a.png'],  // left arch only (ambient variant a)
    ['photo_2', 'ruins_door_L_b.png'],  // left arch only (ambient variant b)
    ['photo_3', 'ruins_door_0.png'],    // sealed room — no arches
    ['photo_4', 'ruins_door_F.png'],    // forward (back-wall) arch only
    ['photo_5', 'ruins_door_LF.png'],   // left + forward
    ['photo_6', 'ruins_door_LFR.png'],  // left + forward + right
];

// center-arch strip geometry (in 1200x900 space) — covers the back-wall
// opening between the two upper torches; used for the LR composite patch.
const CENTER_PATCH = { x: 492, y: 66, w: 216, h: 268 };

function normalize(img) {
    // cover-crop to TARGET_WxH (source plates are 1280x956 / 1200x896 —
    // both ≈4:3, so the crop trims a hair off one axis at most)
    const c = createCanvas(TARGET_W, TARGET_H);
    const ctx = c.getContext('2d');
    const scale = Math.max(TARGET_W / img.width, TARGET_H / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (TARGET_W - dw) / 2, (TARGET_H - dh) / 2, dw, dh);
    return c;
}

function mirrorOf(canvas) {
    const c = createCanvas(canvas.width, canvas.height);
    const ctx = c.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, 0, 0);
    return c;
}

async function main() {
    const uploadDir = process.argv[2] || '/home/z/my-project/upload';
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const normalized = {};
    for (const [prefix, outName] of PLATES) {
        const src = fs.readdirSync(uploadDir).find((f) => f.startsWith(prefix));
        if (!src) throw new Error(`missing upload ${prefix}* in ${uploadDir}`);
        const img = await loadImage(path.join(uploadDir, src));
        const c = normalize(img);
        const key = outName.replace('ruins_door_', '').replace('.png', '');
        normalized[key] = c;
        fs.writeFileSync(path.join(OUT_DIR, outName), c.toBuffer('image/png'));
        console.log(`✓ ${outName}  ← ${src}`);
    }

    // ── derived: mirror flips (right-hand variants the owner's set lacks) ──
    const deriv = [
        ['R', mirrorOf(normalized.L_a)],   // right arch only
        ['FR', mirrorOf(normalized.LF)],   // forward + right
    ];
    for (const [key, c] of deriv) {
        const name = `ruins_door_${key}.png`;
        fs.writeFileSync(path.join(OUT_DIR, name), c.toBuffer('image/png'));
        console.log(`✓ ${name}  (derived: mirrored)`);
    }

    // ── derived: LR (left + right, NO forward) — patch the center arch of
    // the LFR plate with the plain center wall from the sealed plate. Both
    // plates share the same wall texture layout, so a straight region copy
    // blends; verified visually after render.
    const lr = createCanvas(TARGET_W, TARGET_H);
    const lctx = lr.getContext('2d');
    lctx.drawImage(normalized.LFR, 0, 0);
    lctx.drawImage(
        normalized['0'],
        CENTER_PATCH.x, CENTER_PATCH.y, CENTER_PATCH.w, CENTER_PATCH.h,
        CENTER_PATCH.x, CENTER_PATCH.y, CENTER_PATCH.w, CENTER_PATCH.h
    );
    fs.writeFileSync(path.join(OUT_DIR, 'ruins_door_LR.png'), lr.toBuffer('image/png'));
    console.log('✓ ruins_door_LR.png  (derived: center arch patched)');

    // ── derived: LFS? not needed — S (behind the player) never draws an arch.
    console.log(`\nDone. ${fs.readdirSync(OUT_DIR).length} plates in ${OUT_DIR}`);
}

main().catch((e) => { console.error('prep failed:', e); process.exit(1); });
