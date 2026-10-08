#!/usr/bin/env node
'use strict';
/* Task 46 seed: publish the pre-deploy validated scrape (run on the deploy
 * container 2026-10-07) into the shared Mongo System keys, so `.j mentoring`
 * has search/preview data before wa-miner's first server cycle publishes.
 * Status is NOT seeded — the miner's own first cycle report takes that slot.
 * Run on Box 1:  MONGO_URI from repo .env; mongoose from repo node_modules.
 */
const path = require('path');
const fs = require('fs');
const REPO = '/home/ubuntu/whatsapp-bot';
try { require(path.join(REPO, 'node_modules', 'dotenv')).config({ path: path.join(REPO, '.env') }); } catch {}
const mongoose = require('mongoose');

const OUT = '/home/ubuntu/whatsapp-bot/scripts/shoob-miner/seed';
const ev = JSON.parse(fs.readFileSync(path.join(OUT, 'event_cards.json'), 'utf8'));
const rep = JSON.parse(fs.readFileSync(path.join(OUT, 'event_cards.report.json'), 'utf8'));

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const schema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  }, { timestamps: true });
  const System = mongoose.models.System || mongoose.model('System', schema);

  const now = new Date().toISOString();
  const cards = ev.cards || [];
  // newcards seed = cards the pre-deploy run assigned NEW ids (E-02503..E-03677),
  // newest first, capped at 500 — all of them are already live after the deploy,
  // so `pending` on any box will be 0; this is mined-batch history.
  const newSeed = cards
    .filter(c => parseInt(String(c.id).slice(2), 10) >= 2503)
    .sort((a, b) => String(b.id).localeCompare(String(a.id), 'en', { numeric: true }))
    .slice(0, 500)
    .map(c => ({ ...c, foundAt: (rep.generatedAt || now) + ' (pre-deploy run)' }));

  const put = (key, value) => System.findOneAndUpdate(
    { key }, { value, $set: { updatedAt: new Date() } }, { upsert: true });

  await put('shoob_miner_eventblock', {
    updatedAt: now,
    totalCards: cards.length,
    source: 'seeded: pre-deploy validated run (deploy container) + wa-miner (Box 1)',
    cards,
  });
  await put('shoob_miner_newcards', {
    updatedAt: now,
    count: newSeed.length,
    note: 'all seeded finds went live with the 2026-10-07 deploy (37,666-card DB)',
    cards: newSeed,
  });

  const check = await System.findOne({ key: 'shoob_miner_eventblock' }).lean();
  console.log('seeded: eventblock', check.value.totalCards, 'cards; newcards', newSeed.length);
  await mongoose.disconnect();
  process.exit(0);
})().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1); });
