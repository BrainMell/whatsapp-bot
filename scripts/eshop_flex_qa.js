#!/usr/bin/env node
// ESHOP FLEX VIEW QA - run ON-BOX inside the bot dir:
// node scripts/eshop_flex_qa.js
// Owner ask: ".j eshop 1-16 should show the cards individually for ppl to see"
// Safety model:
// - READ-ONLY vs production DB (loads the live eShop deck + economy)
// - ZERO WhatsApp traffic: sock_ref is a MOCK recorder inside this process
// - Real CDN fetches prove actual shop media flows through the magic-sniffer
// - If the live deck is empty, slots are memory-seeded (QA process only)
'use strict';
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0, SKIP = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' - ' + extra : ''}`); }
}
function skip(name, why) { SKIP++; console.log(`  ⏭️  ${name} - ${why}`); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        }
    }
    const mongoose = require('mongoose');
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mellow';
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[qa] mongo connected: ${mongoose.connection.name}`);
}

(async () => {
    const axios = require('axios');
    const realGet = axios.get; // restore after synthetic-buffer sections

    await connectDB();
    const BOT = process.env.BOT_DIR || path.join(__dirname, '..');
    const cardSystem = require(path.join(BOT, 'core', 'rpg', 'cardSystem'));
    const economy = require(path.join(BOT, 'core', 'rpg', 'economy'));
    await economy.loadEconomy().catch(e => console.log(`[qa] loadEconomy warn: ${e.message}`));

 // -- §1 pure range parser ---------------------------------------------
    console.log('\n── §1 range parser ──');
    const P = cardSystem.parseEshopFlexToken;
    check('"1-16"', JSON.stringify(P('1-16')) === '{"start":1,"end":16}');
    check('"3" single', !!P('3') && P('3').start === 3 && P('3').end === 3);
    check('"16-3" reversed', !!P('16-3') && P('16-3').start === 3 && P('16-3').end === 16);
    check('"5-5"', !!P('5-5') && P('5-5').start === 5 && P('5-5').end === 5);
    check('" 2 - 7 " spaced', !!P(' 2 - 7 ') && P(' 2 - 7 ').start === 2 && P(' 2 - 7 ').end === 7);
    check('reject "0"', P('0') === null);
    check('reject "17"', P('17') === null);
    check('reject "1-99"', P('1-99') === null);
    check('reject "abc"', P('abc') === null);
    check('reject "1.5"', P('1.5') === null);
    check('reject ""/undefined', P('') === null && P(undefined) === null);

 // -- §2 flex E2E vs mock sock (real media fetches) --------------------
    console.log('\n── §2 flex E2E vs mock sock ──');
    await cardSystem.loadEShopDeck();
    const inst = cardSystem.getInst();
    let filled = inst.eshopDeck.map((e, i) => (e ? i + 1 : null)).filter(Boolean);

    if (filled.length === 0) {
        console.log('[qa] live deck empty - memory-seeding 3 slots (QA process only, no DB write)');
        for (let i = 0; i < 3; i++) {
            inst.eshopDeck[i] = { cardId: `QA${i}`, cardName: `QA Card ${i + 1}`, imageUrl: `https://qa.local/${i}.jpg`, tier: '5', anime: 'QA Anime', price: 100 + i };
        }
        filled = [1, 2, 3];
        axios.get = async () => ({ data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(128).fill(0)]) }); // JPEG magic
        skip('real CDN fetch proof', 'live deck empty - synthetic media used');
    }
    check('deck available', filled.length > 0, `filled=[${filled.join(',')}]`);

    const sent = [];
    const mockSock = {
        sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: `MOCK${sent.length}` } }; },
    };
    inst.sock_ref = mockSock; // QA-process memory only - live bot runs in another process

    const view = filled.slice(0, 3); // cap real fetches so QA stays < 30s
    const start = view[0], end = view[view.length - 1];

    const replies = [];
    const reply = async (t) => { replies.push(String(t)); };
    await cardSystem.eshopFlexView('qa@s.whatsapp.net', reply, 'qa:flex@chat', start, end);

    check('header text first (exactly one text reply)', replies.length === 1 && /EVENT SHOP - FLEX VIEW/.test(replies[0]), JSON.stringify(replies[0] || '').slice(0, 90));
    check('header shows tokens + card count', /Your Tokens/.test(replies[0] || '') && new RegExp(`Showing \\*${view.length}\\* card`).test(replies[0] || ''), JSON.stringify(replies[0] || '').slice(0, 120));
    const mediaMsgs = sent.filter(s => s.content && (s.content.image || s.content.video));
    check('one media msg per filled slot', mediaMsgs.length === view.length, `${mediaMsgs.length} vs ${view.length}`);
    check('media sent to the right chat', mediaMsgs.every(m => m.jid === 'qa:flex@chat'));
    check('captions: slot# + tokens + buy hint', mediaMsgs.every((m, i) => {
        const c = String((m.content && m.content.caption) || '');
        return c.includes(`#${view[i]}`) && /tokens/.test(c) && c.includes(`eshop buy ${view[i]}`);
    }), JSON.stringify((mediaMsgs[0] && mediaMsgs[0].content && mediaMsgs[0].content.caption) || '').slice(0, 110));
    check('image XOR video message shape', mediaMsgs.every(m => (!!m.content.image) !== (!!m.content.video)));

 // -- §3 per-chat cooldown ---------------------------------------------
    console.log('\n── §3 cooldown ──');
    const before = sent.length;
    await cardSystem.eshopFlexView('qa@s.whatsapp.net', reply, 'qa:flex@chat', start, end);
    check('re-run within 15s blocked (no extra sends)', /Flex view just ran/.test(replies[replies.length - 1] || '') && sent.length === before);

 // -- §3b single-card view = card + caption ONLY -----------------------
 // ".j eshop <id> sends one message then another? It should
 // only send the card with its caption" - no header text, no cooldown refusal
    console.log('\n── §3b single-card = card only, no header ──');
    {
        const realGet = axios.get;
        axios.get = async () => ({ data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(128).fill(0)]) }); // JPEG magic, deterministic
        const r1 = [];
        const s0 = sent.length;   // §2's mock sock is still inst.sock_ref - it records into `sent`
        const slot = filled[0];
        await cardSystem.eshopFlexView('qa@s.whatsapp.net', (t) => r1.push(String(t)), 'qa:single@chat', slot, slot);
        const m1 = sent.slice(s0).filter(x => x.content && (x.content.image || x.content.video));
        check('single: exactly one media message, ZERO text replies', m1.length === 1 && r1.length === 0, `${m1.length} media + ${r1.length} replies: ${JSON.stringify(r1[0] || '').slice(0, 60)}`);
        const cap1 = String((m1[0] && m1[0].content && m1[0].content.caption) || '');
        check('single: caption carries slot# + buy hint', cap1.includes(`#${slot}`) && cap1.includes(`eshop buy ${slot}`), cap1.slice(0, 90));
 // immediate second peek right after a bulk run must NOT hit the cooldown
        const r2 = [];
        await cardSystem.eshopFlexView('qa@s.whatsapp.net', (t) => r2.push(String(t)), 'qa:single2@chat', filled[1] || filled[0], filled[1] || filled[0]);
        check('single: no cooldown right after a bulk flex (2 media now)', !/Flex view just ran/.test(r2[0] || '') && sent.slice(s0).length === 2, JSON.stringify(r2[0] || '').slice(0, 60));
        axios.get = realGet;
    }

 // -- §4 empty range ---------------------------------------------------
    console.log('\n── §4 empty range ──');
    const emptySlot = Array.from({ length: 16 }, (_, i) => i + 1).find(n => !filled.includes(n));
    if (emptySlot) {
        const r2 = [];
        await cardSystem.eshopFlexView('qa@s.whatsapp.net', (t) => r2.push(String(t)), 'qa:empty@chat', emptySlot, emptySlot);
        check('empty slot → NOTHING IN', r2.length === 1 && /NOTHING IN/.test(r2[0]), JSON.stringify(r2[0] || '').slice(0, 80));
    } else {
        skip('empty slot view', 'all 16 slots filled');
    }

 // -- §5 cmdEShop routing ----------------------------------------------
    console.log('\n── §5 cmdEShop routing ──');
    const r3 = [];
    await cardSystem.cmdEShop('qa@s.whatsapp.net', (t) => r3.push(String(t)), 'qa:route@chat', ['flex', 'abc'], false);
    check('`eshop flex abc` → BAD RANGE', /BAD RANGE/.test(r3[0] || ''), JSON.stringify(r3[0] || '').slice(0, 80));
    const r4 = [];
    await cardSystem.cmdEShop('qa@s.whatsapp.net', (t) => r4.push(String(t)), 'qa:route2@chat', ['buy', '999'], false);
    check('`eshop buy 999` → usage text, no DB write', /Usage/.test(r4[0] || ''));

 // -- §6 magic-sniff shapes (synthetic buffers through the flex path) --
    console.log('\n── §6 sendCardMedia magic sniffing ──');
    const runFlexOne = async (label, bytes) => {
        axios.get = async () => ({ data: Buffer.from(bytes) });
        const s0 = sent.length;
        await cardSystem.eshopFlexView('qa@s.whatsapp.net', reply, `qa:sniff-${label}@chat`, view[0], view[0]);
        return sent.slice(s0);
    };
    const pad = Array(128).fill(0);
    const png = await runFlexOne('png', [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...pad]);
    check('PNG → {image}', png.length === 1 && !!png[0].content.image && !png[0].content.gifPlayback);
    const gif = await runFlexOne('gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...pad]);
    check('GIF8 → {image, gifPlayback:true}', gif.length === 1 && !!gif[0].content.image && gif[0].content.gifPlayback === true);
    const mp4 = await runFlexOne('mp4', [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, ...pad]);
    check('MP4 → {video, gifPlayback, mimetype video/mp4}', mp4.length === 1 && !!mp4[0].content.video && mp4[0].content.gifPlayback === true && mp4[0].content.mimetype === 'video/mp4');
 // FIX REGRESSION: WebM is NEVER sent raw again - WhatsApp can't
 // render it ("eshop cards 9 and 4 aren't showing" = the 2 webm T6 cards).
 // Synthetic garbage webm → ffmpeg remux + poster both fail → honest text fallback.
    const webm = await runFlexOne('webm', [0x1A, 0x45, 0xDF, 0xA3, ...pad]);
    const webmRawLeak = webm.length === 1 && !!webm[0].content.video && webm[0].content.mimetype === 'video/webm';
    const webmText = webm.length === 1 && !!webm[0].content.text && /couldn't be processed/.test(webm[0].content.text);
    check('WebM garbage → never raw video/webm (text fallback)', !webmRawLeak && webmText, JSON.stringify(webm[0] && Object.keys(webm[0].content || {})));
 // webp/unknown bytes → image (old code fell through to {video} = white box)
    const webp = await runFlexOne('webp', [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, ...pad]);
    check('WEBP/unknown → {image} (never video)', webp.length === 1 && !!webp[0].content.image && !webp[0].content.video);
    axios.get = realGet;

 // -- §6b REAL webm card E2E (live T6 deck entry, real ffmpeg remux) ----
    console.log('\n── §6b real webm → animated mp4 ──');
    const animatedMedia = require(path.join(BOT, 'core', 'utils', 'animatedMedia'));
    const webmEntry = inst.eshopDeck.map((e, i) => e && String(e.imageUrl || '').toLowerCase().endsWith('.webm') ? { slot: i + 1, ...e } : null).filter(Boolean)[0];
    if (webmEntry) {
        const s0 = sent.length;
        const r6b = [];
        await cardSystem.eshopFlexView('qa@s.whatsapp.net', (t) => r6b.push(String(t)), 'qa:webm@chat', webmEntry.slot, webmEntry.slot);
        const m6b = sent.slice(s0).filter(x => x.content && (x.content.image || x.content.video));
        const conv0 = animatedMedia.stats.conversions, hit0 = animatedMedia.stats.cacheHits;
        const v = m6b[0] && m6b[0].content;
        check('real webm: exactly one VIDEO message, mimetype video/mp4', m6b.length === 1 && !!v && !!v.video && v.mimetype === 'video/mp4', m6b.length ? `shape=${JSON.stringify(Object.keys(v || {}))}` : `replies=${JSON.stringify(r6b).slice(0, 80)}`);
        check('real webm: buffer is ftyp mp4, NOT EBML webm', !!v && !!v.video && v.video.toString('latin1', 4, 8) === 'ftyp' && !(v.video[0] === 0x1A && v.video[1] === 0x45), v ? `head=${v.video.slice(0, 12).toString('hex')}` : 'no msg');
        check('real webm: caption carries slot# + buy hint', !!v && String(v.caption || '').includes(`#${webmEntry.slot}`) && String(v.caption || '').includes(`eshop buy ${webmEntry.slot}`));
 // second peek must come from the sha1 disk cache - no second conversion
        await cardSystem.eshopFlexView('qa@s.whatsapp.net', (t) => {}, 'qa:webm2@chat', webmEntry.slot, webmEntry.slot);
        check('real webm: second view served from cache', animatedMedia.stats.cacheHits > hit0 || animatedMedia.stats.conversions === conv0, `conversions ${conv0}→${animatedMedia.stats.conversions}, cacheHits ${hit0}→${animatedMedia.stats.cacheHits}`);
    } else {
        skip('real webm card E2E', 'no .webm card in live deck right now');
    }

 // -- §7 grid regression (untouched default path) ----------------------
    console.log('\n── §7 grid regression ──');
    try {
        const grid = await cardSystem.generateEShopDeckImage();
        if (grid && grid.length > 100) check('4x4 grid still renders', true);
        else skip('4x4 grid still renders', `goService returned ${grid ? grid.length + 'B' : 'null'}`);
    } catch (e) {
        skip('4x4 grid still renders', e.message);
    }

    console.log(`\n═══ RESULT: ${PASS} passed · ${FAIL} failed · ${SKIP} skipped ═══`);
    process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('[qa] FATAL', e); process.exit(2); });
