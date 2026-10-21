#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  BAKE THE POND GIRL — run ONCE; the output is COMMITTED to the repo.
//  (owner Task 21: "I want this generated once and saved on the server, or in
//  the repo permanently, as a usable asset and an overlay like the others.")
//
//  Bakes the day-lit girl-angling master for each pond level (L1/L2/L3 —
//  L2 adds the rowboat, L3 the gold edge trim) as 16-frame PNG containers,
//  writes them to core/assets/scenes/pond_girl_l{1,2,3}_v1.bin and drops a
//  contact-sheet preview PNG next to them for eyeball QA. Deterministic:
//  re-running produces byte-identical assets.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const dockPov = require('../core/rpg/dockPov');

(async () => {
    const { createCanvas } = require('canvas');
    const outDir = path.join(__dirname, '..', 'core', 'assets', 'scenes');
    fs.mkdirSync(outDir, { recursive: true });
    for (const lvl of [1, 2, 3]) {
        const buf = dockPov.bakeLevelFrames(lvl);
        const file = path.join(outDir, `pond_girl_l${lvl}_${dockPov.ASSET_VER}.bin`);
        fs.writeFileSync(file, buf);
        const c = dockPov.unpackContainer(buf);
        if (!c || c.pngs.length !== dockPov.FRAMES) throw new Error(`bake L${lvl}: container broken`);
        // contact sheet: 4×4 of the 16 frames, downscaled 50%
        const tw = c.gw / 2, th = c.gh / 2;
        const sheet = createCanvas(tw * 4, th * 4), s2 = sheet.getContext('2d');
        const imgs = [];
        for (const p of c.pngs) { const { Image } = require('canvas'); const im = new Image(); im.src = p; imgs.push(im); }
        for (let i = 0; i < imgs.length; i++) {
            s2.drawImage(imgs[i], (i % 4) * tw, Math.floor(i / 4) * th, tw, th);
        }
        fs.writeFileSync(path.join(outDir, `pond_girl_l${lvl}_preview.png`), sheet.toBuffer('image/png'));
        console.log(`L${lvl}: ${c.pngs.length} frames, container ${(buf.length / 1024).toFixed(0)}KB -> ${path.basename(file)}`);
    }
    console.log('BAKE OK — assets ready to commit');
})().catch((e) => { console.error('BAKE FAILED:', e); process.exit(1); });
