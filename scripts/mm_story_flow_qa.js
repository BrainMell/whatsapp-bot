#!/usr/bin/env node
'use strict';
// ============================================
// MM STORY MODE - dispatch-level flow QA (Oatmeal audit 2026-10-25)
// Drives the REAL production dispatcher (murdermystery/index.js handleCommand)
// through a full Story Mode lifecycle with a fake sock:
//   routing -> lobby -> join x4 -> start -> dossiers -> search/question ->
//   night (frame + compare) -> discussion (accuse) -> voting (majority) ->
//   finish -> classic-mode block -> restart recovery (fresh module instance)
// Run: MM_STORY_QA_CLOCK=1 node tmp/mm_story_flow_qa.js [repoRoot]
// Exits non-zero on any failed assertion.
// ============================================

const REPO = process.argv[2] || '/home/z/my-project/repos/whatsapp-bot';
process.env.MM_STORY_QA_CLOCK = '1'; // short phases: 6s/5s/6s/5s

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
// ---- botConfig stub: QA bot id, never collides with live System keys --------
const botConfigPath = require.resolve(path.join(REPO, 'botConfig.js'));
require.cache[botConfigPath] = {
  id: botConfigPath, filename: botConfigPath, loaded: true,
  exports: { getBotId: () => 'storyflow-qa-bot', getPrefix: () => '.j', get: () => null },
};
// ---- db + System model stubs: fail fast, no Mongo ---------------------------
const dbPath = require.resolve(path.join(REPO, 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: async () => { throw new Error('QA: no mongo'); } };
const systemModelPath = require.resolve(path.join(REPO, 'core', 'models', 'System.js'));
const _qaReject = async () => { throw new Error('QA: no mongo'); };
require.cache[systemModelPath] = {
  id: systemModelPath, filename: systemModelPath, loaded: true,
  exports: Object.assign(() => ({}), { find: _qaReject, findOne: _qaReject, updateOne: _qaReject, create: _qaReject, deleteMany: _qaReject }),
};
// ---- engine stub ------------------------------------------------------------
const enginePath = require.resolve(path.join(REPO, 'core', 'engine.js'));
let QA_SOCK = null;
require.cache[enginePath] = {
  id: enginePath, filename: enginePath, loaded: true,
  exports: { getSock: () => QA_SOCK, isGlobalMod: () => false, isRpgMod: () => false, isBotOwner: () => false },
};
// ---- sandbox-only package shims: baileys/canvas may be absent locally; on
// box2 the real packages load and this hook never fires for them ------------
let HAS_CANVAS = false;
let HAS_BAILEYS = false;
try { require(require.resolve('canvas', { paths: [REPO] })); HAS_CANVAS = true; } catch (_) {}
try { require(require.resolve('@whiskeysockets/baileys', { paths: [REPO] })); HAS_BAILEYS = true; } catch (_) {}
const Module = require('module');
const _origLoad = Module._load;
Module._load = function (request) {
  if (request === '@whiskeysockets/baileys' && !HAS_BAILEYS) {
    return { decryptPollVote: () => null, jidNormalizedUser: (j) => String(j || '') };
  }
  if (request === 'canvas' && !HAS_CANVAS) return {}; // renderCard throws -> text fallbacks
  return _origLoad.apply(this, arguments);
};

// ---- LidMapping stub: pulls mongoose (absent in sandbox); lazy no-op proxy --
const lidMappingPath = require.resolve(path.join(REPO, 'core', 'models', 'LidMapping.js'));
const lidStub = new Proxy(Object.assign(() => ({}), {}), {
  get: (t, k) => {
    if (k === 'then' || k === 'catch' || k === 'finally') return undefined;
    if (typeof k === 'symbol') return undefined;
    if (!t[k]) {
      t[k] = (...a) => Promise.resolve({ toArray: async () => [], lean: async () => null, exec: async () => null });
    }
    return t[k];
  },
});
require.cache[lidMappingPath] = { id: lidMappingPath, filename: lidMappingPath, loaded: true, exports: lidStub };
// ---- economy stub ------------------------------------------------------------
const economyPath = require.resolve(path.join(REPO, 'core', 'rpg', 'economy.js'));
require.cache[economyPath] = {
  id: economyPath, filename: economyPath, loaded: true,
  exports: { getBalance: () => 1000000, removeMoney: () => true, addMoney: () => true, getDisplayName: (j) => 'QA ' + String(j).slice(0, 6) },
};

const mm = require(path.join(REPO, 'core', 'games', 'murdermystery', 'index.js'));
const storyPath = require.resolve(path.join(REPO, 'core', 'games', 'murdermystery', 'storyMode.js'));
const story = require(storyPath);

// ---- fake sock: collects every send -----------------------------------------
const sent = [];
QA_SOCK = {
  sendMessage: async (to, content) => { sent.push({ to, content }); return true; },
};
const GROUP = '120363099000001@g.us';
const jid = (n) => '23344000000' + n + '@s.whatsapp.net';
const NAMES = { 1: 'Alice', 2: 'Bruno', 3: 'Cara', 4: 'Dario' };

function ctxFor(senderN, fullText, isGroup) {
  // fullText = everything after the prefix, e.g. "murder story create" —
  // emulate engine.js exactly: body strips the leading "murder", sub = first
  // token after that, rest = remainder (all lowercased like the real parser).
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
function sentTo(chatId) { return sent.filter((s) => s.to === chatId); }
function textOf(s) { return (s.content && s.content.text) || (s.content && s.content.caption) || ''; }
async function run(c) { await mm.handleCommand(c); }
function lastGroupText() { const arr = sentTo(GROUP); return arr.length ? textOf(arr[arr.length - 1]) : ''; }

(async () => {
  let passed = 0;
  const ok = (name) => { passed++; console.log('  ✓ ' + name); };

  // T1 - routing: ".j murder story create" must reach Story Mode, not classic
  await run(g(1, 'murder story create'));
  assert.ok(sentTo(GROUP).length >= 1, 'lobby reply sent to group');
  assert.ok(/STORY MODE/i.test(sentTo(GROUP).map(textOf).join('\n')), 'reply identifies as Story Mode');
  const game1 = story._internal.games.get(GROUP);
  assert.ok(game1 && game1.phase === 'LOBBY', 'story lobby created and routed');
  ok('T1 story routing + lobby creation');

  // T2 - joins cap at roster
  await run(g(2, 'murder story join'));
  await run(g(3, 'murder story join'));
  await run(g(4, 'murder story join'));
  assert.equal(game1.players.length, 4, 'roster reaches 4/8');
  ok('T2 joins recorded (4 players)');

  // T3 - cross-mode guard: classic create must be blocked while story is active
  await run(g(2, 'murder create'));
  assert.match(lastGroupText(), /Blackvale Story Mode is active/i, 'classic create blocked by story guard');
  ok('T3 classic-mode block while story game active');

  // T4 - start: host-only, phase machine opens INVESTIGATION
  await run(g(2, 'murder story start')); // non-host rejected
  assert.match(lastGroupText(), /Only the Story Mode host/i, 'non-host start rejected');
  await run(g(1, 'murder story start'));
  assert.equal(game1.phase, 'INVESTIGATION', 'host start opens INVESTIGATION');
  assert.equal(game1.players.filter((p) => p.role === 'KILLER').length, 1, 'exactly one killer dealt');
  assert.ok(game1.players.every((p) => p.char && p.secret && p.objective && p.statement), 'all players got dossier data');
  ok('T4 host start + role deal');

  // T5 - privacy: DM dossiers arrive; group never sees roles/secrets
  // Freeze the phase clock: canvas renders are slower than the 6s QA phases,
  // so the harness drives transitions itself via _internal.advancePhase
  // (deadline far-future -> the drift guard keeps deferring the armed timer).
  game1.deadline = Date.now() + 600000;
  for (let n = 1; n <= 4; n++) {
    await run(d(n, 'murder story dossier'));
    const dm = sentTo(jid(n)).map(textOf).join('\n');
    assert.match(dm, /PRIVATE STORY DOSSIER|PRIVATE STORY FILE/i, 'dossier DM for player ' + n);
  }
  const groupBlob = sentTo(GROUP).map(textOf).join('\n');
  for (const role of ['KILLER', 'INVESTIGATOR']) {
    assert.ok(!groupBlob.includes('Role: ' + role), 'group output never leaks role ' + role);
  }
  ok('T5 private dossiers via DM, zero group leak');

  // T6 - search: DM-only enforcement + a real search
  await run(g(1, 'murder story search ' + game1.rooms[0].id));
  assert.match(lastGroupText(), /send `\.j murder story search/i, 'group search refused with redirect');
  await run(d(1, 'murder story search ' + game1.rooms[0].id));
  const searchDm = sentTo(jid(1)).map(textOf).join('\n');
  assert.ok(/found no undiscovered|yields no new evidence|Inspect: \.j murder story inspect|· E\d\d/i.test(searchDm), 'search result delivered privately');
  ok('T6 DM-only search enforced + search works');

  // T7 - night phase: killer frame + investigator compare resolve
  // (force INVESTIGATION -> NIGHT: deadline 0 makes advancePhase skip the drift guard)
  game1.deadline = 0;
  await story._internal.advancePhase(GROUP);
  assert.equal(game1.phase, 'NIGHT', 'forced transition INVESTIGATION -> NIGHT');
  const killer = game1.players.find((p) => p.role === 'KILLER');
  const inv = game1.players.find((p) => p.role === 'INVESTIGATOR');
  const killerN = Number(Object.keys(NAMES).find((n) => jid(n) === killer.jid));
  const invN = Number(Object.keys(NAMES).find((n) => jid(n) === inv.jid));
  const victimN = [1, 2, 3, 4].find((n) => n !== killerN && n !== invN);
  await run(d(killerN, 'murder story frame ' + victimN)); // killer frames a civilian
  await run(d(invN, 'murder story compare ' + victimN));   // investigator compares same civilian
  game1.deadline = 0;
  await story._internal.advancePhase(GROUP); // NIGHT resolves (resolveNight) -> DISCUSSION
  assert.equal(game1.phase, 'DISCUSSION', 'NIGHT resolved into DISCUSSION');
  game1.deadline = Date.now() + 600000; // freeze again for the discussion step
  const planted = game1.evidence.find((c) => c.kind === 'planted-trace');
  assert.ok(planted && planted.manipulated === true, 'killer frame planted a manipulated trace');
  const invDm = sentTo(jid(invN)).map(textOf).join('\n');
  assert.match(invDm, /PRIVATE COMPARISON/i, 'investigator got private comparison result');
  ok('T7 night resolution: planted trace + investigator compare');

  // T8 - discussion: sealed accusation + public questioning (by a non-killer)
  const killerName = killer.name;
  const askerN = [1, 2, 3, 4].find((n) => n !== killerN);
  await run(d(askerN, 'murder story accuse ' + killerName + ' | E01'));
  const accDm = sentTo(jid(askerN)).map(textOf).join('\n');
  assert.match(accDm, /Your accusation is sealed/i, 'accusation sealed privately');
  await run(g(askerN, 'murder story question ' + killerName));
  assert.match(lastGroupText(), /OFFICIAL ACCOUNT/i, 'questioning posts official account to group');
  ok('T8 accusation sealed + public question');

  // T9 - voting: strict majority convicts the killer, case closes
  game1.deadline = 0;
  await story._internal.advancePhase(GROUP);
  assert.equal(game1.phase, 'VOTING', 'DISCUSSION -> VOTING');
  game1.deadline = Date.now() + 600000;
  const votesNeeded = Math.floor(4 / 2) + 1;
  for (const n of [1, 2, 3]) await run(d(n, 'murder story vote ' + killerName));
  assert.equal(game1.phase, 'FINISHED', 'strict majority closed the case');
  assert.equal(game1.verdict.correct, true, 'killer conviction counted as correct');
  assert.ok(game1.verdict.votes >= votesNeeded, 'verdict recorded ' + game1.verdict.votes + ' votes');
  const reveal = sentTo(GROUP).map(textOf).join('\n');
  assert.match(reveal, /CASE FILE CLOSED/i, 'case report sent');
  assert.match(reveal, new RegExp('The killer was ' + killerName), 'full text reveal names the killer');
  ok('T9 strict-majority verdict + full reveal');

  // T10 - rooms text fix: no literal "\n" in the DM fallback text
  await run(d(1, 'murder story rooms'));
  const roomsText = sentTo(jid(1)).map(textOf).find((t) => /ROOMS IN THIS CASE/i.test(t)) || '';
  assert.ok(roomsText.length > 0, 'rooms text sent');
  assert.ok(!roomsText.includes('\\n'), 'rooms text has real newlines (no literal backslash-n)');
  assert.ok(roomsText.split('\n').length >= 6, 'rooms text lists all six rooms');
  ok('T10 rooms text uses real newlines');

  // T11 - restart recovery: fresh module instance rehydrates from the store
  delete require.cache[storyPath];
  const story2 = require(storyPath); // simulates a rebooted process
  story2.init({
    sendGroup: async (sock, to, text) => { sent.push({ to, content: { text } }); return true; },
    sendDM: async (sock, to, text) => { sent.push({ to, content: { text } }); return true; },
    classicActive: () => false,
    getSock: () => QA_SOCK,
  });
  const restored = story2._internal.games.get(GROUP);
  assert.ok(restored, 'finished game rehydrated after simulated restart');
  assert.equal(restored.phase, 'FINISHED', 'restored phase matches');
  assert.equal(restored.verdict.correct, true, 'restored verdict data intact');
  assert.equal(story2.hasActiveGame(GROUP), false, 'finished game is not "active" after restart');
  ok('T11 persistence round-trip + restart recovery');

  // T12 - finished game does not block a new story lobby
  // (mm.handleCommand still routes to the OLD story instance in this harness —
  // a real restart reloads index.js too — so check the routed instance's map)
  await run(g(2, 'murder story create'));
  const game2 = story._internal.games.get(GROUP);
  assert.ok(game2 && game2.phase === 'LOBBY' && game2 !== restored, 'new lobby replaces finished case');
  ok('T12 new lobby opens over finished case');

  console.log('\nSTORY FLOW QA PASSED: ' + passed + '/12 through the real dispatcher' +
    (sent.some((s) => s.content && s.content.image) ? ' (with real card renders)' : ' (text fallbacks only - no canvas)'));
  process.exit(0);
})().catch((e) => {
  console.error('STORY FLOW QA FAILED:', e.message);
  console.error('--- captured sends (last 12, to/text/caption-or-image) ---');
  for (const s of sent.slice(-12)) {
    console.error('  to=' + s.to + ' :: ' + (((s.content && (s.content.text || s.content.caption)) || (s.content && s.content.image ? '<image>' : '')).slice(0, 140)));
  }
  console.error(e.stack);
  process.exit(1);
});
