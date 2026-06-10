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
- Intercepts management commands before normal message routing.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1778-L1982)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1433-L1462)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L758-L781)
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
- **Adjust Merge Zeni Rewards**: Change the reward constant value `500` inside `cmdMerge` at [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1426) and `cmdMergeAll` at [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1452).
- **Modify Locking Safeguards**: You can add additional checks for `isLocked` in other commands (like trading or custom decks).
