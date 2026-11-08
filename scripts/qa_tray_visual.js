// Deck tray with the NEW parchment faces vs old: node scripts/qa_tray_visual.js -> /tmp/tray_new.png /tmp/tray_old.png
const { createCanvas, loadImage } = require('canvas'); const fs = require('fs'); const path = require('path');
const hud = require('../core/rpg/systems/combat/combatHud'); const sc = require('../core/rpg/systems/summonCards');
(async () => {
  await hud.preload();
  const ids = Object.keys(sc.catalog).slice(0, 9);
  const entries = ids.map((id, i) => ({ card: sc.catalog[id], ready: i !== 2, turnsLeft: 2, affordable: i !== 4 }));
  const bg = await loadImage(path.join(__dirname, '..', 'core', 'rpgasset', 'backgrounds', 'background1.png'));
  for (const mode of ['new', 'old']) {
    process.env.TRAY_OLD_CARD = mode === 'old' ? '1' : '';
    const cv = createCanvas(1024, 687), c = cv.getContext('2d'); c.drawImage(bg, 0, 0, 1024, 687);
    const t0 = Date.now(); await hud.drawDeckTray(c, entries, 1, 330, hud.DH - 96, hud.DW - 18); const t1 = Date.now() - t0;
    const t2 = Date.now(); const c2 = createCanvas(1024, 687).getContext('2d'); await hud.drawDeckTray(c2, entries, 1, 330, hud.DH - 96, hud.DW - 18);
    console.log(mode, 'cold', t1, 'ms warm', Date.now() - t2, 'ms');
    const crop = createCanvas(700, 130); crop.getContext('2d').drawImage(cv, 324, 687 - 112, 700, 130, 0, 0, 700, 130);
    fs.writeFileSync(`/tmp/tray_${mode}.png`, crop.toBuffer('image/png'));
  }
  process.exit(0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
