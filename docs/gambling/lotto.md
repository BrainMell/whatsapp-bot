# Lotto Command Flow (`lotto`)

## 1. Description
The Lotto command allows players to buy a ticket for the lottery. If their ticket matches the winning number (1-100), they win a massive 90x jackpot.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j lotto 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "lotto") (L15539)
            └── core/gambling.js
                └── lottery(senderJid, amount, economy) (L1484)
                    └── beginGamblingRound(user)
                    └── Math.floor(Math.random() * 100) + 1 (ticket roll)
                    └── Math.floor(Math.random() * 100) + 1 (winningNum roll)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual card / result to WhatsApp
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
* **Line Numbers**: 15536-15555
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.lottery`

```javascript
if (primaryCmd === "lotto") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.lottery(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.lottery` with the parsed bet amount.

---

### Step 4: Lottery Evaluation
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1484-1568
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function lottery(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  const ticket = Math.floor(Math.random() * 100) + 1; // 1-100
  const winningNum = Math.floor(Math.random() * 100) + 1; // 1-100
  const won = ticket === winningNum && !maybeForceLoss(ctx);

  const rawGain = amount * 90;
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx)) : 0;
  
  user.wallet += winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Generates a player lottery ticket value from 1 to 100.
- Generates a target winning value from 1 to 100.
- If they match (and are not forced to lose), awards a 90x payout.
- Persists user balance changes.

---

## 5. How to Modify
To adjust Lottery odds or payouts:
- Edit the payout multiplier in `core/gambling.js` (around line 1510):
  ```javascript
  const rawGain = amount * 100; // Raised jackpot payout to 100x
  ```
- Change the ticket range size to adjust difficulty:
  ```javascript
  const ticket = Math.floor(Math.random() * 50) + 1; // Reduces range to 50 (double the win chance)
  ```
Prefixes, limits, and house edges can be customized directly in the same block.










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
const user = economyModule.getUser(userId);
const ctx = beginGamblingRound(user);
```
**How it works here**: Variables are used to store the result of function calls, such as `economyModule.getUser(userId)` and `beginGamblingRound(user)`.
**Why it's used**: Variables are used to store and manipulate data, making it easier to write and understand the code.
**If you change/remove it**: If you remove the variable declarations, the code will throw an error because the variables are used later in the code. If you change the variable names, you will need to update all references to the variable.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax and can be used as event handlers or as arguments to other functions.
**General Example**
```javascript
const greet = (name) => {
  console.log(`Hello, ${name}!`);
};
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An arrow function is used as an event handler for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and easier to read.
**If you change/remove it**: If you remove the arrow function, the event handler will not be defined, and the code will not respond to the `messages.upsert` event. If you change the arrow function syntax, you may need to update the code to use a traditional function definition.

---
### Concept 3: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are defined using `if`, `else`, and `switch` statements.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult.');
} else {
  console.log('You are a minor.');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (lowerTxt.startsWith(currentPrefix)) {
  // ...
}
```
**How it works here**: Conditional statements are used to check the type of event and the prefix of the message text.
**Why it's used**: Conditional statements are used to execute different blocks of code based on certain conditions, making the code more flexible and dynamic.
**If you change/remove it**: If you remove the conditional statements, the code will not be able to respond to different events and message types. If you change the conditions, you may need to update the code to handle different scenarios.

---
### Concept 4: String Methods
String methods are used to manipulate and transform strings. They are defined using the `.` syntax and can be used to perform operations such as concatenation, trimming, and splitting.
**General Example**
```javascript
let name = 'John ';
console.log(name.trim()); // outputs: John
```
**In Our Code**
```javascript
const cmdBody = lowerTxt
  .substring(currentPrefix.length)
  .trim();
```
**How it works here**: String methods are used to extract the command body from the message text and trim any whitespace.
**Why it's used**: String methods are used to manipulate and transform strings, making it easier to work with text data.
**If you change/remove it**: If you remove the string methods, the code will not be able to extract the command body correctly. If you change the string methods, you may need to update the code to handle different text formats.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They are defined using the `.` syntax and can be used to perform operations such as mapping, filtering, and reducing.
**General Example**
```javascript
let numbers = [1, 2, 3];
console.log(numbers.map((x) => x * 2)); // outputs: [2, 4, 6]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: Array methods are used to map over the messages array and perform an asynchronous operation on each message.
**Why it's used**: Array methods are used to manipulate and transform arrays, making it easier to work with collections of data.
**If you change/remove it**: If you remove the array methods, the code will not be able to process the messages array correctly. If you change the array methods, you may need to update the code to handle different data formats.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // ...
  resolve('Hello, World!');
});
promise.then((message) => {
  console.log(message); // outputs: Hello, World!
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
**How it works here**: Promises are used to handle the asynchronous operation of processing the messages array.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**If you change/remove it**: If you remove the promises, the code will not be able to handle asynchronous operations correctly. If you change the promises, you may need to update the code to handle different asynchronous scenarios.

---
### Concept 7: Parsing Numbers
Parsing numbers is used to convert a string to a number. This is often necessary when working with user input or data from an external source.
**General Example**
```javascript
let string = '123';
let number = parseInt(string, 10);
console.log(number); // outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: Parsing numbers is used to convert the bet amount from a string to a number.
**Why it's used**: Parsing numbers is used to convert strings to numbers, making it easier to work with numerical data.
**If you change/remove it**: If you remove the parsing, the code will not be able to convert the bet amount to a number correctly. If you change the parsing, you may need to update the code to handle different numerical formats.

---
### Concept 8: Math Operations
Math operations are used to perform mathematical calculations, such as addition, subtraction, multiplication, and division.
**General Example**
```javascript
let x = 5;
let y = 3;
console.log(x * y); // outputs: 15
```
**In Our Code**
```javascript
const rawGain = amount * 90;
```
**How it works here**: Math operations are used to calculate the raw gain.
**Why it's used**: Math operations are used to perform mathematical calculations, making it easier to work with numerical data.
**If you change/remove it**: If you remove the math operations, the code will not be able to calculate the raw gain correctly. If you change the math operations, you may need to update the code to handle different numerical scenarios.

---
### Concept 9: Random Number Generation
Random number generation is used to generate random numbers, often used in games or simulations.
**General Example**
```javascript
let randomNumber = Math.floor(Math.random() * 100);
console.log(randomNumber); // outputs: a random number between 0 and 99
```
**In Our Code**
```javascript
const ticket = Math.floor(Math.random() * 100) + 1;
const winningNum = Math.floor(Math.random() * 100) + 1;
```
**How it works here**: Random number generation is used to generate the ticket and winning numbers.
**Why it's used**: Random number generation is used to add an element of chance to the game.
**If you change/remove it**: If you remove the random number generation, the code will not be able to generate random numbers correctly. If you change the random number generation, you may need to update the code to handle different random number scenarios.

---
### Concept 10: Function Calls
Function calls are used to execute a block of code defined in a function.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
const result = gambling.lottery(senderJid, betAmount, economy);
```
**How it works here**: Function calls are used to execute the `gambling.lottery` function.
**Why it's used**: Function calls are used to execute a block of code defined in a function, making it easier to reuse code.
**If you change/remove it**: If you remove the function call, the code will not be able to execute the `gambling.lottery` function correctly. If you change the function call, you may need to update the code to handle different function scenarios.
