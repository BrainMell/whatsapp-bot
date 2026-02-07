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
    const items = classSystem.CLASS_SHOP_ITEMS;
    
    // Categories
    const categoryInfo = {
        all: { name: 'All Items', icon: '🏪' },
        class: { name: 'Class Items', icon: '🎭' },
        quest: { name: 'Quest Consumables', icon: '🧪' },
        equipment: { name: 'Equipment', icon: '⚔️' },
        permanent: { name: 'Permanent Boosts', icon: '📈' },
        misc: { name: 'Miscellaneous', icon: '📦' }
    };
    
    const activeCat = categoryInfo[category.toLowerCase()] || categoryInfo.all;
    
    let msg = `┏━━━━━━━━━━━━━━━┓\n`;
    msg += `┃   ${activeCat.icon} ${activeCat.name.toUpperCase()} \n`;
    msg += `┗━━━━━━━━━━━━━━━┛\n\n`;
    
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
    const items = classSystem.CLASS_SHOP_ITEMS;
    const sanitizedInput = input.toLowerCase().trim().replace(/ /g, '_');
    let item = items[sanitizedInput];
    
    // If not found by ID, check if it's a number
    if (!item && !isNaN(parseInt(input))) {
        const index = parseInt(input) - 1;
        // Get the list of all items (matching the default displayShop order)
        const allItemsList = Object.values(items);
        if (index >= 0 && index < allItemsList.length) {
            item = allItemsList[index];
        }
    }
    
    if (!item) {
        await sock.sendMessage(chatId, { 
            text: `❌ Item not found!\n\nType \`${getPrefix()} shop\` to see available items.\n💡 You can use the item name or its number.`
        });
        return;
    }
    
    const itemId = item.id;
    
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
            result = await handleEvolution(sock, chatId, senderJid);
            break;
        case 'RESET':
            result = await handleReset(senderJid);
            break;
        case 'STAT_BOOST':
            result = await handleStatBoost(senderJid, item);
            break;
        case 'EQUIPMENT':
            result = await handleEquipment(senderJid, item);
            break;
        case 'CONSUMABLE':
        case 'BOOSTER':
            result = await handleConsumable(senderJid, item);
            break;
        default:
            result = { success: false, message: '❌ Unknown item type!' };
    }
    
    if (result.success) {
        // Deduct money
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

async function handleEvolution(sock, chatId, senderJid) {
    // Initialize class if needed
    economy.initializeClass(senderJid);
    
    const currentClass = economy.getUserClass(senderJid);
    if (!currentClass) {
        return { success: false, message: '❌ No class assigned!' };
    }
    
    if (currentClass.tier !== 'STARTER') {
        return { success: false, message: '❌ Already evolved!' };
    }
    
    // Check requirements
    const user = economy.getUser(senderJid);
    const level = progression.getLevel(senderJid);
    const canEvo = classSystem.canEvolve(currentClass.id, level, user.questsCompleted || 0);
    
    if (!canEvo.canEvolve) {
        return { success: false, message: canEvo.reason };
    }
    
    // Show evolution options
    let msg = `┏━━━━━━━━━━━━━━━┓\n`;
    msg += `┃   🔮 EVOLVE     ┃\n`;
    msg += `┗━━━━━━━━━━━━━━━┛\n\n`;
    msg += `${currentClass.icon} Current: *${currentClass.name}*\n\n`;
    msg += `Available Paths:\n\n`;
    
    canEvo.evolutions.forEach((evo, index) => {
        msg += `${index + 1}. ${evo.icon} *${evo.name}* \n`;
        msg += `   📝 ${evo.desc}\n`;
        msg += `   ⚡ Role: ${evo.role}\n`;
        msg += `   💰 Cost: ${getZENI()}${evo.evolutionCost.toLocaleString()}\n\n`;
    });
    
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `💬 Choose: lexiblePrefix} evolve <#>flexiblePrefix}\n`;
    msg += `📌 Example: lexiblePrefix} evolve 1flexiblePrefix}`;
    
    await sock.sendMessage(chatId, { text: msg });
    
    return { success: false, message: '🔮 Evolution options shown above!' };
}

async function handleReset(senderJid) {
    return economy.resetClass(senderJid);
}

async function handleStatBoost(senderJid, item) {
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
    inventorySystem.addItem(senderJid, item.id, 1, {
        name: item.name,
        type: 'EQUIPMENT',
        rarity: item.rarity || 'COMMON',
        stats: item.stats,
        slot: item.slot,
        value: item.cost
    });
    
    return {
        success: true,
        message: `${item.icon} *${item.name}* added to your bag!\n\n💡 Use lexiblePrefix} equip ${item.id} ${item.slot}flexiblePrefix} to wear it.`
    };
}

async function handleConsumable(senderJid, item) {
    // Strip _shop suffix if it exists to match lootSystem base IDs
    const baseId = item.id.replace('_shop', '');
    const itemInfo = lootSystem.getItemInfo(baseId);
    
    // Add to inventory using the unified system
    inventorySystem.addItem(senderJid, baseId, 1, {
        name: itemInfo.name,
        value: itemInfo.value,
        rarity: itemInfo.rarity || 'COMMON',
        source: 'MAIN_SHOP'
    });
    
    return {
        success: true,
        message: `${item.icon} *${item.name}* added to inventory!\n\nUse in quests with lexiblePrefix} combat item <number>flexiblePrefix}`
    };
}

// ==========================================
// 🔄 EVOLUTION COMMAND
// ==========================================

async function handleEvolutionChoice(sock, chatId, senderJid, choiceNumber) {
    const currentClass = economy.getUserClass(senderJid);
    if (!currentClass || currentClass.tier !== 'STARTER') {
        await sock.sendMessage(chatId, {
            text: '❌ You must have a starter class to evolve!'
        });
        return;
    }
    
    // Get available evolutions
    const user = economy.getUser(senderJid);
    const level = progression.getLevel(senderJid);
    const canEvo = classSystem.canEvolve(currentClass.id, level, user.questsCompleted || 0);
    
    if (!canEvo.canEvolve) {
        await sock.sendMessage(chatId, { text: canEvo.reason });
        return;
    }
    
    const choice = parseInt(choiceNumber) - 1;
    if (choice < 0 || choice >= canEvo.evolutions.length) {
        await sock.sendMessage(chatId, { text: '❌ Invalid choice!' });
        return;
    }
    
    const selectedEvo = canEvo.evolutions[choice];
    
    // Check balance for evolution cost
    const balance = economy.getBalance(senderJid);
    if (balance < selectedEvo.evolutionCost) {
        await sock.sendMessage(chatId, {
            text: `❌ Insufficient funds!\n\nEvolution Cost: ${getZENI()}${selectedEvo.evolutionCost.toLocaleString()}\nYour Balance: ${getZENI()}${balance.toLocaleString()}`
        });
        return;
    }
    
    // Perform evolution
    const result = economy.evolveClass(senderJid, selectedEvo.id);
    
    if (result.success) {
        economy.removeMoney(senderJid, selectedEvo.evolutionCost);
        await sock.sendMessage(chatId, {
            text: `${result.message}\n\n💸 Paid: ${getZENI()}${selectedEvo.evolutionCost.toLocaleString()}`
        });
    } else {
        await sock.sendMessage(chatId, { text: result.message });
    }
}

// ==========================================
// 📊 CHARACTER INFO
// ==========================================

async function displayCharacter(sock, chatId, senderJid, senderName) {
    // Initialize class if needed
    economy.initializeClass(senderJid);
    
    const user = economy.getUser(senderJid);
    if (!user) {
        await sock.sendMessage(chatId, { text: '❌ Not registered!' });
        return;
    }
    
    const classData = economy.getUserClass(senderJid);
    const stats = economy.getUserStats(senderJid);
    const level = progression.getLevel(senderJid);
    const gp = progression.getGP(senderJid);
    
    // Update rank
    economy.updateAdventurerRank(senderJid);
    const rank = user.adventurerRank || 'F';
    const rankData = classSystem.ADVENTURER_RANKS[rank];
    
    let msg = `┏━━━━━━━━━━━━━━━┓\n`;
    msg += `┃   👤 CHARACTER  ┃\n`;
    msg += `┗━━━━━━━━━━━━━━━┛\n\n`;
    
    msg += `*${senderName}*\n\n`;
    
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
    msg += `🗡️ Quests: ${user.questsCompleted || 0} (Won: ${user.questsWon || 0})\n\n`;
    
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
        msg += `Buy Evolution Stone from shop!`;
    }
    
    // Handle PFP
    let pfpUrl;
    try {
        pfpUrl = await sock.profilePictureUrl(senderJid, 'image');
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
    handleEvolutionChoice,
    displayCharacter
};

