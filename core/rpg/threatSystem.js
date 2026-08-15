// ============================================================
// Threat/Aggro System — core/rpg/threatSystem.js
// ============================================================
// Minimal threat system for PvE combat. Each combatant has a `threat`
// value that starts at 0. Dealing damage generates threat (modified by
// class-based threatMult). Enemies target the highest-threat combatant
// instead of just the lowest-HP one. Tanks generate 1.5× threat so they
// naturally hold aggro.
//
// The existing `taunt` status effect (force_target) is also wired up:
// when a player has taunt active, enemies are forced to target them
// regardless of threat values.
// ============================================================

// ── Class-based threat multipliers ──────────────────────────
// Tanks generate more threat so they hold aggro. Healers/mages
// generate less so they don't pull aggro from the tank.
const TANK_CLASSES = new Set([
  'WARRIOR', 'PALADIN', 'WARLORD', 'TEMPLAR', 'DOOMSLAYER',
  'DRAGON_GOD', 'BERSERKER', 'KNIGHT', 'GUARDIAN'
]);

const DPS_CLASSES = new Set([
  'ROGUE', 'KAGE', 'NIGHTBLADE', 'ASSASSIN', 'RANGER',
  'ARCHER', 'HUNTER', 'SAMURAI', 'NINJA', 'MONK'
]);

const MAGIC_CLASSES = new Set([
  'MAGE', 'ARCHMAGE', 'LICH', 'WARLOCK', 'SORCERER',
  'ELEMENTALIST', 'CHRONOMANCER', 'TIMELORD', 'VOIDWALKER'
]);

const SUPPORT_CLASSES = new Set([
  'CLERIC', 'SAINT', 'ACOLYTE', 'BARD', 'PRIEST',
  'HEALER', 'ORACLE'
]);

/**
 * Get the threat multiplier for a combatant based on their class.
 * @param {object} combatant - Player or summon combat entity
 * @returns {number} - Threat multiplier (0.6 - 1.5)
 */
function getThreatMult(combatant) {
  if (!combatant) return 1.0;

  // Summons have a fixed 0.7× multiplier (lower than tanks)
  if (combatant.isSummon) return 0.7;

  const cls = (combatant.class || combatant.classId || '').toUpperCase();
  if (TANK_CLASSES.has(cls)) return 1.5;
  if (DPS_CLASSES.has(cls)) return 1.0;
  if (MAGIC_CLASSES.has(cls)) return 0.8;
  if (SUPPORT_CLASSES.has(cls)) return 0.6;
  return 1.0; // Default
}

/**
 * Generate threat for a combatant after dealing damage.
 * @param {object} attacker - The player/summon dealing damage
 * @param {number} damage - Damage dealt
 * @returns {number} - Threat generated
 */
function generateThreat(attacker, damage) {
  if (!attacker || damage <= 0) return 0;
  const mult = getThreatMult(attacker);
  const threat = Math.floor(damage * mult);
  attacker.threat = (attacker.threat || 0) + threat;
  return threat;
}

/**
 * Generate threat from healing (healers draw aggro in many JRPGs).
 * @param {object} healer - The player healing
 * @param {number} healAmount - Amount healed
 * @returns {number} - Threat generated
 */
function generateHealThreat(healer, healAmount) {
  if (!healer || healAmount <= 0) return 0;
  const mult = getThreatMult(healer);
  const threat = Math.floor(healAmount * 0.5 * mult);
  healer.threat = (healer.threat || 0) + threat;
  return threat;
}

/**
 * Add flat threat (used by taunt abilities).
 * @param {object} combatant - The player gaining threat
 * @param {number} amount - Flat threat amount
 */
function addFlatThreat(combatant, amount) {
  if (!combatant) return;
  combatant.threat = (combatant.threat || 0) + amount;
}

/**
 * Check if a combatant has an active taunt (force_target) status.
 * @param {object} combatant - Player or summon
 * @returns {boolean} - True if taunt is active
 */
function hasTaunt(combatant) {
  if (!combatant || !combatant.statusEffects) return false;
  return combatant.statusEffects.some(e =>
    e.type === 'taunt' || e.type === 'force_target'
  );
}

/**
 * Select a target using threat-based AI.
 * Replaces the old "lowest HP" targeting with a 3-way split:
 *   - 50% chance: highest-threat combatant (tanks hold aggro)
 *   - 30% chance: lowest-HP combatant (finish kills)
 *   - 20% chance: random (unpredictability)
 *
 * If any combatant has taunt active, they are ALWAYS the target (forced).
 *
 * @param {array} targets - Array of alive player+summon combatants
 * @returns {object} - Selected target
 */
function selectTargetByThreat(targets) {
  if (!targets || targets.length === 0) return null;
  if (targets.length === 1) return targets[0];

  // 1. Check for forced target (taunt)
  const taunted = targets.find(t => hasTaunt(t));
  if (taunted) return taunted;

  const roll = Math.random();

  // 2. 50% chance: highest-threat target
  if (roll < 0.50) {
    const highestThreat = targets.reduce((best, t) =>
      (t.threat || 0) > (best.threat || 0) ? t : best, targets[0]);
    if (highestThreat.threat > 0) return highestThreat;
    // Fall through if no threat has been generated yet
  }

  // 3. 30% chance: lowest-HP target (finish kills)
  if (roll < 0.80) {
    return targets.reduce((lowest, t) => {
      const tRatio = t.currentHP / (t.maxHp || t.stats?.maxHp || 1);
      const lRatio = lowest.currentHP / (lowest.maxHp || lowest.stats?.maxHp || 1);
      return tRatio < lRatio ? t : lowest;
    }, targets[0]);
  }

  // 4. 20% chance: random
  return targets[Math.floor(Math.random() * targets.length)];
}

/**
 * Reset threat for all combatants (call at start of combat).
 * @param {array} combatants - All players + summons
 */
function resetThreat(combatants) {
  if (!combatants) return;
  for (const c of combatants) {
    if (c) c.threat = 0;
  }
}

module.exports = {
  getThreatMult,
  generateThreat,
  generateHealThreat,
  addFlatThreat,
  hasTaunt,
  selectTargetByThreat,
  resetThreat,
};
