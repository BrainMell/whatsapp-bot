#!/usr/bin/env node
/* quiz_v8_qa.js — v8 QA on-box:
 *   1. matcher unit tests: typed answers accept exact/case/alts/typo,
 *      reject wrong + single letters, bare chatter passes through
 *   2. dataset smoke: buildDatasetQuestions for each mode, verify shape
 *      (typed -> hideOptions+single-option+alts; image -> asset)
 *   3. dataset sanity: counts, dup stems, dead-format checks
 */
'use strict';
process.chdir("/home/z/my-project") || 0;
const BOT = "/home/ubuntu/whatsapp-bot";

let fails = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) fails++;
}

// ── 1. matcher tests ──
const quiz = require(`${BOT}/core/games/quiz.js`);
const activeQuizzes = quiz._internal.activeQuizzes;
const CHAT = "qa:v8:test";
const sock = { sendMessage: async () => {} };
const m = { key: { id: "qa1", remoteJid: CHAT, fromMe: false } };

function sessionWith(q) {
  return {
    cancelled: false, token: 1, questionNo: 1,
    sections: [{ name: "QA", questions: [q], state: "active", perSection: 1 }],
    activeSection: 0, idx: 0,
    qOpenUntil: Date.now() + 8000, qStartedAt: Date.now(),
    answeredBy: new Map(), scores: new Map(), revealed: [],
    cfg: { timePerQuestion: 15, questionGapMin: 10, questionGapMax: 30 },
    revealLock: false,
  };
}
const typedQ = {
  q: 'Which TV series matches this plot: "a chemistry teacher cooks"?',
  options: ["Breaking Bad"], correct: 0, alts: ["Breaking Bad (2008)", "BB"],
  fmt: "typed", typed: true, hideOptions: true, difficulty: "medium", topic: "TV Series",
  type: "text", domain: "series",
};
const mcQ = {
  q: "Which company develops Overwatch?", options: ["Blizzard", "Valve", "EA", "Ubisoft"],
  correct: 0, difficulty: "easy", topic: "Video Games", type: "text", hideOptions: false,
};

async function matcherTests() {
  // typed: exact
  let s = sessionWith(typedQ); activeQuizzes.set(CHAT, s);
  await quiz.handleAnswer(sock, CHAT, "u1", "Breaking Bad", null, m, "U", { bareText: true });
  check("typed exact answer accepted", s.answeredBy.get("u1") && s.answeredBy.get("u1").correct === true);
  // typed: case/punct + alt
  s = sessionWith(typedQ); activeQuizzes.set(CHAT, s);
  await quiz.handleAnswer(sock, CHAT, "u2", "breaking bad", null, m, "U", { bareText: true });
  check("typed case-insensitive accepted", s.answeredBy.get("u2") && s.answeredBy.get("u2").correct === true);
  s = sessionWith(typedQ); activeQuizzes.set(CHAT, s);
  await quiz.handleAnswer(sock, CHAT, "u3", "BB", null, m, "U", { bareText: true });
  check("typed alias (alts) accepted", s.answeredBy.get("u3") && s.answeredBy.get("u3").correct === true);
  // typed: 1-char typo tolerance (len>=5 -> tol 1)
  s = sessionWith(typedQ); activeQuizzes.set(CHAT, s);
  await quiz.handleAnswer(sock, CHAT, "u4", "Breaking Bard", null, m, "U", { bareText: true });
  check("typed typo (lev 1) accepted", s.answeredBy.get("u4") && s.answeredBy.get("u4").correct === true);
  // typed: single letter must NOT match hidden-options question
  s = sessionWith(typedQ); activeQuizzes.set(CHAT, s);
  await quiz.handleAnswer(sock, CHAT, "u5", "a", null, m, "U", { bareText: true });
  check("typed single letter rejected", !s.answeredBy.has("u5"));
  // typed: bare chatter passes through untouched
  s = sessionWith(typedQ); activeQuizzes.set(CHAT, s);
  const r = await quiz.handleAnswer(sock, CHAT, "u6", "lol nice one", null, m, "U", { bareText: true });
  check("typed bare chatter not consumed", r && r.handled === false && !s.answeredBy.has("u6"));
  // MC: letter match still works (regression)
  s = sessionWith(mcQ); activeQuizzes.set(CHAT, s);
  await quiz.handleAnswer(sock, CHAT, "u7", "a", null, m, "U", { bareText: true });
  check("MC letter answer still accepted", s.answeredBy.get("u7") && s.answeredBy.get("u7").correct === true);
  // MC: option text match (regression)
  s = sessionWith(mcQ); activeQuizzes.set(CHAT, s);
  await quiz.handleAnswer(sock, CHAT, "u8", "Blizzard", null, m, "U", { bareText: true });
  check("MC option-text still accepted", s.answeredBy.get("u8") && s.answeredBy.get("u8").correct === true);
  // _lev sanity
  check("_lev same = 0", quiz._lev("abc", "abc") === 0);
  check("_lev distance 1", quiz._lev("kitten", "sitten") === 1);
  activeQuizzes.delete(CHAT);
}

// ── 2 + 3. dataset smoke + sanity ──
function datasetTests() {
  const DS = require(`${BOT}/data/quizDataset.json`);
  const qd = require(`${BOT}/core/games/quizDataset.js`);
  const info = qd.datasetInfo();
  check("dataset available", info.available);
  let totTyped = 0, totText = 0, totImg = 0, dupStems = 0;
  const stems = new Set();
  for (const mode of qd.MODES) {
    const built = qd.buildDatasetQuestions({ mode, count: 10, usedKeys: new Set(), difficulty: null });
    check(`${mode}: built 10 questions`, built.length === 10);
    const typed = built.filter((q) => q.typed);
    const imgs = built.filter((q) => q.type === "image");
    if (built.length) console.log(`  ${mode}: typed=${typed.length} mc=${built.length - typed.length - imgs.length}/img-typed embedded image=${imgs.length}`);
    for (const q of built) {
      if (q.typed) {
        if (!(q.hideOptions && Array.isArray(q.options) && q.options.length === 1 && Array.isArray(q.alts))) { check(`${mode}: typed shape bad: ${q.q.slice(0, 50)}`, false); break; }
      }
      if (!q.q || !Array.isArray(q.options) || !Number.isInteger(q.correct)) { check(`${mode}: bad shape ${JSON.stringify(q).slice(0, 80)}`, false); break; }
    }
    // dataset-level counts
    const cat = DS.categories[mode];
    for (const x of (cat.questions || [])) {
      const k = String(x.q).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (stems.has(k)) dupStems++;
      stems.add(k);
      if (x.fmt === "typed") { totTyped++; if (x.options.length !== 1) { check(`${mode} typed q has != 1 option`, false); break; } }
      else totText++;
    }
    totImg += (cat.images || []).length;
  }
  check(`no duplicate stems (found ${dupStems})`, dupStems === 0);
  console.log(`dataset: text=${totTyped + totText} (typed ${totTyped} = ${((totTyped / (totTyped + totText)) * 100).toFixed(1)}%) images=${totImg}`);
  check("typed is the majority (>=70%)", totTyped / (totTyped + totText) >= 0.7);
}

(async () => {
  await matcherTests();
  console.log("---");
  try { datasetTests(); } catch (e) { check("dataset tests crashed: " + e.message, false); }
  console.log(fails ? `\nQA FAIL: ${fails} failing checks` : "\nQA ALL PASS");
  process.exit(fails ? 1 : 0);
})();
