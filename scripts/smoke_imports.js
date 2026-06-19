// Smoke test: can we import every RPG subsystem in isolation?
require('/home/z/my-project/scripts/test_harness.js');

const modules = [
  'core/rpg/progression',
  'core/rpg/classSystem',
  'core/rpg/economy',
  'core/rpg/inventorySystem',
  'core/rpg/lootSystem',
  'core/rpg/craftingSystem',
  'core/rpg/durabilitySystem',
  'core/rpg/socialSystem',
  'core/rpg/pvpSystem',
  'core/rpg/skillTree',
  'core/rpg/bossMechanics',
  'core/rpg/monsterSkills',
  'core/rpg/classEncounters',
  'core/rpg/weaponSynergy',
  'core/rpg/guilds',
  'core/rpg/stockMarket',
  'core/rpg/loans',
  'core/rpg/investment',
  'core/rpg/cardSystem',
  'core/rpg/combatImageGenerator',
  'core/rpg/combatIntegration',
];

let pass = 0, fail = 0;
for (const m of modules) {
  try {
    require('/home/z/my-project/repo/whatsapp-bot/' + m + '.js');
    console.log('OK   ' + m);
    pass++;
  } catch (e) {
    console.log('FAIL ' + m + ' :: ' + e.message);
    fail++;
  }
}
console.log('---');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
