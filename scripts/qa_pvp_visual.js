// Visual PvP board check with REAL sprites (synthetic Go layers). node scripts/qa_pvp_visual.js  -> /tmp/pvp_*.png
const { createCanvas, loadImage } = require('canvas'); const fs = require('fs'); const path = require('path');
const A = path.join(__dirname, '..', 'core', 'rpgasset');
const node = require('../core/rpg/systems/combat/combatCardNode');
const mk = (n, h) => ({ jid: n, name: n, level: 12, hp: h, maxHp: 1000, currentHP: h, energy: 60, maxEnergy: 100, statusEffects: [] });
async function layers() {
  const bg = createCanvas(1024, 687), g = bg.getContext('2d');
  g.drawImage(await loadImage(path.join(A, 'backgrounds', 'background1.png')), 0, 0, 1024, 687);
  const sp = createCanvas(1024, 687), q = sp.getContext('2d'); const cuts = []; const anchors = [];
  const files = ['Berserker1.png', 'DoomSlayer1.png'];
  for (let i = 0; i < 2; i++) {
    const im = await loadImage(path.join(A, 'characters', files[i])); const h = 190, w = im.width * h / im.height; const x = i ? 770 - w / 2 : 250 - w / 2, y = 520 - h;
    const c = createCanvas(Math.ceil(w), h), cc = c.getContext('2d');
    if (i) { cc.translate(w, 0); cc.scale(-1, 1); } cc.drawImage(im, 0, 0, w, h);   // P2 mirrored to face left, like the Go layers
    q.drawImage(c, x, y); cuts.push({ side: 'player', index: i, x, y, w, h, png: c.toBuffer('image/png').toString('base64') });
    anchors.push({ side: 'player', index: i, x: x + w / 2, feetY: 520, w, h });
  }
  return { success: true, w: 1024, h: 687, bg: bg.toBuffer('image/png'), sprites: sp.toBuffer('image/png'), cuts, anchors };
}
(async () => {
  const L = await layers(); const api = { buildPayload: (p) => ({ players: p }), generateCombatLayers: async () => L };
  const cases = { hit: { damage: 120, targetSide: 'player', targetIndex: 1 }, miss: { missed: true, targetSide: 'player', targetIndex: 1 }, none: {} };
  for (const [k, act] of Object.entries(cases)) {
    const r = await node.renderNodePvpCard([mk('Mellow', 900), mk('Rival', 700)], [], { combatState: {}, action: { attackerSide: 'player', attackerIndex: 0, ...act } }, api);
    fs.writeFileSync(`/tmp/pvp_${k}.jpg`, r.buffer); console.log('wrote', k);
  }
})();
