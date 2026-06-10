# RPG Subsystem: Economy

## 1. Description
The Economy Subsystem controls all cash flow, financial operations, peer-to-peer money transfers, daily rewards, bank vaults, and shop purchases. Players earn Zeni through daily check-ins, quests, combat encounters, and mini-games. This currency is held either in the player's immediate wallet or stored in their bank account. The system reads and writes to user data objects in MongoDB, persisting balances via scheduled saves, and processes shop commands using purchase verification gates before deducting funds.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j daily"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (primaryCmd === "daily") (L4680)
            └── core/rpg/economy.js
                └── claimDaily(senderJid)
                    └── Cooldown checks (lastDaily)
                    └── user.wallet += DAILY_REWARD
                    └── scheduleSave(senderJid)
                    └── reply confirmation to WhatsApp
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
* **Inputs**: `{ messages, type }` payload from WhatsApp
* **Outputs**: None (passes control to inner map)

```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify" && type !== "append") return;
  if (isRekeying) return;

  await Promise.all(
    messages.map(async (m) => {
      if (!m.message) return;
```

#### Explanation
- `sock.ev.on("messages.upsert", ...)`: Registers a listener that fires whenever the bot receives new message notifications.
- `if (type !== "notify" && type !== "append") return`: Drops status updates or metadata modifications to only process actual incoming messages.
- `if (isRekeying) return`: Prevents processing when the session encryption keys are refreshing.
- `messages.map(...)`: Iterates over the batch of received messages to process them in parallel.

---

### Step 2: Command Matching
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Inner message processor loop
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
- `lowerTxt.startsWith(currentPrefix)`: Checks if the incoming text begins with the configured bot prefix (e.g. `.j`).
- `lowerTxt.substring(...)`: Strips the prefix from the message.
- `cmdBody.split(" ")`: Splits the command body by spaces to separate the command name from its arguments.
- `cmdArgs[0]`: Assigns the first element as `primaryCmd` (e.g. `"daily"`).

---

### Step 3: Command Routing for Daily
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4680
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `core/rpg/economy.js`
* **Inputs**: `sock`, `chatId`, `senderJid`
* **Outputs**: Promise resolved by `economy.claimDaily`

```javascript
if (primaryCmd === "daily") {
  const result = economy.claimDaily(senderJid);
  return await reply(result.message);
}
```

#### Explanation
- `if (primaryCmd === "daily")`: Matches the daily reward check command.
- `economy.claimDaily(senderJid)`: Passes execution control to the economy core module, which verifies limits and mutates local user variables.
- `reply(...)`: Sends back the return status message to WhatsApp.

---

### Step 4: Daily Reward Claim Logic
* **File Path**: `core/rpg/economy.js`
* **Line Numbers**: 779-824
* **Called From**: `core/engine.js`
* **Inputs**: `(userId)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function claimDaily(userId) {
  const user = getUser(userId);
  if (!user) return { success: false, message: "❌ Not registered." };

  const now = Date.now();
  const dayInMs = 86400000;

  if (now - user.lastDaily < dayInMs) {
    const timeLeft = dayInMs - (now - user.lastDaily);
    const hoursLeft = Math.floor(timeLeft / 3600000);
    const minsLeft = Math.floor((timeLeft % 3600000) / 60000);

    return {
      success: false,
      message: `⏰ *DAILY ALREADY CLAIMED!*\nCome back in *${hoursLeft}h ${minsLeft}m*.`
    };
  }

  user.wallet += DAILY_REWARD;
  user.lastDaily = now;
  user.stats.totalEarned += DAILY_REWARD;

  logTransaction(userId, "Daily Reward", DAILY_REWARD, user.wallet);
  scheduleSave(userId);

  return {
    success: true,
    message: `🎁 *DAILY REWARD CLAIMED!*\nReward: +${DAILY_REWARD.toLocaleString()}`
  };
}
```

#### Explanation
- `getUser(userId)`: Fetches user profile reference from the economy in-memory cache map.
- `const dayInMs = 86400000`: Defines a 24-hour limit in milliseconds.
- `if (now - user.lastDaily < dayInMs)`: Compares difference. If less than 24 hours have elapsed, calculates remaining time and yields error status.
- `user.wallet += DAILY_REWARD`: Adds configuration reward Zeni to user wallet.
- `scheduleSave(userId)`: Adds user to pending database write queues (avoids concurrent heavy operations).

---

## 4. How to Modify
To adjust daily check-in rewards, change `DAILY_REWARD` in `core/rpg/economy.js`:

```javascript
// BEFORE:
const DAILY_REWARD = 500;

// AFTER:
const DAILY_REWARD = 1000; // Raised reward to 1000 Zeni
```
