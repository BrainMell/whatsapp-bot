/**
 * scrape_one_tier.js
 *
 * Scrape a single event+tier. Visits each card detail page, extracts
 * the name from breadcrumb position 5, and checks if it matches any
 * target. Saves results after every find.
 *
 * Usage: node scrape_one_tier.js <event> <slug> <tier>
 * Example: node scrape_one_tier.js Summer summer 5
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const OUTPUT_FILE = '/home/z/my-project/scripts/found_target_cards.json';

const ALL_TARGETS = [
  { name: 'nobara', event: 'Summer', tier: 4 },
  { name: 'cantarella', event: 'Summer', tier: 5 },
  { name: 'mitsuri', event: 'Summer', tier: 5 },
  { name: 'lakyus', event: 'Summer', tier: 5 },
  { name: 'tsunade', event: 'Summer', tier: 5 },
  { name: 'winry', event: 'Summer', tier: 5 },
  { name: 'herta', event: 'Summer', tier: 5 },
  { name: 'frieren', event: 'Halloween', tier: 5 },
  { name: 'yunyun', event: 'Halloween', tier: 5 },
  { name: 'elsa', event: 'Halloween', tier: 5 },
  { name: 'lust', event: 'Halloween', tier: 6 },
];

function loadResults() {
  try { return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8')); }
  catch(e) { return { found: [], foundNames: [], totalVisited: 0 }; }
}

function saveResults(data) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

async function main() {
  const event = process.argv[2];
  const slug = process.argv[3];
  const tier = parseInt(process.argv[4]);

  if (!event || !slug || !tier) {
    console.log('Usage: node scrape_one_tier.js <event> <slug> <tier>');
    process.exit(1);
  }

  const targets = ALL_TARGETS.filter(t => t.event === event && t.tier === tier);
  console.log(`[${event} T${tier}] Looking for ${targets.length} targets: ${targets.map(t=>t.name).join(', ')}`);

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
      if (url.includes('eventcards')) route.continue();
      else route.abort();
    } else route.continue();
  });

  // Phase 1: Collect all card hrefs
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

  // Phase 2: Visit detail pages in batches of 8
  const BATCH_SIZE = 8;
  let visited = 0;
  let results = loadResults();

  for (let i = 0; i < allHrefs.length; i += BATCH_SIZE) {
    const remaining = targets.filter(t => !results.foundNames.includes(t.name));
    if (remaining.length === 0) {
      console.log(`[${event} T${tier}] ✅ All targets found!`);
      break;
    }

    const batch = allHrefs.slice(i, i + BATCH_SIZE);
    console.log(`[${event} T${tier}] Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(allHrefs.length/BATCH_SIZE)}: ${batch.length} cards (${remaining.length} targets left)`);

    const batchResults = await Promise.all(batch.map(async (url) => {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForFunction(() => document.querySelectorAll('ol.breadcrumb-new li').length >= 4, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(800);

        return await page.evaluate(() => {
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
      } catch (e) { return null; }
      finally { await page.close().catch(() => {}); }
    }));

    for (const card of batchResults) {
      if (!card) continue;
      visited++;
      const nameLower = (card.cardName || '').toLowerCase();

      for (const t of targets) {
        if (results.foundNames.includes(t.name)) continue;
        if (nameLower.includes(t.name)) {
          results.foundNames.push(t.name);
          results.found.push({
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
          console.log(`   Image: ${card.imageUrl}`);
        }
      }
    }

    results.totalVisited = (results.totalVisited || 0) + batchResults.filter(c => c).length;
    saveResults(results);
  }

  await browser.close();

  const found = results.found.filter(c => c.eventName === event && c.tier === String(tier));
  console.log(`\n[${event} T${tier}] DONE. Found ${found.length}/${targets.length} targets. Visited ${visited} cards.`);
}

main().catch(e => { console.error(e); process.exit(1); });
