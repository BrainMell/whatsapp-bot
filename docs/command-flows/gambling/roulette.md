# Roulette Command Flow (`roulette`, `roul`)

## 1. Description
The Roulette command allows players to bet Zeni on color pools (red, black, green), parity parameters (even, odd), or specific numbers (0-36).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j roulette 1000 red"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "roulette" || primaryCmd === "roul") (L4835)
            └── core/gambling.js
                └── roulette(senderJid, amount, bet, economy) (L843)
                    └── Bet validation (L853)
                    └── Cooldown checks (20 spins per 10 hours) (L898)
                    └── user.wallet -= amount
                    └── beginGamblingRound(user)
                    └── Math.floor(Math.random() * 37) (0-36 roll)
                    └── maybeForceLoss(ctx)
                    └── Payout evaluation (36x for green/number, 2x for even/odd/color)
                    └── economy.saveUser(senderJid)
                    └── reply text/visual to WhatsApp
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
* **Line Numbers**: Around 4835
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.roulette`

```javascript
if (primaryCmd === "roulette" || primaryCmd === "roul") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const choice = cmdArgs[2] || "";
  const result = gambling.roulette(senderJid, betAmount, choice, economy);
  return await reply(result.message);
}
```

#### Explanation
- Catches roulette commands, parses bet amounts, and passes execution to `gambling.roulette`.

---

### Step 4: Roulette Logic and Limits Checks
* **File Path**: `core/gambling.js`
* **Line Numbers**: 843-1023
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, bet, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function roulette(userId, amount, bet, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const betLower = bet.toLowerCase();
  let multiplier = 0;
  let betType = '';
  let checkValid = false;

  // Resolve multipliers (36x for green/numbers, 2x for color/even/odd)
  if (betLower === 'red' || betLower === 'r') { multiplier = 2; betType = '🔴 RED'; checkValid = true; }
  // ... (other checks)

  if (!checkValid) return { success: false, message: "❌ Invalid bet!" };

  // Enforce Cooldown Limit: 20 spins per 10 hours
  const now = Date.now();
  const LIMIT_WINDOW = 10 * 60 * 60 * 1000;
  const MAX_SPINS = 20;

  if (user.gamblingLimits.roulette.count >= MAX_SPINS) {
    return { success: false, message: "⏳ Roulette limit reached!" };
  }

  user.gamblingLimits.roulette.count++;
  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  const result = Math.floor(Math.random() * 37); // 0-36
  const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(result);
  const color = result === 0 ? 'green' : (isRed ? 'red' : 'black');

  // Match checks
  let won = false;
  if (betLower === 'red' || betLower === 'r') won = color === 'red' && !maybeForceLoss(ctx);
  // ...

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount * multiplier, ctx));
    user.wallet += gain;
    trackDailyNet(user, gain);
  } else {
    trackDailyNet(user, -amount);
  }

  economyModule.saveUser(userId);
}
```

#### Explanation
- Resolves the bet parameters to assign appropriate payout multipliers.
- **Cooldown Limit Validation**: Asserts player hasn't exceeded `MAX_SPINS` (20 spins) inside the current `LIMIT_WINDOW` (10 hours). If they have, drops execution.
- Deducts the bet from the wallet.
- Rolls a value from `0` to `36`.
- Checks matches, calculates house edge, updates daily net limits, and writes changes back to the database.

---

## 5. How to Modify
To adjust the roulette limit constraints:
- Modify constants in `core/gambling.js` (around lines 903-904):
  ```javascript
  // Change LIMIT_WINDOW to 5 hours and MAX_SPINS to 50:
  const LIMIT_WINDOW = 5 * 60 * 60 * 1000;
  const MAX_SPINS = 50;
  ```
