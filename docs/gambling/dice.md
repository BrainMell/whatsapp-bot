# Dice Command Flow (`dice`, `roll`)

## 1. Description
The Dice Roll command allows players to roll a 6-sided die against the dealer (bot). If the player rolls a higher number, they win their bet amount (minus house edge). Ties refund the bet amount.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j dice 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "dice" || primaryCmd === "roll") (L4810)
            └── core/gambling.js
                └── diceRoll(senderJid, amount, economy) (L228)
                    └── ensureGamblingProfile(user)
                    └── beginGamblingRound(user)
                    └── Luck factor check (15% chance to reduce dealer roll)
                    └── maybeForceLoss(ctx)
                    └── user.wallet +/-= amount
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
- Listens to incoming events and filters out offline backlog queues or key renewals.

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
- Sanitizes prefixes and splits the command body to resolve parameter structures.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4810
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.diceRoll`

```javascript
if (primaryCmd === "dice" || primaryCmd === "roll") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.diceRoll(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Resolves the dice/roll keywords, extracts the bet value, and passes control to the gambling module.

---

### Step 4: Dice Roll Game Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 228-339
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }` status object

```javascript
function diceRoll(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first!` };
  
  if (amount < GLOBAL_MIN_BET || amount > GLOBAL_MAX_BET) {
    return { success: false, message: "❌ Invalid bet range." };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: "❌ Insufficient wallet balance." };
  }

  const playerRoll = Math.floor(Math.random() * 6) + 1;
  let dealerRoll = Math.floor(Math.random() * 6) + 1;
  const ctx = beginGamblingRound(user);

  // Luck check (15% chance to reduce dealer roll)
  if (Math.random() < 0.15 && dealerRoll > 1) {
    dealerRoll--;
  }

  if (playerRoll === dealerRoll) {
    return { success: true, won: null, message: "Tie refund" };
  }

  const won = playerRoll > dealerRoll && !maybeForceLoss(ctx);

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
- Validates user registration and checks if the wallet balance can cover the bet.
- Simulates two 6-sided dice rolls (`1-6`) randomly.
- **Luck Factor Check**: Applies a 15% probability block that reduces the dealer's roll by 1 to skew odds slightly towards the player.
- Evaluates payouts, enforces forced-loss conditions, updates daily caps, and writes changes back to MongoDB.

---

## 5. How to Modify
To adjust the player luck factor or ties logic:
- Locate the luck check in `core/gambling.js` (around line 248):
  ```javascript
  // Change 0.15 to disable or raise the player roll help chance:
  if (Math.random() < 0.10 && dealerRoll > 1) { ... }
  ```










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
**How it works here**: Variables are used to store the command body and the primary command. The `const` keyword is used to declare variables that don't change.
**Why it's used**: Variables are used to store and manipulate data, making it easier to write and understand the code.
**If you change/remove it**: If you remove the variable declarations, the code will throw an error because `cmdBody` and `primaryCmd` are used later in the code. If you change the variable names, you need to update all references to them.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
const greet = (name) => console.log(`Hello, ${name}!`);
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An arrow function is used as an event listener for the `messages.upsert` event. The function is called when the event is triggered, and it receives the `messages` and `type` parameters.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and easier to read.
**If you change/remove it**: If you remove the arrow function, the event listener will not be triggered, and the code inside the function will not be executed. If you change the arrow function to a traditional function, you need to update the syntax accordingly.

---
### Concept 3: Event Listeners
Event listeners are functions that are triggered when a specific event occurs. They are used to respond to user interactions, network requests, or other events.
**General Example**
```javascript
document.addEventListener('click', () => console.log('Clicked!'));
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An event listener is used to listen for the `messages.upsert` event. When the event is triggered, the function is called, and it receives the `messages` and `type` parameters.
**Why it's used**: Event listeners are used to respond to events and update the application state accordingly.
**If you change/remove it**: If you remove the event listener, the code inside the function will not be executed when the event is triggered. If you change the event listener to listen for a different event, you need to update the event name and the function accordingly.

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
if (primaryCmd === "dice" || primaryCmd === "roll") {
  // ...
}
```
**How it works here**: A conditional statement is used to check if the primary command is either "dice" or "roll". If the condition is true, the code inside the block is executed.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on conditions.
**If you change/remove it**: If you remove the conditional statement, the code inside the block will always be executed, regardless of the condition. If you change the condition, you need to update the logic accordingly.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubledNumbers = numbers.map((num) => num * 2);
console.log(doubledNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` method is used to transform the `messages` array into a new array of promises. The `Promise.all` method is used to wait for all promises to resolve.
**Why it's used**: Array methods are used to manipulate and transform arrays, making it easier to work with data.
**If you change/remove it**: If you remove the array method, the code will not be able to transform the array. If you change the array method, you need to update the logic accordingly.

---
### Concept 6: Numbers Parsing
Numbers parsing is used to convert strings to numbers.
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
**How it works here**: The `parseInt` function is used to convert the second command argument to a number.
**Why it's used**: Numbers parsing is used to convert user input to numbers, making it easier to work with numerical data.
**If you change/remove it**: If you remove the numbers parsing, the code will not be able to convert the user input to a number. If you change the parsing function, you need to update the logic accordingly.

---
### Concept 7: Destructuring
Destructuring is used to extract values from objects and arrays.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: Destructuring is used to extract the `messages` and `type` values from the event object.
**Why it's used**: Destructuring is used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the destructuring, the code will not be able to extract the values from the object. If you change the destructuring, you need to update the logic accordingly.

---
### Concept 8: Promises
Promises are used to handle asynchronous operations.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // ...
  resolve('Success!');
});
promise.then((result) => console.log(result)); // Outputs: Success!
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: Promises are used to handle the asynchronous operations of processing the messages.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to write and understand the code.
**If you change/remove it**: If you remove the promises, the code will not be able to handle the asynchronous operations. If you change the promises, you need to update the logic accordingly.

---
### Concept 9: Database Operations
Database operations are used to interact with a database.
**General Example**
```javascript
let db = { users: [] };
db.users.push({ name: 'John', age: 25 });
console.log(db.users); // Outputs: [{ name: 'John', age: 25 }]
```
**In Our Code**
```javascript
const user = economyModule.getUser(userId);
economyModule.saveUser(userId);
```
**How it works here**: Database operations are used to interact with the economy module's database.
**Why it's used**: Database operations are used to store and retrieve data, making it easier to manage the application state.
**If you change/remove it**: If you remove the database operations, the code will not be able to interact with the database. If you change the database operations, you need to update the logic accordingly.

---
### Concept 10: Math Random
Math random is used to generate random numbers.
**General Example**
```javascript
let random = Math.random();
console.log(random); // Outputs: a random number between 0 and 1
```
**In Our Code**
```javascript
const playerRoll = Math.floor(Math.random() * 6) + 1;
let dealerRoll = Math.floor(Math.random() * 6) + 1;
```
**How it works here**: Math random is used to generate random numbers for the player and dealer rolls.
**Why it's used**: Math random is used to add randomness to the game, making it more engaging.
**If you change/remove it**: If you remove the math random, the game will not be able to generate random numbers. If you change the math random, you need to update the logic accordingly.

---
### Concept 11: Conditional Probability
Conditional probability is used to calculate the probability of an event based on a condition.
**General Example**
```javascript
let probability = 0.5; // 50% chance
if (Math.random() < probability) {
  console.log('Event occurred!');
}
```
**In Our Code**
```javascript
// Luck check (15% chance to reduce dealer roll)
if (Math.random() < 0.15 && dealerRoll > 1) {
  dealerRoll--;
}
```
**How it works here**: Conditional probability is used to calculate the probability of the luck check event.
**Why it's used**: Conditional probability is used to add an element of chance to the game, making it more engaging.
**If you change/remove it**: If you remove the conditional probability, the game will not be able to calculate the probability of the luck check event. If you change the probability, you need to update the logic accordingly.
