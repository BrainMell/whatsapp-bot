# Card Decks Command Flow (`deck` / `t2deck` / `t2cdeck` / `t2coll` / `swap card` / `create deck` / `list decks` / `rename deck` / `delete deck` / `cdeck`)

## 1. Description
The Deck commands allow players to manage their card decks. There is one **Main Deck** (limited to 12 cards) and players can create multiple **Custom Decks**. Decks are used in card battles, showcases, and can also be packaged and listed on the E-Shop marketplace.

It handles:
- **`deck`**: Displays the active Main Deck list and shows a grid/slideshow GIF of its top 15 cards.
- **`t2deck`**: Moves a card from a player's collection bag to their Main Deck.
- **`t2cdeck`**: Moves a card from collection to a named custom deck.
- **`t2coll`**: Removes a card from the Main Deck and places it back in the collection.
- **`swap card`**: Swaps the slot positions of two cards in the Main Deck.
- **`create deck`**: Establishes a new named custom deck database profile.
- **`list decks`**: Summarizes all of a player's custom decks.
- **`rename deck`**: Renames a custom deck.
- **`delete deck`**: Disbands a custom deck, returning all associated cards to the player's collection.
- **`cdeck`**: Shows details of a specific custom deck or removes a card from it.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🎴 VIEW MAIN DECK: User sends ".g deck"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdDeck(senderJid, reply, chatId, args) (L576)
                    ├── UserCard.find({ userId, inMainDeck: true }).sort(...) (L604)
                    ├── getTopCards(deck) -> sorts top cards
                    ├── goService.generateCardGif(imageUrls) -> slideshow GIF (L633)
                    └── sendCardMedia(sock, chatId, gifBuffer, text) (L638)

======================================================
⏫ MOVE TO MAIN DECK: User sends ".g t2deck 3"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdT2Deck(senderJid, reply, args) (L973)
                    ├── UserCard.find({ userId, inMainDeck: false, ... }) -> fetch card 3
                    ├── UserCard.find({ userId, inMainDeck: true }) -> check deck space (< 12)
                    ├── Find next empty slot in main deck (1-12)
                    ├── Update document: uc.inMainDeck = true, uc.mainDeckSlot = slot
                    ├── uc.save() (L992)
                    └── Return confirmation message

======================================================
🔄 SWAP DECK SLOTS: User sends ".g swap card 1 and 3"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdSwapCard(senderJid, reply, args) (L1206)
                    ├── Retrieve cards at slot a and slot b
                    ├── Update slots: cardA.mainDeckSlot = b, cardB.mainDeckSlot = a
                    ├── Save documents: cardA.save() and cardB.save() (L1228-1229)
                    └── Return confirmation message
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
- Incoming messages are intercepted by `cardSystem.handleCommand` before passing to other subsystems.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1778-L1952)
* **Line Numbers**: 1778-1952
* **Called From**: `handleCommand()`
* **Inputs**: Intercept variables
* **Outputs**: Directs execution to `cmdDeck`, `cmdT2Deck`, `cmdT2CDeck`, `cmdT2Coll`, `cmdSwapCard`, `cmdCDeck`, etc.

```javascript
  switch (cmd) {
    case 'deck':
      await cmdDeck(senderJid, reply, chatId, args);
      return true;

    case 't2deck':
      await cmdT2Deck(senderJid, reply, args);
      return true;

    case 't2cdeck':
      await cmdT2CDeck(senderJid, reply, args);
      return true;

    case 't2coll':
      await cmdT2Coll(senderJid, reply, args);
      return true;

    case 'swap':
      await cmdSwapCard(senderJid, reply, args);
      return true;
```

#### Explanation
- Compares the `cmd` string with the respective switch cases.
- Forwards arguments to specific sub-methods.

---

### Step 3: Moving Card to Main Deck (t2deck)
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L973-L996)
* **Line Numbers**: 973-996
* **Called From**: `cmdT2Deck()`
* **Inputs**: `(senderJid, reply, args = [])`
* **Outputs**: Saves deck properties in database, returns status response

```javascript
async function cmdT2Deck(senderJid, reply, args = []) {
  const p = P();
  const index = parseInt(args[0]);
  if (isNaN(index)) return sendUsage(reply, `${p} t2deck`, `${p} t2deck <coll_index>`, `${p} t2deck 1`);

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  const uc = owned[index - 1];
  if (!uc) return reply('❌ Card not found in your collection.');

  // Find next available slot
  const deck = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });
  if (deck.length >= MAIN_DECK_SIZE) return reply(`❌ Your main deck is full (${MAIN_DECK_SIZE}/12)! Move a card to collection first.`);

  const usedSlots = deck.map(d => d.mainDeckSlot);
  let slot = 1;
  while (usedSlots.includes(slot)) slot++;

  uc.inMainDeck = true;
  uc.mainDeckSlot = slot;
  await uc.save();

  const card = CARD_INDEX()[uc.cardId];
  return reply(`✅ *${card.cardName}* moved to main deck (Slot #${slot}).`);
}
```

#### Explanation
1. Checks that the argument is a valid integer.
2. Queries the user's collection: `UserCard.find()` for cards not in any deck or for sale. If no card matches the index, returns an error.
3. Checks active deck cards size. The Main Deck is capped at `MAIN_DECK_SIZE` (12). If full, returns an error.
4. Searches for the lowest unused slot index from 1 to 12.
5. Updates properties in the Mongoose document: sets `inMainDeck` to true, sets `mainDeckSlot` to the found slot number, and saves via `uc.save()`.
6. Sends a confirmation reply.

---

### Step 4: Swapping Deck Slots
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1206-L1232)
* **Line Numbers**: 1206-1232
* **Called From**: `cmdSwapCard()`
* **Inputs**: `(senderJid, reply, args = [])`
* **Outputs**: Swaps positions in database, returns message

```javascript
async function cmdSwapCard(senderJid, reply, args = []) {
  const p = P();
  let a, b;
  if (args[0] === 'card') {
    a = parseInt(args[1]);
    b = parseInt(args[3]);
  } else {
    a = parseInt(args[0]);
    b = parseInt(args[1]);
  }

  if (isNaN(a) || isNaN(b)) return sendUsage(reply, ...);

  const cardA = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: a });
  const cardB = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: b });

  if (!cardA && !cardB) return reply('❌ Both slots are empty.');

  if (cardA) cardA.mainDeckSlot = b;
  if (cardB) cardB.mainDeckSlot = a;

  if (cardA) await cardA.save();
  if (cardB) await cardB.save();

  return reply(`✅ Swapped Slot #${a} and Slot #${b}.`);
}
```

#### Explanation
1. Parses both slot indices from input arguments.
2. Locates the card documents assigned to those slot numbers in the main deck.
3. If both slots are empty, returns an error.
4. Swaps the `mainDeckSlot` values in both documents and saves changes back to MongoDB.
5. Sends a swap confirmation message.

---

## 4. How to Modify
- **Modify Deck Size Cap**: Change the `MAIN_DECK_SIZE` configuration constant (currently 12) at [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L58).
- **Edit Custom Deck Limit Restrictions**: Locate `cmdCreateDeck()` in `core/rpg/cardSystem.js` to adjust custom deck limits.
- **Modify Main Deck Rendering Format**: Customize the display labels inside `cmdDeck()` in `core/rpg/cardSystem.js`.










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
**How it works here**: The `cardHandled` variable is used to store the result of the `cardSystem.handleCommand` function.
**Why it's used**: Variables are used to store values that can be used later in the program.
**If you change/remove it**: If you remove the `cardHandled` variable, the program will not be able to store the result of the `cardSystem.handleCommand` function, and the program will not be able to check if the card was handled.

---
### Concept 2: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are used to make decisions in a program.
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
**How it works here**: The `if` statement checks if the `cardHandled` variable is true. If it is, the function returns immediately.
**Why it's used**: Conditional statements are used to make decisions in a program and execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove the `if` statement, the function will not return immediately if the card is handled, and the program will continue to execute the next lines of code.

---
### Concept 3: Switch Statements
Switch statements are used to execute different blocks of code based on the value of a variable. They are used to make decisions in a program.
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
    console.log('The color is not red or blue');
}
```
**In Our Code**
```javascript
switch (cmd) {
  case 'deck':
    await cmdDeck(senderJid, reply, chatId, args);
    return true;
  // ...
}
```
**How it works here**: The `switch` statement checks the value of the `cmd` variable and executes the corresponding block of code.
**Why it's used**: Switch statements are used to make decisions in a program and execute different blocks of code based on the value of a variable.
**If you change/remove it**: If you remove the `switch` statement, the program will not be able to execute the corresponding block of code based on the value of the `cmd` variable.

---
### Concept 4: Functions
Functions are blocks of code that can be executed multiple times from different parts of a program. They are used to organize code and make it reusable.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
async function cmdT2Deck(senderJid, reply, args = []) {
  // ...
}
```
**How it works here**: The `cmdT2Deck` function is defined to execute a block of code that handles the `t2deck` command.
**Why it's used**: Functions are used to organize code and make it reusable.
**If you change/remove it**: If you remove the `cmdT2Deck` function, the program will not be able to handle the `t2deck` command.

---
### Concept 5: Async/Await
Async/await is a syntax used to write asynchronous code that is easier to read and maintain. It is used to handle promises and make asynchronous code look synchronous.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
const cardHandled = await cardSystem.handleCommand({
  // ...
});
```
**How it works here**: The `await` keyword is used to wait for the `cardSystem.handleCommand` function to return a promise.
**Why it's used**: Async/await is used to make asynchronous code look synchronous and easier to read and maintain.
**If you change/remove it**: If you remove the `await` keyword, the program will not wait for the `cardSystem.handleCommand` function to return a promise, and the program will continue to execute the next lines of code.

---
### Concept 6: Parsing Numbers
Parsing numbers is the process of converting a string to a number. It is used to convert user input to a number.
**General Example**
```javascript
const str = '123';
const num = parseInt(str);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const index = parseInt(args[0]);
```
**How it works here**: The `parseInt` function is used to convert the `args[0]` string to a number.
**Why it's used**: Parsing numbers is used to convert user input to a number.
**If you change/remove it**: If you remove the `parseInt` function, the program will not be able to convert the `args[0]` string to a number, and the program will throw an error.

---
### Concept 7: Database Operations
Database operations are used to interact with a database. They are used to store and retrieve data.
**General Example**
```javascript
const user = await User.findOne({ name: 'John' });
console.log(user);
```
**In Our Code**
```javascript
const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
```
**How it works here**: The `UserCard.find` function is used to retrieve a list of user cards from the database.
**Why it's used**: Database operations are used to store and retrieve data.
**If you change/remove it**: If you remove the `UserCard.find` function, the program will not be able to retrieve the list of user cards from the database, and the program will throw an error.

---
### Concept 8: Array Methods
Array methods are used to manipulate and interact with arrays. They are used to perform operations such as sorting, filtering, and mapping.
**General Example**
```javascript
const arr = [1, 2, 3, 4, 5];
const sortedArr = arr.sort((a, b) => a - b);
console.log(sortedArr); // Outputs: [1, 2, 3, 4, 5]
```
**In Our Code**
```javascript
const usedSlots = deck.map(d => d.mainDeckSlot);
```
**How it works here**: The `map` function is used to create a new array with the `mainDeckSlot` values of the `deck` array.
**Why it's used**: Array methods are used to manipulate and interact with arrays.
**If you change/remove it**: If you remove the `map` function, the program will not be able to create a new array with the `mainDeckSlot` values, and the program will throw an error.

---
### Concept 9: Object Properties
Object properties are used to access and manipulate the properties of an object. They are used to get and set the values of an object.
**General Example**
```javascript
const obj = { name: 'John', age: 30 };
console.log(obj.name); // Outputs: John
```
**In Our Code**
```javascript
uc.inMainDeck = true;
uc.mainDeckSlot = slot;
```
**How it works here**: The `inMainDeck` and `mainDeckSlot` properties of the `uc` object are set to `true` and `slot` respectively.
**Why it's used**: Object properties are used to access and manipulate the properties of an object.
**If you change/remove it**: If you remove the `inMainDeck` and `mainDeckSlot` properties, the program will not be able to set the values of the `uc` object, and the program will throw an error.

---
### Concept 10: Error Handling
Error handling is used to handle and catch errors that occur in a program. It is used to prevent the program from crashing and to provide a better user experience.
**General Example**
```javascript
try {
  const data = await fetchData();
  console.log(data);
} catch (err) {
  console.error(err);
}
```
**In Our Code**
```javascript
if (isNaN(index)) return sendUsage(reply, `${p} t2deck`, `${p} t2deck <coll_index>`, `${p} t2deck 1`);
```
**How it works here**: The `if` statement checks if the `index` is not a number, and if so, it returns an error message.
**Why it's used**: Error handling is used to handle and catch errors that occur in a program.
**If you change/remove it**: If you remove the `if` statement, the program will not be able to handle the error, and the program will throw an error.
