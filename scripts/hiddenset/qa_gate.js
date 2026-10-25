'use strict';
/**
 * QA for the hidden card set gate (Task 31, 2026-10-25; round 2 same day).
 * Round 2 spec (Mellow feedback): artPending cards are BROWSABLE on discovery
 * surfaces (name search, series listing, info) in chats that opted in — they
 * render the committed art_pending.png placeholder. Spawns still block
 * artPending everywhere until real art lands.
 * Runs ON-BOX against the live catalog. No WhatsApp side effects:
 * only loadCardsDB (sync file read) + the pure gate functions.
 *
 *   node scripts/hiddenset/qa_gate.js
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
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

check('catalog has 42581 cards', all.length === 42581);
check('297 hidden videogame cards', hidden.length === 297 && vg.length === 297);
check('all hidden carry hiddenSet=videogames', hidden.every(c => c.hiddenSet === 'videogames'));
check('all hidden carry artPending=true', hidden.every(c => c.artPending === true));
check('hidden ids are V- prefixed', hidden.every(c => /^V-\d+$/.test(c.id)));

// round 2: purged dupes must be gone (Mellow caught the Zelda one)
const PURGED = ['V-00324', 'V-00328', 'V-00020', 'V-00135', 'V-00144', 'V-00209', 'V-00057'];
check('purged character dupes absent from catalog',
  PURGED.every(id => !inst.CARD_INDEX[id]));
check('Zelda keeps 16 new characters',
  hidden.filter(c => c.animeName === 'The Legend of Zelda').length === 16);
check('Link/Zelda shoob originals still in pool',
  !!inst.CARD_INDEX['4-04855'] && !!inst.CARD_INDEX['4-04796']);

const GROUP = 'qa_gate_test@g.us';
const sample = inst.CARD_INDEX[vg[0]];
const normal = all.find(c => !c.hidden);

check('sample hidden card exists', !!sample);
check('hidden card blocked in random group (spawn view)', cs.cardBlockedForGroup(sample, GROUP) === true);
check('hidden card blocked in DM context (null)', cs.cardBlockedForGroup(sample, null) === true);
check('normal card never blocked', cs.cardBlockedForGroup(normal, GROUP) === false);
check('visibleCardsFor (discovery) excludes hidden without opt-in',
  cs.visibleCardsFor(GROUP).length === all.length - hidden.length);

// simulate group opt-in
inst.hiddenSetChats.set(GROUP, new Set(['videogames']));
check('after opt-in: artPending STILL spawn-blocked (no broken renders)',
  cs.cardBlockedForGroup(sample, GROUP) === true);
check('after opt-in: discovery gate lets artPending through',
  cs.cardBlockedForGroup(sample, GROUP, { discovery: true }) === false);
check('after opt-in: discovery view includes ALL hidden (artPending browsable)',
  cs.visibleCardsFor(GROUP).length === all.length);
check('art_pending.png placeholder is committed and readable',
  Buffer.isBuffer(fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'data', 'art_pending.png'))));

// simulate art landing: flip artPending IN THE CATALOG (a clone would not
// be part of inst.ALL_CARDS, so the gate checks below would never move)
const realCard = inst.CARD_INDEX[vg[0]];
const wasArtPending = realCard.artPending;
realCard.artPending = false;
check('art done + opt-in: card becomes SPAWNABLE (gate opens for spawn too)',
  cs.cardBlockedForGroup(realCard, GROUP) === false);
const vis = cs.visibleCardsFor(GROUP);
check('discovery count unchanged after art lands (was already browsable)',
  vis.length === all.length);
realCard.artPending = wasArtPending; // restore catalog state

// other groups unaffected (art still pending on the restored card)
check('other group stays blocked (spawn view)', cs.cardBlockedForGroup(realCard, 'other@g.us') === true);
check('other group stays blocked (discovery view)', cs.cardBlockedForGroup(realCard, 'other@g.us', { discovery: true }) === true);

// toggle off again
inst.hiddenSetChats.delete(GROUP);
check('after toggle off: spawn view blocked again', cs.cardBlockedForGroup(realCard, GROUP) === true);
check('after toggle off: discovery view blocked again', cs.cardBlockedForGroup(realCard, GROUP, { discovery: true }) === true);

console.log(`\nRESULT: ${pass}/${pass + fail} ${fail === 0 ? 'ALL GREEN' : 'FAILURES PRESENT'}`);
process.exit(fail === 0 ? 0 : 1);
