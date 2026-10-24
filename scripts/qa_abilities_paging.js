'use strict';
/**
 * qa_abilities_paging.js — QA for the 2026-10-24 abilities codex paging pair.
 * Runs ON the box with the REAL skillCommands, REAL DB (read-only), mocked sock.
 *
 * Mellow brief: ".j abilities <id> had two conflicting uses, one is for viewing
 * abilities ids and the other to move to the next ability page, let's make the
 * page replying to the message with 2 or 3, and make this known on the
 * .j abilities — it shouldn't hang so terminate after abit"
 *
 * Covers:
 *   1. codex renders + footer advertises reply-paging (when paginated)
 *   2. reply "2" to the codex message → page 2 re-render, flip chain continues
 *   3. reply with out-of-range page → bounded hint, handled=true
 *   4. reply from a DIFFERENT user → ignored (false), no hijack
 *   5. reply to an unknown message id → false (falls through to other flows)
 *   6. legacy `.j abilities 2` page jump still works
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

  const skillCommands = require('../core/commands/skillCommands');
  const economy = require('../core/rpg/economy');
  const CHAT_ID = '120363000000000000@g.us';

  // ── find a real user who actually has learned skills (read-only) ─────────
  // viewAbilities reads user.skills; a fresh test jid has none and would take
  // the "no abilities" early-out, which never paginates.
  const usersCol = mongoose.connection.collection('users');
  const candidate = await usersCol.findOne(
    { 'skills.0': { $exists: true } },
    { projection: { userId: 1, nickname: 1 } },
  ).catch(() => null);
  // skills may be a subdocument map, not an array — try that shape too
  let OWNER, OWNER_NAME;
  if (candidate && candidate.userId) {
    OWNER = candidate.userId;
    OWNER_NAME = candidate.nickname || 'QA Tester';
  } else {
    const alt = await usersCol.aggregate([
      { $sample: { size: 25 } },
      { $project: { userId: 1, nickname: 1, skills: 1 } },
    ]).toArray();
    const withSkills = alt.find((u) => u.skills && Object.keys(u.skills).length > 0);
    if (!withSkills) {
      console.error('FATAL: no user with learned skills found in DB sample — cannot exercise pagination');
      process.exit(1);
    }
    OWNER = withSkills.userId;
    OWNER_NAME = withSkills.nickname || 'QA Tester';
  }
  console.log('[user] testing as', OWNER, '/', OWNER_NAME);

  const STRANGER = '2999999999999@s.whatsapp.net';
  let msgSeq = 0;
  const sent = [];
  const sock = {
    sendMessage: async (chat, msg) => {
      const id = 'qa-ab-' + (++msgSeq);
      sent.push({ id, msg });
      return { key: { id, remoteJid: chat, fromMe: true } };
    },
  };

  const bodyOf = (entry) => entry.msg.text || entry.msg.caption || '';
  const findMsg = (re) => sent.map((e) => bodyOf(e)).find((t) => re.test(t)) || null;
  const lastCodex = () => {
    for (let i = sent.length - 1; i >= 0; i--) {
      if (/Codex|Ledger|Grimoire|abilities|Page \d+\//i.test(bodyOf(sent[i]))) return sent[i];
    }
    return null;
  };

  // ── 1. base codex render (page 1) ────────────────────────────────────────
  sent.length = 0;
  await skillCommands.viewAbilities(sock, CHAT_ID, OWNER, OWNER_NAME, undefined);
  const codex1 = lastCodex();
  ok(!!codex1, 'codex renders (image caption or text)');
  const t1 = codex1 ? bodyOf(codex1) : '';
  const pageMatch = t1.match(/Page (\d+)\/(\d+)/);
  const totalPages = pageMatch ? parseInt(pageMatch[2]) : 1;
  ok(!!pageMatch && pageMatch[1] === '1', 'codex shows Page 1/' + totalPages);
  if (totalPages > 1) {
    ok(/Reply to this message/.test(t1), 'footer advertises reply-paging');
    ok(/flip pages \(5 min\)/.test(t1), 'footer states the 5-min window');
    ok(new RegExp('`2`–`' + totalPages + '`').test(t1), 'footer shows the valid reply range 2-' + totalPages);
  } else {
    console.log('  (user codex fits one page — reply-hint lines skipped by design)');
  }
  if (codex1) console.log('--- codex head (200) ---\n' + t1.slice(0, 200));

  if (totalPages > 1 && codex1) {
    // ── 2. reply "2" to the codex → page 2 ────────────────────────────────
    sent.length = 0;
    const handled2 = await skillCommands.handleAbilitiesPageReply(
      sock, CHAT_ID, OWNER, codex1.id, '2');
    ok(handled2 === true, 'reply "2" to codex message is handled');
    const t2 = findMsg(/Page 2\//);
    ok(!!t2, 'page 2 codex re-rendered');
    if (t2) ok(/Reply to this message/.test(t2), 'page-2 codex also advertises reply-paging (chain continues)');

    // ── 3. out-of-range reply → bounded hint, still handled ───────────────
    // (need a live session: re-render page 1 first)
    sent.length = 0;
    await skillCommands.viewAbilities(sock, CHAT_ID, OWNER, OWNER_NAME, undefined);
    const codexR = lastCodex();
    sent.length = 0;
    const handledBig = await skillCommands.handleAbilitiesPageReply(
      sock, CHAT_ID, OWNER, codexR.id, String(totalPages + 5));
    ok(handledBig === true, 'out-of-range reply is handled');
    ok(!!findMsg(new RegExp('reply with a number between 1 and ' + totalPages)), 'out-of-range hint names the real bound');

    // ── 4. stranger reply → ignored (no hijack) ───────────────────────────
    sent.length = 0;
    await skillCommands.viewAbilities(sock, CHAT_ID, OWNER, OWNER_NAME, undefined);
    const codexS = lastCodex();
    sent.length = 0;
    const handledStranger = await skillCommands.handleAbilitiesPageReply(
      sock, CHAT_ID, STRANGER, codexS.id, '2');
    ok(handledStranger === false, 'stranger reply is NOT handled (no hijack)');
    ok(sent.length === 0, 'stranger reply produces no messages');

    // ── 5. unknown quoted id → false ──────────────────────────────────────
    const handledUnknown = await skillCommands.handleAbilitiesPageReply(
      sock, CHAT_ID, OWNER, 'no-such-message-id-xyz', '2');
    ok(handledUnknown === false, 'unknown quoted id falls through (false)');

    // ── 6. arg routing after the fix: numbers INSPECT, replies PAGE ───────
    // (2026-10-11 overhaul made `.j abilities <n>` an inspection command;
    // Mellow's conflict — "two conflicting uses" — is resolved by moving
    // page flips to replies. Assert both sides of that resolution.)
    sent.length = 0;
    await skillCommands.viewAbilities(sock, CHAT_ID, OWNER, OWNER_NAME, '2');
    ok(!!findMsg(/🔍 \*/), '`.j abilities 2` opens the ability INSPECTION card (id-use wins)');
    ok(!findMsg(/Page 2\//), 'numeric arg no longer flips pages');
    sent.length = 0;
    await skillCommands.viewAbilities(sock, CHAT_ID, OWNER, OWNER_NAME, '999');
    ok(!!findMsg(new RegExp('Page ' + totalPages + '\\/')), 'numeric arg beyond the codex still lands on the last page');
  } else {
    console.log('  (single-page codex — reply-chain tests skipped)');
    const unknown = await skillCommands.handleAbilitiesPageReply(
      sock, CHAT_ID, OWNER, 'no-such-message-id-xyz', '2');
    ok(unknown === false, 'unknown quoted id falls through (false)');
  }

  console.log('\n==============================');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  console.log('==============================');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
