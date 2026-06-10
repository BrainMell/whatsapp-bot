# Inventory Command Flow (`inventory`, `bag`)

## 1. Description
The Inventory command (aliased as `bag`) displays a paginated overview of the items inside the player's inventory, grouped by rarity tier. It displays item quantities, equipped marks, and direct stat differences for unequipped equipment compared against items currently active in that slot.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j inventory" or ".j bag 2"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "inventory" || "bag") (L5099)
            └── Parse page: page = parseInt(cmdArgs[1]) || 1
            └── core/commands/rpgCommands.js
                └── displayInventory(sock, chatId, senderJid, page) (L157)
                    └── inventorySystem.formatInventory(senderJid)
                    └── inventorySystem.getEquipment(senderJid)
                    └── Retrieve wallet balance and GP
                    └── Sort items based on rarity order (MYTHIC to COMMON)
                    └── Paginate flat ordered list (12 items per page)
                    └── Loop page items:
                        └── Check if item is currently equipped
                        └── If unequipped EQUIPMENT -> compare stats difference (delta) against slot-equipped item
            └── sock.sendMessage(chatId, { text: msg }) (L252)
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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5099)
* **Line Numbers**: Around 5099
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `cmdArgs`
* **Outputs**: Redirects execution to `rpgCommands.displayInventory`

```javascript
                    if (primaryCmd === "inventory" || primaryCmd === "bag") {
                      const page = parseInt(cmdArgs[1]) || 1;
                      await rpgCommands.displayInventory(
                        sock,
                        chatId,
                        senderJid,
                        page,
                      );
                      return;
                    }
```

#### Explanation
- Catches the `.j inventory` or `.j bag` commands.
- Parses the second argument as a page number (defaults to 1).
- Invokes `rpgCommands.displayInventory`.

---

### Step 3: Fetching and Ordering Inventory Items
* **File Path**: [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L157-L196)
* **Line Numbers**: 157-196
* **Called From**: `displayInventory()`
* **Imported From**: `core/rpg/inventorySystem` & `core/rpg/economy`
* **Inputs**: `(sock, chatId, senderJid, page)`
* **Outputs**: Ordered list of items for the requested page index

```javascript
async function displayInventory(sock, chatId, senderJid, page = 1) {
  const formatted = inventorySystem.formatInventory(senderJid);
  const equipment = inventorySystem.getEquipment(senderJid);
  const equippedIds = Object.values(equipment).filter(i => i !== null).map(i => i.id);
  const economyUser = economy.getUser(senderJid);
  const currency = getCurrency();
  const walletBalance = economyUser?.wallet || 0;
  const questGold = economyUser?.questGold || 0;

  const ITEMS_PER_PAGE = 12;
  const rarityOrder = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];
  ...
  // Build flat ordered list
  const orderedItems = [];
  const rarityGroups = {};
  for (const item of formatted.items) {
    if (!rarityGroups[item.rarity]) rarityGroups[item.rarity] = [];
    rarityGroups[item.rarity].push(item);
  }
  for (const rarity of rarityOrder) {
    if (rarityGroups[rarity]) orderedItems.push(...rarityGroups[rarity]);
  }

  const totalItems = orderedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const pageItems = orderedItems.slice((clampedPage - 1) * ITEMS_PER_PAGE, clampedPage * ITEMS_PER_PAGE);
  const pageStartIndex = (clampedPage - 1) * ITEMS_PER_PAGE;
```

#### Explanation
- Calls `inventorySystem.formatInventory(senderJid)` to parse the raw inventory fields from MongoDB.
- Compiles a list of currently equipped item JIDs.
- Groups and sorts items by rarity (Mythic > Legendary > Epic > Rare > Uncommon > Common).
- Extracts the slice corresponding to the page requested.

---

### Step 4: Comparing Stats Deltas and Formatting
* **File Path**: [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L197-L238)
* **Line Numbers**: 197-238
* **Called From**: `displayInventory()`
* **Inputs**: Page slice array, current equipped slot structures
* **Outputs**: Formatted bag text

```javascript
    // Stat delta (equipment only, compact)
    if (item.type === 'EQUIPMENT' && !isEquipped && item.stats) {
      const slot = item.slot;
      const equippedInSlot = equipment[slot];
      let statLine = '';
      if (equippedInSlot?.stats) {
        const parts = [];
        for (const s of ['atk', 'def', 'mag', 'hp', 'spd']) {
          const delta = (item.stats[s] || 0) - (equippedInSlot.stats[s] || 0);
          if (delta !== 0) parts.push(`${s.toUpperCase()}${delta > 0 ? '🟢+' : '🔴'}${delta}`);
        }
        if (parts.length) statLine = `  📊 ${parts.join(' ')}\n`;
      } else {
        const parts = Object.entries(item.stats).filter(([,v]) => v).map(([s, v]) => `${s.toUpperCase()}+${v}`);
        if (parts.length) statLine = `  ✨ ${parts.join(' ')}\n`;
      }
      msg += statLine;
    }
```

#### Explanation
- Loops through the page items. If the item is an unequipped equipment piece, checks if the player already has an item active in that slot.
- Computes stat differences: ATK, DEF, MAG, HP, SPD delta. Displays positive stats changes with a green dot `🟢+` and negative values with a red dot `🔴`.
- Assembles page navigation buttons and usage tips.
- Sends the text output directly to the WhatsApp chat thread.

---

## 4. How to Modify
To adjust bag parameters:
- **Change Items Displayed per Page (default 12)**: Modify the constant `ITEMS_PER_PAGE` in [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L166).
- **Edit Rarity Color Schemes / Icons**: Adjust the `ITEM_RARITY` dictionary properties in `core/rpg/inventorySystem.js`.
