# Rock-Paper-Scissors Command Flow (`rps`)

## 1. Description
The Rock-Paper-Scissors command runs a virtual RPS match against the bot. Correct guesses reward a 2x payout (minus house edge). Ties refund bets.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j rps 1000 rock"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "rps") (L15565)
            └── core/gambling.js
                └── rps(senderJid, amount, choice, economy) (L1574)
                    └── choice validation (L1586)
                    └── beginGamblingRound(user)
                    └── Bot choice draw randomly (L1591)
                    └── evaluate ties (userChoice === botChoice)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual / outcome to WhatsApp
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
* **Line Numbers**: 15563-15585
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.rps`

```javascript
if (primaryCmd === "rps") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const choice = cmdArgs[2] || "";
  const result = gambling.rps(senderJid, betAmount, choice, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.rps` with the parsed choice.

---

### Step 4: Rock-Paper-Scissors Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1574-1650
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, choice, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function rps(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const valid = ['rock', 'paper', 'scissors', 'r', 'p', 's'];
  const userChoice = choice.toLowerCase();
  if (!valid.includes(userChoice)) return { success: false, message: "❌ Choose Rock, Paper, or Scissors!" };

  const botChoices = ['rock', 'paper', 'scissors'];
  const botChoice = botChoices[Math.floor(Math.random() * 3)];
  const fullUserChoice = userChoice.startsWith('r') ? 'rock' : (userChoice.startsWith('p') ? 'paper' : 'scissors');

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  if (fullUserChoice === botChoice) {
    // Refund tie
    user.wallet += amount;
    economyModule.saveUser(userId);
    return { success: true, won: null, message: "Tie refund visual" };
  }

  const winMap = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  const won = winMap[fullUserChoice] === botChoice && !maybeForceLoss(ctx);

  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * 2, ctx)) : 0;
  user.wallet += winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Validates player choice keys.
- Rolls a choice randomly from `'rock'`, `'paper'`, and `'scissors'` for the bot.
- Evaluates outcome. If choices are equal, returns the bet immediately. Otherwise, checks win mappings, forced loss constraints, updates wallets, and saves to MongoDB.

---

## 5. How to Modify
To adjust RPS win conditions or payout structures:
- Edit multipliers in `core/gambling.js` (around line 1623):
  ```javascript
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * 1.8, ctx)) : 0; // Reduced win payout to 1.8x
  ```
Prefixes, limits, and house edges can be customized directly in the same block.
