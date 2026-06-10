# Higher/Lower Command Flow (`hl`)

## 1. Description
The Higher/Lower command asks the player to guess if the second random card drawn (from 1 to 13) is higher or lower than the first card drawn. Ties result in a refund.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j hl 1000 higher"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "hl") (L15865)
            └── core/gambling.js
                └── higherLower(senderJid, amount, guess, economy) (L1872)
                    └── Guess validation
                    └── beginGamblingRound(user)
                    └── Draw two random values 1-13
                    └── evaluate ties (first === second)
                    └── maybeForceLoss(ctx)
                    └── user.wallet +/-= amount
                    └── economy.saveUser(senderJid)
                    └── reply visual / card comparison to WhatsApp
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
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
- Receives message arrays from Baileys and routes valid notify payloads downstream.

---

### Step 2: Command Matching and Extraction
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Message parser block
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
- Extracts prefix details and resolves parameters.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 15865 (inside gambling router segment)
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.higherLower`

```javascript
if (primaryCmd === "hl") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const guess = cmdArgs[2] || "";
  const result = gambling.higherLower(senderJid, betAmount, guess, economy);
  return await reply(result.message);
}
```

#### Explanation
- Parses the bet amount and card prediction guess parameter (`"higher"`/`"lower"`), then delegates execution to the gambling module.

---

### Step 4: Game Roll and Card Validation
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1872-1993
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, guess, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function higherLower(userId, amount, guess, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const normalizedGuess = guess.toLowerCase();
  if (!['higher', 'lower', 'h', 'l'].includes(normalizedGuess)) {
    return { success: false, message: "❌ Choose 'higher' or 'lower'!" };
  }

  const userGuess = normalizedGuess.startsWith('h') ? 'higher' : 'lower';
  const ctx = beginGamblingRound(user);

  // Roll two cards 1-13
  const firstCard = Math.floor(Math.random() * 13) + 1;
  const secondCard = Math.floor(Math.random() * 13) + 1;

  if (firstCard === secondCard) {
    // Refund tie
    economyModule.logTransaction(userId, "Higher/Lower Tie", 0, user.wallet);
    return { success: true, won: null, message: "Tie refund visual message" };
  }

  const actualResult = secondCard > firstCard ? 'higher' : 'lower';
  const won = userGuess === actualResult && !maybeForceLoss(ctx);

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount, ctx));
    user.wallet += gain;
    trackDailyNet(user, gain);
  } else {
    user.wallet -= amount;
    trackDailyNet(user, -amount);
  }

  economyModule.saveUser(userId);
}
```

#### Explanation
- Asserts that the player's guess is either a variation of "higher" or "lower".
- Generates two pseudo-random integers representing cards (`1-13`).
- Compares values. If they match, registers a tie and returns the wagered money.
- Checks outcomes, applies edge reductions, and adjusts wallets in MongoDB.

---

## 5. How to Modify
To adjust Card boundaries or change tie rules:
- Modify card deck range in `core/gambling.js` (around line 1893):
  ```javascript
  // Change 13 to another integer (e.g. 10 to simulate a smaller pool)
  const firstCard = Math.floor(Math.random() * 10) + 1;
  ```
- Make ties result in a loss for the player:
  ```javascript
  // Remove the check for firstCard === secondCard and count equal cards as a loss.
  ```
Prefixes, limit caps, and house edges can be customized directly in the same block.
