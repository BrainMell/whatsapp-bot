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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4645-L4686)
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
* **File Path**: [core/commands/shopCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/shopCommands.js#L101-L174)
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
* **File Path**: [core/commands/shopCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/shopCommands.js#L175-L215)
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
- **Add Shop Items**: Modify items inside `ITEM_DATABASE` within [core/rpg/lootSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js) or `CLASS_SHOP_ITEMS` inside [core/rpg/classSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/classSystem.js).
- **Edit Dragon Key Lineage Limits**: Adjust class permissions in [core/commands/shopCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/shopCommands.js#L161).
- **Change Shop Categories**: Edit the `categoryInfo` object inside [core/commands/shopCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/shopCommands.js#L49).

---

## 5. Reference Manual

> All values below are extracted directly from `core/rpg/classSystem.js` and `core/rpg/lootSystem.js`. A contributor should never need to open those files to add or modify shop items.

---

### Shop Categories

| Category Keyword | Description |
|---|---|
| `all` | Displays all purchasable items |
| `equipment` | Weapons, armour, accessories |
| `consumables` | Potions and single-use items |
| `class` | Class evolution, change, and reset items |
| `special` | Gated/rare items (e.g. dragon_key) |

**Usage**: `.j shop equipment`, `.j shop class`, `.j shop all`

---

### CLASS_SHOP_ITEMS (from `classSystem.js`)

These items are available in the shop and drive class progression:

| Item ID | Name | Cost | Type | Effect |
|---|---|---|---|---|
| `class_change_ticket` | Class Change Ticket | 400 Zeni | CLASS_CHANGE | Rerolls starter class to a random one |
| `evolution_stone` | Evolution Stone (T2) | 8,000 Zeni | EVOLUTION | Evolves Starter → Evolved class |
| `ascension_stone` | Ascension Stone (T3) | 50,000 Zeni | ASCENSION | Ascends Evolved → Ascended class |
| `skill_reset` | Skill Reset Scroll | 1,000 Zeni | RESET | Refunds all invested skill points |

---

### Special-Gated Items

| Item ID | Name | Gate Requirement |
|---|---|---|
| `dragon_key` | Dragon Key | Fighter class lineage only |

---

### Purchasable Equipment Items (from `lootSystem.ITEM_DATABASE`)

Items with `type: 'EQUIPMENT'` available via shop:

| Item ID | Name | Rarity | Value (sell price) |
|---|---|---|---|
| `rusty_dagger` | Rusted Dagger | COMMON | 1,000 |
| `bronze_spear` | Bronze Spear | COMMON | 1,200 |
| `leather_tunic` | Leather Tunic | COMMON | 1,600 |
| `wooden_ring` | Wooden Ring | COMMON | 500 |
| `crystal_staff` | Crystal Staff | UNCOMMON | 3,000 |
| `iron_sword` | Iron Sword | UNCOMMON | 5,000 |
| `chainmail` | Chainmail | UNCOMMON | 2,500 |
| `iron_plate` | Iron Plate | UNCOMMON | 4,500 |
| `mage_robe` | Novice Robe | UNCOMMON | 4,800 |
| `iron_ring` | Iron Ring | UNCOMMON | 2,000 |
| `arcane_wand` | Arcane Wand | RARE | 6,000 |
| `greatsword` | Greatsword | RARE | 6,000 |
| `steel_sabre` | Steel Sabre | RARE | 16,000 |

---

### Consumable / Potion Items (from `lootSystem.ITEM_DATABASE`)

| Item ID | Name | Value | Effect |
|---|---|---|---|
| `minor_hp_potion` | Minor HP Potion | 200 | heal |
| `minor_potion` | Minor Health Potion | 280 | heal |
| `health_potion` | Health Potion | 700 | heal |
| `hp_potion` | Health Potion (alt) | 700 | heal |
| `major_potion` | Major Health Potion | 1,680 | heal |
| `mega_potion` | Mega Potion | 1,680 | heal |
| `elixir` | Full Restore Elixir | 4,200 | heal |
| `remedy` | Remedy | 500 | cure_status |
| `regen_salve` | Regeneration Salve | 1,120 | regen |
| `mana_potion` | Mana Potion | 400 | restore_energy |
| `energy_drink` | Energy Drink | 400 | restore_energy |
| `ether` | Ether | 1,000 | restore_energy |
| `phoenix_down` | Phoenix Down | 3,500 | revive |
| `phoenix_feather` | Phoenix Feather | 3,500 | revive |
| `smoke_bomb` | Smoke Bomb | 500 | flee |
| `bomb` | Bomb | 1,000 | damage_aoe |

---

### How to Add a New Shop Item

To add a new item to the shop, register it in `ITEM_DATABASE` in `core/rpg/lootSystem.js`:

```javascript
'my_new_item': {
    name: '✨ My New Item',
    description: 'What this item does.',
    rarity: 'UNCOMMON',   // COMMON | UNCOMMON | RARE | EPIC | LEGENDARY | MYTHIC
    value: 2000,          // Base sell price in Zeni
    type: 'EQUIPMENT',    // EQUIPMENT | POTION | MATERIAL | ITEM
    slot: 'main_hand',    // Required only for EQUIPMENT items
    stats: { attack: 10, defense: 0, speed: 0, magic: 0, luck: 0 }
}
```

> Class-exclusive shop items (class change, evolution, ascension, reset) are defined in `CLASS_SHOP_ITEMS` in `core/rpg/classSystem.js` instead.
