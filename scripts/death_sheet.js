// QA for enemy death animations: node scripts/death_sheet.js FIRE WATER EARTH VOID ICE DUST [BOSS]
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const REPO = path.join(__dirname, '..'), ult = require(path.join(REPO, 'core/rpg/ultimateFx'));
const OUT = path.join(__dirname, 'render_out', 'death_sheet'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
    const args = process.argv.slice(2).map((a) => a.toUpperCase()), boss = args.includes('BOSS');
    for (const kind of args.filter((a) => a !== 'BOSS')) {
        const st = require(path.join(REPO, 'core/rpg/vfxPreviewStage'))(1);
        st.cuts = st.cuts.filter((c) => !(c.side === 'enemy' && c.index === 0));
        const t0 = Date.now();
        const v = await ult.renderUltimateVideo({ classId: 'DEATH_' + kind + (boss ? '_BOSS' : ''), name: '', side: 'enemy', palette: ['#ffffff', '#ffcb45', '#e85a37'], skillLevel: 1, maxLevel: 1, intensity: 0, layers: st, casterIndex: 0, targetIndex: 0, focusIndex: 0, targetSide: 'enemy', aoe: false, targets: [], death: true });
        const ms = Date.now() - t0;
        if (!v || !v.mp4) { console.log(kind, 'NO VIDEO'); continue; }
        const f = path.join(OUT, `${kind}${boss ? '_BOSS' : ''}`); fs.writeFileSync(f + '.mp4', v.mp4);
        execSync(`ffmpeg -y -loglevel error -i ${f}.mp4 -vf "fps=6,scale=320:-1,tile=6x4" -frames:v 1 ${f}.png`);
        console.log(kind, 'ok', ms + 'ms', fs.statSync(f + '.mp4').size + 'B');
    }
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
