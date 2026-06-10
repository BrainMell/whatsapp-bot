# Scratch Command Flow (`scratch`)

## 1. Description
The Scratch command buys a virtual scratch card. The player must match 3 identical symbols in a 3x3 grid to win a payout corresponding to the matching symbol's multiplier.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j scratch 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "scratch") (L15758)
            └── core/gambling.js
                └── scratchCard(senderJid, amount, economy) (L2138)
                    └── beginGamblingRound(user)
                    └── Draw 9 symbols randomly (L2154)
                    └── check counts for 3x matching winning symbols
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual grid / outcome to WhatsApp
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
* **Line Numbers**: 15755-15777
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.scratchCard`

```javascript
if (primaryCmd === "scratch") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.scratchCard(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.scratchCard` with the parsed bet amount.

---

### Step 4: Scratch Card Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 2138-2246
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function scratchCard(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  // Balanced symbol pools
  const winningSymbols = ['💎', '7️⃣', '🍀', '🔔', '🍒', '🍋'];
  const fillerSymbols = ['🍎', '🍊', '🍇', '🍉', '🍓', '🥑', '🍌', '🍍', '🥥', '🥭', '🥝', '🌽', '🥕', '🍆'];
  const symbols = [...winningSymbols, ...fillerSymbols];

  // Draw 9 random slots
  const card = [];
  for (let i = 0; i < 9; i++) {
    card.push(symbols[Math.floor(Math.random() * symbols.length)]);
  }

  // Count occurrences
  const counts = {};
  card.forEach(s => counts[s] = (counts[s] || 0) + 1);

  // Check 3 matches
  let winner = null;
  for (const s of winningSymbols) {
    if (counts[s] >= 3) {
      winner = s;
      break;
    }
  }

  if (maybeForceLoss(ctx)) winner = null;

  let multiplier = 0;
  if (winner) {
    const symbolMultipliers = { '💎': 50, '7️⃣': 15, '🍀': 8, '🔔': 4, '🍒': 2.5, '🍋': 1.5 };
    multiplier = symbolMultipliers[winner] || 1.1;
  }

  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * multiplier, ctx)) : 0;
  user.wallet += winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Draws 9 symbols at random from a mixed array of winning symbols and filler symbols.
- Counts occurrences of each symbol. If a winning symbol appears 3 or more times, the player wins the corresponding multiplier payout.
- Evaluates forced loss, daily limits, and persists the player wallet changes.

---

## 5. How to Modify
To adjust Scratch Card multipliers or symbols:
- Edit the payout table values in `core/gambling.js` (around line 2182):
  ```javascript
  const symbolMultipliers = {
      '💎': 100, // Raised diamond match payout to 100x
      '7️⃣': 25
  };
  ```
- Adjust winning symbol ratios:
  ```javascript
  const winningSymbols = ['💎', '7️⃣', '🍀']; // Reduces winning symbols options to raise difficulty
  ```
Prefixes, limits, and house edge variables are fully configurable.
