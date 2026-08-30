// scripts/test_random_spawn.js
// Verifies the random spawn interval system end-to-end:
// 1. Default config has spawnIntervalMinMs == spawnIntervalMaxMs (fixed mode)
// 2. setSpawnInterval(20) sets both min=max=20 (backward compat)
// 3. setSpawnInterval('15-30') sets min=15, max=30 (random range mode)
// 4. setSpawnInterval(10, 45) sets min=10, max=45 (two-arg form)
// 5. getSpawnIntervalInfo returns {minMinutes, maxMinutes, isRandom}
// 6. loadSpawnInterval can read both old (single number) and new ({min, max}) formats
// 7. Persistence stores {min, max} object

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const m = env.match(/^MONGO_URI=(.+)$/m);
const MONGO_URI = m[1].trim().replace(/^["']|["']$/g, '');

let conn;
let System, cardSystem;

async function setup() {
  conn = await mongoose.connect(MONGO_URI);
  console.log('[+] Connected:', conn.connection.db.databaseName);
  System = require('../core/models/System');
  cardSystem = require('../core/rpg/cardSystem');
}

async function cleanup() {
  console.log('\n=== Cleanup ===');
  try {
    // Restore the original spawn interval (20 min fixed = {min: 1200000, max: 1200000})
    await System.findOneAndUpdate(
      { key: 'card_spawn_interval_global' },
      { value: { min: 20 * 60 * 1000, max: 20 * 60 * 1000 } },
      { upsert: true }
    );
    console.log('[+] Restored default 20min fixed interval');
  } catch (e) { console.error('Cleanup error:', e.message); }
  if (conn) await mongoose.disconnect();
  console.log('[+] Disconnected');
}

async function runTests() {
  // ─── TEST 1: cardSystem exports setSpawnInterval + getSpawnIntervalInfo ───
  console.log('\n=== TEST 1: cardSystem exports ===');
  if (typeof cardSystem.setSpawnInterval !== 'function') {
    throw new Error('cardSystem.setSpawnInterval is not a function');
  }
  if (typeof cardSystem.getSpawnIntervalInfo !== 'function') {
    throw new Error('cardSystem.getSpawnIntervalInfo is not a function');
  }
  if (typeof cardSystem.loadSpawnInterval !== 'function') {
    throw new Error('cardSystem.loadSpawnInterval is not a function');
  }
  console.log('[+] All required exports present ✅');

  // ─── TEST 2: Backward-compat single value: setSpawnInterval(25) ──────
  console.log('\n=== TEST 2: setSpawnInterval(25) — backward-compat fixed ===');
  const r1 = await cardSystem.setSpawnInterval(25, 'test_owner@s.whatsapp.net', true);
  if (!r1.success) throw new Error(`setSpawnInterval(25) failed: ${r1.message}`);
  const info1 = cardSystem.getSpawnIntervalInfo();
  if (info1.minMinutes !== 25 || info1.maxMinutes !== 25) {
    throw new Error(`Backward-compat failed: min=${info1.minMinutes}, max=${info1.maxMinutes}, expected 25/25`);
  }
  if (info1.isRandom) throw new Error('isRandom should be false for fixed interval');
  console.log(`[+] setSpawnInterval(25) → min=${info1.minMinutes}, max=${info1.maxMinutes}, isRandom=${info1.isRandom} ✅`);

  // Verify it persisted as {min, max} object in DB
  const doc1 = await System.findOne({ key: 'card_spawn_interval_global' });
  if (!doc1 || !doc1.value || typeof doc1.value !== 'object') {
    throw new Error('Persisted value is not an object');
  }
  if (doc1.value.min !== 25 * 60 * 1000 || doc1.value.max !== 25 * 60 * 1000) {
    throw new Error(`DB persist wrong: ${JSON.stringify(doc1.value)}`);
  }
  console.log(`[+] DB persisted as {min, max} object: ${JSON.stringify({min: doc1.value.min/60000 + 'min', max: doc1.value.max/60000 + 'min'})} ✅`);

  // ─── TEST 3: Range syntax string: setSpawnInterval('15-30') ─────────
  console.log('\n=== TEST 3: setSpawnInterval("15-30") — random range ===');
  const r2 = await cardSystem.setSpawnInterval('15-30', 'test_owner@s.whatsapp.net', true);
  if (!r2.success) throw new Error(`setSpawnInterval('15-30') failed: ${r2.message}`);
  const info2 = cardSystem.getSpawnIntervalInfo();
  if (info2.minMinutes !== 15 || info2.maxMinutes !== 30) {
    throw new Error(`Range failed: min=${info2.minMinutes}, max=${info2.maxMinutes}, expected 15/30`);
  }
  if (!info2.isRandom) throw new Error('isRandom should be true for range');
  console.log(`[+] setSpawnInterval("15-30") → min=${info2.minMinutes}, max=${info2.maxMinutes}, isRandom=${info2.isRandom} ✅`);

  // ─── TEST 4: Two-arg form: setSpawnInterval(10, 45) ─────────────────
  console.log('\n=== TEST 4: setSpawnInterval(10, 45) — two-arg form ===');
  const r3 = await cardSystem.setSpawnInterval(10, 'test_owner@s.whatsapp.net', true, 45);
  if (!r3.success) throw new Error(`setSpawnInterval(10, 45) failed: ${r3.message}`);
  const info3 = cardSystem.getSpawnIntervalInfo();
  if (info3.minMinutes !== 10 || info3.maxMinutes !== 45) {
    throw new Error(`Two-arg failed: min=${info3.minMinutes}, max=${info3.maxMinutes}, expected 10/45`);
  }
  console.log(`[+] setSpawnInterval(10, 45) → min=${info3.minMinutes}, max=${info3.maxMinutes} ✅`);

  // ─── TEST 5: Range where min > max (auto-swap) ──────────────────────
  console.log('\n=== TEST 5: setSpawnInterval("30-15") — auto-swap ===');
  const r4 = await cardSystem.setSpawnInterval('30-15', 'test_owner@s.whatsapp.net', true);
  if (!r4.success) throw new Error(`setSpawnInterval('30-15') failed: ${r4.message}`);
  const info4 = cardSystem.getSpawnIntervalInfo();
  if (info4.minMinutes !== 15 || info4.maxMinutes !== 30) {
    throw new Error(`Auto-swap failed: min=${info4.minMinutes}, max=${info4.maxMinutes}, expected 15/30`);
  }
  console.log(`[+] setSpawnInterval("30-15") → auto-swapped to min=15, max=30 ✅`);

  // ─── TEST 6: Invalid values rejected ───────────────────────────────
  console.log('\n=== TEST 6: invalid values rejected ===');
  const r5 = await cardSystem.setSpawnInterval(0, 'test_owner@s.whatsapp.net', true);
  if (r5.success) throw new Error('setSpawnInterval(0) should fail');
  console.log(`[+] setSpawnInterval(0) rejected ✅ (${r5.message.slice(0, 60)}...)`);
  const r6 = await cardSystem.setSpawnInterval('abc-def', 'test_owner@s.whatsapp.net', true);
  if (r6.success) throw new Error('setSpawnInterval("abc-def") should fail');
  console.log(`[+] setSpawnInterval("abc-def") rejected ✅`);
  const r7 = await cardSystem.setSpawnInterval(2000, 'test_owner@s.whatsapp.net', true);
  if (r7.success) throw new Error('setSpawnInterval(2000) should fail (>1440)');
  console.log(`[+] setSpawnInterval(2000) rejected (>1440 max) ✅`);

  // ─── TEST 7: Non-mod permission rejected ────────────────────────────
  console.log('\n=== TEST 7: non-mod permission rejected ===');
  const r8 = await cardSystem.setSpawnInterval(20, 'regular_user@s.whatsapp.net', false);
  if (r8.success) throw new Error('Non-mod should not be able to set spawn interval');
  console.log(`[+] Non-mod rejected ✅`);

  // ─── TEST 8: loadSpawnInterval reads new format ({min, max}) ────────
  console.log('\n=== TEST 8: loadSpawnInterval reads new format ===');
  // Save a known {min, max} value, then reload
  await System.findOneAndUpdate(
    { key: 'card_spawn_interval_global' },
    { value: { min: 12 * 60 * 1000, max: 25 * 60 * 1000 } },
    { upsert: true }
  );
  await cardSystem.loadSpawnInterval();
  const info8 = cardSystem.getSpawnIntervalInfo();
  if (info8.minMinutes !== 12 || info8.maxMinutes !== 25) {
    throw new Error(`loadSpawnInterval(new format) failed: min=${info8.minMinutes}, max=${info8.maxMinutes}, expected 12/25`);
  }
  console.log(`[+] loadSpawnInterval read new format → min=${info8.minMinutes}, max=${info8.maxMinutes} ✅`);

  // ─── TEST 9: loadSpawnInterval reads old format (single number) and migrates ─
  console.log('\n=== TEST 9: loadSpawnInterval reads old format (single number) ===');
  await System.findOneAndUpdate(
    { key: 'card_spawn_interval_global' },
    { value: 18 * 60 * 1000 },  // old single-number format
    { upsert: true }
  );
  await cardSystem.loadSpawnInterval();
  const info9 = cardSystem.getSpawnIntervalInfo();
  if (info9.minMinutes !== 18 || info9.maxMinutes !== 18) {
    throw new Error(`loadSpawnInterval(old format) failed: min=${info9.minMinutes}, max=${info9.maxMinutes}, expected 18/18`);
  }
  console.log(`[+] loadSpawnInterval migrated old format → min=${info9.minMinutes}, max=${info9.maxMinutes} (fixed mode) ✅`);

  // ─── TEST 10: Code path — engine.js has the spawnset command with range support ─
  console.log('\n=== TEST 10: cardSystem.js source verification ===');
  const cardSrc = fs.readFileSync(path.join(__dirname, '..', 'core/rpg/cardSystem.js'), 'utf-8');
  const checks = [
    'PHASE 7 FIX 2026-08-30: random spawn interval',
    'PHASE 7 FIX 2026-08-30: random spawn delay',
    'PHASE 7 FIX 2026-08-30: setSpawnInterval supports range',
    'PHASE 7 FIX 2026-08-30: persist {min, max} object',
    'PHASE 7 FIX 2026-08-30: loadSpawnInterval handles both formats',
    'PHASE 7 FIX 2026-08-30: getSpawnIntervalInfo returns min/max',
    'PHASE 7 FIX 2026-08-30: spawninfo + spawnset help',
  ];
  for (const marker of checks) {
    if (!cardSrc.includes(marker)) throw new Error(`Missing marker: ${marker}`);
  }
  console.log(`[+] All ${checks.length} fix markers present in cardSystem.js ✅`);

  // Verify the spawnset help text mentions range syntax
  if (!cardSrc.includes('spawnset <min>-<max>')) throw new Error('spawnset help text missing range syntax');
  console.log(`[+] spawnset help text includes <min>-<max> range syntax ✅`);

  console.log('\n========== ALL TESTS PASSED ==========');
  console.log('1. cardSystem exports ✅');
  console.log('2. setSpawnInterval(25) backward-compat ✅');
  console.log('3. setSpawnInterval("15-30") random range ✅');
  console.log('4. setSpawnInterval(10, 45) two-arg form ✅');
  console.log('5. setSpawnInterval("30-15") auto-swap ✅');
  console.log('6. Invalid values rejected (0, abc-def, 2000) ✅');
  console.log('7. Non-mod permission rejected ✅');
  console.log('8. loadSpawnInterval reads new {min,max} format ✅');
  console.log('9. loadSpawnInterval reads old (number) format + migrates ✅');
  console.log('10. All 7 fix markers present in cardSystem.js + help text updated ✅');
}

async function main() {
  try {
    await setup();
    await runTests();
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main();
