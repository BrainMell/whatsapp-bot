#!/usr/bin/env node
'use strict';
/**
 * fix_event_descriptions.js — regenerate the `description` field for every
 * E- event card to the house format: "<cardName> from <animeName>".
 *
 * WHY: descriptions were composed at mining time from the OLD (buggy) field
 * mapping, so they still say e.g. "Bulma from Summer" even though the
 * animeName/eventName fields were corrected in db6759a6. The owner flagged
 * this 2026-10-08: description must say "Bulma from Dragon Ball" — the
 * SERIES, never the event.
 *
 * SAFETY:
 *  - only touches cards whose id starts with "E-"
 *  - writes a .bak backup next to the target before saving
 *  - prints before/after samples + counters for verification
 *
 * Usage: node fix_event_descriptions.js [pathToCardsDataJson]
 */
const fs = require('fs');

const P = process.argv[2] || '/home/ubuntu/whatsapp-bot/core/data/cards_data.json';
const raw = fs.readFileSync(P, 'utf8');
const d = JSON.parse(raw);
const cards = Array.isArray(d.cards) ? d.cards : Object.values(d.cards);

let changed = 0, unchanged = 0, samples = [];
for (const c of cards) {
  if (!c || !String(c.id).startsWith('E-')) continue;
  const want = `${c.cardName} from ${c.animeName}`;
  if (c.description !== want) {
    if (samples.length < 6) samples.push(`  ${c.id}: "${c.description}" -> "${want}"`);
    c.description = want;
    changed++;
  } else {
    unchanged++;
  }
}

fs.writeFileSync(P + '.bak', raw);
fs.writeFileSync(P, JSON.stringify(d, null, 2));

console.log(`[fix] event descriptions: ${changed} updated, ${unchanged} already correct`);
console.log(samples.join('\n'));
console.log(`[fix] backup written: ${P}.bak`);

// post-verify: re-read and re-count
const d2 = JSON.parse(fs.readFileSync(P, 'utf8'));
const cards2 = Array.isArray(d2.cards) ? d2.cards : Object.values(d2.cards);
let stale = 0, total = 0;
for (const c of cards2) {
  if (!c || !String(c.id).startsWith('E-')) continue;
  total++;
  if (c.description !== `${c.cardName} from ${c.animeName}`) stale++;
}
console.log(`[verify] event cards: ${total}, still stale: ${stale}`);
console.log(`[verify] total cards: ${cards2.length}`);
process.exit(stale === 0 ? 0 : 2);
