// ============================================
// QUIZ REALISTIC + STRESS QA (2026-09-28 owner audit §9/§10/§11)
// ============================================
// What the earlier batteries did NOT cover:
//   1. ENGINE GLUE EXECUTED FROM REAL SOURCE - the cooldown-bypass and the
//      letter/word answer routing are extracted from core/engine.js by
//      marker (byte-exact at test time) and executed against the REAL quiz
//      module, so a drift in either file fails here.
//   2. BUSY GROUP CHAT - 6 users with mixed behavior: rapid answers, wrong
//      answers, duplicate answers, garbage, answers during the gap, answers
//      after the deadline.
//   3. CONNECTION OUTAGE - a sock that fails every send for ~5s then
//      recovers: safeSend must deliver the question card late (not lose it)
//      and the deadline timer must not run while the group cannot see it.
//   4. STRESS - 10 users x 5 answers within milliseconds; two chats running
//      quizzes simultaneously; 4 rapid start/end cycles.
// ============================================
process.chdir(__dirname + "/..");
const fs = require("fs");
const quiz = require("../core/games/quiz");
const quizConfigMod = require("../core/games/quizConfig");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  ok -", l); } else { fail++; console.log("  FAIL -", l); } };
const section = (s) => console.log(`\n── ${s} ──`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MARK = "\u200b";

// ── engine source fragments (byte-exact markers) ──
const ENGINE = fs.readFileSync("core/engine.js", "utf8");
function extractFragment(startMarker, endMarker) {
  const a = ENGINE.indexOf(startMarker);
  if (a < 0) return null;
  const b = ENGINE.indexOf(endMarker, a);
  if (b < 0) return null;
  return ENGINE.slice(a, b + endMarker.length);
}
// build the sandbox the fragments expect
const cooldownMap = new Map();
const sandboxQuizGame = quiz; // the REAL module (same object the engine injected deps into)
function evalEngineSnippet(code, ctx) {
  const { quizGame, lowerTxt, chatId, isBotCommand, isOwner, isGlobalMod, commandCooldowns, senderJid } = ctx;
  let __drop;
  eval(code); // direct eval: sees the destructured locals exactly like the engine closure
  return __drop;
}

(async () => {
  quiz.setDeps({ canStartQuiz: null, canManageQuiz: null, goService: null, ffmpegPath: "ffmpeg" });

  // ═══ 1. engine glue from real source ═══
  section("1. engine glue executed from REAL engine.js source");
  const coolStart = "const _isQuizAnswerMsg =";
  const coolEnd = "!isGlobalMod(senderJid)) {";
  const coolFrag = extractFragment(coolStart, coolEnd);
  ok(!!coolFrag, "cooldown bypass fragment found by marker");
  ok(coolFrag.includes("quizGame.isQuestionOpen(chatId)"), "fragment references isQuestionOpen (word-answer protection present)");
  ok(coolFrag.includes("!_quizQuestionOpen"), "fragment bypasses cooldown while a question is open");
  // executable statement: `const _isQuizAnswerMsg = ...; const _quizQuestionOpen = ...; if (COND) {`
  // -> keep the const declarations verbatim, turn the if into an assignment
  const idxIf = coolFrag.lastIndexOf("if (");
  const coolStmt = coolFrag.slice(0, idxIf) + "__drop = (" + coolFrag.slice(idxIf + 4, coolFrag.length - 3) + ");";
  const CHAT = "glue@g.us";
  // 1a. no quiz -> cooldown applies
  cooldownMap.clear();
  let drop = evalEngineSnippet(coolStmt, { quizGame: sandboxQuizGame, lowerTxt: ".j balance", chatId: CHAT, isBotCommand: true, isOwner: false, isGlobalMod: () => false, commandCooldowns: cooldownMap, senderJid: "u9@x" });
  ok(drop === true, "no quiz: regular command enters the cooldown block (would be dropped at 5s)");
  // 1b. quiz active + question OPEN -> word answer bypasses (never dropped)
  const sess = quiz._internal.activeQuizzes;
  sess.set(CHAT, { cancelled: false, qOpenUntil: Date.now() + 10000, sections: [{ questions: [{ q: "t?", options: ["x", "y", "z", "w"], correct: 0, difficulty: "medium", topic: "T" }] }], activeSection: 0, idx: 0, scores: new Map(), revealed: [], answeredBy: new Map(), cfg: quizConfigMod.DEFAULTS, questionNo: 1, qEpoch: 1, token: 0 });
  drop = evalEngineSnippet(coolStmt, { quizGame: sandboxQuizGame, lowerTxt: ".j Subaru Natsuki", chatId: CHAT, isBotCommand: true, isOwner: false, isGlobalMod: () => false, commandCooldowns: cooldownMap, senderJid: "u9@x" });
  ok(drop === false, "question OPEN: word answer bypasses the cooldown (reaches the receiver)");
  drop = evalEngineSnippet(coolStmt, { quizGame: sandboxQuizGame, lowerTxt: ".j b", chatId: CHAT, isBotCommand: true, isOwner: false, isGlobalMod: () => false, commandCooldowns: cooldownMap, senderJid: "u9@x" });
  ok(drop === false, "question OPEN: letter answer bypasses the cooldown");
  // 1c. quiz active but question closed -> cooldown back in force for commands
  sess.get(CHAT).qOpenUntil = 0;
  drop = evalEngineSnippet(coolStmt, { quizGame: sandboxQuizGame, lowerTxt: ".j cf 100", chatId: CHAT, isBotCommand: true, isOwner: false, isGlobalMod: () => false, commandCooldowns: cooldownMap, senderJid: "u9@x" });
  ok(drop === true, "question CLOSED: commands are cooldown-guarded again");
  sess.delete(CHAT);

  // answer routing fragment (letter/word)
  const routeFrag = extractFragment("const _pfx =", "lowerTxt.startsWith(`${_pfx} answer `);");
  ok(!!routeFrag && routeFrag.includes("_isLetterAns"), "letter/word routing fragment found");
  // normalize the prefix to .j (sandbox botConfig may differ) and evaluate ONLY
  // the format check (_isLetterAns || _isWordAns); chat-active gating is the
  // same hasActive() check exercised everywhere else.
  const routeStmt = routeFrag.replace(/const _pfx = [^;]+;/, 'const _pfx = ".j";');
  const routesToQuiz = (txt) => eval(`const lowerTxt = ${JSON.stringify(txt.toLowerCase())}; ${routeStmt} (_isLetterAns || _isWordAns)`);
  ok(routesToQuiz(".j b") === true, ".j b routes to the quiz receiver");
  ok(routesToQuiz(".j b extra") === true, ".j b <junk> routes to the quiz receiver");
  ok(routesToQuiz(".j answer Subaru Natsuki") === true, ".j answer <text> routes to the quiz receiver");
  ok(routesToQuiz(".j balance") === false, ".j balance does NOT route as a bare letter/answer form");
  // fallback interception fragment (any unmatched text while quiz active)
  const fbFrag = extractFragment("if (quizGame.hasActive(chatId)) {\n                    const _ans = cleanTxt", "if (resultQ.handled) return;");
  ok(!!fbFrag, "fallback interception fragment found (word answers reach handleAnswer)");

  // ═══ 2. busy group chat simulation ═══
  section("2. busy group chat (6 users, mixed behavior)");
  {
    const chat = "busy@g.us";
    const sock = { sent: [], async sendMessage(j, c) { this.sent.push({ j, c }); return { key: { id: "s" + this.sent.length } }; } };
    await quiz.startQuiz(sock, chat, "starter@x", MARK, { key: { id: "b0" } }, '"naruto" 3 easy', "Starter", null, { FAST: "t" });
    let s = null;
    for (let i = 0; i < 160 && !s; i++) { const cur = quiz.getSession(chat); if (cur && cur.awaitingGo) s = cur; else await wait(250); }
    ok(!!s, "quiz parked");
    s.cfg.questionGapMin = 1; s.cfg.questionGapMax = 2;
    const r = await quiz.confirmStart(sock, chat, s.askedBy, MARK, false);
    ok(r.handled && r.silent, "starter fired .j quiz go");
    s = null;
    for (let i = 0; i < 100 && !s; i++) { const cur = quiz.getSession(chat); if (cur && cur.qOpenUntil > Date.now()) s = cur; else await wait(100); }
    ok(!!s, "Q1 open (card delivered, window armed)");
    const users = ["u1@x", "u2@x", "u3@x", "u4@x", "u5@x", "u6@x"];
    const q1 = s.sections[0].questions[s.idx];
    // burst: everyone answers at once - correct, wrong, duplicate, garbage
    const burst = [
      ...users.map((u, i) => () => quiz.handleAnswer(sock, chat, u, i === 0 ? "ABCD"[q1.correct] : i === 1 ? "ABCD"[(q1.correct + 1) % 4] : i === 2 ? "ABCD"[q1.correct] : "zebra gibberish", MARK, { key: { id: "k" + i } }, "U" + i)),
      // same user double-send within ms (their second must be a no-op)
      () => quiz.handleAnswer(sock, chat, "u1@x", "ABCD"[q1.correct], MARK, { key: { id: "dup" } }, "U1"),
    ];
    await Promise.allSettled(burst.map((f) => f()));
    // snapshot Q1's attempt map BEFORE the gap->Q2 postQuestion resets it
    const q1Attempts = new Map(s.answeredBy);
    await wait(1500);
    ok(s.revealed.length === 1, `exactly ONE reveal under 7-msg burst (got ${s.revealed.length})`);
    ok(s.scores.get("u1@x")?.correct === 1, "u1 (first correct) scored");
    ok(!s.scores.get("u3@x"), "u3 (correct but AFTER u1 claimed) did not score");
    // u1 correct + u2 wrong + u3 correct-after-claim register attempts;
    // u4/u5/u6 typed garbage ("zebra gibberish") which is not an answer at
    // all - the receiver reacts 🤔 and does NOT burn their attempt (design).
    ok(s.answeredBy.size === 3 || q1Attempts.size === 3, `attempt map: 3 real attempts registered, garbage not counted (${q1Attempts.size})`);
    const u2after = q1Attempts.get("u2@x");
    ok(u2after && u2after.correct === false, "u2's wrong answer locked their attempt");
    // answers during the between-questions gap must NOT register against Q2
    await wait(2500); // gap is 1-2s -> Q2 posts
    const q2cards = sock.sent.filter((x) => typeof x.c?.text === "string" && x.c.text.includes("QUESTION 2/")).length;
    ok(q2cards === 1, "exactly ONE Q2 card after the burst");
    // late answer for the CLOSED Q1 must not score or error
    const rLate = await quiz.handleAnswer(sock, chat, "u6@x", "ABCD"[q1.correct], MARK, { key: { id: "late" } }, "U6");
    ok(rLate.handled === true, "late answer is absorbed without error");
    ok(s.idx === 1, "Q2 is the open question (idx=1)");
    await quiz.endQuiz(sock, chat, "starter@x", MARK, false);
    ok(!quiz.hasActive(chat), "quiz ended, chat freed");
  }

  // ═══ 3. connection outage (safeSend recovery) ═══
  section("3. connection outage -> safeSend recovery, no unseen time-out");
  {
    const chat = "outage@g.us";
    let down = false; // sock-level outage flag (flipped AFTER parking)
    let attempts = 0;
    const sock = {
      sent: [],
      async sendMessage(j, c) {
        attempts += 1;
        if (down) { throw new Error("Connection Closed"); }
        this.sent.push({ j, c, at: Date.now() });
        return { key: { id: "s" + attempts } };
      },
    };
    await quiz.startQuiz(sock, chat, "starter@x", MARK, { key: { id: "o0" } }, '"naruto" 2 easy', "Starter", null, { FAST: "t" });
    let s = null;
    for (let i = 0; i < 160 && !s; i++) { const cur = quiz.getSession(chat); if (cur && cur.awaitingGo) s = cur; else await wait(250); }
    ok(!!s, "quiz parked");
    s.cfg.questionGapMin = 1; s.cfg.questionGapMax = 1;
    // NOW kill the connection and fire the start gun: head card + Q1 card
    // must be RETRIED (not lost) and the answer window may only open once
    // the card is actually out.
    down = true;
    const downStarted = Date.now();
    const goT0 = Date.now();
    const downForMs = 7000; // covers safeSend attempts 0,1,2 -> recovers on 3rd
    setTimeout(() => { down = false; console.log(`  (connection restored after ${((Date.now() - downStarted) / 1000).toFixed(1)}s)`); }, downForMs);
    await quiz.confirmStart(sock, chat, s.askedBy, MARK, false);
    let deliveredAt = null;
    for (let i = 0; i < 300 && !deliveredAt; i++) {
      const card = sock.sent.find((x) => typeof x.c?.text === "string" && x.c.text.includes("QUESTION 1/"));
      if (card) deliveredAt = card.at;
      else await wait(100);
    }
    ok(!!deliveredAt, `Q1 card delivered +${((deliveredAt - goT0) / 1000).toFixed(1)}s (safeSend retried through the outage)`);
    ok(!!deliveredAt && deliveredAt - goT0 >= 6000, "delivery waited for the connection (not silently dropped, not lost)");
    await wait(500); // let the arming microtasks settle after the send resolved
    const armedAt = s.qOpenUntil > 0 ? s.qOpenUntil - s.cfg.timePerQuestion * 1000 : null;
    ok(!!armedAt && deliveredAt && Math.abs(armedAt - deliveredAt) < 1500, "deadline window armed AT delivery (no time's-up while the group was blind)");
    // quiz continues normally after recovery
    const q1 = s.sections[0].questions[s.idx];
    const rr = await quiz.handleAnswer(sock, chat, "p1@x", "ABCD"[q1.correct], MARK, { key: { id: "o1" } }, "P1");
    ok(rr.handled && s.scores.get("p1@x")?.correct === 1, "answers work normally after recovery");
    await quiz.endQuiz(sock, chat, "starter@x", MARK, false);
  }

  // ═══ 4. stress ═══
  section("4. stress: 50 answers in ms, two chats, rapid cycles");
  {
    // 4a. 10 users x 5 rapid sends on one question
    const chat = "stress@g.us";
    const sock = { sent: [], async sendMessage(j, c) { this.sent.push({ j, c }); return { key: { id: "s" + this.sent.length } }; } };
    await quiz.startQuiz(sock, chat, "starter@x", MARK, { key: { id: "s0" } }, '"naruto" 2 easy', "Starter", null, { FAST: "t" });
    let parked = null;
    for (let i = 0; i < 160 && !parked; i++) { const c = quiz.getSession(chat); if (c && c.awaitingGo) parked = c; else await wait(250); }
    if (parked) { parked.cfg.questionGapMin = 1; parked.cfg.questionGapMax = 1; await quiz.confirmStart(sock, chat, parked.askedBy, MARK, false); }
    let s = null;
    for (let i = 0; i < 200 && !s; i++) { const c = quiz.getSession(chat); if (c && !c.awaitingGo && c.qOpenUntil > Date.now()) s = c; else await wait(250); }
    ok(!!s, "stress quiz active");
    const q1 = s.sections[0].questions[s.idx];
    const fns = [];
    for (let u = 0; u < 10; u++) {
      for (let k = 0; k < 5; k++) {
        fns.push(() => quiz.handleAnswer(sock, chat, `u${u}@x`, k === 0 && u === 3 ? "ABCD"[q1.correct] : "ABCD"[(q1.correct + 1 + u) % 4], MARK, { key: { id: `k${u}_${k}` } }, `U${u}`));
      }
    }
    const t0 = Date.now();
    await Promise.allSettled(fns.map((f) => f()));
    ok(Date.now() - t0 < 5000, `50 concurrent answers processed in ${(Date.now() - t0)}ms (no deadlock)`);
    ok(s.revealed.length === 1, `exactly ONE reveal under 50-msg stress (got ${s.revealed.length})`);
    ok(s.scores.size === 1 && s.scores.get("u3@x")?.correct === 1, "exactly u3 scored (first-correct-wins held under stress)");
    await wait(800); // detached reveal chain completes (send -> idx advance)
    ok(s.idx === 1, "advanced exactly once");
    await quiz.endQuiz(sock, chat, "starter@x", MARK, false);

    // 4b. two chats simultaneously
    const chatA = "multiA@g.us", chatB = "multiB@g.us";
    const sockA = { sent: [], async sendMessage(j, c) { this.sent.push({ j, c }); return { key: { id: "a" + this.sent.length } }; } };
    const sockB = { sent: [], async sendMessage(j, c) { this.sent.push({ j, c }); return { key: { id: "b" + this.sent.length } }; } };
    await quiz.startQuiz(sockA, chatA, "sa@x", MARK, { key: { id: "ma" } }, '"naruto" 2 easy', "SA", null, { FAST: "t" });
    await quiz.startQuiz(sockB, chatB, "sb@x", MARK, { key: { id: "mb" } }, '"naruto" 2 easy', "SB", null, { FAST: "t" });
    let sa = null, sb = null;
    for (let i = 0; i < 200 && !(sa && sb); i++) {
      if (!sa) { const c = quiz.getSession(chatA); if (c && c.awaitingGo) { c.cfg.questionGapMin = 1; c.cfg.questionGapMax = 1; quiz.confirmStart(sockA, chatA, c.askedBy, MARK, false); } }
      if (!sb) { const c = quiz.getSession(chatB); if (c && c.awaitingGo) { c.cfg.questionGapMin = 1; c.cfg.questionGapMax = 1; quiz.confirmStart(sockB, chatB, c.askedBy, MARK, false); } }
      if (!sa) { const c = quiz.getSession(chatA); if (c && !c.awaitingGo && c.qOpenUntil > Date.now()) sa = c; }
      if (!sb) { const c = quiz.getSession(chatB); if (c && !c.awaitingGo && c.qOpenUntil > Date.now()) sb = c; }
      await wait(200);
    }
    ok(!!sa && !!sb, "two chats run quizzes simultaneously (gen gate FIFO)");
    if (sa && sb) {
      const qa = sa.sections[0].questions[sa.idx];
      const qb = sb.sections[0].questions[sb.idx];
      await Promise.allSettled([
        quiz.handleAnswer(sockA, chatA, "pa@x", "ABCD"[qa.correct], MARK, { key: { id: "pa" } }, "PA"),
        quiz.handleAnswer(sockB, chatB, "pb@x", "ABCD"[qb.correct], MARK, { key: { id: "pb" } }, "PB"),
      ]);
      ok(sa.scores.get("pa@x")?.correct === 1 && !sa.scores.get("pb@x"), "chat A answer scored in chat A only");
      ok(sb.scores.get("pb@x")?.correct === 1 && !sb.scores.get("pa@x"), "chat B answer scored in chat B only (no cross-chat bleed)");
    }
    await quiz.endQuiz(sockA, chatA, "sa@x", MARK, false);
    await quiz.endQuiz(sockB, chatB, "sb@x", MARK, false);
    ok(!quiz.hasActive(chatA) && !quiz.hasActive(chatB), "both chats freed cleanly");

    // 4c. rapid start/end cycles - no lock leaks
    const chatC = "cycles@g.us";
    const sockC = { sent: [], async sendMessage(j, c) { this.sent.push({ j, c }); return { key: { id: "c" + this.sent.length } }; } };
    let cyclesOk = true;
    for (let i = 0; i < 4; i++) {
      await quiz.startQuiz(sockC, chatC, "starter@x", MARK, { key: { id: "c0" } }, '"naruto" 2 easy', "S", null, { FAST: "t" });
      let ss = null;
      for (let k = 0; k < 160 && !ss; k++) { const c = quiz.getSession(chatC); if (c && c.awaitingGo) ss = c; else await wait(250); }
      if (!ss) { cyclesOk = false; break; }
      const ended = await quiz.endQuiz(sockC, chatC, "starter@x", MARK, false);
      if (!ended.handled || quiz.hasActive(chatC)) { cyclesOk = false; break; }
      // next start must NOT bounce (lock released each cycle)
      const again = await quiz.startQuiz(sockC, chatC, "starter@x", MARK, { key: { id: "c1" } }, '"naruto" 2 easy', "S", null, { FAST: "t" });
      if (again.message && again.message.includes("already")) { cyclesOk = false; break; }
      let ss2 = null;
      for (let k = 0; k < 160 && !ss2; k++) { const c = quiz.getSession(chatC); if (c && c.awaitingGo) ss2 = c; else await wait(250); }
      if (!ss2) { cyclesOk = false; break; }
      await quiz.endQuiz(sockC, chatC, "starter@x", MARK, false);
    }
    ok(cyclesOk, "4 rapid prepare->cancel->prepare cycles: no lock leaks, no ghost bounces");
    ok(!quiz.hasActive(chatC), "cycle chat freed");
  }

  console.log(`\n════════════════════════════════\nREALISTIC + STRESS QA: ${pass} pass, ${fail} fail\n════════════════════════════════`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(2); });
