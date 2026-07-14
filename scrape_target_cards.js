/**
 * scrape_target_cards.js
 *
 * Focused scraper that targets ONLY the specific missing event cards
 * requested by the user. Uses the Playwright + stealth approach from
 * the uploaded index.js, but with these modifications:
 *
 * 1. Targets only the events/tiers that are missing cards:
 *    - Summer T4, T5, T6 (DB has ZERO Summer T2-T6 cards)
 *    - Halloween T5, T6 (DB has only 11 Halloween T5 cards, 0 T6)
 *
 * 2. Visits each card DETAIL page to get the card name from the
 *    breadcrumb (position 5 in ol.breadcrumb-new). The listing page
 *    only shows card backs — names are only on detail pages.
 *
 * 3. Filters: only keeps cards whose name matches one of our 10 targets:
 *    Nobara, Cantarella, Mitsuri, Lakyus, Tsunade, Winry, Herta,
 *    Frieren, Yunyun, Elsa, Lust
 *
 * 4. Uses parallel browser workers (batch of 6) to speed up detail
 *    page visits.
 *
 * 5. Stops early once all 10 targets are found.
 *
 * 6. Saves full metadata: cardName, tier, creator, imageUrl, detailUrl,
 *    eventName, eventSlug, description.
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');

chromium.use(stealth);

// ─── TARGET CARDS ─────────────────────────────────────────────────────────
// Each target: { name (lowercase substring to match), event, tier }
// We search by name substring to catch variants (e.g. "Mitsuri Kanonji"
// matches "mitsuri", "Elsa Greinhart" matches "elsa").
const TARGETS = [
  // Summer T4
  { name: 'nobara', event: 'Summer', slug: 'summer', tier: 4 },
  // Summer T5
  { name: 'cantarella', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'mitsuri', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'lakyus', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'tsunade', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'winry', event: 'Summer', slug: 'summer', tier: 5 },
  { name: 'herta', event: 'Summer', slug: 'summer', tier: 5 },
  // Halloween T5
  { name: 'frieren', event: 'Halloween', slug: 'halloween', tier: 5 },
  { name: 'yunyun', event: 'Halloween', slug: 'halloween', tier: 5 },
  { name: 'elsa', event: 'Halloween', slug: 'halloween', tier: 5 },
  // Halloween T6
  { name: 'lust', event: 'Halloween', slug: 'halloween', tier: 6 },
];

// ─── CONFIG ───────────────────────────────────────────────────────────────
const OUTPUT_FILE = '/home/z/my-project/scripts/found_target_cards.json';
const SCRAPE_TIERS = [
  { event: 'Summer', slug: 'summer', tier: 4 },
  { event: 'Summer', slug: 'summer', tier: 5 },
  { event: 'Summer', slug: 'summer', tier: 6 },
  { event: 'Halloween', slug: 'halloween', tier: 5 },
  { event: 'Halloween', slug: 'halloween', tier: 6 },
];

class TargetCardScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.found = [];
    this.foundNames = new Set();
    this.allVisited = []; // log of every card visited (for debugging)
  }

  async initialize() {
    console.log('🚀 Initializing Target Card Scraper...');
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    // Block images/stylesheets/fonts to speed up loading
    await this.context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['stylesheet', 'font', 'media'].includes(type)) {
        route.abort();
      } else if (type === 'image') {
        // Allow event card images (we need them), block avatars/icons/logos
        const url = route.request().url();
        if (url.includes('eventcards') || url.includes('cardr')) {
          route.continue();
        } else {
          route.abort();
        }
      } else {
        route.continue();
      }
    });

    console.log('✅ Browser Ready\n');
  }

  // Check if a card name matches any of our remaining targets
  matchesTarget(cardName, eventName, tier) {
    const nameLower = (cardName || '').toLowerCase().trim();
    if (!nameLower) return null;
    for (const t of TARGETS) {
      if (this.foundNames.has(t.name)) continue; // already found
      if (t.event !== eventName) continue;
      if (String(t.tier) !== String(tier)) continue;
      if (nameLower.includes(t.name)) {
        return t;
      }
    }
    return null;
  }

  // Extract card detail links from a listing page
  async extractCardLinks(page, eventSlug) {
    return await page.evaluate((slug) => {
      const results = [];
      const isCardDetailLink = (href) => {
        try {
          const parts = new URL(href).pathname.split('/').filter(Boolean);
          return parts[0] === 'card-events' && parts[1] === slug && parts.length >= 3;
        } catch (e) { return false; }
      };
      document.querySelectorAll('a[href*="/card-events/"]').forEach(link => {
        if (!isCardDetailLink(link.href)) return;
        results.push(link.href);
      });
      return [...new Set(results)];
    }, eventSlug);
  }

  // Visit a card detail page and extract metadata
  async fetchCardMetadata(detailUrl, eventName, eventSlug, tier) {
    const page = await this.context.newPage();
    try {
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for breadcrumb to load (position 5 = card name)
      await page.waitForFunction(() => {
        const breadcrumbs = document.querySelectorAll('ol.breadcrumb-new li');
        return breadcrumbs.length >= 4;
      }, { timeout: 10000 }).catch(() => {});

      await page.waitForTimeout(1000);

      const meta = await page.evaluate(() => {
        let cardName = null;
        let tierFromPage = null;
        let creatorName = 'Anonymous';
        let imageUrl = null;

        // Extract from breadcrumbs
        const items = Array.from(document.querySelectorAll('ol.breadcrumb-new li[itemprop="itemListElement"]'));
        items.forEach(item => {
          const pos = item.querySelector('meta[itemprop="position"]')?.getAttribute('content');
          const name = item.querySelector('span[itemprop="name"]')?.textContent?.trim();
          if (pos === '4') tierFromPage = name;
          if (pos === '5') cardName = name;
        });

        // Fallback: also check breadcrumb links directly (different DOM structure)
        if (!cardName) {
          const allLinks = document.querySelectorAll('a[href*="/card-events/"]');
          const cardLinks = [];
          allLinks.forEach(a => {
            const t = a.textContent.trim();
            const h = a.getAttribute('href') || '';
            if (t && t !== 'Summer' && t !== 'Halloween' && t !== 'Christmas' &&
                t !== 'Valentines Day' && t !== 'Easter' &&
                !t.startsWith('Tier ') && t !== 'Terms of Service' &&
                !t.includes('Card Events') && !t.includes('Cards') &&
                h.includes('/card-events/') && h.split('/').length >= 4) {
              cardLinks.push(t);
            }
          });
          if (cardLinks.length > 0) cardName = cardLinks[cardLinks.length - 1];
        }

        if (!cardName) cardName = document.querySelector('h1')?.textContent?.trim();

        // Extract image
        const video = document.querySelector('video');
        const videoSource = document.querySelector('video source');
        if (videoSource && videoSource.src) imageUrl = videoSource.src;
        else if (video && video.src) imageUrl = video.src;
        if (!imageUrl) {
          const imgs = document.querySelectorAll('img');
          for (const img of imgs) {
            const src = img.getAttribute('src') || '';
            if (src.includes('cdn.shoob.gg') && src.includes('eventcards')) {
              imageUrl = src;
              break;
            }
          }
        }

        // Extract creator
        const bodyText = document.body.textContent || '';
        const makerMatch = bodyText.match(/Card Maker:([^S]+?)See the Maker/);
        if (makerMatch) creatorName = makerMatch[1].trim();
        if (!creatorName || creatorName === 'Official' || creatorName === 'Unknown Creator' ||
            creatorName.includes('People who want') || creatorName.includes('Requested by')) {
          creatorName = 'Anonymous';
        }

        return { cardName, tierFromPage, creatorName, imageUrl };
      });

      return {
        detailUrl,
        cardName: meta.cardName || 'Unknown',
        tier: meta.tierFromPage ? String(meta.tierFromPage).replace(/^Tier\s*/i, '').trim() : String(tier),
        creator: meta.creatorName,
        imageUrl: meta.imageUrl,
        eventName,
        eventSlug,
        description: `${meta.cardName || 'Unknown'} from ${eventName}`,
        scrapedAt: new Date().toISOString(),
      };
    } catch (e) {
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  }

  // Get the max page count for an event+tier listing
  async getMaxPage(page) {
    try {
      await page.waitForSelector('button.MuiPaginationItem-page', { timeout: 10000 }).catch(() => {});
      const maxPage = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button.MuiPaginationItem-page'));
        const pages = buttons
          .map(b => parseInt(b.textContent?.trim(), 10))
          .filter(val => !isNaN(val));
        return pages.length > 0 ? Math.max(...pages) : 1;
      });
      return maxPage;
    } catch (e) {
      return 1;
    }
  }

  async scrapeTier(eventConfig) {
    const { event, slug, tier } = eventConfig;
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📋 Scraping ${event} T${tier}`);
    console.log('═'.repeat(70));

    const hub = await this.context.newPage();
    const baseUrl = `https://shoob.gg/card-events/${slug}?tier=${tier}`;

    // Get max page count
    await hub.goto(`${baseUrl}&page=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await hub.waitForSelector(`a[href*="/card-events/${slug}/"]`, { timeout: 15000 }).catch(() => {});
    await hub.waitForTimeout(2000);
    const maxPage = await this.getMaxPage(hub);
    console.log(`   📊 ${event} T${tier} has ${maxPage} pages`);

    let pageCardsFound = 0;

    for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
      // Check if all targets found
      const remaining = TARGETS.filter(t => !this.foundNames.has(t.name) && t.event === event && String(t.tier) === String(tier));
      if (remaining.length === 0) {
        console.log(`   ✅ All ${event} T${tier} targets found!`);
        break;
      }

      console.log(`\n   📄 Page ${pageNum}/${maxPage} (${remaining.length} targets remaining)...`);

      let links = [];
      let retries = 3;
      while (retries > 0) {
        try {
          await hub.goto(`${baseUrl}&page=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await hub.waitForSelector(`a[href*="/card-events/${slug}/"]`, { timeout: 15000 });
          await hub.waitForTimeout(2000);
          links = await this.extractCardLinks(hub, slug);
          if (links.length > 0) break;
        } catch (err) {
          console.log(`      ⚠️ Retry ${retries}: ${err.message}`);
        }
        retries--;
        if (retries > 0) await hub.waitForTimeout(3000);
      }

      if (links.length === 0) {
        console.log(`      ❌ No cards on page ${pageNum}, skipping`);
        continue;
      }

      console.log(`      🔍 Found ${links.length} card links`);

      // Visit each card detail page in parallel batches
      const BATCH_SIZE = 6;
      for (let i = 0; i < links.length; i += BATCH_SIZE) {
        const batch = links.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(batch.map(async (url, idx) => {
          await new Promise(r => setTimeout(r, idx * 200)); // stagger
          return await this.fetchCardMetadata(url, event, slug, tier);
        }));

        for (const card of results) {
          if (!card) continue;
          pageCardsFound++;

          const match = this.matchesTarget(card.cardName, event, tier);
          if (match && !this.foundNames.has(match.name)) {
            this.foundNames.add(match.name);
            this.found.push({ ...card, targetName: match.name });
            console.log(`   🎯 FOUND: "${card.cardName}" → matches "${match.name}"`);
            console.log(`      Image: ${card.imageUrl}`);
          }
          this.allVisited.push({
            name: card.cardName,
            url: card.detailUrl,
            tier: card.tier,
            event: card.eventName,
          });
        }

        // Check if all targets for this tier are found
        const stillRemaining = TARGETS.filter(t => !this.foundNames.has(t.name) && t.event === event && String(t.tier) === String(tier));
        if (stillRemaining.length === 0) {
          console.log(`   ✅ All ${event} T${tier} targets found!`);
          break;
        }
      }

      // Periodic save
      this.saveProgress();
    }

    console.log(`\n   📊 ${event} T${tier}: visited ${pageCardsFound} cards, found ${this.found.filter(c => c.eventName === event && c.tier === String(tier)).length} targets`);
    await hub.close();
  }

  saveProgress() {
    const data = {
      found: this.found,
      foundNames: Array.from(this.foundNames),
      totalVisited: this.allVisited.length,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  }

  async start() {
    try {
      await this.initialize();

      for (const tierConfig of SCRAPE_TIERS) {
        // Check if all targets for this event+tier are already found
        const remaining = TARGETS.filter(t =>
          !this.foundNames.has(t.name) &&
          t.event === tierConfig.event &&
          String(t.tier) === String(tierConfig.tier)
        );
        if (remaining.length === 0) {
          console.log(`⏭️  Skipping ${tierConfig.event} T${tierConfig.tier} (all targets found)`);
          continue;
        }
        await this.scrapeTier(tierConfig);
      }

      console.log('\n' + '═'.repeat(70));
      console.log('🎯 FINAL RESULTS');
      console.log('═'.repeat(70));
      console.log(`Found ${this.found.length}/${TARGETS.length} target cards:\n`);
      for (const card of this.found) {
        console.log(`✅ ${card.cardName} — ${card.eventName} T${card.tier}`);
        console.log(`   Target: "${card.targetName}"`);
        console.log(`   URL: ${card.detailUrl}`);
        console.log(`   Image: ${card.imageUrl}`);
        console.log(`   Creator: ${card.creator}`);
        console.log('');
      }

      const missing = TARGETS.filter(t => !this.foundNames.has(t.name));
      if (missing.length > 0) {
        console.log(`❌ Missing ${missing.length} cards:`);
        missing.forEach(t => console.log(`   - ${t.name} — ${t.event} T${t.tier}`));
      }

      this.saveProgress();
      console.log(`\n📁 Results saved to ${OUTPUT_FILE}`);
      console.log(`📊 Total cards visited: ${this.allVisited.length}`);
    } finally {
      if (this.browser) await this.browser.close().catch(() => {});
    }
  }
}

new TargetCardScraper().start();
