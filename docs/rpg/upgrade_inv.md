# Upgrade Inventory Command Flow (`upgrade inv`)

## 1. Description
The `upgrade inv` command allows players to spend Zeni to purchase additional storage slots for their equipment inventory bag. The slot capacity upgrades scale in cost progressively, validating wallet funds and updating cache configurations before writing to the database.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j upgrade inv" or ".j upgrade inventory"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check (L7114-7120)
            └── core/commands/rpgCommands.js
                └── upgradeInventory(sock, chatId, senderJid) (L372)
                    ├── core/rpg/inventorySystem.js
                    │   └── upgradeInventory(senderJid) (L259)
                    │       ├── economy.getUser(userId) -> verify existence
                    │       ├── check max slots: currentSlots >= MAX_SLOTS (L265)
                    │       ├── Calculate cost: cost = Math.floor(base * Math.pow(scaling, upgrades)) (L274)
                    │       ├── check user.wallet < cost
                    │       ├── removeMoney(userId, cost)
                    │       ├── increment slots: user.inventorySlots = newSlots
                    │       └── economy.saveUser(userId)
                    └── sock.sendMessage(chatId, { text: successReceipt })
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
- Receives message updates from WhatsApp events.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7114-L7122)
* **Line Numbers**: 7114-7122
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Calls `rpgCommands.upgradeInventory`

```javascript
                  // .j upgrade inv - Upgrade inventory
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} upgrade inv` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} upgrade inventory`
                  ) {
                    await rpgCommands.upgradeInventory(sock, chatId, senderJid);
                    return;
                  }
```

#### Explanation
- Catches the `.j upgrade inv` or `.j upgrade inventory` command patterns and invokes `upgradeInventory`.

---

### Step 3: Wrapper Dispatch & Response Message
* **File Path**: [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L372-L386)
* **Line Numbers**: 372-386
* **Called From**: `upgradeInventory()`
* **Inputs**: `(sock, chatId, senderJid)`
* **Outputs**: Formats receipt and sends text response

```javascript
async function upgradeInventory(sock, chatId, senderJid) { 
    const result = inventorySystem.upgradeInventory(senderJid);
    
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    let msg = `✨ BAG+ ✨\n\n`;
    msg += `💰 Cost: ${getCurrency().symbol}${result.cost.toLocaleString()}\n`;
    msg += `📦 Slots: ${result.oldSlots} → ${result.newSlots}\n`;
    msg += `🎁 Gained: +${result.slotsGained} slots`;
    
    await sock.sendMessage(chatId, { text: msg });
}
```

#### Explanation
- Directs processing to `inventorySystem.upgradeInventory()`.
- Captures status code; if failed (insufficient Zeni or maximum capacity hit), returns errors.
- If successful, formats and returns receipt metrics.

---

### Step 4: Core Slot Upgrade Math
* **File Path**: [core/rpg/inventorySystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/inventorySystem.js#L259-L295)
* **Line Numbers**: 259-295
* **Called From**: `inventorySystem.upgradeInventory()`
* **Inputs**: `(userId)`
* **Outputs**: `{ success: boolean, cost: number, oldSlots: number, newSlots: number, slotsGained: number }`

```javascript
function upgradeInventory(userId) {
    const user = economy.getUser(userId);
    if (!user) return { success: false, message: 'User not found' };
    
    const currentSlots = getInventorySlots(userId);
    
    if (currentSlots >= INVENTORY_CONFIG.MAX_SLOTS) {
        return {
            success: false,
            message: `❌ Inventory already at maximum size (${INVENTORY_CONFIG.MAX_SLOTS} slots)!`
        };
    }
    
    // Calculate upgrade cost
    const upgradesApplied = (currentSlots - INVENTORY_CONFIG.BASE_SLOTS) / INVENTORY_CONFIG.SLOTS_PER_UPGRADE;
    const cost = Math.floor(INVENTORY_CONFIG.UPGRADE_COST_BASE * Math.pow(INVENTORY_CONFIG.UPGRADE_COST_SCALING, upgradesApplied));
    
    if (user.wallet < cost) {
        return {
            success: false,
            message: `❌ Not enough Zeni! Need: ${cost}, Have: ${user.wallet}`
        };
    }
    
    // Apply upgrade
    economy.removeMoney(userId, cost);
    user.inventorySlots = Math.min(currentSlots + INVENTORY_CONFIG.SLOTS_PER_UPGRADE, INVENTORY_CONFIG.MAX_SLOTS);
    economy.saveUser(userId);
    
    return {
        success: true,
        cost,
        oldSlots: currentSlots,
        newSlots: user.inventorySlots,
        slotsGained: INVENTORY_CONFIG.SLOTS_PER_UPGRADE
    };
}
```

#### Explanation
1. Checks user existence and queries current capacity via `getInventorySlots()`.
2. Verifies limits against `MAX_SLOTS` (default is 100).
3. Computes upgrades count: `(current - base) / slots_per_upgrade`.
4. Calculates exponential cost scaling: `cost_base * Math.pow(cost_scaling, upgradesApplied)`.
5. Compares balance, deducts money via `economy.removeMoney()`, increments `inventorySlots` property, schedules DB sync via `economy.saveUser()`, and returns transaction metrics.

---

## 4. How to Modify
- **Modify Max Slots**: Change the `MAX_SLOTS` constant value (currently 100) inside [core/rpg/inventorySystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/inventorySystem.js).
- **Adjust Base Slots & Step Scale**: Edit `BASE_SLOTS` or `SLOTS_PER_UPGRADE` values inside `INVENTORY_CONFIG` inside [core/rpg/inventorySystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/inventorySystem.js#L14).
- **Edit Upgrade Cost Scaling**: Modify `UPGRADE_COST_BASE` or `UPGRADE_COST_SCALING` settings within `INVENTORY_CONFIG`.
