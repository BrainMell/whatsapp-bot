/**
 * Phase 1 unit tests — verify summon registry + system logic work correctly.
 * Run: node /home/z/my-project/scripts/test_summon_phase1.js
 */

const assert = require('assert');
const path = require('path');

const REPO = '/home/z/my-project/repos/whatsapp-bot';
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log('=== PHASE 1 UNIT TESTS ===\n');

// ─── Registry tests ────────────────────────────────────────────
console.log('--- Registry ---');

const registry = require(path.join(REPO, 'core/rpg/summonRegistry.js'));

test('14 summon species defined', () => {
  const count = registry.getAllSpecies().length;
  assert.ok(count >= 14, `expected ≥14 species, got ${count}`);
  assert.ok(registry.getSpecies('skeleton'), 'skeleton must exist');
  assert.ok(registry.getSpecies('wyrmling'), 'wyrmling must exist');
  assert.ok(registry.getSpecies('turret_mk1'), 'turret_mk1 must exist');
});

test('every species has an echoId that exists in SUMMON_ECHOES', () => {
  for (const [speciesId, species] of Object.entries(registry.SUMMON_SPECIES)) {
    const echo = registry.getEcho(species.echoId);
    assert.ok(echo, `species ${speciesId} has echoId ${species.echoId} but no echo exists`);
    assert.ok(echo.buff, `echo ${species.echoId} must have a buff`);
    assert.ok(echo.buff.duration > 0, `echo ${species.echoId} duration must be > 0`);
  }
});

test('every species has evolutionStages array (2+ stages)', () => {
  for (const [speciesId, species] of Object.entries(registry.SUMMON_SPECIES)) {
    assert.ok(Array.isArray(species.evolutionStages), `${speciesId} must have evolutionStages array`);
    assert.ok(species.evolutionStages.length >= 2, `${speciesId} must have ≥2 evolution stages, got ${species.evolutionStages.length}`);
  }
});

test('every species has archetype from monsterSkills set', () => {
  const validArchetypes = ['BRUTE', 'MAGE', 'TANK', 'STALKER', 'SUPPORT', 'BOSS', 'SPELLBREAKER', 'PHALANX', 'NEMESIS', 'BERSERKER_MOB', 'VOID_WALKER', 'COLOSSUS'];
  for (const [speciesId, species] of Object.entries(registry.SUMMON_SPECIES)) {
    assert.ok(validArchetypes.includes(species.archetype), `${speciesId} archetype ${species.archetype} not in valid set`);
  }
});

test('5 personalities defined', () => {
  const personalities = Object.keys(registry.PERSONALITY_MODIFIERS);
  assert.strictEqual(personalities.length, 5);
  assert.ok(personalities.includes('STOIC'));
  assert.ok(personalities.includes('AGGRESSIVE'));
  assert.ok(personalities.includes('PROTECTIVE'));
  assert.ok(personalities.includes('CURIOUS'));
  assert.ok(personalities.includes('VOLATILE'));
});

test('10+ resonances defined', () => {
  const count = registry.getAllResonances().length;
  assert.ok(count >= 10, `expected ≥10 resonances, got ${count}`);
});

test('resonance requires are valid element counts', () => {
  const validElements = ['fire', 'ice', 'lightning', 'undead', 'demon', 'beast', 'construct', 'dragon', 'neutral'];
  for (const [resId, res] of Object.entries(registry.RESONANCE_WEB)) {
    for (const el of Object.keys(res.requires)) {
      assert.ok(validElements.includes(el), `resonance ${resId} requires invalid element: ${el}`);
    }
  }
});

test('6 rarity tiers with increasing maxLevel', () => {
  const rarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
  let prevMax = 0;
  for (const r of rarities) {
    const cfg = registry.getRarityConfig(r);
    assert.ok(cfg.maxLevel >= prevMax, `${r} maxLevel ${cfg.maxLevel} should be ≥ ${prevMax}`);
    prevMax = cfg.maxLevel;
  }
  assert.strictEqual(registry.getRarityConfig('MYTHIC').maxLevel, 50);
  assert.strictEqual(registry.getRarityConfig('COMMON').runeSlots, 0);
  assert.strictEqual(registry.getRarityConfig('EPIC').runeSlots, 3);
});

test('XP curve is monotonic', () => {
  let prev = 0;
  for (let lvl = 1; lvl <= 50; lvl++) {
    const xp = registry.getSummonXPForLevel(lvl);
    assert.ok(xp >= prev, `level ${lvl} XP ${xp} should be ≥ ${prev}`);
    prev = xp;
  }
});

test('evolution stage index correct', () => {
  assert.strictEqual(registry.getEvolutionStageIndex('BASE'), 0);
  assert.strictEqual(registry.getEvolutionStageIndex('ASCENDED'), 1);
  assert.strictEqual(registry.getEvolutionStageIndex('TRANSCENDENT'), 2);
});

test('getEvolvedSpeciesId returns correct stage', () => {
  // skeleton → skeleton_knight (ASCENDED) → skeleton_king (TRANSCENDENT)
  assert.strictEqual(registry.getEvolvedSpeciesId('skeleton', 'BASE'), 'skeleton');
  assert.strictEqual(registry.getEvolvedSpeciesId('skeleton', 'ASCENDED'), 'skeleton_knight');
  assert.strictEqual(registry.getEvolvedSpeciesId('skeleton', 'TRANSCENDENT'), 'skeleton_king');
});

// ─── System tests (no DB — test pure functions) ────────────────
console.log('\n--- System (pure functions) ---');

const summonSystem = require(path.join(REPO, 'core/rpg/summonSystem.js'));

test('computeEffectiveStats returns valid stats for a basic summon', () => {
  const mockSummon = {
    species: 'skeleton',
    archetype: 'BRUTE',
    element: 'undead',
    tier: 'BASE',
    rarity: 'COMMON',
    level: 1,
    baseStats: { hp: 80, atk: 15, def: 5, mag: 5, spd: 8 },
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    loyalty: 100
  };
  const stats = summonSystem.computeEffectiveStats(mockSummon);
  assert.strictEqual(stats.hp, 80);
  assert.strictEqual(stats.atk, 15);
  assert.strictEqual(stats.maxHp, 80);
  assert.ok(stats.energy === 100);
  assert.ok(stats.crit >= 5);
});

test('loyalty gates effective stats (50% loyalty = 85% stats)', () => {
  const mockSummon = {
    species: 'skeleton',
    tier: 'BASE',
    rarity: 'COMMON',
    level: 1,
    baseStats: { hp: 100, atk: 20, def: 10, mag: 5, spd: 8 },
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    loyalty: 50
  };
  const stats = summonSystem.computeEffectiveStats(mockSummon);
  // 50% loyalty = 0.85 multiplier
  assert.strictEqual(stats.hp, Math.floor(100 * 0.85));
  assert.strictEqual(stats.atk, Math.floor(20 * 0.85));
});

test('loyalty 0 = refuses to fight (0 stats)', () => {
  const mockSummon = {
    species: 'skeleton',
    tier: 'BASE',
    rarity: 'COMMON',
    level: 1,
    baseStats: { hp: 100, atk: 20, def: 10, mag: 5, spd: 8 },
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    loyalty: 0
  };
  const stats = summonSystem.computeEffectiveStats(mockSummon);
  assert.strictEqual(stats.hp, 0);
  assert.strictEqual(stats.atk, 0);
});

test('ASCENDED tier = 1.2× stats', () => {
  const mockSummon = {
    species: 'skeleton',
    tier: 'ASCENDED',
    rarity: 'COMMON',
    level: 1,
    baseStats: { hp: 100, atk: 20, def: 10, mag: 5, spd: 8 },
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    loyalty: 100
  };
  const stats = summonSystem.computeEffectiveStats(mockSummon);
  assert.strictEqual(stats.hp, Math.floor(100 * 1.2));
});

test('allocated stats add to effective stats', () => {
  const mockSummon = {
    species: 'skeleton',
    tier: 'BASE',
    rarity: 'COMMON',
    level: 1,
    baseStats: { hp: 80, atk: 15, def: 5, mag: 5, spd: 8 },
    allocatedStats: { hp: 5, atk: 5, def: 0, mag: 0, spd: 0 },  // 5 points each
    loyalty: 100
  };
  const stats = summonSystem.computeEffectiveStats(mockSummon);
  // hp: 80 + 5×15 = 155, atk: 15 + 5×3 = 30
  assert.strictEqual(stats.hp, 155);
  assert.strictEqual(stats.atk, 30);
});

test('soft cap reduces stat gain after 15 points', () => {
  const mockSummon = {
    species: 'skeleton',
    tier: 'BASE',
    rarity: 'COMMON',
    level: 1,
    baseStats: { hp: 80, atk: 15, def: 5, mag: 5, spd: 8 },
    allocatedStats: { hp: 20, atk: 0, def: 0, mag: 0, spd: 0 },  // 20 points (5 over cap)
    loyalty: 100
  };
  const stats = summonSystem.computeEffectiveStats(mockSummon);
  // hp: 80 + (15×15 + 5×15×0.5) = 80 + 225 + 37.5 = 342.5 → floor 342
  assert.strictEqual(stats.hp, 342);
});

test('addSummonXP levels up and grants stat points', () => {
  const mockSummon = {
    species: 'skeleton',
    tier: 'BASE',
    rarity: 'COMMON',
    level: 1,
    xp: 0,
    statPoints: 0,  // 💡 must initialize — += on undefined produces NaN
    baseStats: { hp: 80, atk: 15, def: 5, mag: 5, spd: 8 },
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    loyalty: 100
  };
  // Level 2 needs 100 XP
  const result = summonSystem.addSummonXP(mockSummon, 100);
  assert.ok(result.leveledUp, 'should level up');
  assert.strictEqual(result.newLevel, 2);
  assert.strictEqual(result.statPointsGained, 3);
  assert.strictEqual(mockSummon.statPoints, 3);
});

test('addSummonXP caps at rarity max level', () => {
  const mockSummon = {
    species: 'skeleton',
    tier: 'BASE',
    rarity: 'COMMON',  // maxLevel 30
    level: 30,
    xp: 0,
    baseStats: { hp: 80, atk: 15, def: 5, mag: 5, spd: 8 },
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    loyalty: 100
  };
  const result = summonSystem.addSummonXP(mockSummon, 99999);
  assert.ok(!result.leveledUp, 'should NOT level up past max');
  assert.strictEqual(mockSummon.level, 30);
  assert.strictEqual(mockSummon.xp, 0);  // capped
});

test('loyalty decay applies correctly', () => {
  const mockSummon = { loyalty: 100 };
  const lost = summonSystem.applyLoyaltyDecay(mockSummon);
  assert.strictEqual(lost, 2);
  assert.strictEqual(mockSummon.loyalty, 98);
});

test('loyalty decay with VOLATILE_PACT trait = 2× loss', () => {
  const mockSummon = { loyalty: 100 };
  const lost = summonSystem.applyLoyaltyDecay(mockSummon, 'VOLATILE_PACT');
  assert.strictEqual(lost, 4);  // 2 × 2.0
  assert.strictEqual(mockSummon.loyalty, 96);
});

test('loyalty restore caps at 100', () => {
  const mockSummon = { loyalty: 95 };
  summonSystem.restoreLoyalty(mockSummon, 20);
  assert.strictEqual(mockSummon.loyalty, 100);
});

test('allocateStatPoint deducts points and adds to stat', () => {
  const mockSummon = {
    statPoints: 5,
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 }
  };
  const result = summonSystem.allocateStatPoint(mockSummon, 'atk', 2);
  assert.ok(result.success);
  assert.strictEqual(mockSummon.statPoints, 3);
  assert.strictEqual(mockSummon.allocatedStats.atk, 2);
});

test('allocateStatPoint rejects invalid stat', () => {
  const mockSummon = {
    statPoints: 5,
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 }
  };
  const result = summonSystem.allocateStatPoint(mockSummon, 'invalid', 1);
  assert.ok(!result.success);
});

test('allocateStatPoint rejects insufficient points', () => {
  const mockSummon = {
    statPoints: 1,
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 }
  };
  const result = summonSystem.allocateStatPoint(mockSummon, 'atk', 5);
  assert.ok(!result.success);
});

// ─── Resonance tests ──────────────────────────────────────────
console.log('\n--- Resonance Computation ---');

test('legion resonance activates with 3 undead', () => {
  const summons = [
    { element: 'undead', loyalty: 100, forSale: false },
    { element: 'undead', loyalty: 100, forSale: false },
    { element: 'undead', loyalty: 100, forSale: false }
  ];
  const resonances = summonSystem.computeResonances(summons);
  assert.ok(resonances.includes('legion'), 'legion should be active');
});

test('legion resonance does NOT activate with only 2 undead', () => {
  const summons = [
    { element: 'undead', loyalty: 100, forSale: false },
    { element: 'undead', loyalty: 100, forSale: false }
  ];
  const resonances = summonSystem.computeResonances(summons);
  assert.ok(!resonances.includes('legion'), 'legion should NOT be active');
});

test('forSale summons do not count toward resonances', () => {
  const summons = [
    { element: 'undead', loyalty: 100, forSale: true },   // listed — doesn't count
    { element: 'undead', loyalty: 100, forSale: false },
    { element: 'undead', loyalty: 100, forSale: false },
    { element: 'undead', loyalty: 100, forSale: false }
  ];
  const resonances = summonSystem.computeResonances(summons);
  assert.ok(resonances.includes('legion'), 'legion should be active (3 eligible)');
});

test('zero-loyalty summons do not count toward resonances', () => {
  const summons = [
    { element: 'undead', loyalty: 0, forSale: false },     // depleted — doesn't count
    { element: 'undead', loyalty: 100, forSale: false },
    { element: 'undead', loyalty: 100, forSale: false }
  ];
  const resonances = summonSystem.computeResonances(summons);
  assert.ok(!resonances.includes('legion'), 'legion should NOT be active (only 2 eligible)');
});

test('steam resonance activates with fire + ice', () => {
  const summons = [
    { element: 'fire', loyalty: 100, forSale: false },
    { element: 'ice', loyalty: 100, forSale: false }
  ];
  const resonances = summonSystem.computeResonances(summons);
  assert.ok(resonances.includes('steam'), 'steam should be active');
});

test('conclave resonance activates with fire + ice + lightning', () => {
  const summons = [
    { element: 'fire', loyalty: 100, forSale: false },
    { element: 'ice', loyalty: 100, forSale: false },
    { element: 'lightning', loyalty: 100, forSale: false }
  ];
  const resonances = summonSystem.computeResonances(summons);
  assert.ok(resonances.includes('conclave'), 'conclave should be active');
  assert.ok(resonances.includes('steam'), 'steam should also be active');
  assert.ok(resonances.includes('stormfront'), 'stormfront should also be active');
});

// ─── Combat entity builder tests ──────────────────────────────
console.log('\n--- Combat Entity Builder ---');

test('buildCombatEntity produces valid combat entity', () => {
  const mockSummon = {
    summonId: 'sum_test_123',
    species: 'skeleton',
    archetype: 'BRUTE',
    element: 'undead',
    tier: 'BASE',
    rarity: 'COMMON',
    level: 5,
    baseStats: { hp: 100, atk: 20, def: 8, mag: 5, spd: 10 },
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    loyalty: 100,
    personality: 'STOIC',
    behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 },
    echoId: 'bone_echo',
    nickname: null
  };
  const entity = summonSystem.buildCombatEntity(mockSummon, 'user@jid');
  assert.ok(entity);
  assert.strictEqual(entity.id, 'sum_test_123');
  assert.strictEqual(entity.name, 'Skeleton');  // from registry species name
  assert.ok(entity.isSummon);
  assert.ok(!entity.isEnemy);
  assert.strictEqual(entity.summonerJid, 'user@jid');
  assert.strictEqual(entity.personality, 'STOIC');
  assert.strictEqual(entity.echoId, 'bone_echo');
  assert.ok(entity.stats.hp > 0);
  assert.ok(entity.stats.maxHp > 0);
  assert.strictEqual(entity.stats.hp, entity.stats.maxHp);  // start at full HP
  assert.strictEqual(entity.actionGauge, Math.floor(10 / 2));  // spd/2
});

test('buildCombatEntity uses nickname if set', () => {
  const mockSummon = {
    summonId: 'sum_test_456',
    species: 'wyrmling',
    archetype: 'STALKER',
    element: 'dragon',
    tier: 'BASE',
    rarity: 'RARE',
    level: 10,
    baseStats: { hp: 150, atk: 30, def: 12, mag: 20, spd: 16 },
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    loyalty: 100,
    personality: 'AGGRESSIVE',
    behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 },
    echoId: 'wyrm_echo',
    nickname: 'Sparky'
  };
  const entity = summonSystem.buildCombatEntity(mockSummon, 'user@jid');
  assert.strictEqual(entity.name, 'Sparky');  // nickname overrides species name
});

test('buildCombatEntity turret has isStationary + autoAttack', () => {
  const mockSummon = {
    summonId: 'sum_turret_1',
    species: 'turret_mk1',
    archetype: 'MAGE',
    element: 'construct',
    tier: 'BASE',
    rarity: 'COMMON',
    level: 1,
    baseStats: { hp: 60, atk: 16, def: 8, mag: 12, spd: 10 },
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    loyalty: 100,
    personality: 'STOIC',
    behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 },
    echoId: 'shrapnel_echo',
    nickname: null
  };
  const entity = summonSystem.buildCombatEntity(mockSummon, 'user@jid');
  assert.ok(entity.isStationary, 'turret should be stationary');
  assert.ok(entity.autoAttack, 'turret should autoAttack');
});

// ─── Summary ──────────────────────────────────────────────────
console.log(`\n=== PHASE 1 SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
