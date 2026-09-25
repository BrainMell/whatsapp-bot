// qa_stock_chart.js - 5+ RUNTIME test runs of the real-market stock command
// REAL Yahoo Finance calls + REAL canvas renders; PNGs saved for visual review.
"use strict";
const fs = require("fs");
const path = require("path");
const stock = require("../core/utils/stockChart");

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log("  ok -", label); } else { fail++; console.log("  FAIL -", label); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARK = "\u200B";
const OUT = path.join(__dirname, "render_out", "stock");
fs.mkdirSync(OUT, { recursive: true });

function mockSock() {
  const sent = [];
  return { sent, user: { id: "100@s.whatsapp.net" }, sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return {}; } };
}

async function runCase(sock, chat, args, label) {
  const r = await stock.handleStock(sock, chat, "u@s.whatsapp.net", MARK, { key: { id: "K" + Math.random() } }, args);
  return { r, label };
}

(async () => {
  const chat = "1203999@g.us";

  console.log("════ RUN 1: AAPL past month (candlestick render) ════");
  {
    const sock = mockSock();
    const { r } = await runCase(sock, chat, "AAPL 1m", "AAPL 1m");
    ok(r.handled && r.silent, "handled silently (image sent)");
    const img = sock.sent.find((s) => s.content.image);
    ok(!!img, "image message sent");
    if (img) {
      const buf = img.content.image;
      ok(Buffer.isBuffer(buf) && buf.length > 30000, `PNG size sane (${Math.round(buf.length / 1024)}KB)`);
      ok(buf.slice(1, 4).toString() === "PNG", "valid PNG magic");
      fs.writeFileSync(path.join(OUT, "aapl_1m.png"), buf);
      const cap = img.content.caption || "";
      ok(/Apple|\$/.test(cap) && /%/.test(cap), `caption has name/price/change`);
      ok(/Yahoo Finance/.test(cap), "caption attributes source");
    }
    const quote = await stock.fetchChart("AAPL", "1m");
    ok(quote.series.length >= 15 && quote.series.length <= 25, `1m daily candles (~22) got ${quote.series.length}`);
    ok(quote.currency === "USD", "USD currency");
    ok(quote.series.every((s) => s.h >= s.l && s.c > 0 && s.o > 0), "OHLC sanity (h>=l, positive)");
  }

  console.log("════ RUN 2: TSLA past day (5m intraday) ════");
  {
    const sock = mockSock();
    const { r } = await runCase(sock, chat, "TSLA 1d", "TSLA 1d");
    const img = sock.sent.find((s) => s.content.image);
    ok(!!img, "intraday chart sent");
    if (img) fs.writeFileSync(path.join(OUT, "tsla_1d.png"), img.content.image);
    const q = await stock.fetchChart("TSLA", "1d");
    ok(q.interval === "5m" && q.series.length >= 30, `5m candles present (${q.series.length})`);
  }

  console.log("════ RUN 3: name resolution - \"bitcoin\" -> BTC-USD ════");
  {
    const sock = mockSock();
    const { r } = await runCase(sock, chat, "bitcoin 1y", "bitcoin 1y");
    const img = sock.sent.find((s) => s.content.image);
    ok(!!img, "resolved by name and charted");
    if (img) {
      fs.writeFileSync(path.join(OUT, "btc_1y.png"), img.content.image);
      ok(/BTC-USD|Bitcoin/i.test(img.content.caption || ""), "caption names BTC-USD/Bitcoin");
    }
    const res = await stock.resolveSymbol("nvidia");
    ok(res && res.symbol === "NVDA", `company search "nvidia" -> NVDA (${res && res.symbol})`);
    const res2 = await stock.resolveSymbol("bitcoin");
    ok(res2 && res2.symbol === "BTC-USD", `"bitcoin" -> spot pair BTC-USD, not an ETF (${res2 && res2.symbol})`);
    const res3 = await stock.resolveSymbol("IBIT");
    ok(res3 && res3.symbol === "IBIT", "explicit ticker IBIT still exact-matches");
    const res4 = await stock.resolveSymbol("ethereum");
    ok(res4 && res4.symbol === "ETH-USD", `"ethereum" -> ETH-USD (${res4 && res4.symbol})`);
  }

  console.log("════ RUN 4: NVDA 5y (weekly aggregation path) ════");
  {
    const sock = mockSock();
    const { r } = await runCase(sock, chat, "NVDA 5y", "NVDA 5y");
    const img = sock.sent.find((s) => s.content.image);
    ok(!!img, "5y chart sent");
    if (img) fs.writeFileSync(path.join(OUT, "nvda_5y.png"), img.content.image);
    const q = await stock.fetchChart("NVDA", "5y");
    ok(q.series.length >= 100, `5y weekly candles (${q.series.length})`);
  }

  console.log("════ RUN 5: non-equity symbols (FX + futures) ════");
  {
    const sock = mockSock();
    const { r } = await runCase(sock, chat, "EURUSD=X 6m", "EURUSD=X 6m");
    ok(sock.sent.find((s) => s.content.image), "FX pair charted");
    if (sock.sent.find((s) => s.content.image)) fs.writeFileSync(path.join(OUT, "eurusd_6m.png"), sock.sent.find((s) => s.content.image).content.image);
    await sleep(400);
    const { r: r2 } = await runCase(sock, chat, "GC=F 1y", "GC=F 1y");
    ok(sock.sent.filter((s) => s.content.image).length === 2, "futures charted");
  }

  console.log("════ EDGE: invalid ticker / garbage name / missing args / bad range ════");
  {
    const sock = mockSock();
    const { r: e1 } = await runCase(sock, chat, "NOPE123 1m", "invalid ticker");
    ok(e1.message && (/No data|not found|delisted/i.test(e1.message)), `invalid ticker -> clean error (${(e1.message || "").slice(0, 60)})`);
    await sleep(400);
    const { r: e2 } = await runCase(sock, chat, "zzzz qqq wumpus", "garbage name");
    ok(e2.message && /resolve/i.test(e2.message), "garbage name -> resolve error");
    await sleep(400);
    const { r: e3 } = await runCase(sock, chat, "", "bare .j stock");
    ok(e3.message && /Real-world market/.test(e3.message), "bare -> usage card");
    await sleep(400);
    const { r: e4 } = await runCase(sock, chat, "AAPL 3h", "bad range token");
    ok(e4.handled, "bad range handled without crash (graceful)");
    // range alias parsing
    const p1 = stock.parseStockArgs("AAPL 1y");
    ok(p1.ticker === "AAPL" && p1.range === "1y" && p1.rangeExplicit, "alias 1y parsed");
    const p2 = stock.parseStockArgs("msft");
    ok(p2.ticker === "msft" && p2.range === "1m" && !p2.rangeExplicit, "default range 1m");
    // repeated calls (cache path) - 2nd must be fast
    const t0 = Date.now();
    await stock.fetchChart("AAPL", "1m");
    const dt = Date.now() - t0;
    ok(dt < 300, `cached quote returned in ${dt}ms`);
  }

  console.log(`\nSTOCK QA: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
