/**
 * scrape_direct_urls.js
 *
 * Visit specific card detail URLs directly to extract metadata.
 * Used for cards we already know the URL for (from manual search).
 *
 * Also searches shoob.gg for cards by name using the search input
 * on the event listing page.
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const OUTPUT_FILE = '/home/z/my-project/scripts/found_target_cards.json';

// Known URLs from manual search + earlier scraping
const KNOWN_URLS = [
  // Cantarella — Summer T5 (found via manual search earlier)
  { url: 'https://shoob.gg/card-events/summer/68739eb3ea6a7200bcb6391e', event: 'Summer', slug: 'summer', tier: 5, target: 'cantarella' },
];

// Cards to search for using the shoob.gg search input
const SEARCH_TARGETS = [
  { name: 'Mitsuri', event: 'Summer', slug: 'summer', tier: 5, target: 'mitsuri' },
  { name: 'Lakyus', event: 'Summer', slug: 'summer', tier: 5, target: 'lakyus' },
  { name: 'Tsunade', event: 'Summer', slug: 'summer', tier: 5, target: 'tsunade' },
  { name: 'Winry', event: 'Summer', slug: 'summer', tier: 5, target: 'winry' },
  { name: 'Frieren', event: 'Halloween', slug: 'halloween', tier: 5, target: 'frieren' },
  { name: 'Elsa', event: 'Halloween', slug: 'halloween', tier: 5, target: 'elsa' },
  { name: 'Lust', event: 'Halloween', slug: 'halloween', tier: 6, target: 'lust' },
  { name: 'Nobara', event: 'Summer', slug: 'summer', tier: 4, target: 'nobara' },
];

function loadResults() {
  try { return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8')); }
  catch(e) { return { found: [], foundNames: [], totalVisited: 0 }; }
}

function saveResults(data) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

async function fetchCardMetadata(context, url, eventName, eventSlug, tier) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('ol.breadcrumb-new li').length >= 4, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

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
}

async function searchForCard(context, searchName, eventSlug, tier, eventName) {
  const page = await context.newPage();
  try {
    const url = `https://shoob.gg/card-events/${eventSlug}?tier=${tier}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Find the search input
    const searchInput = page.locator('input[placeholder*="Search" i], input[type="text"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

    // Fill search and press Enter
    await searchInput.fill(searchName);
    await page.waitForTimeout(2000);

    // Try clicking the SEARCH button if it exists
    const searchBtn = page.locator('button:has-text("SEARCH")').first();
    if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchBtn.click().catch(() => {});
    } else {
      await searchInput.press('Enter').catch(() => {});
    }

    await page.waitForTimeout(4000);

    // Get card links from search results
    const hrefs = await page.evaluate((slug) => {
      const r = [];
      document.querySelectorAll(`a[href*="/card-events/${slug}/"]`).forEach(a => {
        const parts = new URL(a.href).pathname.split('/').filter(Boolean);
        if (parts.length >= 3) r.push(a.href);
      });
      return [...new Set(r)];
    }, eventSlug);

    console.log(`  Search "${searchName}" on ${eventName} T${tier}: found ${hrefs.length} results`);
    await page.close();
    return hrefs;
  } catch (e) {
    console.log(`  Search error: ${e.message}`);
    await page.close().catch(() => {});
    return [];
  }
}

async function main() {
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

  let results = loadResults();
  console.log(`Starting with ${results.found.length} found cards: ${results.foundNames.join(', ')}`);

  // Phase 1: Visit known URLs
  console.log('\n═'.repeat(60));
  console.log('PHASE 1: Visiting known URLs');
  console.log('═'.repeat(60));

  for (const known of KNOWN_URLS) {
    if (results.foundNames.includes(known.target)) {
      console.log(`⏭️  Already found: ${known.target}`);
      continue;
    }
    console.log(`\nVisiting: ${known.url}`);
    const card = await fetchCardMetadata(context, known.url, known.event, known.slug, known.tier);
    if (card) {
      console.log(`  Name: ${card.cardName}`);
      console.log(`  Image: ${card.imageUrl}`);
      console.log(`  Creator: ${card.creator}`);
      results.foundNames.push(known.target);
      results.found.push({
        detailUrl: card.url,
        cardName: card.cardName,
        tier: String(known.tier),
        creator: card.creator,
        imageUrl: card.imageUrl,
        eventName: known.event,
        eventSlug: known.slug,
        description: `${card.cardName} from ${known.event}`,
        scrapedAt: new Date().toISOString(),
        targetName: known.target,
      });
      results.totalVisited = (results.totalVisited || 0) + 1;
      saveResults(results);
    }
  }

  // Phase 2: Search for remaining targets
  console.log('\n═'.repeat(60));
  console.log('PHASE 2: Searching for remaining targets');
  console.log('═'.repeat(60));

  for (const target of SEARCH_TARGETS) {
    if (results.foundNames.includes(target.target)) {
      console.log(`\n⏭️  Already found: ${target.target}`);
      continue;
    }

    console.log(`\n🔍 Searching for "${target.name}" on ${target.event} T${target.tier}...`);
    const hrefs = await searchForCard(context, target.name, target.slug, target.tier, target.event);

    if (hrefs.length === 0) {
      console.log(`  ❌ No results found for "${target.name}"`);
      continue;
    }

    // Visit each search result to find the matching card
    for (const href of hrefs.slice(0, 10)) { // limit to first 10 results
      const card = await fetchCardMetadata(context, href, target.event, target.slug, target.tier);
      if (!card) continue;
      results.totalVisited = (results.totalVisited || 0) + 1;

      const nameLower = (card.cardName || '').toLowerCase();
      if (nameLower.includes(target.target)) {
        console.log(`  🎯 FOUND: "${card.cardName}"`);
        console.log(`     Image: ${card.imageUrl}`);
        console.log(`     Creator: ${card.creator}`);
        results.foundNames.push(target.target);
        results.found.push({
          detailUrl: card.url,
          cardName: card.cardName,
          tier: String(target.tier),
          creator: card.creator,
          imageUrl: card.imageUrl,
          eventName: target.event,
          eventSlug: target.slug,
          description: `${card.cardName} from ${target.event}`,
          scrapedAt: new Date().toISOString(),
          targetName: target.target,
        });
        saveResults(results);
        break; // Found this target, move to next
      } else {
        console.log(`  ❌ Not a match: "${card.cardName}"`);
      }
    }
  }

  await browser.close();

  // Print final results
  console.log('\n' + '═'.repeat(60));
  console.log('FINAL RESULTS');
  console.log('═'.repeat(60));
  console.log(`Found ${results.found.length} cards:\n`);
  for (const c of results.found) {
    console.log(`✅ ${c.cardName} — ${c.eventName} T${c.tier}`);
    console.log(`   Target: ${c.targetName}`);
    console.log(`   URL: ${c.detailUrl}`);
    console.log(`   Image: ${c.imageUrl}`);
    console.log(`   Creator: ${c.creator}`);
    console.log('');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
