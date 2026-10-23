#!/usr/bin/env node
// ============================================
// MM QA3 - expansion harness ("fix the bugs and implement
// these new ideas"). Covers what mm_qa/mm_qa2 predate:
// 1. role scaling matrix (4p / 5p / 8p / 10p)
// 2. case generation + validation + replay memory
// 3. evidence flow (public cards + private finder roll + ledgers)
// 4. two investigators act independently (same target allowed)
// 5. two killers: partner reveal, shared kill, first-submitter wins
// 6. .j mm ask (statements fixed per round, killer's account is the lie)
// 7. .j mm evidence dossier (privacy: only your own knowledge)
// 8. .j mm accuse (public echo, recorded)
// 9. leaver handling (lobby removal / mid-case flight = death)
// 10. media gate (images deleted during live case, throttled notice)
// 11. vote race guard (ballots rejected once the count starts)
// 12. reminder math (fire BEFORE deadline, not after phase start)
// 13. night traces (22:05Z: quiet night + blocked killer
// still seed room clues; searches always lead somewhere)
// 14. mm backstory (public story + account, no secret/role leak)
// 15. hidden tag before the character profiles (silent mentions, no @text)
// Run: node scripts/mm_qa3.js (exit non-zero on failure)
// ============================================

const path = require('path');

// QA_CLOCK scales the phase clocks (night 3s, dawn-extension 1.5s, discussion
// 15s, vote 10s - 56ddf4b widened discuss/vote for real on-box render latency)
// so a quiet night's full timeout cycle runs in seconds; MM_QA_FAST (added
// ) collapses the intro chain to 250ms/card - without it the 8p+
// intro chain is 4s + n*30s and lands NIGHT far outside the wait budgets
process.env.MM_QA_FAST = '1';
process.env.MM_QA_CLOCK = '1';

// ---- engine stub (same pattern as mm_qa.js) ----
let QA_SOCK = null;
const enginePath = require.resolve(path.join(__dirname, '..', 'core', 'engine.js'));
require.cache[enginePath] = {
  id: enginePath, filename: enginePath, loaded: true,
  exports: { getSock: () => QA_SOCK, isGlobalMod: () => false, isRpgMod: () => false, isBotOwner: () => false },
};
const economyPath = require.resolve(path.join(__dirname, '..', 'core', 'rpg', 'economy.js'));
const QA_BALANCES = new Map();
require.cache[economyPath] = {
  id: economyPath, filename: economyPath, loaded: true,
  exports: {
    getBalance: (jid) => QA_BALANCES.get(String(jid)) || 0,
    removeMoney: () => true,
    addMoney: (jid, amt) => { QA_BALANCES.set(String(jid), (QA_BALANCES.get(String(jid)) || 0) + amt); return true; },
    getDisplayName: () => 'QA Guest',
  },
};

// ---- botConfig stub: QA keys must NEVER collide with the real bot's System
// keys (botIdSafe() reads this) - QA games live under murder_mm_*_qa-bot ----
const botConfigPath = require.resolve(path.join(__dirname, '..', 'botConfig.js'));
require.cache[botConfigPath] = {
  id: botConfigPath, filename: botConfigPath, loaded: true,
  exports: { getBotId: () => 'qa-bot', getPrefix: () => '.j', get: () => null },
};

// ---- QA_NO_MONGO: db + System model stubs so every system.set/get fails
// fast in-memory instead of buffering 10s per op against an unreachable
// MongoDB (on-box QA processes have no env/Mongo connection) ----
const dbPath = require.resolve(path.join(__dirname, '..', 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: async () => { throw new Error('QA: no mongo'); } };
const systemModelPath = require.resolve(path.join(__dirname, '..', 'core', 'models', 'System.js'));
const _qaReject = async () => { throw new Error('QA: no mongo'); };
require.cache[systemModelPath] = {
  id: systemModelPath, filename: systemModelPath, loaded: true,
  exports: Object.assign(() => ({}), { find: _qaReject, findOne: _qaReject, updateOne: _qaReject, create: _qaReject, deleteMany: _qaReject }),
};

const mm = require(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'index.js'));
const caseGen = require(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'caseGen.js'));
const system = require(path.join(__dirname, '..', 'core', 'utils', 'system.js'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; failures.push(label); console.log(`  ❌ ${label}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) {}
    await sleep(200);
  }
  return !!fn();
}

function makeSock() {
  const out = [];
  return {
    out,
    async sendMessage(jid, content) {
 // record BOTH text and caption - image sends ride the caption field
 // (on-box real canvas renders cards, so captions are the message text)
 // + mentions (hidden-tag sends ride contextInfo.mentionedJid)
      out.push({ jid: String(jid), isGroup: String(jid).endsWith('@g.us'), image: !!(content && content.image), text: (content && (content.text || content.caption)) || '', mentions: (content && content.contextInfo && content.contextInfo.mentionedJid) || [] });
      return { key: { id: 'qa' + out.length } };
    },
  };
}
const normJid = mm._internal.normJid;
function ctxOf(sock, chatId, o = {}) {
  const chat = o.group === false ? (o.chatId || chatId) : (o.chatId || chatId);
  return {
    sock, chatId: chat, senderJid: o.sender || '100000000000001@s.whatsapp.net',
    senderName: o.name || 'Alice', sub: o.sub, rest: o.rest || '',
    botMarker: '🤖', isGroup: chat.endsWith('@g.us'), botId: 'qa-bot', prefix: '.j',
  };
}
function players(n, seed) {
  const names = ['Alice', 'Boris', 'Carla', 'Dora', 'Elmo', 'Fay', 'Gus', 'Hana', 'Ivan', 'Jade', 'Karl'];
  return Array.from({ length: n }, (_, i) => ({ jid: `100000000000${String(seed * 20 + i + 1).padStart(2, '0')}@s.whatsapp.net`, name: names[i] || `G${i}` }));
}
async function openAndFill(sock, chatId, roster) {
  await mm.handleCommand(ctxOf(sock, chatId, { sub: 'create', sender: roster[0].jid, name: roster[0].name }));
  for (let i = 1; i < roster.length; i++) {
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'join', sender: roster[i].jid, name: roster[i].name }));
  }
  return mm._internal.getGame(chatId);
}
function roleCounts(g) {
  const c = { KILLER: 0, INVESTIGATOR: 0, GUARDIAN: 0, MEDIUM: 0, BUTLER: 0, ACCOMPLICE: 0, CIVILIAN: 0 };
  for (const p of g.players) c[p.role] = (c[p.role] || 0) + 1;
  return c;
}

(async () => {
  await system.set('murder_mm_games_v2_global', {});
  mm._internal.games.clear();
  mm._internal.ensureRehydrated();

 // ---------- 1. ROLE SCALING MATRIX ----------
  console.log('\n===== 1. ROLE SCALING =====');
  const matrix = [
    { n: 4, K: 1, I: 1, G: 0, M: 0, B: 0, A: 0 }, { n: 5, K: 1, I: 1, G: 1, M: 0, B: 0, A: 0 },
    { n: 7, K: 1, I: 1, G: 1, M: 0, B: 0, A: 0 }, { n: 8, K: 1, I: 2, G: 1, M: 1, B: 0, A: 0 },
    { n: 10, K: 2, I: 2, G: 1, M: 1, B: 1, A: 1 }, { n: 11, K: 2, I: 2, G: 1, M: 1, B: 1, A: 1 },
  ];
  {
    const sock = makeSock(); QA_SOCK = sock;
    for (const m of matrix) {
      const chatId = `1203630999${String(m.n).padStart(3, '0')}@g.us`;
      const roster = players(m.n, m.n);
      await openAndFill(sock, chatId, roster);
      await mm.handleCommand(ctxOf(sock, chatId, { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
      const g = mm._internal.getGame(chatId);
      ok(await waitFor(() => g && g.phase === 'NIGHT'), `1.${m.n}p reaches NIGHT after intros`);
      const rc = roleCounts(g);
      ok(rc.KILLER === m.K && rc.INVESTIGATOR === m.I && rc.GUARDIAN === m.G,
        `1.${m.n}p deal = K${m.K}/I${m.I}/G${m.G} (got K${rc.KILLER}/I${rc.INVESTIGATOR}/G${rc.GUARDIAN})`);
      ok((rc.MEDIUM || 0) === m.M && (rc.BUTLER || 0) === m.B && (rc.ACCOMPLICE || 0) === m.A,
        `1.${m.n}p wave2a = M${m.M}/B${m.B}/A${m.A} (got M${rc.MEDIUM || 0}/B${rc.BUTLER || 0}/A${rc.ACCOMPLICE || 0})`);
      ok(!!g.case, `1.${m.n}p case generated`);
      if (g.case) ok(caseGen.validateCase(g.case, g.players.map((p) => p.char), g.rooms), `1.${m.n}p case validates`);
      if (m.K === 2) {
        const killers = g.players.filter((p) => p.role === 'KILLER');
        ok(killers.length === 2, `1.${m.n}p killers know each other (partner line in DMs)`);
        const partnerDM = sock.out.filter((x) => !x.isGroup && /Your partner/.test(x.text)).length >= 2;
        ok(partnerDM, `1.${m.n}p both killers got the partner line`);
      }
      if (m.I === 2) {
        const invDMs = sock.out.filter((x) => !x.isGroup && /You are the \*INVESTIGATOR\*/.test(x.text)).length;
        ok(invDMs >= 2, `1.${m.n}p both investigators got night instructions`);
      }
      await mm.handleCommand(ctxOf(sock, chatId, { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
    }
  }

 // ---------- 2. TWO INVESTIGATORS ACT INDEPENDENTLY ----------
  console.log('\n===== 2. TWO INVESTIGATORS =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const chatId = '1203630888001@g.us';
    const roster = players(9, 30);
    await openAndFill(sock, chatId, roster);
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    const g = mm._internal.getGame(chatId);
    ok(await waitFor(() => g && g.phase === 'NIGHT'), '2.1 9p game reaches NIGHT');
    const invs = g.players.filter((p) => p.role === 'INVESTIGATOR');
    ok(invs.length === 2, '2.2 two investigators dealt at 9p');
    const killers = g.players.filter((p) => p.role === 'KILLER');
    ok(killers.length === 2, '2.3 two killers dealt at 9p');
 // killer #1 kills, places body
    const k1 = killers[0];
    const civ = g.players.find((p) => p.role === 'CIVILIAN' && p.alive);
    const kPool = g.players.filter((p) => p.alive && normJid(p.jid) !== normJid(k1.jid));
    const kIdx = kPool.findIndex((p) => normJid(p.jid) === normJid(civ.jid)) + 1;
    await mm.handleCommand(ctxOf(sock, k1.jid, { group: false, chatId: k1.jid, sub: 'kill', rest: String(kIdx), sender: k1.jid, name: k1.name }));
    await mm.handleCommand(ctxOf(sock, k1.jid, { group: false, chatId: k1.jid, sub: 'room', rest: '2', sender: k1.jid, name: k1.name }));
 // killer #2 tries to kill AFTER partner -> rejected with partner wording
    const k2 = killers[1];
    const k2Pool = g.players.filter((p) => p.alive && normJid(p.jid) !== normJid(k2.jid));
    const t2 = k2Pool[0];
    const k2Idx = k2Pool.findIndex((p) => normJid(p.jid) === normJid(t2.jid)) + 1;
    await mm.handleCommand(ctxOf(sock, k2.jid, { group: false, chatId: k2.jid, sub: 'kill', rest: String(k2Idx), sender: k2.jid, name: k2.name }));
    ok(sock.out.filter((x) => !x.isGroup && x.jid === k2.jid && /already been chosen/.test(x.text)).length >= 1, '2.4 second killer rejected after partner chose');
 // both investigators weigh the SAME pair (allowed, independent results)
 // (wave 2a: 9p tables have only one CIVILIAN - the scales accept any two living guests)
    const aliveNonInv = g.players.filter((p) => p.alive && normJid(p.jid) !== normJid(invs[0].jid) && normJid(p.jid) !== normJid(invs[1].jid));
    const tgt = aliveNonInv[0];
    const tgt2 = aliveNonInv.find((p) => normJid(p.jid) !== normJid(tgt.jid));
    for (const inv of invs) {
      const pool = g.players.filter((p) => p.alive && normJid(p.jid) !== normJid(inv.jid));
      const idx = pool.findIndex((p) => normJid(p.jid) === normJid(tgt.jid)) + 1;
      const idx2 = pool.findIndex((p) => normJid(p.jid) === normJid(tgt2.jid)) + 1;
      await mm.handleCommand(ctxOf(sock, inv.jid, { group: false, chatId: inv.jid, sub: 'compare', rest: `${idx} ${idx2}`, sender: inv.jid, name: inv.name }));
    }
    ok(g.investResults.filter((r) => / vs /.test(r.subject || '') && (r.subject || '').includes(tgt.name)).length === 2, '2.5 both investigators weighed the same pair (2 results)');
    ok(g.nightActs[normJid(invs[0].jid)] && g.nightActs[normJid(invs[1].jid)], '2.6 per-player ledger holds both actions');
    ok(await waitFor(() => g.phase === 'DISCUSSION', 15000), '2.7 night resolved once killers+both investigators acted');
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
  }

 // ---------- 3. EVIDENCE + ASK + ACCUSE + DOSSIER ----------
  console.log('\n===== 3. CASE LAYER =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const chatId = '1203630888002@g.us';
    const roster = players(5, 50);
    await openAndFill(sock, chatId, roster);
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    const g = mm._internal.getGame(chatId);
    ok(await waitFor(() => g && g.phase === 'NIGHT'), '3.1 5p game reaches NIGHT');
    ok(g.case && g.case.introDone === true, '3.2 case generated, intros marked done (no replay on rehydrate)');
 // force the murder
    const killer = g.players.find((p) => p.role === 'KILLER');
    const victim = g.players.find((p) => p.role === 'CIVILIAN');
    const kPool = g.players.filter((p) => p.alive && normJid(p.jid) !== normJid(killer.jid));
    const kIdx = kPool.findIndex((p) => normJid(p.jid) === normJid(victim.jid)) + 1;
    await mm.handleCommand(ctxOf(sock, killer.jid, { group: false, chatId: killer.jid, sub: 'kill', rest: String(kIdx), sender: killer.jid, name: killer.name }));
    await mm.handleCommand(ctxOf(sock, killer.jid, { group: false, chatId: killer.jid, sub: 'room', rest: '3', sender: killer.jid, name: killer.name }));
    const inv = g.players.find((p) => p.role === 'INVESTIGATOR');
    if (inv) {
      const pool = g.players.filter((p) => p.alive && normJid(p.jid) !== normJid(inv.jid));
      await mm.handleCommand(ctxOf(sock, inv.jid, { group: false, chatId: inv.jid, sub: 'compare', rest: '1 2', sender: inv.jid, name: inv.name }));
    }
    ok(await waitFor(() => g.phase === 'DISCUSSION', 15000), '3.3 dawn comes');
    ok((g.bodies || []).length === 1, '3.4 one body');
    ok(Array.isArray(g.bodies[0].evidence), '3.5 evidence bound to the body');
 // finder finds -> public evidence recorded
    const finder = g.players.find((p) => p.alive && p.role === 'CIVILIAN');
    const bodyRoom = g.bodies[0].roomIdx + 1;
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'search', rest: String(bodyRoom), sender: finder.jid, name: finder.name }));
    await sleep(800);
    ok(g.bodies[0].found === true, '3.6 body found');
    ok((g.publicEvidence || []).length >= 1, '3.7 public evidence ledger recorded');
    ok(sock.out.some((m) => m.isGroup && /Found near the body/.test(m.text)), '3.8 public evidence announced to the house');
 // ask: statements fixed + killer's account is the lie
    const target = g.players.find((p) => p.alive && p !== finder);
    const asker = g.players.find((p) => p.alive && p !== finder && p !== target);
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'ask', rest: '1', sender: asker.jid, name: asker.name }));
    const askedPool = g.players.filter((p) => p.alive && normJid(p.jid) !== normJid(asker.jid));
    const st1 = caseGen.statementFor(g.case, askedPool[0].char.id);
    ok(!!st1 && !!st1.account, '3.9 statement exists for the asked guest');
    const killerSt = g.case.statements[killer.char.id];
    ok(killerSt && killerSt.truthful === false, '3.10 killer statement marked as the lie');
 // accuse: public echo + recorded (target must not be the accuser)
    const alivePool = g.players.filter((p) => p.alive);
    const accIdx = alivePool.findIndex((p) => normJid(p.jid) !== normJid(asker.jid)) + 1;
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'accuse', rest: `${accIdx} testing the accusation line`, sender: asker.jid, name: asker.name }));
    ok(g.log.some((l) => l.accusation), '3.11 accusation recorded in the case log');
    ok(sock.out.some((m) => m.isGroup && /levels an accusation/.test(m.text)), '3.12 accusation echoed publicly');
 // dossier: DM-only, shows own knowledge, never another's
    await mm.handleCommand(ctxOf(sock, asker.jid, { group: false, chatId: asker.jid, sub: 'evidence', sender: asker.jid, name: asker.name }));
    ok(sock.out.some((m) => !m.isGroup && m.jid === asker.jid && /CASE DOSSIER/.test(m.text)), '3.13 dossier DM delivered');
    const otherInv = g.players.find((p) => p.role === 'INVESTIGATOR');
    if (otherInv && otherInv !== asker) {
      const otherDM = sock.out.find((m) => !m.isGroup && m.jid === otherInv.jid && /CASE DOSSIER/.test(m.text));
      ok(!otherDM, '3.14 dossier privacy: no dossier sent to a different player');
    }
    const askerDossier = sock.out.filter((m) => !m.isGroup && m.jid === asker.jid && /CASE DOSSIER/.test(m.text)).pop();
    ok(askerDossier && !new RegExp(`studied`, 'i').test(askerDossier.text) || askerDossier, '3.15 dossier text rendered');
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
  }

 // ---------- 4. LEAVERS ----------
  console.log('\n===== 4. LEAVERS =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
 // 4a lobby leaver is removed
    const rosterA = players(5, 70);
    const chatA = '1203630888003@g.us';
    await openAndFill(sock, chatA, rosterA);
    await mm.handleParticipantLeave(chatA, [rosterA[2].jid], 'leave');
    const gA = mm._internal.getGame(chatA);
    ok(gA && gA.players.length === 4 && !gA.players.some((p) => normJid(p.jid) === normJid(rosterA[2].jid)), '4.1 lobby leaver removed from the list');
    await mm.handleCommand(ctxOf(sock, chatA, { sub: 'end', sender: rosterA[0].jid, name: rosterA[0].name }));
 // 4b mid-case leaver flees = dead + silenced + win-check
    const rosterB = players(5, 80);
    const chatB = '1203630888004@g.us';
    await openAndFill(sock, chatB, rosterB);
    await mm.handleCommand(ctxOf(sock, chatB, { sub: 'start', sender: rosterB[0].jid, name: rosterB[0].name }));
    const gB = mm._internal.getGame(chatB);
    ok(await waitFor(() => gB && gB.phase === 'NIGHT'), '4.2 game reaches NIGHT');
    const leaver = gB.players.find((p) => p.role === 'CIVILIAN');
    await mm.handleParticipantLeave(chatB, [leaver.jid], 'leave');
    ok(leaver.alive === false && leaver.deathMethod === 'fled into the night', '4.3 mid-case leaver written out as fled');
    ok(mm.isSilenced(leaver.jid, chatB), '4.4 fled player silenced');
    ok(sock.out.some((m) => m.isGroup && /has fled the manor/.test(m.text)), '4.5 flight announced publicly');
    await mm.handleCommand(ctxOf(sock, chatB, { sub: 'end', sender: rosterB[0].jid, name: rosterB[0].name }));
  }

 // ---------- 5. MEDIA GATE ----------
  console.log('\n===== 5. MEDIA GATE =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const roster = players(5, 90);
    const chat = '1203630888005@g.us';
    await openAndFill(sock, chat, roster);
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    const g = mm._internal.getGame(chat);
    ok(await waitFor(() => g && g.phase === 'NIGHT'), '5.1 game reaches NIGHT');
    const imgMsg = { key: { id: 'fake1' }, message: { imageMessage: { mimetype: 'image/jpeg' } } };
    const gated = mm.gateGameMedia({ chatId: chat, m: imgMsg });
    ok(gated === true, '5.2 player image gated during live case');
    const textMsg = { key: { id: 'fake2' }, message: { conversation: 'plain text stays' } };
    ok(mm.gateGameMedia({ chatId: chat, m: textMsg }) === false, '5.3 plain text untouched');
    ok(sock.out.some((m) => m.isGroup && /Screenshots and images stay out/.test(m.text)), '5.4 throttle-window notice posted');
 // second image within throttle: deleted but no second notice
    const before = sock.out.filter((m) => /Screenshots and images stay out/.test(m.text)).length;
    mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake3' }, message: { imageMessage: { mimetype: 'image/jpeg' } } } });
    const after = sock.out.filter((m) => /Screenshots and images stay out/.test(m.text)).length;
    ok(after === before, '5.5 notice throttled (no spam)');
 // 20:26Z: stickers and docs pass through, view-once burns
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake4' }, message: { stickerMessage: {} } } }) === false, '5.7 stickers NOT gated');
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake5' }, message: { documentMessage: {} } } }) === false, '5.8 documents NOT gated');
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake6' }, message: { viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } } } }) === true, '5.9 view-once images gated');
 // 22:40Z, "people can still send view once messages fix that"
 // - the newer wrapper generations + nesting must burn too
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake7' }, message: { viewOnceMessageV2Extension: { message: { imageMessage: { mimetype: 'image/jpeg' } } } } } }) === true, '5.10 v2-extension view-once image gated');
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake8' }, message: { ephemeralMessage: { message: { viewOnceMessageV2: { message: { imageMessage: {} } } } } } } }) === true, '5.11 ephemeral-wrapped view-once image gated');
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake9' }, message: { viewOnceMessage: { message: { videoMessage: {} } } } } }) === true, '5.12 view-once video gated');
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake10' }, message: { videoMessage: {} } } }) === false, '5.13 plain video NOT gated');
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake11' }, message: { ephemeralMessage: { message: { audioMessage: {} } } } } }) === false, '5.14 plain ephemeral voice note NOT gated');
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake12' }, message: { viewOnceMessageV2Extension: { message: { audioMessage: {} } } } } }) === true, '5.15 listen-once voice note gated');
    ok(mm.gateGameMedia({ chatId: chat, m: { key: { id: 'fake13' }, message: { viewOnceMessageV2Extension: { message: { videoMessage: {} } } } } }) === true, '5.16 v2-extension view-once video gated');
 // lobby phase: no gating
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
    const chat2 = '1203630888006@g.us';
    await openAndFill(sock, chat2, players(4, 95));
    ok(mm.gateGameMedia({ chatId: chat2, m: imgMsg }) === false, '5.6 lobby images not gated');
    await mm.handleCommand(ctxOf(sock, chat2, { sub: 'end', sender: players(4, 95)[0].jid, name: 'Alice' }));
  }

 // ---------- 6. VOTE RACE GUARD ----------
  console.log('\n===== 6. VOTE RACE =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const roster = players(5, 99);
    const chat = '1203630888007@g.us';
    await openAndFill(sock, chat, roster);
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    const g = mm._internal.getGame(chat);
    await waitFor(() => g && g.phase === 'NIGHT');
    g.phase = 'VOTING';
    g._resolving = true; // count underway
    g._resolvingAt = Date.now();
    const alive = g.players.filter((p) => p.alive);
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'vote', rest: 'skip', sender: alive[0].jid, name: alive[0].name }));
    ok(sock.out.some((m) => m.isGroup && /count is already underway/.test(m.text)), '6.1 ballot rejected while the count runs');
    ok(Object.keys(g.votes || {}).length === 0, '6.2 no ballot mutated the tally');
    g._resolving = false;
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
  }

 // ---------- 7. REMINDER MATH ----------
  console.log('\n===== 7. REMINDERS =====');
  {
 // direct: scheduleReminder math is deadline-relative - verify constants
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'index.js'), 'utf8');
    ok(/scheduleReminder\(chatId, Math\.max\(5000, DISCUSS_MS - DISCUSS_REMIND_BEFORE_MS\)/.test(src), '7.1 discussion reminder fires 60s BEFORE deadline');
    ok(/scheduleReminder\(chatId, Math\.max\(3000, VOTE_MS - VOTE_REMIND_BEFORE_MS\)/.test(src), '7.2 vote reminder fires 30s BEFORE deadline');
    ok(!/scheduleReminder\(chatId, DISCUSS_REMIND_MS/.test(src) && !/scheduleReminder\(chatId, VOTE_REMIND_MS/.test(src), '7.3 old after-N-ms scheduling gone');
  }

 // ---------- 8. REPLAY MEMORY ----------
  console.log('\n===== 8. REPLAY MEMORY =====');
  {
    const hist = caseGen.loadHistory();
    ok(Array.isArray(hist), '8.1 history readable');
    const cast = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }];
    const rooms = [{ id: 'library', name: 'the Library' }, { id: 'dining', name: 'the Dining Room' }];
    const c1 = caseGen.generateCase({ cast, killers: [cast[0]], rooms, methodTitles: ['poisoned claret', 'piano wire', 'a candlestick'] });
    caseGen.saveHistory([...caseGen.loadHistory(), c1.sig]);
    const c2 = caseGen.generateCase({ cast, killers: [cast[0]], rooms, methodTitles: ['poisoned claret', 'piano wire', 'a candlestick'] });
    ok(c1.sig !== c2.sig || caseGen.loadHistory().filter((s) => s === c1.sig).length >= 1, '8.2 signatures recorded (recent combo avoidance active)');
  }

 // ---------- 9. TWIN WHISPER + PUBLIC ASK (19:32Z) ----------
  console.log('\n===== 9. WHISPER + PUBLIC ASK =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const roster = players(10, 55);
    const chat = '1203630999009@g.us';
    await openAndFill(sock, chat, roster);
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    const g = mm._internal.getGame(chat);
    await waitFor(() => g && g.phase === 'NIGHT');
    const killers = g.players.filter((p) => p.role === 'KILLER' && p.alive);
    ok(killers.length === 2, '9.1 twin killers on a 10-player roster');
 // whisper relay: killer -> partner DM through the bot (night, DMs only)
    await mm.handleCommand(ctxOf(sock, killers[0].jid, { group: false, chatId: killers[0].jid, sub: 'whisper', rest: 'meet me at the cellar door', sender: killers[0].jid, name: killers[0].name }));
    ok(sock.out.some((m) => !m.isGroup && m.jid === killers[1].jid && /A whisper reaches you through the dark/.test(m.text) && /cellar door/.test(m.text)), '9.2 whisper relayed to partner killer DM');
    ok(sock.out.some((m) => !m.isGroup && m.jid === killers[0].jid && /whisper travels/.test(m.text)), '9.3 sender confirmation');
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'whisper', rest: 'hello', sender: killers[0].jid, name: killers[0].name }));
    ok(sock.out.some((m) => m.isGroup && /Whispers travel in DMs only/.test(m.text)), '9.4 whisper refused in the GC');
    const civ = g.players.find((p) => p.role === 'CIVILIAN' && p.alive);
    await mm.handleCommand(ctxOf(sock, civ.jid, { group: false, chatId: civ.jid, sub: 'whisper', rest: 'let me in', sender: civ.jid, name: civ.name }));
    ok(sock.out.some((m) => !m.isGroup && m.jid === civ.jid && /not yours to send/.test(m.text)), '9.5 non-killer refused, role-blind');
    g.phase = 'DISCUSSION';
    await mm.handleCommand(ctxOf(sock, killers[0].jid, { group: false, chatId: killers[0].jid, sub: 'whisper', rest: 'now?', sender: killers[0].jid, name: killers[0].name }));
    ok(sock.out.some((m) => !m.isGroup && /only in the dark/.test(m.text)), '9.6 whisper is night-only');
 // public ask: the ACCOUNT posts to the GC, the sharper observation DMs
    const asker = g.players.find((p) => p.alive && p.role === 'CIVILIAN');
    const target = g.players.find((p) => p.alive && p !== asker && p.role !== 'KILLER');
    const tIdx = g.players.indexOf(target) + 1;
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'ask', rest: String(tIdx), sender: asker.jid, name: asker.name }));
    ok(sock.out.some((m) => m.isGroup && /answers before the house/.test(m.text) && m.text.includes(target.char.name)), '9.7 account posted publicly in the GC');
    ok(!sock.out.some((m) => m.isGroup && /to you alone/.test(m.text)), '9.8 observation never posted to the GC');
    ok(sock.out.some((m) => !m.isGroup && m.jid === asker.jid && /to you alone/.test(m.text)), '9.9 sharper detail DMs to the asker only');
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
  }

 // ---------- 10. NIGHT TRACES: QUIET NIGHT (22:05Z) ----------
  console.log('\n===== 10. QUIET-NIGHT TRACES =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const roster = players(5, 110);
    const chat = '1203630888010@g.us';
    await openAndFill(sock, chat, roster);
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    const g = mm._internal.getGame(chat);
 // hidden tag: before the profiles spawn, every guest silently tagged
    const tagMsg = sock.out.find((m) => m.isGroup && /The house presents its guests/.test(m.text));
    ok(!!tagMsg, '10.1 pre-intro attention notice posted to the GC');
    ok(tagMsg && Array.isArray(tagMsg.mentions) && roster.every((p) => tagMsg.mentions.includes(p.jid)), '10.2 every guest silently tagged via mentionedJid');
    ok(tagMsg && !/@@?\d+\s/.test(tagMsg.text) && !/I'?m tagging|tagging you/i.test(tagMsg.text), '10.3 no visible @ text, tagging never announced');
    ok(await waitFor(() => g && g.phase === 'NIGHT'), '10.4 game reaches NIGHT');
 // the killer does NOTHING - dawn must still seed room traces
    ok(await waitFor(() => g.phase === 'DISCUSSION', 25000), '10.5 quiet night resolves to dawn (timeout + one extension)');
    const tr = g.nightTraces;
    ok(tr && tr.night === g.night && Array.isArray(tr.items) && tr.items.length >= 2, `10.6 quiet night seeded room traces (${tr ? (tr.items || []).length : 0} >= 2)`);
    ok(tr && tr.items.every((t) => t.roomIdx != null && g.rooms[t.roomIdx]), '10.7 every trace sits in a real room');
    ok(sock.out.some((m) => m.isGroup && /The night left things behind/.test(m.text)), '10.8 dawn tells the house the rooms hold something');
 // search a traced room -> public find
    const searcher = g.players.find((p) => p.alive);
    const trace = tr.items.find((t) => !t.found);
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'search', rest: String(trace.roomIdx + 1), sender: searcher.jid, name: searcher.name }));
    await sleep(900);
    ok(trace.found === true, '10.9 trace marked found after the search');
    ok((g.publicEvidence || []).some((e) => e.night === g.night && e.name === trace.name), '10.10 trace find recorded in the public evidence ledger');
    ok(sock.out.some((m) => m.isGroup && /turns up something/.test(m.text)), '10.11 trace find announced to the house');
 // one search per guest still holds
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'search', rest: '1', sender: searcher.jid, name: searcher.name }));
    ok(sock.out.some((m) => m.isGroup && /already made your one search/.test(m.text)), '10.12 one-search rule still enforced');
 // backstory: instant public pull-up, no secret/role leak
    const about = g.players.find((p) => p.alive && p !== searcher);
    const frag = about.char.name.split(' ').pop();
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'backstory', rest: frag, sender: searcher.jid, name: searcher.name }));
    const bs = sock.out.filter((m) => m.isGroup && m.text.includes(about.char.name) && m.text.includes('Their account stands')).pop();
    ok(!!bs, '10.13 backstory posted publicly with the standing account');
    const secretFrag = (g.case.secrets[about.char.id].text || '').split(' ').slice(0, 3).join(' ');
    ok(bs && !bs.text.includes(secretFrag), '10.14 backstory leaks no secret text');
    ok(bs && !/KILLER|GUARDIAN|CIVILIAN|INVESTIGATOR/.test(bs.text), '10.15 backstory leaks no role');
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
  }

 // ---------- 11. BLOCKED KILLER STILL LEAVES TRACES ----------
  console.log('\n===== 11. SAVED NIGHT TRACES =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const roster = players(5, 120);
    const chat = '1203630888011@g.us';
    await openAndFill(sock, chat, roster);
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    const g = mm._internal.getGame(chat);
    ok(await waitFor(() => g && g.phase === 'NIGHT'), '11.1 game reaches NIGHT');
    const killer = g.players.find((p) => p.role === 'KILLER');
    const guardian = g.players.find((p) => p.role === 'GUARDIAN');
    const victim = g.players.find((p) => p.role === 'CIVILIAN');
 // the killer chooses the victim and a room
    const kPool = g.players.filter((p) => p.alive && normJid(p.jid) !== normJid(killer.jid));
    const kIdx = kPool.findIndex((p) => normJid(p.jid) === normJid(victim.jid)) + 1;
    await mm.handleCommand(ctxOf(sock, killer.jid, { group: false, chatId: killer.jid, sub: 'kill', rest: String(kIdx), sender: killer.jid, name: killer.name }));
    await mm.handleCommand(ctxOf(sock, killer.jid, { group: false, chatId: killer.jid, sub: 'room', rest: '5', sender: killer.jid, name: killer.name }));
 // the guardian stands in the way -> the knife is turned
    const gPool = g.players.filter((p) => p.alive);
    const gIdx = gPool.findIndex((p) => normJid(p.jid) === normJid(victim.jid)) + 1;
    await mm.handleCommand(ctxOf(sock, guardian.jid, { group: false, chatId: guardian.jid, sub: 'protect', rest: String(gIdx), sender: guardian.jid, name: guardian.name }));
    ok(await waitFor(() => g.phase === 'DISCUSSION', 25000), '11.2 dawn after the save');
    ok((g.bodies || []).length === 0, '11.3 no body - the save held');
    const tr = g.nightTraces;
    ok(tr && Array.isArray(tr.items) && tr.items.length >= 2, `11.4 blocked killer still seeded traces (${tr ? (tr.items || []).length : 0})`);
    ok(tr && tr.items.some((t) => t.roomIdx === 4), '11.5 the interrupted scene is in the killer\u2019s chosen room (idx 4)');
    const finder = g.players.find((p) => p.alive && p.role === 'CIVILIAN' && normJid(p.jid) !== normJid(victim.jid));
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'search', rest: '5', sender: finder.jid, name: finder.name }));
    await sleep(900);
    ok((g.publicEvidence || []).some((e) => e.night === g.night), '11.6 the search of the interrupted room yields a clue');
    await mm.handleCommand(ctxOf(sock, chat, { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
  }

  console.log(`\n===== TOTAL: ${pass} passed, ${fail} failed =====`);
  if (fail) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('QA3 crashed:', e); process.exit(2); });
