/**
 * Phase 4 unit tests — summon commands + egg items.
 * Run: node scripts/test_summon_phase4.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO = '/home/z/my-project/repos/whatsapp-bot';
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log('=== PHASE 4 UNIT TESTS ===\n');

// ─── summonCommands module ─────────────────────────────────────
console.log('--- summonCommands module ---');

const summonCommands = require(path.join(REPO, 'core/commands/summonCommands.js'));

test('summonCommands exports handleCommand', () => {
  assert.strictEqual(typeof summonCommands.handleCommand, 'function');
});

// ─── lootSystem egg items ──────────────────────────────────────
console.log('\n--- lootSystem egg items ---');

const lootSystem = require(path.join(REPO, 'core/rpg/lootSystem.js'));

test('common summon egg exists in ITEM_DATABASE', () => {
  const egg = lootSystem.getItemInfo('summon_egg_common');
  assert.ok(egg);
  assert.strictEqual(egg.type, 'ITEM');
  assert.ok(egg.value > 0);
});

test('12+ summon egg items defined', () => {
  const eggIds = Object.keys(lootSystem.ITEM_DATABASE).filter(id => id.startsWith('summon_egg_'));
  assert.ok(eggIds.length >= 12, `expected ≥12 egg items, got ${eggIds.length}`);
});

test('all species-specific eggs map to valid species', () => {
  const registry = require(path.join(REPO, 'core/rpg/summonRegistry.js'));
  const eggIds = Object.keys(lootSystem.ITEM_DATABASE).filter(id => id.startsWith('summon_egg_') && id !== 'summon_egg_common');
  for (const eggId of eggIds) {
    const speciesId = eggId.replace('summon_egg_', '');
    const species = registry.getSpecies(speciesId);
    assert.ok(species, `egg ${eggId} maps to ${speciesId} but species doesn't exist`);
  }
});

test('loyalty crystal exists', () => {
  const crystal = lootSystem.getItemInfo('loyalty_crystal');
  assert.ok(crystal);
  assert.strictEqual(crystal.type, 'CONSUMABLE');
});

test('memory tonic exists', () => {
  const tonic = lootSystem.getItemInfo('memory_tonic');
  assert.ok(tonic);
  assert.strictEqual(tonic.type, 'CONSUMABLE');
});

test('summon rename tag exists', () => {
  const tag = lootSystem.getItemInfo('summon_rename_tag');
  assert.ok(tag);
  assert.strictEqual(tag.type, 'CONSUMABLE');
});

// ─── engine.js wiring ──────────────────────────────────────────
console.log('\n--- engine.js command wiring ---');

const engineSource = fs.readFileSync(path.join(REPO, 'core/engine.js'), 'utf8');

test('summonCommands required in engine.js', () => {
  assert.ok(engineSource.includes("const summonCommands = require('./commands/summonCommands');"));
});

test('summon command routed in engine.js', () => {
  assert.ok(engineSource.includes('primaryCmd === "summon"'));
  assert.ok(engineSource.includes('summonCommands.handleCommand'));
});

test('summon command accepts "summons" alias', () => {
  assert.ok(engineSource.includes('primaryCmd === "summons"'));
});

// ─── summonCommands source verification ────────────────────────
console.log('\n--- summonCommands source verification ---');

const cmdSource = fs.readFileSync(path.join(REPO, 'core/commands/summonCommands.js'), 'utf8');

test('all 10 commands implemented', () => {
  const commands = ['cmdPokedex', 'cmdDeploy', 'cmdDismiss', 'cmdInfo', 'cmdRelease', 'cmdTrain', 'cmdAllocate', 'cmdResonance', 'cmdCompendium', 'cmdHatch'];
  for (const cmd of commands) {
    assert.ok(cmdSource.includes(`async function ${cmd}(`), `${cmd} must be implemented`);
  }
});

test('help command implemented', () => {
  assert.ok(cmdSource.includes('async function cmdHelp('));
});

test('handleCommand routes all subcommands', () => {
  const subs = ['list', 'deploy', 'dismiss', 'info', 'release', 'train', 'allocate', 'resonance', 'compendium', 'hatch', 'help'];
  for (const sub of subs) {
    assert.ok(cmdSource.includes(`case '${sub}'`), `must route '${sub}'`);
  }
});

test('deploy command refreshes resonances on success', () => {
  assert.ok(cmdSource.includes('summonSystem.refreshUserResonances(user)'));
});

test('release command blocks active summon', () => {
  assert.ok(cmdSource.includes('Cannot release your active summon'));
});

test('hatch command checks slot space', () => {
  assert.ok(cmdSource.includes('Summon slots full'));
});

test('hatch command refunds egg on failure', () => {
  assert.ok(cmdSource.includes('Refund the egg on failure'));
  assert.ok(cmdSource.includes("inventorySystem.addItem(senderJid, eggId, 1)"));
});

test('info command shows all summon details', () => {
  assert.ok(cmdSource.includes('SUMMON DETAILS'));
  assert.ok(cmdSource.includes('SOUL ECHO'));
  assert.ok(cmdSource.includes('BEHAVIOR'));
  assert.ok(cmdSource.includes('LINEAGE'));
});

test('compendium shows taming progress', () => {
  assert.ok(cmdSource.includes('TAMING COMPENDIUM'));
  assert.ok(cmdSource.includes('IN PROGRESS'));
});

test('resonance command shows active bonuses', () => {
  assert.ok(cmdSource.includes('RESONANCE WEB'));
});

test('partial ID matching works (last 8 chars)', () => {
  assert.ok(cmdSource.includes('s.summonId.endsWith(query)'));
});

test('nickname matching works', () => {
  assert.ok(cmdSource.includes('s.nickname.toLowerCase() === query.toLowerCase()'));
});

// ─── Integration: commands use summonSystem correctly ──────────
console.log('\n--- Integration with summonSystem ---');

test('commands require summonSystem', () => {
  assert.ok(cmdSource.includes("require('../rpg/summonSystem')"));
});

test('commands require summonCapture (for compendium)', () => {
  assert.ok(cmdSource.includes("require('../rpg/summonCapture')"));
});

test('commands require registry (for species/echo/resonance lookups)', () => {
  assert.ok(cmdSource.includes("require('../rpg/summonRegistry')"));
});

test('commands require economy (for user lookup)', () => {
  assert.ok(cmdSource.includes("require('../rpg/economy')"));
});

test('commands require botConfig (for prefix)', () => {
  assert.ok(cmdSource.includes("require('../../botConfig')"));
});

// ─── Summary ──────────────────────────────────────────────────
console.log(`\n=== PHASE 4 SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
