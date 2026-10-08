#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 *  SHOOB REGULAR-CARD SCRAPER — the missing non-event cards, no Chromium
 * ============================================================================
 *
 *  Owner request (2026-10-08): "let's find all the regular cards, as in the
 *  non-event cards — we missed some". The Feb 2026 regular scrape (34370
 *  cards) predates a lot of the catalog; shoob.gg's own sitemap indexes
 *  36149 /cards/info pages. This miner closes that gap.
 *
 *  How it works (same SSR trick as the event scraper):
 *    - GET /sitemap/cards.1.xml              -> every regular card detail URL
 *    - diff vs live cards_data.json mongoIds -> the MISSING set
 *    - GET /cards/info/{mongoId}             -> SSR detail (og: meta):
 *         og:description = "Card Name from Real Series\nCreators:\n- Card Maker: X"
 *    - compose EXACT production 9-field regular schema:
 *         { id, cardName, animeName, tier, creator, imageUrl, detailUrl,
 *           description, page, scrapedAt }
 *      imageUrl follows the production convention:
 *         https://api.shoob.gg/site/api/cardr/{mongoId}?size=400
 *      (301s to the cdn resized asset — the same URL shape all 34370
 *      existing regular cards carry, so the bot's renderer just works)
 *
 *  ID STABILITY (critical, mirrors the event scraper contract):
 *    - regular ids are `<tier>-<5-digit-seq>` per tier (1-00001 ... S-00001);
 *      UserCard.cardId stores them verbatim
 *    - known mongoIds keep their id; genuinely-new cards append AFTER the
 *      current per-tier max, deterministically sorted (tier -> name -> mongoId)
 *
 *  Usage:
 *    node shoob-regular-scraper.js [options]
 *      --out <file>             output JSON (default: output/regular_cards_new.json)
 *      --db <file>              live cards_data.json reference (id preservation)
 *      --ids-file <file>        restrict to these mongoIds (array or {missing:[]})
 *      --limit <n>              hard cap on cards processed (testing)
 *      --concurrency <n>        parallel detail fetches (default 4)
 *      --delay <ms>             base politeness delay per worker (default 250)
 *      --refresh                re-fetch details even if cached
 *      --no-resume              ignore the sidecar detail cache
 *      --mirror-media <dir>     archive every new card's media (<dir>/<tier>/)
 *      --media-only             skip the crawl; mirror media for --out cards
 *      --media-concurrency <n>  parallel media downloads (default 3)
 *      --media-delay <ms>       politeness delay per media lane (default 200)
 *      --disk-floor-mb <n>      stop mirroring below this free disk (default 2048)
 *      --ua <agent>             override User-Agent
 *
 *  Zero npm deps. Node 18+. Tested against live shoob.gg (Discordbot UA SSR).
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function argOf(name, def) {
  const i = argv.indexOf(name);
  if (i === -1) return def;
  const v = argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}
const OPTS = {
  out:        argOf('--out', path.join(__dirname, 'output', 'regular_cards_new.json')),
  db:         argOf('--db', null),
  idsFile:    argOf('--ids-file', null),
  limit:      parseInt(argOf('--limit', '0'), 10) || 0,
  concurrency: parseInt(argOf('--concurrency', '4'), 10),
  delay:      parseInt(argOf('--delay', '250'), 10),
  refresh:    argv.includes('--refresh'),
  resume:     !argv.includes('--no-resume'),
  mirrorMedia: argOf('--mirror-media', null),
  mediaOnly:  argv.includes('--media-only'),
  mediaConcurrency: parseInt(argOf('--media-concurrency', '3'), 10),
  mediaDelay: parseInt(argOf('--media-delay', '200'), 10),
  diskFloorMb: parseInt(argOf('--disk-floor-mb', '2048'), 10),
  ua: argOf('--ua', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'),
};

const SITEMAP_URL = 'https://shoob.gg/sitemap/cards.1.xml';
const TIER_ORDER = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, 'S': 7 };
const REQUEST_TIMEOUT_MS = 25000;
const RETRIES = 5;
let THROTTLE = 1;

// ── tiny helpers (same contract as the event scraper) ───────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (ms) => ms + Math.floor(Math.random() * Math.min(ms, 120));

function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

async function fetchText(url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(url, {
        headers: {
          'User-Agent': OPTS.ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        signal: ac.signal,
        redirect: 'follow',
      });
      clearTimeout(t);
      if (res.status === 429 || res.status === 503) {
        const ra = parseInt(res.headers.get('retry-after') || '0', 10);
        const wait = ra > 0 ? ra * 1000 : 1500 * attempt;
        console.log(`  [rate] ${res.status} on ${url} — waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }
      if (res.status === 404 || res.status === 410) return null; // gone = gone
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      THROTTLE = Math.max(1, THROTTLE * 0.97);
      return await res.text();
    } catch (e) {
      lastErr = e;
      THROTTLE = Math.min(THROTTLE * 1.6, 12);
      if (attempt < RETRIES) {
        const wait = 800 * attempt * attempt;
        console.log(`  [retry] ${url} attempt ${attempt} failed (${e.message}) — ${wait}ms (throttle x${THROTTLE.toFixed(1)})`);
        await sleep(wait);
      }
    }
  }
  throw new Error(`fetch failed after ${RETRIES} tries: ${url} (${lastErr.message})`);
}

const MEDIA_HEADERS = {
  // api.shoob.gg/site/api/cardr 401s crawler UAs (browser UA + referer = 200);
  // cdn.shoob.gg is UA-agnostic. Mimic the bot's own display fetch.
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Referer': 'https://shoob.gg/',
  'Accept': 'image/*,video/*,*/*',
};

async function fetchBinary(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 30000);
      const res = await fetch(url, { headers: MEDIA_HEADERS, signal: ac.signal, redirect: 'follow' });
      clearTimeout(t);
      if (res.status === 429 || res.status === 503) { await sleep(1500 * attempt); continue; }
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      THROTTLE = Math.max(1, THROTTLE * 0.97);
      return { buf, contentType: res.headers.get('content-type') || '' };
    } catch (e) {
      lastErr = e;
      THROTTLE = Math.min(THROTTLE * 1.6, 12);
      if (attempt < 3) await sleep(800 * attempt * attempt);
    }
  }
  throw lastErr;
}

function freeDiskMb(dir) {
  try {
    const out = execSync(`df -kP ${JSON.stringify(dir)}`).toString().trim().split('\n');
    const cols = out[out.length - 1].split(/\s+/);
    return Math.round(parseInt(cols[3], 10) / 1024);
  } catch { return Infinity; }
}

const safePart = (s) => String(s || 'x').toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'x';

const MEDIA_CT_TO_EXT = { 'image/gif': 'gif', 'video/webm': 'webm', 'image/webp': 'webp',
  'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'image/apng': 'apng' };

// ── parsers ─────────────────────────────────────────────────────────────────
/** Parse a /cards/info/{mongoId} SSR page. og:description is
 *  "Card Name from Real Series\nCreators:\n- Card Maker: someone". */
function parseRegularDetail(html) {
  const og =
    html.match(/property="og:description"\s+content="([\s\S]*?)"/) ||
    html.match(/content="([\s\S]*?)"\s+property="og:description"/) ||
    html.match(/name="description"\s+content="([\s\S]*?)"/) ||
    html.match(/content="([\s\S]*?)"\s+name="description"/);
  const desc = og ? decodeEntities(og[1]) : '';

  let cardName = null, realSeries = null, creator = null;
  if (desc) {
    const fromM = desc.match(/^(.*?)\s+from\s+(.*)$/m);
    if (fromM) {
      cardName = fromM[1].trim() || null;
      realSeries = fromM[2].split('\n')[0].trim() || null;
    }
    // capture to end of line (maker names may contain dashes)
    const maker = desc.match(/Card Maker:\s*([^\n]+)/);
    if (maker) creator = maker[1].replace(/\s*$/, '').trim() || null;
  }

  let tier = (html.match(/Tier\s+([1-6S])\b/) || html.match(/\bT([1-6S])\b/) || [])[1] || null;
  const ogImg =
    html.match(/property="og:image"\s+content="([^"]+)"/) ||
    html.match(/content="([^"]+)"\s+property="og:image"/) || null;
  const ogImage = ogImg ? decodeEntities(ogImg[1]) : null;
  if (!tier && ogImage) tier = (ogImage.match(/\/images\/cards\/([1-6S])\//) || [])[1] || null;

  return { cardName, realSeries, creator, tier, ogImage, desc };
}

// ── DB reference: known regular mongoIds + per-tier max seq ─────────────────
function loadDbReference(file) {
  if (!file || !fs.existsSync(file)) throw new Error(`--db reference required (${file || 'none'})`);
  console.log(`[db] loading reference: ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cards = Array.isArray(raw.cards) ? raw.cards : Object.values(raw.cards);
  const byMongoId = new Map();
  const tierSeqMax = {};   // '1'..'6' and 'S'
  let total = 0;
  for (const c of cards) {
    if (!c || !c.id || String(c.id).startsWith('E-')) continue;
    total++;
    const mongoId = (String(c.detailUrl || '').match(/\/cards\/info\/([0-9a-f]{24})$/) || [])[1];
    if (mongoId) byMongoId.set(mongoId, c);
    const m = String(c.id).match(/^(S|\d)-(\d+)$/);
    if (m) {
      const t = m[1], n = parseInt(m[2], 10);
      if (!tierSeqMax[t] || n > tierSeqMax[t]) tierSeqMax[t] = n;
    }
  }
  console.log(`[db] ${total} regular cards, ${byMongoId.size} with mongoIds, per-tier max seq: ${JSON.stringify(tierSeqMax)}`);
  return { byMongoId, tierSeqMax, total };
}

// ── concurrent worker pool ───────────────────────────────────────────────────
async function runPool(items, worker, concurrency, delay) {
  const results = new Array(items.length);
  let cursor = 0;
  async function lane() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try { results[i] = await worker(items[i], i); }
      catch (e) { results[i] = { __error: e.message, item: items[i] }; }
      await sleep(jitter(delay * THROTTLE));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane));
  return results;
}

// ── media mirror (idempotent, id-keyed, tier subdirs) ───────────────────────
async function mirrorMedia(cards) {
  const dir = OPTS.mirrorMedia;
  fs.mkdirSync(dir, { recursive: true });
  const manPath = path.join(dir, 'manifest.json');
  let manifest = { updatedAt: null, totalFiles: 0, totalBytes: 0, files: {} };
  try { manifest = JSON.parse(fs.readFileSync(manPath, 'utf8')); } catch {}
  if (!manifest.files) manifest.files = {};

  let files = 0, bytes = 0, failures = 0, skipped = 0, diskStop = false;
  const t0 = Date.now();
  let cursor = 0;
  const saveManifest = () => {
    manifest.updatedAt = new Date().toISOString();
    manifest.totalFiles = Object.keys(manifest.files).length;
    manifest.totalBytes = Object.values(manifest.files).reduce((a, f) => a + (f.bytes || 0), 0);
    try { fs.writeFileSync(manPath, JSON.stringify(manifest)); } catch {}
  };

  async function lane() {
    for (;;) {
      if (diskStop) return;
      const i = cursor++;
      if (i >= cards.length) return;
      const c = cards[i];
      if (!c.imageUrl || !c.id) continue;
      const tierDir = path.join(dir, safePart(c.tier));
      const base = `${c.id}_${safePart(c.cardName)}`;
      try {
        if (fs.existsSync(tierDir)) {
          const have = fs.readdirSync(tierDir).find(f => f.startsWith(base + '.'));
          if (have) {
            const st = fs.statSync(path.join(tierDir, have));
            if (st.size > 0) { skipped++; manifest.files[c.id] = manifest.files[c.id] || { file: path.join(tierDir, have), bytes: st.size, url: c.imageUrl, status: 'cached' }; continue; }
          }
        }
      } catch {}
      try {
        if (freeDiskMb(dir) < OPTS.diskFloorMb) {
          console.warn(`edia] disk floor ${OPTS.diskFloorMb}MB reached — stopping mirror (rest of run unaffected)`);
          diskStop = true; return;
        }
        const r = await fetchBinary(c.imageUrl);
        if (!r) { manifest.files[c.id] = { url: c.imageUrl, status: 'gone' }; continue; }
        let finalExt = MEDIA_CT_TO_EXT[(r.contentType || '').split(';')[0].trim()] || null;
        if (!finalExt) {
          const em = String(c.imageUrl).match(/\.(gif|webm|mp4|jpe?g|png|webp|apng)(\?|$)/i);
          finalExt = em ? em[1].toLowerCase() : 'bin';
        }
        fs.mkdirSync(tierDir, { recursive: true });
        const dest = path.join(tierDir, `${base}.${finalExt}`);
        const tmp = dest + '.part';
        fs.writeFileSync(tmp, r.buf);
        fs.renameSync(tmp, dest);
        manifest.files[c.id] = { file: dest, bytes: r.buf.length, url: c.imageUrl, status: 'ok' };
        files++; bytes += r.buf.length;
      } catch (e) {
        failures++;
        manifest.files[c.id] = { url: c.imageUrl, status: 'error', error: String(e.message).slice(0, 120) };
      }
      if (files % 50 === 0 && files > 0) { saveManifest(); console.log(`edia] ${files} new, ${skipped} cached, ${failures} failed (${(bytes / 1048576).toFixed(0)}MB)`); }
      await sleep(jitter(OPTS.mediaDelay * THROTTLE));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, OPTS.mediaConcurrency) }, lane));
  saveManifest();
  const stats = { files, bytes, failures, skipped, totalTracked: manifest.totalFiles, totalBytes: manifest.totalBytes, dir };
  console.log(`edia] done in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${files} downloaded, ${skipped} cached, ${failures} failed, archive ${manifest.totalFiles} files / ${(manifest.totalBytes / 1048576).toFixed(0)}MB`);
  return stats;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async function main() {
  const t0 = Date.now();
  console.log('=== shoob-regular-scraper (no Chromium, zero deps) ===');
  console.log(`ua: ${OPTS.ua}`);
  fs.mkdirSync(path.dirname(OPTS.out), { recursive: true });

  // media-only fast path
  if (OPTS.mediaOnly) {
    if (!fs.existsSync(OPTS.out)) { console.error(`--media-only needs an existing --out (${OPTS.out})`); process.exit(1); }
    const doc = JSON.parse(fs.readFileSync(OPTS.out, 'utf8'));
    const cards = doc.cards || [];
    console.log(`edia-only] ${cards.length} cards from ${OPTS.out}`);
    await mirrorMedia(cards);
    console.log('DONE (media-only).');
    return;
  }

  // 0. reference DB
  const ref = loadDbReference(OPTS.db);

  // 1. discovery: sitemap (whole regular catalog) or --ids-file
  let missing;
  if (OPTS.idsFile && fs.existsSync(OPTS.idsFile)) {
    const parsed = JSON.parse(fs.readFileSync(OPTS.idsFile, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : (parsed.missing || []);
    missing = [...new Set(list)];
    console.log(`[ids] --ids-file: ${missing.length} mongoIds`);
  } else {
    console.log(`[sitemap] fetching ${SITEMAP_URL} ...`);
    const xml = await fetchText(SITEMAP_URL);
    if (!xml) throw new Error('sitemap fetch returned null');
    const siteIds = [...xml.matchAll(/\/cards\/info\/([0-9a-f]{24})</g)].map(m => m[1]);
    const siteSet = new Set(siteIds);
    console.log(`[sitemap] ${siteSet.size} unique card pages`);
    missing = siteIds.filter(id => !ref.byMongoId.has(id));
    // site cards that vanished (report only — never delete production rows)
    const vanished = [...ref.byMongoId.keys()].filter(id => !siteSet.has(id));
    console.log(`[diff] on site, missing from DB: ${missing.length} · in DB, gone from site: ${vanished.length} (kept untouched)`);
    var vanishedCount = vanished.length;
  }

  // 2. detail pass with sidecar cache (crash-safe, saved per chunk)
  const cachePath = path.join(path.dirname(OPTS.out), '.regdetail_cache.json');
  const detailById = new Map();
  if (OPTS.resume && fs.existsSync(cachePath)) {
    try {
      const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      for (const [id, d] of Object.entries(c)) detailById.set(id, d);
      console.log(`[cache] ${detailById.size} details from sidecar ${cachePath}`);
    } catch {}
  }
  const saveCache = () => {
    try { fs.writeFileSync(cachePath, JSON.stringify(Object.fromEntries(detailById))); } catch {}
  };

  if (OPTS.limit > 0 && missing.length > OPTS.limit) {
    console.log(`[limit] capping ${missing.length} -> ${OPTS.limit} (--limit)`);
    missing = missing.slice(0, OPTS.limit);
  }

  const needFetch = missing.filter(id => OPTS.refresh || !detailById.has(id));
  console.log(`[details] ${missing.length - needFetch.length} cached, ${needFetch.length} to fetch`);
  const failed = [];
  let done = 0;
  const CHUNK = 150;
  for (let i = 0; i < needFetch.length; i += CHUNK) {
    const chunk = needFetch.slice(i, i + CHUNK);
    const results = await runPool(chunk, async (mongoId) => {
      const html = await fetchText(`https://shoob.gg/cards/info/${mongoId}`);
      if (html === null) return { __gone: true };
      return parseRegularDetail(html);
    }, OPTS.concurrency, OPTS.delay);
    chunk.forEach((mongoId, j) => {
      const d = results[j];
      if (d && d.__gone) { failed.push({ mongoId, reason: 'gone (404)' }); return; }
      if (d && !d.__error && d.cardName) { detailById.set(mongoId, d); return; }
      const reason = d && d.__error ? d.__error : (!d || !d.cardName) ? 'unparseable detail page' : 'unknown';
      failed.push({ mongoId, reason: String(reason).slice(0, 120) });
    });
    done = Math.min(done + chunk.length, needFetch.length);
    console.log(`[details] ${done}/${needFetch.length} (cache ${detailById.size})`);
    saveCache();
  }

  // 3. compose exact production-schema records
  const nowIso = new Date().toISOString();
  const records = [];
  for (const mongoId of missing) {
    const d = detailById.get(mongoId);
    if (!d || !d.cardName) continue; // failed/gone — reported, retried next cycle
    const series = d.realSeries || 'Unknown';
    const tier = d.tier || '1';
    records.push({
      cardName: d.cardName,
      animeName: series,
      tier,
      creator: (d.creator != null && d.creator !== '') ? d.creator : 'Anonymous',
      imageUrl: `https://api.shoob.gg/site/api/cardr/${mongoId}?size=400`,
      detailUrl: `https://shoob.gg/cards/info/${mongoId}`,
      description: `${d.cardName} from ${series}`,
      page: null,
      scrapedAt: nowIso,
      _mongoId: mongoId,
      _ogImage: d.ogImage || null,
    });
  }

  // 4. id assignment — deterministic append per tier
  const nextSeq = { ...ref.tierSeqMax };
  records.sort((a, b) =>
    (TIER_ORDER[a.tier] || 9) - (TIER_ORDER[b.tier] || 9) ||
    a.cardName.localeCompare(b.cardName) ||
    a._mongoId.localeCompare(b._mongoId));
  for (const r of records) {
    nextSeq[r.tier] = (nextSeq[r.tier] || 0) + 1;
    r.id = `${r.tier}-${String(nextSeq[r.tier]).padStart(5, '0')}`;
  }
  const perTier = {};
  for (const r of records) perTier[r.tier] = (perTier[r.tier] || 0) + 1;
  console.log(`[ids] assigned ${records.length} new regular ids: ${JSON.stringify(perTier)} (ceilings ${JSON.stringify(nextSeq)})`);

  // 5. emit (EXACT production card schema on every record)
  const outCards = records.map((r) => ({
    id: r.id,
    cardName: r.cardName,
    animeName: r.animeName,
    tier: r.tier,
    creator: r.creator,
    imageUrl: r.imageUrl,
    detailUrl: r.detailUrl,
    description: r.description,
    page: r.page,
    scrapedAt: r.scrapedAt,
  }));
  const outDoc = {
    totalCards: outCards.length,
    uniqueCards: outCards.length,
    lastUpdated: nowIso,
    cards: outCards,
    metadata: {
      organized: true,
      perTier,
      nextSeqPerTier: nextSeq,
      source: 'shoob.gg regular catalog (SSR sitemap diff, no-Chromium)',
      scraper: 'shoob-regular-scraper v1',
      failedCount: failed.length,
    },
  };
  fs.writeFileSync(OPTS.out, JSON.stringify(outDoc, null, 2));
  console.log(`\n[write] ${OPTS.out} — ${outCards.length} new regular cards`);

  // 6. sidecar report
  const reportPath = OPTS.out.replace(/\.json$/, '') + '.report.json';
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: nowIso,
    counts: {
      missingOnSite: missing.length,
      composed: records.length,
      failed: failed.length,
      inDbGoneFromSite: vanishedCount != null ? vanishedCount : null,
    },
    perTier,
    nextSeqPerTier: nextSeq,
    failedSample: failed.slice(0, 25),
  }, null, 2));
  console.log(`[report] ${reportPath}`);

  // 7. media mirror AFTER outputs are safe
  let mediaStats = null;
  if (OPTS.mirrorMedia) {
    try { mediaStats = await mirrorMedia(outCards); }
    catch (e) { console.warn(`edia] mirror failed (outputs unaffected): ${e.message}`); }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDONE in ${secs}s — ${outCards.length} new regular cards${mediaStats ? `, media ${mediaStats.files} new / ${mediaStats.skipped} cached / ${mediaStats.failures} failed` : ''}, zero Chromium.`);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
