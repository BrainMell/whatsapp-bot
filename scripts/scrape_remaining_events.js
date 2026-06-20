// Scrape remaining event categories and merge into database + MongoDB
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
          allCards.push({
            cardId: id, id: 'event-' + id, cardName: event.name + ' Event Card',
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

    // Create CardStat entries in MongoDB
    const uri = 'mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(uri);
    const CardStat = require('./core/models/CardStat');

    const batch = newCards.map(c => ({
      cardId: c.id,
      totalSpawned: 0,
      maxCopies: 1000,
      uniqueOwners: 0,
      totalCirculation: 0,
      lastTradePrice: 0,
      recentTradePrices: [],
    }));

    if (batch.length > 0) {
      await CardStat.insertMany(batch);
      console.log('Created ' + batch.length + ' CardStat entries in MongoDB');
    }

    const total = await CardStat.countDocuments();
    console.log('Total CardStat entries: ' + total);

    // Final tier breakdown
    const tiers = {};
    merged.forEach(c => { const t = String(c.tier||'?'); tiers[t] = (tiers[t]||0)+1; });
    console.log('Final tiers: ' + JSON.stringify(tiers));
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
