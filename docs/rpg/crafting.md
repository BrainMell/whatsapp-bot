# RPG Subsystem: Crafting

## 1. Description
The Crafting system enables players to combine lower-tier raw materials into advanced gear, weapons, accessories, and culinary items. It resolves the problem of resource collection inflation by providing progression recipes that consume scrap loot. The system validates whether a player owns the required materials, enforces station restrictions (e.g., General vs. Forge), verifies inventory space, updates database files, and handles transaction rollbacks if the grant operation fails.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j craft steel_sabre"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (primaryCmd === "craft") (L5090)
            └── core/commands/rpgCommands.js
                └── craftItem(sock, chatId, senderJid, recipeId, 'CRAFT')
                    └── craftingSystem.performCraft(senderJid, recipeId, 'CRAFT')
                        └── inventorySystem.hasInventorySpace(...)
                        └── inventorySystem.removeItem(...)
                        └── inventorySystem.addItem(...)
                        └── Rollback block (if addItem fails)
                    └── sock.sendMessage(chatId, { text: ... })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
* **Inputs**: `{ messages, type }` payload from WhatsApp
* **Outputs**: None (passes control to inner map)

```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify" && type !== "append") return;
  if (isRekeying) return;

  await Promise.all(
    messages.map(async (m) => {
      if (!m.message) return;
```

#### Explanation
- `sock.ev.on("messages.upsert", ...)`: Registers a listener that fires whenever the bot receives new message notifications.
- `if (type !== "notify" && type !== "append") return`: Drops status updates or metadata modifications to only process actual incoming messages.
- `if (isRekeying) return`: Prevents processing when the session encryption keys are refreshing.
- `messages.map(...)`: Iterates over the batch of received messages to process them in parallel.

---

### Step 2: Command Matching
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Inner message processor loop
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: `primaryCmd` and `cmdArgs` array

```javascript
if (lowerTxt.startsWith(currentPrefix)) {
  const cmdBody = lowerTxt
    .substring(currentPrefix.length)
    .trim();
  const cmdArgs = cmdBody.split(" ");
  const primaryCmd = cmdArgs[0];
```

#### Explanation
- `lowerTxt.startsWith(currentPrefix)`: Checks if the incoming text begins with the configured bot prefix (e.g. `.j`).
- `lowerTxt.substring(...)`: Strips the prefix from the message.
- `cmdBody.split(" ")`: Splits the command body by spaces to separate the command name from its arguments.
- `cmdArgs[0]`: Assigns the first element as `primaryCmd` (e.g. `"craft"`).

---

### Step 3: Command Routing for Craft
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 5090
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const rpgCommands = require("./commands/rpgCommands");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `rpgCommands.craftItem`

```javascript
if (primaryCmd === "craft") {
  const recipeId = cmdArgs[1];
  await rpgCommands.craftItem(sock, chatId, senderJid, recipeId, 'CRAFT');
  return;
}
```

#### Explanation
- `if (primaryCmd === "craft")`: Matches the general crafting trigger command.
- `rpgCommands.craftItem(...)`: Routes execution to the rpgCommands handler specifying general station constraints (`'CRAFT'`).

---

### Step 4: Craft Validation and Execution
* **File Path**: `core/commands/rpgCommands.js`
* **Line Numbers**: Around 506-512
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/craftingSystem.js`
* **Inputs**: `(sock, chatId, senderJid, recipeId, categoryFilter)`
* **Outputs**: Initiates validation and prints success/error to chat

```javascript
async function craftItem(sock, chatId, senderJid, recipeId, categoryFilter = 'CRAFT') {
  if (!recipeId) return displayRecipes(sock, chatId, 1, categoryFilter);

  const result = await craftingSystem.performCraft(senderJid, recipeId.toLowerCase(), categoryFilter);
  if (result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  } else {
    await sock.sendMessage(chatId, { text: `❌ *ACTION FAILED*\n\n${result.reason || result.message}` });
  }
}
```

#### Explanation
- `if (!recipeId)`: If the user didn't specify what item to craft, displays the interactive recipes list handbook.
- `craftingSystem.performCraft(...)`: Enters the core crafting module to check item costs, availability of resources, and modify databases.
- `sock.sendMessage(...)`: Sends back the final status message indicating success or warning criteria.

---

### Step 5: Perform Craft Logic and Inventory Transactions
* **File Path**: `core/rpg/craftingSystem.js`
* **Line Numbers**: 475-516
* **Called From**: `core/commands/rpgCommands.js`
* **Imported From**: `core/rpg/inventorySystem.js`
* **Inputs**: `(userId, recipeId, requiredStation)`
* **Outputs**: Updates inventory documents in MongoDB, returns status object

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

  // Deduct ingredients
  for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
    inventorySystem.removeItem(userId, ingId, qty);
  }

  const addResult = await inventorySystem.addItem(userId, resultItem.id, 1, {
    name: recipe.name,
    stats: resultItem.stats || {},
    slot: resultItem.slot,
    type: resultItem.stats ? 'EQUIPMENT' : 'ITEM'
  });

  if (!addResult.success) {
    // Rollback ingredients
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
      await inventorySystem.addItem(userId, ingId, qty);
    }
    return addResult;
  }

  return { success: true, message: `✅ Successfully crafted ${recipe.name}!` };
}
```

#### Explanation
- `canCraft(...)`: Checks the in-memory item database and maps player inventory fields to verify raw material availability.
- `inventorySystem.hasInventorySpace(...)`: Ensures the player has slot capacity to acquire the output.
- `inventorySystem.removeItem(...)`: Deducts resources from player inventory structure.
- `inventorySystem.addItem(...)`: Adds the crafted piece of gear to the MongoDB record.
- **Rollback loop**: If `addItem` fails (due to write locks, errors, etc.), restores all consumed ingredients.

---

## 4. How to Modify
To add a new crafting recipe, edit `CRAFTING_RECIPES` inside `core/rpg/craftingSystem.js`:

```javascript
// BEFORE:
const CRAFTING_RECIPES = {
  steel_sabre: { name: 'Steel Sabre', ingredients: { iron_ore: 5 }, result: { id: 'steel_sabre' } }
};

// AFTER:
const CRAFTING_RECIPES = {
  steel_sabre: { name: 'Steel Sabre', ingredients: { iron_ore: 5 }, result: { id: 'steel_sabre' } },
  adamant_plate: { name: 'Adamant Plate', ingredients: { refined_steel: 10 }, result: { id: 'adamant_plate' } }
};
```
