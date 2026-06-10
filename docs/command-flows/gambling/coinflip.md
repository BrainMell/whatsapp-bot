# Coinflip Command Flow (`cf`, `flip`)

## 1. Description
The Coinflip command allows players to bet a specified amount of Zeni on Heads or Tails. The outcome is generated randomly with a built-in house edge calculation and capped by the daily profit limits.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j cf 1000 heads"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "cf" || primaryCmd === "flip") (L4801)
            └── core/gambling.js
                └── coinflip(senderJid, amount, choice, economy) (L129)
                    └── ensureGamblingProfile(user)
                    └── beginGamblingRound(user)
                    └── maybeForceLoss(ctx)
                    └── capPayoutByDailyLimit(user, payoutAmount)
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
- intercepts the incoming WebSocket payload from WhatsApp. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

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
- Validates the trigger prefix (e.g. `.j`). If found, strips it, splits the remaining string by spaces to get arguments, and extracts the primary command index.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4801
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.coinflip`

```javascript
if (primaryCmd === "cf" || primaryCmd === "flip") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const choice = cmdArgs[2] || "";
  const result = gambling.coinflip(senderJid, betAmount, choice, economy);
  return await reply(result.message);
}
```

#### Explanation
- Catches the coinflip keywords, parses the second argument as a numeric bet amount, and passes execution to `gambling.coinflip` before responding.

---

### Step 4: Coinflip Evaluation and Balance Mutations
* **File Path**: `core/gambling.js`
* **Line Numbers**: 129-222
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, choice, economyModule)`
* **Outputs**: `{ success: boolean, message: string }` status object

```javascript
function coinflip(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first!` };
  
  if (amount < GLOBAL_MIN_BET || amount > GLOBAL_MAX_BET) {
    return { success: false, message: "❌ Invalid bet range." };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: "❌ Insufficient wallet balance." };
  }
  
  const normalizedChoice = choice.toLowerCase();
  const userChoice = normalizedChoice.startsWith('h') ? 'heads' : 'tails';
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const ctx = beginGamblingRound(user);
  const won = userChoice === result && !maybeForceLoss(ctx);

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
- Compares user wallet balance and amount bounds against the global variables `GLOBAL_MIN_BET` and `GLOBAL_MAX_BET`.
- Rolls a 50/50 probability (`Math.random() < 0.5`).
- Executes `beginGamblingRound` and `maybeForceLoss` to apply house-edge scaling and daily win caps.
- Mutates the `user.wallet` value and schedules saving changes back to the database.

---

## 5. How to Modify
To adjust Coinflip payouts or alter the coin flip probability:
- Modify the probability evaluation range in `core/gambling.js`:
  ```javascript
  // Change 0.5 to another float (e.g. 0.48 to give the house a 52/48 edge natively)
  const result = Math.random() < 0.48 ? 'heads' : 'tails';
  ```
