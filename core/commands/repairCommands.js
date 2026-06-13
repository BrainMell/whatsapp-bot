// ============================================
// 🔨 REPAIR SYSTEM COMMANDS
// ============================================

const inventorySystem = require('../rpg/inventorySystem');
const durabilitySystem = require('../rpg/durabilitySystem');
const economy = require('../rpg/economy');
const botConfig = require('../../botConfig');

const getZENI = () => botConfig.getCurrency().symbol;
const getPrefix = () => botConfig.getPrefix();

const CONDITION_ICONS = {
    BROKEN: '💔',
    SEVERE: '🟧',
    MINOR: '🟨',
    GOOD: '🟩'
};

function getConditionIcon(pct) {
    if (pct <= 0) return CONDITION_ICONS.BROKEN;
    if (pct < 0.25) return CONDITION_ICONS.SEVERE;
    if (pct < 0.75) return CONDITION_ICONS.MINOR;
    return CONDITION_ICONS.GOOD;
}

/**
 * Displays the blacksmith menu showing the repair status and cost for all equipped gear
 */
async function displayBlacksmith(sock, chatId, userId) {
    const equipment = inventorySystem.getEquipment(userId);
    const user = economy.getUser(userId);
    
    let msg = `🔨 *BLACKSMITH REPAIR SERVICE* 🔨\n`;
    msg += `Wallet: 💰 ${getZENI()}${(user.wallet || 0).toLocaleString()}\n\n`;
    msg += `Here is the status of your equipped gear:\n\n`;
    
    let totalCost = 0;
    let index = 1;
    const itemsList = [];
    
    for (const [slot, item] of Object.entries(equipment)) {
        if (item) {
            const maxDur = item.maxDurability || 100;
            const curDur = item.durability !== undefined ? item.durability : maxDur;
            const pct = curDur / maxDur;
            const conditionIcon = getConditionIcon(pct);
            const repairCost = durabilitySystem.getRepairCost(item);
            
            msg += `*${index}.* ${conditionIcon} *${item.name}* (${slot.toUpperCase()})\n`;
            msg += `   ⚙️ Durability: ${Math.ceil(curDur)}/${maxDur}\n`;
            msg += `   💰 Repair Cost: ${getZENI()}${repairCost.toLocaleString()}\n\n`;
            
            totalCost += repairCost;
            itemsList.push({ index, slot, item, cost: repairCost });
            index++;
        }
    }
    
    if (itemsList.length === 0) {
        msg += `❌ You do not have any gear equipped to repair!\n`;
    } else {
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🛠️ *Repair All Cost:* ${getZENI()}${totalCost.toLocaleString()}\n\n`;
        msg += `💡 *How to repair:* \n`;
        msg += `- Repair single slot: \`${getPrefix()}repair <slot_name>\` or \`${getPrefix()}repair <#>\`\n`;
        msg += `  Example: \`${getPrefix()}repair main_hand\` or \`${getPrefix()}repair 1\`\n`;
        msg += `- Repair all items: \`${getPrefix()}repair all\`\n`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

/**
 * Repairs a specific item or all equipped gear
 */
async function repair(sock, chatId, userId, target) {
    if (!target) {
        return await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()}repair <slot_name/index>\` or \`${getPrefix()}repair all\`` });
    }
    
    const equipment = inventorySystem.getEquipment(userId);
    const user = economy.getUser(userId);
    const cleanTarget = target.toLowerCase().trim();
    
    if (cleanTarget === 'all') {
        let totalCost = 0;
        const toRepair = [];
        
        for (const [slot, item] of Object.entries(equipment)) {
            if (item) {
                const cost = durabilitySystem.getRepairCost(item);
                if (cost > 0) {
                    totalCost += cost;
                    toRepair.push({ slot, item, cost });
                }
            }
        }
        
        if (toRepair.length === 0) {
            return await sock.sendMessage(chatId, { text: `✅ All your equipped gear is already at full durability!` });
        }
        
        if (user.wallet < totalCost) {
            return await sock.sendMessage(chatId, { text: `❌ Insufficient Zeni! You need 💰 ${getZENI()}${totalCost.toLocaleString()} but only have 💰 ${getZENI()}${(user.wallet || 0).toLocaleString()}.` });
        }
        
        // Deduct money
        economy.removeMoney(userId, totalCost, `Repaired all equipped gear`);
        
        // Repair all items
        for (const entry of toRepair) {
            durabilitySystem.repairItem(entry.item);
        }
        
        economy.saveUser(userId);
        
        let successMsg = `🔨 *REPAIRS COMPLETE!* 🔨\n━━━━━━━━━━━━━━━━━━━━\n`;
        successMsg += `Successfully repaired all equipped items for 💰 ${getZENI()}${totalCost.toLocaleString()}.\n`;
        successMsg += `Your gear is now in pristine condition! ✨`;
        
        return await sock.sendMessage(chatId, { text: successMsg });
    }
    
    // Repair single item
    let selectedSlot = null;
    let selectedItem = null;
    
    // Check if index
    if (!isNaN(cleanTarget)) {
        const index = parseInt(cleanTarget) - 1;
        let currentIndex = 0;
        for (const [slot, item] of Object.entries(equipment)) {
            if (item) {
                if (currentIndex === index) {
                    selectedSlot = slot;
                    selectedItem = item;
                    break;
                }
                currentIndex++;
            }
        }
    } else {
        // Match slot name
        const match = Object.keys(equipment).find(slot => slot.toLowerCase() === cleanTarget);
        if (match) {
            selectedSlot = match;
            selectedItem = equipment[match];
        }
    }
    
    if (!selectedSlot || !selectedItem) {
        return await sock.sendMessage(chatId, { text: `❌ Item/Slot not found! Please check \`${getPrefix()}blacksmith\` for active slots.` });
    }
    
    const cost = durabilitySystem.getRepairCost(selectedItem);
    if (cost <= 0) {
        return await sock.sendMessage(chatId, { text: `✅ *${selectedItem.name}* is already at full durability!` });
    }
    
    if (user.wallet < cost) {
        return await sock.sendMessage(chatId, { text: `❌ Insufficient Zeni! You need 💰 ${getZENI()}${cost.toLocaleString()} to repair this item.` });
    }
    
    // Deduct and repair
    economy.removeMoney(userId, cost, `Repaired ${selectedItem.name}`);
    durabilitySystem.repairItem(selectedItem);
    economy.saveUser(userId);
    
    let successMsg = `🔨 *REPAIRS COMPLETE!* 🔨\n━━━━━━━━━━━━━━━━━━━━\n`;
    successMsg += `Successfully repaired *${selectedItem.name}* (${selectedSlot.toUpperCase()}) for 💰 ${getZENI()}${cost.toLocaleString()}.\n`;
    successMsg += `Remaining Wallet: 💰 ${getZENI()}${(user.wallet || 0).toLocaleString()}`;
    
    await sock.sendMessage(chatId, { text: successMsg });
}

/**
 * Renders an inspect card detail view for equipped or bagged items.
 */
async function inspectItem(sock, chatId, userId, target) {
    if (!target) {
        return await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()}inspect <#bag_index>\` or \`${getPrefix()}inspect <equipped_slot>\`` });
    }
    
    const inventory = inventorySystem.formatInventory(userId);
    const equipment = inventorySystem.getEquipment(userId);
    const lootSystem = require('../lootSystem');
    const weaponSynergy = require('../weaponSynergy');
    
    let item = null;
    let isEquipped = false;
    let slotName = null;
    
    const cleanTarget = target.toLowerCase().trim();
    if (!isNaN(cleanTarget)) {
        const index = parseInt(cleanTarget) - 1;
        if (!inventory.isEmpty && inventory.items[index]) {
            item = inventory.items[index];
        } else {
            let currentIndex = 0;
            for (const [slot, eqItem] of Object.entries(equipment)) {
                if (eqItem) {
                    if (currentIndex === index) {
                        item = eqItem;
                        isEquipped = true;
                        slotName = slot;
                        break;
                    }
                    currentIndex++;
                }
            }
        }
    } else {
        const match = Object.keys(equipment).find(slot => slot.toLowerCase() === cleanTarget);
        if (match) {
            item = equipment[match];
            isEquipped = true;
            slotName = match;
        }
    }
    
    if (!item) {
        return await sock.sendMessage(chatId, { text: `❌ Item not found! Please check your bag or equipped gear.` });
    }
    
    const itemInfo = lootSystem.getItemInfo(item.id);
    const rarity = (item.rarity || itemInfo.rarity || 'COMMON').toUpperCase();
    const rarityInfo = inventorySystem.ITEM_RARITY[rarity] || { name: rarity, icon: '⚪' };
    
    let msg = `🔎 *ITEM INSPECTION* 🔎\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `${rarityInfo.icon} *${item.name || itemInfo.name || item.id}*\n`;
    msg += `Rarity: *${rarityInfo.name}*\n`;
    msg += `Type: *${itemInfo.type}*\n`;
    
    const arch = weaponSynergy.inferArchetype(item, itemInfo);
    if (arch !== 'UNKNOWN') {
        msg += `Archetype: *${arch}*\n`;
    }
    
    msg += `\n*STATS:*\n`;
    const stats = item.stats || itemInfo.stats || {};
    let statLines = '';
    for (const [stat, val] of Object.entries(stats)) {
        if (val) statLines += `• ${stat.toUpperCase()}: +${val}\n`;
    }
    msg += statLines || '• No stat bonuses\n';
    
    msg += `\n*CONDITION & VALUE:*\n`;
    if (isEquipped && item.durability !== undefined) {
        const maxDur = item.maxDurability || 100;
        const curDur = item.durability;
        const repairCost = durabilitySystem.getRepairCost(item);
        msg += `⚙️ Durability: ${Math.ceil(curDur)}/${maxDur}\n`;
        if (item.durabilityTraits && item.durabilityTraits.length > 0) {
            msg += `✨ Traits: ${item.durabilityTraits.join(', ')}\n`;
        }
        msg += `💰 Repair Cost: ${getZENI()}${repairCost.toLocaleString()}\n`;
    } else {
        msg += `⚙️ Durability: _In storage (Pristine)_\n`;
    }
    
    const value = itemInfo.value || item.value || 0;
    msg += `💰 Base Value: ${getZENI()}${value.toLocaleString()}\n`;
    
    msg += `\n📝 _${itemInfo.description || 'No description available.'}_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━`;
    
    await sock.sendMessage(chatId, { text: msg });
}

module.exports = {
    displayBlacksmith,
    repair,
    inspectItem
};
