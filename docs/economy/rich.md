# Rich Command Flow (`rich`, `richest`, `lb money`)

## 1. Description
The Rich command (aliased as `richest` and `lb money`) queries user data, calculates total wealth (wallet + bank), sorts users in descending order, and displays the top 10 richest registered users in the chat.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j rich" or ".j richest" or ".j lb money"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "rich" || "richest" || "lb money") (L14875)
            └── core/rpg/economy.js
                └── getMoneyLeaderboard(10) (L1111)
                    └── Read economyData (in-memory Map cache)
                    └── Filter registered players
                    └── Map total wealth: (wallet + bank)
                    └── Sort array in descending order
                    └── Slice top 10 users
            └── Formatting: Map entries to text list with rankings and emojis (🥇, 🥈, 🥉)
            └── Resolve JID mentions to notify/tag ranked players
            └── sock.sendMessage(chatId, { text: text, mentions: mentions }) (L14926)
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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14875-L14882)
* **Line Numbers**: 14875-14882
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Routes execution to the leaderboard block

```javascript
                  // rich - Show richest users (top 10)
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} rich` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} richest` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} lb money`
                  ) {
```

#### Explanation
- Detects the `.j rich`, `.j richest`, or `.j lb money` commands.

---

### Step 3: Fetch Leaderboard Data
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L1111-L1123)
* **Line Numbers**: 1111-1123
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(limit = 10)`
* **Outputs**: Sorted array of objects `{ userId, nickname, wallet, bank, total }`

```javascript
function getMoneyLeaderboard(limit = 10) {
  return Array.from(economyData.entries())
    .filter(([_, data]) => data.registered)
    .map(([userId, data]) => ({
      userId,
      nickname: data.nickname || userId.split('@')[0],
      wallet: data.wallet || 0,
      bank: data.bank || 0,
      total: (data.wallet || 0) + (data.bank || 0)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
```

#### Explanation
- Reads all elements from the `economyData` Map.
- Filters out non-registered users.
- Maps user entries to objects containing JID, nickname, wallet, bank, and calculated total wealth.
- Sorts the array in descending order based on `total` wealth.
- Slices the array to return only the top 10 richest players.

---

### Step 4: Formatting and Mention Processing
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14883-L14937)
* **Line Numbers**: 14883-14937
* **Called From**: `engine.js`
* **Inputs**: Sorted leaderboard array
* **Outputs**: Text payload and JID mentions array

```javascript
                      let text =
                        BOT_MARKER +
                        `╔═══════════════════╗
   💰 RICHEST USERS 💰
 ╚═══════════════════╝

 📊 Top ${leaderboard.length} by Total Wealth

 ━━━━━━━━━━━━━━━━━━
`;

                      const mentions = [];

                      leaderboard.forEach((user, i) => {
                        const medal =
                          i === 0
                            ? `🥇`
                            : i === 1
                              ? "🥈"
                              : i === 2
                                ? "🥉"
                                : `${i + 1}.`;
                        const nickname =
                          user.nickname || user.userId.split("@")[0];

                        text += `${medal} @${user.userId.split("@")[0]}\n`;
                        text += `   💎 ${economy.getZENI()}${user.total.toLocaleString()}\n`;
                        text += `   💵 Wallet: ${economy.getZENI()}${user.total - (user.bank || 0) >= 0 ? (user.total - (user.bank || 0)).toLocaleString() : "0"}\n`;
                        text += `━━━━━━━━━━━━━━━━━━\n`;

                        mentions.push(user.userId);
                      });

                      await sock.sendMessage(chatId, {
                        text: text,
                        mentions: mentions,
                      });
```

#### Explanation
- Constructs a formatted text layout with medal icons for ranks 1, 2, and 3.
- Resolves each player's username mention using their JID.
- Collects all displayed player JIDs into `mentions` so they are correctly linked/highlighted on WhatsApp.
- Sends the leaderboard list in a single text message.

---

## 4. How to Modify
To adjust leaderboard display capacity:
- **Change Limit Size**: Modify the argument passed to `getMoneyLeaderboard()` in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14884):
  ```javascript
  const leaderboard = economy.getMoneyLeaderboard(20); // Display top 20 users
  ```
- **Sort by Wallet Only**: To sort the ranking list solely based on active wallet cash instead of total wealth, change the sort mapping in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L1121):
  ```javascript
  .sort((a, b) => b.wallet - a.wallet)
  ```

---

## 5. Gambling Leaderboard (`gamblers` / `lb gamble`)
The **`gamblers`** command (also triggered via `.j leaderboard gamble` or `.j lb gamble`) renders the Top 10 Gamblers leaderboard.
* **Under the Hood**: It queries the economy cache via `economy.getGamblingLeaderboard(10)`. It calculates each user's win rate using `(gamesWon / (gamesWon + gamesLost)) * 100` and displays their net earnings.
* **How to Modify**: To change the sorting rules or limit, locate the matching block in `core/engine.js` at line 15846. You can increase the query limit from `10` to `20` or sort by total bets placed.
