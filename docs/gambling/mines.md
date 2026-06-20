# Mines Command Flow (`mines`)

## 1. Description
The Mines command starts a virtual minesweeper gacha game. Players bet Zeni and pick cells on a 5x5 grid. The player can cash out at any time or continue picking safe cells to increase their multiplier. Hitting a mine results in an immediate loss.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j mines 1000 5"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "mines") (L15663)
            └── core/gambling.js
                └── startMines(senderJid, amount, mineCount, economy) (L1177)
                    └── Grid creation (L1204)
                    └── activeMinesGames.set(userId, gameSession)
                    └── user.wallet -= amount
                    └── economy.saveUser(senderJid)
                    └── reply grid/visual to WhatsApp
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
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
- Receives message arrays from Baileys and routes valid notify payloads downstream.

---

### Step 2: Command Matching and Extraction
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Message parser block
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
- Extracts prefix details and resolves parameters.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: 15660-15708
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.startMines` or subcommands

```javascript
if (primaryCmd === "mines") {
  const action = cmdArgs[1] || "";
  if (action === "pick") {
    const cell = cmdArgs[2] || "";
    const result = gambling.minesPick(senderJid, cell, economy);
    return await reply(result.message);
  } else if (action === "out" || action === "cashout") {
    const result = gambling.minesCashOut(senderJid, economy);
    return await reply(result.message);
  } else {
    const betAmount = parseInt(action, 10);
    const mineCount = parseInt(cmdArgs[2] || "3", 10);
    const result = gambling.startMines(senderJid, betAmount, mineCount, economy);
    return await reply(result.message);
  }
}
```

#### Explanation
- Checks subcommands: `"pick"` to sweep a cell, `"out"` to cash out active multipliers, or starts a new session.

---

### Step 4: Game Initializer
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1177-1242
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, mineCount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function startMines(userId, amount, mineCount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds." };

  const mines = parseInt(mineCount);
  if (isNaN(mines) || mines < 1 || mines > 20) return { success: false, message: "❌ Invalid mine count." };

  if (activeMinesGames.has(userId)) return { success: false, message: "❌ Active game exists!" };

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  const grid = new Array(25).fill(false); // false = safe
  let placed = 0;
  while (placed < mines) {
    const idx = Math.floor(Math.random() * 25);
    if (!grid[idx]) {
      grid[idx] = true;
      placed++;
    }
  }

  activeMinesGames.set(userId, { bet: amount, mineCount: mines, grid, revealed: [], multiplier: 1.0, roundCtx: ctx });
  economyModule.saveUser(userId);
}
```

#### Explanation
- Deducts the initial bet, shuffles mines across a 25-cell grid, registers the session key, and saves modifications to the database.

---

## 5. How to Modify
To adjust Mines house edge parameters:
- Locate the multiplier calculation inside `core/gambling.js` (around line 1309):
  ```javascript
  // Change 0.97 (3% house edge) to another float (e.g. 0.95 for 5% house edge)
  game.multiplier = Math.round((0.95 / prob) * 100) / 100;
  ```
- Change the max mines limit (currently 20):
  ```javascript
  if (isNaN(mines) || mines < 1 || mines > 24) { ... } // Raises limit to 24
  ```










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They have a name and a value, and can be changed or updated as needed.
**General Example**
```javascript
let name = 'John';
console.log(name); // outputs: John
```
**In Our Code**
```javascript
const cmdBody = lowerTxt
  .substring(currentPrefix.length)
  .trim();
```
**How it works here**: The `cmdBody` variable is used to store the body of a command message, after removing the prefix and any leading or trailing whitespace.
**Why it's used**: Variables are used to store and manipulate data, making it easier to work with and reuse values in the program.
**If you change/remove it**: If you remove the `cmdBody` variable, the program would not be able to extract the command body from the message, and would likely throw an error.

---
### Concept 2: Conditional Statements
Conditional statements are used to make decisions in a program, based on certain conditions or criteria. They can be used to execute different blocks of code, depending on whether a condition is true or false.
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
if (primaryCmd === "mines") {
  // ...
} else if (action === "out" || action === "cashout") {
  // ...
} else {
  // ...
}
```
**How it works here**: The program uses conditional statements to determine which block of code to execute, based on the value of `primaryCmd` and `action`.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code, based on certain conditions or criteria.
**If you change/remove it**: If you remove the conditional statements, the program would not be able to make decisions and execute different blocks of code, and would likely throw an error or produce unexpected results.

---
### Concept 3: Functions
Functions are reusable blocks of code that can be called multiple times, with different inputs or parameters. They can be used to perform a specific task or operation.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
function startMines(userId, amount, mineCount, economyModule) {
  // ...
}
```
**How it works here**: The `startMines` function is used to start a new game of mines, with the specified user ID, amount, mine count, and economy module.
**Why it's used**: Functions are used to encapsulate reusable code, making it easier to maintain and modify the program.
**If you change/remove it**: If you remove the `startMines` function, the program would not be able to start a new game of mines, and would likely throw an error.

---
### Concept 4: Event Listeners
Event listeners are used to respond to events or changes in the program, such as user input or network requests. They can be used to execute a block of code when a specific event occurs.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('The document was clicked');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The program uses an event listener to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events or changes in the program, making it easier to handle user input and other interactions.
**If you change/remove it**: If you remove the event listener, the program would not be able to respond to the `messages.upsert` event, and would likely miss or ignore new messages.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays, such as mapping, filtering, or reducing.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((num) => num * 2);
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
**How it works here**: The program uses the `map` method to transform an array of messages, and the `Promise.all` method to wait for all the promises to resolve.
**Why it's used**: Array methods are used to manipulate and transform arrays, making it easier to work with and process data.
**If you change/remove it**: If you remove the array methods, the program would not be able to transform or process the array of messages, and would likely throw an error or produce unexpected results.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries. They can be used to wait for a promise to resolve or reject, and to handle the result or error.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // ...
  resolve('Hello, world!');
});
promise.then((result) => {
  console.log(result); // outputs: Hello, world!
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
**How it works here**: The program uses promises to wait for all the messages to be processed, and to handle any errors that may occur.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to work with and process data.
**If you change/remove it**: If you remove the promises, the program would not be able to handle asynchronous operations, and would likely throw an error or produce unexpected results.

---
### Concept 7: Destructuring
Destructuring is used to extract values from an object or array, and to assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
const { messages, type } = async ({ messages, type }) => {
  // ...
};
```
**How it works here**: The program uses destructuring to extract the `messages` and `type` values from the event object, and to assign them to variables.
**Why it's used**: Destructuring is used to extract values from objects or arrays, making it easier to work with and process data.
**If you change/remove it**: If you remove the destructuring, the program would not be able to extract the `messages` and `type` values, and would likely throw an error or produce unexpected results.

---
### Concept 8: Number Parsing
Number parsing is used to convert a string or other value to a number.
**General Example**
```javascript
const str = '123';
const num = parseInt(str);
console.log(num); // outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(action, 10);
const mineCount = parseInt(cmdArgs[2] || "3", 10);
```
**How it works here**: The program uses number parsing to convert the `action` and `cmdArgs[2]` values to numbers, using the `parseInt` function.
**Why it's used**: Number parsing is used to convert strings or other values to numbers, making it easier to work with and process data.
**If you change/remove it**: If you remove the number parsing, the program would not be able to convert the `action` and `cmdArgs[2]` values to numbers, and would likely throw an error or produce unexpected results.

---
### Concept 9: Object Properties
Object properties are used to store and access values in an object.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
console.log(person.name); // outputs: John
console.log(person.age); // outputs: 25
```
**In Our Code**
```javascript
const user = economyModule.getUser(userId);
if (!user) return { success: false, message: "❌ Register first!" };
```
**How it works here**: The program uses object properties to store and access values in the `user` object, such as the `success` and `message` properties.
**Why it's used**: Object properties are used to store and access values in objects, making it easier to work with and process data.
**If you change/remove it**: If you remove the object properties, the program would not be able to store or access values in the `user` object, and would likely throw an error or produce unexpected results.

---
### Concept 10: Math Operations
Math operations are used to perform mathematical calculations, such as addition, subtraction, multiplication, and division.
**General Example**
```javascript
const num1 = 10;
const num2 = 5;
const result = num1 + num2;
console.log(result); // outputs: 15
```
**In Our Code**
```javascript
game.multiplier = Math.round((0.95 / prob) * 100) / 100;
```
**How it works here**: The program uses math operations to calculate the `multiplier` value, using the `Math.round` function and arithmetic operators.
**Why it's used**: Math operations are used to perform mathematical calculations, making it easier to work with and process data.
**If you change/remove it**: If you remove the math operations, the program would not be able to calculate the `multiplier` value, and would likely throw an error or produce unexpected results.
