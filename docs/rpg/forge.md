# Forge Command Flow (`forge`)

## 1. Description
The Forge command allows players to smith high-tier weapons and armor by combining raw metal ores, ingots, and crystal fragments at a Blacksmith Forge station.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j forge steel_plate"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "forge") (L5102)
            └── core/commands/rpgCommands.js
                └── forgeItem(sock, chatId, senderJid, recipeId) (L515)
                    └── craftItem(sock, chatId, senderJid, recipeId, 'FORGE') (L506)
                        └── core/rpg/craftingSystem.js
                            └── performCraft(senderJid, recipeId, 'FORGE') (L475)
                                └── canCraft(senderJid, recipeId) (L450)
                                    └── Verify user has all required ingredients in inventory
                                └── Enforce category station matching ('FORGE')
                                └── Check space: inventorySystem.hasInventorySpace() (L493)
                                └── Remove ingredients: inventorySystem.removeItem() (L499)
                                └── Add result: inventorySystem.addItem() (L503)
                                └── Update Guild Board progress (CRAFT task) (L523)
            └── sock.sendMessage(chatId, { text: result.message }) (L509)
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5101-L5111)
* **Line Numbers**: 5101-5111
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `cmdArgs`
* **Outputs**: Redirects execution to `rpgCommands.forgeItem`

```javascript
                    // .j forge
                    if (primaryCmd === "forge") {
                      const item = cmdArgs.slice(1).join(" ");
                      await rpgCommands.forgeItem(
                        sock,
                        chatId,
                        senderJid,
                        item,
                      );
                      return;
                    }
```

#### Explanation
- Catches the `.j forge` command.
- Extracts the weapon/recipe ID parameter.
- Routes execution to `rpgCommands.forgeItem` which invokes `'FORGE'` station parameters.

---

### Step 3: Forging Recipe Verification
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
- Searches the blacksmith forging recipe collection (`FORGE_RECIPES`).
- Checks user inventory for raw ore ingredients (e.g. mythril ore, iron ingots).

---

### Step 4: Blacksmith Forge Execution
* **File Path**: [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js#L475-L532)
* **Line Numbers**: 475-532
* **Called From**: `performCraft()`
* **Inputs**: `(userId, recipeId, requiredStation = 'FORGE')`
* **Outputs**: Smelted/forged equipment added to user inventory, ores deleted

```javascript
async function performCraft(userId, recipeId, requiredStation = 'FORGE') {
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
```

#### Explanation
- Enforces station check (`recipe.category === 'FORGE'`).
- Removes raw ores/shards, and awards 1x high-tier weapon/armor piece.
- Saves progress to MongoDB.

---

## 4. How to Modify
To adjust blacksmithing recipes:
- **Add or Modify Forging Recipes**: Edit the `FORGE_RECIPES` object in `core/rpg/craftingSystem.js`.
- **Change Equipment Weapon/Armor Stats**: Edit stats inside `FORGE_RECIPES` result field or modify items configuration inside `core/rpg/lootSystem.js`.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They are like labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // outputs: John
```
**In Our Code**
```javascript
const item = cmdArgs.slice(1).join(" ");
```
**How it works here**: The `item` variable is used to store the value of the `cmdArgs` array sliced from index 1 and joined into a string.
**Why it's used**: Variables are used to store and reuse values in the program, making the code more readable and efficient.
**If you change/remove it**: If you remove the `item` variable, the code will throw an error because the `rpgCommands.forgeItem` function expects an `item` parameter. If you change it to a different variable name, the code will still work as long as the new variable is used consistently.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are denoted by the `=>` symbol.
**General Example**
```javascript
let add = (a, b) => a + b;
console.log(add(2, 3)); // outputs: 5
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The arrow function is used to define an event listener for the `messages.upsert` event. The function takes an object with `messages` and `type` properties as an argument.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as event listeners or callbacks.
**If you change/remove it**: If you remove the arrow function, the event listener will not be defined, and the code will not respond to the `messages.upsert` event. If you change it to a traditional function definition, the code will still work, but the syntax will be different.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are used to respond to user interactions or other events in the program.
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
**How it works here**: The event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to user interactions or other events in the program, allowing the code to react dynamically to changes.
**If you change/remove it**: If you remove the event listener, the code will not respond to the `messages.upsert` event, and the program will not update accordingly. If you change the event type or the listener function, the code will respond to different events or behave differently.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions. They are denoted by the `if` or `switch` keywords.
**General Example**
```javascript
let x = 5;
if (x > 10) {
  console.log('x is greater than 10');
} else {
  console.log('x is less than or equal to 10');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: The conditional statements are used to check the `type` and `isRekeying` variables and return early if the conditions are not met.
**Why it's used**: Conditional statements are used to make decisions in the code and execute different blocks of code based on conditions.
**If you change/remove it**: If you remove the conditional statements, the code will not check the `type` and `isRekeying` variables, and the program may behave incorrectly. If you change the conditions or the code blocks, the program will make different decisions and behave differently.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They are denoted by the `map`, `filter`, `reduce`, and other keywords.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(x => x * 2);
console.log(doubleNumbers); // outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` method is used to transform the `messages` array into a new array of promises.
**Why it's used**: Array methods are used to manipulate and transform arrays, making it easier to work with data in the program.
**If you change/remove it**: If you remove the `map` method, the code will not transform the `messages` array, and the program will not work as expected. If you change the method or the transformation function, the program will behave differently.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and callbacks. They are denoted by the `Promise` keyword.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Success!');
});
promise.then((result) => {
  console.log(result); // outputs: Success!
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
**How it works here**: The `Promise.all` method is used to wait for all the promises in the `messages` array to resolve.
**Why it's used**: Promises are used to handle asynchronous operations and callbacks, making it easier to work with asynchronous code.
**If you change/remove it**: If you remove the `Promise.all` method, the code will not wait for the promises to resolve, and the program may behave incorrectly. If you change the method or the promises, the program will behave differently.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code. It is denoted by the `async` and `await` keywords.
**General Example**
```javascript
async function example() {
  let result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The `async` keyword is used to define an asynchronous function, and the `await` keyword is used to wait for promises to resolve.
**Why it's used**: Async/await is used to make asynchronous code easier to read and write, by avoiding the need for callbacks and promise chaining.
**If you change/remove it**: If you remove the `async` keyword, the code will not be able to use `await` and will throw an error. If you change the `await` keyword, the code will not wait for the promises to resolve, and the program may behave incorrectly.

---
### Concept 8: Object Destructuring
Object destructuring is a syntax sugar that allows you to extract properties from an object and assign them to variables. It is denoted by the `{}` syntax.
**General Example**
```javascript
let person = { name: 'John', age: 30 };
let { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 30
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The object destructuring is used to extract the `messages` and `type` properties from the object passed to the event listener.
**Why it's used**: Object destructuring is used to make the code more concise and easier to read, by avoiding the need to access properties using the dot notation.
**If you change/remove it**: If you remove the object destructuring, the code will not be able to access the `messages` and `type` properties, and will throw an error. If you change the property names, the code will access different properties, and the program may behave incorrectly.

---
### Concept 9: Functions
Functions are reusable blocks of code that take arguments and return values. They are denoted by the `function` keyword.
**General Example**
```javascript
function add(a, b) {
  return a + b;
}
console.log(add(2, 3)); // outputs: 5
```
**In Our Code**
```javascript
function canCraft(userId, recipeId) {
  // ...
}
```
**How it works here**: The `canCraft` function is used to check if a user can craft a recipe.
**Why it's used**: Functions are used to organize the code into reusable blocks, making it easier to maintain and modify.
**If you change/remove it**: If you remove the `canCraft` function, the code will not be able to check if a user can craft a recipe, and the program may behave incorrectly. If you change the function signature or implementation, the program will behave differently.

---
### Concept 10: Loops
Loops are used to execute a block of code repeatedly. They are denoted by the `for`, `while`, or `do-while` keywords.
**General Example**
```javascript
for (let i = 0; i < 5; i++) {
  console.log(i);
}
```
**In Our Code**
```javascript
for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
  // ...
}
```
**How it works here**: The `for-of` loop is used to iterate over the `recipe.ingredients` object.
**Why it's used**: Loops are used to execute a block of code repeatedly, making it easier to work with data in the program.
**If you change/remove it**: If you remove the loop, the code will not be able to iterate over the `recipe.ingredients` object, and the program may behave incorrectly. If you change the loop type or implementation, the program will behave differently.

---

## 5. Reference Manual

> All values below are extracted directly from `CRAFTING_RECIPES` in `core/rpg/craftingSystem.js`. A contributor should never need to open that file to know what can be forged or what materials are required.

---

### All Forge (Blacksmith) Recipes

The forge command uses the `blacksmith` station. Use `.j forge <item_id>`:

#### Weapons
| Item ID | Display Name |
|---|---|
| `steel_sabre` | Steel Sabre |
| `mythril_staff` | Mythril Staff |
| `inferno_blade` | Inferno Blade |
| `volt_dagger` | Volt Dagger |
| `dragonslayer_spear` | Dragonslayer Spear |
| `shadow_dagger` | Shadow Dagger |
| `warhammer` | Warhammer |
| `death_scythe` | Death Scythe |
| `chrono_blade` | Chrono Blade |
| `golden_cane` | Golden Cane |
| `multi_tool` | Multi-Tool |
| `greataxe` | Greataxe |
| `elemental_wand` | Elemental Wand |
| `storm_bow` | Storm Bow |

#### Armour & Accessories
| Item ID | Display Name |
|---|---|
| `reinforced_plate` | Reinforced Plate |
| `stealth_garb` | Stealth Garb |
| `holy_raiment` | Holy Raiment |
| `dragon_plate` | Dragon Plate |
| `archmage_robes` | Archmage Robes |
| `iron_helm` | Iron Helm |
| `wizard_hat` | Wizard Hat |
| `assassin_hood` | Assassin Hood |
| `leather_boots` | Leather Boots |
| `winged_sandals` | Winged Sandals |
| `health_pendant` | Health Pendant |
| `power_ring` | Power Ring |
| `glacier_guard` | Glacier Guard |
| `obsidian_shield` | Obsidian Shield |
| `titan_gauntlets` | Titan Gauntlets |
| `silk_cloak` | Silk Cloak |
| `ghost_pendant` | Ghost Pendant |
| `vampiric_ring` | Vampiric Ring |
| `wind_boots` | Wind Boots |

#### Consumables (Crafted at Blacksmith / Workshop)
| Item ID | Display Name |
|---|---|
| `fire_bomb` | Fire Bomb |
| `void_grenade` | Void Grenade |
| `cursed_bomb` | Cursed Bomb |
| `smoke_screen` | Smoke Screen |

#### Material Conversions
| Item ID | Description |
|---|---|
| `refined_steel_conv` | Converts base ore → Refined Steel |
| `mythril_ore_conv` | Converts base ore → Mythril Ore |
| `mana_crystal_conv` | Converts base material → Mana Crystal |
| `dark_matter_conv` | Converts materials → Dark Matter |
| `legendary_shard_conv` | Converts materials → Legendary Shard |
| `evolution_stone` | Crafts an Evolution Stone (T2) |
| `ascension_stone` | Crafts an Ascension Stone (T3) |

---

### Forge Recipe Schema

To add a new forge recipe to `CRAFTING_RECIPES` in `core/rpg/craftingSystem.js`:

```javascript
'recipe_item_id': {
    name: 'Display Name',
    result: 'item_id_produced',   // ID of the item created (must exist in ITEM_DATABASE)
    quantity: 1,                   // How many are produced
    station: 'blacksmith',         // Must be 'blacksmith' for forge command
    ingredients: [
        { id: 'refined_steel', quantity: 5 },
        { id: 'mana_crystal', quantity: 2 }
    ],
    description: 'Brief description shown in recipe list.'
}
```

---

### Key Crafting Material IDs for Forging

| Item ID | Name | Primary Source |
|---|---|---|
| `refined_steel` | Refined Steel | Mine / enemy drop |
| `mythril_ore` | Mythril Ore | Mine / elite / boss drop |
| `mana_crystal` | Mana Crystal | Mine / elite drop |
| `dark_matter` | Dark Matter | Boss drop |
| `boss_essence` | Boss Essence | Boss drop |
| `dragon_blood` | Dragon Blood | Boss drop |
| `dragon_scale` | Dragon Scale | Dragon boss |
| `demon_horn` | Demon Horn | Demon Lord boss |
| `ancient_wood` | Ancient Wood | Boss drop |
| `mystic_thread` | Mystic Thread | Boss drop |
| `legendary_shard` | Legendary Shard | Boss drop |
| `void_crystal` | Void Crystal | Crafting / alchemy |
| `void_essence` | Void Essence | Void Horror (MYTHIC) |
| `fire_shard` | Fire Shard | Elite drop |
| `ice_shard` | Ice Shard | Elite drop |
| `lightning_shard` | Lightning Shard | Elite drop |
| `rare_gem` | Rare Gem | Treasure / boss drop |
