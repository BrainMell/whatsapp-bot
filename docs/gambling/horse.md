# Horse Command Flow (`horse`)

## 1. Description
The Horse command places a bet on one of 5 running horses (H1 to H5). Winning selections pay out 6x Zeni.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j horse 1000 3"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "horse") (L15510)
            └── core/gambling.js
                └── horseRace(senderJid, amount, horseNum, economy) (L1392)
                    └── beginGamblingRound(user)
                    └── Math.floor(Math.random() * 5) + 1 (winner roll)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply tracks layout / result to WhatsApp
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
- Intercepts incoming event payloads.

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
- Resolves command prefix.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: 15507-15533
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.horseRace`

```javascript
if (primaryCmd === "horse") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const horseNum = cmdArgs[2] || "";
  const result = gambling.horseRace(senderJid, betAmount, horseNum, economy);
  return await reply(result.message);
}
```

#### Explanation
- Extracts parameters representing bet amount and choice horse (1-5), then calls the gambling controller.

---

### Step 4: Horse Race Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1392-1478
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, horseNum, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function horseRace(userId, amount, horseNum, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const horse = parseInt(horseNum);
  if (isNaN(horse) || horse < 1 || horse > 5) return { success: false, message: "❌ Choose horse 1-5!" };

  const winner = Math.floor(Math.random() * 5) + 1; // rolls winner
  const ctx = beginGamblingRound(user);
  const won = horse === winner && !maybeForceLoss(ctx);

  const rawGain = amount * 6;
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx)) : 0;

  user.wallet = user.wallet - amount + winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Validates the select horse parameter is an integer from 1 to 5.
- Rolls a number from 1 to 5 indicating the winner.
- Checks outcomes, applies edge reductions and caps, modifies wallets, and persists changes.

---

## 5. How to Modify
To adjust horse counts or payouts:
- Edit the payout multiplier in `core/gambling.js` (around line 1420):
  ```javascript
  const rawGain = amount * 5; // Reduced win payout to 5x Zeni
  ```
- Change the horse count (e.g. 8 horses):
  ```javascript
  if (isNaN(horse) || horse < 1 || horse > 8) { ... }
  const winner = Math.floor(Math.random() * 8) + 1;
  ```
Prefixes, limits, and house edges can be customized directly in the same block.
