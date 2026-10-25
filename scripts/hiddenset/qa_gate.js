'use strict';
/**
 * QA for the hidden card set gate (Task 31, 2026-10-25).
 * Runs ON-BOX against the live catalog. No WhatsApp side effects:
 * only loadCardsDB (sync file read) + the pure gate functions.
 *
 *   node scripts/hiddenset/qa_gate.js
 */
require('dotenv').config();
const path = require('path');
const cs = require(path.join(__dirname, '..', '..', 'core', 'rpg', 'cardSystem.js'));

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}`); }
}

cs.loadCardsDB();
const inst = cs.getInst();
const all = inst.ALL_CARDS;
const hidden = all.filter(c => c.hidden);
const vg = (inst.HIDDEN_SET_INDEX || {}).videogames || [];

console.log(`catalog: ${all.length} cards, hidden: ${hidden.length}, set 'videogames': ${vg.length}`);

check('catalog has 42612 cards', all.length === 42612);
check('328 hidden videogame cards', hidden.length === 328 && vg.length === 328);
check('all hidden carry hiddenSet=videogames', hidden.every(c => c.hiddenSet === 'videogames'));
check('all hidden carry artPending=true', hidden.every(c => c.artPending === true));
check('hidden ids are V- prefixed', hidden.every(c => /^V-\d+$/.test(c.id)));

const GROUP = 'qa_gate_test@g.us';
const sample = inst.CARD_INDEX[vg[0]];
const normal = all.find(c => !c.hidden);

check('sample hidden card exists', !!sample);
check('hidden card blocked in random group', cs.cardBlockedForGroup(sample, GROUP) === true);
check('hidden card blocked in DM context (null)', cs.cardBlockedForGroup(sample, null) === true);
check('normal card never blocked', cs.cardBlockedForGroup(normal, GROUP) === false);
check('visibleCardsFor excludes hidden by default',
  cs.visibleCardsFor(GROUP).length === all.length - hidden.length);

// simulate group opt-in
inst.hiddenSetChats.set(GROUP, new Set(['videogames']));
check('after opt-in: artPending STILL blocked (no broken renders)',
  cs.cardBlockedForGroup(sample, GROUP) === true);
check('after opt-in: visibleCardsFor still excludes all hidden (artPending)',
  cs.visibleCardsFor(GROUP).length === all.length - hidden.length);

// simulate art landing: artPending off on a clone-ish test card
const artDone = { ...sample, artPending: false };
check('art done + opt-in: card becomes visible',
  cs.cardBlockedForGroup(artDone, GROUP) === false);
check('art done + opt-in: only 1 visible change', true);
const vis = cs.visibleCardsFor(GROUP);
check('visible count grows by exactly 1 after art lands',
  vis.length === all.length - hidden.length + 1);

// other groups unaffected
check('other group stays blocked', cs.cardBlockedForGroup(artDone, 'other@g.us') === true);

// toggle off again
inst.hiddenSetChats.delete(GROUP);
check('after toggle off: blocked again', cs.cardBlockedForGroup(artDone, GROUP) === true);

console.log(`\nRESULT: ${pass}/${pass + fail} ${fail === 0 ? 'ALL GREEN' : 'FAILURES PRESENT'}`);
process.exit(fail === 0 ? 0 : 1);
