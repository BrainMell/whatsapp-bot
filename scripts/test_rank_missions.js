// Tests for the rank mission system.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const classSystem = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/classSystem.js');
const economy = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/economy.js');

function installFakeUser(overrides = {}) {
  const id = 'test' + Math.floor(Math.random() * 100000) + '@s.whatsapp.net';
  const user = {
    userId: id,
    wallet: 5000,
    registered: true,
    nickname: 'Tester',
    class: 'FIGHTER',
    adventurerRank: 'D',
    questsCompleted: 30,
    questsWon: 10,
    pvpWins: 0,
    completedRankMissions: [],
    progression: {
      xp: 0, level: 25, gp: 0, totalGP: 0, statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [],
    },
    stats: { totalEarned: 5000, totalSpent: 0, questsWon: 10, bossesDefeated: 0, itemsCrafted: 0, itemsEquipped: 0, dragonsKilled: 0 },
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

console.log('\n=== Rank Mission System Tests ===\n');

test('RANK_MISSIONS has 4 missions', () => {
  assert.strictEqual(Object.keys(classSystem.RANK_MISSIONS).length, 4);
});

test('RANK_MISSION_GATES: D requires mission 1', () => {
  assert.strictEqual(classSystem.RANK_MISSION_GATES['D'], 1);
});

test('RANK_MISSION_GATES: F is free (null)', () => {
  assert.strictEqual(classSystem.RANK_MISSION_GATES['F'], null);
});

test('RANK_MISSION_GATES: C is free (null)', () => {
  assert.strictEqual(classSystem.RANK_MISSION_GATES['C'], null);
});

test('checkRankPromotionEligibility: F→E is free (no mission)', () => {
  const result = classSystem.checkRankPromotionEligibility('F', []);
  assert.strictEqual(result.canPromote, true);
  assert.strictEqual(result.blockedByMission, null);
});

test('checkRankPromotionEligibility: D→C blocked without mission 1', () => {
  const result = classSystem.checkRankPromotionEligibility('D', []);
  assert.strictEqual(result.canPromote, false);
  assert.strictEqual(result.blockedByMission, 1);
  assert.ok(result.mission);
  assert.strictEqual(result.mission.name, 'Trial of Combat');
});

test('checkRankPromotionEligibility: D→C allowed with mission 1 completed', () => {
  const result = classSystem.checkRankPromotionEligibility('D', [1]);
  assert.strictEqual(result.canPromote, true);
});

test('checkMissionProgress: incomplete when stats are low', () => {
  const result = classSystem.checkMissionProgress(1, { questsWon: 5, bossesDefeated: 2, pvpWins: 1 });
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.progress.length, 3);
  assert.strictEqual(result.progress[0].done, false); // 5/20 quests
});

test('checkMissionProgress: complete when all objectives met', () => {
  const result = classSystem.checkMissionProgress(1, { questsWon: 20, bossesDefeated: 5, pvpWins: 3 });
  assert.strictEqual(result.complete, true);
  assert.ok(result.progress.every(p => p.done));
});

test('getGateMissionForRank: D returns mission 1', () => {
  const mission = classSystem.getGateMissionForRank('D');
  assert.ok(mission);
  assert.strictEqual(mission.id, 1);
  assert.strictEqual(mission.name, 'Trial of Combat');
});

test('getGateMissionForRank: F returns null (free)', () => {
  assert.strictEqual(classSystem.getGateMissionForRank('F'), null);
});

test('getRankMissionStatus: D-rank player sees Trial of Combat', () => {
  const id = installFakeUser({ adventurerRank: 'D' });
  const status = economy.getRankMissionStatus(id);
  assert.ok(status.hasGate);
  assert.strictEqual(status.mission.name, 'Trial of Combat');
  assert.strictEqual(status.canClaim, false); // Not enough stats yet
});

test('getRankMissionStatus: F-rank player has no gate', () => {
  const id = installFakeUser({ adventurerRank: 'F' });
  const status = economy.getRankMissionStatus(id);
  assert.strictEqual(status.hasGate, false);
});

test('claimRankMission: fails when objectives not met', () => {
  const id = installFakeUser({ adventurerRank: 'D', stats: { questsWon: 5, bossesDefeated: 0, pvpWins: 0 } });
  const result = economy.claimRankMission(id);
  assert.strictEqual(result.success, false);
  assert.ok(result.message.includes('haven\'t completed'));
});

test('claimRankMission: succeeds when all objectives met', () => {
  const id = installFakeUser({
    adventurerRank: 'D',
    questsCompleted: 50,  // C-rank requires 50 quests
    pvpWins: 5,
    completedRankMissions: [],
    stats: { questsWon: 25, bossesDefeated: 6, pvpWins: 5, itemsCrafted: 0, itemsEquipped: 0, dragonsKilled: 0 },
    progression: { level: 30, xp: 0, gp: 0, totalGP: 0, statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [] },
  });
  const result = economy.claimRankMission(id);
  assert.strictEqual(result.success, true, `expected success, got: ${result.message}`);
  assert.ok(result.message.includes('MISSION COMPLETE'));

  const user = economy.getUser(id);
  assert.ok(user.completedRankMissions.includes(1), 'mission 1 should be in completedRankMissions');
  assert.strictEqual(user.adventurerRank, 'C', `should be C-rank, got ${user.adventurerRank}`);
});

test('claimRankMission: already completed returns error', () => {
  const id = installFakeUser({
    adventurerRank: 'D',
    completedRankMissions: [1],
    stats: { questsWon: 25, bossesDefeated: 6, pvpWins: 5 },
  });
  const result = economy.claimRankMission(id);
  assert.strictEqual(result.success, false);
  assert.ok(result.message.includes('already completed'));
});

test('trackMissionStat: increments stat correctly', () => {
  const id = installFakeUser({ stats: { questsWon: 5, bossesDefeated: 0 } });
  economy.trackMissionStat(id, 'bossesDefeated', 1);
  const user = economy.getUser(id);
  assert.strictEqual(user.stats.bossesDefeated, 1);
  economy.trackMissionStat(id, 'bossesDefeated', 1);
  const user2 = economy.getUser(id);
  assert.strictEqual(user2.stats.bossesDefeated, 2);
});

test('updateAdventurerRank: blocks promotion when mission not completed', () => {
  const id = installFakeUser({
    adventurerRank: 'D',
    questsCompleted: 50,
    completedRankMissions: [], // Mission 1 NOT completed
    progression: { level: 30, xp: 0, gp: 0, totalGP: 0, statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [] },
  });
  const result = economy.updateAdventurerRank(id);
  assert.strictEqual(result.ranked_up, false, 'should NOT rank up — mission not completed');
  assert.ok(result.blocked_by_mission, 'should have blocked_by_mission');
  // Rank should still be D
  const user = economy.getUser(id);
  assert.strictEqual(user.adventurerRank, 'D');
});

test('updateAdventurerRank: promotes when mission completed', () => {
  const id = installFakeUser({
    adventurerRank: 'D',
    questsCompleted: 50,
    completedRankMissions: [1], // Mission 1 completed
    progression: { level: 30, xp: 0, gp: 0, totalGP: 0, statPoints: 0,
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
      totalXPEarned: 0, totalLevelsGained: 0, achievements: [] },
  });
  const result = economy.updateAdventurerRank(id);
  assert.strictEqual(result.ranked_up, true, 'should rank up — mission completed');
  assert.strictEqual(result.new_rank, 'C');
});

test('existing players with no completedRankMissions field still work', () => {
  // Simulate an existing player who doesn't have the new field yet
  const id = installFakeUser({ adventurerRank: 'B', completedRankMissions: undefined });
  delete economy.getUser(id).completedRankMissions;
  // getUser should lazy-init the field
  const user = economy.getUser(id);
  assert.ok(user.completedRankMissions, 'should be initialized by lazy migration');
  assert.strictEqual(Array.isArray(user.completedRankMissions), true);
  // Rank should be preserved
  assert.strictEqual(user.adventurerRank, 'B');
});

console.log(`\n--- Rank Mission Tests: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
