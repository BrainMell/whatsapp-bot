// ============================================
// 🛒 SHOP SYSTEM - Commands for buying items
// ============================================

const fs = require('fs');
const path = require('path');
const economy = require('./economy');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');
const classSystem = require('./classSystem');
const progression = require('./progression');
const botConfig = require('../botConfig');

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
        if (item.value > 1 && (item.type === 'EQUIPMENT' || id.includes('stone') || id.includes('potion') || id.includes('key'))) {
            buyableDbItems[id] = {
                id,
                name: item.name,
                icon: id.includes('stone') ? '💎' : (item.type === 'EQUIPMENT' ? '⚔️' : '🧪'),
                desc: item.description,
                cost: item.value,
                category: item.type === 'EQUIPMENT' ? 'EQUIPMENT' : 'QUEST'
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
    
    let msg = `┏━━━━━━━━━━━━┓\n`;
    msg += `┃ ${activeCat.icon} SHOP     ┃\n`;
    msg += `┗━━━━━━━━━━━━┛\n\n`;
    
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
        if (item.value > 1 && (item.type === 'EQUIPMENT' || id.includes('stone') || id.includes('potion') || id.includes('key'))) {
            buyableDbItems[id] = {
                id,
                name: item.name,
                icon: id.includes('stone') ? '💎' : (item.type === 'EQUIPMENT' ? '⚔️' : '🧪'),
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
    
    // If not found by ID, check if it's a number (index from displayed shop)
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
        // 💡 BUG FIX: Only deduct money if inventory add was successful
        economy.removeMoney(senderJid, item.cost);
        
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
        return {
            success: true,
            message: `${item.icon} *${item.name}* added to your bag!\n\n💡 Use \`${getPrefix()} equip ${item.id} ${item.slot}\` to wear it.`
        };
    }
    return result;
}

async function handleConsumable(senderJid, item) {
    // Strip _shop suffix if it exists to match lootSystem base IDs
    const baseId = item.id.replace('_shop', '');
    const itemInfo = lootSystem.getItemInfo(baseId);
    
    // Add to inventory using the unified system
    const result = await inventorySystem.addItem(senderJid, baseId, 1, {
        name: itemInfo.name,
        value: itemInfo.value,
        rarity: itemInfo.rarity || 'COMMON',
        source: 'MAIN_SHOP'
    });
    
    if (result.success) {
        return {
            success: true,
            message: `${item.icon} *${item.name}* added to inventory!\n\nUse in quests with \`${getPrefix()} combat item <number>\``
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
    const level = progression.getLevel(finalJid);
    const gp = progression.getGP(finalJid);
    
    // Update rank
    economy.updateAdventurerRank(finalJid);
    const rank = user.adventurerRank || 'F';
    const rankData = classSystem.ADVENTURER_RANKS[rank];
    
    let msg = `┏━━━━━━━━━━━━┓\n`;
    msg += `┃ 👤 CHARACTER ┃\n`;
    msg += `┗━━━━━━━━━━━━┛\n\n`;
    
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
    msg += `${rankData.icon} *Rank:* ${rankData.name}\n`;
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
        msg += `  ${req.gp.toLocaleString()} GP\n`;
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
    
    // Handle PFP
    let pfpUrl;
    try {
        pfpUrl = await sock.profilePictureUrl(finalJid, 'image');
    } catch (e) {
        pfpUrl = null;
    }

    if (pfpUrl) {
        await sock.sendMessage(chatId, { 
            image: { url: pfpUrl },
            caption: msg
        });
    } else {
        // Use placeholder from assets
        const placeholderPath = path.join(__dirname, 'assets', 'placeholder.png');
        if (fs.existsSync(placeholderPath)) {
            await sock.sendMessage(chatId, { 
                image: fs.readFileSync(placeholderPath),
                caption: msg
            });
        } else {
            await sock.sendMessage(chatId, { text: msg });
        }
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

