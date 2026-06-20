// Tests for classSystem bugs found during audit.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const classSystem = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/classSystem.js');

let tests = 0, passed = 0, failed = 0;
function test(name, fn) {
  tests++;
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}

console.log('\n=== Class System Tests ===\n');

test('getAllClasses includes Starter, Evolved, AND Ascended classes', () => {
  const all = classSystem.getAllClasses();
  // Starter
  assert.ok(all.FIGHTER, 'FIGHTER missing');
  // Evolved
  assert.ok(all.WARRIOR, 'WARRIOR missing');
  assert.ok(all.MAGE, 'MAGE missing');
  // Ascended
  assert.ok(all.WARLORD, 'WARLORD missing');
  assert.ok(all.ARCHMAGE, 'ARCHMAGE missing');
  assert.ok(all.DRAGON_GOD, 'DRAGON_GOD missing');
});

test('calculateAdventurerRank: requires GP, not just level and quests', () => {
  // Player at L90 with 500 quests but 0 GP should NOT be SSS (needs 12000 GP).
  const rank = classSystem.calculateAdventurerRank(90, 500, 0);
  assert.notStrictEqual(rank, 'SSS', `Expected rank < SSS (GP=0), got ${rank}`);
  // Same player but with enough GP should be SSS.
  const rank2 = classSystem.calculateAdventurerRank(90, 500, 12000);
  assert.strictEqual(rank2, 'SSS', `Expected SSS with full requirements, got ${rank2}`);
});

test('calculateAdventurerRank: GOD requires 25000 GP', () => {
  const rank = classSystem.calculateAdventurerRank(100, 1000, 20000);
  assert.notStrictEqual(rank, 'GOD', `Expected rank < GOD (GP short), got ${rank}`);
  const rank2 = classSystem.calculateAdventurerRank(100, 1000, 25000);
  assert.strictEqual(rank2, 'GOD', `Expected GOD with full requirements, got ${rank2}`);
});

test('canEvolve: WARLORD requires 100 victories (was previously not checked)', () => {
  // Player at L50 with 100 quests but 0 victories.
  const result = classSystem.canEvolve('WARRIOR', 50, 100, 0, ['VOID_CORRUPTED']);
  const warlordEvo = result.evolutions.find(e => e.id === 'WARLORD');
  assert.ok(warlordEvo, 'WARLORD evolution not listed');
  assert.ok(!warlordEvo.meetsRequirements, 'WARLOLD should not be available without victories');
  assert.ok(warlordEvo.missingRequirements.some(r => r.includes('Victories')),
    `Expected 'Victories' in missing requirements, got: ${warlordEvo.missingRequirements.join(', ')}`);

  // Same player but with 100 victories should meet the requirement.
  const result2 = classSystem.canEvolve('WARRIOR', 50, 100, 0, ['VOID_CORRUPTED'], { victories: 100, gold: 100000 });
  const warlordEvo2 = result2.evolutions.find(e => e.id === 'WARLORD');
  assert.ok(warlordEvo2.meetsRequirements,
    `WARLORD should be available with all reqs, missing: ${warlordEvo2.missingRequirements.join(', ')}`);
});

test('canEvolve: DRAGON_GOD requires 200 dragons killed', () => {
  const result = classSystem.canEvolve('DRAGONSLAYER', 75, 200, 100, ['LEVIATHAN']);
  const dgEvo = result.evolutions.find(e => e.id === 'DRAGON_GOD');
  assert.ok(dgEvo, 'DRAGON_GOD evolution not listed');
  assert.ok(!dgEvo.meetsRequirements, 'DRAGON_GOD should not be available with only 100 dragon kills');
  assert.ok(dgEvo.missingRequirements.some(r => r.includes('Dragons Killed')),
    `Expected 'Dragons Killed' in missing requirements, got: ${dgEvo.missingRequirements.join(', ')}`);

  const result2 = classSystem.canEvolve('DRAGONSLAYER', 75, 200, 200, ['LEVIATHAN'], { gold: 500000 });
  const dgEvo2 = result2.evolutions.find(e => e.id === 'DRAGON_GOD');
  assert.ok(dgEvo2.meetsRequirements,
    `DRAGON_GOD should be available with 200 kills, missing: ${dgEvo2.missingRequirements.join(', ')}`);
});

test('canEvolve: TYCOON requires 500k gold earned (lifetime)', () => {
  const result = classSystem.canEvolve('MERCHANT', 50, 100, 0, ['TREASURE_HOARDER'], { gold: 200000, goldEarned: 100000 });
  const tEvo = result.evolutions.find(e => e.id === 'TYCOON');
  assert.ok(!tEvo.meetsRequirements, 'TYCOON should not be available with only 100k earned');
  assert.ok(tEvo.missingRequirements.some(r => r.includes('Gold Earned')),
    `Expected 'Gold Earned' in missing requirements, got: ${tEvo.missingRequirements.join(', ')}`);
});

test('canEvolve: TEMPLE requires 200 undead kills', () => {
  const result = classSystem.canEvolve('PALADIN', 50, 100, 0, ['PRIMORDIAL_CHAOS'], { gold: 100000, undeadKills: 100 });
  const tEvo = result.evolutions.find(e => e.id === 'TEMPLAR');
  assert.ok(!tEvo.meetsRequirements, 'TEMPLAR should not be available with only 100 undead kills');
  assert.ok(tEvo.missingRequirements.some(r => r.includes('Undead Kills')),
    `Expected 'Undead Kills' in missing requirements, got: ${tEvo.missingRequirements.join(', ')}`);
});

test('getLineage: walks up evolvedFrom chain correctly', () => {
  // DRAGON_GOD -> DRAGONSLAYER -> FIGHTER
  const lineage = classSystem.getLineage('DRAGON_GOD');
  assert.deepStrictEqual(lineage, ['DRAGON_GOD', 'DRAGONSLAYER', 'FIGHTER']);
});

test('isFighterLineage: recognizes the Dragonslayer line', () => {
  assert.ok(classSystem.isFighterLineage('DRAGONSLAYER'));
  assert.ok(classSystem.isFighterLineage('DRAGON_GOD'));
  assert.ok(!classSystem.isFighterLineage('MAGE'));
  assert.ok(!classSystem.isFighterLineage('ARCHMAGE'));
});

test('canEvolve: returns proper reason for ASCENDED classes (no further evo)', () => {
  const result = classSystem.canEvolve('WARLORD', 99, 999);
  assert.ok(!result.canEvolve);
  assert.strictEqual(result.reason, 'Max tier reached');
});

console.log(`\n--- Class System: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
