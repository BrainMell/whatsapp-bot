#!/usr/bin/env node
'use strict';
/**
 * merge_regular_cards.js — append the shoob-regular-scraper output
 * (output/regular_cards_new.json, 1779 cards) into the live
 * core/data/cards_data.json, with hard safety gates:
 *   - no id collisions (skip + report)
 *   - no mongoId duplicates (skip + report)
 *   - pre-merge backup cards_data.json.mergebak
 *   - post-verify totals and id uniqueness
 */
const fs = require('fs');

const DB = '/home/ubuntu/whatsapp-bot/core/data/cards_data.json';
const NEW = '/home/ubuntu/whatsapp-bot/scripts/regular_cards_new.json';

const rawBefore = fs.readFileSync(DB, 'utf8');
fs.writeFileSync(DB + '.mergebak', rawBefore);

const db = JSON.parse(rawBefore);
const add = JSON.parse(fs.readFileSync(NEW, 'utf8'));
const dbKeys = Object.keys(db);
const cards = Array.isArray(db.cards) ? db.cards : Object.values(db.cards);

const mongoOf = (c) => (String((c && c.detailUrl) || '').match(/([0-9a-f]{24})$/) || [])[1] || null;
const byId = new Map(cards.map(c => [String(c.id), c]));
const byMongo = new Map();
for (const c of cards) { const m = mongoOf(c); if (m) byMongo.set(m, c); }

let appended = 0, skipId = 0, skipMongo = 0;
for (const c of (add.cards || [])) {
  if (!c || !c.id) continue;
  if (byId.has(String(c.id))) { skipId++; continue; }
  const m = mongoOf(c);
  if (m && byMongo.has(m)) { skipMongo++; continue; }
  cards.push(c);
  byId.set(String(c.id), c);
  if (m) byMongo.set(m, c);
  appended++;
}

// refresh housekeeping fields if present
if (Array.isArray(db.cards)) {
  if ('totalCards' in db) db.totalCards = cards.length;
  if ('uniqueCards' in db) db.uniqueCards = cards.length;
  if ('lastUpdated' in db) db.lastUpdated = new Date().toISOString();
}

fs.writeFileSync(DB, JSON.stringify(db, null, 2));
console.log(`[merge] top-level keys: ${JSON.stringify(dbKeys)}`);
console.log(`[merge] appended ${appended}, skipped byId ${skipId}, skipped byMongoId ${skipMongo}`);

// post-verify
const after = JSON.parse(fs.readFileSync(DB, 'utf8'));
const acards = Array.isArray(after.cards) ? after.cards : Object.values(after.cards);
const ids = new Set(acards.map(c => String(c.id)));
console.log(`[verify] total cards: ${acards.length} (expected ${cards.length})`);
console.log(`[verify] unique ids: ${ids.size} (dupes: ${acards.length - ids.size})`);
const ev = acards.filter(c => String(c.id).startsWith('E-')).length;
const reg = acards.length - ev;
console.log(`[verify] regular: ${reg} (expected 34370+1779=36149), event: ${ev}`);
const sample = acards.find(c => c.id === '1-11769');
console.log(`[verify] sample 1-11769:`, sample ? `${sample.cardName} / ${sample.animeName} / ${sample.creator}` : 'MISSING');
process.exit((ids.size === acards.length && acards.length === 39445 && sample) ? 0 : 2);
