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
        // Dynamic trend shift (occasionally change direction)
        if (Math.random() < 0.1) s.trend *= -1;
        
        const variance = (Math.random() * 2 - 1) * s.volatility;
        const change = variance + s.trend;
        
        s.price = Math.max(10, Math.floor(s.price * (1 + change)));
        
        // Cap price at 1M
        if (s.price > 1000000) s.price = 1000000;
    }
}

function buyStock(userId, symbol, amount) {
    const user = economy.getUser(userId);
    const stock = STOCKS[symbol.toUpperCase()];

    if (!stock) return { success: false, message: "❌ Invalid stock symbol!" };
    // Reject non-positive, non-integer, or NaN amounts. Stocks are whole shares.
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
        return { success: false, message: "❌ Amount must be a positive whole number!" };
    }

    const cost = stock.price * amt;
    if (user.wallet < cost) return { success: false, message: `❌ Insufficient funds! Need ${economy.getZENI()}${cost.toLocaleString()}` };

    // Deduct money
    economy.removeMoney(userId, cost, `Bought ${amt} ${symbol}`);

    // Add to portfolio
    if (!user.portfolio) user.portfolio = {};
    if (!user.portfolio[symbol]) user.portfolio[symbol] = 0;
    user.portfolio[symbol] += amt;

    economy.saveUser(userId);
    return { success: true, message: `✅ Bought ${amt} shares of *${stock.name}* for ${economy.getZENI()}${cost.toLocaleString()}!` };
}

function sellStock(userId, symbol, amount) {
    const user = economy.getUser(userId);
    const stock = STOCKS[symbol.toUpperCase()];

    if (!stock) return { success: false, message: "❌ Invalid stock symbol!" };
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
        return { success: false, message: "❌ Amount must be a positive whole number!" };
    }
    if (!user.portfolio || !user.portfolio[symbol] || user.portfolio[symbol] < amt) {
        return { success: false, message: "❌ You don't have enough shares to sell!" };
    }

    const payout = stock.price * amt;

    // Remove shares
    user.portfolio[symbol] -= amt;
    if (user.portfolio[symbol] <= 0) delete user.portfolio[symbol];

    // Add money
    economy.addMoney(userId, payout, `Sold ${amt} ${symbol}`);

    economy.saveUser(userId);
    return { success: true, message: `✅ Sold ${amt} shares of *${stock.name}* for ${economy.getZENI()}${payout.toLocaleString()}!` };
}

function getPortfolio(userId) {
    const user = economy.getUser(userId);
    if (!user || !user.portfolio) return [];

    return Object.entries(user.portfolio).map(([symbol, amount]) => {
        // Defensive: a stock symbol in the user's portfolio may have been
        // removed from STOCKS in an update. Skip missing stock metadata
        // instead of crashing.
        const stock = STOCKS[symbol];
        if (!stock) {
            return {
                symbol,
                name: `${symbol} (delisted)`,
                amount,
                currentPrice: 0,
                totalValue: 0
            };
        }
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

