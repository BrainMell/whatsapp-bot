# Plinko Command Flow (`plinko`)

## 1. Description
The Plinko command drops a ball down a peg board pyramid with low, mid, or high risk options, returning multipliers based on the final landing bucket.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j plinko 1000 high"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "plinko") (L15727)
            └── core/gambling.js
                └── plinko(senderJid, amount, risk, economy) (L2004)
                    └── beginGamblingRound(user)
                    └── getResult(tables[r], weights[r]) weighted random (L2034)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply peg path / visual grid to WhatsApp
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
* **Line Numbers**: 15724-15746
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.plinko`

```javascript
if (primaryCmd === "plinko") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const risk = cmdArgs[2] || "mid";
  const result = gambling.plinko(senderJid, betAmount, risk, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.plinko` with risk levels.

---

### Step 4: Plinko Logic and Risk Levels Mappings
* **File Path**: `core/gambling.js`
* **Line Numbers**: 2004-2100
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, risk, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function plinko(userId, amount, risk, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const riskLevel = risk.toLowerCase();
  const validRisks = ['low', 'mid', 'high', 'l', 'm', 'h'];
  if (!validRisks.includes(riskLevel)) return { success: false, message: "❌ Choose Low/Mid/High!" };

  const r = riskLevel.startsWith('l') ? 'low' : (riskLevel.startsWith('m') ? 'mid' : 'high');

  const tables = {
    low: [0.5, 1.0, 1.1, 1.2, 1.5, 2.0, 5.0],
    mid: [0.2, 0.5, 1.0, 1.5, 2.5, 10.0, 25.0],
    high: [0.0, 0.1, 0.2, 1.5, 5.0, 50.0, 100.0]
  };

  const weights = {
    low: [40, 30, 15, 10, 3, 1.5, 0.5],
    mid: [50, 25, 10, 8, 5, 1.5, 0.5],
    high: [70, 15, 8, 4, 2, 0.8, 0.2]
  };

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  let multiplier = getResult(tables[r], weights[r]);
  if (maybeForceLoss(ctx)) multiplier = 0;

  const winnings = capPayoutByDailyLimit(user, applyEdgeToAmount(amount * multiplier, ctx));
  user.wallet += winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Resolves the risk parameter (`'low'`, `'mid'`, or `'high'`) to select the corresponding payout multipliers and probability weights tables.
- **High Risk**: Has a 70% chance of returning `0.0x` (losing the entire bet) but includes a `100.0x` jackpot path.
- **Low Risk**: Min payout is `0.5x` with a much safer weight pool distribution.
- Mutates user wallet balance and updates transaction histories.

---

## 5. How to Modify
To adjust Plinko risk multipliers or weights:
- Edit the payout table values in `core/gambling.js` (around line 2022):
  ```javascript
  const tables = {
      high: [0.0, 0.1, 0.2, 2.0, 10.0, 100.0, 500.0] // Raised high risk jackpot to 500x
  };
  ```
- Change weights to raise win probability:
  ```javascript
  const weights = {
      high: [60, 20, 10, 6, 3, 0.8, 0.2] // Reduces 0.0x chance to 60%
  };
  ```
- Prefixes, limit caps, and house edges can be customized directly in the same block.










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
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
const primaryCmd = cmdArgs[0];
```
**How it works here**: Variables are used to store the result of the `substring` and `trim` methods, as well as the first element of the `cmdArgs` array.
**Why it's used**: Variables are used to store values that need to be used later in the program. In this case, they are used to store the command body and primary command.
**If you change/remove it**: If you remove the variables, the program will not be able to store the values and will throw an error. If you change the variable names, you will need to update all references to the variable in the program.

---
### Concept 2: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are used to make decisions in a program.
**General Example**
```javascript
let age = 25;
if (age > 18) {
  console.log('You are an adult');
} else {
  console.log('You are a minor');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (primaryCmd === "plinko") {
  // code to execute
}
```
**How it works here**: Conditional statements are used to check the type of message and the primary command. If the conditions are met, the program executes the corresponding block of code.
**Why it's used**: Conditional statements are used to make decisions in a program and execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove the conditional statements, the program will not be able to make decisions and will execute all blocks of code. If you change the conditions, the program will execute different blocks of code.

---
### Concept 3: Array Methods
Array methods are used to perform operations on arrays, such as mapping, filtering, and reducing.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(num => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // code to execute
  })
);
```
**How it works here**: The `map` method is used to execute a block of code for each message in the `messages` array. The `Promise.all` method is used to wait for all promises to resolve.
**Why it's used**: Array methods are used to perform operations on arrays and execute blocks of code for each element.
**If you change/remove it**: If you remove the array methods, the program will not be able to perform operations on arrays and will throw an error. If you change the array methods, the program will execute different blocks of code.

---
### Concept 4: Arrow Functions
Arrow functions are a concise way to define functions in JavaScript. They are used to define small, single-purpose functions.
**General Example**
```javascript
let add = (a, b) => a + b;
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code to execute
});
```
**How it works here**: An arrow function is used to define a callback function for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions and are a concise way to define functions in JavaScript.
**If you change/remove it**: If you remove the arrow function, the program will not be able to define the callback function and will throw an error. If you change the arrow function, the program will execute different blocks of code.

---
### Concept 5: Event Listeners
Event listeners are used to listen for events in a program, such as mouse clicks or message updates.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Mouse clicked');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code to execute
});
```
**How it works here**: An event listener is used to listen for the `messages.upsert` event and execute a block of code when the event is triggered.
**Why it's used**: Event listeners are used to listen for events in a program and execute blocks of code when the events are triggered.
**If you change/remove it**: If you remove the event listener, the program will not be able to listen for the event and will not execute the block of code. If you change the event listener, the program will listen for a different event.

---
### Concept 6: Numbers Parsing
Numbers parsing is used to convert strings to numbers in JavaScript.
**General Example**
```javascript
let num = parseInt('123', 10);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: The `parseInt` function is used to convert the second command argument to a number.
**Why it's used**: Numbers parsing is used to convert strings to numbers in JavaScript and is necessary for performing mathematical operations.
**If you change/remove it**: If you remove the numbers parsing, the program will not be able to convert the string to a number and will throw an error. If you change the numbers parsing, the program will convert the string to a different number.

---
### Concept 7: Objects
Objects are used to store key-value pairs in JavaScript. They are used to represent complex data structures.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const tables = {
  low: [0.5, 1.0, 1.1, 1.2, 1.5, 2.0, 5.0],
  mid: [0.2, 0.5, 1.0, 1.5, 2.5, 10.0, 25.0],
  high: [0.0, 0.1, 0.2, 1.5, 5.0, 50.0, 100.0]
};
```
**How it works here**: An object is used to store the tables for the plinko game.
**Why it's used**: Objects are used to store key-value pairs and represent complex data structures in JavaScript.
**If you change/remove it**: If you remove the object, the program will not be able to store the tables and will throw an error. If you change the object, the program will store different tables.

---
### Concept 8: Destructuring
Destructuring is used to extract values from arrays and objects in JavaScript.
**General Example**
```javascript
let numbers = [1, 2, 3];
let [a, b, c] = numbers;
console.log(a); // Outputs: 1
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code to execute
});
```
**How it works here**: Destructuring is used to extract the `messages` and `type` values from the event object.
**Why it's used**: Destructuring is used to extract values from arrays and objects in JavaScript and is a concise way to assign values to variables.
**If you change/remove it**: If you remove the destructuring, the program will not be able to extract the values and will throw an error. If you change the destructuring, the program will extract different values.

---
### Concept 9: Promises
Promises are used to handle asynchronous operations in JavaScript. They are used to represent a value that may not be available yet.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // code to execute
  resolve('Hello');
});
promise.then((value) => {
  console.log(value); // Outputs: Hello
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // code to execute
  })
);
```
**How it works here**: Promises are used to handle the asynchronous operations of the `messages.map` method.
**Why it's used**: Promises are used to handle asynchronous operations in JavaScript and are necessary for performing operations that may take time to complete.
**If you change/remove it**: If you remove the promises, the program will not be able to handle the asynchronous operations and will throw an error. If you change the promises, the program will handle the asynchronous operations differently.

---
### Concept 10: Async/Await
Async/await is used to write asynchronous code that is easier to read and maintain. It is used to represent a value that may not be available yet.
**General Example**
```javascript
async function hello() {
  let value = await promise;
  console.log(value); // Outputs: Hello
}
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code to execute
});
```
**How it works here**: Async/await is used to write the asynchronous code of the event listener.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain.
**If you change/remove it**: If you remove the async/await, the program will not be able to write the asynchronous code and will throw an error. If you change the async/await, the program will write the asynchronous code differently.
