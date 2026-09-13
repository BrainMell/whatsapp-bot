// ============================================
// MURDER MYSTERY — BLACKVALE MANOR
// A turn-based social deduction game for WhatsApp.
//
// Loop: lobby → secret roles (DM image cards) → night
//       (kill + room / investigate / protect) → dawn
//       → search phase → body discovery → ghost clues
//       → discussion → voting → elimination → repeat.
//
// Roles: 1 KILLER + 1 INVESTIGATOR + 1 GUARDIAN (5+ players)
//        + Civilians. Characters (the 11 manor sprites)
//        are story persons only — any of them can hold
//        any role.
//
// Isolated module: state lives in its own System keys
// (per bot instance), commands live under `murder`/`mm`,
// cards render locally via node-canvas. No RPG assets.
//
// Dead players: independent, loophole-free silence gate —
// the engine deletes EVERYTHING they post in the group
// (text, media, view-once, stickers, commands). The gate
// is bound to the game lifecycle and cannot be bypassed
// with `.j claim` or any normal-mute workaround.
// ============================================

const system = require('../../utils/system');
const botConfig = require('../../../botConfig');
const characters = require('./characters');
const cases = require('./cases');
const cards = require('./cards');

// ---------- tunables ----------
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 11;        // character pool size
const NIGHT_MS = 180000;       // 3 minutes of darkness (real humans need to read + act)
const NUDGE_BEFORE_MS = 45000; // "the night is thinning" DM before dawn
const DAWN_EXTEND_MS = 60000;  // one extension while a required actor sleeps
const DISCUSS_MS = 300000;     // 5 minutes of accusations (and one search each)
const VOTE_MS = 90000;         // 90s on the ballot
const LOBBY_TTL_MS = 30 * 60000;
// --- self-healing phase machine (the live game froze when phase timers fired
// late/never under load) — the watchdog forces every stalled transition ---
const WATCHDOG_MS = 15000;          // tick every 15s
const WATCHDOG_GRACE_MS = 12000;    // deadline must be this stale before forcing
const RESOLVE_STALE_MS = 45000;     // resolution flags older than this are dead
const TRANSITION_DEDUPE_MS = 8000;  // same transition twice within this = bug, block
const VOTE_REMIND_MS = 30000;       // "the count closes" reminder
const DISCUSS_REMIND_MS = 60000;    // "votes in a minute" reminder
const TAUNT_MAX_LEN = 160;
const WILL_MAX_LEN = 200;
const SILENCE_TTL_MS = 12 * 3600000; // failsafe only — silence is released at case close
const DM_SEND_DELAY_MS = 1100;       // pacing for role-card DM bursts
const REVEAL_ROLE_ON_DEATH = false;  // configurable

// per-bot persistence: instances must never clobber each other's games
function botIdSafe() {
  try { return botConfig.getBotId() || 'global'; } catch (e) { return 'global'; }
}
const GAMES_KEY_BASE = 'murder_mm_games_v2';
const LEGACY_GAMES_KEY = 'murder_mm_games_v1';
const ARCHIVE_KEY_BASE = 'murder_mm_archive_v2';

const PHASE = {
  LOBBY: 'LOBBY',
  NIGHT: 'NIGHT',
  DISCUSSION: 'DISCUSSION',
  VOTING: 'VOTING',
};

// ---------- state ----------
const games = new Map();     // chatId -> game
const timers = new Map();    // chatId -> Timeout (phase deadline)
const nudges = new Map();    // chatId -> Timeout (pre-dawn reminder)
const reminders = new Map(); // chatId -> Timeout (vote/discussion clock reminder)
const silenced = new Map();  // chatId -> Map(normJid -> ts)
let _watchdog = null;

function normJid(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0];
}

function persistGames() {
  const out = {};
  for (const [chatId, g] of games) {
    // strip EVERY internal key (timers, socks, resolution flags, dedupe stamps)
    const clean = {};
    for (const k of Object.keys(g)) if (k[0] !== '_') clean[k] = g[k];
    out[chatId] = clean;
  }
  system.set(`${GAMES_KEY_BASE}_${botIdSafe()}`, out);
}

function loadPersisted() {
  try {
    const now = Date.now();
    const mine = botIdSafe();
    // v2 (per-bot) state first
    const saved = system.get(`${GAMES_KEY_BASE}_${mine}`, null);
    if (saved && typeof saved === 'object') {
      for (const [chatId, g] of Object.entries(saved)) adoptGame(chatId, g, now);
    }
    // legacy v1 flat map — adopt only this bot's games (migration)
    if (system.get(LEGACY_GAMES_KEY, null)) {
      const legacy = system.get(LEGACY_GAMES_KEY, null);
      for (const [chatId, g] of Object.entries(legacy || {})) {
        if (g && g.botId === mine && !games.has(chatId)) adoptGame(chatId, g, now);
      }
      system.set(LEGACY_GAMES_KEY, {}); // consumed
    }
    if (games.size) console.log(`🔪 [MurderMystery] rehydrated ${games.size} game(s) for bot ${mine}`);
    if (games.size) ensureWatchdog(); // rehydrated games need the self-healing watchdog too
  } catch (e) {
    console.error('🔪 [MurderMystery] rehydrate failed:', e.message);
  }
}

function adoptGame(chatId, g, now) {
  if (!g || !g.phase || g.phase === PHASE.LOBBY) {
    if (!g || now - (g.createdAt || now) > LOBBY_TTL_MS) return; // drop stale lobbies
  }
  if (g.phase === PHASE.LOBBY && now - (g.createdAt || now) > LOBBY_TTL_MS) return;
  games.set(chatId, { ...g, _resolving: false, _resolving2: false });
  // rebuild dead-player silences (they live in memory only)
  for (const p of (g.players || [])) {
    if (p.alive === false) silence(chatId, p.jid);
  }
  schedulePhaseTimer(chatId);
}

// ---------- dead-player silence (engine hard-gate calls this) ----------
function silence(chatId, jid) {
  if (!silenced.has(chatId)) silenced.set(chatId, new Map());
  silenced.get(chatId).set(normJid(jid), Date.now());
}

function unsilenceChat(chatId) {
  silenced.delete(chatId);
}

// Bound to the game lifecycle: no game → no silence (never outlives the case).
function isSilenced(jid, chatId) {
  const set = silenced.get(chatId);
  if (!set || !set.size) return false;
  if (!games.has(chatId)) { silenced.delete(chatId); return false; }
  const key = normJid(jid);
  const ts = set.get(key);
  if (!ts) return false;
  if (Date.now() - ts > SILENCE_TTL_MS) { // failsafe purge
    set.delete(key);
    return false;
  }
  return true;
}

// the sock that actually receives this game's chat: captured from the last
// command ctx (the hosting account is the one IN the group). Falls back to the
// engine's module sock. Timer-driven sends MUST use this — getSockSafe() alone
// returns whichever of the 3 bot accounts connected last, which may not even
// be in the group (that is how the live vote prompt silently vanished).
function sockForGame(g) {
  if (g && g._sock) return g._sock;
  return getSockSafe();
}

// remember the live sock on the game (internal key — never persisted)
function noteSock(g, sock) {
  if (g && sock) g._sock = sock;
}

// idempotency stamp: the same transition twice within TRANSITION_DEDUPE_MS is
// always a double-fire (late timer + watchdog), never a legit new round.
// NOTE: keys must be per-round (e.g. `night3`) — a new round may legitimately
// re-enter the same phase within the window (fast QA loops, tiny real games).
function beginTransition(g, key) {
  if (!g) return false;
  const now = Date.now();
  const k = `_t_${key}`;
  if (g[k] && now - g[k] < TRANSITION_DEDUPE_MS) return false;
  g[k] = now;
  return true;
}

// find a game a given jid is playing in (for DM commands; games are keyed by group chat)
function findGameForPlayer(jid) {
  const n = normJid(jid);
  let best = null;
  for (const g of games.values()) {
    if (getPlayer(g, n)) {
      if (!best || (g.createdAt || 0) > (best.createdAt || 0)) best = g;
    }
  }
  return best;
}

function gameChatIdOf(g) {
  return g ? g.chatId : null;
}

// ---------- game access ----------
function getGame(chatId) {
  return games.get(chatId) || null;
}

function getPlayer(game, jid) {
  const n = normJid(jid);
  return game.players.find((p) => normJid(p.jid) === n) || null;
}

function alivePlayers(game) {
  return game.players.filter((p) => p.alive);
}

function aliveNonKillers(game) {
  return alivePlayers(game).filter((p) => p.role !== 'KILLER');
}

function aliveKillers(game) {
  return alivePlayers(game).filter((p) => p.role === 'KILLER');
}

function livingKiller(game) {
  return alivePlayers(game).find((p) => p.role === 'KILLER') || null;
}

function livingInvestigator(game) {
  return alivePlayers(game).find((p) => p.role === 'INVESTIGATOR') || null;
}

function livingGuardian(game) {
  return alivePlayers(game).find((p) => p.role === 'GUARDIAN') || null;
}

// display name with a safe fallback
function nameOf(p) {
  return p.name || `Guest ${normJid(p.jid).slice(-4)}`;
}

// numbered seating order of the living; includeSelfJid marks the sender with (you).
// Numbers match resolveRosterTarget's indexing (both use the same filtered pool).
function rosterLines(game, excludeJid = null, includeSelfJid = null) {
  const ex = excludeJid ? normJid(excludeJid) : null;
  const inc = includeSelfJid ? normJid(includeSelfJid) : null;
  return alivePlayers(game)
    .filter((p) => !ex || normJid(p.jid) !== ex)
    .map((p, i) => `  ${i + 1}. ${nameOf(p)} — ${p.char.name}${normJid(p.jid) === inc ? ' (you)' : ''}`);
}

// resolve a target from number / player name / character name against the printed roster
function resolveRosterTarget(game, raw, excludeJid = null, selfJid = null) {
  if (!raw) return null;
  const ex = excludeJid ? normJid(excludeJid) : null;
  const pool = alivePlayers(game).filter((p) => !ex || normJid(p.jid) !== ex);
  const q = String(raw).trim().toLowerCase();
  if (/^\d+$/.test(q)) {
    const idx = parseInt(q, 10) - 1;
    if (idx >= 0 && idx < pool.length) return pool[idx];
    return null;
  }
  if (q === 'me' || q === 'self' || q === 'myself') {
    return pool.find((p) => normJid(p.jid) === normJid(selfJid)) || null;
  }
  const clean = q.replace(/^@/, '');
  return pool.find((p) =>
    nameOf(p).toLowerCase().includes(clean) ||
    (p.char.name || '').toLowerCase().includes(clean) ||
    (p.char.title || '').toLowerCase().includes(clean)) || null;
}

// resolve a room from number / name fragment
function resolveRoom(game, raw) {
  if (!game.rooms || !game.rooms.length) return null;
  const q = String(raw || '').trim().toLowerCase().replace(/^the\s+/, '');
  if (!q) return null;
  if (/^\d+$/.test(q)) {
    const idx = parseInt(q, 10) - 1;
    if (idx >= 0 && idx < game.rooms.length) return { room: game.rooms[idx], idx };
    return null;
  }
  for (let i = 0; i < game.rooms.length; i++) {
    const nm = game.rooms[i].name.toLowerCase().replace(/^the\s+/, '');
    if (nm === q || nm.includes(q) || q.includes(nm)) return { room: game.rooms[i], idx: i };
  }
  return null;
}

function roomListOf(game) {
  return (game.rooms || []).map((r, i) => `  ${i + 1}. ${r.name} — _${r.hint} · ${r.concealLabel}_`).join('\n');
}

// ---------- messaging ----------
async function sendGroup(sock, chatId, text, extra = {}) {
  try {
    await sock.sendMessage(chatId, { text, ...extra });
    return true;
  } catch (e) {
    console.error('🔪 [MurderMystery] group send failed:', e.message);
    return false;
  }
}

async function sendGroupImage(sock, chatId, buffer, caption, mentions = []) {
  try {
    await sock.sendMessage(chatId, { image: buffer, caption, contextInfo: mentions.length ? { mentionedJid: mentions } : undefined });
    return true;
  } catch (e) {
    console.error('🔪 [MurderMystery] group image send failed:', e.message);
    return false;
  }
}

async function sendDM(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
    return true;
  } catch (e) {
    console.error('🔪 [MurderMystery] DM send failed:', e.message);
    return false;
  }
}

async function sendDMImage(sock, jid, buffer, caption) {
  try {
    await sock.sendMessage(jid, { image: buffer, caption });
    return true;
  } catch (e) {
    console.error('🔪 [MurderMystery] DM image send failed:', e.message);
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- timers ----------
function clearTimers(chatId) {
  const t = timers.get(chatId);
  if (t) clearTimeout(t);
  timers.delete(chatId);
  const n = nudges.get(chatId);
  if (n) clearTimeout(n);
  nudges.delete(chatId);
  const r = reminders.get(chatId);
  if (r) clearTimeout(r);
  reminders.delete(chatId);
}

// one-shot phase-clock reminder ("votes in a minute", "the count closes")
function scheduleReminder(chatId, ms, kind) {
  const r = setTimeout(() => {
    reminders.delete(chatId);
    sendPhaseReminder(chatId, kind).catch((e) => console.error('🔪 [MurderMystery] reminder error:', e.message));
  }, ms);
  if (reminders.has(chatId)) clearTimeout(reminders.get(chatId));
  reminders.set(chatId, r);
}

async function sendPhaseReminder(chatId, kind) {
  const g = getGame(chatId);
  if (!g || !g.deadline) return;
  const prefix = g.prefix || '.j';
  if (kind === 'discussion' && g.phase === PHASE.DISCUSSION) {
    const unfound = (g.bodies || []).filter((b) => !b.found).length;
    const bodyNote = unfound ? ` ⚠️ ${unfound} bod${unfound === 1 ? 'y lies' : 'ies lie'} unfound — a search may find it.` : '';
    await sendGroupCritical(g, chatId,
      `⏱️ The house votes in ONE minute.${bodyNote}\nLast chance: \`${prefix} mm search <number|room>\`.`);
  }
  if (kind === 'vote' && g.phase === PHASE.VOTING) {
    const alive = alivePlayers(g);
    const out = alive.length - Object.keys(g.votes || {}).length;
    if (out <= 0) return;
    await sendGroupCritical(g, chatId,
      `⚖️ The count closes in 30 seconds — *${out} ballot${out === 1 ? '' : 's'}* still out.\nVote: \`${prefix} mm vote <number|name|skip>\`.`);
  }
}

// group send with fallback: try the game's captured sock, then the engine sock
async function sendGroupCritical(g, chatId, text, extra = {}) {
  let okSend = await sendGroup(sockForGame(g), chatId, text, extra);
  if (!okSend && g && g._sock) {
    const alt = getSockSafe();
    if (alt && alt !== g._sock) okSend = await sendGroup(alt, chatId, text, extra);
  }
  return okSend;
}

function schedulePhaseTimer(chatId) {
  const g = getGame(chatId);
  if (!g || !g.deadline) return;
  const t = setTimeout(() => {
    timers.delete(chatId);
    onPhaseTimeout(chatId).catch((e) => console.error('🔪 [MurderMystery] phase timeout error:', e.message));
  }, Math.max(1500, g.deadline - Date.now()));
  if (timers.has(chatId)) clearTimeout(timers.get(chatId));
  timers.set(chatId, t);
}

function scheduleNudge(chatId) {
  const g = getGame(chatId);
  if (!g || !g.deadline) return;
  const fireIn = g.deadline - NUDGE_BEFORE_MS - Date.now();
  if (fireIn <= 1500) return; // too late to bother
  const n = setTimeout(() => {
    nudges.delete(chatId);
    sendNightNudges(chatId).catch((e) => console.error('🔪 [MurderMystery] nudge error:', e.message));
  }, fireIn);
  if (nudges.has(chatId)) clearTimeout(nudges.get(chatId));
  nudges.set(chatId, n);
}

// DM the living role-actors who have not yet acted tonight
async function sendNightNudges(chatId) {
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.NIGHT) return;
  const sock = getSockSafe();
  if (!sock) return;
  const left = Math.max(1, Math.ceil((g.deadline - Date.now()) / 1000));
  const killer = livingKiller(g);
  if (killer && !g.killerTargetJid) {
    await sendDM(sock, killer.jid, `🌙 The night thins — ${left}s of dark remain.\n\`${g.prefix} mm kill <number>\` — then \`mm room <number>\` to hide the body.`);
  }
  const inv = livingInvestigator(g);
  if (inv && !g.investTargetJid) {
    await sendDM(sock, inv.jid, `🌙 The night thins — ${left}s of dark remain.\n\`${g.prefix} mm investigate <number>\` before dawn takes the chance from you.`);
  }
  const ga = livingGuardian(g);
  if (ga && !g.protectTargetJid) {
    await sendDM(sock, ga.jid, `🌙 The night thins — ${left}s remain.\n\`${g.prefix} mm protect <number|me>\` if you wish to stand watch.`);
  }
}

// one gentle dawn extension while a REQUIRED actor (killer or living investigator) hasn't acted
function nightNeedsExtension(g) {
  if (!g || g.extendedTonight) return false;
  const killer = livingKiller(g);
  if (killer && !g.killerTargetJid) return true;
  const inv = livingInvestigator(g);
  if (inv && !g.investTargetJid) return true;
  return false;
}

async function onPhaseTimeout(chatId, sockOverride = null, opts = {}) {
  const g = getGame(chatId);
  if (!g) return;
  // force = watchdog path: skip the in-flight guards ONLY when the flags are
  // provably dead (stale) — a live resolution (image uploads can be slow) is
  // never interrupted
  if (opts.force) {
    const now = Date.now();
    if (g._resolving2 && now - (g._resolving2At || 0) < RESOLVE_STALE_MS) return;
    if (g._resolving && now - (g._resolvingAt || 0) < RESOLVE_STALE_MS) return;
    g._resolving = false;
    g._resolving2 = false;
  } else if (g._resolving || g._resolving2) {
    return;
  }
  const sock = sockOverride || sockForGame(g);
  if (g.phase === PHASE.LOBBY) {
    if (g.players.length === 0) return endGame(sock, chatId, 'The lobby dissolved into the fog. Nobody came.');
    return endGame(sock, chatId, 'The lobby sat empty too long. The manor lost interest.');
  }
  if (g.phase === 'STARTING') return beginNight(sock, chatId); // crashed mid role-deal: resume the night
  if (g.phase === PHASE.NIGHT) {
    if (nightNeedsExtension(g)) {
      g.extendedTonight = true;
      g.deadline = Date.now() + DAWN_EXTEND_MS;
      persistGames();
      schedulePhaseTimer(chatId);
      await sendGroup(sock, chatId, `🌙 Dawn hesitates. The manor grants the darkness one more minute.`);
      await sendNightNudges(chatId);
      return;
    }
    return resolveNight(sock, chatId, 'dawn forced its hand');
  }
  if (g.phase === PHASE.DISCUSSION) return beginVoting(sock, chatId);
  if (g.phase === PHASE.VOTING) return resolveVote(sock, chatId, 'time ran out');
}

// ============================================
// WATCHDOG — the phase machine is now self-healing. Any phase whose deadline
// passed WATCHDOG_GRACE_MS ago without completing its transition is forced
// forward. This kills every freeze class: lost/late timers, event-loop
// stalls, crashed resolutions, restarts mid-transition.
// ============================================
async function watchdogTick() {
  const now = Date.now();
  for (const [chatId, g] of [...games]) {
    try {
      // heal dead resolution flags (a resolution that crashed long ago)
      if (g._resolving && now - (g._resolvingAt || 0) > RESOLVE_STALE_MS) {
        console.log(`🔪 [MurderMystery] watchdog: healing stale _resolving in ${chatId} (${g.phase})`);
        g._resolving = false;
      }
      if (g._resolving2 && now - (g._resolving2At || 0) > RESOLVE_STALE_MS) {
        console.log(`🔪 [MurderMystery] watchdog: healing stale _resolving2 in ${chatId} (${g.phase})`);
        g._resolving2 = false;
      }
      if (g.phase === 'ENDED' || !g.deadline) continue;
      if (now <= g.deadline + WATCHDOG_GRACE_MS) continue;
      // VOTING with every ballot already in: resolve now, don't wait for anything
      if (g.phase === PHASE.VOTING) {
        const alive = alivePlayers(g).length;
        if (alive > 0 && Object.keys(g.votes || {}).length >= alive && !g._resolving) {
          console.log(`🔪 [MurderMystery] watchdog: all ballots in but vote unresolved in ${chatId} — resolving now`);
          g._resolving = true;
          g._resolvingAt = now;
          setTimeout(() => resolveVote(sockForGame(g), chatId, 'watchdog: every ballot was in'), 500);
          continue;
        }
      }
      console.log(`🔪 [MurderMystery] watchdog: forcing stalled ${g.phase} in ${chatId} (${Math.round((now - g.deadline) / 1000)}s past deadline)`);
      await onPhaseTimeout(chatId, sockForGame(g), { force: true });
    } catch (e) {
      console.error('🔪 [MurderMystery] watchdog tick error:', e.message);
    }
  }
}

function ensureWatchdog() {
  if (_watchdog) return;
  _watchdog = setInterval(() => {
    watchdogTick().catch((e) => console.error('🔪 [MurderMystery] watchdog error:', e.message));
  }, WATCHDOG_MS);
  if (_watchdog.unref) _watchdog.unref();
  console.log(`🔪 [MurderMystery] phase watchdog armed (${WATCHDOG_MS / 1000}s tick)`);
}

function getSockSafe() {
  try {
    const engine = require('../../engine'); // NOTE: we are two levels deep (core/games/murdermystery/)
    return engine.getSock ? engine.getSock() : null;
  } catch (e) {
    return null;
  }
}

// silent teardown (empty lobby timeout etc.) — releases silences and timers
async function endGame(sock, chatId, reason) {
  const g = getGame(chatId);
  if (!g) return;
  console.log(`🔪 [MurderMystery] game ended in ${chatId} — ${reason}`);
  await sendGroup(sock, chatId, `🕯️ ${reason}`);
  unsilenceChat(chatId);
  clearTimers(chatId);
  games.delete(chatId);
  persistGames();
}

// ============================================
// PHASE MACHINE
// ============================================

async function createLobby(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ The manor only opens its doors to *groups*. Gather your guests and try again.`);
  if (getGame(chatId)) {
    const g = getGame(chatId);
    if (g.phase === PHASE.LOBBY) return sendGroup(sock, chatId, `${botMarker}🕯️ A lobby is already open — \`${g.prefix} mm join\` to step inside. (${g.players.length} waiting)`);
    return sendGroup(sock, chatId, `${botMarker}🕯️ A mystery is already unfolding here. \`${g.prefix} mm status\` to watch it bleed.`);
  }
  const game = {
    chatId,
    botId: ctx.botId,
    prefix: ctx.prefix,
    host: normJid(senderJid),
    createdAt: Date.now(),
    phase: PHASE.LOBBY,
    deadline: Date.now() + LOBBY_TTL_MS,
    players: [{ jid: senderJid, name: ctx.senderName, char: null, role: 'CIVILIAN', alive: true }], // host auto-joins
    night: 0,
    rooms: cases.drawRooms(6),
    bodies: [],
    searches: { night: 0, used: {} },
    killerTargetJid: null,
    killerRoomIdx: null,
    protectTargetJid: null,
    investTargetJid: null,
    investResults: [],
    cluesGiven: 0,
    extendedTonight: false,
    votes: {},
    log: [],
    _resolving: false,
  };
  games.set(chatId, game);
  persistGames();
  schedulePhaseTimer(chatId);
  ensureWatchdog();

  const opener = cases.pick(cases.OPENING_LINES);
  // the start message gets a card (user ask) — text fallback kept
  let lobbyCardOk = false;
  try {
    const buf = await cards.renderLobbyCard({
      manorName: cases.MANOR_NAME,
      playerCount: game.players.length,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      openingLine: opener,
      prefix: ctx.prefix,
    });
    if (buf) {
      lobbyCardOk = true;
      await sendGroupImage(sock, chatId, buf,
        `${botMarker}🕯️ *BLACKVALE MANOR OPENS ITS DOORS*\n\n` +
        `_“${opener}”_\n\n` +
        `• Join: \`${ctx.prefix} mm join\` · Leave: \`${ctx.prefix} mm leave\`\n` +
        `• Host begins with: \`${ctx.prefix} mm start\`\n` +
        `*${MIN_PLAYERS}–${MAX_PLAYERS} guests.* One will be the killer. One will hunt them. Perhaps one will guard the rest.\n` +
        `⏱️ The lobby holds for 30 minutes.`);
    }
  } catch (e) { /* text fallback */ }
  if (!lobbyCardOk) {
    await sendGroup(sock, chatId,
      `${botMarker}🕯️ *BLACKVALE MANOR OPENS ITS DOORS*\n\n` +
      `_“${opener}”_\n\n` +
      `• Join: \`${ctx.prefix} mm join\`\n` +
      `• Leave: \`${ctx.prefix} mm leave\`\n` +
      `• Roster: \`${ctx.prefix} mm players\`\n` +
      `• Begin (host only): \`${ctx.prefix} mm start\`\n\n` +
      `*${MIN_PLAYERS}–${MAX_PLAYERS} guests.* One will be the killer. One will hunt them. Perhaps one will guard the rest.\n` +
      `⏱️ The lobby holds for 30 minutes.`);
  }
}

async function joinLobby(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ Join from the group where the manor stands.`);
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.LOBBY) return sendGroup(sock, chatId, `${botMarker}🕯️ No lobby is open. \`${ctx.prefix} mm create\` to light the candles.`);
  const n = normJid(senderJid);
  if (g.players.some((p) => normJid(p.jid) === n)) return sendGroup(sock, chatId, `${botMarker}🕯️ You are already on the guest list, @${n}.`, { contextInfo: { mentionedJid: [senderJid] } });
  if (g.players.length >= MAX_PLAYERS) return sendGroup(sock, chatId, `${botMarker}🕯️ The manor only has ${MAX_PLAYERS} beds. The guest list is full.`);
  g.players.push({ jid: senderJid, name: ctx.senderName, char: null, role: 'CIVILIAN', alive: true });
  persistGames();
  await sendGroup(sock, chatId,
    `${botMarker}🕯️ @${n} accepts the invitation. (${g.players.length} guest${g.players.length === 1 ? '' : 's'} — ${g.players.length}/${MIN_PLAYERS}${g.players.length >= MIN_PLAYERS ? ', enough to begin' : ' so far'})` +
    (g.players.length >= MIN_PLAYERS ? `\nThe host may begin with \`${g.prefix} mm start\`.` : ''),
    { contextInfo: { mentionedJid: [senderJid] } });
}

async function leaveLobby(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ Leave from the group where the manor stands.`);
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.LOBBY) return sendGroup(sock, chatId, `${botMarker}🕯️ There is no lobby to leave.`);
  const n = normJid(senderJid);
  const idx = g.players.findIndex((p) => normJid(p.jid) === n);
  if (idx === -1) return sendGroup(sock, chatId, `${botMarker}🕯️ You were never on the guest list.`);
  g.players.splice(idx, 1);
  if (g.players.length === 0) {
    clearTimers(chatId);
    games.delete(chatId);
    persistGames();
    return sendGroup(sock, chatId, `${botMarker}🕯️ The last guest has left. The manor goes dark.`);
  }
  if (g.host === n) {
    g.host = normJid(g.players[0].jid);
    await sendGroup(sock, chatId, `${botMarker}🕯️ The host has withdrawn. @${g.host} now holds the keys.`, { contextInfo: { mentionedJid: [g.players[0].jid] } });
  }
  persistGames();
  await sendGroup(sock, chatId, `${botMarker}🕯️ @${n} declines the invitation. (${g.players.length} remaining)`, { contextInfo: { mentionedJid: [senderJid] } });
}

async function showPlayers(ctx) {
  const { sock, chatId, botMarker } = ctx;
  const g = getGame(chatId);
  if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ No mystery here yet. \`${ctx.prefix} mm create\` to open the manor.`);
  if (g.phase === PHASE.LOBBY) {
    const lines = g.players.map((p, i) => `  ${i + 1}. @${normJid(p.jid)}`).join('\n') || '  _nobody yet…_';
    return sendGroup(sock, chatId,
      `${botMarker}📜 *GUEST LIST — ${cases.MANOR_NAME}*\n\n${lines}\n\n` +
      `Host: @${g.host} · ${g.players.length}/${MIN_PLAYERS} minimum\n` +
      `Begin: \`${g.prefix} mm start\``,
      { contextInfo: { mentionedJid: g.players.map((p) => p.jid) } });
  }
  const lines = g.players.map((p) =>
    `  ${p.alive ? '🤍' : '☠️'} ${nameOf(p)} — ${p.char.name}${p.alive ? '' : ' (dead)'}`).join('\n');
  return sendGroup(sock, chatId,
    `${botMarker}📜 *THE GUESTS — ${cases.MANOR_NAME}*\n\n${lines}\n\n` +
    `${alivePlayers(g).length} alive · Night ${g.night} · phase: ${g.phase}`);
}

async function startGame(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ Begin the mystery from the group where the manor stands.`);
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.LOBBY) return sendGroup(sock, chatId, `${botMarker}🕯️ No lobby is open right now.`);
  if (normJid(senderJid) !== g.host) return sendGroup(sock, chatId, `${botMarker}🕯️ Only the host may begin — @${g.host} holds the keys.`, { contextInfo: { mentionedJid: [g.players.find((p) => normJid(p.jid) === g.host)?.jid || g.host] } });
  if (g.players.length < MIN_PLAYERS) return sendGroup(sock, chatId, `${botMarker}🕯️ Too few guests. The manor requires at least *${MIN_PLAYERS}*.`);
  if (g.players.length > MAX_PLAYERS) return sendGroup(sock, chatId, `${botMarker}🕯️ Too many guests. The manor sleeps at most *${MAX_PLAYERS}*.`);

  // lock lobby, assign characters + secret roles
  const cast = characters.drawCast(g.players.length);
  const order = characters.shuffle(g.players.map((_, i) => i));
  const killerIdx = order[0];
  const investIdx = order[1];
  const guardianIdx = g.players.length >= 5 ? order[2] : -1; // Guardian Angel joins at 5+
  g.players.forEach((p, i) => {
    p.char = cast[i];
    p.role = i === killerIdx ? 'KILLER' : i === investIdx ? 'INVESTIGATOR' : i === guardianIdx ? 'GUARDIAN' : 'CIVILIAN';
    p.alive = true;
  });
  g.phase = 'STARTING';
  persistGames();
  console.log(`🔪 [MurderMystery] game started in ${chatId} — ${g.players.length} players (roles dealt)`);

  await sendGroup(sock, chatId, `${botMarker}🕯️ The doors are locked. Character envelopes are being sealed and delivered to every guest's DM…`);

  // mandatory private role cards — paced to respect the flood gods
  for (const p of g.players) {
    let sent = false;
    try {
      const buf = await cards.renderRoleCard({
        character: p.char,
        playerName: nameOf(p),
        role: p.role,
        manorName: cases.MANOR_NAME,
      });
      if (buf) {
        const cap = roleCardCaption(p.role, g.prefix);
        sent = await sendDMImage(sock, p.jid, buf, cap);
      }
    } catch (e) { /* fall through to text */ }
    if (!sent) {
      await sendDM(sock, p.jid, textRoleCard(p, g));
    }
    await sleep(DM_SEND_DELAY_MS);
  }

  // group introduction card
  try {
    const buf = await cards.renderIntro({
      playerCount: g.players.length,
      manorName: cases.MANOR_NAME,
      openingLine: cases.pick(cases.OPENING_LINES),
      nightLine: 'When night falls, so does the knife.',
    });
    if (buf) await sendGroupImage(sock, chatId, buf,
      `🕯️ ${g.players.length} guests. One killer. One detective.${g.players.length >= 5 ? ' One guardian.' : ''}\nRole cards are in your DMs — read them. Tell no one.`);
    else throw new Error('intro render null');
  } catch (e) {
    await sendGroup(sock, chatId,
      `${botMarker}🔪 *THE MYSTERY BEGINS*\n\nEveryone has arrived at ${cases.MANOR_NAME}.\nOne of you is hiding a deadly secret.\n\n` +
      `Role cards: check your DMs. Do not reveal yours.`);
  }

  await sleep(2500);
  return beginNight(sock, chatId);
}

function roleCardCaption(role, prefix) {
  if (role === 'KILLER') {
    return `🔪 You are THE KILLER.\nEach night, choose a guest to eliminate — then choose the room where the body lies.\nYour identity is secret — even from the dead.\n(At night, in this chat: \`${prefix} mm kill <n>\`, then \`${prefix} mm room <n>\`.)`;
  }
  if (role === 'INVESTIGATOR') {
    return `🕵️ You are THE INVESTIGATOR.\nEach night you may study one guest.\nThe result arrives here, by candlelight.\n(At night, in this chat: \`${prefix} mm investigate <n>\`.)`;
  }
  if (role === 'GUARDIAN') {
    return `👼 You are THE GUARDIAN.\nEach night you may watch over one guest — or yourself. If the knife comes for them, it will be turned away, and no one will know why.\n(At night, in this chat: \`${prefix} mm protect <n|me>\`.)`;
  }
  return `👤 You are a CIVILIAN.\nYou have no special ability — only your wits.\nDiscuss. Search. Accuse. Vote. Survive.`;
}

function textRoleCard(p, g) {
  const head = `${cases.MANOR_NAME}\n\n${nameOf(p).toUpperCase()}, you play ${p.char.name}, ${p.char.title}.\n\n`;
  if (p.role === 'KILLER') {
    return `🔪 *${head}*YOU ARE THE KILLER.*\nEliminate the guests night after night — and choose where each body lies. Survive the discussion. Dodge the vote.\n\nYour identity is secret. Tell no one.`;
  }
  if (p.role === 'INVESTIGATOR') {
    return `🕵️ *${head}*YOU ARE THE INVESTIGATOR.*\nEach night you may investigate one living guest. The result is yours alone.\n\nKeep it secret. Spend it wisely.`;
  }
  if (p.role === 'GUARDIAN') {
    return `👼 *${head}*YOU ARE THE GUARDIAN.*\nEach night, watch over one guest — or yourself. If the killer comes for them, you turn the knife away. Nobody will know.\n\nStay secret. Stay watchful.`;
  }
  return `👤 *${head}*YOU ARE A CIVILIAN.*\nYou have no special ability.\nFind the killer through discussion, searching and voting.`;
}

// ---------- NIGHT ----------
async function beginNight(sock, chatId) {
  const g = getGame(chatId);
  if (!g) return;
  const nextNight = g.night + 1;
  if (!beginTransition(g, `night${nextNight}`)) return; // same-round double-fire guard
  noteSock(g, sock);
  g.phase = PHASE.NIGHT;
  g.night = nextNight;
  g.killerTargetJid = null;
  g.killerRoomIdx = null;
  g.protectTargetJid = null;
  g.investTargetJid = null;
  g.votes = {};
  g.extendedTonight = false;
  g.deadline = Date.now() + NIGHT_MS;
  g._resolving = false;
  g._resolving2 = false;
  persistGames();
  schedulePhaseTimer(chatId);
  scheduleNudge(chatId);
  ensureWatchdog();
  console.log(`🔪 [MurderMystery] NIGHT ${g.night} begins in ${chatId}`);

  const line = cases.pick(cases.NIGHT_LINES);

  // group night card
  try {
    const buf = await cards.renderNightCard({ night: g.night, line, manorName: cases.MANOR_NAME });
    if (buf) await sendGroupImage(sock, chatId, buf, `🌙 Night ${g.night} falls over the manor. Check your DMs.`);
    else throw new Error('night render null');
  } catch (e) {
    await sendGroup(sock, chatId, `🌙 *NIGHT ${g.night}* falls over ${cases.MANOR_NAME}.\n_${line}_\nCheck your DMs.`);
  }

  // private night instructions — priority actors first, so their window is as long as possible
  for (const p of alivePlayers(g)) {
    if (p.role === 'KILLER') {
      const roster = rosterLines(g, p.jid).join('\n');
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\nYou are the *KILLER*.\nChoose tonight's victim:\n\n${roster}\n\n` +
        `\`${g.prefix} mm kill <number>\` — or a name.\nAfter the kill you will choose the room where the body lies.\n⏱️ The night lasts *3 minutes*.`);
    } else if (p.role === 'INVESTIGATOR') {
      const roster = rosterLines(g, p.jid).join('\n');
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\nYou are the *INVESTIGATOR*.\nChoose someone to investigate:\n\n${roster}\n\n` +
        `\`${g.prefix} mm investigate <number>\` — or a name.\nYou cannot investigate yourself.\nThe result will find you here, by candlelight.\n⏱️ The night lasts *3 minutes* — do not let dawn take your chance.`);
    } else if (p.role === 'GUARDIAN') {
      const roster = rosterLines(g, null, p.jid).join('\n');
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\nYou are the *GUARDIAN*.\nChoose one guest to watch over — or yourself:\n\n${roster}\n\n` +
        `\`${g.prefix} mm protect <number|me>\`\nIf the knife comes for them tonight, it will be turned away.\n⏱️ The night lasts *3 minutes*.`);
    } else {
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\nYou have no action tonight.\nLock your door. Wait for morning.`);
    }
    await sleep(400);
  }
}

// ---------- killer: choose victim, then the room ----------
async function submitKill(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  // night actions belong in DMs — a group typing of this would out the sender
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  const phaseOk = g && g.phase === PHASE.NIGHT;
  console.log(`🔪 [MurderMystery] mm kill try jid=${normJid(senderJid)} hasGame=${!!g} phase=${g ? g.phase : '-'} accepted=${phaseOk ? 'pending' : 'no'}`);
  if (!phaseOk) return sendGroup(sock, chatId, `${botMarker}🌙 There is no open night to act in.${g && (g.phase === PHASE.DISCUSSION || g.phase === PHASE.VOTING) ? ' Dawn already broke — your chance will return with the next night (3 minutes long).' : ''}`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🌙 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🌙 The dead do not kill. Rest.`);
  if (me.role !== 'KILLER') return sendGroup(sock, chatId, `${botMarker}🌙 Only the killer acts on the night. And you are — presumably — not them.`);
  if (g.killerTargetJid) return sendGroup(sock, chatId, `${botMarker}🌙 The knife has already been chosen tonight. Now choose the room: \`${g.prefix} mm room <number>\`.`);

  const target = resolveRosterTarget(g, rawTarget, senderJid);
  if (!target) {
    const roster = rosterLines(g, senderJid).join('\n');
    return sendGroup(sock, chatId, `${botMarker}🌙 Choose a *living* guest who is not you:\n\n${roster}\n\n\`${g.prefix} mm kill <number>\``);
  }

  g.killerTargetJid = target.jid;
  persistGames();
  await sendGroup(sock, chatId, `${botMarker}🌙 The knife is raised. Now choose where *${nameOf(target)}* will be found…`);

  // room choice — the strategic half of the kill
  let sent = false;
  try {
    const buf = await cards.renderRoomChoiceCard({
      rooms: g.rooms,
      victimName: nameOf(target),
      night: g.night,
      manorName: cases.MANOR_NAME,
    });
    if (buf) sent = await sendDMImage(sock, senderJid, buf,
      `🔪 *${nameOf(target)}* will not see dawn — if you finish the deed.\n\nChoose the room where the body lies:\n\n${roomListOf(g)}\n\n\`${g.prefix} mm room <number>\` — the room changes what the searching finds, and how sharp the ghost's clue is.`);
  } catch (e) { /* text fallback */ }
  if (!sent) {
    await sendDM(sock, senderJid,
      `🔪 *${nameOf(target)}* will not see dawn — if you finish the deed.\n\nChoose the room where the body lies:\n\n${roomListOf(g)}\n\n\`${g.prefix} mm room <number>\``);
  }
  maybeResolveNight(sock || getSockSafe(), gameChatIdOf(g));
}

async function submitRoom(ctx, raw) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  console.log(`🔪 [MurderMystery] mm room try jid=${normJid(senderJid)} hasGame=${!!g} phase=${g ? g.phase : '-'}`);
  if (!g || g.phase !== PHASE.NIGHT) return sendGroup(sock, chatId, `${botMarker}🌙 There is no open night to choose a room in.`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🌙 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🌙 The dead hide no bodies. Rest.`);
  if (me.role !== 'KILLER') return sendGroup(sock, chatId, `${botMarker}🌙 You have no body to hide.`);
  if (!g.killerTargetJid) return sendGroup(sock, chatId, `${botMarker}🌙 Choose your victim first: \`${g.prefix} mm kill <number>\`.`);
  if (g.killerRoomIdx != null) return sendGroup(sock, chatId, `${botMarker}🌙 The body is already placed. Sleep now — dawn is coming.`);

  const hit = resolveRoom(g, raw);
  if (!hit) {
    return sendGroup(sock, chatId, `${botMarker}🌙 Choose a room:\n\n${roomListOf(g)}\n\n\`${g.prefix} mm room <number>\``);
  }
  g.killerRoomIdx = hit.idx;
  persistGames();
  await sendGroup(sock, chatId, `${botMarker}🌙 The body lies in *${hit.room.name}*. Now… sleep.`);
  console.log(`🔪 [MurderMystery] killer placed body room=${hit.room.id}`);
  maybeResolveNight(sock || getSockSafe(), gameChatIdOf(g));
}

async function submitInvestigate(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  const phaseOk = g && g.phase === PHASE.NIGHT;
  console.log(`🔪 [MurderMystery] mm investigate try jid=${normJid(senderJid)} hasGame=${!!g} phase=${g ? g.phase : '-'} accepted=${!!phaseOk}`);
  if (!phaseOk) return sendGroup(sock, chatId, `${botMarker}🌙 There is no open night to act in.${g && (g.phase === PHASE.DISCUSSION || g.phase === PHASE.VOTING) ? ' Dawn already broke — your next chance comes with the next night (3 minutes long). Act early.' : ''}`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🌙 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🌙 The dead investigate nothing. Rest.`);
  if (me.role !== 'INVESTIGATOR') return sendGroup(sock, chatId, `${botMarker}🌙 You have no badge, no candle, and no right to snoop.`);
  if (g.investTargetJid) return sendGroup(sock, chatId, `${botMarker}🌙 You have already spent tonight's investigation.`);

  const target = resolveRosterTarget(g, rawTarget, senderJid);
  if (!target) {
    const roster = rosterLines(g, senderJid).join('\n');
    return sendGroup(sock, chatId, `${botMarker}🌙 Choose a *living* guest who is not you:\n\n${roster}\n\n\`${g.prefix} mm investigate <number>\``);
  }

  g.investTargetJid = target.jid;
  g.investResults.push({ night: g.night, subject: nameOf(target), subjectJid: target.jid, verdict: target.role === 'KILLER' ? 'KILLER' : 'CLEAN' });
  persistGames();
  console.log(`🔪 [MurderMystery] investigate accepted night=${g.night} subject=${normJid(target.jid)} verdict=${target.role === 'KILLER' ? 'KILLER' : 'CLEAN'}`);

  // private result, delivered immediately
  const isKiller = target.role === 'KILLER';
  const flavor = cases.pick(isKiller ? cases.INVEST_GUILTY : cases.INVEST_CLEAN);
  let sent = false;
  try {
    const buf = await cards.renderInvestigationCard({
      subjectChar: target.char,
      subjectName: nameOf(target),
      isKiller,
      flavor,
      night: g.night,
      manorName: cases.MANOR_NAME,
    });
    if (buf) {
      sent = await sendDMImage(sock, senderJid, buf,
        `🕵️ *INVESTIGATION RESULT — NIGHT ${g.night}*\n\nYou studied: *${nameOf(target)}*\n\n${isKiller ? '🔴 *THE KILLER.*' : '🟢 *NOT THE KILLER.*'}\n\nKeep this information secret.`);
    }
  } catch (e) { /* text fallback */ }
  if (!sent) {
    await sendDM(sock, senderJid,
      `🕵️ *INVESTIGATION RESULT — NIGHT ${g.night}*\n\nYou investigated:\n*${nameOf(target)}* (${target.char.name})\n\n` +
      `${isKiller ? '🔴 *THE KILLER*' : '🟢 *NOT THE KILLER*'}\n\n_${flavor}_\n\nKeep this information secret.`);
  }
  maybeResolveNight(sock || getSockSafe(), gameChatIdOf(g));
}

// ---------- guardian: night protection ----------
async function submitProtect(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  const phaseOk = g && g.phase === PHASE.NIGHT;
  console.log(`🔪 [MurderMystery] mm protect try jid=${normJid(senderJid)} hasGame=${!!g} phase=${g ? g.phase : '-'} accepted=${!!phaseOk}`);
  if (!phaseOk) return sendGroup(sock, chatId, `${botMarker}🌙 There is no open night to stand watch in.`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🌙 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🌙 Even guardians rest when they die.`);
  if (me.role !== 'GUARDIAN') return sendGroup(sock, chatId, `${botMarker}🌙 You have no watch to keep. You are not the Guardian.`);
  if (g.protectTargetJid) return sendGroup(sock, chatId, `${botMarker}🌙 Your watch is already set for tonight. Sleep.`);

  const target = resolveRosterTarget(g, rawTarget, null, senderJid); // guardian may pick themselves
  if (!target) {
    const roster = rosterLines(g, null, senderJid).join('\n');
    return sendGroup(sock, chatId, `${botMarker}🌙 Choose one guest — or yourself:\n\n${roster}\n\n\`${g.prefix} mm protect <number|me>\``);
  }
  if (!target.alive) return sendGroup(sock, chatId, `${botMarker}🌙 The dead need no watching.`);

  g.protectTargetJid = target.jid;
  persistGames();
  const isSelf = normJid(target.jid) === normJid(senderJid);
  console.log(`🔪 [MurderMystery] protect accepted night=${g.night} target=${normJid(target.jid)} self=${isSelf}`);
  await sendGroup(sock, chatId,
    `${botMarker}👼 Your watch is set${isSelf ? ' over yourself' : ` over *${nameOf(target)}*`}. If the knife comes tonight, it will find you standing in the way.\n\nNow… sleep.`);
  maybeResolveNight(sock || getSockSafe(), gameChatIdOf(g));
}

// resolve as soon as the killer (victim + room) and investigator have acted — never depends on submission order
function maybeResolveNight(sock, chatId) {
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.NIGHT || g._resolving) return;
  const killerDone = !!g.killerTargetJid && g.killerRoomIdx != null;
  const investDone = !!g.investTargetJid || !livingInvestigator(g);
  if (killerDone && investDone) {
    g._resolving = true;
    g._resolvingAt = Date.now();
    setTimeout(() => resolveNight(sock, chatId, 'both actions were in'), 2600);
  }
}

async function resolveNight(sock, chatId, _reason) {
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.NIGHT || g._resolving2) return;
  if (!beginTransition(g, `resolveNight${g.night}`)) return;
  g._resolving2 = true;
  g._resolving2At = Date.now();
  clearTimers(chatId);
  noteSock(g, sock);
  console.log(`🔪 [MurderMystery] resolving NIGHT ${g.night} in ${chatId}`);

  const victim = g.killerTargetJid ? getPlayer(g, g.killerTargetJid) : null;
  const guardian = livingGuardian(g);
  const protectedJid = g.protectTargetJid;
  const watchedJid = protectedJid && guardian ? normJid(protectedJid) : null;
  const saved = !!(victim && victim.alive && watchedJid && watchedJid === normJid(g.killerTargetJid));

  let outcome = 'quiet';
  let morningLine = cases.pick(cases.MORNING_QUIET_LINES);

  if (victim && victim.alive && saved) {
    // ---- the guardian turns the knife ----
    outcome = 'saved';
    morningLine = cases.pick(cases.MORNING_SAVED_LINES);
    g.log.push({ night: g.night, saved: nameOf(victim) });
    console.log(`🔪 [MurderMystery] NIGHT ${g.night}: kill on ${normJid(victim.jid)} BLOCKED by guardian`);
    persistGames();

    // private DMs: guardian, saved player, killer
    await sleep(800);
    await sendDM(sock, guardian.jid, `👼 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\n${cases.GA_SAVE_GA.replace('{name}', nameOf(victim))}`);
    try {
      const buf = await cards.renderGuardianSavedCard({
        savedName: nameOf(victim),
        dreamLine: cases.pick(cases.GA_SAVED_DREAM),
        night: g.night,
        manorName: cases.MANOR_NAME,
      });
      if (buf) await sendDMImage(sock, victim.jid, buf, `👼 You should have died tonight.`);
      else throw new Error('saved render null');
    } catch (e) {
      await sendDM(sock, victim.jid, `👼 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\n${cases.pick(cases.GA_SAVED_DREAM)}`);
    }
    const killerP = g.players.find((p) => p.role === 'KILLER');
    if (killerP) await sendDM(sock, killerP.jid, `🔪 *NIGHT ${g.night}*\n\n${cases.pick(cases.GA_KILLER_BLOCKED)}`);
  } else if (victim && victim.alive) {
    // ---- the murder succeeds ----
    outcome = 'murder';
    morningLine = cases.pick(cases.MORNING_MURDER_LINES);
    const method = cases.pick(cases.METHODS);
    const hour = 1 + Math.floor(Math.random() * 4);
    const roomIdx = g.killerRoomIdx != null ? g.killerRoomIdx : Math.floor(Math.random() * (g.rooms || []).length);
    victim.alive = false;
    victim.deathNight = g.night;
    victim.deathMethod = method.title;
    g.bodies.push({
      victimJid: victim.jid,
      victimName: nameOf(victim),
      roomIdx,
      method,
      hour,
      night: g.night,
      found: false,
      finderJid: null,
    });
    g.log.push({ night: g.night, victim: nameOf(victim), method: method.title, room: (g.rooms[roomIdx] || {}).name || 'the manor' });
    silence(chatId, victim.jid);
    persistGames();
    console.log(`🔪 [MurderMystery] NIGHT ${g.night}: ${normJid(victim.jid)} murdered, body in room idx=${roomIdx}`);

    // the dead learn of their state in private — the house does not know yet
    await sleep(800);
    try {
      const buf = await cards.renderVictimDMCard({
        victimChar: victim.char,
        victimName: nameOf(victim),
        room: g.rooms[roomIdx] || { name: 'the manor', id: 'manor' },
        method,
        night: g.night,
        manorName: cases.MANOR_NAME,
      });
      if (buf) await sendDMImage(sock, victim.jid, buf, `☠️ You were murdered in the night. The house does not know yet.`);
      else throw new Error('victim render null');
    } catch (e) {
      await sendDM(sock, victim.jid, `☠️ *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\nYou were murdered in the night — ${method.title}, in ${g.rooms[roomIdx] ? g.rooms[roomIdx].name : 'the manor'}.\n\nThe house does not know yet. Your voice is lost to the living. You watch now.`);
    }

    // killer may have just reached parity
    const w = checkWin(g);
    if (w) return declareWinner(sock, chatId, w);
  } else if (watchedJid) {
    // the guardian kept a watch but the knife never came for their ward
    const ward = getPlayer(g, watchedJid);
    await sleep(600);
    await sendDM(sock, guardian.jid, `👼 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\nYour watch held${ward ? ` over ${nameOf(ward)}` : ''}, and the knife never came. Stand again tomorrow, if you dare.`);
  }

  // ---- public morning card (never names the victim — the body must be found) ----
  await sleep(1200);
  try {
    const buf = await cards.renderMorningCard({
      night: g.night,
      outcome,
      line: morningLine,
      rooms: g.rooms,
      manorName: cases.MANOR_NAME,
    });
    if (buf) {
      await sendGroupImage(sock, chatId, buf,
        `☀️ *DAWN — NIGHT ${g.night}*\n\n${outcome === 'murder' ? 'A murder was committed in the night. The body has *not* been found.' : outcome === 'saved' ? 'Someone almost died last night. No one did.' : 'No one died last night.'}\n\n` +
        `🔍 Every living guest may search *one* room before the vote: \`${g.prefix} mm search <number|room>\` — in the group or in your DMs.`);
    } else throw new Error('morning render null');
  } catch (e) {
    await sendGroup(sock, chatId,
      `☀️ *DAWN — NIGHT ${g.night}*\n\n${morningLine}\n\n` +
      `${outcome === 'murder' ? 'A murder was committed in the night. The body has *not* been found.' : outcome === 'saved' ? 'Someone almost died last night. No one did.' : 'No one died last night.'}\n\n` +
      `The rooms of the manor:\n${roomListOf(g)}\n\n🔍 Every living guest may search *one* room: \`${g.prefix} mm search <number|room>\`.`);
  }

  return beginDiscussion(sock, chatId);
}

// ---------- DISCUSSION + SEARCH ----------
async function beginDiscussion(sock, chatId) {
  const g = getGame(chatId);
  if (!g) return;
  if (!beginTransition(g, `discussion${g.night}`)) return; // same-round double-fire guard
  noteSock(g, sock);
  g.phase = PHASE.DISCUSSION;
  g.deadline = Date.now() + DISCUSS_MS;
  g.searches = { night: g.night, used: {} };
  g._resolving = false;
  g._resolving2 = false;
  persistGames();
  schedulePhaseTimer(chatId);
  scheduleReminder(chatId, DISCUSS_REMIND_MS, 'discussion');
  ensureWatchdog();
  console.log(`🔪 [MurderMystery] DISCUSSION begins (night ${g.night}) in ${chatId}`);

  const prompt = cases.pick(cases.DISCUSSION_PROMPTS);
  const unfound = g.bodies.filter((b) => !b.found);
  const bodyNote = unfound.length
    ? `⚠️ ${unfound.length === 1 ? 'A body lies unfound' : `${unfound.length} bodies lie unfound`} in the manor.\n`
    : '';
  // critical: this is the message players act on — retry with the fallback sock if it fails
  await sendGroupCritical(g, chatId,
    `🗣️ *DISCUSSION*\n\n${prompt}\n\n` +
    `${bodyNote}` +
    `🔍 Each living guest may search *one* room before the vote: \`${g.prefix} mm search <number|room>\` — searches are public, the ghost's clue is not.\n` +
    `The vote begins when the clock runs out.\n⏱️ *5 minutes* remaining.\n\n` +
    `_Live status: \`${g.prefix} mm status\`_`);
}

async function submitSearch(ctx, raw) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  // searches are PUBLIC now (user ask: everyone sees which room you search) —
  // they can be made from the group or from a DM, the card always lands in the GC
  const g = ctx.isGroup ? getGame(chatId) : findGameForPlayer(senderJid);
  const searchChatId = ctx.isGroup ? chatId : gameChatIdOf(g) || chatId;
  if (g) noteSock(g, sock);
  if (!g || g.phase !== PHASE.DISCUSSION) {
    return sendGroup(sock, chatId, `${botMarker}🔍 There is nothing to search right now. Searches happen during the discussion.`);
  }
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🔍 You are not on the guest list.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🔍 The dead search nothing. They only watch.`);
  const round = g.searches && g.searches.night === g.night ? g.searches : { night: g.night, used: {} };
  const n = normJid(senderJid);
  if (round.used[n] != null) {
    const where = g.rooms[round.used[n]];
    return sendGroup(sock, chatId, `${botMarker}🔍 You have already made your one search${where ? ` (in ${where.name})` : ''} today. The next chance comes with the next body.`);
  }

  const hit = resolveRoom(g, raw);
  if (!hit) {
    return sendGroup(sock, chatId, `${botMarker}🔍 Choose a room to search:\n\n${roomListOf(g)}\n\n\`${g.prefix} mm search <number|room>\``);
  }

  round.used[n] = hit.idx;
  g.searches = round;
  persistGames();
  console.log(`🔪 [MurderMystery] search night=${g.night} by=${n} room=${hit.room.id}`);

  const body = g.bodies.find((b) => !b.found && b.roomIdx === hit.idx);
  const found = !!body;

  // ---- public search card to the GC — who searched which room, and what they found ----
  let searchCardOk = false;
  try {
    const buf = await cards.renderSearchCard({
      playerChar: me.char,
      playerName: nameOf(me),
      room: hit.room,
      found,
      flavor: found ? null : cases.pick(cases.SEARCH_NOTHING_LINES),
      night: g.night,
      manorName: cases.MANOR_NAME,
    });
    if (buf) {
      searchCardOk = true;
      await sendGroupImage(sock, searchChatId, buf,
        found
          ? `🔍 ${nameOf(me)} searches ${hit.room.name}…`
          : `🔍 ${nameOf(me)} searches ${hit.room.name}… and finds nothing.`);
    }
  } catch (e) { /* text fallback */ }
  if (!searchCardOk && !found) {
    await sendGroup(sock, searchChatId, `${botMarker}🔍 ${nameOf(me)} searches ${hit.room.name} — and finds nothing.`);
  }

  if (found) {
    // ---- discovery: public body card + private ghost clue ----
    body.found = true;
    body.finderJid = senderJid;
    const victim = getPlayer(g, body.victimJid) || { char: characters.getCharacter('butler2'), name: body.victimName };

    // progressive, predetermined clue about the KILLER's character — never random
    const killerChar = (livingKiller(g) || g.players.find((p) => p.role === 'KILLER') || {}).char;
    let tier = g.cluesGiven + (hit.room.conceal >= 3 ? 1 : 0);
    let clue = characters.clueFor(killerChar ? killerChar.id : null, tier);
    let exhausted = false;
    if (!clue) { clue = cases.pick(cases.GHOST_EXHAUSTED_LINES); exhausted = true; }
    else g.cluesGiven += 1;
    persistGames();
    console.log(`🔪 [MurderMystery] body found night=${g.night} victim=${normJid(body.victimJid)} finder=${n} clueTier=${exhausted ? 'x' : tier}`);

    await sleep(500);
    let cardOk = false;
    try {
      const buf = await cards.renderBodyFoundCard({
        victimChar: victim.char,
        victimName: body.victimName,
        room: hit.room,
        finderName: nameOf(me),
        method: body.method,
        hour: body.hour,
        night: body.night,
        manorName: cases.MANOR_NAME,
      });
      if (buf) {
        cardOk = true;
        await sendGroupImage(sock, searchChatId, buf,
          `☠️ *${body.victimName} has been found dead in ${hit.room.name}* — found by *${nameOf(me)}*.\n\nThe ghost whispers to ${nameOf(me)} alone. Discuss — but wonder what they keep to themselves.`);
      }
    } catch (e) { /* text fallback */ }
    if (!cardOk) {
      await sendGroup(sock, searchChatId,
        `☠️ *A BODY IS FOUND — ${hit.room.name.toUpperCase()}*\n\n*${body.victimName} is dead* — ${body.method.title}.\nFound by *${nameOf(me)}*.\n\nThe ghost whispers to ${nameOf(me)} alone.`);
    }

    // the victim's last words are on the body — read aloud (new: wills)
    if (victim.will) {
      await sleep(900);
      await postWillCard(sock, searchChatId, victim, 'body');
    }

    // the finder's private clue
    let clueOk = false;
    try {
      const buf = await cards.renderGhostClueCard({
        clue,
        tier: Math.min(tier, 3),
        victimName: body.victimName,
        room: hit.room,
        night: body.night,
        manorName: cases.MANOR_NAME,
      });
      if (buf) {
        clueOk = true;
        await sendDMImage(sock, senderJid, buf, `👻 *THE GHOST WHISPERS — CLUE*\n\n_${clue}_\n\nYou alone hold this. Reveal it, twist it, or keep it.`);
      }
    } catch (e) { /* text fallback */ }
    if (!clueOk) {
      await sendDM(sock, senderJid, `👻 *THE GHOST WHISPERS*\n\n_${clue}_\n\n_${exhausted ? '' : `Clue tier ${tier + 1} — the deeper the hiding place, the sharper the memory._`}\nYou alone hold this. Reveal it, twist it, or keep it.`);
    }
    return;
  }
}

// post a dead player's last words to the group (card with text fallback)
async function postWillCard(sock, chatId, player, cause) {
  try {
    const buf = await cards.renderWillCard({
      playerChar: player.char,
      playerName: nameOf(player),
      will: player.will,
      cause,
      night: player.deathNight,
      manorName: cases.MANOR_NAME,
    });
    if (buf) {
      await sendGroupImage(sock, chatId, buf,
        `📜 *Last words of ${nameOf(player)}:*\n_${player.will}_`);
      return;
    }
  } catch (e) { /* text fallback */ }
  await sendGroup(sock, chatId, `📜 *Last words of ${nameOf(player)}:*\n_${player.will}_`);
}

// ---------- KILLER TAUNT (anonymous, once per game) ----------
function sanitizePlayerText(raw, maxLen) {
  return String(raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[`*_~]/g, '')
    .trim()
    .slice(0, maxLen);
}

async function submitTaunt(ctx, raw) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  if (!g || (g.phase !== PHASE.DISCUSSION && g.phase !== PHASE.VOTING)) {
    return sendGroup(sock, chatId, `${botMarker}🖤 The house only hears taunts between dawn and the count.`);
  }
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🖤 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🖤 The dead keep their silence now.`);
  if (me.role !== 'KILLER') return sendGroup(sock, chatId, `${botMarker}🖤 The manor accepts only one kind of taunt — and it is not yours to give.`);
  if (g.tauntUsed) return sendGroup(sock, chatId, `${botMarker}🖤 The house has heard enough from the dark. One note per game.`);
  const text = sanitizePlayerText(raw, TAUNT_MAX_LEN);
  if (!text) {
    return sendGroup(sock, chatId, `${botMarker}🖤 Whisper something first: \`${g.prefix} mm taunt <message>\` — unsigned, once per game.`);
  }
  g.tauntUsed = true;
  persistGames();
  console.log(`🔪 [MurderMystery] killer taunt posted night=${g.night} (${text.length} chars)`);
  // anonymous — posted to the GROUP, never a name
  let cardOk = false;
  try {
    const buf = await cards.renderTauntCard({ text, night: g.night, manorName: cases.MANOR_NAME });
    if (buf) {
      cardOk = true;
      await sendGroupImage(sock, g.chatId, buf, `🖤 An unsigned note circulates the room. Read it twice.`);
    }
  } catch (e) { /* text fallback */ }
  if (!cardOk) {
    await sendGroup(sock, g.chatId, `🖤 *An unsigned note circulates the room:*\n\n_"${text}"_\n\nIt is signed by no one. Read it twice.`);
  }
  await sendDM(sock, senderJid, `🖤 Your note is loose in the house. They will never prove whose hand wrote it.`);
}

// ---------- LAST WORDS (will) ----------
async function submitWill(ctx, raw) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  if (!g) return sendGroup(sock, chatId, `${botMarker}📜 You are not part of any mystery.`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}📜 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}📜 The dead had their chance to write. Rest.`);
  const text = sanitizePlayerText(raw, WILL_MAX_LEN);
  if (!text) {
    return sendGroup(sock, chatId,
      me.will
        ? `📜 Your will currently reads:\n_"${me.will}"_\n\nRewrite it: \`${g.prefix} mm will <text>\``
        : `📜 Write your last words: \`${g.prefix} mm will <text>\`\nIf you die, the house reads them aloud.`);
  }
  me.will = text;
  persistGames();
  await sendGroup(sock, chatId,
    `📜 Your last words are sealed:\n_"${text}"_\n\nIf you die, the house will read them aloud. Rewrite anytime: \`${g.prefix} mm will <text>\``);
}

// ---------- VOTING ----------
async function beginVoting(sock, chatId) {
  const g = getGame(chatId);
  if (!g) return;
  const w = checkWin(g);
  if (w) return declareWinner(sock, chatId, w);
  if (!beginTransition(g, `voting${g.night}`)) return; // same-round double-fire guard
  noteSock(g, sock);
  g.phase = PHASE.VOTING;
  g.votes = {};
  g.deadline = Date.now() + VOTE_MS;
  g._resolving = false;
  g._resolving2 = false;
  persistGames();
  schedulePhaseTimer(chatId);
  scheduleReminder(chatId, VOTE_REMIND_MS, 'vote');
  ensureWatchdog();
  console.log(`🔪 [MurderMystery] VOTING begins (${alivePlayers(g).length} alive) in ${chatId}`);

  const alive = alivePlayers(g);
  const roster = alive.map((p, i) => `  ${i + 1}. ${nameOf(p)}`).join('\n');
  // critical: this is the message the user said never arrived — retry with fallback sock
  await sendGroupCritical(g, chatId,
    `⚖️ *VOTING*\n\nWho do you believe is the Killer?\n\n${roster}\n\n` +
    `Cast your vote: \`${g.prefix} mm vote <number>\` — or a name — or \`skip\`.\n` +
    `Living players only. One ballot each. You may change it until the count. Ballots are public.\n⏱️ *90 seconds.*`);
}

async function castVote(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) {
    // voting is public — but a DM vote can still count if they're in exactly one game
    const gd = findGameForPlayer(senderJid);
    if (gd) noteSock(gd, sock);
    if (!gd) return sendGroup(sock, chatId, `${botMarker}⚖️ No ballot is open for you. Votes are cast in the group.`);
    return castVoteInGame({ ...ctx, sock, chatId: gd.chatId }, gd, rawTarget);
  }
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.VOTING) return sendGroup(sock, chatId, `${botMarker}⚖️ No ballot is open. Wait for the vote.`);
  return castVoteInGame(ctx, g, rawTarget);
}

async function castVoteInGame(ctx, g, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}⚖️ You are not on the guest list.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}⚖️ The dead do not vote. They only watch.`);
  const q = String(rawTarget || '').trim().toLowerCase();
  let choice;
  if (q === 'skip' || q === 'abstain' || q === 'no one' || q === 'nobody') {
    choice = 'skip';
  } else {
    // NOTE: votes resolve against the FULL printed roster (self included) so the
    // numbers in the public vote prompt mean the same guest for every voter.
    const target = resolveRosterTarget(g, rawTarget, null);
    if (!target) return sendGroup(sock, chatId, `${botMarker}⚖️ That is not a living guest. Use \`${g.prefix} mm vote <number>\`, a name, or \`skip\`.`);
    choice = target.jid;
  }
  const already = Object.prototype.hasOwnProperty.call(g.votes, normJid(senderJid));
  g.votes[normJid(senderJid)] = choice;
  persistGames();

  const aliveCount = alivePlayers(g).length;
  const castCount = Object.keys(g.votes).length;
  if (!already && choice !== 'skip') {
    await sendGroup(sock, chatId, `${botMarker}⚖️ @${normJid(senderJid)} casts a ballot. (${castCount}/${aliveCount} in)`, { contextInfo: { mentionedJid: [senderJid] } });
  } else if (!already) {
    await sendGroup(sock, chatId, `${botMarker}⚖️ ${nameOf(me)} abstains. (${castCount}/${aliveCount} in)`);
  }
  if (castCount >= aliveCount) {
    g._resolving = true;
    g._resolvingAt = Date.now();
    console.log(`🔪 [MurderMystery] every ballot is in (${castCount}/${aliveCount}) in ${chatId} — resolving`);
    setTimeout(() => resolveVote(sock, chatId, 'every ballot was in'), 1500);
  }
}

async function resolveVote(sock, chatId, _reason) {
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.VOTING || g._resolving2) return;
  if (!beginTransition(g, `resolveVote${g.night}`)) return;
  g._resolving2 = true;
  g._resolving2At = Date.now();
  clearTimers(chatId);
  noteSock(g, sock);
  console.log(`🔪 [MurderMystery] resolving vote in ${chatId} (${Object.keys(g.votes || {}).length} ballots)`);

  const alive = alivePlayers(g);
  // tally
  const tallyMap = new Map();
  let skipVotes = 0;
  for (const choice of Object.values(g.votes)) {
    if (choice === 'skip') { skipVotes++; continue; }
    const p = getPlayer(g, choice);
    if (!p || !p.alive) continue;
    tallyMap.set(choice, (tallyMap.get(choice) || 0) + 1);
  }
  const tally = [...tallyMap.entries()]
    .map(([jid, votes]) => ({ jid, name: nameOf(getPlayer(g, jid)), charId: getPlayer(g, jid).char.id, votes }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  const top = tally[0];
  const runnerUp = tally[1];
  const eliminated = (top && (!runnerUp || top.votes > runnerUp.votes) && skipVotes < top.votes)
    ? getPlayer(g, top.jid) : null;

  if (eliminated) {
    eliminated.alive = false;
    eliminated.deathNight = g.night;
    eliminated.deathMethod = 'the vote of the house';
    g.log.push({ night: g.night, condemned: nameOf(eliminated) });
    silence(chatId, eliminated.jid);
    persistGames();
    console.log(`🔪 [MurderMystery] vote: ${normJid(eliminated.jid)} eliminated (${eliminated.role})`);
  }

  try {
    const buf = await cards.renderVoteCard({
      tally,
      skipVotes,
      eliminated: eliminated ? { charId: eliminated.char.id, name: nameOf(eliminated) } : null,
      manorName: cases.MANOR_NAME,
    });
    if (buf) {
      const tallyText = tally.map((t) => `${t.name} — ${t.votes} vote${t.votes === 1 ? '' : 's'}`).join('\n') + (skipVotes ? `\nskip — ${skipVotes}` : '');
      await sendGroupImage(sock, chatId, buf,
        `⚖️ *VOTE RESULT*\n\n${tallyText}\n\n${eliminated ? `*${nameOf(eliminated)} has been eliminated.*` : 'No one was condemned.'}\n\n🗳️ ${ballotText(g)}`);
    } else throw new Error('vote render null');
  } catch (e) {
    const tallyText = tally.map((t) => `• ${t.name} — ${t.votes}`).join('\n') + (skipVotes ? `\n• skip — ${skipVotes}` : '');
    await sendGroup(sock, chatId,
      `⚖️ *VOTE RESULT*\n\n${tallyText || 'No ballots were cast.'}\n\n${eliminated ? `*${nameOf(eliminated)} has been eliminated.*` : 'No one was condemned.'}\n\n🗳️ ${ballotText(g)}`);
  }

  if (eliminated) {
    // the condemned read their last words aloud (new: wills)
    if (eliminated.will) {
      await sleep(900);
      await postWillCard(sock, chatId, eliminated, 'vote');
    }
    await sleep(1200);
    const w = checkWin(g);
    if (w) return declareWinner(sock, chatId, w);
  }

  // back into the night
  g._resolving = false;
  g._resolving2 = false;
  return beginNight(sock, chatId);
}

// public ballots — who voted for whom (new: open ballots)
function ballotText(g) {
  const parts = [];
  for (const [voterJid, choice] of Object.entries(g.votes || {})) {
    const voter = getPlayer(g, voterJid);
    const who = voter ? nameOf(voter) : voterJid.slice(-4);
    if (choice === 'skip') parts.push(`${who} abstained`);
    else {
      const t = getPlayer(g, choice);
      parts.push(`${who} → ${t ? nameOf(t) : '?'}`);
    }
  }
  return parts.length ? `Ballots: ${parts.join(' · ')}` : 'No ballots were cast.';
}

// ---------- WIN CONDITIONS ----------
function checkWin(g) {
  const killers = aliveKillers(g).length;
  const others = aliveNonKillers(g).length;
  if (killers === 0) return 'civ';
  if (killers >= others) return 'killer'; // parity: the killer can no longer be outvoted
  return null;
}

async function declareWinner(sock, chatId, winner) {
  const g = getGame(chatId);
  if (!g) return;
  if (g.phase === 'ENDED') return; // double-fire guard — one finale only
  clearTimers(chatId);
  g.phase = 'ENDED';

  const killer = g.players.find((p) => p.role === 'KILLER');
  const victims = g.log.flatMap((l) => [l.victim, l.condemned]).filter(Boolean);
  const survivors = alivePlayers(g).map(nameOf);
  const closing = cases.pick(winner === 'civ' ? cases.CIV_WIN_LINES : cases.KILLER_WIN_LINES);

  try {
    const buf = await cards.renderFinalCard({
      winner,
      killerChar: killer.char,
      killerName: nameOf(killer),
      manorName: cases.MANOR_NAME,
      nightsSurvived: g.night,
      victims,
      survivors,
      closingLine: closing,
    });
    if (buf) {
      await sendGroupImage(sock, chatId, buf, finalCaption(g, winner, killer, survivors));
    } else throw new Error('final render null');
  } catch (e) {
    await sendGroup(sock, chatId, finalCaption(g, winner, killer, survivors));
  }

  // cleanup + case archive (preserve game data)
  unsilenceChat(chatId);
  clearTimers(chatId);
  try {
    const archive = system.get(`${ARCHIVE_KEY_BASE}_${botIdSafe()}`, []);
    archive.unshift({
      chatId,
      winner,
      killer: nameOf(killer),
      killerChar: killer.char.name,
      nights: g.night,
      victims,
      survivors,
      investResults: g.investResults || [],
      bodiesFound: (g.bodies || []).filter((b) => b.found).length,
      cluesGiven: g.cluesGiven || 0,
      log: g.log || [],
      endedAt: Date.now(),
    });
    system.set(`${ARCHIVE_KEY_BASE}_${botIdSafe()}`, archive.slice(0, 25));
  } catch (e) {}
  games.delete(chatId);
  persistGames();
  console.log(`🔪 [MurderMystery] game ended in ${chatId} — winner=${winner}`);
}

function finalCaption(g, winner, killer, survivors) {
  const victims = g.log.flatMap((l) => [l.victim, l.condemned]).filter(Boolean);
  if (winner === 'civ') {
    return `🏆 *MYSTERY SOLVED*\n\n*${nameOf(killer)} was the Killer* — ${killer.char.name}, ${killer.char.title}.\n\n` +
      `Nights survived: ${g.night}\nLost: ${victims.length ? victims.join(', ') : 'no one'}\nSurvivors: ${survivors.join(', ') || 'none'}\n\n` +
      `The survivors win. The manor is quiet again — for now.`;
  }
  return `🔪 *THE KILLER WINS*\n\n*${nameOf(killer)} was the Killer* — ${killer.char.name}, ${killer.char.title}.\n\n` +
    `Nights survived: ${g.night}\nLost: ${victims.length ? victims.join(', ') : 'no one'}\nStill breathing: ${survivors.join(', ') || 'no one'}\n\n` +
    `Nobody was able to stop them.`;
}

// ---------- force end ----------
async function forceEnd(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ Close the case from the group where the manor stands.`);
  const g = getGame(chatId);
  if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ There is no mystery here to end.`);
  if (normJid(senderJid) !== g.host && !ctx.isMod) {
    return sendGroup(sock, chatId, `${botMarker}🕯️ Only the host (@${g.host}) or a moderator may close the case early.`);
  }
  await sendGroup(sock, chatId, `${botMarker}🕯️ The host has closed the case. The manor goes dark.`);
  unsilenceChat(chatId);
  clearTimers(chatId);
  games.delete(chatId);
  persistGames();
}

// ---------- status / help ----------
async function showStatus(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) {
    // private status: your character, your role, your pulse — roles live ONLY here
    const g = findGameForPlayer(senderJid);
    if (g) noteSock(g, sock);
    if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ You are not part of any mystery.`);
    const me = getPlayer(g, senderJid);
    const secs = Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000));
    const aliveList = alivePlayers(g).map((p, i) => `  ${i + 1}. ${nameOf(p)} — ${p.char.name}`).join('\n');
    const roleWord = me.role === 'KILLER' ? '🔪 the *KILLER*' : me.role === 'INVESTIGATOR' ? '🕵️ the *INVESTIGATOR*' : me.role === 'GUARDIAN' ? '👼 the *GUARDIAN*' : '👤 a *CIVILIAN*';
    const roleLine = me.alive
      ? `You are *${me.char.name}, ${me.char.title}* — ${roleWord}.`
      : `You are dead — *${me.char.name}*, taken on night ${me.deathNight || '?'}. You watch now.`;
    let actionLine = '';
    if (me.alive && g.phase === PHASE.NIGHT) {
      if (me.role === 'KILLER') actionLine = g.killerTargetJid ? `\nTonight: knife chosen${g.killerRoomIdx != null ? ', body placed' : ' — now \`' + g.prefix + ' mm room <n>\`'}.`
        : `\nTonight: \`${g.prefix} mm kill <n>\`, then \`${g.prefix} mm room <n>\`.`;
      if (me.role === 'INVESTIGATOR') actionLine = g.investTargetJid ? '\nTonight: your investigation is spent.' : `\nTonight: \`${g.prefix} mm investigate <n>\`.`;
      if (me.role === 'GUARDIAN') actionLine = g.protectTargetJid ? '\nTonight: your watch is set.' : `\nTonight: \`${g.prefix} mm protect <n|me>\`.`;
    }
    let searchLine = '';
    if (me.alive && g.phase === PHASE.DISCUSSION) {
      const used = g.searches && g.searches.night === g.night && g.searches.used[normJid(senderJid)] != null;
      searchLine = used ? '\nSearch: already made today.' : `\nSearch: one room remains — \`${g.prefix} mm search <n|room>\`.`;
    }
    const unfound = (g.bodies || []).filter((b) => !b.found).length;
    const bodyLine = unfound ? `\n\nUnfound bodies in the manor: *${unfound}*.` : '';
    return sendGroup(sock, chatId,
      `🕯️ *${cases.MANOR_NAME} — PRIVATE STATUS*\n\n` +
      `Phase: *${g.phase}* · Night *${g.night}* · ⏱️ ${Math.floor(secs / 60)}m ${secs % 60}s left\n\n` +
      `${roleLine}${actionLine}${searchLine}${bodyLine}\n\nThe living:\n${aliveList}`);
  }
  const g = getGame(chatId);
  if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ No mystery is unfolding here. \`${ctx.prefix} mm create\` to open the manor.`);
  if (g.phase === PHASE.LOBBY) return showPlayers(ctx);
  // PUBLIC status — never contains roles. Roles live in DMs only.
  const alive = alivePlayers(g);
  const me = getPlayer(g, senderJid);
  const lines = alive.map((p, i) =>
    `  ${i + 1}. ${nameOf(p)} — ${p.char.name}${me && normJid(senderJid) === normJid(p.jid) ? ' (you)' : ''}`).join('\n');
  const deadCount = g.players.length - alive.length;
  const secs = Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000));
  const unfound = (g.bodies || []).filter((b) => !b.found).length;
  const youLine = me
    ? (me.alive ? `\nYou are *${me.char.name}*. Your role is between you and your DMs.` : '\nYou are dead. You watch now.')
    : '';
  const bodyLine = unfound ? `\nUnfound bodies in the manor: *${unfound}*. Someone here is still hiding their work.` : '';
  await sendGroup(sock, chatId,
    `${botMarker}🕯️ *${cases.MANOR_NAME}*\n\n` +
    `Phase: *${g.phase}* · Night *${g.night}* · ${deadCount} dead · ⏱️ ${Math.floor(secs / 60)}m ${secs % 60}s left\n\n` +
    `The living:\n${lines}\n${youLine}${bodyLine}`);
}

function helpText(prefix) {
  return (
    `🕯️ *MURDER MYSTERY — BLACKVALE MANOR*\n\n` +
    `A murder will be committed. One of you is the killer.\n\n` +
    `*Lobby (group):*\n` +
    `• \`${prefix} mm create\` — open the manor\n` +
    `• \`${prefix} mm join\` — accept the invitation\n` +
    `• \`${prefix} mm leave\` — decline it\n` +
    `• \`${prefix} mm players\` — guest list\n` +
    `• \`${prefix} mm start\` — host begins the mystery\n\n` +
    `*At dawn (group or DM):*\n` +
    `• \`${prefix} mm search <room n|name>\` — one search per guest, per day. Searches are public; the ghost's clue is not.\n` +
    `• \`${prefix} mm will <text>\` (DM) — seal your last words; the house reads them aloud if you die.\n\n` +
    `*In play (group):*\n` +
    `• \`${prefix} mm vote <n|name|skip>\` — cast your ballot (ballots are public)\n` +
    `• \`${prefix} mm status\` — the state of the case\n` +
    `• \`${prefix} mm end\` — host/mod closes the case\n\n` +
    `*At night (in your DM with the bot — 3 minutes):*\n` +
    `• \`${prefix} mm kill <n|name>\` — killer only, then \`${prefix} mm room <n>\` to hide the body\n` +
    `• \`${prefix} mm investigate <n|name>\` — investigator only\n` +
    `• \`${prefix} mm protect <n|me>\` — guardian only (games of 5+)\n\n` +
    `*If you dare (DM):*\n` +
    `• \`${prefix} mm taunt <message>\` — whisper into the discussion, unsigned. The manor will say if it is not yours to give.\n\n` +
    `*How it flows:* roles are dealt in secret. At night the killer kills and hides the body; by day the house searches — the finder of the body inherits the ghost's clue about the killer's character. Bad votes let the killer kill again. Dead guests are silenced until the case closes.\n\n` +
    `Roles: 1 Killer · 1 Investigator · 1 Guardian (5+ players) · the rest Civilians.\n` +
    `You receive a sealed role card in your DMs. Tell no one.`
  );
}

// ============================================
// COMMAND ROUTER
// ============================================

let _rehydrated = false;
function ensureRehydrated() {
  if (_rehydrated) return;
  _rehydrated = true;
  loadPersisted();
}

function isModJid(jid) {
  try {
    const engine = require('../../engine');
    return !!(engine.isGlobalMod?.(jid) || engine.isRpgMod?.(jid) || engine.isBotOwner?.(jid));
  } catch (e) {
    return false;
  }
}

// guard: a game is hosted by exactly one bot instance
function ownedByOtherBot(g, ctx) {
  return !!(g && g.botId && ctx.botId && g.botId !== ctx.botId);
}

// common typos seen in the wild (`.j mm joim`, `.j mm join;!` …)
const SUB_FIXES = {
  joim: 'join', jojn: 'join', jion: 'join', jon: 'join',
  stat: 'status', stats: 'status',
  serch: 'search', serach: 'search', sarch: 'search', seach: 'search',
  investigat: 'investigate', investgiate: 'investigate', ivestigate: 'investigate',
  protekt: 'protect', porotect: 'protect',
  vtoe: 'vote', vot: 'vote',
  strart: 'start', strat: 'start',
};

async function handleCommand(ctx) {
  ensureRehydrated();
  const { sock, chatId, senderJid, botMarker } = ctx;
  // capture the live sock on any game in this chat — timer-driven sends
  // (vote prompt, dawn, reminders) must use the account that is IN the group
  const gLive = getGame(chatId);
  if (gLive) noteSock(gLive, sock);
  let sub = (ctx.sub || 'help').toLowerCase().trim();
  sub = sub.replace(/[^a-z]/g, ''); // strip stray punctuation (`join;!` → `join`)
  sub = SUB_FIXES[sub] || sub;
  if (!sub) sub = 'help';
  const g = getGame(chatId);

  if (g && ownedByOtherBot(g, ctx) && !['help', 'status', 'players'].includes(sub)) {
    return sendGroup(sock, chatId, `${botMarker}🕯️ This mystery is hosted by another bot. Use their prefix instead.`);
  }

  switch (sub) {
    case 'create':
    case 'open':
    case 'new':
    case 'lobby':
      return createLobby(ctx);
    case 'join':
    case 'in':
      return joinLobby(ctx);
    case 'leave':
    case 'out':
    case 'quit':
      return leaveLobby(ctx);
    case 'players':
    case 'roster':
    case 'guests':
    case 'list':
      return showPlayers(ctx);
    case 'start':
    case 'begin':
      return startGame(ctx);
    case 'status':
    case 'state':
    case 'case':
      return showStatus(ctx);
    case 'end':
    case 'stop':
    case 'cancel':
      return forceEnd(ctx);
    case 'vote':
    case 'ballot':
      return castVote(ctx, ctx.rest);
    case 'kill':
    case 'murder':
    case 'stab':
    case 'slay':
      return submitKill(ctx, ctx.rest);
    case 'room':
    case 'place':
    case 'hide':
    case 'dump':
      return submitRoom(ctx, ctx.rest);
    case 'investigate':
    case 'inv':
    case 'study':
      return submitInvestigate(ctx, ctx.rest);
    case 'protect':
    case 'guard':
    case 'watch':
    case 'save':
      return submitProtect(ctx, ctx.rest);
    case 'search':
    case 'sweep':
      return submitSearch(ctx, ctx.rest);
    case 'taunt':
    case 'taun':
    case 'tunt':
      return submitTaunt(ctx, ctx.rest);
    case 'will':
    case 'lastwords':
      return submitWill(ctx, ctx.rest);
    case 'help':
    case 'rules':
    case 'howto':
    default:
      return sendGroup(sock, chatId, `${botMarker}${helpText(ctx.prefix)}`);
  }
}

// init() is safe to call from engine boot (after system data loads)
function init() {
  ensureRehydrated();
}

module.exports = {
  handleCommand,
  init,
  isSilenced,
  // QA / introspection
  _internal: {
    getGame,
    get games() { return games; },
    loadPersisted,
    persistGames,
    ensureRehydrated,
    onPhaseTimeout,      // QA: fast-forward phase deadlines
    watchdogTick,        // QA + introspection: self-healing phase machine
    sockForGame,         // QA
    maybeResolveNight,   // QA
    sendNightNudges,     // QA
    nightNeedsExtension, // QA
    silence,
    unsilenceChat,
    isSilenced,
    clearTimers,
    resolveRoom,
    roomListOf,
    PHASE,
    normJid,
  },
};
