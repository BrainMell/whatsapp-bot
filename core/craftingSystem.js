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
    }
};

const BREWING_RECIPES = {
    'mega_potion': {
        name: 'Mega Health Potion', id: 'mega_potion',
        desc: 'A powerful brew that restores 250 HP.',
        ingredients: { 'greater_potion': 2, 'healing_herb': 3, 'mana_dew': 1 },
        result: { id: 'mega_potion', usable: true, effect: 'heal', effectValue: 250 }
    },
    'elixir_of_power': {
        name: 'Elixir of Power', id: 'elixir_of_power',
        desc: 'Boosts ATK and MAG by 50% for 5 turns.',
        ingredients: { 'strength_brew': 1, 'rare_gem': 1, 'dragon_blood': 1 },
        result: { id: 'elixir_of_power', usable: true, effect: 'buff_all', effectValue: 50, duration: 5 }
    },
    'liquid_courage': {
        name: 'Liquid Courage', id: 'liquid_courage',
        desc: 'Grants a massive temporary shield.',
        ingredients: { 'minor_potion': 5, 'tough_leather': 3, 'boss_essence': 1 },
        result: { id: 'liquid_courage', usable: true, effect: 'shield_max', effectValue: 100 }
    },
    'energy_brew': {
        name: 'Energy Brew', id: 'energy_brew',
        desc: 'Instantly restores 50 Energy.',
        ingredients: { 'mana_crystal': 1, 'mana_dew': 2, 'healing_herb': 2 },
        result: { id: 'energy_brew', usable: true, effect: 'restore_energy', effectValue: 50 }
    },
    'holy_water': {
        name: 'Holy Water', id: 'holy_water',
        desc: 'Cleanses all debuffs and heals 100 HP.',
        ingredients: { 'mana_dew': 3, 'mana_crystal': 1, 'healing_herb': 5 },
        result: { id: 'holy_water', usable: true, effect: 'cleanse_heal', effectValue: 100 }
    },
    'rabbit_foot': {
        name: 'Rabbit Foot', id: 'rabbit_foot',
        desc: 'Permanent luck boost. (+10 LUCK)',
        ingredients: { 'tough_leather': 1, 'mystic_thread': 2, 'rare_gem': 1 },
        result: { id: 'rabbit_foot', type: 'STAT_BOOST', boost: { stat: 'luck', value: 10 } }
    },
    'chaos_elixir': {
        name: 'Chaos Elixir', id: 'chaos_elixir',
        desc: 'High chance for a massive random buff.',
        ingredients: { 'dark_matter': 1, 'dragon_blood': 1, 'mana_crystal': 5 },
        result: { id: 'chaos_elixir', usable: true, effect: 'random_major_buff' }
    },
    'fortress_potion': {
        name: 'Fortress Potion', id: 'fortress_potion',
        desc: 'Grants an invincible shield for 1 turn.',
        ingredients: { 'obsidian_chunk': 2, 'refined_steel': 5, 'boss_essence': 1 },
        result: { id: 'fortress_potion', usable: true, effect: 'invincibility' }
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
    return { ...CRAFTING_RECIPES, ...BREWING_RECIPES };
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

function performCraft(userId, recipeId) {
    const check = canCraft(userId, recipeId);
    if (!check.canCraft) return { success: false, message: check.reason };

    const recipe = check.recipe;
    const user = economy.getUser(userId);

    // 1. Remove ingredients
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        inventorySystem.removeItem(userId, ingId, qty);
    }

    // 2. Add result
    const resultItem = recipe.result;
    inventorySystem.addItem(userId, resultItem.id, 1, {
        name: recipe.name,
        stats: resultItem.stats || {},
        slot: resultItem.slot,
        type: resultItem.stats ? 'EQUIPMENT' : (resultItem.usable ? 'CONSUMABLE' : 'ITEM')
    });

    // 💡 GUILD BOARD TRACKING
    const guilds = require('./guilds');
    const userGuild = guilds.getUserGuild(userId);
    let guildMsg = "";
    if (userGuild) {
        guilds.updateBoardProgress(userGuild, 'CRAFT', 1);
        guildMsg = `\n🧪 *${userGuild}* Research Lab logged your creation! (+1 Craft Progress)`;
    }

    return { 
        success: true, 
        message: `⚒️ **CRAFT SUCCESSFUL: ${recipe.name}**\n\nYou created 1x ${recipe.name}!${guildMsg}` 
    };
}

function dismantleItem(userId, itemId) {
    const inventory = inventorySystem.getInventory(userId);
    if (!inventory[itemId]) return { success: false, message: "Item not found in inventory." };

    const itemData = inventory[itemId];
    const recipe = Object.values(CRAFTING_RECIPES).find(r => r.result.id === itemId);
    
    if (!recipe) return { success: false, message: "This item cannot be dismantled." };

    // Remove item
    inventorySystem.removeItem(userId, itemId, 1);

    // Return 40% of materials
    const returned = {};
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        const amount = Math.max(1, Math.floor(qty * 0.4));
        inventorySystem.addItem(userId, ingId, amount);
        returned[ingId] = amount;
    }

    let msg = `♻️ **DISMANTLED: ${itemData.name || itemId}**\n\nRecovered materials:\n`;
    for (const [id, qty] of Object.entries(returned)) {
        msg += `- ${qty}x ${lootSystem.getItemInfo(id).name}\n`;
    }

    return { success: true, message: msg };
}

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
    MINING_LOCATIONS
};
