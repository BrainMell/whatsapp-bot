/**
 * merge_overnight.js
 *
 * Merges overnight scraping results into cards_data.json:
 *   1. Updates "Unknown" cards with their real names/metadata
 *   2. Adds new cards with E-XXXXX IDs (continuing from max)
 */

const fs = require('fs');
const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';
const RESULTS_FILE = '/home/z/my-project/scripts/overnight_results.json';

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));

console.log(`Existing cards: ${data.cards.length}`);
console.log(`Cards to fix: ${results.fixed_cards.length}`);
console.log(`New cards to add: ${results.new_cards.length}`);

// Find max E-XXXXX ID
let maxEventNum = 0;
for (const c of data.cards) {
  const m = String(c.id || '').match(/^E-(\d{5})$/);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num > maxEventNum) maxEventNum = num;
  }
}
console.log(`Current max event ID: E-${String(maxEventNum).padStart(5, '0')}`);

// Phase 1: Fix Unknown cards
let fixed = 0;
for (const fix of results.fixed_cards) {
  const card = data.cards.find(c => c.id === fix.id);
  if (!card) continue;
  if (card.cardName !== 'Unknown' && card.cardName) continue; // already fixed

  card.cardName = fix.newName;
  card.tier = fix.tier;
  card.creator = fix.creator;
  if (fix.imageUrl) card.imageUrl = fix.imageUrl;
  card.description = `${fix.newName} from ${card.eventName || card.animeName}`;
  fixed++;
}

console.log(`\nFixed ${fixed} cards`);

// Phase 2: Add new cards
let nextId = maxEventNum + 1;
let added = 0;
let skipped = 0;

const existingUrls = new Set(data.cards.map(c => c.detailUrl).filter(Boolean));
const existingImgs = new Set(data.cards.map(c => c.imageUrl).filter(Boolean));

for (const card of results.new_cards) {
  if (existingUrls.has(card.detailUrl) || (card.imageUrl && existingImgs.has(card.imageUrl))) {
    skipped++;
    continue;
  }

  const newId = `E-${String(nextId).padStart(5, '0')}`;
  const newCard = {
    id: newId,
    cardName: card.cardName,
    animeName: card.eventName,
    eventName: card.eventName,
    tier: card.tier,
    creator: card.creator,
    imageUrl: card.imageUrl,
    detailUrl: card.detailUrl,
    description: card.description,
    scrapedAt: card.scrapedAt,
  };

  data.cards.push(newCard);
  existingUrls.add(card.detailUrl);
  if (card.imageUrl) existingImgs.add(card.imageUrl);
  nextId++;
  added++;
}

// Update metadata
data.totalCards = data.cards.length;
data.uniqueCards = data.cards.length;
data.lastUpdated = new Date().toISOString();
if (data.metadata) {
  data.metadata.lastUpdated = new Date().toISOString();
  const tierBreakdown = {};
  for (const c of data.cards) {
    const t = String(c.tier || '1');
    tierBreakdown[t] = (tierBreakdown[t] || 0) + 1;
  }
  data.metadata.tierBreakdown = tierBreakdown;
}

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

console.log(`\n${'═'.repeat(60)}`);
console.log('MERGE COMPLETE');
console.log(`${'═'.repeat(60)}`);
console.log(`Fixed: ${fixed} cards`);
console.log(`Added: ${added} new cards`);
console.log(`Skipped (duplicates): ${skipped}`);
console.log(`New total: ${data.cards.length} cards`);
console.log(`New max event ID: E-${String(nextId - 1).padStart(5, '0')}`);
