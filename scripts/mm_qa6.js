#!/usr/bin/env node
// ============================================
// MURDER MYSTERY - QA SUITE 6 (Wave 2c: the house's seals)
// 3 active seals per case (one per tier) + visit discovery + find-card
// + mm unlock (two tries, jam until next night) + tiered Zeni
// + coin skeleton key + AFK stumble + dawn flavor line
// Offline, mock sock, stub economy. Run: node scripts/mm_qa6.js
// Exits non-zero on any failed assertion.
// NOTE: the find-card image row is dual-path - on-box real canvas asserts the
// IMAGE DM; sandbox mock canvas (drawImage missing) accepts the text fallback.
// ============================================

process.env.MM_QA_FAST = '1';
process.env.MM_QA_CLOCK = '1';

const path = require('path');

// ---- engine stub ----
let QA_SOCK = null;
const enginePath = require.resolve(path.join(__dirname, '..', 'core', 'engine.js'));
require.cache[enginePath] = {
  id: enginePath, filename: enginePath, loaded: true,
  exports: {
    getSock: () => QA_SOCK,
    isGlobalMod: () => false, isRpgMod: () => false, isBotOwner: () => false,
  },
};

// ---- economy stub (records payouts so seals' pay can be asserted) ----
const economyPath = require.resolve(path.join(__dirname, '..', 'core', 'rpg', 'economy.js'));
const QA_BALANCES = new Map();
const QA_PAYMENTS = [];
let QA_PAY_OK = true;
require.cache[economyPath] = {
  id: economyPath, filename: economyPath, loaded: true,
  exports: {
    getBalance: (jid) => QA_BALANCES.get(String(jid)) || 0,
    removeMoney: () => true,
    addMoney: (jid, amount, reason) => {
      QA_PAYMENTS.push({ jid: String(jid), amount, reason: String(reason || '') });
      return QA_PAY_OK;
    },
    getDisplayName: () => 'QA Guest',
  },
};

// ---- botConfig stub ----
const botConfigPath = require.resolve(path.join(__dirname, '..', 'botConfig.js'));
require.cache[botConfigPath] = {
  id: botConfigPath, filename: botConfigPath, loaded: true,
  exports: { getBotId: () => 'qa-bot', getPrefix: () => '.j', get: () => null },
};

// ---- db/System stubs ----
const dbPath = require.resolve(path.join(__dirname, '..', 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: async () => { throw new Error('QA: no mongo'); } };
const systemModelPath = require.resolve(path.join(__dirname, '..', 'core', 'models', 'System.js'));
const _qaReject = async () => { throw new Error('QA: no mongo'); };
require.cache[systemModelPath] = {
  id: systemModelPath, filename: systemModelPath, loaded: true,
  exports: Object.assign(() => ({}), { find: _qaReject, findOne: _qaReject, updateOne: _qaReject, create: _qaReject, deleteMany: _qaReject }),
};

const mm = require(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'index.js'));
const cases = require(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'cases.js'));

const PREFIX = '.j';
const MARKER = '🤖';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; failures.push(label); console.log(`  ❌ ${label}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function makeSock() {
  const out = [];
  return {
    out,
    async sendMessage(jid, content) {
      out.push({ jid: String(jid), isGroup: String(jid).endsWith('@g.us'), image: !!content.image, text: content.text || content.caption || '' });
      return { key: { id: `mock-${out.length}` } };
    },
  };
}

const CHAT = '120363026009901@g.us';
const NAMES = ['Vera', 'Wells', 'Xavi', 'Yuri', 'Zola', 'Abel', 'Bree', 'Cleo', 'Duke', 'Enzo', 'Fern'];
function roster(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const jid = `210000000990${String(i + 1).padStart(2, '0')}@s.whatsapp.net`;
    QA_BALANCES.set(jid, 1000000);
    arr.push({ jid, name: `${NAMES[i]}-q6` });
  }
  return arr;
}

function ctxOf(sock, { sender, name, group = true, sub = 'help', rest = '' } = {}) {
  return {
    sock, chatId: CHAT,
    senderJid: sender, senderName: name || 'Guest',
    sub, rest, m: { key: { id: 'qa' } },
    botMarker: MARKER, isGroup: group, botId: 'qa-bot', prefix: PREFIX, isMod: false,
  };
}

function dm(sock, jid, re) { return sock.out.filter((m) => !m.isGroup && m.jid === jid && re.test(m.text)).length; }
function dmImg(sock, jid, re) { return sock.out.filter((m) => !m.isGroup && m.jid === jid && m.image && re.test(m.text)).length; }
function gt(sock, re) { return sock.out.filter((m) => m.isGroup && re.test(m.text)).length; }
function norm(jid) { return String(jid).split('@')[0]; }
function roleOf(g, role) { return g.players.find((p) => p.role === role) || null; }

async function waitPhase(pred, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const g = mm._internal.getGame(CHAT);
    if (g && pred(g)) return g;
    await sleep(300);
  }
  return mm._internal.getGame(CHAT);
}

function sealRoom(g, i) { return g.seals.active[i].roomIdx; }

(async () => {
  console.log('===== WAVE 2C - THE HOUSE\'S SEALS =====');

 // ---------- unit: the seal bank ----------
  console.log('--- unit: seal bank + draw ---');
  ok(Array.isArray(cases.SEALS) && cases.SEALS.length === 13, `U1 seal bank has 13 entries (one per room) [${(cases.SEALS || []).length}]`);
  const roomIds = new Set(cases.ROOMS.map((r) => r.id));
  const sealRoomIds = new Set(cases.SEALS.map((s) => s.roomId));
  ok(roomIds.size === sealRoomIds.size && [...sealRoomIds].every((id) => roomIds.has(id)), 'U2 every room id carries exactly one seal');

 // draw shape over 60 cases: always exactly 3, distinct rooms, in drawn rooms
  let fullSpread = 0;
  for (let i = 0; i < 60; i++) {
    const rooms = cases.drawRooms(6);
    const drawn = new Set(rooms.map((r) => r.id));
    const draw = cases.sealsForRooms(rooms);
    if (i === 0) {
      ok(draw.active.length === 3, 'U3a a case draws exactly 3 active seals');
      ok(draw.active.every((s) => s.roomIdx >= 0 && s.roomIdx < rooms.length), 'U3b every active seal sits in a drawn room');
      ok(new Set(draw.active.map((s) => s.roomIdx)).size === 3, 'U3c no two seals share a room');
      ok(draw.active.every((s) => [1, 2, 3].includes(s.tier)), 'U3d tiers are 1/2/3');
      ok(draw.active.every((s) => drawn.has(rooms[s.roomIdx].id)), 'U3e seal roomIdx maps back into the drawn rooms');
    }
    if (draw.active.length !== 3) ok(false, `U3 draw #${i} produced ${draw.active.length} seals`);
    const tiers = new Set(draw.active.map((s) => s.tier));
    if (tiers.size === 3) fullSpread++;
  }
  ok(fullSpread >= 30, `U4 one-per-tier spread in most draws [${fullSpread}/60]`);

 // lore safety: answers never collide with the cast or the murder methods
  const chars = require(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'characters.js'));
  const bannedWords = new Set();
  for (const c of (chars.CHARACTERS || [])) {
    for (const w of String(c.name || '').toLowerCase().split(/\s+/)) bannedWords.add(w);
    for (const w of String(c.title || '').toLowerCase().split(/[^a-z]+/)) if (w) bannedWords.add(w);
  }
  for (const m of cases.METHODS) {
    for (const w of String(m.title || '').toLowerCase().split(/[^a-z]+/)) if (w) bannedWords.add(w);
  }
  bannedWords.delete('a'); bannedWords.delete('the'); bannedWords.delete('of'); bannedWords.delete('in');
  let loreClean = true;
  for (const s of cases.SEALS) {
    for (const raw of [s.answer, ...(s.aliases || [])]) {
      for (const w of cases.normSealAnswer(raw).split(' ')) {
        if (w && bannedWords.has(w)) { loreClean = false; console.log(`  ⚠ seal ${s.id}: answer word "${w}" collides with cast/method`); }
      }
    }
  }
  ok(loreClean, 'U5 seal answers are house lore - no cast/method word collisions');

  ok(cases.normSealAnswer('  The  Clock! ') === 'clock', 'U6a normalizer: punctuation/articles stripped');
  ok(cases.normSealAnswer('A MUSIC BOX') === 'music box', 'U6b normalizer: case + spacing');
  ok(cases.normSealAnswer('the') === '', 'U6c normalizer: bare article -> empty');

 // ---------- game flow ----------
  console.log('--- game flow: night 1 (meet + jam) ---');
  let sock = makeSock();
  QA_SOCK = sock;
  const R = roster(6); // killer + investigator + guardian + 3 civilians
  mm.init();

  await mm.handleCommand(ctxOf(sock, { sub: 'create', sender: R[0].jid, name: R[0].name }));
  for (let i = 1; i < R.length; i++) {
    await mm.handleCommand(ctxOf(sock, { sub: 'join', sender: R[i].jid, name: R[i].name }));
  }
  await mm.handleCommand(ctxOf(sock, { sub: 'start', sender: R[0].jid, name: R[0].name }));
  let g = await waitPhase((x) => x.phase === 'NIGHT');
  ok(!!g && g.phase === 'NIGHT', 'S0 game reaches NIGHT');
  ok(g.seals && Array.isArray(g.seals.active) && g.seals.active.length === 3, 'S1 case carries 3 active seals');
  ok(Array.isArray(g.sealDawn) && g.sealDawn.length === 0, 'S2 dawn queue starts empty');

  const civ = g.players.find((p) => p.role === 'CIVILIAN');
  const civ2 = g.players.filter((p) => p.role === 'CIVILIAN')[1];
  const civ3 = g.players.filter((p) => p.role === 'CIVILIAN')[2];
  const killer = roleOf(g, 'KILLER');
  ok(!!civ && !!civ2 && !!civ3 && !!killer, 'S3 actors found');

 // R1: civ visits the first sealed room -> meet + find-card + retarget
  const r1 = sealRoom(g, 0) + 1;
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: String(r1), sender: civ.jid, name: civ.name }));
  ok(g.seals.active[0].found === true, 'R1 seal marked found after the visit');
  ok(g.seals.active[0].foundBy.includes(norm(civ.jid)), 'R1 finder recorded on the seal');
  ok(civ.lastSeal === sealRoom(g, 0), 'R1 civ retargeted onto the met seal');
  ok(dm(sock, civ.jid, /wants an answer/), 'R1 visit DM announces the seal');
  const sealDef0 = cases.SEALS.find((s) => s.id === g.seals.active[0].sealId);
  const riddleRe = new RegExp(esc(sealDef0.riddle.slice(0, 24)));
  const imgRow = dmImg(sock, civ.jid, riddleRe) > 0;
  ok(imgRow || dm(sock, civ.jid, riddleRe) > 0, `R1 find-card DM carries the riddle [${imgRow ? 'image' : 'text fallback - mock canvas'}]`);

 // R2: second guest meets the same seal (separate find, still unsolved)
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: String(r1), sender: civ2.jid, name: civ2.name }));
  ok(g.seals.active[0].foundBy.includes(norm(civ2.jid)) && g.seals.active[0].foundBy.length === 2, 'R2 second guest met the same seal');

 // R3: two wrong answers jam the mechanism; further tries refused. Replies are DM-only.
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: 'nonsense one', sender: civ.jid, name: civ.name }));
  ok(g.seals.active[0].attempts === 1, 'R3 first wrong answer recorded');
  ok(dm(sock, civ.jid, /Wrong/), 'R3 wrong-answer DM lands (private)');
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: 'nonsense two', sender: civ.jid, name: civ.name }));
  ok(g.seals.active[0].jammedNight === g.night, 'R3 second wrong answer JAMS the seal for the night');
  ok(dm(sock, civ.jid, /mechanism seizes/), 'R3 jam DM lands');
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: 'nonsense three', sender: civ.jid, name: civ.name }));
  ok(dm(sock, civ.jid, /jammed until tomorrow night/) >= 1, 'R3 attempt on a jammed seal refused');
  ok(QA_PAYMENTS.length === 0, 'R3 no Zeni moved on wrong answers');
  ok(!g.seals.active[0].solved, 'R3 seal still sealed');
  ok(sock.out.filter((m) => m.isGroup && /Wrong|seizes|jammed/.test(m.text)).length === 0, 'R3 unlock replies never touch the group');

 // R4: mm seals re-reads the met riddles privately
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'seals', sender: civ.jid, name: civ.name }));
  ok(dm(sock, civ.jid, /THE HOUSE'S SEALS/), 'R4 mm seals lists met seals in DMs');
  ok(dm(sock, civ.jid, riddleRe) >= 1, 'R4 riddle re-readable');
  ok(dm(sock, civ2.jid, /You have met none yet/) === 0, 'R4 no leak of un-met riddles');

 // ---- dawn 1 (AFK stumbles fire here) -> night 2: jam clears, solves pay ----
  console.log('--- game flow: night 2 (solve + coin) ---');
  g = await waitPhase((x) => x.phase === 'DISCUSSION', 35000);
  ok(!!g && g.phase === 'DISCUSSION', 'W0 dawn 1 reached after the visit night');
  sock = makeSock(); QA_SOCK = sock;
  for (const p of g.players.filter((x) => x.alive)) {
    await mm.handleCommand(ctxOf(sock, { sub: 'vote', rest: 'skip', sender: p.jid, name: p.name }));
  }
  g = await waitPhase((x) => x.phase === 'NIGHT', 30000);
  ok(!!g && g.phase === 'NIGHT', 'N1 night 2 begins');
  ok(g.seals.active[0].attempts === 0, 'N1 jam counter forgives with the new night');

 // R5: correct answer (alias form, messy input) -> solved + tiered Zeni + dawn line
  const aliasForm = (sealDef0.aliases || []).find((a) => cases.normSealAnswer(a) !== cases.normSealAnswer(sealDef0.answer)) || sealDef0.answer;
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: `  ${aliasForm}!!  `, sender: civ.jid, name: civ.name }));
  ok(g.seals.active[0].solved === true && norm(g.seals.active[0].solvedBy) === norm(civ.jid), 'R5 seal solved via alias answer');
  ok(g.seals.active[0].solvedNight === g.night, 'R5 solve recorded on the night');
  const pay0 = cases.SEAL_PAY[g.seals.active[0].tier];
  const payRec = QA_PAYMENTS.find((p) => p.jid === civ.jid);
  ok(!!payRec && payRec.amount === pay0, `R5 house paid ${pay0} Zeni for tier ${g.seals.active[0].tier} [got ${payRec ? payRec.amount : 'none'}]`);
  ok(/house seal solved/.test(payRec ? payRec.reason : ''), 'R5 payout reason tagged for the ledger');
  ok(dm(sock, civ.jid, /THE SEAL OPENS/), 'R5 private solve DM lands');
  ok(Array.isArray(g.sealDawn) && g.sealDawn.length === 1, 'R5 dawn flavor line queued');
  ok(sock.out.filter((m) => m.isGroup && /seal/i.test(m.text) && new RegExp(esc(civ.name)).test(m.text)).length === 0, 'R5 solve is DM-private - the GC never sees the solver');

 // N2: coin opens the second seal outright (visited + coin in pocket)
  const seal2 = g.seals.active.find((s) => !s.solved);
  const def2 = cases.SEALS.find((s) => s.id === seal2.sealId);
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: String(seal2.roomIdx + 1), sender: civ2.jid, name: civ2.name }));
  civ2.items.push('coin');
  QA_PAYMENTS.length = 0;
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: 'coin', sender: civ2.jid, name: civ2.name }));
  ok(seal2.solved === true && seal2.byCoin === true, 'N2 coin opened the seal outright');
  ok(!civ2.items.includes('coin'), 'N2 coin consumed');
  const payRec2 = QA_PAYMENTS.find((p) => p.jid === civ2.jid);
  ok(!!payRec2 && payRec2.amount === cases.SEAL_PAY[seal2.tier], `N2 coin solve still pays tier Zeni [${payRec2 ? payRec2.amount : 'none'}]`);
  ok(dm(sock, civ2.jid, /no answer required/), 'N2 coin DM says no answer required');
  ok(Array.isArray(g.sealDawn) && g.sealDawn.length === 2, 'N2 second dawn line queued');

 // N3: unlock without a met seal guides (fresh target), coin without coin guides
  sock = makeSock(); QA_SOCK = sock;
  g = mm._internal.getGame(CHAT);
  civ3.lastSeal = null; // simulate a guest who has met nothing (AFK placement may have stumbled them otherwise)
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: 'clock', sender: civ3.jid, name: civ3.name }));
  ok(dm(sock, civ3.jid, /met no seal yet/) >= 1, 'N3 unlock with no seal met -> guidance (DM)');
  const seal3 = g.seals.active.find((s) => !s.solved);
  const def3 = cases.SEALS.find((s) => s.id === seal3.sealId);
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: String(seal3.roomIdx + 1), sender: civ3.jid, name: civ3.name }));
  civ3.items = (civ3.items || []).filter((it) => it !== 'coin');
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: 'coin', sender: civ3.jid, name: civ3.name }));
  ok(dm(sock, civ3.jid, /hold no coin/) >= 1, 'N3 coin word without a coin -> guidance, seal untouched');
  ok(!seal3.solved, 'N3 seal stays sealed');

 // N4: economy failure never un-opens a seal - warning rides the DM
  sock = makeSock(); QA_SOCK = sock;
  QA_PAY_OK = false;
  QA_PAYMENTS.length = 0;
  g.sealDawn = []; // simulate a dawn drain between the coin solve and this one
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: def3.answer, sender: civ3.jid, name: civ3.name }));
  ok(seal3.solved === true, 'N4 solve survives an economy failure');
  ok(dm(sock, civ3.jid, /payment failed/), 'N4 payment warning reaches the solver');
  ok(Array.isArray(g.sealDawn) && g.sealDawn.length === 1, 'N4 dawn line queued regardless');
  QA_PAY_OK = true;

 // ---- dawn of night 2: flavor line rides the morning card, name-free ----
  console.log('--- dawn + edges ---');
  sock = makeSock(); QA_SOCK = sock;
  g = mm._internal.getGame(CHAT);
  g.sealDawn = []; // N4's line would ride the NEXT dawn; seed one for this dawn
  g.sealDawn.push(cases.SEALS.find((s) => s.id === sealDef0.id).dawn);
  for (const p of g.players.filter((x) => x.alive)) {
    await mm.handleCommand(ctxOf(sock, { sub: 'vote', rest: 'skip', sender: p.jid, name: p.name }));
  }
  g = await waitPhase((x) => x.phase === 'DISCUSSION', 35000);
  ok(!!g && g.phase === 'DISCUSSION', 'D1 dawn reached after night 2');
  const dl = cases.SEALS.find((s) => s.id === sealDef0.id).dawn;
  ok(gt(sock, new RegExp(esc(dl.slice(0, 24)))) >= 1, 'D1 dawn flavor line visible to the house');
  ok(!new RegExp(esc(civ.name)).test(sock.out.filter((m) => m.isGroup).map((m) => m.text).join('\n')), 'D1 dawn line never names who solved');
  ok(Array.isArray(g.sealDawn) && g.sealDawn.length === 0, 'D1 dawn queue drained after the morning card');

 // D2: solved seal - repeat visit is quiet, unlock says already open
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: String(sealRoom(g, 0) + 1), sender: civ3.jid, name: civ3.name }));
  ok(!g.seals.active[0].foundBy.includes(norm(civ3.jid)), 'D2 solved seal no longer recruits finders');
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: sealDef0.answer, sender: civ.jid, name: civ.name }));
  ok(dm(sock, civ.jid, /already stands open/) >= 1, 'D2 unlock on a solved seal says so');

 // D3: phase gate - unlock refused outside night/discussion (voting)
  g.phase = 'VOTING';
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'unlock', rest: 'clock', sender: civ2.jid, name: civ2.name }));
  ok(dm(sock, civ2.jid, /seals keep their own hours/) >= 1, 'D3 unlock refused outside night/daylight');
  g.phase = 'DISCUSSION';

 // D4: AFK stumble - meetSeal fires for an unplaced wanderer (resolveNight path)
  const stumbler = g.players.find((p) => p.alive && p.lastSeal == null);
  if (stumbler) {
    const sEntry = g.seals.active.find((s) => !s.solved && !(s.foundBy || []).includes(norm(stumbler.jid)));
    if (sEntry) {
      const met = mm._internal.meetSeal(g, stumbler, sEntry.roomIdx, norm(stumbler.jid));
      ok(!!met && met.wasNew === true && stumbler.lastSeal === sEntry.roomIdx, 'D4 AFK stumble: meetSeal marks found + retargets');
      ok(sEntry.foundBy.includes(norm(stumbler.jid)), 'D4 stumble recorded on the seal');
      ok(!!met.def, 'D4 stumble resolves the seal definition');
    } else {
      ok(true, 'D4 no unsolved un-met seal left - stumble row vacuous this run');
    }
  } else {
    ok(true, 'D4 no AFK candidate - stumble row vacuous this run');
  }

 // cleanup: close the case
  await mm.handleCommand(ctxOf(sock, { sub: 'end', sender: R[0].jid, name: R[0].name }));

  console.log(`\n===== mm_qa6: ${pass} passed, ${fail} failed =====`);
  if (failures.length) { for (const f of failures) console.log(`  ✖ ${f}`); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('qa6 fatal:', e); process.exit(2); });
