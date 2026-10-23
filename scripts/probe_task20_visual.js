'use strict';
// visual probes - render labeled PNGs of the exact GIF frames for
// human (well, agent) inspection: float bob cycle, bite dip, rabbit/boar/stag
// overlays, sheet, viewer stills.
process.env.QA_MODE = '1';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'render_out', 'task20_probes');
fs.mkdirSync(OUT, { recursive: true });
const { createCanvas } = require(path.join(ROOT, 'node_modules', 'canvas'));
const dpv = require(path.join(ROOT, 'core/rpg/dockPov'));
const hpv = require(path.join(ROOT, 'core/rpg/huntPov'));

(async () => {
 // -- fishing float: bob cycle + bite dip --
    for (const [tag, t] of [['bobTop_t0.00', 0.0], ['bobMid_t0.25', 0.25], ['bobBot_t0.50', 0.5], ['bobMid2_t0.75', 0.75]]) {
        const cv = createCanvas(dpv.GW, dpv.GH), c = cv.getContext('2d');
        dpv.paintFrame(c, dpv.GW, dpv.GH, t, { biome: 'isle', lvl: 2 });
 // zoomed crop of the float area for detail
        const g = dpv.floatGeom(dpv.GW, dpv.GH);
        const crop = createCanvas(140, 110), cc = crop.getContext('2d');
        cc.imageSmoothingEnabled = false;
        cc.drawImage(cv, g.bx - 70, g.wlY - 55, 140, 110, 0, 0, 280, 220);
        fs.writeFileSync(path.join(OUT, `float_${tag}.png`), crop.toBuffer('image/png'));
    }
 // bite peak from the composed GIF pipeline (low band)
    const base = await dpv.getBaseFrames({ biome: 'isle', lvl: 2 });
    const P = dpv.PALETTES.isle;
    for (const t of [0.5, 0.83]) {
        const cv = createCanvas(dpv.GW, dpv.GH), c = cv.getContext('2d');
        c.drawImage(base.imgs[Math.round(t * 16) % 16], 0, 0);
        dpv.paintCatchOverlay(c, dpv.GW, dpv.GH, t, 'low', null, P);
        const g = dpv.floatGeom(dpv.GW, dpv.GH);
        const crop = createCanvas(140, 110), cc = crop.getContext('2d');
        cc.imageSmoothingEnabled = false;
        cc.drawImage(cv, g.bx - 70, g.wlY - 55, 140, 110, 0, 0, 280, 220);
        fs.writeFileSync(path.join(OUT, `float_bite_t${t}.png`), crop.toBuffer('image/png'));
    }

 // -- hunt: full frames at the choreography beats --
    const sheet = await hpv.getHuntSpriteSheet();
    const hb = await hpv.getHuntBaseFrames({ biome: 'isle', lvl: 2 });
    const beats = [['rabbitHop_t0.30', 0.30, 'low'], ['rabbitLand_t0.42', 0.42, 'low'], ['boar_trot_t0.45', 0.45, 'mid'], ['boar_near_t0.70', 0.70, 'mid'], ['stagWalkIn_t0.40', 0.40, 'epic'], ['stagAlertGlint_t0.66', 0.66, 'epic'], ['stagBound_t0.88', 0.88, 'epic']];
    for (const [tag, t, band] of beats) {
        const cv = createCanvas(hpv.GW, hpv.GH), c = cv.getContext('2d');
        c.drawImage(hb.imgs[Math.round(t * 16) % 16], 0, 0);
        hpv.paintHuntOverlay(c, hpv.GW, hpv.GH, t, band, sheet);
        fs.writeFileSync(path.join(OUT, `hunt_${tag}.png`), cv.toBuffer('image/png'));
    }
 // tundra + volcanic full frames for biome variety
    const hbT = await hpv.getHuntBaseFrames({ biome: 'tundra', lvl: 3 });
    const cvT = createCanvas(hpv.GW, hpv.GH), cT = cvT.getContext('2d');
    cT.drawImage(hbT.imgs[8], 0, 0); hpv.paintHuntOverlay(cT, hpv.GW, hpv.GH, 0.66, 'epic', sheet);
    fs.writeFileSync(path.join(OUT, 'hunt_tundra_L3_stag.png'), cvT.toBuffer('image/png'));

 // sprite sheet itself, upscaled 2× for inspection
    const z = createCanvas(sheet.width * 2, sheet.height * 2), zc = z.getContext('2d');
    zc.imageSmoothingEnabled = false; zc.drawImage(sheet, 0, 0, z.width, z.height);
    fs.writeFileSync(path.join(OUT, 'sheet_2x.png'), z.toBuffer('image/png'));

    console.log('probes written →', OUT);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
