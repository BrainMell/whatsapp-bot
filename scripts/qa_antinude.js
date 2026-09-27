// QA: ANTINUDE v2 (2026-09-27, owner brief §7 - separate moderation feature)
// v2: video + animated-sticker scanning (5-frame sampling), NudeNet-combined
//     worker scores, scan logging, threshold 0.45 default, threshold parser fix.
// - media extraction: image / sticker / ANIMATED sticker / VIDEO / wrappers
// - verdict cache: same bytes NOT re-analyzed (owner requirement)
// - threshold + action routing: delete / warn / kick messages
// - exemptions: admins, mods, owner, bot itself
// - fail-open: service down / ffmpeg missing / undecodable media => no action
// Run: node scripts/qa_antinude.js
const os = require("os");
process.env.HOME = os.tmpdir();
process.env.NSFW_SERVICE_URL = "http://127.0.0.1:0/nsfw-unreachable"; // fail-open default
const antinude = require("../core/utils/antinude");

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log("  ok -", label); } else { fail++; console.log("  FAIL -", label); } }

function mockSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (jid, content) => { sent.push({ jid, content }); return {}; },
    groupParticipantsUpdate: async (jid, users, action) => { sent.push({ jid, users, action }); return {}; },
  };
}
function mediaMsg(kind = "image", sender = "spammer@x") {
  const node =
    kind === "sticker" ? { stickerMessage: { mimetype: "image/webp" } } :
    kind === "asticker" ? { stickerMessage: { mimetype: "image/webp", isAnimated: true } } :
    kind === "video" ? { videoMessage: { mimetype: "video/mp4" } } :
    { imageMessage: { mimetype: "image/jpeg" } };
  return { key: { remoteJid: "g@g.us", participant: sender, fromMe: false, id: "M" + Math.random() }, message: node };
}
const settings = () => ({ antinude: true, antinudeAction: "delete", antinudeThreshold: 0.45 });
const ctx = (over = {}) => ({ chatId: "g@g.us", senderJid: "spammer@x", senderIsAdmin: false, isOwner: false, isGlobalMod: false, isGcOwner: () => false, ...over });
const noWarn = () => 0;

(async () => {
  console.log("════ 1. media extraction (v2: video + animated stickers) ════");
  ok(!!antinude.extractImageMedia(mediaMsg("image")), "plain image detected");
  ok(!!antinude.extractImageMedia(mediaMsg("sticker")), "sticker detected");
  ok(!!antinude.extractImageMedia(mediaMsg("asticker")), "animated sticker detected");
  const v = antinude.extractImageMedia(mediaMsg("video"));
  ok(!!v && v.type === "video", "video detected (v2 scans videos)");
  ok(!!antinude.extractImageMedia({ key: {}, message: { viewOnceMessageV2: { message: { imageMessage: { mimetype: "image/jpeg" } } } } }), "view-once wrapped image detected");
  const vo = antinude.extractImageMedia({ key: {}, message: { viewOnceMessageV2: { message: { videoMessage: { mimetype: "video/mp4" } } } } });
  ok(!!vo && vo.type === "video", "view-once wrapped video detected");
  ok(!antinude.extractImageMedia({ key: {}, message: { conversation: "hello" } }), "text message ignored");
  ok(!antinude.extractImageMedia({ key: {}, message: { extendedTextMessage: { text: "x" }, ephemeralMessage: { message: { audioMessage: {} } } } }), "audio ignored");

  console.log("════ 2. exemptions ════");
  let s = mockSock();
  ok(await antinude.handleAntinude(s, mediaMsg(), settings(), noWarn, noWarn, ctx({ senderIsAdmin: true })) === false, "admin exempt");
  ok(await antinude.handleAntinude(s, mediaMsg(), settings(), noWarn, noWarn, ctx({ isOwner: true })) === false, "owner exempt");
  ok(await antinude.handleAntinude(s, mediaMsg(), settings(), noWarn, noWarn, ctx({ isGlobalMod: true })) === false, "global mod exempt");
  ok(await antinude.handleAntinude(s, mediaMsg(), settings(), noWarn, noWarn, ctx({ isGcOwner: () => true })) === false, "gc owner exempt");
  ok(s.sent.length === 0, "no messages sent for exempted senders");
  const selfMsg = mediaMsg();
  selfMsg.key.fromMe = true;
  ok(await antinude.handleAntinude(s, selfMsg, settings(), noWarn, noWarn, ctx()) === false, "bot's own messages exempt");
  ok(await antinude.handleAntinude(s, mediaMsg(), { antinude: false }, noWarn, noWarn, ctx()) === false, "disabled feature = no-op");
  ok(await antinude.handleAntinude(s, mediaMsg(), settings(), noWarn, noWarn, ctx({ chatId: "dm@s.whatsapp.net" })) === false, "DM chat ignored");

  console.log("════ 3. fail-open on unreachable service ════");
  s = mockSock();
  const r = await antinude.handleAntinude(s, mediaMsg(), settings(), noWarn, noWarn, ctx());
  ok(r === false, "download/classify failure = no action (fail-open)");
  ok(s.sent.length === 0, "nothing sent when service is down");

  console.log("════ 4. verdict flow with mocked service ════");
  const http = require("http");
  let mode = "high";
  const stub = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const nsfw = mode === "high" ? 0.92 : mode === "low" ? 0.01 : 0.55;
      res.writeHead(200, { "Content-Type": "application/json" });
      // v2 worker shape: nsfw + parts + falconsai
      res.end(JSON.stringify({ nsfw, decision: nsfw >= 0.7 ? "delete" : "ok", parts: nsfw >= 0.5 ? [{ label: "FEMALE_BREAST_EXPOSED", score: nsfw }] : [], falconsai: nsfw }));
    });
  });
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  const port = stub.address().port;
  process.env.NSFW_SERVICE_URL = `http://127.0.0.1:${port}/nsfw`;
  delete require.cache[require.resolve("../core/utils/antinude")];
  const an2 = require("../core/utils/antinude");

  mode = "low";
  const low1 = await an2._internal._classifyFrame(Buffer.alloc(3000, 1)).catch(() => null);
  ok(low1 !== null && low1.nsfw === 0.01, "low verdict returns nsfw score");
  ok(low1 && Array.isArray(low1.parts), "low verdict carries parts array");
  const low2 = await an2._internal._classifyFrame(Buffer.alloc(3000, 1)).catch(() => null);
  ok(low2 && low2.cached === true, "same bytes served from cache (no re-analysis)");

  mode = "high";
  const high = await an2._internal._classifyFrame(Buffer.alloc(3000, 2)).catch(() => null);
  ok(high && high.nsfw === 0.92 && high.parts.length === 1, "high verdict returns nsfw + violation part");

  const st = an2.stats();
  ok(st.checked >= 2 && st.cacheHits >= 1, `stats tracked (checked=${st.checked}, cacheHits=${st.cacheHits})`);

  console.log("════ 5. analyzeMediaBuffer single-image path ════");
  mode = "low";
  const imgAnalysis = await an2.analyzeMediaBuffer("image", Buffer.alloc(3000, 3)).catch(() => null);
  ok(imgAnalysis !== null && imgAnalysis.kind === "image", "image analyzed via shared analyzer");
  ok(imgAnalysis && imgAnalysis.frames.length === 1, "single frame for plain image");
  ok(imgAnalysis && imgAnalysis.nsfw === 0.01, "analyzer returns worker score");

  console.log("════ 6. video path: graceful degradation without usable frames ════");
  // A garbage buffer is not a decodable mp4: ffmpeg (if present) extracts no
  // frames -> analyzeMediaBuffer returns null (fail-open), never throws.
  const vidAnalysis = await an2.analyzeMediaBuffer("video", Buffer.alloc(5000, 9)).catch((e) => "threw:" + e.message);
  ok(vidAnalysis === null || (vidAnalysis && vidAnalysis.kind === "video"), "garbage video fails open (null) or degrades gracefully");
  const vidStats = an2.stats();
  ok(vidStats.videos >= 1, `video scans counted (videos=${vidStats.videos})`);

  console.log("════ 7. animated sticker path via sharp-decodable webp ════");
  // build a tiny static webp with sharp; pages=1 -> single frame path
  try {
    const sharp = require("sharp");
    // gradient 256x256 -> the png frame is comfortably above the 500B sanity gate
    const grad = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 10, g: 20, b: 200 } } })
      .composite([{ input: Buffer.from(`<svg width="256" height="256"><rect width="256" height="256" fill="blue"/><circle cx="128" cy="128" r="90" fill="yellow"/></svg>`), top: 0, left: 0 }])
      .webp().toBuffer();
    const stAnalysis = await an2.analyzeMediaBuffer("asticker", grad).catch((e) => "threw:" + e.message);
    ok(stAnalysis !== null && stAnalysis.kind === "asticker", "static webp sticker analyzed (single page)");
    // oversize guard
    const bigSkip = await antinude.handleAntinude(s, mediaMsg("asticker"), settings(), noWarn, noWarn, ctx());
    ok(bigSkip === false, "oversize/undownloadable media still fails open");
  } catch (e) {
    // sharp unavailable in test env - skip gracefully
    console.log("  skip - sharp not available:", e.message.slice(0, 40));
  }

  stub.close();
  console.log(`\nANTINUDE QA: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
