/**
 * Phase 6 unit tests — Phone-hash alt detection.
 * Run: node scripts/test_summon_phase6.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO = '/home/z/my-project/repos/whatsapp-bot';
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log('=== PHASE 6 UNIT TESTS ===\n');

// ─── altDetection module ───────────────────────────────────────
console.log('--- altDetection module ---');

const altDetection = require(path.join(REPO, 'core/rpg/altDetection.js'));

test('altDetection exports all required functions', () => {
  assert.strictEqual(typeof altDetection.computePhoneHash, 'function');
  assert.strictEqual(typeof altDetection.setPhoneHash, 'function');
  assert.strictEqual(typeof altDetection.isAltAccount, 'function');
  assert.strictEqual(typeof altDetection.checkTransfer, 'function');
  assert.strictEqual(typeof altDetection.ensurePhoneHash, 'function');
  assert.ok(altDetection.PHONE_HASH_SALT);
});

test('computePhoneHash extracts phone from JID and hashes', () => {
  const hash1 = altDetection.computePhoneHash('2349133219812@s.whatsapp.net');
  const hash2 = altDetection.computePhoneHash('2349133219812');
  assert.ok(hash1);
  assert.ok(hash2);
  assert.strictEqual(hash1, hash2);  // same phone = same hash
});

test('computePhoneHash returns different hashes for different phones', () => {
  const hash1 = altDetection.computePhoneHash('2349133219812@s.whatsapp.net');
  const hash2 = altDetection.computePhoneHash('2347076192459@s.whatsapp.net');
  assert.notStrictEqual(hash1, hash2);
});

test('computePhoneHash handles null/empty input', () => {
  assert.strictEqual(altDetection.computePhoneHash(null), null);
  assert.strictEqual(altDetection.computePhoneHash(''), null);
  assert.strictEqual(altDetection.computePhoneHash(undefined), null);
});

test('computePhoneHash strips non-digits', () => {
  const hash1 = altDetection.computePhoneHash('+234 913 321 9812');
  const hash2 = altDetection.computePhoneHash('2349133219812');
  assert.strictEqual(hash1, hash2);
});

test('computePhoneHash handles LID JIDs', () => {
  // LIDs like 118683049455766@lid — extract the number before @
  const hash = altDetection.computePhoneHash('118683049455766@lid');
  assert.ok(hash);
  assert.strictEqual(hash.length, 64);  // SHA-256 hex = 64 chars
});

test('setPhoneHash sets hash on user if not already set', () => {
  const user = { userId: '2349133219812@s.whatsapp.net' };
  const hash = altDetection.setPhoneHash(user);
  assert.ok(hash);
  assert.strictEqual(user.phoneHash, hash);
});

test('setPhoneHash does NOT overwrite existing hash', () => {
  const user = { userId: '2349133219812@s.whatsapp.net', phoneHash: 'existing_hash' };
  const hash = altDetection.setPhoneHash(user);
  assert.strictEqual(hash, 'existing_hash');
  assert.strictEqual(user.phoneHash, 'existing_hash');
});

test('ensurePhoneHash sets hash if missing', () => {
  const user = { userId: '2349133219812@s.whatsapp.net' };
  altDetection.ensurePhoneHash(user);
  assert.ok(user.phoneHash);
});

test('ensurePhoneHash does nothing if hash already set', () => {
  const user = { userId: '2349133219812@s.whatsapp.net', phoneHash: 'existing' };
  altDetection.ensurePhoneHash(user);
  assert.strictEqual(user.phoneHash, 'existing');
});

test('ensurePhoneHash handles null user', () => {
  assert.doesNotThrow(() => altDetection.ensurePhoneHash(null));
});

// ─── checkTransfer ─────────────────────────────────────────────
console.log('\n--- checkTransfer ---');

test('checkTransfer returns blocked=false for different phones', () => {
  // We can't easily test with real economy users without DB, but we can
  // test the logic: checkTransfer calls isAltAccount which calls getUser.
  // If either user is not found, isAltAccount returns false (fail open).
  const result = altDetection.checkTransfer('unknown1@s.whatsapp.net', 'unknown2@s.whatsapp.net');
  // Both users don't exist in economy cache → isAltAccount returns false → not blocked
  assert.ok(!result.blocked);
});

test('checkTransfer returns blocked=true for same JID', () => {
  const result = altDetection.checkTransfer('same@s.whatsapp.net', 'same@s.whatsapp.net');
  assert.ok(result.blocked);
  assert.ok(result.reason.includes('Alt-account farming'));
});

// ─── User.js + economy.js verification ─────────────────────────
console.log('\n--- User.js + economy.js verification ---');

const userSource = fs.readFileSync(path.join(REPO, 'core/models/User.js'), 'utf8');
const econSource = fs.readFileSync(path.join(REPO, 'core/rpg/economy.js'), 'utf8');

test('phoneHash field on User schema', () => {
  assert.ok(userSource.includes('phoneHash:'));
  assert.ok(userSource.includes('index: true'));  // must be indexed for fast lookup
});

test('economy.js lazy migration includes ensurePhoneHash', () => {
  const count = (econSource.match(/altDetection\.ensurePhoneHash\(user\)/g) || []).length;
  assert.ok(count >= 2, `expected ≥2 ensurePhoneHash calls (getUser + getOrCreateUser), got ${count}`);
});

test('transferMoney has alt detection check', () => {
  assert.ok(econSource.includes('Alt-account detection'));
  assert.ok(econSource.includes('altDetection.checkTransfer'));
  assert.ok(econSource.includes('TRANSFER BLOCKED'));
});

test('transferMoney fails open on alt detection error', () => {
  // The code should have a try/catch that logs but allows transfer on error
  assert.ok(econSource.includes('Fail open'));
});

// ─── Summary ──────────────────────────────────────────────────
console.log(`\n=== PHASE 6 SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
