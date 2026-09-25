// qa_trends_live.js — REAL command-path tests for .j trends after the 2026-09-25 fix.
// Runs the ACTUAL handleTrends (same function the engine calls) against Google,
// capturing sendMessage calls through a mock socket like the real bot would.
"use strict";
process.env.NODE_ENV = process.env.NODE_ENV || "test";
const tc = require("/home/z/my-project/whatsapp-bot/core/utils/trendsChart");

const MARK = "\u200B";
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  ok -", l); } else { fail++; console.log("  FAIL -", l); } };

function makeMockSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return {}; },
  };
}

function runCmd(sock, args) {
  return tc.handleTrends(sock, "chat@g.us", "user@s.whatsapp.net", MARK, { key: { id: "T" } }, args);
}

(async () => {
  console.log("── 1. help surface (no args) ──");
  {
    const sock = makeMockSock();
    const r = await runCmd(sock, "");
    ok(r.handled, "help handled");
    ok((r.message || "").includes("Google Trends"), "help mentions Google Trends");
    ok((r.message || "").includes("RELATIVE search interest"), "help explains relative interest");
  }

  console.log("── 2. arg parsing edge cases ──");
  {
    const p1 = tc.parseTrendsArgs('"Dragon Ball" 30d');
    ok(p1.keywords.length === 1 && p1.keywords[0] === "Dragon Ball" && p1.range === "30d", "quoted kw + range");
    const p2 = tc.parseTrendsArgs('"Dragon Ball" "Naruto" 90d');
    ok(p2.keywords.length === 2 && p2.range === "90d", "two quoted kws + range");
    const p3 = tc.parseTrendsArgs('python java 12m');
    ok(p3.keywords.length === 2 && p3.range === "12m", "bare kws + 12m");
    const p4 = tc.parseTrendsArgs('"Dragon Ball"');
    ok(p4.keywords.length === 1 && p4.range === "30d", "no range -> default 30d");
    const p5 = tc.parseTrendsArgs('"A" "B" "C" "D" "E" "F"');
    ok(!!p5.error, "more than 5 keywords rejected");
    const p6 = tc.parseTrendsArgs('"x" week');
    ok(p6.range === "7d", "alias week -> 7d");
    const p7 = tc.parseTrendsArgs('"x" 24h');
    ok(p7.range === "1d", "alias 24h -> 1d");
  }

  console.log("── 3. REAL lookups through the command path ──");
  const cases = [
    { args: '"Dragon Ball"', label: "single kw 30d", minPoints: 20 },
    { args: '"Dragon Ball" "Naruto" 90d', label: "vs kw 90d", minPoints: 60 },
    { args: '"Python" "Java" 12m', label: "two kws 12m (monthly resolution)", minPoints: 10 },
    { args: '"One Piece" 7d', label: "single kw 7d", minPoints: 50 },
    { args: '"Bitcoin" 5y', label: "single kw 5y", minPoints: 200 },
  ];
  for (const c of cases) {
    const sock = makeMockSock();
    const t0 = Date.now();
    const r = await runCmd(sock, c.args);
    const ms = Date.now() - t0;
    const img = sock.sent.find((s) => s.content && s.content.image);
    ok(img && Buffer.isBuffer(img.content.image) && img.content.image.length > 5000, `${c.label}: graph image sent (${img ? Math.round(img.content.image.length / 1024) + "KB" : "none"}) in ${(ms / 1000).toFixed(1)}s`);
    if (img) {
      ok((img.content.caption || "").includes("RELATIVE search interest") || (img.content.caption || "").includes("Relative search interest"), `${c.label}: caption explains relative interest`);
      ok(img.content.caption.startsWith(MARK), `${c.label}: caption carries bot marker`);
      // PNG signature
      const b = img.content.image;
      ok(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, `${c.label}: payload is a real PNG`);
    } else {
      ok(false, `${c.label}: got text instead of graph: ${(r.message || "").slice(0, 120)}`);
    }
  }

  console.log("── 4. no-data keyword handling ──");
  {
    const sock = makeMockSock();
    const r = await runCmd(sock, '"qqxxwwzzqqxxwwzzqq" 7d');
    const noGraph = !sock.sent.find((s) => s.content && s.content.image);
    ok(noGraph, "no fake graph for garbage keyword");
    ok((r.message || "").includes("No meaningful search interest"), `useful no-data message: ${(r.message || "").slice(0, 90)}`);
  }

  console.log("── 5. tier-1 circuit breaker state ──");
  {
    const st = tc._internal.getTier1State();
    console.log("  tier1 state:", JSON.stringify(st));
    ok(typeof st.fails === "number", "tier1 fail counter exposed");
  }

  console.log("── 6. cache reuse (second identical call must be fast, no new fetch) ──");
  {
    const sock = makeMockSock();
    const t0 = Date.now();
    await runCmd(sock, '"Dragon Ball"');
    const ms = Date.now() - t0;
    ok(ms < 3000 && sock.sent.find((s) => s.content && s.content.image), `cached call served in ${ms}ms`);
  }

  console.log(`\nTRENDS LIVE QA: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
