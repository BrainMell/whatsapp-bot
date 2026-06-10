# Cups Command Flow (`cups`)

## 1. Description
The Cups command places a ball under one of three cups. The player picks a cup (1-3). Correct guesses reward a 4x payout.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j cups 1000 2"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "cups") (L15788)
            └── core/gambling.js
                └── cupGame(senderJid, amount, choice, economy) (L2251)
                    └── beginGamblingRound(user)
                    └── Math.floor(Math.random() * 3) + 1 (1-3 cup draw)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual cups layout / result to WhatsApp
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
* **Line Numbers**: 15785-15814
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.cupGame`

```javascript
if (primaryCmd === "cups") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const choice = cmdArgs[2] || "";
  const result = gambling.cupGame(senderJid, betAmount, choice, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.cupGame` with the parsed choice cup number.

---

### Step 4: Cups Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 2251-2327
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, choice, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function cupGame(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const cup = parseInt(choice);
  if (isNaN(cup) || cup < 1 || cup > 3) return { success: false, message: "❌ Choose cup 1, 2, or 3!" };

  const ctx = beginGamblingRound(user);
  const ball = Math.floor(Math.random() * 3) + 1; // ball position
  const won = cup === ball && !maybeForceLoss(ctx);

  const rawPayout = amount * 4;
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(rawPayout, ctx)) : 0;
  
  user.wallet = user.wallet - amount + winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Asserts that the choice is between 1, 2, or 3.
- Rolls a position index from 1 to 3 representing the ball.
- Evaluates winning matches (and forces losses if limits are hit).
- Deducts wagers, awards payouts, updates stats, and writes back to MongoDB.

---

## 5. How to Modify
To adjust Cups payout multipliers or count:
- Edit the payout multiplier in `core/gambling.js` (around line 2270):
  ```javascript
  const rawPayout = amount * 3; // Reduced payout to 3x (breaks even with odds)
  ```
- Change the cups count limit (e.g. 4 cups):
  ```javascript
  if (isNaN(cup) || cup < 1 || cup > 4) { ... } // Adjust range
  const ball = Math.floor(Math.random() * 4) + 1; // Adjust rolls
  ```
Prefixes, limits, and house edges can be customized directly in the same block.
