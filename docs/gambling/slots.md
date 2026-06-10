# Slots Command Flow (`slots`)

## 1. Description
The Slots command rolls a virtual slot machine with weighted emojis. Three matching symbols trigger a jackpot payout, two matching symbols yield a minor win, and no matching symbols result in a loss.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j slots 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "slots") (L4820)
            └── core/gambling.js
                └── slots(senderJid, amount, economy) (L345)
                    └── ensureGamblingProfile(user)
                    └── getSymbol() weighted draws
                    └── beginGamblingRound(user)
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
- Triggers command resolution if the input text starts with the prefix.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4820
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.slots`

```javascript
if (primaryCmd === "slots") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.slots(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes the call to the casino slots logic block.

---

### Step 4: Slots Evaluation and Weights Draws
* **File Path**: `core/gambling.js`
* **Line Numbers**: 345-471
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }` status object

```javascript
function slots(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first!` };
  
  if (amount < GLOBAL_MIN_BET || amount > GLOBAL_MAX_BET) {
    return { success: false, message: "❌ Invalid bet range." };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: "❌ Insufficient balance." };
  }

  const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];
  const weights = [25, 25, 20, 15, 10, 5];

  function getSymbol() {
    const total = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * total;
    for (let i = 0; i < symbols.length; i++) {
      if (random < weights[i]) return symbols[i];
      random -= weights[i];
    }
    return symbols[0];
  }

  const reel1 = getSymbol();
  const reel2 = getSymbol();
  const reel3 = getSymbol();
  const ctx = beginGamblingRound(user);

  let multiplier = 0;
  if (reel1 === reel2 && reel2 === reel3) {
    const symbolMultipliers = { '🍒': 5, '🍋': 10, '🍊': 15, '🍇': 25, '💎': 50, '7️⃣': 100 };
    multiplier = symbolMultipliers[reel1] || 5;
  } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
    multiplier = 1.2;
  }
  
  const winnings = Math.floor(amount * multiplier);
  const profit = winnings - amount;
  const won = profit > 0 && !maybeForceLoss(ctx);

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(profit, ctx));
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
- `getSymbol()` draws symbols by selecting cumulative thresholds in the `weights` array. Common symbols have much higher chances of being drawn than rare ones like `7️⃣` or `💎`.
- Checks matching combinations:
  - Three matching reels reward a jackpot using custom multipliers.
  - Two matching reels yield a `1.2x` return.
- Commits results to the database and sends the response containing visual reel alignments.

---

## 5. How to Modify
To adjust Slots payout multipliers or symbol weights:
- Edit the multipliers in `core/gambling.js` (around line 384):
  ```javascript
  // Change payout multipliers (e.g. increase 7️⃣ to 200x)
  const symbolMultipliers = {
      '7️⃣': 200
  };
  ```
- Change weights to alter match probability:
  ```javascript
  const weights = [30, 30, 15, 15, 8, 2]; // Makes 7️⃣ even rarer
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
const currentPrefix = 'some prefix';
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
```
**How it works here**: Variables are used to store values such as the current prefix, command body, and other data.
**Why it's used**: Variables are used to make the code more readable and maintainable by giving names to values.
**If you change/remove it**: If you remove variables, the code will not be able to store and hold values, and it will throw errors. If you change the variable names, the code will still work as long as the new names are used consistently.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` symbol.
**General Example**
```javascript
let add = (a, b) => a + b;
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code here
});
```
**How it works here**: Arrow functions are used as event listeners and as small, single-purpose functions.
**Why it's used**: Arrow functions are used to make the code more concise and readable.
**If you change/remove it**: If you remove arrow functions, the code will not be able to define small, single-purpose functions, and it will throw errors. If you change the arrow function syntax, the code will still work as long as the new syntax is valid.

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
  // code here
});
```
**How it works here**: Event listeners are used to respond to messages being sent or updated.
**Why it's used**: Event listeners are used to make the code interactive and responsive to user input.
**If you change/remove it**: If you remove event listeners, the code will not be able to respond to events, and it will not work as intended. If you change the event listener syntax, the code will still work as long as the new syntax is valid.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions based on conditions. They are defined using the `if` and `else` keywords.
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
if (lowerTxt.startsWith(currentPrefix)) {
  // code here
}
```
**How it works here**: Conditional statements are used to make decisions based on the type of message and the prefix of the message.
**Why it's used**: Conditional statements are used to make the code more flexible and responsive to different situations.
**If you change/remove it**: If you remove conditional statements, the code will not be able to make decisions, and it will not work as intended. If you change the conditional statement syntax, the code will still work as long as the new syntax is valid.

---
### Concept 5: Array Methods
Array methods are used to manipulate and interact with arrays. They are defined using methods such as `map`, `filter`, and `reduce`.
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
    // code here
  })
);
```
**How it works here**: Array methods are used to manipulate and interact with the messages array.
**Why it's used**: Array methods are used to make the code more concise and readable.
**If you change/remove it**: If you remove array methods, the code will not be able to manipulate and interact with arrays, and it will throw errors. If you change the array method syntax, the code will still work as long as the new syntax is valid.

---
### Concept 6: Promise
A promise is a result object that is used to handle asynchronous operations. It is defined using the `Promise` constructor.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Success!');
});
promise.then(result => console.log(result)); // Outputs: Success!
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // code here
  })
);
```
**How it works here**: Promises are used to handle asynchronous operations, such as sending messages.
**Why it's used**: Promises are used to make the code more asynchronous and responsive.
**If you change/remove it**: If you remove promises, the code will not be able to handle asynchronous operations, and it will throw errors. If you change the promise syntax, the code will still work as long as the new syntax is valid.

---
### Concept 7: Numbers Parsing
Numbers parsing is used to convert strings to numbers. It is defined using methods such as `parseInt` and `parseFloat`.
**General Example**
```javascript
let string = '123';
let number = parseInt(string);
console.log(number); // Outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: Numbers parsing is used to convert the bet amount string to a number.
**Why it's used**: Numbers parsing is used to make the code more flexible and able to handle different types of input.
**If you change/remove it**: If you remove numbers parsing, the code will not be able to convert strings to numbers, and it will throw errors. If you change the numbers parsing syntax, the code will still work as long as the new syntax is valid.

---
### Concept 8: Object Destructuring
Object destructuring is used to extract properties from objects. It is defined using the `{}` syntax.
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
  // code here
});
```
**How it works here**: Object destructuring is used to extract the `messages` and `type` properties from the object.
**Why it's used**: Object destructuring is used to make the code more concise and readable.
**If you change/remove it**: If you remove object destructuring, the code will not be able to extract properties from objects, and it will throw errors. If you change the object destructuring syntax, the code will still work as long as the new syntax is valid.

---
### Concept 9: Functions
Functions are used to define reusable blocks of code. They are defined using the `function` keyword.
**General Example**
```javascript
function add(a, b) {
  return a + b;
}
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
function slots(userId, amount, economyModule) {
  // code here
}
```
**How it works here**: Functions are used to define the `slots` function, which is used to handle the slots game logic.
**Why it's used**: Functions are used to make the code more modular and reusable.
**If you change/remove it**: If you remove functions, the code will not be able to define reusable blocks of code, and it will throw errors. If you change the function syntax, the code will still work as long as the new syntax is valid.

---
### Concept 10: Random Number Generation
Random number generation is used to generate random numbers. It is defined using the `Math.random()` function.
**General Example**
```javascript
let random = Math.random();
console.log(random); // Outputs: a random number between 0 and 1
```
**In Our Code**
```javascript
function getSymbol() {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  // code here
}
```
**How it works here**: Random number generation is used to generate a random symbol for the slots game.
**Why it's used**: Random number generation is used to make the game more unpredictable and exciting.
**If you change/remove it**: If you remove random number generation, the game will not be able to generate random symbols, and it will not work as intended. If you change the random number generation syntax, the code will still work as long as the new syntax is valid.

---
### Concept 11: Weighted Random Selection
Weighted random selection is used to select a random item from a list based on weights. It is defined using the `weights` array and the `Math.random()` function.
**General Example**
```javascript
let weights = [0.2, 0.3, 0.5];
let random = Math.random();
let cumulativeWeight = 0;
for (let i = 0; i < weights.length; i++) {
  cumulativeWeight += weights[i];
  if (random < cumulativeWeight) {
    console.log(i); // Outputs: the selected index
    break;
  }
}
```
**In Our Code**
```javascript
function getSymbol() {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < symbols.length; i++) {
    if (random < weights[i]) return symbols[i];
    random -= weights[i];
  }
  return symbols[0];
}
```
**How it works here**: Weighted random selection is used to select a random symbol for the slots game based on the weights array.
**Why it's used**: Weighted random selection is used to make the game more unpredictable and exciting.
**If you change/remove it**: If you remove weighted random selection, the game will not be able to select random symbols based on weights, and it will not work as intended. If you change the weighted random selection syntax, the code will still work as long as the new syntax is valid.

---
### Concept 12: Database Operations
Database operations are used to interact with a database. They are defined using methods such as `saveUser` and `getUser`.
**General Example**
```javascript
let user = { id: 1, name: 'John' };
database.saveUser(user);
let savedUser = database.getUser(1);
console.log(savedUser); // Outputs: the saved user
```
**In Our Code**
```javascript
economyModule.saveUser(userId);
const user = economyModule.getUser(userId);
```
**How it works here**: Database operations are used to interact with the economy module database.
**Why it's used**: Database operations are used to make the code more persistent and able to store data.
**If you change/remove it**: If you remove database operations, the code will not be able to interact with the database, and it will throw errors. If you change the database operation syntax, the code will still work as long as the new syntax is valid.
