// Death stills visual QA: node scripts/qa_death_still.js [outDir]  -> one JPEG per kind (+boss) and a group still
const { createCanvas, loadImage } = require('canvas'); const fs = require('fs'); const path = require('path');
const A = path.join(__dirname, '..', 'core', 'rpgasset'); const out = process.argv[2] || '/tmp/death_stills'; fs.mkdirSync(out, { recursive: true });
const ds = require('../core/rpg/systems/combat/deathStillClaude');
async function cutOf(file, x, feet, h, idx) {
  const im = await loadImage(path.join(A, 'characters', file)); const w = Math.round(im.width * h / im.height);
  const c = createCanvas(w, h); c.getContext('2d').drawImage(im, 0, 0, w, h);
  return { cut: { side: 'enemy', index: idx, x: x - w / 2, y: feet - h, w, h, png: c.toBuffer('image/png').toString('base64') }, anchor: { side: 'enemy', index: idx, x, feetY: feet, w, h } };
}
(async () => {
  const bg = createCanvas(1024, 687), g = bg.getContext('2d'); g.drawImage(await loadImage(path.join(A, 'backgrounds', 'background1.png')), 0, 0, 1024, 687);
  const sprites = fs.readdirSync(path.join(A, 'characters')).filter((f) => /\.png$/.test(f));
  const pick = (n) => sprites[n % sprites.length];
  let n = 0; const t0 = Date.now();
  for (const kind of ds.KINDS) for (const boss of [false, true]) {
    const e = await cutOf(pick(n * 7 + 3), 720, 540, boss ? 300 : 210, 0), f = await cutOf(pick(n * 5 + 1), 880, 560, 170, 1);
    const layers = { w: 1024, h: 687, bg: bg.toBuffer('image/png'), cuts: [e.cut, f.cut], anchors: [e.anchor, f.anchor] };
    const buf = await ds.renderDeathStill({ layers, dying: [{ index: 0, kind, boss }], deadIdx: new Set() });
    fs.writeFileSync(path.join(out, kind + (boss ? '_boss' : '') + '.jpg'), buf); n++;
  }
  const e0 = await cutOf(pick(2), 560, 540, 200, 0), e1 = await cutOf(pick(9), 760, 550, 200, 1), e2 = await cutOf(pick(4), 900, 540, 190, 2);
  const L = { w: 1024, h: 687, bg: bg.toBuffer('image/png'), cuts: [e0.cut, e1.cut, e2.cut], anchors: [e0.anchor, e1.anchor, e2.anchor] };
  fs.writeFileSync(path.join(out, 'group.jpg'), await ds.renderDeathStill({ layers: L, dying: [{ index: 0, kind: 'FIRE' }, { index: 1, kind: 'ICE' }], deadIdx: new Set([2]) }));
  console.log('rendered', n + 1, 'stills in', Date.now() - t0, 'ms ->', out); process.exit(0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
