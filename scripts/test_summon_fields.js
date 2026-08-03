#!/usr/bin/env node
/**
 * SUMMON FIELD MISMATCH TEST
 *
 * Verifies that the JS summon entity has the correct field names for the
 * Go service's Summon struct (types.go):
 *   Go expects: Name, Species, CurrentHP, MaxHP, JustDied, OwnerIndex, IsStationary
 *   JS sends:   name, species, currentHP, maxHp, justDied, ownerIndex, isStationary
 *
 * Root cause of "no summons in combat": JS was sending `type` instead of
 * `species`, so GetSummonSpritePath("") returned a path that didn't exist,
 * and the summon was silently skipped.
 */

'use strict';

require('dotenv').config();

const PASS = '\x1b[32m';
const FAIL = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let passCount = 0, failCount = 0;
const failures = [];

function ok(name, detail) {
  passCount++;
  console.log(`  ${PASS}✅ PASS${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  failCount++;
  failures.push({ name, detail });
  console.log(`  ${FAIL}❌ FAIL${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`\n${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  SUMMON FIELD MISMATCH TEST`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);

  // 1. Verify buildCombatEntity returns the Go-expected fields
  console.log(`${CYAN}[Test 1]${RESET} buildCombatEntity returns Go-compatible fields...`);
  const summonSystem = require('../core/rpg/summonSystem');
  const registry = require('../core/rpg/summonRegistry');

  // Find a valid species from the registry
  const allSpecies = registry.getAllSpecies ? registry.getAllSpecies() : Object.values(registry.SPECIES || {});
  let testSpecies = null;
  if (allSpecies && allSpecies.length > 0) {
    testSpecies = allSpecies[0];
  } else if (registry.SPECIES) {
    testSpecies = Object.values(registry.SPECIES)[0];
  }

  if (!testSpecies) {
    // Fallback: create a minimal mock summon
    const mockSummon = {
      summonId: 'test_summon_001',
      species: 'skeleton',
      nickname: 'TestSkelly',
      archetype: 'BRUTE',
      element: 'DARK',
      personality: 'AGGRESSIVE',
      behaviorScore: { aggression: 50, defense: 30, support: 20 },
      loyalty: 100,
      echoId: null,
      level: 1,
      rarity: 'COMMON',
    };
    const entity = summonSystem.buildCombatEntity(mockSummon, 'test@s.whatsapp.net');
    if (!entity) {
      fail('buildCombatEntity:returns', 'returned null for mock summon');
    } else {
      verifyFields(entity);
    }
  } else {
    const mockSummon = {
      summonId: 'test_summon_001',
      species: testSpecies.id || testSpecies.species || 'skeleton',
      nickname: 'TestSummon',
      archetype: 'BRUTE',
      element: 'DARK',
      personality: 'AGGRESSIVE',
      behaviorScore: { aggression: 50, defense: 30, support: 20 },
      loyalty: 100,
      echoId: null,
      level: 1,
      rarity: 'COMMON',
    };
    const entity = summonSystem.buildCombatEntity(mockSummon, 'test@s.whatsapp.net');
    if (!entity) {
      fail('buildCombatEntity:returns', 'returned null for mock summon');
    } else {
      verifyFields(entity);
    }
  }

  function verifyFields(entity) {
    // Go Summon struct fields (from types.go):
    // Name         string `json:"name"`
    // Species      string `json:"species"`
    // CurrentHP    int    `json:"currentHP"`
    // MaxHP        int    `json:"maxHp"`
    // JustDied     bool   `json:"justDied"`
    // OwnerIndex   int    `json:"ownerIndex"`
    // IsStationary bool   `json:"isStationary"`
    const checks = [
      ['name', entity.name !== undefined, `name=${entity.name}`],
      ['species', entity.species !== undefined && entity.species !== '', `species=${entity.species}`],
      ['currentHP', entity.currentHP !== undefined, `currentHP=${entity.currentHP}`],
      ['maxHp', entity.maxHp !== undefined, `maxHp=${entity.maxHp}`],
      ['justDied', entity.justDied !== undefined, `justDied=${entity.justDied}`],
      ['ownerIndex', entity.ownerIndex !== undefined, `ownerIndex=${entity.ownerIndex}`],
      ['isStationary', entity.isStationary !== undefined, `isStationary=${entity.isStationary}`],
    ];
    for (const [field, ok, detail] of checks) {
      if (ok) {
        ok_(`field:${field}`, detail);
      } else {
        fail(`field:${field}`, `missing or empty — Go service will skip this summon`);
      }
    }
  }
  function ok_(name, detail) {
    passCount++;
    console.log(`  ${PASS}✅ PASS${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
  }

  // 2. Verify the species field is NOT just an alias for type
  console.log(`\n${CYAN}[Test 2]${RESET} Verify 'species' field is populated (not empty)...`);
  const mockSummon2 = {
    summonId: 'test_summon_002',
    species: 'flame_elemental',
    nickname: 'Flamey',
    archetype: 'CASTER',
    element: 'FIRE',
    personality: 'AGGRESSIVE',
    behaviorScore: { aggression: 70, defense: 20, support: 10 },
    loyalty: 80,
    echoId: null,
    level: 5,
    rarity: 'RARE',
  };
  const entity2 = summonSystem.buildCombatEntity(mockSummon2, 'test2@s.whatsapp.net');
  if (entity2 && entity2.species === 'flame_elemental') {
    ok('species:value', `entity.species='${entity2.species}' (matches input)`);
  } else {
    fail('species:value', `entity.species='${entity2?.species}' (expected 'flame_elemental')`);
  }
  if (entity2 && entity2.type === 'flame_elemental') {
    ok('type:alias', `entity.type='${entity2.type}' (alias preserved for JS-internal use)`);
  } else {
    fail('type:alias', `entity.type='${entity2?.type}' (should still be set for JS compatibility)`);
  }

  // 3. Verify deployPvPSummons sets ownerIndex
  console.log(`\n${CYAN}[Test 3]${RESET} Verify deployPvPSummons sets ownerIndex...`);
  const fs = require('fs');
  const pvpSrc = fs.readFileSync(require('path').join(__dirname, '..', 'core', 'rpg', 'pvpSystem.js'), 'utf8');
  if (/summonEntity\.ownerIndex\s*=/.test(pvpSrc)) {
    ok('deployPvPSummons:ownerIndex', 'deployPvPSummons sets summonEntity.ownerIndex');
  } else {
    fail('deployPvPSummons:ownerIndex', 'deployPvPSummons does NOT set ownerIndex');
  }

  // 4. Verify PvE summon deployment sets ownerIndex
  console.log(`\n${CYAN}[Test 4]${RESET} Verify PvE summon deployment sets ownerIndex...`);
  const gaSrc = fs.readFileSync(require('path').join(__dirname, '..', 'core', 'rpg', 'guildAdventure.js'), 'utf8');
  if (/summonEntity\.ownerIndex\s*=\s*pi/.test(gaSrc)) {
    ok('pveSummon:ownerIndex', 'PvE summon deployment sets summonEntity.ownerIndex = pi');
  } else {
    fail('pveSummon:ownerIndex', 'PvE summon deployment does NOT set ownerIndex');
  }

  // ── FINAL REPORT ──
  console.log(`\n${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);
  if (failures.length) {
    console.log(`${FAIL}Failures:${RESET}`);
    for (const f of failures) {
      console.log(`  • ${f.name}: ${f.detail}`);
    }
    console.log();
  }
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
