// promote_deep.js — splice the mined event block into the LIVE cards_data.json
// on box2. Server-side replica of mentoringCommands.promote()'s event path
// (owner-gated in chat; this script performs the identical file mutation).
// SAFETY: aborts unless every currently-live E-id survives in the block.
'use strict';
const path = require('path');
const fs = require('fs');
const REPO_ROOT = '/home/ubuntu/whatsapp-bot';
try { require(path.join(REPO_ROOT, 'node_modules', 'dotenv')).config({ path: path.join(REPO_ROOT, '.env') }); } catch {}
const mongoose = require('mongoose');

const CARDS_DB_PATH = path.join(REPO_ROOT, 'core', 'data', 'cards_data.json');
const LOG = (m) => console.log(`[promote-deep ${new Date().toISOString()}] ${m}`);

(async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI missing (repo .env)');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const schema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  }, { timestamps: true });
  const System = mongoose.models.System || mongoose.model('System', schema);

  const doc = await System.findOne({ key: 'shoob_miner_eventblock' });
  const block = doc && doc.value;
  const cards = block && Array.isArray(block.cards) ? block.cards : null;
  if (!cards || !cards.length) { LOG('No mined event block published — aborting.'); process.exit(1); }

  // sanity: exact E-schema, unique ids (same checks as promote())
  const badSchema = cards.filter(c => !c || !c.id || !String(c.id).startsWith('E-') || !c.cardName || !c.imageUrl);
  const ids = new Set(cards.map(c => c.id));
  if (badSchema.length || ids.size !== cards.length) {
    LOG(`FATAL: block failed sanity (${badSchema.length} malformed, ${cards.length - ids.size} dup ids) — NOT promoting.`);
    process.exit(1);
  }

  const prod = JSON.parse(fs.readFileSync(CARDS_DB_PATH, 'utf8'));
  const prodCards = Array.isArray(prod.cards) ? prod.cards : Object.values(prod.cards || {});
  const regular = prodCards.filter(c => !(c.id && String(c.id).startsWith('E-')));
  const oldEvents = prodCards.filter(c => c.id && String(c.id).startsWith('E-'));
  const oldIds = new Set(oldEvents.map(c => c.id));

  // SAFETY: no live event card may vanish
  const blockIds = new Set(cards.map(c => c.id));
  const wouldLose = [...oldIds].filter(id => !blockIds.has(id));
  if (wouldLose.length) {
    LOG(`FATAL: block would drop ${wouldLose.length} live event ids (e.g. ${wouldLose.slice(0, 5).join(',')}) — NOT promoting.`);
    process.exit(1);
  }

  const added = cards.filter(c => !oldIds.has(c.id));
  const addedNums = added.map(c => parseInt(c.id.slice(2), 10)).filter(Number.isFinite);
  const perEvent = {};
  for (const c of added) perEvent[c.eventName] = (perEvent[c.eventName] || 0) + 1;

  const merged = {
    ...prod,
    totalCards: regular.length + cards.length,
    uniqueCards: regular.length + cards.length,
    lastUpdated: new Date().toISOString(),
    cards: [...regular, ...cards],
    metadata: {
      ...(prod.metadata || {}),
      lastUpdated: new Date().toISOString(),
      eventCards: cards.length,
      promotedFrom: 'shoob_miner_eventblock (deep rotcat)',
      promotedAt: new Date().toISOString(),
    },
  };

  const tmp = CARDS_DB_PATH + '.promote.tmp';
  const backup = CARDS_DB_PATH + `.bak-promote-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  fs.writeFileSync(tmp, JSON.stringify(merged));
  JSON.parse(fs.readFileSync(tmp, 'utf8')); // prove tmp parses before touching live
  fs.copyFileSync(CARDS_DB_PATH, backup);
  fs.renameSync(tmp, CARDS_DB_PATH);

  LOG(`OK — event cards ${oldEvents.length} -> ${cards.length} (+${added.length} new, ids E-${String(Math.min(...addedNums)).padStart(5, '0')}..E-${String(Math.max(...addedNums)).padStart(5, '0')})`);
  LOG(`per-event added: ${JSON.stringify(perEvent)}`);
  const nar = cards.filter(c => /naruto/i.test(c.cardName) && /halloween/i.test(c.eventName || ''));
  LOG(`naruto+halloween in new block: ${nar.map(c => `${c.id} ${c.cardName} (T${c.tier}, ${c.animeName})`).join('; ') || 'NONE'}`);
  LOG(`backup: ${backup}`);
  await mongoose.disconnect();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
