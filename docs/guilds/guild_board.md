# Guild Board Command Flow (`guild board`)

## 1. Description
The `guild board` command displays the daily quest board for a player's guild. It displays target progress bars (e.g. killing specific monsters, crafting items, or earning Zeni), lists shared rewards (Guild XP and Zeni), and automatically generates a new list of daily targets if the board is older than 24 hours.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j guild board" or ".j board"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check (L9278-9284)
            └── core/rpg/guilds.js
                └── displayGuildBoard(sock, chatId, senderJid) (L884)
                    ├── Retrieve player's guild: globalGuildData.memberGuilds[senderJid]
                    ├── If none found, return "not in guild" error (L888)
                    ├── Inspect last update duration (Date.now() - dailyBoard.lastUpdate > 86400000)
                    ├── If expired or empty, trigger generateDailyBoard(guildName) (L298)
                    │   ├── Determine targets (Zeni target for Merchant, Crafting for Research, Monster kills for others)
                    │   └── Save & Sync state: syncGuild(guildName)
                    ├── Retrieve GUILD_ARCHETYPES info and currency configurations
                    ├── Construct targets progress indicators & lists
                    └── sock.sendMessage(chatId, { text: boardStatusMsg })
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
- Receives message updates from WhatsApp events.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L9278-L9297)
* **Line Numbers**: 9278-9297
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Invokes `guilds.displayGuildBoard`

```javascript
                    // `${botConfig.getPrefix().toLowerCase()}` guild board
                    if (
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} guild board` ||
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} board`
                    ) {
                      try {
                        await guilds.displayGuildBoard(sock, chatId, senderJid);
                      } catch (err) {
                        console.error("Guild board error:", err);
                        await sock.sendMessage(chatId, {
                          text:
                            BOT_MARKER + "❌❌ Failed to fetch guild board!",
                        });
                      }
                      await awardProgression(senderJid, chatId);
                      return;
                    }
```

#### Explanation
- Catches the `.j guild board` or `.j board` command patterns.
- Invokes `displayGuildBoard` in `guilds.js`.
- Automatically grants conversational progression experience via `awardProgression()` afterwards.

---

### Step 3: Refreshing Targets & Rendering Layout
* **File Path**: [core/rpg/guilds.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L884-L936)
* **Line Numbers**: 884-936
* **Called From**: `displayGuildBoard()`
* **Inputs**: `(sock, chatId, userJid)`
* **Outputs**: Sends current board information to conversation room

```javascript
async function displayGuildBoard(sock, chatId, userJid) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];
  
  if (!guildName) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ You are not in a guild!" });
    return;
  }

  const guild = info.guilds[guildName];
  if (!guild.dailyBoard) guild.dailyBoard = { lastUpdate: 0, targets: [] };
  
  const lastUpdate = guild.dailyBoard.lastUpdate || 0;
  if (Date.now() - lastUpdate > 86400000 || !guild.dailyBoard.targets || guild.dailyBoard.targets.length === 0) {
    generateDailyBoard(guildName);
  }

  const archetype = GUILD_ARCHETYPES[guild.type] || GUILD_ARCHETYPES.ADVENTURER;
  const currencySymbol = botConfig.getCurrency().symbol;
  
  let msg = `📜 *${guildName.toUpperCase()} BOARD* 📜\n`;
  msg += `🏛️ Rank: ${guild.level} | Type: ${archetype.name}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  msg += `📍 *DAILY TARGETS:*\n`;
  
  guild.dailyBoard.targets.forEach((t, i) => {
    const progress = Math.min(100, Math.floor((t.current / t.count) * 100));
    const bar = "█".repeat(Math.floor(progress / 10)) + "░".repeat(10 - Math.floor(progress / 10));
    
    let targetDesc = t.label || t.type;
    let progressDesc = `${t.current}/${t.count}`;
    
    if (t.type === 'EARN_ZENI') {
        progressDesc = `${currencySymbol}${t.current.toLocaleString()} / ${currencySymbol}${t.count.toLocaleString()}`;
    }

    msg += `${i + 1}. ${targetDesc}\n`;
    msg += `   [${bar}] ${progress}% (${progressDesc})\n\n`;
  });
  // ... (append rewards section)
  await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
}
```

#### Explanation
1. Checks the player's active guild membership mapping in `globalGuildData.memberGuilds[userJid]`.
2. Verifies the date of the last board refresh against `86400000ms` (24 hours).
3. If expired, calls `generateDailyBoard(guildName)` to set up a new targets board.
4. Reads archetype configurations to customize target formats and renders progress bar segments dynamically.
5. Emits the daily target list text block back to WhatsApp.

---

### Step 4: Generating New Daily Targets
* **File Path**: [core/rpg/guilds.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L298-L331)
* **Line Numbers**: 298-331
* **Called From**: `generateDailyBoard()`
* **Inputs**: `(guildName)`
* **Outputs**: Reinitializes targets in the `globalGuildData` object and saves to disk

```javascript
function generateDailyBoard(guildName) {
  const guild = globalGuildData.guilds[guildName];
  if (!guild) return;

  const avgLevel = (guild.level || 1) * 5; 
  const targets = [];
  
  if (guild.type === 'MERCHANT') {
    const targetZeni = Math.floor((guild.level * 5000) + (guild.members.length * 2000));
    targets.push({ type: 'EARN_ZENI', count: targetZeni, current: 0, label: 'Earn Zeni' });
  } else if (guild.type === 'RESEARCH') {
    const targetItems = Math.floor((guild.level * 2) + guild.members.length);
    targets.push({ type: 'CRAFT_ITEMS', count: targetItems, current: 0, label: 'Craft Items' });
  } else {
    const targetPool = getAvailableTargets(avgLevel);
    for (let i = 0; i < 3; i++) {
      const type = targetPool[Math.floor(Math.random() * targetPool.length)];
      const count = Math.floor(Math.random() * 5 * guild.members.length) + 5;
      targets.push({ type, count, current: 0, label: `Kill ${type}` });
    }
  }

  guild.dailyBoard = {
    lastUpdate: Date.now(),
    targets: targets,
    completed: false,
    rewards: {
      xp: 500 * (guild.level || 1),
      gold: 1000 * (guild.level || 1)
    }
  };

  syncGuild(guildName);
}
```

#### Explanation
1. Measures targets requirements scaled by guild level and member size to keep difficulty balanced.
2. Selects goals according to the guild's specialization type:
   - **MERCHANT**: Accumulate Zeni targets.
   - **RESEARCH**: Craft a set amount of items.
   - **Others**: Kills 3 random monsters matching the level threshold.
3. Sets up reward scales for Guild XP and Zeni, sets `completed` to false, and writes the state to persistent files using `syncGuild()`.

---

## 4. How to Modify
- **Change Board Reset Duration**: Edit the 24h threshold check `86400000` in [core/rpg/guilds.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L897).
- **Scale Rewards Up/Down**: Adjust XP/Zeni coefficients in `dailyBoard.rewards` inside [core/rpg/guilds.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L324-L327).
- **Modify Monster Hunt Pools**: Adjust logic in `getAvailableTargets()` or the generation math loop.
