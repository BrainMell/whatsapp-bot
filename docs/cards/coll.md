# Card Collection Command Flow (`coll`)

## 1. Description
The `coll` command allows players to view their owned card collection. If executed without parameters, it renders a list of all owned cards along with a dynamic grid or slideshow GIF containing the top 15 highest-ranked cards in their inventory. If executed with a numeric index or JID (e.g. `.g coll 3`), it fetches the detailed stats, circulation counts, tier labels, and high-quality image of that specific card.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🗂️ COLLECTION OVERVIEW: User sends ".g coll"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdColl(senderJid, reply, chatId, args) (L497)
                    ├── UserCard.find({ userId, inMainDeck: false, forSale: false }) (L535)
                    ├── Sort collection by database creation date
                    ├── getTopCards(owned) -> returns top 15 cards by Tier (L552)
                    ├── getTopImageUrls(topCards) -> retrieves image assets URLs (L553)
                    ├── generate slideshow: goService.generateCardGif(imageUrls) (L562)
                    ├── Format textual lines listing owned card names
                    └── sendCardMedia(sock, chatId, gifBuffer, text) (L568)

======================================================
🔍 CARD DETAILS: User sends ".g coll 2"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdColl(senderJid, reply, chatId, args) (L497)
                    ├── Find card matching index: owned[idx - 1] (L511-512)
                    ├── Query stats: CardStat.findOne({ cardId: uc.cardId }) (L518)
                    ├── buildCardDetailCaption(card, uc, stat, ...) (L520)
                    ├── If Tier 6 or S: convertCardImage to playback GIF (L522-525)
                    ├── Else: axios.get(card.imageUrl) binary buffer (L528-529)
                    └── sock.sendMessage(chatId, { image/video: buffer, caption })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger & Intercept
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4400-L4412)
* **Line Numbers**: 4400-4412
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ lowerTxt, txt, senderJid, chatId, m, ... }`
* **Outputs**: Returns early if card command matches

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
- Incoming messages are intercepted by `cardSystem.handleCommand` before passing to other subsystems.

---

### Step 2: Command Matching and Detail Dispatch
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L497-L533)
* **Line Numbers**: 497-533
* **Called From**: `cmdColl()`
* **Inputs**: `(senderJid, reply, chatId, args = [])`
* **Outputs**: Formats and sends detailed view of a single card

```javascript
async function cmdColl(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const p = P();

  if (args.length > 0) {
    const input = args[0];
    if (input === '--tier') return cmdCardsTier(senderJid, reply, chatId);
    
    let uc = null;
    let collIndex = null;
    if (input.includes('-')) uc = await UserCard.findOne({ userId: senderJid, cardId: input });
    else {
      const idx = parseInt(input);
      if (!isNaN(idx)) {
        const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
        uc = owned[idx - 1];
        collIndex = idx;
      }
    }
    if (uc) {
      const card = CARD_INDEX()[uc.cardId];
      const stat = await CardStat.findOne({ cardId: uc.cardId });
      const ownerName = await getUserName(uc.userId);
      const caption = buildCardDetailCaption(card, uc, stat, 'Collection', collIndex, ownerName);
      try {
        if (String(card.tier) === '6' || String(card.tier) === 'S') {
          const gifBuffer = await goService.convertCardImage(card.imageUrl);
          if (gifBuffer) {
            return await inst.sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption, mentions: [uc.userId] });
          }
        }
        const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
        return await inst.sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption, mentions: [uc.userId] });
      } catch (e) { return reply(caption); }
    }
    return sendUsage(...);
  }
```

#### Explanation
1. If index details are requested (e.g. `.g coll 3`), it fetches the matching card document from the Mongoose `UserCard` collection.
2. Gathers the card config properties from the in-memory `CARD_INDEX()` Map.
3. Retrieves overall circulation details from Mongoose model `CardStat`.
4. Renders details using `buildCardDetailCaption()`.
5. Retrieves the card art. If Tier 6/S, uses the Go slideshow service to convert the static art to a dynamic GIF video. Otherwise, pulls down raw bytes via Axios and posts it as a standard WhatsApp image attachment.

---

### Step 3: Collating Collection Overview
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L535-L574)
* **Line Numbers**: 535-574
* **Called From**: `cmdColl()`
* **Inputs**: User JID
* **Outputs**: Dispatches a card listing summary with top highlights GIF

```javascript
  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  if (!owned.length) return reply('📭 Collection empty.');

  let msg = `🃏 *Collection*\n━━━━━━━━━━━━━━━\n📦 *Total:* ${owned.length}\n\n`;

  const lines = [];
  for (let i = 0; i < owned.length; i++) {
    const card = CARD_INDEX()[owned[i].cardId];
    if (card) {
      lines.push(`*#${i + 1} ➳ ${card.cardName}*`);
    }
  }

  // GIF generation for collection (Top 15 Highlights)
  const topCards = getTopCards(owned);
  const imageUrls = getTopImageUrls(topCards);
  if (imageUrls.length > 0) {
    const currentHash = getDeckHash(topCards);
    const cached = gifCache.collections.get(senderJid);
    
    let gifBuffer;
    if (cached && cached.hash === currentHash) {
        gifBuffer = cached.buffer;
    } else {
        gifBuffer = await goService.generateCardGif(imageUrls, "COLLECTION HIGHLIGHTS (TOP 15)");
        if (gifBuffer) gifCache.collections.set(senderJid, { hash: currentHash, buffer: gifBuffer });
    }

    if (gifBuffer) {
      const fullText = msg + lines.join('\n') + `\n\n*[Use ${p} coll <card_index> to see more detail]*`;
      return await sendCardMedia(inst.sock_ref, chatId, gifBuffer, fullText);
    }
  }

  return reply(msg + lines.join('\n') + `\n\n*[Use ${p} coll <card_index> to see more detail]*`);
```

#### Explanation
1. Fetches all cards matching the player JID that are not placed in decks or listed for sale on the market.
2. If empty, replies with an empty inbox confirmation.
3. Groups and indexes the card titles by date added.
4. Gathers the top 15 highest-ranked cards based on sorting weights (S tier down to tier 1).
5. Generates a unique deck hash based on card IDs. Checks the in-memory cache Map `gifCache.collections` to reuse pre-rendered assets.
6. If cache is missed, requests the Go Image Service (`goService.generateCardGif`) to render a slideshow GIF.
7. Dispatches the slideshow image with the formatted collection list caption.

---

## 4. How to Modify
- **Change Highlights Count limit**: Modify the `.slice(0, 15)` parameter in `getTopCards()` inside [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L407).
- **Alter Sorting Parameters**: Edit the sorting weight object `tierOrder` inside [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L399).










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
**How it works here**: The `cardHandled` variable is used to store the result of the `cardSystem.handleCommand` function. The `lowerTxt`, `txt`, `senderJid`, `chatId`, `m`, `economy`, `isOwner`, `senderIsAdmin`, and `isMod` variables are used to pass values to the `handleCommand` function.
**Why it's used**: Variables are used to store and pass values to functions, making the code more readable and maintainable.
**If you change/remove it**: If you remove the `cardHandled` variable, the code will not be able to store the result of the `handleCommand` function, and the program will not work as expected.

---
### Concept 2: Async/Await
Async/await is a way to write asynchronous code that is easier to read and maintain. It allows you to write code that waits for a promise to resolve before continuing.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
async function cmdColl(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const p = P();
  // ...
}
```
**How it works here**: The `cmdColl` function is defined as an async function, which allows it to use the `await` keyword to wait for promises to resolve. The `getInst` and `P` functions are likely async functions that return promises, and the `await` keyword is used to wait for their results.
**Why it's used**: Async/await is used to make the code easier to read and maintain, and to avoid using callbacks.
**If you change/remove it**: If you remove the `async` keyword, the code will not be able to use the `await` keyword, and the program will not work as expected.

---
### Concept 3: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They allow you to execute different blocks of code depending on whether a condition is true or false.
**General Example**
```javascript
if (x > 5) {
  console.log('x is greater than 5');
} else {
  console.log('x is less than or equal to 5');
}
```
**In Our Code**
```javascript
if (args.length > 0) {
  const input = args[0];
  if (input === '--tier') return cmdCardsTier(senderJid, reply, chatId);
  // ...
}
```
**How it works here**: The `if` statement is used to check if the `args` array has more than one element. If it does, the code inside the `if` block is executed. The `if` statement is also used to check if the `input` variable is equal to `'--tier'`, and if so, the `cmdCardsTier` function is called.
**Why it's used**: Conditional statements are used to make decisions in a program and to execute different blocks of code depending on certain conditions.
**If you change/remove it**: If you remove the `if` statement, the code will not be able to make decisions based on the `args` array, and the program will not work as expected.

---
### Concept 4: Array Methods
Array methods are used to perform operations on arrays, such as sorting, filtering, and mapping.
**General Example**
```javascript
const arr = [1, 2, 3, 4, 5];
const sortedArr = arr.sort((a, b) => a - b);
console.log(sortedArr); // Outputs: [1, 2, 3, 4, 5]
```
**In Our Code**
```javascript
const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
```
**How it works here**: The `sort` method is used to sort the `owned` array in ascending order based on the `createdAt` field.
**Why it's used**: Array methods are used to perform operations on arrays and to manipulate data.
**If you change/remove it**: If you remove the `sort` method, the `owned` array will not be sorted, and the program may not work as expected.

---
### Concept 5: Database Operations
Database operations are used to interact with a database, such as finding, creating, and updating data.
**General Example**
```javascript
const user = await User.findOne({ username: 'john' });
console.log(user); // Outputs: the user object
```
**In Our Code**
```javascript
const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
const uc = await UserCard.findOne({ userId: senderJid, cardId: input });
```
**How it works here**: The `find` and `findOne` methods are used to find data in the database. The `find` method returns an array of objects, while the `findOne` method returns a single object.
**Why it's used**: Database operations are used to interact with a database and to retrieve and manipulate data.
**If you change/remove it**: If you remove the database operations, the program will not be able to retrieve or manipulate data, and will not work as expected.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, such as database queries or network requests. They allow you to write code that waits for an operation to complete before continuing.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('result');
});
promise.then((result) => {
  console.log(result); // Outputs: result
});
```
**In Our Code**
```javascript
const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
```
**How it works here**: The `find` method returns a promise that resolves to an array of objects. The `await` keyword is used to wait for the promise to resolve before continuing.
**Why it's used**: Promises are used to handle asynchronous operations and to write code that waits for an operation to complete before continuing.
**If you change/remove it**: If you remove the promise, the code will not be able to wait for the asynchronous operation to complete, and will not work as expected.

---
### Concept 7: Functions
Functions are used to group code together and to reuse it. They can take arguments and return values.
**General Example**
```javascript
function add(x, y) {
  return x + y;
}
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
async function cmdColl(senderJid, reply, chatId, args = []) {
  // ...
}
```
**How it works here**: The `cmdColl` function is defined to take four arguments: `senderJid`, `reply`, `chatId`, and `args`. The function is used to handle the `coll` command.
**Why it's used**: Functions are used to group code together and to reuse it.
**If you change/remove it**: If you remove the function, the code will not be able to handle the `coll` command, and will not work as expected.

---
### Concept 8: Error Handling
Error handling is used to catch and handle errors that occur in a program. It allows you to write code that can recover from errors and continue running.
**General Example**
```javascript
try {
  // code that may throw an error
} catch (error) {
  console.log(error); // Outputs: the error
}
```
**In Our Code**
```javascript
try {
  if (String(card.tier) === '6' || String(card.tier) === 'S') {
    const gifBuffer = await goService.convertCardImage(card.imageUrl);
    if (gifBuffer) {
      return await inst.sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption, mentions: [uc.userId] });
    }
  }
  const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
  return await inst.sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption, mentions: [uc.userId] });
} catch (e) { return reply(caption); }
```
**How it works here**: The `try` block is used to catch any errors that occur in the code. If an error occurs, the `catch` block is executed, and the error is logged.
**Why it's used**: Error handling is used to catch and handle errors that occur in a program, and to write code that can recover from errors and continue running.
**If you change/remove it**: If you remove the error handling, the program will not be able to catch and handle errors, and will crash if an error occurs.

---
### Concept 9: Object Destructuring
Object destructuring is used to extract values from an object and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 30 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
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
**How it works here**: The object destructuring is used to extract values from an object and assign them to variables.
**Why it's used**: Object destructuring is used to simplify code and to make it easier to read.
**If you change/remove it**: If you remove the object destructuring, the code will not be able to extract values from the object, and will not work as expected.

---
### Concept 10: String Interpolation
String interpolation is used to insert values into a string.
**General Example**
```javascript
const name = 'John';
const age = 30;
console.log(`My name is ${name} and I am ${age} years old.`);
// Outputs: My name is John and I am 30 years old.
```
**In Our Code**
```javascript
const caption = buildCardDetailCaption(card, uc, stat, 'Collection', collIndex, ownerName);
```
**How it works here**: The string interpolation is used to insert values into a string.
**Why it's used**: String interpolation is used to simplify code and to make it easier to read.
**If you change/remove it**: If you remove the string interpolation, the code will not be able to insert values into a string, and will not work as expected.
