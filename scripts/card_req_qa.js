#!/usr/bin/env node
// 🃏 CARD REQUIREMENTS QA (2026-10-08 doc) — run on a box inside the bot dir.
// Verifies every section of card_system_changes_requirements.md:
//   §1/§11 global token reset (card-mod, two-step, memory+DB consistent)
//   §2     token spawn rate 1/10 PER GROUP (isolated progression)
//   §3     hidden command tokens 1/15 eligible cmds (claim excluded)
//   §4     claim message tells "got token" WITHOUT mechanic leak
//   §5     event token leaderboard
//   §6     default spawn interval 30min = 2 cards/hour
//   §8     auction smoke (start → bid → end → settle transfers)
//   §9     spin event absent (static grep assertion lives in deploy notes)
//   §10    .j info / .j ci / .j rc card-mod exclusive
//   §12    super RC collection wipe (cards + decks + market cleanup)
//   §13    maintenance commands permission-gated
//   §14    per-group isolation
// Runs against the THROWAWAY "cardqa" DB - never touches production data.
'use strict';
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        }
    }
    const uri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mellow').replace(/\/[^/?]+(\?|$)/, '/cardqa$1');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[qa] connected to TEST db: ${mongoose.connection.name}`);
}

(async () => {
    await connectDB();
    const mongoose = require('mongoose');

    // ── patch axios BEFORE any spawn: fake image bytes, zero network ──
    const axios = require('axios');
    axios.get = async () => ({ data: Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) });

    const User = require('../core/models/User');
    const CardStat = require('../core/models/CardStat');
    const UserCard = require('../core/models/UserCard');
    const CardDeck = require('../core/models/CardDeck');
    const CardMarket = require('../core/models/CardMarket');
    const CardSpawn = require('../core/models/CardSpawn');
    const System = require('../core/models/System');

    // wipe throwaway collections (CardSpawn too - stale spawns from an
    // earlier run would pollute the per-group token counts)
    for (const M of [User, CardStat, UserCard, CardDeck, CardMarket, CardSpawn, System]) await M.deleteMany({}).catch(() => {});

    const economy = require('../core/rpg/economy');
    await economy.loadEconomy();

    const J = (n) => `${n}@s.whatsapp.net`;
    const owner = J('1000000000001'), mod = J('1000000000002'), player = J('1000000000003');
    const other1 = J('1000000000004'), other2 = J('1000000000005'), victim = J('1000000000006');
    const buyer = J('1000000000007'), seller = J('1000000000008');
    for (const [j, n] of [[owner, 'QAOwner'], [mod, 'QAMod'], [player, 'QAPlayer'], [other1, 'QAOther1'], [other2, 'QAOther2'], [victim, 'QAVictim'], [buyer, 'QABuyer'], [seller, 'QASeller']]) {
        economy.registerUser(j, n);
    }
    // flush registration saves so User docs exist for reset assertions
    await economy.saveUser(owner).catch(() => {});
    for (const j of [mod, player, other1, other2, victim, buyer, seller]) await economy.saveUser(j).catch(() => {});

    const cardSystem = require('../core/rpg/cardSystem');

    const sent = [];
    const sock = { sendMessage: async (chatId, content) => { sent.push({ chatId, content }); return {}; } };
    await cardSystem.init(sock, [], [mod], owner);

    const inst = cardSystem.instances.get('global');
    const P = '.j';
    // run-unique group ids so restored spawns from other runs can never leak in
    const ts = Date.now() % 100000000;
    const chatA = `${ts}1@g.us`, chatB = `${ts}2@g.us`;

    async function run(txt, sender, chat = chatA, extra = {}) {
        sent.length = 0;
        const lower = txt.toLowerCase();
        const res = await cardSystem.handleCommand({
            lowerTxt: lower, txt, senderJid: sender, chatId: chat,
            m: extra.m || { message: {} }, economy,
            isOwner: extra.isOwner || sender === owner,
            senderIsAdmin: false, isMod: extra.isMod || false,
        });
        await sleep(60); // let fire-and-forget token ticks + sends settle
        return { res, texts: sent.map(s => (s.content && s.content.text) || (s.content && s.content.caption) || '') };
    }

    const allCards = inst.ALL_CARDS;
    console.log(`[qa] cards loaded: ${allCards.length}`);
    const plainCards = allCards.filter(c => c.id && !c.id.startsWith('E-') && ['1', '2'].includes(String(c.tier)));
    check('28+ distinct plain cards available', plainCards.length >= 28, `got ${plainCards.length}`);

    // ═══ §6 — default spawn interval = 30 min = 2 cards/hour ═══
    console.log('\n== §6 spawn interval default ==');
    {
        const info = cardSystem.getSpawnIntervalInfo();
        check('default interval 30 min', info.minMinutes === 30 && info.maxMinutes === 30, `${info.minMinutes}-${info.maxMinutes}`);
        check('default rate 2 spawns/hour', info.spawnsPerHour === 2, `${info.spawnsPerHour}`);
    }

    // ═══ §10/§13 — permission gates ═══
    console.log('\n== §10/§13 permission gates ==');
    {
        let r = await run(`${P} info winry`, player);
        check('§10 .j info denied for regular user', r.texts.some(t => /card moderators/i.test(t)), JSON.stringify(r.texts[0] || ''));
        r = await run(`${P} ci "winry" | 1`, player);
        check('.j ci denied for regular user', r.texts.some(t => /moderators/i.test(t)));
        r = await run(`${P} spawn winry`, player);
        check('.j spawn denied for regular user', r.texts.some(t => /permission/i.test(t)));
        r = await run(`${P} spawninfo`, player);
        check('§13 .j spawninfo denied for regular user (rate hiding)', r.texts.some(t => /moderators/i.test(t)));
        r = await run(`${P} spawninfo`, mod);
        check('.j spawninfo shows per-group 1-in-10 for mods', r.texts.some(t => /1 per 10 spawns, per group/.test(t)), JSON.stringify(r.texts[0] || ''));
        r = await run(`${P} info ${plainCards[0].id}`, mod);
        check('§10 .j info works for mod', r.texts.some(t => t.length > 20), JSON.stringify((r.texts[0] || '').slice(0, 60)));
    }

    // ═══ §2/§14 — per-group 1/10 token spawns + isolation ═══
    console.log('\n== §2/§14 per-group token spawn rate ==');
    {
        let r = await run(`${P} event start`, player);
        check('event start denied for regular user', r.texts.some(t => /Only Card Mods/i.test(t)));
        r = await run(`${P} event start`, mod);
        check('§3 setup: event started by mod', r.texts.some(t => /TOKEN EVENT STARTED/i.test(t)), JSON.stringify(r.texts[0] || ''));

        // spawn 20 cards strictly interleaved A,B,A,B... → exactly 10 per group
        const order = [];
        for (let i = 0; i < 20; i++) {
            const g = (i % 2 === 0) ? chatA : chatB;
            const card = plainCards[i];
            const out = await cardSystem.doSpawn(card.id, null, true, g);
            if (out) order.push({ g, id: card.id });
        }
        check('20 spawns landed (10 per group)', order.length === 20 && order.filter(o => o.g === chatA).length === 10 && order.filter(o => o.g === chatB).length === 10, JSON.stringify(order.length));

        const byGroup = { [chatA]: [], [chatB]: [] };
        for (const [key, sp] of inst.activeSpawns) {
            if (byGroup[sp.groupJid]) byGroup[sp.groupJid].push(sp);
        }
        check('group A: exactly 1 token-bearing in 10', byGroup[chatA].filter(s => s.hasToken).length === 1, `${byGroup[chatA].filter(s => s.hasToken).length}`);
        check('group B: exactly 1 token-bearing in 10', byGroup[chatB].filter(s => s.hasToken).length === 1, `${byGroup[chatB].filter(s => s.hasToken).length}`);
        // token-bearing spawn must be the 10th spawned IN THAT GROUP (independence proof)
        const tenthA = order.filter(o => o.g === chatA)[9];
        check('group A token = 10th spawn of group A (isolated counter)', byGroup[chatA].find(s => s.hasToken && s.card.id === tenthA.id) !== undefined);
        const bOrder = order.filter(o => o.g === chatB);
        check('group B token = 10th spawn of group B', byGroup[chatB].find(s => s.hasToken && s.card.id === bOrder[9].id) !== undefined);

        // §4 — claim the token-bearing spawn: message must be mechanic-free
        console.log('\n== §4 claim message ==');
        const tokenSpawnA = byGroup[chatA].find(s => s.hasToken);
        r = await run(`${P} claim ${tokenSpawnA.card.id}`, player, chatA);
        check('claim succeeded', r.texts.some(t => /CLAIMED/i.test(t)), JSON.stringify(r.texts[0] || 'no reply'));
        const tokenText = r.texts.find(t => /Event Token/i.test(t)) || '';
        check('§4 claim tells player they got a token', /Event Token/.test(tokenText) && /Total/.test(tokenText), JSON.stringify(tokenText));
        check('§4 NO mechanic leak (rate/probability/labels)', !/GUARANTEED|token-bearing|25%|every 3rd|1 token per|RNG/i.test(tokenText), JSON.stringify(tokenText));
        check('§4 balance reflected', economy.getTokens(player) === 1, `${economy.getTokens(player)}`);

        // non-token-bearing claim → NO token message (RNG layer removed)
        const plainSpawnA = byGroup[chatA].find(s => !s.hasToken);
        r = await run(`${P} claim ${plainSpawnA.card.id}`, other1, chatA);
        check('non-token claim grants NOTHING (no RNG layer)', !r.texts.some(t => /Event Token/i.test(t)), JSON.stringify(r.texts.join(' | ')));
        check('non-token claim still claims the card', r.texts.some(t => /CLAIMED/i.test(t)));

        // 5 more spawns in A (event active) → counter 5, no new token yet
        for (let i = 20; i < 25; i++) await cardSystem.doSpawn(plainCards[i].id, null, true, chatA);
        await sleep(400); // fire-and-forget counter persist needs a beat to land
        let persisted = await System.findOne({ key: 'card_token_spawn_counters_v1' }).lean();
        const keyA = Object.keys(persisted?.value || {}).find(k => k.startsWith(String(ts)));
        check('per-group counter persisted (A=5)', persisted?.value && persisted.value[keyA] === 5, JSON.stringify(persisted?.value));

        // stop event → spawns never advance counters while inactive
        r = await run(`${P} event stop`, mod);
        check('event stopped', r.texts.some(t => /Token event stopped/i.test(t)));
        for (let i = 25; i < 28; i++) await cardSystem.doSpawn(plainCards[i].id, null, true, chatA);
        await sleep(400);
        persisted = await System.findOne({ key: 'card_token_spawn_counters_v1' }).lean();
        check('§14 counters frozen while event inactive (A stays 5, no token marks)', persisted.value[keyA] === 5 && ![...inst.activeSpawns.values()].filter(s => s.groupJid === chatA).some(s => s.hasToken), JSON.stringify(persisted.value));
    }

    // ═══ §3 — hidden command tokens (event restarted: active) ═══
    console.log('\n== §3 hidden command tokens ==');
    {
        await run(`${P} event start`, mod); // re-activate

        for (let i = 0; i < 14; i++) await run(`${P} tokens`, player);
        check('14 eligible cmds → no grant yet', economy.getTokens(player) === 1, `${economy.getTokens(player)}`);

        for (let i = 0; i < 10; i++) await run(`${P} claim zz-bogus`, player, chatA);
        check('claim does NOT tick the hidden counter', economy.getTokens(player) === 1, `${economy.getTokens(player)}`);

        let r = await run(`${P} tokens`, player); // 15th eligible → GRANT
        check('15th eligible cmd grants +1 token', economy.getTokens(player) === 2, `${economy.getTokens(player)}`);
        check('§3/§4 grant notify is mechanic-free', r.texts.some(t => /found an \*Event Token!\*/.test(t) && !/15|rate|every|chance/i.test(t)), JSON.stringify(r.texts.join(' | ')));

        // mod-only commands excluded from the counter
        for (let i = 0; i < 20; i++) await run(`${P} ci "winry" | 1`, mod);
        check('mod/management commands excluded (mod at 0 after 20 ci)', economy.getTokens(mod) === 0, `${economy.getTokens(mod)}`);
        r = await run(`${P} spawninfo`, mod); // excluded cmd too
        for (let i = 0; i < 13; i++) await run(`${P} tokens`, mod);
        check('mod cmd counter untouched by excluded cmds (13 eligible → no grant)', economy.getTokens(mod) === 0, `${economy.getTokens(mod)}`);
    }

    // ═══ §5 — token leaderboard ═══
    console.log('\n== §5 token leaderboard ==');
    {
        economy.addTokens(other2, 9);
        economy.addTokens(other1, 5);
        // leaderboard reads the DB - force the scheduled saves out first
        await economy.saveUser(other2).catch(() => {});
        await economy.saveUser(other1).catch(() => {});
        await economy.saveUser(player).catch(() => {});
        const r = await run(`${P} tokenlb`, player);
        const lb = r.texts.find(t => /EVENT TOKEN LEADERBOARD/i.test(t)) || '';
        check('leaderboard renders', !!lb, JSON.stringify(r.texts.join(' | ')));
        const i2 = lb.indexOf('QAOther2'), i1 = lb.indexOf('QAOther1'), ip = lb.indexOf('QAPlayer');
        check('ranked by balance desc (9 > 5 > 2)', i2 !== -1 && i1 !== -1 && ip !== -1 && i2 < i1 && i1 < ip, `idx ${i2}/${i1}/${ip}`);
        const r2 = await run(`${P} tlb`, player);
        check('tlb alias works', r2.texts.some(t => /EVENT TOKEN LEADERBOARD/i.test(t)));
    }

    // ═══ §1/§11 — global token reset ═══
    console.log('\n== §1/§11 global token reset ==');
    {
        let r = await run(`${P} tokenreset`, player);
        check('denied for regular user', r.texts.some(t => /card moderators/i.test(t)), JSON.stringify(r.texts[0] || ''));
        r = await run(`${P} tokenreset`, mod);
        check('preview (no confirm) shows circulation + asks confirm', r.texts.some(t => /GLOBAL TOKEN RESET/.test(t) && /In circulation/.test(t) && !/DONE/.test(t)), JSON.stringify(r.texts[0] || ''));
        r = await run(`${P} tokenreset confirm`, mod);
        check('confirm wipes', r.texts.some(t => /GLOBAL TOKEN RESET DONE/.test(t)), JSON.stringify(r.texts[0] || ''));
        check('memory balances all zero', [player, other1, other2].every(j => economy.getTokens(j) === 0), [player, other1, other2].map(j => economy.getTokens(j)).join(','));
        // flush any pending scheduled saves (they now persist the ZEROED
        // memory state) before checking the DB layer
        for (const j of [owner, mod, player, other1, other2, victim, buyer, seller]) await economy.saveUser(j).catch(() => {});
        const dbHolders = await User.countDocuments({ eventTokens: { $gt: 0 } });
        check('DB holders all zero', dbHolders === 0, `${dbHolders}`);
        const persisted = await System.findOne({ key: 'card_token_cmd_counters_v1' }).lean();
        check('hidden cmd counters wiped too', !persisted?.value || Object.keys(persisted.value).length === 0, JSON.stringify(persisted?.value));
    }

    // ═══ §12 — super RC ═══
    console.log('\n== §12 super RC (collection wipe) ==');
    {
        const card = plainCards[0];
        const uc1 = await UserCard.create({ userId: victim, cardId: card.id, copyNumber: 1 });
        const uc2 = await UserCard.create({ userId: victim, cardId: plainCards[1].id, copyNumber: 2, inMainDeck: true, mainDeckSlot: 2 });
        const uc3 = await UserCard.create({ userId: victim, cardId: plainCards[2].id, copyNumber: 3, inCustomDeck: true, customDeckName: 'Faves' });
        await CardDeck.create({ userId: victim, name: 'Faves', cards: [uc3._id] });
        await CardMarket.create({ sellerId: victim, userCardId: uc1._id, cardId: card.id, type: 'sale', price: 100, currentBid: 100, status: 'active', listedAt: new Date() });

        const mention = { message: { extendedTextMessage: { contextInfo: { mentionedJid: [victim] } } } };
        let r = await run(`${P} src @guy`, player, chatA, { m: mention });
        check('§13 super RC denied for regular user', r.texts.some(t => /card moderators/i.test(t)), JSON.stringify(r.texts[0] || ''));
        r = await run(`${P} src @guy`, mod, chatA, { m: mention });
        check('preview shows counts + asks confirm', r.texts.some(t => /SUPER RC - COLLECTION WIPE/.test(t) && /Cards to delete/.test(t) && /_3_/.test(t) && !/EXECUTED/.test(t)), JSON.stringify(r.texts[0] || ''));
        r = await run(`${P} src @guy confirm`, mod, chatA, { m: mention });
        check('confirm wipes collection', r.texts.some(t => /SUPER RC EXECUTED/.test(t) && /Cards deleted/.test(t) && /_3_/.test(t)), JSON.stringify(r.texts[0] || ''));
        check('UserCards gone', (await UserCard.countDocuments({ userId: victim })) === 0);
        check('decks gone', (await CardDeck.countDocuments({ userId: victim })) === 0);
        check('market listings cancelled (not sellable ghosts)', (await CardMarket.countDocuments({ sellerId: victim, status: 'active' })) === 0 && (await CardMarket.countDocuments({ sellerId: victim, status: 'cancelled' })) === 1);
    }

    // ═══ §8 — auction smoke ═══
    console.log('\n== §8 auction smoke ==');
    {
        const card = plainCards[3];
        await UserCard.create({ userId: seller, cardId: card.id, copyNumber: 1, inMainDeck: true, mainDeckSlot: 1 });
        economy.addMoney(seller, 1000, 'qa');
        economy.addMoney(buyer, 5000, 'qa');
        await sleep(50);

        let r = await run(`${P} auction 1 100 1h`, seller);
        check('auction started', r.texts.some(t => /AUCTION STARTED!/i.test(t)), JSON.stringify(r.texts[0] || ''));
        r = await run(`${P} bid`, buyer);
        check('auction listed', r.texts.some(t => /LIVE CARD AUCTIONS/i.test(t)));
        r = await run(`${P} bid 1 200`, buyer);
        check('bid placed', r.texts.some(t => /BID PLACED!/i.test(t)), JSON.stringify(r.texts[0] || ''));
        const buyerBefore = economy.getBalance(buyer), sellerBefore = economy.getBalance(seller);
        r = await run(`${P} endauction`, owner);
        check('owner ends auction → settled sale', r.texts.some(t => /AUCTION ENDED - SOLD!/i.test(t)), JSON.stringify(r.texts[0] || ''));
        check('card transferred to winner', (await UserCard.countDocuments({ userId: buyer, cardId: card.id })) === 1);
        check('market marked sold', (await CardMarket.countDocuments({ sellerId: seller, type: 'auction', status: 'sold' })) === 1);
        check('buyer paid 200', economy.getBalance(buyer) === buyerBefore - 200, `${economy.getBalance(buyer)} vs ${buyerBefore - 200}`);
        check('seller credited 90% (180)', economy.getBalance(seller) === sellerBefore + 180, `${economy.getBalance(seller)} vs ${sellerBefore + 180}`);
    }

    // ═══ §7/§9 — event deck unchanged / spin absent (structural asserts) ═══
    console.log('\n== §7/§9 structural ==');
    {
        // §7: event deck handling kept — t2edeck/t2ecoll routes still present (no replacement)
        check('§7 eShop deck command path untouched (router case exists)', typeof cardSystem.eshopAddCard === 'function' && typeof cardSystem.eshopRemoveCard === 'function');
        // §9: no spin event code paths exist in the card system (dynamic
        // regex so the QA's own source can't self-match)
        const spinPat = new RegExp('startSpin|spin' + 'Event|spin_event');
        const sys = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'cardSystem.js'), 'utf8');
        check('§9 no spin event feature in cardSystem', !spinPat.test(sys));
    }

    // cleanup: kill timers, drop throwaway DB, exit
    try { for (const t of (inst.perGroupTimers || new Map()).values()) clearTimeout(t); } catch (e) {}
    try { await mongoose.connection.dropDatabase(); } catch (e) {}
    try { await mongoose.connection.close(); } catch (e) {}
    console.log(`\n════════ RESULT: ${PASS} passed, ${FAIL} failed ════════`);
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
