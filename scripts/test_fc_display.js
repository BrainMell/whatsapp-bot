// scripts/test_fc_display.js
// Verifies the .fc result-message rendering fix (issue 567139):
//   OLD bug: the 🆔 line showed the raw Mongo ObjectId hex (24-char string,
//            unusable as command input, meaningless to users).
//   NEW:     shows the card library ID (e.g. "3-04521") + global Copy #.
// Pure-function test — no DB connection required.

const cardSystem = require('../core/rpg/cardSystem');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`[+] ${name} ✅`); }
  else { fail++; console.error(`[-] ${name} ❌ ${detail}`); }
}

const HEX_RE = /^[0-9a-f]{24}$/; // Mongo ObjectId shape

// ─── TEST 1: helper is exported ───
console.log('\n=== TEST 1: buildFcResultsMessage exported ===');
check('typeof function', typeof cardSystem.buildFcResultsMessage === 'function');

const matches = [
  {
    card: { cardName: 'Roy Mustang', tier: '5' },
    cardId: '3-04521',
    copyNumber: 2,
    location: 'Main Deck (Slot #3)',
    ucId: '66f0a3b2c1d4e5f6a7b8c9d0',
  },
  {
    card: { cardName: 'Roy Mustang', tier: '5' },
    cardId: '3-04521',
    copyNumber: 7,
    location: 'Collection (Coll #14)',
    ucId: '66f0a3b2c1d4e5f6a7b8c9d1',
  },
];

// ─── TEST 2: multi-match shows cardId + Copy #, no raw hex ───
console.log('\n=== TEST 2: multi-match output ===');
const msg2 = cardSystem.buildFcResultsMessage('roy mustang', matches);
console.log('--- rendered ---\n' + msg2 + '\n----------------');
check('header count', msg2.includes('Found 2 card(s)'), 'header missing');
check('shows library ID 3-04521', msg2.includes('`3-04521`'), 'cardId not shown in backticks');
check('shows Copy #2', msg2.includes('Copy #2'), 'copyNumber 2 missing');
check('shows Copy #7', msg2.includes('Copy #7'), 'copyNumber 7 missing');
check('NO raw hex anywhere', ![...msg2.matchAll(/`([^`]+)`/g)].some(m => HEX_RE.test(m[1])),
  'a 24-char hex ID leaked into the output');
check('locations preserved', msg2.includes('Main Deck (Slot #3)') && msg2.includes('Collection (Coll #14)'));
check('footer mentions Coll # / Card ID', msg2.includes('Coll #') && msg2.includes('Card ID'));

// ─── TEST 3: single match → no 🆔 line at all (unchanged behavior) ───
console.log('\n=== TEST 3: single-match output ===');
const msg3 = cardSystem.buildFcResultsMessage('roy mustang', [matches[0]]);
console.log('--- rendered ---\n' + msg3 + '\n----------------');
check('no 🆔 line for single match', !msg3.includes('🆔'), '🆔 line should be omitted for a single match');
check('still shows card name + tier', msg3.includes('Roy Mustang') && msg3.includes('Tier 5'));

// ─── TEST 4: unknown-card branch still works ───
console.log('\n=== TEST 4: unknown-card branch ===');
const msg4 = cardSystem.buildFcResultsMessage('ghost', [
  { card: null, cardId: 'X-99999', copyNumber: 1, location: 'Collection (Coll #1)', ucId: 'aa'.repeat(12) },
]);
console.log('--- rendered ---\n' + msg4 + '\n----------------');
check('flags unknown card', msg4.includes('Unknown Card'), 'unknown-card flag missing');
check('still shows its cardId', msg4.includes('X-99999'));

// ─── TEST 5: missing copyNumber degrades gracefully ───
console.log('\n=== TEST 5: copyNumber missing → no Copy label ===');
const msg5 = cardSystem.buildFcResultsMessage('roy mustang', [
  { card: { cardName: 'Roy Mustang', tier: '5' }, cardId: '3-04521', location: 'Main Deck (Slot #1)' },
  { card: { cardName: 'Roy Mustang', tier: '5' }, cardId: '3-04521', location: 'Collection (Coll #2)' },
]);
check('no Copy label when copyNumber undefined', !msg5.includes('· Copy #'), 'match line should omit "· Copy #" when copyNumber is undefined');
check('still renders both cardIds', (msg5.match(/3-04521/g) || []).length === 2);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
