# Crash Command Flow (`crash`)

## 1. Description
The Crash command runs a virtual multiplier rocket game. Players specify a bet and a target multiplier. A crash point is rolled; if the crash point is greater than or equal to the player's target multiplier, the player wins the target payout. Otherwise, they lose the bet.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j crash 1000 2.5"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "crash") (L4840)
            └── core/gambling.js
                └── crash(senderJid, amount, multiplierStr, economy) (L1028)
                    └── Bet & multiplier validations (L1047)
                    └── beginGamblingRound(user)
                    └── Roll crashPoint with house odds weights (L1059)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
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
* **Line Numbers**: Around 4840
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.crash`

```javascript
if (primaryCmd === "crash") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const targetMultiplier = cmdArgs[2] || "";
  const result = gambling.crash(senderJid, betAmount, targetMultiplier, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.crash` with parsed parameters.

---

### Step 4: Crash Evaluation and Multiplier Rolls
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1028-1139
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, multiplierStr, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function crash(userId, amount, multiplierStr, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  // Validations...
  const targetMultiplier = parseFloat(multiplierStr);
  if (isNaN(targetMultiplier) || targetMultiplier <= 1.0) {
    return { success: false, message: "❌ Invalid target multiplier." };
  }

  const ctx = beginGamblingRound(user);

  // Generate crash point with realistic house odds weights
  let crashPoint;
  const rand = Math.random();
  if (rand < 0.03) {
    crashPoint = 1.00;
  } else if (rand < 0.50) {
    crashPoint = 1.01 + Math.random() * 0.49;
  } else if (rand < 0.80) {
    crashPoint = 1.5 + Math.random() * 1.5;
  } else {
    crashPoint = 3.0 + Math.pow(Math.random(), 2) * 47.0;
  }
  crashPoint = Math.round(crashPoint * 100) / 100;

  const won = !maybeForceLoss(ctx) && (crashPoint >= targetMultiplier);
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * targetMultiplier, ctx)) : 0;

  user.wallet = user.wallet - amount + winnings;
  if (won) trackDailyNet(user, winnings - amount);
  else trackDailyNet(user, -amount);

  economyModule.saveUser(userId);
}
```

#### Explanation
- Parses the target multiplier input.
- **Realistic Crash Odds Weights Roll**:
  - 3% chance the rocket crashes immediately at `1.00x`.
  - 47% chance the rocket crashes between `1.01x` and `1.50x`.
  - 30% chance it crashes between `1.50x` and `3.00x`.
  - 20% chance it soars higher, up to `50.00x` (using an exponential curve scale).
- Checks outcomes, deducts bet, adds winnings (if won and within daily caps), and persists updates.

---

## 5. How to Modify
To adjust the crash probability curves:
- Modify the probability check conditions in `core/gambling.js` (around lines 1060-1069):
  ```javascript
  // Change 0.03 (instant crash chance) or other ranges:
  if (rand < 0.05) { // Increases instant crash rate to 5%
      crashPoint = 1.00;
  }
  ```
- Change the max multiplier cap (currently 1000):
  ```javascript
  if (targetMultiplier > 2000) { ... } // Raises cap to 2000x
  ```
Prefixes, limits, and edge properties can be customized directly in the same block.
