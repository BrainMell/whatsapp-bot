/**
 * Phase 5 unit tests — Soul Forging + Summon Trials + Achievements + Loot eggs.
 * Run: node scripts/test_summon_phase5.js
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

console.log('=== PHASE 5 UNIT TESTS ===\n');

// ─── Soul Forging ──────────────────────────────────────────────
console.log('--- Soul Forging ---');

const summonForging = require(path.join(REPO, 'core/rpg/summonForging.js'));

test('summonForging exports all required functions', () => {
  assert.strictEqual(typeof summonForging.forgeSummons, 'function');
  assert.strictEqual(typeof summonForging.validateForgeable, 'function');
  assert.strictEqual(typeof summonForging.determineFusedSpecies, 'function');
  assert.strictEqual(typeof summonForging.computeFusedStats, 'function');
  assert.strictEqual(typeof summonForging.buildLineage, 'function');
  assert.strictEqual(typeof summonForging.analyzeLineage, 'function');
  assert.strictEqual(typeof summonForging.rollMutations, 'function');
  assert.strictEqual(typeof summonForging.applyMutations, 'function');
});

test('FORGE_CONFIG has correct values', () => {
  assert.strictEqual(summonForging.FORGE_CONFIG.STAT_BONUS_MULT, 1.10);
  assert.strictEqual(summonForging.FORGE_CONFIG.MAX_MUTATIONS, 3);
  assert.strictEqual(summonForging.FORGE_CONFIG.SOULBOUND_DURATION_DAYS, 7);
  assert.ok(summonForging.FORGE_CONFIG.COOLDOWN_MS >= 86400000);  // ≥ 24h
  assert.strictEqual(summonForging.FORGE_CONFIG.MAX_LINEAGE_GENERATIONS, 5);
  assert.strictEqual(summonForging.FORGE_CONFIG.PUREBRED_THRESHOLD, 3);
  assert.strictEqual(summonForging.FORGE_CONFIG.PUREBRED_BONUS, 0.10);
  assert.strictEqual(summonForging.FORGE_CONFIG.CROSSBRED_BONUS, 0.05);
});

test('10+ mutations defined', () => {
  assert.ok(summonForging.MUTATIONS.length >= 10);
});

test('determineFusedSpecies returns same species when both parents are same', () => {
  const s1 = { species: 'skeleton', level: 10 };
  const s2 = { species: 'skeleton', level: 15 };
  assert.strictEqual(summonForging.determineFusedSpecies(s1, s2), 'skeleton');
});

test('determineFusedSpecies returns higher-level parent species when different', () => {
  const s1 = { species: 'skeleton', level: 10, baseStats: {} };
  const s2 = { species: 'wolf', level: 20, baseStats: {} };
  assert.strictEqual(summonForging.determineFusedSpecies(s1, s2), 'wolf');
});

test('computeFusedStats averages parents and applies 10% bonus', () => {
  const s1 = { baseStats: { hp: 100, atk: 20, def: 10, mag: 5, spd: 8 } };
  const s2 = { baseStats: { hp: 120, atk: 30, def: 8, mag: 10, spd: 12 } };
  const fused = summonForging.computeFusedStats(s1, s2);
  // hp: (100+120)/2 × 1.10 = 121
  assert.strictEqual(fused.hp, Math.floor(((100 + 120) / 2) * 1.10));
  assert.strictEqual(fused.atk, Math.floor(((20 + 30) / 2) * 1.10));
});

test('buildLineage creates ancestry from both parents', () => {
  const s1 = {
    summonId: 'sum1', species: 'skeleton', level: 10, personality: 'STOIC',
    lineage: [{ summonId: 'grandparent', species: 'skeleton', level: 5, personality: 'AGGRESSIVE' }]
  };
  const s2 = {
    summonId: 'sum2', species: 'wolf', level: 15, personality: 'CURIOUS',
    lineage: []
  };
  const lineage = summonForging.buildLineage(s1, s2);
  assert.ok(lineage.length >= 2);  // at least both parents
  assert.ok(lineage.some(l => l.summonId === 'sum1'));
  assert.ok(lineage.some(l => l.summonId === 'sum2'));
});

test('analyzeLineage detects purebred (3+ same species)', () => {
  const lineage = [
    { species: 'skeleton' }, { species: 'skeleton' }, { species: 'skeleton' }
  ];
  const result = summonForging.analyzeLineage(lineage, 'skeleton');
  assert.ok(result.isPurebred);
});

test('analyzeLineage detects crossbred (3+ distinct species)', () => {
  const lineage = [
    { species: 'skeleton' }, { species: 'wolf' }, { species: 'flame_elemental' }
  ];
  const result = summonForging.analyzeLineage(lineage, 'skeleton');
  assert.ok(result.isCrossbred);
});

test('rollMutations returns 0 to maxCount mutations', () => {
  const mutations = summonForging.rollMutations(3);
  assert.ok(mutations.length >= 0 && mutations.length <= 3);
});

test('rollMutations returns no duplicates', () => {
  for (let i = 0; i < 20; i++) {
    const mutations = summonForging.rollMutations(3);
    const ids = mutations.map(m => m.id);
    assert.strictEqual(ids.length, new Set(ids).size, 'no duplicate mutations');
  }
});

test('applyMutations modifies stats correctly', () => {
  const stats = { hp: 100, atk: 20, def: 10, mag: 5, spd: 8 };
  const mutations = [{ stat: 'atk', bonus: 0.20 }];
  summonForging.applyMutations(stats, mutations);
  assert.strictEqual(stats.atk, Math.floor(20 * 1.20));  // 24
});

test('applyMutations handles penalty mutations', () => {
  const stats = { hp: 100, atk: 20, def: 10, mag: 5, spd: 8 };
  const mutations = [{ stat: 'atk', bonus: 0.20, penalty: { stat: 'def', mult: 0.10 } }];
  summonForging.applyMutations(stats, mutations);
  assert.strictEqual(stats.atk, Math.floor(20 * 1.20));  // 24
  assert.strictEqual(stats.def, Math.floor(10 * 0.90));  // 9
});

test('validateForgeable rejects forSale summons', () => {
  const s1 = { forSale: true, isLocked: false, loyalty: 100, soulboundUntil: null };
  const s2 = { forSale: false, isLocked: false, loyalty: 100, soulboundUntil: null };
  const user = { activeSummonId: null };
  const result = summonForging.validateForgeable(s1, s2, user);
  assert.ok(!result.success);
});

test('validateForgeable rejects active summon', () => {
  const s1 = { forSale: false, isLocked: false, loyalty: 100, soulboundUntil: null, summonId: 'sum1' };
  const s2 = { forSale: false, isLocked: false, loyalty: 100, soulboundUntil: null, summonId: 'sum2' };
  const user = { activeSummonId: 'sum1' };
  const result = summonForging.validateForgeable(s1, s2, user);
  assert.ok(!result.success);
});

test('validateForgeable rejects zero-loyalty summon', () => {
  const s1 = { forSale: false, isLocked: false, loyalty: 0, soulboundUntil: null };
  const s2 = { forSale: false, isLocked: false, loyalty: 100, soulboundUntil: null };
  const user = { activeSummonId: null };
  const result = summonForging.validateForgeable(s1, s2, user);
  assert.ok(!result.success);
});

// ─── Summon Trials ─────────────────────────────────────────────
console.log('\n--- Summon Trials ---');

const summonTrials = require(path.join(REPO, 'core/rpg/summonTrials.js'));

test('summonTrials exports all required functions', () => {
  assert.strictEqual(typeof summonTrials.attemptTrial, 'function');
  assert.strictEqual(typeof summonTrials.getTrial, 'function');
  assert.strictEqual(typeof summonTrials.getPassive, 'function');
  assert.strictEqual(typeof summonTrials.getAllTrials, 'function');
  assert.strictEqual(typeof summonTrials.getActivePlayerPassives, 'function');
  assert.strictEqual(typeof summonTrials.computePassiveBonuses, 'function');
});

test('14 trial definitions exist (one per species)', () => {
  const count = Object.keys(summonTrials.TRIAL_DEFINITIONS).length;
  assert.ok(count >= 14, `expected ≥14 trials, got ${count}`);
});

test('14 player passives defined', () => {
  const count = Object.keys(summonTrials.PLAYER_PASSIVES).length;
  assert.ok(count >= 14, `expected ≥14 passives, got ${count}`);
});

test('every trial has a valid rewardPassive', () => {
  for (const [speciesId, trial] of Object.entries(summonTrials.TRIAL_DEFINITIONS)) {
    const passive = summonTrials.getPassive(trial.rewardPassive);
    assert.ok(passive, `trial ${speciesId} has rewardPassive ${trial.rewardPassive} but no passive exists`);
  }
});

test('every trial has bossId + requiredSummonLevel', () => {
  for (const [speciesId, trial] of Object.entries(summonTrials.TRIAL_DEFINITIONS)) {
    assert.ok(trial.bossId, `${speciesId} trial must have bossId`);
    assert.ok(trial.requiredSummonLevel > 0, `${speciesId} trial must have requiredSummonLevel > 0`);
    assert.ok(trial.rewardEvolution, `${speciesId} trial must have rewardEvolution`);
  }
});

test('getTrial returns null for unknown species', () => {
  assert.strictEqual(summonTrials.getTrial('nonexistent'), null);
});

test('getActivePlayerPassives returns empty for new user', () => {
  const user = { unlockedSummonPassives: [] };
  assert.strictEqual(summonTrials.getActivePlayerPassives(user).length, 0);
});

test('computePassiveBonuses returns empty when no summons', () => {
  const user = { unlockedSummonPassives: ['bone_armor_passive'] };
  assert.strictEqual(Object.keys(summonTrials.computePassiveBonuses(user, [])).length, 0);
});

test('computePassiveBonuses aggregates matching passives', () => {
  const user = { unlockedSummonPassives: ['bone_armor_passive', 'pack_leader_passive'] };
  const summons = [
    { element: 'undead', loyalty: 100, forSale: false },
    { element: 'beast', loyalty: 100, forSale: false }
  ];
  const bonuses = summonTrials.computePassiveBonuses(user, summons);
  // bone_armor gives +5 def, pack_leader gives +5 spd
  assert.strictEqual(bonuses.def, 5);
  assert.strictEqual(bonuses.spd, 5);
});

test('computePassiveBonuses skips passives whose condition is not met', () => {
  const user = { unlockedSummonPassives: ['bone_armor_passive'] };
  const summons = [{ element: 'fire', loyalty: 100, forSale: false }];  // no undead
  const bonuses = summonTrials.computePassiveBonuses(user, summons);
  assert.strictEqual(Object.keys(bonuses).length, 0);  // condition not met
});

// ─── Achievements ──────────────────────────────────────────────
console.log('\n--- Achievements ---');

const summonAchievements = require(path.join(REPO, 'core/rpg/summonAchievements.js'));

test('20 summon achievements defined', () => {
  const count = Object.keys(summonAchievements.SUMMON_ACHIEVEMENTS).length;
  assert.ok(count >= 20, `expected ≥20 achievements, got ${count}`);
});

test('every achievement has id, name, icon, desc, check, reward', () => {
  for (const [id, ach] of Object.entries(summonAchievements.SUMMON_ACHIEVEMENTS)) {
    assert.strictEqual(ach.id, id, `${id} must have matching id`);
    assert.ok(ach.name, `${id} must have name`);
    assert.ok(ach.icon, `${id} must have icon`);
    assert.ok(ach.desc, `${id} must have desc`);
    assert.strictEqual(typeof ach.check, 'function', `${id} must have check function`);
    assert.ok(ach.reward, `${id} must have reward`);
  }
});

test('first_capture achievement checks summonStats.captured >= 1', () => {
  const ach = summonAchievements.SUMMON_ACHIEVEMENTS.first_capture;
  assert.ok(ach.check({ summonStats: { captured: 1 } }));
  assert.ok(!ach.check({ summonStats: { captured: 0 } }));
});

test('beast_tamer achievement checks captured >= 10', () => {
  const ach = summonAchievements.SUMMON_ACHIEVEMENTS.beast_tamer;
  assert.ok(ach.check({ summonStats: { captured: 10 } }));
  assert.ok(!ach.check({ summonStats: { captured: 9 } }));
});

test('menagerie achievement checks 10+ summons', () => {
  const ach = summonAchievements.SUMMON_ACHIEVEMENTS.menagerie;
  const summons10 = new Array(10).fill({ loyalty: 100 });
  const summons9 = new Array(9).fill({ loyalty: 100 });
  assert.ok(ach.check({}, summons10));
  assert.ok(!ach.check({}, summons9));
});

test('resonance_web achievement checks 5+ active resonances', () => {
  const ach = summonAchievements.SUMMON_ACHIEVEMENTS.resonance_web;
  assert.ok(ach.check({ activeResonances: ['a', 'b', 'c', 'd', 'e'] }));
  assert.ok(!ach.check({ activeResonances: ['a', 'b', 'c', 'd'] }));
});

test('legion achievement checks for legion resonance', () => {
  const ach = summonAchievements.SUMMON_ACHIEVEMENTS.legion;
  assert.ok(ach.check({ activeResonances: ['legion', 'pack'] }));
  assert.ok(!ach.check({ activeResonances: ['pack'] }));
});

test('applyReward handles stat_bonus type', () => {
  const user = { statBonuses: { mag: 10 } };
  summonAchievements.applyReward(user, { type: 'stat_bonus', stat: 'mag', value: 5 });
  assert.strictEqual(user.statBonuses.mag, 15);
});

test('applyReward handles summon_slots type', () => {
  const user = { summonSlots: 3 };
  summonAchievements.applyReward(user, { type: 'summon_slots', value: 1 });
  assert.strictEqual(user.summonSlots, 4);
});

test('getAchievementDisplay returns all with unlocked flag', () => {
  const user = { summonAchievements: ['first_capture'] };
  const display = summonAchievements.getAchievementDisplay(user);
  assert.ok(display.length >= 20);
  const firstCapture = display.find(a => a.id === 'first_capture');
  assert.ok(firstCapture.unlocked);
  const beastTamer = display.find(a => a.id === 'beast_tamer');
  assert.ok(!beastTamer.unlocked);
});

// ─── Loot egg drops ────────────────────────────────────────────
console.log('\n--- Loot egg drops ---');

const lootSystem = require(path.join(REPO, 'core/rpg/lootSystem.js'));

test('LICH boss drops summon eggs', () => {
  const drops = lootSystem.BOSS_DROPS.LICH;
  assert.ok(drops, 'LICH must have boss drops');
  const eggDrops = drops.special.filter(d => d.id.startsWith('summon_egg_'));
  assert.ok(eggDrops.length >= 2, `expected ≥2 egg drops, got ${eggDrops.length}`);
});

test('DRAGON boss drops wyrmling egg', () => {
  const drops = lootSystem.BOSS_DROPS.DRAGON;
  const eggDrops = drops.special.filter(d => d.id.startsWith('summon_egg_'));
  assert.ok(eggDrops.some(d => d.id === 'summon_egg_wyrmling'));
});

test('ABYSSAL_GOD boss drops void_walker egg', () => {
  const drops = lootSystem.BOSS_DROPS.ABYSSAL_GOD;
  const eggDrops = drops.special.filter(d => d.id.startsWith('summon_egg_'));
  assert.ok(eggDrops.some(d => d.id === 'summon_egg_void_walker'));
});

test('all egg drops have announcements', () => {
  for (const [bossName, drops] of Object.entries(lootSystem.BOSS_DROPS)) {
    const eggDrops = drops.special.filter(d => d.id && d.id.startsWith('summon_egg_'));
    for (const egg of eggDrops) {
      assert.ok(egg.announcement, `egg ${egg.id} from ${bossName} must have announcement`);
    }
  }
});

// ─── Command wiring ────────────────────────────────────────────
console.log('\n--- Command wiring ---');

const cmdSource = fs.readFileSync(path.join(REPO, 'core/commands/summonCommands.js'), 'utf8');

test('forge command implemented', () => {
  assert.ok(cmdSource.includes('async function cmdForge('));
  assert.ok(cmdSource.includes("case 'forge':"));
});

test('trial command implemented', () => {
  assert.ok(cmdSource.includes('async function cmdTrial('));
  assert.ok(cmdSource.includes("case 'trial':"));
});

test('passives command implemented', () => {
  assert.ok(cmdSource.includes('async function cmdPassives('));
  assert.ok(cmdSource.includes("case 'passives':"));
});

test('help command includes forge + trial + passives', () => {
  assert.ok(cmdSource.includes('summon forge'));
  assert.ok(cmdSource.includes('summon trial'));
  assert.ok(cmdSource.includes('summon passives'));
});

// ─── User.js + economy.js ──────────────────────────────────────
console.log('\n--- User.js + economy.js ---');

const userSource = fs.readFileSync(path.join(REPO, 'core/models/User.js'), 'utf8');
const econSource = fs.readFileSync(path.join(REPO, 'core/rpg/economy.js'), 'utf8');

test('lastForgedAt field on User schema', () => {
  assert.ok(userSource.includes('lastForgedAt:'));
});

test('summonAchievements field on User schema', () => {
  assert.ok(userSource.includes('summonAchievements:'));
});

test('economy.js lazy migration includes lastForgedAt + summonAchievements', () => {
  assert.ok(econSource.includes('user.lastForgedAt === undefined'));
  assert.ok(econSource.includes('user.summonAchievements'));
});

// ─── Summary ──────────────────────────────────────────────────
console.log(`\n=== PHASE 5 SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
