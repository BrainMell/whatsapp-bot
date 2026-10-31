'use strict';
// ============================================
// BLACKVALE: DEAD OF NIGHT — the rebuilt Murder Mystery (owner 2026-10-25).
// "after the intro there's nothing for a bit, then random messages get
// spammed, flat image cards, and it never says what the player should do."
//
// Design rules this engine is built on:
// 1. EVERY phase opens with ONE animated clip that tells what to do, and every
//    player gets a DM with a numbered/lettered menu — reply with a single
//    character. Phases END EARLY when everyone has acted: no dead air.
// 2. The bot never speaks in the group between phases except through the
//    outbox (one serial queue, spaced sends, few group messages per round).
// 3. One case, one truth: where everyone really was at 9/10/11 PM is
//    generated. Every statement, sighting and contradiction is derived from
//    it. The killer's 10 PM and 11 PM accounts are lies that the evidence can
//    break. Innocents misremember only 9 PM (red herrings).
// 4. Game state commits BEFORE media is sent; a failed clip falls back to a
//    still, then plain text, and never blocks a phase.
// 5. Round: SEARCH (act) -> DEBATE (board + accuse) -> NIGHT (act), three
//    rounds, then a final VOTE. Roles: Killer, Detective, Guardian, Civilians.
// ============================================

const system = require('../../utils/system');
const botConfig = require('../../../botConfig');
const characters = require('./characters');
const cases = require('./cases');
const anim = require('./noirAnim');
const ncards = require('./noirCards');

const STATE_KEY = 'murder_noir_games_v1';
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;
const ROUNDS = 3;
const SLOTS = ['9 PM', '10 PM', '11 PM'];
const QA = process.env.MM_NOIR_QA === '1';
const DUR = QA
  ? { INTRO: 3000, SEARCH: 6000, DEBATE: 4000, NIGHT: 5000, VOTE: 5000 }
  : { INTRO: 14000, SEARCH: 120000, DEBATE: 60000, NIGHT: 45000, VOTE: 60000 };
const LOBBY_TTL = 30 * 60 * 1000;
const GAME_TTL = 6 * 60 * 60 * 1000;
const OUTBOX_GAP_MS = QA ? 30 : 2200;
const EARLY_ADVANCE_DEBOUNCE = QA ? 120 : 1500;
const MAX_MURDERS = 2;
const DEBATE_MIN_MS = QA ? 800 : 45000;   // protected discussion window: a debate never ends before this
const NOTE_LIMIT = 3, TELL_LIMIT = 14;

const VICTIMS = ['Lord Edmund Blackvale', 'Lady Honoria Blackvale', 'Sir Alistair Blackvale', 'Dame Cordelia Blackvale'];
const TRACES = [
  { art: 'pocket_watch.jpg', line: (j) => `A pocket watch lies in the blood. Engraved on the back the letter "${j}".` },
  { art: 'handkerchief.jpg', line: (j) => `A silk handkerchief clutched in the victim's hand, monogrammed "${j}".` },
  { art: 'locket.jpg', line: (j) => `A torn locket. Inside the clasp, scratched small: "${j}".` },
];

const games = new Map(); // chatId -> game
const timers = new Map();
let runtime = {};
let loaded = false;

// ---------- plumbing (same shape as the story mode) ----------
function normJid(jid) { return String(jid || '').split('@')[0].split(':')[0]; }
function botIdSafe() { try { return botConfig.getBotId() || 'global'; } catch (_) { return 'global'; } }
function stateKey() { return STATE_KEY + '_' + botIdSafe(); }
function persist() {
  const saved = {};
  for (const [chatId, game] of games) {
    const clean = {};
    for (const key of Object.keys(game)) if (key[0] !== '_') clean[key] = game[key];
    saved[chatId] = clean;
  }
  try {
    const result = system.set(stateKey(), saved);
    if (result && typeof result.catch === 'function') result.catch((e) => console.error('[Noir] persist failed:', e.message));
  } catch (e) { console.error('[Noir] persist failed:', e.message); }
}
function clearTimer(chatId) { const t = timers.get(chatId); if (t) clearTimeout(t); timers.delete(chatId); }
function loadPersisted() {
  if (loaded) return;
  loaded = true;
  const saved = system.get(stateKey(), {});
  const now = Date.now();
  for (const [chatId, game] of Object.entries(saved || {})) {
    if (!game || !game.phase) continue;
    if (game.phase === 'LOBBY' && now - (game.createdAt || now) > LOBBY_TTL) continue;
    if (game.phase !== 'FINISHED' && now - (game.updatedAt || game.createdAt || now) > GAME_TTL) continue;
    game._sock = null;
    game._transitioning = false;
    game._forceAdvance = false;
    if (game._earlyTimer) { clearTimeout(game._earlyTimer); game._earlyTimer = null; }
    games.set(chatId, game);
    if (game.phase !== 'LOBBY' && game.phase !== 'FINISHED' && game.deadline) schedulePhase(game);
  }
}
function isGroup(ctx) { return !!ctx.isGroup || String(ctx.chatId || '').endsWith('@g.us'); }
function senderId(ctx) { return normJid(ctx.senderJid || ctx.sender || ''); }
function senderName(ctx) { return String(ctx.senderName || ctx.name || ctx.pushName || 'Guest').trim().slice(0, 60) || 'Guest'; }
function playerByJid(game, jid) { const id = normJid(jid); return game.players.find((p) => normJid(p.jid) === id) || null; }
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
function sockForGame(game) {
  if (game && game._sock) return game._sock;
  try {
    const sock = runtime.getSock ? runtime.getSock() : null;
    if (sock && game) game._sock = sock;
    return sock || null;
  } catch (_) { return null; }
}

// ---------- send layer: group sends go through ONE serial outbox ----------
const outbox = { q: [], running: false, last: 0 };
function enqueueGroup(job) {
  if (outbox.q.length > 12) { console.warn('[Noir] outbox saturated, dropping a group send'); return; }
  outbox.q.push(job);
  pumpOutbox();
}
async function pumpOutbox() {
  if (outbox.running) return;
  outbox.running = true;
  while (outbox.q.length) {
    const wait = outbox.last + OUTBOX_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const job = outbox.q.shift();
    try { await job(); } catch (e) { console.error('[Noir] outbox job failed:', e.message); }
    outbox.last = Date.now();
  }
  outbox.running = false;
}

function groupText(game, text) {
  const sock = sockForGame(game);
  if (!sock) { console.warn('[Noir] group text skipped: no sock for ' + (game && game.chatId)); return Promise.resolve(false); }
  if (runtime.sendGroup) return runtime.sendGroup(sock, game.chatId, text);
  return sock.sendMessage(game.chatId, { text }).then(() => true).catch((e) => { console.error('[Noir] group text failed:', e.message); return false; });
}

function groupMedia(game, payload) {
  // payload: {video, caption, still} | {image, caption} | {text} | {text2}
  // Fallback ladder: clip -> still -> text. Never throws, never blocks.
  enqueueGroup(async () => {
    const sock = sockForGame(game);
    if (!sock) { console.warn('[Noir] group media skipped: no sock for ' + game.chatId); return; }
    const asText = payload.text != null ? payload.text : payload.text2;
    try {
      if (payload.video) {
        try { await sock.sendMessage(game.chatId, { video: payload.video, gifPlayback: true, jpegThumbnail: payload.thumb || undefined, caption: payload.caption || '' }); }
        catch (ve) {
          console.error('[Noir] video send failed, falling back to still:', ve.message);
          if (payload.still) await sock.sendMessage(game.chatId, { image: payload.still, caption: payload.caption || '' });
          else if (asText != null) await sock.sendMessage(game.chatId, { text: asText });
        }
      } else if (payload.image) {
        if (runtime.sendGroupImage) await runtime.sendGroupImage(sock, game.chatId, payload.image, payload.caption || '');
        else await sock.sendMessage(game.chatId, { image: payload.image, caption: payload.caption || '' });
      } else if (asText != null) {
        if (runtime.sendGroup) await runtime.sendGroup(sock, game.chatId, asText);
        else await sock.sendMessage(game.chatId, { text: asText });
      }
    } catch (e) {
      console.error('[Noir] group media failed:', e.message);
      try { if (asText != null) await sock.sendMessage(game.chatId, { text: asText }); } catch (e2) { console.error('[Noir] group fallback also failed:', e2.message); }
    }
  });
}

function privateText(game, player, text) {
  try {
    const sock = sockForGame(game);
    if (!sock || !player || !player.jid) { console.warn('[Noir] DM skipped: no sock/player for ' + ((player && player.jid) || '?')); return Promise.resolve(false); }
    if (runtime.sendDM) return runtime.sendDM(sock, player.jid, text);
    return sock.sendMessage(player.jid, { text }).then(() => true).catch(() => false);
  } catch (e) { console.error('[Noir] DM failed:', e.message); return Promise.resolve(false); }
}

async function privateImage(game, player, buf, caption) {
  try {
    const sock = sockForGame(game);
    if (!sock || !player) return false;
    if (runtime.sendDMImage) return runtime.sendDMImage(sock, player.jid, buf, caption);
    await sock.sendMessage(player.jid, { image: buf, caption: caption || '' });
    return true;
  } catch (e) { console.error('[Noir] DM image failed:', e.message); return false; }
}

// ---------- small utils ----------
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function shuffle(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function timeLabel(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); const m = Math.floor(s / 60); return m ? m + 'm ' + (s % 60) + 's' : s + 's'; }
function living(game) { return game.players.filter((p) => p.alive); }
function initial(name) { return String(name || 'X').trim().charAt(0).toUpperCase(); }

// ---------- the game + the case: ONE truth ----------
function makeGame(ctx) {
  return {
    mode: 'NOIR',
    chatId: ctx.chatId,
    phase: 'LOBBY',
    host: senderId(ctx),
    hostName: senderName(ctx),
    prefix: ctx.prefix || '.j',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deadline: null,
    players: [{
      jid: ctx.senderJid, name: senderName(ctx), alive: true, joinedAt: Date.now(),
      char: null, role: null, acted: false, bolted: false,
      knownClues: [], pendingRoomPick: null, protectId: null, savedTonight: false,
      account: null,
    }],
    rooms: [], round: 1, case: null, nightAct: null,
    notes: [], votes: {}, accusations: {}, ghostTier: 0, murders: 0,
    dawn: null, verdict: null, events: [],
    _sock: ctx.sock || null,
  };
}

function flavorFind() {
  return pick([
    'A chair turned to face the door. Someone sat here listening.',
    'Wax dripped in a line toward the corridor — someone left in a hurry.',
    'A glass, half-finished. The rim still smells of claret.',
    'Fresh scratches on the sill. Recent. Small.',
    'A page torn from a diary, the ink smeared beyond reading.',
    'Cold ash. A fire was lit here long after the house went up.',
    'A glove, dropped and not retrieved. The wrong size for the staff.',
  ]);
}

function roleDeck(n) {
  const roles = ['KILLER', 'DETECTIVE', 'GUARDIAN'];
  if (n >= 6) roles.push('ACCOMPLICE');   // the killer's partner: a private line + one sabotage a night
  while (roles.length < n) roles.push('CIVILIAN');
  return shuffle(roles);
}

function dealCase(game) {
  game.rooms = shuffle(cases.ROOMS).slice(0, 6);
  const cast = shuffle(characters.CHARACTERS).slice(0, game.players.length);
  const roles = roleDeck(game.players.length);
  game.players.forEach((p, i) => {
    p.char = { id: cast[i].id, name: cast[i].name, title: cast[i].title, sprite: cast[i].sprite };
    p.role = roles[i];
  });
  const killer = game.players.find((p) => p.role === 'KILLER');
  const truth = {};    // truth[charId][slot] = roomId
  const claims = {};   // claims[charId][slot] = {room, roomName, lie}
  const sightings = {}; // sightings[charId] = [{who, slot, room, kind}]
  const coLocation = {}; // charA|charB -> [{slot, room}]
  for (const slot of SLOTS) {
    const order = shuffle(game.players);
    let idx = 0;
    while (idx < order.length) {
      const size = Math.min(order.length - idx, pick([1, 2, 2, 3]));
      const group = order.slice(idx, idx + size);
      const room = pick(game.rooms);
      idx += size;
      for (const p of group) {
        truth[p.char.id] = truth[p.char.id] || {};
        truth[p.char.id][slot] = room.id;
      }
      for (const a of group) for (const b of group) {
        if (a === b) continue;
        const k = a.char.id + '|' + b.char.id;
        coLocation[k] = coLocation[k] || [];
        coLocation[k].push({ slot, room });
      }
    }
  }
  // The murder: an NPC of the house dies at 11 PM; the killer was there alone.
  const victimName = pick(VICTIMS);
  const murderRoom = pick(game.rooms);
  truth[killer.char.id]['11 PM'] = murderRoom.id;
  for (const p of game.players) {
    if (p !== killer && truth[p.char.id]['11 PM'] === murderRoom.id) {
      const others = game.players.filter((q) => q !== p);
      const alt = game.rooms.find((r) => r.id !== murderRoom.id && others.every((q) => truth[q.char.id]['11 PM'] !== r.id));
      truth[p.char.id]['11 PM'] = (alt || pick(game.rooms.filter((r) => r.id !== murderRoom.id))).id;
    }
  }
  // Claims — innocents truthful at 10/11 PM, may misremember 9 PM; killer lies at 10+11.
  // Every lie points at a room that truly had people in it (breakable by questioning).
  for (const p of game.players) {
    claims[p.char.id] = {};
    for (const slot of SLOTS) {
      const real = game.rooms.find((r) => r.id === truth[p.char.id][slot]);
      const isKiller = p.role === 'KILLER';
      const lieHere = isKiller ? slot !== '9 PM' : (slot === '9 PM' && Math.random() < 0.6);
      if (!lieHere) {
        claims[p.char.id][slot] = { room: real.id, roomName: real.name, lie: false };
      } else {
        const falseRoom = pick(game.rooms.filter((r) => r.id !== real.id && game.players.some((q) => q.char.id !== p.char.id && truth[q.char.id][slot] === r.id)));
        const fr = falseRoom || pick(game.rooms.filter((r) => r.id !== real.id));
        claims[p.char.id][slot] = { room: fr.id, roomName: fr.name, lie: true };
      }
    }
  }
  // Sightings: everyone co-located at a slot saw each other there.
  for (const p of game.players) sightings[p.char.id] = [];
  for (const a of game.players) {
    for (const b of game.players) {
      if (a === b) continue;
      for (const s of (coLocation[a.char.id + '|' + b.char.id] || [])) {
        sightings[a.char.id].push({ who: b.char.id, slot: s.slot, room: s.room.id, kind: 'saw' });
      }
    }
  }
  // One corridor glimpse: a guest saw the killer heading for the murder room at 11.
  const witnesses = shuffle(game.players.filter((p) => p !== killer));
  if (witnesses.length) {
    sightings[witnesses[0].char.id].push({ who: killer.char.id, slot: '11 PM', room: murderRoom.id, kind: 'glimpse' });
  }
  // Search finds: round-indexed per room. The trace lives in the murder room (round 2+).
  const trace = pick(TRACES);
  const j = initial(killer.char.name);
  const searchIndex = {};
  for (const r of game.rooms) searchIndex[r.id] = [];
  searchIndex[murderRoom.id].push({ round: 2, art: trace.art, isTrace: true, line: trace.line(j) });
  const arts = ['muddy_boots.jpg', 'candlestick.jpg', 'claret_goblet.jpg', 'thread_spool.jpg', 'torn_letter.jpg', 'perfume_vial.jpg', 'brass_key.jpg', 'nightcap_cup.jpg', 'piano_wire.jpg', 'foxglove_bouquet.jpg'];
  for (const r of game.rooms) {
    if (r.id === murderRoom.id) continue;
    const n = pick([0, 1, 1, 2]);
    for (let k = 0; k < n; k++) {
      searchIndex[r.id].push({ round: pick([1, 1, 2, 3]), art: pick(arts), isTrace: false, line: flavorFind() });
    }
    searchIndex[r.id].sort((a, b) => a.round - b.round);
  }
  const hintText = 'Someone’s 11 PM story does not hold up — and the ' + murderRoom.name.replace(/^the /i, '') + ' keeps its secret.';
  game.case = {
    victimName, murderRoomId: murderRoom.id,
    method: pick(cases.METHODS),
    truth, claims, sightings, searchIndex,
    traceInitial: j,
    hint: hintText,
  };
  for (const p of game.players) {
    p.account = {};
    for (const slot of SLOTS) {
      const c = claims[p.char.id][slot];
      p.account[slot] = { roomName: c.roomName, lie: c.lie };
    }
  }
}

// ---------- phase machine ----------
// commitPhase: state ONLY, persisted immediately (rule 4: state before media).
// Media is enqueued afterwards by the caller; a failed clip never blocks.
function commitPhase(game, phase) {
  clearTimer(game.chatId);
  game.phase = phase;
  game.phaseStartedAt = Date.now();
  game.deadline = (phase === 'FINISHED' || phase === 'LOBBY') ? null : Date.now() + (DUR[phase] || DUR.SEARCH);
  game.updatedAt = Date.now();
  for (const p of game.players) { p.acted = false; p.pendingRoomPick = null; p.bolted = false; if (phase === 'SEARCH') { p.pressed = 0; p.notesSent = 0; p.lastRoom = null; } }
  if (phase === 'DEBATE' || phase === 'SEARCH') game.skips = [];
  game._transitioning = false;
  game._forceAdvance = false;
  persist();
  if (game.deadline) schedulePhase(game);
}

function schedulePhase(game) {
  clearTimer(game.chatId);
  const ms = Math.max(50, (game.deadline || 0) - Date.now());
  const t = setTimeout(() => advancePhase(game.chatId).catch((e) => console.error('[Noir] advance failed:', e.message)), ms + 120);
  if (typeof t.unref === 'function') t.unref();
  timers.set(game.chatId, t);
}

function maybeEarlyAdvance(game) {
  if (game.phase === 'FINISHED' || game.phase === 'LOBBY' || game.phase === 'INTRO') return;
  if (game._transitioning || game._earlyTimer) return;
  const alive = living(game);
  if (!alive.length) return;
  if (game.phase === 'DEBATE') {
    // protected discussion window: only a majority of PUBLIC skips, and never before DEBATE_MIN_MS
    const need = Math.floor(alive.length / 2) + 1;
    if ((game.skips || []).length < need) return;
    const wait = Math.max(EARLY_ADVANCE_DEBOUNCE, DEBATE_MIN_MS - (Date.now() - (game.phaseStartedAt || 0)));
    game._earlyTimer = setTimeout(() => {
      game._earlyTimer = null;
      if (game.phase !== 'DEBATE' || game._transitioning) return;
      clearTimer(game.chatId); game._forceAdvance = true;
      advancePhase(game.chatId).catch((e) => console.error('[Noir] early advance failed:', e.message));
    }, wait);
    if (typeof game._earlyTimer.unref === 'function') game._earlyTimer.unref();
    return;
  }
  if (!alive.every((p) => p.acted)) return;
  persist();
  game._earlyTimer = setTimeout(() => {
    game._earlyTimer = null;
    if (game.phase === 'FINISHED' || game.phase === 'LOBBY' || game._transitioning) return;
    const still = living(game);
    if (!still.length || !still.every((p) => p.acted)) return;
    clearTimer(game.chatId);
    game._forceAdvance = true;
    advancePhase(game.chatId).catch((e) => console.error('[Noir] early advance failed:', e.message));
  }, EARLY_ADVANCE_DEBOUNCE);
  if (typeof game._earlyTimer.unref === 'function') game._earlyTimer.unref();
}

// ---------- night resolution + dawn ----------
// Sync: resolves the night and returns { outcome, victim, line } — the caller
// owns phase transitions (final round goes straight to VOTE after dawn).
function resolveNight(game) {
  const killer = game.players.find((p) => p.role === 'KILLER');
  const act = game.nightAct || null;
  let outcome = 'quiet';
  let victim = null;
  let line = pick(cases.NIGHT_LINES);
  if (act && killer && killer.alive && game.murders < MAX_MURDERS) {
    const target = game.players.find((p) => p.char && p.char.id === act.targetId && p.alive);
    if (target && target !== killer) {
      const stripped = game.stripId && game.stripId === target.char.id;   // the accomplice picked the lock / drugged the watchman
      const guarded = !stripped && game.players.some((p) => p.alive && p.role === 'GUARDIAN' && p.protectId === target.char.id);
      if (guarded || (target.bolted && !stripped)) {
        outcome = 'saved';
        line = target.bolted
          ? target.name + ' held their door. The blade scratched and withdrew.'
          : 'A silent guardian stood watch over ' + target.name + '. The blade found nothing.';
        target.savedTonight = true;
      } else {
        outcome = 'murder';
        victim = target;
        target.alive = false;
        game.murders += 1;
        const clue = characters.clueFor(killer.char.id, Math.min(game.ghostTier, 3));
        if (clue) {
          game.ghostTier += 1;
          game.notes.push({ kind: 'ghost', text: 'The victim’s ghost whispers: ' + clue });
          line = 'The house wakes to a scream. The victim’s ghost whispers: ' + clue;
        } else {
          line = 'The house wakes to a scream.';
        }
      }
    }
  }
  game.dawn = { outcome, victimId: victim ? victim.char.id : null, round: game.round };
  game.nightAct = null; game.stripId = null;
  for (const p of game.players) { p.protectId = null; p.savedTonight = false; }
  persist();
  return { outcome, victim, line };
}

// Dawn clip is enqueued BEFORE the next phase opener enqueues its clip, so the
// group always sees "what happened" then "what to do", in that order.
function sendDawnMedia(game, outcome, victim, line) {
  const payload = { text2: '🌅 Dawn of round ' + game.round + ': ' + (outcome === 'murder' ? (victim ? victim.name + ' is dead. ' : 'A body is found. ') : outcome === 'saved' ? 'Someone was saved in the night. ' : 'The night passed quietly. ') + line };
  (async () => {
    try {
      const args = { outcome, victim: victim ? { charId: victim.char.id, name: victim.name } : null, line };
      // only a MURDER earns the animated clip; a quiet/saved dawn is a crisp still card
      const clip = outcome === 'murder' ? await anim.dawnClip(args) : await anim.stillOf(anim.dawnClip, args);
      if (clip && clip.mp4) { payload.video = clip.mp4; payload.thumb = clip.thumb; payload.still = clip.still; payload.caption = '🌅 Dawn — round ' + game.round + ' of ' + ROUNDS; }
      else if (clip && clip.still) { payload.image = clip.still; payload.caption = '🌅 Dawn — round ' + game.round + ' of ' + ROUNDS + '\n' + line; }
    } catch (e) { console.error('[Noir] dawn clip error:', e.message); }
    groupMedia(game, payload);
  })();
}

// ---------- phase chain ----------
async function advancePhase(chatId) {
  const game = games.get(chatId);
  if (!game) return;
  try {
    if (game._transitioning && !game._forceAdvance) return; // a transition is already in flight
    // drift guard: if the deadline is still in the future, re-arm (a stale fire)
    if (game.deadline && Date.now() < game.deadline - 250 && !game._forceAdvance) {
      schedulePhase(game);
      return;
    }
    game._forceAdvance = false;
    game._transitioning = true;
    switch (game.phase) {
      case 'INTRO':
        openSearch(game);
        break;
      case 'SEARCH':
        openDebate(game);
        break;
      case 'DEBATE':
        await openNight(game);
        break;
      case 'NIGHT': {
        const dawn = resolveNight(game);
        sendDawnMedia(game, dawn.outcome, dawn.victim, dawn.line);
        if (checkSuddenEnd(game)) break;
        if (game.round >= ROUNDS) {
          openVote(game);
        } else {
          game.round += 1;
          openSearch(game);
        }
        break;
      }
      case 'VOTE':
        await finishGame(game, null, 'The deadline passed without a verdict.');
        break;
      default:
        game._transitioning = false;
        break;
    }
  } catch (e) { console.error('[Noir] advancePhase error:', e.message); game._transitioning = false; }
}

function checkSuddenEnd(game) {
  const alive = living(game);
  const killer = game.players.find((p) => p.role === 'KILLER');
  if (killer && !killer.alive) { void finishGame(game, null, 'The killer is dead. The case closes itself.'); return true; }
  if (alive.length <= 1 && killer && killer.alive) { void finishGame(game, null, 'Too few remain to raise a hand against the killer.'); return true; }
  return false;
}

// ---------- phase openers (one clip + one DM menu per player) ----------
function clipWrap(clip, caption, text2) {
  if (clip && clip.mp4) return { video: clip.mp4, thumb: clip.thumb, still: clip.still, caption, text2 };
  if (clip && clip.still) return { image: clip.still, caption, text2 };
  return { text2 };
}
// crisp still card (owner 2026-10-25: ordinary events are image cards, not blurry videos)
function stillWrap(card, caption, text2) {
  const buf = card && (card.still || card);
  if (buf && Buffer.isBuffer(buf)) return { image: buf, caption, text2 };
  return { text2 };
}

function openSearch(game) {
  commitPhase(game, 'SEARCH');
  for (const p of living(game)) {
    privateText(game, p, searchMenu(game, p));
  }
  (async () => {
    const clip = await anim.stillOf(anim.phaseClip, {
      bgId: pick(game.rooms).id,
      kicker: 'Round ' + game.round + ' of ' + ROUNDS,
      title: 'Search',
      steps: ['Check your DMs — pick a room (1 move)', 'Out loud: ' + (game.prefix || '.j') + ' mm press <n> grills a guest', (game.prefix || '.j') + ' mm show lays your find on the table', 'Rooms you share = people you meet'],
      secondsLeft: Math.round(DUR.SEARCH / 1000),
      footer: 'Talk in this chat — pressing and showing are PUBLIC',
    }).catch(() => null);
    groupMedia(game, stillWrap(clip, '🔎 *Round ' + game.round + '/' + ROUNDS + ' — SEARCH*\n📩 DM: pick ONE room to search (or press a guest privately).\n💬 HERE: `' + (game.prefix || '.j') + ' mm press <n>` grills a guest in public · `' + (game.prefix || '.j') + ' mm show` lays your find on the table.\n' + game.players.map((x, i) => (i + 1) + '. ' + x.char.name).join(' · '),
      '🔎 *Round ' + game.round + ' of ' + ROUNDS + ' — SEARCH*\nPick a room in your DMs. Press guests in public with `' + (game.prefix || '.j') + ' mm press <n>`.'));
  })();
}

function searchMenu(game, p) {
  const lines = ['🔎 *ROUND ' + game.round + ' — SEARCH* — you are ' + p.char.name + ' (' + p.char.title + ')', ''];
  lines.push('One move this round. Reply with a single number:');
  game.rooms.forEach((r, i) => lines.push('*' + (i + 1) + '* — search ' + r.name));
  const others = living(game).filter((x) => x !== p);
  others.forEach((o, i) => lines.push('*' + (game.rooms.length + 1 + i) + '* — press ' + o.char.name + ' ' + o.char.title + ' about their account'));
  lines.push('');
  lines.push('Or reply *SHARE* to lay your latest find on the table (public card).');
  lines.push('_In the GROUP: `' + pfx(game) + ' mm press <n>` grills a guest, `' + pfx(game) + ' mm show` shows your find. Whisper to anyone you meet: `note <name> <msg>`._');
  lines.push('_The round ends the moment everyone has acted. ' + timeLabel(Math.max(0, (game.deadline || Date.now()) - Date.now())) + ' remain._');
  return lines.join('\n');
}

function openDebate(game) {
  commitPhase(game, 'DEBATE');
  for (const p of living(game)) {
    privateText(game, p, debateMenu(game, p));
  }
  (async () => {
    const boardPlayers = game.players.map((p) => ({ charId: p.char.id, name: p.char.name, short: p.char.name.split(' ').pop(), alive: p.alive }));
    const clip = await anim.stillOf(anim.boardClip, {
      round: game.round, rounds: ROUNDS,
      players: boardPlayers,
      notes: game.notes.slice(-3),
      hint: game.case.hint,
    }).catch(() => null);
    const need = Math.floor(living(game).length / 2) + 1, pf = game.prefix || '.j';
    groupMedia(game, stillWrap(clip, '🗂 *DEBATE — round ' + game.round + '/' + ROUNDS + '* · ' + Math.round(DUR.DEBATE / 1000) + 's\n💬 This is the table talk. Argue, defend, accuse — out loud.\n🔨 `' + pf + ' mm accuse <n>` (public; ' + need + ' agreeing hangs them NOW)\n⏭ `' + pf + ' mm skip` (majority ends the debate after ' + Math.round(DEBATE_MIN_MS / 1000) + 's)\n' + game.players.map((x, i) => (i + 1) + '. ' + x.char.name + (x.alive ? '' : ' ☠')).join(' · '),
      '🗂 *DEBATE — round ' + game.round + ' of ' + ROUNDS + '*\nAccuse in public: `' + pf + ' mm accuse <n>`.'));
    sendEncounters(game);
  })();
}

function debateMenu(game, p) {
  const lines = ['🗂 *DEBATE — round ' + game.round + '* — ' + p.char.name, ''];
  lines.push('Point the house at one guest (sealed — only I count the tally). Reply a number:');
  const others = living(game).filter((x) => x !== p);
  others.forEach((o, i) => lines.push('*' + (i + 1) + '* — accuse ' + o.char.name + ' ' + o.char.title));
  lines.push('*S* — share a find with the board instead');
  lines.push('*K* — accuse no one this round');
  lines.push('');
  lines.push('_The real debate is in the GROUP: `' + pfx(game) + ' mm accuse <n>` is public — a majority hangs them on the spot._');
  return lines.join('\n');
}

async function openNight(game) {
  commitPhase(game, 'NIGHT');
  game.nightAct = null;
  for (const p of living(game)) {
    privateText(game, p, nightMenu(game, p));
  }
  const clip = await anim.stillOf(anim.phaseClip, {
    bgId: pick(['hallway_a', 'hallway_b', 'bedroom_a', 'bedroom_b']),
    kicker: 'Round ' + game.round + ' of ' + ROUNDS,
    title: 'Night',
    steps: ['Check your DMs — your night move waits there', 'Reply with a single character', 'Dawn comes when all have acted'],
    secondsLeft: Math.round(DUR.NIGHT / 1000),
    footer: 'The house sleeps. Doors are bolted. Blades are bare.',
  }).catch(() => null);
  groupMedia(game, stillWrap(clip, '🌑 Night — round ' + game.round,
    '🌑 *Night falls on Blackvale — round ' + game.round + ' of ' + ROUNDS + '*\nEvery living guest has a private move waiting in their DMs.'));
}

function nightMenu(game, p) {
  const others = living(game).filter((x) => x !== p);
  const lines = ['🌑 *NIGHT — round ' + game.round + '* — ' + p.char.name, ''];
  if (p.role === 'KILLER') {
    if (game.murders >= MAX_MURDERS) {
      lines.push('The house is on high alert — your blade stays sheathed tonight.');
      lines.push('Reply *K* to hold, and review who suspects you.');
    } else {
      lines.push('Choose your prey. Reply a number:');
      others.forEach((o, i) => lines.push('*' + (i + 1) + '* — ' + o.char.name + ' ' + o.char.title));
      lines.push('*K* — stay your hand tonight');
      const ac = game.players.find((x) => x.role === 'ACCOMPLICE' && x.alive);
      if (ac) lines.push('_Your partner ' + ac.char.name + ' can strip one guest\'s protection — send `tell <who to strip>` first._');
    }
  } else if (p.role === 'GUARDIAN') {
    lines.push('Stand watch over one guest tonight (yourself included). Reply a number:');
    living(game).forEach((o, i) => lines.push('*' + (i + 1) + '* — watch ' + (o === p ? 'your own door' : o.char.name + ' ' + o.char.title)));
    lines.push('*K* — stand down tonight');
  } else if (p.role === 'DETECTIVE') {
    lines.push('Lay one guest’s 11 PM account against the house’s records. Reply a number:');
    others.forEach((o, i) => lines.push('*' + (i + 1) + '* — compare ' + o.char.name + ' ' + o.char.title));
    lines.push('*K* — keep your counsel tonight');
  } else if (p.role === 'ACCOMPLICE') {
    const k = game.players.find((x) => x.role === 'KILLER');
    lines.push('You serve ' + (k ? k.char.name : 'the killer') + '. Pick a guest to *strip of protection tonight* (their door unbarred, their guardian drugged). Coordinate with `tell <message>`:');
    others.forEach((o, i) => lines.push('*' + (i + 1) + '* — strip ' + o.char.name + ' ' + o.char.title));
    lines.push('*K* — do nothing tonight');
  } else {
    lines.push('You hold no blade and no badge. Bolt your door, or trust the dark:');
    lines.push('*B* — bolt your door (unmurderable tonight)');
    lines.push('*K* — sleep unbarred');
  }
  lines.push('');
  lines.push('_Dawn comes when everyone has acted. ' + timeLabel(Math.max(0, (game.deadline || Date.now()) - Date.now())) + ' remain._');
  return lines.join('\n');
}

function openVote(game) {
  commitPhase(game, 'VOTE');
  for (const p of living(game)) {
    privateText(game, p, voteMenu(game, p));
  }
  (async () => {
    const clip = await anim.stillOf(anim.phaseClip, {
      bgId: 'entrance',
      kicker: 'The trial',
      title: 'Verdict',
      steps: ['Check your DMs — the ballot waits there', 'Reply with ONE number, or SKIP', 'A strict majority convicts'],
      secondsLeft: Math.round(DUR.VOTE / 1000),
      footer: 'Name the murderer — or the murderer names you.',
    }).catch(() => null);
    groupMedia(game, stillWrap(clip, '⚖️ The final verdict',
      '⚖️ *The final verdict.* Ballots are in your DMs. A strict majority of the living is required to convict.'));
  })();
}

function voteMenu(game, p) {
  const lines = ['⚖️ *THE VERDICT* — ' + p.char.name, ''];
  lines.push('Who dies for the crime? Reply ONE number:');
  const others = living(game).filter((x) => x !== p);
  others.forEach((o, i) => lines.push('*' + (i + 1) + '* — vote ' + o.char.name + ' ' + o.char.title));
  lines.push('*SKIP* — abstain');
  lines.push('');
  lines.push('_A strict majority of the living is required. ' + timeLabel(Math.max(0, (game.deadline || Date.now()) - Date.now())) + ' remain._');
  return lines.join('\n');
}

// ---------- player actions ----------
function findRoomByPick(game, n) { return game.rooms[n - 1] || null; }
function findOtherByPick(game, p, n) {
  const others = living(game).filter((x) => x !== p);
  return others[Number(n) - 1] || null;
}

async function doSearch(game, p, n) {
  // 💡 FIX 2026-10-31: one search per living guest per day (spec). p.acted was
  // set but never checked - a player could number through every room and sweep
  // the full clue set solo (searchIndex hands out DEEPER finds on each repeat
  // search of the same room, rewarding exactly that).
  if (p.acted) {
    await privateText(game, p, '🕯 You already searched this round. One search per day - wait for the next.');
    return true;
  }
  const room = findRoomByPick(game, Number(n));
  if (!room) return false;
  p.acted = true;
  p.lastRoom = room.id;
  const finds = game.case.searchIndex[room.id] || [];
  const doneHere = p.knownClues.filter((c) => c.roomId === room.id).length;
  const find = finds[doneHere];
  let text;
  if (find && find.round <= game.round) {
    const clue = { id: 'E' + (p.knownClues.length + 1) + '·' + room.id, roomId: room.id, roomName: room.name, art: find.art, line: find.line, isTrace: !!find.isTrace, round: game.round, shared: false };
    p.knownClues.push(clue);
    text = '🕯 You search ' + room.name + ' (' + game.round + '): ' + find.line + (find.isTrace ? '\n\n*This changes everything. Reply SHARE to pin it to the board — or hold it close.*' : '\n\nReply *SHARE* to pin it to the case board, or keep it for now.');
  } else {
    text = '🕯 You search ' + room.name + ' (' + game.round + '): ' + pick(cases.SEARCH_NOTHING_LINES || ['Nothing. Dust, shadow, and the sense of being watched.']) + '\n\n_You have acted this round. The round ends when everyone has._';
  }
  await privateText(game, p, text);
  maybeEarlyAdvance(game);
  return true;
}

async function doQuestion(game, p, n) {
  const target = findOtherByPick(game, p, Number(n) - game.rooms.length);
  if (!target) return false;
  p.acted = true;
  const claim = game.case.claims[target.char.id]['11 PM'];
  let text = '🗣 ' + target.char.name + ' ' + target.char.title + ' holds your gaze: "At 11 PM I was in ' + claim.roomName + '."';
  // truth-based cross-check: were YOU in the room they claim at 11 PM?
  const youWereThere = game.case.truth[p.char.id]['11 PM'] === claim.room;
  if (youWereThere && claim.lie) {
    text += '\n\n*You were in ' + claim.roomName + ' at 11 PM yourself. They were not there.* Their story breaks against yours.';
  } else if (youWereThere && !claim.lie) {
    text += '\n\nYou remember it well — they were there with you. The account holds.';
  } else {
    const sight = (game.case.sightings[p.char.id] || []).find((s) => s.who === target.char.id);
    if (sight) {
      const roomObj = game.rooms.find((r) => r.id === sight.room) || {};
      text += '\n\nYou have independent cause to place them in ' + (roomObj.name || 'a room of the house') + ' at ' + sight.slot + '.';
    }
  }
  text += '\n\n_You have acted this round. The round ends when everyone has._';
  await privateText(game, p, text);
  maybeEarlyAdvance(game);
  return true;
}

async function doShare(game, p) {
  const unshared = p.knownClues.filter((c) => !c.shared);
  if (!unshared.length) {
    await privateText(game, p, 'You hold nothing pinned-worthy yet. Find something first.');
    return true;
  }
  const clue = unshared[unshared.length - 1];
  clue.shared = true;
  game.notes.push({ kind: clue.isTrace ? 'trace' : 'find', text: clue.roomName + ' · ' + clue.line });
  p.acted = true;
  persist();
  await privateText(game, p, '📌 Laid on the table for everyone: ' + clue.line);
  postEvidence(game, p, clue);
  maybeEarlyAdvance(game);
  return true;
}

async function doAccuse(game, p, target) {
  if (!target) return false;
  p.acted = true;
  game.accusations[p.jid] = target.char.id;
  persist();
  const tally = {};
  for (const acc of Object.values(game.accusations)) tally[acc] = (tally[acc] || 0) + 1;
  const top = Object.entries(tally).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const t = game.players.find((x) => x.char.id === top[0]);
    const note = 'The house keeps pointing at ' + t.char.name + ' (' + top[1] + ' sealed accusations).';
    if (!game.notes.some((nn) => nn.text === note)) game.notes.push({ kind: 'sight', text: note });
  }
  await privateText(game, p, '🗡 Sealed. Your accusation of ' + target.char.name + ' ' + target.char.title + ' is recorded — the tally stays sealed until the verdict.');
  maybeEarlyAdvance(game);
  return true;
}

async function doNightAction(game, p, choice) {
  // 💡 FIX 2026-10-31: one night action per player. Every branch SET p.acted
  // but nothing ENFORCED it - the killer could re-open the target picker and
  // rewrite nightAct until dawn, the guardian/accomplice could overwrite their
  // target, the detective could investigate the whole roster in one night.
  // storyMode.js already guards its night actions; noir was missed.
  if (p.acted) {
    await privateText(game, p, '🤐 You have already acted tonight. Wait for dawn.');
    return true;
  }
  const c = String(choice);
  if (p.role === 'KILLER') {
    if (game.murders >= MAX_MURDERS || /^k$/i.test(c)) {
      p.acted = true;
      persist();
      await privateText(game, p, '🤐 Your blade stays sheathed. You have acted.');
      maybeEarlyAdvance(game);
      return true;
    }
    if (p.pendingRoomPick == null) {
      const target = findOtherByPick(game, p, c);
      if (!target) return false;
      p.pendingRoomPick = target.char.id;
      persist();
      const lines = ['🌑 ' + target.char.name + ' it is. Where does the deed happen? Reply a number:'];
      game.rooms.forEach((r, i) => lines.push('*' + (i + 1) + '* — ' + r.name));
      await privateText(game, p, lines.join('\n'));
      return true; // not acted yet — room still needed
    }
    const room = findRoomByPick(game, Number(c));
    if (!room) return false;
    game.nightAct = { targetId: p.pendingRoomPick, roomId: room.id };
    p.pendingRoomPick = null;
    p.acted = true;
    persist();
    await privateText(game, p, '🩸 It is decided. ' + room.name + ' will remember tonight. Dawn will tell.');
    maybeEarlyAdvance(game);
    return true;
  }
  if (p.role === 'GUARDIAN') {
    if (/^k$/i.test(c)) {
      p.acted = true;
      persist();
      await privateText(game, p, '🌙 You stand down tonight. You have acted.');
      maybeEarlyAdvance(game);
      return true;
    }
    const target = living(game)[Number(c) - 1] || null;
    if (!target) return false;
    p.acted = true;
    p.protectId = target.char.id;
    persist();
    await privateText(game, p, '🛡 You stand watch ' + (target === p ? 'at your own door' : 'over ' + target.char.name) + ' until dawn.');
    maybeEarlyAdvance(game);
    return true;
  }
  if (p.role === 'DETECTIVE') {
    if (/^k$/i.test(c)) {
      p.acted = true;
      persist();
      await privateText(game, p, '🕯 You keep your counsel tonight. You have acted.');
      maybeEarlyAdvance(game);
      return true;
    }
    const target = findOtherByPick(game, p, c);
    if (!target) return false;
    p.acted = true;
    persist();
    const claim = game.case.claims[target.char.id]['11 PM'];
    await privateText(game, p, '🔍 You lay ' + target.char.name + '’s account against the house’s records: they claim ' + claim.roomName + ' at 11 PM.\n\n' + (claim.lie ? '*The record disagrees. Their 11 PM account is a LIE.*' : 'The record agrees. Their 11 PM account holds true.'));
    maybeEarlyAdvance(game);
    return true;
  }
  if (p.role === 'ACCOMPLICE') {
    if (/^k$/i.test(c)) { p.acted = true; persist(); await privateText(game, p, '🌙 You do nothing tonight. You have acted.'); maybeEarlyAdvance(game); return true; }
    const target = findOtherByPick(game, p, c);
    if (!target) return false;
    game.stripId = target.char.id; p.acted = true; persist();
    await privateText(game, p, '🗝 You slip into ' + target.char.name + '’s corridor and spoil their lock. If your partner strikes there tonight, no shield will hold.');
    maybeEarlyAdvance(game);
    return true;
  }
  // civilians
  if (/^b$/i.test(c)) {
    p.acted = true;
    p.bolted = true;
    persist();
    await privateText(game, p, '🚪 You bolt your door. Whatever comes scratching tonight will find oak and iron. You have acted.');
    maybeEarlyAdvance(game);
    return true;
  }
  if (/^k$/i.test(c)) {
    p.acted = true;
    persist();
    await privateText(game, p, '🌙 You sleep unbarred. You have acted.');
    maybeEarlyAdvance(game);
    return true;
  }
  return false;
}

async function doVote(game, p, raw) {
  let target = null;
  if (!/^skip$/i.test(String(raw))) {
    const n = Number(raw);
    const others = living(game).filter((x) => x !== p);
    if (Number.isFinite(n)) target = others[n - 1] || null;
    else {
      const t = String(raw || '').toLowerCase();
      target = others.find((o) => o.char.name.toLowerCase().includes(t) || o.name.toLowerCase().includes(t)) || null;
    }
    if (!target) return false;
  }
  p.acted = true;
  game.votes[p.jid] = target ? target.char.id : 'SKIP';
  persist();
  await privateText(game, p, '⚖ Your ballot is sealed: ' + (target ? target.char.name : 'abstain') + '. The verdict comes when all ballots are in.');
  const alive = living(game);
  const cast = alive.filter((x) => x.acted).length;
  if (cast >= alive.length) {
    const tally = {};
    for (const v of Object.values(game.votes)) tally[v] = (tally[v] || 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    const majority = top && top[1] > alive.length / 2 && top[0] !== 'SKIP';
    await finishGame(game, majority ? game.players.find((x) => x.char.id === top[0]) : null, null);
  } else {
    maybeEarlyAdvance(game);
  }
  return true;
}


// ---------- the table talk: PUBLIC verbs (the group chat is the stage) ----------
function pfx(game) { return game.prefix || '.j'; }
function byNumber(game, n) { const t = game.players[Number(n) - 1]; return t || null; }
function rosterLine(game) { return game.players.map((x, i) => (i + 1) + '. ' + x.char.name + (x.alive ? '' : ' ☠')).join(' · '); }

async function postEvidence(game, p, clue) {
  const card = await ncards.evidenceCard({ art: clue.art, roomName: clue.roomName, line: clue.line, by: { charId: p.char.id, name: p.char.name }, trace: !!clue.isTrace }).catch(() => null);
  groupMedia(game, stillWrap(card, (clue.isTrace ? '🩸 ' : '📌 ') + '*' + p.char.name + '* lays evidence on the table — ' + clue.roomName + '\n_' + clue.line + '_',
    '📌 ' + p.char.name + ' lays evidence on the table (' + clue.roomName + '): ' + clue.line));
}

async function doPress(game, p, n) {
  if (!['SEARCH', 'DEBATE'].includes(game.phase)) { await privateText(game, p, 'You can only press a guest while the house is awake.'); return true; }
  if ((p.pressed || 0) >= 1) { await privateText(game, p, 'You already pressed someone this round — let the table react.'); return true; }
  const t = byNumber(game, n);
  if (!t || t === p || !t.alive) { await privateText(game, p, 'Press who? Use the number from the roster:\n' + rosterLine(game) + '\n`' + pfx(game) + ' mm press <n>`'); return true; }
  p.pressed = 1;
  const c10 = game.case.claims[t.char.id]['10 PM'], c11 = game.case.claims[t.char.id]['11 PM'];
  const quote = 'At ten I was in ' + c10.roomName + '. At eleven, ' + c11.roomName + '. Ask anyone.';
  const note = t.char.name + ' swears: 10 PM ' + c10.roomName.replace(/^the /i, '') + ', 11 PM ' + c11.roomName.replace(/^the /i, '') + '.';
  if (!game.notes.some((x) => x.text === note)) game.notes.push({ kind: 'press', text: note });
  persist();
  const card = await ncards.pressCard({ asker: { charId: p.char.id, name: p.char.name }, target: { charId: t.char.id, name: t.char.name }, quote, round: game.round }).catch(() => null);
  groupMedia(game, stillWrap(card, '🔦 *' + p.char.name + '* presses *' + t.char.name + '*:\n_“' + quote + '”_\nDoes anyone know better? `' + pfx(game) + ' mm press <n>` · `' + pfx(game) + ' mm accuse <n>`',
    '🔦 ' + p.char.name + ' presses ' + t.char.name + ': “' + quote + '”'));
  return true;
}

async function doAccusePublic(game, p, n) {
  if (game.phase !== 'DEBATE') { await privateText(game, p, 'Accusations are made during the debate.'); return true; }
  const t = byNumber(game, n);
  if (!t || t === p || !t.alive) { await privateText(game, p, 'Accuse who? ' + rosterLine(game)); return true; }
  game.accusations[p.jid] = t.char.id; persist();
  const alive = living(game), need = Math.floor(alive.length / 2) + 1;
  const count = alive.filter((x) => game.accusations[x.jid] === t.char.id).length;
  const card = await ncards.accuseCard({ accuser: { charId: p.char.id, name: p.char.name }, target: { charId: t.char.id, name: t.char.name }, count, need }).catch(() => null);
  groupMedia(game, stillWrap(card, '🔨 *' + p.char.name + '* accuses *' + t.char.name + '* — ' + count + '/' + need + (count >= need ? '\n⚖️ The table has spoken.' : ' · agree with `' + pfx(game) + ' mm accuse ' + n + '`'),
    '🔨 ' + p.char.name + ' accuses ' + t.char.name + ' (' + count + '/' + need + ')'));
  if (count >= need && !game._transitioning) await hang(game, t);
  return true;
}

async function doSkipPublic(game, p) {
  if (game.phase !== 'DEBATE') return true;
  game.skips = game.skips || [];
  if (!game.skips.includes(p.jid)) game.skips.push(p.jid);
  persist();
  const need = Math.floor(living(game).length / 2) + 1;
  groupMedia(game, { text: '⏭ ' + p.char.name + ' is done talking (' + game.skips.length + '/' + need + ').' });
  maybeEarlyAdvance(game);
  return true;
}

async function hang(game, t) {
  game._transitioning = true;
  clearTimer(game.chatId);
  if (game._earlyTimer) { clearTimeout(game._earlyTimer); game._earlyTimer = null; }
  if (t.role === 'KILLER') return finishGame(game, t, 'The table turned on the killer.');
  t.alive = false;
  game.accusations = {};
  game.notes.push({ kind: 'verdict', text: t.char.name + ' was hanged by the table — innocent.' });
  persist();
  privateText(game, t, '☠️ *You were hanged — wrongly.* Watch in silence; the living must find the killer without you.');
  groupMedia(game, { text: '⚖️ *' + t.char.name + ' is hanged by the table…* and they were *innocent*.\nThe killer is still among you. Night falls.' });
  if (checkSuddenEnd(game)) return true;
  await openNight(game);
  return true;
}

// rooms where 2+ guests searched together = an encounter: a scene card in the group + a way to whisper
function sendEncounters(game) {
  const byRoom = {};
  for (const p of living(game)) if (p.lastRoom) (byRoom[p.lastRoom] = byRoom[p.lastRoom] || []).push(p);
  let cardsSent = 0;
  for (const [roomId, ps] of Object.entries(byRoom)) {
    if (ps.length < 2) continue;
    const room = game.rooms.find((r) => r.id === roomId); if (!room) continue;
    for (const a of ps) { a.contacts = a.contacts || []; for (const b of ps) if (a !== b && !a.contacts.includes(b.char.id)) a.contacts.push(b.char.id); }
    const names = ps.map((x) => x.char.name);
    game.notes.push({ kind: 'sight', text: names.join(' & ') + ' met in ' + room.name + ' (round ' + game.round + ').' });
    for (const x of ps) {
      const others = ps.filter((y) => y !== x).map((y) => y.char.name);
      privateText(game, x, '🚪 In ' + room.name + ' you ran into *' + others.join(' and ') + '*. They saw you here — and you saw them.\nWhisper to them: `note ' + others[0].split(' ').slice(-1)[0] + ' <message>`');
    }
    if (cardsSent++ < 2) {
      const line = names.join(' and ') + ' end up in ' + room.name + ' together. Neither expected company.';
      (async () => {
        const card = await ncards.roomSceneCard({ roomId, roomName: room.name, who: ps.map((x) => ({ charId: x.char.id, name: x.char.name })), line, round: game.round }).catch(() => null);
        groupMedia(game, stillWrap(card, '🚪 *' + room.name.replace(/^the /i, 'The ') + '* — ' + names.join(' & ') + ' crossed paths.', '🚪 ' + line));
      })();
    }
  }
  persist();
}

// private channels: `note <who> <msg>` (anyone you met) and `tell <msg>` (killer <-> accomplice)
async function doMessage(game, p, text) {
  const m = text.match(/^(tell|t|note)\s+(.+)$/i); if (!m) return false;
  const kind = m[1].toLowerCase(), rest = m[2].trim();
  if (kind === 'tell' || kind === 't') {
    if (p.role !== 'KILLER' && p.role !== 'ACCOMPLICE') return false;
    const partner = game.players.find((x) => x !== p && (x.role === 'KILLER' || x.role === 'ACCOMPLICE'));
    if (!partner) { await privateText(game, p, 'You have no partner in this house.'); return true; }
    game.tells = (game.tells || 0) + 1;
    if (game.tells > TELL_LIMIT) { await privateText(game, p, 'The walls have ears — you have said enough.'); return true; }
    await privateText(game, partner, '🕯 *' + p.char.name + ' (your partner):* ' + rest.slice(0, 220));
    await privateText(game, p, '✉️ Sent to ' + partner.char.name + '.');
    return true;
  }
  if ((p.notesSent || 0) >= NOTE_LIMIT) { await privateText(game, p, 'No more notes this round — three is all the candlelight allows.'); return true; }
  const wm = rest.match(/^(\S+)\s+([\s\S]+)$/); if (!wm) { await privateText(game, p, 'Usage: `note <name> <message>` — to someone you met.'); return true; }
  const key = wm[1].toLowerCase(), body = wm[2].trim().slice(0, 140);
  const others = living(game).filter((x) => x !== p);
  const target = Number.isFinite(Number(key)) ? others[Number(key) - 1] : others.find((x) => x.char.name.toLowerCase().split(' ').some((w) => w.replace(/[^a-z]/g, '') === key.replace(/[^a-z]/g, '')) || x.name.toLowerCase().includes(key));
  if (!target) { await privateText(game, p, 'No living guest answers to “' + wm[1] + '”.'); return true; }
  if (!(p.contacts || []).includes(target.char.id)) { await privateText(game, p, 'You have not crossed paths with ' + target.char.name + ' — you cannot slip them a note. Search the same room as someone to meet them.'); return true; }
  p.notesSent = (p.notesSent || 0) + 1;
  await privateText(game, target, '📨 *Note from ' + p.char.name + ':* ' + body + '\n_(Reply with_ `note ' + p.char.name.split(' ').slice(-1)[0] + ' <message>`_)_');
  await privateText(game, p, '✉️ Slipped to ' + target.char.name + '.');
  return true;
}

// ---------- finish ----------
async function finishGame(game, convictedPlayer, reason) {
  if (game.phase === 'FINISHED') return;
  const killer = game.players.find((p) => p.role === 'KILLER');
  const accused = convictedPlayer || null;
  const townWins = !!accused && !!killer && accused.char.id === killer.char.id;
  if (accused) game.notes.push({ kind: 'verdict', text: 'The house condemned ' + accused.char.name + (townWins ? ' — correctly.' : ' — wrongly.') });
  const clip = await anim.verdictClip({
    accused: accused ? { charId: accused.char.id, name: accused.char.name } : null,
    killer: killer ? { charId: killer.char.id, name: killer.char.name } : null,
    townWins,
    reason: reason || null,
  }).catch(() => null);
  // commit FINAL state first, then media
  game.phase = 'FINISHED';
  game.verdict = { accusedId: accused ? accused.char.id : null, killerId: killer ? killer.char.id : null, townWins, reason: reason || null, at: Date.now() };
  game.updatedAt = Date.now();
  game.deadline = null;
  game._transitioning = false;
  clearTimer(game.chatId);
  persist();
  groupMedia(game, clipWrap(clip, '⚖️ The verdict is in.',
    townWins
      ? '⚖️ *' + accused.char.name + ' ' + accused.char.title + ' was the murderer. The house is quiet again.*'
      : accused
        ? '⚖️ *' + accused.char.name + ' was innocent. The true murderer walks: ' + (killer ? killer.char.name : 'unknown') + '.*'
        : '⚖️ *No verdict. The murderer walks free: ' + (killer ? killer.char.name : 'unknown') + '.*' + (reason ? '\n_' + reason + '_' : '')));
  // truth reveal — the whole solution, always
  const lines = ['🕯 *THE WHOLE TRUTH* — ' + game.case.victimName + ' died in ' + ((game.rooms.find((r) => r.id === game.case.murderRoomId) || {}).name || '?') + ' at 11 PM.'];
  lines.push('The murderer: *' + (killer ? killer.char.name + ' ' + killer.char.title : 'unknown') + '*. The trace carried the initial "' + game.case.traceInitial + '".');
  lines.push('');
  for (const p of game.players) {
    const acc = game.case.claims[p.char.id];
    const lieSlots = SLOTS.filter((s) => acc[s].lie).join(', ') || 'none';
    const truthSlots = SLOTS.map((s) => s + ' ' + (((game.rooms.find((r) => r.id === game.case.truth[p.char.id][s]) || {}).name || '?').replace(/^the /i, ''))).join(' · ');
    lines.push('*' + p.char.name + '* (' + p.role + (p.alive ? '' : ', dead') + '): ' + truthSlots + ' — lied about: ' + lieSlots);
  }
  lines.push('');
  lines.push(townWins ? 'The guests win. The house thanks you.' : 'The murderer wins. Blackvale keeps its secrets.');
  groupMedia(game, { text2: lines.join('\n') });
  console.log('[Noir] case finished in ' + game.chatId + ' — townWins=' + townWins);
}

// ---------- relay: bare menu replies typed in DMs ----------
async function relay(sock, senderJid, chatId, txt) {
  loadPersisted();
  const text = String(txt || '').trim();
  if (!text) return false;
  const isMsg = /^(tell|t|note)\s+\S+/i.test(text);
  if (isMsg ? text.length > 260 : text.length > 24) return false;
  if (!isMsg && !/^(\d{1,2}|[bk]|share(\s+\d+)?|skip)$/i.test(text)) return false;
  const id = normJid(senderJid);
  let game = null;
  for (const g of games.values()) {
    const p = playerByJid(g, id);
    if (p && g.phase !== 'LOBBY' && g.phase !== 'FINISHED') { game = g; break; }
  }
  if (!game) return false;
  const p = playerByJid(game, id);
  if (!p || !p.alive) return false;
  try {
    bindContext({ sock }, game);
    if (isMsg) return await doMessage(game, p, text);
    if (game.phase === 'SEARCH') {
      const n = Number(text);
      if (Number.isFinite(n) && n >= 1) {
        if (n <= game.rooms.length) return await doSearch(game, p, n);
        return await doQuestion(game, p, n);
      }
      if (/^share/i.test(text)) return await doShare(game, p);
      return false;
    }
    if (game.phase === 'DEBATE') {
      if (/^(skip|k)$/i.test(text)) {
        p.acted = true;
        game.skips = game.skips || []; if (!game.skips.includes(p.jid)) game.skips.push(p.jid);
        persist();
        await privateText(game, p, '🗡 You accuse no one this round — and you are done talking.');
        maybeEarlyAdvance(game);
        return true;
      }
      if (/^share/i.test(text)) return await doShare(game, p);
      if (Number.isFinite(Number(text))) {
        const target = findOtherByPick(game, p, text);
        if (!target) { await privateText(game, p, debateMenu(game, p)); return true; }
        return await doAccuse(game, p, target);
      }
      return false;
    }
    if (game.phase === 'NIGHT') {
      const handled = await doNightAction(game, p, text);
      if (!handled) { await privateText(game, p, nightMenu(game, p)); return true; }
      return handled;
    }
    if (game.phase === 'VOTE') {
      if (/^skip$/i.test(text)) return await doVote(game, p, 'skip');
      if (Number.isFinite(Number(text))) {
        const voted = await doVote(game, p, text);
        if (!voted) { await privateText(game, p, voteMenu(game, p)); return true; }
        return voted;
      }
      return false;
    }
    return false;
  } catch (e) {
    console.error('[Noir] relay error:', e.stack);
    return false;
  }
}

// ---------- command surface ----------
function helpText(prefix) {
  return [
    '🕯 *BLACKVALE: DEAD OF NIGHT* — the rebuilt Murder Mystery',
    'A dinner. A death. A liar among the guests. Animated phases, private menus, one case with one truth.',
    '',
    '`' + prefix + ' murder story create` — open a lobby (4–8 guests)',
    '`' + prefix + ' murder story join` — take a seat',
    '`' + prefix + ' murder story start` — host begins the night',
    '`' + prefix + ' murder story status` — who sits at the table',
    '`' + prefix + ' murder story end` — close the case',
    '',
    '*In the group (the stage):*',
    '`' + prefix + ' murder press <n>` — grill a guest on their account',
    '`' + prefix + ' murder show` — lay your latest find on the table',
    '`' + prefix + ' murder accuse <n>` — accuse; a majority hangs them on the spot',
    '`' + prefix + ' murder skip` — you are done talking (majority ends the debate)',
    '',
    '*In your DMs (the secret layer):* a menu every phase — reply with a number. Whisper `note <name> <msg>` to anyone you met in a room; killer & accomplice use `tell <msg>`.',
  ].join('\n');
}

function statusText(game) {
  const lines = ['🕯 *' + (game.case && game.case.victimName ? game.case.victimName : 'A death') + ' — round ' + game.round + ' of ' + ROUNDS + ' · phase: ' + game.phase + '*'];
  for (const p of game.players) lines.push((p.alive ? '🤍' : '🪦') + ' ' + (p.char ? p.char.name + ' ' + p.char.title : 'unassigned') + ' — ' + p.name + (p.alive ? '' : ' (dead)'));
  if (game.notes.length) {
    lines.push('');
    lines.push('Board notes:');
    for (const n of game.notes.slice(-4)) lines.push('• ' + n.text);
  }
  return lines.join('\n');
}

function dossierText(game, p) {
  if (!p.char) return 'The case has not been dealt yet.';
  const roleLine = {
    KILLER: '🔪 *You are the Killer.*' + (game.players.some((x) => x.role === 'ACCOMPLICE') ? ' Your accomplice is *' + game.players.find((x) => x.role === 'ACCOMPLICE').char.name + '* — whisper with `tell <message>`.' : '') + ' Your 10 PM and 11 PM accounts below are LIES you must hold. The trace in the blood carries the letter "' + game.case.traceInitial + '" — keep them from that room and that letter.',
    DETECTIVE: '🔍 *You are the Detective.* Each night you may lay one guest’s 11 PM account against the house’s records and learn whether it holds.',
    GUARDIAN: '🛡 *You are the Guardian.* Each night you may stand watch over one guest — if the killer comes for them, they live.',
    ACCOMPLICE: '🗝 *You are the Accomplice.* You know the killer: *' + ((game.players.find((x) => x.role === 'KILLER') || {char: {name: 'the killer'}}).char.name) + '*. Win when they walk free. Each night you may strip one guest of protection. Whisper to your partner with `tell <message>`. Expect to lie in public.',
    CIVILIAN: '🤍 *You are a Civilian.* Your eyes and your wits are your weapons. Bolt your door at night, and press guests on their accounts.',
  }[p.role] || 'You are a guest of Blackvale.';
  const lines = ['🕯 *YOUR DOSSIER* — ' + p.char.name + ', ' + p.char.title, '', roleLine, '', '*Your account of the night:*'];
  for (const slot of SLOTS) {
    const a = p.account[slot];
    lines.push('• ' + slot + ' — you were in ' + a.roomName + (a.lie ? ' *(you will swear to this, but it is not true)*' : ' *(true)*'));
  }
  lines.push('');
  lines.push('Hold your account straight, watch the board, and remember: reply to my menus with a single number or letter.');
  return lines.join('\n');
}

function evidenceText(game, p) {
  if (!p.knownClues.length) return 'You hold no evidence yet. Search rooms while the house is awake.';
  const lines = ['🕯 *WHAT YOU HOLD*'];
  for (const c of p.knownClues) lines.push('• [' + (c.shared ? 'pinned' : 'private') + '] ' + c.roomName + ' (' + c.round + '): ' + c.line);
  lines.push('');
  lines.push('Reply *SHARE* during a search or debate to pin your latest find to the case board.');
  return lines.join('\n');
}

async function sendBoardStill(game, p) {
  const boardPlayers = game.players.map((x) => ({ charId: x.char.id, name: x.char.name, short: x.char.name.split(' ').pop(), alive: x.alive }));
  let payload = null;
  try {
    const clip = await anim.boardClip({ round: game.round, rounds: ROUNDS, players: boardPlayers, notes: game.notes.slice(-2), hint: game.case.hint });
    if (clip) payload = clip.still;
  } catch (e) { payload = null; }
  if (payload) return privateImage(game, p, payload, '🗂 The case board — round ' + game.round);
  return privateText(game, p, statusText(game));
}

async function createLobby(ctx) {
  loadPersisted();
  if (games.has(ctx.chatId)) {
    const g = games.get(ctx.chatId);
    if (g.phase === 'FINISHED') { clearTimer(ctx.chatId); games.delete(ctx.chatId); }
    else return groupText(g, 'A case is already open here. `' + g.prefix + ' murder story status` to see the table.');
  }
  const game = makeGame(ctx);
  games.set(ctx.chatId, game);
  persist();
  const lines = [
    '🕯 *BLACKVALE MANOR — DEAD OF NIGHT*',
    'A dinner. A death. A liar among the guests.',
    '',
    'The host: ' + game.hostName,
    'Guests seated: 1 · need ' + MIN_PLAYERS + '–' + MAX_PLAYERS,
    '',
    '`' + game.prefix + ' murder story join` — take a seat',
    '`' + game.prefix + ' murder story start` — the host begins the night',
  ];
  return groupText(game, lines.join('\n'));
}

async function joinLobby(ctx, game) {
  if (game.phase !== 'LOBBY') return groupText(game, 'The guest list is locked — the case has begun.');
  const me = playerByJid(game, senderId(ctx));
  if (me) return groupText(game, me.name + ' already has a seat.');
  if (game.players.length >= MAX_PLAYERS) return groupText(game, 'The table is full (' + MAX_PLAYERS + ').');
  game.players.push({ jid: ctx.senderJid, name: senderName(ctx), alive: true, joinedAt: Date.now(), char: null, role: null, acted: false, bolted: false, knownClues: [], pendingRoomPick: null, protectId: null, savedTonight: false, account: null });
  persist();
  return groupText(game, '🪑 ' + senderName(ctx) + ' takes a seat. ' + game.players.length + ' seated · the host starts at ' + MIN_PLAYERS + ' with `' + game.prefix + ' murder story start`.');
}

async function leaveLobby(ctx, game) {
  if (game.phase !== 'LOBBY') return groupText(game, 'The guest list is locked after the case begins.');
  const me = playerByJid(game, senderId(ctx));
  if (!me) return false;
  game.players = game.players.filter((x) => normJid(x.jid) !== normJid(me.jid));
  if (!game.players.length) {
    clearTimer(game.chatId);
    games.delete(game.chatId);
    persist();
    return groupText(game, 'The last guest has left. The case is discarded.');
  }
  if (game.host === normJid(me.jid)) game.host = normJid(game.players[0].jid);
  persist();
  return groupText(game, me.name + ' withdraws. ' + game.players.length + ' remain seated.');
}

async function startGame(ctx, game) {
  if (game.phase !== 'LOBBY') return groupText(game, 'The case has already begun.');
  if (normJid(ctx.senderJid) !== game.host) {
    const hostName = (game.players.find((x) => normJid(x.jid) === game.host) || {}).name || 'the host';
    return groupText(game, 'Only the host — ' + hostName + ' — may begin the night.');
  }
  if (game.players.length < MIN_PLAYERS) return groupText(game, 'The table needs ' + MIN_PLAYERS + ' guests at minimum. ' + game.players.length + ' are seated.');
  dealCase(game);
  game.round = 1;
  game.notes = [];
  game.votes = {};
  game.accusations = {};
  game.ghostTier = 0;
  game.murders = 0;
  const cast = game.players.map((p) => ({ charId: p.char.id, name: p.char.name, title: p.char.title }));
  // INTRO: commit state first, deliver dossiers, then render the cast roll
  commitPhase(game, 'INTRO');
  for (const p of game.players) {
    privateText(game, p, dossierText(game, p));
  }
  (async () => {
    const clip = await anim.introClip({ cast, subtitle: 'A dinner. A death. A liar among the guests.' }).catch(() => null);
    groupMedia(game, clipWrap(clip, '🕯 *The guests have arrived. Blackvale: Dead of Night begins.*',
      '🕯 *The guests have arrived.* Roles and accounts are being delivered privately — every guest should check their DMs now.'));
  })();
  return true;
}

async function endGame(ctx, game) {
  if (normJid(ctx.senderJid) !== game.host) return groupText(game, 'Only the host may close the case early.');
  clearTimer(game.chatId);
  if (game._earlyTimer) { clearTimeout(game._earlyTimer); game._earlyTimer = null; }
  games.delete(game.chatId);
  persist();
  return groupText(game, '🕯 The case is closed and the table cleared. `' + game.prefix + ' murder story create` opens a new night.');
}

async function handleCommand(ctx, services) {
  runtime = services || runtime || {};
  loadPersisted();
  const raw = String(ctx.rest || '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const action = String(parts.shift() || 'help').toLowerCase().replace(/[^a-z0-9]/g, '');
  const arg = parts.join(' ').trim();
  const groupContext = isGroup(ctx);
  const game = gameForContext(ctx);
  if (game) bindContext(ctx, game);

  if (['help', 'menu', 'rules'].includes(action)) {
    if (game) return groupContext ? groupText(game, helpText(ctx.prefix || '.j')) : privateText(game, playerByJid(game, senderId(ctx)), helpText(ctx.prefix || '.j'));
    if (groupContext) return runtime.sendGroup ? runtime.sendGroup(ctx.sock, ctx.chatId, helpText(ctx.prefix || '.j')) : false;
    return runtime.sendDM ? runtime.sendDM(ctx.sock, ctx.senderJid, helpText(ctx.prefix || '.j')) : false;
  }
  if (['create', 'open', 'new', 'lobby'].includes(action)) return createLobby(ctx);
  if (!game) {
    const msg = 'No Dead of Night case is attached to this chat. Open one with `' + (ctx.prefix || '.j') + ' murder story create`.';
    return groupContext ? groupText({ chatId: ctx.chatId, _sock: ctx.sock }, msg) : (runtime.sendDM ? runtime.sendDM(ctx.sock, ctx.senderJid, msg) : false);
  }
  if (action === 'join') return joinLobby(ctx, game);
  if (action === 'leave') return leaveLobby(ctx, game);
  if (action === 'start' || action === 'begin') return startGame(ctx, game);
  if (action === 'status' || action === 'players' || action === 'roster' || action === 'guests') return groupText(game, statusText(game));
  if (action === 'end' || action === 'stop' || action === 'cancel') return endGame(ctx, game);

  const p = playerByJid(game, senderId(ctx));
  if (!p) {
    return groupContext ? groupText(game, 'Only guests seated at this table can act. Claim a seat with `' + game.prefix + ' murder story join`.') : (runtime.sendDM ? runtime.sendDM(ctx.sock, ctx.senderJid, 'You are not seated at this table.') : false);
  }
  if (!p.alive) return privateText(game, p, '🪦 You watch from the portraits now. The dead listen, but they do not act.');

  if (game.phase === 'LOBBY') return groupText(game, 'The case has not begun. The host starts it with `' + game.prefix + ' murder story start`.');
  if (game.phase === 'FINISHED') return groupText(game, 'This case is closed. `' + game.prefix + ' murder story create` opens a new one.');

  // info commands work in any phase
  if (['dossier', 'role', 'me'].includes(action)) return privateText(game, p, dossierText(game, p));
  if (['evidence', 'journal', 'clues'].includes(action)) return privateText(game, p, evidenceText(game, p));
  if (action === 'board') return sendBoardStill(game, p);
  if (action === 'rooms') return privateText(game, p, game.rooms.map((r, i) => '*' + (i + 1) + '* — ' + r.name + ' — _' + r.hint + '_').join('\n'));
  if (['share', 'show'].includes(action)) return doShare(game, p);
  if (['press', 'ask'].includes(action)) return doPress(game, p, Number(arg));
  if (action === 'accuse' && groupContext) return doAccusePublic(game, p, Number(arg));
  if (action === 'skip' && game.phase === 'DEBATE' && groupContext) return doSkipPublic(game, p);
  if (['note', 'tell'].includes(action)) return doMessage(game, p, action + ' ' + arg);

  if (game.phase === 'INTRO') return privateText(game, p, dossierText(game, p) + '\n\n_The first round begins shortly._');

  if (game.phase === 'SEARCH') {
    if (action && Number.isFinite(Number(action)) && !arg) {
      const n = Number(action);
      if (n <= game.rooms.length) return doSearch(game, p, n);
      return doQuestion(game, p, n);
    }
    if (['search', 'room'].includes(action)) {
      const num = Number(arg);
      if (Number.isFinite(num) && num >= 1) {
        if (num <= game.rooms.length) return doSearch(game, p, num);
        return doQuestion(game, p, num);
      }
      return privateText(game, p, searchMenu(game, p));
    }
    if (['question', 'ask', 'press'].includes(action)) {
      const num = Number(arg);
      if (Number.isFinite(num)) return doQuestion(game, p, num + game.rooms.length);
      return privateText(game, p, searchMenu(game, p));
    }
    return privateText(game, p, searchMenu(game, p));
  }
  if (game.phase === 'DEBATE') {
    if (action === 'skip') {
      p.acted = true;
      game.skips = game.skips || []; if (!game.skips.includes(p.jid)) game.skips.push(p.jid);
      persist();
      await privateText(game, p, '🗡 You accuse no one this round — and you are done talking.');
      maybeEarlyAdvance(game);
      return true;
    }
    if (['accuse', 'point'].includes(action) || (arg && Number.isFinite(Number(arg))) || (action && Number.isFinite(Number(action)))) {
      let target = null;
      const numRaw = arg && Number.isFinite(Number(arg)) ? Number(arg) : (action && Number.isFinite(Number(action)) ? Number(action) : null);
      if (numRaw) target = findOtherByPick(game, p, numRaw);
      else if (arg) {
        const t = arg.toLowerCase();
        target = living(game).find((o) => o !== p && (o.char.name.toLowerCase().includes(t) || o.name.toLowerCase().includes(t))) || null;
      }
      if (!target) return privateText(game, p, debateMenu(game, p));
      return doAccuse(game, p, target);
    }
    return privateText(game, p, debateMenu(game, p));
  }
  if (game.phase === 'NIGHT') {
    if (action === 'bolt') return doNightAction(game, p, 'B');
    if (['kill', 'hunt', 'night', 'act', 'hold', 'guard', 'protect', 'compare'].includes(action)) {
      const num = Number(arg);
      return doNightAction(game, p, Number.isFinite(num) && arg ? String(num) : (arg || 'K'));
    }
    return privateText(game, p, nightMenu(game, p));
  }
  if (game.phase === 'VOTE') {
    if (['vote', 'ballot'].includes(action)) {
      if (/^skip$/i.test(arg)) return doVote(game, p, 'skip');
      if (arg && Number.isFinite(Number(arg))) return doVote(game, p, arg);
      if (arg) return doVote(game, p, arg);
      return privateText(game, p, voteMenu(game, p));
    }
    if (action && Number.isFinite(Number(action))) return doVote(game, p, action);
    return privateText(game, p, voteMenu(game, p));
  }
  return groupContext ? groupText(game, helpText(game.prefix)) : privateText(game, p, helpText(game.prefix));
}

function hasActiveGame(chatId) {
  loadPersisted();
  const game = games.get(chatId);
  return !!game && game.phase !== 'FINISHED';
}

function init(services) {
  runtime = services || runtime || {};
  loadPersisted();
}

const PUBLIC_VERBS = ['press', 'ask', 'show', 'accuse', 'skip', 'note', 'tell'];
function isVerb(v) { return PUBLIC_VERBS.includes(String(v || '').toLowerCase().replace(/[^a-z]/g, '')); }

module.exports = {
  handleCommand,
  isVerb,
  init,
  hasActiveGame,
  relay,
  _internal: {
    games,
    loadPersisted,
    persist,
    makeGame,
    dealCase,
    commitPhase,
    advancePhase,
    maybeEarlyAdvance,
    doSearch,
    doQuestion,
    doShare,
    doAccuse,
    doNightAction,
    doVote,
    finishGame,
    searchMenu,
    debateMenu,
    nightMenu,
    voteMenu,
    dossierText,
    relay,
    DUR,
  },
};

