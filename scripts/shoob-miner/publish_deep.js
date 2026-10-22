// publish_deep.js — publish the deep-rotcat event block to shared Mongo.
// Mirrors wa-miner's publish shapes exactly (System key/value, collection
// via mongoose model 'System'). Run from scripts/shoob-miner on box1.
'use strict';
const path = require('path');
const fs = require('fs');
const MINER_DIR = __dirname;
const REPO_ROOT = path.resolve(MINER_DIR, '..', '..');
try { require(path.join(REPO_ROOT, 'node_modules', 'dotenv')).config({ path: path.join(REPO_ROOT, '.env') }); } catch {}
const mongoose = require('mongoose');

const LIVE_DB = process.env.MINER_LIVE_DB || path.join(REPO_ROOT, 'core', 'data', 'cards_data.json');
const OUT = path.join(MINER_DIR, 'output', 'event_cards.json');
const LOG = (m) => console.log(`[publish-deep ${new Date().toISOString()}] ${m}`);

function liveEventIds() {
  const raw = JSON.parse(fs.readFileSync(LIVE_DB, 'utf8'));
  const cards = Array.isArray(raw.cards) ? raw.cards : Object.values(raw.cards);
  const ids = new Set(); let total = 0, maxE = 0;
  for (const c of cards) {
    if (!c || !c.id) continue;
    total++;
    if (String(c.id).startsWith('E-')) {
      ids.add(c.id);
      const n = parseInt(String(c.id).slice(2), 10);
      if (Number.isFinite(n) && n > maxE) maxE = n;
    }
  }
  return { ids, total, maxE, eventCount: ids.size };
}

(async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI missing (repo .env)');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const schema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  }, { timestamps: true });
  const System = mongoose.models.System || mongoose.model('System', schema);
  const publishKey = (key, value) => System.findOneAndUpdate({ key }, { value, $set: { updatedAt: new Date() } }, { upsert: true });

  const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const scraped = out.cards || [];
  const live = liveEventIds();
  const pending = scraped.filter(c => !live.ids.has(c.id));

  // cumulative pending (previous ∪ current, minus now-live, cap 500) — same as miner
  let cumulative = [];
  try {
    const prev = await System.findOne({ key: 'shoob_miner_newcards' });
    const prevCards = (prev && prev.value && prev.value.cards) || [];
    const byId = new Map(prevCards.map(c => [c.id, c]));
    for (const c of pending) byId.set(c.id, { ...c, foundAt: c.foundAt || new Date().toISOString() });
    cumulative = [...byId.values()].filter(c => !live.ids.has(c.id)).slice(-500);
  } catch (e) { LOG(`newcards merge failed: ${e.message}`); cumulative = pending.slice(-500); }

  await publishKey('shoob_miner_status', {
    miner: { host: require('os').hostname(), app: 'wa-miner (manual deep rotcat run)', pid: process.pid },
    cycle: { startedAt: new Date(Date.now() - 20 * 60000).toISOString(), finishedAt: new Date().toISOString(), durationMin: null, note: 'one-off deep run after truncation fix 58409a712' },
    liveReference: { totalCards: live.total, eventCards: live.eventCount, maxE: `E-${String(live.maxE).padStart(5, '0')}` },
    lastResult: {
      scraped: scraped.length,
      newIdsThisCycle: pending.length,
      events: out.metadata ? out.metadata.totalEvents : null,
      perEvent: out.metadata ? out.metadata.perEvent : null,
    },
    pendingNewCount: pending.length,
    intervalMin: 45,
    nextRunAt: new Date(Date.now() + 45 * 60000).toISOString(),
  });
  await publishKey('shoob_miner_newcards', { updatedAt: new Date().toISOString(), count: cumulative.length, cards: cumulative });
  await publishKey('shoob_miner_eventblock', {
    updatedAt: new Date().toISOString(),
    totalCards: scraped.length,
    source: 'wa-miner deep rotcat scrape (shoob.gg SSR, no-Chromium)',
    cards: scraped,
  });
  LOG(`published: status + ${cumulative.length} pending-new + eventblock (${scraped.length}); pending vs live = ${pending.length}`);
  await mongoose.disconnect();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
