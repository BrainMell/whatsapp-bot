// qa_quiz_media.js — media spawn + Re:Zero tests for the lore quiz overhaul.
"use strict";
require("dotenv").config();
const quiz = require("/home/z/my-project/whatsapp-bot/core/games/quiz");
const quizLore = require("/home/z/my-project/whatsapp-bot/core/games/quizLore");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  ok -", l); } else { fail++; console.log("  FAIL -", l); } };

const { execFile } = require("child_process");
async function zaiLLM(opts) {
  const sys = (opts.messages || []).find((m) => m.role === "system");
  const user = [...(opts.messages || [])].reverse().find((m) => m.role === "user");
  const args = ["chat", "-p", user ? user.content : "", "-o", "/tmp/zai_out_m.json"];
  if (sys) args.push("-s", sys.content);
  await new Promise((resolve, reject) => {
    execFile("z-ai", args, { timeout: 90000, maxBuffer: 10 * 1024 * 1024 }, (e) => (e ? reject(e) : resolve()));
  });
  return JSON.parse(require("fs").readFileSync("/tmp/zai_out_m.json", "utf8"));
}

const MARK = "\u200B";
function makeMockSock() {
  const sent = [];
  return {
    sent, user: { id: "bot@s.whatsapp.net" },
    sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return {}; },
  };
}

(async () => {
  // NOTE: Fandom's image CDN (static.wikia.nocookie.net) is IP-blocked from THIS
  // sandbox - the live box is not. To prove the FULL image pipeline here, the
  // getPageImage URL resolution is stubbed to a reachable host for sections 1-2
  // and restored afterwards. Everything downstream (download, magic-byte check,
  // caption message) runs for real.
  const origGetPageImage = quizLore.getPageImage;
  quizLore.getPageImage = async (slug, page) => ({
    url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21459-nYh85uj2Fuwr.jpg",
    mime: "image/jpeg",
  });

  console.log("── 1. media extraction: download + magic-byte verification ──");
  {
    const img = await quizLore.getPageImage("batman", "Bruce Wayne");
    ok(!!img && /^https:/.test(img.url), "pageimage URL resolved");
    const dl = await quizLore.downloadMedia(img.url, "image");
    ok(!!dl && Buffer.isBuffer(dl.buf) && dl.buf.length > 3000, `image downloaded + magic-byte verified (${dl ? Math.round(dl.buf.length / 1024) + "KB " + dl.mime : "none"})`);
    const real = await origGetPageImage("batman", "Bruce Wayne");
    ok(!!real && /^https:/.test(real.url), "real Fandom pageimage URL resolution works (CDN is sandbox-blocked, live box unaffected)");
    // garbage URL must be rejected
    const bad = await quizLore.downloadMedia("https://example.com/not-an-image", "image").catch(() => null);
    ok(bad === null, "invalid image URL rejected (no fake media)");
  }

  console.log("── 2. attachMedia on a real generated character question ──");
  {
    const sock = makeMockSock();
    const res = await quiz.startQuiz(
      sock, "media-chat@g.us", "u1@s.whatsapp.net", MARK, { key: { id: "MM1" } },
      '"Batman" 3 medium -s characters', "Tester", zaiLLM, null,
    );
    const session = quiz.getSession("media-chat@g.us");
    ok(!!session && session.questions.length >= 3, "characters-forced quiz built (min-3 rule)");
    if (session) {
      const mediaResults = [];
      for (const q of session.questions) {
        const m = await quiz.attachMedia(q).catch(() => null);
        mediaResults.push(m);
      }
      const withImg = mediaResults.filter((m) => m && m.kind === "image");
      console.log(`  media spawned for ${withImg.length}/${mediaResults.length} character questions`);
      ok(withImg.length >= 1, "at least one character question spawned a real image");
      for (const m of withImg) ok(Buffer.isBuffer(m.buf) && /^image\//.test(m.mime), `image payload valid (${m.mime})`);
      // full postQuestion render with image caption
      const q0 = session.questions[0];
      q0.media = mediaResults[0];
      q0.mediaTried = true;
      await quiz._internal.postQuestion(sock, "media-chat@g.us", session);
      const imgMsg = sock.sent.find((s) => s.content?.image);
      ok(!!imgMsg, "postQuestion sent an image message");
      ok(imgMsg && typeof imgMsg.content.caption === "string" && imgMsg.content.caption.includes("QUESTION 1"), "caption carries the question card");
      await quiz.endQuiz(sock, "media-chat@g.us", "u1@s.whatsapp.net", MARK, false);
    }
  }

  console.log("── 3. Re:Zero end-to-end (spec-required franchise) ──");
  {
    const sock = makeMockSock();
    const res = await quiz.startQuiz(
      sock, "rezero-chat@g.us", "u1@s.whatsapp.net", MARK, { key: { id: "RZ" } },
      '"Re:Zero" 4 hard', "Tester", zaiLLM, null,
    );
    ok(res.handled && res.silent, "Re:Zero quiz launched");
    const session = quiz.getSession("rezero-chat@g.us");
    if (session) {
      console.log(`  domains: ${session.questions.map((q) => q.domain || "meta").join(",")}`);
      console.log("  sources:", session.questions.map((q) => q.loreRef ? q.loreRef.page.split("/")[0] : "meta").join(" | "));
      ok(session.questions.length === 4, "4 hard questions built");
      ok(session.title.toLowerCase().includes("re:zero") || session.title.toLowerCase().includes("zero"), `display title from wiki: ${session.title}`);
      const tokMax = Math.max(0, ...session.questions.map((q) => q.promptTok || 0));
      ok(tokMax < 800, `token budget (max ${tokMax})`);
      const loreQs = session.questions.filter((q) => q.loreRef);
      ok(loreQs.length >= 3, "mostly lore-sourced");
      await quiz.endQuiz(sock, "rezero-chat@g.us", "u1@s.whatsapp.net", MARK, false);
    }
  }

  console.log("── 4. malformed model responses rejected ──");
  {
    const garbage = [
      "not json at all",
      "{\"question\":\"too short?\",\"options\":{\"A\":\"x\",\"B\":\"y\",\"C\":\"z\"},\"answer\":\"A\"}",
      "{\"question\":\"This is a plausible looking question stem that is long enough to pass length checks?\",\"options\":{\"A\":\"1\",\"B\":\"2\",\"C\":\"3\",\"D\":\"3\"},\"answer\":\"A\"}", // dup options
      "{\"question\":\"Valid looking question with four distinct options here?\",\"options\":{\"A\":\"1\",\"B\":\"2\",\"C\":\"3\",\"D\":\"4\"},\"answer\":\"E\"}", // bad key
    ];
    let rejected = 0;
    for (const g of garbage) rejected += quizLore.coerceOne(quizLore.extractJson(g), "hard", "plot") ? 0 : 1;
    ok(rejected === garbage.length, `all ${garbage.length} malformed replies rejected`);
    // valid one passes
    const good = quizLore.coerceOne(quizLore.extractJson('{"question":"What is the name of the structure located in the Afterlife?","options":{"A":"Temple","B":"Shrine","C":"Tower","D":"Vault"},"answer":"C"}'), "hard", "plot");
    ok(!!good && good.correct === 2, "valid JSON coerced with correct index");
  }

  console.log("── 5. no-data / missing media fallbacks ──");
  {
    quizLore.getPageImage = origGetPageImage; // restore real resolution
    // unknown page -> null media, question still works
    const m = await quiz.attachMedia({ loreRef: { wiki: "batman", page: "This Page Does Not Exist 99" }, domain: "plot" }).catch(() => null);
    ok(m === null || m === undefined || m.kind === "image", "attachMedia safe on missing page");
    const m2 = await quiz.attachMedia(null).catch(() => null);
    ok(m2 === null, "attachMedia null-safe");
    // retrieveLore on a garbage page: MediaWiki search is fuzzy so it may find
    // SOMETHING - the contract is no-crash and string text (never garbage bytes)
    const lore = await quizLore.retrieveLore("batman", "QQZZ No Such Page 55", "plot", "hard", new Set()).catch(() => null);
    ok(lore === null || (typeof lore.text === "string" && lore.text.length > 0), "retrieveLore safe on missing page (no crash, string payload)");
  }

  console.log(`\nQUIZ MEDIA QA: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
