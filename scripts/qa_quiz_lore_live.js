// qa_quiz_lore_live.js — REAL command-path test of the overhauled lore quiz.
// Uses the ACTUAL quiz module (startQuiz/handleAnswer) + z-ai CLI as the LLM
// stand-in (Groq is IP-blocked from this sandbox; live box uses Groq).
"use strict";
require("dotenv").config();
const quiz = require("/home/z/my-project/whatsapp-bot/core/games/quiz");
const systemMod = require("/home/z/my-project/whatsapp-bot/core/utils/system");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  ok -", l); } else { fail++; console.log("  FAIL -", l); } };

const { execFile } = require("child_process");
async function zaiLLM(opts) {
  const sys = (opts.messages || []).find((m) => m.role === "system");
  const user = [...(opts.messages || [])].reverse().find((m) => m.role === "user");
  const args = ["chat", "-p", user ? user.content : "", "-o", "/tmp/zai_out_q.json"];
  if (sys) args.push("-s", sys.content);
  await new Promise((resolve, reject) => {
    execFile("z-ai", args, { timeout: 90000, maxBuffer: 10 * 1024 * 1024 }, (e) => (e ? reject(e) : resolve()));
  });
  return JSON.parse(require("fs").readFileSync("/tmp/zai_out_q.json", "utf8"));
}

const MARK = "\u200B";
function makeMockSock() {
  const sent = [];
  return {
    sent,
    user: { id: "bot@s.whatsapp.net" },
    sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return {}; },
  };
}

(async () => {
  // system KV needs mongo? system.get/set - check it works offline
  // (quiz uses system for dedup + scores; if it throws, quiz would break)
  console.log("── 0. system KV sanity ──");
  try {
    systemMod.set("quiz_test_kv", [1, 2, 3]);
    const v = systemMod.get("quiz_test_kv", null);
    ok(Array.isArray(v) && v.length === 3, "system KV set/get roundtrip");
  } catch (e) {
    ok(false, "system KV: " + e.message);
  }

  console.log("── 1. parseQuizArgs: -s / --section ──");
  {
    const a = quiz.parseQuizArgs('"Dragon Ball" 3 hard -s cosmology');
    ok(a.title === "Dragon Ball" && a.count === 3 && a.difficulty === "hard" && a.section === "cosmology", "-s cosmology parsed");
    const b = quiz.parseQuizArgs('"Re:Zero" 5 medium --section characters');
    ok(b.section === "characters", "--section characters parsed");
    const c = quiz.parseQuizArgs('"JJK" 3 hard -s powerscaling');
    ok(c.section === "powerscaling", "powerscaling alias");
    const d = quiz.parseQuizArgs('"X" 3 -s banana');
    ok(d.section === null && d.notes.length > 0, "invalid section rejected with note");
    const e = quiz.parseQuizArgs('"One Piece" plot');
    ok(e.title === "One Piece" && e.section === null && e.difficulty === "medium", "bare word not treated as section");
  }

  console.log("── 2. question plan weights ──");
  {
    const ql = require("/home/z/my-project/whatsapp-bot/core/games/quizLore");
    const counts = { plot: 0, characters: 0, cosmology: 0, powerscaling: 0, production: 0 };
    const N = 400;
    for (let i = 0; i < N; i++) {
      ql.buildQuestionPlan(10, "medium", null).forEach((d) => counts[d]++);
    }
    const tot = N * 10;
    const pct = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / tot) * 100)]));
    console.log("  distribution:", JSON.stringify(pct));
    ok(pct.plot > 32 && pct.plot < 58, "plot ~45%");
    ok(pct.characters > 22 && pct.characters < 48, "characters ~35%");
    ok(pct.cosmology + pct.powerscaling > 7 && pct.cosmology + pct.powerscaling < 25, "cosmo+scaling ~15%");
    ok(pct.production >= 0 && pct.production < 15, "production ~5% (never dominant)");
    const forced = ql.buildQuestionPlan(5, "hard", "cosmology");
    ok(forced.every((d) => d === "cosmology"), "-s override forces 100% domain");
  }

  console.log("── 3. REAL end-to-end: Elden Ring cosmology quiz (mock chat) ──");
  {
    const sock = makeMockSock();
    const res = await quiz.startQuiz(
      sock, "chat-1@g.us", "user1@s.whatsapp.net", MARK, { key: { id: "M1" } },
      '"Elden Ring" 3 hard -s cosmology', "Tester", zaiLLM, { FAST: "openai/gpt-oss-20b" },
    );
    ok(res.handled && res.silent, "startQuiz launched silently");
    const session = quiz.getSession("chat-1@g.us");
    ok(!!session, "session active");
    if (session) {
      ok(session.questions.length === 3, `3 questions built (got ${session.questions.length})`);
      ok(session.section === "cosmology", "section locked in session");
      const loreQs = session.questions.filter((q) => q.loreRef);
      ok(loreQs.length === session.questions.length, "all questions carry a lore reference (wiki:page/section)");
      const tokMax = Math.max(0, ...loreQs.map((q) => q.promptTok || 0));
      ok(tokMax > 0 && tokMax < 800, `prompt tokens < 800 (max seen ${tokMax})`);
      const domains = new Set(loreQs.map((q) => q.domain));
      ok(domains.size === 1 && domains.has("cosmology"), "all domains forced to cosmology");
      console.log("  sample question:", session.questions[0].q.slice(0, 110));
      console.log("  options:", session.questions[0].options.join(" | ").slice(0, 110));
      // answer flow: correct letter wins points
      const q0 = session.questions[0];
      const correctLetter = "ABCD"[q0.correct];
      await quiz.handleAnswer(sock, "chat-1@g.us", "user1@s.whatsapp.net", correctLetter.toLowerCase(), MARK, { key: { id: "A1" } }, "Tester");
      ok(session.scores.get("user1@s.whatsapp.net")?.correct === 1, "correct answer scored");
      ok(session.idx === 1, "advanced to next question");
      // wrong answer reacts but doesn't advance (pick a letter that is NOT correct)
      const before = session.idx;
      const wrongLetter = "ABCD".replace("ABCD"[session.questions[session.idx].correct], "")[0];
      await quiz.handleAnswer(sock, "chat-1@g.us", "user2@s.whatsapp.net", wrongLetter, MARK, { key: { id: "A2" } }, "Rival");
      ok(session.idx === before, "wrong answer does not advance");
      const wrongReact = sock.sent.find((s) => s.content?.react?.text === "❌");
      ok(!!wrongReact, "wrong answer reacted ❌");
      // end the quiz (starter)
      const endRes = await quiz.endQuiz(sock, "chat-1@g.us", "user1@s.whatsapp.net", MARK, false);
      ok(endRes.handled && endRes.silent, "endQuiz finished");
      ok(!quiz.hasActive("chat-1@g.us"), "session cleared");
      const fin = sock.sent.find((s) => typeof s.content?.text === "string" && s.content.text.includes("QUIZ FINISHED"));
      ok(!!fin, "final standings sent");
    }
  }

  console.log("── 4. REAL end-to-end: Batman randomized quiz ──");
  {
    const sock = makeMockSock();
    const res = await quiz.startQuiz(
      sock, "chat-2@g.us", "user1@s.whatsapp.net", MARK, { key: { id: "M2" } },
      '"Batman" 4 medium', "Tester", zaiLLM, { FAST: "openai/gpt-oss-20b" },
    );
    ok(res.handled && res.silent, "Batman quiz launched");
    const session = quiz.getSession("chat-2@g.us");
    if (session) {
      console.log(`  built ${session.questions.length} questions; domains: ${session.questions.map((q) => q.domain || "meta").join(",")}`);
      ok(session.questions.length >= 3, "at least 3 questions");
      const loreQs = session.questions.filter((q) => q.loreRef);
      ok(loreQs.length >= 2, "majority lore-sourced");
      const domains = new Set(session.questions.map((q) => q.domain).filter(Boolean));
      ok(domains.size >= 2, `randomized domains (got ${[...domains].join(",")})`);
      const tokMax = Math.max(0, ...session.questions.map((q) => q.promptTok || 0));
      ok(tokMax < 800, `token budget respected (max ${tokMax})`);
      await quiz.endQuiz(sock, "chat-2@g.us", "user1@s.whatsapp.net", MARK, false);
    }
  }

  console.log("── 5. invalid franchise ──");
  {
    const sock = makeMockSock();
    const res = await quiz.startQuiz(
      sock, "chat-3@g.us", "user1@s.whatsapp.net", MARK, { key: { id: "M3" } },
      '"QQZZX Franchise Does Not Exist 123"', "Tester", zaiLLM, null,
    );
    ok(res.handled && !!res.message && res.message.includes("❌"), `invalid franchise rejected: ${(res.message || "").slice(0, 80)}`);
  }

  console.log("── 6. help surface ──");
  {
    const sock = makeMockSock();
    const res = await quiz.startQuiz(sock, "chat-4@g.us", "u@s.w", MARK, { key: { id: "M4" } }, "", "T", null, null);
    ok(res.handled && (res.message || "").includes("Lore Quiz"), "help updated");
    ok((res.message || "").includes("-s cosmology"), "help documents -s override");
  }

  console.log(`\nQUIZ LORE LIVE QA: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
