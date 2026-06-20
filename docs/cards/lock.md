# Card Management Command Flow (`lock` / `merge` / `mergeall` / `burn` / `accept` / `decline`)

## 1. Description
The Card Management commands allow players to protect, merge, or delete cards in their collection.
- **`lock`**: Toggles security lock on a card (preventing accidental sales, merging, or burning).
- **`merge`**: Consumes two duplicate cards of the same ID to return a single card and a reward of 500 Zeni.
- **`mergeall`**: Automatically merges all duplicates in the collection and awards 500 Zeni per duplicate merged.
- **`burn`**: Initiates deletion of a card in exchange for visual validation, requiring a follow-up `.g accept` or `.g decline` to finalize.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🧬 MASS MERGE DUPLICATES: User sends ".g mergeall"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdMergeAll(senderJid, reply) (L1433)
                    ├── Query owned cards: UserCard.find({ userId, forSale: false, isLocked: false })
                    ├── Group cards by cardId array lists (L1437)
                    ├── Loop through groups:
                    │   ├── Check if list.length >= 2
                    │   └── Delete duplicates: UserCard.findByIdAndDelete(list[i]._id) (L1450)
                    ├── Transfer accumulated rewards: economy.addMoney(senderJid, totalReward) (L1459)
                    └── Return mass merge text summary with total Zeni gained

======================================================
🔥 BURN CARD PROMPT: User sends ".g burn 3"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdBurn(senderJid, reply, chatId, args) (L729)
                    ├── Find card index: owned[idx - 1] (L734-735)
                    ├── Generate burn animation GIF: goService.generateBurnGif(imageUrl) (L742)
                    ├── Register confirmation session: pendingBurns.set(`${chatId}_${senderJid}`, { ucId, cardName }) (L755)
                    └── Send prompt message with accept/decline instructions

======================================================
✅ CONFIRM BURN: User sends ".g accept"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdAccept(senderJid, reply, chatId) (L758)
                    ├── Retrieve pending request: pendingBurns.get(`${chatId}_${senderJid}`)
                    ├── Delete card document: UserCard.findByIdAndDelete(pending.ucId) (L765)
                    ├── Evict session key: pendingBurns.delete(key)
                    └── Return final deletion status confirmation
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger & Intercept
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4400-L4412)
* **Line Numbers**: 4400-4412
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ lowerTxt, txt, senderJid, chatId, m, ... }`
* **Outputs**: Returns early if card command is matched

```javascript
                  const cardHandled = await cardSystem.handleCommand({
                    lowerTxt,
                    txt,
                    senderJid,
                    chatId,
                    m,
                    economy,
                    isOwner,
                    senderIsAdmin,
                    isMod: overrideUsers.has(senderJid) || isGlobalMod(senderJid),
                  });
                  if (cardHandled) return;
```

#### Explanation
- Intercepts management commands before normal message routing.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1778-L1982)
* **Line Numbers**: 1778-1982
* **Called From**: `handleCommand()`
* **Inputs**: Intercept variables
* **Outputs**: Directs execution to `cmdLock`, `cmdMerge`, `cmdMergeAll`, `cmdBurn`, `cmdAccept`, or `cmdDecline`.

```javascript
  switch (cmd) {
    case 'lock':
      await cmdLock(senderJid, reply, args);
      return true;

    case 'merge':
      await cmdMerge(senderJid, reply, args);
      return true;

    case 'mergeall':
      await cmdMergeAll(senderJid, reply);
      return true;

    case 'burn':
      await cmdBurn(senderJid, reply, chatId, args);
      return true;

    case 'accept':
      return await cmdAccept(senderJid, reply, chatId);

    case 'decline':
      return await cmdDecline(senderJid, reply, chatId);
```

#### Explanation
- Matches command strings to run management actions.

---

### Step 3: Deleting Duplicates & Gaining Zeni (mass merge)
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1433-L1462)
* **Line Numbers**: 1433-1462
* **Called From**: `cmdMergeAll()`
* **Inputs**: `(senderJid, reply)`
* **Outputs**: Deletes duplicate UserCard documents, transfers total Zeni, sends details

```javascript
async function cmdMergeAll(senderJid, reply) {
  try {
    const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, forSale: false, isLocked: false });
    const groups = {};
    owned.forEach(uc => {
      if (!groups[uc.cardId]) groups[uc.cardId] = [];
      groups[uc.cardId].push(uc);
    });

    let totalMerged = 0;
    let totalReward = 0;

    for (const cardId in groups) {
      const list = groups[cardId];
      if (list.length >= 2) {
        const toDeleteCount = list.length - 1;
        for (let i = 0; i < toDeleteCount; i++) {
          await UserCard.findByIdAndDelete(list[i]._id);
          totalMerged++;
          totalReward += 500;
        }
      }
    }

    if (totalMerged === 0) return reply('✨ No duplicates found to merge.');

    economy.addMoney(senderJid, totalReward);
    return reply(`🧬 *MASS MERGE COMPLETE!*\n\nMerged ${totalMerged} duplicate cards.\n💰 Total Reward: ${ZENI()}${totalReward.toLocaleString()} Zeni`);
  } catch (err) { return reply('❌ Mass merge failed.'); }
}
```

#### Explanation
1. Queries all unlocked card documents in the player's collection.
2. Organizes them into group arrays by `cardId` properties.
3. Loops through each group: if a group contains 2 or more cards, deletes all but 1 copy from MongoDB using `findByIdAndDelete()`.
4. Adds Zeni rewards (500 Zeni per duplicate consumed) to the player's wallet using `economy.addMoney()`.
5. Emits a text confirmation detailing the number of merged cards and the total Zeni earned.

---

### Step 4: Resolving Burn Confirmations
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L758-L781)
* **Line Numbers**: 758-781
* **Called From**: `cmdAccept()` or `cmdDecline()`
* **Inputs**: `(senderJid, reply, chatId)`
* **Outputs**: Finalizes card deletion or cancels action

```javascript
async function cmdAccept(senderJid, reply, chatId) {
  const inst = getInst();
  const key = `${chatId}_${senderJid}`;
  const pending = inst.pendingBurns.get(key);
  if (!pending) return false;

  try {
    await UserCard.findByIdAndDelete(pending.ucId);
    inst.pendingBurns.delete(key);
    await reply(`🔥 *ASHES TO ASHES...*\n\n*${pending.cardName}* has been deleted from your collection forever.`);
    return true;
  } catch (err) {
    await reply('❌ Failed to delete card.');
    return true;
  }
}
```

#### Explanation
1. Checks for a registered confirmation key in `inst.pendingBurns` Map.
2. If found, extracts the user card document ID (`ucId`).
3. Deletes the document from the database using `UserCard.findByIdAndDelete()`.
4. Deletes the pending request from the `pendingBurns` Map.
5. Sends a deletion confirmation message.

---

## 4. How to Modify
- **Adjust Merge Zeni Rewards**: Change the reward constant value `500` inside `cmdMerge` at [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1426) and `cmdMergeAll` at [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1452).
- **Modify Locking Safeguards**: You can add additional checks for `isLocked` in other commands (like trading or custom decks).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They are like labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const cardHandled = await cardSystem.handleCommand({
  lowerTxt,
  txt,
  senderJid,
  chatId,
  m,
  economy,
  isOwner,
  senderIsAdmin,
  isMod: overrideUsers.has(senderJid) || isGlobalMod(senderJid),
});
```
**How it works here**: The `cardHandled` variable is used to store the result of the `cardSystem.handleCommand` function.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to write and understand the code.
**If you change/remove it**: If you remove the `cardHandled` variable, the program will not be able to store the result of the `cardSystem.handleCommand` function, and the subsequent `if` statement will not work as expected.

---
### Concept 2: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are like decision-making tools that help the program decide what to do next.
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
if (cardHandled) return;
```
**How it works here**: The `if` statement checks the value of the `cardHandled` variable, and if it's true, the program returns immediately.
**Why it's used**: Conditional statements are used to control the flow of the program, making it possible to execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove the `if` statement, the program will continue executing the next lines of code, regardless of the value of the `cardHandled` variable.

---
### Concept 3: Switch Statements
Switch statements are used to execute different blocks of code based on the value of a variable. They are like conditional statements, but more concise and efficient.
**General Example**
```javascript
let color = 'red';
switch (color) {
  case 'red':
    console.log('The color is red');
    break;
  case 'blue':
    console.log('The color is blue');
    break;
  default:
    console.log('The color is unknown');
}
```
**In Our Code**
```javascript
switch (cmd) {
  case 'lock':
    await cmdLock(senderJid, reply, args);
    return true;
  // ...
}
```
**How it works here**: The `switch` statement checks the value of the `cmd` variable, and executes the corresponding block of code.
**Why it's used**: Switch statements are used to simplify the code and make it more readable, by avoiding multiple `if` statements.
**If you change/remove it**: If you remove the `switch` statement, the program will not be able to execute the different blocks of code based on the value of the `cmd` variable.

---
### Concept 4: Functions
Functions are reusable blocks of code that perform a specific task. They are like recipes that can be used multiple times.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
async function cmdMergeAll(senderJid, reply) {
  // ...
}
```
**How it works here**: The `cmdMergeAll` function is defined to perform a specific task, and can be called multiple times with different arguments.
**Why it's used**: Functions are used to organize the code, make it more reusable, and simplify the programming process.
**If you change/remove it**: If you remove the `cmdMergeAll` function, the program will not be able to perform the task that the function is designed to do.

---
### Concept 5: Async/Await
Async/await is a syntax used to write asynchronous code that is easier to read and maintain. It allows the program to execute multiple tasks concurrently, without blocking the main thread.
**General Example**
```javascript
async function fetchData() {
  const data = await fetch('https://api.example.com/data');
  console.log(data);
}
```
**In Our Code**
```javascript
async function cmdMergeAll(senderJid, reply) {
  try {
    const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, forSale: false, isLocked: false });
    // ...
  } catch (err) {
    // ...
  }
}
```
**How it works here**: The `async` keyword is used to define an asynchronous function, and the `await` keyword is used to pause the execution of the function until the promise is resolved.
**Why it's used**: Async/await is used to simplify the asynchronous code, making it easier to read and maintain.
**If you change/remove it**: If you remove the `async` and `await` keywords, the program will not be able to execute the asynchronous tasks correctly, and may cause errors or unexpected behavior.

---
### Concept 6: Try-Catch Blocks
Try-catch blocks are used to handle errors and exceptions in the program. They allow the program to continue executing even if an error occurs.
**General Example**
```javascript
try {
  const data = fetch('https://api.example.com/data');
  console.log(data);
} catch (err) {
  console.error(err);
}
```
**In Our Code**
```javascript
try {
  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, forSale: false, isLocked: false });
  // ...
} catch (err) {
  return reply('❌ Mass merge failed.');
}
```
**How it works here**: The `try` block contains the code that may throw an error, and the `catch` block contains the code that will be executed if an error occurs.
**Why it's used**: Try-catch blocks are used to handle errors and exceptions, making the program more robust and reliable.
**If you change/remove it**: If you remove the try-catch block, the program will crash if an error occurs, and will not be able to recover from the error.

---
### Concept 7: Database Operations
Database operations are used to interact with a database, such as creating, reading, updating, and deleting data.
**General Example**
```javascript
const db = require('mongodb').MongoClient;
db.connect('mongodb://localhost:27017/', (err, client) => {
  const collection = client.collection('users');
  collection.find({ name: 'John' }, (err, result) => {
    console.log(result);
  });
});
```
**In Our Code**
```javascript
const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, forSale: false, isLocked: false });
```
**How it works here**: The `UserCard.find` method is used to retrieve data from the database, based on the specified conditions.
**Why it's used**: Database operations are used to store and retrieve data, making it possible to persist data between program executions.
**If you change/remove it**: If you remove the database operation, the program will not be able to retrieve or store data, and will not be able to function correctly.

---
### Concept 8: Object Methods
Object methods are functions that are attached to an object, and can be used to perform operations on the object.
**General Example**
```javascript
const person = {
  name: 'John',
  age: 30,
  greet: function() {
    console.log(`Hello, my name is ${this.name} and I am ${this.age} years old.`);
  }
};
person.greet(); // Outputs: Hello, my name is John and I am 30 years old.
```
**In Our Code**
```javascript
const pending = inst.pendingBurns.get(key);
```
**How it works here**: The `get` method is used to retrieve a value from the `pendingBurns` object.
**Why it's used**: Object methods are used to encapsulate data and behavior, making it easier to organize and reuse code.
**If you change/remove it**: If you remove the object method, the program will not be able to perform the operation, and will throw an error.

---
### Concept 9: Arrays and Array Methods
Arrays are collections of values, and array methods are used to manipulate and transform arrays.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
numbers.forEach((num) => {
  console.log(num);
});
```
**In Our Code**
```javascript
owned.forEach(uc => {
  if (!groups[uc.cardId]) groups[uc.cardId] = [];
  groups[uc.cardId].push(uc);
});
```
**How it works here**: The `forEach` method is used to iterate over the `owned` array, and the `push` method is used to add elements to the `groups` array.
**Why it's used**: Arrays and array methods are used to store and manipulate collections of data, making it easier to perform operations on multiple values.
**If you change/remove it**: If you remove the array or array method, the program will not be able to perform the operation, and will throw an error.

---
### Concept 10: Promises
Promises are used to handle asynchronous operations, and provide a way to execute code when a promise is resolved or rejected.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // ...
});
promise.then((result) => {
  console.log(result);
}).catch((err) => {
  console.error(err);
});
```
**In Our Code**
```javascript
const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, forSale: false, isLocked: false });
```
**How it works here**: The `await` keyword is used to pause the execution of the function until the promise is resolved, and the `then` method is used to execute code when the promise is resolved.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to write and maintain asynchronous code.
**If you change/remove it**: If you remove the promise, the program will not be able to handle asynchronous operations correctly, and will throw an error.
