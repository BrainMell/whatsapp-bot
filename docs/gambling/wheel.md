# Wheel Command Flow (`wheel`)

## 1. Description
The Wheel command spins a wheel of fortune with weighted multiplier slices (`0x`, `0.2x`, `0.5x`, `1.2x`, `1.5x`, `2x`, `5x`, `10x`).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j wheel 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "wheel") (L15820)
            └── core/gambling.js
                └── wheelOfFortune(senderJid, amount, economy) (L2333)
                    └── beginGamblingRound(user)
                    └── spin() weighted index random (L2348)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual wheel slice / result to WhatsApp
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
* **Line Numbers**: 15816-15842
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.wheelOfFortune`

```javascript
if (primaryCmd === "wheel") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const result = gambling.wheelOfFortune(senderJid, betAmount, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.wheelOfFortune` with the parsed bet amount.

---

### Step 4: Wheel of Fortune Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 2333-2415
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function wheelOfFortune(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const segments = [0, 0.2, 0.5, 1.2, 1.5, 2, 5, 10];
  const weights = [35, 20, 15, 12, 10, 5, 2, 1];

  function spin() {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    for (let i = 0; i < segments.length; i++) {
      if (rand < weights[i]) return segments[i];
      rand -= weights[i];
    }
    return segments[0];
  }

  const ctx = beginGamblingRound(user);
  let multiplier = spin();
  if (maybeForceLoss(ctx)) multiplier = 0;

  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(amount * multiplier, ctx)) : 0;
  user.wallet = user.wallet - amount + winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- `spin()` draws slices by selecting cumulative thresholds in the `weights` array. Common low multipliers have higher chances of being drawn, while `10x` is restricted to `1%` odds.
- Evaluates payouts, checks daily profit limits, and writes changes back to MongoDB.

---

## 5. How to Modify
To adjust Wheel multipliers or weights:
- Edit the payout table values in `core/gambling.js` (around line 2345):
  ```javascript
  const segments = [0, 0.2, 0.5, 1.2, 2, 5, 20]; // Changed 10x to 20x jackpot
  ```
- Change weights to raise win probability:
  ```javascript
  const weights = [30, 20, 15, 15, 10, 8, 2]; // Decreased 0x odds to 30%
  ```
Prefixes, limits, and house edges can be customized directly in the same block.
