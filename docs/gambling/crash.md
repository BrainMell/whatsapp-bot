# Crash Command Flow (`crash`)

## 1. Description
The Crash command runs a virtual multiplier rocket game. Players specify a bet and a target multiplier. A crash point is rolled; if the crash point is greater than or equal to the player's target multiplier, the player wins the target payout. Otherwise, they lose the bet.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j crash 1000 2.5"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "crash") (L4840)
            └── core/gambling.js
                └── crash(senderJid, amount, multiplierStr, economy) (L1028)
                    └── Bet & multiplier validations (L1047)
                    └── beginGamblingRound(user)
                    └── Roll crashPoint with house odds weights (L1059)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply text/visual to WhatsApp
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
* **Line Numbers**: Around 4840
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.crash`

```javascript
if (primaryCmd === "crash") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const targetMultiplier = cmdArgs[2] || "";
  const result = gambling.crash(senderJid, betAmount, targetMultiplier, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.crash` with parsed parameters.

---

### Step 4: Crash Evaluation and Multiplier Rolls
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1028-1139
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, multiplierStr, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function crash(userId, amount, multiplierStr, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  // Validations...
  const targetMultiplier = parseFloat(multiplierStr);
  if (isNaN(targetMultiplier) || targetMultiplier <= 1.0) {
    return { success: false, message: "❌ Invalid target multiplier." };
  }

  const ctx = beginGamblingRound(user);

  // Generate crash point with realistic house odds weights
  let crashPoint;
  const rand = Math.random();
  if (rand < 0.03) {
    crashPoint = 1.00;
  } else if (rand < 0.50) {
    crashPoint = 1.01 + Math.random() * 0.49;
  } else if (rand < 0.80) {
    crashPoint = 1.5 + Math.random() * 1.5;
  } else {
    crashPoint = 3.0 + Math.pow(Math.random(), 2) * 47.0;
  }
  crashPoint = Math.round(crashPoint * 100) / 100;

  const won = !maybeForceLoss(ctx) && (crashPoint >= targetMultiplier);
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * targetMultiplier, ctx)) : 0;

  user.wallet = user.wallet - amount + winnings;
  if (won) trackDailyNet(user, winnings - amount);
  else trackDailyNet(user, -amount);

  economyModule.saveUser(userId);
}
```

#### Explanation
- Parses the target multiplier input.
- **Realistic Crash Odds Weights Roll**:
  - 3% chance the rocket crashes immediately at `1.00x`.
  - 47% chance the rocket crashes between `1.01x` and `1.50x`.
  - 30% chance it crashes between `1.50x` and `3.00x`.
  - 20% chance it soars higher, up to `50.00x` (using an exponential curve scale).
- Checks outcomes, deducts bet, adds winnings (if won and within daily caps), and persists updates.

---

## 5. How to Modify
To adjust the crash probability curves:
- Modify the probability check conditions in `core/gambling.js` (around lines 1060-1069):
  ```javascript
  // Change 0.03 (instant crash chance) or other ranges:
  if (rand < 0.05) { // Increases instant crash rate to 5%
      crashPoint = 1.00;
  }
  ```
- Change the max multiplier cap (currently 1000):
  ```javascript
  if (targetMultiplier > 2000) { ... } // Raises cap to 2000x
  ```
Prefixes, limits, and edge properties can be customized directly in the same block.










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
**If you change/remove it**: If you remove this line, the `cmdBody` variable would be undefined, causing errors in subsequent lines of code. If you change it, you would need to adjust the subsequent code to match the new variable name or value.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They have an implicit return statement and can be defined with or without parameters.
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
**How it works here**: The code defines an event listener for the `messages.upsert` event, and the arrow function is used to handle the event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and readable.
**If you change/remove it**: If you remove this line, the event listener would not be defined, and the code would not respond to the `messages.upsert` event. If you change it, you would need to adjust the code to match the new function definition.

---
### Concept 3: Event Listeners
Event listeners are used to respond to specific events or actions in a program. They are defined with a callback function that is executed when the event occurs.
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
**How it works here**: The code defines an event listener for the `messages.upsert` event, and the callback function is executed when the event occurs.
**Why it's used**: Event listeners are used to respond to specific events or actions in a program, making the code more interactive and dynamic.
**If you change/remove it**: If you remove this line, the event listener would not be defined, and the code would not respond to the `messages.upsert` event. If you change it, you would need to adjust the code to match the new event or callback function.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on specific conditions or decisions.
**General Example**
```javascript
if (age > 18) {
  console.log('You are an adult!');
} else {
  console.log('You are a minor!');
}
```
**In Our Code**
```javascript
if (primaryCmd === "crash") {
  // ...
}
```
**How it works here**: The code checks if the `primaryCmd` variable is equal to the string "crash", and if so, executes the code inside the if block.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on specific conditions.
**If you change/remove it**: If you remove this line, the code would not check for the "crash" command, and the corresponding code would not be executed. If you change it, you would need to adjust the code to match the new condition or command.

---
### Concept 5: Array Methods
Array methods are used to manipulate and interact with arrays in a program. They can be used to iterate, filter, map, and reduce arrays.
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
**How it works here**: The code uses the `map` method to iterate over the `messages` array and execute an asynchronous function for each message.
**Why it's used**: Array methods are used to manipulate and interact with arrays in a program, making the code more concise and efficient.
**If you change/remove it**: If you remove this line, the code would not iterate over the `messages` array, and the corresponding code would not be executed. If you change it, you would need to adjust the code to match the new array method or iteration approach.

---
### Concept 6: Number Parsing
Number parsing is used to convert strings or other data types to numbers in a program.
**General Example**
```javascript
const num = parseInt('123', 10);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: The code uses the `parseInt` function to convert the second command argument to an integer.
**Why it's used**: Number parsing is used to convert strings or other data types to numbers, making it possible to perform mathematical operations.
**If you change/remove it**: If you remove this line, the `betAmount` variable would be undefined, causing errors in subsequent lines of code. If you change it, you would need to adjust the code to match the new parsing approach or data type.

---
### Concept 7: String Manipulation
String manipulation is used to modify and interact with strings in a program. It can be used to extract substrings, trim whitespace, and perform other operations.
**General Example**
```javascript
const str = ' Hello, World! ';
const trimmedStr = str.trim();
console.log(trimmedStr); // Outputs: Hello, World!
```
**In Our Code**
```javascript
const cmdBody = lowerTxt
  .substring(currentPrefix.length)
  .trim();
```
**How it works here**: The code uses the `substring` and `trim` methods to extract the command body from the input text.
**Why it's used**: String manipulation is used to modify and interact with strings in a program, making it possible to extract and process relevant information.
**If you change/remove it**: If you remove this line, the `cmdBody` variable would be undefined, causing errors in subsequent lines of code. If you change it, you would need to adjust the code to match the new string manipulation approach.

---
### Concept 8: Object Destructuring
Object destructuring is used to extract properties from objects and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 30 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code uses object destructuring to extract the `messages` and `type` properties from the event object.
**Why it's used**: Object destructuring is used to extract properties from objects and assign them to variables, making the code more concise and readable.
**If you change/remove it**: If you remove this line, the `messages` and `type` variables would be undefined, causing errors in subsequent lines of code. If you change it, you would need to adjust the code to match the new object destructuring approach.

---
### Concept 9: Promises
Promises are used to handle asynchronous operations in a program. They can be used to execute code when an operation is complete or failed.
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
**How it works here**: The code uses promises to handle the asynchronous operations of processing each message.
**Why it's used**: Promises are used to handle asynchronous operations in a program, making it possible to execute code when an operation is complete or failed.
**If you change/remove it**: If you remove this line, the code would not handle the asynchronous operations, and the program may not work as expected. If you change it, you would need to adjust the code to match the new promise approach or asynchronous operation.

---
### Concept 10: Functions
Functions are used to group code together and reuse it in a program. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function crash(userId, amount, multiplierStr, economyModule) {
  // ...
}
```
**How it works here**: The code defines a function named `crash` that takes four arguments and performs the crash game logic.
**Why it's used**: Functions are used to group code together and reuse it in a program, making the code more modular and maintainable.
**If you change/remove it**: If you remove this line, the `crash` function would not be defined, and the code would not be able to perform the crash game logic. If you change it, you would need to adjust the code to match the new function definition or logic.

---
### Concept 11: Math Operations
Math operations are used to perform mathematical calculations in a program. They can be used to perform arithmetic, comparison, and other operations.
**General Example**
```javascript
const num1 = 10;
const num2 = 5;
const result = num1 + num2;
console.log(result); // Outputs: 15
```
**In Our Code**
```javascript
const crashPoint = 1.01 + Math.random() * 0.49;
```
**How it works here**: The code uses math operations to generate a random crash point.
**Why it's used**: Math operations are used to perform mathematical calculations in a program, making it possible to perform simulations, games, and other applications.
**If you change/remove it**: If you remove this line, the `crashPoint` variable would be undefined, causing errors in subsequent lines of code. If you change it, you would need to adjust the code to match the new math operation or calculation.

---
### Concept 12: Random Number Generation
Random number generation is used to generate random numbers in a program. It can be used to simulate chance, uncertainty, and other random events.
**General Example**
```javascript
const rand = Math.random();
console.log(rand); // Outputs: a random number between 0 and 1
```
**In Our Code**
```javascript
const rand = Math.random();
if (rand < 0.03) {
  crashPoint = 1.00;
}
```
**How it works here**: The code uses random number generation to simulate the chance of an instant crash.
**Why it's used**: Random number generation is used to simulate chance, uncertainty, and other random events in a program, making it possible to create games, simulations, and other applications.
**If you change/remove it**: If you remove this line, the code would not simulate the chance of an instant crash, and the game logic would be different. If you change it, you would need to adjust the code to match the new random number generation approach or probability.
