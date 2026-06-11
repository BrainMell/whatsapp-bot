# RPG Subsystem: Loot Generation & Distribution

## What it is
The Loot Subsystem controls the generation and distribution of items and gold within the RPG game loop. Whenever combat encounters, boss fights, puzzles, or random events conclude successfully, the system determines appropriate drops using weighted drop tables and applies difficulty multipliers. Gold drops are dynamically split among active party members, and item drops are randomly assigned to individual players before being directly inserted into their inventory collection stored in MongoDB.

## How it works

**Gold Drop Randomization** — [lootSystem.js L464–492](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js#L464-L492)
```javascript
function generateGoldDrop(encounterType, difficulty = 1.0) {
    let range = GOLD_RANGES.COMMON_ENEMY;
    
    switch (encounterType) {
        case 'ELITE_COMBAT':
            range = GOLD_RANGES.ELITE_ENEMY;
            break;
        case 'BOSS':
            range = GOLD_RANGES.BOSS;
            break;
        case 'TREASURE':
            range = GOLD_RANGES.TREASURE;
            break;
        case 'TRAP':
            range = GOLD_RANGES.TRAP_SUCCESS;
            break;
        case 'PUZZLE':
            range = GOLD_RANGES.PUZZLE_SUCCESS;
            break;
        case 'MERCHANT':
            range = GOLD_RANGES.MERCHANT_BONUS;
            break;
    }
    
    const [min, max] = range;
    const baseGold = Math.floor(Math.random() * (max - min + 1)) + min;
    
    return Math.floor(baseGold * difficulty);
}
```
This function maps the incoming encounter type to its respective gold drop configuration in the `GOLD_RANGES` map. A random integer is rolled between the defined min and max boundaries, which is then scaled by the difficulty factor and returned.

---

**Party Loot Distribution** — [lootSystem.js L494–558](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js#L494-L558)
```javascript
async function distributeLoot(players, encounterType, enemyName = null, difficulty = 1.0, overrideGold = null) {
    const inventorySystem = require('./inventorySystem');
    const results = {
        items: [],
        gold: 0,
        goldPerPlayer: 0,
        announcements: []
    };

    if (!players || players.length === 0) return results;

    const loot = generateLoot(encounterType, enemyName, difficulty);
    const goldDrop = overrideGold !== null ? overrideGold : generateGoldDrop(encounterType, difficulty);
    
    const goldPerPlayer = Math.floor(goldDrop / Math.max(1, players.length));

    results.gold = goldDrop;
    results.goldPerPlayer = goldPerPlayer;
    
    for (const drop of loot) {
        const itemInfo = getItemInfo(drop.id);
        
        if (drop.announcement) {
            results.announcements.push(drop.announcement);
        }
        
        const luckyPlayer = players[Math.floor(Math.random() * players.length)];
        
        const addResult = await inventorySystem.addItem(
            luckyPlayer.jid,
            drop.id,
            drop.quantity,
            {
                name: itemInfo.name,
                rarity: drop.rarity || itemInfo.rarity,
                type: itemInfo.type || (drop.id.includes('fish') || drop.id.includes('hide') ? 'MATERIAL' : 'ITEM'),
                value: itemInfo.value || drop.value || 100,
                stats: itemInfo.stats,
                slot: itemInfo.slot,
                source: drop.source || encounterType,
                acquiredAt: Date.now()
            }
        );
        
        if (addResult.success) {
            results.items.push({
                playerId: luckyPlayer.jid,
                playerName: luckyPlayer.name,
                id: drop.id,
                name: itemInfo.name,
                quantity: drop.quantity,
                rarity: drop.rarity
            });
        }
    }

    if (goldPerPlayer > 0) {
        for (const player of players) {
            const economy = require('./economy');
            economy.addMoney(player.jid, goldPerPlayer);
        }
    }
    
    return results;
}
```
This controller distributes generated drops and gold to players in a party. It splits gold evenly, queries item details, assigns each drop to a randomly chosen player, and invokes the `inventorySystem` to write the reward objects into MongoDB collections.

---

**Item Database Query Fallback** — [lootSystem.js L671–679](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js#L671-L679)
```javascript
function getItemInfo(itemId) {
    return ITEM_DATABASE[itemId] || {
        name: itemId,
        description: 'Unknown item',
        rarity: 'COMMON',
        value: 10,
        type: 'ITEM'
    };
}
```
This helper method retrieves metadata from the local database map `ITEM_DATABASE` for a given item key. If the lookup returns undefined, a fallback object is returned to prevent script errors.

## How to modify it

### Tuning Gold Drop Ranges
To increase or decrease the gold amounts awarded by different encounters, modify the values in the `GOLD_RANGES` registry inside `core/rpg/lootSystem.js`.

**Before (core/rpg/lootSystem.js L254–262):**
```javascript
const GOLD_RANGES = {
    COMMON_ENEMY: [10, 30],
    ELITE_ENEMY: [50, 100],
    BOSS: [200, 500],
    TRAP_SUCCESS: [20, 50],
    PUZZLE_SUCCESS: [50, 150],
    TREASURE: [100, 300],
    MERCHANT_BONUS: [50, 200]
};
```

**After (core/rpg/lootSystem.js L254–262):**
```javascript
const GOLD_RANGES = {
    COMMON_ENEMY: [15, 45], // Increased rewards
    ELITE_ENEMY: [75, 150],  // Increased rewards
    BOSS: [500, 1200],       // Significantly boosted boss rewards
    TRAP_SUCCESS: [20, 50],
    PUZZLE_SUCCESS: [100, 250], // Boosted puzzle rewards
    TREASURE: [200, 500],
    MERCHANT_BONUS: [50, 200]
};
```

### Adding Items to the Common Loot Table
To adjust the drops generated from common enemies, add new entries to the `LOOT_TABLES.COMMON_ENEMY.items` array.

**Before (core/rpg/lootSystem.js L21–36):**
```javascript
    COMMON_ENEMY: {
        dropChance: 45,
        items: [
            { id: 'minor_hp_potion', weight: 30, quantity: [1, 2] },
            { id: 'bandage', weight: 20, quantity: [1, 2] },
            { id: 'healing_herb', weight: 25, quantity: [1, 3] },
            { id: 'refined_steel', weight: 10, quantity: [1, 1] },
            { id: 'tough_leather', weight: 10, quantity: [1, 1] },
            { id: 'gunpowder', weight: 10, quantity: [1, 2] },
            { id: 'spider_silk', weight: 10, quantity: [1, 2] },
            { id: 'iron_shard', weight: 15, quantity: [1, 3] },
            { id: 'minor_enhancement_stone', weight: 5, quantity: [1, 1] },
            { id: 'equipment_piece', weight: 5, quantity: [1, 1] },
            { id: 'bronze_spear', weight: 5, quantity: [1, 1] },
            { id: 'chainmail', weight: 5, quantity: [1, 1] },
        ]
    },
```

**After (core/rpg/lootSystem.js L21–36):**
```javascript
    COMMON_ENEMY: {
        dropChance: 45,
        items: [
            { id: 'minor_hp_potion', weight: 30, quantity: [1, 2] },
            { id: 'bandage', weight: 20, quantity: [1, 2] },
            { id: 'healing_herb', weight: 25, quantity: [1, 3] },
            { id: 'refined_steel', weight: 10, quantity: [1, 1] },
            { id: 'tough_leather', weight: 10, quantity: [1, 1] },
            { id: 'gunpowder', weight: 10, quantity: [1, 2] },
            { id: 'spider_silk', weight: 10, quantity: [1, 2] },
            { id: 'iron_shard', weight: 15, quantity: [1, 3] },
            { id: 'minor_enhancement_stone', weight: 5, quantity: [1, 1] },
            { id: 'equipment_piece', weight: 5, quantity: [1, 1] },
            { id: 'bronze_spear', weight: 5, quantity: [1, 1] },
            { id: 'chainmail', weight: 5, quantity: [1, 1] },
            { id: 'silver_ore', weight: 8, quantity: [1, 1] }, // Added silver ore drop
        ]
    },
```

## Common tasks
- **Modify system rarity weights** — Edit the order and baseline ranks of the game's reward rarities in [lootSystem.js L6–13](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js#L6-L13).
- **Edit baseline drop chance formula** — Tune weight calculations and the impact of the rarity boost multiplier in [lootSystem.js L269](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js#L269).
- **Adjust gold drop values** — Adjust the numeric arrays representing min and max gold outputs in [lootSystem.js L254–262](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js#L254-L262).
- **Alter boss dynamic drops bonus rate** — Adjust boss rarity-scaled chance factors in [lootSystem.js L426](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js#L426).
- **Update unknown item default attributes** — Tune safety values returned when an item ID cannot be resolved in the database in [lootSystem.js L671–679](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js#L671-L679).

---

## 5. Reference Manual

> All values below are extracted directly from `core/rpg/lootSystem.js`. A contributor should never need to open that file to understand loot tables, encounter types, boss IDs, or gold ranges.

---

### Encounter Types

These are the valid `encounterType` values used by `generateGoldDrop()` and `distributeLoot()`:

| Encounter Type | Gold Range | Drop Chance | Description |
|---|---|---|---|
| `COMMON_ENEMY` | 10–30 Zeni | 45% | Standard combat encounter |
| `ELITE_ENEMY` | 50–100 Zeni | 75% | Elite/miniboss combat |
| `BOSS` | 200–500 Zeni | 100% | Boss fight |
| `TREASURE` | 100–300 Zeni | 100% | Treasure chest |
| `TRAP_SUCCESS` | 20–50 Zeni | 60% | Trap survived |
| `PUZZLE_SUCCESS` (PUZZLE_REWARD) | 50–150 Zeni | 80% | Puzzle solved |
| `MERCHANT_BONUS` (MERCHANT_GIFT) | 50–200 Zeni | 30% | Merchant gift |

---

### Loot Tables — Item Pools

#### COMMON_ENEMY (45% drop chance)
| Item ID | Weight | Qty Range |
|---|---|---|
| `minor_hp_potion` | 30 | 1–2 |
| `healing_herb` | 25 | 1–3 |
| `bandage` | 20 | 1–2 |
| `iron_shard` | 15 | 1–3 |
| `refined_steel` | 10 | 1–1 |
| `tough_leather` | 10 | 1–1 |
| `gunpowder` | 10 | 1–2 |
| `spider_silk` | 10 | 1–2 |
| `minor_enhancement_stone` | 5 | 1–1 |
| `equipment_piece` | 5 | 1–1 |
| `bronze_spear` | 5 | 1–1 |
| `chainmail` | 5 | 1–1 |

#### ELITE_ENEMY (75% drop chance)
| Item ID | Weight | Qty Range |
|---|---|---|
| `hp_potion` | 20 | 1–2 |
| `equipment_piece` | 15+5 | 1–1 |
| `refined_steel` | 15 | 2–4 |
| `mana_crystal` | 15 | 1–1 |
| `demon_hide` | 10 | 1–1 |
| `ghost_essence` | 10 | 1–1 |
| `mythril_ore` | 10 | 1–2 |
| `remedy` | 12 | 1–1 |
| `sharp_whetstone` | 10 | 1–1 |
| `fire_shard` | 8 | 1–1 |
| `ice_shard` | 8 | 1–1 |
| `lightning_shard` | 8 | 1–1 |
| `rare_enhancement_stone` | 8 | 1–1 |
| `crystal_staff` | 5 | 1–1 |
| `greatsword` | 5 | 1–1 |
| `bronze_spear` | 5 | 1–1 |
| `chainmail` | 5 | 1–1 |

#### BOSS (100% drop chance)
| Item ID | Weight | Qty Range |
|---|---|---|
| `mega_potion` | 20 | 2–3 |
| `ancient_wood` | 15 | 1–2 |
| `mystic_thread` | 15 | 2–4 |
| `boss_essence` | 15 | 1–2 |
| `mythril_ore` | 15 | 3–6 |
| `mana_dew` | 12 | 1–2 |
| `dark_matter` | 10 | 1–1 |
| `legendary_enhancement_stone` | 10 | 1–1 |
| `dragon_blood` | 8 | 1–1 |
| `legendary_shard` | 5+5 | 1–1 |
| `dragon_helm` | 5 | 1–1 |

---

### Boss-Specific Drop Tables (BOSS_DROPS)

| Boss ID | Guaranteed Drop | Special Drop (Chance) |
|---|---|---|
| `INFECTED_COLOSSUS` | `bandage` ×2–4 (COMMON) | `leather_tunic` 30% (COMMON) |
| `CORRUPTED_GUARDIAN` | `hp_potion` ×1–2 (UNCOMMON) | `iron_sword` 25% (UNCOMMON) |
| `ELEMENTAL_ARCHON` | `mega_potion` ×1 (RARE) | `arcane_wand` 20% (RARE) |
| `VOID_CORRUPTED` | `legendary_shard` ×1 (EPIC) | `reinforced_plate` 30% (EPIC) |
| `PRIMORDIAL_CHAOS` | `void_essence` ×1 (MYTHIC) | `essence_mirror` 15% (LEGENDARY) |
| `LICH` | — | `mirror_essence` 30% (LEGENDARY), `lich_phylactery` 15% (EPIC) |
| `DRAGON` | `dragon_scale` ×2–4 (RARE) | `dragon_heart` 20% (LEGENDARY) |
| `DEMON_LORD` | `demon_horn` ×1–2 (EPIC) | `infernal_crown` 25% (MYTHIC) |
| `ANCIENT_GOLEM` | `golem_core` ×1 (RARE) | `titan_heart` 15% (LEGENDARY) |
| `VOID_HORROR` | `void_essence` ×1 (MYTHIC) | `void_essence` 10% (MYTHIC) |
| `ELDER_WYRM` | `wyrm_fang` ×2–3 (RARE) | `elder_blood` 20% (LEGENDARY) |

---

### Item Rarities

| Rarity | Icon | Weight Order |
|---|---|---|
| `COMMON` | ⚪ | 0 |
| `UNCOMMON` | 🟢 | 1 |
| `RARE` | 🔵 | 2 |
| `EPIC` | 🔴 | 3 |
| `LEGENDARY` | 🟡 | 4 |
| `MYTHIC` | 🟣 | 5 |

---

### Adding a New Item to a Loot Table

1. Register the item in `ITEM_DATABASE` in `core/rpg/lootSystem.js`.
2. Add it to the desired loot table's `items` array:
```javascript
{ id: 'my_new_item', weight: 10, quantity: [1, 2] }
```
3. Adjust surrounding weights so total weights remain balanced.
4. Optionally add it to `BOSS_DROPS` for a specific boss:
```javascript
BOSS_DROPS['MY_BOSS'] = {
    guaranteed: [{ id: 'my_item', quantity: [1, 1], rarity: 'EPIC' }],
    special: [{ id: 'rare_drop', dropChance: 15, quantity: 1, rarity: 'LEGENDARY', announcement: '🌟 Rare drop message!' }]
};
```
