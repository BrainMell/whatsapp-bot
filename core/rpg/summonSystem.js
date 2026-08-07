// ============================================
// 🐉 SUMMON SYSTEM — main logic
// ============================================
// Factory, persistence, stat computation, resonance computation,
// deploy/dismiss, loyalty, personality tracking.
//
// Combat AI lives in core/rpg/summonAI.js (Phase 2).
// Static data lives in core/rpg/summonRegistry.js.
// Mongoose model: core/models/Summon.js.
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md

const crypto = require('crypto');
const Summon = require('../models/Summon');
const registry = require('./summonRegistry');
const economy = require('./economy');

// ─────────────────────────────────────────────────────────────
// FACTORY — create a new summon instance
// ─────────────────────────────────────────────────────────────

/**
 * Create a new summon instance.
 * @param {string} ownerJid - Owner's JID
 * @param {string} speciesId - SUMMON_SPECIES key
 * @param {object} opts - { obtainedFrom, nickname, level, loyalty }
 * @returns {Promise<object>} - Mongoose Summon document
 */
async function createSummon(ownerJid, speciesId, opts = {}) {
  const species = registry.getSpecies(speciesId);
  if (!species) {
    throw new Error(`Unknown summon species: ${speciesId}`);
  }

  // 💡 AUDIT FIX 2026-08-01: short readable IDs instead of long timestamp+hex.
  // Old: "sum_1699999999999_a1b2c3d4" (30+ chars)
  // New: "S-3F7A" (6 chars, 4 hex = 65K unique IDs, enough for this bot)
  const shortId = crypto.randomBytes(2).toString('hex').toUpperCase();
  const summonId = `S-${shortId}`;
  const level = opts.level || 1;
  const rarity = species.rarity;
  const rarityConfig = registry.getRarityConfig(rarity);

  // Cap level by rarity
  const effectiveLevel = Math.min(level, rarityConfig.maxLevel);

  const summon = new Summon({
    summonId,
    ownerJid,
    species: speciesId,
    archetype: species.archetype,
    element: species.element,
    tier: 'BASE',
    rarity,
    nickname: opts.nickname || null,
    level: effectiveLevel,
    xp: 0,
    statPoints: 0,
    skillPoints: 0,
    chosenSkillPath: null,
    unlockedSkillNodes: [],
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    baseStats: { ...species.baseStats },
    loyalty: opts.loyalty !== undefined ? opts.loyalty : 100,
    personality: 'STOIC',
    behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 },
    bond: 0,
    bondXp: 0,
    traits: require('./summonBondTraits').rollTraits(rarity),  // PHASE 4: roll traits
    aiMode: 'BALANCED',
    summonEquipment: { claw: null, core: null, armor: null, crest: null, relic: null },
    lineage: [],
    socketedRuneIds: [],
    echoId: species.echoId,
    trialCompleted: false,
    forSale: false,
    salePrice: null,
    onAuction: false,
    isLocked: false,
    soulboundUntil: null,
    obtainedAt: new Date(),
    obtainedFrom: opts.obtainedFrom || 'unknown',
    lastUsedAt: null,
    lastTrainedAt: null
  });

  // Apply level-based stat growth (so a captured level-5 summon isn't weak)
  applyLevelGrowth(summon, effectiveLevel);

  await summon.save();
  return summon;
}

// ─────────────────────────────────────────────────────────────
// STAT COMPUTATION
// ─────────────────────────────────────────────────────────────

/**
 * Apply level-based stat growth to a summon.
 * Called at creation (if level > 1) and on level-up.
 * Uses rarity-configured growth multiplier.
 * @param {object} summon - Summon document (mutated in place)
 * @param {number} targetLevel - Level to grow to
 */
function applyLevelGrowth(summon, targetLevel) {
  const species = registry.getSpecies(summon.species);
  if (!species) return;

  const rarityConfig = registry.getRarityConfig(summon.rarity);
  const growthMult = rarityConfig.statGrowthMult;

  // Recompute baseStats from species + level + rarity
  // Formula: baseStat × (1 + (level-1) × 0.08 × growthMult)
  // At level 1: base stat unchanged. At level 50 with COMMON (1.0×): 1 + 49×0.08 = 4.92× base.
  // At level 50 with MYTHIC (1.75×): 1 + 49×0.08×1.75 = 7.86× base.
  const levelMult = 1 + (targetLevel - 1) * 0.08 * growthMult;

  summon.baseStats = {
    hp: Math.floor(species.baseStats.hp * levelMult),
    atk: Math.floor(species.baseStats.atk * levelMult),
    def: Math.floor(species.baseStats.def * levelMult),
    mag: Math.floor(species.baseStats.mag * levelMult),
    spd: Math.floor(species.baseStats.spd * levelMult)
  };
}

/**
 * Recompute a summon's effective stats from baseStats + allocatedStats + loyalty.
 * This is the "effective stats" used in combat — NOT the persisted baseStats.
 * Mirrors inventorySystem.recalculateEnhancedStats pattern.
 *
 * @param {object} summon - Summon document (or plain object)
 * @returns {object} - { hp, maxHp, atk, def, mag, spd, energy, maxEnergy, crit, evasion, dmgReduction }
 */
function computeEffectiveStats(summon) {
  if (!summon || !summon.baseStats) {
    return { hp: 100, maxHp: 100, atk: 10, def: 5, mag: 5, spd: 10, energy: 100, maxEnergy: 100, crit: 5, evasion: 5, dmgReduction: 0 };
  }

  // Tier bonus: BASE = 1.0, ASCENDED = 1.2, TRANSCENDENT = 1.4
  const tierMult = { BASE: 1.0, ASCENDED: 1.2, TRANSCENDENT: 1.4 }[summon.tier] || 1.0;

  // Loyalty gate (mirrors durabilitySystem.getConditionMultiplier)
  let loyaltyMult = 1.0;
  if (summon.loyalty >= 75) loyaltyMult = 1.0;
  else if (summon.loyalty >= 50) loyaltyMult = 0.85;
  else if (summon.loyalty >= 25) loyaltyMult = 0.60;
  else if (summon.loyalty >= 1) loyaltyMult = 0.30;
  else loyaltyMult = 0;  // refuses to fight

  // Allocated stats (with soft cap)
  const softCap = registry.SUMMON_XP_CONFIG.SOFT_CAP_THRESHOLD;
  const softCapMult = registry.SUMMON_XP_CONFIG.SOFT_CAP_MULT;
  const alloc = summon.allocatedStats || { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 };

  function applySoftCap(points) {
    if (points <= softCap) return points;
    return softCap + (points - softCap) * softCapMult;
  }

  // Stat value per point (mirrors progression.js stat value table)
  const statValues = { hp: 15, atk: 3, def: 2, mag: 3, spd: 2 };

  // Compute final stats
  const baseAtk = (summon.baseStats.atk + applySoftCap(alloc.atk) * statValues.atk) * tierMult * loyaltyMult;
  const baseDef = (summon.baseStats.def + applySoftCap(alloc.def) * statValues.def) * tierMult * loyaltyMult;
  const baseMag = (summon.baseStats.mag + applySoftCap(alloc.mag) * statValues.mag) * tierMult * loyaltyMult;
  const baseSpd = (summon.baseStats.spd + applySoftCap(alloc.spd) * statValues.spd) * tierMult * loyaltyMult;
  const baseHp = (summon.baseStats.hp + applySoftCap(alloc.hp) * statValues.hp) * tierMult * loyaltyMult;

  // 💡 PHASE 2 (2026-08-01): apply skill tree passive bonuses
  // Skill tree passives add flat stat bonuses + special effects (dmgReduction,
  // lifesteal, evasion, etc.) that are merged into the final stats.
  let skillBonuses = {};
  try {
    const summonSkillTrees = require('./summonSkillTrees');
    skillBonuses = summonSkillTrees.getPassiveEffects(summon);
  } catch (e) {}

  const skillAtk = skillBonuses.atk || 0;
  const skillDef = skillBonuses.def || 0;
  const skillMag = skillBonuses.mag || 0;
  const skillSpd = skillBonuses.spd || 0;
  const skillHp = skillBonuses.hp || 0;
  const skillCrit = skillBonuses.crit || 0;

  // 💡 PHASE 4 (2026-08-01): apply bond + trait bonuses
  let bondMult = 0;
  let traitEffects = {};
  try {
    const summonBondTraits = require('./summonBondTraits');
    bondMult = summonBondTraits.getBondStatMult(summon.bond || 0);
    traitEffects = summonBondTraits.getTraitEffects(summon);
  } catch (e) {}

  // Trait multipliers (applied to base stats)
  const traitAtkMult = 1 + (traitEffects.atkMult || 0) + (traitEffects.allStatsMult || 0) + (traitEffects.damageMult || 0);
  const traitDefMult = 1 + (traitEffects.defMult || 0) + (traitEffects.allStatsMult || 0);
  const traitMagMult = 1 + (traitEffects.magMult || 0) + (traitEffects.allStatsMult || 0);
  const traitSpdMult = 1 + (traitEffects.spdMult || 0) + (traitEffects.allStatsMult || 0);
  const traitHpMult = 1 + (traitEffects.hpMult || 0) + (traitEffects.allStatsMult || 0);
  // Bond multiplier (applied to final stats)
  const bondMultFinal = 1 + bondMult;

  // 💡 PHASE 5 (2026-08-01): apply summon equipment bonuses
  // Summon equipment adds flat stats + special effects (allStatsMult, lifesteal, etc.)
  let gearAtk = 0, gearDef = 0, gearMag = 0, gearSpd = 0, gearHp = 0, gearCrit = 0;
  let gearAllStatsMult = 0, gearLifesteal = 0, gearEvasion = 0;
  if (summon.summonEquipment) {
    for (const slot of ['claw', 'core', 'armor', 'crest', 'relic']) {
      const gear = summon.summonEquipment[slot];
      if (!gear || !gear.stats) continue;
      gearAtk += gear.stats.atk || 0;
      gearDef += gear.stats.def || 0;
      gearMag += gear.stats.mag || 0;
      gearSpd += gear.stats.spd || 0;
      gearHp += gear.stats.hp || 0;
      gearCrit += gear.stats.crit || 0;
      gearAllStatsMult += gear.stats.allStatsMult || 0;
      gearLifesteal += gear.stats.lifestealPct || 0;
      gearEvasion += gear.stats.evasion || 0;
    }
  }
  const gearMultFinal = 1 + gearAllStatsMult;

  // Derived stats with skill + trait + bond + equipment bonuses
  return {
    hp: Math.floor(((baseHp + skillHp) * traitHpMult + gearHp) * bondMultFinal * gearMultFinal),
    maxHp: Math.floor(((baseHp + skillHp) * traitHpMult + gearHp) * bondMultFinal * gearMultFinal),
    atk: Math.floor(((baseAtk + skillAtk) * traitAtkMult + gearAtk) * bondMultFinal * gearMultFinal),
    def: Math.floor(((baseDef + skillDef) * traitDefMult + gearDef) * bondMultFinal * gearMultFinal),
    mag: Math.floor(((baseMag + skillMag) * traitMagMult + gearMag) * bondMultFinal * gearMultFinal),
    spd: Math.floor(((baseSpd + skillSpd) * traitSpdMult + gearSpd) * bondMultFinal * gearMultFinal),
    energy: 100,
    maxEnergy: 100,
    crit: 5 + Math.floor(summon.level * 0.2) + skillCrit,
    evasion: Math.min(60, Math.floor(baseSpd * 0.12) + (skillBonuses.evasion || 0)),
    dmgReduction: Math.min(75, Math.floor(baseDef * 0.55) + (skillBonuses.dmgReduction || 0)),
    // 💡 PHASE 2: store special skill effects on the stats object so combat can read them
    skillEffects: skillBonuses,
  };
}

// ─────────────────────────────────────────────────────────────
// COMBAT POWER (CP) — derived rating for matchmaking + flee penalty
// ─────────────────────────────────────────────────────────────
// 💡 NEW 2026-08-05: CP is a single-number rating that summarizes a summon's
// overall combat strength. Used for:
//   - Summon PvP flee penalty (fleeing reduces CP by a flat amount)
//   - Future matchmaking (matching summon duels by CP)
//   - Display in roster/detail cards
//
// Formula: weighted sum of effective stats + level + rarity multiplier.
// Higher rarity = higher CP ceiling. CP is NOT persisted — it's derived
// from current stats + level + loyalty + equipment, recomputed on demand.

function computeCP(summon) {
  if (!summon) return 0;
  const stats = computeEffectiveStats(summon);
  const rarityConfig = registry.getRarityConfig(summon.rarity);
  const rarityMult = rarityConfig.statGrowthMult || 1.0;

  // Weighted stat sum (atk/mag weighted higher than def/spd; hp scaled down)
  const statScore =
    (stats.hp || 0) * 0.3 +
    (stats.atk || 0) * 2.0 +
    (stats.def || 0) * 1.5 +
    (stats.mag || 0) * 2.0 +
    (stats.spd || 0) * 1.0 +
    (stats.crit || 0) * 3.0 +
    (stats.evasion || 0) * 2.0;

  // Level bonus: +2% per level above 1
  const levelBonus = 1 + ((summon.level || 1) - 1) * 0.02;

  // Rarity multiplier applied last
  const cp = Math.floor(statScore * levelBonus * rarityMult);
  return cp;
}

// ─────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────

/**
 * Get a single summon by summonId.
 * @param {string} summonId
 * @returns {Promise<object|null>}
 */
async function getSummon(summonId) {
  return await Summon.findOne({ summonId });
}

/**
 * Get all summons owned by a user.
 * @param {string} ownerJid
 * @param {object} opts - { includeForSale: false } to exclude listed summons
 * @returns {Promise<array>}
 */
async function getUserSummons(ownerJid, opts = {}) {
  // 💡 MAIN DECK SYSTEM: by default, only return Main Deck summons (deployable).
  // Use opts.includeBacklog=true to get ALL summons (Main Deck + Backlog).
  // 💡 FIX 2026-08-04: Don't filter by inMainDeck in the MongoDB query —
  // Mongoose strictQuery can strip it for old documents that don't have
  // the field in their raw BSON. Instead, fetch all and filter in JS.
  const query = { ownerJid };
  if (opts.includeForSale === false) {
    query.forSale = false;
  }
  let results = await Summon.find(query).sort({ obtainedAt: 1 });
  if (!opts.includeBacklog) {
    // Filter to Main Deck only (inMainDeck defaults to true for old summons)
    results = results.filter(s => s.inMainDeck !== false);
  }
  return results;
}

/**
 * Save a summon (alias for summon.save() with error handling).
 * @param {object} summon
 */
async function saveSummon(summon) {
  if (!summon) return;
  await summon.save();
}

// ─────────────────────────────────────────────────────────────
// DEPLOY / DISMISS — equip/unequip a summon for combat
// ─────────────────────────────────────────────────────────────

/**
 * Deploy a summon (set as active for combat).
 * @param {object} user - Economy user object
 * @param {string} summonId
 * @returns {Promise<{success: boolean, message: string, summon?: object}>}
 */
async function deploySummon(user, summonId) {
  if (!user) return { success: false, message: '❌ User not found.' };

  const summon = await Summon.findOne({ summonId, ownerJid: user.userId });
  if (!summon) {
    return { success: false, message: '❌ Summon not found in your collection.' };
  }

  if (summon.forSale) {
    return { success: false, message: '❌ Cannot deploy a summon listed for sale. Cancel the listing first.' };
  }

  if (summon.loyalty <= 0) {
    return { success: false, message: '❌ This summon\'s loyalty is depleted. Restore it with a Loyalty Crystal before deploying.' };
  }

  if (summon.isLocked) {
    return { success: false, message: '❌ This summon is locked and cannot be deployed.' };
  }

  // 💡 RULE: Only one summon can be deployed at a time. If switching,
  // the previous one is automatically dismissed.
  if (user.activeSummonId && user.activeSummonId !== summonId) {
    user.activeSummonId = summonId;
    summon.lastUsedAt = new Date();
    await summon.save();
    economy.saveUser(user);  // 💡 FIX: was missing — deploy didn't persist
    return {
      success: true,
      message: `\u2705 Deployed *${summon.nickname || summon.species}*!\n_Previous summon dismissed \u2014 only 1 summon can be active at a time._`,
    };
  }

  user.activeSummonId = summonId;
  summon.lastUsedAt = new Date();
  await summon.save();
  economy.saveUser(user);  // 💡 FIX: was missing — deploy didn't persist

  return {
    success: true,
    message: `🐉 Deployed ${summon.nickname || registry.getSpecies(summon.species)?.name || summon.species}!`,
    summon
  };
}

/**
 * Dismiss the active summon (unequip).
 * @param {object} user - Economy user object
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function dismissSummon(user) {
  if (!user || !user.activeSummonId) {
    return { success: false, message: '❌ No summon currently deployed.' };
  }

  const summonId = user.activeSummonId;
  user.activeSummonId = null;
  economy.saveUser(user);  // 💡 FIX: was missing — dismiss didn't persist

  return {
    success: true,
    message: `🐉 Dismissed active summon.`
  };
}

/**
 * Get the user's active (deployed) summon.
 * @param {object} user - Economy user object
 * @returns {Promise<object|null>} - Summon document or null
 */
async function getActiveSummon(user) {
  if (!user || !user.activeSummonId) return null;
  const summon = await Summon.findOne({ summonId: user.activeSummonId, ownerJid: user.userId });
  if (!summon) {
    // Active summon ID is stale — clear it
    user.activeSummonId = null;
    return null;
  }
  if (summon.forSale || summon.loyalty <= 0 || summon.isLocked) {
    // Summon became invalid for combat — clear it
    user.activeSummonId = null;
    return null;
  }
  return summon;
}

// ─────────────────────────────────────────────────────────────
// RELEASE — permanently release a summon (leaves no echo)
// ─────────────────────────────────────────────────────────────

/**
 * Permanently release a summon (delete from collection).
 * Cannot release active summons, locked summons, or listed summons.
 * @param {string} ownerJid
 * @param {string} summonId
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function releaseSummon(ownerJid, summonId) {
  const summon = await Summon.findOne({ summonId, ownerJid });
  if (!summon) {
    return { success: false, message: '❌ Summon not found in your collection.' };
  }

  if (summon.forSale || summon.onAuction) {
    return { success: false, message: '❌ Cannot release a summon listed on the market. Cancel the listing first.' };
  }

  if (summon.isLocked) {
    return { success: false, message: '❌ This summon is locked and cannot be released.' };
  }

  await Summon.deleteOne({ summonId });

  return {
    success: true,
    message: `🐉 Released ${summon.nickname || registry.getSpecies(summon.species)?.name || summon.species}. It returns to the wild.`
  };
}

// ─────────────────────────────────────────────────────────────
// RESONANCE COMPUTATION
// ─────────────────────────────────────────────────────────────

/**
 * Compute active resonances for a set of summons.
 * A resonance is active if the player owns summons meeting the `requires` criteria.
 * Only counts summons with loyalty > 0 AND not forSale (prevents exploitation).
 *
 * @param {array} summons - Array of Summon documents
 * @returns {array} - Array of active resonance IDs
 */
function computeResonances(summons) {
  if (!summons || summons.length === 0) return [];

  // Count summons by element (only eligible ones)
  const elementCounts = {};
  for (const summon of summons) {
    if (summon.loyalty <= 0) continue;
    if (summon.forSale) continue;
    const el = summon.element || 'neutral';
    elementCounts[el] = (elementCounts[el] || 0) + 1;
  }

  // Check each resonance
  const activeResonances = [];
  for (const [resonanceId, resonance] of Object.entries(registry.RESONANCE_WEB)) {
    const requires = resonance.requires;
    let met = true;
    for (const [element, count] of Object.entries(requires)) {
      if ((elementCounts[element] || 0) < count) {
        met = false;
        break;
      }
    }
    if (met) {
      activeResonances.push(resonanceId);
    }
  }

  return activeResonances;
}

/**
 * Update a user's cached activeResonances.
 * Called on summon acquire/release/evolve/market list/cancel.
 * @param {object} user - Economy user object
 * @returns {Promise<array>} - New activeResonances array
 */
async function refreshUserResonances(user) {
  if (!user) return [];
  const summons = await getUserSummons(user.userId);
  user.activeResonances = computeResonances(summons);
  return user.activeResonances;
}

// ─────────────────────────────────────────────────────────────
// LOYALTY
// ─────────────────────────────────────────────────────────────

const LOYALTY_TRAITS = {
  ETERNAL_BOND: { decayMult: 0, desc: 'No loyalty decay' },
  DEVOTED: { decayMult: 0.5, desc: 'Half loyalty decay' },
  VOLATILE_PACT: { decayMult: 2.0, desc: 'Double loyalty decay, +50% damage' },
  NORMAL: { decayMult: 1.0, desc: 'Standard loyalty decay' }
};

const BASE_LOYALTY_DECAY = 2;  // per combat action

/**
 * Apply loyalty decay for one combat action.
 * @param {object} summon - Summon document (mutated in place)
 * @param {string} trait - LOYALTY_TRAITS key (default 'NORMAL')
 * @returns {number} - Amount of loyalty lost
 */
function applyLoyaltyDecay(summon, trait = 'NORMAL') {
  if (!summon) return 0;
  const traitConfig = LOYALTY_TRAITS[trait] || LOYALTY_TRAITS.NORMAL;
  const decay = BASE_LOYALTY_DECAY * traitConfig.decayMult;
  const oldLoyalty = summon.loyalty;
  summon.loyalty = Math.max(0, summon.loyalty - decay);
  return oldLoyalty - summon.loyalty;
}

/**
 * Restore loyalty (via Loyalty Crystal consumable or guild perk).
 * @param {object} summon - Summon document (mutated in place)
 * @param {number} amount - Amount to restore
 * @returns {number} - New loyalty value
 */
function restoreLoyalty(summon, amount) {
  if (!summon || amount <= 0) return summon?.loyalty || 0;
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return summon.loyalty;
  summon.loyalty = Math.min(100, summon.loyalty + val);
  return summon.loyalty;
}

// ─────────────────────────────────────────────────────────────
// XP + LEVELING
// ─────────────────────────────────────────────────────────────

/**
 * Add XP to a summon. Handles level-up (max 50).
 * @param {object} summon - Summon document (mutated in place)
 * @param {number} amount - XP to add
 * @returns {{leveledUp: boolean, newLevel: number, statPointsGained: number}}
 */
function addSummonXP(summon, amount) {
  if (!summon) return { leveledUp: false, newLevel: 1, statPointsGained: 0, newlyUnlockedAbilities: [] };

  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return { leveledUp: false, newLevel: summon.level, statPointsGained: 0, newlyUnlockedAbilities: [] };

  summon.xp += val;
  let leveledUp = false;
  let statPointsGained = 0;
  const newlyUnlockedAbilities = []; // 💡 NEW: track abilities unlocked this level-up
  summon.statPoints = summon.statPoints || 0;  // defensive — prevent NaN on undefined
  const rarityConfig = registry.getRarityConfig(summon.rarity);
  const maxLevel = rarityConfig.maxLevel;

  while (summon.level < maxLevel) {
    const xpNeeded = registry.getSummonXPForLevel(summon.level + 1) - registry.getSummonXPForLevel(summon.level);
    if (summon.xp < xpNeeded) break;

    summon.xp -= xpNeeded;
    const oldLevel = summon.level;
    summon.level += 1;
    summon.statPoints += registry.SUMMON_XP_CONFIG.STAT_POINTS_PER_LEVEL;
    statPointsGained += registry.SUMMON_XP_CONFIG.STAT_POINTS_PER_LEVEL;
    // 💡 PHASE 2 (2026-08-01): grant 1 skill point per level
    summon.skillPoints = (summon.skillPoints || 0) + 1;
    leveledUp = true;

    // 💡 NEW 2026-08-05: Detect abilities that unlocked at the new level.
    // Summon abilities auto-unlock at levelReq milestones (from monsterSkills.js).
    // Check which abilities became available between oldLevel+1 and new level.
    try {
      const monsterSkills = require('./monsterSkills');
      const arch = monsterSkills.MONSTER_ARCHETYPES[summon.archetype];
      if (arch) {
        for (const [skillId, skill] of Object.entries(arch.skills)) {
          if (skill.isFollowUp) continue;
          // Ability unlocked if its levelReq is > oldLevel AND <= new level
          if (skill.levelReq > oldLevel && skill.levelReq <= summon.level) {
            newlyUnlockedAbilities.push({
              id: skillId,
              name: skill.name,
              levelReq: skill.levelReq,
              msg: skill.msg || '',
              cost: skill.cost || 0,
            });
          }
        }
      }
    } catch (e) {
      // monsterSkills not available — skip ability detection
    }

    // Re-grow base stats to new level
    applyLevelGrowth(summon, summon.level);
  }

  if (summon.level >= maxLevel) {
    summon.xp = 0;  // cap XP at max level
  }

  return { leveledUp, newLevel: summon.level, statPointsGained, newlyUnlockedAbilities };
}

// ─────────────────────────────────────────────────────────────
// COMBAT ENTITY — convert a Summon document to a combat-ready entity
// ─────────────────────────────────────────────────────────────

/**
 * Build a combat entity from a Summon document.
 * This entity is pushed into state.turnOrder during combat.
 * Combat state is transient — not persisted to the Summon document.
 *
 * @param {object} summon - Summon document
 * @param {string} summonerJid - Owner's JID (for guard mode, echo target)
 * @returns {object} - Combat entity
 */
function buildCombatEntity(summon, summonerJid) {
  if (!summon) return null;

  const stats = computeEffectiveStats(summon);
  const species = registry.getSpecies(summon.species);

  const entity = {
    // Identity
    id: summon.summonId,
    name: summon.nickname || species?.name || summon.species,
    icon: species?.icon || '🐉',
    type: summon.species,
    // 💡 FIX 2026-08-03: Go service's Summon struct expects `species` (not `type`).
    // Without this, GetSummonSpritePath receives an empty string and the summon
    // is silently skipped — root cause of "no summons appearing in combat".
    species: summon.species,
    archetype: summon.archetype,
    element: summon.element,

    // Owner reference
    isSummon: true,
    isEnemy: false,
    summonerJid,
    // 💡 FIX 2026-08-03: Go service expects `ownerIndex` (not `summonerIndex`).
    // Set by deployPvPSummons / startCombat after the entity is created.
    // Default to 0 (first player) so it always has a valid value.
    ownerIndex: 0,

    // Stats (transient — rebuilt each combat)
    stats: {
      ...stats,
      maxHp: stats.maxHp,
      hp: stats.maxHp  // start at full HP
    },
    currentHP: stats.maxHp,
    // 💡 FIX 2026-08-03: Go service expects `maxHp` (lowercase p), not `maxHP`.
    // Go's json unmarshaling is case-insensitive, but be explicit to avoid
    // future regression if the Go struct tags change.
    maxHp: stats.maxHp,
    maxHP: stats.maxHp,
    mana: 100,
    maxMana: 100,

    // Combat state
    statusEffects: [],
    buffs: [],
    cooldowns: {},
    actionGauge: Math.floor(stats.spd / 2),  // players/summons start with spd/2 gauge (mirrors startCombat)
    isDead: false,
    justDied: false,

    // Summon-specific
    level: summon.level || 1, // 💡 NEW 2026-08-07: needed for skill scaling in evaluateAction
    personality: summon.personality,
    behaviorScore: { ...summon.behaviorScore },
    loyalty: summon.loyalty,
    isStationary: species?.isStationary || false,  // turrets can't move
    autoAttack: species?.autoAttack || false,

    // Echo to apply on death
    echoId: summon.echoId,

    // Reference back to the DB document (for post-combat persistence)
    _summonDoc: summon
  };

  // 💡 Phase 3: Apply class-based summon bonuses (Necromancer +30% undead, Lich +40%).
  // Looks up the owner's class via economy.getUser and applies the bonus
  // to the combat entity's stats. This is the "player → summon" direction
  // of Soul Resonance.
  try {
    const summonCapture = require('./summonCapture');
    const user = economy.getUser(summonerJid);
    if (user && user.class) {
      summonCapture.applyClassSummonBonus(entity, user.class);
    }
  } catch (e) {
    // Non-fatal — bonus is optional
    console.error('[Summon] applyClassSummonBonus failed:', e?.message || e);
  }

  return entity;
}

// ─────────────────────────────────────────────────────────────
// DAILY TRAINING (shared cooldown — 1/day per player, any 1 summon)
// ─────────────────────────────────────────────────────────────

const DAILY_TRAINING_COOLDOWN_MS = 24 * 60 * 60 * 1000;  // 24h
const DAILY_TRAINING_XP = 500;  // base XP per training session

/**
 * Train a summon (daily, shared cooldown across all summons).
 * @param {object} user - Economy user object
 * @param {string} summonId
 * @returns {Promise<{success: boolean, message: string, xpGained?: number, leveledUp?: boolean}>}
 */
async function trainSummon(user, summonId) {
  if (!user) return { success: false, message: '❌ User not found.' };

  const now = Date.now();
  if (user.lastSummonTrained && (now - user.lastSummonTrained) < DAILY_TRAINING_COOLDOWN_MS) {
    const remaining = DAILY_TRAINING_COOLDOWN_MS - (now - user.lastSummonTrained);
    const hoursLeft = Math.ceil(remaining / (60 * 60 * 1000));
    return { success: false, message: `❌ Daily training on cooldown. Try again in ${hoursLeft}h.` };
  }

  const summon = await Summon.findOne({ summonId, ownerJid: user.userId });
  if (!summon) {
    return { success: false, message: '❌ Summon not found in your collection.' };
  }

  if (summon.forSale) {
    return { success: false, message: '❌ Cannot train a summon listed for sale.' };
  }

  const rarityConfig = registry.getRarityConfig(summon.rarity);
  if (summon.level >= rarityConfig.maxLevel) {
    return { success: false, message: '❌ This summon has reached its maximum level.' };
  }

  user.lastSummonTrained = now;
  summon.lastTrainedAt = new Date();

  const { leveledUp, newLevel } = addSummonXP(summon, DAILY_TRAINING_XP);
  await summon.save();

  return {
    success: true,
    message: `✨ Trained ${summon.nickname || registry.getSpecies(summon.species)?.name || summon.species}! +${DAILY_TRAINING_XP} XP${leveledUp ? ` — leveled up to ${newLevel}!` : ''}`,
    xpGained: DAILY_TRAINING_XP,
    leveledUp
  };
}

// ─────────────────────────────────────────────────────────────
// STAT ALLOCATION
// ─────────────────────────────────────────────────────────────

/**
 * Allocate stat points to a summon.
 * @param {object} summon - Summon document (mutated in place)
 * @param {string} stat - 'hp' | 'atk' | 'def' | 'mag' | 'spd'
 * @param {number} points - Number of points to allocate
 * @returns {{success: boolean, message: string}}
 */
function allocateStatPoint(summon, stat, points = 1) {
  if (!summon) return { success: false, message: '❌ Invalid summon.' };

  const validStats = ['hp', 'atk', 'def', 'mag', 'spd'];
  if (!validStats.includes(stat)) {
    return { success: false, message: `❌ Invalid stat: ${stat}. Valid: ${validStats.join(', ')}` };
  }

  const val = Math.floor(Number(points));
  if (!Number.isFinite(val) || val <= 0) {
    return { success: false, message: '❌ Points must be a positive number.' };
  }

  if (summon.statPoints < val) {
    return { success: false, message: `❌ Not enough stat points. Have ${summon.statPoints}, need ${val}.` };
  }

  summon.statPoints -= val;
  summon.allocatedStats[stat] = (summon.allocatedStats[stat] || 0) + val;

  return {
    success: true,
    message: `✅ Allocated ${val} point(s) to ${stat.toUpperCase()}. ${summon.statPoints} points remaining.`
  };
}

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  // Factory
  createSummon,

  // Persistence
  getSummon,
  getUserSummons,
  saveSummon,

  // Deploy/dismiss
  deploySummon,
  dismissSummon,
  getActiveSummon,
  releaseSummon,

  // Stats
  computeEffectiveStats,
  applyLevelGrowth,
  computeCP,

  // Resonances
  computeResonances,
  refreshUserResonances,

  // Loyalty
  applyLoyaltyDecay,
  restoreLoyalty,
  LOYALTY_TRAITS,
  BASE_LOYALTY_DECAY,

  // XP
  addSummonXP,

  // Combat
  buildCombatEntity,

  // Training
  trainSummon,
  DAILY_TRAINING_COOLDOWN_MS,
  DAILY_TRAINING_XP,

  // Allocation
  allocateStatPoint,

  // 💡 FIX 2026-08-05: Main Deck / Backlog functions were defined after
  // module.exports but never added to the exports object — caused
  // TypeError in cmdBacklog/cmdSwap (reported as "0.0s timeout").
  getMainDeck,
  getBacklog,
  swapToMainDeck,
  moveToBacklog
};

// ─────────────────────────────────────────────────────────────
// 💡 MAIN DECK / BACKLOG SWAP SYSTEM (2026-08-04)
// ─────────────────────────────────────────────────────────────

const MAX_DECK_SIZE = 5;

/**
 * Get the user's Main Deck summons (max 5, deployable).
 * 💡 FIX 2026-08-07: Changed from !== false to === true for consistency.
 * Old summons without inMainDeck field were appearing in BOTH deck and backlog.
 */
async function getMainDeck(ownerJid) {
  const all = await Summon.find({ ownerJid }).sort({ obtainedAt: 1 });
  return all.filter(s => s.inMainDeck === true);
}

/**
 * Get the user's Backlog summons (not in Main Deck).
 * 💡 FIX 2026-08-07: Changed from === false to !== true for consistency.
 * Old summons without inMainDeck field should go to backlog (not deck).
 */
async function getBacklog(ownerJid) {
  const all = await Summon.find({ ownerJid }).sort({ obtainedAt: 1 });
  return all.filter(s => s.inMainDeck !== true);
}

/**
 * Swap a summon from Backlog into Main Deck (replaces a Main Deck slot).
 * @param {string} ownerJid - Owner's JID
 * @param {string} backlogSummonId - ID of the summon in backlog to bring in
 * @param {number} deckSlot - Which Main Deck slot to replace (0-4)
 */
async function swapToMainDeck(ownerJid, backlogSummonId, deckSlot) {
  if (deckSlot < 0 || deckSlot >= MAX_DECK_SIZE) {
    return { success: false, message: `❌ Invalid deck slot. Use 1-${MAX_DECK_SIZE}.` };
  }

  // 💡 FIX 2026-08-07: Use !== true instead of === false for backlog lookup.
  // Old summons without inMainDeck field should be in backlog.
  const backlogSummon = await Summon.findOne({ summonId: backlogSummonId, ownerJid });
  if (!backlogSummon || backlogSummon.inMainDeck === true) {
    return { success: false, message: '❌ That summon is not in your Backlog.' };
  }

  // Find the summon currently in that deck slot
  const oldDeckSummon = await Summon.findOne({ ownerJid, inMainDeck: true, deckPosition: deckSlot });

  // Swap: backlog summon goes to Main Deck, old Main Deck summon goes to Backlog
  backlogSummon.inMainDeck = true;
  backlogSummon.deckPosition = deckSlot;
  await backlogSummon.save();

  if (oldDeckSummon) {
    oldDeckSummon.inMainDeck = false;
    oldDeckSummon.deckPosition = 0;
    await oldDeckSummon.save();
  }

  // If the old deck summon was the active (deployed) one, clear it
  const user = economy.getUser(ownerJid);
  if (user && oldDeckSummon && user.activeSummonId === oldDeckSummon.summonId) {
    user.activeSummonId = null;
    economy.saveUser(user);
  }

  const backlogName = backlogSummon.nickname || registry.getSpecies(backlogSummon.species)?.name || backlogSummon.species;
  const oldName = oldDeckSummon ? (oldDeckSummon.nickname || registry.getSpecies(oldDeckSummon.species)?.name || oldDeckSummon.species) : '(empty)';

  return {
    success: true,
    message: `🔄 Swapped *${backlogName}* into Main Deck slot ${deckSlot + 1}.\n*${oldName}* moved to Backlog.`,
  };
}

/**
 * Move a summon from Main Deck to Backlog (frees up a slot).
 */
async function moveToBacklog(ownerJid, deckSlot) {
  const summon = await Summon.findOne({ ownerJid, inMainDeck: true, deckPosition: deckSlot });
  if (!summon) {
    return { success: false, message: `❌ No summon in Main Deck slot ${deckSlot + 1}.` };
  }

  summon.inMainDeck = false;
  summon.deckPosition = 0;
  await summon.save();

  // Clear active if this was the deployed summon
  const user = economy.getUser(ownerJid);
  if (user && user.activeSummonId === summon.summonId) {
    user.activeSummonId = null;
    economy.saveUser(user);
  }

  const name = summon.nickname || registry.getSpecies(summon.species)?.name || summon.species;
  return {
    success: true,
    message: `📦 Moved *${name}* to Backlog. Main Deck slot ${deckSlot + 1} is now empty.`,
  };
}
