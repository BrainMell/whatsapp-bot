#!/usr/bin/env node
// QA - card owner-identity merge ("lost most of their card
// collection" for +234 707 619 2459). Runs in sandbox (no node_modules needed):
// source assertions on core/rpg/cardSystem.js.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS ', name); }
  else { fail++; console.log('FAIL ', name); }
}

const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'cardSystem.js'), 'utf8');

// -- helpers exist ------------------------------------------------------------
check('helper: cardOwnerVariants defined', src.includes('async function cardOwnerVariants(jid)'));
check('helper: ownerOf defined and returns owner filter', src.includes('async function ownerOf(jid)'));
check('helper: resolves via LidMapping', src.includes("require('../models/LidMapping')"));
check('helper: lid -> phone lookup', src.includes("LidMapping.findOne({ lid: digits })"));
check('helper: phone -> all lids lookup', src.includes("LidMapping.find({ phone })"));
check('helper: variants cached with TTL', src.includes('OWNER_VARIANTS_TTL_MS') && src.includes('_ownerVariantsCache.get(key)'));
check('helper: graceful fallback on mapping errors', src.includes('ownerVariants fallback'));
check('helper: single-variant path identical to old behavior', src.includes('return v.length === 1 ? { userId: jid } : { userId: { $in: v } }'));

// -- reads merged -------------------------------------------------------------
const mergedReads = (src.match(/\.\.\.\(await ownerOf\(senderJid\)\)/g) || []).length;
check('reads: >=40 owner-keyed read/guard sites merged (' + mergedReads + ')', mergedReads >= 40);
check('reads: .coll listing merged', src.includes('UserCard.find({ ...(await ownerOf(senderJid)), inMainDeck: false, inCustomDeck: false, forSale: false })'));
check('reads: main deck listing merged', src.includes('UserCard.find({ ...(await ownerOf(senderJid)), inMainDeck: true })'));
check('reads: deck slot lookup merged', src.includes('UserCard.findOne({ ...(await ownerOf(senderJid)), inMainDeck: true, mainDeckSlot: slot })'));
check('reads: spawn claim alreadyOwned guard merged', src.includes('UserCard.findOne({ ...(await ownerOf(senderJid)), cardId: spawn.card.id })'));
check('reads: card input lookup merged', src.includes('UserCard.findOne({ ...(await ownerOf(senderJid)), cardId: input })'));
check('reads: market still-mine guard merged', src.includes('UserCard.findOne({ _id: pending.ucId, ...(await ownerOf(senderJid)) })'));
check('reads: CardDeck find merged', src.includes('CardDeck.find({ ...(await ownerOf(senderJid)) })'));
check('reads: CardDeck findOne by name merged', src.includes('CardDeck.findOne({ ...(await ownerOf(senderJid)), name: '));
check('reads: multiline collOnly block merged', src.includes('...(await ownerOf(senderJid)),\n    inMainDeck: false,'));

// -- writes untouched (cards still LAND on arrival form; no data moves) ------
check('writes: claim create still on arrival form', src.includes('await UserCard.create({ userId: senderJid, cardId: entry.cardId, copyNumber })'));
check('writes: spawn claim create still on arrival form', src.includes('await UserCard.create({ userId: senderJid, cardId: spawn.card.id, copyNumber: spawn.copyNumber })'));
check('writes: market purchase transfer still assigns arrival form', /findByIdAndUpdate\(listing\.userCardId, \{ userId: senderJid,/.test(src));
check('writes: no ownerOf inside UserCard.create', !/UserCard\.create\(\{ \.\.\.\(await ownerOf/.test(src));

// -- no reads left behind -----------------------------------------------------
const remaining = (src.match(/userId: senderJid/g) || []).length;
// writes only: 2 creates + deck-claim reassign + market purchase reassign = 4
check('no read left keyed on raw senderJid (remaining=' + remaining + ', expect 4 writes)', remaining === 4);

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
