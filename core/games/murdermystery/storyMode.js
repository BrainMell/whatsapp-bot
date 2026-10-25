// Blackvale Story Mode
// A separate, case-driven mystery mode. It intentionally does not reuse the
// classic mode's game map, timers, lobby, votes, silence gate, or state key.
// It reuses only the authored Blackvale content and bundled art libraries.

const system = require('../../utils/system');
const botConfig = require('../../../botConfig');
const characters = require('./characters');
const cases = require('./cases');
const caseGen = require('./caseGen');
const cards = require('./cards');

const MODE_NAME = 'THE LAST INVITATION';
const STATE_KEY = 'murder_mm_story_games_v1';
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;
const LOBBY_TTL_MS = 30 * 60 * 1000;
const GAME_TTL_MS = 24 * 60 * 60 * 1000;
const QA_CLOCK = process.env.MM_STORY_QA_CLOCK === '1';
const DURATIONS = QA_CLOCK
  ? { INVESTIGATION: 6000, NIGHT: 5000, DISCUSSION: 6000, VOTING: 5000 }
  : { INVESTIGATION: 4 * 60 * 1000, NIGHT: 90 * 1000, DISCUSSION: 3 * 60 * 1000, VOTING: 75 * 1000 };

const games = new Map();
const timers = new Map();
let loaded = false;
let runtime = {};

function normJid(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

function botIdSafe() {
  try { return botConfig.getBotId() || 'global'; } catch (_) { return 'global'; }
}

function stateKey() {
  return STATE_KEY + '_' + botIdSafe();
}

function persist() {
  const saved = {};
  for (const [chatId, game] of games) {
    const clean = {};
    for (const key of Object.keys(game)) {
      if (key[0] !== '_') clean[key] = game[key];
    }
    saved[chatId] = clean;
  }
  try {
    const result = system.set(stateKey(), saved);
    if (result && typeof result.catch === 'function') result.catch((e) => console.error('[MM Story] persist failed:', e.message));
  } catch (e) {
    console.error('[MM Story] persist failed:', e.message);
  }
}

function clearTimer(chatId) {
  const timer = timers.get(chatId);
  if (timer) clearTimeout(timer);
  timers.delete(chatId);
}

function loadPersisted() {
  if (loaded) return;
  loaded = true;
  const saved = system.get(stateKey(), {});
  const now = Date.now();
  for (const [chatId, game] of Object.entries(saved || {})) {
    if (!game || !game.phase) continue;
    if (game.phase === 'LOBBY' && now - (game.createdAt || now) > LOBBY_TTL_MS) continue;
    if (game.phase !== 'FINISHED' && now - (game.updatedAt || game.createdAt || now) > GAME_TTL_MS) continue;
    game._sock = null;
    game._transitioning = false;
    games.set(chatId, game);
  }
}

function isGroup(ctx) {
  return !!ctx.isGroup || String(ctx.chatId || '').endsWith('@g.us');
}

function senderId(ctx) {
  return normJid(ctx.senderJid || ctx.sender || '');
}

function senderName(ctx) {
  return String(ctx.name || ctx.senderName || ctx.pushName || 'Guest').trim().slice(0, 60) || 'Guest';
}

function playerByJid(game, jid) {
  const id = normJid(jid);
  return game.players.find((p) => normJid(p.jid) === id) || null;
}

function gameForContext(ctx) {
  loadPersisted();
  if (isGroup(ctx)) return games.get(ctx.chatId) || null;
  const id = senderId(ctx);
  let match = null;
  for (const game of games.values()) {
    if (playerByJid(game, id) && (!match || (game.createdAt || 0) > (match.createdAt || 0))) match = game;
  }
  return match;
}

function bindContext(ctx, game) {
  if (!game) return;
  if (ctx.sock) game._sock = ctx.sock;
  game.updatedAt = Date.now();
  if (game.phase !== 'LOBBY' && game.phase !== 'FINISHED' && !timers.has(game.chatId)) schedulePhase(game);
}

async function groupText(game, text, extra) {
  try {
    if (!game || !game._sock) return false;
    if (runtime.sendGroup) return await runtime.sendGroup(game._sock, game.chatId, text, extra || {});
    await game._sock.sendMessage(game.chatId, { text: text, ...(extra || {}) });
    return true;
  } catch (e) {
    console.error('[MM Story] group send failed:', e.message);
    return false;
  }
}

async function groupImage(game, buf, caption) {
  if (!buf) return false;
  try {
    if (runtime.sendGroupImage) return await runtime.sendGroupImage(game._sock, game.chatId, buf, caption || '');
    await game._sock.sendMessage(game.chatId, { image: buf, caption: caption || '' });
    return true;
  } catch (e) {
    console.error('[MM Story] group image failed:', e.message);
    return false;
  }
}

async function privateText(game, player, text) {
  try {
    if (!game || !game._sock || !player || !player.jid) return false;
    if (runtime.sendDM) return await runtime.sendDM(game._sock, player.jid, text);
    await game._sock.sendMessage(player.jid, { text: text });
    return true;
  } catch (e) {
    console.error('[MM Story] DM failed:', e.message);
    return false;
  }
}

async function privateImage(game, player, buf, caption) {
  if (!buf) return false;
  try {
    await game._sock.sendMessage(player.jid, { image: buf, caption: caption || '' });
    return true;
  } catch (e) {
    console.error('[MM Story] private image failed:', e.message);
    return false;
  }
}

function pick(list) {
  return list && list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

function shuffle(list) {
  const copy = (list || []).slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function nextEvidenceId(game) {
  const max = (game.evidence || []).reduce((n, clue) => Math.max(n, Number(String(clue.id || '').replace(/\D/g, '')) || 0), 0);
  return 'E' + String(max + 1).padStart(2, '0');
}

function roleDeck(count) {
  const roles = ['KILLER', 'INVESTIGATOR'];
  if (count >= 5) roles.push('GUARDIAN');
  if (count >= 6) roles.push('MEDIUM');
  if (count >= 8) roles.push('ACCOMPLICE');
  while (roles.length < count) roles.push('CIVILIAN');
  return shuffle(roles);
}

function roleLabel(role) {
  return ({
    KILLER: 'The Killer',
    INVESTIGATOR: 'Investigator',
    GUARDIAN: 'Guardian',
    MEDIUM: 'Medium',
    ACCOMPLICE: 'Accomplice',
    CIVILIAN: 'Guest',
  })[role] || 'Guest';
}

function roomById(game, id) {
  return (game.rooms || []).find((room) => room.id === id) || null;
}

function roomForBeat(game, beat, index) {
  if (beat && beat.room) {
    const found = game.rooms.find((r) => r.id === beat.room || r.name.toLowerCase() === String(beat.room).toLowerCase());
    if (found) return found;
  }
  return game.rooms[(index + 1) % game.rooms.length];
}

function buildEvidence(game, generated) {
  const out = [];
  const method = caseGen.METHOD_EVIDENCE[game.murderMethod] || {};
  out.push({
    id: 'E01',
    itemName: method.name || game.murderMethod,
    art: method.art || 'letter_opener.jpg',
    tag: 'confirmed',
    line: method.line || 'Something at the scene does not belong where it was found.',
    roomId: game.murderRoomId,
    kind: 'method',
    supportsKiller: true,
    discovered: false,
    shared: false,
    manipulated: false,
    insight: 'This object supports the proposed method of the crime, but it does not prove who handled it.',
  });

  (generated.timeline || []).slice(0, 5).forEach((beat, i) => {
    const room = roomForBeat(game, beat, i);
    out.push({
      id: 'E' + String(out.length + 1).padStart(2, '0'),
      itemName: 'Timeline fragment',
      art: 'pocket_watch.jpg',
      tag: 'confirmed',
      line: String(beat.hour || 'An unknown hour') + ': ' + String(beat.text || 'A guest moved through the house.'),
      roomId: room.id,
      kind: 'timeline',
      supportsKiller: true,
      discovered: false,
      shared: false,
      manipulated: false,
      insight: 'This is a fixed event in the evening timeline. Compare its hour and location against the statements in the case.',
    });
  });

  const bound = caseGen.bindEvidence({
    kase: generated,
    cast: game.players.map((p) => p.char),
    killerCharIds: [game.killerCharId],
    livingCharIds: game.players.map((p) => p.char.id),
    room: game.murderRoomId,
    method: game.murderMethod,
    hour: game.murderHour,
  });
  const rumour = (bound && bound.public || []).find((item) => item.tag === 'rumour');
  if (rumour) {
    out.push({
      id: 'E' + String(out.length + 1).padStart(2, '0'),
      itemName: rumour.name || 'Unclaimed personal item',
      art: rumour.art || 'torn_letter.jpg',
      tag: 'rumour',
      line: rumour.line || 'An item was found where it does not belong.',
      roomId: pick(game.rooms).id,
      kind: 'personal-item',
      linkedCharId: rumour.linkedCharId || null,
      supportsKiller: false,
      discovered: false,
      shared: false,
      manipulated: false,
      insight: 'This is circumstantial. It may point to a person, but it does not establish who placed the item or why.',
    });
  }

  const relation = pick(generated.web || []);
  if (relation) {
    out.push({
      id: 'E' + String(out.length + 1).padStart(2, '0'),
      itemName: 'Private correspondence',
      art: 'torn_letter.jpg',
      tag: 'rumour',
      line: relation.frame || 'A private connection binds two people in the house.',
      roomId: pick(game.rooms).id,
      kind: 'relationship',
      linkedCharId: null,
      supportsKiller: false,
      discovered: false,
      shared: false,
      manipulated: false,
      insight: 'This establishes a relationship or motive to investigate. It is not proof of murder.',
    });
  }

  for (const player of game.players) {
    const secret = generated.secrets && generated.secrets[player.char.id];
    if (!secret) continue;
    const room = pick(game.rooms);
    out.push({
      id: 'E' + String(out.length + 1).padStart(2, '0'),
      itemName: 'A sealed personal note',
      art: 'torn_letter.jpg',
      tag: 'rumour',
      line: 'A note implicates an unnamed guest: ' + String(secret.text || 'someone concealed a private matter') + '.',
      roomId: room.id,
      kind: 'secret-note',
      linkedCharId: player.char.id,
      supportsKiller: false,
      discovered: false,
      shared: false,
      manipulated: false,
      secretForJid: player.jid,
      insight: 'This note exposes a private matter, not necessarily a motive for murder.',
    });
  }
  return out;
}

function objectiveFor(role) {
  if (role === 'KILLER') return { id: 'escape', text: 'Survive the final verdict and keep your motive from becoming common knowledge.' };
  if (role === 'ACCOMPLICE') return { id: 'mislead', text: 'Make at least one false lead believable without being exposed.' };
  return pick([
    { id: 'search', text: 'Find at least two clues before the verdict.' },
    { id: 'share', text: 'Share one useful piece of evidence with the group.' },
    { id: 'question', text: 'Question two different suspects.' },
    { id: 'secret', text: 'Keep your personal secret out of the public record.' },
  ]);
}

function objectiveComplete(player, game, winner) {
  const id = player.objective && player.objective.id;
  if (id === 'escape') return winner === 'killer' && !game.exposedSecrets[player.jid];
  if (id === 'mislead') return !!player.misdirectionSucceeded && winner === 'killer';
  if (id === 'search') return (player.knownClues || []).length >= 2;
  if (id === 'share') return (player.sharedClues || 0) >= 1;
  if (id === 'question') return (player.questionsUsed || 0) >= 2;
  if (id === 'secret') return !game.exposedSecrets[player.jid];
  return false;
}

function makeGame(ctx) {
  return {
    mode: 'STORY',
    chatId: ctx.chatId,
    phase: 'LOBBY',
    host: senderId(ctx),
    hostName: senderName(ctx),
    prefix: ctx.prefix || '.j',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    phaseStartedAt: Date.now(),
    deadline: null,
    players: [{
      jid: ctx.senderJid,
      name: senderName(ctx),
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
    }],
    rooms: [],
    evidence: [],
    publicClueIds: [],
    votes: {},
    accusations: {},
    nightActions: {},
    exposedSecrets: {},
    events: [],
    round: 1,
    case: null,
    victim: 'Lord Edmund Blackvale',
    killerJid: null,
    killerCharId: null,
    murderRoomId: null,
    murderMethod: null,
    murderHour: null,
    _sock: ctx.sock || null,
  };
}

function makeCase(game) {
  game.rooms = shuffle(cases.ROOMS).slice(0, 6);
  const cast = shuffle(characters.CHARACTERS).slice(0, game.players.length);
  const roles = roleDeck(game.players.length);
  game.players.forEach((player, index) => {
    const ch = cast[index];
    player.char = { id: ch.id, name: ch.name, title: ch.title, sprite: ch.sprite };
    player.role = roles[index];
    player.knownClues = [];
    player.sharedClues = 0;
    player.searchesByPhase = {};
    player.questionsUsed = 0;
    player.questionsByPhase = {};
    player.nightAct = null;
    player.objective = objectiveFor(player.role);
    player.secret = null;
  });
  const killer = game.players.find((p) => p.role === 'KILLER');
  if (!killer) throw new Error('Story mode could not deal a killer.');
  game.killerJid = killer.jid;
  game.killerCharId = killer.char.id;
  let generated = null;
  for (let attempt = 0; attempt < 3 && !generated; attempt++) {
    generated = caseGen.generateCase({
      cast: game.players.map((p) => p.char),
      killers: [killer.char],
      rooms: game.rooms,
      methodTitles: cases.METHODS.map((m) => m.title),
    });
  }
  if (!generated) throw new Error('The case generator rejected the cast.');
  game.case = generated;
  game.murderRoomId = pick(game.rooms).id;
  game.murderMethod = pick(generated.methodPlan) || 'a letter opener';
  game.murderHour = (generated.timeline[Math.floor(generated.timeline.length / 2)] || {}).hour || 'midnight';
  game.evidence = buildEvidence(game, generated);
  game.publicClueIds = [];
  game.votes = {};
  game.accusations = {};
  game.nightActions = {};
  game.exposedSecrets = {};
  game.events = [];
  game.players.forEach((player) => {
    const secret = generated.secrets && generated.secrets[player.char.id];
    player.secret = secret ? String(secret.text || 'You are keeping a private matter hidden.') : 'You are keeping a private matter hidden.';
    player.statement = caseGen.statementFor(generated, player.char.id) || {
      account: 'You were somewhere in the house, but remember little.',
      observation: 'Someone crossed the hall after the clocks struck.',
      hour: game.murderHour,
      room: game.rooms[0].name,
    };
    const ties = (generated.web || []).filter((w) => w.a === player.char.id || w.b === player.char.id);
    const tie = pick(ties);
    player.relationship = tie ? String(tie.frame || 'A private connection links you to another guest.') : 'You have an unresolved history with someone in the house.';
  });
}

function findTarget(game, raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const numbered = /^#?(\d+)(?:\s+|$)/.exec(text);
  if (numbered) {
    const idx = Number(numbered[1]) - 1;
    if (idx >= 0 && idx < game.players.length) return { player: game.players[idx], rest: text.slice(numbered[0].length).trim() };
  }
  const normalized = text.toLowerCase();
  const candidates = [];
  for (const p of game.players) {
    candidates.push({ p, name: String(p.name || '').toLowerCase() });
    if (p.char) candidates.push({ p, name: String(p.char.name || '').toLowerCase() });
  }
  candidates.sort((a, b) => b.name.length - a.name.length);
  for (const c of candidates) {
    if (normalized === c.name || normalized.startsWith(c.name + ' ')) {
      return { player: c.p, rest: text.slice(c.name.length).trim() };
    }
  }
  return null;
}

function findRoom(game, raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return null;
  const numbered = /^#?(\d+)$/.exec(text);
  if (numbered) return game.rooms[Number(numbered[1]) - 1] || null;
  return game.rooms.find((room) => room.id === text || room.name.toLowerCase() === text || room.name.toLowerCase().includes(text)) || null;
}

function playerForAction(ctx, game) {
  return playerByJid(game, senderId(ctx));
}

function remainingMs(game) {
  return Math.max(0, Number(game.deadline || 0) - Date.now());
}

function timeLabel(ms) {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(secs / 60);
  return mins ? mins + 'm ' + (secs % 60) + 's' : secs + 's';
}

function setPhase(game, phase, announcement) {
  clearTimer(game.chatId);
  game.phase = phase;
  game.phaseStartedAt = Date.now();
  game.deadline = phase === 'FINISHED' || phase === 'LOBBY' ? null : Date.now() + DURATIONS[phase];
  game.updatedAt = Date.now();
  game.events.push({ at: Date.now(), phase: phase, text: announcement || '' });
  persist();
  if (announcement) void groupText(game, announcement);
  if (game.deadline) schedulePhase(game);
}

function schedulePhase(game) {
  clearTimer(game.chatId);
  if (!game.deadline || game.phase === 'LOBBY' || game.phase === 'FINISHED') return;
  const wait = Math.max(1, game.deadline - Date.now());
  const timer = setTimeout(() => {
    timers.delete(game.chatId);
    advancePhase(game.chatId).catch((e) => console.error('[MM Story] phase advance failed:', e.message));
  }, wait);
  timers.set(game.chatId, timer);
  if (typeof timer.unref === 'function') timer.unref();
}

async function resolveNight(game) {
  const actions = Object.values(game.nightActions || {});
  const protections = actions.filter((a) => a.type === 'protect').map((a) => normJid(a.targetJid));
  const killerAction = actions.find((a) => normJid(a.actorJid) === normJid(game.killerJid));
  const accompliceAction = actions.find((a) => a.type === 'spread');
  const investigatorActions = actions.filter((a) => a.type === 'compare');
  const mediumActions = actions.filter((a) => a.type === 'seance');
  const newlyExposed = [];

  if (killerAction && killerAction.type === 'frame') {
    const target = playerByJid(game, killerAction.targetJid);
    const targetProtected = protections.includes(normJid(killerAction.targetJid));
    if (target && !targetProtected) {
      const item = (game.case.personalItems || {})[target.char.id] || {};
      const clue = {
        id: nextEvidenceId(game),
        itemName: item.name || 'A guest’s personal item',
        art: item.art || 'torn_letter.jpg',
        tag: 'rumour',
        line: 'A personal trace tied to ' + target.name + ' appears near the ' + (roomById(game, killerAction.roomId) || roomById(game, game.murderRoomId)).name + '. It may have been left there, or placed there.',
        roomId: killerAction.roomId || game.murderRoomId,
        kind: 'planted-trace',
        linkedCharId: target.char.id,
        supportsKiller: false,
        discovered: false,
        shared: false,
        manipulated: true,
        plantedByJid: game.killerJid,
        insight: 'The trace has signs of deliberate placement. It is not reliable proof against the person it appears to implicate.',
      };
      game.evidence.push(clue);
      game.events.push({ at: Date.now(), type: 'planted-trace', clueId: clue.id });
      await groupText(game, '🕯️ A drawer is found freshly disturbed. Something has been moved in the dark, but the house cannot say what.');
    } else if (target) {
      await groupText(game, '🕯️ Someone tried to redirect the case, but another guest’s protection spoiled the attempt.');
    }
  } else if (killerAction && killerAction.type === 'blackmail') {
    const target = playerByJid(game, killerAction.targetJid);
    if (target && !protections.includes(normJid(killerAction.targetJid))) {
      game.exposedSecrets[target.jid] = true;
      newlyExposed.push({ player: target, secret: target.secret });
    } else if (target) {
      await groupText(game, '🕯️ A private letter was intercepted before it reached the table.');
    }
  }

  if (accompliceAction) {
    const target = playerByJid(game, accompliceAction.targetJid);
    if (target && !protections.includes(normJid(accompliceAction.targetJid))) {
      const clue = {
        id: nextEvidenceId(game),
        itemName: 'Unsigned accusation',
        art: 'torn_letter.jpg',
        tag: 'rumour',
        line: 'An unsigned note tries to associate ' + target.name + ' with the crime, but gives no verifiable detail.',
        roomId: accompliceAction.roomId || game.murderRoomId,
        kind: 'misdirection',
        linkedCharId: target.char.id,
        supportsKiller: false,
        discovered: false,
        shared: false,
        manipulated: true,
        plantedByJid: accompliceAction.actorJid,
        insight: 'The note is anonymous and gives no verifiable source. Treat it as a lead, not proof.',
      };
      game.evidence.push(clue);
      const actor = playerByJid(game, accompliceAction.actorJid);
      if (actor) actor.misdirectionSucceeded = true;
      await groupText(game, '🎭 An unsigned accusation appears under the study door. No one claims to have written it.');
    } else if (target) {
      await groupText(game, '🎭 An unsigned accusation is intercepted before it can spread.');
    }
  }

  for (const action of investigatorActions) {
    const actor = playerByJid(game, action.actorJid);
    const target = playerByJid(game, action.targetJid);
    if (!actor || !target) continue;
    const result = normJid(target.jid) === normJid(game.killerJid)
      ? 'One part of this account conflicts with a fixed event in the case timeline. This is a meaningful inconsistency, not proof of guilt.'
      : 'The account currently fits the known timeline. Missing evidence may change that conclusion.';
    await privateText(game, actor, '🕵️ *PRIVATE COMPARISON: ' + target.name + '*\n\n' + result);
  }

  for (const action of mediumActions) {
    const actor = playerByJid(game, action.actorJid);
    if (!actor) continue;
    const room = roomById(game, game.murderRoomId);
    const method = game.murderMethod;
    await privateText(game, actor, '🕯️ *THE LAST MEMORY*\n\nA scent of ' + (String(method).includes('claret') ? 'spilled wine' : String(method).includes('poison') ? 'bitter herbs' : 'cold metal') +
      ' lingers in the dark. The memory pulls towards ' + (room ? room.name : 'the western wing') + ', but gives no face, no voice, and no certain name.\n\nUse the room clue with other evidence. The dead can remember a place without recognising a killer.');
  }

  for (const entry of newlyExposed) {
    await groupText(game, '📜 *A secret reaches the table.* ' + entry.player.name + ' had been hiding this: ' + entry.secret);
  }
  game.nightActions = {};
  persist();
}

async function advancePhase(chatId) {
  const game = games.get(chatId);
  if (!game || game.phase === 'LOBBY' || game.phase === 'FINISHED' || game._transitioning) return;
  if (game.deadline && Date.now() + 100 < game.deadline) {
    schedulePhase(game);
    return;
  }
  game._transitioning = true;
  try {
    if (game.phase === 'INVESTIGATION') {
      setPhase(game, 'NIGHT', '🌑 *The house falls silent.* Hidden actions are open for 90 seconds. Use ' + game.prefix + ' murder story dossier privately to check your role action. Never reveal private instructions in the group.');
    } else if (game.phase === 'NIGHT') {
      await resolveNight(game);
      setPhase(game, 'DISCUSSION', '🕯️ *The bell rings again.* The house is open for a final investigation and public questions. Build a theory before the verdict.');
    } else if (game.phase === 'DISCUSSION') {
      setPhase(game, 'VOTING', '⚖️ *The final verdict.* Use ' + game.prefix + ' murder story vote <player number or name>. A strict majority is required.');
    } else if (game.phase === 'VOTING') {
      await finishGame(game);
    }
  } finally {
    game._transitioning = false;
    game.updatedAt = Date.now();
    persist();
  }
}

function summarizeCounts(game) {
  const counts = new Map();
  let skip = 0;
  for (const target of Object.values(game.votes || {})) {
    if (!target || target === 'skip') { skip++; continue; }
    counts.set(target, (counts.get(target) || 0) + 1);
  }
  return { counts, skip };
}

function verdict(game) {
  const counted = summarizeCounts(game);
  const rows = Array.from(counted.counts.entries()).sort((a, b) => b[1] - a[1]);
  if (!rows.length || (rows.length > 1 && rows[0][1] === rows[1][1])) return { targetJid: null, count: rows[0] ? rows[0][1] : 0, skip: counted.skip };
  const eligible = game.players.filter((p) => p.alive).length;
  const targetJid = rows[0][0];
  const count = rows[0][1];
  if (count < Math.floor(eligible / 2) + 1) return { targetJid: null, count: count, skip: counted.skip };
  return { targetJid: targetJid, count: count, skip: counted.skip };
}

async function finishGame(game) {
  clearTimer(game.chatId);
  const result = verdict(game);
  const picked = result.targetJid ? playerByJid(game, result.targetJid) : null;
  const killer = playerByJid(game, game.killerJid);
  const civiliansWon = !!(picked && killer && normJid(picked.jid) === normJid(killer.jid));
  game.phase = 'FINISHED';
  game.deadline = null;
  game.finishedAt = Date.now();
  game.updatedAt = Date.now();
  game.verdict = { targetJid: picked ? picked.jid : null, correct: civiliansWon, votes: result.count, skip: result.skip };
  const sharedTruth = game.evidence.filter((c) => c.shared && !c.manipulated && c.supportsKiller).length;
  const verdictStrength = civiliansWon
    ? (sharedTruth >= 2 ? 'The group backed its verdict with several reliable leads.' : 'The culprit was named, but the public evidence was thin.')
    : 'The culprit escaped a supported conviction.';
  const truthLines = [
    'Victim: ' + game.victim + '.',
    'Crime scene: ' + ((roomById(game, game.murderRoomId) || {}).name || game.murderRoomId) + '.',
    'Method: ' + game.murderMethod + '.',
    'Approximate time: ' + game.murderHour + '.',
    'Verdict: ' + (picked ? picked.name + (civiliansWon ? ' was correctly identified.' : ' was accused, but was not the killer.') : ' no suspect received a strict majority.'),
    verdictStrength,
  ];
  const webFrames = (game.case.web || []).map((w) => w.frame).filter(Boolean);
  const objectives = game.players.map((p) => ({
    name: p.name,
    role: roleLabel(p.role),
    complete: objectiveComplete(p, game, civiliansWon ? 'civ' : 'killer'),
    objective: p.objective && p.objective.text,
  }));
  game.objectivesResult = objectives;
  persist();

  let sent = false;
  try {
    const buf = await cards.renderCaseReportCard({
      manorName: MODE_NAME + ' · STORY MODE',
      winner: civiliansWon ? 'civ' : 'killer',
      motiveTitle: game.case.motive.title,
      motiveDetail: game.case.motive.detail,
      webFrames: webFrames,
      truthLines: truthLines.concat(['Personal objectives: ' + objectives.filter((o) => o.complete).length + '/' + objectives.length + ' completed.']),
      killerNames: [killer ? killer.name + ' (' + killer.char.name + ')' : 'Unknown'],
    });
    sent = await groupImage(game, buf, '🕯️ *CASE FILE CLOSED: ' + MODE_NAME + '*');
  } catch (e) {
    console.error('[MM Story] report render failed:', e.message);
  }
  if (!sent) {
    await groupText(game, '🕯️ *CASE FILE CLOSED: ' + MODE_NAME + '*\n\n' +
      'The killer was ' + (killer ? killer.name + ' (' + killer.char.name + ')' : 'unknown') + '.\n' +
      'Motive: ' + game.case.motive.detail + '\n' + truthLines.join('\n') +
      '\n\nPersonal objectives completed: ' + objectives.filter((o) => o.complete).length + '/' + objectives.length + '.');
  }
}

async function showDossier(game, player) {
  const statement = player.statement || {};
  const roleLines = [
    'Role: ' + roleLabel(player.role),
    'Character: ' + player.char.name + ', ' + player.char.title,
    'Personal objective: ' + (player.objective && player.objective.text || 'Help resolve the case.'),
  ];
  if (player.role === 'KILLER') roleLines.push('You are responsible for the murder. Do not reveal this. Your motive is: ' + game.case.motive.detail);
  else if (player.role === 'INVESTIGATOR') roleLines.push('During the night, use compare <player> to privately check an account against the case timeline.');
  else if (player.role === 'GUARDIAN') roleLines.push('During the night, use protect <player> to block one framing or blackmail attempt.');
  else if (player.role === 'MEDIUM') roleLines.push('During the night, use seance to receive an ambiguous last-memory clue.');
  else if (player.role === 'ACCOMPLICE') roleLines.push('During the night, use spread <player> to seed an anonymous false lead.');
  else roleLines.push('Search carefully, question suspects, share evidence, and build a supported accusation.');
  const sections = [
    { title: 'Your role', lines: roleLines.slice(0, 4) },
    { title: 'Your private secret', lines: [player.secret] },
    { title: 'Your relationship', lines: [player.relationship || 'A private tie links you to the house.'] },
    { title: 'Your account', lines: [
      (statement.hour || 'Unknown time') + ' · ' + (statement.room || 'somewhere in the house'),
      statement.account || 'You have not given an account.',
      statement.observation || 'You noticed something you cannot yet explain.',
    ] },
    { title: 'Your evidence', lines: (player.knownClues || []).slice(-4).map((id) => {
      const clue = game.evidence.find((c) => c.id === id);
      return clue ? id + ': ' + clue.itemName : id;
    }) },
  ];
  let imageSent = false;
  try {
    const buf = await cards.renderDossierCard({ playerName: player.name, sections: sections, manorName: MODE_NAME + ' · PRIVATE STORY FILE' });
    imageSent = await privateImage(game, player, buf, '🔒 Your private Story Mode dossier. Do not forward it.');
  } catch (e) {
    console.error('[MM Story] dossier render failed:', e.message);
  }
  if (!imageSent) {
    await privateText(game, player, '🔒 *PRIVATE STORY DOSSIER*\n\n' + sections.map((s) => '*' + s.title + '*\n' + (s.lines || []).filter(Boolean).join('\n')).join('\n\n'));
  }
}

async function sendCastCards(game) {
  const nameMap = {};
  game.players.forEach((p) => { nameMap[p.char.id] = p.name; });
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    if (!games.has(game.chatId) || game.phase === 'FINISHED') return;
    try {
      const caption = caseGen.introCaptionFor(player.char.id, nameMap, game.case, player.char.title);
      const buf = await cards.renderCharacterIntroCard({
        char: player.char,
        caption: caption || 'A guest with a secret and a reason to be here.',
        index: i + 1,
        total: game.players.length,
        manorName: MODE_NAME + ' · STORY MODE',
      });
      const sent = await groupImage(game, buf, '🕯️ *' + player.char.name + '* · ' + player.char.title + '\n' + (caption || 'Someone in this house knows more than they admit.'));
      if (!sent) await groupText(game, '🕯️ *' + player.char.name + '* · ' + player.char.title + '\n' + (caption || 'Someone in this house knows more than they admit.'));
    } catch (e) {
      await groupText(game, '🕯️ *' + player.char.name + '* · ' + player.char.title);
      console.error('[MM Story] cast card failed:', e.message);
    }
    await new Promise((resolve) => setTimeout(resolve, QA_CLOCK ? 20 : 260));
  }
}

async function createLobby(ctx) {
  if (!isGroup(ctx)) return runtime.sendDM ? runtime.sendDM(ctx.sock, ctx.senderJid, 'Open Story Mode from the group chat with ' + (ctx.prefix || '.j') + ' murder story create.') : false;
  const old = games.get(ctx.chatId);
  if (old && old.phase !== 'FINISHED' && !(old.phase === 'LOBBY' && Date.now() - old.createdAt > LOBBY_TTL_MS)) {
    return groupText(old, '🕯️ Story Mode already has a ' + String(old.phase).toLowerCase() + ' in this group. Use ' + old.prefix + ' murder story status.');
  }
  if (old) { clearTimer(ctx.chatId); games.delete(ctx.chatId); }
  const game = makeGame(ctx);
  games.set(ctx.chatId, game);
  persist();
  let sent = false;
  try {
    const buf = await cards.renderLobbyCard({
      manorName: MODE_NAME + ' · STORY MODE',
      playerCount: game.players.length,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      openingLine: 'One guest has already been murdered. One of you knows why.',
      prefix: game.prefix + ' murder story',
      prize: null,
    });
    sent = await groupImage(game, buf, '🕯️ *' + MODE_NAME + ' · STORY MODE*\n' + game.prefix + ' murder story join | start');
  } catch (e) {
    console.error('[MM Story] lobby card failed:', e.message);
  }
  if (!sent) await groupText(game, '🕯️ *' + MODE_NAME + ' · STORY MODE*\nA separate, case-driven mystery is open.\n\nHost: ' + game.hostName + '\nPlayers: 1/' + MAX_PLAYERS + '\nJoin: ' + game.prefix + ' murder story join\nStart: ' + game.prefix + ' murder story start\nMinimum: ' + MIN_PLAYERS + '. No entry fee.');
}

async function joinLobby(ctx, game) {
  if (!isGroup(ctx)) return privateText(game, playerForAction(ctx, game), 'Join Story Mode from the group chat.');
  if (!game || game.phase !== 'LOBBY') return groupText(game, '🕯️ There is no open Story Mode lobby here.');
  const jid = senderId(ctx);
  if (!jid) return groupText(game, 'I could not identify your WhatsApp account.');
  if (playerByJid(game, jid)) return groupText(game, senderName(ctx) + ', you are already on the guest list.');
  if (game.players.length >= MAX_PLAYERS) return groupText(game, 'The guest list is full (' + MAX_PLAYERS + ').');
  game.players.push({
    jid: ctx.senderJid,
    name: senderName(ctx),
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
  });
  game.updatedAt = Date.now();
  persist();
  return groupText(game, '🕯️ *' + senderName(ctx) + '* has entered the guest list (' + game.players.length + '/' + MAX_PLAYERS + ').');
}

async function startGame(ctx, game) {
  if (!isGroup(ctx)) return privateText(game, playerForAction(ctx, game), 'Story Mode must be started in the group chat.');
  if (!game || game.phase !== 'LOBBY') return groupText(game, 'There is no Story Mode lobby waiting to start.');
  if (game.host !== senderId(ctx)) return groupText(game, 'Only the Story Mode host can begin the case.');
  if (game.players.length < MIN_PLAYERS) return groupText(game, 'The house needs at least ' + MIN_PLAYERS + ' guests. There are ' + game.players.length + ' here.');
  try {
    makeCase(game);
  } catch (e) {
    console.error('[MM Story] case generation failed:', e.message);
    return groupText(game, 'The case could not be assembled coherently. The lobby is still open. Please try start again.');
  }
  game.round = 1;
  game.startedAt = Date.now();
  setPhase(game, 'INVESTIGATION', '🕯️ *' + game.victim + ' is dead.* The house is sealed. Search rooms, question suspects, and build your own case. No one is cleared by a secret, and suspicion is not proof.');
  for (const player of game.players) {
    const sent = await privateText(game, player, '🔒 *' + MODE_NAME + ' · YOUR PRIVATE DOSSIER*\nYour role card is being delivered. Use ' + game.prefix + ' murder story dossier to reopen it.\nNever forward your private role or secret.');
    void sent;
  }
  void sendCastCards(game).catch((e) => console.error('[MM Story] cast sequence failed:', e.message));
  for (const player of game.players) {
    void showDossier(game, player).catch((e) => console.error('[MM Story] dossier send failed:', e.message));
  }
  return true;
}

async function showStatus(game) {
  if (!game) return false;
  const alive = game.players.filter((p) => p.alive);
  const phaseLine = game.phase === 'LOBBY'
    ? 'Lobby open'
    : game.phase === 'FINISHED'
      ? 'Case closed'
      : game.phase + ' · ' + timeLabel(remainingMs(game)) + ' remaining';
  const rows = game.players.map((p, i) => (i + 1) + '. ' + p.name + (p.alive ? '' : ' (out)')).join('\n');
  const text = '🕯️ *' + MODE_NAME + ' · STORY MODE*\n' + phaseLine + '\nGuests: ' + game.players.length + '/' + MAX_PLAYERS + '\nLiving: ' + alive.length + '\n\n' + rows + '\n\nRoles and secrets are private. Use ' + game.prefix + ' murder story help for actions.';
  return groupText(game, text);
}

function evidenceSummary(game, player) {
  const discovered = (player.knownClues || []).map((id) => game.evidence.find((c) => c.id === id)).filter(Boolean);
  const publicClues = game.evidence.filter((c) => c.shared && !discovered.some((d) => d.id === c.id));
  const lines = [];
  lines.push('*YOUR PRIVATE CLUES*');
  if (discovered.length) lines.push(...discovered.map((c) => c.id + ' · ' + c.itemName + ' (' + c.tag + ')'));
  else lines.push('None yet. Search a room to find a lead.');
  lines.push('\n*PUBLIC EVIDENCE*');
  if (publicClues.length) lines.push(...publicClues.map((c) => c.id + ' · ' + c.itemName + ' (' + c.tag + ')'));
  else lines.push('No one has shared evidence yet.');
  lines.push('\nShare one of your own clues with: ' + game.prefix + ' murder story share <ID>');
  return lines.join('\n');
}

async function showEvidence(game, player) {
  return privateText(game, player, evidenceSummary(game, player));
}

async function searchRoom(game, player, raw) {
  if (!['INVESTIGATION', 'DISCUSSION'].includes(game.phase)) return privateText(game, player, 'Searches are available during investigation and discussion, not during the verdict.');
  const room = findRoom(game, raw);
  if (!room) return privateText(game, player, 'Choose a room by number or name:\n' + game.rooms.map((r, i) => (i + 1) + '. ' + r.name).join('\n'));
  const used = Number(player.searchesByPhase[game.phase] || 0);
  const limit = player.role === 'INVESTIGATOR' ? 2 : 1;
  if (used >= limit) return privateText(game, player, 'You have used your search allowance for this phase (' + used + '/' + limit + ').');
  player.searchesByPhase[game.phase] = used + 1;
  const clue = game.evidence.find((c) => !c.discovered && c.roomId === room.id);
  if (!clue) {
    persist();
    await groupText(game, '🔎 ' + player.name + ' searched the ' + room.name + '. The room yields no new evidence.');
    return privateText(game, player, '🔎 Your search of ' + room.name + ' found no undiscovered evidence. That does not mean the room is irrelevant.');
  }
  clue.discovered = true;
  clue.foundByJid = player.jid;
  player.knownClues.push(clue.id);
  clue.discoveredAt = Date.now();
  persist();
  await groupText(game, '🔎 ' + player.name + ' searched the ' + room.name + ' and found a trace. The full note is private until they share it.');
  const note = clue.id + ' · ' + clue.itemName + '\n' + clue.line + '\n\n' +
    (clue.secretForJid ? 'This appears to be a private note connected to your own history. Keep it private or share it deliberately.' : 'You may inspect it privately, or share it with the group.');
  await privateText(game, player, note + '\n\nInspect: ' + game.prefix + ' murder story inspect ' + clue.id + '\nShare: ' + game.prefix + ' murder story share ' + clue.id);
  try {
    const buf = await cards.renderEvidenceCard({
      itemName: clue.itemName,
      art: clue.art,
      tag: clue.tag,
      line: clue.line,
      roomName: room.name,
      night: game.round,
      manorName: MODE_NAME + ' · STORY MODE',
    });
    if (buf) await privateImage(game, player, buf, '🔒 ' + clue.id + ' · ' + clue.itemName);
  } catch (e) {
    console.error('[MM Story] clue card failed:', e.message);
  }
  return true;
}

async function inspectClue(game, player, raw) {
  const id = String(raw || '').trim().toUpperCase();
  const clue = game.evidence.find((c) => c.id === id);
  if (!clue) return privateText(game, player, 'I could not find that clue ID. Use evidence to see your known IDs.');
  if (!(player.knownClues || []).includes(clue.id) && !clue.shared) return privateText(game, player, 'You have not discovered that clue. Search a room or ask its finder to share it.');
  let insight = clue.insight || 'The clue should be compared with testimony and the timeline.';
  if (clue.manipulated && player.role !== 'INVESTIGATOR') insight = 'The clue may have been moved, but you do not have the training to establish how.';
  if (clue.manipulated && player.role === 'INVESTIGATOR') insight = 'Your examination finds signs of deliberate placement. This trace should not be treated as reliable proof against the person it implicates.';
  if (clue.secretForJid && normJid(clue.secretForJid) !== normJid(player.jid)) insight = 'This note concerns a private matter. It should not be mistaken for proof of murder.';
  return privateText(game, player, '🧐 *' + clue.id + ' · ' + clue.itemName + '*\n' + clue.line + '\n\n*Closer inspection*\n' + insight);
}

async function shareClue(game, player, raw) {
  const id = String(raw || '').trim().toUpperCase();
  const clue = game.evidence.find((c) => c.id === id);
  if (!clue || !(player.knownClues || []).includes(id)) return privateText(game, player, 'You can only share evidence you personally discovered. Check your private evidence list.');
  if (clue.shared) return groupText(game, id + ' is already in the public record.');
  clue.shared = true;
  clue.sharedByJid = player.jid;
  player.sharedClues = Number(player.sharedClues || 0) + 1;
  game.publicClueIds.push(id);
  persist();
  const room = roomById(game, clue.roomId);
  let sent = false;
  try {
    const buf = await cards.renderEvidenceCard({
      itemName: clue.itemName,
      art: clue.art,
      tag: clue.tag,
      line: clue.line,
      roomName: room ? room.name : 'Blackvale Manor',
      night: game.round,
      manorName: MODE_NAME + ' · PUBLIC EVIDENCE',
    });
    sent = await groupImage(game, buf, '📎 *PUBLIC EVIDENCE ' + id + '* · shared by ' + player.name);
  } catch (e) {
    console.error('[MM Story] public clue card failed:', e.message);
  }
  if (!sent) await groupText(game, '📎 *PUBLIC EVIDENCE ' + id + '*\n' + clue.itemName + '\n' + clue.line + '\nShared by ' + player.name + '.');
  return true;
}

async function questionPlayer(game, player, raw) {
  if (!['INVESTIGATION', 'DISCUSSION'].includes(game.phase)) return privateText(game, player, 'Question suspects during investigation or discussion.');
  const targetResult = findTarget(game, raw);
  if (!targetResult) return privateText(game, player, 'Name a guest or use their roster number. Check status for the roster.');
  const target = targetResult.player;
  if (normJid(target.jid) === normJid(player.jid)) return privateText(game, player, 'You cannot interrogate yourself.');
  const phaseKey = game.phase;
  const used = Number(player.questionsByPhase[phaseKey] || 0);
  const limit = player.role === 'INVESTIGATOR' ? 2 : 1;
  if (used >= limit) return privateText(game, player, 'You have used your questioning allowance for this phase.');
  player.questionsByPhase[phaseKey] = used + 1;
  player.questionsUsed = Number(player.questionsUsed || 0) + 1;
  const statement = target.statement || {};
  persist();
  await groupText(game, '🕯️ ' + player.name + ' questions ' + target.name + '. The house records their account.');
  return groupText(game, '📜 *' + target.name + ' · OFFICIAL ACCOUNT*\n' +
    (statement.hour || 'Unknown hour') + ' · ' + (statement.room || 'Unknown room') + '\n' +
    (statement.account || 'They have no account on record.') + '\n\n*Observation:* ' +
    (statement.observation || 'They noticed something they cannot explain.') +
    '\n\nAn account is a claim, not a verdict.');
}

async function nightAction(game, player, action, arg) {
  if (game.phase !== 'NIGHT') return privateText(game, player, 'Role actions are only available during the hidden night phase.');
  if (player.nightAct) return privateText(game, player, 'You have already submitted a night action. It cannot be changed.');
  let entry = null;
  if (player.role === 'KILLER') {
    if (action === 'frame') {
      const targetResult = findTarget(game, arg);
      if (!targetResult) return privateText(game, player, 'Use frame <player number or name> [room number or name].');
      const target = targetResult.player;
      const room = findRoom(game, targetResult.rest) || roomById(game, game.murderRoomId);
      entry = { type: 'frame', actorJid: player.jid, targetJid: target.jid, roomId: room.id };
    } else if (action === 'blackmail') {
      const targetResult = findTarget(game, arg);
      if (!targetResult) return privateText(game, player, 'Use blackmail <player number or name>.');
      entry = { type: 'blackmail', actorJid: player.jid, targetJid: targetResult.player.jid };
    } else {
      return privateText(game, player, 'As the killer, your night actions are frame <player> [room] or blackmail <player>. Choose only one.');
    }
  } else if (player.role === 'GUARDIAN') {
    if (action !== 'protect') return privateText(game, player, 'Use protect <player number or name> to shield them from framing or blackmail.');
    const targetResult = findTarget(game, arg);
    if (!targetResult) return privateText(game, player, 'Use protect <player number or name>.');
    entry = { type: 'protect', actorJid: player.jid, targetJid: targetResult.player.jid };
  } else if (player.role === 'INVESTIGATOR') {
    if (action !== 'compare') return privateText(game, player, 'Use compare <player number or name> to check their account against the timeline.');
    const targetResult = findTarget(game, arg);
    if (!targetResult) return privateText(game, player, 'Use compare <player number or name>.');
    entry = { type: 'compare', actorJid: player.jid, targetJid: targetResult.player.jid };
  } else if (player.role === 'MEDIUM') {
    if (action !== 'seance') return privateText(game, player, 'Use seance to receive the victim’s last memory.');
    entry = { type: 'seance', actorJid: player.jid };
  } else if (player.role === 'ACCOMPLICE') {
    if (action !== 'spread') return privateText(game, player, 'Use spread <player number or name> to seed a misleading anonymous note.');
    const targetResult = findTarget(game, arg);
    if (!targetResult) return privateText(game, player, 'Use spread <player number or name>.');
    const room = pick(game.rooms);
    entry = { type: 'spread', actorJid: player.jid, targetJid: targetResult.player.jid, roomId: room.id };
  } else {
    return privateText(game, player, 'Your role has no special night action. Use the night to review your evidence.');
  }
  player.nightAct = action;
  game.nightActions[normJid(player.jid)] = entry;
  persist();
  return privateText(game, player, '🌑 Your night action is sealed. It resolves when the bell rings. You cannot change it.');
}

async function accuse(game, player, raw) {
  if (game.phase !== 'DISCUSSION') return privateText(game, player, 'Formal accusations open during discussion. You may still search or question suspects.');
  const split = String(raw || '').split('|');
  const targetResult = findTarget(game, split[0].trim());
  if (!targetResult) return privateText(game, player, 'Use accuse <player number or name> | E01,E02 to submit a theory.');
  const evidenceIds = (split[1] || '').split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const owned = new Set([...(player.knownClues || []), ...game.publicClueIds]);
  const valid = evidenceIds.filter((id) => owned.has(id) && game.evidence.some((c) => c.id === id));
  game.accusations[normJid(player.jid)] = {
    targetJid: targetResult.player.jid,
    evidenceIds: valid,
    submittedAt: Date.now(),
  };
  persist();
  return privateText(game, player, '⚖️ Your accusation is sealed against ' + targetResult.player.name + '.\nEvidence cited: ' + (valid.length ? valid.join(', ') : 'none') + '.\nThe verdict vote is separate and happens in the next phase.');
}

async function castVote(game, player, raw) {
  if (game.phase !== 'VOTING') return privateText(game, player, 'Voting has not opened yet.');
  const text = String(raw || '').trim();
  if (!text) return privateText(game, player, 'Use vote <player number or name>, or vote skip.');
  let targetJid = 'skip';
  if (!/^skip$/i.test(text)) {
    const result = findTarget(game, text);
    if (!result) return privateText(game, player, 'Vote for a roster number/name or use vote skip.');
    targetJid = result.player.jid;
  }
  game.votes[normJid(player.jid)] = targetJid;
  persist();
  const votesNeeded = Math.floor(game.players.filter((p) => p.alive).length / 2) + 1;
  const current = summarizeCounts(game);
  if (targetJid !== 'skip' && (current.counts.get(targetJid) || 0) >= votesNeeded) {
    await groupText(game, '⚖️ A strict-majority verdict has been reached. The case is closing.');
    return finishGame(game);
  }
  const submitted = Object.keys(game.votes).length;
  if (submitted >= game.players.filter((p) => p.alive).length) return finishGame(game);
  return groupText(game, '⚖️ Vote sealed privately (' + submitted + '/' + game.players.filter((p) => p.alive).length + ' ballots).');
}

async function endGame(ctx, game) {
  const player = playerForAction(ctx, game);
  if (!game) return false;
  if (game.host !== senderId(ctx)) return isGroup(ctx)
    ? groupText(game, 'Only the Story Mode host can close this mode.')
    : privateText(game, player, 'Only the Story Mode host can close this mode.');
  clearTimer(game.chatId);
  games.delete(game.chatId);
  persist();
  return groupText(game, '🕯️ The Story Mode case has been closed. Classic Murder Mystery is unchanged.');
}

function helpText(prefix) {
  const p = prefix || '.j';
  return '🕯️ *BLACKVALE STORY MODE*\nA separate, case-driven mystery. Classic Murder Mystery still works exactly as before.\n\n' +
    '*Lobby*\n' + p + ' murder story create\n' + p + ' murder story join\n' + p + ' murder story leave\n' + p + ' murder story start\n' + p + ' murder story status\n\n' +
    '*Investigate*\n' + p + ' murder story rooms\n' + p + ' murder story search <room>\n' + p + ' murder story question <player>\n' + p + ' murder story evidence\n' + p + ' murder story inspect <clue ID>\n' + p + ' murder story share <clue ID>\n' + p + ' murder story dossier\n\n' +
    '*Hidden night actions*\n' + p + ' murder story frame <player> [room] (killer)\n' + p + ' murder story blackmail <player> (killer)\n' + p + ' murder story protect <player> (guardian)\n' + p + ' murder story compare <player> (investigator)\n' + p + ' murder story seance (medium)\n' + p + ' murder story spread <player> (accomplice)\n\n' +
    '*Finale*\n' + p + ' murder story accuse <player> | E01,E02\n' + p + ' murder story vote <player or skip>\n' + p + ' murder story end (host only)\n\n' +
    'Search results are private until shared. An alibi is a claim, secrets are not proof, and the final verdict needs a strict majority.';
}

async function handleCommand(ctx, services) {
  runtime = services || runtime || {};
  loadPersisted();
  const raw = String(ctx.rest || '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const action = String(parts.shift() || 'help').toLowerCase().replace(/[^a-z]/g, '');
  const arg = parts.join(' ').trim();
  const groupContext = isGroup(ctx);
  let game = gameForContext(ctx);

  if (game) bindContext(ctx, game);
  if (['help', 'menu', 'rules'].includes(action)) {
    const help = helpText(ctx.prefix);
    if (game) return groupContext ? groupText(game, help) : privateText(game, playerForAction(ctx, game), help);
    if (groupContext) return runtime.sendGroup ? runtime.sendGroup(ctx.sock, ctx.chatId, help) : false;
    return runtime.sendDM ? runtime.sendDM(ctx.sock, ctx.senderJid, help) : false;
  }
  if (['create', 'open', 'new', 'lobby'].includes(action)) return createLobby(ctx);
  if (!game) {
    const msg = 'No Story Mode case is attached to this chat. Open one with ' + (ctx.prefix || '.j') + ' murder story create.';
    return groupContext ? runtime.sendGroup(ctx.sock, ctx.chatId, msg) : runtime.sendDM(ctx.sock, ctx.senderJid, msg);
  }

  if (action === 'join') return joinLobby(ctx, game);
  if (action === 'leave') {
    if (game.phase !== 'LOBBY') return groupText(game, 'The guest list is locked after the case begins.');
    const me = playerForAction(ctx, game);
    if (!me) return false;
    game.players = game.players.filter((p) => normJid(p.jid) !== normJid(me.jid));
    if (!game.players.length) {
      clearTimer(game.chatId);
      games.delete(game.chatId);
      persist();
      return groupText(game, 'The last guest has left. The case has been discarded.');
    }
    if (game.host === normJid(me.jid)) game.host = normJid(game.players[0].jid);
    persist();
    return groupText(game, me.name + ' has withdrawn from the guest list.');
  }
  if (action === 'start') return startGame(ctx, game);
  if (action === 'status' || action === 'players') return showStatus(game);
  if (action === 'rooms') return privateText(game, playerForAction(ctx, game), '🗺️ *ROOMS IN THIS CASE*\n' + game.rooms.map((r, i) => (i + 1) + '. ' + r.name + ' · ' + r.hint).join('\n'));
  const player = playerForAction(ctx, game);
  if (!player) return groupContext ? groupText(game, 'Only guests on this Story Mode roster can use case actions.') : runtime.sendDM(ctx.sock, ctx.senderJid, 'You are not on the guest list for this Story Mode case.');
  if (action === 'dossier' || action === 'role') return showDossier(game, player);
  if (action === 'evidence' || action === 'journal') return showEvidence(game, player);
  if (action === 'search' || action === 'inspectroom') return searchRoom(game, player, arg);
  if (action === 'inspect') return inspectClue(game, player, arg);
  if (action === 'share') return shareClue(game, player, arg);
  if (action === 'question' || action === 'ask') return questionPlayer(game, player, arg);
  if (action === 'frame' || action === 'blackmail' || action === 'protect' || action === 'compare' || action === 'seance' || action === 'spread') return nightAction(game, player, action, arg);
  if (action === 'accuse') return accuse(game, player, arg);
  if (action === 'vote') return castVote(game, player, arg);
  if (action === 'end' || action === 'stop' || action === 'cancel') return endGame(ctx, game);
  return groupContext ? groupText(game, helpText(ctx.prefix)) : privateText(game, player, helpText(ctx.prefix));
}

function init() {
  loadPersisted();
}

module.exports = {
  handleCommand,
  init,
  _internal: {
    games,
    loadPersisted,
    persist,
    makeGame,
    makeCase,
    buildEvidence,
    roleDeck,
    findTarget,
    findRoom,
    verdict,
    objectiveComplete,
    PHASE_MS: DURATIONS,
  },
};
