// Tests for the loan accept/decline bug and other economy edge cases.
require('/home/z/my-project/scripts/test_harness.js');

const assert = require('assert');
const economy = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/economy.js');
const loans = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/loans.js');

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

console.log('\n=== Loans Bug Regression Tests ===\n');

test('loans.getPendingRequest: returns request when called with LENDER jid (was bug)', () => {
  const borrower = installFakeUser();
  const lender = installFakeUser({ wallet: 100000 });
  loans.requestLoan(borrower, lender, 1000, 10, 60);
  // The lender types `.j accept` — engine.js calls getPendingRequest(lender)
  const req = loans.getPendingRequest(lender);
  assert.ok(req, 'should return the pending request when called with lender jid');
  assert.strictEqual(req.lenderJid, lender);
  assert.strictEqual(req.borrowerJid, borrower);
  assert.strictEqual(req.amount, 1000);
});

test('loans.getPendingRequest: also works with BORROWER jid (backward compat)', () => {
  const borrower = installFakeUser();
  const lender = installFakeUser({ wallet: 100000 });
  loans.requestLoan(borrower, lender, 1000, 10, 60);
  const req = loans.getPendingRequest(borrower);
  assert.ok(req, 'should return the pending request when called with borrower jid');
  assert.strictEqual(req.lenderJid, lender);
  assert.strictEqual(req.borrowerJid, borrower);
});

test('loans.acceptLoan: succeeds when called by the lender', () => {
  const borrower = installFakeUser();
  const lender = installFakeUser({ wallet: 100000 });
  loans.requestLoan(borrower, lender, 1000, 10, 60);
  // Simulate engine.js: getPendingRequest(lender) → acceptLoan(lender)
  const req = loans.getPendingRequest(lender);
  assert.ok(req, 'precondition: lender must be able to find the request');
  const result = loans.acceptLoan(req.lenderJid);
  assert.ok(result.success, 'accept should succeed: ' + (result.msg || ''));
  // Verify money was transferred
  const lenderAfter = economy.getUser(lender);
  const borrowerAfter = economy.getUser(borrower);
  assert.strictEqual(lenderAfter.wallet, 99000, `lender should have 99000, got ${lenderAfter.wallet}`);
  assert.strictEqual(borrowerAfter.wallet, 51000, `borrower should have 51000, got ${borrowerAfter.wallet}`);
});

test('loans.acceptLoan: fails when lender has insufficient wallet funds', () => {
  const borrower = installFakeUser({ wallet: 100 });
  const lender = installFakeUser({ wallet: 500 }); // less than 1000
  loans.requestLoan(borrower, lender, 1000, 10, 60);
  // Wait — requestLoan should have already refused this because lender's wallet < amount
  // Let me check: requestLoan checks `lenderBal.wallet < amt`. 500 < 1000, so it refuses.
  // So we can't even create this scenario via requestLoan.
  // But what if the lender's wallet drops between request and accept?
  // Simulate: request succeeds, then wallet drops, then accept.
  const borrower2 = installFakeUser();
  const lender2 = installFakeUser({ wallet: 5000 });
  const reqResult = loans.requestLoan(borrower2, lender2, 1000, 10, 60);
  assert.ok(reqResult.success, 'precondition: request should succeed');
  // Now drain the lender's wallet
  economy.removeMoney(lender2, 5000);
  // Try to accept — should fail and clean up
  const acceptResult = loans.acceptLoan(lender2);
  assert.ok(!acceptResult.success, 'accept should fail');
  // After failed accept, lender should be able to receive new requests
  const borrower3 = installFakeUser();
  const newReq = loans.requestLoan(borrower3, lender2, 100, 10, 60);
  // Lender's wallet is 0, so this should also fail at request time
  // (we added the wallet check at request time too)
  assert.ok(!newReq.success, 'new request should fail because lender has 0 wallet');
});

test('loans.requestLoan: blocks self-loans', () => {
  const id = installFakeUser();
  const result = loans.requestLoan(id, id, 1000, 10, 60);
  assert.ok(!result.success, 'should block self-loan');
});

test('loans.requestLoan: validates non-numeric amount (was exploit)', () => {
  const borrower = installFakeUser();
  const lender = installFakeUser({ wallet: 100000 });
  const result = loans.requestLoan(borrower, lender, 'abc', 10, 60);
  assert.ok(!result.success, 'should reject non-numeric amount');
});

test('loans.requestLoan: validates non-numeric interest', () => {
  const borrower = installFakeUser();
  const lender = installFakeUser({ wallet: 100000 });
  const result = loans.requestLoan(borrower, lender, 1000, 'high', 60);
  assert.ok(!result.success);
});

test('loans.requestLoan: validates non-numeric duration', () => {
  const borrower = installFakeUser();
  const lender = installFakeUser({ wallet: 100000 });
  const result = loans.requestLoan(borrower, lender, 1000, 10, 'forever');
  assert.ok(!result.success);
});

test('loans.requestLoan: rejects when lender wallet insufficient (upfront check)', () => {
  const borrower = installFakeUser();
  const lender = installFakeUser({ wallet: 500 }); // < 1000
  const result = loans.requestLoan(borrower, lender, 1000, 10, 60);
  assert.ok(!result.success, 'should reject upfront — lender cannot cover');
});

console.log(`\n--- Batch 4: ${passed}/${tests} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
