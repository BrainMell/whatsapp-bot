/**
 * overnight_scraper.js — Robust version
 *
 * Phase 1: Fix 520 "Unknown" event cards by visiting detail pages.
 * Phase 2: Scrape missing event+tier combos.
 *
 * Improvements over v1:
 *   - Loads cards_data.json ONCE at startup (not per function call)
 *   - Smaller batch size (6) for stability
 *   - Better error handling with try/catch around each batch
 *   - Heartbeat logging every 30s
 *   - Saves after every batch
 *   - Can be killed and restarted
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';
const PROGRESS_FILE = '/home/z/my-project/scripts/overnight_progress.json';
const RESULTS_FILE = '/home/z/my-project/scripts/overnight_results.json';
const LOG_FILE = '/home/z/my-project/scripts/overnight_log.txt';

// Load cards data ONCE
console.log('Loading cards_data.json...');
const CARDS_DATA = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
console.log(`Loaded ${CARDS_DATA.cards.length} cards`);

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

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e) {}
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch (e) {
    return {
      phase1_done: false,
      phase1_fixed: 0,
      phase1_failed: 0,
      phase1_index: 0,  // resume from this index
      scraped_tiers: {},
      total_visited: 0,
    };
  }
}

function saveProgress(p) {
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); } catch(e) {}
}

function loadResults() {
  try {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  } catch (e) {
    return { fixed_cards: [], new_cards: [] };
  }
}

function saveResults(r) {
  try { fs.writeFileSync(RESULTS_FILE, JSON.stringify(r, null, 2)); } catch(e) {}
}

async function fetchCardMetadata(context, url) {
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
  } catch (e) {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

async function fixUnknownCards(context, progress, results) {
  log('═'.repeat(60));
  log('PHASE 1: Fixing Unknown event cards');
  log('═'.repeat(60));

  const unknownCards = CARDS_DATA.cards.filter(c =>
    String(c.id || '').startsWith('E-') &&
    (c.cardName === 'Unknown' || !c.cardName) &&
    c.detailUrl
  );

  log(`Found ${unknownCards.length} cards with Unknown names`);
  log(`Resuming from index ${progress.phase1_index}`);

  const BATCH_SIZE = 6;
  for (let i = progress.phase1_index; i < unknownCards.length; i += BATCH_SIZE) {
    try {
      const batch = unknownCards.slice(i, i + BATCH_SIZE);
      log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(unknownCards.length / BATCH_SIZE)}: ${batch.length} cards`);

      const metadataResults = await Promise.all(batch.map(async (card) => {
        try { return await fetchCardMetadata(context, card.detailUrl); }
        catch(e) { return null; }
      }));

      for (let j = 0; j < batch.length; j++) {
        const card = batch[j];
        const meta = metadataResults[j];
        if (meta && meta.cardName && meta.cardName !== 'Unknown') {
          progress.phase1_fixed++;
          results.fixed_cards.push({
            id: card.id,
            detailUrl: card.detailUrl,
            newName: meta.cardName,
            tier: meta.tier ? String(meta.tier).replace(/^Tier\s*/i, '').trim() : card.tier,
            creator: meta.creator,
            imageUrl: meta.imageUrl || card.imageUrl,
          });
        } else {
          progress.phase1_failed++;
        }
        progress.total_visited++;
      }

      progress.phase1_index = i + BATCH_SIZE;
      saveProgress(progress);
      saveResults(results);

      log(`    Progress: fixed=${progress.phase1_fixed}, failed=${progress.phase1_failed}, visited=${progress.total_visited}`);
    } catch (e) {
      log(`  Batch error: ${e.message}`);
      // Don't update index on error, will retry this batch
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  progress.phase1_done = true;
  saveProgress(progress);
  log(`Phase 1 complete: fixed ${progress.phase1_fixed}, failed ${progress.phase1_failed}`);
}

async function scrapeEventTier(context, eventName, eventSlug, tier, progress, results) {
  const tierKey = `${eventName}_T${tier}`;
  if (progress.scraped_tiers[tierKey]) {
    log(`  ⏭️  Already scraped: ${tierKey}`);
    return;
  }

  log(`  📋 Scraping ${tierKey}...`);

  const hub = await context.newPage();
  const allHrefs = [];

  for (let page = 1; page <= 50; page++) {
    try {
      const url = `https://shoob.gg/card-events/${eventSlug}?tier=${tier}&page=${page}`;
      await hub.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await hub.waitForSelector(`a[href*="/card-events/${eventSlug}/"]`, { timeout: 10000 }).catch(() => {});
      await hub.waitForTimeout(2000);

      const hrefs = await hub.evaluate((slug) => {
        const r = [];
        document.querySelectorAll(`a[href*="/card-events/${slug}/"]`).forEach(a => {
          const parts = new URL(a.href).pathname.split('/').filter(Boolean);
          if (parts.length >= 3) r.push(a.href);
        });
        return [...new Set(r)];
      }, eventSlug);

      if (hrefs.length === 0) break;
      allHrefs.push(...hrefs);
      log(`    Page ${page}: ${hrefs.length} cards (total: ${allHrefs.length})`);
    } catch (e) {
      log(`    Page ${page} error: ${e.message}`);
      break;
    }
  }
  await hub.close();

  if (allHrefs.length === 0) {
    log(`    No cards found for ${tierKey}`);
    progress.scraped_tiers[tierKey] = true;
    saveProgress(progress);
    return;
  }

  const existingUrls = new Set(CARDS_DATA.cards.map(c => c.detailUrl).filter(Boolean));
  const existingImgs = new Set(CARDS_DATA.cards.map(c => c.imageUrl).filter(Boolean));
  const BATCH_SIZE = 6;
  let newCount = 0, dupCount = 0;

  for (let i = 0; i < allHrefs.length; i += BATCH_SIZE) {
    try {
      const batch = allHrefs.slice(i, i + BATCH_SIZE);
      const metadataResults = await Promise.all(batch.map(async (url) => {
        try { return await fetchCardMetadata(context, url); }
        catch(e) { return null; }
      }));

      for (const meta of metadataResults) {
        if (!meta || !meta.cardName || meta.cardName === 'Unknown') continue;
        progress.total_visited++;

        if (existingUrls.has(meta.url) || (meta.imageUrl && existingImgs.has(meta.imageUrl))) {
          dupCount++;
          continue;
        }

        results.new_cards.push({
          detailUrl: meta.url,
          cardName: meta.cardName,
          tier: meta.tier ? String(meta.tier).replace(/^Tier\s*/i, '').trim() : String(tier),
          creator: meta.creator,
          imageUrl: meta.imageUrl,
          eventName: eventName,
          eventSlug: eventSlug,
          description: `${meta.cardName} from ${eventName}`,
          scrapedAt: new Date().toISOString(),
        });
        existingUrls.add(meta.url);
        if (meta.imageUrl) existingImgs.add(meta.imageUrl);
        newCount++;
      }

      saveResults(results);
      saveProgress(progress);
    } catch (e) {
      log(`    Batch error: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  progress.scraped_tiers[tierKey] = true;
  saveProgress(progress);
  log(`    ✅ ${tierKey}: ${newCount} new, ${dupCount} dupes, ${allHrefs.length} total`);
}

async function main() {
  log('═'.repeat(60));
  log('🌙 OVERNIGHT EVENT CARD SCRAPER (v2)');
  log('═'.repeat(60));

  const progress = loadProgress();
  const results = loadResults();

  log(`Resuming: phase1_done=${progress.phase1_done}, index=${progress.phase1_index}, visited=${progress.total_visited}`);
  log(`Results: ${results.fixed_cards.length} fixed, ${results.new_cards.length} new`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
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

  // Phase 1
  if (!progress.phase1_done) {
    try { await fixUnknownCards(context, progress, results); }
    catch(e) { log(`Phase 1 fatal: ${e.message}`); }
  } else {
    log('Phase 1 already done.');
  }

  // Phase 2
  log('═'.repeat(60));
  log('PHASE 2: Scraping missing event+tier combos');
  log('═'.repeat(60));

  for (const event of ALL_EVENTS) {
    log(`\n🎯 Event: ${event.name}`);
    for (const tier of ALL_TIERS) {
      try { await scrapeEventTier(context, event.name, event.slug, tier, progress, results); }
      catch(e) { log(`  Error: ${e.message}`); }
    }
  }

  await browser.close();

  log('═'.repeat(60));
  log('🏁 OVERNIGHT SCRAPE COMPLETE');
  log('═'.repeat(60));
  log(`Phase 1: Fixed ${progress.phase1_fixed} cards`);
  log(`Phase 2: Found ${results.new_cards.length} new cards`);
  log(`Total visited: ${progress.total_visited}`);
  log(`Run: node merge_overnight.js`);
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  log(e.stack || '');
  process.exit(1);
});
