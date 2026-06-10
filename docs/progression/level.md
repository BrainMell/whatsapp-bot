# Level Command Flow (`level`)

## 1. Description
The Level command displays the user's current RPG level, XP progress bar, total XP accumulated, target XP required for the next level, Guild Points (GP), commands usage count, and recent achievements. It can also query another user's progress by tagging them.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j level" or ".j level @UserB"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "level") (L146)
            └── core/commands/progressionCommands.js
                └── handleLevelCommand(sock, chatId, senderJid, args, m) (L100)
                    └── Resolve target JID: if (args[0]) -> targetJid = args[0]
                    └── core/rpg/progression.js
                        └── getUserStats(targetJid) (L176)
                        └── getUserRank(targetJid) (L188)
                        └── getProgressBar(progress, 15) (L166)
                        └── getLevelDisplay(level) (L134)
            └── sock.sendMessage(chatId, { text: msg, mentions: [...] }) (L141)
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

### Step 2: Command Matching
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L146)
* **Line Numbers**: Around 146
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Redirects to progression command handler

```javascript
                    if (primaryCmd === "level") {
                      await progressionCommands.handleLevelCommand(
                        sock,
                        chatId,
                        senderJid,
                        cmdArgs.slice(1),
                        m,
                      );
                      return;
                    }
```

#### Explanation
- Captures the `.j level` command and routes execution to progressionCommands controller.

---

### Step 3: Fetch User Progress Statistics
* **File Path**: [core/commands/progressionCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/progressionCommands.js#L100-L109) & [core/rpg/progression.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L176-L200)
* **Line Numbers**: 100-109 (routing) & 176-200 (stats helpers)
* **Called From**: `progressionCommands.js`
* **Imported From**: `core/rpg/progression`
* **Inputs**: Target JID (either senderJid or tagged userJid)
* **Outputs**: `{ level, xp: { current, required, total, progress, nextLevel }, gp: { current, total }, commands, achievements }`

```javascript
// Inside core/rpg/progression.js
function getUserStats(userId) {
    const user = getUser(userId);
    if (!user) return null;
    
    const xpNeeded = getXPForLevel(user.level + 1);
    const xpBase = getXPForLevel(user.level);
    const relativeXP = user.xp - xpBase;
    const relativeNeeded = xpNeeded - xpBase;
    const progressPercent = Math.min(100, Math.floor(relativeXP / relativeNeeded * 100));
    
    return {
        level: user.level,
        xp: {
            current: relativeXP,
            required: relativeNeeded,
            total: user.xp,
            progress: progressPercent,
            nextLevel: xpNeeded - user.xp
        },
        gp: {
            current: user.gp || 0,
            total: user.totalGP || 0
        },
        commands: user.commandsUsed || 0,
        achievements: user.achievements || []
    };
}
```

#### Explanation
1. Resolves the target JID. If the user mentions another player, queries that player's JID.
2. Queries the `progression` db model cache to pull the player's level, XP, achievements, and GP.
3. Computes the relative XP percentage progress between their current level and the next level using `getXPForLevel()`.

---

### Step 4: Render Leaderboard Rank and Percentile
* **File Path**: [core/rpg/progression.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L188-L199)
* **Line Numbers**: 188-199
* **Called From**: `handleLevelCommand()`
* **Inputs**: `userId`
* **Outputs**: `{ rank: number, totalUsers: number, percentile: number }`

```javascript
function getUserRank(userId) {
    const allUsers = Array.from(economy.economyData.values())
        .filter(u => u.registered)
        .map(u => ({ userId: u.userId, level: u.progression?.level || 1, totalXP: u.progression?.totalXPEarned || 0 }))
        .sort((a, b) => b.totalXP - a.totalXP);
        
    const rank = allUsers.findIndex(u => u.userId === userId) + 1;
    const totalUsers = allUsers.length;
    const percentile = totalUsers > 0 ? Math.floor((rank / totalUsers) * 100) : 100;
    
    return { rank, totalUsers, percentile };
}
```

#### Explanation
- Compiles all registered users, sorts them by total accumulated XP in descending order, finds the target user's index (rank = index + 1), and calculates their relative percentile.

---

### Step 5: Formatting and Reply
* **File Path**: [core/commands/progressionCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/progressionCommands.js#L110-L151)
* **Line Numbers**: 110-151
* **Called From**: `handleLevelCommand()`
* **Inputs**: User stats and rank payload
* **Outputs**: Sends progress card text back to the WhatsApp thread

```javascript
    let message = `╔═══════════════════╗\n`;
    message += `║  📊 *${displayName.toUpperCase()} LEVEL* 📊  ║\n`;
    message += `╚═══════════════════╝\n\n`;
    
    message += `${progression.getLevelDisplay(stats.level)}\n`;
    message += `🏆 *Rank:* #${rank.rank} / ${rank.totalUsers} (Top ${100 - rank.percentile}%)\n\n`;
    ...
    await sock.sendMessage(chatId, {
      text: getBotMarker() + message,
      contextInfo: { mentionedJid }
    }, { quoted: m });
```

#### Explanation
- Formats progress bar and displays achievements.
- Sends the message using the Baileys WebSocket emitter, mentioning the target user.

---

## 4. How to Modify
To adjust leveling speed or milestones:
- **Configure Experience Curves**: Modify the leveling algorithm inside `getXPForLevel` in `core/rpg/progression.js`:
  ```javascript
  // Edit base multiplier to make leveling faster/slower
  ```
- **Change Progress Bar Character Width**: Change the second argument passed to `getProgressBar` in [core/commands/progressionCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/progressionCommands.js#L105) (defaults to 15 character divisions).
