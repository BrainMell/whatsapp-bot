# Scratch Command Flow (`scratch`)

## 1. Description
The Scratch command buys a virtual scratch card. The player must match 3 identical symbols in a 3x3 grid to win a payout corresponding to the matching symbol's multiplier.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j scratch 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "scratch") (L15758)
            └── core/gambling.js
                └── scratchCard(senderJid, amount, economy) (L2138)
                    └── beginGamblingRound(user)
                    └── Draw 9 symbols randomly (L2154)
                    └── check counts for 3x matching winning symbols
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual grid / outcome to WhatsApp
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
* **Line Numbers**: 15755-15777
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.scratchCard`

```javascript
if (primaryCmd === "scratch") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.scratchCard(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.scratchCard` with the parsed bet amount.

---

### Step 4: Scratch Card Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 2138-2246
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function scratchCard(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  // Balanced symbol pools
  const winningSymbols = ['💎', '7️⃣', '🍀', '🔔', '🍒', '🍋'];
  const fillerSymbols = ['🍎', '🍊', '🍇', '🍉', '🍓', '🥑', '🍌', '🍍', '🥥', '🥭', '🥝', '🌽', '🥕', '🍆'];
  const symbols = [...winningSymbols, ...fillerSymbols];

  // Draw 9 random slots
  const card = [];
  for (let i = 0; i < 9; i++) {
    card.push(symbols[Math.floor(Math.random() * symbols.length)]);
  }

  // Count occurrences
  const counts = {};
  card.forEach(s => counts[s] = (counts[s] || 0) + 1);

  // Check 3 matches
  let winner = null;
  for (const s of winningSymbols) {
    if (counts[s] >= 3) {
      winner = s;
      break;
    }
  }

  if (maybeForceLoss(ctx)) winner = null;

  let multiplier = 0;
  if (winner) {
    const symbolMultipliers = { '💎': 50, '7️⃣': 15, '🍀': 8, '🔔': 4, '🍒': 2.5, '🍋': 1.5 };
    multiplier = symbolMultipliers[winner] || 1.1;
  }

  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * multiplier, ctx)) : 0;
  user.wallet += winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Draws 9 symbols at random from a mixed array of winning symbols and filler symbols.
- Counts occurrences of each symbol. If a winning symbol appears 3 or more times, the player wins the corresponding multiplier payout.
- Evaluates forced loss, daily limits, and persists the player wallet changes.

---

## 5. How to Modify
To adjust Scratch Card multipliers or symbols:
- Edit the payout table values in `core/gambling.js` (around line 2182):
  ```javascript
  const symbolMultipliers = {
      '💎': 100, // Raised diamond match payout to 100x
      '7️⃣': 25
  };
  ```
- Adjust winning symbol ratios:
  ```javascript
  const winningSymbols = ['💎', '7️⃣', '🍀']; // Reduces winning symbols options to raise difficulty
  ```
Prefixes, limits, and house edge variables are fully configurable.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They have a name, and you can assign a value to them.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const currentPrefix = '!';
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
```
**How it works here**: Variables are used to store values such as the current prefix, command body, and user ID. These values are then used in the program to make decisions and perform actions.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to write and maintain the code.
**If you change/remove it**: If you remove or change a variable, the program may not work as expected. For example, if you remove the `currentPrefix` variable, the program will not be able to correctly parse the command.

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
if (primaryCmd === "scratch") {
  // code to handle scratch command
}
```
**How it works here**: Conditional statements are used to check the type of message, the command, and other conditions to determine what actions to take.
**Why it's used**: Conditional statements are used to make decisions in the program and execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove or change a conditional statement, the program may not work as expected. For example, if you remove the `if (type !== "notify" && type !== "append")` statement, the program may process messages that it should not.

---
### Concept 3: Functions
Functions are blocks of code that can be called multiple times from different parts of a program. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function scratchCard(userId, amount, economyModule) {
  // code to handle scratch card game
}
```
**How it works here**: Functions are used to organize the code and make it reusable. The `scratchCard` function is called when the user runs the scratch command.
**Why it's used**: Functions are used to break down the code into smaller, manageable pieces and make it easier to maintain and reuse.
**If you change/remove it**: If you remove or change a function, the program may not work as expected. For example, if you remove the `scratchCard` function, the program will not be able to handle the scratch command.

---
### Concept 4: Array Methods
Array methods are used to manipulate and interact with arrays. They can be used to add, remove, and modify elements in an array.
**General Example**
```javascript
let numbers = [1, 2, 3];
numbers.push(4); // adds 4 to the end of the array
console.log(numbers); // Outputs: [1, 2, 3, 4]
```
**In Our Code**
```javascript
const winningSymbols = ['💎', '7️⃣', '🍀', '🔔', '🍒', '🍋'];
const fillerSymbols = ['🍎', '🍊', '🍇', '🍉', '🍓', '🥑'];
const symbols = [...winningSymbols, ...fillerSymbols];
```
**How it works here**: Array methods are used to create and manipulate arrays of symbols. The spread operator (`...`) is used to combine two arrays into one.
**Why it's used**: Array methods are used to work with arrays and make it easier to manipulate and interact with them.
**If you change/remove it**: If you remove or change an array method, the program may not work as expected. For example, if you remove the `winningSymbols` array, the program will not be able to determine the winning symbols.

---
### Concept 5: Object Literals
Object literals are used to create objects in a program. They consist of key-value pairs and can be used to store and manipulate data.
**General Example**
```javascript
let person = {
  name: 'John',
  age: 25
};
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const symbolMultipliers = {
  '💎': 50,
  '7️⃣': 15,
  '🍀': 8,
  '🔔': 4,
  '🍒': 2.5,
  '🍋': 1.5
};
```
**How it works here**: Object literals are used to create objects that store data, such as the symbol multipliers.
**Why it's used**: Object literals are used to create objects and store data in a program.
**If you change/remove it**: If you remove or change an object literal, the program may not work as expected. For example, if you remove the `symbolMultipliers` object, the program will not be able to determine the multiplier for each symbol.

---
### Concept 6: Event Listeners
Event listeners are used to respond to events in a program, such as user input or network requests. They allow you to execute code when a specific event occurs.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('You clicked the page!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code to handle message upsert event
});
```
**How it works here**: Event listeners are used to respond to events, such as the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events and execute code when a specific event occurs.
**If you change/remove it**: If you remove or change an event listener, the program may not work as expected. For example, if you remove the `messages.upsert` event listener, the program will not be able to handle new messages.

---
### Concept 7: Promises
Promises are used to handle asynchronous operations in a program. They allow you to execute code when a specific operation is complete.
**General Example**
```javascript
fetch('https://api.example.com/data')
  .then(response => response.json())
  .then(data => console.log(data));
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // code to handle message
  })
);
```
**How it works here**: Promises are used to handle asynchronous operations, such as processing messages.
**Why it's used**: Promises are used to handle asynchronous operations and make it easier to write and maintain the code.
**If you change/remove it**: If you remove or change a promise, the program may not work as expected. For example, if you remove the `Promise.all` statement, the program may not wait for all messages to be processed before continuing.

---
### Concept 8: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write and read asynchronous code.
**General Example**
```javascript
async function fetchData() {
  const response = await fetch('https://api.example.com/data');
  const data = await response.json();
  console.log(data);
}
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code to handle message upsert event
});
```
**How it works here**: Async/await is used to write asynchronous code that is easier to read and maintain.
**Why it's used**: Async/await is used to make it easier to write and read asynchronous code.
**If you change/remove it**: If you remove or change an async/await statement, the program may not work as expected. For example, if you remove the `async` keyword, the program may not be able to handle asynchronous operations correctly.

---
### Concept 9: Destructuring
Destructuring is a syntax feature that allows you to extract values from arrays and objects and assign them to variables.
**General Example**
```javascript
const person = {
  name: 'John',
  age: 25
};
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
const { messages, type } = { messages: [], type: 'notify' };
```
**How it works here**: Destructuring is used to extract values from objects and assign them to variables.
**Why it's used**: Destructuring is used to make it easier to work with objects and arrays.
**If you change/remove it**: If you remove or change a destructuring statement, the program may not work as expected. For example, if you remove the `const { messages, type }` statement, the program will not be able to extract the values from the object.

---
### Concept 10: Number Parsing
Number parsing is the process of converting a string to a number.
**General Example**
```javascript
const str = '123';
const num = parseInt(str);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: Number parsing is used to convert the bet amount from a string to a number.
**Why it's used**: Number parsing is used to convert strings to numbers so that they can be used in mathematical operations.
**If you change/remove it**: If you remove or change a number parsing statement, the program may not work as expected. For example, if you remove the `parseInt` statement, the program will not be able to convert the bet amount to a number.
