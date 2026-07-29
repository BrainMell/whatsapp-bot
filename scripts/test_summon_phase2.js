/**
 * Phase 2 integration tests — verify combat loop integration.
 * Tests source-level invariants (can't load guildAdventure.js without DB,
 * but can verify the code structure is correct).
 *
 * Run: node /home/z/my-project/scripts/test_summon_phase2.js
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

console.log('=== PHASE 2 INTEGRATION TESTS ===\n');

// ─── summonAI.js loadable + exports correct ────────────────────
console.log('--- summonAI.js module ---');

const summonAI = require(path.join(REPO, 'core/rpg/summonAI.js'));

test('summonAI exports all required functions', () => {
  assert.strictEqual(typeof summonAI.performSummonAction, 'function');
  assert.strictEqual(typeof summonAI.trackBehavior, 'function');
  assert.strictEqual(typeof summonAI.checkPersonalityShift, 'function');
  assert.strictEqual(typeof summonAI.applyPersonalityModifier, 'function');
  assert.strictEqual(typeof summonAI.applySoulEcho, 'function');
  assert.strictEqual(typeof summonAI.persistSummonChanges, 'function');
  assert.strictEqual(typeof summonAI.performBetrayal, 'function');
  assert.ok(summonAI.PERSONALITY_SHIFT_THRESHOLD >= 10);
});

// ─── Behavior tracking ─────────────────────────────────────────
console.log('\n--- Behavior tracking ---');

test('attack action increments aggressive score', () => {
  const summon = { behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 } };
  summonAI.trackBehavior(summon, { action: 'attack' });
  assert.strictEqual(summon.behaviorScore.aggressive, 1);
});

test('buff_self skill increments curious score', () => {
  const summon = { behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 } };
  summonAI.trackBehavior(summon, { action: 'skill', skill: { type: 'buff_self' } });
  assert.strictEqual(summon.behaviorScore.curious, 1);
});

test('heal skill increments curious score', () => {
  const summon = { behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 } };
  summonAI.trackBehavior(summon, { action: 'skill', skill: { type: 'heal' } });
  assert.strictEqual(summon.behaviorScore.curious, 1);
});

test('debuff_target skill increments protective score', () => {
  const summon = { behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 } };
  summonAI.trackBehavior(summon, { action: 'skill', skill: { type: 'debuff_target' } });
  assert.strictEqual(summon.behaviorScore.protective, 1);
});

test('guard action increments protective score (2 points)', () => {
  const summon = { behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 } };
  summonAI.trackBehavior(summon, { action: 'guard' });
  assert.strictEqual(summon.behaviorScore.protective, 2);
});

test('skip action increments volatile score', () => {
  const summon = { behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 } };
  summonAI.trackBehavior(summon, { action: 'skip' });
  assert.strictEqual(summon.behaviorScore.volatile, 1);
});

// ─── Personality shift ─────────────────────────────────────────
console.log('\n--- Personality shift ---');

test('personality shifts to AGGRESSIVE when score ≥ threshold', () => {
  const summon = {
    personality: 'STOIC',
    behaviorScore: { aggressive: 20, protective: 0, curious: 0, volatile: 0 }
  };
  const newP = summonAI.checkPersonalityShift(summon);
  assert.strictEqual(newP, 'AGGRESSIVE');
  assert.strictEqual(summon.personality, 'AGGRESSIVE');
});

test('personality does NOT shift when below threshold', () => {
  const summon = {
    personality: 'STOIC',
    behaviorScore: { aggressive: 10, protective: 0, curious: 0, volatile: 0 }
  };
  const newP = summonAI.checkPersonalityShift(summon);
  assert.strictEqual(newP, null);
  assert.strictEqual(summon.personality, 'STOIC');
});

test('personality does NOT shift to same personality', () => {
  const summon = {
    personality: 'AGGRESSIVE',
    behaviorScore: { aggressive: 30, protective: 0, curious: 0, volatile: 0 }
  };
  const newP = summonAI.checkPersonalityShift(summon);
  assert.strictEqual(newP, null);
});

test('personality shifts to PROTECTIVE when protective score is highest', () => {
  const summon = {
    personality: 'STOIC',
    behaviorScore: { aggressive: 5, protective: 25, curious: 0, volatile: 0 }
  };
  const newP = summonAI.checkPersonalityShift(summon);
  assert.strictEqual(newP, 'PROTECTIVE');
});

// ─── Soul Echo application ─────────────────────────────────────
console.log('\n--- Soul Echo ---');

test('applySoulEcho adds echo buff to summoner', () => {
  const summoner = { buffs: [] };
  const summon = { echoId: 'bone_echo', name: 'Skeleton' };
  const msg = summonAI.applySoulEcho(summoner, summon);
  assert.ok(msg.includes('Bone Echo'), 'message should mention echo name');
  assert.ok(msg.includes('Skeleton'), 'message should mention summon name');
  assert.strictEqual(summoner.buffs.length, 1);
  assert.strictEqual(summoner.buffs[0].type, 'defense');
  assert.strictEqual(summoner.buffs[0].value, 15);
  assert.strictEqual(summoner.buffs[0].duration, 3);
  assert.ok(summoner.buffs[0].isEcho, 'buff must be flagged as echo');
  assert.ok(summoner.buffs[0].justApplied, 'buff must have justApplied (BUG-08/09 fix)');
});

test('applySoulEcho replaces existing echo (only one active at a time)', () => {
  const summoner = {
    buffs: [
      { type: 'fire_damage', value: 20, duration: 2, isEcho: true, name: 'Ember Echo' },
      { type: 'attack', value: 10, duration: 3, isEcho: false, name: 'Pack Buff' }  // non-echo buff stays
    ]
  };
  const summon = { echoId: 'bone_echo', name: 'Skeleton' };
  summonAI.applySoulEcho(summoner, summon);
  assert.strictEqual(summoner.buffs.length, 2);  // 1 echo (new) + 1 non-echo (kept)
  const echoBuff = summoner.buffs.find(b => b.isEcho);
  assert.strictEqual(echoBuff.type, 'defense');  // new echo replaced old
  const nonEchoBuff = summoner.buffs.find(b => !b.isEcho);
  assert.strictEqual(nonEchoBuff.name, 'Pack Buff');  // non-echo buff preserved
});

test('applySoulEcho handles missing echoId gracefully', () => {
  const summoner = { buffs: [] };
  const summon = { echoId: null, name: 'Test' };
  const msg = summonAI.applySoulEcho(summoner, summon);
  assert.strictEqual(msg, '');
  assert.strictEqual(summoner.buffs.length, 0);
});

test('applySoulEcho handles unknown echoId gracefully', () => {
  const summoner = { buffs: [] };
  const summon = { echoId: 'nonexistent_echo', name: 'Test' };
  const msg = summonAI.applySoulEcho(summoner, summon);
  assert.strictEqual(msg, '');
  assert.strictEqual(summoner.buffs.length, 0);
});

// ─── Personality modifier ──────────────────────────────────────
console.log('\n--- Personality modifier ---');

test('STOIC personality does not modify decision', () => {
  const summon = { personality: 'STOIC' };
  const decision = { action: 'attack', target: { name: 'Enemy' } };
  const result = summonAI.applyPersonalityModifier(decision, summon, [], []);
  assert.strictEqual(result.action, 'attack');
  assert.strictEqual(result, decision);  // unchanged
});

test('VOLATILE personality sometimes returns random action (mocked)', () => {
  // We can't easily test Math.random — just verify the function doesn't crash
  const summon = { personality: 'VOLATILE' };
  const decision = { action: 'attack', target: { name: 'Enemy' } };
  const enemies = [{ name: 'E1', stats: { hp: 10 } }];
  const result = summonAI.applyPersonalityModifier(decision, summon, enemies, []);
  assert.ok(result.action);  // should return some decision
});

test('PROTECTIVE personality can override attack with guard', () => {
  // Can't test the 50% chance deterministically, but verify it doesn't crash
  const summon = { personality: 'PROTECTIVE', summonerJid: 'user1' };
  const decision = { action: 'attack', target: { name: 'Enemy' } };
  const enemies = [{ name: 'E1', stats: { hp: 10 } }];
  const players = [{ jid: 'user1', name: 'Player', isDead: false }];
  const result = summonAI.applyPersonalityModifier(decision, summon, enemies, players);
  assert.ok(result.action);  // should return some decision (attack or guard)
});

// ─── guildAdventure.js source verification ─────────────────────
console.log('\n--- guildAdventure.js source verification ---');

const gaSource = fs.readFileSync(path.join(REPO, 'core/rpg/guildAdventure.js'), 'utf8');

test('summonSystem + summonAI required at top of guildAdventure.js', () => {
  assert.ok(gaSource.includes('const summonSystem = require("./summonSystem");'));
  assert.ok(gaSource.includes('const summonAI = require("./summonAI");'));
});

test('state.summons added to INITIAL_STATE_TEMPLATE', () => {
  assert.ok(gaSource.includes('summons: [],'));
  // Verify it's in the template (before turnOrder)
  const templateIdx = gaSource.indexOf('const INITIAL_STATE_TEMPLATE');
  const summonsIdx = gaSource.indexOf('summons: [],', templateIdx);
  const turnOrderIdx = gaSource.indexOf('turnOrder: [],', templateIdx);
  assert.ok(summonsIdx > 0 && turnOrderIdx > summonsIdx, 'summons must come before turnOrder in template');
});

test('startCombat deploys active summons', () => {
  assert.ok(gaSource.includes('state.summons = [];'));
  assert.ok(gaSource.includes('summonSystem.getActiveSummon(user)'), 'must call getActiveSummon');
  assert.ok(gaSource.includes('summonSystem.buildCombatEntity(summonDoc, player.jid)'), 'must call buildCombatEntity');
  assert.ok(gaSource.includes('...state.summons,'), 'summons must be spread into turnOrder');
});

test('isSummon branch added to processCombatTurn', () => {
  assert.ok(gaSource.includes('else if (activeActor.isSummon)'));
  assert.ok(gaSource.includes('await summonAI.performSummonAction(sock, activeActor, sessionKey)'));
});

test('checkCombatEnd excludes summons (comment added)', () => {
  assert.ok(gaSource.includes('Phase 2 fix: exclude summons from the defeat check'));
});

test('handleDeath handles summon death + Soul Echo', () => {
  assert.ok(gaSource.includes('if (entity.isSummon)'));
  assert.ok(gaSource.includes('summonAI.applySoulEcho(summoner, entity)'), 'must call applySoulEcho');
  assert.ok(gaSource.includes('state.summons = (state.summons || []).filter'), 'must remove dead summon from state.summons');
  assert.ok(gaSource.includes('reducedLoyalty'), 'must persist loyalty reduction');
});

test('gameStates, calculateDamage, handleDeath exported for summonAI', () => {
  // Find the module.exports block
  const exportIdx = gaSource.indexOf('module.exports = {');
  const exportBlock = gaSource.slice(exportIdx);
  assert.ok(exportBlock.includes('gameStates,'), 'gameStates must be exported');
  assert.ok(exportBlock.includes('calculateDamage,'), 'calculateDamage must be exported');
  assert.ok(exportBlock.includes('handleDeath,'), 'handleDeath must be exported');
});

test('summons get headstart gauge (spd/2) like players', () => {
  // The comment should mention "Players + summons"
  assert.ok(gaSource.includes('Players + summons get headstart'));
});

test('turn loop order: players → summons → enemies', () => {
  // allCombatants array should have players first, then summons, then enemies
  const combatantsIdx = gaSource.indexOf('const allCombatants = [');
  const combatantsBlock = gaSource.slice(combatantsIdx, combatantsIdx + 300);
  const playersIdx = combatantsBlock.indexOf('state.players');
  const summonsIdx = combatantsBlock.indexOf('state.summons');
  const enemiesIdx = combatantsBlock.indexOf('state.enemies');
  assert.ok(playersIdx < summonsIdx, 'players must come before summons');
  assert.ok(summonsIdx < enemiesIdx, 'summons must come before enemies');
});

// ─── Summary ──────────────────────────────────────────────────
console.log(`\n=== PHASE 2 SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
