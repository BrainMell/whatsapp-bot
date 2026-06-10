# Blackjack Command Flow (`bj`)

## 1. Description
The Blackjack command operates a full virtual card game of 21. Players can start a match by placing a bet, then request cards via `bj hit` or maintain their hand value with `bj stand`.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j bj 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "bj") (L4825)
            └── core/gambling.js
                └── startBlackjack(senderJid, amount, economy) (L531)
                    └── deck creation & shuffling (L477)
                    └── Deal two cards to player and dealer
                    └── calculateHandValue (L502)
                    └── check for natural blackjack (21)
                    └── activeBlackjackGames.set(userId, gameSession)
                    └── user.wallet -= amount
                    └── economy.saveUser(senderJid)
                    └── reply layout/cards to WhatsApp
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
* **Line Numbers**: Around 4825
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.startBlackjack` or subcommands

```javascript
if (primaryCmd === "bj") {
  const action = cmdArgs[1] || "";
  if (action === "hit") {
    const result = gambling.blackjackHit(senderJid, economy);
    return await reply(result.message);
  } else if (action === "stand") {
    const result = gambling.blackjackStand(senderJid, economy);
    return await reply(result.message);
  } else {
    const betAmount = parseInt(action, 10);
    const result = gambling.startBlackjack(senderJid, betAmount, economy);
    return await reply(result.message);
  }
}
```

#### Explanation
- Identifies if the subcommand is `"hit"`, `"stand"`, or a numeric bet to initialize a new game.

---

### Step 4: Game Initialization
* **File Path**: `core/gambling.js`
* **Line Numbers**: 531-600
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function startBlackjack(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds." };
  
  if (activeBlackjackGames.has(userId)) {
    return { success: false, message: "❌ Active game already exists!" };
  }
  
  user.wallet -= amount;
  const ctx = beginGamblingRound(user);
  
  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  
  const playerValue = calculateHandValue(playerHand);
  
  if (playerValue === 21) {
    // Natural Blackjack payout
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount * 2.5, ctx));
    user.wallet += gain;
    economyModule.saveUser(userId);
    return { success: true, won: true, message: "Natural Blackjack payout message" };
  }
  
  activeBlackjackGames.set(userId, {
    deck,
    playerHand,
    dealerHand,
    bet: amount,
    ctx
  });
  
  economyModule.saveUser(userId);
  return { success: true, message: "Display current hands" };
}
```

#### Explanation
- Deducts the initial bet amount from the wallet.
- Generates a full card deck and shuffles it.
- Deals 2 cards to the player and 2 cards to the dealer (with one hidden).
- Evaluates hand values. If the player rolls a natural 21 (Ace + Face card), returns a 3:2 payout (`amount * 2.5`). Otherwise, registers the session key map inside `activeBlackjackGames`.

---

## 5. How to Modify
To adjust blackjack dealer behavior or payout rules:
- Edit natural blackjack payout multiplier in `core/gambling.js` (around line 562):
  ```javascript
  // Change 2.5x to 2.0x or another ratio:
  const rawPayout = Math.floor(amount * 2.0);
  ```
