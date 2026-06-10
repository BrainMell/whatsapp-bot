# Wheel Command Flow (`wheel`)

## 1. Description
The Wheel command spins a wheel of fortune with weighted multiplier slices (`0x`, `0.2x`, `0.5x`, `1.2x`, `1.5x`, `2x`, `5x`, `10x`).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j wheel 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "wheel") (L15820)
            └── core/gambling.js
                └── wheelOfFortune(senderJid, amount, economy) (L2333)
                    └── beginGamblingRound(user)
                    └── spin() weighted index random (L2348)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual wheel slice / result to WhatsApp
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
* **Line Numbers**: 15816-15842
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.wheelOfFortune`

```javascript
if (primaryCmd === "wheel") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.wheelOfFortune(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.wheelOfFortune` with the parsed bet amount.

---

### Step 4: Wheel of Fortune Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 2333-2415
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function wheelOfFortune(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const segments = [0, 0.2, 0.5, 1.2, 1.5, 2, 5, 10];
  const weights = [35, 20, 15, 12, 10, 5, 2, 1];

  function spin() {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    for (let i = 0; i < segments.length; i++) {
      if (rand < weights[i]) return segments[i];
      rand -= weights[i];
    }
    return segments[0];
  }

  const ctx = beginGamblingRound(user);
  let multiplier = spin();
  if (maybeForceLoss(ctx)) multiplier = 0;

  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * multiplier, ctx)) : 0;
  user.wallet = user.wallet - amount + winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- `spin()` draws slices by selecting cumulative thresholds in the `weights` array. Common low multipliers have higher chances of being drawn, while `10x` is restricted to `1%` odds.
- Evaluates payouts, checks daily profit limits, and writes changes back to MongoDB.

---

## 5. How to Modify
To adjust Wheel multipliers or weights:
- Edit the payout table values in `core/gambling.js` (around line 2345):
  ```javascript
  const segments = [0, 0.2, 0.5, 1.2, 2, 5, 20]; // Changed 10x to 20x jackpot
  ```
- Change weights to raise win probability:
  ```javascript
  const weights = [30, 20, 15, 15, 10, 8, 2]; // Decreased 0x odds to 30%
  ```
Prefixes, limits, and house edges can be customized directly in the same block.










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
const currentPrefix = 'some prefix';
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
```
**How it works here**: Variables are used to store values such as `currentPrefix`, `cmdBody`, and `primaryCmd`. These values are then used in the program to make decisions or perform actions.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to write and understand the code.
**If you change/remove it**: If you remove a variable, the program will throw an error when it tries to use the variable. If you change the value of a variable, the program will use the new value, which may or may not be what you intended.

---
### Concept 2: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They allow the program to execute different blocks of code depending on whether a condition is true or false.
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
if (primaryCmd === "wheel") {
  // code to handle wheel command
}
```
**How it works here**: Conditional statements are used to check conditions such as the type of message, the command, and the user's balance. Based on these conditions, the program executes different blocks of code.
**Why it's used**: Conditional statements are used to make decisions in the program and execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove a conditional statement, the program will not be able to make decisions based on the condition, and may execute the wrong block of code. If you change the condition, the program will make different decisions, which may or may not be what you intended.

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
function wheelOfFortune(userId, amount, economyModule) {
  // code to handle wheel of fortune game
}
```
**How it works here**: Functions are used to perform specific tasks such as handling the wheel of fortune game, spinning the wheel, and updating the user's balance.
**Why it's used**: Functions are used to organize the code, make it reusable, and perform specific tasks.
**If you change/remove it**: If you remove a function, the program will not be able to perform the task that the function was responsible for. If you change the function, the program will perform the task differently, which may or may not be what you intended.

---
### Concept 4: Arrays
Arrays are collections of values that can be of any data type, including strings, numbers, and objects.
**General Example**
```javascript
let colors = ['red', 'green', 'blue'];
console.log(colors[0]); // Outputs: red
```
**In Our Code**
```javascript
const segments = [0, 0.2, 0.5, 1.2, 2, 5, 20];
const weights = [30, 20, 15, 15, 10, 8, 2];
```
**How it works here**: Arrays are used to store collections of values such as the segments and weights of the wheel.
**Why it's used**: Arrays are used to store and manipulate collections of values.
**If you change/remove it**: If you remove an array, the program will not be able to access the values that were stored in the array. If you change the values in an array, the program will use the new values, which may or may not be what you intended.

---
### Concept 5: Array Methods
Array methods are functions that can be used to manipulate and access arrays.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let sum = numbers.reduce((a, b) => a + b, 0);
console.log(sum); // Outputs: 15
```
**In Our Code**
```javascript
const totalWeight = weights.reduce((a, b) => a + b, 0);
```
**How it works here**: Array methods such as `reduce` are used to calculate the total weight of the wheel.
**Why it's used**: Array methods are used to manipulate and access arrays.
**If you change/remove it**: If you remove an array method, the program will not be able to perform the operation that the method was responsible for. If you change the array method, the program will perform the operation differently, which may or may not be what you intended.

---
### Concept 6: Event Listeners
Event listeners are functions that are called when a specific event occurs.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('The document was clicked');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code to handle message upsert event
});
```
**How it works here**: Event listeners are used to handle events such as message upserts.
**Why it's used**: Event listeners are used to respond to events and perform actions when something happens.
**If you change/remove it**: If you remove an event listener, the program will not be able to respond to the event. If you change the event listener, the program will respond to the event differently, which may or may not be what you intended.

---
### Concept 7: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when an operation is complete.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // code to perform an asynchronous operation
  resolve('Operation complete');
});
promise.then((result) => {
  console.log(result);
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // code to handle message
  })
);
```
**How it works here**: Promises are used to handle asynchronous operations such as handling messages.
**Why it's used**: Promises are used to provide a way to execute code when an asynchronous operation is complete.
**If you change/remove it**: If you remove a promise, the program will not be able to handle the asynchronous operation. If you change the promise, the program will handle the operation differently, which may or may not be what you intended.

---
### Concept 8: Async/Await
Async/await is a syntax used to write asynchronous code that is easier to read and understand.
**General Example**
```javascript
async function example() {
  let result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
await reply(result.message);
```
**How it works here**: Async/await is used to write asynchronous code that is easier to read and understand.
**Why it's used**: Async/await is used to provide a way to write asynchronous code that is easier to read and understand.
**If you change/remove it**: If you remove async/await, the program will not be able to handle asynchronous operations in the same way. If you change the async/await code, the program will handle the operation differently, which may or may not be what you intended.

---
### Concept 9: String Methods
String methods are functions that can be used to manipulate and access strings.
**General Example**
```javascript
let string = 'hello';
let uppercase = string.toUpperCase();
console.log(uppercase); // Outputs: HELLO
```
**In Our Code**
```javascript
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
```
**How it works here**: String methods such as `substring` and `trim` are used to manipulate and access strings.
**Why it's used**: String methods are used to manipulate and access strings.
**If you change/remove it**: If you remove a string method, the program will not be able to perform the operation that the method was responsible for. If you change the string method, the program will perform the operation differently, which may or may not be what you intended.

---
### Concept 10: Number Parsing
Number parsing is the process of converting a string to a number.
**General Example**
```javascript
let string = '123';
let number = parseInt(string, 10);
console.log(number); // Outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: Number parsing is used to convert a string to a number.
**Why it's used**: Number parsing is used to convert a string to a number so that it can be used in mathematical operations.
**If you change/remove it**: If you remove number parsing, the program will not be able to convert the string to a number. If you change the number parsing, the program will convert the string to a different number, which may or may not be what you intended.

---
### Concept 11: Destructuring
Destructuring is a syntax used to extract values from an object or array.
**General Example**
```javascript
let object = { name: 'John', age: 30 };
let { name, age } = object;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**
```javascript
async ({ messages, type }) => {
  // code to handle message and type
}
```
**How it works here**: Destructuring is used to extract values from an object.
**Why it's used**: Destructuring is used to provide a way to extract values from an object or array in a concise and readable way.
**If you change/remove it**: If you remove destructuring, the program will not be able to extract the values from the object in the same way. If you change the destructuring, the program will extract different values, which may or may not be what you intended.
