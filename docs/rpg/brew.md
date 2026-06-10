# Brew Command Flow (`brew`)

## 1. Description
The Brew command allows players to concoct potions, status remedies, and elixirs by combining ingredients (such as herbs, crystals, shards, or monster drops) at an Alchemy Laboratory station.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j brew hp_potion"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "brew") (L8836)
            └── core/commands/rpgCommands.js
                └── brewItem(sock, chatId, senderJid, recipeId) (L513)
                    └── craftItem(sock, chatId, senderJid, recipeId, 'BREWING') (L506)
                        └── core/rpg/craftingSystem.js
                            └── performCraft(senderJid, recipeId, 'BREWING') (L475)
                                └── canCraft(senderJid, recipeId) (L450)
                                    └── Verify user has all required ingredients in inventory
                                └── Enforce category station matching ('BREWING')
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
* **Outputs**: Redirects execution to `rpgCommands.brewItem`

```javascript
// `${botConfig.getPrefix().toLowerCase()}` brew <id>
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} brew` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} brew `)) {
    const recipeId = txt.split(' ').slice(2).join(' ').trim();
    if (!recipeId) {
        return await sendUsage(sock, chatId, BOT_MARKER, '⚗️ BREW', 'brew <potion_id>', 'brew hp_potion', "Create potions from materials.");
    }
    await rpgCommands.brewItem(sock, chatId, senderJid, recipeId);
    return;
}
```

#### Explanation
- Identifies the `.j brew` command.
- Extracts the potion/recipe ID parameter. Displays usage helper if empty.
- Routes to `rpgCommands.brewItem` which passes `'BREWING'` station parameters.

---

### Step 3: Potion Recipe Verification
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
- Searches the alchemical recipe collection.
- Checks user inventory for required reagents (e.g. magic herbs, crystal dust).

---

### Step 4: Alchemy Laboratory Crafting Execution
* **File Path**: [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js#L475-L532)
* **Line Numbers**: 475-532
* **Called From**: `performCraft()`
* **Inputs**: `(userId, recipeId, requiredStation = 'BREWING')`
* **Outputs**: Potion added to user inventory, ingredients deleted

```javascript
async function performCraft(userId, recipeId, requiredStation = 'BREWING') {
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
- Enforces station check (`recipe.category === 'BREWING'`).
- Removes herbs/crystals, and awards 1x consumable potion.
- Saves progress to MongoDB.

---

## 4. How to Modify
To adjust alchemy recipes:
- **Add or Modify Potion Recipes**: Edit the `BREWING_RECIPES` object in `core/rpg/craftingSystem.js`.
- **Change Consumable Effects**: Edit the potion usage effects mapping in `core/rpg/inventorySystem.js`.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They have a name, and you can assign a value to them.
**General Example**
```javascript
let name = 'John';
console.log(name); // outputs: John
```
**In Our Code**
```javascript
const recipeId = txt.split(' ').slice(2).join(' ').trim();
```
**How it works here**: The code assigns the result of the `split`, `slice`, and `join` operations to a variable named `recipeId`.
**Why it's used**: Variables are used to store the result of an operation or a value, so it can be used later in the program.
**If you change/remove it**: If you remove the `recipeId` variable, the code will not be able to store the result of the operation, and the program will not work as expected. If you change the name of the variable, you will need to update all the places where it is used.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
let greet = (name) => { console.log(`Hello, ${name}!`); };
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code defines an event listener using an arrow function, which is called when the `messages.upsert` event is triggered.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, which makes the code more concise and easier to read.
**If you change/remove it**: If you remove the arrow function, the event listener will not be defined, and the program will not respond to the `messages.upsert` event. If you change the syntax, the code will not work as expected.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events, such as user interactions or network requests. They are defined using the `on` method.
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
**How it works here**: The code defines an event listener for the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events, which allows the program to interact with the user or other systems.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event, and the code inside the listener will not be executed. If you change the event name, the listener will not be triggered.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions. They are defined using the `if` and `else` keywords.
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
```
**How it works here**: The code checks the value of the `type` variable and returns if it is not equal to "notify" or "append".
**Why it's used**: Conditional statements are used to execute different blocks of code based on conditions, which allows the program to make decisions.
**If you change/remove it**: If you remove the conditional statement, the code will not check the value of the `type` variable, and the program may not work as expected. If you change the condition, the code will execute different blocks of code.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They are defined using the `map`, `filter`, and `reduce` methods.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map((num) => num * 2);
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
**How it works here**: The code uses the `map` method to transform the `messages` array into an array of promises.
**Why it's used**: Array methods are used to manipulate and transform arrays, which makes the code more concise and easier to read.
**If you change/remove it**: If you remove the `map` method, the code will not transform the `messages` array, and the program will not work as expected. If you change the method, the code will transform the array differently.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries. They are defined using the `Promise` constructor.
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
**How it works here**: The code uses the `Promise.all` method to wait for all the promises in the `messages` array to resolve.
**Why it's used**: Promises are used to handle asynchronous operations, which allows the program to execute multiple tasks concurrently.
**If you change/remove it**: If you remove the `Promise.all` method, the code will not wait for all the promises to resolve, and the program may not work as expected. If you change the method, the code will handle the promises differently.

---
### Concept 7: Destructuring
Destructuring is used to extract values from objects or arrays. It is defined using the `{}` or `[]` syntax.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code uses destructuring to extract the `messages` and `type` values from the event object.
**Why it's used**: Destructuring is used to extract values from objects or arrays, which makes the code more concise and easier to read.
**If you change/remove it**: If you remove the destructuring, the code will not extract the values, and the program will not work as expected. If you change the syntax, the code will not work as expected.

---
### Concept 8: String Methods
String methods are used to manipulate and transform strings. They are defined using the `split`, `slice`, and `join` methods.
**General Example**
```javascript
let str = 'hello world';
let words = str.split(' ');
console.log(words); // outputs: ['hello', 'world']
```
**In Our Code**
```javascript
const recipeId = txt.split(' ').slice(2).join(' ').trim();
```
**How it works here**: The code uses the `split`, `slice`, and `join` methods to extract the recipe ID from the input text.
**Why it's used**: String methods are used to manipulate and transform strings, which makes the code more concise and easier to read.
**If you change/remove it**: If you remove the string methods, the code will not extract the recipe ID, and the program will not work as expected. If you change the methods, the code will extract the recipe ID differently.

---
### Concept 9: Object Properties
Object properties are used to access and manipulate the values of an object. They are defined using the `.` or `[]` syntax.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // outputs: John
console.log(person['age']); // outputs: 25
```
**In Our Code**
```javascript
const recipe = getRecipeById(recipeId);
if (!recipe) return { canCraft: false, reason: 'Recipe not found.' };
```
**How it works here**: The code uses the `getRecipeById` function to retrieve the recipe object, and then accesses its properties using the `.` syntax.
**Why it's used**: Object properties are used to access and manipulate the values of an object, which makes the code more concise and easier to read.
**If you change/remove it**: If you remove the object properties, the code will not access the recipe object, and the program will not work as expected. If you change the syntax, the code will not work as expected.

---
### Concept 10: Functions
Functions are used to define reusable blocks of code. They are defined using the `function` keyword.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
function canCraft(userId, recipeId) {
  // ...
}
```
**How it works here**: The code defines a function named `canCraft` that takes two arguments, `userId` and `recipeId`, and returns an object with a `canCraft` property.
**Why it's used**: Functions are used to define reusable blocks of code, which makes the code more concise and easier to read.
**If you change/remove it**: If you remove the function, the code will not define the `canCraft` function, and the program will not work as expected. If you change the function signature, the code will not work as expected.
