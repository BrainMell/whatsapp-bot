# Forge Command Flow (`forge`)

## 1. Description
The Forge command allows players to smith high-tier weapons and armor by combining raw metal ores, ingots, and crystal fragments at a Blacksmith Forge station.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j forge steel_plate"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "forge") (L5102)
            └── core/commands/rpgCommands.js
                └── forgeItem(sock, chatId, senderJid, recipeId) (L515)
                    └── craftItem(sock, chatId, senderJid, recipeId, 'FORGE') (L506)
                        └── core/rpg/craftingSystem.js
                            └── performCraft(senderJid, recipeId, 'FORGE') (L475)
                                └── canCraft(senderJid, recipeId) (L450)
                                    └── Verify user has all required ingredients in inventory
                                └── Enforce category station matching ('FORGE')
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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5101-L5111)
* **Line Numbers**: 5101-5111
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `cmdArgs`
* **Outputs**: Redirects execution to `rpgCommands.forgeItem`

```javascript
                    // .j forge
                    if (primaryCmd === "forge") {
                      const item = cmdArgs.slice(1).join(" ");
                      await rpgCommands.forgeItem(
                        sock,
                        chatId,
                        senderJid,
                        item,
                      );
                      return;
                    }
```

#### Explanation
- Catches the `.j forge` command.
- Extracts the weapon/recipe ID parameter.
- Routes execution to `rpgCommands.forgeItem` which invokes `'FORGE'` station parameters.

---

### Step 3: Forging Recipe Verification
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
- Searches the blacksmith forging recipe collection (`FORGE_RECIPES`).
- Checks user inventory for raw ore ingredients (e.g. mythril ore, iron ingots).

---

### Step 4: Blacksmith Forge Execution
* **File Path**: [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js#L475-L532)
* **Line Numbers**: 475-532
* **Called From**: `performCraft()`
* **Inputs**: `(userId, recipeId, requiredStation = 'FORGE')`
* **Outputs**: Smelted/forged equipment added to user inventory, ores deleted

```javascript
async function performCraft(userId, recipeId, requiredStation = 'FORGE') {
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
```

#### Explanation
- Enforces station check (`recipe.category === 'FORGE'`).
- Removes raw ores/shards, and awards 1x high-tier weapon/armor piece.
- Saves progress to MongoDB.

---

## 4. How to Modify
To adjust blacksmithing recipes:
- **Add or Modify Forging Recipes**: Edit the `FORGE_RECIPES` object in `core/rpg/craftingSystem.js`.
- **Change Equipment Weapon/Armor Stats**: Edit stats inside `FORGE_RECIPES` result field or modify items configuration inside `core/rpg/lootSystem.js`.
