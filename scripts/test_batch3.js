// Tests for stock market, investment, and crafting bugs.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const economy = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/economy.js');
const stockMarket = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/stockMarket.js');
const investment = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/investment.js');

function installFakeUser(overrides = {}) {
  const id = 'test' + Math.floor(Math.random() * 100000) + '@s.whatsapp.net';
  const user = {
    userId: id,
    wallet: 50000,
    bank: 0,
    registered: true,
    nickname: 'Tester',
    class: 'FIGHTER',
    adventurerRank: 'F',
    stats: { totalEarned: 50000, totalSpent: 0, gamesPlayed: 0, gamesWon: 0 },
    portfolio: {},
    investments: [],
    inventory: {},
    ...overrides,
  };
  economy.economyData.set(id, user);
  return id;
}

let tests = 0, passed = 0, failed = 0;
function test(name, fn) {
  tests++;
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}

console.log('\n=== Stock Market & Investment Tests ===\n');

test('stockMarket.buyStock: rejects non-numeric amount', () => {
  const id = installFakeUser();
  const result = stockMarket.buyStock(id, 'ARCH', 'abc');
  assert.ok(!result.success, 'should reject non-numeric amount');
});

test('stockMarket.buyStock: rejects fractional amount', () => {
  const id = installFakeUser();
  const result = stockMarket.buyStock(id, 'ARCH', 0.5);
  // We floor() the amount, so 0.5 → 0 → reject
  assert.ok(!result.success, 'should reject 0.5 (floors to 0)');
});

test('stockMarket.buyStock: rejects negative amount', () => {
  const id = installFakeUser();
  const result = stockMarket.buyStock(id, 'ARCH', -10);
  assert.ok(!result.success);
});

test('stockMarket.buyStock: rejects zero amount', () => {
  const id = installFakeUser();
  const result = stockMarket.buyStock(id, 'ARCH', 0);
  assert.ok(!result.success);
});

test('stockMarket.buyStock: success path deducts money', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = stockMarket.buyStock(id, 'ARCH', 10);
  assert.ok(result.success, 'should succeed');
  // ARCH base price is 150, 10 shares = 1500
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000 - 150 * 10);
  assert.strictEqual(user.portfolio['ARCH'], 10);
});

test('stockMarket.sellStock: rejects selling more than owned', () => {
  const id = installFakeUser({ portfolio: { ARCH: 5 } });
  const result = stockMarket.sellStock(id, 'ARCH', 10);
  assert.ok(!result.success);
});

test('stockMarket.getPortfolio: handles delisted stocks gracefully', () => {
  const id = installFakeUser({ portfolio: { ARCH: 5, DELISTED: 3 } });
  // Should not throw even though DELISTED is not in STOCKS
  const portfolio = stockMarket.getPortfolio(id);
  assert.strictEqual(portfolio.length, 2);
  const delisted = portfolio.find(p => p.symbol === 'DELISTED');
  assert.ok(delisted, 'should include delisted entry');
  assert.strictEqual(delisted.name, 'DELISTED (delisted)');
  assert.strictEqual(delisted.currentPrice, 0);
});

test('investment.startInvestment: rejects non-numeric amount (was exploit)', () => {
  const id = installFakeUser();
  // Previously: "abc" < 1000 is false (string-vs-number), so validation
  // passed, removeMoney silently failed, and the investment was recorded
  // for free. Now: explicit validation catches it.
  const result = investment.startInvestment(id, 'BOND', 'abc');
  assert.ok(!result.success, 'should reject non-numeric amount');

  const user = economy.getUser(id);
  assert.strictEqual(user.investments.length, 0, 'should not have created an investment');
});

test('investment.startInvestment: rejects amount below minimum deposit', () => {
  const id = installFakeUser();
  const result = investment.startInvestment(id, 'BOND', 500);  // BOND min is 1000
  assert.ok(!result.success);
});

test('investment.startInvestment: rejects amount > 50% of wallet', () => {
  const id = installFakeUser({ wallet: 10000 });
  // 50% of 10000 = 5000 max. Investing 5001 should fail.
  const result = investment.startInvestment(id, 'BOND', 5001);
  assert.ok(!result.success);
});

test('investment.startInvestment: success path deducts money and records investment', () => {
  const id = installFakeUser({ wallet: 10000 });
  const result = investment.startInvestment(id, 'BOND', 1000);
  assert.ok(result.success, 'should succeed: ' + (result.message || ''));
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 9000);
  assert.strictEqual(user.investments.length, 1);
  assert.strictEqual(user.investments[0].amount, 1000);
  // BOND interest is 0.05, so expected payout = 1000 * 1.05 = 1050
  assert.strictEqual(user.investments[0].expectedPayout, 1050);
});

test('investment.startInvestment: enforces max 3 active investments', () => {
  const id = installFakeUser({
    wallet: 1000000,
    investments: [
      { planId: 'BOND', amount: 1000, startTime: 0, endTime: Date.now() + 1000000, expectedPayout: 1050, risk: 0 },
      { planId: 'BOND', amount: 1000, startTime: 0, endTime: Date.now() + 1000000, expectedPayout: 1050, risk: 0 },
      { planId: 'BOND', amount: 1000, startTime: 0, endTime: Date.now() + 1000000, expectedPayout: 1050, risk: 0 },
    ]
  });
  const result = investment.startInvestment(id, 'BOND', 1000);
  assert.ok(!result.success, 'should refuse with 3 active investments');
});

console.log(`\n--- Batch 3: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
