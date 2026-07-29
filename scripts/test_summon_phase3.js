/**
 * Phase 3 unit tests — Necromancer capture pipeline.
 * Run: node scripts/test_summon_phase3.js
 */

const assert = require('assert');
const path = require('path');

const REPO = '/home/z/my-project/repos/whatsapp-bot';
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log('=== PHASE 3 UNIT TESTS ===\n');

// ─── summonCapture module ──────────────────────────────────────
console.log('--- summonCapture module ---');

const summonCapture = require(path.join(REPO, 'core/rpg/summonCapture.js'));

test('summonCapture exports all required functions', () => {
  assert.strictEqual(typeof summonCapture.setCaptureWindow, 'function');
  assert.strictEqual(typeof summonCapture.tickCaptureWindows, 'function');
  assert.strictEqual(typeof summonCapture.getCaptureWindow, 'function');
  assert.strictEqual(typeof summonCapture.attemptCapture, 'function');
  assert.strictEqual(typeof summonCapture.getNecromancerSummonBonus, 'function');
  assert.strictEqual(typeof summonCapture.applyClassSummonBonus, 'function');
  assert.strictEqual(typeof summonCapture.getTamingProgress, 'function');
  assert.strictEqual(typeof summonCapture.getTamedSpecies, 'function');
});

test('ENEMY_TO_SPECIES_MAP has 20+ mappings', () => {
  const count = Object.keys(summonCapture.ENEMY_TO_SPECIES_MAP).length;
  assert.ok(count >= 20, `expected ≥20 enemy→species mappings, got ${count}`);
});

test('CAPTURE_CONFIG has correct values', () => {
  const cfg = summonCapture.CAPTURE_CONFIG;
  assert.strictEqual(cfg.BASE_CAPTURE_CHANCE, 0.20);
  assert.strictEqual(cfg.CAPTURE_BONUS_PER_SUMMON_LEVEL, 0.05);
  assert.strictEqual(cfg.MAX_CAPTURE_CHANCE, 0.50);
  assert.strictEqual(cfg.TAMING_THRESHOLD, 10);
  assert.strictEqual(cfg.TAMING_STAT_BONUS, 0.20);
  assert.strictEqual(cfg.CAPTURE_WINDOW_TURNS, 3);
  assert.ok(cfg.BOSS_CAPTURE_IMMUNE_RANKS.includes('S'));
  assert.ok(cfg.BOSS_CAPTURE_IMMUNE_RANKS.includes('SSS'));
});

// ─── Capture window management ─────────────────────────────────
console.log('\n--- Capture window ---');

test('setCaptureWindow creates a window with correct values', () => {
  const state = {};
  summonCapture.setCaptureWindow(state, 'user1@jid', 5);
  assert.ok(state.captureWindows);
  assert.ok(state.captureWindows['user1@jid']);
  assert.strictEqual(state.captureWindows['user1@jid'].turnsRemaining, 3);
  // Base 20% + 5 × 5% = 45%
  assert.strictEqual(state.captureWindows['user1@jid'].captureChance, 0.45);
});

test('setCaptureWindow caps at MAX_CAPTURE_CHANCE (50%)', () => {
  const state = {};
  summonCapture.setCaptureWindow(state, 'user1@jid', 10);  // 20% + 10×5% = 70% → capped at 50%
  assert.strictEqual(state.captureWindows['user1@jid'].captureChance, 0.50);
});

test('getCaptureWindow returns null when no window', () => {
  const state = {};
  assert.strictEqual(summonCapture.getCaptureWindow(state, 'user1@jid'), null);
});

test('getCaptureWindow returns window when set', () => {
  const state = {};
  summonCapture.setCaptureWindow(state, 'user1@jid', 1);
  const window = summonCapture.getCaptureWindow(state, 'user1@jid');
  assert.ok(window);
  assert.strictEqual(window.turnsRemaining, 3);
});

test('tickCaptureWindows decrements turnsRemaining', () => {
  const state = {};
  summonCapture.setCaptureWindow(state, 'user1@jid', 1);
  assert.strictEqual(state.captureWindows['user1@jid'].turnsRemaining, 3);
  summonCapture.tickCaptureWindows(state);
  assert.strictEqual(state.captureWindows['user1@jid'].turnsRemaining, 2);
  summonCapture.tickCaptureWindows(state);
  assert.strictEqual(state.captureWindows['user1@jid'].turnsRemaining, 1);
  summonCapture.tickCaptureWindows(state);
  assert.strictEqual(state.captureWindows['user1@jid'], undefined);  // expired
});

test('tickCaptureWindows handles empty state', () => {
  assert.doesNotThrow(() => summonCapture.tickCaptureWindows({}));
  assert.doesNotThrow(() => summonCapture.tickCaptureWindows(null));
});

// ─── Necromancer bonus ─────────────────────────────────────────
console.log('\n--- Necromancer bonus ---');

test('getNecromancerSummonBonus returns +30% for NECROMANCER', () => {
  const bonus = summonCapture.getNecromancerSummonBonus('NECROMANCER');
  assert.ok(bonus);
  assert.strictEqual(bonus.bonus, 0.30);
  assert.strictEqual(bonus.element, 'undead');
});

test('getNecromancerSummonBonus returns +40% for LICH', () => {
  const bonus = summonCapture.getNecromancerSummonBonus('LICH');
  assert.ok(bonus);
  assert.strictEqual(bonus.bonus, 0.40);
  assert.strictEqual(bonus.element, 'undead');
});

test('getNecromancerSummonBonus returns null for non-necro class', () => {
  assert.strictEqual(summonCapture.getNecromancerSummonBonus('FIGHTER'), null);
  assert.strictEqual(summonCapture.getNecromancerSummonBonus('MAGE'), null);
  assert.strictEqual(summonCapture.getNecromancerSummonBonus(''), null);
});

test('applyClassSummonBonus boosts undead summon for Necromancer', () => {
  const entity = {
    element: 'undead',
    stats: { hp: 100, maxHp: 100, atk: 20, def: 10, mag: 5, spd: 8 },
    currentHP: 100,
    maxHP: 100
  };
  summonCapture.applyClassSummonBonus(entity, 'NECROMANCER');
  // +30% = 1.3× multiplier
  assert.strictEqual(entity.stats.hp, Math.floor(100 * 1.3));  // 130
  assert.strictEqual(entity.stats.atk, Math.floor(20 * 1.3));  // 26
  assert.strictEqual(entity.currentHP, entity.stats.hp);
});

test('applyClassSummonBonus does NOT boost non-undead summon', () => {
  const entity = {
    element: 'fire',  // not undead
    stats: { hp: 100, maxHp: 100, atk: 20, def: 10, mag: 5, spd: 8 },
    currentHP: 100,
    maxHP: 100
  };
  summonCapture.applyClassSummonBonus(entity, 'NECROMANCER');
  assert.strictEqual(entity.stats.hp, 100);  // unchanged
  assert.strictEqual(entity.stats.atk, 20);
});

test('applyClassSummonBonus does NOT boost undead for non-necro class', () => {
  const entity = {
    element: 'undead',
    stats: { hp: 100, maxHp: 100, atk: 20, def: 10, mag: 5, spd: 8 },
    currentHP: 100,
    maxHP: 100
  };
  summonCapture.applyClassSummonBonus(entity, 'FIGHTER');
  assert.strictEqual(entity.stats.hp, 100);  // unchanged
});

test('applyClassSummonBonus handles null entity', () => {
  assert.doesNotThrow(() => summonCapture.applyClassSummonBonus(null, 'NECROMANCER'));
});

// ─── Taming progress ───────────────────────────────────────────
console.log('\n--- Taming progress ---');

test('getTamingProgress returns 0 for new user', () => {
  const user = { tamingProgress: {} };
  const progress = summonCapture.getTamingProgress(user, 'FLAME');
  assert.strictEqual(progress.count, 0);
  assert.strictEqual(progress.tamed, false);
  assert.strictEqual(progress.remaining, 10);
});

test('getTamingProgress returns correct values for partial progress', () => {
  const user = { tamingProgress: { FLAME: 5 } };
  const progress = summonCapture.getTamingProgress(user, 'FLAME');
  assert.strictEqual(progress.count, 5);
  assert.strictEqual(progress.tamed, false);
  assert.strictEqual(progress.remaining, 5);
});

test('getTamingProgress returns tamed=true at threshold', () => {
  const user = { tamingProgress: { FLAME: 10 } };
  const progress = summonCapture.getTamingProgress(user, 'FLAME');
  assert.strictEqual(progress.count, 10);
  assert.strictEqual(progress.tamed, true);
  assert.strictEqual(progress.remaining, 0);
});

test('getTamedSpecies returns only tamed species', () => {
  const user = { tamingProgress: { FLAME: 10, FROST_GHOUL: 3, VOID_SEEKER: 15 } };
  const tamed = summonCapture.getTamedSpecies(user);
  assert.strictEqual(tamed.length, 2);  // FLAME + VOID_SEEKER
  const flameTamed = tamed.find(t => t.enemyType === 'FLAME');
  assert.ok(flameTamed);
  assert.strictEqual(flameTamed.speciesId, 'flame_elemental');
});

test('getTamedSpecies handles empty progress', () => {
  assert.strictEqual(summonCapture.getTamedSpecies({}).length, 0);
  assert.strictEqual(summonCapture.getTamedSpecies(null).length, 0);
});

// ─── Enemy → species mapping ───────────────────────────────────
console.log('\n--- Enemy → species mapping ---');

test('undead enemies map to undead summon species', () => {
  assert.strictEqual(summonCapture.ENEMY_TO_SPECIES_MAP.FROST_GHOUL, 'skeleton');
  assert.strictEqual(summonCapture.ENEMY_TO_SPECIES_MAP.BLIZZARD_WRAITH, 'lich_minion');
});

test('fire enemies map to flame_elemental', () => {
  assert.strictEqual(summonCapture.ENEMY_TO_SPECIES_MAP.FLAME, 'flame_elemental');
  assert.strictEqual(summonCapture.ENEMY_TO_SPECIES_MAP.MAGMA_BRUTE, 'flame_elemental');
});

test('dragon enemies map to wyrmling', () => {
  assert.strictEqual(summonCapture.ENEMY_TO_SPECIES_MAP.FIRE_BREATHER, 'wyrmling');
});

test('construct enemies map to turret species', () => {
  assert.strictEqual(summonCapture.ENEMY_TO_SPECIES_MAP.CRYSTAL_CORRUPTED, 'turret_mk1');
  assert.strictEqual(summonCapture.ENEMY_TO_SPECIES_MAP.GOLEM_KING, 'cannon_turret');
});

test('all mapped species exist in registry', () => {
  const registry = require(path.join(REPO, 'core/rpg/summonRegistry.js'));
  for (const [enemyType, speciesId] of Object.entries(summonCapture.ENEMY_TO_SPECIES_MAP)) {
    const species = registry.getSpecies(speciesId);
    assert.ok(species, `enemy ${enemyType} maps to ${speciesId} but species doesn't exist`);
  }
});

// ─── classSystem.js verification ───────────────────────────────
console.log('\n--- classSystem.js Necromancer passive ---');

const fs = require('fs');
const classSource = fs.readFileSync(path.join(REPO, 'core/rpg/classSystem.js'), 'utf8');

test('Necromancer passive effect changed to summon_buff', () => {
  // Find the NECROMANCER block — use a larger window because the comment
  // I added pushed the passive line further down.
  const necroIdx = classSource.indexOf("NECROMANCER: {");
  assert.ok(necroIdx > 0);
  const necroBlock = classSource.slice(necroIdx, necroIdx + 1200);
  assert.ok(necroBlock.includes("effect: 'summon_buff'"), 'must use summon_buff effect');
  assert.ok(!necroBlock.includes("effect: 'magic_damage'"), 'must NOT use magic_damage anymore');
});

test('Necromancer passive value is 30 (matches +30% description)', () => {
  const necroIdx = classSource.indexOf("NECROMANCER: {");
  const necroBlock = classSource.slice(necroIdx, necroIdx + 1200);
  assert.ok(necroBlock.includes("value: 30"), 'value must be 30');
});

test('Necromancer passive description mentions Army of the Dead', () => {
  const necroIdx = classSource.indexOf("NECROMANCER: {");
  const necroBlock = classSource.slice(necroIdx, necroIdx + 1200);
  assert.ok(necroBlock.includes("Army of the Dead"), 'description should mention the capture ult');
});

// ─── guildAdventure.js verification ─────────────────────────────
console.log('\n--- guildAdventure.js capture integration ---');

const gaSource = fs.readFileSync(path.join(REPO, 'core/rpg/guildAdventure.js'), 'utf8');

test('summonCapture required at top of guildAdventure.js', () => {
  assert.ok(gaSource.includes('const summonCapture = require("./summonCapture");'));
});

test('captureWindows in INITIAL_STATE_TEMPLATE', () => {
  assert.ok(gaSource.includes('captureWindows: {},'));
});

test('army_of_dead triggers capture window in summon effect handler', () => {
  assert.ok(gaSource.includes("isArmyOfDead"));
  assert.ok(gaSource.includes("summonCapture.setCaptureWindow(state, player.jid"));
  assert.ok(gaSource.includes("Army of the Dead active"));
});

test('recordEnemyKill calls attemptCapture', () => {
  assert.ok(gaSource.includes('summonCapture.getCaptureWindow(state, p.jid)'));
  assert.ok(gaSource.includes('summonCapture.attemptCapture(state, entity, p.jid)'));
});

test('capture windows ticked in processCombatTurn', () => {
  assert.ok(gaSource.includes('summonCapture.tickCaptureWindows(state)'));
});

// ─── User.js verification ──────────────────────────────────────
console.log('\n--- User.js tamingProgress ---');

const userSource = fs.readFileSync(path.join(REPO, 'core/models/User.js'), 'utf8');

test('tamingProgress field added to User schema', () => {
  assert.ok(userSource.includes('tamingProgress:'));
  assert.ok(userSource.includes('type: Map, of: Number'));
});

test('economy.js lazy migration includes tamingProgress', () => {
  const econSource = fs.readFileSync(path.join(REPO, 'core/rpg/economy.js'), 'utf8');
  // Should appear in both getUser and getOrCreateUser
  const count = (econSource.match(/if \(!user\.tamingProgress\) user\.tamingProgress = \{\};/g) || []).length;
  assert.ok(count >= 2, `expected ≥2 lazy migration sites, got ${count}`);
});

// ─── Summary ──────────────────────────────────────────────────
console.log(`\n=== PHASE 3 SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
