// Hand band with passive group + divider: node scripts/qa_passive_hand.js [outdir]
const { createCanvas, loadImage } = require('canvas'); const fs = require('fs'); const path = require('path');
const hud = require('../core/rpg/systems/combat/combatHud'); const sc = require('../core/rpg/systems/summonCards');
(async () => {
  await hud.preload(); const out = process.argv[2] || '/tmp';
  const entries = Object.keys(sc.catalog).slice(0, 5).map((id) => ({ card: sc.catalog[id], ready: true, turnsLeft: 0, affordable: true }));
  const bg = await loadImage(path.join(__dirname, '..', 'core', 'rpgasset', 'backgrounds', 'background1.png'));
  const rows = [['both', entries, ['mirror_guard', 'blood_debt', 'lucky_charm'], ['blood_debt']], ['passive only', [], ['phoenix_feather', 'second_wind'], []], ['summon only', entries, [], []]];
  const sheet = createCanvas(760, 130 * rows.length), sc2 = sheet.getContext('2d');
  rows.forEach(async () => {});
  for (let r = 0; r < rows.length; r++) {
    const cv = createCanvas(1024, 687), c = cv.getContext('2d'); c.drawImage(bg, 0, 0, 1024, 687);
    const [, en, pids, fx] = rows[r]; await hud.drawDeckTray(c, en, 1, 330, hud.DH - 96, hud.DW - 18, pids, fx);
    sc2.drawImage(cv, 300, 687 - 112, 724, 130, 0, r * 130, 724, 130);
  }
  fs.writeFileSync(path.join(out, 'passive_hand.png'), sheet.toBuffer('image/png')); process.exit(0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
