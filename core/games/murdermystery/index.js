// ============================================
// MURDER MYSTERY - BLACKVALE MANOR
// A turn-based social deduction game for WhatsApp.
//
// Loop: lobby → secret roles (DM image cards) → cast introductions (30s apart)
//       → night (kill + room / compare / protect) → dawn
//       → search phase → body discovery → ghost clues + case evidence
//       → discussion (ask guests, dossier) → voting → elimination → repeat.
//
// Roles (owner 2026-10-12: "10 people playing and only 1 killer and 1
// investigator why?" — the deal now scales with the roster):
//   4p: 1 KILLER + 1 INVESTIGATOR
//   5-7p: 1 KILLER + 1 INVESTIGATOR + 1 GUARDIAN
//   8-10p: 1 KILLER + 2 INVESTIGATORS + 1 GUARDIAN
//   9-11p: 2 KILLERS (partners, share one kill) + 2 INVESTIGATORS + 1 GUARDIAN
//   + Civilians. Characters (the 11 manor sprites) are story persons only.
//
// Isolated module: state lives in its own System keys
// (per bot instance), commands live under `murder`/`mm`,
// cards render locally via node-canvas. No RPG assets.
//
// Dead players: independent, loophole-free silence gate -
// the engine deletes EVERYTHING they post in the group
// (text, media, view-once, stickers, commands). The gate
// is bound to the game lifecycle and cannot be bypassed
// with `.j claim` or any normal-mute workaround.
// ============================================

const system = require('../../utils/system');
const botConfig = require('../../../botConfig');
const characters = require('./characters');
const cases = require('./cases');
const caseGen = require('./caseGen');
const cards = require('./cards');

// RPG economy (Zeni) - used for the manor's PRIZE (owner rule 2026-09-14:
// "it should have a money prize, not need money to play" - the cast fee is
// gone; the manor PAYS the winning side instead).
// Optional by design: if the economy module is unavailable the manor
// simply doesn't post a purse rather than refusing to open.
let economy = null;
try { economy = require('../../rpg/economy'); } catch (e) { economy = null; }

// ---------- tunables ----------
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 11;        // character pool size
// MM_QA_CLOCK=1 scales the phase clocks so harnesses can exercise full night
// cycles (including a quiet night's one dawn extension) in seconds; without
// the env these are the production values, untouched.
const QA_CLOCK = !!process.env.MM_QA_CLOCK;
const NIGHT_MS = QA_CLOCK ? 5000 : 255000;       // 4¼ minutes of darkness - +75s for the Wave 2b room visits (owner 2026-10-13: "obviously night time will last longer now")
const NUDGE_BEFORE_MS = QA_CLOCK ? 800 : 45000;  // "the night is thinning" DM before dawn
const DAWN_EXTEND_MS = QA_CLOCK ? 1500 : 60000;  // one extension while a required actor sleeps
// discussion/vote windows must outlast REAL on-box card-render latency
// (~1-2s per card) or the harness acts after the phase has rolled over
const DISCUSS_MS = QA_CLOCK ? 15000 : 300000;    // 5 minutes of accusations (and one search each)
const VOTE_MS = QA_CLOCK ? 10000 : 90000;        // 90s on the ballot
const LOBBY_TTL_MS = 30 * 60000;
// --- zombie retirement (2026-10-06): an abandoned game cycles
// night->dawn->discussion->vote forever (~9.5 min/round) and was found on
// NIGHT 361 after ~2.4 DAYS of round-the-clock cards to the group, and its
// endless re-resolution is the prime suspect in a 95%-CPU event-loop spin
// that hung the whole bot for >1h. Old manors now crumble on their own. ---
const ZOMBIE_NIGHT_CAP = 40;          // a real game never reaches night 40
const ZOMBIE_AGE_MS = 24 * 3600000;   // or lives past 24h
// --- self-healing phase machine (the live game froze when phase timers fired
// late/never under load) - the watchdog forces every stalled transition ---
const WATCHDOG_MS = 15000;          // tick every 15s
const WATCHDOG_GRACE_MS = 12000;    // deadline must be this stale before forcing
const RESOLVE_STALE_MS = 45000;     // resolution flags older than this are dead
const TRANSITION_DEDUPE_MS = 8000;  // same transition twice within this = bug, block
const VOTE_REMIND_BEFORE_MS = 30000;  // "the count closes" fires this long BEFORE the deadline
const DISCUSS_REMIND_BEFORE_MS = 60000; // "votes in a minute" fires this long BEFORE the deadline
// (2026-10-12 fix: both reminders used to fire AFTER that much time had passed —
// "the house votes in ONE minute" appeared 60s INTO a 5-minute discussion)
const INTRO_INTERVAL_MS = process.env.MM_QA_FAST ? 250 : 30000; // one card every 30s (owner MD §7); MM_QA_FAST=1 lets the QA harness fast-forward
const INTRO_FIRST_MS = process.env.MM_QA_FAST ? 250 : 4000;
const TWO_INV_MIN_PLAYERS = 8;        // 2nd investigator joins at this size
const TWO_KILLER_MIN_PLAYERS = 9;     // 2nd killer (partner) joins at this size
// --- Wave 2a roles (owner 2026-10-13 09:44Z, "New role amd some other stuff") ---
const MEDIUM_MIN_PLAYERS = 8;         // the Medium (veil) joins at this size
const BUTLER_MIN_PLAYERS = 9;         // the Butler (night-3 name drop) joins at this size
const ACCOMPLICE_MIN_PLAYERS = 9;     // the Accomplice (killer-side sleeper) joins at this size
const BUTLER_REVEAL_NIGHT = 3;        // the night the butler learns the killer's name
const SEANCE_BUDGET = 2;              // veil openings per medium per case
const SEANCE_MAX_LEN = 300;           // words the veil will carry per whisper
const SEANCE_COOLDOWN_MS = 2500;      // anti-spam between words through the veil
// --- Wave 2b rooms layer (owner 2026-10-13 09:59Z nod: "let's get working on this for now") ---
const LOOT_STOCK = { talisman: 1, candle: 2, coin: 2 }; // per-case keepsake stock (coin sleeps until the 2c puzzles)
const VISIT_LOOT_CHANCE = 0.3;        // a visit may also surface a keepsake
const LETTERS_PER_CASE = 8;           // the manor's letter thread per case (hint text only - pool length wins)
const IMG_NOTICE_THROTTLE_MS = 10 * 60000; // media-gate notice: at most once per 10 min per chat
const TAUNT_MAX_LEN = 160;
const WILL_MAX_LEN = 200;
const SILENCE_TTL_MS = 12 * 3600000; // failsafe only - silence is released at case close
const DM_SEND_DELAY_MS = process.env.MM_QA_FAST ? 30 : 1100; // pacing for role-card DM bursts
const REVEAL_ROLE_ON_DEATH = false;  // configurable

// ---------- the manor's purse (prize pool) ----------
const PRIZE_MIN = 10000;
const PRIZE_MAX = 25000;
const PRIZE_STEP = 500; // rolled in 500-Zeni steps at lobby open

// ---------- all-time ledger (leaderboard) ----------
// Global key: one shared process serves every bot instance, and entries are
// user-keyed - a player's shadow follows them across every manor.
const STATS_KEY = 'murder_mm_stats_v1';
const LB_MAX_ROWS = 10;

function rollPrize() {
  const steps = Math.floor((PRIZE_MAX - PRIZE_MIN) / PRIZE_STEP);
  return PRIZE_MIN + PRIZE_STEP * Math.floor(Math.random() * (steps + 1));
}

function fmtZeni(n) {
  try { return Number(n).toLocaleString('en-US'); } catch (e) { return String(n); }
}

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
const introTimers = new Map(); // chatId -> [Timeout] cast introduction chain
const silenced = new Map();  // chatId -> Map(normJid -> ts)
const imgNotices = new Map(); // chatId -> ts (media-gate notice throttle)
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
    let retiredZombies = 0;
    if (saved && typeof saved === 'object') {
      for (const [chatId, g] of Object.entries(saved)) {
        // zombie retirement at the gate: a stale ancient game must never
        // re-enter the phase machine (its watchdog-forced re-resolution of a
        // 300+ night state is the suspected boot-loop/spin trigger)
        if (isZombieGame(g)) { retiredZombies++; continue; }
        adoptGame(chatId, g, now);
      }
    }
    if (retiredZombies) console.log(`🔪 [MurderMystery] retired ${retiredZombies} zombie game(s) at rehydrate (night cap ${ZOMBIE_NIGHT_CAP} / age cap 24h)`);
    // legacy v1 flat map - adopt only this bot's games (migration)
    if (system.get(LEGACY_GAMES_KEY, null)) {
      const legacy = system.get(LEGACY_GAMES_KEY, null);
      for (const [chatId, g] of Object.entries(legacy || {})) {
        if (g && !isZombieGame(g) && g.botId === mine && !games.has(chatId)) adoptGame(chatId, g, now);
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
  // v2 role-deal migration: pre-scaling games carry single-slot night fields
  // and no per-player ledger - seed it so the night can still resolve.
  if (!g.v2) {
    g.v2 = true;
    g.nightActs = g.nightActs || {};
    if (g.investTargetJid) {
      const inv = (g.players || []).find((p) => p.role === 'INVESTIGATOR');
      if (inv) g.nightActs[normJid(inv.jid)] = { type: 'investigate', targetJid: g.investTargetJid };
    }
    if (g.killerTargetJid && g.killerRoomIdx != null) {
      for (const k of (g.players || []).filter((p) => p.role === 'KILLER')) {
        g.nightActs[normJid(k.jid)] = { type: 'kill', targetJid: g.killerTargetJid, roomIdx: g.killerRoomIdx };
      }
    }
    if (g.protectTargetJid) {
      const ga = (g.players || []).find((p) => p.role === 'GUARDIAN');
      if (ga) g.nightActs[normJid(ga.jid)] = { type: 'protect', targetJid: g.protectTargetJid };
    }
  }
  // compare-era migration: in-flight investigators get the pairing budget
  for (const p of (g.players || [])) {
    if (p.role === 'INVESTIGATOR' && p.compLeft == null) p.compLeft = COMPARE_BUDGET;
    if (p.role === 'MEDIUM' && p.seanceLeft == null) p.seanceLeft = SEANCE_BUDGET; // Wave 2a migration
    if (!Array.isArray(p.items)) p.items = [];  // Wave 2b migration: keepsakes
    if (p.letters == null) p.letters = 0;       // Wave 2b migration: letter fragments read
  }
  // Wave 2b migration: mid-case games predate the rooms layer
  if (!g.visits || typeof g.visits !== 'object') g.visits = { night: 0, picks: {} };
  if (!g.lootPool || typeof g.lootPool !== 'object') g.lootPool = { ...LOOT_STOCK };
  if (!Array.isArray(g.letterPool)) g.letterPool = [];
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
// engine's module sock. Timer-driven sends MUST use this - getSockSafe() alone
// returns whichever of the 3 bot accounts connected last, which may not even
// be in the group (that is how the live vote prompt silently vanished).
function sockForGame(g) {
  if (g && g._sock) return g._sock;
  return getSockSafe();
}

// remember the live sock on the game (internal key - never persisted)
function noteSock(g, sock) {
  if (g && sock) g._sock = sock;
}

// idempotency stamp: the same transition twice within TRANSITION_DEDUPE_MS is
// always a double-fire (late timer + watchdog), never a legit new round.
// NOTE: keys must be per-round (e.g. `night3`) - a new round may legitimately
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

// ---------- group-participants hook (leaver fix 2026-10-12) ----------
// A guest who leaves or is removed from the WhatsApp group mid-case is written
// out cleanly: lobby = off the guest list; in play = they fled the manor
// (treated as a death, publicly, so they can never act from outside).
async function handleParticipantLeave(chatId, participants, action) {
  const g = getGame(chatId);
  if (!g || !Array.isArray(participants) || !participants.length) return;
  for (const pj of participants) {
    const n = normJid(typeof pj === 'string' ? pj : (pj && pj.id) || '');
    if (!n) continue;
    const p = getPlayer(g, n);
    if (!p) continue;
    if (g.phase === PHASE.LOBBY) {
      const idx = g.players.findIndex((x) => normJid(x.jid) === n);
      if (idx !== -1) g.players.splice(idx, 1);
      if (g.players.length === 0) {
        clearTimers(chatId);
        games.delete(chatId);
        persistGames();
        await sendGroup(sockForGame(g), chatId, `🕯️ The last guest has left. The manor goes dark.`);
        continue;
      }
      if (g.host === n) g.host = normJid(g.players[0].jid);
      persistGames();
      await sendGroup(sockForGame(g), chatId, `🕯️ @${n} has left the building - their invitation burns. (${g.players.length} remaining)`, { contextInfo: { mentionedJid: [p.jid] } });
    } else if (g.phase !== 'ENDED' && p.alive) {
      p.alive = false;
      p.deathNight = g.night;
      p.deathMethod = 'fled into the night';
      g.log.push({ night: g.night, fled: nameOf(p) });
      silence(chatId, p.jid);
      persistGames();
      await sendGroup(sockForGame(g), chatId, `🚪 *${nameOf(p)} has fled the manor.* The doors do not forgive. They are lost to the case - the house divides their belongings.`);
      const w = checkWin(g);
      if (w) await declareWinner(sockForGame(g), chatId, w);
    }
  }
}

// ---------- media gate (owner 2026-10-12: "automatically deleting images
// when the game is running is kinda needed cus last game some players sent
// screenshots from dms") ----------
// While a case is live in a group, any player-posted IMAGE or VIEW-ONCE is
// deleted and a throttled notice is posted instead. Stickers and documents
// pass through untouched (owner 2026-10-12 20:26Z). The bot's own cards are
// untouched (fromMe is filtered by the engine gate).
// every wrapper generation WhatsApp has shipped for once-mode media, plus the
// ephemeral disappearing wrapper (which may nest a view-once inside itself)
const VO_WRAP_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
function leakVector(node, inOnce, depth) {
  if (!node || typeof node !== 'object' || depth > 4) return false;
  if (node.imageMessage) return true; // images burn at any depth - the screenshot vector
  if (inOnce && (node.videoMessage || node.audioMessage || node.pttMessage)) return true; // once-mode media
  for (const k of VO_WRAP_KEYS) {
    const c = node[k];
    if (c && c.message && leakVector(c.message, true, depth + 1)) return true;
  }
  const eph = node.ephemeralMessage; // disappearing wrapper - transparent, not once-mode
  if (eph && eph.message && leakVector(eph.message, inOnce, depth + 1)) return true;
  return false;
}

function gateGameMedia({ chatId, m }) {
  const g = getGame(chatId);
  if (!g || g.phase === PHASE.LOBBY || g.phase === 'ENDED') return false;
  const msg = m && m.message;
  if (!msg || msg.protocolMessage || msg.reactionMessage) return false;
  // owner 2026-10-12 20:26Z: "Don't auto delete stickers, only view once
  // messages and images" - stickers and documents pass through; images and
  // view-once media (the screenshot-leak vectors) still burn.
  // 2026-10-12 22:40Z, owner: "people can still send view once messages fix
  // that" - the flat shape-list missed the newer wrappers. Walk the container
  // tree instead: images burn wherever they hide (any depth), while video and
  // audio only burn inside a view-once wrapper (a plain video or a normal
  // ephemeral voice note is not a screenshot vector).
  const hasMedia = leakVector(msg, false, 0);
  if (!hasMedia) return false;
  const sock = sockForGame(g);
  try { if (sock && m.key) sock.sendMessage(chatId, { delete: m.key }).catch(() => {}); } catch (e) {}
  console.log(`🔪 [MurderMystery] media gate: deleted player image in ${chatId} (game ${g.phase})`);
  const now = Date.now();
  const last = imgNotices.get(chatId) || 0;
  if (now - last > IMG_NOTICE_THROTTLE_MS) {
    imgNotices.set(chatId, now);
    sendGroup(sock, chatId, `🕯️ Screenshots and images stay out of the case room. The manor burns them on sight - evidence arrives on its own cards.`);
  }
  return true;
}

function gameChatIdOf(g) {
  return g ? g.chatId : null;
}

// ---------- game access ----------
function getGame(chatId) {
  return games.get(chatId) || null;
}

// a game nobody has played for a day (or 40+ nights) is not a mystery any
// more - it is an ambush for the next reboot. Retire it wherever it surfaces.
function isZombieGame(g) {
  if (!g) return false;
  if ((g.night || 0) > ZOMBIE_NIGHT_CAP) return true;
  const started = g.createdAt || g.startedAt || 0;
  return started > 0 && (Date.now() - started) > ZOMBIE_AGE_MS;
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

function livingInvestigators(game) {
  return alivePlayers(game).filter((p) => p.role === 'INVESTIGATOR');
}

// has this living investigator satisfied the night? 'investigate' acts belong
// to in-flight pre-nerf games; an investigator out of pairings no longer
// holds the night hostage (owner 2026-10-12: 3 pairwise weighings per case)
function invActedTonight(g, inv) {
  const a = g.nightActs && g.nightActs[normJid(inv.jid)];
  if (a && (a.type === 'compare' || a.type === 'investigate')) return true;
  return inv.compLeft != null && inv.compLeft <= 0;
}

function livingKillers(game) {
  return alivePlayers(game).filter((p) => p.role === 'KILLER');
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
    .map((p, i) => `  ${i + 1}. ${nameOf(p)} - ${p.char.name}${normJid(p.jid) === inc ? ' (you)' : ''}`);
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
  return (game.rooms || []).map((r, i) => `  ${i + 1}. ${r.name} - _${r.hint} · ${r.concealLabel}_`).join('\n');
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
  // cast introduction chain (game cancelled / ended mid-intro)
  const its = introTimers.get(chatId);
  if (its && its.length) for (const it of its) clearTimeout(it);
  introTimers.delete(chatId);
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
    const bodyNote = unfound ? ` ⚠️ ${unfound} bod${unfound === 1 ? 'y lies' : 'ies lie'} unfound - a search may find it.` : '';
    await sendGroupCritical(g, chatId,
      `⏱️ The house votes in ONE minute.${bodyNote}\nLast chance: \`${prefix} mm search <number|room>\`.`);
  }
  if (kind === 'vote' && g.phase === PHASE.VOTING) {
    const alive = alivePlayers(g);
    const out = alive.length - Object.keys(g.votes || {}).length;
    if (out <= 0) return;
    await sendGroupCritical(g, chatId,
      `⚖️ The count closes in 30 seconds - *${out} ballot${out === 1 ? '' : 's'}* still out.\nVote: \`${prefix} mm vote <number|name|skip>\`.`);
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
  // MM_QA_NOTIMER (mm_qa.js only, never set in production): the qa1
  // discussion/voting chains render 10-20 real cards, and a timer armed at
  // phase start rolls the machine mid-chain - a deadline-field freeze cannot
  // retract an armed setTimeout. qa1 drives discussion/voting via forced
  // onPhaseTimeout, so those two phases simply do not arm; nights keep their
  // (scaled) timer for the quiet-night cycles.
  if (process.env.MM_QA_NOTIMER && (g.phase === PHASE.DISCUSSION || g.phase === PHASE.VOTING)) return;
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
  const killerTeam = alivePlayers(g).filter((p) => p.role === 'KILLER');
  if (killerTeam.length && !g.killerTargetJid) {
    for (const k of killerTeam) {
      await sendDM(sock, k.jid, `🌙 The night thins - ${left}s of dark remain.\n\`${g.prefix} mm kill <number>\` - then \`mm room <number>\` to hide the body.${killerTeam.length > 1 ? '\n(Your partner may have already chosen.)' : ''}`);
    }
  }
  for (const inv of livingInvestigators(g)) {
    if (!invActedTonight(g, inv)) {
      await sendDM(sock, inv.jid, `🌙 The night thins - ${left}s of dark remain.\n\`${g.prefix} mm compare <number> <number>\` - lay two guests on the scales before dawn.`);
    }
  }
  const ga = livingGuardian(g);
  if (ga && !g.protectTargetJid) {
    await sendDM(sock, ga.jid, `🌙 The night thins - ${left}s remain.\n\`${g.prefix} mm protect <number|me>\` if you wish to stand watch.`);
  }
}

// one gentle dawn extension while a REQUIRED actor (killer team or any living investigator) hasn't acted
function nightNeedsExtension(g) {
  if (!g || g.extendedTonight) return false;
  if (livingKillers(g).length && !g.killerTargetJid) return true;
  for (const inv of livingInvestigators(g)) {
    if (!invActedTonight(g, inv)) return true;
  }
  return false;
}

async function onPhaseTimeout(chatId, sockOverride = null, opts = {}) {
  const g = getGame(chatId);
  if (!g) return;
  // force = watchdog path: skip the in-flight guards ONLY when the flags are
  // provably dead (stale) - a live resolution (image uploads can be slow) is
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
// WATCHDOG - the phase machine is now self-healing. Any phase whose deadline
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
      // zombie retirement in the wild: end it with a farewell instead of
      // letting the machine cycle darkness around the clock
      if (g.phase !== PHASE.LOBBY && isZombieGame(g)) {
        console.log(`🔪 [MurderMystery] watchdog: retiring zombie game in ${chatId} (night=${g.night})`);
        g.phase = 'ENDED';
        clearTimers(chatId);
        games.delete(chatId);
        persistGames();
        await sendGroup(sockForGame(g), chatId,
          `🏚️ The manor, untenanted too long, crumbles into the fog. The mystery dissolves - start afresh with \`${g.prefix || '.j'} mm start\` whenever you dare.`);
        continue;
      }
      if (now <= g.deadline + WATCHDOG_GRACE_MS) continue;
      // VOTING with every ballot already in: resolve now, don't wait for anything
      if (g.phase === PHASE.VOTING) {
        const alive = alivePlayers(g).length;
        if (alive > 0 && Object.keys(g.votes || {}).length >= alive && !g._resolving) {
          console.log(`🔪 [MurderMystery] watchdog: all ballots in but vote unresolved in ${chatId} - resolving now`);
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

// silent teardown (empty lobby timeout etc.) - releases silences and timers
async function endGame(sock, chatId, reason) {
  const g = getGame(chatId);
  if (!g) return;
  console.log(`🔪 [MurderMystery] game ended in ${chatId} - ${reason}`);
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
    if (g.phase === PHASE.LOBBY) return sendGroup(sock, chatId, `${botMarker}🕯️ A lobby is already open - \`${g.prefix} mm join\` to step inside. (${g.players.length} waiting)`);
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
    prize: rollPrize(), // the manor's purse tonight - paid to the winning side
    bodies: [],
    searches: { night: 0, used: {} },
    visits: { night: 0, picks: {} },   // Wave 2b: per-night room visits (normJid -> roomIdx)
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
  const feeLine = game.prize
    ? `💰 Tonight's purse: *${fmtZeni(game.prize)} Zeni* - paid to the winning side\n`
    : '';
  // the start message gets a card (user ask) - text fallback kept
  let lobbyCardOk = false;
  try {
    const buf = await cards.renderLobbyCard({
      manorName: cases.MANOR_NAME,
      playerCount: game.players.length,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      openingLine: opener,
      prefix: ctx.prefix,
      prize: game.prize,
    });
    if (buf) {
      lobbyCardOk = true;
      await sendGroupImage(sock, chatId, buf,
        `${botMarker}🕯️ *BLACKVALE MANOR OPENS ITS DOORS*\n\n` +
        `_“${opener}”_\n\n` +
        `• Join: \`${ctx.prefix} mm join\` · Leave: \`${ctx.prefix} mm leave\`\n` +
        `• Host begins with: \`${ctx.prefix} mm start\`\n` +
        feeLine +
        `*${MIN_PLAYERS}-${MAX_PLAYERS} guests.* One will be the killer. One will hunt them. Perhaps one will guard the rest.\n` +
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
      feeLine +
      `*${MIN_PLAYERS}-${MAX_PLAYERS} guests.* One will be the killer. One will hunt them. Perhaps one will guard the rest.\n` +
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
  // one manor per guest (leaver-fix companion): a player already seated in
  // another case (here or in any other group) may not double-book - their DM
  // night actions would otherwise route to whichever manor they joined last.
  const elsewhere = findGameForPlayer(senderJid);
  if (elsewhere && elsewhere.chatId !== chatId) {
    return sendGroup(sock, chatId, `${botMarker}🕯️ You are already marked in another manor's ledger. Finish that case first - the dead cannot haunt two houses.`);
  }
  if (g.players.length >= MAX_PLAYERS) return sendGroup(sock, chatId, `${botMarker}🕯️ The manor only has ${MAX_PLAYERS} beds. The guest list is full.`);
  g.players.push({ jid: senderJid, name: ctx.senderName, char: null, role: 'CIVILIAN', alive: true });
  persistGames();
  await sendGroup(sock, chatId,
    `${botMarker}🕯️ @${n} accepts the invitation. (${g.players.length} guest${g.players.length === 1 ? '' : 's'} - ${g.players.length}/${MIN_PLAYERS}${g.players.length >= MIN_PLAYERS ? ', enough to begin' : ' so far'})` +
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
      `${botMarker}📜 *GUEST LIST - ${cases.MANOR_NAME}*\n\n${lines}\n\n` +
      `Host: @${g.host} · ${g.players.length}/${MIN_PLAYERS} minimum\n` +
      `💰 Tonight's purse: *${fmtZeni(g.prize || 0)} Zeni* - paid to the winning side\n` +
      `Begin: \`${g.prefix} mm start\``,
      { contextInfo: { mentionedJid: g.players.map((p) => p.jid) } });
  }
  const lines = g.players.map((p) =>
    `  ${p.alive ? '🤍' : '☠️'} ${nameOf(p)} - ${p.char.name}${p.alive ? '' : ' (dead)'}`).join('\n');
  return sendGroup(sock, chatId,
    `${botMarker}📜 *THE GUESTS - ${cases.MANOR_NAME}*\n\n${lines}\n\n` +
    `${alivePlayers(g).length} alive · Night ${g.night} · phase: ${g.phase}`);
}

async function startGame(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ Begin the mystery from the group where the manor stands.`);
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.LOBBY) return sendGroup(sock, chatId, `${botMarker}🕯️ No lobby is open right now.`);
  if (normJid(senderJid) !== g.host) return sendGroup(sock, chatId, `${botMarker}🕯️ Only the host may begin - @${g.host} holds the keys.`, { contextInfo: { mentionedJid: [g.players.find((p) => normJid(p.jid) === g.host)?.jid || g.host] } });
  if (g.players.length < MIN_PLAYERS) return sendGroup(sock, chatId, `${botMarker}🕯️ Too few guests. The manor requires at least *${MIN_PLAYERS}*.`);
  if (g.players.length > MAX_PLAYERS) return sendGroup(sock, chatId, `${botMarker}🕯️ Too many guests. The manor sleeps at most *${MAX_PLAYERS}*.`);

  // ---- the manor's purse ----
  // Owner rule 2026-09-14: no entry fee - the manor PAYS a prize to the
  // winning side when the case closes. Anyone can play for free.
  const purse = g.prize || 0;

  // lock lobby, assign characters + secret roles
  // (2026-10-12 role scaling, owner: "10 people playing and there was only
  // 1 killer and 1 investigator why?" — the deal now scales with the roster)
  const nP = g.players.length;
  const cast = characters.drawCast(nP);
  const order = characters.shuffle(g.players.map((_, i) => i));
  const killerCount = nP >= TWO_KILLER_MIN_PLAYERS ? 2 : 1;
  const investCount = nP >= TWO_INV_MIN_PLAYERS ? 2 : 1;
  const guardianCount = nP >= 5 ? 1 : 0;
  const mediumCount = nP >= MEDIUM_MIN_PLAYERS ? 1 : 0;
  const butlerCount = nP >= BUTLER_MIN_PLAYERS ? 1 : 0;
  const accompliceCount = nP >= ACCOMPLICE_MIN_PLAYERS ? 1 : 0;
  const killerIdxs = order.slice(0, killerCount);
  const investIdxs = order.slice(killerCount, killerCount + investCount);
  let roleCursor = killerCount + investCount;
  const guardianIdx = guardianCount ? order[roleCursor++] : -1;
  const mediumIdx = mediumCount ? order[roleCursor++] : -1;
  const butlerIdx = butlerCount ? order[roleCursor++] : -1;
  const accompliceIdx = accompliceCount ? order[roleCursor] : -1;
  g.players.forEach((p, i) => {
    p.char = cast[i];
    p.role = killerIdxs.includes(i) ? 'KILLER'
      : investIdxs.includes(i) ? 'INVESTIGATOR'
      : i === guardianIdx ? 'GUARDIAN'
      : i === mediumIdx ? 'MEDIUM'
      : i === butlerIdx ? 'BUTLER'
      : i === accompliceIdx ? 'ACCOMPLICE'
      : 'CIVILIAN';
    p.alive = true;
    if (p.role === 'INVESTIGATOR') p.compLeft = COMPARE_BUDGET; // owner nerf 2026-10-12: 3 pairwise weighings per case
    if (p.role === 'MEDIUM') p.seanceLeft = SEANCE_BUDGET;      // owner 2026-10-13: 2 veil openings per case
    p.items = [];  // Wave 2b: keepsakes (talisman / candle / coin)
    p.letters = 0; // Wave 2b: letter fragments read
  });
  g.v2 = true;
  g.nightActs = {}; // per-player night action ledger (supports 2 inv / 2 killers)
  // case generation: motive, relationship web, secrets, timeline, statements
  // (owner expansion 2026-10-12; failure falls back to legacy flavor rounds)
  try {
    g.case = caseGen.generateCase({
      cast,
      killers: g.players.filter((p) => p.role === 'KILLER').map((p) => p.char),
      rooms: g.rooms,
      methodTitles: cases.METHODS.map((m) => m.title),
    });
    if (g.case) {
      caseGen.saveHistory([...caseGen.loadHistory(), g.case.sig]);
      console.log(`🔪 [MurderMystery] case generated: motive=${g.case.motifId} web=${g.case.web.length}pairs`);
    } else {
      console.log(`🔪 [MurderMystery] case generation returned null - legacy flavor round`);
    }
  } catch (e) {
    g.case = null;
    console.error('🔪 [MurderMystery] case generation failed:', e.message);
  }
  // Wave 2b: the manor's letter thread + keepsake stock for this case
  g.letterPool = [];
  try {
    if (g.case && caseGen.buildLetterPool) g.letterPool = caseGen.buildLetterPool({ kase: g.case, cast, rooms: g.rooms });
  } catch (e) {
    console.error('🔪 [MurderMystery] letter pool failed:', e.message);
  }
  g.lootPool = { ...LOOT_STOCK };
  console.log(`🔪 [MurderMystery] wave 2b: letterPool=${g.letterPool.length} lootPool=talisman:${g.lootPool.talisman}/candle:${g.lootPool.candle}/coin:${g.lootPool.coin}`);
  g.phase = 'STARTING';
  persistGames();
  console.log(`🔪 [MurderMystery] game started in ${chatId} - ${nP} players (killers=${killerCount} investigators=${investCount} guardian=${guardianCount} medium=${mediumCount} butler=${butlerCount} accomplice=${accompliceCount})`);

  await sendGroup(sock, chatId, `${botMarker}🕯️ The doors are locked${purse > 0 ? ` - the manor posts a purse of *${fmtZeni(purse)} Zeni* for the winning side` : ''}. Character envelopes are being sealed and delivered to every guest's DM…`);

  // mandatory private role cards - paced to respect the flood gods
  const partnerOf = (p) => g.players.find((x) => x.role === p.role && normJid(x.jid) !== normJid(p.jid)) || null;
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
        const cap = roleCardCaption(p, g, partnerOf);
        sent = await sendDMImage(sock, p.jid, buf, cap);
      }
    } catch (e) { /* fall through to text */ }
    if (!sent) {
      await sendDM(sock, p.jid, textRoleCard(p, g, partnerOf));
    }
    await sleep(DM_SEND_DELAY_MS);
  }

  // group introduction card
  const roleHeadline = `${nP} guests. ${killerCount === 2 ? 'Two of them share a knife.' : 'One killer.'} ${investCount === 2 ? 'Two investigators hunt them.' : 'One detective hunts them.'}${guardianCount ? ' One guardian watches.' : ''}${mediumCount ? ' A medium can wake the dead.' : ''}${butlerCount ? ' The butler serves every side.' : ''}${accompliceCount ? ' Someone hidden roots for the knife.' : ''}`;
  try {
    const buf = await cards.renderIntro({
      playerCount: nP,
      manorName: cases.MANOR_NAME,
      openingLine: cases.pick(cases.OPENING_LINES),
      nightLine: 'When night falls, so does the knife.',
    });
    if (buf) await sendGroupImage(sock, chatId, buf,
      `🕯️ ${roleHeadline}\nRole cards are in your DMs - read them. Tell no one.`);
    else throw new Error('intro render null');
  } catch (e) {
    await sendGroup(sock, chatId,
      `${botMarker}🔪 *THE MYSTERY BEGINS*\n\nEveryone has arrived at ${cases.MANOR_NAME}.\nOne of you is hiding a deadly secret.\n\n` +
      `Role cards: check your DMs. Do not reveal yours.`);
  }

  // owner 2026-10-12: before the character profiles spawn, every guest is
  // silently tagged through the hidden-tag mechanism (mentions ride the
  // contextInfo - the ping lands, no @name shows in the body) with a line
  // telling the house why the descriptions matter. The tagging itself is
  // never announced.
  try {
    await sock.sendMessage(chatId, {
      text: `${botMarker}🕯️ The house presents its guests. Read every character description closely - they are threads, and the evidence will pull them.`,
      contextInfo: { mentionedJid: g.players.map((p) => p.jid).filter(Boolean) },
    });
  } catch (e) {
    await sendGroup(sock, chatId, `${botMarker}🕯️ The house presents its guests. Read every character description closely - they are threads, and the evidence will pull them.`);
  }

  // cast introductions (owner MD §7): one portrait card + backstory caption
  // every 30s, then the first night. Cancellation-safe: the chain checks the
  // game still exists in STARTING at every step; introDone is persisted BEFORE
  // the chain starts so a restart mid-intro skips instead of replaying.
  if (g.case) {
    scheduleIntros(sock, chatId, cast);
    return;
  }
  await sleep(2500);
  return beginNight(sock, chatId);
}

// the 30s-spaced cast introduction chain (MD §7)
function scheduleIntros(sock, chatId, cast) {
  const g = getGame(chatId);
  if (!g) return;
  if (g.case) g.case.introDone = true; // never replay after a restart
  persistGames();
  const nameMap = {};
  for (const c of cast) nameMap[c.id] = c.name;
  const step = (i) => {
    const t = setTimeout(async () => {
      introTimers.set(chatId, (introTimers.get(chatId) || []).filter((x) => x !== t));
      const gg = getGame(chatId);
      if (!gg || gg.phase !== 'STARTING') return; // cancelled or restarted mid-intro
      const c = cast[i];
      const cap = caseGen.introCaptionFor(c.id, nameMap, gg.case, c.title);
      const s = sockForGame(gg);
      try {
        const buf = await cards.renderCharacterIntroCard({ char: c, caption: cap, index: i + 1, total: cast.length, manorName: cases.MANOR_NAME });
        if (buf) await sendGroupImage(s, chatId, buf, `🕯️ *${c.name}* — ${c.title}\n_${cap}_`);
        else throw new Error('intro render null');
      } catch (e) {
        await sendGroup(s, chatId, `🕯️ *${c.name}* — ${c.title}\n_${cap}_`);
      }
      if (i + 1 < cast.length) step(i + 1);
      else beginNight(s, chatId);
    }, i === 0 ? INTRO_FIRST_MS : INTRO_INTERVAL_MS);
    if (!introTimers.has(chatId)) introTimers.set(chatId, []);
    introTimers.get(chatId).push(t);
  };
  step(0);
}

function butlerOf(g) {
  return g.players.find((p) => p.role === 'BUTLER') || null;
}

// the killer's butler line (owner 2026-10-13: the killer knows the butler from the start)
function killerButlerLine(g, prefix) {
  const b = butlerOf(g);
  if (!b) return '';
  return `\nThe house's butler: *${nameOf(b)}* - know their face from the first night. The keys serve every side.`;
}

function roleCardCaption(p, g, partnerOf) {
  const prefix = g.prefix;
  const partner = partnerOf ? partnerOf(p) : null;
  if (p.role === 'KILLER') {
    const partnerLine = partner ? `\nYour partner in the dark: *${nameOf(partner)}* - you know each other, and you share one kill per night. Either of you may strike; their choice stands.\n(At night, in your DMs: \`${prefix} mm whisper <message>\` reaches your partner.)` : '';
    return `🔪 You are THE KILLER.${partnerLine}${killerButlerLine(g, prefix)}\nEach night, choose a guest to eliminate - then choose the room where the body lies.\nYour identity is secret - even from the dead.\n(At night, in this chat: \`${prefix} mm kill <n>\`, then \`${prefix} mm room <n>\`.)`;
  }
  if (p.role === 'INVESTIGATOR') {
    return `🕵️ You are AN INVESTIGATOR.\nEach night you may lay two guests on the scales - and learn which one unsettles the house more. A lean, never a verdict.\nThree weighings per case - spend them well.\n(At night, in this chat: \`${prefix} mm compare <n> <n>\`.)`;
  }
  if (p.role === 'GUARDIAN') {
    return `👼 You are THE GUARDIAN.\nEach night you may watch over one guest - or yourself. If the knife comes for them, it will be turned away, and no one will know why.\n(At night, in this chat: \`${prefix} mm protect <n|me>\`.)`;
  }
  if (p.role === 'MEDIUM') {
    return `🕯️ You are THE MEDIUM.\nTwice this case you may part the veil - \`${prefix} mm seance\` in the group - and the dead may speak again. Their words reach your DMs alone; the house hears only what you choose to repeat.\nChoose your moments. The dead do not forget who let them talk.`;
  }
  if (p.role === 'BUTLER') {
    return `🗝️ You are THE BUTLER.\nYou know every corridor of this house - and on the third night, the manor will tell you the name behind the knife.\nBut the killer learned YOUR name the day you arrived. Survive long enough to use what you learn.`;
  }
  if (p.role === 'ACCOMPLICE') {
    return `🎭 You are THE ACCOMPLICE.\nYou cannot kill, and you carry no clue. But if the killer wins, you win with them - the manor pays you beside the knife.\nNobody knows your heart. Not even the killer. Steer the vote. Defend the wrong people.`;
  }
  return `👤 You are A CIVILIAN.\nYou have no special ability - only your wits.\nDiscuss. Search. Accuse. Vote. Survive.`;
}

function textRoleCard(p, g, partnerOf) {
  const head = `${cases.MANOR_NAME}\n\n${nameOf(p).toUpperCase()}, you play ${p.char.name}, ${p.char.title}.\n\n`;
  const partner = partnerOf ? partnerOf(p) : null;
  if (p.role === 'KILLER') {
    const partnerLine = partner ? `\nYour partner: *${nameOf(partner)}*. You share one kill per night - either of you may choose the victim.` : '';
    return `🔪 *${head}*YOU ARE THE KILLER.*${partnerLine}${killerButlerLine(g)}\nEliminate the guests night after night - and choose where each body lies. Survive the discussion. Dodge the vote.\n\nYour identity is secret. Tell no one.`;
  }
  if (p.role === 'INVESTIGATOR') {
    return `🕵️ *${head}*YOU ARE AN INVESTIGATOR.*\nEach night you may weigh two guests against each other - and learn which one the house finds more suspicious. A lean, never a verdict.\nThree weighings per case. The result is yours alone.\n\nKeep it secret. Spend it wisely.`;
  }
  if (p.role === 'GUARDIAN') {
    return `👼 *${head}*YOU ARE THE GUARDIAN.*\nEach night, watch over one guest - or yourself. If the killer comes for them, you turn the knife away. Nobody will know.\n\nStay secret. Stay watchful.`;
  }
  if (p.role === 'MEDIUM') {
    return `🕯️ *${head}*YOU ARE THE MEDIUM.*\nTwice this case you may part the veil (\`${g.prefix} mm seance\` in the group) and let the dead speak. Their words cross the dark and land in your DMs alone.\n\nThe house hears only what you choose to repeat.`;
  }
  if (p.role === 'BUTLER') {
    return `🗝️ *${head}*YOU ARE THE BUTLER.*\nYou know every corridor of this house. On the third night the manor will whisper the killer's name in your ear.\n\nBut the killer already knows your face. Survive.`;
  }
  if (p.role === 'ACCOMPLICE') {
    return `🎭 *${head}*YOU ARE THE ACCOMPLICE.*\nYou cannot kill and you carry no clue - but if the killer wins, you win with them.\n\nNobody knows your heart, not even the killer. Steer the house astray.`;
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
  g.nightActs = {}; // per-player action ledger (each investigator acts alone)
  g.votes = {};
  g.extendedTonight = false;
  g.visits = { night: g.night, picks: {} }; // Wave 2b: fresh wander ledger each night
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

  // private night instructions - priority actors first, so their window is as long as possible
  const killerTeam = alivePlayers(g).filter((p) => p.role === 'KILLER');
  const butlerKnown = butlerOf(g);
  for (const p of alivePlayers(g)) {
    if (p.role === 'KILLER') {
      const roster = rosterLines(g, p.jid).join('\n');
      const partner = killerTeam.length > 1 ? nameOf(killerTeam.find((x) => normJid(x.jid) !== normJid(p.jid))) : null;
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nYou are the *KILLER*.${partner ? `\nYour partner: *${partner}* - one kill per night between you. Either of you may choose; their choice stands.\nCoordinate in the dark: \`${g.prefix} mm whisper <message>\` - it reaches your partner's DMs through the bot.` : ''}${butlerKnown ? `\nThe butler, *${nameOf(butlerKnown)}*, already serves your secrets - their face was yours to know from the first night.` : ''}\nChoose tonight's victim:\n\n${roster}\n\n` +
        `\`${g.prefix} mm kill <number>\` - or a name.\nAfter the kill you will choose the room where the body lies.\n⏱️ The night lasts *four minutes*.\n\nBefore dawn you may also slip away: \`${g.prefix} mm visit <number|room>\` - letters and keepsakes wait in the dark.`);
    } else if (p.role === 'INVESTIGATOR') {
      const roster = rosterLines(g, p.jid).join('\n');
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nYou are the *INVESTIGATOR*.\nLay two guests on the scales:\n\n${roster}\n\n` +
        `\`${g.prefix} mm compare <number> <number>\` - two different guests, never you.\nThe scales tell you which one unsettles the house more - a lean, never a verdict.\nWeighings left this case: *${p.compLeft == null ? COMPARE_BUDGET : p.compLeft}*.\n⏱️ The night lasts *four minutes* - do not let dawn take your chance.\n\nYou may also slip away: \`${g.prefix} mm visit <number|room>\` - one room, before dawn.`);
    } else if (p.role === 'GUARDIAN') {
      const roster = rosterLines(g, null, p.jid).join('\n');
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nYou are the *GUARDIAN*.\nChoose one guest to watch over - or yourself:\n\n${roster}\n\n` +
        `\`${g.prefix} mm protect <number|me>\`\nIf the knife comes for them tonight, it will be turned away.\n⏱️ The night lasts *four minutes*.\n\nYou may also slip away: \`${g.prefix} mm visit <number|room>\` - one room, before dawn.`);
    } else if (p.role === 'BUTLER') {
      const hintLine = g.night < BUTLER_REVEAL_NIGHT
        ? `The manor keeps its secrets - for now. On the *third night*, it will tell you the name behind the knife.`
        : `The name was given to you on the third night. Spend it carefully - the house is listening to every seat.`;
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nYou are the *BUTLER*. You have no action in the dark.\n${hintLine}\nLock up. Polish the silver. Survive.\n\nOr slip away: \`${g.prefix} mm visit <number|room>\` - one room, before dawn. Letters and keepsakes wait in the dark.`);
    } else if (p.role === 'MEDIUM') {
      const veilLine = (p.seanceLeft == null ? SEANCE_BUDGET : p.seanceLeft) > 0
        ? `No action in the dark - but when the house wakes, you may part the veil: \`${g.prefix} mm seance\` in the group (${p.seanceLeft == null ? SEANCE_BUDGET : p.seanceLeft} left this case).`
        : `No action in the dark. The veil has spent itself for this case - the dead sleep, and so do you.`;
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nYou are the *MEDIUM*.\n${veilLine}\n\nYou may also slip away: \`${g.prefix} mm visit <number|room>\` - one room, before dawn. Letters and keepsakes wait in the dark.`);
    } else if (p.role === 'ACCOMPLICE') {
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nYou are the *ACCOMPLICE*. You have no action, no clue, no knife.\nYour work happens in daylight: steer the vote, defend the wrong people, look as innocent as you feel.\nIf the killer wins - so do you.\n\nYou may also slip away: \`${g.prefix} mm visit <number|room>\` - one room, before dawn. Letters and keepsakes wait in the dark.`);
    } else {
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nYou have no action tonight.\nLock your door. Wait for morning.\n\nOr slip away: \`${g.prefix} mm visit <number|room>\` - one room, before dawn. Letters and keepsakes wait in the dark.`);
    }
    await sleep(400);
  }

  // ---- butler's third-night confidence (owner 2026-10-13: "the butler learns
  // the name of the killer automatically on the third night BUT the killer
  // knows who the butler is from the start") - one name, even with twin killers ----
  if (g.night === BUTLER_REVEAL_NIGHT) {
    const butler = butlerOf(g);
    const mark = (g.players.find((p) => p.role === 'KILLER') || null);
    if (butler && butler.alive && mark) {
      await sleep(600);
      let sent = false;
      try {
        const buf = await cards.renderButlerRevealCard({
          butlerChar: butler.char,
          killerChar: mark.char,
          killerName: nameOf(mark),
          night: g.night,
          manorName: cases.MANOR_NAME,
        });
        if (buf) {
          sent = await sendDMImage(sock, butler.jid, buf,
            `🗝️ *NIGHT ${g.night} - the third night.*\n\nThe manor keeps its books, and tonight they balanced. The name behind the knife: *${nameOf(mark)}* - ${mark.char.name}, ${mark.char.title}.\n\nThe killer has known YOUR name since the doors locked. Spend this one carefully.`);
        } else throw new Error('butler reveal render null');
      } catch (e) {
        await sendDM(sock, butler.jid,
          `🗝️ *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nOn the third night the manor pays its debts. The name behind the knife: *${nameOf(mark)}* - ${mark.char.name}, ${mark.char.title}.\n\nThe killer has known your face since the doors locked. Spend this carefully.`);
      }
      console.log(`🔪 [MurderMystery] NIGHT ${g.night}: butler reveal sent to ${normJid(butler.jid)} (killer=${normJid(mark.jid)})`);
    }
  }
}

// ---------- killer: choose victim, then the room ----------
async function submitKill(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  // night actions belong in DMs - a group typing of this would out the sender
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  const phaseOk = g && g.phase === PHASE.NIGHT;
  console.log(`🔪 [MurderMystery] mm kill try jid=${normJid(senderJid)} hasGame=${!!g} phase=${g ? g.phase : '-'} accepted=${phaseOk ? 'pending' : 'no'}`);
  if (!phaseOk) return sendGroup(sock, chatId, `${botMarker}🌙 There is no open night to act in.${g && (g.phase === PHASE.DISCUSSION || g.phase === PHASE.VOTING) ? ' Dawn already broke - your chance will return with the next night (four minutes long).' : ''}`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🌙 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🌙 The dead do not kill. Rest.`);
  if (me.role !== 'KILLER') return sendGroup(sock, chatId, `${botMarker}🌙 Only the killer acts on the night. And you are - presumably - not them.`);
  if (g.killerTargetJid) {
    const partner = g.players.find((x) => x.role === 'KILLER' && normJid(x.jid) !== normJid(senderJid));
    return sendGroup(sock, chatId, `${botMarker}🌙 The knife has already been chosen tonight${partner && killerChose(g, partner) ? ` (by your partner, ${nameOf(partner)})` : ''}. Now choose the room: \`${g.prefix} mm room <number>\`.`);
  }

  const target = resolveRosterTarget(g, rawTarget, senderJid);
  if (!target) {
    const roster = rosterLines(g, senderJid).join('\n');
    return sendGroup(sock, chatId, `${botMarker}🌙 Choose a *living* guest who is not you:\n\n${roster}\n\n\`${g.prefix} mm kill <number>\``);
  }

  g.killerTargetJid = target.jid;
  g.nightActs = g.nightActs || {};
  g.nightActs[normJid(senderJid)] = { type: 'kill', targetJid: target.jid };
  persistGames();
  await sendGroup(sock, chatId, `${botMarker}🌙 The knife is raised. Now choose where *${nameOf(target)}* will be found…`);

  // room choice - the strategic half of the kill
  let sent = false;
  try {
    const buf = await cards.renderRoomChoiceCard({
      rooms: g.rooms,
      victimName: nameOf(target),
      night: g.night,
      manorName: cases.MANOR_NAME,
    });
    if (buf) sent = await sendDMImage(sock, senderJid, buf,
      `🔪 *${nameOf(target)}* will not see dawn - if you finish the deed.\n\nChoose the room where the body lies:\n\n${roomListOf(g)}\n\n\`${g.prefix} mm room <number>\` - the room changes what the searching finds, and how sharp the ghost's clue is.`);
  } catch (e) { /* text fallback */ }
  if (!sent) {
    await sendDM(sock, senderJid,
      `🔪 *${nameOf(target)}* will not see dawn - if you finish the deed.\n\nChoose the room where the body lies:\n\n${roomListOf(g)}\n\n\`${g.prefix} mm room <number>\``);
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
  if (g.killerRoomIdx != null) {
    const partner = g.players.find((x) => x.role === 'KILLER' && normJid(x.jid) !== normJid(senderJid));
    return sendGroup(sock, chatId, `${botMarker}🌙 The body is already placed${partner && killerChose(g, partner) ? ` by your partner, ${nameOf(partner)}` : ''}. Sleep now - dawn is coming.`);
  }

  const hit = resolveRoom(g, raw);
  if (!hit) {
    return sendGroup(sock, chatId, `${botMarker}🌙 Choose a room:\n\n${roomListOf(g)}\n\n\`${g.prefix} mm room <number>\``);
  }
  g.killerRoomIdx = hit.idx;
  g.nightActs = g.nightActs || {};
  g.nightActs[normJid(senderJid)] = { type: 'room', roomIdx: hit.idx };
  persistGames();
  await sendGroup(sock, chatId, `${botMarker}🌙 The body lies in *${hit.room.name}*. Now… sleep.`);
  console.log(`🔪 [MurderMystery] killer placed body room=${hit.room.id}`);
  maybeResolveNight(sock || getSockSafe(), gameChatIdOf(g));
}

// did this killer player take part in tonight's kill (first submitter wins)
function killerChose(g, p) {
  const a = g.nightActs && g.nightActs[normJid(p.jid)];
  return !!(a && (a.type === 'kill' || a.type === 'room'));
}

// legacy habit - the single-target study was removed (owner 2026-10-12:
// "let's nerf investigator... they can compare 2 characters and see if one
// is more likely to be the killer than another"). The old command stays
// alive as an in-world rule-change notice so muscle memory is not punished
// with silence.
async function submitInvestigate(ctx, _rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const g = findGameForPlayer(senderJid);
  const prefix = (g && g.prefix) || ctx.prefix || '.j';
  return sendGroup(sock, chatId, `${botMarker}🕯️ The house changed the rules of the candle: you no longer point at a single guest. Lay *two* side by side instead - \`${prefix} mm compare <number> <number>\` - and the scales tell you which one unsettles the house more.`);
}

// ---------- investigator: the scales (pairwise weighings) ----------
// The old study was a deterministic KILLER/CLEAN read - one question a night
// that nearly solved the case for the table. The replacement is directional
// only: two guests on the scales, the house's unease between them. Scores are
// derived from the case truth (motive web, secrets) and memoized per game so
// re-weighing the same pair never flips its answer. Never a role, never proof.
const COMPARE_BUDGET = 3;        // pairings per investigator per case
const COMPARE_STRONG_GAP = 26;   // gap >= this: a clear lean
const COMPARE_SOFT_GAP = 12;     // gap >= this: a hunch; below: too close to call
const COMPARE_FLAVOR = [
  'The candle holds its breath.',
  'The scales swing once, then settle.',
  'The manor keeps its arithmetic to itself.',
  'Whatever the truth is, it is not ready to be spoken.',
];

function ensureSusScores(g) {
  if (g.susScores && Object.keys(g.susScores).length) return g.susScores;
  const kase = g.case || {};
  const webCount = {};
  for (const w of (kase.web || [])) {
    webCount[w.a] = (webCount[w.a] || 0) + 1;
    webCount[w.b] = (webCount[w.b] || 0) + 1;
  }
  const killerIds = new Set(g.players.filter((p) => p.role === 'KILLER').map((p) => p.char && p.char.id));
  const scores = {};
  for (const p of g.players) {
    const id = p.char && p.char.id;
    if (!id) continue;
    let s;
    if (killerIds.has(id)) {
      s = 54 + (webCount[id] ? 6 : 0) + Math.floor(Math.random() * 15); // 54-74: top of the table, never announced
    } else {
      s = 12 + (webCount[id] ? 8 : 0) + (kase.secrets && kase.secrets[id] ? 9 : 0) + Math.floor(Math.random() * 17); // 12-45: suspicious, still innocent
    }
    scores[id] = Math.max(5, Math.min(84, s));
  }
  g.susScores = scores;
  return scores;
}

async function submitCompare(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  const phaseOk = g && g.phase === PHASE.NIGHT;
  console.log(`🔪 [MurderMystery] mm compare try jid=${normJid(senderJid)} hasGame=${!!g} phase=${g ? g.phase : '-'} accepted=${!!phaseOk}`);
  if (!phaseOk) return sendGroup(sock, chatId, `${botMarker}🌙 There is no open night to weigh guests in.${g && (g.phase === PHASE.DISCUSSION || g.phase === PHASE.VOTING) ? ' Dawn already broke - your next chance comes with the next night (four minutes long). Act early.' : ''}`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🌙 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🌙 The dead weigh nothing. Rest.`);
  if (me.role !== 'INVESTIGATOR') return sendGroup(sock, chatId, `${botMarker}🌙 You have no badge, no candle, and no scales to carry.`);
  if ((me.compLeft == null ? COMPARE_BUDGET : me.compLeft) <= 0) {
    return sendGroup(sock, chatId, `${botMarker}🌙 You have laid every pairing you can bear on the scales. The house grants an investigator *three* weighings per case - they are spent.`);
  }
  // per-investigator ledger: one weighing per night (legacy 'investigate'
  // acts belong to in-flight pre-nerf games and count as tonight's action)
  g.nightActs = g.nightActs || {};
  const myAct = g.nightActs[normJid(senderJid)];
  if (myAct && (myAct.type === 'compare' || myAct.type === 'investigate')) return sendGroup(sock, chatId, `${botMarker}🌙 You have already spent tonight's weighing.`);

  const tokens = String(rawTarget || '').split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const a = tokens.length >= 1 ? resolveRosterTarget(g, tokens[0], senderJid) : null;
  const b = tokens.length >= 2 ? resolveRosterTarget(g, tokens[1], senderJid) : null;
  if (!a || !b || normJid(a.jid) === normJid(b.jid)) {
    const roster = rosterLines(g, senderJid).join('\n');
    return sendGroup(sock, chatId,
      `${botMarker}🌙 Lay *two different living* guests on the scales:\n\n${roster}\n\n\`${g.prefix} mm compare <number> <number>\` - two numbers from this list.`);
  }

  me.compLeft = (me.compLeft == null ? COMPARE_BUDGET : me.compLeft) - 1;
  g.nightActs[normJid(senderJid)] = { type: 'compare', aJid: a.jid, bJid: b.jid };

  const scores = ensureSusScores(g);
  const sa = scores[a.char.id] != null ? scores[a.char.id] : 30;
  const sb = scores[b.char.id] != null ? scores[b.char.id] : 30;
  const gap = Math.abs(sa - sb);
  const leanP = sa >= sb ? a : b;
  const otherP = sa >= sb ? b : a;
  const nameA = nameOf(a);
  const nameB = nameOf(b);
  let verdictShort;
  let resultLine;
  if (gap >= COMPARE_STRONG_GAP) {
    verdictShort = `leans hard toward ${nameOf(leanP)}`;
    resultLine = `🕯️ Everything about *${nameOf(leanP)}* itches. Set against *${nameOf(otherP)}*, it is ${nameOf(leanP)} the house should watch.`;
  } else if (gap >= COMPARE_SOFT_GAP) {
    verdictShort = `leans toward ${nameOf(leanP)}`;
    resultLine = `🌙 If the candle must be bet on one, it flickers toward *${nameOf(leanP)}* over *${nameOf(otherP)}* - a hunch, not a verdict.`;
  } else {
    verdictShort = 'too close to call';
    resultLine = `🌫️ Too close to call - nothing in tonight's dark separates *${nameA}* from *${nameB}*. The scales refuse to tip.`;
  }

  g.investResults.push({ night: g.night, subject: `${nameA} vs ${nameB}`, verdict: verdictShort, by: nameOf(me) });
  // the investigator's private knowledge ledger (feeds .j mm evidence)
  g.privKnowledge = g.privKnowledge || {};
  g.privKnowledge[normJid(senderJid)] = g.privKnowledge[normJid(senderJid)] || [];
  g.privKnowledge[normJid(senderJid)].push({ kind: 'comparison', night: g.night, text: `You weighed ${nameA} against ${nameB}: ${verdictShort}. (${me.compLeft} weighing${me.compLeft === 1 ? '' : 's'} left)` });
  persistGames();
  console.log(`🔪 [MurderMystery] compare accepted night=${g.night} a=${normJid(a.jid)} b=${normJid(b.jid)} gap=${gap} left=${me.compLeft}`);

  const flavor = cases.pick(COMPARE_FLAVOR);
  await sendDM(sock, senderJid,
    `🕵️ *THE SCALES - NIGHT ${g.night}*\n\n*${nameA}* (${a.char.name})\n— against —\n*${nameB}* (${b.char.name})\n\n${resultLine}\n\n_${flavor}_\n\nPairings left this case: *${me.compLeft}*. Keep it secret.`);
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
    return sendGroup(sock, chatId, `${botMarker}🌙 Choose one guest - or yourself:\n\n${roster}\n\n\`${g.prefix} mm protect <number|me>\``);
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

// resolve as soon as the killer team (victim + room) and EVERY living investigator have acted - never depends on submission order
function maybeResolveNight(sock, chatId) {
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.NIGHT || g._resolving) return;
  const killerDone = !!g.killerTargetJid && g.killerRoomIdx != null;
  const invs = livingInvestigators(g);
  const investDone = invs.length === 0 || invs.every((inv) => invActedTonight(g, inv));
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

  // Wave 2b: guests who never picked a room are placed somewhere random at
  // dawn (AFK = they still wandered somewhere). Random placements get no
  // pings and no letters - they exist so every alibi conversation starts
  // from the same map without punishing the idle.
  if (!g.visits || g.visits.night !== g.night) g.visits = { night: g.night, picks: {} };
  for (const p of alivePlayers(g)) {
    const nj = normJid(p.jid);
    if (g.visits.picks[nj] == null) g.visits.picks[nj] = Math.floor(Math.random() * Math.max(1, (g.rooms || []).length));
  }
  persistGames();

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
    g.saves = g.saves || []; // ledger: the guardian earns credit for this save
    g.saves.push({ guardianJid: guardian.jid, savedJid: victim.jid, night: g.night });
    console.log(`🔪 [MurderMystery] NIGHT ${g.night}: kill on ${normJid(victim.jid)} BLOCKED by guardian`);
    persistGames();

    // private DMs: guardian, saved player, killer
    await sleep(800);
    await sendDM(sock, guardian.jid, `👼 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\n${cases.GA_SAVE_GA.replace('{name}', nameOf(victim))}`);
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
      await sendDM(sock, victim.jid, `👼 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\n${cases.pick(cases.GA_SAVED_DREAM)}`);
    }
    const killerP = g.players.find((p) => p.role === 'KILLER');
    if (killerP) await sendDM(sock, killerP.jid, `🔪 *NIGHT ${g.night}*\n\n${cases.pick(cases.GA_KILLER_BLOCKED)}`);
  } else if (victim && victim.alive && (victim.items || []).includes('talisman')) {
    // ---- the iron turns the knife (Wave 2b keepsake, owner 2026-10-13) ----
    outcome = 'talisman';
    victim.items = victim.items.filter((it) => it !== 'talisman');
    morningLine = 'Something iron shattered in the dark. By morning every door was still locked and every guest still breathing.';
    g.log.push({ night: g.night, talisman: nameOf(victim) });
    persistGames();
    console.log(`🔪 [MurderMystery] NIGHT ${g.night}: kill on ${normJid(victim.jid)} TURNED by iron talisman`);
    await sleep(800);
    await sendDM(sock, victim.jid, `🧲 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nSomething came for you in the dark - and broke against the old iron in your pocket.\nThe talisman is spent: cold dust in your palm. You are alive. Tell no one why.`);
    for (const k of g.players.filter((p) => p.role === 'KILLER' && p.alive)) {
      await sendDM(sock, k.jid, `🔪 *NIGHT ${g.night}*\n\nThe blade turned. Iron dust on your glove - your mark lives, and does not know how lucky they are.\nOne kill per night - tonight's is spent.`);
    }
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
    // Wave 2b: the killer's own wander that night - the ghost saw it pass.
    // Prefer the killer who actually performed the kill (twin-killer games).
    try {
      const killAct = Object.entries(g.nightActs || {}).find(([, a]) => a && a.type === 'kill');
      const kJid = (killAct && killAct[0]) || normJid((g.players.find((p) => p.role === 'KILLER') || {}).jid || '');
      g.bodies[g.bodies.length - 1].killerVisitIdx = (kJid && g.visits.picks[kJid] != null) ? g.visits.picks[kJid] : null;
    } catch (e) {
      g.bodies[g.bodies.length - 1].killerVisitIdx = null;
    }
    // bind the case's evidence to this murder (owner expansion 2026-10-12):
    // public layers stay ambiguous; the sharper finder layer is drawn privately
    try {
      const ev = caseGen.bindEvidence({
        kase: g.case,
        cast: g.players.map((p) => p.char),
        killerCharIds: g.players.filter((p) => p.role === 'KILLER').map((p) => p.char.id),
        livingCharIds: alivePlayers(g).map((p) => p.char.id),
        room: (g.rooms[roomIdx] || {}).id,
        method: method.title,
        hour,
      });
      g.bodies[g.bodies.length - 1].evidence = ev ? ev.public : [];
      g.bodies[g.bodies.length - 1].finderEv = ev ? ev.finder : null;
    } catch (e) {
      g.bodies[g.bodies.length - 1].evidence = [];
      g.bodies[g.bodies.length - 1].finderEv = null;
    }
    g.log.push({ night: g.night, victim: nameOf(victim), method: method.title, room: (g.rooms[roomIdx] || {}).name || 'the manor' });
    silence(chatId, victim.jid);
    persistGames();
    console.log(`🔪 [MurderMystery] NIGHT ${g.night}: ${normJid(victim.jid)} murdered, body in room idx=${roomIdx}`);

    // the dead learn of their state in private - the house does not know yet
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
      await sendDM(sock, victim.jid, `☠️ *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nYou were murdered in the night - ${method.title}, in ${g.rooms[roomIdx] ? g.rooms[roomIdx].name : 'the manor'}.\n\nThe house does not know yet. Your voice is lost to the living. You watch now.`);
    }

    // killer may have just reached parity
    const w = checkWin(g);
    if (w) return declareWinner(sock, chatId, w);
  } else if (watchedJid) {
    // the guardian kept a watch but the knife never came for their ward
    const ward = getPlayer(g, watchedJid);
    await sleep(600);
    await sendDM(sock, guardian.jid, `👼 *NIGHT ${g.night} - ${cases.MANOR_NAME}*\n\nYour watch held${ward ? ` over ${nameOf(ward)}` : ''}, and the knife never came. Stand again tomorrow, if you dare.`);
  }

  // restart-mid-resolution heal: a murder was persisted earlier tonight (bot
  // restarted during the slow card/DM section) but this pass saw no kill -
  // the morning must still tell the house someone died
  const unfoundTonight = (g.bodies || []).find((b) => b.night === g.night);
  if (outcome === 'quiet' && unfoundTonight) {
    outcome = 'murder';
    morningLine = cases.pick(cases.MORNING_MURDER_LINES);
    console.log(`🔪 [MurderMystery] NIGHT ${g.night}: morning healed after mid-resolution restart (unfound body present)`);
  }

  // ---- night traces (owner 2026-10-12: "killers must still be able to leave
  // clues even if a guardian saves their target or they don't perform an
  // action" + "increase the number of clues that spawn in rooms, even if
  // nothing happened the night before") - EVERY night seeds case-tied traces
  // into the rooms, whatever happened in the dark ----
  if (g.case) {
    try {
      const tonightBody = (g.bodies || []).find((b) => b.night === g.night);
      const spentItems = [];
      for (const b of (g.bodies || [])) {
        if (b.night !== g.night || !Array.isArray(b.evidence)) continue;
        for (const ev of b.evidence) { if (ev && ev.itemId) spentItems.push(ev.itemId); }
      }
      g.nightTraces = {
        night: g.night,
        items: caseGen.seedNightTraces({
          kase: g.case,
          cast: g.players.map((p) => p.char),
          livingCharIds: alivePlayers(g).map((p) => p.char.id),
          killerCharIds: g.players.filter((p) => p.role === 'KILLER' && p.alive).map((p) => p.char.id),
          rooms: g.rooms,
          outcome,
          killerRoomIdx: g.killerRoomIdx != null ? g.killerRoomIdx : null,
          bodyRoomIdx: tonightBody ? tonightBody.roomIdx : null,
          usedItemIds: spentItems,
        }),
      };
      console.log(`🔪 [MurderMystery] NIGHT ${g.night}: ${g.nightTraces.items.length} room traces seeded (outcome=${outcome})`);
    } catch (e) {
      g.nightTraces = { night: g.night, items: [] };
      console.error('🔪 [MurderMystery] trace seeding failed:', e.message);
    }
    persistGames();
  }
  const tracesUp = (g.nightTraces && g.nightTraces.night === g.night && g.nightTraces.items.length) || 0;

  // ---- public morning card (never names the victim - the body must be found) ----
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
        `☀️ *DAWN - NIGHT ${g.night}*\n\n${outcome === 'murder' ? 'A murder was committed in the night. The body has *not* been found.' : outcome === 'saved' ? 'Someone almost died last night. No one did.' : 'No one died last night.'}\n\n` +
        `🔍 Every living guest may search *one* room before the vote: \`${g.prefix} mm search <number|room>\` - in the group or in your DMs.` +
        (tracesUp ? `\n🌑 The night left things behind in the rooms - turn them over well.` : ''));
    } else throw new Error('morning render null');
  } catch (e) {
    await sendGroup(sock, chatId,
      `☀️ *DAWN - NIGHT ${g.night}*\n\n${morningLine}\n\n` +
      `${outcome === 'murder' ? 'A murder was committed in the night. The body has *not* been found.' : outcome === 'saved' ? 'Someone almost died last night. No one did.' : 'No one died last night.'}\n\n` +
      `The rooms of the manor:\n${roomListOf(g)}\n\n🔍 Every living guest may search *one* room: \`${g.prefix} mm search <number|room>\`.` +
      (tracesUp ? `\n🌑 The night left things behind in the rooms - turn them over well.` : ''));
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
  // reminder fires 60s BEFORE the deadline (2026-10-12 fix: it used to fire
  // 60s AFTER the phase began, announcing "ONE minute" with four minutes left)
  scheduleReminder(chatId, Math.max(5000, DISCUSS_MS - DISCUSS_REMIND_BEFORE_MS), 'discussion');
  ensureWatchdog();
  console.log(`🔪 [MurderMystery] DISCUSSION begins (night ${g.night}) in ${chatId}`);

  const prompt = cases.pick(cases.DISCUSSION_PROMPTS);
  const unfound = g.bodies.filter((b) => !b.found);
  const bodyNote = unfound.length
    ? `⚠️ ${unfound.length === 1 ? 'A body lies unfound' : `${unfound.length} bodies lie unfound`} in the manor.\n`
    : '';
  // critical: this is the message players act on - retry with the fallback sock if it fails
  await sendGroupCritical(g, chatId,
    `🗣️ *DISCUSSION*\n\n${prompt}\n\n` +
    `🏠 The house asks each of you: *which room were you in when the dark came - and what were you doing there?*\n` +
    `${bodyNote}` +
    `🔍 Each living guest may search *one* room before the vote: \`${g.prefix} mm search <number|room>\` - searches are public, the ghost's clue is not. \`${g.prefix} mm letters\` re-reads your fragments.\n` +
    `The vote begins when the clock runs out.\n⏱️ *5 minutes* remaining.\n\n` +
    `_Live status: \`${g.prefix} mm status\`_`);
}

// ---------- NIGHT VISITS + LETTERS (Wave 2b, owner 2026-10-13 09:59Z) ----------
// Every living guest may slip away to one room per night. Visits run INSIDE
// the night window (no new phase: the self-healing phase machine stays
// untouched); guests who never pick are placed randomly at dawn (AFK = they
// still wandered somewhere). Collision is PRESENCE-ONLY: two guests sharing a
// room are told someone else is there - never a name (names would mint free
// alibi pairs). The candle keepsake is the one paid reveal. AFK placements
// carry no letters and no pings - only deliberate visits pay out.
async function submitVisit(ctx, raw) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const g = ctx.isGroup ? getGame(chatId) : findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  if (!g || g.phase !== PHASE.NIGHT) {
    return sendGroup(sock, chatId, `${botMarker}🚪 There is no open night to wander in. Visits happen after dark, before dawn - in your DMs or here.`);
  }
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🚪 You are not on the guest list.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🚪 The dead do not wander. They watch.`);
  const n = normJid(senderJid);
  if (!g.visits || g.visits.night !== g.night) g.visits = { night: g.night, picks: {} };
  if (g.visits.picks[n] != null) {
    const where = g.rooms[g.visits.picks[n]];
    return sendGroup(sock, chatId, `${botMarker}🚪 You have already slipped away tonight${where ? ` (to the ${where.name})` : ''}. The next wander comes with the next night.`);
  }
  const hit = resolveRoom(g, raw);
  if (!hit) {
    return sendGroup(sock, chatId, `${botMarker}🚪 Choose a room to visit:\n\n${roomListOf(g)}\n\n\`${g.prefix} mm visit <number|room>\``);
  }
  g.visits.picks[n] = hit.idx;

  // ---- collision: presence-only, never a name ----
  const coVisitors = Object.entries(g.visits.picks)
    .filter(([nj, idx]) => nj !== n && idx === hit.idx)
    .map(([nj]) => g.players.find((p) => normJid(p.jid) === nj))
    .filter(Boolean);
  let collisionLine = '';
  if (coVisitors.length) {
    collisionLine = `\n\n👣 Halfway through the door you stop - *someone else is in the ${hit.room.name}.* You cannot see who. They cannot prove it was you.`;
    for (const other of coVisitors) {
      if (other.alive) {
        await sleep(500);
        await sendDM(sock, other.jid, `👣 Footsteps in the ${hit.room.name} - someone has just slipped in with you. You cannot see who. Presence, not a name.`);
      }
    }
  }

  // ---- candle keepsake: the one paid reveal (burns on use) ----
  let candleLine = '';
  if ((me.items || []).includes('candle')) {
    const names = coVisitors.filter((p) => p.alive).map((p) => nameOf(p));
    if (names.length) {
      me.items = me.items.filter((it) => it !== 'candle');
      candleLine = `\n\n🕯️ The candle stub flares - in its light you count faces: *${names.join('*, *')}* share your room. The stub burns out.`;
    }
  }

  // ---- the letter thread (sequential per player, one shared story) ----
  let letterLine = '';
  const pool = Array.isArray(g.letterPool) ? g.letterPool : [];
  if ((me.letters || 0) < pool.length) {
    const li = me.letters;
    me.letters = li + 1;
    letterLine = `\n\n📜 *Letter fragment ${li + 1} of ${pool.length}* - tucked in the ${hit.room.name}:\n_${pool[li]}_`;
  }

  // ---- keepsake roll (small, stock-limited; the coin sleeps until the 2c puzzles) ----
  let lootLine = '';
  try {
    const stock = g.lootPool && typeof g.lootPool === 'object' ? g.lootPool : { ...LOOT_STOCK };
    const available = Object.entries(stock).filter(([, c]) => c > 0);
    if (available.length && Math.random() < VISIT_LOOT_CHANCE) {
      const [item] = available[Math.floor(Math.random() * available.length)];
      stock[item] -= 1;
      g.lootPool = stock;
      me.items = me.items || [];
      me.items.push(item);
      if (item === 'talisman') lootLine = `\n\n🧲 *Keepsake found:* an iron talisman, cold as a confession. If the knife comes for you, it breaks instead of you. Once.`;
      else if (item === 'candle') lootLine = `\n\n🕯️ *Keepsake found:* a candle stub. Next time you walk into a room that is not empty, its light will name the faces. Once.`;
      else lootLine = `\n\n🪙 *Keepsake found:* an old coin, worn smooth. The manor's puzzles will want these, when the manor is ready. Keep it.`;
    }
  } catch (e) { /* loot must never break a visit */ }

  persistGames();
  console.log(`🔪 [MurderMystery] visit night=${g.night} by=${n} room=${hit.room.id}${coVisitors.length ? ` collision=${coVisitors.length}` : ''}${letterLine ? ' +letter' : ''}${lootLine ? ' +loot' : ''}`);

  await sendDM(sock, senderJid,
    `🚪 *NIGHT ${g.night} - the ${hit.room.name}*\n\n` +
    `You slip away from the candles and let the dark take the corridors. The ${hit.room.name} closes behind you.` +
    `${collisionLine}${candleLine}${letterLine}${lootLine}\n\n_What happened in that room is yours to tell - or to hide._`);
  if (ctx.isGroup) await sendGroup(sock, chatId, `${botMarker}🚪 The dark takes you. Check your DMs.`);
}

async function submitLetters(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const g = ctx.isGroup ? getGame(chatId) : findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  if (!g) return sendGroup(sock, chatId, `${botMarker}📜 No mystery is unfolding here.`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}📜 You are not on the guest list.`);
  const pool = Array.isArray(g.letterPool) ? g.letterPool : [];
  const have = Math.min(me.letters || 0, pool.length);
  if (!pool.length || !have) {
    await sendDM(sock, senderJid, `📜 *THE MANOR'S LETTERS*\n\nYou hold no fragments yet. Slip away to a room at night - \`${g.prefix} mm visit <number|room>\` - and the manor will start telling you why you are all here.`);
    if (ctx.isGroup) await sendGroup(sock, chatId, `${botMarker}📜 The manor's letters are a private matter - sent to your DMs.`);
    return;
  }
  const bodyTxt = pool.slice(0, have).map((t, i) => `*${i + 1}.* _${t}_`).join('\n\n');
  await sendDM(sock, senderJid,
    `📜 *THE MANOR'S LETTERS - ${have} of ${pool.length} fragments*\n\n${bodyTxt}\n\n_The missing pages are still hiding in the rooms._`);
  if (ctx.isGroup) await sendGroup(sock, chatId, `${botMarker}📜 The manor's letters are a private matter - sent to your DMs.`);
}

async function submitSearch(ctx, raw) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  // searches are PUBLIC now (user ask: everyone sees which room you search) -
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

  // ---- public search card to the GC - who searched which room, and what they found ----
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
    await sendGroup(sock, searchChatId, `${botMarker}🔍 ${nameOf(me)} searches ${hit.room.name} - and finds nothing.`);
  }

  if (found) {
    // ---- discovery: public body card + private ghost clue ----
    body.found = true;
    body.finderJid = senderJid;
    const victim = getPlayer(g, body.victimJid) || { char: characters.getCharacter('butler2'), name: body.victimName };

    // progressive, predetermined clue about the KILLER's character - never random
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
          `☠️ *${body.victimName} has been found dead in ${hit.room.name}* - found by *${nameOf(me)}*.\n\nThe ghost whispers to ${nameOf(me)} alone. Discuss - but wonder what they keep to themselves.`);
      }
    } catch (e) { /* text fallback */ }
    if (!cardOk) {
      await sendGroup(sock, searchChatId,
        `☠️ *A BODY IS FOUND - ${hit.room.name.toUpperCase()}*\n\n*${body.victimName} is dead* - ${body.method.title}.\nFound by *${nameOf(me)}*.\n\nThe ghost whispers to ${nameOf(me)} alone.`);
    }

    // the victim's last words are on the body - read aloud (new: wills)
    if (victim.will) {
      await sleep(900);
      await postWillCard(sock, searchChatId, victim, 'body');
    }

    // the finder's private clue (+ Wave 2b: the ghost's movement line - room,
    // never a name; owner 2026-10-13 "ghost can monitor the killers actions
    // without knowing who it is")
    let ghostMove = '';
    try {
      if (body.killerVisitIdx != null && g.rooms[body.killerVisitIdx]) {
        const mv = g.rooms[body.killerVisitIdx];
        ghostMove = body.killerVisitIdx === hit.idx
          ? `\n\n👁️ And quieter still: _"They never left the room where you fell. The killer lingered here, in the ${mv.name}."_`
          : `\n\n👁️ And quieter still: _"Before the end, the killer slipped through the ${mv.name}. I watched them pass."_`;
      }
    } catch (e) { ghostMove = ''; }
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
        await sendDMImage(sock, senderJid, buf, `👻 *THE GHOST WHISPERS - CLUE*\n\n_${clue}_${ghostMove}\n\nYou alone hold this. Reveal it, twist it, or keep it.`);
      }
    } catch (e) { /* text fallback */ }
    if (!clueOk) {
      await sendDM(sock, senderJid, `👻 *THE GHOST WHISPERS*\n\n_${clue}_${ghostMove}\n\n_${exhausted ? '' : `Clue tier ${tier + 1} - the deeper the hiding place, the sharper the memory._`}\nYou alone hold this. Reveal it, twist it, or keep it.`);
    }
    g.privKnowledge = g.privKnowledge || {};
    g.privKnowledge[n] = g.privKnowledge[n] || [];
    g.privKnowledge[n].push({ kind: 'ghost', night: body.night, text: `Ghost clue about the killer: "${clue}"` });

    // ---- case evidence (owner expansion 2026-10-12, MD §6): ----
    // public layer = ambiguous card(s) with real item art; the sharper finder
    // detail is PRIVATE and only lands ~60% of the time so it can never become
    // a guaranteed signal (MD: "do not give the finder a private extra clue
    // every single time")
    const pubEv = Array.isArray(body.evidence) ? body.evidence : [];
    for (const ev of pubEv) {
      await sleep(700);
      g.publicEvidence = g.publicEvidence || [];
      g.publicEvidence.push({ night: body.night, victimName: body.victimName, room: hit.room.name, name: ev.name, tag: ev.tag, line: ev.line, linkedCharId: ev.linkedCharId || null });
      let evOk = false;
      try {
        const evBuf = await cards.renderEvidenceCard({
          itemName: ev.name,
          art: ev.art,
          tag: ev.tag,
          line: ev.line,
          roomName: hit.room.name,
          night: body.night,
          manorName: cases.MANOR_NAME,
        });
        if (evBuf) {
          evOk = true;
          await sendGroupImage(sock, searchChatId, evBuf,
            `🔎 Found near the body in ${hit.room.name}: *${ev.name}*${ev.tag === 'confirmed' ? '' : ' - circumstantial'}. The house takes note.`);
        }
      } catch (e) { /* text fallback */ }
      if (!evOk) {
        await sendGroup(sock, searchChatId, `🔎 Found near the body in ${hit.room.name}: *${ev.name}*${ev.tag === 'confirmed' ? ' (confirmed)' : ' (circumstantial)'}\n_${ev.line}_`);
      }
    }
    // the finder's sharper private detail - sometimes
    if (body.finderEv && Math.random() < 0.6) {
      const fe = body.finderEv;
      await sleep(900);
      g.privKnowledge[n].push({ kind: 'finding', night: body.night, text: `While the others stared at the body you noticed: ${fe.line}` });
      persistGames();
      let fEvOk = false;
      try {
        const fBuf = await cards.renderEvidenceCard({
          itemName: `a private observation`,
          art: fe.art,
          tag: 'rumour',
          line: fe.line,
          roomName: hit.room.name,
          night: body.night,
          manorName: cases.MANOR_NAME,
        });
        if (fBuf) {
          fEvOk = true;
          await sendDMImage(sock, senderJid, fBuf, `🕯️ *YOU NOTICED WHAT OTHERS MISSED*\n\n_${fe.line}_\n\nReveal it, twist it, or keep it - the house saw only the item itself.`);
        }
      } catch (e) { /* text fallback */ }
      if (!fEvOk) {
        await sendDM(sock, senderJid, `🕯️ *YOU NOTICED WHAT OTHERS MISSED*\n\n_${fe.line}_\n\nReveal it, twist it, or keep it - the house saw only the item itself.`);
      }
    }
    persistGames();
    return;
  }

  // ---- room traces (owner 2026-10-12): every dawn seeds case-tied clues into
  // the rooms - a blocked killer still leaves an interrupted scene, and even a
  // quiet night moves the house. A search of a traced room always yields it. ----
  const tr = g.nightTraces && g.nightTraces.night === g.night ? g.nightTraces : null;
  const trIdx = tr ? (tr.items || []).findIndex((t) => !t.found && t.roomIdx === hit.idx) : -1;
  if (tr && trIdx >= 0) {
    const trace = tr.items[trIdx];
    trace.found = true;
    g.publicEvidence = g.publicEvidence || [];
    g.publicEvidence.push({ night: g.night, victimName: null, room: hit.room.name, name: trace.name, tag: trace.tag || 'rumour', line: trace.line, linkedCharId: trace.linkedCharId || null });
    persistGames();
    let tOk = false;
    try {
      const tBuf = await cards.renderEvidenceCard({ itemName: trace.name, art: trace.art, tag: trace.tag || 'rumour', line: trace.line, roomName: hit.room.name, night: g.night, manorName: cases.MANOR_NAME });
      if (tBuf) {
        tOk = true;
        await sendGroupImage(sock, searchChatId, tBuf, `🔎 ${nameOf(me)} turns up something in ${hit.room.name}… the night left it behind.`);
      }
    } catch (e) { /* text fallback */ }
    if (!tOk) {
      await sendGroup(sock, searchChatId, `🔎 ${nameOf(me)} turns up something in ${hit.room.name}: *${trace.name}* (circumstantial)\n_${trace.line}_`);
    }
    // the finder's sharper private detail - sometimes, never a guarantee
    if (trace.linkedCharId && trace.finderLine && Math.random() < 0.4) {
      const nn = normJid(senderJid);
      g.privKnowledge = g.privKnowledge || {};
      g.privKnowledge[nn] = g.privKnowledge[nn] || [];
      g.privKnowledge[nn].push({ kind: 'finding', night: g.night, text: `Searching ${hit.room.name} you noticed: ${trace.finderLine}` });
      persistGames();
      try {
        const fBuf = await cards.renderEvidenceCard({ itemName: 'a private observation', art: trace.art, tag: 'rumour', line: trace.finderLine, roomName: hit.room.name, night: g.night, manorName: cases.MANOR_NAME });
        if (fBuf) await sendDMImage(sock, senderJid, fBuf, `🕯️ *YOU NOTICED WHAT OTHERS MISSED*\n\n_${trace.finderLine}_\n\nReveal it, twist it, or keep it.`);
        else throw new Error('trace finder render null');
      } catch (e) {
        await sendDM(sock, senderJid, `🕯️ *YOU NOTICED WHAT OTHERS MISSED*\n\n_${trace.finderLine}_\n\nReveal it, twist it, or keep it.`);
      }
    }
    return;
  }

  // ---- legacy stray draw: an occasional find keeps even a bare room
  // interesting (up to two per day, ~35% per search, case rounds only) ----
  const strayUsed = g.strayDay === g.night ? (g.strayCount || 0) : 0;
  if (!found && g.case && strayUsed < 2 && Math.random() < 0.35) {
    g.strayDay = g.night;
    g.strayCount = strayUsed + 1;
    const living = alivePlayers(g);
    if (living.length) {
      const owner = living[Math.floor(Math.random() * living.length)];
      const item = (g.case.personalItems || {})[owner.char.id];
      if (item) {
        const line = `Left behind in ${hit.room.name}: ${item.name}. ${item.hint.charAt(0).toUpperCase() + item.hint.slice(1)} - and it does not belong to the room.`;
        g.publicEvidence = g.publicEvidence || [];
        g.publicEvidence.push({ night: g.night, victimName: null, room: hit.room.name, name: item.name, tag: 'rumour', line, linkedCharId: owner.char.id });
        persistGames();
        try {
          const sBuf = await cards.renderEvidenceCard({ itemName: item.name, art: item.art, tag: 'rumour', line, roomName: hit.room.name, night: g.night, manorName: cases.MANOR_NAME });
          if (sBuf) await sendGroupImage(sock, searchChatId, sBuf, `🔎 ${nameOf(me)} turns up something in ${hit.room.name}…`);
          else throw new Error('stray render null');
        } catch (e) {
          await sendGroup(sock, searchChatId, `🔎 ${nameOf(me)} turns up something in ${hit.room.name}: *${item.name}* (circumstantial)\n_${line}_`);
        }
      }
    }
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
  if (me.role !== 'KILLER') return sendGroup(sock, chatId, `${botMarker}🖤 The manor accepts only one kind of taunt - and it is not yours to give.`);
  if (g.tauntUsed) return sendGroup(sock, chatId, `${botMarker}🖤 The house has heard enough from the dark. One note per game.`);
  const text = sanitizePlayerText(raw, TAUNT_MAX_LEN);
  if (!text) {
    return sendGroup(sock, chatId, `${botMarker}🖤 Whisper something first: \`${g.prefix} mm taunt <message>\` - unsigned, once per game.`);
  }
  g.tauntUsed = true;
  persistGames();
  console.log(`🔪 [MurderMystery] killer taunt posted night=${g.night} (${text.length} chars)`);
  // anonymous - posted to the GROUP, never a name
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
  scheduleReminder(chatId, Math.max(3000, VOTE_MS - VOTE_REMIND_BEFORE_MS), 'vote');
  ensureWatchdog();
  console.log(`🔪 [MurderMystery] VOTING begins (${alivePlayers(g).length} alive) in ${chatId}`);

  const alive = alivePlayers(g);
  const roster = alive.map((p, i) => `  ${i + 1}. ${nameOf(p)}`).join('\n');
  // critical: this is the message the user said never arrived - retry with fallback sock
  await sendGroupCritical(g, chatId,
    `⚖️ *VOTING*\n\nWho do you believe is the Killer?\n\n${roster}\n\n` +
    `Cast your vote: \`${g.prefix} mm vote <number>\` - or a name - or \`skip\`.\n` +
    `Living players only. One ballot each. You may change it until the count. Ballots are public.\n⏱️ *90 seconds.*`);
}

async function castVote(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) {
    // voting is public - but a DM vote can still count if they're in exactly one game
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
  // race guard (2026-10-12): ballots must not mutate during the 1.5s
  // pre-resolution window - resolveVote reads the live g.votes
  if (g._resolving || g._resolving2) {
    return sendGroup(sock, chatId, `${botMarker}⚖️ The count is already underway - your ballot arrived too late.`);
  }
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
    console.log(`🔪 [MurderMystery] every ballot is in (${castCount}/${aliveCount}) in ${chatId} - resolving`);
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
    g.log.push({ night: g.night, condemned: nameOf(eliminated), condemnedJid: eliminated.jid });
    silence(chatId, eliminated.jid);
    // ledger: voters who named the killer correctly earn their sharp-vote credit
    if (eliminated.role === 'KILLER') {
      g.correctVoters = g.correctVoters || [];
      for (const [voterJid, choice] of Object.entries(g.votes || {})) {
        if (choice === eliminated.jid) g.correctVoters.push(normJid(voterJid));
      }
    }
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
      const tallyText = tally.map((t) => `${t.name} - ${t.votes} vote${t.votes === 1 ? '' : 's'}`).join('\n') + (skipVotes ? `\nskip - ${skipVotes}` : '');
      await sendGroupImage(sock, chatId, buf,
        `⚖️ *VOTE RESULT*\n\n${tallyText}\n\n${eliminated ? `*${nameOf(eliminated)} has been eliminated.*` : 'No one was condemned.'}\n\n🗳️ ${ballotText(g)}`);
    } else throw new Error('vote render null');
  } catch (e) {
    const tallyText = tally.map((t) => `• ${t.name} - ${t.votes}`).join('\n') + (skipVotes ? `\n• skip - ${skipVotes}` : '');
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

// public ballots - who voted for whom (new: open ballots)
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
// owner 2026-10-13: the ACCOMPLICE is the killer team's fifth column - their
// seat counts toward parity (the vote they cast is a real ballot), and they
// win beside the killers. All killers dead = the team is broken; the
// accomplice wins nothing alone (they cannot kill).
function killerTeamAlive(g) {
  return alivePlayers(g).filter((p) => p.role === 'KILLER' || p.role === 'ACCOMPLICE');
}

function checkWin(g) {
  const killers = aliveKillers(g).length;
  const team = killerTeamAlive(g).length;
  const others = alivePlayers(g).length - team;
  if (killers === 0) return 'civ';
  if (team >= others) return 'killer'; // parity: the killer can no longer be outvoted
  return null;
}

async function declareWinner(sock, chatId, winner) {
  const g = getGame(chatId);
  if (!g) return;
  if (g.phase === 'ENDED') return; // double-fire guard - one finale only
  clearTimers(chatId);
  g.phase = 'ENDED';

  const killers = g.players.filter((p) => p.role === 'KILLER');
  const killer = killers[0];
  const victims = g.log.flatMap((l) => [l.victim, l.condemned]).filter(Boolean);
  const survivors = alivePlayers(g).map(nameOf);
  const closing = cases.pick(winner === 'civ' ? cases.CIV_WIN_LINES : cases.KILLER_WIN_LINES);

  try {
    const buf = await cards.renderFinalCard({
      winner,
      killerChar: killer.char,
      killerName: killers.length > 1 ? killers.map(nameOf).join(' & ') : nameOf(killer),
      manorName: cases.MANOR_NAME,
      nightsSurvived: g.night,
      victims,
      survivors,
      closingLine: closing,
    });
    if (buf) {
      await sendGroupImage(sock, chatId, buf, finalCaption(g, winner, killers, survivors));
    } else throw new Error('final render null');
  } catch (e) {
    await sendGroup(sock, chatId, finalCaption(g, winner, killers, survivors));
  }

  // ---- the case, explained (owner expansion, MD §12 post-game report) ----
  if (g.case) {
    try {
      const kase = g.case;
      const truthLines = [];
      for (const b of (g.bodies || [])) {
        const room = g.rooms[b.roomIdx] || { name: 'the manor' };
        for (const ev of (b.evidence || [])) {
          if (ev.tag === 'confirmed') truthLines.push(`${ev.name} in ${room.name} was the method itself - ${b.method.title}.`);
          else if (ev.linkedCharId) {
            const owner = g.players.find((p) => p.char && p.char.id === ev.linkedCharId);
            truthLines.push(`${ev.name} belonged to ${owner ? nameOf(owner) : 'a guest'} - ${owner && owner.role === 'KILLER' ? 'the killer\u2019s slip, or their misdirection' : 'an innocent\u2019s secret that looked like guilt'}.`);
          }
        }
      }
      for (const [cid, st] of Object.entries(kase.statements || {})) {
        const owner = g.players.find((p) => p.char && p.char.id === cid);
        if (owner && owner.role === 'KILLER') truthLines.push(`${owner.char.name}'s account was the lie: "${st.account}"`);
      }
      const reportBuf = await cards.renderCaseReportCard({
        manorName: cases.MANOR_NAME,
        winner,
        motiveTitle: kase.motive ? kase.motive.title : '',
        motiveDetail: kase.motive ? kase.motive.detail : '',
        webFrames: (kase.web || []).map((w) => w.frame),
        truthLines,
        killerNames: killers.map(nameOf),
      });
      const reportText =
        `📋 *THE CASE, EXPLAINED*\n\n` +
        `Motive: *${kase.motive ? kase.motive.title : 'lost to the manor'}* - _${kase.motive ? kase.motive.detail : ''}_\n\n` +
        ((kase.web || []).map((w) => `• ${w.frame}`).join('\n') || '') +
        `\n\nThe killer${killers.length > 1 ? 's' : ''}: *${killers.map(nameOf).join(' & ')}*. The manor thanks you for playing.`;
      if (reportBuf) await sendGroupImage(sock, chatId, reportBuf, reportText);
      else await sendGroup(sock, chatId, reportText);
    } catch (e) {
      console.error('🔪 [MurderMystery] case report failed:', e.message);
    }
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

  // the all-time ledger remembers everyone (closed cases only)
  recordMatchStats(g, winner);

  // the manor pays the purse to the winning side (owner rule: a money PRIZE,
  // never an entry fee). Civ win: every non-killer shares the purse. Killer
  // win: the killer takes the whole purse. Legacy feePaid games (cast under
  // the old paid-entry rules) get their fee refunded here instead.
  try { await payPrize(sock, chatId, g, winner, killers); } catch (e) {
    console.error('🔪 [MurderMystery] prize payout failed:', e.message);
  }

  games.delete(chatId);
  persistGames();
  console.log(`🔪 [MurderMystery] game ended in ${chatId} - winner=${winner}`);
}

// split the manor's purse among the winners and announce every payout.
// addMoney failures (unresolvable JID / market cap) are reported in-line so
// the house never claims a payment it didn't make.
async function payPrize(sock, chatId, g, winner, killers) {
  const purse = g.prize || 0;
  if (!economy || purse <= 0) return;

  // legacy safety: a game started while the cast-fee rules were live may
  // still carry feePaid - return it to the host before anything else.
  if (g.feePaid) {
    try {
      economy.addMoney(g.feePaidBy || g.host, g.feePaid, 'Murder Mystery - manor refund (cast fee retired)');
    } catch (e) {}
  }

  const winners = winner === 'killer'
    ? g.players.filter((p) => (p.role === 'KILLER' || p.role === 'ACCOMPLICE') && p.alive) // living killer team shares the purse (owner 2026-10-13: the accomplice wins beside the knife)
    : g.players.filter((p) => p.role !== 'KILLER' && p.role !== 'ACCOMPLICE');
  if (!winners.length) return;

  const share = Math.floor(purse / winners.length);
  let remainder = purse - share * winners.length; // the manor rounds in the winners' favour
  const reason = winner === 'killer'
    ? 'Murder Mystery - manor prize (killer won)'
    : 'Murder Mystery - manor prize (innocents won)';

  const lines = [];
  for (const w of winners) {
    const amount = share + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    if (amount <= 0) continue;
    let ok = false;
    try { ok = !!economy.addMoney(w.jid, amount, reason); } catch (e) { ok = false; }
    lines.push(`  @${normJid(w.jid)} - *${fmtZeni(amount)} Zeni*${ok ? '' : ' ⚠️ (failed - ping a mod)'}`);
  }

  const headline = winner === 'killer'
    ? `💰 *THE MANOR PAYS* - the killer walks away with the purse:`
    : `💰 *THE MANOR PAYS* - *${fmtZeni(purse)} Zeni* split among the innocent guests:`;
  await sendGroup(sock, chatId, `${headline}\n${lines.join('\n')}`, {
    contextInfo: { mentionedJid: winners.map((w) => w.jid) },
  });
}

function finalCaption(g, winner, killers, survivors) {
  const victims = g.log.flatMap((l) => [l.victim, l.condemned]).filter(Boolean);
  const killerNames = (killers || []).map(nameOf).join(' & ');
  const killerDesc = (killers || []).map((k) => `${nameOf(k)} - ${k.char.name}, ${k.char.title}`).join(' · ');
  if (winner === 'civ') {
    return `🏆 *MYSTERY SOLVED*\n\n*${killerNames} ${killers.length > 1 ? 'were the Killers' : 'was the Killer'}* - ${killerDesc}.\n\n` +
      `Nights survived: ${g.night}\nLost: ${victims.length ? victims.join(', ') : 'no one'}\nSurvivors: ${survivors.join(', ') || 'none'}\n\n` +
      `The survivors win. The manor is quiet again - for now.`;
  }
  return `🔪 *THE KILLER WINS*\n\n*${killerNames} ${killers.length > 1 ? 'were the Killers' : 'was the Killer'}* - ${killerDesc}.\n\n` +
    `Nights survived: ${g.night}\nLost: ${victims.length ? victims.join(', ') : 'no one'}\nStill breathing: ${survivors.join(', ') || 'no one'}\n\n` +
    `Nobody was able to stop them.`;
}

// ============================================
// ALL-TIME LEDGER - Hall of Shadows
// Closed cases only. Wins, kills, saves,
// finds and sharp votes are remembered per
// player, forever, across every manor.
// ============================================
function tagFor(r) {
  const bits = [];
  if (r.kills) bits.push(`${r.kills} kill${r.kills === 1 ? '' : 's'}`);
  if (r.saves) bits.push(`${r.saves} save${r.saves === 1 ? '' : 's'}`);
  if (r.bodiesFound) bits.push(`${r.bodiesFound} find${r.bodiesFound === 1 ? '' : 's'}`);
  if (r.correctVotes) bits.push(`${r.correctVotes} sharp vote${r.correctVotes === 1 ? '' : 's'}`);
  return bits.slice(0, 2).join(' · ');
}

// write one finished case into the global ledger (idempotent per case:
// declareWinner's ENDED guard means this fires exactly once per game)
function recordMatchStats(g, winner) {
  try {
    const murderCount = (g.bodies || []).length; // every body is one kill by the killer
    const findsBy = {};
    for (const b of (g.bodies || [])) {
      if (b.found && b.finderJid) findsBy[normJid(b.finderJid)] = (findsBy[normJid(b.finderJid)] || 0) + 1;
    }
    const savesBy = {};
    for (const s of (g.saves || [])) savesBy[normJid(s.guardianJid)] = (savesBy[normJid(s.guardianJid)] || 0) + 1;
    const sharpBy = {};
    for (const v of (g.correctVoters || [])) sharpBy[v] = (sharpBy[v] || 0) + 1;

    const stats = system.get(STATS_KEY, {}) || {};
    for (const p of g.players) {
      const n = normJid(p.jid);
      if (!n) continue;
      const row = stats[n] || { games: 0, wins: 0, losses: 0, survived: 0, murdered: 0, condemned: 0, kills: 0, saves: 0, bodiesFound: 0, correctVotes: 0, killerGames: 0, score: 0 };
      const isKiller = p.role === 'KILLER';
      const isKillerSide = p.role === 'KILLER' || p.role === 'ACCOMPLICE';
      const won = (winner === 'civ' && !isKillerSide) || (winner === 'killer' && isKillerSide);
      row.games += 1;
      if (won) row.wins += 1; else row.losses += 1;
      if (p.alive) row.survived += 1;
      else if (p.deathMethod === 'the vote of the house') row.condemned += 1;
      else row.murdered += 1;
      if (isKiller) { row.killerGames += 1; row.kills += murderCount; }
      row.saves += savesBy[n] || 0;
      row.bodiesFound += findsBy[n] || 0;
      row.correctVotes += sharpBy[n] || 0;
      if (p.name) row.name = String(p.name).slice(0, 32);
      row.lastPlayed = Date.now();
      row.score = row.wins * 5 + row.survived * 2 + row.kills * 3 + row.saves * 4 + row.bodiesFound + row.correctVotes * 3;
      stats[n] = row;
    }
    system.set(STATS_KEY, stats);
    console.log(`🔪 [MurderMystery] ledger updated - ${g.players.length} entries (${winner} win, ${murderCount} kill(s))`);
  } catch (e) {
    console.error('🔪 [MurderMystery] ledger update failed:', e.message);
  }
}

function leaderboardCaption(meRank) {
  let cap = `🕯️ *HALL OF SHADOWS* - the all-time ledger of ${cases.MANOR_NAME}.`;
  if (meRank) {
    cap += `\nYou stand *#${meRank.rank}* with *${fmtZeni(meRank.score)} pts* - ${meRank.wins} win${meRank.wins === 1 ? '' : 's'} in ${meRank.games} case${meRank.games === 1 ? '' : 's'}.`;
  }
  cap += `\n_Closed cases only. Every win, kill, save and sharp vote is remembered._`;
  return cap;
}

function leaderboardText(rows, meRank, prefix) {
  const lines = ['🕯️ *HALL OF SHADOWS - ' + cases.MANOR_NAME + '*', ''];
  if (!rows.length) {
    lines.push('The ledger is blank. No case has been closed yet.');
    lines.push(`Open one: \`${prefix} mm create\` - and let the body count begin.`);
  }
  for (const r of rows) {
    lines.push(`  *${r.rank}.* ${r.name}${r.you ? ' (you)' : ''} - *${fmtZeni(r.score)} pts*`);
    lines.push(`      ${r.wins}W / ${r.games}G · ${r.winRate}%${r.tag ? ` · ${r.tag}` : ''}`);
  }
  if (meRank && meRank.rank > rows.length) {
    lines.push('');
    lines.push(`  You: *#${meRank.rank}* - ${fmtZeni(meRank.score)} pts (${meRank.wins}W / ${meRank.games}G)`);
  }
  lines.push('');
  lines.push('_Wins +5 · survival +2 · kill +3 · save +4 · body found +1 · sharp vote +3_');
  return lines.join('\n');
}

async function showLeaderboard(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const prefix = ctx.prefix || '.j';
  let rows = [];
  try {
    const stats = system.get(STATS_KEY, {}) || {};
    rows = Object.entries(stats).map(([jid, r]) => ({
      jid,
      name: r.name || `Guest ${jid.slice(-4)}`,
      games: r.games || 0,
      wins: r.wins || 0,
      score: r.score || 0,
      kills: r.kills || 0,
      saves: r.saves || 0,
      bodiesFound: r.bodiesFound || 0,
      correctVotes: r.correctVotes || 0,
      winRate: r.games ? Math.round((100 * (r.wins || 0)) / r.games) : 0,
    }));
    rows.sort((a, b) => b.score - a.score || b.wins - a.wins || b.winRate - a.winRate || String(a.name).localeCompare(String(b.name)));
    rows.forEach((r, i) => { r.rank = i + 1; });
  } catch (e) { /* empty ledger below */ }
  const me = rows.find((r) => r.jid === normJid(senderJid)) || null;
  const meRank = me ? { rank: me.rank, score: me.score, wins: me.wins, games: me.games } : null;
  // leave the last row slot free when overflow exists, so the "…and N more"
  // line never crowds the footer
  const cardCap = rows.length > LB_MAX_ROWS ? LB_MAX_ROWS - 1 : LB_MAX_ROWS;
  const top = rows.slice(0, cardCap).map((r) => ({ ...r, you: r.jid === normJid(senderJid), tag: tagFor(r) }));

  let cardOk = false;
  try {
    const buf = await cards.renderLeaderboardCard({ manorName: cases.MANOR_NAME, rows: top, totalTracked: rows.length });
    if (buf) {
      cardOk = true;
      await sendGroupImage(sock, chatId, buf, leaderboardCaption(meRank));
    }
  } catch (e) { /* text fallback */ }
  if (!cardOk) {
    await sendGroup(sock, chatId, `${botMarker}${leaderboardText(top, meRank, prefix)}`);
  }
}

// ---------- PRIVATE DOSSIER (MD §9: .j mm evidence) ----------
async function showDossier(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const g = findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ You are not part of any mystery.`);
  if (ctx.isGroup) {
    return sendGroup(sock, chatId, `${botMarker}📁 Your dossier is private - sent to your DMs.`);
  }
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🕯️ You are not part of this mystery.`);
  const n = normJid(senderJid);
  const mine = (g.privKnowledge || {})[n] || [];
  const pub = (g.publicEvidence || []).filter((e) => e.night <= g.night);

  const confirmed = pub.filter((e) => e.tag === 'confirmed').map((e) => `Night ${e.night}, ${e.room}: ${e.name} - ${e.line}`);
  const rumours = pub.filter((e) => e.tag !== 'confirmed').map((e) => `Night ${e.night}, ${e.room}: ${e.name} (circumstantial)`);
  const mineLines = mine.map((k) => `Night ${k.night}: ${k.text}`);
  const myInvest = (g.investResults || []).filter((r) => r.by === nameOf(me)).map((r) => `Night ${r.night}: ${r.subject} - ${r.verdict}`);
  const heard = (g.askLog || {})[n] || [];
  const heardLines = heard.map((cid) => {
    const st = caseGen.statementFor(g.case, cid);
    const who = (g.players.find((p) => p.char && p.char.id === cid) || {});
    return who.name ? `${who.name} (${who.char ? who.char.name : '?'}): "${st ? st.account : '…refused to speak of it.'}"` : null;
  }).filter(Boolean);
  const bodies = (g.bodies || []).filter((b) => b.found).map((b) => `${b.victimName} - ${b.method.title}, ${b.roomIdx != null && g.rooms[b.roomIdx] ? g.rooms[b.roomIdx].name : '?'} (night ${b.night})`);
  const unfound = (g.bodies || []).filter((b) => !b.found).length;

  const sections = [
    { title: 'Confirmed facts', lines: bodies.length ? bodies : ['No body has been found yet.'] },
    { title: 'House evidence', lines: confirmed.length ? confirmed : ['Nothing confirmed yet - search rooms.'] },
    { title: 'Circumstantial', lines: rumours.slice(0, 4) },
    { title: 'Your private notes', lines: mineLines.length ? mineLines.slice(-4) : ['You hold nothing privately. Yet.'] },
    { title: 'Your weighings', lines: myInvest.length ? myInvest.slice(-3) : (me.role === 'INVESTIGATOR' ? ['Use mm compare <a> <b> at night.'] : ['You have no badge - rely on your eyes.']) },
    { title: 'Statements heard', lines: heardLines.length ? heardLines.slice(-3) : ['You have questioned no one yet: mm ask <name>'] },
  ];
  const openCount = unfound ? `${unfound} body${unfound === 1 ? ' lies' : 'ies lie'} unfound.` : 'Every body has been found.';

  let cardOk = false;
  try {
    const buf = await cards.renderDossierCard({ playerName: nameOf(me), sections, manorName: cases.MANOR_NAME });
    if (buf) {
      cardOk = true;
      await sendDMImage(sock, senderJid, buf,
        `📁 *YOUR CASE DOSSIER*\n\nConfirmed: ${bodies.length} · Evidence: ${pub.length} · Private notes: ${mineLines.length}\n${openCount}\n\nUpdate it with every search, question and night.`);
    }
  } catch (e) { /* text fallback */ }
  if (!cardOk) {
    const txt = sections.map((s) => `*${s.title}*\n${s.lines.length ? s.lines.map((l) => `• ${l}`).join('\n') : '• —'}`).join('\n\n');
    await sendDM(sock, senderJid, `📁 *YOUR CASE DOSSIER - ${cases.MANOR_NAME}*\n\n${txt}\n\n_${openCount}_`);
  }
}

// ---------- QUESTION A GUEST (MD §8, template layer) ----------
async function askCharacter(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const g = ctx.isGroup ? getGame(chatId) : findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  if (!g || (g.phase !== PHASE.DISCUSSION && g.phase !== PHASE.VOTING)) {
    return sendGroup(sock, chatId, `${botMarker}❓ Guests answer questions between dawn and the count.`);
  }
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}❓ You are not on the guest list.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}❓ The dead ask nothing. They only watch.`);
  const target = resolveRosterTarget(g, rawTarget);
  if (!target) {
    const roster = rosterLines(g).join('\n');
    return sendGroup(sock, chatId, `${botMarker}❓ Question a *living* guest:\n\n${roster}\n\n\`${g.prefix} mm ask <number|name>\``);
  }
  if (normJid(target.jid) === normJid(senderJid)) {
    return sendGroup(sock, chatId, `${botMarker}❓ You know your own evening. Ask someone else.`);
  }
  const n = normJid(senderJid);
  const st = caseGen.statementFor(g.case, target.char.id);
  const account = st ? st.account : `${target.char.name} declines to account for the evening in any detail.`;
  const obs = st && st.observation ? st.observation : null;
  g.askLog = g.askLog || {};
  g.askLog[n] = g.askLog[n] || [];
  if (!g.askLog[n].includes(target.char.id)) g.askLog[n].push(target.char.id);
  persistGames();
  if (ctx.isGroup) {
    // owner 2026-10-12 19:32Z: the ask (and the ACCOUNT) live in the group
    // where discussion and voting happen - DMs are for the night. MD §8:
    // every character has a PUBLIC account of events. The sharper
    // observation stays the asker's private edge (MD §6 layering).
    await sendGroup(sock, chatId,
      `${botMarker}❓ ${nameOf(target)} - ${target.char.name}, ${target.char.title} - answers before the house:\n\n_${account}_`);
    if (obs) {
      await sendDM(sock, senderJid,
        `❓ While the house heard the account, ${target.char.name} adds - to you alone:\n\n_${obs}_\n\nCompare accounts with the evidence: \`${g.prefix} mm evidence\`.`);
    }
    return;
  }
  await sendDM(sock, senderJid,
    `❓ *${nameOf(target).toUpperCase()} - ${target.char.name}, ${target.char.title}*\n\n_${account}_${obs ? `\n\nThey add, unprompted: _"${obs}"_` : ''}\n\nCompare it against the evidence: \`${g.prefix} mm evidence\`. Their answer may not match their alibi tomorrow.`);
}

// ---------- CHARACTER BACKSTORY (owner 2026-10-12 22:05Z: "Add a command
// that allows players to instantly pull up anyone's character backstory or
// description for cross-referencing clues") ----------
// Public information only: the introduction line the house already heard +
// the guest's standing public account. Never the secrets, never the personal
// items (those are the evidence layers), never a role. Works for the dead -
// their stories stay on the record.
async function showBackstory(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const g = ctx.isGroup ? getGame(chatId) : findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  if (!g) return sendGroup(sock, chatId, `${botMarker}📜 There is no case open. The manor keeps no other records.`);
  if (!g.case) return sendGroup(sock, chatId, `${botMarker}📜 The introductions carry this round's stories - this case predates the record.`);
  const alive = resolveRosterTarget(g, rawTarget);
  if (alive) return deliverBackstory(ctx, g, alive);
  // the fallen keep their stories - match the full roster by name
  const q = String(rawTarget || '').trim().toLowerCase().replace(/^@/, '');
  if (!q || /^\d+$/.test(q)) {
    const roster = g.players.filter((p) => p.char).map((p, i) => `  ${i + 1}. ${nameOf(p)} - ${p.char.name}${p.alive ? '' : ' (deceased)'}`).join('\n');
    return sendGroup(sock, chatId, `${botMarker}📜 Whose story do you want? Name a guest:\n\n${roster}\n\n\`${g.prefix} mm backstory <number|name>\``);
  }
  const target = g.players.find((p) => p.char && (
    nameOf(p).toLowerCase().includes(q) ||
    (p.char.name || '').toLowerCase().includes(q) ||
    (p.char.title || '').toLowerCase().includes(q)));
  if (!target) {
    const roster = g.players.filter((p) => p.char).map((p) => `  ${nameOf(p)} - ${p.char.name}${p.alive ? '' : ' (deceased)'}`).join('\n');
    return sendGroup(sock, chatId, `${botMarker}📜 No guest answers to that name. The register:\n\n${roster}\n\n\`${g.prefix} mm backstory <number|name>\``);
  }
  return deliverBackstory(ctx, g, target);
}

async function deliverBackstory(ctx, g, target) {
  const { sock, chatId, botMarker, prefix } = ctx;
  const st = caseGen.statementFor(g.case, target.char.id);
  const introLine = caseGen.introCaptionFor(target.char.id, g.players.reduce((m, p) => { if (p.char) m[p.char.id] = p.char.name; return m; }, {}), g.case, target.char.title);
  const account = st ? st.account : `${target.char.name} has never given the house an account of that evening.`;
  const status = target.alive ? '' : `\n\n☠️ _The record notes: ${nameOf(target)} is dead._`;
  const cap = `${introLine}\n\nTheir account stands: _${account}_${status}\n\nCross-reference it against the evidence: \`${prefix || g.prefix} mm evidence\` - accounts that cannot survive the evidence are the ones that matter.`;
  let ok = false;
  try {
    const idx = g.players.indexOf(target) + 1;
    const buf = await cards.renderCharacterIntroCard({ char: target.char, caption: introLine, index: idx, total: g.players.length, manorName: cases.MANOR_NAME });
    if (buf) {
      ok = true;
      await sendGroupImage(sock, chatId, buf, cap);
    }
  } catch (e) { /* text fallback */ }
  if (!ok) {
    await sendGroup(sock, chatId, `${botMarker}📜 *${target.char.name} - ${target.char.title}*\n\n_${introLine}_\n\nTheir account stands: _${account}_${status}`);
  }
  // the house's record of who wanted whose story
  const n = normJid(ctx.senderJid);
  if (n) {
    g.backstoryLog = g.backstoryLog || {};
    g.backstoryLog[n] = g.backstoryLog[n] || [];
    if (!g.backstoryLog[n].includes(target.char.id)) g.backstoryLog[n].push(target.char.id);
    persistGames();
  }
}

// ---------- PUBLIC ACCUSATION (MD §11, discussion layer) ----------
async function submitAccuse(ctx, raw) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const g = getGame(chatId);
  if (!g || (g.phase !== PHASE.DISCUSSION && g.phase !== PHASE.VOTING)) {
    return sendGroup(sock, chatId, `${botMarker}📣 Accusations belong between dawn and the count.`);
  }
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}📣 You are not on the guest list.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}📣 The dead make no accusations.`);
  const parts = String(raw || '').trim().split(/\s+/);
  const head = parts.shift() || '';
  const reason = sanitizePlayerText(parts.join(' '), 160);
  const target = resolveRosterTarget(g, head);
  if (!target) {
    return sendGroup(sock, chatId, `${botMarker}📣 Name a guest and your charge: \`${g.prefix} mm accuse <number|name> <why>\` - the house hears it, the record keeps it.`);
  }
  if (normJid(target.jid) === normJid(senderJid)) {
    return sendGroup(sock, chatId, `${botMarker}📣 Accusing yourself is either a confession or a tactic. Try again tomorrow.`);
  }
  g.log.push({ night: g.night, accusation: { by: nameOf(me), against: nameOf(target), reason } });
  persistGames();
  await sendGroup(sock, chatId,
    `📣 *${nameOf(me)}* levels an accusation at *${nameOf(target)}* (${target.char.name}):${reason ? `\n> _"${reason}"_` : ''}\n\nThe record keeps it. The vote decides it.`);
}

// ---------- KILLER WHISPER (owner 2026-10-12 19:32Z: "if there are twin
// killers... use a command that allow them to send a message to the bot and
// it's received by the other killer in dms during the night phase") ----------
// DM-only, NIGHT-only, killer partners only. The bot relays; nothing is kept
// in the case log - the record never learns what the dark said.
async function submitWhisper(ctx, raw) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  const g = ctx.isGroup ? getGame(chatId) : findGameForPlayer(senderJid);
  if (g) noteSock(g, sock);
  if (!g) return sendGroup(sock, chatId, `${botMarker}🔪 No mystery hears you.`);
  if (ctx.isGroup) {
    return sendGroup(sock, chatId, `${botMarker}🔪 Whispers travel in DMs only - the walls of Blackvale have ears.`);
  }
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🔪 You are not on the guest list.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🔪 The dead whisper nothing.`);
  if (me.role !== 'KILLER') {
    return sendGroup(sock, chatId, `${botMarker}🔪 Whispers in the dark are not yours to send.`);
  }
  if (g.phase !== PHASE.NIGHT) {
    return sendGroup(sock, chatId, `${botMarker}🔪 The whisper passes only in the dark - send it at night.`);
  }
  const msg = sanitizePlayerText(String(raw || '').trim(), WILL_MAX_LEN);
  if (!msg) {
    return sendGroup(sock, chatId, `${botMarker}🔪 Give the whisper words: \`${g.prefix} mm whisper <message>\``);
  }
  // owner 2026-10-13: killers coordinate through the night - the relay now
  // carries to every LIVING partner, not just the first one found
  const partners = g.players.filter((p) => p.role === 'KILLER' && p.alive && normJid(p.jid) !== normJid(senderJid));
  if (!partners.length) {
    return sendGroup(sock, chatId, `${botMarker}🔪 You hunt alone - there is no partner left to whisper to.`);
  }
  for (const partner of partners) {
    await sendDM(sock, partner.jid, `🔪 _A whisper reaches you through the dark - your partner:_\n\n> "${msg}"`);
  }
  await sendDM(sock, senderJid, `🔪 _Your whisper travels the halls: "${msg}"_`);
}

// ---------- THE SEANCE (owner 2026-10-13 09:44Z: the Medium parts the veil) ----------
// The medium runs `mm seance` in the GROUP - the house sees the candles.
// Every dead player gets a DM from the bot: reply here (free text, no
// command) and the words cross the veil into the MEDIUM's DMs alone. The
// medium chooses what, if anything, reaches the living. Budget: 2 openings
// per case; a veil stays open until the phase rolls over.
async function submitSeance(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) {
    return sendGroup(sock, chatId, `${botMarker}🕯️ The veil is parted from the group where the manor stands - the house must see the candles.`);
  }
  const g = getGame(chatId);
  if (!g || g.phase === PHASE.LOBBY || g.phase === 'STARTING' || g.phase === 'ENDED') {
    return sendGroup(sock, chatId, `${botMarker}🕯️ There is no case in play for the veil to open into.`);
  }
  const me = getPlayer(g, senderJid);
  if (!me || me.role !== 'MEDIUM') {
    return sendGroup(sock, chatId, `${botMarker}🕯️ The veil answers only to the Medium. And you are - presumably - not them.`);
  }
  if (!me.alive) {
    return sendGroup(sock, chatId, `${botMarker}🕯️ The Medium is on the wrong side of the veil now. The dead do not summon themselves.`);
  }
  if (g.phase !== PHASE.DISCUSSION && g.phase !== PHASE.NIGHT) {
    return sendGroup(sock, chatId, `${botMarker}🕯️ Not while the count is running - the veil is parted between dawn and the ballot, or in the dark.`);
  }
  const left = me.seanceLeft == null ? SEANCE_BUDGET : me.seanceLeft;
  if (left <= 0) {
    return sendGroup(sock, chatId, `${botMarker}🕯️ The veil has spent itself for this case. The dead keep the rest of their words.`);
  }
  if (g.seance && g.seance.open && g.seance.phase === g.phase) {
    return sendGroup(sock, chatId, `${botMarker}🕯️ The veil is already open - the dead may speak. Send your words to the bot in your DMs.`);
  }
  me.seanceLeft = left - 1;
  g.seance = { open: true, phase: g.phase, night: g.night, openedAt: Date.now() };
  persistGames();
  const dead = g.players.filter((p) => p.alive === false);
  console.log(`🔪 [MurderMystery] seance opened in ${chatId} by ${normJid(senderJid)} (phase=${g.phase}, left=${me.seanceLeft}, dead=${dead.length})`);
  await sendGroup(sock, chatId,
    `${botMarker}🕯️ *${nameOf(me)}* (${me.char.name}, ${me.char.title}) lights the candles and parts the veil.\n\nThe air in ${cases.MANOR_NAME} goes cold. The dead may speak again - through the Medium alone.\n\n_What the dead say reaches ${nameOf(me)} privately. What reaches YOU is whatever they choose to repeat._`);
  for (const d of dead) {
    await sendDM(sock, d.jid,
      `👻 *THE VEIL IS OPEN - ${cases.MANOR_NAME}*\n\n${nameOf(me)} has parted the veil. Reply to THIS chat - just write, no command - and your words are carried to the Medium's ear alone.\n\nYou may speak freely until this phase ends. The Medium decides what the living ever hear.`);
    await sleep(200);
  }
}

// engine hook (DM free-text): a dead player's plain words while the veil is
// open are relayed verbatim to the medium's DMs. Returns true when consumed.
async function seanceRelay(sock, senderJid, chatId, txt, botMarker) {
  const g = findGameForPlayer(senderJid);
  if (!g || g.phase === 'ENDED' || g.phase === 'STARTING' || g.phase === PHASE.LOBBY) return false;
  const me = getPlayer(g, senderJid);
  if (!me || me.alive !== false) return false; // the living have mouths in the group
  const veil = g.seance;
  if (!veil || !veil.open || veil.phase !== g.phase) return false;
  const medium = g.players.find((p) => p.role === 'MEDIUM' && p.alive);
  if (!medium) {
    g.seance = { open: false, phase: veil.phase, night: veil.night, closed: 'medium dead' };
    persistGames();
    await sendGroup(sock, chatId, `${botMarker}👻 The veil falls silent - the Medium is gone, and the dead go with them.`);
    return true;
  }
  const raw = String(txt || '').trim();
  if (!raw) return false;
  // anti-spam: the veil carries only so many words so fast
  const now = Date.now();
  if (veil._lastBy && veil._lastBy[normJid(senderJid)] && now - veil._lastBy[normJid(senderJid)] < SEANCE_COOLDOWN_MS) {
    await sendGroup(sock, chatId, `${botMarker}👻 The veil carries only so many words so fast. Wait a breath, then speak.`);
    return true;
  }
  veil._lastBy = veil._lastBy || {};
  veil._lastBy[normJid(senderJid)] = now;
  const msg = sanitizePlayerText(raw, SEANCE_MAX_LEN);
  if (!msg) return false;
  persistGames();
  console.log(`🔪 [MurderMystery] seance relay ${normJid(senderJid)} -> medium ${normJid(medium.jid)} (${msg.length} chars, phase=${g.phase})`);
  await sendDM(sock, medium.jid,
    `👻 *A voice through the veil* - ${nameOf(me)} (${me.char.name}), dead on night ${me.deathNight || '?'}:\n\n> "${msg}"\n\n_The house hears nothing - unless you say it aloud._`);
  await sendGroup(sock, chatId, `${botMarker}👻 _Your words cross the veil._`);
  return true;
}
async function forceEnd(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ Close the case from the group where the manor stands.`);
  const g = getGame(chatId);
  if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ There is no mystery here to end.`);
  if (normJid(senderJid) !== g.host && !ctx.isMod && !isModJid(senderJid)) {
    return sendGroup(sock, chatId, `${botMarker}🕯️ Only the host (@${g.host}) or a moderator may close the case early.`);
  }
  // legacy safety: a game cast under the retired entry-fee rules may still
  // carry feePaid - always return it (new games never set this field)
  let refundNote = '';
  if (g.feePaid && economy) {
    try {
      if (economy.addMoney(g.feePaidBy || g.host, g.feePaid, 'Murder Mystery - manor refund (cast fee retired)')) {
        refundNote = `\n💰 The retired cast fee - *${fmtZeni(g.feePaid)} Zeni* - returns to the host's purse.`;
      }
    } catch (e) {}
  }
  await sendGroup(sock, chatId, `${botMarker}🕯️ The host has closed the case. The manor goes dark.${refundNote}`);
  unsilenceChat(chatId);
  clearTimers(chatId);
  games.delete(chatId);
  persistGames();
}

// ---------- status / help ----------
async function showStatus(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) {
    // private status: your character, your role, your pulse - roles live ONLY here
    const g = findGameForPlayer(senderJid);
    if (g) noteSock(g, sock);
    if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ You are not part of any mystery.`);
    const me = getPlayer(g, senderJid);
    const secs = Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000));
    const aliveList = alivePlayers(g).map((p, i) => `  ${i + 1}. ${nameOf(p)} - ${p.char.name}`).join('\n');
    const roleWord = me.role === 'KILLER' ? '🔪 the *KILLER*' : me.role === 'INVESTIGATOR' ? '🕵️ the *INVESTIGATOR*' : me.role === 'GUARDIAN' ? '👼 the *GUARDIAN*' : me.role === 'MEDIUM' ? '🕯️ the *MEDIUM*' : me.role === 'BUTLER' ? '🗝️ the *BUTLER*' : me.role === 'ACCOMPLICE' ? '🎭 the *ACCOMPLICE*' : '👤 a *CIVILIAN*';
    const roleLine = me.alive
      ? `You are *${me.char.name}, ${me.char.title}* - ${roleWord}.`
      : `You are dead - *${me.char.name}*, taken on night ${me.deathNight || '?'}. You watch now.`;
    let actionLine = '';
    if (me.alive && g.phase === PHASE.NIGHT) {
      if (me.role === 'KILLER') actionLine = g.killerTargetJid ? `\nTonight: knife chosen${g.killerRoomIdx != null ? ', body placed' : ' - now \`' + g.prefix + ' mm room <n>\`'}.`
        : `\nTonight: \`${g.prefix} mm kill <n>\`, then \`${g.prefix} mm room <n>\`.`;
      if (me.role === 'INVESTIGATOR') {
        const left = me.compLeft == null ? COMPARE_BUDGET : me.compLeft;
        const acted = invActedTonight(g, me);
        actionLine = acted
          ? (left <= 0 ? '\nTonight: the scales rest - no weighings left this case.' : '\nTonight: your weighing is spent.')
          : (left <= 0 ? '\nTonight: no weighings left this case - the scales rest.' : `\nTonight: \`${g.prefix} mm compare <n> <n>\` (${left} left).`);
      }
      if (me.role === 'GUARDIAN') actionLine = g.protectTargetJid ? '\nTonight: your watch is set.' : `\nTonight: \`${g.prefix} mm protect <n|me>\`.`;
      if (me.role === 'MEDIUM') {
        const left = me.seanceLeft == null ? SEANCE_BUDGET : me.seanceLeft;
        const veilOpen = g.seance && g.seance.open && g.seance.phase === g.phase;
        actionLine = veilOpen ? '\nTonight: the veil is OPEN - the dead may speak.'
          : left > 0 ? `\nTonight: no action in the dark - part the veil at dawn (\`${g.prefix} mm seance\`, ${left} left).`
          : '\nTonight: the veil has spent itself for this case.';
      }
      if (me.role === 'BUTLER') {
        actionLine = g.night < BUTLER_REVEAL_NIGHT
          ? `\nTonight: no action. The manor pays its debt on night *${BUTLER_REVEAL_NIGHT}*.`
          : '\nTonight: no action. The name you were given is yours to spend.';
      }
      if (me.role === 'ACCOMPLICE') actionLine = '\nTonight: no action - your work is the daylight vote.';
    }
    let searchLine = '';
    if (me.alive && g.phase === PHASE.DISCUSSION) {
      const used = g.searches && g.searches.night === g.night && g.searches.used[normJid(senderJid)] != null;
      searchLine = used ? '\nSearch: already made today.' : `\nSearch: one room remains - \`${g.prefix} mm search <n|room>\`.`;
    }
    // Wave 2b: pocket + letters + tonight's wander
    let itemLine = '';
    {
      const its = me.items || [];
      const pretty = [];
      if (its.includes('talisman')) pretty.push('🧲 iron talisman');
      if (its.includes('candle')) pretty.push('🕯️ candle stub');
      if (its.includes('coin')) pretty.push('🪙 old coin');
      const poolLen = Array.isArray(g.letterPool) ? g.letterPool.length : 0;
      itemLine = `\nPocket: ${pretty.length ? pretty.join(', ') : 'empty'} · Letters: ${Math.min(me.letters || 0, poolLen)}${poolLen ? ` of ${poolLen}` : ''}.`;
      if (me.alive && g.phase === PHASE.NIGHT && g.visits && g.visits.night === g.night && g.visits.picks[normJid(senderJid)] != null) {
        const vr = g.rooms[g.visits.picks[normJid(senderJid)]];
        itemLine += `\nTonight's wander: the ${vr ? vr.name : 'manor'}.`;
      }
    }
    const unfound = (g.bodies || []).filter((b) => !b.found).length;
    const bodyLine = unfound ? `\n\nUnfound bodies in the manor: *${unfound}*.` : '';
    return sendGroup(sock, chatId,
      `🕯️ *${cases.MANOR_NAME} - PRIVATE STATUS*\n\n` +
      `Phase: *${g.phase}* · Night *${g.night}* · ⏱️ ${Math.floor(secs / 60)}m ${secs % 60}s left\n\n` +
      `${roleLine}${actionLine}${searchLine}${itemLine}${bodyLine}\n\nThe living:\n${aliveList}`);
  }
  const g = getGame(chatId);
  if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ No mystery is unfolding here. \`${ctx.prefix} mm create\` to open the manor.`);
  if (g.phase === PHASE.LOBBY) return showPlayers(ctx);
  // PUBLIC status - never contains roles. Roles live in DMs only.
  const alive = alivePlayers(g);
  const me = getPlayer(g, senderJid);
  const lines = alive.map((p, i) =>
    `  ${i + 1}. ${nameOf(p)} - ${p.char.name}${me && normJid(senderJid) === normJid(p.jid) ? ' (you)' : ''}`).join('\n');
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
    `🕯️ *MURDER MYSTERY - BLACKVALE MANOR*\n\n` +
    `A murder will be committed. One of you is the killer.\n\n` +
    `*Lobby (group):*\n` +
    `• \`${prefix} mm create\` - open the manor\n` +
    `• \`${prefix} mm join\` - accept the invitation\n` +
    `• \`${prefix} mm leave\` - decline it\n` +
    `• \`${prefix} mm players\` - guest list\n` +
    `• \`${prefix} mm start\` - host begins the mystery (the winning side splits the manor's purse: 10,000-25,000 Zeni)\n\n` +
    `*At dawn (group or DM):*\n` +
    `• \`${prefix} mm search <room n|name>\` - one search per guest, per day. Searches are public; the ghost's clue is not.\n` +
    `• \`${prefix} mm will <text>\` (DM) - seal your last words; the house reads them aloud if you die.\n\n` +
    `*In play (group):*\n` +
    `• \`${prefix} mm vote <n|name|skip>\` - cast your ballot (ballots are public)\n` +
    `• \`${prefix} mm ask <n|name>\` - question a guest before the house; their account is public, the sharper detail is yours alone (the killer lies)\n` +
    `• \`${prefix} mm backstory <n|name>\` - any guest's story and standing account, on demand - cross-reference it against the evidence\n` +
    `• \`${prefix} mm whisper <message>\` - killer partners only, at night, in DMs: the bot relays it to every living partner\n` +
    `• \`${prefix} mm seance\` - medium only (8+ player games): part the veil in the group - the dead reply to the bot and their words reach your DMs alone (2 openings per case)\n` +
    `• \`${prefix} mm accuse <n|name> <why>\` - level an accusation the whole house hears\n` +
    `• \`${prefix} mm evidence\` - your private case dossier (DMs): facts, evidence, statements, your notes\n` +
    `• \`${prefix} mm status\` - the state of the case\n` +
    `• \`${prefix} mm lb\` - the Hall of Shadows: every win, kill, save and sharp vote, remembered\n` +
    `• \`${prefix} mm end\` - host/mod closes the case (no prize is paid if the case never closes)\n\n` +
    `*At night (in your DM with the bot - four minutes):*\n` +
    `• \`${prefix} mm visit <n|room>\` - slip away to one room before dawn: letters from the manor's past, keepsakes, and whoever else is hiding there (you are told someone is present - never who)\n` +
    `• \`${prefix} mm letters\` - re-read every letter fragment you have collected\n` +
    `• \`${prefix} mm kill <n|name>\` - killer only, then \`${prefix} mm room <n>\` to hide the body\n` +
    `• \`${prefix} mm compare <a> <b>\` - investigator only: lay two guests on the scales, learn which one the house trusts less (3 weighings per case)\n` +
    `• \`${prefix} mm protect <n|me>\` - guardian only (games of 5+)\n\n` +
    `*If you dare (DM):*\n` +
    `• \`${prefix} mm taunt <message>\` - whisper into the discussion, unsigned. The manor will say if it is not yours to give.\n\n` +
    `*How it flows:* roles are dealt in secret. At night the killer kills and hides the body, and every living guest may slip away to one room - the manor's letters explain why you were all invited, and some rooms hide keepsakes: an iron talisman turns one knife, a candle stub names the faces in your room, an old coin will buy into the manor's puzzles. By day the house searches - the finder of the body inherits the ghost's clue about the killer's character, and the ghost adds where the killer passed that night. Bad votes let the killer kill again. Dead guests are silenced until the case closes.\n\n` +
    `*The prize:* the manor posts a purse (10k-25k Zeni, rolled when the lobby opens) - no entry fee, ever. If the innocents solve the case they split the purse; if the killer outlives the manor, the killer takes all of it. Wins, kills, saves, finds and sharp votes are written into the Hall of Shadows: \`${prefix} mm lb\`.\n\n` +
    `Roles scale with the table: 4 guests = 1 Killer + 1 Investigator · 5-7 = + Guardian · 8+ = + a 2nd Investigator + the Medium · 9+ = a 2nd Killer (partners) + the Butler + the Accomplice. The rest are Civilians.\n` +
    `The Butler learns the killer's name on the third night - but the killer knows the Butler from the first. The Accomplice wins beside the knife and is known to nobody. The dead stay silenced until the case closes - unless the Medium lets them speak.\n` +
    `Every case now carries a truth: a motive, ties between the guests, alibis and evidence. The introductions will tell you who is who - the evidence will tell you who is lying.\n` +
    `You receive a sealed role card in your DMs. Tell no one.\n` +
    `Player images are deleted from the case room while a game runs - screenshots are not evidence.`
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
  comapre: 'compare', compair: 'compare', compaer: 'compare',
  protekt: 'protect', porotect: 'protect',
  sance: 'seance', seaance: 'seance', seanse: 'seance', seence: 'seance', seenje: 'seance', saynce: 'seance',
  vist: 'visit', viist: 'visit', visti: 'visit', vlsit: 'visit',
  leters: 'letters', lettrs: 'letters', lettres: 'letters',
  vtoe: 'vote', vot: 'vote',
  strart: 'start', strat: 'start',
  leaderbored: 'leaderboard', ladderboard: 'leaderboard', leadboard: 'leaderboard',
  laderboard: 'leaderboard', learderboard: 'leaderboard', lederboard: 'leaderboard',
  leadreboard: 'leaderboard', leaderboardd: 'leaderboard',
};

async function handleCommand(ctx) {
  ensureRehydrated();
  const { sock, chatId, senderJid, botMarker } = ctx;
  // capture the live sock on any game in this chat - timer-driven sends
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
    case 'compare':
    case 'cmp':
    case 'weigh':
    case 'weighing':
    case 'vs':
    case 'versus':
      return submitCompare(ctx, ctx.rest);
    case 'investigate':
    case 'inv':
    case 'study':
      return submitInvestigate(ctx, ctx.rest); // legacy habit -> rule-change notice
    case 'protect':
    case 'guard':
    case 'watch':
    case 'save':
      return submitProtect(ctx, ctx.rest);
    case 'search':
    case 'sweep':
      return submitSearch(ctx, ctx.rest);
    case 'visit':
    case 'wander':
    case 'slip':
      return submitVisit(ctx, ctx.rest);
    case 'letters':
    case 'letter':
    case 'fragments':
      return submitLetters(ctx);
    case 'taunt':
    case 'taun':
    case 'tunt':
      return submitTaunt(ctx, ctx.rest);
    case 'evidence':
    case 'dossier':
    case 'notes':
      return showDossier(ctx);
    case 'ask':
    case 'question':
      return askCharacter(ctx, ctx.rest);
    case 'backstory':
    case 'bio':
    case 'background':
    case 'whois':
      return showBackstory(ctx, ctx.rest);
    case 'accuse':
    case 'accusation':
      return submitAccuse(ctx, ctx.rest);
    case 'whisper':
    case 'wsp':
      return submitWhisper(ctx, ctx.rest);
    case 'seance':
    case 'veil':
    case 'summon':
      return submitSeance(ctx);
    case 'will':
    case 'lastwords':
      return submitWill(ctx, ctx.rest);
    case 'lb':
    case 'leaderboard':
    case 'top':
    case 'scoreboard':
    case 'ranking':
    case 'rankings':
      return showLeaderboard(ctx);
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
  // engine hooks (2026-10-12 expansion)
  handleParticipantLeave, // group-participants.update: leaver handling
  gateGameMedia,          // in-case media gate: delete player images + view-once (stickers/docs pass, owner 20:26Z)
  seanceRelay,            // DM free-text hook (2026-10-13): the Medium's open veil carries the dead's words
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
    isZombieGame,        // QA: zombie retirement gate
    ZOMBIE_NIGHT_CAP,
    resolveRoom,
    roomListOf,
    rollPrize,
    fmtZeni,
    STATS_KEY,
    recordMatchStats,
    showLeaderboard,
    showDossier,         // QA
    askCharacter,        // QA
    submitAccuse,        // QA
    scheduleIntros,      // QA
    caseGen,             // QA
    PHASE,
    normJid,
    submitSeance,        // QA (Wave 2a)
    seanceRelay,         // QA (Wave 2a)
    BUTLER_REVEAL_NIGHT, // QA (Wave 2a)
    SEANCE_BUDGET,       // QA (Wave 2a)
  },
};
