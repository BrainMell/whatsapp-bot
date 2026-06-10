# Mine Command Flow (`mine`)

## 1. Description
The Mine command allows players to spend Energy to harvest ores, gems, and items from different geographical mining locations. Access is gated by player level, adventurer rank, and profession level.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j mine shimmering_caves"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "mine") (L5126)
            └── core/commands/rpgCommands.js
                └── mineOre(sock, chatId, senderJid, locationId) (L531)
                    └── progression.getCharacterSheet(senderJid)
                    └── craftingSystem.getMiningLocations()
                    └── Check location constraints (Level, Rank, Mining Level)
                    └── Verify energyCost: Math.max(5, energyCost - level/2) (L569)
                    └── Deduct user energy and add profession XP (L576)
                    └── Roll rewards: baseRolls (level-based) + bonusRolls (luck-based) (L587)
                    └── Loop rolls -> Math.random() < 0.02 for lucky Zeni pouch
                    └── add ores: inventorySystem.addItem(senderJid, ore.id, qty) (L605)
                    └── Check profession level up
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: msg }) (L616)
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
- Listens to incoming messages from Baileys. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5120-L5130)
* **Line Numbers**: 5120-5130
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `cmdArgs`
* **Outputs**: Redirects execution to `rpgCommands.mineOre`

```javascript
                    // .j mine
                    if (primaryCmd === "mine") {
                      const item = cmdArgs.slice(1).join(" ");
                      await rpgCommands.mineOre(
                        sock,
                        chatId,
                        senderJid,
                        item,
                      );
                      return;
                    }
```

#### Explanation
- Catches the `.j mine` command.
- Extracts the mining location ID parameter.
- Routes execution to `rpgCommands.mineOre`.

---

### Step 3: Location Access and Energy Verification
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L531-L574)
* **Line Numbers**: 531-574
* **Called From**: `mineOre()`
* **Inputs**: `(sock, chatId, senderJid, locationId)`
* **Outputs**: Asserts energy requirements and location gates, deducts energy

```javascript
    const loc = locations[locationId.toLowerCase()];
    if (!loc) return await sock.sendMessage(chatId, { text: `❌ Invalid location!` });

    const rankOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const userRankIdx = rankOrder.indexOf(sheet.adventurerRank);
    const reqRankIdx = rankOrder.indexOf(loc.req.rank);
    const miningLevelReq = loc.req.miningLevel || 1;

    if (sheet.level < loc.req.level || userRankIdx < reqRankIdx || miningLevel < miningLevelReq) { 
        return await sock.sendMessage(chatId, { text: `❌ *LOCATION LOCKED*` });
    }

    const user = economy.getUser(senderJid);
    const energyCost = Math.max(5, loc.energyCost - Math.floor(miningLevel/2));
    const currentEnergy = user.energy !== undefined ? user.energy : 100;

    if (currentEnergy < energyCost) return await sock.sendMessage(chatId, { text: `❌ Not enough energy! Need ${energyCost}, have ${currentEnergy}.` });

    user.energy = Math.max(0, currentEnergy - energyCost);
```

#### Explanation
- Checks if the user has unlocked the location based on level, rank, and mining level.
- Computes energy cost scaled down by the user's mining level (`energyCost - level/2`).
- Deducts the energy from the user's document cache.

---

### Step 4: Gathering Loot Rolls and Additions
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L585-L616)
* **Line Numbers**: 585-616
* **Called From**: `mineOre()`
* **Inputs**: Luck stat and rolls
* **Outputs**: Adds harvested ores to user's bag, adds mining XP, and replies

```javascript
    const luck = sheet.stats.luck || 5;
    const baseRolls = 2 + Math.floor(miningLevel / 10);
    const bonusRolls = Math.floor(luck / 15); 
    const totalRolls = baseRolls + bonusRolls;
    const found = {};
    const totalWeight = loc.ores.reduce((s, o) => s + o.weight, 0);
    let luckyFinds = 0;

    for (let i = 0; i < totalRolls; i++) { 
        if (Math.random() < 0.02) { 
            const foundZeni = Math.floor(Math.random() * 500) + 100;
            economy.addMoney(senderJid, foundZeni, "Mining Lucky Find");
            luckyFinds += foundZeni;
        }
        let roll = Math.random() * totalWeight;
        for (const ore of loc.ores) { 
            roll -= ore.weight;
            if (roll <= 0) { 
                const qty = ore.quantity || (Math.floor(Math.random() * (ore.max - ore.min + 1)) + ore.min);
                await inventorySystem.addItem(senderJid, ore.id, qty);
                found[ore.id] = (found[ore.id] || 0) + qty;
                break;
            }
        }
    }
```

#### Explanation
1. Computes harvest roll capacity: base rolls + luck-based bonus rolls.
2. Performs rolls against the location's ores weight distributions.
3. Drops items and adds them to `inventorySystem.addItem`.
4. Checks a 2% chance per roll for finding a lucky Zeni pouch.
5. Saves changes to MongoDB and dispatches a success message listing harvested items and level progression statuses.

---

## 4. How to Modify
To adjust mining configurations:
- **Add Mining Locations**: Edit `MINING_LOCATIONS` object definition in `core/rpg/craftingSystem.js`.
- **Change Mining Level XP Gain**: Edit the formula in [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L575).
- **Adjust Lucky Zeni pouch drop rate**: Change `0.02` (2%) in [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L595).
