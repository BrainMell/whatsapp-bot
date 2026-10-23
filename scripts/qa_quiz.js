// qa_quiz.js - CANONICAL post-overhaul suite (dataset era).
// The owner overhaul retired free-form franchise search: quizzes
// are dataset-backed (games/comics/movies/series + logos/song/audio/random),
// most questions are TYPED (players type the answer; q.alts aliases +
// levenshtein typo tolerance), and logo rounds carry recognizability tiers.
// The old free-form/Elden-Ring/Fandom suites (qa_quiz_audit/lore_live/
// iterations/media/media2) were retired WITH the pipeline they tested -
// their still-valid units (quizConfig, quizBank) live on here.
// Zero LLM needed: dataset questions are pre-verified at bake time.
"use strict";
require("dotenv").config();
const quiz = require("../core/games/quiz");
const quizConfigMod = require("../core/games/quizConfig");
const quizBank = require("../core/games/quizBank");

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log("  ok -", label); } else { fail++; console.log("  FAIL -", label); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARK = "\u200B";

// hard-kill guard: v8 lesson - media-worker heartbeats keep the event loop
// alive and orphan QA processes. Normal completion clears this timer.
const KILL = setTimeout(() => { console.error("HARD EXIT: QA exceeded 8 min (event loop kept alive)"); process.exit(2); }, 8 * 60 * 1000);

function mockSock() {
  const sent = [];
  return {
    sent,
    user: { id: "100@s.whatsapp.net" },
    sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return {}; },
    relayMessage: async () => ({}),
  };
}

// every quiz parks behind the ready gate: fire confirmStart
// (asker always passes the gate) until the first section is ACTIVE.
async function waitSession(chat, timeoutMs = 120000, sock = null) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = quiz.getSession(chat);
    if (s && s.awaitingGo) {
      s.cfg.questionGapMin = 1;
      s.cfg.questionGapMax = 1;
      await quiz.confirmStart(sock || mockSock(), chat, s.askedBy, MARK, false);
      await sleep(300);
      continue;
    }
    if (s && s.sections && s.sections[0] && s.sections[0].state === "ACTIVE") return s;
    await sleep(400);
  }
  return null;
}

// current live question of a session (sections can advance under us)
const curQ = (s) => {
  const sec = s.sections[s.activeSection];
  return sec && sec.questions[s.idx];
};

// poll until the open question is live inside its timer window (media
// resolution happens BEFORE the question opens, so this absorbs image fetch)
async function waitOpen(s, timeoutMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (s.cancelled) return null;
    const q = curQ(s);
    if (q && s.qOpenUntil && Date.now() <= s.qOpenUntil) return q;
    await sleep(300);
  }
  return null;
}

// wait until questionNo moves past `prevNo` (reveal + next-gap ran), or the
// session ended outright after the last question
async function waitAdvance(s, prevNo, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (s.questionNo > prevNo || s.cancelled) return true;
    await sleep(300);
  }
  return false;
}

// answer descriptor: typed questions are answered by TEXT (options were
// stripped to [correct]), MCQ by letter.
const answerFor = (q) => (q.typed ? String(q.options[q.correct]) : "ABCD"[q.correct]);

(async () => {
  console.log("════ 1. PARSE (dataset era contract) ════");
  {
 // free-form search RETIRED - quoted + bare titles must capture retiredTitle
    const p1 = quiz.parseQuizArgs('"Fullmetal Alchemist Brotherhood" 10 hard');
    ok(p1.retiredTitle === "Fullmetal Alchemist Brotherhood" && p1.count === 10 && p1.difficulty === "hard" && !p1.title, "quoted free-form title -> retiredTitle + count/diff kept");
    const p2 = quiz.parseQuizArgs("fmab 5 easy");
    ok(p2.retiredTitle === "fmab" && p2.count === 5 && p2.difficulty === "easy", "bare junk words -> retiredTitle");
 // dataset categories (+ alias folding: tv->series, manga->comics, film->movies, game->games)
    const cats = { games: "games", game: "games", gaming: "games", videogames: "games", comics: "comics", manga: "comics", comic: "comics", movies: "movies", film: "movies", films: "movies", series: "series", tv: "series", shows: "series", show: "series" };
    let catOK = true;
    for (const [word, mode] of Object.entries(cats)) {
      const p = quiz.parseQuizArgs(`${word} 8`);
      if (p.mode !== mode || p.title !== `__${mode}__` || p.count !== 8) { catOK = false; console.log("    !!", word, JSON.stringify(p)); }
    }
    ok(catOK, "all dataset aliases fold to the 4 categories with __title__ sentinels");
 // special modes
    const m1 = quiz.parseQuizArgs("logos 15");
    ok(m1.mode === "logos" && m1.title === "__logos__", "logos mode");
    const m2 = quiz.parseQuizArgs("song 10");
    ok(m2.mode === "song" && m2.title === "__song__", "song mode (spot the song)");
    const m3 = quiz.parseQuizArgs("audio 10");
    ok(m3.mode === "audio" && m3.title === "__audio__", "audio mode (theme songs)");
    const m4 = quiz.parseQuizArgs("music 5");
    ok(m4.mode === "song", "music alias -> song");
    const m5 = quiz.parseQuizArgs("-preplanned");
    ok(m5.mode === "preplanned" && m5.title === "__preplanned__", "preplanned flag -> mega pack");
    const m5b = quiz.parseQuizArgs("preplanned");
    ok(m5b.mode === "preplanned", "bare preplanned word works too");
    const m6 = quiz.parseQuizArgs("random 20");
    ok(m6.randomMode === true && m6.title === "__random__" && m6.count === 20, "random mode");
 // retired flags absorbed silently with a note (muscle memory still starts)
    const f1 = quiz.parseQuizArgs("series 8 hard -s cosmology");
    ok(f1.mode === "series" && f1.section === null && f1.notes.length === 1 && f1.difficulty === "hard", "retired -s flag absorbed with note, series still starts");
    const f2 = quiz.parseQuizArgs("games 8 -images 5");
    ok(f2.mode === "games" && f2.notes.length === 1 && f2.count === 8, "retired -images flag absorbed (arg swallowed too)");
 // count/difficulty pops
    ok(quiz.parseQuizArgs("movies 99 h").count === 99, "count 99 passes (clamped at config layer)");
    const p5 = quiz.parseQuizArgs("comics 0 m");
    ok(p5.count === 1 && p5.notes.length === 1, "count clamp 0->1 with note");
    ok(!quiz.parseQuizArgs("").title && !quiz.parseQuizArgs("").mode, "empty args -> usage path");
  }

  console.log("════ 2. JSON ROBUSTNESS (AI reply extraction + coercion) ════");
  {
    const good = JSON.stringify({ questions: [
      { q: "What is the name of Edward's younger brother in FMA?", options: ["Alphonse Elric", "Roy Mustang", "Winry Rockbell", "Scar"], answer: "A", topic: "Characters" },
      { q: "How many episodes does FMA Brotherhood have in total?", options: ["64", "51", "100", "26"], answer: "1", topic: "Facts" },
      { q: "Which studio animated FMA Brotherhood?", options: ["Bones", "Madhouse", "Pierrot", " ufotable"], answer: "a", topic: "Production" },
    ] });
    const qs = quiz.coerceQuestions(quiz.extractJsonObject(good), "medium");
    ok(qs.length === 3, "valid JSON -> 3 questions");
    ok(qs[0].correct === 0 && qs[1].correct === 0 && qs[2].correct === 0, "A / 1 / a all normalize to index 0");

    const truncated = quiz.extractJsonObject('{"questions":[{"q":"Question about the story that got cut');
    ok(quiz.coerceQuestions(truncated, "easy").length === 0, "truncated JSON coerces to ZERO usable questions (no crash)");

    const bad = JSON.stringify({ questions: [
      { q: "short?", options: ["a", "b", "c", "d"], answer: "A" },
      { q: "Question with only three options here?", options: ["a", "b", "c"], answer: "A" },
      { q: "Question with duplicate options listed?", options: ["same", "same", "x", "y"], answer: "A" },
      { q: "Question with an out of range answer?", options: ["a", "b", "c", "d"], answer: "E" },
      { q: "Completely valid question that should survive?", options: ["w", "x", "y", "z"], answer: "D", topic: "T" },
    ] });
    const bqs = quiz.coerceQuestions(JSON.parse(bad), "easy");
    ok(bqs.length === 1 && bqs[0].correct === 3, "junk filtered, 1 survivor (D->idx 3)");
  }

  console.log("════ 3. FALLBACK GENERATOR (zero-AI guarantee unit) ════");
  {
    const anime = { title: "Fullmetal Alchemist: Brotherhood", type: "TV", episodes: 64, year: 2009, studio: "Bones", genres: ["Action", "Adventure"], score: 9.1 };
    const chars = [
      { name: "Edward Elric", role: "main", va: "Romi Park", favourites: 19000 },
      { name: "Alphonse Elric", role: "main", va: "Rie Kugimiya", favourites: 7000 },
      { name: "Roy Mustang", role: "supporting", va: "Shinichirou Miki", favourites: 14000 },
      { name: "Winry Rockbell", role: "supporting", va: "Megumi Takamoto", favourites: 4000 },
    ];
    const fb = quiz.buildFallbackQuestions(anime, chars, "medium", 10);
    ok(fb.length >= 4, `fallback yields enough questions (${fb.length})`);
    ok(fb.every((q) => q.options.length === 4 && q.correct >= 0 && q.correct <= 3), "every fallback question: 4 options + valid index");
    const prodQs = fb.filter((q) => q.domain === "production");
    ok(prodQs.length <= 1, `production capped at 1 per P10 (got ${prodQs.length})`);
  }

  console.log("════ 4. QUIZCONFIG (P16/P17 units, ported from retired audit) ════");
  {
    const cfg = await quizConfigMod.buildQuizConfig("cfgtest@g.us", { count: 100, images: 99 });
    ok(cfg.maxQuestions === 50 && cfg.questionCount === 50, "count clamped to maxQuestions=50");
    ok(cfg.timePerQuestion === 15, "default timer 15s (7-20 band)");
    const r1 = quizConfigMod.validateValue(quizConfigMod.SETTING_DEFS.timer, "-5");
    ok(!r1.ok && r1.error.includes("7"), "timer -5 rejected with valid range");
    const r3 = quizConfigMod.validateValue(quizConfigMod.SETTING_DEFS.timer, "10");
    ok(r3.ok && r3.value === 10, "timer 10 accepted");
    const denied = await quizConfigMod.handleQuizMod("cfgtest@g.us", "timer 10", false, ".j");
    ok(denied.message.includes("moderators"), "quizmod denied for non-mod");
    const set = await quizConfigMod.handleQuizMod("cfgtest@g.us", "timer 7", true, ".j");
    ok(set.message.includes("7"), "quizmod timer 7 accepted");
    const cfg2 = await quizConfigMod.buildQuizConfig("cfgtest@g.us", {});
    ok(cfg2.timePerQuestion === 7, "per-group timer override applies");
    const cfgOther = await quizConfigMod.buildQuizConfig("othergroup@g.us", {});
    ok(cfgOther.timePerQuestion === 15, "other group unaffected (per-group scope)");
    const bad = await quizConfigMod.handleQuizMod("cfgtest@g.us", "banana 3", true, ".j");
    ok(bad.message.includes("Unknown setting"), "unknown setting rejected");
    await quizConfigMod.handleQuizMod("cfgtest@g.us", "reset", true, ".j");
    ok((await quizConfigMod.buildQuizConfig("cfgtest@g.us", {})).timePerQuestion === 15, "reset restores default");
  }

  console.log("════ 5. QUIZBANK stable identity + dedup (P15 unit) ════");
  {
    const mk = "qa-bank-test";
    const base = { q: "Who is this character from Test?", options: ["Emilia", "Rem", "Ram", "Beatrice"], correct: 0, difficulty: "easy", domain: "characters", topic: "Character ID", loreRef: { wiki: "rezero", page: "Emilia (Re:Zero)", section: "page-image" } };
    const stored = quizBank.bankPut(mk, { ...base, assetKey: "http://x/emilia.png", type: "image", asset: { kind: "image", url: "http://x/emilia.png" } });
    ok(stored, "bankPut stores validated question");
    const dup = quizBank.bankPut(mk, { ...base, q: "Can you identify this character from Test?", assetKey: "http://x/emilia.png", type: "image", asset: { kind: "image", url: "http://x/emilia.png" } });
    ok(!dup, "reworded duplicate of same image+fact REJECTED");
    const got = quizBank.bankLookup(mk, [], 5, { type: "image" });
    ok(got.length === 1 && got[0].fromBank, "bankLookup serves the validated question");
    const seenHash = [quiz.qhash("What trial does Subaru face in the Sanctuary?")];
    const t2 = quizBank.bankPut(mk, { ...base, q: "What trial does Subaru face in the Sanctuary?", options: ["The Tomb trials", "The duel", "The hunt", "The pact"], correct: 0, domain: "plot", loreRef: { wiki: "rezero", page: "Re:Zero kara Hajimeru Isekai Seikatsu", section: "Plot" } });
    ok(t2, "distinct fact stores");
    const withSeen = quizBank.bankLookup(mk, seenHash, 10, {});
    ok(!withSeen.some((q) => q.q.includes("Sanctuary")), "seen-list suppresses served question");
  }

  console.log("════ 6. GUIDANCE CARDS (retired search + usage) ════");
  {
    const sock = mockSock();
    const r1 = await quiz.startQuiz(sock, "guide-1@g.us", "u1@x", MARK, { key: { id: "G1" } }, '"One Piece" 5 medium', "U", null, { FAST: "t" });
    ok(r1.handled && !r1.silent && /retired/i.test(r1.message || ""), "retired free-form title -> guidance card, no session");
    ok(!quiz.getSession("guide-1@g.us") && !quiz.hasActive("guide-1@g.us"), "no session spawned for retired title");
    const r2 = await quiz.startQuiz(sock, "guide-2@g.us", "u1@x", MARK, null, "", "U", null, { FAST: "t" });
    ok(r2.handled && /Pick a category/i.test(r2.message || "") && /games/.test(r2.message) && /series/.test(r2.message), "bare .j quiz -> category usage card");
    ok(!/cosmology/i.test(r2.message || ""), "usage card no longer documents retired -s sections");
  }

  console.log("════ 7. DATASET SESSION E2E - series 5 (typed + MCQ + scoring) ════");
  {
    const sock = mockSock();
    const chat = "ds-series@g.us";
    const start = await quiz.startQuiz(sock, chat, "userA@s.whatsapp.net", MARK, { key: { id: "M1" } }, "series 5 medium", "Alice", null, { FAST: "test-fast" });
    ok(start.handled && start.silent, "startQuiz handled (silent: prep runs detached)");
    const session = await waitSession(chat, 120000, sock);
    ok(!!session, "session registered (dataset sections built synchronously)");
    if (session) {
      ok(session.mode === "series" && session.sections.length === 1, "mode=series, single section for count<=sectionSize");
      ok(q0len(session) === 5, `section built 5 questions (got ${q0len(session)})`);
      const qs = session.sections[0].questions;
      ok(qs.every((q) => Array.isArray(q.options) && q.options.length >= 1 && q.correct >= 0 && q.correct < q.options.length), "all questions well-formed (options + valid correct)");
      ok(qs.every((q) => ["easy", "medium", "hard"].includes(q.difficulty)), "every question carries a difficulty band");
      const typedN = qs.filter((q) => q.typed).length;
      const withAlts = qs.filter((q) => q.typed && Array.isArray(q.alts) && q.alts.length > 0);
      ok(typedN >= 1, `typed questions present (${typedN}/5 - v8: most questions typed)`);
      console.log(`    (typed=${typedN}/5, with-alts=${withAlts.length}, img=${qs.filter((q) => q.type === "image").length})`);

 // Q1: answer correctly - typed by TEXT, MCQ by letter
      const q1 = await waitOpen(session);
      ok(!!q1, "question 1 open inside timer window (media resolved before open)");
      if (q1) {
 // image questions send their card as a media CAPTION (quiz.js §card
 // sender: image = clue in caption) - scan text AND caption
        const sentTexts = () => sock.sent.map((s) => (s.content && (s.content.text || s.content.caption)) || "");
        const cardPosted = sentTexts().some((t) => /QUESTION 1\/5/.test(t));
        ok(cardPosted, "question 1/5 card posted");
        if (q1.typed) ok(/type the answer/i.test(sentTexts().join(" ")), "typed card omits options (type-the-answer)");
        const prevNo = session.questionNo;
        const a1 = await quiz.handleAnswer(sock, chat, "userA@s.whatsapp.net", answerFor(q1), MARK, { key: { id: "M2" } }, "Alice");
        ok(a1.handled, "correct answer accepted");
        ok(sock.sent.some((s) => s.content.react && s.content.react.text === "✅"), "✅ react on correct");
        await waitAdvance(session, prevNo, 20000);
        const score1 = session.scores.get("userA@s.whatsapp.net");
        ok(score1 && score1.points >= quiz.POINTS[q1.difficulty], `points awarded (${score1 && score1.points} Zeni, base ${quiz.POINTS[q1.difficulty]})`);

 // Q2: wrong answer on an MCQ -> + lockout; typed wrong text -> no lockout
        const q2 = await waitOpen(session);
        if (q2) {
          const prevNo2 = session.questionNo;
          if (!q2.typed && q2.options.length === 4) {
            const wrongLetter = "ABCD"[(q2.correct + 1) % 4];
            const aW = await quiz.handleAnswer(sock, chat, "userB@s.whatsapp.net", wrongLetter, MARK, { key: { id: "M3" } }, "Bob");
            ok(aW.handled && sock.sent.some((s) => s.content.react && s.content.react.text === "❌"), "wrong MCQ letter gets ❌");
            ok(session.answeredBy.get("userB@s.whatsapp.net")?.correct === false, "wrong answer locked out (one attempt per player)");
            await quiz.handleAnswer(sock, chat, "userB@s.whatsapp.net", "ABCD"[q2.correct], MARK, { key: { id: "M3b" } }, "Bob");
            ok(session.answeredBy.get("userB@s.whatsapp.net")?.correct === false, "second attempt by same player ignored (P1)");
            await waitAdvance(session, prevNo2, 20000);
          } else {
            const aT = await quiz.handleAnswer(sock, chat, "userB@s.whatsapp.net", "zzqqxx no such answer", MARK, { key: { id: "M3" } }, "Bob");
            ok(aT.handled && !session.answeredBy.get("userB@s.whatsapp.net"), "unmatched explicit text: no lockout (distractors stripped on typed)");
          }
        }

 // Q3 (if live is typed with alts): alias answer must be ACCEPTED -
 // v8 multi-answer directive ("allow multiple answers")
        const q3 = await waitOpen(session);
        if (q3 && q3.typed && Array.isArray(q3.alts) && q3.alts.length > 0) {
          const prevNo3 = session.questionNo;
          await quiz.handleAnswer(sock, chat, "userC@s.whatsapp.net", q3.alts[0], MARK, { key: { id: "M4" } }, "Cara");
          ok(session.answeredBy.get("userC@s.whatsapp.net")?.correct === true, `alt answer accepted: "${q3.alts[0]}" for "${q3.options[q3.correct]}"`);
          await waitAdvance(session, prevNo3, 20000);
        } else {
          console.log(`    (alt-acceptance not exercised this draw - q3 ${q3 ? (q3.typed ? `typed, alts=${(q3.alts || []).length}` : "MCQ") : "none"})`);
        }
 // unit-level: _lev typo tolerance contract (deterministic, no timing)
        ok(quiz._lev("breaking bad", "breaking badd") === 1, "_lev typo distance 1");
        ok(quiz._lev("abc", "abc") === 0, "_lev identity 0");

 // finish early as starter
        const end = await quiz.endQuiz(sock, chat, "userA@s.whatsapp.net", MARK, false);
        ok(end.handled && !quiz.hasActive(chat), "starter can end quiz");
        const finalCard = sock.sent.filter((s) => s.content.text && /QUIZ FINISHED/.test(s.content.text));
        ok(finalCard.length === 1, "final standings card posted exactly once");
      }
    }
  }

  console.log("════ 8. CATEGORY SPIN - games easy / comics hard / movies ════");
  {
    for (const [args, mode, chat] of [["games 3 easy", "games", "ds-games@g.us"], ["comics 3 hard", "comics", "ds-comics@g.us"], ["movies 3", "movies", "ds-movies@g.us"]]) {
      const sock = mockSock();
      const start = await quiz.startQuiz(sock, chat, "u@x", MARK, { key: { id: "S" + mode } }, args, "U", null, { FAST: "t" });
      const session = await waitSession(chat, 120000, sock);
      ok(!!session && session.mode === mode, `${args}: session up (mode=${session && session.mode})`);
      if (session) {
        const qs = session.sections[0].questions;
        ok(qs.length === 3, `${args}: 3 questions built`);
        ok(qs.every((q) => q.q && q.topic && q.difficulty), `${args}: questions carry stem/topic/difficulty`);
        const img = qs.filter((q) => q.type === "image");
        console.log(`    (${mode}: typed=${qs.filter((q) => q.typed).length}/3 img=${img.length} diff=[${[...new Set(qs.map((q) => q.difficulty))].join(",")}] cls-lore-src=${qs.filter((q) => q.loreRef === null).length}/3)`);
 // dataset builder note: difficulty is a PREFERENCE - easy sessions must
 // never be flooded with hard-only unless the band ran dry (fill note).
        if (/easy/.test(args)) ok(qs.filter((q) => q.difficulty === "easy").length >= 1, "easy session prefers easy band");
        const q1 = await waitOpen(session, 60000);
        ok(!!q1, `${args}: first question opens (media gate passed)`);
        await quiz.endQuiz(sock, chat, "u@x", MARK, false);
      }
    }
  }

  console.log("════ 9. RANDOM MIX - logo round first + tier validity ════");
  {
    const sock = mockSock();
    const chat = "ds-random@g.us";
    await quiz.startQuiz(sock, chat, "u@x", MARK, { key: { id: "M9" } }, "random 10", "U", null, { FAST: "t" });
    const session = await waitSession(chat, 150000, sock);
    ok(!!session && session.mode === "random-ds", "random 10 -> random-ds session");
    if (session) {
      ok(session.sections[0].domain === "logos" && /Logo/i.test(session.sections[0].name), "Logo Round leads the mix");
      const domains = session.sections.map((s) => s.domain);
      ok(domains.slice(1).every((d) => ["games", "movies", "series", "comics"].includes(d)), `dataset rounds round-robin (${domains.join(",")})`);
      ok(session.sections.reduce((a, s) => a + s.perSection, 0) === 10, "round sizes sum to requested count");
      const logoQs = session.sections[0].questions;
      ok(logoQs.length === session.sections[0].perSection, "logo round fully built (images fetched before ready card)");
      ok(logoQs.every((q) => ["easy", "medium", "hard"].includes(q.difficulty || "easy")), `logo questions carry tier bands ([${[...new Set(logoQs.map((q) => q.difficulty))].join(",")}])`);
      ok(logoQs.every((q) => q.type === "image" && q.asset && (q.asset.buf || q.asset.url)), "logo questions are real-image questions");
      await quiz.endQuiz(sock, chat, "u@x", MARK, false);
    }
  }

  console.log("════ 10. EDGE CASES ════");
  {
    const sock = mockSock();
    const chat = "edge-1@g.us";
    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "E1" } }, "series 3 easy", "A", null, { FAST: "t" });
    const session = await waitSession(chat, 120000, sock);
    ok(!!session, "edge session up");
    const dup = await quiz.startQuiz(sock, chat, "u2@x", MARK, { key: { id: "E2" } }, "games 3 easy", "B", null, { FAST: "t" });
    ok(dup.handled && /already (running|being prepared|waiting)/i.test(dup.message || ""), "second quiz in same chat refused");
    const noEnd = await quiz.endQuiz(sock, chat, "u2@x", MARK, false);
    ok(noEnd.handled && /starter, admins or Quiz Mods/i.test(noEnd.message || ""), "non-starter cannot end");
    await quiz.endQuiz(sock, chat, "u1@x", MARK, false);
 // seen-list + fresh partition machinery (dedup across sessions)
    const key = "ds-edge:unit";
    const before = quiz.loadSeen(key).length;
    quiz.saveSeen(key, ["hash1", "hash2"]);
    ok(quiz.loadSeen(key).length === before + 2, "seen-list persists");
    const part = quiz.partitionFresh([{ q: "Question A?" }, { q: "Question B?" }].map((q) => ({ ...q, options: ["1", "2", "3", "4"], correct: 0 })), key);
    ok(part.fresh.length === 2, "fresh partition on new key");
    quiz.saveSeen(key, ["hashA", "hashA"]);
 // empty leaderboard -> clean message
    const lbEmpty = await quiz.showLeaderboard(mockSock(), "no-such-chat-edge@g.us", "x@y", MARK, null);
    ok(/No quiz scores/i.test(lbEmpty.message || ""), "empty leaderboard -> clean message");
  }

  clearTimeout(KILL);
  console.log(`\nQUIZ QA (dataset era): ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });

function q0len(s) { return (s.sections[0] && s.sections[0].questions.length) || 0; }
