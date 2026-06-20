# Claim Card Command Flow (`claim`)

## 1. Description
The `claim` command allows users to claim a character card that has spawned in the active chat group. Cards spawn periodically (or can be manually forced by card moderators using the `spawn` command). Once a card has spawned, players can claim it by typing `.g claim <card-id>` before it expires. The card is then saved to their collection database.

---

## 2. Hierarchical Execution Tree
```text
User sends ".g claim 3-04521"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Clean input & strip formatting (L4396)
        └── Intercept: cardSystem.handleCommand({ lowerTxt, txt, senderJid, chatId, m, ... }) (L4400)
            └── core/rpg/cardSystem.js
                └── handleCommand(...) (L1778)
                    ├── Verify bot socket reference
                    ├── Resolve sender JID using lidResolver
                    ├── Evaluate strict prefix match (e.g. starts with ".g") (L1793)
                    ├── Extract command word -> "claim" (L1799)
                    └── cmdClaim(args, senderJid, reply, chatId) (L361)
                        ├── Combine args to form target card ID
                        ├── Search activeSpawns Map for exact JID key: `${chatId}_${cardIdInput}`
                        ├── Verify if spawn exists and has not expired (expires in 30 minutes)
                        ├── Create database row: UserCard.create({ userId, cardId, copyNumber }) (L384)
                        ├── Increment CardStat circulation metrics & save
                        ├── Delete card JID from activeSpawns Map
                        └── Send claim confirmation message with rarity indicators to WhatsApp
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger & Intercept
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4395-L4412)
* **Line Numbers**: 4395-4412
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ lowerTxt, txt, senderJid, chatId, m, ... }`
* **Outputs**: Returns early if card command is matched

```javascript
                  // 🧼 CLEAN TEXT: Strip WhatsApp formatting characters (*, ~, outer _) for command parsing
                  const cleanTxt = txt.replace(/[*~]/g, "").replace(/(?<!\w)_|_(?!\w)/g, "");
                  let lowerTxt = cleanTxt.toLowerCase().replace(/\s+/g, " ");

                  // ── CARD SYSTEM INTERCEPT ──────────────────
                  const cardHandled = await cardSystem.handleCommand({
                    lowerTxt, // cleaned, lowercased text
                    txt, // original text
                    senderJid, // sender's JID
                    chatId, // group or DM JID
                    m, // raw Baileys message object
                    economy, // economy module
                    isOwner, // boolean
                    senderIsAdmin, // boolean
                    isMod:
                      overrideUsers.has(senderJid) || isGlobalMod(senderJid), // added mod flag
                  });
                  if (cardHandled) return; // stop further processing if handled by cards
```

#### Explanation
- Incoming messages are cleaned of formatting symbols (bold `*`, strikethrough `~`, italic `_`).
- Dispatched straight to `cardSystem.handleCommand()`. If it returns `true`, it is intercepted and halts further processing.

---

### Step 2: Extracting Command & Branching
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1778-L1852)
* **Line Numbers**: 1778-1852
* **Called From**: `handleCommand()`
* **Inputs**: Intercept variables
* **Outputs**: Directs logic to `cmdClaim`

```javascript
async function handleCommand({ lowerTxt, txt, senderJid, chatId, m, economy, isOwner, senderIsAdmin, isMod }) {
  const inst = getInst();
  if (!inst.sock_ref) return false;

  // Strict prefix check
  if (!lowerTxt.startsWith(p)) {
    return false;
  }

  const parts = txt.trim().split(/\s+/);
  const firstWord = parts[0].toLowerCase();
  const cmd = firstWord === p ? parts[1]?.toLowerCase() : firstWord.slice(p.length);
  const args = firstWord === p ? parts.slice(2) : parts.slice(1);

  if (!cmd) return false;

  switch (cmd) {
    case 'claim':
      await cmdClaim(args, senderJid, reply, chatId);
      return true;
```

#### Explanation
1. Verifies that the bot socket connection is healthy.
2. Checks if the cleaned text starts with the designated card prefix (default `.g`).
3. Splits arguments, parses the command key (`claim`), and runs `cmdClaim()`.

---

### Step 3: Validating Spawns & Expiration
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L361-L381)
* **Line Numbers**: 361-381
* **Called From**: `cmdClaim()`
* **Inputs**: `(args, senderJid, reply, chatId)`
* **Outputs**: Resolves spawn object or returns error

```javascript
async function cmdClaim(args, senderJid, reply, chatId) {
  const inst = getInst();
  const cardIdInput = args.join('').trim();
  if (!cardIdInput) return sendUsage(reply, ...);

  // Try exact match with composite key
  const exactKey = `${chatId}_${cardIdInput}`;
  let spawn = inst.activeSpawns.get(exactKey);
  
  if (!spawn) {
      // Find case-insensitive match for this chat
      const foundKey = Array.from(inst.activeSpawns.keys()).find(k => {
          return k.toLowerCase() === exactKey.toLowerCase() || (k.startsWith(chatId + '_') && k.split('_')[1].toLowerCase() === cardIdInput.toLowerCase());
      });
      if (foundKey) spawn = inst.activeSpawns.get(foundKey);
  }

  if (!spawn || Date.now() > spawn.expiresAt) {
    if (spawn) inst.activeSpawns.delete(`${chatId}_${spawn.card.id}`);
    return reply(`❌ No active card with ID \`${cardIdInput}\` in this group.`);
  }
```

#### Explanation
1. Rebuilds the user input key (e.g. `3-04521`).
2. Queries the `activeSpawns` Map cache using the composite key `${chatId}_${cardIdInput}`.
3. If not found, attempts case-insensitive searches or partial matches.
4. Checks expiration using `Date.now() > spawn.expiresAt` (expiry is 30 minutes from spawn time). If expired, removes the instance from the cache and returns an error.

---

### Step 4: Database Registration & Confirmation
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L382-L396)
* **Line Numbers**: 382-396
* **Called From**: `cmdClaim()`
* **Inputs**: Spawn metadata
* **Outputs**: Inserts `UserCard` collection item, sends confirmation

```javascript
  try {
    await UserCard.create({ userId: senderJid, cardId: spawn.card.id, copyNumber: spawn.copyNumber });
    spawn.stat.totalCirculation += 1;
    spawn.stat.uniqueOwners     += 1;
    await spawn.stat.save();
    inst.activeSpawns.delete(`${chatId}_${spawn.card.id}`);

    const rarity = getRarityLabel(spawn.copyNumber, spawn.stat.maxCopies);
    return reply(`${rarity.emoji}  *CLAIMED!*\n\n*${spawn.card.cardName}* — _${spawn.card.animeName}_\n📋 Copy *#${spawn.copyNumber}* (${rarity.label})\n\n_Added to your collection!_`);
  } catch (err) {
    console.error('[Claim Error]', err);
    return reply('❌ Claim failed.');
  }
}
```

#### Explanation
1. Executes a Mongoose write: `UserCard.create()` inserts a new ownership document referencing the player's WhatsApp JID and the specific card copy count number.
2. Updates global statistics (total circulation count and owner count) in MongoDB via `spawn.stat.save()`.
3. Evicts the card from `activeSpawns` Map so it cannot be claimed twice.
4. Computes card copy rarity boundaries (e.g. Rare, Epics, or Legendary) and replies with the confirmation text.

---

## 4. How to Modify
- **Modify Claim Window Expiry**: Change the `CLAIM_WINDOW_MS` configuration constant (currently 30 minutes) at [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L57).
- **Edit Rarity Threshold Labels**: Change calculation boundaries in `getRarityLabel()` inside `core/rpg/cardSystem.js`.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They have a name and a value, and can be changed or updated as the program runs.
**General Example**
```javascript
let name = 'John';
console.log(name); // outputs: John
```
**In Our Code**
```javascript
const cleanTxt = txt.replace(/[*~]/g, "").replace(/(?<!\w)_|_(?!\w)/g, "");
let lowerTxt = cleanTxt.toLowerCase().replace(/\s+/g, " ");
```
**How it works here**: The code creates two variables, `cleanTxt` and `lowerTxt`, to store the cleaned and lowercased text.
**Why it's used**: Variables are used to store the intermediate results of the text cleaning process, making it easier to work with the data.
**If you change/remove it**: If you remove the variables, the code will not be able to store the cleaned text, and the program will not work as expected. If you change the variable names, you will need to update all references to them in the code.

---
### Concept 2: String Methods
String methods are used to manipulate and transform strings. They can be used to replace characters, convert to uppercase or lowercase, and more.
**General Example**
```javascript
let str = 'Hello World';
console.log(str.toLowerCase()); // outputs: hello world
```
**In Our Code**
```javascript
const cleanTxt = txt.replace(/[*~]/g, "").replace(/(?<!\w)_|_(?!\w)/g, "");
let lowerTxt = cleanTxt.toLowerCase().replace(/\s+/g, " ");
```
**How it works here**: The code uses the `replace()` method to remove certain characters from the text, and the `toLowerCase()` method to convert the text to lowercase.
**Why it's used**: String methods are used to clean and normalize the text, making it easier to work with.
**If you change/remove it**: If you remove the string methods, the text will not be cleaned or normalized, and the program may not work as expected. If you change the methods, you will need to update the code to handle the new transformations.

---
### Concept 3: Regular Expressions
Regular expressions are patterns used to match and manipulate strings. They can be used to search, replace, and validate text.
**General Example**
```javascript
let str = 'Hello World';
let regex = /World/;
console.log(str.match(regex)); // outputs: [ 'World', index: 6, input: 'Hello World' ]
```
**In Our Code**
```javascript
const cleanTxt = txt.replace(/[*~]/g, "").replace(/(?<!\w)_|_(?!\w)/g, "");
```
**How it works here**: The code uses regular expressions to match and replace certain characters in the text.
**Why it's used**: Regular expressions are used to clean and normalize the text, making it easier to work with.
**If you change/remove it**: If you remove the regular expressions, the text will not be cleaned or normalized, and the program may not work as expected. If you change the regular expressions, you will need to update the code to handle the new patterns.

---
### Concept 4: Async/Await
Async/await is a syntax used to write asynchronous code that is easier to read and maintain. It allows you to write code that waits for a promise to resolve before continuing.
**General Example**
```javascript
async function example() {
  let data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
async function handleCommand({ lowerTxt, txt, senderJid, chatId, m, economy, isOwner, senderIsAdmin, isMod }) {
  // ...
}
```
**How it works here**: The code uses async/await to write asynchronous code that is easier to read and maintain.
**Why it's used**: Async/await is used to handle the asynchronous nature of the code, making it easier to write and maintain.
**If you change/remove it**: If you remove the async/await syntax, the code will not be able to handle asynchronous operations, and the program may not work as expected. If you change the syntax, you will need to update the code to handle the new asynchronous operations.

---
### Concept 5: Object Destructuring
Object destructuring is a syntax used to extract properties from an object and assign them to variables.
**General Example**
```javascript
let person = { name: 'John', age: 30 };
let { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 30
```
**In Our Code**
```javascript
async function handleCommand({ lowerTxt, txt, senderJid, chatId, m, economy, isOwner, senderIsAdmin, isMod }) {
  // ...
}
```
**How it works here**: The code uses object destructuring to extract properties from the object passed to the `handleCommand` function.
**Why it's used**: Object destructuring is used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the object destructuring, the code will need to access the properties using the object notation (e.g. `obj.lowerTxt`), making the code more verbose. If you change the destructuring, you will need to update the code to handle the new properties.

---
### Concept 6: Switch Statement
A switch statement is a control structure used to execute different blocks of code based on the value of a variable.
**General Example**
```javascript
let color = 'red';
switch (color) {
  case 'red':
    console.log('The color is red');
    break;
  case 'green':
    console.log('The color is green');
    break;
  default:
    console.log('The color is not recognized');
}
```
**In Our Code**
```javascript
switch (cmd) {
  case 'claim':
    await cmdClaim(args, senderJid, reply, chatId);
    return true;
  // ...
}
```
**How it works here**: The code uses a switch statement to execute different blocks of code based on the value of the `cmd` variable.
**Why it's used**: The switch statement is used to handle different commands and execute the corresponding code.
**If you change/remove it**: If you remove the switch statement, the code will need to use a different control structure (e.g. if/else statements) to handle the different commands. If you change the switch statement, you will need to update the code to handle the new commands.

---
### Concept 7: Try/Catch Block
A try/catch block is a control structure used to handle errors and exceptions in the code.
**General Example**
```javascript
try {
  let data = fetchData();
  console.log(data);
} catch (error) {
  console.error(error);
}
```
**In Our Code**
```javascript
try {
  await UserCard.create({ userId: senderJid, cardId: spawn.card.id, copyNumber: spawn.copyNumber });
  // ...
} catch (err) {
  console.error('[Claim Error]', err);
  return reply('❌ Claim failed.');
}
```
**How it works here**: The code uses a try/catch block to handle any errors that may occur when creating a new user card.
**Why it's used**: The try/catch block is used to handle errors and exceptions, making the code more robust and reliable.
**If you change/remove it**: If you remove the try/catch block, the code will not be able to handle errors and exceptions, and the program may crash or produce unexpected behavior. If you change the try/catch block, you will need to update the code to handle the new errors and exceptions.

---
### Concept 8: Database Operations
Database operations are used to interact with a database, such as creating, reading, updating, and deleting data.
**General Example**
```javascript
let db = require('db');
db.create({ name: 'John', age: 30 });
```
**In Our Code**
```javascript
await UserCard.create({ userId: senderJid, cardId: spawn.card.id, copyNumber: spawn.copyNumber });
```
**How it works here**: The code uses a database operation to create a new user card.
**Why it's used**: Database operations are used to store and retrieve data, making the program more persistent and reliable.
**If you change/remove it**: If you remove the database operation, the code will not be able to store or retrieve data, and the program may not work as expected. If you change the database operation, you will need to update the code to handle the new data storage and retrieval.
