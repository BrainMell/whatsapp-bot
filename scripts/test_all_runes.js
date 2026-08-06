#!/usr/bin/env node
// Comprehensive rune test — verifies every rune type's modifiers are
// correctly applied by applyRuneModifiers to the skill effect.
//
// Usage: node scripts/test_all_runes.js

const mongoose = require('mongoose');

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI required');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected.\n');

  const runeSystem = require('../core/rpg/runeSystem');
  const RUNE_TYPES = runeSystem.RUNE_TYPES;
  const RUNE_TIERS = runeSystem.RUNE_TIERS;

  // Base effect template (a typical single-target physical attack)
  const baseEffect = {
    multiplier: 2.0,
    damageType: 'physical',
    cost: 20,
    targeting: 'SINGLE',
    targets: 1,
  };

  let passCount = 0;
  let failCount = 0;
  const failures = [];

  console.log('Testing all ' + Object.keys(RUNE_TYPES).length + ' rune types...\n');
  console.log('═'.repeat(80));

  for (const [typeId, runeType] of Object.entries(RUNE_TYPES)) {
    // Test with LESSER tier (index 0)
    const tierId = 'LESSER';
    const fakeRune = { type: typeId, tier: tierId };
    const tierIdx = RUNE_TIERS[tierId]?.multIndex ?? 0;

    let modified;
    try {
      modified = runeSystem.applyRuneModifiers({ ...baseEffect }, [fakeRune]);
    } catch (e) {
      console.log(`❌ ${typeId} (${runeType.name}) — applyRuneModifiers threw: ${e.message}`);
      failCount++;
      failures.push({ typeId, reason: 'threw: ' + e.message });
      continue;
    }

    // Verify expected fields are set based on rune properties
    const checks = [];
    const r = runeType;

    // damageMult — should modify multiplier
    if (r.damageMult) {
      const expectedMult = baseEffect.multiplier * r.damageMult[tierIdx];
      if (Math.abs(modified.multiplier - expectedMult) > 0.01) {
        checks.push(`multiplier: expected ${expectedMult.toFixed(3)}, got ${modified.multiplier}`);
      }
    }

    // energyCostMult — should modify cost
    if (r.energyCostMult) {
      const expectedCost = Math.ceil(baseEffect.cost * r.energyCostMult[tierIdx]);
      if (modified.cost !== expectedCost) {
        checks.push(`cost: expected ${expectedCost}, got ${modified.cost}`);
      }
    }

    // critBonus
    if (r.critBonus) {
      if (!modified.critBonus || modified.critBonus < r.critBonus[tierIdx]) {
        checks.push(`critBonus: expected >= ${r.critBonus[tierIdx]}, got ${modified.critBonus || 0}`);
      }
    }

    // targetBonus
    if (r.targetBonus) {
      const expectedTargets = baseEffect.targets + r.targetBonus[tierIdx];
      if (modified.targets !== expectedTargets) {
        checks.push(`targets: expected ${expectedTargets}, got ${modified.targets}`);
      }
    }

    // defIgnorePct
    if (r.defIgnorePct) {
      if (!modified.ignoreDefense || modified.ignoreDefense < r.defIgnorePct[tierIdx]) {
        checks.push(`ignoreDefense: expected >= ${r.defIgnorePct[tierIdx]}, got ${modified.ignoreDefense || 0}`);
      }
    }

    // cannotEvade
    if (r.cannotEvade) {
      if (!modified.cannotEvade) {
        checks.push('cannotEvade: expected true, got false/undefined');
      }
    }

    // convertElement
    if (r.convertElement) {
      if (modified.element !== r.convertElement) {
        checks.push(`element: expected ${r.convertElement}, got ${modified.element || 'undefined'}`);
      }
    }

    // convertDamageType
    if (r.convertDamageType) {
      if (modified.damageType !== r.convertDamageType) {
        checks.push(`damageType: expected ${r.convertDamageType}, got ${modified.damageType}`);
      }
    }

    // convertTargeting
    if (r.convertTargeting) {
      if (modified.targeting !== r.convertTargeting) {
        checks.push(`targeting: expected ${r.convertTargeting}, got ${modified.targeting}`);
      }
    }

    // convertSingleToAOE
    if (r.convertSingleToAOE) {
      if (!modified.targeting || modified.targeting === 'SINGLE') {
        checks.push('convertSingleToAOE: targeting still SINGLE');
      }
    }

    // chainBounces
    if (r.chainBounces) {
      if (!modified.chainBounces || modified.chainBounces < 1) {
        checks.push('chainBounces: expected >= 1, got ' + modified.chainBounces);
      }
    }

    // splitIntoHits
    if (r.splitIntoHits) {
      if (!modified.splitIntoHits || modified.splitIntoHits < 1) {
        checks.push('splitIntoHits: expected >= 1, got ' + modified.splitIntoHits);
      }
    }

    // bypassShield
    if (r.bypassShield) {
      if (!modified.bypassShield) {
        checks.push('bypassShield: expected true');
      }
    }

    // guaranteedCrit
    if (r.guaranteedCrit) {
      if (!modified.guaranteedCrit) {
        checks.push('guaranteedCrit: expected true');
      }
    }

    // groundEffect
    if (r.groundEffect) {
      if (!modified.groundEffect) {
        checks.push('groundEffect: expected to be set');
      }
    }

    // lifestealPercent
    if (r.lifestealPercent) {
      if (!modified.lifestealPercent || modified.lifestealPercent < 1) {
        checks.push('lifestealPercent: expected >= 1, got ' + modified.lifestealPercent);
      }
    }

    // energyRestore
    if (r.energyRestore) {
      if (!modified.energyRestore || modified.energyRestore < 1) {
        checks.push('energyRestore: expected >= 1, got ' + modified.energyRestore);
      }
    }

    // executeThreshold
    if (r.executeThreshold) {
      if (!modified.executeThreshold) {
        checks.push('executeThreshold: expected to be set');
      }
    }

    // cooldownMult
    if (r.cooldownMult) {
      if (!modified.cooldownMult || Math.abs(modified.cooldownMult - r.cooldownMult[tierIdx]) > 0.01) {
        checks.push(`cooldownMult: expected ${r.cooldownMult[tierIdx]}, got ${modified.cooldownMult || 'undefined'}`);
      }
    }

    // cooldownFlatReduction
    if (r.cooldownFlatReduction) {
      if (!modified.cooldownFlatReduction) {
        checks.push('cooldownFlatReduction: expected to be set');
      }
    }

    // ignoreDefense (flat, from VOID_CONVERSION)
    if (r.ignoreDefense && !r.defIgnorePct) {
      if (!modified.ignoreDefense || modified.ignoreDefense < r.ignoreDefense) {
        checks.push(`ignoreDefense (flat): expected >= ${r.ignoreDefense}, got ${modified.ignoreDefense || 0}`);
      }
    }

    // addStatus
    if (r.addStatus) {
      if (!modified.addStatuses || modified.addStatuses.length === 0) {
        checks.push('addStatuses: expected to be populated');
      } else {
        // Verify the status type matches
        const statuses = Array.isArray(r.addStatus) ? r.addStatus : [r.addStatus];
        for (const s of statuses) {
          const found = modified.addStatuses.some(as => as.type === s.type);
          if (!found) {
            checks.push(`addStatuses: type '${s.type}' not found in result`);
          }
        }
      }
    }

    // VOID_CONVERSION special case: if base skill already ignores DEF,
    // the damageMult should be skipped (our recent fix)
    if (typeId === 'VOID_CONVERSION') {
      // Test with a skill that already ignores DEF
      const ignoreDefEffect = { ...baseEffect, ignoreDefense: 100 };
      const modIgnoreDef = runeSystem.applyRuneModifiers({ ...ignoreDefEffect }, [fakeRune]);
      // damageMult should NOT be applied (redundant rune)
      if (modIgnoreDef.multiplier !== baseEffect.multiplier) {
        checks.push(`VOID_CONVERSION on DEF-ignoring skill: multiplier should be ${baseEffect.multiplier} (no penalty), got ${modIgnoreDef.multiplier}`);
      }
    }

    // Report
    if (checks.length === 0) {
      console.log(`✅ ${typeId.padEnd(22)} (${runeType.name}) — all checks passed`);
      passCount++;
    } else {
      console.log(`❌ ${typeId.padEnd(22)} (${runeType.name}) — ${checks.length} check(s) failed:`);
      for (const c of checks) {
        console.log(`     • ${c}`);
      }
      failCount++;
      failures.push({ typeId, checks });
    }
  }

  console.log('═'.repeat(80));
  console.log(`\nResults: ${passCount} passed, ${failCount} failed out of ${Object.keys(RUNE_TYPES).length} total.`);

  if (failures.length > 0) {
    console.log('\n❌ Failed runes:');
    for (const f of failures) {
      console.log('  ' + f.typeId + ': ' + f.checks.join('; '));
    }
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
