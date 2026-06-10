# Dismantle Command Flow (`dismantle`)

## 1. Description
The Dismantle command allows players to break down equipment/items in their inventory to recover a percentage of their crafting ingredients (usually 40%). It verifies inventory constraints and updates both the item count and material counts in the player's profile data.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j dismantle 3" or ".j dismantle iron_sword"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check: lowerTxt === ".j dismantle" || startsWith(".j dismantle ") (L8846)
            └── core/commands/rpgCommands.js
                └── dismantleItem(sock, chatId, senderJid, input) (L516)
                    ├── inventorySystem.formatInventory(senderJid)
                    └── core/rpg/craftingSystem.js
                        └── dismantleItem(senderJid, targetItemId) (L534)
                            ├── inventorySystem.getInventory(userId)
                            ├── Find recipe in CRAFTING_RECIPES
                            ├── Compute returned materials: Math.max(1, Math.floor(qty * 0.4))
                            ├── inventorySystem.hasInventorySpace(userId, totalItemsToReturn)
                            ├── inventorySystem.removeItem(userId, itemId, 1)
                            ├── inventorySystem.addItem(userId, id, qty)
                            └── Return success payload with recovered materials message
                    └── sock.sendMessage(chatId, { text: result.message })
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
- Receives the socket event payload from Baileys. Iterates over individual incoming messages.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L8846-L8853)
* **Line Numbers**: 8846-8853
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and sender details
* **Outputs**: Calls `rpgCommands.dismantleItem`

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} dismantle` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} dismantle `)) {
    const input = txt.substring(`${botConfig.getPrefix().toLowerCase()} dismantle`.length).trim();
    if (!input) {
        return await sendUsage(sock, chatId, BOT_MARKER, '⚒️ DISMANTLE', 'dismantle <#bag_index>', 'dismantle 5', 'Break down old equipment to recover some materials.');
    }
    await rpgCommands.dismantleItem(sock, chatId, senderJid, input);
    return;
}
```

#### Explanation
- Catches the `.j dismantle` command.
- Extracts the arguments (either item JID or index number inside the player inventory bag).
- Routes to `rpgCommands.dismantleItem()`.

---

### Step 3: Resolving Item ID from Input
* **File Path**: [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L516-L526)
* **Line Numbers**: 516-526
* **Called From**: `dismantleItem()`
* **Inputs**: `(sock, chatId, senderJid, input)`
* **Outputs**: Resolves index to item ID, invokes `craftingSystem.dismantleItem()`

```javascript
async function dismantleItem(sock, chatId, senderJid, input) {
    let targetItemId = input;
    if (!isNaN(parseInt(input))) {
        const inventory = inventorySystem.formatInventory(senderJid);
        const index = parseInt(input) - 1;
        if (!inventory.isEmpty && inventory.items[index]) targetItemId = inventory.items[index].id;
    }
    if (!targetItemId) return await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} dismantle <id or bag_#>\`` });
    const result = await craftingSystem.dismantleItem(senderJid, targetItemId);
    await sock.sendMessage(chatId, { text: result.message });
}
```

#### Explanation
1. Checks if the parameter is a valid integer. If yes, it formats the user's inventory layout to extract the exact item ID (e.g., `iron_sword`) at that 1-indexed slot position.
2. Invokes the core backend system method `craftingSystem.dismantleItem()`.
3. Sends the output status returned by the backend system.

---

### Step 4: Core Dismantle Logic & Inventory Sync
* **File Path**: [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js#L534-L571)
* **Line Numbers**: 534-571
* **Called From**: `craftingSystem.dismantleItem()`
* **Inputs**: `(userId, itemId)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
async function dismantleItem(userId, itemId) {
    const inventory = inventorySystem.getInventory(userId);
    if (!inventory[itemId]) return { success: false, message: "Item not found in inventory." };

    const itemData = inventory[itemId];
    const recipe = Object.values(CRAFTING_RECIPES).find(r => r.result.id === itemId);
    
    if (!recipe) return { success: false, message: "This item cannot be dismantled." };

    // Calculate returned materials
    const returned = {};
    let totalItemsToReturn = 0;
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        const amount = Math.max(1, Math.floor(qty * 0.4));
        returned[ingId] = amount;
        totalItemsToReturn++;
    }

    // Check for enough space for all materials
    if (!inventorySystem.hasInventorySpace(userId, totalItemsToReturn)) {
        return { success: false, message: "❌ Not enough inventory space to store recovered materials!" };
    }

    // Remove item
    inventorySystem.removeItem(userId, itemId, 1);

    // Return materials
    for (const [id, qty] of Object.entries(returned)) {
        await inventorySystem.addItem(userId, id, qty);
    }

    let msg = `♻️ *DISMANTLED: ${itemData.name || itemId}*\n\nRecovered materials:\n`;
    for (const [id, qty] of Object.entries(returned)) {
        msg += `- ${qty}x ${lootSystem.getItemInfo(id).name}\n`;
    }

    return { success: true, message: msg };
}
```

#### Explanation
1. Checks the user's inventory cache.
2. Finds the item recipe in `CRAFTING_RECIPES`. If the item cannot be crafted, it cannot be dismantled.
3. Computes the material returns at a 40% rate (`qty * 0.4`), rounded down, with a minimum of 1.
4. Asserts inventory space before modifying collections.
5. Deducts 1 unit of the source item via `inventorySystem.removeItem()`.
6. Adds the calculated ingredients via `inventorySystem.addItem()`.
7. Formats and returns a success payload listing all the recovered materials.

---

## 4. How to Modify
- **Modify Return Percentage**: Locate [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js#L547) and change the multiplier `0.4` (currently 40%).
- **Add Dismantlable Recipes**: Add or modify definitions in `CRAFTING_RECIPES` inside `core/rpg/craftingSystem.js`.
