// qa_new_features_integration.js - pins the engine wiring for quiz/stock/trends
// (source-level pins, the qa_activity_gstatus methodology) + module contracts.
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log("  ok -", label); } else { fail++; console.log("  FAIL -", label); } };

const engineSrc = fs.readFileSync(path.join(__dirname, "..", "core", "engine.js"), "utf8");
const registrySrc = fs.readFileSync(path.join(__dirname, "..", "core", "utils", "commandRegistry.js"), "utf8");

(async () => {
  console.log("════ 1. engine requires the three modules once ════");
  ok(/const quizGame = require\('\.\/games\/quiz'\);/.test(engineSrc), "quizGame required");
  ok(/const stockChart = require\('\.\/utils\/stockChart'\);/.test(engineSrc), "stockChart required");
  ok(/const trendsChart = require\('\.\/utils\/trendsChart'\);/.test(engineSrc), "trendsChart required");
  ok((engineSrc.match(/require\('\.\/games\/quiz'\)/g) || []).length === 1, "quiz required exactly once (no circular dup)");

  console.log("════ 2. dispatch blocks exist and pass the right args ════");
  ok(engineSrc.includes("quizGame.showLeaderboard("), "quizboard -> showLeaderboard");
  ok(engineSrc.includes("quizGame.pickCandidate("), "quiz pick -> pickCandidate");
  ok(engineSrc.includes("quizGame.endQuiz("), "quiz end -> endQuiz");
  ok(engineSrc.includes("quizGame.startQuiz("), "quiz start -> startQuiz");
  ok(engineSrc.includes("quizGame.handleAnswer("), "a/answer -> handleAnswer");
  ok(engineSrc.includes("quizGame.hasActive(chatId)"), "answer gate checks hasActive (fall-through when idle)");
  ok(engineSrc.includes("stockChart.handleStock("), "stock -> handleStock");
  ok(engineSrc.includes("trendsChart.handleTrends("), "trends -> handleTrends");
  // quiz start receives smartGroqCall + MODELS (AI injection like debate)
  const quizStartIdx = engineSrc.indexOf("await quizGame.startQuiz(");
  ok(quizStartIdx > 0, "quiz start call found");
  {
    const seg = engineSrc.slice(quizStartIdx, quizStartIdx + 500);
    ok(/smartGroqCall,/.test(seg) && /MODELS,/.test(seg), "startQuiz receives smartGroqCall + MODELS");
    ok(/cleanTxt/.test(engineSrc.slice(engineSrc.lastIndexOf("quizArgs", quizStartIdx), quizStartIdx)), "quiz args from cleanTxt (formatting stripped)");
  }
  ok(/await quizGame\.pickCandidate\([\s\S]{0,600}?smartGroqCall,/.test(engineSrc), "pickCandidate also receives smartGroqCall");
  ok(/await stockChart\.handleStock\([\s\S]{0,400}?stockArgs,/.test(engineSrc), "handleStock receives raw args");
  ok(/await trendsChart\.handleTrends\([\s\S]{0,400}?trendsArgs,/.test(engineSrc), "handleTrends receives raw args");

  console.log("════ 3. dispatch ORDER (no shadowing, no early swallow) ════");
  const wordleGuess = engineSrc.indexOf("wordle <word> - Make a guess (MUST BE LAST)");
  const quizBlock = engineSrc.indexOf("ANIME QUIZ (.j quiz / .j a / .j quizboard)");
  const marketBlock = engineSrc.indexOf("REAL-WORLD MARKET + GOOGLE TRENDS");
  const progBlock = engineSrc.indexOf("// PROGRESSION COMMANDS");
  ok(wordleGuess > 0 && wordleGuess < quizBlock, "quiz block after wordle");
  ok(quizBlock < marketBlock && marketBlock < progBlock, "quiz -> market -> progression order intact");
  // `.j stock` must not collide with the RPG `.j stocks` block (which sits earlier)
  const rpgStocks = engineSrc.indexOf("} stocks` ||");
  ok(rpgStocks > 0 && rpgStocks < marketBlock, "RPG stocks handled earlier; singular .j stock free");
  // answer fall-through: block body must NOT return when no quiz is active
  const ansIdx = engineSrc.indexOf("a <letter|option> - answer the running quiz");
  ok(ansIdx > 0, "answer block found");
  {
    const seg = engineSrc.slice(ansIdx, ansIdx + 1200);
    ok(/if \(quizGame\.hasActive\(chatId\)\)/.test(seg), "answers only consumed with an active quiz");
    ok(!/no active quiz -> fall through[\s\S]{0,200}?return;/.test(seg), "no premature return in the idle path");
  }

  console.log("════ 4. unknown-command surfaces ════");
  const allowIdx = engineSrc.indexOf('"quizboard",\n                      "stock",\n                      "trends",');
  ok(allowIdx > 0, "quizboard/stock/trends in unknown-command suppress allowlist");
  ok(engineSrc.includes('"quiz",\n                      "quiz pick",\n                      "quiz end",\n                      "quizboard",'), "suggestion list carries quiz family");
  // "a"/"answer" deliberately NOT in the suppress allowlist (feedback when idle)
  const allowSeg = engineSrc.slice(engineSrc.lastIndexOf("validPrefixes.some"), engineSrc.lastIndexOf("validPrefixes.some") + 1400);
  ok(!/"answer",/.test(allowSeg), '"answer" NOT suppressed (idle .j answer still gives feedback)');

  console.log("════ 5. command registry + menu contract ════");
  ok(/cmd: 'quiz'/.test(registrySrc) && /cmd: 'quiz pick'/.test(registrySrc) && /cmd: 'quiz end'/.test(registrySrc) && /cmd: 'a'/.test(registrySrc) && /cmd: 'quizboard'/.test(registrySrc), "GAMES registry: quiz family + a + quizboard");
  ok(/cmd: 'stock'/.test(registrySrc) && /cmd: 'trends'/.test(registrySrc), "INFO registry: stock + trends");

  console.log("════ 6. module contracts (what the engine calls actually exists) ════");
  const quiz = require("../core/games/quiz");
  for (const fn of ["hasActive", "startQuiz", "pickCandidate", "endQuiz", "handleAnswer", "showLeaderboard"]) {
    ok(typeof quiz[fn] === "function", `quiz.${fn} exported`);
  }
  const stock = require("../core/utils/stockChart");
  ok(typeof stock.handleStock === "function" && stock.RANGES && Object.keys(stock.RANGES).length === 6, "stock.handleStock + 6 ranges");
  const trends = require("../core/utils/trendsChart");
  ok(typeof trends.handleTrends === "function" && trends.RANGES && Object.keys(trends.RANGES).length === 8, "trends.handleTrends + 8 ranges");
  // engine requires must not break boot (fresh require of all three)
  ok(quiz.POINTS.medium === 100 && quiz.QUESTION_SECONDS === 30, "quiz constants sane");

  console.log("════ 7. no collateral damage to pinned systems ════");
  ok(engineSrc.includes("gstatusAnnounce"), "gstatus surface untouched");
  ok(engineSrc.includes("getChatActivityBetween"), "activity surface untouched");
  ok(engineSrc.includes("judgeDebate"), "debate/judge untouched");
  ok(/battlefield|Battles|battle/.test(engineSrc), "battle systems present (no removals)");

  console.log(`\nINTEGRATION PINS: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
