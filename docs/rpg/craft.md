# Craft Command Flow (`craft`, `recipes`)

## 1. Description
The Craft command allows players to create weapons, armor, tools, and accessories by combining raw ingredients and materials found in their inventory. Listing recipes is done via `recipes`, and crafting is done via `craft <recipe_id>`. Players can also view only the items they can currently craft and use right now by typing `craft --ava` or `craft --available`.

---

## 2. Hierarchical Execution Tree

### Listing Crafting Recipes
```text
User sends ".j recipes"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "recipes") (L8810)
            └── core/commands/rpgCommands.js
                └── displayRecipes(sock, chatId, page, 'CRAFT') (L478)
                    └── Fetch crafting recipes
                    └── Filter by CRAFT category
                    └── Paginate recipes (6 per page)
            └── sock.sendMessage(chatId, { text: msg }) (L503)
```

### Listing Available-Only Recipes
```text
User sends ".j craft --ava"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (primaryCmd === "craft") (L5188)
            └── check if argument is "--ava" or "--available"
                └── core/commands/rpgCommands.js
                    └── handleCraftCommand(sock, chatId, senderJid, []) (L703)
                        └── get player level (economy.getUser)
                        └── get inventory (inventorySystem.formatInventory)
                        └── Filter recipes (level requirement & ingredients availability)
                        └── sock.sendMessage(chatId, { text: listMsg })
```

### Crafting an Item
```text
User sends ".j craft iron_sword"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (primaryCmd === "craft") (L5188)
            └── check if argument matches an ID in the new CRAFTING_RECIPES list
                └── YES: core/commands/rpgCommands.js
                    └── handleCraftCommand(sock, chatId, senderJid, ["iron_sword"]) (L703)
                        └── Verify user level >= recipe levelReq
                        └── Verify user has all required ingredients
                        └── Verify inventory has space
                        └── Remove ingredients: inventorySystem.removeItem()
                        └── Add result: inventorySystem.addItem()
                        └── sock.sendMessage(chatId, { text: confirmMsg })
                └── NO (Fallback): core/commands/rpgCommands.js
                    └── craftItem(sock, chatId, senderJid, recipeId, 'CRAFT')
                        └── core/rpg/craftingSystem.js
                            └── performCraft(senderJid, recipeId, 'CRAFT')
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5187)
* **Line Numbers**: 5187-5217
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Parsed command arguments array `cmdArgs`
* **Outputs**: Redirects to `handleCraftCommand` (for `--ava` or new custom recipes) or `craftItem` (fallback/catalog)

```javascript
// .j craft
if (primaryCmd === "craft") {
  const args = cmdArgs.slice(1);
  const firstArg = args[0] ? args[0].toLowerCase().trim() : "";
  
  if (firstArg === "--ava" || firstArg === "--available") {
    await rpgCommands.handleCraftCommand(
      sock,
      chatId,
      senderJid,
      []
    );
  } else {
    const isNewRecipe = args.length > 0 && rpgCommands.CRAFTING_RECIPES.some(r => r.id.toLowerCase() === firstArg);
    if (isNewRecipe) {
      await rpgCommands.handleCraftCommand(
        sock,
        chatId,
        senderJid,
        args
      );
    } else {
      const item = cmdArgs.slice(1).join(" ");
      await rpgCommands.craftItem(
        sock,
        chatId,
        senderJid,
        item
      );
    }
  }
  return;
}
```

#### Explanation
- Captures the `.j craft` command.
- Evaluates whether the argument is the available-only flag (`--ava` or `--available`).
- Evaluates if the argument matches a custom recipe in the new level-required `CRAFTING_RECIPES` table.
- Routes to the corresponding new `handleCraftCommand` or falls back to the original `craftItem` logic.

---

### Step 3: Ingredients Verification
* **File Path**: [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js#L450-L473)
* **Line Numbers**: 450-473
* **Called From**: `performCraft()`
* **Inputs**: `(userId, recipeId)`
* **Outputs**: `{ canCraft: boolean, recipe }` status payload

```javascript
function canCraft(userId, recipeId) {
    const recipe = getRecipeById(recipeId);
    if (!recipe) return { canCraft: false, reason: 'Recipe not found.' };

    const inventory = inventorySystem.getInventory(userId);
    const missing = [];

    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        const has = inventory[ingId] ? (typeof inventory[ingId] === 'number' ? inventory[ingId] : (inventory[ingId].quantity || 0)) : 0;
        if (has < qty) {
            const itemInfo = lootSystem.getItemInfo(ingId);
            missing.push(`${itemInfo.name} (${has}/${qty})`);
        }
    }

    if (missing.length > 0) {
        return { 
            canCraft: false, 
            reason: `Missing ingredients:\n- ${missing.join('\n- ')}` 
        };
    }

    return { canCraft: true, recipe };
}
```

#### Explanation
- Resolves the recipe properties from the registry configuration.
- Checks the player's active inventory. If any required ingredients are missing or insufficient, returns a list of required components.

---

### Step 4: Craft Execution and Inventory Mutations
* **File Path**: [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js#L475-L532)
* **Line Numbers**: 475-532
* **Called From**: `performCraft()`
* **Inputs**: `(userId, recipeId, requiredStation = 'CRAFT')`
* **Outputs**: Returns success status string with item properties

```javascript
async function performCraft(userId, recipeId, requiredStation = 'CRAFT') {
    const check = canCraft(userId, recipeId);
    if (!check.canCraft) return { success: false, message: check.reason };

    const recipe = check.recipe;
    const resultItem = recipe.result;

    if (recipe.category !== requiredStation) {
        return { success: false, message: `❌ This recipe requires a different crafting station!` };
    }

    if (!inventorySystem.hasInventorySpace(userId, 1, resultItem.id)) {
        return { success: false, message: "❌ Cannot craft: Inventory full!" };
    }

    // 1. Remove ingredients
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        inventorySystem.removeItem(userId, ingId, qty);
    }

    // 2. Add result
    const addResult = await inventorySystem.addItem(userId, resultItem.id, 1, {
        name: recipe.name,
        stats: resultItem.stats || {},
        slot: resultItem.slot,
        type: resultItem.stats ? 'EQUIPMENT' : (resultItem.usable ? 'CONSUMABLE' : 'ITEM')
    });
    
    // Guild tracking
    const guilds = require('./guilds');
    const userGuild = guilds.getUserGuild(userId);
    if (userGuild) {
        guilds.updateBoardProgress(userGuild, 'CRAFT', 1);
    }
```

#### Explanation
1. Checks that the recipe matches the crafting station category requested.
2. Checks that the user has open bag space for the output item.
3. Iterates over ingredients, removing them from inventory.
4. Adds the newly created item (equipment, consumable, or material) to the inventory. If item generation fails, rolls back and restores ingredients.
5. Increments daily Guild Board progress counters for the active guild.
6. Returns the success notification text.

---

## 4. How to Modify

### How to Add a New Crafting Recipe (Weapons & Armor)
To add a new piece of forgeable gear or item recipe to the bot:
1. **Define the Crafting Recipe**:
   * Open [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js).
   * Locate the `CRAFTING_RECIPES` object and append a new gear recipe:
     ```javascript
     'titanium_shield': {
         name: 'Titanium Shield', 
         category: 'ARMOR', // Can be WEAPON, ARMOR, ACCESSORY, etc.
         id: 'titanium_shield',
         desc: 'A heavy shield that blocks the mightiest blows. (+30 DEF, +50 HP)',
         ingredients: { 'refined_steel': 5, 'iron_shard': 15, 'golem_core': 1 },
         result: { 
             id: 'titanium_shield', 
             stats: { def: 30, hp: 50 }, 
             slot: 'off_hand' // Equip slot (e.g. main_hand, off_hand, armor, ring, helmet)
         }
     }
     ```
2. **Register the Gear in the Database**:
   * Open [core/rpg/lootSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js).
   * Register the item key inside `ITEM_DATABASE`:
     ```javascript
     'titanium_shield': { 
         name: '🛡️ Titanium Shield', 
         description: 'A heavy titanium shield. (+30 DEF, +50 HP)', 
         rarity: 'RARE', 
         value: 8000, 
         type: 'EQUIPMENT', 
         stats: { def: 30, hp: 50 }, 
         slot: 'off_hand', 
         reqLevel: 10 
     }
     ```

---

### How to Adjust System Crafting Multipliers
* **Adjust Dismantling Material Returns**: Locate the material recovery factor inside the `dismantleItem` function in [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js#L547):
  ```javascript
  const returnChance = 0.40; // 40% of materials returned. Increase to 0.60 for 60% salvage recovery.
  ```

---

## 5. Complete Crafting Reference Manual

This reference section contains all the data, identifiers, and structures needed to define or modify recipes and items in the RPG engine without reading or searching the codebase.

### 5.1 Crafting Stations & Commands
The bot separates crafting activities into four distinct categories/stations. Each station requires a specific user command and maps to a matching `category` field in the recipe:

| Station / Command | Command Syntax | Recipe Category | Purpose |
|:---|:---|:---|:---|
| **Crafting** | `.j craft <recipe_id>` | `CRAFT` | General items, material refining, conversion, and basic engineering |
| **Forging** | `.j forge <recipe_id>` | `FORGE` | Blacksmithing for high-end weapons, armor, and combat accessories |
| **Brewing** | `.j brew <recipe_id>` | `BREWING` | Alchemy station for brewing potions, elixirs, and temporary/permanent stat drinks |
| **Cooking** | `.j cook <recipe_id>` | `COOKING` | Culinary kitchen for preparing meals that grant short-term stat buffs |

> [!NOTE]
> When adding a new recipe, make sure the `category` of your recipe matches the station where you want it crafted. For example, a weapon recipe with `category: 'FORGE'` can only be crafted via `.j forge <recipe_id>`.

---

### 5.2 Registered Items & Materials Database
To use an item either as a recipe **ingredient** or a **result**, it must be registered with a unique ID in the global `ITEM_DATABASE` (located in `core/rpg/lootSystem.js`). Below is the complete catalog of pre-registered items, materials, and equipment.

#### Crafting Materials
Use these IDs in the `ingredients` or `result` blocks:

| Item ID | Name | Rarity | Value (Zeni) | Description |
|:---|:---|:---|:---|:---|
| `iron_shard` | Iron Shard | COMMON | 100 | Metal fragments. |
| `refined_steel` | Refined Steel | UNCOMMON | 500 | High-quality steel. Tastes like pennies. |
| `sharp_whetstone` | Sharp Whetstone | UNCOMMON | 300 | Used to sharpen high-end blades. |
| `mythril_ore` | Mythril Ore | RARE | 1,200 | A rare blue ore. Surprisingly heavy. |
| `mana_dew` | Mana Dew | RARE | 800 | Basically magic Gatorade. |
| `mana_crystal` | Mana Crystal | RARE | 1,500 | Concentrated magic. Smells like static. |
| `tough_leather` | Tough Leather | UNCOMMON | 400 | Thick hide. Smells like wet dog. |
| `gunpowder` | Volatile Gunpowder | COMMON | 200 | Handle with care. |
| `fire_shard` | Fire Shard | UNCOMMON | 300 | A small piece of elemental fire. |
| `fire_essence` | Fire Essence | RARE | 1,000 | A flickering flame. |
| `ice_shard` | Ice Shard | UNCOMMON | 300 | A small piece of elemental ice. |
| `lightning_shard` | Lightning Shard | UNCOMMON | 300 | A small piece of elemental lightning. |
| `spider_silk` | Spider Silk | COMMON | 80 | Strong, sticky silk from giant spiders. |
| `mystic_thread` | Mystic Thread | EPIC | 3,000 | Glows with its own internal light. |
| `ancient_wood` | Ancient Wood | EPIC | 2,500 | Petrified wood from a forgotten forest. |
| `ghost_essence` | Ghost Essence | RARE | 1,500 | Ethereal residue from a restless spirit. |
| `dark_matter` | Dark Matter | EPIC | 2,500 | Heavier than your student loans. |
| `void_crystal` | Void Crystal | RARE | 1,200 | Absorbs all surrounding light. |
| `boss_essence` | Boss Essence | EPIC | 3,000 | A concentrated core of a defeated lord. |
| `legendary_shard` | Legendary Shard | LEGENDARY | 8,000 | A fragment of an ancient artifact. |
| `demon_hide` | Demon Hide | RARE | 1,200 | Tough, resilient skin from a demon. |
| `healing_herb` | Sun-kissed Herb | COMMON | 150 | Natural medicine. |
| `gold_pile` | Pile of Gold | COMMON | 1 | Glinting Zeni coins. |
| `minor_enhancement_stone` | Minor Enhancement Stone | COMMON | 1,000 | Boosts gear stats by 5%. |
| `rare_enhancement_stone` | Rare Enhancement Stone | RARE | 5,000 | Boosts gear stats by 15%. |
| `legendary_enhancement_stone` | Legendary Enhancement Stone | LEGENDARY | 20,000 | Boosts gear stats by 35%. |
| `evolution_stone` | Evolution Stone (T2) | RARE | 8,000 | Triggers evolution to T2 class. |
| `ascension_stone` | Ascension Stone (T3) | EPIC | 50,000 | Triggers ascension to T3 class. |

#### Hunting & Fishing Materials
| Item ID | Name | Rarity | Value (Zeni) | Description |
|:---|:---|:---|:---|:---|
| `common_fish` | Small Bass | COMMON | 150 | A common pond fish. |
| `rare_fish` | Rainbow Trout | RARE | 800 | A beautifully colored fish. |
| `mythic_fish` | Void Kraken Tentacle | MYTHIC | 15,000 | A legendary find from the abyss. |
| `infected_fish` | Corrupted Eel | EPIC | 4,500 | Twisting with hazard energy. |
| `rabbit_hide` | Rabbit Hide | COMMON | 120 | Soft and common fur. |
| `deer_antler` | Deer Antlers | UNCOMMON | 600 | Useful for crafting. |
| `bear_claw` | Bear Claws | RARE | 2,500 | Sharp and dangerous. |

#### Special & Boss Drop Materials
| Item ID | Name | Rarity | Value (Zeni) | Description |
|:---|:---|:---|:---|:---|
| `infected_shard` | Infected Shard | EPIC | 3,000 | Concentrated Hive essence. |
| `infected_heart` | Pulsing Heart | EPIC | 2,000 | It is still beating... barely. |
| `rare_gem` | Rare Gem | RARE | 5,000 | A sparkling gemstone of immense value. |
| `void_essence` | Void Essence | MYTHIC | 25,000 | A swirling mass of nothingness. |
| `lich_phylactery` | Lich Phylactery | EPIC | 15,000 | Contains the soul of a powerful necromancer. |
| `dragon_scale` | Dragon Scale | RARE | 3,000 | Nearly indestructible plate from a dragon. |
| `demon_horn` | Demon Horn | EPIC | 8,000 | Razor sharp and warm to the touch. |
| `infernal_crown` | Infernal Crown | MYTHIC | 50,000 | A crown forged in the deepest pits of hell. |
| `golem_core` | Golem Core | RARE | 6,000 | A pulsating heart of stone and magic. |
| `titan_heart` | Titan Heart | LEGENDARY | 20,000 | The power source of a colossal golem. |
| `wyrm_fang` | Wyrm Fang | RARE | 4,000 | A lethal tooth from an elder dragon. |
| `elder_blood` | Elder Blood | LEGENDARY | 15,000 | Pure magic coursing through ancient veins. |
| `mirror_essence` | Mirror Essence | LEGENDARY | 5,000 | Crystallized dark power. |

#### Weapons, Armor, & Accessories (Base Gear)
These base items are commonly used as starting templates or upgraded via crafting:
* **Weapons (`type: 'EQUIPMENT', slot: 'main_hand'`)**:
  * `rusty_dagger` (Rusted Dagger - Common, 1,000 Zeni)
  * `iron_sword` (Iron Sword - Uncommon, 5,000 Zeni)
  * `arcane_wand` (Arcane Wand - Rare, 6,000 Zeni)
  * `bronze_spear` (Bronze Spear - Common, 1,200 Zeni)
  * `crystal_staff` (Crystal Staff - Uncommon, 3,000 Zeni)
  * `greatsword` (Greatsword - Rare, 6,000 Zeni)
* **Armor (`type: 'EQUIPMENT', slot: 'armor'`)**:
  * `leather_tunic` (Leather Tunic - Common, 1,600 Zeni)
  * `chainmail` (Chainmail - Uncommon, 2,500 Zeni)
  * `iron_plate` (Iron Plate - Uncommon, 4,500 Zeni)
  * `mage_robe` (Novice Robe - Uncommon, 4,800 Zeni)
  * `reinforced_plate` (Reinforced Plate - Epic, 24,000 Zeni)
* **Helmets (`type: 'EQUIPMENT', slot: 'helmet'`)**:
  * `dragon_helm` (Dragon Helm - Epic, 12,000 Zeni)
* **Accessories / Rings (`type: 'EQUIPMENT', slot: 'ring'`)**:
  * `wooden_ring` (Wooden Ring - Common, 500 Zeni)
  * `iron_ring` (Iron Ring - Uncommon, 2,000 Zeni)
  * `dragon_seal_ring` (Dragon Seal Ring - Epic, 20,000 Zeni)

> [!TIP]
> If you create a brand new item to serve as a recipe outcome or ingredient, you must add it to the `ITEM_DATABASE` in [`core/rpg/lootSystem.js`](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/lootSystem.js) with its respective name, description, rarity, value, type, and stats/slot (if equipment).

---

### 5.3 Enums & Constants

#### Item Rarity
Every item must be assigned one of the following rarity strings:
`'COMMON'` | `'UNCOMMON'` | `'RARE'` | `'EPIC'` | `'LEGENDARY'` | `'MYTHIC'`

#### Item Type
Dictates how the item behaves inside inventories and combat:
* `'MATERIAL'`: Raw resource stackable in bags (e.g. iron_shard).
* `'EQUIPMENT'`: Wearable combat gear with stats and slot mappings.
* `'POTION'`: Usable item with consumable recovery or buff effects.
* `'ITEM'`: General key item or miscellaneous loot.

#### Equipment Slots
If an item is `'EQUIPMENT'`, it must specify one of these slots to occupy:
* `main_hand` / `weapon`: Main hand weapons (swords, wands, etc.)
* `off_hand`: Shields, off-hand daggers, etc.
* `armor`: Core body armor (plate, robes, garbs)
* `helmet`: Head protection
* `boots`: Footwear
* `gloves`: Handwear
* `ring`: Accessory rings
* `amulet`: Necklaces/pendants
* `cloak`: Back accessories/cloaks

---

### 5.4 Recipe Schema & Supported Fields
When declaring a recipe in `craftingSystem.js`, it must follow this exact structure:

```javascript
'recipe_id': {
    name: 'Steel Sabre',          // String: The display name of the recipe output
    id: 'steel_sabre',            // String: Unique key (must match the dictionary key)
    category: 'WEAPON',           // String: Category/Station classification (WEAPON, ARMOR, ACCESSORY, CLOTHING, ENGINEERING, EVOLUTION, CRAFT, BREWING, COOKING)
    desc: 'A sharp blade...',     // String: Human-readable description printed in '.j recipes'
    ingredients: {                // Object: Required items and their quantities
        'iron_sword': 1,
        'refined_steel': 3,
        'sharp_whetstone': 1
    },
    result: {                     // Object: Output item definition
        id: 'steel_sabre',        // String: Must match a registered ID in ITEM_DATABASE
        
        // Slot and Stats are REQUIRED for EQUIPMENT outcomes:
        slot: 'weapon',           // String: Equipment slot to occupy
        stats: {                  // Object: Active modifiers when equipped
            atk: 25,              // Attack power (flat value)
            mag: 0,               // Magic power
            def: 0,               // Defense rating
            hp: 0,                // Bonus HP
            spd: 5,               // Speed rating
            luck: 0,              // Luck rating
            crit: 0               // Crit chance % (e.g., 15 for 15% crit rate)
        },

        // Usable and Effect fields are for CONSUMABLE/POTION/ENGINEERING outcomes:
        usable: true,             // Boolean: True if consumable via '.j use <item_id>'
        effect: 'aoe_damage',     // String: Effect action keyword (see list below)
        effectValue: 150,         // Number: Numerical strength of the effect (HP healed, DMG dealt, etc.)
        duration: 3,              // Number: Duration in turns for buffs/debuffs
        cureStatus: true          // Boolean: Set true to cleanse negative status effects

        // Type is for EVOLUTION/ASCENSION/STAT_BOOST outcomes:
        type: 'EVOLUTION',        // String: Set to 'EVOLUTION', 'ASCENSION', or 'STAT_BOOST'
        boost: {                  // Object: For STAT_BOOST permanent drinks
            stat: 'luck',         // String: Stat to permanently increase
            value: 10             // Number: Stat increase amount
        }
    }
}
```

#### Supported Consumable Effects (`result.effect`)
If creating a recipe that yields a usable potion, food, or bomb, you can assign one of the following effect behaviors:
* `heal`: Restores HP (can scale by fraction e.g. 0.35 for 35% HP, or flat values like 250).
* `restore_energy`: Restores combat energy.
* `cure_status`: Cleanses negative status debuffs.
* `cleanse_heal`: Cleanses debuffs and heals a flat amount.
* `revive`: Resurrects a dead party member with a percentage of max HP.
* `flee`: Escapes standard combat encounters.
* `buff_atk` / `buff_def` / `buff_spd` / `buff_luck` / `buff_mag` / `buff_all`: Grants stat percentage increases for a number of turns.
* `shield_max`: Grants a temporary shield absorbing incoming damage.
* `invincibility`: Renders the user immune to all damage for 1 turn.
* `aoe_damage` / `aoe_debuff_damage` / `aoe_slow_damage`: Deals explosive area damage to all enemies, with optional debuffs.
* `evasion_buff`: Boosts party evasion rate.
* `random_major_buff`: Triggers a random high-tier status enhancement.

---

### 5.5 Mining Locations Configuration
Since crafting relies heavily on mined ores, you can modify or add mining locations inside `MINING_LOCATIONS` in `craftingSystem.js`.

| Location ID | Name | Req. Level | Req. Rank | Req. Mining Level | Energy Cost | Available Ores (IDs & weights) |
|:---|:---|:---|:---|:---|:---|:---|
| `shimmering_caves` | Shimmering Caves | 1 | F | 1 | 15 | `iron_shard` (60), `silver_ore` (30), `gold_ore` (10) |
| `deep_vein_shafts` | Deep Vein Shafts | 15 | D | 5 | 25 | `silver_ore` (40), `gold_ore` (30), `mythril_ore` (20), `obsidian_chunk` (10) |
| `volcanic_hollow` | Volcanic Hollow | 30 | B | 15 | 40 | `gold_ore` (20), `obsidian_chunk` (40), `diamond_shard` (25), `fire_shard` (15) |
| `void_fissure` | Void Fissure | 50 | S | 30 | 60 | `mana_crystal` (40), `dark_matter` (30), `mythril_ore` (20), `legendary_shard` (10) |

#### Mining Location Schema
To register a new mining site, add it to `MINING_LOCATIONS` using this template:
```javascript
'location_id': {
    name: 'Location Name',
    id: 'location_id',
    desc: 'Description of the mine.',
    req: { level: 10, rank: 'E', miningLevel: 2 }, // Unlock requirements
    energyCost: 20,                              // Energy consumed per mining action
    ores: [                                      // Array of potential drops
        { id: 'iron_shard', weight: 70, min: 1, max: 3 }, // weight out of 100 total
        { id: 'gold_ore', weight: 30, min: 1, max: 1 }
    ]
}
```

---

# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They are like labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const recipeId = txt.split(' ').slice(2).join(' ').trim();
```
**How it works here**: The code is using a variable `recipeId` to store the result of a string manipulation operation. The `const` keyword means the variable's value cannot be changed after it's declared.
**Why it's used**: Variables are used to store and reuse values in the program, making the code more efficient and easier to read.
**If you change/remove it**: If you remove the `const` keyword, the variable's value can be changed later in the code. If you remove the variable altogether, the code will throw an error because `recipeId` is used later in the program.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are like regular functions, but with a shorter syntax.
**General Example**
```javascript
let add = (a, b) => a + b;
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code is using an arrow function as an event handler for the `messages.upsert` event. The function takes an object with `messages` and `type` properties as an argument.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as event handlers, callbacks, or higher-order functions.
**If you change/remove it**: If you remove the arrow function, the event handler will not be defined, and the code will not respond to the `messages.upsert` event. If you change it to a regular function, the code will still work, but the syntax will be different.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are like callbacks that are triggered by the program.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code is using an event listener to respond to the `messages.upsert` event. When the event occurs, the event listener function is called with an object containing `messages` and `type` properties.
**Why it's used**: Event listeners are used to respond to events that occur in the program, such as user interactions, network requests, or changes to the data.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event. If you change the event listener function, the program will respond differently to the event.

---
### Concept 4: Array Methods
Array methods are functions that operate on arrays, such as `map`, `filter`, and `reduce`. They are like built-in functions that can be used to manipulate arrays.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(n => n * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The code is using the `map` method to create a new array of promises that are executed concurrently using `Promise.all`.
**Why it's used**: Array methods are used to manipulate arrays in a concise and efficient way.
**If you change/remove it**: If you remove the `map` method, the code will not create a new array of promises. If you change it to a different array method, the code will behave differently.

---
### Concept 5: Conditional Statements
Conditional statements are used to control the flow of the program based on conditions or decisions. They are like if-else statements that determine what code to execute.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult!');
} else {
  console.log('You are a minor!');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: The code is using conditional statements to check the `type` and `isRekeying` variables and return early if the conditions are not met.
**Why it's used**: Conditional statements are used to control the flow of the program and make decisions based on conditions.
**If you change/remove it**: If you remove the conditional statements, the code will not check the conditions and may execute incorrectly. If you change the conditions, the code will behave differently.

---
### Concept 6: String Manipulation
String manipulation is the process of modifying or transforming strings. It is like using functions to change or extract parts of a string.
**General Example**
```javascript
let name = 'John Doe';
let firstName = name.split(' ')[0];
console.log(firstName); // Outputs: John
```
**In Our Code**
```javascript
const recipeId = txt.split(' ').slice(2).join(' ').trim();
```
**How it works here**: The code is using string manipulation to extract the recipe ID from the input text.
**Why it's used**: String manipulation is used to extract, modify, or transform strings in the program.
**If you change/remove it**: If you remove the string manipulation, the code will not extract the recipe ID correctly. If you change the string manipulation, the code will extract a different value.

---
### Concept 7: Imports
Imports are used to bring in external modules or functions into the program. They are like including libraries or dependencies in the code.
**General Example**
```javascript
import { add } from './math.js';
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
const guilds = require('./guilds');
```
**How it works here**: The code is using an import to bring in the `guilds` module from a separate file.
**Why it's used**: Imports are used to bring in external modules or functions into the program and make them available for use.
**If you change/remove it**: If you remove the import, the code will not have access to the `guilds` module and will throw an error. If you change the import, the code will bring in a different module or function.

---
### Concept 8: Destructuring
Destructuring is the process of extracting values from an object or array and assigning them to variables. It is like unpacking a box and assigning the contents to separate variables.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code is using destructuring to extract the `messages` and `type` properties from the event object and assign them to variables.
**Why it's used**: Destructuring is used to extract values from objects or arrays and assign them to separate variables.
**If you change/remove it**: If you remove the destructuring, the code will not extract the `messages` and `type` properties correctly. If you change the destructuring, the code will extract different values.

---
### Concept 9: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when the operation is complete. They are like a contract that ensures the code will be executed when the operation is finished.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Done!');
});
promise.then((result) => {
  console.log(result); // Outputs: Done!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The code is using promises to execute a series of asynchronous operations concurrently and wait for all of them to complete.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when the operation is complete.
**If you change/remove it**: If you remove the promises, the code will not wait for the asynchronous operations to complete and may execute incorrectly. If you change the promises, the code will behave differently.

---
### Concept 10: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code. It is like a way to write asynchronous code that looks like synchronous code.
**General Example**
```javascript
async function example() {
  let result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
async function performCraft(userId, recipeId, requiredStation = 'CRAFT') {
  // ...
}
```
**How it works here**: The code is using async/await to write asynchronous code that looks like synchronous code.
**Why it's used**: Async/await is used to make asynchronous code easier to read and write.
**If you change/remove it**: If you remove the async/await, the code will not be able to write asynchronous code in a synchronous style. If you change the async/await, the code will behave differently.
