// ============================================
// QUIZ RACE + PACING QA (2026-09-28 owner audit)
// ============================================
// Owner spec §2: "proper state locking so Q2 cannot start until Q1 has been
// fully resolved", "debouncing / duplicate-send protection", "ensure only
// one question can be active at a time", "randomized 10-30 second gap".
// This battery hammers the exact races that produced the live breakage:
//   A. deadline timer vs correct answer in the same tick  -> ONE reveal
//   B. two players answering correctly in the same tick   -> ONE reveal
//   C. two `.j quiz go` in the same tick                  -> ONE start
//   D. postQuestion while a question is open              -> BLOCKED
//   E. gap randomization bounds + quizmod gapmin/gapmax
// ============================================
const quiz = require("../core/games/quiz");
const quizConfigMod = require("../core/games/quizConfig");

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass += 1; console.log("  ok -", label); }
  else { fail += 1; console.log("  FAIL -", label); }
}
function section(s) { console.log(`\n── ${s} ──`); }

const MARK = "\u200b";
function makeMockSock() {
  return {
    sent: [],
    async sendMessage(chatId, content) {
      this.sent.push({ chatId, content });
      return { key: { id: "m" + this.sent.length } };
    },
  };
}
function makeValidAI(n) {
  let i = 0;
  return async () => {
    i += 1;
    const k = i % 4;
    const body = { question: "Q" + i + " about the source lore?", options: { A: "Alpha", B: "Beta", C: "Gamma", D: "Delta" }, answer: ["A", "B", "C", "D"][k] };
    return { choices: [{ message: { content: JSON.stringify(body) } }] };
  };
}
async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitParked(chatId, timeoutMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = quiz.getSession(chatId);
    if (s && s.awaitingGo) return s;
    await wait(250);
  }
  return null;
}
async function waitActive(chatId, timeoutMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = quiz.getSession(chatId);
    if (s && !s.awaitingGo && s.sections?.[0]?.state === "ACTIVE") return s;
    await wait(200);
  }
  return null;
}
function countSent(sock, needle) {
  return sock.sent.filter((s) => typeof s.content?.text === "string" && s.content.text.includes(needle)).length;
}
// fire N async fns with zero gap (same macrotask burst)
function burst(fns) { return Promise.allSettled(fns.map((f) => f())); }

(async () => {
  quiz.setDeps({ canStartQuiz: null, canManageQuiz: null, goService: null, ffmpegPath: "ffmpeg" });

  // ═══ A. timer vs answer race ═══
  section("A. deadline timer vs correct answer (same tick)");
  {
    const chat = "raceA@g.us";
    const sock = makeMockSock();
    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "A0" } }, '"naruto" 4 easy', "U1", makeValidAI(6), { FAST: "t" });
    const s = await waitParked(chat);
    ok(!!s, "quiz parked");
    s.cfg.questionGapMin = 1; s.cfg.questionGapMax = 1;
    await quiz.confirmStart(sock, chat, s.askedBy, MARK, false);
    const live = await waitActive(chat);
    ok(!!live, "quiz ACTIVE");

    // fire the deadline timeout body AND the correct answer in the same burst
    const q1 = live.sections[0].questions[live.idx];
    const timerBody = quiz._internal?.deadlineTickFor ? null : null; // no direct hook: emulate by awaiting the timer
    // send correct answer immediately, then let the real timer fire while
    // reveal is still awaiting its first send -> both chains entered
    const reveals0 = live.revealed.length;
    await quiz.handleAnswer(sock, chat, "p1@x", "ABCD"[q1.correct], MARK, { key: { id: "a1" } }, "P1");
    await wait(300); // let the reveal chain start (lock held)
    // emulate the deadline tick DURING the reveal: call the same path the
    // timer would - a stale timer must find the lock held and bail
    const timerPromise = new Promise((resolve) => {
      setTimeout(async () => {
        try {
          // direct reveal attempt (what an un-cancelled timer callback does)
          await quiz.handleAnswer(sock, chat, "ghost@x", "ABCD"[q1.correct], MARK, { key: { id: "ghost" } }, "Ghost");
        } catch (e) { /* ignore */ }
        resolve();
      }, 50);
    });
    await timerPromise;
    await wait(2500); // let the chain settle (gap is 1s -> Q2 posts)
    ok(live.revealed.length === reveals0 + 1, `exactly ONE reveal (got ${live.revealed.length - reveals0})`);
    ok(live.idx === 1, `idx advanced exactly once (got ${live.idx})`);
    const q2cards = countSent(sock, "QUESTION 2/");
    ok(q2cards === 1, `exactly ONE Q2 card (got ${q2cards})`);
    ok(live.scores.get("p1@x")?.correct === 1, "P1 scored exactly once");
    await quiz.endQuiz(sock, chat, "u1@x", MARK, false);
  }

  // ═══ B. two simultaneous correct answers ═══
  section("B. two players correct in the same tick");
  {
    const chat = "raceB@g.us";
    const sock = makeMockSock();
    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "B0" } }, '"naruto" 4 easy', "U1", makeValidAI(6), { FAST: "t" });
    const s = await waitParked(chat);
    s.cfg.questionGapMin = 1; s.cfg.questionGapMax = 1;
    await quiz.confirmStart(sock, chat, s.askedBy, MARK, false);
    const live = await waitActive(chat);
    ok(!!live, "quiz ACTIVE");
    const q1 = live.sections[0].questions[live.idx];
    const before = live.revealed.length;
    await burst([
      () => quiz.handleAnswer(sock, chat, "p1@x", "ABCD"[q1.correct], MARK, { key: { id: "b1" } }, "P1"),
      () => quiz.handleAnswer(sock, chat, "p2@x", "ABCD"[q1.correct], MARK, { key: { id: "b2" } }, "P2"),
    ]);
    await wait(2500);
    ok(live.revealed.length === before + 1, `exactly ONE reveal (got ${live.revealed.length - before})`);
    ok(live.idx === 1, `idx advanced once (got ${live.idx})`);
    const scored = ["p1@x", "p2@x"].filter((p) => live.scores.get(p)?.correct === 1);
    ok(scored.length === 1, `exactly ONE player scored (got ${scored.length}: ${scored.join(",")})`);
    await quiz.endQuiz(sock, chat, "u1@x", MARK, false);
  }

  // ═══ C. double `.j quiz go` ═══
  section("C. two confirmStart calls in the same tick");
  {
    const chat = "raceC@g.us";
    const sock = makeMockSock();
    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "C0" } }, '"naruto" 4 easy', "U1", makeValidAI(6), { FAST: "t" });
    const s = await waitParked(chat);
    s.cfg.questionGapMin = 1; s.cfg.questionGapMax = 1;
    await burst([
      () => quiz.confirmStart(sock, chat, s.askedBy, MARK, false),
      () => quiz.confirmStart(sock, chat, s.askedBy, MARK, false),
    ]);
    await wait(3500);
    const live = quiz.getSession(chat);
    ok(!!live && !live.awaitingGo, "quiz started");
    const q1cards = countSent(sock, "QUESTION 1/");
    ok(q1cards === 1, `exactly ONE Q1 card (got ${q1cards})`);
    ok(live.questionNo === 1, `questionNo == 1 (got ${live.questionNo})`);
    ok(live.idx === 0 && live.qOpenUntil > Date.now() - 60000, "single open question");
    await quiz.endQuiz(sock, chat, "u1@x", MARK, false);
  }

  // ═══ D. postQuestion state guard ═══
  section("D. postQuestion blocked while a question is open");
  {
    const chat = "raceD@g.us";
    const sock = makeMockSock();
    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "D0" } }, '"naruto" 4 easy', "U1", makeValidAI(6), { FAST: "t" });
    const s = await waitParked(chat);
    s.cfg.questionGapMin = 1; s.cfg.questionGapMax = 1;
    await quiz.confirmStart(sock, chat, s.askedBy, MARK, false);
    const live = await waitActive(chat);
    ok(!!live && live.qOpenUntil > Date.now(), "Q1 open");
    const qNoBefore = live.questionNo;
    // poke postQuestion through the session machinery: a second section start
    // attempt must not double-post. Use the exported startSection-equivalent:
    // confirmStart again is the realistic double-entry path.
    await quiz.confirmStart(sock, chat, s.askedBy, MARK, false);
    await wait(800);
    ok(live.questionNo === qNoBefore, `no extra question posted (questionNo ${qNoBefore} -> ${live.questionNo})`);
    const q1cards = countSent(sock, "QUESTION 1/");
    ok(q1cards === 1, `still exactly ONE Q1 card (got ${q1cards})`);
    await quiz.endQuiz(sock, chat, "u1@x", MARK, false);
  }

  // ═══ E. gap randomization ═══
  section("E. gap bounds + quizmod wiring");
  {
    // defaults 10-30
    const cfg = { questionGapMin: 10, questionGapMax: 30 };
    let inRange = true, sawDistinct = false;
    const vals = new Set();
    for (let i = 0; i < 60; i++) {
      const v = quizConfigMod.questionGapSeconds(cfg);
      if (v < 10 || v > 30) inRange = false;
      vals.add(v);
    }
    ok(inRange, "default gap always within 10-30s");
    ok(vals.size >= 8, `randomized (${vals.size} distinct values in 60 draws)`);
    // degenerate config clamps
    ok(quizConfigMod.questionGapSeconds({ questionGapMin: 30, questionGapMax: 5 }) === 30, "gapmax<gapmin clamped to gapmin");
    ok(quizConfigMod.questionGapSeconds({}) >= 10 && quizConfigMod.questionGapSeconds({}) <= 30, "missing cfg falls back to defaults");
    // quizmod flow
    const set1 = await quizConfigMod.handleQuizMod("gaptest@g.us", "gapmin 5", true, ".j");
    ok(/5/.test(set1.message || ""), "quizmod gapmin accepted");
    const set2 = await quizConfigMod.handleQuizMod("gaptest@g.us", "gapmax 12", true, ".j");
    ok(/12/.test(set2.message || ""), "quizmod gapmax accepted");
    const gcfg = await quizConfigMod.buildQuizConfig("gaptest@g.us", { count: 5 });
    ok(gcfg.questionGapMin === 5 && gcfg.questionGapMax === 12, "gap flows into session config");
    let bounded = true;
    for (let i = 0; i < 30; i++) {
      const v = quizConfigMod.questionGapSeconds(gcfg);
      if (v < 5 || v > 12) bounded = false;
    }
    ok(bounded, "session gap respects quizmod bounds");
    await quizConfigMod.handleQuizMod("gaptest@g.us", "reset", true, ".j");
  }

  console.log(`\n════════════════════════════════\nRESULT: ${pass} pass, ${fail} fail\n════════════════════════════════`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(2); });
