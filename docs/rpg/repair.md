# Repair & Durability System Flow (`blacksmith`, `repair`, `inspect`)

## 1. Description
The Durability & Repair system introduces wear and tear on equipped equipment. Weapon durability degrades when players attack, and armor durability degrades when they are struck in combat. Users can check the durability of their gear at the blacksmith using `.j blacksmith`, repair individual items or all gear using `.j repair <slot/index/all>`, and inspect gear using `.j inspect <slot>`. Consumable Repair Kits can also be used directly from the bag.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j blacksmith" or ".j repair main_hand" or ".j inspect armor"
└── core/engine.js
    └── messages.upsert handler
        └── Command detection & prefix check
        ├── Match check: primaryCmd === "blacksmith"
        │   └── core/commands/repairCommands.js
        │       └── displayBlacksmith(sock, chatId, senderJid)
        │           ├── inventorySystem.getEquipment(userId)
        │           ├── economy.getUser(userId)
        │           └── durabilitySystem.getRepairCost(item)
        ├── Match check: primaryCmd === "repair"
        │   └── core/commands/repairCommands.js
        │       └── repair(sock, chatId, senderJid, target)
        │           ├── inventorySystem.getEquipment(userId)
        │           ├── economy.getUser(userId)
        │           ├── durabilitySystem.getRepairCost(item)
        │           ├── economy.removeMoney(userId, cost)
        │           └── durabilitySystem.repairItem(item)
        └── Match check: primaryCmd === "inspect"
            └── core/commands/repairCommands.js
                └── inspectItem(sock, chatId, senderJid, target)
                    ├── inventorySystem.getEquipment(userId)
                    └── durabilitySystem.getConditionMultiplier(item)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: Routes to respective command handlers in `repairCommands.js`

```javascript
// .j blacksmith
if (primaryCmd === "blacksmith") {
  await repairCommands.displayBlacksmith(sock, chatId, senderJid);
  return;
}

// .j repair
if (primaryCmd === "repair") {
  const target = cmdArgs.slice(1).join(" ");
  await repairCommands.repair(sock, chatId, senderJid, target);
  return;
}

// .j inspect
if (primaryCmd === "inspect") {
  const target = cmdArgs.slice(1).join(" ");
  await repairCommands.inspectItem(sock, chatId, senderJid, target);
  return;
}
```

---

### Step 2: Blacksmith Status Display
* **File Path**: [core/commands/repairCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/repairCommands.js)
* **Inputs**: `(sock, chatId, userId)`
* **Outputs**: Broadcasts a formatted menu listing equipped item conditions and repair costs.

```javascript
async function displayBlacksmith(sock, chatId, userId) {
    const equipment = inventorySystem.getEquipment(userId);
    const user = economy.getUser(userId);
    
    let msg = `🔨 *BLACKSMITH REPAIR SERVICE* 🔨\n`;
    msg += `Wallet: 💰 ${getZENI()}${(user.wallet || 0).toLocaleString()}\n\n`;
    // ... iterates over equipment slots to calculate and format individual repair costs ...
```

---

### Step 3: Repair Command Execution
* **File Path**: [core/commands/repairCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/repairCommands.js)
* **Inputs**: `(sock, chatId, userId, target)`
* **Outputs**: Repairs item(s) by deducting Zeni and restoring item durability.

```javascript
async function repair(sock, chatId, userId, target) {
    // Matches target to 'all' or slot name or slot index
    // Validates player wallet
    // Invokes durabilitySystem.repairItem(item)
    // Invokes economy.removeMoney(userId, cost) and saves profile
```

---

### Step 4: Durability Calculations & Penalty Multipliers
* **File Path**: [core/rpg/durabilitySystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/durabilitySystem.js)
* **Inputs**: Item instance object
* **Outputs**: Condition status, wear degradation rate, and stat multipliers.

```javascript
function getConditionMultiplier(item) {
    if (!item || item.durability === undefined) return 1.0;
    const pct = item.durability / (item.maxDurability || 100);
    
    if (pct <= 0) return 0.0;       // Broken gear offers 0 stats
    if (pct < 0.40) return 0.60;    // Severe wear results in 40% penalty
    return 1.0;                     // Minor/Good wear has full effectiveness
}
```

---

## 4. How to Modify / Tune
- **Base Durability & Degradation Rate**: Change the default settings and coefficients in [durabilitySystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/durabilitySystem.js).
- **Synergy Multipliers**: Affinities and wear rate reductions for specific class-weapon combinations are tuned in [weaponSynergy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/weaponSynergy.js).
- **Repair Kit Values**: Modify the restoration rates (+25, +60, +Full) inside [inventorySystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/inventorySystem.js#L737).

---

## 5. Reference Manual

### Wear Logic
* **Weapons (Main hand/Off hand)**: Lose durability on each player attack.
* **Armor Pieces (Armor, Helmet, Boots, Gloves, Cloak)**: Lose durability when players get hit by enemy attacks.
* **Affinities**: Matching a class's optimal weapon reduces wear rate by 50% and raises base stats by 10%.

### Stat Penalty Tiers
* **100% to 40% Durability**: 🟢 / 🟡 Good/Minor Wear. Gear functions at **100%** stats.
* **39% to 1% Durability**: 🟧 Severe Wear. Gear stats are reduced to **60%** effectiveness.
* **0% Durability**: 💔 Broken. Gear is completely broken (**0%** stats).

### Repair Kits
* `repair_kit_basic`: Restores **+25** Durability to selected slot.
* `repair_kit_advanced`: Restores **+60** Durability to selected slot.
* `repair_kit_master`: Restores **Full** Durability to selected slot.
* *Usage:* `.j use <repair_kit_id> <slot>` (e.g. `.j use repair_kit_basic main_hand`).

---

## 6. Noob Readthrough

### Concept 1: Condition Multiplier
Condition multiplier scaling calculates a fractional multiplier based on the ratio between `durability` and `maxDurability`. The stats on items are multiplied by this value before they are added to the player's total stats.

### Concept 2: Array Destructuring and Matching
The commands use `parts = target.split(/\s+/)` to isolate the item (like `repair_kit_basic`) and target slot (like `main_hand`) from a single space-separated user input string.
