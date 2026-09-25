// qa_quiz.js - 5+ RUNTIME test runs of the anime quiz system
// Real AniList network calls; smartGroqCall stubbed with realistic AND
// adversarial replies (no Groq key on this box - key lives on deploy host).
// Runs the REAL handlers through a mock sock, same entry the engine uses.
"use strict";
process.env.QUIZ_TEST = "1";
const path = require("path");
const quiz = require("../core/games/quiz");

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log("  ok -", label); } else { fail++; console.log("  FAIL -", label); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARK = "\u200B";

// ── mock sock: captures everything a real WhatsApp send would do ──
function mockSock() {
  const sent = [];
  return {
    sent,
    user: { id: "100@s.whatsapp.net" },
    sendMessage: async (jid, content, opts) => {
      sent.push({ jid, content, opts });
      return {};
    },
    relayMessage: async () => ({}),
  };
}

// ── smartGroqCall stubs ──
const makeValidAI = (n) => async (opts) => {
  const stems = [
    "Who is the main protagonist of this anime?",
    "Which studio produced this anime?",
    "How many episodes does this anime have?",
    "In what year did this anime premiere?",
    "Which genre best describes this anime?",
    "Who voices the lead character?",
    "What is the name of the lead character's brother?",
    "Which city is the main setting?",
    "What powers the protagonist's abilities?",
    "Who is the main antagonist?",
    "What is the signature item of the hero?",
    "Which organization opposes the heroes?",
    "What year did the manga start?",
    "Who directed the anime?",
    "What is the opening theme artist?",
  ];
  const questions = [];
  for (let i = 0; i < n; i++) {
    const correct = "Correct Option " + i;
    questions.push({
      q: stems[i % stems.length] + " (variant " + i + ")",
      options: [correct, "Wrong A " + i, "Wrong B " + i, "Wrong C " + i],
      answer: "A",
      topic: "Test",
    });
  }
  return JSON.stringify({ questions });
};
const malformedAI = async () => "Here is your quiz! ```json\n{\"questions\":[{\"q\":\"Truncated question without closing options\",\"options\":[\"Only one\"],\"answer\":\"B\"},{\"q\":\"Valid enough question about the plot of the anime?\",\"options\":[\"Right\",\"Wrong1\",\"Wrong2\",\"Wrong3\"],\"answer\":\"C\",\"topic\":\"Plot\"}]}``` hope this helps!!";
const garbageAI = async () => "I am sorry, I cannot comply because reasons. No JSON here at all.";
const hangingAI = async () => "{\"questions\":[{\"q\":\"Question about the story that got cut";

(async () => {
  console.log("════ 1. PARSE QUIZ ARGS (syntax surface) ════");
  {
    const p1 = quiz.parseQuizArgs('"Fullmetal Alchemist Brotherhood" 10 hard');
    ok(p1.title === "Fullmetal Alchemist Brotherhood" && p1.count === 10 && p1.difficulty === "hard", `quoted title + count + difficulty (${JSON.stringify(p1)})`);
    const p2 = quiz.parseQuizArgs("fmab 5 easy");
    ok(p2.title === "fmab" && p2.count === 5 && p2.difficulty === "easy", "bare title + count + difficulty");
    const p3 = quiz.parseQuizArgs('"One Piece"');
    ok(p3.title === "One Piece" && p3.count === 10 && p3.difficulty === "medium", "quoted only -> defaults");
    const p4 = quiz.parseQuizArgs("naruto 99 h");
    ok(p4.count === quiz.MAX_QUESTIONS && p4.difficulty === "hard" && p4.notes.length === 1, `count clamp 99->15 with note`);
    const p5 = quiz.parseQuizArgs("naruto 0 m");
    ok(p5.count === 1 && p5.notes.length === 1, "count clamp 0->1 with note");
    const p6 = quiz.parseQuizArgs("");
    ok(p6.title === "", "empty args -> usage path");
    const p7 = quiz.parseQuizArgs('"One Piece" nonsense 8');
    ok(p7.title === "One Piece" && p7.count === 8 && p7.notes.length === 1, "quoted title wins; leftover junk noted, not appended");
  }

  console.log("════ 2. JSON ROBUSTNESS (AI reply extraction + coercion) ════");
  {
    const good = JSON.stringify({ questions: [
      { q: "What is the name of Edward's younger brother in FMA?", options: ["Alphonse Elric", "Roy Mustang", "Winry Rockbell", "Scar"], answer: "A", topic: "Characters" },
      { q: "How many episodes does FMA Brotherhood have in total?", options: ["64", "51", "100", "26"], answer: "1", topic: "Facts" },
      { q: "Which studio animated FMA Brotherhood?", options: ["Bones", "Madhouse", "Pierrot", " ufotable"], answer: "a", topic: "Production" },
    ] });
    const qs = quiz.coerceQuestions(quiz.extractJsonObject(good), "medium");
    ok(qs.length === 3, `valid JSON -> 3 questions`);
    ok(qs[0].correct === 0 && qs[1].correct === 0 && qs[2].correct === 0, "A / 1 / a all normalize to index 0");
    ok(qs[2].options[0] === "Bones", "options preserved");

    const messy = quiz.extractJsonObject("Sure! Here you go:\n```json\n{\"questions\":[{\"q\":\"Q one about brothers?\",\"options\":[\"x\",\"y\",\"z\",\"w\"],\"answer\":\"B\"}]}\n```\nLet me know!");
    ok(messy && quiz.coerceQuestions(messy, "easy").length === 1, "fenced JSON inside prose");

    const trailing = quiz.extractJsonObject('{"questions":[{"q":"Q?","options":["a","b","c","d"],"answer":"C"}]}} extra braces');
    ok(trailing && trailing.questions.length === 1, "trailing brace-pair poison handled");

    const truncated = quiz.extractJsonObject('{"questions":[{"q":"Question about the story that got cut');
    const tq = quiz.coerceQuestions(truncated, "easy");
    ok(tq.length === 0, "truncated JSON coerces to ZERO usable questions (no crash)");

    // bad question filtering
    const bad = JSON.stringify({ questions: [
      { q: "short?", options: ["a", "b", "c", "d"], answer: "A" },                       // stem too short
      { q: "Question with only three options here?", options: ["a", "b", "c"], answer: "A" }, // 3 options
      { q: "Question with duplicate options listed?", options: ["same", "same", "x", "y"], answer: "A" }, // dup
      { q: "Question with an out of range answer?", options: ["a", "b", "c", "d"], answer: "E" }, // bad answer
      { q: "Completely valid question that should survive?", options: ["w", "x", "y", "z"], answer: "D", topic: "T" }, // ok
    ] });
    const bqs = quiz.coerceQuestions(JSON.parse(bad), "easy");
    ok(bqs.length === 1 && bqs[0].correct === 3, `junk filtered, only 1 survivor (D->idx 3)`);

    // duplicates by stem
    const dup = JSON.stringify({ questions: [
      { q: "Who is the main antagonist of the series?", options: ["a", "b", "c", "d"], answer: "A" },
      { q: "Who is the main antagonist of the series?", options: ["d", "c", "b", "a"], answer: "B" },
    ] });
    ok(quiz.coerceQuestions(JSON.parse(dup), "easy").length === 1, "duplicate stems deduped");
  }

  console.log("════ 3. FALLBACK GENERATOR (zero-AI guarantee) ════");
  {
    const anime = { title: "Fullmetal Alchemist: Brotherhood", type: "TV", episodes: 64, year: 2009, studio: "Bones", genres: ["Action", "Adventure"], score: 9.1 };
    const chars = [
      { name: "Edward Elric", role: "main", va: "Romi Park", favourites: 19000 },
      { name: "Alphonse Elric", role: "main", va: "Rie Kugimiya", favourites: 7000 },
      { name: "Roy Mustang", role: "supporting", va: "Shinichirou Miki", favourites: 14000 },
      { name: "Winry Rockbell", role: "supporting", va: "Megumi Takamoto", favourites: 4000 },
      { name: "Riza Hawkeye", role: "supporting", va: "Fumiko Orikasa", favourites: 4000 },
      { name: "Ling Yao", role: "supporting", va: "Mamoru Miyano", favourites: 3600 },
    ];
    const fb = quiz.buildFallbackQuestions(anime, chars, "medium", 10);
    ok(fb.length >= 6, `fallback yields enough questions (${fb.length})`);
    ok(fb.every((q) => q.options.length === 4 && q.correct >= 0 && q.correct <= 3), "every fallback question: exactly 4 options + valid index");
    ok(fb.every((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4), "no duplicate options");
    ok(fb.some((q) => q.q.includes("voice actor")), "VA questions present");
    ok(fb.some((q) => q.q.includes("studio") || q.q.includes("animated")), "studio question present");
    // determinism of correct-answer placement across shuffles: correct must be findable
    const withVAs = fb.filter((q) => q.q.includes("voice actor of Edward"));
    if (withVAs.length) ok(withVAs[0].options[withVAs[0].correct] === "Romi Park", "correct answer is actually correct (Romi Park)");
    const tiny = quiz.buildFallbackQuestions(anime, [], "easy", 10);
    ok(tiny.length >= 3, `no-characters anime still yields >=3 fact questions (${tiny.length})`);
  }

  console.log("════ 4. REAL ANILIST RESOLUTION (network) ════");
  let fmaAnime = null;
  {
    const r1 = await quiz.resolveAnime("Fullmetal Alchemist Brotherhood");
    ok(!r1.error && r1.anime, `FMA:B resolves (${r1.anime ? r1.anime.title : r1.error})`);
    if (r1.anime) {
      fmaAnime = r1.anime;
      ok(r1.anime.id === 5114, `canonical id 5114 picked (got ${r1.anime.id})`);
      ok(r1.anime.episodes === 64 && /bones/i.test(r1.anime.studio || ""), `ground truth fields present (eps=${r1.anime.episodes}, studio=${r1.anime.studio})`);
    }
    const r2 = await quiz.resolveAnime("fmab");
    ok(!r2.error && r2.anime && r2.anime.id === 5114, `abbreviation "fmab" -> 5114 (${r2.anime ? r2.anime.title : r2.error})`);
    await sleep(800);
    const r3 = await quiz.resolveAnime("naruto");
    ok(!r3.error && r3.anime && /naruto/i.test(r3.anime.title) && r3.anime.id === 20, `"naruto" -> original series #20 (${r3.anime ? r3.anime.title : "?"})`);
    await sleep(800);
    const r4 = await quiz.resolveAnime("Xyzzy Nonexistent Anime QQQ");
    ok(r4.error && /No anime found/i.test(r4.error), "nonexistent -> clean error");
    await sleep(800);
    const r5 = await quiz.resolveAnime("sword art online");
    ok(!r5.error && r5.anime && r5.anime.id === 11757, `"sword art online" -> season 1 #11757 (${r5.anime ? r5.anime.id : "?"})`);
    await sleep(800);
    // real characters for FMA
    if (fmaAnime) {
      const chars = await quiz.fetchCharacters(fmaAnime);
      ok(chars.length >= 5, `FMA:B characters fetched (${chars.length})`);
      ok(chars.some((c) => /Edward/.test(c.name)), "Edward Elric among characters");
      ok(chars.some((c) => c.va), "voice actor data present");
    }
  }

  console.log("════ 5. FULL SESSION RUN #1 (valid AI, real AniList, mock sock) ════");
  {
    const sock = mockSock();
    const chat = "1203630@g.us";
    const start = await quiz.startQuiz(sock, chat, "userA@s.whatsapp.net", MARK, { key: { id: "M1" } }, '"Fullmetal Alchemist Brotherhood" 5 medium', "Alice", makeValidAI(8), { FAST: "test-fast" });
    ok(start.handled && start.silent, "startQuiz handled (silent: cards already sent)");
    ok(quiz.hasActive(chat), "session registered");
    const qCards = sock.sent.filter((s) => s.content.text && /QUESTION 1\/5/.test(s.content.text));
    ok(qCards.length === 1, "question 1/5 card posted");
    const session = quiz.getSession(chat);
    ok(session && session.questions.length === 5, "session has 5 questions");
    ok(session.questions.every((q) => q.options.length === 4), "AI questions validated");

    // answer Q1 correctly
    const q1 = session.questions[0];
    const before = sock.sent.length;
    const ans = await quiz.handleAnswer(sock, chat, "userA@s.whatsapp.net", "ABCD"[q1.correct], MARK, { key: { id: "M2" } }, "Alice");
    ok(ans.handled, "correct answer accepted");
    ok(sock.sent.some((s) => s.content.text && /Correct!/.test(s.content.text)), "correct reveal posted");
    ok(session.scores.get("userA@s.whatsapp.net")?.points >= quiz.POINTS.medium, `points awarded (${session.scores.get("userA@s.whatsapp.net")?.points})`);

    // answering again mid-reveal is ignored
    const again = await quiz.handleAnswer(sock, chat, "userB@s.whatsapp.net", "A", MARK, { key: { id: "M3" } }, "Bob");
    ok(again.handled && session.scores.get("userB@s.whatsapp.net") === undefined, "second answer after claim ignored");

    // wrong answer on Q2 -> ❌ react, no points
    await sleep(quiz._internal ? 0 : 0);
    // force-advance to next question by waiting the next-delay
    await sleep(4900);
    const session2 = quiz.getSession(chat);
    ok(session2 && session2.idx === 1, `advanced to question 2 (${session2 ? session2.idx : "?"})`);
    const q2 = session2.questions[1];
    const wrongLetter = "ABCD"[(q2.correct + 1) % 4];
    const ansW = await quiz.handleAnswer(sock, chat, "userB@s.whatsapp.net", wrongLetter, MARK, { key: { id: "M4" } }, "Bob");
    ok(ansW.handled && sock.sent.some((s) => s.content.react && s.content.react.text === "❌"), "wrong answer gets ❌ react");
    ok(session2.scores.get("userB@s.whatsapp.net") === undefined, "no points for wrong answer");

    // end early as starter
    const end = await quiz.endQuiz(sock, chat, "userA@s.whatsapp.net", MARK, false);
    ok(end.handled && !quiz.hasActive(chat), "starter can end quiz");
    const finalCard = sock.sent.filter((s) => s.content.text && /QUIZ FINISHED/.test(s.content.text));
    ok(finalCard.length === 1, "final standings card posted exactly once");
  }

  console.log("════ 6. FULL SESSION RUN #2 (malformed AI -> fallback mix, timeout path) ════");
  {
    const sock = mockSock();
    const chat = "1203631@g.us";
    const start = await quiz.startQuiz(sock, chat, "userC@s.whatsapp.net", MARK, { key: { id: "M1" } }, '"One Piece" 4 easy', "Cara", malformedAI, { FAST: "test-fast" });
    ok(start.handled, "startQuiz with malformed AI handled");
    const session = quiz.getSession(chat);
    ok(!!session, "session exists despite malformed AI (fallback used)");
    if (session) {
      ok(session.questions.length === 4, `4 questions assembled (${session.questions.length})`);
      // timeout path: simulate deadline by directly invoking the deadline logic
      const { revealAndAdvance } = quiz._internal;
      await revealAndAdvance(sock, chat, session, null, true);
      ok(/Time's up!/.test(sock.sent.map((s) => s.content.text || "").join(" ")), "timeout reveal posted");
      ok(session.idx === 1, "advanced after timeout");
      const end = await quiz.endQuiz(sock, chat, "userC@s.whatsapp.net", MARK, true);
      ok(end.handled, "admin force-end works");
    }
  }

  console.log("════ 7. FULL SESSION RUN #3 (total AI failure -> pure fallback) ════");
  {
    const sock = mockSock();
    const chat = "1203632@g.us";
    const start = await quiz.startQuiz(sock, chat, "userD@s.whatsapp.net", MARK, { key: { id: "M1" } }, '"Death Note" 3 hard', "Dan", garbageAI, { FAST: "test-fast" });
    ok(start.handled, "garbage AI handled");
    const session = quiz.getSession(chat);
    ok(!!session && session.questions.length === 3, `pure fallback quiz launched (${session ? session.questions.length : 0})`);
    if (session) ok(session.questions.every((q) => q.options.length === 4), "fallback questions well-formed");
    await quiz.endQuiz(sock, chat, "userD@s.whatsapp.net", MARK, false);
  }

  console.log("════ 8. FULL SESSION RUN #4 (truncated AI -> fallback) ════");
  {
    const sock = mockSock();
    const chat = "1203633@g.us";
    await quiz.startQuiz(sock, chat, "userE@s.whatsapp.net", MARK, { key: { id: "M1" } }, '"Naruto" 3 medium', "Eve", hangingAI, { FAST: "test-fast" });
    const session = quiz.getSession(chat);
    ok(!!session, "truncated AI still produced a session");
    if (session) ok(session.questions.length === 3, "3 questions present");
    await quiz.endQuiz(sock, chat, "userE@s.whatsapp.net", MARK, false);
  }

  console.log("════ 9. FULL SESSION RUN #5 (DM context + leaderboard persistence) ════");
  {
    const sock = mockSock();
    const dm = "userF@s.whatsapp.net";
    await quiz.startQuiz(sock, dm, dm, MARK, { key: { id: "M1" } }, '"Attack on Titan" 3 easy', "Finn", makeValidAI(5), { FAST: "test-fast" });
    const session = quiz.getSession(dm);
    ok(!!session, "quiz runs in DM (non-group chat id)");
    if (session) {
      // answer everything correctly, fast path
      for (let i = 0; i < session.questions.length; i++) {
        const q = session.questions[session.idx];
        await quiz.handleAnswer(sock, dm, dm, "ABCD"[q.correct], MARK, { key: { id: "M" + i } }, "Finn");
        await sleep(4900); // next-question delay
      }
      await sleep(200);
      ok(!quiz.hasActive(dm), "quiz auto-finished after last question");
      const finalCard = sock.sent.map((s) => s.content.text || "").find((t) => /QUIZ FINISHED/.test(t));
      ok(!!finalCard && /Finn/.test(finalCard) && /Winner/.test(finalCard), "final card names the winner");
      // persistent leaderboard recorded (in-memory system cache without DB)
      const scores = quiz.loadScores(dm);
      ok(scores && scores[dm] && scores[dm].points > 0 && scores[dm].wins === 1, `leaderboard persisted (points=${scores && scores[dm] && scores[dm].points}, wins=${scores && scores[dm] && scores[dm].wins})`);
      const lbSock = mockSock();
      const lb = await quiz.showLeaderboard(lbSock, dm, dm, MARK, null);
      ok(lb.message && /QUIZ LEADERBOARD/.test(lb.message), "quizboard renders");
    }
  }

  console.log("════ 10. EDGE CASES ════");
  {
    const sock = mockSock();
    // double start refused
    const chat = "1203640@g.us";
    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "M1" } }, '"fmab" 3 easy', "A", makeValidAI(5), { FAST: "t" });
    const dup = await quiz.startQuiz(sock, chat, "u2@x", MARK, { key: { id: "M2" } }, '"naruto" 3 easy', "B", makeValidAI(5), { FAST: "t" });
    ok(dup.handled && /already running/.test(dup.message || ""), "second quiz in same chat refused");
    // non-starter cannot end
    const noEnd = await quiz.endQuiz(sock, chat, "u2@x", MARK, false);
    ok(noEnd.handled && /starter or admins/.test(noEnd.message || ""), "non-starter cannot end");
    await quiz.endQuiz(sock, chat, "u1@x", MARK, false);
    // pick without pending
    const noPick = await quiz.pickCandidate(sock, "1203641@g.us", "u@x", MARK, null, "1", "A", makeValidAI(5), { FAST: "t" });
    ok(/No pending/.test(noPick.message || ""), "pick with no pending -> clean error");
    // empty quiz args -> usage card
    const usage = await quiz.startQuiz(sock, "1203642@g.us", "u@x", MARK, null, "", "A", makeValidAI(5), { FAST: "t" });
    ok(usage.message && /Anime Quiz/.test(usage.message), "bare .j quiz -> usage card");
    // dedup machinery
    const key = "anilist:999888";
    const before = quiz.loadSeen(key).length;
    quiz.saveSeen(key, ["hash1", "hash2"]);
    ok(quiz.loadSeen(key).length === before + 2, "seen-list persists");
    const part = quiz.partitionFresh([{ q: "Question A?" }, { q: "Question B?" }].map((q) => ({ ...q, options: ["1", "2", "3", "4"], correct: 0 })), key);
    ok(part.fresh.length === 2, "fresh partition on new anime");
    quiz.saveSeen(key, ["hashA", "hashA"]); // duplicate hash collapse
    // leaderboard with no data
    const lbEmpty = await quiz.showLeaderboard(mockSock(), "no-such-chat@g.us", "x@y", MARK, null);
    ok(/No quiz scores/.test(lbEmpty.message || ""), "empty leaderboard -> clean message");
  }

  console.log(`\nQUIZ QA: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
