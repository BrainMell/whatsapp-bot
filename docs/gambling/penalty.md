# Penalty Command Flow (`penalty`)

## 1. Description
The Penalty shootout command allows players to bet Zeni and try to score a penalty kick against the bot by choosing Left, Center, or Right. Winning kicks yield a 1.4x multiplier payout (a 40% net gain on top of the original bet returned), scaled by the house edge and daily profit limits.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j penalty 1000 left"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " penalty")) (L15595)
            └── parseGamblingArgs(txt, ['penalty']) (L15602)
            └── core/gambling.js
                └── penalty(senderJid, amount, direction, economy) (L1686)
                    └── ensureGamblingProfile(user)
                    └── beginGamblingRound(user)
                    └── maybeForceLoss(ctx)
                    └── capPayoutByDailyLimit(user, payoutAmount)
                    └── updateGamblingStats(userId, amount, won, economyModule)
                    └── economyModule.logTransaction(userId, description, amount, wallet)
                    └── user.wallet +/-= amount/gain
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L15618)
            └── awardProgression(senderJid, chatId) (L15622)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js)
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
- Listens to incoming messages from Baileys. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching and Argument Parsing
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L15595-L15611)
* **Line Numbers**: 15595-15611
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Parsed `amount` and `direction`

```javascript
                  // penalty <amt> <l/c/r>
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} penalty` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} penalty `,
                    )
                  ) {
                    const { amount, extra: direction } = parseGamblingArgs(txt, ['penalty']);

                    if (isNaN(amount) || !direction) {
                      return await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: ${botConfig.getPrefix()} penalty <amount> <left/center/right>`,
                      });
                    }
```

#### Explanation
- Compares the message to the prefix + `penalty` command.
- Extracts parameters using `parseGamblingArgs(txt, ['penalty'])` which splits the message, finds the word ending in `penalty`, and reads the next arguments as `amount` (integer) and `direction`.
- Sends usage guide if values are invalid.

---

### Step 3: Command Routing
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L15612-L15623)
* **Line Numbers**: 15612-15623
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");` (defined in [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js))
* **Inputs**: `senderJid`, `amount`, `direction`, `economy`
* **Outputs**: Sends result message and triggers player progress award

```javascript
                    const result = gambling.penalty(
                      senderJid,
                      amount,
                      direction,
                      economy,
                    );
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                      contextInfo: { mentionedJid: [senderJid] },
                    });
                    await awardProgression(senderJid, chatId);
                    return;
```

#### Explanation
- Routes execution to `gambling.penalty(...)`.
- Sends the generated game response text back to the WhatsApp group, tagging the user.
- Runs `awardProgression` to give progression experience/points to the active user.

---

### Step 4: Penalty Evaluation
* **File Path**: [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js#L1686-L1774)
* **Line Numbers**: 1686-1774
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, direction, economyModule)`
* **Outputs**: `{ success: boolean, won?: boolean, message: string }` status object

```javascript
function penalty(userId, amount, direction, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const valid = ['left', 'center', 'right', 'l', 'c', 'r'];
  const dir = direction.toLowerCase();
  if (!valid.includes(dir)) return { success: false, message: "❌ Choose Left, Center, or Right!" };

  const keeperDir = ['left', 'center', 'right'][Math.floor(Math.random() * 3)];
  const userDir = dir.startsWith('l') ? 'left' : (dir.startsWith('c') ? 'center' : 'right');
  const ctx = beginGamblingRound(user);
  const won = userDir !== keeperDir && !maybeForceLoss(ctx);
```

#### Explanation
1. Checks if the user is registered in the database, has sufficient funds, and if the bet is within the global min/max limits.
2. Validates direction selection (`left`, `center`, `right`, or abbreviations `l`, `c`, `r`).
3. Picks a random goalkeeper dive direction out of the three.
4. Initializes the session via `beginGamblingRound` and determines if the user won (they scored if the kick direction did NOT match the goalkeeper's dive, and no forced loss was triggered).

---

### Step 5: Payout Calculation, Database Mutations, and Logs
* **File Path**: [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js#L1715-L1773)
* **Line Numbers**: 1715-1773
* **Called From**: `penalty()` function
* **Inputs**: `won` status, `amount`, `userDir`, `keeperDir`
* **Outputs**: Formatted response message payload

```javascript
  if (won) {
    const rawGain = Math.floor(amount * 0.4);
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Penalty Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${penaltyVisual}
... (Cap message) ...`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Penalty Goal (${userDir})`, gain, user.wallet);
    return {
      success: true,
      won: true,
      message: `${penaltyVisual}
... (Goal message) ...`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Penalty Miss (${userDir})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `${penaltyVisual}
... (Saved message) ...`
    };
  }
```

#### Explanation
1. If user **won**:
   - Calculates the net payout of +40% of the bet (`rawGain = Math.floor(amount * 0.4)`).
   - Applies house edge and checks daily limits (`capPayoutByDailyLimit`).
   - If the limit was reached and no payout is allowed, returns a refunded message.
   - Otherwise, increases user wallet, tracks stats, adds net profit to daily tracking, updates global gambling statistics via `updateGamblingStats()`, and records the transaction via `logTransaction()`.
2. If user **lost**:
   - Deducts the bet amount from user's wallet.
   - Updates stats, updates net profit negatively via `trackDailyNet()`, and records the transaction via `logTransaction()`.
3. Calls `economyModule.saveUser(userId)` inside `updateGamblingStats` to persist data back to the MongoDB/Mongoose database.

---

## 5. How to Modify
To adjust Penalty multipliers, probability, or layout:
- **Adjusting multiplier (default 1.4x)**: Change `0.4` (representing 40% profit) in [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js#L1716):
  ```javascript
  const rawGain = Math.floor(amount * 0.5); // Increase payout profit to 50% (1.5x)
  ```
- **Adjusting Keeper Probability (default 1/3 match)**: To change keeper block difficulty:
  ```javascript
  // Make keeper pick same dir 50% of the time, or custom distribution
  ```










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
const user = economyModule.getUser(userId);
const { amount, extra: direction } = parseGamblingArgs(txt, ['penalty']);
```
**How it works here**: Variables are used to store values such as the user, amount, and direction. These values are then used in the program to make decisions and perform actions.
**Why it's used**: Variables are used to store and reuse values in a program, making it easier to write and understand the code.
**If you change/remove it**: If you remove or change a variable, the program may not work as expected. For example, if you remove the `user` variable, the program will not be able to get the user's data from the economy module.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
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
**How it works here**: An arrow function is used as an event listener for the `messages.upsert` event. When the event is triggered, the function is called with the event data as an argument.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as event listeners or callbacks.
**If you change/remove it**: If you remove or change the arrow function, the event listener will not work as expected. For example, if you remove the `async` keyword, the function may not work correctly with asynchronous code.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are used to respond to user interactions, network requests, and other events.
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
**How it works here**: An event listener is used to listen for the `messages.upsert` event. When the event is triggered, the function is called with the event data as an argument.
**Why it's used**: Event listeners are used to respond to events and perform actions based on user interactions or other events.
**If you change/remove it**: If you remove or change the event listener, the program will not respond to the event as expected. For example, if you remove the event listener, the program will not process incoming messages.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions based on conditions or values. They are defined using the `if` and `else` keywords.
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
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: Conditional statements are used to check conditions and make decisions based on the values. If the condition is true, the code inside the `if` block is executed.
**Why it's used**: Conditional statements are used to make decisions and perform actions based on conditions or values.
**If you change/remove it**: If you remove or change a conditional statement, the program may not work as expected. For example, if you remove the `if (type !== "notify" && type !== "append")` statement, the program may process messages that are not notifications or appends.

---
### Concept 5: Array Methods
Array methods are used to manipulate and interact with arrays. They are defined using the `array.method()` syntax.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((number) => number * 2);
console.log(doubleNumbers); // outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  }),
);
```
**How it works here**: The `map()` method is used to iterate over the `messages` array and perform an action on each message.
**Why it's used**: Array methods are used to manipulate and interact with arrays, making it easier to perform actions on multiple values.
**If you change/remove it**: If you remove or change an array method, the program may not work as expected. For example, if you remove the `map()` method, the program will not iterate over the `messages` array.

---
### Concept 6: Promises
Promises are used to handle asynchronous code and ensure that actions are performed in the correct order. They are defined using the `Promise` constructor.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // asynchronous code
  resolve('Success!');
});
promise.then((result) => {
  console.log(result); // outputs: Success!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  }),
);
```
**How it works here**: Promises are used to handle asynchronous code and ensure that actions are performed in the correct order. The `await` keyword is used to wait for the promise to resolve before continuing with the code.
**Why it's used**: Promises are used to handle asynchronous code and ensure that actions are performed in the correct order, making it easier to write and understand the code.
**If you change/remove it**: If you remove or change a promise, the program may not work as expected. For example, if you remove the `await` keyword, the program may not wait for the promise to resolve before continuing with the code.

---
### Concept 7: Destructuring
Destructuring is used to extract values from objects and arrays. It is defined using the `{}` syntax.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
const { amount, extra: direction } = parseGamblingArgs(txt, ['penalty']);
```
**How it works here**: Destructuring is used to extract values from the `parseGamblingArgs()` function and assign them to variables.
**Why it's used**: Destructuring is used to extract values from objects and arrays, making it easier to write and understand the code.
**If you change/remove it**: If you remove or change the destructuring, the program may not work as expected. For example, if you remove the `const { amount, extra: direction }` statement, the program will not extract the values from the `parseGamblingArgs()` function.

---
### Concept 8: Numbers Parsing
Numbers parsing is used to convert strings to numbers. It is defined using the `parseInt()` or `parseFloat()` functions.
**General Example**
```javascript
const string = '123';
const number = parseInt(string);
console.log(number); // outputs: 123
```
**In Our Code**
```javascript
if (isNaN(amount)) {
  // ...
}
```
**How it works here**: Numbers parsing is used to check if the `amount` variable is a valid number. If it is not a valid number, the program will execute the code inside the `if` block.
**Why it's used**: Numbers parsing is used to convert strings to numbers and check if a value is a valid number, making it easier to write and understand the code.
**If you change/remove it**: If you remove or change the numbers parsing, the program may not work as expected. For example, if you remove the `if (isNaN(amount))` statement, the program will not check if the `amount` variable is a valid number.

---
### Concept 9: Database Operations
Database operations are used to interact with a database. They are defined using the `database.method()` syntax.
**General Example**
```javascript
const db = require('database');
db.getUser('John', (err, user) => {
  console.log(user);
});
```
**In Our Code**
```javascript
const user = economyModule.getUser(userId);
economyModule.logTransaction(userId, "Penalty Won (Refunded/Daily Cap)", 0, user.wallet);
```
**How it works here**: Database operations are used to interact with the economy module database. The `getUser()` method is used to get the user's data, and the `logTransaction()` method is used to log a transaction.
**Why it's used**: Database operations are used to interact with a database, making it easier to store and retrieve data.
**If you change/remove it**: If you remove or change a database operation, the program may not work as expected. For example, if you remove the `const user = economyModule.getUser(userId)` statement, the program will not get the user's data from the database.

---
### Concept 10: Functions
Functions are used to define reusable blocks of code. They are defined using the `function` keyword.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
function penalty(userId, amount, direction, economyModule) {
  // ...
}
```
**How it works here**: A function is used to define a reusable block of code that can be called with different arguments. The `penalty()` function is used to perform a penalty action.
**Why it's used**: Functions are used to define reusable blocks of code, making it easier to write and understand the code.
**If you change/remove it**: If you remove or change a function, the program may not work as expected. For example, if you remove the `penalty()` function, the program will not be able to perform a penalty action.
