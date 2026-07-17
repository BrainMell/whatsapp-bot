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
            { id: 'minor_hp_potion', weight: 30, quantity: [1, 2] },
            { id: 'bandage', weight: 20, quantity: [1, 2] },
            { id: 'healing_herb', weight: 25, quantity: [1, 3] },
            { id: 'refined_steel', weight: 10, quantity: [1, 1] },
            { id: 'tough_leather', weight: 10, quantity: [1, 1] },
            { id: 'gunpowder', weight: 10, quantity: [1, 2] },
            { id: 'spider_silk', weight: 10, quantity: [1, 2] },
            { id: 'iron_shard', weight: 15, quantity: [1, 3] },
            { id: 'minor_enhancement_stone', weight: 5, quantity: [1, 1] },
            { id: 'equipment_piece', weight: 5, quantity: [1, 1] },
            { id: 'bronze_spear', weight: 5, quantity: [1, 1] },
            { id: 'chainmail', weight: 5, quantity: [1, 1] },
        ]
    },
    
    // Elite enemy drops
    ELITE_ENEMY: {
        dropChance: 75,
        items: [
            { id: 'hp_potion', weight: 20, quantity: [1, 2] },
            { id: 'remedy', weight: 12, quantity: [1, 1] },
            { id: 'refined_steel', weight: 15, quantity: [2, 4] },
            { id: 'mana_crystal', weight: 15, quantity: [1, 1] },
            { id: 'sharp_whetstone', weight: 10, quantity: [1, 1] },
            { id: 'fire_shard', weight: 8, quantity: [1, 1] },
            { id: 'ice_shard', weight: 8, quantity: [1, 1] },
            { id: 'lightning_shard', weight: 8, quantity: [1, 1] },
            { id: 'demon_hide', weight: 10, quantity: [1, 1] },
            { id: 'ghost_essence', weight: 10, quantity: [1, 1] },
            { id: 'mythril_ore', weight: 10, quantity: [1, 2] },
            { id: 'rare_enhancement_stone', weight: 8, quantity: [1, 1] },
            { id: 'equipment_piece', weight: 15, quantity: [1, 1] },
            { id: 'crystal_staff', weight: 5, quantity: [1, 1] },
            { id: 'greatsword', weight: 5, quantity: [1, 1] },
            { id: 'bronze_spear', weight: 5, quantity: [1, 1] },
            { id: 'chainmail', weight: 5, quantity: [1, 1] },
            { id: 'equipment_piece', weight: 5, quantity: [1, 1] },
        ]
    },
    
    // Boss drops
    BOSS: {
        dropChance: 100,
        items: [
            { id: 'mega_potion', weight: 20, quantity: [2, 3] },
            { id: 'mythril_ore', weight: 15, quantity: [3, 6] },
            { id: 'mana_dew', weight: 12, quantity: [1, 2] },
            { id: 'dark_matter', weight: 10, quantity: [1, 1] },
            { id: 'dragon_blood', weight: 8, quantity: [1, 1] },
            { id: 'ancient_wood', weight: 15, quantity: [1, 2] },
            { id: 'mystic_thread', weight: 15, quantity: [2, 4] },
            { id: 'boss_essence', weight: 15, quantity: [1, 2] },
            { id: 'legendary_enhancement_stone', weight: 10, quantity: [1, 1] },
            { id: 'legendary_shard', weight: 5, quantity: [1, 1] },
            { id: 'dragon_helm', weight: 5, quantity: [1, 1] },
            { id: 'legendary_shard', weight: 5, quantity: [1, 1] },
        ]
    },
    
    // Treasure chest
    TREASURE: {
        dropChance: 100,
        items: [
            { id: 'gold_pile', weight: 40, quantity: [50, 200] },
            { id: 'hp_potion', weight: 25, quantity: [2, 4] },
            { id: 'remedy', weight: 15, quantity: [1, 2] },
            { id: 'rare_gem', weight: 15, quantity: [1, 2] },
            { id: 'equipment_piece', weight: 20, quantity: [1, 1] }
        ]
    },
    
    // Trap encounter (on success)
    TRAP_SUCCESS: {
        dropChance: 60,
        items: [
            { id: 'bandage', weight: 50, quantity: [1, 2] },
            { id: 'minor_hp_potion', weight: 30, quantity: [1, 1] },
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
        dropChance: 30, 
        items: [
            { id: 'gold_pile', weight: 10, quantity: [500, 1000] },
            { id: 'merchant_token', weight: 30, quantity: [1, 1] },
            { id: 'rare_item_ticket', weight: 20, quantity: [1, 1] },
            { id: 'discount_coupon', weight: 40, quantity: [1, 1] }
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
        guaranteed: [{ id: 'hp_potion', quantity: [1, 2], rarity: 'UNCOMMON' }],
        special: [{ id: 'iron_sword', dropChance: 25, quantity: 1, rarity: 'UNCOMMON' }]
    },
    'ELEMENTAL_ARCHON': {
        guaranteed: [{ id: 'mega_potion', quantity: 1, rarity: 'RARE' }],
        special: [{ id: 'arcane_wand', dropChance: 20, quantity: 1, rarity: 'RARE' }]
    },
    'VOID_CORRUPTED': {
        guaranteed: [{ id: 'legendary_shard', quantity: 1, rarity: 'EPIC' }],
        special: [{ id: 'reinforced_plate', dropChance: 30, quantity: 1, rarity: 'EPIC' }]
    },
    'PRIMORDIAL_CHAOS': {
        guaranteed: [{ id: 'void_essence', quantity: 1, rarity: 'MYTHIC' }],
        special: [{ id: 'essence_mirror', dropChance: 15, quantity: 1, rarity: 'LEGENDARY' }]
    },
    
    LICH: {
        guaranteed: [],
        special: [
            { 
                id: 'mirror_essence', 
                dropChance: 30, 
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
            { id: 'golem_core', quantity: [1, 1], rarity: 'RARE' }
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
            { id: 'void_essence', quantity: [1, 1], rarity: 'MYTHIC' }
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

function rollDrop(lootTable, rarityBoost = 0) {
    if (Math.random() * 100 > (lootTable.dropChance + (rarityBoost * 2))) {
        return null;
    }
    
    const totalWeight = lootTable.items.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    
    for (const item of lootTable.items) {
        roll -= item.weight;
        if (roll <= 0) {
            const [min, max] = item.quantity;
            const quantity = Math.floor(Math.random() * (max - min + 1)) + min;
            
            const dbInfo = ITEM_DATABASE[item.id];
            let finalRarity = item.rarity || dbInfo?.rarity || 'COMMON';

            // Scale rarity of any item upward with difficulty — higher dungeons give better loot
            const rarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
            let currentIdx = rarities.indexOf(finalRarity);
            if (rarityBoost > 0 && currentIdx < rarities.length - 1) {
                // Each 8 points of rarityBoost pushes up 1 rarity tier
                const tierBoost = Math.floor(rarityBoost / 8);
                finalRarity = rarities[Math.min(rarities.length - 1, currentIdx + tierBoost)];
            }
            
            if (item.id === 'equipment_piece') {
                const rarityWeights = { 'COMMON': 100, 'UNCOMMON': 50, 'RARE': 20, 'EPIC': 10, 'LEGENDARY': 5, 'MYTHIC': 1 };
                if (rarityBoost > 0) {
                    rarityWeights.COMMON = Math.max(0, rarityWeights.COMMON - (rarityBoost * 10));
                    rarityWeights.UNCOMMON = Math.max(0, rarityWeights.UNCOMMON - (rarityBoost * 5));
                    rarityWeights.RARE += rarityBoost * 15;
                    rarityWeights.EPIC += rarityBoost * 10;
                    rarityWeights.LEGENDARY += rarityBoost * 8;
                    rarityWeights.MYTHIC += rarityBoost * 4;
                }

                if (rarityBoost >= 8) {
                    rarityWeights.COMMON = 0;
                    rarityWeights.UNCOMMON = 0;
                }
                if (rarityBoost >= 12) {
                    rarityWeights.RARE = 0;
                }
                if (rarityBoost >= 25) {
                    rarityWeights.EPIC = 0; // Only LEGENDARY/MYTHIC at SSS
                }

                // Pick equipment, preferring items whose rarity matches the target tier
                const targetTier = rarityBoost >= 35 ? 'MYTHIC' : rarityBoost >= 18 ? 'LEGENDARY' : rarityBoost >= 8 ? 'EPIC' : rarityBoost >= 4 ? 'RARE' : 'UNCOMMON';
                const tierRarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
                const targetIdx = tierRarities.indexOf(targetTier);
                
                // Try to pick equipment at or near target rarity
                const preferredEquipment = Object.entries(ITEM_DATABASE).filter(([id, data]) => {
                    if (data.type !== 'EQUIPMENT') return false;
                    const eqIdx = tierRarities.indexOf(data.rarity || 'COMMON');
                    return eqIdx >= Math.max(0, targetIdx - 1);
                });
                const equipmentList = preferredEquipment.length > 0 
                    ? preferredEquipment 
                    : Object.entries(ITEM_DATABASE).filter(([id, data]) => data.type === 'EQUIPMENT');
                    
                if (equipmentList.length > 0) {
                    const [eqId, eqData] = equipmentList[Math.floor(Math.random() * equipmentList.length)];
                    
                    let resultItem = { 
                        id: eqId, 
                        quantity: 1, 
                        rarity: eqData.rarity || 'COMMON',
                        name: eqData.name,
                        stats: { ...eqData.stats }
                    };

                    // Boost rarity further based on difficulty
                    let currentEqIdx = tierRarities.indexOf(resultItem.rarity);
                    if (rarityBoost > 5) {
                        resultItem.rarity = tierRarities[Math.min(tierRarities.length - 1, currentEqIdx + Math.floor(rarityBoost / 8))];
                    }

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
    const rarityBoost = Math.floor(difficulty);
    
    let lootTable = LOOT_TABLES.COMMON_ENEMY;
    
    if (encounterType === 'ELITE_COMBAT') {
        lootTable = LOOT_TABLES.ELITE_ENEMY;
    } else if (encounterType === 'BOSS') {
        lootTable = LOOT_TABLES.BOSS;
        
        if (enemyName && BOSS_DROPS[enemyName]) {
            const bossLoot = BOSS_DROPS[enemyName];
            
            for (const guaranteedDrop of bossLoot.guaranteed) {
                const [min, max] = guaranteedDrop.quantity;
                const quantity = Math.floor(Math.random() * (max - min + 1)) + min;
                const dbInfo = ITEM_DATABASE[guaranteedDrop.id];
                
                let finalRarity = guaranteedDrop.rarity || dbInfo?.rarity || 'COMMON';
                const rarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
                if (rarityBoost > 15) {
                    let curIdx = rarities.indexOf(finalRarity);
                    finalRarity = rarities[Math.min(rarities.length - 1, curIdx + 1)];
                }

                drops.push({
                    id: guaranteedDrop.id,
                    quantity,
                    rarity: finalRarity,
                    source: enemyName
                });
            }
            
            for (const specialDrop of bossLoot.special) {
                const effectiveChance = specialDrop.dropChance + (rarityBoost * 0.5);
                if (Math.random() * 100 < effectiveChance) {
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
    
    const standardDrop = rollDrop(lootTable, rarityBoost);
    if (standardDrop) {
        drops.push(standardDrop);
    }
    
    if (difficulty >= 2.0 && Math.random() < (0.3 + (difficulty * 0.02))) {
        const bonusDrop = rollDrop(lootTable, rarityBoost);
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
    
    return Math.floor(baseGold * difficulty);
}

async function distributeLoot(players, encounterType, enemyName = null, difficulty = 1.0, overrideGold = null) {
    const inventorySystem = require('./inventorySystem');
    const results = {
        items: [],
        gold: 0,
        goldPerPlayer: 0,
        announcements: []
    };

    if (!players || players.length === 0) return results;

    const loot = generateLoot(encounterType, enemyName, difficulty);
    const goldDrop = overrideGold !== null ? overrideGold : generateGoldDrop(encounterType, difficulty);
    
    const goldPerPlayer = Math.floor(goldDrop / Math.max(1, players.length));

    results.gold = goldDrop;
    results.goldPerPlayer = goldPerPlayer;
    
    for (const drop of loot) {
        const itemInfo = getItemInfo(drop.id);
        
        if (drop.announcement) {
            results.announcements.push(drop.announcement);
        }
        
        const luckyPlayer = players[Math.floor(Math.random() * players.length)];
        
        const addResult = await inventorySystem.addItem(
            luckyPlayer.jid,
            drop.id,
            drop.quantity,
            {
                name: itemInfo.name,
                rarity: drop.rarity || itemInfo.rarity,
                type: itemInfo.type || (drop.id.includes('fish') || drop.id.includes('hide') ? 'MATERIAL' : 'ITEM'),
                value: itemInfo.value || drop.value || 100,
                stats: itemInfo.stats,
                slot: itemInfo.slot,
                source: drop.source || encounterType,
                acquiredAt: Date.now()
            }
        );
        
        if (addResult.success) {
            results.items.push({
                playerId: luckyPlayer.jid,
                playerName: luckyPlayer.name,
                id: drop.id,
                name: itemInfo.name,
                quantity: drop.quantity,
                rarity: drop.rarity
            });
        }
    }

    return results;
}

// ==========================================
// 🔍 ITEM DATABASE
// ==========================================

const ITEM_DATABASE = {
    // --- CRAFTING MATERIALS ---
    'refined_steel': { name: 'Refined Steel', description: 'High-quality steel. Tastes like pennies.', rarity: 'UNCOMMON', value: 500, type: 'MATERIAL' },
    'sharp_whetstone': { name: 'Sharp Whetstone', description: 'Used to sharpen high-end blades.', rarity: 'UNCOMMON', value: 300, type: 'MATERIAL' },
    'mythril_ore': { name: 'Mythril Ore', description: 'A rare blue ore. Surprisingly heavy.', rarity: 'RARE', value: 1200, type: 'MATERIAL' },
    'mana_crystal': { name: 'Mana Crystal', description: 'Concentrated magic. Smells like static.', rarity: 'RARE', value: 1500, type: 'MATERIAL' },
    'tough_leather': { name: 'Tough Leather', description: 'Thick hide. Smells like wet dog.', rarity: 'UNCOMMON', value: 400, type: 'MATERIAL' },
    'gunpowder': { name: 'Volatile Gunpowder', description: 'Handle with care.', rarity: 'COMMON', value: 200, type: 'MATERIAL' },
    'fire_essence': { name: 'Fire Essence', description: 'A flickering flame.', rarity: 'RARE', value: 1000, type: 'MATERIAL' },
    'dark_matter': { name: 'Dark Matter', description: 'Heavier than your student loans.', rarity: 'EPIC', value: 2500, type: 'MATERIAL' },
    'healing_herb': { name: 'Sun-kissed Herb', description: 'Natural medicine.', rarity: 'COMMON', value: 150, type: 'MATERIAL' },
    'mana_dew': { name: 'Mana Dew', description: 'Basically magic Gatorade.', rarity: 'RARE', value: 800, type: 'MATERIAL' },
    'dragon_blood': { name: 'Dragon Blood', description: 'Ancient power in liquid form.', rarity: 'LEGENDARY', value: 5000, type: 'MATERIAL' },
    'iron_shard': { name: 'Iron Shard', description: 'Metal fragments.', rarity: 'COMMON', value: 100, type: 'MATERIAL' },
    'void_crystal': { name: 'Void Crystal', description: 'Absorbs all surrounding light.', rarity: 'RARE', value: 1200, type: 'MATERIAL' },
    'boss_essence': { name: 'Boss Essence', description: 'A concentrated core of a defeated lord.', rarity: 'EPIC', value: 3000, type: 'MATERIAL' },
    'legendary_shard': { name: 'Legendary Shard', description: 'A fragment of an ancient artifact.', rarity: 'LEGENDARY', value: 8000, type: 'MATERIAL' },
    'gold_pile': { name: 'Pile of Gold', description: 'Glinting Zeni coins.', rarity: 'COMMON', value: 1, type: 'MATERIAL' },
    'spider_silk': { name: 'Spider Silk', description: 'Strong, sticky silk from giant spiders.', rarity: 'COMMON', value: 80, type: 'MATERIAL' },
    'fire_shard': { name: 'Fire Shard', description: 'A small piece of elemental fire.', rarity: 'UNCOMMON', value: 300, type: 'MATERIAL' },
    'ice_shard': { name: 'Ice Shard', description: 'A small piece of elemental ice.', rarity: 'UNCOMMON', value: 300, type: 'MATERIAL' },
    'lightning_shard': { name: 'Lightning Shard', description: 'A small piece of elemental lightning.', rarity: 'UNCOMMON', value: 300, type: 'MATERIAL' },
    'demon_hide': { name: 'Demon Hide', description: 'Tough, resilient skin from a demon.', rarity: 'RARE', value: 1200, type: 'MATERIAL' },
    'ghost_essence': { name: 'Ghost Essence', description: 'Ethereal residue from a restless spirit.', rarity: 'RARE', value: 1500, type: 'MATERIAL' },
    'ancient_wood': { name: 'Ancient Wood', description: 'Petrified wood from a forgotten forest.', rarity: 'EPIC', value: 2500, type: 'MATERIAL' },
    'mystic_thread': { name: 'Mystic Thread', description: 'Glows with its own internal light.', rarity: 'EPIC', value: 3000, type: 'MATERIAL' },
    
    // --- STONES ---
    'minor_enhancement_stone': { name: 'Minor Enhancement Stone', description: 'Boosts gear stats by 5%.', rarity: 'COMMON', value: 1000, type: 'MATERIAL' },
    'rare_enhancement_stone': { name: 'Rare Enhancement Stone', description: 'Boosts gear stats by 15%.', rarity: 'RARE', value: 5000, type: 'MATERIAL' },
    'legendary_enhancement_stone': { name: 'Legendary Enhancement Stone', description: 'Boosts gear stats by 35%.', rarity: 'LEGENDARY', value: 20000, type: 'MATERIAL' },
    'evolution_stone': { name: 'Evolution Stone (T2)', description: 'Triggers evolution to T2 class.', rarity: 'RARE', value: 8000, type: 'MATERIAL', reqLevel: 15 },
    'ascension_stone': { name: 'Ascension Stone (T3)', description: 'Triggers ascension to T3 class.', rarity: 'EPIC', value: 50000, type: 'MATERIAL', reqLevel: 50 },

    // --- KEY ITEMS ---
    'dragon_key': { name: 'Dragon Hunter Key', description: 'Unlocks the Dragon’s Lair.', rarity: 'RARE', value: 15000, type: 'ITEM' },
    'infected_shard': { name: '☣️ Infected Shard', description: 'Concentrated Hive essence.', rarity: 'EPIC', value: 3000, type: 'MATERIAL' },
    'infected_heart': { name: '☣️ Pulsing Heart', description: 'It is still beating... barely.', rarity: 'EPIC', value: 2000, type: 'MATERIAL' },
    'rare_gem': { name: 'Rare Gem', description: 'A sparkling gemstone of immense value.', rarity: 'RARE', value: 5000, type: 'MATERIAL' },
    'wisdom_tome': { name: 'Wisdom Tome', description: 'Ancient knowledge bound in leather.', rarity: 'EPIC', value: 10000, type: 'ITEM' },
    'skill_scroll': { name: 'Skill Scroll', description: 'Teaches a random skill when read.', rarity: 'EPIC', value: 15000, type: 'ITEM' },
    'merchant_token': { name: 'Merchant Token', description: 'A proof of high-value trade.', rarity: 'RARE', value: 5000, type: 'ITEM' },
    'rare_item_ticket': { name: 'Rare Item Ticket', description: 'Exchangeable for a rare item.', rarity: 'RARE', value: 10000, type: 'ITEM' },
    'discount_coupon': { name: 'Discount Coupon', description: 'Reduces shop prices for one purchase.', rarity: 'UNCOMMON', value: 2000, type: 'ITEM' },
    'void_essence': { name: 'Void Essence', description: 'A swirling mass of nothingness.', rarity: 'MYTHIC', value: 25000, type: 'MATERIAL' },
    'lich_phylactery': { name: 'Lich Phylactery', description: 'Contains the soul of a powerful necromancer.', rarity: 'EPIC', value: 15000, type: 'MATERIAL' },
    'dragon_scale': { name: 'Dragon Scale', description: 'Nearly indestructible plate from a dragon.', rarity: 'RARE', value: 3000, type: 'MATERIAL' },
    'demon_horn': { name: 'Demon Horn', description: 'Razor sharp and warm to the touch.', rarity: 'EPIC', value: 8000, type: 'MATERIAL' },
    'infernal_crown': { name: 'Infernal Crown', description: 'A crown forged in the deepest pits of hell.', rarity: 'MYTHIC', value: 50000, type: 'MATERIAL' },
    'golem_core': { name: 'Golem Core', description: 'A pulsating heart of stone and magic.', rarity: 'RARE', value: 6000, type: 'MATERIAL' },
    'titan_heart': { name: 'Titan Heart', description: 'The power source of a colossal golem.', rarity: 'LEGENDARY', value: 20000, type: 'MATERIAL' },
    'wyrm_fang': { name: 'Wyrm Fang', description: 'A lethal tooth from an elder dragon.', rarity: 'RARE', value: 4000, type: 'MATERIAL' },
    'elder_blood': { name: 'Elder Blood', description: 'Pure magic coursing through ancient veins.', rarity: 'LEGENDARY', value: 15000, type: 'MATERIAL' },

    // --- FISHING ---
    'common_fish': { name: 'Small Bass', description: 'A common pond fish.', rarity: 'COMMON', value: 150, type: 'MATERIAL' },
    'rare_fish': { name: 'Rainbow Trout', description: 'A beautifully colored fish.', rarity: 'RARE', value: 800, type: 'MATERIAL' },
    'mythic_fish': { name: 'Void Kraken Tentacle', description: 'A legendary find from the abyss.', rarity: 'MYTHIC', value: 15000, type: 'MATERIAL' },
    'infected_fish': { name: '☣️ Corrupted Eel', description: 'Twisting with hazard energy.', rarity: 'EPIC', value: 4500, type: 'MATERIAL' },

    // --- HUNTING ---
    'rabbit_hide': { name: 'Rabbit Hide', description: 'Soft and common fur.', rarity: 'COMMON', value: 120, type: 'MATERIAL' },
    'deer_antler': { name: 'Deer Antlers', description: 'Useful for crafting.', rarity: 'UNCOMMON', value: 600, type: 'MATERIAL' },
    'bear_claw': { name: 'Bear Claws', description: 'Sharp and dangerous.', rarity: 'RARE', value: 2500, type: 'MATERIAL' },

    // --- EQUIPMENT: WEAPONS ---
    'rusty_dagger': { name: 'Rusted Dagger', description: 'A simple blade. (+5 ATK)', rarity: 'COMMON', value: 1000, type: 'EQUIPMENT', stats: { atk: 5 }, slot: 'main_hand', reqLevel: 1 },
    'iron_sword': { name: 'Iron Sword', description: 'A sturdy iron blade. (+12 ATK)', rarity: 'UNCOMMON', value: 5000, type: 'EQUIPMENT', stats: { atk: 12 }, slot: 'main_hand', reqLevel: 5 },
    'arcane_wand': { name: 'Arcane Wand', description: 'Focuses arcane energy. (+18 MAG)', rarity: 'RARE', value: 6000, type: 'EQUIPMENT', stats: { mag: 18 }, slot: 'main_hand', reqLevel: 5 },
    'steel_sabre': { name: 'Steel Sabre', description: 'Sharp and finely forged. (+25 ATK, +5 SPD)', rarity: 'RARE', value: 16000, type: 'EQUIPMENT', stats: { atk: 25, spd: 5 }, slot: 'main_hand', reqLevel: 10 },
    'mythril_staff': { name: 'Mythril Staff', description: 'Amplifies resonance. (+45 MAG, +15 HP)', rarity: 'EPIC', value: 30000, type: 'EQUIPMENT', stats: { mag: 45, hp: 15 }, slot: 'main_hand', reqLevel: 20, isTwoHanded: true },
    'dragon_fang_dagger': { name: 'Dragon-Fang Dagger', description: 'Blade carved from a wyvern’s tooth. (+55 ATK, +15% Crit)', rarity: 'EPIC', value: 22000, type: 'EQUIPMENT', stats: { atk: 55, crit: 15 }, slot: 'main_hand', reqLevel: 25 },
    // --- NEW EQUIPMENT ---
    'bronze_spear': { name: 'Bronze Spear', description: 'A sturdy bronze spear. (+8 ATK)', rarity: 'COMMON', value: 1200, type: 'EQUIPMENT', stats: { atk: 8 }, slot: 'main_hand', reqLevel: 2 },
    'chainmail': { name: 'Chainmail', description: 'Interlinked metal rings. (+12 DEF)', rarity: 'UNCOMMON', value: 2500, type: 'EQUIPMENT', stats: { def: 12 }, slot: 'armor', reqLevel: 4 },
    'crystal_staff': { name: 'Crystal Staff', description: 'A staff of pure crystal. (+10 MAG)', rarity: 'UNCOMMON', value: 3000, type: 'EQUIPMENT', stats: { mag: 10 }, slot: 'main_hand', reqLevel: 6 },
    'greatsword': { name: 'Greatsword', description: 'A massive two-handed blade. (+15 ATK)', rarity: 'RARE', value: 6000, type: 'EQUIPMENT', stats: { atk: 15 }, slot: 'main_hand', reqLevel: 8 },
    'dragon_helm': { name: 'Dragon Helm', description: 'Helm forged from dragon scales. (+20 DEF, +10 HP)', rarity: 'EPIC', value: 12000, type: 'EQUIPMENT', stats: { def: 20, hp: 10 }, slot: 'helmet', reqLevel: 12 },

    
    // --- EQUIPMENT: ARMOR ---
    'leather_tunic': { name: 'Leather Tunic', description: 'Basic protection. (+8 DEF)', rarity: 'COMMON', value: 1600, type: 'EQUIPMENT', stats: { def: 8 }, slot: 'armor', reqLevel: 1 },
    'iron_plate': { name: 'Iron Plate', description: 'Sturdy iron protection. (+15 DEF)', rarity: 'UNCOMMON', value: 4500, type: 'EQUIPMENT', stats: { def: 15 }, slot: 'armor', reqLevel: 5 },
    'mage_robe': { name: 'Novice Robe', description: 'Enhances magic flow. (+10 MAG, +5 DEF)', rarity: 'UNCOMMON', value: 4800, type: 'EQUIPMENT', stats: { mag: 10, def: 5 }, slot: 'armor', reqLevel: 5 },
    'reinforced_plate': { name: 'Reinforced Plate', description: 'Impenetrable steel plating. (+45 DEF, +50 HP)', rarity: 'EPIC', value: 24000, type: 'EQUIPMENT', stats: { def: 45, hp: 50 }, slot: 'armor', reqLevel: 15 },
    'dragon_scale_armor': { name: 'Dragon-Scale Plate', description: 'Forged from dragon scales. (+85 DEF, +150 HP)', rarity: 'LEGENDARY', value: 45000, type: 'EQUIPMENT', stats: { def: 85, hp: 150 }, slot: 'armor', reqLevel: 30 },

    // --- ACCESSORIES ---
    'wooden_ring': { name: 'Wooden Ring', description: 'A simple band. (+2 HP)', rarity: 'COMMON', value: 500, type: 'EQUIPMENT', stats: { hp: 2 }, slot: 'ring', reqLevel: 1 },
    'iron_ring': { name: 'Iron Ring', description: 'A sturdy band. (+10 HP)', rarity: 'UNCOMMON', value: 2000, type: 'EQUIPMENT', stats: { hp: 10 }, slot: 'ring', reqLevel: 5 },
    'dragon_seal_ring': { name: 'Dragon Seal Ring', description: 'Pierce draconic hide. (+10 ATK)', rarity: 'EPIC', value: 20000, type: 'EQUIPMENT', stats: { atk: 10 }, slot: 'ring', reqLevel: 20 },

    // --- POTIONS & CONSUMABLES ---
    // 💡 Prices here are synced from the pre-quest shop (CONSUMABLES in guildAdventure.js, which is the authoritative source)
    'minor_hp_potion': { name: 'Minor HP Potion', description: 'Restores ~15% HP.', rarity: 'COMMON', value: 200, type: 'POTION', usable: true, effect: 'heal', effectValue: 0.15 },
    'minor_potion':    { name: 'Minor Health Potion', description: 'Restores 15% of Max HP.', rarity: 'COMMON', value: 280, type: 'POTION', usable: true, effect: 'heal', effectValue: 0.15 },
    'health_potion':   { name: 'Health Potion', description: 'Restores 35% of Max HP.', rarity: 'UNCOMMON', value: 700, type: 'POTION', usable: true, effect: 'heal', effectValue: 0.35 },
    'hp_potion':       { name: 'Health Potion (alt)', description: 'Restores ~30% HP.', rarity: 'UNCOMMON', value: 700, type: 'POTION', usable: true, effect: 'heal', effectValue: 0.30 },
    'major_potion':    { name: 'Major Health Potion', description: 'Restores 60% of Max HP.', rarity: 'RARE', value: 1680, type: 'POTION', usable: true, effect: 'heal', effectValue: 0.60 },
    'mega_potion':     { name: 'Mega Potion', description: 'Restores ~60% HP.', rarity: 'RARE', value: 1680, type: 'POTION', usable: true, effect: 'heal', effectValue: 0.60 },
    'elixir':          { name: 'Full Restore Elixir', description: 'Fully restores HP and cures status effects.', rarity: 'EPIC', value: 4200, type: 'POTION', usable: true, effect: 'heal', effectValue: 1.0, cureStatus: true },
    'remedy':          { name: 'Remedy', description: 'Cures all negative status effects.', rarity: 'UNCOMMON', value: 500, type: 'POTION', usable: true, effect: 'cure_status' },
    'regen_salve':     { name: 'Regeneration Salve', description: 'Heals 10% Max HP per turn for 3 turns.', rarity: 'UNCOMMON', value: 1120, type: 'POTION', usable: true, effect: 'regen', effectValue: 0.1, duration: 3 },
    'mana_potion':     { name: 'Mana Potion', description: 'Restores 40% of Max Energy.', rarity: 'UNCOMMON', value: 400, type: 'POTION', usable: true, effect: 'restore_energy', effectValue: 0.40 },
    'energy_drink':    { name: 'Energy Drink', description: 'Restores 30% Energy.', rarity: 'UNCOMMON', value: 400, type: 'POTION', usable: true, effect: 'restore_energy', effectValue: 0.30 },
    'ether':           { name: 'Ether', description: 'Fully restores Energy.', rarity: 'RARE', value: 1000, type: 'POTION', usable: true, effect: 'restore_energy', effectValue: 1.0 },
    'phoenix_down':    { name: 'Phoenix Down', description: 'Revives a fallen ally with 50% HP.', rarity: 'RARE', value: 3500, type: 'POTION', usable: true, effect: 'revive', effectValue: 0.5 },
    'phoenix_feather': { name: 'Phoenix Feather', description: 'Revives a fallen ally with 50% HP.', rarity: 'RARE', value: 3500, type: 'POTION', usable: true, effect: 'revive', effectValue: 0.5 },
    'smoke_bomb':      { name: 'Smoke Bomb', description: 'Allows escape from combat (80% chance).', rarity: 'COMMON', value: 500, type: 'POTION', usable: true, effect: 'flee', chance: 80 },
    'bomb':            { name: 'Bomb', description: 'Deals 80 area damage to all enemies.', rarity: 'UNCOMMON', value: 2500, type: 'POTION', usable: true, effect: 'damage_aoe', value_dmg: 80 },
    'fire_bomb':       { name: 'Fire Bomb', description: 'Deals 150 fire damage to all enemies.', rarity: 'RARE', value: 3500, type: 'POTION', usable: true, effect: 'aoe_damage', effectValue: 150 },
    'void_grenade':    { name: 'Void Grenade', description: 'Deals 300 damage and reduces enemy DEF.', rarity: 'RARE', value: 8000, type: 'POTION', usable: true, effect: 'aoe_debuff_damage', effectValue: 300 },
    'cursed_bomb':     { name: 'Cursed Bomb', description: 'Deals 200 damage and slows all enemies.', rarity: 'RARE', value: 5000, type: 'POTION', usable: true, effect: 'aoe_slow_damage', effectValue: 200 },
    'bandage': { name: 'Bandage', description: 'Simple cloth used to wrap wounds.', rarity: 'COMMON', value: 50, type: 'MATERIAL' },
    'repair_kit_basic': { name: 'Basic Repair Kit', description: 'Restores +25 durability to one equipped item.', rarity: 'COMMON', value: 400, type: 'CONSUMABLE', usable: true },
    'repair_kit_advanced': { name: 'Advanced Repair Kit', description: 'Restores +60 durability to one equipped item.', rarity: 'UNCOMMON', value: 1200, type: 'CONSUMABLE', usable: true },
    'repair_kit_master': { name: 'Master Repair Kit', description: 'Fully restores durability to one equipped item.', rarity: 'RARE', value: 3000, type: 'CONSUMABLE', usable: true },
    
    // --- SPECIALS ---
    'essence_mirror': { name: 'Essence Mirror', description: 'Mirror skills from other classes.', rarity: 'LEGENDARY', value: 50000, type: 'ITEM' },
    'mirror_essence': { name: 'Mirror Essence', description: 'Crystallized dark power.', rarity: 'LEGENDARY', value: 5000, type: 'MATERIAL' }
};

function getItemInfo(itemId) {
    return ITEM_DATABASE[itemId] || {
        name: itemId,
        description: 'Unknown item',
        rarity: 'COMMON',
        value: 10,
        type: 'ITEM'
    };
}


// --- PROGRAMMATICALLY ADDED EXTRAPOLATED ITEMS ---
Object.assign(ITEM_DATABASE, {
    "void_kraken_harpoon": {
        "name": "Void Kraken Harpoon",
        "description": "A terrifying weapon forged from an abyssal tentacle. It twists reality with every swing. (+110 ATK, +30 MAG, +15 CRIT)",
        "rarity": "MYTHIC",
        "value": 95000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 110,
            "mag": 30,
            "crit": 15
        },
        "slot": "main_hand",
        "reqLevel": 50
    },
    "void_kraken_cleaver": {
        "name": "Void Kraken Cleaver",
        "description": "A colossal, heavy blade that looks like a frozen piece of the deep abyss. It slices through space itself. (+105 ATK, +20 MAG, +15 CRIT)",
        "rarity": "MYTHIC",
        "value": 92000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 105,
            "mag": 20,
            "crit": 15
        },
        "slot": "main_hand",
        "reqLevel": 50
    },
    "hellfire_greatmaul": {
        "name": "Hellfire Greatmaul",
        "description": "A massive hammer forged from active sulfur cores. Every impact triggers a tiny elemental explosion. (+120 ATK, +25 MAG, +10 CRIT)",
        "rarity": "MYTHIC",
        "value": 96000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 120,
            "mag": 25,
            "crit": 10
        },
        "slot": "main_hand",
        "reqLevel": 50
    },
    "worldender_lance": {
        "name": "World-Ender Lance",
        "description": "A legendary weapon that combines hellfire power with the raw physical weight of abyssal parts. (+115 ATK, +40 MAG, +12 CRIT)",
        "rarity": "MYTHIC",
        "value": 98000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 115,
            "mag": 40,
            "crit": 12
        },
        "slot": "main_hand",
        "reqLevel": 50
    },
    "aegis_of_the_abyss": {
        "name": "Aegis of the Abyss",
        "description": "A shield that feels entirely weightless but swallows incoming attacks whole. (+120 DEF, +400 HP, +10 LCK)",
        "rarity": "MYTHIC",
        "value": 80000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 120,
            "hp": 400,
            "luck": 10
        },
        "slot": "off_hand",
        "reqLevel": 50
    },
    "abyssal_bulwark": {
        "name": "Abyssal Bulwark",
        "description": "A shield forged from compressed void energy. It acts like a gravitational anomaly, pulling threats away from allies. (+115 DEF, +450 HP, +10 LCK)",
        "rarity": "MYTHIC",
        "value": 82000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 115,
            "hp": 450,
            "luck": 10
        },
        "slot": "off_hand",
        "reqLevel": 50
    },
    "mirror_shield_of_tartarus": {
        "name": "Mirror Shield of Tartarus",
        "description": "A pristine, terrifying shield that visually distorts distance, making your exact stance impossible to read. (+130 DEF, +350 HP, +15 CRIT)",
        "rarity": "MYTHIC",
        "value": 84000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 130,
            "hp": 350,
            "crit": 15
        },
        "slot": "off_hand",
        "reqLevel": 50
    },
    "aegis_of_eternal_fire": {
        "name": "Aegis of Eternal Fire",
        "description": "A massive shield crafted from molten dragon scrap and hellfire energy. Melt weapons that strike it. (+125 DEF, +300 HP, +15 ATK)",
        "rarity": "MYTHIC",
        "value": 81000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 125,
            "hp": 300,
            "atk": 15
        },
        "slot": "off_hand",
        "reqLevel": 50
    },
    "chrono_weaver_vestments": {
        "name": "Chrono Weaver Vestments",
        "description": "Woven from divine silk and infused with eternal fires. Time seems to slow around the wearer. (+85 DEF, +250 HP, +25 SPD)",
        "rarity": "MYTHIC",
        "value": 75000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 85,
            "hp": 250,
            "spd": 25
        },
        "slot": "armor",
        "reqLevel": 50
    },
    "voidstrand_robes": {
        "name": "Void-Strand Robes",
        "description": "Robes woven seamlessly from mystic thread and void energy, causing the wearer's physical form to appear blurry and untargetable. (+75 DEF, +200 HP, +40 MAG, +15 SPD)",
        "rarity": "MYTHIC",
        "value": 74000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 75,
            "hp": 200,
            "mag": 40,
            "spd": 15
        },
        "slot": "armor",
        "reqLevel": 50
    },
    "eelskin_hazard_suit": {
        "name": "Eel-Skin Hazard Suit",
        "description": "High-tech magic gear constructed from corrupted eel hides. It constantly cycles electrical current. (+90 DEF, +300 HP, +30 SPD)",
        "rarity": "MYTHIC",
        "value": 76000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 90,
            "hp": 300,
            "spd": 30
        },
        "slot": "armor",
        "reqLevel": 50
    },
    "abyssal_carapace": {
        "name": "Abyssal Carapace",
        "description": "Heavy armor constructed from the outer shell of deep-sea entities. Completely unyielding. (+110 DEF, +400 HP)",
        "rarity": "MYTHIC",
        "value": 78000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 110,
            "hp": 400
        },
        "slot": "armor",
        "reqLevel": 50
    },
    "crown_of_hellfire": {
        "name": "Crown of Hellfire",
        "description": "A blazing crown that marks you as a lord of destruction. Your spells burn hotter. (+40 DEF, +80 MAG, +20 CRIT)",
        "rarity": "MYTHIC",
        "value": 65000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 40,
            "mag": 80,
            "crit": 20
        },
        "slot": "helmet",
        "reqLevel": 50
    },
    "gaze_of_the_abyss": {
        "name": "Gaze of the Abyss",
        "description": "A hollow mask that replaces the wearer’s eyes with tiny, glowing portals to the void. (+35 DEF, +75 MAG, +25 CRIT)",
        "rarity": "MYTHIC",
        "value": 62000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 35,
            "mag": 75,
            "crit": 25
        },
        "slot": "helmet",
        "reqLevel": 50
    },
    "crown_of_the_abyssal_sovereign": {
        "name": "Crown of the Abyssal Sovereign",
        "description": "A crown that makes your voice echo with cosmic authority, driving fear into enemies. (+45 DEF, +60 MAG, +20 LCK)",
        "rarity": "MYTHIC",
        "value": 66000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "mag": 60,
            "luck": 20
        },
        "slot": "helmet",
        "reqLevel": 50
    },
    "visor_of_the_void_walker": {
        "name": "Visor of the Void Walker",
        "description": "A sleek helmet that filters out magical blinding light, allowing perfect sight in total darkness. (+50 DEF, +40 SPD, +15 LCK)",
        "rarity": "MYTHIC",
        "value": 63000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 50,
            "spd": 40,
            "luck": 15
        },
        "slot": "helmet",
        "reqLevel": 50
    },
    "voidtouched_grips": {
        "name": "Void-Touched Grips",
        "description": "These gloves cause your hands to phase slightly out of the physical plane, maximizing striking speed. (+30 ATK, +35 SPD, +12 CRIT)",
        "rarity": "MYTHIC",
        "value": 55000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 30,
            "spd": 35,
            "crit": 12
        },
        "slot": "gloves",
        "reqLevel": 50
    },
    "abyssal_grasp": {
        "name": "Abyssal Grasp",
        "description": "Gauntlets that channel raw void energy into your fingertips, leaving trails of black static with every gesture. (+45 ATK, +25 MAG, +20 SPD)",
        "rarity": "MYTHIC",
        "value": 54000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 45,
            "mag": 25,
            "spd": 20
        },
        "slot": "gloves",
        "reqLevel": 50
    },
    "eelspike_gauntlets": {
        "name": "Eel-Spike Gauntlets",
        "description": "Gloves covered in tiny, static-conducting scales that shock anything they touch. (+35 ATK, +30 SPD, +18 CRIT)",
        "rarity": "MYTHIC",
        "value": 57000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 35,
            "spd": 30,
            "crit": 18
        },
        "slot": "gloves",
        "reqLevel": 50
    },
    "touch_of_retribution": {
        "name": "Touch of Retribution",
        "description": "Gloves that store kinetic energy from incoming hits and release it on your next attack. (+40 ATK, +25 DEF, +12 CRIT)",
        "rarity": "MYTHIC",
        "value": 56000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 40,
            "def": 25,
            "crit": 12
        },
        "slot": "gloves",
        "reqLevel": 50
    },
    "abyssal_treads": {
        "name": "Abyssal Treads",
        "description": "Boots that leave a trail of fading stars. You walk through hazard zones unaffected. (+35 DEF, +45 SPD, +15 LCK)",
        "rarity": "MYTHIC",
        "value": 58000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 35,
            "spd": 45,
            "luck": 15
        },
        "slot": "boots",
        "reqLevel": 50
    },
    "void_step_sabatons": {
        "name": "Void Step Sabatons",
        "description": "Heavy greaves that ignore gravity, allowing the wearer to step cleanly across hazardous terrain without touching it. (+45 DEF, +40 SPD, +15 LCK)",
        "rarity": "MYTHIC",
        "value": 56000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "spd": 40,
            "luck": 15
        },
        "slot": "boots",
        "reqLevel": 50
    },
    "infernal_greaves": {
        "name": "Infernal Greaves",
        "description": "Heavy plated boots that burn red hot, melting ice hazards instantly beneath your feet. (+55 DEF, +25 SPD, +15 ATK)",
        "rarity": "MYTHIC",
        "value": 59000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 55,
            "spd": 25,
            "atk": 15
        },
        "slot": "boots",
        "reqLevel": 50
    },
    "treads_of_the_damned": {
        "name": "Treads of the Damned",
        "description": "Boots that allow the user to run across walls and vertical surfaces by locking onto kinetic lines. (+40 DEF, +45 SPD)",
        "rarity": "MYTHIC",
        "value": 57000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 40,
            "spd": 45
        },
        "slot": "boots",
        "reqLevel": 50
    },
    "loop_of_forever": {
        "name": "Loop of Forever",
        "description": "A cosmic band that pulls stray probability toward the wearer, ensuring flawless fortune. (+25 MAG, +30 LCK, +15 CRIT)",
        "rarity": "MYTHIC",
        "value": 60000,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 25,
            "luck": 30,
            "crit": 15
        },
        "slot": "ring",
        "reqLevel": 50
    },
    "entropy_loop": {
        "name": "Entropy Loop",
        "description": "A dark, shifting ring that turns the bearer's misfortune into destructive critical strikes. (+20 MAG, +25 LCK, +22 CRIT)",
        "rarity": "MYTHIC",
        "value": 58000,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 20,
            "luck": 25,
            "crit": 22
        },
        "slot": "ring",
        "reqLevel": 50
    },
    "singularity_band": {
        "name": "Singularity Band",
        "description": "A gravity-manipulating ring that pulls nearby stray items and gold coins straight into your inventory. (+15 DEF, +40 LCK)",
        "rarity": "MYTHIC",
        "value": 61000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 15,
            "luck": 40
        },
        "slot": "ring",
        "reqLevel": 50
    },
    "band_of_cosmic_fortune": {
        "name": "Band of Cosmic Fortune",
        "description": "A beautiful band that aligns the stars in your favor, maximizing reward drops. (+20 MAG, +45 LCK)",
        "rarity": "MYTHIC",
        "value": 62000,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 20,
            "luck": 45
        },
        "slot": "ring",
        "reqLevel": 50
    },
    "heart_of_the_cosmos": {
        "name": "Heart of the Cosmos",
        "description": "A swirling mass of nothingness contained inside a silver casing. It beats in sync with your pulse. (+300 HP, +60 MAG, +15 LCK)",
        "rarity": "MYTHIC",
        "value": 62000,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 300,
            "mag": 60,
            "luck": 15
        },
        "slot": "amulet",
        "reqLevel": 50
    },
    "void_core_amulet": {
        "name": "Void Core Amulet",
        "description": "A dangerous relic containing a miniature singularity. It warps the air around your chest. (+250 HP, +70 MAG, +10 SPD)",
        "rarity": "MYTHIC",
        "value": 60000,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 250,
            "mag": 70,
            "spd": 10
        },
        "slot": "amulet",
        "reqLevel": 50
    },
    "necklace_of_the_void_empress": {
        "name": "Necklace of the Void Empress",
        "description": "A breathtaking necklace made from crystallized nothingness. It grants immense magical fortitude. (+400 HP, +50 MAG, +12 CRIT)",
        "rarity": "MYTHIC",
        "value": 64000,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 400,
            "mag": 50,
            "crit": 12
        },
        "slot": "amulet",
        "reqLevel": 50
    },
    "voidstar_choker": {
        "name": "Void-Star Choker",
        "description": "A heavy choker containing a literal fragment of a dead cosmic body. (+200 HP, +80 MAG, +10 CRIT)",
        "rarity": "MYTHIC",
        "value": 63000,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 200,
            "mag": 80,
            "crit": 10
        },
        "slot": "amulet",
        "reqLevel": 50
    },
    "veil_of_the_void": {
        "name": "Veil of the Void",
        "description": "A shifting, dark cloak that absorbs all surrounding light, making the wearer nearly invisible. (+50 DEF, +40 SPD, +20 CRIT)",
        "rarity": "MYTHIC",
        "value": 52000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 50,
            "spd": 40,
            "crit": 20
        },
        "slot": "cloak",
        "reqLevel": 50
    },
    "shroud_of_eternal_night": {
        "name": "Shroud of Eternal Night",
        "description": "A flowing cloak that completely dampens the sound of your movements and absorbs incoming spell light. (+40 DEF, +50 SPD, +15 LCK)",
        "rarity": "MYTHIC",
        "value": 53000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 40,
            "spd": 50,
            "luck": 15
        },
        "slot": "cloak",
        "reqLevel": 50
    },
    "cloak_of_shifting_realities": {
        "name": "Cloak of Shifting Realities",
        "description": "A cloak that constantly flickers between physical and ethereal planes, dodging stray projectiles. (+45 DEF, +35 SPD, +15 LCK)",
        "rarity": "MYTHIC",
        "value": 55000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "spd": 35,
            "luck": 15
        },
        "slot": "cloak",
        "reqLevel": 50
    },
    "mantlet_of_chaos": {
        "name": "Mantlet of Chaos",
        "description": "A chaotic, shifting cloak that makes the wearer completely immune to critical hits. (+60 DEF, +20 HP, +15 LCK)",
        "rarity": "MYTHIC",
        "value": 54000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 60,
            "hp": 20,
            "luck": 15
        },
        "slot": "cloak",
        "reqLevel": 50
    },
    "wyrmtail_greatsword": {
        "name": "Wyrmtail Greatsword",
        "description": "A massive sword crafted from elder dragon components. Pure magic courses through its heavy edge. (+75 ATK, +20 MAG, +10 CRIT)",
        "rarity": "LEGENDARY",
        "value": 45000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 75,
            "mag": 20,
            "crit": 10
        },
        "slot": "main_hand",
        "reqLevel": 40
    },
    "titanbone_halberd": {
        "name": "Titan-Bone Halberd",
        "description": "A massive polearm that vibrates with the internal power source of a colossal titan. (+80 ATK, +20 DEF)",
        "rarity": "LEGENDARY",
        "value": 44000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 80,
            "def": 20
        },
        "slot": "main_hand",
        "reqLevel": 40
    },
    "dragonfang_claymore": {
        "name": "Dragon-Fang Claymore",
        "description": "A jagged two-handed sword carved entirely from an elder dragon’s tooth. (+85 ATK, +12 CRIT)",
        "rarity": "LEGENDARY",
        "value": 46000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 85,
            "crit": 12
        },
        "slot": "main_hand",
        "reqLevel": 40
    },
    "mirroredged_rapier": {
        "name": "Mirror-Edged Rapier",
        "description": "A lightning-fast sword made of crystallized dark power. Its blade looks completely invisible from certain angles. (+65 ATK, +30 SPD, +15 CRIT)",
        "rarity": "LEGENDARY",
        "value": 43000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 65,
            "spd": 30,
            "crit": 15
        },
        "slot": "main_hand",
        "reqLevel": 40
    },
    "colossal_titan_shield": {
        "name": "Colossal Titan Shield",
        "description": "A towering slab of pure magic rock. It acts as the ultimate power source of defense. (+90 DEF, +250 HP)",
        "rarity": "LEGENDARY",
        "value": 38000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 90,
            "hp": 250
        },
        "slot": "off_hand",
        "reqLevel": 40
    },
    "dragonscale_kite_shield": {
        "name": "Dragon-Scale Kite Shield",
        "description": "A lightweight but incredibly durable shield built from overlapping, pristine dragon scales. (+95 DEF, +150 HP)",
        "rarity": "LEGENDARY",
        "value": 39000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 95,
            "hp": 150
        },
        "slot": "off_hand",
        "reqLevel": 40
    },
    "mirror_buckler": {
        "name": "Mirror Buckler",
        "description": "A small shield coated with crystallized dark power that can deflect magical beams. (+75 DEF, +20 SPD, +8 LCK)",
        "rarity": "LEGENDARY",
        "value": 37000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 75,
            "spd": 20,
            "luck": 8
        },
        "slot": "off_hand",
        "reqLevel": 40
    },
    "aegis_of_the_golem_king": {
        "name": "Aegis of the Golem King",
        "description": "A massive slab of enchanted stone that emits a minor defensive shockwave when hit. (+90 DEF, +200 HP, +10 MAG)",
        "rarity": "LEGENDARY",
        "value": 38000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 90,
            "hp": 200,
            "mag": 10
        },
        "slot": "off_hand",
        "reqLevel": 40
    },
    "dragon_scale_mail": {
        "name": "Dragon Scale Mail",
        "description": "Heavy armor made from nearly indestructible plates. Imbued with blood magic for longevity. (+75 DEF, +200 HP, +10 LCK)",
        "rarity": "LEGENDARY",
        "value": 42000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 75,
            "hp": 200,
            "luck": 10
        },
        "slot": "armor",
        "reqLevel": 40
    },
    "garb_of_the_elder_mage": {
        "name": "Garb of the Elder Mage",
        "description": "Robes soaked in pure dragon blood. The fabrics store mana effortlessly. (+50 DEF, +65 MAG, +15 SPD)",
        "rarity": "LEGENDARY",
        "value": 41000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 50,
            "mag": 65,
            "spd": 15
        },
        "slot": "armor",
        "reqLevel": 40
    },
    "titanium_fortified_carapace": {
        "name": "Titanium Fortified Carapace",
        "description": "Unbelievably heavy armor reinforced with the power source of a colossal golem. (+100 DEF, +250 HP)",
        "rarity": "LEGENDARY",
        "value": 43000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 100,
            "hp": 250
        },
        "slot": "armor",
        "reqLevel": 40
    },
    "scale_coat_of_eternity": {
        "name": "Scale Coat of Eternity",
        "description": "A coat made from near-indestructible dragon plates, tailored for high-level agility. (+70 DEF, +150 HP, +20 SPD)",
        "rarity": "LEGENDARY",
        "value": 42000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 70,
            "hp": 150,
            "spd": 20
        },
        "slot": "armor",
        "reqLevel": 40
    },
    "great_wyrm_helm": {
        "name": "Great Wyrm Helm",
        "description": "A fearsome helmet crafted from a dragon’s skull. Its presence alone terrifies lesser foes. (+45 DEF, +25 ATK, +8 CRIT)",
        "rarity": "LEGENDARY",
        "value": 32000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "atk": 25,
            "crit": 8
        },
        "slot": "helmet",
        "reqLevel": 40
    },
    "helm_of_ancient_blood": {
        "name": "Helm of Ancient Blood",
        "description": "A terrifying helm infused with legendary blood. It grants the wearer heightened hunting instincts. (+40 DEF, +30 ATK, +10 CRIT)",
        "rarity": "LEGENDARY",
        "value": 34000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 40,
            "atk": 30,
            "crit": 10
        },
        "slot": "helmet",
        "reqLevel": 40
    },
    "crown_of_the_dragon_lord": {
        "name": "Crown of the Dragon Lord",
        "description": "A crown crafted from the hardened horns and blood of dragons, boosting presence and command. (+45 DEF, +30 MAG, +12 LCK)",
        "rarity": "LEGENDARY",
        "value": 35000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "mag": 30,
            "luck": 12
        },
        "slot": "helmet",
        "reqLevel": 40
    },
    "gaze_of_the_titan": {
        "name": "Gaze of the Titan",
        "description": "A full-face iron helm powered internally by stone magic, sharpening defensive reactions. (+55 DEF, +80 HP)",
        "rarity": "LEGENDARY",
        "value": 33000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 55,
            "hp": 80
        },
        "slot": "helmet",
        "reqLevel": 40
    },
    "titan_fist_gauntlets": {
        "name": "Titan Fist Gauntlets",
        "description": "Heavy gauntlets that channel the raw strength of a colossal golem into every punch. (+40 ATK, +30 DEF)",
        "rarity": "LEGENDARY",
        "value": 34000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 40,
            "def": 30
        },
        "slot": "gloves",
        "reqLevel": 40
    },
    "wyrmscale_grips": {
        "name": "Wyrmscale Grips",
        "description": "Reinforced gloves that prevent weapons from slipping and increase physical attack speed. (+35 ATK, +20 SPD, +8 CRIT)",
        "rarity": "LEGENDARY",
        "value": 32000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 35,
            "spd": 20,
            "crit": 8
        },
        "slot": "gloves",
        "reqLevel": 40
    },
    "bloodsoaked_claws": {
        "name": "Blood-Soaked Claws",
        "description": "Vicious leather gauntlets tipped with dragon scale fragments that tear through enemy defense. (+40 ATK, +10 CRIT)",
        "rarity": "LEGENDARY",
        "value": 31000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 40,
            "crit": 10
        },
        "slot": "gloves",
        "reqLevel": 40
    },
    "gloves_of_the_ruined_kingdom": {
        "name": "Gloves of the Ruined Kingdom",
        "description": "Ancient gauntlets that hum with remnant artifact power, greatly augmenting magical accuracy. (+30 MAG, +15 SPD, +12 LCK)",
        "rarity": "LEGENDARY",
        "value": 33000,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 30,
            "spd": 15,
            "luck": 12
        },
        "slot": "gloves",
        "reqLevel": 40
    },
    "striders_of_the_dragon": {
        "name": "Striders of the Dragon",
        "description": "Swift boots forged with dragon scales, allowing the wearer to sprint through fire unscathed. (+35 DEF, +30 SPD)",
        "rarity": "LEGENDARY",
        "value": 31000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 35,
            "spd": 30
        },
        "slot": "boots",
        "reqLevel": 40
    },
    "titanstomp_sabatons": {
        "name": "Titan-Stomp Sabatons",
        "description": "Incredibly heavy boots. Every step leaves a shallow crater, giving incredible stability. (+65 DEF, -10 SPD, +100 HP)",
        "rarity": "LEGENDARY",
        "value": 33000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 65,
            "spd": -10,
            "hp": 100
        },
        "slot": "boots",
        "reqLevel": 40
    },
    "striders_of_the_titan": {
        "name": "Striders of the Titan",
        "description": "Heavy plated boots that make the wearer immune to knockback effects. (+55 DEF, +10 ATK, +50 HP)",
        "rarity": "LEGENDARY",
        "value": 32000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 55,
            "atk": 10,
            "hp": 50
        },
        "slot": "boots",
        "reqLevel": 40
    },
    "boots_of_eternal_blood": {
        "name": "Boots of Eternal Blood",
        "description": "Dark leather boots that absorb spilled life force to boost the user's movement speed mid-combat. (+30 DEF, +35 SPD, +100 HP)",
        "rarity": "LEGENDARY",
        "value": 32000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 30,
            "spd": 35,
            "hp": 100
        },
        "slot": "boots",
        "reqLevel": 40
    },
    "signet_of_the_ancestors": {
        "name": "Signet of the Ancestors",
        "description": "A ring housing a fragment of an ancient artifact. It hums with historical power. (+20 ATK, +20 MAG, +12 LCK)",
        "rarity": "LEGENDARY",
        "value": 36000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 20,
            "mag": 20,
            "luck": 12
        },
        "slot": "ring",
        "reqLevel": 40
    },
    "ancient_artifact_loop": {
        "name": "Ancient Artifact Loop",
        "description": "A ring crafted from an actual fragment of an ancient artifact. Its history hums with power. (+25 ATK, +15 LCK)",
        "rarity": "LEGENDARY",
        "value": 35000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 25,
            "luck": 15
        },
        "slot": "ring",
        "reqLevel": 40
    },
    "legendary_chrono_ring": {
        "name": "Legendary Chrono Ring",
        "description": "A ring built around an ancient artifact shard that alters local time loops slightly. (+15 SPD, +25 LCK, +10 CRIT)",
        "rarity": "LEGENDARY",
        "value": 36000,
        "type": "EQUIPMENT",
        "stats": {
            "spd": 15,
            "luck": 25,
            "crit": 10
        },
        "slot": "ring",
        "reqLevel": 40
    },
    "titanium_band": {
        "name": "Titanium Band",
        "description": "A thick, unyielding ring that significantly hardens the user's bone structure against impact. (+25 DEF, +100 HP)",
        "rarity": "LEGENDARY",
        "value": 34000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 25,
            "hp": 100
        },
        "slot": "ring",
        "reqLevel": 40
    },
    "pendant_of_eternity": {
        "name": "Pendant of Eternity",
        "description": "A beautiful necklace centered around an ancient artifact shard. It bolsters the wearer’s life force. (+150 HP, +40 DEF, +15 LCK)",
        "rarity": "LEGENDARY",
        "value": 35000,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 150,
            "def": 40,
            "luck": 15
        },
        "slot": "amulet",
        "reqLevel": 40
    },
    "talisman_of_eldritch_blood": {
        "name": "Talisman of Eldritch Blood",
        "description": "A vial of pure magic coursing through ancient veins, worn as a pendant. (+150 HP, +45 MAG, +10 LCK)",
        "rarity": "LEGENDARY",
        "value": 37000,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 150,
            "mag": 45,
            "luck": 10
        },
        "slot": "amulet",
        "reqLevel": 40
    },
    "pendant_of_the_dragon_eye": {
        "name": "Pendant of the Dragon Eye",
        "description": "A piercing red jewel amulet that reveals structural weaknesses in high-tier targets. (+30 ATK, +15 CRIT)",
        "rarity": "LEGENDARY",
        "value": 34000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 30,
            "crit": 15
        },
        "slot": "amulet",
        "reqLevel": 40
    },
    "amulet_of_the_broken_era": {
        "name": "Amulet of the Broken Era",
        "description": "A fragment of an ancient artifact bound together by glowing thread. Highly unstable but incredibly lucky. (+20 MAG, +35 LCK)",
        "rarity": "LEGENDARY",
        "value": 36000,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 20,
            "luck": 35
        },
        "slot": "amulet",
        "reqLevel": 40
    },
    "mirrorwarp_cloak": {
        "name": "Mirror-Warp Cloak",
        "description": "A sleek cloak infused with crystallized dark power that slightly blurs your physical location. (+30 DEF, +25 SPD, +10 CRIT)",
        "rarity": "LEGENDARY",
        "value": 28000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 30,
            "spd": 25,
            "crit": 10
        },
        "slot": "cloak",
        "reqLevel": 40
    },
    "mirrorimage_shroud": {
        "name": "Mirror-Image Shroud",
        "description": "A cloak made of dark power that leaves visual afterimages when sprinting. (+25 DEF, +35 SPD, +12 CRIT)",
        "rarity": "LEGENDARY",
        "value": 29000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 25,
            "spd": 35,
            "crit": 12
        },
        "slot": "cloak",
        "reqLevel": 40
    },
    "cloak_of_the_phantom": {
        "name": "Cloak of the Phantom",
        "description": "A sleek cloak made of dark matter that lets you pass fluidly through crowded combat fields. (+30 DEF, +40 SPD)",
        "rarity": "LEGENDARY",
        "value": 30000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 30,
            "spd": 40
        },
        "slot": "cloak",
        "reqLevel": 40
    },
    "dragonwing_cloak": {
        "name": "Dragon-Wing Cloak",
        "description": "A massive cloak forged from dragon membranes that allows the wearer to glide seamlessly through the air. (+40 DEF, +25 SPD, +10 LCK)",
        "rarity": "LEGENDARY",
        "value": 31000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 40,
            "spd": 25,
            "luck": 10
        },
        "slot": "cloak",
        "reqLevel": 40
    },
    "necrotic_carver": {
        "name": "Necrotic Carver",
        "description": "A jagged blade containing the soul of a powerful necromancer. It hungers for life force. (+50 ATK, +30 MAG)",
        "rarity": "EPIC",
        "value": 24000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 50,
            "mag": 30
        },
        "slot": "main_hand",
        "reqLevel": 30
    },
    "lichs_bone_wand": {
        "name": "Lich's Bone Wand",
        "description": "A sinister wand harboring the soul of a powerful necromancer. Spells cast feel chilling. (+15 ATK, +60 MAG)",
        "rarity": "EPIC",
        "value": 22000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 15,
            "mag": 60
        },
        "slot": "main_hand",
        "reqLevel": 30
    },
    "infected_hive_needle": {
        "name": "Infected Hive Needle",
        "description": "A thin, lethal rapier forged from concentrated Hive crystals. Leaves debilitating wounds. (+45 ATK, +25 SPD, +10 CRIT)",
        "rarity": "EPIC",
        "value": 23000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 45,
            "spd": 25,
            "crit": 10
        },
        "slot": "main_hand",
        "reqLevel": 30
    },
    "dark_matter_greatsword": {
        "name": "Dark Matter Greatsword",
        "description": "A blade forged from matter heavier than your student loans. Every swing carries immense kinetic energy. (+65 ATK, -5 SPD)",
        "rarity": "EPIC",
        "value": 24000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 65,
            "spd": -5
        },
        "slot": "main_hand",
        "reqLevel": 30
    },
    "cursed_mirror_buckler": {
        "name": "Cursed Mirror Buckler",
        "description": "A small shield made of hardened dark glass. It occasionally reflects spell damage. (+45 DEF, +10 LCK)",
        "rarity": "EPIC",
        "value": 18000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "luck": 10
        },
        "slot": "off_hand",
        "reqLevel": 30
    },
    "spiked_eel_buckler": {
        "name": "Spiked Eel Buckler",
        "description": "A small shield made from electric eel bones that shocks attackers on successful blocks. (+40 DEF, +15 SPD)",
        "rarity": "EPIC",
        "value": 17500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 40,
            "spd": 15
        },
        "slot": "off_hand",
        "reqLevel": 30
    },
    "phylactery_aegis": {
        "name": "Phylactery Aegis",
        "description": "A dark relic shield that stores the souls of fallen enemies to boost its defensive barrier. (+55 DEF, +100 HP, +10 MAG)",
        "rarity": "EPIC",
        "value": 19000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 55,
            "hp": 100,
            "mag": 10
        },
        "slot": "off_hand",
        "reqLevel": 30
    },
    "shield_of_restless_souls": {
        "name": "Shield of Restless Souls",
        "description": "A frightening shield made of woven ancient wood and trapped ethereal residue. (+50 DEF, +80 HP)",
        "rarity": "EPIC",
        "value": 18000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 50,
            "hp": 80
        },
        "slot": "off_hand",
        "reqLevel": 30
    },
    "corrupted_eel_carapace": {
        "name": "Corrupted Eel Carapace",
        "description": "Light armor crafted from an eel twisting with hazard energy. Shockingly durable. (+50 DEF, +100 HP, +15 SPD)",
        "rarity": "EPIC",
        "value": 22000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 50,
            "hp": 100,
            "spd": 15
        },
        "slot": "armor",
        "reqLevel": 30
    },
    "lichskin_vestments": {
        "name": "Lich-Skin Vestments",
        "description": "Ethereal robes woven with spirit residue. Physical attacks pass right through the loose fibers. (+45 DEF, +80 HP, +25 MAG)",
        "rarity": "EPIC",
        "value": 21000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "hp": 80,
            "mag": 25
        },
        "slot": "armor",
        "reqLevel": 30
    },
    "carapace_of_the_corrupted_eel": {
        "name": "Carapace of the Corrupted Eel",
        "description": "Sleek armor made from an eel twisting with hazard energy. Highly resistant to elements. (+55 DEF, +120 HP, +10 SPD)",
        "rarity": "EPIC",
        "value": 22500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 55,
            "hp": 120,
            "spd": 10
        },
        "slot": "armor",
        "reqLevel": 30
    },
    "hivecore_plate": {
        "name": "Hive-Core Plate",
        "description": "Heavy plate armor centered around a pulsing, corrupted heart. It regenerates minor damage over time. (+65 DEF, +150 HP)",
        "rarity": "EPIC",
        "value": 23000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 65,
            "hp": 150
        },
        "slot": "armor",
        "reqLevel": 30
    },
    "hood_of_the_restless": {
        "name": "Hood of the Restless",
        "description": "A dark, tattered hood radiating an ethereal residue. It sharpens your focus. (+20 DEF, +35 MAG, +8 CRIT)",
        "rarity": "EPIC",
        "value": 16000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 20,
            "mag": 35,
            "crit": 8
        },
        "slot": "helmet",
        "reqLevel": 30
    },
    "crown_of_restless_spirits": {
        "name": "Crown of Restless Spirits",
        "description": "A circlet wrapped in a swirling chill. It lets you hear threats right before they strike. (+20 DEF, +30 MAG, +10 LCK)",
        "rarity": "EPIC",
        "value": 15500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 20,
            "mag": 30,
            "luck": 10
        },
        "slot": "helmet",
        "reqLevel": 30
    },
    "gloom_hood": {
        "name": "Gloom Hood",
        "description": "A dark hood that is visually heavier than your student loans. It hides your face in absolute shadow. (+25 DEF, +20 MAG, +12 LCK)",
        "rarity": "EPIC",
        "value": 16000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 25,
            "mag": 20,
            "luck": 12
        },
        "slot": "helmet",
        "reqLevel": 30
    },
    "visor_of_the_necromancer": {
        "name": "Visor of the Necromancer",
        "description": "A cold iron helm that lets you see the remaining life points of your targets perfectly. (+30 DEF, +20 MAG, +10 CRIT)",
        "rarity": "EPIC",
        "value": 16500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 30,
            "mag": 20,
            "crit": 10
        },
        "slot": "helmet",
        "reqLevel": 30
    },
    "hivemind_mitts": {
        "name": "Hive-Mind Mitts",
        "description": "Gloves coated in concentrated Hive essence. They twitch with a life of their own, speeding up your attacks. (+20 ATK, +20 SPD)",
        "rarity": "EPIC",
        "value": 15500,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 20,
            "spd": 20
        },
        "slot": "gloves",
        "reqLevel": 30
    },
    "graveside_wraps": {
        "name": "Graveside Wraps",
        "description": "Tattered hand wraps that carry an ethereal residue, making weapon swings completely silent. (+20 ATK, +20 SPD, +8 CRIT)",
        "rarity": "EPIC",
        "value": 14000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 20,
            "spd": 20,
            "crit": 8
        },
        "slot": "gloves",
        "reqLevel": 30
    },
    "grips_of_the_forgotten": {
        "name": "Grips of the Forgotten",
        "description": "Gauntlets fashioned from petrified ancient wood, offering incredible crushing grip power. (+30 ATK, +15 DEF)",
        "rarity": "EPIC",
        "value": 14500,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 30,
            "def": 15
        },
        "slot": "gloves",
        "reqLevel": 30
    },
    "dark_matter_gauntlets": {
        "name": "Dark Matter Gauntlets",
        "description": "Heavy gloves that increase the impact weight of your standard physical strikes. (+35 ATK, +15 DEF)",
        "rarity": "EPIC",
        "value": 15000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 35,
            "def": 15
        },
        "slot": "gloves",
        "reqLevel": 30
    },
    "petrified_forest_boots": {
        "name": "Petrified Forest Boots",
        "description": "Heavy boots made from petrified wood from a forgotten forest. Firmly roots your stance. (+35 DEF, +50 HP)",
        "rarity": "EPIC",
        "value": 14000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 35,
            "hp": 50
        },
        "slot": "boots",
        "reqLevel": 30
    },
    "treads_of_the_forgotten_forest": {
        "name": "Treads of the Forgotten Forest",
        "description": "Heavy boots made of petrified ancient wood. Practically immune to mud or slowing fields. (+45 DEF, +50 HP)",
        "rarity": "EPIC",
        "value": 15000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "hp": 50
        },
        "slot": "boots",
        "reqLevel": 30
    },
    "shocking_treads": {
        "name": "Shocking Treads",
        "description": "Electric boots crafted from corrupted eel hides. They spark violently when you dash. (+25 DEF, +35 SPD, +5 CRIT)",
        "rarity": "EPIC",
        "value": 15500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 25,
            "spd": 35,
            "crit": 5
        },
        "slot": "boots",
        "reqLevel": 30
    },
    "hivespore_sabatons": {
        "name": "Hive-Spore Sabatons",
        "description": "Plated boots covered in hive residue that slow down any melee enemies standing near you. (+35 DEF, +15 SPD, +50 HP)",
        "rarity": "EPIC",
        "value": 14500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 35,
            "spd": 15,
            "hp": 50
        },
        "slot": "boots",
        "reqLevel": 30
    },
    "hivecore_band": {
        "name": "Hive-Core Band",
        "description": "A ring made from a pulsing, corrupted heart. It’s still beating... barely. (+10 ATK, +12 CRIT, +8 LCK)",
        "rarity": "EPIC",
        "value": 19000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 10,
            "crit": 12,
            "luck": 8
        },
        "slot": "ring",
        "reqLevel": 30
    },
    "pulsing_heart_loop": {
        "name": "Pulsing Heart Loop",
        "description": "A disturbing ring housing a tiny pulsing heart. It keeps your blood pumping at peak efficiency. (+120 HP, +8 CRIT)",
        "rarity": "EPIC",
        "value": 18500,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 120,
            "crit": 8
        },
        "slot": "ring",
        "reqLevel": 30
    },
    "lichs_signet": {
        "name": "Lich's Signet",
        "description": "A cold iron ring linked to a necromancer’s core, boosting dark magic capabilities. (+35 MAG, +5 CRIT)",
        "rarity": "EPIC",
        "value": 17500,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 35,
            "crit": 5
        },
        "slot": "ring",
        "reqLevel": 30
    },
    "ethereal_band": {
        "name": "Ethereal Band",
        "description": "A ring made of solid mystic light that slightly uncouples your finger from physical physics. (+15 MAG, +20 LCK)",
        "rarity": "EPIC",
        "value": 17000,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 15,
            "luck": 20
        },
        "slot": "ring",
        "reqLevel": 30
    },
    "crownjewel_choker": {
        "name": "Crown-Jewel Choker",
        "description": "A necklace threaded with mystic light. It casts a protective barrier around the neck. (+80 HP, +25 DEF, +12 MAG)",
        "rarity": "EPIC",
        "value": 17500,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 80,
            "def": 25,
            "mag": 12
        },
        "slot": "amulet",
        "reqLevel": 30
    },
    "choker_of_mystic_light": {
        "name": "Choker of Mystic Light",
        "description": "A beautiful necklace that glows with its own internal light, completely shielding your mind. (+30 MAG, +15 LCK)",
        "rarity": "EPIC",
        "value": 16000,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 30,
            "luck": 15
        },
        "slot": "amulet",
        "reqLevel": 30
    },
    "amulet_of_the_hive_mind": {
        "name": "Amulet of the Hive Mind",
        "description": "A pulsing insectoid charm that links your senses to the battlefield, preventing ambushes. (+100 HP, +15 SPD, +12 LCK)",
        "rarity": "EPIC",
        "value": 16500,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 100,
            "spd": 15,
            "luck": 12
        },
        "slot": "amulet",
        "reqLevel": 30
    },
    "phylactery_pendant": {
        "name": "Phylactery Pendant",
        "description": "A dark gemstone necklace holding remnants of a necromancer's magical focus. (+100 HP, +40 MAG)",
        "rarity": "EPIC",
        "value": 18000,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 100,
            "mag": 40
        },
        "slot": "amulet",
        "reqLevel": 30
    },
    "cloak_of_dark_matter": {
        "name": "Cloak of Dark Matter",
        "description": "Heavier than your student loans, but it shields you brilliantly from dark magic. (+40 DEF, +10 MAG)",
        "rarity": "EPIC",
        "value": 15000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 40,
            "mag": 10
        },
        "slot": "cloak",
        "reqLevel": 30
    },
    "cloak_of_the_hive": {
        "name": "Cloak of the Hive",
        "description": "A cloak dripping with concentrated Hive essence. It leaves a faint trail of slowing spores. (+35 DEF, +10 SPD)",
        "rarity": "EPIC",
        "value": 14500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 35,
            "spd": 10
        },
        "slot": "cloak",
        "reqLevel": 30
    },
    "spook_shroud": {
        "name": "Spook Shroud",
        "description": "A cloak made from ethereal residue that causes the wearer to drift smoothly over obstacles. (+30 DEF, +25 SPD, +10 MAG)",
        "rarity": "EPIC",
        "value": 15000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 30,
            "spd": 25,
            "mag": 10
        },
        "slot": "cloak",
        "reqLevel": 30
    },
    "weavers_cloak": {
        "name": "Weaver's Cloak",
        "description": "An elegant cloak woven from pure mystic thread that glows with its own internal light. (+25 DEF, +20 SPD, +15 MAG)",
        "rarity": "EPIC",
        "value": 15500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 25,
            "spd": 20,
            "mag": 15
        },
        "slot": "cloak",
        "reqLevel": 30
    },
    "golem_fist_smasher": {
        "name": "Golem Fist Smasher",
        "description": "A mace utilizing a pulsating heart of stone and magic as its head. (+40 ATK)",
        "rarity": "RARE",
        "value": 11500,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 40
        },
        "slot": "main_hand",
        "reqLevel": 20
    },
    "golemcore_mace": {
        "name": "Golem-Core Mace",
        "description": "A heavy mace fueled by a pulsating heart of stone and magic, dealing heavy blunt damage. (+45 ATK)",
        "rarity": "RARE",
        "value": 11000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 45
        },
        "slot": "main_hand",
        "reqLevel": 20
    },
    "elemental_ice_brand": {
        "name": "Elemental Ice Brand",
        "description": "A freezing blade embedded with small pieces of elemental ice. (+35 ATK, +10 MAG)",
        "rarity": "RARE",
        "value": 10500,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 35,
            "mag": 10
        },
        "slot": "main_hand",
        "reqLevel": 20
    },
    "lightning_shocksaber": {
        "name": "Lightning Shock-Saber",
        "description": "A rapid sword packed with small pieces of elemental lightning, ensuring swift critical strikes. (+30 ATK, +15 SPD, +8 CRIT)",
        "rarity": "RARE",
        "value": 10800,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 30,
            "spd": 15,
            "crit": 8
        },
        "slot": "main_hand",
        "reqLevel": 20
    },
    "mythril_wall": {
        "name": "Mythril Wall",
        "description": "A brilliant blue kite shield that is surprisingly heavy but entirely unyielding. (+50 DEF)",
        "rarity": "RARE",
        "value": 9800,
        "type": "EQUIPMENT",
        "stats": {
            "def": 50
        },
        "slot": "off_hand",
        "reqLevel": 20
    },
    "mythril_shield": {
        "name": "Mythril Shield",
        "description": "A gorgeous, brilliant blue shield that easily deflects standard magical and physical impacts. (+55 DEF)",
        "rarity": "RARE",
        "value": 9500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 55
        },
        "slot": "off_hand",
        "reqLevel": 20
    },
    "golem_stone_bastion": {
        "name": "Golem Stone Bastion",
        "description": "A heavy shield centered around a golem core. It is unyielding against crushing physical blows. (+65 DEF, +50 HP)",
        "rarity": "RARE",
        "value": 11500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 65,
            "hp": 50
        },
        "slot": "off_hand",
        "reqLevel": 20
    },
    "demonhide_target_shield": {
        "name": "Demon-Hide Target Shield",
        "description": "A small, nimble shield layered with tough, resilient skin from a demon. (+45 DEF, +10 SPD)",
        "rarity": "RARE",
        "value": 9200,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "spd": 10
        },
        "slot": "off_hand",
        "reqLevel": 20
    },
    "demon_scale_tunic": {
        "name": "Demon Scale Tunic",
        "description": "A resilient tunic fashioned from tough demon skin. (+40 DEF, +80 HP)",
        "rarity": "RARE",
        "value": 10500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 40,
            "hp": 80
        },
        "slot": "armor",
        "reqLevel": 20
    },
    "demon_skin_vest": {
        "name": "Demon Skin Vest",
        "description": "A tough, resilient vest made of demon hide. It provides natural magic resistance. (+45 DEF, +60 HP)",
        "rarity": "RARE",
        "value": 10000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 45,
            "hp": 60
        },
        "slot": "armor",
        "reqLevel": 20
    },
    "mythril_chainshirt": {
        "name": "Mythril Chainshirt",
        "description": "Lightweight chain armor forged from pure mythril ore. Surprisingly heavy but covers well. (+50 DEF, +40 HP, +10 SPD)",
        "rarity": "RARE",
        "value": 11000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 50,
            "hp": 40,
            "spd": 10
        },
        "slot": "armor",
        "reqLevel": 20
    },
    "plate_armor_of_the_flame": {
        "name": "Plate Armor of the Flame",
        "description": "Heavy metal armor insulated with flickering fire essence to guard against winter chills. (+60 DEF, +50 HP)",
        "rarity": "RARE",
        "value": 11200,
        "type": "EQUIPMENT",
        "stats": {
            "def": 60,
            "hp": 50
        },
        "slot": "armor",
        "reqLevel": 20
    },
    "crown_of_static": {
        "name": "Crown of Static",
        "description": "A circlet crafted from concentrated magic. It smells like static electricity. (+15 DEF, +25 MAG)",
        "rarity": "RARE",
        "value": 7800,
        "type": "EQUIPMENT",
        "stats": {
            "def": 15,
            "mag": 25
        },
        "slot": "helmet",
        "reqLevel": 20
    },
    "circlet_of_static": {
        "name": "Circlet of Static",
        "description": "A shiny circlet made from concentrated magic crystals. It continuously smells like static. (+15 DEF, +30 MAG)",
        "rarity": "RARE",
        "value": 7500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 15,
            "mag": 30
        },
        "slot": "helmet",
        "reqLevel": 20
    },
    "helm_of_fire_essence": {
        "name": "Helm of Fire Essence",
        "description": "A glowing iron helm hosting a flickering flame that sharpens your battle senses. (+25 DEF, +15 ATK, +5 CRIT)",
        "rarity": "RARE",
        "value": 8000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 25,
            "atk": 15,
            "crit": 5
        },
        "slot": "helmet",
        "reqLevel": 20
    },
    "mask_of_concentrated_magic": {
        "name": "Mask of Concentrated Magic",
        "description": "A complete iron mask containing a concentrated magic core that constantly smells like static. (+20 DEF, +25 MAG)",
        "rarity": "RARE",
        "value": 7800,
        "type": "EQUIPMENT",
        "stats": {
            "def": 20,
            "mag": 25
        },
        "slot": "helmet",
        "reqLevel": 20
    },
    "spellweave_gloves": {
        "name": "Spell-Weave Gloves",
        "description": "Gloves insulated with concentrated magic to stabilize high-tier casting. (+15 MAG, +10 SPD)",
        "rarity": "RARE",
        "value": 6500,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 15,
            "spd": 10
        },
        "slot": "gloves",
        "reqLevel": 20
    },
    "manacharged_bracers": {
        "name": "Mana-Charged Bracers",
        "description": "Leather gauntlets embedded with mana dew to stabilize spell casting during rapid motion. (+20 MAG, +10 SPD)",
        "rarity": "RARE",
        "value": 6800,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 20,
            "spd": 10
        },
        "slot": "gloves",
        "reqLevel": 20
    },
    "demon_grip_gauntlets": {
        "name": "Demon Grip Gauntlets",
        "description": "Heavy leather gloves tailored from demon skin, ensuring a resilient grip on heavy weapons. (+25 ATK, +10 DEF)",
        "rarity": "RARE",
        "value": 7000,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 25,
            "def": 10
        },
        "slot": "gloves",
        "reqLevel": 20
    },
    "insulated_ice_grips": {
        "name": "Insulated Ice Grips",
        "description": "Cold-resistant gloves forged with small pieces of elemental ice to freeze targets upon hitting. (+20 ATK, +15 MAG)",
        "rarity": "RARE",
        "value": 6900,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 20,
            "mag": 15
        },
        "slot": "gloves",
        "reqLevel": 20
    },
    "bear_claw_sabatons": {
        "name": "Bear Claw Sabatons",
        "description": "Heavy iron boots tipped with sharp, dangerous bear claws for lethal kick attacks. (+20 DEF, +15 ATK)",
        "rarity": "RARE",
        "value": 7000,
        "type": "EQUIPMENT",
        "stats": {
            "def": 20,
            "atk": 15
        },
        "slot": "boots",
        "reqLevel": 20
    },
    "bear_claw_boots": {
        "name": "Bear Claw Boots",
        "description": "Leather travel boots fixed with sharp, dangerous bear claws along the rim. (+20 DEF, +12 ATK, +5 CRIT)",
        "rarity": "RARE",
        "value": 7200,
        "type": "EQUIPMENT",
        "stats": {
            "def": 20,
            "atk": 12,
            "crit": 5
        },
        "slot": "boots",
        "reqLevel": 20
    },
    "sabatons_of_static": {
        "name": "Sabatons of Static",
        "description": "Plated boots carrying small pieces of elemental lightning, giving you a faster sprint step. (+20 DEF, +25 SPD)",
        "rarity": "RARE",
        "value": 7400,
        "type": "EQUIPMENT",
        "stats": {
            "def": 20,
            "spd": 25
        },
        "slot": "boots",
        "reqLevel": 20
    },
    "mythrilplated_greaves": {
        "name": "Mythril-Plated Greaves",
        "description": "Beautiful blue-tinted boots that make your footsteps incredibly light but firmly grounded. (+30 DEF, +15 SPD)",
        "rarity": "RARE",
        "value": 7600,
        "type": "EQUIPMENT",
        "stats": {
            "def": 30,
            "spd": 15
        },
        "slot": "boots",
        "reqLevel": 20
    },
    "rainbow_hoop": {
        "name": "Rainbow Hoop",
        "description": "A beautifully colored ring that sparkles with immense value, granting high good fortune. (+15 LCK, +5 CRIT)",
        "rarity": "RARE",
        "value": 8500,
        "type": "EQUIPMENT",
        "stats": {
            "luck": 15,
            "crit": 5
        },
        "slot": "ring",
        "reqLevel": 20
    },
    "glinting_trout_ring": {
        "name": "Glinting Trout Ring",
        "description": "A ring carved from rare fish components, sparkling with immense value and luck. (+20 LCK)",
        "rarity": "RARE",
        "value": 8200,
        "type": "EQUIPMENT",
        "stats": {
            "luck": 20
        },
        "slot": "ring",
        "reqLevel": 20
    },
    "sparkling_gem_band": {
        "name": "Sparkling Gem Band",
        "description": "A sparkling gemstone ring of immense value. Merchants look at you with deep respect. (+10 MAG, +15 LCK)",
        "rarity": "RARE",
        "value": 8000,
        "type": "EQUIPMENT",
        "stats": {
            "mag": 10,
            "luck": 15
        },
        "slot": "ring",
        "reqLevel": 20
    },
    "golem_core_signet": {
        "name": "Golem Core Signet",
        "description": "A bulky ring that funnels a pulsing heart of stone magic into your defense rating. (+20 DEF, +40 HP)",
        "rarity": "RARE",
        "value": 8500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 20,
            "hp": 40
        },
        "slot": "ring",
        "reqLevel": 20
    },
    "talisman_of_flowing_mana": {
        "name": "Talisman of Flowing Mana",
        "description": "A simple charm containing magic Gatorade that constantly refreshes your magical energy. (+50 HP, +20 MAG)",
        "rarity": "RARE",
        "value": 6000,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 50,
            "mag": 20
        },
        "slot": "amulet",
        "reqLevel": 20
    },
    "amulet_of_magic_gatorade": {
        "name": "Amulet of Magic Gatorade",
        "description": "A small crystal flask filled with basically magic Gatorade that steadily refreshes your mind. (+40 HP, +25 MAG)",
        "rarity": "RARE",
        "value": 6400,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 40,
            "mag": 25
        },
        "slot": "amulet",
        "reqLevel": 20
    },
    "dewdrop_necklace": {
        "name": "Dewdrop Necklace",
        "description": "A necklace holding pure magic dew. It keeps your physical stamina exceptionally stable. (+80 HP, +15 MAG)",
        "rarity": "RARE",
        "value": 6200,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 80,
            "mag": 15
        },
        "slot": "amulet",
        "reqLevel": 20
    },
    "troutscale_medallion": {
        "name": "Trout-Scale Medallion",
        "description": "A colorful medallion crafted from a beautifully colored rainbow trout, boosting your organic luck. (+50 HP, +18 LCK)",
        "rarity": "RARE",
        "value": 6000,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 50,
            "luck": 18
        },
        "slot": "amulet",
        "reqLevel": 20
    },
    "fireflicker_cloak": {
        "name": "Fire-Flicker Cloak",
        "description": "A cloak hosting a flickering flame that keeps the wearer warm and deters ice attacks. (+15 DEF, +15 ATK)",
        "rarity": "RARE",
        "value": 6200,
        "type": "EQUIPMENT",
        "stats": {
            "def": 15,
            "atk": 15
        },
        "slot": "cloak",
        "reqLevel": 20
    },
    "flickering_flame_cape": {
        "name": "Flickering Flame Cape",
        "description": "A bright cape containing a flickering flame that shields the user from freezing conditions. (+20 DEF, +10 ATK)",
        "rarity": "RARE",
        "value": 6500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 20,
            "atk": 10
        },
        "slot": "cloak",
        "reqLevel": 20
    },
    "glacial_shawl": {
        "name": "Glacial Shawl",
        "description": "A pale cloak lined with ice shards that slows down nearby aggressive fire hazards. (+25 DEF, +10 MAG)",
        "rarity": "RARE",
        "value": 6300,
        "type": "EQUIPMENT",
        "stats": {
            "def": 25,
            "mag": 10
        },
        "slot": "cloak",
        "reqLevel": 20
    },
    "static_shock_cape": {
        "name": "Static Shock Cape",
        "description": "A crackling cape made from elemental lightning components, accelerating your base movement speed. (+15 DEF, +20 SPD, +5 CRIT)",
        "rarity": "RARE",
        "value": 6400,
        "type": "EQUIPMENT",
        "stats": {
            "def": 15,
            "spd": 20,
            "crit": 5
        },
        "slot": "cloak",
        "reqLevel": 20
    },
    "sharpened_iron_cleaver": {
        "name": "Sharpened Iron Cleaver",
        "description": "A basic cleaver built from standard metal fragments. Gets the job done. (+15 ATK)",
        "rarity": "COMMON",
        "value": 1200,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 15
        },
        "slot": "main_hand",
        "reqLevel": 1
    },
    "scrap_metal_dagger": {
        "name": "Scrap Metal Dagger",
        "description": "A quick dagger put together from crude metal fragments. Gets the job done easily. (+12 ATK, +5 SPD)",
        "rarity": "COMMON",
        "value": 1100,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 12,
            "spd": 5
        },
        "slot": "main_hand",
        "reqLevel": 1
    },
    "antlertipped_spear": {
        "name": "Antler-Tipped Spear",
        "description": "A basic wooden spear tipped with deer antlers, useful for mid-range hunting strikes. (+16 ATK)",
        "rarity": "COMMON",
        "value": 1250,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 16
        },
        "slot": "main_hand",
        "reqLevel": 1
    },
    "heavy_iron_spikemaul": {
        "name": "Heavy Iron Spikemaul",
        "description": "A heavy club driven full of metal fragments. It is slow but breaks armor easily. (+22 ATK, -3 SPD)",
        "rarity": "COMMON",
        "value": 1300,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 22,
            "spd": -3
        },
        "slot": "main_hand",
        "reqLevel": 1
    },
    "reinforcement_platter": {
        "name": "Reinforcement Platter",
        "description": "A makeshift shield made from scrap iron shards layered together. (+18 DEF)",
        "rarity": "COMMON",
        "value": 950,
        "type": "EQUIPMENT",
        "stats": {
            "def": 18
        },
        "slot": "off_hand",
        "reqLevel": 1
    },
    "wooden_buckler": {
        "name": "Wooden Buckler",
        "description": "A crude shield made from deer antlers and scrap leather. Good for basic blocking. (+15 DEF)",
        "rarity": "COMMON",
        "value": 850,
        "type": "EQUIPMENT",
        "stats": {
            "def": 15
        },
        "slot": "off_hand",
        "reqLevel": 1
    },
    "iron_scaffold_shield": {
        "name": "Iron Scaffold Shield",
        "description": "A heavy square shield made completely out of compiled metal fragments. (+22 DEF)",
        "rarity": "COMMON",
        "value": 900,
        "type": "EQUIPMENT",
        "stats": {
            "def": 22
        },
        "slot": "off_hand",
        "reqLevel": 1
    },
    "scrap_platter_target": {
        "name": "Scrap Platter Target",
        "description": "A tiny round buckler fashioned from a single large piece of scrap iron. (+14 DEF, +4 SPD)",
        "rarity": "COMMON",
        "value": 880,
        "type": "EQUIPMENT",
        "stats": {
            "def": 14,
            "spd": 4
        },
        "slot": "off_hand",
        "reqLevel": 1
    },
    "hunters_jerkin": {
        "name": "Hunter's Jerkin",
        "description": "Standard leather armor crafted from soft and common rabbit fur. (+15 DEF, +30 HP)",
        "rarity": "COMMON",
        "value": 1100,
        "type": "EQUIPMENT",
        "stats": {
            "def": 15,
            "hp": 30
        },
        "slot": "armor",
        "reqLevel": 1
    },
    "rabbitfur_tunic": {
        "name": "Rabbit-Fur Tunic",
        "description": "Soft and common fur sewn into a basic tunic. Keeps you comfortable and protected. (+12 DEF, +25 HP)",
        "rarity": "COMMON",
        "value": 1050,
        "type": "EQUIPMENT",
        "stats": {
            "def": 12,
            "hp": 25
        },
        "slot": "armor",
        "reqLevel": 1
    },
    "antlerribbed_jerkin": {
        "name": "Antler-Ribbed Jerkin",
        "description": "Common leather armor reinforced across the ribs with sturdy deer antlers. (+18 DEF, +20 HP)",
        "rarity": "COMMON",
        "value": 1150,
        "type": "EQUIPMENT",
        "stats": {
            "def": 18,
            "hp": 20
        },
        "slot": "armor",
        "reqLevel": 1
    },
    "heavy_scaffold_vest": {
        "name": "Heavy Scaffold Vest",
        "description": "Coarse leather armor lined entirely with iron shards for reliable frontline protection. (+25 DEF)",
        "rarity": "COMMON",
        "value": 1200,
        "type": "EQUIPMENT",
        "stats": {
            "def": 25
        },
        "slot": "armor",
        "reqLevel": 1
    },
    "scrappers_cap": {
        "name": "Scrapper's Cap",
        "description": "A basic leather cap reinforced with tiny iron filings. Better than nothing. (+8 DEF)",
        "rarity": "COMMON",
        "value": 600,
        "type": "EQUIPMENT",
        "stats": {
            "def": 8
        },
        "slot": "helmet",
        "reqLevel": 1
    },
    "scrappers_leather_helm": {
        "name": "Scrapper's Leather Helm",
        "description": "A basic leather hat reinforced with small metal fragments along the brow line. (+7 DEF)",
        "rarity": "COMMON",
        "value": 550,
        "type": "EQUIPMENT",
        "stats": {
            "def": 7
        },
        "slot": "helmet",
        "reqLevel": 1
    },
    "furlined_cap": {
        "name": "Fur-Lined Cap",
        "description": "A very soft cap made entirely from rabbit fur, protecting your head from simple bumps. (+6 DEF, +10 HP)",
        "rarity": "COMMON",
        "value": 580,
        "type": "EQUIPMENT",
        "stats": {
            "def": 6,
            "hp": 10
        },
        "slot": "helmet",
        "reqLevel": 1
    },
    "antler_crown_cap": {
        "name": "Antler Crown Cap",
        "description": "A basic leather cap with small deer antlers fixed to the sides to deflect downward strikes. (+9 DEF)",
        "rarity": "COMMON",
        "value": 600,
        "type": "EQUIPMENT",
        "stats": {
            "def": 9
        },
        "slot": "helmet",
        "reqLevel": 1
    },
    "trappers_mitts": {
        "name": "Trapper's Mitts",
        "description": "Simple, coarse gloves woven from sticky giant spider silk. Good for handling rough items. (+5 DEF, +5 SPD)",
        "rarity": "COMMON",
        "value": 550,
        "type": "EQUIPMENT",
        "stats": {
            "def": 5,
            "spd": 5
        },
        "slot": "gloves",
        "reqLevel": 1
    },
    "sticky_silk_wraps": {
        "name": "Sticky Silk Wraps",
        "description": "Simple gloves woven from strong, sticky silk from giant spiders. Grants good grip strength. (+4 DEF, +6 SPD)",
        "rarity": "COMMON",
        "value": 500,
        "type": "EQUIPMENT",
        "stats": {
            "def": 4,
            "spd": 6
        },
        "slot": "gloves",
        "reqLevel": 1
    },
    "ironfisted_mitts": {
        "name": "Iron-Fisted Mitts",
        "description": "Coarse gloves layered with flat metal fragments across the knuckles to enhance punches. (+6 ATK, +4 DEF)",
        "rarity": "COMMON",
        "value": 550,
        "type": "EQUIPMENT",
        "stats": {
            "atk": 6,
            "def": 4
        },
        "slot": "gloves",
        "reqLevel": 1
    },
    "trappers_thick_gloves": {
        "name": "Trapper's Thick Gloves",
        "description": "Thick, coarse gloves made from tough leather, built for handling wild creatures safely. (+8 DEF)",
        "rarity": "COMMON",
        "value": 520,
        "type": "EQUIPMENT",
        "stats": {
            "def": 8
        },
        "slot": "gloves",
        "reqLevel": 1
    },
    "mudstained_boots": {
        "name": "Mud-Stained Boots",
        "description": "Sturdy, common leather footwear designed to withstand long journeys through marshlands. (+8 DEF, +5 SPD)",
        "rarity": "COMMON",
        "value": 650,
        "type": "EQUIPMENT",
        "stats": {
            "def": 8,
            "spd": 5
        },
        "slot": "boots",
        "reqLevel": 1
    },
    "travelers_leather_boots": {
        "name": "Traveler's Leather Boots",
        "description": "Sturdy, common leather boots meant for walking along dusty dirt roads. (+6 DEF, +6 SPD)",
        "rarity": "COMMON",
        "value": 600,
        "type": "EQUIPMENT",
        "stats": {
            "def": 6,
            "spd": 6
        },
        "slot": "boots",
        "reqLevel": 1
    },
    "heavy_marching_boots": {
        "name": "Heavy Marching Boots",
        "description": "Thick leather boots with basic iron soles that resist minor stepping hazards. (+10 DEF, +2 SPD)",
        "rarity": "COMMON",
        "value": 620,
        "type": "EQUIPMENT",
        "stats": {
            "def": 10,
            "spd": 2
        },
        "slot": "boots",
        "reqLevel": 1
    },
    "furlined_soft_boots": {
        "name": "Fur-Lined Soft Boots",
        "description": "Exceptionally comfortable leather footwear lined inside with warm rabbit fur. (+5 DEF, +8 SPD)",
        "rarity": "COMMON",
        "value": 640,
        "type": "EQUIPMENT",
        "stats": {
            "def": 5,
            "spd": 8
        },
        "slot": "boots",
        "reqLevel": 1
    },
    "copper_band": {
        "name": "Copper Band",
        "description": "A cheap, glinting ring made from melted Zeni coins. Offers a tiny bit of luck. (+3 LCK)",
        "rarity": "COMMON",
        "value": 400,
        "type": "EQUIPMENT",
        "stats": {
            "luck": 3
        },
        "slot": "ring",
        "reqLevel": 1
    },
    "melted_zeni_loop": {
        "name": "Melted Zeni Loop",
        "description": "A simple ring hammered together out of glinting Zeni coins. Gives minor luck. (+4 LCK)",
        "rarity": "COMMON",
        "value": 350,
        "type": "EQUIPMENT",
        "stats": {
            "luck": 4
        },
        "slot": "ring",
        "reqLevel": 1
    },
    "scrapiron_band": {
        "name": "Scrap-Iron Band",
        "description": "A crude, heavy iron ring that provides a tiny bump to your overall physical defense. (+3 DEF)",
        "rarity": "COMMON",
        "value": 380,
        "type": "EQUIPMENT",
        "stats": {
            "def": 3
        },
        "slot": "ring",
        "reqLevel": 1
    },
    "lucky_fishbone_ring": {
        "name": "Lucky Fish-Bone Ring",
        "description": "A simple ring made from pond fish bones that provides a tiny bit of fortune. (+5 LCK)",
        "rarity": "COMMON",
        "value": 390,
        "type": "EQUIPMENT",
        "stats": {
            "luck": 5
        },
        "slot": "ring",
        "reqLevel": 1
    },
    "herbalists_charm": {
        "name": "Herbalist's Charm",
        "description": "A small satchel filled with sun-kissed herbs. Smells great and gently mends small wounds. (+25 HP)",
        "rarity": "COMMON",
        "value": 500,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 25
        },
        "slot": "amulet",
        "reqLevel": 1
    },
    "sunkissed_herb_satchel": {
        "name": "Sun-Kissed Herb Satchel",
        "description": "Natural medicine herbs kept in a necklace pouch, slowly mending your minor scratches. (+20 HP)",
        "rarity": "COMMON",
        "value": 480,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 20
        },
        "slot": "amulet",
        "reqLevel": 1
    },
    "pondbass_charm": {
        "name": "Pond-Bass Charm",
        "description": "A dried common pond fish worn on a string, somehow providing a slight boost to stamina. (+15 HP, +2 SPD)",
        "rarity": "COMMON",
        "value": 450,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 15,
            "spd": 2
        },
        "slot": "amulet",
        "reqLevel": 1
    },
    "herbalists_choker": {
        "name": "Herbalist's Choker",
        "description": "A string necklace holding sun-kissed herbs that clears minor poisons or toxins. (+30 HP)",
        "rarity": "COMMON",
        "value": 490,
        "type": "EQUIPMENT",
        "stats": {
            "hp": 30
        },
        "slot": "amulet",
        "reqLevel": 1
    },
    "ragged_travelers_shawl": {
        "name": "Ragged Traveler’s Shawl",
        "description": "A tattered cloak that offers minor protection from the elements. (+5 DEF)",
        "rarity": "COMMON",
        "value": 450,
        "type": "EQUIPMENT",
        "stats": {
            "def": 5
        },
        "slot": "cloak",
        "reqLevel": 1
    },
    "tattered_rag_shawl": {
        "name": "Tattered Rag Shawl",
        "description": "A tattered traveler's cloak that offers very basic shelter against sudden downpours. (+4 DEF)",
        "rarity": "COMMON",
        "value": 420,
        "type": "EQUIPMENT",
        "stats": {
            "def": 4
        },
        "slot": "cloak",
        "reqLevel": 1
    },
    "hunters_camo_cloak": {
        "name": "Hunter's Camo Cloak",
        "description": "A basic brown cloak built from rabbit fur that helps you blend into standard forests. (+5 DEF, +3 LCK)",
        "rarity": "COMMON",
        "value": 440,
        "type": "EQUIPMENT",
        "stats": {
            "def": 5,
            "luck": 3
        },
        "slot": "cloak",
        "reqLevel": 1
    },
    "thick_leather_mantle": {
        "name": "Thick Leather Mantle",
        "description": "A heavy leather shoulder cape that protects the wearer from simple slashing cuts. (+8 DEF)",
        "rarity": "COMMON",
        "value": 460,
        "type": "EQUIPMENT",
        "stats": {
            "def": 8
        },
        "slot": "cloak",
        "reqLevel": 1
    }
});

// ==========================================
// 💡 BUG FIX: Inject Crafted Items into ITEM_DATABASE
// ==========================================
// Done via setTimeout to prevent circular dependency with craftingSystem.js
setTimeout(() => {
    try {
        const crafting = require('./craftingSystem');
        const injectRecipes = (recipes) => {
            if (!recipes) return;
            for (const [key, recipe] of Object.entries(recipes)) {
                if (recipe.result && recipe.result.id && !ITEM_DATABASE[recipe.result.id]) {
                    ITEM_DATABASE[recipe.result.id] = {
                        name: recipe.name,
                        description: recipe.desc || 'Crafted item.',
                        rarity: recipe.result.rarity || 'RARE',
                        value: recipe.result.value || 100,
                        type: recipe.result.stats ? 'EQUIPMENT' : (recipe.result.usable ? 'CONSUMABLE' : 'ITEM'),
                        stats: recipe.result.stats,
                        slot: recipe.result.slot,
                        reqLevel: recipe.result.reqLevel || 1,
                        usable: recipe.result.usable || false,
                        effect: recipe.result.effect,
                        effectValue: recipe.result.effectValue,
                        duration: recipe.result.duration
                    };
                }
            }
        };
        injectRecipes(crafting.CRAFTING_RECIPES);
        injectRecipes(crafting.BREWING_RECIPES);
        injectRecipes(crafting.COOKING_RECIPES);
    } catch(e) {
        console.log("[lootSystem] Deferred crafting load failed:", e.message);
    }
}, 0);

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
