const { createCanvas } = require('canvas'); const fs = require('fs');
const S = require('../core/rpg/systems/intro/aldafold/scenes'); const TL = require('../core/rpg/systems/intro/aldafold/timeline');
(async () => {
  const t0 = Date.now(); const a = S.buildAssets(); await a.logoPromise; console.log('assets', Date.now() - t0, 'ms');
  const times = process.argv.slice(3).map(Number); const cols = 2, w = TL.W, h = TL.H, rows = Math.ceil(times.length / cols);
  const sheet = createCanvas(w * cols, h * rows), sg = sheet.getContext('2d');
  times.forEach((t, i) => { const c = createCanvas(w, h), g = c.getContext('2d'); const f0 = Date.now(); S.renderFrame(g, a, t, Math.round(t * 24)); console.log('t', t, Date.now() - f0, 'ms'); sg.drawImage(c, (i % cols) * w, Math.floor(i / cols) * h); });
  fs.writeFileSync(process.argv[2], sheet.toBuffer('image/png'));
})().catch((e) => { console.log(e.stack); process.exit(1); });
