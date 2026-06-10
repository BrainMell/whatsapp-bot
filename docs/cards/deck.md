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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4400-L4412)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1778-L1952)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L973-L996)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1206-L1232)
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
- **Modify Deck Size Cap**: Change the `MAIN_DECK_SIZE` configuration constant (currently 12) at [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L58).
- **Edit Custom Deck Limit Restrictions**: Locate `cmdCreateDeck()` in `core/rpg/cardSystem.js` to adjust custom deck limits.
- **Modify Main Deck Rendering Format**: Customize the display labels inside `cmdDeck()` in `core/rpg/cardSystem.js`.
