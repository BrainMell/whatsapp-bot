// Render the new gate cards + dead world cards to PNG for visual QA.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = '/home/z/my-project/map_qa/gate_cards';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const wmr = require('/home/z/my-project/whatsapp-bot/core/rpg/worldMapRenderer');
  const dwr = require('/home/z/my-project/whatsapp-bot/core/rpg/deadWorldRenderer');

  const jobs = [
    ['abyss_closed.png', () => wmr.renderAbyssMisalignedCard({ mode: 'closed', opensInLabel: 'locked 4h 12m' })],
    ['abyss_unreadable.png', () => wmr.renderAbyssMisalignedCard({ mode: 'unreadable' })],
    ['afterlife_locked.png', () => wmr.renderAfterlifeLockedCard()],
    ['dw_scene_fire.png', () => dwr.renderDeadWorldScene({
      playerName: 'MellowDiHOfHeaven', playerClass: 'FIGHTER', spriteIndex: 0,
      dungeonName: "Dragon's Lair", rank: 'F', floor: 2,
      backgroundPath: 'rpgasset/environment/env1.png', environmentKey: 'env1.png',
    })],
    ['dw_victory_fire.png', () => dwr.renderDeadWorldVictory({
      playerName: 'MellowDiHOfHeaven', playerClass: 'FIGHTER', spriteIndex: 0,
      dungeonName: "Dragon's Lair", rank: 'F', floor: 2,
      backgroundPath: 'rpgasset/environment/env1.png', environmentKey: 'env1.png',
    })],
    ['dw_scene_ice.png', () => dwr.renderDeadWorldScene({
      playerName: 'qa_hero', playerClass: 'ARCHMAGE', spriteIndex: 1,
      dungeonName: 'Frozen Hollows', rank: 'E', floor: 3,
      backgroundPath: 'rpgasset/environment/env2.png', environmentKey: 'env2.png',
    })],
    ['dw_victory_ice.png', () => dwr.renderDeadWorldVictory({
      playerName: 'qa_hero', playerClass: 'ARCHMAGE', spriteIndex: 1,
      dungeonName: 'Frozen Hollows', rank: 'E', floor: 3,
      backgroundPath: 'rpgasset/environment/env2.png', environmentKey: 'env2.png',
    })],
    ['dw_scene_forest.png', () => dwr.renderDeadWorldScene({
      playerName: 'wanderer', playerClass: 'SCOUT', spriteIndex: 0,
      dungeonName: 'GreenmaW Ruins', rank: 'D', floor: 1,
      backgroundPath: 'rpgasset/environment/spark_1.png', environmentKey: 'spark_1.png',
    })],
    ['dw_scene_stone.png', () => dwr.renderDeadWorldScene({
      playerName: 'wanderer', playerClass: 'NECROMANCER', spriteIndex: 0,
      dungeonName: 'Demon Castle', rank: 'C', floor: 4,
      backgroundPath: 'rpgasset/environment/spark_2.png', environmentKey: 'spark_2.png',
    })],
  ];

  for (const [name, fn] of jobs) {
    const buf = await fn();
    if (!buf) { console.log(name, 'RENDER NULL'); continue; }
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log(name, buf.length, 'bytes');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
