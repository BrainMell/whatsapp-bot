#!/usr/bin/env node
// smoke_google_live.js - live one-shot: real fetch + parse + (optional) format.
// Usage: node scripts/smoke_google_live.js "<query>" [box|local]
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const ao = require(path.join(ROOT, "core/utils/aiOverview"));

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const query = process.argv[2] || "how do solar panels work";

async function tryBackend(name, url, opts, parse) {
  try {
    const axios = require("axios");
    const t0 = Date.now();
    const resp = await axios({ url, ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) }, timeout: 9000, maxRedirects: 5, ...{} });
    const html = typeof resp.data === "string" ? resp.data : String(resp.data || "");
    const results = ao.dedupeAndCap(parse(html));
    console.log(`[${name}] ${Date.now() - t0}ms → ${results.length} results, html ${html.length}b`);
    return results;
  } catch (e) {
    console.log(`[${name}] FAILED: ${e.message}`);
    return [];
  }
}

(async () => {
 // brave-first (matches engine order - verified: Brave serves real results
 // to box egresses; Bing decoys, DDG anomaly-202, Google JS wall)
  let results = await tryBackend("brave", "https://search.brave.com/search", {
    method: "GET", params: { q: query }, headers: { "Accept-Language": "en-US,en;q=0.9" },
  }, ao.parseBraveHtml);
  if (!(results.length >= ao.MIN_RESULTS && ao.relevantEnough(query, results))) {
    results = await tryBackend("bing", "https://www.bing.com/search", {
      method: "GET", params: { q: query, count: 10 }, headers: { "Accept-Language": "en-US,en;q=0.9" },
    }, ao.parseBingHtml);
  }
  if (!(results.length >= ao.MIN_RESULTS && ao.relevantEnough(query, results))) {
    results = await tryBackend("ddg-html", "https://html.duckduckgo.com/html/", {
      method: "POST",
      data: new URLSearchParams({ q: query }).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }, ao.parseDdgHtml);
  }
  if (!(results.length >= ao.MIN_RESULTS && ao.relevantEnough(query, results))) {
    results = await tryBackend("ddg-lite", "https://lite.duckduckgo.com/lite/", {
      method: "GET", params: { q: query },
    }, ao.parseDdgLite);
  }
  console.log("\nWINNER:", results.length, "results, relevant:", ao.relevantEnough(query, results));
  for (const r of results.slice(0, 6)) {
    console.log(` • [${r.domain}] ${r.title}\n   ${r.snippet.slice(0, 110)}`);
  }
  if (results.length >= 2) {
    const msg = ao.buildOverviewMessage(query, "SYNTHESIS PLACEHOLDER [1][2] - proves prompt/message assembly on live data.", results);
    console.log("\n--- message preview (first 700 chars) ---\n" + msg.slice(0, 700));
  }
  process.exit(results.length >= 2 ? 0 : 2);
})().catch((e) => { console.error("smoke crashed:", e); process.exit(1); });
