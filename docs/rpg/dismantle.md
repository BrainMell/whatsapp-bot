# Dismantle Command Flow (`dismantle`)

## 1. Description
The Dismantle command allows players to break down equipment/items in their inventory to recover a percentage of their crafting ingredients (usually 40%). It verifies inventory constraints and updates both the item count and material counts in the player's profile data.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j dismantle 3" or ".j dismantle iron_sword"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check: lowerTxt === ".j dismantle" || startsWith(".j dismantle ") (L8846)
            └── core/commands/rpgCommands.js
                └── dismantleItem(sock, chatId, senderJid, input) (L516)
                    ├── inventorySystem.formatInventory(senderJid)
                    └── core/rpg/craftingSystem.js
                        └── dismantleItem(senderJid, targetItemId) (L534)
                            ├── inventorySystem.getInventory(userId)
                            ├── Find recipe in CRAFTING_RECIPES
                            ├── Compute returned materials: Math.max(1, Math.floor(qty * 0.4))
                            ├── inventorySystem.hasInventorySpace(userId, totalItemsToReturn)
                            ├── inventorySystem.removeItem(userId, itemId, 1)
                            ├── inventorySystem.addItem(userId, id, qty)
                            └── Return success payload with recovered materials message
                    └── sock.sendMessage(chatId, { text: result.message })
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
- Receives the socket event payload from Baileys. Iterates over individual incoming messages.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L8846-L8853)
* **Line Numbers**: 8846-8853
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and sender details
* **Outputs**: Calls `rpgCommands.dismantleItem`

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} dismantle` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} dismantle `)) {
    const input = txt.substring(`${botConfig.getPrefix().toLowerCase()} dismantle`.length).trim();
    if (!input) {
        return await sendUsage(sock, chatId, BOT_MARKER, '⚒️ DISMANTLE', 'dismantle <#bag_index>', 'dismantle 5', 'Break down old equipment to recover some materials.');
    }
    await rpgCommands.dismantleItem(sock, chatId, senderJid, input);
    return;
}
```

#### Explanation
- Catches the `.j dismantle` command.
- Extracts the arguments (either item JID or index number inside the player inventory bag).
- Routes to `rpgCommands.dismantleItem()`.

---

### Step 3: Resolving Item ID from Input
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L516-L526)
* **Line Numbers**: 516-526
* **Called From**: `dismantleItem()`
* **Inputs**: `(sock, chatId, senderJid, input)`
* **Outputs**: Resolves index to item ID, invokes `craftingSystem.dismantleItem()`

```javascript
async function dismantleItem(sock, chatId, senderJid, input) {
    let targetItemId = input;
    if (!isNaN(parseInt(input))) {
        const inventory = inventorySystem.formatInventory(senderJid);
        const index = parseInt(input) - 1;
        if (!inventory.isEmpty && inventory.items[index]) targetItemId = inventory.items[index].id;
    }
    if (!targetItemId) return await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} dismantle <id or bag_#>\`` });
    const result = await craftingSystem.dismantleItem(senderJid, targetItemId);
    await sock.sendMessage(chatId, { text: result.message });
}
```

#### Explanation
1. Checks if the parameter is a valid integer. If yes, it formats the user's inventory layout to extract the exact item ID (e.g., `iron_sword`) at that 1-indexed slot position.
2. Invokes the core backend system method `craftingSystem.dismantleItem()`.
3. Sends the output status returned by the backend system.

---

### Step 4: Core Dismantle Logic & Inventory Sync
* **File Path**: [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js#L534-L571)
* **Line Numbers**: 534-571
* **Called From**: `craftingSystem.dismantleItem()`
* **Inputs**: `(userId, itemId)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
async function dismantleItem(userId, itemId) {
    const inventory = inventorySystem.getInventory(userId);
    if (!inventory[itemId]) return { success: false, message: "Item not found in inventory." };

    const itemData = inventory[itemId];
    const recipe = Object.values(CRAFTING_RECIPES).find(r => r.result.id === itemId);
    
    if (!recipe) return { success: false, message: "This item cannot be dismantled." };

    // Calculate returned materials
    const returned = {};
    let totalItemsToReturn = 0;
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
        const amount = Math.max(1, Math.floor(qty * 0.4));
        returned[ingId] = amount;
        totalItemsToReturn++;
    }

    // Check for enough space for all materials
    if (!inventorySystem.hasInventorySpace(userId, totalItemsToReturn)) {
        return { success: false, message: "❌ Not enough inventory space to store recovered materials!" };
    }

    // Remove item
    inventorySystem.removeItem(userId, itemId, 1);

    // Return materials
    for (const [id, qty] of Object.entries(returned)) {
        await inventorySystem.addItem(userId, id, qty);
    }

    let msg = `♻️ *DISMANTLED: ${itemData.name || itemId}*\n\nRecovered materials:\n`;
    for (const [id, qty] of Object.entries(returned)) {
        msg += `- ${qty}x ${lootSystem.getItemInfo(id).name}\n`;
    }

    return { success: true, message: msg };
}
```

#### Explanation
1. Checks the user's inventory cache.
2. Finds the item recipe in `CRAFTING_RECIPES`. If the item cannot be crafted, it cannot be dismantled.
3. Computes the material returns at a 40% rate (`qty * 0.4`), rounded down, with a minimum of 1.
4. Asserts inventory space before modifying collections.
5. Deducts 1 unit of the source item via `inventorySystem.removeItem()`.
6. Adds the calculated ingredients via `inventorySystem.addItem()`.
7. Formats and returns a success payload listing all the recovered materials.

---

## 4. How to Modify
- **Modify Return Percentage**: Locate [core/rpg/craftingSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/craftingSystem.js#L547) and change the multiplier `0.4` (currently 40%).
- **Add Dismantlable Recipes**: Add or modify definitions in `CRAFTING_RECIPES` inside `core/rpg/craftingSystem.js`.










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
const input = txt.substring(`${botConfig.getPrefix().toLowerCase()} dismantle`.length).trim();
```
**How it works here**: The code is creating a new variable named `input` and assigning it the value of the text after the command prefix.
**Why it's used**: Variables are used to store values that will be used later in the program, making the code more readable and easier to maintain.
**If you change/remove it**: If you remove this line, the program will not be able to extract the input from the user's message, and the dismantle command will not work as expected.

---
### Concept 2: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They allow the program to make decisions and respond accordingly.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult');
} else {
  console.log('You are a minor');
}
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} dismantle` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} dismantle `)) {
  // code to handle dismantle command
}
```
**How it works here**: The code is checking if the user's message matches the dismantle command, and if so, it executes the code inside the if statement.
**Why it's used**: Conditional statements are used to handle different scenarios and make the program more interactive and responsive.
**If you change/remove it**: If you remove this conditional statement, the program will not be able to handle the dismantle command, and the user's message will be ignored.

---
### Concept 3: Functions
Functions are reusable blocks of code that perform a specific task. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
async function dismantleItem(sock, chatId, senderJid, input) {
  // code to handle dismantle item
}
```
**How it works here**: The code is defining a new function named `dismantleItem` that takes four arguments and performs the task of dismantling an item.
**Why it's used**: Functions are used to organize code, reduce repetition, and make the program more modular and maintainable.
**If you change/remove it**: If you remove this function, the program will not be able to handle the dismantle item task, and the dismantle command will not work as expected.

---
### Concept 4: Event Listeners
Event listeners are used to respond to events or actions that occur in the program, such as user input or network requests.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Mouse clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code to handle new messages
});
```
**How it works here**: The code is setting up an event listener to respond to new messages, and when a new message is received, it executes the code inside the event listener.
**Why it's used**: Event listeners are used to handle asynchronous events and make the program more interactive and responsive.
**If you change/remove it**: If you remove this event listener, the program will not be able to respond to new messages, and the dismantle command will not work as expected.

---
### Concept 5: Array Methods
Array methods are used to perform operations on arrays, such as mapping, filtering, and reducing.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map(num => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // code to handle each message
  })
);
```
**How it works here**: The code is using the `map` method to iterate over the `messages` array and perform an asynchronous operation on each message.
**Why it's used**: Array methods are used to simplify array operations and make the code more concise and readable.
**If you change/remove it**: If you remove this array method, the program will not be able to handle each message individually, and the dismantle command will not work as expected.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('Hello, world!');
  }, 2000);
});
promise.then((message) => {
  console.log(message); // Outputs: Hello, world!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // code to handle each message
  })
);
```
**How it works here**: The code is using promises to handle the asynchronous operations of handling each message, and when all promises are resolved, it continues executing the code.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**If you change/remove it**: If you remove this promise, the program will not be able to handle the asynchronous operations, and the dismantle command will not work as expected.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that makes asynchronous code look and feel like synchronous code.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
async function dismantleItem(sock, chatId, senderJid, input) {
  // code to handle dismantle item
}
```
**How it works here**: The code is using async/await to handle the asynchronous operations of dismantling an item, and it makes the code look and feel like synchronous code.
**Why it's used**: Async/await is used to simplify asynchronous code and make it more readable and maintainable.
**If you change/remove it**: If you remove this async/await syntax, the program will not be able to handle the asynchronous operations, and the dismantle command will not work as expected.

---
### Concept 8: String Methods
String methods are used to perform operations on strings, such as substring, trim, and toLowerCase.
**General Example**
```javascript
const str = 'Hello, world!';
const substr = str.substring(7);
console.log(substr); // Outputs: world!
```
**In Our Code**
```javascript
const input = txt.substring(`${botConfig.getPrefix().toLowerCase()} dismantle`.length).trim();
```
**How it works here**: The code is using the `substring` method to extract the input from the user's message, and the `trim` method to remove any whitespace.
**Why it's used**: String methods are used to simplify string operations and make the code more concise and readable.
**If you change/remove it**: If you remove this string method, the program will not be able to extract the input from the user's message, and the dismantle command will not work as expected.

---
### Concept 9: Number Parsing
Number parsing is used to convert a string to a number.
**General Example**
```javascript
const str = '123';
const num = parseInt(str);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
if (!isNaN(parseInt(input))) {
  const inventory = inventorySystem.formatInventory(senderJid);
  const index = parseInt(input) - 1;
  // code to handle inventory index
}
```
**How it works here**: The code is using the `parseInt` function to convert the input to a number, and then using the number to access an inventory index.
**Why it's used**: Number parsing is used to convert user input to a number, and then use the number to perform operations.
**If you change/remove it**: If you remove this number parsing, the program will not be able to convert the input to a number, and the dismantle command will not work as expected.

---
### Concept 10: Object Destructuring
Object destructuring is used to extract properties from an object and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 30 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**
```javascript
const { messages, type } = messages.upsert;
```
**How it works here**: The code is using object destructuring to extract the `messages` and `type` properties from the `messages.upsert` object.
**Why it's used**: Object destructuring is used to simplify object access and make the code more concise and readable.
**If you change/remove it**: If you remove this object destructuring, the program will not be able to access the `messages` and `type` properties, and the dismantle command will not work as expected.

---
### Concept 11: Database Operations
Database operations are used to interact with a database, such as adding, removing, or updating data.
**General Example**
```javascript
const db = require('db');
db.insert({ name: 'John', age: 30 });
```
**In Our Code**
```javascript
const inventory = inventorySystem.formatInventory(senderJid);
const index = parseInt(input) - 1;
if (!inventory.isEmpty && inventory.items[index]) targetItemId = inventory.items[index].id;
```
**How it works here**: The code is using database operations to interact with the inventory system, such as accessing and updating inventory data.
**Why it's used**: Database operations are used to store and manage data, and provide a way to interact with the data.
**If you change/remove it**: If you remove this database operation, the program will not be able to interact with the inventory system, and the dismantle command will not work as expected.
