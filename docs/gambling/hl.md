# Higher/Lower Command Flow (`hl`)

## 1. Description
The Higher/Lower command asks the player to guess if the second random card drawn (from 1 to 13) is higher or lower than the first card drawn. Ties result in a refund.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j hl 1000 higher"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "hl") (L15865)
            └── core/gambling.js
                └── higherLower(senderJid, amount, guess, economy) (L1872)
                    └── Guess validation
                    └── beginGamblingRound(user)
                    └── Draw two random values 1-13
                    └── evaluate ties (first === second)
                    └── maybeForceLoss(ctx)
                    └── user.wallet +/-= amount
                    └── economy.saveUser(senderJid)
                    └── reply visual / card comparison to WhatsApp
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
* **Line Numbers**: Around 15865 (inside gambling router segment)
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.higherLower`

```javascript
if (primaryCmd === "hl") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const guess = cmdArgs[2] || "";
  const result = gambling.higherLower(senderJid, betAmount, guess, economy);
  return await reply(result.message);
}
```

#### Explanation
- Parses the bet amount and card prediction guess parameter (`"higher"`/`"lower"`), then delegates execution to the gambling module.

---

### Step 4: Game Roll and Card Validation
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1872-1993
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, guess, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function higherLower(userId, amount, guess, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const normalizedGuess = guess.toLowerCase();
  if (!['higher', 'lower', 'h', 'l'].includes(normalizedGuess)) {
    return { success: false, message: "❌ Choose 'higher' or 'lower'!" };
  }

  const userGuess = normalizedGuess.startsWith('h') ? 'higher' : 'lower';
  const ctx = beginGamblingRound(user);

  // Roll two cards 1-13
  const firstCard = Math.floor(Math.random() * 13) + 1;
  const secondCard = Math.floor(Math.random() * 13) + 1;

  if (firstCard === secondCard) {
    // Refund tie
    economyModule.logTransaction(userId, "Higher/Lower Tie", 0, user.wallet);
    return { success: true, won: null, message: "Tie refund visual message" };
  }

  const actualResult = secondCard > firstCard ? 'higher' : 'lower';
  const won = userGuess === actualResult && !maybeForceLoss(ctx);

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount, ctx));
    user.wallet += gain;
    trackDailyNet(user, gain);
  } else {
    user.wallet -= amount;
    trackDailyNet(user, -amount);
  }

  economyModule.saveUser(userId);
}
```

#### Explanation
- Asserts that the player's guess is either a variation of "higher" or "lower".
- Generates two pseudo-random integers representing cards (`1-13`).
- Compares values. If they match, registers a tie and returns the wagered money.
- Checks outcomes, applies edge reductions, and adjusts wallets in MongoDB.

---

## 5. How to Modify
To adjust Card boundaries or change tie rules:
- Modify card deck range in `core/gambling.js` (around line 1893):
  ```javascript
  // Change 13 to another integer (e.g. 10 to simulate a smaller pool)
  const firstCard = Math.floor(Math.random() * 10) + 1;
  ```
- Make ties result in a loss for the player:
  ```javascript
  // Remove the check for firstCard === secondCard and count equal cards as a loss.
  ```
Prefixes, limit caps, and house edges can be customized directly in the same block.










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
const cmdBody = lowerTxt
  .substring(currentPrefix.length)
  .trim();
```
**How it works here**: The code assigns the result of trimming and substring operations on `lowerTxt` to a constant variable named `cmdBody`.
**Why it's used**: Variables are used to store intermediate results and make the code more readable.
**If you change/remove it**: If you remove this line, the `cmdBody` variable would not be defined, causing an error when trying to access it later in the code.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They have an implicit return statement.
**General Example**
```javascript
const greet = (name) => `Hello, ${name}!`;
console.log(greet('John')); // Outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code defines an event listener using an arrow function, which is called when the "messages.upsert" event occurs.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise.
**If you change/remove it**: If you remove the arrow function, the event listener would not be defined, and the code would not respond to the "messages.upsert" event.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They allow your code to respond to user interactions or other events.
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
**How it works here**: The code sets up an event listener for the "messages.upsert" event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to user interactions or other events, making the code interactive.
**If you change/remove it**: If you remove the event listener, the code would not respond to the "messages.upsert" event, and the message processing logic would not be executed.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions.
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
**How it works here**: The code checks the value of the `type` variable and returns early if it's not "notify" or "append".
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on conditions.
**If you change/remove it**: If you remove this line, the code would not filter out unwanted message types, potentially causing errors or unexpected behavior.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They provide a concise way to perform common operations.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((num) => num * 2);
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
**How it works here**: The code uses the `map` method to transform the `messages` array into an array of promises, which are then awaited using `Promise.all`.
**Why it's used**: Array methods are used to manipulate and transform arrays, making the code more concise and efficient.
**If you change/remove it**: If you remove this line, the code would not process the messages array, and the message processing logic would not be executed.

---
### Concept 6: String Methods
String methods are used to manipulate and transform strings. They provide a concise way to perform common operations.
**General Example**
```javascript
const greeting = 'Hello, World!';
const trimmedGreeting = greeting.trim();
console.log(trimmedGreeting); // Outputs: Hello, World!
```
**In Our Code**
```javascript
const cmdBody = lowerTxt
  .substring(currentPrefix.length)
  .trim();
```
**How it works here**: The code uses the `substring` and `trim` methods to extract and trim the command body from the `lowerTxt` string.
**Why it's used**: String methods are used to manipulate and transform strings, making the code more concise and efficient.
**If you change/remove it**: If you remove this line, the code would not extract and trim the command body, potentially causing errors or unexpected behavior.

---
### Concept 7: Number Parsing
Number parsing is used to convert strings to numbers. It's essential for performing mathematical operations.
**General Example**
```javascript
const stringNumber = '42';
const parsedNumber = parseInt(stringNumber, 10);
console.log(parsedNumber); // Outputs: 42
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: The code uses the `parseInt` function to convert the second command argument to a number.
**Why it's used**: Number parsing is used to convert strings to numbers, making it possible to perform mathematical operations.
**If you change/remove it**: If you remove this line, the code would not convert the command argument to a number, potentially causing errors or unexpected behavior.

---
### Concept 8: Object Destructuring
Object destructuring is used to extract properties from objects and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code uses object destructuring to extract the `messages` and `type` properties from the event object.
**Why it's used**: Object destructuring is used to extract properties from objects and assign them to variables, making the code more concise and readable.
**If you change/remove it**: If you remove this line, the code would not extract the `messages` and `type` properties, potentially causing errors or unexpected behavior.

---
### Concept 9: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Success!');
});
promise.then((result) => {
  console.log(result); // Outputs: Success!
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
**How it works here**: The code uses promises to handle the asynchronous message processing and waits for all promises to resolve using `Promise.all`.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**If you change/remove it**: If you remove this line, the code would not wait for the message processing to complete, potentially causing errors or unexpected behavior.

---
### Concept 10: Random Number Generation
Random number generation is used to generate random numbers, which can be used in various applications, such as games or simulations.
**General Example**
```javascript
const randomNumber = Math.floor(Math.random() * 10) + 1;
console.log(randomNumber); // Outputs: a random number between 1 and 10
```
**In Our Code**
```javascript
const firstCard = Math.floor(Math.random() * 13) + 1;
const secondCard = Math.floor(Math.random() * 13) + 1;
```
**How it works here**: The code uses the `Math.random` function to generate two random numbers between 1 and 13, simulating the drawing of two cards.
**Why it's used**: Random number generation is used to add an element of chance or unpredictability to the game.
**If you change/remove it**: If you remove this line, the code would not generate random numbers, and the game would not be random or unpredictable.

---
### Concept 11: Conditional Statements with Multiple Conditions
Conditional statements with multiple conditions are used to execute different blocks of code based on multiple conditions or decisions.
**General Example**
```javascript
let age = 25;
let country = 'USA';
if (age >= 18 && country === 'USA') {
  console.log('You are an adult in the USA!');
} else {
  console.log('You are not an adult in the USA!');
}
```
**In Our Code**
```javascript
if (primaryCmd === "hl") {
  // ...
}
```
**How it works here**: The code checks if the primary command is "hl" and executes the corresponding block of code.
**Why it's used**: Conditional statements with multiple conditions are used to make decisions and execute different blocks of code based on multiple conditions.
**If you change/remove it**: If you remove this line, the code would not check for the "hl" command and would not execute the corresponding block of code.

---
### Concept 12: Functions
Functions are reusable blocks of code that can be called multiple times with different inputs.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function higherLower(userId, amount, guess, economyModule) {
  // ...
}
```
**How it works here**: The code defines a function `higherLower` that takes four arguments and executes a block of code to simulate a game of higher or lower.
**Why it's used**: Functions are used to organize code, reduce duplication, and make it reusable.
**If you change/remove it**: If you remove this line, the code would not define the `higherLower` function, and the game logic would not be executed.

---
### Concept 13: Database Operations
Database operations are used to interact with a database, such as storing, retrieving, or updating data.
**General Example**
```javascript
const db = require('db');
db.saveUser({ name: 'John', age: 25 });
```
**In Our Code**
```javascript
economyModule.saveUser(userId);
```
**How it works here**: The code uses the `economyModule` to save the user data to the database.
**Why it's used**: Database operations are used to store, retrieve, or update data in a database.
**If you change/remove it**: If you remove this line, the code would not save the user data to the database, and the data would be lost.

---
### Concept 14: Error Handling
Error handling is used to catch and handle errors that occur during the execution of code.
**General Example**
```javascript
try {
  // Code that may throw an error
} catch (error) {
  console.error(error);
}
```
**In Our Code**
```javascript
if (!user) return { success: false, message: "❌ Register first!" };
```
**How it works here**: The code checks if the user exists and returns an error message if they don't.
**Why it's used**: Error handling is used to catch and handle errors that occur during the execution of code, making it more robust and reliable.
**If you change/remove it**: If you remove this line, the code would not handle the error and would potentially throw an exception or produce unexpected behavior.
