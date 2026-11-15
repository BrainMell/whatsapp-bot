// Offline end-to-end test for `.j quiz -gn` / `-gn2` and `.j quiz continue`.
// Network-only pieces (logo downloads, theme-song clips) are stubbed; everything else
// (emoji cards, trivia, scoring, sections, checkpoints, resume) runs for real.
//   run:  node scripts/test_gn_quiz.js
const assert = require("assert");
const path = require("path");
const root = path.join(__dirname, "..");
process.env.NODE_ENV = "test";

// ---- in-memory system KV (no MongoDB) ----
const system = require(path.join(root, "core/utils/system"));
const kv = new Map();
system.get = (k, d = null) => (kv.has(k) ? kv.get(k) : d);
system.set = async (k, v) => { kv.set(k, JSON.parse(JSON.stringify(v))); };

const quizMedia = require(path.join(root, "core/games/quizMedia"));
const sharp = require("sharp");
let PNG = null;
quizMedia.buildLogosQuestion = async (brand, others, difficulty) => {
  PNG = PNG || (await sharp({ create: { width: 120, height: 120, channels: 3, background: "#336699" } }).png().toBuffer());
  const options = [brand.name, ...others.map((o) => o.name)];
  return { q: "Which brand or company does this logo belong to?", options, correct: 0, hideOptions: true, difficulty, topic: "Logo", domain: "logos", type: "image", assetKey: `logo:${brand.name}`, asset: { kind: "image", buf: PNG, mime: "image/png", subject: brand.name } };
};
quizMedia.buildThemeSongQuestionEntry = async (entry, others, difficulty) => ({
  q: `Which ${entry.type === "game" ? "video game" : "anime or show"} is this theme from?`, options: [entry.show, ...others.map((o) => o.show)], correct: 0,
  alts: (entry.alts || []).slice(0, 6), typed: true, hideOptions: true, difficulty, topic: "Theme Song", domain: "audio", type: "theme",
  assetKey: `theme:${entry.show}`, asset: { kind: "audio", buf: Buffer.alloc(60000, 1), mime: "audio/mpeg", subject: entry.show },
});

const quiz = require(path.join(root, "core/games/quiz"));
const packs = require(path.join(root, "core/games/quizEventPacks"));
const I = quiz._internal;

const CHAT = "1203630000000000@g.us", HOST = "111@s.whatsapp.net", P2 = "222@s.whatsapp.net";
const log = [];
const sock = { sendMessage: async (jid, content) => { log.push({ jid, content }); return { key: { id: String(log.length) } }; }, user: { id: "999:1@s.whatsapp.net" } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const texts = () => log.map((l) => l.content.text || l.content.caption || "").filter(Boolean);

async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(50); }
  throw new Error("timeout waiting for " + what);
}
// answer the currently open question correctly; returns its answer text
async function answerOpen(who, name) {
  const s = quiz.getSession(CHAT);
  await waitFor(() => s.qOpenUntil && Date.now() < s.qOpenUntil && !s.revealLock, 5000, "question to open");
  const q = s.sections[s.activeSection].questions[s.idx];
  const ans = String(q.options[q.correct]);
  const r = await quiz.handleAnswer(sock, CHAT, who, ans, "", { key: {} }, name, { bareText: true });
  assert(r && r.handled, "answer not handled for " + ans);
  return { ans, q };
}

(async () => {
  // ---------- pack sanity ----------
  const p1 = packs.get("gn"), p2 = packs.get("gn2");
  assert(p1 && p2 && !packs.get("nope"));
  const plan1 = p1.plan();
  const total1 = plan1.reduce((a, s) => a + s.perSection, 0);
  assert.strictEqual(total1, 80, "gn pack should be 80 rounds, got " + total1);
  assert.strictEqual(p2.plan().reduce((a, s) => a + s.perSection, 0), 37);
  const parsed = quiz.parseQuizArgs("-gn");
  assert.strictEqual(parsed.mode, "preplanned"); assert.strictEqual(parsed.pack, "gn");
  assert.strictEqual(quiz.parseQuizArgs("-gn2").pack, "gn2");
  assert.strictEqual(quiz.parseQuizArgs("-preplanned").pack, undefined);
  console.log("✓ pack plans + arg parsing");

  // ---------- no checkpoint yet ----------
  let r = await quiz.startQuiz(sock, CHAT, HOST, "", { key: {} }, "continue", "Host", null, {});
  assert(r && /no saved quiz/i.test(r.message), "continue with nothing saved should explain");
  console.log("✓ continue with no save");

  // ---------- fresh -gn2 (smaller) to exercise start -> ready -> go ----------
  await quiz.startQuiz(sock, CHAT, HOST, "", { key: {} }, "-gn2", "Host", null, {});
  await waitFor(() => quiz.getSession(CHAT) && quiz.getSession(CHAT).awaitingGo, 20000, "ready card");
  let s = quiz.getSession(CHAT);
  assert.strictEqual(s.gnPack, "gn2"); assert.strictEqual(s.sections.length, 3);
  assert.strictEqual(s.sections.reduce((a, x) => a + x.questions.length, 0), 37);
  s.cfg.questionGapMin = 1; s.cfg.questionGapMax = 1; s.cfg.sectionBreakDuration = 0;
  await quiz.confirmStart(sock, CHAT, HOST, "", false);
  const seen = [];
  for (let i = 0; i < 6; i++) { const a = await answerOpen(i % 2 ? P2 : HOST, i % 2 ? "Two" : "Host"); seen.push(a.ans); }
  await waitFor(() => (kv.get(`quiz_gn_resume:${CHAT}`) || {}).asked && kv.get(`quiz_gn_resume:${CHAT}`).asked.length >= 6, 8000, "checkpoint with 6 asked");
  let cp = kv.get(`quiz_gn_resume:${CHAT}`);
  assert.strictEqual(cp.pack, "gn2"); assert.strictEqual(cp.asked.length, 6); assert(cp.scores.length === 2);
  const pointsBefore = Object.fromEntries(cp.scores.map(([j, v]) => [j, v.points]));
  console.log("✓ fresh run + checkpoint after 6 questions:", seen.join(", "));

  // ---------- simulate a bot restart ----------
  s.cancelled = true; clearTimeout(s.timerId); clearTimeout(s.nextTimerId); clearTimeout(s.hardCapTimerId);
  I.activeQuizzes.delete(CHAT); I.releaseSessionSlot(s); quiz.releaseLifecycle(CHAT);
  log.length = 0;

  // ---------- continue ----------
  await quiz.startQuiz(sock, CHAT, HOST, "", { key: {} }, "continue", "Host", null, {});
  await waitFor(() => quiz.getSession(CHAT) && quiz.getSession(CHAT).awaitingGo, 20000, "resume ready card");
  s = quiz.getSession(CHAT);
  assert.strictEqual(s.questionNo, 6, "numbering continues from 6");
  assert.strictEqual(s.sections.reduce((a, x) => a + x.questions.length, 0), 31, "only the 31 unasked questions remain");
  const remainingAnswers = s.sections.flatMap((x) => x.questions.map((q) => String(q.options[q.correct])));
  for (const a of seen) assert(!remainingAnswers.includes(a), "already-asked question came back: " + a);
  assert.strictEqual(s.scores.get(HOST).points, pointsBefore[HOST], "host score restored");
  s.cfg.questionGapMin = 1; s.cfg.questionGapMax = 1; s.cfg.sectionBreakDuration = 0;
  await quiz.confirmStart(sock, CHAT, HOST, "", false);
  assert(texts().some((t) => /RESUMED/.test(t)), "resumed banner missing");
  for (let i = 0; i < 31; i++) await answerOpen(HOST, "Host");
  await waitFor(() => !quiz.hasActive(CHAT), 8000, "quiz to finish");
  const final = texts().find((t) => /QUIZ FINISHED/.test(t));
  assert(final, "no final scoreboard");
  assert(/QUESTION 7\/37/.test(texts().join("\n")), "first resumed card should read QUESTION 7/37");
  assert(/QUESTION 37\/37/.test(texts().join("\n")), "last card should read 37/37");
  assert(!/Zeni/.test(final.replace(/Zeni\)/g, "")) || !/paid out in Zeni/.test(final), "gn quiz must not pay Zeni");
  assert((kv.get(`quiz_gn_resume:${CHAT}`) || {}).cleared, "checkpoint should be cleared after finish");
  console.log("✓ restart + continue: resumed at Q7/37, finished, checkpoint cleared");

  // ---------- full -gn pack builds all 80 (emoji cards are real renders) ----------
  log.length = 0;
  await quiz.startQuiz(sock, CHAT, HOST, "", { key: {} }, "-gn", "Host", null, {});
  await waitFor(() => quiz.getSession(CHAT) && quiz.getSession(CHAT).awaitingGo, 60000, "gn ready card");
  s = quiz.getSession(CHAT);
  const secs = s.sections.map((x) => `${x.name}:${x.questions.length}`);
  assert.strictEqual(s.sections.reduce((a, x) => a + x.questions.length, 0), 80, "gn should build 80: " + secs.join(", "));
  const em = s.sections.filter((x) => x.domain === "emoji").flatMap((x) => x.questions);
  assert.strictEqual(em.length, 20); assert(em.every((q) => q.asset.buf.length > 5000 && q.type === "image" && q.typed));
  console.log("✓ gn builds 80 rounds:", secs.join(" | "));
  s.cancelled = true; I.activeQuizzes.delete(CHAT); I.releaseSessionSlot(s); quiz.releaseLifecycle(CHAT);

  console.log("\nALL GOOD");
  process.exit(0);
})().catch((e) => { console.error("\nTEST FAILED:", e.stack || e); process.exit(1); });
