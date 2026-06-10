# RPG Subsystem: Inventory & Equipment

## 1. Description
The Inventory and Equipment subsystem handles the storage, stacking, validation, and equipping of loot items collected by players. Inventory is modeled as a key-value dictionary (mapping item IDs to item metadata and counts) nested within MongoDB user documents. Equipment is stored nested under `equipment` slot mappings (`main_hand`, `off_hand`, `armor`, `boots`, etc.). When actions such as adding items, selling items, or equipping weapons are triggered:
1. The inventory maps are loaded into memory from the user's cached profile.
2. Space capacity constraints and level requirements are verified.
3. Two-handed weapon slots and dual-wielding combinations are resolved.
4. Database fields are saved synchronously via `economy.saveUser`.
Items and stat panels are displayed to the user as formatted tables sorted by rarity tiers in the WhatsApp chat via Baileys WebSocket communication.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j equip steel_sabre main_hand"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (primaryCmd === "equip") (L4746)
            └── core/commands/rpgCommands.js
                └── equipGear(sock, chatId, senderJid, itemId, slotName)
                    └── inventorySystem.equipItem(senderJid, itemId, slotName)
                        └── progression.getLevel(senderJid)
                        └── Level verification checks
                        └── Two-handed weapon slot adjustments
                        └── economy.saveUser(senderJid)
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
- `cmdArgs[0]`: Assigns the first element as `primaryCmd` (e.g. `"equip"`).

---

### Step 3: Command Routing for Equip
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4746
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const rpgCommands = require("./commands/rpgCommands");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `rpgCommands.equipGear`

```javascript
if (primaryCmd === "equip") {
  const itemId = cmdArgs[1];
  const slotName = cmdArgs[2];
  await rpgCommands.equipGear(sock, chatId, senderJid, itemId, slotName);
  return;
}
```

#### Explanation
- `if (primaryCmd === "equip")`: Matches the gear equipment command.
- `cmdArgs[1]`, `cmdArgs[2]`: Extracts the item ID and target slot parameters.
- `rpgCommands.equipGear(...)`: Passes control to the RPG commands module.

---

### Step 4: Core Equipment Allocation Logic
* **File Path**: `core/rpg/inventorySystem.js`
* **Line Numbers**: 342-472
* **Called From**: `core/commands/rpgCommands.js`
* **Imported From**: `core/rpg/inventorySystem.js`
* **Inputs**: `(userId, itemId, slot)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
async function equipItem(userId, itemId, slot) {
  const inventory = getInventory(userId);
  const equipment = getEquipment(userId);
  const playerLevel = progression.getLevel(userId);

  // Loose match for underscores & case
  const targetItemId = findLooseMatch(inventory, itemId);
  if (!inventory[targetItemId]) return { success: false, message: "❌ Item not found!" };

  const itemToEquip = inventory[targetItemId];
  const itemInfo = lootSystem.getItemInfo(targetItemId);

  // Level check
  const reqLevel = itemToEquip.reqLevel || itemInfo.reqLevel || 1;
  if (playerLevel < reqLevel) {
    return { success: false, message: `❌ Level too low! Need Level ${reqLevel}.` };
  }

  let targetSlot = slot || itemToEquip.slot || itemInfo.slot;
  if (targetSlot === 'weapon') targetSlot = 'main_hand';

  // Perform swap and adjust inventory/slot fields
  const equippedItem = equipment[targetSlot];
  equipment[targetSlot] = itemToEquip;
  
  if (equippedItem) {
    inventory[equippedItem.id] = equippedItem; // return old gear
  }
  
  delete inventory[targetItemId]; // remove equipped from bag
  await economy.saveUser(userId);

  return { success: true, message: `✅ Equipped ${itemToEquip.name}!` };
}
```

#### Explanation
- `getInventory(userId)`: Resolves player inventory dictionary representation from Mongoose caches.
- Checks if the parsed itemId is present inside the user's bag.
- `progression.getLevel(userId)`: Fetches current character levels.
- Ensures levels meet requirements before allowing items to be worn.
- Swaps active properties inside the `equipment` object structure, pushing old gear back to the inventory map, and then deletes the equipped item from the bag dictionary.
- Saves the updated user properties back to MongoDB.

---

## 4. How to Modify
To adjust base character inventory slots capacity, modify `inventorySystem.js`:

```javascript
// BEFORE:
const BASE_INVENTORY_CAPACITY = 20;

// AFTER:
const BASE_INVENTORY_CAPACITY = 30; // Increases baseline inventory capacity to 30 items
```
