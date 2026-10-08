#!/usr/bin/env node
'use strict';
/* shoob_reg_diff.js — quantify missing regular cards
 * 1. fetch /sitemap/cards.1.xml (all regular card detail pages)
 * 2. load live cards_data.json, collect mongoIds from regular detailUrls
 * 3. diff -> missing list + per-tier max seq (for id assignment scheme)
 */
const fs = require('fs');
const UA = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const DB = '/home/ubuntu/whatsapp-bot/core/data/cards_data.json';

(async () => {
  const t0 = Date.now();
  console.log('[1] fetching sitemap cards.1.xml ...');
  const res = await fetch('https://shoob.gg/sitemap/cards.1.xml', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('sitemap HTTP ' + res.status);
  const xml = await res.text();
  const siteIds = [...xml.matchAll(/\/cards\/info\/([0-9a-f]{24})</g)].map(m => m[1]);
  const siteSet = new Set(siteIds);
  console.log(`    sitemap pages: ${xml.match(/<loc>/g).length}, unique mongoIds: ${siteSet.size}`);

  console.log('[2] loading live DB ...');
  const raw = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const cards = Array.isArray(raw.cards) ? raw.cards : Object.values(raw.cards);
  const dbReg = new Map(); // mongoId -> card
  const tierSeq = {};      // tier -> max seq
  let idFormats = {};
  for (const c of cards) {
    if (!c || !c.id) continue;
    if (String(c.id).startsWith('E-')) continue;
    idFormats[String(c.id).replace(/[0-9]+/g, '#')] = (idFormats[String(c.id).replace(/[0-9]+/g, '#')] || 0) + 1;
    const m = (String(c.detailUrl || '').match(/\/cards\/info\/([0-9a-f]{24})$/) || [])[1];
    if (m) dbReg.set(m, c);
    const im = String(c.id).match(/^(\d+)-(\d+)$/);
    if (im) {
      const t = im[1], n = parseInt(im[2], 10);
      if (!tierSeq[t] || n > tierSeq[t]) tierSeq[t] = n;
    }
  }
  console.log(`    regular cards in DB: ${dbReg.size} (total ${cards.length})`);
  console.log(`    id formats: ${JSON.stringify(idFormats)}`);
  console.log(`    per-tier max seq: ${JSON.stringify(tierSeq)}`);

  console.log('[3] diffing ...');
  const missing = [];
  for (const id of siteIds) if (!dbReg.has(id)) missing.push(id);
  // also: tombstones — DB regulars NOT on site
  const extra = [...dbReg.keys()].filter(id => !siteSet.has(id));
  console.log(`    MISSING from DB (on site, not in DB): ${missing.length}`);
  console.log(`    EXTRA in DB (in DB, not on site):     ${extra.length}`);

  fs.writeFileSync('/home/ubuntu/whatsapp-bot/scripts/shoob-miner/output/regular_missing_ids.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), missing, extra: extra.slice(0, 50) }, null, 2));
  console.log('    saved -> scripts/shoob-miner/output/regular_missing_ids.json');

  // sample 3 missing mongoIds for the detail-page test
  console.log('[4] probing 3 missing detail pages (SSR check) ...');
  for (const id of missing.slice(0, 3)) {
    const r = await fetch(`https://shoob.gg/cards/info/${id}`, { headers: { 'User-Agent': UA } });
    const html = await r.text();
    const og = (html.match(/property="og:description"\s+content="([\s\S]*?)"/) || html.match(/content="([\s\S]*?)"\s+property="og:description"/) || [])[1] || '';
    const tier = (html.match(/Tier\s+([1-6S])\b/) || html.match(/\bT([1-6S])\b/) || [])[1] || null;
    const img = (html.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] || '';
    console.log(`    ${id}: HTTP ${r.status} | og="${og.replace(/\n/g, ' | ').slice(0, 110)}" | tier=${tier} | img=${img.slice(0, 80)}`);
    await new Promise(r2 => setTimeout(r2, 400));
  }
  console.log(`DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
