// qa_gstatus_media_runtime.js
// RUNTIME exercise of the SHIPPED gstatus media helpers (engine.js __gsEnsureHelpers):
//   - extracts the real function source from core/engine.js (no re-implementation)
//   - builds REAL image / video / audio payloads from REAL bytes (jimp + ffmpeg run for real)
//   - validates mimetype gating (HEIC image, AVI video must throw the typed GS_UNSUPPORTED error)
//   - validates the media-relay wrap shape produced by gsPost against a MOCK socket
//     (upload stubbed - that is Baileys library code, not ours; everything downstream
//      of generateWAMessageContent that we own - messageSecret, single wrap, id, bookkeeping -
//      is asserted against the real output)
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const engineSrc = fs.readFileSync(path.join(__dirname, "..", "core", "engine.js"), "utf8");

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ok -", label); } else { fail++; console.log("  FAIL -", label); } };

// ── extract __gsEnsureHelpers source ──
const startIdx = engineSrc.indexOf("const __gsEnsureHelpers = () => {");
const endMarker = "globalThis.__gsHelpers = { gsBuildPayload, gsPost, gsMsgId };\n                    return globalThis.__gsHelpers;\n                  };";
const endIdx = engineSrc.indexOf(endMarker, startIdx);
if (startIdx < 0 || endIdx < 0) {
  console.log("FATAL: could not locate __gsEnsureHelpers source block");
  process.exit(1);
}
const fnSrc = engineSrc.slice(startIdx, endIdx + endMarker.length)
  .replace("const __gsEnsureHelpers = () => {", "const __gsEnsureHelpers = (scope) => {")
  .replace(/(?<![.\w])downloadContentFromMessage/g, "scope.downloadContentFromMessage");

const baileys = require("@whiskeysockets/baileys");
const scope = {
  downloadContentFromMessage: baileys.downloadContentFromMessage,
  generateWAMessageContent: baileys.generateWAMessageContent,
  jidNormalizedUser: baileys.jidNormalizedUser,
  GS_UNSUPPORTED: "__gs_unsupported_media__", // engine.js declares this at per-message scope (7729)
};
// eslint-disable-next-line no-new-func
const makeHelpers = new Function("scope", "require", "globalThis",
  "const GS_UNSUPPORTED = scope.GS_UNSUPPORTED;\n" +
  "const { generateWAMessageContent, jidNormalizedUser } = scope;\n" +
  fnSrc + "\nreturn __gsEnsureHelpers();");
const helpers = makeHelpers(scope, require, globalThis);
const { gsBuildPayload, gsPost, gsMsgId } = helpers;
ok(typeof gsBuildPayload === "function", "helpers extracted: gsBuildPayload");
ok(typeof gsPost === "function", "helpers extracted: gsPost");
ok(typeof gsMsgId === "function", "helpers extracted: gsMsgId (baileys id generator reachable)");

// ── real test media ──
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsrt-"));
  const { Jimp } = require("jimp");

  // 1) real JPEG via jimp
  const img = new Jimp({ width: 320, height: 180, color: 0x1a6e35ff });
  const jpgBuf = await img.getBuffer("image/jpeg", { quality: 80 });
  fs.writeFileSync(path.join(tmp, "in.jpg"), jpgBuf);
  ok(jpgBuf.length > 500, `real JPEG bytes (${Math.round(jpgBuf.length / 1024)}KB)`);

  // 2) real MP4 via ffmpeg (testsrc 0.8s, tiny)
  const { execFile } = require("child_process");
  const mp4Path = path.join(tmp, "in.mp4");
  await new Promise((res, rej) => execFile("ffmpeg", ["-f", "lavfi", "-i", "testsrc=duration=0.8:size=160x120:rate=15", "-pix_fmt", "yuv420p", "-y", mp4Path], (e) => e ? rej(e) : res()));
  const mp4Buf = fs.readFileSync(mp4Path);
  ok(mp4Buf.length > 1000, `real MP4 bytes (${Math.round(mp4Buf.length / 1024)}KB)`);

  // 3) real WAV via ffmpeg (voice-note shape, ptt)
  const wavPath = path.join(tmp, "in.wav");
  await new Promise((res, rej) => execFile("ffmpeg", ["-f", "lavfi", "-i", "sine=frequency=440:duration=1.2", "-y", wavPath], (e) => e ? rej(e) : res()));
  const wavBuf = fs.readFileSync(wavPath);
  ok(wavBuf.length > 1000, `real WAV bytes (${Math.round(wavBuf.length / 1024)}KB)`);

  console.log("── gsBuildPayload: image ──");
  const pImg = await gsBuildPayload("image", { mimetype: "image/jpeg" }, jpgBuf, "hello caption");
  ok(Buffer.isBuffer(pImg.image) && pImg.image.length === jpgBuf.length, "image payload carries the real buffer");
  ok(pImg.mimetype === "image/jpeg", "image mimetype normalized+explicit (Baileys never guesses)");
  ok(typeof pImg.jpegThumbnail === "string" && pImg.jpegThumbnail.length > 100, "jpegThumbnail computed by jimp (sharp path can never trigger)");
  ok(pImg.jpegThumbnail.slice(0, 4) === "/9j/", "thumbnail is real JPEG base64");
  ok(pImg.caption === "hello caption", "caption attached");
  ok(!pImg.video && !pImg.audio && !pImg.sticker, "single-kind payload");

  console.log("── gsBuildPayload: video ──");
  const tV = Date.now();
  const pVid = await gsBuildPayload("video", { mimetype: "video/mp4" }, mp4Buf, "vid cap");
  ok(Buffer.isBuffer(pVid.video) && pVid.video.length === mp4Buf.length, "video payload carries the real buffer");
  ok(pVid.mimetype === "video/mp4", "video mimetype normalized+explicit");
  ok(typeof pVid.jpegThumbnail === "string" && pVid.jpegThumbnail.slice(0, 4) === "/9j/", "video thumbnail = real ffmpeg-extracted frame");
  ok(pVid.caption === "vid cap", "video caption attached");
  console.log(`  (video build took ${((Date.now() - tV) / 1000).toFixed(2)}s incl. ffmpeg frame)`);

  console.log("── gsBuildPayload: audio (ptt waveform + seconds via ffprobe) ──");
  const pAud = await gsBuildPayload("audio", { mimetype: "audio/ogg; codecs=opus", ptt: true }, wavBuf);
  ok(Buffer.isBuffer(pAud.audio), "audio payload carries the real buffer");
  ok(pAud.ptt === true, "ptt preserved");
  ok(typeof pAud.seconds === "number" && pAud.seconds >= 1 && pAud.seconds <= 3, `ffprobe duration -> seconds (${pAud.seconds})`);
  ok(pAud.waveform instanceof Uint8Array && pAud.waveform.length === 64, "64-bar waveform for ptt (prepareWAMessageMedia skips audio-decode)");

  console.log("── gsBuildPayload: unsupported media must throw the TYPED error ──");
  let heicErr = null;
  try { await gsBuildPayload("image", { mimetype: "image/heic" }, jpgBuf); } catch (e) { heicErr = e; }
  ok(heicErr && heicErr.code === "__gs_unsupported_media__", "HEIC image -> typed GS_UNSUPPORTED (explicit chat rejection, no silent 60s window)");
  ok(heicErr && /JPG, PNG or WEBP/.test(heicErr.message), "HEIC message is actionable");
  let aviErr = null;
  try { await gsBuildPayload("video", { mimetype: "video/x-msvideo" }, mp4Buf); } catch (e) { aviErr = e; }
  ok(aviErr && aviErr.code === "__gs_unsupported_media__", "AVI video -> typed GS_UNSUPPORTED");
  ok(aviErr && /MP4/.test(aviErr.message), "AVI message is actionable");
  const pMov = await gsBuildPayload("video", { mimetype: "video/quicktime" }, mp4Buf);
  ok(pMov.mimetype === "video/mp4", "MOV (quicktime) accepted and normalized to video/mp4");
  const pPng = await gsBuildPayload("image", { mimetype: "image/png" }, jpgBuf);
  ok(pPng.mimetype === "image/png", "PNG accepted");
  const pWebp = await gsBuildPayload("image", { mimetype: "" }, jpgBuf);
  ok(pWebp.mimetype === "image/jpeg", "empty mimetype falls back to a safe default (never undefined)");

  console.log("── gsPost: relay wrap shape against a mock socket (real generateWAMessageContent, stubbed upload) ──");
  const relays = [];
  const reacts = [];
  const sent = [];
  const mockSock = {
    user: { id: "111@s.whatsapp.net" },
    sendMessage: async (jid, content) => {
      if (content && content.react) reacts.push(content.react.text);
      sent.push(content);
      return {};
    },
    relayMessage: async (jid, msg, opts) => { relays.push({ jid, msg, opts }); return {}; },
    // Baileys rc14 contract: upload(encFilePath, { fileEncSha256B64, mediaType, timeoutMs }) -> { mediaUrl, directPath }
    waUploadToServer: async (encFilePath, upOpts) => {
      ok(typeof encFilePath === "string" && require("fs").existsSync(encFilePath), `uploader receives a real encrypted file path (${String(encFilePath).slice(-12)})`);
      ok(upOpts && upOpts.timeoutMs === 60000, "engine's 60s mediaUploadTimeoutMs reaches the uploader");
      return { mediaUrl: "https://mmg.whatsapp.net/v/t62.7118-24/fake-uploaded", directPath: "/v/t62.7118-24/fake-uploaded" };
    },
  };
  // NOTE: uploader is stubbed with Baileys rc14's REAL contract (encFilePath -> {mediaUrl,
  // directPath}) so the full media relay path runs end to end; only the HTTP hop is mocked.
  let relayErr = null;
  try {
    await gsPost(mockSock, "222-333@g.us", { id: "CMDID1" }, pImg);
  } catch (e) { relayErr = e; }
  if (relayErr) {
    console.log("  (note) media relay failed:", relayErr.message);
  }
  ok(!relayErr, "media gsPost completes through real generateWAMessageContent");
  ok(reacts[0] === "⏳", "gsPost reacts ⏳ before upload");
  ok(reacts.includes("✅") || !!relayErr, "gsPost reacts ✅ on success");
  ok(relays.length === 1 || !!relayErr, "exactly one relayMessage call");
  if (relays.length === 1) {
    const r = relays[0];
    ok(r.jid === "222-333@g.us", "relay targets the group jid");
    ok(!!r.msg.groupStatusMessageV2 && !r.msg.groupStatusMessage, "single groupStatusMessageV2 wrap (v3 shape)");
    const inner = r.msg.groupStatusMessageV2.message;
    ok(!!inner.imageMessage, "inner message is the image payload");
    ok(inner.messageContextInfo && Buffer.isBuffer(inner.messageContextInfo.messageSecret) && inner.messageContextInfo.messageSecret.length === 32, "inner media message carries 32-byte messageSecret (official GStatusIn shape)");
    ok(/^[A-Z0-9]/.test(r.opts.messageId) && r.opts.messageId.length >= 8, "bare messageId passed to relay");
  }
  const mineArr = globalThis.__gsMine && globalThis.__gsMine.get(`${scope.jidNormalizedUser(mockSock.user.id)}:222-333@g.us`);
  if (!relayErr) ok(Array.isArray(mineArr) && mineArr.length === 1 && mineArr[0].id === (relays[0] ? relays[0].opts.messageId : undefined), "post bookkeeping recorded for .gstatus delete");

  console.log("── gsPost: TEXT status (path that must stay untouched) ──");
  const relays2 = [];
  mockSock.relayMessage = async (jid, msg, opts) => { relays2.push({ jid, msg, opts }); };
  await gsPost(mockSock, "222-333@g.us", null, { text: "plain status" });
  const inner2 = relays2[0].msg.groupStatusMessageV2.message;
  // Baileys rc14 adds messageSecret itself on non-reaction messages (reporting-token path);
  // OUR engine injection is media-only. What must hold: text relays fine, wrap intact.
  ok(!!(inner2.conversation || inner2.extendedTextMessage), "text status relays as text");
  ok(!relays2[0].msg.groupStatusMessageV2.message.imageMessage, "text status carries no media node");

  console.log("── gsPost: upload timeout budget ──");
  ok(engineSrc.includes("mediaUploadTimeoutMs: 60000"), "explicit 60s upload budget passed to generateWAMessageContent");
  ok(engineSrc.includes('new Error("media upload timed out after 120s - try a smaller file")'), "120s race backstop with actionable message");

  console.log("── gsMsgId fallback ──");
  const id1 = gsMsgId();
  ok(typeof id1 === "string" && id1.length >= 8, "message id generated (baileys or fallback)");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nGSTATUS MEDIA RUNTIME: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
