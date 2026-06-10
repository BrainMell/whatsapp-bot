# Equip & Unequip Commands Flow (`equip` / `unequip`)

## 1. Description
The `equip` and `unequip` commands allow users to manage their character's equipment. Equipping an item verifies level requirements, checks equipment category validity, ensures slot-type compatibility (e.g. you can't equip boots to the helmet slot), resolves two-handed weapon constraints, removes the item from the user's inventory bag, and attaches it to the respective equipment slot. Unequipping does the reverse, moving items back into the inventory after ensuring space availability.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🛡️ EQUIP FLOW: User sends ".j equip 3 helmet" or ".j equip iron_sword"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check: primaryCmd === "equip" (L4964 / L13726)
            └── core/commands/rpgCommands.js
                └── equipItem(sock, chatId, senderJid, itemId, slot) (L392)
                    ├── inventorySystem.getEquipment(senderJid)
                    ├── Resolves index (e.g., "3") to targetItemId
                    ├── core/rpg/inventorySystem.js
                    │   └── equipItem(senderJid, targetItemId, slot) (L342)
                    │       ├── Retrieve user inventory & level
                    │       ├── Check level requirements (L367)
                    │       ├── Resolve slot type compatibilities (L400-427)
                    │       ├── Check Two-Handed weapon overrides (L431-454)
                    │       ├── removeItem(userId, itemId, 1) (L435)
                    │       ├── addItem(userId, oldItem.id, 1, oldItem) (L459) [if old equipment exists]
                    │       └── economy.saveUser(userId)
                    └── sock.sendMessage(chatId, { text: successMessage })

======================================================
🛡️ UNEQUIP FLOW: User sends ".j unequip weapon"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: primaryCmd === "unequip" (L4976 / L13758)
            └── core/commands/rpgCommands.js
                └── unequipItem(sock, chatId, senderJid, slot) (L436)
                    └── core/rpg/inventorySystem.js
                        └── unequipItem(senderJid, slot) (L474)
                            ├── getEquipment(userId) & check existence
                            ├── Check if inventory is full (L496)
                            ├── addItem(userId, item.id, 1, item) (L503)
                            ├── Remove from slot: equipment[slotName] = null
                            └── economy.saveUser(userId)
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
- Receives the message payload from Baileys, checks status codes, and distributes keys to command-routing loops.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13724-L13766)
* **Line Numbers**: 13724-13766
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and arguments
* **Outputs**: Redirects execution to `rpgCommands.equipItem` or `rpgCommands.unequipItem`

```javascript
                  // EQUIPMENT COMMANDS
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} equip`
                  ) {
                    await rpgCommands.equipItem(sock, chatId, senderJid);
                    return;
                  }
                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} equip `,
                    )
                  ) {
                    const args = txt.trim().split(/\s+/).slice(2);
                    const slot = args[1];
                    await rpgCommands.equipItem(
                      sock,
                      chatId,
                      senderJid,
                      args[0],
                      slot,
                    );
                    return;
                  }
                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} unequip `,
                    )
                  ) {
                    const slot = txt
                      .substring(
                        `${botConfig.getPrefix().toLowerCase()} unequip `.length,
                      )
                      .trim();
                    await rpgCommands.unequipItem(
                      sock,
                      chatId,
                      senderJid,
                      slot,
                    );
                    return;
                  }
```

#### Explanation
- Evaluates the incoming message command prefix.
- If matches `.j equip`, it splits args: `args[0]` represents target itemId or index; `args[1]` specifies an optional custom slot override.
- Invokes the corresponding wrapper in `rpgCommands.js`.

---

### Step 3: Resolving Item ID and Calling Backend Core
* **File Path**: [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L392-L450)
* **Line Numbers**: 392-450
* **Called From**: `equipItem()` or `unequipItem()`
* **Inputs**: `(sock, chatId, senderJid, itemId, slot)` / `(sock, chatId, senderJid, slot)`
* **Outputs**: Invokes `inventorySystem` functions, returns message to WhatsApp client

```javascript
async function equipItem(sock, chatId, senderJid, itemId, slot) { 
    const equipment = inventorySystem.getEquipment(senderJid);
    if (!equipment) return;

    if (!itemId) { 
        // ... (Lists equipped slots and tutorial guide)
        return;
    }

    let targetItemId = itemId;
    if (!isNaN(parseInt(itemId))) { 
        const inventory = inventorySystem.formatInventory(senderJid);
        const index = parseInt(itemId) - 1;
        if (!inventory.isEmpty && inventory.items[index]) { 
            targetItemId = inventory.items[index].id;
        }
    }

    const result = await inventorySystem.equipItem(senderJid, targetItemId, slot);
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.equipped);
    await sock.sendMessage(chatId, { text: `✅ Equipped ${itemInfo.name} to *${result.slot}* slot!` });
}
```

#### Explanation
- Translates inventory indices (e.g. `1`, `2`) into actual item JIDs (e.g., `iron_shield`).
- Offloads actual processing and validation to `inventorySystem.js`.
- Updates the user interface via text messages on completion status.

---

### Step 4: Core Equipment Management and Constraints Check
* **File Path**: [core/rpg/inventorySystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/inventorySystem.js#L342-L510)
* **Line Numbers**: 342-510
* **Called From**: `inventorySystem.equipItem()` / `inventorySystem.unequipItem()`
* **Inputs**: `(userId, itemId, slot)` / `(userId, slot)`
* **Outputs**: `{ success: boolean, message/equipped/slot: any }`

```javascript
async function equipItem(userId, itemId, slot) {
    const inventory = getInventory(userId);
    const equipment = getEquipment(userId);
    const progression = require('./progression');
    
    // Checks item presence in user's inventory...
    const itemToEquip = inventory[targetItemId];
    const itemInfo = lootSystem.getItemInfo(targetItemId);
    const playerLevel = progression.getLevel(userId);

    // level check
    const reqLevel = itemToEquip.reqLevel || itemInfo.reqLevel || 1;
    if (playerLevel < reqLevel) {
        return { success: false, message: `❌ Level too low! Need Level ${reqLevel} to use this.` };
    }
    
    // verify category compatibility
    if (itemInfo.type !== 'EQUIPMENT') {
        return { success: false, message: `❌ Not equipment!` };
    }

    // slot assignment compatibility checks
    const itemSlot = (itemToEquip.slot || itemInfo.slot || '').toLowerCase();
    // (Compatibility match logic checks: main_hand, off_hand, armor, boots, etc.)
    
    // TWO-HANDED weapon logic overrides:
    // If equipping a two-handed weapon to main_hand, automatically unequip off_hand
    if (isTwoHanded && slotName === 'main_hand' && equipment.off_hand) {
        const offHand = equipment.off_hand;
        equipment.off_hand = null;
        await addItem(userId, offHand.id, 1, offHand);
    }

    // remove new item from inventory bag
    removeItem(userId, itemId, 1);

    // put old item back in inventory bag
    const oldItem = equipment[slotName];
    if (oldItem) {
        await addItem(userId, oldItem.id, 1, oldItem);
    }
    
    // mount new item in slot
    equipment[slotName] = { ...itemToEquip };
    delete equipment[slotName].quantity;
    
    await economy.saveUser(userId);
    return { success: true, equipped: itemId, slot: slotName };
}
```

#### Explanation
1. **Level Check**: Compares player level with the item's `reqLevel`.
2. **Type Check**: Verifies the item category is `EQUIPMENT`.
3. **Slot Match**: Prevents players from equipping armor to ring slots, etc.
4. **Two-Handed Override**: If a user equips a two-handed weapon to `main_hand`, any shield/weapon in `off_hand` is unequipped. Conversely, if a two-handed weapon is equipped, a shield cannot be attached to `off_hand`.
5. **Inventory Update**: Deducts the equipped item count, returns previous equipment in that slot to the inventory bag, and saves the new states in the cache via `economy.saveUser()`.

---

## 4. How to Modify
- **Add Custom Slots**: Update the `EQUIPMENT_SLOTS` enum mapping in [core/rpg/inventorySystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/inventorySystem.js#L26).
- **Adjust Base Level Requirements**: Modify the `reqLevel` variable in item definitions inside [core/rpg/lootSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/lootSystem.js).
- **Modify Equipment Slot Icons**: Edit the `getSlotIcon` function inside [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L469).
