# Reset Sprite Command Flow (`reset sprite`)

## 1. Description
The `reset sprite` command allows registered RPG players to reroll their randomly assigned character sprite index (which ranges from 0 to 99). This changes the sprite image that appears during active quest adventures.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j reset sprite" or ".j sprite reset"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check (L16483-16488)
            ├── economy.isRegistered(senderJid)
            ├── economy.getUser(senderJid)
            ├── Modify spriteIndex: user.spriteIndex = Math.floor(Math.random() * 100) (L16496)
            ├── economy.saveUser(senderJid) (L16497)
            └── sock.sendMessage(chatId, { text: confirmationMsg }) (L16498)
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
- Receives the message payload from Baileys. Filters out background events.

---

### Step 2: Command Matching and Registration Check
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L16483-L16494)
* **Line Numbers**: 16483-16494
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and sender JID
* **Outputs**: Checks user registration, returns early if unregistered

```javascript
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} reset sprite` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} sprite reset`
                  ) {
                    if (!economy.isRegistered(senderJid)) {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `❌ You need to register first!`,
                      });
                      return;
                    }
```

#### Explanation
- Matches if the user typed `.j reset sprite` or `.j sprite reset`.
- Checks if the user is registered in the bot's system using `economy.isRegistered()`. If not, replies with a registration error and exits.

---

### Step 3: Rerolling Sprite Index & Saving
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L16495-L16504)
* **Line Numbers**: 16495-16504
* **Called From**: Command execution branch in `engine.js`
* **Inputs**: User JID
* **Outputs**: Rerolls `spriteIndex` integer, saves user document, sends WhatsApp reply

```javascript
                    const user = economy.getUser(senderJid);
                    user.spriteIndex = Math.floor(Math.random() * 100);
                    economy.saveUser(senderJid);
                    await sock.sendMessage(chatId, {
                      text:
                        BOT_MARKER +
                        `✅ *SPRITE RESET!* Your assigned sprite has been rerolled. It will appear in your next adventure!`,
                    });
                    return;
                  }
```

#### Explanation
1. Retrieves the active cached user document from the economy memory Map (`economy.getUser()`).
2. Rerolls the user's `spriteIndex` property to a new random integer between 0 and 99.
3. Invokes `economy.saveUser()` to schedule a database write sync back to MongoDB.
4. Sends a message notifying the player that their sprite has been successfully rerolled.

---

## 4. How to Modify
- **Change Sprite Count / Range**: The sprite index bounds can be modified by changing the multiplier `100` in the math equation at [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L16496).
