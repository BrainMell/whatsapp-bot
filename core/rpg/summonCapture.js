// ============================================
// 🎯 SUMMON CAPTURE — Necromancer kill-and-capture pipeline
// ============================================
// Necromancer-exclusive mechanic. When army_of_dead ult is active,
// killing enemies has a chance to capture them as permanent summons.
//
// Taming layer: killing 10 of the same enemy type permanently "tames"
// that species — future captures get a +20% stat bonus ("Tamed" trait).
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md (section 3.1)

const summonSystem = require('./summonSystem');
const registry = require('./summonRegistry');
const economy = require('./economy');
const Summon = require('../models/Summon');

// ─────────────────────────────────────────────────────────────
// ENEMY → SUMMON SPECIES MAPPING
// ─────────────────────────────────────────────────────────────
// Maps enemy type IDs (from classEncounters.js) to summon species
// (from summonRegistry.js). Not every enemy is captureable — only
// those that map to a summon species. Bosses S-rank+ are immune.

// 💡 FIX 2026-08-05: Remapped all enemy→species mappings to the current 17
// live species. The old map pointed to stale species (skeleton, imp,
// flame_elemental, wolf, wyrmling, turret_mk1, etc.) that no longer exist
// in the registry — captures were silently failing because createSummon
// couldn't find the species. Mappings chosen by thematic similarity.
const ENEMY_TO_SPECIES_MAP = {
  // Undead-themed enemies → ghost (undead, COMMON)
  FROST_GHOUL: 'ghost',
  GLACIAL_BEAST: 'ghost',
  BLIZZARD_WRAITH: 'ghost',
  FLESH_ABOMINATION: 'ghost',

  // Demon-themed enemies → bat (shadow STALKER) / giant (earth TANK)
  HELLFIRE_DEMON: 'bat',
  ABYSSAL_HORROR: 'giant',
  VOID_TIDE: 'giant',
  VOID_SEEKER: 'bat',

  // Fire/elemental enemies → dragon (fire BRUTE)
  FLAME: 'dragon',
  ELDER_FLAME: 'dragon',
  MAGMA_BRUTE: 'dragon',
  EMBER_SPELLBREAKER: 'dragon',
  INFERNO_NEMESIS: 'dragon',
  PHOENIX_CORRUPTED: 'dragon',

  // Ice/elemental enemies → yeti (ice BRUTE)
  TIDE_LURKER: 'yeti',
  MIST_WALKER: 'yeti',
  RUNIC_BREAKER: 'yeti',
  FROST_PHALANX: 'yeti',
  PERMAFROST_TITAN: 'yeti',

  // Lightning/storm enemies → reptile (fast STALKER)
  FROST_FLAME_WARDEN: 'reptile',
  TSUNAMI_WALKER: 'reptile',

  // Beast enemies → snake / boar
  DRAKE_SCOUT: 'snake',
  SHADOW_STALKER_MUTANT: 'snake',
  CHIMERA_BEAST: 'boar',
  STONE_HULK: 'boar',

  // Dragon enemies → dragon
  FIRE_BREATHER: 'dragon',
  KRAKEN_SPAWN: 'dragon',

  // Construct enemies → ship sprites (construct)
  CRYSTAL_CORRUPTED: 'ship_fighter',
  GOLEM_KING: 'ship_cruiser',
  OBSIDIAN_JUGGERNAUT: 'ship_cruiser',
  DIAMOND_SENTINEL: 'ship_fighter',
  STONE_NEMESIS: 'ship_cruiser',
  MOUNTAIN_COLOSSUS: 'ship_cruiser'
};

// ─────────────────────────────────────────────────────────────
// CAPTURE CONFIG
// ─────────────────────────────────────────────────────────────

const CAPTURE_CONFIG = {
  BASE_CAPTURE_CHANCE: 0.20,        // 20% base
  CAPTURE_BONUS_PER_SUMMON_LEVEL: 0.05,  // +5% per Necromancer's summon level
  MAX_CAPTURE_CHANCE: 0.50,         // hard cap 50%
  TAMING_THRESHOLD: 10,             // kills of same enemy type to "tame"
  TAMING_STAT_BONUS: 0.20,          // +20% stats for tamed summons
  CAPTURE_WINDOW_TURNS: 3,          // army_of_dead capture window duration
  BOSS_CAPTURE_IMMUNE_RANKS: ['S', 'SS', 'SSS', 'GOD']  // these rank bosses are immune
};

// ─────────────────────────────────────────────────────────────
// CAPTURE WINDOW — set when army_of_dead is cast
// ─────────────────────────────────────────────────────────────

/**
 * Set the capture window for a Necromancer player.
 * Called when army_of_dead ult is cast.
 * @param {object} state - Combat state
 * @param {string} playerJid - Necromancer's JID
 * @param {number} summonLevel - Level of the Necromancer's active summon (for bonus chance)
 */
function setCaptureWindow(state, playerJid, summonLevel = 1) {
  if (!state) return;
  if (!state.captureWindows) state.captureWindows = {};
  const bonus = summonLevel * CAPTURE_CONFIG.CAPTURE_BONUS_PER_SUMMON_LEVEL;
  const chance = Math.min(
    CAPTURE_CONFIG.MAX_CAPTURE_CHANCE,
    CAPTURE_CONFIG.BASE_CAPTURE_CHANCE + bonus
  );
  state.captureWindows[playerJid] = {
    turnsRemaining: CAPTURE_CONFIG.CAPTURE_WINDOW_TURNS,
    captureChance: chance
  };
}

/**
 * Decrement all capture windows by 1 turn. Called at the end of each combat round.
 * @param {object} state - Combat state
 */
function tickCaptureWindows(state) {
  if (!state || !state.captureWindows) return;
  for (const [jid, window] of Object.entries(state.captureWindows)) {
    window.turnsRemaining--;
    if (window.turnsRemaining <= 0) {
      delete state.captureWindows[jid];
    }
  }
}

/**
 * Check if a player has an active capture window.
 * @param {object} state - Combat state
 * @param {string} playerJid
 * @returns {object|null} - The window object or null
 */
function getCaptureWindow(state, playerJid) {
  if (!state || !state.captureWindows) return null;
  return state.captureWindows[playerJid] || null;
}

// ─────────────────────────────────────────────────────────────
// CAPTURE ROLL — called when an enemy dies
// ─────────────────────────────────────────────────────────────

/**
 * Attempt to capture a defeated enemy as a summon.
 * Called from recordEnemyKill after the kill is recorded.
 *
 * Checks:
 * 1. Killer is a Necromancer/Lich
 * 2. army_of_dead capture window is active for the killer
 * 3. Enemy is not a capture-immune boss (S-rank+)
 * 4. Enemy type maps to a summon species
 * 5. Roll against capture chance
 *
 * On success:
 * - Create a Summon document
 * - Increment taming progress for the enemy type
 * - If taming threshold reached, mark the summon as tamed (+20% stats)
 *
 * @param {object} state - Combat state
 * @param {object} entity - The defeated enemy entity
 * @param {string} killerJid - JID of the player who dealt the killing blow
 * @returns {Promise<{captured: boolean, summon?: object, message?: string}>}
 */
async function attemptCapture(state, entity, killerJid) {
  if (!state || !entity || !killerJid) return { captured: false };

  // 1. Check if killer is a Necromancer/Lich
  const user = economy.getUser(killerJid);
  if (!user) return { captured: false };

  // 💡 FIX (2026-08-16): user.class is a STRING in the raw user object
  // (e.g. 'NECROMANCER'), but can also be an object if passed from combat
  // code that already resolved it. Handle both safely.
  const rawUserClass = user.class;
  const userClass = String(
    (rawUserClass && typeof rawUserClass === 'object' && rawUserClass.id) ? rawUserClass.id :
    (typeof rawUserClass === 'string') ? rawUserClass : ''
  ).toUpperCase();
  if (userClass !== 'NECROMANCER' && userClass !== 'LICH') {
    return { captured: false };
  }

  // 2. Check capture window
  const window = getCaptureWindow(state, killerJid);
  if (!window) return { captured: false };

  // 3. Check boss immunity
  if (entity.isBoss) {
    const rank = state.dungeonRank || 'F';
    if (CAPTURE_CONFIG.BOSS_CAPTURE_IMMUNE_RANKS.includes(rank)) {
      return { captured: false };
    }
  }

  // 4. Map enemy type to summon species
  const enemyType = entity.type || entity.id || '';
  const speciesId = ENEMY_TO_SPECIES_MAP[enemyType];
  if (!speciesId) {
    return { captured: false };  // enemy not captureable
  }

  const species = registry.getSpecies(speciesId);
  if (!species) return { captured: false };

  // 5. Roll capture chance
  if (Math.random() > window.captureChance) {
    return { captured: false, message: `💫 The ${entity.name}'s soul escapes capture...` };
  }

  // 6. Create the summon
  const enemyLevel = entity.level || Math.max(1, Math.floor((entity.stats?.maxHp || 100) / 20));

  // Check taming progress
  if (!user.tamingProgress) user.tamingProgress = {};
  const tamingCount = user.tamingProgress[enemyType] || 0;
  const newTamingCount = tamingCount + 1;
  user.tamingProgress[enemyType] = newTamingCount;

  const isTamed = newTamingCount >= CAPTURE_CONFIG.TAMING_THRESHOLD;

  // Create the summon
  const summon = await summonSystem.createSummon(killerJid, speciesId, {
    obtainedFrom: 'capture',
    level: Math.min(enemyLevel, registry.getRarityConfig(species.rarity).maxLevel),
    loyalty: isTamed ? 100 : 80  // tamed summons start at full loyalty
  });

  // If tamed, apply the taming bonus
  if (isTamed) {
    // Apply +20% stat bonus by adjusting baseStats
    const bonusMult = 1 + CAPTURE_CONFIG.TAMING_STAT_BONUS;
    summon.baseStats = {
      hp: Math.floor(summon.baseStats.hp * bonusMult),
      atk: Math.floor(summon.baseStats.atk * bonusMult),
      def: Math.floor(summon.baseStats.def * bonusMult),
      mag: Math.floor(summon.baseStats.mag * bonusMult),
      spd: Math.floor(summon.baseStats.spd * bonusMult)
    };
    // Mark as tamed (we can use a flag on the document — adding to lineage as a marker)
    summon.lineage = summon.lineage || [];
    summon.lineage.push({
      summonId: 'tamed_marker',
      species: speciesId,
      level: summon.level,
      personality: 'TAMED',
      forgedAt: new Date()
    });
    await summon.save();
  }

  // Update user stats
  if (user.summonStats) {
    user.summonStats.captured = (user.summonStats.captured || 0) + 1;
  }

  // Refresh resonances (new summon may activate a resonance)
  try {
    await summonSystem.refreshUserResonances(user);
  } catch (e) {
    console.error('[Capture] Failed to refresh resonances:', e?.message || e);
  }

  // Build the capture message
  let message = `💀 *SOUL CAPTURED!* ${entity.name} has been bound as a ${species.name}!`;
  if (isTamed) {
    message += `\n✨ *TAMED!* (After ${newTamingCount} kills of this type, the species is permanently tamed — +20% stats!)`;
  } else {
    message += `\n📊 Taming progress: ${newTamingCount}/${CAPTURE_CONFIG.TAMING_THRESHOLD} kills toward permanent taming.`;
  }

  return { captured: true, summon, message };
}

// ─────────────────────────────────────────────────────────────
// NECROMANCER PASSIVE — +30% undead summon stats
// ─────────────────────────────────────────────────────────────

/**
 * Check if a player should get the Necromancer summon bonus.
 * Necromancer: +30% undead summon stats
 * Lich: +40% undead summon stats (ascended bonus)
 * @param {string} userClass - The player's class ID
 * @returns {{bonus: number, element: string}|null}
 */
function getNecromancerSummonBonus(userClass) {
  const cls = (userClass || '').toUpperCase();
  if (cls === 'NECROMANCER') {
    return { bonus: 0.30, element: 'undead' };
  }
  if (cls === 'LICH') {
    return { bonus: 0.40, element: 'undead' };
  }
  return null;
}

/**
 * Apply class-based summon stat bonuses to a combat entity.
 * Called from buildCombatEntity (or computeEffectiveStats).
 * @param {object} summonEntity - Combat entity (mutated)
 * @param {string} ownerClass - Owner's class ID
 */
function applyClassSummonBonus(summonEntity, ownerClass) {
  if (!summonEntity || !ownerClass) return;

  const bonus = getNecromancerSummonBonus(ownerClass);
  if (!bonus) return;

  // Only apply to matching element
  if (summonEntity.element !== bonus.element) return;

  // Apply bonus to all stats
  const mult = 1 + bonus.bonus;
  if (summonEntity.stats) {
    summonEntity.stats.hp = Math.floor(summonEntity.stats.hp * mult);
    summonEntity.stats.maxHp = Math.floor(summonEntity.stats.maxHp * mult);
    summonEntity.stats.atk = Math.floor(summonEntity.stats.atk * mult);
    summonEntity.stats.def = Math.floor(summonEntity.stats.def * mult);
    summonEntity.stats.mag = Math.floor(summonEntity.stats.mag * mult);
    summonEntity.stats.spd = Math.floor(summonEntity.stats.spd * mult);
  }
  if (summonEntity.currentHP) {
    summonEntity.currentHP = summonEntity.stats.hp;
  }
  if (summonEntity.maxHP) {
    summonEntity.maxHP = summonEntity.stats.maxHp;
  }
}

// ─────────────────────────────────────────────────────────────
// TAMING PROGRESS — track kills per enemy type
// ─────────────────────────────────────────────────────────────

/**
 * Get taming progress for a user + enemy type.
 * @param {object} user - Economy user object
 * @param {string} enemyType - Enemy type ID
 * @returns {{count: number, tamed: boolean, remaining: number}}
 */
function getTamingProgress(user, enemyType) {
  if (!user || !enemyType) return { count: 0, tamed: false, remaining: CAPTURE_CONFIG.TAMING_THRESHOLD };
  const count = (user.tamingProgress && user.tamingProgress[enemyType]) || 0;
  return {
    count,
    tamed: count >= CAPTURE_CONFIG.TAMING_THRESHOLD,
    remaining: Math.max(0, CAPTURE_CONFIG.TAMING_THRESHOLD - count)
  };
}

/**
 * Get all tamed species for a user.
 * @param {object} user - Economy user object
 * @returns {array} - Array of { enemyType, speciesId, count }
 */
function getTamedSpecies(user) {
  if (!user || !user.tamingProgress) return [];
  const tamed = [];
  for (const [enemyType, count] of Object.entries(user.tamingProgress)) {
    if (count >= CAPTURE_CONFIG.TAMING_THRESHOLD) {
      const speciesId = ENEMY_TO_SPECIES_MAP[enemyType];
      if (speciesId) {
        tamed.push({ enemyType, speciesId, count });
      }
    }
  }
  return tamed;
}

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  ENEMY_TO_SPECIES_MAP,
  CAPTURE_CONFIG,
  setCaptureWindow,
  tickCaptureWindows,
  getCaptureWindow,
  attemptCapture,
  getNecromancerSummonBonus,
  applyClassSummonBonus,
  getTamingProgress,
  getTamedSpecies
};
