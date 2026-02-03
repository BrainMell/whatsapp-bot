# Memory Optimizations — WhatsApp Bot (500MB Server → 200MB Idle Target)

All issues below were found by reading through the actual code. Each fix includes the exact location and the replacement. Apply in order.

---

## engine.js

### 1. conversationMemory — grows forever, never pruned

**Where:** line 1113 (`const conversationMemory = new Map();`)

The Map stores full chat history per user and only clears if a user manually runs `reset`. Every user who has ever messaged the bot stays in RAM permanently.

**Fix — tag timestamps on write (line ~1710):**
```js
// BEFORE
history.push({ role: `user`, content: newMessage });

// AFTER
history.push({ role: `user`, content: newMessage, _ts: Date.now() });
```

And on the assistant reply (line ~1763):
```js
// BEFORE
history.push({ role: "assistant", content: aiReply });

// AFTER
history.push({ role: "assistant", content: aiReply, _ts: Date.now() });
```

**Fix — add eviction loop right after line 1115:**
```js
// Evict stale conversation histories (idle > 2 hours)
setInterval(() => {
  const cutoff = Date.now() - 7200000; // 2 hours
  for (const [jid, history] of conversationMemory.entries()) {
    const lastMsg = history[history.length - 1];
    if (!lastMsg || (lastMsg._ts && lastMsg._ts < cutoff)) {
      conversationMemory.delete(jid);
    }
  }
}, 300000); // run every 5 min
```

---

### 2. Buffer.concat in a loop — reallocates on every chunk

**Where:** lines 558–561, 3238–3246, 3374–3375, 3421–3422 (and the `downloadMedia` helper)

Each `Buffer.concat([buffer, chunk])` copies the entire existing buffer into a new allocation. On a 10MB video that's potentially hundreds of copy operations before GC runs.

**Fix — apply this pattern everywhere you see the old one:**
```js
// BEFORE (appears 4+ times)
let buffer = Buffer.from([]);
for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

// AFTER
const chunks = [];
for await (const chunk of stream) { chunks.push(chunk); }
const buffer = Buffer.concat(chunks);
```

Specific locations to hit:
- `downloadMedia()` function (~line 556)
- Sticker conversion block (~line 3238)
- `toimg` handler (~line 3374)
- `tovid` handler (~line 3421)

---

### 3. Duplicate setInterval wipers

**Where:** lines 931 and 958

Both blocks do the exact same thing — clear `groupMessageHistory` and wipe the MongoDB group info every 4 hours. Delete the one at line 958.

```js
// DELETE THIS ENTIRE BLOCK (line 958–962):
setInterval(() => {
    system.set(BOT_ID + '_group_message_info', {});
    groupMessageHistory.clear(); 
    console.log(`🧹 [${BOT_ID}] Global reset: Group Info wiped from MongoDB.`);
}, RESET_INTERVAL);
```

---

### 4. activityTracker, spamTracker, temporaryContext, pendingTagRequests — no eviction

**Where:** lines 1113–1260

All four are `new Map()` with zero cleanup. `spamTracker` self-prunes old message timestamps but keeps every user key in the Map forever. The others just accumulate indefinitely.

**Fix — add one cleanup interval after all Maps are declared (~line 1260):**
```js
setInterval(() => {
  const now = Date.now();

  // spamTracker: remove users with no recent messages
  for (const [userId, data] of spamTracker.entries()) {
    if (data.messages.length === 0 && now - (data.lastWarning || 0) > 600000) {
      spamTracker.delete(userId);
    }
  }

  // temporaryContext: clear empty entries
  for (const [jid, items] of temporaryContext.entries()) {
    if (!items || !items.length) temporaryContext.delete(jid);
  }

  // pendingTagRequests: drop anything older than 2 min
  for (const [jid, req] of pendingTagRequests.entries()) {
    if (now - req.timestamp > 120000) pendingTagRequests.delete(jid);
  }

  // activityTracker: cap nested maps at 200 most recent users per chat
  for (const [chatId, users] of activityTracker.entries()) {
    if (users.size > 200) {
      const sorted = [...users.entries()].sort((a, b) => b[1].lastMessage - a[1].lastMessage);
      users.clear();
      sorted.slice(0, 200).forEach(([k, v]) => users.set(k, v));
    }
  }
}, 120000); // every 2 min
```

---

### 5. msgRetryCounterCache TTL is 1 hour

**Where:** line 75

Baileys only needs retry keys for the immediate retry window. 1 hour is way too long.

```js
// BEFORE
const msgRetryCounterCache = new NodeCache({ stdTTL: 3600 });

// AFTER
const msgRetryCounterCache = new NodeCache({ stdTTL: 300 }); // 5 min
```

---

### 6. Session cleanup is fully disabled

**Where:** line 2208

You disabled it because it slowed down startup. The fix isn't to leave it off — it's to delay the first run until after boot is stable.

```js
// BEFORE
// DISABLED: setInterval(cleanupOldSessions, 24 * 60 * 60 * 1000);

// AFTER — starts the interval 3 minutes after boot, so it never hits during startup
setTimeout(() => {
  setInterval(cleanupOldSessions, 86400000); // daily after that
}, 180000);
```

---

## economy.js

### 7. Duplicate function declarations

**Where:** `getGold`, `addGold`, `removeGold` are each declared twice — once at lines 262/267/275 and again at lines 874/879/887. The second declarations silently overwrite the first. Delete the second set (lines 874–893) entirely.

```js
// DELETE lines 874–893 (the second copies of getGold, addGold, removeGold)
```

---

### 8. saveUser fires on every single mutation — 30 calls scattered through the file

**Where:** throughout economy.js — every `addMoney`, `removeMoney`, `addItem`, `removeItem`, `deposit`, `withdraw`, etc. each individually calls `saveUser()` which hits MongoDB immediately.

This isn't a memory leak per se, but it creates a flood of concurrent Mongoose operations that each hold connection state and pending promises in memory until they resolve. On a busy bot that's dozens of open DB operations at once.

**Fix — add a debounced save wrapper and replace all direct `saveUser` calls:**
```js
// Add this near the top of economy.js, after the imports:
const pendingSaves = new Set();
let saveTimer = null;

function scheduleSave(userId) {
  pendingSaves.add(userId);
  if (!saveTimer) {
    saveTimer = setTimeout(async () => {
      const toSave = [...pendingSaves];
      pendingSaves.clear();
      saveTimer = null;
      for (const id of toSave) {
        await saveUser(id);
      }
    }, 500); // flush every 500ms
  }
}
```

Then replace all `saveUser(userId)` calls throughout the file with `scheduleSave(userId)`. Keep the original `saveUser` function as-is (it's still called by the flush). The only place you'd keep a direct `saveUser` call is in `loadEconomy` if you needed a forced write.

---

## combatImageGenerator.js

### 9. Jimp.read from disk on every single combat frame — no sprite caching

**Where:** lines 272, 288, 327, 355, 385 (inside `generateCombatImage`)

Every time a combat image is generated — which happens on every attack, every turn, every PvP action — the function reads the background, the player sprite, every enemy sprite, and all 5 UI elements fresh from disk via `Jimp.read()`. Jimp decodes the PNG into a raw pixel buffer each time. For a combat round with 4 enemies that's 10+ full image decodes per frame.

**Fix — add an LRU sprite cache at the top of the file:**
```js
// Add after the imports, before getPaths():
const { LRUCache } = require('lru-cache');
const spriteCache = new LRUCache({ max: 60, ttl: 1000 * 60 * 30 }); // 60 sprites, 30min TTL

async function cachedJimpRead(filePath) {
  const cached = spriteCache.get(filePath);
  if (cached) return cached.clone(); // always clone — Jimp mutates in place
  const img = await Jimp.read(filePath);
  spriteCache.set(filePath, img);
  return img.clone();
}
```

Then replace every `Jimp.read(...)` call in `generateCombatImage` and `generateEndScreenImage` with `cachedJimpRead(...)`.

**Important:** `lru-cache` is already in your `package.json` dependencies (used by `anikaiResolver.js`), so no new install needed.

---

## pvpSystem.js

### 10. duelInvites and activeDuels only clean up on user action — never on timeout

**Where:** lines 12–13

`duelInvites` checks the 120s expiry only when someone tries to `accept`. If nobody accepts, the entry sits forever. `activeDuels` only clears when someone wins — if a duel is abandoned (both players leave), it's stuck in RAM and blocks new duels in that chat.

**Fix — add a periodic sweep at the bottom of the file, before `module.exports`:**
```js
setInterval(() => {
  const now = Date.now();

  // Expire unclaimed invites older than 2 min
  for (const [chatId, invite] of duelInvites.entries()) {
    if (now - invite.timestamp > 120000) {
      duelInvites.delete(chatId);
    }
  }

  // Expire abandoned duels with no action in 5 min
  for (const [chatId, duel] of activeDuels.entries()) {
    if (now - duel.lastAction > 300000) {
      activeDuels.delete(chatId);
    }
  }
}, 60000); // check every minute
```

---

## guilds.js

### 11. guildInvites expire only on accept/decline — never swept

**Where:** `guildInvites` object inside `globalGuildData`

Same pattern as PVP. Invites that are never responded to persist forever in the object (and get persisted to MongoDB on every guild sync).

**Fix — add a sweep in the same interval or create one:**
```js
setInterval(() => {
  const now = Date.now();
  const invites = globalGuildData.guildInvites || {};
  let changed = false;
  for (const [jid, invite] of Object.entries(invites)) {
    if (now - invite.timestamp > 120000) {
      delete invites[jid];
      changed = true;
    }
  }
  if (changed) saveChallenges(); // or whatever syncs globalGuildData
}, 60000);
```

---

## ludo.js

### 12. Profile pictures cached to disk forever — no size limit

**Where:** `fetchProfilePicture()` function (line 19)

Every player's PFP is fetched and saved as a `.jpg` in the `pfp/` directory. It checks if the file exists and skips the download if so — but it never cleans up old ones. Over time this fills disk and the directory scan on each game gets slower.

**Fix — add a size-capped cleanup before the fetch:**
```js
async function cleanPfpCache() {
  const dir = getPfpDir();
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir)
    .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtime }))
    .sort((a, b) => a.mtime - b.mtime); // oldest first
  // Keep only the 100 most recent
  if (files.length > 100) {
    files.slice(0, files.length - 100).forEach(f => {
      fs.unlinkSync(path.join(dir, f.name));
    });
  }
}
// Call once on bot start, or add to a daily interval
```

---

## package.json — dead dependencies eating baseline RAM

### 13. Remove `mongodb` — Mongoose already bundles it

You have both `mongoose` and `mongodb` in `package.json`. Mongoose ships with the native driver internally. Having both installed means two copies of the MongoDB client in `node_modules`.

```
npm uninstall mongodb
```

### 14. Check if puppeteer is actually used anywhere

`puppeteer-core`, `puppeteer-extra`, and `puppeteer-extra-plugin-stealth` are all installed. The scraper functions in `engine.js` have all been refactored to use `got-scraping` + `linkedom`. If nothing in your `core/` folder actually calls `puppeteer.launch()`, all three are dead weight — puppeteer alone loads ~30–50MB into the module graph just by being required.

```
# Only run this if you've confirmed nothing launches a browser:
npm uninstall puppeteer-core puppeteer-extra puppeteer-extra-plugin-stealth
```

### 15. Remove either `jimp` or `pureimage` — pick one

Both are image processing libraries. `jimp` is the heavier one (~15MB loaded). `pureimage` is only used in `combatImageGenerator.js` for the rank text rendering (`createRankTextImage`). You could rewrite that one function using Jimp's built-in font rendering and drop `pureimage` entirely. Or vice versa — but don't keep both.

---

## Expected Impact

| Fix | Estimated savings |
|---|---|
| #1 conversationMemory eviction | 5–20MB (scales with user count) |
| #2 Buffer.concat pattern | Reduces peak spikes by 10–30MB during media ops |
| #3–4 Map eviction + duplicate interval | 2–5MB steady state |
| #7–8 economy deduplication + debounced saves | Reduces concurrent DB promise count, lowers transient memory |
| #9 Jimp sprite cache | Eliminates repeated decode/re-encode cycles, reduces per-combat allocation |
| #10–11 game state sweeps | Prevents slow leak over hours of uptime |
| #13–15 dead packages | 40–70MB off baseline just from module loading |

Total expected: well under 200MB idle. The package removals alone get you a significant chunk of the way there, and the Map evictions + sprite caching handle the creep over time.