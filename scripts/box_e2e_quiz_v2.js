// LIVE E2E v2 (runs ON Box 1) - 2026-09-28 owner spec battery:
//   §1 direct answers  §2/§7 hidden options  §3 audio throughput+cache
//   §4 bot-wide queue  §5/§6 entity-anchored image sources
// Fixture sock; real Go audio service + real Wikipedia/AniList/Jikan.
process.chdir("/home/ubuntu/whatsapp-bot");
const quiz = require("/home/ubuntu/whatsapp-bot/core/games/quiz");
const quizMedia = require("/home/ubuntu/whatsapp-bot/core/games/quizMedia");
const quizAudioCache = require("/home/ubuntu/whatsapp-bot/core/utils/quizAudioCache");
const goService = require("/home/ubuntu/whatsapp-bot/core/utils/goImageService").getShared();

quiz.setDeps({ goService, ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg" });

const MARK = "\u200B";
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`  ok - ${n}`); } else { fail++; console.log(`  FAIL - ${n}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSock() {
  const sends = [];
  const reacts = [];
  return {
    sends, reacts,
    sendMessage: async (jid, content) => {
      if (content && content.react) reacts.push(content.react);
      sends.push({ jid, content });
      return { key: { id: `s${sends.length}` } };
    },
  };
}

const GC = "120999999999999998@g.us";
const P1 = "233201487480@s.whatsapp.net"; // owner phone -> also a player
const P2 = "259999999999999@g.us".replace("@g.us", "@s.whatsapp.net");

function mountSession(q, { hide = false, secs = 30 } = {}) {
  const session = {
    cfg: { timePerQuestion: secs, difficulty: "medium", sectionBreakDuration: 0, streamingGeneration: false, imageQuestionCount: 0, audioQuestionCount: 0, themeSongQuestionCount: 0, voiceActorQuestionLimit: 2 },
    title: "TestAnime", wiki: null, anime: null, franchise: null, mediaType: "anime",
    mode: "franchise", sections: [{ name: "Test", domain: "mixed", perSection: 1, state: "active", questions: [q], canCarryAudio: false }],
    sectionJobs: {}, activeSection: 0, idx: 0, questionNo: 1,
    scores: new Map(), revealed: [], answeredBy: new Map(), usedKeys: new Set(),
    askedBy: P1, askedByName: "Tester", startedAt: Date.now(), token: 0,
    cancelled: false, timerId: null, nextTimerId: null, reassureTimerId: null, hardCapTimerId: null,
    qStartedAt: Date.now(), qOpenUntil: 0, qEpoch: 0, revealLock: false,
    callLLM: null, animeCharacters: [], charIndex: null, otherTitles: [],
  };
  quiz._internal.activeQuizzes.set(GC, session);
  return session;
}

async function main() {
  console.log("=== QUIZ SPEC E2E v2 (Box 1) ===");

  // ── §1/§2/§7: direct answers + hidden options ──
  console.log("\n[-- direct answers + options visibility --]");
  {
    const sock = makeSock();
    const q = {
      q: "Who wields the data knife?", topic: "Characters", difficulty: "easy", type: "text",
      options: ["Alice Cursor", "Bob Byte", "Cypher Loop", "Delta Null"], correct: 2,
    };
    const s = mountSession(q);
    s.qOpenUntil = Date.now() + 30000;

    // bare correct text
    let r = await quiz.handleAnswer(sock, GC, P1, "Cypher Loop", MARK, { key: { id: "m1" } }, "P1", { bareText: true });
    ok(r.handled === true && r.silent === true, "bare correct answer consumed");
    ok(sock.reacts.some((x) => x.text === "✅" && x.key.id === "m1"), "✅ react on correct");
    // one attempt lock: second player later, same player now ignored
    r = await quiz.handleAnswer(sock, GC, P1, "Bob Byte", MARK, { key: { id: "m2" } }, "P1", { bareText: true });
    ok(r.handled === true, "second attempt from same player still handled (locked, silent)");
    ok(!sock.reacts.some((x) => x.key.id === "m2"), "locked attempt gets NO react");

    // kill the detached reveal chain from m1 (production is token-guarded;
    // the harness swaps sessions manually so cancel s1 BEFORE mounting s2)
    s.cancelled = true;
    s.revealLock = true;
    s.token += 1;
    await sleep(1500);

    // wrong-answer + chatter pass-through on a FRESH session (the first
    // correct answer reveals + finishes a 1-question session)
    const s2 = mountSession({ ...q, options: [...q.options] });
    s2.qOpenUntil = Date.now() + 30000;
    r = await quiz.handleAnswer(sock, GC, P2, "i have no idea lol", MARK, { key: { id: "m3" } }, "P2", { bareText: true });
    ok(r.handled === false, "non-matching chatter passes through (handled:false, no lock)");
    r = await quiz.handleAnswer(sock, GC, P2, "cypher loop", MARK, { key: { id: "m4" } }, "P2", { bareText: true });
    ok(r.handled === true && sock.reacts.some((x) => x.key.id === "m4" && x.text === "✅"), "case/format-insensitive bare correct");
    quiz._internal.activeQuizzes.delete(GC);

    // closed question = ignored (fresh session, qOpenUntil in the past)
    const s3 = mountSession({ ...q, options: [...q.options] });
    s3.qOpenUntil = 1;
    r = await quiz.handleAnswer(sock, GC, P2, "Cypher Loop", MARK, { key: { id: "m5" } }, "P2", { bareText: true });
    ok(r.handled === true && r.silent === true && !sock.reacts.some((x) => x.key.id === "m5"), "closed question: no react, no register");

    quiz._internal.activeQuizzes.delete(GC);
  }

  {
    // hidden options: letters NEVER match, text matches, card omits options
    const sock = makeSock();
    const q = {
      q: "Which brand is this?", topic: "Logo", difficulty: "easy", type: "image",
      options: ["Nike", "Adidas", "Puma", "Reebok"], correct: 0, hideOptions: true,
    };
    const s = mountSession(q);
    s.qOpenUntil = Date.now() + 30000;
    let r = await quiz.handleAnswer(sock, GC, P2, "b", MARK, { key: { id: "h1" } }, "P2", {});
    ok(r.handled === true && sock.reacts.some((x) => x.key.id === "h1" && x.text === "🤔"), "hidden: prefixed single letter -> 🤔 react, no registration");
    r = await quiz.handleAnswer(sock, GC, P2, "a", MARK, { key: { id: "h2" } }, "P2", { bareText: true });
    ok(r.handled === false, "hidden: bare letter passes through (no match)");
    r = await quiz.handleAnswer(sock, GC, P2, "nike", MARK, { key: { id: "h3" } }, "P2", { bareText: true });
    ok(r.handled === true && sock.reacts.some((x) => x.key.id === "h3" && x.text === "✅"), "hidden: bare text answer matches");

    const card = quiz._internal && null; // card formatting via formatQuestionCard is module-private; assert via postQuestion path below instead
    quiz._internal.activeQuizzes.delete(GC);
  }

  // card formatting through the real postQuestion path (text question)
  {
    const sock = makeSock();
    const qOpt = { q: "Capital of Testlandia?", topic: "Mixed", difficulty: "easy", type: "text", options: ["Alpha", "Beta", "Gamma", "Delta"], correct: 1 };
    const s1 = mountSession(qOpt);
    s1.qOpenUntil = 0;
    // silence timers by cancelling right after post
    const p1 = quiz._internal.postQuestion(sock, GC, s1);
    await p1;
    const card1 = (sock.sends.map((x) => x.content.text || x.content.caption || "").join("\n"));
    ok(card1.includes("A. Alpha") && card1.includes("D. Delta"), "options quiz card shows A-D options");
    ok(card1.includes("just type the answer in chat"), "options quiz card advertises direct answers");
    quiz._internal.activeQuizzes.delete(GC);

    const qHid = { q: "Which brand is this?", topic: "Logo", difficulty: "easy", type: "text", options: ["Nike", "Adidas", "Puma", "Reebok"], correct: 0, hideOptions: true };
    const sock2 = makeSock();
    const s2 = mountSession(qHid);
    s2.qOpenUntil = 0;
    await quiz._internal.postQuestion(sock2, GC, s2);
    const card2 = (sock2.sends.map((x) => x.content.text || x.content.caption || "").join("\n"));
    ok(!card2.includes("A. Nike"), "hidden-option card shows NO options");
    ok(card2.includes("No options - just type the answer in chat!"), "hidden-option card shows direct-answer hint");
    // reveal text: plain answer (no letter prefix) - drive revealAndAdvance with a winner
    s2.qOpenUntil = Date.now() + 30000;
    await quiz.handleAnswer(sock2, GC, P2, "Nike", MARK, { key: { id: "h4" } }, "P2", { bareText: true });
    await sleep(1200); // reveal chain is detached
    const reveal = sock2.sends.map((x) => x.content.text || "").find((t) => t.includes("Correct!"));
    ok(!!reveal && reveal.includes("The answer was: *Nike*") && !reveal.includes("A. Nike"), "hidden-option reveal shows plain answer");
    quiz._internal.activeQuizzes.delete(GC);
  }

  // ── §4: bot-wide queue ──
  console.log("\n[-- global quiz queue --]");
  {
    const g = quiz._internal.genGate;
    // drain any state
    ok(g.slots() === 1, "GEN_SLOTS defaults to 1 (one quiz bot-wide)");
    g.state().active = 0; g.state().waiters.length = 0;

    const prepA = { chatId: "111@g.us", cancelled: false };
    const prepB = { chatId: "222@g.us", cancelled: false };
    let queuedAt = 0;
    const a = quiz._internal.genGate.acquireGenSlot(prepA, null);
    ok((await a) === true, "first quiz acquires the single slot");
    let onQueuedPos = null;
    const b = quiz._internal.genGate.acquireGenSlot(prepB, (pos) => { onQueuedPos = pos; queuedAt = 1; });
    await sleep(50);
    ok(onQueuedPos === 1 && g.state().waiters.length === 1, "second chat queues FIFO with position message");
    const prepC = { chatId: "222@g.us", cancelled: false };
    const c = quiz._internal.genGate.acquireGenSlot(prepC, null);
    ok((await c) === false, "duplicate queue entry for same chat REJECTED");
    quiz._internal.genGate.releaseGenSlot();
    ok((await b) === true, "slot handoff: queued quiz starts when the running one releases");
    quiz._internal.genGate.releaseGenSlot();
    ok(g.state().active === 0 && g.state().waiters.length === 0, "gate drains to zero");

    // session slot riding + idempotent release
    g.state().active = 0; g.state().waiters.length = 0;
    const held = await quiz._internal.genGate.acquireGenSlot({ chatId: "333@g.us", cancelled: false }, null);
    ok(held === true && g.state().active === 1, "slot held (simulating a live quiz)");
    const sess = { holdsGenSlot: true };
    quiz._internal.releaseSessionSlot(sess);
    ok(g.state().active === 0, "releaseSessionSlot released the riding slot");
    quiz._internal.releaseSessionSlot(sess);
    ok(g.state().active === 0, "second release is a no-op (flag cleared)");
    g.state().active = 0;
  }

  // ── §3: audio pipeline (LIVE Go service) ──
  console.log("\n[-- audio: live build + cache --]");
  {
    const usedKeys = new Set();
    const deadline = Date.now() + 7 * 60 * 1000;
    const t0 = Date.now();
    const qs = await quizMedia.buildThemeSongQuestions({ count: 2, usedKeys, difficulty: "easy", goService, trimFn: null, deadlineMs: deadline });
    const dt1 = Date.now() - t0;
    ok(qs.length >= 1, `live theme-song build produced ${qs.length} question(s) in ${(dt1 / 1000).toFixed(1)}s`);
    if (qs.length) {
      ok(qs.every((q) => q.hideOptions === true), "theme-song questions carry hideOptions");
      ok(qs.every((q) => q.asset && q.asset.buf && q.asset.buf.length > 20 * 1024), "clips pass the >20KB byte gate");
      const key = qs[0].assetKey;
      const cached = quizAudioCache.get(key);
      ok(!!cached, "successful clip persisted to disk cache");
      // cached rebuild: same show entry must be served from disk (no Go call)
      const poolEntry = (quizMedia.THEMES_POOL || []).find((t) => `theme:${t.show.toLowerCase().replace(/\s+/g, " ").trim()}` === key) || null;
      if (poolEntry) {
        const t1 = Date.now();
        const one = await quizMedia.buildThemeSongQuestionEntry(poolEntry, [{ show: "Decoy A" }, { show: "Decoy B" }, { show: "Decoy C" }], "easy", goService, null);
        const dt2 = Date.now() - t1;
        ok(!!one && dt2 < 5000, `cached entry rebuild served in ${(dt2 / 1000).toFixed(2)}s (no external calls)`);
      } else {
        console.log("  (info) built themes not located in pool constant - skipping targeted cache-timing assertion");
      }
      ok(quizAudioCache.stats().files >= 1, `audio cache now holds ${quizAudioCache.stats().files} clip(s)`);
    } else {
      console.log("  (warn) Go service returned 0 clips - check service health; assertions skipped");
    }
  }

  // ── §2: logos live (hideOptions + verified bytes) ──
  console.log("\n[-- logos: live build --]");
  {
    const qs = await quizMedia.buildLogosQuestions({ count: 2, usedKeys: new Set(), difficulty: "easy" });
    ok(qs.length >= 1, `live logo build produced ${qs.length} question(s)`);
    ok(qs.every((q) => q.hideOptions === true), "logo questions carry hideOptions");
    ok(qs.every((q) => q.asset && q.asset.buf && q.asset.buf.length > 1500 || (q._cachedAsset && q._cachedAsset.buf && q._cachedAsset.buf.length > 1500)), "logo bytes pass the size gate");
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(2); });
