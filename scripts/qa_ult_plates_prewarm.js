'use strict';
// ⚡ QA for docs/RECIPE_SKILLS_ULTS_SUMMONS.md §1 (skill/ult plates)
// 1) pure-key parity: render the same class twice against DIFFERENT synthetic
//    scenes (different bg bytes) — §1.2 means the 2nd must HIT the same plate.
// 2) prewarm keys list shape + one bakePlates() call.
// ULT_PLATE_DIR is pointed at a QA dir so live caches are untouched.
process.env.ULT_PLATE_DIR = '/tmp/qa-ult-plates-' + process.pid;
process.env.ULT_PREWARM = '0';           // don't let the boot timer double-run
const path = require('path');
process.chdir('/home/ubuntu/whatsapp-bot');

const { createCanvas } = require('canvas');
const gen = require('../core/rpg/systems/combat/combatImageGenerator');
const fx = require('../core/rpg/systems/combat/ultimateFx');
const skillVfx = require('../core/rpg/systems/combat/skillVfx');

function mk(side, i, cls) {
  return { name: side + '_' + i, isEnemy: side === 'enemy', isSummon: false, index: i,
    stats: { hp: 800, maxHp: 800, energy: 50, maxEnergy: 100 }, currentHP: 800, level: 10,
    class: { id: cls || (side === 'enemy' ? 'GOBLIN' : 'FIGHTER'), name: side === 'enemy' ? 'Goblin' : 'Fighter', icon: '⚔️' } };
}
async function fixture(nEnemies, bgSeed) {
  const players = [mk('player', 0, 'FIGHTER')];
  const enemies = Array.from({ length: nEnemies }, (_, i) => mk('enemy', i));
  const layers = await gen.generateCombatLayers(players, enemies, { rank: 'F', floor: 0, combatType: 'PVE' });
  if (!layers || !layers.bg) throw new Error('no layers');
  // mutate the scene bytes so the SECOND render sees a different base scene
  if (bgSeed) {
    const cv = createCanvas(640, 480), c = cv.getContext('2d');
    c.drawImage(await require('canvas').loadImage(layers.bg), 0, 0, 640, 480);
    c.fillStyle = 'rgba(8,10,30,' + (0.12 + bgSeed * 0.05) + ')';
    c.fillRect(0, 0, 640, 480);
    layers.bg = await cv.toBuffer('image/png');
  }
  return layers;
}
async function timeCast(classId, layers, aoe) {
  const PALETTE = skillVfx.PALETTE;
  const t0 = Date.now();
  const vid = await fx.renderUltimateVideo({
    baseBuffer: layers.bg, layers, classId, name: classId.toLowerCase().replace(/_/g, ' '),
    side: (skillVfx.SIGNATURE_SKILLS[classId] || {}).side || 'player', palette: PALETTE[classId] || undefined,
    skillLevel: 1, maxLevel: 3, intensity: 0, casterIndex: 0, targetIndex: 0, targetSide: 'enemy',
    aoe: !!aoe, targets: [], dying: [], abort: { flag: false },
  });
  return { ms: Date.now() - t0, plates: vid && vid.plates, bytes: vid && vid.mp4 && vid.mp4.length };
}
(async () => {
  const classes = (process.argv[2] ? process.argv[2].split(',') : ['DRAGON_GOD', 'REAPER', 'FIGHTER']);
  console.log('== §1.2 pure-key parity (same geometry, DIFFERENT scene bytes) ==');
  for (const cls of classes) {
    try {
      const l1 = await fixture(2, 0);
      const r1 = await timeCast(cls, l1, false);
      const l2 = await fixture(2, 3);           // different scene!
      const r2 = await timeCast(cls, l2, false);
      console.log(`${cls}: cold ${r1.ms}ms plates=${r1.plates} ${r1.bytes}B | same-geom-diff-scene ${r2.ms}ms plates=${r2.plates} ${r2.bytes}B → ${r2.plates === 'hit' ? 'PURE-KEY HIT ✅' : 'MISS (scene-dep or capture-gated)'}`);
    } catch (e) { console.log(cls + ' FAILED: ' + e.message); }
  }
  console.log('== §1.3 prewarm keys + one bake ==');
  const keys = fx.prewarmKeys();
  console.log('prewarmKeys: ' + keys.length + ' combos (classes ' + new Set(keys.map(k => k.classId)).size + ')');
  await new Promise((r) => setTimeout(r, 16000));   // §1.3 yield window: let the quiet timer expire
  const t0 = Date.now();
  const res = await fx.bakePlates({ classId: classes[0], side: 'enemy', level: 1, aoe: false, rosterN: 2 }).catch((e) => 'ERR ' + e.message);
  console.log(`bakePlates(${classes[0]}, roster 2): ${res} in ${Date.now() - t0}ms`);
  process.exit(0);
})().catch((e) => { console.error('QA FATAL', e); process.exit(1); });
