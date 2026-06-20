// Tests for the progression system — focuses on bugs found during audit.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const progression = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/progression.js');
const economy = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/economy.js');

// Helper: install a fake user into the economy cache
function installFakeUser(overrides = {}) {
  const id = 'test@s.whatsapp.com';
  const user = {
    userId: id,
    wallet: 1000,
    bank: 0,
    registered: true,
    nickname: 'Tester',
    class: 'FIGHTER',
    adventurerRank: 'F',
    questsCompleted: 0,
    progression: {
      xp: 0,
      level: 1,
      gp: 0,
      totalGP: 0,
      commandsUsed: 0,
      statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0,
      totalLevelsGained: 0,
      achievements: [],
    },
    skills: {},
    statBonuses: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
    inventory: {},
    equipment: { main_hand: null, off_hand: null, armor: null, helmet: null, boots: null, ring: null, amulet: null, cloak: null, gloves: null },
    stats: { totalEarned: 1000, totalSpent: 0, gamesPlayed: 0, gamesWon: 0 },
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

console.log('\n=== Progression System Tests ===\n');

test('getXPForLevel(1) = 0', () => {
  assert.strictEqual(progression.getXPForLevel(1), 0);
});

test('getXPForLevel(2) = 80 (early override)', () => {
  assert.strictEqual(progression.getXPForLevel(2), 80);
});

test('getXPForLevel(5) = 700 (early override)', () => {
  assert.strictEqual(progression.getXPForLevel(5), 700);
});

test('XP between consecutive levels is strictly increasing', () => {
  let prevDelta = 0;
  for (let lvl = 2; lvl <= 100; lvl++) {
    const delta = progression.getXPForLevel(lvl) - progression.getXPForLevel(lvl - 1);
    assert.ok(delta > 0, `XP delta for level ${lvl} should be positive, got ${delta}`);
    // The delta should be monotonically non-decreasing for a sane XP curve
    assert.ok(delta >= prevDelta - 1, `XP delta for level ${lvl} (${delta}) decreased below previous (${prevDelta}). Curve should be monotonic.`);
    prevDelta = delta;
  }
});

test('XP needed for level 75->76 is achievable (not astronomical)', () => {
  // Sanity: should be < 100M XP. With current stacking multipliers it's ~220M (broken).
  const xpNeeded = progression.getXPForLevel(76) - progression.getXPForLevel(75);
  console.log(`        XP for L75->L76: ${xpNeeded.toLocaleString()}`);
  assert.ok(xpNeeded < 100_000_000, `XP for L75->L76 (${xpNeeded}) exceeds 100M sanity cap — milestone multipliers likely stacking`);
});

test('allocateStatPoint: soft cap reduces gains after 20 points in one stat', () => {
  const id = installFakeUser({ progression: { level: 50, statPoints: 100, xp: 0, gp: 0, totalGP: 0, commandsUsed: 0, allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, totalXPEarned: 0, totalLevelsGained: 0, achievements: [] } });
  // Allocate 25 points into ATK — first 20 should give full value, last 5 should give half.
  const result = progression.allocateStatPoint(id, 'atk', 25);
  assert.ok(result.success, 'allocation should succeed');
  // For FIGHTER (Starter, tier=1.0, mult=1.0): base atk gain = 3 per point
  // Expected: floor(3 × 1.0 × 20) + floor(3 × 1.0 × 0.5 × 5) = 60 + 7 = 67
  assert.strictEqual(result.valueGained, 67, `Expected 67 (20*3 + floor(5*1.5)), got ${result.valueGained}`);
});

test('allocateStatPoint: refuses when not enough points', () => {
  const id = installFakeUser({ progression: { level: 1, statPoints: 2, xp: 0, gp: 0, totalGP: 0, commandsUsed: 0, allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, totalXPEarned: 0, totalLevelsGained: 0, achievements: [] } });
  const result = progression.allocateStatPoint(id, 'atk', 5);
  assert.ok(!result.success, 'should refuse');
});

test('resetStats: refunds all spent points correctly', () => {
  const id = installFakeUser({ progression: { level: 1, statPoints: 0, xp: 0, gp: 0, totalGP: 0, commandsUsed: 0, allocatedStats: { hp: 0, atk: 30, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, allocatedStatPoints: { hp: 0, atk: 10, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }, totalXPEarned: 0, totalLevelsGained: 0, achievements: [] } });
  const result = progression.resetStats(id);
  assert.ok(result.success, 'reset should succeed');
  assert.strictEqual(result.pointsRefunded, 10, `expected 10 points refunded, got ${result.pointsRefunded}`);
});

test('addXP: levels up correctly and grants stat + skill points', () => {
  const id = installFakeUser();
  const result = progression.addXP(id, 100, 'test');
  // 100 XP takes user from L1 (0 XP) to L2 (80 XP) -> 20 XP left over
  assert.strictEqual(result.leveledUp, true, 'should level up');
  assert.strictEqual(result.newLevel, 2, `expected new level 2, got ${result.newLevel}`);
  assert.strictEqual(result.statPointsGained, 5, `expected 5 stat points, got ${result.statPointsGained}`);
});

console.log(`\n--- Progression: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
