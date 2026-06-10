# Investment Command Flow (`invest`, `claim`)

## 1. Description
The Investment system allows users to purchase fixed-deposit investment plans (Bonds, Mutual Funds, Growth Shares, Venture Capitals) with custom interest yields, risk variables, and lockup periods. Users check plans using the `invest` command, buy plans using `invest <plan_name> <amount>`, and claim matured returns via `invest claim` or the shortcut `claim`.

---

## 2. Hierarchical Execution Tree

### Listing Investment Plans
```text
User sends ".j invest"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " invest") (L13853)
            └── core/rpg/investment.js
                └── INVESTMENT_PLANS iteration
            └── sock.sendMessage(chatId, { text: msg }) (L13863)
```

### Starting an Investment
```text
User sends ".j invest bond 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " invest ")) (L13867)
            └── Parse args: action (bond), amount (1000) (L13873)
            └── core/rpg/investment.js
                └── startInvestment(senderJid, planId, amount) (L14)
                    └── Fetch user, validate active count <= 3
                    └── Validate amount >= minDeposit & amount <= 50% of user wallet balance (anti-exploit)
                    └── economy.removeMoney(senderJid, amount, description)
                    └── Create investment metadata object (expected payout, endTime)
                    └── user.investments.push(investment)
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L13897)
```

### Claiming Matured Investments
```text
User sends ".j invest claim" or ".j claim"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt === prefix + " claim" || "invest claim") (L13904)
            └── core/rpg/investment.js
                └── claimInvestment(senderJid) (L65)
                    └── Filter matured investments (now >= endTime)
                    └── Process risk calculations: Math.random() < inv.risk
                    └── Success -> totalPayout += expectedPayout, economy.addMoney(totalPayout)
                    └── Default/Loss -> totalLoss += amount
                    └── user.investments = remaining active array
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L13910)
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

### Step 2: Command Matching and Route Redirection
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13851-L13920)
* **Line Numbers**: 13851-13920
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Directs execution to investment handler functions

```javascript
                  // INVESTMENT COMMANDS
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} invest`
                  ) {
                    const invest = require('./rpg/investment');
                    ...
                  }

                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} invest `,
                    )
                  ) {
                    const invest = require('./rpg/investment');
                    const parts = lowerTxt.split(" ");
                    const action = parts[2];

                    if (action?.toLowerCase() === "claim") {
                      const result = invest.claimInvestment(senderJid);
                      return sock.sendMessage(chatId, {
                        text: BOT_MARKER + result.message,
                      });
                    }

                    const amount = parseInt(parts[3]);
                    ...
                    const result = invest.startInvestment(
                      senderJid,
                      action,
                      amount,
                    );
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                    });
                    return;
                  }
```

#### Explanation
- Recognizes `.j invest` or `.j invest [plan] [amount]` or `.j invest claim` / `.j claim`.
- Imports `core/rpg/investment.js` dynamically and invokes the corresponding module handler.

---

### Step 3: Starting a Fixed Deposit Plan
* **File Path**: [core/rpg/investment.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/investment.js#L14-L56)
* **Line Numbers**: 14-56
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/investment`
* **Inputs**: `(userId, planId, amount)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function startInvestment(userId, planId, amount) {
    const user = economy.getUser(userId);
    const plan = INVESTMENT_PLANS[planId.toUpperCase()];
    
    if (!plan) return { success: false, message: "❌ Invalid investment plan!" };
    
    // ANTI-EXPLOIT: Max 3 active investments
    if (user.investments && user.investments.length >= 3) {
        return { success: false, message: "❌ You already have 3 active investments! Claim them first." };
    }

    if (amount < plan.minDeposit) return { success: false, message: `❌ Minimum deposit for this plan is ${economy.getZENI()}${plan.minDeposit.toLocaleString()}` };
    if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds in wallet!" };
    
    // ANTI-EXPLOIT: Max 50% of current Zeni
    const maxAllowed = Math.floor(user.wallet * 0.5);
    if (amount > maxAllowed) {
        return { success: false, message: `❌ Risk management: You can only invest up to 50% of your wallet (${economy.getZENI()}${maxAllowed.toLocaleString()}).` };
    }

    // Deduct money
    economy.removeMoney(userId, amount, `Invested in ${plan.name}`);
    
    // Create investment
    if (!user.investments) user.investments = [];
    
    const investment = {
        planId: planId.toUpperCase(),
        amount: amount,
        startTime: Date.now(),
        endTime: Date.now() + (plan.durationHours * 60 * 60 * 1000),
        expectedPayout: Math.floor(amount * (1 + plan.interest)),
        risk: plan.risk
    };
    
    user.investments.push(investment);
    economy.saveUser(userId);
```

#### Explanation
1. Checks that the selected plan ID exists and verifies the user doesn't already have 3 active locked plans.
2. Implements a 50% wallet ceiling check to prevent players from going "all-in" on high-risk options.
3. Deducts the cash from the user wallet.
4. Generates an investment record containing the plan details, expected payout (deposit + interest), maturity expiration date, and risk probability index.
5. Saves changes back to MongoDB.

---

### Step 4: Claiming Mature Assets
* **File Path**: [core/rpg/investment.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/investment.js#L65-L108)
* **Line Numbers**: 65-108
* **Called From**: `claimInvestment()`
* **Inputs**: `userId`
* **Outputs**: Returns results message detailing yield success and failures

```javascript
function claimInvestment(userId) {
    const user = economy.getUser(userId);
    if (!user || !user.investments || user.investments.length === 0) return { success: false, message: "❌ You have no active investments." };
    
    const now = Date.now();
    let totalPayout = 0;
    let totalLoss = 0;
    const active = [];
    const matured = [];
    
    user.investments.forEach(inv => {
        if (now >= inv.endTime) {
            // Check risk
            const roll = Math.random();
            if (roll < (inv.risk || 0)) {
                totalLoss += inv.amount;
            } else {
                totalPayout += inv.expectedPayout;
            }
            matured.push(inv);
        } else {
            active.push(inv);
        }
    });
    
    if (matured.length === 0) {
        return { success: false, message: "⏳ None of your investments have matured yet!" };
    }
    
    user.investments = active;
    let msg = `📊 *CLAIM SUMMARY*\n\n`;
    
    if (totalPayout > 0) {
        economy.addMoney(userId, totalPayout, "Matured Investment Payout");
        msg += `✅ *Success:* Received ${economy.getZENI()}${totalPayout.toLocaleString()}\n`;
    }
    
    if (totalLoss > 0) {
        msg += `❌ *Loss:* ${economy.getZENI()}${totalLoss.toLocaleString()} lost to market volatility.\n`;
    }
    
    economy.saveUser(userId);
    return { success: true, message: msg };
}
```

#### Explanation
1. Checks that the user has existing investments.
2. Iterates over active investments:
   - **Matured (`now >= inv.endTime`)**: Runs a probability risk roll. If the roll is less than the plan risk, the principal is lost. If the roll is cleared, the expected payout is accumulated.
   - **Locked**: Preserves the item in the active investments queue.
3. Decrements/overwrites `user.investments` with the active (unmatured) list.
4. Adds payout funds back to the user's wallet.
5. Saves changes to MongoDB.

---

## 4. How to Modify
To adjust investment configurations or rules:
- **Add or Modify Investment Plans**: Edit properties inside the `INVESTMENT_PLANS` dictionary in [core/rpg/investment.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/investment.js#L7-L12):
  ```javascript
  // Change VENTURE profit and risk margins
  'VENTURE': { name: 'Venture Capital', durationHours: 24, interest: 1.20, minDeposit: 50000, risk: 0.20 } // 20% risk, 120% interest (2.2x payout)
  ```
- **Adjust Active Limit (default 3)**: Change limit validation inside `startInvestment` in [core/rpg/investment.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/investment.js#L21):
  ```javascript
  if (user.investments && user.investments.length >= 5) { // Allow up to 5 concurrent plans
  ```
