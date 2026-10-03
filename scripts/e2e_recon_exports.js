#!/usr/bin/env node
/** List exported functions of key RPG modules (recon for the E2E harness). */
try { require('dotenv').config(); } catch (e) {}
const origErr = console.error;
console.error = () => {};
const mods = [
  'core/rpg/guildAdventure', 'core/rpg/abyssSystem', 'core/rpg/progression',
  'core/rpg/economy', 'core/rpg/inventorySystem', 'core/rpg/lootSystem',
  'core/rpg/skillTree', 'core/rpg/craftingSystem', 'core/rpg/runeSystem',
  'core/rpg/pvpSystem', 'core/rpg/summonSystem', 'core/rpg/durabilitySystem',
];
console.error = origErr;
for (const m of mods) {
  try {
    const mod = require('../' + m);
    const fns = Object.keys(mod).filter(k => typeof mod[k] === 'function');
    console.log(`\n=== ${m} (${fns.length}) ===`);
    console.log(fns.join(', '));
  } catch (e) {
    console.log(`\n=== ${m} LOAD FAIL: ${e.message}`);
  }
}
process.exit(0);
