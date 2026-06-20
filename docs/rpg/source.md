# Source Command Flow (`source`)

## 1. Description
The Source command tells players how and where to acquire any specific item (ore, drop, or craftable equipment) in the game database.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j source iron_ore"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "source") (L5076)
            └── core/commands/rpgCommands.js
                └── showItemSource(sock, chatId, itemId) (L623)
                    └── craftingSystem.getMiningLocations()
                    └── craftingSystem.getRecipes()
                    └── lootSystem.ITEM_DATABASE lookup
                    └── Search mining locations -> check if ore is in loc.ores list
                    └── Search monster drops -> check lootSystem.LOOT_TABLES / BOSS_DROPS
                    └── Search crafting recipes -> check if item can be crafted/brewed/forged
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5075-L5080)
* **Line Numbers**: 5075-5080
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `cmdArgs`
* **Outputs**: Redirects execution to `rpgCommands.showItemSource`

```javascript
                    // .j source
                    if (primaryCmd === "source") {
                      const item = cmdArgs.slice(1).join(" ");
                      await rpgCommands.showItemSource(sock, chatId, item);
                      return;
                    }
```

#### Explanation
- Catches the `.j source` command.
- Extracts the item ID parameter.
- Routes execution to `rpgCommands.showItemSource`.

---

### Step 3: Global Database Cross-Referencing
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L623-L640)
* **Line Numbers**: 623-640 (and remaining lookup lines)
* **Called From**: `showItemSource()`
* **Inputs**: `(sock, chatId, itemId)`
* **Outputs**: Formatted output detail sheet containing drop tables and crafting recipe stations

```javascript
async function showItemSource(sock, chatId, itemId) { 
    const miningLocs = craftingSystem.getMiningLocations();
    const recipes = craftingSystem.getRecipes();

    if (!itemId) { 
        let msg = `━━━━━━━━━━━━━\n🔍 SOURCES \n┗━━━━━━━━━━━━━\n\n`;
        const categories = { 'Drops': [], 'Mining': [], 'Crafting': [] };
        const db = lootSystem.ITEM_DATABASE;
        Object.keys(db).forEach(id => { 
            for (const loc of Object.values(miningLocs)) if (loc.ores.some(o => o.id === id)) if (!categories['Mining'].includes(`\`${id}\``)) categories['Mining'].push(`\`${id}\``);
            for (const table of Object.values(lootSystem.LOOT_TABLES)) if (table.items.some(i => i.id === id)) if (!categories['Drops'].includes(`\`${id}\``)) categories['Drops'].push(`\`${id}\``);
            for (const boss of Object.values(lootSystem.BOSS_DROPS)) if (boss.guaranteed.some(i => i.id === id) || boss.special.some(i => i.id === id)) if (!categories['Drops'].includes(`\`${id}\``)) categories['Drops'].push(`\`${id}\``);
            if (recipes[id]) if (!categories['Crafting'].includes(`\`${id}\``)) categories['Crafting'].push(`\`${id}\``);
        });
        msg += `💎 *Mining Ores:*\n${categories['Mining'].join(', ')}\n\n👹 *Monster Drops:*\n${categories['Drops'].join(', ')}\n\n🛠️ *Craftables:*\n${categories['Crafting'].join(', ')}\n\n💡 Use \`${getPrefix()} source <id>\` for exact details.`;
        return await sock.sendMessage(chatId, { text: msg });
    }
```

#### Explanation
1. Checks if the `itemId` parameter is provided. If not, aggregates all items in the game database into categories: Ores, Monster Drops, and Craftables, displaying them as a helper list.
2. If `itemId` is provided, loops through:
   - **Mining locations**: Checks if any mine location has this item in its ores list, logging mining rates.
   - **Loot tables**: Checks which monsters drop this item.
   - **Blacksmith/Alchemy recipes**: Checks if the item has an active recipe.
3. Formats these details and prints the sources to WhatsApp.

---

## 4. How to Modify
To adjust item tracking:
- **Configure Item IDs / Names**: Modify items database in `core/rpg/lootSystem.js`.
- **Add Crafting recipes**: Edit recipes inside `core/rpg/craftingSystem.js` to automatically index new item sources.

---

## 5. Reference Manual

> All values below are aggregated from `core/rpg/lootSystem.js`, `core/rpg/craftingSystem.js`, and `core/rpg/inventorySystem.js`. The `.j source` command cross-references all three systems automatically.

---

### Item Source Categories

The `source` command classifies every item into one or more of these source categories:

| Category | Description | Where Configured |
|---|---|---|
| **Mining** | Obtainable from `.j mine` locations | `MINING_LOCATIONS[].ores[]` in `craftingSystem.js` |
| **Monster Drops** | Dropped from enemies and bosses | `LOOT_TABLES` and `BOSS_DROPS` in `lootSystem.js` |
| **Craftable** | Produced via `.j craft`, `.j brew`, `.j cook`, or `.j forge` | `CRAFTING_RECIPES`, `BREWING_RECIPES`, `COOKING_RECIPES` in `craftingSystem.js` |

---

### All Item IDs by Source

#### Mining (obtainable from `.j mine`)
`iron_shard`, `refined_steel`, `sharp_whetstone`, `mana_crystal`, `mythril_ore`, `fire_shard`, `ice_shard`, `lightning_shard`, `rare_gem`, `dark_matter`, `void_crystal`, `legendary_shard`

#### Enemy Drops (COMMON_ENEMY loot table)
`minor_hp_potion`, `healing_herb`, `bandage`, `iron_shard`, `refined_steel`, `tough_leather`, `gunpowder`, `spider_silk`, `minor_enhancement_stone`, `bronze_spear`, `chainmail`

#### Elite Enemy Drops (ELITE_ENEMY loot table)
`hp_potion`, `remedy`, `refined_steel`, `mana_crystal`, `sharp_whetstone`, `fire_shard`, `ice_shard`, `lightning_shard`, `demon_hide`, `ghost_essence`, `mythril_ore`, `rare_enhancement_stone`, `crystal_staff`, `greatsword`

#### Boss Drops (BOSS loot table + BOSS_DROPS)
`mega_potion`, `mythril_ore`, `mana_dew`, `dark_matter`, `dragon_blood`, `ancient_wood`, `mystic_thread`, `boss_essence`, `legendary_enhancement_stone`, `legendary_shard`, `dragon_helm`, `dragon_scale`, `demon_horn`, `golem_core`, `wyrm_fang`, `void_essence`, `mirror_essence`, `lich_phylactery`, `dragon_heart`, `infernal_crown`, `titan_heart`, `elder_blood`

#### Special Boss IDs (for BOSS_DROPS lookup)
`INFECTED_COLOSSUS`, `CORRUPTED_GUARDIAN`, `ELEMENTAL_ARCHON`, `VOID_CORRUPTED`, `PRIMORDIAL_CHAOS`, `LICH`, `DRAGON`, `DEMON_LORD`, `ANCIENT_GOLEM`, `VOID_HORROR`, `ELDER_WYRM`

---

### How to Make an Item Discoverable via `.j source`

An item appears in `.j source` output automatically as long as it is registered in at least one of:
- `ITEM_DATABASE` in `lootSystem.js`
- `LOOT_TABLES` or `BOSS_DROPS` in `lootSystem.js`
- `MINING_LOCATIONS[].ores[]` in `craftingSystem.js`
- `CRAFTING_RECIPES`, `BREWING_RECIPES`, or `COOKING_RECIPES` in `craftingSystem.js`

No additional registration is required in `rpgCommands.js`.
