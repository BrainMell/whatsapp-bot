#!/usr/bin/env node
'use strict';
/**
 * QA: spawn rate = 5 cards/hour (Task 2026-10-21).
 *
 * 5/hour = one spawn every 12 minutes. Verifies every layer that decides
 * the spawn cadence, so no stale 30-min default can silently reassert:
 *   1. getInst() defaults  (spawnIntervalMinMs/MaxMs/Ms = 12 min)
 *   2. rebuildSpawnTimersForInstance + randomDelay fallbacks (12 min)
 *   3. getSpawnIntervalInfo fallback (12 min)
 *   4. .g spawnset reset → setSpawnInterval(12)
 *   5. Help text advertises "12 min = 5 cards/hour"
 *   6. CLAIM_WINDOW_MS is NOT touched (still 30 min - claim window ≠ spawn rate)
 *
 * Pure source pins - no DB, no mongoose needed. Run: node scripts/qa_spawnrate5.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'core', 'rpg', 'cardSystem.js');
const src = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
}
function pin(name, re) { check(name, typeof re === 'boolean' ? re : re.test(src)); }

console.log('\n--- Pin: in-code defaults are 12 min (= 5 cards/hour) ---');
pin('spawnIntervalMinMs default  = 12 * 60 * 1000', /spawnIntervalMinMs:\s*12 \* 60 \* 1000,/.test(src) && !/spawnIntervalMinMs:\s*30 \* 60 \* 1000,/.test(src));
pin('spawnIntervalMaxMs default  = 12 * 60 * 1000', /spawnIntervalMaxMs:\s*12 \* 60 \* 1000,/.test(src) && !/spawnIntervalMaxMs:\s*30 \* 60 \* 1000,/.test(src));
pin('spawnIntervalMs legacy alias = 12 * 60 * 1000', /spawnIntervalMs:\s*12 \* 60 \* 1000,/.test(src) && !/spawnIntervalMs:\s*30 \* 60 \* 1000,/.test(src));

console.log('\n--- Pin: no stale 30-min spawn-interval fallbacks remain ---');
// All three `|| (30 * 60 * 1000)` fallbacks (rebuild + randomDelay + spawninfo) must be gone.
check('zero `spawnIntervalMinMs || (30 …)` fallbacks', !/spawnIntervalMinMs \|\| \(30 \* 60 \* 1000\)/.test(src));
pin('rebuild fallback     = 12 min', /const minMs = inst\.spawnIntervalMinMs \|\| \(12 \* 60 \* 1000\);/.test(src));
pin('randomDelay fallback = 12 min', /const lo = inst\.spawnIntervalMinMs \|\| \(12 \* 60 \* 1000\);/.test(src));
pin('spawninfo fallback   = 12 min', /const minMs = inst\.spawnIntervalMinMs \|\| \(12 \* 60 \* 1000\);\n  const maxMs = inst\.spawnIntervalMaxMs \|\| minMs;\n  const ms = maxMs;/.test(src));

console.log('\n--- Pin: .g spawnset reset restores 12 min ---');
pin('reset calls setSpawnInterval(12)', /sub === 'reset'[^)]*[\s\S]{0,120}setSpawnInterval\(12, senderJid/.test(src));
check('no setSpawnInterval(30) reset left', !/setSpawnInterval\(30,/.test(src));

console.log('\n--- Pin: help text matches new default ---');
pin('usage: reset → 12 min = 5 cards/hour', /spawnset reset\\` - restore default \(12 min = 5 cards\/hour\)/.test(src));
pin('example: spawnset 12 → 5 spawns/hour', /spawnset 12\\` → fixed 12 min \(default, 5 spawns\/hour\)/.test(src));
check('old "spawnset 30 → default" example gone', !/spawnset 30\\` → fixed 30 min \(default/.test(src));

console.log('\n--- Guard: claim window untouched ---');
pin('CLAIM_WINDOW_MS still 30 min (claim window ≠ spawn rate)', /const CLAIM_WINDOW_MS = 30 \* 60 \* 1000;/.test(src));

console.log('\n--- Math sanity ---');
check('60 / 12 = 5 spawns/hour', 60 / 12 === 5);
check('12 min in ms = 720000', 12 * 60 * 1000 === 720000);

console.log(`\n${'='.repeat(46)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
