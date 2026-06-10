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
- Message intercepts capture market triggers.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1778-L1952)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1702-L1739)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1742-L1772)
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
- **Change Sweeper Interval**: Locate the `setInterval` call at [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1769) and adjust the milliseconds (currently 60000 / 1 minute).
- **Edit Minimum/Maximum Auction Durations**: Adjust checks inside `cmdAuction()` at [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1675).
- **Adjust Listing Fees / Taxes**: You can introduce tax logic inside `finalizeAuctions` and `cmdBuyCard` before transferring Zeni.
