# Horse Command Flow (`horse`)

## 1. Description
The Horse command places a bet on one of 5 running horses (H1 to H5). Winning selections pay out 6x Zeni.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j horse 1000 3"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "horse") (L15510)
            └── core/gambling.js
                └── horseRace(senderJid, amount, horseNum, economy) (L1392)
                    └── beginGamblingRound(user)
                    └── Math.floor(Math.random() * 5) + 1 (winner roll)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply tracks layout / result to WhatsApp
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
- Intercepts incoming event payloads.

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
- Resolves command prefix.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: 15507-15533
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.horseRace`

```javascript
if (primaryCmd === "horse") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const horseNum = cmdArgs[2] || "";
  const result = gambling.horseRace(senderJid, betAmount, horseNum, economy);
  return await reply(result.message);
}
```

#### Explanation
- Extracts parameters representing bet amount and choice horse (1-5), then calls the gambling controller.

---

### Step 4: Horse Race Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1392-1478
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, horseNum, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function horseRace(userId, amount, horseNum, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const horse = parseInt(horseNum);
  if (isNaN(horse) || horse < 1 || horse > 5) return { success: false, message: "❌ Choose horse 1-5!" };

  const winner = Math.floor(Math.random() * 5) + 1; // rolls winner
  const ctx = beginGamblingRound(user);
  const won = horse === winner && !maybeForceLoss(ctx);

  const rawGain = amount * 6;
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx)) : 0;

  user.wallet = user.wallet - amount + winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Validates the select horse parameter is an integer from 1 to 5.
- Rolls a number from 1 to 5 indicating the winner.
- Checks outcomes, applies edge reductions and caps, modifies wallets, and persists changes.

---

## 5. How to Modify
To adjust horse counts or payouts:
- Edit the payout multiplier in `core/gambling.js` (around line 1420):
  ```javascript
  const rawGain = amount * 5; // Reduced win payout to 5x Zeni
  ```
- Change the horse count (e.g. 8 horses):
  ```javascript
  if (isNaN(horse) || horse < 1 || horse > 8) { ... }
  const winner = Math.floor(Math.random() * 8) + 1;
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
console.log(name); // outputs: John
```
**In Our Code**
```javascript
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
const primaryCmd = cmdArgs[0];
```
**How it works here**: Variables are used to store the command body and the primary command. The `const` keyword is used to declare variables that cannot be changed.
**Why it's used**: Variables are used to store values that need to be used later in the program. In this case, the command body and primary command are stored in variables so they can be used to determine the action to take.
**If you change/remove it**: If you remove the variables, the program will not be able to store the command body and primary command, and will not be able to determine the action to take. If you change the variables to use `let` instead of `const`, the variables can be changed later in the program.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
let add = (a, b) => a + b;
console.log(add(2, 3)); // outputs: 5
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An arrow function is used as the event handler for the `messages.upsert` event. The function takes an object with `messages` and `type` properties as an argument.
**Why it's used**: Arrow functions are used to define small, single-purpose functions. In this case, the arrow function is used to handle the `messages.upsert` event.
**If you change/remove it**: If you remove the arrow function, the program will not be able to handle the `messages.upsert` event. If you change the arrow function to a traditional function, the program will still work, but the syntax will be different.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program, such as a user clicking a button or a message being received.
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
**How it works here**: An event listener is used to respond to the `messages.upsert` event. When the event occurs, the event listener calls the arrow function.
**Why it's used**: Event listeners are used to respond to events that occur in a program. In this case, the event listener is used to handle the `messages.upsert` event.
**If you change/remove it**: If you remove the event listener, the program will not be able to respond to the `messages.upsert` event. If you change the event listener to listen for a different event, the program will respond to the new event instead.

---
### Concept 4: Array Methods
Array methods are used to perform operations on arrays, such as mapping, filtering, and reducing.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(n => n * 2);
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
**How it works here**: The `map` array method is used to create a new array of promises. The `Promise.all` function is then used to wait for all of the promises to resolve.
**Why it's used**: Array methods are used to perform operations on arrays. In this case, the `map` method is used to create a new array of promises.
**If you change/remove it**: If you remove the `map` method, the program will not be able to create a new array of promises. If you change the `map` method to use a different array method, such as `filter`, the program will perform a different operation on the array.

---
### Concept 5: Conditional Statements
Conditional statements are used to make decisions in a program based on conditions or rules.
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
if (isRekeying) return;
```
**How it works here**: Conditional statements are used to make decisions based on the `type` and `isRekeying` variables. If the conditions are not met, the function returns early.
**Why it's used**: Conditional statements are used to make decisions in a program. In this case, the conditional statements are used to filter out certain types of messages and to prevent the function from running while rekeying is in progress.
**If you change/remove it**: If you remove the conditional statements, the program will not be able to filter out certain types of messages and will run even while rekeying is in progress. If you change the conditions, the program will make different decisions based on the new conditions.

---
### Concept 6: Numbers Parsing
Numbers parsing is the process of converting a string to a number.
**General Example**
```javascript
let str = '123';
let num = parseInt(str);
console.log(num); // outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
const horse = parseInt(horseNum);
```
**How it works here**: The `parseInt` function is used to parse the `cmdArgs[1]` and `horseNum` strings to numbers.
**Why it's used**: Numbers parsing is used to convert strings to numbers so that they can be used in mathematical operations. In this case, the `parseInt` function is used to parse the bet amount and horse number to numbers.
**If you change/remove it**: If you remove the `parseInt` function, the program will not be able to convert the strings to numbers and will throw an error. If you change the `parseInt` function to use a different base, such as 16 for hexadecimal, the program will parse the strings differently.

---
### Concept 7: String Methods
String methods are used to perform operations on strings, such as substring and trim.
**General Example**
```javascript
let str = '   Hello World!   ';
let trimmedStr = str.trim();
console.log(trimmedStr); // outputs: 'Hello World!'
```
**In Our Code**
```javascript
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
```
**How it works here**: The `substring` and `trim` string methods are used to extract the command body from the `lowerTxt` string.
**Why it's used**: String methods are used to perform operations on strings. In this case, the `substring` and `trim` methods are used to extract the command body.
**If you change/remove it**: If you remove the `substring` and `trim` methods, the program will not be able to extract the command body correctly. If you change the `substring` method to use a different index, the program will extract a different part of the string.

---
### Concept 8: Promises
Promises are used to handle asynchronous operations, such as waiting for a message to be sent or a database query to complete.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Success!');
});
promise.then((result) => {
  console.log(result); // outputs: 'Success!'
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
**How it works here**: The `Promise.all` function is used to wait for all of the promises in the `messages` array to resolve.
**Why it's used**: Promises are used to handle asynchronous operations. In this case, the `Promise.all` function is used to wait for all of the messages to be processed.
**If you change/remove it**: If you remove the `Promise.all` function, the program will not be able to wait for all of the messages to be processed and may throw an error. If you change the `Promise.all` function to use a different promise method, such as `Promise.race`, the program will behave differently.

---
### Concept 9: Async/Await
Async/await is a syntax for writing asynchronous code that is easier to read and maintain.
**General Example**
```javascript
async function example() {
  let result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The `async` and `await` keywords are used to define an asynchronous function and wait for promises to resolve.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain. In this case, the `async` and `await` keywords are used to define an asynchronous function and wait for promises to resolve.
**If you change/remove it**: If you remove the `async` and `await` keywords, the program will not be able to wait for promises to resolve and may throw an error. If you change the `async` and `await` keywords to use a different syntax, such as callbacks, the program will behave differently.

---
### Concept 10: Destructuring
Destructuring is a syntax for extracting values from objects and arrays.
**General Example**
```javascript
let obj = { name: 'John', age: 25 };
let { name, age } = obj;
console.log(name); // outputs: 'John'
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The destructuring syntax is used to extract the `messages` and `type` values from the object passed to the event handler.
**Why it's used**: Destructuring is used to extract values from objects and arrays. In this case, the destructuring syntax is used to extract the `messages` and `type` values.
**If you change/remove it**: If you remove the destructuring syntax, the program will not be able to extract the `messages` and `type` values and may throw an error. If you change the destructuring syntax to use a different syntax, such as dot notation, the program will behave differently.

---
### Concept 11: Database Operations
Database operations are used to interact with a database, such as saving or retrieving data.
**General Example**
```javascript
let db = { users: [] };
db.users.push({ name: 'John', age: 25 });
console.log(db.users); // outputs: [{ name: 'John', age: 25 }]
```
**In Our Code**
```javascript
economyModule.saveUser(userId);
```
**How it works here**: The `saveUser` function is used to save the user data to the database.
**Why it's used**: Database operations are used to interact with a database. In this case, the `saveUser` function is used to save the user data.
**If you change/remove it**: If you remove the `saveUser` function, the program will not be able to save the user data and may throw an error. If you change the `saveUser` function to use a different database operation, such as retrieving data, the program will behave differently.

---
### Concept 12: Math Operations
Math operations are used to perform mathematical calculations, such as addition or multiplication.
**General Example**
```javascript
let num1 = 5;
let num2 = 3;
let result = num1 * num2;
console.log(result); // outputs: 15
```
**In Our Code**
```javascript
const rawGain = amount * 6;
```
**How it works here**: The `*` operator is used to multiply the `amount` by 6.
**Why it's used**: Math operations are used to perform mathematical calculations. In this case, the `*` operator is used to calculate the raw gain.
**If you change/remove it**: If you remove the `*` operator, the program will not be able to calculate the raw gain and may throw an error. If you change the `*` operator to use a different math operation, such as addition, the program will behave differently.

---
### Concept 13: Random Number Generation
Random number generation is used to generate random numbers, such as for simulations or games.
**General Example**
```javascript
let randomNum = Math.floor(Math.random() * 10);
console.log(randomNum); // outputs: a random number between 0 and 9
```
**In Our Code**
```javascript
const winner = Math.floor(Math.random() * 5) + 1;
```
**How it works here**: The `Math.random` function is used to generate a random number between 0 and 1, and then scaled to a number between 1 and 5.
**Why it's used**: Random number generation is used to generate random numbers. In this case, the `Math.random` function is used to generate a random winner.
**If you change/remove it**: If you remove the `Math.random` function, the program will not be able to generate a random winner and may throw an error. If you change the `Math.random` function to use a different random number generator, the program will behave differently.

---
### Concept 14: Conditional Statements with Multiple Conditions
Conditional statements with multiple conditions are used to make decisions based on multiple conditions.
**General Example**
```javascript
let age = 25;
let name = 'John';
if (age >= 18 && name === 'John') {
  console.log('You are an adult and your name is John!');
}
```
**In Our Code**
```javascript
if (isNaN(horse) || horse < 1 || horse > 5) return { success: false, message: "❌ Choose horse 1-5!" };
```
**How it works here**: The `if` statement is used to check if the `horse` variable is not a number, or if it is less than 1 or greater than 5.
**Why it's used**: Conditional statements with multiple conditions are used to make decisions based on multiple conditions. In this case, the `if` statement is used to validate the `horse` variable.
**If you change/remove it**: If you remove the `if` statement, the program will not be able to validate the `horse` variable and may throw an error. If you change the conditions, the program will make different decisions based on the new conditions.
