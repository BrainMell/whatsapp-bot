'use strict';
/**
 * card_e2e.js — E2E for the 2026-10-08 event/series fixes.
 * Runs ON the box with the REAL cardSystem handler, REAL deployed code and
 * REAL cards_data.json; only the WhatsApp sock is mocked (captures sends).
 *
 * Covers the exact scenarios the owner reported:
 *   1. `.j einfo bulma`  -> Event column must say Summer/Easter, NOT "Dragon Ball"
 *   2. `.j einfo summer` -> event-name search must find the Summer cards ("all gone" fix)
 *   3. `.j info E-03201` -> CARD DETAIL caption: Series=Dragon Ball, Event=Summer,
 *                           Description="Bulma from Dragon Ball", Location present
 *   4. series search     -> `einfo dragon ball` matches via animeName
 *   5. spawn caption     -> universal CARD DETAIL block, NO location, claim footer kept
 *                           (rendered from the deployed file source, stub deps)
 */
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ok -', l); } else { fail++; console.log('  FAIL -', l); } };

(async () => {
  require('dotenv').config();
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) { console.error('FATAL: no mongo uri in env'); process.exit(1); }
  const mongoose = require('mongoose');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('[db] connected');

  const cardSystem = require('../core/rpg/cardSystem');
  const economy = require('../core/rpg/economy');

  const sent = [];
  const sock = {
    sendMessage: async (chat, msg) => { sent.push(msg); return { key: { id: 'mock' } }; },
    groupMetadata: async () => ({ id: 'g', subject: 'e2e', participants: [] }),
  };
  const OWNER = '1000000000000@s.whatsapp.net';
  await cardSystem.init(sock, [], [], OWNER);
  console.log('[init] cardSystem ready');

  const run = (txt) => cardSystem.handleCommand({
    lowerTxt: txt.toLowerCase(), txt,
    senderJid: OWNER, chatId: '120363000000000000@g.us', m: { key: { remoteJid: 'x', fromMe: false } },
    economy, isOwner: true, senderIsAdmin: false, isMod: false,
  });
  const findMsg = (re) => sent.find(s => (s.text && re.test(s.text)) || (s.caption && re.test(s.caption)));

  // ── 1. THE owner test: einfo bulma ──────────────────────────────────────
  sent.length = 0;
  await run('.j einfo bulma');
  await new Promise(r => setTimeout(r, 1500));
  {
    const msg = findMsg(/EVENT CARD SEARCH/);
    ok(!!msg, 'einfo bulma returns EVENT CARD SEARCH list');
    if (msg) {
      const t = msg.text || msg.caption;
      ok(/E-03201[\s\S]*?Event: _Summer_/.test(t), 'E-03201 Bulma shows Event: Summer (was: Dragon Ball)');
      ok(/Event: _Easter_/.test(t), 'E-02504 Bulma shows Event: Easter');
      ok(!/Event: _Dragon Ball/.test(t), 'no result labels Dragon Ball as an Event');
      console.log('--- einfo bulma (first 300) ---\n' + t.slice(0, 300));
    }
  }

  // ── 2. THE "all gone" test: search BY EVENT NAME ────────────────────────
  sent.length = 0;
  await run('.j einfo summer');
  await new Promise(r => setTimeout(r, 800));
  {
    const msg = findMsg(/EVENT CARD SEARCH/);
    ok(!!msg && /Found 635 event cards/.test(msg.text || msg.caption),
      'einfo summer finds all 635 Summer cards');
  }

  // ── 3. series-name search via einfo ─────────────────────────────────────
  sent.length = 0;
  await run('.j einfo dragon ball');
  await new Promise(r => setTimeout(r, 800));
  ok(!!findMsg(/EVENT CARD SEARCH/), 'einfo "dragon ball" (series search) returns results');

  // ── 4. full CARD DETAIL caption via info <id> ───────────────────────────
  sent.length = 0;
  await run('.j info E-03201');
  await new Promise(r => setTimeout(r, 28000)); // allow gif convert (10s) + axios fallback (12s)
  {
    const msg = sent.find(s => (s.caption && s.caption.includes('CARD DETAIL')) || (s.text && s.text.includes('CARD DETAIL')));
    ok(!!msg, 'info E-03201 renders a CARD DETAIL caption');
    if (msg) {
      const cap = msg.caption || msg.text;
      console.log('--- info E-03201 caption ---\n' + cap);
      ok(/Series:\* _Dragon Ball_/.test(cap), 'caption Series = Dragon Ball');
      ok(/Event:\* _Summer_/.test(cap), 'caption Event = Summer');
      ok(/Description:\* _Bulma from Dragon Ball_/.test(cap), 'caption Description = Bulma from Dragon Ball');
      ok(/Location:\* _[^_]+_/.test(cap), 'caption carries the Location line (db lookup)');
      ok(/TIER /.test(cap), 'caption carries the Tier line');
    }
  }

  // ── 5. spawn caption from deployed source (no location, claim footer) ───
  {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/../core/rpg/cardSystem.js', 'utf8');
    const m = src.match(/function buildSpawnCaption[\s\S]*?\n\}\n/);
    ok(!!m, 'buildSpawnCaption found in deployed source');
    if (m) {
      const ctx = {
        TIER_LABEL: { '1': 'TIER  I', '6': 'TIER  VI', 'S': 'TIER  S' },
        isEventCard: (c) => String(c.id).startsWith('E-'),
        P: () => '.j',
      };
      const buildSpawnCaption = new Function(...Object.keys(ctx), m[0] + '\nreturn buildSpawnCaption;')(...Object.values(ctx));
      const cap = buildSpawnCaption({
        id: 'E-03201', cardName: 'Bulma', animeName: 'Dragon Ball', eventName: 'Summer',
        tier: '6', creator: 'bl4z3_09', description: 'Bulma from Dragon Ball',
      }, 1, 100, 500);
      console.log('--- spawn caption ---\n' + cap);
      ok(cap.includes('CARD DETAIL'), 'spawn caption uses the universal CARD DETAIL header');
      ok(!cap.includes('Location'), 'spawn caption has NO location line (owner rule)');
      ok(cap.includes('*Series:* _Dragon Ball_') && cap.includes('*Event:* _Summer_'), 'spawn caption Series/Event correct');
      ok(cap.includes('*Description:* _Bulma from Dragon Ball_'), 'spawn caption description correct');
      ok(cap.includes('.j claim E-03201'), 'spawn caption keeps the claim footer');
    }
  }

  console.log(`\nE2E RESULT: ${pass} pass, ${fail} fail`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
