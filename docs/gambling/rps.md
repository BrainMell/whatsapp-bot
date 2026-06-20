# Rock-Paper-Scissors Command Flow (`rps`)

## 1. Description
The Rock-Paper-Scissors command runs a virtual RPS match against the bot. Correct guesses reward a 2x payout (minus house edge). Ties refund bets.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j rps 1000 rock"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "rps") (L15565)
            └── core/gambling.js
                └── rps(senderJid, amount, choice, economy) (L1574)
                    └── choice validation (L1586)
                    └── beginGamblingRound(user)
                    └── Bot choice draw randomly (L1591)
                    └── evaluate ties (userChoice === botChoice)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual / outcome to WhatsApp
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
* **Line Numbers**: 15563-15585
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.rps`

```javascript
if (primaryCmd === "rps") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const choice = cmdArgs[2] || "";
  const result = gambling.rps(senderJid, betAmount, choice, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.rps` with the parsed choice.

---

### Step 4: Rock-Paper-Scissors Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1574-1650
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, choice, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function rps(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const valid = ['rock', 'paper', 'scissors', 'r', 'p', 's'];
  const userChoice = choice.toLowerCase();
  if (!valid.includes(userChoice)) return { success: false, message: "❌ Choose Rock, Paper, or Scissors!" };

  const botChoices = ['rock', 'paper', 'scissors'];
  const botChoice = botChoices[Math.floor(Math.random() * 3)];
  const fullUserChoice = userChoice.startsWith('r') ? 'rock' : (userChoice.startsWith('p') ? 'paper' : 'scissors');

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  if (fullUserChoice === botChoice) {
    // Refund tie
    user.wallet += amount;
    economyModule.saveUser(userId);
    return { success: true, won: null, message: "Tie refund visual" };
  }

  const winMap = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  const won = winMap[fullUserChoice] === botChoice && !maybeForceLoss(ctx);

  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * 2, ctx)) : 0;
  user.wallet += winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Validates player choice keys.
- Rolls a choice randomly from `'rock'`, `'paper'`, and `'scissors'` for the bot.
- Evaluates outcome. If choices are equal, returns the bet immediately. Otherwise, checks win mappings, forced loss constraints, updates wallets, and saves to MongoDB.

---

## 5. How to Modify
To adjust RPS win conditions or payout structures:
- Edit multipliers in `core/gambling.js` (around line 1623):
  ```javascript
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * 1.8, ctx)) : 0; // Reduced win payout to 1.8x
  ```
Prefixes, limits, and house edges can be customized directly in the same block.










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
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
const primaryCmd = cmdArgs[0];
```
**How it works here**: Variables are used to store the result of string operations and the first element of an array.
**Why it's used**: Variables are used to store and reuse values in the program, making the code more readable and efficient.
**If you change/remove it**: If you remove the variable declarations, the code will throw an error because the variables are used later in the program. If you change the variable names, you need to update all references to the variable.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
const greet = (name) => {
  console.log(`Hello, ${name}!`);
};
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An arrow function is used as an event handler for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and readable.
**If you change/remove it**: If you remove the arrow function, the event handler will not be defined, and the code will not respond to the `messages.upsert` event. If you change the arrow function to a traditional function, the code will still work, but the syntax will be different.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events, such as user interactions or network requests. They are defined using the `on` method.
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
**How it works here**: An event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events, making the code more interactive and dynamic.
**If you change/remove it**: If you remove the event listener, the code will not respond to the `messages.upsert` event, and the program will not process new messages. If you change the event listener to listen for a different event, the code will respond to the new event instead.

---
### Concept 4: Array Methods
Array methods are used to manipulate and transform arrays. They are defined using methods such as `map`, `filter`, and `reduce`.
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
**How it works here**: The `map` method is used to transform the `messages` array into an array of promises, which are then awaited using `Promise.all`.
**Why it's used**: Array methods are used to manipulate and transform arrays, making the code more concise and efficient.
**If you change/remove it**: If you remove the `map` method, the code will not transform the `messages` array, and the program will not process the messages correctly. If you change the `map` method to a different array method, the code will transform the array differently.

---
### Concept 5: Conditional Statements
Conditional statements are used to make decisions based on conditions. They are defined using `if`, `else`, and `switch` statements.
**General Example**
```javascript
const age = 25;
if (age >= 18) {
  console.log('You are an adult!');
} else {
  console.log('You are a minor!');
}
```
**In Our Code**
```javascript
if (primaryCmd === "rps") {
  // ...
}
```
**How it works here**: A conditional statement is used to check if the `primaryCmd` variable is equal to `"rps"`, and if so, execute the code inside the `if` block.
**Why it's used**: Conditional statements are used to make decisions based on conditions, making the code more dynamic and interactive.
**If you change/remove it**: If you remove the conditional statement, the code will not make decisions based on conditions, and the program will not behave as expected. If you change the condition, the code will make different decisions.

---
### Concept 6: String Methods
String methods are used to manipulate and transform strings. They are defined using methods such as `substring`, `trim`, and `startsWith`.
**General Example**
```javascript
const greeting = '   Hello, World!   ';
const trimmedGreeting = greeting.trim();
console.log(trimmedGreeting); // Outputs: Hello, World!
```
**In Our Code**
```javascript
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
```
**How it works here**: The `substring` and `trim` methods are used to extract the command body from the `lowerTxt` string and remove any whitespace.
**Why it's used**: String methods are used to manipulate and transform strings, making the code more concise and efficient.
**If you change/remove it**: If you remove the string methods, the code will not manipulate the strings correctly, and the program will not behave as expected. If you change the string methods, the code will manipulate the strings differently.

---
### Concept 7: Number Parsing
Number parsing is used to convert strings to numbers. It is defined using functions such as `parseInt` and `parseFloat`.
**General Example**
```javascript
const string = '123';
const number = parseInt(string);
console.log(number); // Outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: The `parseInt` function is used to convert the `cmdArgs[1]` string to a number, using base 10.
**Why it's used**: Number parsing is used to convert strings to numbers, making the code more efficient and accurate.
**If you change/remove it**: If you remove the number parsing, the code will not convert the string to a number, and the program will not behave as expected. If you change the number parsing function, the code will convert the string differently.

---
### Concept 8: Promises
Promises are used to handle asynchronous operations. They are defined using the `Promise` constructor and methods such as `then` and `catch`.
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
**How it works here**: Promises are used to handle the asynchronous operations of processing the `messages` array.
**Why it's used**: Promises are used to handle asynchronous operations, making the code more efficient and concise.
**If you change/remove it**: If you remove the promises, the code will not handle the asynchronous operations correctly, and the program will not behave as expected. If you change the promises, the code will handle the asynchronous operations differently.

---
### Concept 9: Destructuring
Destructuring is used to extract values from objects and arrays. It is defined using the `{}` and `[]` syntax.
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
**How it works here**: Destructuring is used to extract the `messages` and `type` values from the object passed to the event handler.
**Why it's used**: Destructuring is used to extract values from objects and arrays, making the code more concise and efficient.
**If you change/remove it**: If you remove the destructuring, the code will not extract the values correctly, and the program will not behave as expected. If you change the destructuring, the code will extract different values.

---
### Concept 10: Functions
Functions are used to define reusable blocks of code. They are defined using the `function` keyword or arrow functions.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function rps(userId, amount, choice, economyModule) {
  // ...
}
```
**How it works here**: A function is used to define the `rps` game logic, which takes in several parameters and returns a result.
**Why it's used**: Functions are used to define reusable blocks of code, making the code more modular and efficient.
**If you change/remove it**: If you remove the function, the code will not define the `rps` game logic, and the program will not behave as expected. If you change the function, the code will define different game logic.

---
### Concept 11: Object Properties
Object properties are used to store and access values in objects. They are defined using the `.` syntax.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
console.log(person.age); // Outputs: 25
```
**In Our Code**
```javascript
const user = economyModule.getUser(userId);
user.wallet -= amount;
```
**How it works here**: Object properties are used to access and modify the `wallet` property of the `user` object.
**Why it's used**: Object properties are used to store and access values in objects, making the code more efficient and concise.
**If you change/remove it**: If you remove the object properties, the code will not access or modify the values correctly, and the program will not behave as expected. If you change the object properties, the code will access or modify different values.

---
### Concept 12: Random Number Generation
Random number generation is used to generate random numbers. It is defined using the `Math.random()` function.
**General Example**
```javascript
const randomNumber = Math.random();
console.log(randomNumber); // Outputs: a random number between 0 and 1
```
**In Our Code**
```javascript
const botChoice = botChoices[Math.floor(Math.random() * 3)];
```
**How it works here**: Random number generation is used to select a random choice for the bot.
**Why it's used**: Random number generation is used to introduce randomness and unpredictability into the game.
**If you change/remove it**: If you remove the random number generation, the code will not select a random choice for the bot, and the game will not be unpredictable. If you change the random number generation, the code will select a different random choice.

---
### Concept 13: Conditional Operators
Conditional operators are used to make decisions based on conditions. They are defined using the `&&`, `||`, and `!` operators.
**General Example**
```javascript
const age = 25;
if (age >= 18 && age <= 65) {
  console.log('You are an adult!');
}
```
**In Our Code**
```javascript
const won = winMap[fullUserChoice] === botChoice && !maybeForceLoss(ctx);
```
**How it works here**: Conditional operators are used to make a decision based on the `winMap` and `maybeForceLoss` conditions.
**Why it's used**: Conditional operators are used to make decisions based on conditions, making the code more dynamic and interactive.
**If you change/remove it**: If you remove the conditional operators, the code will not make decisions based on conditions, and the program will not behave as expected. If you change the conditional operators, the code will make different decisions.

---
### Concept 14: Array Indexing
Array indexing is used to access elements in arrays. It is defined using the `[]` syntax.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
console.log(numbers[0]); // Outputs: 1
```
**In Our Code**
```javascript
const botChoice = botChoices[Math.floor(Math.random() * 3)];
```
**How it works here**: Array indexing is used to access a random element in the `botChoices` array.
**Why it's used**: Array indexing is used to access elements in arrays, making the code more efficient and concise.
**If you change/remove it**: If you remove the array indexing, the code will not access the elements correctly, and the program will not behave as expected. If you change the array indexing, the code will access different elements.

---
### Concept 15: Math Functions
Math functions are used to perform mathematical operations. They are defined using functions such as `Math.floor()` and `Math.random()`.
**General Example**
```javascript
const number = 3.14;
const roundedNumber = Math.floor(number);
console.log(roundedNumber); // Outputs: 3
```
**In Our Code**
```javascript
const botChoice = botChoices[Math.floor(Math.random() * 3)];
```
**How it works here**: Math functions are used to generate a random index for the `botChoices` array.
**Why it's used**: Math functions are used to perform mathematical operations, making the code more efficient and accurate.
**If you change/remove it**: If you remove the math functions, the code will not perform the mathematical operations correctly, and the program will not behave as expected. If you change the math functions, the code will perform different mathematical operations.
