require('dotenv').config();
const connectDB = require('../db');
const Summon = require('../core/models/Summon');
const User = require('../core/models/User');
const crypto = require('crypto');

(async () => {
  await connectDB();

  const userId = '251453323092189@lid';

  // Find the user
  const user = await User.findOne({ userId });
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }
  console.log('Found user:', user.userId, '| nickname:', user.nickname);

  // 1. Delete all existing summons for this user
  const deleteResult = await Summon.deleteMany({ ownerJid: userId });
  console.log(`Deleted ${deleteResult.deletedCount} existing summons`);

  // 2. Clear activeSummonId
  user.activeSummonId = null;
  // 3. Set summonSlots to 4 so they can hold all 4 starters
  user.summonSlots = 4;
  await user.save();
  console.log('Cleared activeSummonId, set summonSlots to 4');

  // 4. Create the 4 new sparklinlabs starter summons
  const STARTER_SPECIES = [
    {
      species: 'stoneguard',
      nickname: 'StoneGuard',
      element: 'neutral',
      archetype: 'TANK',
    },
    {
      species: 'emberdrake',
      nickname: 'EmberDrake',
      element: 'fire',
      archetype: 'BRUTE',
    },
    {
      species: 'mistwisp',
      nickname: 'MistWisp',
      element: 'ice',
      archetype: 'STALKER',
    },
    {
      species: 'bloompixie',
      nickname: 'BloomPixie',
      element: 'beast',
      archetype: 'SUPPORT',
    },
  ];

  const registry = require('../core/rpg/summonRegistry');

  for (const starter of STARTER_SPECIES) {
    const species = registry.getSpecies(starter.species);
    if (!species) {
      console.log(`WARNING: species ${starter.species} not found in registry — skipping`);
      continue;
    }

    const shortId = crypto.randomBytes(2).toString('hex').toUpperCase();
    const summonId = `S-${shortId}`;
    const rarityConfig = registry.getRarityConfig(species.rarity);

    const summon = new Summon({
      summonId,
      ownerJid: userId,
      species: starter.species,
      archetype: species.archetype,
      element: species.element,
      tier: 'BASE',
      rarity: species.rarity,
      nickname: starter.nickname,
      level: 1,
      xp: 0,
      statPoints: 0,
      skillPoints: 0,
      chosenSkillPath: null,
      unlockedSkillNodes: [],
      allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
      baseStats: species.baseStats,
      echoId: species.echoId,
      loyalty: 100,
      personality: 'STOIC',
      behaviorScore: { aggression: 0, defense: 0, support: 0 },
      isLocked: false,
      forSale: false,
      obtainedFrom: 'owner_grant',
    });

    await summon.save();
    console.log(`Created: ${summonId} | ${starter.species} | ${starter.nickname} | ${species.rarity} | ${species.archetype}`);
  }

  // 5. Verify
  const finalSummons = await Summon.find({ ownerJid: userId });
  console.log(`\n=== FINAL SUMMONS (${finalSummons.length}) ===`);
  for (const s of finalSummons) {
    console.log(`  ${s.summonId} | ${s.species} | ${s.nickname} | Lv.${s.level} | ${s.rarity}`);
  }

  console.log('\nDone! Mell now has 4 fresh sparklinlabs starter summons.');
  process.exit(0);
})();
