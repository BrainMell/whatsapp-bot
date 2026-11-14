// ============================================
// GAME NIGHT - host-driven multi-stage event
// ============================================
// .j gn start            create the event in this chat (you become host)
// .j gn next             host: launch / advance to the next stage
// .j gn scores           live event scoreboard      (alias: .j gn lb)
// .j gn pick <game>      stage 3: wordle | chess | emoji
// .j gn retry            host: re-run an interrupted stage (after a restart)
// .j gn skip             host: close the current stage with what it has so far
// .j gn end              host: finish the event and post final standings
//
// Stages: lobby -> quiz1 -> ttt -> pick -> rush (20 min) -> quiz2 -> done
//
// PERSISTENCE: every mutation is written to disk (atomic tmp+rename) AND to the
// shared system KV (Mongo-backed). On boot, resume() reloads the newer copy and
// re-arms timers from absolute timestamps, so a restart never loses scores.
// Quiz and tourney engines hold their live round in memory: if the server dies
// mid-round that round is marked "interrupted" and the host runs `.j gn retry`.
// All points already banked from finished stages and the Sugar Rush tallies
// (wordle solves, chess results, emoji points) survive.
// ============================================

const fs = require("fs");
const path = require("path");
const system = require("../utils/system");
const botConfig = require("../../botConfig");

const quiz = require("./quiz");
const wordle = require("./wordle");
const chess = require("./chess");
const tourney = require("./tictactoeTournament");

const EVENTS = new Map(); // chatId -> event
const TIMERS = new Map(); // chatId -> { rush, chess, emoji }
let DEPS = { smartGroqCall: null, MODELS: null };
let SOCK = null;
let MARK = "";

const RUSH_MIN_DEFAULT = 20;
const BLITZ_CAP_MS = 3 * 60 * 1000;
const EMOJI_GAP_MS = 60 * 1000;
// event points by finishing rank (rank 1 first); participants below the table get FLOOR
const RANK_PTS = [100, 70, 50, 40, 30, 25, 20, 15, 12, 10];
const FLOOR = 5;
const GAMES = { wordle: "🍬 Wordle Sugar Rush", chess: "♟️ Blitz Chess (3 min)", emoji: "🧩 Emoji Decode" };

// ---------- persistence ----------
function dir() {
  const base = global.WA_INSTANCE_DIR || path.join(__dirname, "..", "..", "data");
  const d = path.join(base, "gamenight");
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) { /* ignore */ }
  return d;
}
const fileFor = (chatId) => path.join(dir(), String(chatId).replace(/[^a-z0-9]/gi, "_") + ".json");
const kvKey = (chatId) => `gamenight:${chatId}`;

function save(ev) {
  ev.updatedAt = Date.now();
  const snap = JSON.stringify(ev);
  try {
    const f = fileFor(ev.chatId), tmp = f + ".tmp";
    fs.writeFileSync(tmp, snap);
    fs.renameSync(tmp, f);
  } catch (e) { console.error("[GameNight] disk save failed:", e.message); }
  try { Promise.resolve(system.set(kvKey(ev.chatId), JSON.parse(snap))).catch(() => {}); } catch (_) { /* ignore */ }
}

function loadOne(chatId) {
  let a = null, b = null;
  try { a = JSON.parse(fs.readFileSync(fileFor(chatId), "utf8")); } catch (_) { /* none */ }
  try { b = system.get(kvKey(chatId), null); } catch (_) { /* none */ }
  if (a && b) return (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
  return a || b || null;
}

// ---------- small helpers ----------
const px = () => botConfig.getPrefix();
const num = (jid) => String(jid || "").split("@")[0].split(":")[0];
const norm = (jid) => num(jid);
const tag = (jid) => `@${num(jid)}`;
async function say(chatId, text, mentions = []) {
  if (!SOCK) return;
  try { await SOCK.sendMessage(chatId, { text: MARK + text, contextInfo: mentions.length ? { mentionedJid: mentions } : undefined }); }
  catch (e) { console.error("[GameNight] send failed:", e.message); }
}
function addPoints(ev, jid, name, pts, stage) {
  const k = norm(jid);
  const row = (ev.scores[k] = ev.scores[k] || { jid, name: name || tag(jid), total: 0, by: {} });
  if (name) row.name = name;
  row.total += pts;
  row.by[stage] = (row.by[stage] || 0) + pts;
}
function board(ev, title) {
  const rows = Object.values(ev.scores).sort((a, b) => b.total - a.total);
  if (!rows.length) return `${title}\n\n_No points yet._`;
  const medal = ["🥇", "🥈", "🥉"];
  const lines = rows.slice(0, 15).map((r, i) => `${medal[i] || `${i + 1}.`} ${tag(r.jid)} - *${r.total}* pts` + (Object.keys(r.by).length ? `  _(${Object.entries(r.by).map(([s, v]) => `${s}:${v}`).join(" ")})_` : ""));
  return `${title}\n\n${lines.join("\n")}`;
}
const boardMentions = (ev) => Object.values(ev.scores).map((r) => r.jid);
// order = [{jid,name}] best first (ties may share a rank via `tie` array index groups)
function awardByRank(ev, order, stage) {
  order.forEach((p, i) => addPoints(ev, p.jid, p.name, RANK_PTS[i] != null ? RANK_PTS[i] : FLOOR, stage));
}
const STAGES = ["lobby", "quiz1", "ttt", "pick", "rush", "quiz2", "done"];
const stageLabel = { lobby: "Lobby", quiz1: "Round 1 - Mega Quiz", ttt: "Round 2 - Tic-Tac-Toe Tournament", pick: "Round 3 - Pick your game", rush: "Round 3 - Sugar Rush", quiz2: "Finale - Comics & Games Quiz", done: "Finished" };

function nextAfter(ev) {
  const i = STAGES.indexOf(ev.stage);
  return STAGES[Math.min(i + 1, STAGES.length - 1)];
}

// ---------- hooks (re)installed on start AND on resume ----------
function installHooks(ev) {
  const chatId = ev.chatId;
  if (ev.stage === "rush" && ev.rush && ev.rush.open) {
    wordle.eventHooks.set(chatId, {
      active: () => !!(ev.rush && ev.rush.open && Date.now() < ev.rush.endsAt),
      onResult: (jid, name, won, tries) => {
        const w = (ev.rush.wordle[norm(jid)] = ev.rush.wordle[norm(jid)] || { jid, name, solved: 0, tried: 0, guesses: 0 });
        w.name = name || w.name; w.tried += 1; if (won) { w.solved += 1; w.guesses += tries; }
        save(ev);
        return { solved: w.solved };
      },
    });
  }
}

// ---------- stage launchers ----------
async function launchQuiz(ev, packKey, stage, m) {
  const chatId = ev.chatId;
  quiz.eventHooks.set(chatId, {
    onFinish: async (entries) => {
      const sorted = [...entries].sort((a, b) => b.points - a.points);
      awardByRank(ev, sorted.map((e) => ({ jid: e.jid, name: e.name })), stage);
      ev.stageDone[stage] = true; ev.running = null; save(ev);
      await say(ev.chatId, board(ev, `📊 *GAME NIGHT - STANDINGS after ${stageLabel[stage]}*`) + `\n\n➡️ Host: \`${px()} gn next\` to continue.`, boardMentions(ev));
    },
  });
  ev.running = { kind: "quiz", pack: packKey, stage, startedAt: Date.now() }; save(ev);
  const res = await quiz.startQuiz(SOCK, chatId, ev.host, MARK, m, `-preplanned ${packKey}`, ev.hostName, DEPS.smartGroqCall, DEPS.MODELS);
  if (res && res.message) await SOCK.sendMessage(chatId, { text: res.message, contextInfo: res.mentions ? { mentionedJid: res.mentions } : undefined }).catch(() => {});
}

async function launchTourney(ev, m) {
  const chatId = ev.chatId;
  ev.running = { kind: "ttt", stage: "ttt", startedAt: Date.now() }; save(ev);
  await tourney.handle(SOCK, chatId, ev.host, ["create", "mixed", "bo1", "max", "16", "Game Night Showdown"], m || {}, MARK, ev.hostName);
  const t = tourney._tournaments.get(chatId);
  if (!t) { ev.running = null; save(ev); return say(chatId, "❌ Could not create the tournament."); }
  t.eventMode = true;
  t.onFinish = async ({ champ, runnerUp, semiLosers, t: tt }) => {
    const placed = [champ, runnerUp, ...semiLosers].filter(Boolean);
    const seen = new Set(placed.map((p) => norm(p.jid)));
    const rest = tt.players.filter((p) => !seen.has(norm(p.jid))).sort((a, b) => ((tt.stats[norm(b.jid)] || {}).w || 0) - ((tt.stats[norm(a.jid)] || {}).w || 0));
    // semis share a rank: give both the 3rd-place award
    const order = [champ, runnerUp];
    awardByRank(ev, order.filter(Boolean).map((p) => ({ jid: p.jid, name: p.name })), "ttt");
    semiLosers.forEach((p) => addPoints(ev, p.jid, p.name, RANK_PTS[2], "ttt"));
    rest.forEach((p, i) => addPoints(ev, p.jid, p.name, Math.max(FLOOR, RANK_PTS[4 + Math.min(i, 5)] || FLOOR), "ttt"));
    ev.stageDone.ttt = true; ev.running = null; save(ev);
    await say(chatId, board(ev, `📊 *GAME NIGHT - STANDINGS after Tic-Tac-Toe*`) + `\n\n➡️ Host: \`${px()} gn next\` to continue.`, boardMentions(ev));
  };
  await say(chatId, `🎟 Everyone: \`${px()} tourney join\` - host starts the bracket with \`${px()} tourney start\`.`);
}

async function openPick(ev) {
  ev.stage = "pick"; ev.pick = { choices: {}, openedAt: Date.now() }; ev.running = null; save(ev);
  await say(ev.chatId,
    `🎲 *ROUND 3 - PICK YOUR GAME*\n\n` +
    `${GAMES.wordle}: solve as many Wordles as you can in the window\n` +
    `${GAMES.chess}: head-to-head blitz, closest to winning takes it\n` +
    `${GAMES.emoji}: first to decode the emoji puzzle scores\n\n` +
    `Choose with \`${px()} gn pick wordle\` / \`chess\` / \`emoji\`. You can change your pick until the host runs \`${px()} gn next\`.`);
}

async function startRush(ev) {
  const mins = ev.rushMin || RUSH_MIN_DEFAULT;
  const picks = ev.pick.choices;
  const by = (g) => Object.values(picks).filter((p) => p.game === g);
  ev.stage = "rush";
  ev.rush = { open: true, startedAt: Date.now(), endsAt: Date.now() + mins * 60 * 1000, wordle: {}, chess: { players: by("chess"), queue: [], results: {}, cur: null }, emoji: { players: by("emoji"), n: 0, solved: {}, cur: null, used: [] } };
  save(ev);
  installHooks(ev);
  const names = (g) => by(g).map((p) => tag(p.jid)).join(" ") || "_nobody_";
  await say(ev.chatId,
    `🚀 *SUGAR RUSH BEGINS - ${mins} MINUTES!*\n\n${GAMES.wordle}: ${names("wordle")}\n   Start with \`${px()} wordle\` - a new word loads automatically after every game.\n\n` +
    `${GAMES.chess}: ${names("chess")}\n   Games are called one at a time, 3 minutes each; unfinished games are judged on material.\n\n` +
    `${GAMES.emoji}: ${names("emoji")}\n   A puzzle drops every minute - type the answer in chat.\n\n⏱ Ends <t:${Math.floor(ev.rush.endsAt / 1000)}:R>`,
    Object.values(picks).map((p) => p.jid));
  armRush(ev);
}

function clearTimers(chatId) {
  const t = TIMERS.get(chatId);
  if (t) Object.values(t).forEach((x) => { try { clearTimeout(x); clearInterval(x); } catch (_) { /* ignore */ } });
  TIMERS.delete(chatId);
}
function setTimer(chatId, key, id) {
  const t = TIMERS.get(chatId) || {};
  if (t[key]) { clearTimeout(t[key]); clearInterval(t[key]); }
  if (id && id.unref) id.unref();
  t[key] = id; TIMERS.set(chatId, t);
}

function armRush(ev) {
  const left = Math.max(0, ev.rush.endsAt - Date.now());
  setTimer(ev.chatId, "rush", setTimeout(() => endRush(ev).catch((e) => console.error("[GameNight] endRush", e)), left));
  setTimer(ev.chatId, "warn", setTimeout(() => say(ev.chatId, "⏰ *5 minutes left in Sugar Rush!*"), Math.max(0, left - 5 * 60 * 1000)));
  if (ev.rush.emoji.players.length) { nextEmoji(ev, true); }
  if (ev.rush.chess.players.length >= 2) { buildChessQueue(ev); nextChess(ev); }
}

// ---------- Wordle / Chess / Emoji sub-games ----------
const EMOJI = [
  ["🧙‍♂️💍🌋", ["lord of the rings", "lotr", "the lord of the rings"]],
  ["🍄👨‍🔧👸", ["super mario", "super mario bros", "mario"]],
  ["⛏️🟩🧟", ["minecraft"]],
  ["🦔💨💍", ["sonic", "sonic the hedgehog"]],
  ["🐷🐦💥", ["angry birds"]],
  ["🧟🌻🧠", ["plants vs zombies", "plants versus zombies", "pvz"]],
  ["🗡️🧝‍♂️🔺", ["zelda", "the legend of zelda", "legend of zelda"]],
  ["👻🟡🍒", ["pac man", "pacman", "pac-man"]],
  ["🚗⚽🚀", ["rocket league"]],
  ["🍗🔫🪂", ["pubg", "playerunknowns battlegrounds"]],
  ["🧛‍♂️🏰🌙", ["castlevania"]],
  ["🕳️🔫🎂", ["portal"]],
  ["🏴‍☠️🍖🐒", ["one piece"]],
  ["🍥🦊🍜", ["naruto"]],
  ["📓💀🍎", ["death note"]],
  ["🧊👸⛄", ["frozen"]],
  ["🐠🔍🌊", ["finding nemo", "nemo"]],
  ["🦁👑🌅", ["the lion king", "lion king"]],
  ["🤖🗑️🌱", ["wall e", "wall-e", "walle"]],
  ["🎈🏠👴", ["up"]],
  ["🦖🏝️🧬", ["jurassic park", "jurassic world"]],
  ["🚢🧊❤️", ["titanic"]],
  ["🦈🏖️🎶", ["jaws"]],
  ["🕰️🚗⚡", ["back to the future"]],
  ["🔫🦆🐕", ["duck hunt"]],
  ["🏰🍄🐢", ["super mario", "mario"]],
  ["🐉🧔🗡️", ["skyrim", "the elder scrolls v skyrim", "elder scrolls"]],
  ["🏎️🍌🐢", ["mario kart"]],
  ["🏠🧑‍🤝‍🧑💰", ["the sims", "sims"]],
  ["🎣🏝️🐾", ["animal crossing"]],
];
const nrm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function nextEmoji(ev, first) {
  const E = ev.rush.emoji;
  if (!ev.rush.open || Date.now() >= ev.rush.endsAt - 5000) return;
  let idx;
  const pool = EMOJI.map((_, i) => i).filter((i) => !E.used.includes(i));
  idx = pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * EMOJI.length);
  E.used.push(idx); E.n += 1; E.cur = { idx, openedAt: Date.now(), by: null };
  save(ev);
  await say(ev.chatId, `🧩 *EMOJI DECODE #${E.n}* - name the game or movie:\n\n${EMOJI[idx][0]}\n\n_First correct answer in chat scores (+3, +1 bonus if under 15s)._`, E.players.map((p) => p.jid));
  setTimer(ev.chatId, "emoji", setTimeout(async () => {
    if (E.cur && !E.cur.by) { await say(ev.chatId, `⌛ Time! It was *${EMOJI[E.cur.idx][1][0]}*.`); E.cur = null; save(ev); }
    nextEmoji(ev);
  }, EMOJI_GAP_MS));
}

function handleText(sock, chatId, senderJid, text) {
  const ev = EVENTS.get(chatId);
  if (!ev || ev.stage !== "rush" || !ev.rush || !ev.rush.open) return false;
  const E = ev.rush.emoji;
  if (!E.cur || E.cur.by) return false;
  if (!E.players.some((p) => norm(p.jid) === norm(senderJid))) return false;
  const guess = nrm(text);
  if (!guess) return false;
  if (!EMOJI[E.cur.idx][1].some((a) => nrm(a) === guess)) return false;
  const fast = Date.now() - E.cur.openedAt < 15000;
  E.cur.by = senderJid;
  const row = (E.solved[norm(senderJid)] = E.solved[norm(senderJid)] || { jid: senderJid, name: tag(senderJid), pts: 0, n: 0 });
  row.pts += fast ? 4 : 3; row.n += 1;
  save(ev);
  say(chatId, `✅ ${tag(senderJid)} got it - *${EMOJI[E.cur.idx][1][0]}*! (+${fast ? 4 : 3})`, [senderJid]);
  setTimer(chatId, "emoji", setTimeout(() => nextEmoji(ev), 4000));
  return true;
}

function buildChessQueue(ev) {
  const C = ev.rush.chess;
  const ps = C.players.map((p) => p.jid);
  const pairs = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) pairs.push([ps[i], ps[j]]);
  for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
  C.queue = pairs; save(ev);
}
function material(state) {
  const val = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let w = 0, b = 0;
  for (const row of state.chess.board()) for (const sq of row) if (sq) (sq.color === "w" ? (w += val[sq.type]) : (b += val[sq.type]));
  return { w, b };
}
function chessCredit(ev, jid, pts) {
  const C = ev.rush.chess; const k = norm(jid);
  C.results[k] = C.results[k] || { jid, name: tag(jid), pts: 0, w: 0, d: 0, l: 0 };
  C.results[k].pts += pts;
}
async function nextChess(ev) {
  const C = ev.rush.chess, chatId = ev.chatId;
  if (!ev.rush.open || C.cur) return;
  const left = ev.rush.endsAt - Date.now();
  if (left < 45000 || !C.queue.length) { if (!C.queue.length && !C.cur) await say(chatId, "♟️ Blitz pairings exhausted - standings stand until the Rush ends."); return; }
  if (chess.getGame && chess.getGame(chatId)) { setTimer(chatId, "chess", setTimeout(() => nextChess(ev), 15000)); return; } // someone else's game on this chat
  const [a, b] = C.queue.shift();
  const state = chess.createGame(a, b, chatId, {});
  C.cur = { a, b, id: state.id, startedAt: Date.now() }; save(ev);
  chess.settleHooks.set(chatId, (result) => {
    if (!C.cur) return;
    if (result === "d") { chessCredit(ev, a, 1); chessCredit(ev, b, 1); C.results[norm(a)].d++; C.results[norm(b)].d++; }
    else { const win = result === "w" ? a : b, lose = result === "w" ? b : a; chessCredit(ev, win, 3); chessCredit(ev, lose, 0); C.results[norm(win)].w++; C.results[norm(lose)].l++; }
    C.cur = null; save(ev); chess.settleHooks.delete(chatId);
    setTimeout(() => nextChess(ev), 5000);
  });
  await chess.sendBoard(SOCK, chatId, state, MARK + `♟️ *BLITZ BOARD* - ${tag(a)} (White) vs ${tag(b)} (Black)\n⏱ 3 minutes total, then judged on material.`, [a, b]);
  const cap = Math.min(BLITZ_CAP_MS, left - 15000);
  setTimer(chatId, "chesscap", setTimeout(() => adjudicate(ev).catch(() => {}), cap));
}
async function adjudicate(ev) {
  const C = ev.rush.chess, chatId = ev.chatId;
  if (!C.cur) return;
  const state = chess.getGame(chatId);
  const { a, b } = C.cur;
  if (!state) { C.cur = null; save(ev); return nextChess(ev); }
  const m = material(state);
  chess.settleHooks.delete(chatId);
  let line;
  if (m.w === m.b) { chessCredit(ev, a, 1); chessCredit(ev, b, 1); C.results[norm(a)].d++; C.results[norm(b)].d++; line = "Equal material - draw (1 pt each)."; }
  else { const win = m.w > m.b ? a : b, lose = m.w > m.b ? b : a; chessCredit(ev, win, 2); chessCredit(ev, lose, 0); C.results[norm(win)].w++; C.results[norm(lose)].l++; line = `${tag(win)} leads on material (${Math.max(m.w, m.b)} v ${Math.min(m.w, m.b)}) - judged winner (2 pts).`; }
  state.status = "finished"; try { chess.deleteGame(chatId); } catch (_) { /* ignore */ }
  C.cur = null; save(ev);
  await say(chatId, `⏱ *Blitz time!* ${line}`, [a, b]);
  setTimeout(() => nextChess(ev), 4000);
}

async function endRush(ev) {
  if (!ev.rush || !ev.rush.open) return;
  const chatId = ev.chatId;
  if (ev.rush.chess.cur) await adjudicate(ev);
  ev.rush.open = false;
  wordle.eventHooks.delete(chatId); chess.settleHooks.delete(chatId); clearTimers(chatId);
  // rank inside each category, award event points
  const wl = Object.values(ev.rush.wordle).sort((a, b) => b.solved - a.solved || (a.guesses / (a.solved || 1)) - (b.guesses / (b.solved || 1)));
  awardByRank(ev, wl.map((w) => ({ jid: w.jid, name: w.name })), "wordle");
  const cl = Object.values(ev.rush.chess.results).sort((a, b) => b.pts - a.pts || b.w - a.w);
  awardByRank(ev, cl.map((c) => ({ jid: c.jid, name: c.name })), "chess");
  const el = Object.values(ev.rush.emoji.solved).sort((a, b) => b.pts - a.pts);
  awardByRank(ev, el.map((e) => ({ jid: e.jid, name: e.name })), "emoji");
  ev.stageDone.rush = true; ev.running = null; save(ev);
  let out = `🏁 *SUGAR RUSH OVER!*\n\n`;
  out += `${GAMES.wordle}\n` + (wl.length ? wl.slice(0, 5).map((w, i) => `${i + 1}. ${tag(w.jid)} - ${w.solved} solved`).join("\n") : "_no solves_") + "\n\n";
  out += `${GAMES.chess}\n` + (cl.length ? cl.slice(0, 5).map((c, i) => `${i + 1}. ${tag(c.jid)} - ${c.pts} pts (${c.w}W ${c.d}D ${c.l}L)`).join("\n") : "_no games_") + "\n\n";
  out += `${GAMES.emoji}\n` + (el.length ? el.slice(0, 5).map((e, i) => `${i + 1}. ${tag(e.jid)} - ${e.n} decoded`).join("\n") : "_no solves_") + "\n";
  await say(chatId, out + "\n" + board(ev, `📊 *GAME NIGHT - STANDINGS after Sugar Rush*`) + `\n\n➡️ Host: \`${px()} gn next\` for the finale.`, boardMentions(ev));
}

// ---------- command handler ----------
function help() {
  const p = px();
  return `🎮 *GAME NIGHT*\n\n\`${p} gn start\` - create the event (you host)\n\`${p} gn next\` - host: start / advance the next round\n\`${p} gn scores\` - live standings\n\`${p} gn pick wordle|chess|emoji\` - choose your Round 3 game\n\`${p} gn retry\` - host: re-run an interrupted round\n\`${p} gn skip\` - host: close the current round with what it has\n\`${p} gn window <minutes>\` - host: Sugar Rush length (default 20)\n\`${p} gn end\` - host: finish the event\n\n*Rounds:* Mega Quiz → Tic-Tac-Toe Tournament → Pick a game (Wordle Sugar Rush / Blitz Chess / Emoji Decode) → Comics & Games finale`;
}

async function handle(sock, chatId, senderJid, args, m, botMarker, senderName) {
  SOCK = sock; MARK = botMarker || MARK;
  const sub = (args[0] || "").toLowerCase();
  let ev = EVENTS.get(chatId) || loadOne(chatId);
  if (ev && ev.stage !== "done") EVENTS.set(chatId, ev); else if (ev && ev.stage === "done") ev = EVENTS.get(chatId) || ev;
  const isHost = ev && norm(ev.host) === norm(senderJid);
  const reply = (t, mentions = []) => say(chatId, t, mentions);

  if (!sub || sub === "help") return reply(help());

  if (sub === "start" || sub === "create") {
    if (ev && ev.stage !== "done") return reply(`❌ A Game Night is already running here (${stageLabel[ev.stage]}). \`${px()} gn scores\``);
    ev = { id: Date.now().toString(36), chatId, host: senderJid, hostName: senderName || tag(senderJid), stage: "lobby", stageDone: {}, scores: {}, running: null, rushMin: RUSH_MIN_DEFAULT, createdAt: Date.now() };
    EVENTS.set(chatId, ev); save(ev);
    return reply(`🎉 *GAME NIGHT IS ON!* Host: ${tag(senderJid)}\n\n1️⃣ Mega Quiz\n2️⃣ Tic-Tac-Toe Tournament\n3️⃣ Pick: Wordle Sugar Rush / Blitz Chess / Emoji Decode\n4️⃣ Comics & Games Finale\n\nPoints carry across every round. Host runs \`${px()} gn next\` to begin each round.`, [senderJid]);
  }
  if (!ev || ev.stage === "done" && sub !== "scores" && sub !== "lb") return reply(`❌ No Game Night here. \`${px()} gn start\``);

  if (sub === "scores" || sub === "lb" || sub === "board" || sub === "status") {
    return reply(board(ev, `📊 *GAME NIGHT - ${stageLabel[ev.stage]}*`), boardMentions(ev));
  }

  if (sub === "pick" || sub === "choose") {
    if (ev.stage !== "pick") return reply("❌ Game choice isn't open right now.");
    const g = nrm(args[1]);
    const key = g.startsWith("word") ? "wordle" : g.startsWith("chess") ? "chess" : g.startsWith("emoji") ? "emoji" : null;
    if (!key) return reply(`❌ Pick one: \`${px()} gn pick wordle\` / \`chess\` / \`emoji\``);
    ev.pick.choices[norm(senderJid)] = { jid: senderJid, game: key }; save(ev);
    const counts = Object.values(ev.pick.choices).reduce((a, p) => ((a[p.game] = (a[p.game] || 0) + 1), a), {});
    return reply(`✅ ${tag(senderJid)} → ${GAMES[key]}\n\n${Object.keys(GAMES).map((k) => `${GAMES[k]}: ${counts[k] || 0}`).join("\n")}`, [senderJid]);
  }

  if (!isHost) return reply("❌ Only the host can do that.");

  if (sub === "window") {
    const n = parseInt(args[1], 10);
    if (!(n >= 1 && n <= 60)) return reply("❌ Give minutes between 1 and 60.");
    ev.rushMin = n; save(ev); return reply(`⏱ Sugar Rush will run ${n} minute(s).`);
  }

  if (sub === "end") {
    clearTimers(chatId); wordle.eventHooks.delete(chatId); chess.settleHooks.delete(chatId); quiz.eventHooks.delete(chatId);
    const rows = Object.values(ev.scores).sort((a, b) => b.total - a.total);
    ev.stage = "done"; save(ev);
    const top3 = rows.slice(0, 3).map((r, i) => `${["🥇", "🥈", "🥉"][i]} ${tag(r.jid)} - ${r.total} pts`).join("\n");
    return reply(board(ev, `🏆 *GAME NIGHT - FINAL STANDINGS*`) + (top3 ? `\n\n*Podium*\n${top3}` : ""), boardMentions(ev));
  }

  if (sub === "skip") {
    if (ev.stage === "rush") { await endRush(ev); return; }
    if (ev.running && ev.running.kind === "quiz") { quiz.eventHooks.get(chatId) && (await quiz.endQuiz(sock, chatId, senderJid, botMarker, m).catch(() => {})); return; }
    if (ev.running && ev.running.kind === "ttt") { tourney._tournaments.delete(chatId); ev.running = null; ev.stageDone.ttt = true; save(ev); return reply(`⏭ Tournament closed with no points awarded. \`${px()} gn next\` to continue.`); }
    return reply("❌ Nothing to skip.");
  }

  if (sub === "retry") {
    if (!ev.running && !ev.interrupted) return reply("❌ Nothing to retry.");
    const stage = ev.interrupted || (ev.running && ev.running.stage);
    ev.interrupted = null; ev.running = null; save(ev);
    return runStage(ev, stage, m);
  }

  if (sub === "next" || sub === "go") {
    if (ev.running) return reply(`⏳ ${stageLabel[ev.running.stage]} is still in progress. \`${px()} gn skip\` to close it.`);
    if (ev.stage === "rush" && ev.rush && ev.rush.open) return reply("⏳ Sugar Rush is still running.");
    if (ev.stage === "pick") { if (!Object.keys(ev.pick.choices).length) return reply("❌ Nobody has picked a game yet."); return startRush(ev); }
    const nxt = nextAfter(ev);
    if (nxt === "done") return reply(`🏁 That's every round! \`${px()} gn end\` for the final standings.`);
    return runStage(ev, nxt, m);
  }

  return reply(help());
}

async function runStage(ev, stage, m) {
  const chatId = ev.chatId;
  if (stage === "pick") { ev.stage = "pick"; save(ev); return openPick(ev); }
  ev.stage = stage; save(ev);
  if (stage === "quiz1") { await say(chatId, `🎯 *ROUND 1 - MEGA QUIZ* loading...`); return launchQuiz(ev, "event1", "quiz1", m); }
  if (stage === "ttt") { await say(chatId, `🏟 *ROUND 2 - TIC-TAC-TOE TOURNAMENT*`); return launchTourney(ev, m); }
  if (stage === "rush") { ev.stage = "pick"; save(ev); return startRush(ev); }
  if (stage === "quiz2") { await say(chatId, `📚🎮 *FINALE - COMICS & GAMES QUIZ* loading...`); return launchQuiz(ev, "event2", "quiz2", m); }
}

// ---------- boot resume ----------
async function resume(sock, botMarker, deps) {
  SOCK = sock; MARK = botMarker || MARK; if (deps) DEPS = deps;
  let files = [];
  try { files = fs.readdirSync(dir()).filter((f) => f.endsWith(".json")); } catch (_) { /* none */ }
  for (const f of files) {
    let ev;
    try { ev = JSON.parse(fs.readFileSync(path.join(dir(), f), "utf8")); } catch (_) { continue; }
    const kv = (() => { try { return system.get(kvKey(ev.chatId), null); } catch (_) { return null; } })();
    if (kv && (kv.updatedAt || 0) > (ev.updatedAt || 0)) ev = kv;
    if (!ev || ev.stage === "done" || EVENTS.has(ev.chatId)) continue;
    EVENTS.set(ev.chatId, ev);
    if (ev.stage === "rush" && ev.rush && ev.rush.open) {
      installHooks(ev);
      if (Date.now() >= ev.rush.endsAt) { await say(ev.chatId, "🔁 Server restarted - closing Sugar Rush (time was already up)."); await endRush(ev); }
      else {
        // an in-flight chess board is gone from memory unless chess.loadActiveGames restored it
        if (ev.rush.chess.cur && !(chess.getGame && chess.getGame(ev.chatId))) { ev.rush.chess.queue.unshift([ev.rush.chess.cur.a, ev.rush.chess.cur.b]); ev.rush.chess.cur = null; }
        save(ev); armRush(ev);
        await say(ev.chatId, `🔁 *Server restarted - Game Night restored.* All points and Sugar Rush tallies are intact; the clock keeps its original end time. Wordle players: start your next word with \`${px()} wordle\`.`);
      }
    } else if (ev.running) {
      ev.interrupted = ev.running.stage; ev.running = null; save(ev);
      await say(ev.chatId, `🔁 *Server restarted during ${stageLabel[ev.interrupted]}.* Banked points are safe:\n\n${board(ev, "📊 Standings")}\n\nHost: \`${px()} gn retry\` re-runs that round.`, boardMentions(ev));
    }
  }
}

function setDeps(d) { if (d) DEPS = d; }

module.exports = { setDeps, handle, handleText, resume, _events: EVENTS, _EMOJI: EMOJI, _material: material };
