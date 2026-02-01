// ============================================ 
// 🏦 INVESTMENT PROGRAMS (Fixed Deposits)
// ============================================ 

const economy = require('./economy');

const INVESTMENT_PLANS = {
    'BASIC': { name: 'Starter Fund', durationDays: 1, interest: 0.05, minDeposit: 1000 },
    'GROWTH': { name: 'Growth Bond', durationDays: 3, interest: 0.18, minDeposit: 10000 },
    'VENTURE': { name: 'Venture Capital', durationDays: 7, interest: 0.50, minDeposit: 50000 }
};

function startInvestment(userId, planId, amount) {
    const user = economy.getUser(userId);
    const plan = INVESTMENT_PLANS[planId.toUpperCase()];
    
    if (!plan) return { success: false, message: "❌ Invalid investment plan!" };
    if (amount < plan.minDeposit) return { success: false, message: `❌ Minimum deposit for this plan is ${economy.getZENI()}${plan.minDeposit.toLocaleString()}` };
    if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds in wallet!" };
    
    // Deduct money
    economy.removeMoney(userId, amount, `Invested in ${plan.name}`);
    
    // Create investment
    if (!user.investments) user.investments = [];
    
    const investment = {
        planId: planId.toUpperCase(),
        amount: amount,
        startTime: Date.now(),
        endTime: Date.now() + (plan.durationDays * 24 * 60 * 60 * 1000),
        payout: Math.floor(amount * (1 + plan.interest))
    };
    
    user.investments.push(investment);
    economy.saveUser(userId);
    
    return { 
        success: true, 
        message: `📊 **INVESTMENT STARTED!**\n\nPlan: *${plan.name}*\nDeposit: ${economy.getZENI()}${amount.toLocaleString()}\nExpected Payout: ${economy.getZENI()}${investment.payout.toLocaleString()}\nMaturity: ${new Date(investment.endTime).toLocaleDateString()}`
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
    const active = [];
    
    user.investments.forEach(inv => {
        if (now >= inv.endTime) {
            totalPayout += inv.payout;
        } else {
            active.push(inv);
        }
    });
    
    if (totalPayout === 0) {
        return { success: false, message: "⏳ None of your investments have matured yet!" };
    }
    
    user.investments = active;
    economy.addMoney(userId, totalPayout, "Matured Investment Payout");
    economy.saveUser(userId);
    
    return { success: true, message: `💰 **INVESTMENT MATURED!**\n\nYou received ${economy.getZENI()}${totalPayout.toLocaleString()} from your matured funds!` };
}

module.exports = {
    INVESTMENT_PLANS,
    startInvestment,
    claimInvestment
};

