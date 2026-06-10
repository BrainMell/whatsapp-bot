# Stock Market Command Flow (`stocks`, `market`)

## 1. Description
The Stock Market system allows users to view stock prices, buy shares, sell shares, and view their stock portfolios. Five core companies are simulated with volatile prices updated dynamically over time.

---

## 2. Hierarchical Execution Tree

### Listing Stocks
```text
User sends ".j stocks" or ".j market"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " stocks" || "market") (L13924)
            └── core/rpg/stockMarket.js
                └── STOCKS constants iteration
            └── sock.sendMessage(chatId, { text: msg }) (L13937)
```

### Viewing Stock Portfolio
```text
User sends ".j stocks portfolio" or ".j stocks me"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " stocks ")) (L13941)
            └── Parse action: "portfolio" (L13947)
            └── core/rpg/stockMarket.js
                └── getPortfolio(senderJid) (L79)
                    └── Map shares in user.portfolio against STOCKS prices
            └── Formatting: Map shares details and total portfolio valuation
            └── sock.sendMessage(chatId, { text: msg }) (L13964)
```

### Buying Stocks
```text
User sends ".j stocks buy ARCH 10"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " stocks ")) (L13941)
            └── Parse args: action (buy), symbol (ARCH), amount (10) (L13969-L13970)
            └── core/rpg/stockMarket.js
                └── buyStock(senderJid, "ARCH", 10) (L35)
                    └── Fetch user, validate cost <= user.wallet
                    └── economy.removeMoney(senderJid, cost, description)
                    └── user.portfolio["ARCH"] += 10
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L13986)
```

### Selling Stocks
```text
User sends ".j stocks sell ARCH 10"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " stocks ")) (L13941)
            └── Parse args: action (sell), symbol (ARCH), amount (10) (L13969-L13970)
            └── core/rpg/stockMarket.js
                └── sellStock(senderJid, "ARCH", 10) (L57)
                    └── Fetch user, validate portfolio shares >= 10
                    └── Calculate payout = ARCH.price * 10
                    └── user.portfolio["ARCH"] -= 10
                    └── economy.addMoney(senderJid, payout, description)
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L13995)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
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
- Listens to incoming messages from Baileys. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13923-L13945)
* **Line Numbers**: 13923-13945
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Redirects to stock market actions (Buy, Sell, Portfolio, List)

```javascript
                  // STOCK MARKET COMMANDS
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} stocks` ||
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} market`
                  ) {
                    let msg = `📈 *GLOBAL STOCK MARKET* 📈\n\n`;
                    for (const [symbol, stock] of Object.entries(
                      stockMarket.STOCKS,
                    )) {
                      msg += `• *${stock.name}* (\`${symbol}\`)\n  Price: ${economy.getZENI()}${stock.price.toLocaleString()}\n\n`;
                    }
                    ...
                    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
                    return;
                  }

                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} stocks `,
                    )
                  ) {
                    const parts = lowerTxt.split(" ");
                    const action = parts[2]?.toLowerCase();
                    ...
```

#### Explanation
- Recognizes stock market commands. If listing, loops through the in-memory `stockMarket.STOCKS` object to render prices and ticks.

---

### Step 3: Buy / Sell Transactions
* **File Path**: [core/rpg/stockMarket.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/stockMarket.js#L35-L77)
* **Line Numbers**: 35-77
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/stockMarket`
* **Inputs**: `(userId, symbol, amount)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function buyStock(userId, symbol, amount) {
    const user = economy.getUser(userId);
    const stock = STOCKS[symbol.toUpperCase()];
    
    if (!stock) return { success: false, message: "❌ Invalid stock symbol!" };
    if (amount <= 0) return { success: false, message: "❌ Amount must be positive!" };
    
    const cost = stock.price * amount;
    if (user.wallet < cost) return { success: false, message: `❌ Insufficient funds! Need ${economy.getZENI()}${cost.toLocaleString()}` };
    
    // Deduct money
    economy.removeMoney(userId, cost, `Bought ${amount} ${symbol}`);
    
    // Add to portfolio
    if (!user.portfolio) user.portfolio = {};
    if (!user.portfolio[symbol]) user.portfolio[symbol] = 0;
    user.portfolio[symbol] += amount;
    
    economy.saveUser(userId);
    return { success: true, message: `✅ Bought ${amount} shares of *${stock.name}* for ${economy.getZENI()}${cost.toLocaleString()}!` };
}
```

#### Explanation
- **Buy Shares**:
  - Validates stock symbol availability.
  - Multiplies company stock price by quantity to calculate the checkout cost.
  - Verifies the user has enough money, deducts wallet balance, updates the user's `portfolio` object, and saves user settings to MongoDB.
- **Sell Shares**:
  - Validates the user owns enough shares.
  - Multiplies company stock price by quantity to calculate the payout sum.
  - Subtracts shares from the user's `portfolio` (deletes key if shares drop to 0), deposits wallet cash, and saves user settings to MongoDB.

---

### Step 4: Price Ticking (Background Price Shifts)
* **File Path**: [core/rpg/stockMarket.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/stockMarket.js#L19-L33)
* **Line Numbers**: 19-33
* **Called From**: System price updater interval (configured in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js))
* **Inputs**: None
* **Outputs**: Mutated in-memory stock prices

```javascript
function updatePrices() {
    for (const symbol in STOCKS) {
        const s = STOCKS[symbol];
        // Dynamic trend shift (occasionally change direction)
        if (Math.random() < 0.1) s.trend *= -1;
        
        const variance = (Math.random() * 2 - 1) * s.volatility;
        const change = variance + s.trend;
        
        s.price = Math.max(10, Math.floor(s.price * (1 + change)));
        
        // Cap price at 1M
        if (s.price > 1000000) s.price = 1000000;
    }
}
```

#### Explanation
- Updates stock market rates periodically:
  - Generates price movements by combining standard market trends (`s.trend`) and random volatility factors (`s.volatility`).
  - Has a 10% chance of reversing the current upward/downward stock trend completely.
  - Capped between 10 Zeni minimum and 1,000,000 Zeni maximum.

---

## 5. How to Modify
To adjust stocks configurations:
- **Add New Stocks / Adjust Volatility**: Add new keys to the `STOCKS` dictionary in [core/rpg/stockMarket.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/stockMarket.js#L7-L13):
  ```javascript
  // Add a new speculative crypto asset with huge volatility
  'JOKE': { name: 'Joker Coin', price: 10, volatility: 0.50, trend: 0.05 }
  ```
- **Adjust Price Update Period**: Change the stock updates tick frequency in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js).
