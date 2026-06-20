# Daily Reward Command Flow (`daily`)

## 1. Description
The Daily command allows players to claim a free daily allowance of Zeni (default 500 Zeni) once every 24 hours. Successful claims also award activity points to the user's active Guild.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j daily"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " daily") (L14688)
            └── core/rpg/economy.js
                └── claimDaily(senderJid) (L779)
                    └── getUser(senderJid)
                    └── Check 24-hour cooldown: now - user.lastDaily < 24 hours
                    └── If cooldown active -> returns early with hours/minutes remaining
                    └── Else -> user.wallet += DAILY_REWARD (500 Zeni)
                    └── user.lastDaily = now
                    └── logTransaction(senderJid, "Daily Reward", 500, wallet)
                    └── scheduleSave(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L14692)
            └── If successful claim:
                └── Award Guild points: guilds.awardPointsForActivity(senderJid, "daily_claimed") (L14700)
            └── awardProgression(senderJid, chatId) (L14708)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
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

### Step 2: Command Matching
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14688-L14690)
* **Line Numbers**: 14688-14690
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Routes to daily claim handler

```javascript
                  // daily - Claim daily reward
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} daily`
                  ) {
```

#### Explanation
- Triggers when the user sends `.j daily`.

---

### Step 3: Daily Cooldown check and Balance mutations
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L779-L824)
* **Line Numbers**: 779-824
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function claimDaily(userId) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };
  
  const now = Date.now();
  const dayInMs = 86400000;
  
  if (now - user.lastDaily < dayInMs) {
    const timeLeft = dayInMs - (now - user.lastDaily);
    const hoursLeft = Math.floor(timeLeft / 3600000);
    const minsLeft = Math.floor((timeLeft % 3600000) / 60000);
    
    return {
      success: false,
      message: `⏰ *DAILY ALREADY CLAIMED!* ...`
    };
  }
  
  user.wallet += DAILY_REWARD;
  user.lastDaily = now;
  user.stats.totalEarned += DAILY_REWARD;
  
  logTransaction(userId, "Daily Reward", DAILY_REWARD, user.wallet);
  scheduleSave(userId);
```

#### Explanation
1. Checks that the user is registered.
2. Checks if 24 hours (86,400,000 ms) have passed since `user.lastDaily`.
3. **If Cooldown Active**: Calculates remaining hours and minutes, and returns the cooldown alert.
4. **If Cooldown Cleared**:
   - Adds `DAILY_REWARD` (500 Zeni) to `user.wallet`.
   - Sets `user.lastDaily` to the current timestamp.
   - Logs the transaction as `"Daily Reward"`.
   - Triggers background save via `scheduleSave()`.

---

### Step 4: Guild Activity Award and Reply
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14691-L14710)
* **Line Numbers**: 14691-14710
* **Called From**: `engine.js`
* **Imported From**: `const guilds = require('./guilds');` (defined in [core/rpg/guilds.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js))
* **Inputs**: Claim status outcome
* **Outputs**: WhatsApp response dispatch

```javascript
                    const result = economy.claimDaily(senderJid);
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                    });

                    // Award guild points for daily claim
                    if (result.success) {
                      try {
                        const guilds = require(`./guilds`);
                        guilds.awardPointsForActivity(
                          senderJid,
                          "daily_claimed",
                        );
                      } catch (err) {
                        // Guild system not available, skip
                      }
                    }
                    await awardProgression(senderJid, chatId);
```

#### Explanation
- Delivers the formatted response string to WhatsApp.
- If the reward was successfully claimed, checks the guild system and awards points to the user's guild using the event identifier `"daily_claimed"`.
- Triggers progression points award.

---

## 4. How to Modify
To adjust daily reward values or cooldowns:
- **Change Daily Reward Amount**: Modify the `DAILY_REWARD` constant in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L16):
  ```javascript
  const DAILY_REWARD = 1000; // Increase reward to 1,000 Zeni daily
  ```
- **Change Cooldown Duration**: Modify `dayInMs` variable in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L784):
  ```javascript
  const dayInMs = 12 * 60 * 60 * 1000; // Reduce cooldown to 12 hours
  ```
- **Configure Guild Points Yield**: Modify the reward points in `core/rpg/guilds.js` mapping for the `"daily_claimed"` activity.










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
const DAILY_REWARD = 1000; // Increase reward to 1,000 Zeni daily
const dayInMs = 86400000;
```
**How it works here**: In the code, variables like `DAILY_REWARD` and `dayInMs` are used to store constant values that are used throughout the program.
**Why it's used**: Variables are used to make the code more readable and maintainable. Instead of hardcoding values directly into the code, variables can be used to give those values a meaningful name.
**If you change/remove it**: If you change the value of a variable, the new value will be used throughout the program. If you remove a variable, any code that uses that variable will throw an error.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` symbol.
**General Example**
```javascript
let greet = (name) => {
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
**How it works here**: In the code, an arrow function is used as an event listener for the `messages.upsert` event. When the event is triggered, the arrow function is called with the event data as an argument.
**Why it's used**: Arrow functions are used to make the code more concise and readable. They are particularly useful for defining small, single-purpose functions.
**If you change/remove it**: If you change the arrow function, the new code will be executed when the event is triggered. If you remove the arrow function, the event will not be handled.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are used to respond to user interactions, network requests, and other events.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('The document was clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the code, an event listener is used to respond to the `messages.upsert` event. When the event is triggered, the event listener is called with the event data as an argument.
**Why it's used**: Event listeners are used to make the code interactive and responsive. They allow the program to respond to user interactions and other events.
**If you change/remove it**: If you change the event listener, the new code will be executed when the event is triggered. If you remove the event listener, the event will not be handled.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions based on conditions. They are used to execute different blocks of code based on whether a condition is true or false.
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
if (now - user.lastDaily < dayInMs) {
  // ...
}
```
**How it works here**: In the code, conditional statements are used to make decisions based on conditions. For example, the code checks whether the `type` is not `notify` or `append`, and if so, it returns immediately.
**Why it's used**: Conditional statements are used to make the code more flexible and dynamic. They allow the program to respond differently to different conditions.
**If you change/remove it**: If you change the condition, the code will execute differently based on the new condition. If you remove the conditional statement, the code will always execute the same block of code.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They are used to perform operations such as mapping, filtering, and reducing arrays.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubledNumbers = numbers.map((number) => number * 2);
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
**How it works here**: In the code, the `map` method is used to transform an array of messages into an array of promises. The `Promise.all` method is then used to wait for all the promises to resolve.
**Why it's used**: Array methods are used to make the code more concise and efficient. They allow the program to perform complex operations on arrays in a simple and readable way.
**If you change/remove it**: If you change the array method, the code will execute differently based on the new method. If you remove the array method, the code will not be able to perform the desired operation.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations. They are used to represent a value that may not be available yet, but will be resolved at some point in the future.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('Hello, world!');
  }, 2000);
});
promise.then((message) => {
  console.log(message); // Outputs: Hello, world!
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
**How it works here**: In the code, promises are used to handle asynchronous operations. The `Promise.all` method is used to wait for all the promises to resolve.
**Why it's used**: Promises are used to make the code more asynchronous and efficient. They allow the program to perform complex operations in a simple and readable way.
**If you change/remove it**: If you change the promise, the code will execute differently based on the new promise. If you remove the promise, the code will not be able to handle asynchronous operations.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises. It is used to write asynchronous code that is easier to read and maintain.
**General Example**
```javascript
async function greet() {
  let message = await Promise.resolve('Hello, world!');
  console.log(message); // Outputs: Hello, world!
}
greet();
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the code, async/await is used to write asynchronous code that is easier to read and maintain. The `async` keyword is used to define an asynchronous function, and the `await` keyword is used to wait for a promise to resolve.
**Why it's used**: Async/await is used to make the code more readable and maintainable. It allows the program to perform complex asynchronous operations in a simple and readable way.
**If you change/remove it**: If you change the async/await syntax, the code will execute differently based on the new syntax. If you remove the async/await syntax, the code will not be able to handle asynchronous operations.

---
### Concept 8: Destructuring
Destructuring is a syntax sugar that allows you to extract values from objects and arrays.
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
**How it works here**: In the code, destructuring is used to extract values from an object. The `messages` and `type` values are extracted from the object and assigned to variables.
**Why it's used**: Destructuring is used to make the code more concise and readable. It allows the program to extract values from objects and arrays in a simple and readable way.
**If you change/remove it**: If you change the destructuring syntax, the code will execute differently based on the new syntax. If you remove the destructuring syntax, the code will not be able to extract values from objects and arrays.

---
### Concept 9: Modules and Imports
Modules and imports are used to organize and reuse code. They are used to import functions and variables from other files.
**General Example**
```javascript
// math.js
export function add(a, b) {
  return a + b;
}

// main.js
import { add } from './math.js';
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
const guilds = require(`./guilds`);
guilds.awardPointsForActivity(
  senderJid,
  "daily_claimed",
);
```
**How it works here**: In the code, modules and imports are used to import functions and variables from other files. The `guilds` module is imported and its `awardPointsForActivity` function is used.
**Why it's used**: Modules and imports are used to make the code more organized and reusable. They allow the program to import functions and variables from other files and use them in a simple and readable way.
**If you change/remove it**: If you change the module or import syntax, the code will execute differently based on the new syntax. If you remove the module or import syntax, the code will not be able to import functions and variables from other files.

---
### Concept 10: Numbers and Math Operations
Numbers and math operations are used to perform arithmetic operations.
**General Example**
```javascript
let a = 2;
let b = 3;
let sum = a + b;
console.log(sum); // Outputs: 5
```
**In Our Code**
```javascript
const dayInMs = 86400000;
const hoursLeft = Math.floor(timeLeft / 3600000);
const minsLeft = Math.floor((timeLeft % 3600000) / 60000);
```
**How it works here**: In the code, numbers and math operations are used to perform arithmetic operations. The `dayInMs` variable is used to store a value in milliseconds, and the `Math.floor` function is used to perform integer division.
**Why it's used**: Numbers and math operations are used to make the code more dynamic and interactive. They allow the program to perform complex arithmetic operations in a simple and readable way.
**If you change/remove it**: If you change the number or math operation, the code will execute differently based on the new value or operation. If you remove the number or math operation, the code will not be able to perform the desired arithmetic operation.
