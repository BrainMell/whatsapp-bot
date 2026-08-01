// ============================================
// ⚙️ ITEM DURABILITY & REPAIR SYSTEM
// ============================================

/**
 * Gets durability profile (max durability and inherent traits) for an item
 */
function getDurabilityProfile(itemId, itemInstance, itemInfo) {
    const slot = (itemInstance.slot || itemInfo.slot || '').toLowerCase();
    
    let baseDur = 100;
    if (slot === 'main_hand' || slot === 'off_hand' || slot === 'weapon') {
        baseDur = 100;
    } else if (['armor', 'helmet', 'boots', 'cloak', 'gloves'].includes(slot)) {
        baseDur = 120;
    } else if (['ring', 'amulet'].includes(slot)) {
        baseDur = 80;
    }
    
    // Rarity Multiplier
    const rarity = (itemInstance.rarity || itemInfo.rarity || 'COMMON').toUpperCase();
    const rarityMults = {
        COMMON: 0.8,
        UNCOMMON: 0.9,
        RARE: 1.0,
        EPIC: 1.15,
        LEGENDARY: 1.3,
        MYTHIC: 1.5
    };
    const mult = rarityMults[rarity] || 1.0;
    let max = Math.round(baseDur * mult);
    
    // Material override
    const cleanId = itemId.toLowerCase();
    if (cleanId.includes('steel') || cleanId.includes('iron') || cleanId.includes('plate')) {
        max += 20;
    } else if (cleanId.includes('crystal') || cleanId.includes('mythril') || cleanId.includes('arcane')) {
        max -= 15;
    }
    
    // Ensure sane bounds
    max = Math.max(10, max);
    
    // Seed durability traits
    const traits = [];
    if (rarity === 'MYTHIC') {
        traits.push('MYTHIC_MATERIAL'); // lossRate x0.25
    }
    
    // Carry over any existing traits on the instance
    if (itemInstance.durabilityTraits) {
        itemInstance.durabilityTraits.forEach(t => {
            if (!traits.includes(t)) traits.push(t);
        });
    }
    
    return {
        max,
        traits
    };
}

/**
 * Gets the multiplier for item stats based on its current durability percentage
 */
function getConditionMultiplier(item) {
    if (item.durability === undefined || item.durability === null) return 1.0;
    if (!item.maxDurability) return 1.0;
    
    const pct = item.durability / item.maxDurability;
    
    if (pct >= 0.75) return 1.0;       // No penalty
    if (pct >= 0.50) return 0.85;      // Minor stat reduction
    if (pct >= 0.25) return 0.60;      // Moderate stat reduction
    if (pct >= 0.01) return 0.30;      // Severe stat reduction
    return 0.0;                        // Broken
}

/**
 * Checks if an item is fully broken (durability <= 0)
 */
function isBroken(item) {
    return item.durability !== undefined && item.durability !== null && item.durability <= 0;
}

/**
 * Calculates the gold cost to repair an item
 */
function getRepairCost(item) {
    if (item.durability === undefined || item.durability === null || !item.maxDurability) return 0;
    const missing = item.maxDurability - item.durability;
    if (missing <= 0) return 0;
    
    const rarity = (item.rarity || 'COMMON').toUpperCase();
    const rarityMults = {
        COMMON: 0.5,
        UNCOMMON: 0.75,
        RARE: 1.0,
        EPIC: 1.5,
        LEGENDARY: 2.5,
        MYTHIC: 4.0
    };
    const rarityMult = rarityMults[rarity] || 1.0;
    // 💡 FIX 2026-08-01: reqLevel was never propagated to item instances.
    // Look it up from the item database if missing.
    let reqLevel = item.reqLevel;
    if (!reqLevel) {
        try {
            const lootSystem = require('./lootSystem');
            const itemInfo = lootSystem.getItemInfo(item.id);
            reqLevel = itemInfo?.reqLevel || 1;
        } catch (e) {
            reqLevel = 1;
        }
    }
    const levelMult = 1 + (reqLevel / 25);
    const missingPct = missing / item.maxDurability;
    
    // Base rate: ~2% of item value per 1% missing durability
    const baseValue = item.value || 100;
    const cost = baseValue * 0.02 * (missingPct * 100) * rarityMult * levelMult;
    
    return Math.max(10, Math.ceil(cost));
}

/**
 * Repairs an item to full durability
 */
function repairItem(item) {
    if (item.durability === undefined || item.durability === null) return { success: false, cost: 0 };
    const cost = getRepairCost(item);
    item.durability = item.maxDurability;
    delete item.warnedLow;
    return { success: true, cost };
}

/**
 * Applies durability wear to equipped items of an entity (player)
 */
function applyWear(entity, slotOrAll, opts = {}) {
    if (!entity || entity.isEnemy) return;
    if (!entity.equipment) return;
    
    let slots;
    if (slotOrAll === 'ALL_EQUIPPED') {
        slots = Object.keys(entity.equipment);
    } else if (slotOrAll === 'ARMOR_PIECES') {
        slots = ['armor', 'helmet', 'boots', 'cloak', 'gloves'];
        if (entity.equipment.off_hand) {
            try {
                const weaponSynergy = require('./weaponSynergy');
                const lootSystem = require('./lootSystem');
                const itemInfo = lootSystem.getItemInfo(entity.equipment.off_hand.id);
                if (weaponSynergy.inferArchetype(entity.equipment.off_hand, itemInfo) === 'SHIELD') {
                    slots.push('off_hand');
                }
            } catch (e) {}
        }
    } else {
        slots = [slotOrAll];
    }
        
    for (const slot of slots) {
        const item = entity.equipment[slot];
        if (!item || item.durability === undefined || item.durability === null) continue;
        if (item.durability <= 0) continue;
        
        const traits = item.durabilityTraits || [];
        if (traits.includes('UNBREAKABLE')) continue;
        
        let lossRate = 1.0;
        
        if (traits.includes('MYTHIC_MATERIAL')) lossRate *= 0.25;
        if (traits.includes('REINFORCED')) lossRate *= 0.5;
        if (traits.includes('FRAGILE_POWER')) lossRate *= 2.0;
        
        // Add class/weapon affinity modifier
        try {
            const weaponSynergy = require('./weaponSynergy');
            const affinityMod = weaponSynergy.getDurabilityAffinityModifier(entity, item);
            lossRate *= affinityMod;
        } catch (e) {
            // Decoupled / fallback
        }
        
        const amount = opts.amount !== undefined ? opts.amount : 1;
        const finalLoss = amount * lossRate;
        
        item.durability = Math.max(0, item.durability - finalLoss);
        // Keep to 1 decimal place to prevent JS float precision drift
        item.durability = Math.round(item.durability * 10) / 10;
        
        // Check low durability warning (15%)
        if (item.durability > 0 && item.durability <= (item.maxDurability * 0.15) && !item.warnedLow) {
            item.warnedLow = true;
            if (opts.combatHistory) {
                opts.combatHistory.push(`⚠️ *${entity.name}*'s *${item.name || slot}* is badly worn (${Math.ceil(item.durability)}/${item.maxDurability}) — repair it soon!`);
            }
        }
    }
}

/**
 * Passive self-repair at start of journeys/encounters
 */
function applySelfRepair(entity) {
    if (!entity || entity.isEnemy || !entity.equipment) return;
    
    for (const [slot, item] of Object.entries(entity.equipment)) {
        if (!item || item.durability === undefined || item.durability === null) continue;
        
        const traits = item.durabilityTraits || [];
        if (traits.includes('SELF_REPAIRING')) {
            const amount = 2;
            item.durability = Math.min(item.maxDurability, item.durability + amount);
            if (item.durability > (item.maxDurability * 0.15)) {
                delete item.warnedLow;
            }
        }
    }
}

module.exports = {
    getDurabilityProfile,
    getConditionMultiplier,
    isBroken,
    getRepairCost,
    repairItem,
    applyWear,
    applySelfRepair
};
