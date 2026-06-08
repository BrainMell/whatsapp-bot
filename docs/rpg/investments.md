# RPG Subsystem: Investments, Stocks, & Loans

## What it is
The Investment, Stock, and Loan subsystem provides users with mechanisms to accumulate and manage wealth through passive and interactive financial tools. Players can enter fixed-deposit investment plans with varying risk profiles, trade virtual stock tickers affected by dynamic price trend variations, or engage in peer-to-peer (P2P) lending. P2P loans require borrower consent and enforce dynamic repayment deadlines. If a borrower defaults, they are flagged as blocked from participating in the economy, and system automation registers default lock durations in the database until debts are fully settled or the penalty expires.

## How it works

**Fixed Deposit Investment Start** — [investment.js L14–56](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/investment.js#L14-L56)
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
    
    return { 
        success: true, 
        message: `📊 *INVESTMENT STARTED!*\n\nPlan: *${plan.name}*\nDeposit: ${economy.getZENI()}${amount.toLocaleString()}\nExpected Payout: ${economy.getZENI()}${investment.expectedPayout.toLocaleString()}\nMaturity: ${new Date(investment.endTime).toLocaleString()}`
    };
}
```
This function initiates fixed-term investments for players. It validates user requests against predefined investment plans, checks that the player has fewer than 3 active investments, and enforces a risk limit prohibiting users from dedicating more than 50% of their current wallet to a single plan. Money is deducted from the wallet via the `economy` module, and an investment record is pushed to the user's document in the DB.

---

**Stock Price Simulation Update** — [stockMarket.js L19–33](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/stockMarket.js#L19-L33)
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
This function iterates through all active stock listings to simulate market ticks. The trend direction shifts randomly (10% probability), after which price adjustments are calculated based on volatility and current trend vectors. Shares are constrained between a minimum value of 10 Zeni and a maximum cap of 1,000,000 Zeni.

---

**Loan Default Block Check** — [loans.js L81–91](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/loans.js#L81-L91)
```javascript
function isLoanBlocked(userId) {
  if (!loanBlocks.has(userId)) return false;
  
  const unblockTime = loanBlocks.get(userId);
  if (Date.now() > unblockTime) {
    loanBlocks.delete(userId);
    syncLoanBlocks();
    return false;
  }
  return true;
}
```
This utility determines whether a player is restricted from participating in the economy due to defaulted loans. If the player's ID is registered in the `loanBlocks` map and the current timestamp exceeds the unblock duration, the block is cleared, and the updated block state is synced with MongoDB via the `System` model collection.

## How to modify it

### Adjusting Investment Plan Parameters
To change durations, interest rates, or risk thresholds of default plans, modify the `INVESTMENT_PLANS` dictionary in `core/investment.js`.

**Before (core/investment.js L7–12):**
```javascript
const INVESTMENT_PLANS = {
    'BOND': { name: 'Low-Risk Bond', durationHours: 2, interest: 0.05, minDeposit: 1000, risk: 0 },
    'FUND': { name: 'Balanced Fund', durationHours: 6, interest: 0.15, minDeposit: 5000, risk: 0.02 },
    'GROWTH': { name: 'High-Growth', durationHours: 12, interest: 0.35, minDeposit: 10000, risk: 0.05 },
    'VENTURE': { name: 'Venture Capital', durationHours: 24, interest: 0.80, minDeposit: 25000, risk: 0.12 } // 12% chance of total loss
};
```

**After (core/investment.js L7–12):**
```javascript
const INVESTMENT_PLANS = {
    'BOND': { name: 'Low-Risk Bond', durationHours: 2, interest: 0.08, minDeposit: 1000, risk: 0 }, // Increased interest yield
    'FUND': { name: 'Balanced Fund', durationHours: 6, interest: 0.15, minDeposit: 5000, risk: 0.02 },
    'GROWTH': { name: 'High-Growth', durationHours: 12, interest: 0.35, minDeposit: 10000, risk: 0.05 },
    'VENTURE': { name: 'Venture Capital', durationHours: 48, interest: 1.50, minDeposit: 50000, risk: 0.20 } // Adjusted duration, payout and risk
};
```

### Adding New Stock Tickers
To add or adjust the volatility and initial price profiles of available stocks, modify the `STOCKS` configuration in `core/stockMarket.js`.

**Before (core/stockMarket.js L7–13):**
```javascript
const STOCKS = {
    'ARCH': { name: 'Architect Solutions', price: 150, volatility: 0.05, trend: 0.01 },
    'CHAS': { name: 'Chaos Energy', price: 80, volatility: 0.15, trend: -0.02 },
    'GUIL': { name: 'Guild Logistics', price: 200, volatility: 0.03, trend: 0.05 },
    'VOID': { name: 'Void Mining Co.', price: 500, volatility: 0.20, trend: 0.10 },
    'ZENI': { name: 'Zeni Central Bank', price: 100, volatility: 0.01, trend: 0.02 }
};
```

**After (core/stockMarket.js L7–13):**
```javascript
const STOCKS = {
    'ARCH': { name: 'Architect Solutions', price: 150, volatility: 0.05, trend: 0.01 },
    'CHAS': { name: 'Chaos Energy', price: 80, volatility: 0.15, trend: -0.02 },
    'GUIL': { name: 'Guild Logistics', price: 200, volatility: 0.03, trend: 0.05 },
    'VOID': { name: 'Void Mining Co.', price: 500, volatility: 0.20, trend: 0.10 },
    'ZENI': { name: 'Zeni Central Bank', price: 100, volatility: 0.01, trend: 0.02 },
    'NEWT': { name: 'New Tech Corp', price: 250, volatility: 0.12, trend: 0.04 } // New ticker added
};
```

## Common tasks
- **Modify max active investments limit** — Change the numeric check for active investments allowed per user in [investment.js L21](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/investment.js#L21).
- **Change risk management wallet limit** — Edit the percentage multiplier defining the maximum investment cap relative to wallet size in [investment.js L29](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/investment.js#L29).
- **Alter stock trend reversal rates** — Modify the likelihood of stock trend direction changes during market simulation ticks in [stockMarket.js L23](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/stockMarket.js#L23).
- **Adjust the minimum price bounds of stocks** — Tweak the floor value limit in [stockMarket.js L28](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/stockMarket.js#L28).
- **Edit pending loan request lifetime** — Modify the time window allowed for lenders to accept loan proposals in [loans.js L152](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/loans.js#L152).
- **Tune borrower block duration check** — Adjust database synchronization checks for loan block status updates in [loans.js L81](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/loans.js#L81).
