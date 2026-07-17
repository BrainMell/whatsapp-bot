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

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎨 BEHAVIOR-MODIFYING RUNES (Phase 4 — Skill Customization System)
  // ═══════════════════════════════════════════════════════════════════════════
  // These runes don't just tweak numbers — they fundamentally alter how a
  // skill behaves. Each adds one or more fields to modifiedEffect that the
  // combat resolution code (applyAbilityEffect / calculateDamage) reads and
  // honors. Post-compute patching architecture: skills expose editable
  // properties, runes mutate them, no skill rewrites required.
  //
  // Categories:
  //   1. Element Conversion (3)
  //   2. Targeting (4)
  //   3. Hit Splitting (2)
  //   4. Ground Effects (3)
  //   5. Status Addition (10)
  //   6. Lifesteal / Drain (3)
  //   7. Knockback / Control (3)
  //   8. Casting / Cost (2)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 1. ELEMENT CONVERSION ────────────────────────────────────────────────
  FROST_CONVERSION: {
    id: 'FROST_CONVERSION',
    name: 'Frost Conversion Rune',
    icon: '❄️🔥',
    desc: 'Converts any elemental skill to Frost. Burn effects become Freeze.',
    convertElement: 'ICE',
    convertBurnToFreeze: true,
    damageMult: [0.90, 0.92, 0.95, 0.98],
  },
  SHOCK_CONVERSION: {
    id: 'SHOCK_CONVERSION',
    name: 'Shock Conversion Rune',
    icon: '⚡🔮',
    desc: 'Converts any skill to Lightning. Adds WET synergy priming.',
    convertElement: 'LIGHTNING',
    applyWet: true,
    damageMult: [0.92, 0.94, 0.96, 0.98],
  },
  VOID_CONVERSION: {
    id: 'VOID_CONVERSION',
    name: 'Void Conversion Rune',
    icon: '🌌',
    desc: 'Converts damage to TRUE, ignoring target DEF entirely.',
    convertDamageType: 'TRUE',
    ignoreDefense: 100,
    damageMult: [0.80, 0.85, 0.90, 0.95],
  },

  // ─── 2. TARGETING ─────────────────────────────────────────────────────────
  MULTI_SHOT: {
    id: 'MULTI_SHOT',
    name: 'Multi-Shot Rune',
    icon: '🏹🎯',
    desc: 'Single-target skill hits +2 additional targets.',
    targetBonus: [1, 2, 2, 3],
    convertSingleToAOE: true,
    damageMult: [0.85, 0.88, 0.92, 0.95],
  },
  CHAIN_BOUNCE: {
    id: 'CHAIN_BOUNCE',
    name: 'Chain Bounce Rune',
    icon: '⚡🔗',
    desc: 'Skill arcs to additional targets. +1/2/3 bounces.',
    chainBounces: [1, 2, 3, 4],
    chainDecayPerBounce: 0.75,  // each bounce deals 75% of previous
    damageMult: [0.90, 0.92, 0.95, 0.98],
  },
  SPREAD_BLAST: {
    id: 'SPREAD_BLAST',
    name: 'Spread Blast Rune',
    icon: '💥🌐',
    desc: 'Upgrades single-target to AOE_LARGE.',
    convertTargeting: 'AOE_LARGE',
    damageMult: [0.70, 0.75, 0.80, 0.85],
  },
  PRECISE_FOCUS: {
    id: 'PRECISE_FOCUS',
    name: 'Precise Focus Rune',
    icon: '🎯',
    desc: 'AOE skill becomes single-target with massive damage boost.',
    convertTargeting: 'SINGLE',
    damageMult: [1.40, 1.55, 1.70, 1.90],
    guaranteedCrit: true,
  },

  // ─── 3. HIT SPLITTING ─────────────────────────────────────────────────────
  FRAGMENT: {
    id: 'FRAGMENT',
    name: 'Fragment Rune',
    icon: '💎',
    desc: 'Splits one hit into 3 weaker hits (0.4x each).',
    splitIntoHits: [2, 3, 3, 4],
    splitDamageMult: 0.40,
    damageMult: [1.0, 1.0, 1.0, 1.0],
  },
  BARRAGE: {
    id: 'BARRAGE',
    name: 'Barrage Rune',
    icon: '🏹',
    desc: 'Splits one hit into 5 very weak hits (0.25x each). Great vs shields.',
    splitIntoHits: [3, 4, 5, 6],
    splitDamageMult: 0.25,
    bypassShield: true,
    damageMult: [1.0, 1.0, 1.0, 1.0],
  },

  // ─── 4. GROUND EFFECTS ────────────────────────────────────────────────────
  GROUND_FIRE: {
    id: 'GROUND_FIRE',
    name: 'Ground Fire Rune',
    icon: '🔥',
    desc: 'Leaves burning ground at target location. Burns enemies for 2 turns.',
    groundEffect: { type: 'burn', value: [15, 25, 35, 50], duration: 2 },
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },
  FROST_PATCH: {
    id: 'FROST_PATCH',
    name: 'Frost Patch Rune',
    icon: '❄️',
    desc: 'Leaves a frost patch that slows all enemies for 2 turns.',
    groundEffect: { type: 'slow', value: [20, 30, 40, 50], duration: 2 },
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },
  POISON_CLOUD: {
    id: 'POISON_CLOUD',
    name: 'Poison Cloud Rune',
    icon: '☠️',
    desc: 'Leaves a poisonous cloud that damages enemies for 3 turns.',
    groundEffect: { type: 'poison', value: [12, 20, 30, 45], duration: 3 },
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },

  // ─── 5. STATUS ADDITION ───────────────────────────────────────────────────
  POISON_INFUSION: {
    id: 'POISON_INFUSION',
    name: 'Poison Infusion Rune',
    icon: '🧪',
    desc: 'Adds poison to any skill.',
    addStatus: { type: 'poison', value: [15, 25, 40, 60], duration: 4 },
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },
  BLEED_INFUSION: {
    id: 'BLEED_INFUSION',
    name: 'Bleed Infusion Rune',
    icon: '🩸',
    desc: 'Adds bleed to any skill.',
    addStatus: { type: 'bleed', value: [12, 20, 30, 45], duration: 3 },
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },
  BURN_INFUSION: {
    id: 'BURN_INFUSION',
    name: 'Burn Infusion Rune',
    icon: '🔥',
    desc: 'Adds burn to any skill.',
    addStatus: { type: 'burn', value: [15, 25, 35, 50], duration: 3 },
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },
  FREEZE_INFUSION: {
    id: 'FREEZE_INFUSION',
    name: 'Freeze Infusion Rune',
    icon: '🧊',
    desc: 'Adds a chance to freeze the target.',
    addStatus: { type: 'freeze', chance: [15, 25, 35, 50], duration: 1 },
    damageMult: [0.92, 0.94, 0.96, 0.98],
  },
  SHOCK_INFUSION: {
    id: 'SHOCK_INFUSION',
    name: 'Shock Infusion Rune',
    icon: '⚡',
    desc: 'Adds shock status. Combines with WET for automatic stun.',
    addStatus: { type: 'shock', value: [10, 15, 25, 35], duration: 2 },
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },
  STUN_INFUSION: {
    id: 'STUN_INFUSION',
    name: 'Stun Infusion Rune',
    icon: '💫',
    desc: 'Adds a chance to stun the target.',
    addStatus: { type: 'stun', chance: [10, 20, 30, 40], duration: 1 },
    damageMult: [0.85, 0.88, 0.92, 0.95],
  },
  SILENCE_INFUSION: {
    id: 'SILENCE_INFUSION',
    name: 'Silence Infusion Rune',
    icon: '🤐',
    desc: 'Silences the target — cannot use abilities.',
    addStatus: { type: 'silence', duration: 2 },
    damageMult: [0.90, 0.92, 0.95, 0.98],
  },
  BLIND_INFUSION: {
    id: 'BLIND_INFUSION',
    name: 'Blind Infusion Rune',
    icon: '👁️',
    desc: 'Blinds the target — reduces accuracy.',
    addStatus: { type: 'blind', value: [25, 40, 55, 70], duration: 2 },
    damageMult: [0.92, 0.94, 0.96, 0.98],
  },
  CURSE_INFUSION: {
    id: 'CURSE_INFUSION',
    name: 'Curse Infusion Rune',
    icon: '💀',
    desc: 'Curses the target — reduces all stats.',
    addStatus: { type: 'curse', value: [15, 25, 35, 50], duration: 3 },
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },
  FEAR_INFUSION: {
    id: 'FEAR_INFUSION',
    name: 'Fear Infusion Rune',
    icon: '😱',
    desc: 'Slows target and has a small chance to stun from terror.',
    addStatus: [
      { type: 'slow', value: [20, 30, 40, 50], duration: 2 },
      { type: 'stun', chance: [5, 10, 15, 20], duration: 1 },
    ],
    damageMult: [0.92, 0.94, 0.96, 0.98],
  },

  // ─── 6. LIFESTEAL / DRAIN ─────────────────────────────────────────────────
  LIFESTEAL: {
    id: 'LIFESTEAL',
    name: 'Lifesteal Rune',
    icon: '🩸💚',
    desc: 'Heal for 25% of damage dealt.',
    lifestealPercent: [15, 25, 35, 50],
    damageMult: [0.92, 0.94, 0.96, 0.98],
  },
  MANA_DRAIN: {
    id: 'MANA_DRAIN',
    name: 'Mana Drain Rune',
    icon: '🔵',
    desc: 'Restore energy on hit.',
    energyRestore: [10, 15, 25, 40],
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },
  SOUL_RIP: {
    id: 'SOUL_RIP',
    name: 'Soul Rip Rune',
    icon: '💀💚',
    desc: 'Lifesteal 50% + executes targets below 20% HP (true damage).',
    lifestealPercent: [30, 40, 50, 65],
    executeThreshold: 20,  // % HP
    executeBonus: [2.0, 2.5, 3.0, 4.0],
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },

  // ─── 7. KNOCKBACK / CONTROL ───────────────────────────────────────────────
  KNOCKBACK: {
    id: 'KNOCKBACK',
    name: 'Knockback Rune',
    icon: '👊',
    desc: 'Knocks the target back, applying slow.',
    addStatus: { type: 'slow', value: [15, 25, 35, 50], duration: 2 },
    damageMult: [1.0, 1.0, 1.0, 1.0],
  },
  PULL: {
    id: 'PULL',
    name: 'Pull Rune',
    icon: '🪝',
    desc: 'Pulls the target, with a chance to root.',
    addStatus: { type: 'root', chance: [20, 30, 40, 55], duration: 1 },
    damageMult: [1.0, 1.0, 1.0, 1.0],
  },
  TAUNT: {
    id: 'TAUNT',
    name: 'Taunt Rune',
    icon: '😠',
    desc: 'Forces target to attack you next turn.',
    addStatus: { type: 'taunt', duration: 1 },
    damageMult: [0.95, 0.96, 0.97, 0.98],
  },

  // ─── 8. CASTING / COST ────────────────────────────────────────────────────
  QUICK_CAST: {
    id: 'QUICK_CAST',
    name: 'Quick Cast Rune',
    icon: '⏩',
    desc: 'Cooldown -1 turn (min 0), but +25% energy cost.',
    cooldownFlatReduction: 1,
    energyCostMult: [1.15, 1.20, 1.25, 1.30],
    damageMult: [1.0, 1.0, 1.0, 1.0],
  },
  EFFICIENT_CAST: {
    id: 'EFFICIENT_CAST',
    name: 'Efficient Cast Rune',
    icon: '💫',
    desc: 'Energy cost -40%, but -15% damage.',
    energyCostMult: [0.80, 0.70, 0.65, 0.60],
    damageMult: [0.95, 0.92, 0.88, 0.85],
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
  // 💡 UPDATED 2026-07-17: rune slots now scale with skill tier directly.
  // T1 = 1 slot, T2 = 2 slots, T3 = 3 slots, T4 (ultimate) = 3 slots.
  // Previously: starter=0, evolved=1, ascended=2, ultimate=3 — which meant
  // T1 starter skills had ZERO slots, making them un-runeable.
  if (skill.isUltimate || skill.tier >= 4) return 3;
  if (skill.tier >= 3) return 3;   // T3 skills
  if (skill.tier >= 2) return 2;   // T2 skills
  if (skill.tier >= 1) return 1;   // T1 skills
  return 1;                        // fallback: at least 1 slot
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

// ─── RESOLVE RUNE BY NAME ─────────────────────────────────────────────────
// 💡 Allows players to reference runes by type name instead of ugly IDs.
// Accepts:
//   "POWER"          → first available POWER rune (any tier)
//   "POWER-LESSER"   → first available POWER rune of LESSER tier
//   "power"          → case-insensitive
//   "R-0001"         → old-style ID (backwards compat)
//   "rune_1783..."   → legacy ID (backwards compat)
//
// Returns the Rune document, or null if not found.
async function resolveRune(userJid, query) {
  if (!query) return null;
  const q = query.toUpperCase().trim();

  // 1. Old-style ID (R-XXXX or rune_XXXX)
  if (q.startsWith('R-') || q.startsWith('RUNE_')) {
    return await Rune.findOne({ ownerJid: userJid, runeId: query, onMarket: false, socketedSkillId: null });
  }

  // 2. Type-Tier format (e.g. "POWER-LESSER")
  if (q.includes('-')) {
    const [typePart, tierPart] = q.split('-');
    const type = typePart.trim();
    const tier = tierPart.trim();
    // Validate type exists
    const matchedType = Object.keys(RUNE_TYPES).find(t => t === type || t.replace('_', '') === type);
    if (matchedType && RUNE_TIERS[tier]) {
      return await Rune.findOne({
        ownerJid: userJid, type: matchedType, tier,
        onMarket: false, socketedSkillId: null,
      }).sort({ obtainedAt: 1 }); // oldest first (FIFO)
    }
  }

  // 3. Just type name (e.g. "POWER" or "COOLDOWN")
  const matchedType = Object.keys(RUNE_TYPES).find(t => t === q || t.replace('_', '') === q);
  if (matchedType) {
    return await Rune.findOne({
      ownerJid: userJid, type: matchedType,
      onMarket: false, socketedSkillId: null,
    }).sort({ tier: 1, obtainedAt: 1 }); // lowest tier first, oldest first
  }

  // 4. Try matching by rune type NAME (display name, e.g. "Power Rune" → POWER)
  for (const [id, rt] of Object.entries(RUNE_TYPES)) {
    if (rt.name.toUpperCase() === q || rt.name.toUpperCase().includes(q)) {
      return await Rune.findOne({
        ownerJid: userJid, type: id,
        onMarket: false, socketedSkillId: null,
      }).sort({ tier: 1, obtainedAt: 1 });
    }
  }

  return null;
}

// ─── FUSE RUNES BY NAME + COUNT ───────────────────────────────────────────
// 💡 Fuses N runes of the same type + same tier into fewer higher-tier runes.
// Each pair of same-type same-tier runes → 1 rune of the next tier up.
//
// @param userJid
// @param typeQuery  — e.g. "POWER", "power", "Power Rune"
// @param countQuery — number (2, 4, 6...) or "all"
// @returns { success, message, fusedCount }
async function fuseRunesByName(userJid, typeQuery, countQuery) {
  if (!typeQuery) return { success: false, message: '❌ Specify a rune type to fuse.' };
  const q = typeQuery.toUpperCase().trim();

  // Resolve type
  let matchedType = Object.keys(RUNE_TYPES).find(t => t === q || t.replace('_', '') === q);
  if (!matchedType) {
    for (const [id, rt] of Object.entries(RUNE_TYPES)) {
      if (rt.name.toUpperCase() === q || rt.name.toUpperCase().includes(q)) {
        matchedType = id;
        break;
      }
    }
  }
  if (!matchedType) return { success: false, message: `❌ Unknown rune type: "${typeQuery}"` };

  // Get all unsocketed, off-market runes of this type
  const allRunes = await Rune.find({
    ownerJid: userJid, type: matchedType,
    onMarket: false, socketedSkillId: null,
  }).sort({ tier: 1, obtainedAt: 1 });

  if (allRunes.length < 2) {
    return { success: false, message: `❌ Need at least 2 ${RUNE_TYPES[matchedType].name} runes to fuse. You have ${allRunes.length}.` };
  }

  // Group by tier
  const tierOrder = ['LESSER', 'NORMAL', 'GREATER', 'ABYSSAL'];
  const byTier = {};
  for (const r of allRunes) {
    if (!byTier[r.tier]) byTier[r.tier] = [];
    byTier[r.tier].push(r);
  }

  // Determine how many to fuse
  let maxPairs = 0;
  for (const tier of tierOrder) {
    if (tier === 'ABYSSAL') continue; // can't fuse ABYSSAL
    const count = (byTier[tier] || []).length;
    maxPairs += Math.floor(count / 2);
  }

  if (maxPairs === 0) {
    return { success: false, message: `❌ No fuseable pairs. Need 2+ of the same tier (not ABYSSAL).` };
  }

  let pairsToFuse;
  if (countQuery === 'all' || !countQuery) {
    pairsToFuse = maxPairs;
  } else {
    pairsToFuse = Math.min(parseInt(countQuery) || 0, maxPairs);
    if (pairsToFuse < 1) {
      return { success: false, message: `❌ Invalid count. You can fuse up to ${maxPairs} pair(s).` };
    }
  }

  // Execute fusion
  let fusedCount = 0;
  const results = [];
  for (const tier of tierOrder) {
    if (tier === 'ABYSSAL') continue;
    if (pairsToFuse <= 0) break;
    const runes = byTier[tier] || [];
    const tierIdx = tierOrder.indexOf(tier);
    const newTier = tierOrder[tierIdx + 1];

    while (pairsToFuse > 0 && runes.length >= 2) {
      const r1 = runes.shift();
      const r2 = runes.shift();
      await Rune.deleteOne({ _id: r1._id });
      await Rune.deleteOne({ _id: r2._id });
      const fused = await createRune(userJid, matchedType, newTier, `fusion_${tier}`);
      fusedCount++;
      pairsToFuse--;
      results.push(`${RUNE_TYPES[matchedType].icon} ${RUNE_TYPES[matchedType].name} (${RUNE_TIERS[tier].name}+${RUNE_TIERS[tier].name} → ${RUNE_TIERS[newTier].name})`);
    }
  }

  let msg = `🔮 *FUSION COMPLETE!*\n\nFused ${fusedCount} pair(s) of ${RUNE_TYPES[matchedType].name}:\n`;
  for (const r of results) msg += `  ✅ ${r}\n`;
  msg += `\nUse \`${require('../../botConfig').getPrefix()} rune inv\` to see your upgraded runes.`;
  return { success: true, message: msg, fusedCount };
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
  // Classic numeric modifiers (from original 7 runes)
  let damageMult = 1.0;
  let energyCostMult = 1.0;
  let targetBonus = 0;
  let critBonus = 0;
  let defIgnorePct = 0;
  let cannotEvade = false;
  let cooldownMult = 1.0;

  // Phase 4 behavior-modifying accumulators
  let convertElement = null;
  let convertDamageType = null;
  let convertTargeting = null;
  let convertSingleToAOE = false;
  let convertBurnToFreeze = false;
  let applyWet = false;
  let chainBounces = 0;
  let chainDecayPerBounce = 0.75;
  let splitIntoHits = 0;
  let splitDamageMult = 1.0;
  let bypassShield = false;
  let groundEffect = null;
  let lifestealPercent = 0;
  let energyRestore = 0;
  let executeThreshold = 0;
  let executeBonus = 1.0;
  let cooldownFlatReduction = 0;
  let guaranteedCrit = false;
  const addStatuses = [];  // collected status effects to apply

  for (const rune of socketedRunes) {
    const runeType = RUNE_TYPES[rune.type];
    if (!runeType) continue;
    const tierIdx = RUNE_TIERS[rune.tier]?.multIndex ?? 0;

    // Classic modifiers
    if (runeType.damageMult) damageMult *= runeType.damageMult[tierIdx];
    if (runeType.energyCostMult) energyCostMult *= runeType.energyCostMult[tierIdx];
    if (runeType.targetBonus) targetBonus += runeType.targetBonus[tierIdx];
    if (runeType.critBonus) critBonus += runeType.critBonus[tierIdx];
    if (runeType.defIgnorePct) defIgnorePct += runeType.defIgnorePct[tierIdx];
    if (runeType.cannotEvade) cannotEvade = true;
    if (runeType.cooldownMult) cooldownMult *= runeType.cooldownMult[tierIdx];

    // Phase 4 modifiers
    if (runeType.convertElement) convertElement = runeType.convertElement;
    if (runeType.convertDamageType) convertDamageType = runeType.convertDamageType;
    if (runeType.convertTargeting) convertTargeting = runeType.convertTargeting;
    if (runeType.convertSingleToAOE) convertSingleToAOE = true;
    if (runeType.convertBurnToFreeze) convertBurnToFreeze = true;
    if (runeType.applyWet) applyWet = true;
    if (runeType.chainBounces) chainBounces = Math.max(chainBounces, runeType.chainBounces[tierIdx]);
    if (typeof runeType.chainDecayPerBounce === 'number') chainDecayPerBounce = runeType.chainDecayPerBounce;
    if (runeType.splitIntoHits) splitIntoHits = Math.max(splitIntoHits, runeType.splitIntoHits[tierIdx]);
    if (typeof runeType.splitDamageMult === 'number') splitDamageMult = runeType.splitDamageMult;
    if (runeType.bypassShield) bypassShield = true;
    if (runeType.guaranteedCrit) guaranteedCrit = true;
    if (runeType.cooldownFlatReduction) cooldownFlatReduction += runeType.cooldownFlatReduction;
    if (runeType.ignoreDefense) defIgnorePct = Math.max(defIgnorePct, runeType.ignoreDefense);

    if (runeType.groundEffect) {
      // Latest ground effect wins (don't stack multiple ground types)
      groundEffect = {
        type: runeType.groundEffect.type,
        value: Array.isArray(runeType.groundEffect.value)
          ? runeType.groundEffect.value[tierIdx]
          : runeType.groundEffect.value,
        duration: runeType.groundEffect.duration,
      };
    }
    if (runeType.lifestealPercent) lifestealPercent = Math.max(lifestealPercent, runeType.lifestealPercent[tierIdx]);
    if (runeType.energyRestore) energyRestore += runeType.energyRestore[tierIdx];
    if (runeType.executeThreshold) executeThreshold = runeType.executeThreshold;
    if (runeType.executeBonus) executeBonus = Math.max(executeBonus, runeType.executeBonus[tierIdx]);

    // Collect addStatus entries (may be single object or array)
    if (runeType.addStatus) {
      const statuses = Array.isArray(runeType.addStatus) ? runeType.addStatus : [runeType.addStatus];
      for (const s of statuses) {
        // Resolve tier-indexed values
        const resolved = { type: s.type, duration: s.duration || 1 };
        if (s.value !== undefined) {
          resolved.value = Array.isArray(s.value) ? s.value[tierIdx] : s.value;
        }
        if (s.chance !== undefined) {
          resolved.chance = Array.isArray(s.chance) ? s.chance[tierIdx] : s.chance;
        }
        addStatuses.push(resolved);
      }
    }
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
    modifiedEffect.ignoreDefense = (modifiedEffect.ignoreDefense || 0) + Math.min(100, defIgnorePct);
  }
  // Apply cannot-evade flag
  if (cannotEvade) {
    modifiedEffect.cannotEvade = true;
  }
  // Apply cooldown multiplier
  if (cooldownMult !== 1.0) {
    modifiedEffect.cooldownMult = (modifiedEffect.cooldownMult ?? 1) * cooldownMult;
  }
  // Apply flat cooldown reduction (QUICK_CAST) — applied IN ADDITION to mult
  if (cooldownFlatReduction > 0) {
    modifiedEffect.cooldownFlatReduction = (modifiedEffect.cooldownFlatReduction || 0) + cooldownFlatReduction;
  }

  // Phase 4 behavior patches
  if (convertElement) modifiedEffect.element = convertElement;
  if (convertDamageType) modifiedEffect.damageType = convertDamageType;
  if (convertTargeting) modifiedEffect.targeting = convertTargeting;
  if (convertSingleToAOE && (!modifiedEffect.targeting || modifiedEffect.targeting === 'SINGLE')) {
    modifiedEffect.targeting = 'AOE_SMALL';
    modifiedEffect.targets = Math.max(2, modifiedEffect.targets || 1);
  }
  if (convertBurnToFreeze) modifiedEffect.convertBurnToFreeze = true;
  if (applyWet) modifiedEffect.applyWet = true;
  if (chainBounces > 0) {
    modifiedEffect.chainBounces = chainBounces;
    modifiedEffect.chainDecayPerBounce = chainDecayPerBounce;
  }
  if (splitIntoHits > 0) {
    modifiedEffect.splitIntoHits = splitIntoHits;
    modifiedEffect.splitDamageMult = splitDamageMult;
  }
  if (bypassShield) modifiedEffect.bypassShield = true;
  if (groundEffect) modifiedEffect.groundEffect = groundEffect;
  if (lifestealPercent > 0) modifiedEffect.lifestealPercent = lifestealPercent;
  if (energyRestore > 0) modifiedEffect.energyRestore = (modifiedEffect.energyRestore || 0) + energyRestore;
  if (executeThreshold > 0) {
    modifiedEffect.executeThreshold = executeThreshold;
    modifiedEffect.executeBonus = executeBonus;
  }
  if (guaranteedCrit) modifiedEffect.guaranteedCrit = true;
  if (addStatuses.length > 0) {
    modifiedEffect.addStatuses = (modifiedEffect.addStatuses || []).concat(addStatuses);
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
  resolveRune,
  fuseRunesByName,
  getSocketedRunes,
  socketRune,
  removeRune,
  destroyRune,
  applyRuneModifiers,
  rollRuneDrop,
  awardRune,
  rollAbyssalRuneDrop,
};
