# Dice Command Flow (`dice`, `roll`)

## 1. Description
The Dice Roll command allows players to roll a 6-sided die against the dealer (bot). If the player rolls a higher number, they win their bet amount (minus house edge). Ties refund the bet amount.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j dice 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "dice" || primaryCmd === "roll") (L4810)
            └── core/gambling.js
                └── diceRoll(senderJid, amount, economy) (L228)
                    └── ensureGamblingProfile(user)
                    └── beginGamblingRound(user)
                    └── Luck factor check (15% chance to reduce dealer roll)
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
- Listens to incoming events and filters out offline backlog queues or key renewals.

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
- Sanitizes prefixes and splits the command body to resolve parameter structures.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4810
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.diceRoll`

```javascript
if (primaryCmd === "dice" || primaryCmd === "roll") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.diceRoll(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Resolves the dice/roll keywords, extracts the bet value, and passes control to the gambling module.

---

### Step 4: Dice Roll Game Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 228-339
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }` status object

```javascript
function diceRoll(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first!` };
  
  if (amount < GLOBAL_MIN_BET || amount > GLOBAL_MAX_BET) {
    return { success: false, message: "❌ Invalid bet range." };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: "❌ Insufficient wallet balance." };
  }

  const playerRoll = Math.floor(Math.random() * 6) + 1;
  let dealerRoll = Math.floor(Math.random() * 6) + 1;
  const ctx = beginGamblingRound(user);

  // Luck check (15% chance to reduce dealer roll)
  if (Math.random() < 0.15 && dealerRoll > 1) {
    dealerRoll--;
  }

  if (playerRoll === dealerRoll) {
    return { success: true, won: null, message: "Tie refund" };
  }

  const won = playerRoll > dealerRoll && !maybeForceLoss(ctx);

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
- Validates user registration and checks if the wallet balance can cover the bet.
- Simulates two 6-sided dice rolls (`1-6`) randomly.
- **Luck Factor Check**: Applies a 15% probability block that reduces the dealer's roll by 1 to skew odds slightly towards the player.
- Evaluates payouts, enforces forced-loss conditions, updates daily caps, and writes changes back to MongoDB.

---

## 5. How to Modify
To adjust the player luck factor or ties logic:
- Locate the luck check in `core/gambling.js` (around line 248):
  ```javascript
  // Change 0.15 to disable or raise the player roll help chance:
  if (Math.random() < 0.10 && dealerRoll > 1) { ... }
  ```
