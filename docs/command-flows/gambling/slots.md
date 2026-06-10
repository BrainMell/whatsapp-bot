# Slots Command Flow (`slots`)

## 1. Description
The Slots command rolls a virtual slot machine with weighted emojis. Three matching symbols trigger a jackpot payout, two matching symbols yield a minor win, and no matching symbols result in a loss.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j slots 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "slots") (L4820)
            └── core/gambling.js
                └── slots(senderJid, amount, economy) (L345)
                    └── ensureGamblingProfile(user)
                    └── getSymbol() weighted draws
                    └── beginGamblingRound(user)
                    └── maybeForceLoss(ctx)
                    └── user.wallet +/-= amount
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
- Triggers command resolution if the input text starts with the prefix.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4820
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.slots`

```javascript
if (primaryCmd === "slots") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.slots(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes the call to the casino slots logic block.

---

### Step 4: Slots Evaluation and Weights Draws
* **File Path**: `core/gambling.js`
* **Line Numbers**: 345-471
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }` status object

```javascript
function slots(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first!` };
  
  if (amount < GLOBAL_MIN_BET || amount > GLOBAL_MAX_BET) {
    return { success: false, message: "❌ Invalid bet range." };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: "❌ Insufficient balance." };
  }

  const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];
  const weights = [25, 25, 20, 15, 10, 5];

  function getSymbol() {
    const total = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * total;
    for (let i = 0; i < symbols.length; i++) {
      if (random < weights[i]) return symbols[i];
      random -= weights[i];
    }
    return symbols[0];
  }

  const reel1 = getSymbol();
  const reel2 = getSymbol();
  const reel3 = getSymbol();
  const ctx = beginGamblingRound(user);

  let multiplier = 0;
  if (reel1 === reel2 && reel2 === reel3) {
    const symbolMultipliers = { '🍒': 5, '🍋': 10, '🍊': 15, '🍇': 25, '💎': 50, '7️⃣': 100 };
    multiplier = symbolMultipliers[reel1] || 5;
  } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
    multiplier = 1.2;
  }
  
  const winnings = Math.floor(amount * multiplier);
  const profit = winnings - amount;
  const won = profit > 0 && !maybeForceLoss(ctx);

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(profit, ctx));
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
- `getSymbol()` draws symbols by selecting cumulative thresholds in the `weights` array. Common symbols have much higher chances of being drawn than rare ones like `7️⃣` or `💎`.
- Checks matching combinations:
  - Three matching reels reward a jackpot using custom multipliers.
  - Two matching reels yield a `1.2x` return.
- Commits results to the database and sends the response containing visual reel alignments.

---

## 5. How to Modify
To adjust Slots payout multipliers or symbol weights:
- Edit the multipliers in `core/gambling.js` (around line 384):
  ```javascript
  // Change payout multipliers (e.g. increase 7️⃣ to 200x)
  const symbolMultipliers = {
      '7️⃣': 200
  };
  ```
- Change weights to alter match probability:
  ```javascript
  const weights = [30, 30, 15, 15, 8, 2]; // Makes 7️⃣ even rarer
  ```
