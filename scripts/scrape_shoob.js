// Shoob scraper v6 — uses execFile to avoid shell escaping issues
const { execFileSync } = require('child_process');
const fs = require('fs');

const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';
const PROGRESS_FILE = '/tmp/scraper_progress.json';

// Load existing
const data = require(DATA_PATH);
const arr = data.cards || data;
const existingArr = Array.isArray(arr) ? arr : Object.values(arr);
const existingIds = new Set();
existingArr.forEach(c => {
  const m = (c.imageUrl||'').match(/cardr\/([a-f0-9]+)/);
  if (m) existingIds.add(m[1]);
});

// Load progress
let progress = { lastPage: 0, newCards: [] };
try {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  progress.newCards.forEach(c => existingIds.add(c.cardId));
} catch(e) {}

const START = progress.lastPage + 1;
const END = 2395;
console.log(`[Scraper] ${existingIds.size} IDs, ${progress.newCards.length} new, starting at page ${START}`);

// JS code to extract cards — uses single quotes only (no shell conflicts)
const SCRAPE_JS = `(function(){var imgs=document.querySelectorAll('img[src*="cardr"]');var r=[];imgs.forEach(function(img){var t=img.getAttribute('title')||img.getAttribute('alt')||'';var s=img.src;var m=s.match(/cardr\\/([a-f0-9]+)/);r.push({title:t,cardId:m?m[1]:'',imageUrl:s})});return JSON.stringify(r)})()`;

let currentPage = START;

// Crash handler
process.on('uncaughtException', (err) => {
  console.error('[Scraper] CRASH:', err.message?.substring(0, 80));
  try {
    progress.lastPage = currentPage;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
    console.log('[Scraper] Saved on crash: page', progress.lastPage, progress.newCards.length, 'cards');
  } catch(e) {}
  process.exit(1);
});

for (let page = START; page <= END; page++) {
  currentPage = page;
  try {
    // Use execFileSync with array args — no shell interpretation
    execFileSync('agent-browser', ['open', `https://shoob.gg/cards?page=${page}`], { timeout: 15000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    execFileSync('agent-browser', ['wait', '1500'], { timeout: 5000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    
    // Pass JS directly as an argument — no shell, no escaping issues
    const raw = execFileSync('agent-browser', ['eval', SCRAPE_JS], { timeout: 10000, encoding: 'utf8', maxBuffer: 5*1024*1024, stdio: ['pipe','pipe','pipe'] });
    
    // Parse — output may be quoted JSON string
    let str = raw.trim();
    if (str.startsWith('"')) str = str.slice(1,-1).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    let cards = [];
    try { cards = JSON.parse(str); } catch(e) { continue; }
    
    let newCount = 0;
    for (const card of cards) {
      if (card.cardId && !existingIds.has(card.cardId)) {
        card.id = `new-${page}-${String(progress.newCards.length + newCount + 1).padStart(5, '0')}`;
        card.page = page;
        card.scrapedAt = new Date().toISOString();
        card.tier = '1';
        card.detailUrl = `https://shoob.gg/cards/info/${card.cardId}`;
        progress.newCards.push(card);
        newCount++;
        existingIds.add(card.cardId);
      }
    }
    
    if (page % 10 === 0 || newCount > 0) {
      console.log(`[Scraper] Page ${page}/${END}: ${newCount} new (total: ${progress.newCards.length})`);
    }
    
    // Save EVERY 5 pages
    if (page % 5 === 0) {
      progress.lastPage = page;
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
    }
  } catch (e) {
    console.error(`[Scraper] Page ${page} error: ${e.message?.substring(0, 50)}`);
    progress.lastPage = page;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
    // If 3 consecutive errors, restart browser
    continue;
  }
}

// Final save + merge
progress.lastPage = END;
fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

if (progress.newCards.length > 0) {
  const allCards = [...existingArr, ...progress.newCards];
  fs.copyFileSync(DATA_PATH, DATA_PATH + '.bak');
  fs.writeFileSync(DATA_PATH, JSON.stringify({ cards: allCards }, null, 2));
  console.log(`[Scraper] DONE! ${existingArr.length} + ${progress.newCards.length} = ${allCards.length} total`);
} else {
  console.log('[Scraper] No new cards.');
}
