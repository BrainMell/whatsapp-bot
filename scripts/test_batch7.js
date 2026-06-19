// Tests for membership daily bonus fix and other economy edge cases.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const economy = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/economy.js');

function installFakeUser(overrides = {}) {
  const id = 'test' + Math.floor(Math.random() * 100000) + '@s.whatsapp.net';
  const user = {
    userId: id,
    wallet: 5000,
    bank: 0,
    lastDaily: 0,
    registered: true,
    nickname: 'Tester',
    class: 'FIGHTER',
    adventurerRank: 'F',
    stats: { totalEarned: 5000, totalSpent: 0, gamesPlayed: 0, gamesWon: 0 },
    membership: { tier: 'BASIC', expires: 0 },
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

console.log('\n=== Membership & Daily Reward Tests ===\n');

const DAILY_REWARD = 500;
const PREMIUM_BONUS = 1000;
const DIAMOND_BONUS = 5000;

test('claimDaily: BASIC user gets only base reward', () => {
  const id = installFakeUser({ wallet: 1000, membership: { tier: 'BASIC', expires: 0 } });
  const result = economy.claimDaily(id);
  assert.ok(result.success);
  const user = economy.getUser(id);
  assert.strictEqual(user.wallet, 1000 + DAILY_REWARD, `expected ${1000 + DAILY_REWARD}, got ${user.wallet}`);
});

test('claimDaily: PREMIUM user gets base + bonus (was bug — bonus was never granted)', () => {
  const id = installFakeUser({
    wallet: 1000,
    membership: { tier: 'PREMIUM', expires: Date.now() + 86400000 } // active for 1 day
  });
  const result = economy.claimDaily(id);
  assert.ok(result.success);
  const user = economy.getUser(id);
  const expected = 1000 + DAILY_REWARD + PREMIUM_BONUS;
  assert.strictEqual(user.wallet, expected, `expected ${expected}, got ${user.wallet}`);
});

test('claimDaily: DIAMOND user gets base + bonus', () => {
  const id = installFakeUser({
    wallet: 1000,
    membership: { tier: 'DIAMOND', expires: Date.now() + 86400000 }
  });
  const result = economy.claimDaily(id);
  assert.ok(result.success);
  const user = economy.getUser(id);
  const expected = 1000 + DAILY_REWARD + DIAMOND_BONUS;
  assert.strictEqual(user.wallet, expected, `expected ${expected}, got ${user.wallet}`);
});

test('claimDaily: expired PREMIUM membership resets to BASIC', () => {
  const id = installFakeUser({
    wallet: 1000,
    membership: { tier: 'PREMIUM', expires: Date.now() - 1000 } // expired
  });
  const result = economy.claimDaily(id);
  assert.ok(result.success);
  const user = economy.getUser(id);
  // Should only get base reward (no bonus), and membership should be reset
  assert.strictEqual(user.wallet, 1000 + DAILY_REWARD, `expected ${1000 + DAILY_REWARD}, got ${user.wallet}`);
  assert.strictEqual(user.membership.tier, 'BASIC');
  assert.strictEqual(user.membership.expires, 0);
});

test('claimDaily: 24h cooldown enforced', () => {
  const id = installFakeUser({ wallet: 1000, lastDaily: Date.now() - 23 * 3600000 }); // 23h ago
  const result = economy.claimDaily(id);
  assert.ok(!result.success);
  assert.ok(result.message.includes('ALREADY CLAIMED'));
});

test('claimDaily: can claim again after 24h', () => {
  const id = installFakeUser({ wallet: 1000, lastDaily: Date.now() - 25 * 3600000 }); // 25h ago
  const result = economy.claimDaily(id);
  assert.ok(result.success);
});

test('claimDaily: updates stats.totalEarned', () => {
  const id = installFakeUser({ wallet: 1000, stats: { totalEarned: 1000, totalSpent: 0 } });
  economy.claimDaily(id);
  const user = economy.getUser(id);
  assert.strictEqual(user.stats.totalEarned, 1000 + DAILY_REWARD);
});

console.log(`\n--- Batch 7: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
