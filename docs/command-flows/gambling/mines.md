# Mines Command Flow (`mines`)

## 1. Description
The Mines command starts a virtual minesweeper gacha game. Players bet Zeni and pick cells on a 5x5 grid. The player can cash out at any time or continue picking safe cells to increase their multiplier. Hitting a mine results in an immediate loss.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j mines 1000 5"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "mines") (L15663)
            └── core/gambling.js
                └── startMines(senderJid, amount, mineCount, economy) (L1177)
                    └── Grid creation (L1204)
                    └── activeMinesGames.set(userId, gameSession)
                    └── user.wallet -= amount
                    └── economy.saveUser(senderJid)
                    └── reply grid/visual to WhatsApp
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
* **Line Numbers**: 15660-15708
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.startMines` or subcommands

```javascript
if (primaryCmd === "mines") {
  const action = cmdArgs[1] || "";
  if (action === "pick") {
    const cell = cmdArgs[2] || "";
    const result = gambling.minesPick(senderJid, cell, economy);
    return await reply(result.message);
  } else if (action === "out" || action === "cashout") {
    const result = gambling.minesCashOut(senderJid, economy);
    return await reply(result.message);
  } else {
    const betAmount = parseInt(action, 10);
    const mineCount = parseInt(cmdArgs[2] || "3", 10);
    const result = gambling.startMines(senderJid, betAmount, mineCount, economy);
    return await reply(result.message);
  }
}
```

#### Explanation
- Checks subcommands: `"pick"` to sweep a cell, `"out"` to cash out active multipliers, or starts a new session.

---

### Step 4: Game Initializer
* **File Path**: `core/gambling.js`
* **Line Numbers**: 1177-1242
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, mineCount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function startMines(userId, amount, mineCount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds." };

  const mines = parseInt(mineCount);
  if (isNaN(mines) || mines < 1 || mines > 20) return { success: false, message: "❌ Invalid mine count." };

  if (activeMinesGames.has(userId)) return { success: false, message: "❌ Active game exists!" };

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  const grid = new Array(25).fill(false); // false = safe
  let placed = 0;
  while (placed < mines) {
    const idx = Math.floor(Math.random() * 25);
    if (!grid[idx]) {
      grid[idx] = true;
      placed++;
    }
  }

  activeMinesGames.set(userId, { bet: amount, mineCount: mines, grid, revealed: [], multiplier: 1.0, roundCtx: ctx });
  economyModule.saveUser(userId);
}
```

#### Explanation
- Deducts the initial bet, shuffles mines across a 25-cell grid, registers the session key, and saves modifications to the database.

---

## 5. How to Modify
To adjust Mines house edge parameters:
- Locate the multiplier calculation inside `core/gambling.js` (around line 1309):
  ```javascript
  // Change 0.97 (3% house edge) to another float (e.g. 0.95 for 5% house edge)
  game.multiplier = Math.round((0.95 / prob) * 100) / 100;
  ```
- Change the max mines limit (currently 20):
  ```javascript
  if (isNaN(mines) || mines < 1 || mines > 24) { ... } // Raises limit to 24
  ```
