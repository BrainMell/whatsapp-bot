// ============================================
// GAME NIGHT - host dry-run / visual test
// ============================================
// .j gn test            run the NEXT test step (each step posts exactly what players would see)
// .j gn test <1-7>      jump to a step      .j gn test logos all   fetch-check every pack logo
// .j gn test reset      start over
// Never touches a live event: uses throwaway ids, cleans up after itself, and refuses to run
// while a real Game Night is active in this chat.
// ============================================
const fs = require("fs");
const path = require("path");
const system = require("../utils/system");
const botConfig = require("../../botConfig");
const quizMedia = require("./quizMedia");
const packs = require("./quizEventPacks");
const chess = require("./chess");
const wordle = require("./wordle");
const quiz = require("./quiz");
const tourney = require("./tictactoeTournament");
const render = require("./tourneyRender");
const GN = require("./gameNight");

const STATE = new Map(); // chatId -> { step, results: [] }
const STEPS = ["Preflight", "Logo images", "Trivia samples", "Tournament bracket", "Chess blitz board", "Emoji + Wordle", "Scoreboard + restart sim"];
const FAKE = ["233200000001@s.whatsapp.net", "233200000002@s.whatsapp.net", "233200000003@s.whatsapp.net", "233200000004@s.whatsapp.net", "233200000005@s.whatsapp.net", "233200000006@s.whatsapp.net"];
const NAMES = ["Ama", "Kofi", "Esi", "Kwame", "Abena", "Yaw"];
const px = () => botConfig.getPrefix();
const ok = (b) => (b ? "✅" : "❌");

async function sendText(sock, chatId, text, mentions = []) {
  await sock.sendMessage(chatId, { text: "🧪 " + text, contextInfo: mentions.length ? { mentionedJid: mentions } : undefined }).catch(() => {});
}
async function sendImg(sock, chatId, buf, caption) {
  await sock.sendMessage(chatId, { image: buf, caption: "🧪 " + caption }).catch(() => {});
}

// ---- step 1: preflight ----
async function stepPreflight(ctx) {
  const lines = [];
  let bad = 0;
  const chk = (label, cond, extra = "") => { lines.push(`${ok(cond)} ${label}${extra ? " - " + extra : ""}`); if (!cond) bad++; };
  chk("quiz / wordle / chess / tourney hooks exist", quiz.eventHooks instanceof Map && wordle.eventHooks instanceof Map && chess.settleHooks instanceof Map && typeof tourney.handle === "function");
  for (const key of ["event1", "event2"]) {
    const p = packs.get(key);
    const plan = p.plan();
    let logos = 0, trivia = 0, music = 0, badQ = 0, noDecoy = 0;
    const ids = new Set();
    for (const s of plan) {
      if (s.pinnedBrands) { logos += s.pinnedBrands.length; s.pinnedBrands.forEach((b) => { if (!b.decoys || b.decoys.length < 3) noDecoy++; }); }
      if (s.pinnedThemes) music += s.pinnedThemes.length;
      if (s.pinnedTrivia) s.pinnedTrivia.forEach((t) => {
        trivia++;
        if (ids.has(t.id)) badQ++; ids.add(t.id);
        if (t.fmt === "mc" && !(t.options && t.options.length === 4 && t.correct >= 0 && t.correct < 4)) badQ++;
        if (t.fmt === "typed" && !t.answer) badQ++;
      });
    }
    chk(`${key}: ${logos} logos / ${trivia} trivia / ${music} songs`, badQ === 0 && noDecoy === 0, badQ || noDecoy ? `${badQ} bad question(s), ${noDecoy} logo(s) missing decoys` : "structure valid");
  }
  const logoNames = [...packs.E1_BRANDS, ...packs.E2_BRANDS].map((b) => b.name);
  const dsNames = new Set(((require("../../data/logoDataset.json") || {}).brands || []).map((x) => String(x.name || "").toLowerCase()));
  const missing = logoNames.filter((n) => !dsNames.has(n.toLowerCase()));
  chk(`all ${logoNames.length} pack logos exist in dataset`, !missing.length, missing.join(", "));
  const missAns = GN._EMOJI.filter(([, answers]) => !answers.every((a) => GN._nrm(a) === GN._nrm(a)));
  chk(`${GN._EMOJI.length} emoji puzzles loaded`, GN._EMOJI.length >= 20 && !missAns.length);
  // persistence round trip on a throwaway id
  const id = `TEST_${Date.now()}@g.us`;
  const probe = { chatId: id, stage: "rush", scores: { a: { total: 5 } }, rush: { endsAt: Date.now() + 1000 } };
  GN._save(probe);
  const back = GN._loadOne(id);
  chk("disk + database save/load round trip", !!back && back.scores.a.total === 5 && back.stage === "rush");
  try { fs.unlinkSync(GN._fileFor(id)); } catch (_) { /* ignore */ }
  try { await system.set(`gamenight:${id}`, null); } catch (_) { /* ignore */ }
  const live = (() => { try { return !!(global.WA_INSTANCE_DIR || fs.existsSync(path.join(__dirname, "..", "..", "data"))); } catch (_) { return false; } })();
  chk("state directory writable", live);
  await sendText(ctx.sock, ctx.chatId, `*STEP 1/7 - PREFLIGHT*\n\n${lines.join("\n")}`);
  return bad === 0;
}

// ---- step 2: logos ----
async function buildOne(brand) {
  const others = (brand.decoys || []).map((n) => ({ name: n }));
  return quizMedia.buildLogosQuestion(brand, others, "medium").catch(() => null);
}
async function stepLogos(ctx, all) {
  const e1 = packs.E1_BRANDS, e2 = packs.E2_BRANDS;
  if (all) {
    const list = [...e1, ...e2];
    const failed = [];
    for (let i = 0; i < list.length; i += 5) {
      const res = await Promise.all(list.slice(i, i + 5).map(buildOne));
      res.forEach((q, j) => { if (!q || !q._cachedAsset) failed.push(list[i + j].name); });
    }
    await sendText(ctx.sock, ctx.chatId, `*LOGO FETCH CHECK*\n\n${ok(!failed.length)} ${list.length - failed.length}/${list.length} logos fetched${failed.length ? `\n❌ Failed: ${failed.join(", ")}` : ""}\n\nPacks need >= ${packs.get("event1").minBuilt}/56 (round 1) and >= ${packs.get("event2").minBuilt}/37 (finale) to start.`);
    return failed.length === 0;
  }
  const sample = [e1[0], e1[e1.length - 1], e2[0], e2[e2.length - 1]];
  let good = 0;
  for (const b of sample) {
    const q = await buildOne(b);
    if (q && q._cachedAsset) {
      good++;
      const letters = ["A", "B", "C", "D"];
      await sendImg(ctx.sock, ctx.chatId, q._cachedAsset.buf, `*Logo round sample*\n${q.q}\n\n${q.options.map((o, i) => `${letters[i]}. ${o}`).join("\n")}\n\n_(answer: ${letters[q.correct]} - ${b.name})_`);
    } else await sendText(ctx.sock, ctx.chatId, `❌ Could not build logo for *${b.name}*.`);
  }
  await sendText(ctx.sock, ctx.chatId, `*STEP 2/7 - LOGO IMAGES* ${good}/${sample.length} samples built.\nCheck every one with \`${px()} gn test logos all\`.`);
  return good === sample.length;
}

// ---- step 3: trivia samples ----
async function stepTrivia(ctx) {
  const pick = [packs.E1_TRIVIA[3], packs.E1_TRIVIA[13], packs.E2_COMICS[0], packs.E2_COMICS[10], packs.E2_GAMES[2]].filter(Boolean);
  const out = pick.map((t) => {
    const ans = t.fmt === "mc" ? `${["A", "B", "C", "D"][t.correct]}. ${t.options[t.correct]}` : `${t.answer}${t.alts && t.alts.length ? ` (also accepts: ${t.alts.slice(0, 3).join(", ")})` : ""}`;
    const opts = t.fmt === "mc" ? "\n" + t.options.map((o, i) => `${["A", "B", "C", "D"][i]}. ${o}`).join("\n") : "";
    return `*${t.topic}* [${t.difficulty}]\n${t.q}${opts}\n_answer: ${ans}_`;
  });
  await sendText(ctx.sock, ctx.chatId, `*STEP 3/7 - TRIVIA SAMPLES*\n\n${out.join("\n\n")}\n\nThe real quiz asks these in-game with timers, speed bonus and typo tolerance. Full dry run: \`${px()} quiz -preplanned event1\` in a test group.`);
  return true;
}

// ---- step 4: tourney bracket ----
async function stepBracket(ctx) {
  const t = { chatId: ctx.chatId, name: "Game Night Showdown (TEST)", grid: "mixed", bestOf: 1, maxPlayers: 16, status: "running", rounds: [], stats: {}, champion: null, tag: "🏟️",
    players: FAKE.map((j, i) => ({ jid: j, name: NAMES[i], score: 10 - i, joined: i + 1, seed: 0 })) };
  tourney._build(t);
  t.gridFor = () => 3;
  let buf = null;
  try { buf = render.renderBracket(t); } catch (e) { await sendText(ctx.sock, ctx.chatId, `❌ Bracket render failed: ${e.message}`); return false; }
  if (buf) await sendImg(ctx.sock, ctx.chatId, buf, `*STEP 4/7 - TOURNAMENT BRACKET* (6 fake players)\nReal run: players \`${px()} tourney join\`, then \`${px()} tourney start\`. Points after the final: 1st 100 / 2nd 70 / semi-finalists 50, others scale down.`);
  else await sendText(ctx.sock, ctx.chatId, `❌ Bracket renderer returned no image.`);
  return !!buf;
}

// ---- step 5: chess ----
async function stepChess(ctx) {
  if (chess.getGame && chess.getGame(ctx.chatId)) { await sendText(ctx.sock, ctx.chatId, "⚠️ A chess game is active in this chat - finish it, then rerun this step."); return false; }
  const state = chess.createGame(FAKE[0], FAKE[1], ctx.chatId, {});
  try {
    await chess.sendBoard(ctx.sock, ctx.chatId, state, `🧪 *STEP 5/7 - BLITZ BOARD* (fake players)\n♟️ ${NAMES[0]} (White) vs ${NAMES[1]} (Black)\n⏱ In the event: 3 minutes total, then judged on material.`, []);
    const m = GN._material(state);
    await sendText(ctx.sock, ctx.chatId, `Material judge check: White ${m.w} vs Black ${m.b} → ${m.w === m.b ? "draw (1 pt each)" : "leader gets judged win (2 pts)"}.\nWin 3 / judged win 2 / draw 1 / loss 0.`);
  } finally { try { chess.deleteGame(ctx.chatId); } catch (_) { /* ignore */ } }
  return true;
}

// ---- step 6: emoji + wordle ----
async function stepEmoji(ctx) {
  const puzzle = GN._EMOJI[Math.floor(Math.random() * GN._EMOJI.length)];
  const selfOk = GN._EMOJI.every(([, ans]) => ans.every((a) => GN._nrm(a).length > 0));
  await sendText(ctx.sock, ctx.chatId,
    `*STEP 6/7 - EMOJI DECODE + WORDLE*\n\n🧩 *EMOJI DECODE #1* - name the game or movie:\n\n${puzzle[0]}\n\n_(answer: ${puzzle[1][0]} - typed as plain chat text; first correct scores +3, +1 under 15s)_\n\n` +
    `🍬 *Wordle Sugar Rush* can only be proven live: run \`${px()} gn start\`, \`${px()} gn window 1\`, jump the stages with \`${px()} gn skip\`, pick wordle and play \`${px()} wordle\` - a new word loads after every game and the solve count is tallied.`);
  return selfOk;
}

// ---- step 7: scoreboard + restart sim ----
async function stepBoard(ctx) {
  const id = `TEST_${Date.now()}@g.us`;
  const ev = { id: "t", chatId: id, host: FAKE[0], hostName: "Host", stage: "rush", stageDone: { quiz1: true, ttt: true }, scores: {}, running: null, rushMin: 20,
    rush: { open: true, startedAt: Date.now(), endsAt: Date.now() + 600000, wordle: { 1: { jid: FAKE[1], name: "Kofi", solved: 4, tried: 5, guesses: 17 } }, chess: { players: [], queue: [], results: {}, cur: null }, emoji: { players: [], n: 3, solved: {}, cur: null, used: [] } } };
  FAKE.forEach((j, i) => { GN._addPoints(ev, j, NAMES[i], [100, 70, 50, 40, 30, 25][i], "quiz1"); });
  GN._addPoints(ev, FAKE[1], "Kofi", 70, "ttt"); GN._addPoints(ev, FAKE[0], "Ama", 50, "ttt");
  GN._save(ev);
  const back = GN._loadOne(id);
  const same = !!back && JSON.stringify(back.scores) === JSON.stringify(ev.scores) && back.rush.wordle[1].solved === 4 && Math.abs(back.rush.endsAt - ev.rush.endsAt) < 5;
  try { fs.unlinkSync(GN._fileFor(id)); } catch (_) { /* ignore */ }
  try { await system.set(`gamenight:${id}`, null); } catch (_) { /* ignore */ }
  await sendText(ctx.sock, ctx.chatId, `*STEP 7/7 - SCOREBOARD + RESTART SIM*\n\n${GN._board(ev, "📊 *GAME NIGHT - STANDINGS after Tic-Tac-Toe* (fake data)")}\n\n${ok(same)} Saved mid-Sugar-Rush, "restarted", reloaded: scores, Wordle tally and end time ${same ? "all identical" : "DID NOT MATCH"}.`);
  return same;
}

async function handle(sock, chatId, senderJid, args, botMarker) {
  const live = GN._events.get(chatId);
  if (live && live.stage !== "done") { await sendText(sock, chatId, `❌ A real Game Night is active here. Run the test in another chat, or \`${px()} gn end\` first.`); return; }
  const a = (args[0] || "").toLowerCase();
  if (a === "reset") { STATE.delete(chatId); await sendText(sock, chatId, "🧪 Test reset."); return; }
  const ctx = { sock, chatId, senderJid };
  const st = STATE.get(chatId) || { step: 0, results: [] };
  if (a === "logos" && (args[1] || "").toLowerCase() === "all") { await stepLogos(ctx, true); return; }
  if (/^[1-7]$/.test(a)) st.step = parseInt(a, 10) - 1;
  if (st.step >= STEPS.length) {
    const passed = st.results.filter(Boolean).length;
    await sendText(sock, chatId, `*DRY RUN COMPLETE* ${passed}/${STEPS.length} steps passed.\n\nFinal rehearsal: \`${px()} gn start\` → \`${px()} gn window 1\` → \`${px()} gn next\` through each round with 2-3 friends. \`${px()} gn test reset\` to rerun.`);
    STATE.delete(chatId); return;
  }
  const fns = [stepPreflight, (c) => stepLogos(c, false), stepTrivia, stepBracket, stepChess, stepEmoji, stepBoard];
  let pass = false;
  try { pass = await fns[st.step](ctx); } catch (e) { console.error("[GameNight test]", e); await sendText(sock, chatId, `❌ Step ${st.step + 1} crashed: ${e.message}`); }
  st.results[st.step] = !!pass;
  st.step += 1; STATE.set(chatId, st);
  await sendText(sock, chatId, `${pass ? "✅ passed" : "❌ needs attention"} - \`${px()} gn test\` for ${st.step >= STEPS.length ? "the summary" : `step ${st.step + 1}/7: ${STEPS[st.step]}`}.`);
}

module.exports = { handle };
