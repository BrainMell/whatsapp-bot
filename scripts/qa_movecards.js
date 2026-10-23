#!/usr/bin/env node
// 🃏 MOVECARDS QA (2026-10-23) — run ON-BOX inside the bot dir:
//   node scripts/qa_movecards.js [Joker|Jake|Subaru]
// Owner ask: "There used to be a command that moves all of someone's cards
// from one account to another, hmmm where the card mod, global mod or owner
// tags the 2 accounts with a mod command, do that and force restart joker"
//
// What it covers:
//   A. gate: non-mod blocked, cardmod/owner pass (dispatcher-level)
//   B. preview: counts, listings, auction-hold, arming
//   C. fire: cards move, copy numbers preserved, deck pulled, flags reset,
//      listing cancelled, auction copy stays, money untouched, DST account created
//   D. state machine: single-fire, 60s expiry, nothing-armed, same-account, usage
//
// Safety model:
//   - mock sock: ZERO WhatsApp traffic
//   - QA-husk identities (234000000011111/22222@s.whatsapp.net), fully
//     deleted in `finally` — nothing real is touched
//   - movecards is token-cmd-excluded → no token counter ticks
'use strict';
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
    const envPath = path.join(__dirname, '..', '.env');
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
    const mongoose = require('mongoose');
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[qa] mongo connected: ${mongoose.connection.name}`);

    const BOT = path.join(__dirname, '..');
    const INSTANCE = process.argv[2] || 'Joker';
    const botConfig = require(path.join(BOT, 'botConfig'));
    const cardSystem = require(path.join(BOT, 'core', 'rpg', 'cardSystem'));
    const economy = require(path.join(BOT, 'core', 'rpg', 'economy'));
    await economy.loadEconomy().catch(e => console.log(`[qa] economy warn: ${e.message}`));

    const SRC   = '234000000011111@s.whatsapp.net';
    const DST   = '234000000022222@s.whatsapp.net';
    const CHAT  = 'qa-movecards@g.us';
    const CHAT2 = 'qa-movecards2@g.us';
    const RANDOM   = '100000000000qa@lid';   // plain user — must be BLOCKED
    const CARDMOD  = '264299486400613@lid';  // Mahxee — real cardmod on Joker
    const OWNER_QA = '2300000000owner@s.whatsapp.net';

    const sent = [];
    const mockSock = { sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'QA' } }; } };
    const lastText = () => (sent.length ? sent[sent.length - 1].content.text || '' : '');

    const UserCard = cardSystem.UserCard;
    const CardMarket = cardSystem.CardMarket;
    const CardDeck = cardSystem.CardDeck;
    const User = require(path.join(BOT, 'core', 'models', 'User'));

    async function cleanup() {
        await UserCard.deleteMany({ userId: { $in: [SRC, DST] } });
        await CardDeck.deleteMany({ userId: SRC });
        await CardMarket.deleteMany({ sellerId: SRC });
        if (User) await User.deleteMany({ userId: { $in: [SRC, DST] } });
        cardSystem.moveCardsArmed.delete(CHAT);
        cardSystem.moveCardsArmed.delete(CHAT2);
    }

    const store = new botConfig.BotConfig(path.join(BOT, 'instances', INSTANCE));
    await botConfig.storage.run(store, async () => {
        console.log(`[qa] instance store botId=${botConfig.getBotId()} prefix=${botConfig.getPrefix()}`);
        const P = botConfig.getPrefix();
        await cardSystem.init(mockSock, [], [], null);
        const inst = cardSystem.instances.get(botConfig.getBotId());
        check('init loaded card DB', (inst.ALL_CARDS || []).length > 100, `got ${(inst.ALL_CARDS || []).length}`);
        check('Mahxee is a cardmod on this instance (real roster)', inst.modJids.has(CARDMOD));

        // source assertions
        const srcTxt = fs.readFileSync(path.join(BOT, 'core', 'rpg', 'cardSystem.js'), 'utf8');
        check('source: dispatcher gates movecards on isCardMod', /case 'movecards':\s*\n\s*case 'mc':\s*\n\s*if \(!isCardMod\)/.test(srcTxt));
        check('source: movecards+mc token-cmd-excluded', /'movecards', 'mc',/.test(srcTxt));

        try {
            await cleanup();

            // ── seed ──
            const cardIds = inst.ALL_CARDS.slice(0, 5).map(c => c.id);
            const c1 = await UserCard.create({ userId: SRC, cardId: cardIds[0], copyNumber: 101, forSale: true, salePrice: 100, inCustomDeck: true, customDeckName: 'QADeck', inMainDeck: true, mainDeckSlot: 3 });
            const c2 = await UserCard.create({ userId: SRC, cardId: cardIds[1], copyNumber: 102, forSale: true, salePrice: 250, inCustomDeck: true, customDeckName: 'QADeck' });
            const c3 = await UserCard.create({ userId: SRC, cardId: cardIds[2], copyNumber: 103, inAuction: true, inCustomDeck: true, customDeckName: 'QADeck' });
            const c4 = await UserCard.create({ userId: SRC, cardId: cardIds[3], copyNumber: 104 });
            const c5 = await UserCard.create({ userId: SRC, cardId: cardIds[4], copyNumber: 105 });
            await CardDeck.create({ userId: SRC, name: 'QADeck', cards: [c1._id, c2._id, c3._id] });
            await CardMarket.create({ sellerId: SRC, userCardId: c1._id, cardId: cardIds[0], type: 'sale', price: 100, status: 'active' });
            const d1 = await UserCard.create({ userId: DST, cardId: cardIds[0], copyNumber: 99 });
            if (User) await User.create({ userId: SRC, nickname: 'QASrc', wallet: 500, bank: 250, eventTokens: 7 });
            check('seed: SRC has 5 cards', (await UserCard.countDocuments({ userId: SRC })) === 5);
            check('seed: DST has 1 card', (await UserCard.countDocuments({ userId: DST })) === 1);

            const mentionMsg = (mentions) => ({ message: { extendedTextMessage: { contextInfo: { mentionedJid: mentions } } } });
            const fakeReply = async (text, opts) => { sent.push({ jid: CHAT, content: { text } }); return { key: { id: 'qa' } }; };

            // ── D. guards ──
            // mentions dedupe: [SRC,SRC] collapses to 1 candidate → usage reply
            await cardSystem.cmdMoveCards(RANDOM, fakeReply, ['@x'], mentionMsg([SRC, SRC]), CHAT);
            check('guard: duplicate tags dedupe to usage', lastText().includes('MOVE CARDS BETWEEN ACCOUNTS'), lastText().slice(0, 80));
            await cardSystem.cmdMoveCards(RANDOM, fakeReply, [], mentionMsg([SRC]), CHAT);
            check('guard: <2 tags → usage', lastText().includes('MOVE CARDS BETWEEN ACCOUNTS'), lastText().slice(0, 80));
            await cardSystem.cmdMoveCards(RANDOM, fakeReply, ['confirm'], mentionMsg([]), CHAT);
            check('guard: confirm with nothing armed', lastText().includes('NOTHING ARMED'), lastText().slice(0, 80));

            // ── B. preview ──
            await cardSystem.cmdMoveCards(RANDOM, fakeReply, [], mentionMsg([SRC, DST]), CHAT);
            const preview = lastText();
            check('preview: title', preview.includes('MOVE CARDS — PREVIEW'), preview.slice(0, 100));
            check('preview: SRC count 5', preview.includes('*5* card'), preview.slice(0, 120));
            check('preview: DST current 1', preview.includes('*1* card'), preview.slice(0, 140));
            check('preview: listings 1', preview.includes('*Market listings to cancel:* _1_'), preview.slice(0, 160));
            check('preview: auction hold shown', preview.includes('*In active auction:* _1'), preview.slice(0, 180));
            const armed = cardSystem.moveCardsArmed.get(CHAT);
            check('preview: chat armed with src/dst', !!armed && armed.src === SRC && armed.dst === DST, JSON.stringify(armed || {}));

            // ── C. fire ──
            await cardSystem.cmdMoveCards(RANDOM, fakeReply, ['confirm'], mentionMsg([]), CHAT);
            const doneMsg = lastText();
            check('fire: success card', doneMsg.includes('CARDS MOVED!'), doneMsg.slice(0, 100));
            check('fire: moved 4 (5 − 1 auction)', doneMsg.includes('*Moved:* _4 cards_'), doneMsg.slice(0, 140));
            check('fire: listings cancelled 1', doneMsg.includes('*Listings cancelled:* _1_'), doneMsg.slice(0, 160));

            const srcAfter = await UserCard.find({ userId: SRC }).lean();
            const dstAfter = await UserCard.find({ userId: DST }).lean();
            check('post: SRC keeps only the auction copy', srcAfter.length === 1 && String(srcAfter[0]._id) === String(c3._id), `src=${srcAfter.length}`);
            check('post: DST owns 5 (1 own + 4 moved)', dstAfter.length === 5, `dst=${dstAfter.length}`);
            const c1After = dstAfter.find(d => String(d._id) === String(c1._id));
            check('post: c1 moved with flags reset', !!c1After && c1After.forSale === false && c1After.salePrice === null && c1After.inCustomDeck === false && c1After.inMainDeck === false && c1After.mainDeckSlot === null);
            check('post: c1 copyNumber preserved (101)', !!c1After && c1After.copyNumber === 101, `got ${c1After && c1After.copyNumber}`);
            const deckAfter = await CardDeck.findOne({ userId: SRC, name: 'QADeck' }).lean();
            check('post: deck pulled — only auction copy remains', !!deckAfter && deckAfter.cards.length === 1 && String(deckAfter.cards[0]) === String(c3._id), `deck=${deckAfter && deckAfter.cards.length}`);
            const listingAfter = await CardMarket.findOne({ sellerId: SRC }).lean();
            check('post: listing cancelled in DB', !!listingAfter && listingAfter.status === 'cancelled', listingAfter && listingAfter.status);
            check('post: SRC users doc money untouched', !!User && await (async () => { const u = await User.findOne({ userId: SRC }).lean(); return u && u.wallet === 500 && u.bank === 250 && u.eventTokens === 7; })());
            // The fire path's getOrCreateUser caches DST in economy RAM; flush it
            // and require the DB doc — proves the recipient account really exists.
            await economy.saveUser(DST).catch(() => {});
            const dstDoc = await User.findOne({ userId: DST }).lean();
            check('post: DST economy account created & persisted', !!dstDoc, dstDoc ? '' : 'no users doc after saveUser flush');

            // ── D. single-fire + expiry ──
            await cardSystem.cmdMoveCards(RANDOM, fakeReply, ['confirm'], mentionMsg([]), CHAT);
            check('state: single-fire — armed key consumed', lastText().includes('NOTHING ARMED'), lastText().slice(0, 80));
            await cardSystem.cmdMoveCards(RANDOM, fakeReply, [], mentionMsg([SRC, DST]), CHAT2);
            const armed2 = cardSystem.moveCardsArmed.get(CHAT2);
            armed2.armedAt = Date.now() - 61_000;
            await cardSystem.cmdMoveCards(RANDOM, fakeReply, ['confirm'], mentionMsg([]), CHAT2);
            check('state: expired preview rejected', lastText().includes('PREVIEW EXPIRED'), lastText().slice(0, 80));

            // ── A. dispatcher-level gate ──
            sent.length = 0;
            const mkCall = (senderJid, perms) => cardSystem.handleCommand({
                lowerTxt: `${P} movecards`, txt: `${P} movecards @old @new`,
                senderJid, chatId: CHAT2, m: mentionMsg([SRC, DST]),
                economy, isOwner: perms.isOwner, senderIsAdmin: false, isMod: perms.isMod,
            });
            await mkCall(RANDOM, { isOwner: false, isMod: false });
            check('gate: plain user blocked', lastText().includes('Only card moderators, global mods, or the owner'), lastText().slice(0, 90));
            await mkCall(OWNER_QA, { isOwner: true, isMod: false });
            check('gate: owner passes (preview fires)', !lastText().includes('Only card moderators'), lastText().slice(0, 90));
            cardSystem.moveCardsArmed.delete(CHAT2);
            sent.length = 0;
            await mkCall(CARDMOD, { isOwner: false, isMod: false });
            check('gate: cardmod (Mahxee roster) passes', !lastText().includes('Only card moderators'), lastText().slice(0, 90));
            cardSystem.moveCardsArmed.delete(CHAT2);

            // alias: 'mc' must reach the SAME case — from a plain user the gate
            // reply itself proves routing (unwired cmds get no reply at all)
            sent.length = 0;
            await cardSystem.handleCommand({
                lowerTxt: `${P} mc`, txt: `${P} mc`, senderJid: RANDOM, chatId: CHAT2,
                m: mentionMsg([SRC, DST]), economy, isOwner: false, senderIsAdmin: false, isMod: false,
            });
            check('alias: .mc reaches the movecards case (gate fires)', lastText().includes('Only card moderators, global mods, or the owner'), lastText().slice(0, 90) || 'NO REPLY');
        } finally {
            await cleanup();
            const left = (await UserCard.countDocuments({ userId: { $in: [SRC, DST] } }))
                + (await CardDeck.countDocuments({ userId: SRC }))
                + (await CardMarket.countDocuments({ sellerId: SRC }));
            check('cleanup: zero QA docs left on live DB', left === 0, `left=${left}`);
        }

        console.log(`\n[qa] RESULT: ${PASS} passed, ${FAIL} failed`);
        process.exitCode = FAIL ? 1 : 0;
    });
    setTimeout(() => process.exit(process.exitCode || 0), 1500).unref();
    process.exit(process.exitCode || 0);
})().catch((e) => { console.error('[qa] FATAL', e); process.exit(1); });
