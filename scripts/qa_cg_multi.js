'use strict';
/**
 * qa_cg_multi.js — E2E for `.j cg` BULK gift (owner 2026-10-25:
 * "make thus a command sending multiple cards .j cg 190,201,28,114,295").
 * Runs ON the box with the REAL cardSystem handler + REAL DB; only the
 * WhatsApp sock is mocked. Synthetic jids, all rows cleaned up.
 *
 * T1  single gift regression  -> byte-identical GIFT SENT path
 * T2  bulk 6,2,4 (descending)-> snapshot law: cards match PRE-command numbering
 * T3  bulk with locked + out-of-range -> skips with reasons, batch continues
 * T4  bulk -deck with a LISTED slot   -> 🛒 skip, deck flags reset on the sent ones
 * T5  11 indexes              -> TOO MANY CARDS cap
 * T6  self-gift bulk          -> SELF GIFT
 * T7  both flags              -> PICK ONE SOURCE (regression)
 * T8  no mention              -> usage shows <index(es)>
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
  const CHAT_ID = '120363000000000000@g.us';
  const OWNER = '1000000000000@s.whatsapp.net';

  const sent = [];
  const BOT_JID = '2099999999999@s.whatsapp.net';
  const sock = {
    user: { id: BOT_JID },
    sendMessage: async (chat, msg) => { sent.push(msg); return { key: { id: 'mock' } }; },
    groupMetadata: async () => ({ id: 'g', subject: 'e2e-cg-multi', participants: [] }),
  };
  await cardSystem.init(sock, [], [], OWNER);
  const inst = cardSystem.instances.get(BOT_ID);
  const UserCard = cardSystem.UserCard;
  console.log('[init] cardSystem ready (botId=' + BOT_ID + ')');

  const SENDER = '1999999999970@s.whatsapp.net';
  const SENDER2 = '1999999999971@s.whatsapp.net';
  const SENDER3 = '1999999999972@s.whatsapp.net';
  const TARGET = '1999999999980@s.whatsapp.net';
  const ALLJ = [SENDER, SENDER2, SENDER3, TARGET];

  const pickIds = Object.keys(inst.CARD_INDEX).filter(id => /^2-/.test(id)).slice(0, 24);
  if (pickIds.length < 24) { console.error('FATAL: not enough catalog cards'); process.exit(1); }
  // pre-clean any stale synthetic rows
  await UserCard.deleteMany({ userId: { $in: ALLJ }, cardId: { $in: pickIds } });

  const mkSender = async (jid, n, baseMin) => {
    for (let i = 0; i < n; i++) {
      const uc = await UserCard.create({ userId: jid, cardId: pickIds[i], copyNumber: i + 1, claimedAt: new Date() });
      const at = new Date(Date.now() - (baseMin - i) * 1000);
      await UserCard.updateOne({ _id: uc._id }, { $set: { createdAt: at } });
    }
  };
  // the exact numbered-collection law (getNumberedCollection): sort createdAt 1, _id 1,
  // non-deck/non-custom/non-sale, catalog orphans dropped
  const collOrder = async (jid) => {
    const rows = await UserCard.find({ userId: jid, inMainDeck: false, inCustomDeck: false, forSale: false })
      .sort({ createdAt: 1, _id: 1 }).lean();
    return rows.filter(o => inst.CARD_INDEX[o.cardId]).map(o => o.cardId);
  };

  const runCG = async (senderJid, argsStr, mentionJid) => {
    sent.length = 0;
    const txt = '.j cg @' + (mentionJid || TARGET).split('@')[0] + ' ' + argsStr;
    await cardSystem.handleCommand({
      lowerTxt: txt.toLowerCase(), txt,
      senderJid, chatId: CHAT_ID,
      m: { key: { remoteJid: 'x', fromMe: false }, message: { extendedTextMessage: { contextInfo: { mentionedJid: [mentionJid || TARGET] } } } },
      economy, isOwner: true, senderIsAdmin: false, isMod: false,
    });
    await new Promise(r => setTimeout(r, 1500));
    return sent.find(s => s.text || s.caption);
  };
  const textOf = (m) => (m ? (m.text || m.caption || '') : '');

  // ── T1: single gift regression (shared helper must be byte-identical) ────
  await mkSender(SENDER, 2, 10);
  let pre = await collOrder(SENDER);
  ok(pre.length === 2, 'T1 setup: sender has 2 coll cards');
  let msg = await runCG(SENDER, '1');
  let t = textOf(msg);
  ok(/GIFT SENT/.test(t) && !/BULK/.test(t), 'T1 single -> GIFT SENT (not BULK)');
  ok(new RegExp('ID:\\* `' + pre[0] + '`').test(t), 'T1 gifted card = coll #1 (' + pre[0] + ')');
  ok(!!(await UserCard.findOne({ userId: TARGET, cardId: pre[0] }).lean()), 'T1 recipient owns it');
  ok(!!(await UserCard.findOne({ userId: TARGET, cardId: pre[0], createdAt: { $gt: new Date(Date.now() - 60000) } }).lean()), 'T1 received card got fresh createdAt');

  // ── T2: bulk DESCENDING order — snapshot law ─────────────────────────────
  await mkSender(SENDER2, 6, 20);
  const order2 = await collOrder(SENDER2); // #1..#6 BEFORE any transfer
  ok(order2.length === 6, 'T2 setup: sender2 has 6 coll cards');
  msg = await runCG(SENDER2, '6,2,4');
  t = textOf(msg);
  console.log('--- T2 bulk 6,2,4 ---\n' + t);
  ok(/BULK GIFT — 3\/3 SENT/.test(t), 'T2 header: BULK GIFT — 3/3 SENT');
  // WITHOUT the snapshot, gifting #6 first shifts numbering -> wrong cards.
  ok(t.includes('`' + order2[5] + '`'), 'T2 line #6 carries pre-command #6 card (' + order2[5] + ')');
  ok(t.includes('`' + order2[1] + '`'), 'T2 line #2 carries pre-command #2 card (' + order2[1] + ')');
  ok(t.includes('`' + order2[3] + '`'), 'T2 line #4 carries pre-command #4 card (' + order2[3] + ')');
  for (const id of [order2[5], order2[1], order2[3]]) {
    ok(!!(await UserCard.findOne({ userId: TARGET, cardId: id }).lean()), 'T2 recipient owns ' + id);
  }
  const order2After = await collOrder(SENDER2);
  ok(JSON.stringify(order2After.sort()) === JSON.stringify([order2[0], order2[2], order2[4]].sort()), 'T2 sender keeps the 3 untouched cards');
  ok(t.indexOf('#6') < t.indexOf('#2') && t.indexOf('#2') < t.indexOf('#4'), 'T2 line order follows typed order (6,2,4)');

  // ── T3: locked + out-of-range skips ──────────────────────────────────────
  await mkSender(SENDER3, 5, 30);
  const order3 = await collOrder(SENDER3);
  await UserCard.updateOne({ userId: SENDER3, cardId: order3[1] }, { $set: { isLocked: true } });
  msg = await runCG(SENDER3, '3,99,2');
  t = textOf(msg);
  console.log('--- T3 bulk 3,99,2 (locked) ---\n' + t);
  ok(/BULK GIFT — 1\/3 SENT/.test(t), 'T3 header: 1/3 SENT');
  ok(t.includes('`' + order3[2] + '`'), 'T3 #3 gifted (' + order3[2] + ')');
  ok(/🔒.*locked, skipped/.test(t), 'T3 locked line has 🔒 reason');
  ok(/❌.*no card in that coll slot/.test(t), 'T3 out-of-range line has ❌ reason');
  ok(!!(await UserCard.findOne({ userId: SENDER3, cardId: order3[1] }).lean()), 'T3 locked card STAYED with sender');
  ok(!!(await UserCard.findOne({ userId: TARGET, cardId: order3[2] }).lean()), 'T3 recipient owns the sent one');

  // ── T4: bulk -deck with a LISTED slot ────────────────────────────────────
  // sender3 remaining coll: order3 minus gifted/locked. Deck the next 3 by slot.
  const rest3 = await collOrder(SENDER3);
  const deckTargets = rest3.slice(0, 3);
  for (let s = 0; s < 3; s++) {
    await UserCard.updateOne({ userId: SENDER3, cardId: deckTargets[s] }, { $set: { inMainDeck: true, mainDeckSlot: s + 1 } });
  }
  await UserCard.updateOne({ userId: SENDER3, cardId: deckTargets[1] }, { $set: { isLocked: false, forSale: true, salePrice: 100 } });
  msg = await runCG(SENDER3, '1,2,3 -deck');
  t = textOf(msg);
  console.log('--- T4 bulk deck 1,2,3 (listed mid) ---\n' + t);
  ok(/BULK GIFT — 2\/3 SENT/.test(t), 'T4 header: 2/3 SENT');
  ok(/🛒.*listed, skipped/.test(t), 'T4 listed slot has 🛒 skip line');
  ok(!!(await UserCard.findOne({ userId: TARGET, cardId: deckTargets[0], inMainDeck: false, mainDeckSlot: null }).lean()), 'T4 slot-1 card moved + deck flags reset');
  ok(!!(await UserCard.findOne({ userId: TARGET, cardId: deckTargets[2], inMainDeck: false, mainDeckSlot: null }).lean()), 'T4 slot-3 card moved + deck flags reset');
  ok(!!(await UserCard.findOne({ userId: SENDER3, cardId: deckTargets[1], inMainDeck: true, mainDeckSlot: 2 }).lean()), 'T4 listed card STAYED in deck slot 2');

  // ── T5: cap ──────────────────────────────────────────────────────────────
  msg = await runCG(SENDER3, '1,2,3,4,5,6,7,8,9,10,11');
  ok(/TOO MANY CARDS/.test(textOf(msg)), 'T5 11 indexes -> TOO MANY CARDS');

  // ── T6: self-gift bulk ───────────────────────────────────────────────────
  msg = await runCG(SENDER3, '1,2', SENDER3);
  ok(/SELF GIFT/.test(textOf(msg)), 'T6 self-gift bulk -> SELF GIFT');

  // ── T7: both flags regression ────────────────────────────────────────────
  msg = await runCG(SENDER3, '1 -deck -coll');
  ok(/PICK ONE SOURCE/.test(textOf(msg)), 'T7 both flags -> PICK ONE SOURCE');

  // ── T8: no mention regression ────────────────────────────────────────────
  sent.length = 0;
  const txt8 = '.j cg 1';
  await cardSystem.handleCommand({
    lowerTxt: txt8, txt: txt8,
    senderJid: SENDER3, chatId: CHAT_ID,
    m: { key: { remoteJid: 'x', fromMe: false }, message: { extendedTextMessage: { text: txt8 } } },
    economy, isOwner: true, senderIsAdmin: false, isMod: false,
  });
  await new Promise(r => setTimeout(r, 1200));
  msg = sent.find(s => s.text || s.caption);
  ok(/index\(es\)/.test(textOf(msg)), 'T8 no mention -> usage shows <index(es)>');

  // ── cleanup ──────────────────────────────────────────────────────────────
  await UserCard.deleteMany({ userId: { $in: ALLJ }, cardId: { $in: pickIds } });
  const ucol = mongoose.connection.db.collection('users');
  await ucol.deleteMany({ $or: [{ userId: { $in: ALLJ } }, { jid: { $in: ALLJ } }, { userJid: { $in: ALLJ } }, { phone: { $in: ALLJ } }] }).catch(() => {});
  console.log('[cleanup] synthetic rows removed');

  console.log(`\nCG MULTI RESULT: ${pass} pass, ${fail} fail`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
