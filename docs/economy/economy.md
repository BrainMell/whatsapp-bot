# Economy Command Flow (`economy`)

## 1. Description
The Economy command aggregates the wallet and bank balances of all registered users to produce global financial statistics, market capitalizations, loan indices, and wealth inequality metrics (Gini-like shares for the Top 1% and Top 10%).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j economy"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " economy") (L13788)
            └── core/rpg/economy.js
                └── getGlobalEconomyStats() (L1125)
                    └── Read all users from economyData Map
                    └── Sum wallet, bank, frozen assets
                    └── Count premium/diamond members based on rank (S, SS, SSS)
                    └── Sort users to find richest user and Top 1% / Top 10% shares
            └── core/rpg/loans.js
                └── getTotalDebt() (L98)
                    └── Sum totalRepayment for all activeLoans
            └── core/rpg/stockMarket.js
                └── getMarketCap()
            └── Formatting: Map metrics into global dashboard template
            └── sock.sendMessage(chatId, { text: msg }) (L13816)
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

### Step 2: Command Matching
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13787-L13790)
* **Line Numbers**: 13787-13790
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Redirects to global statistics resolver

```javascript
                  if (
                    lowerTxt ===
                    `${botConfig.getPrefix().toLowerCase()} economy`
                  ) {
```

#### Explanation
- Identifies the `.j economy` command trigger.

---

### Step 3: Resolving Global Stats
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L1125-L1171)
* **Line Numbers**: 1125-1171
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: None
* **Outputs**: Aggregated JSON metrics containing user totals, averages, memberships, and shares

```javascript
function getGlobalEconomyStats() {
  const users = Array.from(economyData.values());
  const totalUsers = users.length;
  
  let totalWallet = 0;
  let totalBank = 0;
  let totalFrozen = 0;
  let premiumMembers = 0;
  let diamondMembers = 0;
  
  users.forEach(u => {
    totalWallet += (u.wallet || 0);
    totalBank += (u.bank || 0);
    totalFrozen += (u.frozenAssets?.wallet || 0) + (u.frozenAssets?.bank || 0);
    
    if (u.adventurerRank === 'S' || u.adventurerRank === 'SS') premiumMembers++;
    if (u.adventurerRank === 'SSS') diamondMembers++;
  });

  const totalWealth = totalWallet + totalBank;
  const avgWealth = totalUsers > 0 ? Math.floor(totalWealth / totalUsers) : 0;
  
  const sorted = [...users].sort((a, b) => ((b.wallet||0)+(b.bank||0)) - ((a.wallet||0)+(a.bank||0)));
  const richest = sorted[0];
  
  const top1Count = Math.max(1, Math.ceil(totalUsers * 0.01));
  const top1Wealth = sorted.slice(0, top1Count).reduce((s, u) => s + (u.wallet||0) + (u.bank||0), 0);
  const top1Share = totalWealth > 0 ? (top1Wealth / totalWealth * 100).toFixed(1) : 0;

  const top10Count = Math.max(1, Math.ceil(totalUsers * 0.1));
  const top10Wealth = sorted.slice(0, top10Count).reduce((s, u) => s + (u.wallet||0) + (u.bank||0), 0);
  const top10Share = totalWealth > 0 ? (top10Wealth / totalWealth * 100).toFixed(1) : 0;

  return {
    totalUsers, totalWealth, totalWallet, totalBank, totalFrozen,
    premiumMembers, diamondMembers, avgWealth, top1Share, top10Share,
    richest: richest ? { name: richest.nickname, amount: (richest.wallet||0)+(richest.bank||0) } : null
  };
}
```

#### Explanation
- Reads all loaded users from memory cache.
- Aggregates wallet cash, savings deposits, and jailed/defaulted frozen capital.
- Flags membership metrics based on player's adventurer ranks (`S`, `SS` count as Premium; `SSS` counts as Diamond).
- Calculates the Gini index proxy (Top 1% and Top 10% total holdings versus global sum).
- Finds the richest player in the cache.

---

### Step 4: Resolving Loans Debt and Stocks Valuation
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13791-L13817)
* **Line Numbers**: 13791-13817
* **Called From**: `engine.js`
* **Imported From**: [core/rpg/loans.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/loans.js) & [core/rpg/stockMarket.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/stockMarket.js)
* **Inputs**: Global aggregates
* **Outputs**: Dispatches summary overview to WhatsApp group

```javascript
                     const stats = economy.getGlobalEconomyStats();
                     const loans = require('./rpg/loans');
                     const stockMarket = require('./rpg/stockMarket');
                     const totalDebt = loans.getTotalDebt();
                     const marketCap = stockMarket.getMarketCap();

                     let msg = `📊 *Global Economy Statistics*\n`;
                     msg += `​Total Users: ${stats.totalUsers}\n`;
                     msg += `​Total Wealth: ${stats.totalWealth.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​In Wallets: ${stats.totalWallet.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​In Banks: ${stats.totalBank.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​Premium Members: ${stats.premiumMembers}\n`;
                     msg += `​Diamond Members: ${stats.diamondMembers}\n`;
                     msg += `​Active Businesses: 0\n`;
                     msg += `​Outstanding Loan Debt: ${totalDebt.toLocaleString()} ${economy.getZENI()}\n\n`;

                     msg += `​🔍 *Deep Insights*\n`;
                     msg += `​Avg Wealth: ${stats.avgWealth.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​Frozen Assets: ${stats.totalFrozen.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​Market Cap (Stocks): ${marketCap.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​Business Valuation: 0 ${economy.getZENI()}\n`;
                     msg += `​Wealth Share (Top 1%): ${stats.top1Share}%\n`;
                     msg += `​Wealth Share (Top 10%): ${stats.top10Share}%\n`;
                     msg += `​Richest User: ${stats.richest ? `${stats.richest.name} with ${stats.richest.amount.toLocaleString()} ${economy.getZENI()}` : "None"}\n`;

                     await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
```

#### Explanation
- Assembles total debt by querying active loans.
- Resolves stock market cap value by invoking stockMarket controller.
- Constructs and logs the dashboard response to WhatsApp.

---

## 4. How to Modify
To adjust criteria:
- **Change Premium Membership Definitions**: Adjust the rank checks inside [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L1140):
  ```javascript
  // Treat rank 'A' and above as premium members
  if (['A', 'S', 'SS'].includes(u.adventurerRank)) premiumMembers++;
  ```
