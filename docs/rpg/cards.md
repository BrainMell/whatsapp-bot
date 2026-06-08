# RPG Subsystem: Card Deck & Gacha System

## What it is
The Card Deck and Gacha Subsystem controls collectible cards, player decks, wild spawns, market transactions, and deck image rendering. In this module, cards are classified into tiers (Tier 1 to 6 and S). Spawns can trigger randomly in chat groups based on weight pools and are backed by Mongoose model collections (`CardStat`, `UserCard`, `CardMarket`, and `CardDeck`). When rare cards (Tier 6 or S) spawn, the subsystem invokes the Go image server microservice to transform static images into animated WebP/GIF files. Players can manage their main decks (up to 12 slots), lock cards to prevent accidental actions, and list their cards on a marketplace for sale or auction.

## How it works

**Wild Card Spawning** — [cardSystem.js L257–334](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L257-L334)
```javascript
async function doSpawn(forceCardId = null, forceTier = null, bypassCap = false, targetGroup = null) {
  const inst  = getInst();
  if (!inst.sock_ref || !targetGroup) return;

  let card = null;
  let stat = null;

  if (forceCardId) {
    card = CARD_INDEX()[forceCardId] || ALL_CARDS().find(c => c.cardName.toLowerCase() === forceCardId.toLowerCase());
    if (!card) return null;
    stat = await getOrInitStat(card.id, card.tier);
  } else {
    const tier = forceTier || (() => {
      if (Math.random() < T6_PER_INTERVAL) return '6';
      if (Math.random() < T5_PER_INTERVAL) return '5';
      const total = SPAWN_WEIGHTS.reduce((s, e) => s + e.w, 0);
      let roll = Math.random() * total;
      for (const { tier, w } of SPAWN_WEIGHTS) { roll -= w; if (roll <= 0) return tier; }
      return '1';
    })();
    
    const pool = [...(CARDS_BY_TIER()[tier] || [])];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    for (const c of pool) {
      const s = await getOrInitStat(c.id, c.tier);
      if (s.totalSpawned < s.maxCopies) { card = c; stat = s; break; }
    }
    
    if (!card) {
        // T1 Fallback
        const t1 = [...(CARDS_BY_TIER()['1'] || [])];
        for (const c of t1) {
            const s = await getOrInitStat(c.id, '1');
            if (s.totalSpawned < s.maxCopies) { card = c; stat = s; break; }
        }
    }
  }

  if (!card || (!bypassCap && stat.totalSpawned >= stat.maxCopies)) return;

  stat.totalSpawned += 1;
  stat.lastSpawnedAt = new Date();
  await stat.save();

  const price   = calcPrice(card.tier, stat.totalSpawned, stat.maxCopies);
  const caption = buildSpawnCaption(card, stat.totalSpawned, stat.maxCopies, price);

  try {
    if (String(card.tier) === '6' || String(card.tier) === 'S') {
      const gifBuffer = await goService.convertCardImage(card.imageUrl);
      if (gifBuffer) {
        await inst.sock_ref.sendMessage(targetGroup, { video: gifBuffer, gifPlayback: true, caption });
      } else {
        // Fallback to static image if conversion fails
        const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        await inst.sock_ref.sendMessage(targetGroup, { image: Buffer.from(res.data), caption, mimetype: 'image/jpeg' });
      }
    } else {
      const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      await inst.sock_ref.sendMessage(targetGroup, { image: Buffer.from(res.data), caption, mimetype: 'image/jpeg' });
    }

    const spawnKey = `${targetGroup}_${card.id}`;
    inst.activeSpawns.set(spawnKey, {
      card, copyNumber: stat.totalSpawned, stat, price,
      groupJid: targetGroup, spawnedAt: Date.now(), expiresAt: Date.now() + CLAIM_WINDOW_MS
    });
    console.log(`[CardSystem][${botConfig.getBotId()}] Spawned: ${card.cardName} (T${card.tier}) #${stat.totalSpawned}/${stat.maxCopies} in ${targetGroup}`);
    return { card, copyNumber: stat.totalSpawned, stat, price };
  } catch (err) {
    stat.totalSpawned -= 1;
    await stat.save();
  }
}
```
This function rolls for a card to spawn in a target chat group. It rolls for a card tier based on spawn weights, shuffles available cards in that tier pool, verifies if the card copy limit hasn't been reached, saves the spawn state, downloads and optional converts the card image into a video (for Tier 6/S cards), and broadcasts the message via the Baileys WebSocket API.

---

**Sell Card on Market** — [cardSystem.js L1365–1391](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1365-L1391)
```javascript
async function cmdSC(senderJid, reply, args = []) {
  const p = P();
  const slot = parseInt(args[0]);
  const price = parseInt(args[1]);

  if (isNaN(slot) || isNaN(price) || price < 1) return sendUsage(reply, `${p} sc`, `${p} sc <deck_slot> <price>`, `${p} sc 1 5000`);

  const uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
  if (!uc) return reply(`❌ No card in deck slot #${slot}.`);
  if (uc.isLocked) return reply('❌ This card is locked! Unlock it first.');

  try {
    uc.forSale = true;
    uc.salePrice = price;
    await uc.save();
    await CardMarket.create({
        userCardId: uc._id,
        cardId: uc.cardId,
        sellerId: senderJid,
        type: 'sale',
        price: price,
        status: 'active'
    });
    const card = CARD_INDEX()[uc.cardId];
    return reply(`🛒 *LISTED FOR SALE!*\n\n*${card.cardName}* has been listed for ${ZENI()}${price.toLocaleString()}.`);
  } catch (err) { return reply('❌ Listing failed.'); }
}
```
This command handler retrieves a card equipped in a player's active deck slot, checks if it is locked, updates its DB properties to reflect listing eligibility, and creates a market entry in the `CardMarket` collection.

---

**Locking Cards** — [cardSystem.js L1393–1413](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L1393-L1413)
```javascript
async function cmdLock(senderJid, reply, args = []) {
  const p = P();
  const input = args[0];
  if (!input) return sendUsage(reply, `${p} lock`, `${p} lock <deck_slot or card_id>`, `${p} lock 1`);

  let uc;
  const slot = parseInt(input);
  if (!isNaN(slot)) {
    uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
  } else {
    uc = await UserCard.findOne({ userId: senderJid, cardId: input });
  }

  if (!uc) return reply('❌ Card not found.');

  uc.isLocked = !uc.isLocked;
  await uc.save();

  const card = CARD_INDEX()[uc.cardId];
  return reply(`🔒 *${card.cardName}* is now ${uc.isLocked ? 'LOCKED' : 'UNLOCKED'}.`);
}
```
This utility allows players to lock or unlock individual cards using either their deck slot index or their card ID. It updates the `isLocked` flag on the `UserCard` collection to safeguard items against deletion, merging, or selling.

## How to modify it

### Tweaking Spawn Weights
To configure spawn frequencies for Card Tiers 1 through 4, adjust the weights array inside `core/rpg/cardSystem.js`.

**Before (core/rpg/cardSystem.js L48–53):**
```javascript
const SPAWN_WEIGHTS = [
  { tier: '1', w: 20 },
  { tier: '2', w: 15 },
  { tier: '3', w: 10 },
  { tier: '4', w:  8 },
];
```

**After (core/rpg/cardSystem.js L48–53):**
```javascript
const SPAWN_WEIGHTS = [
  { tier: '1', w: 10 }, // Decreased common tier weight
  { tier: '2', w: 15 },
  { tier: '3', w: 15 }, // Increased weight
  { tier: '4', w: 12 }, // Increased weight
];
```

### Modifying Card Claim Timers & Deck Size Limits
To adjust how long spawned cards remain claimable or the capacity limits of main decks, modify the following variables.

**Before (core/rpg/cardSystem.js L57–58):**
```javascript
const CLAIM_WINDOW_MS = 30 * 60 * 1000; 
const MAIN_DECK_SIZE = 12;
```

**After (core/rpg/cardSystem.js L57–58):**
```javascript
const CLAIM_WINDOW_MS = 15 * 60 * 1000; // Reduced window to 15 minutes
const MAIN_DECK_SIZE = 15; // Increased deck capacity limit
```

## Common tasks
- **Modify stars representation** — Update the star symbols rendered for card tiers in [cardSystem.js L38–41](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L38-L41).
- **Edit claim expiration duration** — Change the lifetime window before spawned cards expire in [cardSystem.js L57](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L57).
- **Alter spawn probability tables** — Modify the relative weights for tiers 1–4 in [cardSystem.js L48–53](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L48-L53).
- **Adjust tier copy cap values** — Customize the maximum global copies allowed per tier in [cardSystem.js L35](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L35).
- **Modify player main deck capacity limit** — Alter the maximum slots available in standard decks in [cardSystem.js L58](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L58).
- **Change default baseline pricing** — Configure minimum transaction values for listing cards in [cardSystem.js L36](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/cardSystem.js#L36).
