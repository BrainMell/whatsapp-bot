# RPG Subsystem: Inventory & Equipment

## What it is
The Inventory and Equipment subsystem handles the storage, stacking, validation, and equipping of loot items collected by players. Inventory is modeled as a key-value dictionary (mapping item IDs to item metadata and counts) nested within MongoDB user documents. Equipment is stored nested under `equipment` slot mappings (`main_hand`, `off_hand`, `armor`, `boots`, etc.). When actions such as adding items, selling items, or equipping weapons are triggered:
1. The inventory maps are loaded into memory from the user's cached profile.
2. Space capacity constraints and level requirements are verified.
3. Two-handed weapon slots and dual-wielding combinations are resolved.
4. Database fields are saved synchronously via `economy.saveUser`.
Items and stat panels are displayed to the user as formatted tables sorted by rarity tiers in the WhatsApp chat via Baileys WebSocket communication.

## How it works

**Item Addition and Stacking** — [inventorySystem.js L127-L189](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/inventorySystem.js#L127-L189)
```javascript
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
```
This function handles adding an item to the player's inventory. It checks if there is sufficient inventory slot space, loads the item template definition from the loot module, handles migration or stacking logic if the item is already present (hydrating missing properties from the database), and schedules writes back to MongoDB using `economy.saveUser`.

---

**Equipment Slot Management** — [inventorySystem.js L342-L472](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/inventorySystem.js#L342-L472)
```javascript
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
    
    // Auto-detect slot if not provided
    let targetSlot = slot;
    if (!targetSlot) {
        targetSlot = itemToEquip.slot || itemInfo.slot;
        if (targetSlot === 'weapon') targetSlot = 'main_hand';
    }
```
This function equips an item to a designated gear slot. It validates player level requirements, verifies weapon category slot compatibility, manages two-handed weapon mechanics (unequipping the off-hand item if a two-handed weapon is placed in the main hand), shifts the equipped object into the equipment slots, removes the item from the player's inventory array, and saves user status changes.

---

**Unequipping Slots** — [inventorySystem.js L474-L517](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/inventorySystem.js#L474-L517)
```javascript
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
```
This function handles unequipping an item from a designated slot. It validates the slot parameter, ensures that the slot is not empty, checks if the inventory has slot space to receive the unequipped item, runs the `addItem` helper, sets the slot's equipment field back to null, and saves the user database profile.

---

## How to modify it

### Bypass Level Restrictions
To disable player level verification when equipping powerful gear (e.g. for testing purposes), edit `core/inventorySystem.js`.

```javascript
// Before (core/inventorySystem.js L366-373)
    // 💡 LEVEL REQUIREMENT CHECK
    const reqLevel = itemToEquip.reqLevel || itemInfo.reqLevel || 1;
    if (playerLevel < reqLevel) {
        return {
            success: false,
            message: `❌ Level too low! Need Level ${reqLevel} to use this.`
        };
    }
```

```javascript
// After (core/inventorySystem.js L366-373)
    // 💡 LEVEL REQUIREMENT CHECK (Disabled for testing)
    const reqLevel = itemToEquip.reqLevel || itemInfo.reqLevel || 1;
    if (false && playerLevel < reqLevel) { // Bypassed checks
        return {
            success: false,
            message: `❌ Level too low! Need Level ${reqLevel} to use this.`
        };
    }
```

### Expand Slot Assignments
To customize slot verification logic or map alternative gear categories, adjust compatibility checks in `core/inventorySystem.js`.

```javascript
// Before (core/inventorySystem.js L403-407)
    let isCompatible = false;
    if (itemSlot === 'main_hand' || itemSlot === 'weapon') {
        isCompatible = (cleanTargetSlot === 'main_hand' || cleanTargetSlot === 'off_hand');
    } else if (itemSlot === 'armor') {
        isCompatible = (cleanTargetSlot === 'armor');
```

```javascript
// After (core/inventorySystem.js L403-407)
    let isCompatible = false;
    if (itemSlot === 'main_hand' || itemSlot === 'weapon') {
        isCompatible = (cleanTargetSlot === 'main_hand' || cleanTargetSlot === 'off_hand');
    } else if (itemSlot === 'armor') {
        isCompatible = (cleanTargetSlot === 'armor' || cleanTargetSlot === 'off_hand'); // Allows wearing armor on off_hand (shield style)
```

## Common tasks
- **Add or modify equipment slot types** — Adjust compatibility mappings between item slots and player slots in [inventorySystem.js L400-420](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/inventorySystem.js#L400-L420).
- **Configure item level restrictions** — Modify how the equipment system validates player level requirements in [inventorySystem.js L366-373](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/inventorySystem.js#L366-L373).
- **Modify two-handed weapon slots** — Change how unequipping of off-hand weapons behaves when two-handed weapons are equipped in [inventorySystem.js L437-444](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/inventorySystem.js#L437-L444).
- **Adjust inventory space checks** — Edit the validation limits for checking if player bags are full in [inventorySystem.js L131-136](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/inventorySystem.js#L131-L136).
- **Adjust unequip space limits** — Check how space is validated when moving items from gear slots back to the bag in [inventorySystem.js L496-501](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/inventorySystem.js#L496-L501).
