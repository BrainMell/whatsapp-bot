// ============================================
// 🐉 SUMMON REGISTRY — Species Database
// ============================================
// ONLY summons with dedicated sparklinlabs sprites are in this registry.
// Each summon maps 1:1 to its own idle.gif — no sprite sharing.
// 14 animated idle.gif sprites + 3 static ship PNGs = 17 total summons.
//
// To add a new summon: add the idle.gif to sparklinlabs/ folder on Box 2,
// then add an entry here with species = filename (without _idle.gif).

const SUMMON_SPECIES = {
  // ═══════════════════════════════════════════════════════════════
  // ANIMATED SUMMONS (idle.gif sprites from sparklinlabs)
  // ═══════════════════════════════════════════════════════════════

  bat: {
    name: 'Bat', archetype: 'STALKER', element: 'beast',
    baseStats: { hp: 80, atk: 15, def: 4, mag: 8, spd: 22 },
    rarity: 'COMMON', echoId: 'pack_echo',
    evolutionStages: ['bat'], trialId: 'trial_bat',
    icon: '🦇', desc: 'A swift bat that strikes from the shadows.',
  },
  boar: {
    name: 'Boar', archetype: 'BRUTE', element: 'beast',
    baseStats: { hp: 150, atk: 25, def: 12, mag: 5, spd: 10 },
    rarity: 'COMMON', echoId: 'pack_echo',
    evolutionStages: ['boar'], trialId: 'trial_boar',
    icon: '🐗', desc: 'A wild boar with devastating charges.',
  },
  chest: {
    name: 'Mimic Chest', archetype: 'TANK', element: 'construct',
    baseStats: { hp: 200, atk: 15, def: 25, mag: 5, spd: 4 },
    rarity: 'UNCOMMON', echoId: 'guardian_echo',
    evolutionStages: ['chest'], trialId: 'trial_chest',
    icon: '🧰', desc: 'A treasure chest that bites. Surprisingly durable.',
  },
  dino: {
    name: 'Dino', archetype: 'BRUTE', element: 'beast',
    baseStats: { hp: 180, atk: 28, def: 14, mag: 8, spd: 12 },
    rarity: 'UNCOMMON', echoId: 'pack_echo',
    evolutionStages: ['dino'], trialId: 'trial_dino',
    icon: '🦖', desc: 'A small dinosaur with sharp teeth and thick hide.',
  },
  dragon: {
    name: 'Dragon', archetype: 'BRUTE', element: 'dragon',
    baseStats: { hp: 300, atk: 40, def: 20, mag: 25, spd: 15 },
    rarity: 'RARE', echoId: 'dragonfear_echo',
    evolutionStages: ['dragon'], trialId: 'trial_dragon',
    icon: '🐉', desc: 'A fearsome dragon that breathes fire.',
  },
  ghost: {
    name: 'Ghost', archetype: 'STALKER', element: 'undead',
    baseStats: { hp: 90, atk: 18, def: 6, mag: 20, spd: 18 },
    rarity: 'COMMON', echoId: 'bone_echo',
    evolutionStages: ['ghost'], trialId: 'trial_ghost',
    icon: '👻', desc: 'A spectral entity that phases through attacks.',
  },
  giant: {
    name: 'Giant', archetype: 'TANK', element: 'construct',
    baseStats: { hp: 350, atk: 30, def: 35, mag: 5, spd: 6 },
    rarity: 'RARE', echoId: 'guardian_echo',
    evolutionStages: ['giant'], trialId: 'trial_giant',
    icon: '🗿', desc: 'A massive stone giant. Slow but nearly unkillable.',
  },
  mimic: {
    name: 'Mimic', archetype: 'STALKER', element: 'construct',
    baseStats: { hp: 120, atk: 22, def: 10, mag: 15, spd: 16 },
    rarity: 'UNCOMMON', echoId: 'shrapnel_echo',
    evolutionStages: ['mimic'], trialId: 'trial_mimic',
    icon: '🎁', desc: 'A cunning mimic that lures prey with false promises.',
  },
  mushroom: {
    name: 'Mushroom', archetype: 'MAGE', element: 'nature',
    baseStats: { hp: 100, atk: 10, def: 8, mag: 28, spd: 10 },
    rarity: 'COMMON', echoId: 'ember_echo',
    evolutionStages: ['mushroom'], trialId: 'trial_mushroom',
    icon: '🍄', desc: 'A sentient mushroom that casts spore magic.',
  },
  octopus: {
    name: 'Octopus', archetype: 'BRUTE', element: 'water',
    baseStats: { hp: 160, atk: 24, def: 12, mag: 12, spd: 14 },
    rarity: 'UNCOMMON', echoId: 'frost_echo',
    evolutionStages: ['octopus'], trialId: 'trial_octopus',
    icon: '🐙', desc: 'An eight-armed sea creature that crushes enemies.',
  },
  reptile: {
    name: 'Reptile', archetype: 'STALKER', element: 'beast',
    baseStats: { hp: 110, atk: 20, def: 8, mag: 6, spd: 20 },
    rarity: 'COMMON', echoId: 'pack_echo',
    evolutionStages: ['reptile'], trialId: 'trial_reptile',
    icon: '🦎', desc: 'A quick reptile that strikes with venomous bites.',
  },
  slime: {
    name: 'Slime', archetype: 'TANK', element: 'nature',
    baseStats: { hp: 130, atk: 8, def: 18, mag: 10, spd: 6 },
    rarity: 'COMMON', echoId: 'guardian_echo',
    evolutionStages: ['slime'], trialId: 'trial_slime',
    icon: '🟢', desc: 'A gelatinous blob that absorbs damage.',
  },
  snake: {
    name: 'Snake', archetype: 'STALKER', element: 'beast',
    baseStats: { hp: 90, atk: 16, def: 6, mag: 10, spd: 24 },
    rarity: 'COMMON', echoId: 'pack_echo',
    evolutionStages: ['snake'], trialId: 'trial_snake',
    icon: '🐍', desc: 'A venomous serpent that strikes with blinding speed.',
  },
  yeti: {
    name: 'Yeti', archetype: 'BRUTE', element: 'ice',
    baseStats: { hp: 250, atk: 35, def: 20, mag: 15, spd: 10 },
    rarity: 'RARE', echoId: 'frost_echo',
    evolutionStages: ['yeti'], trialId: 'trial_yeti',
    icon: '🦏', desc: 'A towering yeti from frozen peaks.',
  },

  // ═══════════════════════════════════════════════════════════════
  // STATIC PNG SUMMONS (ship sprites for Grand Inventor)
  // ═══════════════════════════════════════════════════════════════

  ship_cruiser: {
    name: 'Cruiser', archetype: 'BRUTE', element: 'construct',
    baseStats: { hp: 280, atk: 38, def: 22, mag: 10, spd: 12 },
    rarity: 'UNCOMMON', echoId: 'shrapnel_echo',
    evolutionStages: ['ship_cruiser'], trialId: 'trial_ship_cruiser',
    icon: '🚀', desc: 'A heavy space cruiser with devastating firepower.',
    isStatic: true, // uses PNG, not idle.gif
  },
  ship_fighter: {
    name: 'Fighter', archetype: 'STALKER', element: 'construct',
    baseStats: { hp: 180, atk: 30, def: 12, mag: 8, spd: 28 },
    rarity: 'UNCOMMON', echoId: 'shrapnel_echo',
    evolutionStages: ['ship_fighter'], trialId: 'trial_ship_fighter',
    icon: '✈️', desc: 'A nimble space fighter that strikes fast.',
    isStatic: true,
  },
  ship_squid: {
    name: 'Squid', archetype: 'MAGE', element: 'construct',
    baseStats: { hp: 200, atk: 15, def: 14, mag: 35, spd: 14 },
    rarity: 'RARE', echoId: 'shrapnel_echo',
    evolutionStages: ['ship_squid'], trialId: 'trial_ship_squid',
    icon: '🛸', desc: 'A mysterious squid-type vessel with arcane tech.',
    isStatic: true,
  },
};

// ════════════════════════════════════════════════════════════════
// RARITY CONFIG
// ════════════════════════════════════════════════════════════════

const RARITY_CONFIG = {
  COMMON: { maxLevel: 30, statPointsPerLevel: 3, softCapThreshold: 50, softCapMult: 0.5, marketValue: 5000 },
  UNCOMMON: { maxLevel: 40, statPointsPerLevel: 3, softCapThreshold: 60, softCapMult: 0.5, marketValue: 15000 },
  RARE: { maxLevel: 50, statPointsPerLevel: 4, softCapThreshold: 70, softCapMult: 0.5, marketValue: 50000 },
  EPIC: { maxLevel: 50, statPointsPerLevel: 4, softCapThreshold: 80, softCapMult: 0.5, marketValue: 150000 },
  LEGENDARY: { maxLevel: 60, statPointsPerLevel: 5, softCapThreshold: 90, softCapMult: 0.5, marketValue: 500000 },
  MYTHIC: { maxLevel: 75, statPointsPerLevel: 5, softCapThreshold: 100, softCapMult: 0.5, marketValue: 1500000 },
};

// ════════════════════════════════════════════════════════════════
// XP CONFIG
// ════════════════════════════════════════════════════════════════

const SUMMON_XP_CONFIG = {
  BASE_XP: 100,
  XP_MULTIPLIER: 1.5,
  STAT_POINTS_PER_LEVEL: 3,
  SOFT_CAP_THRESHOLD: 50,
  SOFT_CAP_MULT: 0.5,
};

function getSummonXPForLevel(level) {
  return Math.floor(SUMMON_XP_CONFIG.BASE_XP * Math.pow(SUMMON_XP_CONFIG.XP_MULTIPLIER, level - 1));
}

// ════════════════════════════════════════════════════════════════
// STARTER SPECIES (for Basic Summon Egg)
// ════════════════════════════════════════════════════════════════

const STARTER_SPECIES = ['bat', 'slime', 'mushroom', 'snake'];

// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════

function getSpecies(speciesId) {
  return SUMMON_SPECIES[speciesId] || null;
}

function getAllSpecies() {
  return Object.keys(SUMMON_SPECIES);
}

function getRarityConfig(rarity) {
  return RARITY_CONFIG[rarity] || RARITY_CONFIG.COMMON;
}

// Echoes (simplified — all summons share generic echoes now)
const ECHOES = {
  pack_echo: { name: 'Pack Echo', desc: 'Nearby beasts gain +5% ATK', icon: '🐺' },
  guardian_echo: { name: 'Guardian Echo', desc: 'On death, owner gains +20% DEF for 3 turns', icon: '🛡️' },
  bone_echo: { name: 'Bone Echo', desc: 'On death, owner gains +15% MAG for 3 turns', icon: '💀' },
  ember_echo: { name: 'Ember Echo', desc: 'On death, owner gains +15% ATK for 3 turns', icon: '🔥' },
  frost_echo: { name: 'Frost Echo', desc: 'On death, owner gains +15% SPD for 3 turns', icon: '❄️' },
  dragonfear_echo: { name: 'Dragon Fear', desc: 'On death, enemies lose -10% DEF for 3 turns', icon: '🐉' },
  shrapnel_echo: { name: 'Shrapnel Echo', desc: 'On death, deal 50 damage to all enemies', icon: '💥' },
  void_shield_echo: { name: 'Void Shield', desc: 'On death, owner gains shield for 100 HP', icon: '🛡️' },
};

function getEcho(echoId) {
  return ECHOES[echoId] || null;
}

// Personality modifiers
const PERSONALITIES = {
  STOIC: { name: 'Stoic', desc: 'No modifiers', statMult: { hp: 1.0, atk: 1.0, def: 1.0, mag: 1.0, spd: 1.0 } },
  AGGRESSIVE: { name: 'Aggressive', desc: '+10% ATK, -10% DEF', statMult: { hp: 1.0, atk: 1.1, def: 0.9, mag: 1.0, spd: 1.0 } },
  PROTECTIVE: { name: 'Protective', desc: '+15% DEF, -5% ATK', statMult: { hp: 1.05, atk: 0.95, def: 1.15, mag: 1.0, spd: 0.95 } },
  CURIOUS: { name: 'Curious', desc: '+10% MAG, -5% HP', statMult: { hp: 0.95, atk: 1.0, def: 1.0, mag: 1.1, spd: 1.0 } },
  VOLATILE: { name: 'Volatile', desc: '+15% SPD, -10% HP', statMult: { hp: 0.9, atk: 1.0, def: 1.0, mag: 1.0, spd: 1.15 } },
};

function getPersonalityModifier(personality) {
  return PERSONALITIES[personality] || PERSONALITIES.STOIC;
}

// Resonance Web (simplified)
const RESONANCES = {
  dual_element: { name: 'Dual Element', desc: '+5% all stats', icon: '🔗' },
  tri_element: { name: 'Tri Element', desc: '+10% all stats', icon: '🔗🔗' },
  quad_element: { name: 'Quad Element', desc: '+15% all stats', icon: '🔗🔗🔗' },
};

function getResonance(resonanceId) {
  return RESONANCES[resonanceId] || null;
}

module.exports = {
  SUMMON_SPECIES,
  RARITY_CONFIG,
  SUMMON_XP_CONFIG,
  STARTER_SPECIES,
  getSpecies,
  getAllSpecies,
  getRarityConfig,
  getSummonXPForLevel,
  getEcho,
  getPersonalityModifier,
  getResonance,
};
