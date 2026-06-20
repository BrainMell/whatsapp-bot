# Card Market Command Flow (`buycard` / `sc` / `auction` / `bid` / `eshop`)

## 1. Description
The Card Market commands allow players to trade, sell, or auction cards.
- **`buycard`**: Displays active sales listings or purchases a listed card using Zeni.
- **`sc` (Sell Card)**: Lists a main deck card for sale at a specific price.
- **`auction`**: Puts a main deck card up for auction with a minimum bid and duration (e.g. `1d`, `12h`).
- **`bid`**: Places a bid on an active card auction.
- **`eshop`**: Allows players to list entire custom decks for sale, subject to moderator approval.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🛒 BUY CARD LISTINGS: User sends ".g buycard"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdBuyCard(senderJid, reply, args) (L1321)
                    ├── CardMarket.find({ status: 'active', type: 'sale' }) (L1350)
                    ├── Format active listing lines with sellers and prices
                    └── Return listings message to WhatsApp

======================================================
💸 BUY SPECIFIC CARD: User sends ".g buycard 2"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdBuyCard(senderJid, reply, args) (L1321)
                    ├── Query listing 2 from Mongoose
                    ├── economy.getBalance(senderJid) -> check price
                    ├── Transfer Zeni: removeMoney(buyer) & addMoney(seller) (L1338-1339)
                    ├── Transfer card ownership: UserCard.findByIdAndUpdate(cardId, { userId: buyer })
                    ├── Close listing: listing.status = 'sold'
                    ├── listing.save() (L1343)
                    └── Return confirmation message

======================================================
🔨 START AUCTION: User sends ".g auction 1 1000 1d"
======================================================
User command
└── core/engine.js
    └── Match check (L4400) -> cardSystem.handleCommand(...)
        └── core/rpg/cardSystem.js
            └── handleCommand(...) (L1778)
                └── cmdAuction(senderJid, reply, args) (L1668)
                    ├── Parse duration unit -> milliseconds
                    ├── Fetch user card in deck slot 1 (L1679)
                    ├── Update card document: uc.inAuction = true, uc.save() (L1684)
                    ├── Create auction listing: CardMarket.create({ type: 'auction', currentBid: min, endsAt })
                    └── Return auction listing details

======================================================
⏳ AUCTION SWEEPER (CRON): Triggers every 60s
======================================================
Sweeper loop interval (L1769)
└── finalizeAuctions(sock) (L1742)
    ├── Query expired listings: CardMarket.find({ status: 'active', type: 'auction', auctionEndsAt <= Now })
    ├── If high bidder exists:
    │   ├── Deduct high bidder Zeni: economy.removeMoney(bidder, price)
    │   ├── Pay seller Zeni: economy.addMoney(seller, price)
    │   ├── Transfer card: UserCard.findByIdAndUpdate(cardId, { userId: bidder, inAuction: false })
    │   └── Set status = 'sold'
    ├── If no bidder exists:
    │   ├── Return card: UserCard.findByIdAndUpdate(cardId, { inAuction: false })
    │   └── Set status = 'expired'
    └── listing.save() (L1763)
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
- Message intercepts capture market triggers.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1778-L1952)
* **Line Numbers**: 1778-1952
* **Called From**: `handleCommand()`
* **Inputs**: Intercept variables
* **Outputs**: Directs execution to `cmdBuyCard`, `cmdSC`, `cmdAuction`, `cmdBid`, or `cmdEShop`.

```javascript
  switch (cmd) {
    case 'buycard':
      await cmdBuyCard(senderJid, reply, args);
      return true;

    case 'sc':
      await cmdSC(senderJid, reply, args);
      return true;

    case 'auction':
      await cmdAuction(senderJid, reply, args);
      return true;

    case 'bid':
      await cmdBid(senderJid, reply, args);
      return true;

    case 'eshop':
      await cmdEShop(senderJid, reply, chatId, args, isCardMod);
      return true;
```

#### Explanation
- Switch statement routes commands to their respective controllers.

---

### Step 3: Placing a Bid on a Card (bid)
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1702-L1739)
* **Line Numbers**: 1702-1739
* **Called From**: `cmdBid()`
* **Inputs**: `(senderJid, reply, args = [])`
* **Outputs**: Updates highest bidder document state, returns status message

```javascript
async function cmdBid(senderJid, reply, args = []) {
  const p = P();
  const active = await CardMarket.find({ status: 'active', type: 'auction' }).sort({ auctionEndsAt: 1 });
  if (active.length === 0) return reply('📭 No active auctions.');

  if (args.length < 2) {
    // ... (Lists active auctions to user)
    return reply(msg, ...);
  }

  const index = parseInt(args[0]);
  const amount = parseInt(args[1]);
  if (isNaN(index) || isNaN(amount)) return sendUsage(reply, ...);

  const auction = active[index - 1];
  if (!auction) return reply('❌ Invalid auction number.');
  if (auction.sellerId === senderJid) return reply('❌ You cannot bid on your own auction.');
  if (amount <= auction.currentBid) return reply(`❌ Bid must be higher than ${ZENI()}${auction.currentBid.toLocaleString()}.`);

  const balance = economy.getBalance(senderJid);
  if (balance < amount) return reply(`❌ You don't have ${ZENI()}${amount.toLocaleString()}.`);

  try {
    auction.currentBid = amount;
    auction.highBidderId = senderJid;
    auction.bids.push({ bidderId: senderJid, amount, placedAt: new Date() });
    await auction.save();
    return reply(`✅ *BID PLACED!*\n\nYou are now the high bidder for *${CARD_INDEX()[auction.cardId]?.cardName}* at ${ZENI()}${amount.toLocaleString()}.`);
  } catch (err) { return reply('❌ Failed to place bid.'); }
}
```

#### Explanation
1. Checks for active auctions in Mongoose. If none, exits.
2. If arguments are missing, outputs a list of active auctions.
3. Parses parameters (index, bid amount).
4. Asserts that the bidder is not the seller.
5. Verifies the bid is higher than the current highest bid.
6. Verifies the bidder's wallet has enough Zeni.
7. Updates the Mongoose document: sets `currentBid` to the amount, assigns `highBidderId`, pushes a log into `auction.bids`, and saves.
8. Sends a confirmation message. Note: money is not deducted until the auction ends.

---

### Step 4: Finalizing Expired Auctions (Sweeper)
* **File Path**: [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1742-L1772)
* **Line Numbers**: 1742-1772
* **Called From**: Sweeper interval loop (every 60s)
* **Inputs**: Baileys socket reference
* **Outputs**: Processes transactions for expired auctions

```javascript
async function finalizeAuctions(sock) {
  const expired = await CardMarket.find({ status: 'active', type: 'auction', auctionEndsAt: { $lte: new Date() } });
  if (!Array.isArray(expired)) return;
  
  for (const a of expired) {
    try {
      if (a.highBidderId) {
        // Transfer Zeni
        economy.removeMoney(a.highBidderId, a.currentBid);
        economy.addMoney(a.sellerId, a.currentBid);

        // Transfer Card
        await UserCard.findByIdAndUpdate(a.userCardId, { userId: a.highBidderId, inAuction: false, inMainDeck: false, mainDeckSlot: null });
        a.status = 'sold';
      } else {
        // No bidders, return card
        await UserCard.findByIdAndUpdate(a.userCardId, { inAuction: false });
        a.status = 'expired';
      }
      a.completedAt = new Date();
      await a.save();
    } catch (err) { console.error('Finalize auction failed:', err); }
  }
}

// Start sweeper
setInterval(() => {
    const inst = Array.from(instances.values())[0];
    if (inst?.sock_ref) finalizeAuctions(inst.sock_ref);
}, 60000);
```

#### Explanation
1. Runs an interval timer every 60 seconds.
2. Queries the Mongoose `CardMarket` collection for active auctions whose `auctionEndsAt` date is in the past.
3. Iterates over expired auctions:
   - **If a bid was placed**: Deducts Zeni from the winner's wallet (`economy.removeMoney`), adds Zeni to the seller's wallet (`economy.addMoney`), updates card ownership/clears deck slots, and sets listing status to `'sold'`.
   - **If no bid was placed**: Resets the card's `inAuction` flag and sets listing status to `'expired'`.
4. Saves changes back to MongoDB.

---

## 4. How to Modify
- **Change Sweeper Interval**: Locate the `setInterval` call at [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1769) and adjust the milliseconds (currently 60000 / 1 minute).
- **Edit Minimum/Maximum Auction Durations**: Adjust checks inside `cmdAuction()` at [core/rpg/cardSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/cardSystem.js#L1675).
- **Adjust Listing Fees / Taxes**: You can introduce tax logic inside `finalizeAuctions` and `cmdBuyCard` before transferring Zeni.










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
**If you change/remove it**: If you remove the `cardHandled` variable, the program will not be able to store the result of the `cardSystem.handleCommand` function, and the program will not work as expected.

---
### Concept 2: Conditional Statements
Conditional statements are used to make decisions in a program. They allow the program to execute different blocks of code based on certain conditions.
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
if (cardHandled) return;
```
**How it works here**: The `if` statement checks the value of the `cardHandled` variable. If it is true, the program returns and stops executing.
**Why it's used**: Conditional statements are used to make decisions in the program and execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove the `if` statement, the program will not be able to make decisions based on the value of the `cardHandled` variable, and the program will not work as expected.

---
### Concept 3: Switch Statements
Switch statements are used to execute different blocks of code based on the value of a variable.
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
  case 'buycard':
    await cmdBuyCard(senderJid, reply, args);
    return true;
  // ...
}
```
**How it works here**: The `switch` statement checks the value of the `cmd` variable and executes the corresponding block of code.
**Why it's used**: Switch statements are used to execute different blocks of code based on the value of a variable.
**If you change/remove it**: If you remove the `switch` statement, the program will not be able to execute different blocks of code based on the value of the `cmd` variable, and the program will not work as expected.

---
### Concept 4: Functions
Functions are blocks of code that can be executed multiple times from different parts of the program.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
async function cmdBid(senderJid, reply, args = []) {
  // ...
}
```
**How it works here**: The `cmdBid` function is defined to handle the bid command.
**Why it's used**: Functions are used to organize code and make it reusable.
**If you change/remove it**: If you remove the `cmdBid` function, the program will not be able to handle the bid command, and the program will not work as expected.

---
### Concept 5: Async/Await
Async/await is a way to write asynchronous code that is easier to read and maintain.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
const active = await CardMarket.find({ status: 'active', type: 'auction' }).sort({ auctionEndsAt: 1 });
```
**How it works here**: The `await` keyword is used to wait for the `CardMarket.find` function to complete before executing the next line of code.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain.
**If you change/remove it**: If you remove the `await` keyword, the program will not wait for the `CardMarket.find` function to complete, and the program will not work as expected.

---
### Concept 6: Database Operations
Database operations are used to interact with a database, such as finding, creating, updating, and deleting data.
**General Example**
```javascript
const mongoose = require('mongoose');
const User = mongoose.model('User');
User.find({ name: 'John' }, (err, users) => {
  console.log(users);
});
```
**In Our Code**
```javascript
const active = await CardMarket.find({ status: 'active', type: 'auction' }).sort({ auctionEndsAt: 1 });
```
**How it works here**: The `CardMarket.find` function is used to find all documents in the `CardMarket` collection that match the specified criteria.
**Why it's used**: Database operations are used to interact with a database and perform CRUD (create, read, update, delete) operations.
**If you change/remove it**: If you remove the `CardMarket.find` function, the program will not be able to find the active auctions, and the program will not work as expected.

---
### Concept 7: Intervals
Intervals are used to execute a function at a specified interval.
**General Example**
```javascript
setInterval(() => {
  console.log('Hello, world!');
}, 1000); // Execute every 1 second
```
**In Our Code**
```javascript
setInterval(() => {
  const inst = Array.from(instances.values())[0];
  if (inst?.sock_ref) finalizeAuctions(inst.sock_ref);
}, 60000); // Execute every 1 minute
```
**How it works here**: The `setInterval` function is used to execute the `finalizeAuctions` function every 1 minute.
**Why it's used**: Intervals are used to execute a function at a specified interval, such as to perform maintenance tasks or to update data.
**If you change/remove it**: If you remove the `setInterval` function, the program will not be able to execute the `finalizeAuctions` function at the specified interval, and the program will not work as expected.

---
### Concept 8: Parsing Numbers
Parsing numbers is the process of converting a string to a number.
**General Example**
```javascript
const str = '123';
const num = parseInt(str);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const index = parseInt(args[0]);
const amount = parseInt(args[1]);
```
**How it works here**: The `parseInt` function is used to convert the `args[0]` and `args[1]` strings to numbers.
**Why it's used**: Parsing numbers is used to convert strings to numbers, which can then be used in mathematical operations.
**If you change/remove it**: If you remove the `parseInt` function, the program will not be able to convert the `args[0]` and `args[1]` strings to numbers, and the program will not work as expected.

---
### Concept 9: Error Handling
Error handling is the process of catching and handling errors that occur in a program.
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
try {
  auction.currentBid = amount;
  auction.highBidderId = senderJid;
  auction.bids.push({ bidderId: senderJid, amount, placedAt: new Date() });
  await auction.save();
} catch (err) {
  return reply('Failed to place bid.');
}
```
**How it works here**: The `try` block is used to execute the code that may throw an error, and the `catch` block is used to catch and handle any errors that occur.
**Why it's used**: Error handling is used to catch and handle errors that occur in a program, which can help to prevent the program from crashing and provide a better user experience.
**If you change/remove it**: If you remove the `try` and `catch` blocks, the program will not be able to catch and handle errors, and the program may crash or behave unexpectedly.
