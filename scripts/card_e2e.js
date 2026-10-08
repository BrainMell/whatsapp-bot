'use strict';
/**
 * card_e2e.js — E2E for the card system fixes.
 * Runs ON the box with the REAL cardSystem handler, REAL deployed code and
 * REAL cards_data.json; only the WhatsApp sock is mocked (captures sends).
 *
 * 2026-10-08 round 1 (event/series separation):
 *   1. `.j einfo bulma`  -> Event column says Summer/Easter, NOT "Dragon Ball"
 *   2. `.j einfo summer` -> event-name search finds the Summer cards
 *   3. series search     -> `einfo dragon ball` matches via animeName
 *   4. `.j info E-03201` -> CARD DETAIL caption: Series/Event/Description/Location
 *
 * 2026-10-08 round 2 (owner bug report):
 *   5. spawn caption     -> "CARD APPEARED" header, no location, claim footer
 *   6. sendCardMedia     -> magic-byte sniffing picks the right WA shape
 *   7. restart-safe spawn-> CardSpawn doc restored on init, claim works
 *                           (lazy stat), doc dropped after claim
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
  const botConfig = require('../botConfig');
  const CardSpawn = require('../core/models/CardSpawn');
  const BOT_ID = botConfig.getBotId();
  const CHAT_ID = '120363000000000000@g.us';
  const OWNER = '1000000000000@s.whatsapp.net';

  const sent = [];
  const sock = {
    sendMessage: async (chat, msg) => { sent.push(msg); return { key: { id: 'mock' } }; },
    groupMetadata: async () => ({ id: 'g', subject: 'e2e', participants: [] }),
  };
  await cardSystem.init(sock, [], [], OWNER);
  console.log('[init] cardSystem ready (botId=' + BOT_ID + ')');

  const inst = cardSystem.instances.get(BOT_ID);
  const run = (txt) => cardSystem.handleCommand({
    lowerTxt: txt.toLowerCase(), txt,
    senderJid: OWNER, chatId: CHAT_ID, m: { key: { remoteJid: 'x', fromMe: false } },
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

  // ── 2. event search by event name ───────────────────────────────────────
  sent.length = 0;
  await run('.j einfo summer');
  await new Promise(r => setTimeout(r, 1500));
  {
    const msg = findMsg(/EVENT CARD SEARCH/);
    ok(!!msg, 'einfo summer returns results ("all gone" fix)');
    if (msg) {
      const t = msg.text || msg.caption;
      ok(/Summer/.test(t), 'results mention Summer');
    }
  }

  // ── 3. series search via einfo ──────────────────────────────────────────
  sent.length = 0;
  await run('.j einfo dragon ball');
  await new Promise(r => setTimeout(r, 1500));
  {
    const msg = findMsg(/EVENT CARD SEARCH/);
    ok(!!msg, 'einfo "dragon ball" (series) returns results');
  }

  // ── 4. full CARD DETAIL caption via info <id> (media pre-warmed) ───────
  // 💡 round 2: convertCardImage now caches on disk - pre-warm so the
  // caption arrives instantly regardless of asset size.
  {
    const eCard = inst.CARD_INDEX['E-03201'];
    ok(!!eCard, 'E-03201 exists in CARD_INDEX');
    if (eCard) {
      const goService = require('../core/utils/goImageService');
      const t0 = Date.now();
      const buf = await goService.convertCardImage(eCard.imageUrl);
      console.log(`  [prewarm] convert ${eCard.id}: ${buf ? buf.length + 'B' : 'NULL'} in ${Date.now() - t0}ms`);
      ok(!!buf && buf.length > 1024, 'convertCardImage returns an MP4 buffer (cache+timeout fix)');
      if (buf) {
        const t1 = Date.now();
        const buf2 = await goService.convertCardImage(eCard.imageUrl);
        console.log(`  [prewarm] 2nd call (cache): ${buf2.length}B in ${Date.now() - t1}ms`);
        ok(Date.now() - t1 < 1500, '2nd convert call served from disk cache (<1.5s)');
      }
    }
  }
  sent.length = 0;
  await run('.j info E-03201');
  await new Promise(r => setTimeout(r, 8000));
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

  // ── 5. spawn caption from deployed source (CARD APPEARED, no location) ──
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
      ok(cap.includes('CARD APPEARED'), 'spawn caption says CARD APPEARED (owner rule 2026-10-08)');
      ok(!cap.includes('CARD DETAIL'), 'spawn caption no longer says CARD DETAIL');
      ok(!cap.includes('Location'), 'spawn caption has NO location line (owner rule)');
      ok(cap.includes('*Series:* _Dragon Ball_') && cap.includes('*Event:* _Summer_'), 'spawn caption Series/Event correct');
      ok(cap.includes('*Description:* _Bulma from Dragon Ball_'), 'spawn caption description correct');
      ok(cap.includes('.j claim E-03201'), 'spawn caption keeps the claim footer');
    }
  }

  // ── 6. sendCardMedia magic-byte sniffing (deployed source) ──────────────
  {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/../core/rpg/cardSystem.js', 'utf8');
    const m = src.match(/async function sendCardMedia[\s\S]*?\n\}\n/);
    ok(!!m, 'sendCardMedia found in deployed source');
    if (m) {
      const sendCardMedia = new Function('sock', 'chatId', 'buffer', 'caption', 'mentions', m[0] + '\nreturn sendCardMedia(sock, chatId, buffer, caption, mentions);');
      const shapes = [];
      const mockSock = { sendMessage: async (chat, msg) => { shapes.push(msg); return { key: { id: 'x' } }; } };
      const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
      const jpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF8
      const webm = Buffer.from([0x1A, 0x45, 0xDF, 0xA3]);
      const mp4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // ftyp
      await sendCardMedia(mockSock, 'c', png, 'cap');
      await sendCardMedia(mockSock, 'c', jpg, 'cap');
      await sendCardMedia(mockSock, 'c', gif, 'cap');
      await sendCardMedia(mockSock, 'c', webm, 'cap');
      await sendCardMedia(mockSock, 'c', mp4, 'cap');
      ok(shapes[0].image && !shapes[0].gifPlayback, 'PNG -> { image }');
      ok(shapes[1].image && !shapes[1].gifPlayback, 'JPEG -> { image }');
      ok(shapes[2].image && shapes[2].gifPlayback === true, 'GIF -> { image, gifPlayback: true } (animates)');
      ok(shapes[3].video && shapes[3].gifPlayback === true && shapes[3].mimetype === 'video/webm', 'WebM -> { video, gifPlayback, mimetype }');
      ok(shapes[4].video && shapes[4].gifPlayback === true && !shapes[4].mimetype, 'MP4 -> { video, gifPlayback }');
    }
  }

  // ── 7. restart-safe spawn: persist -> restore -> claim -> doc dropped ───
  {
    const KEY = `${CHAT_ID}_E-03201`;
    // clean slate
    await CardSpawn.deleteMany({ botId: BOT_ID });
    await cardSystem.init(sock, [], [], OWNER); // simulates a restart
    const inst2 = cardSystem.instances.get(BOT_ID);

    await CardSpawn.findOneAndUpdate(
      { key: KEY },
      {
        key: KEY, botId: BOT_ID, groupJid: CHAT_ID,
        cardId: 'E-03201', copyNumber: 7, maxCopies: 100, price: 500,
        hasToken: false, spawnedAt: new Date(), expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      { upsert: true },
    );

    await cardSystem.init(sock, [], [], OWNER); // restore pass
    const restored = inst2.activeSpawns.get(KEY);
    ok(!!restored, 'spawn restored into activeSpawns after init (restart-safe)');
    ok(restored && restored.card && restored.card.cardName === 'Bulma', 'restored spawn carries the full card object');
    ok(restored && restored.stat === null, 'restored spawn has stat=null (lazy resolve)');

    sent.length = 0;
    await run('.j claim E-03201');
    await new Promise(r => setTimeout(r, 4000));
    {
      const msg = findMsg(/CLAIMED!/);
      ok(!!msg, 'claim of a RESTORED spawn succeeds (lazy stat resolution works)');
      const uc = await cardSystem.UserCard.findOne({ userId: OWNER, cardId: 'E-03201' }).lean();
      ok(!!uc, 'UserCard created for the claimer');
      const doc = await CardSpawn.findOne({ key: KEY }).lean();
      ok(!doc, 'CardSpawn doc dropped after successful claim');
      // cleanup test rows + restore counters
      await cardSystem.UserCard.deleteOne({ userId: OWNER, cardId: 'E-03201' });
      await cardSystem.CardStat.updateOne({ cardId: 'E-03201' }, { $inc: { totalCirculation: -1, uniqueOwners: -1 } }).catch(() => {});
      console.log('  [cleanup] test claim rows removed, counters restored');
    }
    // expire path: doc with past expiry must NOT be restored
    await CardSpawn.findOneAndUpdate(
      { key: KEY },
      { key: KEY, botId: BOT_ID, groupJid: CHAT_ID, cardId: 'E-03201', copyNumber: 7, maxCopies: 100, price: 500, spawnedAt: new Date(), expiresAt: new Date(Date.now() - 60000) },
      { upsert: true },
    );
    await cardSystem.init(sock, [], [], OWNER);
    const notRestored = inst2.activeSpawns.get(KEY);
    ok(!notRestored, 'expired spawn is NOT restored after init');
    const gone = await CardSpawn.findOne({ key: KEY }).lean();
    ok(!gone, 'expired spawn doc cleaned up on boot');
    await CardSpawn.deleteMany({ botId: BOT_ID });
  }

  console.log(`\nE2E RESULT: ${pass} pass, ${fail} fail`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
