# Guess Command Flow (`guess`)

## 1. Description
The Guess command allows players to guess a number between 1 and 10 with a bet. Correct guesses yield a 9x payout (a net 8x gain on top of the original bet returned), subject to house edge scaling and daily profit limits.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j guess 1000 7"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " guess")) (L15627)
            └── parseGamblingArgs(txt, ['guess']) (L15634)
            └── core/gambling.js
                └── guessNumber(senderJid, amount, guess, economy) (L1780)
                    └── ensureGamblingProfile(user)
                    └── beginGamblingRound(user)
                    └── maybeForceLoss(ctx)
                    └── capPayoutByDailyLimit(user, payoutAmount)
                    └── updateGamblingStats(userId, amount, won, economyModule)
                    └── economyModule.logTransaction(userId, description, amount, wallet)
                    └── user.wallet +/-= amount/gain
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L15650)
            └── awardProgression(senderJid, chatId) (L15654)
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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L15627-L15642)
* **Line Numbers**: 15627-15642
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Parsed `amount` and `guess` number string

```javascript
                  // guess <amt> <1-10>
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} guess` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} guess `,
                    )
                  ) {
                    const { amount, extra: guess } = parseGamblingArgs(txt, ['guess']);

                    if (isNaN(amount) || !guess) {
                      return await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: ${botConfig.getPrefix()} guess <amount> <1-10>`,
                      });
                    }
```

#### Explanation
- Compares the message to the prefix + `guess` command.
- Extracts parameters using `parseGamblingArgs(txt, ['guess'])` which splits the message, finds the word ending in `guess`, and reads the next arguments as `amount` (integer) and `guess` (string/number).
- Sends usage guide if values are invalid.

---

### Step 3: Command Routing
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L15644-L15655)
* **Line Numbers**: 15644-15655
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");` (defined in [core/gambling.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js))
* **Inputs**: `senderJid`, `amount`, `guess`, `economy`
* **Outputs**: Sends result message and triggers player progress award

```javascript
                    const result = gambling.guessNumber(
                      senderJid,
                      amount,
                      guess,
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
- Routes execution to `gambling.guessNumber(...)`.
- Sends the generated game response text back to the WhatsApp group, tagging the user.
- Runs `awardProgression` to give progression experience/points to the active user.

---

### Step 4: Guess Evaluation
* **File Path**: [core/gambling.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L1780-L1806)
* **Line Numbers**: 1780-1806
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, guess, economyModule)`
* **Outputs**: `{ success: boolean, won?: boolean, message: string }` status object

```javascript
function guessNumber(userId, amount, guess, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const num = parseInt(guess);
  if (isNaN(num) || num < 1 || num > 10) return { success: false, message: "❌ Guess a number between 1-10!" };

  const result = Math.floor(Math.random() * 10) + 1;
  const ctx = beginGamblingRound(user);
  const won = num === result && !maybeForceLoss(ctx);
```

#### Explanation
1. Checks if the user is registered in the database, has sufficient funds, and if the bet is within the global min/max limits.
2. Validates guess is a valid number between 1 and 10.
3. Generates the winning result randomly between 1 and 10.
4. Initializes the session via `beginGamblingRound` and determines if the user won (guess matches result, and no forced loss was triggered).

---

### Step 5: Payout Calculation, Database Mutations, and Logs
* **File Path**: [core/gambling.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L1807-L1865)
* **Line Numbers**: 1807-1865
* **Called From**: `guessNumber()` function
* **Inputs**: `won` status, `amount`, `num` (user's guess), `result` (winning number)
* **Outputs**: Formatted response message payload

```javascript
  if (won) {
    const rawGain = amount * 8;
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Guess Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${guessVisual}
... (Cap message) ...`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Guess Won (${num})`, gain, user.wallet);
    return {
      success: true,
      won: true,
      message: `${guessVisual}
... (Win message) ...`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Guess Lost (${num})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `${guessVisual}
... (Lost message) ...`
    };
  }
```

#### Explanation
1. If user **won**:
   - Calculates the net profit payout of +8x of the bet (`rawGain = amount * 8`, which combined with the returned bet makes a 9x payout).
   - Applies house edge and checks daily limits (`capPayoutByDailyLimit`).
   - If the limit was reached and no payout is allowed, returns a refunded message.
   - Otherwise, increases user wallet, tracks stats, adds net profit to daily tracking, updates global gambling statistics via `updateGamblingStats()`, and records the transaction via `logTransaction()`.
2. If user **lost**:
   - Deducts the bet amount from user's wallet.
   - Updates stats, updates net profit negatively via `trackDailyNet()`, and records the transaction via `logTransaction()`.
3. Calls `economyModule.saveUser(userId)` inside `updateGamblingStats` to persist data back to the MongoDB/Mongoose database.

---

## 5. How to Modify
To adjust Guess multipliers, probability, or layout:
- **Adjusting multiplier (default 9x)**: Change `8` (representing 8x net profit) in [core/gambling.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L1808):
  ```javascript
  const rawGain = amount * 9; // Increase payout profit to 9x net profit (10x payout total)
  ```
- **Adjusting Guess range (default 1-10)**: Update the validation check in [core/gambling.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L1793) and the random generator:
  ```javascript
  if (isNaN(num) || num < 1 || num > 5) return { success: false, message: "❌ Guess a number between 1-5!" };
  const result = Math.floor(Math.random() * 5) + 1;
  ```
