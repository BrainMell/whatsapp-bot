// PvP card-play scene smoke test with synthetic Go layers: node scripts/qa_pvp_card_scene.js
const { createCanvas } = require('canvas'); const fs = require('fs');
const sc = require('../core/rpg/systems/summonCards');
const scene = require('../core/rpg/systems/summonCards/cardPlayScene');
const mk = (n, i) => ({ jid: n, name: n, level: 10, hp: 900, maxHp: 1000, currentHP: 900, energy: 80, maxEnergy: 100, stats: { hp: 900, maxHp: 1000, energy: 80, maxEnergy: 100 }, statusEffects: [] });
const bg = createCanvas(1024, 687), g = bg.getContext('2d'); g.fillStyle = '#44543f'; g.fillRect(0, 0, 1024, 687);
const sp = createCanvas(1024, 687), q = sp.getContext('2d'); q.fillStyle = '#c33'; q.fillRect(220, 380, 90, 140); q.fillStyle = '#36c'; q.fillRect(700, 380, 90, 140);
const layers = { success: true, w: 1024, h: 687, bg: bg.toBuffer('image/png'), sprites: sp.toBuffer('image/png'), cuts: [], anchors: [{ side: 'player', index: 0, x: 265, feetY: 520, w: 90, h: 140 }, { side: 'player', index: 1, x: 745, feetY: 520, w: 90, h: 140 }] };
const api = { buildPayload: (p) => ({ players: p }), generateCombatLayers: async () => layers };
const card = sc.catalog[Object.keys(sc.catalog)[0]];
(async () => {
  const mp4 = await scene.renderCardPlayScene({ pvp: true, card, players: [mk('a'), mk('b')], enemies: [], playerIndex: 0, targetIndex: 1, entries: [{ card, ready: true, affordable: true }], info: { damage: 120 }, sceneOptions: {}, api });
  if (!mp4 || mp4.length < 1000) { console.log('FAIL no video'); process.exit(1); }
  fs.writeFileSync('/tmp/pvp_card.mp4', mp4); console.log('PASS', mp4.length, 'bytes'); process.exit(0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
