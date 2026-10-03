// research_trends2.js - Trends dance via got-scraping (TLS fingerprint + browser headers)
"use strict";
const { CookieJar } = require("tough-cookie");
let gotScraping; // ESM dynamic import (same pattern as engine.getGot)
const TRENDS = "https://trends.google.com";

function parseTrendsBody(body) {
  const idx = body.indexOf("{");
  if (idx < 0) throw new Error("no JSON: " + body.slice(0, 80));
  return JSON.parse(body.slice(idx));
}

async function newSession() {
  const jar = new CookieJar();
  const pre = await gotScraping({
    url: `${TRENDS}/trends/explore?hl=en-US`,
    responseType: "text",
    cookieJar: jar,
    timeout: { request: 20000 },
    headerGeneratorOptions: { browsers: [{ name: "chrome" }], devices: ["desktop"], locale: "en-US" },
  });
  const jarStr = jar.getCookieStringSync(TRENDS);
  return { jar, status: pre.statusCode, cookie: jarStr };
}

async function explore(jar, keywords, time, geo = "") {
  const req = { comparisonItem: keywords.map((kw) => ({ keyword: kw, time, geo })), category: 0, property: "" };
  const r = await gotScraping({
    url: `${TRENDS}/trends/api/explore`,
    searchParams: { hl: "en-US", tz: 0, req: JSON.stringify(req) },
    responseType: "text",
    cookieJar: jar,
    timeout: { request: 25000 },
    headerGeneratorOptions: { browsers: [{ name: "chrome" }], devices: ["desktop"], locale: "en-US" },
  });
  return { status: r.statusCode, body: r.body, data: parseTrendsBody(r.body) };
}

async function multiline(jar, widget) {
  const r = await gotScraping({
    url: `${TRENDS}/trends/api/widgetdata/multiline`,
    searchParams: { hl: "en-US", tz: 0, req: JSON.stringify(widget.request), token: widget.token },
    responseType: "text",
    cookieJar: jar,
    timeout: { request: 25000 },
    headerGeneratorOptions: { browsers: [{ name: "chrome" }], devices: ["desktop"], locale: "en-US" },
  });
  return { status: r.statusCode, data: parseTrendsBody(r.body) };
}

async function runCase(label, keywords, time) {
  const t0 = Date.now();
  try {
    const { jar } = await newSession();
    const ex = await explore(jar, keywords, time);
    const ts = (ex.data.widgets || []).find((w) => w.id === "TIMESERIES");
    if (!ts) { console.log(`  ${label}: NO TIMESERIES widget (status ${ex.status})`); return false; }
    const ml = await multiline(jar, ts);
    const tl = ml?.data?.default?.timelineData || [];
    if (!tl.length) { console.log(`  ${label}: EMPTY timeline`); return false; }
    const kwNames = (ml.data.default.columnNames || []).slice(1);
    const delta = tl.length > 1 ? tl[1].time - tl[0].time : 0;
    const samples = [0, tl.length >> 1, tl.length - 1].map((i) => `${tl[i].formattedTime}=[${(tl[i].value || []).join(",")}]`).join("  ");
    console.log(`  ${label}: OK ${tl.length} pts [${kwNames.join(" | ")}] res=${delta >= 86400 ? "daily" : delta >= 3600 ? "hourly" : "?"} (${Date.now() - t0}ms)`);
    console.log(`    ${samples}`);
    return true;
  } catch (e) {
    const body = e.response?.body ? String(e.response.body).slice(0, 100) : "";
    console.log(`  ${label}: ERROR ${e.response?.statusCode || e.code || ""} ${e.message} ${body}`);
    return false;
  }
}

(async () => {
  ({ gotScraping } = await import("got-scraping"));
  console.log("=== TRENDS VIA GOT-SCRAPING ===");
  let oks = 0, total = 0;
  const cases = [
    ["single kw past day", ["Dragon Ball"], "now 1-d"],
    ["single kw 7d", ["Dragon Ball"], "now 7-d"],
    ["single kw 30d", ["Dragon Ball"], "today 1-m"],
    ["single kw 90d", ["Python"], "today 3-m"],
    ["single kw 12m", ["Python"], "today 12-m"],
    ["single kw 5y", ["Python"], "today 5-y"],
    ["past hour", ["Python"], "now 1-H"],
    ["past 4 hours", ["Python"], "now 4-H"],
    ["2 kw 30d", ["Dragon Ball", "Naruto"], "today 1-m"],
    ["3 kw 12m", ["One Piece", "Naruto", "Bleach"], "today 12-m"],
    ["nonexistent kw", ["zzqxjwkwowowo"], "today 1-m"],
    ["5 kw", ["Python", "Java", "C++", "Go", "Rust"], "today 3-m"],
  ];
  for (const [label, kws, time] of cases) {
    total++;
    const ok = await runCase(label, kws, time);
    if (ok) oks++;
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`\nGOT-SCRAPING TRENDS: ${oks}/${total} ok`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
