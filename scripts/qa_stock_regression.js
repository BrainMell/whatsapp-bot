// qa_stock_regression.js — spec section 19: prove .j stock still works after
// the trends/quiz changes. Real Yahoo Finance lookups + real chart PNGs through
// the ACTUAL handleStock command path (mock socket like production engine).
"use strict";
process.env.NODE_ENV = process.env.NODE_ENV || "test";
const stock = require("/home/z/my-project/whatsapp-bot/core/utils/stockChart");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  ok -", l); } else { fail++; console.log("  FAIL -", l); } };
const MARK = "\u200B";

function makeMockSock() {
  const sent = [];
  return {
    sent, user: { id: "bot@s.whatsapp.net" },
    sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return {}; },
  };
}

const CASES = [
  { args: "SONY 1d", label: "SONY 1d (equity)" },
  { args: '"Sony Group" 1m', label: '"Sony Group" 1m (company-name resolution)' },
  { args: "BTC-USD 6m", label: "BTC-USD 6m (crypto)" },
  { args: "EURUSD=X 1y", label: "EURUSD=X 1y (fx)" },
  { args: "AAPL 5y", label: "AAPL 5y (long range)" },
];

(async () => {
  for (const c of CASES) {
    const sock = makeMockSock();
    const t0 = Date.now();
    const r = await stock.handleStock(sock, "st@g.us", "u@s.w", MARK, { key: { id: "S" } }, c.args);
    const img = sock.sent.find((s) => s.content && s.content.image);
    ok(!!img && Buffer.isBuffer(img.content.image) && img.content.image.length > 8000, `${c.label}: chart PNG sent (${img ? Math.round(img.content.image.length / 1024) + "KB" : "none"}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (img) {
      const b = img.content.image;
      ok(b[0] === 0x89 && b[1] === 0x50, `${c.label}: real PNG payload`);
      ok((img.content.caption || "").length > 10, `${c.label}: caption present`);
    } else {
      ok(false, `${c.label}: no graph - got: ${(r.message || "").slice(0, 100)}`);
    }
  }
  // invalid ticker must produce a clean message, never a crash
  const sock2 = makeMockSock();
  const r2 = await stock.handleStock(sock2, "st@g.us", "u@s.w", MARK, { key: { id: "S2" } }, "ZZZZINVALIDTICKER123 1d");
  ok(r2.message && /❌|not|No /i.test(r2.message), "invalid ticker handled gracefully");
  console.log(`\nSTOCK REGRESSION: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
