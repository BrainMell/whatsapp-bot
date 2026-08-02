// ═══════════════════════════════════════════════════════════════════════════
//  SUMMON BOND + TRAITS + AI MODES — Phase 4 of the Summon Progression System
// ═══════════════════════════════════════════════════════════════════════════
//
// BOND SYSTEM:
//   Bond grows as the player fights alongside this summon. Each combat
//   the summon participates in grants 1-3 bond XP. At certain thresholds,
//   passive bonuses unlock:
//     Bond 10:  +5% all stats
//     Bond 25:  +10% all stats, loyalty decays 25% slower
//     Bond 50:  +15% all stats, echo buff 25% stronger
//     Bond 75:  +20% all stats, echo buff 50% stronger, unlock combo attack
//     Bond 100: +25% all stats, echo buff 100% stronger, loyalty never decays
//
// TRAITS SYSTEM:
//   Each summon spawns with 1-3 hidden traits (rolled at creation).
//   Traits are permanent and define the summon's unique identity.
//   20 traits available, each with a distinct gameplay effect.
//
// AI MODES:
//   Player-selectable. Determines how the summon AI prioritizes targets
//   and abilities in combat. 5 modes: AGGRESSIVE, DEFENSIVE, PROTECT_OWNER,
//   SUPPORT_ALLY, BALANCED.

const botConfig = require('../../botConfig');

// ─── BOND THRESHOLDS ──────────────────────────────────────────────
const BOND_THRESHOLDS = {
  10:  { statMult: 0.05, loyaltyDecayReduction: 0, echoBoost: 0,    label: 'Acquainted' },
  25:  { statMult: 0.10, loyaltyDecayReduction: 0.25, echoBoost: 0.25, label: 'Trusted' },
  50:  { statMult: 0.15, loyaltyDecayReduction: 0.25, echoBoost: 0.25, label: 'Bonded' },
  75:  { statMult: 0.20, loyaltyDecayReduction: 0.50, echoBoost: 0.50, label: 'Soulbound', comboAttack: true },
  100: { statMult: 0.25, loyaltyDecayReduction: 1.00, echoBoost: 1.00, label: 'Eternal', noLoyaltyDecay: true },
};

/**
 * Get the bond tier for a summon. Returns the highest threshold met.
 */
function getBondTier(bond) {
  let tier = null;
  let tierLevel = 0;
  for (const [level, data] of Object.entries(BOND_THRESHOLDS)) {
    if (bond >= parseInt(level)) {
      tier = data;
      tierLevel = parseInt(level);
    }
  }
  return { tier, tierLevel };
}

/**
 * Get the bond stat multiplier (0.0 - 0.25).
 */
function getBondStatMult(bond) {
  const { tier } = getBondTier(bond);
  return tier?.statMult || 0;
}

/**
 * Add bond XP to a summon. Converts to bond levels at thresholds.
 * Call after each combat the summon participates in.
 */
function addBondXP(summon, amount = 1) {
  if (!summon) return;
  summon.bondXp = (summon.bondXp || 0) + amount;
  // Every 10 bond XP = 1 bond level
  while (summon.bondXp >= 10 && summon.bond < 100) {
    summon.bondXp -= 10;
    summon.bond = Math.min(100, (summon.bond || 0) + 1);
  }
}

/**
 * Get a bond progress message for display.
 */
function getBondDisplay(summon) {
  const bond = summon.bond || 0;
  const { tier, tierLevel } = getBondTier(bond);
  const label = tier?.label || 'Stranger';
  const nextThreshold = Object.keys(BOND_THRESHOLDS).find(l => parseInt(l) > bond);
  const nextLabel = nextThreshold ? BOND_THRESHOLDS[nextThreshold].label : null;
  const xpToNext = nextThreshold ? (10 - (summon.bondXp || 0)) : 0;

  let msg = `💖 Bond: ${bond}/100 (${label})\n`;
  if (tier?.statMult) msg += `   ✨ +${Math.round(tier.statMult * 100)}% all stats\n`;
  if (tier?.loyaltyDecayReduction > 0) msg += `   🛡️ Loyalty decays ${Math.round(tier.loyaltyDecayReduction * 100)}% slower\n`;
  if (tier?.echoBoost > 0) msg += `   💀 Echo buff +${Math.round(tier.echoBoost * 100)}% stronger\n`;
  if (tier?.comboAttack) msg += `   ⚔️ Combo attack unlocked!\n`;
  if (tier?.noLoyaltyDecay) msg += `   ♾️ Loyalty never decays\n`;
  if (nextThreshold) {
    msg += `   _Next: ${nextLabel} at bond ${nextThreshold} (${xpToNext} combats left)_`;
  }
  return msg;
}

// ─── TRAITS ───────────────────────────────────────────────────────
const SUMMON_TRAITS = {
  aggressive:    { name: 'Aggressive',    icon: '😡', desc: '+15% damage dealt',           effect: { damageMult: 0.15 } },
  guardian:      { name: 'Guardian',      icon: '🛡️', desc: '+20% max HP',                effect: { hpMult: 0.20 } },
  lucky:         { name: 'Lucky',         icon: '🍀', desc: '+10% drop rate for owner',   effect: { dropRateBoost: 0.10 } },
  genius:        { name: 'Genius',        icon: '🧠', desc: '+25% XP gain for owner',     effect: { xpBoost: 0.25 } },
  swift:         { name: 'Swift',         icon: '💨', desc: '+15% speed',                  effect: { spdMult: 0.15 } },
  sturdy:        { name: 'Sturdy',        icon: '🪨', desc: '+15% defense',               effect: { defMult: 0.15 } },
  arcane:        { name: 'Arcane',        icon: '🔮', desc: '+15% magic damage',          effect: { magMult: 0.15 } },
  vampire:       { name: 'Vampire',       icon: '🩸', desc: 'Heal 5% of damage dealt',    effect: { lifestealPct: 5 } },
  berserker:     { name: 'Berserker',     icon: '🔥', desc: '+20% damage when below 50% HP', effect: { lowHpDamageBoost: 0.20 } },
  evasive:       { name: 'Evasive',       icon: '🌀', desc: '+10% evasion',               effect: { evasionBoost: 10 } },
  critical:      { name: 'Critical',      icon: '🎯', desc: '+10% crit chance',           effect: { critBoost: 10 } },
  toxic:         { name: 'Toxic',         icon: '🐍', desc: '20% chance to poison on hit', effect: { poisonOnHit: 20 } },
  burning:       { name: 'Burning',       icon: '🔥', desc: '20% chance to burn on hit',   effect: { burnOnHit: 20 } },
  frozen:        { name: 'Frozen',        icon: '❄️', desc: '15% chance to freeze on hit', effect: { freezeOnHit: 15 } },
  wealthy:       { name: 'Wealthy',       icon: '💰', desc: '+15% Zeni from combat',       effect: { goldBoost: 0.15 } },
  resilient:     { name: 'Resilient',     icon: '💚', desc: 'Regen 3% HP per turn',        effect: { hpRegenPct: 0.03 } },
  tenacious:     { name: 'Tenacious',     icon: '⚔️', desc: '+10% ATK',                   effect: { atkMult: 0.10 } },
  mysterious:    { name: 'Mysterious',    icon: '❓', desc: '5% chance to instakill non-boss', effect: { instakillChance: 0.05 } },
  ancient:       { name: 'Ancient',       icon: '📜', desc: '+10% all stats',             effect: { allStatsMult: 0.10 } },
  cursed:        { name: 'Cursed',        icon: '💀', desc: '+30% damage but -10% HP',    effect: { damageMult: 0.30, hpMult: -0.10 } },
};

/**
 * Roll traits for a new summon. Returns array of trait IDs.
 * Rarity determines max traits: COMMON=1, UNCOMMON=1-2, RARE=2, EPIC=2-3, LEGENDARY=3, MYTHIC=3
 */
function rollTraits(rarity) {
  const maxTraits = {
    COMMON: 1, UNCOMMON: 2, RARE: 2, EPIC: 3, LEGENDARY: 3, MYTHIC: 3
  }[rarity] || 1;

  const minTraits = {
    COMMON: 1, UNCOMMON: 1, RARE: 2, EPIC: 2, LEGENDARY: 3, MYTHIC: 3
  }[rarity] || 1;

  const count = minTraits + Math.floor(Math.random() * (maxTraits - minTraits + 1));
  const traitIds = Object.keys(SUMMON_TRAITS);
  const rolled = [];
  const available = [...traitIds];

  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.floor(Math.random() * available.length);
    rolled.push(available[idx]);
    available.splice(idx, 1);
  }

  return rolled;
}

/**
 * Get trait data by ID.
 */
function getTrait(traitId) {
  return SUMMON_TRAITS[traitId] || null;
}

/**
 * Get all traits for a summon as display text.
 */
function getTraitsDisplay(summon) {
  if (!summon.traits || summon.traits.length === 0) return 'None';
  return summon.traits.map(t => {
    const trait = getTrait(t);
    return trait ? `${trait.icon} ${trait.name} — ${trait.desc}` : t;
  }).join('\n   ');
}

/**
 * Get merged trait effects for combat.
 * Returns an object with all trait effects combined.
 */
function getTraitEffects(summon) {
  if (!summon.traits || summon.traits.length === 0) return {};
  const effects = {};
  for (const traitId of summon.traits) {
    const trait = getTrait(traitId);
    if (!trait || !trait.effect) continue;
    for (const [k, v] of Object.entries(trait.effect)) {
      if (typeof v === 'number') {
        effects[k] = (effects[k] || 0) + v;
      } else {
        effects[k] = v;
      }
    }
  }
  return effects;
}

// ─── AI MODES ─────────────────────────────────────────────────────
const AI_MODES = {
  AGGRESSIVE: {
    name: 'Aggressive',
    icon: '⚔️',
    desc: 'Always attacks the highest-HP enemy. Uses active abilities ASAP.',
    targetPriority: 'highest_hp',
    abilityUsage: 'aggressive',
  },
  DEFENSIVE: {
    name: 'Defensive',
    icon: '🛡️',
    desc: 'Guards the owner. Only attacks when owner is safe.',
    targetPriority: 'attacking_owner',
    abilityUsage: 'defensive',
  },
  PROTECT_OWNER: {
    name: 'Protect Owner',
    icon: '🚸',
    desc: 'Intercepts damage aimed at owner. Prioritizes shielding.',
    targetPriority: 'threat_to_owner',
    abilityUsage: 'protective',
  },
  SUPPORT_ALLY: {
    name: 'Support Ally',
    icon: '💚',
    desc: 'Prioritizes healing + buffing the owner. Attacks only if owner is full HP.',
    targetPriority: 'lowest_threat',
    abilityUsage: 'supportive',
  },
  BALANCED: {
    name: 'Balanced',
    icon: '⚖️',
    desc: 'Adapts to the situation. Attacks, defends, and supports as needed.',
    targetPriority: 'weakest',
    abilityUsage: 'balanced',
  },
};

/**
 * Get AI mode data.
 */
function getAIMode(mode) {
  return AI_MODES[mode] || AI_MODES.BALANCED;
}

/**
 * Get all AI modes for display.
 */
function getAIModesDisplay() {
  return Object.entries(AI_MODES).map(([key, mode]) =>
    `${mode.icon} ${key} — ${mode.desc}`
  ).join('\n');
}

module.exports = {
  BOND_THRESHOLDS,
  SUMMON_TRAITS,
  AI_MODES,
  getBondTier,
  getBondStatMult,
  addBondXP,
  getBondDisplay,
  rollTraits,
  getTrait,
  getTraitsDisplay,
  getTraitEffects,
  getAIMode,
  getAIModesDisplay,
};
