# Fish Command Flow (`fish`)

## 1. Description
The Fish command allows players to go scavenging at the coast for rare fish, junk, and shards. Fishing has a fatigue cooldown limit of 25 casts per hour and includes a 5-second wait timing during which inputs are locked.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j fish"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " fish") (L5467)
            └── Check if user is busy: busyUsers.has(senderJid)
            └── Check registration: economy.isRegistered(senderJid)
            └── Check fatigue: if (user.fishCount >= 25)
                └── Verify 1-hour reset cooldown: now - user.lastFishReset < 1 hour
            └── Set user busy: busyUsers.add(senderJid)
            └── Send cast reaction "🎣" and starting cast message (L5517)
            └── setTimeout (5000ms delay) (L5526)
                └── Increment fishCount: freshUser.fishCount += 1
                └── Calculate luck modifier: freshUser.stats.luck || 5
                └── Roll random number (0-100) + luck/5 (L5539)
                    └── common_fish (roll <= 85)
                    └── rare_fish (85 < roll <= 98)
                    └── mythic_fish (roll > 98)
                └── Roll 5% chance for "infected_fish"
                └── add to inventory: inventorySystem.addItem(senderJid, itemKey, 1)
                └── Calculate sell value based on item base value and rarity multiplier
                └── Send results message to chat
                └── awardProgression(senderJid, chatId)
                └── Remove user busy: busyUsers.delete(senderJid)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

```javascript
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
          if (type !== "notify" && type !== "append") return;
          if (isRekeying) return;

          await Promise.all(
            messages.map(async (m) => {
              if (!m.message) return;
```

#### Explanation
- Listens to incoming messages from Baileys. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching and Cooldown/Fatigue Check
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5466-L5515)
* **Line Numbers**: 5466-5515
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Returns early if player is busy or has reached 25-cast fatigue limit

```javascript
                  // `${botConfig.getPrefix().toLowerCase()}` fish - go fishing
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} fish`
                  ) {
                    if (busyUsers.has(senderJid)) {
                      return await reply('⏳ Still processing your last action...');
                    }
                    busyUsers.add(senderJid);
                    try {
                      if (!economy.isRegistered(senderJid)) {
                        busyUsers.delete(senderJid);
                        return await sock.sendMessage(chatId, {
                          text:
                            BOT_MARKER +
                            "❌ Register first to start scavenging!",
                        });
                      }

                      const user = economy.getUser(senderJid);
                      const now = Date.now();
                      const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour
                      const MAX_FISH = 25;

                      // Check if 1-hour cooldown is active
                      if (user.fishCount >= MAX_FISH) {
                        const timePassed = now - (user.lastFishReset || 0);
                        if (timePassed < COOLDOWN_MS) {
                          const remainingMs = COOLDOWN_MS - timePassed;
                          const hours = Math.floor(
                            remainingMs / (60 * 60 * 1000),
                          );
                          const minutes = Math.floor(
                            (remainingMs % (60 * 60 * 1000)) / (60 * 1000),
                          );
                          busyUsers.delete(senderJid);
                          return await sock.sendMessage(
                            chatId,
                            {
                              text:
                                BOT_MARKER +
                                `🪣 *FISHING FATIGUE*\n\nYou've fished 25 times! Your arms are tired. Please rest for *${hours}h ${minutes}m* before casting again.`,
                            },
                            { quoted: m },
                          );
                        } else {
                          // Cooldown expired, reset count
                          user.fishCount = 0;
                          user.lastFishReset = now;
                        }
                      }
```

#### Explanation
- Confirms the command matches `.j fish`.
- Asserts player registration.
- Asserts that the player has not hit the daily/hourly limit of 25 fishing operations. If they have, computes the remaining wait time until fatigue resets.

---

### Step 3: Cast Event Initialization
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5517-L5525)
* **Line Numbers**: 5517-5525
* **Called From**: `engine.js`
* **Inputs**: Message state
* **Outputs**: Casts line, starts wait timing

```javascript
                      await sock.sendMessage(chatId, {
                        react: { text: "🎣", key: m.key },
                      });
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          "⏳ Casting your line... please wait 5s.",
                      });
```

#### Explanation
- Sends a reaction emoji "🎣" to the player's message.
- Delivers a casting lines notification.

---

### Step 4: 5-Second Delay Resolution and Payout roll
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5526-L5584)
* **Line Numbers**: 5526-5584
* **Called From**: `setTimeout()` block (5000ms)
* **Inputs**: Luck stat
* **Outputs**: Loot item resolved, saved, and delivered

```javascript
                      setTimeout(async () => {
                        try {
                          const freshUser = economy.getUser(senderJid);
                          freshUser.fishCount = (freshUser.fishCount || 0) + 1;
                          if (freshUser.fishCount === 1)
                            freshUser.lastFishReset = Date.now();
                          economy.saveUser(senderJid);

                          const luck = freshUser.stats?.luck || 5;

                          // Rarity Logic
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

                          // Infection Check (5%)
                          if (Math.random() < 0.05) {
                            itemKey = "infected_fish";
                            emoji = "☣️";
                          }

                          const item = lootSystem.getItemInfo(itemKey);
                          await inventorySystem.addItem(senderJid, itemKey, 1);
```

#### Explanation
1. Increments user's daily fishing count in memory and schedules database updates.
2. Extracts player's `luck` stat to give a slight boost to rare drop chances.
3. Performs a probability roll (0-100 + luck/5):
   - **Roll > 98**: Mythic Squid (`mythic_fish`).
   - **85 < Roll <= 98**: Rare Tropical Fish (`rare_fish`).
   - **Roll <= 85**: Common Fish (`common_fish`).
   - Checks an independent 5% chance that the catch is an `infected_fish` (representing the priming lore corruption).
4. Inserves the item to the user's inventory database.
5. Calculates the HQ sell value (base value * rarity sell multiplier).
6. Delivers rewards summary to chat and awards progression XP/points.
7. Unregisters user from the busy registry.

---

## 4. How to Modify
To adjust fishing configs:
- **Change cast wait time (default 5s)**: Modify the millisecond duration in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5526):
  ```javascript
  }, 3000); // Reduce cast wait to 3 seconds
  ```
- **Change max cast limit (default 25)**: Edit `MAX_FISH` variable in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5487).
- **Change fish drops details**: Edit properties inside `core/rpg/lootSystem.js` for key IDs `common_fish`, `rare_fish`, `mythic_fish`, `infected_fish`.
