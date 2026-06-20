// Tests for the negative-allocation exploit and other progression edge cases.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const progression = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/progression.js');
const economy = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/economy.js');

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
      xp: 0, level: 10, gp: 0, totalGP: 0, commandsUsed: 0, statPoints: 10,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [],
    },
    skills: {},
    statBonuses: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
    inventory: {},
    equipment: { main_hand: null, off_hand: null, armor: null, helmet: null, boots: null, ring: null, amulet: null, cloak: null, gloves: null },
    stats: { totalEarned: 5000, totalSpent: 0, gamesPlayed: 0, gamesWon: 0 },
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

console.log('\n=== Negative Allocation Exploit Regression Tests ===\n');

test('allocateStatPoint: rejects negative amount (was exploit)', () => {
  const id = installFakeUser({ progression: { level: 10, statPoints: 0, xp: 0, gp: 0, totalGP: 0, commandsUsed: 0, allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, totalXPEarned: 0, totalLevelsGained: 0, achievements: [] } });
  // Try to allocate -5 ATK. Previously this would pass the validation,
  // subtract -15 from atk, and ADD 5 to statPoints (0 - -5 = 5).
  const result = progression.allocateStatPoint(id, 'atk', -5);
  assert.ok(!result.success, 'should reject negative amount');
  // CRITICAL: statPoints must still be 0, not 5
  const user = progression.getUser(id);
  assert.strictEqual(user.statPoints, 0, `statPoints should be 0, got ${user.statPoints}`);
  // And atk should still be 0, not -15
  assert.strictEqual(user.allocatedStats.atk, 0, `allocatedStats.atk should be 0, got ${user.allocatedStats.atk}`);
});

test('allocateStatPoint: rejects zero amount', () => {
  const id = installFakeUser({ progression: { level: 10, statPoints: 10, xp: 0, gp: 0, totalGP: 0, commandsUsed: 0, allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, totalXPEarned: 0, totalLevelsGained: 0, achievements: [] } });
  const result = progression.allocateStatPoint(id, 'atk', 0);
  assert.ok(!result.success);
});

test('allocateStatPoint: rejects non-numeric amount', () => {
  const id = installFakeUser({ progression: { level: 10, statPoints: 10, xp: 0, gp: 0, totalGP: 0, commandsUsed: 0, allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, totalXPEarned: 0, totalLevelsGained: 0, achievements: [] } });
  const result = progression.allocateStatPoint(id, 'atk', 'abc');
  assert.ok(!result.success);
});

test('allocateStatPoint: rejects NaN amount', () => {
  const id = installFakeUser({ progression: { level: 10, statPoints: 10, xp: 0, gp: 0, totalGP: 0, commandsUsed: 0, allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, totalXPEarned: 0, totalLevelsGained: 0, achievements: [] } });
  const result = progression.allocateStatPoint(id, 'atk', NaN);
  assert.ok(!result.success);
});

test('allocateStatPoint: valid allocation still works', () => {
  const id = installFakeUser({ progression: { level: 10, statPoints: 10, xp: 0, gp: 0, totalGP: 0, commandsUsed: 0, allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, totalXPEarned: 0, totalLevelsGained: 0, achievements: [] } });
  const result = progression.allocateStatPoint(id, 'atk', 5);
  assert.ok(result.success);
  assert.strictEqual(result.pointsSpent, 5);
  // For FIGHTER (Starter, tier=1.0): base atk = 3 per point. 5 * 3 = 15
  assert.strictEqual(result.valueGained, 15);
  // statPoints should now be 10 - 5 = 5
  const user = progression.getUser(id);
  assert.strictEqual(user.statPoints, 5);
});

test('allocateStatPoint: soft cap prevents massive single-stat dumps', () => {
  // Try to allocate 50 points into one stat (above the 20 soft cap)
  const id = installFakeUser({ progression: { level: 50, statPoints: 100, xp: 0, gp: 0, totalGP: 0, commandsUsed: 0, allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, totalXPEarned: 0, totalLevelsGained: 0, achievements: [] } });
  const result = progression.allocateStatPoint(id, 'atk', 50);
  assert.ok(result.success);
  // First 20 points: 3 each = 60. Last 30 points: 1.5 each (floored per call) = floor(3 * 0.5 * 30) = 45
  // Total: 60 + 45 = 105
  assert.strictEqual(result.valueGained, 105, `expected 105 (60 + 45), got ${result.valueGained}`);
});

console.log(`\n--- Batch 6: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
