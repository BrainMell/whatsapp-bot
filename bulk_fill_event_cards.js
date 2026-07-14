/**
 * bulk_fill_event_cards.js  (v3 — auto-restart on crash)
 *
 * The browser crashes after ~10-20 page visits. This version wraps
 * everything in a retry loop that recreates the browser when it dies.
 * Progress is saved to disk every 10 cards, so nothing is lost.
 *
 * Usage: nohup node bulk_fill_event_cards.js > /tmp/bulk_fill.log 2>&1 &
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';
const PROGRESS_FILE = '/home/z/my-project/scripts/bulk_fill_progress.json';

const EVENT_SLUGS = {
  'Chinese New Year': 'chinese-new-year',
  'Valentines Day': 'valentines-day',
  'Halloween': 'halloween',
  'Christmas': 'christmas',
  'Easter': 'easter',
  'My Hero Academia CCG': 'my-hero-academia-ccg',
  'Maid Day': 'maid-day',
  'Summer': 'summer',
  'Gala': 'gala',
  'SWORN': 'sworn',
};
const TIERS = ['1', '2', '3', '4', '5', '6', 'S'];

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function loadData() { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')); }
function saveData(data) { fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2)); }
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch(e) { return { fixedUrls: [], scrapedUrls: [], phase: 'fix_unknown', fixIndex: 0, scrapeState: null }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

async function fetchCardMetadata(page) {
  try {
    await page.waitForFunction(() => document.querySelectorAll('ol.breadcrumb-new li').length >= 4, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    return await page.evaluate(() => {
      let cardName = null, tier = null, imageUrl = null, creator = 'Anonymous';
      const items = Array.from(document.querySelectorAll('ol.breadcrumb-new li[itemprop="itemListElement"]'));
      items.forEach(item => {
        const pos = item.querySelector('meta[itemprop="position"]')?.getAttribute('content');
        const name = item.querySelector('span[itemprop="name"]')?.textContent?.trim();
        if (pos === '4') tier = name;
        if (pos === '5') cardName = name;
      });
      if (!cardName) {
        const allLinks = document.querySelectorAll('a[href*="/card-events/"]');
        const cardLinks = [];
        allLinks.forEach(a => {
          const t = a.textContent.trim();
          const h = a.getAttribute('href') || '';
          if (t && !['Summer','Halloween','Christmas','Valentines Day','Easter','Chinese New Year','Maid Day','Gala','SWORN','Events','Cards','Terms of Service'].includes(t) &&
              !t.startsWith('Tier ') && h.includes('/card-events/') && h.split('/').length >= 4) cardLinks.push(t);
        });
        if (cardLinks.length > 0) cardName = cardLinks[cardLinks.length - 1];
      }
      if (!cardName) cardName = document.querySelector('h1')?.textContent?.trim();
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        if (src.includes('cdn.shoob.gg') && src.includes('eventcards')) { imageUrl = src; break; }
      }
      const video = document.querySelector('video');
      const vs = document.querySelector('video source');
      if (vs && vs.src) imageUrl = vs.src;
      else if (video && video.src) imageUrl = video.src;
      const bodyText = document.body.textContent || '';
      const m = bodyText.match(/Card Maker:([^S]+?)See the Maker/);
      if (m) creator = m[1].trim();
      if (!creator || creator === 'Official' || creator === 'Unknown Creator' || creator.includes('People who want')) creator = 'Anonymous';
      return { cardName, tier, creator, imageUrl, url: window.location.href };
    });
  } catch (e) { return null; }
}

async function createBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--max-old-space-size=256'],
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
      if (url.includes('eventcards')) route.continue();
      else route.abort();
    } else route.continue();
  });
  const page = await context.newPage();
  return { browser, context, page };
}

async function processUrlWithRestart(url, state) {
  // Try to process a URL. If the browser crashed, recreate it and retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!state.page || state.page.isClosed()) {
        log('  🔄 Browser/page closed — recreating...');
        try { await state.browser.close(); } catch(e) {}
        const newState = await createBrowser();
        state.browser = newState.browser;
        state.context = newState.context;
        state.page = newState.page;
      }
      await state.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const meta = await fetchCardMetadata(state.page);
      return meta;
    } catch (e) {
      log(`  ⚠️ Attempt ${attempt+1} failed: ${e.message.substring(0, 100)}`);
      // Force page recreation on next attempt
      try { await state.page.close(); } catch(e) {}
      try { await state.browser.close(); } catch(e) {}
      if (attempt === 2) return null;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return null;
}

async function main() {
  log('🚀 Starting bulk event card scraper v3 (auto-restart)...');

  let state = await createBrowser();
  const data = loadData();
  const progress = loadProgress();
  let cardsFixed = 0;
  let cardsAdded = 0;
  let saveCounter = 0;
  let pageVisitCount = 0; // restart browser every 8 visits to prevent crashes

  function checkSave() {
    if (saveCounter >= 10) {
      saveData(data);
      saveProgress(progress);
      saveCounter = 0;
      return true;
    }
    return false;
  }

  async function maybeRestartBrowser() {
    pageVisitCount++;
    if (pageVisitCount >= 8) {
      log('  🔄 Proactive browser restart (8 visits)...');
      try { await state.browser.close(); } catch(e) {}
      state = await createBrowser();
      pageVisitCount = 0;
    }
  }

  // ═══ PHASE 1: Fix Unknown cards ═══
  if (progress.phase === 'fix_unknown') {
    log('═══ PHASE 1: Fixing Unknown cards ═══');
    const unknownCards = data.cards.filter(c =>
      String(c.id||'').startsWith('E-') &&
      (!c.cardName || c.cardName === 'Unknown') &&
      c.detailUrl
    );
    log(`Found ${unknownCards.length} Unknown cards to fix`);

    for (let i = progress.fixIndex || 0; i < unknownCards.length; i++) {
      const card = unknownCards[i];
      progress.fixIndex = i;
      if (progress.fixedUrls.includes(card.detailUrl)) continue;

      if (i % 10 === 0) log(`  Progress: ${i}/${unknownCards.length} (${cardsFixed} fixed)`);

      await maybeRestartBrowser();
      const meta = await processUrlWithRestart(card.detailUrl, state);
      progress.fixedUrls.push(card.detailUrl);

      if (meta && meta.cardName && meta.cardName !== 'Unknown') {
        card.cardName = meta.cardName;
        if (meta.tier) card.tier = String(meta.tier).replace(/^Tier\s*/i, '').trim();
        if (meta.imageUrl) card.imageUrl = meta.imageUrl;
        if (meta.creator) card.creator = meta.creator;
        card.description = `${meta.cardName} from ${card.eventName || card.animeName}`;
        cardsFixed++;
        saveCounter++;
      }

      if (checkSave()) log(`💾 Saved. Fixed ${cardsFixed}/${unknownCards.length}.`);
    }

    saveData(data);
    saveProgress(progress);
    log(`✅ Phase 1 complete: fixed ${cardsFixed} Unknown cards`);
    progress.phase = 'scrape_missing';
    progress.fixIndex = 0;
    saveProgress(progress);
  }

  // ═══ PHASE 2: Scrape missing event tiers ═══
  log('═══ PHASE 2: Scraping missing event tiers ═══');

  let maxEventNum = 0;
  for (const c of data.cards) {
    const m = String(c.id || '').match(/^E-(\d{5})$/);
    if (m) { const num = parseInt(m[1], 10); if (num > maxEventNum) maxEventNum = num; }
  }
  log(`Current max event ID: E-${String(maxEventNum).padStart(5, '0')}`);
  const existingUrls = new Set(data.cards.map(c => c.detailUrl).filter(Boolean));

  for (const [eventName, slug] of Object.entries(EVENT_SLUGS)) {
    for (const tier of TIERS) {
      const existing = data.cards.filter(c =>
        String(c.id||'').startsWith('E-') &&
        (c.eventName === eventName || c.animeName === eventName) &&
        String(c.tier) === tier
      );
      if (existing.length >= 50) {
        log(`⏭️  ${eventName} T${tier}: ${existing.length} cards — skipping`);
        continue;
      }

      log(`\n📋 Scraping ${eventName} T${tier} (${existing.length} existing)...`);

      // Collect card links from listing pages
      const allHrefs = [];
      for (let pageNum = 1; pageNum <= 20; pageNum++) {
        await maybeRestartBrowser();
        const url = `https://shoob.gg/card-events/${slug}?tier=${tier}&page=${pageNum}`;
        try {
          await state.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await state.page.waitForSelector(`a[href*="/card-events/${slug}/"]`, { timeout: 8000 }).catch(() => {});
          await state.page.waitForTimeout(2000);
          const hrefs = await state.page.evaluate((s) => {
            const r = [];
            document.querySelectorAll(`a[href*="/card-events/${s}/"]`).forEach(a => {
              try { const p = new URL(a.href).pathname.split('/').filter(Boolean); if (p.length >= 3) r.push(a.href); } catch(e) {}
            });
            return [...new Set(r)];
          }, slug);
          if (hrefs.length === 0) break;
          allHrefs.push(...hrefs);
        } catch(e) { break; }
      }

      const newHrefs = allHrefs.filter(h => !existingUrls.has(h) && !progress.scrapedUrls.includes(h));
      log(`  ${allHrefs.length} links found, ${newHrefs.length} new`);
      if (newHrefs.length === 0) continue;

      // Visit each new card
      for (let i = 0; i < newHrefs.length; i++) {
        const url = newHrefs[i];
        if (i % 10 === 0) log(`  Card ${i}/${newHrefs.length}...`);

        await maybeRestartBrowser();
        const meta = await processUrlWithRestart(url, state);
        progress.scrapedUrls.push(url);

        if (meta && meta.cardName && meta.cardName !== 'Unknown') {
          if (existingUrls.has(url)) continue;
          maxEventNum++;
          data.cards.push({
            id: `E-${String(maxEventNum).padStart(5, '0')}`,
            cardName: meta.cardName,
            animeName: eventName, eventName: eventName,
            tier: meta.tier ? String(meta.tier).replace(/^Tier\s*/i, '').trim() : tier,
            creator: meta.creator || 'Anonymous',
            imageUrl: meta.imageUrl, detailUrl: url,
            description: `${meta.cardName} from ${eventName}`,
            scrapedAt: new Date().toISOString(),
          });
          existingUrls.add(url);
          cardsAdded++;
          saveCounter++;
        }
        if (checkSave()) log(`💾 Saved. Total: ${data.cards.length}`);
      }

      saveData(data);
      saveProgress(progress);
      log(`✅ ${eventName} T${tier}: ${cardsAdded} new`);
      cardsAdded = 0;
    }
  }

  data.totalCards = data.cards.length;
  data.uniqueCards = data.cards.length;
  data.lastUpdated = new Date().toISOString();
  saveData(data);

  log('\n' + '═'.repeat(60));
  log('🎉 BULK FILL COMPLETE');
  log(`   Total event cards: ${data.cards.filter(c => String(c.id||'').startsWith('E-')).length}`);
  const stillUnknown = data.cards.filter(c => String(c.id||'').startsWith('E-') && (!c.cardName || c.cardName === 'Unknown')).length;
  log(`   Still Unknown: ${stillUnknown}`);
  log('═'.repeat(60));

  try { await state.browser.close(); } catch(e) {}
}

main().catch(e => { log('FATAL: ' + e.message); console.error(e); process.exit(1); });
