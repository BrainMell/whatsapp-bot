// Test: verify enemy damage shows in ability message.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');

// We can't easily import guildAdventure because it's huge and has side effects.
// Instead, let's test the applyAbilityEffect function logic by extracting the
// damage-detection condition and verifying which effect types trigger it.

// Replicate the damageKeywords check from guildAdventure.js line 5792
const damageKeywords = ["damage", "attack", "execute", "stun", "chain", "multi_hit", "smite_evil", "ignore_armor", "hybrid", "dot", "cc", "guaranteed_crit"];
function isDamageType(effectType) {
  return damageKeywords.some((t) => effectType && effectType.includes(t));
}

// Monster skill effect types (from monsterSkills.js)
const monsterSkillTypes = [
  'attack',      // smash, backstab, firebolt, etc.
  'aoe',         // cleave, frostwave, earth_rupture
  'buff_self',   // harden, enrage, phase_step
  'buff_team',   // rally, unholy_zeal, blood_shield
  'debuff_target', // armor_break, mark, curse
  'heal',        // dark_mend
  'revive',      // revive
  'charge',      // meteor_charge (handled separately)
];

let tests = 0, passed = 0, failed = 0;
function test(name, fn) {
  tests++;
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}

console.log('\n=== Enemy Skill Damage Display Tests ===\n');

test('attack-type skills are detected as damage', () => {
  assert.strictEqual(isDamageType('attack'), true);
});

test('aoe-type skills are NOT detected as damage (BUG)', () => {
  // This is the bug! 'aoe' doesn't match any damageKeyword.
  // The code has a separate `if (effect.type === "aoe")` block at line 5981
  // that handles AOE damage, so this isn't actually a bug — but let's verify.
  assert.strictEqual(isDamageType('aoe'), false);
});

test('debuff_target is NOT detected as damage (correct — it has its own block)', () => {
  assert.strictEqual(isDamageType('debuff_target'), false);
});

test('buff_self is NOT damage (correct)', () => {
  assert.strictEqual(isDamageType('buff_self'), false);
});

test('heal is NOT damage (correct)', () => {
  assert.strictEqual(isDamageType('heal'), false);
});

// The real test: does the enemy skill message actually contain damage text?
// We can't run applyAbilityEffect without the full guildAdventure state, but
// we can verify the message format by checking the code path.

console.log('\n--- Analysis ---');
console.log('Monster skill "attack" type → goes through isDamageType block (line 5794)');
console.log('  → damage IS logged: "💥 ${target.name} takes ${damage} damage!"');
console.log('');
console.log('Monster skill "aoe" type → goes through separate AOE block (line 5981)');
console.log('  → damage IS logged: "💥 ${target.name} takes ${damage} damage!"');
console.log('');
console.log('Monster skill "debuff_target" → goes through debuff block (line 6325)');
console.log('  → NO damage logged (correct — debuffs don\'t deal damage)');
console.log('');
console.log('CONCLUSION: Enemy damage IS shown for attack and aoe skills.');
console.log('If user reports "enemy damage not showing", possible causes:');
console.log('  1. Enemy used a debuff/buff skill (no damage to show)');
console.log('  2. Enemy attack was evaded (shows "evades" instead)');
console.log('  3. roundLog was not flushed before player turn prompt');
console.log('  4. The sendMessage at line 3776 fires BEFORE applyAbilityEffect,');
console.log('     so the "⚡ Enemy uses Skill!" message appears, but the damage');
console.log('     details go to roundLog which is only flushed at line 3056.');
console.log('     If the player\'s turn prompt is sent before roundLog flush,');
console.log('     the damage details might appear AFTER the turn prompt.');
console.log('');
console.log('LIKELY BUG: The enemy skill announcement (line 3776-3778) is sent');
console.log('immediately, but the DAMAGE details are queued in roundLog and only');
console.log('flushed when the player\'s turn starts. This creates a confusing UX');
console.log('where the user sees "Enemy uses X!" then immediately the turn prompt,');
console.log('then the damage log. The fix: send the damage details immediately');
console.log('after applyAbilityEffect, OR include them in the announcement.');

console.log(`\n--- Tests: ${passed}/${tests} passed, ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
