// ============================================
// 📖 SUMMON REGISTRY — static data for all summon species
// ============================================
// This is the data-driven core of the Summoner System.
// Adding a new summon species = add an entry to SUMMON_SPECIES + an echo.
// No code changes elsewhere — the system reads from these registries.
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md
// for full architecture.

// ─────────────────────────────────────────────────────────────
// SUMMON SPECIES — 14 species across 6 class flavors
// ─────────────────────────────────────────────────────────────
// Each species maps to a monsterSkills archetype (reuses monster AI),
// has an element (for resonance synergies), base stats, rarity,
// evolution stages, and an echo (buff applied to summoner on death).

const SUMMON_SPECIES = {
  // ── UNDEAD (Necromancer flavor) ──────────────────────────
  skeleton: {
    name: 'Skeleton',
    archetype: 'BRUTE',
    element: 'undead',
    baseStats: { hp: 80, atk: 15, def: 5, mag: 5, spd: 8 },
    rarity: 'COMMON',
    echoId: 'bone_echo',
    evolutionStages: ['skeleton', 'skeleton_knight', 'skeleton_king'],
    trialId: 'trial_skeleton',
    icon: '💀',
    desc: 'A reanimated warrior bound to your will. Sturdy but slow.'
  },
  skeleton_knight: {
    name: 'Skeleton Knight',
    archetype: 'BRUTE',
    element: 'undead',
    baseStats: { hp: 150, atk: 28, def: 12, mag: 8, spd: 10 },
    rarity: 'UNCOMMON',
    echoId: 'bone_armor_echo',
    evolutionStages: ['skeleton', 'skeleton_knight', 'skeleton_king'],
    trialId: 'trial_skeleton_knight',
    icon: '🦴⚔️',
    desc: 'An armored skeletal champion. Wields a rusted blade with eerie precision.'
  },
  lich_minion: {
    name: 'Lich Minion',
    archetype: 'MAGE',
    element: 'undead',
    baseStats: { hp: 70, atk: 8, def: 4, mag: 25, spd: 12 },
    rarity: 'RARE',
    echoId: 'necrotic_echo',
    evolutionStages: ['lich_minion', 'archlich', 'liches_queen'],
    trialId: 'trial_lich_minion',
    icon: '🧙💀',
    desc: 'A fragment of a lich\'s soul given form. Hurls necrotic bolts.'
  },

  // ── DEMON (Warlock flavor) ───────────────────────────────
  imp: {
    name: 'Imp',
    archetype: 'MAGE',
    element: 'demon',
    baseStats: { hp: 60, atk: 10, def: 3, mag: 18, spd: 15 },
    rarity: 'COMMON',
    echoId: 'impish_echo',
    evolutionStages: ['imp', 'hellspawn', 'archdemon'],
    trialId: 'trial_imp',
    icon: '😈',
    desc: 'A mischievous lesser demon. Fast and magical, but fragile.'
  },
  void_walker: {
    name: 'Void Walker',
    archetype: 'TANK',
    element: 'demon',
    baseStats: { hp: 200, atk: 18, def: 20, mag: 10, spd: 6 },
    rarity: 'UNCOMMON',
    echoId: 'void_shield_echo',
    evolutionStages: ['void_walker', 'void_lord', 'abyssal_titan'],
    trialId: 'trial_void_walker',
    icon: '🌑',
    desc: 'A demon of pure darkness. Absorbs punishment meant for its summoner.'
  },

  // ── ELEMENTAL (Elementalist flavor) ──────────────────────
  flame_elemental: {
    name: 'Flame Elemental',
    archetype: 'MAGE',
    element: 'fire',
    baseStats: { hp: 70, atk: 12, def: 3, mag: 22, spd: 14 },
    rarity: 'UNCOMMON',
    echoId: 'ember_echo',
    evolutionStages: ['flame_elemental', 'inferno_elemental', 'phoenix'],
    trialId: 'trial_flame',
    icon: '🔥',
    desc: 'A living ember given form. Burns enemies with magical fire.'
  },
  frost_elemental: {
    name: 'Frost Elemental',
    archetype: 'MAGE',
    element: 'ice',
    baseStats: { hp: 80, atk: 10, def: 8, mag: 20, spd: 10 },
    rarity: 'UNCOMMON',
    echoId: 'frost_echo',
    evolutionStages: ['frost_elemental', 'blizzard_elemental', 'ice_queen'],
    trialId: 'trial_frost',
    icon: '❄️',
    desc: 'A shard of eternal winter. Slows and freezes enemies.'
  },
  storm_elemental: {
    name: 'Storm Elemental',
    archetype: 'MAGE',
    element: 'lightning',
    baseStats: { hp: 75, atk: 14, def: 5, mag: 24, spd: 18 },
    rarity: 'RARE',
    echoId: 'storm_echo',
    evolutionStages: ['storm_elemental', 'thunder_elemental', 'tempest'],
    trialId: 'trial_storm',
    icon: '⚡',
    desc: 'A roiling cloud of fury. Shocks enemies with chain lightning.'
  },

  // ── BEAST (Druid flavor) ────────────────────────────────
  wolf: {
    name: 'Gray Wolf',
    archetype: 'STALKER',
    element: 'beast',
    baseStats: { hp: 90, atk: 20, def: 6, mag: 4, spd: 16 },
    rarity: 'COMMON',
    echoId: 'pack_echo',
    evolutionStages: ['wolf', 'dire_wolf', 'fenrir'],
    trialId: 'trial_wolf',
    icon: '🐺',
    desc: 'A loyal forest predator. Strikes fast from the shadows.'
  },
  bear: {
    name: 'Cave Bear',
    archetype: 'TANK',
    element: 'beast',
    baseStats: { hp: 180, atk: 22, def: 15, mag: 3, spd: 8 },
    rarity: 'UNCOMMON',
    echoId: 'guardian_echo',
    evolutionStages: ['bear', 'dire_bear', 'ursine_titan'],
    trialId: 'trial_bear',
    icon: '🐻',
    desc: 'A massive ursine guardian. Soaks damage and Mauls foes.'
  },

  // ── CONSTRUCT (Artificer/Grand Inventor flavor) ────────
  turret_mk1: {
    name: 'Auto-Turret MK-I',
    archetype: 'MAGE',
    element: 'construct',
    baseStats: { hp: 60, atk: 16, def: 8, mag: 12, spd: 10 },
    rarity: 'COMMON',
    echoId: 'shrapnel_echo',
    evolutionStages: ['turret_mk1', 'turret_mk2', 'omega_turret'],
    trialId: 'trial_turret_mk1',
    icon: '🔫',
    desc: 'A deployed automatic turret. Stationary but relentless.',
    isStationary: true,  // turret-specific: cannot move, autoAttack only
    autoAttack: true
  },
  cannon_turret: {
    name: 'Cannon Turret',
    archetype: 'BRUTE',
    element: 'construct',
    baseStats: { hp: 100, atk: 30, def: 12, mag: 5, spd: 6 },
    rarity: 'UNCOMMON',
    echoId: 'bombardment_echo',
    evolutionStages: ['cannon_turret', 'siege_turret', 'annihilator'],
    trialId: 'trial_cannon_turret',
    icon: '💥',
    desc: 'A heavy artillery piece. Slow but devastating.',
    isStationary: true,
    autoAttack: true
  },

  // ── DRAGON (Dragon Lord flavor) ─────────────────────────
  wyrmling: {
    name: 'Wyrmling',
    archetype: 'STALKER',
    element: 'dragon',
    baseStats: { hp: 120, atk: 25, def: 10, mag: 18, spd: 14 },
    rarity: 'RARE',
    echoId: 'wyrm_echo',
    evolutionStages: ['wyrmling', 'juvenile_dragon', 'adult_dragon'],
    trialId: 'trial_wyrmling',
    icon: '🐉',
    desc: 'A young dragon. Breathes fire and snaps with razor claws.'
  },
  juvenile_dragon: {
    name: 'Juvenile Dragon',
    archetype: 'BRUTE',
    element: 'dragon',
    baseStats: { hp: 250, atk: 40, def: 18, mag: 28, spd: 12 },
    rarity: 'EPIC',
    echoId: 'dragonfear_echo',
    evolutionStages: ['wyrmling', 'juvenile_dragon', 'adult_dragon'],
    trialId: 'trial_juvenile_dragon',
    icon: '🐲',
    desc: 'A maturing dragon. Terrifying presence weakens enemies.'
  }
};

// ─────────────────────────────────────────────────────────────
// SUMMON ECHOES — buff applied to summoner on summon death
// ─────────────────────────────────────────────────────────────
// Each echo is a temporary buff applied to the PLAYER when their
// summon dies in combat. Only one echo active at a time (new overwrites).
// Echoes do NOT trigger on voluntary dismiss (only on death).
// This turns summon death from a pure negative into a tactical decision.

const SUMMON_ECHOES = {
  // Undead echoes
  bone_echo: {
    name: 'Bone Echo',
    buff: { type: 'defense', value: 15, duration: 3 },
    icon: '🦴',
    desc: '+15% physical defense for 3 turns'
  },
  bone_armor_echo: {
    name: 'Bone Armor Echo',
    buff: { type: 'defense', value: 25, duration: 3 },
    icon: '🛡️🦴',
    desc: '+25% physical defense for 3 turns'
  },
  necrotic_echo: {
    name: 'Necrotic Echo',
    buff: { type: 'magic_damage', value: 20, duration: 3 },
    icon: '💜💀',
    desc: '+20% magic damage for 3 turns'
  },

  // Demon echoes
  impish_echo: {
    name: 'Impish Echo',
    buff: { type: 'speed', value: 15, duration: 3 },
    icon: '😈',
    desc: '+15% speed for 3 turns'
  },
  void_shield_echo: {
    name: 'Void Shield Echo',
    buff: { type: 'damage_reduction', value: 10, duration: 3 },
    icon: '🌑🛡️',
    desc: '+10% damage reduction for 3 turns'
  },

  // Elemental echoes
  ember_echo: {
    name: 'Ember Echo',
    buff: { type: 'fire_damage', value: 20, duration: 3 },
    icon: '🔥',
    desc: '+20% fire damage for 3 turns'
  },
  frost_echo: {
    name: 'Frost Echo',
    buff: { type: 'ice_damage', value: 20, duration: 3 },
    icon: '❄️',
    desc: '+20% ice damage for 3 turns'
  },
  storm_echo: {
    name: 'Storm Echo',
    buff: { type: 'lightning_damage', value: 25, duration: 3 },
    icon: '⚡',
    desc: '+25% lightning damage for 3 turns'
  },

  // Beast echoes
  pack_echo: {
    name: 'Pack Echo',
    buff: { type: 'attack', value: 15, duration: 3 },
    icon: '🐺',
    desc: '+15% attack for 3 turns'
  },
  guardian_echo: {
    name: 'Guardian Echo',
    buff: { type: 'defense', value: 20, duration: 4 },
    icon: '🐻🛡️',
    desc: '+20% defense for 4 turns'
  },

  // Construct echoes
  shrapnel_echo: {
    name: 'Shrapnel Echo',
    buff: { type: 'attack', value: 12, duration: 3 },
    icon: '🔫',
    desc: '+12% attack for 3 turns'
  },
  bombardment_echo: {
    name: 'Bombardment Echo',
    buff: { type: 'attack', value: 20, duration: 3 },
    icon: '💥',
    desc: '+20% attack for 3 turns'
  },

  // Dragon echoes
  wyrm_echo: {
    name: 'Wyrm Echo',
    buff: { type: 'all_stats', value: 10, duration: 2 },
    icon: '🐉',
    desc: '+10% all stats for 2 turns'
  },
  dragonfear_echo: {
    name: 'Dragonfear Echo',
    buff: { type: 'enemy_atk_reduction', value: 15, duration: 3 },
    icon: '🐲😨',
    desc: '-15% enemy attack for 3 turns'
  }
};

// ─────────────────────────────────────────────────────────────
// RESONANCE WEB — collection synergies (own = bonus, no deploy needed)
// ─────────────────────────────────────────────────────────────
// Active if player owns summons meeting the `requires` criteria.
// Bonuses are small (5-10%) so they don't dominate, but reward breadth.
// Recomputed on summon acquire/release/evolve. Cached on user.activeResonances.
// Only counts summons with loyalty > 0 AND not forSale (prevents exploitation).

const RESONANCE_WEB = {
  // Type-count resonances
  legion: {
    name: 'Legion',
    requires: { undead: 3 },
    bonus: { mag: 5 },
    desc: '+5% magic damage (own 3+ undead)',
    icon: '💀💀💀'
  },
  pack: {
    name: 'Pack',
    requires: { beast: 3 },
    bonus: { spd: 5 },
    desc: '+5% speed (own 3+ beasts)',
    icon: '🐺🐺🐺'
  },
  dragonflight: {
    name: 'Dragonflight',
    requires: { dragon: 3 },
    bonus: { hp: 5 },
    desc: '+5% HP (own 3+ dragons)',
    icon: '🐉🐉🐉'
  },
  legion_of_doom: {
    name: 'Legion of Doom',
    requires: { demon: 3 },
    bonus: { atk: 5 },
    desc: '+5% attack (own 3+ demons)',
    icon: '😈😈😈'
  },
  workshop: {
    name: 'Workshop',
    requires: { construct: 3 },
    bonus: { def: 5 },
    desc: '+5% defense (own 3+ constructs)',
    icon: '🔫💥🔧'
  },

  // Cross-element resonances
  steam: {
    name: 'Steam',
    requires: { fire: 1, ice: 1 },
    bonus: { wet_bonus: 10 },
    desc: '+10% damage to wet enemies (own fire + ice)',
    icon: '🔥❄️💨'
  },
  stormfront: {
    name: 'Stormfront',
    requires: { ice: 1, lightning: 1 },
    bonus: { shock_bonus: 10 },
    desc: '+10% damage to shocked enemies (own ice + lightning)',
    icon: '❄️⚡'
  },
  conclave: {
    name: 'Conclave',
    requires: { fire: 1, ice: 1, lightning: 1 },
    bonus: { all_stats: 5 },
    desc: '+5% all stats (own all 3 elemental types)',
    icon: '🔥❄️⚡'
  },

  // Cross-theme resonances
  primal: {
    name: 'Primal',
    requires: { beast: 1, dragon: 1 },
    bonus: { hp: 5, atk: 3 },
    desc: '+5% HP, +3% attack (own beast + dragon)',
    icon: '🐺🐉'
  },
  abyssal: {
    name: 'Abyssal',
    requires: { undead: 1, demon: 1 },
    bonus: { mag: 5, lifesteal: 3 },
    desc: '+5% magic, +3% lifesteal (own undead + demon)',
    icon: '💀😈'
  }
};

// ─────────────────────────────────────────────────────────────
// PERSONALITY MODIFIERS — AI behavior + shift triggers
// ─────────────────────────────────────────────────────────────
// Personalities shift dynamically based on player behavior.
// behaviorScore increments per action; shift triggers at score ≥ 20.

const PERSONALITY_MODIFIERS = {
  STOIC: {
    name: 'Stoic',
    desc: 'Balanced behavior. Uses base AI with no overrides.',
    icon: '😐',
    aiOverride: null  // uses base monsterSkills AI
  },
  AGGRESSIVE: {
    name: 'Aggressive',
    desc: 'Prioritizes attacking the lowest-HP enemy. 70% chance to override buff/heal decisions with attack.',
    icon: '😤',
    aiOverride: {
      attackLowestHpChance: 0.70,
      overrideBuffHeal: true
    }
  },
  PROTECTIVE: {
    name: 'Protective',
    desc: 'Prioritizes guarding the summoner. 50% chance to intercept incoming damage.',
    icon: '🛡️',
    aiOverride: {
      guardSummonerChance: 0.50,
      interceptDamagePct: 30  // absorbs 30% of damage directed at summoner
    }
  },
  CURIOUS: {
    name: 'Curious',
    desc: 'Prefers utility skills (buffs, debuffs). 60% chance to prefer utility over damage.',
    icon: '🤔',
    aiOverride: {
      preferUtilityChance: 0.60
    }
  },
  VOLATILE: {
    name: 'Volatile',
    desc: 'Unpredictable. 30% chance to do something random each turn (high risk/reward).',
    icon: '🎲',
    aiOverride: {
      randomActionChance: 0.30
    }
  }
};

// ─────────────────────────────────────────────────────────────
// SUMMON RARITY CONFIG — stat caps, slot counts, market value
// ─────────────────────────────────────────────────────────────
// Mirrors inventorySystem.MAX_ENHANCEMENT_LEVEL_BY_RARITY pattern.

const SUMMON_RARITY_CONFIG = {
  COMMON: {
    maxLevel: 30,
    statGrowthMult: 1.0,
    runeSlots: 0,
    sellValueMult: 0.6,
    captureChanceBonus: 0  // base capture chance for eggs
  },
  UNCOMMON: {
    maxLevel: 35,
    statGrowthMult: 1.1,
    runeSlots: 1,
    sellValueMult: 0.8,
    captureChanceBonus: 0.05
  },
  RARE: {
    maxLevel: 40,
    statGrowthMult: 1.2,
    runeSlots: 2,
    sellValueMult: 1.0,
    captureChanceBonus: 0.10
  },
  EPIC: {
    maxLevel: 45,
    statGrowthMult: 1.35,
    runeSlots: 3,
    sellValueMult: 1.2,
    captureChanceBonus: 0.15
  },
  LEGENDARY: {
    maxLevel: 50,
    statGrowthMult: 1.5,
    runeSlots: 3,
    sellValueMult: 1.5,
    captureChanceBonus: 0.20
  },
  MYTHIC: {
    maxLevel: 50,
    statGrowthMult: 1.75,
    runeSlots: 3,
    sellValueMult: 2.0,
    captureChanceBonus: 0.25
  }
};

// ─────────────────────────────────────────────────────────────
// SUMMON XP CURVE — faster than player (summons should feel like they grow faster)
// ─────────────────────────────────────────────────────────────
// 100 × level^1.3 (vs player's 250 × 1.18)

const SUMMON_XP_CONFIG = {
  BASE_XP: 100,
  SCALING_FACTOR: 1.3,
  MAX_LEVEL: 50,
  STAT_POINTS_PER_LEVEL: 3,
  SOFT_CAP_THRESHOLD: 15,  // after 15 points in one stat, each additional worth 50%
  SOFT_CAP_MULT: 0.5
};

function getSummonXPForLevel(level) {
  if (level <= 1) return 0;
  let totalXP = 0;
  for (let i = 1; i < level; i++) {
    totalXP += Math.floor(SUMMON_XP_CONFIG.BASE_XP * Math.pow(SUMMON_XP_CONFIG.SCALING_FACTOR, i - 1));
  }
  return totalXP;
}

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

function getSpecies(speciesId) {
  return SUMMON_SPECIES[speciesId] || null;
}

function getEcho(echoId) {
  return SUMMON_ECHOES[echoId] || null;
}

function getResonance(resonanceId) {
  return RESONANCE_WEB[resonanceId] || null;
}

function getPersonalityModifier(personality) {
  return PERSONALITY_MODIFIERS[personality] || PERSONALITY_MODIFIERS.STOIC;
}

function getRarityConfig(rarity) {
  return SUMMON_RARITY_CONFIG[rarity] || SUMMON_RARITY_CONFIG.COMMON;
}

function getAllSpecies() {
  return Object.keys(SUMMON_SPECIES);
}

function getAllResonances() {
  return Object.keys(RESONANCE_WEB);
}

// Get the evolution stage index for a species + tier
// BASE = 0, ASCENDED = 1, TRANSCENDENT = 2
function getEvolutionStageIndex(tier) {
  const map = { BASE: 0, ASCENDED: 1, TRANSCENDENT: 2 };
  return map[tier] || 0;
}

// Get the species ID for a given species + evolution tier
// e.g. skeleton + ASCENDED → skeleton_knight
function getEvolvedSpeciesId(speciesId, targetTier) {
  const species = SUMMON_SPECIES[speciesId];
  if (!species) return speciesId;
  const stageIdx = getEvolutionStageIndex(targetTier);
  return species.evolutionStages[stageIdx] || species.evolutionStages[0];
}

module.exports = {
  SUMMON_SPECIES,
  SUMMON_ECHOES,
  RESONANCE_WEB,
  PERSONALITY_MODIFIERS,
  SUMMON_RARITY_CONFIG,
  SUMMON_XP_CONFIG,
  getSummonXPForLevel,
  getSpecies,
  getEcho,
  getResonance,
  getPersonalityModifier,
  getRarityConfig,
  getAllSpecies,
  getAllResonances,
  getEvolutionStageIndex,
  getEvolvedSpeciesId
};
