// ═══════════════════════════════════════════════════════════════════════════
//  RUNE SYSTEM (Phase 3 — Skill Augments)
// ═══════════════════════════════════════════════════════════════════════════
//
// Runes are socketable augments that modify skill behavior. Each rune has:
//   - type: which modifier it applies (POWER, EFFICIENCY, SPREAD, etc.)
//   - tier: power level (LESSER, NORMAL, GREATER)
//
// Socket rules:
//   - Each skill has 0-3 rune slots (depending on skill tier)
//   - Starter skills: 0 slots, Evolved skills: 1 slot, Ascended: 2, Ultimates: 3
//   - Runes are consumable on socket — removal requires a Rune Removal Scroll
//
// Drop sources:
//   - S+ bosses: 10% chance, SS+: 15%, SSS: 25%
//   - Weekly raid: guaranteed for top 10
//   - Abyss Floor 21+: chance per floor
//
// Runes are tradeable on the card market (reuses market infrastructure).

const Rune = require('../models/Rune');

// ─── RUNE TYPE DEFINITIONS ────────────────────────────────────────────────
// Each type modifies a skill's effect in a specific way.
// Values are per-tier: [LESSER, NORMAL, GREATER]
const RUNE_TYPES = {
  POWER: {
    id: 'POWER',
    name: 'Power Rune',
    icon: '⚡',
    desc: 'Increases skill damage at the cost of higher energy cost',
    damageMult: [1.15, 1.25, 1.40, 1.60],   // +15/25/40% damage
    energyCostMult: [1.10, 1.15, 1.20, 1.30], // +10/15/20% energy cost
  },
  EFFICIENCY: {
    id: 'EFFICIENCY',
    name: 'Efficiency Rune',
    icon: '🔵',
    desc: 'Reduces energy cost at the cost of lower damage',
    damageMult: [0.90, 0.85, 0.80, 0.75],   // -10/15/20% damage
    energyCostMult: [0.80, 0.70, 0.60, 0.40], // -20/30/40% energy cost
  },
  SPREAD: {
    id: 'SPREAD',
    name: 'Spread Rune',
    icon: '🌐',
    desc: 'Increases AOE target count at the cost of per-target damage',
    targetBonus: [1, 2, 3, 4],           // +1/2/3 targets
    damageMult: [0.90, 0.85, 0.80, 0.75],   // -10/15/20% damage per target
  },
  FOCUS: {
    id: 'FOCUS',
    name: 'Focus Rune',
    icon: '🎯',
    desc: 'Increases crit chance at the cost of lower base damage',
    critBonus: [5, 10, 15, 25],           // +5/10/15% crit chance
    damageMult: [0.90, 0.85, 0.80, 0.75],   // -10/15/20% damage
  },
  ENDURANCE: {
    id: 'ENDURANCE',
    name: 'Endurance Rune',
    icon: '🛡️',
    desc: 'Skill ignores target DEF at the cost of lower damage',
    defIgnorePct: [0.20, 0.30, 0.40, 0.60], // ignores 20/30/40% of target DEF
    damageMult: [0.95, 0.90, 0.85],   // -5/10/15% damage
  },
  PIERCE: {
    id: 'PIERCE',
    name: 'Pierce Rune',
    icon: '⚔️',
    desc: 'Skill cannot be evaded, at the cost of lower damage',
    cannotEvade: true,
    damageMult: [0.95, 0.90, 0.85],   // -5/10/15% damage
  },
  COOLDOWN: {
    id: 'COOLDOWN',
    name: 'Cooldown Rune',
    icon: '⏱️',
    desc: 'Reduces skill cooldown. Higher tiers can halve or remove it entirely.',
    // Per-tier cooldown multiplier: LESSER 0.75, NORMAL 0.50, GREATER 0.25, ABYSSAL 0.00
    // (ABYSSAL = no cooldown at all — skill usable every turn)
    cooldownMult: [0.75, 0.50, 0.25, 0.00],
    // Small energy cost penalty so cooldown runes aren't strictly free
    energyCostMult: [1.15, 1.20, 1.25, 1.30],
  },
};

// ─── TIER DEFINITIONS ─────────────────────────────────────────────────────
const RUNE_TIERS = {
  LESSER: { id: 'LESSER', name: 'Lesser', multIndex: 0, dropWeight: 60 },
  NORMAL: { id: 'NORMAL', name: 'Normal', multIndex: 1, dropWeight: 30 },
  GREATER: { id: 'GREATER', name: 'Greater', multIndex: 2, dropWeight: 10 },
  ABYSSAL: { id: 'ABYSSAL', name: 'Abyssal', multIndex: 3, dropWeight: 0 },
};

// ─── SKILL SLOT CAPACITY ──────────────────────────────────────────────────
// How many rune slots a skill has, based on its tier.
// Starter skills: 0, Evolved: 1, Ascended: 2, Ultimate: 3
function getSkillSlotCount(skill) {
  if (!skill) return 0;
  if (skill.isUltimate) return 3;
  if (skill.tier >= 4) return 2;   // ascended-tier skills
  if (skill.tier >= 2) return 1;   // evolved-tier skills
  return 0;                        // starter skills
}

// ─── GENERATE RUNE ID ─────────────────────────────────────────────────────
// 💡 FIX: Short sequential IDs instead of long timestamps+random strings.
// Old format: "rune_1700000000_abc12345" (28 chars)
// New format: "R-001" through "R-999999" (3-8 chars)
// Uses a counter from MongoDB to ensure uniqueness.
let _runeCounter = null;
async function generateRuneId() {
  if (_runeCounter === null) {
    // Initialize counter from existing runes
    try {
      const count = await Rune.countDocuments();
      _runeCounter = count;
    } catch (e) {
      _runeCounter = 0;
    }
  }
  _runeCounter++;
  return `R-${String(_runeCounter).padStart(4, '0')}`;
}

// ─── CREATE A RUNE INSTANCE ───────────────────────────────────────────────
async function createRune(ownerJid, type, tier, obtainedFrom = null) {
  if (!RUNE_TYPES[type]) throw new Error(`Invalid rune type: ${type}`);
  if (!RUNE_TIERS[tier]) throw new Error(`Invalid rune tier: ${tier}`);

  const rune = new Rune({
    runeId: await generateRuneId(),
    ownerJid,
    type,
    tier,
    obtainedFrom,
  });
  await rune.save();
  return rune;
}

// ─── GET USER'S RUNE INVENTORY ────────────────────────────────────────────
async function getRuneInventory(userJid) {
  return await Rune.find({
    ownerJid: userJid,
    onMarket: false,
    socketedSkillId: null,
  }).sort({ type: 1, tier: 1, obtainedAt: -1 });
}

// ─── GET RUNES SOCKETED IN A SKILL ────────────────────────────────────────
async function getSocketedRunes(userJid, skillId) {
  return await Rune.find({
    ownerJid: userJid,
    socketedSkillId: skillId,
  });
}

// ─── SOCKET A RUNE INTO A SKILL ───────────────────────────────────────────
async function socketRune(userJid, runeId, skillId) {
  const rune = await Rune.findOne({ runeId, ownerJid: userJid });
  if (!rune) return { success: false, message: '❌ Rune not found in your inventory.' };
  if (rune.socketedSkillId) return { success: false, message: `❌ This rune is already socketed in ${rune.socketedSkillId}.` };
  if (rune.onMarket) return { success: false, message: '❌ This rune is on the market. Remove it first.' };

  // Count existing socketed runes for this skill
  const existing = await getSocketedRunes(userJid, skillId);
  // 💡 QA FIX: actually check the skill's slot count. Previously the comment
  // said "the caller validates that" but the caller (engine.js) did NOT
  // validate — players could socket into 0-slot starter skills.
  // Look up the skill definition across all class trees.
  const skillTree = require('./skillTree');
  let skillDef = null;
  const allClasses = skillTree.SKILL_TREES || {};
  for (const [classId, classTree] of Object.entries(allClasses)) {
    if (!classTree || !classTree.trees) continue;
    for (const [treeName, treeData] of Object.entries(classTree.trees)) {
      if (!treeData || !treeData.skills) continue;
      if (treeData.skills[skillId]) {
        skillDef = treeData.skills[skillId];
        break;
      }
    }
    if (skillDef) break;
  }
  if (!skillDef) {
    return { success: false, message: `❌ Skill "${skillId}" not found.` };
  }
  const maxSlots = getSkillSlotCount(skillDef);
  if (maxSlots === 0) {
    return { success: false, message: `❌ This skill has 0 rune slots (starter skills can't be socketed).` };
  }
  if (existing.length >= maxSlots) {
    return { success: false, message: `❌ This skill already has ${existing.length}/${maxSlots} runes socketed (maximum).` };
  }

  // 💡 QA FIX: SPREAD rune is useless on single-target skills — reject to prevent traps
  if (rune.type === 'SPREAD') {
    const targeting = skillDef.targeting || '';
    const isAOE = targeting.includes('AOE') || targeting === 'ALL_ENEMIES' || targeting === 'CLEAVE' || targeting === 'CHAIN' || skillDef.damageMultiplier;
    if (!isAOE) {
      return { success: false, message: `❌ SPREAD rune can only be socketed into AOE skills. "${skillDef.name || skillId}" is single-target.` };
    }
  }

  rune.socketedSkillId = skillId;
  rune.socketedAt = new Date();
  await rune.save();

  return {
    success: true,
    message: `✅ Socketed ${RUNE_TYPES[rune.type].name} (${RUNE_TIERS[rune.tier].name}) into ${skillId}.`,
    rune,
  };
}

// ─── REMOVE A RUNE FROM A SKILL ───────────────────────────────────────────
// Requires a Rune Removal Scroll (passed as hasScroll=true from the command
// handler, which checks the user's inventory).
async function removeRune(userJid, runeId, hasScroll = false) {
  const rune = await Rune.findOne({ runeId, ownerJid: userJid });
  if (!rune) return { success: false, message: '❌ Rune not found.' };
  if (!rune.socketedSkillId) return { success: false, message: '❌ This rune is not socketed.' };

  if (!hasScroll) {
    return {
      success: false,
      message: '❌ Removing a socketed rune requires a *Rune Removal Scroll*. You can get one from the cash shop or as a rare raid drop.\n\n_Warning: removing without a scroll would destroy the rune. Use `.g rune destroy <id>` to destroy the rune without a scroll._',
    };
  }

  rune.socketedSkillId = null;
  rune.socketedAt = null;
  await rune.save();

  return {
    success: true,
    message: `✅ Removed ${RUNE_TYPES[rune.type].name} (${RUNE_TIERS[rune.tier].name}) from skill. The rune is back in your inventory.`,
    rune,
  };
}

// ─── DESTROY A SOCKETED RUNE (no scroll needed) ───────────────────────────
async function destroyRune(userJid, runeId) {
  const rune = await Rune.findOne({ runeId, ownerJid: userJid });
  if (!rune) return { success: false, message: '❌ Rune not found.' };
  if (!rune.socketedSkillId) return { success: false, message: '❌ This rune is not socketed.' };
  if (rune.onMarket) return { success: false, message: '❌ Cancel the market listing first.' };

  await Rune.deleteOne({ runeId });
  return {
    success: true,
    message: `💀 Destroyed ${RUNE_TYPES[rune.type].name} (${RUNE_TIERS[rune.tier].name}). It's gone forever.`,
  };
}

// ─── APPLY RUNE MODIFIERS TO A SKILL EFFECT ───────────────────────────────
// This is the core integration point — called from skillTree.getSkillEffect
// AFTER the base effect is computed, to apply socketed rune modifiers.
//
// Input: the computed effect object + the user's socketed runes for this skill
// Output: modified effect object
function applyRuneModifiers(effect, socketedRunes) {
  if (!effect || !socketedRunes || socketedRunes.length === 0) return effect;

  let modifiedEffect = { ...effect };
  let damageMult = 1.0;
  let energyCostMult = 1.0;
  let targetBonus = 0;
  let critBonus = 0;
  let defIgnorePct = 0;
  let cannotEvade = false;
  let cooldownMult = 1.0;

  for (const rune of socketedRunes) {
    const runeType = RUNE_TYPES[rune.type];
    if (!runeType) continue;
    const tierIdx = RUNE_TIERS[rune.tier]?.multIndex ?? 0;

    if (runeType.damageMult) damageMult *= runeType.damageMult[tierIdx];
    if (runeType.energyCostMult) energyCostMult *= runeType.energyCostMult[tierIdx];
    if (runeType.targetBonus) targetBonus += runeType.targetBonus[tierIdx];
    if (runeType.critBonus) critBonus += runeType.critBonus[tierIdx];
    if (runeType.defIgnorePct) defIgnorePct += runeType.defIgnorePct[tierIdx];
    if (runeType.cannotEvade) cannotEvade = true;
    if (runeType.cooldownMult) cooldownMult *= runeType.cooldownMult[tierIdx];
  }

  // Apply damage multiplier
  if (damageMult !== 1.0) {
    modifiedEffect.multiplier = (Number(modifiedEffect.multiplier) || 1) * damageMult;
  }
  // Apply energy cost multiplier
  if (modifiedEffect.cost && energyCostMult !== 1.0) {
    modifiedEffect.cost = Math.ceil(modifiedEffect.cost * energyCostMult);
  }
  // Apply target bonus
  if (targetBonus > 0) {
    const currentTargets = modifiedEffect.targets || 1;
    modifiedEffect.targets = currentTargets + targetBonus;
  }
  // Apply crit bonus
  if (critBonus > 0) {
    modifiedEffect.critBonus = (modifiedEffect.critBonus || 0) + critBonus;
  }
  // Apply DEF ignore
  if (defIgnorePct > 0) {
    modifiedEffect.ignoreDefense = (modifiedEffect.ignoreDefense || 0) + Math.min(80, defIgnorePct); // cap at 80%
  }
  // Apply cannot-evade flag
  if (cannotEvade) {
    modifiedEffect.cannotEvade = true;
  }
  // Apply cooldown multiplier (COOLDOWN rune). Multiple cooldown runes multiply,
  // so two LESSER (0.75 × 0.75 = 0.5625) is roughly equivalent to one NORMAL
  // (0.50) — diminishing returns on stacking.
  if (cooldownMult !== 1.0) {
    modifiedEffect.cooldownMult = (modifiedEffect.cooldownMult ?? 1) * cooldownMult;
  }

  return modifiedEffect;
}

// ─── ROLL A RUNE DROP ─────────────────────────────────────────────────────
// Called from boss kill / raid reward / abyss drop.
// dropChance is the probability of dropping a rune (0.0-1.0).
// Returns a random type + tier, or null if no drop.
function rollRuneDrop(dropChance) {
  if (typeof dropChance !== 'number' || !Number.isFinite(dropChance) || dropChance <= 0 || Math.random() > dropChance) return null;

  // Roll tier based on drop weights
  const tierEntries = Object.values(RUNE_TIERS);
  const totalWeight = tierEntries.reduce((s, t) => s + t.dropWeight, 0);
  let roll = Math.random() * totalWeight;
  let tier = RUNE_TIERS.LESSER;
  for (const t of tierEntries) {
    roll -= t.dropWeight;
    if (roll <= 0) { tier = t; break; }
  }

  // Roll type uniformly
  const typeKeys = Object.keys(RUNE_TYPES);
  const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];

  return { type, tier: tier.id };
}

// ─── AWARD RUNE TO USER ───────────────────────────────────────────────────
async function awardRune(userJid, type, tier, obtainedFrom = null) {
  try {
    const rune = await createRune(userJid, type, tier, obtainedFrom);
    return {
      success: true,
      rune,
      message: `💎 *Rune Drop!* ${RUNE_TYPES[type].icon} ${RUNE_TYPES[type].name} (${RUNE_TIERS[tier].name})\n_Use \`.g rune socket <runeId> <skillId>\` to socket it._`,
    };
  } catch (e) {
    console.error('[RuneSystem] Failed to award rune:', e.message);
    return { success: false, message: 'Failed to award rune: ' + e.message };
  }
}


function rollAbyssalRuneDrop(floor) {
  let tier = RUNE_TIERS.GREATER;
  if (floor >= 100) tier = RUNE_TIERS.ABYSSAL;
  else if (floor >= 50) tier = Math.random() < 0.25 ? RUNE_TIERS.ABYSSAL : RUNE_TIERS.GREATER;
  const typeKeys = Object.keys(RUNE_TYPES);
  const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
  return { type, tier: tier.id };
}

module.exports = {
  RUNE_TYPES,
  RUNE_TIERS,
  getSkillSlotCount,
  createRune,
  getRuneInventory,
  getSocketedRunes,
  socketRune,
  removeRune,
  destroyRune,
  applyRuneModifiers,
  rollRuneDrop,
  awardRune,
  rollAbyssalRuneDrop,
};
