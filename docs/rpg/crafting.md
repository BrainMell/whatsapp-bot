# RPG Subsystem: Crafting

## What it is
The Crafting system enables players to combine lower-tier raw materials into advanced gear, weapons, accessories, and culinary items. It resolves the problem of resource collection inflation by providing progression recipes that consume scrap loot. The system validates whether a player owns the required materials, enforces station restrictions (e.g., General vs. Forge), verifies inventory space, updates database files, and handles transaction rollbacks if the grant operation fails.

## How it works

### Snippet 1: Recipe Validation and Ingredients Deduction
```javascript
// File: core/craftingSystem.js (Lines 475-498)
async function performCraft(userId, recipeId, requiredStation = 'CRAFT') {
    const check = canCraft(userId, recipeId);
    if (!check.canCraft) return { success: false, message: check.reason };

    const recipe = check.recipe;
    const resultItem = recipe.result;

    if (recipe.category !== requiredStation) {
        let stationName = "General Crafting Table";
        if (recipe.category === 'BREWING') stationName = "Laboratory";
        if (recipe.category === 'COOKING') stationName = "Kitchen";
        if (recipe.category === 'FORGE') stationName = "Blacksmith Forge";
        
        return { success: false, message: `❌ This recipe requires a **${stationName}**!` };
    }

    if (!inventorySystem.hasInventorySpace(userId, 1, resultItem.id)) {
        return { success: false, message: "❌ Cannot craft: Inventory full!" };
    }

    // Deduct ingredients
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        inventorySystem.removeItem(userId, ingId, qty);
    }
```
* **Explanation**: Validates recipe existence and whether the player holds enough ingredients. Enforces the station restriction matching the target category (e.g. `'FORGE'`), checks if inventory space is available, and deducts the ingredients using the inventory helper.
* **DB Calls**: Reads player inventory Map fields from the `users` collection.
* **External HTTP Calls**: None.
* **Baileys API Used**: None.

### Snippet 2: Item Granting and Rollback
```javascript
// File: core/craftingSystem.js (Lines 500-516)
    const addResult = await inventorySystem.addItem(userId, resultItem.id, 1, {
        name: recipe.name,
        stats: resultItem.stats || {},
        slot: resultItem.slot,
        type: resultItem.stats ? 'EQUIPMENT' : (resultItem.usable ? 'CONSUMABLE' : 'ITEM')
    });

    if (!addResult.success) {
        // Restore ingredients if addition failed
        for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
            await inventorySystem.addItem(userId, ingId, qty);
        }
        return addResult;
    }
```
* **Explanation**: Adds the crafted result to the user's inventory. If the transaction fails, it iterates through the ingredients map to restore the deducted materials to the player's profile map.
* **DB Calls**: Writes player inventory and equipment maps to the `users` collection.
* **External HTTP Calls**: None.
* **Baileys API Used**: None.

### Snippet 3: Command Router Interface
```javascript
// File: core/rpgCommands.js (Lines 506-511)
async function craftItem(sock, chatId, senderJid, recipeId, categoryFilter = 'CRAFT') {
    if (!recipeId) return displayRecipes(sock, chatId, 1, categoryFilter);
    const result = await craftingSystem.performCraft(senderJid, recipeId.toLowerCase(), categoryFilter);
    if (result.success) await sock.sendMessage(chatId, { text: result.message });
    else await sock.sendMessage(chatId, { text: `❌ *ACTION FAILED*\n\n${result.reason || result.message}` });
}
```
* **Explanation**: Parses incoming player chat command arguments. If no recipe name is supplied, it prints the recipe handbook; otherwise, it passes parameters to the crafting engine and reports success or failure via Baileys.
* **DB Calls**: None.
* **External HTTP Calls**: None.
* **Baileys API Used**: `sock.sendMessage()`.

## How to modify it

To add a new recipe:
1. Locate `CRAFTING_RECIPES` inside [core/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/craftingSystem.js).
2. Insert a new recipe configuration defining the ingredients and the result stats/slot.
3. Make sure to define the result item object inside `ITEM_DATABASE` in [core/lootSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/lootSystem.js).

### Before
```javascript
// File: core/craftingSystem.js (Line 14)
const CRAFTING_RECIPES = {
    'steel_sabre': {
        name: 'Steel Sabre', category: 'WEAPON', id: 'steel_sabre',
        desc: 'A sharp, finely forged blade. (+25 ATK, +5 SPD)',
        ingredients: { 'iron_sword': 1, 'refined_steel': 3, 'sharp_whetstone': 1 },
        result: { id: 'steel_sabre', stats: { atk: 25, spd: 5 }, slot: 'weapon' }
    },
};
```

### After
```javascript
// File: core/craftingSystem.js (Line 14)
const CRAFTING_RECIPES = {
    'steel_sabre': {
        name: 'Steel Sabre', category: 'WEAPON', id: 'steel_sabre',
        desc: 'A sharp, finely forged blade. (+25 ATK, +5 SPD)',
        ingredients: { 'iron_sword': 1, 'refined_steel': 3, 'sharp_whetstone': 1 },
        result: { id: 'steel_sabre', stats: { atk: 25, spd: 5 }, slot: 'weapon' }
    },
    'titanium_shield': {
        name: 'Titanium Shield', category: 'FORGE', id: 'titanium_shield',
        desc: 'An indestructible bulwark. (+60 DEF, +200 HP)',
        ingredients: { 'refined_steel': 5, 'titanium_ore': 3 },
        result: { id: 'titanium_shield', stats: { def: 60, hp: 200 }, slot: 'shield' }
    }
};
```

## Common tasks

* **Add a new crafting recipe**: Add a new key and configuration object into `CRAFTING_RECIPES` in [core/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/craftingSystem.js#L14).
* **Change recipe ingredients**: Edit the quantity integers inside the `ingredients` map for the target key in [core/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/craftingSystem.js#L19).
* **Update station restriction labels**: Change the hardcoded mapping strings (e.g. `Laboratory` or `Blacksmith Forge`) inside `performCraft` in [core/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/craftingSystem.js#L485).
