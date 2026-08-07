#!/usr/bin/env node
// Grant the bot owner ALL summon species in their backlog for testing.
// Run with: MONGO_URI="..." node scripts/grant_owner_all_summons.js

const mongoose = require('mongoose');

const OWNER_JID = '233201487480@s.whatsapp.net'; // primary owner phone
const ALL_SPECIES = [
  'bat', 'boar', 'chest', 'dino', 'dragon', 'ghost', 'giant', 'mimic',
  'mushroom', 'octopus', 'reptile', 'slime', 'snake', 'yeti',
  'plaguefang', 'lumenmoth', 'emberwick', 'skitterswarm', 'tidalmaw', 'fireguard',
  'ship_cruiser', 'ship_fighter', 'ship_squid'
];

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) { console.error('❌ MONGO_URI required'); process.exit(1); }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected.\n');

  const registry = require('../core/rpg/summonRegistry');
  const summonSystem = require('../core/rpg/summonSystem');
  const Summon = mongoose.connection.collection('summons');

  // Check what owner already has
  const existing = await Summon.find({ ownerJid: OWNER_JID }).toArray();
  const existingSpecies = new Set(existing.map(s => s.species));
  console.log(`Owner has ${existing.length} summons (${existingSpecies.size} distinct species).`);

  let added = 0;
  for (const species of ALL_SPECIES) {
    if (existingSpecies.has(species)) {
      console.log(`  SKIP ${species} (already owned)`);
      continue;
    }
    const speciesDef = registry.getSpecies(species);
    if (!speciesDef) {
      console.log(`  ⚠️ SKIP ${species} (not in registry)`);
      continue;
    }
    try {
      const summon = await summonSystem.createSummon(OWNER_JID, species, {
        level: 10,
        rarity: speciesDef.rarity,
        obtainedFrom: 'owner_test_grant',
      });
      // Move to backlog (not main deck)
      await Summon.updateOne(
        { summonId: summon.summonId },
        { $set: { inMainDeck: false } }
      );
      console.log(`  ✅ ${species} (${speciesDef.name}) — Lv.10 ${speciesDef.rarity} → backlog`);
      added++;
    } catch (e) {
      console.log(`  ❌ ${species}: ${e.message}`);
    }
  }

  console.log(`\n✅ Done. Added ${added} new summons to owner backlog.`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
