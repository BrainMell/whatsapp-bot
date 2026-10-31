// ═══════════════════════════════════════════════════════════════════════════
//  SUMMON EGG SYSTEM - eggs, hatching, fragments, crafting
// ═══════════════════════════════════════════════════════════════════════════
//
// The Summon Progression Loop:
//   1. Player buys Basic Summon Egg from shop → spins for 1 of 4 starters
//   2. Player explores Abyss → 10% chance per floor to encounter a Wild Summon
//   3. Defeat Wild Summon → drops Summon Fragments (tiered by floor depth)
//   4. Craft higher-tier eggs from fragments → hatch into stronger summons
//   5. Eggs have incubation time (1h-48h by tier) - speed up with Zeni
//
// Fragment tiers → egg tiers → summon rarities:
//   Common Fragment   → (craft) → Rare Egg     → hatches RARE summon
//
// 💡 RETIRED 2026-11-01 (dead-content removal): the EPIC/LEGENDARY/MYTHIC
// egg tiers were removed. The registry has zero EPIC+ species, so those
// eggs could only ever hatch a common starter ("10 fragments → a bat").
// Fragment drops now cap at RARE. Pre-removal eggs/fragments in player
// bags get an explicit "retired" message and can be sold for Zeni.
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
// stale species that no longer exist - basic eggs would fail at createSummon.
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
  // 💡 RETIRED 2026-11-01: epic/legendary/mythic tiers removed - the registry
  // contains no EPIC+ species (rarityPool was always empty → silent starter
  // fallback). Re-add tiers ONLY together with new EPIC+ registry species.
};

// Pre-removal eggs still sitting in player bags: fail honestly instead of
// "Invalid egg type." / silently hatching a common starter.
const RETIRED_EGGS = {
  epic_summon_egg: 'Epic Summon Egg',
  legendary_summon_egg: 'Legendary Summon Egg',
  mythic_summon_egg: 'Mythic Summon Egg',
};

// ─── HATCH AN EGG ─────────────────────────────────────────────────
// Spins for a random summon from the appropriate pool + creates it.
// For basic eggs: 1 of 4 starters (guaranteed, equal chance).
// For tiered eggs: random summon of that rarity from the registry.
// Returns { success, message, summon? }
async function hatchEgg(userId, eggId) {
  const tier = Object.values(EGG_TIERS).find(t => t.eggId === eggId);
  if (!tier) {
    if (RETIRED_EGGS[eggId]) {
      return {
        success: false,
        message: `🚫 The ${RETIRED_EGGS[eggId]} has been retired - no EPIC+ summons exist in the world yet, so it could never hatch one.\n_Sell it on the market or to other players; it keeps its item value._`
      };
    }
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
    // from crafted eggs - they always got a starter.
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
  if (userSummons.length >= (user.summonSlots || 5)) {
    return {
      success: false,
      message: `❌ Summon slots full (${userSummons.length}/${user.summonSlots || 5}). Release a summon or buy more slots.`
    };
  }

  // Consume the egg
  // 💡 FIX 2026-10-31: check the removal result. The old code ignored it -
  // a double-tapped '.summon hatch' raced: message B passed hasItem while
  // message A was parked at the getUserSummons await below, then B's
  // removeItem failed silently and B still created a summon (2 summons, 1 egg).
  const removed = inventorySystem.removeItem(userId, eggId, 1);
  if (!removed || removed.success === false) {
    return { success: false, message: `❌ You don't have a ${lootSystem.getItemInfo(eggId)?.name || eggId} anymore.` };
  }

  // Create the summon
  try {
    const summon = await summonSystem.createSummon(userId, speciesId, {
      nickname: species.name,
      tier: 'BASE',
    });

    if (!summon) {
      // 💡 FIX 2026-10-31: refund the egg - it was already consumed above.
      inventorySystem.addItem(userId, eggId, 1).catch(() => {});
      return { success: false, message: '❌ Failed to create summon. Please report this.' };
    }

    const roleLabel = species.role ? ` [${species.role}]` : '';
    return {
      success: true,
      summon,
      speciesId,
      message: `🥚 *EGG HATCHED!*\n\n${species.icon} *${species.name}*${roleLabel}\n${species.desc}\n\n_Rarity: ${species.rarity}_\n_Element: ${species.element}_\n\n💡 Use \`${botConfig.getPrefix()} summons\` to view your roster, then \`${botConfig.getPrefix()} summon deploy <#>\` to deploy it!`
    };
  } catch (e) {
    console.error('[SummonEgg] hatchEgg failed:', e.message);
    // 💡 FIX 2026-10-31: refund the egg on failure instead of eating it.
    inventorySystem.addItem(userId, eggId, 1).catch(() => {});
    return { success: false, message: `❌ Hatch failed: ${e.message}` };
  }
}

// ─── CRAFT AN EGG FROM FRAGMENTS ──────────────────────────────────
// Combines 10 fragments → 1 egg of the next tier up.
// Returns { success, message }
async function craftEgg(userId, targetTier) {
  const tier = EGG_TIERS[targetTier];
  if (!tier || tier.isStarter) {
    return { success: false, message: '❌ Invalid egg tier. Available: rare (10x Common Fragment).' };
  }

  const fragId = tier.fragmentsRequired.id;
  const fragCount = tier.fragmentsRequired.count;
  // TDZ FIX 2026-10-24 (Box2 live: "Cannot access 'fragName' before
  // initialization" on every inventory-full craft): the refund path below
  // (addRes failure) reads fragName BEFORE the function-scope declaration that
  // used to sit at the bottom of craftEgg. One hoisted declaration, no
  // shadowing duplicates.
  const fragName = lootSystem.getItemInfo(fragId)?.name || fragId;

  // Check fragments
  if (!inventorySystem.hasItem(userId, fragId, fragCount)) {
    const have = inventorySystem.getItemCount(userId, fragId);
    return {
      success: false,
      message: `❌ Need ${fragCount}x ${fragName} to craft a ${lootSystem.getItemInfo(tier.eggId)?.name}. You have ${have}.`
    };
  }

  // Consume fragments + create egg
  // 💡 FIX 2026-10-10: addItem is ASYNC and can FAIL (inventory full) - the old
  // fire-and-forget call consumed the 10 fragments and then silently added NO
  // egg while still returning the success message (players lost fragments and
  // reported "can't use summons"). Now: await the add; on failure REFUND the
  // fragments and return the honest error.
  inventorySystem.removeItem(userId, fragId, fragCount);
  const addRes = await inventorySystem.addItem(userId, tier.eggId, 1);
  if (!addRes || addRes.success === false) {
    // Refund (the fragment stack slot existed before we consumed it)
    try {
      await inventorySystem.addItem(userId, fragId, fragCount);
    } catch (e) {
      console.error('[SummonEgg] fragment refund failed:', e.message);
    }
    return {
      success: false,
      message: `❌ Couldn't craft the egg - ${addRes?.message || 'inventory is full'}.\n_Your ${fragCount}x ${fragName} were refunded. Free up a bag slot and try again._`
    };
  }

  const eggName = lootSystem.getItemInfo(tier.eggId)?.name || tier.eggId;
  return {
    success: true,
    message: `✨ *EGG CRAFTED!*\n\nUsed ${fragCount}x ${fragName} → ${eggName}\n\n_Use \`${botConfig.getPrefix()} summon hatch ${tier.eggId}\` to hatch it!_`
  };
}

// ─── GET WILD SUMMON FOR ABYSS ENCOUNTER ──────────────────────────
// Called by the Abyss system when a wild summon encounter triggers.
// Returns a combat-ready enemy object scaled to the floor.
function generateWildSummonEncounter(floor) {
  // Pick a random species from the registry (weighted by floor depth)
  // 💡 FIX 2026-08-03 (bug report #3): getAllSpecies() returns an ARRAY of
  // species ID strings, not an object. The old code did Object.entries() on
  // the array, which gave [[0, 'skeleton'], [1, 'skeleton_knight'], ...] -
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
  // 💡 RETIRED 2026-11-01: fragment tiers cap at RARE now (no EPIC+ egg tiers
  // to craft towards). Deep floors used to drop epic/legendary fragments that
  // could only craft retired eggs - that would have made deep-floor fragment
  // sources dead too. Floor 11+ / EPIC+ species now drop rare fragments.
  let fragmentTier;
  if (floor >= 11 || ['EPIC', 'LEGENDARY', 'MYTHIC'].includes(speciesRarity)) fragmentTier = 'rare';
  else fragmentTier = 'common';

  // Rare chance to upgrade a common fragment to rare
  if (fragmentTier === 'common' && Math.random() < 0.10) fragmentTier = 'rare';

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
