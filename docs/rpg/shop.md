# Shop Commands Flow (`shop` / `buy`)

## 1. Description
The `shop` and `buy` commands provide a marketplace where players can spend Zeni to purchase class items, equipment, consumables, or special keys (like the `dragon_key`). The system displays items organized by categories, validates JID registration, checks Zeni balances, verifies specific level/class lineage gates, and modifies player cash caches and inventory bags on successful transactions.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🏪 SHOP DISPLAY: User sends ".j shop equipment"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check: primaryCmd === "shop" (L4646)
            └── core/commands/shopCommands.js
                └── displayShop(sock, chatId, category) (L24)
                    ├── Fetch classSystem.CLASS_SHOP_ITEMS & lootSystem.ITEM_DATABASE
                    ├── Filter buyable items by category (e.g. "equipment")
                    └── sock.sendMessage(chatId, { text: shopMenuText })

======================================================
💳 ITEM PURCHASE: User sends ".j buy iron_sword" or ".j buy 3"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: primaryCmd === "buy" (L4679)
            └── core/commands/shopCommands.js
                └── buyItem(sock, chatId, senderJid, input) (L101)
                    ├── Resolve item by ID, Name, or index number
                    ├── Validate fighter lineage gate if buying "dragon_key"
                    ├── economy.getBalance(senderJid) -> check cost comparison
                    ├── Execute handler depending on item.type:
                    │   ├── "EQUIPMENT" -> handleEquipment(senderJid, item)
                    │   └── "CONSUMABLE" -> handleConsumable(senderJid, item)
                    ├── economy.removeMoney(senderJid, item.cost) [if success]
                    └── sock.sendMessage(chatId, { text: receiptMsg })
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
- Baileys socket processes incoming network message packets, filters non-message triggers, and passes processing to the bot parsing cycle.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4645-L4686)
* **Line Numbers**: 4645-4686
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `cmdArgs`
* **Outputs**: Calls `shopCommands.displayShop` or `shopCommands.buyItem`

```javascript
                    // .j shop
                    if (primaryCmd === "shop") {
                      const category = cmdArgs[1] || "all";
                      await shopCommands.displayShop(sock, chatId, category);
                      return;
                    }

                    // .j buy
                    if (
                      primaryCmd === "buy" ||
                      primaryCmd === "purchase" ||
                      primaryCmd === "buyitem"
                    ) {
                      const input = cmdArgs.slice(1).join(" ");
                      await shopCommands.buyItem(
                        sock,
                        chatId,
                        senderJid,
                        input,
                      );
                      return;
                    }
```

#### Explanation
- Detects the `.j shop` or `.j buy` triggers.
- Pulls categories (e.g. `equipment`, `quest`) or item identifier names/indices.
- Routes execution respectively to `displayShop` or `buyItem` within `shopCommands.js`.

---

### Step 3: Item Processing & Lineage Gates Verification
* **File Path**: [core/commands/shopCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/shopCommands.js#L101-L174)
* **Line Numbers**: 101-174
* **Called From**: `buyItem()`
* **Inputs**: `(sock, chatId, senderJid, input)`
* **Outputs**: Matches item object, checks fighter lineage constraints and balance

```javascript
    // Build combined item list (from CLASS_SHOP_ITEMS and ITEM_DATABASE)...
    const sanitizedInput = input.toLowerCase().trim().replace(/ /g, '_');
    let item = allItems[sanitizedInput];
    
    // Fallbacks to find item by Name, ID format, or numeric list index...
    if (!item && !isNaN(parseInt(input))) {
        const index = parseInt(input) - 1;
        if (index >= 0 && index < allItemsList.length) item = allItemsList[index];
    }
    
    if (!item) {
        await sock.sendMessage(chatId, { text: `❌ Item not found!` });
        return;
    }
    
    const itemId = item.id;
    // Lineage Restriction for Dragon Key
    if (itemId === 'dragon_key') {
        const currentClass = economy.getUserClass(senderJid);
        if (!classSystem.isFighterLineage(currentClass?.id)) {
            return sock.sendMessage(chatId, { text: `❌ *DRAGON HUNTER LINEAGE REQUIRED*\n\nOnly members of the *Fighter* lineage can purchase this key.` });
        }
    }

    // Check balance
    const balance = economy.getBalance(senderJid);
    if (balance < item.cost) {
        await sock.sendMessage(chatId, { text: `❌ Insufficient funds!` });
        return;
    }
```

#### Explanation
1. Combines class-exclusive assets with the core items catalogue.
2. Applies match fallbacks: ID matching (removing underscores), name matching (case-insensitive alphanumeric regex), or index number.
3. Checks specialized item restrictions, e.g. checking whether a buyer's class class ID matches the Fighter lineage tree before letting them purchase a `dragon_key`.
4. Queries wallet balances via `economy.getBalance()`.

---

### Step 4: Invoking Type Handler & Balance Deduction
* **File Path**: [core/commands/shopCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/shopCommands.js#L175-L215)
* **Line Numbers**: 175-215
* **Called From**: `buyItem()`
* **Inputs**: Sender JID, target item metadata
* **Outputs**: Delivers items via inventory updates and deducts Zeni funds

```javascript
    let result;
    switch (item.type) {
        case 'EQUIPMENT':
            result = await handleEquipment(senderJid, item);
            break;
        case 'CONSUMABLE':
        case 'SPECIAL_KEY':
            result = await handleConsumable(senderJid, item);
            break;
        // ... (other cases like CLASS_CHANGE, EVOLUTION, RESET, STAT_BOOST)
    }
    
    if (result.success) {
        economy.removeMoney(senderJid, item.cost);
        await sock.sendMessage(chatId, {
            text: `✅ *PURCHASE SUCCESSFUL!*\n\n${result.message}\n\n💸 Paid: ${getZENI()}${item.cost.toLocaleString()}`
        });
    } else {
        await sock.sendMessage(chatId, { text: result.message });
    }
```

#### Explanation
1. Directs the item details to specialized storage handlers (e.g. `handleEquipment` uses `inventorySystem.addItem`).
2. Deducts the purchase cost from the player's wallet balance cache (`economy.removeMoney()`) only if the item addition was successful.
3. Outputs a formatted receipt confirmation.

---

## 4. How to Modify
- **Add Shop Items**: Modify items inside `ITEM_DATABASE` within [core/rpg/lootSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/lootSystem.js) or `CLASS_SHOP_ITEMS` inside [core/rpg/classSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/classSystem.js).
- **Edit Dragon Key Lineage Limits**: Adjust class permissions in [core/commands/shopCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/shopCommands.js#L161).
- **Change Shop Categories**: Edit the `categoryInfo` object inside [core/commands/shopCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/shopCommands.js#L49).
