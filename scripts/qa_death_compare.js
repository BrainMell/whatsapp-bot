// Side-by-side: agent's deathStill (effects-only stamp) vs Claude's deathStillClaude (fragmenting sprite)
// node scripts/qa_death_compare.js [outDir]
const { createCanvas, loadImage } = require('canvas'); const fs = require('fs'); const path = require('path');
const A = path.join(__dirname, '..', 'core', 'rpgasset'); const out = process.argv[2] || '/tmp/death_compare'; fs.mkdirSync(out, { recursive: true });
const theirs = require('../core/rpg/systems/combat/deathStill'); const mine = require('../core/rpg/systems/combat/deathStillClaude');
const NAME = { FIRE: 'Fire Drake', ICE: 'Frost Giant', WATER: 'Tide Kraken', EARTH: 'Stone Golem', VOID: 'Void Wraith', DUST: 'Goblin' };
const ENEMY_IMG = { FIRE: 'DoomSlayer1.png', ICE: 'Monk.png', WATER: 'Rogue (1).png', EARTH: 'Berserker2.png', VOID: 'Nightblade (2).png', DUST: 'Fighter1.png' };
async function cutOf(file, x, feet, h, idx) {
  const im = await loadImage(path.join(A, 'characters', file)); const w = Math.round(im.width * h / im.height);
  const c = createCanvas(w, h); c.getContext('2d').drawImage(im, 0, 0, w, h);
  return { cut: { side: 'enemy', index: idx, x: x - w / 2, y: feet - h, w, h, png: c.toBuffer('image/png').toString('base64') }, anchor: { side: 'enemy', index: idx, x, feetY: feet, w, h } };
}
(async () => {
  const bg = createCanvas(1024, 687); bg.getContext('2d').drawImage(await loadImage(path.join(A, 'backgrounds', 'background1.png')), 0, 0, 1024, 687);
  const kinds = Object.keys(NAME); const cells = [];
  for (const kind of kinds) for (const boss of [false, true]) {
    const e = await cutOf(ENEMY_IMG[kind], 720, 540, boss ? 300 : 210, 0), f = await cutOf('Paladin (1).png', 860, 570, 170, 1);
    const layers = { w: 1024, h: 687, bg: bg.toBuffer('image/png'), cuts: [e.cut, f.cut], anchors: [e.anchor, f.anchor] };
    const enemy = { name: NAME[kind], id: kind, element: kind === 'DUST' ? undefined : kind, isBoss: boss };
    const t = await theirs.renderDeathStill({ layers, picks: [{ enemy, targetIndex: 0 }], deadIdx: new Set() });
    const m = await mine.renderDeathStill({ layers, dying: [{ index: 0, kind, boss }], deadIdx: new Set() });
    cells.push({ label: kind + (boss ? ' BOSS' : ''), a: t && t.image, b: m });
  }
  const CW = 480, CH = 322, cols = 2, rows = cells.length;
  const sheet = createCanvas(CW * 2 + 40, rows * (CH + 28) + 40), g = sheet.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, sheet.width, sheet.height); g.font = 'bold 16px sans-serif'; g.fillStyle = '#fff';
  g.fillText("AGENT'S (effects-only stamp)", 10, 22); g.fillText('CLAUDE (fragmenting sprite)', CW + 30, 22);
  for (let i = 0; i < cells.length; i++) {
    const y = 34 + i * (CH + 28); g.fillStyle = '#ffd34d'; g.fillText(cells[i].label, 10, y + 14);
    if (cells[i].a) g.drawImage(await loadImage(cells[i].a), 10, y + 20, CW, CH);
    if (cells[i].b) g.drawImage(await loadImage(cells[i].b), CW + 30, y + 20, CW, CH);
  }
  fs.writeFileSync(path.join(out, 'sheet.jpg'), sheet.toBuffer('image/jpeg', { quality: 0.9 }));
  // per-kind full-res pairs too
  console.log('ok', out); process.exit(0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
