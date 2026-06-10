# Craft Command Flow (`craft`, `recipes`)

## 1. Description
The Craft command allows players to create weapons, armor, tools, and accessories by combining raw ingredients and materials found in their inventory. Listing recipes is done via `recipes`, and crafting is done via `craft <recipe_id>`.

---

## 2. Hierarchical Execution Tree

### Listing Crafting Recipes
```text
User sends ".j recipes"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "recipes") (L8810)
            └── core/commands/rpgCommands.js
                └── displayRecipes(sock, chatId, page, 'CRAFT') (L478)
                    └── Fetch crafting recipes
                    └── Filter by CRAFT category
                    └── Paginate recipes (6 per page)
            └── sock.sendMessage(chatId, { text: msg }) (L503)
```

### Crafting an Item
```text
User sends ".j craft iron_sword"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (primaryCmd === "craft") (L8835)
            └── core/commands/rpgCommands.js
                └── craftItem(sock, chatId, senderJid, recipeId, 'CRAFT') (L506)
                    └── core/rpg/craftingSystem.js
                        └── performCraft(senderJid, recipeId, 'CRAFT') (L475)
                            └── canCraft(senderJid, recipeId) (L450)
                                └── Verify user has all required ingredients in inventory
                            └── Enforce category station matching ('CRAFT')
                            └── Check space: inventorySystem.hasInventorySpace() (L493)
                            └── Remove ingredients: inventorySystem.removeItem() (L499)
                            └── Add result: inventorySystem.addItem() (L503)
                            └── Update Guild Board progress (CRAFT task) (L523)
            └── sock.sendMessage(chatId, { text: result.message }) (L509)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

```javascript
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
          if (type !== "notify" && type !== "append") return;
          if (isRekeying) return;

          await Promise.all(
            messages.map(async (m) => {
              if (!m.message) return;
```

#### Explanation
- Listens to incoming messages from Baileys. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L8834-L8844)
* **Line Numbers**: 8834-8844
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Redirects execution to `rpgCommands.craftItem`

```javascript
// `${botConfig.getPrefix().toLowerCase()}` craft <id>
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} craft` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} craft `)) {
    const recipeId = txt.split(' ').slice(2).join(' ').trim();
    if (!recipeId) {
        return await sendUsage(sock, chatId, BOT_MARKER, '🛠️ CRAFT', 'craft <recipe_id>', 'craft iron_sword', "Create equipment from materials.");
    }
    await rpgCommands.craftItem(sock, chatId, senderJid, recipeId);
    return;
}
```

#### Explanation
- Captures the `.j craft` command.
- Extracts the recipe identifier parameters. If none are typed, displays the usage helper and exits.
- Invokes `rpgCommands.craftItem` with the category set to `'CRAFT'`.

---

### Step 3: Ingredients Verification
* **File Path**: [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js#L450-L473)
* **Line Numbers**: 450-473
* **Called From**: `performCraft()`
* **Inputs**: `(userId, recipeId)`
* **Outputs**: `{ canCraft: boolean, recipe }` status payload

```javascript
function canCraft(userId, recipeId) {
    const recipe = getRecipeById(recipeId);
    if (!recipe) return { canCraft: false, reason: 'Recipe not found.' };

    const inventory = inventorySystem.getInventory(userId);
    const missing = [];

    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        const has = inventory[ingId] ? (typeof inventory[ingId] === 'number' ? inventory[ingId] : (inventory[ingId].quantity || 0)) : 0;
        if (has < qty) {
            const itemInfo = lootSystem.getItemInfo(ingId);
            missing.push(`${itemInfo.name} (${has}/${qty})`);
        }
    }

    if (missing.length > 0) {
        return { 
            canCraft: false, 
            reason: `Missing ingredients:\n- ${missing.join('\n- ')}` 
        };
    }

    return { canCraft: true, recipe };
}
```

#### Explanation
- Resolves the recipe properties from the registry configuration.
- Checks the player's active inventory. If any required ingredients are missing or insufficient, returns a list of required components.

---

### Step 4: Craft Execution and Inventory Mutations
* **File Path**: [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js#L475-L532)
* **Line Numbers**: 475-532
* **Called From**: `performCraft()`
* **Inputs**: `(userId, recipeId, requiredStation = 'CRAFT')`
* **Outputs**: Returns success status string with item properties

```javascript
async function performCraft(userId, recipeId, requiredStation = 'CRAFT') {
    const check = canCraft(userId, recipeId);
    if (!check.canCraft) return { success: false, message: check.reason };

    const recipe = check.recipe;
    const resultItem = recipe.result;

    if (recipe.category !== requiredStation) {
        return { success: false, message: `❌ This recipe requires a different crafting station!` };
    }

    if (!inventorySystem.hasInventorySpace(userId, 1, resultItem.id)) {
        return { success: false, message: "❌ Cannot craft: Inventory full!" };
    }

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
    
    // Guild tracking
    const guilds = require('./guilds');
    const userGuild = guilds.getUserGuild(userId);
    if (userGuild) {
        guilds.updateBoardProgress(userGuild, 'CRAFT', 1);
    }
```

#### Explanation
1. Checks that the recipe matches the crafting station category requested.
2. Checks that the user has open bag space for the output item.
3. Iterates over ingredients, removing them from inventory.
4. Adds the newly created item (equipment, consumable, or material) to the inventory. If item generation fails, rolls back and restores ingredients.
5. Increments daily Guild Board progress counters for the active guild.
6. Returns the success notification text.

---

## 4. How to Modify
To adjust crafting rules:
- **Add Crafting Recipes**: Edit `CRAFTING_RECIPES` object definition in `core/rpg/craftingSystem.js`.
- **Change Ingredient Salvage Yields**: Change the percentage in [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js#L547).
- **Dismantling returns (default 40% of craft ingredients)**: Edit values inside the `dismantleItem` function.
