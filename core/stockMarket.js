// ============================================
// 📈 STOCK MARKET SYSTEM (V2 - Trading)
// ============================================

const economy = require('./economy');

const STOCKS = {
    'ARCH': { name: 'Architect Solutions', price: 150, volatility: 0.05, trend: 0.01 },
    'CHAS': { name: 'Chaos Energy', price: 80, volatility: 0.15, trend: -0.02 },
    'GUIL': { name: 'Guild Logistics', price: 200, volatility: 0.03, trend: 0.05 },
    'VOID': { name: 'Void Mining Co.', price: 500, volatility: 0.20, trend: 0.10 },
    'ZENI': { name: 'Zeni Central Bank', price: 100, volatility: 0.01, trend: 0.02 }
};

function getMarketCap() {
    return Object.values(STOCKS).reduce((sum, s) => sum + (s.price * 100000), 0);
}

function updatePrices() {
    for (const symbol in STOCKS) {
        const s = STOCKS[symbol];
        const change = (Math.random() * 2 - 1) * s.volatility + s.trend;
        s.price = Math.max(1, Math.floor(s.price * (1 + change)));
    }
}

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

function sellStock(userId, symbol, amount) {
    const user = economy.getUser(userId);
    const stock = STOCKS[symbol.toUpperCase()];
    
    if (!stock) return { success: false, message: "❌ Invalid stock symbol!" };
    if (!user.portfolio || !user.portfolio[symbol] || user.portfolio[symbol] < amount) {
        return { success: false, message: "❌ You don't have enough shares to sell!" };
    }
    
    const payout = stock.price * amount;
    
    // Remove shares
    user.portfolio[symbol] -= amount;
    if (user.portfolio[symbol] <= 0) delete user.portfolio[symbol];
    
    // Add money
    economy.addMoney(userId, payout, `Sold ${amount} ${symbol}`);
    
    economy.saveUser(userId);
    return { success: true, message: `✅ Sold ${amount} shares of *${stock.name}* for ${economy.getZENI()}${payout.toLocaleString()}!` };
}

function getPortfolio(userId) {
    const user = economy.getUser(userId);
    if (!user || !user.portfolio) return [];
    
    return Object.entries(user.portfolio).map(([symbol, amount]) => {
        const stock = STOCKS[symbol];
        return {
            symbol,
            name: stock.name,
            amount,
            currentPrice: stock.price,
            totalValue: stock.price * amount
        };
    });
}

module.exports = {
    STOCKS,
    getMarketCap,
    updatePrices,
    buyStock,
    sellStock,
    getPortfolio
};

