/**
 * overnight_scraper_v3.js — Lightweight version
 *
 * Doesn't load the full cards_data.json. Instead reads a small file
 * of unknown card URLs (80KB) and scrapes those + missing tiers.
 *
 * Phase 1: Fix unknown cards (reads unknown_cards.json)
 * Phase 2: Scrape missing event+tier combos
 *
 * Run: nohup node overnight_scraper_v3.js &
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';
const UNKNOWN_FILE = '/home/z/my-project/scripts/unknown_cards.json';
const PROGRESS_FILE = '/home/z/my-project/scripts/overnight_progress.json';
const RESULTS_FILE = '/home/z/my-project/scripts/overnight_results.json';
const LOG_FILE = '/home/z/my-project/scripts/overnight_log.txt';

const ALL_EVENTS = [
  { name: 'Summer', slug: 'summer' },
  { name: 'Halloween', slug: 'halloween' },
  { name: 'Gala', slug: 'gala' },
  { name: 'Maid Day', slug: 'maid-day' },
  { name: 'Easter', slug: 'easter' },
  { name: 'Christmas', slug: 'christmas' },
  { name: 'Valentines Day', slug: 'valentines-day' },
  { name: 'Chinese New Year', slug: 'chinese-new-year' },
  { name: 'Olympics', slug: 'olympics' },
  { name: 'My Hero Academia CCG', slug: 'my-hero-academia-ccg' },
  { name: 'SWORN', slug: 'sworn' },
];

const ALL_TIERS = [1, 2, 3, 4, 5, 6];

// CARDS_DATA will be loaded after log() is defined (below)

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e) {}
}

// Load cards data for dedup (pre-filter URLs we already have)
log('Loading cards_data.json for dedup...');
const CARDS_DATA = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
log(`Loaded ${CARDS_DATA.cards.length} cards`);

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch (e) {
    return {
      phase1_done: false, phase1_fixed: 0, phase1_failed: 0,
      phase1_index: 0, scraped_tiers: {}, total_visited: 0,
    };
  }
}

function saveProgress(p) {
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); } catch(e) {}
}

function loadResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8')); }
  catch (e) { return { fixed_cards: [], new_cards: [] }; }
}

function saveResults(r) {
  try { fs.writeFileSync(RESULTS_FILE, JSON.stringify(r, null, 2)); } catch(e) {}
}

async function fetchMeta(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForFunction(() => document.querySelectorAll('ol.breadcrumb-new li').length >= 4, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);

    return await page.evaluate(() => {
      let cardName = null, tier = null, imageUrl = null, creator = 'Anonymous';
      const items = Array.from(document.querySelectorAll('ol.breadcrumb-new li[itemprop="itemListElement"]'));
      items.forEach(item => {
        const pos = item.querySelector('meta[itemprop="position"]')?.getAttribute('content');
        const name = item.querySelector('span[itemprop="name"]')?.textContent?.trim();
        if (pos === '4') tier = name;
        if (pos === '5') cardName = name;
      });
      if (!cardName) cardName = document.querySelector('h1')?.textContent?.trim();
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        if (src.includes('cdn.shoob.gg') && src.includes('eventcards')) { imageUrl = src; break; }
      }
      const video = document.querySelector('video');
      const videoSource = document.querySelector('video source');
      if (videoSource && videoSource.src) imageUrl = videoSource.src;
      else if (video && video.src) imageUrl = video.src;
      const bodyText = document.body.textContent || '';
      const makerMatch = bodyText.match(/Card Maker:([^S]+?)See the Maker/);
      if (makerMatch) creator = makerMatch[1].trim();
      if (!creator || creator === 'Official' || creator.includes('People who want')) creator = 'Anonymous';
      return { cardName, tier, imageUrl, creator, url: window.location.href };
    });
  } catch (e) { return null; }
  finally { await page.close().catch(() => {}); }
}

async function phase1(context, progress, results) {
  log('PHASE 1: Fixing Unknown cards');
  const unknownCards = JSON.parse(fs.readFileSync(UNKNOWN_FILE, 'utf-8'));
  log(`Found ${unknownCards.length} unknown cards, resuming from index ${progress.phase1_index}`);

  const BATCH = 4; // small batch for stability
  for (let i = progress.phase1_index; i < unknownCards.length; i += BATCH) {
    try {
      const batch = unknownCards.slice(i, i + BATCH);
      log(`  Batch ${Math.floor(i/BATCH)+1}/${Math.ceil(unknownCards.length/BATCH)}: ${batch.length} cards`);

      const metas = await Promise.all(batch.map(c => fetchMeta(context, c.detailUrl).catch(() => null)));

      for (let j = 0; j < batch.length; j++) {
        const card = batch[j];
        const meta = metas[j];
        if (meta && meta.cardName && meta.cardName !== 'Unknown') {
          progress.phase1_fixed++;
          results.fixed_cards.push({
            id: card.id, detailUrl: card.detailUrl,
            newName: meta.cardName,
            tier: meta.tier ? String(meta.tier).replace(/^Tier\s*/i, '').trim() : card.tier,
            creator: meta.creator,
            imageUrl: meta.imageUrl || '',
          });
        } else {
          progress.phase1_failed++;
        }
        progress.total_visited++;
      }

      progress.phase1_index = i + BATCH;
      saveProgress(progress);
      saveResults(results);
      log(`    fixed=${progress.phase1_fixed} failed=${progress.phase1_failed} visited=${progress.total_visited}`);
    } catch (e) {
      log(`  Batch error: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  progress.phase1_done = true;
  saveProgress(progress);
  log(`Phase 1 done: fixed ${progress.phase1_fixed}`);
}

async function phase2(context, progress, results) {
  log('PHASE 2: Scraping missing event+tier combos');

  for (const event of ALL_EVENTS) {
    log(`\n🎯 ${event.name}`);
    for (const tier of ALL_TIERS) {
      const key = `${event.name}_T${tier}`;
      if (progress.scraped_tiers[key]) { log(`  ⏭️  ${key}`); continue; }

      try {
        log(`  📋 ${key}...`);
        const hub = await context.newPage();
        const hrefs = [];

        for (let pg = 1; pg <= 30; pg++) {
          try {
            await hub.goto(`https://shoob.gg/card-events/${event.slug}?tier=${tier}&page=${pg}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await hub.waitForSelector(`a[href*="/card-events/${event.slug}/"]`, { timeout: 10000 }).catch(() => {});
            await hub.waitForTimeout(2000);
            const found = await hub.evaluate((slug) => {
              const r = [];
              document.querySelectorAll(`a[href*="/card-events/${slug}/"]`).forEach(a => {
                const parts = new URL(a.href).pathname.split('/').filter(Boolean);
                if (parts.length >= 3) r.push(a.href);
              });
              return [...new Set(r)];
            }, event.slug);
            if (found.length === 0) break;
            hrefs.push(...found);
            log(`    Page ${pg}: ${found.length} (${hrefs.length} total)`);
          } catch(e) { break; }
        }
        await hub.close();

        if (hrefs.length === 0) {
          log(`    No cards for ${key}`);
          progress.scraped_tiers[key] = true;
          saveProgress(progress);
          continue;
        }

        // Load existing URLs from the main database for pre-filtering
        // This prevents re-visiting detail pages for cards we already have
        const dbUrls = new Set();
        const dbImgs = new Set();
        for (const c of CARDS_DATA.cards) {
          if (c.detailUrl) dbUrls.add(c.detailUrl);
          if (c.imageUrl) dbImgs.add(c.imageUrl);
        }
        // Also include URLs from previous scraping runs
        for (const c of results.new_cards) {
          if (c.detailUrl) dbUrls.add(c.detailUrl);
        }

        // Pre-filter: only visit URLs we don't already have
        const toVisit = hrefs.filter(u => !dbUrls.has(u));
        log(`    Pre-filter: ${hrefs.length} total, ${toVisit.length} to visit, ${hrefs.length - toVisit.length} already in DB`);

        const BATCH = 4;
        let newCount = 0;

        for (let i = 0; i < toVisit.length; i += BATCH) {
          try {
            const batch = toVisit.slice(i, i + BATCH);
            const metas = await Promise.all(batch.map(url => fetchMeta(context, url).catch(() => null)));

            for (const meta of metas) {
              if (!meta || !meta.cardName || meta.cardName === 'Unknown') continue;
              progress.total_visited++;

              // Double-check dedup (in case imageUrl matches)
              if (meta.imageUrl && dbImgs.has(meta.imageUrl)) continue;
              dbUrls.add(meta.url);
              if (meta.imageUrl) dbImgs.add(meta.imageUrl);

              results.new_cards.push({
                detailUrl: meta.url,
                cardName: meta.cardName,
                tier: meta.tier ? String(meta.tier).replace(/^Tier\s*/i, '').trim() : String(tier),
                creator: meta.creator,
                imageUrl: meta.imageUrl,
                eventName: event.name,
                eventSlug: event.slug,
                description: `${meta.cardName} from ${event.name}`,
                scrapedAt: new Date().toISOString(),
              });
              newCount++;
            }
            saveResults(results);
            saveProgress(progress);
          } catch(e) {
            log(`    Batch error: ${e.message}`);
            await new Promise(r => setTimeout(r, 3000));
          }
        }

        progress.scraped_tiers[key] = true;
        saveProgress(progress);
        log(`    ✅ ${key}: ${newCount} new, ${hrefs.length} total`);
      } catch(e) {
        log(`  ${key} error: ${e.message}`);
      }
    }
  }
}

// Global error handlers
process.on('unhandledRejection', (e) => { log(`UNHANDLED REJECTION: ${e.message}`); });
process.on('uncaughtException', (e) => { log(`UNCAUGHT EXCEPTION: ${e.message}`); });

async function main() {
  log('🌙 OVERNIGHT SCRAPER v3 (lightweight)');

  const progress = loadProgress();
  const results = loadResults();
  log(`Resume: phase1_done=${progress.phase1_done} index=${progress.phase1_index} visited=${progress.total_visited}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['stylesheet', 'font', 'media'].includes(type)) route.abort();
    else if (type === 'image') {
      const url = route.request().url();
      if (url.includes('eventcards') || url.includes('cardr')) route.continue();
      else route.abort();
    } else route.continue();
  });

  if (!progress.phase1_done) {
    try { await phase1(context, progress, results); }
    catch(e) { log(`Phase 1 fatal: ${e.message}`); }
  }

  try { await phase2(context, progress, results); }
  catch(e) { log(`Phase 2 fatal: ${e.message}`); }

  await browser.close();
  log(`🏁 DONE. Fixed ${progress.phase1_fixed}, new ${results.new_cards.length}, visited ${progress.total_visited}`);
  log(`Run: node merge_overnight.js`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
