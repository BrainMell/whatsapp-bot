#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 *  SHOOB CARD MINER — supervisor loop (Box 1)
 * ============================================================================
 *
 *  Wraps shoob-event-scraper.js in a repeating cycle and publishes every
 *  cycle's findings to the SHARED MongoDB (both boxes point at the same DB),
 *  so the `.j mentoring` command on ANY bot (e.g. Joker on Box 2) can show:
 *    - whether the miner is alive and what the last cycle found
 *    - which mined cards are NOT yet in that box's live cards_data.json
 *    - the full mined event-card block (for owner-triggered promotion)
 *
 *  System (key/value) collection keys written:
 *    shoob_miner_status     -> miner identity, last cycle result, media stats
 *    shoob_miner_newcards   -> cumulative "not yet live" mined cards (cap 500)
 *    shoob_miner_eventblock -> full mined event block (promote source of truth)
 *
 *  One cycle = one full scrape (listing + details + merged DB) + media mirror.
 *  Details/media persist in output/. + media/, so cycles after the first are
 *  cheap (only new/changed cards are fetched; media skips what's on disk).
 *
 *  All knobs via env (see ecosystem.config.js). Zero npm deps beyond mongoose,
 *  which resolves from the host repo's node_modules.
 * ============================================================================
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const MINER_DIR = __dirname;
const REPO_ROOT = path.resolve(MINER_DIR, '..', '..');

// repo-root .env (MONGO_URI) — same env the bots boot with
try { require(path.join(REPO_ROOT, 'node_modules', 'dotenv')).config({ path: path.join(REPO_ROOT, '.env') }); } catch {}

const mongoose = require('mongoose'); // resolves via REPO_ROOT/node_modules

const OPTS = {
  liveDb:        process.env.MINER_LIVE_DB || path.join(REPO_ROOT, 'core', 'data', 'cards_data.json'),
  outDir:        process.env.MINER_OUT || path.join(MINER_DIR, 'output'),
  mediaDir:      process.env.MINER_MEDIA_DIR || path.join(MINER_DIR, 'media'),
  intervalMin:   parseFloat(process.env.MINER_INTERVAL_MIN || '45'),
  firstDelayMin: parseFloat(process.env.MINER_FIRST_DELAY_MIN || '0.25'),
  diskFloorMb:   parseInt(process.env.MINER_DISK_FLOOR_MB || '5120', 10),
  publish:       process.env.MINER_PUBLISH !== '0',
  mediaMirror:   process.env.MINER_MEDIA !== '0',
};

const LOG = (m) => console.log(`[wa-miner ${new Date().toISOString()}] ${m}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── mongo (System key/value) ──────────────────────────────────────────────
let System = null;
async function connectMongo() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI missing (repo .env)');
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const schema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  }, { timestamps: true });
  System = mongoose.models.System || mongoose.model('System', schema);
}

async function publishKey(key, value) {
  await System.findOneAndUpdate(
    { key },
    { value, $set: { updatedAt: new Date() } },
    { upsert: true }
  );
}

// ── live DB event ids (id-preservation reference + "new" detection) ────────
function liveEventIds() {
  const raw = JSON.parse(fs.readFileSync(OPTS.liveDb, 'utf8'));
  const cards = Array.isArray(raw.cards) ? raw.cards : Object.values(raw.cards);
  const ids = new Set();
  let total = 0, maxE = 0;
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

// ── one mining cycle ───────────────────────────────────────────────────────
function runScraper() {
  return new Promise((resolve, reject) => {
    const args = [
      'shoob-event-scraper.js',
      '--db', OPTS.liveDb,
      '--out', path.join(OPTS.outDir, 'event_cards.json'),
      '--merge-out', path.join(OPTS.outDir, 'cards_data_merged.json'),
    ];
    if (OPTS.mediaMirror) {
      args.push('--mirror-media', OPTS.mediaDir, '--disk-floor-mb', String(OPTS.diskFloorMb));
    }
    const child = spawn(process.execPath, args, { cwd: MINER_DIR, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`scraper exited ${code}`))));
    child.on('error', reject);
  });
}

async function cycle() {
  const startedAt = new Date();
  LOG(`cycle start (live db: ${OPTS.liveDb})`);

  const before = liveEventIds();
  LOG(`live reference: ${before.total} cards, ${before.eventCount} event (max E-${String(before.maxE).padStart(5, '0')})`);

  await runScraper();

  const out = JSON.parse(fs.readFileSync(path.join(OPTS.outDir, 'event_cards.json'), 'utf8'));
  const reportPath = path.join(OPTS.outDir, 'event_cards.report.json');
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : {};

  // media stats from the mirror manifest
  let media = { totalFiles: 0, totalBytes: 0 };
  try {
    const man = JSON.parse(fs.readFileSync(path.join(OPTS.mediaDir, 'manifest.json'), 'utf8'));
    media = { totalFiles: man.totalFiles || 0, totalBytes: man.totalBytes || 0 };
  } catch {}

  const scraped = out.cards || [];
  const minedNew = scraped.filter(c => !before.ids.has(c.id));
  const liveIdsNow = liveEventIds(); // unchanged during cycle, but cheap + safe
  const pending = minedNew.filter(c => !liveIdsNow.ids.has(c.id));

  // cumulative pending list (previous ∪ current, minus anything now live)
  let cumulative = [];
  if (System) {
    try {
      const prev = await System.findOne({ key: 'shoob_miner_newcards' });
      const prevCards = (prev && prev.value && prev.value.cards) || [];
      const byId = new Map(prevCards.map(c => [c.id, c]));
      for (const c of pending) byId.set(c.id, { ...c, foundAt: c.foundAt || startedAt.toISOString() });
      cumulative = [...byId.values()].filter(c => !liveIdsNow.ids.has(c.id)).slice(-500);
    } catch (e) { LOG(`newcards merge failed: ${e.message}`); cumulative = pending.slice(-500); }
  }

  const status = {
    miner: { host: require('os').hostname(), app: 'wa-miner', pid: process.pid },
    cycle: {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMin: +((Date.now() - startedAt.getTime()) / 60000).toFixed(1),
    },
    liveReference: { totalCards: liveIdsNow.total, eventCards: liveIdsNow.eventCount, maxE: `E-${String(liveIdsNow.maxE).padStart(5, '0')}` },
    lastResult: {
      scraped: report.counts ? report.counts.scraped : scraped.length,
      preservedIds: report.counts ? report.counts.preservedIds : null,
      newIdsThisCycle: report.counts ? report.counts.newIds : minedNew.length,
      keptRemoved: report.counts ? report.counts.keptRemoved : null,
      events: out.metadata ? out.metadata.totalEvents : null,
      perEvent: out.metadata ? out.metadata.perEvent : null,
    },
    media,
    pendingNewCount: pending.length,
    intervalMin: OPTS.intervalMin,
    nextRunAt: new Date(Date.now() + OPTS.intervalMin * 60000).toISOString(),
  };

  if (System && OPTS.publish) {
    await publishKey('shoob_miner_status', status);
    await publishKey('shoob_miner_newcards', { updatedAt: new Date().toISOString(), count: cumulative.length, cards: cumulative });
    await publishKey('shoob_miner_eventblock', {
      updatedAt: new Date().toISOString(),
      totalCards: scraped.length,
      source: 'wa-miner (shoob.gg SSR, no-Chromium)',
      cards: scraped,
    });
    LOG(`published: status + ${cumulative.length} pending-new + eventblock (${scraped.length})`);
  } else {
    LOG('publish disabled or mongo down — wrote outputs only');
  }

  LOG(`cycle done in ${status.cycle.durationMin}min — scraped ${status.lastResult.scraped}, new ids ${status.lastResult.newIdsThisCycle}, pending-live ${pending.length}, media ${media.totalFiles} files / ${(media.totalBytes / 1048576).toFixed(0)}MB`);
}

// ── main loop ───────────────────────────────────────────────────────────────
(async () => {
  LOG(`boot: interval ${OPTS.intervalMin}min, media ${OPTS.mediaMirror ? OPTS.mediaDir : 'off'}, disk floor ${OPTS.diskFloorMb}MB, publish ${OPTS.publish}`);
  if (OPTS.publish) {
    try { await connectMongo(); LOG('mongo connected (shared DB)'); }
    catch (e) { LOG(`mongo connect failed (${e.message}) — continuing WITHOUT publishing, will retry each cycle`); }
  }

  let shuttingDown = false;
  const stop = async (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    LOG(`${sig} — shutting down after current work`);
    try { if (mongoose.connection.readyState === 1) await mongoose.disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  let firstCycle = true;
  for (;;) {
    if (firstCycle) {
      firstCycle = false;
      const warmupMs = Math.max(0, OPTS.firstDelayMin) * 60000;
      if (warmupMs > 0) { LOG(`warm-up ${(warmupMs / 60000).toFixed(1)}min before first cycle`); await sleep(warmupMs); }
    }
    try {
      if (OPTS.publish && mongoose.connection.readyState !== 1) {
        try { await connectMongo(); } catch (e) { LOG(`mongo retry failed: ${e.message}`); }
      }
      await cycle();
    } catch (e) {
      LOG(`cycle FAILED: ${e.message}`);
      if (System && OPTS.publish) {
        try {
          await publishKey('shoob_miner_status', {
            miner: { host: require('os').hostname(), app: 'wa-miner', pid: process.pid },
            lastError: { at: new Date().toISOString(), message: String(e.message).slice(0, 300) },
            nextRunAt: new Date(Date.now() + OPTS.intervalMin * 60000).toISOString(),
            intervalMin: OPTS.intervalMin,
          });
        } catch {}
      }
    }
    const waitMs = OPTS.intervalMin * 60000;
    LOG(`sleeping ${(waitMs / 60000).toFixed(0)}min -> ${new Date(Date.now() + waitMs).toISOString()}`);
    // interruptible sleep
    await sleep(waitMs);
  }
})();
