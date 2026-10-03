// LIVE E2E (runs ON Box 1): real Wikipedia + real Go audio service + real
// Fandom. Fixture sock captures sends; full mini-game flows incl. answers.
process.chdir("/home/ubuntu/whatsapp-bot");
const quiz = require("/home/ubuntu/whatsapp-bot/core/games/quiz");
const quizMedia = require("/home/ubuntu/whatsapp-bot/core/games/quizMedia");
const quizLore = require("/home/ubuntu/whatsapp-bot/core/games/quizLore");
const goService = require("/home/ubuntu/whatsapp-bot/core/utils/goImageService").getShared();

quiz.setDeps({ goService, ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg" });

const MARK = "\u200B";
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`  ok - ${n}`); } else { fail++; console.log(`  FAIL - ${n}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSock() {
  const sends = [];
  return { sends, sendMessage: async (jid, content) => { sends.push({ jid, content }); return { key: { id: `s${sends.length}` } }; } };
}
const texts = (s) => s.sends.filter((x) => x.content.text).map((x) => x.content.text);
const captions = (s) => s.sends.filter((x) => x.content.caption).map((x) => x.content.caption);
const cards = (s) => [...texts(s), ...captions(s)];
const images = (s) => s.sends.filter((x) => x.content.image);
const audios = (s) => s.sends.filter((x) => x.content.audio);

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(300);
  }
  console.log(`  (timeout waiting for ${label})`);
  return null;
}

async function cleanup(chatId) {
  const s = quiz.getSession(chatId);
  if (s) { s.cancelled = true; if (s.readyTimerId) clearTimeout(s.readyTimerId); if (s.timerId) clearTimeout(s.timerId); if (s.nextTimerId) clearTimeout(s.nextTimerId); }
  quiz._internal.activeQuizzes.delete(chatId);
  quiz.releaseLifecycle(chatId);
}

async function answerAll(sock, chatId, senderJid, maxQ) {
  // answer correctly for up to maxQ questions by reading the revealed card
  for (let i = 0; i < maxQ; i++) {
    const card = await waitFor(() => cards(sock).find((t) => t.includes(`QUESTION ${i + 1}/`)), 20000, `Q${i + 1}`);
    if (!card) return i;
    // find the correct letter: reveal uses the same letter mapping; extract from options list A. B. C. D.
    // we can't know the answer client-side - answer A and let the reveal flow run; scoring path is what we test
    await quiz.handleAnswer(sock, chatId, senderJid, "A", MARK, { key: { id: `ans${i}` } }, "Tester");
    // wait for reveal (correct/wrong message or next question)
    await waitFor(() => cards(sock).some((t) => t.includes(`QUESTION ${i + 2}/`)) || texts(sock).some((t) => t.includes("Correct") || t.includes("correct") || t.includes("⏱ Time")), 20000, "reveal");
  }
  return maxQ;
}

async function main() {
  console.log("=== LIVE E2E on Box 1 ===");

  // ── A. LOGO MODE full mini-game ──
  console.log("-- A. logos 3 (real Wikipedia logos) --");
  {
    const CHAT = "120369999999@g.us";
    await cleanup(CHAT);
    const sock = makeSock();
    const parsed = quiz.parseQuizArgs("logos 3");
    const t0 = Date.now();
    quiz._internal.launchQuizAsync(sock, CHAT, "alice@s.whatsapp.net", MARK, { key: { id: "m1" } }, parsed, "Alice", null).catch((e) => console.log("launch err:", e.message));
    const parked = await waitFor(() => quiz.getSession(CHAT) && quiz.getSession(CHAT).awaitingGo, 180000, "park");
    ok(!!parked, "logo quiz prepared and parked");
    console.log(`  (prep took ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    ok(texts(sock).some((t) => t.includes("quiz is ready") && t.includes("@alice")), "ready message tags initiator");
    const r = await quiz.confirmStart(sock, CHAT, "alice@s.whatsapp.net", MARK, false);
    ok(r.handled && r.silent, "go accepted");
    const q1 = await waitFor(() => cards(sock).find((t) => t.includes("QUESTION 1/3")), 20000, "Q1");
    ok(!!q1, "logo Q1 posted");
    const img = images(sock)[0];
    ok(!!img && Buffer.isBuffer(img.content.image) && img.content.image.length > 1500, `real logo bytes attached (${img ? img.content.image.length : 0}B)`);
    // play all 3 questions (any answer - scoring path matters)
    let answered = 0;
    for (let i = 0; i < 3; i++) {
      const card = await waitFor(() => cards(sock).find((t) => t.includes(`QUESTION ${i + 1}/3`)), 25000, `Q${i + 1}`);
      if (!card) break;
      // the deadline window arms at CARD DELIVERY (resilient-sends order) -
      // wait for it or a programmatic answer can race in before the window
      // exists and get silently dropped (deadline would only fire ~25s later)
      const win = await waitFor(() => { const s = quiz.getSession(CHAT); return s && s.qOpenUntil && s.qOpenUntil > Date.now() ? true : null; }, 8000, `window Q${i + 1}`);
      if (!win) break;
      // answer CORRECTLY (read from session state): a blind "B" is usually
      // wrong, wrong answers don't reveal early, and deadline+gap then
      // overruns the Q2 waitFor - the flow must exercise the scoring path,
      // not gamble on option letters
      const sess = quiz.getSession(CHAT);
      const cq = sess && sess.sections[sess.activeSection] && sess.sections[sess.activeSection].questions[sess.idx];
      const correctText = cq && Array.isArray(cq.options) ? cq.options[cq.correct] : "B";
      await quiz.handleAnswer(sock, CHAT, "bob@s.whatsapp.net", correctText, MARK, { key: { id: `a${i}` } }, "Bob");
      answered++;
      await waitFor(() => texts(sock).some((t) => t.toLowerCase().includes("correct") || t.includes("wrong") || t.includes("⏱ Time")) || cards(sock).some((t) => t.includes(`QUESTION ${i + 2}/3`)), 25000, "reveal");
    }
    ok(answered >= 2, `playable flow works (${answered} questions answered)`);
    // finish via endQuiz (clean teardown)
    await quiz.endQuiz(sock, CHAT, "alice@s.whatsapp.net", MARK, false);
    ok(!quiz.hasActive(CHAT), "quiz ended cleanly");
  }

  // ── B. SONG MODE full mini-game (real Go audio service) ──
  console.log("-- B. song 2 (real Go audio clips) --");
  {
    const CHAT = "120369999998@g.us";
    await cleanup(CHAT);
    const sock = makeSock();
    const parsed = quiz.parseQuizArgs("song 2");
    const t0 = Date.now();
    quiz._internal.launchQuizAsync(sock, CHAT, "carol@s.whatsapp.net", MARK, { key: { id: "m2" } }, parsed, "Carol", null).catch((e) => console.log("launch err:", e.message));
    const parked = await waitFor(() => quiz.getSession(CHAT) && quiz.getSession(CHAT).awaitingGo, 300000, "park");
    ok(!!parked, "song quiz prepared and parked");
    console.log(`  (prep took ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (parked) {
      const r = await quiz.confirmStart(sock, CHAT, "carol@s.whatsapp.net", MARK, false);
      ok(r.handled && r.silent, "go accepted");
      const q1 = await waitFor(() => cards(sock).find((t) => t.includes("QUESTION 1/2")), 20000, "Q1");
      ok(!!q1, "song Q1 posted");
      const au = audios(sock)[0];
      ok(!!au && Buffer.isBuffer(au.content.audio) && au.content.audio.length > 20 * 1024, `real audio clip attached (${au ? au.content.audio.length : 0}B)`);
      await quiz.endQuiz(sock, CHAT, "carol@s.whatsapp.net", MARK, false);
      ok(!quiz.hasActive(CHAT), "quiz ended cleanly");
    }
  }

  // ── C. media builders direct (image + theme song, real sources) ──
  console.log("-- C. lore media builders (Fandom + Go) --");
  {
    const t0 = Date.now();
    const idx = await quizLore.buildCharacterIndex("naruto", "Naruto", []).catch(() => null);
    ok(!!idx && ((idx.easy || []).length + (idx.medium || []).length + (idx.hard || []).length) >= 4, "character index built (Fandom reachable)");
    if (idx) {
      const imgQ = await quiz._internal ? await (require("/home/ubuntu/whatsapp-bot/core/games/quiz").buildImageQuestion)("naruto", "Naruto", idx, new Set(), "easy") : null;
      ok(!!imgQ && imgQ.asset && imgQ.asset.url, `image question built via ${imgQ && imgQ.asset ? imgQ.asset.source : "n/a"} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      if (imgQ) {
        const dl = await quizLore.downloadMedia(imgQ.asset.url, "image");
        ok(!!dl && dl.buf.length > 1024, "final image URL re-verifies with real bytes");
      }
    }
    const fran = { title: "Naruto", wiki: "naruto", mediaType: "anime", anime: { idMal: 20 } };
    const t1 = Date.now();
    const themeQ = await (require("/home/ubuntu/whatsapp-bot/core/games/quiz").buildThemeSongQuestion)(fran, ["One Piece", "Bleach", "Fairy Tail"], new Set());
    ok(!!themeQ && themeQ.asset.buf && themeQ.asset.buf.length > 20 * 1024, `theme-song clip built (${themeQ ? themeQ.asset.buf.length : 0}B in ${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  }

  console.log(`\nLIVE E2E: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("E2E crashed:", e); process.exit(1); });
