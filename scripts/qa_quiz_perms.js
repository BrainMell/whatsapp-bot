// QA: QUIZ MODS + START GATE + SIMPLIFIED ANSWER FORMAT (2026-09-27)
// Covers owner-brief sections 5 & 6:
//   - only Quiz Mods / Global Mods / owner can START quizzes (engine hook)
//   - quiz mods can manage (end/config) without global powers
//   - answer format: ".j b" (letter) AND ".j <option text>" both work,
//     unmatched text reacts 🤔 and never scores
//   - reveal chain detached: handleAnswer returns instantly on a correct
//     answer (45s command-timeout fix)
// Run: node scripts/qa_quiz_perms.js
process.env.SANDBOX_QUIZ = "1";
const quiz = require("../core/games/quiz");
const MARK = "\u200B";

function mockSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (jid, content) => { sent.push(content); return {}; },
    groupMetadata: async () => ({ participants: [] }),
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function makeValidAI(n) {
  let i = 0;
  return async (opts) => {
    i += 1;
    const k = i % 4;
    const body = JSON.stringify({
      question: `Validated question ${i} about the source material?`,
      options: { A: "Alpha", B: "Beta", C: "Gamma", D: "Delta" },
      answer: ["A", "B", "C", "D"][k],
    });
    return { choices: [{ message: { content: body } }] };
  };
}
function waitSession(chatId, timeoutMs = 30000, sock = null) {
  // 2026-09-28: parked quizzes need confirmStart to go ACTIVE
  const t0 = Date.now();
  return new Promise((resolve) => {
    const iv = setInterval(async () => {
      const s = quiz.getSession(chatId);
      if (s && s.awaitingGo) {
        s.cfg.questionGapMin = 1;
        s.cfg.questionGapMax = 1;
        await quiz.confirmStart(sock || mockSock(), chatId, s.askedBy, MARK, false);
        return; // re-poll; ACTIVE is checked next tick
      }
      if (s && !s.awaitingGo && s.sections && s.sections[0].state === "ACTIVE") { clearInterval(iv); resolve(s); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); resolve(null); }
    }, 300);
  });
}
let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass += 1; console.log("  ok -", label); } else { fail += 1; console.log("  FAIL -", label); } }

(async () => {
  console.log("════ 1. START GATE via injected canStartQuiz ════");
  // inject the engine-shaped hooks
  quiz.setDeps({
    canStartQuiz: (jid) => ["mod1@x", "owner@x"].includes(jid),
    canManageQuiz: (jid) => ["mod1@x", "owner@x"].includes(jid),
    goService: null,
    ffmpegPath: "ffmpeg",
  });
  {
    const sock = mockSock();
    const denied = await quiz.startQuiz(sock, "gate1@g.us", "rando@x", MARK, { key: { id: "G1" } }, '"fmab" 3 easy', "R", makeValidAI(5), { FAST: "t" });
    ok(denied.handled && /Quiz Mods.*Global Mods|addquizmod/.test(denied.message || ""), "unauthorized starter bounced with guidance");
    ok(!quiz.hasActive("gate1@g.us"), "no session created for unauthorized starter");
  }
  {
    const sock = mockSock();
    const allowed = await quiz.startQuiz(sock, "gate2@g.us", "mod1@x", MARK, { key: { id: "G2" } }, '"fmab" 3 easy', "M", makeValidAI(5), { FAST: "t" });
    ok(allowed.handled && allowed.silent === true, "quiz mod passes the start gate");
    const s = await waitSession("gate2@g.us", 30000, sock);
    ok(!!s, "quiz mod's quiz reaches ACTIVE");
    // confirmStart: starter may fire; a random user may not
    const foreign = await quiz.confirmStart(mockSock(), "gate2@g.us", "rando@x", MARK, false);
    // parked only for media quizzes; this one auto-started -> running message
    ok(!!foreign.message, "confirmStart on live quiz gives status bounce");
    const denyEnd = await quiz.endQuiz(mockSock(), "gate2@g.us", "rando@x", MARK, false);
    ok(denyEnd.handled && /starter, admins or Quiz Mods/.test(denyEnd.message || ""), "non-mod cannot end quiz-mod's quiz");
    const modEnd = await quiz.endQuiz(mockSock(), "gate2@g.us", "mod1@x", MARK, false);
    ok(modEnd.handled, "quiz mod (non-starter) CAN end the quiz");
  }

  console.log("════ 2. FAIL-CLOSED manage / FAIL-OPEN start when hooks absent ════");
  {
    quiz.setDeps({ canStartQuiz: null, canManageQuiz: null });
    const s = await waitSession("gate3@g.us", 100); // nothing pending
    const sock = mockSock();
    // manage: hook absent -> legacy behaviour (canUseAdminCommands decides)
    await quiz.startQuiz(sock, "gate3@g.us", "u1@x", MARK, { key: { id: "G3" } }, '"fmab" 3 easy', "A", makeValidAI(5), { FAST: "t" });
    await waitSession("gate3@g.us", 30000, sock);
    const noEnd = await quiz.endQuiz(sock, "gate3@g.us", "u2@x", MARK, false);
    ok(noEnd.handled && /starter, admins or Quiz Mods/.test(noEnd.message || ""), "hook absent -> non-starter still bounced");
    await quiz.endQuiz(sock, "gate3@g.us", "u1@x", MARK, false);
  }

  console.log("════ 3. ANSWER FORMAT ════");
  {
    quiz.setDeps({ canStartQuiz: null, canManageQuiz: null });
    const chat = "ans1@g.us";
    const sock = mockSock();
    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "A1" } }, '"fmab" 3 easy', "A", makeValidAI(5), { FAST: "t" });
    const s = await waitSession(chat, 30000, sock);
    ok(!!s, "quiz active for answer tests");
    // force a known question shape. Probes answer WRONG options on purpose:
    // wrong answers never trigger the (now detached) reveal chain, keeping
    // the session state hermetic for the next probe.
    const section = s.sections[s.activeSection];
    const q = section.questions[s.idx];
    const open = () => { s.qOpenUntil = Date.now() + 15000; s.answeredBy = new Map(); };

    // letter form: ".j a" on a question whose correct is c
    q.options = ["Edward Elric", "Alphonse Elric", "Roy Mustang", "Winry Rockbell"];
    q.correct = 2;
    open();
    let r = await quiz.handleAnswer(sock, chat, "p1@x", "a", MARK, { key: { id: "a1" } }, "P1");
    ok(r.handled && s.answeredBy.get("p1@x") && s.answeredBy.get("p1@x").letter === 0 && s.answeredBy.get("p1@x").correct === false, ".j a (letter) registers against the right option");

    // full option text form (wrong option B)
    open();
    r = await quiz.handleAnswer(sock, chat, "p2@x", "Alphonse Elric", MARK, { key: { id: "a2" } }, "P2");
    ok(s.answeredBy.get("p2@x") && s.answeredBy.get("p2@x").letter === 1, ".j <option text> matches option text (exact)");

    // normalized text (case/article stripped): "the Tagia Rock" -> "tagia rock"
    open();
    q.options = ["the Tagia Rock", "Alphonse Elric", "Roy Mustang", "Winry Rockbell"];
    q.correct = 3;
    r = await quiz.handleAnswer(sock, chat, "p3@x", "tagia rock", MARK, { key: { id: "a3" } }, "P3");
    ok(s.answeredBy.get("p3@x") && s.answeredBy.get("p3@x").letter === 0, "normalized text matches (article + case stripped)");

    // junk never scores
    open();
    r = await quiz.handleAnswer(sock, chat, "p4@x", "yellow submarine", MARK, { key: { id: "a4" } }, "P4");
    ok(!s.answeredBy.has("p4@x"), "unmatched junk does not register an attempt");

    // one attempt per player
    open();
    q.options = ["Edward Elric", "Alphonse Elric", "Roy Mustang", "Winry Rockbell"];
    q.correct = 3;
    await quiz.handleAnswer(sock, chat, "p5@x", "a", MARK, { key: { id: "a5" } }, "P5");
    await quiz.handleAnswer(sock, chat, "p5@x", "d", MARK, { key: { id: "a6" } }, "P5");
    ok(s.answeredBy.get("p5@x").letter === 0, "first answer locks (one attempt rule)");

    await quiz.endQuiz(sock, chat, "u1@x", MARK, false);
  }

  console.log("════ 3b. DETACHED REVEAL (correct answer returns instantly) ════");
  {
    const chat = "ans2@g.us";
    const sock = mockSock();
    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "A2" } }, '"fmab" 3 easy', "A", makeValidAI(5), { FAST: "t" });
    const s = await waitSession(chat, 30000, sock);
    const section = s.sections[s.activeSection];
    const q = section.questions[s.idx];
    q.options = ["Edward Elric", "Alphonse Elric", "Roy Mustang", "Winry Rockbell"];
    q.correct = 2;
    s.qOpenUntil = Date.now() + 15000;
    s.answeredBy = new Map();
    const t0 = Date.now();
    const r = await quiz.handleAnswer(sock, chat, "p6@x", "c", MARK, { key: { id: "a7" } }, "P6");
    const dt = Date.now() - t0;
    ok(r.handled && dt < 1500, `handleAnswer returns immediately on correct (returned in ${dt}ms - reveal chain detached)`);
    await wait(400); // detached chain lands the ✅ react + reveal message
    const reacted = sock.sent.some((c) => c.react && c.react.text === "✅");
    const revealed = sock.sent.some((c) => typeof c.text === "string" && /Correct!/.test(c.text));
    ok(reacted, "✅ react delivered");
    ok(revealed, "reveal message posted by the detached chain");
    await quiz.endQuiz(sock, chat, "u1@x", MARK, false);
  }

  console.log("════ 4. PERMISSION EDGE: pick gate ════");
  {
    quiz.setDeps({ canStartQuiz: (jid) => jid === "mod9@x", canManageQuiz: (jid) => jid === "mod9@x" });
    // simulate a pending pick directly
    const engine = quiz._internal || {};
    const chat = "pick1@g.us";
    // pickCandidate with no pending -> clean error (unchanged)
    const r0 = await quiz.pickCandidate(mockSock(), chat, "u1@x", MARK, null, "1", "A", makeValidAI(5), { FAST: "t" });
    ok(/No pending/.test(r0.message || ""), "pick with no pending still errors cleanly");
  }

  console.log(`\nQUIZ PERMS QA: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
