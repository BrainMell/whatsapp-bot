'use strict';
/**
 * card_cg_e2e.js — E2E for `.j cg` gift source flags (owner request 2026-10-08).
 * Runs ON the box with the REAL cardSystem handler + REAL deployed code + REAL
 * DB; only the WhatsApp sock is mocked (captures sends). Synthetic sender and
 * recipient jids keep production collections untouched; all rows cleaned up.
 *
 *  1. `.j cg @user 1`        -> gifts coll #1 instantly (no flag needed)
 *  2. `.j cg @user 1 -coll`  -> explicit coll flag works
 *  3. `.j cg @user 7 -deck`  -> gifts main-deck slot #7, flags reset on transfer
 *  4. both flags             -> PICK ONE SOURCE
 *  5. empty deck/coll        -> themed CARD NOT FOUND
 *  6. auctioned coll card    -> occupies coll numbering, CARD IN AUCTION guard
 *  7. self gift              -> SELF GIFT
 *  8. no mention             -> usage box shows [-deck | -coll]
 *  9. tagging via REPLY/QUOTE (owner report 2026-10-08):
     participant-resolved target, image-message quotes, mention
     precedence, reply-to-bot never targets the bot, rc via quote
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
  const BOT_ID = botConfig.getBotId();
  const CHAT_ID = '120363000000000000@g.us'; // same proven-safe synthetic group as card_e2e.js
  const OWNER = '1000000000000@s.whatsapp.net';

  const sent = [];
  const BOT_JID = '2099999999999@s.whatsapp.net'; // mock bot identity for the reply-to-bot guard
  const sock = {
    user: { id: BOT_JID },
    sendMessage: async (chat, msg) => { sent.push(msg); return { key: { id: 'mock' } }; },
    groupMetadata: async () => ({ id: 'g', subject: 'e2e-cg', participants: [] }),
  };
  await cardSystem.init(sock, [], [], OWNER);
  const inst = cardSystem.instances.get(BOT_ID);
  console.log('[init] cardSystem ready (botId=' + BOT_ID + ')');

  const SENDER = '1999999999990@s.whatsapp.net';
  const TARGET = '1999999999991@s.whatsapp.net';

  const pickIds = Object.keys(inst.CARD_INDEX).filter(id => /^2-/.test(id)).slice(0, 3);
  ok(pickIds.length === 3, 'picked three tier-2 catalog ids: ' + pickIds.join(', '));
  if (pickIds.length < 3) { console.error('FATAL: not enough catalog cards'); process.exit(1); }
  const [idA, idB, idC] = pickIds;

  const UserCard = cardSystem.UserCard;
  await UserCard.deleteMany({ userId: { $in: [SENDER, TARGET] }, cardId: { $in: pickIds } });

  await UserCard.create({ userId: SENDER, cardId: idA, copyNumber: 1, claimedAt: new Date() });
  await UserCard.create({ userId: SENDER, cardId: idB, copyNumber: 2, claimedAt: new Date() });
  await UserCard.create({ userId: SENDER, cardId: idC, copyNumber: 3, claimedAt: new Date(), inMainDeck: true, mainDeckSlot: 7 });
  // deterministic coll ordering (createdAt ms can tie)
  await UserCard.updateOne({ userId: SENDER, cardId: idA }, { $set: { createdAt: new Date(Date.now() - 3000) } });
  await UserCard.updateOne({ userId: SENDER, cardId: idB }, { $set: { createdAt: new Date(Date.now() - 2000) } });
  await UserCard.updateOne({ userId: SENDER, cardId: idC }, { $set: { createdAt: new Date(Date.now() - 1000) } });

  const runCG = async (argsStr, mentionJid) => {
    sent.length = 0;
    const txt = '.j cg @' + (mentionJid || TARGET).split('@')[0] + ' ' + argsStr;
    await cardSystem.handleCommand({
      lowerTxt: txt.toLowerCase(), txt,
      senderJid: SENDER, chatId: CHAT_ID,
      m: { key: { remoteJid: 'x', fromMe: false }, message: { extendedTextMessage: { contextInfo: { mentionedJid: [mentionJid || TARGET] } } } },
      economy, isOwner: true, senderIsAdmin: false, isMod: false,
    });
    await new Promise(r => setTimeout(r, 1200));
    return sent.find(s => s.text || s.caption);
  };
  const textOf = (m) => (m ? (m.text || m.caption || '') : '');

  // sanity: coll numbering source-of-truth matches cmdCG's query
  const probe = await UserCard.find({ userId: SENDER, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  const probeIds = probe.filter(o => inst.CARD_INDEX[o.cardId]).map(o => o.cardId);
  ok(probeIds[0] === idA && probeIds[1] === idB, 'coll order sanity: idA=#1, idB=#2');

  // ── 1. no flag = instant collection gift ─────────────────────────────────
  let msg = await runCG('1');
  let t = textOf(msg);
  console.log('--- cg 1 (no flag) ---\n' + t);
  ok(/GIFT SENT/.test(t), 'cg 1 (no flag) -> GIFT SENT');
  ok(/Source:\* _Collection #1_/.test(t), 'source label = Collection #1');
  ok(new RegExp('ID:\\* `' + idA + '`').test(t), 'gifted card is coll #1 (idA=' + idA + ')');
  ok(!!(await UserCard.findOne({ userId: TARGET, cardId: idA }).lean()), 'recipient owns idA after gift');
  ok(!(await UserCard.findOne({ userId: SENDER, cardId: idA }).lean()), 'sender no longer owns idA');

  // ── 2. explicit -coll ────────────────────────────────────────────────────
  msg = await runCG('1 -coll');
  t = textOf(msg);
  ok(/GIFT SENT/.test(t) && /Source:\* _Collection #1_/.test(t), 'cg 1 -coll -> GIFT SENT from Collection #1');
  ok(new RegExp('ID:\\* `' + idB + '`').test(t), 'gifted card is idB (next in coll order)');
  ok(!!(await UserCard.findOne({ userId: TARGET, cardId: idB }).lean()), 'recipient owns idB');

  // ── 3. -deck ─────────────────────────────────────────────────────────────
  msg = await runCG('7 -deck');
  t = textOf(msg);
  console.log('--- cg 7 -deck ---\n' + t);
  ok(/GIFT SENT/.test(t), 'cg 7 -deck -> GIFT SENT');
  ok(/Source:\* _Main Deck \(Slot #7\)_/.test(t), 'source label = Main Deck (Slot #7)');
  ok(new RegExp('ID:\\* `' + idC + '`').test(t), 'gifted card is the deck card idC=' + idC);
  ok(!!(await UserCard.findOne({ userId: TARGET, cardId: idC, inMainDeck: false, mainDeckSlot: null }).lean()), 'deck flags reset on transfer');

  // ── 4. both flags ────────────────────────────────────────────────────────
  msg = await runCG('1 -deck -coll');
  ok(/PICK ONE SOURCE/.test(textOf(msg)), 'both flags -> PICK ONE SOURCE');

  // ── 5. not found (deck + coll variants) ──────────────────────────────────
  msg = await runCG('9 -deck');
  ok(/CARD NOT FOUND/.test(textOf(msg)), 'cg 9 -deck on empty deck -> themed CARD NOT FOUND');
  msg = await runCG('1 -coll');
  ok(/CARD NOT FOUND/.test(textOf(msg)), 'cg 1 -coll on empty coll -> themed CARD NOT FOUND');

  // ── 6. auctioned card occupies coll numbering, guard fires ──────────────
  await UserCard.create({ userId: SENDER, cardId: idA, copyNumber: 4, claimedAt: new Date(), inAuction: true });
  msg = await runCG('1 -coll');
  t = textOf(msg);
  ok(/CARD IN AUCTION/.test(t), 'auctioned card occupies coll #1 and gets the auction guard');
  ok(!!(await UserCard.findOne({ userId: SENDER, cardId: idA, inAuction: true }).lean()), 'auctioned card NOT transferred');
  await UserCard.deleteMany({ userId: SENDER, cardId: idA });

  // ── 7. self gift ─────────────────────────────────────────────────────────
  msg = await runCG('1 -coll', SENDER);
  ok(/SELF GIFT/.test(textOf(msg)), 'self gift blocked');

  // ── 8. no mention -> usage box shows both flags ─────────────────────────
  sent.length = 0;
  await cardSystem.handleCommand({
    lowerTxt: '.j cg 1', txt: '.j cg 1',
    senderJid: SENDER, chatId: CHAT_ID,
    m: { key: { remoteJid: 'x', fromMe: false } },
    economy, isOwner: true, senderIsAdmin: false, isMod: false,
  });
  await new Promise(r => setTimeout(r, 800));
  msg = sent.find(s => s.text || s.caption);
  t = textOf(msg);
  ok(/USAGE/.test(t), 'no mention -> usage box');
  ok(/\[-deck \| -coll\]/.test(t), 'usage shows [-deck | -coll]');

  // ── round 9: tagging via reply/quote (owner report 2026-10-08) ──────────
  console.log('\n== round 9: tag targets via quoted reply ==');
  {
    const runCGm = async (txt, m) => {
      sent.length = 0;
      await cardSystem.handleCommand({
        lowerTxt: txt.toLowerCase(), txt,
        senderJid: SENDER, chatId: CHAT_ID, m,
        economy, isOwner: true, senderIsAdmin: false, isMod: false,
      });
      await new Promise(r => setTimeout(r, 1200));
      return sent.find(s => s.text || s.caption);
    };
    const seedColl = async (copy) => {
      await UserCard.create({ userId: SENDER, cardId: idA, copyNumber: copy, claimedAt: new Date() });
      await UserCard.updateOne({ userId: SENDER, cardId: idA }, { $set: { createdAt: new Date(Date.now() - 5000) } });
    };

    // 9a. plain reply/quote, no @mention: participant = TARGET
    await seedColl(5);
    let msg = await runCGm('.j cg 1', { key: { remoteJid: 'x', fromMe: false }, message: { extendedTextMessage: { contextInfo: { participant: TARGET } } } });
    let t = textOf(msg);
    console.log('--- cg 1 via reply ---\n' + t);
    ok(/GIFT SENT/.test(t) && new RegExp('ID:\\* `' + idA + '`').test(t), 'reply/quote (participant) gifts coll #1 to the quoted user');
    ok(!(await UserCard.findOne({ userId: SENDER, cardId: idA }).lean()), 'sender no longer owns idA (quote gift moved it)');

    // 9b. quoted IMAGE message shape also resolves
    await seedColl(6);
    msg = await runCGm('.j cg 1', { key: { remoteJid: 'x', fromMe: false }, message: { imageMessage: { contextInfo: { participant: TARGET } } } });
    t = textOf(msg);
    ok(/GIFT SENT/.test(t), 'reply/quote on an image message also resolves the target');

    // 9c. mention wins over quoted participant (participant = sender would self-gift)
    await seedColl(7);
    msg = await runCGm('.j cg 1', { key: { remoteJid: 'x', fromMe: false }, message: { extendedTextMessage: { contextInfo: { mentionedJid: [TARGET], participant: SENDER } } } });
    t = textOf(msg);
    ok(/GIFT SENT/.test(t) && !/SELF GIFT/.test(t), 'mention takes precedence over quoted participant');

    // 9d. replying to the BOT's own message = no target -> usage, never gift-to-bot
    msg = await runCGm('.j cg 1', { key: { remoteJid: 'x', fromMe: false }, message: { extendedTextMessage: { contextInfo: { participant: BOT_JID } } } });
    t = textOf(msg);
    ok(/USAGE/.test(t) && !/GIFT SENT/.test(t), 'reply to bot message -> usage (bot never becomes the gift target)');

    // 9e. rc (mod command) also accepts reply/quote targets
    msg = await runCGm('.j rc totallymissingcard', { key: { remoteJid: 'x', fromMe: false }, message: { extendedTextMessage: { contextInfo: { participant: TARGET } } } });
    t = textOf(msg);
    ok(!/Tag the player whose card you want to delete/.test(t), 'rc got past target resolution via quote (no no-target usage error)');

    // cleanup round 9 rows
    await UserCard.deleteMany({ userId: { $in: [SENDER, TARGET] }, cardId: { $in: pickIds } });
  }

  // cleanup synthetic rows
  await UserCard.deleteMany({ userId: { $in: [SENDER, TARGET] }, cardId: { $in: pickIds } });
  const ucol = mongoose.connection.db.collection('users');
  await ucol.deleteMany({ $or: [{ userId: { $in: [SENDER, TARGET] } }, { jid: { $in: [SENDER, TARGET] } }, { userJid: { $in: [SENDER, TARGET] } }, { phone: { $in: [SENDER, TARGET] } }] }).catch(() => {});
  console.log('[cleanup] synthetic rows removed');

  console.log(`\nCG E2E RESULT: ${pass} pass, ${fail} fail`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
