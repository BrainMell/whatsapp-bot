# Lotto Command Flow (`lotto`)

## 1. Description
The Lotto command allows players to buy a ticket for the lottery. If their ticket matches the winning number (1-100), they win a massive 90x jackpot.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j lotto 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "lotto") (L15539)
            └── core/gambling.js
                └── lottery(senderJid, amount, economy) (L1484)
                    └── beginGamblingRound(user)
                    └── Math.floor(Math.random() * 100) + 1 (ticket roll)
                    └── Math.floor(Math.random() * 100) + 1 (winningNum roll)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual card / result to WhatsApp
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
* **Line Numbers**: 15536-15555
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.lottery`

```javascript
if (primaryCmd === "lotto") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.lottery(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.lottery` with the parsed bet amount.

---

### Step 4: Lottery Evaluation
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1484-1568
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function lottery(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  const ticket = Math.floor(Math.random() * 100) + 1; // 1-100
  const winningNum = Math.floor(Math.random() * 100) + 1; // 1-100
  const won = ticket === winningNum && !maybeForceLoss(ctx);

  const rawGain = amount * 90;
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx)) : 0;
  
  user.wallet += winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Generates a player lottery ticket value from 1 to 100.
- Generates a target winning value from 1 to 100.
- If they match (and are not forced to lose), awards a 90x payout.
- Persists user balance changes.

---

## 5. How to Modify
To adjust Lottery odds or payouts:
- Edit the payout multiplier in `core/gambling.js` (around line 1510):
  ```javascript
  const rawGain = amount * 100; // Raised jackpot payout to 100x
  ```
- Change the ticket range size to adjust difficulty:
  ```javascript
  const ticket = Math.floor(Math.random() * 50) + 1; // Reduces range to 50 (double the win chance)
  ```
Prefixes, limits, and house edges can be customized directly in the same block.
