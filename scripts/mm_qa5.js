#!/usr/bin/env node
// ============================================
// MURDER MYSTERY - QA SUITE 5 (Wave 2b rooms layer)
// Night visits + collision (presence-only) + candle reveal
// + letter thread + keepsake talisman save + ghost movement line
// Offline, mock sock, stub economy. Run: node scripts/mm_qa5.js
// Exits non-zero on any failed assertion.
// ============================================

process.env.MM_QA_FAST = '1';
process.env.MM_QA_CLOCK = '1';

const path = require('path');
const fs = require('fs');

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
    addMoney: () => true,
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

const CHAT = '120363026009901@g.us';
const NAMES = ['Vera', 'Wells', 'Xavi', 'Yuri', 'Zola', 'Abel', 'Bree', 'Cleo', 'Duke', 'Enzo', 'Fern'];
function roster(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const jid = `210000000990${String(i + 1).padStart(2, '0')}@s.whatsapp.net`;
    QA_BALANCES.set(jid, 1000000);
    arr.push({ jid, name: `${NAMES[i]}-q5` });
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
function gt(sock, re) { return sock.out.filter((m) => m.isGroup && re.test(m.text)).length; }
function norm(jid) { return String(jid).split('@')[0]; }
function roleOf(g, role) { return g.players.find((p) => p.role === role) || null; }
// night-action roster numbering EXCLUDES the actor (rosterLines does the same)
function actIdx(g, actor, target) {
  return g.players.filter((p) => p.alive && norm(p.jid) !== norm(actor.jid))
    .findIndex((p) => norm(p.jid) === norm(target.jid)) + 1;
}

async function waitNight() {
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const g = mm._internal.getGame(CHAT);
    if (g && g.phase === 'NIGHT') return g;
    await sleep(200);
  }
  return mm._internal.getGame(CHAT);
}

async function waitPhase(pred, ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const g = mm._internal.getGame(CHAT);
    if (g && pred(g)) return g;
    await sleep(300);
  }
  return mm._internal.getGame(CHAT);
}

(async () => {
  console.log('===== WAVE 2B - NIGHT VISITS / LETTERS / KEEPSAKES / GHOST MOVEMENT =====');
  let sock = makeSock();
  QA_SOCK = sock;
  const R = roster(6); // 6 players: killer + investigator + guardian (5+) + 3 civilians
  mm.init();

 // open + fill + start
  await mm.handleCommand(ctxOf(sock, { sub: 'create', sender: R[0].jid, name: R[0].name }));
  for (let i = 1; i < R.length; i++) {
    await mm.handleCommand(ctxOf(sock, { sub: 'join', sender: R[i].jid, name: R[i].name }));
  }
  let g = mm._internal.getGame(CHAT);
  ok(!!g && g.phase === 'LOBBY', 'S0 lobby open with 6 guests');
  await mm.handleCommand(ctxOf(sock, { sub: 'start', sender: R[0].jid, name: R[0].name }));
  g = await waitNight();
  ok(!!g && g.phase === 'NIGHT', 'S1 game reaches NIGHT');
  ok(Array.isArray(g.letterPool) && g.letterPool.length >= 6, `S2 letterPool generated (${(g.letterPool || []).length} fragments)`);
  ok(!!g.lootPool && g.lootPool.talisman === 1 && g.lootPool.candle === 2 && g.lootPool.coin === 2, 'S3 lootPool stock correct at case start');

  const killer = roleOf(g, 'KILLER');
  const civ = g.players.find((p) => p.role === 'CIVILIAN');
  const civ2 = g.players.filter((p) => p.role === 'CIVILIAN')[1];
  const civ3 = g.players.filter((p) => p.role === 'CIVILIAN')[2];
  ok(!!killer && !!civ && !!civ2 && !!civ3, 'S4 killer + three civilians found');

 // ---- NIGHT WINDOW: batch every night-1 action IMMEDIATELY (QA_CLOCK night = 5s).
 // All assertions run afterwards from the recorded DM log + persisted state. ----
 // R1: first visit -> room narrative + letter fragment 1
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: '1', sender: civ.jid, name: civ.name }));
 // R2: second visitor, SAME room -> collision both ways
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: '1', sender: civ2.jid, name: civ2.name }));
 // R3: candle reveal - the NEWCOMER holds the candle; its light names the faces
  civ3.items.push('candle');
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: '1', sender: civ3.jid, name: civ3.name }));
 // R4: duplicate visit same night -> rejected
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: '2', sender: civ.jid, name: civ.name }));
 // R5: letters re-read (works in any phase)
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'letters', sender: civ.jid, name: civ.name }));
 // R6: talisman save - the mark holds the iron
  const victims = g.players.filter((p) => p.alive && p.role !== 'KILLER');
  const mark = victims[victims.length - 1];
  mark.items.push('talisman');
 // killer wanders too (feeds the ghost movement line in the second night)
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: '2', sender: killer.jid, name: killer.name }));
  const mIdx = actIdx(g, killer, mark);
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'kill', rest: String(mIdx), sender: killer.jid, name: killer.name }));
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'room', rest: '3', sender: killer.jid, name: killer.name }));

 // ---- dawn: assert everything from the recorded log ----
  g = await waitPhase((x) => x.phase === 'DISCUSSION', 35000);
  ok(!!g && g.phase === 'DISCUSSION', 'R0 dawn reached after the visit night');

  ok(dm(sock, civ.jid, /the .+ closes behind you/), 'R1 visit DM lands with room narrative');
  ok(dm(sock, civ.jid, /Letter fragment 1 of \d+/), 'R1 letter fragment 1 granted');
  ok(g.visits && g.visits.picks[norm(civ.jid)] === 0, 'R1 visit recorded at room idx 0');

  ok(dm(sock, civ2.jid, /someone else is in the/), 'R2 newcomer told someone else is present');
  ok(dm(sock, civ.jid, /Footsteps in the/), 'R2 first visitor got the footsteps ping');

  ok(dm(sock, civ3.jid, /candle stub flares/), 'R3 candle flared for the visiting holder');
  ok(dm(sock, civ3.jid, /share your room/) && dm(sock, civ3.jid, new RegExp(civ.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), 'R3 candle named the faces sharing the room');
  ok(!civ3.items.includes('candle'), 'R3 candle consumed by its reveal');

  ok(gt(sock, /already slipped away tonight/) > 0, 'R4 second visit same night rejected');

  ok(dm(sock, civ.jid, /THE MANOR'S LETTERS/), 'R5 mm letters re-reads fragments in DMs');
  ok(dm(sock, civ.jid, /1\./), 'R5 letters listing numbered');

  ok(!!mark.alive, 'R6 talisman holder SURVIVED the kill');
  ok(!mark.items.includes('talisman'), 'R6 talisman consumed');
  ok((g.bodies || []).length === 0, 'R6 no body was planted (kill turned)');
  ok(dm(sock, mark.jid, /broke against the old iron/), 'R6 victim DM: iron turned the knife');
  ok(dm(sock, killer.jid, /The blade turned/), 'R6 killer DM: the deed failed');
 // AFK-random placement: every living guest now has a room on the map
  const allPlaced = g.players.filter((p) => p.alive).every((p) => g.visits.picks[norm(p.jid)] != null);
  ok(allPlaced, 'R6b AFK guests placed randomly at dawn (alibi map complete)');

 // ---- night 2: real murder + ghost movement line ----
 // skip the vote so night 2 begins
  sock = makeSock(); QA_SOCK = sock;
  g = mm._internal.getGame(CHAT);
  for (const p of g.players.filter((x) => x.alive)) {
    await mm.handleCommand(ctxOf(sock, { sub: 'vote', rest: 'skip', sender: p.jid, name: p.name }));
  }
  g = await waitPhase((x) => x.phase === 'NIGHT', 30000);
  ok(!!g && g.phase === 'NIGHT', 'N1 night 2 begins after skip ballot');
  ok(g.visits && g.visits.night === g.night && Object.keys(g.visits.picks).length === 0, 'N1 visit ledger reset for the new night');

  sock = makeSock(); QA_SOCK = sock;
  g = mm._internal.getGame(CHAT);
  const killer2 = roleOf(g, 'KILLER');
 // strip any keepsake talismans the loot rolls dealt - this night must murder
  for (const p of g.players) p.items = (p.items || []).filter((it) => it !== 'talisman');
  const targets = g.players.filter((p) => p.alive && p.role !== 'KILLER');
  const prey = targets[0];
 // killer visits room 1; body goes to room 2 -> ghost movement names room 1
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'visit', rest: '1', sender: killer2.jid, name: killer2.name }));
  const preyIdx = actIdx(g, killer2, prey);
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'kill', rest: String(preyIdx), sender: killer2.jid, name: killer2.name }));
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'room', rest: '2', sender: killer2.jid, name: killer2.name }));
  g = await waitPhase((x) => x.phase === 'DISCUSSION', 30000);
  ok(!!g && g.phase === 'DISCUSSION', 'N2 dawn after the murder');
  ok((g.bodies || []).length === 1, 'N2 body planted');
  ok(g.bodies[0].killerVisitIdx === 0, `N2 killer's wander recorded on the body (idx=${g.bodies[0].killerVisitIdx})`);
  ok(!prey.alive, 'N2 prey is dead (no talisman this time)');

 // finder searches the body room -> ghost clue DM carries the movement line
  sock = makeSock(); QA_SOCK = sock;
  g = mm._internal.getGame(CHAT);
  const finder = g.players.find((p) => p.alive && norm(p.jid) !== norm(killer2.jid));
  const bodyRoomIdx = g.bodies[0].roomIdx;
  await mm.handleCommand(ctxOf(sock, { sub: 'search', rest: String(bodyRoomIdx + 1), sender: finder.jid, name: finder.name }));
  ok(dm(sock, finder.jid, /THE GHOST WHISPERS/), 'N3 finder received the ghost clue');
  const mvName = g.rooms[0].name;
  ok(dm(sock, finder.jid, new RegExp(`slipped through the ${mvName}`)) || bodyRoomIdx === 0, `N3 ghost movement line names the killer's room (${mvName})`);

 // cleanup: close the case
  await mm.handleCommand(ctxOf(sock, { sub: 'end', sender: R[0].jid, name: R[0].name }));

  console.log(`\n===== mm_qa5: ${pass} passed, ${fail} failed =====`);
  if (failures.length) { for (const f of failures) console.log(`  ✖ ${f}`); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('qa5 fatal:', e); process.exit(2); });
