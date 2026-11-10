// Hand band QA: passive group (full / partial+empty / passive only / summon only / MANY summons incl. 3-digit +N)
const { createCanvas, loadImage } = require('canvas'); const fs = require('fs'); const path = require('path');
const hud = require('../core/rpg/systems/combat/combatHud'); const sc = require('../core/rpg/systems/summonCards');
(async () => {
  await hud.preload(); const out = process.argv[2] || '/tmp';
  const base = Object.keys(sc.catalog).map((id) => ({ card: sc.catalog[id], ready: true, turnsLeft: 0, affordable: true }));
  const many = (n) => Array.from({ length: n }, (_, i) => base[i % base.length]);
  const bg = await loadImage(path.join(__dirname, '..', 'core', 'rpgasset', 'backgrounds', 'background1.png'));
  const rows = [['5 passive + 5 summon', many(5), ['mirror_guard', 'blood_debt', 'lucky_charm', 'last_stand', 'phoenix_feather'], ['blood_debt']],
    ['2 passive + 1 empty + 14 summon (+N)', many(14), ['mirror_guard', 'static_charge', null], []],
    ['5 passive + 120 summon (+3-digit)', many(120), ['mirror_guard', 'blood_debt', 'lucky_charm', 'last_stand', 'phoenix_feather'], []],
    ['passive only', [], ['phoenix_feather', 'second_wind', null], []], ['summon only 30', many(30), [], []]];
  const sheet = createCanvas(740, 120 * rows.length), sc2 = sheet.getContext('2d'); let bad = 0;
  for (let r = 0; r < rows.length; r++) {
    const cv = createCanvas(1024, 687), c = cv.getContext('2d'); c.drawImage(bg, 0, 0, 1024, 687);
    const [lab, en, pids, fx] = rows[r]; await hud.drawDeckTray(c, en, 1, 330, hud.DH - 96, hud.DW - 18, pids, fx);
    const L = hud.deckLayout(en, 1, 330, hud.DH - 96, hud.DW - 18, pids);
    const right = L.chip ? L.chip.x + L.chip.w : (L.slots.length ? L.slots[L.slots.length - 1].x + L.cw : 0);
    const ok = right <= hud.DW - 10 && (!pids.length || L.startX >= 330 + hud.passiveBandW(pids.length)); if (!ok) bad++;
    console.log(ok ? 'PASS' : 'FAIL', lab, 'shown', L.shownN, 'more', L.more, 'rightEdge', Math.round(right));
    sc2.drawImage(cv, 300, 687 - 112, 724, 120, 0, r * 120, 724, 120);
  }
  fs.writeFileSync(path.join(out, 'passive_hand.png'), sheet.toBuffer('image/png')); console.log(bad ? 'FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
