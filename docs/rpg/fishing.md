# RPG Subsystem: Fishing

## What it is
The Fishing system handles coastal scavenging, enabling players to reel in materials (such as fish and shards) to sell or use in crafting. It solves the problem of downtime engagement by providing a risk-free gathering minigame governed by time limits (cooldown fatigue) and random number distributions. It integrates directly into the wilderness command handler.

## How it works

### Snippet 1: Fatigue and Cooldown Enforcement
```javascript
// File: core/engine.js (Lines 5508-5527)
if (user.fishCount >= MAX_FISH) {
  const timePassed = now - (user.lastFishReset || 0);
  if (timePassed < COOLDOWN_MS) {
    const remainingMs = COOLDOWN_MS - timePassed;
    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    busyUsers.delete(senderJid);
    return await sock.sendMessage(
      chatId,
      {
        text: BOT_MARKER + `🪣 *FISHING FATIGUE*\n\nYou've fished 25 times! Your arms are tired. Please rest for *${hours}h ${minutes}m* before casting again.`,
      },
      { quoted: m },
    );
  }
```
* **Explanation**: Located in the core engine commands block, this code enforces a maximum of 25 fishing rounds. If a player exceeds this within a 1-hour timeframe (`COOLDOWN_MS`), their access is locked and a descriptive timer message is returned.
* **DB Calls**: Reads `fishCount` and `lastFishReset` fields from the `users` collection.
* **External HTTP Calls**: None.
* **Baileys API Used**: `sock.sendMessage` to return the warning message.

### Snippet 2: Catch Calculations & Grant
```javascript
// File: core/engine.js (Lines 5546-5575)
const freshUser = economy.getUser(senderJid);
freshUser.fishCount = (freshUser.fishCount || 0) + 1;
if (freshUser.fishCount === 1) freshUser.lastFishReset = Date.now();
economy.saveUser(senderJid);

const luck = freshUser.stats?.luck || 5;
let itemKey = "common_fish";
let emoji = "🐟";
const roll = Math.random() * 100 + luck / 5;

if (roll > 98) {
  itemKey = "mythic_fish";
  emoji = "🦑";
} else if (roll > 85) {
  itemKey = "rare_fish";
  emoji = "🐠";
}
if (Math.random() < 0.05) {
  itemKey = "infected_fish";
  emoji = "☣️";
}
const item = lootSystem.getItemInfo(itemKey);
await inventorySystem.addItem(senderJid, itemKey, 1);
```
* **Explanation**: Executes after a 5-second asynchronous delay. It checks the player's Luck attribute to scale drop probabilities, registers the catch, and adds the corresponding item to their inventory.
* **DB Calls**: Reads and updates `fishCount`, `lastFishReset`, and `inventory` inside the `users` collection.
* **External HTTP Calls**: None.
* **Baileys API Used**: None.

## How to modify it

All fishing parameters (cooldowns, maximum limits, drop rates, and catch logs) are hardcoded inside [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js).

### 1. Adjusting Limits & Cooldowns
Modify the variables at lines 5503-5505:
```javascript
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour (Change this integer)
const MAX_FISH = 25; // Maximum attempts per cycle (Change this integer)
```

### 2. Adding a New Fish Type
To add a new fish tier (e.g. `legendary_fish`), first define it in `ITEM_DATABASE` inside [core/lootSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/lootSystem.js), and then modify the roll distribution logic in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js).

#### Before
```javascript
// File: core/engine.js (Lines 5557-5565)
const roll = Math.random() * 100 + luck / 5;

if (roll > 98) {
  itemKey = "mythic_fish";
  emoji = "🦑";
} else if (roll > 85) {
  itemKey = "rare_fish";
  emoji = "🐠";
}
```

#### After
```javascript
// File: core/engine.js (Lines 5557-5565)
const roll = Math.random() * 100 + luck / 5;

if (roll > 99.5) {
  itemKey = "legendary_fish";
  emoji = "👑";
} else if (roll > 96) {
  itemKey = "mythic_fish";
  emoji = "🦑";
} else if (roll > 80) {
  itemKey = "rare_fish";
  emoji = "🐠";
}
```

## Common tasks

* **Change the fishing cooldown**: Open [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5504) and adjust `COOLDOWN_MS` to your target duration.
* **Add a new fish catch**: Insert the item definition in the database at [core/lootSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/lootSystem.js#L618) and map its probability roll range in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5559).
* **Edit the fatigue message**: Modify the hardcoded string returned inside the fatigue validation block in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5524).
