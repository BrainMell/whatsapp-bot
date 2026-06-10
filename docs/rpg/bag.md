# Inventory Command Flow (`inventory`, `bag`)

## 1. Description
The Inventory command (aliased as `bag`) displays a paginated overview of the items inside the player's inventory, grouped by rarity tier. It displays item quantities, equipped marks, and direct stat differences for unequipped equipment compared against items currently active in that slot.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j inventory" or ".j bag 2"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "inventory" || "bag") (L5099)
            └── Parse page: page = parseInt(cmdArgs[1]) || 1
            └── core/commands/rpgCommands.js
                └── displayInventory(sock, chatId, senderJid, page) (L157)
                    └── inventorySystem.formatInventory(senderJid)
                    └── inventorySystem.getEquipment(senderJid)
                    └── Retrieve wallet balance and GP
                    └── Sort items based on rarity order (MYTHIC to COMMON)
                    └── Paginate flat ordered list (12 items per page)
                    └── Loop page items:
                        └── Check if item is currently equipped
                        └── If unequipped EQUIPMENT -> compare stats difference (delta) against slot-equipped item
            └── sock.sendMessage(chatId, { text: msg }) (L252)
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5099)
* **Line Numbers**: Around 5099
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `cmdArgs`
* **Outputs**: Redirects execution to `rpgCommands.displayInventory`

```javascript
                    if (primaryCmd === "inventory" || primaryCmd === "bag") {
                      const page = parseInt(cmdArgs[1]) || 1;
                      await rpgCommands.displayInventory(
                        sock,
                        chatId,
                        senderJid,
                        page,
                      );
                      return;
                    }
```

#### Explanation
- Catches the `.j inventory` or `.j bag` commands.
- Parses the second argument as a page number (defaults to 1).
- Invokes `rpgCommands.displayInventory`.

---

### Step 3: Fetching and Ordering Inventory Items
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L157-L196)
* **Line Numbers**: 157-196
* **Called From**: `displayInventory()`
* **Imported From**: `core/rpg/inventorySystem` & `core/rpg/economy`
* **Inputs**: `(sock, chatId, senderJid, page)`
* **Outputs**: Ordered list of items for the requested page index

```javascript
async function displayInventory(sock, chatId, senderJid, page = 1) {
  const formatted = inventorySystem.formatInventory(senderJid);
  const equipment = inventorySystem.getEquipment(senderJid);
  const equippedIds = Object.values(equipment).filter(i => i !== null).map(i => i.id);
  const economyUser = economy.getUser(senderJid);
  const currency = getCurrency();
  const walletBalance = economyUser?.wallet || 0;
  const questGold = economyUser?.questGold || 0;

  const ITEMS_PER_PAGE = 12;
  const rarityOrder = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];
  ...
  // Build flat ordered list
  const orderedItems = [];
  const rarityGroups = {};
  for (const item of formatted.items) {
    if (!rarityGroups[item.rarity]) rarityGroups[item.rarity] = [];
    rarityGroups[item.rarity].push(item);
  }
  for (const rarity of rarityOrder) {
    if (rarityGroups[rarity]) orderedItems.push(...rarityGroups[rarity]);
  }

  const totalItems = orderedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const pageItems = orderedItems.slice((clampedPage - 1) * ITEMS_PER_PAGE, clampedPage * ITEMS_PER_PAGE);
  const pageStartIndex = (clampedPage - 1) * ITEMS_PER_PAGE;
```

#### Explanation
- Calls `inventorySystem.formatInventory(senderJid)` to parse the raw inventory fields from MongoDB.
- Compiles a list of currently equipped item JIDs.
- Groups and sorts items by rarity (Mythic > Legendary > Epic > Rare > Uncommon > Common).
- Extracts the slice corresponding to the page requested.

---

### Step 4: Comparing Stats Deltas and Formatting
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L197-L238)
* **Line Numbers**: 197-238
* **Called From**: `displayInventory()`
* **Inputs**: Page slice array, current equipped slot structures
* **Outputs**: Formatted bag text

```javascript
    // Stat delta (equipment only, compact)
    if (item.type === 'EQUIPMENT' && !isEquipped && item.stats) {
      const slot = item.slot;
      const equippedInSlot = equipment[slot];
      let statLine = '';
      if (equippedInSlot?.stats) {
        const parts = [];
        for (const s of ['atk', 'def', 'mag', 'hp', 'spd']) {
          const delta = (item.stats[s] || 0) - (equippedInSlot.stats[s] || 0);
          if (delta !== 0) parts.push(`${s.toUpperCase()}${delta > 0 ? '🟢+' : '🔴'}${delta}`);
        }
        if (parts.length) statLine = `  📊 ${parts.join(' ')}\n`;
      } else {
        const parts = Object.entries(item.stats).filter(([,v]) => v).map(([s, v]) => `${s.toUpperCase()}+${v}`);
        if (parts.length) statLine = `  ✨ ${parts.join(' ')}\n`;
      }
      msg += statLine;
    }
```

#### Explanation
- Loops through the page items. If the item is an unequipped equipment piece, checks if the player already has an item active in that slot.
- Computes stat differences: ATK, DEF, MAG, HP, SPD delta. Displays positive stats changes with a green dot `🟢+` and negative values with a red dot `🔴`.
- Assembles page navigation buttons and usage tips.
- Sends the text output directly to the WhatsApp chat thread.

---

## 4. How to Modify
To adjust bag parameters:
- **Change Items Displayed per Page (default 12)**: Modify the constant `ITEMS_PER_PAGE` in [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L166).
- **Edit Rarity Color Schemes / Icons**: Adjust the `ITEM_RARITY` dictionary properties in `core/rpg/inventorySystem.js`.










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
const page = parseInt(cmdArgs[1]) || 1;
const economyUser = economy.getUser(senderJid);
```
**How it works here**: Variables are used to store values such as the current page number, economy user data, and other relevant information.
**Why it's used**: Variables are used to store and reuse values throughout the program, making it easier to write and maintain code.
**If you change/remove it**: If you remove or change a variable, the code that relies on it will break, resulting in errors or unexpected behavior.

---
### Concept 2: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They allow you to execute different blocks of code depending on whether a condition is true or false.
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
if (type !== "notify" && type !== "append") return;
if (primaryCmd === "inventory" || primaryCmd === "bag") {
  ...
}
```
**How it works here**: Conditional statements are used to check conditions such as the type of message, the primary command, and other relevant conditions.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on certain conditions, making the program more dynamic and interactive.
**If you change/remove it**: If you remove or change a conditional statement, the program may not behave as expected, leading to errors or unexpected behavior.

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
async function displayInventory(sock, chatId, senderJid, page = 1) {
  ...
}
```
**How it works here**: Functions are used to perform tasks such as displaying the inventory, getting the economy user data, and other relevant tasks.
**Why it's used**: Functions are used to organize code, make it reusable, and reduce duplication, making the program more maintainable and efficient.
**If you change/remove it**: If you remove or change a function, the code that relies on it will break, resulting in errors or unexpected behavior.

---
### Concept 4: Array Methods
Array methods are used to manipulate and interact with arrays. They provide a way to perform common operations such as mapping, filtering, and reducing.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(num => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
const orderedItems = [];
const rarityGroups = {};
for (const item of formatted.items) {
  if (!rarityGroups[item.rarity]) rarityGroups[item.rarity] = [];
  rarityGroups[item.rarity].push(item);
}
for (const rarity of rarityOrder) {
  if (rarityGroups[rarity]) orderedItems.push(...rarityGroups[rarity]);
}
```
**How it works here**: Array methods are used to manipulate and interact with arrays such as the `formatted.items` array.
**Why it's used**: Array methods are used to perform common operations on arrays, making the code more concise and efficient.
**If you change/remove it**: If you remove or change an array method, the code that relies on it will break, resulting in errors or unexpected behavior.

---
### Concept 5: Object Destructuring
Object destructuring is a way to extract properties from an object and assign them to variables.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
const { messages, type } = messages.upsert;
```
**How it works here**: Object destructuring is used to extract properties from objects such as the `messages.upsert` object.
**Why it's used**: Object destructuring is used to simplify code and make it more readable by extracting properties from objects and assigning them to variables.
**If you change/remove it**: If you remove or change object destructuring, the code that relies on it will break, resulting in errors or unexpected behavior.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations in JavaScript. They provide a way to execute code when a promise is resolved or rejected.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('Hello, World!');
  }, 2000);
});
promise.then((message) => {
  console.log(message); // Outputs: Hello, World!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    ...
  })
);
```
**How it works here**: Promises are used to handle asynchronous operations such as mapping over an array of messages.
**Why it's used**: Promises are used to handle asynchronous operations, making the code more efficient and easier to maintain.
**If you change/remove it**: If you remove or change a promise, the code that relies on it will break, resulting in errors or unexpected behavior.

---
### Concept 7: Async/Await
Async/await is a way to write asynchronous code that is easier to read and maintain. It provides a way to pause and resume execution of a function.
**General Example**
```javascript
async function example() {
  let data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
async function displayInventory(sock, chatId, senderJid, page = 1) {
  ...
}
```
**How it works here**: Async/await is used to write asynchronous code that is easier to read and maintain.
**Why it's used**: Async/await is used to simplify asynchronous code, making it easier to read and maintain.
**If you change/remove it**: If you remove or change async/await, the code that relies on it will break, resulting in errors or unexpected behavior.

---
### Concept 8: Event Listeners
Event listeners are used to respond to events such as messages, clicks, and other interactions.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  ...
});
```
**How it works here**: Event listeners are used to respond to events such as messages being updated.
**Why it's used**: Event listeners are used to respond to events, making the program more interactive and dynamic.
**If you change/remove it**: If you remove or change an event listener, the code that relies on it will break, resulting in errors or unexpected behavior.

---
### Concept 9: Parsing Numbers
Parsing numbers is the process of converting a string to a number.
**General Example**
```javascript
let string = '123';
let number = parseInt(string);
console.log(number); // Outputs: 123
```
**In Our Code**
```javascript
const page = parseInt(cmdArgs[1]) || 1;
```
**How it works here**: Parsing numbers is used to convert a string to a number, such as the page number.
**Why it's used**: Parsing numbers is used to convert strings to numbers, making it possible to perform mathematical operations.
**If you change/remove it**: If you remove or change parsing numbers, the code that relies on it will break, resulting in errors or unexpected behavior.

---
### Concept 10: Math Operations
Math operations are used to perform mathematical calculations such as addition, subtraction, multiplication, and division.
**General Example**
```javascript
let a = 2;
let b = 3;
let sum = a + b;
console.log(sum); // Outputs: 5
```
**In Our Code**
```javascript
const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
```
**How it works here**: Math operations are used to perform calculations such as calculating the total number of pages.
**Why it's used**: Math operations are used to perform mathematical calculations, making it possible to perform complex operations.
**If you change/remove it**: If you remove or change a math operation, the code that relies on it will break, resulting in errors or unexpected behavior.
