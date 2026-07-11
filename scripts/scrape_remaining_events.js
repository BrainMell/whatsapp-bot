// Scrape remaining event categories and merge into database + MongoDB
// 💡 FIXED: Uses E-XXXXX sequential ID format (matching regular cards)
// instead of the old 'event-<hex>' format that produced 40+ char IDs.
const { execFileSync } = require('child_process');
const fs = require('fs');
const mongoose = require('mongoose');

const evalJs = '(function(){var cl=document.querySelector(".cards-list");if(!cl)return JSON.stringify([]);var a=cl.querySelectorAll("a");var r=[];a.forEach(function(x){var h=x.getAttribute("href")||"";if(h.includes("/card-events/")){var p=h.split("/");var id=p[p.length-1];if(id&&id.length>10)r.push(id)}});return JSON.stringify(r)})()';

const events = [
  {name:'Valentines Day', slug:'valentines-day'},
  {name:'Halloween', slug:'halloween'},
  {name:'Christmas', slug:'christmas'},
  {name:'Easter', slug:'easter'},
  {name:'My Hero Academia CCG', slug:'my-hero-academia-ccg'},
  {name:'Maid Day', slug:'maid-day'},
];

// 💡 Compute the next E-XXXXX sequence number from existing data
function getNextEventId(existingCards) {
  let maxNum = 0;
  for (const c of existingCards) {
    const m = String(c.id || '').match(/^E-(\d{5})$/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return maxNum;
}

async function main() {
  const allCards = [];

  for (const event of events) {
    try { execFileSync('agent-browser', ['close'], { timeout: 5000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }); } catch(e) {}

    let count = 0;
    for (let page = 1; page <= 50; page++) {
      try {
        execFileSync('agent-browser', ['open', 'https://shoob.gg/card-events/' + event.slug + '?page=' + page], { timeout: 12000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
        execFileSync('agent-browser', ['wait', '2000'], { timeout: 5000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
        const raw = execFileSync('agent-browser', ['eval', evalJs], { timeout: 8000, encoding: 'utf8', maxBuffer: 5*1024*1024, stdio: ['pipe','pipe','pipe'] });
        let str = raw.trim();
        if (str.startsWith('"')) str = str.slice(1,-1).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
        let ids = [];
        try { ids = JSON.parse(str); } catch(e) { break; }
        if (ids.length === 0) break;
        for (const id of ids) {
          // 💡 FIX: Don't assign IDs here — the organizer script
          // (organize-events.js) handles E-XXXXX assignment after
          // dedup + sort. Store the raw shoob hex ID in cardId field
          // so the organizer can match and dedupe by detailUrl/imageUrl.
          allCards.push({
            cardId: id,  // raw shoob hex (for matching)
            // id will be assigned by organize-events.js as E-XXXXX
            cardName: event.name + ' Event Card',
            animeName: event.name, tier: 'E', event: event.name, eventSlug: event.slug,
            imageUrl: 'https://api.shoob.gg/site/api/cardr/' + id + '?size=400',
            detailUrl: 'https://shoob.gg/card-events/' + event.slug + '/' + id,
            scrapedAt: new Date().toISOString(),
          });
          count++;
        }
      } catch(e) { break; }
    }
    console.log(event.name + ': ' + count + ' cards');
  }

  console.log('\nTotal new event cards: ' + allCards.length);

  if (allCards.length > 0) {
    // Merge into cards_data.json
    const data = require('./core/data/cards_data.json');
    const arr = data.cards || data;
    const existing = Array.isArray(arr) ? arr : Object.values(arr);
    const existingIds = new Set(existing.map(c => c.id));
    const newCards = allCards.filter(c => !existingIds.has(c.id));
    const merged = [...existing, ...newCards];
    fs.writeFileSync('./core/data/cards_data.json', JSON.stringify({ cards: merged }, null, 2));
    console.log('Merged ' + newCards.length + ' new event cards. Total: ' + merged.length);
    console.log('\n⚠️  NOTE: Event cards have no E-XXXXX IDs yet.');
    console.log('   Run organize-events.js (from the event_scraper project) to assign proper IDs.');

    // Create CardStat entries in MongoDB — but only after IDs are assigned
    // by the organizer. Skip CardStat creation here; the merge_event_cards.js
    // script handles it when the organized data is merged in.
    console.log('\n⏭️  Skipping CardStat creation — run merge_event_cards.js after organizing.');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
