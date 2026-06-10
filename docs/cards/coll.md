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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4400-L4412)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L497-L533)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L535-L574)
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
- **Change Highlights Count limit**: Modify the `.slice(0, 15)` parameter in `getTopCards()` inside [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L407).
- **Alter Sorting Parameters**: Edit the sorting weight object `tierOrder` inside [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L399).
