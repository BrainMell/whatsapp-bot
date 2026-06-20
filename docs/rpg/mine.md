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

### How to Add a New Mining Location
To configure a new mining zone with specific level/rank requirements and ore pools:
1. Open [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js).
2. Locate the `MINING_LOCATIONS` dictionary and add your location object:
   ```javascript
   'crystal_depths': {
       name: 'Crystal Depths',
       id: 'crystal_depths',
       desc: 'A cavern glowing with rich magical crystalline deposits.',
       req: { level: 20, rank: 'C', miningLevel: 10 }, // Requirements to enter
       energyCost: 30, // Energy cost per command run
       ores: [
           { id: 'silver_ore', weight: 45, min: 2, max: 4 },
           { id: 'mana_crystal', weight: 35, min: 1, max: 3 },
           { id: 'mythril_ore', weight: 20, min: 1, max: 2 }
       ]
   }
   ```
3. Save changes. The mining system automatically processes the drop weights when players use `.j mine crystal_depths`.

---

### How to Register a New Ore / Adjust Drop Weight Distributions
If you want to introduce a new mineable resource or balance existing drop rates:
1. **Register the Ore**:
   * Open [core/rpg/lootSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js).
   * Register the new item in `ITEM_DATABASE` with `type: 'MATERIAL'`:
     ```javascript
     'sapphire_gem': { 
         name: '🔷 Sapphire Gem', 
         description: 'A beautiful blue gemstone, prized for magic gear crafting.', 
         rarity: 'RARE', 
         value: 2000, 
         type: 'MATERIAL' 
     }
     ```
2. **Add to Mining Ore Pool**:
   * Open [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js).
   * Add the item to the `ores` array of your target location:
     ```javascript
     { id: 'sapphire_gem', weight: 15, min: 1, max: 1 }
     ```
   * **Note on Weights**: The mining algorithm sums up all weights in a location's ore pool (e.g. `45 + 35 + 20 = 100` or `20 + 40 + 25 + 15 = 100`). The chance for a specific ore dropping on a roll is:
     $$\text{Drop Chance} = \frac{\text{Ore Weight}}{\text{Total Location Weight}}$$
     Adjust individual weights to increase/decrease rarity.

---

### How to Adjust System-Wide Mining Metrics
* **Change Mining Level XP Gain Formula**: Locate the experience calculation inside [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L575):
  ```javascript
  // Change base XP or the scaling factor
  const mineXp = Math.floor(Math.random() * 6) + 5; // e.g. 5-10 mining XP per mine run
  ```
* **Adjust Lucky Zeni Pouch Drop Chance**: Locate the check in [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L595):
  ```javascript
  if (Math.random() < 0.02) { // 0.02 is 2%. Increase to 0.05 for 5%.
  ```

---

## 5. Reference Manual

> All values below are extracted directly from `core/rpg/craftingSystem.js` and `core/rpg/lootSystem.js`. A contributor should never need to open those files to add or modify mining locations.

---

### Mining Location Schema

Each location in `MINING_LOCATIONS` (in `core/rpg/craftingSystem.js`) accepts these fields:

```javascript
'location_id': {
    name: 'Display Name',
    id: 'location_id',                  // Must match the key
    desc: 'Description shown to player.',
    req: {
        level: 1,                        // Minimum player level
        rank: 'F',                       // Minimum adventurer rank (see rank table)
        miningLevel: 1                   // Minimum mining profession level
    },
    energyCost: 15,                      // Base energy cost (reduced by miningLevel/2)
    ores: [
        { id: 'item_id', weight: 50, min: 1, max: 3 }
        // weight is relative — higher = more common
    ]
}
```

---

### Adventurer Rank Order

Valid values for `req.rank` from lowest to highest:

`F` → `E` → `D` → `C` → `B` → `A` → `S` → `SS` → `SSS` → `GOD`

---

### All Mining Location IDs

Use these IDs with `.j mine <location_id>`:

| Location ID | Name | Level Req | Rank Req | Mining Lvl Req | Energy Cost |
|---|---|---|---|---|---|
| `iron_quarry` | Iron Quarry | 1 | F | 1 | 15 |
| `silver_mine` | Silver Mine | 10 | E | 5 | 20 |
| `crystal_cavern` | Crystal Cavern | 20 | D | 10 | 25 |
| `mythril_depths` | Mythril Depths | 35 | C | 20 | 30 |
| `dragon_lair_mine` | Dragon Lair Mine | 50 | B | 35 | 40 |
| `shimmering_caves` | Shimmering Caves | 5 | F | 3 | 18 |

> **Note**: The exact list depends on the live `MINING_LOCATIONS` object. Use `.j mine` with no arguments to see all available locations and their current requirements.

---

### All Mineable Item IDs

These are `MATERIAL` type items that can appear in mining location ore pools:

| Item ID | Name | Rarity |
|---|---|---|
| `iron_shard` | Iron Shard | COMMON |
| `refined_steel` | Refined Steel | UNCOMMON |
| `sharp_whetstone` | Sharp Whetstone | UNCOMMON |
| `mana_crystal` | Mana Crystal | RARE |
| `mythril_ore` | Mythril Ore | RARE |
| `fire_shard` | Fire Shard | RARE |
| `ice_shard` | Ice Shard | RARE |
| `lightning_shard` | Lightning Shard | RARE |
| `rare_gem` | Rare Gem | RARE |
| `dark_matter` | Dark Matter | EPIC |
| `void_crystal` | Void Crystal | EPIC |
| `legendary_shard` | Legendary Shard | LEGENDARY |

> Any item registered in `ITEM_DATABASE` with `type: 'MATERIAL'` can be added to a mining ore pool.

---

### Drop Rate Formula

On each `.j mine` run, the system performs this many rolls:

```
baseRolls  = 2 + floor(miningLevel / 10)
bonusRolls = floor(luck / 15)
totalRolls = baseRolls + bonusRolls
```

Each roll picks an ore using weighted random selection:
```
drop_chance = ore.weight / sum_of_all_weights_in_location
```

Each roll also has a **2% chance** to find a lucky Zeni pouch (100–600 Zeni).

---

### Energy Cost Formula

```
effectiveCost = Math.max(5, location.energyCost - floor(miningLevel / 2))
```

The minimum energy cost is always **5**, regardless of mining level.

---

### Mining XP

Each successful mine run awards `5–10` mining profession XP (random in that range). Mining level increases unlock more base rolls and reduce energy cost.
