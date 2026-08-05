// ============================================
// 🐉 SUMMON REGISTRY — Species Database
// ============================================
// ONLY summons with dedicated sparklinlabs sprites are in this registry.
// Each summon maps 1:1 to its own idle.gif — no sprite sharing.
// 20 animated idle.gif sprites + 3 static ship PNGs = 23 total summons.

const SUMMON_SPECIES = {
  // ═══════════════════════════════════════════════════════════════
  // ANIMATED SUMMONS (idle.gif sprites from sparklinlabs)
  // ═══════════════════════════════════════════════════════════════

  bat: {
    name: 'Nocturne', archetype: 'STALKER', element: 'shadow',
    baseStats: { hp: 80, atk: 18, def: 4, mag: 10, spd: 24 },
    rarity: 'COMMON', echoId: 'pack_echo',
    evolutionStages: ['bat'], trialId: 'trial_bat',
    icon: '🦇', desc: 'A shadow bat that strikes from darkness with blinding speed.',
  },
  boar: {
    name: 'Tuskgore', archetype: 'BRUTE', element: 'earth',
    baseStats: { hp: 160, atk: 28, def: 14, mag: 5, spd: 10 },
    rarity: 'COMMON', echoId: 'pack_echo',
    evolutionStages: ['boar'], trialId: 'trial_boar',
    icon: '🐗', desc: 'A savage boar whose charges shatter bone and armor alike.',
  },
  chest: {
    name: 'Mimic Chest', archetype: 'TANK', element: 'construct',
    baseStats: { hp: 220, atk: 15, def: 28, mag: 5, spd: 4 },
    rarity: 'UNCOMMON', echoId: 'guardian_echo',
    evolutionStages: ['chest'], trialId: 'trial_chest',
    icon: '🧰', desc: 'A treasure chest with razor teeth. Adventurers beware.',
  },
  dino: {
    name: 'Rexor', archetype: 'BRUTE', element: 'beast',
    baseStats: { hp: 190, atk: 32, def: 16, mag: 8, spd: 12 },
    rarity: 'UNCOMMON', echoId: 'pack_echo',
    evolutionStages: ['dino'], trialId: 'trial_dino',
    icon: '🦖', desc: 'A primal dinosaur with jaws that can crush stone.',
  },
  dragon: {
    name: 'Pyraxis', archetype: 'BRUTE', element: 'fire',
    baseStats: { hp: 320, atk: 42, def: 22, mag: 28, spd: 15 },
    rarity: 'RARE', echoId: 'dragonfear_echo',
    evolutionStages: ['dragon'], trialId: 'trial_dragon',
    icon: '🐉', desc: 'A fearsome dragon whose breath melts steel.',
  },
  ghost: {
    name: 'Wraithveil', archetype: 'STALKER', element: 'undead',
    baseStats: { hp: 95, atk: 20, def: 6, mag: 22, spd: 20 },
    rarity: 'COMMON', echoId: 'bone_echo',
    evolutionStages: ['ghost'], trialId: 'trial_ghost',
    icon: '👻', desc: 'A spectral wraith that phases through mortal defenses.',
  },
  giant: {
    name: 'Colossus', archetype: 'TANK', element: 'earth',
    baseStats: { hp: 380, atk: 32, def: 38, mag: 5, spd: 6 },
    rarity: 'RARE', echoId: 'guardian_echo',
    evolutionStages: ['giant'], trialId: 'trial_giant',
    icon: '🗿', desc: 'A massive stone giant. An immovable wall of living rock.',
  },
  mimic: {
    name: 'Trickbox', archetype: 'STALKER', element: 'construct',
    baseStats: { hp: 130, atk: 24, def: 10, mag: 16, spd: 18 },
    rarity: 'UNCOMMON', echoId: 'shrapnel_echo',
    evolutionStages: ['mimic'], trialId: 'trial_mimic',
    icon: '🎁', desc: 'A cunning mimic that lures prey with illusions of treasure.',
  },
  mushroom: {
    name: 'Sporelord', archetype: 'MAGE', element: 'nature',
    baseStats: { hp: 110, atk: 10, def: 8, mag: 32, spd: 10 },
    rarity: 'COMMON', echoId: 'ember_echo',
    evolutionStages: ['mushroom'], trialId: 'trial_mushroom',
    icon: '🍄', desc: 'A sentient mushroom that commands toxic spore magic.',
  },
  octopus: {
    name: 'Krakenling', archetype: 'BRUTE', element: 'water',
    baseStats: { hp: 170, atk: 26, def: 14, mag: 14, spd: 14 },
    rarity: 'UNCOMMON', echoId: 'frost_echo',
    evolutionStages: ['octopus'], trialId: 'trial_octopus',
    icon: '🐙', desc: 'A young kraken with eight crushing tentacles.',
  },
  reptile: {
    name: 'Venomscale', archetype: 'STALKER', element: 'poison',
    baseStats: { hp: 120, atk: 22, def: 8, mag: 8, spd: 22 },
    rarity: 'COMMON', echoId: 'pack_echo',
    evolutionStages: ['reptile'], trialId: 'trial_reptile',
    icon: '🦎', desc: 'A venomous reptile whose bite corrodes armor.',
  },
  slime: {
    name: 'Gelatrix', archetype: 'TANK', element: 'nature',
    baseStats: { hp: 140, atk: 8, def: 20, mag: 12, spd: 6 },
    rarity: 'COMMON', echoId: 'guardian_echo',
    evolutionStages: ['slime'], trialId: 'trial_slime',
    icon: '🟢', desc: 'A gelatinous blob that absorbs and nullifies damage.',
  },
  snake: {
    name: 'Vipertongue', archetype: 'STALKER', element: 'poison',
    baseStats: { hp: 95, atk: 18, def: 6, mag: 12, spd: 26 },
    rarity: 'COMMON', echoId: 'pack_echo',
    evolutionStages: ['snake'], trialId: 'trial_snake',
    icon: '🐍', desc: 'A deadly serpent that strikes before you can blink.',
  },
  yeti: {
    name: 'Frostbeard', archetype: 'BRUTE', element: 'ice',
    baseStats: { hp: 270, atk: 38, def: 22, mag: 16, spd: 10 },
    rarity: 'RARE', echoId: 'frost_echo',
    evolutionStages: ['yeti'], trialId: 'trial_yeti',
    icon: '🦏', desc: 'A towering yeti from the frozen peaks. Its roar avalanches mountains.',
  },

  // ═══════════════════════════════════════════════════════════════
  // GRAND INVENTOR TORRENT SUMMONS (static PNG ship sprites)
  // These are mechanical summons unique to the Grand Inventor class.
  // ═══════════════════════════════════════════════════════════════

  ship_cruiser: {
    name: 'Torrent Cruiser', archetype: 'BRUTE', element: 'construct',
    baseStats: { hp: 300, atk: 40, def: 24, mag: 10, spd: 12 },
    rarity: 'UNCOMMON', echoId: 'shrapnel_echo',
    evolutionStages: ['ship_cruiser'], trialId: 'trial_ship_cruiser',
    icon: '🚀', desc: 'A heavy assault cruiser. Broadside cannons devastate all in range.',
    isStatic: true, isTorrent: true,
  },
  ship_fighter: {
    name: 'Torrent Fighter', archetype: 'STALKER', element: 'construct',
    baseStats: { hp: 190, atk: 32, def: 12, mag: 8, spd: 30 },
    rarity: 'UNCOMMON', echoId: 'shrapnel_echo',
    evolutionStages: ['ship_fighter'], trialId: 'trial_ship_fighter',
    icon: '✈️', desc: 'A nimble strike fighter that outmaneuvers and picks apart enemies.',
    isStatic: true, isTorrent: true,
  },
  ship_squid: {
    name: 'Nauticus', archetype: 'MAGE', element: 'construct',
    baseStats: { hp: 210, atk: 16, def: 14, mag: 38, spd: 14 },
    rarity: 'RARE', echoId: 'shrapnel_echo',
    evolutionStages: ['ship_squid'], trialId: 'trial_ship_squid',
    icon: '🛸', desc: 'A mysterious biomechanical squid with arcane energy weapons.',
    isStatic: true, // regular summon, NOT Torrent-specific
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH 6 SUMMONS (new animated idle.gif sprites)
  // ═══════════════════════════════════════════════════════════════

  plaguefang: {
    name: 'Plaguefang', archetype: 'STALKER', element: 'plague',
    baseStats: { hp: 100, atk: 20, def: 6, mag: 14, spd: 22 },
    rarity: 'COMMON', echoId: 'pack_echo',
    evolutionStages: ['plaguefang'], trialId: 'trial_plaguefang',
    icon: '🐺', desc: 'A gaunt, hollow-eyed jackal whose hide weeps toxin. Strikes low and silent.',
  },
  lumenmoth: {
    name: 'Lumenmoth', archetype: 'MAGE', element: 'light',
    baseStats: { hp: 120, atk: 8, def: 8, mag: 30, spd: 14 },
    rarity: 'UNCOMMON', echoId: 'ember_echo',
    evolutionStages: ['lumenmoth'], trialId: 'trial_lumenmoth',
    icon: '🦋', desc: 'A golden moth whose glowing wings calm the battlefield and guide allies.',
  },
  emberwick: {
    name: 'Emberwick', archetype: 'TANK', element: 'fire',
    baseStats: { hp: 240, atk: 12, def: 26, mag: 10, spd: 5 },
    rarity: 'UNCOMMON', echoId: 'guardian_echo',
    evolutionStages: ['emberwick'], trialId: 'trial_emberwick',
    icon: '🕯️', desc: 'A squat wax creature with a living flame atop its head. Nearly immovable once planted.',
  },
  skitterswarm: {
    name: 'Skitterswarm', archetype: 'STALKER', element: 'plague',
    baseStats: { hp: 130, atk: 22, def: 8, mag: 12, spd: 24 },
    rarity: 'UNCOMMON', echoId: 'pack_echo',
    evolutionStages: ['skitterswarm'], trialId: 'trial_skitterswarm',
    icon: '🪲', desc: 'A writhing cluster of beetles moving as one. Attacks come from unpredictable angles.',
  },
  tidalmaw: {
    name: 'Tidalmaw', archetype: 'TANK', element: 'water',
    baseStats: { hp: 340, atk: 26, def: 32, mag: 12, spd: 6 },
    rarity: 'RARE', echoId: 'frost_echo',
    evolutionStages: ['tidalmaw'], trialId: 'trial_tidalmaw',
    icon: '🪸', desc: 'An anemone-like abomination with coiling tentacles around a toothed maw. Little escapes once caught.',
  },
  fireguard: {
    name: 'Fire Guard', archetype: 'TANK', element: 'fire',
    baseStats: { hp: 400, atk: 30, def: 36, mag: 14, spd: 8 },
    rarity: 'RARE', echoId: 'guardian_echo',
    evolutionStages: ['fireguard'], trialId: 'trial_fireguard',
    icon: '🔥', desc: 'A hulking molten-armored sentinel wreathed in flame. The heaviest frontline piece — built to outlast.',
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

// Echoes
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

// Resonance Web
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
