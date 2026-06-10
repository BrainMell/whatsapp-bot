# Craft Command Flow (`craft`, `recipes`)

## 1. Description
The Craft command allows players to create weapons, armor, tools, and accessories by combining raw ingredients and materials found in their inventory. Listing recipes is done via `recipes`, and crafting is done via `craft <recipe_id>`.

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

### Crafting an Item
```text
User sends ".j craft iron_sword"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (primaryCmd === "craft") (L8835)
            └── core/commands/rpgCommands.js
                └── craftItem(sock, chatId, senderJid, recipeId, 'CRAFT') (L506)
                    └── core/rpg/craftingSystem.js
                        └── performCraft(senderJid, recipeId, 'CRAFT') (L475)
                            └── canCraft(senderJid, recipeId) (L450)
                                └── Verify user has all required ingredients in inventory
                            └── Enforce category station matching ('CRAFT')
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L8834-L8844)
* **Line Numbers**: 8834-8844
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Redirects execution to `rpgCommands.craftItem`

```javascript
// `${botConfig.getPrefix().toLowerCase()}` craft <id>
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} craft` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} craft `)) {
    const recipeId = txt.split(' ').slice(2).join(' ').trim();
    if (!recipeId) {
        return await sendUsage(sock, chatId, BOT_MARKER, '🛠️ CRAFT', 'craft <recipe_id>', 'craft iron_sword', "Create equipment from materials.");
    }
    await rpgCommands.craftItem(sock, chatId, senderJid, recipeId);
    return;
}
```

#### Explanation
- Captures the `.j craft` command.
- Extracts the recipe identifier parameters. If none are typed, displays the usage helper and exits.
- Invokes `rpgCommands.craftItem` with the category set to `'CRAFT'`.

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
* **Alter Enhancement Success Probability**: Open [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js) and locate the gear enhancement code block to adjust success rates or stone requirements at higher tiers.










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
