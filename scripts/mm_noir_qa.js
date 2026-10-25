#!/usr/bin/env node
'use strict';
// ============================================
// MM NOIR — dispatch-level flow QA (Blackvale: Dead of Night, 2026-10-25)
// Drives the REAL production dispatcher (murdermystery/index.js handleCommand)
// plus the real noir relay through a full case lifecycle with a fake sock:
//   routing -> lobby -> joins -> start -> dossiers -> SEARCH (command + bare
//   relay) -> early advance -> DEBATE (accuse) -> NIGHT (killer two-step,
//   guardian, detective, civilians) -> dawn -> rounds -> VOTE (majority) ->
//   verdict + truth reveal -> restart recovery -> clip-fallback ladder
// Run: MM_NOIR_QA=1 MM_NOIR_NOCLIP=1 node scripts/mm_noir_qa.js [repoRoot]
// Exits non-zero on any failed assertion.
// ============================================

const REPO = process.argv[2] || '/home/ubuntu/whatsapp-bot';
process.env.MM_NOIR_QA = '1';        // fast phase clocks
process.env.MM_NOIR_NOCLIP = '1';    // clips return null -> still/text ladder

const path = require('path');
const assert = require('node:assert/strict');

// ---- system stub: in-memory store (persistence round-trip still exercised) --
const memory = new Map();
const systemPath = require.resolve(path.join(REPO, 'core', 'utils', 'system.js'));
require.cache[systemPath] = {
  id: systemPath, filename: systemPath, loaded: true,
  exports: {
    get: (k, f = null) => (memory.has(k) ? memory.get(k) : f),
    getFresh: async (k, f = null) => (memory.has(k) ? memory.get(k) : f),
    set: async (k, v) => { memory.set(k, v); },
    loadSystemData: async () => {},
  },
};
// ---- botConfig stub ----------------------------------------------------------
const botConfigPath = require.resolve(path.join(REPO, 'botConfig.js'));
require.cache[botConfigPath] = {
  id: botConfigPath, filename: botConfigPath, loaded: true,
  exports: { getBotId: () => 'noir-qa-bot', getPrefix: () => '.j', get: () => null },
};
// ---- db + System model stubs --------------------------------------------------
const dbPath = require.resolve(path.join(REPO, 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: async () => { throw new Error('QA: no mongo'); } };
const systemModelPath = require.resolve(path.join(REPO, 'core', 'models', 'System.js'));
const _qaReject = async () => { throw new Error('QA: no mongo'); };
require.cache[systemModelPath] = {
  id: systemModelPath, filename: systemModelPath, loaded: true,
  exports: Object.assign(() => ({}), { find: _qaReject, findOne: _qaReject, updateOne: _qaReject, create: _qaReject, deleteMany: _qaReject }),
};
// ---- engine stub ---------------------------------------------------------------
let QA_SOCK = null;
const enginePath = require.resolve(path.join(REPO, 'core', 'engine.js'));
require.cache[enginePath] = {
  id: enginePath, filename: enginePath, loaded: true,
  exports: { getSock: () => QA_SOCK, isGlobalMod: () => false, isRpgMod: () => false, isBotOwner: () => false },
};
// ---- LidMapping stub ------------------------------------------------------------
const lidMappingPath = require.resolve(path.join(REPO, 'core', 'models', 'LidMapping.js'));
const lidStub = new Proxy(Object.assign(() => ({}), {}), {
  get: (t, k) => {
    if (k === 'then' || k === 'catch' || k === 'finally') return undefined;
    if (typeof k === 'symbol') return undefined;
    if (!t[k]) t[k] = (...a) => Promise.resolve({ toArray: async () => [], lean: async () => null, exec: async () => null });
    return t[k];
  },
});
require.cache[lidMappingPath] = { id: lidMappingPath, filename: lidMappingPath, loaded: true, exports: lidStub };
// ---- economy stub -----------------------------------------------------------------
const economyPath = require.resolve(path.join(REPO, 'core', 'rpg', 'economy.js'));
require.cache[economyPath] = {
  id: economyPath, filename: economyPath, loaded: true,
  exports: { getBalance: () => 1000000, removeMoney: () => true, addMoney: () => true, getDisplayName: (j) => 'QA ' + String(j).slice(0, 6) },
};

const mm = require(path.join(REPO, 'core', 'games', 'murdermystery', 'index.js'));
const noirPath = require.resolve(path.join(REPO, 'core', 'games', 'murdermystery', 'noir.js'));
const noir = require(noirPath);

// ---- fake sock ----
const sent = [];
QA_SOCK = { sendMessage: async (to, content) => { sent.push({ to, content }); return true; } };
const GROUP = '120363099000111@g.us';
const jid = (n) => '23344000111' + n + '@s.whatsapp.net';
const NAMES = { 1: 'Alice', 2: 'Bruno', 3: 'Cara', 4: 'Dario' };

function ctxFor(senderN, fullText, isGroup) {
  const body = String(fullText).trim().toLowerCase().replace(/^murder\s+/, '');
  const parts = body.split(/\s+/).filter(Boolean);
  const chatId = isGroup ? GROUP : jid(senderN);
  return {
    sock: QA_SOCK, chatId, senderJid: jid(senderN), senderName: NAMES[senderN] || 'Guest' + senderN,
    sub: parts[0] || '', rest: parts.slice(1).join(' '), m: {}, isGroup, prefix: '.j', botMarker: 'QA',
  };
}
const g = (n, t) => ctxFor(n, t, true);
const d = (n, t) => ctxFor(n, t, false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sentTo = (chatId) => sent.filter((s) => s.to === chatId);
const textOf = (s) => (s.content && s.content.text) || (s.content && s.content.caption) || '';
async function run(c) { await mm.handleCommand(c); }
const lastGroupText = () => { const arr = sentTo(GROUP); return arr.length ? textOf(arr[arr.length - 1]) : ''; };
const groupBlob = () => sentTo(GROUP).map(textOf).join('\n');
const dmBlob = (n) => sentTo(jid(n)).map(textOf).join('\n');

(async () => {
  let passed = 0;
  const ok = (name) => { passed++; console.log('  ✓ ' + name); };

  // T1 - routing: create goes to NOIR (not classic, not legacy story)
  await run(g(1, 'murder story create'));
  assert.ok(/DEAD OF NIGHT/i.test(groupBlob()), 'lobby reply identifies as Dead of Night');
  const game = noir._internal.games.get(GROUP);
  assert.ok(game && game.phase === 'LOBBY' && game.mode === 'NOIR', 'noir lobby created and routed');
  ok('T1 noir routing + lobby');

  // T2 - joins
  await run(g(2, 'murder story join'));
  await run(g(3, 'murder story join'));
  await run(g(4, 'murder story join'));
  assert.equal(game.players.length, 4, 'roster reaches 4');
  ok('T2 joins (4 players)');

  // T3 - cross-mode guard: classic create blocked while noir active
  await run(g(2, 'murder create'));
  assert.ok(/active in this group/i.test(lastGroupText()), 'classic create blocked by guard');
  ok('T3 classic-mode block while noir active');

  // T4 - start: host-only; INTRO phase; dossiers DM'd with accounts + lie markers
  await run(g(2, 'murder story start'));
  assert.ok(/Only the host/i.test(lastGroupText()), 'non-host start rejected');
  await run(g(1, 'murder story start'));
  assert.equal(game.phase, 'INTRO', 'start opens INTRO');
  assert.equal(game.players.filter((p) => p.role === 'KILLER').length, 1, 'exactly one killer');
  assert.equal(game.players.filter((p) => p.role === 'DETECTIVE').length, 1, 'exactly one detective');
  assert.equal(game.players.filter((p) => p.role === 'GUARDIAN').length, 1, 'exactly one guardian');
  assert.ok(game.players.every((p) => p.char && p.account && p.account['11 PM']), 'all players dealt + accounts');
  await sleep(50);
  for (let n = 1; n <= 4; n++) {
    assert.ok(/YOUR DOSSIER/.test(dmBlob(n)), 'dossier DM for player ' + n);
    assert.ok(/11 PM — you were in /.test(dmBlob(n)), 'account lines in dossier ' + n);
  }
  const gb4 = groupBlob();
  assert.ok(!/You are the Killer/.test(gb4), 'group never leaks role text');
  ok('T4 start + dossier privacy (accounts with lie markers)');

  // helper: force next phase (deadline 0 skips drift guard)
  const force = async () => {
    game.deadline = 0;
    game._transitioning = false;
    game._forceAdvance = false;
    await noir._internal.advancePhase(GROUP);
  };

  // T5 - INTRO -> SEARCH: menus arrive; explicit-command search works
  await force();
  assert.equal(game.phase, 'SEARCH', 'INTRO -> SEARCH');
  assert.ok(game.round === 1, 'round 1');
  await sleep(30);
  assert.ok(/ROUND 1 — SEARCH/.test(dmBlob(1)), 'search menu DM received');
  await run(d(1, 'murder story 1')); // explicit command path, search room 1
  assert.ok(/You search /.test(dmBlob(1)), 'search result DM (command path)');
  ok('T5 SEARCH menu + command-path search');

  // T6 - bare relay: a number searches/presses; non-players fall through
  const others = game.players.filter((p) => p.jid !== jid(2));
  const idx = game.rooms.length + 1; // first "press a person" number
  const before2 = sentTo(jid(2)).length;
  const consumed = await noir._internal.relay(QA_SOCK, jid(2), null, String(idx));
  assert.ok(consumed === true, 'bare number consumed by relay');
  assert.ok(sentTo(jid(2)).length > before2, 'press result DM\u2019d');
  const strangerConsumed = await noir._internal.relay(QA_SOCK, '23344009999@s.whatsapp.net', null, '1');
  assert.ok(strangerConsumed === false, 'non-player DM falls through');
  ok('T6 bare DM relay: player consumed, stranger passed');

  // T7 - SHARE without a find refuses (and does NOT consume the move);
  // real actions by everyone -> early advance to DEBATE
  await run(d(3, 'murder story share'));
  const share3 = dmBlob(3);
  assert.ok(/Pinned to the case board|nothing pinned-worthy/.test(share3), 'share handled');
  await run(d(3, 'murder story 2'));
  assert.ok(/You search /.test(dmBlob(3)), 'player 3 search after refused share');
  await run(d(4, 'murder story 1'));
  // everyone acted (1 search cmd + relay press + 3 search + 4 search)
  await sleep(400); // early-advance debounce 120ms
  assert.equal(game.phase, 'DEBATE', 'phases end early when everyone has acted');
  ok('T7 early advance -> DEBATE (no dead air)');

  // T8 - DEBATE: sealed accusations + skip; -> NIGHT
  const accuseTarget = game.players.find((p) => p.jid !== jid(1));
  const accuseIdx = game.players.filter((p) => p.alive && p.jid !== jid(1)).indexOf(accuseTarget) + 1;
  await run(d(1, 'murder story accuse ' + accuseIdx));
  assert.ok(/Sealed/.test(dmBlob(1)), 'accusation sealed');
  await run(d(2, 'murder story 1'));
  await run(d(3, 'murder story skip'));
  await run(d(4, 'murder story skip'));
  await sleep(400);
  assert.equal(game.phase, 'NIGHT', 'DEBATE -> NIGHT');
  ok('T8 sealed accusations -> NIGHT');

  // T9 - NIGHT: killer two-step + role actions resolve; dawn; next phase
  const killer = game.players.find((p) => p.role === 'KILLER');
  const guard = game.players.find((p) => p.role === 'GUARDIAN');
  const det = game.players.find((p) => p.role === 'DETECTIVE');
  const civ = game.players.find((p) => p.role === 'CIVILIAN');
  const numOf = (p) => Number(Object.keys(NAMES).find((n) => jid(n) === p.jid));
  const killerN = numOf(killer), guardN = numOf(guard), detN = numOf(det), civN = numOf(civ);
  const prey = game.players.find((p) => p.alive && p !== killer && p !== guard); // guardian protects someone else
  const preyN = numOf(prey);
  const preyIdx = game.players.filter((p) => p.alive && p !== killer).indexOf(prey) + 1;
  // guardian protects the prey -> saved
  await run(d(guardN, 'murder story guard ' + preyIdx));
  assert.ok(/stand watch/.test(dmBlob(guardN)), 'guardian protection set');
  // detective compares someone
  await run(d(detN, 'murder story compare 1'));
  assert.ok(/account/.test(dmBlob(detN)), 'detective compare result');
  // civilians act
  await run(d(civN, 'murder story bolt'));
  assert.ok(/bolt your door|sleep unbarred/.test(dmBlob(civN)), 'civilian night action');
  // killer: two-step (prey then room)
  await run(d(killerN, 'murder story kill ' + preyIdx));
  assert.ok(/Where does the deed happen/.test(dmBlob(killerN)), 'killer room step prompted');
  await run(d(killerN, 'murder story kill 2'));
  assert.ok(/It is decided/.test(dmBlob(killerN)), 'killer decision committed');
  await sleep(500);
  assert.ok(game.dawn && game.dawn.outcome === 'saved', 'guardian saved the prey (dawn=saved)');
  assert.ok(['SEARCH', 'VOTE'].includes(game.phase), 'dawn -> round 2 SEARCH (or VOTE)');
  assert.ok(game.round === 2, 'round advanced to 2');
  ok('T9 night actions + dawn (guardian save) -> round 2');

  // T10 - drive remaining rounds to VOTE, cast majority ballot, verdict + truth
  for (let r = 2; r <= 3; r++) {
    // SEARCH
    if (game.phase === 'SEARCH') {
      for (const p of game.players.filter((x) => x.alive)) {
        await run(d(numOf(p), 'murder story 1'));
      }
      await sleep(400);
    }
    if (game.phase === 'DEBATE') {
      for (const p of game.players.filter((x) => x.alive)) await run(d(numOf(p), 'murder story skip'));
      await sleep(400);
    }
    if (game.phase === 'NIGHT') {
      const kk = game.players.find((p) => p.role === 'KILLER' && p.alive);
      if (game.murders < 2 && kk) {
        await run(d(numOf(kk), 'murder story kill 1'));
        await run(d(numOf(kk), 'murder story kill 1'));
      } else if (kk) {
        await run(d(numOf(kk), 'murder story kill K'));
      }
      for (const p of game.players.filter((x) => x.alive && x.role !== 'KILLER')) {
        const role = p.role;
        if (role === 'GUARDIAN') await run(d(numOf(p), 'murder story guard 1'));
        else if (role === 'DETECTIVE') await run(d(numOf(p), 'murder story compare 1'));
        else await run(d(numOf(p), 'murder story bolt'));
      }
      await sleep(500);
    }
  }
  assert.equal(game.phase, 'VOTE', '3 rounds -> VOTE');
  const alivePlayers = game.players.filter((p) => p.alive);
  const realKiller = game.players.find((p) => p.role === 'KILLER');
  for (const p of alivePlayers) {
    if (p === realKiller) { await run(d(numOf(p), 'murder story vote skip')); continue; }
    const idxK = alivePlayers.filter((x) => x !== p).indexOf(realKiller) + 1;
    await run(d(numOf(p), 'murder story vote ' + idxK));
  }
  await sleep(600);
  assert.equal(game.phase, 'FINISHED', 'majority verdict -> FINISHED');
  assert.ok(game.verdict && game.verdict.townWins === true, 'the killer was convicted (town wins)');
  assert.ok(/THE WHOLE TRUTH/.test(groupBlob()), 'truth reveal posted to group');
  assert.ok(groupBlob().includes(realKiller.char.name), 'reveal names the killer');
  ok('T10 VOTE majority -> conviction + truth reveal');

  // T11 - clip fallback ladder: NOCLIP mode means group sends are text/stills only
  const groupSends = sentTo(GROUP);
  assert.ok(groupSends.length >= 8, 'group received phase announcements');
  assert.ok(groupSends.every((s) => !s.content.video), 'fallback ladder: no clip arrived, text/stills only');
  ok('T11 clip failure falls back to still/text (never blocks)');

  // T12 - restart recovery: fresh module restores state; create over FINISHED opens anew
  delete require.cache[noirPath];
  const noir2 = require(noirPath);
  noir2.init({ getSock: () => QA_SOCK });
  const restored = noir2._internal.games.get(GROUP);
  assert.ok(restored && restored.phase === 'FINISHED' && restored.verdict, 'state restored from persistence after restart');
  await run(g(1, 'murder story create'));
  const game2 = noir._internal.games.get(GROUP); // the live runtime module (what mm routes to)
  assert.ok(game2 && game2.phase === 'LOBBY' && game2 !== restored, 'new lobby opens over a finished case');
  ok('T12 restart recovery + new lobby over finished case');

  console.log('\nNOIR QA PASSED: ' + passed + '/12 (through the real dispatcher + relay, clips on the fallback ladder)');
  process.exit(0);
})().catch((e) => {
  console.error('NOIR QA FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
