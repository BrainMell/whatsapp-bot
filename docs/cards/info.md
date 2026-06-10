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
- Incoming messages are intercepted by the card system before processing.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1778-L1972)
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
* **File Path**: [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L918-L971)
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
- **Modify Search Result limits**: Change the `.slice(0, 15)` multiplier inside `cmdInfo()` at [core/rpg/cardSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L965).
- **Edit Gifting Rules**: Locate `cmdCG()` in `core/rpg/cardSystem.js` and add rules (like taxing transactions or capping daily transfers).
