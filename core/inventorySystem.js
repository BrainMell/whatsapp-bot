// ============================================
// 🎒 COMPLETE INVENTORY & EQUIPMENT SYSTEM
// ============================================
// Handles inventory management, equipment, and item persistence

const economy = require('./economy');
const lootSystem = require('./lootSystem');
const guilds = require('./guilds');
const classSystem = require('./classSystem');
const botConfig = require('../botConfig');

// ==========================================
// 📦 INVENTORY CONFIGURATION
// ==========================================

const INVENTORY_CONFIG = {
    BASE_SLOTS: 20,          // Starting inventory size
    MAX_SLOTS: 100,          // Maximum inventory size
    SLOTS_PER_UPGRADE: 5,    // Slots gained per upgrade
    UPGRADE_COST_BASE: 1000, // Base cost for upgrade
    UPGRADE_COST_SCALING: 1.5 // Cost multiplier per upgrade
};

// ==========================================
// 🎁 ITEM TYPES & RARITIES
// ==========================================

const ITEM_RARITY = {
    COMMON: {
        name: 'Common',
        icon: '⚪', // Grey
        sellMultiplier: 0.6,
        dropChance: 60
    },
    UNCOMMON: {
        name: 'Uncommon',
        icon: '🟢', // Green
        sellMultiplier: 0.7,
        dropChance: 25
    },
    RARE: {
        name: 'Rare',
        icon: '🔵', // Blue
        sellMultiplier: 0.8,
        dropChance: 10
    },
    EPIC: {
        name: 'Epic',
        icon: '🔴', // Red
        sellMultiplier: 0.9,
        dropChance: 4
    },
    LEGENDARY: {
        name: 'Legendary',
        icon: '🟡', // Yellow
        sellMultiplier: 1.0,
        dropChance: 1
    },
    MYTHIC: {
        name: 'Mythic',
        icon: '⚪', // White/Bright
        sellMultiplier: 1.2,
        dropChance: 0.1
    }
};

// ==========================================
// 🎒 INVENTORY MANAGEMENT
// ==========================================

function getInventory(userId) {
    const user = economy.getUser(userId);
    if (!user) return null;
    
    if (!user.inventory) {
        user.inventory = {};
    }
    
    return user.inventory;
}

function getInventorySlots(userId) {
    const user = economy.getUser(userId);
    if (!user) return INVENTORY_CONFIG.BASE_SLOTS;
    
    if (!user.inventorySlots) {
        user.inventorySlots = INVENTORY_CONFIG.BASE_SLOTS;
        economy.saveUser(userId);
    }
    
    return user.inventorySlots;
}

function getInventoryCount(userId) {
    const inventory = getInventory(userId);
    if (!inventory) return 0;
    
    // 💡 Count unique item stacks, excluding MATERIAL types
    let count = 0;
    for (const key in inventory) {
        const item = inventory[key];
        const itemInfo = lootSystem.getItemInfo(key);
        if (itemInfo.type !== 'MATERIAL') {
            count++;
        }
    }
    return count;
}

function hasInventorySpace(userId, amount = 1, itemId = null) {
    if (itemId) {
        const itemInfo = lootSystem.getItemInfo(itemId);
        if (itemInfo.type === 'MATERIAL') return true;
    }
    
    const inventory = getInventory(userId);
    const itemInfo = lootSystem.getItemInfo(itemId);
    
    // If the item already exists, it stacks and doesn't take a new slot
    if (itemId && inventory[itemId] && itemInfo.type !== 'MATERIAL') return true;

    const current = getInventoryCount(userId);
    const max = getInventorySlots(userId);
    return (current + amount) <= max;
}

async function addItem(userId, itemId, quantity = 1, itemData = {}) {
    const inventory = getInventory(userId);
    const itemInfo = lootSystem.getItemInfo(itemId);

    if (!hasInventorySpace(userId, 1, itemId)) {
        return {
            success: false,
            message: '❌ Inventory full! Sell items or upgrade inventory size.'
        };
    }
    
    // Ensure consistent object structure (migration)
    if (inventory[itemId]) {
        if (typeof inventory[itemId] === 'number') {
            inventory[itemId] = {
                id: itemId,
                name: itemInfo.name,
                type: itemInfo.type || 'ITEM',
                quantity: inventory[itemId] + quantity,
                acquiredAt: Date.now(),
                ...itemData
            };
        } else {
            inventory[itemId].quantity = (inventory[itemId].quantity || 0) + quantity;
            
            // 💡 Robustness: Hydrate missing essential properties from database
            if (!inventory[itemId].name) inventory[itemId].name = itemInfo.name;
            if (!inventory[itemId].type) inventory[itemId].type = itemInfo.type || 'ITEM';
            if (!inventory[itemId].rarity) inventory[itemId].rarity = itemInfo.rarity || 'COMMON';
            if (!inventory[itemId].value) inventory[itemId].value = itemInfo.value || 100;
            if (!inventory[itemId].stats && itemInfo.stats) inventory[itemId].stats = JSON.parse(JSON.stringify(itemInfo.stats));
            if (!inventory[itemId].slot && itemInfo.slot) inventory[itemId].slot = itemInfo.slot;

            // Update metadata if provided
            Object.assign(inventory[itemId], itemData);
        }
    } else {
        const itemType = itemData.type || itemInfo.type || (itemId.includes('shard') || itemId.includes('steel') || itemId.includes('leather') || itemId.includes('stone') ? 'MATERIAL' : 'ITEM');
        const itemRarity = itemData.rarity || itemInfo.rarity || 'COMMON';
        
        inventory[itemId] = {
            id: itemId,
            name: itemData.name || itemInfo.name,
            type: itemType,
            quantity: quantity,
            acquiredAt: Date.now(),
            rarity: itemRarity,
            value: itemData.value || itemInfo.value || 100,
            stats: itemData.stats || itemInfo.stats || {},
            slot: itemData.slot || itemInfo.slot,
            ...itemData
        };
    }
    
    await economy.saveUser(userId);
    
    return {
        success: true,
        itemId,
        quantity,
        totalQuantity: inventory[itemId].quantity
    };
}

function removeItem(userId, itemId, quantity = 1) {
    const inventory = getInventory(userId);
    
    if (!inventory[itemId]) {
        return {
            success: false,
            message: `❌ You don't have ${itemId}!`
        };
    }
    
    let currentQuantity = 0;
    if (typeof inventory[itemId] === 'number') {
        currentQuantity = inventory[itemId];
    } else {
        currentQuantity = inventory[itemId].quantity || 0;
    }
    
    if (currentQuantity < quantity) {
        return {
            success: false,
            message: `❌ Not enough ${itemId}! Have: ${currentQuantity}, Need: ${quantity}`
        };
    }
    
    // Uniformly update quantity
    if (typeof inventory[itemId] === 'number') {
        inventory[itemId] -= quantity;
        if (inventory[itemId] <= 0) {
            delete inventory[itemId];
        }
    } else {
        inventory[itemId].quantity -= quantity;
        if (inventory[itemId].quantity <= 0) {
            delete inventory[itemId];
        }
    }
    
    economy.saveUser(userId);
    
    return {
        success: true,
        itemId,
        quantity,
        remaining: inventory[itemId] ? (typeof inventory[itemId] === 'number' ? inventory[itemId] : inventory[itemId].quantity) : 0
    };
}

function hasItem(userId, itemId, quantity = 1) {
    const inventory = getInventory(userId);
    if (!inventory[itemId]) return false;
    
    let currentQuantity = 0;
    if (typeof inventory[itemId] === 'number') {
        currentQuantity = inventory[itemId];
    } else {
        currentQuantity = inventory[itemId].quantity || 0;
    }
    
    return currentQuantity >= quantity;
}

function getItemCount(userId, itemId) {
    const inventory = getInventory(userId);
    if (!inventory[itemId]) return 0;
    if (typeof inventory[itemId] === 'number') return inventory[itemId];
    return inventory[itemId].quantity || 0;
}

function upgradeInventory(userId) {
    const user = economy.getUser(userId);
    if (!user) return { success: false, message: 'User not found' };
    
    const currentSlots = getInventorySlots(userId);
    
    if (currentSlots >= INVENTORY_CONFIG.MAX_SLOTS) {
        return {
            success: false,
            message: `❌ Inventory already at maximum size (${INVENTORY_CONFIG.MAX_SLOTS} slots)!`
        };
    }
    
    // Calculate upgrade cost
    const upgradesApplied = (currentSlots - INVENTORY_CONFIG.BASE_SLOTS) / INVENTORY_CONFIG.SLOTS_PER_UPGRADE;
    const cost = Math.floor(INVENTORY_CONFIG.UPGRADE_COST_BASE * Math.pow(INVENTORY_CONFIG.UPGRADE_COST_SCALING, upgradesApplied));
    
    if (user.wallet < cost) {
        return {
            success: false,
            message: `❌ Not enough Zeni! Need: ${cost}, Have: ${user.wallet}`
        };
    }
    
    // Apply upgrade
    economy.removeMoney(userId, cost);
    user.inventorySlots = Math.min(currentSlots + INVENTORY_CONFIG.SLOTS_PER_UPGRADE, INVENTORY_CONFIG.MAX_SLOTS);
    economy.saveUser(userId);
    
    return {
        success: true,
        cost,
        oldSlots: currentSlots,
        newSlots: user.inventorySlots,
        slotsGained: INVENTORY_CONFIG.SLOTS_PER_UPGRADE
    };
}

// ==========================================
// ⚔️ EQUIPMENT SYSTEM
// ==========================================

const EQUIPMENT_SLOTS = {
    MAIN_HAND: 'main_hand',
    OFF_HAND: 'off_hand',
    ARMOR: 'armor',
    HELMET: 'helmet',
    BOOTS: 'boots',
    RING: 'ring',
    AMULET: 'amulet',
    CLOAK: 'cloak',
    GLOVES: 'gloves'
};

function getEquipment(userId) {
    const user = economy.getUser(userId);
    if (!user) return null;
    
    if (!user.equipment) {
        user.equipment = {
            main_hand: null,
            off_hand: null,
            armor: null,
            helmet: null,
            boots: null,
            ring: null,
            amulet: null,
            cloak: null,
            gloves: null
        };
        economy.saveUser(userId);
    }
    
    // 💡 Migration Logic: If they have the old 'weapon' slot, move it to 'main_hand'
    if (user.equipment.weapon !== undefined) {
        if (!user.equipment.main_hand) user.equipment.main_hand = user.equipment.weapon;
        delete user.equipment.weapon;
        economy.saveUser(userId);
    }
    
    return user.equipment;
}

async function equipItem(userId, itemId, slot) {
    const inventory = getInventory(userId);
    const equipment = getEquipment(userId);
    const progression = require('./progression');
    
    if (!inventory[itemId]) {
        return {
            success: false,
            message: `❌ You don't have ${itemId} in your inventory!`
        };
    }

    const itemToEquip = inventory[itemId];
    const itemInfo = lootSystem.getItemInfo(itemId);
    const playerLevel = progression.getLevel(userId);

    // 💡 LEVEL REQUIREMENT CHECK
    const reqLevel = itemToEquip.reqLevel || itemInfo.reqLevel || 1;
    if (playerLevel < reqLevel) {
        return {
            success: false,
            message: `❌ Level too low! Need Level ${reqLevel} to use this.`
        };
    }
    
    // Auto-detect slot if not provided
    let targetSlot = slot;
    if (!targetSlot) {
        targetSlot = itemToEquip.slot || itemInfo.slot;
        if (targetSlot === 'weapon') targetSlot = 'main_hand';
    }

    if (!targetSlot || !EQUIPMENT_SLOTS[targetSlot.toUpperCase()]) {
        return {
            success: false,
            message: `❌ Invalid or missing equipment slot! (Valid: main_hand, off_hand, armor, helmet, boots, ring, amulet, cloak, gloves)`
        };
    }
    
    const slotName = EQUIPMENT_SLOTS[targetSlot.toUpperCase()];
    
    // 💡 TWO-HANDED / SHIELD LOGIC
    const isTwoHanded = itemToEquip.isTwoHanded || itemInfo.isTwoHanded;

    // 1. Remove new item from inventory first
    removeItem(userId, itemId, 1);

    // 2. Handle Two-Hander logic (unequip Off-Hand if equipping to Main-Hand)
    if (isTwoHanded && slotName === 'main_hand' && equipment.off_hand) {
        const offHand = equipment.off_hand;
        equipment.off_hand = null;
        // Material pouch already handles infinite space for materials, but equipment needs space
        // We just freed one slot by removing the itemToEquip, so adding one back is safe
        await addItem(userId, offHand.id, 1, offHand);
    }

    // 3. Ensure Main-Hand isn't a 2-Hander if equipping to Off-Hand
    if (slotName === 'off_hand' && equipment.main_hand) {
        const mainHandInfo = lootSystem.getItemInfo(equipment.main_hand.id);
        if (mainHandInfo.isTwoHanded) {
            const mainHand = equipment.main_hand;
            equipment.main_hand = null;
            await addItem(userId, mainHand.id, 1, mainHand);
        }
    }
    
    const oldItem = equipment[slotName];
    if (oldItem) {
        // Safe to add back because we removed the new item first
        await addItem(userId, oldItem.id, 1, oldItem);
    }
    
    equipment[slotName] = { ...itemToEquip };
    delete equipment[slotName].quantity;
    
    await economy.saveUser(userId);
    
    return {
        success: true,
        equipped: itemId,
        slot: slotName
    };
}

async function unequipItem(userId, slot) {
    const equipment = getEquipment(userId);
    
    if (!EQUIPMENT_SLOTS[slot.toUpperCase()]) {
        return {
            success: false,
            message: `❌ Invalid equipment slot!`
        };
    }
    
    const slotName = EQUIPMENT_SLOTS[slot.toUpperCase()];
    
    if (!equipment[slotName]) {
        return {
            success: false,
            message: `❌ Nothing equipped in ${slotName} slot!`
        };
    }
    
    const item = equipment[slotName];
    
    // Check if there's space before unequipping
    if (!hasInventorySpace(userId, 1, item.id)) {
        return {
            success: false,
            message: `❌ Cannot unequip: Inventory full!`
        };
    }

    const result = await addItem(userId, item.id, 1, item);
    
    if (!result.success) {
        return result;
    }
    
    equipment[slotName] = null;
    await economy.saveUser(userId);
    
    return {
        success: true,
        unequipped: item.id,
        slot: slotName
    };
}

function getEquipmentStats(userId) {
    const equipment = getEquipment(userId);
    if (!equipment) return {};
    
    const totalStats = {
        hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0
    };
    
    for (const [slot, item] of Object.entries(equipment)) {
        if (item && item.stats) {
            for (const [stat, value] of Object.entries(item.stats)) {
                totalStats[stat] = (totalStats[stat] || 0) + value;
            }
        }
    }
    
    return totalStats;
}

function enhanceItem(userId, itemId, stoneId) {
    const inventory = getInventory(userId);
    if (!inventory[itemId]) return { success: false, message: '❌ Item not found in inventory!' };
    if (!inventory[stoneId]) return { success: false, message: '❌ Enhancement stone not found!' };

    const item = inventory[itemId];
    const stoneInfo = lootSystem.getItemInfo(stoneId);
    
    if (item.type !== 'EQUIPMENT') return { success: false, message: '❌ You can only enhance equipment!' };
    if (!stoneId.includes('enhancement_stone')) return { success: false, message: '❌ That is not an enhancement stone!' };

    // Enhancement logic
    const bonusMap = {
        'minor_enhancement_stone': 0.05,
        'rare_enhancement_stone': 0.15,
        'legendary_enhancement_stone': 0.35
    };

    const multiplier = bonusMap[stoneId] || 0.05;
    item.enhancementLevel = (item.enhancementLevel || 0) + 1;
    
    // Apply bonus to stats
    if (item.stats) {
        for (const stat in item.stats) {
            item.stats[stat] = Math.ceil(item.stats[stat] * (1 + multiplier));
        }
    }

    // Add prefix
    const prefixes = ['Polished', 'Strengthened', 'Reinforced', 'Masterwork', 'God-forged'];
    const prefix = prefixes[Math.min(item.enhancementLevel - 1, prefixes.length - 1)];
    
    // Ensure item has a name to avoid crash
    if (!item.name) item.name = itemId;

    if (!item.name.startsWith(prefix)) {
        item.name = `${prefix} ${item.name.replace(/^(Polished|Strengthened|Reinforced|Masterwork|God-forged) /, '')}`;
    }

    removeItem(userId, stoneId, 1);
    economy.saveUser(userId);

    return {
        success: true,
        message: `✨ *ENHANCEMENT SUCCESS!* \n\nYour *${item.name}* is now Level ${item.enhancementLevel}!\nStats boosted by ${Math.round(multiplier * 100)}%.`
    };
}

// ==========================================
// 💰 ITEM SELLING
// ==========================================

function sellItem(userId, itemId, quantity = 1) {
    const inventory = getInventory(userId);
    
    if (!inventory[itemId]) {
        return {
            success: false,
            message: `❌ You don't have ${itemId}!`
        };
    }
    
    const item = inventory[itemId];
    const currentQuantity = item.quantity || 1;
    
    if (currentQuantity < quantity) {
        return {
            success: false,
            message: `❌ Not enough ${itemId}! Have: ${currentQuantity}`
        };
    }
    
    // Calculate sell value
    const itemInfo = lootSystem.getItemInfo(itemId);
    const baseValue = item.value || itemInfo.value || 100;
    const rarity = item.rarity || itemInfo.rarity || 'COMMON';
    let sellMultiplier = ITEM_RARITY[rarity]?.sellMultiplier || 0.6;
    
    // Special case for gold currency item: 1:15 exchange rate (100% of base value)
    if (itemId === 'gold') sellMultiplier = 1.0;
    
    const totalValue = Math.floor(baseValue * sellMultiplier * quantity);
    let sellValue = totalValue;
    let guildContribution = null;

    // Remove item
    const removeResult = removeItem(userId, itemId, quantity);
    if (!removeResult.success) return removeResult;

    // Guild House Contribution System (5% tax)
    const guildName = guilds.getUserGuild(userId);
    if (guildName) {
        const taxAmount = Math.floor(totalValue * 0.05);
        if (taxAmount > 0) {
            const guildXP = Math.floor(taxAmount * 0.6);
            const guildBank = taxAmount - guildXP;
            
            guilds.addGuildPoints(guildName, guildXP, `Tax from ${itemId} sale`);
            guilds.addGuildBalance(guildName, guildBank);
            
            sellValue = totalValue - taxAmount;
            guildContribution = {
                amount: taxAmount,
                xp: guildXP,
                bank: guildBank,
                guildName: guildName
            };
        }
        // Merchant Tracking: Log Zeni earned to guild board
        guilds.updateBoardProgress(guildName, 'EARN_ZENI', totalValue);
    }
    
    economy.addMoney(userId, sellValue);
    
    return {
        success: true,
        itemId,
        quantity,
        totalValue: totalValue,
        soldFor: sellValue,
        guildContribution: guildContribution,
        remaining: removeResult.remaining
    };
}

// ==========================================
// 🛠️ ITEM USAGE
// ==========================================

function useItem(userId, itemId) {
    const inventory = getInventory(userId);
    const progression = require('./progression');
    const sheet = progression.getCharacterSheet(userId);
    
    if (!inventory[itemId]) {
        return { success: false, message: `❌ You don't have this item!` };
    }

    const itemInfo = lootSystem.getItemInfo(itemId);
    if (itemInfo.type !== 'CONSUMABLE' && itemInfo.type !== 'POTION') {
        return { success: false, message: `❌ This item cannot be used this way! Use \`${botConfig.getPrefix()} equip\` for gear.` };
    }

    // Effect handling
    let effectMsg = "";
    let consumed = true;

    if (itemId === 'hp_potion' || itemId === 'minor_hp_potion' || itemId === 'mega_potion') {
        const maxHp = sheet.stats.maxHp || sheet.stats.hp;
        const healPct = itemInfo.effectValue || 0.15;
        const heal = Math.floor(maxHp * healPct);
        sheet.stats.hp = Math.min(maxHp, (sheet.stats.hp || maxHp) + heal);
        effectMsg = `💚 Restored *${heal} HP*! (${Math.round(healPct * 100)}%)`;
    } 
    else if (itemId === 'energy_drink') {
        const user = economy.getUser(userId);
        user.energy = Math.min(user.maxEnergy || 100, (user.energy || 0) + 30);
        effectMsg = `⚡ Restored **30 Energy**!`;
    }
    else if (itemId === 'class_change_ticket' || itemId === 'reroll_ticket') {
        const user = economy.getUser(userId);
        const currentClass = classSystem.getClassById(user.class);
        
        // 1. Requirement: Must be a STARTER class
        if (currentClass.tier !== 'STARTER') {
            return { success: false, message: '❌ This item only works for *Starter* classes! Evolved or Ascended heroes must use a Skill Reset Scroll.' };
        }

        // 2. Cooldown Check: 5 hours after 5 uses
        const now = Date.now();
        const FIVE_HOURS = 5 * 60 * 60 * 1000;
        
        if (user.lastClassChangeReset && (now - user.lastClassChangeReset < FIVE_HOURS)) {
            const remaining = Math.ceil((FIVE_HOURS - (now - user.lastClassChangeReset)) / (60 * 1000));
            return { success: false, message: `❌ Exhausted! Your spirit needs to rest. You can reroll again in **${remaining} minutes**.` };
        }

        // 3. Usage Increment
        user.classChangeCount = (user.classChangeCount || 0) + 1;
        
        if (user.classChangeCount >= 5) {
            user.classChangeCount = 0;
            user.lastClassChangeReset = now;
            effectMsg = `🎫 *CLASS REROLL USED!* (Usage 5/5)\n\n✨ Your class has been changed! Your spirit is now exhausted. **5-hour cooldown applied.**`;
        } else {
            effectMsg = `🎫 *CLASS REROLL USED!* (Usage ${user.classChangeCount}/5)\n\n✨ Your class has been changed!`;
        }

        const result = economy.changeClass(userId);
        if (!result.success) return result;
        
        effectMsg += `\n\n${result.message.split('\n\n')[1]}`; // Append the new class info
    }
    else {
        return { success: false, message: `❌ Item effect not implemented yet.` };
    }

    if (consumed) {
        removeItem(userId, itemId, 1);
    }

    progression.saveProgression(userId);
    economy.saveUser(userId);

    return { success: true, message: effectMsg };
}

// ==========================================
// 📊 INVENTORY DISPLAY
// ==========================================

function formatInventory(userId) {
    const inventory = getInventory(userId);
    const slots = getInventorySlots(userId);
    const count = getInventoryCount(userId);
    
    if (!inventory || Object.keys(inventory).length === 0) {
        return {
            isEmpty: true,
            message: '📦 Your inventory is empty!',
            slots,
            count
        };
    }
    
    const items = Object.entries(inventory).map(([key, val]) => {
        // Look up item info for fallbacks
        const itemInfo = lootSystem.getItemInfo(key);
        
        // Handle legacy number format
        if (typeof val === 'number') {
            return {
                id: key,
                name: itemInfo.name || key,
                quantity: val,
                acquiredAt: Date.now(),
                rarity: itemInfo.rarity || 'COMMON',
                rarityIcon: ITEM_RARITY[itemInfo.rarity || 'COMMON']?.icon || '⚪'
            };
        }
        
        const rarity = val.rarity || itemInfo.rarity || 'COMMON';
        return {
            ...val,
            name: val.name || itemInfo.name || key,
            rarity: rarity,
            rarityIcon: ITEM_RARITY[rarity]?.icon || '⚪'
        };
    });
    
    // Sort by Rarity first (MYTHIC → COMMON) to match the inventory display numbering
    // This ensures item #3 in the display is the same as items[2] when selling/equipping by number
    const rarityOrder = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];
    const categoryOrder = ['EQUIPMENT', 'POTION', 'CONSUMABLE', 'MATERIAL', 'ITEM'];

    items.sort((a, b) => {
        const rarA = rarityOrder.indexOf(a.rarity || 'COMMON');
        const rarB = rarityOrder.indexOf(b.rarity || 'COMMON');
        if (rarA !== rarB) return rarA - rarB;
        // Within same rarity, sort by category
        const catA = categoryOrder.indexOf(a.type || 'ITEM');
        const catB = categoryOrder.indexOf(b.type || 'ITEM');
        if (catA !== catB) return catA - catB;
        return (a.name || '').localeCompare(b.name || '');
    });
    return {
        isEmpty: false,
        items,
        slots,
        count
    };
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
    // Inventory
    getInventory,
    getInventorySlots,
    getInventoryCount,
    hasInventorySpace,
    addItem,
    removeItem,
    hasItem,
    getItemCount,
    upgradeInventory,
    formatInventory,
    
    // Equipment
    getEquipment,
    equipItem,
    unequipItem,
    getEquipmentStats,
    enhanceItem,
    useItem,
    
    // Selling
    sellItem,
    
    // Config
    INVENTORY_CONFIG,
    ITEM_RARITY,
    EQUIPMENT_SLOTS
};
