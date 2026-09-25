// qa_audit_engine_source.js — engine-layer audit assertions (P1/P4/P5/P17/P18)
// The full engine needs MongoDB to boot, so these assert the deployed SOURCE
// structure of the shared-layer changes (the runtime behavior they enable is
// covered end-to-end by qa_quiz_audit.js).
"use strict";
const fs = require("fs");
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  ok -", l); } else { fail++; console.log("  FAIL -", l); } };

const src = fs.readFileSync("/home/z/my-project/whatsapp-bot/core/engine.js", "utf8");

console.log("── P5: per-command timeout overrides at the shared layer ──");
ok(src.includes("const CMD_TIMEOUT_OVERRIDES = {"), "CMD_TIMEOUT_OVERRIDES map exists");
ok(/trends:\s*150000/.test(src), "trends gets a 150s window (was tripping 45s)");
ok(/audio:\s*180000/.test(src), "audio keeps its 180s window");
ok(/quiz:\s*90000/.test(src), "quiz window extended");
ok(/stock:\s*90000/.test(src), "stock window extended");
ok(/gstatus:\s*150000/.test(src), "gstatus window extended");
ok(src.includes("const limit = _cmdContext.timeoutMs || cmdLimit;"), "running commands can extend their own window (_cmdContext.timeoutMs)");

console.log("── P4: quiz answers exempt from the global command cooldown ──");
ok(src.includes("quizGame.hasActive(chatId) && quizGame.isQuizAnswerText(lowerTxt)"), "cooldown block checks quiz-answer messages");
ok(/isBotCommand && !_isQuizAnswerMsg && !isOwner/.test(src), "quiz answers skip the cooldown check+set");

console.log("── P1: .j a/b/c/d all route to the quiz answer handler ──");
ok(/_isLetterAns = \/\^\[abcd\]\$\/\.test\(_firstTok\)/.test(src), "letter routing covers a/b/c/d");
ok(src.includes('cleanTxt.substring(_pfx.length + 7).trim()   // strip "<prefix> answer"'), "answer-word form strips the right offset");

console.log("── P17: quizmod route (mod-only config) ──");
ok(src.includes("quizGame.handleQuizMod("), ".j quizmod routed to quiz module");

console.log("── P18: opscheck -info docs ──");
ok(src.includes('opsCheckCommands.handleOpsCheck(sock, chatId, cmdArgs.slice(1).join(" "))'), "opscheck receives args (-info)");
const ops = fs.readFileSync("/home/z/my-project/whatsapp-bot/core/commands/opsCheckCommands.js", "utf8");
ok(ops.includes("'-info'"), "opscheck handles -info");
ok(ops.includes("require('../games/quizConfig')"), "opscheck -info renders LIVE quizmod values from QuizConfig");
ok(ops.includes(".j quiz random"), "opscheck -info documents quiz random + flags");

console.log("── P11: shared audio infra injected into quiz (no parallel system) ──");
ok(src.includes("quizGame.setDeps({ goService: require('./utils/goImageService')"), "goService injected via quizGame.setDeps");

console.log("── regression pins: quiz routing intact ──");
ok(src.includes("quizGame.showLeaderboard("), "quizboard routed");
ok(src.includes("quizGame.pickCandidate("), "quiz pick routed");
ok(src.includes("quizGame.endQuiz("), "quiz end routed");
ok(src.includes("quizGame.startQuiz("), "quiz start routed");

console.log(`\nENGINE SOURCE: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
