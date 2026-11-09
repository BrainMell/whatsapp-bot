#!/usr/bin/env node
// ASSET SHEET: dump the exact premade VFX sprites the death stamps use, at
// native size with labels, so stamp composition decisions are made by EYE.
const path = require('path'), fs = require('fs');
const REPO = '/home/ubuntu/whatsapp-bot';
const { createCanvas, loadImage } = require(path.join(REPO, 'node_modules/canvas'));
const VFX = path.join(REPO, 'core/rpgasset/vfx');
const LIST = [
  ['fire2', /^blast_[1-6]\.png$/, 2], ['fire2', /^jet_[1-4]\.png$/, 1],
  ['kenney', /^ground_[1-6]\.png$/, 3], ['kenney', /^sexp_[1-5]\.png$/, 1], ['kenney', /^flash_[1-5]\.png$/, 1],
  ['meteor', /^boulder_[1-8]\.png$/, 3],
  ['kenney', /^p_dirt_0[12]\.png$/, 2], ['kenney', /^bsmoke_([1-9]|1[0-3])\.png$/, 1],
  ['attack', /^attack[1-7]\.png$/, 3],
  ['kenney', /^p_circle_0[235]\.png$/, 1], ['kenney', /^puff_([1-9]|1[0-3])\.png$/, 1], ['kenney', /^p_smoke_0[15]\.png$/, 1],
];
(async () => {
  fs.mkdirSync('/tmp/deathqa', { recursive: true });
  const cells = [];
  for (const [sub, re, n] of LIST) {
    const dir = path.join(VFX, sub);
    let files = []; try { files = fs.readdirSync(dir).filter((f) => re.test(f)).sort(); } catch (e) {}
    for (let i = 0; i < Math.min(n, files.length); i++) cells.push({ name: `${sub}/${files[i]}`, p: path.join(dir, files[i]) });
  }
  const CW = 200, CH = 170, COLS = 6, rows = Math.ceil(cells.length / COLS);
  const cv = createCanvas(CW * COLS, CH * rows), c = cv.getContext('2d');
  c.fillStyle = '#30343c'; c.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < cells.length; i++) {
    const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH;
    try {
      const img = await loadImage(cells[i].p);
      const s = Math.min((CW - 16) / img.width, (CH - 30) / img.height);
      c.drawImage(img, x + 8, y + 22, img.width * s, img.height * s);
      c.fillStyle = '#fff'; c.font = '10px sans-serif';
      c.fillText(`${cells[i].name} ${img.width}x${img.height}`, x + 6, y + 14);
    } catch (e) { c.fillStyle = '#f66'; c.fillText('ERR ' + cells[i].name, x + 6, y + 14); }
  }
  fs.writeFileSync('/tmp/deathqa/assets.png', cv.toBuffer('image/png'));
  console.log('ASSET SHEET:', cells.length, 'cells -> /tmp/deathqa/assets.png');
  process.exit(0);
})().catch((e) => { console.error('CRASH', e && e.stack || e); process.exit(1); });
