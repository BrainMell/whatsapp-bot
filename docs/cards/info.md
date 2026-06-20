# Card Lookup Command Flow (`info` / `cs` / `cg` / `cltr` / `scc` / `maker`)

## 1. Description
The Card Lookup commands provide ways to search and inspect card details from either the global database or player collections.
- **`info`**: Performs case-insensitive matches against names/IDs in the global card configuration database, displaying detailed statistics and card art.
- **`cs` (Card Search)**: Searches for card profiles matching specific anime series or tags.
- **`cg` (Card Gift)**: Transfers ownership of a card from one user's collection or main deck to another player by tag/JID.
- **`cltr` (Collector List)**: Displays top card collectors or series completion metrics.
- **`scc`**: Searches a user's collection specifically by anime series name.
- **`maker`**: Searches a user's collection for cards matching a specific maker/artist tag.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🔍 GLOBAL DB LOOKUP: User sends ".g info goku"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdInfo(reply, chatId, args) (L918)
                    ├── Check exact ID: CARD_INDEX()[query] (L924)
                    ├── If found, fetch CardStat & buildCardDetailCaption (L926-927)
                    ├── If not found, run partial name filter: ALL_CARDS().filter(...) (L941)
                    ├── If single match: send card media & caption (L945-959)
                    ├── If multiple matches: render index list of top 15 matches (L961-970)
                    └── sock.sendMessage(chatId, { image/video/text: payload })

======================================================
🎁 GIFT CARD: User sends ".g cg @friend 2"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdCG(senderJid, reply, args, m) (L1234)
                    ├── Extract recipient target JID from mentions array (L1240)
                    ├── Fetch user card in collection at index: owned[idx - 1] (L1250)
                    ├── If locked or in custom deck, abort transaction
                    ├── Transfer ownership: UserCard.findByIdAndUpdate(uc._id, { userId: targetJid })
                    └── Return transfer confirmation message
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
- Incoming messages are intercepted by the card system before processing.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1778-L1972)
* **Line Numbers**: 1778-1972
* **Called From**: `handleCommand()`
* **Inputs**: Intercept variables
* **Outputs**: Directs execution to `cmdInfo`, `cmdCS`, `cmdCG`, `cmdCltr`, `cmdScc`, or `cmdMaker`.

```javascript
  switch (cmd) {
    case 'info':
      await cmdInfo(reply, chatId, args);
      return true;

    case 'cg':
      await cmdCG(senderJid, reply, args, m);
      return true;

    case 'cs':
      await cmdCS(reply, args);
      return true;

    case 'cltr':
      await cmdCltr(reply, chatId, args);
      return true;

    case 'scc':
      await cmdScc(senderJid, reply, chatId, args);
      return true;

    case 'maker':
      await cmdMaker(senderJid, reply, chatId, args);
      return true;
```

#### Explanation
- Matches the routing key to run lookups.

---

### Step 3: Card Database Queries (info)
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L918-L971)
* **Line Numbers**: 918-971
* **Called From**: `cmdInfo()`
* **Inputs**: `(reply, chatId, args = [])`
* **Outputs**: Renders matching card profile data

```javascript
async function cmdInfo(reply, chatId, args = []) {
  const p = P();
  const query = args.join(' ').toLowerCase().trim();
  if (!query) return sendUsage(reply, `${p} info`, `${p} info <card_name or id>`, `${p} info goku`);

  // Exact ID check first
  const exact = CARD_INDEX()[query];
  if (exact) {
    const stat = await CardStat.findOne({ cardId: exact.id });
    const caption = buildCardDetailCaption(exact, null, stat, 'Global Database');
    try {
      if (String(exact.tier) === '6' || String(exact.tier) === 'S') {
        const gifBuffer = await goService.convertCardImage(exact.imageUrl);
        if (gifBuffer) {
          return await getInst().sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption });
        }
      }
      const res = await axios.get(exact.imageUrl, { responseType: 'arraybuffer' });
      return await getInst().sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption });
    } catch (e) { return reply(caption); }
  }

  // Partial name search
  const matches = ALL_CARDS().filter(c => c.cardName.toLowerCase().includes(query));
  
  if (matches.length === 0) return reply(`❌ Card not found: *"${query}"*`);
  
  if (matches.length === 1) {
    // ... (displays single card matching details)
    return;
  }

  // Multiple matches list
  let msg = `🔍 *Search Results for "${query}"*\n📦 Found ${matches.length} matches. Showing top 15:\n\n`;
  matches.slice(0, 15).forEach(c => {
    msg += `▫️ *${c.cardName}* (${c.tier})\n   ➥ ID: \`${c.id}\` | Series: _${c.animeName}_\n`;
  });
  msg += `\n💡 Use \`${p} info <id>\` to see full details.`;
  return reply(msg);
}
```

#### Explanation
1. Checks if the query represents an exact ID match in the `CARD_INDEX()` Map.
2. If exact match is found:
   - Fetches global statistics from the `CardStat` database model.
   - Builds card details text.
   - Downloads card art, converting Tier 6/S cards to GIF slideshows using `goService.convertCardImage`, and returns the media.
3. If no exact ID matches, filters all cards using partial name match: `ALL_CARDS().filter()`.
4. If exactly 1 partial match is found, behaves as an exact match.
5. If multiple matches are found, lists the top 15 card names and IDs.

---

## 4. How to Modify
- **Modify Search Result limits**: Change the `.slice(0, 15)` multiplier inside `cmdInfo()` at [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L965).
- **Edit Gifting Rules**: Locate `cmdCG()` in `core/rpg/cardSystem.js` and add rules (like taxing transactions or capping daily transfers).










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
const p = P();
const query = args.join(' ').toLowerCase().trim();
```
**How it works here**: In the code, `p` and `query` are variables used to store the result of the `P()` function and the joined arguments, respectively.
**Why it's used**: Variables are used to store values that can be used later in the program, making the code more readable and efficient.
**If you change/remove it**: If you remove the `p` variable, the code will throw an error when trying to use `p` later. If you change the `query` variable, the search results may not work as expected.

---
### Concept 2: Functions
Functions are blocks of code that can be called multiple times from different parts of a program. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
async function cmdInfo(reply, chatId, args = []) {
  // ...
}
```
**How it works here**: The `cmdInfo` function is defined to handle the `info` command. It takes `reply`, `chatId`, and `args` as arguments.
**Why it's used**: Functions are used to organize code, reduce repetition, and make it easier to maintain.
**If you change/remove it**: If you remove the `cmdInfo` function, the `info` command will not work. If you change the function signature, the code that calls it may break.

---
### Concept 3: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions.
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
if (!query) return sendUsage(reply, `${p} info`, `${p} info <card_name or id>`, `${p} info goku`);
```
**How it works here**: The code checks if the `query` variable is empty. If it is, the function returns and sends a usage message.
**Why it's used**: Conditional statements are used to make decisions and execute different code paths based on conditions.
**If you change/remove it**: If you remove the conditional statement, the function will not check for an empty `query` and may not work as expected.

---
### Concept 4: Array Methods
Array methods are used to perform operations on arrays, such as filtering, mapping, and reducing.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(num => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
const matches = ALL_CARDS().filter(c => c.cardName.toLowerCase().includes(query));
```
**How it works here**: The code uses the `filter` method to create a new array `matches` that contains only the cards that match the `query`.
**Why it's used**: Array methods are used to perform operations on arrays and create new arrays based on conditions.
**If you change/remove it**: If you remove the `filter` method, the `matches` array will not be created, and the code will not work as expected.

---
### Concept 5: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code.
**General Example**
```javascript
async function fetchData() {
  const response = await fetch('https://api.example.com/data');
  const data = await response.json();
  console.log(data);
}
```
**In Our Code**
```javascript
const stat = await CardStat.findOne({ cardId: exact.id });
```
**How it works here**: The code uses `await` to wait for the `CardStat.findOne` promise to resolve and returns the result.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain.
**If you change/remove it**: If you remove the `await` keyword, the code will not wait for the promise to resolve, and the `stat` variable will be a promise instead of the resolved value.

---
### Concept 6: Switch Statements
Switch statements are used to execute different blocks of code based on the value of a variable.
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
    console.log('The color is unknown');
}
```
**In Our Code**
```javascript
switch (cmd) {
  case 'info':
    await cmdInfo(reply, chatId, args);
    return true;
  // ...
}
```
**How it works here**: The code uses a switch statement to execute different functions based on the value of the `cmd` variable.
**Why it's used**: Switch statements are used to execute different code paths based on the value of a variable.
**If you change/remove it**: If you remove the switch statement, the code will not execute the different functions based on the `cmd` variable, and the program will not work as expected.

---
### Concept 7: Object Destructuring
Object destructuring is a syntax that allows you to extract properties from an object and assign them to variables.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
const { lowerTxt, txt, senderJid, chatId, m, economy, isOwner, senderIsAdmin, isMod } = {
  lowerTxt,
  txt,
  senderJid,
  chatId,
  m,
  economy,
  isOwner,
  senderIsAdmin,
  isMod: overrideUsers.has(senderJid) || isGlobalMod(senderJid),
};
```
**How it works here**: The code uses object destructuring to extract properties from an object and assign them to variables.
**Why it's used**: Object destructuring is used to simplify code and make it easier to read.
**If you change/remove it**: If you remove the object destructuring, the code will not assign the properties to variables, and the program will not work as expected.

---
### Concept 8: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when an operation is complete.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Operation complete');
});
promise.then((result) => {
  console.log(result); // Outputs: Operation complete
});
```
**In Our Code**
```javascript
const stat = await CardStat.findOne({ cardId: exact.id });
```
**How it works here**: The code uses a promise to execute a database query and retrieve a card stat.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when an operation is complete.
**If you change/remove it**: If you remove the promise, the code will not wait for the database query to complete, and the program will not work as expected.

---
### Concept 9: Database Operations
Database operations are used to interact with a database and perform CRUD (create, read, update, delete) operations.
**General Example**
```javascript
let db = require('db');
db.findOne({ name: 'John' }, (err, result) => {
  console.log(result); // Outputs: { name: 'John', age: 25 }
});
```
**In Our Code**
```javascript
const stat = await CardStat.findOne({ cardId: exact.id });
```
**How it works here**: The code uses a database operation to retrieve a card stat from the database.
**Why it's used**: Database operations are used to interact with a database and perform CRUD operations.
**If you change/remove it**: If you remove the database operation, the code will not retrieve the card stat, and the program will not work as expected.

---
### Concept 10: Error Handling
Error handling is used to catch and handle errors that occur during the execution of a program.
**General Example**
```javascript
try {
  // Code that may throw an error
} catch (err) {
  console.log(err); // Outputs: Error message
}
```
**In Our Code**
```javascript
try {
  // Code that may throw an error
} catch (e) {
  return reply(caption);
}
```
**How it works here**: The code uses a try-catch block to catch any errors that occur during the execution of the code.
**Why it's used**: Error handling is used to catch and handle errors that occur during the execution of a program.
**If you change/remove it**: If you remove the error handling, the program will not catch and handle errors, and the program may crash or produce unexpected results.
