// research_stocks.js - REAL API experiments for the stock command
// Candidates: Yahoo Finance chart+search (no key), Stooq CSV (no key), Alpha Vantage (key, skipped - none available)
"use strict";
const axios = require("axios");
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/json" };
const findings = [];

async function yahooChart(symbol, range, interval) {
  const t0 = Date.now();
  const r = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    params: { range, interval, includePrePost: false, events: "div,splits" },
    headers: UA, timeout: 15000,
  });
  return { ms: Date.now() - t0, data: r.data };
}

function summarizeChart(sym, range, interval, d) {
  const res = d?.chart?.result?.[0];
  if (!res) return `  ${sym} ${range}/${interval}: NO RESULT meta=${JSON.stringify(d?.chart || {}).slice(0, 200)}`;
  const m = res.meta || {};
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const closes = (q.close || []).filter((v) => v != null);
  const prev = m.chartPreviousClose ?? m.previousClose;
  const last = closes[closes.length - 1];
  const chg = prev && last ? ((last - prev) / prev) * 100 : null;
  const hasOHLC = ["open", "high", "low", "close", "volume"].every((k) => Array.isArray(q[k]) && q[k].some((v) => v != null));
  return `  ${sym} ${range}/${interval}: tz=${m.exchangeName} ${m.fullExchangeName ? "" : ""}cur=${m.currency} pts=${ts.length} prev=${prev} last=${last} chg%=${chg == null ? "?" : chg.toFixed(2)} OHLC=${hasOHLC} gmOff=${m.gmOff} regular=${m.regularMarketPrice} ts0=${ts[0] ? new Date(ts[0] * 1000).toISOString() : "-"} tsN=${ts.length ? new Date(ts[ts.length - 1] * 1000).toISOString() : "-"} (${res.timestamp ? "ok" : "no-ts"})`;
}

(async () => {
  console.log("=== YAHOO CHART API (query1.finance.yahoo.com/v8/finance/chart) ===");
  // Matrix: symbol x range x sensible interval
  const matrix = [
    ["AAPL", "1d", "5m"], ["AAPL", "5d", "15m"], ["AAPL", "1mo", "1d"], ["AAPL", "6mo", "1d"],
    ["AAPL", "1y", "1wk"], ["AAPL", "5y", "1wk"],
    ["MSFT", "1mo", "1d"], ["NVDA", "1d", "5m"],
  ];
  for (const [s, r, i] of matrix) {
    try { const { ms, data } = await yahooChart(s, r, i); findings.push({ api: "yahoo-chart", s, r, ok: true }); console.log(summarizeChart(s, r, i, data) + ` [${ms}ms]`); }
    catch (e) { findings.push({ api: "yahoo-chart", s, r, ok: false }); console.log(`  ${s} ${r}/${i}: ERROR ${e.response?.status || ""} ${e.message}`); }
    await new Promise((res) => setTimeout(res, 350)); // polite pacing
  }

  console.log("=== ERROR CONDITIONS ===");
  for (const bad of [["NOPE123", "1mo", "1d"], ["", "1mo", "1d"], ["AAPL", "bogus-range", "1d"], ["AAPL", "1mo", "7h"]]) {
    try { await yahooChart(...bad); console.log(`  ${bad.join("/")}: UNEXPECTED 200`); }
    catch (e) {
      const body = e.response?.data ? JSON.stringify(e.response.data).slice(0, 140) : "";
      console.log(`  ${bad.join("/")}: status=${e.response?.status || e.code} ${body}`);
    }
    await new Promise((res) => setTimeout(res, 300));
  }

  console.log("=== YAHOO SEARCH (company name -> ticker) ===");
  for (const q of ["apple", "tesla", "nvidia", "zzzzqqq"]) {
    try {
      const r = await axios.get("https://query2.finance.yahoo.com/v1/finance/search", { params: { q, quotesCount: 6, newsCount: 0 }, headers: UA, timeout: 15000 });
      const quotes = (r.data.quotes || []).map((x) => `${x.symbol}(${x.quoteType},${x.shortname})`);
      console.log(`  "${q}" -> ${quotes.join(" | ") || "(none)"}`);
    } catch (e) { console.log(`  "${q}": ERROR ${e.response?.status || e.message}`); }
    await new Promise((res) => setTimeout(res, 350));
  }

  console.log("=== NON-EQUITY ASSETS ===");
  for (const s of ["BTC-USD", "ETH-USD", "SPY", "GC=F", "EURUSD=X"]) {
    try { const { data } = await yahooChart(s, "1mo", "1d"); console.log(summarizeChart(s, "1mo", "1d", data)); }
    catch (e) { console.log(`  ${s}: ERROR ${e.response?.status || e.message}`); }
    await new Promise((res) => setTimeout(res, 350));
  }

  console.log("=== STOOQ CSV FALLBACK ===");
  try {
    const r = await axios.get("https://stooq.com/q/d/l/", { params: { s: "aapl.us", i: "d" }, headers: UA, timeout: 15000, responseType: "text" });
    const lines = String(r.data).trim().split("\n");
    console.log(`  aapl.us daily CSV: ${lines.length} rows, header=${lines[0]}, last=${lines[lines.length - 1]}`);
  } catch (e) { console.log(`  stooq: ERROR ${e.response?.status || e.message}`); }

  console.log("=== RATE LIMIT PROBE (10 rapid calls) ===");
  let okN = 0, codes = [];
  for (let i = 0; i < 10; i++) {
    try { await yahooChart("MSFT", "1d", "15m"); okN++; } catch (e) { codes.push(e.response?.status || e.code); }
  }
  console.log(`  10 rapid calls: ${okN} ok, failures: ${codes.join(",") || "none"}`);

  console.log("=== query2 vs query1 host parity ===");
  try { const r2 = await axios.get("https://query2.finance.yahoo.com/v8/finance/chart/AAPL", { params: { range: "1d", interval: "5m" }, headers: UA, timeout: 15000 }); console.log("  query2 chart:", r2.data?.chart?.result?.[0]?.meta?.symbol ? "OK" : "no result"); } catch (e) { console.log("  query2 chart ERROR:", e.response?.status || e.message); }

  console.log(`\nSUMMARY: yahoo-chart ok=${findings.filter((f) => f.ok).length}/${findings.length}`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
