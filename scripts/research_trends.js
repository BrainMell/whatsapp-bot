// research_trends.js - REAL experiments against Google Trends unofficial endpoints
// Dance (pytrends-equivalent, in-house with axios):
//   1) GET https://trends.google.com/trends/explore  (cookie jar: NID etc.)
//   2) GET https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=<json>  (with cookies)
//      -> ")]}'"-prefixed JSON, widgets[] -> timeseries widget {token, request}
//   3) GET https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=<widget.request json>&token=<token>
//      -> ")]}'"-prefixed JSON, default.timelineData[] = {time, value[], hasData[], formattedTime}
"use strict";
const axios = require("axios");

const TRENDS = "https://trends.google.com";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" };

function parseTrendsBody(body) {
  const idx = body.indexOf("{");
  if (idx < 0) throw new Error("no JSON in response: " + body.slice(0, 80));
  return JSON.parse(body.slice(idx));
}

async function newSession() {
  // step 1: acquire cookies
  const pre = await axios.get(`${TRENDS}/trends/explore`, { headers: UA, timeout: 15000 });
  const setCookies = pre.headers["set-cookie"] || [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("no cookies from explore preflight");
  return cookie;
}

async function explore(cookie, keywords, time, geo = "") {
  const req = {
    comparisonItem: keywords.map((kw) => ({ keyword: kw, time, geo })),
    category: 0,
    property: "",
  };
  const r = await axios.get(`${TRENDS}/trends/api/explore`, {
    params: { hl: "en-US", tz: 0, req: JSON.stringify(req) },
    headers: { ...UA, Cookie: cookie },
    timeout: 20000,
  });
  const data = parseTrendsBody(r.data);
  const ts = (data.widgets || []).find((w) => w.id === "TIMESERIES");
  return { data, ts };
}

async function multiline(cookie, widget) {
  const r = await axios.get(`${TRENDS}/trends/api/widgetdata/multiline`, {
    params: { hl: "en-US", tz: 0, req: JSON.stringify(widget.request), token: widget.token },
    headers: { ...UA, Cookie: cookie },
    timeout: 20000,
  });
  return parseTrendsBody(r.data);
}

async function runCase(label, keywords, time) {
  const t0 = Date.now();
  try {
    const cookie = await newSession();
    const { ts } = await explore(cookie, keywords, time);
    if (!ts) { console.log(`  ${label}: NO TIMESERIES widget`); return { label, ok: false }; }
    const ml = await multiline(cookie, ts);
    const tl = ml?.default?.timelineData || [];
    if (!tl.length) { console.log(`  ${label}: EMPTY timeline`); return { label, ok: false }; }
    const kwNames = (ml.default.columnNames || []).slice(1);
    const vals = tl.map((p) => p.value);
    const last = tl[tl.length - 1];
    // sample a few points
    const sampleIdx = [0, Math.floor(tl.length / 4), Math.floor(tl.length / 2), tl.length - 1];
    const samples = sampleIdx.map((i) => `${tl[i].formattedTime}=[${(tl[i].value || []).join(",")}]`).join("  ");
    console.log(`  ${label}: OK ${tl.length} pts, cols=[${kwNames.join(" | ")}] (${Date.now() - t0}ms)`);
    console.log(`    first/quarter/mid/last: ${samples}`);
    const gaps = tl.filter((p) => (p.hasData || []).some((h) => h === false)).length;
    if (gaps) console.log(`    ${gaps} points with hasData=false (thin-data gaps)`);
    const resolutionGuess = tl.length > 1 ? (tl[1].time - tl[0].time) : 0;
    console.log(`    resolution: ${resolutionGuess >= 86400 ? "daily+" : resolutionGuess >= 3600 ? "hourly" : "?"} (delta=${resolutionGuess}s)`);
    return { label, ok: true, pts: tl.length, kwNames };
  } catch (e) {
    const body = e.response?.data ? String(e.response.data).slice(0, 120) : "";
    console.log(`  ${label}: ERROR ${e.response?.status || e.code || ""} ${e.message} ${body}`);
    return { label, ok: false, err: e.response?.status };
  }
}

(async () => {
  console.log("=== GOOGLE TRENDS MANUAL DANCE (axios only) ===");
  await runCase("single kw, past day", ["Dragon Ball"], "now 1-d");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("single kw, 7d", ["Dragon Ball"], "now 7-d");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("single kw, 30d", ["Dragon Ball"], "today 1-m");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("single kw, 90d", ["Python"], "today 3-m");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("single kw, 12m", ["Python"], "today 12-m");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("single kw, 5y", ["Python"], "today 5-y");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("past hour", ["Python"], "now 1-H");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("past 4 hours", ["Python"], "now 4-H");

  console.log("=== COMPARISONS (multi-keyword) ===");
  await runCase("2 kw, 30d", ["Dragon Ball", "Naruto"], "today 1-m");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("3 kw, 12m", ["One Piece", "Naruto", "Bleach"], "today 12-m");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("3 kw tech, 90d", ["Python", "Java", "C#"], "today 3-m");

  console.log("=== ERROR / EDGE CASES ===");
  await runCase("nonexistent kw", ["zzqxjwkwowowo"], "today 1-m");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("5 keywords at once", ["Python", "Java", "C++", "Go", "Rust"], "today 3-m");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("bad time token", ["Python"], "bogus-range");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("empty keyword", [""], "today 1-m");
  await new Promise((r) => setTimeout(r, 1200));
  await runCase("geo-restricted (US)", ["Super Bowl"], "today 1-m");

  console.log("=== RATE LIMIT PROBE: 6 rapid explores, one cookie session ===");
  try {
    const cookie = await newSession();
    let ok = 0, fails = [];
    for (let i = 0; i < 6; i++) {
      try { await explore(cookie, [`kw${i}test`], "now 1-d"); ok++; } catch (e) { fails.push(e.response?.status || e.code); }
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log(`  rapid: ${ok}/6 ok, failures: ${fails.join(",") || "none"}`);
  } catch (e) { console.log("  rate probe session failed:", e.message); }

  console.log("=== RELIABILITY: full dance x5 (fresh cookie each) ===");
  let oks = 0;
  for (let i = 0; i < 5; i++) {
    const r = await runCase(`reliability#${i + 1}`, ["One Piece"], "today 1-m");
    if (r.ok) oks++;
    await new Promise((r2) => setTimeout(r2, 1500));
  }
  console.log(`  reliability: ${oks}/5 full dances ok`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
