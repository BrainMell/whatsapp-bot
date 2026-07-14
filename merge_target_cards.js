/**
 * merge_target_cards.js
 *
 * Merges the 11 found event cards into cards_data.json with proper
 * E-XXXXX IDs (continuing from the current max E-01815).
 *
 * Also adds: animeName (set to event name for event cards),
 * eventName field, and all other fields matching the existing
 * event card format.
 */

const fs = require('fs');

const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';
const FOUND_PATH = '/home/z/my-project/scripts/found_target_cards.json';

// Load data
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
const found = JSON.parse(fs.readFileSync(FOUND_PATH, 'utf-8'));

console.log(`Existing cards: ${data.cards.length}`);
console.log(`Found target cards: ${found.found.length}`);

// Find the current max E-XXXXX ID
let maxEventNum = 0;
for (const c of data.cards) {
  const m = String(c.id || '').match(/^E-(\d{5})$/);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num > maxEventNum) maxEventNum = num;
  }
}
console.log(`Current max event card ID: E-${String(maxEventNum).padStart(5, '0')}`);

// Check for duplicates (by detailUrl and imageUrl)
const existingUrls = new Set(data.cards.map(c => c.detailUrl).filter(Boolean));
const existingImgs = new Set(data.cards.map(c => c.imageUrl).filter(Boolean));

let nextId = maxEventNum + 1;
let added = 0;
let skipped = 0;

for (const card of found.found) {
  // Check for duplicates
  if (existingUrls.has(card.detailUrl) || existingImgs.has(card.imageUrl)) {
    console.log(`⏭️  Skipping duplicate: ${card.cardName}`);
    skipped++;
    continue;
  }

  const newId = `E-${String(nextId).padStart(5, '0')}`;
  const newCard = {
    id: newId,
    cardName: card.cardName,
    animeName: card.eventName,  // event cards use animeName = event name
    eventName: card.eventName,
    tier: card.tier,
    creator: card.creator,
    imageUrl: card.imageUrl,
    detailUrl: card.detailUrl,
    description: card.description || `${card.cardName} from ${card.eventName}`,
    scrapedAt: card.scrapedAt || new Date().toISOString(),
  };

  data.cards.push(newCard);
  existingUrls.add(card.detailUrl);
  existingImgs.add(card.imageUrl);
  nextId++;
  added++;

  console.log(`✅ Added: ${newId} | ${card.cardName} — ${card.eventName} T${card.tier}`);
}

// Update metadata
data.totalCards = data.cards.length;
data.uniqueCards = data.cards.length;
data.lastUpdated = new Date().toISOString();
if (data.metadata) {
  data.metadata.lastUpdated = new Date().toISOString();
  // Recalculate tier breakdown
  const tierBreakdown = {};
  for (const c of data.cards) {
    const t = String(c.tier || '1');
    tierBreakdown[t] = (tierBreakdown[t] || 0) + 1;
  }
  data.metadata.tierBreakdown = tierBreakdown;
}

// Save
fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

console.log(`\n${'═'.repeat(60)}`);
console.log(`MERGE COMPLETE`);
console.log(`${'═'.repeat(60)}`);
console.log(`Added: ${added} cards`);
console.log(`Skipped (duplicates): ${skipped} cards`);
console.log(`New total: ${data.cards.length} cards`);
console.log(`New max event ID: E-${String(nextId - 1).padStart(5, '0')}`);
console.log(`\nAll new card IDs:`);

// Print all new card IDs
for (const card of found.found) {
  const newCard = data.cards.find(c => c.detailUrl === card.detailUrl);
  if (newCard) {
    console.log(`  ${newCard.id} | ${newCard.cardName} — ${newCard.eventName} T${newCard.tier}`);
  }
}
