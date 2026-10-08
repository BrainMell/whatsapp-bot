#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 *  SHOOB EVENT-CARD SCRAPER — lightweight, zero-dependency, NO Chromium
 * ============================================================================
 *
 *  Replaces the Puppeteer-based Shoob scraper for EVENT CARDS.
 *
 *  How it works (the whole trick):
 *  ------------------------------
 *  shoob.gg server-side-renders every catalog page it wants indexed by
 *  Google / Discord / Twitter embeds. Asking with a well-known crawler
 *  User-Agent returns the FULL prerendered HTML via plain HTTP:
 *    - GET /card-events                        -> list of event slugs
 *    - GET /card-events/{slug}?page=N          -> 15 cards per page (SSR grid)
 *    - GET /card-events/{slug}/{mongoId}       -> card detail (SSR, og: meta)
 *  No browser, no cookies, no Cloudflare clearance needed (HTTP 200, ~11-14KB
 *  per page). Node 18+ global fetch only. Zero npm dependencies.
 *
 *  Output: EXACT structure of the bot's cards_data.json:
 *    { totalCards, uniqueCards, processedPages, lastUpdated, cards[], metadata }
 *  Event-card records use the exact 9-field schema already in production:
 *    { id, cardName, animeName, tier, creator, imageUrl, detailUrl,
 *      description, eventName }
 *
 *  ID STABILITY (critical):
 *    UserCard.cardId stores the "E-#####" library id, and cardSystem.js
 *    resolves event cards by that exact id (isEventCard = id.startsWith('E-')).
 *    Therefore this scraper:
 *      - matches scraped cards to the existing DB by mongoId (parsed from
 *        detailUrl) and PRESERVES their E-##### ids;
 *      - assigns fresh ids to genuinely-new cards, appended after the
 *        current max (E-02122...), deterministically sorted;
 *      - keeps cards that vanished from the site by default
 *        (--prune-removed to drop them; NOT recommended while inventories
 *        reference them).
 *
 *  Usage:
 *    node shoob-event-scraper.js [options]
 *      --out <file>            output JSON        (default: output/event_cards.json)
 *      --db <file>             production cards_data.json reference for id
 *                              preservation + eventName canonicalization
 *      --merge-out <file>      ALSO write a full merged cards_data.json
 *                              (regular cards untouched + refreshed event block)
 *      --events <a,b,c>        restrict to these slugs (default: all discovered)
 *      --concurrency <n>       parallel detail fetches (default 4)
 *      --delay <ms>            base politeness delay per worker (default 250)
 *      --refresh               re-fetch details even if cached in --out
 *      --prune-removed         drop cards no longer on the site (default: keep)
 *      --anime-name <mode>     'series' -> real series from og:description
 *                                 (default since the 2026-10-08 owner fix;
 *                                 falls back to event name when absent)
 *                                 'event'  -> animeName = eventName
 *      --ua <agent>            override User-Agent
 *      --no-resume             ignore existing --out checkpoint
 *      --mirror-media <dir>    ALSO download every card's media (gif/webm/
 *                              jpg/png) into <dir>/<event>/<id>_<name>.<ext>
 *                              + write <dir>/manifest.json. Live cards first,
 *                              tombstones best-effort after. Files already on
 *                              disk are skipped (id-keyed -> safe re-runs).
 *      --media-only            skip the site crawl; mirror media for the
 *                              cards already in --out (id + imageUrl needed)
 *      --media-concurrency <n> parallel media downloads (default 3)
 *      --media-delay <ms>      politeness delay per media lane (default 200)
 *      --disk-floor-mb <n>     stop mirroring when free disk drops below
 *                              this (default 2048)
 *      --no-tombstone-media    don't archive media for rotated-out cards
 *
 *  Tested: Node 18+/22. Zero deps. ~2700 requests for a full refresh.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function argOf(name, def) {
  const i = argv.indexOf(name);
  if (i === -1) return def;
  const v = argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}
const OPTS = {
  out:        argOf('--out', path.join(__dirname, 'output', 'event_cards.json')),
  db:         argOf('--db', null),
  mergeOut:   argOf('--merge-out', null),
  events:     argOf('--events', null),
  concurrency: parseInt(argOf('--concurrency', '4'), 10),
  delay:      parseInt(argOf('--delay', '250'), 10),
  refresh:    argv.includes('--refresh'),
  prune:      argv.includes('--prune-removed'),
  animeNameMode: argOf('--anime-name', 'series'),
  ua: argOf('--ua', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'),
  resume: !argv.includes('--no-resume'),
  mirrorMedia:  argOf('--mirror-media', null),
  mediaOnly:    argv.includes('--media-only'),
  mediaConcurrency: parseInt(argOf('--media-concurrency', '3'), 10),
  mediaDelay:   parseInt(argOf('--media-delay', '200'), 10),
  diskFloorMb:  parseInt(argOf('--disk-floor-mb', '2048'), 10),
  noTombstoneMedia: argv.includes('--no-tombstone-media'),
};

const BASE = 'https://shoob.gg';
const TIER_ORDER = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, 'S': 7 };
const PAGE_SIZE = 15;              // shoob SSR grid page size
const MAX_PAGES_PER_EVENT = 500;   // hard safety cap
const REQUEST_TIMEOUT_MS = 25000;
const RETRIES = 5;

// ── tiny helpers ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (ms) => ms + Math.floor(Math.random() * Math.min(ms, 120));

// Adaptive throttle: multiplies every politeness delay. Grows on failures/
// aborts (site is stalling us), decays on success. Self-healing.
let THROTTLE = 1;

function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      THROTTLE = Math.max(1, THROTTLE * 0.97);
      return await res.text();
    } catch (e) {
      lastErr = e;
      THROTTLE = Math.min(THROTTLE * 1.6, 12);
      if (attempt < RETRIES) {
        // aborts (timeouts) get progressively longer cooling-off — the site
        // occasionally stalls a connection; hammering makes it worse
        const wait = 800 * attempt * attempt;
        console.log(`  [retry] ${url} attempt ${attempt} failed (${e.message}) — ${wait}ms (throttle x${THROTTLE.toFixed(1)})`);
        await sleep(wait);
      }
    }
  }
  throw new Error(`fetch failed after ${RETRIES} tries: ${url} (${lastErr.message})`);
}

// ── media mirror (gif/webm archive) ────────────────────────────────────────
const { execSync } = require('child_process');
const MEDIA_EXT_RE = /\.(gif|webm|mp4|jpg|jpeg|png|webp|apng)(\?|$)/i;
const CT_TO_EXT = { 'image/gif': '.gif', 'video/webm': '.webm', 'image/webp': '.webp',
  'image/jpeg': '.jpg', 'image/png': '.png', 'video/mp4': '.mp4', 'image/apng': '.apng' };

function freeDiskMb(dir) {
  try {
    const out = execSync(`df -kP ${JSON.stringify(dir)}`).toString().trim().split('\n');
    const cols = out[out.length - 1].split(/\s+/);
    return Math.round(parseInt(cols[3], 10) / 1024); // available KB -> MB
  } catch { return Infinity; }
}

const safePart = (s) => String(s || 'x').toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'x';

async function fetchBinary(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 30000);
      const res = await fetch(url, { headers: { 'User-Agent': OPTS.ua }, signal: ac.signal, redirect: 'follow' });
      clearTimeout(t);
      if (res.status === 429 || res.status === 503) {
        await sleep(1500 * attempt); continue;
      }
      if (res.status === 404 || res.status === 410) return null; // gone = gone
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

/**
 * Mirror every card's media into <dir>/<event>/<id>_<name>.<ext>.
 * Live cards first (they rotate back OFF the site — archive them while the
 * CDN still serves them), tombstones best-effort after. Id-keyed filenames
 * make re-runs idempotent. Returns {files,bytes,failures,skipped}.
 */
async function mirrorMedia(cards) {
  const dir = OPTS.mirrorMedia;
  fs.mkdirSync(dir, { recursive: true });
  const manPath = path.join(dir, 'manifest.json');
  let manifest = { updatedAt: null, totalFiles: 0, totalBytes: 0, files: {} };
  try { manifest = JSON.parse(fs.readFileSync(manPath, 'utf8')); } catch {}
  if (!manifest.files) manifest.files = {};

  const ordered = [
    ...cards.filter(c => !c.__tombstone),
    ...(OPTS.noTombstoneMedia ? [] : cards.filter(c => c.__tombstone)),
  ];
  console.log(`[media] mirroring ${ordered.length} card assets -> ${dir} (live first, floor ${OPTS.diskFloorMb}MB)`);

  let files = 0, bytes = 0, failures = 0, skipped = 0, diskStop = false;
  const t0 = Date.now();
  const items = ordered.map((c) => ({ c }));
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
      if (i >= items.length) return;
      const { c } = items[i];
      if (!c.imageUrl || !c.id) continue;
      const extM = String(c.imageUrl).match(MEDIA_EXT_RE);
      const ext = extM ? extM[1].toLowerCase() : null;
      const eventDir = path.join(dir, safePart(c.eventName));
      const base = `${c.id}_${safePart(c.cardName)}`;
      // id-keyed prefix -> existing files are ALWAYS ours, skip without HEAD
      try {
        if (fs.existsSync(eventDir)) {
          const have = fs.readdirSync(eventDir).find(f => f.startsWith(base + '.'));
          if (have) {
            const st = fs.statSync(path.join(eventDir, have));
            if (st.size > 0) { skipped++; manifest.files[c.id] = manifest.files[c.id] || { file: path.join(eventDir, have), bytes: st.size, url: c.imageUrl, status: 'cached' }; continue; }
          }
        }
      } catch {}
      try {
        if (freeDiskMb(dir) < OPTS.diskFloorMb) {
          console.warn(`[media] disk floor ${OPTS.diskFloorMb}MB reached — stopping mirror (rest of run unaffected)`);
          diskStop = true; return;
        }
        const r = await fetchBinary(c.imageUrl);
        if (!r) { manifest.files[c.id] = { url: c.imageUrl, status: 'gone' }; continue; }
        let finalExt = ext || CT_TO_EXT[(r.contentType || '').split(';')[0].trim()] || '.bin';
        if (finalExt.startsWith('.')) finalExt = finalExt.slice(1);
        fs.mkdirSync(eventDir, { recursive: true });
        const dest = path.join(eventDir, `${base}.${finalExt}`);
        const tmp = dest + '.part';
        fs.writeFileSync(tmp, r.buf);
        fs.renameSync(tmp, dest); // atomic-ish, never leave half files under the real name
        manifest.files[c.id] = { file: dest, bytes: r.buf.length, url: c.imageUrl, status: 'ok' };
        files++; bytes += r.buf.length;
      } catch (e) {
        failures++;
        manifest.files[c.id] = { url: c.imageUrl, status: 'error', error: String(e.message).slice(0, 120) };
      }
      if (files % 50 === 0 && files > 0) { saveManifest(); console.log(`[media] ${files} new, ${skipped} cached, ${failures} failed (${(bytes / 1048576).toFixed(0)}MB)`); }
      await sleep(jitter(OPTS.mediaDelay * THROTTLE));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, OPTS.mediaConcurrency) }, lane));
  saveManifest();
  const stats = { files, bytes, failures, skipped, totalTracked: manifest.totalFiles, totalBytes: manifest.totalBytes, dir };
  console.log(`[media] done in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${files} downloaded, ${skipped} cached, ${failures} failed, archive ${manifest.totalFiles} files / ${(manifest.totalBytes / 1048576).toFixed(0)}MB`);
  return stats;
}

// ── SSR parsers ──────────────────────────────────────────────────────────────
/** Parse the /card-events index -> [slug, ...] */
function parseEventIndex(html) {
  const slugs = new Set();
  const re = /href="\/card-events\/([a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && m[1] !== 'card-events') slugs.add(m[1]);
  }
  return [...slugs];
}

/** Proper event display name from an event page <title> ("Olympics cards | ..."). */
function parseEventName(html, slug) {
  const t = html.match(/<title>([^<]*)<\/title>/);
  if (!t) return slug;
  let name = decodeEntities(t[1]).split('|')[0].trim();
  name = name.replace(/\s*cards?\s*$/i, '').trim();
  // acronym fixes for names the site title-cases incorrectly
  name = name.replace(/\bCcg\b/, 'CCG').replace(/\bMha\b/, 'MHA');
  return name || slug;
}

/**
 * Parse one listing page of /card-events/{slug}?page=N
 * -> [{ mongoId, cardName, imageUrl, tierFromCdn, detailUrl }]
 *
 * Handles BOTH static (<img>) and animated (<video>) card tiles.
 * Animated tiles point at a resized variant (eventcards/T/resized/100_sha.webm)
 * — normalized to the full-res asset (eventcards/T/sha.webm) which is what the
 * production DB stores and what the bot's spawn renderer expects.
 */
function parseListingPage(html, slug) {
  const cards = [];
  const anchorRe = /<a href="\/card-events\/([a-z0-9-]+)\/([0-9a-f]{24})">([\s\S]*?)<\/a>/g;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const [, evtSlug, mongoId, inner] = m;
    if (evtSlug !== slug) continue;
    const media = inner.match(/<div class="cardData"><(img|video)\s+src="([^"]+)"([\s\S]*?)>/);
    if (!media) continue;
    const attrs = media[3];
    const titleM = attrs.match(/title="([^"]*)"/);
    const altM = attrs.match(/alt="([^"]*)"/);
    const rawName = titleM ? titleM[1] : (altM ? altM[1] : '');
    if (!rawName) continue;
    let imageUrl = decodeEntities(media[2]);
    // normalize resized variants -> full-res asset (matches production DB)
    imageUrl = imageUrl.replace(/\/resized\/\d+_/, '/');
    const cardName = decodeEntities(rawName).trim();
    const tierFromCdn = (imageUrl.match(/\/images\/eventcards\/([^/]+)\//) || [])[1] || null;
    cards.push({
      mongoId,
      cardName,
      imageUrl,
      tierFromCdn,
      detailUrl: `${BASE}/card-events/${slug}/${mongoId}`,
    });
  }
  return cards;
}

/**
 * Parse a card detail page -> { realSeries, creator, tier }
 * og:description = "Card Name from Real Series\nCreators:\n- Card Maker: someone"
 */
function parseDetail(html) {
  const og =
    html.match(/property="og:description"\s+content="([\s\S]*?)"/) ||
    html.match(/content="([\s\S]*?)"\s+property="og:description"/) ||
    html.match(/name="description"\s+content="([\s\S]*?)"/) ||
    html.match(/content="([\s\S]*?)"\s+name="description"/);
  const desc = og ? decodeEntities(og[1]) : '';

  let realSeries = null;
  let creator = null;
  if (desc) {
    const fromM = desc.match(/^(.*?)\s+from\s+(.*)$/m);
    if (fromM) realSeries = fromM[2].split('\n')[0].trim() || null;
    const maker = desc.match(/Card Maker:\s*([^\n-]+)/);
    if (maker) creator = maker[1].trim() || null;
  }

  let tier = null;
  const tierM = html.match(/Tier\s+([1-6S])\b/) || html.match(/\bT([1-6S])\b/);
  if (tierM) tier = tierM[1];

  return { realSeries, creator, tier, desc };
}

// ── DB reference (id preservation + canonical event names) ──────────────────
function loadDbReference(file) {
  if (!file || !fs.existsSync(file)) return null;
  console.log(`[db] loading reference: ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cards = Array.isArray(raw.cards) ? raw.cards : [];
  const byMongoId = new Map();
  const slugToEventName = new Map();
  let maxE = 0;

  for (const c of cards) {
    if (!c || !c.id || !String(c.id).startsWith('E-')) continue;
    const mongoId = (String(c.detailUrl || '').match(/\/card-events\/[a-z0-9-]+\/([0-9a-f]{24})$/) || [])[1];
    if (mongoId) byMongoId.set(mongoId, c);
    const slug = (String(c.detailUrl || '').match(/\/card-events\/([a-z0-9-]+)\//) || [])[1];
    if (slug && c.eventName && !slugToEventName.has(slug)) slugToEventName.set(slug, c.eventName);
    const n = parseInt(String(c.id).slice(2), 10);
    if (Number.isFinite(n) && n > maxE) maxE = n;
  }
  console.log(`[db] ${byMongoId.size} existing event cards, max id E-${String(maxE).padStart(5, '0')}, ` +
    `${slugToEventName.size} canonical event names`);
  return { byMongoId, slugToEventName, maxE };
}

// ── concurrent worker pool ───────────────────────────────────────────────────
async function runPool(items, worker, concurrency, delay) {
  const results = new Array(items.length);
  let cursor = 0;
  async function lane() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = { __error: e.message, item: items[i] };
      }
      await sleep(jitter(delay * THROTTLE));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane));
  return results;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async function main() {
  const t0 = Date.now();
  console.log('=== shoob-event-scraper (no Chromium, zero deps) ===');
  console.log(`ua: ${OPTS.ua}`);
  fs.mkdirSync(path.dirname(OPTS.out), { recursive: true });

  // ── media-only fast path: mirror assets for an existing --out file ──
  if (OPTS.mediaOnly) {
    if (!fs.existsSync(OPTS.out)) { console.error(`--media-only needs an existing --out (${OPTS.out})`); process.exit(1); }
    const doc = JSON.parse(fs.readFileSync(OPTS.out, 'utf8'));
    const cards = (doc.cards || []).map(c => ({ ...c, __tombstone: false }));
    console.log(`[media-only] ${cards.length} cards from ${OPTS.out}`);
    const stats = await mirrorMedia(cards);
    console.log(`DONE (media-only) — archive ${stats.totalTracked} files / ${(stats.totalBytes / 1048576).toFixed(0)}MB`);
    return;
  }

  // 0. reference DB
  const ref = loadDbReference(OPTS.db);

  // 2. discover events
  const indexHtml = await fetchText(`${BASE}/card-events`);
  let slugs = parseEventIndex(indexHtml);
  if (OPTS.events) {
    const want = String(OPTS.events).split(',').map(s => s.trim()).filter(Boolean);
    slugs = slugs.filter(s => want.includes(s));
  }
  console.log(`[events] ${slugs.length} events: ${slugs.join(', ')}`);
  if (!slugs.length) { console.error('No events discovered — aborting.'); process.exit(1); }

  // 3. crawl listing pages per event
  const processedPages = [];
  const listing = [];
  const eventNameBySlug = new Map();

  for (const slug of slugs) {
    const firstHtml = await fetchText(`${BASE}/card-events/${slug}`);
    const siteName = parseEventName(firstHtml, slug);
    const eventName = (ref && ref.slugToEventName.get(slug)) || siteName;
    eventNameBySlug.set(slug, eventName);
    console.log(`[event] ${slug} -> "${eventName}" (site title: "${siteName}")`);

    const seen = new Set();
    let page = 1;
    let eventCount = 0;
    let pagesWithCards = 0;
    let listingFailures = 0;
    for (; page <= MAX_PAGES_PER_EVENT; page++) {
      let html;
      try {
        html = page === 1 ? firstHtml : await fetchText(`${BASE}/card-events/${slug}?page=${page}`);
      } catch (e) {
        // transient site stall — do NOT kill the whole run; keep what we have
        console.warn(`[warn] listing page failed for ${slug}?page=${page}: ${e.message} — stopping this event here`);
        listingFailures++;
        break;
      }
      const rows = parseListingPage(html, slug);
      const fresh = rows.filter(r => !seen.has(r.mongoId));
      if (!fresh.length) break;
      fresh.forEach(r => { seen.add(r.mongoId); listing.push({ slug, eventName, ...r }); });
      eventCount += fresh.length;
      pagesWithCards++;
      processedPages.push(`event:${slug}:p${page}`);
      if (rows.length < PAGE_SIZE) break;   // short page = last page
      await sleep(jitter(OPTS.delay * THROTTLE));
    }
    console.log(`[event] ${slug}: ${eventCount} cards on ${pagesWithCards} page(s)${listingFailures ? ` (${listingFailures} page fetch failure${listingFailures > 1 ? 's' : ''})` : ''}`);
  }

  // 4. dedupe listings across events (same mongoId twice = safety)
  const byMongo = new Map();
  for (const row of listing) {
    const prev = byMongo.get(row.mongoId);
    if (!prev) byMongo.set(row.mongoId, row);
    else if (!prev.eventName && row.eventName) prev.eventName = row.eventName;
  }
  const unique = [...byMongo.values()];
  console.log(`[listings] ${unique.length} unique cards across ${slugs.length} events`);

  // 5. detail pass (creator + real series + tier confirm)
  //    - persistent sidecar cache: output/.detail_cache.json (crash-safe,
  //      saved every chunk — a re-run never re-fetches a completed card)
  const cachePath = path.join(path.dirname(OPTS.out), '.detail_cache.json');
  const detailByUrl = new Map();
  if (OPTS.resume && fs.existsSync(cachePath)) {
    try {
      const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      for (const [url, d] of Object.entries(c)) detailByUrl.set(url, d);
      console.log(`[cache] ${detailByUrl.size} details from sidecar ${cachePath}`);
    } catch { /* ignore corrupt cache */ }
  }
  const saveCache = () => {
    try { fs.writeFileSync(cachePath, JSON.stringify(Object.fromEntries(detailByUrl))); } catch {}
  };

  const needFetch = unique.filter(r => OPTS.refresh || !detailByUrl.has(r.detailUrl));
  const cachedCount = unique.length - needFetch.length;
  console.log(`[details] ${cachedCount} cached, ${needFetch.length} to fetch`);

  let done = 0;
  const CHUNK = 150;
  for (let i = 0; i < needFetch.length; i += CHUNK) {
    const chunk = needFetch.slice(i, i + CHUNK);
    const results = await runPool(chunk, async (row) => {
      const html = await fetchText(row.detailUrl);
      done++;
      return parseDetail(html);
    }, OPTS.concurrency, OPTS.delay);
    chunk.forEach((row, j) => {
      const d = results[j];
      if (d && !d.__error) detailByUrl.set(row.detailUrl, d);
      else console.warn(`[warn] detail failed: ${row.detailUrl} -> ${d && d.__error}`);
    });
    console.log(`[details] ${Math.min(done, needFetch.length)}/${needFetch.length}`);
    saveCache();
  }

  // 6. compose exact-schema records
  const nowIso = new Date().toISOString();
  const records = unique.map((row) => {
    const d = detailByUrl.get(row.detailUrl) || {};
    const eventName = row.eventName;
    const tier = d.tier || row.tierFromCdn || '1';
    const animeName = (OPTS.animeNameMode === 'series' && d.realSeries) ? d.realSeries : eventName;
    return {
      cardName: row.cardName,
      animeName,
      tier,
      // production DB convention: unknown makers are 'Anonymous' (legacy
      // Puppeteer scrape wrote that; keep it so values stay consistent)
      creator: (d.creator != null && d.creator !== '') ? d.creator : 'Anonymous',
      imageUrl: row.imageUrl,
      detailUrl: row.detailUrl,
      description: `${row.cardName} from ${eventName}`,
      eventName,
      _mongoId: row.mongoId,
      _realSeries: d.realSeries,
    };
  });

  // 7. id assignment — preserve existing, append new (deterministic)
  let nextE = ref ? ref.maxE : 0;
  const unassigned = [];
  let preserved = 0;
  for (const r of records) {
    const existing = ref && ref.byMongoId.get(r._mongoId);
    if (existing) { r._id = existing.id; preserved++; }
    else unassigned.push(r);
  }
  unassigned.sort((a, b) =>
    a.eventName.localeCompare(b.eventName) ||
    (TIER_ORDER[a.tier] || 9) - (TIER_ORDER[b.tier] || 9) ||
    a.cardName.localeCompare(b.cardName) ||
    a._mongoId.localeCompare(b._mongoId));
  for (const r of unassigned) {
    nextE += 1;
    r._id = `E-${String(nextE).padStart(5, '0')}`;
  }
  console.log(`[ids] preserved ${preserved} existing, assigned ${unassigned.length} new (up to E-${String(nextE).padStart(5, '0')})`);

  // 8. tombstones: production cards whose mongoId was not found on the site
  let keptRemoved = 0;
  if (ref && !OPTS.prune) {
    const scrapedMongo = new Set(records.map(r => r._mongoId));
    for (const [mongoId, oldCard] of ref.byMongoId) {
      if (!scrapedMongo.has(mongoId)) {
        const tCopy = Object.assign({}, oldCard, { _id: oldCard.id, _mongoId: mongoId, __tombstone: true });
        // real-series backfill for rotated-out cards: detail pages stay live,
        // sidecar cache resolves their og:description — animeName becomes the
        // actual anime series instead of the event label
        if (OPTS.animeNameMode === 'series') {
          const td = detailByUrl.get(oldCard.detailUrl);
          if (td && td.realSeries) tCopy.animeName = td.realSeries;
        }
        records.push(tCopy);
        keptRemoved++;
      }
    }
    if (keptRemoved) console.log(`[tombstone] kept ${keptRemoved} cards missing from the site (references intact for inventories)`);
  }

  // 9. final ordering: eventName, tier, id (production-style event block)
  records.sort((a, b) =>
    a.eventName.localeCompare(b.eventName) ||
    (TIER_ORDER[a.tier] || 9) - (TIER_ORDER[b.tier] || 9) ||
    String(a._id).localeCompare(String(b._id), 'en', { numeric: true }));

  // 10. emit event-cards file (EXACT schema)
  const outCards = records.map((r) => ({
    id: r._id,
    cardName: r.cardName,
    animeName: r.animeName,
    tier: r.tier,
    creator: r.creator,
    imageUrl: r.imageUrl,
    detailUrl: r.detailUrl,
    description: r.description,
    eventName: r.eventName,
  }));

  const tierBreakdown = {};
  const perEvent = {};
  for (const c of outCards) {
    tierBreakdown[c.tier] = (tierBreakdown[c.tier] || 0) + 1;
    perEvent[c.eventName] = (perEvent[c.eventName] || 0) + 1;
  }

  const outDoc = {
    totalCards: outCards.length,
    uniqueCards: outCards.length,
    processedPages,
    lastUpdated: nowIso,
    cards: outCards,
    metadata: {
      organized: true,
      totalEvents: Object.keys(perEvent).length,
      perEvent,
      tierBreakdown,
      lastUpdated: nowIso,
      source: 'shoob.gg (SSR, no-Chromium)',
      scraper: 'shoob-event-scraper v1',
      realSeriesKnown: records.filter(r => r._realSeries && r._realSeries !== r.eventName).length,
    },
  };
  fs.writeFileSync(OPTS.out, JSON.stringify(outDoc, null, 2));
  console.log(`\n[write] ${OPTS.out} — ${outCards.length} event cards`);
  console.log(`[write] per-event: ${JSON.stringify(perEvent)}`);
  console.log(`[write] tiers: ${JSON.stringify(tierBreakdown)}`);

  // 11. optional full merge against production layout
  if (OPTS.mergeOut && OPTS.db && fs.existsSync(OPTS.db)) {
    const prod = JSON.parse(fs.readFileSync(OPTS.db, 'utf8'));
    const regular = (prod.cards || []).filter(c => !(c.id && String(c.id).startsWith('E-')));
    const merged = {
      totalCards: regular.length + outCards.length,
      uniqueCards: regular.length + outCards.length,
      processedPages: [...(prod.processedPages || []), ...processedPages],
      lastUpdated: nowIso,
      cards: [...regular, ...outCards],
      metadata: {
        organized: true,
        totalAnimes: (prod.metadata && prod.metadata.totalAnimes) || undefined,
        tierBreakdown: (() => {
          const tb = {};
          for (const c of regular) tb[c.tier] = (tb[c.tier] || 0) + 1;
          for (const c of outCards) tb[c.tier] = (tb[c.tier] || 0) + 1;
          return tb;
        })(),
        lastUpdated: nowIso,
        eventCards: outCards.length,
      },
    };
    fs.writeFileSync(OPTS.mergeOut, JSON.stringify(merged, null, 2));
    console.log(`[merge] ${OPTS.mergeOut} — ${merged.totalCards} cards (${regular.length} regular + ${outCards.length} event)`);
  }

  // 12. sidecar report (not part of the schema — for humans/next steps)
  const reportPath = OPTS.out.replace(/\.json$/, '') + '.report.json';
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: nowIso,
    events: [...eventNameBySlug.entries()].map(([slug, name]) => ({ slug, name })),
    counts: {
      scraped: records.filter(r => !r.__tombstone).length,
      preservedIds: preserved,
      newIds: unassigned.length,
      keptRemoved,
    },
    newCardsWithRealSeries: records
      .filter(r => r._realSeries && r._realSeries !== r.eventName)
      .slice(0, 50)
      .map(r => ({ id: r._id, cardName: r.cardName, eventName: r.eventName, realSeries: r._realSeries })),
  }, null, 2));
  console.log(`[report] ${reportPath}`);

  // 13. media mirror (gif/webm archive) — AFTER outputs are safely on disk
  let mediaStats = null;
  if (OPTS.mirrorMedia) {
    try { mediaStats = await mirrorMedia(outCards); }
    catch (e) { console.warn(`[media] mirror failed (outputs unaffected): ${e.message}`); }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDONE in ${secs}s — ${outCards.length} event cards, zero Chromium.`);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
