// ============================================
// 💎 COMPLETE LOOT & DROP SYSTEM
// ============================================
// Handles item drops, loot tables, and special drops

const ITEM_RARITY_WEIGHTS = {
    COMMON: 0,
    UNCOMMON: 1,
    RARE: 2,
    EPIC: 3,
    LEGENDARY: 4,
    MYTHIC: 5
};

// ==========================================
// 🎲 LOOT TABLES
// ==========================================

const LOOT_TABLES = {
    // Common enemy drops
    COMMON_ENEMY: {
        dropChance: 45,
        items: [
            { id: 'minor_potion', weight: 30, quantity: [1, 2] },
            { id: 'bandage', weight: 20, quantity: [1, 2] },
            { id: 'healing_herb', weight: 25, quantity: [1, 3] },
            { id: 'refined_steel', weight: 10, quantity: [1, 1] },
            { id: 'tough_leather', weight: 10, quantity: [1, 1] },
            { id: 'gunpowder', weight: 10, quantity: [1, 2] },
            { id: 'spider_silk', weight: 10, quantity: [1, 2] },
            { id: 'iron_shard', weight: 15, quantity: [1, 3] },
            { id: 'equipment_piece', weight: 5, quantity: [1, 1] }
        ]
    },
    
    // Elite enemy drops
    ELITE_ENEMY: {
        dropChance: 75,
        items: [
            { id: 'health_potion', weight: 20, quantity: [1, 2] },
            { id: 'refined_steel', weight: 15, quantity: [2, 4] },
            { id: 'mana_crystal', weight: 15, quantity: [1, 1] },
            { id: 'sharp_whetstone', weight: 10, quantity: [1, 1] },
            { id: 'fire_shard', weight: 8, quantity: [1, 1] },
            { id: 'ice_shard', weight: 8, quantity: [1, 1] },
            { id: 'lightning_shard', weight: 8, quantity: [1, 1] },
            { id: 'demon_hide', weight: 10, quantity: [1, 1] },
            { id: 'ghost_essence', weight: 10, quantity: [1, 1] },
            { id: 'mythril_ore', weight: 10, quantity: [1, 2] },
            { id: 'equipment_piece', weight: 15, quantity: [1, 1] }
        ]
    },
    
    // Boss drops
    BOSS: {
        dropChance: 100,
        items: [
            { id: 'greater_potion', weight: 20, quantity: [2, 3] },
            { id: 'mythril_ore', weight: 15, quantity: [3, 6] },
            { id: 'mana_dew', weight: 12, quantity: [1, 2] },
            { id: 'dark_matter', weight: 10, quantity: [1, 1] },
            { id: 'dragon_blood', weight: 8, quantity: [1, 1] },
            { id: 'ancient_wood', weight: 15, quantity: [1, 2] },
            { id: 'mystic_thread', weight: 15, quantity: [2, 4] },
            { id: 'boss_essence', weight: 15, quantity: [1, 2] },
            { id: 'legendary_shard', weight: 5, quantity: [1, 1] }
        ]
    },
    
    // Treasure chest
    TREASURE: {
        dropChance: 100,
        items: [
            { id: 'gold_pile', weight: 40, quantity: [50, 200] },
            { id: 'health_potion', weight: 25, quantity: [2, 4] },
            { id: 'rare_gem', weight: 15, quantity: [1, 2] },
            { id: 'equipment_piece', weight: 20, quantity: [1, 1] }
        ]
    },
    
    // Trap encounter (on success)
    TRAP_SUCCESS: {
        dropChance: 60,
        items: [
            { id: 'bandage', weight: 50, quantity: [1, 2] },
            { id: 'minor_potion', weight: 30, quantity: [1, 1] },
            { id: 'gold_pile', weight: 20, quantity: [20, 50] }
        ]
    },
    
    // Puzzle reward
    PUZZLE_REWARD: {
        dropChance: 80,
        items: [
            { id: 'wisdom_tome', weight: 30, quantity: [1, 1] },
            { id: 'skill_scroll', weight: 25, quantity: [1, 1] },
            { id: 'rare_gem', weight: 20, quantity: [1, 1] },
            { id: 'gold_pile', weight: 25, quantity: [100, 300] }
        ]
    },
    
    // Merchant special
    MERCHANT_GIFT: {
        dropChance: 30, // Rare gift from merchant
        items: [
            { id: 'discount_coupon', weight: 40, quantity: [1, 1] },
            { id: 'merchant_token', weight: 30, quantity: [1, 1] },
            { id: 'rare_item_ticket', weight: 20, quantity: [1, 1] },
            { id: 'gold_pile', weight: 10, quantity: [500, 1000] }
        ]
    }
};

// ==========================================
// 👹 BOSS-SPECIFIC DROPS
// ==========================================

const BOSS_DROPS = {
    'INFECTED_COLOSSUS': {
        guaranteed: [{ id: 'bandage', quantity: [2, 4], rarity: 'COMMON' }],
        special: [{ id: 'leather_tunic', dropChance: 30, quantity: 1, rarity: 'COMMON' }]
    },
    'CORRUPTED_GUARDIAN': {
        guaranteed: [{ id: 'health_potion', quantity: [1, 2], rarity: 'COMMON' }],
        special: [{ id: 'iron_sword', dropChance: 25, quantity: 1, rarity: 'UNCOMMON' }]
    },
    'ELEMENTAL_ARCHON': {
        guaranteed: [{ id: 'greater_potion', quantity: 1, rarity: 'UNCOMMON' }],
        special: [{ id: 'arcane_wand', dropChance: 20, quantity: 1, rarity: 'RARE' }]
    },
    'MUTATION_PRIME': {
        guaranteed: [{ id: 'rare_gem', quantity: 1, rarity: 'RARE' }],
        special: [{ id: 'essence_mirror', dropChance: 40, quantity: 1, rarity: 'LEGENDARY', announcement: '🪞 *LEGENDARY DROP!* The Mutation Prime drops a shimmering Essence Mirror!' }]
    },
    'VOID_CORRUPTED': {
        guaranteed: [{ id: 'legendary_shard', quantity: 1, rarity: 'EPIC' }],
        special: [{ id: 'plate_armor', dropChance: 30, quantity: 1, rarity: 'RARE' }]
    },
    'PRIMORDIAL_CHAOS': {
        guaranteed: [{ id: 'void_essence', quantity: 1, rarity: 'MYTHIC' }],
        special: [{ id: 'essence_mirror', dropChance: 10, quantity: 1, rarity: 'LEGENDARY' }]
    },
    
    // LICH - Mirror Essence (30% drop chance)
    LICH: {
        guaranteed: [],
        special: [
            { 
                id: 'mirror_essence', 
                dropChance: 30,  // 30% chance
                quantity: 1,
                rarity: 'LEGENDARY',
                announcement: '🌟 *LEGENDARY DROP!* A Mirror Essence materializes from the Lich\'s remains!'
            },
            {
                id: 'lich_phylactery',
                dropChance: 15,
                quantity: 1,
                rarity: 'EPIC',
                announcement: '💀 The Lich\'s phylactery cracks and reveals a dark gem!'
            }
        ]
    },
    
    DRAGON: {
        guaranteed: [
            { id: 'dragon_scale', quantity: [2, 4], rarity: 'RARE' }
        ],
        special: [
            {
                id: 'dragon_heart',
                dropChance: 20,
                quantity: 1,
                rarity: 'LEGENDARY',
                announcement: '🔥 *LEGENDARY DROP!* The Dragon\'s Heart still beats with ancient power!'
            }
        ]
    },
    
    DEMON_LORD: {
        guaranteed: [
            { id: 'demon_horn', quantity: [1, 2], rarity: 'EPIC' }
        ],
        special: [
            {
                id: 'infernal_crown',
                dropChance: 25,
                quantity: 1,
                rarity: 'MYTHIC',
                announcement: '👑 *MYTHIC DROP!* The Infernal Crown materializes in flames!'
            }
        ]
    },
    
    ANCIENT_GOLEM: {
        guaranteed: [
            { id: 'golem_core', quantity: 1, rarity: 'RARE' }
        ],
        special: [
            {
                id: 'titan_heart',
                dropChance: 15,
                quantity: 1,
                rarity: 'LEGENDARY',
                announcement: '💎 *LEGENDARY DROP!* A Titan Heart emerges from the golem\'s core!'
            }
        ]
    },
    
    VOID_HORROR: {
        guaranteed: [
            { id: 'void_crystal', quantity: [1, 3], rarity: 'EPIC' }
        ],
        special: [
            {
                id: 'void_essence',
                dropChance: 10,
                quantity: 1,
                rarity: 'MYTHIC',
                announcement: '🌌 *MYTHIC DROP!* The Void Essence fractures reality itself!'
            }
        ]
    },
    
    ELDER_WYRM: {
        guaranteed: [
            { id: 'wyrm_fang', quantity: [2, 3], rarity: 'RARE' }
        ],
        special: [
            {
                id: 'elder_blood',
                dropChance: 20,
                quantity: 1,
                rarity: 'LEGENDARY',
                announcement: '🩸 *LEGENDARY DROP!* Elder Blood pools with ancient magic!'
            }
        ]
    },
    
    MUTATION_PRIME: {
        guaranteed: [
            { id: 'rare_gem', quantity: 1, rarity: 'RARE' }
        ],
        special: [
            {
                id: 'essence_mirror',
                dropChance: 40,
                quantity: 1,
                rarity: 'LEGENDARY',
                announcement: '🪞 *LEGENDARY DROP!* The Mutation Prime drops a shimmering Essence Mirror!'
            }
        ]
    }
};

// ==========================================
// 💰 GOLD DROPS
// ==========================================

const GOLD_RANGES = {
    COMMON_ENEMY: [10, 30],
    ELITE_ENEMY: [50, 100],
    BOSS: [200, 500],
    TRAP_SUCCESS: [20, 50],
    PUZZLE_SUCCESS: [50, 150],
    TREASURE: [100, 300],
    MERCHANT_BONUS: [50, 200]
};

// ==========================================
// 🎁 DROP GENERATION
// ==========================================

function rollDrop(lootTable) {
    // Check if anything drops
    if (Math.random() * 100 > lootTable.dropChance) {
        return null;
    }
    
    // Calculate total weight
    const totalWeight = lootTable.items.reduce((sum, item) => sum + item.weight, 0);
    
    // Roll for item
    let roll = Math.random() * totalWeight;
    
    for (const item of lootTable.items) {
        roll -= item.weight;
        if (roll <= 0) {
            // Determine quantity
            const [min, max] = item.quantity;
            const quantity = Math.floor(Math.random() * (max - min + 1)) + min;
            
            // Fetch default rarity from database if not in loot table
            const dbInfo = ITEM_DATABASE[item.id];
            const finalRarity = item.rarity || dbInfo?.rarity || 'COMMON';
            
            // 🎲 Special Logic: If the item rolled is a generic 'equipment_piece', roll for a real equipment from database
            if (item.id === 'equipment_piece') {
                const equipmentList = Object.entries(ITEM_DATABASE).filter(([id, data]) => data.type === 'EQUIPMENT');
                if (equipmentList.length > 0) {
                    const [eqId, eqData] = equipmentList[Math.floor(Math.random() * equipmentList.length)];
                    
                    // 💡 PROCEDURAL AFFIX LOGIC (Diablo Style)
                    let resultItem = { 
                        id: eqId, 
                        quantity: 1, 
                        rarity: eqData.rarity || 'COMMON',
                        name: eqData.name,
                        stats: { ...eqData.stats }
                    };

                    // Only roll affixes for Rare and above, or a 15% chance for others
                    if (ITEM_RARITY_WEIGHTS[resultItem.rarity] >= 2 || Math.random() < 0.15) {
                        const prefixes = [
                            { name: 'Sturdy', stats: { def: 5, hp: 15 } },
                            { name: 'Sharp', stats: { atk: 8 } },
                            { name: 'Glowing', stats: { mag: 10 } },
                            { name: 'Light', stats: { spd: 10 } },
                            { name: 'Lucky', stats: { luck: 15 } }
                        ];
                        const suffixes = [
                            { name: 'of Might', stats: { atk: 15 } },
                            { name: 'of Protection', stats: { def: 10 } },
                            { name: 'of Haste', stats: { spd: 15 } },
                            { name: 'of Sages', stats: { mag: 20 } },
                            { name: 'of Fortune', stats: { luck: 25 } }
                        ];

                        if (Math.random() < 0.4) {
                            const p = prefixes[Math.floor(Math.random() * prefixes.length)];
                            resultItem.name = `${p.name} ${resultItem.name}`;
                            for (const [s, v] of Object.entries(p.stats)) resultItem.stats[s] = (resultItem.stats[s] || 0) + v;
                        }
                        if (Math.random() < 0.3) {
                            const s = suffixes[Math.floor(Math.random() * suffixes.length)];
                            resultItem.name = `${resultItem.name} ${s.name}`;
                            for (const [stat, val] of Object.entries(s.stats)) resultItem.stats[stat] = (resultItem.stats[stat] || 0) + val;
                        }
                    }

                    return resultItem;
                }
            }

            return {
                id: item.id,
                quantity,
                rarity: finalRarity
            };
        }
    }
    
    return null;
}

function generateLoot(encounterType, enemyName = null, difficulty = 1.0) {
    const drops = [];
    
    // Determine loot table
    let lootTable = LOOT_TABLES.COMMON_ENEMY;
    
    if (encounterType === 'ELITE_COMBAT') {
        lootTable = LOOT_TABLES.ELITE_ENEMY;
    } else if (encounterType === 'BOSS') {
        lootTable = LOOT_TABLES.BOSS;
        
        // Check for boss-specific drops
        if (enemyName && BOSS_DROPS[enemyName]) {
            const bossLoot = BOSS_DROPS[enemyName];
            
            // Guaranteed drops
            for (const guaranteedDrop of bossLoot.guaranteed) {
                const [min, max] = guaranteedDrop.quantity;
                const quantity = Math.floor(Math.random() * (max - min + 1)) + min;
                const dbInfo = ITEM_DATABASE[guaranteedDrop.id];
                
                drops.push({
                    id: guaranteedDrop.id,
                    quantity,
                    rarity: guaranteedDrop.rarity || dbInfo?.rarity || 'COMMON',
                    source: enemyName
                });
            }
            
            // Special drops (chance-based)
            for (const specialDrop of bossLoot.special) {
                if (Math.random() * 100 < specialDrop.dropChance) {
                    const dbInfo = ITEM_DATABASE[specialDrop.id];
                    drops.push({
                        id: specialDrop.id,
                        quantity: specialDrop.quantity,
                        rarity: specialDrop.rarity || dbInfo?.rarity || 'COMMON',
                        announcement: specialDrop.announcement,
                        source: enemyName
                    });
                }
            }
        }
    } else if (encounterType === 'TREASURE') {
        lootTable = LOOT_TABLES.TREASURE;
    } else if (encounterType === 'TRAP') {
        lootTable = LOOT_TABLES.TRAP_SUCCESS;
    } else if (encounterType === 'PUZZLE') {
        lootTable = LOOT_TABLES.PUZZLE_REWARD;
    } else if (encounterType === 'MERCHANT') {
        lootTable = LOOT_TABLES.MERCHANT_GIFT;
    }
    
    // Roll for standard drops
    const standardDrop = rollDrop(lootTable);
    if (standardDrop) {
        drops.push(standardDrop);
    }
    
    // Difficulty multiplier (chance for extra drops)
    if (difficulty >= 2.0 && Math.random() < 0.3) {
        const bonusDrop = rollDrop(lootTable);
        if (bonusDrop) {
            drops.push(bonusDrop);
        }
    }
    
    return drops;
}

function generateGoldDrop(encounterType, difficulty = 1.0) {
    let range = GOLD_RANGES.COMMON_ENEMY;
    
    switch (encounterType) {
        case 'ELITE_COMBAT':
            range = GOLD_RANGES.ELITE_ENEMY;
            break;
        case 'BOSS':
            range = GOLD_RANGES.BOSS;
            break;
        case 'TREASURE':
            range = GOLD_RANGES.TREASURE;
            break;
        case 'TRAP':
            range = GOLD_RANGES.TRAP_SUCCESS;
            break;
        case 'PUZZLE':
            range = GOLD_RANGES.PUZZLE_SUCCESS;
            break;
        case 'MERCHANT':
            range = GOLD_RANGES.MERCHANT_BONUS;
            break;
    }
    
    const [min, max] = range;
    const baseGold = Math.floor(Math.random() * (max - min + 1)) + min;
    
    // Apply difficulty multiplier
    return Math.floor(baseGold * difficulty);
}

// ==========================================
// 🎁 DISTRIBUTE LOOT TO PLAYERS
// ==========================================

function distributeLoot(players, encounterType, enemyName = null, difficulty = 1.0) {
    const inventorySystem = require('./inventorySystem');
    const loot = generateLoot(encounterType, enemyName, difficulty);
    const goldDrop = generateGoldDrop(encounterType, difficulty);
    
    const results = {
        items: [],
        gold: goldDrop,
        announcements: []
    };
    
    // Distribute items
    for (const drop of loot) {
        const itemInfo = getItemInfo(drop.id);
        
        // Check for announcements (legendary/mythic drops)
        if (drop.announcement) {
            results.announcements.push(drop.announcement);
        }
        
        // Add to each player's inventory
        for (const player of players) {
            const addResult = inventorySystem.addItem(
                player.jid,
                drop.id,
                drop.quantity,
                {
                    name: itemInfo.name,
                    rarity: drop.rarity || itemInfo.rarity,
                    type: itemInfo.type || 'MATERIAL',
                    stats: itemInfo.stats,
                    slot: itemInfo.slot,
                    source: drop.source || encounterType,
                    acquiredAt: Date.now()
                }
            );
            
            if (addResult.success) {
                results.items.push({
                    playerId: player.jid,
                    playerName: player.name,
                    id: drop.id,
                    name: itemInfo.name,
                    quantity: drop.quantity,
                    rarity: drop.rarity
                });
            }
        }
    }
    
    return results;
}

// ==========================================
// 🔍 ITEM DATABASE
// ==========================================

const ITEM_DATABASE = {
    // --- CRAFTING MATERIALS ---
    'refined_steel': { name: 'Refined Steel', description: 'High-quality steel. Tastes like pennies.', rarity: 'UNCOMMON', value: 500 },
    'sharp_whetstone': { name: 'Sharp Whetstone', description: 'Used to sharpen high-end blades. Not a snack.', rarity: 'UNCOMMON', value: 300 },
    'mythril_ore': { name: 'Mythril Ore', description: 'A rare blue ore. Surprisingly heavy for a bunch of pixels.', rarity: 'RARE', value: 1200 },
    'mana_crystal': { name: 'Mana Crystal', description: 'Concentrated magic. Smells like static electricity.', rarity: 'RARE', value: 1500 },
    'tough_leather': { name: 'Tough Leather', description: 'Thick hide. Smells like wet dog.', rarity: 'UNCOMMON', value: 400 },
    'gunpowder': { name: 'Volatile Gunpowder', description: 'Handle with care. Or dont, I am a bot, not your mom.', rarity: 'COMMON', value: 200 },
    'fire_essence': { name: 'Fire Essence', description: 'A flickering flame. Bad for pockets.', rarity: 'RARE', value: 1000 },
    'dark_matter': { name: 'Dark Matter', description: 'Heavier than your student loans.', rarity: 'EPIC', value: 2500 },
    'healing_herb': { name: 'Sun-kissed Herb', description: 'Natural medicine. Legal in most kingdoms.', rarity: 'COMMON', value: 150 },
    'mana_dew': { name: 'Mana Dew', description: 'Rare condensation. Basically magic Gatorade.', rarity: 'RARE', value: 800 },
    'dragon_blood': { name: 'Dragon Blood', description: 'Smells like cinnamon and regret.', rarity: 'LEGENDARY', value: 5000 },
    'iron_shard': { name: 'Iron Shard', description: 'Metal fragments. Collect enough to build a personality.', rarity: 'COMMON', value: 100 },
    'gold_pile': { name: 'Pile of Gold', description: 'A small pile of glinting coins.', rarity: 'COMMON', value: 1 },
    'infected_shard': { name: '☣️ Infected Shard', description: 'Concentrated essence of the Hive. DO NOT TOUCH.', rarity: 'EPIC', value: 3000, type: 'MATERIAL' },
    'infected_heart': { name: '☣️ Pulsing Heart', description: 'It is still beating... barely.', rarity: 'EPIC', value: 2000, type: 'MATERIAL' },

    // --- WILDERNESS: FISH ---
    'common_fish': { name: 'Small Bass', description: 'A common fish found in many ponds.', rarity: 'COMMON', value: 50, type: 'MATERIAL' },
    'rare_fish': { name: 'Rainbow Trout', description: 'A beautifully colored, rare fish.', rarity: 'RARE', value: 350, type: 'MATERIAL' },
    'mythic_fish': { name: 'Void Kraken Tentacle', description: 'A legendary find from the deep abyss.', rarity: 'MYTHIC', value: 5000, type: 'MATERIAL' },
    'infected_fish': { name: '☣️ Corrupted Eel', description: 'Twisting with bio-hazard energy.', rarity: 'EPIC', value: 1500, type: 'MATERIAL' },

    // --- WILDERNESS: HUNTING ---
    'rabbit_hide': { name: 'Rabbit Hide', description: 'Soft and common fur.', rarity: 'COMMON', value: 40, type: 'MATERIAL' },
    'deer_antler': { name: 'Deer Antlers', description: 'Majestic and useful for crafting.', rarity: 'UNCOMMON', value: 200, type: 'MATERIAL' },
    'bear_claw': { name: 'Bear Claws', description: 'Sharp and dangerous.', rarity: 'RARE', value: 800, type: 'MATERIAL' },

    // --- CRAFTED GEAR ---
    'steel_sabre': { name: 'Steel Sabre', description: 'A sharp, finely forged blade. (+25 ATK, +5 SPD)', rarity: 'RARE', value: 8000, type: 'EQUIPMENT', stats: { atk: 25, spd: 5 }, slot: 'main_hand', reqLevel: 10, element: 'PHYSICAL' },
    'mythril_staff': { name: 'Mythril Staff', description: 'Amplifies magical resonance. (+40 MAG, +10 HP)', rarity: 'EPIC', value: 15000, type: 'EQUIPMENT', stats: { mag: 40, hp: 10 }, slot: 'main_hand', reqLevel: 20, element: 'MAGICAL', isTwoHanded: true },
    'reinforced_plate': { name: 'Reinforced Plate', description: 'Impenetrable steel plating. (+45 DEF, +50 HP)', rarity: 'EPIC', value: 12000, type: 'EQUIPMENT', stats: { def: 45, hp: 50 }, slot: 'armor', reqLevel: 15 },

    // --- NEW GEAR: WEAPONS ---
    'shadow_dagger': { name: 'Shadow Dagger', description: 'A blade that thirsts for blood. (+30 ATK, +15 SPD)', rarity: 'RARE', value: 7500, type: 'EQUIPMENT', stats: { atk: 30, spd: 15 }, slot: 'main_hand', reqLevel: 12, element: 'DARK' },
    'warhammer': { name: 'Paladin Warhammer', description: 'Heavy and blessed. (+35 ATK, +10 DEF)', rarity: 'RARE', value: 8500, type: 'EQUIPMENT', stats: { atk: 35, def: 10 }, slot: 'main_hand', reqLevel: 15, element: 'HOLY', isTwoHanded: true },
    'death_scythe': { name: 'Reaper Scythe', description: 'Harvests the souls of the living. (+45 ATK, +20 MAG)', rarity: 'EPIC', value: 14000, type: 'EQUIPMENT', stats: { atk: 45, mag: 20 }, slot: 'main_hand', reqLevel: 25, element: 'DEATH', isTwoHanded: true },
    'chrono_blade': { name: 'Chrono Blade', description: 'A sword that exists in multiple timelines. (+25 ATK, +40 SPD)', rarity: 'EPIC', value: 16000, type: 'EQUIPMENT', stats: { atk: 25, spd: 40 }, slot: 'main_hand', reqLevel: 25, element: 'TIME' },
    'golden_cane': { name: 'Merchant Cane', description: 'Wealth is power. (+20 ATK, +50 LUCK)', rarity: 'RARE', value: 9000, type: 'EQUIPMENT', stats: { atk: 20, luck: 50 }, slot: 'main_hand', reqLevel: 10 },
    'multi_tool': { name: 'Artificer Tool', description: 'A gadget for every situation. (+25 ATK, +25 MAG, +10 DEF)', rarity: 'RARE', value: 9500, type: 'EQUIPMENT', stats: { atk: 25, mag: 25, def: 10 }, slot: 'main_hand', reqLevel: 10 },
    'greataxe': { name: 'Berserker Axe', description: 'Pure, unadulterated rage. (+55 ATK, -10 DEF)', rarity: 'EPIC', value: 13000, type: 'EQUIPMENT', stats: { atk: 55, def: -10 }, slot: 'main_hand', reqLevel: 20, element: 'PHYSICAL', isTwoHanded: true },
    'elemental_wand': { name: 'Prism Wand', description: 'Channels the four elements. (+50 MAG)', rarity: 'EPIC', value: 14500, type: 'EQUIPMENT', stats: { mag: 50 }, slot: 'main_hand', reqLevel: 20, element: 'ELEMENTAL' },
    'storm_bow': { name: 'Storm Bow', description: 'Shoots arrows of pure lightning. (+40 ATK, +20 SPD)', rarity: 'EPIC', value: 15500, type: 'EQUIPMENT', stats: { atk: 40, spd: 20 }, slot: 'main_hand', reqLevel: 20, element: 'LIGHTNING', isTwoHanded: true },
    'excalibur_fake': { name: 'Excaliburn', description: 'A very convincing replica. (+60 ATK)', rarity: 'LEGENDARY', value: 25000, type: 'EQUIPMENT', stats: { atk: 60 }, slot: 'main_hand', reqLevel: 30, element: 'PHYSICAL' },

    // --- NEW GEAR: ARMOR ---
    'stealth_garb': { name: 'Stealth Garb', description: 'Quiet and lightweight. (+15 DEF, +30 SPD)', rarity: 'RARE', value: 6500, type: 'EQUIPMENT', stats: { def: 15, spd: 30 }, slot: 'armor', reqLevel: 12 },
    'holy_raiment': { name: 'Holy Raiment', description: 'Blessed by the divine. (+25 DEF, +40 MAG)', rarity: 'RARE', value: 8000, type: 'EQUIPMENT', stats: { def: 25, mag: 40 }, slot: 'armor', reqLevel: 15 },
    'dragon_plate': { name: 'Dragon Armor', description: 'Forged from dragon scales. (+60 DEF, +100 HP)', rarity: 'LEGENDARY', value: 30000, type: 'EQUIPMENT', stats: { def: 60, hp: 100 }, slot: 'armor', reqLevel: 35 },
    'void_cloak': { name: 'Void Cloak', description: 'Absorbs light and damage. (+40 DEF, +20% Evasion)', rarity: 'EPIC', value: 18000, type: 'EQUIPMENT', stats: { def: 40, spd: 25 }, slot: 'armor', reqLevel: 25, element: 'VOID' },
    'archmage_robes': { name: 'Archmage Robes', description: 'The pinnacle of wizardry. (+20 DEF, +80 MAG)', rarity: 'LEGENDARY', value: 35000, type: 'EQUIPMENT', stats: { def: 20, mag: 80 }, slot: 'armor', reqLevel: 40, element: 'MAGICAL' },
    'knight_shield': { name: 'Knight Shield', description: 'A sturdy heater shield. (+35 DEF)', rarity: 'UNCOMMON', value: 3000, type: 'EQUIPMENT', stats: { def: 35 }, slot: 'off_hand', reqLevel: 5, isShield: true },

    // --- NEW GEAR: HELMETS ---
    'iron_helm': { name: 'Iron Helmet', description: 'Basic protection. (+10 DEF)', rarity: 'COMMON', value: 1000, type: 'EQUIPMENT', stats: { def: 10 }, slot: 'helmet', reqLevel: 1 },
    'wizard_hat': { name: 'Wizard Hat', description: 'Classic pointy hat. (+15 MAG)', rarity: 'UNCOMMON', value: 2500, type: 'EQUIPMENT', stats: { mag: 15 }, slot: 'helmet', reqLevel: 5 },
    'assassin_hood': { name: 'Shadow Hood', description: 'Hides your face. (+5 DEF, +10 SPD, +5% Crit)', rarity: 'RARE', value: 5000, type: 'EQUIPMENT', stats: { def: 5, spd: 10, crit: 5 }, slot: 'helmet', reqLevel: 10 },
    'dragon_horn_crown': { name: 'Dragon Crown', description: 'Crown of a dragon slayer. (+20 DEF, +30 ATK)', rarity: 'EPIC', value: 15000, type: 'EQUIPMENT', stats: { def: 20, atk: 30 }, slot: 'helmet', reqLevel: 30 },

    // --- NEW GEAR: BOOTS ---
    'leather_boots': { name: 'Leather Boots', description: 'Simple walking boots. (+5 SPD)', rarity: 'COMMON', value: 800, type: 'EQUIPMENT', stats: { spd: 5 }, slot: 'boots', reqLevel: 1 },
    'heavy_greaves': { name: 'Heavy Greaves', description: 'Protected but slow. (+20 DEF, -5 SPD)', rarity: 'UNCOMMON', value: 3500, type: 'EQUIPMENT', stats: { def: 20, spd: -5 }, slot: 'boots', reqLevel: 10 },
    'winged_sandals': { name: 'Winged Sandals', description: 'Feel as light as a feather. (+40 SPD)', rarity: 'EPIC', value: 12000, type: 'EQUIPMENT', stats: { spd: 40 }, slot: 'boots', reqLevel: 25 },

    // --- NEW GEAR: ACCESSORIES ---
    'health_pendant': { name: 'Vitality Amulet', description: 'Increases max health. (+50 HP)', rarity: 'UNCOMMON', value: 4000, type: 'EQUIPMENT', stats: { hp: 50 }, slot: 'amulet', reqLevel: 1 },
    'power_ring': { name: 'Ring of Might', description: 'Increases physical power. (+15 ATK)', rarity: 'RARE', value: 6000, type: 'EQUIPMENT', stats: { atk: 15 }, slot: 'ring', reqLevel: 10 },
    'intellect_ring': { name: 'Sage Ring', description: 'Increases magical power. (+20 MAG)', rarity: 'RARE', value: 6000, type: 'EQUIPMENT', stats: { mag: 20 }, slot: 'ring', reqLevel: 10 },
    'thief_gloves': { name: 'Thief Gloves', description: 'Sticky fingers. (+15 LUCK, +10 SPD)', rarity: 'UNCOMMON', value: 3000, type: 'EQUIPMENT', stats: { luck: 15, spd: 10 }, slot: 'gloves', reqLevel: 5 },

    // --- CRAFTED CONSUMABLES ---
    'mega_potion': { name: 'Mega Health Potion', description: 'Restores 250 HP.', rarity: 'RARE', value: 2000, usable: true, effect: 'heal', effectValue: 250 },
    'elixir_of_power': { name: 'Elixir of Power', description: 'Boosts ATK and MAG by 50% for 5 turns.', rarity: 'EPIC', value: 5000, usable: true, effect: 'buff_all', effectValue: 50, duration: 5 },
    'liquid_courage': { name: 'Liquid Courage', description: 'Grants a massive temporary shield.', rarity: 'RARE', value: 3500, usable: true, effect: 'shield_max', effectValue: 100 },
    'fire_bomb': { name: 'Fire Bomb', description: 'Deals 150 fire damage to all enemies.', rarity: 'UNCOMMON', value: 1500, usable: true, effect: 'aoe_damage', effectValue: 150 },
    'void_grenade': { name: 'Void Grenade', description: 'Deals 300 damage and reduces enemy DEF.', rarity: 'RARE', value: 5000, usable: true, effect: 'aoe_debuff_damage', effectValue: 300 },

    // --- POTIONS & STANDARD ITEMS ---
    'minor_potion': {
        name: 'Minor Health Potion',
        description: 'Restores 30 HP',
        rarity: 'COMMON',
        value: 50,
        usable: true,
        effect: 'heal',
        effectValue: 30
    },
    'health_potion': {
        name: 'Health Potion',
        description: 'Restores 60 HP',
        rarity: 'COMMON',
        value: 100,
        usable: true,
        effect: 'heal',
        effectValue: 60
    },

    // --- WILDERNESS: FISH ---
    'common_fish': { name: 'Small Bass', description: 'A common fish found in many ponds.', rarity: 'COMMON', value: 50, type: 'MATERIAL' },
    'rare_fish': { name: 'Rainbow Trout', description: 'A beautifully colored, rare fish.', rarity: 'RARE', value: 350, type: 'MATERIAL' },
    'mythic_fish': { name: 'Void Kraken Tentacle', description: 'A legendary find from the deep abyss.', rarity: 'MYTHIC', value: 5000, type: 'MATERIAL' },
    'infected_fish': { name: '☣️ Corrupted Eel', description: 'Twisting with bio-hazard energy.', rarity: 'EPIC', value: 1500, type: 'MATERIAL' },

    // --- WILDERNESS: HUNTING ---
    'rabbit_hide': { name: 'Rabbit Hide', description: 'Soft and common fur.', rarity: 'COMMON', value: 40, type: 'MATERIAL' },
    'deer_antler': { name: 'Deer Antlers', description: 'Majestic and useful for crafting.', rarity: 'UNCOMMON', value: 200, type: 'MATERIAL' },
    'bear_claw': { name: 'Bear Claws', description: 'Sharp and dangerous.', rarity: 'RARE', value: 800, type: 'MATERIAL' },
    'infected_heart': { name: '☣️ Pulsing Heart', description: 'It is still beating... barely.', rarity: 'EPIC', value: 2000, type: 'MATERIAL' },
    'infected_shard': { name: '☣️ Infected Shard', description: 'Concentrated essence of the Hive.', rarity: 'EPIC', value: 3000, type: 'MATERIAL' },
    'mana_potion': {
        name: 'Mana Potion',
        description: 'Restores 30 Energy',
        rarity: 'COMMON',
        value: 400,
        usable: true,
        effect: 'restore_energy',
        effectValue: 30
    },
    'greater_potion': {
        name: 'Greater Health Potion',
        description: 'Restores 120 HP',
        rarity: 'UNCOMMON',
        value: 250,
        usable: true,
        effect: 'heal',
        effectValue: 120
    },
    'major_potion': {
        name: 'Major Health Potion',
        description: 'Restores 120 HP',
        rarity: 'RARE',
        value: 1200,
        usable: true,
        effect: 'heal',
        effectValue: 120
    },
    'elixir': {
        name: 'Full Restore Elixir',
        description: 'Fully restores HP',
        rarity: 'EPIC',
        value: 3000,
        usable: true,
        effect: 'heal',
        effectValue: 999
    },
    'regen_salve': {
        name: 'Regeneration Salve',
        description: 'Heals 15 HP per turn for 3 turns',
        rarity: 'COMMON',
        value: 800,
        usable: true,
        effect: 'regen',
        effectValue: 15,
        duration: 3
    },
    'ether': {
        name: 'Ether',
        description: 'Fully restores Energy',
        rarity: 'RARE',
        value: 1000,
        usable: true,
        effect: 'restore_energy',
        effectValue: 100
    },
    'defense_tonic': {
        name: 'Defense Tonic',
        description: 'Increases DEF by 25% for 3 turns',
        rarity: 'UNCOMMON',
        value: 600,
        usable: true,
        effect: 'buff_def',
        effectValue: 25
    },
    'speed_elixir': {
        name: 'Speed Elixir',
        description: 'Increases SPD by 30% for 3 turns',
        rarity: 'UNCOMMON',
        value: 600,
        usable: true,
        effect: 'buff_spd',
        effectValue: 30
    },
    'lucky_charm': {
        name: 'Lucky Charm',
        description: 'Increases LUCK by 40% for 3 turns',
        rarity: 'RARE',
        value: 800,
        usable: true,
        effect: 'buff_luck',
        effectValue: 40
    },
    'berserker_pill': {
        name: 'Berserker Pill',
        description: 'Massive damage boost, but lowers defense',
        rarity: 'EPIC',
        value: 1500,
        usable: true,
        effect: 'buff_all_damage',
        effectValue: 50
    },
    'phoenix_down': {
        name: 'Phoenix Down',
        description: 'Revives a fallen ally with 50% HP',
        rarity: 'RARE',
        value: 2500,
        usable: true,
        effect: 'revive',
        effectValue: 50
    },
    'berserker_pill': {
        name: 'Berserker Pill',
        description: 'Massive damage boost, but lowers defense',
        rarity: 'EPIC',
        value: 1500,
        usable: true,
        effect: 'buff_all_damage',
        effectValue: 50
    },
    'bomb': {
        name: 'Bomb',
        description: 'Deals 80 area damage to all enemies',
        rarity: 'UNCOMMON',
        value: 1000,
        usable: true,
        effect: 'damage_aoe',
        effectValue: 80
    },
    'smoke_bomb': {
        name: 'Smoke Bomb',
        description: 'Allows the party to escape combat',
        rarity: 'COMMON',
        value: 500,
        usable: true,
        effect: 'flee',
        effectValue: 80
    },
    'bomb': {
        name: 'Bomb',
        description: 'Deals 80 area damage to all enemies',
        rarity: 'UNCOMMON',
        value: 1000,
        usable: true,
        effect: 'damage_aoe',
        effectValue: 80
    },
    'regen_salve': {
        name: 'Regeneration Salve',
        description: 'Heals 15 HP per turn for 3 turns',
        rarity: 'COMMON',
        value: 800,
        usable: true,
        effect: 'regen',
        effectValue: 15,
        duration: 3
    },
    
    // Utility
    'bandage': {
        name: 'Bandage',
        description: 'Stop bleeding and heal 15 HP',
        rarity: 'COMMON',
        value: 20,
        usable: true,
        effect: 'heal',
        effectValue: 15
    },
    'strength_brew': {
        name: 'Strength Brew',
        description: 'Boost ATK for a short duration',
        rarity: 'UNCOMMON',
        value: 800,
        usable: true,
        effect: 'buff_atk',
        effectValue: 25
    },
    
    // Special drops
    'mirror_essence': {
        name: 'Mirror Essence',
        description: 'A crystallized fragment of dark power.',
        rarity: 'LEGENDARY',
        value: 5000,
        usable: false
    },
    'boss_essence': {
        name: 'Boss Essence',
        description: 'Concentrated power from a mighty boss.',
        rarity: 'RARE',
        value: 500,
        usable: false
    },
    'dragon_scale': {
        name: 'Dragon Scale',
        description: 'A shimmering dragon scale.',
        rarity: 'RARE',
        value: 800,
        usable: false
    },
    'dragon_heart': {
        name: 'Dragon Heart',
        description: 'The still-beating heart of a dragon.',
        rarity: 'LEGENDARY',
        value: 10000,
        usable: false
    },
    'rare_gem': {
        name: 'Rare Gem',
        description: 'A precious gemstone with magical properties.',
        rarity: 'RARE',
        value: 300,
        usable: false
    },
    'legendary_shard': {
        name: 'Legendary Shard',
        description: 'Fragment of a legendary artifact.',
        rarity: 'EPIC',
        value: 1000,
        usable: false
    },
    'essence_mirror': {
        name: 'Essence Mirror',
        description: 'Allows you to mirror skills from other classes.',
        rarity: 'LEGENDARY',
        value: 50000,
        usable: false
    },
    'phoenix_feather': {
        name: 'Phoenix Feather',
        description: 'Revives a fallen ally with 50% HP.',
        rarity: 'RARE',
        value: 500,
        usable: true,
        effect: 'revive',
        effectValue: 50
    }
};

function getItemInfo(itemId) {
    return ITEM_DATABASE[itemId] || {
        name: itemId,
        description: 'Unknown item',
        rarity: 'COMMON',
        value: 10
    };
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
    // Loot generation
    generateLoot,
    generateGoldDrop,
    distributeLoot,
    
    // Item info
    getItemInfo,
    
    // Config
    LOOT_TABLES,
    BOSS_DROPS,
    GOLD_RANGES,
    ITEM_DATABASE
};
