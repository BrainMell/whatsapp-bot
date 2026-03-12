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
            { id: 'equipment_piece', weight: 5, quantity: [1, 1] }
        ]
    },
    
    // Elite enemy drops
    ELITE_ENEMY: {
        dropChance: 75,
        items: [
            { id: 'hp_potion', weight: 20, quantity: [1, 2] },
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
            { id: 'equipment_piece', weight: 15, quantity: [1, 1] }
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
            { id: 'legendary_shard', weight: 5, quantity: [1, 1] }
        ]
    },
    
    // Treasure chest
    TREASURE: {
        dropChance: 100,
        items: [
            { id: 'gold_pile', weight: 40, quantity: [50, 200] },
            { id: 'hp_potion', weight: 25, quantity: [2, 4] },
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
    const loot = generateLoot(encounterType, enemyName, difficulty);
    const goldDrop = overrideGold !== null ? overrideGold : generateGoldDrop(encounterType, difficulty);
    
    const goldPerPlayer = Math.floor(goldDrop / Math.max(1, players.length));

    const results = {
        items: [],
        gold: goldDrop,
        goldPerPlayer: goldPerPlayer,
        announcements: []
    };
    
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

    if (goldPerPlayer > 0) {
        for (const player of players) {
            const economy = require('./economy');
            economy.addMoney(player.jid, goldPerPlayer);
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
    'evolution_stone': { name: 'Evolution Stone (T2)', description: 'Triggers evolution to T2 class.', rarity: 'RARE', value: 8000, type: 'MATERIAL' },
    'ascension_stone': { name: 'Ascension Stone (T3)', description: 'Triggers ascension to T3 class.', rarity: 'EPIC', value: 50000, type: 'MATERIAL' },

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
    'minor_hp_potion': { name: 'Minor HP Potion', description: 'Restores ~15% HP.', rarity: 'COMMON', value: 200, type: 'POTION', usable: true, effect: 'heal', effectValue: 0.15 },
    'hp_potion': { name: 'Health Potion', description: 'Restores ~30% HP.', rarity: 'UNCOMMON', value: 600, type: 'POTION', usable: true, effect: 'heal', effectValue: 0.30 },
    'mega_potion': { name: 'Mega Potion', description: 'Restores ~60% HP.', rarity: 'RARE', value: 2500, type: 'POTION', usable: true, effect: 'heal', effectValue: 0.60 },
    'energy_drink': { name: 'Energy Drink', description: 'Restores 30% Energy.', rarity: 'UNCOMMON', value: 1200, type: 'POTION', usable: true, effect: 'restore_energy', effectValue: 0.30 },
    'ether': { name: 'Ether', description: 'Fully restores Energy.', rarity: 'RARE', value: 15000, type: 'POTION', usable: true, effect: 'restore_energy', effectValue: 1.0 },
    'phoenix_feather': { name: 'Phoenix Feather', description: 'Revives a fallen ally with 50% HP.', rarity: 'RARE', value: 5000, type: 'POTION', usable: true, effect: 'revive', effectValue: 0.5 },
    'bandage': { name: 'Bandage', description: 'Simple cloth used to wrap wounds.', rarity: 'COMMON', value: 50, type: 'MATERIAL' },
    
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
