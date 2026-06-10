# Plinko Command Flow (`plinko`)

## 1. Description
The Plinko command drops a ball down a peg board pyramid with low, mid, or high risk options, returning multipliers based on the final landing bucket.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j plinko 1000 high"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "plinko") (L15727)
            └── core/gambling.js
                └── plinko(senderJid, amount, risk, economy) (L2004)
                    └── beginGamblingRound(user)
                    └── getResult(tables[r], weights[r]) weighted random (L2034)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply peg path / visual grid to WhatsApp
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
* **Line Numbers**: 15724-15746
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.plinko`

```javascript
if (primaryCmd === "plinko") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const risk = cmdArgs[2] || "mid";
  const result = gambling.plinko(senderJid, betAmount, risk, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.plinko` with risk levels.

---

### Step 4: Plinko Logic and Risk Levels Mappings
* **File Path**: `core/gambling.js`
* **Line Numbers**: 2004-2100
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, risk, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function plinko(userId, amount, risk, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const riskLevel = risk.toLowerCase();
  const validRisks = ['low', 'mid', 'high', 'l', 'm', 'h'];
  if (!validRisks.includes(riskLevel)) return { success: false, message: "❌ Choose Low/Mid/High!" };

  const r = riskLevel.startsWith('l') ? 'low' : (riskLevel.startsWith('m') ? 'mid' : 'high');

  const tables = {
    low: [0.5, 1.0, 1.1, 1.2, 1.5, 2.0, 5.0],
    mid: [0.2, 0.5, 1.0, 1.5, 2.5, 10.0, 25.0],
    high: [0.0, 0.1, 0.2, 1.5, 5.0, 50.0, 100.0]
  };

  const weights = {
    low: [40, 30, 15, 10, 3, 1.5, 0.5],
    mid: [50, 25, 10, 8, 5, 1.5, 0.5],
    high: [70, 15, 8, 4, 2, 0.8, 0.2]
  };

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  let multiplier = getResult(tables[r], weights[r]);
  if (maybeForceLoss(ctx)) multiplier = 0;

  const winnings = capPayoutByDailyLimit(user, applyEdgeToAmount(amount * multiplier, ctx));
  user.wallet += winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Resolves the risk parameter (`'low'`, `'mid'`, or `'high'`) to select the corresponding payout multipliers and probability weights tables.
- **High Risk**: Has a 70% chance of returning `0.0x` (losing the entire bet) but includes a `100.0x` jackpot path.
- **Low Risk**: Min payout is `0.5x` with a much safer weight pool distribution.
- Mutates user wallet balance and updates transaction histories.

---

## 5. How to Modify
To adjust Plinko risk multipliers or weights:
- Edit the payout table values in `core/gambling.js` (around line 2022):
  ```javascript
  const tables = {
      high: [0.0, 0.1, 0.2, 2.0, 10.0, 100.0, 500.0] // Raised high risk jackpot to 500x
  };
  ```
- Change weights to raise win probability:
  ```javascript
  const weights = {
      high: [60, 20, 10, 6, 3, 0.8, 0.2] // Reduces 0.0x chance to 60%
  };
  ```
- Prefixes, limit caps, and house edges can be customized directly in the same block.
