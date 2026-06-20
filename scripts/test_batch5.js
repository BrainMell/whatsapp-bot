// Tests for gambling input validation — ensures NaN/string amounts can't
// corrupt the wallet.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const economy = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/economy.js');
const gambling = require('/home/z/my-project/repo/whatsapp-bot/core/gambling.js');

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
    gamblingProfile: { dayKey: '2026-01-01', roundsToday: 0, entryWalletToday: 50000, withdrawnToday: 0, netToday: 0 },
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

console.log('\n=== Gambling Validation Tests ===\n');

test('coinflip: rejects non-numeric amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.coinflip(id, 'abc', 'heads', economy);
  assert.ok(!result.success, 'should reject');
  assert.ok(result.message.includes('Invalid bet'), `unexpected message: ${result.message}`);
  // CRITICAL: wallet must still be a number, not NaN
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000, `wallet should be 50000, got ${user.wallet}`);
  assert.ok(!isNaN(user.wallet), 'wallet must not be NaN');
});

test('coinflip: rejects NaN amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.coinflip(id, NaN, 'heads', economy);
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000);
});

test('coinflip: rejects negative amount', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.coinflip(id, -100, 'heads', economy);
  assert.ok(!result.success);
});

test('coinflip: rejects zero amount', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.coinflip(id, 0, 'heads', economy);
  assert.ok(!result.success);
});

test('diceRoll: rejects non-numeric amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.diceRoll(id, 'xyz', economy);
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000);
  assert.ok(!isNaN(user.wallet), 'wallet must not be NaN');
});

test('slots: rejects non-numeric amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.slots(id, 'foo', economy);
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000);
  assert.ok(!isNaN(user.wallet), 'wallet must not be NaN');
});

test('startBlackjack: rejects non-numeric amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.startBlackjack(id, 'not_a_number', economy);
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000);
  assert.ok(!isNaN(user.wallet), 'wallet must not be NaN');
});

test('roulette: rejects non-numeric amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.roulette(id, 'NaN', 'red', economy);
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000);
});

test('lottery: rejects non-numeric amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.lottery(id, 'abc', economy);
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000);
});

test('rps: rejects non-numeric amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.rps(id, 'xyz', 'rock', economy);
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000);
});

test('plinko: rejects non-numeric amount without corrupting wallet', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.plinko(id, 'abc', 'medium', economy);
  assert.ok(!result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 50000);
});

test('coinflip: valid bet still works correctly', () => {
  const id = installFakeUser({ wallet: 50000 });
  const result = gambling.coinflip(id, 100, 'heads', economy);
  assert.ok(result.success, 'valid bet should work');
  const user = economy.getUser(id);
  // Either won 100 or lost 100
  assert.ok(user.wallet === 50100 || user.wallet === 49900, `unexpected wallet: ${user.wallet}`);
});

console.log(`\n--- Batch 5: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
