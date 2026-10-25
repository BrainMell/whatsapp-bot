#!/usr/bin/env node
'use strict';

// Offline deterministic-shape QA for Blackvale Story Mode.
// No WhatsApp connection, MongoDB writes, or image rendering is required.

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Keep this harness offline and side-effect free. Story Mode's game rules use
// the existing system-data API, but tests only need a small in-memory store.
const memory = new Map();
const systemPath = require.resolve(path.join(__dirname, '..', 'core', 'utils', 'system.js'));
const botConfigPath = require.resolve(path.join(__dirname, '..', 'botConfig.js'));
require.cache[systemPath] = {
  id: systemPath,
  filename: systemPath,
  loaded: true,
  exports: {
    get: (key, fallback = null) => memory.has(key) ? memory.get(key) : fallback,
    getFresh: async (key, fallback = null) => memory.has(key) ? memory.get(key) : fallback,
    set: async (key, value) => { memory.set(key, value); },
    loadSystemData: async () => {},
  },
};
require.cache[botConfigPath] = {
  id: botConfigPath,
  filename: botConfigPath,
  loaded: true,
  exports: { getBotId: () => 'story-qa-bot' },
};

const story = require('../core/games/murdermystery/storyMode');

const { makeGame, makeCase, roleDeck, findTarget, findRoom, verdict, accusationTally, isClueDiscoverable } = story._internal;

function player(jid, name) {
  return {
    jid: jid + '@s.whatsapp.net',
    name,
    alive: true,
    joinedAt: Date.now(),
    role: null,
    char: null,
    knownClues: [],
    sharedClues: 0,
    searchesByPhase: {},
    questionsUsed: 0,
    questionsByPhase: {},
    nightAct: null,
    objective: null,
    secret: null,
  };
}

const roleExpectations = [
  [4, { KILLER: 1, INVESTIGATOR: 1, GUARDIAN: 0, MEDIUM: 0, ACCOMPLICE: 0 }],
  [5, { KILLER: 1, INVESTIGATOR: 1, GUARDIAN: 1, MEDIUM: 0, ACCOMPLICE: 0 }],
  [6, { KILLER: 1, INVESTIGATOR: 1, GUARDIAN: 1, MEDIUM: 1, ACCOMPLICE: 0 }],
  [8, { KILLER: 1, INVESTIGATOR: 1, GUARDIAN: 1, MEDIUM: 1, ACCOMPLICE: 1 }],
];

for (const [count, expected] of roleExpectations) {
  const roles = roleDeck(count);
  const actual = Object.fromEntries(['KILLER', 'INVESTIGATOR', 'GUARDIAN', 'MEDIUM', 'ACCOMPLICE']
    .map((role) => [role, roles.filter((r) => r === role).length]));
  for (const role of Object.keys(expected)) assert.equal(actual[role], expected[role], count + '-player role count for ' + role);
  assert.equal(roles.length, count, count + '-player role deck must fill every seat');
}

const ctx = {
  chatId: 'story-qa@g.us',
  senderJid: '233240000001@s.whatsapp.net',
  name: 'QA Host',
  prefix: '.j',
};
const game = makeGame(ctx);
for (let i = 2; i <= 8; i++) game.players.push(player('23324000000' + i, 'Guest ' + i));
makeCase(game);

const assetRoot = path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'assets');
const caseContent = require('../core/games/murdermystery/cases');
const characterContent = require('../core/games/murdermystery/characters');
for (const room of caseContent.ROOMS) {
  assert.ok(fs.existsSync(path.join(assetRoot, 'bg', room.id + '.jpg')), 'scene background exists: ' + room.id);
}
for (const char of characterContent.CHARACTERS) {
  assert.ok(fs.existsSync(path.join(assetRoot, 'char', char.sprite)), 'character sprite exists: ' + char.sprite);
}

assert.equal(game.mode, 'STORY', 'new game identifies itself as Story Mode');
assert.equal(game.players.length, 8, 'test roster is preserved');
assert.equal(game.rooms.length, 6, 'case uses six selected locations');
assert.ok(game.case && game.case.motive && game.case.timeline.length >= 4, 'case truth is generated before play');
assert.equal(game.players.filter((p) => p.role === 'KILLER').length, 1, 'Story Mode has a single killer in its first ruleset');
assert.equal(game.killerJid, game.players.find((p) => p.role === 'KILLER').jid, 'killer identity matches the dealt role');
assert.ok(game.murderRoomId && game.rooms.some((r) => r.id === game.murderRoomId), 'crime scene exists inside the selected map');
assert.ok(game.evidence.length >= game.players.length + 5, 'case generates enough distinct leads for a full roster');
assert.equal(new Set(game.evidence.map((e) => e.id)).size, game.evidence.length, 'evidence IDs are unique');
for (const clue of game.evidence) {
  assert.ok(fs.existsSync(path.join(assetRoot, 'clues', clue.art)), 'evidence illustration exists: ' + clue.art);
}
assert.ok(game.players.every((p) => p.char && p.statement && p.secret && p.objective), 'each character has an account, secret, and objective');
const privateClue = game.evidence.find((e) => e.secretForJid);
assert.ok(privateClue, 'case creates player-specific private notes');
const privateOwner = game.players.find((p) => p.jid === privateClue.secretForJid);
const otherPlayer = game.players.find((p) => p.jid !== privateClue.secretForJid);
assert.ok(isClueDiscoverable(privateClue, privateOwner), 'the owner can discover their private note');
assert.equal(isClueDiscoverable(privateClue, otherPlayer), false, 'other players cannot discover a private note');
assert.equal(new Set(game.players.map((p) => p.char.id)).size, game.players.length, 'a cast does not duplicate a character ID');

const killer = game.players.find((p) => p.role === 'KILLER');
assert.equal(findTarget(game, String(game.players.indexOf(killer) + 1)).player.jid, killer.jid, 'roster-number targeting works');
assert.equal(findTarget(game, killer.char.name).player.jid, killer.jid, 'character-name targeting works');
assert.ok(findRoom(game, '1'), 'room-number lookup works');
assert.ok(findRoom(game, game.rooms[0].name), 'room-name lookup works');

const nonKillerTarget = game.players.find((p) => p.jid !== killer.jid);
const secondTarget = game.players.find((p) => p.jid !== killer.jid && p.jid !== nonKillerTarget.jid);
game.accusations = {
  [game.players[0].jid]: { targetJid: nonKillerTarget.jid, evidenceIds: [] },
  [game.players[1].jid]: { targetJid: nonKillerTarget.jid, evidenceIds: ['E01'] },
  [game.players[2].jid]: { targetJid: secondTarget.jid, evidenceIds: [] },
};
const tallies = accusationTally(game);
assert.equal(tallies[0].player.jid, nonKillerTarget.jid, 'most-accused suspect appears first');
assert.equal(tallies[0].count, 2, 'formal accusations are tallied by target');
assert.match(story._internal.accusationTallyLine(game), /Sealed accusations received/, 'accusation tally has a public phase announcement');

game.phase = 'VOTING';
game.votes = {
  voter1: killer.jid,
  voter2: killer.jid,
  voter3: killer.jid,
  voter4: killer.jid,
  voter5: killer.jid,
};
assert.equal(verdict(game).targetJid, killer.jid, 'strict majority can return the killer');
game.votes = { voter1: killer.jid, voter2: killer.jid, voter3: killer.jid };
assert.equal(verdict(game).targetJid, null, 'under-majority count cannot convict');
game.votes = { voter1: killer.jid, voter2: killer.jid, voter3: 'skip', voter4: 'skip' };
assert.equal(verdict(game).targetJid, null, 'skip ballots do not create a conviction');

const dispatcher = fs.readFileSync(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'index.js'), 'utf8');
assert.match(dispatcher, /if\s*\(\['story',\s*'chronicle',\s*'casefiles'\]\.includes\(requestedMode\)\)/, 'Story Mode is routed from the existing Murder Mystery dispatcher');
assert.match(dispatcher, /storyMode\.hasActiveGame\(ctx\.chatId\)/, 'the dispatcher prevents Classic and Story Mode overlap in a group');

console.log('Story Mode QA passed: role decks, case generation, private clue ownership, assets, accusation tally, routing, and verdict thresholds.');
