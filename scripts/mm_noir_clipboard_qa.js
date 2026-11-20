#!/usr/bin/env node
'use strict';
// MM NOIR — clue / clipboard / pin QA (2026-11-20).
// Run: MM_NOIR_QA=1 MM_NOIR_NOCLIP=1 node scripts/mm_noir_clipboard_qa.js [repoRoot]
// Part A: 300 random deals -> story invariants (every clue is true to the case).
// Part B: live flow -> find popup, SHARE, clipboard (group + DM), pin/unpin, limits.
const REPO = require('path').resolve(process.argv[2] || process.cwd());
process.env.MM_NOIR_QA = '1'; process.env.MM_NOIR_NOCLIP = '1';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const memory = new Map();
const sysP = require.resolve(path.join(REPO, 'core/utils/system.js'));
require.cache[sysP] = { id: sysP, filename: sysP, loaded: true, exports: {
  get: (k, f = null) => (memory.has(k) ? memory.get(k) : f), getFresh: async (k, f = null) => (memory.has(k) ? memory.get(k) : f),
  set: async (k, v) => { memory.set(k, v); }, loadSystemData: async () => {} } };
const bcP = require.resolve(path.join(REPO, 'botConfig.js'));
require.cache[bcP] = { id: bcP, filename: bcP, loaded: true, exports: { getBotId: () => 'qa', getPrefix: () => '.j', get: () => null } };

const noir = require(path.join(REPO, 'core/games/murdermystery/noir.js'));
const characters = require(path.join(REPO, 'core/games/murdermystery/characters.js'));
const I = noir._internal;
const ASSET = path.join(REPO, 'core/games/murdermystery/assets');
let passed = 0; const ok = (n) => { passed++; console.log('  ✓ ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- A0: every cast member has its own sprite file
  for (const c of characters.CHARACTERS) assert.ok(fs.existsSync(path.join(ASSET, 'char', c.sprite)), 'sprite exists for ' + c.id);
  assert.equal(new Set(characters.CHARACTERS.map((c) => c.sprite)).size, characters.CHARACTERS.length, 'no two characters share a face file');
  ok('A0 every character has a unique, existing sprite (' + characters.CHARACTERS.length + ' cast)');

  // ---- A: story invariants over many random deals
  for (let iter = 0; iter < 300; iter++) {
    const n = 4 + (iter % 5);
    const game = I.makeGame({ chatId: 'x' + iter, senderJid: 'p1@s.whatsapp.net', senderName: 'P1' });
    game.players = Array.from({ length: n }, (_, i) => ({ jid: 'p' + (i + 1) + '@s.whatsapp.net', name: 'P' + (i + 1), alive: true, knownClues: [], char: null, role: null }));
    I.dealCase(game);
    const cs = game.case, killer = game.players.find((p) => p.role === 'KILLER');
    const all = Object.values(cs.searchIndex).flat();
    assert.equal(new Set(all.map((c) => c.cid)).size, all.length, 'cids unique');
    const murderList = cs.searchIndex[cs.murderRoomId];
    assert.ok(murderList.some((c) => c.kind === 'method') && murderList.some((c) => c.isTrace), 'murder room has method + trace');
    for (const [roomId, list] of Object.entries(cs.searchIndex)) {
      assert.ok(list.length <= 3, 'room clue cap');
      for (const c of list) {
        assert.ok(c.slot && /PM$/.test(c.slot), 'clue has an hour');
        assert.ok(c.art === null || fs.existsSync(path.join(ASSET, 'clues', c.art)), 'art exists: ' + c.art);
        if (c.kind === 'presence') {
          assert.equal(cs.truth[c.who][c.slot], roomId, 'presence clue sits in the room that guest REALLY was in at that hour');
          assert.ok(game.players.some((p) => p.char.id === c.who), 'clue names a seated guest');
        }
      }
      const rs = list.map((c) => c.round); assert.deepEqual(rs, rs.slice().sort((a, b) => a - b), 'room finds ordered by round');
    }
    const kc = all.find((c) => c.kind === 'presence' && c.who === killer.char.id);
    assert.ok(kc && kc.slot === '10 PM', 'killer 10 PM item exists');
    assert.notEqual(kc.roomId, cs.claims[killer.char.id]['10 PM'].room, 'killer item contradicts their 10 PM claim');
    for (const p of game.players) if (p.role !== 'KILLER') for (const c of all) if (c.kind === 'presence' && c.who === p.char.id) assert.ok(!cs.claims[p.char.id][c.slot].lie || c.slot === '9 PM', 'innocent clue never contradicts a truthful claim');
    assert.ok(all.length >= 4, 'enough clues to play (' + all.length + ')');
  }
  ok('A1 300 random deals: clues are unique, hour-stamped, true to the case, killer alibi breakable');

  // ---- B: live flow
  const sent = []; const SOCK = { sendMessage: async (to, content) => { sent.push({ to, content }); return true; } };
  const GROUP = '120363@g.us', jid = (n) => 'p' + n + '@s.whatsapp.net';
  const ctx = (n, rest, isGroup) => ({ sock: SOCK, chatId: isGroup ? GROUP : jid(n), senderJid: jid(n), senderName: 'Guest' + n, rest, isGroup, prefix: '.j' });
  const svc = { getSock: () => SOCK };
  const run = (n, rest, isGroup = true) => noir.handleCommand(ctx(n, rest, isGroup), svc);
  const imgsTo = (to) => sent.filter((s) => s.to === to && s.content.image);
  await run(1, 'create'); for (let n = 2; n <= 6; n++) await run(n, 'join');
  await run(1, 'start');
  const game = I.games.get(GROUP);
  for (let i = 0; i < 60 && game.phase !== 'SEARCH'; i++) await sleep(150);
  assert.equal(game.phase, 'SEARCH', 'reached SEARCH');
  ok('B1 6-guest game started, SEARCH open');

  // find clues: each guest searches the room that has the earliest unfound clue
  const roomWithClue = game.rooms.findIndex((r) => (game.case.searchIndex[r.id] || []).some((c) => c.round <= game.round));
  assert.ok(roomWithClue >= 0, 'a findable clue exists in round 1');
  const before = imgsTo(jid(1)).length;
  assert.ok(await noir.relay(SOCK, jid(1), jid(1), String(roomWithClue + 1)), 'relay handled the search');
  await sleep(1500);
  const popups = imgsTo(jid(1)).slice(before);
  assert.ok(popups.length >= 1, 'finder got an image in DM');
  const cap = popups[popups.length - 1].content.caption;
  assert.ok(/NEW CLUE/.test(cap) && /SHARE/.test(cap) && /clipboard/.test(cap), 'popup caption says how to view it');
  assert.ok(popups[popups.length - 1].content.image.length > 100000, 'popup is a full-size card (' + popups[popups.length - 1].content.image.length + ' bytes)');
  ok('B2 finding a clue pops up the full clipboard in DM with how-to-view');

  // SHARE -> group board image + shared board state
  const gBefore = imgsTo(GROUP).length;
  await noir.relay(SOCK, jid(1), jid(1), 'share'); await sleep(2800);
  assert.equal(game.boardClues.length, 1, 'clue recorded on shared board');
  assert.ok(imgsTo(GROUP).length > gBefore, 'group got the board image');
  ok('B3 SHARE pins the clue to the shared board and posts the clipboard to the group');

  // clipboard command: group + DM
  const g2 = imgsTo(GROUP).length; await sleep(12100);
  await run(2, 'clipboard'); await sleep(2800);
  assert.ok(imgsTo(GROUP).length > g2, '`mm clipboard` posts the shared board in the group');
  const d2 = imgsTo(jid(3)).length; await run(3, 'clipboard', false); await sleep(600);
  assert.ok(imgsTo(jid(3)).length > d2, 'DM clipboard sends a private board');
  const d3 = imgsTo(jid(4)).length; await noir.relay(SOCK, jid(4), jid(4), 'clip'); await sleep(600);
  assert.ok(imgsTo(jid(4)).length > d3, 'bare DM `clip` works via relay');
  ok('B4 clipboard command works in group, DM and bare-DM relay');

  // pin / unpin / limits
  await run(2, 'pin 3'); await run(2, 'pin 3');
  assert.equal(game.pins.length, 1, 'duplicate pin ignored');
  await run(2, 'pin 4'); await run(2, 'pin 5'); await run(2, 'pin 6'); await run(1, 'pin 2');
  assert.equal(game.pins.length, 4, 'pin cap is 4');
  await run(2, 'unpin 3'); assert.equal(game.pins.length, 3, 'unpin works');
  await run(3, 'pin 3'); assert.equal(game.pins.length, 3, 'cannot pin yourself');
  await noir.relay(SOCK, jid(5), jid(5), 'pin 1'); assert.ok(game.pins.length === 4, 'DM pin works and is public');
  ok('B5 pin / unpin / cap / self-pin / DM pin');

  // press records public claims, shown on pinned card
  await run(2, 'press 3'); assert.ok(game.claimsPublic[game.players[2].char.id], 'press records public claims');
  const opts = I.clipboardOpts(game, game.players[1], 'shared'); const out = require(path.join(REPO, 'core/games/murdermystery/noirClipboard.js'));
  const png = await out.renderClipboard(opts); assert.ok(png && png.length > 100000, 'final shared board renders');
  ok('B6 pinned cards carry public statements; board renders');

  // persistence round trip keeps board
  I.persist(); const saved = memory.get('murder_noir_games_v1_qa'); assert.ok(saved && saved[GROUP].boardClues.length === 1 && saved[GROUP].pins.length === 4, 'board persisted');
  ok('B7 board + pins persist');
  console.log('\nALL ' + passed + ' CHECK GROUPS PASSED');
  process.exit(0);
})().catch((e) => { console.error('\n✗ FAIL:', e.stack || e.message); process.exit(1); });
