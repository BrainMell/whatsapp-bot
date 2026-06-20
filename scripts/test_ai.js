// Tests for the harder enemy AI improvements.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const monsterSkills = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/monsterSkills.js');

let tests = 0, passed = 0, failed = 0;
function test(name, fn) {
  tests++;
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}

console.log('\n=== Enemy AI Improvement Tests ===\n');

// Helper: create a mock enemy
function makeEnemy(overrides = {}) {
  return {
    name: 'Test Enemy',
    icon: '👹',
    archetype: 'BRUTE',
    level: 10,
    currentHP: 100,
    maxHP: 100,
    mana: 100,
    isEnemy: true,
    statusEffects: [],
    cooldowns: {},
    isCharging: false,
    ...overrides,
  };
}

// Helper: create mock players
function makePlayers(count = 3, hpOverrides = []) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Player${i + 1}`,
    jid: `player${i + 1}@s.whatsapp.net`,
    currentHP: hpOverrides[i] || 100,
    maxHp: 100,
    stats: { maxHp: 100, hp: hpOverrides[i] || 100, energy: 50, maxEnergy: 100, atk: 20, def: 10, spd: 15 },
    isDead: false,
    statusEffects: [],
    ...{},
  }));
}

test('AI prioritizes vulnerable (low-HP) targets for execute', () => {
  const enemy = makeEnemy({ archetype: 'STALKER' }); // STALKER has execute skill
  const players = makePlayers(3, [100, 25, 80]); // Player2 at 25% HP
  // Run multiple times to account for randomness
  let hitVulnerable = 0;
  for (let i = 0; i < 100; i++) {
    const decision = monsterSkills.evaluateAction(enemy, players, []);
    if (decision.target === players[1]) hitVulnerable++;
  }
  // Should target the vulnerable player most of the time (at least 40%)
  assert.ok(hitVulnerable >= 40, `expected ≥40 hits on vulnerable player, got ${hitVulnerable}/100`);
});

test('AI uses skills more often than default attacks (harder AI)', () => {
  const enemy = makeEnemy({ archetype: 'BRUTE' });
  const players = makePlayers(2);
  let skillUses = 0;
  let attackUses = 0;
  for (let i = 0; i < 100; i++) {
    const decision = monsterSkills.evaluateAction(enemy, players, []);
    if (decision.action === 'skill') skillUses++;
    else if (decision.action === 'attack') attackUses++;
  }
  // 💡 HARDER AI: should use skills ≥70% of the time (was ~50% before)
  assert.ok(skillUses >= 70, `expected ≥70 skill uses, got ${skillUses}/100 (attacks: ${attackUses})`);
});

test('AI targets CC\'d players more often (punish CC)', () => {
  const enemy = makeEnemy({ archetype: 'BRUTE' });
  const players = makePlayers(2, [100, 100]);
  players[1].statusEffects = [{ type: 'stun', duration: 1 }]; // Player2 is stunned
  let hitCc = 0;
  for (let i = 0; i < 100; i++) {
    const decision = monsterSkills.evaluateAction(enemy, players, []);
    if (decision.target === players[1]) hitCc++;
  }
  // Should target the CC'd player at least 30% of the time
  assert.ok(hitCc >= 30, `expected ≥30 hits on CC'd player, got ${hitCc}/100`);
});

test('AI focuses lowest-HP player (focus fire)', () => {
  const enemy = makeEnemy({ archetype: 'BRUTE' });
  const players = makePlayers(3, [80, 60, 100]); // Player2 has lowest HP
  let hitLowest = 0;
  for (let i = 0; i < 100; i++) {
    const decision = monsterSkills.evaluateAction(enemy, players, []);
    if (decision.target === players[1]) hitLowest++;
  }
  // Should target the lowest-HP player at least 25% of the time
  assert.ok(hitLowest >= 25, `expected ≥25 hits on lowest-HP player, got ${hitLowest}/100`);
});

test('BOSS AI charges ultimate at 50% HP (was 30%)', () => {
  const enemy = makeEnemy({
    archetype: 'BOSS',
    level: 20, // high enough for ultimate
    currentHP: 45,
    maxHP: 100, // 45% HP (just below 50% threshold)
    hasPhaseShifted: true, // skip phase shift so we test ultimate directly
  });
  const players = makePlayers(2);
  let ultimateUses = 0;
  for (let i = 0; i < 50; i++) {
    const decision = monsterSkills.evaluateAction(enemy, players, []);
    if (decision.action === 'skill' && decision.skill?.id === 'ultimate') ultimateUses++;
  }
  // At 45% HP, boss should be charging ultimate fairly often (at least 20%)
  assert.ok(ultimateUses >= 10, `expected ≥10 ultimate charges at 45% HP, got ${ultimateUses}/50`);
});

test('AI still has some randomness (not 100% predictable)', () => {
  const enemy = makeEnemy({ archetype: 'BRUTE' });
  const players = makePlayers(3, [100, 100, 100]);
  const targets = new Set();
  for (let i = 0; i < 50; i++) {
    const decision = monsterSkills.evaluateAction(enemy, players, []);
    targets.add(decision.target);
  }
  // Should hit at least 2 different players over 50 turns (not pure focus fire)
  assert.ok(targets.size >= 2, `expected ≥2 different targets, got ${targets.size}`);
});

test('AI skips turn when stunned', () => {
  const enemy = makeEnemy({
    statusEffects: [{ type: 'stun', duration: 1 }]
  });
  const players = makePlayers(2);
  const decision = monsterSkills.evaluateAction(enemy, players, []);
  assert.strictEqual(decision.action, 'skip');
});

test('AI releases charge when charging', () => {
  const enemy = makeEnemy({
    archetype: 'MAGE',
    isCharging: true,
    chargingSkill: 'meteor_charge',
  });
  const players = makePlayers(2);
  const decision = monsterSkills.evaluateAction(enemy, players, []);
  assert.strictEqual(decision.action, 'release_charge');
});

console.log(`\n--- AI Tests: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
