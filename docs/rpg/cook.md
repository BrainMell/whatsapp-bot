# Cook Command Flow (`cook`)

## 1. Description
The Cook command allows players to prepare food items, status buffs, and health restoratives by combining food ingredients (such as fish, meat, and herbs) at a Kitchen station.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j cook grilled_fish"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "cook") (L5114)
            └── core/commands/rpgCommands.js
                └── cookItem(sock, chatId, senderJid, recipeId) (L514)
                    └── craftItem(sock, chatId, senderJid, recipeId, 'COOKING') (L506)
                        └── core/rpg/craftingSystem.js
                            └── performCraft(senderJid, recipeId, 'COOKING') (L475)
                                └── canCraft(senderJid, recipeId) (L450)
                                    └── Verify user has all required ingredients in inventory
                                └── Enforce category station matching ('COOKING')
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5113-L5118)
* **Line Numbers**: 5113-5118
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `cmdArgs`
* **Outputs**: Redirects execution to `rpgCommands.cookItem`

```javascript
                    // .j cook
                    if (primaryCmd === "cook") {
                      const item = cmdArgs.slice(1).join(" ");
                      await rpgCommands.cookItem(sock, chatId, senderJid, item);
                      return;
                    }
```

#### Explanation
- Catches the `.j cook` command.
- Extracts the food/recipe ID parameter.
- Routes execution to `rpgCommands.cookItem` which invokes `'COOKING'` station parameters.

---

### Step 3: Cooking Recipe Verification
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
- Searches the culinary recipe collection (`COOKING_RECIPES`).
- Checks user inventory for raw food ingredients (e.g. fish, meat).

---

### Step 4: Kitchen Cooking Execution
* **File Path**: [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js#L475-L532)
* **Line Numbers**: 475-532
* **Called From**: `performCraft()`
* **Inputs**: `(userId, recipeId, requiredStation = 'COOKING')`
* **Outputs**: Prepared meal added to user inventory, ingredients deleted

```javascript
async function performCraft(userId, recipeId, requiredStation = 'COOKING') {
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
- Enforces station check (`recipe.category === 'COOKING'`).
- Removes raw materials, and awards 1x prepared meal.
- Saves progress to MongoDB.

---

## 4. How to Modify

### How to Add a New Cooking Recipe
To add a new culinary recipe to the bot:
1. Open [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js).
2. Locate the `COOKING_RECIPES` object and add a new recipe definition:
   ```javascript
   'spicy_ramen': {
       name: 'Spicy Ramen', 
       id: 'spicy_ramen', 
       category: 'COOKING', // Must be 'COOKING'
       desc: 'A piping hot bowl of noodles. (+15 ATK & +10 SPD for 5 turns)',
       ingredients: { 'common_fish': 1, 'healing_herb': 2, 'rabbit_hide': 1 },
       result: { 
           id: 'spicy_ramen', 
           usable: true, 
           effect: 'buff_atk_spd', // Custom effect string
           effectValue: 15, 
           duration: 5 
       }
   }
   ```
3. Register the output item ID (`spicy_ramen`) in the `ITEM_DATABASE` inside [core/rpg/lootSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js) (see below).

---

### How to Add a New Consumable Food Item
When creating a new cooked food item, you must register its item stats and define its consumption behavior:
1. Open [core/rpg/lootSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js).
2. Locate `ITEM_DATABASE` and register your food item:
   ```javascript
   'spicy_ramen': { 
       name: '🍜 Spicy Ramen', 
       description: 'Restores HP and temporarily buffs stats.', 
       rarity: 'RARE', 
       value: 1200, 
       type: 'CONSUMABLE', 
       usable: true,
       effect: 'buff_atk_spd',
       effectValue: 15
   }
   ```
3. Open [core/rpg/inventorySystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/inventorySystem.js).
4. Locate the `useItem()` function and add a handler for the food item:
   * **If usable outside combat** (e.g., healing or energy recovery):
     ```javascript
     else if (itemId === 'spicy_ramen') {
         const maxHp = sheet.stats.maxHp || sheet.stats.hp;
         sheet.stats.hp = Math.min(maxHp, (sheet.stats.hp || maxHp) + 50); // Restores 50 HP
         effectMsg = `🍜 You ate the Spicy Ramen! Restored **50 HP**!`;
     }
     ```
   * **If combat-only** (e.g., status buffs), the default helper blocks in `useItem()` will automatically guide the player to use it in battle if you list the effect in the check. You must also implement the combat effect inside [core/rpg/guildAdventure.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guildAdventure.js) under the `useCombatItem` logic.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They can be thought of as labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const item = cmdArgs.slice(1).join(" ");
```
**How it works here**: The `item` variable is used to store the value of the command arguments sliced from the first index and joined into a string.
**Why it's used**: Variables are used to store and manipulate data in the program. In this case, the `item` variable is used to store the item to be cooked.
**If you change/remove it**: If you remove the `item` variable, the program will not be able to store the item to be cooked, and the `cookItem` function will not be called with the correct argument.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
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
**How it works here**: The arrow function is used to define an event listener for the `messages.upsert` event. The function is called with an object containing `messages` and `type` properties.
**Why it's used**: Arrow functions are used to define small, single-purpose functions. In this case, the arrow function is used to define an event listener that handles the `messages.upsert` event.
**If you change/remove it**: If you remove the arrow function, the event listener will not be defined, and the program will not be able to handle the `messages.upsert` event.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are used to respond to user interactions, network requests, and other events.
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
**How it works here**: The event listener is used to listen for the `messages.upsert` event. When the event occurs, the function is called with an object containing `messages` and `type` properties.
**Why it's used**: Event listeners are used to respond to events that occur in the program. In this case, the event listener is used to handle the `messages.upsert` event and process the messages.
**If you change/remove it**: If you remove the event listener, the program will not be able to respond to the `messages.upsert` event, and the messages will not be processed.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions. They are defined using the `if` and `else` keywords.
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
**How it works here**: The conditional statements are used to check the `type` and `isRekeying` variables. If the conditions are not met, the function returns immediately.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on conditions. In this case, the conditional statements are used to filter out unwanted messages and prevent the function from executing when rekeying is in progress.
**If you change/remove it**: If you remove the conditional statements, the function will execute for all messages, regardless of the `type` and `isRekeying` variables, which may lead to unexpected behavior.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They are defined using the `map`, `filter`, and `reduce` keywords.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubled = numbers.map(n => n * 2);
console.log(doubled); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` method is used to transform the `messages` array into an array of promises. The `Promise.all` method is then used to wait for all the promises to resolve.
**Why it's used**: Array methods are used to manipulate and transform arrays. In this case, the `map` method is used to transform the `messages` array into an array of promises, which are then waited for using `Promise.all`.
**If you change/remove it**: If you remove the `map` method, the `messages` array will not be transformed, and the `Promise.all` method will not be able to wait for the promises to resolve.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when the operation is complete. They are defined using the `Promise` keyword.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // Asynchronous operation
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
**How it works here**: The `Promise.all` method is used to wait for all the promises in the array to resolve. The `await` keyword is used to pause the execution of the function until the promises are resolved.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when the operation is complete. In this case, the `Promise.all` method is used to wait for all the promises in the array to resolve, and the `await` keyword is used to pause the execution of the function until the promises are resolved.
**If you change/remove it**: If you remove the `Promise.all` method, the function will not be able to wait for the promises to resolve, and the execution of the function will not be paused.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that provides a way to write asynchronous code that is easier to read and maintain. It is defined using the `async` and `await` keywords.
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
**How it works here**: The `async` keyword is used to define an asynchronous function, and the `await` keyword is used to pause the execution of the function until the promise is resolved.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain. In this case, the `async` keyword is used to define an asynchronous function, and the `await` keyword is used to pause the execution of the function until the promises are resolved.
**If you change/remove it**: If you remove the `async` and `await` keywords, the function will not be able to pause its execution until the promises are resolved, and the code will not be able to handle asynchronous operations correctly.

---
### Concept 8: Object Destructuring
Object destructuring is a syntax sugar that provides a way to extract properties from an object and assign them to variables. It is defined using the `{}` syntax.
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
**How it works here**: The object destructuring syntax is used to extract the `messages` and `type` properties from the object passed to the function.
**Why it's used**: Object destructuring is used to extract properties from an object and assign them to variables. In this case, the object destructuring syntax is used to extract the `messages` and `type` properties from the object passed to the function.
**If you change/remove it**: If you remove the object destructuring syntax, the function will not be able to extract the `messages` and `type` properties from the object, and the code will not be able to access these properties.

---
### Concept 9: Functions
Functions are blocks of code that can be executed multiple times from different parts of a program. They are defined using the `function` keyword.
**General Example**
```javascript
function add(a, b) {
  return a + b;
}
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
function canCraft(userId, recipeId) {
  // ...
}
```
**How it works here**: The `canCraft` function is defined to check if a user can craft a recipe. The function takes two arguments, `userId` and `recipeId`, and returns an object with a `canCraft` property and a `reason` property.
**Why it's used**: Functions are used to organize code into reusable blocks. In this case, the `canCraft` function is used to check if a user can craft a recipe, and the function is reused in different parts of the code.
**If you change/remove it**: If you remove the `canCraft` function, the code will not be able to check if a user can craft a recipe, and the program will not be able to determine if a user has the required ingredients and inventory space to craft a recipe.

---
### Concept 10: Loops
Loops are used to execute a block of code repeatedly for a specified number of times. They are defined using the `for`, `while`, and `do-while` keywords.
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
**How it works here**: The `for-of` loop is used to iterate over the `recipe.ingredients` object. The loop iterates over the key-value pairs of the object, and the `ingId` and `qty` variables are assigned the values of the key and value, respectively.
**Why it's used**: Loops are used to execute a block of code repeatedly for a specified number of times. In this case, the `for-of` loop is used to iterate over the `recipe.ingredients` object and check if the user has the required ingredients to craft a recipe.
**If you change/remove it**: If you remove the `for-of` loop, the code will not be able to iterate over the `recipe.ingredients` object, and the program will not be able to check if the user has the required ingredients to craft a recipe.
