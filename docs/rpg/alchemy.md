# RPG Subsystem: Alchemy

## 1. Description
The Alchemy system manages item brewing, allowing players to combine raw materials and base potions into consumables or stat-boosting items. It solves the problem of resource utility by giving players a progression path to convert scrap loot into highly valuable combat consumables (such as health potions or temporary shields). It acts as a specialized wrapper of the crafting system, utilizing matching databases and inventory deduct/grant protocols.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j brew mega_potion"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (primaryCmd === "brew") (L5095)
            └── core/commands/rpgCommands.js
                └── brewItem(sock, chatId, senderJid, recipeId) (L513)
                    └── craftItem(sock, chatId, senderJid, recipeId, 'BREWING') (L506)
                        └── craftingSystem.performCraft(senderJid, recipeId, 'BREWING')
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
- `cmdArgs[0]`: Assigns the first element as `primaryCmd` (e.g. `"brew"`).

---

### Step 3: Command Routing for Brew
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 5095
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const rpgCommands = require("./commands/rpgCommands");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `rpgCommands.brewItem`

```javascript
if (primaryCmd === "brew") {
  const recipeId = cmdArgs[1];
  await rpgCommands.brewItem(sock, chatId, senderJid, recipeId);
  return;
}
```

#### Explanation
- `if (primaryCmd === "brew")`: Matches the brewing trigger command.
- `rpgCommands.brewItem(...)`: Routes execution to the rpgCommands handler.

---

### Step 4: Command Handler Wrapper
* **File Path**: `core/commands/rpgCommands.js`
* **Line Numbers**: Around 513
* **Called From**: `core/engine.js`
* **Imported From**: `core/commands/rpgCommands.js` (internal call to craftItem)
* **Inputs**: `(sock, chatId, senderJid, recipeId)`
* **Outputs**: Redirects execution with category filter `'BREWING'`

```javascript
async function brewItem(sock, chatId, senderJid, recipeId) {
  return craftItem(sock, chatId, senderJid, recipeId, 'BREWING');
}
```

#### Explanation
- `brewItem(...)`: Invokes the general `craftItem` function, overriding the third argument to force station validation match the `'BREWING'` category (enforcing Laboratory restrictions).

---

### Step 5: Brew Validation and Execution
* **File Path**: `core/rpg/craftingSystem.js`
* **Line Numbers**: 475-516
* **Called From**: `core/commands/rpgCommands.js`
* **Imported From**: `core/rpg/inventorySystem.js`
* **Inputs**: `(userId, recipeId, requiredStation = 'BREWING')`
* **Outputs**: Mutates user inventory database entries, reports outcome status

```javascript
async function performCraft(userId, recipeId, requiredStation = 'BREWING') {
  const check = canCraft(userId, recipeId);
  if (!check.canCraft) return { success: false, message: check.reason };

  const recipe = check.recipe;
  const resultItem = recipe.result;

  if (recipe.category !== requiredStation) {
    return { success: false, message: "❌ This recipe requires a Laboratory!" };
  }

  if (!inventorySystem.hasInventorySpace(userId, 1, resultItem.id)) {
    return { success: false, message: "❌ Cannot brew: Inventory full!" };
  }

  // Deduct ingredients
  for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
    inventorySystem.removeItem(userId, ingId, qty);
  }

  const addResult = await inventorySystem.addItem(userId, resultItem.id, 1, {
    name: recipe.name,
    stats: resultItem.stats || {},
    slot: resultItem.slot,
    type: 'CONSUMABLE'
  });

  if (!addResult.success) {
    // Rollback ingredients
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
      await inventorySystem.addItem(userId, ingId, qty);
    }
    return addResult;
  }

  return { success: true, message: `🧪 Successfully brewed ${recipe.name}!` };
}
```

#### Explanation
- `canCraft(...)`: Resolves standard item gacha criteria and checks player inventory balances.
- `if (recipe.category !== requiredStation)`: Enforces that the item is registered as a brewing/alchemy recipe.
- `inventorySystem.removeItem(...)`: Deducts potion materials.
- `inventorySystem.addItem(...)`: Adds the consumable potion record to the user's document in the DB.
- **Rollback loop**: Restores ingredient counts if the transaction encounters write/slot errors.

---

## 4. How to Modify
To add a new potion recipe, edit `BREWING_RECIPES` inside `core/rpg/craftingSystem.js`:

```javascript
// BEFORE:
const BREWING_RECIPES = {
  mega_potion: { name: 'Mega Potion', ingredients: { major_potion: 2 }, result: { id: 'mega_potion' } }
};

// AFTER:
const BREWING_RECIPES = {
  mega_potion: { name: 'Mega Potion', ingredients: { major_potion: 2 }, result: { id: 'mega_potion' } },
  elixir_of_gods: { name: 'Elixir of Gods', ingredients: { ambrosia: 5 }, result: { id: 'elixir_of_gods' } }
};
```
