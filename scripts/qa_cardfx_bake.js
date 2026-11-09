'use strict';
// ⚡ QA for docs/RECIPE_SKILLS_ULTS_SUMMONS.md §2 (card-play bake + one path)
// Renders 3 catalog cards twice each through renderCardPlayScene:
//   1st run = cold (card variants baked to disk), 2nd = warm (disk hits).
// CARDFX_BAKE is left ON; BAKE_DIR pointed at a QA dir to keep live cache clean.
process.env.BAKE_DIR = '/tmp/qa-cardfx-' + process.pid;
process.chdir('/home/ubuntu/whatsapp-bot');

const gen = require('../core/rpg/systems/combat/combatImageGenerator');
const scene = require('../core/rpg/systems/summonCards/cardPlayScene');
const catalog = require('../core/rpg/systems/summonCards/catalog');

function mkPlayer(i) {
  return { name: 'Tester' + i, jid: 'qa' + i + '@s.whatsapp.net', isEnemy: false, isSummon: false, index: i,
    stats: { hp: 900, maxHp: 900, energy: 80, maxEnergy: 100 }, currentHP: 900, level: 12,
    class: { id: 'FIGHTER', name: 'Fighter', icon: '⚔️' } };
}
function mkEnemy(i) {
  return { name: 'Goblin' + i, isEnemy: true, isSummon: false, index: i,
    stats: { hp: 300, maxHp: 300, energy: 30, maxEnergy: 50 }, currentHP: 300, level: 8,
    class: { id: 'GOBLIN', name: 'Goblin', icon: '👹' } };
}
(async () => {
  const cards = catalog.CARD_CATALOG;
  const list = Array.isArray(cards) ? cards : Object.values(cards || {});
  if (!list.length) { console.log('catalog empty — check catalog exports'); process.exit(1); }
  const picks = list.slice(0, 3);
  console.log('== §2 card-play cold vs warm ==');
  for (const card of picks) {
    for (const pass of ['cold', 'warm']) {
      const players = [mkPlayer(0)];
      const enemies = [mkEnemy(0), mkEnemy(1)];
      const t0 = Date.now();
      try {
        const mp4 = await scene.renderCardPlayScene({
          card, players, enemies, playerIndex: 0, targetIndex: 0,
          entries: [{ card }, { card: list[1] || card }, { card: list[2] || card }],
          info: { damage: card.type === 'ATTACK' ? 120 : 0, healing: card.type === 'ATTACK' ? 0 : 45, missed: false },
          sceneOptions: { rank: 'F', floor: 0, combatState: null },
          api: { buildPayload: gen._buildPayload, generateCombatLayers: gen._generateCombatLayers },
        });
        console.log(`${card.id} ${pass}: ${mp4 ? mp4.length + 'B' : 'NULL'} in ${Date.now() - t0}ms`);
      } catch (e) { console.log(`${card.id} ${pass} FAILED: ${e.message}`); }
    }
  }
  process.exit(0);
})().catch((e) => { console.error('QA FATAL', e); process.exit(1); });
