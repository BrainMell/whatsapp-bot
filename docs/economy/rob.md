# Rob Command Flow (`rob`, `steal`)

## 1. Description
The Rob command allows a registered user to attempt to steal money from another registered user's Wallet. Success rate is 40%. A failed attempt results in a police fine and accumulating "robbery strikes" that lead to temporary command bans (jail/prison).

---

## 2. Hierarchical Execution Tree
```text
User A (Thief) sends ".j rob @UserB" or ".j steal @UserB"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " rob ") || "steal ") (L14728)
            └── Check registration: economy.isRegistered(senderJid)
            └── Resolve victim: getMentionOrReply(m) (L14746)
            └── Validate target is registered & not the thief & not the bot
            └── core/rpg/economy.js
                └── robUser(thiefId, victimId) (L1200)
                    └── Check jail/prison active bans
                    └── Check 30-minute cooldown: lastRob
                    └── Check victim wallet >= 500 Zeni (L1227)
                    └── Decrement social relationship: socialSystem.incrementRelationship(...) (L1236)
                    └── Determine outcome: Math.random() < 0.4 (L1231)
                    └── If Success:
                        └── Steal percentage: 10% to 30% of victim wallet
                        └── victim.wallet -= amount, thief.wallet += amount
                        └── logTransaction for both users
                        └── scheduleSave for both users
                    └── If Busted:
                        └── Calculate fine (1% of thief wallet, min 500)
                        └── Increment robberyStrikes
                        └── Apply jail (30 min) on strike 2 or prison (24 hrs) on strike 3
                        └── logTransaction for thief
                        └── scheduleSave for thief
            └── sock.sendMessage(chatId, { text: result.message }) (L1776)
            └── awardProgression(senderJid, chatId) (L1780)
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

### Step 2: Command Matching and Parameter Validation
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14728-L14782)
* **Line Numbers**: 14728-14782
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Target recipient `victim` JID

```javascript
                    const victim = getMentionOrReply(m);

                    if (!victim) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: \`${botConfig.getPrefix()} rob @user\` or reply to their message.`,
                      });
                      return;
                    }

                    if (victim === senderJid) {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `❌ You can't rob yourself.`,
                      });
                      return;
                    }

                    // Check if target is the bot
                    const botJid =
                      sock.user.id.split(":")[0] + "@s.whatsapp.net";
                    const botLid = sock.authState.creds?.me?.lid;
                    if (victim === botJid || victim === botLid) {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `❌ you cant rob the bot`,
                      });
                      return;
                    }
```

#### Explanation
- Captures commands beginning with `rob ` or `steal `.
- Fetches target user via mention or reply.
- Validates that the thief is not trying to rob themselves or the bot.

---

### Step 3: Robbery Cooldown and Ban Validations
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L1211-L1229)
* **Line Numbers**: 1211-1229
* **Called From**: `core/engine.js`
* **Inputs**: `(thiefId, victimId)`
* **Outputs**: Returns early with error message if limits are active

```javascript
  if (thief.prisonUntil && thief.prisonUntil > now) {
    const mins = Math.ceil((thief.prisonUntil - now) / 60000);
    return { success: false, message: `⛓️ *PRISON BAN*\n\nYou are banned from bot commands for ${mins} minute(s).` };
  }

  if (thief.jailUntil && thief.jailUntil > now) {
    const mins = Math.ceil((thief.jailUntil - now) / 60000);
    return { success: false, message: `🚔 *JAIL BAN*\n\nYou are banned from bot commands for ${mins} minute(s).` };
  }

  if (thief.lastRob && (now - thief.lastRob < cooldown)) {
    const timeLeft = cooldown - (now - thief.lastRob);
    const mins = Math.ceil(timeLeft / 60000);
    return { success: false, message: `👮 *POLICE ALERT*\n\nYou're laying low! Wait ${mins} minutes before robbing again.` };
  }
  
  if (victim.wallet < 500) {
    return { success: false, message: `❌ They are too poor to rob!` };
  }
```

#### Explanation
- **Prison Ban**: Checks if the user has a long-term prison ban active.
- **Jail Ban**: Checks if the user is currently jailed for previous robbery offenses.
- **Police Cooldown**: Checks if the 30-minute robbery cooldown is active (`thief.lastRob`).
- **Victim Wealth**: Checks that the victim has at least 500 Zeni in their wallet.

---

### Step 4: Relationship Adjustment & Success Evaluation
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L1230-L1282)
* **Line Numbers**: 1230-1282
* **Called From**: `robUser()` helper
* **Inputs**: Outcomes of probability roll
* **Outputs**: Mutated state, logged transactions, and results payload

```javascript
  const success = Math.random() < 0.4;
  thief.lastRob = now;

  try {
    const socialSystem = require('./socialSystem');
    socialSystem.incrementRelationship(thiefId, victimId, -15);
  } catch (socialErr) {}
  
  if (success) {
    const percent = Math.floor(Math.random() * 20) + 10;
    const amount = Math.floor(victim.wallet * (percent / 100));
    
    victim.wallet -= amount;
    thief.wallet += amount;
    
    logTransaction(thiefId, `Robbed @${victimId.split('@')[0]}`, amount, thief.wallet);
    logTransaction(victimId, `Robbed by @${thiefId.split('@')[0]}`, -amount, victim.wallet);

    scheduleSave(thiefId);
    scheduleSave(victimId);
    return { 
      success: true, 
      message: `🥷 *ROBBERY SUCCESSFUL*\n\nYou stole ${getZENI()}${amount.toLocaleString()} from @${victimId.split('@')[0]}!` 
    };
  } else {
    const fine = Math.max(500, Math.floor(thief.wallet * 0.01));
    thief.wallet = Math.max(0, thief.wallet - fine);

    thief.robberyStrikes = (thief.robberyStrikes || 0) + 1;

    let penaltyLine = `💸 Fine paid: ${getZENI()}${fine.toLocaleString()}.`;
    if (thief.robberyStrikes === 1) {
      penaltyLine += `\n⚠️ First offense: fine only.`;
    } else if (thief.robberyStrikes === 2) {
      thief.jailUntil = now + jailDuration;
      penaltyLine += `\n🚔 Second offense: 30-minute jail ban.`;
    } else {
      thief.prisonUntil = now + prisonDuration;
      thief.jailUntil = 0;
      thief.robberyStrikes = 0;
      penaltyLine += `\n⛓️ Third offense: 1-day prison ban.`;
    }
    
    logTransaction(thiefId, "Robbery Fine (Police)", -fine, thief.wallet);
    scheduleSave(thiefId);
```

#### Explanation
1. Rolls outcome: 40% success rate.
2. Invokes `socialSystem.incrementRelationship` to penalize the relationship between both users by 15 points.
3. **Outcome - SUCCESS**:
   - Computes transfer amount (random 10% to 30% of victim wallet).
   - Updates wallets, logs the transactions, and saves both documents to MongoDB.
4. **Outcome - FAILURE (Busted)**:
   - Deducts fine (1% of thief wallet, min 500 Zeni).
   - Increments robbery strikes. If strike 2, applies a 30-minute jail ban. If strike 3+, applies a 24-hour prison ban.
   - Saves changes to MongoDB.

---

## 4. How to Modify
To adjust the robbery rules:
- **Change Success Rate**: Edit [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L1231):
  ```javascript
  const success = Math.random() < 0.3; // Reduce success rate to 30%
  ```
- **Change Cooldown Duration**: Change `cooldown` variable in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L1207):
  ```javascript
  const cooldown = 60 * 60 * 1000; // Change to 1 hour cooldown
  ```
- **Change Payout Percentage**: Change the percentage calculation in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L1240):
  ```javascript
  const percent = Math.floor(Math.random() * 10) + 5; // Steal 5% to 15% instead
  ```
- **Custom Guards / Shield Items**: Check if the victim owns a specific shield item in their inventory to block robberies entirely.










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
const victim = getMentionOrReply(m);
const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
```
**How it works here**: Variables are used to store the result of functions like `getMentionOrReply(m)` and to construct a string like `botJid`.
**Why it's used**: Variables are used to make the code more readable and to avoid repeating the same value or expression multiple times.
**If you change/remove it**: If you remove the variable declaration, the code will throw an error because the variable is being used later in the code. If you change the variable name, you need to update all the places where the variable is used.

---
### Concept 2: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are like decision-making tools that help the program decide what to do next.
**General Example**
```javascript
let age = 25;
if (age > 18) {
  console.log('You are an adult');
} else {
  console.log('You are a minor');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (victim === senderJid) {
  await sock.sendMessage(chatId, {
    text: BOT_MARKER + `❌ You can't rob yourself.`,
  });
  return;
}
```
**How it works here**: Conditional statements are used to check if certain conditions are met, and if so, execute a block of code. For example, the code checks if the `type` is not "notify" or "append", and if so, it returns.
**Why it's used**: Conditional statements are used to add logic to the program and make it more dynamic.
**If you change/remove it**: If you remove the conditional statement, the code will not check for the condition and will execute the code inside the block regardless. If you change the condition, the code will behave differently.

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
const victim = getMentionOrReply(m);
```
**How it works here**: The `getMentionOrReply(m)` function is called to get the victim's ID.
**Why it's used**: Functions are used to organize the code, make it more reusable, and reduce duplication.
**If you change/remove it**: If you remove the function call, the code will not get the victim's ID. If you change the function name or arguments, the code will behave differently.

---
### Concept 4: Array Methods
Array methods are used to perform operations on arrays, such as mapping, filtering, and reducing.
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
    // ...
  })
);
```
**How it works here**: The `map()` method is used to iterate over the `messages` array and perform an asynchronous operation on each message.
**Why it's used**: Array methods are used to simplify the code and make it more efficient.
**If you change/remove it**: If you remove the `map()` method, the code will not iterate over the `messages` array. If you change the method, the code will behave differently.

---
### Concept 5: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries. They represent a value that may not be available yet, but will be resolved at some point in the future.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // ...
  resolve('Hello, world!');
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
**How it works here**: The `Promise.all()` method is used to wait for all the promises in the `messages` array to resolve.
**Why it's used**: Promises are used to handle asynchronous operations and make the code more efficient.
**If you change/remove it**: If you remove the `Promise.all()` method, the code will not wait for the promises to resolve. If you change the method, the code will behave differently.

---
### Concept 6: Imports
Imports are used to bring in external modules or libraries into the current scope.
**General Example**
```javascript
const math = require('mathjs');
console.log(math.sqrt(4)); // Outputs: 2
```
**In Our Code**
```javascript
const socialSystem = require('./socialSystem');
socialSystem.incrementRelationship(thiefId, victimId, -15);
```
**How it works here**: The `socialSystem` module is imported and its `incrementRelationship()` function is called.
**Why it's used**: Imports are used to bring in external functionality and make the code more modular.
**If you change/remove it**: If you remove the import statement, the code will throw an error because the `socialSystem` module is not defined. If you change the import statement, the code will behave differently.

---
### Concept 7: Object Properties
Object properties are used to store and access data in an object.
**General Example**
```javascript
let person = {
  name: 'John',
  age: 25
};
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
thief.lastRob = now;
victim.wallet -= amount;
```
**How it works here**: Object properties are used to store and access data in the `thief` and `victim` objects.
**Why it's used**: Object properties are used to store and access data in a structured way.
**If you change/remove it**: If you remove the object property, the code will throw an error because the property is not defined. If you change the property name, the code will behave differently.

---
### Concept 8: Math Operations
Math operations are used to perform arithmetic operations, such as addition, subtraction, multiplication, and division.
**General Example**
```javascript
let x = 5;
let y = 3;
console.log(x + y); // Outputs: 8
```
**In Our Code**
```javascript
const percent = Math.floor(Math.random() * 20) + 10;
const amount = Math.floor(victim.wallet * (percent / 100));
```
**How it works here**: Math operations are used to calculate the percentage and amount of money to steal.
**Why it's used**: Math operations are used to perform arithmetic operations and make the code more dynamic.
**If you change/remove it**: If you remove the math operation, the code will not calculate the percentage and amount correctly. If you change the math operation, the code will behave differently.

---
### Concept 9: Random Number Generation
Random number generation is used to generate random numbers, which can be used to introduce randomness and unpredictability in the code.
**General Example**
```javascript
let randomNum = Math.random();
console.log(randomNum); // Outputs: a random number between 0 and 1
```
**In Our Code**
```javascript
const success = Math.random() < 0.4;
```
**How it works here**: Random number generation is used to determine whether the robbery is successful or not.
**Why it's used**: Random number generation is used to introduce randomness and unpredictability in the code.
**If you change/remove it**: If you remove the random number generation, the code will not introduce randomness and unpredictability. If you change the probability, the code will behave differently.

---
### Concept 10: Date and Time
Date and time are used to represent and manipulate dates and times in the code.
**General Example**
```javascript
let now = new Date();
console.log(now); // Outputs: the current date and time
```
**In Our Code**
```javascript
const now = Date.now();
if (thief.prisonUntil && thief.prisonUntil > now) {
  // ...
}
```
**How it works here**: Date and time are used to check if the thief is in prison or not.
**Why it's used**: Date and time are used to represent and manipulate dates and times in the code.
**If you change/remove it**: If you remove the date and time, the code will not check if the thief is in prison or not. If you change the date and time, the code will behave differently.
