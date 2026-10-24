'use strict';
/**
 * qa_gs_mcount.js — QA for the 2026-10-24 global-pool card search pair.
 * Runs ON the box with the REAL cardSystem handler, REAL deployed code and
 * REAL cards_data.json; only the WhatsApp sock is mocked (captures sends).
 *
 * Mellow brief: "Add a command that shows how many cards a maker has made,
 * and a way to search my anime, character name, tier and what not across all
 * the cards not just the one you own"
 *
 * Covers:
 *   .mcount  → usage / stats block / ambiguous-maker list / no-results
 *   .gs      → usage / text search / tier filter / maker filter / quoted
 *              multi-word anime / name= filter / combined filters / bad tier /
 *              unknown filter / pagination / token-AND resilience / no-results
 */
let pass = 0, fail = 0, skip = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ok -', l); } else { fail++; console.log('  FAIL -', l); } };
const sk = (l) => { skip++; console.log('  SKIP -', l); };

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
  const BOT_ID = botConfig.getBotId();
  const CHAT_ID = '120363000000000000@g.us';
  const OWNER = '1000000000000@s.whatsapp.net';

  const sent = [];
  const sock = {
    sendMessage: async (chat, msg) => { sent.push(msg); return { key: { id: 'mock' } }; },
    groupMetadata: async () => ({ id: 'g', subject: 'qa', participants: [] }),
  };
  await cardSystem.init(sock, [], [], OWNER);
  console.log('[init] cardSystem ready (botId=' + BOT_ID + ')');

  const inst = cardSystem.instances.get(BOT_ID);
  const ALL = inst.ALL_CARDS;
  console.log('[index] ' + ALL.length + ' cards loaded');
  ok(ALL.length > 100, 'card index loaded (' + ALL.length + ' cards)');

  const run = (txt) => cardSystem.handleCommand({
    lowerTxt: txt.toLowerCase(), txt,
    senderJid: OWNER, chatId: CHAT_ID, m: { key: { remoteJid: 'x', fromMe: false } },
    economy, isOwner: true, senderIsAdmin: false, isMod: false,
  });
  const lastText = (re) => {
    for (let i = sent.length - 1; i >= 0; i--) {
      const t = sent[i].text || sent[i].caption || '';
      if (re.test(t)) return t;
    }
    return null;
  };

  // ── discover dataset facts for assertions ────────────────────────────────
  const creators = {};
  ALL.forEach((c) => {
    const mk = String(c.creator || '').trim();
    if (mk && mk.toLowerCase() !== 'unknown') {
      const k = mk.toLowerCase();
      if (!creators[k]) creators[k] = { display: mk, n: 0 };
      creators[k].n++;
    }
  });
  const creatorList = Object.values(creators).sort((a, b) => b.n - a.n);
  const topMaker = creatorList[0];
  console.log('[data] top maker:', topMaker && topMaker.display, topMaker && topMaker.n);

  // ambiguous prefix: shortest 4-char prefix shared by >=2 distinct creators
  let ambPrefix = null;
  outer:
  for (const a of creatorList) {
    for (const b of creatorList) {
      if (a.display === b.display) continue;
      for (let L = 4; L <= Math.min(8, a.display.length, b.display.length); L++) {
        const pa = a.display.slice(0, L).toLowerCase();
        if (pa === b.display.slice(0, L).toLowerCase() && pa.length >= 4) { ambPrefix = pa; break outer; }
      }
    }
  }
  console.log('[data] ambiguous prefix:', ambPrefix);

  const multiWordAnime = [...new Set(ALL.map(c => String(c.animeName || '').trim()))]
    .find(a => a.split(/\s+/).length >= 2 && a.length > 5);
  console.log('[data] multi-word anime:', multiWordAnime);

  const namedCard = ALL.find(c => String(c.cardName || '').trim().split(/\s+/).length >= 3
    && String(c.animeName || '').length > 2);
  console.log('[data] 3-word-name card:', namedCard && namedCard.cardName, '/', namedCard && namedCard.animeName);

  // ═══════════════════════════ .mcount ═══════════════════════════
  console.log('\n== mcount ==');

  sent.length = 0;
  const r1 = await run('.j mcount');
  ok(!!lastText(/USAGE/), 'mcount no-args shows USAGE');
  ok(!!r1, 'mcount claims the command');

  sent.length = 0;
  await run('.j mcount ' + topMaker.display);
  {
    const t = lastText(/MAKER STATS/);
    ok(!!t, 'mcount <maker> renders MAKER STATS');
    if (t) {
      ok(t.includes(topMaker.display), 'stats echo exact maker tag (' + topMaker.display + ')');
      ok(new RegExp('Total cards:\\* \\*' + topMaker.n + '\\*').test(t), 'total equals dataset count (' + topMaker.n + ')');
      ok(/Series covered:/.test(t), 'series coverage line present');
      ok(/Browse their work/.test(t) && /gs maker=/.test(t), 'cross-link to .gs maker= present');
      ok(/Your copies/.test(t), 'cross-link to .maker present');
      console.log('--- mcount sample ---\n' + t.slice(0, 400));
    }
  }

  if (ambPrefix) {
    sent.length = 0;
    await run('.j mcount ' + ambPrefix);
    const t = lastText(/MAKERS matching/);
    ok(!!t, 'mcount ambiguous prefix lists MAKERS matching');
    if (t) ok(/Refine:/.test(t), 'ambiguity list suggests refine');
  } else sk('no ambiguous maker prefix in dataset');

  sent.length = 0;
  await run('.j mcount zzqq__nobody__99');
  ok(!!lastText(/NO RESULTS/), 'mcount unknown maker → NO RESULTS');

  // ═══════════════════════════ .gs ═══════════════════════════
  console.log('\n== gs ==');

  sent.length = 0;
  const r5 = await run('.j gs');
  ok(!!lastText(/USAGE/), 'gs no-args shows USAGE');
  ok(!!r5, 'gs claims the command');

  // text-only search on a real card name token
  const nameTok = String(ALL[0].cardName).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .split(' ').find(w => w.length >= 4) || 'goku';
  sent.length = 0;
  await run('.j gs ' + nameTok);
  {
    const t = lastText(/GLOBAL CARD SEARCH/);
    ok(!!t, 'gs text search renders GLOBAL CARD SEARCH');
    if (t) {
      ok(new RegExp('matches').test(t), 'match count line present');
      ok(new RegExp('🎨 _.*_ · 🆔', 'i').test(t), 'result lines carry maker + ID');
      ok(t.toLowerCase().includes(nameTok), 'results reference the searched token');
      console.log('--- gs "' + nameTok + '" (first 350) ---\n' + t.slice(0, 350));
    }
  }

  // tier filter — every rendered line must be that tier
  sent.length = 0;
  await run('.j gs ' + nameTok + ' tier=5');
  {
    const t = lastText(/GLOBAL CARD SEARCH/);
    ok(!!t, 'gs tier=5 returns a result block');
    if (t) {
      ok(/🎯 tier: _5_/.test(t), 'tier chip echoed');
      const lines = t.split('\n').filter(l => /→|➥/.test(l) === false && / \(T\d+| \(TS\)/.test(l));
      ok(lines.length > 0 && lines.every(l => /\(T5\)/.test(l)), 'every result line is (T5)');
    }
  }

  // maker filter — every ➥ line must show that maker
  sent.length = 0;
  await run('.j gs maker=' + topMaker.display);
  {
    const t = lastText(/GLOBAL CARD SEARCH/);
    ok(!!t, 'gs maker=<top> returns results');
    if (t) {
      ok(/🎨 maker:/.test(t), 'maker chip echoed');
      const makerLines = t.split('\n').filter(l => l.includes('🎨 _'));
      ok(makerLines.length > 0 && makerLines.every(l => l.toLowerCase().includes(topMaker.display.toLowerCase())),
        'all ➥ lines carry the requested maker');
    }
  }

  // quoted multi-word anime
  if (multiWordAnime) {
    sent.length = 0;
    await run('.j gs anime="' + multiWordAnime + '"');
    const t = lastText(/GLOBAL CARD SEARCH/);
    ok(!!t, 'gs anime="<multi word>" (quoted) returns results');
    if (t) ok(/📚 anime:/.test(t), 'anime chip echoed');
  } else sk('no multi-word anime in dataset');

  // name= restricts to character name
  if (namedCard) {
    const w = namedCard.cardName.trim().split(/\s+/)[0];
    sent.length = 0;
    await run('.j gs name=' + w);
    const t = lastText(/GLOBAL CARD SEARCH/);
    ok(!!t, 'gs name=<first word> returns results');
    if (t) {
      ok(/👤 name:/.test(t), 'name chip echoed');
      const res = t.split('\n').filter(l => l.startsWith('👑') || l.startsWith('💎') || l.startsWith('✨') || l.startsWith('🎗') || l.startsWith('🔮') || l.startsWith('🌈') || l.startsWith('🎴') || l.startsWith('🎁'));
      ok(res.length > 0, 'gs name= lists character cards');
    }
  }

  // combined: text + tier + maker must ALL hold
  const comboCard = ALL.find(c => String(c.creator || '').trim().toLowerCase() === topMaker.display.toLowerCase());
  if (comboCard) {
    const tk = String(comboCard.cardName).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      .split(' ').filter(w => w.length >= 3)[0];
    sent.length = 0;
    await run('.j gs ' + tk + ' tier=' + comboCard.tier + ' maker=' + topMaker.display);
    {
      const t = lastText(/GLOBAL CARD SEARCH/);
      ok(!!t, 'combined text+tier+maker returns results');
      if (t) {
        const res = t.split('\n').filter(l => / (T.*\))$/.test(l.trim()) || / \(T/.test(l));
        ok(res.every(l => new RegExp('\\(T' + comboCard.tier + '\\)').test(l)), 'combined results all in requested tier');
      }
    }
  }

  // pagination on the broadest query we can build
  sent.length = 0;
  await run('.j gs tier=1');
  const p1 = lastText(/GLOBAL CARD SEARCH/);
  if (p1 && /Page: 1 \/ (\d+)/.test(p1) && parseInt(p1.match(/Page: 1 \/ (\d+)/)[1]) > 1) {
    sent.length = 0;
    await run('.j gs tier=1 --page 2');
    const p2 = lastText(/GLOBAL CARD SEARCH/);
    ok(!!p2 && /Page: 2 \//.test(p2), 'gs --page 2 advances pagination');
    ok(!!p2 && /--page 1/.test(p2), 'page-2 footer offers way back');
  } else sk('tier=1 fits on one page — pagination path untested here');

  // guardrails
  sent.length = 0;
  await run('.j gs naruto tier=9');
  ok(!!lastText(/Invalid tier/), 'gs tier=9 rejected');

  sent.length = 0;
  await run('.j gs naruto color=red');
  ok(!!lastText(/Unknown filter/), 'gs color= rejected with hint');

  sent.length = 0;
  await run('.j gs zzqq__nobody__99');
  ok(!!lastText(/NO RESULTS/), 'gs garbage text → NO RESULTS');

  // token-AND resilience (owner brief §1): drop the middle word of a
  // 3-word character name — must still hit the same card
  if (namedCard) {
    const words = namedCard.cardName.trim().split(/\s+/);
    const reduced = [words[0], words[words.length - 1]].join(' ');
    sent.length = 0;
    await run('.j gs ' + reduced);
    const t = lastText(/GLOBAL CARD SEARCH/);
    ok(!!t && t.toLowerCase().includes(namedCard.cardName.toLowerCase()),
      'partial name "' + reduced + '" still finds "' + namedCard.cardName + '"');
  }

  console.log('\n==============================');
  console.log('PASS ' + pass + ' / FAIL ' + fail + (skip ? ' / SKIP ' + skip : ''));
  console.log('==============================');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
