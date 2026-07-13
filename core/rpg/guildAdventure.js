// ============================================
// 🎮 GUILD ADVENTURE V2 - COMPLETE OVERHAUL
// ============================================
// A full-featured turn-based RPG system with:
// - 15+ Classes with unique abilities
// - Turn-based combat with status effects
// - Multi-phase boss fights
// - Equipment and crafting
// - Branching storylines
// - Actual challenge and risk

const fs = require("fs");
const path = require("path");
const botConfig = require('../../botConfig');
const economy = require("./economy");
const progression = require("./progression");
const skillTree = require("./skillTree");
const inventorySystem = require("./inventorySystem");
const lootSystem = require("./lootSystem");
const bossMechanics = require("./bossMechanics");
const classEncounters = require("./classEncounters");
const combatIntegration = require("./combatIntegration");
const guilds = require("./guilds");
const classSystem = require("./classSystem");
const monsterSkills = require("./monsterSkills");

// ==========================================
// 📊 GAME CONSTANTS
// ==========================================

const DUNGEON_RANKS = {
  F: {
    name: "F-Rank",
    encounters: 3,
    minMobs: 1,
    maxMobs: 2,
    difficulty: 0.8,
    boss: "INFECTED_COLOSSUS",
    pool: 1,
    xpMult: 0.8,
  },
  E: {
    name: "E-Rank",
    encounters: 4,
    minMobs: 2,
    maxMobs: 4,
    difficulty: 1.2,
    boss: "CORRUPTED_GUARDIAN",
    pool: 1,
    xpMult: 1.2,
  },
  D: {
    name: "D-Rank",
    encounters: 7,
    minMobs: 2,
    maxMobs: 4,
    difficulty: 3.0,
    boss: "ELEMENTAL_ARCHON",
    pool: 2,
    xpMult: 2.0,
  },
  C: {
    name: "C-Rank",
    encounters: 7,
    minMobs: 2,
    maxMobs: 5,
    difficulty: 5.0,
    boss: "MUTATION_PRIME",
    pool: 2,
    xpMult: 3.5,
  },
  B: {
    name: "B-Rank",
    encounters: 8,
    minMobs: 3,
    maxMobs: 5,
    difficulty: 10.0,
    boss: "VOID_CORRUPTED",
    pool: 3,
    xpMult: 6.0,
  },
  A: {
    name: "A-Rank",
    encounters: 9,
    minMobs: 3,
    maxMobs: 6,
    difficulty: 18.0,
    boss: "PRIMORDIAL_CHAOS",
    pool: 4,
    xpMult: 10.0,
  },
  S: {
    name: "S-Rank",
    encounters: 10,
    minMobs: 4,
    maxMobs: 6,
    difficulty: 35.0,
    boss: "ELDER_CHAOS",      // FIX: was PRIMORDIAL_CHAOS (same as A) — now distinct
    pool: 5,
    xpMult: 50.0,
  },
  SS: {
    name: "SS-Rank",
    encounters: 11,
    minMobs: 4,
    maxMobs: 7,
    difficulty: 75.0,
    boss: "VOID_TITAN",       // FIX: was PRIMORDIAL_CHAOS — now distinct
    pool: 5,
    xpMult: 70.0,
  },
  SSS: {
    name: "SSS-Rank",
    encounters: 13,
    minMobs: 5,
    maxMobs: 8,
    difficulty: 80.0,
    boss: "ABYSSAL_GOD",      // FIX: was PRIMORDIAL_CHAOS — now distinct
    pool: 5,
    xpMult: 100.0,
  },
  DRAGON: {
    name: "Dragon’s Lair",
    encounters: 5,
    minMobs: 2,
    maxMobs: 3,
    difficulty: 10.0,
    boss: "ANCIENT_DRAGON_BOSS",
    pool: "DRAGON_LAIR",
    xpMult: 5.0,
    isSpecial: true,
  },
  // 💡 GOD DUNGEON — boundless, transcendent, lore-heavy
  // Only GOD-rank players can enter. Extremely hard.
  GOD: {
    name: "The Boundless Void",
    encounters: 7,
    minMobs: 3,
    maxMobs: 4,
    difficulty: 25.0,
    boss: "ABYSSAL_GOD",
    pool: "DRAGON_LAIR",
    xpMult: 10.0,
    isSpecial: true,
    requiresGodRank: true,
    loreIntro: "You step beyond the veil of dimensionality. Reality unravels around you — time flows backward, space folds upon itself, and the very laws of physics dissolve into primordial chaos. Here, in the Boundless Void, only those who have transcended the boundaries of mortal existence can survive. You are a GOD. But even gods can die.",
    loreFloors: [
      "Floor 1: The air itself rejects your presence. Shadows move with intent, whispering secrets that predate creation.",
      "Floor 2: You encounter echoes of fallen adventurers — their last moments replaying eternally. They reach for you, seeking to drag you into their eternal loop.",
      "Floor 3: The ground beneath you is not ground. It is compressed time. Each step costs you a memory. You feel yourself forgetting... something important.",
      "Floor 4: A figure appears — it wears your face, but its eyes are void. It speaks: 'I am what you could have been. What you should have been. The version of you that never compromised.' It attacks.",
      "Floor 5: The Void itself becomes sentient. It has watched you since the moment of your ascension. It is curious. It is hungry. It is everywhere.",
      "Floor 6: You find the remnants of a previous god who attempted this journey. Their final message, carved into non-existence: 'The Abyssal God is not a creature. It is a concept. You cannot kill a concept. But you can become one.'",
      "Floor 7: The Abyssal God manifests. It does not speak. It does not need to. It simply IS — the antithesis of existence, the final question with no answer.",
    ],
  },
  // ⚔️ Class Evolution Trial — boss-only single-encounter dungeon
  TRIAL: {
    name: "Class Trial",
    encounters: 1,
    minMobs: 1,
    maxMobs: 1,
    difficulty: 3.5,
    boss: null,          // Boss is determined dynamically by trialData.trialBoss
    xpMult: 2.0,
    isSpecial: true,
  },
};

const DUNGEON_ENVIRONMENTS = {
  DRAGON_LAIR: {
    id: "DRAGON_LAIR",
    name: "Dragon’s Lair",
    asset: "env10.png",
    mobs: ["DRAKE_SCOUT", "FIRE_BREATHER"],
    bosses: ["ANCIENT_DRAGON_BOSS"],
    modifier: {
      type: "DRAGON_FEAR",
      desc: "-10% ATK due to draconic presence",
      damage: 0,
    },
    enemyBonus: { type: "DEFENSE", value: 0.2 },
    isSpecial: true,
  },
  FIRE_CAVE: {
    id: "FIRE_CAVE",
    name: "Fire Cave",
    asset: "env1.png",
    mobs: ["FLAME", "ELDER_FLAME", "MAGMA_BRUTE", "HELLFIRE_DEMON"],
    bosses: ["INFERNAL_OVERLORD", "PRIMORDIAL_FLAME"],
    modifier: {
      type: "HEAT_EXHAUSTION",
      desc: "-5% Max HP per turn in lava",
      damage: 0.05,
    },
    enemyBonus: { type: "DAMAGE", value: 0.1, element: "fire" },
  },
  ICE_CAVE: {
    id: "ICE_CAVE",
    name: "Ice Cave",
    asset: "env2.png",
    mobs: ["FROST_GHOUL", "GLACIAL_BEAST", "BLIZZARD_WRAITH"],
    bosses: ["PERMAFROST_TITAN"],
    modifier: {
      type: "FROSTBITE",
      desc: "-10% Speed penalty",
      spdReduction: 0.1,
    },
    enemyBonus: { type: "DEFENSE", value: 0.2 },
  },
  TOXIC_CAVE: {
    id: "TOXIC_CAVE",
    name: "Toxic Cave",
    asset: "env3.png",
    mobs: ["DROWNED_ONE", "TIDE_LURKER", "MIST_WALKER"],
    bosses: ["LEVIATHAN_SPAWN"],
    modifier: {
      type: "TOXIC_MIST",
      desc: "-30% Healing effectiveness",
      healReduction: 0.3,
    },
    enemyBonus: { type: "DOT", effect: "poison", value: 5 },
  },
  VOID_DIMENSION: {
    id: "VOID_DIMENSION",
    name: "Void Dimension",
    asset: "env4.png",
    mobs: ["VOID_CORRUPTED", "ABYSSAL_HORROR"],
    bosses: ["VOID_TITAN", "PRIMORDIAL_CHAOS"],
    modifier: { type: "TIME_DILATION", desc: "Random turn order manipulation" },
    enemyBonus: { type: "RANDOM_TP", chance: 0.1 },
  },
  SCI_FI_CITY: {
    id: "SCI_FI_CITY",
    name: "Sci-Fi City",
    asset: "env5.png",
    mobs: ["TSUNAMI_WALKER", "ABYSSAL_HORROR"],
    bosses: ["KRAKEN_SPAWN"],
    modifier: { type: "COVER_SYSTEM", desc: "Defense bonus from structures" },
    enemyBonus: { type: "RANGED", rangeBonus: 1 },
  },
  DEMON_CASTLE: {
    id: "DEMON_CASTLE",
    name: "Demon Castle",
    asset: "env6.png",
    mobs: ["HELLFIRE_DEMON", "STAR_EATER"],
    bosses: [
      "MUTATION_PRIME",
      "ELEMENTAL_ARCHON",
      "INFERNAL_OVERLORD",
      "PRIMORDIAL_FLAME",
    ],
    modifier: {
      type: "CURSED_GROUND",
      desc: "Healing reduced to 50%",
      healReduction: 0.5,
    },
    enemyBonus: { type: "MAGIC_EMPOWER", value: 0.2 },
  },
  DESERT: {
    id: "DESERT",
    name: "Desert",
    asset: "env7.png",
    mobs: ["STONE_HULK", "CRYSTAL_CORRUPTED", "EARTH_WARDEN"],
    bosses: ["GOLEM_KING", "MOUNTAIN_COLOSSUS"],
    modifier: {
      type: "SANDSTORM",
      desc: "Accuracy penalty",
      accuracyReduction: 0.15,
    },
    enemyBonus: { type: "STAMINA_DRAIN", energyCostInc: 0.1 },
  },
  INFECTED_AFTERLIFE: {
    id: "INFECTED_AFTERLIFE",
    name: "Infected Afterlife",
    asset: "env8.png",
    mobs: ["FLESH_ABOMINATION", "CHIMERA_BEAST"],
    bosses: ["PERFECT_MUTATION"],
    modifier: { type: "CORRUPTION", desc: "Damage increases over time" },
    enemyBonus: { type: "RESURRECTION", chance: 0.1 },
  },
  PRE_INFECTED_AFTERLIFE: {
    id: "PRE_INFECTED_AFTERLIFE",
    name: "Pre-Infected Afterlife",
    asset: "env9.png",
    mobs: ["FROST_FLAME_WARDEN", "STORM_EARTH_TITAN"],
    bosses: ["ELEMENTAL_SOVEREIGN"],
    modifier: { type: "PURITY_AURA", desc: "Cleanses debuffs randomly" },
    enemyBonus: { type: "HOLY_GROUND", healBonus: 0.5 },
  },
  SIMPLE_FOREST: {
    id: "SIMPLE_FOREST",
    name: "Simple Forest",
    asset: "env10.png",
    mobs: ["OBSIDIAN_JUGGERNAUT", "DIAMOND_SENTINEL"],
    bosses: ["MOUNTAIN_COLOSSUS"],
    modifier: { type: "DENSE_FOLIAGE", desc: "Line-of-sight blocked" },
    enemyBonus: { type: "CAMOUFLAGE", evasionBonus: 0.15 },
  },
};

const GAME_CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 6,
  REGISTRATION_TIME: 120000,
  SHOP_TIME: 90000,
  VOTE_TIME: 60000,
  COMBAT_TURN_TIME: 600000,
  BREAK_TIME: 10000, // Reduced from 60s for better flow
  ENEMY_TURN_TIME: 5000,
  PERMADEATH_MULTIPLIER: 2.5,
};

// ==========================================
// ⚔️ EXPANDED CLASS SYSTEM (15 Classes)
// ==========================================

const CLASSES = {
  // ==========================================
  // 🌟 STARTER CLASSES (4)
  // ==========================================
  FIGHTER: {
    id: "FIGHTER",
    name: "Fighter",
    icon: "⚔️",
    desc: "Balanced warrior, good at physical combat",
    role: "STARTER",
    stats: { hp: 120, atk: 12, def: 10, mag: 4, spd: 8, luck: 6, crit: 8 },
    abilities: [
      { name: "Slash", cost: 10, damage: 1.3, effect: "none", cooldown: 1 },
      {
        name: "Guard",
        cost: 8,
        damage: 0,
        effect: "shield_self",
        value: 20,
        cooldown: 2,
      },
    ],
    passive: { name: "Balanced", effect: "all_stats", value: 5 },
  },

  SCOUT: {
    id: "SCOUT",
    name: "Scout",
    icon: "🗡️",
    desc: "Quick and agile, focuses on speed",
    role: "STARTER",
    stats: { hp: 90, atk: 10, def: 5, mag: 3, spd: 16, luck: 14, crit: 18 },
    abilities: [
      {
        name: "Quick Strike",
        cost: 8,
        damage: 1.2,
        effect: "speed_bonus",
        value: 10,
        cooldown: 1,
      },
      { name: "Evade", cost: 10, damage: 0, effect: "dodge_next", cooldown: 2 },
    ],
    passive: { name: "Nimble", effect: "dodge_chance", value: 10 },
  },

  APPRENTICE: {
    id: "APPRENTICE",
    name: "Apprentice",
    icon: "🔮",
    desc: "Magic beginner with potential",
    role: "STARTER",
    stats: { hp: 80, atk: 5, def: 4, mag: 18, spd: 9, luck: 8, crit: 10 },
    abilities: [
      {
        name: "Magic Bolt",
        cost: 12,
        damage: 1.5,
        effect: "magic_damage",
        cooldown: 1,
      },
      {
        name: "Mana Shield",
        cost: 15,
        damage: 0,
        effect: "shield_self",
        value: 15,
        cooldown: 3,
      },
    ],
    passive: { name: "Magic Affinity", effect: "magic_damage", value: 10 },
  },

  ACOLYTE: {
    id: "ACOLYTE",
    name: "Acolyte",
    icon: "✨",
    desc: "Supportive novice with healing abilities",
    role: "STARTER",
    stats: { hp: 100, atk: 6, def: 8, mag: 14, spd: 10, luck: 12, crit: 6 },
    abilities: [
      {
        name: "Heal",
        cost: 15,
        damage: 0,
        effect: "heal_target",
        value: 30,
        cooldown: 2,
      },
      {
        name: "Smite",
        cost: 10,
        damage: 1.2,
        effect: "holy_damage",
        cooldown: 1,
      },
    ],
    passive: { name: "Blessed", effect: "team_healing", value: 3 },
  },

  // ==========================================
  // TANK CLASSES
  // ==========================================
  WARRIOR: {
    id: "WARRIOR",
    name: "Warrior",
    icon: "⚔️",
    desc: "Frontline tank with high HP and defense",
    role: "TANK",
    stats: { hp: 200, atk: 12, def: 15, mag: 2, spd: 5, luck: 5, crit: 5 },
    abilities: [
      {
        name: "Shield Bash",
        cost: 10,
        damage: 1.2,
        effect: "stun",
        chance: 30,
        cooldown: 2,
      },
      {
        name: "Taunt",
        cost: 15,
        damage: 0,
        effect: "taunt",
        chance: 100,
        cooldown: 3,
      },
      {
        name: "Battle Cry",
        cost: 20,
        damage: 0,
        effect: "buff_team_atk",
        value: 15,
        cooldown: 4,
      },
      {
        name: "Execute",
        cost: 25,
        damage: 2.5,
        effect: "execute",
        threshold: 30,
        cooldown: 5,
      },
    ],
    passive: { name: "Unbreakable", effect: "damage_reduction", value: 15 },
  },

  PALADIN: {
    id: "PALADIN",
    name: "Paladin",
    icon: "🛡️",
    desc: "Holy defender with healing and protection",
    role: "TANK",
    stats: { hp: 180, atk: 10, def: 18, mag: 8, spd: 4, luck: 7, crit: 3 },
    abilities: [
      {
        name: "Holy Strike",
        cost: 12,
        damage: 1.3,
        effect: "heal_self",
        value: 15,
        cooldown: 2,
      },
      {
        name: "Divine Shield",
        cost: 20,
        damage: 0,
        effect: "shield_team",
        value: 30,
        duration: 2,
        cooldown: 4,
      },
      {
        name: "Consecrate",
        cost: 18,
        damage: 1.0,
        effect: "aoe",
        radius: 3,
        cooldown: 3,
      },
      {
        name: "Lay on Hands",
        cost: 30,
        damage: 0,
        effect: "heal_target",
        value: 60,
        cooldown: 5,
      },
    ],
    passive: { name: "Holy Aura", effect: "team_healing", value: 5 },
  },

  BERSERKER: {
    id: "BERSERKER",
    name: "Berserker",
    icon: "🪓",
    desc: "Rage-fueled warrior who gets stronger when low HP",
    role: "TANK",
    stats: { hp: 220, atk: 16, def: 10, mag: 1, spd: 6, luck: 4, crit: 12 },
    abilities: [
      {
        name: "Rage Strike",
        cost: 8,
        damage: 1.6,
        effect: "self_damage",
        value: 5,
        cooldown: 1,
      },
      {
        name: "Blood Fury",
        cost: 15,
        damage: 2.0,
        effect: "bleed_self",
        duration: 3,
        cooldown: 3,
      },
      {
        name: "Rampage",
        cost: 25,
        damage: 1.2,
        effect: "multi_hit",
        hits: 3,
        cooldown: 4,
      },
      {
        name: "Last Stand",
        cost: 30,
        damage: 3.0,
        effect: "low_hp_bonus",
        threshold: 30,
        cooldown: 6,
      },
    ],
    passive: {
      name: "Berserker Rage",
      effect: "damage_when_low_hp",
      value: 50,
    },
  },

  // DPS CLASSES
  ROGUE: {
    id: "ROGUE",
    name: "Rogue",
    icon: "🗡️",
    desc: "Agile assassin with high crit and evasion",
    role: "DPS",
    stats: { hp: 100, atk: 18, def: 5, mag: 3, spd: 20, luck: 15, crit: 25 },
    abilities: [
      {
        name: "Backstab",
        cost: 12,
        damage: 2.2,
        effect: "crit_bonus",
        value: 50,
        cooldown: 2,
      },
      {
        name: "Smoke Bomb",
        cost: 15,
        damage: 0.5,
        effect: "blind",
        chance: 70,
        duration: 2,
        cooldown: 3,
      },
      {
        name: "Shadow Step",
        cost: 10,
        damage: 1.0,
        effect: "dodge_next",
        cooldown: 2,
      },
      {
        name: "Assassinate",
        cost: 35,
        damage: 4.0,
        effect: "instant_kill",
        threshold: 20,
        cooldown: 7,
      },
    ],
    passive: { name: "Evasion", effect: "dodge_chance", value: 20 },
  },

  MONK: {
    id: "MONK",
    name: "Monk",
    icon: "🥋",
    desc: "Martial artist with combo attacks",
    role: "DPS",
    stats: { hp: 120, atk: 14, def: 8, mag: 6, spd: 18, luck: 10, crit: 15 },
    abilities: [
      {
        name: "Flurry",
        cost: 10,
        damage: 0.8,
        effect: "multi_hit",
        hits: 4,
        cooldown: 2,
      },
      {
        name: "Chi Burst",
        cost: 15,
        damage: 1.5,
        effect: "heal_self",
        value: 10,
        cooldown: 2,
      },
      {
        name: "Pressure Point",
        cost: 20,
        damage: 1.0,
        effect: "stun",
        chance: 60,
        cooldown: 3,
      },
      {
        name: "Final Strike",
        cost: 30,
        damage: 2.8,
        effect: "combo_bonus",
        cooldown: 5,
      },
    ],
    passive: { name: "Combo Master", effect: "damage_per_hit", value: 5 },
  },

  // MAGIC DPS
  MAGE: {
    id: "MAGE",
    name: "Mage",
    icon: "🔮",
    desc: "Arcane spellcaster with devastating magic",
    role: "MAGIC_DPS",
    stats: { hp: 85, atk: 5, def: 4, mag: 25, spd: 8, luck: 10, crit: 12 },
    abilities: [
      {
        name: "Fireball",
        cost: 15,
        damage: 2.0,
        effect: "burn",
        duration: 3,
        cooldown: 2,
      },
      {
        name: "Ice Shard",
        cost: 12,
        damage: 1.5,
        effect: "freeze",
        chance: 40,
        duration: 1,
        cooldown: 2,
      },
      {
        name: "Lightning Bolt",
        cost: 18,
        damage: 2.3,
        effect: "chain",
        targets: 2,
        cooldown: 3,
      },
      {
        name: "Meteor",
        cost: 40,
        damage: 3.5,
        effect: "aoe",
        radius: 5,
        cooldown: 6,
      },
    ],
    passive: { name: "Arcane Mastery", effect: "magic_damage", value: 20 },
  },

  WARLOCK: {
    name: "Warlock",
    icon: "👹",
    desc: "Dark caster who drains life",
    role: "MAGIC_DPS",
    stats: { hp: 95, atk: 6, def: 5, mag: 22, spd: 7, luck: 8, crit: 10 },
    abilities: [
      {
        name: "Drain Life",
        cost: 12,
        damage: 1.5,
        effect: "lifesteal",
        value: 50,
        cooldown: 2,
      },
      {
        name: "Curse",
        cost: 15,
        damage: 0.8,
        effect: "curse",
        duration: 4,
        cooldown: 3,
      },
      {
        name: "Shadow Bolt",
        cost: 18,
        damage: 2.2,
        effect: "magic_damage",
        cooldown: 2,
      },
      {
        name: "Demon Summon",
        cost: 35,
        damage: 1.0,
        effect: "summon_pet",
        duration: 5,
        cooldown: 6,
      },
    ],
    passive: { name: "Soul Harvest", effect: "damage_on_kill", value: 15 },
  },

  ELEMENTALIST: {
    name: "Elementalist",
    icon: "🌪️",
    desc: "Master of all elements",
    role: "MAGIC_DPS",
    stats: { hp: 90, atk: 4, def: 5, mag: 24, spd: 9, luck: 11, crit: 13 },
    abilities: [
      {
        name: "Flame Wave",
        cost: 14,
        damage: 1.8,
        effect: "burn",
        duration: 2,
        cooldown: 2,
      },
      {
        name: "Frost Nova",
        cost: 16,
        damage: 1.4,
        effect: "freeze_aoe",
        radius: 3,
        cooldown: 3,
      },
      {
        name: "Thunder Storm",
        cost: 20,
        damage: 2.0,
        effect: "shock",
        duration: 3,
        cooldown: 3,
      },
      {
        name: "Elemental Fury",
        cost: 38,
        damage: 3.0,
        effect: "all_elements",
        cooldown: 6,
      },
    ],
    passive: {
      name: "Elemental Affinity",
      effect: "rotate_elements",
      value: 10,
    },
  },

  // SUPPORT CLASSES
  CLERIC: {
    name: "Cleric",
    icon: "✨",
    desc: "Divine healer who keeps the party alive",
    role: "SUPPORT",
    stats: { hp: 100, atk: 6, def: 8, mag: 18, spd: 10, luck: 14, crit: 5 },
    abilities: [
      {
        name: "Heal",
        cost: 15,
        damage: 0,
        effect: "heal_target",
        value: 50,
        cooldown: 1,
      },
      {
        name: "Prayer",
        cost: 20,
        damage: 0,
        effect: "heal_team",
        value: 30,
        cooldown: 3,
      },
      {
        name: "Smite",
        cost: 12,
        damage: 1.8,
        effect: "holy_damage",
        cooldown: 2,
      },
      {
        name: "Resurrection",
        cost: 50,
        damage: 0,
        effect: "revive",
        value: 40,
        cooldown: 8,
      },
    ],
    passive: { name: "Divine Grace", effect: "healing_boost", value: 25 },
  },

  DRUID: {
    name: "Druid",
    icon: "🌿",
    desc: "Nature magic with healing and shapeshifting",
    role: "SUPPORT",
    stats: { hp: 115, atk: 10, def: 9, mag: 16, spd: 11, luck: 13, crit: 8 },
    abilities: [
      {
        name: "Rejuvenation",
        cost: 10,
        damage: 0,
        effect: "heal_over_time",
        value: 15,
        duration: 3,
        cooldown: 2,
      },
      {
        name: "Entangle",
        cost: 14,
        damage: 1.2,
        effect: "root",
        duration: 2,
        cooldown: 3,
      },
      {
        name: "Bear Form",
        cost: 20,
        damage: 1.8,
        effect: "transform_tank",
        duration: 3,
        cooldown: 4,
      },
      {
        name: "Nature's Wrath",
        cost: 28,
        damage: 2.5,
        effect: "nature_damage",
        cooldown: 5,
      },
    ],
    passive: { name: "Natural Healing", effect: "regen", value: 5 },
  },

  // HYBRID CLASSES
  NECROMANCER: {
    name: "Necromancer",
    icon: "💀",
    desc: "Dark summoner who raises the dead",
    role: "HYBRID",
    stats: { hp: 95, atk: 7, def: 6, mag: 20, spd: 8, luck: 9, crit: 11 },
    abilities: [
      {
        name: "Raise Dead",
        cost: 20,
        damage: 0,
        effect: "summon_skeleton",
        duration: 4,
        cooldown: 4,
      },
      {
        name: "Death Coil",
        cost: 15,
        damage: 1.8,
        effect: "lifesteal",
        value: 40,
        cooldown: 2,
      },
      {
        name: "Corpse Explosion",
        cost: 18,
        damage: 2.2,
        effect: "aoe_corpse",
        cooldown: 3,
      },
      {
        name: "Army of Dead",
        cost: 45,
        damage: 1.5,
        effect: "summon_army",
        duration: 5,
        cooldown: 7,
      },
    ],
    passive: { name: "Death's Touch", effect: "damage_on_death", value: 30 },
  },

  MERCHANT: {
    name: "Merchant",
    icon: "💰",
    desc: "Capitalist who uses gold as power",
    role: "HYBRID",
    stats: { hp: 110, atk: 6, def: 6, mag: 8, spd: 10, luck: 25, crit: 12 },
    abilities: [
      {
        name: "Gold Throw",
        cost: 10,
        damage: 1.5,
        effect: "gold_damage",
        value: 100,
        cooldown: 1,
      },
      {
        name: "Bribe",
        cost: 20,
        damage: 0,
        effect: "charm",
        chance: 50,
        duration: 2,
        cooldown: 4,
      },
      {
        name: "Investment",
        cost: 15,
        damage: 0,
        effect: "gain_gold",
        value: 200,
        cooldown: 3,
      },
      {
        name: "Money Rain",
        cost: 30,
        damage: 2.0,
        effect: "aoe_gold",
        value: 300,
        cooldown: 5,
      },
    ],
    passive: { name: "Golden Touch", effect: "gold_find", value: 50 },
  },

  CHRONOMANCER: {
    name: "Chronomancer",
    icon: "⏰",
    desc: "Time mage who manipulates turns",
    role: "HYBRID",
    stats: { hp: 88, atk: 5, def: 5, mag: 23, spd: 16, luck: 12, crit: 9 },
    abilities: [
      {
        name: "Slow",
        cost: 14,
        damage: 1.0,
        effect: "slow",
        value: 50,
        duration: 3,
        cooldown: 3,
      },
      {
        name: "Haste",
        cost: 16,
        damage: 0,
        effect: "haste_team",
        value: 30,
        duration: 2,
        cooldown: 4,
      },
      {
        name: "Time Skip",
        cost: 20,
        damage: 0,
        effect: "extra_turn",
        cooldown: 5,
      },
      {
        name: "Temporal Rift",
        cost: 35,
        damage: 3.0,
        effect: "time_damage",
        cooldown: 6,
      },
    ],
    passive: { name: "Time Dilation", effect: "first_turn_bonus", value: 20 },
  },
};

// ==========================================
// 🎒 MASSIVE ITEM SYSTEM
// ==========================================

const CONSUMABLES = {
  // HEALING
  // 💡 Prices here are synced with the regular shop (lootSystem.js item values)
  // so items cost the same in both the pre-quest shop and the main shop.
  minor_potion: {
    name: "Minor Health Potion",
    cost: 280,
    effect: "heal",
    effectValue: 0.15,
    desc: "Restores 15% of Max HP. A basic potion for minor wounds.",
    icon: "🧪",
  },
  health_potion: {
    name: "Health Potion",
    cost: 700,
    effect: "heal",
    effectValue: 0.35,
    desc: "Restores 35% of Max HP. Standard issue for adventurers.",
    icon: "💊",
  },
  major_potion: {
    name: "Major Health Potion",
    cost: 1680,
    effect: "heal",
    effectValue: 0.6,
    desc: "Restores 60% of Max HP. Essential for dangerous raids.",
    icon: "⚗️",
  },
  elixir: {
    name: "Full Restore Elixir",
    cost: 4200,
    effect: "heal",
    effectValue: 1.0,
    cureStatus: true,
    desc: "Fully restores HP and cures all negative status effects. Rare and powerful alchemy.",
    icon: "🍶",
  },
  remedy: {
    name: "Remedy",
    cost: 500,   // ✅ Matches lootSystem value: 500
    effect: "cure_status",
    desc: "Cures all negative status effects (stun, poison, burn, freeze, etc.).",
    icon: "🌱",
  },
  regen_salve: {
    name: "Regeneration Salve",
    cost: 1120,
    effect: "regen",
    effectValue: 0.1,
    duration: 3,
    desc: "Heals 10% of Max HP per turn for 3 turns.",
    icon: "🧴",
  },

  // MANA (for abilities)
  mana_potion: {
    name: "Mana Potion",
    cost: 400,
    effect: "restore_energy",
    effectValue: 0.4,
    desc: "Restores 40% of Max Energy. Refreshes your combat focus.",
    icon: "💙",
  },
  ether: {
    name: "Ether",
    cost: 1000,  // ✅ Authoritative price from pre-quest store
    effect: "restore_energy",
    effectValue: 1.0,
    desc: "Fully restores Energy. Pure arcane energy in a bottle.",
    icon: "🔵",
  },

  // BUFFS
  strength_brew: {
    name: "Strength Brew",
    cost: 600,
    effect: "buff_atk",
    value: 25,
    duration: 3,
    desc: "Increases ATK by 25% for 3 turns.",
    icon: "💪",
  },
  defense_tonic: {
    name: "Defense Tonic",
    cost: 600,
    effect: "buff_def",
    value: 25,
    duration: 3,
    desc: "Increases DEF by 25% for 3 turns.",
    icon: "🛡️",
  },
  speed_elixir: {
    name: "Speed Elixir",
    cost: 600,
    effect: "buff_spd",
    value: 30,
    duration: 3,
    desc: "Increases SPD by 30% for 3 turns.",
    icon: "⚡",
  },
  lucky_charm: {
    name: "Lucky Charm",
    cost: 800,
    effect: "buff_luck",
    value: 40,
    duration: 3,
    desc: "Increases LUCK by 40% for 3 turns.",
    icon: "🍀",
  },
  berserker_pill: {
    name: "Berserker Pill",
    cost: 1500,
    effect: "buff_all_damage",
    value: 50,
    duration: 2,
    desc: "Massive damage boost, but lowers defense.",
    icon: "💥",
  },

  // UTILITY
  phoenix_down: {
    name: "Phoenix Down",
    cost: 3500,
    effect: "revive",
    effectValue: 0.5,
    desc: "Revives a fallen ally with 50% HP.",
    icon: "🪶",
  },
  smoke_bomb: {
    name: "Smoke Bomb",
    cost: 500,
    effect: "flee",
    chance: 80,
    desc: "Allows the party to escape combat (80% chance).",
    icon: "💨",
  },
  bomb: {
    name: "Bomb",
    cost: 2500,
    effect: "damage_aoe",
    value: 80,
    desc: "Deals 80 area damage to all enemies.",
    icon: "💣",
  },
  abyssal_detonator: {
    name: "Abyssal Detonator",
    cost: 150000,
    effect: "percent_hp_damage",
    effectValue: 0.25,
    desc: "Deals 25% of target MAX HP as true damage.",
    icon: "💥🌀",
  },

  // BUNDLES
  bundle_pack: {
    name: "Explorer Pack",
    cost: 1400,  // ✅ Updated to match sum of contents: health_potion(700) + mana_potion(400) + minor_potion(280) = 1380, rounded to 1400
    effect: "bundle",
    items: ["health_potion", "mana_potion", "minor_potion"],
    desc: "A bundle containing a Health Potion, Energy Elixir, and Minor Potion.",
    icon: "🎒",
  },
};

const SHOP_LIST = [
  "minor_potion",
  "health_potion",
  "major_potion",
  "elixir",
  "remedy",
  "regen_salve",
  "mana_potion",
  "ether",
  "strength_brew",
  "defense_tonic",
  "speed_elixir",
  "lucky_charm",
  "berserker_pill",
  "phoenix_down",
  "bomb",
  "smoke_bomb",
  "abyssal_detonator",
];

const EQUIPMENT = {
  // WEAPONS
  rusty_sword: {
    name: "Rusty Sword",
    type: "weapon",
    cost: 1000,
    stats: { atk: 5 },
    icon: "🗡️",
    slot: "weapon",
  },
  iron_sword: {
    name: "Iron Sword",
    type: "weapon",
    cost: 3000,
    stats: { atk: 12 },
    icon: "⚔️",
    slot: "weapon",
  },
  steel_blade: {
    name: "Steel Blade",
    type: "weapon",
    cost: 7000,
    stats: { atk: 20, crit: 5 },
    icon: "🗡️",
    slot: "weapon",
  },
  mythril_sword: {
    name: "Mythril Sword",
    type: "weapon",
    cost: 14000,
    stats: { atk: 30, crit: 10 },
    icon: "⚔️",
    slot: "weapon",
  },
  excalibur: {
    name: "Excalibur",
    type: "weapon",
    cost: 30000,
    stats: { atk: 50, crit: 15, mag: 10 },
    icon: "🗡️✨",
    slot: "weapon",
    special: "holy_damage",
  },

  wooden_staff: {
    name: "Wooden Staff",
    type: "weapon",
    cost: 1000,
    stats: { mag: 8 },
    icon: "🪄",
    slot: "weapon",
  },
  magic_wand: {
    name: "Magic Wand",
    type: "weapon",
    cost: 4000,
    stats: { mag: 15 },
    icon: "✨",
    slot: "weapon",
  },
  arcane_staff: {
    name: "Arcane Staff",
    type: "weapon",
    cost: 10000,
    stats: { mag: 28, atk: 5 },
    icon: "🔮",
    slot: "weapon",
  },
  staff_of_ages: {
    name: "Staff of Ages",
    type: "weapon",
    cost: 24000,
    stats: { mag: 45, spd: 10 },
    icon: "🪄✨",
    slot: "weapon",
    special: "spell_power",
  },

  short_bow: {
    name: "Short Bow",
    type: "weapon",
    cost: 1600,
    stats: { atk: 10, spd: 5 },
    icon: "🏹",
    slot: "weapon",
  },
  longbow: {
    name: "Longbow",
    type: "weapon",
    cost: 5000,
    stats: { atk: 18, spd: 8 },
    icon: "🏹",
    slot: "weapon",
  },
  hunters_bow: {
    name: "Hunter's Bow",
    type: "weapon",
    cost: 12000,
    stats: { atk: 28, spd: 12, crit: 12 },
    icon: "🏹✨",
    slot: "weapon",
    special: "piercing",
  },

  // ARMOR
  cloth_armor: {
    name: "Cloth Armor",
    type: "armor",
    cost: 800,
    stats: { def: 5, mag: 3 },
    icon: "👕",
    slot: "armor",
  },
  leather_armor: {
    name: "Leather Armor",
    type: "armor",
    cost: 2400,
    stats: { def: 10, spd: 2 },
    icon: "🧥",
    slot: "armor",
  },
  chainmail: {
    name: "Chainmail",
    type: "armor",
    cost: 6000,
    stats: { def: 18 },
    icon: "⛓️",
    slot: "armor",
  },
  plate_armor: {
    name: "Plate Armor",
    type: "armor",
    cost: 12000,
    stats: { def: 30, hp: 20 },
    icon: "🛡️",
    slot: "armor",
  },
  dragon_scale: {
    name: "Dragon Scale Armor",
    type: "armor",
    cost: 30000,
    stats: { def: 50, hp: 40, mag: 10 },
    icon: "🐉",
    slot: "armor",
    special: "fire_resist",
  },

  // ACCESSORIES
  ring_str: {
    name: "Ring of Strength",
    type: "accessory",
    cost: 4000,
    stats: { atk: 10 },
    icon: "💍",
    slot: "ring",
  },
  ring_int: {
    name: "Ring of Intelligence",
    type: "accessory",
    cost: 4000,
    stats: { mag: 10 },
    icon: "💍",
    slot: "ring",
  },
  ring_vit: {
    name: "Ring of Vitality",
    type: "accessory",
    cost: 4000,
    stats: { hp: 30 },
    icon: "💍",
    slot: "ring",
  },
  ring_luck: {
    name: "Ring of Fortune",
    type: "accessory",
    cost: 6000,
    stats: { luck: 20 },
    icon: "💍",
    slot: "ring",
  },
  ring_crit: {
    name: "Ring of Precision",
    type: "accessory",
    cost: 7000,
    stats: { crit: 15 },
    icon: "💍",
    slot: "ring",
  },

  amulet_hp: {
    name: "Amulet of Life",
    type: "accessory",
    cost: 5000,
    stats: { hp: 50 },
    icon: "📿",
    slot: "amulet",
  },
  amulet_regen: {
    name: "Amulet of Regeneration",
    type: "accessory",
    cost: 7000,
    stats: { hp: 20 },
    icon: "📿",
    slot: "amulet",
    special: "regen_5",
  },
  amulet_elemental: {
    name: "Elemental Amulet",
    type: "accessory",
    cost: 10000,
    stats: { mag: 15, def: 10 },
    icon: "📿",
    slot: "amulet",
    special: "elemental_resist",
  },

  boots_speed: {
    name: "Boots of Speed",
    type: "accessory",
    cost: 3600,
    stats: { spd: 15 },
    icon: "👢",
    slot: "boots",
  },
  boots_tank: {
    name: "Iron Boots",
    type: "accessory",
    cost: 3600,
    stats: { def: 12, hp: 15 },
    icon: "👢",
    slot: "boots",
  },
  winged_boots: {
    name: "Winged Boots",
    type: "accessory",
    cost: 9000,
    stats: { spd: 25, def: 5 },
    icon: "👢✨",
    slot: "boots",
    special: "first_strike",
  },

  cloak_stealth: {
    name: "Cloak of Stealth",
    type: "accessory",
    cost: 6000,
    stats: { spd: 10, luck: 10 },
    icon: "🧥",
    slot: "cloak",
    special: "dodge_15",
  },
  cloak_mage: {
    name: "Mage's Cloak",
    type: "accessory",
    cost: 7000,
    stats: { mag: 20, def: 5 },
    icon: "🧥",
    slot: "cloak",
  },
  cloak_vampire: {
    name: "Vampire Cloak",
    type: "accessory",
    cost: 12000,
    stats: { atk: 15, mag: 15 },
    icon: "🧥",
    slot: "cloak",
    special: "lifesteal_10",
  },
};

const CRAFTING_MATERIALS = {
  wood: { name: "Wood", icon: "🪵", rarity: "common" },
  stone: { name: "Stone", icon: "🪨", rarity: "common" },
  iron_ore: { name: "Iron Ore", icon: "⛏️", rarity: "common" },
  leather: { name: "Leather", icon: "🦌", rarity: "common" },
  herb: { name: "Herb", icon: "🌿", rarity: "common" },

  silver_ore: { name: "Silver Ore", icon: "⛏️", rarity: "uncommon" },
  gold_ore: { name: "Gold Ore", icon: "⛏️", rarity: "uncommon" },
  crystal: { name: "Crystal", icon: "💎", rarity: "uncommon" },
  enchanted_cloth: { name: "Enchanted Cloth", icon: "✨", rarity: "uncommon" },

  mythril_ore: { name: "Mythril Ore", icon: "⛏️", rarity: "rare" },
  dragon_scale_mat: { name: "Dragon Scale", icon: "🐉", rarity: "rare" },
  phoenix_feather: { name: "Phoenix Feather", icon: "🪶", rarity: "rare" },
  demon_horn: { name: "Demon Horn", icon: "👹", rarity: "rare" },
  angel_wing: { name: "Angel Wing", icon: "🪽", rarity: "rare" },

  adamantite: { name: "Adamantite", icon: "💠", rarity: "legendary" },
  orichalcum: { name: "Orichalcum", icon: "🌟", rarity: "legendary" },
  void_essence: { name: "Void Essence", icon: "🌑", rarity: "legendary" },
};

const ELEMENT_CHART = {
  PHYSICAL: { weakTo: [], strongVs: [] },
  FIRE: { weakTo: ["WATER"], strongVs: ["ICE", "NATURE"] },
  ICE: { weakTo: ["FIRE"], strongVs: ["NATURE"] },
  WATER: { weakTo: ["LIGHTNING"], strongVs: ["FIRE"] },
  LIGHTNING: { weakTo: ["EARTH"], strongVs: ["WATER"] },
  EARTH: { weakTo: ["WIND"], strongVs: ["LIGHTNING"] },
  WIND: { weakTo: ["EARTH"], strongVs: ["EARTH"] },
  HOLY: { weakTo: ["DARK"], strongVs: ["DEATH", "DARK"] },
  DARK: { weakTo: ["HOLY"], strongVs: ["HOLY"] },
  DEATH: { weakTo: ["HOLY"], strongVs: ["PHYSICAL"] },
  VOID: { weakTo: [], strongVs: ["FIRE", "ICE", "WATER", "LIGHTNING"] },
};

// ==========================================
// 🎲 MONSTER DEFINITIONS
// ==========================================

// ==========================================
// 👾 ENEMY SYSTEM
// ==========================================

// ==========================================
// 👹 MONSTER ABILITY DATABASE
// ==========================================

// ==========================================
// 🎲 CORE GAME FUNCTIONS
// ==========================================
function generateCombatEncounter(chatId) {
  const state = getGameState(chatId);
  if (!state) return null;
  const rankData = DUNGEON_RANKS[state.dungeonRank];
  const env = state.environment || DUNGEON_ENVIRONMENTS.SIMPLE_FOREST;

  // Progressive Environment Mixing Logic
  const rankIndexMap = {
    F: 1,
    E: 2,
    D: 3,
    C: 4,
    B: 5,
    A: 6,
    S: 7,
    SS: 8,
    SSS: 9,
  };
  const rankIdx = rankIndexMap[state.dungeonRank] || 1;

  let mixRate = 0.1; // F-E Rank
  if (rankIdx >= 3 && rankIdx <= 4)
    mixRate = 0.3; // D-C Rank
  else if (rankIdx >= 5 && rankIdx <= 6)
    mixRate = 0.5; // B-A Rank
  else if (rankIdx >= 7) mixRate = 0.7; // S+ Rank

  const encounter = classEncounters.generateEncounter(
    state.players,
    "COMBAT",
    state.difficulty || 1.0,
    {
      minMobs: rankData.minMobs,
      maxMobs: rankData.maxMobs,
    },
  );

  // Override enemies with Environment Mixing
  encounter.enemies = encounter.enemies.map((e) => {
    const isMixed = Math.random() < mixRate;
    let selectedMobId;

    if (!isMixed) {
      // Use native mob
      selectedMobId = env.mobs[Math.floor(Math.random() * env.mobs.length)];
    } else {
      // Pick from ANY environment
      const allEnvs = Object.values(DUNGEON_ENVIRONMENTS);
      const randomEnv = allEnvs[Math.floor(Math.random() * allEnvs.length)];
      selectedMobId =
        randomEnv.mobs[Math.floor(Math.random() * randomEnv.mobs.length)];
    }

    // Re-scale the selected mob
    const baseMob =
      classEncounters.INFECTED_POOLS.FIRE_LOW.COMMON.find(
        (m) => m.id === selectedMobId,
      ) ||
      Object.values(classEncounters.INFECTED_POOLS)
        .flatMap((p) => p.COMMON)
        .find((m) => m.id === selectedMobId);

    if (baseMob) {
      // Calculate avgSpeed for correct scaling
      const avgSpeed = Math.floor(
        state.players.reduce((sum, p) => sum + (p.stats?.spd || 10), 0) /
          state.players.length,
      );
      return classEncounters.scaleEnemyStats(
        baseMob,
        state.players.length,
        state.difficulty,
        e.enemyIndex,
        encounter.avgLevel,
        avgSpeed,
      );
    }
    return e;
  });

  encounter.theme = {
    theme: env.name,
    description: env.modifier.desc,
  };

  return encounter;
}

function generateEliteCombatEncounter(chatId) {
  const state = getGameState(chatId);
  if (!state) return null;
  const rankData = DUNGEON_RANKS[state.dungeonRank];
  const env = state.environment || DUNGEON_ENVIRONMENTS.SIMPLE_FOREST;

  // Mixing Logic
  const rankIndexMap = {
    F: 1,
    E: 2,
    D: 3,
    C: 4,
    B: 5,
    A: 6,
    S: 7,
    SS: 8,
    SSS: 9,
  };
  const rankIdx = rankIndexMap[state.dungeonRank] || 1;
  let mixRate = 0.15;
  if (rankIdx >= 5) mixRate = 0.4;

  const encounter = classEncounters.generateEncounter(
    state.players,
    "ELITE_COMBAT",
    (state.difficulty || 1.0) * 1.2,
    {
      minMobs: 1,
      maxMobs: 2,
    },
  );

  encounter.enemies = encounter.enemies.map((e) => {
    const isMixed = Math.random() < mixRate;
    let selectedMobId;

    if (!isMixed) {
      // Find an elite from this env's mob list
      selectedMobId = env.mobs[Math.floor(Math.random() * env.mobs.length)];
    } else {
      const allEnvs = Object.values(DUNGEON_ENVIRONMENTS);
      const randomEnv = allEnvs[Math.floor(Math.random() * allEnvs.length)];
      selectedMobId =
        randomEnv.mobs[Math.floor(Math.random() * randomEnv.mobs.length)];
    }

    // Find the elite version if possible
    const baseMob =
      Object.values(classEncounters.INFECTED_POOLS)
        .flatMap((p) => p.ELITE)
        .find((m) => m.id.includes(selectedMobId)) ||
      Object.values(classEncounters.INFECTED_POOLS).flatMap((p) => p.ELITE)[0];

    if (baseMob) {
      const avgSpeed = Math.floor(
        state.players.reduce((sum, p) => sum + (p.stats?.spd || 10), 0) /
          state.players.length,
      );
      return classEncounters.scaleEnemyStats(
        baseMob,
        state.players.length,
        state.difficulty * 1.2,
        e.enemyIndex,
        encounter.avgLevel,
        avgSpeed,
      );
    }
    return e;
  });

  encounter.theme = {
    theme: `Elite ${env.name}`,
    description: `Dangerous elites have adapted to the ${env.name}!`,
  };

  return encounter;
}

// ==========================================
// 🎯 STATUS EFFECTS SYSTEM
// ==========================================

const STATUS_EFFECTS = {
  poison: {
    name: "Poison",
    icon: "🧪",
    effect: "damage_over_time",
    value: 10,
    tickRate: "per_turn",
  },
  burn: {
    name: "Burn",
    icon: "🔥",
    effect: "damage_over_time",
    value: 15,
    tickRate: "per_turn",
  },
  bleed: {
    name: "Bleed",
    icon: "🩸",
    effect: "damage_over_time",
    value: 12,
    tickRate: "per_turn",
  },
  freeze: {
    name: "Freeze",
    icon: "❄️",
    effect: "skip_turn",
    duration: 1,
  },
  stun: {
    name: "Stun",
    icon: "💫",
    effect: "skip_turn",
    duration: 1,
  },
  sleep: {
    name: "Sleep",
    icon: "😴",
    effect: "skip_turn",
    wakeOnDamage: true,
  },
  root: {
    name: "Root",
    icon: "🌿",
    effect: "cannot_move",
    canAttack: true,
  },
  slow: {
    name: "Slow",
    icon: "🐌",
    effect: "reduce_speed",
    value: 50,
  },
  haste: {
    name: "Haste",
    icon: "⚡",
    effect: "increase_speed",
    value: 30,
  },
  curse: {
    name: "Curse",
    icon: "💀",
    effect: "reduce_stats",
    value: 20,
  },
  shield: {
    name: "Shield",
    icon: "🛡️",
    effect: "absorb_damage",
    value: 50,
  },
  regen: {
    name: "Regeneration",
    icon: "💚",
    effect: "heal_over_time",
    value: 10,
    tickRate: "per_turn",
  },
  berserk: {
    name: "Berserk",
    icon: "😡",
    effect: "increase_damage",
    value: 50,
    penalty: "reduce_defense",
    penaltyValue: 30,
  },
  taunt: {
    name: "Taunted",
    icon: "😠",
    effect: "force_target",
    target: "taunter",
  },
  charm: {
    name: "Charmed",
    icon: "💖",
    effect: "change_side",
    duration: 2,
  },
  blind: {
    name: "Blind",
    icon: "👁️",
    effect: "reduce_accuracy",
    value: 50,
  },
  silence: {
    name: "Silence",
    icon: "🤐",
    effect: "cannot_use_abilities",
  },
  shock: {
    name: "Shock",
    icon: "⚡",
    effect: "damage_over_time",
    value: 15,
    tickRate: "per_turn",
  },
  weak: {
    name: "Weakened",
    icon: "😵",
    effect: "reduce_stats",
    value: 20,
  },
  vulnerability: {
    name: "Vulnerable",
    icon: "💔",
    effect: "reduce_defense",
    value: 30,
  },
  blessing: {
    name: "Shock",
    icon: "⚡",
    effect: "damage_over_time",
    value: 15,
    tickRate: "per_turn",
  },
  weak: {
    name: "Weakened",
    icon: "😵",
    effect: "reduce_stats",
    value: 20,
  },
  vulnerability: {
    name: "Vulnerable",
    icon: "💔",
    effect: "reduce_defense",
    value: 30,
  },
  blessing: {
    name: "Blessing",
    icon: "✨",
    effect: "increase_stats",
    value: 20,
  },
  wet: {
    name: "Wet",
    icon: "💧",
    effect: "synergy_primer",
  },
  oil: {
    name: "Oiled",
    icon: "🛢️",
    effect: "synergy_primer",
  },
  brittle: {
    name: "Brittle",
    icon: "❄️💔",
    effect: "increase_physical_damage_taken",
    value: 50,
  },
};

// ==========================================
// 🗺️ ENCOUNTER TYPES
// ==========================================

const ENCOUNTER_TYPES = {
  COMBAT: {
    weight: 40,
    name: "Combat",
    icon: "⚔️",
    generator: generateCombatEncounter,
  },
  ELITE_COMBAT: {
    weight: 15,
    name: "Elite Enemy",
    icon: "💪",
    generator: generateEliteCombatEncounter,
  },
  TRAP: {
    weight: 10,
    name: "Trap",
    icon: "🪤",
    generator: generateTrapEncounter,
  },
  PUZZLE: {
    weight: 10,
    name: "Puzzle",
    icon: "🧩",
    generator: generatePuzzleEncounter,
  },
  MERCHANT: {
    weight: 8,
    name: "Merchant",
    icon: "🏪",
    generator: generateMerchantEncounter,
  },
  TREASURE: {
    weight: 10,
    name: "Treasure",
    icon: "💎",
    generator: generateTreasureEncounter,
  },
  EVENT: {
    weight: 7,
    name: "Special Event",
    icon: "✨",
    generator: generateEventEncounter,
  },
};

// ==========================================
// 🎮 MULTI-SESSION STATE MANAGEMENT
// ==========================================

const gameStates = new Map(); // sessionKey -> state

function getGameState(chatId, senderJid = null) {
  if (!chatId) return null;

  // 1. If senderJid is provided, check for THEIR solo raid first
  if (senderJid) {
    const soloKey = `${chatId}_${senderJid}`;
    if (gameStates.has(soloKey)) return gameStates.get(soloKey);
  }

  // 2. Check for group raid (keyed by chatId)
  if (gameStates.has(chatId)) return gameStates.get(chatId);

  // 3. Fallback: If no senderJid but we need the state (e.g. from a timer),
  // find the FIRST active raid in this chat
  for (const [key, state] of gameStates.entries()) {
    if (state.chatId === chatId && state.active) return state;
  }

  return null;
}

function isUserInAdventure(sessionKey) {
  if (gameStates.has(sessionKey)) return true;
  const parts = sessionKey.split("_");
  if (parts.length > 1) {
    const chatId = parts[0];
    const senderJid = parts[1];
    const groupState = gameStates.get(chatId);
    if (groupState && groupState.active && groupState.players.some(p => p.jid === senderJid)) {
      return true;
    }
  }
  return false;
}

function deleteGameState(chatId, senderJid = null) {
  // Determine the key
  let key = chatId;
  if (senderJid) {
    const soloKey = `${chatId}_${senderJid}`;
    if (gameStates.has(soloKey)) key = soloKey;
  }

  const state = gameStates.get(key);
  if (!state) {
    // Fallback search
    for (const [k, s] of gameStates.entries()) {
      if (
        s.chatId === chatId &&
        (!senderJid || s.players.some((p) => p.jid === senderJid))
      ) {
        key = k;
        break;
      }
    }
  }

  const finalState = gameStates.get(key);
  if (finalState && finalState.timers) {
    Object.values(finalState.timers).forEach((t) => {
      if (t) clearTimeout(t);
    });
  }
  gameStates.delete(key);
}

function checkChatLimits(chatId, isSolo, senderJid) {
  let soloCount = 0;
  let groupActive = false;
  let userHasSolo = false;

  for (const state of gameStates.values()) {
    if (state.chatId === chatId && state.active) {
      if (state.solo) {
        soloCount++;
        if (state.players.some((p) => p.jid === senderJid)) userHasSolo = true;
      } else {
        groupActive = true;
      }
    }
  }

  if (isSolo) {
    if (userHasSolo)
      return {
        allowed: false,
        msg: "❌ You already have an active Solo raid in this chat!",
      };
    if (soloCount >= 2)
      return { allowed: false, msg: "❌ Max 2 Solo raids allowed per chat!" };
  } else {
    if (groupActive)
      return {
        allowed: false,
        msg: "❌ A Group raid is already active in this chat!",
      };
  }

  return { allowed: true };
}

// Initial state template (used for creating new sessions)
const INITIAL_STATE_TEMPLATE = {
  active: false,
  isProcessing: false,
  combatProcessing: false,
  chatId: null,
  mode: "NORMAL",
  difficulty: 1.0,
  dungeonRank: "F",
  encounter: 0,
  maxEncounters: 5,
  players: [],
  inCombat: false,
  enemies: [],
  turnOrder: [],
  currentTurn: 0,
  combatRound: 0,
  pendingActions: {},
  combatHistory: [],
  votes: {},
  currentScenario: null,
  timers: {},
  phase: "IDLE",
  storyChoices: [],
  achievementsUnlocked: [],
  stats: {
    monstersKilled: 0,
    bossesDefeated: 0,
    treasuresFound: 0,
    trapsTriggered: 0,
    playersRevived: 0,
  },
};

// ==========================================
// 🎲 CORE GAME FUNCTIONS
// ==========================================

function getCurrentTier(chatId) {
  const state = getGameState(chatId);
  if (!state) return 1;
  const rankMap = { F: 1, E: 2, D: 3, C: 4, B: 5, A: 6, S: 7, SS: 8, SSS: 9 };
  return rankMap[state.dungeonRank] || 1;
}

function rollDice(sides, count = 1) {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

function rollD20() {
  return rollDice(20);
}

function calculateDamage(
  attacker,
  target,
  power,
  type = "physical",
  element = "PHYSICAL",
  chatId = null,
  isAbility = false,
) {
  // 🛡️ Guard against NaN
  let damage = Number(power) || 0;

  // 💡 DRAGON SEAL RING REQUIREMENT
  if (
    target.id &&
    (() => { const _id = String(target.id || '').toUpperCase(); return _id.startsWith("DRAKE") || _id.includes("DRAGON"); })()
  ) {
    if (!attacker.isEnemy && attacker.jid) {
      // 💡 FIX: accept ring in inventory OR equipped. Equip removes from
      // inventory (inventorySystem.js:476), so the old hasItem-only check
      // made the dragon unkillable if you actually equipped the ring.
      const hasRingInBag = inventorySystem.hasItem(attacker.jid, "dragon_seal_ring");
      const hasRingEquipped = attacker.equipment && attacker.equipment.ring && attacker.equipment.ring.id === 'dragon_seal_ring';
      if (!hasRingInBag && !hasRingEquipped) {
        return {
          damage: 0,
          isCrit: false,
          wasEvaded: false,
          noDamageReason:
            "🛡️ Your attacks slide off the dragon's scales! You need the *Dragon Seal Ring* 💍🐲 to pierce their hide!",
        };
      }
    }
  }

  // 💡 RANK DAMAGE BONUS (D-rank and up = DOUBLE damage)
  if (attacker.adventurerRank) {
    const rankValueMap = {
      F: 1,
      E: 2,
      D: 3,
      C: 4,
      B: 5,
      A: 6,
      S: 7,
      SS: 8,
      SSS: 9,
    };
    const rankVal = rankValueMap[attacker.adventurerRank] || 1;
    if (rankVal >= 3) {
      // D-rank is 3
      damage *= 2.0;
    }
  }

  // 💡 ENVIRONMENT MODIFIERS
  if (chatId) {
    const state = getGameState(chatId);
    const env = state?.environment;
    if (env) {
      // Fire Cave: Enemy fire bonus
      if (
        env.id === "FIRE_CAVE" &&
        attacker.isEnemy &&
        element.toUpperCase() === "FIRE"
      ) {
        damage *= 1 + (env.enemyBonus?.value || 0.1);
      }
      // Demon Castle: Dark magic empowerment
      if (env.id === "DEMON_CASTLE" && attacker.isEnemy && type === "magic") {
        damage *= 1 + (env.enemyBonus?.value || 0.2);
      }
    }
  }

  // Defense mitigation
  let def =
    type === "physical"
      ? Number(target.stats.def) || 0
      : (Number(target.stats.mag) || 0) * 0.5;

  // Apply attack buffs from attacker.buffs
  let attackBuffPercent = 0;
  if (attacker.buffs) {
    for (const buff of attacker.buffs) {
      if (buff.type === 'attack') {
        attackBuffPercent += (buff.value || 0);
      } else if (buff.type === 'all') {
        attackBuffPercent += (buff.value || 0);
      }
    }
  }
  if (attackBuffPercent > 0) {
    damage *= (1 + attackBuffPercent / 100);
  }

  // Apply defense buffs from target.buffs
  let defenseBuffPercent = 0;
  if (target.buffs) {
    for (const buff of target.buffs) {
      if (buff.type === 'defense') {
        defenseBuffPercent += (buff.value || 0);
      } else if (buff.type === 'all') {
        defenseBuffPercent += (buff.value || 0);
      }
    }
  }
  if (defenseBuffPercent > 0) {
    def *= (1 + defenseBuffPercent / 100);
  }

  // 💡 STATUS EFFECT MODIFIERS (Defense)
  const targetEffects = target.statusEffects || [];
  if (targetEffects.some((e) => e.type === "shield")) def *= 1.5;
  if (targetEffects.some((e) => e.type === "vulnerability")) def *= 0.7;
  if (targetEffects.some((e) => e.type === "brittle") && type === "physical")
    damage *= 1.5;
  if (targetEffects.some((e) => e.type === "berserk")) def *= 0.7; // Berserk penalty
  if (targetEffects.some((e) => e.type === "curse" || e.type === "weak"))
    def *= 0.8;

  // 💡 STATUS EFFECT MODIFIERS (Attack Power)
  const attackerEffects = attacker.statusEffects || [];
  if (attackerEffects.some((e) => e.type === "blessing")) damage *= 1.2;
  if (attackerEffects.some((e) => e.type === "berserk")) damage *= 1.5; // Berserk bonus
  if (attackerEffects.some((e) => e.type === "curse" || e.type === "weak"))
    damage *= 0.8;

  // 💡 DAMAGE REDUCTION (Secondary Stat)
  // Flat defense mitigation occurs before percentage damage reduction
  damage -= def * 0.5;

  const dr = Number(target.stats.dmgReduction) || 0;
  damage = damage * (1 - dr / 100);

  // Random variance (±10%)
  const variance = 0.9 + Math.random() * 0.2;
  damage *= variance;

  // 💡 ELEMENTAL MODIFIER
  const targetElement = target.element || "PHYSICAL";
  const chart = ELEMENT_CHART[element.toUpperCase()] || ELEMENT_CHART.PHYSICAL;

  if (chart.strongVs.includes(targetElement)) {
    damage *= 1.5;
  } else if (chart.weakTo.includes(targetElement)) {
    damage *= 0.75;
  }

  // Critical hit
  let isCrit = false;
  if (Math.random() * 100 < (Number(attacker.stats.crit) || 0)) {
    const targetCloak = target.equipment?.cloak?.id || target.equipment?.cloak;
    if (targetCloak === "mantlet_of_chaos") {
      isCrit = false;
    } else {
      let critMult = 1.5;
      const ringId = attacker.equipment?.ring?.id || attacker.equipment?.ring;
      if (ringId === "loop_of_forever" || ringId === "entropy_loop") {
        critMult = 2.0; // Double crit damage multiplier
      }
      damage *= critMult;
      isCrit = true;
    }
  }

  damage = Math.max(0, Math.floor(damage));

  // 💡 EVASION CHECK (Secondary Stat)
  let evasionChance = Number(target.stats.evasion) || 0;

  // 💡 EQUIPMENT EVASION MODIFIERS
  const targetArmor = target.equipment?.armor?.id || target.equipment?.armor;
  const targetCloak = target.equipment?.cloak?.id || target.equipment?.cloak;
  if (targetArmor === "voidstrand_robes") evasionChance += 15;
  if (targetCloak === "veil_of_the_void") evasionChance += 10;
  if (targetCloak === "cloak_of_shifting_realities") evasionChance += 10;

  // 🌍 WEATHER: Foggy (-15% Accuracy = +15% Evasion)
  const hours = new Date().getHours();
  if (Math.floor(hours / 6) % 4 === 1) evasionChance += 15;

  // 🌍 ENVIRONMENT EVASION
  if (chatId) {
    const state = getGameState(chatId);
    const env = state?.environment;
    if (env) {
      // Desert: Sandstorm (accuracy penalty)
      if (env.id === "DESERT") {
        evasionChance += env.modifier.accuracyReduction * 100;
      }
      // Forest: Camouflage (evasion bonus for enemies)
      if (env.id === "SIMPLE_FOREST" && target.isEnemy) {
        evasionChance += env.enemyBonus.evasionBonus * 100;
      }
    }
  }

  if (Math.random() * 100 < evasionChance) {
    return { damage: 0, isCrit: false, wasEvaded: true };
  }

  // 💡 SS+ DUNGEON ENEMY MINIMUM DAMAGE FLOOR
  // Enemies in SS/SSS dungeons must always deal at least 3% (or 5% for abilities) of target's max HP per hit,
  // regardless of how high the player's DEF/dmgReduction is.
  if (attacker.isEnemy && !target.isEnemy) {
    const dungeonRankOfAttacker = attacker.dungeonRank || attacker.rank || null;
    const highRankSet = ['SS', 'SSS'];
    if (highRankSet.includes(dungeonRankOfAttacker)) {
      const targetMaxHp = target.stats.maxHp || target.stats.hp;
      const minDmgPct = isAbility ? 0.05 : 0.03;
      const minDmg = Math.floor(targetMaxHp * minDmgPct);
      if (damage < minDmg) damage = minDmg;
    }
    
    // One-shot protection (Sturdy): if the hit deals >= maxHp OR would kill from full health
    if (damage >= target.stats.hp && target.stats.hp >= target.stats.maxHp * 0.9) {
      const hpLeft = Math.floor(Math.random() * 9) + 2; // leaves 2 to 10 HP
      damage = target.stats.hp - hpLeft;
    }
  }

  return {
    damage: Math.max(1, Math.floor(damage)),
    isCrit,
    wasEvaded: false,
  };
}
function applyStatusEffect(
  target,
  effectType,
  duration = 3,
  value = 0,
  source = null,
) {
  if (!target) return { applied: false };
  if (!target.statusEffects) target.statusEffects = [];

  // 🧪 SYNERGY LOGIC
  const currentTypes = target.statusEffects.map((s) => s.type);
  let finalType = effectType;
  let finalDuration = duration;
  let finalValue = value;
  let synergyMsg = "";

  // 1. WET + SHOCK = ELECTROCUTED (Stun)
  if (effectType === "shock" && currentTypes.includes("wet")) {
    target.statusEffects = target.statusEffects.filter((s) => s.type !== "wet");
    finalType = "stun";
    finalDuration = 1;
    synergyMsg = `⚡💧 *ELECTRO-CHARGE!* The water amplifies the shock, STUNNING ${target.name}!`;
  }
  // 2. WET + FREEZE = DEEP FREEZE
  else if (effectType === "freeze" && currentTypes.includes("wet")) {
    target.statusEffects = target.statusEffects.filter((s) => s.type !== "wet");
    finalDuration = 2;
    synergyMsg = `❄️💧 *DEEP FREEZE!* ${target.name} is frozen solid!`;
  }
  // 3. OIL + FIRE = EXPLOSION
  else if (effectType === "burn" && currentTypes.includes("oil")) {
    target.statusEffects = target.statusEffects.filter((s) => s.type !== "oil");
    const explosionDmg = Math.floor(target.stats.maxHp * 0.15);
    target.stats.hp -= explosionDmg;
    target.currentHP = Math.max(0, target.stats.hp);
    synergyMsg = `🔥🛢️ *BOOM!* The oil ignites, dealing ${explosionDmg} explosive damage!`;
  }

  // Check if already has this effect
  const existing = target.statusEffects.find((e) => e.type === finalType);
  if (existing) {
    existing.duration = Math.max(existing.duration, finalDuration);
    existing.value = Math.max(existing.value || 0, finalValue);
    return { applied: true, synergyMsg };
  }

  // Default if unknown to prevent crashes
  const def = STATUS_EFFECTS[finalType] || {
    name: finalType,
    icon: "❓",
    effect: "unknown",
    value: 0,
  };

  target.statusEffects.push({
    type: finalType,
    name: def.name,
    duration: finalDuration,
    value: finalValue || def.value || 0,
    icon: def.icon,
    source: source,
    effect: def.effect,
    tickRate: def.tickRate,
  });

  return { applied: true, synergyMsg };
}

function processStatusEffects(entity) {
  let messages = [];

  if (!entity.statusEffects) {
    entity.statusEffects = [];
  }

  for (let i = entity.statusEffects.length - 1; i >= 0; i--) {
    const effect = entity.statusEffects[i];
    const template = STATUS_EFFECTS[effect.type] || {};

    const name = effect.name || template.name || effect.type;
    const icon = effect.icon || template.icon || "✨";
    const value =
      Number(effect.value !== undefined ? effect.value : template.value) || 0;

    // Process effect based on type
    if (
      effect.effect === "damage_over_time" ||
      template.effect === "damage_over_time"
    ) {
      let damage = Math.floor(value);
      // DoTs intentionally bypass DEF (persistent burn/poison) but should
      // respect damage-reduction stat and vulnerability/shield status modifiers.
      const dr = Number(entity.stats.dmgReduction) || 0;
      if (dr > 0) damage = Math.floor(damage * (1 - dr / 100));
      const entityEffects = entity.statusEffects || [];
      if (entityEffects.some((e) => e.type === "vulnerability")) damage = Math.floor(damage * 1.3);
      if (entityEffects.some((e) => e.type === "shield")) damage = Math.floor(damage * 0.5);
      damage = Math.max(1, damage);
      entity.stats.hp -= damage;
      messages.push(
        `🩸 *${name.toUpperCase()} TICK:* ${icon} ${entity.name} takes **${damage}** damage!`,
      );
    } else if (
      effect.effect === "heal_over_time" ||
      template.effect === "heal_over_time"
    ) {
      // 💡 QA FIX: validate heal value + maxHp + current HP to prevent NaN HP
      // (infinite HP bug). If current HP is already NaN (from an upstream bug),
      // adding a finite heal would still produce NaN. We reset NaN HP to 0
      // before healing so the entity becomes killable again.
      const safeHealValue = Number.isFinite(value) ? value : 0;
      const safeMaxHp = Number.isFinite(entity.stats.maxHp) ? entity.stats.maxHp
        : (Number.isFinite(entity.stats.hp) ? entity.stats.hp : 100);
      const safeCurrentHp = Number.isFinite(entity.stats.hp) ? entity.stats.hp : 0;
      const heal = Math.max(0, Math.min(
        safeHealValue,
        safeMaxHp - safeCurrentHp,
      ));
      entity.stats.hp = safeCurrentHp + heal;
      messages.push(
        `💚 *REGENERATION:* ${icon} ${entity.name} recovers **${Math.floor(heal)}** HP!`,
      );
    } else if (
      effect.effect === "reduce_stats" ||
      template.effect === "reduce_stats" ||
      effect.effect === "reduce_defense" ||
      template.effect === "reduce_defense"
    ) {
      // Stat reduction doesn't tick damage, but we show it's active
      // messages.push(`${icon} ${entity.name} is struggling under ${name}...`);
    }

    // Sync HP for V2 (combat Integration expects currentHP)
    entity.currentHP = entity.stats.hp;

    // Reduce duration
    effect.duration--;
    if (effect.duration <= 0) {
      entity.statusEffects.splice(i, 1);
      messages.push(`✨ *EXPIRED:* ${entity.name}'s **${name}** has worn off.`);
    }
  }

  // Tick down buffs
  if (entity.buffs && entity.buffs.length > 0) {
    for (let i = entity.buffs.length - 1; i >= 0; i--) {
      const buff = entity.buffs[i];
      buff.duration--;
      if (buff.duration <= 0) {
        const buffName = buff.type.charAt(0).toUpperCase() + buff.type.slice(1);
        const icon = buff.icon || "✨";
        messages.push(`✨ *EXPIRED:* ${entity.name}'s **${buffName} Buff** (${icon}) has worn off.`);
        entity.buffs.splice(i, 1);
      }
    }
  }

  return messages;
}
function getAvailableEnemies(poolId) {
  // poolId is 1-indexed, convert to avgLevel for classEncounters
  const levelMap = { 1: 5, 2: 25, 3: 45, 4: 65, 5: 85 };
  const avgLevel = levelMap[poolId] || 5;

  const poolData = classEncounters.getEnemyPoolByLevel(avgLevel);
  if (!poolData) return ["DROWNED_ONE"]; // Fallback

  // Flatten all categories (COMMON, ELITE, etc.) into a simple list of IDs
  const enemyPool = [];
  if (poolData.COMMON) poolData.COMMON.forEach((e) => enemyPool.push(e.id));
  if (poolData.ELITE) poolData.ELITE.forEach((e) => enemyPool.push(e.id));

  return enemyPool.length > 0 ? enemyPool : ["DROWNED_ONE"];
}

function createEnemy(enemyType, level = 1) {
  const template = ENEMY_TYPES[enemyType];
  if (!template) return null;

  const enemy = {
    id: `enemy_${Date.now()}_${Math.random()}`,
    type: enemyType,
    name: template.name,
    icon: template.icon,
    level: level,
    stats: {
      hp: Math.floor(template.stats.hp * (1 + (level - 1) * 0.2)),
      maxHp: Math.floor(template.stats.hp * (1 + (level - 1) * 0.2)),
      energy: 100,
      maxEnergy: 100,
      atk: Math.floor(template.stats.atk * (1 + (level - 1) * 0.15)),
      def: Math.floor(template.stats.def * (1 + (level - 1) * 0.15)),
      mag: Math.floor(template.stats.mag * (1 + (level - 1) * 0.15)),
      spd: template.stats.spd,
      luck: template.stats.luck,
      crit: 5,
    },
    abilities: template.abilities,
    statusEffects: [],
    isEnemy: true,
    loot: template.loot,
    xp: Math.floor(template.xp * (1 + (level - 1) * 0.3)),
    gold: Math.floor(template.gold * 3 * (1 + (level - 1) * 0.8)),
  };
  return enemy;
}

// ==========================================
// 📝 ENCOUNTER GENERATORS
// ==========================================

function generateTrapEncounter(chatId) {
  const tier = getCurrentTier(chatId);

  const traps = [
    {
      name: "Poison Dart Trap",
      icon: "🎯",
      damage: 25 + tier * 15,
      difficulty: 12 + tier,
    },
    {
      name: "Pit Trap",
      icon: "🕳️",
      damage: 40 + tier * 20,
      difficulty: 14 + tier,
    },
    {
      name: "Fire Trap",
      icon: "🔥",
      damage: 35 + tier * 18,
      difficulty: 13 + tier,
    },
  ];

  const trap = traps[Math.floor(Math.random() * traps.length)];

  return {
    type: "TRAP",
    trap: trap,
    name: trap.name,
    icon: trap.icon,
    description: `You trigger a ${trap.name}!`,
    choices: [
      {
        id: "1",
        text: "Try to dodge (SPD check)",
        stat: "spd",
        difficulty: trap.difficulty,
        success: {
          description: "You jump out of the way just in time!",
          gold: 10,
        },
        failure: {
          description: `You were too slow!`,
          damage: trap.trap?.damage || trap.damage,
        },
      },
      {
        id: "2",
        text: "Shield the party (DEF check)",
        stat: "def",
        difficulty: trap.difficulty - 2,
        success: {
          description: "You block the worst of it!",
          damage: Math.floor(trap.damage / 4),
        },
        failure: {
          description: `Your shield wasn't enough!`,
          damage: Math.floor(trap.damage * 0.8),
        },
      },
      {
        id: "3",
        text: "Disable mechanism (LUCK check)",
        stat: "luck",
        difficulty: trap.difficulty + 2,
        success: {
          description:
            "You successfully disarmed the trap! Found some scrap gold.",
          gold: 40,
        },
        failure: {
          description: `It blew up in your face!`,
          damage: trap.damage,
        },
      },
    ],
  };
}

function generatePuzzleEncounter(chatId) {
  const tier = getCurrentTier(chatId);
  const puzzles = [
    {
      name: "Ancient Riddle",
      icon: "📜",
      reward: 60 + tier * 30,
      difficulty: 15 + tier,
    },
    {
      name: "Magic Lock",
      icon: "🔐",
      reward: 100 + tier * 40,
      difficulty: 16 + tier,
    },
  ];

  const puzzle = puzzles[Math.floor(Math.random() * puzzles.length)];

  return {
    type: "PUZZLE",
    puzzle: puzzle,
    name: puzzle.name,
    icon: puzzle.icon,
    description: `You discover a ${puzzle.name}!`,
    choices: [
      {
        id: "1",
        text: "Decode symbols (MAG check)",
        stat: "mag",
        difficulty: puzzle.difficulty,
        success: {
          description: "The runes reveal their secrets!",
          gold: puzzle.reward,
        },
        failure: {
          description: "A magical feedback pulse hits the party!",
          damage: 30 + tier * 5,
        },
      },
      {
        id: "2",
        text: "Brute force (ATK check)",
        stat: "atk",
        difficulty: puzzle.difficulty + 4,
        success: {
          description: "You smashed it open! Found some gold.",
          gold: Math.floor(puzzle.reward * 0.6),
        },
        failure: {
          description: "You hurt yourself trying to break it!",
          damage: 50 + tier * 10,
        },
      },
    ],
  };
}

function generateMerchantEncounter(chatId) {
  return {
    type: "MERCHANT",
    description: "A traveling merchant appears!",
    shopItems: [
      "health_potion",
      "mana_potion",
      "strength_brew",
      "defense_tonic",
      "phoenix_down",
      "bomb",
    ],
  };
}

function generateTreasureEncounter(chatId) {
  const tier = getCurrentTier(chatId);
  const treasureTypes = [
    { name: "Ancient Chest", gold: 200 + tier * 100, damage: 50 + tier * 10 },
    { name: "Cursed Relic", gold: 1000 + tier * 200, damage: 100 + tier * 20 },
  ];

  const treasure =
    treasureTypes[Math.floor(Math.random() * treasureTypes.length)];

  return {
    type: "TREASURE",
    treasure: treasure,
    name: treasure.name,
    icon: "💎",
    description: `You found a ${treasure.name}! It pulses with strange energy.`,
    choices: [
      {
        id: "1",
        text: "Open carefully (LUCK check)",
        stat: "luck",
        difficulty: 12 + tier,
        success: { description: "You safely opened it!", gold: treasure.gold },
        failure: {
          description: "A magical trap triggers!",
          damage: treasure.damage,
        },
      },
      {
        id: "2",
        text: "Smash it open",
        outcome: {
          description:
            "You broke the mechanism but some contents were destroyed.",
          gold: Math.floor(treasure.gold / 3),
          damage: Math.floor(treasure.damage / 2),
        },
      },
    ],
  };
}

function generateEventEncounter(chatId) {
  const events = [
    {
      name: "Mysterious Altar",
      choices: [
        {
          id: "1",
          text: "Offer Blood",
          outcome: {
            description: "The altar drinks your life force and grants power.",
            damage: 50,
            gold: 200,
          },
        },
        {
          id: "2",
          text: "Pray (LUCK check)",
          stat: "luck",
          difficulty: 15,
          success: {
            description: "The gods smile upon you.",
            heal: 100,
            gold: 100,
          },
          failure: { description: "The gods are silent.", damage: 20 },
        },
        {
          id: "3",
          text: "Leave",
          outcome: { description: "You leave the altar alone." },
        },
      ],
    },
  ];

  const event = events[Math.floor(Math.random() * events.length)];

  return {
    type: "EVENT",
    event: event,
    name: event.name,
    icon: "✨",
    description: `You come across a ${event.name}.`,
    choices: event.choices,
  };
}

// ==========================================
// ⚔️ COMBAT SYSTEM
// ==========================================

async function startCombat(sock, groq, encounter, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;
  const chatId = state.chatId;
  if (!groq) groq = state.groq;
  state.inCombat = true;

  // Restore catalog enemies
  state.enemies = encounter.enemies;
  // Stamp dungeon rank on each enemy so calculateDamage can apply SS+ damage floor
  state.enemies.forEach(e => { e.rank = state.dungeonRank; });
  state.currentEncounterType = encounter.type || "COMBAT";

  state.combatRound = 0;
  state.pendingActions = {};
  state.combatHistory = [];

  // 💡 INITIALIZE ACTION GAUGE
  const allCombatants = [
    ...state.players.filter((p) => !p.isDead),
    ...state.enemies,
  ];

  // 💡 FIRST-TURN GUARANTEE: Give players a head start so they always get
  // at least 1 turn before any enemy acts. Players get full speed as
  // initial gauge, enemies get 0. This means the fastest player will
  // always reach the threshold first, giving them a chance to buff,
  // heal, or attack before the boss responds.
  allCombatants.forEach((c) => {
    if (c.isEnemy || c.isBoss) {
      c.actionGauge = 0; // Enemies start with 0 gauge
    } else {
      c.actionGauge = Math.floor((c.stats.spd || 10) / 2); // Players get headstart
    }
  });

  state.turnOrder = allCombatants;

  // 💡 CRITICAL FIX (P1 follow-up): Dynamic gauge threshold based on max
  // base speed in combat. With a hardcoded threshold of 100, any combatant
  // with speed >= 100 reaches the threshold every single tick. Since
  // turnOrder = [...players, ...enemies] (players first), the player is
  // ALWAYS checked first and ALWAYS selected — enemies NEVER get a turn.
  //
  // This was the REAL root cause of "monsters not attacking": not the
  // "highest gauge" selection logic (which the previous fix addressed), but
  // the fact that high speed values made the gauge system meaningless.
  //
  // Dynamic threshold = max(100, 2 * maxBaseSpeed) ensures:
  //   - The fastest combatant needs at least 2 ticks to act (not 1)
  //   - Slower combatants accumulate gauge while the fast one is resetting
  //   - Turn ratio approximates speed ratio (spd 500 vs 50 → ~10:1 turns)
  //   - Low-speed combat (spd 10-50) is unaffected (threshold stays 100)
  const maxBaseSpeed = Math.max(...allCombatants.map(c => c.stats.spd || 10));
  state.gaugeThreshold = Math.max(100, maxBaseSpeed * 2);

  // Build the turn order string to put in the first message's image caption
  const orderList = state.turnOrder
    .slice(0, 6)
    .map((c) => {
      const icon = c.isEnemy ? c.icon : c.class?.icon || "👤";
      return `${icon} ${c.name}`;
    })
    .join(" → ");
  const turnOrderStr = `⚔️ *Order:* ${orderList}${state.turnOrder.length > 6 ? " ..." : ""}`;

  // NEW: Generate combat image and caption (with Turn Order merged)
  const scene = await combatIntegration.generateCombatScene(
    state.players,
    state.enemies,
    "START",
    {
      rank: state.dungeonRank, // Pass rank explicitly
      backgroundPath: state.backgroundPath, // Consistent with TURN phase
      encounterInfo: {
        ...encounter,
        rank: state.dungeonRank, // Also in encounterInfo
        backgroundPath: state.backgroundPath, // CRITICAL FIX for renderCombatStart
        turnOrderStr: turnOrderStr, // Pass turn order here instead of AI narration
        theme: encounter.theme || {
          theme: "Battle",
          description: "A fierce fight breaks out!",
        },
      },
    },
  );

  // Store background for consistency
  if (scene.backgroundPath) {
    state.backgroundPath = scene.backgroundPath;
  }

  if (scene.success) {
    try {
      if (scene.buffer) {
        await sock.sendMessage(state.chatId, {
          image: scene.buffer,
          caption: scene.caption,
        });
      } else if (scene.imagePath && fs.existsSync(scene.imagePath)) {
        await sock.sendMessage(state.chatId, {
          image: fs.readFileSync(scene.imagePath),
          caption: scene.caption,
        });
        // Clean up temp file
        setTimeout(() => {
          if (fs.existsSync(scene.imagePath)) fs.unlinkSync(scene.imagePath);
        }, 10000);
      } else {
        await sock.sendMessage(state.chatId, {
          text: scene.caption || "⚔️ Combat Started!",
        });
      }
    } catch (mediaError) {
      console.error("Media upload failed in startCombat:", mediaError.message);
      try {
        await sock.sendMessage(state.chatId, {
          text: scene.caption || "⚔️ Combat Started!",
        });
      } catch (err) {
        console.error("Fallback text failed in startCombat:", err.message);
      }
    }
  } else {
    // Fallback to text if image fails
    try {
      await sock.sendMessage(state.chatId, {
        text: scene.caption || "⚔️ Combat Started!",
      });
    } catch (err) {
      console.error(
        "Fallback text failed in startCombat (image failed):",
        err.message,
      );
    }
  }

  // Wait before starting first turn - Instant for solo
  const startDelay = state.solo ? 0 : 120000;
  state.timers.combatStart = setTimeout(async () => {
    try {
      if (!state.inCombat) return; // Safety check

      // Simply process combat turn without sending a second turnMsg
      await processCombatTurn(sock, sessionKey);
    } catch (err) {
      console.error("[Quest] combatStart timer error:", err?.message || err);
    }
  }, startDelay);
}

async function checkCombatEnd(sock, state, sessionKey) {
  const playersDead = state.players.every((p) => p.isDead || p.stats.hp <= 0);
  const enemiesDead = state.enemies.every((e) => e.stats.hp <= 0);

  if (playersDead || enemiesDead) {
    // Clear any pending turn timers to prevent infinite loops
    if (state.timers.turn) {
      clearTimeout(state.timers.turn);
      state.timers.turn = null;
    }
    await endCombat(sock, enemiesDead, sessionKey);
    return true;
  }
  return false;
}

async function processCombatTurn(sock, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state || !state.inCombat) return;

  // Prevent overlapping turn processing
  if (state.combatProcessing) return;
  state.combatProcessing = true;

  try {
    while (state.inCombat) {
      // Reset justDied flags
      state.players.forEach((p) => (p.justDied = false));
      state.enemies.forEach((e) => (e.justDied = false));

      // 💡 FIX: tick down enemy cooldowns each turn so monster skills
      // actually go on cooldown (previously cooldowns were checked by
      // monsterSkills.js:553 but never decremented — so once a cooldown
      // was set, it stayed set forever, blocking the skill permanently).
      // We decrement by 1 each round and delete when it reaches 0.
      state.enemies.forEach((e) => {
        if (!e.cooldowns) return;
        for (const k of Object.keys(e.cooldowns)) {
          e.cooldowns[k] = Math.max(0, (e.cooldowns[k] || 0) - 1);
          if (e.cooldowns[k] <= 0) delete e.cooldowns[k];
        }
      });

      let activeActor = null;
      let ticks = 0;
      const maxTicks = 1000;

      // 💡 QA FIX: turn order — was "pick highest gauge > 99", which meant
      // fast players ALWAYS had a higher gauge than enemies and enemies
      // NEVER got a turn. The first fix changed to "first in turnOrder with
      // gauge >= threshold" — but that caused turn STARVATION in multi-combatant
      // fights: when several combatants reached the threshold on the same tick,
      // the one earliest in turnOrder was always picked, and later combatants
      // (especially the last enemy) never got a turn.
      //
      // 💡 FINAL FIX: "highest gauge among those >= threshold" + dynamic
      // threshold + reset to 0. This is the correct gauge-based turn scheduler:
      //   - Dynamic threshold (2 * maxBaseSpeed) prevents any combatant from
      //     acting every single tick
      //   - "Highest gauge" selection prioritizes combatants who have been
      //     waiting the longest (accumulated the most excess gauge)
      //   - Reset to 0 (not -= threshold) discards excess, so slower
      //     combatants can catch up and eventually out-accumulate faster ones
      //   - Turn ratio approximates speed ratio (spd 500 vs 50 → ~10:1 turns)
      //   - No starvation: every combatant gets turns proportional to speed
      const gaugeThreshold = state.gaugeThreshold || 100;
      while (!activeActor && ticks < maxTicks) {
        ticks++;
        // Increment every living combatant's gauge this tick
        for (const c of state.turnOrder) {
          if (c.stats.hp <= 0) continue;

          let speed = c.stats.spd || 10;
          if (state.environment?.id === "ICE_CAVE" && !c.isEnemy)
            speed = Math.floor(speed * 0.9);

          const cEffects = c.statusEffects || [];
          if (cEffects.some((e) => e.type === "haste")) speed *= 1.3;
          if (cEffects.some((e) => e.type === "slow")) speed *= 0.5;
          if (cEffects.some((e) => e.type === "curse" || e.type === "weak"))
            speed *= 0.8;

          c.actionGauge = (c.actionGauge || 0) + Math.max(1, speed);
        }
        // Pick the combatant with the HIGHEST gauge among those >= threshold.
        // Ties are broken by turnOrder position (earlier combatant wins).
        let highestGauge = -1;
        for (const c of state.turnOrder) {
          if (c.stats.hp <= 0) continue;
          if (c.actionGauge >= gaugeThreshold && c.actionGauge > highestGauge) {
            activeActor = c;
            highestGauge = c.actionGauge;
          }
        }
      }

      if (!activeActor) break;

      // 💡 QA FIX: reset gauge to 0 (was -= 100). With -= 100, a fast
      // player's gauge stayed above 100 permanently, preventing enemies
      // from ever being picked. Reset to 0 gives slower combatants a
      // window to act before the fast combatant builds up again.
      activeActor.actionGauge = 0;
      state.activeCombatant = activeActor;
      state.turnCount = (state.turnCount || 0) + 1;

      if (activeActor.isBoss) {
        if (
          state.turnCount === 15 ||
          state.turnCount === 20 ||
          state.turnCount === 25
        ) {
          activeActor.stats.atk = Math.floor(activeActor.stats.atk * 1.05);
          state.pendingStatusMsg =
            (state.pendingStatusMsg ? state.pendingStatusMsg + "\n" : "") +
            `⚠️ *${activeActor.name}* grows more violent!`;
        }
        if (state.turnCount > 30) {
          // 💡 FIX: Show damage values instead of silently setting HP to 0.
          // Calculate overkill damage so players can see what happened.
          let annihilationMsg = `💀 *${activeActor.name}* UNLEASHING TOTAL ANNIHILATION!\n\n`;
          state.players.forEach((p) => {
            if (p.stats.hp <= 0) return; // already dead
            const damage = p.stats.hp + Math.floor(p.stats.maxHp * 0.5); // overkill
            p.stats.hp = 0;
            p.isDead = true;
            annihilationMsg += `💥 ${p.name} takes *${damage}* damage! (HP: 0)\n`;
          });
          try {
            await sock.sendMessage(state.chatId, { text: annihilationMsg });
          } catch (e) {}
          await endCombat(sock, false, sessionKey);
          return;
        }
      }

      const statusMessages = processStatusEffects(activeActor);

      // Start of Turn Equipment Triggers
      if (activeActor && !activeActor.isEnemy) {
        const armorId = activeActor.equipment?.armor?.id || activeActor.equipment?.armor;
        if (armorId === "chrono_weaver_vestments") {
          if (Math.random() < 0.20) {
            const hasHasteAlready = (activeActor.statusEffects || []).some(e => e.type === "haste");
            if (!hasHasteAlready) {
              applyStatusEffect(activeActor, "haste", 2, 30);
              statusMessages.push(`⏳ *Chrono Slip:* Time warping around ${activeActor.name} grants Haste!`);
            }
          }
        }
      }
      if (state.environment?.id === "FIRE_CAVE") {
        const heatDmg = Math.floor(activeActor.stats.maxHp * 0.05);
        activeActor.stats.hp -= heatDmg;
        activeActor.currentHP = Math.max(0, activeActor.stats.hp);
        statusMessages.push(
          `🌋 *Heat Exhaustion:* ${activeActor.name} takes ${heatDmg} fire damage!`,
        );
      }

      // Buffer status messages — they'll be prepended to the next action output
      state.pendingStatusMsg =
        statusMessages.length > 0 ? statusMessages.join("\n") : null;

      if (activeActor.stats.hp <= 0) {
        await handleDeath(sock, activeActor, sessionKey);
        if (await checkCombatEnd(sock, state, sessionKey)) return;
        continue;
      }

      const skipEffects = ["freeze", "stun", "sleep"];
      const activeEffect = (activeActor.statusEffects || []).find((e) =>
        skipEffects.includes(e.type),
      );
      if (activeEffect) {
        const statusPrefix = state.pendingStatusMsg
          ? state.pendingStatusMsg + "\n\n"
          : "";
        state.pendingStatusMsg = null;

        const effectIcon = activeEffect.icon || "⏳";
        const effectName = activeEffect.name || activeEffect.type;
        const stylishMsg = `${statusPrefix}❄️ *STATUS EFFECT ACTIVE* ❄️\n━━━━━━━━━━━━━━━━\n${activeActor.icon || activeActor.class?.icon || "👤"} *${activeActor.name}* is **${effectName.toUpperCase()}**!\n\n${effectIcon} _Unable to act this turn._\n━━━━━━━━━━━━━━━━`;

        try {
          await sock.sendMessage(state.chatId, {
            text: stylishMsg,
          });
        } catch (msgErr) {
          console.error("Failed to send skip status message:", msgErr.message);
        }
        await nextTurn(
          sock,
          null, // skip round image generation
          sessionKey,
        );
        // Wait a brief moment so skipped turns don't spam instantly and crash
        await new Promise((r) => setTimeout(r, state.solo ? 1000 : 2500));
        continue;
      }

      if (activeActor.isEnemy) {
        // AI Turn
        await performEnemyAction(sock, activeActor, sessionKey);
        // The loop continues because performEnemyAction resolved
      } else {
        // Player Turn - Wait for action
        await promptPlayerAction(sock, activeActor, sessionKey);
        // The loop continues because promptPlayerAction resolved (via performAction)
      }
    }
  } catch (err) {
    console.error("[Combat] Turn loop error:", err);
  } finally {
    state.combatProcessing = false;
  }
}

async function promptPlayerAction(sock, player, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;
  const chatId = state.chatId;
  const icon = player.class?.icon || "👤";
  const inventory = inventorySystem.formatInventory(player.jid);
  const usableItems = !inventory.isEmpty
    ? inventory.items.filter((item) => {
        const info = lootSystem.getItemInfo(item.id);
        // Accept items that are usable in lootSystem OR are in the pre-quest shop CONSUMABLES
        return (info && info.usable) || !!CONSUMABLES[item.id];
      })
    : [];

  // Flush enemy round log
  if (state.roundLog && state.roundLog.length > 0) {
    const roundSummary = state.roundLog.join('\n─────────\n');
    try {
      await sock.sendMessage(state.chatId, { text: roundSummary });
    } catch (e) {}
    state.roundLog = [];
  }

  const hpBar = (cur, max, len = 10) => {
    const filled = Math.max(0, Math.round((Math.max(0, cur) / max) * len));
    return '▰'.repeat(filled) + '▱'.repeat(len - filled);
  };

  const statusPrefix = state.pendingStatusMsg
    ? state.pendingStatusMsg + "\n\n"
    : "";
  state.pendingStatusMsg = null;
  let msg = statusPrefix + `⚔️ *YOUR TURN*\n`;

  msg += `${icon} *${player.name}*\n`;
  msg += `❤️ ${player.stats.hp}/${player.stats.maxHp} HP\n`;
  msg += `⚡ ${player.stats.energy}/${player.stats.maxEnergy} EN\n`;

  if (player.statusEffects && player.statusEffects.length > 0) {
    msg += `📋 ${player.statusEffects.map((e) => e.icon).join(" ")}\n`;
  }

  const livingEnemies = (state.enemies || []).filter((e) => !e.isDead);
  if (livingEnemies.length > 0) {
    msg += `\n*ENEMIES:*\n`;
    livingEnemies.forEach((e) => {
      const maxHp = e.stats.maxHp || e.stats.hp;
      const curHp = Math.max(0, e.stats.hp);
      msg += `👾 ${e.name} [${hpBar(curHp, maxHp)}] ${curHp}/${maxHp} HP\n`;
    });
  }

  msg += `\n*ACTIONS:*\n`;
  msg += `⚔️ \`${botConfig.getPrefix()} combat atk <#>\`\n`;
  msg += `✨ \`${botConfig.getPrefix()} combat skill <#>\`\n`;
  msg += `🎒 \`${botConfig.getPrefix()} combat item <#>\`\n`;
  msg += `🛡️ \`${botConfig.getPrefix()} combat def\`\n`;

  if (usableItems.length > 0) {
    msg += `\n*BAG:*\n`;
    usableItems.slice(0, 3).forEach((item, i) => {
      const info = {
        ...lootSystem.getItemInfo(item.id),
        ...(CONSUMABLES[item.id] || {})
      };
      msg += `${i + 1}. ${info.name} x${item.quantity}\n`;
    });
    if (usableItems.length > 3)
      msg += `...+${usableItems.length - 3} more (${botConfig.getPrefix()} combat item)\n`;
  } else {
    msg += `_No usable items_\n`;
  }

  try {
    await sock.sendMessage(state.chatId, { text: msg });
  } catch (err) {
    console.error(
      "Failed to send player prompt in promptPlayerAction:",
      err.message,
    );
  }

  // 💡 NEW TURN WAITING LOGIC
  // Create a promise that resolves when the player takes an action
  return new Promise((resolve) => {
    const turnTime = state.solo
      ? 120000
      : state.actionJustTaken
        ? 120000
        : GAME_CONFIG.COMBAT_TURN_TIME;
    state.actionJustTaken = false;

    // Save resolve function to the state so handleCombatAction can call it
    state.resolveTurn = resolve;

    state.timers.combat = setTimeout(async () => {
      if (
        state.inCombat &&
        state.activeCombatant?.jid === player.jid &&
        !state.pendingActions[player.jid]
      ) {
        try {
          await performAction(sock, player, { type: "defend" }, sessionKey);
        } catch (err) {
          console.error("Error in combat timeout defend:", err.message);
        }
        resolve(); // Resolve promise after auto-defend
      }
    }, turnTime);
  });
}

async function performAction(sock, player, action, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;

  const chatId = state.chatId;

  // Clear the turn timer
  if (state.timers.combat) {
    clearTimeout(state.timers.combat);
    state.timers.combat = null;
  }

  const icon = player.class?.icon || "👤";
  let resultMsg = `${icon} ${player.name}: `;
  let turnInfo = {
    turnNumber: state.turnCount,
    actor: player,
    action: { name: "Basic Attack" },
    target: null,
    damage: 0,
    healing: 0,
    effects: [],
  };

  if (action.type === "attack") {
    // Default to first alive enemy if no explicit target given
    if (
      action.targetIndex === undefined ||
      action.targetIndex === null ||
      action.targetIndex < 0
    ) {
      action.targetIndex = state.enemies.findIndex((e) => e.stats.hp > 0);
    }
    const target = state.enemies[action.targetIndex];
    if (!target || target.stats.hp <= 0) {
      // Auto-redirect to first alive enemy
      const aliveIdx = state.enemies.findIndex((e) => e.stats.hp > 0);
      if (aliveIdx >= 0) action.targetIndex = aliveIdx;
    }
    const resolvedTarget = state.enemies[action.targetIndex];
    if (!resolvedTarget || resolvedTarget.stats.hp <= 0) {
      resultMsg += `❌ No valid targets!`;
    } else {
      // 💡 Get weapon element
      const mainHand = player.equipment?.main_hand;
      const element = mainHand
        ? lootSystem.getItemInfo(mainHand.id)?.element || "PHYSICAL"
        : "PHYSICAL";

      const { damage, isCrit, wasEvaded, noDamageReason } = calculateDamage(
        player,
        resolvedTarget,
        player.stats.atk,
        "physical",
        element,
        sessionKey,
      );

      if (noDamageReason) {
        resultMsg += noDamageReason;
        turnInfo.action = { name: "Failed Attack" };
      } else if (wasEvaded) {
        resultMsg += `💨 *MISS!* ${resolvedTarget.icon} ${resolvedTarget.name} evaded the attack.`;
        turnInfo.action = { name: "Missed Attack" };
      } else {
        resolvedTarget.stats.hp -= damage;
        resolvedTarget.currentHP = Math.max(0, resolvedTarget.stats.hp);

        const durabilitySystem = require('./durabilitySystem');
        durabilitySystem.applyWear(player, 'main_hand', { combatHistory: state.combatHistory });
        if (player.equipment?.off_hand) {
            const offHandInfo = lootSystem.getItemInfo(player.equipment.off_hand.id);
            if (offHandInfo && offHandInfo.type === 'EQUIPMENT' && (offHandInfo.slot === 'weapon' || offHandInfo.slot === 'main_hand' || offHandInfo.slot === 'off_hand')) {
                durabilitySystem.applyWear(player, 'off_hand', { combatHistory: state.combatHistory });
            }
        }

        if (resolvedTarget.stats.hp > 0 && resolvedTarget.isBoss) {
          await checkBossPhase(sock, resolvedTarget, state.chatId);
        }

        if (resolvedTarget.stats.hp <= 0) resolvedTarget.justDied = true;

        player.combatStats.damageDealt += damage;
        resolvedTarget.combatStats = resolvedTarget.combatStats || {
          damageTaken: 0,
        };
        resolvedTarget.combatStats.damageTaken += damage;

        resultMsg += `${isCrit ? "💥 CRITICAL! " : ""}Strikes ${resolvedTarget.icon} ${resolvedTarget.name} for *${damage}* damage!`;

        // ⚔️ Weapon & Equipment Passive Triggers on Hit
        const weaponId = player.equipment?.main_hand?.id || player.equipment?.main_hand;
        const glovesId = player.equipment?.gloves?.id || player.equipment?.gloves;

        if (weaponId === "void_kraken_harpoon" || weaponId === "void_kraken_cleaver") {
          if (Math.random() < 0.25) {
            applyStatusEffect(resolvedTarget, "curse", 3, 20);
            resultMsg += `\n🌌 *Void Kraken Reality Warp:* ${resolvedTarget.name} is cursed by the abyss! (-20% stats)`;
          }
        } else if (weaponId === "hellfire_greatmaul") {
          if (Math.random() < 0.30) {
            applyStatusEffect(resolvedTarget, "burn", 3, 15);
            resultMsg += `\n🔥 *Hellfire Impact:* Sulfur explodes, setting ${resolvedTarget.name} on fire!`;
          }
        } else if (weaponId === "worldender_lance") {
          if (Math.random() < 0.20) {
            applyStatusEffect(resolvedTarget, "burn", 2, 15);
            applyStatusEffect(resolvedTarget, "slow", 2, 50);
            resultMsg += `\n☄️ *World-Ender Cataclysm:* ${resolvedTarget.name} is set on fire and slowed!`;
          }
        } else if (weaponId === "dragonfang_claymore" || weaponId === "dragon_fang_dagger" || weaponId === "wyrmtail_greatsword") {
          if (isCrit || Math.random() < 0.30) {
            applyStatusEffect(resolvedTarget, "bleed", 3, 12);
            resultMsg += `\n🩸 *Dragon-Fang Rip:* The jagged edge causes ${resolvedTarget.name} to bleed!`;
          }
        } else if (weaponId === "mirroredged_rapier") {
          if (Math.random() < 0.25) {
            const extraDmg = Math.max(1, Math.floor(damage * 0.5));
            resolvedTarget.stats.hp -= extraDmg;
            resolvedTarget.currentHP = Math.max(0, resolvedTarget.stats.hp);
            player.combatStats.damageDealt += extraDmg;
            resultMsg += `\n⚡ *Mirror Double Strike:* An invisible second strike deals *${extraDmg}* extra damage!`;
            if (resolvedTarget.stats.hp <= 0) resolvedTarget.justDied = true;
          }
        } else if (weaponId === "rusty_dagger") {
          if (Math.random() < 0.10) {
            applyStatusEffect(resolvedTarget, "bleed", 1, 5);
            resultMsg += `\n🩸 *Rusty Scratch:* ${resolvedTarget.name} starts bleeding slightly!`;
          }
        } else if (weaponId === "iron_sword") {
          if (Math.random() < 0.15) {
            applyStatusEffect(resolvedTarget, "bleed", 2, 8);
            resultMsg += `\n🩸 *Laceration:* ${resolvedTarget.name} is bleeding!`;
          }
        } else if (weaponId === "steel_sabre") {
          if (Math.random() < 0.20) {
            applyStatusEffect(player, "haste", 2, 30);
            resultMsg += `\n⚡ *Sabre Flow:* Player gains Haste! (+30% Speed)`;
          }
        } else if (weaponId === "crystal_staff" || weaponId === "arcane_wand") {
          if (Math.random() < 0.20) {
            player.stats.energy = Math.min(player.stats.maxEnergy, (player.stats.energy || 0) + 15);
            resultMsg += `\n✨ *Mana Siphon:* Restored 15 energy!`;
          }
        } else if (weaponId === "greatsword") {
          if (Math.random() < 0.15) {
            applyStatusEffect(resolvedTarget, "stun", 1);
            resultMsg += `\n💫 *Heavy Impact:* ${resolvedTarget.name} is stunned!`;
          }
        }

        // Glove status effects
        if (glovesId === "voidtouched_grips") {
          if (Math.random() < 0.15) {
            applyStatusEffect(resolvedTarget, "slow", 2, 30);
            resultMsg += `\n🌌 *Void Phase:* ${resolvedTarget.name} is slowed by abyssal cold!`;
          }
        } else if (glovesId === "eelspike_gauntlets") {
          if (Math.random() < 0.15) {
            applyStatusEffect(resolvedTarget, "stun", 1);
            resultMsg += `\n⚡ *Eel-Spike Shock:* Static discharges, stunning ${resolvedTarget.name}!`;
          }
        }

        turnInfo.action = { name: "Basic Attack" };
        turnInfo.target = resolvedTarget;
        turnInfo.damage = damage;
        if (isCrit) turnInfo.effects.push("CRITICAL");

        if (resolvedTarget.stats.hp <= 0) {
          // 💡 OVERKILL EXECUTION BONUS
          const overkillThreshold = resolvedTarget.stats.hp + damage;
          if (damage > overkillThreshold * 2.0) {
            const bonusGold = Math.floor(resolvedTarget.goldReward * 0.1) || 50;
            player.goldEarned = (player.goldEarned || 0) + bonusGold;
            resultMsg += `\n⚡ *OVERKILL!* +${bonusGold} Zeni bonus!`;
          }

          resolvedTarget.isDead = true;
          resolvedTarget.stats.hp = 0;
          resolvedTarget.currentHP = 0;
          resultMsg += `\n💀 *${resolvedTarget.name}* defeated!`;
          player.combatStats.kills = (player.combatStats.kills || 0) + 1;
          recordEnemyKill(state, resolvedTarget);

          state.combatHistory.push(resultMsg);
          delete state.pendingActions[player.jid];

          if (await checkCombatEnd(sock, state, sessionKey)) {
            // 💡 Send message BEFORE ending combat so player always sees result
            try {
              await sock.sendMessage(state.chatId, { text: resultMsg });
            } catch (e) {}

            // 💡 Always show the turn image, even on a one-shot kill, before the victory screen
            try {
              await nextTurn(sock, turnInfo, sessionKey);
            } catch (e) {}

            // Combat ended - resolve the turn promise so the loop can clean up
            if (state.resolveTurn) {
              const r = state.resolveTurn;
              state.resolveTurn = null;
              r();
            }
            return;
          }
        }
      }
    }
  } else if (action.type === "rest") {
    const energyRegen = 15;
    player.stats.energy = Math.min(
      player.stats.maxEnergy,
      player.stats.energy + energyRegen,
    );
    resultMsg += `🧘 *RESTED* and recovered ⚡ ${energyRegen} Energy.`;
    turnInfo.action = { name: "Rest" };
    turnInfo.effects.push("REGEN");
  } else if (action.type === "flee") {
    const avgPlayerSpd =
      state.players.reduce((s, p) => s + (p.stats.spd || 10), 0) /
      state.players.length;
    const avgEnemySpd =
      state.enemies.reduce((s, e) => s + (e.stats.spd || 10), 0) /
      state.enemies.length;

    const successChance = (avgPlayerSpd / avgEnemySpd) * 60;
    if (Math.random() * 100 < successChance) {
      resultMsg += `🏃 Party successfully escaped from combat!`;
      state.inCombat = false;
      state.active = false;
    } else {
      resultMsg += `❌ *FLEE FAILED!* The party stumbled and lost their turns.`;
    }
    turnInfo.action = { name: "Flee" };
  } else if (action.type === "defend") {
    applyStatusEffect(player, "shield", 1, Math.floor(player.stats.def * 1.5));
    resultMsg += `🛡️ Takes a defensive stance!`;
    turnInfo.action = { name: "Defend" };
    turnInfo.effects.push("SHIELD");
  } else if (action.type === "ability") {
    if (action.result) {
      resultMsg = action.result.message;
      if (action.result.damage)
        player.combatStats.damageDealt =
          (player.combatStats.damageDealt || 0) + action.result.damage;
      if (action.result.healing)
        player.combatStats.healed =
          (player.combatStats.healed || 0) + action.result.healing;

      turnInfo.action = { name: action.result.abilityName || "Ability" };
      turnInfo.damage = action.result.damage || 0;
      turnInfo.healing = action.result.healing || 0;
    } else {
      resultMsg += `✨ Uses ability!`;
      turnInfo.action = { name: "Ability" };
    }
  } else if (action.type === "item") {
    const itemKey = action.itemId;
    const itemInfo = lootSystem.getItemInfo(itemKey);
    const shopInfo = CONSUMABLES[itemKey];

    // Merge item properties with CONSUMABLES to resolve usable status and details for shop-only items
    const item = {
      ...itemInfo,
      ...(shopInfo || {}),
      usable: (itemInfo && itemInfo.usable) || !!shopInfo
    };

    if (!item || !item.usable) {
      resultMsg += `❌ Invalid item!`;
    } else {
      inventorySystem.removeItem(player.jid, itemKey, 1);
      let target;
      const isNegative = [
        "damage_aoe",
        "apply_poison",
        "freeze_enemy",
        "flee",
        "bribe",
        "percent_hp_damage",
      ].includes(item.effect);
      if (action.targetIndex !== undefined) {
        target = isNegative
          ? state.enemies[action.targetIndex]
          : state.players.find(
              (p) =>
                !p.isDead && state.players.indexOf(p) === action.targetIndex,
            );
      } else {
        target = isNegative
          ? state.enemies.find((e) => e.stats.hp > 0)
          : player;
      }

      if (
        !target &&
        item.effect !== "damage_aoe" &&
        item.effect !== "team_revive"
      ) {
        resultMsg += `❌ Target not found!`;
      } else {
        resultMsg += `🎒 Uses *${item.name}*! `;
        turnInfo.action = { name: item.name };

        switch (item.effect) {
          case "heal":
            const hMult = getHealMult(sessionKey);
            const healVal = (item.effectValue || 0.3) * hMult; // Adjusted by environment
            const healAmt = Math.floor(target.stats.maxHp * healVal);
            const actualHeal = Math.min(
              healAmt,
              target.stats.maxHp - target.stats.hp,
            );
            target.stats.hp += actualHeal;
            target.currentHP = target.stats.hp; // Sync
            resultMsg += `\n💖 Restored ${actualHeal} HP to ${target.name}! (${Math.round(healVal * 100)}%)${hMult < 1 ? " (Healing Reduced)" : ""}`;
            turnInfo.healing = actualHeal;

            if (itemKey === "elixir" || item.cureStatus) {
              const beforeCount = target.statusEffects ? target.statusEffects.length : 0;
              if (beforeCount > 0) {
                const negativeEffects = ["poison", "burn", "bleed", "freeze", "stun", "sleep", "root", "slow", "curse", "weak", "vulnerability"];
                target.statusEffects = target.statusEffects.filter(s => !negativeEffects.includes(s.type));
                const clearedCount = beforeCount - target.statusEffects.length;
                if (clearedCount > 0) {
                  resultMsg += `\n✨ Cured ${clearedCount} negative status effect(s)!`;
                }
              }
            }
            break;
          case "cure_status":
            if (target) {
              const beforeCount = target.statusEffects ? target.statusEffects.length : 0;
              if (beforeCount > 0) {
                const negativeEffects = ["poison", "burn", "bleed", "freeze", "stun", "sleep", "root", "slow", "curse", "weak", "vulnerability"];
                target.statusEffects = target.statusEffects.filter(s => !negativeEffects.includes(s.type));
                const clearedCount = beforeCount - target.statusEffects.length;
                if (clearedCount > 0) {
                  resultMsg += `\n✨ Cured all negative status effects on ${target.name}! (Cleared: ${clearedCount})`;
                } else {
                  resultMsg += `\n(No negative status effects to cure on ${target.name})`;
                }
              } else {
                resultMsg += `\n(No negative status effects to cure on ${target.name})`;
              }
            }
            break;
          case "regen":
            const regVal = item.effectValue || 0.1;
            const regAmt = Math.floor(target.stats.maxHp * regVal);
            applyStatusEffect(target, "regen", item.duration || 3, regAmt);
            resultMsg += `\n🧴 Applied regeneration salve to ${target.name}! (+${regAmt} HP/turn)`;
            break;
          case "restore_energy":
            const enVal = item.effectValue || 0.4;
            const maxEn = target.stats.maxEnergy || 100;
            const enAmt = Math.floor(maxEn * enVal);
            target.stats.energy = Math.min(maxEn, target.stats.energy + enAmt);
            target.currentEnergy = target.stats.energy;
            resultMsg += `\n⚡ Restored ${enAmt} energy to ${target.name}! (${Math.round(enVal * 100)}%)`;
            break;
          case "buff_atk":
            applyStatusEffect(target, "blessing", 3, item.effectValue || 0);
            resultMsg += `\n💪 Buffed ${target.name}'s attack!`;
            break;
          case "buff_def":
            applyStatusEffect(target, "shield", 3, item.effectValue || 0);
            resultMsg += `\n🛡️ Buffed ${target.name}'s defense!`;
            break;
          case "buff_spd":
            applyStatusEffect(target, "haste", 3, item.effectValue || 0);
            resultMsg += `\n⚡ Buffed ${target.name}'s speed!`;
            break;
          case "buff_luck":
            applyStatusEffect(target, "blessing", 3, item.effectValue || 0);
            resultMsg += `\n🍀 Buffed ${target.name}'s luck!`;
            break;
          case "buff_all":
            applyStatusEffect(
              target,
              "blessing",
              item.duration || 3,
              item.effectValue || 20,
            );
            applyStatusEffect(target, "haste", item.duration || 3, 20);
            resultMsg += `\n✨ ${target.name} is overflowing with power! (+All Stats)`;
            break;
          case "buff_all_damage":
            applyStatusEffect(target, "berserk", 2, item.effectValue || 50);
            resultMsg += `\n💥 ${target.name} enters a BERSERKER RAGE! (+Damage, -Defense)`;
            break;
          case "shield_max":
            applyStatusEffect(target, "shield", 5, 100); // Massive shield
            resultMsg += `\n🛡️ ${target.name} is encased in a massive energy barrier!`;
            break;
          case "damage_aoe":
          case "aoe_damage":
            for (const e of state.enemies) {
              if (e.stats.hp > 0) {
                const dmg = item.effectValue || 80;
                e.stats.hp -= dmg;
                e.currentHP = e.stats.hp; // Sync
                player.combatStats.damageDealt =
                  (player.combatStats.damageDealt || 0) + dmg;
                resultMsg += `\n💥 ${e.name} takes ${dmg} damage!`;
                if (e.stats.hp <= 0) {
                  await handleDeath(sock, e, sessionKey, player.name);
                  resultMsg += `\n💀 ${e.name} has fallen!`;
                }
              }
            }
            turnInfo.damage = item.effectValue || 80;
            break;
          case "aoe_debuff_damage":
            for (const e of state.enemies) {
              if (e.stats.hp > 0) {
                const dmg = item.effectValue || 150;
                e.stats.hp -= dmg;
                e.currentHP = e.stats.hp;
                applyStatusEffect(e, "vulnerability", 3, 20);
                resultMsg += `\n💥 ${e.name} takes ${dmg} damage and is weakened!`;
                if (e.stats.hp <= 0) {
                  await handleDeath(sock, e, sessionKey, player.name);
                }
              }
            }
            break;
          case "percent_hp_damage":
            // True damage based on % of Max HP (ignores defense)
            const rawDmg = Math.floor(
              target.stats.maxHp * (item.effectValue || 0.25),
            );
            // Counterplay: Bomb resistance check
            const finalDmg = target.stats.bomb_resistance
              ? Math.floor(rawDmg * 0.5)
              : rawDmg;
            target.stats.hp -= finalDmg;
            target.currentHP = target.stats.hp;
            player.combatStats.damageDealt =
              (player.combatStats.damageDealt || 0) + finalDmg;
            resultMsg += `\n💥 The Abyssal Detonator consumes ${target.name}! Dealt ${finalDmg} TRUE damage!`;
            turnInfo.damage = finalDmg;
            if (target.stats.hp <= 0) {
              await handleDeath(sock, target, sessionKey, player.name);
              resultMsg += `\n💀 ${target.name} has fallen!`;
            }
            break;
          case "flee":
            resultMsg += `\n💨 The smoke bomb creates a diversion! The party escapes!`;
            try {
              await sock.sendMessage(state.chatId, { text: resultMsg });
            } catch (e) {}
            return endAdventure(sock, sessionKey, false); // End without victory but alive
          case "revive":
            if (target.isDead) {
              target.isDead = false;
              const revivePct = item.effectValue || 0.5;
              target.stats.hp = Math.floor(target.stats.maxHp * revivePct);
              target.currentHP = target.stats.hp; // Sync
              resultMsg += `\n🪶 Revived ${target.name}! (${Math.round(revivePct * 100)}% HP)`;
              turnInfo.healing = target.stats.hp;
            } else {
              resultMsg += `\n(Target was already alive)`;
            }
            break;
          default:
            resultMsg += `\n(Item effect activated)`;
        }
      }
    }
  }

  // Send player action result as text so it's always visible
  try {
    await sock.sendMessage(state.chatId, { text: resultMsg });
  } catch (e) {}
  state.combatHistory.push(resultMsg);

  // Clear action after it is executed
  delete state.pendingActions[player.jid];

  // Set flag for next turn timer adjustment
  if (!state.solo) {
    state.actionJustTaken = true;
  }

  // Process the turn image update BEFORE resolving so state is consistent
  try {
    await nextTurn(sock, turnInfo, sessionKey);
  } catch (err) {
    console.error("[Combat] nextTurn failed in performAction:", err.message);
  }

  // 💡 BUG FIX: Check combat end for all action types after the turn messages have been sent.
  if (action.type === "ability" || action.type === "attack" || action.type === "item") {
    if (await checkCombatEnd(sock, state, sessionKey)) {
      if (state.resolveTurn) {
        const r = state.resolveTurn;
        state.resolveTurn = null;
        r();
      }
      return;
    }
  }

  // NOW resolve - safe to advance the loop since current turn is fully processed
  if (state.resolveTurn) {
    const resolve = state.resolveTurn;
    state.resolveTurn = null;
    resolve();
  }
}
async function performEnemyAction(sock, enemy, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state || !state.inCombat) return;

  const chatId = state.chatId;
  const turnDelay = state.solo ? 0 : GAME_CONFIG.ENEMY_TURN_TIME;

  return new Promise(async (resolve) => {
    try {
      // 🧠 AI DECISION MAKING
      const decision = monsterSkills.evaluateAction(
        enemy,
        state.players,
        state.enemies,
      );

      let turnInfo = {
        actor: enemy,
        action: { name: "Action" },
        target: null,
        damage: 0,
        effects: [],
        turnNumber: state?.turnCount || 0,
      };

      // --- RELEASE CHARGE ---
      if (decision.action === "release_charge") {
        const skillId = decision.skillId;
        const skillData = monsterSkills.getSkillById(enemy.archetype, skillId);

        if (skillData && skillData.nextSkill) {
          const followUpId = skillData.nextSkill;
          const followUpSkill = monsterSkills.getSkillById(
            enemy.archetype,
            followUpId,
          );
          const target =
            enemy.chargeTarget || state.players.find((p) => !p.isDead);

          try {
            await sock.sendMessage(chatId, {
              text: `💥 *${enemy.name}* UNLEASHES THE CHARGE!`,
            });
          } catch (err) {}

          const effect =
            followUpSkill.currentEffect ||
            followUpSkill.effect(enemy.level || 1);
          const abilityRes = await applyAbilityEffect(
            sock,
            enemy,
            followUpSkill,
            effect,
            state.players.indexOf(target),
            chatId,
          );
          if (await checkCombatEnd(sock, state, sessionKey)) {
            resolve();
            return;
          }

          turnInfo.action.name = followUpSkill.name;
          turnInfo.target = target;
          enemy.isCharging = false;
          enemy.chargingSkill = null;
          enemy.chargeTarget = null;

          // 💡 BUG FIX (same as skill flow): send the charge-release damage
          // breakdown immediately instead of only queueing it in roundLog.
          const statusPrefix = state.pendingStatusMsg ? state.pendingStatusMsg + '\n' : '';
          state.pendingStatusMsg = null;
          state.roundLog = state.roundLog || [];
          if (abilityRes && abilityRes.message) {
            const fullMsg = statusPrefix + `💥 *${enemy.name}* UNLEASHES THE CHARGE!\n\n${abilityRes.message.trim()}`;
            let sentImmediately = false;
            try {
              await sock.sendMessage(chatId, { text: fullMsg });
              sentImmediately = true;
            } catch (err) {}
            if (!sentImmediately) {
              state.roundLog.push(fullMsg);
            }
          } else {
            // No damage message (e.g. buff) — just log the charge release
            state.roundLog.push(statusPrefix + `💥 *${enemy.name}* UNLEASHES THE CHARGE!`);
          }
          setTimeout(() => resolve(), turnDelay);
          return;
        }
        // 💡 FIX: skillData missing or no nextSkill — clear charging state so
        // the enemy doesn't soft-lock in "isCharging=true" forever (which
        // caused performEnemyAction to keep returning release_charge, fall
        // through to default-attack, and never clear isCharging).
        console.warn(`[performEnemyAction] enemy ${enemy.id} was charging skill ${skillId} but no follow-up exists — clearing charge state`);
        enemy.isCharging = false;
        enemy.chargingSkill = null;
        enemy.chargeTarget = null;
        // Fall through to default attack below.
      }

      // --- USE SKILL ---
      if (decision.action === "skill") {
        const skill = decision.skill;
        const target = decision.target;

        // 💡 FIX: actually consume mana + set cooldown. Previously monsterSkills
        // checked these (monsterSkills.js:553-557) but performEnemyAction
        // never decremented them — so monsters had infinite mana AND never
        // put their own skills on cooldown, allowing ult spam every turn.
        if (typeof skill.cost === 'number' && skill.cost > 0) {
          enemy.mana = Math.max(0, (enemy.mana ?? 0) - skill.cost);
        }
        if (typeof skill.cooldown === 'number' && skill.cooldown > 0) {
          enemy.cooldowns = enemy.cooldowns || {};
          enemy.cooldowns[skill.id] = skill.cooldown;
        }

        if (skill.type === "charge") {
          enemy.isCharging = true;
          enemy.chargingSkill = skill.id;
          enemy.chargeTarget = target;
          try {
            await sock.sendMessage(chatId, {
              text: `⚠️ *${enemy.name}* ${skill.msg}`,
            });
          } catch (err) {}

          turnInfo.action.name = "Charging";
          // No image per enemy charge — push to roundLog
          const chargeStatusPrefix = state.pendingStatusMsg ? state.pendingStatusMsg + '\n' : '';
          state.pendingStatusMsg = null;
          state.roundLog = state.roundLog || [];
          state.roundLog.push(chargeStatusPrefix + `⚠️ *${enemy.name}* is charging up!`);
          setTimeout(() => resolve(), turnDelay);
          return;
        }

        const effect =
          skill.currentEffect ||
          (typeof skill.effect === "function"
            ? skill.effect(enemy.level || 1)
            : skill.effect);
        let targetIdx =
          decision.targetType === "ally" || decision.targetType === "self"
            ? state.enemies.indexOf(target)
            : state.players.indexOf(target);

        const abilityRes = await applyAbilityEffect(sock, enemy, skill, effect, targetIdx, chatId);
        if (await checkCombatEnd(sock, state, sessionKey)) {
          resolve();
          return;
        }

        turnInfo.action.name = skill.name;
        turnInfo.target = target;

        // 💡 BUG FIX: Send the enemy's full ability message (including damage
        // breakdown) IMMEDIATELY as a standalone message. Previously this was
        // only pushed to roundLog (flushed at the start of the player's next
        // turn), which caused users to see "Enemy uses X!" then the turn
        // prompt, then the damage log later — making it look like enemy
        // damage wasn't being shown.
        state.roundLog = state.roundLog || [];
        if (abilityRes && abilityRes.message) {
          // Build a combined message: announcement + damage breakdown
          const fullMsg = `⚡ *${enemy.name}* uses *${skill.name}*!\n\n${abilityRes.message.trim()}`;
          let sentImmediately = false;
          try {
            await sock.sendMessage(chatId, { text: fullMsg });
            sentImmediately = true;
          } catch (err) {}
          // Only push to roundLog if the immediate send failed (avoids
          // duplicate display when the round summary flushes at turn start).
          if (!sentImmediately) {
            state.roundLog.push(fullMsg);
          }
        }

        // No image per enemy skill — push to roundLog and resolve
        setTimeout(() => resolve(), turnDelay);
        return;
      }

      // --- FLEE (reactive mob AI — Phase 1) ---
      // When a regular mob is alone and critical HP, it may try to flee.
      // 50% chance of success — if successful, mob escapes (removed from
      // combat, no XP/gold for that mob). If failed, mob wastes its turn.
      if (decision.action === 'flee') {
        const fleeSuccess = Math.random() < 0.50;
        if (fleeSuccess) {
          try {
            await sock.sendMessage(chatId, {
              text: `💨 *${enemy.name}* FLEES from combat!\n_The enemy escaped — no rewards for this kill._`,
            });
          } catch (e) {}
          enemy.isDead = true;
          enemy.currentHP = 0;
          enemy.fled = true;
          // 💡 QA FIX: must also set enemy.stats.hp = 0 — checkCombatEnd
          // and the action-gauge loop check `c.stats.hp <= 0`, not
          // `c.isDead`. Without this, a "fled" mob keeps gaining action
          // gauge and taking turns (attacking, healing, fleeing again).
          if (enemy.stats) enemy.stats.hp = 0;
          // Check if combat should end (all enemies dead)
          if (await checkCombatEnd(sock, state, sessionKey)) {
            resolve();
            return;
          }
          setTimeout(() => resolve(), turnDelay);
          return;
        } else {
          try {
            await sock.sendMessage(chatId, {
              text: `💨 *${enemy.name}* tries to flee but FAILS!\n_The enemy wasted its turn in panic._`,
            });
          } catch (e) {}
          setTimeout(() => resolve(), turnDelay);
          return;
        }
      }

      // --- DEFAULT ATTACK ---
      let target = decision.target;
      if (!target || target.isDead) {
        const alive = state.players.filter((p) => !p.isDead);
        if (alive.length === 0) {
          setTimeout(() => resolve(), turnDelay);
          return;
        }
        target = alive[0];
      }

      const { damage, isCrit, wasEvaded } = calculateDamage(
        enemy,
        target,
        enemy.stats.atk,
        "physical",
        "PHYSICAL",
        sessionKey,
      );

      let resultMsg = `${enemy.icon} *${enemy.name}* `;
      if (wasEvaded) {
        resultMsg += `attacks ${target.name} but 💨 MISSES!`;
      } else {
        target.stats.hp -= damage;
        target.currentHP = Math.max(0, target.stats.hp);

        const durabilitySystem = require('./durabilitySystem');
        durabilitySystem.applyWear(target, 'ARMOR_PIECES', { combatHistory: state.combatHistory, amount: 0.5 });
        resultMsg += `attacks ${target.name} for 💥 ${damage} damage!${isCrit ? " (CRIT!)" : ""}`;
        turnInfo.damage = damage;
        turnInfo.target = target;

        // 🛡️ Player Equipment Passive Triggers on Hit (Defensive)
        const targetArmor = target.equipment?.armor?.id || target.equipment?.armor;
        const targetShield = target.equipment?.off_hand?.id || target.equipment?.off_hand;
        const targetHelm = target.equipment?.helmet?.id || target.equipment?.helmet;

        if (targetShield === "aegis_of_the_abyss" || targetShield === "abyssal_bulwark" || targetShield === "mirror_shield_of_tartarus") {
          if (Math.random() < 0.20) {
            applyStatusEffect(target, "shield", 1, 50);
            resultMsg += `\n🛡️ *Aegis Core Pulse:* ${target.name} absorbs energy into a Shield! (+50 Shield)`;
          }
        } else if (targetShield === "colossal_titan_shield" || targetShield === "dragonscale_kite_shield" || targetShield === "aegis_of_the_golem_king") {
          if (Math.random() < 0.20) {
            applyStatusEffect(target, "shield", 1, 35);
            resultMsg += `\n🛡️ *Titan Shielding:* ${target.name} gains a Shield! (+35 Shield)`;
          }
        } else if (targetShield === "aegis_of_eternal_fire") {
          if (Math.random() < 0.25) {
            applyStatusEffect(enemy, "burn", 2, 15);
            resultMsg += `\n🔥 *Melting Shield:* Heat radiating from Aegis of Eternal Fire sets *${enemy.name}* on fire!`;
          }
        }

        if (targetArmor === "eelskin_hazard_suit") {
          if (Math.random() < 0.20) {
            applyStatusEffect(enemy, "stun", 1);
            resultMsg += `\n⚡ *Static Discharge:* Electrical current cycles into *${enemy.name}*, stunning them!`;
          }
        } else if (targetArmor === "dragon_scale_armor" || targetArmor === "dragon_scale_mail") {
          if (Math.random() < 0.20) {
            const healAmt = Math.floor(damage * 0.25);
            if (healAmt > 0) {
              target.stats.hp = Math.min(target.stats.maxHp, target.stats.hp + healAmt);
              target.currentHP = target.stats.hp;
              resultMsg += `\n🩸 *Draconic Retribution:* Dragon scales convert kinetic energy, healing ${target.name} for *${healAmt}* HP!`;
            }
          }
        }

        if (targetHelm === "dragon_helm" || targetHelm === "great_wyrm_helm" || targetHelm === "helm_of_ancient_blood") {
          if (Math.random() < 0.15) {
            applyStatusEffect(enemy, "weak", 2, 20);
            resultMsg += `\n😱 *Dragon Fear:* The terrifying helm weakens *${enemy.name}*!`;
          }
        }

        if (target.stats.hp <= 0) {
          await handleDeath(sock, target, sessionKey, enemy.name);
          if (await checkCombatEnd(sock, state, sessionKey)) {
            resolve();
            return;
          }
          resultMsg += `\n💀 ${target.name} has fallen!`;
        }
      }

      const enemyStatusPrefix = state.pendingStatusMsg
        ? state.pendingStatusMsg + "\n"
        : "";
      state.pendingStatusMsg = null;
      const fullEnemyMsg = (enemyStatusPrefix ? enemyStatusPrefix + '\n' : '') + resultMsg;

      // 💡 BUG FIX: Send the enemy's default-attack message IMMEDIATELY.
      // Previously this was only pushed to roundLog (flushed at the start
      // of the player's next turn), so the user would see the enemy attack
      // result delayed — appearing AFTER the turn prompt instead of before
      // it. This made it look like enemy damage wasn't being shown.
      state.roundLog = state.roundLog || [];
      let sentImmediately = false;
      try {
        await sock.sendMessage(chatId, { text: fullEnemyMsg });
        sentImmediately = true;
      } catch (err) {}
      // Fallback: push to roundLog only if the immediate send failed.
      if (!sentImmediately) {
        state.roundLog.push(fullEnemyMsg);
      }

      // No image per enemy attack — roundLog is flushed before player's next prompt
      setTimeout(() => resolve(), turnDelay);
    } catch (error) {
      console.error(
        `[Combat] Critical error in performEnemyAction for ${enemy.name}:`,
        error,
      );
      setTimeout(() => resolve(), 1000);
    }
  });
}
async function checkBossPhase(sock, boss, chatId) {
  if (!boss.isBoss || !boss.phases) return null;

  const hpPct = (boss.stats.hp / (boss.stats.maxHp || boss.stats.hp)) * 100;
  const nextPhaseIdx = (boss.currentPhase || 0) + 1;
  const nextPhase = boss.phases[nextPhaseIdx];

  if (nextPhase && hpPct <= nextPhase.threshold) {
    boss.currentPhase = nextPhaseIdx;
    boss.abilities = nextPhase.abilities || boss.abilities;

    // Visual/Audio Feedback
    let msg = `🌟 *BOSS PHASE TRANSITION* 🌟\n\n`;
    msg += `${boss.icon} *${boss.name}*: ${nextPhase.message}\n`;

    // Apply phase effects
    if (nextPhase.effects) {
      nextPhase.effects.forEach((eff) => {
        if (eff.type === "stat_boost") {
          boss.stats[eff.stat] = Math.floor(
            boss.stats[eff.stat] * (1 + eff.value / 100),
          );
          msg += `\n📈 ${boss.name}'s ${eff.stat.toUpperCase()} increased!`;
        }
        if (eff.type === "heal") {
          boss.stats.hp = Math.min(boss.stats.maxHp, boss.stats.hp + eff.value);
          boss.currentHP = boss.stats.hp;
          msg += `\n💖 ${boss.name} recovered health!`;
        }
      });
    }

    try {
      await sock.sendMessage(chatId, { text: msg });
    } catch (err) {
      console.error(
        `[Combat] Failed to send boss phase message: ${err.message}`,
      );
    }
    return true;
  }
  return false;
}

// 💡 Helper: record an enemy kill across all tracking systems.
// Used by every kill path (handleDeath, basic attack, single-target ability,
// AOE sweep, multi-hit) so boss/dragon/undead/guild-board tracking can never
// drift out of sync again. (Previously only handleDeath called trackMissionStat,
// so 4 of 5 kill paths silently skipped rank-mission progress.)
// 💡 Rank order for boss kill gating — only bosses at your rank or 2 ranks below count
const RANK_ORDER_FOR_GATE = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'GOD'];

function recordEnemyKill(state, entity) {
  if (!state || !entity || !entity.isEnemy) return;
  state.stats.monstersKilled++;
  if (entity.isBoss) state.stats.bossesDefeated++;

  state.players.forEach((p) => {
    if (!p.jid || p.isDead) return;
    if (entity.isBoss) {
      // 💡 QA FIX: Rank-gate boss kills for rank-up missions.
      // Only bosses from dungeons at your rank or up to 2 ranks below count.
      // This prevents F-rank bosses from counting for S-rank players.
      const dungeonRank = state.dungeonRank || 'F';
      const dungeonRankIdx = RANK_ORDER_FOR_GATE.indexOf(dungeonRank === 'DRAGON' ? 'SSS' : dungeonRank);
      const user = economy.getUser(p.jid);
      const playerRank = user?.adventurerRank || 'F';
      const playerRankIdx = RANK_ORDER_FOR_GATE.indexOf(playerRank);
      const rankDiff = playerRankIdx - dungeonRankIdx;

      if (rankDiff > 2) {
        // Boss is too far below player's rank — doesn't count for missions
        // Still award guild XP + war points + rune drops, just not mission stat
        state.roundLog = state.roundLog || [];
        state.roundLog.push(`⚠️ Boss kill didn't count for rank missions (dungeon ${dungeonRank} is more than 2 ranks below your ${playerRank} rank).`);
      } else {
        economy.trackMissionStat(p.jid, 'bossesDefeated', 1);
      }

      // 💡 Phase 2: Award guild XP for boss kills (more than regular mobs)
      try {
        const guildPerks = require('./guildPerks');
        guildPerks.awardGuildXp(p.jid, 10, `Boss kill: ${entity.name || entity.id}`);
        guildPerks.awardWarPoints(p.jid, 50, 'boss kill');
      } catch (e) {}

      // 💡 Phase 3: Roll for rune drop on S+ bosses
      // S: 10%, SS: 15%, SSS: 25%, Dragon: 20%
      try {
        const runeSystem = require('./runeSystem');
        const bossLevel = entity.level || entity.stats?.level || 1;
        let runeDropChance = 0;
        if (entity.id && entity.id.toUpperCase().includes('DRAGON')) {
          runeDropChance = 0.20;
        } else if (bossLevel >= 100) {
          runeDropChance = 0.25; // SSS-rank
        } else if (bossLevel >= 90) {
          runeDropChance = 0.15; // SS-rank
        } else if (bossLevel >= 80) {
          runeDropChance = 0.10; // S-rank
        }
        if (runeDropChance > 0) {
          const drop = runeSystem.rollRuneDrop(runeDropChance);
          if (drop) {
            // awardRune is async but recordEnemyKill is sync — fire and forget,
            // log result to console. The rune will appear in the player's
            // inventory on next check; we can't display inline because this
            // function is called from sync kill paths.
            runeSystem.awardRune(p.jid, drop.type, drop.tier, 'boss_drop')
              .then(runeResult => {
                if (runeResult.success) {
                  console.log(`[RuneDrop] Awarded ${drop.type} (${drop.tier}) to ${p.jid} from boss drop`);
                }
              })
              .catch(e => console.error('[RuneDrop] Failed to award rune:', e.message));
          }
        }
      } catch (e) {
        console.error('[RuneDrop] Failed to roll rune drop:', e.message);
      }
    }
    // Total lifetime kills — required for DOOMSLAYER (req.kills: 500)
    economy.trackMissionStat(p.jid, 'kills', 1);
    // Dragon tracking — case-insensitive to handle the lowercase id bug
    // (bossMechanics has 'ancient_dragon_boss' lowercase, classEncounters
    // expects uppercase 'DRAGON' substring). Both forms now match.
    const eid = String(entity.id || '').toUpperCase();
    if (eid.startsWith('DRAKE') || eid.includes('DRAGON')) {
      economy.incrementDragonKills(p.jid, 1);
    }
    // Undead tracking — required for TEMPLAR ascension (req.undeadKills: 200)
    if (eid.includes('UNDEAD') || eid.includes('SKELETON') || eid.includes('ZOMBIE') || eid.includes('GHOUL') || eid.includes('WIGHT') || eid.includes('LICH') || eid.includes('NECRO')) {
      economy.trackMissionStat(p.jid, 'undeadKills', 1);
    }
    // Guild board progress for all kills
    const userGuild = guilds.getUserGuild(p.jid);
    if (userGuild) {
      guilds.updateBoardProgress(userGuild, entity.type, 1);
    }
  });
}

async function handleDeath(
  sock,
  entity,
  sessionKey,
  lastKiller = "The Infection",
) {
  const state = gameStates.get(sessionKey);
  if (!state) return;
  const chatId = state.chatId;
  entity.isDead = true;
  entity.stats.hp = 0;
  entity.currentHP = 0; // Sync
  entity.justDied = true;

  if (entity.isEnemy) {
    recordEnemyKill(state, entity);
  }

  if (!entity.isEnemy) {
    // Player death
    if (state.mode === "PERMADEATH" || state.mode === "HARDCORE") {
      // Callback to index.js to record in graveyard
      if (state.onHardcoreDeath) {
        state.onHardcoreDeath(
          entity.jid,
          entity.level,
          entity.class?.name || "Unknown",
          lastKiller,
        );
      }
      // Remove from game permanently
      state.players = state.players.filter((p) => p.jid !== entity.jid);
    }
  }
}

async function nextTurn(sock, lastTurnInfo = null, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state || !state.inCombat) return;

  // Generate incremental combat image if action just happened
  if (lastTurnInfo) {
    try {
      const scene = await combatIntegration.generateCombatScene(
        state.players,
        state.enemies,
        "TURN",
        {
          turnInfo: lastTurnInfo,
          backgroundPath: state.backgroundPath,
          rank: state.dungeonRank,
        },
      );
      if (scene.success) {
        try {
          if (scene.buffer) {
            await sock.sendMessage(state.chatId, {
              image: scene.buffer,
              caption: scene.caption,
            });
          } else if (scene.imagePath && fs.existsSync(scene.imagePath)) {
            await sock.sendMessage(state.chatId, {
              image: fs.readFileSync(scene.imagePath),
              caption: scene.caption,
            });
            setTimeout(() => {
              if (fs.existsSync(scene.imagePath))
                fs.unlinkSync(scene.imagePath);
            }, 5000);
          } else {
            await sock.sendMessage(state.chatId, { text: scene.caption });
          }
        } catch (msgErr) {
          console.error(
            "Failed to send turn image message in nextTurn:",
            msgErr.message,
          );
          try {
            await sock.sendMessage(state.chatId, { text: scene.caption });
          } catch {}
        }
      }
    } catch (err) {
      console.error(
        "Critical error in nextTurn image generation:",
        err.message,
      );
    }
  }
  // Note: checkCombatEnd is called explicitly by performAction and processCombatTurn - not needed here.
}

// ==========================================
// 🕳️ ABYSS COMBAT INTEGRATION
// ==========================================

/**
 * Start an Abyss combat encounter using the real combat engine.
 */
async function startAbyssCombat(sock, chatId, senderJid, enemy, abyssRun, floor) {
  const sessionKey = `${chatId}_${senderJid}`;

  if (gameStates.has(sessionKey)) {
    const existing = gameStates.get(sessionKey);
    if (existing.inCombat) {
      return { success: false, message: '❌ You are already in combat.' };
    }
  }

  const user = economy.getUser(senderJid);
  if (!user) return { success: false, message: '❌ You need to register first.' };

  const userClass = user.class || { id: 'FIGHTER', name: 'Fighter', icon: '⚔️' };
  const baseStats = progression.getBaseStats(senderJid, userClass.id || userClass.name?.toUpperCase());

  const player = {
    jid: senderJid,
    name: user.nickname || user.profile?.nickname || senderJid.split('@')[0],
    class: userClass,
    isDead: false,
    stats: {
      hp: baseStats.hp,
      maxHp: baseStats.hp,
      atk: baseStats.atk,
      def: baseStats.def,
      mag: baseStats.mag,
      spd: baseStats.spd,
      luck: baseStats.luck,
      crit: baseStats.crit,
      dmgReduction: baseStats.dmgReduction || 0,
      evasion: baseStats.evasion || 0,
      energy: baseStats.maxEnergy || 100,
      maxEnergy: baseStats.maxEnergy || 100,
    },
    equipment: inventorySystem.getEquipment(senderJid) || {},
    adventurerRank: user.adventurerRank || 'F',
    level: progression.getLevel(senderJid),
    currentHP: baseStats.hp,
    mana: 100,
    maxMana: 100,
    xpEarned: 0,
    goldEarned: 0,
    combatStats: { damageDealt: 0, damageTaken: 0, turnsTaken: 0 },
    pendingActions: {},
    buffs: [],
    statusEffects: [],
    actionGauge: 0,
  };

  // Carry over HP/energy from Abyss run
  if (abyssRun.currentHp) {
    player.stats.hp = Math.max(1, abyssRun.currentHp);
    player.currentHP = player.stats.hp;
  }
  if (abyssRun.currentEnergy) {
    player.stats.energy = Math.max(0, abyssRun.currentEnergy);
  }

  const combatEnemy = {
    id: enemy.id || `abyss_${floor}`,
    name: enemy.name,
    icon: enemy.isBoss ? '👹' : '👾',
    isEnemy: true,
    isBoss: enemy.isBoss || false,
    level: enemy.level || floor,
    stats: {
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      atk: enemy.atk,
      def: enemy.def,
      spd: enemy.spd,
      mag: enemy.atk,
    },
    currentHP: enemy.hp,
    maxHP: enemy.maxHp,
    mana: 100,
    maxMana: 100,
    archetype: enemy.isBoss ? 'BOSS' : 'BRUTE',
    abilities: [],
    statusEffects: [],
    cooldowns: {},
    actionGauge: 0,
    xpReward: 0,
    goldReward: 0,
    isDead: false,
    justDied: false,
  };

  const state = {
    chatId,
    players: [player],
    enemies: [combatEnemy],
    inCombat: false,
    combatProcessing: false,
    active: true,
    phase: 'COMBAT',
    solo: true,
    mode: 'ABYSS',
    isAbyss: true,
    abyssRun: abyssRun,
    abyssFloor: floor,
    encounter: 1,
    maxEncounters: 1,
    currentEncounterType: 'COMBAT',
    combatRound: 0,
    turnCount: 0,
    pendingActions: {},
    combatHistory: [],
    roundLog: [],
    timers: {},
    groq: null,
    sock_ref: sock,
    dungeonRank: 0,
    difficulty: 0,
    isProcessing: false,
    isEndingCombat: false,
  };

  gameStates.set(sessionKey, state);

  await startCombat(sock, null, { enemies: [combatEnemy], type: 'COMBAT' }, sessionKey);

  return { success: true };
}

/**
 * Handle Abyss victory — advance to next floor with new encounter.
 */
async function handleAbyssVictory(sock, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state || !state.isAbyss) return;

  const senderJid = state.players[0]?.jid;
  if (!senderJid) return;

  const abyssSystem = require('./abyssSystem');
  const run = state.abyssRun;
  if (!run) { deleteGameState(sessionKey); return; }

  // Update run with current HP/energy
  const player = state.players[0];
  run.currentHp = Math.max(1, player.stats.hp);
  run.currentEnergy = player.stats.energy || 0;
  run.monstersKilled = (run.monstersKilled || 0) + 1;
  if (state.enemies[0]?.isBoss) run.bossesKilled = (run.bossesKilled || 0) + 1;

  // Award rewards
  const rewards = abyssSystem.getFloorRewards(state.abyssFloor, state.enemies[0]?.isBoss);
  run.lootAccumulator.xp += rewards.xp;
  run.lootAccumulator.gold += rewards.gold;

  try {
    economy.trackMissionStat(senderJid, 'kills', 1);
    if (state.enemies[0]?.isBoss) economy.trackMissionStat(senderJid, 'bossesDefeated', 1);
  } catch (e) {}

  // Rune drop
  let runeMsg = '';
  if (state.enemies[0]?.isBoss && state.abyssFloor >= 21) {
    try {
      const runeSystem = require('./runeSystem');
      const dropChance = state.abyssFloor >= 50 ? 0.30 : 0.15;
      const drop = runeSystem.rollRuneDrop(dropChance);
      if (drop) {
        const runeResult = await runeSystem.awardRune(senderJid, drop.type, drop.tier, `abyss_floor_${state.abyssFloor}`);
        if (runeResult.success) {
          run.lootAccumulator.runes.push(runeResult.rune.runeId);
          runeMsg = '\n' + runeResult.message;
        }
      }
    } catch (e) {}
  }

  // Advance floor
  run.currentFloor = (run.currentFloor || state.abyssFloor) + 1;
  const newFloor = run.currentFloor;
  run.currentEnergy = Math.min(run.playerSnapshot?.maxEnergy || 100, run.currentEnergy + 20);

  // Generate next encounter
  const encounter = abyssSystem.generateFloorEncounter(newFloor);
  if (encounter.type === 'combat') {
    run.currentEnemy = encounter.enemy;
    run.currentEncounterType = 'combat';
    run.currentEncounterData = null;
  } else {
    run.currentEnemy = null;
    run.currentEncounterType = encounter.type;
    run.currentEncounterData = encounter.treasure || encounter.event;
  }
  await run.save();

  // Clean up old state
  deleteGameState(sessionKey);

  // Build and send message
  let msg = `✅ *Floor ${state.abyssFloor} cleared!*\n`;
  msg += `🎁 +${rewards.xp} XP, +${rewards.gold} Zeni${runeMsg}\n`;
  msg += `❤️ HP: ${run.currentHp}/${run.playerSnapshot?.maxHp || '?'}\n\n`;

  if (encounter.type === 'combat') {
    msg += `🕳️ *Floor ${newFloor}* — ${encounter.enemy.name}\n`;
    msg += `HP: ${encounter.enemy.hp}/${encounter.enemy.maxHp}\n`;
    msg += `_Use \`.g combat attack\` to fight!_`;
    try { await sock.sendMessage(state.chatId, { text: msg }); } catch (e) {}
    await startAbyssCombat(sock, state.chatId, senderJid, encounter.enemy, run, newFloor);
  } else if (encounter.type === 'treasure') {
    msg += `${encounter.treasure.icon} *Floor ${newFloor}* — ${encounter.treasure.name}\n`;
    msg += `_${encounter.treasure.desc}_\n\n`;
    msg += `_Collect with \`.g abyss collect\` | Skip with \`.g abyss skip\`_`;
    try { await sock.sendMessage(state.chatId, { text: msg }); } catch (e) {}
  } else if (encounter.type === 'event') {
    msg += `${encounter.event.icon} *Floor ${newFloor}* — ${encounter.event.name}\n`;
    msg += `_${encounter.event.desc}_\n\n`;
    encounter.event.choices.forEach(c => { msg += `\`${c.id}\` — ${c.text}\n`; });
    msg += `\n_Choose with \`.g abyss choose <1/2>\`_`;
    try { await sock.sendMessage(state.chatId, { text: msg }); } catch (e) {}
  }
}

async function endCombat(sock, victory, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state || state.isEndingCombat) return;
  state.isEndingCombat = true; // Guard to prevent double processing

  const chatId = state.chatId;
  console.log(
    `[Quest] Combat ended. Victory: ${victory}, Encounter: ${state.encounter}/${state.maxEncounters}`,
  );
  state.inCombat = false;

  // Calculate rewards
  const totalXP = state.enemies.reduce((sum, e) => {
    const xpVal = Number(e.xp || e.xpReward || 0);
    return sum + (isNaN(xpVal) ? 0 : xpVal);
  }, 0);

  const totalGold =
    state.enemies.reduce((sum, e) => {
      let goldVal = 0;
      if (e.gold) goldVal = Number(e.gold);
      else if (e.goldReward) {
        if (Array.isArray(e.goldReward)) {
          const [min, max] = e.goldReward;
          goldVal =
            Math.floor(Math.random() * (Number(max) - Number(min) + 1)) +
            Number(min);
        } else {
          goldVal = Number(e.goldReward);
        }
      }
      return sum + (isNaN(goldVal) ? 0 : goldVal);
    }, 0) * (5 + (state.difficulty || 1)); // 💡 FIX: Scale gold multiplier with
    // dungeon difficulty. Was a flat 3x historically; now scales as (5 + difficulty):
    //   F=5.8×, E=6.2×, D=8×, C=10×, B=15×, A=23×, S=40×, SS=80×, SSS=85×
    // This makes high-rank dungeons significantly more rewarding.

  // Distribute rewards
  const alivePlayers = state.players.filter((p) => !p.isDead);
  const playerCount = Math.max(1, alivePlayers.length);
  const xpPerPlayer = Math.floor(totalXP / playerCount);
  const goldPerPlayer = Math.floor(totalGold / playerCount);

  const encounterType = state.currentEncounterType || "COMBAT";
  const bossName = state.enemies[0]?.type || state.enemies[0]?.id || null;

  // Distribute rewards — only when we have alive players (prevents jid crash on defeat)
  let lootResults = { items: [], gold: totalGold, announcements: [] };
  if (victory && alivePlayers.length > 0) {
    try {
      lootResults = await lootSystem.distributeLoot(
        alivePlayers,
        encounterType,
        bossName,
        state.difficulty,
        totalGold,
      );
    } catch (lootErr) {
      console.error("Loot distribution failed:", lootErr.message);
    }
  }

  const rewards = {
    gold: totalGold,
    xp: totalXP,
    items: (lootResults.items || []).map((item) => ({
      name: item.name || item.id,
    })),
  };

  // Generate text-only combat end message
  // Default caption now correctly respects the victory flag so defeat never shows "Victory!"
  let caption = victory ? "✅ Victory!" : "💀 Defeat...";
  try {
    if (combatIntegration && combatIntegration.generateEndCaption) {
      caption = combatIntegration.generateEndCaption(state.players, state.enemies, victory, rewards);
    }
  } catch (sceneErr) {
    console.error("End combat caption generation failed:", sceneErr.message);
    // Keep the safe default already set above
  }

  try {
    await sock.sendMessage(state.chatId, { text: caption });
  } catch (err) {
    console.error("Failed to send end combat text:", err.message);
  }

  if (victory) {
    // Clear flags for next stage
    state.isProcessing = false;

    for (const player of alivePlayers) {
      player.xpEarned += xpPerPlayer;
      player.goldEarned += goldPerPlayer;
      // Gold and Items are now handled inside lootSystem.distributeLoot

      const levelUpResult = progression.addXP(player.jid, xpPerPlayer, "Quest");

      // Fractional quest progress
      let progress = 0.05;
      if (state.enemies.some((e) => e.isBoss)) progress = 1.0;
      else if (state.enemies.some((e) => e.name.includes("Elite")))
        progress = 0.2;

      // 💡 QA FIX: was passing won=true per-combat, which incremented
      // questsWon by 1 for EVERY combat encounter in the dungeon.
      // Combined with the final-act call, a 5-encounter dungeon
      // incremented questsWon by 6. Now: pass won=false per-combat
      // (only progress is tracked), and the final-act call at
      // endAdventure passes won=true once.
      economy.addQuestProgress(player.jid, progress, false);
    }

    // 🟢 CLEAR all enemies and their states
    state.enemies.forEach((e) => {
      e.justDied = false;
    });

    // 💡 GUILD BOARD TRACKING
    const guilds_mod = require("./guilds");
    const firstPlayerGuild = guilds_mod.getUserGuild(alivePlayers[0]?.jid);
    if (firstPlayerGuild) {
      state.enemies.forEach((enemy) => {
        guilds_mod.updateBoardProgress(
          firstPlayerGuild,
          enemy.type || enemy.id,
          1,
        );
      });
    }

    setTimeout(
      () => {
        state.isEndingCombat = false; // Reset guard BEFORE calling nextStage

        // 💡 ABYSS MODE: On victory, advance Abyss floor instead of nextStage
        if (state.isAbyss) {
          handleAbyssVictory(sock, sessionKey).catch(e =>
            console.error('[Abyss] victory handler error:', e?.message || e)
          );
          return;
        }

        nextStage(sock, state.groq, sessionKey).catch((e) =>
          console.error("[Quest] nextStage error:", e?.message || e),
        );
      },
      state.solo ? 1000 : GAME_CONFIG.BREAK_TIME,
    ); // Added 1s delay for solo
  } else {
    state.isEndingCombat = false;

    // 💡 ABYSS MODE: On defeat, call Abyss processDeath instead of just
    // cleaning up. The Abyss has its own death handling (lose 90% loot,
    // update leaderboard, set cooldown).
    if (state.isAbyss) {
      try {
        const abyssSystem = require('./abyssSystem');
        // Build a death message from the combat state
        const deathMsg = `💀 Defeated on Abyss floor ${state.abyssFloor || 1}!`;
        await abyssSystem.processDeath(state.players[0]?.jid, state.abyssRun, deathMsg);
      } catch (e) {
        console.error('[Abyss] processDeath after combat failed:', e.message);
      }
      deleteGameState(sessionKey);
      return;
    }

    state.active = false;
    state.phase = "IDLE";
    deleteGameState(sessionKey); // Full cleanup on defeat
  }
}

// ==========================================
// 🎬 MAIN GAME FLOW
// ==========================================

const getDungeonMenu = (isSolo, senderJid = null) => {
  let msg = `┏━━━━━━━━━━━━┓\n`;
  msg += `┃ 🏰 DUNGEONS ┃\n`;
  msg += `┗━━━━━━━━━━━━┛\n\n`;

  msg += `Pick your rank:\n\n`;

  const ranks = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];
  let userRankIndex = 0;

  if (senderJid) {
    const user = economy.getUser(senderJid);
    const userRank = user?.adventurerRank || "F";
    userRankIndex = ranks.indexOf(userRank);
  }

  const bossNames = {
    INFECTED_COLOSSUS: "Infected Colossus",
    CORRUPTED_GUARDIAN: "Corrupted Guardian",
    ELEMENTAL_ARCHON: "Elemental Archon",
    MUTATION_PRIME: "Mutation Prime",
    VOID_CORRUPTED: "Void-Corrupted",
    PRIMORDIAL_CHAOS: "Primordial Chaos",
  };

  for (const [key, data] of Object.entries(DUNGEON_RANKS)) {
    if (data.isSpecial) continue;
    const dungeonIndex = ranks.indexOf(key);
    const isLocked = isSolo && dungeonIndex > userRankIndex + 3;

    if (isLocked) {
      msg += `🔒 *${key}-Rank* (Locked)\n`;
      continue;
    }

    const bName = data.boss ? bossNames[data.boss] || "Boss" : "None";
    msg += `*${key}-Rank* | Diff:${data.difficulty}x | ${data.encounters}stg\n`;
    msg += `  👹 ${bName} | Mobs:${data.minMobs}-${data.maxMobs}\n\n`;
  }

  msg += `━━━━━━━━━━━━\n`;
  // 💡 GOD dungeon entry in the menu
  const godRank = DUNGEON_RANKS.GOD;
  if (godRank) {
    const user = senderJid ? economy.getUser(senderJid) : null;
    const playerRank = user?.adventurerRank || 'F';
    if (playerRank === 'GOD') {
      msg += `🌌 *GOD-Rank* | The Boundless Void | ${godRank.encounters}stg | Diff:${godRank.difficulty}x\n`;
      msg += `  👹 Abyssal God | _Only the transcendent may enter_\n\n`;
    } else {
      msg += `🔒 *GOD-Rank* (Locked — transcend to GOD rank)\n\n`;
    }
  }
  msg += `👉 \`${botConfig.getPrefix()} ${isSolo ? "solo" : "quest"} <Rank>\`\n`;
  msg += `Ex: \`${botConfig.getPrefix()} ${isSolo ? "solo" : "quest"} D\`\n`;
  msg += `Ex: \`${botConfig.getPrefix()} ${isSolo ? "solo" : "quest"} GOD\` (GOD rank only)`;

  return msg;
};

const initAdventure = async (
  sock,
  chatId,
  groq,
  mode = "NORMAL",
  solo = false,
  rankInput = null,
  senderJid = null,
  smartGroqCall = null,
  trialData = null,
) => {
  // Check limits
  const limitCheck = checkChatLimits(chatId, solo, senderJid);
  if (!limitCheck.allowed) return { success: false, msg: limitCheck.msg };

  const sessionKey = solo ? `${chatId}_${senderJid}` : chatId;
  if (gameStates.has(sessionKey)) {
    return {
      success: false,
      msg: solo
        ? "❌ You already have an active Solo raid!"
        : "❌ A Group raid is already active in this chat!",
    };
  }

  if (!rankInput && mode !== "TRIAL") {
    return {
      success: true,
      isMenu: true,
      msg: getDungeonMenu(solo, senderJid),
    };
  }

  let upperRank = rankInput ? rankInput.toUpperCase() : "F";
  let rankData = DUNGEON_RANKS[upperRank];

  if (mode === "TRIAL" && trialData) {
    // ⚔️ Scale trial difficulty based on evolution tier:
    // T2 Evolution trials (STARTER → EVOLVED): difficulty 1.5 — moderate challenge
    // T3 Ascension trials (EVOLVED → ASCENDED): difficulty 4.0 — boss-level threat
    const targetClass = classSystem.getClassById(trialData.targetClass);
    const isAscensionTrial = targetClass?.tier === 'ASCENDED';
    const trialDifficulty = isAscensionTrial ? 4.0 : 1.5;
    upperRank = "TRIAL";
    rankData = { name: isAscensionTrial ? "Ascension Trial" : "Evolution Trial", difficulty: trialDifficulty, encounters: 1, minMobs: 1, maxMobs: 1, xpMult: isAscensionTrial ? 5.0 : 2.0, isSpecial: true };
  } else if (!rankData) {
    return {
      success: false,
      msg: `❌ Invalid Dungeon Rank: ${rankInput}.\n\n` + getDungeonMenu(solo),
    };
  }

  // Special Dungeon Key & Lineage Check
  if (rankData.isSpecial && senderJid) {
    // 💡 GOD DUNGEON — only GOD-rank players can enter
    if (rankData.requiresGodRank) {
      const user = economy.getUser(senderJid);
      const playerRank = user?.adventurerRank || 'F';
      if (playerRank !== 'GOD') {
        return {
          success: false,
          msg: `❌ *THE BOUNDLESS VOID REJECTS YOU*\n\nYou are not yet ready. Only a GOD — one who has transcended the very bounds of dimensionality — may step beyond the veil.\n\n_Your current rank: ${playerRank}. Required: GOD._\n\n_Complete the Trial of Divinity (Mission 4) and reach GOD rank to enter._`,
        };
      }
      // Send lore intro
      try {
        if (sock && rankData.loreIntro) {
          await sock.sendMessage(chatId, { text: `\n🌌 *${rankData.name}* 🌌\n\n${rankData.loreIntro}\n` });
        }
      } catch (e) {}
    }

    if (upperRank === "DRAGON") {
      // 💡 QA FIX: Removed Fighter lineage restriction — multiple class
      // evolution paths require dragon kills (DRAGONSLAYER, DRAGON_GOD).
      // Locking non-Fighter classes out makes those evolutions impossible.
      // All classes can now enter the Dragon Dungeon (with a dragon key).

      // Check Key
      if (!inventorySystem.hasItem(senderJid, "dragon_key")) {
        return {
          success: false,
          msg: `❌ You need a *Dragon Hunter Key* 🔑🐲 to enter this special dungeon!\n\n💡 Buy one from the shop or find it as a rare drop.`,
        };
      }

      // Consume Key
      inventorySystem.removeItem(senderJid, "dragon_key", 1);
    }
  }

  // Rank Restriction Logic (Skip for Special Dungeons or apply specific ones)
  if (solo && senderJid && !rankData.isSpecial) {
    const user = economy.getUser(senderJid);
    const adventurerRank = user?.adventurerRank || "F";
    const ranks = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];

    const userRankIndex = ranks.indexOf(adventurerRank);
    const dungeonRankIndex = ranks.indexOf(upperRank);

    // Only play 3 ranks above current one
    const maxSoloRankIndex = userRankIndex + 3;

    if (dungeonRankIndex > maxSoloRankIndex) {
      const maxRank = ranks[Math.min(maxSoloRankIndex, ranks.length - 1)];
      return {
        success: false,
        msg: `⚠️ Your Adventurer Rank is *${adventurerRank}*. You can only solo up to *${maxRank}-Rank* dungeons.\n\n💡 Rank up or join a group to enter higher dungeons!`,
      };
    }
  }

  // Set game state

  // Select Environment (Specific for special, Random for others)
  let environment;
  if (
    rankData.isSpecial &&
    rankData.pool &&
    DUNGEON_ENVIRONMENTS[rankData.pool]
  ) {
    environment = DUNGEON_ENVIRONMENTS[rankData.pool];
  } else {
    const envKeys = Object.keys(DUNGEON_ENVIRONMENTS).filter(
      (k) => !DUNGEON_ENVIRONMENTS[k].isSpecial,
    );
    const randomEnvKey = envKeys[Math.floor(Math.random() * envKeys.length)];
    environment = DUNGEON_ENVIRONMENTS[randomEnvKey];
  }

  const state = JSON.parse(JSON.stringify(INITIAL_STATE_TEMPLATE));
  Object.assign(state, {
    active: true,
    phase: "REGISTRATION",
    chatId,
    sessionKey, // 🔑 Store the session key for callbacks
    mode,
    solo,
    sock,
    groq,
    smartGroqCall,
    dungeonRank: upperRank,
    difficulty: rankData.difficulty,
    environment: environment,
    backgroundPath: `rpgasset/environment/${environment.asset}`,
    encounter: 0,
    maxEncounters: rankData.encounters,
    players: [],
    votes: {},
    timers: {},
    trialData, // ⚔️ Special trial payload
    trialTarget: trialData ? trialData.trialBoss : null,
  });
  gameStates.set(sessionKey, state);

  // Auto-join for solo
  if (solo && senderJid) {
    const user = economy.getUser(senderJid);
    const name =
      user?.nickname || user?.profile?.nickname || senderJid.split("@")[0];
    state.players.push({
      jid: senderJid,
      name: name,
      class: null,
      level: progression.getLevel(senderJid) || 1,
      stats: {
        hp: 100,
        maxHp: 100,
        energy: 100,
        maxEnergy: 100,
        atk: 10,
        def: 10,
        mag: 10,
        spd: 10,
        luck: 10,
        crit: 5,
      },
      equipment: {
        weapon: null,
        armor: null,
        ring: null,
        amulet: null,
        boots: null,
        cloak: null,
      },
      inventory: [],
      statusEffects: [],
      buffs: [],
      isDead: false,
      xpEarned: 0,
      goldEarned: 0,
      combatStats: { damageDealt: 0, damageTaken: 0, healed: 0, kills: 0 },
    });
  }

  const regTime = solo ? 0 : GAME_CONFIG.REGISTRATION_TIME;
  state.timers.reg = setTimeout(() => {
    startJourney(sock, sessionKey).catch((e) =>
      console.error("[Quest] startJourney timer error:", e?.message || e),
    );
  }, regTime);

  const modeEmoji = mode === "PERMADEATH" ? "💀" : "🗺️";
  let msg = `
   *${upperRank}-RANK* 🏰

📜 *Mode:* ${mode === "PERMADEATH" ? "PERMADEATH" : "NORMAL"}
🏰 *Rank:* ${rankData.name}
⚔️ *Length:* ${rankData.encounters} Encounters
⏱️ *Starts in:* ${solo ? "0s" : "2m"}

${solo ? `👤 *Solo Quest:* Starting now...` : `👉 Type \`${botConfig.getPrefix()} join\` to enter!`}
`;
  return { success: true, msg };
};

const joinAdventure = (chatId, senderJid, senderName) => {
  const state = getGameState(chatId);
  if (!state || !state.active || state.phase !== "REGISTRATION") {
    return "❌ Registration is closed!";
  }

  if (state.solo && state.players.length >= 1) {
    return "❌ This is a solo quest! You cannot join.";
  }

  if (state.players.length >= GAME_CONFIG.MAX_PLAYERS) {
    return "❌ Party is full!";
  }

  if (state.players.some((p) => p.jid === senderJid)) {
    return "⚠️ You're already in the party!";
  }

  const user = economy.getUser(senderJid);
  const adventurerRank = user?.adventurerRank || "F";

  // Initialize player with default stats (class assigned later)
  state.players.push({
    jid: senderJid,
    name: senderName || "Unknown Hero",
    class: null,
    level: 1,
    adventurerRank: adventurerRank,
    stats: {
      hp: 100,
      maxHp: 100,
      energy: 100,
      maxEnergy: 100,
      atk: 10,
      def: 10,
      mag: 10,
      spd: 10,
      luck: 10,
      crit: 5,
    },
    equipment: {
      weapon: null,
      armor: null,
      ring: null,
      amulet: null,
      boots: null,
      cloak: null,
    },
    inventory: [],
    statusEffects: [],
    buffs: [],
    isDead: false,
    xpEarned: 0,
    goldEarned: 0,
    combatStats: {
      damageDealt: 0,
      damageTaken: 0,
      healed: 0,
      kills: 0,
    },
  });

  return `✅ *${senderName}* has joined the adventure! (${state.players.length}/${state.solo ? 1 : GAME_CONFIG.MAX_PLAYERS})`;
};

async function startJourney(sock, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;

  const chatId = state.chatId;
  const minPlayers = state.solo ? 1 : GAME_CONFIG.MIN_PLAYERS;

  if (state.players.length < minPlayers) {
    state.active = false;
    await sock.sendMessage(chatId, {
      text: `❌ Quest cancelled. Need at least ${minPlayers} hero${minPlayers > 1 ? "es" : ""}!`,
    });
    deleteGameState(sessionKey);
    return;
  }
  state.phase = "SHOPPING";

  state.players.forEach((p) => {
    // Use economy class instead of random
    economy.initializeClass(p.jid);
    const userClass = economy.getUserClass(p.jid);

    let classData;
    if (userClass && CLASSES[userClass.id]) {
      classData = CLASSES[userClass.id];
    } else {
      // Fallback to random only if economy fails
      const classKeys = Object.keys(CLASSES);
      const randomKey = classKeys[Math.floor(Math.random() * classKeys.length)];
      classData = CLASSES[randomKey];
    }

    p.class = classData;

    // Ensure user has a persistent sprite assigned in economy
    const user = economy.getUser(p.jid);
    if (user) {
      if (user.spriteIndex === undefined || user.spriteIndex === null) {
        user.spriteIndex = Math.floor(Math.random() * 100);
        economy.saveUser(p.jid);
      }
      p.spriteIndex = user.spriteIndex;
      p.adventurerRank = user.adventurerRank || "F";
    } else {
      p.spriteIndex = Math.floor(Math.random() * 100);
      p.adventurerRank = "F";
    }

    // Use user stats including progression, bonuses AND equipment
    const classId = userClass?.id || p.class.id || p.class.name.toUpperCase();
    const baseStats = progression.getBaseStats(p.jid, classId);
    const equipStats = inventorySystem.getEquipmentStats(p.jid);
    const level = progression.getLevel(p.jid);

    p.equipment = inventorySystem.getEquipment(p.jid) || {};

    p.stats.hp = baseStats.hp; // getBaseStats already includes equipStats
    p.stats.maxHp = p.stats.hp;
    p.stats.maxEnergy = baseStats.maxEnergy;
    p.stats.energy = p.stats.maxEnergy;
    p.stats.atk = baseStats.atk;
    p.stats.def = baseStats.def;
    p.stats.mag = baseStats.mag;
    p.stats.spd = baseStats.spd;
    p.stats.luck = baseStats.luck;
    p.stats.crit = baseStats.crit;
    // 💡 CRITICAL FIX: Copy secondary stats that were calculated by
    // progression.getBaseStats() but never assigned to the combat player.
    // Without these, damage reduction was always 0 (players took full
    // damage from boss ultimates) and evasion was always 0 (players
    // could never dodge). This was the root cause of the "defense is
    // ignored" and "one-shot by boss" complaints.
    p.stats.dmgReduction = baseStats.dmgReduction || 0;
    p.stats.evasion = baseStats.evasion || 0;

    // NEW: Combat system requirements
    p.currentHP = p.stats.hp;
    p.mana = 100;
    p.maxMana = 100;

    p.level = progression.getLevel(p.jid);
  });

  // Shopping phase - Skip entirely for TRIAL mode (solo boss fight, no prep needed)
  // Instant for solo, 1s delay for group
  if (state.mode === "TRIAL") {
    // For class trials, skip shopping and go straight to the boss fight
    setTimeout(() => {
      state.phase = "PLAYING";
      nextStage(sock, state.groq, sessionKey).catch((e) =>
        console.error("[Quest] Trial nextStage error:", e?.message || e),
      );
    }, 0);
  } else {
    const shopDelay = state.solo ? 0 : 1000;
    setTimeout(() => {
      openShop(sock, sessionKey).catch((e) =>
        console.error("[Quest] openShop timer error:", e?.message || e),
      );
    }, shopDelay);
  }

  // 💡 HIVE MIND WHISPERS (5% chance)
  if (Math.random() < 0.05) {
    const whispers = [
      "...join us...",
      "...it is so cold in the dark...",
      "...we see you, little spark...",
      "...why do you resist the inevitable?...",
      "...the hive only wants to protect you...",
    ];
    const whisper = whispers[Math.floor(Math.random() * whispers.length)];
    setTimeout(() => {
      sock
        .sendMessage(chatId, { text: `_「 ${whisper} 」_` })
        .catch((e) =>
          console.error("[Quest] whisper send error:", e?.message || e),
        );
    }, 5000);
  }
}

const stopQuest = (chatId, senderJid = null, isAdmin = false) => {
  // 1. If admin, check for ANY active quest in this chat
  if (isAdmin) {
    let stoppedAny = false;
    let wasSolo = false;

    // Search all states for ANY quest in this chatId
    for (const [key, state] of gameStates.entries()) {
      if (state.chatId === chatId && state.active) {
        wasSolo = state.solo;
        state.active = false;
        state.phase = "IDLE";
        if (state.timers) {
          Object.values(state.timers).forEach((timer) => {
            if (timer) clearTimeout(timer);
          });
        }
        gameStates.delete(key);
        stoppedAny = true;
      }
    }

    if (stoppedAny)
      return "🛡️ *Admin Override:* All active quests in this chat have been cancelled.";
  }

  // 2. Standard user check (their own solo or the group quest)
  const state = getGameState(chatId, senderJid);
  if (!state || !state.active)
    return "❌ No active adventure found for you in this chat!";

  const wasSolo = state.solo;
  state.active = false;
  state.phase = "IDLE";

  // Clear all active timers
  if (state.timers) {
    Object.values(state.timers).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  }

  deleteGameState(chatId, senderJid);

  return wasSolo ? "✅ Solo quest cancelled!" : "✅ Raid quest cancelled!";
};

async function openShop(sock, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;

  const chatId = state.chatId;
  let msg = `┏━━━━━━━━━━━━┓\n`;
  msg += `┃ 🏪 PRE-RAID  ┃\n`;
  msg += `┗━━━━━━━━━━━━┛\n\n`;

  msg += `Shop closes in 90s!\n\n`;

  SHOP_LIST.forEach((key, i) => {
    const item = CONSUMABLES[key];
    msg += `${i + 1}. ${item.icon} *${item.name}*\n`;
    msg += `   💰 ${botConfig.getCurrency().symbol}${item.cost} | ${item.effect}\n\n`;
  });

  msg += `━━━━━━━━━━━━\n`;
  msg += `💬 \`${botConfig.getPrefix()} buy <#>\` to purchase`;

  try {
    await sock.sendMessage(state.chatId, { text: msg });
  } catch (err) {
    console.error("Failed to send shop menu in openShop:", err.message);
  }

  const shopTime = GAME_CONFIG.SHOP_TIME;
  state.timers.shop = setTimeout(() => {
    state.phase = "PLAYING";
    nextStage(sock, state.groq, sessionKey).catch((e) =>
      console.error("[Quest] nextStage error:", e?.message || e),
    );
  }, shopTime);
}

async function nextStage(sock, groq, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;

  const chatId = state.chatId;
  console.log(
    `[Quest] nextStage triggered for ${sessionKey}. isProcessing: ${state.isProcessing}, Encounter: ${state.encounter}/${state.maxEncounters}`,
  );

  if (state.isProcessing) {
    console.warn(`[Quest] nextStage blocked: already processing for ${chatId}`);
    // Safety: if stuck for more than 30s, force clear
    if (state.lastProcessTime && Date.now() - state.lastProcessTime > 30000) {
      console.error(
        `[Quest] EMERGENCY: Clearing stuck isProcessing for ${chatId}`,
      );
      state.isProcessing = false;
    } else {
      return;
    }
  }

  state.isProcessing = true;
  state.lastProcessTime = Date.now();

  try {
    if (!groq) groq = state.groq;
    state.encounter++;

    // 💡 GOD DUNGEON: send lore message for each floor
    const godRankData = DUNGEON_RANKS.GOD;
    if (state.dungeonRank === 'GOD' && godRankData && godRankData.loreFloors) {
      const loreIdx = state.encounter - 1;
      if (loreIdx >= 0 && loreIdx < godRankData.loreFloors.length) {
        try {
          await sock.sendMessage(chatId, { text: `\n🌌 _${godRankData.loreFloors[loreIdx]}_\n` });
        } catch (e) {}
      }
    }

    // Check if dungeon is complete
    if (state.encounter > state.maxEncounters) {
      state.isProcessing = false;
      return endAdventure(sock, sessionKey);
    }

    // 💡 BRANCHING PATHS SYSTEM
    // Every 3 stages (except boss), let the party vote
    if (
      state.encounter > 1 &&
      state.encounter % 3 === 0 &&
      state.encounter < state.maxEncounters
    ) {
      let msg = `┏━━━━━━━━━━━━┓\n`;
      msg += `┃ 📂 CROSSROAD ┃\n`;
      msg += `┗━━━━━━━━━━━━┛\n\n`;
      msg += `🔴 *Door 1: Riches*\n   Elite Combat — 2x Loot\n\n`;
      msg += `🔵 *Door 2: Safety*\n   Rest — Heal 30% HP/EN\n\n`;
      msg += `Vote: \`${botConfig.getPrefix()} vote 1\` or \`${botConfig.getPrefix()} vote 2\`\n`;
      msg += `⏱️ 30 seconds!`;

      state.votes = {};
      state.currentEncounter = null; // Clear stale encounter
      state.isBranching = true; // Set flag
      try {
        await sock.sendMessage(state.chatId, { text: msg });
      } catch (err) {
        console.error(
          "Failed to send split path message in nextStage:",
          err.message,
        );
      }

      const voteTime = 30000; // 30s for both solo and group (matches message)
      state.timers.vote = setTimeout(() => {
        const v1 = Object.values(state.votes).filter((v) => v === "1").length;
        const v2 = Object.values(state.votes).filter((v) => v === "2").length;

        const winner = v2 > v1 ? "REST" : "ELITE_COMBAT";
        state.isProcessing = false;
        state.isBranching = false; // Clear flag
        processBranchChoice(sock, winner, sessionKey).catch((e) =>
          console.error("[Quest] processBranchChoice error:", e?.message || e),
        );
      }, voteTime);
      return;
    }

    // ... (rest of standard encounter logic)
    // 💡 TRIAL mode uses a virtual rank entry — guard against missing rankData
    const rankData = DUNGEON_RANKS[state.dungeonRank] || { name: "Class Trial", difficulty: 1.5, encounters: 1, minMobs: 1, maxMobs: 1, xpMult: 2.0 };
    const isLowRank = ["F", "E", "D"].includes(state.dungeonRank);
    const isBossEncounter =
      state.mode === "TRIAL" || (state.encounter === state.maxEncounters && rankData.boss);

    let encounterType;
    if (isBossEncounter) {
      encounterType = "BOSS";
    } else if (isLowRank) {
      encounterType = "COMBAT";
    } else {
      const roll = Math.random();
      if (roll < 0.5) encounterType = "COMBAT";
      else if (roll < 0.7) encounterType = "ELITE_COMBAT";
      else if (roll < 0.85) encounterType = "REST";
      else encounterType = "NON_COMBAT";
    }

    await executeEncounter(sock, groq, encounterType, sessionKey);
  } finally {
    state.isProcessing = false;
  }
}

async function processBranchChoice(sock, type, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;
  state.isProcessing = true;
  await executeEncounter(sock, state.groq, type, sessionKey);
  state.isProcessing = false;
}

async function executeEncounter(sock, groq, encounterType, sessionKey) {
  const state = getGameState(sessionKey);
  if (!state) return;

  const durabilitySystem = require('./durabilitySystem');
  for (const player of state.players) {
      durabilitySystem.applySelfRepair(player);
  }
  const rankData = DUNGEON_RANKS[state.dungeonRank];
  let encounter;

  if (state.mode === "TRIAL") {
    encounter = classEncounters.generateEncounter(
      state.players,
      "BOSS",
      state.difficulty,
      { forceBossId: state.trialTarget },
    );
  } else if (encounterType === "REST") {
    encounter = {
      type: "REST",
      name: "Quiet Campfire",
      description:
        "The party finds a safe spot to rest and recover. The crackling fire brings comfort.",
    };
  } else if (encounterType === "NON_COMBAT") {
    encounter = selectRandomEncounter(sessionKey);
  } else {
    encounter = classEncounters.generateEncounter(
      state.players,
      encounterType,
      state.difficulty || 1.0,
      {
        minMobs: rankData.minMobs,
        maxMobs: rankData.maxMobs,
        // 💡 Pass environment so special dungeons (DRAGON_LAIR) spawn their
        // dedicated mob pool instead of generic level-based enemies.
        environment: state.environment || null,
        // Pin the boss to the one defined for this rank so HP stays sane
        ...(encounterType === 'BOSS' && rankData.boss ? { forceBossId: rankData.boss } : {}),
      },
    );
  }

  if (!encounter) {
    console.error(`❌ Failed to generate encounter of type: ${encounterType}`);
    // Try to recover by skipping or ending
    setTimeout(() => {
      nextStage(sock, groq, sessionKey).catch((e) =>
        console.error("[Quest] nextStage recovery error:", e?.message || e),
      );
    }, 1000);
    return;
  }

  state.currentEncounter = encounter;
  state.currentEncounterType = encounter.type;

  if (
    encounter.type === "COMBAT" ||
    encounter.type === "BOSS" ||
    encounter.type === "ELITE_COMBAT"
  ) {
    // Elite combat from branch choice gives 2x difficulty for THIS encounter
    // only. Previously this mutated state.difficulty in place, which compounded
    // across every elite-combat at encounter index 3/6/9/12 without ever
    // resetting — three elite-combats in an S-rank dungeon pushed difficulty
    // 35 → 70 → 140 → 280, breaking both loot-table routing (jumped to
    // SSS_RANK_COMMON) and boss HP scaling (quadratic via rankIndex^2 in
    // scaleBossStats). Fix: stash the original difficulty and restore it
    // after startCombat resolves. (audit bug #3)
    let difficultyOverride = null;
    if (encounter.type === "ELITE_COMBAT" && state.encounter % 3 === 0) {
      difficultyOverride = state.difficulty * 2.0;
    }
    if (difficultyOverride !== null) {
      state._preEliteDifficulty = state.difficulty;
      state.difficulty = difficultyOverride;
    }

    // 💡 BOSS SPLASH (Phase 0): render a full-screen boss intro image
    // before combat starts. Non-fatal — if the Go service fails or times
    // out, combat proceeds normally. Only fires for BOSS encounters (not
    // COMBAT or ELITE_COMBAT) to keep splash impactful + avoid spam.
    if (encounter.type === "BOSS") {
      try {
        const bossEnemy = encounter.enemies && encounter.enemies[0];
        if (bossEnemy) {
          // Determine tier label for color theme
          let tierLabel = "S";
          if (state.mode === "TRIAL") {
            tierLabel = "TRIAL";
          } else if (state.dungeonRank === "DRAGON") {
            tierLabel = "DRAGON";
          } else if (state.dungeonRank === "SSS") {
            tierLabel = "SSS";
          } else if (state.dungeonRank === "SS") {
            tierLabel = "SS";
          } else if (state.dungeonRank === "S") {
            tierLabel = "S";
          }

          // Pick a flavor text line based on boss name
          const flavorTexts = {
            "ELDER CHAOS": "An ancient chaos awakens, twisting reality itself...",
            "VOID TITAN": "The void between worlds takes form. Reality trembles.",
            "ABYSSAL GOD": "The divine entity of the deepest abyss stirs. Pray.",
            "PRIMORDIAL CHAOS": "The source of all corruption turns its gaze upon you.",
            "IGNEEL THE FIRE KING": "The dragon's roar scorches the heavens. Steel yourself.",
            "ANCIENT DRAGON": "Scales harder than diamond. Bring your seal ring.",
            "DEMON LORD": "The lord of demons grins. Your soul smells sweet.",
            "LEVIATHAN": "From the abyssal depths, a titanic serpent rises.",
            "ETERNAL DRAGON": "Time itself bends around this eternal wyrm.",
            "SHADOW LORD": "Darkness given form. Light fears this name.",
            "PRIMORDIAL EVIL": "The first evil. The origin of all sin.",
            "GRAVEYARD LORD": "Bone and shadow. The dead obey his every word.",
            "ELDER FLAME": "Ancient fire given will. Burn, or be burned.",
          };
          const bossNameUpper = (bossEnemy.name || "").toUpperCase();
          const flavor = flavorTexts[bossNameUpper] ||
            `A legendary foe stands before you. ${bossEnemy.name || "The boss"} prepares to strike.`;

          // Resolve sprite filename — mirror the Go BossNameSprites map
          // so the splash shows the same image the combat scene will use.
          const BOSS_SPLASH_SPRITES = {
            "ELDER CHAOS": "calamaties (1).png",
            "VOID TITAN": "calamaties (3).png",
            "ABYSSAL GOD": "calamaties (5).png",
            "IGNEEL THE FIRE KING": "calamaties (2).png",
            "ANCIENT DRAGON": "calamaties (2).png",
            "DEMON LORD": "calamaties (4).png",
            "LEVIATHAN": "calamaties (6).png",
            "ETERNAL DRAGON": "calamaties (2).png",
            "SHADOW LORD": "highlevelbosses (13).png",
            "PRIMORDIAL EVIL": "calamaties (1).png",
            "GRAVEYARD LORD": "highlevelbosses (12).png",
            "ELDER FLAME": "calamaties (2).png",
            "PRIMORDIAL CHAOS": "calamaties (1).png",
          };
          const splashSprite = BOSS_SPLASH_SPRITES[bossNameUpper] || "calamaties (1).png";

          const splashPayload = {
            name: bossEnemy.name || "Unknown Boss",
            spriteFilename: splashSprite,
            flavorText: flavor,
            tier: tierLabel,
          };

          // Try to render splash
          const goService = require('../utils/goImageService');
          const go = new goService();
          const splashBuf = await go.generateBossSplash(splashPayload);
          if (splashBuf && splashBuf.length > 100) {
            try {
              await sock.sendMessage(state.chatId, {
                image: splashBuf,
                caption: `⚔️ *${bossEnemy.name}* — ${tierLabel === "TRIAL" ? "TRIAL" : tierLabel + "-RANK"} BOSS\n_${flavor}_`,
                mimetype: "image/png",
              });
              // Brief pause so players see the splash before combat starts
              await new Promise((r) => setTimeout(r, 2500));
            } catch (splashSendErr) {
              console.error("[BossSplash] Failed to send splash image:", splashSendErr.message);
            }
          }
        }
      } catch (splashErr) {
        console.error("[BossSplash] Render failed (non-fatal):", splashErr.message);
      }
    }

    try {
      await startCombat(sock, groq, encounter, sessionKey);
    } finally {
      if (difficultyOverride !== null && state._preEliteDifficulty !== undefined) {
        state.difficulty = state._preEliteDifficulty;
        delete state._preEliteDifficulty;
      }
    }
  } else if (encounter.type === "REST") {
    await handleRestEncounter(sock, encounter, sessionKey);
  } else {
    await handleNonCombatEncounter(sock, encounter, sessionKey);
  }
}

async function handleRestEncounter(sock, encounter, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;
  let msg = `🔥 *${encounter.name}* 🔥\n\n`;
  msg += `${encounter.description}\n\n`;

  msg += `The party takes time to recover:\n`;

  for (const player of state.players) {
    if (player.isDead) continue;

    const hpGain = Math.floor(player.stats.maxHp * 0.3);
    const energyGain = 30;

    player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + hpGain);
    player.currentHP = player.stats.hp;
    player.stats.energy = Math.min(
      player.stats.maxEnergy,
      player.stats.energy + energyGain,
    );

    msg += `💖 ${player.name}: +${hpGain} HP, +${energyGain} Energy\n`;
  }

  msg += `\n⏰ Continuing journey in ${GAME_CONFIG.BREAK_TIME / 1000}s...`;

  try {
    await sock.sendMessage(state.chatId, { text: msg });
  } catch (err) {
    console.error("Failed to send rest encounter message:", err.message);
  }

  setTimeout(
    () => {
      nextStage(sock, state.groq, sessionKey).catch((e) =>
        console.error("[Quest] nextStage error:", e?.message || e),
      );
    },
    state.solo ? 0 : GAME_CONFIG.BREAK_TIME,
  );
}

function selectRandomEncounter(chatId) {
  const state = getGameState(chatId);
  if (!state) return null;
  const types = ["TRAP", "PUZZLE", "MERCHANT", "TREASURE", "EVENT"];
  const type = types[Math.floor(Math.random() * types.length)];

  switch (type) {
    case "TRAP":
      return generateTrapEncounter(chatId);
    case "PUZZLE":
      return generatePuzzleEncounter(chatId);
    case "MERCHANT":
      return generateMerchantEncounter(chatId);
    case "TREASURE":
      return generateTreasureEncounter(chatId);
    case "EVENT":
      return generateEventEncounter(chatId);
    default:
      return generateTrapEncounter(chatId);
  }
}

async function handleMerchantEncounter(sock, encounter, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;

  let msg = `💰 *${encounter.description}* 💰\n\n`;
  msg += `The merchant offers the following items for your journey:\n\n`;

  encounter.shopItems.forEach((itemKey, i) => {
    const item = CONSUMABLES[itemKey];
    if (item) {
      msg += `${i + 1}. ${item.icon} *${item.name}* - 💰 ${item.cost}\n`;
      msg += `   _${item.desc}_\n\n`;
    }
  });

  msg += `💬 Type \`${botConfig.getPrefix()} buy <#>\` to purchase an item.\n`;
  msg += `⏰ The merchant will leave in ${GAME_CONFIG.VOTE_TIME / 1000}s...`;

  try {
    await sock.sendMessage(state.chatId, { text: msg });
  } catch (err) {
    console.error("Failed to send merchant encounter message:", err.message);
  }

  state.currentEncounter = encounter;
  state.phase = "PLAYING"; // Ensure they can buy
  state.isMerchantActive = true;

  const merchantTime = state.solo ? 30000 : GAME_CONFIG.VOTE_TIME || 30000;
  state.timers.merchant = setTimeout(() => {
    if (state.active) {
      state.isMerchantActive = false;
      nextStage(sock, state.groq, sessionKey).catch((e) =>
        console.error("[Quest] nextStage error:", e?.message || e),
      );
    }
  }, merchantTime);
}
async function handleNonCombatEncounter(sock, encounter, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;

  if (encounter.type === "MERCHANT") {
    return handleMerchantEncounter(sock, encounter, sessionKey);
  }

  // Defensive fallback: if a generator forgets to expose name/icon at the top
  // level (older generators nest them inside type-specific sub-objects), fall
  // back through those sub-objects before giving up. Fixes the long-standing
  // 'undefined *undefined*' header bug on TRAP/PUZZLE/TREASURE/EVENT encounters.
  const encName = encounter.name || encounter.trap?.name || encounter.puzzle?.name ||
                  encounter.treasure?.name || encounter.event?.name || "Unknown Event";
  const encIcon = encounter.icon || encounter.trap?.icon || encounter.puzzle?.icon ||
                  encounter.treasure?.icon || encounter.event?.icon || "🎲";
  let msg = `${encIcon} *${encName}*\n\n`;
  msg += `${encounter.description}\n\n`;

  msg += `The party must decide what to do:\n\n`;

  encounter.choices.forEach((choice, i) => {
    msg += `${i + 1}. ${choice.text} (${choice.stat} Check)\n`;
  });

  msg += `\n💬 Type: \`${botConfig.getPrefix()} vote <#>\` to choose!`;

  try {
    await sock.sendMessage(state.chatId, { text: msg });
  } catch (err) {
    console.error("Failed to send non-combat choice message:", err.message);
  }

  state.currentEncounter = encounter;
  state.votes = {};
  state.voteProcessing = false;

  // Auto-timeout if no one votes
  let timer;
  if (state.solo) {
    timer = 15000; // Reduced to 15s for solo
  } else if (state.actionJustTaken) {
    timer = 120000;
    state.actionJustTaken = false;
  } else {
    timer = GAME_CONFIG.VOTE_TIME || 30000;
  }

  state.timers.vote = setTimeout(() => {
    if (state.active && !state.voteProcessing) {
      processVotes(sock, encounter, sessionKey).catch((e) =>
        console.error("[Quest] processVotes error:", e?.message || e),
      );
    }
  }, timer);
}
async function processVotes(sock, encounter, sessionKey) {
  const state = gameStates.get(sessionKey);
  if (!state) return;
  if (!sock) sock = state.sock;
  clearTimeout(state.timers.vote);

  const chatId = state.chatId;

  // 🛡️ ENCOUNTER SAFETY GUARD: Recover if state is lost or invalid
  if (!encounter || !encounter.choices) {
    console.warn(
      `⚠️️ [Quest][${sessionKey}] Recovering from null encounter or missing choices. (Phase: ${state.phase}, Type: ${state.currentEncounterType})`,
    );
    state.votes = {};
    state.voteProcessing = false;
    // Force next stage after a brief delay
    setTimeout(() => {
      nextStage(sock, state.groq, sessionKey).catch((e) =>
        console.error("[Quest] nextStage recovery error:", e?.message || e),
      );
    }, 1000);
    return;
  }

  const voteCounts = {};
  for (const vote of Object.values(state.votes)) {
    voteCounts[vote] = (voteCounts[vote] || 0) + 1;
  }
  let winningChoiceIdx = "1";
  let maxVotes = 0;
  for (const [choice, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      winningChoiceIdx = choice;
    }
  }

  // Note: The second check below is now mostly redundant but kept for extra safety
  if (!encounter || !encounter.choices) {
    console.error(
      "❌ processVotes: encounter or encounter.choices is missing!",
    );
    setTimeout(
      () => {
        nextStage(sock, state.groq, sessionKey).catch((e) =>
          console.error("[Quest] nextStage error:", e?.message || e),
        );
      },
      state.solo ? 0 : GAME_CONFIG.BREAK_TIME,
    );
    return;
  }

  const choice = encounter.choices[parseInt(winningChoiceIdx) - 1];
  if (!choice) {
    try {
      await sock.sendMessage(state.chatId, {
        text: "❌ Invalid choice! Moving on...",
      });
    } catch (err) {
      console.error(
        "Failed to send invalid choice message in processVotes:",
        err.message,
      );
    }
    setTimeout(
      () => {
        nextStage(sock, state.groq, sessionKey).catch((e) =>
          console.error("[Quest] nextStage error:", e?.message || e),
        );
      },
      state.solo ? 0 : GAME_CONFIG.BREAK_TIME,
    );
    return;
  }

  let msg = `📊 *Vote Result:* ${choice.text}\n\n`;
  let finalOutcome =
    choice.outcome || (choice.success && !choice.stat ? choice.success : null);

  // D20 STAT CHECK
  if (choice.stat) {
    const roll = Math.floor(Math.random() * 20) + 1;
    // Get highest party stat for the check
    const rawBestStat = Math.max(
      ...state.players.map((p) => p.stats[choice.stat.toLowerCase()] || 0),
    );
    // ⚠️ FIX (audit Task 4): previously 'total = roll + partyBestStat' which
    // made the d20 roll irrelevant at high stats (DEF=471 → +471 bonus,
    // always beat any reasonable difficulty). Now the stat bonus is CAPPED
    // at +10 and scales at 1 bonus per 20 stat points, so:
    //   stat 0-19  → +0 bonus (pure d20 roll)
    //   stat 20-39 → +1 bonus
    //   stat 100   → +5 bonus
    //   stat 200+  → +10 bonus (capped)
    // The d20 roll (1-20) now matters again — a low roll can still fail
    // even with maxed stats, and a high roll can succeed with low stats.
    // This restores the RNG element that makes stat checks feel like
    // 'checks' instead of auto-pass/auto-fail.
    const statBonus = Math.min(10, Math.floor(rawBestStat / 20));
    const total = roll + statBonus;
    const success = total >= choice.difficulty;

    msg += `🎲 *ROLL:* ${roll} + ${statBonus} (stat ${rawBestStat} → +${statBonus} cap) = *${total}* (Req: ${choice.difficulty})\n`;
    msg += success ? `✅ *SUCCESS!*\n` : `❌ *FAILURE!*\n`;

    finalOutcome = success ? choice.success : choice.failure;
  }

  if (finalOutcome) {
    msg += finalOutcome.description || "";

    // Track treasure finds
    if (encounter.type === "TREASURE") state.stats.treasuresFound++;

    // Apply rewards/penalties to all players
    for (const player of state.players) {
      if (finalOutcome.gold) {
        economy.addMoney(player.jid, finalOutcome.gold);
      }
      if (finalOutcome.damage) {
        player.stats.hp = Math.max(0, player.stats.hp - finalOutcome.damage);
      }
      if (finalOutcome.heal) {
        player.stats.hp = Math.min(
          player.stats.maxHp,
          player.stats.hp + finalOutcome.heal,
        );
      }
    }

    if (finalOutcome.gold)
      msg += `\n💰 ${finalOutcome.gold > 0 ? "+" : ""}${finalOutcome.gold} gold!`;
    if (finalOutcome.damage)
      msg += `\n💔 ${finalOutcome.damage} damage to party!`;
    if (finalOutcome.heal) msg += `\n💚 ${finalOutcome.heal} HP restored!`;
  }

  try {
    await sock.sendMessage(state.chatId, { text: msg });
  } catch (err) {
    console.error("Failed to send vote result in processVotes:", err.message);
  }

  // Check for deaths
  const deadPlayers = state.players.filter((p) => p.stats.hp <= 0 && !p.isDead);
  if (deadPlayers.length > 0) {
    let deathMsg = "💀 *CASUALTIES* 💀\n\n";
    deadPlayers.forEach((p) => {
      p.isDead = true;
      deathMsg += `${p.name} has fallen!\n`;
    });
    try {
      await sock.sendMessage(state.chatId, { text: deathMsg });
    } catch (err) {
      console.error(
        "Failed to send death message in processVotes:",
        err.message,
      );
    }
    if (state.players.every((p) => p.isDead))
      return endAdventure(sock, sessionKey, false);
  }

  state.votes = {};
  state.voteProcessing = false;
  setTimeout(
    () => {
      nextStage(sock, state.groq, sessionKey).catch((e) =>
        console.error("[Quest] nextStage error:", e?.message || e),
      );
    },
    state.solo ? 0 : GAME_CONFIG.BREAK_TIME,
  );
}

async function endAdventure(sock, sessionKey, victory = true) {
  const state = gameStates.get(sessionKey);
  if (!state) return;

  const chatId = state.chatId;
  // AI Narration of the journey's end
  const prompt = `
    Context: Fantasy RPG. The party has successfully completed all 5 acts of their epic quest and returned as legends.

    Write a triumphant, grand narration (2-3 sentences) about their return and the glory they have earned.
    `;

  let narration = "";
  try {
    if (state.smartGroqCall) {
      const completion = await state.smartGroqCall({
        messages: [{ role: "system", content: prompt }],
        model: "llama-3.3-70b-versatile",
      });
      narration = completion.choices[0].message.content;
    } else if (state.groq) {
      const completion = await state.groq.chat.completions.create({
        messages: [{ role: "system", content: prompt }],
        model: "llama-3.3-70b-versatile",
      });
      narration = completion.choices[0].message.content;
    }
  } catch (e) {
    narration =
      "The heroes return from the depths of the void, their names etched in history forever.";
  }

  // 💡 FIX: branch on TRIAL mode BEFORE building the "QUEST COMPLETE!" header.
  // Previously, a defeated trial would still show "🎉 QUEST COMPLETE! The
  // party has conquered all challenges!" + reward gold/XP — extremely
  // confusing for the player who actually lost their class trial.
  if (state.mode === "TRIAL" && !victory) {
    let trialFailMsg = `┏━━━━━━━━━━━━━━━━┓\n`;
    trialFailMsg += `┃ ⚔️ *TRIAL FAILED* ⚔️ ┃\n`;
    trialFailMsg += `┗━━━━━━━━━━━━━━━━┛\n\n`;
    trialFailMsg += `You have not proven your worth.\n`;
    trialFailMsg += `Class evolution has been *denied*.\n\n`;
    trialFailMsg += `📊 *RUN STATS:*\n`;
    trialFailMsg += `☠️ Monsters Slain: ${state.stats.monstersKilled}\n`;
    trialFailMsg += `👑 Bosses Defeated: ${state.stats.bossesDefeated}\n\n`;
    trialFailMsg += `Try again when you're stronger. 🗡️`;

    try {
      await sock.sendMessage(state.chatId, { text: trialFailMsg });
    } catch (err) {
      console.error("Failed to send trial-fail message:", err.message);
    }

    state.active = false;
    deleteGameState(sessionKey);
    return;
  }

  let msg = `\n🎉 *QUEST COMPLETE!* 🎉\n\n`;
  msg += `📜 ${narration}\n\n`;
  msg += `The party has conquered all challenges!\n\n`;
  msg += `📊 *FINAL STATS:*\n`;
  msg += `☠️ Monsters Slain: ${state.stats.monstersKilled}\n`;
  msg += `👑 Bosses Defeated: ${state.stats.bossesDefeated}\n`;
  msg += `💎 Treasures Found: ${state.stats.treasuresFound}\n`;

  // Aggregate party stats
  const totalDamage = state.players.reduce(
    (sum, p) => sum + (p.combatStats.damageDealt || 0),
    0,
  );
  const totalHealed = state.players.reduce(
    (sum, p) => sum + (p.combatStats.healed || 0),
    0,
  );

  msg += `💥 Total Damage Dealt: ${totalDamage.toLocaleString()}\n`;
  msg += `💖 Total Healing Done: ${totalHealed.toLocaleString()}\n\n`;

  // === SPECIAL MODE HANDLING: TRIAL ===
  if (state.mode === "TRIAL" && victory) {
    const player = state.players[0]; // Trials are always solo
    const trialData = state.trialData;
    const user = economy.getUser(player.jid);
    const classSystem = require("./classSystem");
    const nextClass = classSystem.getClassById(trialData.targetClass);

    if (user && nextClass) {
      const oldClassName =
        classSystem.getClassById(user.class)?.name || "Unknown";
      const oldClassId = user.class; // for rollback

      // Calculate HP ratio before changing class to scale it properly
      const oldMaxHp = progression.getBaseStats(player.jid, user.class).hp;
      const currentHp = user.stats?.hp || oldMaxHp;
      const ratio = Math.min(1, currentHp / oldMaxHp);

      // 💡 FIX: deduct resources BEFORE mutating user.class. The old order
      // (mutate class → deduct → save) meant a player could spend their
      // Zeni during the 5-second pre-trial wait, win the trial, and evolve
      // for free. Now if either deduction fails, we abort the evolution.
      const inventorySystem = require("./inventorySystem");
      const stoneRemoved = inventorySystem.removeItem(player.jid, trialData.stoneId, 1);
      const moneyRemoved = economy.removeMoney(
        player.jid,
        trialData.cost,
        `Evolved to ${nextClass.name}`,
      );

      // Verify both deductions actually succeeded
      // 💡 QA FIX: removeItem returns {success: true/false, ...}, not a
      // count or false. The old check `stoneRemoved !== false && !== undefined`
      // was always true (objects are neither false nor undefined), allowing
      // free evolutions and stone duplication on rollback.
      const stoneOk = stoneRemoved && stoneRemoved.success === true;
      const moneyOk = moneyRemoved === true || moneyRemoved === undefined;

      if (!stoneOk || !moneyOk) {
        // Rollback — re-add what we did remove
        if (stoneOk) {
          try { inventorySystem.addItem(player.jid, trialData.stoneId, 1); } catch (e) {}
        }
        if (moneyOk) {
          try { economy.addMoney(player.jid, trialData.cost); } catch (e) {}
        }
        economy.saveUser(player.jid);

        let failMsg = `❌ *EVOLUTION ABORTED*\n\n`;
        failMsg += `You defeated the trial boss, but resource deduction failed.\n`;
        failMsg += `Required: ${trialData.cost} Zeni + 1× ${trialData.stoneId.replace(/_/g, ' ')}\n\n`;
        failMsg += `Your class has *not* changed. Try again with the required items.`;
        try {
          await sock.sendMessage(chatId, { text: failMsg });
        } catch (e) {}

        state.active = false;
        deleteGameState(sessionKey);
        return;
      }

      // Now safe to mutate class
      user.class = trialData.targetClass;

      // Update actual User base stats in the database
      if (!user.stats) user.stats = { hp: 100, maxHp: 100, level: 1, xp: 0 };
      Object.assign(user.stats, nextClass.stats);

      // Scale current and max HP based on level growth
      const newMaxHp = progression.getBaseStats(player.jid, nextClass.id).hp;
      user.stats.hp = Math.round(newMaxHp * ratio);
      user.stats.maxHp = newMaxHp;

      // Preserve skills structure
      if (!user.skills) user.skills = {};

      // Record completed trials
      if (!user.completedTrials) user.completedTrials = [];
      if (trialData.trialBoss && !user.completedTrials.includes(trialData.trialBoss)) {
        user.completedTrials.push(trialData.trialBoss);
      }

      const level = progression.getLevel(player.jid);

      // Initialize skill points if undefined/null
      skillTree.ensureSkillPointsInitialized(user, trialData.targetClass, level);

      // Grant Bonus Points
      const bonusPoints = nextClass.tier === "ASCENDED" ? 10 : 5;
      user.skillPoints = (user.skillPoints || 0) + bonusPoints;

      // Evolution history
      user.evolvedAt = level;
      if (!user.evolutionHistory) user.evolutionHistory = [];
      user.evolutionHistory.push({
        from: oldClassName,
        to: nextClass.name,
        level,
        timestamp: Date.now(),
      });

      economy.saveUser(player.jid);

      let trialSuccessMsg = `┏━━━━━━━━━━━━┓\n`;
      trialSuccessMsg += `┃ ✨ EVOLVED! ✨ ┃\n`;
      trialSuccessMsg += `┗━━━━━━━━━━━━┛\n\n`;
      trialSuccessMsg += `You have proven your worth by defeating the **${trialData.trialBoss.replace("_", " ")}**!\n\n`;
      trialSuccessMsg += `*${oldClassName}* ──▶ *${nextClass.name}* ${nextClass.icon}\n\n`;
      trialSuccessMsg += `📊 *New Base Stats:*\n`;
      Object.entries(nextClass.stats).forEach(([stat, val]) => {
        trialSuccessMsg += `• ${stat.toUpperCase()}: ${val}\n`;
      });
      trialSuccessMsg += `\n✅ *Skills Preserved!*\n`;
      trialSuccessMsg += `🎁 *Tier Bonus:* +${bonusPoints} Skill Points\n\n`;
      trialSuccessMsg += `🌳 \`${botConfig.getPrefix()} skill tree\` to continue your path!`;

      await sock.sendMessage(chatId, { text: trialSuccessMsg });

      state.active = false;
      deleteGameState(sessionKey);
      return;
    }
  }

  // Default individual rewards
  const multiplier =
    state.mode === "PERMADEATH" ? GAME_CONFIG.PERMADEATH_MULTIPLIER : 1;
  // 💡 FIX: Completion XP now scales by xpMult² (quadratic) instead of
  // xpMult (linear). Previously S-rank completion gave only 5,000 XP —
  // just 0.43% of the run's total XP, making the "completion moment"
  // statistically irrelevant. With quadratic scaling, S-rank completion
  // gives 250,000 XP (~5% of total), SSS gives 1,000,000 XP.
  //   F=64, E=144, D=400, C=1225, B=3600, A=10000,
  //   S=250000, SS=490000, SSS=1000000
  const _completionRankData =
    DUNGEON_RANKS[state.dungeonRank] || DUNGEON_RANKS["F"];
  const _baseCompletionXP = Math.floor(Math.pow(_completionRankData.xpMult || 1, 2) * 100);

  // 💡 ECONOMY REBALANCE (Phase 1): Cut S/SS/SSS completion bonus gold by
  // 60% to combat Zeni inflation. Original values were:
  //   S=50000, SS=70000, SSS=100000
  // New values:
  //   S=20000, SS=28000, SSS=40000
  // Combined with boss goldReward cuts (see bossMechanics.js + classEncounters.js)
  // and per-dungeon gold cap, this should slow inflation significantly.
  // Lower ranks (F-B) unchanged — they were already balanced.
  const rankGoldMap = {
    F: 800, E: 1200, D: 2000, C: 3500, B: 6000, A: 10000,
    S: 20000, SS: 28000, SSS: 40000, DRAGON: 5000
  };
  const _baseBonusGold = rankGoldMap[state.dungeonRank] || 800;

  // 💡 ECONOMY REBALANCE: Per-dungeon gold cap. Prevents absurd luck
  // streaks where a single SSS run dumps 5M+ Zeni into the economy.
  // Cap scales by rank — high ranks can still earn more, just not infinitely.
  // Caps (total gold per run, including bonus + boss + monsters):
  //   F-A: 500K (mostly hit by A-rank lucky streaks)
  //   S: 1M, SS: 2M, SSS: 3M, DRAGON: 800K
  const rankGoldCapMap = {
    F: 500000, E: 500000, D: 500000, C: 500000, B: 500000, A: 500000,
    S: 1000000, SS: 2000000, SSS: 3000000, DRAGON: 800000
  };
  const _runGoldCap = rankGoldCapMap[state.dungeonRank] || 500000;

  // 💡 FIX: Award GP from dungeons. Previously dungeons gave ZERO GP,
  // which meant the GP requirements in ADVENTURER_RANKS (50 → 25,000)
  // could only be earned via chat-spam (1 GP per command). Now each
  // dungeon clear awards GP scaled by rank.
  const rankGpMap = {
    F: 1, E: 2, D: 4, C: 7, B: 12, A: 20, S: 35, SS: 60, SSS: 100, DRAGON: 10
  };
  const _baseGp = rankGpMap[state.dungeonRank] || 1;

  for (const player of state.players) {
    const finalXP = Math.floor(_baseCompletionXP * multiplier);
    let finalGold = Math.floor(player.goldEarned * multiplier);
    let bonusGold = player.isDead ? 0 : _baseBonusGold;
    const gpGain = player.isDead ? 0 : _baseGp;

    // Update stats and rank
    if (!player.isDead) {
      // 💡 Phase 2: Apply guild gold multiplier (MERCHANT +10%, treasury building, etc.)
      let guildGoldMult = 1.0;
      let guildXpMult = 1.0;
      try {
        const guildPerks = require('./guildPerks');
        guildGoldMult = guildPerks.getGoldMultiplier(player.jid);
        guildXpMult = guildPerks.getXpMultiplier(player.jid);
      } catch (e) {}

      // 💡 QA FIX: apply guild bonus BEFORE the gold cap, not after.
      // Previously the cap applied to base gold, then guild bonus was
      // added on top — allowing the total to exceed the cap.
      const guildBonusGold = Math.floor((finalGold + bonusGold) * (guildGoldMult - 1.0));
      const guildBonusXp = Math.floor(finalXP * (guildXpMult - 1.0));

      // 💡 QA FIX: apply gold cap to the COMBINED total (base + guild bonus)
      let totalGoldThisRun = finalGold + bonusGold + guildBonusGold;
      if (totalGoldThisRun > _runGoldCap) {
        const cut = totalGoldThisRun - _runGoldCap;
        const ratio = _runGoldCap / totalGoldThisRun;
        finalGold = Math.floor(finalGold * ratio);
        bonusGold = Math.floor(bonusGold * ratio);
        totalGoldThisRun = finalGold + bonusGold; // recalculate without guild bonus (it's absorbed)
        msg += `${player.class.icon} *${player.name}*\n  ⭐ XP: ${finalXP + guildBonusXp}\n  💰 Gold: ${totalGoldThisRun} _(capped at ${_runGoldCap.toLocaleString()} — saved ${cut.toLocaleString()} from inflation)_\n  🏅 GP: +${gpGain}\n  ${player.isDead ? "💀 Fallen" : "✅ Survived"}\n\n`;
      } else {
        msg += `${player.class.icon} *${player.name}*\n  ⭐ XP: ${finalXP + guildBonusXp}\n  💰 Gold: ${totalGoldThisRun}\n  🏅 GP: +${gpGain}\n  ${player.isDead ? "💀 Fallen" : "✅ Survived"}\n\n`;
      }

      economy.addMoney(player.jid, totalGoldThisRun);
      economy.addQuestProgress(player.jid, 0.2, true); // Final act victory
      // Award GP — adventurer rank progression needs this
      if (gpGain > 0) {
        try { progression.awardGP(player.jid, gpGain); } catch (e) {}
      }

      // 💡 Phase 2: Award guild XP from dungeon clear
      // Scaled by dungeon rank: F=5, E=10, D=15, C=20, B=30, A=40, S=60, SS=80, SSS=100
      try {
        const guildPerks = require('./guildPerks');
        const rankXpMap = { F: 5, E: 10, D: 15, C: 20, B: 30, A: 40, S: 60, SS: 80, SSS: 100, DRAGON: 25 };
        const guildXpAward = rankXpMap[state.dungeonRank] || 5;
        guildPerks.awardGuildXp(player.jid, guildXpAward, `Dungeon clear (${state.dungeonRank})`);
        // Also award war points for Phase 7
        guildPerks.awardWarPoints(player.jid, rankXpMap[state.dungeonRank] || 5, 'dungeon');
      } catch (e) {}

      // Add guild bonus to display message if applicable
      if (guildBonusGold > 0 || guildBonusXp > 0) {
        msg += `🏰 *Guild Bonus:* +${guildBonusGold.toLocaleString()} gold, +${guildBonusXp.toLocaleString()} XP\n`;
      }
    } else {
      // Dead player — no gold, no guild bonus
      msg += `${player.class.icon} *${player.name}*\n  ⭐ XP: ${finalXP}\n  💰 Gold: 0\n  🏅 GP: +0\n  💀 Fallen\n\n`;
      economy.addQuestProgress(player.jid, 0, false); // No progress on death
    }

    // 💡 Phase 2: Apply guild XP multiplier to the XP award
    let xpToAward = finalXP;
    try {
      const guildPerks = require('./guildPerks');
      const guildXpMult = guildPerks.getXpMultiplier(player.jid);
      xpToAward = Math.floor(finalXP * guildXpMult);
    } catch (e) {}
    progression.awardXP(player.jid, xpToAward);

    const rankUpdate = economy.updateAdventurerRank(player.jid);
    if (rankUpdate && rankUpdate.ranked_up) {
      msg += `🎊 *RANK UP!* 🎊\n  ${player.name} is now ${rankUpdate.rank_data.icon} *${rankUpdate.new_rank}*!\n\n`;
    }
  }

  if (state.mode === "PERMADEATH") {
    msg += `\n🏅 *PERMADEATH MODE CONQUERED!*\n`;
  }

  try {
    await sock.sendMessage(state.chatId, { text: msg });
  } catch (err) {
    console.error("Failed to send adventure end message:", err.message);
  }

  state.active = false;
  deleteGameState(sessionKey); // Full cleanup
}

// ==========================================
// 🛒 SHOP SYSTEM
// ==========================================

const handleBuy = async (chatId, senderJid, itemIndex) => {
  const state = getGameState(chatId, senderJid);
  if (!state) return "❌ No active adventure!";

  const isShoppingPhase = state.phase === "SHOPPING";
  const isMerchantActive =
    state.isMerchantActive && state.currentEncounter?.type === "MERCHANT";

  if (!isShoppingPhase && !isMerchantActive) {
    return "❌ Shop is closed!";
  }

  const player = state.players.find((p) => p.jid === senderJid);
  if (!player) {
    return "❌ You're not in the party!";
  }

  const index = parseInt(itemIndex) - 1;
  let itemKey;

  if (isMerchantActive) {
    itemKey = state.currentEncounter.shopItems[index];
  } else {
    itemKey = SHOP_LIST[index];
  }

  if (!itemKey || !CONSUMABLES[itemKey]) {
    return "❌ Invalid item number!";
  }

  const item = CONSUMABLES[itemKey];
  const balance = economy.getBalance(senderJid);
  if (balance < item.cost) {
    return `❌ Insufficient funds! Need ${botConfig.getCurrency().symbol}${item.cost}`;
  }

  economy.removeMoney(senderJid, item.cost);

  if (item.effect === "bundle" && item.items) {
    for (const subKey of item.items) {
      const subInfo = lootSystem.getItemInfo(subKey);
      await inventorySystem.addItem(senderJid, subKey, 1, {
        name: subInfo.name,
        value: subInfo.value,
        rarity: subInfo.rarity || "COMMON",
        source: "QUEST_SHOP_BUNDLE",
      });
    }
    return `✅ Purchased bundle ${item.icon} *${item.name}*! Items added to bag.`;
  }

  // Get item info from loot database for persistence
  const itemInfo = lootSystem.getItemInfo(itemKey);

  await inventorySystem.addItem(senderJid, itemKey, 1, {
    name: itemInfo.name,
    value: itemInfo.value,
    rarity: itemInfo.rarity || "COMMON",
    source: "QUEST_SHOP",
  });

  return `✅ Purchased ${item.icon} *${item.name}*!`;
};

// ==========================================
// 🎯 COMBAT COMMAND HANDLER
// ==========================================

const handleCombatAction = async (
  sock,
  chatId,
  senderJid,
  actionType,
  target,
) => {
  const state = getGameState(chatId, senderJid);
  if (!state || !state.inCombat) {
    return "❌ Not in combat!";
  }

  const player = state.players.find((p) => p.jid === senderJid);
  if (!player || player.isDead) {
    // If solo and player is dead but state wasn't cleaned up (checkCombatEnd failed
    // silently after an enemy kill), force-end combat so the player isn't stuck.
    if (state.solo && state.inCombat) {
      state.inCombat = false;
      state.combatProcessing = false;
      const sessionKey = chatId + '_' + senderJid;
      endCombat(sock, false, sessionKey).catch(() => {});
      return "💀 *You have fallen!* Quest ended.";
    }
    return player?.isDead
      ? "💀 *You have fallen in battle!* Wait for your allies or the battle to end."
      : "❌ You can't act!";
  }

  const current = state.activeCombatant;
  if (!current || current.jid !== senderJid) {
    const turnName = current ? current.name : "Enemy";
    return `⏳ *IT'S NOT YOUR TURN!* \n\nWaiting for: *${turnName}*`;
  }

  if (state.pendingActions[senderJid]) {
    return "❌ Action already chosen!";
  }

  let normalizedAction = actionType;
  if (actionType === "atk") normalizedAction = "attack";
  if (actionType === "def") normalizedAction = "defend";
  if (actionType === "skill") normalizedAction = "ability";

  let action = { type: normalizedAction };

  if (normalizedAction === "attack") {
    if (target !== undefined && target !== "") {
      const targetIndex = parseInt(target) - 1;
      if (
        !isNaN(targetIndex) &&
        targetIndex >= 0 &&
        targetIndex < state.enemies.length
      ) {
        action.targetIndex = targetIndex;
      }
    }
    // Default to first alive enemy if not specified or invalid
    if (action.targetIndex === undefined) {
      action.targetIndex = state.enemies.findIndex((e) => e.stats.hp > 0);
    }
  }

  if (normalizedAction === "ability") {
    // Parse target string "1 2" -> index=1, target=2
    const parts = (target || "").toString().split(" ");
    const abilityIndex = parts[0];
    const abilityTarget = parts[1];

    if (!abilityIndex) {
      return `❌ Specify ability number!\n\nExample: \`${botConfig.getPrefix()} combat ability 1\` or \`${botConfig.getPrefix()} combat ability 1 2\``;
    }

    // Check ability validity first
    const result = await useAbility(
      sock,
      player,
      abilityIndex,
      abilityTarget,
      chatId,
    );

    if (!result.success) {
      return result.message;
    }

    action.abilityIndex = abilityIndex;
    action.targetIndex = parseInt(abilityTarget) - 1;
    if (isNaN(action.targetIndex)) action.targetIndex = 0; // Default to first enemy
    action.result = result;
  }

  if (normalizedAction === "item") {
    const inventory = inventorySystem.formatInventory(player.jid);
    if (inventory.isEmpty) return "❌ Your bag is empty!";

    const usableItems = inventory.items.filter((item) => {
      const info = lootSystem.getItemInfo(item.id);
      return (info && info.usable) || !!CONSUMABLES[item.id];
    });

    if (usableItems.length === 0) {
      return "❌ You have no usable items in your bag!";
    }

    if (!target || target.trim() === "") {
      let msg = `🎒 *USABLE COMBAT ITEMS* 🎒\n━━━━━━━━━━━━━━━━\n`;
      usableItems.forEach((item, i) => {
        const info = {
          ...lootSystem.getItemInfo(item.id),
          ...(CONSUMABLES[item.id] || {})
        };
        msg += `*${i + 1}.* ${info.name} x${item.quantity}\n_${info.description || ''}_\n\n`;
      });
      msg += `━━━━━━━━━━━━━━━━\n💡 *Usage:* \`${botConfig.getPrefix()} combat item <number>\` (e.g. \`combat item 1\`)`;
      return msg;
    }

    const itemIndex = parseInt(target) - 1;
    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= usableItems.length) {
      return `❌ Invalid item number! Type \`${botConfig.getPrefix()} combat item\` to see all usable items and their numbers.`;
    }

    const selectedItem = usableItems[itemIndex];
    action.itemId = selectedItem.id;
    // Optional second target for items
    const parts = (target || "").toString().split(" ");
    if (parts[1]) {
      action.targetIndex = parseInt(parts[1]) - 1;
    } else {
      action.targetIndex = 0;
    }
  }

  state.pendingActions[senderJid] = action;

  // Execute action immediately
  const sessionKey = state.solo ? `${chatId}_${senderJid}` : chatId;
  await performAction(sock, player, action, sessionKey);

  return null; // Action processed
};

// ==========================================
// 🎯 USE ABILITY IN COMBAT
// ==========================================

async function useAbility(sock, player, abilityIndex, targetIndex, chatId) {
  const user = economy.getUser(player.jid);
  const userClass = economy.getUserClass(player.jid);

  if (!user || !user.skills) {
    return {
      success: false,
      message: `${player.name} has no abilities learned!`,
    };
  }

  // Get all learned abilities from lineage (to match PvP order and de-duplicate)
  const learnedAbilities = [];
  const classSystem = require('./classSystem');
  const lineage = classSystem.getLineage(userClass.id);
  const seen = new Set();
  
  for (const cId of lineage) {
    const tree = skillTree.SKILL_TREES[cId.toUpperCase()];
    if (!tree) continue;
    for (const [, treeData] of Object.entries(tree.trees)) {
      for (const [skillId, skill] of Object.entries(treeData.skills)) {
        const level = user.skills[skillId] || 0;
        if (level > 0 && !seen.has(skillId)) {
          seen.add(skillId);
          const getVal = (val, lvl) =>
            Array.isArray(val) ? val[Math.min(lvl - 1, val.length - 1)] : val;
          const energyCost = skill.cost || getVal(skill.energyCost, level) || 0;

          learnedAbilities.push({
            ...skill,
            id: skillId,
            level,
            cost: energyCost,
            skillLevel: level,
          });
        }
      }
    }
  }

  if (learnedAbilities.length === 0) {
    return {
      success: false,
      message: `${player.name} has no abilities learned!`,
    };
  }

  // Get all mirrored abilities
  if (user.borrowedSkills && user.borrowedSkills.length > 0) {
    user.borrowedSkills.forEach((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        // 💡 FIX: handle both scalar `cost` and array `energyCost` (skillTree uses
        // arrays for advanced classes). The old `s.cost || s.energyCost || 0` form
        // coerced the array to a string, then *1.5 → NaN, which corrupted
        // player.stats.energy permanently and produced infinite mana.
        const rawCost = typeof s.cost === 'number'
          ? s.cost
          : Array.isArray(s.energyCost)
            ? (s.energyCost[0] || 0)
            : (typeof s.energyCost === 'number' ? s.energyCost : 0);
        const mirroredCost = Math.floor(rawCost * 1.5); // 50% more energy for mirrored
        learnedAbilities.push({
          ...s,
          level: 1,
          skillLevel: 1,
          cost: mirroredCost,
          isMirrored: true,
        });
      }
    });
  }

  // Get the ability
  const index = parseInt(abilityIndex) - 1;
  const ability = learnedAbilities[index];

  if (!ability) {
    return {
      success: false,
      message: `Invalid ability! Use \`${botConfig.getPrefix()} abilities\` to see your abilities.`,
    };
  }

  // Check if passive
  if (ability.cost === 0) {
    return {
      success: false,
      message: `❌ *${ability.name}* is a passive ability and cannot be manually activated!`,
    };
  }

  // Get effect
  const effect = skillTree.getSkillEffect(ability, ability.skillLevel);

  // 💡 Phase 3: Apply socketed rune modifiers to the skill effect.
  // Loads any runes the user has socketed into this skill from MongoDB
  // and applies their modifiers (damage mult, energy cost, target bonus, etc.)
  // 💡 QA FIX: moved this block BEFORE the energy check so rune-modified
  // energy costs are actually enforced. Previously the energy check used
  // the base ability.cost, ignoring POWER (+10-20% cost) and EFFICIENCY
  // (-20-40% cost) runes entirely.
  let runeModifiedEffect = effect;
  try {
    const runeSystem = require('./runeSystem');
    const socketedRunes = await runeSystem.getSocketedRunes(player.jid, ability.id);
    if (socketedRunes && socketedRunes.length > 0) {
      runeModifiedEffect = runeSystem.applyRuneModifiers(effect, socketedRunes);
    }
  } catch (e) {
    // Rune system is optional — fall through with unmodified effect
  }

  // 💡 QA FIX: use runeModifiedEffect.cost (if available) instead of ability.cost
  // so POWER/EFFICIENCY runes actually affect energy consumption.
  const effectiveCost = Number.isFinite(runeModifiedEffect.cost) ? runeModifiedEffect.cost
    : (Number.isFinite(ability.cost) ? ability.cost : Infinity);
  const safeEnergy = Number.isFinite(player.stats.energy) ? player.stats.energy : 0;
  if (safeEnergy < effectiveCost) {
    return {
      success: false,
      message: `Not enough energy! Need ${effectiveCost}, have ${Math.floor(safeEnergy)}`,
    };
  }

  // Consume energy (clamped to 0 — never let NaN/Infinity sneak through)
  player.stats.energy = Math.max(0, (player.stats.energy || 0) - (effectiveCost === Infinity ? 0 : effectiveCost));

  // Apply ability effect (using rune-modified effect if runes are socketed)
  const result = await applyAbilityEffect(
    sock,
    player,
    ability,
    runeModifiedEffect,
    targetIndex,
    chatId,
  );

  return {
    success: true,
    abilityName: ability.name,
    ...result,
  };
}

// ==========================================
// 💫 APPLY ABILITY EFFECTS
// ==========================================

async function applyAbilityEffect(
  sock,
  player,
  ability,
  effect,
  targetIndex,
  chatId,
) {
  // Use player.jid to find solo state correctly
  const state = player?.jid
    ? getGameState(chatId, player.jid)
    : getGameState(chatId);
  if (!state) return;
  // Derive sessionKey from state for use in checkCombatEnd
  const sessionKey =
    state.sessionKey ||
    (state.solo ? `${state.chatId}_${state.players[0]?.jid}` : state.chatId);
  const icon = player.class?.icon || "👤";
  let animation = ability.animation || effect?.animation || "";
  if (animation === "undefined") animation = "";
  const animStr = animation ? `${animation} ` : "";
  let msg = `${icon} ${player.name} uses ${animStr}*${ability.name}*!\n\n`;
  let totalDamage = 0;
  let totalHealing = 0;

  // DAMAGE ABILITIES
  // 💡 QA FIX: removed "multi_hit" from damageKeywords — it caused multi-hit
  // abilities to run BOTH the generic single-target damage block AND the
  // dedicated multi_hit block, dealing damage twice and double-counting kills.
  const damageKeywords = ["damage", "attack", "execute", "stun", "chain", "smite_evil", "ignore_armor", "hybrid", "dot", "cc", "guaranteed_crit"];
  const isDamageType = damageKeywords.some((t) => effect.type && effect.type.includes(t));
  if (isDamageType && !effect.type.includes("heal_team")) {
    if (!player.isEnemy) {
        const durabilitySystem = require('./durabilitySystem');
        durabilitySystem.applyWear(player, 'main_hand', { combatHistory: state.combatHistory });
        if (player.equipment?.off_hand) {
            const lootSystem = require('./lootSystem');
            const offHandInfo = lootSystem.getItemInfo(player.equipment.off_hand.id);
            if (offHandInfo && offHandInfo.type === 'EQUIPMENT' && (offHandInfo.slot === 'weapon' || offHandInfo.slot === 'main_hand' || offHandInfo.slot === 'off_hand')) {
                durabilitySystem.applyWear(player, 'off_hand', { combatHistory: state.combatHistory });
            }
        }
    }
    const targets = getTargets(player, effect, targetIndex, chatId);
    for (let _tIdx = 0; _tIdx < targets.length; _tIdx++) {
      const target = targets[_tIdx];
      if (target.stats.hp <= 0) continue;

      // 💡 AOE CRIT DIMINISHING RETURNS: each successive hit in one cast loses 15% crit chance
      // so full-wave crits require 70%+ crit to be common, not 50%.
      const _critPenalty = _tIdx * 15;
      const _originalCrit = player.stats.crit;
      if (_tIdx > 0 && _critPenalty > 0) {
        player.stats.crit = Math.max(0, (_originalCrit || 0) - _critPenalty);
      }

      // 💡 DRAGON SEAL RING REQUIREMENT
      if (
        target.id &&
        (() => { const _id = String(target.id || '').toUpperCase(); return _id.startsWith("DRAKE") || _id.includes("DRAGON"); })()
      ) {
        if (!player.isEnemy && player.jid) {
          // 💡 FIX: accept equipped ring too (see calculateDamage for full comment)
          const hasRingInBag = inventorySystem.hasItem(player.jid, "dragon_seal_ring");
          const hasRingEquipped = player.equipment && player.equipment.ring && player.equipment.ring.id === 'dragon_seal_ring';
          if (!hasRingInBag && !hasRingEquipped) {
            msg += `🛡️ Your attacks slide off ${target.name}'s scales! You need the *Dragon Seal Ring* 💍🐲 to pierce their hide!\n`;
            continue;
          }
        }
      }

      const lvl = player.level || 1;
      const damageTypeStr = effect.damageType === "magic" ? "magic" : "physical";
      const baseStat = effect.damageType === "magic"
        ? (player.stats.mag || player.stats.atk || lvl * 10)
        : (player.stats.atk || lvl * 8);
      let mult = Number(effect.multiplier) || 1.0;
      if (!player.isEnemy && player.equipment?.main_hand) {
          try {
              const weaponSynergy = require('./weaponSynergy');
              const synergyMult = weaponSynergy.getSkillSynergyMultiplier(player, effect, player.equipment.main_hand);
              mult *= synergyMult;
          } catch (e) {}
      }
      // Bug 2 fix: compute raw power then route through calculateDamage() for
      // proper DEF mitigation, buffs, status modifiers, rank bonuses, variance.
      const rawPower = Math.floor(baseStat * mult);
      const dmgResult = calculateDamage(player, target, rawPower, damageTypeStr, damageTypeStr.toUpperCase(), chatId, true);
      // Restore crit stat after the AOE crit penalty was applied for this hit
      if (_tIdx > 0) player.stats.crit = _originalCrit;

      // Check dragon-seal block
      if (dmgResult.noDamageReason) {
        msg += `${dmgResult.noDamageReason}\n`;
        continue;
      }

      // Evasion check — 💡 QA FIX: PIERCE rune (effect.cannotEvade) bypasses evasion
      if (dmgResult.wasEvaded) {
        if (effect.cannotEvade) {
          msg += `⚔️ ${target.name} tried to evade but the attack PIERCES through!\n`;
          // Recalculate with evasion disabled — deal minimum damage
          dmgResult.wasEvaded = false;
          dmgResult.damage = Math.max(1, Math.floor((player.stats.atk || 10) * (effect.multiplier || 1) * 0.5));
        } else {
          const targetIcon2 = target.isEnemy ? target.icon : target.class?.icon || "👤";
          msg += `💨 ${targetIcon2} ${target.name} *evades* the attack!\n`;
          continue;
        }
      }
      let damage = dmgResult.damage;
      let isCrit = dmgResult.isCrit || false;

      // Extra crit override (guaranteedCrit / critBonus)
      if (effect.guaranteedCrit && !isCrit) {
        isCrit = true;
        damage = Math.floor(damage * 2.0);
      } else if (effect.critBonus && !isCrit) {
        const extraCrit = effect.critBonus;
        if (Math.random() * 100 < extraCrit) {
          isCrit = true;
          damage = Math.floor(damage * 2.0);
        }
      }

      // 💡 FIX: ignoreDefense now REDUCES the defense mitigation that was
      // already applied by calculateDamage(), instead of adding bonus damage.
      // The old code added def*(ignoreDefense/100) as BONUS damage, which
      // meant a skill with ignoreDefense:60 against a target with 8000 DEF
      // would deal MORE damage than against a target with 0 DEF. That's
      // backwards — ignoreDefense should reduce how much defense matters,
      // not punish high-DEF targets.
      //
      // calculateDamage already subtracted def*0.5. We add back a fraction
      // of that subtraction proportional to ignoreDefense:
      //   ignoreDefense:50 → adds back 50% of what DEF subtracted
      //   ignoreDefense:100 → adds back 100% (full defense bypass)
      if (effect.ignoreDefense) {
        const defSubtracted = Math.floor((target.stats.def || 0) * 0.5);
        const refund = Math.floor(defSubtracted * (effect.ignoreDefense / 100));
        damage += refund;
      }

      // Execute mechanics
      if (effect.type === "execute") {
        const hpPercent = (target.stats.hp / target.stats.maxHp) * 100;
        if (hpPercent <= effect.threshold) {
          damage = Math.floor(damage * 2.5);
          msg += `⚡ *EXECUTE THRESHOLD!* ⚡\n`;
        }
      }

      damage = Math.max(1, Math.floor(damage));

      // Apply damage
      target.stats.hp -= damage;
      target.currentHP = target.stats.hp; // Sync V2
      totalDamage += damage;

      if (!target.isEnemy) {
          const durabilitySystem = require('./durabilitySystem');
          durabilitySystem.applyWear(target, 'ARMOR_PIECES', { combatHistory: state.combatHistory, amount: 0.5 });
      }

      if (target.stats.hp > 0 && target.isBoss) {
        await checkBossPhase(sock, target, chatId);
      }

      if (target.stats.hp <= 0) {
        target.justDied = true;
      }
      const targetIcon = target.isEnemy
        ? target.icon
        : target.class?.icon || "👤";
      msg += `💥 ${targetIcon} ${target.name} takes ${damage} damage!`;
      if (isCrit) msg += ` 💥 *CRITICAL HIT!*`;
      msg += `\n`;

      // Death check
      if (target.stats.hp <= 0) {
        // 💡 OVERKILL EXECUTION BONUS
        const overkillThreshold = target.stats.hp + damage;
        if (damage > overkillThreshold * 2.0) {
          const bonusGold = Math.floor(target.goldReward * 0.1) || 50;
          if (!player.isEnemy) {
            player.goldEarned = (player.goldEarned || 0) + bonusGold;
          }
          msg += `⚡ *OVERKILL!* +${bonusGold} Zeni execution bonus!\n`;
        }

        msg += `💀 ${target.name} has been defeated!\n`;
        target.isDead = true;
        target.currentHP = 0; // Sync
        if (player.combatStats) {
          player.combatStats.kills = (player.combatStats.kills || 0) + 1;
        }
        // 💡 Track quest stats (moved out of checkCombatEnd so abilities are counted)
        recordEnemyKill(state, target);
        // Note: checkCombatEnd is called by performAction AFTER the full ability message
        // is sent, so the damage text always shows before the victory screen.
      }

      // Apply DoT (Damage over Time)
      if (effect.dot) {
        const sRes = applyStatusEffect(
          target,
          effect.dot,
          effect.dotDuration,
          effect.dotDamage,
          player.name,
        );
        msg += `🔥 Applied ${effect.dot}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ""}\n`;
      }

      // Apply CC (Crowd Control)
      if (effect.cc && Math.random() * 100 < (effect.ccChance || 100)) {
        const sRes = applyStatusEffect(
          target,
          effect.cc,
          effect.ccDuration,
          0,
          player.name,
        );
        msg += `💫 Applied ${effect.cc}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ""}\n`;
      }
    }

    if (player.combatStats) {
      player.combatStats.damageDealt =
        (player.combatStats.damageDealt || 0) + totalDamage;
    }
  }

  // AOE ABILITIES
  if (effect.type === "aoe") {
    const opponentSide = player.isEnemy
      ? state.players.filter((p) => !p.isDead)
      : state.enemies.filter((e) => e.stats.hp > 0);
    const numTargets = Math.min(effect.targets || 99, opponentSide.length);

    for (let i = 0; i < numTargets; i++) {
      const target = opponentSide[i];
      if (!target) continue;

      // 💡 DRAGON SEAL RING REQUIREMENT
      if (
        target.id &&
        (() => { const _id = String(target.id || '').toUpperCase(); return _id.startsWith("DRAKE") || _id.includes("DRAGON"); })()
      ) {
        if (!player.isEnemy && player.jid) {
          // 💡 FIX: accept equipped ring too (see calculateDamage for full comment)
          const hasRingInBag = inventorySystem.hasItem(player.jid, "dragon_seal_ring");
          const hasRingEquipped = player.equipment && player.equipment.ring && player.equipment.ring.id === 'dragon_seal_ring';
          if (!hasRingInBag && !hasRingEquipped) {
            msg += `🛡️ AOE slides off ${target.name}'s scales!\n`;
            continue;
          }
        }
      }

      // Bug 2 fix (AOE block): route through calculateDamage() for DEF mitigation.
      const aoeDmgTypeStr = effect.damageType === "magic" ? "magic" : "physical";
      const aoeBaseStat = effect.damageType === "magic" ? player.stats.mag : player.stats.atk;
      let aoeMult = effect.multiplier || 1.0;
      if (!player.isEnemy && player.equipment?.main_hand) {
          try {
              const weaponSynergy = require('./weaponSynergy');
              const synergyMult = weaponSynergy.getSkillSynergyMultiplier(player, effect, player.equipment.main_hand);
              aoeMult *= synergyMult;
          } catch (e) {}
      }
      const aoeRawPower = Math.floor((aoeBaseStat || 0) * aoeMult);
      const aoeDmgResult = calculateDamage(player, target, aoeRawPower, aoeDmgTypeStr, aoeDmgTypeStr.toUpperCase(), chatId, true);

      if (aoeDmgResult.noDamageReason) {
        msg += `🛡️ AOE slides off ${target.name}'s scales!\n`;
        continue;
      }

      // Evasion check — 💡 QA FIX: PIERCE rune bypasses evasion for AOE too
      if (aoeDmgResult.wasEvaded) {
        if (effect.cannotEvade) {
          msg += `⚔️ ${target.name} tried to evade but the AOE PIERCES through!\n`;
          aoeDmgResult.wasEvaded = false;
          aoeDmgResult.damage = Math.max(1, Math.floor((player.stats.atk || 10) * (effect.multiplier || 1) * 0.5));
        } else {
          msg += `💨 ${target.name} *evades* the AOE!\n`;
          continue;
        }
      }
      let damage = aoeDmgResult.damage;
      let isCrit = aoeDmgResult.isCrit || false;

      // 💡 QA FIX: FOCUS rune critBonus for AOE (was missing — only applied to single-target)
      if (effect.critBonus && !isCrit) {
        if (Math.random() * 100 < effect.critBonus) {
          isCrit = true;
          damage = Math.floor(damage * 2.0);
        }
      }

      // Ignore defense bonus
      if (effect.ignoreDefense) {
        const defReduction = Math.floor(
          target.stats.def * (effect.ignoreDefense / 100),
        );
        damage += defReduction;
      }

      damage = Math.max(1, Math.floor(damage));

      target.stats.hp -= damage;
      target.currentHP = target.stats.hp; // Sync V2
      totalDamage += damage;

      if (!target.isEnemy) {
          const durabilitySystem = require('./durabilitySystem');
          durabilitySystem.applyWear(target, 'ARMOR_PIECES', { combatHistory: state.combatHistory, amount: 0.5 });
      }

      if (target.stats.hp > 0 && target.isBoss) {
        await checkBossPhase(sock, target, chatId);
      }

      if (target.stats.hp <= 0) {
        target.justDied = true;
      }
      msg += `💥 ${target.icon} ${target.name} takes ${damage} damage!`;
      if (isCrit) msg += ` 💥 *CRITICAL HIT!*`;
      msg += `\n`;

      // Apply DoT (Damage over Time)
      if (effect.dot) {
        const sRes = applyStatusEffect(
          target,
          effect.dot,
          effect.dotDuration,
          effect.dotDamage,
          player.name,
        );
        msg += `🔥 Applied ${effect.dot} to ${target.name}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ""}\n`;
      }

      // Apply CC (Crowd Control)
      if (effect.cc && Math.random() * 100 < (effect.ccChance || 100)) {
        const sRes = applyStatusEffect(
          target,
          effect.cc,
          effect.ccDuration,
          0,
          player.name,
        );
        msg += `💫 Applied ${effect.cc} to ${target.name}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ""}\n`;
      }
      // Apply Specific Debuffs (Slow, etc found in keys)
      ["slow", "stun", "freeze", "burn", "shock", "poison"].forEach(
        (debuff) => {
          if (effect[debuff] !== undefined) {
            // Check if it's a value or object, though flattening makes it a value usually
            const val = effect[debuff];
            const dur = effect[debuff + "Duration"] || 2;
            const sRes = applyStatusEffect(
              target,
              debuff,
              dur,
              val,
              player.name,
            );
            msg += `📉 Applied ${debuff} to ${target.name}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ""}\n`;
          }
        },
      );
      if (target.stats.hp <= 0) {
        // 💡 OVERKILL EXECUTION BONUS
        const overkillThreshold = target.stats.hp + damage;
        if (damage > overkillThreshold * 2.0) {
          const bonusGold = Math.floor(target.goldReward * 0.1) || 50;
          if (!player.isEnemy) {
            player.goldEarned = (player.goldEarned || 0) + bonusGold;
          }
          msg += `⚡ *OVERKILL!* +${bonusGold} Zeni execution bonus!\n`;
        }

        msg += `💀 ${target.name} defeated!\n`;
        target.isDead = true;
        target.currentHP = 0; // Sync
        if (player.combatStats) {
          player.combatStats.kills = (player.combatStats.kills || 0) + 1;
        }
        // 💡 Track quest stats for every kill in the AOE sweep
        recordEnemyKill(state, target);
        // Note: checkCombatEnd called by performAction after full message is sent.
      }
    }
    if (player.combatStats) {
      player.combatStats.damageDealt =
        (player.combatStats.damageDealt || 0) + totalDamage;
    }
  }

  // 🧪 PROCESS RESOLVED EFFECTS (Structured multiple effects support)
  if (effect.resolvedEffects) {
    for (const [effId, effData] of Object.entries(effect.resolvedEffects)) {
      if (effId === "heal") {
        const target = getHealTarget(player, targetIndex, chatId);
        if (target) {
          const hMult = getHealMult(chatId);
          const rawHeal = Number(effData.value) || 0;
          const maxHpVal = target.stats.maxHp || target.stats.hp || 100;
          const healAmount = Math.max(0, Math.min(
            Math.floor(rawHeal * hMult),
            maxHpVal - target.stats.hp,
          ));
          target.stats.hp += healAmount;
          target.currentHP = target.stats.hp;
          totalHealing += healAmount;

          const targetIcon = target.class?.icon || "👤";
          msg += `💚 ${targetIcon} ${target.name} healed for ${healAmount} HP!${hMult < 1 ? " (Healing Reduced)" : hMult > 1 ? " (Holy Ground!)" : ""}\n`;
        }
      }
      else if (effId === "heal_team") {
        const friendlySide = player.isEnemy
          ? state.enemies.filter((e) => e.stats.hp > 0)
          : state.players.filter((p) => !p.isDead);
        const hMult = getHealMult(chatId);
        for (const ally of friendlySide) {
          const rawHealT = Number(effData.value) || 0;
          const maxHpT = ally.stats.maxHp || ally.stats.hp || 100;
          const healAmount = Math.max(0, Math.min(
            Math.floor(rawHealT * hMult),
            maxHpT - ally.stats.hp,
          ));
          ally.stats.hp += healAmount;
          ally.currentHP = ally.stats.hp;
          totalHealing += healAmount;

          const allyIcon = ally.isEnemy ? ally.icon : ally.class?.icon || "👤";
          msg += `💚 ${allyIcon} ${ally.name} +${healAmount} HP${hMult < 1 ? " (Reduced)" : ""}\n`;
        }
      }
      else if (effId === "buff_self") {
        applyBuff(player, effData.stat, effData.value, effData.duration);
        msg += `✨ ${player.name} gains +${effData.value}% ${effData.stat}!\n`;
      }
      else if (effId === "buff_team") {
        const friendlySide = player.isEnemy
          ? state.enemies.filter((e) => e.stats.hp > 0)
          : state.players.filter((p) => !p.isDead);
        for (const ally of friendlySide) {
          applyBuff(ally, effData.stat, effData.value, effData.duration);
        }
        msg += `✨ ${player.isEnemy ? "Enemy" : "Player"} team gains +${effData.value}% ${effData.stat} for ${effData.duration} turns!\n`;
      }
      else if (effId === "buff_target") {
        const target = getHealTarget(player, targetIndex, chatId);
        if (target) {
          applyBuff(target, effData.stat, effData.value, effData.duration);
          msg += `✨ ${target.name} gains +${effData.value}% ${effData.stat}!\n`;
        }
      }
      else if (effId === "debuff_target") {
        const targets = getTargets(player, effect, targetIndex, chatId);
        const target = targets[0];
        if (target) {
          applyDebuff(target, effData.stat, effData.value, effData.duration);
          msg += `💀 ${target.name} receives -${effData.value}% ${effData.stat}!\n`;
        }
      }
      else if (effId === "debuff_enemies") {
        const opponentSide = player.isEnemy
          ? state.players.filter((p) => !p.isDead)
          : state.enemies.filter((e) => e.stats.hp > 0);
        for (const target of opponentSide) {
          applyDebuff(target, effData.stat, effData.value, effData.duration);
        }
        msg += `💀 All enemies receive -${effData.value}% ${effData.stat}!\n`;
      }
      else if (effId === "stun" || effId === "freeze" || effId === "sleep") {
        const targets = getTargets(player, effect, targetIndex, chatId);
        for (const target of targets) {
          if (Math.random() * 100 < (effData.chance || 100)) {
            applyStatusEffect(target, effId, effData.duration || 1);
            msg += `💫 ${target.name} is ${effId.toUpperCase()}NED for ${effData.duration || 1} turn(s)!\n`;
          }
        }
      }
      else if (effId === "haste") {
        const targets = getTargets(player, effect, targetIndex, chatId);
        for (const target of targets) {
          applyStatusEffect(target, "haste", effData.duration || 3, effData.value || 30);
          msg += `⚡ ${target.name} gains Haste!\n`;
        }
      }
      else if (effId === "haste_team") {
        const friendlySide = player.isEnemy
          ? state.enemies.filter((e) => e.stats.hp > 0)
          : state.players.filter((p) => !p.isDead);
        for (const ally of friendlySide) {
          applyStatusEffect(ally, "haste", effData.duration || 3, effData.value || 30);
        }
        msg += `⚡ Friendly team gains Haste!\n`;
      }
      // 💡 FIX: energyRestore was declared by mana_drain (skillTree.js:1176)
      // but had no handler — Mana Drain dealt damage but never restored energy.
      else if (effId === "energyRestore") {
        if (!player.isEnemy) {
          const restore = Math.min(
            Math.floor(effData.value),
            (player.stats.maxEnergy || 100) - (player.stats.energy || 0),
          );
          if (restore > 0) {
            player.stats.energy = (player.stats.energy || 0) + restore;
            msg += `⚡ ${player.name} restores ${restore} energy!\n`;
          }
        }
      }
      // 💡 FIX: magDebuff was declared by mana_drain (skillTree.js:1177)
      // but had no handler — Magick defense was never reduced on target.
      else if (effId === "magDebuff") {
        const targets = getTargets(player, effect, targetIndex, chatId);
        for (const target of targets) {
          applyDebuff(target, 'mag', effData.value, effData.duration || 2);
        }
        msg += `📉 Targets lose -${effData.value}% MAG for ${effData.duration || 2} turns!\n`;
      }
    }
    if (!player.isEnemy) {
      player.combatStats.healed = (player.combatStats.healed || 0) + totalHealing;
    }
  } else {
    // HEALING ABILITIES
    if (effect.type === "heal" || effect.type.includes("heal")) {
      const target = getHealTarget(player, targetIndex, chatId);
      if (target) {
        const hMult = getHealMult(chatId);
        const rawHealE = Number(effect.value) || 0;
        const maxHpE = target.stats.maxHp || target.stats.hp || 100;
        const healAmount = Math.max(0, Math.min(
          Math.floor(rawHealE * hMult),
          maxHpE - target.stats.hp,
        ));
        target.stats.hp += healAmount;
        target.currentHP = target.stats.hp;
        totalHealing += healAmount;

        const targetIcon = target.class?.icon || "👤";
        msg += `💚 ${targetIcon} ${target.name} healed for ${healAmount} HP!${hMult < 1 ? " (Healing Reduced)" : hMult > 1 ? " (Holy Ground!)" : ""}\n`;
        if (!player.isEnemy && player.combatStats) {
          player.combatStats.healed = (player.combatStats.healed || 0) + healAmount;
        }
      }
    }

    // TEAM HEAL
    if (effect.type === "heal_team") {
      const friendlySide = player.isEnemy
        ? state.enemies.filter((e) => e.stats.hp > 0)
        : state.players.filter((p) => !p.isDead);
      const hMult = getHealMult(chatId);
      for (const ally of friendlySide) {
        const rawHealET = Number(effect.value) || 0;
        const maxHpET = ally.stats.maxHp || ally.stats.hp || 100;
        const healAmount = Math.max(0, Math.min(
          Math.floor(rawHealET * hMult),
          maxHpET - ally.stats.hp,
        ));
        ally.stats.hp += healAmount;
        ally.currentHP = ally.stats.hp;
        totalHealing += healAmount;

        const allyIcon = ally.isEnemy ? ally.icon : ally.class?.icon || "👤";
        msg += `💚 ${allyIcon} ${ally.name} +${healAmount} HP${hMult < 1 ? " (Reduced)" : ""}\n`;
      }
      if (!player.isEnemy)
        player.combatStats.healed =
          (player.combatStats.healed || 0) + totalHealing;
    }

    // BUFF ABILITIES
    if (effect.type.includes("buff")) {
      if (effect.type === "buff_self") {
        if (effect.buffType) {
          applyBuff(player, effect.buffType, effect.value, effect.duration);
          msg += `✨ ${player.name} gains +${effect.value}% ${effect.buffType}!\n`;
        }
        // Handle specific self buffs (Mirror Image etc)
        if (effect.evasion) {
          applyBuff(
            player,
            "evasion",
            effect.evasion,
            effect.evasionDuration || 2,
          );
          msg += `✨ ${player.name} gains Evasion!\n`;
        }
        if (effect.critBuff) {
          applyBuff(
            player,
            "crit",
            effect.critBuff,
            effect.critBuffDuration || 2,
          );
          msg += `✨ ${player.name} gains Crit Chance!\n`;
        }
      } else if (effect.type === "buff_team") {
        const friendlySide = player.isEnemy
          ? state.enemies.filter((e) => e.stats.hp > 0)
          : state.players.filter((p) => !p.isDead);
        for (const ally of friendlySide) {
          applyBuff(ally, effect.buffType, effect.value, effect.duration);
        }
        msg += `✨ ${player.isEnemy ? "Enemy" : "Player"} team gains +${effect.value}% ${effect.buffType} for ${effect.duration} turns!\n`;
      } else if (effect.type === "buff_target") {
        const target = getHealTarget(player, targetIndex, chatId);
        if (target) {
          applyBuff(target, effect.buffType, effect.value, effect.duration);
          msg += `✨ ${target.name} gains +${effect.value}% ${effect.buffType}!\n`;
        }
      }
    }

    // DEBUFF ABILITIES
    if (effect.type.includes("debuff")) {
      if (effect.type === "debuff_target") {
        const targets = getTargets(player, effect, targetIndex, chatId);
        const target = targets[0];
        if (target) {
          applyDebuff(target, effect.debuffType, effect.value, effect.duration);
          msg += `💀 ${target.name} receives -${effect.value}% ${effect.debuffType}!\n`;
        }
      } else if (effect.type === "debuff_enemies") {
        const opponentSide = player.isEnemy
          ? state.players.filter((p) => !p.isDead)
          : state.enemies.filter((e) => e.stats.hp > 0);
        for (const target of opponentSide) {
          applyDebuff(target, effect.debuffType, effect.value, effect.duration);
        }
        msg += `💀 All enemies receive -${effect.value}% ${effect.debuffType}!\n`;
      }
    }

    // REVIVE
    if (effect.type === "revive") {
      const deadFriendly = player.isEnemy
        ? state.enemies.filter((e) => e.stats.hp <= 0)
        : state.players.filter((p) => p.isDead);
      if (deadFriendly.length > 0) {
        const target = deadFriendly[0];
        target.isDead = false;
        target.stats.hp = Math.floor(
          (target.stats.maxHp || target.stats.hp) *
            ((effect.hpPercent || 50) / 100),
        );
        target.currentHP = target.stats.hp;
        msg += `👼 ${target.name} has been resurrected with ${target.stats.hp} HP!\n`;
        if (!player.isEnemy)
          player.combatStats.healed =
            (player.combatStats.healed || 0) + target.stats.hp;
      } else {
        msg += `(No fallen allies to revive)\n`;
      }
    }

    // MULTI-HIT
    if (effect.type === "multi_hit") {
      const targets = getTargets(player, effect, targetIndex, chatId);
      const target = targets[0];
      if (target) {
        let totalMultiDamage = 0;
        const baseStat =
          effect.damageType === "magic"
            ? player.stats.mag || 10
            : player.stats.atk || 10;
        const dType = effect.damageType === "magic" ? "magic" : "physical";
        const element = effect.element || "PHYSICAL";

        for (let i = 0; i < effect.hits; i++) {
          const { damage, isCrit, wasEvaded } = calculateDamage(
            player,
            target,
            baseStat * effect.multiplier,
            dType,
            element,
            chatId,
            true,
          );
          if (!wasEvaded) {
            target.stats.hp -= damage;
            totalMultiDamage += damage;
          }
        }
        target.currentHP = Math.max(0, target.stats.hp);

        if (target.stats.hp > 0 && target.isBoss) {
          await checkBossPhase(sock, target, chatId);
        }

        if (target.stats.hp <= 0) {
          target.justDied = true;
        }
        msg += `⚡ Hit ${effect.hits} times for ${totalMultiDamage} total damage!\n`;
        player.combatStats.damageDealt =
          (player.combatStats.damageDealt || 0) + totalMultiDamage;

        if (target.stats.hp <= 0) {
          msg += `💀 ${target.name} defeated!\n`;
          target.isDead = true;
          target.currentHP = 0;
          if (player.combatStats) {
            player.combatStats.kills = (player.combatStats.kills || 0) + 1;
          }
          // 💡 Track quest stats — was entirely missing for multi-hit kill path
          recordEnemyKill(state, target);

          // 💡 CRITICAL FIX: Check if combat should end immediately
          if (await checkCombatEnd(sock, state, sessionKey))
            return { applied: true, msg };
        }
      }
    }

    // 🧪 NEW FORMAT SUPPORT (effects object)
    if (effect.effects) {
      for (const [effType, effData] of Object.entries(effect.effects)) {
        const dur = effData.duration || 3;
        const val = Array.isArray(effData.value)
          ? effData.value[
              Math.min((player.level || 1) - 1, effData.value.length - 1)
            ]
          : effData.value || 0;

        const opponentSide = player.isEnemy
          ? state.players.filter((p) => !p.isDead)
          : state.enemies.filter((e) => e.stats.hp > 0);
        const friendlySide = player.isEnemy
          ? state.enemies.filter((e) => e.stats.hp > 0)
          : state.players.filter((p) => !p.isDead);

        // Determine targets based on the skill's overall targeting
        let targets = [];
        const targeting = (effect.targeting || "").toUpperCase();
        if (
          targeting.includes("AOE") ||
          targeting === "ALL_ENEMIES" ||
          targeting === "CHAIN"
        ) {
          targets = opponentSide;
        } else if (targeting === "TEAM" || targeting === "ALL_ALLIES") {
          targets = friendlySide;
        } else if (targeting === "SELF") {
          targets = [player];
        } else {
          targets = [getHealTarget(player, targetIndex, chatId)];
        }

        for (const target of targets) {
          const statusResult = applyStatusEffect(
            target,
            effType,
            dur,
            val,
            player.name,
          );
          if (statusResult.synergyMsg) msg += `\n✨ ${statusResult.synergyMsg}`;
        }
      }
    }
  }

  return { message: msg, damage: totalDamage, healing: totalHealing };
}
// ==========================================
// 🎯 TARGET SELECTION HELPERS
// ==========================================

function getTargets(attacker, effect, targetIndex, chatId) {
  const state = getGameState(chatId);
  if (!state) return [];

  const opponentSide = attacker.isEnemy
    ? state.players.filter((p) => !p.isDead)
    : state.enemies.filter((e) => e.stats.hp > 0);

  const targeting = (effect.targeting || "").toUpperCase();
  if (
    effect.type === "aoe" ||
    targeting.includes("AOE") ||
    targeting === "ALL_ENEMIES" ||
    targeting === "CHAIN"
  ) {
    // Bug 4 fix: cap to actual living opponents — never use a hardcoded 99 fallback
    // that would hit non-existent enemies. effect.targets undefined = hit all living.
    const maxTargets = (effect.targets != null) ? effect.targets : opponentSide.length;
    return opponentSide.slice(0, maxTargets);
  }

  const index = parseInt(targetIndex);
  const target = isNaN(index)
    ? opponentSide[0]
    : attacker.isEnemy
      ? state.players[index]
      : state.enemies[index];

  if (!target || target.isDead || (target.stats && target.stats.hp <= 0)) {
    return opponentSide.length > 0 ? [opponentSide[0]] : [];
  }

  return [target];
}

function getHealTarget(attacker, targetIndex, chatId) {
  const state = getGameState(chatId);
  if (!state) return attacker;

  const friendlySide = attacker.isEnemy
    ? state.enemies.filter((e) => e.stats.hp > 0)
    : state.players.filter((p) => !p.isDead);

  if (targetIndex === undefined || targetIndex === null) {
    return attacker; // Self by default
  }

  const index = parseInt(targetIndex);
  const target = attacker.isEnemy ? state.enemies[index] : state.players[index];

  return target && !target.isDead ? target : attacker;
}
function getHealMult(chatId) {
  const state = getGameState(chatId);
  const env = state?.environment;
  if (!env) return 1.0;

  if (env.id === "TOXIC_CAVE") return 0.7;
  if (env.id === "DEMON_CASTLE") return 0.5;
  if (env.id === "PRE_INFECTED_AFTERLIFE") return 1.5;

  return 1.0;
}
function applyBuff(target, buffType, value, duration) {
  if (!target.buffs) target.buffs = [];

  target.buffs.push({
    type: buffType,
    value: value,
    duration: duration,
    icon: getBuffIcon(buffType),
  });
}

function applyDebuff(target, debuffType, value, duration) {
  if (!target.statusEffects) target.statusEffects = [];

  target.statusEffects.push({
    type: debuffType,
    value: value,
    duration: duration,
    icon: getDebuffIcon(debuffType),
  });
}

function getBuffIcon(buffType) {
  const icons = {
    attack: "⚔️",
    defense: "🛡️",
    speed: "💨",
    magic: "✨",
    evasion: "💫",
    shield: "🔷",
    crit: "🎯",
  };
  return icons[buffType] || "✨";
}

function getDebuffIcon(debuffType) {
  const icons = {
    vulnerability: "💀",
    blind: "🌫️",
    slow: "🐌",
    weak: "😵",
  };
  return icons[debuffType] || "💀";
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
  initAdventure,
  joinAdventure,
  getDungeonMenu,
  stopQuest,
  handleBuy,
  handleCombatAction,
  handleVote: (chatId, jid, vote) => {
    const state = getGameState(chatId, jid);
    if (!state) return "❌ No active adventure!";

    // 🗳️ CHECK VOTE AVAILABILITY FIRST (before phase/combat checks so crossroads always works)
    const isStandardVote = !!(
      state.currentEncounter && state.currentEncounter.choices
    );
    const isBranchingVote = !!(state.isBranching || state.timers?.vote); // timers.vote = crossroads/vote window is open

    if (!isStandardVote && !isBranchingVote) {
      return "❌ No active voting choices at the moment.";
    }

    // Now check if player is eligible to vote
    if (state.voteProcessing) {
      return "❌ Votes are already being processed.";
    }
    if (!state.players.find((p) => p.jid === jid)) {
      return "❌ Not in party.";
    }

    state.votes[jid] = vote;

    // Set flag for next timer adjustment (group only)
    if (!state.solo) {
      state.actionJustTaken = true;
    }

    // Check if all players have voted
    const allVoted = state.players.every((p) => state.votes[p.jid]);

    if (allVoted && state.isBranching) {
      clearTimeout(state.timers.vote);
      const sock = state.sock;
      const sessionKey = state.sessionKey;
      setTimeout(
        () => {
          const v1 = Object.values(state.votes).filter((v) => v === "1").length;
          const v2 = Object.values(state.votes).filter((v) => v === "2").length;
          const winner = v2 > v1 ? "REST" : "ELITE_COMBAT";
          state.isProcessing = false;
          state.isBranching = false;
          processBranchChoice(sock, winner, sessionKey).catch((e) =>
            console.error(
              "[Quest] processBranchChoice error:",
              e?.message || e,
            ),
          );
        },
        state.solo ? 0 : 1000,
      );
      return `🗳️ All votes in! Branching to *${Object.values(state.votes).filter((v) => v === "2").length > Object.values(state.votes).filter((v) => v === "1").length ? "Safe Path" : "Danger Path"}*...`;
    }

    if (allVoted && state.currentEncounter && !state.isBranching) {
      // All players voted - process immediately
      const currentEnc = state.currentEncounter; // Capture to prevent race conditions
      const sessionKey = state.sessionKey;
      state.voteProcessing = true;
      clearTimeout(state.timers.vote);

      // Use setTimeout to avoid blocking
      const sock = state.sock;
      setTimeout(
        () => {
          processVotes(sock, currentEnc, sessionKey).catch((e) =>
            console.error("[Quest] processVotes error:", e?.message || e),
          );
        },
        state.solo ? 0 : 2000,
      ); // 0s for solo, 2s for group

      return `🗳️ Vote cast! ${state.solo ? "Processing..." : "All votes in! Processing..."}`;
    }

    return "🗳️ Vote cast!";
  },
  getGameState,
  isUserInAdventure,
  // Export for use in index.js
  CLASSES,
  CONSUMABLES,
  EQUIPMENT,
  GAME_CONFIG,
  startAbyssCombat,
};
