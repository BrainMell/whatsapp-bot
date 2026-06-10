# RPG Subsystem: Casino & Gambling

## 1. Description
The Gambling subsystem operates a virtual casino offering multiple games like Coinflip, Roulette, Blackjack, Crash, and Mines. To protect the game economy from hyperinflation, the system implements a progressive house edge (scaling from a base of 3% up to 10% based on active daily rounds) and a daily profit limit. If a player exceeds their daily profit cap or plays too many rounds, a forced loss mechanic is triggered. The state of active rounds, deposits, withdrawals, and daily net gains is maintained in memory inside the user's `gamblingProfile` structure and written back to their MongoDB profile. Turn updates and results are formatted as visual tables and card decks, then sent back to the WhatsApp chat using the Baileys WebSocket API.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j cf 1000 heads"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (primaryCmd === "cf" || primaryCmd === "flip") (L4801)
            └── core/gambling.js
                └── coinflip(senderJid, amount, choice, economy) (L129)
                    └── ensureGamblingProfile(user)
                    └── beginGamblingRound(user)
                    └── maybeForceLoss(ctx)
                    └── user.wallet +/-= amount
                    └── saveUser(senderJid)
                    └── reply text/visual to WhatsApp
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
* **Inputs**: `{ messages, type }` payload from WhatsApp
* **Outputs**: None (passes control to inner map)

```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify" && type !== "append") return;
  if (isRekeying) return;

  await Promise.all(
    messages.map(async (m) => {
      if (!m.message) return;
```

#### Explanation
- `sock.ev.on("messages.upsert", ...)`: Registers a listener that fires whenever the bot receives new message notifications.
- `if (type !== "notify" && type !== "append") return`: Drops status updates or metadata modifications to only process actual incoming messages.
- `if (isRekeying) return`: Prevents processing when the session encryption keys are refreshing.
- `messages.map(...)`: Iterates over the batch of received messages to process them in parallel.

---

### Step 2: Command Matching
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Inner message processor loop
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: `primaryCmd` and `cmdArgs` array

```javascript
if (lowerTxt.startsWith(currentPrefix)) {
  const cmdBody = lowerTxt
    .substring(currentPrefix.length)
    .trim();
  const cmdArgs = cmdBody.split(" ");
  const primaryCmd = cmdArgs[0];
```

#### Explanation
- `lowerTxt.startsWith(currentPrefix)`: Checks if the incoming text begins with the configured bot prefix (e.g. `.j`).
- `lowerTxt.substring(...)`: Strips the prefix from the message.
- `cmdBody.split(" ")`: Splits the command body by spaces to separate the command name from its arguments.
- `cmdArgs[0]`: Assigns the first element as `primaryCmd` (e.g. `"cf"`).

---

### Step 3: Command Routing for Coinflip
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4801
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.coinflip`

```javascript
if (primaryCmd === "cf" || primaryCmd === "flip") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const choice = cmdArgs[2];
  const result = gambling.coinflip(senderJid, betAmount, choice, economy);
  return await reply(result.message);
}
```

#### Explanation
- `if (primaryCmd === "cf" || ...)`: Captures the coinflip trigger.
- `parseInt(cmdArgs[1], 10)`: Converts the second argument into a numeric bet amount integer value.
- `gambling.coinflip(...)`: Routes execution to the core gambling library, passing the player JID, choice, bet, and the economy reference.

---

### Step 4: Coinflip Evaluation and Profit Verification
* **File Path**: `core/gambling.js`
* **Line Numbers**: 129-222
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, choice, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function coinflip(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  if (amount < GLOBAL_MIN_BET || amount > GLOBAL_MAX_BET) {
    return { success: false, message: "❌ Bet limits exceeded!" };
  }

  if (user.wallet < amount) {
    return { success: false, message: "❌ Insufficient wallet balance!" };
  }

  const normalizedChoice = choice.toLowerCase();
  const userChoice = normalizedChoice.startsWith('h') ? 'heads' : 'tails';
  const result = Math.random() < 0.5 ? 'heads' : 'tails';

  const ctx = beginGamblingRound(user);
  const won = userChoice === result && !maybeForceLoss(ctx);

  if (won) {
    user.wallet += amount;
  } else {
    user.wallet -= amount;
  }

  economyModule.saveUser(userId);
  return {
    success: true,
    message: `🪙 *COINFLIP RESULT*\nOutcome: ${result.toUpperCase()}\nYou ${won ? 'WON' : 'LOST'} ${amount} Zeni!`
  };
}
```

#### Explanation
- Checks if the bet conforms to the `GLOBAL_MIN_BET` and `GLOBAL_MAX_BET` ranges.
- Ensures the player has sufficient Zeni in their immediately accessible wallet.
- `beginGamblingRound(user)`: Enforces dynamic daily thresholds (house edge increases, checking caps).
- `maybeForceLoss(ctx)`: Introduces dynamic forced-loss gacha checks if daily win limits are breached.
- Adjusts wallet values accordingly, updates statistics, saves to database, and outputs the confirmation text.

---

## 4. How to Modify
To adjust max/min limits, change limits inside `core/gambling.js`:

```javascript
// BEFORE:
const GLOBAL_MAX_BET = 500000;
const GLOBAL_MIN_BET = 50;

// AFTER:
const GLOBAL_MAX_BET = 1000000; // Raised maximum bet to 1 Million Zeni
const GLOBAL_MIN_BET = 100;    // Raised minimum bet to 100 Zeni
```
