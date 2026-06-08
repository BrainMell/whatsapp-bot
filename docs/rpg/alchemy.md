# RPG Subsystem: Alchemy

## What it is
The Alchemy system manages item brewing, allowing players to combine raw materials and base potions into consumables or stat-boosting items. It solves the problem of resource utility by giving players a progression path to convert scrap loot into highly valuable combat consumables (such as health potions or temporary shields). It acts as a specialized wrapper of the crafting system, utilizing matching databases and inventory deduct/grant protocols.

## How it works

### Snippet 1: Command Router Wrapper
```javascript
// File: core/commands/rpgCommands.js (Lines 513)
async function brewItem(sock, chatId, senderJid, recipeId) { 
    return craftItem(sock, chatId, senderJid, recipeId, 'BREWING'); 
}
```
* **Explanation**: Located at the mid-level of the RPG commands controller, this function captures the user command input and wraps it, passing it directly to the core crafting system under the filter `'BREWING'` to restrict the process to alchemy recipes.
* **DB Calls**: None.
* **External HTTP Calls**: None.
* **Baileys API Used**: None.

### Snippet 2: Recipe Validation & Station Enforcer
```javascript
// File: core/rpg/craftingSystem.js (Lines 475-495)
async function performCraft(userId, recipeId, requiredStation = 'CRAFT') {
    const check = canCraft(userId, recipeId);
    if (!check.canCraft) return { success: false, message: check.reason };

    const recipe = check.recipe;
    const resultItem = recipe.result;

    // Enforce Station Type
    if (recipe.category !== requiredStation) {
        let stationName = "General Crafting Table";
        if (recipe.category === 'BREWING') stationName = "Laboratory";
        if (recipe.category === 'COOKING') stationName = "Kitchen";
        if (recipe.category === 'FORGE') stationName = "Blacksmith Forge";
        
        return { success: false, message: `❌ This recipe requires a **${stationName}**!` };
    }
```
* **Explanation**: Located inside the main execution block of the crafting module, this function resolves the recipe requirements and asserts that the user is trying to make a recipe matching the `'BREWING'` station type (Laboratory).
* **DB Calls**: Reads `inventory` field inside the `users` collection.
* **External HTTP Calls**: None.
* **Baileys API Used**: None.

### Snippet 3: Inventory Deductions & Grant
```javascript
// File: core/rpg/craftingSystem.js (Lines 497-516)
    // 1. Remove ingredients
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        inventorySystem.removeItem(userId, ingId, qty);
    }

    // 2. Add result
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
* **Explanation**: Deducts the ingredients from the user's inventory map. If adding the new item fails due to a full inventory, it executes a rollback loop to restore the deducted materials.
* **DB Calls**: Updates `inventory` Map inside the `users` collection.
* **External HTTP Calls**: None.
* **Baileys API Used**: None.

## How to modify it

To add a new alchemy potion/recipe, you must edit two files:
1. **Item Definition**: Define the item in `ITEM_DATABASE` inside [core/rpg/lootSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/lootSystem.js).
2. **Recipe Registry**: Register the recipe in `BREWING_RECIPES` inside [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js).

### Before
```javascript
// File: core/rpg/craftingSystem.js (Line 298)
const BREWING_RECIPES = {
    'mega_potion': {
        name: 'Mega Health Potion', id: 'mega_potion', category: 'BREWING',
        desc: 'A powerful brew that restores 250 HP.',
        ingredients: { 'major_potion': 2, 'healing_herb': 3, 'mana_dew': 1 },
        result: { id: 'mega_potion', usable: true, effect: 'heal', effectValue: 250 }
    },
};
```

### After
```javascript
// File: core/rpg/craftingSystem.js (Line 298)
const BREWING_RECIPES = {
    'mega_potion': {
        name: 'Mega Health Potion', id: 'mega_potion', category: 'BREWING',
        desc: 'A powerful brew that restores 250 HP.',
        ingredients: { 'major_potion': 2, 'healing_herb': 3, 'mana_dew': 1 },
        result: { id: 'mega_potion', usable: true, effect: 'heal', effectValue: 250 }
    },
    'hyper_elixir': {
        name: 'Hyper Elixir', id: 'hyper_elixir', category: 'BREWING',
        desc: 'A divine mixture that restores 1000 HP and 100 Energy.',
        ingredients: { 'mega_potion': 3, 'mana_crystal': 2, 'dragon_blood': 1 },
        result: { id: 'hyper_elixir', usable: true, effect: 'heal_energy', effectValue: 1000 }
    }
};
```
*Note: Make sure to add `'hyper_elixir'` to the `ITEM_DATABASE` in [core/rpg/lootSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/lootSystem.js) as a consumable type so the inventory loader can resolve its description.*

## Common tasks

* **Add a new alchemy recipe**: Insert a new object with the `'BREWING'` category filter inside `const BREWING_RECIPES` in [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js#L298).
* **Change potion ingredient costs**: Modify the `ingredients` keys and integer quantities for the target potion in [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js#L302).
* **Edit recipe requirements warnings**: Update the hardcoded warning string inside `performCraft` in [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js#L489).
