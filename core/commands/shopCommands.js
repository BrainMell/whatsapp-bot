// ============================================
// 🛒 SHOP SYSTEM - Commands for buying items
// ============================================

const fs = require('fs');
const path = require('path');
const economy = require('../rpg/economy');
const inventorySystem = require('../rpg/inventorySystem');
const lootSystem = require('../rpg/lootSystem');
const classSystem = require('../rpg/classSystem');
const progression = require('../rpg/progression');
const botConfig = require('../../botConfig');
const GoImageService = require('../utils/goImageService');
const goService = new GoImageService();
const profileHelper = require('../utils/profileHelper');

const getZENI = () => botConfig.getCurrency().symbol;
const getPrefix = () => botConfig.getPrefix();

// ==========================================
// 🏪 SHOP DISPLAY
// ==========================================

async function displayShop(sock, chatId, category = 'all') {
    // 1. Combine specialized class items with the broad item database
    const classItems = classSystem.CLASS_SHOP_ITEMS;
    const allDbItems = lootSystem.ITEM_DATABASE;

    // 2. Identify buyable items from the database (Equipment, Consumables, and Stones)
    const buyableDbItems = {};
    Object.entries(allDbItems).forEach(([id, item]) => {
        // Items with an explicit value > 1 that are Equipment, Stones, or specifically categorized
        if (item.value > 1 && (item.type === 'EQUIPMENT' || item.type === 'POTION' || id.includes('stone') || id.includes('potion') || id.includes('key') || id.includes('remedy'))) {
            buyableDbItems[id] = {
                id,
                name: item.name,
                icon: id.includes('stone') ? '💎' : (item.type === 'EQUIPMENT' ? '⚔️' : (id.includes('remedy') ? '🌱' : '🧪')),
                desc: item.description,
                cost: item.value,
                category: item.type === 'EQUIPMENT' ? 'EQUIPMENT' : 'QUEST',
                slot: item.slot // Copy the item's slot property
            };
        }
    });

    const items = { ...classItems, ...buyableDbItems };

    // Categories
    const categoryInfo = {
        all: { name: 'All Items', icon: '🛍️' },
        class: { name: 'Class Items', icon: '🎭' },
        quest: { name: 'Quest Items', icon: '🧪' },
        equipment: { name: 'Equipment', icon: '⚔️' },
        permanent: { name: 'Special', icon: '📈' }
    };
    
    const activeCat = categoryInfo[category.toLowerCase()] || categoryInfo.all;
    
    let msg = ``;
    msg += `${activeCat.icon} SHOP\n`;
    msg += `\n`;
    
    msg += `📂 *Categories:* \n`;
    Object.entries(categoryInfo).forEach(([key, info]) => {
        msg += `${info.icon} \`${getPrefix()} shop ${key}\`\n`;
    });
    
    msg += `\n━━━━━━━━━━━━━━━\n\n`;
    
    // Filter items by category
    const filteredItems = Object.entries(items).filter(([key, item]) => {
        if (category === 'all') return true;
        return item.category.toLowerCase() === category.toLowerCase();
    });
    
    if (filteredItems.length === 0) {
        msg += `❌ No items found in this category.\n`;
    } else {
        // Display items
        filteredItems.forEach(([key, item], index) => {
            msg += `${item.icon} *${item.name}* \n`;
            msg += `   💰 Price: ${getZENI()}${item.cost.toLocaleString()}\n`;
            msg += `   📝 ${item.desc}\n`;
            if (item.requirement) msg += `   ⚠️ ${item.requirement}\n`;
            msg += `   🆔 ID: \`${item.id}\`\n\n`;
        });
    }
    
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `💡 *How to buy:* \n`;
    msg += `Type: \`${getPrefix()} buy <id>\` or \`${getPrefix()} buy <#>\`\n`;
    msg += `📌 Example: \`${getPrefix()} buy health_potion_shop\``;
    
    await sock.sendMessage(chatId, { text: msg });
}

// ==========================================
// 💳 BUY ITEM
// ==========================================

async function buyItem(sock, chatId, senderJid, input) {
    // Build the full combined item list (same as displayShop 'all')
    const classItems = classSystem.CLASS_SHOP_ITEMS;
    const allDbItems = lootSystem.ITEM_DATABASE;
    const buyableDbItems = {};
    Object.entries(allDbItems).forEach(([id, item]) => {
        if (item.value > 1 && (item.type === 'EQUIPMENT' || item.type === 'POTION' || id.includes('stone') || id.includes('potion') || id.includes('key') || id.includes('remedy'))) {
            buyableDbItems[id] = {
                id,
                name: item.name,
                icon: id.includes('stone') ? '💎' : (item.type === 'EQUIPMENT' ? '⚔️' : (id.includes('remedy') ? '🌱' : '🧪')),
                desc: item.description,
                cost: item.value,
                type: item.type === 'EQUIPMENT' ? 'EQUIPMENT' : 'CONSUMABLE',
                category: item.type === 'EQUIPMENT' ? 'EQUIPMENT' : 'QUEST'
            };
        }
    });
    const allItems = { ...classItems, ...buyableDbItems };
    const allItemsList = Object.values(allItems);

    const sanitizedInput = input.toLowerCase().trim().replace(/ /g, '_');
    let item = allItems[sanitizedInput];
    
    // Fallback 1: Try stripping all underscores, hyphens, and spaces to match IDs (e.g. minor_hp_potion -> minorhppotion)
    if (!item) {
        const flatInput = sanitizedInput.replace(/_/g, '').replace(/-/g, '');
        item = Object.values(allItems).find(itm => 
            itm.id.replace(/_/g, '').replace(/-/g, '') === flatInput
        );
    }

    // Fallback 2: Try matching against the item's name (case-insensitive, ignoring non-alphanumeric characters)
    if (!item) {
        const flatNameInput = input.toLowerCase().replace(/[^a-z0-9]/g, '');
        item = Object.values(allItems).find(itm => 
            itm.name.toLowerCase().replace(/[^a-z0-9]/g, '') === flatNameInput
        );
    }
    
    // Fallback 3: If not found by ID or Name, check if it's a number (index from displayed shop)
    if (!item && !isNaN(parseInt(input))) {
        const index = parseInt(input) - 1;
        if (index >= 0 && index < allItemsList.length) {
            item = allItemsList[index];
        }
    }
    
    if (!item) {
        await sock.sendMessage(chatId, { 
            text: `❌ Item not found!\n\nType \`${getPrefix()} shop\` to see available items.\n💡 Use the item ID or its shop number.`
        });
        return;
    }
    
    const itemId = item.id;
    
    // Lineage Restriction for Dragon Key
    if (itemId === 'dragon_key') {
        const currentClass = economy.getUserClass(senderJid);
        if (!classSystem.isFighterLineage(currentClass?.id)) {
            return sock.sendMessage(chatId, { text: `❌ *DRAGON HUNTER LINEAGE REQUIRED*\n\nOnly members of the *Fighter* lineage can purchase this key. Dragonslayers are born from true warriors!` });
        }
    }

    // Check balance
    const balance = economy.getBalance(senderJid);
    if (balance < item.cost) {
        await sock.sendMessage(chatId, {
            text: `❌ Insufficient funds!\n\nNeed: ${getZENI()}${item.cost.toLocaleString()}\nYou have: ${getZENI()}${balance.toLocaleString()}`
        });
        return;
    }
    
    // Handle different item types
    let result;
    
    switch (item.type) {
        case 'CLASS_CHANGE':
            result = await handleClassChange(senderJid);
            break;
        case 'EVOLUTION':
        case 'ASCENSION':
            result = await handleConsumable(senderJid, item);
            break;
        case 'RESET':
            result = await handleReset(senderJid);
            break;
        case 'STAT_BOOST':
        case 'STAT_BOOST_PERM':
            result = await handleStatBoost(senderJid, item);
            break;
        case 'EQUIPMENT':
            result = await handleEquipment(senderJid, item);
            break;
        case 'CONSUMABLE':
        case 'BOOSTER':
        case 'SPECIAL_KEY':
            result = await handleConsumable(senderJid, item);
            break;
        default:
            result = { success: false, message: `❌ Unknown item type: ${item.type}` };
    }
    
    if (result.success) {
        // 💡 FIX: For non-rollbackable items (STAT_BOOST, CLASS_CHANGE, RESET,
        // CONSUMABLE), deduct money FIRST, then apply the effect. Previously
        // the effect was applied first and removeMoney was called after — if
        // removeMoney failed (race condition), the user got the effect for free.
        // For EQUIPMENT, the item can be rolled back, so the order doesn't
        // matter as much — but we still verify payment.
        const nonRollbackable = ['STAT_BOOST', 'STAT_BOOST_PERM', 'CLASS_CHANGE', 'RESET', 'CONSUMABLE', 'BOOSTER', 'SPECIAL_KEY', 'EVOLUTION', 'ASCENSION'];

        if (nonRollbackable.includes(item.type)) {
            // Deduct FIRST, then apply effect
            const paid = economy.removeMoney(senderJid, item.cost, `Bought ${item.id}`);
            if (!paid) {
                await sock.sendMessage(chatId, {
                    text: `❌ Purchase failed: insufficient funds (your wallet may have changed).`
                });
                return;
            }
            // Effect was already applied above — if we reach here, payment succeeded.
        } else {
            // EQUIPMENT: can be rolled back if payment fails
            const paid = economy.removeMoney(senderJid, item.cost, `Bought ${item.id}`);
            if (!paid) {
                try {
                    await inventorySystem.removeItem(senderJid, item.id, 1);
                } catch (e) { /* best effort */ }
                await sock.sendMessage(chatId, {
                    text: `❌ Purchase failed: your wallet balance changed during the transaction.`
                });
                return;
            }
        }

        await sock.sendMessage(chatId, {
            text: `✅ *PURCHASE SUCCESSFUL!*\n\n${result.message}\n\n💸 Paid: ${getZENI()}${item.cost.toLocaleString()}`
        });
    } else {
        await sock.sendMessage(chatId, { text: result.message });
    }
}

// ==========================================
// 🎯 ITEM HANDLERS
// ==========================================

async function handleClassChange(senderJid) {
    // Initialize class if needed (for old users)
    economy.initializeClass(senderJid);
    
    const result = economy.changeClass(senderJid);
    return result;
}

async function handleReset(senderJid) {
    return economy.resetClass(senderJid);
}

async function handleStatBoost(senderJid, item) {
    if (item.type === 'STAT_BOOST_PERM') {
        // Boost all stats by 5
        const stats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck'];
        stats.forEach(s => {
            economy.addStatBonus(senderJid, s, 5);
        });

        return {
            success: true,
            message: `📜 *ANCIENT KNOWLEDGE UNLOCKED!*\n\nYour core potential has expanded! (+5 to ALL base stats).`
        };
    }

    if (!item.boost) {
        return { success: false, message: '❌ Invalid boost item!' };
    }
    
    const success = economy.addStatBonus(senderJid, item.boost.stat, item.boost.value);
    
    if (success) {
        const statNames = {
            hp: 'HP',
            atk: 'ATK',
            def: 'DEF',
            mag: 'MAG',
            spd: 'SPD',
            luck: 'LUCK',
            crit: 'CRIT'
        };
        
        return {
            success: true,
            message: `📈 *PERMANENT BOOST!*

+${item.boost.value} ${statNames[item.boost.stat]}

This boost is permanent and applies to all your quests!`
        };
    }
    
    return { success: false, message: '❌ Failed to apply boost!' };
}

async function handleEquipment(senderJid, item) {
    // Add to inventory with its specific stats and slot
    const result = await inventorySystem.addItem(senderJid, item.id, 1, {
        name: item.name,
        type: 'EQUIPMENT',
        rarity: item.rarity || 'COMMON',
        stats: item.stats,
        slot: item.slot,
        value: item.cost
    });
    
    if (result.success) {
        // 💡 FIX §2.1: item.slot was undefined for some shop items, producing
        // "Use .e equip abyssal_carapace undefined to wear it." Now omits
        // the slot hint entirely if slot is missing — the player can just
        // use .e equip <id> without a slot argument.
        const slotHint = item.slot ? ` ${item.slot}` : '';
        return {
            success: true,
            message: `${item.icon} *${item.name}* added to your bag!\n\n💡 Use \`${getPrefix()} equip ${item.id}${slotHint}\` to wear it.`
        };
    }
    return result;
}

async function handleConsumable(senderJid, item) {
    // Strip _shop suffix if it exists to match lootSystem base IDs
    const baseId = item.id.replace('_shop', '');
    const itemInfo = lootSystem.getItemInfo(baseId);

    // 💡 FIX: Guard against undefined itemInfo — previously a misconfigured
    // shop item with _shop suffix but no matching base item would crash
    // on itemInfo.name with a TypeError.
    if (!itemInfo || !itemInfo.name) {
        return { success: false, message: `❌ Item configuration error for "${item.id}". Please report this to the bot owner.` };
    }

    // Add to inventory using the unified system
    const result = await inventorySystem.addItem(senderJid, baseId, 1, {
        name: itemInfo.name,
        value: itemInfo.value,
        rarity: itemInfo.rarity || 'COMMON',
        source: 'MAIN_SHOP'
    });
    
    if (result.success) {
        let helpMsg = `Use in quests with \`${getPrefix()} combat item <number>\``;
        if (baseId === 'ascension_stone' || baseId === 'evolution_stone') {
            const stoneTier = baseId === 'ascension_stone' ? 'T3 Ascension' : 'T2 Evolution';
            helpMsg = `🔮 This is a ${stoneTier} catalyst.\nUse \`${getPrefix()} evolve\` to trigger your class evolution/ascension.`;
        } else if (itemInfo.type === 'POTION' || itemInfo.type === 'CONSUMABLE') {
            helpMsg = `Use it from your inventory with \`${getPrefix()} use <#bag_index>\``;
        }
        
        return {
            success: true,
            message: `${item.icon} *${item.name}* added to inventory!\n\n💡 ${helpMsg}`
        };
    }
    return result;
}

// ==========================================
// 📊 CHARACTER INFO
// ==========================================

async function displayCharacter(sock, chatId, senderJid, senderName, targetJid = null, targetName = null) {
    const finalJid = targetJid || senderJid;
    const finalName = targetName || senderName;

    // Initialize class if needed
    economy.initializeClass(finalJid);
    
    const user = economy.getUser(finalJid);
    if (!user) {
        await sock.sendMessage(chatId, { text: '❌ User not registered!' });
        return;
    }
    
    const classData = economy.getUserClass(finalJid);
    const stats = economy.getUserStats(finalJid);
    const charSheet = progression.getCharacterSheet(finalJid);
    const level = charSheet?.level || 1;
    const gp = charSheet?.gp || 0;
    
    // Update rank
    economy.updateAdventurerRank(finalJid);
    const rank = user.adventurerRank || 'F';
    const rankData = classSystem.ADVENTURER_RANKS[rank];
    
    // Handle PFP
    let pfpUrl;
    try {
        pfpUrl = await sock.profilePictureUrl(finalJid, 'image');
    } catch (e) {
        pfpUrl = null;
    }

    // Try Go Image Service first
    try {
        const cardData = await profileHelper.buildCardData(finalJid, finalName, pfpUrl);
        if (cardData) {
            const cardBuffer = await goService.generateProfileCard(cardData);
            if (cardBuffer) {
                const captionMsg = `👤 *Profile:* ${cardData.nickname}\n🏆 *Rank:* ${rank}${cardData.statPoints > 0 ? `\n\n✨ *${cardData.statPoints} Stat Points available!*\nUse \`${getPrefix()} allocate <stat> <amount>\` to assign them.` : ''}`;
                await sock.sendMessage(chatId, { 
                    image: cardBuffer,
                    caption: captionMsg,
                    mentions: [finalJid]
                });
                return;
            }
        }
    } catch (err) {
        console.error("Failed to generate Go profile card:", err.message);
    }

    // Fallback to text message
    let msg = ``;
    msg += `👤 CHARACTER\n`;
    msg += `\n`;
    
    msg += `*${finalName}*\n\n`;
    
    // Class info
    if (classData) {
        msg += `${classData.icon} *Class:* ${classData.name}\n`;
        msg += `📝 ${classData.desc}\n`;
        
        if (classData.passive) {
            msg += `✨ *Passive:* ${classData.passive.name}\n`;
            msg += `   _${classData.passive.desc}_\n`;
        }
        
        if (classData.tier === 'EVOLVED') {
            msg += `⚡ Role: ${classData.role}\n`;
        }
        msg += `\n`;
    }
    
    // Adventurer Rank
    msg += `${rankData?.icon || '🔰'} *Rank:* ${rankData?.name || rank}\n`;
    msg += `📊 Level: ${level}\n`;
    msg += `⭐ GP: ${gp.toLocaleString()}\n`;
    msg += `🗡️ Quests: ${user.questsCompleted || 0} (Won: ${user.questsWon || 0})\n`;

    if (user.stats?.dragonsKilled) {
        msg += `🐲 Dragon Kills: ${user.stats.dragonsKilled}\n`;
    }
    msg += `\n`;

    // Stats
    if (stats) {
        msg += `📊 *STATS:*\n`;
        msg += `❤️ HP: ${stats.hp}\n`;
        msg += `⚔️ ATK: ${stats.atk} | 🛡️ DEF: ${stats.def}\n`;
        msg += `🔮 MAG: ${stats.mag} | 💨 SPD: ${stats.spd}\n`;
        msg += `🍀 LUCK: ${stats.luck} | 💥 CRIT: ${stats.crit}%\n\n`;
    }

    // Next rank
    const nextRank = classSystem.getNextRankRequirements(rank);
    if (nextRank) {
        msg += `━━━━━━━━━━━━━━━\n`;
        msg += `🎯 *Next Rank:* ${nextRank.rank}\n`;
        const req = nextRank.requirements;
        msg += `Need:\n`;
        msg += `  Level ${req.level}\n`;
        msg += `  ${req.questsCompleted} Quests\n`;
        msg += `  ${(req.gp || 0).toLocaleString()} GP\n`;
    } else {
        msg += `━━━━━━━━━━━━━━━\n`;
        msg += `✨ *MAX RANK ACHIEVED!* ✨\n`;
    }

    // Evolution info
    if (classData && classData.tier === 'STARTER') {
        msg += `\n━━━━━━━━━━━━━━━\n`;
        msg += `💡 *Can evolve at Level 10 with 3 quests!*\n`;
        msg += `Use \`${getPrefix()} evolve\` to see paths.`;
    } else if (classData && classData.tier === 'EVOLVED') {
        msg += `\n━━━━━━━━━━━━━━━\n`;
        msg += `💡 *Can ascend at Level 30 with 15 quests!*\n`;
        msg += `Use \`${getPrefix()} evolve\` to see paths.`;
    }

    try {
        if (pfpUrl) {
            await sock.sendMessage(chatId, { 
                image: { url: pfpUrl },
                caption: msg,
                mentions: [finalJid]
            });
        } else {
            // Use placeholder from botConfig
            const placeholderPath = botConfig.getAssetPath('placeholder.png');
            if (fs.existsSync(placeholderPath)) {
                await sock.sendMessage(chatId, { 
                    image: fs.readFileSync(placeholderPath),
                    caption: msg,
                    mentions: [finalJid]
                });
            } else {
                await sock.sendMessage(chatId, { 
                    text: msg,
                    mentions: [finalJid]
                });
            }
        }
    } catch (sendErr) {
        console.error("Failed to send character sheet:", sendErr.message);
        // Last resort: simple text without mentions or attachments
        try {
            await sock.sendMessage(chatId, { text: "⚠️ Error displaying profile card, but you are registered!" });
        } catch (fatal) {}
    }
    }

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
    displayShop,
    buyItem,
    displayCharacter
};

