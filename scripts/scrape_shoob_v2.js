// scrape_shoob_v2.js
// CORRECTED shoob.gg scraper — replaces scripts/scrape_shoob.js
//
// What was wrong with the old scraper (scrape_shoob.js):
//   1. URL omitted `&tier=X`, so it scraped a mixed-tier listing and could
//      not know which tier each card belonged to. It then HARDCODED
//      `card.tier = '1'` for every new card.
//   2. Never visited the detail page. Creator was never extracted, so it
//      defaulted to 'shoob.gg' from the URL host.
//   3. ID format was `new-<page>-<seq>` — wrong. Should be `<tier>-<seq>`
//      continuing from the max existing ID for that tier.
//
// This corrected version:
//   - Iterates each tier explicitly (1, 2, 3, 4, 5, 6, S) like the user's
//     original shoob-scraper.js / local.js pattern.
//   - For each new card found on a listing page, visits the detail page to
//     extract:
//        tier    : from breadcrumb position 2 (text "Tier N")
//        creator : via /Card Maker:([^S]+?)See the Maker/ regex
//                   (fallback: a[href*="/u/"] link text)
//        anime   : from breadcrumb position 3
//        name    : from breadcrumb position 4
//        image   : from og:image meta (CDN URL)
//   - Assigns IDs as `<tier>-<padded_seq>` continuing from the max existing
//     ID for that tier.
//
// Usage:
//   node scrape_shoob_v2.js                       # scrape all tiers
//   node scrape_shoob_v2.js --tiers 4,5,6,S       # scrape specific tiers
//   node scrape_shoob_v2.js --smoke 5             # 5 cards per tier only

const { execFile } = require('child_process');
const fs = require('fs');

const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';
const BACKUP_PATH = DATA_PATH + '.bak';
const PROGRESS_FILE = '/tmp/scrape_v2_progress.json';
const PARALLEL_SESSIONS = 4;
const SAVE_EVERY = 4;

// Tier page limits (from the user's shoob-scraper.js)
const TIER_LIMITS = { '1': 805, '2': 549, '3': 440, '4': 360, '5': 138, '6': 35, 'S': 8 };

// ─── async wrappers ──────────────────────────────────────────────────────
function ab(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('agent-browser', args, {
      timeout: 30000, encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      ...opts,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${err.message} | stderr=${(stderr || '').slice(0, 200)}`));
      } else resolve(stdout);
    });
  });
}

async function abEval(session, js) {
  const raw = await ab(['--session', session, 'eval', js], { timeout: 20000 });
  let s = raw.trim();
  if (s.startsWith('"')) s = s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  try { return JSON.parse(s); } catch (e) { return s; }
}

async function abWaitFn(session, js, timeout = 12000) {
  try { await ab(['--session', session, 'wait', '--fn', js], { timeout }); return true; }
  catch (e) { return false; }
}

async function abWaitMs(session, ms) {
  try { await ab(['--session', session, 'wait', String(ms)], { timeout: ms + 5000 }); } catch (e) {}
}

async function abClose(session) {
  try { await ab(['--session', session, 'close'], { timeout: 8000 }); } catch (e) {}
}

// ─── extraction JS (runs in browser) ─────────────────────────────────────
// Extract all card links from a shoob.gg listing page.
const LISTING_EXTRACT_JS = `(function(){
  var seen = new Set();
  var cards = [];
  var blacklist = ['shoob home','home','shoob logo','navigation','nav','menu','header','footer'];
  var isBl = function(n){ var l = (n||'').toLowerCase().trim(); return blacklist.some(function(t){ return l === t || l.includes(t); }); };
  document.querySelectorAll('a[href*="/cards/info/"]').forEach(function(link){
    var img = link.querySelector('img');
    if (!img || !img.src || img.src.includes('card_back')) return;
    var name = img.alt || 'Unknown';
    if (isBl(name)) return;
    var url = link.href;
    if (seen.has(url)) return;
    seen.add(url);
    // Extract cardId from URL
    var m = url.match(/\\/cards\\/info\\/([a-f0-9]+)/);
    cards.push({ detailUrl: url, cardId: m ? m[1] : null, imageUrl: img.src, cardName: name });
  });
  return JSON.stringify(cards);
})()`;

// Extract full metadata from a card detail page.
// Same logic as repair_broken_cards.js — extract tier from breadcrumb pos 2,
// creator via Card Maker regex, anime from pos 3, name from pos 4.
const DETAIL_EXTRACT_JS = `(function(){
  var r = { tier: null, animeName: null, cardName: null, creator: null, imageUrl: null };
  var items = Array.from(document.querySelectorAll('ol.breadcrumb-new li[itemprop="itemListElement"]'));
  items.forEach(function(item){
    var pos = (item.querySelector('meta[itemprop="position"]')||{}).getAttribute
      ? item.querySelector('meta[itemprop="position"]').getAttribute('content') : null;
    var name = (item.querySelector('span[itemprop="name"]')||{}).textContent
      ? item.querySelector('span[itemprop="name"]').textContent.trim() : null;
    if (pos === '2' && name) {
      var m = name.match(/^Tier\\s+([1-6SE])$/i);
      if (m) r.tier = m[1].toUpperCase();
    }
    if (pos === '3' && name) r.animeName = name;
    if (pos === '4' && name) r.cardName = name;
  });
  var body = document.body.textContent || '';
  var mk = body.match(/Card Maker:([^S]+?)See the Maker/);
  if (mk) r.creator = mk[1].trim();
  if (!r.creator) {
    var uLink = Array.from(document.querySelectorAll('a[href*="/u/"]'))
      .find(function(a){ return !a.textContent.includes('See'); });
    if (uLink) r.creator = uLink.textContent.trim();
  }
  var og = document.querySelector('meta[property="og:image"]');
  if (og) r.imageUrl = og.getAttribute('content');
  return JSON.stringify(r);
})()`;

const BREADCRUMB_READY_FN = `Array.from(document.querySelectorAll('ol.breadcrumb-new li[itemprop="itemListElement"]')).filter(function(li){var p=li.querySelector('meta[itemprop="position"]');return p&&p.getAttribute('content')==='2';}).length > 0`;

async function fetchDetail(session, detailUrl, attempt = 1) {
  try {
    await ab(['--session', session, 'open', detailUrl], { timeout: 25000 });
    await abWaitFn(session, BREADCRUMB_READY_FN, 10000);
    await abWaitMs(session, 600);
    const meta = await abEval(session, DETAIL_EXTRACT_JS);
    if (typeof meta === 'string') {
      try { return JSON.parse(meta); } catch (e) { return null; }
    }
    return meta;
  } catch (e) {
    if (attempt < 3) {
      await abWaitMs(session, 1500);
      return fetchDetail(session, detailUrl, attempt + 1);
    }
    return null;
  }
}

async function scrapeListingPage(session, tier, pageNum) {
  await ab(['--session', session, 'open',
    `https://shoob.gg/cards?page=${pageNum}&tier=${tier}`],
    { timeout: 25000 });
  // Wait for card links to appear
  await abWaitFn(session,
    `document.querySelectorAll('a[href*="/cards/info/"]').length > 0`,
    12000);
  await abWaitMs(session, 800);
  const raw = await abEval(session, LISTING_EXTRACT_JS);
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return []; }
  }
  return Array.isArray(raw) ? raw : [];
}

// ─── main ─────────────────────────────────────────────────────────────────
async function main() {
  // Parse args
  let tiersToScrape = ['1', '2', '3', '4', '5', '6', 'S'];
  let smokeN = 0;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--tiers' && process.argv[i + 1]) {
      tiersToScrape = process.argv[++i].split(',').map(s => s.trim());
    } else if (process.argv[i] === '--smoke' && process.argv[i + 1]) {
      smokeN = parseInt(process.argv[++i], 10);
    }
  }
  console.log(`→ Tiers to scrape: ${tiersToScrape.join(', ')}`);
  if (smokeN > 0) console.log(`  SMOKE: ${smokeN} cards per tier only`);

  // Load existing data
  console.log('→ Loading existing cards_data.json...');
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const cards = data.cards || data;
  console.log(`  Existing cards: ${cards.length}`);

  // Build set of existing detailUrls to skip
  const existingUrls = new Set(cards.map(c => c.detailUrl).filter(Boolean));

  // Compute max ID per tier (continue from max)
  const tierCounters = {};
  for (const c of cards) {
    if (!c.id || c.id.startsWith('new-') || c.id.startsWith('event-')) continue;
    const m = c.id.match(/^([1-6SE])-(\d+)$/);
    if (!m) continue;
    const tier = m[1];
    const num = parseInt(m[2], 10);
    if (!tierCounters[tier] || num > tierCounters[tier]) tierCounters[tier] = num;
  }
  console.log(`  Current max IDs per tier: ${JSON.stringify(tierCounters)}`);

  // Load progress
  let progress = { scraped: [], failed: [] };
  try {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    console.log(`  Resuming: ${progress.scraped.length} scraped, ${progress.failed.length} failed`);
  } catch (e) {}

  // Warm up sessions
  console.log(`→ Warming up ${PARALLEL_SESSIONS} browser sessions...`);
  for (let i = 0; i < PARALLEL_SESSIONS; i++) {
    try { await ab(['--session', `scrape-${i}`, 'open', 'about:blank'], { timeout: 15000 }); }
    catch (e) { console.log(`  warmup scrape-${i} failed: ${e.message.slice(0, 80)}`); }
  }

  const newCards = [];
  let processed = 0;
  const startTime = Date.now();

  for (const tier of tiersToScrape) {
    const maxPage = TIER_LIMITS[tier] || 1;
    console.log(`\n=== Tier ${tier} (${maxPage} pages) ===`);

    for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
      let listing;
      try {
        listing = await scrapeListingPage('scrape-0', tier, pageNum);
      } catch (e) {
        console.log(`  P${pageNum} listing failed: ${e.message.slice(0, 80)}`);
        continue;
      }
      if (listing.length === 0) {
        console.log(`  P${pageNum}: no cards found, skipping`);
        continue;
      }

      // Filter to new cards only
      const newOnes = listing.filter(c => c.detailUrl && !existingUrls.has(c.detailUrl));
      if (newOnes.length === 0) {
        if (pageNum % 50 === 0) console.log(`  P${pageNum}: 0 new (all known)`);
        continue;
      }

      console.log(`  P${pageNum}: ${newOnes.length} new (of ${listing.length})`);
      if (smokeN > 0 && newCards.length >= smokeN) break;

      // Fetch details in parallel batches
      for (let i = 0; i < newOnes.length; i += PARALLEL_SESSIONS) {
        const batch = newOnes.slice(i, i + PARALLEL_SESSIONS);
        const results = await Promise.all(batch.map(async (card, idx) => {
          const session = `scrape-${idx}`;
          try {
            const meta = await fetchDetail(session, card.detailUrl);
            return { card, meta };
          } catch (e) {
            return { card, meta: null, error: e.message };
          }
        }));

        for (const { card, meta, error } of results) {
          processed++;
          if (meta && meta.tier) {
            const cardTier = meta.tier; // trust detail page over listing
            tierCounters[cardTier] = (tierCounters[cardTier] || 0) + 1;
            const newId = `${cardTier}-${String(tierCounters[cardTier]).padStart(5, '0')}`;
            const newCard = {
              id: newId,
              imageUrl: meta.imageUrl || card.imageUrl,
              detailUrl: card.detailUrl,
              cardName: meta.cardName || card.cardName,
              creator: meta.creator || 'Anonymous',
              animeName: meta.animeName || 'Unknown',
              description: `${meta.cardName || card.cardName} from ${meta.animeName || 'Unknown'}`,
              tier: cardTier,
              page: pageNum,
              scrapedAt: new Date().toISOString(),
            };
            newCards.push(newCard);
            existingUrls.add(card.detailUrl);
            console.log(`    ✓ ${newId} T${cardTier} "${newCard.cardName}" by ${newCard.creator}`);
          } else {
            progress.failed.push({ detailUrl: card.detailUrl, error: error || 'no meta' });
            console.log(`    ✗ ${card.detailUrl} ${error || ''}`);
          }
        }

        if (Math.floor(i / PARALLEL_SESSIONS) % SAVE_EVERY === 0) {
          progress.scraped = newCards;
          fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
        }
      }

      if (smokeN > 0 && newCards.length >= smokeN) {
        console.log(`  SMOKE: reached ${smokeN} cards, stopping`);
        break;
      }
    }
    if (smokeN > 0 && newCards.length >= smokeN) break;
  }

  // Close sessions
  for (let i = 0; i < PARALLEL_SESSIONS; i++) await abClose(`scrape-${i}`);

  if (smokeN > 0) {
    console.log(`\n→ SMOKE MODE: not writing to data file. Scraped ${newCards.length} cards:`);
    console.log(JSON.stringify(newCards.slice(0, smokeN), null, 2));
    return;
  }

  // Merge into cards array and write back
  console.log(`\n→ Merging ${newCards.length} new cards into data file...`);
  if (newCards.length > 0) {
    if (!fs.existsSync(BACKUP_PATH)) fs.copyFileSync(DATA_PATH, BACKUP_PATH);
    const allCards = [...cards, ...newCards];
    // Sort by tier then numeric id
    const tierOrder = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, 'S': 7, 'E': 8 };
    allCards.sort((a, b) => {
      const tA = tierOrder[a.tier] || 99;
      const tB = tierOrder[b.tier] || 99;
      if (tA !== tB) return tA - tB;
      const nA = parseInt((a.id || '').split('-').pop() || '0', 10);
      const nB = parseInt((b.id || '').split('-').pop() || '0', 10);
      return nA - nB;
    });
    data.cards = allCards;
    data.totalCards = allCards.length;
    data.uniqueCards = allCards.length;
    data.lastUpdated = new Date().toISOString();
    data.lastScrape = {
      at: new Date().toISOString(),
      newCards: newCards.length,
      perTierMax: tierCounters,
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`✅ DONE. Wrote ${allCards.length} cards to ${DATA_PATH}`);
    console.log(`   Backup: ${BACKUP_PATH}`);
  } else {
    console.log('No new cards found.');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   Total time: ${elapsed}s | per-tier max: ${JSON.stringify(tierCounters)}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
