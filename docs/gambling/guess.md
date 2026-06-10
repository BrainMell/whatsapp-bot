# Guess Command Flow (`guess`)

## 1. Description
The Guess command allows players to guess a number between 1 and 10 with a bet. Correct guesses yield a 9x payout (a net 8x gain on top of the original bet returned), subject to house edge scaling and daily profit limits.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j guess 1000 7"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " guess")) (L15627)
            └── parseGamblingArgs(txt, ['guess']) (L15634)
            └── core/gambling.js
                └── guessNumber(senderJid, amount, guess, economy) (L1780)
                    └── ensureGamblingProfile(user)
                    └── beginGamblingRound(user)
                    └── maybeForceLoss(ctx)
                    └── capPayoutByDailyLimit(user, payoutAmount)
                    └── updateGamblingStats(userId, amount, won, economyModule)
                    └── economyModule.logTransaction(userId, description, amount, wallet)
                    └── user.wallet +/-= amount/gain
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L15650)
            └── awardProgression(senderJid, chatId) (L15654)
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L15627-L15642)
* **Line Numbers**: 15627-15642
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Parsed `amount` and `guess` number string

```javascript
                  // guess <amt> <1-10>
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} guess` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} guess `,
                    )
                  ) {
                    const { amount, extra: guess } = parseGamblingArgs(txt, ['guess']);

                    if (isNaN(amount) || !guess) {
                      return await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: ${botConfig.getPrefix()} guess <amount> <1-10>`,
                      });
                    }
```

#### Explanation
- Compares the message to the prefix + `guess` command.
- Extracts parameters using `parseGamblingArgs(txt, ['guess'])` which splits the message, finds the word ending in `guess`, and reads the next arguments as `amount` (integer) and `guess` (string/number).
- Sends usage guide if values are invalid.

---

### Step 3: Command Routing
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L15644-L15655)
* **Line Numbers**: 15644-15655
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");` (defined in [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js))
* **Inputs**: `senderJid`, `amount`, `guess`, `economy`
* **Outputs**: Sends result message and triggers player progress award

```javascript
                    const result = gambling.guessNumber(
                      senderJid,
                      amount,
                      guess,
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
- Routes execution to `gambling.guessNumber(...)`.
- Sends the generated game response text back to the WhatsApp group, tagging the user.
- Runs `awardProgression` to give progression experience/points to the active user.

---

### Step 4: Guess Evaluation
* **File Path**: [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js#L1780-L1806)
* **Line Numbers**: 1780-1806
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, guess, economyModule)`
* **Outputs**: `{ success: boolean, won?: boolean, message: string }` status object

```javascript
function guessNumber(userId, amount, guess, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const num = parseInt(guess);
  if (isNaN(num) || num < 1 || num > 10) return { success: false, message: "❌ Guess a number between 1-10!" };

  const result = Math.floor(Math.random() * 10) + 1;
  const ctx = beginGamblingRound(user);
  const won = num === result && !maybeForceLoss(ctx);
```

#### Explanation
1. Checks if the user is registered in the database, has sufficient funds, and if the bet is within the global min/max limits.
2. Validates guess is a valid number between 1 and 10.
3. Generates the winning result randomly between 1 and 10.
4. Initializes the session via `beginGamblingRound` and determines if the user won (guess matches result, and no forced loss was triggered).

---

### Step 5: Payout Calculation, Database Mutations, and Logs
* **File Path**: [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js#L1807-L1865)
* **Line Numbers**: 1807-1865
* **Called From**: `guessNumber()` function
* **Inputs**: `won` status, `amount`, `num` (user's guess), `result` (winning number)
* **Outputs**: Formatted response message payload

```javascript
  if (won) {
    const rawGain = amount * 8;
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Guess Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${guessVisual}
... (Cap message) ...`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Guess Won (${num})`, gain, user.wallet);
    return {
      success: true,
      won: true,
      message: `${guessVisual}
... (Win message) ...`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Guess Lost (${num})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `${guessVisual}
... (Lost message) ...`
    };
  }
```

#### Explanation
1. If user **won**:
   - Calculates the net profit payout of +8x of the bet (`rawGain = amount * 8`, which combined with the returned bet makes a 9x payout).
   - Applies house edge and checks daily limits (`capPayoutByDailyLimit`).
   - If the limit was reached and no payout is allowed, returns a refunded message.
   - Otherwise, increases user wallet, tracks stats, adds net profit to daily tracking, updates global gambling statistics via `updateGamblingStats()`, and records the transaction via `logTransaction()`.
2. If user **lost**:
   - Deducts the bet amount from user's wallet.
   - Updates stats, updates net profit negatively via `trackDailyNet()`, and records the transaction via `logTransaction()`.
3. Calls `economyModule.saveUser(userId)` inside `updateGamblingStats` to persist data back to the MongoDB/Mongoose database.

---

## 5. How to Modify
To adjust Guess multipliers, probability, or layout:
- **Adjusting multiplier (default 9x)**: Change `8` (representing 8x net profit) in [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js#L1808):
  ```javascript
  const rawGain = amount * 9; // Increase payout profit to 9x net profit (10x payout total)
  ```
- **Adjusting Guess range (default 1-10)**: Update the validation check in [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js#L1793) and the random generator:
  ```javascript
  if (isNaN(num) || num < 1 || num > 5) return { success: false, message: "❌ Guess a number between 1-5!" };
  const result = Math.floor(Math.random() * 5) + 1;
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
const { amount, extra: guess } = parseGamblingArgs(txt, ['guess']);
```
**How it works here**: Variables are used to store the `amount` and `guess` values extracted from the user's input.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to write and understand the code.
**If you change/remove it**: If you remove the variables, the program will not be able to store and reuse the values, and it will throw an error.

### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
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
**How it works here**: An arrow function is used as an event listener for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and easier to read.
**If you change/remove it**: If you remove the arrow function, the event listener will not be defined, and the program will not respond to the `messages.upsert` event.

### Concept 3: Event Listeners
Event listeners are used to respond to events, such as user input or network requests. They are defined using the `on` method.
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
**Why it's used**: Event listeners are used to respond to events, making the program interactive and dynamic.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event, and it will not process new messages.

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
```
**How it works here**: A conditional statement is used to check the `type` of the event, and if it's not `notify` or `append`, the function returns.
**Why it's used**: Conditional statements are used to make decisions based on conditions, making the program more dynamic and interactive.
**If you change/remove it**: If you remove the conditional statement, the function will not check the `type` of the event, and it may process events that it's not supposed to.

### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They are defined using the `map`, `filter`, and `reduce` methods.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubled = numbers.map(n => n * 2);
console.log(doubled); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  }),
);
```
**How it works here**: The `map` method is used to transform the `messages` array into an array of promises.
**Why it's used**: Array methods are used to manipulate and transform arrays, making it easier to work with data.
**If you change/remove it**: If you remove the array method, the program will not be able to transform the `messages` array, and it may throw an error.

### Concept 6: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries. They are defined using the `Promise` constructor.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // ...
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
**How it works here**: Promises are used to handle the asynchronous operations of processing the `messages` array.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to write and understand the code.
**If you change/remove it**: If you remove the promises, the program will not be able to handle the asynchronous operations, and it may throw an error.

### Concept 7: Destructuring
Destructuring is used to extract values from objects or arrays. It is defined using the `{}` syntax.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
const { amount, extra: guess } = parseGamblingArgs(txt, ['guess']);
```
**How it works here**: Destructuring is used to extract the `amount` and `guess` values from the `parseGamblingArgs` function.
**Why it's used**: Destructuring is used to extract values from objects or arrays, making it easier to write and understand the code.
**If you change/remove it**: If you remove the destructuring, the program will not be able to extract the values, and it will throw an error.

### Concept 8: Numbers Parsing
Numbers parsing is used to convert strings to numbers. It is defined using the `parseInt` or `parseFloat` functions.
**General Example**
```javascript
let str = '123';
let num = parseInt(str);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const num = parseInt(guess);
```
**How it works here**: Numbers parsing is used to convert the `guess` string to a number.
**Why it's used**: Numbers parsing is used to convert strings to numbers, making it easier to work with data.
**If you change/remove it**: If you remove the numbers parsing, the program will not be able to convert the `guess` string to a number, and it will throw an error.

### Concept 9: Math Operations
Math operations are used to perform mathematical calculations. They are defined using the `Math` object.
**General Example**
```javascript
let result = Math.floor(10.5);
console.log(result); // Outputs: 10
```
**In Our Code**
```javascript
const result = Math.floor(Math.random() * 10) + 1;
```
**How it works here**: Math operations are used to generate a random number between 1 and 10.
**Why it's used**: Math operations are used to perform mathematical calculations, making it easier to work with data.
**If you change/remove it**: If you remove the math operations, the program will not be able to generate a random number, and it will throw an error.

---
### Concept 10: Functions
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
function guessNumber(userId, amount, guess, economyModule) {
  // ...
}
```
**How it works here**: A function is used to define the `guessNumber` logic.
**Why it's used**: Functions are used to define reusable blocks of code, making it easier to write and understand the code.
**If you change/remove it**: If you remove the function, the program will not be able to define the `guessNumber` logic, and it will throw an error.

---
### Concept 11: Object Properties
Object properties are used to access and manipulate object values. They are defined using the `.` syntax.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const user = economyModule.getUser(userId);
```
**How it works here**: Object properties are used to access the `getUser` method of the `economyModule` object.
**Why it's used**: Object properties are used to access and manipulate object values, making it easier to work with data.
**If you change/remove it**: If you remove the object properties, the program will not be able to access the `getUser` method, and it will throw an error.

---
### Concept 12: Conditional Statements with Multiple Conditions
Conditional statements with multiple conditions are used to make decisions based on multiple conditions. They are defined using the `if` and `else` keywords.
**General Example**
```javascript
let age = 25;
let name = 'John';
if (age >= 18 && name === 'John') {
  console.log('You are an adult and your name is John!');
} else {
  console.log('You are not an adult or your name is not John!');
}
```
**In Our Code**
```javascript
if (isNaN(num) || num < 1 || num > 10) return { success: false, message: "❌ Guess a number between 1-10!" };
```
**How it works here**: A conditional statement with multiple conditions is used to check if the `num` value is a valid guess.
**Why it's used**: Conditional statements with multiple conditions are used to make decisions based on multiple conditions, making the program more dynamic and interactive.
**If you change/remove it**: If you remove the conditional statement, the program will not be able to check if the `num` value is a valid guess, and it will throw an error.

---
### Concept 13: Return Statements
Return statements are used to exit a function and return a value. They are defined using the `return` keyword.
**General Example**
```javascript
function add(a, b) {
  return a + b;
}
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
return { success: false, message: "❌ Guess a number between 1-10!" };
```
**How it works here**: A return statement is used to exit the function and return an error message.
**Why it's used**: Return statements are used to exit a function and return a value, making it easier to write and understand the code.
**If you change/remove it**: If you remove the return statement, the function will not be able to exit and return a value, and it will throw an error.

---
### Concept 14: Object Destructuring with Renaming
Object destructuring with renaming is used to extract values from objects and rename them. It is defined using the `{}` syntax.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name: fullName, age: yearsOld } = person;
console.log(fullName); // Outputs: John
console.log(yearsOld); // Outputs: 25
```
**In Our Code**
```javascript
const { amount, extra: guess } = parseGamblingArgs(txt, ['guess']);
```
**How it works here**: Object destructuring with renaming is used to extract the `amount` and `guess` values from the `parseGamblingArgs` function and rename the `extra` property to `guess`.
**Why it's used**: Object destructuring with renaming is used to extract values from objects and rename them, making it easier to write and understand the code.
**If you change/remove it**: If you remove the object destructuring with renaming, the program will not be able to extract the values and rename them, and it will throw an error.

---
### Concept 15: Async/Await Syntax
Async/await syntax is used to write asynchronous code that is easier to read and understand. It is defined using the `async` and `await` keywords.
**General Example**
```javascript
async function example() {
  let data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  }),
);
```
**How it works here**: Async/await syntax is used to write asynchronous code that is easier to read and understand.
**Why it's used**: Async/await syntax is used to write asynchronous code that is easier to read and understand, making it easier to write and maintain the code.
**If you change/remove it**: If you remove the async/await syntax, the program will not be able to write asynchronous code that is easier to read and understand, and it will throw an error.
