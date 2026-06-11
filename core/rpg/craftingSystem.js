// ============================================ 
// 🛠️ ADVANCED CRAFTING & BREWING SYSTEM 
// ============================================ 
// Allows players to create gear, potions, and explosives from materials

const inventorySystem = require('./inventorySystem');
const economy = require('./economy');
const lootSystem = require('./lootSystem');

// ========================================== 
// 📜 CRAFTING RECIPES (Forging & Engineering) 
// ========================================== 

const CRAFTING_RECIPES = {
    // --- WEAPONS ---
    'steel_sabre': {
        name: 'Steel Sabre', category: 'WEAPON', id: 'steel_sabre',
        desc: 'A sharp, finely forged blade. (+25 ATK, +5 SPD)',
        ingredients: { 'iron_sword': 1, 'refined_steel': 3, 'sharp_whetstone': 1 },
        result: { id: 'steel_sabre', stats: { atk: 25, spd: 5 }, slot: 'weapon' }
    },
    'mythril_staff': {
        name: 'Mythril Staff', category: 'WEAPON', id: 'mythril_staff',
        desc: 'A staff made of rare mythril that amplifies magic. (+40 MAG, +10 HP)',
        ingredients: { 'arcane_wand': 1, 'mythril_ore': 5, 'mana_crystal': 2 },
        result: { id: 'mythril_staff', stats: { mag: 40, hp: 10 }, slot: 'weapon' }
    },
    'inferno_blade': {
        name: 'Inferno Blade', category: 'WEAPON', id: 'inferno_blade',
        desc: 'A sword that burns with divine fire. (+35 ATK, +15% Crit)',
        ingredients: { 'steel_sabre': 1, 'fire_shard': 3, 'fire_essence': 2 },
        result: { id: 'inferno_blade', stats: { atk: 35, crit: 15 }, slot: 'weapon' }
    },
    'volt_dagger': {
        name: 'Volt Dagger', category: 'WEAPON', id: 'volt_dagger',
        desc: 'Fast as lightning. (+20 ATK, +25 SPD)',
        ingredients: { 'iron_sword': 1, 'lightning_shard': 3, 'refined_steel': 2 },
        result: { id: 'volt_dagger', stats: { atk: 20, spd: 25 }, slot: 'weapon' }
    },
    'dragonslayer_spear': {
        name: 'Dragonslayer Spear', category: 'WEAPON', id: 'dragonslayer_spear',
        desc: 'The ultimate boss-killing tool. (+50 ATK)',
        ingredients: { 'steel_sabre': 1, 'dragon_blood': 1, 'dragon_scale': 5 },
        result: { id: 'dragonslayer_spear', stats: { atk: 50 }, slot: 'weapon' }
    },
    'shadow_dagger': {
        name: 'Shadow Dagger', category: 'WEAPON', id: 'shadow_dagger',
        desc: 'A blade that thirsts for blood. (+30 ATK, +15 SPD)',
        ingredients: { 'rusty_dagger': 1, 'dark_matter': 1, 'sharp_whetstone': 2 },
        result: { id: 'shadow_dagger', stats: { atk: 30, spd: 15 }, slot: 'weapon' }
    },
    'warhammer': {
        name: 'Paladin Warhammer', category: 'WEAPON', id: 'warhammer',
        desc: 'Heavy and blessed. (+35 ATK, +10 DEF)',
        ingredients: { 'iron_sword': 1, 'refined_steel': 5, 'mana_crystal': 1 },
        result: { id: 'warhammer', stats: { atk: 35, def: 10 }, slot: 'weapon' }
    },
    'death_scythe': {
        name: 'Reaper Scythe', category: 'WEAPON', id: 'death_scythe',
        desc: 'Harvests the souls of the living. (+45 ATK, +20 MAG)',
        ingredients: { 'mythril_staff': 1, 'dark_matter': 2, 'ghost_essence': 5 },
        result: { id: 'death_scythe', stats: { atk: 45, mag: 20 }, slot: 'weapon' }
    },
    'chrono_blade': {
        name: 'Chrono Blade', category: 'WEAPON', id: 'chrono_blade',
        desc: 'A sword that exists in multiple timelines. (+25 ATK, +40 SPD)',
        ingredients: { 'steel_sabre': 1, 'mana_dew': 5, 'mana_crystal': 3 },
        result: { id: 'chrono_blade', stats: { atk: 25, spd: 40 }, slot: 'weapon' }
    },
    'golden_cane': {
        name: 'Merchant Cane', category: 'WEAPON', id: 'golden_cane',
        desc: 'Wealth is power. (+20 ATK, +50 LUCK)',
        ingredients: { 'iron_sword': 1, 'gold_pile': 1000, 'rare_gem': 2 },
        result: { id: 'golden_cane', stats: { atk: 20, luck: 50 }, slot: 'weapon' }
    },
    'multi_tool': {
        name: 'Artificer Tool', category: 'WEAPON', id: 'multi_tool',
        desc: 'A gadget for every situation. (+25 ATK, +25 MAG, +10 DEF)',
        ingredients: { 'iron_shard': 20, 'gunpowder': 10, 'refined_steel': 5 },
        result: { id: 'multi_tool', stats: { atk: 25, mag: 25, def: 10 }, slot: 'weapon' }
    },
    'greataxe': {
        name: 'Berserker Axe', category: 'WEAPON', id: 'greataxe',
        desc: 'Pure, unadulterated rage. (+55 ATK, -10 DEF)',
        ingredients: { 'refined_steel': 10, 'dragon_blood': 1, 'tough_leather': 5 },
        result: { id: 'greataxe', stats: { atk: 55, def: -10 }, slot: 'weapon' }
    },
    'elemental_wand': {
        name: 'Prism Wand', category: 'WEAPON', id: 'elemental_wand',
        desc: 'Channels the four elements. (+50 MAG)',
        ingredients: { 'arcane_wand': 1, 'fire_shard': 2, 'ice_shard': 2, 'lightning_shard': 2 },
        result: { id: 'elemental_wand', stats: { mag: 50 }, slot: 'weapon' }
    },
    'storm_bow': {
        name: 'Storm Bow', category: 'WEAPON', id: 'storm_bow',
        desc: 'Shoots arrows of pure lightning. (+40 ATK, +20 SPD)',
        ingredients: { 'ancient_wood': 5, 'lightning_shard': 5, 'mystic_thread': 5 },
        result: { id: 'storm_bow', stats: { atk: 40, spd: 20 }, slot: 'weapon' }
    },

    // --- ARMOR ---
    'reinforced_plate': {
        name: 'Reinforced Plate', category: 'ARMOR', id: 'reinforced_plate',
        desc: 'Heavy plate armor reinforced with steel. (+45 DEF, +50 HP)',
        ingredients: { 'plate_armor': 1, 'refined_steel': 5, 'tough_leather': 2 },
        result: { id: 'reinforced_plate', stats: { def: 45, hp: 50 }, slot: 'armor' }
    },
    'stealth_garb': {
        name: 'Stealth Garb', category: 'ARMOR', id: 'stealth_garb',
        desc: 'Quiet and lightweight. (+15 DEF, +30 SPD)',
        ingredients: { 'leather_tunic': 1, 'spider_silk': 10, 'tough_leather': 3 },
        result: { id: 'stealth_garb', stats: { def: 15, spd: 30 }, slot: 'armor' }
    },
    'holy_raiment': {
        name: 'Holy Raiment', category: 'ARMOR', id: 'holy_raiment',
        desc: 'Blessed by the divine. (+25 DEF, +40 MAG)',
        ingredients: { 'leather_tunic': 1, 'mystic_thread': 10, 'mana_dew': 2 },
        result: { id: 'holy_raiment', stats: { def: 25, mag: 40 }, slot: 'armor' }
    },
    'dragon_plate': {
        name: 'Dragon Armor', category: 'ARMOR', id: 'dragon_plate',
        desc: 'Forged from dragon scales. (+60 DEF, +100 HP)',
        ingredients: { 'reinforced_plate': 1, 'dragon_scale': 10, 'dragon_blood': 2 },
        result: { id: 'dragon_plate', stats: { def: 60, hp: 100 }, slot: 'armor' }
    },
    'archmage_robes': {
        name: 'Archmage Robes', category: 'ARMOR', id: 'archmage_robes',
        desc: 'The pinnacle of wizardry. (+20 DEF, +80 MAG)',
        ingredients: { 'holy_raiment': 1, 'legendary_shard': 1, 'mana_crystal': 10 },
        result: { id: 'archmage_robes', stats: { def: 20, mag: 80 }, slot: 'armor' }
    },

    // --- HELMETS ---
    'iron_helm': {
        name: 'Iron Helmet', category: 'ARMOR', id: 'iron_helm',
        desc: 'Basic protection. (+10 DEF)',
        ingredients: { 'iron_shard': 10, 'refined_steel': 1 },
        result: { id: 'iron_helm', stats: { def: 10 }, slot: 'helmet' }
    },
    'wizard_hat': {
        name: 'Wizard Hat', category: 'ARMOR', id: 'wizard_hat',
        desc: 'Classic pointy hat. (+15 MAG)',
        ingredients: { 'spider_silk': 5, 'mana_crystal': 1 },
        result: { id: 'wizard_hat', stats: { mag: 15 }, slot: 'helmet' }
    },
    'assassin_hood': {
        name: 'Shadow Hood', category: 'ARMOR', id: 'assassin_hood',
        desc: 'Hides your face. (+5 DEF, +10 SPD, +5% Crit)',
        ingredients: { 'spider_silk': 5, 'dark_matter': 1 },
        result: { id: 'assassin_hood', stats: { def: 5, spd: 10, crit: 5 }, slot: 'helmet' }
    },

    // --- BOOTS ---
    'leather_boots': {
        name: 'Leather Boots', category: 'ARMOR', id: 'leather_boots',
        desc: 'Simple walking boots. (+5 SPD)',
        ingredients: { 'tough_leather': 3 },
        result: { id: 'leather_boots', stats: { spd: 5 }, slot: 'boots' }
    },
    'winged_sandals': {
        name: 'Winged Sandals', category: 'ARMOR', id: 'winged_sandals',
        desc: 'Feel as light as a feather. (+40 SPD)',
        ingredients: { 'leather_boots': 1, 'mana_dew': 3, 'mystic_thread': 5 },
        result: { id: 'winged_sandals', stats: { spd: 40 }, slot: 'boots' }
    },

    // --- ACCESSORIES ---
    'health_pendant': {
        name: 'Vitality Amulet', category: 'ACCESSORY', id: 'health_pendant',
        desc: 'Increases max health. (+50 HP)',
        ingredients: { 'iron_shard': 5, 'healing_herb': 10 },
        result: { id: 'health_pendant', stats: { hp: 50 }, slot: 'amulet' }
    },
    'power_ring': {
        name: 'Ring of Might', category: 'ACCESSORY', id: 'power_ring',
        desc: 'Increases physical power. (+15 ATK)',
        ingredients: { 'iron_shard': 5, 'refined_steel': 2, 'fire_shard': 1 },
        result: { id: 'power_ring', stats: { atk: 15 }, slot: 'ring' }
    },
    'glacier_guard': {
        name: 'Glacier Guard', category: 'ARMOR', id: 'glacier_guard',
        desc: 'Armor that chills attackers. (+50 DEF, +80 HP)',
        ingredients: { 'reinforced_plate': 1, 'ice_shard': 5, 'mana_dew': 2 },
        result: { id: 'glacier_guard', stats: { def: 50, hp: 80 }, slot: 'armor' }
    },
    'obsidian_shield': {
        name: 'Obsidian Shield', category: 'ARMOR', id: 'obsidian_shield',
        desc: 'A heavy shield of black glass. (+60 DEF)',
        ingredients: { 'obsidian_chunk': 5, 'refined_steel': 3, 'tough_leather': 2 },
        result: { id: 'obsidian_shield', stats: { def: 60 }, slot: 'armor' }
    },
    'titan_gauntlets': {
        name: 'Titan Gauntlets', category: 'ARMOR', id: 'titan_gauntlets',
        desc: 'Grants the strength of a titan. (+30 ATK, +20 DEF)',
        ingredients: { 'refined_steel': 10, 'boss_essence': 2, 'tough_leather': 5 },
        result: { id: 'titan_gauntlets', stats: { atk: 30, def: 20 }, slot: 'gloves' }
    },

    // --- ACCESSORIES & CLOTHING ---
    'silk_cloak': {
        name: 'Silk Cloak', category: 'CLOTHING', id: 'silk_cloak',
        desc: 'Lightweight and elegant. (+30 SPD, +15 LUCK)',
        ingredients: { 'spider_silk': 10, 'mystic_thread': 5, 'healing_herb': 2 },
        result: { id: 'silk_cloak', stats: { spd: 30, luck: 15 }, slot: 'cloak' }
    },
    'ghost_pendant': {
        name: 'Ghost Pendant', category: 'ACCESSORY', id: 'ghost_pendant',
        desc: 'Pulsing with ethereal energy. (+45 MAG)',
        ingredients: { 'ghost_essence': 5, 'silver_ore': 2, 'mana_crystal': 1 },
        result: { id: 'ghost_pendant', stats: { mag: 45 }, slot: 'amulet' }
    },
    'vampiric_ring': {
        name: 'Vampiric Ring', category: 'ACCESSORY', id: 'vampiric_ring',
        desc: 'Drains life from your foes. (+15 ATK, +10% Lifesteal)',
        ingredients: { 'gold_ore': 3, 'dragon_blood': 1, 'ghost_essence': 2 },
        result: { id: 'vampiric_ring', stats: { atk: 15 }, slot: 'ring' }
    },
    'wind_boots': {
        name: 'Wind Boots', category: 'CLOTHING', id: 'wind_boots',
        desc: 'Walk on the air itself. (+50 SPD)',
        ingredients: { 'tough_leather': 5, 'mystic_thread': 5, 'mana_dew': 2 },
        result: { id: 'wind_boots', stats: { spd: 50 }, slot: 'boots' }
    },

    // --- ENGINEERING / BOMBS ---
    'fire_bomb': {
        name: 'Fire Bomb', category: 'ENGINEERING', id: 'fire_bomb',
        desc: 'Deals 150 fire damage to all enemies.',
        ingredients: { 'gunpowder': 2, 'iron_shard': 1, 'fire_essence': 1 },
        result: { id: 'fire_bomb', usable: true, effect: 'aoe_damage', effectValue: 150 }
    },
    'void_grenade': {
        name: 'Void Grenade', category: 'ENGINEERING', id: 'void_grenade',
        desc: 'Deals 300 damage and reduces enemy DEF.',
        ingredients: { 'gunpowder': 5, 'void_crystal': 2, 'dark_matter': 1 },
        result: { id: 'void_grenade', usable: true, effect: 'aoe_debuff_damage', effectValue: 300 }
    },
    'cursed_bomb': {
        name: 'Cursed Bomb', category: 'ENGINEERING', id: 'cursed_bomb',
        desc: 'Deals 200 damage and reduces enemy SPD by 50%.',
        ingredients: { 'gunpowder': 3, 'ghost_essence': 2, 'iron_shard': 5 },
        result: { id: 'cursed_bomb', usable: true, effect: 'aoe_slow_damage', effectValue: 200 }
    },
    'smoke_screen': {
        name: 'Smoke Screen', category: 'ENGINEERING', id: 'smoke_screen',
        desc: 'Increases party evasion by 50% for 2 turns.',
        ingredients: { 'gunpowder': 1, 'healing_herb': 5, 'spider_silk': 2 },
        result: { id: 'smoke_screen', usable: true, effect: 'evasion_buff' }
    },

    // --- EVOLUTION ---
    'evolution_stone': {
        name: 'Evolution Stone (T2)', category: 'EVOLUTION', id: 'evolution_stone',
        desc: 'Used to evolve from Starter to Evolved class.',
        ingredients: { 'mana_crystal': 5, 'boss_essence': 1, 'rare_gem': 2 },
        result: { id: 'evolution_stone', type: 'EVOLUTION' }
    },
    'ascension_stone': {
        name: 'Ascension Stone (T3)', category: 'EVOLUTION', id: 'ascension_stone',
        desc: 'Used to ascend from Evolved to Ascended class.',
        ingredients: { 'legendary_shard': 1, 'void_crystal': 3, 'boss_essence': 5 },
        result: { id: 'ascension_stone', type: 'ASCENSION' }
    },

    // --- MATERIAL CONVERSION ---
    'refined_steel_conv': {
        name: 'Refined Steel', category: 'CRAFT', id: 'refined_steel',
        desc: 'Refine 3 iron shards into a steel bar.',
        ingredients: { 'iron_shard': 3 },
        result: { id: 'refined_steel' }
    },
    'mythril_ore_conv': {
        name: 'Mythril Ore', category: 'CRAFT', id: 'mythril_ore',
        desc: 'Compress 3 refined steel with fire essence.',
        ingredients: { 'refined_steel': 3, 'fire_essence': 1 },
        result: { id: 'mythril_ore' }
    },
    'mana_crystal_conv': {
        name: 'Mana Crystal', category: 'CRAFT', id: 'mana_crystal',
        desc: 'Crystallize 3 mana dews.',
        ingredients: { 'mana_dew': 3 },
        result: { id: 'mana_crystal' }
    },
    'dark_matter_conv': {
        name: 'Dark Matter', category: 'CRAFT', id: 'dark_matter',
        desc: 'Condense 3 void crystals.',
        ingredients: { 'void_crystal': 3 },
        result: { id: 'dark_matter' }
    },
    'legendary_shard_conv': {
        name: 'Legendary Shard', category: 'CRAFT', id: 'legendary_shard',
        desc: 'Fuse 3 dark matters with boss essence.',
        ingredients: { 'dark_matter': 3, 'boss_essence': 1 },
        result: { id: 'legendary_shard' }
    }
};

const BREWING_RECIPES = {
    'mega_potion': {
        name: 'Mega Health Potion', id: 'mega_potion', category: 'BREWING',
        desc: 'A powerful brew that restores 250 HP.',
        ingredients: { 'major_potion': 2, 'healing_herb': 3, 'mana_dew': 1 },
        result: { id: 'mega_potion', usable: true, effect: 'heal', effectValue: 250 }
    },
    'elixir_of_power': {
        name: 'Elixir of Power', id: 'elixir_of_power', category: 'BREWING',
        desc: 'Boosts ATK and MAG by 50% for 5 turns.',
        ingredients: { 'strength_brew': 1, 'rare_gem': 1, 'dragon_blood': 1 },
        result: { id: 'elixir_of_power', usable: true, effect: 'buff_all', effectValue: 50, duration: 5 }
    },
    'liquid_courage': {
        name: 'Liquid Courage', id: 'liquid_courage', category: 'BREWING',
        desc: 'Grants a massive temporary shield.',
        ingredients: { 'minor_potion': 5, 'tough_leather': 3, 'boss_essence': 1 },
        result: { id: 'liquid_courage', usable: true, effect: 'shield_max', effectValue: 100 }
    },
    'energy_brew': {
        name: 'Energy Brew', id: 'energy_brew', category: 'BREWING',
        desc: 'Instantly restores 50 Energy.',
        ingredients: { 'mana_crystal': 1, 'mana_dew': 2, 'healing_herb': 2 },
        result: { id: 'energy_brew', usable: true, effect: 'restore_energy', effectValue: 50 }
    },
    'holy_water': {
        name: 'Holy Water', id: 'holy_water', category: 'BREWING',
        desc: 'Cleanses all debuffs and heals 100 HP.',
        ingredients: { 'mana_dew': 3, 'mana_crystal': 1, 'healing_herb': 5 },
        result: { id: 'holy_water', usable: true, effect: 'cleanse_heal', effectValue: 100 }
    },
    'rabbit_foot': {
        name: 'Rabbit Foot', id: 'rabbit_foot', category: 'BREWING',
        desc: 'Permanent luck boost. (+10 LUCK)',
        ingredients: { 'tough_leather': 1, 'mystic_thread': 2, 'rare_gem': 1 },
        result: { id: 'rabbit_foot', type: 'STAT_BOOST', boost: { stat: 'luck', value: 10 } }
    },
    'chaos_elixir': {
        name: 'Chaos Elixir', id: 'chaos_elixir', category: 'BREWING',
        desc: 'High chance for a massive random buff.',
        ingredients: { 'dark_matter': 1, 'dragon_blood': 1, 'mana_crystal': 5 },
        result: { id: 'chaos_elixir', usable: true, effect: 'random_major_buff' }
    },
    'fortress_potion': {
        name: 'Fortress Potion', id: 'fortress_potion', category: 'BREWING',
        desc: 'Grants an invincible shield for 1 turn.',
        ingredients: { 'obsidian_chunk': 2, 'refined_steel': 5, 'boss_essence': 1 },
        result: { id: 'fortress_potion', usable: true, effect: 'invincibility' }
    }
};

const COOKING_RECIPES = {
    'grilled_meat': {
        name: 'Grilled Meat', id: 'grilled_meat', category: 'COOKING',
        desc: 'Deliciously charred. (+10 ATK for 3 turns)',
        ingredients: { 'rabbit_hide': 2, 'healing_herb': 1 }, // Simulating meat with hide for now
        result: { id: 'grilled_meat', usable: true, effect: 'buff_atk', effectValue: 10, duration: 3 }
    },
    'mana_stew': {
        name: 'Mana Stew', id: 'mana_stew', category: 'COOKING',
        desc: 'A glowing broth. (+10 MAG for 3 turns)',
        ingredients: { 'mana_dew': 2, 'healing_herb': 2 },
        result: { id: 'mana_stew', usable: true, effect: 'buff_mag', effectValue: 10, duration: 3 }
    },
    'speed_soup': {
        name: 'Speed Soup', id: 'speed_soup', category: 'COOKING',
        desc: 'Light and zesty. (+10 SPD for 3 turns)',
        ingredients: { 'common_fish': 2, 'healing_herb': 1 },
        result: { id: 'speed_soup', usable: true, effect: 'buff_spd', effectValue: 10, duration: 3 }
    },
    'lucky_salad': {
        name: 'Lucky Salad', id: 'lucky_salad', category: 'COOKING',
        desc: 'Full of 4-leaf clovers. (+10 LUCK for 3 turns)',
        ingredients: { 'healing_herb': 5 },
        result: { id: 'lucky_salad', usable: true, effect: 'buff_luck', effectValue: 10, duration: 3 }
    }
};

// ==========================================
// ⛏️ MINING LOCATIONS
// ==========================================

const MINING_LOCATIONS = {
    'shimmering_caves': {
        name: 'Shimmering Caves',
        id: 'shimmering_caves',
        desc: 'A shallow cave system perfect for beginners.',
        req: { level: 1, rank: 'F', miningLevel: 1 },
        energyCost: 15,
        ores: [
            { id: 'iron_shard', weight: 60, min: 2, max: 5 },
            { id: 'silver_ore', weight: 30, min: 1, max: 2 },
            { id: 'gold_ore', weight: 10, min: 1, max: 1 }
        ]
    },
    'deep_vein_shafts': {
        name: 'Deep Vein Shafts',
        id: 'deep_vein_shafts',
        desc: 'Darker, deeper tunnels where precious metals congregate.',
        req: { level: 15, rank: 'D', miningLevel: 5 },
        energyCost: 25,
        ores: [
            { id: 'silver_ore', weight: 40, min: 2, max: 4 },
            { id: 'gold_ore', weight: 30, min: 1, max: 3 },
            { id: 'mythril_ore', weight: 20, min: 1, max: 2 },
            { id: 'obsidian_chunk', weight: 10, min: 1, max: 1 }
        ]
    },
    'volcanic_hollow': {
        name: 'Volcanic Hollow',
        id: 'volcanic_hollow',
        desc: 'Extreme heat melts the rock, revealing rare obsidian and diamonds.',
        req: { level: 30, rank: 'B', miningLevel: 15 },
        energyCost: 40,
        ores: [
            { id: 'gold_ore', weight: 20, min: 2, max: 5 },
            { id: 'obsidian_chunk', weight: 40, min: 2, max: 4 },
            { id: 'diamond_shard', weight: 25, min: 1, max: 2 },
            { id: 'fire_shard', weight: 15, quantity: 1 }
        ]
    },
    'void_fissure': {
        name: 'Void Fissure',
        id: 'void_fissure',
        desc: 'A tear in reality where dark matter and mana crystals crystallize.',
        req: { level: 50, rank: 'S', miningLevel: 30 },
        energyCost: 60,
        ores: [
            { id: 'mana_crystal', weight: 40, min: 2, max: 4 },
            { id: 'dark_matter', weight: 30, min: 1, max: 2 },
            { id: 'mythril_ore', weight: 20, min: 3, max: 6 },
            { id: 'legendary_shard', weight: 10, quantity: 1 }
        ]
    }
};

// ==========================================
// 🛠️ SYSTEM FUNCTIONS
// ==========================================

function getRecipes() {
    return { ...CRAFTING_RECIPES, ...BREWING_RECIPES, ...COOKING_RECIPES };
}

function getMiningLocations() {
    return MINING_LOCATIONS;
}
function getRecipeById(id) {
    const all = getRecipes();
    return all[id] || null;
}

function canCraft(userId, recipeId) {
    const recipe = getRecipeById(recipeId);
    if (!recipe) return { canCraft: false, reason: 'Recipe not found.' };

    const inventory = inventorySystem.getInventory(userId);
    if (!inventory) return { canCraft: false, reason: 'Inventory not found. Please register first!' };
    const missing = [];

    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        const has = inventory[ingId] ? (typeof inventory[ingId] === 'number' ? inventory[ingId] : (inventory[ingId].quantity || 0)) : 0;
        if (has < qty) {
            const itemInfo = lootSystem.getItemInfo(ingId);
            missing.push(`${itemInfo.name} (${has}/${qty})`);
        }
    }

    if (missing.length > 0) {
        return { 
            canCraft: false, 
            reason: `Missing ingredients:\n- ${missing.join('\n- ')}` 
        };
    }

    return { canCraft: true, recipe };
}

async function performCraft(userId, recipeId, requiredStation = 'CRAFT') {
    const check = canCraft(userId, recipeId);
    if (!check.canCraft) return { success: false, message: check.reason };

    const recipe = check.recipe;
    const resultItem = recipe.result;

    // Enforce Station Type
    const STATION_CATEGORIES = {
        'FORGE': ['WEAPON', 'ARMOR'],
        'BREWING': ['BREWING'],
        'COOKING': ['COOKING'],
        'CRAFT': ['CRAFT', 'ACCESSORY', 'CLOTHING', 'ENGINEERING', 'EVOLUTION']
    };
    const allowedCategories = STATION_CATEGORIES[requiredStation] || [];
    if (!allowedCategories.includes(recipe.category)) {
        let stationName = "General Crafting Table";
        if (recipe.category === 'BREWING') stationName = "Laboratory";
        if (recipe.category === 'COOKING') stationName = "Kitchen";
        if (recipe.category === 'WEAPON' || recipe.category === 'ARMOR') stationName = "Blacksmith Forge";
        
        return { success: false, message: `❌ This recipe requires a **${stationName}**!` };
    }

    // 💡 BUG FIX: Check for space before removing ingredients
    if (!inventorySystem.hasInventorySpace(userId, 1, resultItem.id)) {
        return { success: false, message: "❌ Cannot craft: Inventory full!" };
    }

    // 1. Remove ingredients
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        inventorySystem.removeItem(userId, ingId, qty);
    }

    // 2. Add result
    const addResult = await inventorySystem.addItem(userId, resultItem.id, 1, {
        name: recipe.name,
        stats: resultItem.stats || {},
        slot: resultItem.slot,
        type: resultItem.stats ? 'EQUIPMENT' : (resultItem.usable ? 'CONSUMABLE' : 'ITEM')
    });

    if (!addResult.success) {
        // Restore ingredients if addition failed
        for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
            await inventorySystem.addItem(userId, ingId, qty);
        }
        return addResult;
    }

    // 💡 GUILD BOARD TRACKING
    const guilds = require('./guilds');
    const userGuild = guilds.getUserGuild(userId);
    let guildMsg = "";
    if (userGuild) {
        guilds.updateBoardProgress(userGuild, 'CRAFT', 1);
        guildMsg = `\n🧪 *${userGuild}* Research Lab logged your creation! (+1 Craft Progress)`;
    }

    const typeLabel = recipe.category === 'COOKING' ? 'COOKING' : (recipe.category === 'BREWING' ? 'BREWING' : 'CRAFT');
    return { 
        success: true, 
        message: `⚒️ *${typeLabel} SUCCESSFUL: ${recipe.name}*\n\nYou created 1x ${recipe.name}!${guildMsg}` 
    };
}

async function dismantleItem(userId, itemId) {
    const inventory = inventorySystem.getInventory(userId);
    if (!inventory[itemId]) return { success: false, message: "Item not found in inventory." };

    const itemData = inventory[itemId];
    const recipe = Object.values(CRAFTING_RECIPES).find(r => r.result.id === itemId);
    
    if (!recipe) return { success: false, message: "This item cannot be dismantled." };

    // Calculate returned materials
    const returned = {};
    let totalItemsToReturn = 0;
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        const amount = Math.max(1, Math.floor(qty * 0.4));
        returned[ingId] = amount;
        totalItemsToReturn++;
    }

    // 💡 BUG FIX: Check for enough space for all materials
    if (!inventorySystem.hasInventorySpace(userId, totalItemsToReturn)) {
        return { success: false, message: "❌ Not enough inventory space to store recovered materials!" };
    }

    // Remove item
    inventorySystem.removeItem(userId, itemId, 1);

    // Return materials
    for (const [id, qty] of Object.entries(returned)) {
        await inventorySystem.addItem(userId, id, qty);
    }

    let msg = `♻️ *DISMANTLED: ${itemData.name || itemId}*\n\nRecovered materials:\n`;
    for (const [id, qty] of Object.entries(returned)) {
        msg += `- ${qty}x ${lootSystem.getItemInfo(id).name}\n`;
    }

    return { success: true, message: msg };
}


// --- PROGRAMMATICALLY ADDED EXTRAPOLATED RECIPES ---
Object.assign(CRAFTING_RECIPES, {
    "void_kraken_harpoon": {
        "name": "Void Kraken Harpoon",
        "category": "WEAPON",
        "id": "void_kraken_harpoon",
        "desc": "A terrifying weapon forged from an abyssal tentacle. It twists reality with every swing. (+110 ATK, +30 MAG, +15 CRIT)",
        "ingredients": {
            "mythic_fish": 4,
            "void_essence": 2,
            "mystic_thread": 5
        },
        "result": {
            "id": "void_kraken_harpoon",
            "stats": {
                "atk": 110,
                "mag": 30,
                "crit": 15
            },
            "slot": "weapon"
        }
    },
    "void_kraken_cleaver": {
        "name": "Void Kraken Cleaver",
        "category": "WEAPON",
        "id": "void_kraken_cleaver",
        "desc": "A colossal, heavy blade that looks like a frozen piece of the deep abyss. It slices through space itself. (+105 ATK, +20 MAG, +15 CRIT)",
        "ingredients": {
            "mythic_fish": 4,
            "void_essence": 1,
            "refined_steel": 8
        },
        "result": {
            "id": "void_kraken_cleaver",
            "stats": {
                "atk": 105,
                "mag": 20,
                "crit": 15
            },
            "slot": "weapon"
        }
    },
    "hellfire_greatmaul": {
        "name": "Hellfire Greatmaul",
        "category": "WEAPON",
        "id": "hellfire_greatmaul",
        "desc": "A massive hammer forged from active sulfur cores. Every impact triggers a tiny elemental explosion. (+120 ATK, +25 MAG, +10 CRIT)",
        "ingredients": {
            "infernal_crown": 1,
            "dragon_scale": 4,
            "fire_essence": 8
        },
        "result": {
            "id": "hellfire_greatmaul",
            "stats": {
                "atk": 120,
                "mag": 25,
                "crit": 10
            },
            "slot": "weapon"
        }
    },
    "worldender_lance": {
        "name": "World-Ender Lance",
        "category": "WEAPON",
        "id": "worldender_lance",
        "desc": "A legendary weapon that combines hellfire power with the raw physical weight of abyssal parts. (+115 ATK, +40 MAG, +12 CRIT)",
        "ingredients": {
            "infernal_crown": 1,
            "mythic_fish": 2,
            "refined_steel": 5
        },
        "result": {
            "id": "worldender_lance",
            "stats": {
                "atk": 115,
                "mag": 40,
                "crit": 12
            },
            "slot": "weapon"
        }
    },
    "aegis_of_the_abyss": {
        "name": "Aegis of the Abyss",
        "category": "ARMOR",
        "id": "aegis_of_the_abyss",
        "desc": "A shield that feels entirely weightless but swallows incoming attacks whole. (+120 DEF, +400 HP, +10 LCK)",
        "ingredients": {
            "void_essence": 2,
            "void_crystal": 5,
            "refined_steel": 10
        },
        "result": {
            "id": "aegis_of_the_abyss",
            "stats": {
                "def": 120,
                "hp": 400,
                "luck": 10
            },
            "slot": "off_hand"
        }
    },
    "abyssal_bulwark": {
        "name": "Abyssal Bulwark",
        "category": "ARMOR",
        "id": "abyssal_bulwark",
        "desc": "A shield forged from compressed void energy. It acts like a gravitational anomaly, pulling threats away from allies. (+115 DEF, +450 HP, +10 LCK)",
        "ingredients": {
            "void_essence": 2,
            "void_crystal": 6,
            "ancient_wood": 8
        },
        "result": {
            "id": "abyssal_bulwark",
            "stats": {
                "def": 115,
                "hp": 450,
                "luck": 10
            },
            "slot": "off_hand"
        }
    },
    "mirror_shield_of_tartarus": {
        "name": "Mirror Shield of Tartarus",
        "category": "ARMOR",
        "id": "mirror_shield_of_tartarus",
        "desc": "A pristine, terrifying shield that visually distorts distance, making your exact stance impossible to read. (+130 DEF, +350 HP, +15 CRIT)",
        "ingredients": {
            "void_essence": 2,
            "mirror_essence": 2,
            "refined_steel": 6
        },
        "result": {
            "id": "mirror_shield_of_tartarus",
            "stats": {
                "def": 130,
                "hp": 350,
                "crit": 15
            },
            "slot": "off_hand"
        }
    },
    "aegis_of_eternal_fire": {
        "name": "Aegis of Eternal Fire",
        "category": "ARMOR",
        "id": "aegis_of_eternal_fire",
        "desc": "A massive shield crafted from molten dragon scrap and hellfire energy. Melt weapons that strike it. (+125 DEF, +300 HP, +15 ATK)",
        "ingredients": {
            "infernal_crown": 1,
            "dragon_scale": 4,
            "refined_steel": 6
        },
        "result": {
            "id": "aegis_of_eternal_fire",
            "stats": {
                "def": 125,
                "hp": 300,
                "atk": 15
            },
            "slot": "off_hand"
        }
    },
    "chrono_weaver_vestments": {
        "name": "Chrono Weaver Vestments",
        "category": "ARMOR",
        "id": "chrono_weaver_vestments",
        "desc": "Woven from divine silk and infused with eternal fires. Time seems to slow around the wearer. (+85 DEF, +250 HP, +25 SPD)",
        "ingredients": {
            "infernal_crown": 1,
            "spider_silk": 15,
            "fire_essence": 5
        },
        "result": {
            "id": "chrono_weaver_vestments",
            "stats": {
                "def": 85,
                "hp": 250,
                "spd": 25
            },
            "slot": "armor"
        }
    },
    "voidstrand_robes": {
        "name": "Void-Strand Robes",
        "category": "ARMOR",
        "id": "voidstrand_robes",
        "desc": "Robes woven seamlessly from mystic thread and void energy, causing the wearer's physical form to appear blurry and untargetable. (+75 DEF, +200 HP, +40 MAG, +15 SPD)",
        "ingredients": {
            "void_essence": 1,
            "mystic_thread": 10,
            "void_crystal": 4
        },
        "result": {
            "id": "voidstrand_robes",
            "stats": {
                "def": 75,
                "hp": 200,
                "mag": 40,
                "spd": 15
            },
            "slot": "armor"
        }
    },
    "eelskin_hazard_suit": {
        "name": "Eel-Skin Hazard Suit",
        "category": "ARMOR",
        "id": "eelskin_hazard_suit",
        "desc": "High-tech magic gear constructed from corrupted eel hides. It constantly cycles electrical current. (+90 DEF, +300 HP, +30 SPD)",
        "ingredients": {
            "void_essence": 2,
            "infected_fish": 3,
            "lightning_shard": 5
        },
        "result": {
            "id": "eelskin_hazard_suit",
            "stats": {
                "def": 90,
                "hp": 300,
                "spd": 30
            },
            "slot": "armor"
        }
    },
    "abyssal_carapace": {
        "name": "Abyssal Carapace",
        "category": "ARMOR",
        "id": "abyssal_carapace",
        "desc": "Heavy armor constructed from the outer shell of deep-sea entities. Completely unyielding. (+110 DEF, +400 HP)",
        "ingredients": {
            "mythic_fish": 2,
            "void_essence": 1,
            "tough_leather": 10
        },
        "result": {
            "id": "abyssal_carapace",
            "stats": {
                "def": 110,
                "hp": 400
            },
            "slot": "armor"
        }
    },
    "crown_of_hellfire": {
        "name": "Crown of Hellfire",
        "category": "ARMOR",
        "id": "crown_of_hellfire",
        "desc": "A blazing crown that marks you as a lord of destruction. Your spells burn hotter. (+40 DEF, +80 MAG, +20 CRIT)",
        "ingredients": {
            "infernal_crown": 1,
            "fire_essence": 5,
            "dark_matter": 2
        },
        "result": {
            "id": "crown_of_hellfire",
            "stats": {
                "def": 40,
                "mag": 80,
                "crit": 20
            },
            "slot": "helmet"
        }
    },
    "gaze_of_the_abyss": {
        "name": "Gaze of the Abyss",
        "category": "ARMOR",
        "id": "gaze_of_the_abyss",
        "desc": "A hollow mask that replaces the wearer’s eyes with tiny, glowing portals to the void. (+35 DEF, +75 MAG, +25 CRIT)",
        "ingredients": {
            "void_essence": 1,
            "dark_matter": 4,
            "mana_crystal": 5
        },
        "result": {
            "id": "gaze_of_the_abyss",
            "stats": {
                "def": 35,
                "mag": 75,
                "crit": 25
            },
            "slot": "helmet"
        }
    },
    "crown_of_the_abyssal_sovereign": {
        "name": "Crown of the Abyssal Sovereign",
        "category": "ARMOR",
        "id": "crown_of_the_abyssal_sovereign",
        "desc": "A crown that makes your voice echo with cosmic authority, driving fear into enemies. (+45 DEF, +60 MAG, +20 LCK)",
        "ingredients": {
            "void_essence": 1,
            "lich_phylactery": 2,
            "mystic_thread": 5
        },
        "result": {
            "id": "crown_of_the_abyssal_sovereign",
            "stats": {
                "def": 45,
                "mag": 60,
                "luck": 20
            },
            "slot": "helmet"
        }
    },
    "visor_of_the_void_walker": {
        "name": "Visor of the Void Walker",
        "category": "ARMOR",
        "id": "visor_of_the_void_walker",
        "desc": "A sleek helmet that filters out magical blinding light, allowing perfect sight in total darkness. (+50 DEF, +40 SPD, +15 LCK)",
        "ingredients": {
            "void_essence": 1,
            "void_crystal": 2,
            "tough_leather": 4
        },
        "result": {
            "id": "visor_of_the_void_walker",
            "stats": {
                "def": 50,
                "spd": 40,
                "luck": 15
            },
            "slot": "helmet"
        }
    },
    "voidtouched_grips": {
        "name": "Void-Touched Grips",
        "category": "ARMOR",
        "id": "voidtouched_grips",
        "desc": "These gloves cause your hands to phase slightly out of the physical plane, maximizing striking speed. (+30 ATK, +35 SPD, +12 CRIT)",
        "ingredients": {
            "void_essence": 1,
            "ghost_essence": 4,
            "tough_leather": 5
        },
        "result": {
            "id": "voidtouched_grips",
            "stats": {
                "atk": 30,
                "spd": 35,
                "crit": 12
            },
            "slot": "gloves"
        }
    },
    "abyssal_grasp": {
        "name": "Abyssal Grasp",
        "category": "ARMOR",
        "id": "abyssal_grasp",
        "desc": "Gauntlets that channel raw void energy into your fingertips, leaving trails of black static with every gesture. (+45 ATK, +25 MAG, +20 SPD)",
        "ingredients": {
            "void_essence": 1,
            "dark_matter": 3,
            "tough_leather": 6
        },
        "result": {
            "id": "abyssal_grasp",
            "stats": {
                "atk": 45,
                "mag": 25,
                "spd": 20
            },
            "slot": "gloves"
        }
    },
    "eelspike_gauntlets": {
        "name": "Eel-Spike Gauntlets",
        "category": "ARMOR",
        "id": "eelspike_gauntlets",
        "desc": "Gloves covered in tiny, static-conducting scales that shock anything they touch. (+35 ATK, +30 SPD, +18 CRIT)",
        "ingredients": {
            "void_essence": 1,
            "infected_fish": 2,
            "lightning_shard": 4
        },
        "result": {
            "id": "eelspike_gauntlets",
            "stats": {
                "atk": 35,
                "spd": 30,
                "crit": 18
            },
            "slot": "gloves"
        }
    },
    "touch_of_retribution": {
        "name": "Touch of Retribution",
        "category": "ARMOR",
        "id": "touch_of_retribution",
        "desc": "Gloves that store kinetic energy from incoming hits and release it on your next attack. (+40 ATK, +25 DEF, +12 CRIT)",
        "ingredients": {
            "void_essence": 1,
            "golem_core": 2,
            "tough_leather": 4
        },
        "result": {
            "id": "touch_of_retribution",
            "stats": {
                "atk": 40,
                "def": 25,
                "crit": 12
            },
            "slot": "gloves"
        }
    },
    "abyssal_treads": {
        "name": "Abyssal Treads",
        "category": "ARMOR",
        "id": "abyssal_treads",
        "desc": "Boots that leave a trail of fading stars. You walk through hazard zones unaffected. (+35 DEF, +45 SPD, +15 LCK)",
        "ingredients": {
            "mythic_fish": 2,
            "void_crystal": 2,
            "tough_leather": 4
        },
        "result": {
            "id": "abyssal_treads",
            "stats": {
                "def": 35,
                "spd": 45,
                "luck": 15
            },
            "slot": "boots"
        }
    },
    "void_step_sabatons": {
        "name": "Void Step Sabatons",
        "category": "ARMOR",
        "id": "void_step_sabatons",
        "desc": "Heavy greaves that ignore gravity, allowing the wearer to step cleanly across hazardous terrain without touching it. (+45 DEF, +40 SPD, +15 LCK)",
        "ingredients": {
            "void_essence": 1,
            "mythic_fish": 3,
            "ancient_wood": 2
        },
        "result": {
            "id": "void_step_sabatons",
            "stats": {
                "def": 45,
                "spd": 40,
                "luck": 15
            },
            "slot": "boots"
        }
    },
    "infernal_greaves": {
        "name": "Infernal Greaves",
        "category": "ARMOR",
        "id": "infernal_greaves",
        "desc": "Heavy plated boots that burn red hot, melting ice hazards instantly beneath your feet. (+55 DEF, +25 SPD, +15 ATK)",
        "ingredients": {
            "infernal_crown": 1,
            "dragon_scale": 3,
            "tough_leather": 4
        },
        "result": {
            "id": "infernal_greaves",
            "stats": {
                "def": 55,
                "spd": 25,
                "atk": 15
            },
            "slot": "boots"
        }
    },
    "treads_of_the_damned": {
        "name": "Treads of the Damned",
        "category": "ARMOR",
        "id": "treads_of_the_damned",
        "desc": "Boots that allow the user to run across walls and vertical surfaces by locking onto kinetic lines. (+40 DEF, +45 SPD)",
        "ingredients": {
            "void_essence": 1,
            "ghost_essence": 4,
            "tough_leather": 3
        },
        "result": {
            "id": "treads_of_the_damned",
            "stats": {
                "def": 40,
                "spd": 45
            },
            "slot": "boots"
        }
    },
    "loop_of_forever": {
        "name": "Loop of Forever",
        "category": "ACCESSORY",
        "id": "loop_of_forever",
        "desc": "A cosmic band that pulls stray probability toward the wearer, ensuring flawless fortune. (+25 MAG, +30 LCK, +15 CRIT)",
        "ingredients": {
            "void_essence": 1,
            "rare_gem": 3,
            "gold_pile": 5
        },
        "result": {
            "id": "loop_of_forever",
            "stats": {
                "mag": 25,
                "luck": 30,
                "crit": 15
            },
            "slot": "ring"
        }
    },
    "entropy_loop": {
        "name": "Entropy Loop",
        "category": "ACCESSORY",
        "id": "entropy_loop",
        "desc": "A dark, shifting ring that turns the bearer's misfortune into destructive critical strikes. (+20 MAG, +25 LCK, +22 CRIT)",
        "ingredients": {
            "void_essence": 1,
            "rare_gem": 2,
            "ghost_essence": 4
        },
        "result": {
            "id": "entropy_loop",
            "stats": {
                "mag": 20,
                "luck": 25,
                "crit": 22
            },
            "slot": "ring"
        }
    },
    "singularity_band": {
        "name": "Singularity Band",
        "category": "ACCESSORY",
        "id": "singularity_band",
        "desc": "A gravity-manipulating ring that pulls nearby stray items and gold coins straight into your inventory. (+15 DEF, +40 LCK)",
        "ingredients": {
            "void_essence": 1,
            "rare_gem": 2,
            "gold_pile": 100
        },
        "result": {
            "id": "singularity_band",
            "stats": {
                "def": 15,
                "luck": 40
            },
            "slot": "ring"
        }
    },
    "band_of_cosmic_fortune": {
        "name": "Band of Cosmic Fortune",
        "category": "ACCESSORY",
        "id": "band_of_cosmic_fortune",
        "desc": "A beautiful band that aligns the stars in your favor, maximizing reward drops. (+20 MAG, +45 LCK)",
        "ingredients": {
            "void_essence": 1,
            "rare_gem": 3,
            "gold_pile": 50
        },
        "result": {
            "id": "band_of_cosmic_fortune",
            "stats": {
                "mag": 20,
                "luck": 45
            },
            "slot": "ring"
        }
    },
    "heart_of_the_cosmos": {
        "name": "Heart of the Cosmos",
        "category": "ACCESSORY",
        "id": "heart_of_the_cosmos",
        "desc": "A swirling mass of nothingness contained inside a silver casing. It beats in sync with your pulse. (+300 HP, +60 MAG, +15 LCK)",
        "ingredients": {
            "void_essence": 1,
            "mana_crystal": 5,
            "mystic_thread": 2
        },
        "result": {
            "id": "heart_of_the_cosmos",
            "stats": {
                "hp": 300,
                "mag": 60,
                "luck": 15
            },
            "slot": "amulet"
        }
    },
    "void_core_amulet": {
        "name": "Void Core Amulet",
        "category": "ACCESSORY",
        "id": "void_core_amulet",
        "desc": "A dangerous relic containing a miniature singularity. It warps the air around your chest. (+250 HP, +70 MAG, +10 SPD)",
        "ingredients": {
            "void_essence": 1,
            "mana_crystal": 6,
            "mystic_thread": 4
        },
        "result": {
            "id": "void_core_amulet",
            "stats": {
                "hp": 250,
                "mag": 70,
                "spd": 10
            },
            "slot": "amulet"
        }
    },
    "necklace_of_the_void_empress": {
        "name": "Necklace of the Void Empress",
        "category": "ACCESSORY",
        "id": "necklace_of_the_void_empress",
        "desc": "A breathtaking necklace made from crystallized nothingness. It grants immense magical fortitude. (+400 HP, +50 MAG, +12 CRIT)",
        "ingredients": {
            "void_essence": 1,
            "mirror_essence": 1,
            "mana_crystal": 4
        },
        "result": {
            "id": "necklace_of_the_void_empress",
            "stats": {
                "hp": 400,
                "mag": 50,
                "crit": 12
            },
            "slot": "amulet"
        }
    },
    "voidstar_choker": {
        "name": "Void-Star Choker",
        "category": "ACCESSORY",
        "id": "voidstar_choker",
        "desc": "A heavy choker containing a literal fragment of a dead cosmic body. (+200 HP, +80 MAG, +10 CRIT)",
        "ingredients": {
            "void_essence": 1,
            "dark_matter": 4,
            "mystic_thread": 4
        },
        "result": {
            "id": "voidstar_choker",
            "stats": {
                "hp": 200,
                "mag": 80,
                "crit": 10
            },
            "slot": "amulet"
        }
    },
    "veil_of_the_void": {
        "name": "Veil of the Void",
        "category": "CLOTHING",
        "id": "veil_of_the_void",
        "desc": "A shifting, dark cloak that absorbs all surrounding light, making the wearer nearly invisible. (+50 DEF, +40 SPD, +20 CRIT)",
        "ingredients": {
            "void_essence": 1,
            "dark_matter": 4,
            "spider_silk": 8
        },
        "result": {
            "id": "veil_of_the_void",
            "stats": {
                "def": 50,
                "spd": 40,
                "crit": 20
            },
            "slot": "cloak"
        }
    },
    "shroud_of_eternal_night": {
        "name": "Shroud of Eternal Night",
        "category": "CLOTHING",
        "id": "shroud_of_eternal_night",
        "desc": "A flowing cloak that completely dampens the sound of your movements and absorbs incoming spell light. (+40 DEF, +50 SPD, +15 LCK)",
        "ingredients": {
            "void_essence": 1,
            "dark_matter": 3,
            "spider_silk": 12
        },
        "result": {
            "id": "shroud_of_eternal_night",
            "stats": {
                "def": 40,
                "spd": 50,
                "luck": 15
            },
            "slot": "cloak"
        }
    },
    "cloak_of_shifting_realities": {
        "name": "Cloak of Shifting Realities",
        "category": "CLOTHING",
        "id": "cloak_of_shifting_realities",
        "desc": "A cloak that constantly flickers between physical and ethereal planes, dodging stray projectiles. (+45 DEF, +35 SPD, +15 LCK)",
        "ingredients": {
            "void_essence": 1,
            "mirror_essence": 2,
            "spider_silk": 6
        },
        "result": {
            "id": "cloak_of_shifting_realities",
            "stats": {
                "def": 45,
                "spd": 35,
                "luck": 15
            },
            "slot": "cloak"
        }
    },
    "mantlet_of_chaos": {
        "name": "Mantlet of Chaos",
        "category": "CLOTHING",
        "id": "mantlet_of_chaos",
        "desc": "A chaotic, shifting cloak that makes the wearer completely immune to critical hits. (+60 DEF, +20 HP, +15 LCK)",
        "ingredients": {
            "void_essence": 1,
            "infected_heart": 2,
            "spider_silk": 6
        },
        "result": {
            "id": "mantlet_of_chaos",
            "stats": {
                "def": 60,
                "hp": 20,
                "luck": 15
            },
            "slot": "cloak"
        }
    },
    "wyrmtail_greatsword": {
        "name": "Wyrmtail Greatsword",
        "category": "WEAPON",
        "id": "wyrmtail_greatsword",
        "desc": "A massive sword crafted from elder dragon components. Pure magic courses through its heavy edge. (+75 ATK, +20 MAG, +10 CRIT)",
        "ingredients": {
            "elder_blood": 2,
            "wyrm_fang": 2,
            "refined_steel": 5
        },
        "result": {
            "id": "wyrmtail_greatsword",
            "stats": {
                "atk": 75,
                "mag": 20,
                "crit": 10
            },
            "slot": "weapon"
        }
    },
    "titanbone_halberd": {
        "name": "Titan-Bone Halberd",
        "category": "WEAPON",
        "id": "titanbone_halberd",
        "desc": "A massive polearm that vibrates with the internal power source of a colossal titan. (+80 ATK, +20 DEF)",
        "ingredients": {
            "titan_heart": 1,
            "refined_steel": 6,
            "ancient_wood": 2
        },
        "result": {
            "id": "titanbone_halberd",
            "stats": {
                "atk": 80,
                "def": 20
            },
            "slot": "weapon"
        }
    },
    "dragonfang_claymore": {
        "name": "Dragon-Fang Claymore",
        "category": "WEAPON",
        "id": "dragonfang_claymore",
        "desc": "A jagged two-handed sword carved entirely from an elder dragon’s tooth. (+85 ATK, +12 CRIT)",
        "ingredients": {
            "wyrm_fang": 2,
            "elder_blood": 1,
            "refined_steel": 4
        },
        "result": {
            "id": "dragonfang_claymore",
            "stats": {
                "atk": 85,
                "crit": 12
            },
            "slot": "weapon"
        }
    },
    "mirroredged_rapier": {
        "name": "Mirror-Edged Rapier",
        "category": "WEAPON",
        "id": "mirroredged_rapier",
        "desc": "A lightning-fast sword made of crystallized dark power. Its blade looks completely invisible from certain angles. (+65 ATK, +30 SPD, +15 CRIT)",
        "ingredients": {
            "mirror_essence": 1,
            "wyrm_fang": 1,
            "refined_steel": 4
        },
        "result": {
            "id": "mirroredged_rapier",
            "stats": {
                "atk": 65,
                "spd": 30,
                "crit": 15
            },
            "slot": "weapon"
        }
    },
    "colossal_titan_shield": {
        "name": "Colossal Titan Shield",
        "category": "ARMOR",
        "id": "colossal_titan_shield",
        "desc": "A towering slab of pure magic rock. It acts as the ultimate power source of defense. (+90 DEF, +250 HP)",
        "ingredients": {
            "titan_heart": 1,
            "refined_steel": 8,
            "ancient_wood": 4
        },
        "result": {
            "id": "colossal_titan_shield",
            "stats": {
                "def": 90,
                "hp": 250
            },
            "slot": "off_hand"
        }
    },
    "dragonscale_kite_shield": {
        "name": "Dragon-Scale Kite Shield",
        "category": "ARMOR",
        "id": "dragonscale_kite_shield",
        "desc": "A lightweight but incredibly durable shield built from overlapping, pristine dragon scales. (+95 DEF, +150 HP)",
        "ingredients": {
            "dragon_scale": 5,
            "refined_steel": 4
        },
        "result": {
            "id": "dragonscale_kite_shield",
            "stats": {
                "def": 95,
                "hp": 150
            },
            "slot": "off_hand"
        }
    },
    "mirror_buckler": {
        "name": "Mirror Buckler",
        "category": "ARMOR",
        "id": "mirror_buckler",
        "desc": "A small shield coated with crystallized dark power that can deflect magical beams. (+75 DEF, +20 SPD, +8 LCK)",
        "ingredients": {
            "mirror_essence": 1,
            "refined_steel": 4,
            "ghost_essence": 2
        },
        "result": {
            "id": "mirror_buckler",
            "stats": {
                "def": 75,
                "spd": 20,
                "luck": 8
            },
            "slot": "off_hand"
        }
    },
    "aegis_of_the_golem_king": {
        "name": "Aegis of the Golem King",
        "category": "ARMOR",
        "id": "aegis_of_the_golem_king",
        "desc": "A massive slab of enchanted stone that emits a minor defensive shockwave when hit. (+90 DEF, +200 HP, +10 MAG)",
        "ingredients": {
            "titan_heart": 1,
            "golem_core": 2,
            "iron_shard": 5
        },
        "result": {
            "id": "aegis_of_the_golem_king",
            "stats": {
                "def": 90,
                "hp": 200,
                "mag": 10
            },
            "slot": "off_hand"
        }
    },
    "dragon_scale_mail": {
        "name": "Dragon Scale Mail",
        "category": "ARMOR",
        "id": "dragon_scale_mail",
        "desc": "Heavy armor made from nearly indestructible plates. Imbued with blood magic for longevity. (+75 DEF, +200 HP, +10 LCK)",
        "ingredients": {
            "elder_blood": 1,
            "dragon_scale": 4,
            "tough_leather": 5
        },
        "result": {
            "id": "dragon_scale_mail",
            "stats": {
                "def": 75,
                "hp": 200,
                "luck": 10
            },
            "slot": "armor"
        }
    },
    "garb_of_the_elder_mage": {
        "name": "Garb of the Elder Mage",
        "category": "ARMOR",
        "id": "garb_of_the_elder_mage",
        "desc": "Robes soaked in pure dragon blood. The fabrics store mana effortlessly. (+50 DEF, +65 MAG, +15 SPD)",
        "ingredients": {
            "elder_blood": 1,
            "mystic_thread": 8,
            "mana_crystal": 2
        },
        "result": {
            "id": "garb_of_the_elder_mage",
            "stats": {
                "def": 50,
                "mag": 65,
                "spd": 15
            },
            "slot": "armor"
        }
    },
    "titanium_fortified_carapace": {
        "name": "Titanium Fortified Carapace",
        "category": "ARMOR",
        "id": "titanium_fortified_carapace",
        "desc": "Unbelievably heavy armor reinforced with the power source of a colossal golem. (+100 DEF, +250 HP)",
        "ingredients": {
            "titan_heart": 1,
            "refined_steel": 10,
            "tough_leather": 4
        },
        "result": {
            "id": "titanium_fortified_carapace",
            "stats": {
                "def": 100,
                "hp": 250
            },
            "slot": "armor"
        }
    },
    "scale_coat_of_eternity": {
        "name": "Scale Coat of Eternity",
        "category": "ARMOR",
        "id": "scale_coat_of_eternity",
        "desc": "A coat made from near-indestructible dragon plates, tailored for high-level agility. (+70 DEF, +150 HP, +20 SPD)",
        "ingredients": {
            "dragon_scale": 4,
            "elder_blood": 1,
            "spider_silk": 6
        },
        "result": {
            "id": "scale_coat_of_eternity",
            "stats": {
                "def": 70,
                "hp": 150,
                "spd": 20
            },
            "slot": "armor"
        }
    },
    "great_wyrm_helm": {
        "name": "Great Wyrm Helm",
        "category": "ARMOR",
        "id": "great_wyrm_helm",
        "desc": "A fearsome helmet crafted from a dragon’s skull. Its presence alone terrifies lesser foes. (+45 DEF, +25 ATK, +8 CRIT)",
        "ingredients": {
            "wyrm_fang": 1,
            "dragon_scale": 3,
            "tough_leather": 2
        },
        "result": {
            "id": "great_wyrm_helm",
            "stats": {
                "def": 45,
                "atk": 25,
                "crit": 8
            },
            "slot": "helmet"
        }
    },
    "helm_of_ancient_blood": {
        "name": "Helm of Ancient Blood",
        "category": "ARMOR",
        "id": "helm_of_ancient_blood",
        "desc": "A terrifying helm infused with legendary blood. It grants the wearer heightened hunting instincts. (+40 DEF, +30 ATK, +10 CRIT)",
        "ingredients": {
            "elder_blood": 1,
            "tough_leather": 4,
            "sharp_whetstone": 2
        },
        "result": {
            "id": "helm_of_ancient_blood",
            "stats": {
                "def": 40,
                "atk": 30,
                "crit": 10
            },
            "slot": "helmet"
        }
    },
    "crown_of_the_dragon_lord": {
        "name": "Crown of the Dragon Lord",
        "category": "ARMOR",
        "id": "crown_of_the_dragon_lord",
        "desc": "A crown crafted from the hardened horns and blood of dragons, boosting presence and command. (+45 DEF, +30 MAG, +12 LCK)",
        "ingredients": {
            "elder_blood": 1,
            "dragon_scale": 2,
            "ancient_wood": 2
        },
        "result": {
            "id": "crown_of_the_dragon_lord",
            "stats": {
                "def": 45,
                "mag": 30,
                "luck": 12
            },
            "slot": "helmet"
        }
    },
    "gaze_of_the_titan": {
        "name": "Gaze of the Titan",
        "category": "ARMOR",
        "id": "gaze_of_the_titan",
        "desc": "A full-face iron helm powered internally by stone magic, sharpening defensive reactions. (+55 DEF, +80 HP)",
        "ingredients": {
            "titan_heart": 1,
            "refined_steel": 4,
            "iron_shard": 2
        },
        "result": {
            "id": "gaze_of_the_titan",
            "stats": {
                "def": 55,
                "hp": 80
            },
            "slot": "helmet"
        }
    },
    "titan_fist_gauntlets": {
        "name": "Titan Fist Gauntlets",
        "category": "ARMOR",
        "id": "titan_fist_gauntlets",
        "desc": "Heavy gauntlets that channel the raw strength of a colossal golem into every punch. (+40 ATK, +30 DEF)",
        "ingredients": {
            "titan_heart": 1,
            "refined_steel": 4,
            "tough_leather": 2
        },
        "result": {
            "id": "titan_fist_gauntlets",
            "stats": {
                "atk": 40,
                "def": 30
            },
            "slot": "gloves"
        }
    },
    "wyrmscale_grips": {
        "name": "Wyrmscale Grips",
        "category": "ARMOR",
        "id": "wyrmscale_grips",
        "desc": "Reinforced gloves that prevent weapons from slipping and increase physical attack speed. (+35 ATK, +20 SPD, +8 CRIT)",
        "ingredients": {
            "wyrm_fang": 2,
            "tough_leather": 4,
            "spider_silk": 2
        },
        "result": {
            "id": "wyrmscale_grips",
            "stats": {
                "atk": 35,
                "spd": 20,
                "crit": 8
            },
            "slot": "gloves"
        }
    },
    "bloodsoaked_claws": {
        "name": "Blood-Soaked Claws",
        "category": "ARMOR",
        "id": "bloodsoaked_claws",
        "desc": "Vicious leather gauntlets tipped with dragon scale fragments that tear through enemy defense. (+40 ATK, +10 CRIT)",
        "ingredients": {
            "elder_blood": 1,
            "dragon_scale": 2,
            "tough_leather": 4
        },
        "result": {
            "id": "bloodsoaked_claws",
            "stats": {
                "atk": 40,
                "crit": 10
            },
            "slot": "gloves"
        }
    },
    "gloves_of_the_ruined_kingdom": {
        "name": "Gloves of the Ruined Kingdom",
        "category": "ARMOR",
        "id": "gloves_of_the_ruined_kingdom",
        "desc": "Ancient gauntlets that hum with remnant artifact power, greatly augmenting magical accuracy. (+30 MAG, +15 SPD, +12 LCK)",
        "ingredients": {
            "legendary_shard": 1,
            "mystic_thread": 4,
            "tough_leather": 2
        },
        "result": {
            "id": "gloves_of_the_ruined_kingdom",
            "stats": {
                "mag": 30,
                "spd": 15,
                "luck": 12
            },
            "slot": "gloves"
        }
    },
    "striders_of_the_dragon": {
        "name": "Striders of the Dragon",
        "category": "ARMOR",
        "id": "striders_of_the_dragon",
        "desc": "Swift boots forged with dragon scales, allowing the wearer to sprint through fire unscathed. (+35 DEF, +30 SPD)",
        "ingredients": {
            "dragon_scale": 2,
            "tough_leather": 4,
            "fire_essence": 2
        },
        "result": {
            "id": "striders_of_the_dragon",
            "stats": {
                "def": 35,
                "spd": 30
            },
            "slot": "boots"
        }
    },
    "titanstomp_sabatons": {
        "name": "Titan-Stomp Sabatons",
        "category": "ARMOR",
        "id": "titanstomp_sabatons",
        "desc": "Incredibly heavy boots. Every step leaves a shallow crater, giving incredible stability. (+65 DEF, -10 SPD, +100 HP)",
        "ingredients": {
            "titan_heart": 1,
            "iron_shard": 4,
            "tough_leather": 2
        },
        "result": {
            "id": "titanstomp_sabatons",
            "stats": {
                "def": 65,
                "spd": -10,
                "hp": 100
            },
            "slot": "boots"
        }
    },
    "striders_of_the_titan": {
        "name": "Striders of the Titan",
        "category": "ARMOR",
        "id": "striders_of_the_titan",
        "desc": "Heavy plated boots that make the wearer immune to knockback effects. (+55 DEF, +10 ATK, +50 HP)",
        "ingredients": {
            "titan_heart": 1,
            "ancient_wood": 2,
            "tough_leather": 4
        },
        "result": {
            "id": "striders_of_the_titan",
            "stats": {
                "def": 55,
                "atk": 10,
                "hp": 50
            },
            "slot": "boots"
        }
    },
    "boots_of_eternal_blood": {
        "name": "Boots of Eternal Blood",
        "category": "ARMOR",
        "id": "boots_of_eternal_blood",
        "desc": "Dark leather boots that absorb spilled life force to boost the user's movement speed mid-combat. (+30 DEF, +35 SPD, +100 HP)",
        "ingredients": {
            "elder_blood": 1,
            "tough_leather": 4,
            "spider_silk": 4
        },
        "result": {
            "id": "boots_of_eternal_blood",
            "stats": {
                "def": 30,
                "spd": 35,
                "hp": 100
            },
            "slot": "boots"
        }
    },
    "signet_of_the_ancestors": {
        "name": "Signet of the Ancestors",
        "category": "ACCESSORY",
        "id": "signet_of_the_ancestors",
        "desc": "A ring housing a fragment of an ancient artifact. It hums with historical power. (+20 ATK, +20 MAG, +12 LCK)",
        "ingredients": {
            "legendary_shard": 1,
            "rare_gem": 2,
            "gold_pile": 10
        },
        "result": {
            "id": "signet_of_the_ancestors",
            "stats": {
                "atk": 20,
                "mag": 20,
                "luck": 12
            },
            "slot": "ring"
        }
    },
    "ancient_artifact_loop": {
        "name": "Ancient Artifact Loop",
        "category": "ACCESSORY",
        "id": "ancient_artifact_loop",
        "desc": "A ring crafted from an actual fragment of an ancient artifact. Its history hums with power. (+25 ATK, +15 LCK)",
        "ingredients": {
            "legendary_shard": 1,
            "rare_gem": 2,
            "gold_pile": 5
        },
        "result": {
            "id": "ancient_artifact_loop",
            "stats": {
                "atk": 25,
                "luck": 15
            },
            "slot": "ring"
        }
    },
    "legendary_chrono_ring": {
        "name": "Legendary Chrono Ring",
        "category": "ACCESSORY",
        "id": "legendary_chrono_ring",
        "desc": "A ring built around an ancient artifact shard that alters local time loops slightly. (+15 SPD, +25 LCK, +10 CRIT)",
        "ingredients": {
            "legendary_shard": 1,
            "rare_gem": 2,
            "gold_pile": 10
        },
        "result": {
            "id": "legendary_chrono_ring",
            "stats": {
                "spd": 15,
                "luck": 25,
                "crit": 10
            },
            "slot": "ring"
        }
    },
    "titanium_band": {
        "name": "Titanium Band",
        "category": "ACCESSORY",
        "id": "titanium_band",
        "desc": "A thick, unyielding ring that significantly hardens the user's bone structure against impact. (+25 DEF, +100 HP)",
        "ingredients": {
            "titan_heart": 1,
            "rare_gem": 1,
            "gold_pile": 20
        },
        "result": {
            "id": "titanium_band",
            "stats": {
                "def": 25,
                "hp": 100
            },
            "slot": "ring"
        }
    },
    "pendant_of_eternity": {
        "name": "Pendant of Eternity",
        "category": "ACCESSORY",
        "id": "pendant_of_eternity",
        "desc": "A beautiful necklace centered around an ancient artifact shard. It bolsters the wearer’s life force. (+150 HP, +40 DEF, +15 LCK)",
        "ingredients": {
            "legendary_shard": 1,
            "mana_crystal": 3,
            "mystic_thread": 4
        },
        "result": {
            "id": "pendant_of_eternity",
            "stats": {
                "hp": 150,
                "def": 40,
                "luck": 15
            },
            "slot": "amulet"
        }
    },
    "talisman_of_eldritch_blood": {
        "name": "Talisman of Eldritch Blood",
        "category": "ACCESSORY",
        "id": "talisman_of_eldritch_blood",
        "desc": "A vial of pure magic coursing through ancient veins, worn as a pendant. (+150 HP, +45 MAG, +10 LCK)",
        "ingredients": {
            "elder_blood": 1,
            "mana_crystal": 4,
            "mystic_thread": 2
        },
        "result": {
            "id": "talisman_of_eldritch_blood",
            "stats": {
                "hp": 150,
                "mag": 45,
                "luck": 10
            },
            "slot": "amulet"
        }
    },
    "pendant_of_the_dragon_eye": {
        "name": "Pendant of the Dragon Eye",
        "category": "ACCESSORY",
        "id": "pendant_of_the_dragon_eye",
        "desc": "A piercing red jewel amulet that reveals structural weaknesses in high-tier targets. (+30 ATK, +15 CRIT)",
        "ingredients": {
            "elder_blood": 1,
            "rare_gem": 1,
            "mystic_thread": 4
        },
        "result": {
            "id": "pendant_of_the_dragon_eye",
            "stats": {
                "atk": 30,
                "crit": 15
            },
            "slot": "amulet"
        }
    },
    "amulet_of_the_broken_era": {
        "name": "Amulet of the Broken Era",
        "category": "ACCESSORY",
        "id": "amulet_of_the_broken_era",
        "desc": "A fragment of an ancient artifact bound together by glowing thread. Highly unstable but incredibly lucky. (+20 MAG, +35 LCK)",
        "ingredients": {
            "legendary_shard": 1,
            "mystic_thread": 4,
            "mana_crystal": 2
        },
        "result": {
            "id": "amulet_of_the_broken_era",
            "stats": {
                "mag": 20,
                "luck": 35
            },
            "slot": "amulet"
        }
    },
    "mirrorwarp_cloak": {
        "name": "Mirror-Warp Cloak",
        "category": "CLOTHING",
        "id": "mirrorwarp_cloak",
        "desc": "A sleek cloak infused with crystallized dark power that slightly blurs your physical location. (+30 DEF, +25 SPD, +10 CRIT)",
        "ingredients": {
            "mirror_essence": 1,
            "dark_matter": 2,
            "spider_silk": 5
        },
        "result": {
            "id": "mirrorwarp_cloak",
            "stats": {
                "def": 30,
                "spd": 25,
                "crit": 10
            },
            "slot": "cloak"
        }
    },
    "mirrorimage_shroud": {
        "name": "Mirror-Image Shroud",
        "category": "CLOTHING",
        "id": "mirrorimage_shroud",
        "desc": "A cloak made of dark power that leaves visual afterimages when sprinting. (+25 DEF, +35 SPD, +12 CRIT)",
        "ingredients": {
            "mirror_essence": 1,
            "dark_matter": 3,
            "spider_silk": 4
        },
        "result": {
            "id": "mirrorimage_shroud",
            "stats": {
                "def": 25,
                "spd": 35,
                "crit": 12
            },
            "slot": "cloak"
        }
    },
    "cloak_of_the_phantom": {
        "name": "Cloak of the Phantom",
        "category": "CLOTHING",
        "id": "cloak_of_the_phantom",
        "desc": "A sleek cloak made of dark matter that lets you pass fluidly through crowded combat fields. (+30 DEF, +40 SPD)",
        "ingredients": {
            "mirror_essence": 1,
            "dark_matter": 4,
            "spider_silk": 5
        },
        "result": {
            "id": "cloak_of_the_phantom",
            "stats": {
                "def": 30,
                "spd": 40
            },
            "slot": "cloak"
        }
    },
    "dragonwing_cloak": {
        "name": "Dragon-Wing Cloak",
        "category": "CLOTHING",
        "id": "dragonwing_cloak",
        "desc": "A massive cloak forged from dragon membranes that allows the wearer to glide seamlessly through the air. (+40 DEF, +25 SPD, +10 LCK)",
        "ingredients": {
            "dragon_scale": 3,
            "elder_blood": 1,
            "spider_silk": 5
        },
        "result": {
            "id": "dragonwing_cloak",
            "stats": {
                "def": 40,
                "spd": 25,
                "luck": 10
            },
            "slot": "cloak"
        }
    },
    "necrotic_carver": {
        "name": "Necrotic Carver",
        "category": "WEAPON",
        "id": "necrotic_carver",
        "desc": "A jagged blade containing the soul of a powerful necromancer. It hungers for life force. (+50 ATK, +30 MAG)",
        "ingredients": {
            "lich_phylactery": 1,
            "ghost_essence": 2,
            "refined_steel": 3
        },
        "result": {
            "id": "necrotic_carver",
            "stats": {
                "atk": 50,
                "mag": 30
            },
            "slot": "weapon"
        }
    },
    "lichs_bone_wand": {
        "name": "Lich's Bone Wand",
        "category": "WEAPON",
        "id": "lichs_bone_wand",
        "desc": "A sinister wand harboring the soul of a powerful necromancer. Spells cast feel chilling. (+15 ATK, +60 MAG)",
        "ingredients": {
            "lich_phylactery": 1,
            "mana_crystal": 4,
            "ancient_wood": 2
        },
        "result": {
            "id": "lichs_bone_wand",
            "stats": {
                "atk": 15,
                "mag": 60
            },
            "slot": "weapon"
        }
    },
    "infected_hive_needle": {
        "name": "Infected Hive Needle",
        "category": "WEAPON",
        "id": "infected_hive_needle",
        "desc": "A thin, lethal rapier forged from concentrated Hive crystals. Leaves debilitating wounds. (+45 ATK, +25 SPD, +10 CRIT)",
        "ingredients": {
            "infected_shard": 2,
            "refined_steel": 4,
            "mystic_thread": 2
        },
        "result": {
            "id": "infected_hive_needle",
            "stats": {
                "atk": 45,
                "spd": 25,
                "crit": 10
            },
            "slot": "weapon"
        }
    },
    "dark_matter_greatsword": {
        "name": "Dark Matter Greatsword",
        "category": "WEAPON",
        "id": "dark_matter_greatsword",
        "desc": "A blade forged from matter heavier than your student loans. Every swing carries immense kinetic energy. (+65 ATK, -5 SPD)",
        "ingredients": {
            "dark_matter": 3,
            "refined_steel": 4,
            "sharp_whetstone": 1
        },
        "result": {
            "id": "dark_matter_greatsword",
            "stats": {
                "atk": 65,
                "spd": -5
            },
            "slot": "weapon"
        }
    },
    "cursed_mirror_buckler": {
        "name": "Cursed Mirror Buckler",
        "category": "ARMOR",
        "id": "cursed_mirror_buckler",
        "desc": "A small shield made of hardened dark glass. It occasionally reflects spell damage. (+45 DEF, +10 LCK)",
        "ingredients": {
            "mirror_essence": 1,
            "iron_shard": 3,
            "ghost_essence": 2
        },
        "result": {
            "id": "cursed_mirror_buckler",
            "stats": {
                "def": 45,
                "luck": 10
            },
            "slot": "off_hand"
        }
    },
    "spiked_eel_buckler": {
        "name": "Spiked Eel Buckler",
        "category": "ARMOR",
        "id": "spiked_eel_buckler",
        "desc": "A small shield made from electric eel bones that shocks attackers on successful blocks. (+40 DEF, +15 SPD)",
        "ingredients": {
            "infected_fish": 1,
            "lightning_shard": 3,
            "iron_shard": 2
        },
        "result": {
            "id": "spiked_eel_buckler",
            "stats": {
                "def": 40,
                "spd": 15
            },
            "slot": "off_hand"
        }
    },
    "phylactery_aegis": {
        "name": "Phylactery Aegis",
        "category": "ARMOR",
        "id": "phylactery_aegis",
        "desc": "A dark relic shield that stores the souls of fallen enemies to boost its defensive barrier. (+55 DEF, +100 HP, +10 MAG)",
        "ingredients": {
            "lich_phylactery": 1,
            "iron_shard": 4,
            "ghost_essence": 2
        },
        "result": {
            "id": "phylactery_aegis",
            "stats": {
                "def": 55,
                "hp": 100,
                "mag": 10
            },
            "slot": "off_hand"
        }
    },
    "shield_of_restless_souls": {
        "name": "Shield of Restless Souls",
        "category": "ARMOR",
        "id": "shield_of_restless_souls",
        "desc": "A frightening shield made of woven ancient wood and trapped ethereal residue. (+50 DEF, +80 HP)",
        "ingredients": {
            "ancient_wood": 2,
            "ghost_essence": 2,
            "iron_shard": 3
        },
        "result": {
            "id": "shield_of_restless_souls",
            "stats": {
                "def": 50,
                "hp": 80
            },
            "slot": "off_hand"
        }
    },
    "corrupted_eel_carapace": {
        "name": "Corrupted Eel Carapace",
        "category": "ARMOR",
        "id": "corrupted_eel_carapace",
        "desc": "Light armor crafted from an eel twisting with hazard energy. Shockingly durable. (+50 DEF, +100 HP, +15 SPD)",
        "ingredients": {
            "infected_fish": 2,
            "spider_silk": 5,
            "lightning_shard": 2
        },
        "result": {
            "id": "corrupted_eel_carapace",
            "stats": {
                "def": 50,
                "hp": 100,
                "spd": 15
            },
            "slot": "armor"
        }
    },
    "lichskin_vestments": {
        "name": "Lich-Skin Vestments",
        "category": "ARMOR",
        "id": "lichskin_vestments",
        "desc": "Ethereal robes woven with spirit residue. Physical attacks pass right through the loose fibers. (+45 DEF, +80 HP, +25 MAG)",
        "ingredients": {
            "ghost_essence": 3,
            "mystic_thread": 5,
            "dark_matter": 2
        },
        "result": {
            "id": "lichskin_vestments",
            "stats": {
                "def": 45,
                "hp": 80,
                "mag": 25
            },
            "slot": "armor"
        }
    },
    "carapace_of_the_corrupted_eel": {
        "name": "Carapace of the Corrupted Eel",
        "category": "ARMOR",
        "id": "carapace_of_the_corrupted_eel",
        "desc": "Sleek armor made from an eel twisting with hazard energy. Highly resistant to elements. (+55 DEF, +120 HP, +10 SPD)",
        "ingredients": {
            "infected_fish": 2,
            "tough_leather": 4,
            "lightning_shard": 2
        },
        "result": {
            "id": "carapace_of_the_corrupted_eel",
            "stats": {
                "def": 55,
                "hp": 120,
                "spd": 10
            },
            "slot": "armor"
        }
    },
    "hivecore_plate": {
        "name": "Hive-Core Plate",
        "category": "ARMOR",
        "id": "hivecore_plate",
        "desc": "Heavy plate armor centered around a pulsing, corrupted heart. It regenerates minor damage over time. (+65 DEF, +150 HP)",
        "ingredients": {
            "infected_heart": 1,
            "infected_shard": 2,
            "refined_steel": 5
        },
        "result": {
            "id": "hivecore_plate",
            "stats": {
                "def": 65,
                "hp": 150
            },
            "slot": "armor"
        }
    },
    "hood_of_the_restless": {
        "name": "Hood of the Restless",
        "category": "ARMOR",
        "id": "hood_of_the_restless",
        "desc": "A dark, tattered hood radiating an ethereal residue. It sharpens your focus. (+20 DEF, +35 MAG, +8 CRIT)",
        "ingredients": {
            "ghost_essence": 3,
            "dark_matter": 2,
            "mystic_thread": 4
        },
        "result": {
            "id": "hood_of_the_restless",
            "stats": {
                "def": 20,
                "mag": 35,
                "crit": 8
            },
            "slot": "helmet"
        }
    },
    "crown_of_restless_spirits": {
        "name": "Crown of Restless Spirits",
        "category": "ARMOR",
        "id": "crown_of_restless_spirits",
        "desc": "A circlet wrapped in a swirling chill. It lets you hear threats right before they strike. (+20 DEF, +30 MAG, +10 LCK)",
        "ingredients": {
            "ghost_essence": 2,
            "dark_matter": 2,
            "mana_crystal": 2
        },
        "result": {
            "id": "crown_of_restless_spirits",
            "stats": {
                "def": 20,
                "mag": 30,
                "luck": 10
            },
            "slot": "helmet"
        }
    },
    "gloom_hood": {
        "name": "Gloom Hood",
        "category": "ARMOR",
        "id": "gloom_hood",
        "desc": "A dark hood that is visually heavier than your student loans. It hides your face in absolute shadow. (+25 DEF, +20 MAG, +12 LCK)",
        "ingredients": {
            "dark_matter": 2,
            "spider_silk": 4,
            "ghost_essence": 2
        },
        "result": {
            "id": "gloom_hood",
            "stats": {
                "def": 25,
                "mag": 20,
                "luck": 12
            },
            "slot": "helmet"
        }
    },
    "visor_of_the_necromancer": {
        "name": "Visor of the Necromancer",
        "category": "ARMOR",
        "id": "visor_of_the_necromancer",
        "desc": "A cold iron helm that lets you see the remaining life points of your targets perfectly. (+30 DEF, +20 MAG, +10 CRIT)",
        "ingredients": {
            "lich_phylactery": 1,
            "iron_shard": 3,
            "mana_crystal": 2
        },
        "result": {
            "id": "visor_of_the_necromancer",
            "stats": {
                "def": 30,
                "mag": 20,
                "crit": 10
            },
            "slot": "helmet"
        }
    },
    "hivemind_mitts": {
        "name": "Hive-Mind Mitts",
        "category": "ARMOR",
        "id": "hivemind_mitts",
        "desc": "Gloves coated in concentrated Hive essence. They twitch with a life of their own, speeding up your attacks. (+20 ATK, +20 SPD)",
        "ingredients": {
            "infected_shard": 2,
            "tough_leather": 3,
            "spider_silk": 4
        },
        "result": {
            "id": "hivemind_mitts",
            "stats": {
                "atk": 20,
                "spd": 20
            },
            "slot": "gloves"
        }
    },
    "graveside_wraps": {
        "name": "Graveside Wraps",
        "category": "ARMOR",
        "id": "graveside_wraps",
        "desc": "Tattered hand wraps that carry an ethereal residue, making weapon swings completely silent. (+20 ATK, +20 SPD, +8 CRIT)",
        "ingredients": {
            "ghost_essence": 2,
            "spider_silk": 4,
            "tough_leather": 2
        },
        "result": {
            "id": "graveside_wraps",
            "stats": {
                "atk": 20,
                "spd": 20,
                "crit": 8
            },
            "slot": "gloves"
        }
    },
    "grips_of_the_forgotten": {
        "name": "Grips of the Forgotten",
        "category": "ARMOR",
        "id": "grips_of_the_forgotten",
        "desc": "Gauntlets fashioned from petrified ancient wood, offering incredible crushing grip power. (+30 ATK, +15 DEF)",
        "ingredients": {
            "ancient_wood": 2,
            "tough_leather": 4,
            "iron_shard": 2
        },
        "result": {
            "id": "grips_of_the_forgotten",
            "stats": {
                "atk": 30,
                "def": 15
            },
            "slot": "gloves"
        }
    },
    "dark_matter_gauntlets": {
        "name": "Dark Matter Gauntlets",
        "category": "ARMOR",
        "id": "dark_matter_gauntlets",
        "desc": "Heavy gloves that increase the impact weight of your standard physical strikes. (+35 ATK, +15 DEF)",
        "ingredients": {
            "dark_matter": 2,
            "tough_leather": 4,
            "iron_shard": 2
        },
        "result": {
            "id": "dark_matter_gauntlets",
            "stats": {
                "atk": 35,
                "def": 15
            },
            "slot": "gloves"
        }
    },
    "petrified_forest_boots": {
        "name": "Petrified Forest Boots",
        "category": "ARMOR",
        "id": "petrified_forest_boots",
        "desc": "Heavy boots made from petrified wood from a forgotten forest. Firmly roots your stance. (+35 DEF, +50 HP)",
        "ingredients": {
            "ancient_wood": 3,
            "tough_leather": 2
        },
        "result": {
            "id": "petrified_forest_boots",
            "stats": {
                "def": 35,
                "hp": 50
            },
            "slot": "boots"
        }
    },
    "treads_of_the_forgotten_forest": {
        "name": "Treads of the Forgotten Forest",
        "category": "ARMOR",
        "id": "treads_of_the_forgotten_forest",
        "desc": "Heavy boots made of petrified ancient wood. Practically immune to mud or slowing fields. (+45 DEF, +50 HP)",
        "ingredients": {
            "ancient_wood": 2,
            "tough_leather": 3,
            "iron_shard": 2
        },
        "result": {
            "id": "treads_of_the_forgotten_forest",
            "stats": {
                "def": 45,
                "hp": 50
            },
            "slot": "boots"
        }
    },
    "shocking_treads": {
        "name": "Shocking Treads",
        "category": "ARMOR",
        "id": "shocking_treads",
        "desc": "Electric boots crafted from corrupted eel hides. They spark violently when you dash. (+25 DEF, +35 SPD, +5 CRIT)",
        "ingredients": {
            "infected_fish": 1,
            "lightning_shard": 2,
            "tough_leather": 4
        },
        "result": {
            "id": "shocking_treads",
            "stats": {
                "def": 25,
                "spd": 35,
                "crit": 5
            },
            "slot": "boots"
        }
    },
    "hivespore_sabatons": {
        "name": "Hive-Spore Sabatons",
        "category": "ARMOR",
        "id": "hivespore_sabatons",
        "desc": "Plated boots covered in hive residue that slow down any melee enemies standing near you. (+35 DEF, +15 SPD, +50 HP)",
        "ingredients": {
            "infected_shard": 2,
            "refined_steel": 3,
            "tough_leather": 2
        },
        "result": {
            "id": "hivespore_sabatons",
            "stats": {
                "def": 35,
                "spd": 15,
                "hp": 50
            },
            "slot": "boots"
        }
    },
    "hivecore_band": {
        "name": "Hive-Core Band",
        "category": "ACCESSORY",
        "id": "hivecore_band",
        "desc": "A ring made from a pulsing, corrupted heart. It’s still beating... barely. (+10 ATK, +12 CRIT, +8 LCK)",
        "ingredients": {
            "infected_heart": 1,
            "rare_gem": 1,
            "gold_pile": 50
        },
        "result": {
            "id": "hivecore_band",
            "stats": {
                "atk": 10,
                "crit": 12,
                "luck": 8
            },
            "slot": "ring"
        }
    },
    "pulsing_heart_loop": {
        "name": "Pulsing Heart Loop",
        "category": "ACCESSORY",
        "id": "pulsing_heart_loop",
        "desc": "A disturbing ring housing a tiny pulsing heart. It keeps your blood pumping at peak efficiency. (+120 HP, +8 CRIT)",
        "ingredients": {
            "infected_heart": 1,
            "rare_gem": 1,
            "gold_pile": 10
        },
        "result": {
            "id": "pulsing_heart_loop",
            "stats": {
                "hp": 120,
                "crit": 8
            },
            "slot": "ring"
        }
    },
    "lichs_signet": {
        "name": "Lich's Signet",
        "category": "ACCESSORY",
        "id": "lichs_signet",
        "desc": "A cold iron ring linked to a necromancer’s core, boosting dark magic capabilities. (+35 MAG, +5 CRIT)",
        "ingredients": {
            "lich_phylactery": 1,
            "rare_gem": 1,
            "gold_pile": 50
        },
        "result": {
            "id": "lichs_signet",
            "stats": {
                "mag": 35,
                "crit": 5
            },
            "slot": "ring"
        }
    },
    "ethereal_band": {
        "name": "Ethereal Band",
        "category": "ACCESSORY",
        "id": "ethereal_band",
        "desc": "A ring made of solid mystic light that slightly uncouples your finger from physical physics. (+15 MAG, +20 LCK)",
        "ingredients": {
            "mystic_thread": 2,
            "rare_gem": 1,
            "gold_pile": 20
        },
        "result": {
            "id": "ethereal_band",
            "stats": {
                "mag": 15,
                "luck": 20
            },
            "slot": "ring"
        }
    },
    "crownjewel_choker": {
        "name": "Crown-Jewel Choker",
        "category": "ACCESSORY",
        "id": "crownjewel_choker",
        "desc": "A necklace threaded with mystic light. It casts a protective barrier around the neck. (+80 HP, +25 DEF, +12 MAG)",
        "ingredients": {
            "mystic_thread": 3,
            "rare_gem": 2,
            "mana_crystal": 4
        },
        "result": {
            "id": "crownjewel_choker",
            "stats": {
                "hp": 80,
                "def": 25,
                "mag": 12
            },
            "slot": "amulet"
        }
    },
    "choker_of_mystic_light": {
        "name": "Choker of Mystic Light",
        "category": "ACCESSORY",
        "id": "choker_of_mystic_light",
        "desc": "A beautiful necklace that glows with its own internal light, completely shielding your mind. (+30 MAG, +15 LCK)",
        "ingredients": {
            "mystic_thread": 2,
            "rare_gem": 2,
            "mana_crystal": 2
        },
        "result": {
            "id": "choker_of_mystic_light",
            "stats": {
                "mag": 30,
                "luck": 15
            },
            "slot": "amulet"
        }
    },
    "amulet_of_the_hive_mind": {
        "name": "Amulet of the Hive Mind",
        "category": "ACCESSORY",
        "id": "amulet_of_the_hive_mind",
        "desc": "A pulsing insectoid charm that links your senses to the battlefield, preventing ambushes. (+100 HP, +15 SPD, +12 LCK)",
        "ingredients": {
            "infected_shard": 1,
            "infected_heart": 1,
            "spider_silk": 4
        },
        "result": {
            "id": "amulet_of_the_hive_mind",
            "stats": {
                "hp": 100,
                "spd": 15,
                "luck": 12
            },
            "slot": "amulet"
        }
    },
    "phylactery_pendant": {
        "name": "Phylactery Pendant",
        "category": "ACCESSORY",
        "id": "phylactery_pendant",
        "desc": "A dark gemstone necklace holding remnants of a necromancer's magical focus. (+100 HP, +40 MAG)",
        "ingredients": {
            "lich_phylactery": 1,
            "mana_crystal": 3,
            "mystic_thread": 2
        },
        "result": {
            "id": "phylactery_pendant",
            "stats": {
                "hp": 100,
                "mag": 40
            },
            "slot": "amulet"
        }
    },
    "cloak_of_dark_matter": {
        "name": "Cloak of Dark Matter",
        "category": "CLOTHING",
        "id": "cloak_of_dark_matter",
        "desc": "Heavier than your student loans, but it shields you brilliantly from dark magic. (+40 DEF, +10 MAG)",
        "ingredients": {
            "dark_matter": 4,
            "spider_silk": 6
        },
        "result": {
            "id": "cloak_of_dark_matter",
            "stats": {
                "def": 40,
                "mag": 10
            },
            "slot": "cloak"
        }
    },
    "cloak_of_the_hive": {
        "name": "Cloak of the Hive",
        "category": "CLOTHING",
        "id": "cloak_of_the_hive",
        "desc": "A cloak dripping with concentrated Hive essence. It leaves a faint trail of slowing spores. (+35 DEF, +10 SPD)",
        "ingredients": {
            "infected_shard": 2,
            "spider_silk": 6,
            "tough_leather": 1
        },
        "result": {
            "id": "cloak_of_the_hive",
            "stats": {
                "def": 35,
                "spd": 10
            },
            "slot": "cloak"
        }
    },
    "spook_shroud": {
        "name": "Spook Shroud",
        "category": "CLOTHING",
        "id": "spook_shroud",
        "desc": "A cloak made from ethereal residue that causes the wearer to drift smoothly over obstacles. (+30 DEF, +25 SPD, +10 MAG)",
        "ingredients": {
            "ghost_essence": 3,
            "spider_silk": 5,
            "mystic_thread": 1
        },
        "result": {
            "id": "spook_shroud",
            "stats": {
                "def": 30,
                "spd": 25,
                "mag": 10
            },
            "slot": "cloak"
        }
    },
    "weavers_cloak": {
        "name": "Weaver's Cloak",
        "category": "CLOTHING",
        "id": "weavers_cloak",
        "desc": "An elegant cloak woven from pure mystic thread that glows with its own internal light. (+25 DEF, +20 SPD, +15 MAG)",
        "ingredients": {
            "mystic_thread": 4,
            "spider_silk": 6
        },
        "result": {
            "id": "weavers_cloak",
            "stats": {
                "def": 25,
                "spd": 20,
                "mag": 15
            },
            "slot": "cloak"
        }
    },
    "golem_fist_smasher": {
        "name": "Golem Fist Smasher",
        "category": "WEAPON",
        "id": "golem_fist_smasher",
        "desc": "A mace utilizing a pulsating heart of stone and magic as its head. (+40 ATK)",
        "ingredients": {
            "golem_core": 1,
            "refined_steel": 4
        },
        "result": {
            "id": "golem_fist_smasher",
            "stats": {
                "atk": 40
            },
            "slot": "weapon"
        }
    },
    "golemcore_mace": {
        "name": "Golem-Core Mace",
        "category": "WEAPON",
        "id": "golemcore_mace",
        "desc": "A heavy mace fueled by a pulsating heart of stone and magic, dealing heavy blunt damage. (+45 ATK)",
        "ingredients": {
            "golem_core": 1,
            "iron_shard": 5,
            "tough_leather": 1
        },
        "result": {
            "id": "golemcore_mace",
            "stats": {
                "atk": 45
            },
            "slot": "weapon"
        }
    },
    "elemental_ice_brand": {
        "name": "Elemental Ice Brand",
        "category": "WEAPON",
        "id": "elemental_ice_brand",
        "desc": "A freezing blade embedded with small pieces of elemental ice. (+35 ATK, +10 MAG)",
        "ingredients": {
            "ice_shard": 4,
            "refined_steel": 3,
            "sharp_whetstone": 1
        },
        "result": {
            "id": "elemental_ice_brand",
            "stats": {
                "atk": 35,
                "mag": 10
            },
            "slot": "weapon"
        }
    },
    "lightning_shocksaber": {
        "name": "Lightning Shock-Saber",
        "category": "WEAPON",
        "id": "lightning_shocksaber",
        "desc": "A rapid sword packed with small pieces of elemental lightning, ensuring swift critical strikes. (+30 ATK, +15 SPD, +8 CRIT)",
        "ingredients": {
            "lightning_shard": 4,
            "refined_steel": 3,
            "sharp_whetstone": 1
        },
        "result": {
            "id": "lightning_shocksaber",
            "stats": {
                "atk": 30,
                "spd": 15,
                "crit": 8
            },
            "slot": "weapon"
        }
    },
    "mythril_wall": {
        "name": "Mythril Wall",
        "category": "ARMOR",
        "id": "mythril_wall",
        "desc": "A brilliant blue kite shield that is surprisingly heavy but entirely unyielding. (+50 DEF)",
        "ingredients": {
            "mythril_ore": 5,
            "iron_shard": 2
        },
        "result": {
            "id": "mythril_wall",
            "stats": {
                "def": 50
            },
            "slot": "off_hand"
        }
    },
    "mythril_shield": {
        "name": "Mythril Shield",
        "category": "ARMOR",
        "id": "mythril_shield",
        "desc": "A gorgeous, brilliant blue shield that easily deflects standard magical and physical impacts. (+55 DEF)",
        "ingredients": {
            "mythril_ore": 4,
            "iron_shard": 3
        },
        "result": {
            "id": "mythril_shield",
            "stats": {
                "def": 55
            },
            "slot": "off_hand"
        }
    },
    "golem_stone_bastion": {
        "name": "Golem Stone Bastion",
        "category": "ARMOR",
        "id": "golem_stone_bastion",
        "desc": "A heavy shield centered around a golem core. It is unyielding against crushing physical blows. (+65 DEF, +50 HP)",
        "ingredients": {
            "golem_core": 1,
            "refined_steel": 4,
            "iron_shard": 2
        },
        "result": {
            "id": "golem_stone_bastion",
            "stats": {
                "def": 65,
                "hp": 50
            },
            "slot": "off_hand"
        }
    },
    "demonhide_target_shield": {
        "name": "Demon-Hide Target Shield",
        "category": "ARMOR",
        "id": "demonhide_target_shield",
        "desc": "A small, nimble shield layered with tough, resilient skin from a demon. (+45 DEF, +10 SPD)",
        "ingredients": {
            "demon_hide": 3,
            "iron_shard": 2,
            "tough_leather": 2
        },
        "result": {
            "id": "demonhide_target_shield",
            "stats": {
                "def": 45,
                "spd": 10
            },
            "slot": "off_hand"
        }
    },
    "demon_scale_tunic": {
        "name": "Demon Scale Tunic",
        "category": "ARMOR",
        "id": "demon_scale_tunic",
        "desc": "A resilient tunic fashioned from tough demon skin. (+40 DEF, +80 HP)",
        "ingredients": {
            "demon_hide": 4,
            "tough_leather": 3
        },
        "result": {
            "id": "demon_scale_tunic",
            "stats": {
                "def": 40,
                "hp": 80
            },
            "slot": "armor"
        }
    },
    "demon_skin_vest": {
        "name": "Demon Skin Vest",
        "category": "ARMOR",
        "id": "demon_skin_vest",
        "desc": "A tough, resilient vest made of demon hide. It provides natural magic resistance. (+45 DEF, +60 HP)",
        "ingredients": {
            "demon_hide": 3,
            "tough_leather": 4
        },
        "result": {
            "id": "demon_skin_vest",
            "stats": {
                "def": 45,
                "hp": 60
            },
            "slot": "armor"
        }
    },
    "mythril_chainshirt": {
        "name": "Mythril Chainshirt",
        "category": "ARMOR",
        "id": "mythril_chainshirt",
        "desc": "Lightweight chain armor forged from pure mythril ore. Surprisingly heavy but covers well. (+50 DEF, +40 HP, +10 SPD)",
        "ingredients": {
            "mythril_ore": 5,
            "spider_silk": 4,
            "tough_leather": 2
        },
        "result": {
            "id": "mythril_chainshirt",
            "stats": {
                "def": 50,
                "hp": 40,
                "spd": 10
            },
            "slot": "armor"
        }
    },
    "plate_armor_of_the_flame": {
        "name": "Plate Armor of the Flame",
        "category": "ARMOR",
        "id": "plate_armor_of_the_flame",
        "desc": "Heavy metal armor insulated with flickering fire essence to guard against winter chills. (+60 DEF, +50 HP)",
        "ingredients": {
            "fire_essence": 2,
            "refined_steel": 6,
            "tough_leather": 2
        },
        "result": {
            "id": "plate_armor_of_the_flame",
            "stats": {
                "def": 60,
                "hp": 50
            },
            "slot": "armor"
        }
    },
    "crown_of_static": {
        "name": "Crown of Static",
        "category": "ARMOR",
        "id": "crown_of_static",
        "desc": "A circlet crafted from concentrated magic. It smells like static electricity. (+15 DEF, +25 MAG)",
        "ingredients": {
            "mana_crystal": 3,
            "lightning_shard": 2
        },
        "result": {
            "id": "crown_of_static",
            "stats": {
                "def": 15,
                "mag": 25
            },
            "slot": "helmet"
        }
    },
    "circlet_of_static": {
        "name": "Circlet of Static",
        "category": "ARMOR",
        "id": "circlet_of_static",
        "desc": "A shiny circlet made from concentrated magic crystals. It continuously smells like static. (+15 DEF, +30 MAG)",
        "ingredients": {
            "mana_crystal": 2,
            "lightning_shard": 2
        },
        "result": {
            "id": "circlet_of_static",
            "stats": {
                "def": 15,
                "mag": 30
            },
            "slot": "helmet"
        }
    },
    "helm_of_fire_essence": {
        "name": "Helm of Fire Essence",
        "category": "ARMOR",
        "id": "helm_of_fire_essence",
        "desc": "A glowing iron helm hosting a flickering flame that sharpens your battle senses. (+25 DEF, +15 ATK, +5 CRIT)",
        "ingredients": {
            "fire_essence": 2,
            "iron_shard": 3,
            "tough_leather": 1
        },
        "result": {
            "id": "helm_of_fire_essence",
            "stats": {
                "def": 25,
                "atk": 15,
                "crit": 5
            },
            "slot": "helmet"
        }
    },
    "mask_of_concentrated_magic": {
        "name": "Mask of Concentrated Magic",
        "category": "ARMOR",
        "id": "mask_of_concentrated_magic",
        "desc": "A complete iron mask containing a concentrated magic core that constantly smells like static. (+20 DEF, +25 MAG)",
        "ingredients": {
            "mana_crystal": 2,
            "iron_shard": 4
        },
        "result": {
            "id": "mask_of_concentrated_magic",
            "stats": {
                "def": 20,
                "mag": 25
            },
            "slot": "helmet"
        }
    },
    "spellweave_gloves": {
        "name": "Spell-Weave Gloves",
        "category": "ARMOR",
        "id": "spellweave_gloves",
        "desc": "Gloves insulated with concentrated magic to stabilize high-tier casting. (+15 MAG, +10 SPD)",
        "ingredients": {
            "mana_crystal": 2,
            "mana_dew": 2,
            "tough_leather": 2
        },
        "result": {
            "id": "spellweave_gloves",
            "stats": {
                "mag": 15,
                "spd": 10
            },
            "slot": "gloves"
        }
    },
    "manacharged_bracers": {
        "name": "Mana-Charged Bracers",
        "category": "ARMOR",
        "id": "manacharged_bracers",
        "desc": "Leather gauntlets embedded with mana dew to stabilize spell casting during rapid motion. (+20 MAG, +10 SPD)",
        "ingredients": {
            "mana_crystal": 2,
            "mana_dew": 3,
            "tough_leather": 2
        },
        "result": {
            "id": "manacharged_bracers",
            "stats": {
                "mag": 20,
                "spd": 10
            },
            "slot": "gloves"
        }
    },
    "demon_grip_gauntlets": {
        "name": "Demon Grip Gauntlets",
        "category": "ARMOR",
        "id": "demon_grip_gauntlets",
        "desc": "Heavy leather gloves tailored from demon skin, ensuring a resilient grip on heavy weapons. (+25 ATK, +10 DEF)",
        "ingredients": {
            "demon_hide": 2,
            "tough_leather": 3,
            "iron_shard": 2
        },
        "result": {
            "id": "demon_grip_gauntlets",
            "stats": {
                "atk": 25,
                "def": 10
            },
            "slot": "gloves"
        }
    },
    "insulated_ice_grips": {
        "name": "Insulated Ice Grips",
        "category": "ARMOR",
        "id": "insulated_ice_grips",
        "desc": "Cold-resistant gloves forged with small pieces of elemental ice to freeze targets upon hitting. (+20 ATK, +15 MAG)",
        "ingredients": {
            "ice_shard": 3,
            "tough_leather": 3,
            "spider_silk": 2
        },
        "result": {
            "id": "insulated_ice_grips",
            "stats": {
                "atk": 20,
                "mag": 15
            },
            "slot": "gloves"
        }
    },
    "bear_claw_sabatons": {
        "name": "Bear Claw Sabatons",
        "category": "ARMOR",
        "id": "bear_claw_sabatons",
        "desc": "Heavy iron boots tipped with sharp, dangerous bear claws for lethal kick attacks. (+20 DEF, +15 ATK)",
        "ingredients": {
            "bear_claw": 2,
            "iron_shard": 3,
            "tough_leather": 1
        },
        "result": {
            "id": "bear_claw_sabatons",
            "stats": {
                "def": 20,
                "atk": 15
            },
            "slot": "boots"
        }
    },
    "bear_claw_boots": {
        "name": "Bear Claw Boots",
        "category": "ARMOR",
        "id": "bear_claw_boots",
        "desc": "Leather travel boots fixed with sharp, dangerous bear claws along the rim. (+20 DEF, +12 ATK, +5 CRIT)",
        "ingredients": {
            "bear_claw": 2,
            "tough_leather": 2,
            "iron_shard": 2
        },
        "result": {
            "id": "bear_claw_boots",
            "stats": {
                "def": 20,
                "atk": 12,
                "crit": 5
            },
            "slot": "boots"
        }
    },
    "sabatons_of_static": {
        "name": "Sabatons of Static",
        "category": "ARMOR",
        "id": "sabatons_of_static",
        "desc": "Plated boots carrying small pieces of elemental lightning, giving you a faster sprint step. (+20 DEF, +25 SPD)",
        "ingredients": {
            "lightning_shard": 3,
            "iron_shard": 3,
            "tough_leather": 2
        },
        "result": {
            "id": "sabatons_of_static",
            "stats": {
                "def": 20,
                "spd": 25
            },
            "slot": "boots"
        }
    },
    "mythrilplated_greaves": {
        "name": "Mythril-Plated Greaves",
        "category": "ARMOR",
        "id": "mythrilplated_greaves",
        "desc": "Beautiful blue-tinted boots that make your footsteps incredibly light but firmly grounded. (+30 DEF, +15 SPD)",
        "ingredients": {
            "mythril_ore": 3,
            "tough_leather": 2,
            "spider_silk": 4
        },
        "result": {
            "id": "mythrilplated_greaves",
            "stats": {
                "def": 30,
                "spd": 15
            },
            "slot": "boots"
        }
    },
    "rainbow_hoop": {
        "name": "Rainbow Hoop",
        "category": "ACCESSORY",
        "id": "rainbow_hoop",
        "desc": "A beautifully colored ring that sparkles with immense value, granting high good fortune. (+15 LCK, +5 CRIT)",
        "ingredients": {
            "rare_fish": 1,
            "rare_gem": 1,
            "gold_pile": 20
        },
        "result": {
            "id": "rainbow_hoop",
            "stats": {
                "luck": 15,
                "crit": 5
            },
            "slot": "ring"
        }
    },
    "glinting_trout_ring": {
        "name": "Glinting Trout Ring",
        "category": "ACCESSORY",
        "id": "glinting_trout_ring",
        "desc": "A ring carved from rare fish components, sparkling with immense value and luck. (+20 LCK)",
        "ingredients": {
            "rare_fish": 1,
            "rare_gem": 1,
            "gold_pile": 10
        },
        "result": {
            "id": "glinting_trout_ring",
            "stats": {
                "luck": 20
            },
            "slot": "ring"
        }
    },
    "sparkling_gem_band": {
        "name": "Sparkling Gem Band",
        "category": "ACCESSORY",
        "id": "sparkling_gem_band",
        "desc": "A sparkling gemstone ring of immense value. Merchants look at you with deep respect. (+10 MAG, +15 LCK)",
        "ingredients": {
            "rare_gem": 1,
            "gold_pile": 50
        },
        "result": {
            "id": "sparkling_gem_band",
            "stats": {
                "mag": 10,
                "luck": 15
            },
            "slot": "ring"
        }
    },
    "golem_core_signet": {
        "name": "Golem Core Signet",
        "category": "ACCESSORY",
        "id": "golem_core_signet",
        "desc": "A bulky ring that funnels a pulsing heart of stone magic into your defense rating. (+20 DEF, +40 HP)",
        "ingredients": {
            "golem_core": 1,
            "gold_pile": 20,
            "iron_shard": 2
        },
        "result": {
            "id": "golem_core_signet",
            "stats": {
                "def": 20,
                "hp": 40
            },
            "slot": "ring"
        }
    },
    "talisman_of_flowing_mana": {
        "name": "Talisman of Flowing Mana",
        "category": "ACCESSORY",
        "id": "talisman_of_flowing_mana",
        "desc": "A simple charm containing magic Gatorade that constantly refreshes your magical energy. (+50 HP, +20 MAG)",
        "ingredients": {
            "mana_dew": 4,
            "mystic_thread": 2
        },
        "result": {
            "id": "talisman_of_flowing_mana",
            "stats": {
                "hp": 50,
                "mag": 20
            },
            "slot": "amulet"
        }
    },
    "amulet_of_magic_gatorade": {
        "name": "Amulet of Magic Gatorade",
        "category": "ACCESSORY",
        "id": "amulet_of_magic_gatorade",
        "desc": "A small crystal flask filled with basically magic Gatorade that steadily refreshes your mind. (+40 HP, +25 MAG)",
        "ingredients": {
            "mana_dew": 3,
            "spider_silk": 4,
            "mana_crystal": 1
        },
        "result": {
            "id": "amulet_of_magic_gatorade",
            "stats": {
                "hp": 40,
                "mag": 25
            },
            "slot": "amulet"
        }
    },
    "dewdrop_necklace": {
        "name": "Dewdrop Necklace",
        "category": "ACCESSORY",
        "id": "dewdrop_necklace",
        "desc": "A necklace holding pure magic dew. It keeps your physical stamina exceptionally stable. (+80 HP, +15 MAG)",
        "ingredients": {
            "mana_dew": 4,
            "spider_silk": 3,
            "mana_crystal": 1
        },
        "result": {
            "id": "dewdrop_necklace",
            "stats": {
                "hp": 80,
                "mag": 15
            },
            "slot": "amulet"
        }
    },
    "troutscale_medallion": {
        "name": "Trout-Scale Medallion",
        "category": "ACCESSORY",
        "id": "troutscale_medallion",
        "desc": "A colorful medallion crafted from a beautifully colored rainbow trout, boosting your organic luck. (+50 HP, +18 LCK)",
        "ingredients": {
            "rare_fish": 1,
            "spider_silk": 4,
            "mana_dew": 1
        },
        "result": {
            "id": "troutscale_medallion",
            "stats": {
                "hp": 50,
                "luck": 18
            },
            "slot": "amulet"
        }
    },
    "fireflicker_cloak": {
        "name": "Fire-Flicker Cloak",
        "category": "CLOTHING",
        "id": "fireflicker_cloak",
        "desc": "A cloak hosting a flickering flame that keeps the wearer warm and deters ice attacks. (+15 DEF, +15 ATK)",
        "ingredients": {
            "fire_essence": 3,
            "spider_silk": 4
        },
        "result": {
            "id": "fireflicker_cloak",
            "stats": {
                "def": 15,
                "atk": 15
            },
            "slot": "cloak"
        }
    },
    "flickering_flame_cape": {
        "name": "Flickering Flame Cape",
        "category": "CLOTHING",
        "id": "flickering_flame_cape",
        "desc": "A bright cape containing a flickering flame that shields the user from freezing conditions. (+20 DEF, +10 ATK)",
        "ingredients": {
            "fire_essence": 2,
            "fire_shard": 2,
            "spider_silk": 4
        },
        "result": {
            "id": "flickering_flame_cape",
            "stats": {
                "def": 20,
                "atk": 10
            },
            "slot": "cloak"
        }
    },
    "glacial_shawl": {
        "name": "Glacial Shawl",
        "category": "CLOTHING",
        "id": "glacial_shawl",
        "desc": "A pale cloak lined with ice shards that slows down nearby aggressive fire hazards. (+25 DEF, +10 MAG)",
        "ingredients": {
            "ice_shard": 3,
            "spider_silk": 5,
            "mana_crystal": 1
        },
        "result": {
            "id": "glacial_shawl",
            "stats": {
                "def": 25,
                "mag": 10
            },
            "slot": "cloak"
        }
    },
    "static_shock_cape": {
        "name": "Static Shock Cape",
        "category": "CLOTHING",
        "id": "static_shock_cape",
        "desc": "A crackling cape made from elemental lightning components, accelerating your base movement speed. (+15 DEF, +20 SPD, +5 CRIT)",
        "ingredients": {
            "lightning_shard": 3,
            "spider_silk": 6
        },
        "result": {
            "id": "static_shock_cape",
            "stats": {
                "def": 15,
                "spd": 20,
                "crit": 5
            },
            "slot": "cloak"
        }
    },
    "sharpened_iron_cleaver": {
        "name": "Sharpened Iron Cleaver",
        "category": "WEAPON",
        "id": "sharpened_iron_cleaver",
        "desc": "A basic cleaver built from standard metal fragments. Gets the job done. (+15 ATK)",
        "ingredients": {
            "iron_shard": 6,
            "tough_leather": 1
        },
        "result": {
            "id": "sharpened_iron_cleaver",
            "stats": {
                "atk": 15
            },
            "slot": "weapon"
        }
    },
    "scrap_metal_dagger": {
        "name": "Scrap Metal Dagger",
        "category": "WEAPON",
        "id": "scrap_metal_dagger",
        "desc": "A quick dagger put together from crude metal fragments. Gets the job done easily. (+12 ATK, +5 SPD)",
        "ingredients": {
            "iron_shard": 4,
            "tough_leather": 2
        },
        "result": {
            "id": "scrap_metal_dagger",
            "stats": {
                "atk": 12,
                "spd": 5
            },
            "slot": "weapon"
        }
    },
    "antlertipped_spear": {
        "name": "Antler-Tipped Spear",
        "category": "WEAPON",
        "id": "antlertipped_spear",
        "desc": "A basic wooden spear tipped with deer antlers, useful for mid-range hunting strikes. (+16 ATK)",
        "ingredients": {
            "deer_antler": 2,
            "iron_shard": 3,
            "tough_leather": 1
        },
        "result": {
            "id": "antlertipped_spear",
            "stats": {
                "atk": 16
            },
            "slot": "weapon"
        }
    },
    "heavy_iron_spikemaul": {
        "name": "Heavy Iron Spikemaul",
        "category": "WEAPON",
        "id": "heavy_iron_spikemaul",
        "desc": "A heavy club driven full of metal fragments. It is slow but breaks armor easily. (+22 ATK, -3 SPD)",
        "ingredients": {
            "iron_shard": 7,
            "tough_leather": 2
        },
        "result": {
            "id": "heavy_iron_spikemaul",
            "stats": {
                "atk": 22,
                "spd": -3
            },
            "slot": "weapon"
        }
    },
    "reinforcement_platter": {
        "name": "Reinforcement Platter",
        "category": "ARMOR",
        "id": "reinforcement_platter",
        "desc": "A makeshift shield made from scrap iron shards layered together. (+18 DEF)",
        "ingredients": {
            "iron_shard": 5,
            "gunpowder": 1
        },
        "result": {
            "id": "reinforcement_platter",
            "stats": {
                "def": 18
            },
            "slot": "off_hand"
        }
    },
    "wooden_buckler": {
        "name": "Wooden Buckler",
        "category": "ARMOR",
        "id": "wooden_buckler",
        "desc": "A crude shield made from deer antlers and scrap leather. Good for basic blocking. (+15 DEF)",
        "ingredients": {
            "deer_antler": 2,
            "tough_leather": 2
        },
        "result": {
            "id": "wooden_buckler",
            "stats": {
                "def": 15
            },
            "slot": "off_hand"
        }
    },
    "iron_scaffold_shield": {
        "name": "Iron Scaffold Shield",
        "category": "ARMOR",
        "id": "iron_scaffold_shield",
        "desc": "A heavy square shield made completely out of compiled metal fragments. (+22 DEF)",
        "ingredients": {
            "iron_shard": 6,
            "tough_leather": 1
        },
        "result": {
            "id": "iron_scaffold_shield",
            "stats": {
                "def": 22
            },
            "slot": "off_hand"
        }
    },
    "scrap_platter_target": {
        "name": "Scrap Platter Target",
        "category": "ARMOR",
        "id": "scrap_platter_target",
        "desc": "A tiny round buckler fashioned from a single large piece of scrap iron. (+14 DEF, +4 SPD)",
        "ingredients": {
            "iron_shard": 3,
            "spider_silk": 2,
            "tough_leather": 1
        },
        "result": {
            "id": "scrap_platter_target",
            "stats": {
                "def": 14,
                "spd": 4
            },
            "slot": "off_hand"
        }
    },
    "hunters_jerkin": {
        "name": "Hunter's Jerkin",
        "category": "ARMOR",
        "id": "hunters_jerkin",
        "desc": "Standard leather armor crafted from soft and common rabbit fur. (+15 DEF, +30 HP)",
        "ingredients": {
            "rabbit_hide": 5,
            "tough_leather": 2
        },
        "result": {
            "id": "hunters_jerkin",
            "stats": {
                "def": 15,
                "hp": 30
            },
            "slot": "armor"
        }
    },
    "rabbitfur_tunic": {
        "name": "Rabbit-Fur Tunic",
        "category": "ARMOR",
        "id": "rabbitfur_tunic",
        "desc": "Soft and common fur sewn into a basic tunic. Keeps you comfortable and protected. (+12 DEF, +25 HP)",
        "ingredients": {
            "rabbit_hide": 4,
            "spider_silk": 2
        },
        "result": {
            "id": "rabbitfur_tunic",
            "stats": {
                "def": 12,
                "hp": 25
            },
            "slot": "armor"
        }
    },
    "antlerribbed_jerkin": {
        "name": "Antler-Ribbed Jerkin",
        "category": "ARMOR",
        "id": "antlerribbed_jerkin",
        "desc": "Common leather armor reinforced across the ribs with sturdy deer antlers. (+18 DEF, +20 HP)",
        "ingredients": {
            "deer_antler": 2,
            "rabbit_hide": 3,
            "tough_leather": 2
        },
        "result": {
            "id": "antlerribbed_jerkin",
            "stats": {
                "def": 18,
                "hp": 20
            },
            "slot": "armor"
        }
    },
    "heavy_scaffold_vest": {
        "name": "Heavy Scaffold Vest",
        "category": "ARMOR",
        "id": "heavy_scaffold_vest",
        "desc": "Coarse leather armor lined entirely with iron shards for reliable frontline protection. (+25 DEF)",
        "ingredients": {
            "iron_shard": 5,
            "tough_leather": 3
        },
        "result": {
            "id": "heavy_scaffold_vest",
            "stats": {
                "def": 25
            },
            "slot": "armor"
        }
    },
    "scrappers_cap": {
        "name": "Scrapper's Cap",
        "category": "ARMOR",
        "id": "scrappers_cap",
        "desc": "A basic leather cap reinforced with tiny iron filings. Better than nothing. (+8 DEF)",
        "ingredients": {
            "rabbit_hide": 2,
            "iron_shard": 2
        },
        "result": {
            "id": "scrappers_cap",
            "stats": {
                "def": 8
            },
            "slot": "helmet"
        }
    },
    "scrappers_leather_helm": {
        "name": "Scrapper's Leather Helm",
        "category": "ARMOR",
        "id": "scrappers_leather_helm",
        "desc": "A basic leather hat reinforced with small metal fragments along the brow line. (+7 DEF)",
        "ingredients": {
            "rabbit_hide": 2,
            "iron_shard": 2
        },
        "result": {
            "id": "scrappers_leather_helm",
            "stats": {
                "def": 7
            },
            "slot": "helmet"
        }
    },
    "furlined_cap": {
        "name": "Fur-Lined Cap",
        "category": "ARMOR",
        "id": "furlined_cap",
        "desc": "A very soft cap made entirely from rabbit fur, protecting your head from simple bumps. (+6 DEF, +10 HP)",
        "ingredients": {
            "rabbit_hide": 3,
            "spider_silk": 2
        },
        "result": {
            "id": "furlined_cap",
            "stats": {
                "def": 6,
                "hp": 10
            },
            "slot": "helmet"
        }
    },
    "antler_crown_cap": {
        "name": "Antler Crown Cap",
        "category": "ARMOR",
        "id": "antler_crown_cap",
        "desc": "A basic leather cap with small deer antlers fixed to the sides to deflect downward strikes. (+9 DEF)",
        "ingredients": {
            "deer_antler": 2,
            "rabbit_hide": 2
        },
        "result": {
            "id": "antler_crown_cap",
            "stats": {
                "def": 9
            },
            "slot": "helmet"
        }
    },
    "trappers_mitts": {
        "name": "Trapper's Mitts",
        "category": "ARMOR",
        "id": "trappers_mitts",
        "desc": "Simple, coarse gloves woven from sticky giant spider silk. Good for handling rough items. (+5 DEF, +5 SPD)",
        "ingredients": {
            "spider_silk": 4,
            "rabbit_hide": 1
        },
        "result": {
            "id": "trappers_mitts",
            "stats": {
                "def": 5,
                "spd": 5
            },
            "slot": "gloves"
        }
    },
    "sticky_silk_wraps": {
        "name": "Sticky Silk Wraps",
        "category": "ARMOR",
        "id": "sticky_silk_wraps",
        "desc": "Simple gloves woven from strong, sticky silk from giant spiders. Grants good grip strength. (+4 DEF, +6 SPD)",
        "ingredients": {
            "spider_silk": 4,
            "rabbit_hide": 1
        },
        "result": {
            "id": "sticky_silk_wraps",
            "stats": {
                "def": 4,
                "spd": 6
            },
            "slot": "gloves"
        }
    },
    "ironfisted_mitts": {
        "name": "Iron-Fisted Mitts",
        "category": "ARMOR",
        "id": "ironfisted_mitts",
        "desc": "Coarse gloves layered with flat metal fragments across the knuckles to enhance punches. (+6 ATK, +4 DEF)",
        "ingredients": {
            "iron_shard": 3,
            "rabbit_hide": 2,
            "tough_leather": 1
        },
        "result": {
            "id": "ironfisted_mitts",
            "stats": {
                "atk": 6,
                "def": 4
            },
            "slot": "gloves"
        }
    },
    "trappers_thick_gloves": {
        "name": "Trapper's Thick Gloves",
        "category": "ARMOR",
        "id": "trappers_thick_gloves",
        "desc": "Thick, coarse gloves made from tough leather, built for handling wild creatures safely. (+8 DEF)",
        "ingredients": {
            "tough_leather": 3,
            "spider_silk": 2
        },
        "result": {
            "id": "trappers_thick_gloves",
            "stats": {
                "def": 8
            },
            "slot": "gloves"
        }
    },
    "mudstained_boots": {
        "name": "Mud-Stained Boots",
        "category": "ARMOR",
        "id": "mudstained_boots",
        "desc": "Sturdy, common leather footwear designed to withstand long journeys through marshlands. (+8 DEF, +5 SPD)",
        "ingredients": {
            "rabbit_hide": 3,
            "tough_leather": 1
        },
        "result": {
            "id": "mudstained_boots",
            "stats": {
                "def": 8,
                "spd": 5
            },
            "slot": "boots"
        }
    },
    "travelers_leather_boots": {
        "name": "Traveler's Leather Boots",
        "category": "ARMOR",
        "id": "travelers_leather_boots",
        "desc": "Sturdy, common leather boots meant for walking along dusty dirt roads. (+6 DEF, +6 SPD)",
        "ingredients": {
            "rabbit_hide": 2,
            "tough_leather": 2
        },
        "result": {
            "id": "travelers_leather_boots",
            "stats": {
                "def": 6,
                "spd": 6
            },
            "slot": "boots"
        }
    },
    "heavy_marching_boots": {
        "name": "Heavy Marching Boots",
        "category": "ARMOR",
        "id": "heavy_marching_boots",
        "desc": "Thick leather boots with basic iron soles that resist minor stepping hazards. (+10 DEF, +2 SPD)",
        "ingredients": {
            "iron_shard": 2,
            "rabbit_hide": 2,
            "tough_leather": 1
        },
        "result": {
            "id": "heavy_marching_boots",
            "stats": {
                "def": 10,
                "spd": 2
            },
            "slot": "boots"
        }
    },
    "furlined_soft_boots": {
        "name": "Fur-Lined Soft Boots",
        "category": "ARMOR",
        "id": "furlined_soft_boots",
        "desc": "Exceptionally comfortable leather footwear lined inside with warm rabbit fur. (+5 DEF, +8 SPD)",
        "ingredients": {
            "rabbit_hide": 3,
            "tough_leather": 1,
            "spider_silk": 2
        },
        "result": {
            "id": "furlined_soft_boots",
            "stats": {
                "def": 5,
                "spd": 8
            },
            "slot": "boots"
        }
    },
    "copper_band": {
        "name": "Copper Band",
        "category": "ACCESSORY",
        "id": "copper_band",
        "desc": "A cheap, glinting ring made from melted Zeni coins. Offers a tiny bit of luck. (+3 LCK)",
        "ingredients": {
            "gold_pile": 50,
            "iron_shard": 1
        },
        "result": {
            "id": "copper_band",
            "stats": {
                "luck": 3
            },
            "slot": "ring"
        }
    },
    "melted_zeni_loop": {
        "name": "Melted Zeni Loop",
        "category": "ACCESSORY",
        "id": "melted_zeni_loop",
        "desc": "A simple ring hammered together out of glinting Zeni coins. Gives minor luck. (+4 LCK)",
        "ingredients": {
            "gold_pile": 40,
            "iron_shard": 1
        },
        "result": {
            "id": "melted_zeni_loop",
            "stats": {
                "luck": 4
            },
            "slot": "ring"
        }
    },
    "scrapiron_band": {
        "name": "Scrap-Iron Band",
        "category": "ACCESSORY",
        "id": "scrapiron_band",
        "desc": "A crude, heavy iron ring that provides a tiny bump to your overall physical defense. (+3 DEF)",
        "ingredients": {
            "iron_shard": 4,
            "gold_pile": 10
        },
        "result": {
            "id": "scrapiron_band",
            "stats": {
                "def": 3
            },
            "slot": "ring"
        }
    },
    "lucky_fishbone_ring": {
        "name": "Lucky Fish-Bone Ring",
        "category": "ACCESSORY",
        "id": "lucky_fishbone_ring",
        "desc": "A simple ring made from pond fish bones that provides a tiny bit of fortune. (+5 LCK)",
        "ingredients": {
            "common_fish": 1,
            "gold_pile": 20
        },
        "result": {
            "id": "lucky_fishbone_ring",
            "stats": {
                "luck": 5
            },
            "slot": "ring"
        }
    },
    "herbalists_charm": {
        "name": "Herbalist's Charm",
        "category": "ACCESSORY",
        "id": "herbalists_charm",
        "desc": "A small satchel filled with sun-kissed herbs. Smells great and gently mends small wounds. (+25 HP)",
        "ingredients": {
            "healing_herb": 3,
            "spider_silk": 2
        },
        "result": {
            "id": "herbalists_charm",
            "stats": {
                "hp": 25
            },
            "slot": "amulet"
        }
    },
    "sunkissed_herb_satchel": {
        "name": "Sun-Kissed Herb Satchel",
        "category": "ACCESSORY",
        "id": "sunkissed_herb_satchel",
        "desc": "Natural medicine herbs kept in a necklace pouch, slowly mending your minor scratches. (+20 HP)",
        "ingredients": {
            "healing_herb": 2,
            "spider_silk": 3
        },
        "result": {
            "id": "sunkissed_herb_satchel",
            "stats": {
                "hp": 20
            },
            "slot": "amulet"
        }
    },
    "pondbass_charm": {
        "name": "Pond-Bass Charm",
        "category": "ACCESSORY",
        "id": "pondbass_charm",
        "desc": "A dried common pond fish worn on a string, somehow providing a slight boost to stamina. (+15 HP, +2 SPD)",
        "ingredients": {
            "common_fish": 1,
            "spider_silk": 3
        },
        "result": {
            "id": "pondbass_charm",
            "stats": {
                "hp": 15,
                "spd": 2
            },
            "slot": "amulet"
        }
    },
    "herbalists_choker": {
        "name": "Herbalist's Choker",
        "category": "ACCESSORY",
        "id": "herbalists_choker",
        "desc": "A string necklace holding sun-kissed herbs that clears minor poisons or toxins. (+30 HP)",
        "ingredients": {
            "healing_herb": 3,
            "spider_silk": 2
        },
        "result": {
            "id": "herbalists_choker",
            "stats": {
                "hp": 30
            },
            "slot": "amulet"
        }
    },
    "ragged_travelers_shawl": {
        "name": "Ragged Traveler’s Shawl",
        "category": "CLOTHING",
        "id": "ragged_travelers_shawl",
        "desc": "A tattered cloak that offers minor protection from the elements. (+5 DEF)",
        "ingredients": {
            "spider_silk": 6,
            "rabbit_hide": 1
        },
        "result": {
            "id": "ragged_travelers_shawl",
            "stats": {
                "def": 5
            },
            "slot": "cloak"
        }
    },
    "tattered_rag_shawl": {
        "name": "Tattered Rag Shawl",
        "category": "CLOTHING",
        "id": "tattered_rag_shawl",
        "desc": "A tattered traveler's cloak that offers very basic shelter against sudden downpours. (+4 DEF)",
        "ingredients": {
            "spider_silk": 5,
            "rabbit_hide": 1
        },
        "result": {
            "id": "tattered_rag_shawl",
            "stats": {
                "def": 4
            },
            "slot": "cloak"
        }
    },
    "hunters_camo_cloak": {
        "name": "Hunter's Camo Cloak",
        "category": "CLOTHING",
        "id": "hunters_camo_cloak",
        "desc": "A basic brown cloak built from rabbit fur that helps you blend into standard forests. (+5 DEF, +3 LCK)",
        "ingredients": {
            "rabbit_hide": 3,
            "spider_silk": 4
        },
        "result": {
            "id": "hunters_camo_cloak",
            "stats": {
                "def": 5,
                "luck": 3
            },
            "slot": "cloak"
        }
    },
    "thick_leather_mantle": {
        "name": "Thick Leather Mantle",
        "category": "CLOTHING",
        "id": "thick_leather_mantle",
        "desc": "A heavy leather shoulder cape that protects the wearer from simple slashing cuts. (+8 DEF)",
        "ingredients": {
            "tough_leather": 4,
            "spider_silk": 2
        },
        "result": {
            "id": "thick_leather_mantle",
            "stats": {
                "def": 8
            },
            "slot": "cloak"
        }
    }
});

// ========================================== 
// 📤 EXPORTS
// ========================================== 

module.exports = {
    getRecipes,
    getMiningLocations,
    getRecipeById,
    canCraft,
    performCraft,
    dismantleItem,
    CRAFTING_RECIPES,
    BREWING_RECIPES,
    COOKING_RECIPES,
    MINING_LOCATIONS
};
