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

const fs = require('fs');
const path = require('path');
const botConfig = require('../botConfig');
const economy = require('./economy');
const progression = require('./progression');
const skillTree = require('./skillTree');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');
const bossMechanics = require('./bossMechanics');
const classEncounters = require('./classEncounters');
const combatIntegration = require('./combatIntegration');
const guilds = require('./guilds');
const classSystem = require('./classSystem');
const monsterSkills = require('./monsterSkills');

// ==========================================
// 📊 GAME CONSTANTS
// ==========================================

const DUNGEON_RANKS = {
    F: { name: 'F-Rank', encounters: 3, minMobs: 1, maxMobs: 2, difficulty: 0.8, boss: 'INFECTED_COLOSSUS', pool: 1, xpMult: 0.8 },
    E: { name: 'E-Rank', encounters: 4, minMobs: 2, maxMobs: 4, difficulty: 1.2, boss: 'CORRUPTED_GUARDIAN', pool: 1, xpMult: 1.2 },
    D: { name: 'D-Rank', encounters: 7, minMobs: 2, maxMobs: 4, difficulty: 2.0, boss: 'ELEMENTAL_ARCHON', pool: 2, xpMult: 2.0 },
    C: { name: 'C-Rank', encounters: 7, minMobs: 2, maxMobs: 5, difficulty: 3.5, boss: 'MUTATION_PRIME', pool: 2, xpMult: 3.5 },
    B: { name: 'B-Rank', encounters: 8, minMobs: 3, maxMobs: 5, difficulty: 6.0, boss: 'VOID_CORRUPTED', pool: 3, xpMult: 6.0 },
    A: { name: 'A-Rank', encounters: 9, minMobs: 3, maxMobs: 6, difficulty: 10.0, boss: 'PRIMORDIAL_CHAOS', pool: 4, xpMult: 10.0 },
    S: { name: 'S-Rank', encounters: 10, minMobs: 4, maxMobs: 6, difficulty: 18.0, boss: 'PRIMORDIAL_CHAOS', pool: 5, xpMult: 18.0 },
    SS: { name: 'SS-Rank', encounters: 11, minMobs: 4, maxMobs: 7, difficulty: 35.0, boss: 'PRIMORDIAL_CHAOS', pool: 5, xpMult: 35.0 },
    SSS: { name: 'SSS-Rank', encounters: 13, minMobs: 5, maxMobs: 8, difficulty: 75.0, boss: 'PRIMORDIAL_CHAOS', pool: 5, xpMult: 75.0 },
    DRAGON: { name: 'Dragon’s Lair', encounters: 5, minMobs: 2, maxMobs: 3, difficulty: 5.0, boss: 'ANCIENT_DRAGON_BOSS', pool: 'DRAGON_LAIR', xpMult: 5.0, isSpecial: true }
};

const DUNGEON_ENVIRONMENTS = {
    DRAGON_LAIR: { 
        id: 'DRAGON_LAIR', name: 'Dragon’s Lair', asset: 'env10.png', 
        mobs: ['DRAKE_SCOUT', 'FIRE_BREATHER'],
        bosses: ['ANCIENT_DRAGON_BOSS'],
        modifier: { type: 'DRAGON_FEAR', desc: '-10% ATK due to draconic presence', damage: 0 },
        enemyBonus: { type: 'DEFENSE', value: 0.20 },
        isSpecial: true
    },
    FIRE_CAVE: { 
        id: 'FIRE_CAVE', name: 'Fire Cave', asset: 'env1.png', 
        mobs: ['FLAME', 'ELDER_FLAME', 'MAGMA_BRUTE', 'HELLFIRE_DEMON'],
        bosses: ['INFERNAL_OVERLORD', 'PRIMORDIAL_FLAME'],
        modifier: { type: 'HEAT_EXHAUSTION', desc: '-5% Max HP per turn in lava', damage: 0.05 },
        enemyBonus: { type: 'DAMAGE', value: 0.10, element: 'fire' }
    },
    ICE_CAVE: { 
        id: 'ICE_CAVE', name: 'Ice Cave', asset: 'env2.png', 
        mobs: ['FROST_GHOUL', 'GLACIAL_BEAST', 'BLIZZARD_WRAITH'],
        bosses: ['PERMAFROST_TITAN'],
        modifier: { type: 'FROSTBITE', desc: '-10% Speed penalty', spdReduction: 0.10 },
        enemyBonus: { type: 'DEFENSE', value: 0.20 }
    },
    TOXIC_CAVE: { 
        id: 'TOXIC_CAVE', name: 'Toxic Cave', asset: 'env3.png', 
        mobs: ['DROWNED_ONE', 'TIDE_LURKER', 'MIST_WALKER'],
        bosses: ['LEVIATHAN_SPAWN'],
        modifier: { type: 'TOXIC_MIST', desc: '-30% Healing effectiveness', healReduction: 0.30 },
        enemyBonus: { type: 'DOT', effect: 'poison', value: 5 }
    },
    VOID_DIMENSION: { 
        id: 'VOID_DIMENSION', name: 'Void Dimension', asset: 'env4.png', 
        mobs: ['VOID_CORRUPTED', 'ABYSSAL_HORROR'],
        bosses: ['VOID_TITAN', 'PRIMORDIAL_CHAOS'],
        modifier: { type: 'TIME_DILATION', desc: 'Random turn order manipulation' },
        enemyBonus: { type: 'RANDOM_TP', chance: 0.10 }
    },
    SCI_FI_CITY: { 
        id: 'SCI_FI_CITY', name: 'Sci-Fi City', asset: 'env5.png', 
        mobs: ['TSUNAMI_WALKER', 'ABYSSAL_HORROR'],
        bosses: ['KRAKEN_SPAWN'],
        modifier: { type: 'COVER_SYSTEM', desc: 'Defense bonus from structures' },
        enemyBonus: { type: 'RANGED', rangeBonus: 1 }
    },
    DEMON_CASTLE: { 
        id: 'DEMON_CASTLE', name: 'Demon Castle', asset: 'env6.png', 
        mobs: ['HELLFIRE_DEMON', 'STAR_EATER'],
        bosses: ['MUTATION_PRIME', 'ELEMENTAL_ARCHON', 'INFERNAL_OVERLORD', 'PRIMORDIAL_FLAME'],
        modifier: { type: 'CURSED_GROUND', desc: 'Healing reduced to 50%', healReduction: 0.50 },
        enemyBonus: { type: 'MAGIC_EMPOWER', value: 0.20 }
    },
    DESERT: { 
        id: 'DESERT', name: 'Desert', asset: 'env7.png', 
        mobs: ['STONE_HULK', 'CRYSTAL_CORRUPTED', 'EARTH_WARDEN'],
        bosses: ['GOLEM_KING', 'MOUNTAIN_COLOSSUS'],
        modifier: { type: 'SANDSTORM', desc: 'Accuracy penalty', accuracyReduction: 0.15 },
        enemyBonus: { type: 'STAMINA_DRAIN', energyCostInc: 0.10 }
    },
    INFECTED_AFTERLIFE: { 
        id: 'INFECTED_AFTERLIFE', name: 'Infected Afterlife', asset: 'env8.png', 
        mobs: ['FLESH_ABOMINATION', 'CHIMERA_BEAST'],
        bosses: ['PERFECT_MUTATION'],
        modifier: { type: 'CORRUPTION', desc: 'Damage increases over time' },
        enemyBonus: { type: 'RESURRECTION', chance: 0.10 }
    },
    PRE_INFECTED_AFTERLIFE: { 
        id: 'PRE_INFECTED_AFTERLIFE', name: 'Pre-Infected Afterlife', asset: 'env9.png', 
        mobs: ['FROST_FLAME_WARDEN', 'STORM_EARTH_TITAN'],
        bosses: ['ELEMENTAL_SOVEREIGN'],
        modifier: { type: 'PURITY_AURA', desc: 'Cleanses debuffs randomly' },
        enemyBonus: { type: 'HOLY_GROUND', healBonus: 0.50 }
    },
    SIMPLE_FOREST: { 
        id: 'SIMPLE_FOREST', name: 'Simple Forest', asset: 'env10.png', 
        mobs: ['OBSIDIAN_JUGGERNAUT', 'DIAMOND_SENTINEL'],
        bosses: ['MOUNTAIN_COLOSSUS'],
        modifier: { type: 'DENSE_FOLIAGE', desc: 'Line-of-sight blocked' },
        enemyBonus: { type: 'CAMOUFLAGE', evasionBonus: 0.15 }
    }
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
        id: 'FIGHTER',
        name: 'Fighter',
        icon: '⚔️',
        desc: 'Balanced warrior, good at physical combat',
        role: 'STARTER',
        stats: { hp: 120, atk: 12, def: 10, mag: 4, spd: 8, luck: 6, crit: 8 },
        abilities: [
            { name: 'Slash', cost: 10, damage: 1.3, effect: 'none', cooldown: 1 },
            { name: 'Guard', cost: 8, damage: 0, effect: 'shield_self', value: 20, cooldown: 2 }
        ],
        passive: { name: 'Balanced', effect: 'all_stats', value: 5 }
    },
    
    SCOUT: {
        id: 'SCOUT',
        name: 'Scout',
        icon: '🗡️',
        desc: 'Quick and agile, focuses on speed',
        role: 'STARTER',
        stats: { hp: 90, atk: 10, def: 5, mag: 3, spd: 16, luck: 14, crit: 18 },
        abilities: [
            { name: 'Quick Strike', cost: 8, damage: 1.2, effect: 'speed_bonus', value: 10, cooldown: 1 },
            { name: 'Evade', cost: 10, damage: 0, effect: 'dodge_next', cooldown: 2 }
        ],
        passive: { name: 'Nimble', effect: 'dodge_chance', value: 10 }
    },
    
    APPRENTICE: {
        id: 'APPRENTICE',
        name: 'Apprentice',
        icon: '🔮',
        desc: 'Magic beginner with potential',
        role: 'STARTER',
        stats: { hp: 80, atk: 5, def: 4, mag: 18, spd: 9, luck: 8, crit: 10 },
        abilities: [
            { name: 'Magic Bolt', cost: 12, damage: 1.5, effect: 'magic_damage', cooldown: 1 },
            { name: 'Mana Shield', cost: 15, damage: 0, effect: 'shield_self', value: 15, cooldown: 3 }
        ],
        passive: { name: 'Magic Affinity', effect: 'magic_damage', value: 10 }
    },
    
    ACOLYTE: {
        id: 'ACOLYTE',
        name: 'Acolyte',
        icon: '✨',
        desc: 'Supportive novice with healing abilities',
        role: 'STARTER',
        stats: { hp: 100, atk: 6, def: 8, mag: 14, spd: 10, luck: 12, crit: 6 },
        abilities: [
            { name: 'Heal', cost: 15, damage: 0, effect: 'heal_target', value: 30, cooldown: 2 },
            { name: 'Smite', cost: 10, damage: 1.2, effect: 'holy_damage', cooldown: 1 }
        ],
        passive: { name: 'Blessed', effect: 'team_healing', value: 3 }
    },
    
    // ==========================================
    // TANK CLASSES
    // ==========================================
    WARRIOR: {
        id: 'WARRIOR',
        name: 'Warrior',
        icon: '⚔️',
        desc: 'Frontline tank with high HP and defense',
        role: 'TANK',
        stats: { hp: 200, atk: 12, def: 15, mag: 2, spd: 5, luck: 5, crit: 5 },
        abilities: [
            { name: 'Shield Bash', cost: 10, damage: 1.2, effect: 'stun', chance: 30, cooldown: 2 },
            { name: 'Taunt', cost: 15, damage: 0, effect: 'taunt', chance: 100, cooldown: 3 },
            { name: 'Battle Cry', cost: 20, damage: 0, effect: 'buff_team_atk', value: 15, cooldown: 4 },
            { name: 'Execute', cost: 25, damage: 2.5, effect: 'execute', threshold: 30, cooldown: 5 }
        ],
        passive: { name: 'Unbreakable', effect: 'damage_reduction', value: 15 }
    },
    
    PALADIN: {
        id: 'PALADIN',
        name: 'Paladin',
        icon: '🛡️',
        desc: 'Holy defender with healing and protection',
        role: 'TANK',
        stats: { hp: 180, atk: 10, def: 18, mag: 8, spd: 4, luck: 7, crit: 3 },
        abilities: [
            { name: 'Holy Strike', cost: 12, damage: 1.3, effect: 'heal_self', value: 15, cooldown: 2 },
            { name: 'Divine Shield', cost: 20, damage: 0, effect: 'shield_team', value: 30, duration: 2, cooldown: 4 },
            { name: 'Consecrate', cost: 18, damage: 1.0, effect: 'aoe', radius: 3, cooldown: 3 },
            { name: 'Lay on Hands', cost: 30, damage: 0, effect: 'heal_target', value: 60, cooldown: 5 }
        ],
        passive: { name: 'Holy Aura', effect: 'team_healing', value: 5 }
    },

    BERSERKER: {
        id: 'BERSERKER',
        name: 'Berserker',
        icon: '🪓',
        desc: 'Rage-fueled warrior who gets stronger when low HP',
        role: 'TANK',
        stats: { hp: 220, atk: 16, def: 10, mag: 1, spd: 6, luck: 4, crit: 12 },
        abilities: [
            { name: 'Rage Strike', cost: 8, damage: 1.6, effect: 'self_damage', value: 5, cooldown: 1 },
            { name: 'Blood Fury', cost: 15, damage: 2.0, effect: 'bleed_self', duration: 3, cooldown: 3 },
            { name: 'Rampage', cost: 25, damage: 1.2, effect: 'multi_hit', hits: 3, cooldown: 4 },
            { name: 'Last Stand', cost: 30, damage: 3.0, effect: 'low_hp_bonus', threshold: 30, cooldown: 6 }
        ],
        passive: { name: 'Berserker Rage', effect: 'damage_when_low_hp', value: 50 }
    },

    // DPS CLASSES
    ROGUE: {
        id: 'ROGUE',
        name: 'Rogue',
        icon: '🗡️',
        desc: 'Agile assassin with high crit and evasion',
        role: 'DPS',
        stats: { hp: 100, atk: 18, def: 5, mag: 3, spd: 20, luck: 15, crit: 25 },
        abilities: [
            { name: 'Backstab', cost: 12, damage: 2.2, effect: 'crit_bonus', value: 50, cooldown: 2 },
            { name: 'Smoke Bomb', cost: 15, damage: 0.5, effect: 'blind', chance: 70, duration: 2, cooldown: 3 },
            { name: 'Shadow Step', cost: 10, damage: 1.0, effect: 'dodge_next', cooldown: 2 },
            { name: 'Assassinate', cost: 35, damage: 4.0, effect: 'instant_kill', threshold: 20, cooldown: 7 }
        ],
        passive: { name: 'Evasion', effect: 'dodge_chance', value: 20 }
    },

    MONK: {
        id: 'MONK',
        name: 'Monk',
        icon: '🥋',
        desc: 'Martial artist with combo attacks',
        role: 'DPS',
        stats: { hp: 120, atk: 14, def: 8, mag: 6, spd: 18, luck: 10, crit: 15 },
        abilities: [
            { name: 'Flurry', cost: 10, damage: 0.8, effect: 'multi_hit', hits: 4, cooldown: 2 },
            { name: 'Chi Burst', cost: 15, damage: 1.5, effect: 'heal_self', value: 10, cooldown: 2 },
            { name: 'Pressure Point', cost: 20, damage: 1.0, effect: 'stun', chance: 60, cooldown: 3 },
            { name: 'Final Strike', cost: 30, damage: 2.8, effect: 'combo_bonus', cooldown: 5 }
        ],
        passive: { name: 'Combo Master', effect: 'damage_per_hit', value: 5 }
    },

    // MAGIC DPS
    MAGE: {
        id: 'MAGE',
        name: 'Mage',
        icon: '🔮',
        desc: 'Arcane spellcaster with devastating magic',
        role: 'MAGIC_DPS',
        stats: { hp: 85, atk: 5, def: 4, mag: 25, spd: 8, luck: 10, crit: 12 },
        abilities: [
            { name: 'Fireball', cost: 15, damage: 2.0, effect: 'burn', duration: 3, cooldown: 2 },
            { name: 'Ice Shard', cost: 12, damage: 1.5, effect: 'freeze', chance: 40, duration: 1, cooldown: 2 },
            { name: 'Lightning Bolt', cost: 18, damage: 2.3, effect: 'chain', targets: 2, cooldown: 3 },
            { name: 'Meteor', cost: 40, damage: 3.5, effect: 'aoe', radius: 5, cooldown: 6 }
        ],
        passive: { name: 'Arcane Mastery', effect: 'magic_damage', value: 20 }
    },

    WARLOCK: {
        name: 'Warlock',
        icon: '👹',
        desc: 'Dark caster who drains life',
        role: 'MAGIC_DPS',
        stats: { hp: 95, atk: 6, def: 5, mag: 22, spd: 7, luck: 8, crit: 10 },
        abilities: [
            { name: 'Drain Life', cost: 12, damage: 1.5, effect: 'lifesteal', value: 50, cooldown: 2 },
            { name: 'Curse', cost: 15, damage: 0.8, effect: 'curse', duration: 4, cooldown: 3 },
            { name: 'Shadow Bolt', cost: 18, damage: 2.2, effect: 'magic_damage', cooldown: 2 },
            { name: 'Demon Summon', cost: 35, damage: 1.0, effect: 'summon_pet', duration: 5, cooldown: 6 }
        ],
        passive: { name: 'Soul Harvest', effect: 'damage_on_kill', value: 15 }
    },

    ELEMENTALIST: {
        name: 'Elementalist',
        icon: '🌪️',
        desc: 'Master of all elements',
        role: 'MAGIC_DPS',
        stats: { hp: 90, atk: 4, def: 5, mag: 24, spd: 9, luck: 11, crit: 13 },
        abilities: [
            { name: 'Flame Wave', cost: 14, damage: 1.8, effect: 'burn', duration: 2, cooldown: 2 },
            { name: 'Frost Nova', cost: 16, damage: 1.4, effect: 'freeze_aoe', radius: 3, cooldown: 3 },
            { name: 'Thunder Storm', cost: 20, damage: 2.0, effect: 'shock', duration: 3, cooldown: 3 },
            { name: 'Elemental Fury', cost: 38, damage: 3.0, effect: 'all_elements', cooldown: 6 }
        ],
        passive: { name: 'Elemental Affinity', effect: 'rotate_elements', value: 10 }
    },

    // SUPPORT CLASSES
    CLERIC: {
        name: 'Cleric',
        icon: '✨',
        desc: 'Divine healer who keeps the party alive',
        role: 'SUPPORT',
        stats: { hp: 100, atk: 6, def: 8, mag: 18, spd: 10, luck: 14, crit: 5 },
        abilities: [
            { name: 'Heal', cost: 15, damage: 0, effect: 'heal_target', value: 50, cooldown: 1 },
            { name: 'Prayer', cost: 20, damage: 0, effect: 'heal_team', value: 30, cooldown: 3 },
            { name: 'Smite', cost: 12, damage: 1.8, effect: 'holy_damage', cooldown: 2 },
            { name: 'Resurrection', cost: 50, damage: 0, effect: 'revive', value: 40, cooldown: 8 }
        ],
        passive: { name: 'Divine Grace', effect: 'healing_boost', value: 25 }
    },

    DRUID: {
        name: 'Druid',
        icon: '🌿',
        desc: 'Nature magic with healing and shapeshifting',
        role: 'SUPPORT',
        stats: { hp: 115, atk: 10, def: 9, mag: 16, spd: 11, luck: 13, crit: 8 },
        abilities: [
            { name: 'Rejuvenation', cost: 10, damage: 0, effect: 'heal_over_time', value: 15, duration: 3, cooldown: 2 },
            { name: 'Entangle', cost: 14, damage: 1.2, effect: 'root', duration: 2, cooldown: 3 },
            { name: 'Bear Form', cost: 20, damage: 1.8, effect: 'transform_tank', duration: 3, cooldown: 4 },
            { name: 'Nature\'s Wrath', cost: 28, damage: 2.5, effect: 'nature_damage', cooldown: 5 }
        ],
        passive: { name: 'Natural Healing', effect: 'regen', value: 5 }
    },

    // HYBRID CLASSES
    NECROMANCER: {
        name: 'Necromancer',
        icon: '💀',
        desc: 'Dark summoner who raises the dead',
        role: 'HYBRID',
        stats: { hp: 95, atk: 7, def: 6, mag: 20, spd: 8, luck: 9, crit: 11 },
        abilities: [
            { name: 'Raise Dead', cost: 20, damage: 0, effect: 'summon_skeleton', duration: 4, cooldown: 4 },
            { name: 'Death Coil', cost: 15, damage: 1.8, effect: 'lifesteal', value: 40, cooldown: 2 },
            { name: 'Corpse Explosion', cost: 18, damage: 2.2, effect: 'aoe_corpse', cooldown: 3 },
            { name: 'Army of Dead', cost: 45, damage: 1.5, effect: 'summon_army', duration: 5, cooldown: 7 }
        ],
        passive: { name: 'Death\'s Touch', effect: 'damage_on_death', value: 30 }
    },

    MERCHANT: {
        name: 'Merchant',
        icon: '💰',
        desc: 'Capitalist who uses gold as power',
        role: 'HYBRID',
        stats: { hp: 110, atk: 6, def: 6, mag: 8, spd: 10, luck: 25, crit: 12 },
        abilities: [
            { name: 'Gold Throw', cost: 10, damage: 1.5, effect: 'gold_damage', value: 100, cooldown: 1 },
            { name: 'Bribe', cost: 20, damage: 0, effect: 'charm', chance: 50, duration: 2, cooldown: 4 },
            { name: 'Investment', cost: 15, damage: 0, effect: 'gain_gold', value: 200, cooldown: 3 },
            { name: 'Money Rain', cost: 30, damage: 2.0, effect: 'aoe_gold', value: 300, cooldown: 5 }
        ],
        passive: { name: 'Golden Touch', effect: 'gold_find', value: 50 }
    },

    CHRONOMANCER: {
        name: 'Chronomancer',
        icon: '⏰',
        desc: 'Time mage who manipulates turns',
        role: 'HYBRID',
        stats: { hp: 88, atk: 5, def: 5, mag: 23, spd: 16, luck: 12, crit: 9 },
        abilities: [
            { name: 'Slow', cost: 14, damage: 1.0, effect: 'slow', value: 50, duration: 3, cooldown: 3 },
            { name: 'Haste', cost: 16, damage: 0, effect: 'haste_team', value: 30, duration: 2, cooldown: 4 },
            { name: 'Time Skip', cost: 20, damage: 0, effect: 'extra_turn', cooldown: 5 },
            { name: 'Temporal Rift', cost: 35, damage: 3.0, effect: 'time_damage', cooldown: 6 }
        ],
        passive: { name: 'Time Dilation', effect: 'first_turn_bonus', value: 20 }
    }
};

// ==========================================
// 🎒 MASSIVE ITEM SYSTEM
// ==========================================

const CONSUMABLES = {
    // HEALING
    'minor_potion': { name: 'Minor Health Potion', cost: 280, effect: 'heal', effectValue: 0.15, desc: 'Restores 15% of Max HP. A basic potion for minor wounds.', icon: '🧪' },
    'health_potion': { name: 'Health Potion', cost: 700, effect: 'heal', effectValue: 0.35, desc: 'Restores 35% of Max HP. Standard issue for adventurers.', icon: '💊' },
    'major_potion': { name: 'Major Health Potion', cost: 1680, effect: 'heal', effectValue: 0.60, desc: 'Restores 60% of Max HP. Essential for dangerous raids.', icon: '⚗️' },
    'elixir': { name: 'Full Restore Elixir', cost: 4200, effect: 'heal', effectValue: 1.0, desc: 'Fully restores HP. Rare and powerful alchemy.', icon: '🍶' },
    'regen_salve': { name: 'Regeneration Salve', cost: 1120, effect: 'regen', effectValue: 0.10, duration: 3, desc: 'Heals 10% of Max HP per turn for 3 turns.', icon: '🧴' },
    
    // MANA (for abilities)
    'mana_potion': { name: 'Mana Potion', cost: 400, effect: 'restore_energy', effectValue: 0.40, desc: 'Restores 40% of Max Energy. Refreshes your combat focus.', icon: '💙' },
    'ether': { name: 'Ether', cost: 1000, effect: 'restore_energy', effectValue: 1.0, desc: 'Fully restores Energy. Pure arcane energy in a bottle.', icon: '🔵' },
    
    // BUFFS
    'strength_brew': { name: 'Strength Brew', cost: 600, effect: 'buff_atk', value: 25, duration: 3, desc: 'Increases ATK by 25% for 3 turns.', icon: '💪' },
    'defense_tonic': { name: 'Defense Tonic', cost: 600, effect: 'buff_def', value: 25, duration: 3, desc: 'Increases DEF by 25% for 3 turns.', icon: '🛡️' },
    'speed_elixir': { name: 'Speed Elixir', cost: 600, effect: 'buff_spd', value: 30, duration: 3, desc: 'Increases SPD by 30% for 3 turns.', icon: '⚡' },
    'lucky_charm': { name: 'Lucky Charm', cost: 800, effect: 'buff_luck', value: 40, duration: 3, desc: 'Increases LUCK by 40% for 3 turns.', icon: '🍀' },
    'berserker_pill': { name: 'Berserker Pill', cost: 1500, effect: 'buff_all_damage', value: 50, duration: 2, desc: 'Massive damage boost, but lowers defense.', icon: '💥' },
    
    // UTILITY
    'phoenix_down': { name: 'Phoenix Down', cost: 3500, effect: 'revive', effectValue: 0.5, desc: 'Revives a fallen ally with 50% HP.', icon: '🪶' },
    'smoke_bomb': { name: 'Smoke Bomb', cost: 500, effect: 'flee', chance: 80, desc: 'Allows the party to escape combat (80% chance).', icon: '💨' },
    'bomb': { name: 'Bomb', cost: 1000, effect: 'damage_aoe', value: 80, desc: 'Deals 80 area damage to all enemies.', icon: '💣' },
    'abyssal_detonator': { name: 'Abyssal Detonator', cost: 50000, effect: 'percent_hp_damage', effectValue: 0.25, desc: 'Deals 25% of target MAX HP as true damage.', icon: '💥🌀' },
    
    // BUNDLES
    'bundle_pack': { name: 'Explorer Pack', cost: 1680, effect: 'bundle', items: ['health_potion', 'mana_potion', 'minor_potion'], desc: 'A bundle containing a Health Potion, Energy Elixir, and Minor Potion.', icon: '🎒' },
};

const SHOP_LIST = [
    'minor_potion', 'health_potion', 'major_potion', 'elixir', 'regen_salve',
    'mana_potion', 'ether',
    'strength_brew', 'defense_tonic', 'speed_elixir', 'lucky_charm', 'berserker_pill',
    'phoenix_down', 'bomb', 'smoke_bomb', 'abyssal_detonator'
];

const EQUIPMENT = {
    // WEAPONS
    'rusty_sword': { name: 'Rusty Sword', type: 'weapon', cost: 1000, stats: { atk: 5 }, icon: '🗡️', slot: 'weapon' },
    'iron_sword': { name: 'Iron Sword', type: 'weapon', cost: 3000, stats: { atk: 12 }, icon: '⚔️', slot: 'weapon' },
    'steel_blade': { name: 'Steel Blade', type: 'weapon', cost: 7000, stats: { atk: 20, crit: 5 }, icon: '🗡️', slot: 'weapon' },
    'mythril_sword': { name: 'Mythril Sword', type: 'weapon', cost: 14000, stats: { atk: 30, crit: 10 }, icon: '⚔️', slot: 'weapon' },
    'excalibur': { name: 'Excalibur', type: 'weapon', cost: 30000, stats: { atk: 50, crit: 15, mag: 10 }, icon: '🗡️✨', slot: 'weapon', special: 'holy_damage' },
    
    'wooden_staff': { name: 'Wooden Staff', type: 'weapon', cost: 1000, stats: { mag: 8 }, icon: '🪄', slot: 'weapon' },
    'magic_wand': { name: 'Magic Wand', type: 'weapon', cost: 4000, stats: { mag: 15 }, icon: '✨', slot: 'weapon' },
    'arcane_staff': { name: 'Arcane Staff', type: 'weapon', cost: 10000, stats: { mag: 28, atk: 5 }, icon: '🔮', slot: 'weapon' },
    'staff_of_ages': { name: 'Staff of Ages', type: 'weapon', cost: 24000, stats: { mag: 45, spd: 10 }, icon: '🪄✨', slot: 'weapon', special: 'spell_power' },
    
    'short_bow': { name: 'Short Bow', type: 'weapon', cost: 1600, stats: { atk: 10, spd: 5 }, icon: '🏹', slot: 'weapon' },
    'longbow': { name: 'Longbow', type: 'weapon', cost: 5000, stats: { atk: 18, spd: 8 }, icon: '🏹', slot: 'weapon' },
    'hunters_bow': { name: 'Hunter\'s Bow', type: 'weapon', cost: 12000, stats: { atk: 28, spd: 12, crit: 12 }, icon: '🏹✨', slot: 'weapon', special: 'piercing' },
    
    // ARMOR
    'cloth_armor': { name: 'Cloth Armor', type: 'armor', cost: 800, stats: { def: 5, mag: 3 }, icon: '👕', slot: 'armor' },
    'leather_armor': { name: 'Leather Armor', type: 'armor', cost: 2400, stats: { def: 10, spd: 2 }, icon: '🧥', slot: 'armor' },
    'chainmail': { name: 'Chainmail', type: 'armor', cost: 6000, stats: { def: 18 }, icon: '⛓️', slot: 'armor' },
    'plate_armor': { name: 'Plate Armor', type: 'armor', cost: 12000, stats: { def: 30, hp: 20 }, icon: '🛡️', slot: 'armor' },
    'dragon_scale': { name: 'Dragon Scale Armor', type: 'armor', cost: 30000, stats: { def: 50, hp: 40, mag: 10 }, icon: '🐉', slot: 'armor', special: 'fire_resist' },
    
    // ACCESSORIES
    'ring_str': { name: 'Ring of Strength', type: 'accessory', cost: 4000, stats: { atk: 10 }, icon: '💍', slot: 'ring' },
    'ring_int': { name: 'Ring of Intelligence', type: 'accessory', cost: 4000, stats: { mag: 10 }, icon: '💍', slot: 'ring' },
    'ring_vit': { name: 'Ring of Vitality', type: 'accessory', cost: 4000, stats: { hp: 30 }, icon: '💍', slot: 'ring' },
    'ring_luck': { name: 'Ring of Fortune', type: 'accessory', cost: 6000, stats: { luck: 20 }, icon: '💍', slot: 'ring' },
    'ring_crit': { name: 'Ring of Precision', type: 'accessory', cost: 7000, stats: { crit: 15 }, icon: '💍', slot: 'ring' },
    
    'amulet_hp': { name: 'Amulet of Life', type: 'accessory', cost: 5000, stats: { hp: 50 }, icon: '📿', slot: 'amulet' },
    'amulet_regen': { name: 'Amulet of Regeneration', type: 'accessory', cost: 7000, stats: { hp: 20 }, icon: '📿', slot: 'amulet', special: 'regen_5' },
    'amulet_elemental': { name: 'Elemental Amulet', type: 'accessory', cost: 10000, stats: { mag: 15, def: 10 }, icon: '📿', slot: 'amulet', special: 'elemental_resist' },
    
    'boots_speed': { name: 'Boots of Speed', type: 'accessory', cost: 3600, stats: { spd: 15 }, icon: '👢', slot: 'boots' },
    'boots_tank': { name: 'Iron Boots', type: 'accessory', cost: 3600, stats: { def: 12, hp: 15 }, icon: '👢', slot: 'boots' },
    'winged_boots': { name: 'Winged Boots', type: 'accessory', cost: 9000, stats: { spd: 25, def: 5 }, icon: '👢✨', slot: 'boots', special: 'first_strike' },
    
    'cloak_stealth': { name: 'Cloak of Stealth', type: 'accessory', cost: 6000, stats: { spd: 10, luck: 10 }, icon: '🧥', slot: 'cloak', special: 'dodge_15' },
    'cloak_mage': { name: 'Mage\'s Cloak', type: 'accessory', cost: 7000, stats: { mag: 20, def: 5 }, icon: '🧥', slot: 'cloak' },
    'cloak_vampire': { name: 'Vampire Cloak', type: 'accessory', cost: 12000, stats: { atk: 15, mag: 15 }, icon: '🧥', slot: 'cloak', special: 'lifesteal_10' },
};

const CRAFTING_MATERIALS = {
    'wood': { name: 'Wood', icon: '🪵', rarity: 'common' },
    'stone': { name: 'Stone', icon: '🪨', rarity: 'common' },
    'iron_ore': { name: 'Iron Ore', icon: '⛏️', rarity: 'common' },
    'leather': { name: 'Leather', icon: '🦌', rarity: 'common' },
    'herb': { name: 'Herb', icon: '🌿', rarity: 'common' },
    
    'silver_ore': { name: 'Silver Ore', icon: '⛏️', rarity: 'uncommon' },
    'gold_ore': { name: 'Gold Ore', icon: '⛏️', rarity: 'uncommon' },
    'crystal': { name: 'Crystal', icon: '💎', rarity: 'uncommon' },
    'enchanted_cloth': { name: 'Enchanted Cloth', icon: '✨', rarity: 'uncommon' },
    
    'mythril_ore': { name: 'Mythril Ore', icon: '⛏️', rarity: 'rare' },
    'dragon_scale_mat': { name: 'Dragon Scale', icon: '🐉', rarity: 'rare' },
    'phoenix_feather': { name: 'Phoenix Feather', icon: '🪶', rarity: 'rare' },
    'demon_horn': { name: 'Demon Horn', icon: '👹', rarity: 'rare' },
    'angel_wing': { name: 'Angel Wing', icon: '🪽', rarity: 'rare' },
    
    'adamantite': { name: 'Adamantite', icon: '💠', rarity: 'legendary' },
    'orichalcum': { name: 'Orichalcum', icon: '🌟', rarity: 'legendary' },
    'void_essence': { name: 'Void Essence', icon: '🌑', rarity: 'legendary' },
};

const ELEMENT_CHART = {
    'PHYSICAL': { weakTo: [], strongVs: [] },
    'FIRE': { weakTo: ['WATER'], strongVs: ['ICE', 'NATURE'] },
    'ICE': { weakTo: ['FIRE'], strongVs: ['NATURE'] },
    'WATER': { weakTo: ['LIGHTNING'], strongVs: ['FIRE'] },
    'LIGHTNING': { weakTo: ['EARTH'], strongVs: ['WATER'] },
    'EARTH': { weakTo: ['WIND'], strongVs: ['LIGHTNING'] },
    'WIND': { weakTo: ['EARTH'], strongVs: ['EARTH'] },
    'HOLY': { weakTo: ['DARK'], strongVs: ['DEATH', 'DARK'] },
    'DARK': { weakTo: ['HOLY'], strongVs: ['HOLY'] },
    'DEATH': { weakTo: ['HOLY'], strongVs: ['PHYSICAL'] },
    'VOID': { weakTo: [], strongVs: ['FIRE', 'ICE', 'WATER', 'LIGHTNING'] }
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
    const rankIndexMap = { 'F': 1, 'E': 2, 'D': 3, 'C': 4, 'B': 5, 'A': 6, 'S': 7, 'SS': 8, 'SSS': 9 };
    const rankIdx = rankIndexMap[state.dungeonRank] || 1;
    
    let mixRate = 0.10; // F-E Rank
    if (rankIdx >= 3 && rankIdx <= 4) mixRate = 0.30; // D-C Rank
    else if (rankIdx >= 5 && rankIdx <= 6) mixRate = 0.50; // B-A Rank
    else if (rankIdx >= 7) mixRate = 0.70; // S+ Rank

    const encounter = classEncounters.generateEncounter(
        state.players,
        'COMBAT',
        state.difficulty || 1.0,
        {
            minMobs: rankData.minMobs,
            maxMobs: rankData.maxMobs
        }
    );

    // Override enemies with Environment Mixing
    encounter.enemies = encounter.enemies.map(e => {
        const isMixed = Math.random() < mixRate;
        let selectedMobId;
        
        if (!isMixed) {
            // Use native mob
            selectedMobId = env.mobs[Math.floor(Math.random() * env.mobs.length)];
        } else {
            // Pick from ANY environment
            const allEnvs = Object.values(DUNGEON_ENVIRONMENTS);
            const randomEnv = allEnvs[Math.floor(Math.random() * allEnvs.length)];
            selectedMobId = randomEnv.mobs[Math.floor(Math.random() * randomEnv.mobs.length)];
        }

        // Re-scale the selected mob
        const baseMob = classEncounters.INFECTED_POOLS.FIRE_LOW.COMMON.find(m => m.id === selectedMobId) || 
                        Object.values(classEncounters.INFECTED_POOLS).flatMap(p => p.COMMON).find(m => m.id === selectedMobId);
        
        if (baseMob) {
            // Calculate avgSpeed for correct scaling
            const avgSpeed = Math.floor(state.players.reduce((sum, p) => sum + (p.stats?.spd || 10), 0) / state.players.length);
            return classEncounters.scaleEnemyStats(baseMob, state.players.length, state.difficulty, e.enemyIndex, encounter.avgLevel, avgSpeed);
        }
        return e;
    });

    encounter.theme = {
        theme: env.name,
        description: env.modifier.desc
    };

    return encounter;
}

function generateEliteCombatEncounter(chatId) {
    const state = getGameState(chatId);
    if (!state) return null;
    const rankData = DUNGEON_RANKS[state.dungeonRank];
    const env = state.environment || DUNGEON_ENVIRONMENTS.SIMPLE_FOREST;

    // Mixing Logic
    const rankIndexMap = { 'F': 1, 'E': 2, 'D': 3, 'C': 4, 'B': 5, 'A': 6, 'S': 7, 'SS': 8, 'SSS': 9 };
    const rankIdx = rankIndexMap[state.dungeonRank] || 1;
    let mixRate = 0.15; 
    if (rankIdx >= 5) mixRate = 0.40;

    const encounter = classEncounters.generateEncounter(
        state.players,
        'ELITE_COMBAT',
        (state.difficulty || 1.0) * 1.2,
        {
            minMobs: 1,
            maxMobs: 2
        }
    );

    encounter.enemies = encounter.enemies.map(e => {
        const isMixed = Math.random() < mixRate;
        let selectedMobId;
        
        if (!isMixed) {
            // Find an elite from this env's mob list
            selectedMobId = env.mobs[Math.floor(Math.random() * env.mobs.length)];
        } else {
            const allEnvs = Object.values(DUNGEON_ENVIRONMENTS);
            const randomEnv = allEnvs[Math.floor(Math.random() * allEnvs.length)];
            selectedMobId = randomEnv.mobs[Math.floor(Math.random() * randomEnv.mobs.length)];
        }

        // Find the elite version if possible
        const baseMob = Object.values(classEncounters.INFECTED_POOLS).flatMap(p => p.ELITE).find(m => m.id.includes(selectedMobId)) || 
                        Object.values(classEncounters.INFECTED_POOLS).flatMap(p => p.ELITE)[0];
        
        if (baseMob) {
            const avgSpeed = Math.floor(state.players.reduce((sum, p) => sum + (p.stats?.spd || 10), 0) / state.players.length);
            return classEncounters.scaleEnemyStats(baseMob, state.players.length, state.difficulty * 1.2, e.enemyIndex, encounter.avgLevel, avgSpeed);
        }
        return e;
    });

    encounter.theme = {
        theme: `Elite ${env.name}`,
        description: `Dangerous elites have adapted to the ${env.name}!`
    };

    return encounter;
}

// ==========================================
// 🎯 STATUS EFFECTS SYSTEM
// ==========================================

const STATUS_EFFECTS = {
    poison: {
        name: 'Poison',
        icon: '🧪',
        effect: 'damage_over_time',
        value: 10,
        tickRate: 'per_turn'
    },
    burn: {
        name: 'Burn',
        icon: '🔥',
        effect: 'damage_over_time',
        value: 15,
        tickRate: 'per_turn'
    },
    bleed: {
        name: 'Bleed',
        icon: '🩸',
        effect: 'damage_over_time',
        value: 12,
        tickRate: 'per_turn'
    },
    freeze: {
        name: 'Freeze',
        icon: '❄️',
        effect: 'skip_turn',
        duration: 1
    },
    stun: {
        name: 'Stun',
        icon: '💫',
        effect: 'skip_turn',
        duration: 1
    },
    sleep: {
        name: 'Sleep',
        icon: '😴',
        effect: 'skip_turn',
        wakeOnDamage: true
    },
    root: {
        name: 'Root',
        icon: '🌿',
        effect: 'cannot_move',
        canAttack: true
    },
    slow: {
        name: 'Slow',
        icon: '🐌',
        effect: 'reduce_speed',
        value: 50
    },
    haste: {
        name: 'Haste',
        icon: '⚡',
        effect: 'increase_speed',
        value: 30
    },
    curse: {
        name: 'Curse',
        icon: '💀',
        effect: 'reduce_stats',
        value: 20
    },
    shield: {
        name: 'Shield',
        icon: '🛡️',
        effect: 'absorb_damage',
        value: 50
    },
    regen: {
        name: 'Regeneration',
        icon: '💚',
        effect: 'heal_over_time',
        value: 10,
        tickRate: 'per_turn'
    },
    berserk: {
        name: 'Berserk',
        icon: '😡',
        effect: 'increase_damage',
        value: 50,
        penalty: 'reduce_defense',
        penaltyValue: 30
    },
    taunt: {
        name: 'Taunted',
        icon: '😠',
        effect: 'force_target',
        target: 'taunter'
    },
    charm: {
        name: 'Charmed',
        icon: '💖',
        effect: 'change_side',
        duration: 2
    },
    blind: {
        name: 'Blind',
        icon: '👁️',
        effect: 'reduce_accuracy',
        value: 50
    },
    silence: {
        name: 'Silence',
        icon: '🤐',
        effect: 'cannot_use_abilities'
    },
    shock: {
        name: 'Shock',
        icon: '⚡',
        effect: 'damage_over_time',
        value: 15,
        tickRate: 'per_turn'
    },
    weak: {
        name: 'Weakened',
        icon: '😵',
        effect: 'reduce_stats',
        value: 20
    },
    vulnerability: {
        name: 'Vulnerable',
        icon: '💔',
        effect: 'reduce_defense',
        value: 30
    },
    blessing: {

        name: 'Shock',
        icon: '⚡',
        effect: 'damage_over_time',
        value: 15,
        tickRate: 'per_turn'
    },
    weak: {
        name: 'Weakened',
        icon: '😵',
        effect: 'reduce_stats',
        value: 20
    },
    vulnerability: {
        name: 'Vulnerable',
        icon: '💔',
        effect: 'reduce_defense',
        value: 30
    },
    blessing: {
        name: 'Blessing',
        icon: '✨',
        effect: 'increase_stats',
        value: 20
    },
    wet: {
        name: 'Wet',
        icon: '💧',
        effect: 'synergy_primer'
    },
    oil: {
        name: 'Oiled',
        icon: '🛢️',
        effect: 'synergy_primer'
    },
    brittle: {
        name: 'Brittle',
        icon: '❄️💔',
        effect: 'increase_physical_damage_taken',
        value: 50
    }
};

// ==========================================
// 🗺️ ENCOUNTER TYPES
// ==========================================

const ENCOUNTER_TYPES = {
    COMBAT: {
        weight: 40,
        name: 'Combat',
        icon: '⚔️',
        generator: generateCombatEncounter
    },
    ELITE_COMBAT: {
        weight: 15,
        name: 'Elite Enemy',
        icon: '💪',
        generator: generateEliteCombatEncounter
    },
    TRAP: {
        weight: 10,
        name: 'Trap',
        icon: '🪤',
        generator: generateTrapEncounter
    },
    PUZZLE: {
        weight: 10,
        name: 'Puzzle',
        icon: '🧩',
        generator: generatePuzzleEncounter
    },
    MERCHANT: {
        weight: 8,
        name: 'Merchant',
        icon: '🏪',
        generator: generateMerchantEncounter
    },
    TREASURE: {
        weight: 10,
        name: 'Treasure',
        icon: '💎',
        generator: generateTreasureEncounter
    },
    EVENT: {
        weight: 7,
        name: 'Special Event',
        icon: '✨',
        generator: generateEventEncounter
    }
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
            if (s.chatId === chatId && (!senderJid || s.players.some(p => p.jid === senderJid))) {
                key = k;
                break;
            }
        }
    }

    const finalState = gameStates.get(key);
    if (finalState && finalState.timers) {
        Object.values(finalState.timers).forEach(t => {
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
                if (state.players.some(p => p.jid === senderJid)) userHasSolo = true;
            } else {
                groupActive = true;
            }
        }
    }
    
    if (isSolo) {
        if (userHasSolo) return { allowed: false, msg: "❌ You already have an active Solo raid in this chat!" };
        if (soloCount >= 2) return { allowed: false, msg: "❌ Max 2 Solo raids allowed per chat!" };
    } else {
        if (groupActive) return { allowed: false, msg: "❌ A Group raid is already active in this chat!" };
    }
    
    return { allowed: true };
}

// Initial state template (used for creating new sessions)
const INITIAL_STATE_TEMPLATE = {
    active: false,
    isProcessing: false,
    combatProcessing: false,
    chatId: null,
    mode: 'NORMAL', 
    difficulty: 1.0,
    dungeonRank: 'F',
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
    phase: 'IDLE', 
    storyChoices: [],
    achievementsUnlocked: [],
    stats: {
        monstersKilled: 0,
        bossesDefeated: 0,
        treasuresFound: 0,
        trapsTriggered: 0,
        playersRevived: 0
    }
};

// ==========================================
// 🎲 CORE GAME FUNCTIONS
// ==========================================

function getCurrentTier(chatId) {
    const state = getGameState(chatId);
    if (!state) return 1;
    const rankMap = { 'F': 1, 'E': 2, 'D': 3, 'C': 4, 'B': 5, 'A': 6, 'S': 7, 'SS': 8, 'SSS': 9 };
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

function calculateDamage(attacker, target, power, type = 'physical', element = 'PHYSICAL', chatId = null) {
    // 🛡️ Guard against NaN
    let damage = Number(power) || 0;
    
    // 💡 DRAGON SEAL RING REQUIREMENT
    if (target.id && (target.id.startsWith('DRAKE') || target.id.includes('DRAGON') || target.id.includes('Ancient Dragon'))) {
        if (!attacker.isEnemy && attacker.jid) {
            if (!inventorySystem.hasItem(attacker.jid, 'dragon_seal_ring')) {
                return { 
                    damage: 0, 
                    isCrit: false, 
                    wasEvaded: false, 
                    noDamageReason: "🛡️ Your attacks slide off the dragon's scales! You need the *Dragon Seal Ring* 💍🐲 to pierce their hide!" 
                };
            }
        }
    }

    // 💡 RANK DAMAGE BONUS (D-rank and up = DOUBLE damage)
    if (attacker.adventurerRank) {
        const rankValueMap = { 'F': 1, 'E': 2, 'D': 3, 'C': 4, 'B': 5, 'A': 6, 'S': 7, 'SS': 8, 'SSS': 9 };
        const rankVal = rankValueMap[attacker.adventurerRank] || 1;
        if (rankVal >= 3) { // D-rank is 3
            damage *= 2.0;
        }
    }

    // 💡 ENVIRONMENT MODIFIERS
    if (chatId) {
        const state = getGameState(chatId);
        const env = state?.environment;
        if (env) {
            // Fire Cave: Enemy fire bonus
            if (env.id === 'FIRE_CAVE' && attacker.isEnemy && element.toUpperCase() === 'FIRE') {
                damage *= (1 + (env.enemyBonus?.value || 0.10));
            }
            // Demon Castle: Dark magic empowerment
            if (env.id === 'DEMON_CASTLE' && attacker.isEnemy && type === 'magic') {
                damage *= (1 + (env.enemyBonus?.value || 0.20));
            }
        }
    }

    // Defense mitigation
    let def = type === 'physical' ? (Number(target.stats.def) || 0) : (Number(target.stats.mag) || 0) * 0.5;

    // 💡 STATUS EFFECT MODIFIERS (Defense)
    const targetEffects = target.statusEffects || [];
          if (targetEffects.some(e => e.type === 'shield')) def *= 1.5;
          if (targetEffects.some(e => e.type === 'vulnerability')) def *= 0.7;
          if (targetEffects.some(e => e.type === 'brittle') && type === 'physical') damage *= 1.5;
          if (targetEffects.some(e => e.type === 'berserk')) def *= 0.7; // Berserk penalty
    if (targetEffects.some(e => e.type === 'curse' || e.type === 'weak')) def *= 0.8;

    // 💡 STATUS EFFECT MODIFIERS (Attack Power)
    const attackerEffects = attacker.statusEffects || [];
    if (attackerEffects.some(e => e.type === 'blessing')) damage *= 1.2;
    if (attackerEffects.some(e => e.type === 'berserk')) damage *= 1.5; // Berserk bonus
    if (attackerEffects.some(e => e.type === 'curse' || e.type === 'weak')) damage *= 0.8;

    // 💡 DAMAGE REDUCTION (Secondary Stat)
    const dr = Number(target.stats.dmgReduction) || 0;
    damage = damage * (1 - (dr / 100));

    damage -= (def * 0.5);

    // Random variance (±10%)
    const variance = 0.9 + (Math.random() * 0.2);
    damage *= variance;

    // 💡 ELEMENTAL MODIFIER
    const targetElement = target.element || 'PHYSICAL';
    const chart = ELEMENT_CHART[element.toUpperCase()] || ELEMENT_CHART.PHYSICAL;

    if (chart.strongVs.includes(targetElement)) {
        damage *= 1.5;
    } else if (chart.weakTo.includes(targetElement)) {
        damage *= 0.75;
    }

    // Critical hit
    let isCrit = false;
    if (Math.random() * 100 < (Number(attacker.stats.crit) || 0)) {
        damage *= 1.5;
        isCrit = true;
    }

    damage = Math.max(0, Math.floor(damage));

    // 💡 EVASION CHECK (Secondary Stat)
    let evasionChance = Number(target.stats.evasion) || 0;

    // 🌍 WEATHER: Foggy (-15% Accuracy = +15% Evasion)
    const hours = new Date().getHours();
    if (Math.floor(hours / 6) % 4 === 1) evasionChance += 15;

    // 🌍 ENVIRONMENT EVASION
    if (chatId) {
        const state = getGameState(chatId);
        const env = state?.environment;
        if (env) {
            // Desert: Sandstorm (accuracy penalty)
            if (env.id === 'DESERT') {
                evasionChance += (env.modifier.accuracyReduction * 100);
            }
            // Forest: Camouflage (evasion bonus for enemies)
            if (env.id === 'SIMPLE_FOREST' && target.isEnemy) {
                evasionChance += (env.enemyBonus.evasionBonus * 100);
            }
        }
    }

    if (Math.random() * 100 < evasionChance) {
        return { damage: 0, isCrit: false, wasEvaded: true };
    }

    return {
        damage: Math.max(1, Math.floor(damage)),
        isCrit,
        wasEvaded: false
    };
}
function applyStatusEffect(target, effectType, duration = 3, value = 0, source = null) {
    if (!target) return { applied: false };
    if (!target.statusEffects) target.statusEffects = [];

    // 🧪 SYNERGY LOGIC
    const currentTypes = target.statusEffects.map(s => s.type);
    let finalType = effectType;
    let finalDuration = duration;
    let finalValue = value;
    let synergyMsg = "";

    // 1. WET + SHOCK = ELECTROCUTED (Stun)
    if (effectType === 'shock' && currentTypes.includes('wet')) {
        target.statusEffects = target.statusEffects.filter(s => s.type !== 'wet');
        finalType = 'stun';
        finalDuration = 1;
        synergyMsg = `⚡💧 *ELECTRO-CHARGE!* The water amplifies the shock, STUNNING ${target.name}!`;
    }
    // 2. WET + FREEZE = DEEP FREEZE
    else if (effectType === 'freeze' && currentTypes.includes('wet')) {
        target.statusEffects = target.statusEffects.filter(s => s.type !== 'wet');
        finalDuration = 2;
        synergyMsg = `❄️💧 *DEEP FREEZE!* ${target.name} is frozen solid!`;
    }
    // 3. OIL + FIRE = EXPLOSION
    else if (effectType === 'burn' && currentTypes.includes('oil')) {
        target.statusEffects = target.statusEffects.filter(s => s.type !== 'oil');
        const explosionDmg = Math.floor(target.stats.maxHp * 0.15);
        target.stats.hp -= explosionDmg;
        target.currentHP = Math.max(0, target.stats.hp);
        synergyMsg = `🔥🛢️ *BOOM!* The oil ignites, dealing ${explosionDmg} explosive damage!`;
    }

    // Check if already has this effect
    const existing = target.statusEffects.find(e => e.type === finalType);
    if (existing) {
        existing.duration = Math.max(existing.duration, finalDuration);
        existing.value = Math.max(existing.value || 0, finalValue);
        return { applied: true, synergyMsg };
    }

    // Default if unknown to prevent crashes
    const def = STATUS_EFFECTS[finalType] || { name: finalType, icon: '❓', effect: 'unknown', value: 0 };

    target.statusEffects.push({
        type: finalType,
        name: def.name,
        duration: finalDuration,
        value: finalValue || def.value || 0,
        icon: def.icon,
        source: source,
        effect: def.effect, 
        tickRate: def.tickRate
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
        const icon = effect.icon || template.icon || '✨';
        const value = Number(effect.value !== undefined ? effect.value : template.value) || 0;

        // Process effect based on type
        if (effect.effect === 'damage_over_time' || template.effect === 'damage_over_time') {
            const damage = Math.floor(value);
            entity.stats.hp -= damage;
            messages.push(`🩸 *${name.toUpperCase()} TICK:* ${icon} ${entity.name} takes **${damage}** damage!`);
        } else if (effect.effect === 'heal_over_time' || template.effect === 'heal_over_time') {
            const heal = Math.min(value, (entity.stats.maxHp || entity.stats.hp) - entity.stats.hp);
            entity.stats.hp += heal;
            messages.push(`💚 *REGENERATION:* ${icon} ${entity.name} recovers **${Math.floor(heal)}** HP!`);
        } else if (effect.effect === 'reduce_stats' || template.effect === 'reduce_stats' || effect.effect === 'reduce_defense' || template.effect === 'reduce_defense') {
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

    return messages;
}
function getAvailableEnemies(poolId) {
    // poolId is 1-indexed, convert to avgLevel for classEncounters
    const levelMap = { 1: 5, 2: 25, 3: 45, 4: 65, 5: 85 };
    const avgLevel = levelMap[poolId] || 5;
    
    const poolData = classEncounters.getEnemyPoolByLevel(avgLevel);
    if (!poolData) return ['DROWNED_ONE']; // Fallback
    
    // Flatten all categories (COMMON, ELITE, etc.) into a simple list of IDs
    const enemyPool = [];
    if (poolData.COMMON) poolData.COMMON.forEach(e => enemyPool.push(e.id));
    if (poolData.ELITE) poolData.ELITE.forEach(e => enemyPool.push(e.id));
    
    return enemyPool.length > 0 ? enemyPool : ['DROWNED_ONE'];
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
            crit: 5
        },
        abilities: template.abilities,
        statusEffects: [],
        isEnemy: true,
                        loot: template.loot,
                        xp: Math.floor(template.xp * (1 + (level - 1) * 0.3)),
                        gold: Math.floor(template.gold * 15 * (1 + (level - 1) * 0.8))
                    };    return enemy;
}

function createBoss(bossType, level = 1) {
    const template = BOSS_ENEMIES[bossType];
    if (!template) return null;
    
    const boss = {
        id: `boss_${Date.now()}`,
        type: bossType,
        name: template.name,
        icon: template.icon,
        level: level,
        stats: {
            hp: Math.floor(template.stats.hp * (1 + (level - 1) * 0.3)),
            maxHp: Math.floor(template.stats.hp * (1 + (level - 1) * 0.3)),
            energy: 200,
            maxEnergy: 200,
            atk: Math.floor(template.stats.atk * (1 + (level - 1) * 0.2)),
            def: Math.floor(template.stats.def * (1 + (level - 1) * 0.2)),
            mag: Math.floor(template.stats.mag * (1 + (level - 1) * 0.2)),
            spd: template.stats.spd,
            luck: template.stats.luck,
            crit: template.stats.crit || 10
        },
        phases: template.phases,
        currentPhase: 0,
        abilities: template.phases[0].abilities,
        statusEffects: [],
        isEnemy: true,
        isBoss: true,
        loot: template.loot,
        xp: Math.floor(template.xp * (1 + (level - 1) * 0.4)),
        gold: Math.floor(template.gold * 30 * (1 + (level - 1) * 1.0))
    };
    
    return boss;
}

// ==========================================
// 📝 ENCOUNTER GENERATORS
// ==========================================

function generateTrapEncounter(chatId) {
    const tier = getCurrentTier(chatId);

    const traps = [
        {
            name: 'Poison Dart Trap',
            icon: '🎯',
            damage: 25 + (tier * 15),
            difficulty: 12 + tier
        },
        {
            name: 'Pit Trap',
            icon: '🕳️',
            damage: 40 + (tier * 20),
            difficulty: 14 + tier
        },
        {
            name: 'Fire Trap',
            icon: '🔥',
            damage: 35 + (tier * 18),
            difficulty: 13 + tier
        }
    ];
    
    const trap = traps[Math.floor(Math.random() * traps.length)];
    
    return {
        type: 'TRAP',
        trap: trap,
        description: `You trigger a ${trap.name}!`,
        choices: [
            { 
                id: '1', text: 'Try to dodge (SPD check)', stat: 'spd', difficulty: trap.difficulty,
                success: { description: "You jump out of the way just in time!", gold: 50 },
                failure: { description: `You were too slow!`, damage: trap.trap?.damage || trap.damage }
            },
            { 
                id: '2', text: 'Shield the party (DEF check)', stat: 'def', difficulty: trap.difficulty - 2,
                success: { description: "You block the worst of it!", damage: Math.floor(trap.damage / 4) },
                failure: { description: `Your shield wasn't enough!`, damage: Math.floor(trap.damage * 0.8) }
            },
            { 
                id: '3', text: 'Disable mechanism (LUCK check)', stat: 'luck', difficulty: trap.difficulty + 2,
                success: { description: "You successfully disarmed the trap! Found some scrap gold.", gold: 200 },
                failure: { description: `It blew up in your face!`, damage: trap.damage }
            }
        ]
    };
}

function generatePuzzleEncounter(chatId) {
    const tier = getCurrentTier(chatId);
    const puzzles = [
        {
            name: 'Ancient Riddle',
            icon: '📜',
            reward: 300 + (tier * 150),
            difficulty: 15 + tier
        },
        {
            name: 'Magic Lock',
            icon: '🔐',
            reward: 500 + (tier * 200),
            difficulty: 16 + tier
        }
    ];
    
    const puzzle = puzzles[Math.floor(Math.random() * puzzles.length)];
    
    return {
        type: 'PUZZLE',
        puzzle: puzzle,
        description: `You discover a ${puzzle.name}!`,
        choices: [
            { 
                id: '1', text: 'Decode symbols (MAG check)', stat: 'mag', difficulty: puzzle.difficulty,
                success: { description: "The runes reveal their secrets!", gold: puzzle.reward },
                failure: { description: "A magical feedback pulse hits the party!", damage: 30 + (tier * 5) }
            },
            { 
                id: '2', text: 'Brute force (ATK check)', stat: 'atk', difficulty: puzzle.difficulty + 4,
                success: { description: "You smashed it open! Found some gold.", gold: Math.floor(puzzle.reward * 0.6) },
                failure: { description: "You hurt yourself trying to break it!", damage: 50 + (tier * 10) }
            }
        ]
    };
}

function generateMerchantEncounter(chatId) {
    return {
        type: 'MERCHANT',
        description: 'A traveling merchant appears!',
        shopItems: [
            'health_potion',
            'mana_potion',
            'strength_brew',
            'defense_tonic',
            'phoenix_down',
            'bomb'
        ]
    };
}

function generateTreasureEncounter(chatId) {
    const tier = getCurrentTier(chatId);
    const treasureTypes = [
        { name: 'Ancient Chest', gold: 1000 + (tier * 500), damage: 50 + (tier * 10) },
        { name: 'Cursed Relic', gold: 5000 + (tier * 1000), damage: 100 + (tier * 20) }
    ];
    
    const treasure = treasureTypes[Math.floor(Math.random() * treasureTypes.length)];
    
    return {
        type: 'TREASURE',
        treasure: treasure,
        description: `You found a ${treasure.name}! It pulses with strange energy.`,
        choices: [
            { 
                id: '1', text: 'Open carefully (LUCK check)', stat: 'luck', difficulty: 12 + tier,
                success: { description: "You safely opened it!", gold: treasure.gold },
                failure: { description: "A magical trap triggers!", damage: treasure.damage }
            },
            { 
                id: '2', text: 'Smash it open', 
                outcome: { description: "You broke the mechanism but some contents were destroyed.", gold: Math.floor(treasure.gold / 3), damage: Math.floor(treasure.damage / 2) }
            }
        ]
    };
}

function generateEventEncounter(chatId) {
    const events = [
        {
            name: 'Mysterious Altar',
            choices: [
                { 
                    id: '1', text: 'Offer Blood', 
                    outcome: { description: "The altar drinks your life force and grants power.", damage: 50, gold: 1000 } 
                },
                { 
                    id: '2', text: 'Pray (LUCK check)', stat: 'luck', difficulty: 15,
                    success: { description: "The gods smile upon you.", heal: 100, gold: 500 },
                    failure: { description: "The gods are silent.", damage: 20 }
                },
                { id: '3', text: 'Leave', outcome: { description: "You leave the altar alone." } }
            ]
        }
    ];
    
    const event = events[Math.floor(Math.random() * events.length)];
    
    return {
        type: 'EVENT',
        event: event,
        name: event.name,
        description: `You come across a ${event.name}.`,
        choices: event.choices
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
    state.currentEncounterType = encounter.type || 'COMBAT';

    state.combatRound = 0;
    state.pendingActions = {};
    state.combatHistory = [];
    
    // AI Narration of the encounter start
    const prompt = `
    Context: Fantasy RPG. The party enters combat.
    Enemies: ${state.enemies.map(e => e.name).join(', ')}.
    Location Description: ${encounter.description}.
    
    Write a dramatic, intense narration (2-3 sentences) setting the scene for the battle. 
    IMPORTANT: Provide ONLY the text narration. No code blocks, no markdown formatting like *bold* (except for proper names), no commentary.
    `;

    let narration = "";
    try {
        if (state.smartGroqCall) {
            const completion = await state.smartGroqCall({
                messages: [{ role: "system", content: prompt }],
                model: "llama-3.1-8b-instant"
            });
            narration = completion.choices[0].message.content;
        } else if (state.groq) {
            const completion = await state.groq.chat.completions.create({
                messages: [{ role: "system", content: prompt }],
                model: "llama-3.1-8b-instant"
            });
            narration = completion.choices[0].message.content;
        }
    } catch (e) {
        console.error("Narration error:", e.message);
        narration = encounter.description; // Fallback
    }

    // NEW: Generate combat image and caption
    const scene = await combatIntegration.generateCombatScene(
        state.players,
        state.enemies,
        'START',
        {
            rank: state.dungeonRank, // Pass rank explicitly
            backgroundPath: state.backgroundPath, // Consistent with TURN phase
            encounterInfo: {
                ...encounter,
                rank: state.dungeonRank, // Also in encounterInfo
                backgroundPath: state.backgroundPath, // CRITICAL FIX for renderCombatStart
                narration: narration, // Pass narration to caption generator
                theme: encounter.theme || { theme: 'Battle', description: 'A fierce fight breaks out!' }
            }
        }
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
                    caption: scene.caption
                });
            } else if (scene.imagePath && fs.existsSync(scene.imagePath)) {
                await sock.sendMessage(state.chatId, {
                    image: fs.readFileSync(scene.imagePath),
                    caption: scene.caption
                });
                // Clean up temp file
                setTimeout(() => {
                    if (fs.existsSync(scene.imagePath)) fs.unlinkSync(scene.imagePath);
                }, 10000);
            } else {
                await sock.sendMessage(state.chatId, { text: scene.caption || "⚔️ Combat Started!" });
            }
        } catch (mediaError) {
            console.error("Media upload failed in startCombat:", mediaError.message);
            try {
                await sock.sendMessage(state.chatId, { text: scene.caption || "⚔️ Combat Started!" });
            } catch (err) {
                console.error("Fallback text failed in startCombat:", err.message);
            }
        }
    } else {
        // Fallback to text if image fails
        try {
            await sock.sendMessage(state.chatId, { text: scene.caption || "⚔️ Combat Started!" });
        } catch (err) {
            console.error("Fallback text failed in startCombat (image failed):", err.message);
        }
    }

    // 💡 INITIALIZE ACTION GAUGE
    const allCombatants = [
        ...state.players.filter(p => !p.isDead),
        ...state.enemies
    ];
    
    allCombatants.forEach(c => {
        c.actionGauge = Math.floor((c.stats.spd || 10) / 2); // Initial headstart based on speed
    });

    state.turnOrder = allCombatants;
    
    // Wait before starting first turn - Instant for solo
    const startDelay = state.solo ? 0 : 120000;
    state.timers.combatStart = setTimeout(async () => {
        try {
            if (!state.inCombat) return; // Safety check
            
            let turnMsg = `🔔 *BATTLE START!*\n\n🎲 *Turn Order:*\n`;
            state.turnOrder.forEach((c, i) => {
                const icon = c.isEnemy ? c.icon : (c.class?.icon || '👤');
                turnMsg += `  ${i + 1}. ${icon} ${c.name}\n`;
            });
            
            await sock.sendMessage(state.chatId, { text: turnMsg });
            await processCombatTurn(sock, sessionKey);
        } catch (err) {
            console.error("[Quest] combatStart timer error:", err?.message || err);
        }
    }, startDelay);
}

async function checkCombatEnd(sock, state, sessionKey) {
    const playersDead = state.players.every(p => p.isDead || p.stats.hp <= 0);
    const enemiesDead = state.enemies.every(e => e.stats.hp <= 0);
    
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
            state.players.forEach(p => p.justDied = false);
            state.enemies.forEach(e => e.justDied = false);

            let activeActor = null;
            let ticks = 0;
            const maxTicks = 1000;

            while (!activeActor && ticks < maxTicks) {
                ticks++;
                for (const c of state.turnOrder) {
                    if (c.stats.hp <= 0) continue;

                    let speed = c.stats.spd || 10;
                    if (state.environment?.id === 'ICE_CAVE' && !c.isEnemy) speed = Math.floor(speed * 0.9);
                    
                    const cEffects = c.statusEffects || [];
                    if (cEffects.some(e => e.type === 'haste')) speed *= 1.3;
                    if (cEffects.some(e => e.type === 'slow')) speed *= 0.5;
                    if (cEffects.some(e => e.type === 'curse' || e.type === 'weak')) speed *= 0.8;

                    c.actionGauge = (c.actionGauge || 0) + Math.max(1, speed);
                    if (c.actionGauge >= 100) {
                        activeActor = c;
                        break;
                    }
                }
            }

            if (!activeActor) break;

            activeActor.actionGauge -= 100;
            state.activeCombatant = activeActor;
            state.turnCount = (state.turnCount || 0) + 1;

            if (activeActor.isBoss) {
                if (state.turnCount > 15) {
                    activeActor.stats.atk = Math.floor(activeActor.stats.atk * 1.05);
                    await sock.sendMessage(state.chatId, { text: `⚠️ *${activeActor.name}* is growing more violent!` });
                }
                if (state.turnCount > 30) {
                    await sock.sendMessage(state.chatId, { text: `💀 *${activeActor.name}* UNLEASHING TOTAL ANNIHILATION!` });
                    state.players.forEach(p => { p.stats.hp = 0; p.isDead = true; });
                    await endCombat(sock, false, sessionKey);
                    return;
                }
            }

            const statusMessages = processStatusEffects(activeActor);
            if (state.environment?.id === 'FIRE_CAVE') {
                const heatDmg = Math.floor(activeActor.stats.maxHp * 0.05);
                activeActor.stats.hp -= heatDmg;
                activeActor.currentHP = Math.max(0, activeActor.stats.hp);
                statusMessages.push(`🌋 *Heat Exhaustion:* ${activeActor.name} takes ${heatDmg} fire damage!`);
            }

            if (statusMessages.length > 0) {
                try { await sock.sendMessage(state.chatId, { text: statusMessages.join('\n') }); } catch (err) {}
            }

            if (activeActor.stats.hp <= 0) {
                await handleDeath(sock, activeActor, sessionKey);
                if (await checkCombatEnd(sock, state, sessionKey)) return;
                continue;
            }

            const skipEffects = ['freeze', 'stun', 'sleep'];
            if ((activeActor.statusEffects || []).some(e => skipEffects.includes(e.type))) {
                await sock.sendMessage(state.chatId, { text: `${activeActor.icon} ${activeActor.name} is unable to act!` });
                await nextTurn(sock, { actor: activeActor, action: { name: 'Unable to Act' } }, sessionKey);
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
    const icon = player.class?.icon || '👤';
    const inventory = inventorySystem.formatInventory(player.jid);
    const usableItems = !inventory.isEmpty ? inventory.items.filter(item => {
        const info = lootSystem.getItemInfo(item.id);
        return info && info.usable;
    }) : [];

    let msg = `┏━━━━━━━━━━━━┓\n`;
    msg += `┃ 🎯 YOUR TURN ┃\n`;
    msg += `┗━━━━━━━━━━━━┛\n\n`;

    msg += `${icon} *${player.name}*\n`;
    msg += `❤️ ${player.stats.hp}/${player.stats.maxHp} HP\n`;
    msg += `⚡ ${player.stats.energy}/${player.stats.maxEnergy} EN\n`;

    if (player.statusEffects && player.statusEffects.length > 0) {
        msg += `📋 ${player.statusEffects.map(e => e.icon).join(' ')}\n`;
    }

    msg += `\n*ACTIONS:*\n`;
    msg += `⚔️ \`.j combat atk <#>\`\n`;
    msg += `✨ \`.j combat skill <#>\`\n`;
    msg += `🎒 \`.j combat item <#>\`\n`;
    msg += `🛡️ \`.j combat def\`\n`;

    if (usableItems.length > 0) {
        msg += `\n*BAG:*\n`;
        usableItems.slice(0, 3).forEach((item, i) => {
            const info = lootSystem.getItemInfo(item.id);
            msg += `${i + 1}. ${info.name} x${item.quantity}\n`;
        });
        if (usableItems.length > 3) msg += `...+${usableItems.length - 3} more (.j bag)\n`;
    } else {
        msg += `_No usable items_\n`;
    }

    try {
        await sock.sendMessage(state.chatId, { text: msg });
    } catch (err) {
        console.error("Failed to send player prompt in promptPlayerAction:", err.message);
    }

    // 💡 NEW TURN WAITING LOGIC
    // Create a promise that resolves when the player takes an action
    return new Promise((resolve) => {
        const turnTime = state.solo ? 120000 : (state.actionJustTaken ? 120000 : GAME_CONFIG.COMBAT_TURN_TIME);
        state.actionJustTaken = false;

        // Save resolve function to the state so handleCombatAction can call it
        state.resolveTurn = resolve;

        state.timers.combat = setTimeout(async () => {
            if (state.inCombat && state.activeCombatant?.jid === player.jid && !state.pendingActions[player.jid]) {
                try {
                    await performAction(sock, player, { type: 'defend' }, sessionKey);
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

    const icon = player.class?.icon || '👤';
    let resultMsg = `${icon} ${player.name}: `;
    let turnInfo = {
        turnNumber: state.combatRound + 1,
        actor: player,
        action: { name: 'Basic Attack' },
        target: null,
        damage: 0,
        healing: 0,
        effects: []
    };
    
    if (action.type === 'attack') {
        // Default to first alive enemy if no explicit target given
        if (action.targetIndex === undefined || action.targetIndex === null || action.targetIndex < 0) {
            action.targetIndex = state.enemies.findIndex(e => e.stats.hp > 0);
        }
        const target = state.enemies[action.targetIndex];
        if (!target || target.stats.hp <= 0) {
            // Auto-redirect to first alive enemy
            const aliveIdx = state.enemies.findIndex(e => e.stats.hp > 0);
            if (aliveIdx >= 0) action.targetIndex = aliveIdx;
        }
        const resolvedTarget = state.enemies[action.targetIndex];
        if (!resolvedTarget || resolvedTarget.stats.hp <= 0) {
            resultMsg += `❌ No valid targets!`;
        } else {
            // 💡 Get weapon element
            const mainHand = player.equipment?.main_hand;
            const element = mainHand ? (lootSystem.getItemInfo(mainHand.id)?.element || 'PHYSICAL') : 'PHYSICAL';
            
            const { damage, isCrit, wasEvaded, noDamageReason } = calculateDamage(player, resolvedTarget, player.stats.atk, 'physical', element, sessionKey);
            
            if (noDamageReason) {
                resultMsg += noDamageReason;
                turnInfo.action = { name: 'Failed Attack' };
            } else if (wasEvaded) {
                resultMsg += `💨 *MISS!* ${resolvedTarget.icon} ${resolvedTarget.name} evaded the attack.`;
                turnInfo.action = { name: 'Missed Attack' };
            } else {
                resolvedTarget.stats.hp -= damage;
                resolvedTarget.currentHP = Math.max(0, resolvedTarget.stats.hp);

                if (resolvedTarget.stats.hp > 0 && resolvedTarget.isBoss) {
                    await checkBossPhase(sock, resolvedTarget, state.chatId);
                }

                if (resolvedTarget.stats.hp <= 0) resolvedTarget.justDied = true;

                player.combatStats.damageDealt += damage;
                resolvedTarget.combatStats = resolvedTarget.combatStats || { damageTaken: 0 };
                resolvedTarget.combatStats.damageTaken += damage;

                resultMsg += `${isCrit ? '💥 CRITICAL! ' : ''}Strikes ${resolvedTarget.icon} ${resolvedTarget.name} for *${damage}* damage!`;

                turnInfo.action = { name: 'Basic Attack' };
                turnInfo.target = resolvedTarget;
                turnInfo.damage = damage;
                if (isCrit) turnInfo.effects.push('CRITICAL');

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
                    state.stats.monstersKilled++;

                    // 💡 Send message BEFORE combat-end check so player always sees result
                    try { await sock.sendMessage(state.chatId, { text: resultMsg }); } catch(e) {}
                    state.combatHistory.push(resultMsg);
                    delete state.pendingActions[player.jid];

                    if (await checkCombatEnd(sock, state, sessionKey)) {
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
    } else if (action.type === 'rest') {
        const energyRegen = 15;
        player.stats.energy = Math.min(player.stats.maxEnergy, player.stats.energy + energyRegen);
        resultMsg += `🧘 *RESTED* and recovered ⚡ ${energyRegen} Energy.`;
        turnInfo.action = { name: 'Rest' };
        turnInfo.effects.push('REGEN');
    } else if (action.type === 'flee') {
        const avgPlayerSpd = state.players.reduce((s, p) => s + (p.stats.spd || 10), 0) / state.players.length;
        const avgEnemySpd = state.enemies.reduce((s, e) => s + (e.stats.spd || 10), 0) / state.enemies.length;
        
        const successChance = (avgPlayerSpd / avgEnemySpd) * 60;
        if (Math.random() * 100 < successChance) {
            resultMsg += `🏃 Party successfully escaped from combat!`;
            state.inCombat = false;
            state.active = false; 
        } else {
            resultMsg += `❌ *FLEE FAILED!* The party stumbled and lost their turns.`;
        }
        turnInfo.action = { name: 'Flee' };
    } else if (action.type === 'defend') {
        applyStatusEffect(player, 'shield', 1, Math.floor(player.stats.def * 1.5));
        resultMsg += `🛡️ Takes a defensive stance!`;
        turnInfo.action = { name: 'Defend' };
        turnInfo.effects.push('SHIELD');
    } else if (action.type === 'ability') {
        if (action.result) {
            resultMsg = action.result.message;
            if (action.result.damage) player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + action.result.damage;
            if (action.result.healing) player.combatStats.healed = (player.combatStats.healed || 0) + action.result.healing;
            
            turnInfo.action = { name: action.result.abilityName || 'Ability' };
            turnInfo.damage = action.result.damage || 0;
            turnInfo.healing = action.result.healing || 0;
        } else {
            resultMsg += `✨ Uses ability!`;
            turnInfo.action = { name: 'Ability' };
        }
    } else if (action.type === 'item') {
        const itemKey = action.itemId;
        const item = lootSystem.getItemInfo(itemKey);
        
        if (!item || !item.usable) {
            resultMsg += `❌ Invalid item!`;
        } else {
            inventorySystem.removeItem(player.jid, itemKey, 1);
            let target;
            const isNegative = ['damage_aoe', 'apply_poison', 'freeze_enemy', 'flee', 'bribe', 'percent_hp_damage'].includes(item.effect);
            if (action.targetIndex !== undefined) {
                target = isNegative ? state.enemies[action.targetIndex] : state.players.find(p => !p.isDead && state.players.indexOf(p) === action.targetIndex);
            } else {
                target = isNegative ? state.enemies.find(e => e.stats.hp > 0) : player;
            }

            if (!target && item.effect !== 'damage_aoe' && item.effect !== 'team_revive') {
                resultMsg += `❌ Target not found!`;
            } else {
                resultMsg += `🎒 Uses *${item.name}*! `;
                turnInfo.action = { name: item.name };
                
                switch (item.effect) {
                    case 'heal':
                        const hMult = getHealMult(sessionKey);
                        const healVal = (item.effectValue || 0.3) * hMult; // Adjusted by environment
                        const healAmt = Math.floor(target.stats.maxHp * healVal);
                        const actualHeal = Math.min(healAmt, target.stats.maxHp - target.stats.hp);
                        target.stats.hp += actualHeal;
                        target.currentHP = target.stats.hp; // Sync
                        resultMsg += `\n💖 Restored ${actualHeal} HP to ${target.name}! (${Math.round(healVal * 100)}%)${hMult < 1 ? ' (Healing Reduced)' : ''}`;
                        turnInfo.healing = actualHeal;
                        break;
                    case 'regen':
                        const regVal = item.effectValue || 0.1;
                        const regAmt = Math.floor(target.stats.maxHp * regVal);
                        applyStatusEffect(target, 'regen', item.duration || 3, regAmt);
                        resultMsg += `\n🧴 Applied regeneration salve to ${target.name}! (+${regAmt} HP/turn)`;
                        break;
                    case 'restore_energy':
                        const enVal = item.effectValue || 0.4;
                        const maxEn = target.stats.maxEnergy || 100;
                        const enAmt = Math.floor(maxEn * enVal);
                        target.stats.energy = Math.min(maxEn, target.stats.energy + enAmt);
                        target.currentEnergy = target.stats.energy;
                        resultMsg += `\n⚡ Restored ${enAmt} energy to ${target.name}! (${Math.round(enVal * 100)}%)`;
                        break;
                    case 'buff_atk':
                        applyStatusEffect(target, 'blessing', 3, item.effectValue || 0);
                        resultMsg += `\n💪 Buffed ${target.name}'s attack!`;
                        break;
                    case 'buff_def':
                        applyStatusEffect(target, 'shield', 3, item.effectValue || 0);
                        resultMsg += `\n🛡️ Buffed ${target.name}'s defense!`;
                        break;
                    case 'buff_spd':
                        applyStatusEffect(target, 'haste', 3, item.effectValue || 0);
                        resultMsg += `\n⚡ Buffed ${target.name}'s speed!`;
                        break;
                    case 'buff_luck':
                        applyStatusEffect(target, 'blessing', 3, item.effectValue || 0);
                        resultMsg += `\n🍀 Buffed ${target.name}'s luck!`;
                        break;
                    case 'buff_all':
                        applyStatusEffect(target, 'blessing', item.duration || 3, item.effectValue || 20);
                        applyStatusEffect(target, 'haste', item.duration || 3, 20);
                        resultMsg += `\n✨ ${target.name} is overflowing with power! (+All Stats)`;
                        break;
                    case 'buff_all_damage':
                        applyStatusEffect(target, 'berserk', 2, item.effectValue || 50);
                        resultMsg += `\n💥 ${target.name} enters a BERSERKER RAGE! (+Damage, -Defense)`;
                        break;
                    case 'shield_max':
                        applyStatusEffect(target, 'shield', 5, 100); // Massive shield
                        resultMsg += `\n🛡️ ${target.name} is encased in a massive energy barrier!`;
                        break;
                    case 'damage_aoe':
                    case 'aoe_damage':
                        state.enemies.forEach(async (e) => {
                            if (e.stats.hp > 0) {
                                const dmg = (item.effectValue || 80);
                                e.stats.hp -= dmg;
                                e.currentHP = e.stats.hp; // Sync
                                player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + dmg;
                                resultMsg += `\n💥 ${e.name} takes ${dmg} damage!`;
                                if (e.stats.hp <= 0) {
                                    await handleDeath(sock, e, sessionKey, player.name);
                                    resultMsg += `\n💀 ${e.name} has fallen!`;
                                }
                            }
                        });
                        turnInfo.damage = item.effectValue || 80;
                        break;
                    case 'aoe_debuff_damage':
                        state.enemies.forEach(async (e) => {
                            if (e.stats.hp > 0) {
                                const dmg = (item.effectValue || 150);
                                e.stats.hp -= dmg;
                                e.currentHP = e.stats.hp;
                                applyStatusEffect(e, 'vulnerability', 3, 20);
                                resultMsg += `\n💥 ${e.name} takes ${dmg} damage and is weakened!`;
                                if (e.stats.hp <= 0) {
                                    await handleDeath(sock, e, sessionKey, player.name);
                                }
                            }
                        });
                        break;
                    case 'percent_hp_damage':
                        // True damage based on % of Max HP (ignores defense)
                        const rawDmg = Math.floor(target.stats.maxHp * (item.effectValue || 0.25));
                        // Counterplay: Bomb resistance check
                        const finalDmg = target.stats.bomb_resistance ? Math.floor(rawDmg * 0.5) : rawDmg;
                        target.stats.hp -= finalDmg;
                        target.currentHP = target.stats.hp;
                        player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + finalDmg;
                        resultMsg += `\n💥 The Abyssal Detonator consumes ${target.name}! Dealt ${finalDmg} TRUE damage!`;
                        turnInfo.damage = finalDmg;
                        if (target.stats.hp <= 0) {
                            await handleDeath(sock, target, sessionKey, player.name);
                            resultMsg += `\n💀 ${target.name} has fallen!`;
                        }
                        break;
                    case 'flee':
                        resultMsg += `\n💨 The smoke bomb creates a diversion! The party escapes!`;
                        try { await sock.sendMessage(state.chatId, { text: resultMsg }); } catch(e) {}
                        return endAdventure(sock, sessionKey, false); // End without victory but alive
                    case 'revive':
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
    try { await sock.sendMessage(state.chatId, { text: resultMsg }); } catch(e) {}
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
            const decision = monsterSkills.evaluateAction(enemy, state.players, state.enemies);

            let turnInfo = {
                actor: enemy,
                action: { name: 'Action' },
                target: null,
                damage: 0,
                effects: []
            };

            // --- RELEASE CHARGE ---
            if (decision.action === 'release_charge') {
                const skillId = decision.skillId;
                const skillData = monsterSkills.getSkillById(enemy.archetype, skillId);

                if (skillData && skillData.nextSkill) {
                    const followUpId = skillData.nextSkill;
                    const followUpSkill = monsterSkills.getSkillById(enemy.archetype, followUpId);
                    const target = enemy.chargeTarget || state.players.find(p => !p.isDead);

                    try { await sock.sendMessage(chatId, { text: `💥 *${enemy.name}* UNLEASHES THE CHARGE!` }); } catch (err) {}

                    const effect = followUpSkill.currentEffect || followUpSkill.effect(enemy.level || 1);
                    await applyAbilityEffect(sock, enemy, followUpSkill, effect, state.players.indexOf(target), chatId);

                    turnInfo.action.name = followUpSkill.name;
                    turnInfo.target = target;
                    enemy.isCharging = false;
                    enemy.chargingSkill = null;
                    enemy.chargeTarget = null;

                    setTimeout(async () => { await nextTurn(sock, turnInfo, sessionKey); resolve(); }, turnDelay);
                    return;
                }
            }

            // --- USE SKILL ---
            if (decision.action === 'skill') {
                const skill = decision.skill;
                const target = decision.target;

                if (skill.type === 'charge') {
                    enemy.isCharging = true;
                    enemy.chargingSkill = skill.id;
                    enemy.chargeTarget = target;
                    try { await sock.sendMessage(chatId, { text: `⚠️ *${enemy.name}* ${skill.msg}` }); } catch (err) {}

                    turnInfo.action.name = "Charging";
                    setTimeout(async () => { await nextTurn(sock, turnInfo, sessionKey); resolve(); }, turnDelay);
                    return;
                }

                try { await sock.sendMessage(chatId, { text: `⚡ *${enemy.name}* uses *${skill.name}*!` }); } catch (err) {}

                const effect = skill.currentEffect || (typeof skill.effect === 'function' ? skill.effect(enemy.level || 1) : skill.effect);
                let targetIdx = (decision.targetType === 'ally' || decision.targetType === 'self') ? state.enemies.indexOf(target) : state.players.indexOf(target);

                await applyAbilityEffect(sock, enemy, skill, effect, targetIdx, chatId);

                turnInfo.action.name = skill.name;
                turnInfo.target = target;

                setTimeout(async () => { await nextTurn(sock, turnInfo, sessionKey); resolve(); }, turnDelay);
                return;
            }

            // --- DEFAULT ATTACK ---
            let target = decision.target;
            if (!target || target.isDead) {
                const alive = state.players.filter(p => !p.isDead);
                if (alive.length === 0) {
                    setTimeout(async () => { await nextTurn(sock, turnInfo, sessionKey); resolve(); }, turnDelay);
                    return;
                }
                target = alive[0];
            }

            const { damage, isCrit, wasEvaded } = calculateDamage(enemy, target, enemy.stats.atk, 'physical', 'PHYSICAL', sessionKey);

            let resultMsg = `${enemy.icon} *${enemy.name}* `;
            if (wasEvaded) {
                resultMsg += `attacks ${target.name} but 💨 MISSES!`;
            } else {
                target.stats.hp -= damage;
                target.currentHP = Math.max(0, target.stats.hp);
                resultMsg += `attacks ${target.name} for 💥 ${damage} damage!${isCrit ? ' (CRIT!)' : ''}`;
                turnInfo.damage = damage;
                turnInfo.target = target;

                if (target.stats.hp <= 0) {
                    await handleDeath(sock, target, sessionKey, enemy.name);
                    resultMsg += `\n💀 ${target.name} has fallen!`;
                }
            }

            try { await sock.sendMessage(chatId, { text: resultMsg }); } catch (err) {}

            setTimeout(async () => { await nextTurn(sock, turnInfo, sessionKey); resolve(); }, turnDelay);

        } catch (error) {
            console.error(`[Combat] Critical error in performEnemyAction for ${enemy.name}:`, error);
            setTimeout(async () => { await nextTurn(sock, { actor: enemy, action: { name: 'Error' } }, sessionKey); resolve(); }, 1000);
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
            nextPhase.effects.forEach(eff => {
                if (eff.type === 'stat_boost') {
                    boss.stats[eff.stat] = Math.floor(boss.stats[eff.stat] * (1 + eff.value / 100));
                    msg += `\n📈 ${boss.name}'s ${eff.stat.toUpperCase()} increased!`;
                }
                if (eff.type === 'heal') {
                    boss.stats.hp = Math.min(boss.stats.maxHp, boss.stats.hp + eff.value);
                    boss.currentHP = boss.stats.hp;
                    msg += `\n💖 ${boss.name} recovered health!`;
                }
            });
        }

        try {
            await sock.sendMessage(chatId, { text: msg });
        } catch (err) {
            console.error(`[Combat] Failed to send boss phase message: ${err.message}`);
        }
        return true;
    }
    return false;
}

async function handleDeath(sock, entity, sessionKey, lastKiller = "The Infection") {
    const state = gameStates.get(sessionKey);
    if (!state) return;
    const chatId = state.chatId;
    entity.isDead = true;
    entity.stats.hp = 0;
        entity.currentHP = 0; // Sync
        entity.justDied = true;
    
        if (entity.isEnemy) {
            state.stats.monstersKilled++;
            
            // Dragon Tracking
            if (entity.id.startsWith('DRAKE') || entity.id.includes('DRAGON')) {
                state.players.forEach(p => {
                    economy.incrementDragonKills(p.jid, 1);
                });
            }

            // Adventurer Tracking: Log kills to guild board for all party members
            state.players.forEach(p => {
                const userGuild = guilds.getUserGuild(p.jid);
                if (userGuild) {
                    guilds.updateBoardProgress(userGuild, entity.type, 1);
                }
            });
        }
    
        if (!entity.isEnemy) {        // Player death
        if (state.mode === 'PERMADEATH' || state.mode === 'HARDCORE') {
            // Callback to index.js to record in graveyard
            if (state.onHardcoreDeath) {
                state.onHardcoreDeath(entity.jid, entity.level, entity.class?.name || 'Unknown', lastKiller);
            }
            // Remove from game permanently
            state.players = state.players.filter(p => p.jid !== entity.jid);
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
                'TURN',
                {
                    turnInfo: lastTurnInfo,
                    backgroundPath: state.backgroundPath,
                    rank: state.dungeonRank
                }
            );
            if (scene.success) {
                try {
                    if (scene.buffer) {
                        await sock.sendMessage(state.chatId, { image: scene.buffer, caption: scene.caption });
                    } else if (scene.imagePath && fs.existsSync(scene.imagePath)) {
                        await sock.sendMessage(state.chatId, { image: fs.readFileSync(scene.imagePath), caption: scene.caption });
                        setTimeout(() => { if (fs.existsSync(scene.imagePath)) fs.unlinkSync(scene.imagePath); }, 5000);
                    } else {
                        await sock.sendMessage(state.chatId, { text: scene.caption });
                    }
                } catch (msgErr) {
                    console.error("Failed to send turn image message in nextTurn:", msgErr.message);
                    try { await sock.sendMessage(state.chatId, { text: scene.caption }); } catch {}
                }
            }
        } catch (err) {
            console.error("Critical error in nextTurn image generation:", err.message);
        }
    }
    // Note: checkCombatEnd is called explicitly by performAction and processCombatTurn - not needed here.
}


async function endCombat(sock, victory, sessionKey) {
    const state = gameStates.get(sessionKey);
    if (!state || state.isEndingCombat) return;
    state.isEndingCombat = true; // Guard to prevent double processing

    const chatId = state.chatId;
    console.log(`[Quest] Combat ended. Victory: ${victory}, Encounter: ${state.encounter}/${state.maxEncounters}`);
    state.inCombat = false;
    
    // Calculate rewards
    const totalXP = state.enemies.reduce((sum, e) => {
        const xpVal = Number(e.xp || e.xpReward || 0);
        return sum + (isNaN(xpVal) ? 0 : xpVal);
    }, 0);
    
    const totalGold = state.enemies.reduce((sum, e) => {
        let goldVal = 0;
        if (e.gold) goldVal = Number(e.gold);
        else if (e.goldReward) {
            if (Array.isArray(e.goldReward)) {
                const [min, max] = e.goldReward;
                goldVal = Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min);
            } else {
                goldVal = Number(e.goldReward);
            }
        }
        return sum + (isNaN(goldVal) ? 0 : goldVal);
    }, 0) * 15; // Increased by 15x as requested

    // Distribute rewards
    const alivePlayers = state.players.filter(p => !p.isDead);
    const playerCount = Math.max(1, alivePlayers.length);
    const xpPerPlayer = Math.floor(totalXP / playerCount);
    const goldPerPlayer = Math.floor(totalGold / playerCount);
    
    const encounterType = state.currentEncounterType || 'COMBAT';
    const bossName = state.enemies[0]?.type || state.enemies[0]?.id || null; 
    
    let lootResults = { items: [], gold: totalGold, announcements: [] };
    try {
        lootResults = await lootSystem.distributeLoot(
            alivePlayers,
            encounterType,
            bossName,
            state.difficulty,
            totalGold
        );
    } catch (lootErr) {
        console.error("Loot distribution failed:", lootErr.message);
    }
    
    const rewards = {
        gold: totalGold,
        xp: totalXP,
        items: (lootResults.items || []).map(item => ({ name: item.name || item.id })) 
    };

    // Generate final combat image
    let scene = { success: false, caption: victory ? "✅ Victory!" : "💀 Defeat..." };
    try {
        scene = await combatIntegration.generateCombatScene(
            state.players,
            state.enemies,
            'END',
            {
                victory: victory,
                rewards: rewards,
                rank: state.dungeonRank,
                backgroundPath: state.backgroundPath
            }
        );
    } catch (sceneErr) {
        console.error("End combat scene generation failed:", sceneErr.message);
    }

    if (scene.success) {
        try {
            if (scene.buffer) {
                await sock.sendMessage(state.chatId, {
                    image: scene.buffer,
                    caption: scene.caption
                });
            } else if (scene.imagePath && fs.existsSync(scene.imagePath)) {
                await sock.sendMessage(state.chatId, {
                    image: fs.readFileSync(scene.imagePath),
                    caption: scene.caption
                });
                // Clean up
                setTimeout(() => {
                    if (fs.existsSync(scene.imagePath)) fs.unlinkSync(scene.imagePath);
                }, 10000);
            } else {
                await sock.sendMessage(state.chatId, { text: scene.caption || (victory ? "✅ Victory!" : "💀 Defeat...") });
            }
        } catch (mediaError) {
            console.error("Media upload failed in endCombat:", mediaError.message);
            try {
                await sock.sendMessage(state.chatId, { text: scene.caption || (victory ? "✅ Victory!" : "💀 Defeat...") });
            } catch (textError) {
                console.error("Failed to send fallback text in endCombat:", textError.message);
            }
        }
    } else {
        try {
            await sock.sendMessage(state.chatId, { text: scene.caption || (victory ? "✅ Victory!" : "💀 Defeat...") });
        } catch (err) {
            console.error("Failed to send text (else block) in endCombat:", err.message);
        }
    }

    if (victory) {
        // Clear flags for next stage
        state.isProcessing = false;
        
        for (const player of alivePlayers) {
            player.xpEarned += xpPerPlayer;
            player.goldEarned += goldPerPlayer;
            // Gold and Items are now handled inside lootSystem.distributeLoot
            
            const levelUpResult = progression.addXP(player.jid, xpPerPlayer, 'Quest');
            
            // Fractional quest progress
            let progress = 0.05; 
            if (state.enemies.some(e => e.isBoss)) progress = 1.0; 
            else if (state.enemies.some(e => e.name.includes('Elite'))) progress = 0.2; 
            
            economy.addQuestProgress(player.jid, progress, true);
        }
        
        // 🟢 CLEAR all enemies and their states
        state.enemies.forEach(e => {
            e.justDied = false;
        });

        // 💡 GUILD BOARD TRACKING
        const guilds_mod = require('./guilds');
        const firstPlayerGuild = guilds_mod.getUserGuild(alivePlayers[0]?.jid);
        if (firstPlayerGuild) {
            state.enemies.forEach(enemy => {
                guilds_mod.updateBoardProgress(firstPlayerGuild, enemy.type || enemy.id, 1);
            });
        }
        
        setTimeout(() => {
            state.isEndingCombat = false; // Reset guard BEFORE calling nextStage
            nextStage(sock, state.groq, sessionKey).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
        }, state.solo ? 1000 : GAME_CONFIG.BREAK_TIME); // Added 1s delay for solo
    } else {
        state.isEndingCombat = false;
        state.active = false;
        state.phase = 'IDLE';
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
    
    const ranks = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    let userRankIndex = 0;
    
    if (senderJid) {
        const user = economy.getUser(senderJid);
        const userRank = user?.adventurerRank || 'F';
        userRankIndex = ranks.indexOf(userRank);
    }

    const bossNames = {
        'INFECTED_COLOSSUS': 'Infected Colossus',
        'CORRUPTED_GUARDIAN': 'Corrupted Guardian',
        'ELEMENTAL_ARCHON': 'Elemental Archon',
        'MUTATION_PRIME': 'Mutation Prime',
        'VOID_CORRUPTED': 'Void-Corrupted',
        'PRIMORDIAL_CHAOS': 'Primordial Chaos'
    };
    
    for (const [key, data] of Object.entries(DUNGEON_RANKS)) {
        if (data.isSpecial) continue;
        const dungeonIndex = ranks.indexOf(key);
        const isLocked = isSolo && dungeonIndex > userRankIndex + 3;
        
        if (isLocked) {
            msg += `🔒 *${key}-Rank* (Locked)\n`;
            continue;
        }
        
        const bName = data.boss ? (bossNames[data.boss] || 'Boss') : 'None';
        msg += `*${key}-Rank* | Diff:${data.difficulty}x | ${data.encounters}stg\n`;
        msg += `  👹 ${bName} | Mobs:${data.minMobs}-${data.maxMobs}\n\n`;
    }
    
    msg += `━━━━━━━━━━━━\n`;
    msg += `👉 \`.j ${isSolo ? 'solo' : 'quest'} <Rank>\`\n`;
    msg += `Ex: \`.j ${isSolo ? 'solo' : 'quest'} D\``;
    
    return msg;
};

const initAdventure = async (sock, chatId, groq, mode = 'NORMAL', solo = false, rankInput = null, senderJid = null, smartGroqCall = null, trialData = null) => {
    // Check limits
    const limitCheck = checkChatLimits(chatId, solo, senderJid);
    if (!limitCheck.allowed) return { success: false, msg: limitCheck.msg };

    const sessionKey = solo ? `${chatId}_${senderJid}` : chatId;
    if (gameStates.has(sessionKey)) {
        return { success: false, msg: solo ? "❌ You already have an active Solo raid!" : "❌ A Group raid is already active in this chat!" };
    }

    if (!rankInput && mode !== 'TRIAL') {
        return { success: true, isMenu: true, msg: getDungeonMenu(solo, senderJid) };
    }

    let upperRank = rankInput ? rankInput.toUpperCase() : 'F';
    let rankData = DUNGEON_RANKS[upperRank];

    if (mode === 'TRIAL' && trialData) {
        // Special rank for trials
        upperRank = 'TRIAL';
        rankData = { name: 'Class Trial', difficulty: 1.5, encounters: 1 };
    } else if (!rankData) {
        return { success: false, msg: `❌ Invalid Dungeon Rank: ${rankInput}.\n\n` + getDungeonMenu(solo) };
    }

    // Special Dungeon Key & Lineage Check
    if (rankData.isSpecial && senderJid) {
        if (upperRank === 'DRAGON') {
            // Check Lineage
            const currentClass = economy.getUserClass(senderJid);
            if (!classSystem.isFighterLineage(currentClass?.id)) {
                return { success: false, msg: `❌ *DRACONIC BARRIER*\n\nOnly those of the *Fighter* lineage possess the physical fortitude to survive the Dragon’s Lair. Come back when you have followed the path of the warrior!` };
            }

            // Check Key
            if (!inventorySystem.hasItem(senderJid, 'dragon_key')) {
                return { success: false, msg: `❌ You need a *Dragon Hunter Key* 🔑🐲 to enter this special dungeon!\n\n💡 Buy one from the shop or find it as a rare drop.` };
            }

            // Consume Key
            inventorySystem.removeItem(senderJid, 'dragon_key', 1);
        }
    }

    // Rank Restriction Logic (Skip for Special Dungeons or apply specific ones)
    if (solo && senderJid && !rankData.isSpecial) {
        const user = economy.getUser(senderJid);
        const adventurerRank = user?.adventurerRank || 'F';
        const ranks = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
        
        const userRankIndex = ranks.indexOf(adventurerRank);
        const dungeonRankIndex = ranks.indexOf(upperRank);
        
        // Only play 3 ranks above current one
        const maxSoloRankIndex = userRankIndex + 3;
        
        if (dungeonRankIndex > maxSoloRankIndex) {
            const maxRank = ranks[Math.min(maxSoloRankIndex, ranks.length - 1)];
            return { 
                success: false, 
                msg: `⚠️ Your Adventurer Rank is *${adventurerRank}*. You can only solo up to *${maxRank}-Rank* dungeons.\n\n💡 Rank up or join a group to enter higher dungeons!` 
            };
        }
    }
    
        // Set game state
        
        // Select Environment (Specific for special, Random for others)
        let environment;
        if (rankData.isSpecial && rankData.pool && DUNGEON_ENVIRONMENTS[rankData.pool]) {
            environment = DUNGEON_ENVIRONMENTS[rankData.pool];
        } else {
            const envKeys = Object.keys(DUNGEON_ENVIRONMENTS).filter(k => !DUNGEON_ENVIRONMENTS[k].isSpecial);
            const randomEnvKey = envKeys[Math.floor(Math.random() * envKeys.length)];
            environment = DUNGEON_ENVIRONMENTS[randomEnvKey];
        }
    
        const state = JSON.parse(JSON.stringify(INITIAL_STATE_TEMPLATE));
        Object.assign(state, {
            active: true,
            phase: 'REGISTRATION',
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
            trialData // ⚔️ Special trial payload
        });    
    gameStates.set(sessionKey, state);
    
    // Auto-join for solo
    if (solo && senderJid) {
        const user = economy.getUser(senderJid);
        const name = user?.nickname || user?.profile?.nickname || senderJid.split('@')[0];
        state.players.push({
            jid: senderJid,
            name: name,
            class: null,
            level: progression.getLevel(senderJid) || 1,
            stats: { hp: 100, maxHp: 100, energy: 100, maxEnergy: 100, atk: 10, def: 10, mag: 10, spd: 10, luck: 10, crit: 5 },
            equipment: { weapon: null, armor: null, ring: null, amulet: null, boots: null, cloak: null },
            inventory: [], statusEffects: [], buffs: [], isDead: false, xpEarned: 0, goldEarned: 0,
            combatStats: { damageDealt: 0, damageTaken: 0, healed: 0, kills: 0 }
        });
    }

    const regTime = solo ? 0 : GAME_CONFIG.REGISTRATION_TIME;
    state.timers.reg = setTimeout(() => {
        startJourney(sock, sessionKey).catch(e => console.error("[Quest] startJourney timer error:", e?.message || e));
    }, regTime);

    const modeEmoji = mode === 'PERMADEATH' ? '💀' : '🗺️';
    let msg = `
╔═══════════════╗
   *${upperRank}-RANK* 🏰
╚═══════════════╝

📜 *Mode:* ${mode === 'PERMADEATH' ? 'PERMADEATH' : 'NORMAL'}
🏰 *Rank:* ${rankData.name}
⚔️ *Length:* ${rankData.encounters} Encounters
⏱️ *Starts in:* ${solo ? '0s' : '2m'}

${solo ? `👤 *Solo Quest:* Starting now...` : `👉 Type \`${botConfig.getPrefix()} join\` to enter!`}
`;
    return { success: true, msg };
};

const joinAdventure = (chatId, senderJid, senderName) => {
    const state = getGameState(chatId);
    if (!state || !state.active || state.phase !== 'REGISTRATION') {
        return "❌ Registration is closed!";
    }
    
    if (state.solo && state.players.length >= 1) {
        return "❌ This is a solo quest! You cannot join.";
    }
    
    if (state.players.length >= GAME_CONFIG.MAX_PLAYERS) {
        return "❌ Party is full!";
    }
    
    if (state.players.some(p => p.jid === senderJid)) {
        return "⚠️ You're already in the party!";
    }
    
    const user = economy.getUser(senderJid);
    const adventurerRank = user?.adventurerRank || 'F';

    // Initialize player with default stats (class assigned later)
    state.players.push({
        jid: senderJid,
        name: senderName || 'Unknown Hero',
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
            crit: 5
        },
        equipment: {
            weapon: null,
            armor: null,
            ring: null,
            amulet: null,
            boots: null,
            cloak: null
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
            kills: 0
        }
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
            text: `❌ Quest cancelled. Need at least ${minPlayers} hero${minPlayers > 1 ? 'es' : ''}!`
        });
        deleteGameState(sessionKey);
        return;
    }
    state.phase = 'SHOPPING';
    
    state.players.forEach(p => {
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
            p.adventurerRank = user.adventurerRank || 'F';
        } else {
            p.spriteIndex = Math.floor(Math.random() * 100);
            p.adventurerRank = 'F';
        }
        
        // Use user stats including progression, bonuses AND equipment
        const classId = userClass?.id || p.class.id || p.class.name.toUpperCase();
        const baseStats = progression.getBaseStats(p.jid, classId);
        const equipStats = inventorySystem.getEquipmentStats(p.jid);
        const level = progression.getLevel(p.jid);
        
                  p.stats.hp = baseStats.hp; // getBaseStats already includes equipStats
                  p.stats.maxHp = p.stats.hp;
                  p.stats.maxEnergy = baseStats.maxEnergy; 
                  p.stats.energy = p.stats.maxEnergy;        p.stats.atk = baseStats.atk;
        p.stats.def = baseStats.def;
        p.stats.mag = baseStats.mag;
        p.stats.spd = baseStats.spd;
        p.stats.luck = baseStats.luck;
        p.stats.crit = baseStats.crit;
        
        // NEW: Combat system requirements
        p.currentHP = p.stats.hp;
        p.mana = 100;
        p.maxMana = 100;
        
        p.level = progression.getLevel(p.jid);
    });
    
    // Shopping phase - Instant for solo
    const shopDelay = state.solo ? 0 : 1000;
    setTimeout(() => {
        openShop(sock, sessionKey).catch(e => console.error("[Quest] openShop timer error:", e?.message || e));
    }, shopDelay);

    // 💡 HIVE MIND WHISPERS (5% chance)
    if (Math.random() < 0.05) {
        const whispers = [
            "...join us...",
            "...it is so cold in the dark...",
            "...we see you, little spark...",
            "...why do you resist the inevitable?...",
            "...the hive only wants to protect you..."
        ];
        const whisper = whispers[Math.floor(Math.random() * whispers.length)];
        setTimeout(() => {
            sock.sendMessage(chatId, { text: `_「 ${whisper} 」_` })
                .catch(e => console.error("[Quest] whisper send error:", e?.message || e));
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
                state.phase = 'IDLE';
                if (state.timers) {
                    Object.values(state.timers).forEach(timer => { if (timer) clearTimeout(timer); });
                }
                gameStates.delete(key);
                stoppedAny = true;
            }
        }
        
        if (stoppedAny) return "🛡️ *Admin Override:* All active quests in this chat have been cancelled.";
    }

    // 2. Standard user check (their own solo or the group quest)
    const state = getGameState(chatId, senderJid);
    if (!state || !state.active) return "❌ No active adventure found for you in this chat!";
    
    const wasSolo = state.solo;
    state.active = false;
    state.phase = 'IDLE';
    
    // Clear all active timers
    if (state.timers) {
        Object.values(state.timers).forEach(timer => {
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
    msg += `💬 \`.j buy <#>\` to purchase`;
    
    try {
        await sock.sendMessage(state.chatId, { text: msg });
    } catch (err) {
        console.error("Failed to send shop menu in openShop:", err.message);
    }
    
    const shopTime = GAME_CONFIG.SHOP_TIME;
    state.timers.shop = setTimeout(() => {
        state.phase = 'PLAYING';
        nextStage(sock, state.groq, sessionKey).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
    }, shopTime);
}

async function nextStage(sock, groq, sessionKey) {
    const state = gameStates.get(sessionKey);
    if (!state) return;
    
    const chatId = state.chatId;
    console.log(`[Quest] nextStage triggered for ${sessionKey}. isProcessing: ${state.isProcessing}, Encounter: ${state.encounter}/${state.maxEncounters}`);
    
    if (state.isProcessing) {
        console.warn(`[Quest] nextStage blocked: already processing for ${chatId}`);
        // Safety: if stuck for more than 30s, force clear
        if (state.lastProcessTime && Date.now() - state.lastProcessTime > 30000) {
            console.error(`[Quest] EMERGENCY: Clearing stuck isProcessing for ${chatId}`);
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
        
        // Check if dungeon is complete
        if (state.encounter > state.maxEncounters) {
            state.isProcessing = false;
            return endAdventure(sock, sessionKey);
        }

        // 💡 BRANCHING PATHS SYSTEM
        // Every 3 stages (except boss), let the party vote
        if (state.encounter > 1 && state.encounter % 3 === 0 && state.encounter < state.maxEncounters) {
            let msg = `┏━━━━━━━━━━━━┓\n`;
            msg += `┃ 📂 CROSSROAD ┃\n`;
            msg += `┗━━━━━━━━━━━━┛\n\n`;
            msg += `🔴 *Door 1: Riches*\n   Elite Combat — 2x Loot\n\n`;
            msg += `🔵 *Door 2: Safety*\n   Rest — Heal 30% HP/EN\n\n`;
            msg += `Vote: \`.j vote 1\` or \`.j vote 2\`\n`;
            msg += `⏱️ 30 seconds!`;

            state.votes = {};
            state.currentEncounter = null; // Clear stale encounter
            state.isBranching = true; // Set flag
            try {
                await sock.sendMessage(state.chatId, { text: msg });
            } catch (err) {
                console.error("Failed to send split path message in nextStage:", err.message);
            }

            const voteTime = state.solo ? 10000 : 30000;
            state.timers.vote = setTimeout(() => {
                const v1 = Object.values(state.votes).filter(v => v === '1').length;
                const v2 = Object.values(state.votes).filter(v => v === '2').length;
                
                const winner = v2 > v1 ? 'REST' : 'ELITE_COMBAT';
                state.isProcessing = false;
                state.isBranching = false; // Clear flag
                processBranchChoice(sock, winner, chatId).catch(e => console.error("[Quest] processBranchChoice error:", e?.message || e));
            }, voteTime);
            return;
        }
        
        // ... (rest of standard encounter logic)
        const rankData = DUNGEON_RANKS[state.dungeonRank];
        const isLowRank = ['F', 'E', 'D'].includes(state.dungeonRank);
        const isBossEncounter = state.encounter === state.maxEncounters && rankData.boss;
        
        let encounterType;
        if (isBossEncounter) {
            encounterType = 'BOSS';
        } else if (isLowRank) {
            encounterType = 'COMBAT'; 
        } else {
            const roll = Math.random();
            if (roll < 0.5) encounterType = 'COMBAT';
            else if (roll < 0.7) encounterType = 'ELITE_COMBAT';
            else if (roll < 0.85) encounterType = 'REST';
            else encounterType = 'NON_COMBAT';
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
    const rankData = DUNGEON_RANKS[state.dungeonRank];
        let encounter;
    
        if (state.mode === 'TRIAL') {
            encounter = classEncounters.generateEncounter(
                state.players,
                'BOSS',
                state.difficulty,
                { forceBossId: state.trialTarget }
            );
        } else if (encounterType === 'REST') {        encounter = {
            type: 'REST',
            name: 'Quiet Campfire',
            description: 'The party finds a safe spot to rest and recover. The crackling fire brings comfort.'
        };
    } else if (encounterType === 'NON_COMBAT') {
        encounter = selectRandomEncounter(sessionKey);
    } else {
        encounter = classEncounters.generateEncounter(
            state.players,
            encounterType,
            state.difficulty || 1.0,
            {
                minMobs: rankData.minMobs,
                maxMobs: rankData.maxMobs
            }
        );
    }
    
    if (!encounter) {
        console.error(`❌ Failed to generate encounter of type: ${encounterType}`);
        // Try to recover by skipping or ending
        setTimeout(() => {
            nextStage(sock, groq, sessionKey).catch(e => console.error("[Quest] nextStage recovery error:", e?.message || e));
        }, 1000);
        return;
    }

    state.currentEncounter = encounter;
    state.currentEncounterType = encounter.type;

    if (encounter.type === 'COMBAT' || encounter.type === 'BOSS' || encounter.type === 'ELITE_COMBAT') {
        // Elite combat from branch choice gives 2x
        if (encounter.type === 'ELITE_COMBAT' && state.encounter % 3 === 0) {
            state.difficulty *= 2.0; 
        }
        await startCombat(sock, groq, encounter, sessionKey);
    } else if (encounter.type === 'REST') {
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
        player.stats.energy = Math.min(player.stats.maxEnergy, player.stats.energy + energyGain);
        
        msg += `💖 ${player.name}: +${hpGain} HP, +${energyGain} Energy\n`;
    }
    
    msg += `\n⏰ Continuing journey in ${GAME_CONFIG.BREAK_TIME/1000}s...`;
    
    try {
        await sock.sendMessage(state.chatId, { text: msg });
    } catch (err) {
        console.error("Failed to send rest encounter message:", err.message);
    }
    
    setTimeout(() => {
        nextStage(sock, state.groq, sessionKey).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
    }, state.solo ? 0 : GAME_CONFIG.BREAK_TIME);
}

async function generateBossEncounter(sock, groq, chatId) {
    const state = getGameState(chatId);
    if (!state) return null;
    const rankData = DUNGEON_RANKS[state.dungeonRank];
    const bossType = rankData.boss || 'goblin_king';
    
    const tier = getCurrentTier(chatId);
    const boss = createBoss(bossType, tier); 
    
    return {
        type: 'BOSS',
        enemies: [boss],
        description: `The dungeon boss, ${boss.name}, emerges from the shadows!`
    };
}

function selectRandomEncounter(chatId) {
    const state = getGameState(chatId);
    if (!state) return null;
    const types = ['TRAP', 'PUZZLE', 'MERCHANT', 'TREASURE', 'EVENT'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    switch(type) {
        case 'TRAP': return generateTrapEncounter(chatId);
        case 'PUZZLE': return generatePuzzleEncounter(chatId);
        case 'MERCHANT': return generateMerchantEncounter(chatId);
        case 'TREASURE': return generateTreasureEncounter(chatId);
        case 'EVENT': return generateEventEncounter(chatId);
        default: return generateTrapEncounter(chatId);
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

    msg += `💬 Type \`.j buy <#>\` to purchase an item.\n`;
    msg += `⏰ The merchant will leave in ${GAME_CONFIG.VOTE_TIME / 1000}s...`;

    try {
        await sock.sendMessage(state.chatId, { text: msg });
    } catch (err) {
        console.error("Failed to send merchant encounter message:", err.message);
    }

    state.currentEncounter = encounter;
    state.phase = 'PLAYING'; // Ensure they can buy
    state.isMerchantActive = true;

    const merchantTime = state.solo ? 30000 : (GAME_CONFIG.VOTE_TIME || 30000);
    state.timers.merchant = setTimeout(() => {
        if (state.active) {
            state.isMerchantActive = false;
            nextStage(sock, state.groq, sessionKey).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
        }
    }, merchantTime);
}
async function handleNonCombatEncounter(sock, encounter, sessionKey) {
    const state = gameStates.get(sessionKey);
    if (!state) return;

    if (encounter.type === 'MERCHANT') {
        return handleMerchantEncounter(sock, encounter, sessionKey);
    }

    let msg = `${encounter.icon} *${encounter.name}*\n\n`;
    msg += `${encounter.description}\n\n`;

    msg += `The party must decide what to do:\n\n`;

    encounter.choices.forEach((choice, i) => {
        msg += `${i + 1}. ${choice.text} (${choice.stat} Check)\n`;
    });

    msg += `\n💬 Type: \`.j vote <#>\` to choose!`;

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
            processVotes(sock, encounter, sessionKey).catch(e => console.error("[Quest] processVotes error:", e?.message || e));
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
          console.warn(`⚠️️ [Quest][${sessionKey}] Recovering from null encounter or missing choices. (Phase: ${state.phase}, Type: ${state.currentEncounterType})`);
          state.votes = {};
          state.voteProcessing = false;
          // Force next stage after a brief delay
          setTimeout(() => {
              nextStage(sock, state.groq, sessionKey).catch(e => console.error("[Quest] nextStage recovery error:", e?.message || e));
          }, 1000);
          return;
      }

      const voteCounts = {};
      for (const vote of Object.values(state.votes)) {
          voteCounts[vote] = (voteCounts[vote] || 0) + 1;
      }    
    let winningChoiceIdx = '1';
    let maxVotes = 0;
    for (const [choice, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
            maxVotes = count;
            winningChoiceIdx = choice;
        }
    }
    
    // Note: The second check below is now mostly redundant but kept for extra safety
    if (!encounter || !encounter.choices) {
        console.error("❌ processVotes: encounter or encounter.choices is missing!");
        setTimeout(() => {
            nextStage(sock, state.groq, sessionKey).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
        }, state.solo ? 0 : GAME_CONFIG.BREAK_TIME);
        return;
    }

    const choice = encounter.choices[parseInt(winningChoiceIdx) - 1];
    if (!choice) {
        try {
            await sock.sendMessage(state.chatId, { text: "❌ Invalid choice! Moving on..." });
        } catch (err) {
            console.error("Failed to send invalid choice message in processVotes:", err.message);
        }
        setTimeout(() => {
            nextStage(sock, state.groq, sessionKey).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
        }, state.solo ? 0 : GAME_CONFIG.BREAK_TIME);
        return;
    }
    
    let msg = `📊 *Vote Result:* ${choice.text}\n\n`;
    let finalOutcome = choice.outcome || (choice.success && !choice.stat ? choice.success : null);

    // D20 STAT CHECK
    if (choice.stat) {
        const roll = Math.floor(Math.random() * 20) + 1;
        // Get highest party stat for the check
        const partyBestStat = Math.max(...state.players.map(p => p.stats[choice.stat.toLowerCase()] || 0));
        const total = roll + partyBestStat;
        const success = total >= choice.difficulty;

        msg += `🎲 *ROLL:* ${roll} + ${partyBestStat} = *${total}* (Req: ${choice.difficulty})\n`;
        msg += success ? `✅ *SUCCESS!*\n` : `❌ *FAILURE!*\n`;
        
        finalOutcome = success ? choice.success : choice.failure;
    }
    
    if (finalOutcome) {
        msg += finalOutcome.description || "";
        
        // Apply rewards/penalties to all players
        for (const player of state.players) {
            if (finalOutcome.gold) {
                economy.addMoney(player.jid, finalOutcome.gold);
            }
            if (finalOutcome.damage) {
                player.stats.hp = Math.max(0, player.stats.hp - finalOutcome.damage);
            }
            if (finalOutcome.heal) {
                player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + finalOutcome.heal);
            }
        }
        
        if (finalOutcome.gold) msg += `\n💰 ${finalOutcome.gold > 0 ? '+' : ''}${finalOutcome.gold} gold!`;
        if (finalOutcome.damage) msg += `\n💔 ${finalOutcome.damage} damage to party!`;
        if (finalOutcome.heal) msg += `\n💚 ${finalOutcome.heal} HP restored!`;
    }
    
    try {
        await sock.sendMessage(state.chatId, { text: msg });
    } catch (err) {
        console.error("Failed to send vote result in processVotes:", err.message);
    }
    
    // Check for deaths
    const deadPlayers = state.players.filter(p => p.stats.hp <= 0 && !p.isDead);
    if (deadPlayers.length > 0) {
        let deathMsg = "💀 *CASUALTIES* 💀\n\n";
        deadPlayers.forEach(p => {
            p.isDead = true;
            deathMsg += `${p.name} has fallen!\n`;
        });
        try {
            await sock.sendMessage(state.chatId, { text: deathMsg });
        } catch (err) {
            console.error("Failed to send death message in processVotes:", err.message);
        }
        if (state.players.every(p => p.isDead)) return endAdventure(sock, sessionKey, false);
    }
    
    state.votes = {};
    state.voteProcessing = false;
    setTimeout(() => {
        nextStage(sock, state.groq, sessionKey).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
    }, state.solo ? 0 : GAME_CONFIG.BREAK_TIME);
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
                model: "llama-3.3-70b-versatile"
            });
            narration = completion.choices[0].message.content;
        } else if (state.groq) {
            const completion = await state.groq.chat.completions.create({
                messages: [{ role: "system", content: prompt }],
                model: "llama-3.3-70b-versatile"
            });
            narration = completion.choices[0].message.content;
        }
    } catch (e) {
        narration = "The heroes return from the depths of the void, their names etched in history forever.";
    }

    let msg = `\n🎉 *QUEST COMPLETE!* 🎉\n\n`;
    msg += `📜 ${narration}\n\n`;
    msg += `The party has conquered all challenges!\n\n`;
    msg += `📊 *FINAL STATS:*\n`;
    msg += `☠️ Monsters Slain: ${state.stats.monstersKilled}\n`;
    msg += `👑 Bosses Defeated: ${state.stats.bossesDefeated}\n`;
    msg += `💎 Treasures Found: ${state.stats.treasuresFound}\n`;

    // Aggregate party stats
    const totalDamage = state.players.reduce((sum, p) => sum + (p.combatStats.damageDealt || 0), 0);
    const totalHealed = state.players.reduce((sum, p) => sum + (p.combatStats.healed || 0), 0);
    
    msg += `💥 Total Damage Dealt: ${totalDamage.toLocaleString()}\n`;
    msg += `💖 Total Healing Done: ${totalHealed.toLocaleString()}\n\n`;

    // === SPECIAL MODE HANDLING: TRIAL ===
    if (state.mode === 'TRIAL' && victory) {
        const player = state.players[0]; // Trials are always solo
        const trialData = state.trialData;
        const user = economy.getUser(player.jid);
        const classSystem = require('./classSystem');
        const nextClass = classSystem.getClassById(trialData.targetClass);

        if (user && nextClass) {
            const oldClassName = classSystem.getClassById(user.class)?.name || 'Unknown';
            user.class = trialData.targetClass;
            
            // Deduct cost and stone here if not already handled
            const inventorySystem = require('./inventorySystem');
            inventorySystem.removeItem(player.jid, trialData.stoneId, 1);
            economy.removeMoney(player.jid, trialData.cost, `Evolved to ${nextClass.name}`);

            // Grant Bonus Points
            const bonusPoints = nextClass.tier === 'ASCENDED' ? 10 : 5;
            user.skillPoints = (user.skillPoints || 0) + bonusPoints;
            
            economy.saveUser(player.jid);

            let trialSuccessMsg = `┏━━━━━━━━━━━━┓\n`;
            trialSuccessMsg += `┃ ✨ EVOLVED! ✨ ┃\n`;
            trialSuccessMsg += `┗━━━━━━━━━━━━┛\n\n`;
            trialSuccessMsg += `You have proven your worth by defeating the **${trialData.trialBoss.replace('_', ' ')}**!\n\n`;
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
    const multiplier = state.mode === 'PERMADEATH' ? GAME_CONFIG.PERMADEATH_MULTIPLIER : 1;
    for (const player of state.players) {
        const finalXP = Math.floor(player.xpEarned * multiplier);
        const finalGold = Math.floor(player.goldEarned * multiplier);
        const bonusGold = player.isDead ? 0 : 2000;
        
        msg += `${player.class.icon} *${player.name}*\n  ⭐ XP: ${finalXP}\n  💰 Gold: ${finalGold + bonusGold}\n  ${player.isDead ? '💀 Fallen' : '✅ Survived'}\n\n`;
        
        // Update stats and rank
        if (!player.isDead) {
            economy.addMoney(player.jid, bonusGold);
            economy.addQuestProgress(player.jid, 0.2, true); // Final act victory
        } else {
            economy.addQuestProgress(player.jid, 0, false); // No progress on death
        }
        
        progression.awardXP(player.jid, finalXP);
        
        const rankUpdate = economy.updateAdventurerRank(player.jid);
        if (rankUpdate && rankUpdate.ranked_up) {
            msg += `🎊 *RANK UP!* 🎊\n  ${player.name} is now ${rankUpdate.rank_data.icon} *${rankUpdate.new_rank}*!\n\n`;
        }
    }
    
    if (state.mode === 'PERMADEATH') {
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
    
    const isShoppingPhase = state.phase === 'SHOPPING';
    const isMerchantActive = state.isMerchantActive && state.currentEncounter?.type === 'MERCHANT';
    
    if (!isShoppingPhase && !isMerchantActive) {
        return "❌ Shop is closed!";
    }
    
    const player = state.players.find(p => p.jid === senderJid);
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
    
    if (item.effect === 'bundle' && item.items) {
        for (const subKey of item.items) {
            const subInfo = lootSystem.getItemInfo(subKey);
            await inventorySystem.addItem(senderJid, subKey, 1, {
                name: subInfo.name,
                value: subInfo.value,
                rarity: subInfo.rarity || 'COMMON',
                source: 'QUEST_SHOP_BUNDLE'
            });
        }
        return `✅ Purchased bundle ${item.icon} *${item.name}*! Items added to bag.`;
    }
    
    // Get item info from loot database for persistence
    const itemInfo = lootSystem.getItemInfo(itemKey);
    
    await inventorySystem.addItem(senderJid, itemKey, 1, { 
        name: itemInfo.name,
        value: itemInfo.value,
        rarity: itemInfo.rarity || 'COMMON', 
        source: 'QUEST_SHOP' 
    });
    
    return `✅ Purchased ${item.icon} *${item.name}*!`;
};

// ==========================================
// 🎯 COMBAT COMMAND HANDLER
// ==========================================

const handleCombatAction = async (sock, chatId, senderJid, actionType, target) => {
    const state = getGameState(chatId, senderJid);
    if (!state || !state.inCombat) {
        return "❌ Not in combat!";
    }
    
    const player = state.players.find(p => p.jid === senderJid);
    if (!player || player.isDead) {
        return "❌ You can't act!";
    }
    
    const current = state.activeCombatant;
    if (!current || current.jid !== senderJid) {
        const turnName = current ? current.name : "Enemy";
        return `⏳ *IT'S NOT YOUR TURN!* \n\nWaiting for: *${turnName}*`;
    }
    
    if (state.pendingActions[senderJid]) {
        return "❌ Action already chosen!";
    }
    
    let action = { type: actionType };
    
    if (actionType === 'attack') {
        if (target !== undefined && target !== '') {
            const targetIndex = parseInt(target) - 1;
            if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < state.enemies.length) {
                action.targetIndex = targetIndex;
            }
        }
        // Default to first alive enemy if not specified or invalid
        if (action.targetIndex === undefined) {
            action.targetIndex = state.enemies.findIndex(e => e.stats.hp > 0);
        }
    }

    if (actionType === 'ability') {
        // Parse target string "1 2" -> index=1, target=2
        const parts = (target || '').toString().split(' ');
        const abilityIndex = parts[0];
        const abilityTarget = parts[1];
        
        if (!abilityIndex) {
            return "❌ Specify ability number!\n\nExample: `.j combat ability 1` or `.j combat ability 1 2`";
        }
        
        // Check ability validity first
        const result = await useAbility(sock, player, abilityIndex, abilityTarget, chatId);
        
        if (!result.success) {
            return result.message;
        }
        
        action.abilityIndex = abilityIndex;
        action.targetIndex = parseInt(abilityTarget) - 1;
        if (isNaN(action.targetIndex)) action.targetIndex = 0; // Default to first enemy
        action.result = result;
    }
    
    if (actionType === 'item') {
        const inventory = inventorySystem.formatInventory(player.jid);
        if (inventory.isEmpty) return "❌ Your bag is empty!";

        const usableItems = inventory.items.filter(item => {
            const info = lootSystem.getItemInfo(item.id);
            return info && info.usable;
        });

        const itemIndex = parseInt(target) - 1;
        if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= usableItems.length) {
            // Check if it's a non-usable item by number
            if (inventory.items[itemIndex]) {
                return `❌ *${inventory.items[itemIndex].name}* is not a consumable!`;
            }
            return "❌ Invalid item number! Use the number from the 'USABLE ITEMS' list.";
        }

        const selectedItem = usableItems[itemIndex];
        action.itemId = selectedItem.id;
        // Optional second target for items
        const parts = (target || '').toString().split(' ');
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
            message: `${player.name} has no abilities learned!`
        };
    }
    
    // Get all learned abilities from ALL class trees (to support basic techniques from previous classes)
    const learnedAbilities = [];
    
    for (const [classId, classData] of Object.entries(skillTree.SKILL_TREES)) {
        for (const [treeName, treeData] of Object.entries(classData.trees)) {
            for (const [skillId, skill] of Object.entries(treeData.skills)) {
                const level = user.skills[skillId] || 0;
                
                // Only add if learned and not already in the list
                if (level > 0 && !learnedAbilities.some(a => a.id === skillId)) {
                    const getVal = (val, lvl) => Array.isArray(val) ? val[Math.min(lvl - 1, val.length - 1)] : val;
                    const energyCost = skill.cost || getVal(skill.energyCost, level) || 0;
                    
                    if (energyCost > 0) { // Only active abilities for combat
                        learnedAbilities.push({
                            ...skill,
                            id: skillId,
                            level,
                            cost: energyCost,
                            skillLevel: level
                        });
                    }
                }
            }
        }
    }
    
    if (learnedAbilities.length === 0) {
        return {
            success: false,
            message: `${player.name} has no combat abilities!`
        };
    }
    
    // Get all mirrored abilities
    if (user.borrowedSkills && user.borrowedSkills.length > 0) {
        user.borrowedSkills.forEach(s => {
            learnedAbilities.push({
                ...s,
                skillLevel: 1,
                cost: Math.floor(s.cost * 1.5), // 50% more energy for mirrored
                isMirrored: true
            });
        });
    }
    
    // Get the ability
    const index = parseInt(abilityIndex) - 1;
    const ability = learnedAbilities[index];
    
    if (!ability) {
        return {
            success: false,
            message: `Invalid ability! Use \`${botConfig.getPrefix()} abilities\` to see your abilities.`
        };
    }
    
    // Check energy cost
    if (player.stats.energy < ability.cost) {
        return {
            success: false,
            message: `Not enough energy! Need ${ability.cost}, have ${player.stats.energy}`
        };
    }
    
    // Get effect
    const effect = skillTree.getSkillEffect(ability, ability.skillLevel);
    
    // Consume energy
    player.stats.energy -= ability.cost;
    
    // Apply ability effect
    const result = await applyAbilityEffect(sock, player, ability, effect, targetIndex, chatId);
    
    return {
        success: true,
        abilityName: ability.name,
        ...result
    };
}

// ==========================================
// 💫 APPLY ABILITY EFFECTS
// ==========================================

async function applyAbilityEffect(sock, player, ability, effect, targetIndex, chatId) {
    // Use player.jid to find solo state correctly
    const state = player?.jid ? getGameState(chatId, player.jid) : getGameState(chatId);
    if (!state) return;
    // Derive sessionKey from state for use in checkCombatEnd
    const sessionKey = state.sessionKey || (state.solo ? `${state.chatId}_${state.players[0]?.jid}` : state.chatId);
    const icon = player.class?.icon || '👤';
    let msg = `${icon} ${player.name} uses ${ability.animation} *${ability.name}*!\n\n`;
    let totalDamage = 0;
    let totalHealing = 0;
    
    // DAMAGE ABILITIES
          if (effect.type === 'damage' || effect.type.includes('damage')) {
              const targets = getTargets(player, effect, targetIndex, chatId);        
        for (const target of targets) {
            if (target.stats.hp <= 0) continue;
            
            // 💡 DRAGON SEAL RING REQUIREMENT
            if (target.id && (target.id.startsWith('DRAKE') || target.id.includes('DRAGON') || target.id.includes('Ancient Dragon'))) {
                if (!player.isEnemy && player.jid) {
                    if (!inventorySystem.hasItem(player.jid, 'dragon_seal_ring')) {
                        msg += `🛡️ Your attacks slide off ${target.name}'s scales! You need the *Dragon Seal Ring* 💍🐲 to pierce their hide!\n`;
                        continue;
                    }
                }
            }

            let baseDamage;
            const lvl = player.level || 1;
            
            if (effect.damageType === 'magic') {
                baseDamage = player.stats.mag || player.stats.atk || (lvl * 10);
            } else {
                baseDamage = player.stats.atk || (lvl * 8);
            }
            
            // Apply multiplier (fallback to 1.0)
            const mult = Number(effect.multiplier) || 1.0;
            let damage = Math.floor(baseDamage * mult);
            
            // Ignore defense
            if (effect.ignoreDefense) {
                const defReduction = Math.floor(target.stats.def * (effect.ignoreDefense / 100));
                damage += defReduction;
            }
            
            // Crit chance
            let isCrit = false;
            let critChance = player.stats.crit || 5;
            if (effect.critBonus) critChance += effect.critBonus;
            if (effect.guaranteedCrit) critChance = 100;
            
            if (Math.random() * 100 < critChance) {
                isCrit = true;
                damage = Math.floor(damage * 2.0);
            }
            
            // Execute mechanics
            if (effect.type === 'execute') {
                const hpPercent = (target.stats.hp / target.stats.maxHp) * 100;
                if (hpPercent <= effect.threshold) {
                    damage = Math.floor(damage * 2.5); // Massive damage on low HP
                    msg += `⚡ *EXECUTE THRESHOLD!* ⚡\n`;
                }
            }
            
                          // Apply damage
                          target.stats.hp -= damage;
                          target.currentHP = target.stats.hp; // Sync V2
                          totalDamage += damage;
            
                          if (target.stats.hp > 0 && target.isBoss) {
                              await checkBossPhase(sock, target, chatId);
                          }
            
                          if (target.stats.hp <= 0) {
                              target.justDied = true;
                          }            
            const targetIcon = target.isEnemy ? target.icon : (target.class?.icon || '👤');
            msg += `💥 ${targetIcon} ${target.name} takes ${damage} damage!`;
            if (isCrit) msg += ` 💥 *CRITICAL HIT!*`;
            msg += `\n`;
            
            // Death check
            if (target.stats.hp <= 0) {
                // 💡 OVERKILL EXECUTION BONUS
                const overkillThreshold = target.stats.hp + damage; // HP before this hit
                if (damage > overkillThreshold * 2.0) {
                    const bonusGold = Math.floor(target.goldReward * 0.1) || 50;
                    player.goldEarned = (player.goldEarned || 0) + bonusGold;
                    msg += `⚡ *OVERKILL!* +${bonusGold} Zeni execution bonus!\n`;
                }

                msg += `💀 ${target.name} has been defeated!\n`;
                target.isDead = true;
                target.currentHP = 0; // Sync
                player.combatStats.kills = (player.combatStats.kills || 0) + 1;

                // 💡 CRITICAL FIX: Check if combat should end immediately
                if (await checkCombatEnd(sock, state, sessionKey)) return { applied: true, msg };
            }
            
                          // Apply DoT (Damage over Time)
                          if (effect.dot) {
                              const sRes = applyStatusEffect(target, effect.dot, effect.dotDuration, effect.dotDamage, player.name);
                              msg += `🔥 Applied ${effect.dot}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ''}\n`;
                          }
            
                          // Apply CC (Crowd Control)
                          if (effect.cc && Math.random() * 100 < (effect.ccChance || 100)) {
                              const sRes = applyStatusEffect(target, effect.cc, effect.ccDuration, 0, player.name);
                              msg += `💫 Applied ${effect.cc}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ''}\n`;
                          }        }
        
        player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + totalDamage;
    }
    
    // AOE ABILITIES
    if (effect.type === 'aoe') {
        const opponentSide = player.isEnemy ? state.players.filter(p => !p.isDead) : state.enemies.filter(e => e.stats.hp > 0);
        const numTargets = Math.min(effect.targets || 99, opponentSide.length);
        
        for (let i = 0; i < numTargets; i++) {
            const target = opponentSide[i];
            if (!target) continue;
            
            // 💡 DRAGON SEAL RING REQUIREMENT
            if (target.id && (target.id.startsWith('DRAKE') || target.id.includes('DRAGON') || target.id.includes('Ancient Dragon'))) {
                if (!player.isEnemy && player.jid) {
                    if (!inventorySystem.hasItem(player.jid, 'dragon_seal_ring')) {
                        msg += `🛡️ AOE slides off ${target.name}'s scales!\n`;
                        continue;
                    }
                }
            }

            let baseDamage = effect.damageType === 'magic' ? player.stats.mag : player.stats.atk;
            let damage = Math.floor(baseDamage * effect.multiplier);
            
            // Ignore defense
            if (effect.ignoreDefense) {
                const defReduction = Math.floor(target.stats.def * (effect.ignoreDefense / 100));
                damage += defReduction;
            }

            // Crit calculation
            let isCrit = false;
            let critChance = player.stats.crit || 5;
            if (effect.critBonus) critChance += effect.critBonus;
            
            if (Math.random() * 100 < critChance) {
                isCrit = true;
                damage = Math.floor(damage * 2.0);
            }

                          target.stats.hp -= damage;
                          target.currentHP = target.stats.hp; // Sync V2
                          totalDamage += damage;
            
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
                              const sRes = applyStatusEffect(target, effect.dot, effect.dotDuration, effect.dotDamage, player.name);
                              msg += `🔥 Applied ${effect.dot} to ${target.name}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ''}\n`;
                          }
            
                          // Apply CC (Crowd Control)
                          if (effect.cc && Math.random() * 100 < (effect.ccChance || 100)) {
                              const sRes = applyStatusEffect(target, effect.cc, effect.ccDuration, 0, player.name);
                              msg += `💫 Applied ${effect.cc} to ${target.name}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ''}\n`;
                          }
                          // Apply Specific Debuffs (Slow, etc found in keys)
                          ['slow', 'stun', 'freeze', 'burn', 'shock', 'poison'].forEach(debuff => {
                               if (effect[debuff] !== undefined) {
                                   // Check if it's a value or object, though flattening makes it a value usually
                                   const val = effect[debuff];
                                   const dur = effect[debuff + 'Duration'] || 2;
                                   const sRes = applyStatusEffect(target, debuff, dur, val, player.name);
                                   msg += `📉 Applied ${debuff} to ${target.name}!${sRes.synergyMsg ? `\n✨ ${sRes.synergyMsg}` : ''}\n`;
                               }
                          });            
            if (target.stats.hp <= 0) {
                // 💡 OVERKILL EXECUTION BONUS
                const overkillThreshold = target.stats.hp + damage; // HP before this hit
                if (damage > overkillThreshold * 2.0) {
                    const bonusGold = Math.floor(target.goldReward * 0.1) || 50;
                    player.goldEarned = (player.goldEarned || 0) + bonusGold;
                    msg += `⚡ *OVERKILL!* +${bonusGold} Zeni execution bonus!\n`;
                }

                msg += `💀 ${target.name} defeated!\n`;
                target.isDead = true;
                target.currentHP = 0; // Sync
                player.combatStats.kills = (player.combatStats.kills || 0) + 1;

                // 💡 CRITICAL FIX: Check if combat should end immediately
                if (await checkCombatEnd(sock, state, sessionKey)) return { applied: true, msg };
            }
        }
        player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + totalDamage;
    }
    
    // HEALING ABILITIES
    // HEALING ABILITIES
    if (effect.type === 'heal' || effect.type.includes('heal')) {
        const target = getHealTarget(player, targetIndex, chatId);
        if (target) {
            const hMult = getHealMult(chatId);
            const healAmount = Math.min(Math.floor(effect.value * hMult), target.stats.maxHp - target.stats.hp);
            target.stats.hp += healAmount;
            target.currentHP = target.stats.hp; 
            totalHealing += healAmount;
            
            const targetIcon = target.class?.icon || '👤';
            msg += `💚 ${targetIcon} ${target.name} healed for ${healAmount} HP!${hMult < 1 ? ' (Healing Reduced)' : (hMult > 1 ? ' (Holy Ground!)' : '')}\n`;
            player.combatStats.healed = (player.combatStats.healed || 0) + healAmount;
        }
    }
    
    // TEAM HEAL
    if (effect.type === 'heal_team') {
        const friendlySide = player.isEnemy ? state.enemies.filter(e => e.stats.hp > 0) : state.players.filter(p => !p.isDead);
        const hMult = getHealMult(chatId);
        for (const ally of friendlySide) {
            const healAmount = Math.min(Math.floor(effect.value * hMult), (ally.stats.maxHp || ally.stats.hp) - ally.stats.hp);
            ally.stats.hp += healAmount;
            ally.currentHP = ally.stats.hp; 
            totalHealing += healAmount;
            
            const allyIcon = ally.isEnemy ? ally.icon : (ally.class?.icon || '👤');
            msg += `💚 ${allyIcon} ${ally.name} +${healAmount} HP${hMult < 1 ? ' (Reduced)' : ''}\n`;
        }
        if (!player.isEnemy) player.combatStats.healed = (player.combatStats.healed || 0) + totalHealing;
    }
    
    // BUFF ABILITIES
    if (effect.type.includes('buff')) {
        if (effect.type === 'buff_self') {
            if (effect.buffType) {
                applyBuff(player, effect.buffType, effect.value, effect.duration);
                msg += `✨ ${player.name} gains +${effect.value}% ${effect.buffType}!\n`;
            }
            // Handle specific self buffs (Mirror Image etc)
            if (effect.evasion) {
                applyBuff(player, 'evasion', effect.evasion, effect.evasionDuration || 2);
                msg += `✨ ${player.name} gains Evasion!\n`;
            }
            if (effect.critBuff) {
                applyBuff(player, 'crit', effect.critBuff, effect.critBuffDuration || 2);
                msg += `✨ ${player.name} gains Crit Chance!\n`;
            }
                } else if (effect.type === 'buff_team') {
                    const friendlySide = player.isEnemy ? state.enemies.filter(e => e.stats.hp > 0) : state.players.filter(p => !p.isDead);
                    for (const ally of friendlySide) {
                        applyBuff(ally, effect.buffType, effect.value, effect.duration);
                    }
                    msg += `✨ ${player.isEnemy ? 'Enemy' : 'Player'} team gains +${effect.value}% ${effect.buffType} for ${effect.duration} turns!\n`;        } else if (effect.type === 'buff_target') {
            const target = getHealTarget(player, targetIndex, chatId);
            if (target) {
                applyBuff(target, effect.buffType, effect.value, effect.duration);
                msg += `✨ ${target.name} gains +${effect.value}% ${effect.buffType}!\n`;
            }
        }
    }
    
    // DEBUFF ABILITIES
    if (effect.type.includes('debuff')) {
        if (effect.type === 'debuff_target') {
            const targets = getTargets(player, effect, targetIndex, chatId);
            const target = targets[0];
            if (target) {
                applyDebuff(target, effect.debuffType, effect.value, effect.duration);
                msg += `💀 ${target.name} receives -${effect.value}% ${effect.debuffType}!\n`;
            }
                } else if (effect.type === 'debuff_enemies') {
                    const opponentSide = player.isEnemy ? state.players.filter(p => !p.isDead) : state.enemies.filter(e => e.stats.hp > 0);
                    for (const target of opponentSide) {
                        applyDebuff(target, effect.debuffType, effect.value, effect.duration);
                    }
                    msg += `💀 All enemies receive -${effect.value}% ${effect.debuffType}!\n`;        }
    }
    
    // REVIVE
        if (effect.type === 'revive') {
            const deadFriendly = player.isEnemy ? state.enemies.filter(e => e.stats.hp <= 0) : state.players.filter(p => p.isDead);
            if (deadFriendly.length > 0) {
                const target = deadFriendly[0];
                target.isDead = false;
                target.stats.hp = Math.floor((target.stats.maxHp || target.stats.hp) * ((effect.hpPercent || 50) / 100));
                target.currentHP = target.stats.hp;
                msg += `👼 ${target.name} has been resurrected with ${target.stats.hp} HP!\n`;
                if (!player.isEnemy) player.combatStats.healed = (player.combatStats.healed || 0) + target.stats.hp;
            } else {
                msg += `(No fallen allies to revive)\n`;
            }
        }
    // MULTI-HIT
    if (effect.type === 'multi_hit') {
        const targets = getTargets(player, effect, targetIndex, chatId);
        const target = targets[0];
        if (target) {
            let totalMultiDamage = 0;
            const baseStat = effect.damageType === 'magic' ? (player.stats.mag || 10) : (player.stats.atk || 10);
            const dType = effect.damageType === 'magic' ? 'magic' : 'physical';
            const element = effect.element || 'PHYSICAL';
            
            for (let i = 0; i < effect.hits; i++) {
                const { damage, isCrit, wasEvaded } = calculateDamage(player, target, baseStat * effect.multiplier, dType, element, chatId);
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
            player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + totalMultiDamage;
            
            if (target.stats.hp <= 0) {
                msg += `💀 ${target.name} defeated!\n`;
                target.isDead = true;
                target.currentHP = 0;

                // 💡 CRITICAL FIX: Check if combat should end immediately
                if (await checkCombatEnd(sock, state, sessionKey)) return { applied: true, msg };
            }
        }
    }
    
          // 🧪 NEW FORMAT SUPPORT (effects object)
          if (effect.effects) {
              for (const [effType, effData] of Object.entries(effect.effects)) {
                  const dur = effData.duration || 3;
                  const val = Array.isArray(effData.value) ? effData.value[Math.min((player.level || 1) - 1, effData.value.length - 1)] : (effData.value || 0);
                  
                  const opponentSide = player.isEnemy ? state.players.filter(p => !p.isDead) : state.enemies.filter(e => e.stats.hp > 0);
                  const friendlySide = player.isEnemy ? state.enemies.filter(e => e.stats.hp > 0) : state.players.filter(p => !p.isDead);
                  
                  // Determine targets based on the skill's overall targeting
                  let targets = [];
                  const targeting = (effect.targeting || '').toUpperCase();
                  if (targeting.includes('AOE') || targeting === 'ALL_ENEMIES' || targeting === 'CHAIN') {
                      targets = opponentSide;
                  } else if (targeting === 'TEAM' || targeting === 'ALL_ALLIES') {
                      targets = friendlySide;
                  } else if (targeting === 'SELF') {
                      targets = [player];
                  } else {
                      targets = [getHealTarget(player, targetIndex, chatId)];
                  }
    
                  for (const target of targets) {
                      const statusResult = applyStatusEffect(target, effType, dur, val, player.name);
                      if (statusResult.synergyMsg) msg += `\n✨ ${statusResult.synergyMsg}`;
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
    
    const opponentSide = attacker.isEnemy ? state.players.filter(p => !p.isDead) : state.enemies.filter(e => e.stats.hp > 0);

    const targeting = (effect.targeting || '').toUpperCase();
    if (effect.type === 'aoe' || targeting.includes('AOE') || targeting === 'ALL_ENEMIES' || targeting === 'CHAIN') {
        return opponentSide.slice(0, effect.targets || 99);
    }

    const index = parseInt(targetIndex);
    const target = isNaN(index) ? opponentSide[0] : (attacker.isEnemy ? state.players[index] : state.enemies[index]);

    if (!target || target.isDead || (target.stats && target.stats.hp <= 0)) {
        return opponentSide.length > 0 ? [opponentSide[0]] : [];
    }

    return [target];
}

function getHealTarget(attacker, targetIndex, chatId) {
    const state = getGameState(chatId);
    if (!state) return attacker;
    
    const friendlySide = attacker.isEnemy ? state.enemies.filter(e => e.stats.hp > 0) : state.players.filter(p => !p.isDead);

    if (targetIndex === undefined || targetIndex === null) {
        return attacker; // Self by default
    }

    const index = parseInt(targetIndex);
    const target = attacker.isEnemy ? state.enemies[index] : state.players[index];
    
    return (target && !target.isDead) ? target : attacker;
}
function getHealMult(chatId) {
    const state = getGameState(chatId);
    const env = state?.environment;
    if (!env) return 1.0;

    if (env.id === 'TOXIC_CAVE') return 0.7;
    if (env.id === 'DEMON_CASTLE') return 0.5;
    if (env.id === 'PRE_INFECTED_AFTERLIFE') return 1.5;
    
    return 1.0;
}
function applyBuff(target, buffType, value, duration) {
    if (!target.buffs) target.buffs = [];
    
    target.buffs.push({
        type: buffType,
        value: value,
        duration: duration,
        icon: getBuffIcon(buffType)
    });
}

function applyDebuff(target, debuffType, value, duration) {
    if (!target.statusEffects) target.statusEffects = [];
    
    target.statusEffects.push({
        type: debuffType,
        value: value,
        duration: duration,
        icon: getDebuffIcon(debuffType)
    });
}

function getBuffIcon(buffType) {
    const icons = {
        attack: '⚔️',
        defense: '🛡️',
        speed: '💨',
        magic: '✨',
        evasion: '💫',
        shield: '🔷',
        crit: '🎯'
    };
    return icons[buffType] || '✨';
}

function getDebuffIcon(debuffType) {
    const icons = {
        vulnerability: '💀',
        blind: '🌫️',
        slow: '🐌',
        weak: '😵'
    };
    return icons[debuffType] || '💀';
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
        if (state.phase !== 'PLAYING' || state.inCombat || state.voteProcessing) {
            return "❌ Not voting time or already processing.";
        }
        if (!state.players.find(p => p.jid === jid)) {
            return "❌ Not in party.";
        }
        state.votes[jid] = vote;
        
        // 🗳️ CHECK: Does the encounter support voting?
        const isStandardVote = state.currentEncounter && state.currentEncounter.choices;
        const isBranchingVote = state.isBranching;
        
        if (!isStandardVote && !isBranchingVote) {
            delete state.votes[jid];
            return "❌ No active voting choices at the moment.";
        }
        
        // Set flag for next timer adjustment (group only)
        if (!state.solo) {
            state.actionJustTaken = true;
        }
        
        // Check if all players have voted
        const allVoted = state.players.every(p => state.votes[p.jid]);
        
        if (allVoted && state.isBranching) {
            clearTimeout(state.timers.vote);
            const sock = state.sock;
            const sessionKey = state.sessionKey;
            setTimeout(() => {
                const v1 = Object.values(state.votes).filter(v => v === '1').length;
                const v2 = Object.values(state.votes).filter(v => v === '2').length;
                const winner = v2 > v1 ? 'REST' : 'ELITE_COMBAT';
                state.isProcessing = false;
                state.isBranching = false;
                processBranchChoice(sock, winner, sessionKey).catch(e => console.error("[Quest] processBranchChoice error:", e?.message || e));
            }, state.solo ? 0 : 1000);
            return `🗳️ All votes in! Branching to *${Object.values(state.votes).filter(v => v === '2').length > Object.values(state.votes).filter(v => v === '1').length ? 'Safe Path' : 'Danger Path'}*...`;
        }

        if (allVoted && state.currentEncounter && !state.isBranching) {
            // All players voted - process immediately
            const currentEnc = state.currentEncounter; // Capture to prevent race conditions
            const sessionKey = state.sessionKey;
            state.voteProcessing = true;
            clearTimeout(state.timers.vote);
            
            // Use setTimeout to avoid blocking
            const sock = state.sock;
            setTimeout(() => {
                processVotes(sock, currentEnc, sessionKey).catch(e => console.error("[Quest] processVotes error:", e?.message || e));
            }, state.solo ? 0 : 2000); // 0s for solo, 2s for group
            
            return `🗳️ Vote cast! ${state.solo ? 'Processing...' : 'All votes in! Processing...'}`;
        }
        
        return "🗳️ Vote cast!";
    },
    getGameState,
    // Export for use in index.js
    CLASSES,
    CONSUMABLES,
    EQUIPMENT,
    GAME_CONFIG
};
