#!/usr/bin/env node
'use strict';
// ============================================
// MM STORY MODE - announcement resilience QA (Oatmeal 2026-10-25)
// Regression for the live-fire bug "game gets stuck after character
// introductions": phase announcements were single-shot void sends. This suite
// verifies, through the REAL production dispatcher + storyMode module:
//   T1 phase announcement retries after forced group-send failures
//   T2 NIGHT opening DMs every living player their role-specific prompt
//   T3 VOTING opening DMs every living player the vote prompt
//   T4 start dossier notice carries actionable investigation guidance
//   T5 join after start -> phase-aware "already underway" refusal
//   T6 no-sock window: announce survives (warn + retry), no crash
// Run: MM_STORY_QA_CLOCK=1 node scripts/mm_story_announce_qa.js [repoRoot]
// Exits non-zero on any failed assertion.
// ============================================

const REPO = process.argv[2] || '/home/z/my-project/repos/whatsapp-bot';
process.env.MM_STORY_QA_CLOCK = '1';

const path = require('path');
const assert = require('node:assert/strict');

// ---- system stub -------------------------------------------------------------
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
  exports: { getBotId: () => 'storyann-qa-bot', getPrefix: () => '.j', get: () => null },
};
// ---- db + System model stubs -------------------------------------------------
const dbPath = require.resolve(path.join(REPO, 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: async () => { throw new Error('QA: no mongo'); } };
const systemModelPath = require.resolve(path.join(REPO, 'core', 'models', 'System.js'));
const _qaReject = async () => { throw new Error('QA: no mongo'); };
require.cache[systemModelPath] = {
  id: systemModelPath, filename: systemModelPath, loaded: true,
  exports: Object.assign(() => ({}), { find: _qaReject, findOne: _qaReject, updateOne: _qaReject, create: _qaReject, deleteMany: _qaReject }),
};
// ---- engine stub (QA_SOCK swap lets T6 simulate a dead sock) ------------------
const enginePath = require.resolve(path.join(REPO, 'core', 'engine.js'));
let QA_SOCK = null;
require.cache[enginePath] = {
  id: enginePath, filename: enginePath, loaded: true,
  exports: { getSock: () => QA_SOCK, isGlobalMod: () => false, isRpgMod: () => false, isBotOwner: () => false },
};
// ---- package shims -----------------------------------------------------------
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
  if (request === 'canvas' && !HAS_CANVAS) return {};
  return _origLoad.apply(this, arguments);
};
// ---- LidMapping stub ----------------------------------------------------------
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
// ---- economy stub --------------------------------------------------------------
const economyPath = require.resolve(path.join(REPO, 'core', 'rpg', 'economy.js'));
require.cache[economyPath] = {
  id: economyPath, filename: economyPath, loaded: true,
  exports: { getBalance: () => 1000000, removeMoney: () => true, addMoney: () => true, getDisplayName: (j) => 'QA ' + String(j).slice(0, 6) },
};

const mm = require(path.join(REPO, 'core', 'games', 'murdermystery', 'index.js'));
const story = require(require.resolve(path.join(REPO, 'core', 'games', 'murdermystery', 'storyMode.js')));

// ---- fake sock with injectable group-send failures ----------------------------
const sent = [];
const attempts = []; // every sendMessage call, including failures
let failNextGroupText = 0;
QA_SOCK = {
  sendMessage: async (to, content) => {
    const isGroupText = String(to).endsWith('@g.us') && content && typeof content.text === 'string';
    attempts.push({ to, threw: false });
    if (isGroupText && failNextGroupText > 0) {
      failNextGroupText--;
      attempts[attempts.length - 1].threw = true;
      throw new Error('QA forced group-send failure');
    }
    sent.push({ to, content });
    return true;
  },
};

const GROUP = '120363099000002@g.us';
const jid = (n) => '23344000000' + n + '@s.whatsapp.net';
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
function sentTo(chatId) { return sent.filter((s) => s.to === chatId); }
function textOf(s) { return (s.content && s.content.text) || (s.content && s.content.caption) || ''; }
async function run(c) { await mm.handleCommand(c); }
const warns = [];
const _warn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); _warn(...a); };
const errs = [];
const _err = console.error;
console.error = (...a) => { errs.push(a.join(' ')); _err(...a); };

(async () => {
  let passed = 0;
  const ok = (name) => { passed++; console.log('  ✓ ' + name); };

  // setup: new story commands open Dead of Night (noir), so the legacy engine
  // under test is seeded directly; joins/start then route to it via the
  // sender-aware legacy check in index.js.
  await run(g(1, 'murder story create'));
  await run(g(1, 'murder story end')); // clear the noir lobby
  const game = story._internal.makeGame(g(1, 'murder story create'));
  story._internal.games.set(GROUP, game);
  story._internal.persist();
  await run(g(2, 'murder story join'));
  await run(g(3, 'murder story join'));
  await run(g(4, 'murder story join'));
  await run(g(1, 'murder story start'));
  assert.ok(game && game.phase === 'INVESTIGATION', 'game started');

  // T4 - dossier notice carries the actionable investigation guidance
  const dm1 = sentTo(jid(1)).map(textOf).join('\n');
  assert.match(dm1, /murder story rooms/i, 'dossier notice mentions rooms command');
  assert.match(dm1, /murder story search <room>/i, 'dossier notice mentions search syntax');
  assert.match(dm1, /murder story question <player>/i, 'dossier notice mentions question syntax');
  ok('T4 start dossier notice has actionable investigation guidance');

  // T5 - join after start: phase-aware refusal
  await run(g(2, 'murder story join'));
  const joinRefusal = sentTo(GROUP).map(textOf).join('\n');
  assert.match(joinRefusal, /already underway/i, 'mid-case join refused with phase-aware message');
  ok('T5 mid-case join refusal is phase-aware');

  // T1+T2 - force INVESTIGATION -> NIGHT while the group channel is failing.
  // The announcement must retry (2.5s apart) and the night prompts must still
  // reach every living player's DM.
  failNextGroupText = 2; // first two group text sends throw
  game.deadline = 0;
  await story._internal.advancePhase(GROUP);
  assert.equal(game.phase, 'NIGHT', 'forced transition INVESTIGATION -> NIGHT');
  let nightAnnounces = [];
  for (let i = 0; i < 48; i++) { // poll up to ~12s: retries are 2.5s apart and the
    // QA-clock natural transitions (+5s) share the event loop with renders
    nightAnnounces = sentTo(GROUP).map(textOf).filter((t) => /house falls silent/i.test(t));
    if (nightAnnounces.length >= 1) break;
    await sleep(250);
  }
  assert.ok(nightAnnounces.length >= 1, 'NIGHT announcement eventually delivered');
  const failedGroup = attempts.filter((a) => a.threw).length;
  assert.ok(failedGroup >= 2, 'forced failures actually exercised (' + failedGroup + ')');
  assert.ok(warns.some((w) => /phase announcement attempt/.test(w)), 'retry warning logged');
  ok('T1 NIGHT announcement retried past forced failures and delivered');

  for (const p of game.players.filter((pl) => pl.alive)) {
    const dm = sentTo(p.jid).map(textOf).join('\n');
    const n = Number(Object.keys(NAMES).find((k) => jid(k) === p.jid)) || 0;
    let expect = /murder story evidence/i;
    if (p.role === 'KILLER') expect = /murder story frame <player>/i;
    else if (p.role === 'INVESTIGATOR') expect = /murder story compare <player/i;
    else if (p.role === 'GUARDIAN') expect = /murder story protect <player/i;
    else if (p.role === 'MEDIUM') expect = /murder story seance/i;
    else if (p.role === 'ACCOMPLICE') expect = /murder story spread <player/i;
    assert.ok(expect.test(dm), 'night prompt for ' + (NAMES[n] || p.jid) + ' (' + p.role + ') delivered');
  }
  ok('T2 every living player got their role-specific NIGHT prompt by DM');

  // T3 - reach VOTING (phase-agnostic: natural QA timers may already be mid-
  // transition after T1's sleep window) and check the vote prompts by DM.
  for (let i = 0; i < 6 && game.phase !== 'VOTING' && game.phase !== 'FINISHED'; i++) {
    game.deadline = 0;
    await story._internal.advancePhase(GROUP); // NIGHT -> DISCUSSION -> VOTING
    await sleep(400);
  }
  assert.ok(game.phase === 'VOTING' || game.phase === 'FINISHED', 'machine reaches VOTING (got ' + game.phase + ')');
  await sleep(400);
  for (const p of game.players.filter((pl) => pl.alive)) {
    const dm = sentTo(p.jid).map(textOf).join('\n');
    assert.match(dm, /murder story vote <player number or name>/i, 'vote prompt delivered to ' + p.name);
  }
  ok('T3 VOTING opening DMs every living player the vote prompt');

  // T6 - no-sock window: announcements degrade loudly, never crash
  const sockRef = QA_SOCK;
  QA_SOCK = null; // engine getSock() now returns null
  game._sock = null;
  const before = sent.length;
  game.deadline = 0;
  await story._internal.advancePhase(GROUP); // VOTING -> FINISH; finish sends now fail softly
  await sleep(300);
  assert.equal(game.phase, 'FINISHED', 'phase machine completes even with no sock');
  assert.equal(sent.length, before, 'no phantom sends without a sock');
  QA_SOCK = sockRef;
  ok('T6 no-sock window: no crash, no phantom sends, machine completes');

  console.log('\nRESULT: ' + passed + '/6 announce-resilience tests passed');
  process.exit(0);
})().catch((e) => {
  console.error('\nQA FAILED:', e.message);
  process.exit(1);
});
