// ============================================ 
// 🏦 INVESTMENT PROGRAMS (Fixed Deposits)
// ============================================ 

const economy = require('./economy');

const INVESTMENT_PLANS = {
    'BOND': { name: 'Low-Risk Bond', durationDays: 1, interest: 0.05, minDeposit: 1000, risk: 0 },
    'FUND': { name: 'Balanced Fund', durationDays: 3, interest: 0.15, minDeposit: 5000, risk: 0.05 },
    'GROWTH': { name: 'High-Growth', durationDays: 7, interest: 0.35, minDeposit: 10000, risk: 0.10 },
    'VENTURE': { name: 'Venture Capital', durationDays: 14, interest: 0.80, minDeposit: 25000, risk: 0.20 } // 20% chance of total loss
};

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
        endTime: Date.now() + (plan.durationDays * 24 * 60 * 60 * 1000),
        expectedPayout: Math.floor(amount * (1 + plan.interest)),
        risk: plan.risk
    };
    
    user.investments.push(investment);
    economy.saveUser(userId);
    
    return { 
        success: true, 
        message: `📊 *INVESTMENT STARTED!*\n\nPlan: *${plan.name}*\nDeposit: ${economy.getZENI()}${amount.toLocaleString()}\nExpected Payout: ${economy.getZENI()}${investment.expectedPayout.toLocaleString()}\nMaturity: ${new Date(investment.endTime).toLocaleDateString()}`
    };
}

function processMaturedInvestments() {
    const now = Date.now();
    const results = [];
    // This logic usually runs in a cron/interval
    // For now, let's provide a function that a user can call to 'claim'
}

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

module.exports = {
    INVESTMENT_PLANS,
    startInvestment,
    claimInvestment
};

