# History Command Flow (`history`, `bh`)

## 1. Description
The History (also aliased as Bank History `bh`) command lists the user's latest 10 wallet and bank transactions. It reads the transaction logs stored on `user.history` which gets populated by system events (gambling, transfers, daily claims, loans).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j history" or ".j bh"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "history" || "bh") (L14612)
            └── Check registration: economy.isRegistered(senderJid) (L14617)
            └── Fetch user cache: economy.getUser(senderJid) (L14626)
            └── Read user history: const history = user.history || [] (L14627)
            └── Formatting: Slice last 10 entries & map details (L14641)
            └── sock.sendMessage(chatId, { text: historyText }) (L14659)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
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

### Step 2: Command Matching and Registration Validation
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14612-L14625)
* **Line Numbers**: 14612-14625
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Rejects request if user is not registered

```javascript
                  // ${botConfig.getPrefix().toLowerCase()} bh - Balance History
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} bh` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} history`
                  ) {
                    if (!economy.isRegistered(senderJid)) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\``,
                      });
                      return;
                    }
```

#### Explanation
- Compares the message to the prefix + `bh` or prefix + `history` commands.
- Verifies user registration using `economy.isRegistered(senderJid)`.

---

### Step 3: Transaction Log Resolution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14626-L14636) & [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L240-L260)
* **Line Numbers**: 14626-14636 (routing) & 240-260 (transaction helper)
* **Called From**: `engine.js`
* **Inputs**: User ID
* **Outputs**: Array of transaction objects `{ desc, amount, balance, time }`

```javascript
                    const user = economy.getUser(senderJid);
                    const history = user.history || [];

                    if (history.length === 0) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `┏━━━━━━━━━━━━━━━┓\n┃   📜 HISTORY  ┃\n┗━━━━━━━━━━━━━━━┛\n\nYour history is empty.`,
                      });
                      return;
                    }
```

#### Explanation
- Retrieves the cached user document via `economy.getUser(senderJid)`.
- Checks if the user has any transactions. If empty, outputs a notification and returns early.

---

### Step 4: Formatting and Parsing Logs
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14638-L14657)
* **Line Numbers**: 14638-14657
* **Called From**: `engine.js`
* **Inputs**: `history` array
* **Outputs**: Generated summary string `historyText`

```javascript
                    let historyText = `┏━━━━━━━━━━━━━━━┓\n┃   📜 HISTORY  ┃\n┗━━━━━━━━━━━━━━━┛\n\n👤 *User:* ${user.nickname}\n💰 *Balance:* ${economy.getZENI()}${user.wallet.toLocaleString()}\n\n`;

                    // Show last 10 transactions
                    const displayHistory = history.slice(0, 10);

                    displayHistory.forEach((entry, i) => {
                      const time = new Date(entry.time).toLocaleString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      );
                      const prefix = entry.amount > 0 ? "📈 +" : "📉 ";
                      historyText += `${i + 1}. *${entry.desc}*\n   ${prefix}${economy.getZENI()}${Math.abs(entry.amount).toLocaleString()}\n   ⏱️ _${time}_\n\n`;
                    });

                    historyText += `_Only showing last 10 transactions._`;
```

#### Explanation
- Slices the first 10 items of the history array. Since transactions are prepended via `unshift` in `logTransaction`, the first items are the most recent ones.
- Iterates over each transaction:
  - Formats its timestamp.
  - Adds positive/negative emoji cues (`📈 +` for income, `📉 ` for expenditure).
  - Normalizes the amount absolute value and logs it.

---

### Step 5: Sending Result to User
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14659-L14662)
* **Line Numbers**: 14659-14662
* **Called From**: `engine.js`
* **Inputs**: `historyText`
* **Outputs**: WhatsApp message dispatch

```javascript
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + historyText,
                    });
                    return;
```

#### Explanation
- Sends the formatted balance transaction history message to the WhatsApp chat.

---

## 4. How to Modify
To adjust history capacity or display details:
- **Increase Displayed Count**: Modify the slice parameters in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14641):
  ```javascript
  const displayHistory = history.slice(0, 20); // Display 20 transactions
  ```
- **Increase Total Cache Retention (default 50)**: Adjust the memory threshold inside `logTransaction` in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L256):
  ```javascript
  if (user.history.length > 100) { // Keep last 100 entries in MongoDB
    user.history = user.history.slice(0, 100);
  }
  ```
