// ============================================
// 🎒 COMPLETE INVENTORY & EQUIPMENT SYSTEM
// ============================================
// Handles inventory management, equipment, and item persistence

const economy = require('./economy');
const lootSystem = require('./lootSystem');

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
        icon: '⚪',
        sellMultiplier: 0.3,
        dropChance: 60
    },
    UNCOMMON: {
        name: 'Uncommon',
        icon: '🟢',
        sellMultiplier: 0.4,
        dropChance: 25
    },
    RARE: {
        name: 'Rare',
        icon: '🔵',
        sellMultiplier: 0.5,
        dropChance: 10
    },
    EPIC: {
        name: 'Epic',
        icon: '🟣',
        sellMultiplier: 0.6,
        dropChance: 4
    },
    LEGENDARY: {
        name: 'Legendary',
        icon: '🟡',
        sellMultiplier: 0.75,
        dropChance: 1
    },
    MYTHIC: {
        name: 'Mythic',
        icon: '🔴',
        sellMultiplier: 1.0,
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
    
    // 💡 Material Pouch Logic: Don't count materials towards the slot limit
    return Object.values(inventory).filter(item => {
        if (typeof item === 'number') return true; 
        return item.type !== 'MATERIAL';
    }).length;
}

function hasInventorySpace(userId, amount = 1, itemId = null) {
    if (itemId) {
        const itemInfo = lootSystem.getItemInfo(itemId);
        if (itemInfo.type === 'MATERIAL') return true;
    }
    
    const current = getInventoryCount(userId);
    const max = getInventorySlots(userId);
    return (current + amount) <= max;
}

function addItem(userId, itemId, quantity = 1, itemData = {}) {
    if (!hasInventorySpace(userId, quantity, itemId)) {
        return {
            success: false,
            message: '❌ Inventory full! Sell items or upgrade inventory size.'
        };
    }
    
    const inventory = getInventory(userId);
    const itemInfo = lootSystem.getItemInfo(itemId);
    
    // Stack if item already exists
    if (inventory[itemId]) {
        // Handle legacy number format
        if (typeof inventory[itemId] === 'number') {
            inventory[itemId] = {
                id: itemId,
                name: itemInfo.name,
                type: itemInfo.type || 'MATERIAL',
                quantity: inventory[itemId] + quantity,
                acquiredAt: Date.now(),
                ...itemData
            };
        } else {
            inventory[itemId].quantity = (inventory[itemId].quantity || 0) + quantity;
        }
    } else {
        inventory[itemId] = {
            id: itemId,
            name: itemInfo.name,
            type: itemInfo.type || (itemId.includes('shard') || itemId.includes('steel') || itemId.includes('leather') ? 'MATERIAL' : 'ITEM'),
            quantity: quantity,
            acquiredAt: Date.now(),
            ...itemData
        };
    }
    
    economy.saveUser(userId);
    
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
    // Handle legacy number format
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
    
    // Remove quantity
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

function equipItem(userId, itemId, slot) {
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
        addItem(userId, offHand.id, 1, offHand);
    }

    // 3. Ensure Main-Hand isn't a 2-Hander if equipping to Off-Hand
    if (slotName === 'off_hand' && equipment.main_hand) {
        const mainHandInfo = lootSystem.getItemInfo(equipment.main_hand.id);
        if (mainHandInfo.isTwoHanded) {
            const mainHand = equipment.main_hand;
            equipment.main_hand = null;
            addItem(userId, mainHand.id, 1, mainHand);
        }
    }
    
    const oldItem = equipment[slotName];
    if (oldItem) {
        // Safe to add back because we removed the new item first
        addItem(userId, oldItem.id, 1, oldItem);
    }
    
    equipment[slotName] = { ...itemToEquip };
    delete equipment[slotName].quantity;
    
    economy.saveUser(userId);
    
    return {
        success: true,
        equipped: itemId,
        slot: slotName
    };
}

function unequipItem(userId, slot) {
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
    const result = addItem(userId, item.id, 1, item);
    
    if (!result.success) {
        return result;
    }
    
    equipment[slotName] = null;
    economy.saveUser(userId);
    
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
    const baseValue = item.value || 100;
    const rarity = item.rarity || 'COMMON';
    let sellMultiplier = ITEM_RARITY[rarity]?.sellMultiplier || 0.3;
    
    // Special case for gold currency item: 1:15 exchange rate (100% of base value)
    if (itemId === 'gold') sellMultiplier = 1.0;
    
    const sellValue = Math.floor(baseValue * sellMultiplier * quantity);
    
    // Remove item and add money
    const removeResult = removeItem(userId, itemId, quantity);
    if (!removeResult.success) return removeResult;
    
    economy.addMoney(userId, sellValue);
    
    return {
        success: true,
        itemId,
        quantity,
        soldFor: sellValue,
        remaining: removeResult.remaining
    };
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
    
    // Sort by rarity
    const rarityOrder = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];
    items.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));
    
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
    upgradeInventory,
    formatInventory,
    
    // Equipment
    getEquipment,
    equipItem,
    unequipItem,
    getEquipmentStats,
    
    // Selling
    sellItem,
    
    // Config
    INVENTORY_CONFIG,
    ITEM_RARITY,
    EQUIPMENT_SLOTS
};
