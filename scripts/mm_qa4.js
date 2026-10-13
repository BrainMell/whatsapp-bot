#!/usr/bin/env node
// ============================================
// MURDER MYSTERY - QA SUITE 4 (Wave 2a, owner 2026-10-13 09:44Z)
// The Butler / the Medium / the Accomplice + killer night chat.
// Offline, mock sock, stub economy. Run: node scripts/mm_qa4.js
// Exits non-zero on any failed assertion.
// NOTE: under MM_QA_CLOCK the NIGHT window is ~5.6s (3s night + extension +
// 2.6s resolve debounce) - the drivers below CATCH windows (poll 250ms and
// submit the moment a phase appears); they never sleep through a phase.
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

// ---- economy stub ----
const economyPath = require.resolve(path.join(__dirname, '..', 'core', 'rpg', 'economy.js'));
const QA_BALANCES = new Map();
require.cache[economyPath] = {
  id: economyPath, filename: economyPath, loaded: true,
  exports: {
    getBalance: (jid) => QA_BALANCES.get(String(jid)) || 0,
    removeMoney: () => true,
    addMoney: (jid, amt, desc) => { QA_BALANCES.set(String(jid), (QA_BALANCES.get(String(jid)) || 0) + amt); return true; },
    getDisplayName: () => 'QA Guest',
  },
};

// ---- botConfig stub ----
const botConfigPath = require.resolve(path.join(__dirname, '..', 'botConfig.js'));
require.cache[botConfigPath] = {
  id: botConfigPath, filename: botConfigPath, loaded: true,
  exports: { getBotId: () => 'qa-bot', getPrefix: () => '.j', get: () => null },
};

// ---- QA_NO_MONGO stubs ----
const dbPath = require.resolve(path.join(__dirname, '..', 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: async () => { throw new Error('QA: no mongo'); } };
const systemModelPath = require.resolve(path.join(__dirname, '..', 'core', 'models', 'System.js'));
const _qaReject = async () => { throw new Error('QA: no mongo'); };
require.cache[systemModelPath] = {
  id: systemModelPath, filename: systemModelPath, loaded: true,
  exports: Object.assign(() => ({}), { find: _qaReject, findOne: _qaReject, updateOne: _qaReject, create: _qaReject, deleteMany: _qaReject }),
};

const mm = require(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'index.js'));
const system = require(path.join(__dirname, '..', 'core', 'utils', 'system.js'));
const STATS_KEY = mm._internal.STATS_KEY;

const PREFIX = '.j';
const MARKER = '🤖';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; failures.push(label); console.log(`  ❌ ${label}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const CHATS = ['1203630777001@g.us', '1203630777002@g.us', '1203630777003@g.us', '1203630777004@g.us', '1203630777005@g.us', '1203630777006@g.us', '1203630777007@g.us', '1203630777008@g.us'];
const NAMES = ['Ava', 'Ben', 'Cleo', 'Dmitri', 'Elsa', 'Fitz', 'Greta', 'Hugo', 'Iris', 'Jonas', 'Katya'];
function players(n, chatIdx) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const jid = `300000000${String(chatIdx).padStart(2, '0')}${String(i + 1).padStart(2, '0')}@s.whatsapp.net`;
    QA_BALANCES.set(jid, 1000000);
    arr.push({ jid, name: `${NAMES[i]}-${chatIdx}` });
  }
  return arr;
}

function ctxOf(sock, chatId, { sender, name, group = true, sub = 'help', rest = '' } = {}) {
  return {
    sock, chatId,
    senderJid: sender || '30000000000000@s.whatsapp.net', senderName: name || 'Guest',
    sub, rest, m: { key: { id: 'qa' } },
    botMarker: MARKER, isGroup: group, botId: 'qa-bot', prefix: PREFIX, isMod: false,
  };
}

function groupText(sock, re) { return sock.out.filter((m) => m.isGroup && re.test(m.text)).length; }
function dmTexts(sock, jid, re) { return sock.out.filter((m) => !m.isGroup && m.jid === jid && re.test(m.text)).length; }
function normJid(j) { return mm._internal.normJid(j); }
function roleOf(g, role) { return g.players.find((p) => p.role === role) || null; }
function roleCounts(g) {
  const rc = {};
  for (const p of g.players) rc[p.role] = (rc[p.role] || 0) + 1;
  return rc;
}
function aliveIdxOf(g, target, excludeSelfJid = null, includeSelf = false) {
  const pool = g.players.filter((p) => p.alive);
  const ex = excludeSelfJid ? normJid(excludeSelfJid) : null;
  const filtered = pool.filter((p) => !ex || includeSelf || normJid(p.jid) !== ex);
  return filtered.findIndex((p) => normJid(p.jid) === normJid(target.jid)) + 1;
}
function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function waitFor(cond, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    if (cond()) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(250);
  }
}
async function waitForPhase(chatId, phases, ms = 45000) {
  const t0 = Date.now();
  for (;;) {
    const cur = mm._internal.getGame(chatId);
    if (!cur || phases.includes(cur.phase)) return cur;
    if (Date.now() - t0 > ms) return cur;
    await sleep(250);
  }
}

async function openAndFill(sock, chatId, roster, hostIdx = 0) {
  await mm.handleCommand(ctxOf(sock, chatId, { sub: 'create', sender: roster[hostIdx].jid, name: roster[hostIdx].name }));
  for (let i = 0; i < roster.length; i++) {
    if (i === hostIdx) continue;
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'join', sender: roster[i].jid, name: roster[i].name }));
  }
  return mm._internal.getGame(chatId);
}

async function startToNight(sock, chatId, roster) {
  await mm.handleCommand(ctxOf(sock, chatId, { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
  const t0 = Date.now();
  for (;;) {
    const cur = mm._internal.getGame(chatId);
    if (cur && cur.phase === 'NIGHT') return cur;
    if (Date.now() - t0 > 45000) return cur;
    await sleep(250);
  }
}

// submit night actions ONLY (no sleeps) - call the moment NIGHT is visible
async function submitNightActions(sock, g, opts = {}) {
  g = mm._internal.getGame(g.chatId) || g;
  const killers = g.players.filter((p) => p.role === 'KILLER' && p.alive);
  const invs = g.players.filter((p) => p.role === 'INVESTIGATOR' && p.alive);
  const guard = roleOf(g, 'GUARDIAN');
  const victims = g.players.filter((p) => p.alive && p.role !== 'KILLER' && p.role !== 'ACCOMPLICE');
  const victim = opts.victim || victims[0];
  if (killers.length && victims.length) {
    const k1 = killers[0];
    const vIdx = aliveIdxOf(g, victim, k1.jid);
    await mm.handleCommand(ctxOf(sock, k1.jid, { group: false, sub: 'kill', rest: String(vIdx), sender: k1.jid, name: k1.name }));
    const roomN = 1 + Math.floor(Math.random() * g.rooms.length);
    await mm.handleCommand(ctxOf(sock, k1.jid, { group: false, sub: 'room', rest: String(roomN), sender: k1.jid, name: k1.name }));
    if (guard && guard.alive && opts.protect) {
      const gIdx = aliveIdxOf(g, victim, null, true);
      await mm.handleCommand(ctxOf(sock, guard.jid, { group: false, sub: 'protect', rest: String(gIdx), sender: guard.jid, name: guard.name }));
    }
  }
  for (const inv of invs) {
    if ((inv.compLeft == null ? 3 : inv.compLeft) <= 0) continue;
    const pool = g.players.filter((p) => p.alive && normJid(p.jid) !== normJid(inv.jid));
    const t = pool[0];
    const t2 = pool.find((p) => normJid(p.jid) !== normJid(t.jid)) || pool[0];
    const iIdx = aliveIdxOf(g, t, inv.jid);
    const iIdx2 = aliveIdxOf(g, t2, inv.jid);
    await mm.handleCommand(ctxOf(sock, inv.jid, { group: false, sub: 'compare', rest: `${iIdx} ${iIdx2}`, sender: inv.jid, name: inv.name }));
  }
  return mm._internal.getGame(g.chatId);
}

async function submitVotes(sock, chatId, g, chooser) {
  for (const p of g.players.filter((x) => x.alive)) {
    const target = chooser(p, g);
    await mm.handleCommand(ctxOf(sock, chatId, { sub: 'vote', rest: target, sender: p.jid, name: p.name }));
  }
}

async function searchesPhase(sock, g) {
  for (const p of g.players.filter((x) => x.alive)) {
    const roomN = 1 + Math.floor(Math.random() * g.rooms.length);
    await mm.handleCommand(ctxOf(sock, g.chatId, { sub: 'search', rest: String(roomN), sender: p.jid, name: p.name }));
  }
}

// full window-catching loop. mode: 'toNight3quiet' (reveal), 'killerWin', 'civWin'
async function drive(sock, chatId, mode, stopFn = null) {
  let guard = 0;
  for (;;) {
    let g = mm._internal.getGame(chatId);
    if (!g || g.phase === 'ENDED') return g;
    if (stopFn && stopFn(g, sock)) return g;
    if (guard++ > 130) return g;
    if (g.phase === 'NIGHT') {
      g.extendedTonight = true;
      const victim = g.players.find((p) => p.alive && p.role === 'CIVILIAN') || g.players.find((p) => p.alive && p.role !== 'KILLER' && p.role !== 'ACCOMPLICE');
      await submitNightActions(sock, g, { protect: mode === 'toNight3quiet', victim });
      g = await waitForPhase(chatId, ['DISCUSSION', 'ENDED'], 45000);
      continue;
    }
    if (g.phase === 'DISCUSSION') {
      await searchesPhase(sock, g);
      await mm._internal.onPhaseTimeout(chatId, sock);
      g = await waitForPhase(chatId, ['VOTING', 'ENDED'], 20000);
      continue;
    }
    if (g.phase === 'VOTING') {
      const cur = mm._internal.getGame(chatId);
      const killer = cur.players.find((p) => p.role === 'KILLER' && p.alive);
      const choice = mode === 'civWin' ? (killer ? String(aliveIdxOf(cur, killer, null, true)) : 'skip') : 'skip';
      await submitVotes(sock, chatId, cur, () => choice);
      g = await waitForPhase(chatId, ['NIGHT', 'ENDED'], 30000);
      continue;
    }
    await sleep(250);
  }
}

// ---------- main ----------
async function main() {
  await system.set('murder_mm_games_v2_qa-bot', {});
  await system.set('murder_mm_stats_v1', {});
  await system.set('murder_mm_archive_v2_qa-bot', []);
  mm._internal.games.clear();
  mm._internal.ensureRehydrated();

  // =========== 1. DEAL GATES ===========
  console.log('\n===== 1. DEAL GATES (owner 2026-10-13) =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    await openAndFill(sock, CHATS[0], players(7, 1));
    await mm.handleCommand(ctxOf(sock, CHATS[0], { sub: 'start', sender: players(7, 1)[0].jid, name: players(7, 1)[0].name }));
    let g = await startToNight(sock, CHATS[0], players(7, 1));
    let rc = roleCounts(g);
    ok(!rc.MEDIUM && !rc.BUTLER && !rc.ACCOMPLICE, `1.1 7p deals no new roles (got ${JSON.stringify(rc)})`);
    await mm.handleCommand(ctxOf(sock, CHATS[0], { sub: 'end', sender: players(7, 1)[0].jid, name: players(7, 1)[0].name }));

    await openAndFill(sock, CHATS[1], players(8, 2));
    await mm.handleCommand(ctxOf(sock, CHATS[1], { sub: 'start', sender: players(8, 2)[0].jid, name: players(8, 2)[0].name }));
    g = await startToNight(sock, CHATS[1], players(8, 2));
    rc = roleCounts(g);
    ok(rc.MEDIUM === 1, `1.2 8p deals exactly one Medium (got ${rc.MEDIUM})`);
    ok(!rc.BUTLER && !rc.ACCOMPLICE, `1.3 8p deals no Butler/Accomplice (got B=${rc.BUTLER || 0}/A=${rc.ACCOMPLICE || 0})`);
    const med = roleOf(g, 'MEDIUM');
    ok(med && med.seanceLeft === mm._internal.SEANCE_BUDGET, `1.4 medium carries seance budget ${mm._internal.SEANCE_BUDGET}`);
    await mm.handleCommand(ctxOf(sock, CHATS[1], { sub: 'end', sender: players(8, 2)[0].jid, name: players(8, 2)[0].name }));

    for (let round = 0; round < 2; round++) {
      const roster = players(9, 3 + round);
      await openAndFill(sock, CHATS[2], roster);
      await mm.handleCommand(ctxOf(sock, CHATS[2], { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
      g = await startToNight(sock, CHATS[2], roster);
      rc = roleCounts(g);
      ok(rc.MEDIUM === 1 && rc.BUTLER === 1 && rc.ACCOMPLICE === 1, `1.5.${round} 9p deals M/B/A once each (got M${rc.MEDIUM || 0}/B${rc.BUTLER || 0}/A${rc.ACCOMPLICE || 0})`);
      ok(rc.KILLER === 2 && rc.INVESTIGATOR === 2 && rc.GUARDIAN === 1, `1.6.${round} 9p keeps K2/I2/G1 (got K${rc.KILLER}/I${rc.INVESTIGATOR}/G${rc.GUARDIAN})`);
      const seats = new Set(g.players.filter((p) => ['MEDIUM', 'BUTLER', 'ACCOMPLICE', 'KILLER'].includes(p.role)).map((p) => normJid(p.jid)));
      ok(seats.size === 5, `1.7.${round} all five special seats are distinct players (${seats.size})`);
      const killer = g.players.find((p) => p.role === 'KILLER');
      const butler = roleOf(g, 'BUTLER');
      const knew = await waitFor(() => dmTexts(sock, killer.jid, new RegExp(`The butler, \\*${esc(butler.name)}\\*`)) >= 1, 10000);
      ok(knew, `1.8.${round} killer's night DM names the butler (${butler.name})`);
      await mm.handleCommand(ctxOf(sock, CHATS[2], { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
    }
  }

  // =========== 2. BUTLER NIGHT-3 REVEAL ===========
  console.log('\n===== 2. BUTLER THIRD-NIGHT REVEAL =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const roster = players(9, 10);
    await openAndFill(sock, CHATS[3], roster);
    await mm.handleCommand(ctxOf(sock, CHATS[3], { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    let g = await startToNight(sock, CHATS[3], roster);
    ok(g && g.phase === 'NIGHT', '2.1 9p game reaches night 1');
    const butler0 = roleOf(mm._internal.getGame(CHATS[3]), 'BUTLER');
    const killer0 = mm._internal.getGame(CHATS[3]).players.find((p) => p.role === 'KILLER');
    g = await drive(sock, CHATS[3], 'toNight3quiet', (gg) =>
      gg.night >= mm._internal.BUTLER_REVEAL_NIGHT &&
      dmTexts(sock, butler0.jid, new RegExp(`the name behind the knife: \\*${esc(killer0.name)}\\*`, 'i')) >= 1);
    g = mm._internal.getGame(CHATS[3]);
    ok(g && g.night >= mm._internal.BUTLER_REVEAL_NIGHT, `2.2 game reached night ${mm._internal.BUTLER_REVEAL_NIGHT}+ alive (at night ${g ? g.night : '?'}, phase ${g ? g.phase : 'gone'})`);
    ok(dmTexts(sock, butler0.jid, new RegExp(`the name behind the knife: \\*${esc(killer0.name)}\\*`, 'i')) >= 1, `2.3 butler's night-3 DM names the killer (${killer0.name})`);
    ok(sock.out.some((m) => !m.isGroup && m.jid === butler0.jid && m.image && /THE NAME BEHIND/.test(m.text)) ||
       dmTexts(sock, butler0.jid, /third night the manor pays its debts/i) >= 1, '2.4 butler reveal arrives as a card (or text fallback)');
    // the butler's other night DMs must NOT leak the name before night 3
    const earlyLeak = sock.out.some((m) => !m.isGroup && m.jid === butler0.jid && /name behind the knife/i.test(m.text) === false && new RegExp(esc(killer0.name)).test(m.text) && /NIGHT 1 -/.test(m.text));
    ok(!earlyLeak, '2.5 no killer-name leak in the butler\'s night-1 DM');
    await mm.handleCommand(ctxOf(sock, CHATS[3], { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
  }

  // =========== 3. THE SEANCE ===========
  console.log('\n===== 3. THE MEDIUM AND THE VEIL =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const roster = players(9, 20);
    await openAndFill(sock, CHATS[4], roster);
    await mm.handleCommand(ctxOf(sock, CHATS[4], { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    let g = await startToNight(sock, CHATS[4], roster);
    const medium = roleOf(g, 'MEDIUM');
    const butler = roleOf(g, 'BUTLER');
    const accomp = roleOf(g, 'ACCOMPLICE');
    await mm.handleCommand(ctxOf(sock, medium.jid, { group: false, sub: 'status', sender: medium.jid, name: medium.name }));
    ok(dmTexts(sock, medium.jid, /the \*MEDIUM\*/i) >= 1, '3.1 medium status shows the Medium seat');
    await mm.handleCommand(ctxOf(sock, butler.jid, { group: false, sub: 'status', sender: butler.jid, name: butler.name }));
    ok(dmTexts(sock, butler.jid, /the \*BUTLER\*/i) >= 1, '3.2 butler status shows the Butler seat');
    await mm.handleCommand(ctxOf(sock, accomp.jid, { group: false, sub: 'status', sender: accomp.jid, name: accomp.name }));
    ok(dmTexts(sock, accomp.jid, /the \*ACCOMPLICE\*/i) >= 1, '3.3 accomplice status shows the Accomplice seat');

    // kill the butler night 1 so the veil has someone to carry
    const k1 = g.players.find((p) => p.role === 'KILLER');
    const vIdx = aliveIdxOf(g, butler, k1.jid);
    await mm.handleCommand(ctxOf(sock, k1.jid, { group: false, sub: 'kill', rest: String(vIdx), sender: k1.jid, name: k1.name }));
    await mm.handleCommand(ctxOf(sock, k1.jid, { group: false, sub: 'room', rest: '1', sender: k1.jid, name: k1.name }));
    await submitNightActions(sock, g, {});
    g = await waitForPhase(CHATS[4], ['DISCUSSION', 'ENDED'], 45000);
    g = mm._internal.getGame(CHATS[4]);
    ok(g && g.phase === 'DISCUSSION' && butler.alive === false, '3.4 night 1 resolves, butler is dead');

    await mm.handleCommand(ctxOf(sock, CHATS[4], { sub: 'seance', sender: k1.jid, name: k1.name }));
    ok(groupText(sock, /answers only to the Medium/) >= 1, '3.5 non-medium refused in the GC');
    await mm.handleCommand(ctxOf(sock, CHATS[4], { sub: 'seance', sender: medium.jid, name: medium.name }));
    ok(groupText(sock, /lights the candles and parts the veil/) >= 1, '3.6 veil announcement in the GC');
    ok(roleOf(mm._internal.getGame(CHATS[4]), 'MEDIUM').seanceLeft === mm._internal.SEANCE_BUDGET - 1, '3.7 budget spent 2 -> 1');
    ok(dmTexts(sock, butler.jid, /THE VEIL IS OPEN/) >= 1, '3.8 dead guest gets the veil-open DM');

    const deadJid = butler.jid;
    const consumed = await mm.seanceRelay(sock, deadJid, deadJid, 'I saw gloved hands by the cellar door', MARKER);
    ok(consumed === true, '3.9 dead guest words consumed by the veil');
    ok(dmTexts(sock, medium.jid, /gloved hands by the cellar door/) >= 1, '3.10 medium received the dead guest words');
    ok(dmTexts(sock, medium.jid, new RegExp(esc(butler.name))) >= 1, '3.11 relay carries the speaker identity');
    ok(dmTexts(sock, deadJid, /words cross the veil/) >= 1, '3.12 dead guest gets the crossing confirmation');
    ok(!sock.out.some((m) => m.isGroup && /gloved hands/.test(m.text)), '3.13 dead words never leak to the GC');

    const civ = g.players.find((p) => p.alive && p.role === 'CIVILIAN');
    const liveConsumed = await mm.seanceRelay(sock, civ.jid, civ.jid, 'hello? is anyone there', MARKER);
    ok(liveConsumed === false, '3.14 living guest free text not consumed by the veil');
    await mm.seanceRelay(sock, deadJid, deadJid, 'second words too fast', MARKER);
    ok(dmTexts(sock, deadJid, /so many words so fast/) >= 1, '3.15 anti-spam cooldown holds the second whisper');

    // phase roll: veil does not carry across phases
    await mm._internal.onPhaseTimeout(CHATS[4], sock); // DISCUSSION -> VOTING
    g = await waitForPhase(CHATS[4], ['VOTING', 'ENDED'], 20000);
    if (g && g.phase === 'VOTING') {
      const crossed = await mm.seanceRelay(sock, deadJid, deadJid, 'the phase has rolled', MARKER);
      ok(crossed === false, '3.16 veil is phase-bound - no carrying into the vote');
      await submitVotes(sock, CHATS[4], g, () => 'skip');
      g = await waitForPhase(CHATS[4], ['NIGHT', 'ENDED'], 30000);
    } else ok(false, '3.16 (skipped - vote phase not reached)');

    if (g && g.phase === 'NIGHT') {
      await mm.handleCommand(ctxOf(sock, CHATS[4], { sub: 'seance', sender: medium.jid, name: medium.name }));
      ok(groupText(sock, /parts the veil/) >= 2, '3.17 veil reopened at night (second opening)');
      ok(roleOf(mm._internal.getGame(CHATS[4]), 'MEDIUM').seanceLeft === 0, '3.18 budget spent 1 -> 0');
      await waitForPhase(CHATS[4], ['DISCUSSION', 'ENDED'], 60000);
      g = mm._internal.getGame(CHATS[4]);
    } else ok(false, `3.17 (skipped - night not reached, phase ${g ? g.phase : 'gone'})`);

    if (g && g.phase === 'DISCUSSION') {
      await mm.handleCommand(ctxOf(sock, CHATS[4], { sub: 'seance', sender: medium.jid, name: medium.name }));
      ok(groupText(sock, /veil has spent itself/) >= 1, '3.19 third opening refused - budget exhausted');
    } else ok(false, `3.19 budget exhaustion check (phase ${g ? g.phase : 'gone'})`);
    await mm.handleCommand(ctxOf(sock, CHATS[4], { sub: 'end', sender: roster[0].jid, name: roster[0].name }));
  }

  // =========== 4. THE ACCOMPLICE WINS BESIDE THE KNIFE ===========
  console.log('\n===== 4. ACCOMPLICE WIN PATHS =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const roster = players(9, 40);
    await openAndFill(sock, CHATS[5], roster);
    await mm.handleCommand(ctxOf(sock, CHATS[5], { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    let g = await startToNight(sock, CHATS[5], roster);
    const purse = g.prize;
    const accFinal = roleOf(g, 'ACCOMPLICE');
    const killers0 = g.players.filter((p) => p.role === 'KILLER');
    const civJids = g.players.filter((p) => p.role !== 'KILLER' && p.role !== 'ACCOMPLICE').map((p) => p.jid);
    const balBefore = {};
    for (const p of roster) balBefore[p.jid] = QA_BALANCES.get(p.jid);
    g = await drive(sock, CHATS[5], 'killerWin');
    // declareWinner tears the game down - the win lives in the group texts, ledger and purses
    ok(groupText(sock, /THE KILLER WINS/) >= 1, '4.1 killer team reaches parity and wins');
    ok(groupText(sock, /the killer walks away with the purse/) >= 1, '4.2 manor-pays announcement names the killer side');
    const team = [accFinal, ...killers0];
    const share = Math.floor(purse / team.length);
    for (const w of team) {
      const got = QA_BALANCES.get(w.jid) - balBefore[w.jid];
      ok(got === share || got === share + 1, `4.3 ${w.role === 'ACCOMPLICE' ? 'accomplice' : 'killer'} ${w.name} paid ~${share} (got ${got})`);
    }
    const totalTeam = team.reduce((a, w) => a + (QA_BALANCES.get(w.jid) - balBefore[w.jid]), 0);
    ok(totalTeam === purse, `4.4 killer team splits the whole purse (${totalTeam}/${purse})`);
    ok(civJids.every((j) => QA_BALANCES.get(j) === balBefore[j]), '4.5 house side paid nothing');
    const accRow = (system.get(STATS_KEY, {}) || {})[normJid(accFinal.jid)];
    ok(accRow && accRow.wins === 1, `4.6 accomplice ledger records the win (${accRow && accRow.wins})`);
    ok(accRow && !accRow.killerGames, '4.7 accomplice is not counted as a killer seat in the ledger');
    const arch = system.get('murder_mm_archive_v2_qa-bot', []);
    ok(arch.length && arch[arch.length - 1].winner === 'killer', '4.8 archive records the killer win');
  }

  // =========== 5. THE ACCOMPLICE LOSES THE CIV WIN ===========
  console.log('\n===== 5. ACCOMPLICE LOSES THE CIV WIN =====');
  {
    const sock = makeSock(); QA_SOCK = sock;
    const roster = players(9, 60);
    await openAndFill(sock, CHATS[6], roster);
    await mm.handleCommand(ctxOf(sock, CHATS[6], { sub: 'start', sender: roster[0].jid, name: roster[0].name }));
    let g = await startToNight(sock, CHATS[6], roster);
    const purse = g.prize;
    const accFinal = roleOf(g, 'ACCOMPLICE');
    const civWinners = g.players.filter((p) => p.role !== 'KILLER' && p.role !== 'ACCOMPLICE').map((p) => p.jid);
    const killerJids = g.players.filter((p) => p.role === 'KILLER').map((p) => p.jid);
    const balBefore = {};
    for (const p of roster) balBefore[p.jid] = QA_BALANCES.get(p.jid);
    g = await drive(sock, CHATS[6], 'civWin');
    ok(groupText(sock, /MYSTERY SOLVED/) >= 1, '5.1 house catches the killers - civ win declared');
    const share5 = Math.floor(purse / civWinners.length);
    ok(civWinners.every((j) => { const got = QA_BALANCES.get(j) - balBefore[j]; return got === share5 || got === share5 + 1; }), `5.2 innocents (excl. accomplice) split the purse (~${share5})`);
    const totalCiv = civWinners.reduce((a, j) => a + (QA_BALANCES.get(j) - balBefore[j]), 0);
    ok(totalCiv === purse, `5.3 total paid equals the purse (${totalCiv}/${purse})`);
    ok(QA_BALANCES.get(accFinal.jid) === balBefore[accFinal.jid], '5.4 accomplice paid nothing on the civ win');
    ok(killerJids.every((j) => QA_BALANCES.get(j) === balBefore[j]), '5.5 killers paid nothing');
    const accRow2 = (system.get(STATS_KEY, {}) || {})[normJid(accFinal.jid)];
    ok(accRow2 && accRow2.wins === 0, '5.6 accomplice ledger records no win on the civ side');
    const arch5 = system.get('murder_mm_archive_v2_qa-bot', []);
    ok(arch5.length && arch5[0].winner === 'civ', '5.7 archive records the civ win (newest-first)');
  }

  // =========== 6. STATIC WIRING ===========
  console.log('\n===== 6. STATIC SOURCE WIRING =====');
  {
    const fsx = require('fs');
    const engineSrc = fsx.readFileSync(path.join(__dirname, '..', 'core', 'engine.js'), 'utf8');
    const mmSrc = fsx.readFileSync(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'index.js'), 'utf8');
    ok(/murderMystery\.seanceRelay/.test(engineSrc), '6.1 engine DM free-text chain calls murderMystery.seanceRelay');
    ok(/module\.exports = \{[\s\S]*?seanceRelay/.test(mmSrc), '6.2 index.js exports seanceRelay for the engine hook');
    ok(/BUTLER_REVEAL_NIGHT = 3/.test(mmSrc), '6.3 butler reveal is pinned to night 3');
    ok(/SEANCE_BUDGET = 2/.test(mmSrc), '6.4 seance budget pinned at 2 per case');
    ok(/killerTeamAlive/.test(mmSrc) && /role === 'ACCOMPLICE'/.test(mmSrc), '6.5 accomplice counts toward killer parity');
  }

  console.log('\n========================================');
  console.log(`WAVE 2A QA: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('FAILED ROWS:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('========================================');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('QA crash:', e); process.exit(2); });
