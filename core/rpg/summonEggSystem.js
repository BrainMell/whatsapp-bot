// ═══════════════════════════════════════════════════════════════════════════
//  SUMMON EGG SYSTEM — eggs, hatching, fragments, crafting
// ═══════════════════════════════════════════════════════════════════════════
//
// The Summon Progression Loop:
//   1. Player buys Basic Summon Egg from shop → spins for 1 of 4 starters
//   2. Player explores Abyss → 10% chance per floor to encounter a Wild Summon
//   3. Defeat Wild Summon → drops Summon Fragments (tiered by floor depth)
//   4. Craft higher-tier eggs from fragments → hatch into stronger summons
//   5. Eggs have incubation time (1h-48h by tier) — speed up with Zeni
//
// Fragment tiers → egg tiers → summon rarities:
//   Common Fragment   → (craft) → Rare Egg     → hatches RARE summon
//   Rare Fragment     → (craft) → Epic Egg     → hatches EPIC summon
//   Epic Fragment     → (craft) → Legendary Egg → hatches LEGENDARY summon
//   Legendary Fragment→ (craft) → Mythic Egg   → hatches MYTHIC summon
//   Mythic Fragment   → (endgame currency, future use)
//
// Basic Egg is shop-buyable (5K Zeni) and only hatches the 4 starters.
// All other eggs are crafted from fragments dropped in the Abyss.

const fs = require('fs');
const path = require('path');
const botConfig = require('../../botConfig');
const economy = require('./economy');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');
const registry = require('./summonRegistry');
const summonSystem = require('./summonSystem');

// ─── 4 STARTER SUMMONS ────────────────────────────────────────────
// 💡 FIX 2026-08-05: Use the live registry's starter species. The old
// hardcoded list (stoneguard, emberdrake, mistwisp, bloompixie) referenced
// stale species that no longer exist — basic eggs would fail at createSummon.
const STARTER_SPECIES = registry.STARTER_SPECIES || ['bat', 'slime', 'mushroom', 'snake'];

// ─── EGG TIERS + INCUBATION ───────────────────────────────────────
const EGG_TIERS = {
  basic: {
    eggId: 'basic_summon_egg',
    incubationMs: 60 * 60 * 1000,          // 1 hour
    speedUpCost: 2000,                      // Zeni to skip incubation
    rarityPool: ['COMMON'],                 // hatches from these rarities
    isStarter: true,                        // basic egg only hatches starters
  },
  rare: {
    eggId: 'rare_summon_egg',
    incubationMs: 4 * 60 * 60 * 1000,       // 4 hours
    speedUpCost: 10000,
    rarityPool: ['RARE'],
    fragmentsRequired: { id: 'common_fragment', count: 10 },
    craftsInto: 'rare_summon_egg',
  },
  epic: {
    eggId: 'epic_summon_egg',
    incubationMs: 12 * 60 * 60 * 1000,      // 12 hours
    speedUpCost: 30000,
    rarityPool: ['EPIC'],
    fragmentsRequired: { id: 'rare_fragment', count: 10 },
    craftsInto: 'epic_summon_egg',
  },
  legendary: {
    eggId: 'legendary_summon_egg',
    incubationMs: 24 * 60 * 60 * 1000,      // 24 hours
    speedUpCost: 100000,
    rarityPool: ['LEGENDARY'],
    fragmentsRequired: { id: 'epic_fragment', count: 10 },
    craftsInto: 'legendary_summon_egg',
  },
  mythic: {
    eggId: 'mythic_summon_egg',
    incubationMs: 48 * 60 * 60 * 1000,      // 48 hours
    speedUpCost: 500000,
    rarityPool: ['MYTHIC'],
    fragmentsRequired: { id: 'legendary_fragment', count: 10 },
    craftsInto: 'mythic_summon_egg',
  },
};

// ─── HATCH AN EGG ─────────────────────────────────────────────────
// Spins for a random summon from the appropriate pool + creates it.
// For basic eggs: 1 of 4 starters (guaranteed, equal chance).
// For tiered eggs: random summon of that rarity from the registry.
// Returns { success, message, summon? }
async function hatchEgg(userId, eggId) {
  const tier = Object.values(EGG_TIERS).find(t => t.eggId === eggId);
  if (!tier) {
    return { success: false, message: '❌ Invalid egg type.' };
  }

  // Check the player has the egg
  if (!inventorySystem.hasItem(userId, eggId, 1)) {
    return { success: false, message: `❌ You don't have a ${lootSystem.getItemInfo(eggId)?.name || eggId}.` };
  }

  // Pick the species
  let speciesId;
  if (tier.isStarter) {
    // Basic egg: random 1 of 4 starters
    speciesId = STARTER_SPECIES[Math.floor(Math.random() * STARTER_SPECIES.length)];
  } else {
    // Tiered egg: random summon from registry matching the rarity pool
    // 💡 FIX 2026-08-03 (bug report #3): getAllSpecies() returns an ARRAY of
    // ID strings, not an object. The old Object.entries() code treated it as
    // {id: speciesObj}, so s.rarity was undefined, the filter rejected
    // everything, pool was empty, and tiered eggs ALWAYS fell back to
    // starters. Players could never hatch rare/epic/legendary/mythic summons
    // from crafted eggs — they always got a starter.
    // Fix: use registry.getSpecies(id) to resolve each ID.
    const speciesIds = registry.getAllSpecies();
    const pool = [];
    for (const id of speciesIds) {
      const s = registry.getSpecies(id);
      if (s && tier.rarityPool.includes(s.rarity) && !s.isStarter) {
        pool.push(id);
      }
    }

    if (pool.length === 0) {
      // Fallback: if no summons of that rarity exist yet, give a starter upgrade
      speciesId = STARTER_SPECIES[Math.floor(Math.random() * STARTER_SPECIES.length)];
    } else {
      speciesId = pool[Math.floor(Math.random() * pool.length)];
    }
  }

  const species = registry.getSpecies(speciesId);
  if (!species) {
    return { success: false, message: '❌ Invalid summon species. Please report this.' };
  }

  // Check summon slot space
  const user = economy.getUser(userId);
  const userSummons = await summonSystem.getUserSummons(userId);
  if (userSummons.length >= (user.summonSlots || 3)) {
    return {
      success: false,
      message: `❌ Summon slots full (${userSummons.length}/${user.summonSlots || 3}). Release a summon or buy more slots.`
    };
  }

  // Consume the egg
  inventorySystem.removeItem(userId, eggId, 1);

  // Create the summon
  try {
    const summon = await summonSystem.createSummon(userId, speciesId, {
      nickname: species.name,
      tier: 'BASE',
    });

    if (!summon) {
      return { success: false, message: '❌ Failed to create summon. Please report this.' };
    }

    const roleLabel = species.role ? ` [${species.role}]` : '';
    return {
      success: true,
      summon,
      speciesId,
      message: `🥚 *EGG HATCHED!*\n\n${species.icon} *${species.name}*${roleLabel}\n${species.desc}\n\n_Rarity: ${species.rarity}_\n_Element: ${species.element}_\n\n💡 Use \`${botConfig.getPrefix()} summon deploy ${summon.summonId}\` to deploy it in combat!`
    };
  } catch (e) {
    console.error('[SummonEgg] hatchEgg failed:', e.message);
    return { success: false, message: `❌ Hatch failed: ${e.message}` };
  }
}

// ─── CRAFT AN EGG FROM FRAGMENTS ──────────────────────────────────
// Combines 10 fragments → 1 egg of the next tier up.
// Returns { success, message }
async function craftEgg(userId, targetTier) {
  const tier = EGG_TIERS[targetTier];
  if (!tier || tier.isStarter) {
    return { success: false, message: '❌ Invalid egg tier. Available: rare, epic, legendary, mythic.' };
  }

  const fragId = tier.fragmentsRequired.id;
  const fragCount = tier.fragmentsRequired.count;

  // Check fragments
  if (!inventorySystem.hasItem(userId, fragId, fragCount)) {
    const have = inventorySystem.getItemCount(userId, fragId);
    const fragName = lootSystem.getItemInfo(fragId)?.name || fragId;
    return {
      success: false,
      message: `❌ Need ${fragCount}x ${fragName} to craft a ${lootSystem.getItemInfo(tier.eggId)?.name}. You have ${have}.`
    };
  }

  // Consume fragments + create egg
  inventorySystem.removeItem(userId, fragId, fragCount);
  inventorySystem.addItem(userId, tier.eggId, 1);

  const eggName = lootSystem.getItemInfo(tier.eggId)?.name || tier.eggId;
  const fragName = lootSystem.getItemInfo(fragId)?.name || fragId;
  return {
    success: true,
    message: `✨ *EGG CRAFTED!*\n\nUsed ${fragCount}x ${fragName} → ${eggName}\n\n_Use \`${botConfig.getPrefix()} use ${tier.eggId}\` to hatch it!_`
  };
}

// ─── GET WILD SUMMON FOR ABYSS ENCOUNTER ──────────────────────────
// Called by the Abyss system when a wild summon encounter triggers.
// Returns a combat-ready enemy object scaled to the floor.
function generateWildSummonEncounter(floor) {
  // Pick a random species from the registry (weighted by floor depth)
  // 💡 FIX 2026-08-03 (bug report #3): getAllSpecies() returns an ARRAY of
  // species ID strings, not an object. The old code did Object.entries() on
  // the array, which gave [[0, 'skeleton'], [1, 'skeleton_knight'], ...] —
  // so 's' was a STRING, s.rarity was undefined, the filter rejected
  // everything, pool.length was 0, and the function returned null.
  // Result: Wild Summon encounters NEVER spawned, despite the 10% chance
  // in generateFloorEncounter(). Players reached floor 75+ with zero
  // encounters.
  // Fix: use getSpecies(id) to resolve each ID to the species object.
  const speciesIds = registry.getAllSpecies();

  // Determine which rarities can appear based on floor
  let allowedRarities;
  if (floor >= 50) allowedRarities = ['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
  else if (floor >= 21) allowedRarities = ['UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
  else if (floor >= 11) allowedRarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC'];
  else allowedRarities = ['COMMON', 'UNCOMMON', 'RARE'];

  // Build pool of {id, species} pairs filtered by allowed rarity
  const pool = [];
  for (const id of speciesIds) {
    const species = registry.getSpecies(id);
    if (species && allowedRarities.includes(species.rarity)) {
      pool.push({ id, species });
    }
  }
  if (pool.length === 0) return null;

  // Weight: lower rarity = more common
  const RARITY_WEIGHT = { COMMON: 50, UNCOMMON: 30, RARE: 15, EPIC: 8, LEGENDARY: 3, MYTHIC: 1 };
  const weighted = [];
  for (const { id, species } of pool) {
    const weight = RARITY_WEIGHT[species.rarity] || 1;
    for (let i = 0; i < weight; i++) weighted.push(id);
  }

  const speciesId = weighted[Math.floor(Math.random() * weighted.length)];
  const species = registry.getSpecies(speciesId);
  if (!species) return null;

  // Scale stats by floor
  const floorMult = 1.0 + (floor - 1) * 0.20; // 20% per floor
  const hp = Math.floor((species.baseStats.hp || 100) * floorMult);
  const atk = Math.floor((species.baseStats.atk || 10) * floorMult);
  const def = Math.floor((species.baseStats.def || 5) * floorMult);
  const mag = Math.floor((species.baseStats.mag || 5) * floorMult);
  const spd = Math.floor((species.baseStats.spd || 10) * floorMult);

  return {
    type: 'wild_summon',
    speciesId,
    species,
    enemy: {
      id: speciesId,
      name: `Wild ${species.name}`,
      icon: species.icon || '🐉',
      isEnemy: true,
      isBoss: false,
      isWildSummon: true,
      level: Math.max(1, floor),
      stats: {
        hp, maxHp: hp,
        atk, def, mag, spd,
      },
      currentHP: hp,
      maxHP: hp,
      mana: 100,
      maxMana: 100,
      archetype: species.archetype || 'BRUTE',
      abilities: [],
      statusEffects: [],
      cooldowns: {},
      actionGauge: 0,
      xpReward: Math.floor(50 * floorMult),
      goldReward: Math.floor(100 * floorMult),
      isDead: false,
      justDied: false,
    }
  };
}

// ─── GET FRAGMENT DROP FOR ABYSS FLOOR ────────────────────────────
// Called when a wild summon is defeated. Returns the fragment item ID
// + quantity based on floor depth + species rarity.
function getFragmentDrop(floor, speciesRarity) {
  // Determine fragment tier based on floor + species rarity
  let fragmentTier;
  if (floor >= 50 || speciesRarity === 'MYTHIC') fragmentTier = 'legendary';
  else if (floor >= 21 || speciesRarity === 'LEGENDARY') fragmentTier = 'epic';
  else if (floor >= 11 || speciesRarity === 'EPIC') fragmentTier = 'rare';
  else fragmentTier = 'common';

  // Rare chance to drop one tier higher
  if (Math.random() < 0.10) {
    const tiers = ['common', 'rare', 'epic', 'legendary', 'mythic'];
    const idx = tiers.indexOf(fragmentTier);
    if (idx < tiers.length - 1) fragmentTier = tiers[idx + 1];
  }

  const fragmentId = `${fragmentTier}_fragment`;

  // Quantity: 1-3 normally, 2-5 on boss floors
  const quantity = Math.floor(Math.random() * 3) + 1;

  return { fragmentId, quantity };
}

// ─── EXPORTS ──────────────────────────────────────────────────────
module.exports = {
  EGG_TIERS,
  STARTER_SPECIES,
  hatchEgg,
  craftEgg,
  generateWildSummonEncounter,
  getFragmentDrop,
};
