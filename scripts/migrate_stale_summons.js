// ═══════════════════════════════════════════════════════════════════════════
//  SUMMON SPECIES MIGRATION SCRIPT
// ═══════════════════════════════════════════════════════════════════════════
//
// PURPOSE:
//   The summon registry was cleaned up (commit 2db5d0a8) from 26+ species down
//   to 17. Users who had summons under the old (stale) species names still have
//   those stale names in their Summon documents. This causes:
//     - Codex doesn't show their summons (iterates live registry only)
//     - Sprites don't render (Go service fallback maps to wrong sprite)
//     - Stats/skills are mismatched (old archetype/element/baseStats)
//
//   This script scans all Summon documents, finds ones with stale species,
//   remaps them to the closest live species, and updates:
//     species, archetype, element, rarity, baseStats, echoId
//     (resets trialCompleted, chosenSkillPath, unlockedSkillNodes)
//     (preserves level, xp, loyalty, nickname, lineage)
//
// SAFETY:
//   - Backs up affected Summon docs to JSON BEFORE any write
//   - DRY-RUN mode by default: prints what would change, writes nothing
//   - LIVE mode requires explicit --live flag
//   - Bulk writes in chunks of 100
//
// USAGE:
//   MONGO_URI="mongodb+srv://..." \
//     node scripts/migrate_stale_summons.js              # dry run
//   MONGO_URI="mongodb+srv://..." \
//     node scripts/migrate_stale_summons.js --live       # apply
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// ─── Stale → Live species mapping ─────────────────────────────────────────
// Based on thematic similarity + element/archetype match + Go sprite fallback
const SPECIES_MIGRATION_MAP = {
  // Undead (Necromancer) → ghost
  skeleton:          'ghost',
  skeleton_knight:   'ghost',
  lich_minion:       'ghost',

  // Demon (Warlock) → bat / giant
  imp:               'bat',
  void_walker:       'giant',

  // Elemental (Elementalist) → dragon / yeti / reptile
  flame_elemental:   'dragon',
  frost_elemental:   'yeti',
  storm_elemental:   'reptile',

  // Beast (Druid) → snake / boar
  wolf:              'snake',
  bear:              'boar',

  // Construct (Artificer) → ship sprites
  turret_mk1:        'ship_fighter',
  cannon_turret:     'ship_cruiser',

  // Dragon (Dragon Lord) → dragon
  wyrmling:          'dragon',
  juvenile_dragon:   'dragon',

  // Starter base forms → giant / dragon / ghost / mushroom
  stoneguard:        'giant',
  emberdrake:        'dragon',
  mistwisp:          'ghost',
  bloompixie:        'mushroom',

  // Starter tier-2 evos
  iron_sentinel:     'giant',
  flare_wyrm:        'dragon',
  frost_spectre:     'ghost',
  blossom_sylph:     'mushroom',

  // Starter tier-3 evos
  mountain_titan:    'giant',
  infernal_dragon:   'dragon',
  abyssal_phantom:   'ghost',
  world_tree_spirit: 'mushroom',
};

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const isLive = process.argv.includes('--live');
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('❌ MONGO_URI environment variable is required.');
    console.error('   Usage: MONGO_URI="mongodb+srv://..." node scripts/migrate_stale_summons.js [--live]');
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  SUMMON SPECIES MIGRATION — ${isLive ? '🔴 LIVE MODE' : '⚪ DRY RUN'}`);
  console.log(`${'═'.repeat(70)}\n`);

  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log(`✅ Connected.\n`);

  const Summon = mongoose.connection.collection('summons');
  const registry = require('../core/rpg/summonRegistry');
  const summonSystem = require('../core/rpg/summonSystem');

  // Find all summons with stale species
  const staleSpeciesKeys = Object.keys(SPECIES_MIGRATION_MAP);
  console.log(`Scanning for summons with stale species (${staleSpeciesKeys.length} keys)...`);
  console.log(`  Keys: ${staleSpeciesKeys.join(', ')}\n`);

  const staleSummons = await Summon.find({
    species: { $in: staleSpeciesKeys }
  }).toArray();

  console.log(`Found ${staleSummons.length} summons with stale species.\n`);

  if (staleSummons.length === 0) {
    console.log('✅ No stale summons found. Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  // Group by old species for summary
  const byOldSpecies = {};
  for (const s of staleSummons) {
    byOldSpecies[s.species] = (byOldSpecies[s.species] || 0) + 1;
  }
  console.log('Breakdown by old species:');
  for (const [old, count] of Object.entries(byOldSpecies).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${old.padEnd(22)} → ${SPECIES_MIGRATION_MAP[old].padEnd(15)} (${count} summons)`);
  }
  console.log('');

  // Backup
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `summons_stale_backup_${Date.now()}.json`);
  console.log(`Backing up ${staleSummons.length} affected summons to ${backupFile}...`);
  fs.writeFileSync(backupFile, JSON.stringify(staleSummons, null, 2));
  console.log('✅ Backup complete.\n');

  if (!isLive) {
    console.log('⚪ DRY RUN — no writes will be made. Use --live to apply.\n');
    console.log(`Would update ${staleSummons.length} summon documents.`);
    await mongoose.disconnect();
    return;
  }

  // LIVE: apply migrations
  console.log('🔴 Applying migrations...\n');

  const bulkOps = [];
  let processed = 0;

  for (const summon of staleSummons) {
    const newSpeciesKey = SPECIES_MIGRATION_MAP[summon.species];
    const newSpecies = registry.getSpecies(newSpeciesKey);

    if (!newSpecies) {
      console.error(`  ⚠️ Could not find new species "${newSpeciesKey}" in registry — skipping summon ${summon.summonId}`);
      continue;
    }

    // Build the updated summon object
    const updatedFields = {
      species: newSpeciesKey,
      archetype: newSpecies.archetype,
      element: newSpecies.element,
      rarity: newSpecies.rarity, // take new species' default rarity
      echoId: newSpecies.echoId || 'echo_basic',
      trialCompleted: false, // new species has a different trial
      chosenSkillPath: null, // skill paths are archetype-bound
      unlockedSkillNodes: [], // reset unlocked nodes
    };

    // Recompute baseStats using applyLevelGrowth logic
    // We need to set species first, then call applyLevelGrowth
    const tempSummon = {
      ...summon,
      species: newSpeciesKey,
      rarity: newSpecies.rarity,
      level: summon.level || 1,
    };
    // Use the summonSystem's applyLevelGrowth to get correct baseStats
    try {
      summonSystem.applyLevelGrowth(tempSummon, tempSummon.level);
      updatedFields.baseStats = tempSummon.baseStats;
    } catch (e) {
      console.error(`  ⚠️ applyLevelGrowth failed for ${summon.summonId}: ${e.message} — using species baseStats directly`);
      updatedFields.baseStats = newSpecies.baseStats;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: summon._id },
        update: { $set: updatedFields },
      },
    });

    processed++;

    if (bulkOps.length >= 100) {
      console.log(`  Writing batch of ${bulkOps.length} (processed ${processed}/${staleSummons.length})...`);
      await Summon.bulkWrite(bulkOps);
      bulkOps.length = 0;
    }
  }

  // Write remaining
  if (bulkOps.length > 0) {
    console.log(`  Writing final batch of ${bulkOps.length}...`);
    await Summon.bulkWrite(bulkOps);
  }

  console.log(`\n✅ Migration complete! Updated ${processed} summon documents.`);
  console.log(`   Backup saved to: ${backupFile}`);
  console.log(`   Affected users should now see their summons in the codex with correct sprites.\n`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
