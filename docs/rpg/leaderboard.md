# Leaderboard Command Flow (`leaderboard` / `lb`)

## 1. Description
The `leaderboard` or `lb` command allows players to see the rankings of the top 10 players based on either character Level or Total XP earned. It retrieves active records from the in-memory cache and formats them into a leaderboard.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j leaderboard" or ".j lb"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check (L7044-7052)
            └── core/commands/rpgCommands.js
                └── displayLeaderboard(sock, chatId, type) (L306)
                    ├── core/rpg/progression.js
                    │   └── getLeaderboard(type, 10) (L349)
                    │       ├── Retrieve all users from economy.economyData cache
                    │       ├── Filter and sort by 'level' or 'totalXPEarned'
                    │       └── Return top 10 rows
                    ├── Loop top 10 players and query nicknames via economy.getUser()
                    └── sock.sendMessage(chatId, { text: leaderboardText })
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
- Receives message inputs from socket connections.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7044-L7054)
* **Line Numbers**: 7044-7054
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Calls `rpgCommands.displayLeaderboard`

```javascript
                  // .j leaderboard - View leaderboard
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} leaderboard` ||
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} lb`
                  ) {
                    await rpgCommands.displayLeaderboard(sock, chatId, "level");
                    return;
                  }
```

#### Explanation
- Catches the `.j leaderboard` or `.j lb` command patterns.
- Invokes `displayLeaderboard` with parameter `"level"`.

---

### Step 3: Resolving Leaderboard Rows
* **File Path**: [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L306-L329)
* **Line Numbers**: 306-329
* **Called From**: `displayLeaderboard()`
* **Inputs**: `(sock, chatId, type)`
* **Outputs**: Dispatches the top list layout back to the chat

```javascript
async function displayLeaderboard(sock, chatId, type = 'level') { 
    const leaderboard = progression.getLeaderboard(type, 10);
    
    if (leaderboard.length === 0) { 
        await sock.sendMessage(chatId, { text: '❌ No data available!' });
        return;
    }
    
    let msg = `🏆 TOP 10\n\n`;
    msg += `📊 Ranking by: ${type === 'level' ? 'Level' : 'Total XP'}\n\n`;
    
    for (let i = 0; i < leaderboard.length; i++) { 
        const player = leaderboard[i];
        const economyUser = economy.getUser(player.userId);
        const name = economyUser?.nickname || player.userId.split('@')[0];
        
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        msg += `${medal} *${name}*\n   Level ${player.level}`;
        if (type === 'xp') msg += ` | ${player.totalXPEarned.toLocaleString()} XP`;
        msg += `\n\n`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}
```

#### Explanation
1. Calls `progression.getLeaderboard(type, 10)` to compute the top 10 users.
2. Checks if there is any data. If not, alerts the user.
3. Loops through each entry, retrieves the cached user profile to display custom user-set nicknames, and formats ranks with custom trophy emojis for ranks 1-3.
4. Delivers the text layout back to the WhatsApp room.

---

### Step 4: Core Ranking Calculations
* **File Path**: [core/rpg/progression.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L349-L355)
* **Line Numbers**: 349-355
* **Called From**: `progression.getLeaderboard()`
* **Inputs**: `(type, limit)`
* **Outputs**: Filtered and sorted array of player documents

```javascript
function getLeaderboard(type = 'level', limit = 10) {
    const allUsers = Array.from(economy.economyData.values());
    const leaderboard = allUsers.filter(u => u.progression).map(u => ({ userId: u.userId, ...u.progression }));
    const sortField = type === 'level' ? 'level' : 'totalXPEarned';
    leaderboard.sort((a, b) => (b[sortField] || 0) - (a[sortField] || 0));
    return leaderboard.slice(0, limit);
}
```

#### Explanation
1. Retrieves a flat array of all registered users from `economyData` (in-memory Map cache).
2. Filters out any documents that don't have valid `.progression` data properties initialized.
3. Sorts records descending based on the requested sort field.
4. Returns the top slice array (length matching the limit argument, default 10).

---

## 4. How to Modify
- **Increase List Limit**: Change the argument `10` passed to `getLeaderboard` in [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L307).
- **Format Rank Layout**: Customize emojis or spacing directly inside [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L322).
