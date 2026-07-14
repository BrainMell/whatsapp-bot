/**
 * fix_unknown_cards.js
 *
 * Fixes 5 event cards that were added by a background scraper run
 * with wrong data (name="Unknown", tier="1"). Updates them with
 * the correct cardName, tier, eventName, creator, and imageUrl
 * from our scraping results.
 */

const fs = require('fs');
const data = require('/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json');
const found = require('/home/z/my-project/scripts/found_target_cards.json');

const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';

// Map of targetName → correct card data from scraping
const fixes = {};
for (const card of found.found) {
  fixes[card.targetName] = card;
}

// Find and fix each "Unknown" card by matching detailUrl
let fixed = 0;
for (const card of data.cards) {
  if (card.cardName === 'Unknown' && card.detailUrl) {
    // Find matching scraped card by detailUrl
    const match = Object.values(fixes).find(f => f.detailUrl === card.detailUrl);
    if (match) {
      console.log(`Fixing ${card.id}:`);
      console.log(`  Name: "Unknown" → "${match.cardName}"`);
      console.log(`  Tier: "${card.tier}" → "${match.tier}"`);
      console.log(`  Event: "${card.eventName || card.animeName}" → "${match.eventName}"`);
      console.log(`  Creator: "${card.creator}" → "${match.creator}"`);
      console.log(`  Image: "${card.imageUrl?.substring(0,60)}..." → "${match.imageUrl?.substring(0,60)}..."`);
      console.log('');

      card.cardName = match.cardName;
      card.tier = String(match.tier);
      card.eventName = match.eventName;
      card.animeName = match.eventName;
      card.creator = match.creator;
      card.imageUrl = match.imageUrl;
      card.description = match.description || `${match.cardName} from ${match.eventName}`;
      fixed++;
    }
  }
}

// Save
fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

console.log(`\nFixed ${fixed} cards.`);
console.log(`Total cards: ${data.cards.length}`);
