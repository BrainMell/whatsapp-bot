// ===============================================
// qa_audio_listfirst.js - on-box QA for the list-first audio feature
// (".j audio" searches must show a numbered
// title/author/length list; a numeric reply sends that exact song)
// Sections:
// A. Session mechanics (no network): store / resolve / range / TTL /
// searching-phase / session-alive-after-pick
// B. Live list render (yt-search): numbered lines, durations, hint,
// session armed, pick resolves to a watch?v= URL [SKIP-tolerant]
// C. Legacy + URL-mode chains (live Go service, cached fast):
// pick URL downloads via getAudioInfo; plain query still works
// D. Engine hook presence (static asserts on engine.js source)
// Run on-box: node scripts/qa_audio_listfirst.js
// Exit code 0 = all green.
"use strict";

const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0, skip = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else if (cond === null) { skip++; console.log(`  ⏭️  ${name} (skip: ${extra || "not verifiable"})`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " - " + extra : ""}`); }
};
const section = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);

const picker = require(path.join(__dirname, "..", "core", "utils", "audioPicker"));

(async () => {
  const CHAT = "qa-audio-chat@s.whatsapp.net";

 // -- A. Session mechanics ----------------------------------------------
  section("A. Session mechanics (offline)");
  picker._pending.delete(CHAT);
  picker._pending.set(CHAT, {
    phase: "list", query: "unit test",
    results: [
      { videoId: "aaaaaaaaaaa", title: "Song One", author: "Artist One", dur: "3:21", seconds: 201 },
      { videoId: "bbbbbbbbbbb", title: "Song Two", author: "Artist Two", dur: "4:02", seconds: 242 },
    ],
    ts: Date.now(),
  });
  t("hasPendingAudioSelection true for fresh session", picker.hasPendingAudioSelection(CHAT) === true);
  const p1 = picker.resolveAudioPick(CHAT, "1");
  t("pick 1 ok", p1.ok === true && p1.videoUrl === "https://www.youtube.com/watch?v=aaaaaaaaaaa");
  t("pick 1 carries title/author", p1.title === "Song One" && p1.author === "Artist One");
  const p2 = picker.resolveAudioPick(CHAT, "2");
  t("pick 2 ok after pick 1 (session stays alive for switching)", p2.ok === true && p2.videoUrl.endsWith("bbbbbbbbbbb"));
  const pBad = picker.resolveAudioPick(CHAT, "9");
  t("out-of-range -> range error with max", !pBad.ok && pBad.reason === "range" && pBad.max === 2);
  const pJunk = picker.resolveAudioPick(CHAT, "banana");
  t("non-numeric -> range error", !pJunk.ok && pJunk.reason === "range");
  picker._pending.set(CHAT, { phase: "searching", query: "x", results: [], ts: Date.now() });
  const pSearch = picker.resolveAudioPick(CHAT, "1");
  t("mid-search number -> 'searching' (race-safe)", !pSearch.ok && pSearch.reason === "searching");
  picker._pending.set(CHAT, {
    phase: "list", query: "old", results: [{ videoId: "ccccccccccc", title: "Old", author: "A", dur: "2:00", seconds: 120 }],
    ts: Date.now() - picker._TTL_MS - 1000,
  });
  t("expired session not pending", picker.hasPendingAudioSelection(CHAT) === false);
  const pExp = picker.resolveAudioPick(CHAT, "1");
  t("expired pick -> 'expired' + cleaned", !pExp.ok && pExp.reason === "expired" && !picker._pending.has(CHAT));

 // -- B. Live list render -----------------------------------------------
  section("B. Live list render (yt-search) [SKIP-tolerant]");
  const sent = [];
  const reacts = [];
  const stubSock = {
    sendMessage: async (jid, content) => { sent.push(content); return { key: { id: "x" } }; },
  };
  const fakeM = { key: { id: "qa-msg-1", remoteJid: CHAT, fromMe: false, participant: "qa@s.whatsapp.net" } };
  let listed = false, searchOk = false;
  try {
    listed = await picker.runAudioSearch(stubSock, CHAT, "never gonna give you up", fakeM, { botMarker: "🤖 " });
    searchOk = true;
  } catch (e) {
    console.log("  (yt-search threw:", e.message + ")");
  }
  if (!searchOk || !listed) {
    t("live yt-search list", null, "youtube search unreachable from box - offline sections still cover mechanics");
  } else {
    const listMsg = [...sent].reverse().find((c) => c.text && c.text.includes("AUDIO SEARCH"));
    t("list message sent", !!listMsg);
    t("bot marker prefix", listMsg && listMsg.text.startsWith("🤖 🎧 *AUDIO SEARCH*"));
    t("numbered lines 1..N", listMsg && /\n1\. \*/.test(listMsg.text) && /\n2\. \*/.test(listMsg.text));
    t("author line present", listMsg && /- _/.test(listMsg.text));
    t("duration present (m:ss)", listMsg && /\_\d+:\d\d\_/.test(listMsg.text));
    t("pick hint present", listMsg && listMsg.text.includes("Reply with a *number*"));
    t("3-min expiry hint", listMsg && listMsg.text.includes("3 min"));
    t("session armed in 'list' phase", picker._pending.get(CHAT) && picker._pending.get(CHAT).phase === "list");
    const livePick = picker.resolveAudioPick(CHAT, "1");
    t("live pick resolves to watch?v= URL", livePick.ok && /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(livePick.videoUrl));
    console.log(`      picked: ${livePick.title} - ${livePick.author}`);
    var livePickUrl = livePick.ok ? livePick.videoUrl : null; // for section C
  }

 // -- C. Go service chains (live, cached-when-possible) -----------------
  section("C. Go service: URL-mode pick download + legacy query [SKIP-tolerant]");
  const goService = require(path.join(__dirname, "..", "core", "utils", "goImageService"));
  const urlToTest = livePickUrl || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  try {
    const data = await goService.getAudioInfo(urlToTest, { noRetry: true, timeoutMs: 170000 });
    t("URL-mode (exact picked video) returns audio", !!(data && data.audioURL && !data.error),
      data && data.error ? `service said: ${data.error}` : "no audioURL");
    if (data && data.metadata) {
      t("URL-mode metadata has title", !!data.metadata.title);
      t("URL-mode metadata.url is the picked video", /^https:\/\/www\.youtube\.com\/watch/.test(data.metadata.url || ""));
      console.log(`      downloaded: ${data.metadata.title} (source: ${data.audioSource})`);
    }
  } catch (e) {
    t("URL-mode (exact picked video) returns audio", null, "go service unreachable: " + e.message);
  }
  try {
    const legacy = await goService.getAudioInfo("ed sheeran shape of you", { noRetry: true, timeoutMs: 170000 });
    t("legacy single-shot query still works (fallback path)", !!(legacy && legacy.audioURL && !legacy.error),
      legacy && legacy.error ? `service said: ${legacy.error}` : "no audioURL");
    if (legacy && legacy.metadata) console.log(`      legacy match: ${legacy.metadata.title} (source: ${legacy.audioSource})`);
  } catch (e) {
    t("legacy single-shot query still works (fallback path)", null, "go service unreachable: " + e.message);
  }

 // -- D. Engine hook presence (static) ----------------------------------
  section("D. Engine hook presence (static asserts)");
  const eng = fs.readFileSync(path.join(__dirname, "..", "core", "engine.js"), "utf8");
  t("engine requires audioPicker", eng.includes("require('./utils/audioPicker')"));
  t("numeric interceptor checks audio session", eng.includes("audioPicker.hasPendingAudioSelection(chatId)"));
  t("numeric interceptor resolves pick -> handleAudioCommand", eng.includes("handleAudioCommand(sock, chatId, pick.videoUrl, m)"));
  t(".j audio routes through runAudioSearch", eng.includes("audioPicker.runAudioSearch("));
  t("YouTube URL bypass skips the list", eng.includes("youtu\\.be\\/)"));
  t("legacy fallback preserved when list fails", /if \(listed\) return;\s*\n\s*await handleAudioCommand\(sock, chatId, query, m\);/.test(eng));
  t("realm theme bare-.j-audio untouched", eng.includes("THE REALM'S THEME"));

 // -- summary -----------------------------------------------------------
  console.log(`\n═══ RESULT: ${pass} passed / ${fail} failed / ${skip} skipped ═══`);
  process.exit(fail ? 1 : 0);
})();
