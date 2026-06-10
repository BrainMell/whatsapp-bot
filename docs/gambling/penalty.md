# Penalty Command Flow (`penalty`)

## 1. Description
The Penalty shootout command allows players to bet Zeni and try to score a penalty kick against the bot by choosing Left, Center, or Right. Winning kicks yield a 1.4x multiplier payout (a 40% net gain on top of the original bet returned), scaled by the house edge and daily profit limits.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j penalty 1000 left"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " penalty")) (L15595)
            └── parseGamblingArgs(txt, ['penalty']) (L15602)
            └── core/gambling.js
                └── penalty(senderJid, amount, direction, economy) (L1686)
                    └── ensureGamblingProfile(user)
                    └── beginGamblingRound(user)
                    └── maybeForceLoss(ctx)
                    └── capPayoutByDailyLimit(user, payoutAmount)
                    └── updateGamblingStats(userId, amount, won, economyModule)
                    └── economyModule.logTransaction(userId, description, amount, wallet)
                    └── user.wallet +/-= amount/gain
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L15618)
            └── awardProgression(senderJid, chatId) (L15622)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js)
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

### Step 2: Command Matching and Argument Parsing
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L15595-L15611)
* **Line Numbers**: 15595-15611
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Parsed `amount` and `direction`

```javascript
                  // penalty <amt> <l/c/r>
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} penalty` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} penalty `,
                    )
                  ) {
                    const { amount, extra: direction } = parseGamblingArgs(txt, ['penalty']);

                    if (isNaN(amount) || !direction) {
                      return await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: ${botConfig.getPrefix()} penalty <amount> <left/center/right>`,
                      });
                    }
```

#### Explanation
- Compares the message to the prefix + `penalty` command.
- Extracts parameters using `parseGamblingArgs(txt, ['penalty'])` which splits the message, finds the word ending in `penalty`, and reads the next arguments as `amount` (integer) and `direction`.
- Sends usage guide if values are invalid.

---

### Step 3: Command Routing
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L15612-L15623)
* **Line Numbers**: 15612-15623
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");` (defined in [core/gambling.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js))
* **Inputs**: `senderJid`, `amount`, `direction`, `economy`
* **Outputs**: Sends result message and triggers player progress award

```javascript
                    const result = gambling.penalty(
                      senderJid,
                      amount,
                      direction,
                      economy,
                    );
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                      contextInfo: { mentionedJid: [senderJid] },
                    });
                    await awardProgression(senderJid, chatId);
                    return;
```

#### Explanation
- Routes execution to `gambling.penalty(...)`.
- Sends the generated game response text back to the WhatsApp group, tagging the user.
- Runs `awardProgression` to give progression experience/points to the active user.

---

### Step 4: Penalty Evaluation
* **File Path**: [core/gambling.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L1686-L1774)
* **Line Numbers**: 1686-1774
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, direction, economyModule)`
* **Outputs**: `{ success: boolean, won?: boolean, message: string }` status object

```javascript
function penalty(userId, amount, direction, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const valid = ['left', 'center', 'right', 'l', 'c', 'r'];
  const dir = direction.toLowerCase();
  if (!valid.includes(dir)) return { success: false, message: "❌ Choose Left, Center, or Right!" };

  const keeperDir = ['left', 'center', 'right'][Math.floor(Math.random() * 3)];
  const userDir = dir.startsWith('l') ? 'left' : (dir.startsWith('c') ? 'center' : 'right');
  const ctx = beginGamblingRound(user);
  const won = userDir !== keeperDir && !maybeForceLoss(ctx);
```

#### Explanation
1. Checks if the user is registered in the database, has sufficient funds, and if the bet is within the global min/max limits.
2. Validates direction selection (`left`, `center`, `right`, or abbreviations `l`, `c`, `r`).
3. Picks a random goalkeeper dive direction out of the three.
4. Initializes the session via `beginGamblingRound` and determines if the user won (they scored if the kick direction did NOT match the goalkeeper's dive, and no forced loss was triggered).

---

### Step 5: Payout Calculation, Database Mutations, and Logs
* **File Path**: [core/gambling.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L1715-L1773)
* **Line Numbers**: 1715-1773
* **Called From**: `penalty()` function
* **Inputs**: `won` status, `amount`, `userDir`, `keeperDir`
* **Outputs**: Formatted response message payload

```javascript
  if (won) {
    const rawGain = Math.floor(amount * 0.4);
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Penalty Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${penaltyVisual}
... (Cap message) ...`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Penalty Goal (${userDir})`, gain, user.wallet);
    return {
      success: true,
      won: true,
      message: `${penaltyVisual}
... (Goal message) ...`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Penalty Miss (${userDir})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `${penaltyVisual}
... (Saved message) ...`
    };
  }
```

#### Explanation
1. If user **won**:
   - Calculates the net payout of +40% of the bet (`rawGain = Math.floor(amount * 0.4)`).
   - Applies house edge and checks daily limits (`capPayoutByDailyLimit`).
   - If the limit was reached and no payout is allowed, returns a refunded message.
   - Otherwise, increases user wallet, tracks stats, adds net profit to daily tracking, updates global gambling statistics via `updateGamblingStats()`, and records the transaction via `logTransaction()`.
2. If user **lost**:
   - Deducts the bet amount from user's wallet.
   - Updates stats, updates net profit negatively via `trackDailyNet()`, and records the transaction via `logTransaction()`.
3. Calls `economyModule.saveUser(userId)` inside `updateGamblingStats` to persist data back to the MongoDB/Mongoose database.

---

## 5. How to Modify
To adjust Penalty multipliers, probability, or layout:
- **Adjusting multiplier (default 1.4x)**: Change `0.4` (representing 40% profit) in [core/gambling.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L1716):
  ```javascript
  const rawGain = Math.floor(amount * 0.5); // Increase payout profit to 50% (1.5x)
  ```
- **Adjusting Keeper Probability (default 1/3 match)**: To change keeper block difficulty:
  ```javascript
  // Make keeper pick same dir 50% of the time, or custom distribution
  ```
