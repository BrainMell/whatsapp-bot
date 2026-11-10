// Passive trigger animation QA: contact sheet of one mid-effect frame per card -> argv[2]/passive_fx.png ; also encodes one mp4 to prove ffmpeg path.
const { createCanvas } = require('canvas'); const fs = require('fs'); const path = require('path');
const hud = require('../core/rpg/systems/combat/combatHud'); const { renderPassivePop, FX } = require('../core/rpg/systems/passiveCards/fxScene');
const { PASSIVE_CATALOG } = require('../core/rpg/systems/passiveCards/catalog');
(async () => {
  await hud.preload(); const out = process.argv[2] || '/tmp'; const ids = Object.keys(FX); const cols = 5, cw = 410, ch = 275;
  const sheet = createCanvas(cols * cw, Math.ceil(ids.length / cols) * ch), sc = sheet.getContext('2d'); let ok = 0;
  for (let i = 0; i < ids.length; i++) {
    const frames = []; const pl = { jid: 'x@s.whatsapp.net', passiveLoadout: [ids[i]] };
    require('../core/rpg/systems/passiveCards/engine').setLoadoutResolver((p) => (p && p.passiveLoadout) || []);
    await renderPassivePop({ events: [{ cardId: ids[i] }], players: [pl], enemies: [], playerIndex: 0, flat: true, entries: [] }, { frames });
    const fr = frames[Math.floor(frames.length * 0.55)]; sc.drawImage(fr, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch); sc.fillStyle = '#fff'; sc.font = '14px sans-serif'; sc.fillText(ids[i], (i % cols) * cw + 6, Math.floor(i / cols) * ch + 16); ok++;
  }
  fs.writeFileSync(path.join(out, 'passive_fx.png'), sheet.toBuffer('image/png'));
  const t0 = Date.now(); const mp4 = await renderPassivePop({ events: [{ cardId: 'static_charge' }], players: [{ jid: 'x', passiveLoadout: ['static_charge'] }], enemies: [], flat: true, entries: [] });
  console.log('cards', ok, 'mp4', mp4 && mp4.length, 'B in', Date.now() - t0, 'ms', mp4 && mp4.toString('latin1', 4, 8)); process.exit(0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
