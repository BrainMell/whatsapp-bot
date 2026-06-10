# Roulette Command Flow (`roulette`, `roul`)

## 1. Description
The Roulette command allows players to bet Zeni on color pools (red, black, green), parity parameters (even, odd), or specific numbers (0-36).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j roulette 1000 red"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "roulette" || primaryCmd === "roul") (L4835)
            └── core/gambling.js
                └── roulette(senderJid, amount, bet, economy) (L843)
                    └── Bet validation (L853)
                    └── Cooldown checks (20 spins per 10 hours) (L898)
                    └── user.wallet -= amount
                    └── beginGamblingRound(user)
                    └── Math.floor(Math.random() * 37) (0-36 roll)
                    └── maybeForceLoss(ctx)
                    └── Payout evaluation (36x for green/number, 2x for even/odd/color)
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
* **Line Numbers**: Around 4835
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.roulette`

```javascript
if (primaryCmd === "roulette" || primaryCmd === "roul") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const choice = cmdArgs[2] || "";
  const result = gambling.roulette(senderJid, betAmount, choice, economy);
  return await reply(result.message);
}
```

#### Explanation
- Catches roulette commands, parses bet amounts, and passes execution to `gambling.roulette`.

---

### Step 4: Roulette Logic and Limits Checks
* **File Path**: `core/gambling.js`
* **Line Numbers**: 843-1023
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, bet, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function roulette(userId, amount, bet, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const betLower = bet.toLowerCase();
  let multiplier = 0;
  let betType = '';
  let checkValid = false;

  // Resolve multipliers (36x for green/numbers, 2x for color/even/odd)
  if (betLower === 'red' || betLower === 'r') { multiplier = 2; betType = '🔴 RED'; checkValid = true; }
  // ... (other checks)

  if (!checkValid) return { success: false, message: "❌ Invalid bet!" };

  // Enforce Cooldown Limit: 20 spins per 10 hours
  const now = Date.now();
  const LIMIT_WINDOW = 10 * 60 * 60 * 1000;
  const MAX_SPINS = 20;

  if (user.gamblingLimits.roulette.count >= MAX_SPINS) {
    return { success: false, message: "⏳ Roulette limit reached!" };
  }

  user.gamblingLimits.roulette.count++;
  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  const result = Math.floor(Math.random() * 37); // 0-36
  const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(result);
  const color = result === 0 ? 'green' : (isRed ? 'red' : 'black');

  // Match checks
  let won = false;
  if (betLower === 'red' || betLower === 'r') won = color === 'red' && !maybeForceLoss(ctx);
  // ...

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount * multiplier, ctx));
    user.wallet += gain;
    trackDailyNet(user, gain);
  } else {
    trackDailyNet(user, -amount);
  }

  economyModule.saveUser(userId);
}
```

#### Explanation
- Resolves the bet parameters to assign appropriate payout multipliers.
- **Cooldown Limit Validation**: Asserts player hasn't exceeded `MAX_SPINS` (20 spins) inside the current `LIMIT_WINDOW` (10 hours). If they have, drops execution.
- Deducts the bet from the wallet.
- Rolls a value from `0` to `36`.
- Checks matches, calculates house edge, updates daily net limits, and writes changes back to the database.

---

## 5. How to Modify
To adjust the roulette limit constraints:
- Modify constants in `core/gambling.js` (around lines 903-904):
  ```javascript
  // Change LIMIT_WINDOW to 5 hours and MAX_SPINS to 50:
  const LIMIT_WINDOW = 5 * 60 * 60 * 1000;
  const MAX_SPINS = 50;
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
const primaryCmd = cmdArgs[0];
```
**How it works here**: Variables are used to store the command body and the primary command. The `const` keyword is used to declare these variables, which means their values cannot be changed after they are declared.
**Why it's used**: Variables are used to store values that need to be used later in the program. In this case, the command body and primary command are stored in variables so they can be used to determine the action to take.
**If you change/remove it**: If you remove the variables, the program will not be able to store the command body and primary command, and the program will not work as expected. If you change the variables to use `let` instead of `const`, the values can be changed after they are declared.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small functions. They are similar to regular functions, but they use an arrow (`=>`) instead of the `function` keyword.
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
**How it works here**: An arrow function is used as the event handler for the `messages.upsert` event. The function takes an object with `messages` and `type` properties as an argument.
**Why it's used**: Arrow functions are used to define small, one-time use functions. In this case, the arrow function is used as an event handler, which is a common use case for arrow functions.
**If you change/remove it**: If you remove the arrow function, the event handler will not be defined, and the program will not respond to the `messages.upsert` event. If you change the arrow function to a regular function, the program will still work, but the syntax will be different.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program. They are functions that are called when a specific event occurs.
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
**How it works here**: An event listener is used to respond to the `messages.upsert` event. When this event occurs, the event listener function is called.
**Why it's used**: Event listeners are used to respond to events that occur in a program. In this case, the event listener is used to process incoming messages.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event, and the program will not process incoming messages. If you change the event listener to listen for a different event, the program will respond to the new event instead.

---
### Concept 4: Array Methods
Array methods are used to perform operations on arrays. They are functions that can be called on an array to manipulate its elements.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let sum = numbers.reduce((a, b) => a + b, 0);
console.log(sum); // Outputs: 15
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` array method is used to transform the `messages` array into a new array of promises. The `Promise.all` function is then used to wait for all the promises to resolve.
**Why it's used**: Array methods are used to perform operations on arrays. In this case, the `map` method is used to transform the `messages` array, and the `Promise.all` function is used to wait for all the promises to resolve.
**If you change/remove it**: If you remove the `map` method, the program will not be able to transform the `messages` array, and the program will not work as expected. If you change the `map` method to use a different array method, the program will perform a different operation on the array.

---
### Concept 5: Conditional Statements
Conditional statements are used to make decisions in a program. They are used to execute different blocks of code based on conditions.
**General Example**
```javascript
let x = 5;
if (x > 10) {
  console.log('x is greater than 10');
} else {
  console.log('x is less than or equal to 10');
}
```
**In Our Code**
```javascript
if (primaryCmd === "roulette" || primaryCmd === "roul") {
  // ...
}
```
**How it works here**: A conditional statement is used to check if the primary command is "roulette" or "roul". If it is, the code inside the if statement is executed.
**Why it's used**: Conditional statements are used to make decisions in a program. In this case, the conditional statement is used to determine which action to take based on the primary command.
**If you change/remove it**: If you remove the conditional statement, the program will not be able to make decisions based on the primary command, and the program will not work as expected. If you change the condition to use a different operator or value, the program will make a different decision.

---
### Concept 6: Numbers Parsing
Numbers parsing is used to convert strings to numbers. It is used to extract numerical values from strings.
**General Example**
```javascript
let str = '123';
let num = parseInt(str, 10);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: The `parseInt` function is used to convert the second command argument to a number. The second argument `10` specifies the base of the number (in this case, decimal).
**Why it's used**: Numbers parsing is used to extract numerical values from strings. In this case, the `parseInt` function is used to extract the bet amount from the command arguments.
**If you change/remove it**: If you remove the `parseInt` function, the program will not be able to extract the bet amount from the command arguments, and the program will not work as expected. If you change the base to a different value, the program will interpret the number in a different base.

---
### Concept 7: String Methods
String methods are used to perform operations on strings. They are functions that can be called on a string to manipulate its characters.
**General Example**
```javascript
let str = 'hello';
let upper = str.toUpperCase();
console.log(upper); // Outputs: HELLO
```
**In Our Code**
```javascript
const lowerTxt = txt.toLowerCase();
```
**How it works here**: The `toLowerCase` string method is used to convert the text to lowercase.
**Why it's used**: String methods are used to perform operations on strings. In this case, the `toLowerCase` method is used to convert the text to lowercase so that the program can compare it to the command prefix in a case-insensitive manner.
**If you change/remove it**: If you remove the `toLowerCase` method, the program will not be able to compare the text to the command prefix in a case-insensitive manner, and the program will not work as expected. If you change the method to use a different string method, the program will perform a different operation on the string.

---
### Concept 8: Destructuring
Destructuring is used to extract values from objects and arrays. It is a shorthand way to assign values to variables.
**General Example**
```javascript
let obj = { name: 'John', age: 30 };
let { name, age } = obj;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: Destructuring is used to extract the `messages` and `type` properties from the object passed to the event handler.
**Why it's used**: Destructuring is used to extract values from objects and arrays. In this case, destructuring is used to extract the `messages` and `type` properties from the object passed to the event handler.
**If you change/remove it**: If you remove the destructuring, the program will not be able to extract the `messages` and `type` properties from the object, and the program will not work as expected. If you change the destructuring to use a different syntax, the program will still work, but the syntax will be different.

---
### Concept 9: Promises
Promises are used to handle asynchronous operations. They are objects that represent a value that may not be available yet.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // ...
});
promise.then((value) => {
  console.log(value);
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
**How it works here**: Promises are used to handle the asynchronous operations of processing the messages. The `Promise.all` function is used to wait for all the promises to resolve.
**Why it's used**: Promises are used to handle asynchronous operations. In this case, promises are used to handle the asynchronous operations of processing the messages.
**If you change/remove it**: If you remove the promises, the program will not be able to handle the asynchronous operations of processing the messages, and the program will not work as expected. If you change the promises to use a different syntax, the program will still work, but the syntax will be different.

---
### Concept 10: Database Operations
Database operations are used to interact with a database. They are functions that can be called to perform CRUD (create, read, update, delete) operations on a database.
**General Example**
```javascript
let db = {
  users: []
};
db.createUser = (user) => {
  db.users.push(user);
};
db.getUser = (id) => {
  return db.users.find((user) => user.id === id);
};
```
**In Our Code**
```javascript
const user = economyModule.getUser(userId);
economyModule.saveUser(userId);
```
**How it works here**: Database operations are used to interact with the economy module's database. The `getUser` function is used to retrieve a user from the database, and the `saveUser` function is used to save a user to the database.
**Why it's used**: Database operations are used to interact with a database. In this case, database operations are used to retrieve and save users to the economy module's database.
**If you change/remove it**: If you remove the database operations, the program will not be able to interact with the economy module's database, and the program will not work as expected. If you change the database operations to use a different syntax, the program will still work, but the syntax will be different.

---
### Concept 11: Object Properties
Object properties are used to store values in an object. They are key-value pairs that can be accessed using the dot notation or bracket notation.
**General Example**
```javascript
let obj = {
  name: 'John',
  age: 30
};
console.log(obj.name); // Outputs: John
console.log(obj['age']); // Outputs: 30
```
**In Our Code**
```javascript
const user = economyModule.getUser(userId);
if (!user) return { success: false, message: "❌ Register first!" };
```
**How it works here**: Object properties are used to store values in the user object. The `getUser` function returns a user object, and the program checks if the user object is truthy.
**Why it's used**: Object properties are used to store values in an object. In this case, object properties are used to store values in the user object.
**If you change/remove it**: If you remove the object properties, the program will not be able to store values in the user object, and the program will not work as expected. If you change the object properties to use a different syntax, the program will still work, but the syntax will be different.

---
### Concept 12: Math Operations
Math operations are used to perform mathematical calculations. They are functions that can be called to perform arithmetic, trigonometric, and other mathematical operations.
**General Example**
```javascript
let x = 5;
let y = 3;
let sum = x + y;
console.log(sum); // Outputs: 8
```
**In Our Code**
```javascript
const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount * multiplier, ctx));
user.wallet += gain;
```
**How it works here**: Math operations are used to perform mathematical calculations. The `applyEdgeToAmount` function is used to calculate the gain, and the `capPayoutByDailyLimit` function is used to cap the payout.
**Why it's used**: Math operations are used to perform mathematical calculations. In this case, math operations are used to calculate the gain and cap the payout.
**If you change/remove it**: If you remove the math operations, the program will not be able to perform mathematical calculations, and the program will not work as expected. If you change the math operations to use a different syntax, the program will still work, but the syntax will be different.

---
### Concept 13: Random Number Generation
Random number generation is used to generate random numbers. It is a function that can be called to generate a random number within a specified range.
**General Example**
```javascript
let random = Math.floor(Math.random() * 10);
console.log(random); // Outputs: a random number between 0 and 9
```
**In Our Code**
```javascript
const result = Math.floor(Math.random() * 37); // 0-36
```
**How it works here**: Random number generation is used to generate a random number between 0 and 36.
**Why it's used**: Random number generation is used to generate random numbers. In this case, random number generation is used to simulate a roulette wheel.
**If you change/remove it**: If you remove the random number generation, the program will not be able to generate random numbers, and the program will not work as expected. If you change the random number generation to use a different range, the program will generate random numbers within the new range.

---
### Concept 14: Conditional Loops
Conditional loops are used to repeat a block of code while a condition is true. They are used to perform repetitive tasks.
**General Example**
```javascript
let i = 0;
while (i < 10) {
  console.log(i);
  i++;
}
```
**In Our Code**
```javascript
if (betLower === 'red' || betLower === 'r') { multiplier = 2; betType = '🔴 RED'; checkValid = true; }
// ...
```
**How it works here**: Conditional loops are not explicitly used in this code snippet, but the `if` statement is used to check multiple conditions and perform different actions based on those conditions.
**Why it's used**: Conditional loops are used to repeat a block of code while a condition is true. In this case, the `if` statement is used to check multiple conditions and perform different actions based on those conditions.
**If you change/remove it**: If you remove the `if` statement, the program will not be able to check multiple conditions and perform different actions based on those conditions, and the program will not work as expected. If you change the `if` statement to use a different condition, the program will perform different actions based on the new condition.

---
### Concept 15: Functions
Functions are used to group a block of code together and reuse it. They are used to perform a specific task.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function roulette(userId, amount, bet, economyModule) {
  // ...
}
```
**How it works here**: A function is used to group a block of code together and reuse it. The `roulette` function is used to perform a specific task, which is to simulate a roulette game.
**Why it's used**: Functions are used to group a block of code together and reuse it. In this case, the `roulette` function is used to perform a specific task, which is to simulate a roulette game.
**If you change/remove it**: If you remove the `roulette` function, the program will not be able to simulate a roulette game, and the program will not work as expected. If you change the `roulette` function to use a different syntax, the program will still work, but the syntax will be different.

---
### Concept 16: Cooldowns
Cooldowns are used to limit the frequency of an action. They are used to prevent a user from performing an action too many times within a certain time period.
**General Example**
```javascript
let cooldown = 0;
let cooldownTime = 1000; // 1 second
function action() {
  if (cooldown > Date.now()) {
    console.log('Cooldown!');
    return;
  }
  cooldown = Date.now() + cooldownTime;
  // Perform action
}
```
**In Our Code**
```javascript
if (user.gamblingLimits.roulette.count >= MAX_SPINS) {
  return { success: false, message: "⏳ Roulette limit reached!" };
}
```
**How it works here**: A cooldown is used to limit the frequency of the roulette game. The `MAX_SPINS` variable is used to set the maximum number of spins allowed within a certain time period.
**Why it's used**: Cooldowns are used to limit the frequency of an action. In this case, the cooldown is used to prevent a user from playing the roulette game too many times within a certain time period.
**If you change/remove it**: If you remove the cooldown, the program will not be able to limit the frequency of the roulette game, and the program will not work as expected. If you change the cooldown to use a
