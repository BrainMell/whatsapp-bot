// Tests for deposit/withdraw input validation.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const economy = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/economy.js');

function installFakeUser(overrides = {}) {
  const id = 'test' + Math.floor(Math.random() * 100000) + '@s.whatsapp.net';
  const user = {
    userId: id,
    wallet: 10000,
    bank: 5000,
    registered: true,
    nickname: 'Tester',
    class: 'FIGHTER',
    adventurerRank: 'F',
    stats: { totalEarned: 10000, totalSpent: 0, gamesPlayed: 0, gamesWon: 0 },
    gamblingProfile: { dayKey: '2026-01-01', roundsToday: 0, entryWalletToday: 10000, withdrawnToday: 0, netToday: 0 },
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

console.log('\n=== Deposit/Withdraw Validation Tests ===\n');

test('deposit: rejects non-numeric amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 10000, bank: 5000 });
  const result = economy.deposit(id, 'abc');
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 10000, 'wallet must not change');
  assert.strictEqual(user.bank, 5000, 'bank must not change');
  assert.ok(!isNaN(user.wallet), 'wallet must not be NaN');
});

test('deposit: rejects NaN amount', () => {
  const id = installFakeUser({ wallet: 10000, bank: 5000 });
  const result = economy.deposit(id, NaN);
  assert.ok(!result.success);
});

test('deposit: rejects negative amount', () => {
  const id = installFakeUser({ wallet: 10000, bank: 5000 });
  const result = economy.deposit(id, -100);
  assert.ok(!result.success);
});

test('deposit: rejects zero amount', () => {
  const id = installFakeUser({ wallet: 10000, bank: 5000 });
  const result = economy.deposit(id, 0);
  assert.ok(!result.success);
});

test('deposit: floors fractional amount to integer', () => {
  const id = installFakeUser({ wallet: 10000, bank: 5000 });
  const result = economy.deposit(id, 100.99);
  assert.ok(result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 10000 - 100, 'should have floored to 100');
  assert.strictEqual(user.bank, 5000 + 100);
});

test('deposit: rejects when wallet has insufficient funds', () => {
  const id = installFakeUser({ wallet: 100, bank: 5000 });
  const result = economy.deposit(id, 500);
  assert.ok(!result.success);
});

test('deposit: success path moves money from wallet to bank', () => {
  const id = installFakeUser({ wallet: 10000, bank: 5000 });
  const result = economy.deposit(id, 1000);
  assert.ok(result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 9000);
  assert.strictEqual(user.bank, 6000);
});

test('withdraw: rejects non-numeric amount without corrupting bank', () => {
  const id = installFakeUser({ wallet: 10000, bank: 5000 });
  const result = economy.withdraw(id, 'abc');
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 10000);
  assert.strictEqual(user.bank, 5000);
  assert.ok(!isNaN(user.bank), 'bank must not be NaN');
});

test('withdraw: rejects negative amount', () => {
  const id = installFakeUser({ wallet: 10000, bank: 5000 });
  const result = economy.withdraw(id, -100);
  assert.ok(!result.success);
});

test('withdraw: rejects when bank has insufficient funds', () => {
  const id = installFakeUser({ wallet: 10000, bank: 100 });
  const result = economy.withdraw(id, 500);
  assert.ok(!result.success);
});

test('withdraw: success path moves money from bank to wallet', () => {
  const id = installFakeUser({ wallet: 10000, bank: 5000 });
  const result = economy.withdraw(id, 1000);
  assert.ok(result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 11000);
  assert.strictEqual(user.bank, 4000);
});

test('transferMoney: rejects non-numeric amount', () => {
  const a = installFakeUser({ wallet: 10000 });
  const b = installFakeUser({ wallet: 5000 });
  const result = economy.transferMoney(a, b, 'abc');
  assert.ok(!result.success);
  const userA = economy.getUser(a);
  const userB = economy.getUser(b);
  assert.strictEqual(userA.wallet, 10000);
  assert.strictEqual(userB.wallet, 5000);
});

test('transferMoney: success path', () => {
  const a = installFakeUser({ wallet: 10000 });
  const b = installFakeUser({ wallet: 5000 });
  const result = economy.transferMoney(a, b, 1000);
  assert.ok(result.success);
  const userA = economy.getUser(a);
  const userB = economy.getUser(b);
  assert.strictEqual(userA.wallet, 9000);
  assert.strictEqual(userB.wallet, 6000);
});

console.log(`\n--- Batch 8: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
