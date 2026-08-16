// ============================================================
// Rune Synergy Engine — core/rpg/runeSynergies.js
// ============================================================
// Detects and applies synergy effects when compatible runes/statuses
// are combined on the same skill cast.
//
// CC SAFEGUARD: All hard CC (stun, freeze, silence, fear, root) uses
// the existing 2-turn immunity system from PvP stun DR (Phase 1 Fix #5).
// When any hard CC expires, the target gets 2 turns of immunity to
// ALL hard CC types. Wet is consumed on synergy trigger.
// ============================================================

// ─── SYNERGY DEFINITIONS ─────────────────────────────────────
// Each synergy: { id, name, trigger: [statusA, statusB], effect, ccType? }
// ccType marks synergies that apply hard CC (need DR check)
const SYNERGIES = [
  // ── Wet & Elemental (5) ──
  { id: 'electrocution', name: 'Electrocution', icon: '⚡',
    trigger: ['wet', 'shock'],
    effect: { type: 'guaranteed_stun', consumeWet: true, lightningBonusMult: 1.5 },
    ccType: 'stun' },

  { id: 'flash_freeze', name: 'Flash Freeze', icon: '🧊',
    trigger: ['wet', 'freeze'],
    effect: { type: 'enhanced_freeze', freezeChanceBonus: 30, freezeDurationBonus: 1, consumeWet: true },
    ccType: 'freeze' },

  { id: 'steam_burst', name: 'Steam Burst', icon: '💨',
    trigger: ['wet', 'burn'],
    effect: { type: 'bonus_damage', damageMult: 1.5, consumeWet: true, consumeBurn: true } },

  { id: 'arc_freeze', name: 'Arc Freeze', icon: '⚡🧊',
    trigger: ['shock', 'freeze'],
    effect: { type: 'bonus_damage', damageMult: 1.3, consumeFreeze: true } },

  { id: 'thermal_shock', name: 'Thermal Shock', icon: '🔥🧊',
    trigger: ['burn', 'freeze'],
    effect: { type: 'bonus_damage', damageMult: 1.4, consumeBurn: true, consumeFreeze: true, applyCrippled: 1 } },

  // ── Wet & Movement (5) ──
  { id: 'water_slide', name: 'Water Slide', icon: '🌊',
    trigger: ['wet', 'knockback'],
    effect: { type: 'extended_knockback', extraDistance: 1, slipChance: 30, consumeWet: true } },

  { id: 'slippery_pull', name: 'Slippery Pull', icon: '🪝',
    trigger: ['wet', 'pull'],
    effect: { type: 'enhanced_pull', rootChance: 25, consumeWet: true },
    ccType: 'root' },

  { id: 'frozen_ground', name: 'Frozen Ground', icon: '❄️',
    trigger: ['wet', 'frost_patch'],
    effect: { type: 'enhanced_ground', slipChance: 40, freezeChance: 20, consumeWet: true },
    ccType: 'freeze' },

  { id: 'ice_slide', name: 'Ice Slide', icon: '🏃❄️',
    trigger: ['knockback', 'frost_patch'],
    effect: { type: 'slide_effect', slowDuration: 2 } },

  { id: 'splash', name: 'Splash', icon: '💧',
    trigger: ['wet', 'spread'],
    effect: { type: 'spread_wet', spreadRadius: 2, wetDuration: 1 } },

  // ── Control & Debuff (6) ──
  { id: 'panic', name: 'Panic', icon: '😱',
    trigger: ['fear', 'silence'],
    effect: { type: 'enhanced_cc', fleeChanceBonus: 30 },
    ccType: 'fear' },

  { id: 'frozen_terror', name: 'Frozen Terror', icon: '😱🧊',
    trigger: ['fear', 'freeze'],
    effect: { type: 'freeze_then_fear', freezeDurationBonus: 1, fearDuration: 2 },
    ccType: 'freeze' },

  { id: 'helpless', name: 'Helpless', icon: '🤐👁️',
    trigger: ['silence', 'blind'],
    effect: { type: 'enhanced_cc', accuracyReduction: 50 } },

  { id: 'suppression', name: 'Suppression', icon: '🤐💀',
    trigger: ['silence', 'curse'],
    effect: { type: 'cooldown_pressure', cooldownIncrease: 1 },
    ccType: 'silence' },

  { id: 'forced_panic', name: 'Forced Panic', icon: '😠😱',
    trigger: ['taunt', 'fear'],
    effect: { type: 'weak_attack', damageMult: 0.5 },
    ccType: 'fear' },

  { id: 'disorientation', name: 'Disorientation', icon: '👁️💫',
    trigger: ['blind', 'stun'],
    effect: { type: 'enhanced_cc', stunChanceBonus: 15, blindDurationBonus: 1 },
    ccType: 'stun' },

  // ── DoT Synergies (5) ──
  { id: 'hemorrhage', name: 'Hemorrhage', icon: '🔥🩸',
    trigger: ['burn', 'bleed'],
    effect: { type: 'enhanced_dot', dotMult: 1.5, healingReduction: 50 } },

  { id: 'toxic_hemorrhage', name: 'Toxic Hemorrhage', icon: '☠️🩸',
    trigger: ['poison', 'bleed'],
    effect: { type: 'enhanced_dot', dotMult: 1.3, dotDurationBonus: 2, healingReduction: 40 } },

  { id: 'venomous_combustion', name: 'Venomous Combustion', icon: '☠️🔥',
    trigger: ['poison', 'burn'],
    effect: { type: 'bonus_damage', damageMult: 1.5, consumePoisonDuration: 1 } },

  { id: 'withering', name: 'Withering', icon: '💀☠️',
    trigger: ['curse', 'poison'],
    effect: { type: 'enhanced_dot', dotMult: 1.3, dotDurationBonus: 1, healingReduction: 30 } },

  { id: 'mortal_wound', name: 'Mortal Wound', icon: '💀🩸',
    trigger: ['curse', 'bleed'],
    effect: { type: 'max_hp_reduction', hpReductionPct: 10, healingReduction: 50 } },

  // ── Advanced Combos (4) ──
  { id: 'gravity_burst', name: 'Gravity Burst', icon: '🪝💥',
    trigger: ['pull', 'spread_blast'],
    effect: { type: 'group_aoe', damageMult: 1.3 } },

  { id: 'conductive_chain', name: 'Conductive Chain', icon: '💧⚡🔗',
    trigger: ['wet', 'chain_bounce'],
    effect: { type: 'chain_priority_wet', shockSpread: true } },

  { id: 'thunderstorm', name: 'Thunderstorm', icon: '💧⚡🌐',
    trigger: ['wet', 'shock', 'spread'],
    effect: { type: 'chain_stun_wet', stunChance: 50, consumeWet: true, lightningMult: 1.5 },
    ccType: 'stun' },

  { id: 'total_panic', name: 'Total Panic', icon: '😱🤐👁️',
    trigger: ['fear', 'silence', 'blind'],
    effect: { type: 'extreme_cc', fleeChance: 60, accuracyReduction: 80 },
    ccType: 'fear' },
];

// ─── CHECK FOR ACTIVE SYNERGIES ──────────────────────────────
// Given a list of statuses being applied (or already on target),
// returns an array of active synergy effects.
//
// @param {Array<string>} activeStatuses - e.g. ['wet', 'shock', 'burn']
// @returns {Array<object>} - active synergies with their effects
function detectSynergies(activeStatuses) {
  if (!activeStatuses || activeStatuses.length < 2) return [];

  const statusSet = new Set(activeStatuses.map(s => s.toLowerCase()));
  const triggered = [];

  for (const synergy of SYNERGIES) {
    // Check if all trigger statuses are present
    const allPresent = synergy.trigger.every(s => statusSet.has(s.toLowerCase()));
    if (allPresent) {
      triggered.push(synergy);
    }
  }

  return triggered;
}

// ─── APPLY SYNERGY EFFECTS ───────────────────────────────────
// Modifies the combat effect based on active synergies.
// Returns { modifiedEffect, synergiesTriggered, messages }
function applySynergyEffects(effect, targetStatuses, attackerRunes) {
  const result = {
    modifiedEffect: { ...effect },
    synergies: [],
    messages: [],
    ccApplied: [], // track CC for DR check
    consumeStatuses: [], // statuses to consume (remove from target)
  };

  // Collect all statuses: ones on the target + ones being applied by this skill
  const allStatuses = new Set([
    ...(targetStatuses || []).map(s => s.type || s),
    ...((effect.addStatuses || []).map(s => s.type)),
  ]);

  // Also check rune types (some synergies trigger on rune type, not status)
  if (attackerRunes) {
    for (const rune of attackerRunes) {
      const runeType = rune.type || rune;
      // Map rune types to pseudo-statuses for synergy detection
      if (runeType === 'KNOCKBACK') allStatuses.add('knockback');
      if (runeType === 'PULL') allStatuses.add('pull');
      if (runeType === 'TAUNT') allStatuses.add('taunt');
      if (runeType === 'CHAIN_BOUNCE') allStatuses.add('chain_bounce');
      if (runeType === 'SPREAD_BLAST') allStatuses.add('spread_blast');
      if (runeType === 'SPREAD') allStatuses.add('spread');
      if (runeType === 'FROST_PATCH') allStatuses.add('frost_patch');
      if (runeType === 'WET') allStatuses.add('wet');
    }
  }

  const active = detectSynergies(Array.from(allStatuses));
  if (active.length === 0) return result;

  for (const synergy of active) {
    result.synergies.push(synergy);
    result.messages.push(`✨ SYNERGY: ${synergy.icon} ${synergy.name}!`);

    const eff = synergy.effect;

    // Bonus damage
    if (eff.damageMult) {
      result.modifiedEffect.multiplier = (Number(result.modifiedEffect.multiplier) || 1) * eff.damageMult;
    }

    // Enhanced DoT
    if (eff.dotMult) {
      result.modifiedEffect.dotMult = (result.modifiedEffect.dotMult || 1) * eff.dotMult;
    }
    if (eff.dotDurationBonus) {
      result.modifiedEffect.dotDurationBonus = (result.modifiedEffect.dotDurationBonus || 0) + eff.dotDurationBonus;
    }

    // Healing reduction
    if (eff.healingReduction) {
      result.modifiedEffect.healingReduction = eff.healingReduction;
    }

    // CC effects — track for DR check
    if (eff.type === 'guaranteed_stun') {
      result.ccApplied.push('stun');
      result.modifiedEffect.addStatuses = (result.modifiedEffect.addStatuses || []);
      result.modifiedEffect.addStatuses.push({ type: 'stun', duration: 1, chance: 100 });
    }
    if (eff.type === 'enhanced_freeze') {
      result.ccApplied.push('freeze');
      result.modifiedEffect.addStatuses = (result.modifiedEffect.addStatuses || []);
      result.modifiedEffect.addStatuses.push({
        type: 'freeze', duration: (eff.freezeDurationBonus || 1) + 1,
        chance: 100, freezeChanceBonus: eff.freezeChanceBonus || 30
      });
    }
    if (eff.type === 'freeze_then_fear') {
      result.ccApplied.push('freeze');
      result.ccApplied.push('fear');
      result.modifiedEffect.addStatuses = (result.modifiedEffect.addStatuses || []);
      result.modifiedEffect.addStatuses.push({ type: 'freeze', duration: 2 + (eff.freezeDurationBonus || 0), chance: 100 });
      result.modifiedEffect.postFreezeFear = { duration: eff.fearDuration || 2 };
    }
    if (eff.type === 'enhanced_cc') {
      if (eff.stunChanceBonus) {
        result.modifiedEffect.stunChanceBonus = (result.modifiedEffect.stunChanceBonus || 0) + eff.stunChanceBonus;
      }
      if (eff.blindDurationBonus) {
        result.modifiedEffect.blindDurationBonus = (result.modifiedEffect.blindDurationBonus || 0) + eff.blindDurationBonus;
      }
      if (eff.accuracyReduction) {
        result.modifiedEffect.accuracyReduction = (result.modifiedEffect.accuracyReduction || 0) + eff.accuracyReduction;
      }
      if (eff.fleeChanceBonus) {
        result.modifiedEffect.fleeChanceBonus = (result.modifiedEffect.fleeChanceBonus || 0) + eff.fleeChanceBonus;
      }
    }
    if (eff.type === 'extreme_cc') {
      result.ccApplied.push('fear');
      result.ccApplied.push('silence');
      result.modifiedEffect.fleeChance = eff.fleeChance || 60;
      result.modifiedEffect.accuracyReduction = (result.modifiedEffect.accuracyReduction || 0) + (eff.accuracyReduction || 80);
    }
    if (eff.type === 'enhanced_pull' && eff.rootChance) {
      result.ccApplied.push('root');
      result.modifiedEffect.addStatuses = (result.modifiedEffect.addStatuses || []);
      result.modifiedEffect.addStatuses.push({ type: 'root', duration: 1, chance: eff.rootChance });
    }
    if (eff.type === 'enhanced_ground' && eff.freezeChance) {
      result.ccApplied.push('freeze');
      result.modifiedEffect.addStatuses = (result.modifiedEffect.addStatuses || []);
      result.modifiedEffect.addStatuses.push({ type: 'freeze', duration: 1, chance: eff.freezeChance });
    }
    if (eff.type === 'chain_stun_wet') {
      result.ccApplied.push('stun');
      result.modifiedEffect.addStatuses = (result.modifiedEffect.addStatuses || []);
      result.modifiedEffect.addStatuses.push({ type: 'stun', duration: 1, chance: eff.stunChance || 50 });
      if (eff.lightningMult) {
        result.modifiedEffect.multiplier = (Number(result.modifiedEffect.multiplier) || 1) * eff.lightningMult;
      }
    }

    // Max HP reduction
    if (eff.hpReductionPct) {
      result.modifiedEffect.maxHpReductionPct = eff.hpReductionPct;
    }

    // Status consumption
    if (eff.consumeWet) result.consumeStatuses.push('wet');
    if (eff.consumeBurn) result.consumeStatuses.push('burn');
    if (eff.consumeFreeze) result.consumeStatuses.push('freeze');
    if (eff.consumePoisonDuration) result.consumeStatuses.push('poison');

    // Lightning damage bonus
    if (eff.lightningBonusMult) {
      result.modifiedEffect.multiplier = (Number(result.modifiedEffect.multiplier) || 1) * eff.lightningBonusMult;
    }
  }

  return result;
}

// ─── CHECK CC IMMUNITY ───────────────────────────────────────
// Returns true if the target is immune to the given CC type
// (2-turn immunity after any hard CC expires, per Phase 1 Fix #5).
function isCCImmune(target, ccType) {
  if (!target || !ccType) return false;
  // All hard CC types share the same immunity timer
  const hardCC = ['stun', 'freeze', 'sleep', 'charm', 'fear', 'root', 'silence'];
  if (!hardCC.includes(ccType)) return false;

  // Check stunImmunityTurns (from PvP DR system)
  if (target.stunImmunityTurns && target.stunImmunityTurns > 0) {
    return true;
  }

  return false;
}

module.exports = {
  SYNERGIES,
  detectSynergies,
  applySynergyEffects,
  isCCImmune,
};
