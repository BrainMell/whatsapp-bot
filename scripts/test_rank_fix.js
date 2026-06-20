// Tests for the never-downgrade rank fix and GP removal.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const classSystem = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/classSystem.js');
const economy = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/economy.js');
const progression = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/progression.js');

function installFakeUser(overrides = {}) {
  const id = 'test' + Math.floor(Math.random() * 100000) + '@s.whatsapp.net';
  const user = {
    userId: id,
    wallet: 5000,
    bank: 0,
    registered: true,
    nickname: 'Tester',
    class: 'FIGHTER',
    adventurerRank: 'F',
    questsCompleted: 0,
    progression: {
      xp: 0, level: 1, gp: 0, totalGP: 0, commandsUsed: 0, statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [],
    },
    stats: { totalEarned: 5000, totalSpent: 0 },
    ...overrides,
  };
  economy.economyData.set(id, user);
  return id;
}

let tests = 0, passed = 0, failed = 0;
function test(name, fn) {
  tests++;
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}

console.log('\n=== Rank Never-Downgrade & GP Removal Tests ===\n');

test('calculateAdventurerRank: GP removed from requirements', () => {
  // Player at L90 with 500 quests and 0 GP should now be SSS
  const rank = classSystem.calculateAdventurerRank(90, 500, 0);
  assert.strictEqual(rank, 'SSS', `Expected SSS with GP=0, got ${rank}`);
});

test('updateAdventurerRank: NEVER downgrades existing rank (CRITICAL FIX)', () => {
  // Player is S-rank. calculateAdventurerRank would return F (level 1, 0 quests).
  // Previously this would DOWNGRADE them to F. Now it should preserve S.
  const id = installFakeUser({
    adventurerRank: 'S',
    progression: { level: 1, xp: 0, gp: 0, totalGP: 0, statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [] },
    questsCompleted: 0,
  });
  const result = economy.updateAdventurerRank(id);
  assert.strictEqual(result.ranked_up, false, 'should not rank up');
  assert.strictEqual(result.rank, 'S', `should preserve S rank, got ${result.rank}`);
  // CRITICAL: the user's stored rank must still be S, not F
  const user = economy.getUser(id);
  assert.strictEqual(user.adventurerRank, 'S', `stored rank should be S, got ${user.adventurerRank}`);
});

test('updateAdventurerRank: upgrades when player earns higher rank', () => {
  // Player is F-rank but has level 90 and 500 quests → should upgrade to SSS
  const id = installFakeUser({
    adventurerRank: 'F',
    progression: { level: 90, xp: 0, gp: 0, totalGP: 0, statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [] },
    questsCompleted: 500,
  });
  const result = economy.updateAdventurerRank(id);
  assert.strictEqual(result.ranked_up, true, 'should rank up');
  assert.strictEqual(result.new_rank, 'SSS', `should be SSS, got ${result.new_rank}`);
});

test('updateAdventurerRank: preserves GOD rank even with 0 GP', () => {
  const id = installFakeUser({
    adventurerRank: 'GOD',
    progression: { level: 1, xp: 0, gp: 0, totalGP: 0, statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [] },
    questsCompleted: 0,
  });
  const result = economy.updateAdventurerRank(id);
  assert.strictEqual(result.rank, 'GOD', `should preserve GOD, got ${result.rank}`);
});

test('updateAdventurerRank: no-op when rank matches calculated', () => {
  const id = installFakeUser({
    adventurerRank: 'D',
    progression: { level: 25, xp: 0, gp: 0, totalGP: 0, statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [] },
    questsCompleted: 30,
  });
  const result = economy.updateAdventurerRank(id);
  assert.strictEqual(result.ranked_up, false);
  assert.strictEqual(result.rank, 'D');
});

console.log(`\n--- Rank Tests: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
