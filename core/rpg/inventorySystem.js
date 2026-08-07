// ============================================
// 🎒 COMPLETE INVENTORY & EQUIPMENT SYSTEM
// ============================================
// Handles inventory management, equipment, and item persistence

const economy = require('./economy');
const lootSystem = require('./lootSystem');
const guilds = require('./guilds');
const classSystem = require('./classSystem');
const botConfig = require('../../botConfig');

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
        icon: '🟣', // Purple
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

            // 💡 BUG-05 fix: Update metadata if provided — but NEVER overwrite
            // instance-specific fields (rarity/stats/name/value/enhancement*)
            // that were set by a previous drop or by the hydrate block above.
            // The old `Object.assign(inventory[itemId], itemData)` clobbered
            // a previously-rolled Mythic rarity with the new drop's (often
            // lower) rarity, and replaced enhanced stats with base stats —
            // producing Akon's "Mythic weapon enhanced, no visible effect"
            // symptom. Now we only set fields that aren't already populated.
            // NOTE: equipment stacking is fundamentally broken (each instance
            // is unique), but this fix at least preserves the best existing
            // instance instead of overwriting it. Proper fix = non-stackable
            // equipment (deferred — bigger architectural change).
            for (const [k, v] of Object.entries(itemData)) {
                if (k === 'quantity') continue; // already handled at line 150
                if (inventory[itemId][k] === undefined || inventory[itemId][k] === null) {
                    inventory[itemId][k] = v;
                }
            }
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
        totalQuantity: typeof inventory[itemId] === 'number' ? inventory[itemId] : (inventory[itemId]?.quantity || quantity)
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

    // 💡 Durability Migration: Initialize durability for already equipped gear
    let needsSave = false;
    for (const [slot, item] of Object.entries(user.equipment)) {
        if (item && item.durability === undefined) {
            const durabilitySystem = require('./durabilitySystem');
            const durProfile = durabilitySystem.getDurabilityProfile(item.id, item, lootSystem.getItemInfo(item.id));
            item.maxDurability = durProfile.max;
            item.durability = durProfile.max;
            item.durabilityTraits = durProfile.traits;
            needsSave = true;
        }
    }
    if (needsSave) {
        economy.saveUser(userId);
    }
    
    return user.equipment;
}

async function equipItem(userId, itemId, slot) {
    const inventory = getInventory(userId);
    const equipment = getEquipment(userId);
    const progression = require('./progression');
    
    // Loose matching for underscores and spaces
    let targetItemId = itemId;
    const cleanItemId = (itemId || '').toLowerCase().replace(/_/g, '').replace(/ /g, '');
    const foundKey = Object.keys(inventory).find(k => k.toLowerCase().replace(/_/g, '').replace(/ /g, '') === cleanItemId);
    if (foundKey) {
        targetItemId = foundKey;
    }

    if (!inventory[targetItemId]) {
        return {
            success: false,
            message: `❌ You don't have ${itemId} in your inventory!`
        };
    }

    const itemToEquip = inventory[targetItemId];
    const itemInfo = lootSystem.getItemInfo(targetItemId);
    const playerLevel = progression.getLevel(userId);

    // 💡 LEVEL REQUIREMENT CHECK
    const reqLevel = itemToEquip.reqLevel || itemInfo.reqLevel || 1;
    if (playerLevel < reqLevel) {
        return {
            success: false,
            message: `❌ Level too low! Need Level ${reqLevel} to use this.`
        };
    }

    // 💡 FIX 2026-08-01 (GAP #1): rank enforcement on equip.
    // User quote: "Players should not be able to equip weapons above their
    // required rank or level." The reqRank is derived from reqLevel using the
    // rank thresholds in classSystem.ADVENTURER_RANKS (F=1, E=10, D=20, ...).
    // A player may meet the level req but not hold the rank yet (rank also
    // requires questsCompleted + GP) — in that case, block the equip.
    const reqRank = getRequiredRankForLevel(reqLevel);
    const user = economy.getUser(userId);
    const playerRank = user?.adventurerRank || 'F';
    if (!rankGte(playerRank, reqRank)) {
        const rankData = classSystem.ADVENTURER_RANKS[reqRank];
        return {
            success: false,
            message: `❌ Rank too low! Need *${rankData?.name || reqRank}* (Level ${reqLevel}) to equip this. You are *${classSystem.ADVENTURER_RANKS[playerRank]?.name || playerRank}*.\n\nRank up by completing quests and earning GP — use \`${botConfig.getPrefix()}rank\` to see your progress.`
        };
    }
    
    // Auto-detect slot if not provided
    let targetSlot = slot;
    // 💡 FIX 2026-08-03: normalize spaces/dashes to underscores for slot names
    if (typeof targetSlot === 'string') {
        targetSlot = targetSlot.toLowerCase().replace(/[\s-]+/g, '_');
        if (targetSlot === 'weapon') targetSlot = 'main_hand';
    }
    if (!targetSlot) {
        targetSlot = itemToEquip.slot || itemInfo.slot;
        if (targetSlot === 'weapon') targetSlot = 'main_hand';
    }

    // Ensure the item type is strictly EQUIPMENT, and not a fish or other category
    const isFish = itemId.toLowerCase().includes('fish') || (itemInfo.category && itemInfo.category.toLowerCase() === 'fish');
    if (itemInfo.type !== 'EQUIPMENT' || isFish) {
        return {
            success: false,
            message: `❌ ${itemInfo.name || itemId} is not equipment and cannot be equipped!`,
        };
    }

    // Ensure targetSlot is a valid equipment slot
    if (!targetSlot || !EQUIPMENT_SLOTS[targetSlot.toUpperCase()]) {
        return {
            success: false,
            message: `❌ Invalid or missing equipment slot! (Valid: main_hand, off_hand, armor, helmet, boots, ring, amulet, cloak, gloves)`
        };
    }

    // Verify slot alignment compatibility to prevent cross-category slot leakage
    const itemSlot = (itemToEquip.slot || itemInfo.slot || '').toLowerCase();
    const cleanTargetSlot = targetSlot.toLowerCase();

    let isCompatible = false;
    if (itemSlot === 'main_hand' || itemSlot === 'weapon') {
        isCompatible = (cleanTargetSlot === 'main_hand' || cleanTargetSlot === 'off_hand');
    } else if (itemSlot === 'off_hand' || itemSlot === 'offhand') {
        isCompatible = (cleanTargetSlot === 'off_hand');
    } else if (itemSlot === 'armor') {
        isCompatible = (cleanTargetSlot === 'armor');
    } else if (itemSlot === 'helmet') {
        isCompatible = (cleanTargetSlot === 'helmet');
    } else if (itemSlot === 'boots') {
        isCompatible = (cleanTargetSlot === 'boots');
    } else if (itemSlot === 'ring') {
        isCompatible = (cleanTargetSlot === 'ring');
    } else if (itemSlot === 'amulet') {
        isCompatible = (cleanTargetSlot === 'amulet');
    } else if (itemSlot === 'cloak') {
        isCompatible = (cleanTargetSlot === 'cloak');
    } else if (itemSlot === 'gloves') {
        isCompatible = (cleanTargetSlot === 'gloves');
    }

    if (!isCompatible) {
        return {
            success: false,
            message: `❌ Mismatched slot assignment! ${itemInfo.name || itemId} belongs in the ${itemSlot.toUpperCase()} slot, and cannot be equipped to ${cleanTargetSlot.toUpperCase()}.`,
        };
    }
    
    const slotName = EQUIPMENT_SLOTS[targetSlot.toUpperCase()];

    // 💡 TWO-HANDED / SHIELD LOGIC
    const isTwoHanded = itemToEquip.isTwoHanded || itemInfo.isTwoHanded;

    // PRE-CHECK: Verify we have enough inventory space for the worst-case
    // number of items that will return to the bag during this swap.
    //
    // Worst case: equipping a two-hander to main_hand while a one-hander +
    // shield are currently equipped. That swaps 1 new item OUT of the bag
    // and pushes 2 old items (main_hand + off_hand) back IN — net +1 slot.
    //
    // Previously the code did removeItem() first, then awaited addItem()
    // for the displaced items. If addItem() failed because the bag was full,
    // the old item was silently lost. This pre-check prevents that.
    const willReturnMainHand = !!equipment[slotName];
    const willReturnOffHand = isTwoHanded && slotName === 'main_hand' && !!equipment.off_hand;
    const willReturnMainHandForOffHandSwap = slotName === 'off_hand' && equipment.main_hand && lootSystem.getItemInfo(equipment.main_hand.id)?.isTwoHanded;
    const itemsReturning = (willReturnMainHand ? 1 : 0) + (willReturnOffHand ? 1 : 0) + (willReturnMainHandForOffHandSwap ? 1 : 0);
    // The new item is removed first, freeing 1 slot — so net slots needed = itemsReturning - 1
    const netSlotsNeeded = Math.max(0, itemsReturning - 1);
    if (netSlotsNeeded > 0 && !hasInventorySpace(userId, netSlotsNeeded)) {
        return {
            success: false,
            message: `❌ Inventory full! Free up ${netSlotsNeeded} slot(s) before equipping — your current gear needs somewhere to go.`
        };
    }

    // 1. Remove new item from inventory first
    // 💡 QA FIX: was using `itemId` (original input) instead of `targetItemId`
    // (the matched inventory key). When loose matching converts e.g.
    // "steel sabre" → "steel_sabre", removeItem received "steel sabre"
    // which doesn't match any key → removeItem fails silently → item
    // stays in inventory AND gets equipped = duplication exploit.
    // Also: return value was never checked.
    const removeResult = removeItem(userId, targetItemId, 1);
    if (!removeResult || !removeResult.success) {
        return { success: false, message: `❌ Failed to remove item from inventory. Make sure you have the item.` };
    }

    // 2. Handle Two-Hander logic (unequip Off-Hand if equipping to Main-Hand)
    if (isTwoHanded && slotName === 'main_hand' && equipment.off_hand) {
        const offHand = equipment.off_hand;
        equipment.off_hand = null;
        const addResult = await addItem(userId, offHand.id, 1, offHand);
        if (!addResult.success) {
            // Rollback: re-equip the off-hand and put the new item back
            equipment.off_hand = offHand;
            await addItem(userId, targetItemId, 1, itemToEquip);
            return { success: false, message: `❌ Inventory full! Could not store ${offHand.name || offHand.id} when unequipping.` };
        }
    }

    // 3. Ensure Main-Hand isn't a 2-Hander if equipping to Off-Hand
    if (slotName === 'off_hand' && equipment.main_hand) {
        const mainHandInfo = lootSystem.getItemInfo(equipment.main_hand.id);
        if (mainHandInfo.isTwoHanded) {
            const mainHand = equipment.main_hand;
            equipment.main_hand = null;
            const addResult = await addItem(userId, mainHand.id, 1, mainHand);
            if (!addResult.success) {
                // Rollback
                equipment.main_hand = mainHand;
                await addItem(userId, targetItemId, 1, itemToEquip);
                return { success: false, message: `❌ Inventory full! Could not store ${mainHand.name || mainHand.id} when unequipping.` };
            }
        }
    }

    const oldItem = equipment[slotName];
    if (oldItem) {
        const addResult = await addItem(userId, oldItem.id, 1, oldItem);
        if (!addResult.success) {
            // Rollback: re-equip the old item and put the new item back
            equipment[slotName] = oldItem;
            await addItem(userId, targetItemId, 1, itemToEquip);
            return { success: false, message: `❌ Inventory full! Could not store ${oldItem.name || oldItem.id} when unequipping.` };
        }
    }
    
    const durabilitySystem = require('./durabilitySystem');
    const durProfile = durabilitySystem.getDurabilityProfile(targetItemId, itemToEquip, itemInfo);
    
    equipment[slotName] = { ...itemToEquip };
    delete equipment[slotName].quantity;

    // 💡 FIX 2026-08-03 (bug report #1): ensure rarity is set on the equipped
    // copy. If itemToEquip.rarity was missing (old item added before rarity
    // was properly tracked), fall back to the DB rarity. This prevents the
    // "Common" label showing on Mythic/Legendary gear in .char/.bag display.
    if (!equipment[slotName].rarity) {
        equipment[slotName].rarity = itemInfo.rarity || 'COMMON';
    }

    // Seed durability
    equipment[slotName].maxDurability = durProfile.max;
    equipment[slotName].durability = durProfile.max;
    equipment[slotName].durabilityTraits = durProfile.traits;
    
    await economy.saveUser(userId);
    
    // 💡 Track for rank missions
    try {
        economy.trackMissionStat(userId, 'itemsEquipped', 1);
    } catch (e) {}

    // 💡 FIX 2026-08-01 (BUG #11): include item name + slot + rank in the
    // return so the command handler can show a useful success message
    // instead of just "equipped <id>".
    const equippedName = equipment[slotName]?.name || itemInfo.name || itemId;
    const equippedRarity = equipment[slotName]?.rarity || itemInfo.rarity || 'COMMON';
    const rarityIcon = ITEM_RARITY[equippedRarity]?.icon || '⚪';
    return {
        success: true,
        equipped: targetItemId,
        equippedName,
        slot: slotName,
        rarity: equippedRarity,
        rarityIcon,
        message: `${rarityIcon} Equipped *${equippedName}* to **${slotName}** slot.`
    };
}

async function unequipItem(userId, slot) {
    const equipment = getEquipment(userId);

    // 💡 FIX 2026-08-03 (bug report #7): normalize spaces to underscores
    // so '.jk unequip main hand' works the same as '.jk unequip main_hand'.
    // Also strip dashes — some users type 'main-hand'.
    if (typeof slot === 'string') {
        slot = slot.toLowerCase().replace(/[\s-]+/g, '_');
    }

    if (!EQUIPMENT_SLOTS[slot.toUpperCase()]) {
        return {
            success: false,
            message: `❌ Invalid equipment slot: \`${slot}\`\n_Valid slots: main_hand, off_hand, armor, helmet, boots, ring, amulet, cloak, gloves_\n_Tip: spaces are OK (e.g. \`main hand\` works too)._`
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

    // Strip durability before merging back into bag stack
    const itemToBag = { ...item };
    delete itemToBag.durability;
    delete itemToBag.maxDurability;
    delete itemToBag.durabilityTraits;
    delete itemToBag.warnedLow;

    const result = await addItem(userId, itemToBag.id, 1, itemToBag);
    
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
    
    const durabilitySystem = require('./durabilitySystem');
    const weaponSynergy = require('./weaponSynergy');
    const userClass = economy.getUserClass(userId);
    const player = userClass ? { class: userClass } : null;
    
    const totalStats = {
        hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0
    };
    
    for (const [slot, item] of Object.entries(equipment)) {
        if (!item) continue;

        // Prefer stats on the item instance; fall back to the item database.
        // Fixes: items equipped before stat-hydration had empty .stats = {}
        // making all equipment bonuses silently show as 0 on the stats window.
        let statsToApply = (item.stats && Object.keys(item.stats).length > 0)
            ? item.stats
            : lootSystem.getItemInfo(item.id)?.stats;

        if (statsToApply && Object.keys(statsToApply).length > 0) {
            const condition = durabilitySystem.getConditionMultiplier(item);
            const affinity = player ? weaponSynergy.getRoleAffinityMultiplier(player, item) : 1.0;
            const mult = condition * affinity;

            for (const [stat, value] of Object.entries(statsToApply)) {
                totalStats[stat] = (totalStats[stat] || 0) + Math.floor(value * mult);
            }
        }
    }
    
    return totalStats;
}

// Enhancement stones: percentage each stone adds to the TOTAL bonus pool (not compounded).
// 💡 FIX 2026-08-01 (BUG #1): mythic_enhancement_stone was MISSING from this map.
// It is defined in lootSystem.js:895 with description "Boosts gear stats by 60%."
// but enhanceItem() fell through to the || 0.05 fallback (worst bonus in the game)
// instead of giving the intended 60% per stone. This made Mythic stones — the
// most expensive enhancement item at 80,000 Zeni — completely useless.
const ENHANCEMENT_BONUS_MAP = {
    'minor_enhancement_stone': 0.05,
    'rare_enhancement_stone': 0.15,
    'legendary_enhancement_stone': 0.35,
    'mythic_enhancement_stone': 0.60
};

// 💡 FIX 2026-08-01 (GAP #1): rank enforcement on equip.
// The rank thresholds mirror classSystem.ADVENTURER_RANKS — a player must
// hold at least the rank whose level requirement is <= the item's reqLevel.
// F=1, E=10, D=20, C=30, B=40, A=50, S=60, SS=75, SSS=90, GOD=100.
const RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'GOD'];

// Returns the minimum rank a player must hold to equip an item with the given
// reqLevel. Walks RANK_ORDER and returns the highest rank whose level
// threshold is <= reqLevel. Items with no reqLevel default to 'F'.
function getRequiredRankForLevel(level) {
    if (!level || level < 1) return 'F';
    let requiredRank = 'F';
    for (const rank of RANK_ORDER) {
        const rankData = classSystem.ADVENTURER_RANKS[rank];
        if (rankData && level >= rankData.requirement.level) {
            requiredRank = rank;
        }
    }
    return requiredRank;
}

// Returns true if rankA is >= rankB (using RANK_ORDER indices, not string
// comparison — 'S' > 'SS' is false in JS string compare but S < SS in rank).
function rankGte(rankA, rankB) {
    const a = RANK_ORDER.indexOf(rankA);
    const b = RANK_ORDER.indexOf(rankB);
    if (a === -1 || b === -1) return false; // unknown rank → fail closed
    return a >= b;
}

// Rarity-based enhancement level cap. Higher-rarity gear has more headroom
// so Common trash can't be enhanced into endgame gear, while Mythic items can
// be pushed much further. The global MAX_ENHANCEMENT_BONUS cap (100% bonus,
// = 2x base stats) still applies on top, so even a level-30 Mythic item stops
// scaling once it hits that ceiling.
const MAX_ENHANCEMENT_LEVEL_BY_RARITY = {
    COMMON: 5,
    UNCOMMON: 10,
    RARE: 15,
    EPIC: 20,
    LEGENDARY: 25,
    MYTHIC: 30,
};
const DEFAULT_MAX_ENHANCEMENT_LEVEL = 5;  // fallback for items with unknown/missing rarity

// Legacy single value kept for backward-compat with any external code that still
// references it. Internally, always use getMaxEnhancementLevel(item) instead.
const MAX_ENHANCEMENT_LEVEL = 5;

// 💡 POLISH 2026-07-17: rarity-aware bonus cap. Previously MAX_ENHANCEMENT_BONUS
// was a flat 1.0 (= 2x base stats) regardless of rarity. This meant a Mythic
// item enhanced to level 30 was still capped at 2x base — exactly the same as
// a Common item at level 5. The rarity cap was meaningless for actual stat
// output, only the LEVEL was bounded.
//
// Now each rarity has its own bonus cap = maxLevel × 0.35 (assuming legendary
// stones used at every level). This restores the meaningful stat gap between
// rarities that the original exponential system had:
//   COMMON  max +1.75 (5 × 0.35)   → 2.75x base
//   UNCOMMON max +3.50 (10 × 0.35)  → 4.50x base
//   RARE    max +5.25 (15 × 0.35)   → 6.25x base
//   EPIC    max +7.00 (20 × 0.35)   → 8.00x base
//   LEGENDARY max +8.75 (25 × 0.35) → 9.75x base
//   MYTHIC  max +10.50 (30 × 0.35)  → 11.50x base
//
// This is more generous than the original exponential system at high levels
// (intentional — players lost stats when the flat cap was added and we want
// to make them whole), but bounded so a single Common trash item can't be
// enhanced into endgame gear.
const MAX_ENHANCEMENT_BONUS_BY_RARITY = {
    COMMON: 1.75,
    UNCOMMON: 3.50,
    RARE: 5.25,
    EPIC: 7.00,
    LEGENDARY: 8.75,
    MYTHIC: 10.50,
};
const DEFAULT_MAX_ENHANCEMENT_BONUS = 1.75;  // fallback for unknown rarity

// Legacy flat value kept for backward-compat. Use getMaxEnhancementBonus(item)
// internally.
const MAX_ENHANCEMENT_BONUS = 1.0;

// Resolves the per-item enhancement level cap based on its rarity. Falls back
// to DEFAULT_MAX_ENHANCEMENT_LEVEL if the item or its rarity is unknown. The
// rarity is read from the item instance first, then from the loot database as
// a fallback (some legacy items don't carry rarity on the instance).
function getMaxEnhancementLevel(item, itemId) {
    if (!item) return DEFAULT_MAX_ENHANCEMENT_LEVEL;
    let rarity = item.rarity;
    if (!rarity) {
        const baseItem = lootSystem.getItemInfo(item.id || itemId);
        rarity = baseItem?.rarity;
    }
    if (!rarity) return DEFAULT_MAX_ENHANCEMENT_LEVEL;
    return MAX_ENHANCEMENT_LEVEL_BY_RARITY[rarity] ?? DEFAULT_MAX_ENHANCEMENT_LEVEL;
}

// 💡 POLISH 2026-07-17: resolves the per-item enhancement BONUS cap based on
// its rarity. Same rarity lookup as getMaxEnhancementLevel — used by
// recalculateEnhancedStats, enhanceItem, and repairItemStats so a Mythic
// item can actually reach 11.5x base stats, not just 2x.
function getMaxEnhancementBonus(item, itemId) {
    if (!item) return DEFAULT_MAX_ENHANCEMENT_BONUS;
    let rarity = item.rarity;
    if (!rarity) {
        const baseItem = lootSystem.getItemInfo(item.id || itemId);
        rarity = baseItem?.rarity;
    }
    if (!rarity) return DEFAULT_MAX_ENHANCEMENT_BONUS;
    return MAX_ENHANCEMENT_BONUS_BY_RARITY[rarity] ?? DEFAULT_MAX_ENHANCEMENT_BONUS;
}

// Ensures item.baseStats exists (the pristine, never-enhanced stat block).
// Stats are always recalculated FROM this each time, so repeated enhancement
// can never compound on top of an already-boosted value.
function hydrateBaseStats(item, itemId) {
    if (item.baseStats && Object.keys(item.baseStats).length > 0) return;

    // 💡 AUDIT FIX 2026-08-01: ALWAYS prefer the ITEM_DATABASE stats over
    // item.stats. The current item.stats may have been corrupted by the old
    // exponential enhancement bug (which inflated stats to absurd values,
    // then the "fix" introduced negative values). Using the DB stats as the
    // base ensures enhancement always starts from the correct baseline.
    const dbItem = lootSystem.getItemInfo(item.id || itemId);
    const source = (dbItem && dbItem.stats && Object.keys(dbItem.stats).length > 0)
        ? dbItem.stats
        : (item.stats && Object.keys(item.stats).length > 0
            ? item.stats
            : null);

    item.baseStats = source ? JSON.parse(JSON.stringify(source)) : {};
}

// Recomputes item.stats = baseStats * (1 + cumulative bonus), rounded to integers.
// 💡 POLISH 2026-07-17: uses rarity-aware bonus cap (getMaxEnhancementBonus)
// instead of the flat MAX_ENHANCEMENT_BONUS = 1.0. This is the actual fix
// for the "stats still haven't changed" complaint — items can now exceed
// 2x base when their rarity allows it.
function recalculateEnhancedStats(item, itemId) {
    const maxBonus = getMaxEnhancementBonus(item, itemId);
    const bonus = Math.min(item.enhancementBonus || 0, maxBonus);
    const newStats = {};
    for (const stat in item.baseStats) {
        newStats[stat] = Math.ceil(item.baseStats[stat] * (1 + bonus));
    }
    item.stats = newStats;
}

function enhanceItem(userId, itemId, stoneId) {
    const inventory = getInventory(userId);
    if (!inventory[itemId]) return { success: false, message: '❌ Item not found in inventory!' };
    if (!inventory[stoneId]) return { success: false, message: '❌ Enhancement stone not found!' };

    const item = inventory[itemId];

    if (item.type !== 'EQUIPMENT') return { success: false, message: '❌ You can only enhance equipment!' };
    if (!stoneId.includes('enhancement_stone')) return { success: false, message: '❌ That is not an enhancement stone!' };

    const maxLevel = getMaxEnhancementLevel(item, itemId);
    if ((item.enhancementLevel || 0) >= maxLevel) {
        return { success: false, message: `❌ *${item.name || itemId}* is already at max enhancement level (${maxLevel}) for its rarity!` };
    }

    // 💡 FIX 2026-08-01 (BUG #1): ENHANCEMENT_BONUS_MAP now includes
    // mythic_enhancement_stone (0.60). Previously it fell through to || 0.05
    // (the Minor-stone fallback), making Mythic stones the worst in the game.
    const stoneBonus = ENHANCEMENT_BONUS_MAP[stoneId] || 0.05;
    const stoneInfo = lootSystem.getItemInfo(stoneId);
    const stoneName = stoneInfo?.name || stoneId;

    hydrateBaseStats(item, itemId);

    // 💡 FIX 2026-08-01 (BUG #5): snapshot stats BEFORE enhancement so we can
    // report per-stat deltas in the result message. Previously
    // recalculateEnhancedStats() mutated item.stats in place and the old
    // values were lost.
    const statsBefore = JSON.parse(JSON.stringify(item.stats || {}));
    const bonusBefore = item.enhancementBonus || 0;

    item.enhancementLevel = (item.enhancementLevel || 0) + 1;
    // 💡 POLISH 2026-07-17: cap bonus at rarity-aware max (not flat 1.0)
    const maxBonus = getMaxEnhancementBonus(item, itemId);
    item.enhancementBonus = Math.min((item.enhancementBonus || 0) + stoneBonus, maxBonus);

    recalculateEnhancedStats(item, itemId);

    // Compute per-stat deltas for the result message
    const statDeltas = {};
    for (const stat of Object.keys(item.stats || {})) {
        const before = statsBefore[stat] || 0;
        const after = item.stats[stat] || 0;
        if (after !== before) statDeltas[stat] = after - before;
    }

    // Add prefix
    const prefixes = ['Polished', 'Strengthened', 'Reinforced', 'Masterwork', 'God-forged'];
    const prefix = prefixes[Math.min(item.enhancementLevel - 1, prefixes.length - 1)];

    // Ensure item has a name to avoid crash
    if (!item.name) item.name = itemId;

    if (!item.name.startsWith(prefix)) {
        item.name = `${prefix} ${item.name.replace(/^(Polished|Strengthened|Reinforced|Masterwork|God-forged) /, '')}`;
    }

    // 💡 FIX (BUG 4b: "enhanced a mythic weapon, no effect"):
    // equipItem() stores a SHALLOW COPY of the item in the equipment slot
    // (line 530: `equipment[slotName] = { ...itemToEquip }`). So when we
    // enhance the inventory copy here, the equipped copy is a SEPARATE
    // object that never gets updated. getEquipmentStats() then reads the
    // OLD pre-enhancement stats from the equipped copy — making the
    // enhancement appear to have "no effect" in combat.
    //
    // Fix: after enhancing the inventory copy, check if this item is
    // equipped in any slot. If so, sync the enhanced fields (stats,
    // enhancementLevel, enhancementBonus, name, rarity) to the equipped copy.
    // 💡 FIX 2026-08-03 (bug report #1): also sync `rarity` — the equipped
    // copy could have a stale rarity label if the item was added before
    // rarity was properly set, causing "Common" to show for Mythic items.
    const equipment = getEquipment(userId);
    if (equipment) {
        for (const [slot, eqItem] of Object.entries(equipment)) {
            if (eqItem && eqItem.id === itemId) {
                // Sync the enhanced fields to the equipped copy
                eqItem.stats = JSON.parse(JSON.stringify(item.stats));
                eqItem.enhancementLevel = item.enhancementLevel;
                eqItem.enhancementBonus = item.enhancementBonus;
                eqItem.baseStats = item.baseStats ? JSON.parse(JSON.stringify(item.baseStats)) : undefined;
                eqItem.name = item.name;
                // 💡 FIX 2026-08-03: sync rarity too — prevents "Common" label
                // on Mythic/Legendary items after enhancement.
                if (item.rarity) eqItem.rarity = item.rarity;
                break; // an item can only be equipped in one slot
            }
        }
    }

    removeItem(userId, stoneId, 1);
    economy.saveUser(userId);

    // 💡 FIX 2026-08-01 (BUG #4): include stone name + per-stat deltas in the
    // result message. User quote: "Show exactly which stone is being consumed
    // during enhancement. Display how much each enhancement increases the
    // item's stats."
    const statLines = Object.entries(statDeltas)
        .map(([stat, delta]) => `   ${stat.toUpperCase()}: ${statsBefore[stat] || 0} → ${item.stats[stat]} (+${delta})`)
        .join('\n');
    const bonusThisStone = item.enhancementBonus - bonusBefore;

    return {
        success: true,
        message: `✨ *ENHANCEMENT SUCCESS!*\n\n💎 Stone used: *${stoneName}* (+${Math.round(stoneBonus * 100)}% bonus)\n⚔️ Item: *${item.name}* (${item.rarity || 'COMMON'})\n📊 Level: ${item.enhancementLevel}/${maxLevel}\n📈 Total bonus: ${Math.round(bonusBefore * 100)}% → ${Math.round(item.enhancementBonus * 100)}% (+${Math.round(bonusThisStone * 100)}%)\n${statLines ? `\n*Stat changes:*\n${statLines}` : ''}`,
        // Structured return for callers that want to render their own UI
        stoneUsed: stoneId,
        stoneName,
        stoneBonus,
        bonusBefore,
        bonusAfter: item.enhancementBonus,
        levelBefore: item.enhancementLevel - 1,
        levelAfter: item.enhancementLevel,
        maxLevel,
        statDeltas
    };
}

// Repairs items corrupted by the old compounding-multiplier bug (stats blown up
// to absurd values by repeated enhancement). Safe to call repeatedly / on items
// that were never enhanced — it's a no-op for anything that isn't inflated.
// Since the old system didn't record which stones were used historically, this
// is a best-effort reconstruction: it assumes the strongest stone (legendary,
// 0.35) was used for every prior level, capped the same way new enhancements
// are capped, then recalculates stats from base. That's the same worst-case
// assumption the original exponential bug scenario was diagnosed under.
function repairItemStats(item, itemId) {
    if (!item || item.type !== 'EQUIPMENT') return false;

    const baseItem = lootSystem.getItemInfo(item.id || itemId);
    const baseStatsRef = baseItem?.stats;
    if (!baseStatsRef) return false;

    // 💡 AUDIT FIX 2026-08-01: also repair items with enhancementLevel = 0
    // if their stats are corrupted (negative values, or values that don't
    // match the DB base stats). The old code skipped these, leaving
    // corrupted items in the bag forever.
    let corrupted = false;

    if (item.enhancementLevel > 0) {
        // Enhanced items: check if stats exceed what's possible under the cap
        const maxBonus = getMaxEnhancementBonus(item, itemId);
        const maxPossibleMultiplier = 1 + maxBonus;
        for (const stat in item.stats || {}) {
            const base = baseStatsRef[stat];
            if (base !== undefined && Math.abs(item.stats[stat]) > Math.abs(base) * maxPossibleMultiplier * 1.05) {
                corrupted = true;
                break;
            }
        }
        if (!item.baseStats || Object.keys(item.baseStats).length === 0) corrupted = true;
    } else {
        // Non-enhanced items: check if stats match the DB (should be identical)
        for (const stat in baseStatsRef) {
            if (item.stats && item.stats[stat] !== undefined && item.stats[stat] !== baseStatsRef[stat]) {
                corrupted = true;
                break;
            }
        }
        // Also check for negative values that shouldn't exist
        for (const stat in item.stats || {}) {
            if (baseStatsRef[stat] !== undefined && baseStatsRef[stat] > 0 && item.stats[stat] < 0) {
                corrupted = true;
                break;
            }
        }
    }

    if (!corrupted) return false;

    // Reset baseStats from DB + recalculate
    item.baseStats = JSON.parse(JSON.stringify(baseStatsRef));
    const maxLevel = getMaxEnhancementLevel(item, itemId);
    item.enhancementLevel = Math.min(item.enhancementLevel || 0, maxLevel);
    item.enhancementBonus = Math.min((item.enhancementLevel || 0) * 0.60, getMaxEnhancementBonus(item, itemId));
    recalculateEnhancedStats(item, itemId);
    return true;
}

// Sweeps a user's full inventory + equipped items and repairs any corrupted
// equipment stats in place. Returns the number of items repaired.
function repairUserEquipmentStats(userId) {
    let repairedCount = 0;

    const inventory = getInventory(userId);
    for (const [itemId, item] of Object.entries(inventory || {})) {
        if (repairItemStats(item, itemId)) repairedCount++;
    }

    const equipment = getEquipment(userId);
    for (const item of Object.values(equipment || {})) {
        if (!item) continue;
        if (repairItemStats(item, item.id)) repairedCount++;
    }

    if (repairedCount > 0) economy.saveUser(userId);
    return repairedCount;
}

// ==========================================
// 💰 ITEM SELLING
// ==========================================

function sellItem(userId, itemId, quantity = 1) {
    const inventory = getInventory(userId);
    
    // Loose matching for underscores and spaces
    let targetItemId = itemId;
    const cleanItemId = (itemId || '').toLowerCase().replace(/_/g, '').replace(/ /g, '');
    const foundKey = Object.keys(inventory).find(k => k.toLowerCase().replace(/_/g, '').replace(/ /g, '') === cleanItemId);
    if (foundKey) {
        targetItemId = foundKey;
    }

    if (!inventory[targetItemId]) {
        return {
            success: false,
            message: `❌ You don't have ${itemId}!`
        };
    }
    
    const item = inventory[targetItemId];
    const currentQuantity = item.quantity || 1;
    
    if (currentQuantity < quantity) {
        return {
            success: false,
            message: `❌ Not enough ${itemId}! Have: ${currentQuantity}`
        };
    }
    
    // Calculate sell value
    const itemInfo = lootSystem.getItemInfo(targetItemId);
    const baseValue = item.value || itemInfo.value || 100;
    const rarity = item.rarity || itemInfo.rarity || 'COMMON';
    let sellMultiplier = ITEM_RARITY[rarity]?.sellMultiplier || 0.6;
    
    // Special case for gold currency item: 1:15 exchange rate (15x base value of 1)
    if (targetItemId === 'gold' || targetItemId === 'gold_pile') sellMultiplier = 15.0;
    
    const totalValue = Math.floor(baseValue * sellMultiplier * quantity);
    let sellValue = totalValue;
    let guildContribution = null;

    // Remove item
    const removeResult = removeItem(userId, targetItemId, quantity);
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

function useItem(userId, rawItemId, targetSlot = null) {
    const inventory = getInventory(userId);
    const progression = require('./progression');
    const sheet = progression.getCharacterSheet(userId);
    
    // Normalize item ID (lowercase, trim, replace spaces with underscores)
    let itemId = (rawItemId || '').toLowerCase().trim().replace(/ /g, '_');
    
    // Loose matching for underscores and spaces
    const cleanItemId = itemId.replace(/_/g, '');
    const foundKey = Object.keys(inventory).find(k => k.toLowerCase().replace(/_/g, '').replace(/ /g, '') === cleanItemId);
    if (foundKey) {
        itemId = foundKey;
    }
    
    if (!inventory[itemId]) {
        return { success: false, message: `❌ You don't have this item!` };
    }

    const itemInfo = lootSystem.getItemInfo(itemId);
    
    // 🆕 Repair Kit Handling
    if (itemId.startsWith('repair_kit')) {
        if (!targetSlot) {
            const prefix = require('../../botConfig').getPrefix();
            return { success: false, message: `❌ Please specify which slot to repair!\nExample: \`${prefix}use ${itemId} main_hand\` or \`${prefix}use <#bag_index> main_hand\`` };
        }
        
        const equipment = getEquipment(userId);
        const slotName = EQUIPMENT_SLOTS[targetSlot.toUpperCase()];
        if (!slotName || !equipment[slotName]) {
            return { success: false, message: `❌ You do not have anything equipped in the ${targetSlot} slot!` };
        }
        
        const item = equipment[slotName];
        if (item.durability === undefined || item.durability === null) {
            return { success: false, message: `❌ That item does not have durability!` };
        }
        
        if (item.durability >= item.maxDurability) {
            return { success: false, message: `❌ That item is already at full durability!` };
        }
        
        let repairAmount = 25;
        if (itemId.includes('advanced')) repairAmount = 60;
        if (itemId.includes('master')) repairAmount = 9999;
        
        const oldDur = item.durability;
        item.durability = Math.min(item.maxDurability, item.durability + repairAmount);
        item.durability = Math.round(item.durability * 10) / 10;
        delete item.warnedLow;
        
        removeItem(userId, itemId, 1);
        economy.saveUser(userId);
        
        return {
            success: true,
            message: `repaired *${item.name}* (${slotName}) for +${Math.round(item.durability - oldDur)} durability! (${Math.ceil(item.durability)}/${item.maxDurability})`
        };
    }

    if (itemInfo.type !== 'CONSUMABLE' && itemInfo.type !== 'POTION') {
        // 💡 SUMMON EGGS: hatchable items — use triggers the egg spin
        if (itemId.endsWith('_summon_egg')) {
            // Eggs are async (createSummon is async) but useItem is sync.
            // Return a special marker so the caller (rpgCommands.useItem)
            // can handle it async. We can't hatch here because createSummon
            // is async.
            return {
                success: false,
                isEgg: true,
                message: `🥚 *${itemInfo.name}* — use \`${botConfig.getPrefix()} summon hatch\` to hatch it!`
            };
        }
        // Give specific guidance based on item type
        if (itemId === 'ascension_stone' || itemId === 'evolution_stone') {
            const stoneTier = itemId === 'ascension_stone' ? 'T3 Ascension' : 'T2 Evolution';
            return { success: false, message: `🔮 *${itemInfo.name}* is a ${stoneTier} catalyst, not a consumable!\n\nUse \`${botConfig.getPrefix()} evolve\` to trigger your class evolution/ascension. The stone will be consumed automatically.` };
        }
        if (itemId.includes('enhancement_stone')) {
            return { success: false, message: `💎 *${itemInfo.name}* is used for gear enhancement!\n\nUse \`${botConfig.getPrefix()} enhance <#bag_index>\` on the gear you want to boost.` };
        }
        const isGear = ['WEAPON', 'ARMOR', 'ACCESSORY', 'HELMET', 'BOOTS'].includes(itemInfo.type);
        if (isGear) {
            return { success: false, message: `⚔️ *${itemInfo.name}* is equipment — you wear it, not consume it!\n\nUse \`${botConfig.getPrefix()} equip <#bag_index>\` to put it on.` };
        }
        const isCombatItem = itemInfo.type === 'COMBAT' || itemInfo.type === 'ITEM';
        if (isCombatItem) {
            return { success: false, message: `🎒 *${itemInfo.name}* can only be used during combat!\n\nIn a battle, use \`${botConfig.getPrefix()} combat item <#>\` to activate it.` };
        }
        return { success: false, message: `❌ *${itemInfo.name}* (${itemInfo.type}) cannot be used this way.` };
    }

    // Effect handling
    let effectMsg = "";
    let consumed = true;

    if (itemId === 'hp_potion' || itemId === 'minor_hp_potion' || itemId === 'mega_potion') {
        // HP potions only meaningfully heal during combat — outside of combat,
        // characters don't have a persistent HP field (HP is computed from
        // class+level+stats when a fight starts). Block out-of-combat use
        // and direct the player to combat usage.
        return {
            success: false,
            message: `💚 *${itemInfo.name}* can only be used during combat — your HP fully recovers between battles!\n\nIn a battle, use \`${botConfig.getPrefix()} combat item <#>\` to drink it.`
        };
    }
    else if (itemId === 'energy_drink') {
        const user = economy.getUser(userId);
        // Use the progression system's derived maxEnergy instead of an
        // uninitialized user.maxEnergy field — for a L50 mage with 100 MAG,
        // actual maxEnergy is 1135, not the 100 default this code assumed.
        const derivedStats = progression.getBaseStats(userId, user.class);
        const maxEn = derivedStats.maxEnergy || 100;
        // Default current energy to maxEn on first use (undefined → full).
        const currentEn = user.energy !== undefined ? user.energy : maxEn;
        user.energy = Math.min(maxEn, currentEn + 30);
        effectMsg = `⚡ Restored **30 Energy**! (Now ${user.energy}/${maxEn})`;
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
    else if (itemId === 'holy_water') {
        // Same logic as HP potion — out-of-combat HP isn't a thing.
        return {
            success: false,
            message: `💚 *${itemInfo.name}* can only be used during combat — your HP fully recovers between battles!\n\nIn a battle, use \`${botConfig.getPrefix()} combat item <#>\` to drink it.`
        };
    }
    else if (itemId === 'energy_brew') {
        const user = economy.getUser(userId);
        const derivedStats = progression.getBaseStats(userId, user.class);
        const maxEn = derivedStats.maxEnergy || 100;
        const currentEn = user.energy !== undefined ? user.energy : maxEn;
        user.energy = Math.min(maxEn, currentEn + 50);
        effectMsg = `⚡ Restored **50 Energy**! (Now ${user.energy}/${maxEn})`;
    }
    else if (itemId === 'ether') {
        const user = economy.getUser(userId);
        const derivedStats = progression.getBaseStats(userId, user.class);
        const maxEn = derivedStats.maxEnergy || 100;
        user.energy = maxEn;
        effectMsg = `⚡ Restored **100% Energy**! (Now ${user.energy}/${maxEn})`;
    }
    else if (itemId === 'rabbit_foot') {
        const user = economy.getUser(userId);
        if (!user.statBonuses) user.statBonuses = {};
        user.statBonuses.luck = (user.statBonuses.luck || 0) + 10;
        effectMsg = `🍀 *LUCKY CHARM CONSUMED!* (+10 Luck permanently!)`;
    }
    else if (itemInfo.effect && (itemInfo.effect.startsWith('buff_') || itemInfo.effect === 'random_major_buff' || itemInfo.effect === 'invincibility' || itemInfo.effect === 'shield_max')) {
        return { success: false, message: `🎒 *${itemInfo.name}* is a combat-only consumable and can only be used during battle!\n\nIn a battle, use \`${botConfig.getPrefix()} combat item <#>\` to activate its effects.` };
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
    repairItemStats,
    repairUserEquipmentStats,
    getMaxEnhancementLevel,
    
    // Selling
    sellItem,
    
    // Config
    INVENTORY_CONFIG,
    ITEM_RARITY,
    EQUIPMENT_SLOTS,
    ENHANCEMENT_BONUS_MAP,
    RANK_ORDER,
    MAX_ENHANCEMENT_LEVEL,
    MAX_ENHANCEMENT_LEVEL_BY_RARITY,
    DEFAULT_MAX_ENHANCEMENT_LEVEL,
    MAX_ENHANCEMENT_BONUS,
    MAX_ENHANCEMENT_BONUS_BY_RARITY,
    DEFAULT_MAX_ENHANCEMENT_BONUS,
    getMaxEnhancementLevel,
    getMaxEnhancementBonus,
    getRequiredRankForLevel,
    rankGte
};
