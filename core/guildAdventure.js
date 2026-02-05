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

// ==========================================
// 📊 GAME CONSTANTS
// ==========================================

const DUNGEON_RANKS = {
    F: { name: 'F-Rank', encounters: 3, minMobs: 1, maxMobs: 2, difficulty: 0.8, boss: 'INFECTED_COLOSSUS', pool: 1, xpMult: 0.8 },
    E: { name: 'E-Rank', encounters: 4, minMobs: 2, maxMobs: 4, difficulty: 1.0, boss: 'CORRUPTED_GUARDIAN', pool: 1, xpMult: 1.0 },
    D: { name: 'D-Rank', encounters: 7, minMobs: 2, maxMobs: 4, difficulty: 1.5, boss: 'ELEMENTAL_ARCHON', pool: 2, xpMult: 1.5 },
    C: { name: 'C-Rank', encounters: 7, minMobs: 2, maxMobs: 5, difficulty: 2.0, boss: 'MUTATION_PRIME', pool: 2, xpMult: 2.0 },
    B: { name: 'B-Rank', encounters: 8, minMobs: 3, maxMobs: 5, difficulty: 2.8, boss: 'VOID_CORRUPTED', pool: 3, xpMult: 2.8 },
    A: { name: 'A-Rank', encounters: 9, minMobs: 3, maxMobs: 6, difficulty: 4.5, boss: 'PRIMORDIAL_CHAOS', pool: 4, xpMult: 4.5 },
    S: { name: 'S-Rank', encounters: 10, minMobs: 4, maxMobs: 6, difficulty: 7.0, boss: 'PRIMORDIAL_CHAOS', pool: 5, xpMult: 7.0 },
    SS: { name: 'SS-Rank', encounters: 11, minMobs: 4, maxMobs: 7, difficulty: 10.0, boss: 'PRIMORDIAL_CHAOS', pool: 5, xpMult: 10.0 },
    SSS: { name: 'SSS-Rank', encounters: 13, minMobs: 5, maxMobs: 8, difficulty: 20.0, boss: 'PRIMORDIAL_CHAOS', pool: 5, xpMult: 20.0 }
};

const GAME_CONFIG = {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 6,
    REGISTRATION_TIME: 120000, 
    SHOP_TIME: 90000, 
    VOTE_TIME: 30000, // Reduced from 45s
    COMBAT_TURN_TIME: 600000, 
    BREAK_TIME: 10000, // Reduced from 60s for better flow
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
    'minor_potion': { name: 'Minor Health Potion', cost: 200, effect: 'heal', value: 30, desc: 'Restores 30 HP. A basic potion for minor wounds.', icon: '🧪' },
    'health_potion': { name: 'Health Potion', cost: 500, effect: 'heal', value: 60, desc: 'Restores 60 HP. Standard issue for adventurers.', icon: '💊' },
    'major_potion': { name: 'Major Health Potion', cost: 1200, effect: 'heal', value: 120, desc: 'Restores 120 HP. Essential for dangerous raids.', icon: '⚗️' },
    'elixir': { name: 'Full Restore Elixir', cost: 3000, effect: 'heal', value: 999, desc: 'Fully restores HP. Rare and powerful alchemy.', icon: '🍶' },
    'regen_salve': { name: 'Regeneration Salve', cost: 800, effect: 'regen', value: 15, duration: 3, desc: 'Heals 15 HP per turn for 3 turns.', icon: '🧴' },
    
    // MANA (for abilities)
    'mana_potion': { name: 'Mana Potion', cost: 400, effect: 'restore_energy', value: 30, desc: 'Restores 30 Energy. Refreshes your combat focus.', icon: '💙' },
    'ether': { name: 'Ether', cost: 1000, effect: 'restore_energy', value: 999, desc: 'Fully restores Energy. Pure arcane energy in a bottle.', icon: '🔵' },
    
    // BUFFS
    'strength_brew': { name: 'Strength Brew', cost: 600, effect: 'buff_atk', value: 25, duration: 3, desc: 'Increases ATK by 25% for 3 turns.', icon: '💪' },
    'defense_tonic': { name: 'Defense Tonic', cost: 600, effect: 'buff_def', value: 25, duration: 3, desc: 'Increases DEF by 25% for 3 turns.', icon: '🛡️' },
    'speed_elixir': { name: 'Speed Elixir', cost: 600, effect: 'buff_spd', value: 30, duration: 3, desc: 'Increases SPD by 30% for 3 turns.', icon: '⚡' },
    'lucky_charm': { name: 'Lucky Charm', cost: 800, effect: 'buff_luck', value: 40, duration: 3, desc: 'Increases LUCK by 40% for 3 turns.', icon: '🍀' },
    'berserker_pill': { name: 'Berserker Pill', cost: 1500, effect: 'buff_all_damage', value: 50, duration: 2, desc: 'Massive damage boost, but lowers defense.', icon: '💥' },
    
    // UTILITY
    'phoenix_down': { name: 'Phoenix Down', cost: 2500, effect: 'revive', value: 50, desc: 'Revives a fallen ally with 50% HP.', icon: '🪶' },
    'smoke_bomb': { name: 'Smoke Bomb', cost: 500, effect: 'flee', chance: 80, desc: 'Allows the party to escape combat (80% chance).', icon: '💨' },
    'bomb': { name: 'Bomb', cost: 1000, effect: 'damage_aoe', value: 80, desc: 'Deals 80 area damage to all enemies.', icon: '💣' },
    
    // BUNDLES
    'bundle_pack': { name: 'Explorer Pack', cost: 1200, effect: 'bundle', items: ['health_potion', 'mana_potion', 'minor_potion'], desc: 'A bundle containing a Health Potion, Energy Elixir, and Minor Potion.', icon: '🎒' },
};

const SHOP_LIST = [
    'minor_potion', 'health_potion', 'major_potion', 'elixir', 'regen_salve',
    'mana_potion', 'ether',
    'strength_brew', 'defense_tonic', 'speed_elixir', 'lucky_charm', 'berserker_pill',
    'phoenix_down', 'bomb', 'smoke_bomb'
];

const EQUIPMENT = {
    // WEAPONS
    'rusty_sword': { name: 'Rusty Sword', type: 'weapon', cost: 500, stats: { atk: 5 }, icon: '🗡️', slot: 'weapon' },
    'iron_sword': { name: 'Iron Sword', type: 'weapon', cost: 1500, stats: { atk: 12 }, icon: '⚔️', slot: 'weapon' },
    'steel_blade': { name: 'Steel Blade', type: 'weapon', cost: 3500, stats: { atk: 20, crit: 5 }, icon: '🗡️', slot: 'weapon' },
    'mythril_sword': { name: 'Mythril Sword', type: 'weapon', cost: 7000, stats: { atk: 30, crit: 10 }, icon: '⚔️', slot: 'weapon' },
    'excalibur': { name: 'Excalibur', type: 'weapon', cost: 15000, stats: { atk: 50, crit: 15, mag: 10 }, icon: '🗡️✨', slot: 'weapon', special: 'holy_damage' },
    
    'wooden_staff': { name: 'Wooden Staff', type: 'weapon', cost: 500, stats: { mag: 8 }, icon: '🪄', slot: 'weapon' },
    'magic_wand': { name: 'Magic Wand', type: 'weapon', cost: 2000, stats: { mag: 15 }, icon: '✨', slot: 'weapon' },
    'arcane_staff': { name: 'Arcane Staff', type: 'weapon', cost: 5000, stats: { mag: 28, atk: 5 }, icon: '🔮', slot: 'weapon' },
    'staff_of_ages': { name: 'Staff of Ages', type: 'weapon', cost: 12000, stats: { mag: 45, spd: 10 }, icon: '🪄✨', slot: 'weapon', special: 'spell_power' },
    
    'short_bow': { name: 'Short Bow', type: 'weapon', cost: 800, stats: { atk: 10, spd: 5 }, icon: '🏹', slot: 'weapon' },
    'longbow': { name: 'Longbow', type: 'weapon', cost: 2500, stats: { atk: 18, spd: 8 }, icon: '🏹', slot: 'weapon' },
    'hunters_bow': { name: 'Hunter\'s Bow', type: 'weapon', cost: 6000, stats: { atk: 28, spd: 12, crit: 12 }, icon: '🏹✨', slot: 'weapon', special: 'piercing' },
    
    // ARMOR
    'cloth_armor': { name: 'Cloth Armor', type: 'armor', cost: 400, stats: { def: 5, mag: 3 }, icon: '👕', slot: 'armor' },
    'leather_armor': { name: 'Leather Armor', type: 'armor', cost: 1200, stats: { def: 10, spd: 2 }, icon: '🧥', slot: 'armor' },
    'chainmail': { name: 'Chainmail', type: 'armor', cost: 3000, stats: { def: 18 }, icon: '⛓️', slot: 'armor' },
    'plate_armor': { name: 'Plate Armor', type: 'armor', cost: 6000, stats: { def: 30, hp: 20 }, icon: '🛡️', slot: 'armor' },
    'dragon_scale': { name: 'Dragon Scale Armor', type: 'armor', cost: 15000, stats: { def: 50, hp: 40, mag: 10 }, icon: '🐉', slot: 'armor', special: 'fire_resist' },
    
    // ACCESSORIES
    'ring_str': { name: 'Ring of Strength', type: 'accessory', cost: 2000, stats: { atk: 10 }, icon: '💍', slot: 'ring' },
    'ring_int': { name: 'Ring of Intelligence', type: 'accessory', cost: 2000, stats: { mag: 10 }, icon: '💍', slot: 'ring' },
    'ring_vit': { name: 'Ring of Vitality', type: 'accessory', cost: 2000, stats: { hp: 30 }, icon: '💍', slot: 'ring' },
    'ring_luck': { name: 'Ring of Fortune', type: 'accessory', cost: 3000, stats: { luck: 20 }, icon: '💍', slot: 'ring' },
    'ring_crit': { name: 'Ring of Precision', type: 'accessory', cost: 3500, stats: { crit: 15 }, icon: '💍', slot: 'ring' },
    
    'amulet_hp': { name: 'Amulet of Life', type: 'accessory', cost: 2500, stats: { hp: 50 }, icon: '📿', slot: 'amulet' },
    'amulet_regen': { name: 'Amulet of Regeneration', type: 'accessory', cost: 3500, stats: { hp: 20 }, icon: '📿', slot: 'amulet', special: 'regen_5' },
    'amulet_elemental': { name: 'Elemental Amulet', type: 'accessory', cost: 5000, stats: { mag: 15, def: 10 }, icon: '📿', slot: 'amulet', special: 'elemental_resist' },
    
    'boots_speed': { name: 'Boots of Speed', type: 'accessory', cost: 1800, stats: { spd: 15 }, icon: '👢', slot: 'boots' },
    'boots_tank': { name: 'Iron Boots', type: 'accessory', cost: 1800, stats: { def: 12, hp: 15 }, icon: '👢', slot: 'boots' },
    'winged_boots': { name: 'Winged Boots', type: 'accessory', cost: 4500, stats: { spd: 25, def: 5 }, icon: '👢✨', slot: 'boots', special: 'first_strike' },
    
    'cloak_stealth': { name: 'Cloak of Stealth', type: 'accessory', cost: 3000, stats: { spd: 10, luck: 10 }, icon: '🧥', slot: 'cloak', special: 'dodge_15' },
    'cloak_mage': { name: 'Mage\'s Cloak', type: 'accessory', cost: 3500, stats: { mag: 20, def: 5 }, icon: '🧥', slot: 'cloak' },
    'cloak_vampire': { name: 'Vampire Cloak', type: 'accessory', cost: 6000, stats: { atk: 15, mag: 15 }, icon: '🧥', slot: 'cloak', special: 'lifesteal_10' },
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

const MONSTER_ABILITIES = {
    // PHYSICAL SKILLS
    'quick_stab': { name: 'Quick Stab', type: 'damage', multiplier: 1.2, cost: 15, msg: 'thrusts their weapon with blinding speed!' },
    'club_smash': { name: 'Club Smash', type: 'damage', multiplier: 1.8, cost: 25, effect: 'stun', chance: 30, msg: 'brings down a massive club with bone-crushing force!' },
    'bite': { name: 'Vicious Bite', type: 'damage', multiplier: 1.4, cost: 20, effect: 'bleed', chance: 40, msg: 'sinks its teeth deep into flesh!' },
    'slash': { name: 'Cleaving Slash', type: 'damage', multiplier: 1.5, cost: 20, msg: 'swings wildly at the frontline!' },
    'poison_bite': { name: 'Venomous Bite', type: 'damage', multiplier: 1.2, cost: 25, effect: 'poison', chance: 70, msg: 'injects a deadly toxin!' },
    'bone_slash': { name: 'Bone Blade', type: 'damage', multiplier: 1.6, cost: 20, msg: 'swipes with a blade made of sharp bone!' },
    'tail_swipe': { name: 'Tail Swipe', type: 'aoe', multiplier: 1.0, cost: 30, msg: 'whips its tail across the entire party!' },
    'claw': { name: 'Rending Claw', type: 'damage', multiplier: 1.5, cost: 20, effect: 'vulnerability', chance: 30, msg: 'tears through armor with sharp claws!' },

    // MAGIC SKILLS
    'dark_bolt': { name: 'Dark Bolt', type: 'magic', multiplier: 1.8, cost: 20, msg: 'fires a bolt of pure shadow energy!' },
    'hex': { name: 'Hex', type: 'debuff', stat: 'atk', value: 20, duration: 3, cost: 25, msg: 'casts a debilitating curse!' },
    'hellfire': { name: 'Hellfire', type: 'aoe_magic', multiplier: 1.2, cost: 35, effect: 'burn', chance: 50, msg: 'summons pillars of infernal flame!' },
    'life_drain': { name: 'Life Drain', type: 'lifesteal', multiplier: 1.4, healPercent: 50, cost: 30, msg: 'siphons the very soul of their target!' },
    'curse': { name: 'Ancient Curse', type: 'debuff', stat: 'all', value: 15, duration: 4, cost: 30, msg: 'whispers words of doom that weaken the body!' },
    'void_pulse': { name: 'Void Pulse', type: 'aoe_magic', multiplier: 1.5, cost: 40, msg: 'releases a wave of reality-warping energy!' },
    'judgment': { name: 'Final Judgment', type: 'magic', multiplier: 3.0, cost: 50, msg: 'calls down a beam of blinding light!' },
    'chaos_bolt': { name: 'Chaos Bolt', type: 'magic', multiplier: 2.5, cost: 30, effect: 'random_status', msg: 'hurls a swirling mass of unpredictable energy!' },

    // SPECIAL / BOSS
    'berserker_rage': { name: 'Berserker Rage', type: 'buff', stat: 'atk', value: 50, duration: 5, cost: 0, msg: 'roars in fury, their muscles bulging with raw power!' },
    'harden': { name: 'Stone Skin', type: 'buff', stat: 'def', value: 100, duration: 3, cost: 20, msg: 'turns its skin into impenetrable rock!' },
    'soul_drain': { name: 'Soul Feast', type: 'aoe_lifesteal', multiplier: 1.0, healPercent: 30, cost: 45, msg: 'devours the spirit of everyone nearby!' },
    'oblivion': { name: 'Edge of Oblivion', type: 'damage', multiplier: 4.0, cost: 60, msg: 'points a finger, commanding the target to cease existing!' },
    'reality_tear': { name: 'Reality Tear', type: 'aoe', multiplier: 2.0, cost: 50, msg: 'rips the fabric of space, damaging all dimensions!' },

    // --- ARCHETYPE SKILLS ---
    'harden': { name: 'Obsidian Skin', type: 'buff', stat: 'def', value: 30, duration: 3, cost: 20, msg: 'turns their skin into impenetrable obsidian!' },
    'taunt': { name: 'Provoke', type: 'cc', cc: 'taunt', duration: 2, cost: 15, msg: 'roars a deafening challenge!' },
    'shield_bash': { name: 'Crushing Bash', type: 'damage_cc', multiplier: 1.2, cc: 'stun', chance: 40, cost: 25, msg: 'slams forward with a massive shield!' },
    'smash': { name: 'Heavy Smash', type: 'damage', multiplier: 1.6, cost: 25, msg: 'unleashes a bone-crushing strike!' },
    'cleave': { name: 'Whirlwind Cleave', type: 'aoe', multiplier: 1.2, cost: 40, msg: 'spins wildly, striking everyone!' },
    'backstab': { name: 'Vile Strike', type: 'damage', multiplier: 1.8, cost: 15, msg: 'strikes a vital organ from the shadows!' },
    'poison': { name: 'Toxic Blade', type: 'dot', element: 'poison', value: 15, duration: 3, cost: 20, msg: 'coats their weapon in a deadly toxin!' },
    'firebolt': { name: 'Chaos Bolt', type: 'magic', multiplier: 1.6, element: 'fire', cost: 20, msg: 'hurls a ball of flickering chaos!' },
    'heal': { name: 'Dark Mend', type: 'heal', value: 100, cost: 25, msg: 'knits wounds together with dark energy!' },
    'buff': { name: 'Unholy Zeal', type: 'buff_team', stat: 'atk', value: 20, duration: 3, cost: 20, msg: 'empowers their allies with frantic chanting!' }
};

// ==========================================
// 🎲 CORE GAME FUNCTIONS
// ==========================================

function generateCombatEncounter(chatId) {
    const state = getGameState(chatId);
    if (!state) return null;
    const rankData = DUNGEON_RANKS[state.dungeonRank];
    return classEncounters.generateEncounter(
        state.players,
        'COMBAT',
        state.difficulty || 1.0,
        {
            minMobs: rankData.minMobs,
            maxMobs: rankData.maxMobs
        }
    );
}

function generateEliteCombatEncounter(chatId) {
    const state = getGameState(chatId);
    if (!state) return null;
    const rankData = DUNGEON_RANKS[state.dungeonRank];
    return classEncounters.generateEncounter(
        state.players,
        'ELITE_COMBAT',
        (state.difficulty || 1.0) * 1.2,
        {
            minMobs: 1,
            maxMobs: 2
        }
    );
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

const gameStates = new Map(); // chatId -> state

function getGameState(chatId) {
    if (!chatId) return null;
    return gameStates.get(chatId);
}

function deleteGameState(chatId) {
    const state = gameStates.get(chatId);
    if (state && state.timers) {
        Object.values(state.timers).forEach(t => clearTimeout(t));
    }
    gameStates.delete(chatId);
}

function checkChatLimits(chatId, isSolo) {
    let soloCount = 0;
    let groupActive = false;
    
    for (const state of gameStates.values()) {
        if (state.chatId === chatId && state.active) {
            if (state.solo) soloCount++;
            else groupActive = true;
        }
    }
    
    if (isSolo && soloCount >= 2) return { allowed: false, msg: "❌ Max 2 Solo raids allowed per chat!" };
    if (!isSolo && groupActive) return { allowed: false, msg: "❌ A Group raid is already active in this chat!" };
    
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

function calculateDamage(attacker, target, power, type = 'physical', element = 'PHYSICAL') {
    let damage = power;
    
    // Defense mitigation
    const def = type === 'physical' ? (target.stats.def || 0) : (target.stats.mag || 0) * 0.5;
    
    // 💡 DAMAGE REDUCTION (Secondary Stat)
    const dr = target.stats.dmgReduction || 0;
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
    if (Math.random() * 100 < (attacker.stats.crit || 0)) {
        damage *= 1.5;
        isCrit = true;
    }
    
    // 💡 EVASION CHECK (Secondary Stat)
    let evasionChance = target.stats.evasion || 0;
    
    // 🌍 WEATHER: Foggy (-15% Accuracy = +15% Evasion)
    const hours = new Date().getHours();
    if (Math.floor(hours / 6) % 4 === 1) evasionChance += 15;

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
    if (!target) return;
    if (!target.statusEffects) target.statusEffects = [];
    
    // Check if already has this effect
    const existing = target.statusEffects.find(e => e.type === effectType);
    if (existing) {
        existing.duration = Math.max(existing.duration, duration);
        existing.value = Math.max(existing.value || 0, value);
        return;
    }
    
    // Safety check: Don't spread undefined
    const effectData = STATUS_EFFECTS[effectType] || { name: effectType, icon: '❓', effect: 'none' };
    
    target.statusEffects.push({
        type: effectType,
        duration: duration,
        value: value,
        source: source,
        ...effectData
    });
}

function processStatusEffects(entity) {
    let messages = [];
    
    if (!entity.statusEffects) {
        entity.statusEffects = [];
    }
    
    for (let i = entity.statusEffects.length - 1; i >= 0; i--) {
        const effect = entity.statusEffects[i];
        
        // Process effect based on type
        if (effect.effect === 'damage_over_time') {
            const damage = effect.value;
            entity.stats.hp -= damage;
            messages.push(`${effect.icon} ${entity.name} takes ${damage} ${effect.name} damage!`);
        } else if (effect.effect === 'heal_over_time') {
            const heal = Math.min(effect.value, entity.stats.maxHp - entity.stats.hp);
            entity.stats.hp += heal;
            messages.push(`${effect.icon} ${entity.name} regenerates ${heal} HP!`);
        }
        
        // Reduce duration
        effect.duration--;
        if (effect.duration <= 0) {
            entity.statusEffects.splice(i, 1);
            messages.push(`${entity.name}'s ${effect.name} wears off.`);
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

async function startCombat(sock, groq, encounter, chatId) {
    const state = getGameState(chatId);
    if (!state) return;
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
            encounterInfo: {
                ...encounter,
                rank: state.dungeonRank, // Also in encounterInfo
                narration: narration, // Pass narration to caption generator
                theme: encounter.theme || { theme: 'Battle', description: 'A fierce fight breaks out!' }
            }
        }
    );
    
    // Store background for consistency
    if (scene.backgroundPath) {
        state.backgroundPath = scene.backgroundPath;
    }
    
    if (scene.success && fs.existsSync(scene.imagePath)) {
        try {
            await sock.sendMessage(state.chatId, {
                image: fs.readFileSync(scene.imagePath),
                caption: scene.caption
            });
        } catch (mediaError) {
            console.error("Media upload failed in startCombat:", mediaError.message);
            try {
                await sock.sendMessage(state.chatId, { text: scene.caption || "⚔️ Combat Started!" });
            } catch (err) {
                console.error("Fallback text failed in startCombat:", err.message);
            }
        }
        
        // Clean up temp file
        setTimeout(() => {
            if (fs.existsSync(scene.imagePath)) fs.unlinkSync(scene.imagePath);
        }, 10000);
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
    
    // Wait 2 minutes before starting first turn
    state.timers.combatStart = setTimeout(async () => {
        try {
            if (!state.inCombat) return; // Safety check
            
            let turnMsg = `🔔 *BATTLE START!*\n\n🎲 *Turn Order:*\n`;
            state.turnOrder.forEach((c, i) => {
                const icon = c.isEnemy ? c.icon : (c.class?.icon || '👤');
                turnMsg += `  ${i + 1}. ${icon} ${c.name}\n`;
            });
            
            await sock.sendMessage(state.chatId, { text: turnMsg });
            await processCombatTurn(sock, chatId);
        } catch (err) {
            console.error("[Quest] combatStart timer error:", err?.message || err);
        }
    }, 120000); // 2 minutes
}

async function processCombatTurn(sock, chatId) {
    const state = getGameState(chatId);
    if (!state || !state.inCombat) return;

    // Prevent overlapping turn processing (timers + user actions can collide).
    if (state.combatProcessing) return;
    state.combatProcessing = true;
    
    try {
        while (state.inCombat) {
            // Reset justDied flags for all combatants at the start of a new turn process
            state.players.forEach(p => p.justDied = false);
            state.enemies.forEach(e => e.justDied = false);

            // 💡 TICK SYSTEM: Find next combatant to reach 100 AP
            let activeActor = null;
            let ticks = 0;
            const maxTicks = 1000;

            // Prevent infinite loop if everyone is dead or insanely slow
            while (!activeActor && ticks < maxTicks) {
                ticks++;
                for (const c of state.turnOrder) {
                    // Skip dead
                    if (c.stats.hp <= 0) continue;

                    c.actionGauge = (c.actionGauge || 0) + Math.max(1, (c.stats.spd || 10));

                    if (c.actionGauge >= 100) {
                        activeActor = c;
                        break; // Found someone!
                    }
                }
            }

            if (!activeActor) return;

            // Reset actor gauge
            activeActor.actionGauge -= 100;
            state.activeCombatant = activeActor;

            // Process status effects at start of turn
            const statusMessages = processStatusEffects(activeActor);
            if (statusMessages.length > 0) {
                try {
                    await sock.sendMessage(state.chatId, { text: statusMessages.join('\n') });
                } catch (err) {
                    console.error("Failed to send status messages in processCombatTurn:", err.message);
                }
            }

            // Check if dead from status effects
            if (activeActor.stats.hp <= 0) {
                await handleDeath(sock, activeActor, chatId);
                continue;
            }

            // Check for skip turn effects
            const skipEffects = ['freeze', 'stun', 'sleep'];
            const effects = activeActor.statusEffects || [];
            const hasSkipEffect = effects.some(e => skipEffects.includes(e.type));

            if (hasSkipEffect) {
                try {
                    await sock.sendMessage(state.chatId, {
                        text: `${activeActor.icon} ${activeActor.name} is unable to act!`
                    });
                } catch (err) {
                    console.error("Failed to send skip effect message in processCombatTurn:", err.message);
                }
                continue;
            }

            if (activeActor.isEnemy) {
                // AI Turn
                await performEnemyAction(sock, activeActor, chatId);
                return;
            }

            // Player Turn
            await promptPlayerAction(sock, activeActor, chatId);
            return;
        }
    } catch (err) {
        console.error("[Quest] processCombatTurn error:", err?.message || err);
    } finally {
        state.combatProcessing = false;
    }
}

async function promptPlayerAction(sock, player, chatId) {
    const state = getGameState(chatId);
    if (!state) return;
    const icon = player.class?.icon || '👤';
    const inventory = inventorySystem.formatInventory(player.jid);
    const usableItems = !inventory.isEmpty ? inventory.items.filter(item => {
        const info = lootSystem.getItemInfo(item.id);
        return info && info.usable;
    }) : [];

    let msg = `╔═══════════════╗\n`;
    msg += `   🎯 *YOUR TURN* \n`;
    msg += `╚═══════════════╝\n\n`;
    
    msg += `${icon} *${player.name}*\n`;
    msg += `❤️ HP: ${player.stats.hp}/${player.stats.maxHp}\n`;
    msg += `⚡ EN: ${player.stats.energy}/${player.stats.maxEnergy}\n`;
    
    if (player.statusEffects && player.statusEffects.length > 0) {
        msg += `📋 Status: ${player.statusEffects.map(e => e.icon).join(' ')}\n`;
    }
    
    msg += `\n*COMMANDS:*\n`;
    msg += `⚔️ \`${botConfig.getPrefix()} combat attack <#>\`\n`;
    msg += `✨ \`${botConfig.getPrefix()} combat ability <#> [target]\`\n`;
    msg += `🎒 \`${botConfig.getPrefix()} combat item <#> [target]\`\n`;
    msg += `🛡️ \`${botConfig.getPrefix()} combat defend\`\n\n`;
    
    if (usableItems.length > 0) {
        msg += `*USABLE ITEMS:*\n`;
        usableItems.forEach((item, i) => {
            const info = lootSystem.getItemInfo(item.id);
            msg += `${i + 1}. ${info.name} (x${item.quantity})\n`;
        });
        msg += `\n`;
    } else {
        msg += `_No usable items in bag_\n\n`;
    }
    
    msg += `🎒 Use \`${botConfig.getPrefix()} bag\` to see all items.`;
    try {
        await sock.sendMessage(state.chatId, { text: msg });
    } catch (err) {
        console.error("Failed to send player prompt in promptPlayerAction:", err.message);
    }
    
    // Timer logic: 10 min first time, 2 min after action taken
    let turnTime;
    if (state.solo) {
        turnTime = 120000; // Solo: 2 mins
    } else if (state.actionJustTaken) {
        turnTime = 120000; // 2 min after action
        state.actionJustTaken = false; // Reset flag
    } else {
        turnTime = GAME_CONFIG.COMBAT_TURN_TIME; // 10 min initially
    }
    
    state.timers.combat = setTimeout(async () => {
        try {
            if (state.inCombat && !state.pendingActions[player.jid]) {
                await performAction(sock, player, { type: 'defend' }, chatId);
            }
        } catch (err) {
            console.error("Error in combat timer performAction:", err.message);
        }
    }, turnTime);
}

async function performAction(sock, player, action, chatId) {
    const state = getGameState(chatId);
    if (!state) return;
    clearTimeout(state.timers.combat);
    
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
        const target = state.enemies[action.targetIndex];
        if (!target || target.stats.hp <= 0) {
            resultMsg += `❌ Invalid target!`;
        } else {
            // 💡 Get weapon element
            const mainHand = player.equipment?.main_hand;
            const element = mainHand ? (lootSystem.getItemInfo(mainHand.id).element || 'PHYSICAL') : 'PHYSICAL';
            
            const { damage, isCrit, wasEvaded } = calculateDamage(player, target, player.stats.atk, 'physical', element);
            
            if (wasEvaded) {
                resultMsg += `💨 *MISS!* ${target.icon} ${target.name} evaded the attack.`;
                turnInfo.action = { name: 'Missed Attack' };
            } else {
                target.stats.hp -= damage;
                target.currentHP = target.stats.hp; 
                
                if (target.stats.hp <= 0) {
                    target.justDied = true;
                }
                
                player.combatStats.damageDealt += damage;
                target.combatStats = target.combatStats || { damageTaken: 0 };
                target.combatStats.damageTaken += damage;
                
                resultMsg += `${isCrit ? '💥 CRITICAL! ' : ''}Strikes ${target.icon} ${target.name} for ${damage} damage!`;
                
                turnInfo.action = { name: 'Basic Attack' };
                turnInfo.target = target;
                turnInfo.damage = damage;
                if (isCrit) turnInfo.effects.push('CRITICAL');

                if (target.stats.hp <= 0) {
                    // 💡 OVERKILL EXECUTION BONUS
                    const overkillThreshold = target.stats.hp + damage; // HP before this hit
                    if (damage > overkillThreshold * 2.0) {
                        const bonusGold = Math.floor(target.goldReward * 0.1) || 50;
                        player.goldEarned = (player.goldEarned || 0) + bonusGold;
                        resultMsg += `\n⚡ *OVERKILL!* +${bonusGold} Zeni execution bonus!`;
                    }

                    target.isDead = true;
                    target.stats.hp = 0;
                    target.currentHP = 0;
                    resultMsg += `\n💀 ${target.name} defeated!`;
                    player.combatStats.kills = (player.combatStats.kills || 0) + 1;
                    state.stats.monstersKilled++;
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
            const isNegative = ['damage_aoe', 'apply_poison', 'freeze_enemy', 'flee', 'bribe'].includes(item.effect);
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
                        const heal = Math.min(item.effectValue || 0, target.stats.maxHp - target.stats.hp);
                        target.stats.hp += heal;
                        target.currentHP = target.stats.hp; // Sync
                        resultMsg += `\n💖 Restored ${heal} HP to ${target.name}!`;
                        turnInfo.healing = heal;
                        break;
                    case 'regen':
                        applyStatusEffect(target, 'regen', item.duration || 3, item.effectValue || 15);
                        resultMsg += `\n🧴 Applied regeneration salve to ${target.name}!`;
                        break;
                    case 'restore_energy':
                        target.stats.energy = Math.min(100, target.stats.energy + (item.effectValue || 0));
                        resultMsg += `\n⚡ Restored energy to ${target.name}!`;
                        break;
                    case 'buff_atk':
                        applyStatusEffect(target, 'haste', 3, item.effectValue || 0);
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
                    case 'buff_all_damage':
                        applyStatusEffect(target, 'rage', 2, item.effectValue || 0);
                        resultMsg += `\n💥 ${target.name} enters a BERSERKER RAGE! (+Damage, -Defense)`;
                        break;
                    case 'damage_aoe':
                        state.enemies.forEach(e => {
                            if (e.stats.hp > 0) {
                                e.stats.hp -= (item.effectValue || 0);
                                e.currentHP = e.stats.hp; // Sync
                                resultMsg += `\n💥 ${e.name} takes ${item.effectValue || 0} damage!`;
                            }
                        });
                        turnInfo.damage = item.effectValue || 0;
                        break;
                    case 'revive':
                        if (target.isDead) {
                            target.isDead = false;
                            target.stats.hp = Math.floor(target.stats.maxHp * ((item.effectValue || 50) / 100));
                            target.currentHP = target.stats.hp; // Sync
                            resultMsg += `\n🪶 Revived ${target.name}!`;
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
    
    state.combatHistory.push(resultMsg);
    
    // Clear action after it is executed
    delete state.pendingActions[player.jid];
    
    // Set flag for next turn timer adjustment
    if (!state.solo) {
        state.actionJustTaken = true;
    }
    
    // Process the turn image update in nextTurn/processCombatTurn
    nextTurn(sock, turnInfo, chatId);
}

async function performEnemyAction(sock, enemy, chatId) {
    const state = getGameState(chatId);
    if (!state || !state.inCombat) return;
    
    // 🌍 WEATHER EFFECT INTEGRATION
    let weatherMult = 1.0;
    const hours = new Date().getHours();
    if (Math.floor(hours / 6) % 4 === 2) { // Blood Moon
        weatherMult = 1.25; // 25% more damage from mobs
    }

    let resultMsg = `┏━━━━━━━━━━━━━━━┓\n`;
    resultMsg += `┃   👾 ENEMY TURN \n`;
    resultMsg += `┗━━━━━━━━━━━━━━━┛\n\n`;
    
    // 🧠 AI PERSONALITY: COWARDLY
    const isSmallMob = enemy.name.toLowerCase().includes('crawler') || enemy.name.toLowerCase().includes('soldier');
    if (isSmallMob && state.enemies.filter(e => e.stats.hp > 0).length === 1 && Math.random() < 0.2) {
        resultMsg += `${enemy.icon} *${enemy.name}* is terrified and Cowers! (DEF increased)`;
        applyStatusEffect(enemy, 'shield', 1, 50);
        return await sock.sendMessage(state.chatId, { text: resultMsg });
    }

    // 🧠 AI PERSONALITY: AGGRESSIVE (Heavy mobs / Bosses)
    const isHeavyMob = enemy.isBoss || enemy.name.toLowerCase().includes('colossus') || enemy.name.toLowerCase().includes('stalker');
    if (isHeavyMob && Math.random() < 0.3) {
        resultMsg += `🔥 *${enemy.name}* is ENRAGED! Ignoring DEF but taking more damage!\n`;
        weatherMult *= 1.5; // Hits harder
        applyStatusEffect(enemy, 'vulnerability', 2, 20); // Takes more damage
    }

    resultMsg += `${enemy.icon} *${enemy.name}* is attacking!\n`;
    
    let turnInfo = {
        actor: enemy,
        action: { name: 'Action' },
        target: null,
        damage: 0,
        effects: []
    };

    // 💡 BOSS TELEGRAPH LOGIC
    if (enemy.isBoss && enemy.telegraphedAbility) {
        const ability = enemy.telegraphedAbility;
        enemy.telegraphedAbility = null; // Reset

        resultMsg += `UNLEASHES ${ability.name.toUpperCase()}! 💥`;
        
        // Find targets
        const targets = ability.targeting === 'aoe' ? state.players.filter(p => !p.isDead) : [state.players.filter(p => !p.isDead)[Math.floor(Math.random() * state.players.filter(p => !p.isDead).length)]];
        
        for (const target of targets) {
            let power = enemy.stats.atk * ability.damage;
            // 💡 If player is NOT defending, take massive damage
            if (!target.statusEffects.some(e => e.type === 'shield')) {
                power *= 2.0; 
                resultMsg += `\n⚠️ ${target.name} failed to defend and takes DOUBLE damage!`;
            }
            
            const { damage } = calculateDamage(enemy, target, power * weatherMult, ability.damageType || 'physical');
            target.stats.hp -= damage;
            target.currentHP = Math.max(0, target.stats.hp);
            resultMsg += `\n- Hit ${target.name} for 💥 ${damage} damage!`;
            
            // 💡 APPLY STATUS EFFECTS IF DEFINED (Bosses usually have 100% chance)
            if (ability.effect && ability.effect !== 'none') {
                applyStatusEffect(target, ability.effect, ability.duration || 3, ability.value || 0, enemy.name);
                const effectEmoji = STATUS_EFFECTS[ability.effect]?.icon || '✨';
                resultMsg += `\n- ${effectEmoji} ${target.name} is now ${ability.effect.toUpperCase()}!`;
                turnInfo.effects.push(`${target.name}: ${ability.effect}`);
            }

            turnInfo.target = target;
            turnInfo.damage += damage;
            if (target.stats.hp <= 0) {
                await handleDeath(sock, target, chatId, enemy.name);
                resultMsg += `\n💀 ${target.name} has fallen!`;
            }
        }
        
        try {
            await sock.sendMessage(state.chatId, { text: resultMsg });
        } catch (err) {
            console.error("Failed to send boss telegraph result:", err.message);
        }
        setTimeout(() => {
            nextTurn(sock, turnInfo, chatId).catch(e => console.error("[Quest] nextTurn timer error:", e?.message || e));
        }, GAME_CONFIG.ENEMY_TURN_TIME);
        return;
    }

    // Standard AI logic...
    const useAbility = Math.random() < (enemy.isBoss ? 0.7 : 0.3);
    if (useAbility && enemy.abilities && enemy.abilities.length > 0) {
        const abilityKey = enemy.abilities[Math.floor(Math.random() * enemy.abilities.length)];
        const ability = enemy.isBoss ? bossMechanics.BOSS_ABILITIES[abilityKey] : MONSTER_ABILITIES[abilityKey];
        
        if (ability) {
            // 💡 Check if this ability should be telegraphed
            if (ability.isTelegraphed) {
                enemy.telegraphedAbility = ability;
                try {
                    await sock.sendMessage(state.chatId, { text: `${enemy.icon} *BOSS MECHANIC:* ${ability.telegraphMessage}` });
                } catch (err) {
                    console.error("Failed to send boss mechanic telegraph:", err.message);
                }
                setTimeout(() => {
                    nextTurn(sock, null, chatId).catch(e => console.error("[Quest] nextTurn timer error:", e?.message || e));
                }, GAME_CONFIG.ENEMY_TURN_TIME);
                return;
            }

            // Execute standard/boss ability
            const targets = ability.targeting === 'aoe' ? state.players.filter(p => !p.isDead) : [state.players.filter(p => !p.isDead)[Math.floor(Math.random() * state.players.filter(p => !p.isDead).length)]];
            
            resultMsg += `uses *${ability.name}*! ✨`;
            turnInfo.action = { name: ability.name };

            for (const target of targets) {
                const { damage, wasEvaded } = calculateDamage(enemy, target, enemy.stats.atk * (ability.damage || 1.0));
                if (wasEvaded) {
                    resultMsg += `\n- ${target.name} evaded!`;
                } else {
                    target.stats.hp -= damage;
                    target.currentHP = Math.max(0, target.stats.hp);
                    resultMsg += `\n- Hit ${target.name} for 💥 ${damage} damage!`;
                    
                    // 💡 APPLY STATUS EFFECTS IF DEFINED
                    if (ability.effect && ability.effect !== 'none') {
                        const chance = ability.chance || 100;
                        if (Math.random() * 100 < chance) {
                            applyStatusEffect(target, ability.effect, ability.duration || 3, ability.value || 0, enemy.name);
                            const effectEmoji = STATUS_EFFECTS[ability.effect]?.icon || '✨';
                            resultMsg += `\n- ${effectEmoji} ${target.name} is now ${ability.effect.toUpperCase()}!`;
                            turnInfo.effects.push(`${target.name}: ${ability.effect}`);
                        }
                    }

                    turnInfo.target = target;
                    turnInfo.damage += damage;

                    if (target.stats.hp <= 0) {
                        await handleDeath(sock, target, chatId, enemy.name);
                        resultMsg += `\n💀 ${target.name} has fallen!`;
                    }
                }
            }
            try {
                await sock.sendMessage(state.chatId, { text: resultMsg });
            } catch (err) {
                console.error("Failed to send enemy ability result:", err.message);
            }
            setTimeout(() => {
                nextTurn(sock, turnInfo, chatId).catch(e => console.error("[Quest] nextTurn timer error:", e?.message || e));
            }, GAME_CONFIG.ENEMY_TURN_TIME);
            return;
        }
    }
    
    // Fallback to basic attack if no telegraphed ability or ability used
    const alivePlayers = state.players.filter(p => !p.isDead);
    if (alivePlayers.length > 0) {
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        const { damage, wasEvaded } = calculateDamage(enemy, target, enemy.stats.atk);
        
        turnInfo.target = target;
        turnInfo.action = { name: 'Basic Attack' };

        if (wasEvaded) {
            resultMsg += `Attacks ${target.name} but 💨 MISSES!`;
        } else {
            target.stats.hp -= damage;
            target.currentHP = Math.max(0, target.stats.hp);
            resultMsg += `Attacks ${target.name} for 💥 ${damage} damage!`;
            
            turnInfo.damage = damage;

            if (target.stats.hp <= 0) {
                await handleDeath(sock, target, chatId, enemy.name);
                resultMsg += `\n💀 ${target.name} has fallen!`;
            }
        }
    }

        try {
            await sock.sendMessage(state.chatId, { text: resultMsg });
        } catch (err) {
            console.error("Failed to send enemy action result:", err.message);
        }
        setTimeout(() => {
            nextTurn(sock, turnInfo, chatId).catch(e => console.error("[Quest] nextTurn timer error:", e?.message || e));
        }, GAME_CONFIG.ENEMY_TURN_TIME);
    }

async function handleDeath(sock, entity, chatId, lastKiller = "The Infection") {
    const state = getGameState(chatId);
    if (!state) return;
    entity.isDead = true;
    entity.stats.hp = 0;
    entity.currentHP = 0; // Sync
    entity.justDied = true;
    
    if (!entity.isEnemy) {
        // Player death
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

async function nextTurn(sock, lastTurnInfo = null, chatId) {
    const state = getGameState(chatId);
    if (!state || !state.inCombat) return;
    
    // 💡 Generate incremental combat image if action just happened
    if (lastTurnInfo) {
        const scene = await combatIntegration.generateCombatScene(
            state.players,
            state.enemies,
            'TURN',
            {
                turnInfo: lastTurnInfo,
                backgroundPath: state.backgroundPath
            }
        );
        if (scene.success && fs.existsSync(scene.imagePath)) {
            try {
                await sock.sendMessage(state.chatId, { image: fs.readFileSync(scene.imagePath), caption: scene.caption });
            } catch (err) {
                console.error("Failed to send turn image in nextTurn:", err.message);
            }
            setTimeout(() => { if (fs.existsSync(scene.imagePath)) fs.unlinkSync(scene.imagePath); }, 5000);
        }
    }

    // Check for end of combat (all players dead or all enemies dead)
    const playersDead = state.players.every(p => p.isDead);
    const enemiesDead = state.enemies.every(e => e.stats.hp <= 0);
    
    if (playersDead || enemiesDead) {
        await endCombat(sock, enemiesDead, chatId);
        return;
    }
    
    // 💡 Recurse to Tick System
    await processCombatTurn(sock, chatId);
}


async function endCombat(sock, victory, chatId) {
    const state = getGameState(chatId);
    if (!state) return;
    console.log(`[Quest] Combat ended. Victory: ${victory}`);
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
    const bossName = state.enemies[0]?.id || null; 
    const lootResults = lootSystem.distributeLoot(
        alivePlayers,
        encounterType,
        bossName,
        state.difficulty
    );
    
    const rewards = {
        gold: totalGold,
        xp: totalXP,
        items: lootResults.items.map(item => ({ name: item.name || item.id })) // Use name if available
    };

    // Generate final combat image
    const scene = await combatIntegration.generateCombatScene(
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

    if (scene.success && fs.existsSync(scene.imagePath)) {
        try {
            await sock.sendMessage(state.chatId, {
                image: fs.readFileSync(scene.imagePath),
                caption: scene.caption
            });
        } catch (mediaError) {
            console.error("Media upload failed in endCombat:", mediaError.message);
            try {
                await sock.sendMessage(state.chatId, { text: scene.caption || (victory ? "✅ Victory!" : "💀 Defeat...") });
            } catch (textError) {
                console.error("Failed to send fallback text in endCombat:", textError.message);
            }
        }
        
        // Clean up
        setTimeout(() => {
            if (fs.existsSync(scene.imagePath)) fs.unlinkSync(scene.imagePath);
        }, 10000);
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
            // economy.addMoney(player.jid, goldPerPlayer); // Replaced with item
            economy.addItem(player.jid, 'gold', goldPerPlayer);
            
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
        
        setTimeout(() => {
            nextStage(sock, state.groq, chatId).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
        }, GAME_CONFIG.BREAK_TIME);
    } else {
        if (state.mode === 'PERMADEATH') {
            state.active = false;
        }
        state.active = false;
    }
}

// ==========================================
// 🎬 MAIN GAME FLOW
// ==========================================

const getDungeonMenu = (isSolo, senderJid = null) => {
    let msg = `╔═══════════════╗\n`;
    msg += `   🏰 *DUNGEONS* \n`;
    msg += `╚═══════════════╝\n\n`;
    
    msg += `Choose your difficulty:\n\n`;
    
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
        'VOID_CORRUPTED': 'Void-Corrupted Entity',
        'PRIMORDIAL_CHAOS': 'Primordial Chaos'
    };
    
    for (const [key, data] of Object.entries(DUNGEON_RANKS)) {
        const dungeonIndex = ranks.indexOf(key);
        // Solo cap check: can only play 3 ranks above current
        const isLocked = isSolo && dungeonIndex > userRankIndex + 3;
        
        if (isLocked) {
            msg += `🔒 *${key}-Rank* (Locked - Reach higher rank to unlock)\n\n`;
            continue;
        }
        
        msg += `*${key}-Rank* (${data.encounters} Stages)\n`;
        msg += `⚡ Diff: ${data.difficulty}x | 👾 Mobs: ${data.minMobs}-${data.maxMobs}\n`;
        
        if (data.boss) {
            const bName = bossNames[data.boss] || 'The Infected';
            msg += `👹 Boss: ${bName}\n`;
        } else {
            msg += `👹 Boss: None\n`;
        }
        msg += `\n`;
    }
    
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `👉 Use: \`${botConfig.getPrefix()} ${isSolo ? 'solo' : 'quest'} <Rank>\`\n`;
    msg += `Example: \`${botConfig.getPrefix()} ${isSolo ? 'solo' : 'quest'} D\``;
    
    return msg;
};

const initAdventure = async (sock, chatId, groq, mode = 'NORMAL', solo = false, rankInput = null, senderJid = null, smartGroqCall = null) => {
    // Check limits
    const limitCheck = checkChatLimits(chatId, solo);
    if (!limitCheck.allowed) return { success: false, msg: limitCheck.msg };

    if (gameStates.has(chatId)) {
        return { success: false, msg: "❌ An adventure is already active in this chat!" };
    }

    if (!rankInput) {
        return { success: true, isMenu: true, msg: getDungeonMenu(solo, senderJid) };
    }

    const upperRank = rankInput.toUpperCase();
    if (!DUNGEON_RANKS[upperRank]) {
        return { success: false, msg: `❌ Invalid Dungeon Rank: ${rankInput}.\n\n` + getDungeonMenu(solo) };
    }

    // Rank Restriction Logic
    if (solo && senderJid) {
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
    const rankData = DUNGEON_RANKS[upperRank];
    
    const state = JSON.parse(JSON.stringify(INITIAL_STATE_TEMPLATE));
    Object.assign(state, {
        active: true,
        phase: 'REGISTRATION',
        chatId,
        mode,
        solo,
        sock,
        groq,
        smartGroqCall,
        dungeonRank: upperRank,
        difficulty: rankData.difficulty,
        encounter: 0,
        maxEncounters: rankData.encounters,
        players: [],
        votes: {},
        timers: {}
    });
    
    gameStates.set(chatId, state);
    
    // For compatibility during transition
    if (!state.active) state = state;

    const regTime = solo ? 30000 : GAME_CONFIG.REGISTRATION_TIME;
    state.timers.reg = setTimeout(() => {
        startJourney(sock, chatId).catch(e => console.error("[Quest] startJourney timer error:", e?.message || e));
    }, regTime);

    const modeEmoji = mode === 'PERMADEATH' ? '💀' : '🗺️';
    let msg = `
╔═══════════════╗
   *${upperRank}-RANK* 🏰
╚═══════════════╝

📜 *Mode:* ${mode === 'PERMADEATH' ? 'PERMADEATH' : 'NORMAL'}
🏰 *Rank:* ${rankData.name}
⚔️ *Length:* ${rankData.encounters} Encounters
⏱️ *Starts in:* ${solo ? '30s' : '2m'}

👉 Type \`${botConfig.getPrefix()} join\` to enter!
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
    
    // Initialize player with default stats (class assigned later)
    state.players.push({
        jid: senderJid,
        name: senderName || 'Unknown Hero',
        class: null,
        level: 1,
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

async function startJourney(sock, chatId) {
    const state = getGameState(chatId);
    if (!state) return;

    const minPlayers = state.solo ? 1 : GAME_CONFIG.MIN_PLAYERS;
    
    if (state.players.length < minPlayers) {
        state.active = false;
        await sock.sendMessage(chatId, { 
            text: `❌ Quest cancelled. Need at least ${minPlayers} hero${minPlayers > 1 ? 'es' : ''}!` 
        });
        deleteGameState(chatId);
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
        } else {
            p.spriteIndex = Math.floor(Math.random() * 100);
        }
        
        // Use user stats including progression, bonuses AND equipment
        const classId = userClass?.id || p.class.id || p.class.name.toUpperCase();
        const baseStats = progression.getBaseStats(p.jid, classId);
        const equipStats = inventorySystem.getEquipmentStats(p.jid);
        const level = progression.getLevel(p.jid);
        
        p.stats.hp = baseStats.hp; // getBaseStats already includes equipStats
        p.stats.maxHp = p.stats.hp;
        p.stats.maxEnergy = 100 + (level - 1) * 2; // +2 per level
        p.stats.energy = p.stats.maxEnergy;
        p.stats.atk = baseStats.atk;
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
    
    // Shopping phase
    setTimeout(() => {
        openShop(sock, chatId).catch(e => console.error("[Quest] openShop timer error:", e?.message || e));
    }, 1000);

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

const stopQuest = (chatId) => {
    const state = getGameState(chatId);
    if (!state || !state.active) return "❌ No quest is currently active!";
    
    // Clear all active timers
    if (state.timers) {
        Object.values(state.timers).forEach(timer => {
            if (timer) clearTimeout(timer);
        });
    }
    
    const wasSolo = state.solo;
    state.active = false;
    state.phase = 'IDLE';
    deleteGameState(chatId);
    
    return wasSolo ? "✅ Solo quest cancelled!" : "✅ Raid quest cancelled!";
};

async function openShop(sock, chatId) {
    const state = getGameState(chatId);
    if (!state) return;

    let msg = `╔═══════════════════╗\n`;
    msg += `   🏪 *PRE-RAID SHOP* \n`;
    msg += `╚═══════════════════╝\n\n`;
    
    msg += `Prepare yourselves, heroes! Shop closes in 90s.\n\n`;
    
    SHOP_LIST.forEach((key, i) => {
        const item = CONSUMABLES[key];
        msg += `${i + 1}. ${item.icon} *${item.name}* - ${botConfig.getCurrency().symbol}${item.cost}\n`;
        msg += `   📝 ${item.desc}\n`;
        msg += `   ⚡ _${item.effect}_\n\n`;
    });
    
    msg += `━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💬 Type: \`${botConfig.getPrefix()} buy <#>\` to purchase\n`;
    msg += `📌 Example: \`${botConfig.getPrefix()} buy 1\``;
    
    try {
        await sock.sendMessage(state.chatId, { text: msg });
    } catch (err) {
        console.error("Failed to send shop menu in openShop:", err.message);
    }
    
    state.timers.shop = setTimeout(() => {
        state.phase = 'PLAYING';
        nextStage(sock, state.groq, chatId).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
    }, GAME_CONFIG.SHOP_TIME);
}

async function nextStage(sock, groq, chatId) {
    const state = getGameState(chatId);
    if (!state || state.isProcessing) return;
    state.isProcessing = true;

    console.log(`[Quest] Advancing to encounter ${state.encounter + 1}/${state.maxEncounters}`);

    try {
        if (!groq) groq = state.groq;
        state.encounter++;
        
        // Check if dungeon is complete
        if (state.encounter > state.maxEncounters) {
            state.isProcessing = false;
            return endAdventure(sock, chatId);
        }

        // 💡 BRANCHING PATHS SYSTEM
        // Every 3 stages (except boss), let the party vote
        if (state.encounter > 1 && state.encounter % 3 === 0 && state.encounter < state.maxEncounters) {
            let msg = `📂 *THE PATH SPLITS* 📂\n\n`;
            msg += `The party reaches a fork in the dungeon. Choose your next destination:\n\n`;
            msg += `🔴 *Door 1: Danger & Riches*\n   (Elite Combat - 2x Loot & XP)\n\n`;
            msg += `🔵 *Door 2: The Safe Path*\n   (Rest Area - Heal 30% HP/Energy)\n\n`;
            msg += `💬 Type: \`.j vote 1\` or \`.j vote 2\`\n`;
            msg += `⏱️ Voting ends in 30 seconds!`;

            state.votes = {};
            state.currentEncounter = null; // Clear stale encounter
            state.isBranching = true; // Set flag
            try {
                await sock.sendMessage(state.chatId, { text: msg });
            } catch (err) {
                console.error("Failed to send split path message in nextStage:", err.message);
            }

            state.timers.vote = setTimeout(() => {
                const v1 = Object.values(state.votes).filter(v => v === '1').length;
                const v2 = Object.values(state.votes).filter(v => v === '2').length;
                
                const winner = v2 > v1 ? 'REST' : 'ELITE_COMBAT';
                state.isProcessing = false;
                state.isBranching = false; // Clear flag
                processBranchChoice(sock, winner, chatId).catch(e => console.error("[Quest] processBranchChoice error:", e?.message || e));
            }, 30000);
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
        
        await executeEncounter(sock, groq, encounterType, chatId);
    } finally {
        state.isProcessing = false;
    }
}

async function processBranchChoice(sock, type, chatId) {
    const state = getGameState(chatId);
    if (!state) return;
    state.isProcessing = true;
    await executeEncounter(sock, state.groq, type, chatId);
    state.isProcessing = false;
}

async function executeEncounter(sock, groq, encounterType, chatId) {
    const state = getGameState(chatId);
    if (!state) return;
    const rankData = DUNGEON_RANKS[state.dungeonRank];
    let encounter;
    
    if (encounterType === 'REST') {
        encounter = {
            type: 'REST',
            name: 'Quiet Campfire',
            description: 'The party finds a safe spot to rest and recover. The crackling fire brings comfort.'
        };
    } else if (encounterType === 'NON_COMBAT') {
        encounter = selectRandomEncounter(chatId);
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
    
    state.currentEncounter = encounter;
    state.currentEncounterType = encounter.type;

    if (encounter.type === 'COMBAT' || encounter.type === 'BOSS' || encounter.type === 'ELITE_COMBAT') {
        // Elite combat from branch choice gives 2x
        if (encounter.type === 'ELITE_COMBAT' && state.encounter % 3 === 0) {
            state.difficulty *= 2.0; 
        }
        await startCombat(sock, groq, encounter, chatId);
    } else if (encounter.type === 'REST') {
        await handleRestEncounter(sock, encounter, chatId);
    } else {
        await handleNonCombatEncounter(sock, encounter, chatId);
    }
}

async function handleRestEncounter(sock, encounter, chatId) {
    const state = getGameState(chatId);
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
        nextStage(sock, state.groq, chatId).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
    }, GAME_CONFIG.BREAK_TIME);
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

async function handleMerchantEncounter(sock, encounter, chatId) {
    const state = getGameState(chatId);
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
    
    state.timers.merchant = setTimeout(() => {
        if (state.active) {
            state.isMerchantActive = false;
            nextStage(sock, state.groq, chatId).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
        }
    }, GAME_CONFIG.VOTE_TIME || 30000);
}

async function handleNonCombatEncounter(sock, encounter, chatId) {
    const state = getGameState(chatId);
    if (!state) return;

    if (encounter.type === 'MERCHANT') {
        return handleMerchantEncounter(sock, encounter, chatId);
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
        timer = 60000; // 1 min for solo
    } else if (state.actionJustTaken) {
        timer = 120000; 
        state.actionJustTaken = false; 
    } else {
        timer = GAME_CONFIG.VOTE_TIME || 30000;
    }
    
    state.timers.vote = setTimeout(() => {
        if (state.active && !state.voteProcessing) {
            processVotes(sock, encounter, chatId).catch(e => console.error("[Quest] processVotes error:", e?.message || e));
        }
    }, timer);
}

async function processVotes(sock, encounter, chatId) {
    const state = getGameState(chatId);
    if (!state) return;
    if (!sock) sock = state.sock;
    clearTimeout(state.timers.vote);
    
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
    
    if (!encounter || !encounter.choices) {
        console.error("❌ processVotes: encounter or encounter.choices is missing!");
        setTimeout(() => {
            nextStage(sock, state.groq, chatId).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
        }, GAME_CONFIG.BREAK_TIME);
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
            nextStage(sock, state.groq, chatId).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
        }, GAME_CONFIG.BREAK_TIME);
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
        if (state.players.every(p => p.isDead)) return endAdventure(sock, chatId, false);
    }
    
    state.votes = {};
    state.voteProcessing = false;
    setTimeout(() => {
        nextStage(sock, state.groq, chatId).catch(e => console.error("[Quest] nextStage error:", e?.message || e));
    }, GAME_CONFIG.BREAK_TIME);
}

async function endAdventure(sock, chatId, victory = true) {
    const state = getGameState(chatId);
    if (!state) return;
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
    msg += `💎 Treasures Found: ${state.stats.treasuresFound}\n\n`;
    msg += `🏆 *INDIVIDUAL REWARDS:*\n\n`;
    
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
}

// ==========================================
// 🛒 SHOP SYSTEM
// ==========================================

const handleBuy = (chatId, senderJid, itemIndex) => {
    const state = getGameState(chatId);
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
        item.items.forEach(subKey => {
            const subInfo = lootSystem.getItemInfo(subKey);
            inventorySystem.addItem(senderJid, subKey, 1, {
                name: subInfo.name,
                value: subInfo.value,
                rarity: subInfo.rarity || 'COMMON',
                source: 'QUEST_SHOP_BUNDLE'
            });
        });
        return `✅ Purchased bundle ${item.icon} *${item.name}*! Items added to bag.`;
    }
    
    // Get item info from loot database for persistence
    const itemInfo = lootSystem.getItemInfo(itemKey);
    
    inventorySystem.addItem(senderJid, itemKey, 1, { 
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
    const state = getGameState(chatId);
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
    
    if (actionType === 'attack' && target !== undefined) {
        const targetIndex = parseInt(target) - 1;
        if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= state.enemies.length) {
            return "❌ Invalid target!";
        }
        action.targetIndex = targetIndex;
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
    await performAction(sock, player, action, chatId);
    
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
                    const energyCost = skill.cost || (Array.isArray(skill.energyCost) ? skill.energyCost[0] : skill.energyCost) || 0;
                    
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
    const state = getGameState(chatId);
    if (!state) return;
    const icon = player.class?.icon || '👤';
    let msg = `${icon} ${player.name} uses ${ability.animation} *${ability.name}*!\n\n`;
    let totalDamage = 0;
    let totalHealing = 0;
    
    // DAMAGE ABILITIES
    if (effect.type === 'damage' || effect.type.includes('damage')) {
        const targets = getTargets(effect, targetIndex, chatId);
        
        for (const target of targets) {
            if (target.stats.hp <= 0) continue;
            
            let baseDamage;
            if (effect.damageType === 'magic') {
                baseDamage = player.stats.mag || player.stats.atk;
            } else {
                baseDamage = player.stats.atk;
            }
            
            // Apply multiplier
            let damage = Math.floor(baseDamage * effect.multiplier);
            
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
            }
            
            // Apply DoT (Damage over Time)
            if (effect.dot) {
                applyStatusEffect(target, effect.dot, effect.dotDuration, effect.dotDamage);
                msg += `🔥 Applied ${effect.dot}!\n`;
            }
            
            // Apply CC (Crowd Control)
            if (effect.cc && Math.random() * 100 < (effect.ccChance || 100)) {
                applyStatusEffect(target, effect.cc, effect.ccDuration, 0);
                msg += `💫 Applied ${effect.cc}!\n`;
            }
        }
        
        player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + totalDamage;
    }
    
    // AOE ABILITIES
    if (effect.type === 'aoe') {
        const enemies = state.enemies.filter(e => e.stats.hp > 0);
        const numTargets = Math.min(effect.targets || 99, enemies.length);
        
        for (let i = 0; i < numTargets; i++) {
            const target = enemies[i];
            if (!target) continue;
            
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
            
            if (target.stats.hp <= 0) {
                target.justDied = true;
            }
            
            msg += `💥 ${target.icon} ${target.name} takes ${damage} damage!`;
            if (isCrit) msg += ` 💥 *CRITICAL HIT!*`;
            msg += `\n`;

            // Apply DoT (Damage over Time)
            if (effect.dot) {
                applyStatusEffect(target, effect.dot, effect.dotDuration, effect.dotDamage);
                msg += `🔥 Applied ${effect.dot} to ${target.name}!\n`;
            }
            
            // Apply CC (Crowd Control)
            if (effect.cc && Math.random() * 100 < (effect.ccChance || 100)) {
                applyStatusEffect(target, effect.cc, effect.ccDuration, 0);
                msg += `💫 Applied ${effect.cc} to ${target.name}!\n`;
            }

            // Apply Specific Debuffs (Slow, etc found in keys)
            ['slow', 'stun', 'freeze', 'burn', 'shock', 'poison'].forEach(debuff => {
                 if (effect[debuff] !== undefined) {
                     // Check if it's a value or object, though flattening makes it a value usually
                     const val = effect[debuff];
                     const dur = effect[debuff + 'Duration'] || 2;
                     applyStatusEffect(target, debuff, dur, val);
                     msg += `📉 Applied ${debuff} to ${target.name}!\n`;
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
            }
        }
        player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + totalDamage;
    }
    
    // HEALING ABILITIES
    if (effect.type === 'heal' || effect.type.includes('heal')) {
        const target = getHealTarget(player, targetIndex, chatId);
        if (target) {
            const healAmount = Math.min(effect.value, target.stats.maxHp - target.stats.hp);
            target.stats.hp += healAmount;
            target.currentHP = target.stats.hp; 
            totalHealing += healAmount;
            
            const targetIcon = target.class?.icon || '👤';
            msg += `💚 ${targetIcon} ${target.name} healed for ${healAmount} HP!\n`;
            player.combatStats.healed = (player.combatStats.healed || 0) + healAmount;
        }
    }
    
    // TEAM HEAL
    if (effect.type === 'heal_team') {
        const allies = state.players.filter(p => !p.isDead);
        for (const ally of allies) {
            const healAmount = Math.min(effect.value, ally.stats.maxHp - ally.stats.hp);
            ally.stats.hp += healAmount;
            ally.currentHP = ally.stats.hp; 
            totalHealing += healAmount;
            
            const allyIcon = ally.class?.icon || '👤';
            msg += `💚 ${allyIcon} ${ally.name} +${healAmount} HP\n`;
        }
        player.combatStats.healed = (player.combatStats.healed || 0) + totalHealing;
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
            const allies = state.players.filter(p => !p.isDead);
            for (const ally of allies) {
                applyBuff(ally, effect.buffType, effect.value, effect.duration);
            }
            msg += `✨ Team gains +${effect.value}% ${effect.buffType} for ${effect.duration} turns!\n`;
        } else if (effect.type === 'buff_target') {
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
            const target = getTargets(effect, targetIndex)[0];
            if (target) {
                applyDebuff(target, effect.debuffType, effect.value, effect.duration);
                msg += `💀 ${target.name} receives -${effect.value}% ${effect.debuffType}!\n`;
            }
        } else if (effect.type === 'debuff_enemies') {
            const enemies = state.enemies.filter(e => e.stats.hp > 0);
            for (const enemy of enemies) {
                applyDebuff(enemy, effect.debuffType, effect.value, effect.duration);
            }
            msg += `💀 All enemies receive -${effect.value}% ${effect.debuffType}!\n`;
        }
    }
    
    // REVIVE
    if (effect.type === 'revive') {
        const deadAllies = state.players.filter(p => p.isDead);
        if (deadAllies.length > 0) {
            const target = deadAllies[0]; 
            target.isDead = false;
            target.stats.hp = Math.floor(target.stats.maxHp * ((effect.hpPercent || 50) / 100));
            target.currentHP = target.stats.hp;
            msg += `👼 ${target.name} has been resurrected with ${target.stats.hp} HP!\n`;
            player.combatStats.healed = (player.combatStats.healed || 0) + target.stats.hp;
        } else {
            msg += `(No fallen allies to revive)\n`;
        }
    }

    // MULTI-HIT
    if (effect.type === 'multi_hit') {
        const target = getTargets(effect, targetIndex, chatId)[0];
        if (target) {
            let totalMultiDamage = 0;
            for (let i = 0; i < effect.hits; i++) {
                const { damage, isCrit, wasEvaded } = calculateDamage(player, target, player.stats.atk * effect.multiplier);
                if (!wasEvaded) {
                    target.stats.hp -= damage;
                    totalMultiDamage += damage;
                }
            }
            target.currentHP = Math.max(0, target.stats.hp); 
            
            if (target.stats.hp <= 0) {
                target.justDied = true;
            }
            
            msg += `⚡ Hit ${effect.hits} times for ${totalMultiDamage} total damage!\n`;
            player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + totalMultiDamage;
            
            if (target.stats.hp <= 0) {
                msg += `💀 ${target.name} defeated!\n`;
                target.isDead = true;
                target.currentHP = 0;
            }
        }
    }

    return { message: msg, damage: totalDamage, healing: totalHealing };
}

// ==========================================
// 🎯 TARGET SELECTION HELPERS
// ==========================================

function getTargets(effect, targetIndex, chatId) {
    const state = getGameState(chatId);
    if (!state) return [];
    const enemies = state.enemies.filter(e => e.stats.hp > 0);
    
    if (effect.type === 'aoe') {
        return enemies.slice(0, effect.targets || 99);
    }
    
    const index = parseInt(targetIndex) - 1;
    const target = enemies[index];
    
    if (!target) {
        // Default to first enemy if invalid target
        return enemies.length > 0 ? [enemies[0]] : [];
    }
    
    return [target];
}

function getHealTarget(player, targetIndex, chatId) {
    const state = getGameState(chatId);
    if (!state) return player;
    const allies = state.players.filter(p => !p.isDead);
    
    if (!targetIndex) {
        return player; // Self by default
    }
    
    const index = parseInt(targetIndex) - 1;
    return allies[index] || player;
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
        const state = getGameState(chatId);
        if (!state) return "❌ No active adventure!";
        if (state.phase !== 'PLAYING' || state.inCombat || state.voteProcessing) {
            return "❌ Not voting time or already processing.";
        }
        if (!state.players.find(p => p.jid === jid)) {
            return "❌ Not in party.";
        }
        state.votes[jid] = vote;
        
        // Set flag for next timer adjustment (group only)
        if (!state.solo) {
            state.actionJustTaken = true;
        }
        
        // Check if all players have voted
        const allVoted = state.players.every(p => state.votes[p.jid]);
        
        if (allVoted && state.isBranching) {
            clearTimeout(state.timers.vote);
            const sock = state.sock;
            setTimeout(() => {
                const v1 = Object.values(state.votes).filter(v => v === '1').length;
                const v2 = Object.values(state.votes).filter(v => v === '2').length;
                const winner = v2 > v1 ? 'REST' : 'ELITE_COMBAT';
                state.isProcessing = false;
                state.isBranching = false;
                processBranchChoice(sock, winner, chatId).catch(e => console.error("[Quest] processBranchChoice error:", e?.message || e));
            }, 1000);
            return `🗳️ All votes in! Branching to *${Object.values(state.votes).filter(v => v === '2').length > Object.values(state.votes).filter(v => v === '1').length ? 'Safe Path' : 'Danger Path'}*...`;
        }

        if (allVoted && state.currentEncounter && !state.isBranching) {
            // All players voted - process immediately
            const currentEnc = state.currentEncounter; // Capture to prevent race conditions
            state.voteProcessing = true;
            clearTimeout(state.timers.vote);
            
            // Use setTimeout to avoid blocking
            const sock = state.sock;
            setTimeout(() => {
                processVotes(sock, currentEnc, chatId).catch(e => console.error("[Quest] processVotes error:", e?.message || e));
            }, state.solo ? 1000 : 2000); // 1s for solo, 2s for group
            
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
