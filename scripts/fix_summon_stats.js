#!/usr/bin/env node
// Fix NaN/null baseStats on all summons.
// The migration script used {...summon} spread on a Mongoose document,
// which doesn't extract field values properly — so applyLevelGrowth
// returned early and baseStats stayed null.
//
// This script uses toObject() to get plain values, recomputes baseStats,
// and saves.

const mongoose = require('mongoose');
const path = require('path');

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI required');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected.\n');

  // Load models
  require('../core/models/Summon');
  const Summon = mongoose.connection.collection('summons');
  const registry = require('../core/rpg/summonRegistry');

  // Find all summons
  const all = await Summon.find({}).toArray();
  console.log(`Found ${all.length} total summons.\n`);

  let fixed = 0;
  let skipped = 0;

  for (const doc of all) {
    const bs = doc.baseStats || {};
    const hasNaN = bs.hp === null || bs.hp === undefined || isNaN(bs.hp) ||
                   bs.atk === null || bs.atk === undefined || isNaN(bs.atk);

    if (!hasNaN) {
      skipped++;
      continue;
    }

    const species = registry.getSpecies(doc.species);
    if (!species) {
      console.log(`  ⚠️ SKIP ${doc.summonId}: species "${doc.species}" not in registry`);
      skipped++;
      continue;
    }

    const rarityConfig = registry.getRarityConfig(doc.rarity);
    const growthMult = rarityConfig.statGrowthMult || 1.0;
    const level = doc.level || 1;
    const levelMult = 1 + (level - 1) * 0.08 * growthMult;

    const newBaseStats = {
      hp:  Math.floor(species.baseStats.hp  * levelMult),
      atk: Math.floor(species.baseStats.atk * levelMult),
      def: Math.floor(species.baseStats.def * levelMult),
      mag: Math.floor(species.baseStats.mag * levelMult),
      spd: Math.floor(species.baseStats.spd * levelMult),
    };

    console.log(`  FIX ${doc.summonId}: species=${doc.species} Lv.${level} ${doc.rarity}`);
    console.log(`    baseStats: {hp:${bs.hp}, atk:${bs.atk}, def:${bs.def}, mag:${bs.mag}, spd:${bs.spd}} → {hp:${newBaseStats.hp}, atk:${newBaseStats.atk}, def:${newBaseStats.def}, mag:${newBaseStats.mag}, spd:${newBaseStats.spd}}`);

    await Summon.updateOne(
      { _id: doc._id },
      { $set: { baseStats: newBaseStats } }
    );
    fixed++;
  }

  console.log(`\n✅ Done. Fixed ${fixed} summons, skipped ${skipped}.`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
