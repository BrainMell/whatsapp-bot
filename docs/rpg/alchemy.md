# RPG Subsystem: Alchemy

## 1. Description
The Alchemy system manages item brewing, allowing players to combine raw materials and base potions into consumables or stat-boosting items. It solves the problem of resource utility by giving players a progression path to convert scrap loot into highly valuable combat consumables (such as health potions or temporary shields). It acts as a specialized wrapper of the crafting system, utilizing matching databases and inventory deduct/grant protocols.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j brew mega_potion"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (primaryCmd === "brew") (L5095)
            └── core/commands/rpgCommands.js
                └── brewItem(sock, chatId, senderJid, recipeId) (L513)
                    └── craftItem(sock, chatId, senderJid, recipeId, 'BREWING') (L506)
                        └── craftingSystem.performCraft(senderJid, recipeId, 'BREWING')
                            └── inventorySystem.hasInventorySpace(...)
                            └── inventorySystem.removeItem(...)
                            └── inventorySystem.addItem(...)
                            └── Rollback block (if addItem fails)
                        └── sock.sendMessage(chatId, { text: ... })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
* **Inputs**: `{ messages, type }` payload from WhatsApp
* **Outputs**: None (passes control to inner map)

```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify" && type !== "append") return;
  if (isRekeying) return;

  await Promise.all(
    messages.map(async (m) => {
      if (!m.message) return;
```

#### Explanation
- `sock.ev.on("messages.upsert", ...)`: Registers a listener that fires whenever the bot receives new message notifications.
- `if (type !== "notify" && type !== "append") return`: Drops status updates or metadata modifications to only process actual incoming messages.
- `if (isRekeying) return`: Prevents processing when the session encryption keys are refreshing.
- `messages.map(...)`: Iterates over the batch of received messages to process them in parallel.

---

### Step 2: Command Matching
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Inner message processor loop
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: `primaryCmd` and `cmdArgs` array

```javascript
if (lowerTxt.startsWith(currentPrefix)) {
  const cmdBody = lowerTxt
    .substring(currentPrefix.length)
    .trim();
  const cmdArgs = cmdBody.split(" ");
  const primaryCmd = cmdArgs[0];
```

#### Explanation
- `lowerTxt.startsWith(currentPrefix)`: Checks if the incoming text begins with the configured bot prefix (e.g. `.j`).
- `lowerTxt.substring(...)`: Strips the prefix from the message.
- `cmdBody.split(" ")`: Splits the command body by spaces to separate the command name from its arguments.
- `cmdArgs[0]`: Assigns the first element as `primaryCmd` (e.g. `"brew"`).

---

### Step 3: Command Routing for Brew
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 5095
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const rpgCommands = require("./commands/rpgCommands");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `rpgCommands.brewItem`

```javascript
if (primaryCmd === "brew") {
  const recipeId = cmdArgs[1];
  await rpgCommands.brewItem(sock, chatId, senderJid, recipeId);
  return;
}
```

#### Explanation
- `if (primaryCmd === "brew")`: Matches the brewing trigger command.
- `rpgCommands.brewItem(...)`: Routes execution to the rpgCommands handler.

---

### Step 4: Command Handler Wrapper
* **File Path**: `core/commands/rpgCommands.js`
* **Line Numbers**: Around 513
* **Called From**: `core/engine.js`
* **Imported From**: `core/commands/rpgCommands.js` (internal call to craftItem)
* **Inputs**: `(sock, chatId, senderJid, recipeId)`
* **Outputs**: Redirects execution with category filter `'BREWING'`

```javascript
async function brewItem(sock, chatId, senderJid, recipeId) {
  return craftItem(sock, chatId, senderJid, recipeId, 'BREWING');
}
```

#### Explanation
- `brewItem(...)`: Invokes the general `craftItem` function, overriding the third argument to force station validation match the `'BREWING'` category (enforcing Laboratory restrictions).

---

### Step 5: Brew Validation and Execution
* **File Path**: `core/rpg/craftingSystem.js`
* **Line Numbers**: 475-516
* **Called From**: `core/commands/rpgCommands.js`
* **Imported From**: `core/rpg/inventorySystem.js`
* **Inputs**: `(userId, recipeId, requiredStation = 'BREWING')`
* **Outputs**: Mutates user inventory database entries, reports outcome status

```javascript
async function performCraft(userId, recipeId, requiredStation = 'BREWING') {
  const check = canCraft(userId, recipeId);
  if (!check.canCraft) return { success: false, message: check.reason };

  const recipe = check.recipe;
  const resultItem = recipe.result;

  if (recipe.category !== requiredStation) {
    return { success: false, message: "❌ This recipe requires a Laboratory!" };
  }

  if (!inventorySystem.hasInventorySpace(userId, 1, resultItem.id)) {
    return { success: false, message: "❌ Cannot brew: Inventory full!" };
  }

  // Deduct ingredients
  for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
    inventorySystem.removeItem(userId, ingId, qty);
  }

  const addResult = await inventorySystem.addItem(userId, resultItem.id, 1, {
    name: recipe.name,
    stats: resultItem.stats || {},
    slot: resultItem.slot,
    type: 'CONSUMABLE'
  });

  if (!addResult.success) {
    // Rollback ingredients
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
      await inventorySystem.addItem(userId, ingId, qty);
    }
    return addResult;
  }

  return { success: true, message: `🧪 Successfully brewed ${recipe.name}!` };
}
```

#### Explanation
- `canCraft(...)`: Resolves standard item gacha criteria and checks player inventory balances.
- `if (recipe.category !== requiredStation)`: Enforces that the item is registered as a brewing/alchemy recipe.
- `inventorySystem.removeItem(...)`: Deducts potion materials.
- `inventorySystem.addItem(...)`: Adds the consumable potion record to the user's document in the DB.
- **Rollback loop**: Restores ingredient counts if the transaction encounters write/slot errors.

---

## 4. How to Modify
To add a new potion recipe, edit `BREWING_RECIPES` inside `core/rpg/craftingSystem.js`:

```javascript
// BEFORE:
const BREWING_RECIPES = {
  mega_potion: { name: 'Mega Potion', ingredients: { major_potion: 2 }, result: { id: 'mega_potion' } }
};

// AFTER:
const BREWING_RECIPES = {
  mega_potion: { name: 'Mega Potion', ingredients: { major_potion: 2 }, result: { id: 'mega_potion' } },
  elixir_of_gods: { name: 'Elixir of Gods', ingredients: { ambrosia: 5 }, result: { id: 'elixir_of_gods' } }
};
```










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
const cmdBody = lowerTxt
  .substring(currentPrefix.length)
  .trim();
const cmdArgs = cmdBody.split(" ");
const primaryCmd = cmdArgs[0];
```
**How it works here**: In the provided code, variables are used to store the body of a command, the arguments of the command, and the primary command. The `let` and `const` keywords are used to declare these variables.
**Why it's used**: Variables are used to store values that need to be used later in the program. In this case, the variables are used to parse the command and its arguments.
**If you change/remove it**: If you remove the variable declarations, the program will throw an error because the variables are being used later in the code. If you change the variable names, you will need to update all the places where the variables are used.

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
**How it works here**: In the provided code, an arrow function is used as an event listener for the `messages.upsert` event. The function is called whenever the event is triggered.
**Why it's used**: Arrow functions are used to define small, single-purpose functions. In this case, the arrow function is used to handle the `messages.upsert` event.
**If you change/remove it**: If you remove the arrow function, the event listener will not be triggered. If you change the arrow function, you will need to update the code inside the function to handle the event correctly.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program. They are defined using the `on` method.
**General Example**
```javascript
let button = document.getElementById('myButton');
button.addEventListener('click', () => {
  console.log('Button clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the provided code, an event listener is used to respond to the `messages.upsert` event. The event listener is triggered whenever a new message is received.
**Why it's used**: Event listeners are used to respond to events that occur in a program. In this case, the event listener is used to handle new messages.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event. If you change the event listener, you will need to update the code inside the listener to handle the event correctly.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They are defined using the `if` and `else` keywords.
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
**How it works here**: In the provided code, conditional statements are used to check the type of event and the rekeying status. If the conditions are not met, the function returns early.
**Why it's used**: Conditional statements are used to make decisions in a program based on certain conditions. In this case, the conditional statements are used to filter out unwanted events.
**If you change/remove it**: If you remove the conditional statements, the function will not filter out unwanted events. If you change the conditions, you will need to update the code to handle the new conditions correctly.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They are defined using the `map`, `filter`, and `reduce` methods.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubledNumbers = numbers.map((num) => num * 2);
console.log(doubledNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: In the provided code, the `map` method is used to transform the `messages` array into an array of promises. The `Promise.all` method is then used to wait for all the promises to resolve.
**Why it's used**: Array methods are used to manipulate and transform arrays. In this case, the `map` method is used to transform the `messages` array into an array of promises.
**If you change/remove it**: If you remove the `map` method, the `Promise.all` method will not work correctly. If you change the `map` method, you will need to update the code to handle the new transformation correctly.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations in a program. They are defined using the `Promise` constructor.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Operation completed!');
});
promise.then((result) => {
  console.log(result); // Outputs: Operation completed!
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
**How it works here**: In the provided code, promises are used to handle the asynchronous operations of processing the `messages` array. The `Promise.all` method is used to wait for all the promises to resolve.
**Why it's used**: Promises are used to handle asynchronous operations in a program. In this case, promises are used to handle the asynchronous operations of processing the `messages` array.
**If you change/remove it**: If you remove the promises, the asynchronous operations will not be handled correctly. If you change the promises, you will need to update the code to handle the new asynchronous operations correctly.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code. It is defined using the `async` and `await` keywords.
**General Example**
```javascript
async function example() {
  let result = await promise;
  console.log(result); // Outputs: Operation completed!
}
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the provided code, async/await is used to write asynchronous code that is easier to read and maintain. The `async` keyword is used to define an asynchronous function, and the `await` keyword is used to wait for promises to resolve.
**Why it's used**: Async/await is used to make asynchronous code easier to write and maintain. In this case, async/await is used to handle the asynchronous operations of processing the `messages` array.
**If you change/remove it**: If you remove the async/await syntax, the asynchronous code will not be handled correctly. If you change the async/await syntax, you will need to update the code to handle the new asynchronous operations correctly.

---
### Concept 8: String Methods
String methods are used to manipulate and transform strings. They are defined using the `substring`, `trim`, and `split` methods.
**General Example**
```javascript
let string = '   Hello World!   ';
let trimmedString = string.trim();
console.log(trimmedString); // Outputs: Hello World!
```
**In Our Code**
```javascript
const cmdBody = lowerTxt
  .substring(currentPrefix.length)
  .trim();
const cmdArgs = cmdBody.split(" ");
```
**How it works here**: In the provided code, string methods are used to manipulate and transform the `lowerTxt` string. The `substring` method is used to extract the command body, the `trim` method is used to remove whitespace, and the `split` method is used to split the command body into arguments.
**Why it's used**: String methods are used to manipulate and transform strings. In this case, string methods are used to parse the command and its arguments.
**If you change/remove it**: If you remove the string methods, the command and its arguments will not be parsed correctly. If you change the string methods, you will need to update the code to handle the new parsing logic correctly.

---
### Concept 9: Object Destructuring
Object destructuring is a syntax sugar that allows you to extract properties from an object and assign them to variables. It is defined using the `{}` syntax.
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
**How it works here**: In the provided code, object destructuring is used to extract the `messages` and `type` properties from the event object and assign them to variables.
**Why it's used**: Object destructuring is used to make the code more concise and easier to read. In this case, object destructuring is used to extract the `messages` and `type` properties from the event object.
**If you change/remove it**: If you remove the object destructuring, the code will not be as concise and easy to read. If you change the object destructuring, you will need to update the code to handle the new property extraction logic correctly.

---
### Concept 10: Functions
Functions are reusable blocks of code that take arguments and return values. They are defined using the `function` keyword.
**General Example**
```javascript
function add(a, b) {
  return a + b;
}
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
async function brewItem(sock, chatId, senderJid, recipeId) {
  // ...
}
```
**How it works here**: In the provided code, functions are used to define reusable blocks of code that take arguments and return values. The `brewItem` function is used to brew an item based on the provided recipe ID.
**Why it's used**: Functions are used to make the code more modular and reusable. In this case, functions are used to define the brewing logic and make it reusable.
**If you change/remove it**: If you remove the functions, the code will not be as modular and reusable. If you change the functions, you will need to update the code to handle the new logic correctly.

---
### Concept 11: Database Operations
Database operations are used to interact with a database and perform CRUD (Create, Read, Update, Delete) operations. They are defined using the `inventorySystem` object.
**General Example**
```javascript
let db = {
  addItem: (id, item) => {
    // Add item to database
  },
  removeItem: (id, item) => {
    // Remove item from database
  }
};
```
**In Our Code**
```javascript
if (!inventorySystem.hasInventorySpace(userId, 1, resultItem.id)) {
  return { success: false, message: "❌ Cannot brew: Inventory full!" };
}
// Deduct ingredients
for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
  inventorySystem.removeItem(userId, ingId, qty);
}
const addResult = await inventorySystem.addItem(userId, resultItem.id, 1, {
  name: recipe.name,
  stats: resultItem.stats || {},
  slot: resultItem.slot,
  type: 'CONSUMABLE'
});
```
**How it works here**: In the provided code, database operations are used to interact with the inventory system and perform CRUD operations. The `hasInventorySpace` method is used to check if the user has enough inventory space, the `removeItem` method is used to deduct ingredients, and the `addItem` method is used to add the brewed item to the user's inventory.
**Why it's used**: Database operations are used to interact with the database and perform CRUD operations. In this case, database operations are used to manage the user's inventory and perform brewing logic.
**If you change/remove it**: If you remove the database operations, the inventory system will not work correctly. If you change the database operations, you will need to update the code to handle the new logic correctly.
