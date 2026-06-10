# RPG Subsystem: Fishing

## 1. Description
The Fishing system handles coastal scavenging, enabling players to reel in materials (such as fish and shards) to sell or use in crafting. It solves the problem of downtime engagement by providing a risk-free gathering minigame governed by time limits (cooldown fatigue) and random number distributions. It integrates directly into the wilderness command handler.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j fish"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (lowerTxt === ".j fish") (L5468)
            └── Cooldown / fatigue validation checks (L5490)
            └── Start asynchronous cast delay (5 seconds) (L5521)
                └── Roll drops with player luck (L5540)
                └── inventorySystem.addItem(senderJid, itemKey, 1) (L5558)
                └── economy.saveUser(senderJid)
                └── sock.sendMessage(chatId, { text: ... })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
* **Inputs**: `{ messages, type }` payload from WhatsApp
* **Outputs**: None (passes control to inner map)

```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify" && type !== "append") return;
  if (isRekeying) return;

  await Promise.all(
    messages.map(async (m) => {
      if (!m.message) return;
```

#### Explanation
- `sock.ev.on("messages.upsert", ...)`: Registers a listener that fires whenever the bot receives new message notifications.
- `if (type !== "notify" && type !== "append") return`: Drops status updates or metadata modifications to only process actual incoming messages.
- `if (isRekeying) return`: Prevents processing when the session encryption keys are refreshing.
- `messages.map(...)`: Iterates over the batch of received messages to process them in parallel.

---

### Step 2: Command Matching and Fatigue Check
* **File Path**: `core/engine.js`
* **Line Numbers**: 5468-5506
* **Called From**: Message processing block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`, user profile from database
* **Outputs**: Response warning message or triggers async cast

```javascript
if (
  lowerTxt === `${botConfig.getPrefix().toLowerCase()} fish` ||
  lowerTxt === "fish"
) {
  const user = economy.getUser(senderJid);
  const MAX_FISH = 25;
  const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour

  if (user.fishCount >= MAX_FISH) {
    const timePassed = Date.now() - (user.lastFishReset || 0);
    if (timePassed < COOLDOWN_MS) {
      const remainingMs = COOLDOWN_MS - timePassed;
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      return await reply(`🪣 *FISHING FATIGUE*\n\nYou've fished 25 times! Rest for *${hours}h ${minutes}m* before casting again.`);
    } else {
      user.fishCount = 0;
      user.lastFishReset = Date.now();
    }
  }
```

#### Explanation
- `lowerTxt === ...`: Checks if the text matches the fishing command or its raw keyword.
- `economy.getUser(...)`: Resolves the user profile representation to check current fatigue level (`fishCount`) and cooldown tracking.
- `if (user.fishCount >= MAX_FISH)`: Enforces the soft cap on consecutive fishing casts. If reached, calculates elapsed time against `COOLDOWN_MS` (1 hour).
- If the cooldown has not passed, displays the remaining duration in a formatted error reply. Otherwise, resets `fishCount` and updates the reset timestamp to enable a new cycle.

---

### Step 3: Delayed Casting Resolution
* **File Path**: `core/engine.js`
* **Line Numbers**: 5519-5544
* **Called From**: Fishing command block after validation
* **Inputs**: Socket connections and user variables
* **Outputs**: Timeout execution

```javascript
await reply("🎣 You cast your line into the water... Wait 5 seconds.");

setTimeout(async () => {
  const freshUser = economy.getUser(senderJid);
  freshUser.fishCount = (freshUser.fishCount || 0) + 1;
  if (freshUser.fishCount === 1) freshUser.lastFishReset = Date.now();

  const luck = freshUser.stats?.luck || 5;
  let itemKey = "common_fish";
  let emoji = "🐟";
  const roll = Math.random() * 100 + luck / 5;
```

#### Explanation
- `setTimeout(..., 5000)`: Simulates the fishing delay by holding resolution for 5000ms.
- `freshUser.fishCount++`: Updates the user's fatigue counter.
- `Math.random() * 100 + luck / 5`: Evaluates the gacha gacha drop roll. User luck is factored in, raising the probability of hitting a high index range.

---

### Step 4: Drop Roll and Delivery
* **File Path**: `core/engine.js`
* **Line Numbers**: 5545-5575
* **Called From**: setTimeout callback
* **Imported From**: `core/rpg/lootSystem.js`, `core/rpg/inventorySystem.js`
* **Inputs**: Computed `roll` value
* **Outputs**: Adds item to database inventory, sends catch status

```javascript
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

  await inventorySystem.addItem(senderJid, itemKey, 1);
  await economy.saveUser(senderJid);

  const item = lootSystem.getItemInfo(itemKey);
  return await reply(`🎣 *FISHING SUCCESS!*\n\nYou caught a ${emoji} *${item.name}*!\nRemaining casts before fatigue: *${25 - freshUser.fishCount}*`);
}, 5000);
```

#### Explanation
- `if (roll > 98) ...`: Inspects thresholds to determine whether to award standard, rare, or mythic items.
- `inventorySystem.addItem(...)`: Adds the resolved fish ID key to the user's bag.
- `economy.saveUser(...)`: Commits modifications (like modified inventory arrays and updated fatigue count) back to the MongoDB collection.
- `reply(...)`: Outputs the reward details, fatigue status, and returns the result to WhatsApp.

---

## 4. How to Modify
To change cooldown limits or adjust rolls, modify the parameters inside `core/engine.js`:

```javascript
// To adjust limits:
const MAX_FISH = 50; // Increases attempts allowed per cycle to 50
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // Increases rest period to 2 hours
```
