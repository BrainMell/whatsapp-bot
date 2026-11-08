// Death clip opens on the REAL basic-attack animation: node scripts/qa_death_strike.js -> /tmp/death_strike.mp4
const { createCanvas, loadImage } = require('canvas'); const fs = require('fs'); const path = require('path');
const A = path.join(__dirname, '..', 'core', 'rpgasset');
const o = require('../core/rpg/systems/combat/deathOverlay');
(async () => {
  const bg = createCanvas(1024, 687), g = bg.getContext('2d'); g.drawImage(await loadImage(path.join(A, 'backgrounds', 'background1.png')), 0, 0, 1024, 687);
  const im = await loadImage(path.join(A, 'characters', 'DoomSlayer1.png')); const h = 190, w = Math.round(im.width * h / im.height);
  const c = createCanvas(w, h); c.getContext('2d').drawImage(im, 0, 0, w, h);
  const cut = { side: 'enemy', index: 0, x: 700, y: 330, w, h, png: c.toBuffer('image/png').toString('base64') };
  const layers = { w: 1024, h: 687, bg: bg.toBuffer('image/png'), cuts: [cut], anchors: [{ side: 'enemy', index: 0, x: 700 + w / 2, feetY: 520, w, h }] };
  const chrome = { players: [{ name: 'Mellow', level: 9, currentHP: 90, stats: { hp: 90, maxHp: 100, energy: 50, maxEnergy: 100 } }], enemies: [{ name: 'X', currentHP: 0, stats: { hp: 0, maxHp: 50 } }], rank: 'C', atkSeed: Number(process.argv[2] || 1) };
  const r = await o.renderFast({ layers, picks: [{ c: cut }], kind: process.argv[3] || 'fire', boss: false, deadIdx: new Set(), atk: true, chrome });
  if (!r || !r.mp4) { console.log('FAIL'); process.exit(1); }
  fs.writeFileSync('/tmp/death_strike.mp4', r.mp4); console.log('PASS', r.mp4.length); process.exit(0);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
