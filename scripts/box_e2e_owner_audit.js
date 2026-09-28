// ============================================
// LIVE E2E (Box 1): 2026-09-28 owner-audit fix pass
// ============================================
// Real network + real Groq + real Mongo. Asserts the owner brief behaviors:
//   1. UNIFORM PLANNING: lore quiz announces QUIZ PLANNING @starter and PARKS
//      (lore quizzes used to auto-start - inconsistent with media modes)
//   2. `.j quiz go` starts it (head card + Q1)
//   3. randomized gap: Q2 posts within [gapmin,gapmax] of the Q1 reveal
//   4. STATE LOCK: a stale deadline-tick during the reveal cannot
//      double-advance / duplicate the next question
//   5. DOUBLE confirmStart posts exactly one Q1 card
//   6. LOGO dataset path: real bytes from the baked verified dataset
// ============================================
process.chdir("/home/ubuntu/whatsapp-bot");
const quiz = require("/home/ubuntu/whatsapp-bot/core/games/quiz");
const quizConfigMod = require("/home/ubuntu/whatsapp-bot/core/games/quizConfig");
const quizMedia = require("/home/ubuntu/whatsapp-bot/core/games/quizMedia");
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
const cards = (s) => [...texts(s), ...s.sends.filter((x) => x.content.caption).map((x) => x.content.caption)];
function countCards(s, needle) { return cards(s).filter((t) => t.includes(needle)).length; }

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
  if (s) {
    s.cancelled = true;
    for (const k of ["readyTimerId", "timerId", "nextTimerId", "reassureTimerId"]) if (s[k]) { clearTimeout(s[k]); s[k] = null; }
  }
  quiz._internal.activeQuizzes.delete(chatId);
  quiz.releaseLifecycle(chatId);
}

(async () => {
  console.log("=== LIVE E2E: owner-audit fix pass (2026-09-28) ===");
  const CHAT = "120369777777@g.us"; // fixture chat (never a real group)
  const STARTER = "starter@s.whatsapp.net";
  await cleanup(CHAT);

  // fast test pacing via quizmod (validated settings, reset at the end)
  await quizConfigMod.handleQuizMod(CHAT, "gapmin 3", true, ".j");
  await quizConfigMod.handleQuizMod(CHAT, "gapmax 5", true, ".j");
  await quizConfigMod.handleQuizMod(CHAT, "sectionbreak 3", true, ".j");

  // ── 1. lore quiz: uniform planning + park ──
  console.log("── 1. lore quiz parks behind the ready gate ──");
  const sock = makeSock();
  const t0 = Date.now();
  await quiz.startQuiz(sock, CHAT, STARTER, MARK, { key: { id: "m1" } }, '"naruto" 3 easy', "Starter", null);
  const planning = await waitFor(() => texts(sock).find((t) => t.includes("QUIZ PLANNING")), 20000, "planning announce");
  ok(!!planning, "lore quiz posts QUIZ PLANNING (uniform lifecycle)");
  ok(planning && planning.includes(STARTER.split("@")[0]), "announce tags the initiator");
  ok(planning && /lore from/.test(planning), "announce names the franchise");
  const parked = await waitFor(() => { const s = quiz.getSession(CHAT); return s && s.awaitingGo ? s : null; }, 180000, "parked session");
  ok(!!parked, `quiz PARKED after generation (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  ok(!!parked && countCards(sock, "quiz is ready") >= 1, "ready card posted");
  ok(!!parked && !parked.readyHead === false, "ready head stored for go");

  // ── 2. go starts it ──
  console.log("── 2. .j quiz go fires the start ──");
  const rGo = await quiz.confirmStart(sock, CHAT, STARTER, MARK, false);
  ok(rGo.handled && rGo.silent, "confirmStart accepted for the starter");
  const live = await waitFor(() => { const s = quiz.getSession(CHAT); return s && !s.awaitingGo && s.sections?.[0]?.state === "ACTIVE" ? s : null; }, 20000, "active session");
  ok(!!live, "quiz ACTIVE");
  ok(!!live && countCards(sock, "QUESTION 1/") === 1, "exactly one Q1 card");
  // 💡 since the resilient-sends fix (40ce9f9ae) the deadline window opens at
  // CARD DELIVERY, not at post-question entry - poll for it (the ACTIVE flag
  // is set synchronously in startSection, before the card is even sent).
  const winArmed = await waitFor(() => { const s = quiz.getSession(CHAT); return s && s.qOpenUntil && s.qOpenUntil > Date.now() ? true : null; }, 8000, "window armed");
  ok(!!winArmed, "Q1 open window armed at delivery");

  // ── 3+4. correct answer + stale-tick race -> ONE reveal, gap-bounded Q2 ──
  console.log("── 3. answer race + randomized gap ──");
  const q1 = live.sections[0].questions[live.idx];
  const revealT0 = Date.now();
  await quiz.handleAnswer(sock, CHAT, "p1@s.whatsapp.net", "ABCD"[q1.correct], MARK, { key: { id: "a1" } }, "P1");
  await sleep(250); // reveal chain starts (lock held)
  // emulate the deadline timer firing DURING the reveal (what an un-cancelled
  // stale timer would do): a late answer attempt for the same question
  await quiz.handleAnswer(sock, CHAT, "ghost@s.whatsapp.net", "ABCD"[q1.correct], MARK, { key: { id: "ghost" } }, "Ghost");
  const settled = await waitFor(() => countCards(sock, "QUESTION 2/") > 0 ? true : null, 20000, "Q2 card");
  ok(!!settled, "Q2 posted");
  const gapMs = Date.now() - revealT0;
  ok(gapMs >= 3 * 1000 && gapMs <= 6 * 1000 + 800, `Q2 gap ${ (gapMs / 1000).toFixed(1) }s within quizmod [3,5]s`);
  ok(live.revealed.length === 1, `exactly ONE reveal (got ${live.revealed.length})`);
  ok(live.idx === 1, `idx advanced exactly once (got ${live.idx})`);
  ok(countCards(sock, "QUESTION 2/") === 1, "exactly ONE Q2 card (no duplicate-send)");
  ok(!!live.scores.get("p1@s.whatsapp.net")?.correct, "P1 scored");
  ok(!live.scores.get("ghost@s.whatsapp.net"), "late ghost answer did not score");

  // ── 5. double confirmStart after finish park n/a; do it on Q-state ──
  console.log("── 4. double confirmStart protection (fresh quiz) ──");
  await cleanup(CHAT);
  const sock2 = makeSock();
  await quiz.startQuiz(sock2, CHAT, STARTER, MARK, { key: { id: "m2" } }, '"naruto" 2 easy', "Starter", null);
  const parked2 = await waitFor(() => { const s = quiz.getSession(CHAT); return s && s.awaitingGo ? s : null; }, 180000, "parked session 2");
  ok(!!parked2, "second quiz parked");
  if (parked2) {
    parked2.cfg.questionGapMin = 3; parked2.cfg.questionGapMax = 5;
    await Promise.all([
      quiz.confirmStart(sock2, CHAT, STARTER, MARK, false),
      quiz.confirmStart(sock2, CHAT, STARTER, MARK, false),
    ]);
    await sleep(2500);
    ok(countCards(sock2, "QUESTION 1/") === 1, `exactly ONE Q1 card under double-go (got ${countCards(sock2, "QUESTION 1/")})`);
    const live2 = quiz.getSession(CHAT);
    ok(!!live2 && live2.questionNo === 1, "questionNo == 1 (no double start)");
    await quiz.endQuiz(sock2, CHAT, STARTER, MARK, false);
  }

  // ── 6. logo dataset path on-box ──
  console.log("── 5. logo dataset live path ──");
  const info = quizMedia.logoDatasetInfo();
  ok(info.available && info.count >= 380, `dataset loaded on box (${info.count} brands)`);
  const pool = quizMedia.LOGOS_POOL;
  const brand = pool.find((b) => b.name.toLowerCase() === "samsung");
  const others = pool.filter((b) => b.cat === brand.cat && b.name !== brand.name).slice(0, 3);
  const lq = await quizMedia.buildLogosQuestion(brand, others, "easy").catch((e) => { console.log("  err:", e.message); return null; });
  ok(!!lq && !!lq._cachedAsset?.buf && lq._cachedAsset.buf.length > 1500, `logo bytes fetched (${lq?._cachedAsset?.buf?.length || 0}B)`);
  ok(!!lq && String(lq.asset.source).startsWith("logo-dataset"), `dataset source used: ${lq?.asset?.source}`);
  ok(!!lq && lq.options[lq.correct] === "Samsung", "correct option == asked brand");

  // cleanup: cancel live quiz + reset group config
  await cleanup(CHAT);
  await quizConfigMod.handleQuizMod(CHAT, "reset", true, ".j");

  console.log(`\n════════════════════════════════\nRESULT: ${pass} pass, ${fail} fail\n════════════════════════════════`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(2); });
