'use strict';
/**
 * hidden-set catalog merge (Task 31, 2026-10-25)
 *
 * Merges the vetted video-game roster (scripts/hiddenset/roster1+2.js) into
 * core/data/cards_data.json as a HIDDEN card set:
 *   hidden: true, hiddenSet: 'videogames', artPending: true
 * They never spawn/show anywhere until a group runs `.j hiddenset videogames on`
 * (cardSystem gate), and artPending keeps them unspawnable until real art lands.
 *
 * Idempotent: existing ids are never touched; roster entries whose
 * cardName+series already exist in the live catalog are dropped (dedupe).
 * IDs: V-00001... assigned per sorted (tier -> name) order.
 * Safety: timestamped backup + atomic tmp/rename write. --dry reports only.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const LIVE = path.join(REPO, 'core', 'data', 'cards_data.json');
const DRY = process.argv.includes('--dry');

const roster = [
  ...require('./roster1.js'),
  ...require('./roster2.js'),
];

const raw = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
const cards = Array.isArray(raw.cards) ? raw.cards : Object.values(raw.cards);
const isObj = !Array.isArray(raw.cards);

const key = (n, s) => `${String(n).trim().toLowerCase()}|${String(s).trim().toLowerCase()}`;
const existing = new Set(cards.map(c => key(c.cardName, c.animeName)));

// per-tier sequence continues after current V- max
let vMax = 0;
for (const c of cards) {
  const m = /^V-(\d+)$/i.exec(String(c.id || ''));
  if (m) vMax = Math.max(vMax, parseInt(m[1], 10));
}

const seen = new Set();
const fresh = [];
const dupes = [];
for (const [name, series, tier] of roster) {
  const k = key(name, series);
  if (existing.has(k) || seen.has(k)) { dupes.push(`${name} (${series})`); continue; }
  seen.add(k);
  const t = String(tier);
  if (!['1', '2', '3', '4', '5'].includes(t)) { dupes.push(`${name} (bad tier ${tier})`); continue; }
  fresh.push({ name, series, tier: t });
}
// deterministic order: tier asc, name asc
fresh.sort((a, b) => a.tier.localeCompare(b.tier, undefined, { numeric: true }) || a.name.localeCompare(b.name));

const now = new Date().toISOString();
const newCards = fresh.map(f => {
  vMax += 1;
  return {
    id: `V-${String(vMax).padStart(5, '0')}`,
    cardName: f.name,
    creator: 'hiddenset-v1',
    animeName: f.series,
    description: `${f.name} from ${f.series}`,
    tier: f.tier,
    imageUrl: '',
    detailUrl: '',
    page: 1,
    scrapedAt: now,
    hidden: true,
    hiddenSet: 'videogames',
    artPending: true,
  };
});

console.log(`live cards: ${cards.length}`);
console.log(`roster entries: ${roster.length}`);
console.log(`deduped (already in catalog or bad tier): ${dupes.length}`);
if (dupes.length) console.log('  dropped: ' + dupes.join(', '));
console.log(`new hidden cards: ${newCards.length}`);
const tiers = {};
for (const c of newCards) tiers[c.tier] = (tiers[c.tier] || 0) + 1;
console.log(`new by tier: ${JSON.stringify(tiers)}`);
const seriesCount = new Set(newCards.map(c => c.animeName)).size;
console.log(`series covered: ${seriesCount}`);
console.log('sample:', JSON.stringify(newCards.slice(0, 2)));

if (DRY) process.exit(0);
if (!newCards.length) { console.log('nothing to merge'); process.exit(0); }

const mergedCards = cards.concat(newCards);
const out = isObj ? { ...raw, cards: mergedCards } : { cards: mergedCards };
const backup = `${LIVE}.bak-hidden-${Date.now()}`;
fs.copyFileSync(LIVE, backup);
const tmp = `${LIVE}.tmp-hidden`;
fs.writeFileSync(tmp, JSON.stringify(out));
fs.renameSync(tmp, LIVE);
console.log(`backup: ${backup}`);
console.log(`merged: ${LIVE} now has ${mergedCards.length} cards (was ${cards.length})`);
