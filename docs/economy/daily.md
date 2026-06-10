# Daily Reward Command Flow (`daily`)

## 1. Description
The Daily command allows players to claim a free daily allowance of Zeni (default 500 Zeni) once every 24 hours. Successful claims also award activity points to the user's active Guild.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j daily"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " daily") (L14688)
            └── core/rpg/economy.js
                └── claimDaily(senderJid) (L779)
                    └── getUser(senderJid)
                    └── Check 24-hour cooldown: now - user.lastDaily < 24 hours
                    └── If cooldown active -> returns early with hours/minutes remaining
                    └── Else -> user.wallet += DAILY_REWARD (500 Zeni)
                    └── user.lastDaily = now
                    └── logTransaction(senderJid, "Daily Reward", 500, wallet)
                    └── scheduleSave(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L14692)
            └── If successful claim:
                └── Award Guild points: guilds.awardPointsForActivity(senderJid, "daily_claimed") (L14700)
            └── awardProgression(senderJid, chatId) (L14708)
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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14688-L14690)
* **Line Numbers**: 14688-14690
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Routes to daily claim handler

```javascript
                  // daily - Claim daily reward
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} daily`
                  ) {
```

#### Explanation
- Triggers when the user sends `.j daily`.

---

### Step 3: Daily Cooldown check and Balance mutations
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L779-L824)
* **Line Numbers**: 779-824
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function claimDaily(userId) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };
  
  const now = Date.now();
  const dayInMs = 86400000;
  
  if (now - user.lastDaily < dayInMs) {
    const timeLeft = dayInMs - (now - user.lastDaily);
    const hoursLeft = Math.floor(timeLeft / 3600000);
    const minsLeft = Math.floor((timeLeft % 3600000) / 60000);
    
    return {
      success: false,
      message: `⏰ *DAILY ALREADY CLAIMED!* ...`
    };
  }
  
  user.wallet += DAILY_REWARD;
  user.lastDaily = now;
  user.stats.totalEarned += DAILY_REWARD;
  
  logTransaction(userId, "Daily Reward", DAILY_REWARD, user.wallet);
  scheduleSave(userId);
```

#### Explanation
1. Checks that the user is registered.
2. Checks if 24 hours (86,400,000 ms) have passed since `user.lastDaily`.
3. **If Cooldown Active**: Calculates remaining hours and minutes, and returns the cooldown alert.
4. **If Cooldown Cleared**:
   - Adds `DAILY_REWARD` (500 Zeni) to `user.wallet`.
   - Sets `user.lastDaily` to the current timestamp.
   - Logs the transaction as `"Daily Reward"`.
   - Triggers background save via `scheduleSave()`.

---

### Step 4: Guild Activity Award and Reply
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14691-L14710)
* **Line Numbers**: 14691-14710
* **Called From**: `engine.js`
* **Imported From**: `const guilds = require('./guilds');` (defined in [core/rpg/guilds.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js))
* **Inputs**: Claim status outcome
* **Outputs**: WhatsApp response dispatch

```javascript
                    const result = economy.claimDaily(senderJid);
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                    });

                    // Award guild points for daily claim
                    if (result.success) {
                      try {
                        const guilds = require(`./guilds`);
                        guilds.awardPointsForActivity(
                          senderJid,
                          "daily_claimed",
                        );
                      } catch (err) {
                        // Guild system not available, skip
                      }
                    }
                    await awardProgression(senderJid, chatId);
```

#### Explanation
- Delivers the formatted response string to WhatsApp.
- If the reward was successfully claimed, checks the guild system and awards points to the user's guild using the event identifier `"daily_claimed"`.
- Triggers progression points award.

---

## 4. How to Modify
To adjust daily reward values or cooldowns:
- **Change Daily Reward Amount**: Modify the `DAILY_REWARD` constant in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L16):
  ```javascript
  const DAILY_REWARD = 1000; // Increase reward to 1,000 Zeni daily
  ```
- **Change Cooldown Duration**: Modify `dayInMs` variable in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L784):
  ```javascript
  const dayInMs = 12 * 60 * 60 * 1000; // Reduce cooldown to 12 hours
  ```
- **Configure Guild Points Yield**: Modify the reward points in `core/rpg/guilds.js` mapping for the `"daily_claimed"` activity.
