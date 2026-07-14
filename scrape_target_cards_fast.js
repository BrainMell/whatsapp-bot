/**
 * scrape_target_cards_fast.js
 *
 * Ultra-fast version: spawns MULTIPLE browser instances, each processing
 * a different event/tier combination in parallel. Within each instance,
 * visits detail pages in batches of 12.
 *
 * Strategy:
 * 1. For each event+tier (Summer T4/T5/T6, Halloween T5/T6), spawn a
 *    separate browser instance.
 * 2. Each instance scrapes all listing pages to collect card hrefs.
 * 3. Each instance visits detail pages in parallel batches of 12.
 * 4. All instances save to a shared results file (with file locking).
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');

chromium.use(stealth);

const OUTPUT_FILE = '/home/z/my-project/scripts/found_target_cards.json';
const LOCK_FILE = '/home/z/my-project/scripts/found_target_cards.lock';

// Target cards to find
const TARGETS = [
  { name: 'nobara', event: 'Summer', slug: 'summer', tier: 4 },
  { name: 'cantarella', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'mitsuri', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'lakyus', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'tsunade', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'winry', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'herta', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'frieren', event: 'Halloween', slug: 'halloween', tier: 5 },
  { name: 'yunyun', event: 'Halloween', slug: 'halloween', tier: 5 },
  { name: 'elsa', event: 'Halloween', slug: 'halloween', tier: 5 },
  { name: 'lust', event: 'Halloween', slug: 'halloween', tier: 6 },
];

const SCRAPE_CONFIGS = [
  { event: 'Summer', slug: 'summer', tier: 4 },
  { event: 'Summer', slug: 'summer', tier: 5 },
  { event: 'Summer', slug: 'summer', tier: 6 },
  { event: 'Halloween', slug: 'halloween', tier: 5 },
  { event: 'Halloween', slug: 'halloween', tier: 6 },
];

// Thread-safe save
function saveResults(found, foundNames, totalVisited) {
  // Simple file lock
  let attempts = 0;
  while (fs.existsSync(LOCK_FILE) && attempts < 50) {
    try { fs.unlinkSync(LOCK_FILE); break; } catch(e) { }
    const t = Date.now();
    while (Date.now() - t < 100) {}
    attempts++;
  }
  try { fs.writeFileSync(LOCK_FILE, '1'); } catch(e) {}

  try {
    let existing = { found: [], foundNames: [], totalVisited: 0 };
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    } catch(e) {}

    // Merge results
    const allFound = [...(existing.found || []), ...found];
    const allNames = new Set([...(existing.foundNames || []), ...foundNames]);
    const totalVis = (existing.totalVisited || 0) + totalVisited;

    const data = {
      found: allFound,
      foundNames: Array.from(allNames),
      totalVisited: totalVis,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  } finally {
    try { fs.unlinkSync(LOCK_FILE); } catch(e) {}
  }
}

async function scrapeConfig(config) {
  const { event, slug, tier } = config;
  const targets = TARGETS.filter(t => t.event === event && String(t.tier) === String(tier));

  console.log(`\n[${event} T${tier}] Starting (looking for ${targets.length} targets)`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  // Block unnecessary resources
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['stylesheet', 'font', 'media'].includes(type)) {
      route.abort();
    } else if (type === 'image') {
      const url = route.request().url();
      if (url.includes('eventcards')) route.continue();
      else route.abort();
    } else {
      route.continue();
    }
  });

  const found = [];
  const foundNames = new Set();
  let totalVisited = 0;

  // Phase 1: Collect all card hrefs from listing pages
  const hub = await context.newPage();
  const allHrefs = [];

  for (let page = 1; page <= 20; page++) {
    const url = `https://shoob.gg/card-events/${slug}?tier=${tier}&page=${page}`;
    try {
      await hub.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await hub.waitForSelector(`a[href*="/card-events/${slug}/"]`, { timeout: 10000 }).catch(() => {});
      await hub.waitForTimeout(2000);

      const hrefs = await hub.evaluate((s) => {
        const r = [];
        document.querySelectorAll(`a[href*="/card-events/${s}/"]`).forEach(a => {
          const parts = new URL(a.href).pathname.split('/').filter(Boolean);
          if (parts.length >= 3) r.push(a.href);
        });
        return [...new Set(r)];
      }, slug);

      if (hrefs.length === 0) {
        console.log(`[${event} T${tier}] Page ${page}: 0 cards, stopping`);
        break;
      }

      allHrefs.push(...hrefs);
      console.log(`[${event} T${tier}] Page ${page}: ${hrefs.length} cards (total: ${allHrefs.length})`);
    } catch (e) {
      console.log(`[${event} T${tier}] Page ${page} error: ${e.message}`);
      break;
    }
  }
  await hub.close();

  console.log(`[${event} T${tier}] Total card links: ${allHrefs.length}`);

  // Phase 2: Visit detail pages in parallel batches
  const BATCH_SIZE = 12;
  for (let i = 0; i < allHrefs.length; i += BATCH_SIZE) {
    // Check if all targets found
    const remaining = targets.filter(t => !foundNames.has(t.name));
    if (remaining.length === 0) {
      console.log(`[${event} T${tier}] ✅ All targets found!`);
      break;
    }

    const batch = allHrefs.slice(i, i + BATCH_SIZE);
    console.log(`[${event} T${tier}] Batch ${Math.floor(i/BATCH_SIZE)+1}: visiting ${batch.length} cards (${remaining.length} targets remaining)`);

    const results = await Promise.all(batch.map(async (url, idx) => {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForFunction(() => {
          return document.querySelectorAll('ol.breadcrumb-new li').length >= 4;
        }, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(800);

        const meta = await page.evaluate(() => {
          let cardName = null;
          let imageUrl = null;
          let creator = 'Anonymous';

          const items = Array.from(document.querySelectorAll('ol.breadcrumb-new li[itemprop="itemListElement"]'));
          items.forEach(item => {
            const pos = item.querySelector('meta[itemprop="position"]')?.getAttribute('content');
            const name = item.querySelector('span[itemprop="name"]')?.textContent?.trim();
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

          return { cardName, imageUrl, creator, url: window.location.href };
        });

        return meta;
      } catch (e) {
        return null;
      } finally {
        await page.close().catch(() => {});
      }
    }));

    for (const card of results) {
      if (!card) continue;
      totalVisited++;
      const nameLower = (card.cardName || '').toLowerCase();

      for (const t of targets) {
        if (foundNames.has(t.name)) continue;
        if (nameLower.includes(t.name)) {
          foundNames.add(t.name);
          found.push({
            detailUrl: card.url,
            cardName: card.cardName,
            tier: String(tier),
            creator: card.creator,
            imageUrl: card.imageUrl,
            eventName: event,
            eventSlug: slug,
            description: `${card.cardName} from ${event}`,
            scrapedAt: new Date().toISOString(),
            targetName: t.name,
          });
          console.log(`[${event} T${tier}] 🎯 FOUND: "${card.cardName}" → "${t.name}"`);
        }
      }
    }

    // Save after each batch
    saveResults(found, Array.from(foundNames), totalVisited);
  }

  await browser.close();
  console.log(`[${event} T${tier}] Done. Found ${found.length}/${targets.length} targets. Visited ${totalVisited} cards.`);
  return found;
}

// Initialize results file
fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ found: [], foundNames: [], totalVisited: 0 }, null, 2));

(async () => {
  console.log('═'.repeat(70));
  console.log('🚀 PARALLEL TARGET CARD SCRAPER');
  console.log(`   Spawning ${SCRAPE_CONFIGS.length} browser instances`);
  console.log('═'.repeat(70));

  // Run all configs in parallel
  const allResults = await Promise.all(SCRAPE_CONFIGS.map(c => scrapeConfig(c)));

  // Merge and display final results
  const allFound = allResults.flat();
  const allNames = new Set(allFound.map(c => c.targetName));

  console.log('\n' + '═'.repeat(70));
  console.log('🎯 FINAL RESULTS');
  console.log('═'.repeat(70));
  console.log(`\nFound ${allFound.length}/${TARGETS.length} target cards:\n`);

  for (const card of allFound) {
    console.log(`✅ ${card.cardName} — ${card.eventName} T${card.tier}`);
    console.log(`   Target: "${card.targetName}"`);
    console.log(`   URL: ${card.detailUrl}`);
    console.log(`   Image: ${card.imageUrl}`);
    console.log(`   Creator: ${card.creator}`);
    console.log('');
  }

  const missing = TARGETS.filter(t => !allNames.has(t.name));
  if (missing.length > 0) {
    console.log(`❌ Missing ${missing.length} cards:`);
    missing.forEach(t => console.log(`   - ${t.name} — ${t.event} T${t.tier}`));
  }

  console.log('\n📁 Results saved to', OUTPUT_FILE);
})();
