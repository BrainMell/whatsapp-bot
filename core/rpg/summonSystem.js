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

  const summonId = `sum_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    baseStats: { ...species.baseStats },
    loyalty: opts.loyalty !== undefined ? opts.loyalty : 100,
    personality: 'STOIC',
    behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 },
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

  // Derived stats (mirrors how enemies are constructed)
  return {
    hp: Math.floor(baseHp),
    maxHp: Math.floor(baseHp),
    atk: Math.floor(baseAtk),
    def: Math.floor(baseDef),
    mag: Math.floor(baseMag),
    spd: Math.floor(baseSpd),
    energy: 100,
    maxEnergy: 100,
    crit: 5 + Math.floor(summon.level * 0.2),  // crit scales mildly with level
    evasion: Math.min(45, Math.floor(baseSpd * 0.12)),  // mirrors player evasion formula
    dmgReduction: Math.min(65, Math.floor(baseDef * 0.55))  // mirrors player dmgReduction formula
  };
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
  const query = { ownerJid };
  if (opts.includeForSale === false) {
    query.forSale = false;
  }
  return await Summon.find(query).sort({ obtainedAt: 1 });
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

  user.activeSummonId = summonId;
  summon.lastUsedAt = new Date();
  await summon.save();

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
  if (!summon) return { leveledUp: false, newLevel: 1, statPointsGained: 0 };

  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return { leveledUp: false, newLevel: summon.level, statPointsGained: 0 };

  summon.xp += val;
  let leveledUp = false;
  let statPointsGained = 0;
  summon.statPoints = summon.statPoints || 0;  // defensive — prevent NaN on undefined
  const rarityConfig = registry.getRarityConfig(summon.rarity);
  const maxLevel = rarityConfig.maxLevel;

  while (summon.level < maxLevel) {
    const xpNeeded = registry.getSummonXPForLevel(summon.level + 1) - registry.getSummonXPForLevel(summon.level);
    if (summon.xp < xpNeeded) break;

    summon.xp -= xpNeeded;
    summon.level += 1;
    summon.statPoints += registry.SUMMON_XP_CONFIG.STAT_POINTS_PER_LEVEL;
    statPointsGained += registry.SUMMON_XP_CONFIG.STAT_POINTS_PER_LEVEL;
    leveledUp = true;

    // Re-grow base stats to new level
    applyLevelGrowth(summon, summon.level);
  }

  if (summon.level >= maxLevel) {
    summon.xp = 0;  // cap XP at max level
  }

  return { leveledUp, newLevel: summon.level, statPointsGained };
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
    archetype: summon.archetype,
    element: summon.element,

    // Owner reference
    isSummon: true,
    isEnemy: false,
    summonerJid,

    // Stats (transient — rebuilt each combat)
    stats: {
      ...stats,
      maxHp: stats.maxHp,
      hp: stats.maxHp  // start at full HP
    },
    currentHP: stats.maxHp,
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
  allocateStatPoint
};
