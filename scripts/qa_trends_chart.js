// qa_trends_chart.js - 5+ RUNTIME test runs of the Google Trends command
// REAL Trends dances through got-scraping + REAL canvas renders.
"use strict";
const fs = require("fs");
const path = require("path");
const trends = require("../core/utils/trendsChart");

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log("  ok -", label); } else { fail++; console.log("  FAIL -", label); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARK = "\u200B";
const OUT = path.join(__dirname, "render_out", "trends");
fs.mkdirSync(OUT, { recursive: true });

function mockSock() {
  const sent = [];
  return { sent, user: { id: "100@s.whatsapp.net" }, sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return {}; } };
}

(async () => {
  const chat = "1203888@g.us";

  console.log("════ RUN 1: single keyword 30d ════");
  {
    const sock = mockSock();
    const r = await trends.handleTrends(sock, chat, "u@s.whatsapp.net", MARK, { key: { id: "K1" } }, '"Dragon Ball" 30d');
    ok(r.handled && r.silent, "handled silently (image sent)");
    const img = sock.sent.find((s) => s.content.image);
    ok(!!img, "graph sent");
    if (img) {
      const buf = img.content.image;
      ok(Buffer.isBuffer(buf) && buf.slice(1, 4).toString() === "PNG" && buf.length > 30000, `valid PNG (${Math.round(buf.length / 1024)}KB)`);
      fs.writeFileSync(path.join(OUT, "db_30d.png"), buf);
      const cap = img.content.caption || "";
      ok(/relative search interest/i.test(cap), "caption explains relative interest");
      ok(/Google Trends/.test(cap), "caption attributes source");
    }
    const data = await trends.getTrends(["Dragon Ball"], "30d");
    ok(data.points.length >= 25, `daily points present (${data.points.length})`);
    ok(data.max > 0 && data.max <= 100, `values within 0-100 (max=${data.max})`);
  }

  await sleep(2000);
  console.log("════ RUN 2: two-keyword comparison 12m ════");
  {
    const sock = mockSock();
    const r = await trends.handleTrends(sock, chat, "u@s.whatsapp.net", MARK, { key: { id: "K2" } }, '"Dragon Ball" "Naruto" 12m');
    const img = sock.sent.find((s) => s.content.image);
    ok(!!img, "comparison graph sent");
    if (img) {
      fs.writeFileSync(path.join(OUT, "db_vs_naruto_12m.png"), img.content.image);
      ok(/Dragon Ball[\s\S]*Naruto/.test(img.content.caption || ""), "caption ranks both keywords");
    }
    const data = await trends.getTrends(["Dragon Ball", "Naruto"], "12m");
    ok(data.points.every((p) => p.values.length === 2), "every point carries 2 series values");
    const avg = (s) => data.points.reduce((a, p) => a + p.values[s], 0) / data.points.length;
    console.log(`    (avgs: Dragon Ball=${avg(0).toFixed(1)}, Naruto=${avg(1).toFixed(1)})`);
  }

  await sleep(2000);
  console.log("════ RUN 3: three-keyword tech comparison 90d ════");
  {
    const sock = mockSock();
    const r = await trends.handleTrends(sock, chat, "u@s.whatsapp.net", MARK, { key: { id: "K3" } }, "Python Java C# 90d");
    const img = sock.sent.find((s) => s.content.image);
    ok(!!img, "3-way bare-keyword comparison sent");
    if (img) fs.writeFileSync(path.join(OUT, "tech_90d.png"), img.content.image);
  }

  await sleep(2000);
  console.log("════ RUN 4: short ranges (4h hourly resolution) ════");
  {
    const sock = mockSock();
    await trends.handleTrends(sock, chat, "u@s.whatsapp.net", MARK, { key: { id: "K4" } }, '"Python" 4h');
    const img = sock.sent.find((s) => s.content.image);
    ok(!!img, "4h graph sent");
    if (img) fs.writeFileSync(path.join(OUT, "python_4h.png"), img.content.image);
    const d = await trends.getTrends(["Python"], "4h");
    ok(d.points.length >= 20, `high-resolution points (${d.points.length})`);
  }

  await sleep(2000);
  console.log("════ RUN 5: 5y long range + cache hit ════");
  {
    const sock = mockSock();
    await trends.handleTrends(sock, chat, "u@s.whatsapp.net", MARK, { key: { id: "K5" } }, '"One Piece" 5y');
    ok(sock.sent.find((s) => s.content.image), "5y graph sent");
    const t0 = Date.now();
    const cached = await trends.getTrends(["One Piece"], "5y");
    const dt = Date.now() - t0;
    ok(!!cached && dt < 50, `cache hit instant (${dt}ms)`);
  }

  await sleep(2000);
  console.log("════ EDGE: zero-data keyword / too many keywords / usage / parser ════");
  {
    const sock = mockSock();
    const z = await trends.handleTrends(sock, chat, "u@s.whatsapp.net", MARK, { key: { id: "K6" } }, '"zzqxjwkwowowo" 30d');
    ok(z.message && /No meaningful search interest/i.test(z.message), "all-zero keyword -> honest no-data message");
    await sleep(1000);
    const many = await trends.handleTrends(sock, chat, "u@s.whatsapp.net", MARK, { key: { id: "K7" } }, 'a b c d e f 30d');
    ok(many.message && /at most 5|max 5/i.test(many.message), "6 keywords -> capped error (no network call)");
    const bare = await trends.handleTrends(sock, chat, "u@s.whatsapp.net", MARK, { key: { id: "K8" } }, "");
    ok(bare.message && /Google Trends lookup/.test(bare.message), "bare -> usage card");
    // parser units
    const p1 = trends.parseTrendsArgs('"Dragon Ball" "Naruto" 90d');
    ok(p1.keywords.join("|") === "Dragon Ball|Naruto" && p1.range === "90d", "quoted kws + range");
    const p2 = trends.parseTrendsArgs("python java");
    ok(p2.keywords.join("|") === "python|java" && p2.range === "30d", "bare kws + default range");
    const p3 = trends.parseTrendsArgs('"One Piece" 1y');
    ok(p3.keywords.length === 1 && p3.range === "12m", "alias 1y -> 12m");
    const p4 = trends.parseTrendsArgs('"One Piece" "7d"');
    ok(p4.keywords.length === 1 && p4.range === "7d", "quoted range token accepted");
    const p5 = trends.parseTrendsArgs("hello");
    ok(p5.keywords.join("|") === "hello" && p5.range === "30d", "single bare kw");
  }

  console.log(`\nTRENDS QA: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
