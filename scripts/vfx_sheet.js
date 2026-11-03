// Contact-sheet QA for ultimate animations. Renders each class through the REAL pipeline (same stage as `.j mod vfx`)
// and tiles frames so a swapped asset can be judged without sending videos.
//   node scripts/vfx_sheet.js DRAGON_GOD MAGE FIGHTER        -> scripts/render_out/vfx_sheet/<CLASS>.png
//   env VFX_FPS=4 (frames per second sampled)  VFX_LEVEL=3 (skill level, 1-5)
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const REPO = path.join(__dirname, '..');
const ult = require(path.join(REPO, 'core/rpg/ultimateFx'));
const sv = require(path.join(REPO, 'core/rpg/skillVfx'));
const OUT = path.join(__dirname, 'render_out', 'vfx_sheet');
fs.mkdirSync(OUT, { recursive: true });
const fps = Number(process.env.VFX_FPS) || 4, lv = Number(process.env.VFX_LEVEL) || 3;
(async () => {
    const stage = require(path.join(REPO, 'core/rpg/vfxPreviewStage'))(1);
    for (const cls of process.argv.slice(2).map((c) => c.toUpperCase())) {
        const v = await ult.renderUltimateVideo({ classId: cls, name: cls, side: 'player', palette: sv.PALETTE[cls], skillLevel: lv, maxLevel: 5, intensity: (lv - 1) / 4, layers: stage, casterIndex: 0, targetIndex: 0, focusIndex: 0, targetSide: 'enemy', aoe: false, targets: [{ index: 0, hp: 800, maxHp: 1000 }] });
        if (!v || !v.mp4) { console.log(cls, 'NO VIDEO'); continue; }
        const mp4 = path.join(OUT, `${cls}.mp4`); fs.writeFileSync(mp4, v.mp4);
        execSync(`ffmpeg -y -loglevel error -i ${mp4} -vf "fps=${fps},scale=320:-1,tile=6x5" -frames:v 1 ${path.join(OUT, cls + '.png')}`);
        console.log(cls, 'ok ->', path.join(OUT, cls + '.png'));
    }
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
