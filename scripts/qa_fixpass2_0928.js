// Focused tests for the 2026-09-28 owner-audit round 2 (F1-F5, F7):
//   F1 safeSend: retry + delivery-anchored deadline (covered e2e in
//      qa_quiz_realistic.js §3; here: unit-level wiring)
//   F3 -images honored on short quizzes (single-section plans)
//   F4 planning heartbeat: no "the lore", mode-aware labels
//   F5 buildQuizConfig clamps stored garbage overrides
//   F7 questionNo counts DELIVERED questions only
process.chdir(__dirname + "/..");
const fs = require("fs");
let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}`); } }

(async () => {
  const quiz = require("../core/games/quiz.js");
  const quizConfigMod = require("../core/games/quizConfig.js");

  console.log("\n[F3] -images on short quizzes");
  const base = { questionCount: 10, sectionSize: 10, difficulty: "medium", imageQuestionCount: 0, audioQuestionCount: 0 };
  const avail = { characters: true, cosmology: true };
  let plan = quiz.buildSectionPlan({ ...base, imageQuestionCount: 5 }, avail);
  t("10q -images 5 -> Picture Round section exists", plan.some((s) => s.domain === "images"));
  t("picture section carries exactly 5", plan.find((s) => s.domain === "images")?.perSection === 5);
  t("plan totals 10", plan.reduce((a, s) => a + s.perSection, 0) === 10);
  plan = quiz.buildSectionPlan({ ...base, imageQuestionCount: 10 }, avail);
  t("-images >= count -> single Picture Round of 10", plan.length === 1 && plan[0].domain === "images" && plan[0].perSection === 10);
  plan = quiz.buildSectionPlan({ ...base, questionCount: 6, imageQuestionCount: 4 }, avail);
  t("6q -images 4 -> 4 images + 2 text, totals 6", plan.find((s) => s.domain === "images")?.perSection === 4 && plan.reduce((a, s) => a + s.perSection, 0) === 6);
  plan = quiz.buildSectionPlan({ ...base, imageQuestionCount: 5 }, { characters: false, cosmology: true });
  t("no characters -> graceful lore-only plan (no fake images)", !plan.some((s) => s.domain === "images"));
  plan = quiz.buildSectionPlan({ ...base, imageQuestionCount: 0 }, avail);
  t("no -images flag -> plain single section", plan.length === 1 && !plan.some((s) => s.domain === "images"));
  // random count=10 (the live-reported case): mixed plan needs lore>=6 so it
  // falls to the simple plan - which must now still honor -images
  plan = quiz.buildSectionPlan({ ...base, randomMode: true, imageQuestionCount: 5 }, avail);
  t("random 10 -images 5 (the live bug): pictures planned", plan.some((s) => s.domain === "images") && plan.reduce((a, s) => a + s.perSection, 0) === 10);

  console.log("\n[F4] planning label");
  const src = fs.readFileSync("core/games/quiz.js", "utf8");
  t("heartbeat send text has no 'the lore' (live template, not comments)", !/`[^\n`]*Still researching[^\n`]*the lore[^\n`]*`/.test(src));
  t("heartbeat uses mode-aware planningLabel", src.includes("Still researching for *${label}*") && src.includes("function planningLabel"));
  t("planningLabel maps logos/song/audio (no __dunder__ leak)", /planningLabel\(parsed\)/.test(src) && src.includes('if (parsed.mode === "logos") return "the logo round";'));
  const launch = src.slice(src.indexOf("async function launchQuizAsync"), src.indexOf("async function buildFranchiseContext"));
  t("launch passes planningLabel(parsed) to the heartbeat", launch.includes("startPrepHeartbeat(prep, sock, chatId, botMarker, planningLabel(parsed))"));

  console.log("\n[F5] config merge validation");
  // corrupt the group cache directly (simulates a stale/manual KV value)
  const cache = quizConfigMod._internal._groupCache;
  cache.set("corrupt@g.us", { timePerQuestion: 0, questionGapMin: -5, maxQuestions: 9999, voiceActorQuestionLimit: "abc" });
  const cfg = await quizConfigMod.buildQuizConfig("corrupt@g.us", {});
  t("timePerQuestion 0 clamped to registry min (7)", cfg.timePerQuestion === 7);
  t("questionGapMin -5 clamped to min (3)", cfg.questionGapMin === 3);
  t("maxQuestions 9999 clamped to max (50)", cfg.maxQuestions === 50);
  t("non-numeric override falls back to default", cfg.voiceActorQuestionLimit === quizConfigMod.DEFAULTS.voiceActorQuestionLimit);
  t("questionGapSeconds never returns <1", quizConfigMod.questionGapSeconds({ questionGapMin: 0, questionGapMax: -3 }) >= 1);
  cache.delete("corrupt@g.us");

  console.log("\n[F1] safeSend wiring");
  t("safeSend exists with retry backoff", src.includes("async function safeSend") && src.includes("SEND_RETRY_DELAYS_MS"));
  t("question cards go through safeSend", /return safeSend\(sock, chatId, \{\s*text: BOT_SAFE\(card\)/.test(src));
  t("reveal messages go through safeSend", src.includes('{ label: `reveal:${session.questionNo}` }'));
  t("planning + ready + final cards go through safeSend", ["planning-card", "ready-card", "final-scoreboard", "go-head"].every((m) => src.includes(`label: "${m}"`)));

  console.log("\n[F7] questionNo delivery-count");
  t("postQuestion no longer increments questionNo pre-loop", !/session\.questionNo \+= 1;\s*\n\s*session\.qStartedAt = Date\.now\(\);\s*\n\s*let q = section\.questions/.test(src));

  console.log(`\nRESULT: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e); process.exit(2); });
