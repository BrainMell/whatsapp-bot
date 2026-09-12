// ============================================
// MURDER MYSTERY — BLACKVALE MANOR
// A turn-based social deduction game for WhatsApp.
//
// Loop: lobby → secret roles (DM image cards) → night
//       → murder → morning announcement → discussion
//       → voting → elimination → repeat → final card.
//
// Roles: 1 KILLER + 1 INVESTIGATOR + Civilians.
// Characters (the 11 manor sprites) are story
// persons only — any of them can hold any role.
//
// Isolated module: state lives in its own System
// keys, commands live under `murder`/`mm`, cards
// render locally via node-canvas. No RPG assets.
// ============================================

const system = require('../../utils/system');
const characters = require('./characters');
const cases = require('./cases');
const cards = require('./cards');

// ---------- tunables ----------
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 11;       // character pool size
const NIGHT_MS = 100000;      // 100s of darkness
const DISCUSS_MS = 300000;    // 5 minutes of accusations
const VOTE_MS = 90000;        // 90s on the ballot
const LOBBY_TTL_MS = 30 * 60000;
const SILENCE_TTL_MS = 6 * 3600000; // failsafe: dead-silence never outlives 6h
const DM_SEND_DELAY_MS = 1100;      // pacing for role-card DM bursts
const REVEAL_ROLE_ON_DEATH = false; // configurable per spec §11

const GAMES_KEY = 'murder_mm_games_v1';
const CASE_KEY = 'murder_mm_case_counter';

const PHASE = {
  LOBBY: 'LOBBY',
  NIGHT: 'NIGHT',
  DISCUSSION: 'DISCUSSION',
  VOTING: 'VOTING',
};

// ---------- state ----------
const games = new Map();     // chatId -> game
const timers = new Map();    // chatId -> Timeout
const silenced = new Map();  // chatId -> Map(normJid -> ts)

function normJid(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0];
}

function persistGames() {
  const out = {};
  for (const [chatId, g] of games) {
    const { _timer, _resolving, ...rest } = g;
    void _timer; void _resolving;
    out[chatId] = rest;
  }
  system.set(GAMES_KEY, out);
}

function loadPersisted() {
  try {
    const saved = system.get(GAMES_KEY, null);
    if (!saved || typeof saved !== 'object') return;
    const now = Date.now();
    for (const [chatId, g] of Object.entries(saved)) {
      if (!g || !g.phase || g.phase === PHASE.LOBBY) {
        if (!g || now - (g.createdAt || now) > LOBBY_TTL_MS) continue; // drop stale lobbies
      }
      if (g.phase === PHASE.LOBBY && now - (g.createdAt || now) > LOBBY_TTL_MS) continue;
      games.set(chatId, { ...g, _resolving: false, _resolving2: false });
      // rebuild dead-player silences (they live in memory only)
      for (const p of (g.players || [])) {
        if (p.alive === false) silence(chatId, p.jid);
      }
      schedulePhaseTimer(chatId);
    }
    if (games.size) console.log(`🔪 [MurderMystery] rehydrated ${games.size} game(s) from MongoDB`);
  } catch (e) {
    console.error('🔪 [MurderMystery] rehydrate failed:', e.message);
  }
}

// ---------- dead-player silence (engine gate calls this) ----------
function silence(chatId, jid) {
  if (!silenced.has(chatId)) silenced.set(chatId, new Map());
  silenced.get(chatId).set(normJid(jid), Date.now());
}

function unsilenceChat(chatId) {
  silenced.delete(chatId);
}

function isSilenced(jid, chatId) {
  const set = silenced.get(chatId);
  if (!set || !set.size) return false;
  const key = normJid(jid);
  const ts = set.get(key);
  if (!ts) return false;
  if (Date.now() - ts > SILENCE_TTL_MS) { // failsafe purge
    set.delete(key);
    return false;
  }
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

// display name with a safe fallback
function nameOf(p) {
  return p.name || `Guest ${normJid(p.jid).slice(-4)}`;
}

// numbered seating order of the living
function rosterLines(game, excludeJid = null) {
  const ex = excludeJid ? normJid(excludeJid) : null;
  return alivePlayers(game)
    .filter((p) => !ex || normJid(p.jid) !== ex)
    .map((p, i) => `  ${i + 1}. ${nameOf(p)} — ${p.char.name}`);
}

// resolve a target from number / player name / character name
function resolveTarget(game, raw, excludeJid = null) {
  if (!raw) return null;
  const ex = excludeJid ? normJid(excludeJid) : null;
  const pool = alivePlayers(game).filter((p) => !ex || normJid(p.jid) !== ex);
  const q = String(raw).trim().toLowerCase();
  if (/^\d+$/.test(q)) {
    const idx = parseInt(q, 10) - 1;
    if (idx >= 0 && idx < pool.length) return pool[idx];
    return null;
  }
  const clean = q.replace(/^@/, '');
  return pool.find((p) =>
    nameOf(p).toLowerCase().includes(clean) ||
    (p.char.name || '').toLowerCase().includes(clean) ||
    (p.char.title || '').toLowerCase().includes(clean)) || null;
}

// ---------- messaging ----------
async function sendGroup(sock, chatId, text, extra = {}) {
  try {
    await sock.sendMessage(chatId, { text, ...extra });
  } catch (e) {
    console.error('🔪 [MurderMystery] group send failed:', e.message);
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
function clearTimer(chatId) {
  const t = timers.get(chatId);
  if (t) clearTimeout(t);
  timers.delete(chatId);
}

function schedulePhaseTimer(chatId) {
  const g = getGame(chatId);
  if (!g || !g.deadline) return;
  clearTimer(chatId);
  const remaining = g.deadline - Date.now();
  const t = setTimeout(() => {
    onPhaseTimeout(chatId).catch((e) => console.error('🔪 [MurderMystery] phase timeout error:', e.message));
  }, Math.max(1500, remaining));
  timers.set(chatId, t);
}

async function onPhaseTimeout(chatId) {
  const g = getGame(chatId);
  if (!g || g._resolving) return;
  const sock = getSockSafe();
  if (g.phase === PHASE.LOBBY) {
    if (g.players.length === 0) return endGame(sock, chatId, 'The lobby dissolved into the fog. Nobody came.');
    return endGame(sock, chatId, 'The lobby sat empty too long. The manor lost interest.');
  }
  if (g.phase === PHASE.NIGHT) return resolveNight(sock, chatId, 'dawn forced its hand');
  if (g.phase === PHASE.DISCUSSION) return beginVoting(sock, chatId);
  if (g.phase === PHASE.VOTING) return resolveVote(sock, chatId, 'time ran out');
}

function getSockSafe() {
  try {
    const engine = require('../../engine'); // NOTE: we are two levels deep (core/games/murdermystery/)
    return engine.getSock ? engine.getSock() : null;
  } catch (e) {
    return null;
  }
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
    caseNo: (system.get(CASE_KEY, 0) || 0) + 1,
    chatId,
    botId: ctx.botId,
    prefix: ctx.prefix,
    host: normJid(senderJid),
    createdAt: Date.now(),
    phase: PHASE.LOBBY,
    deadline: Date.now() + LOBBY_TTL_MS,
    players: [{ jid: senderJid, name: ctx.senderName, char: null, role: 'CIVILIAN', alive: true }], // host auto-joins
    night: 0,
    scenes: cases.buildCaseScenes(12),
    killerTargetJid: null,
    investTargetJid: null,
    investResults: [],
    votes: {},
    log: [],
    _resolving: false,
  };
  system.set(CASE_KEY, game.caseNo);
  games.set(chatId, game);
  persistGames();
  schedulePhaseTimer(chatId);

  const opener = cases.pick(cases.OPENING_LINES);
  await sendGroup(sock, chatId,
    `${botMarker}🕯️ *BLACKVALE MANOR OPENS ITS DOORS*\n\n` +
    `Case Nº ${String(game.caseNo).padStart(3, '0')} — a murder will be committed tonight.\n` +
    `_“${opener}”_\n\n` +
    `• Join: \`${ctx.prefix} mm join\`\n` +
    `• Leave: \`${ctx.prefix} mm leave\`\n` +
    `• Roster: \`${ctx.prefix} mm players\`\n` +
    `• Begin (host only): \`${ctx.prefix} mm start\`\n\n` +
    `*${MIN_PLAYERS}–${MAX_PLAYERS} guests.* One will be the killer. One will hunt them.\n` +
    `⏱️ The lobby holds for 30 minutes.`);
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
    clearTimer(chatId);
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
      `${botMarker}📜 *GUEST LIST — Case Nº ${String(g.caseNo).padStart(3, '0')}*\n\n${lines}\n\n` +
      `Host: @${g.host} · ${g.players.length}/${MIN_PLAYERS} minimum\n` +
      `Begin: \`${g.prefix} mm start\``,
      { contextInfo: { mentionedJid: g.players.map((p) => p.jid) } });
  }
  const lines = g.players.map((p) =>
    `  ${p.alive ? '🤍' : '☠️'} ${nameOf(p)} — ${p.char.name}${p.alive ? '' : ' (dead)'}`).join('\n');
  return sendGroup(sock, chatId,
    `${botMarker}📜 *THE GUESTS — Case Nº ${String(g.caseNo).padStart(3, '0')}*\n\n${lines}\n\n` +
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
  g.players.forEach((p, i) => {
    p.char = cast[i];
    p.role = i === killerIdx ? 'KILLER' : i === investIdx ? 'INVESTIGATOR' : 'CIVILIAN';
    p.alive = true;
  });
  g.phase = 'STARTING';
  persistGames();

  await sendGroup(sock, chatId, `${botMarker}🕯️ The doors are locked. Character envelopes are being sealed and delivered to every guest's DM…`);

  // mandatory private role cards (spec §3) — paced to respect the flood gods
  let cardsOk = 0;
  for (const p of g.players) {
    let sent = false;
    try {
      const buf = await cards.renderRoleCard({
        character: p.char,
        playerName: nameOf(p),
        role: p.role,
        caseNo: g.caseNo,
        manorName: cases.MANOR_NAME,
      });
      if (buf) {
        const cap = roleCardCaption(p.role, g.prefix);
        sent = await sendDMImage(sock, p.jid, buf, cap);
      }
    } catch (e) { /* fall through to text */ }
    if (!sent) {
      await sendDM(sock, p.jid, textRoleCard(p, g));
    } else {
      cardsOk++;
    }
    await sleep(DM_SEND_DELAY_MS);
  }

  // group introduction card (spec §7)
  try {
    const buf = await cards.renderIntro({
      caseNo: g.caseNo,
      playerCount: g.players.length,
      manorName: cases.MANOR_NAME,
      openingLine: cases.pick(cases.OPENING_LINES),
      nightLine: 'When night falls, so does the knife.',
    });
    if (buf) await sendGroupImage(sock, chatId, buf,
      `🕯️ ${g.players.length} guests. One killer. One detective.\nRole cards are in your DMs — read them. Tell no one.`);
    else throw new Error('intro render null');
  } catch (e) {
    await sendGroup(sock, chatId,
      `${botMarker}🔪 *THE MYSTERY BEGINS*\n\nEveryone has arrived at ${cases.MANOR_NAME}.\nOne of you is hiding a deadly secret.\n\n` +
      `Role cards: check your DMs. Do not reveal yours.\nCase Nº ${String(g.caseNo).padStart(3, '0')}`);
  }

  await sleep(2500);
  return beginNight(sock, chatId);
}

function roleCardCaption(role, prefix) {
  if (role === 'KILLER') {
    return `🔪 You are THE KILLER.\nEach night, choose a guest to eliminate.\nYour identity is secret — even from the dead.\n(Commands: \`${prefix} mm kill <n>\` in this chat, at night.)`;
  }
  if (role === 'INVESTIGATOR') {
    return `🕵️ You are THE INVESTIGATOR.\nEach night you may study one guest.\nThe result arrives here, by candlelight.\n(Commands: \`${prefix} mm investigate <n>\` in this chat, at night.)`;
  }
  return `👤 You are a CIVILIAN.\nYou have no special ability — only your wits.\nDiscuss. Accuse. Vote. Survive.`;
}

function textRoleCard(p, g) {
  if (p.role === 'KILLER') {
    return `🔪 *BLACKVALE MANOR — CASE Nº ${String(g.caseNo).padStart(3, '0')}*\n\n${nameOf(p).toUpperCase()}, you play ${p.char.name}, ${p.char.title}.\n\n*YOU ARE THE KILLER.*\nEliminate the guests night after night. Survive the discussion. Dodge the vote.\n\nYour identity is secret. Tell no one.`;
  }
  if (p.role === 'INVESTIGATOR') {
    return `🕵️ *BLACKVALE MANOR — CASE Nº ${String(g.caseNo).padStart(3, '0')}*\n\n${nameOf(p).toUpperCase()}, you play ${p.char.name}, ${p.char.title}.\n\n*YOU ARE THE INVESTIGATOR.*\nEach night you may investigate one living guest. The result is yours alone.\n\nKeep it secret. Spend it wisely.`;
  }
  return `👤 *BLACKVALE MANOR — CASE Nº ${String(g.caseNo).padStart(3, '0')}*\n\n${nameOf(p).toUpperCase()}, you play ${p.char.name}, ${p.char.title}.\n\n*YOU ARE A CIVILIAN.*\nYou have no special ability.\nFind the killer through discussion and voting.`;
}

// ---------- NIGHT ----------
async function beginNight(sock, chatId) {
  const g = getGame(chatId);
  if (!g) return;
  if (process.env.MM_DEBUG) console.log(`🔍 beginNight n=${g.night + 1} alive=${g.players.filter((p) => p.alive).length}`);
  g.phase = PHASE.NIGHT;
  g.night += 1;
  g.killerTargetJid = null;
  g.investTargetJid = null;
  g.votes = {};
  g.deadline = Date.now() + NIGHT_MS;
  g._resolving = false;
  g._resolving2 = false;
  persistGames();
  schedulePhaseTimer(chatId);

  const line = cases.pick(cases.NIGHT_LINES);

  // group night card
  try {
    const buf = await cards.renderNightCard({ night: g.night, line, caseNo: g.caseNo, manorName: cases.MANOR_NAME });
    if (buf) await sendGroupImage(sock, chatId, buf, `🌙 Night ${g.night} falls over the manor. Check your DMs.`);
    else throw new Error('night render null');
  } catch (e) {
    await sendGroup(sock, chatId, `🌙 *NIGHT ${g.night}* falls over ${cases.MANOR_NAME}.\n_${line}_\nCheck your DMs.`);
  }

  // private night instructions
  for (const p of alivePlayers(g)) {
    if (p.role === 'KILLER') {
      const roster = rosterLines(g, p.jid).join('\n');
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\nYou are the *KILLER*.\nChoose tonight's victim:\n\n${roster}\n\n` +
        `\`${g.prefix} mm kill <number>\` — or a name.\nYou cannot choose yourself.\nThe night ends when you act — or when dawn breaks anyway.`);
    } else if (p.role === 'INVESTIGATOR') {
      const roster = rosterLines(g, p.jid).join('\n');
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\nYou are the *INVESTIGATOR*.\nChoose someone to investigate:\n\n${roster}\n\n` +
        `\`${g.prefix} mm investigate <number>\` — or a name.\nYou cannot investigate yourself.\nThe result will find you here, by candlelight.`);
    } else {
      await sendDM(sock, p.jid,
        `🌙 *NIGHT ${g.night} — ${cases.MANOR_NAME}*\n\nYou have no action tonight.\nLock your door. Wait for morning.`);
    }
    await sleep(400);
  }
}

async function submitKill(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  // night actions belong in DMs — a group typing of this would out the sender
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (!g || g.phase !== PHASE.NIGHT) return sendGroup(sock, chatId, `${botMarker}🌙 There is no open night to act in.`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🌙 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🌙 The dead do not kill. Rest.`);
  if (me.role !== 'KILLER') return sendGroup(sock, chatId, `${botMarker}🌙 Only the killer acts on the night. And you are — presumably — not them.`);
  if (g.killerTargetJid) return sendGroup(sock, chatId, `${botMarker}🌙 The knife has already been chosen tonight. Wait for morning.`);

  const target = resolveTarget(g, rawTarget, senderJid);
  if (!target) {
    const roster = rosterLines(g, senderJid).join('\n');
    return sendGroup(sock, chatId, `${botMarker}🌙 Choose a *living* guest who is not you:\n\n${roster}\n\n\`${g.prefix} mm kill <number>\``);
  }

  g.killerTargetJid = target.jid;
  persistGames();
  await sendGroup(sock, chatId, `${botMarker}🌙 The knife is raised. *${nameOf(target)}* will not see dawn. Now… sleep.`);
  maybeResolveNight(sock || getSockSafe(), gameChatIdOf(g));
}

async function submitInvestigate(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (ctx.isGroup) return sendGroup(sock, chatId, `${botMarker}🕯️ That command belongs in a DM with the bot.`);
  const g = findGameForPlayer(senderJid);
  if (!g || g.phase !== PHASE.NIGHT) return sendGroup(sock, chatId, `${botMarker}🌙 There is no open night to act in.`);
  const me = getPlayer(g, senderJid);
  if (!me) return sendGroup(sock, chatId, `${botMarker}🌙 You are not part of this mystery.`);
  if (!me.alive) return sendGroup(sock, chatId, `${botMarker}🌙 The dead investigate nothing. Rest.`);
  if (me.role !== 'INVESTIGATOR') return sendGroup(sock, chatId, `${botMarker}🌙 You have no badge, no candle, and no right to snoop.`);
  if (g.investTargetJid) return sendGroup(sock, chatId, `${botMarker}🌙 You have already spent tonight's investigation.`);

  const target = resolveTarget(g, rawTarget, senderJid);
  if (!target) {
    const roster = rosterLines(g, senderJid).join('\n');
    return sendGroup(sock, chatId, `${botMarker}🌙 Choose a *living* guest who is not you:\n\n${roster}\n\n\`${g.prefix} mm investigate <number>\``);
  }

  g.investTargetJid = target.jid;
  g.investResults.push({ night: g.night, subject: nameOf(target), subjectJid: target.jid, verdict: target.role === 'KILLER' ? 'KILLER' : 'CLEAN' });
  persistGames();

  // private result, delivered immediately (spec §9)
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
      caseNo: g.caseNo,
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

// resolve as soon as both night actors have acted (spec §10: never depends on submission order)
function maybeResolveNight(sock, chatId) {
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.NIGHT || g._resolving) return;
  const killerDone = !!g.killerTargetJid;
  const investDone = !!g.investTargetJid || !alivePlayers(g).some((p) => p.role === 'INVESTIGATOR');
  if (killerDone && investDone) {
    g._resolving = true;
    setTimeout(() => resolveNight(sock, chatId, 'both actions were in'), 2600);
  }
}

async function resolveNight(sock, chatId, _reason) {
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.NIGHT || g._resolving2) return;
  if (process.env.MM_DEBUG) console.log(`🔍 resolveNight victim=${g.killerTargetJid ? normJid(g.killerTargetJid) : 'none'}`);
  g._resolving2 = true;
  clearTimer(chatId);

  const victim = g.killerTargetJid ? getPlayer(g, g.killerTargetJid) : null;
  if (victim && victim.alive) {
    const scene = g.scenes[(g.night - 1) % g.scenes.length] || cases.buildNightScene();
    victim.alive = false;
    victim.deathNight = g.night;
    victim.deathMethod = scene.method.title;
    g.log.push({ night: g.night, victim: nameOf(victim), method: scene.method.title, room: scene.room.name });
    silence(chatId, victim.jid);
    persistGames();

    try {
      const buf = await cards.renderDeathCard({
        victimChar: victim.char,
        victimName: nameOf(victim),
        scene,
        night: g.night,
        caseNo: g.caseNo,
        manorName: cases.MANOR_NAME,
        revealRole: REVEAL_ROLE_ON_DEATH ? victim.role : null,
      });
      if (buf) {
        await sendGroupImage(sock, chatId, buf,
          `☠️ *${nameOf(victim)} is dead.*\nThey can no longer participate in the investigation.`);
      } else throw new Error('death render null');
    } catch (e) {
      await sendGroup(sock, chatId,
        `☀️ *MORNING — NIGHT ${g.night}*\n\nLast night, someone was murdered.\n\n☠️ *${nameOf(victim)} is dead.* — found in ${scene.room.name}, taken by ${scene.method.title}.\n${nameOf(victim)} can no longer participate in the investigation.`);
    }

    // killer may have just reached parity
    const w = checkWin(g);
    if (w) return declareWinner(sock, chatId, w);
  } else {
    await sendGroup(sock, chatId,
      `☀️ *MORNING — NIGHT ${g.night}*\n\nDawn breaks. By some mercy — or some cowardice — everyone is still breathing.\n_This time._`);
  }

  return beginDiscussion(sock, chatId);
}

// ---------- DISCUSSION ----------
async function beginDiscussion(sock, chatId) {
  const g = getGame(chatId);
  if (!g) return;
  g.phase = PHASE.DISCUSSION;
  g.deadline = Date.now() + DISCUSS_MS;
  g._resolving = false;
  g._resolving2 = false;
  persistGames();
  schedulePhaseTimer(chatId);

  const prompt = cases.pick(cases.DISCUSSION_PROMPTS);
  await sendGroup(sock, chatId,
    `🗣️ *DISCUSSION*\n\n${prompt}\n\n` +
    `The vote begins when the clock runs out.\n⏱️ *5 minutes* remaining.\n\n` +
    `_Live status: \`${g.prefix} mm status\`_`);
}

// ---------- VOTING ----------
async function beginVoting(sock, chatId) {
  const g = getGame(chatId);
  if (!g) return;
  if (process.env.MM_DEBUG) console.log(`🔍 beginVoting alive=${g.players.filter((p) => p.alive).length}`);
  const w = checkWin(g);
  if (w) return declareWinner(sock, chatId, w);
  g.phase = PHASE.VOTING;
  g.votes = {};
  g.deadline = Date.now() + VOTE_MS;
  g._resolving = false;
  g._resolving2 = false;
  persistGames();
  schedulePhaseTimer(chatId);

  const alive = alivePlayers(g);
  const roster = alive.map((p, i) => `  ${i + 1}. ${nameOf(p)}`).join('\n');
  await sendGroup(sock, chatId,
    `⚖️ *VOTING*\n\nWho do you believe is the Killer?\n\n${roster}\n\n` +
    `Cast your vote: \`${g.prefix} mm vote <number>\` — or a name — or \`skip\`.\n` +
    `Living players only. One ballot each. You may change it until the count.\n⏱️ *90 seconds.*`);
}

async function castVote(ctx, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) {
    // voting is public — but a DM vote can still count if they're in exactly one game
    const gd = findGameForPlayer(senderJid);
    if (!gd) return sendGroup(sock, chatId, `${botMarker}⚖️ No ballot is open for you. Votes are cast in the group.`);
    return castVoteInGame({ ...ctx, sock, chatId: gd.chatId }, gd, rawTarget);
  }
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.VOTING) return sendGroup(sock, chatId, `${botMarker}⚖️ No ballot is open. Wait for the vote.`);
  return castVoteInGame(ctx, g, rawTarget);
}

async function castVoteInGame(ctx, g, rawTarget) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (process.env.MM_DEBUG) console.log(`🔍 castVoteInGame voter=${normJid(senderJid)} phase=${g.phase} alive=${g.players.find((p) => normJid(p.jid) === normJid(senderJid))?.alive} raw=${JSON.stringify(rawTarget)}`);
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
    const target = resolveTarget(g, rawTarget, null);
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
  }
  if (castCount >= aliveCount) {
    g._resolving = true;
    setTimeout(() => resolveVote(sock, chatId, 'every ballot was in'), 2200);
  }
}

async function resolveVote(sock, chatId, _reason) {
  const g = getGame(chatId);
  if (!g || g.phase !== PHASE.VOTING || g._resolving2) return;
  if (process.env.MM_DEBUG) console.log(`🔍 resolveVote reason=${_reason} votes=${JSON.stringify(g.votes)}`);
  g._resolving2 = true;
  clearTimer(chatId);

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
  }

  try {
    const buf = await cards.renderVoteCard({
      tally,
      skipVotes,
      eliminated: eliminated ? { charId: eliminated.char.id, name: nameOf(eliminated) } : null,
      caseNo: g.caseNo,
      manorName: cases.MANOR_NAME,
    });
    if (buf) {
      const tallyText = tally.map((t) => `${t.name} — ${t.votes} vote${t.votes === 1 ? '' : 's'}`).join('\n') + (skipVotes ? `\nskip — ${skipVotes}` : '');
      await sendGroupImage(sock, chatId, buf,
        `⚖️ *VOTE RESULT*\n\n${tallyText}\n\n${eliminated ? `*${nameOf(eliminated)} has been eliminated.*` : 'No one was condemned.'}`);
    } else throw new Error('vote render null');
  } catch (e) {
    const tallyText = tally.map((t) => `• ${t.name} — ${t.votes}`).join('\n') + (skipVotes ? `\n• skip — ${skipVotes}` : '');
    await sendGroup(sock, chatId,
      `⚖️ *VOTE RESULT*\n\n${tallyText || 'No ballots were cast.'}\n\n${eliminated ? `*${nameOf(eliminated)} has been eliminated.*` : 'No one was condemned.'}`);
  }

  if (eliminated) {
    await sleep(1200);
    const w = checkWin(g);
    if (w) return declareWinner(sock, chatId, w);
  }

  // back into the night
  g._resolving = false;
  g._resolving2 = false;
  return beginNight(sock, chatId);
}

// ---------- WIN CONDITIONS (spec §15) ----------
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
  clearTimer(chatId);
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
      caseNo: g.caseNo,
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

  // cleanup + case archive (spec §22: preserve game data)
  unsilenceChat(chatId);
  clearTimer(chatId);
  try {
    const archive = system.get('murder_mm_archive_v1', []);
    archive.unshift({
      caseNo: g.caseNo,
      chatId,
      winner,
      killer: nameOf(killer),
      killerChar: killer.char.name,
      nights: g.night,
      victims,
      survivors,
      investResults: g.investResults || [],
      endedAt: Date.now(),
    });
    system.set('murder_mm_archive_v1', archive.slice(0, 25));
  } catch (e) {}
  games.delete(chatId);
  persistGames();
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
  clearTimer(chatId);
  games.delete(chatId);
  persistGames();
}

// ---------- status / help ----------
async function showStatus(ctx) {
  const { sock, chatId, senderJid, botMarker } = ctx;
  if (!ctx.isGroup) {
    // private status: your character, your role, your pulse
    const g = findGameForPlayer(senderJid);
    if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ You are not part of any mystery.`);
    const me = getPlayer(g, senderJid);
    const secs = Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000));
    const aliveList = alivePlayers(g).map((p, i) => `  ${i + 1}. ${nameOf(p)} — ${p.char.name}`).join('\n');
    const roleLine = me.alive
      ? `You are *${me.char.name}, ${me.char.title}* — ${me.role === 'KILLER' ? '🔪 the *KILLER*' : me.role === 'INVESTIGATOR' ? '🕵️ the *INVESTIGATOR*' : '👤 a *CIVILIAN*'}.`
      : `You are dead — *${me.char.name}*, taken on night ${me.deathNight || '?'}. You watch now.`;
    return sendGroup(sock, chatId,
      `🕯️ *CASE Nº ${String(g.caseNo).padStart(3, '0')} — PRIVATE STATUS*\n\n` +
      `Phase: *${g.phase}* · Night *${g.night}* · ⏱️ ${Math.floor(secs / 60)}m ${secs % 60}s left\n\n` +
      `${roleLine}\n\nThe living:\n${aliveList}`);
  }
  const g = getGame(chatId);
  if (!g) return sendGroup(sock, chatId, `${botMarker}🕯️ No mystery is unfolding here. \`${ctx.prefix} mm create\` to open the manor.`);
  if (g.phase === PHASE.LOBBY) return showPlayers(ctx);
  const alive = alivePlayers(g);
  const me = getPlayer(g, senderJid);
  const lines = alive.map((p, i) =>
    `  ${i + 1}. ${nameOf(p)} — ${p.char.name}${me && normJid(senderJid) === normJid(p.jid) ? ' (you)' : ''}`).join('\n');
  const secs = Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000));
  const youLine = me
    ? (me.alive ? `\nYou are *${me.char.name}*${me.role !== 'CIVILIAN' ? ` — and ${me.role === 'KILLER' ? 'the *KILLER*' : 'the *INVESTIGATOR*'}` : ''}.` : '\nYou are dead. You watch now.')
    : '';
  await sendGroup(sock, chatId,
    `${botMarker}🕯️ *CASE Nº ${String(g.caseNo).padStart(3, '0')} — ${cases.MANOR_NAME}*\n\n` +
    `Phase: *${g.phase}* · Night *${g.night}* · ⏱️ ${Math.floor(secs / 60)}m ${secs % 60}s left\n\n` +
    `The living:\n${lines}\n${youLine}`);
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
    `*In play (group):*\n` +
    `• \`${prefix} mm vote <n|name|skip>\` — cast your ballot\n` +
    `• \`${prefix} mm status\` — the state of the case\n` +
    `• \`${prefix} mm end\` — host/mod closes the case\n\n` +
    `*At night (in your DM with the bot):*\n` +
    `• \`${prefix} mm kill <n|name>\` — killer only\n` +
    `• \`${prefix} mm investigate <n|name>\` — investigator only\n\n` +
    `Roles: 1 Killer · 1 Investigator · the rest Civilians.\n` +
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

async function handleCommand(ctx) {
  ensureRehydrated();
  const { sock, chatId, senderJid, botMarker } = ctx;
  const sub = (ctx.sub || 'help').toLowerCase().trim();
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
    case 'investigate':
    case 'inv':
    case 'study':
      return submitInvestigate(ctx, ctx.rest);
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
    onPhaseTimeout, // QA: fast-forward phase deadlines
    PHASE,
  },
};
