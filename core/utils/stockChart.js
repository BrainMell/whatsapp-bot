// ============================================
// REAL-WORLD STOCK CHART (.j stock <ticker> [range])
// Data: Yahoo Finance v8 chart API + v1 search (no key needed).
// Chart: node-canvas candlestick + volume, TradingView-style dark theme.
// Cache: node-cache 60s quotes / 6h symbol resolutions.
// ============================================

const axios = require("axios");
const NodeCache = require("node-cache");
const botConfig = require("../../botConfig");

const _quoteCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
const _searchCache = new NodeCache({ stdTTL: 6 * 3600, checkperiod: 600 });

// family:4 - this box resolves AAAA first and Node's auto-select aborts the
// IPv4 attempt at 250ms while some hosts need ~280ms (see research notes).
const _http = axios.create({
  timeout: 15000,
  family: 4,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "application/json",
  },
});

// Verified-working range/interval pairs (research script, 2026-09-25)
const RANGES = {
  "1d": { range: "1d", interval: "5m" },
  "5d": { range: "5d", interval: "15m" },
  "1m": { range: "1mo", interval: "1d" },
  "6m": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
  "5y": { range: "5y", interval: "1wk" },
};
const RANGE_ALIASES = { "1day": "1d", day: "1d", "1week": "5d", week: "5d", "1month": "1m", month: "1m", "6month": "6m", "1year": "1y", year: "1y", "5year": "5y", max: "5y" };

// ── symbol resolution ──
// Crypto pairs outrank ETFs/futures: "bitcoin" must hit BTC-USD (the actual
// asset), not an ETF that tracks it. Exact symbol matches bypass ranking.
const _TYPE_RANK = { CRYPTOCURRENCY: 0, EQUITY: 1, ETF: 2, CURRENCY: 3, INDEX: 4, FUTURE: 5, MUTUALFUND: 6 };

async function resolveSymbol(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const cached = _searchCache.get(`sym:${upper}`);
  if (cached) return cached;
  try {
    const r = await _http.get("https://query2.finance.yahoo.com/v1/finance/search", {
      params: { q: raw, quotesCount: 8, newsCount: 0 },
    });
    const quotes = (r.data?.quotes || []).filter((x) => x.symbol);
    if (!quotes.length) return null;
    const exact = quotes.find((x) => x.symbol.toUpperCase() === upper);
    let pick = exact;
    if (!pick) {
      const ranked = [...quotes].sort((a, b) => {
        const ra = _TYPE_RANK[a.quoteType] ?? 9;
        const rb = _TYPE_RANK[b.quoteType] ?? 9;
        if (ra !== rb) return ra - rb;
        return (b.isYahooFinance ? 1 : 0) - (a.isYahooFinance ? 1 : 0);
      });
      pick = ranked[0];
    }
    const out = pick ? { symbol: pick.symbol, name: pick.shortname || pick.longname || pick.symbol, type: pick.quoteType || "EQUITY", exchange: pick.exchDisp || pick.exchange || "" } : null;
    if (out) _searchCache.set(`sym:${upper}`, out);
    return out;
  } catch {
    return null; // search down: let the chart API try the raw symbol anyway
  }
}

// ── chart data ──
async function fetchChart(symbol, rangeKey) {
  const cfg = RANGES[rangeKey] || RANGES["1m"];
  const ck = `chart:${symbol.toUpperCase()}:${rangeKey}`;
  const hit = _quoteCache.get(ck);
  if (hit) return hit;
  const r = await _http.get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
    { params: { range: cfg.range, interval: cfg.interval, includePrePost: false, events: "div,splits" } },
  );
  const res = r.data?.chart?.result?.[0];
  if (!res) {
    const desc = r.data?.chart?.error?.description || "no data for this symbol";
    const err = new Error(desc);
    err.code = "YF_NO_DATA";
    throw err;
  }
  const m = res.meta || {};
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const series = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (c == null) continue; // skip null candles (halts etc.)
    series.push({ t: ts[i] * 1000, o: o ?? c, h: h ?? c, l: l ?? c, c, v: v ?? 0 });
  }
  if (!series.length) {
    const err = new Error("the API returned an empty series for this period");
    err.code = "YF_NO_DATA";
    throw err;
  }
  const out = {
    symbol: m.symbol || symbol,
    name: m.longName || m.shortName || m.symbol || symbol,
    exchange: m.fullExchangeName || m.exchangeName || "",
    currency: m.currency || "USD",
    regularPrice: m.regularMarketPrice ?? series[series.length - 1].c,
    prevClose: m.chartPreviousClose ?? m.previousClose ?? series[0].o,
    rangeKey,
    rangeLabel: cfg.range,
    interval: cfg.interval,
    series,
  };
  _quoteCache.set(ck, out);
  return out;
}

// ── formatting helpers ──
function fmtPrice(v, currency) {
  const n = Number(v) || 0;
  if (n === 0) return (currency === "USD" ? "$" : `${currency} `) + "0.00";
  const digits = n >= 1000 ? 2 : n >= 1 ? 2 : 6;
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "JPY" ? "¥" : `${currency} `;
  return sym + n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtVol(v) {
  if (!v) return "0";
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(v);
}

// ════════════════════════════════════════════
// CHART (node-canvas, TradingView-ish dark theme)
// ════════════════════════════════════════════

const FONT_DIR = "/usr/share/fonts/truetype/dejavu";
let _fontsRegistered = false;
function ensureFonts() {
  if (_fontsRegistered) return;
  try {
    const canvas = require("canvas");
    canvas.registerFont(`${FONT_DIR}/DejaVuSans.ttf`, { family: "DejaVu Sans" });
    canvas.registerFont(`${FONT_DIR}/DejaVuSans-Bold.ttf`, { family: "DejaVu Sans", weight: "bold" });
    canvas.registerFont(`${FONT_DIR}/DejaVuSansMono.ttf`, { family: "DejaVu Mono" });
    _fontsRegistered = true;
  } catch (e) {
    console.log("[Stock] font registration failed:", e?.message);
    _fontsRegistered = true; // don't retry every call
  }
}

const C = {
  bg: "#0e1116", panel: "#131722", grid: "#1e222d", gridStrong: "#2a2e39",
  text: "#d1d4dc", dim: "#787b86", green: "#26a69a", red: "#ef5350",
  greenFill: "rgba(38,166,154,0.85)", redFill: "rgba(239,83,80,0.85)",
  prevLine: "#f0b90b", priceTag: "#2962ff",
};

function _axisTicks(lo, hi, n) {
  const span = hi - lo;
  if (span <= 0) return { ticks: [lo], step: 1 };
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : norm >= 1 ? 1 : 0.5) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return { ticks: out, step };
}

// axis label with enough decimals to distinguish consecutive ticks
function _axisLabel(v, currency, step) {
  const decimals = step >= 1 ? 2 : Math.min(6, Math.max(2, Math.ceil(-Math.log10(step)) + 1));
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "JPY" ? "¥" : `${currency} `;
  return sym + (Number(v) || 0).toFixed(decimals);
}

function _timeTickLabel(t, rangeKey) {
  const d = new Date(t);
  if (rangeKey === "1d" || rangeKey === "5d") {
    return d.toLocaleString("en-US", { hour: "numeric", hour12: true, timeZone: "America/New_York" }).replace(" ", "");
  }
  if (rangeKey === "5y") return String(d.getFullYear());
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

async function renderStockChart(quote) {
  ensureFonts();
  const { createCanvas } = require("canvas");

  const W = 1080, H = 660;
  const PAD = { l: 18, r: 86, t: 108, b: 64 };
  const chartW = W - PAD.l - PAD.r;
  const volH = 70;
  const chartH = H - PAD.t - PAD.b - volH - 14;

  const series = quote.series.length > 320
    ? quote.series.filter((_, i) => i % Math.ceil(quote.series.length / 320) === 0 || i === quote.series.length - 1)
    : quote.series;

  const closes = series.map((s) => s.c);
  let hi = Math.max(...series.map((s) => s.h));
  let lo = Math.min(...series.map((s) => s.l));
  const prev = quote.prevClose;
  hi = Math.max(hi, prev); lo = Math.min(lo, prev);
  const padY = (hi - lo) * 0.06 || hi * 0.01;
  hi += padY; lo -= padY;
  const volMax = Math.max(...series.map((s) => s.v), 1);

  const last = quote.regularPrice ?? closes[closes.length - 1];
  const change = last - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  const up = change >= 0;

  const x = (i) => PAD.l + ((i + 0.5) / series.length) * chartW;
  const candleW = Math.max(1.5, (chartW / series.length) * 0.62);
  const y = (v) => PAD.t + (hi - v) / (hi - lo) * chartH;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // header panel
  const grad = ctx.createLinearGradient(0, 0, 0, PAD.t + 20);
  grad.addColorStop(0, "#161b26");
  grad.addColorStop(1, C.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, PAD.t + 20);

  // ── header text ──
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px 'DejaVu Sans'";
  ctx.fillText(`${quote.name}`, PAD.l, 44);
  ctx.fillStyle = C.dim;
  ctx.font = "15px 'DejaVu Sans'";
  const metaBits = [quote.symbol, quote.exchange, `${quote.series.length} x ${quote.interval} candles`].filter(Boolean).join("  •  ");
  ctx.fillText(metaBits, PAD.l, 68);

  // price + change
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px 'DejaVu Sans'";
  const priceStr = fmtPrice(last, quote.currency);
  ctx.fillText(priceStr, PAD.l, 104);
  const pw = ctx.measureText(priceStr).width;
  ctx.font = "bold 20px 'DejaVu Sans'";
  ctx.fillStyle = up ? C.green : C.red;
  const chgStr = `${up ? "+" : "-"}${Math.abs(change).toFixed(2)} (${up ? "+" : "-"}${Math.abs(changePct).toFixed(2)}%)`;
  ctx.fillText(chgStr, PAD.l + pw + 16, 102);
  const cw = ctx.measureText(chgStr).width; // measured with the SAME (20px) font
  ctx.fillStyle = C.dim;
  ctx.font = "13px 'DejaVu Sans'";
  const rangeNames = { "1d": "Past day", "5d": "Past 5 days", "1m": "Past month", "6m": "Past 6 months", "1y": "Past year", "5y": "Past 5 years" };
  ctx.fillText(`${rangeNames[quote.rangeKey] || quote.rangeKey} • prev close ${fmtPrice(prev, quote.currency)}`, PAD.l + pw + 16 + cw + 24, 102);

  // ── grid + price axis (right) ──
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.dim;
  ctx.font = "13px 'DejaVu Mono'";
  ctx.lineWidth = 1;
  const ticks = _axisTicks(lo, hi, 6);
  for (const tv of ticks.ticks) {
    const ty = Math.round(y(tv)) + 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.l, ty); ctx.lineTo(W - PAD.r, ty); ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText(_axisLabel(tv, quote.currency, ticks.step), W - PAD.r + 8, ty + 4);
  }

  // ── prev close dashed line ──
  const py = Math.round(y(prev)) + 0.5;
  ctx.save();
  ctx.strokeStyle = C.prevLine;
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(PAD.l, py); ctx.lineTo(W - PAD.r, py); ctx.stroke();
  ctx.restore();

  // ── candles ──
  const minBody = 1;
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const cx = Math.round(x(i)) + 0.5;
    const isUp = s.c >= s.o;
    const col = isUp ? C.greenFill : C.redFill;
    // wick
    ctx.strokeStyle = isUp ? C.green : C.red;
    ctx.lineWidth = Math.max(1, candleW * 0.18);
    ctx.beginPath(); ctx.moveTo(cx, y(s.h)); ctx.lineTo(cx, y(s.l)); ctx.stroke();
    // body
    const yO = y(s.o), yC = y(s.c);
    const top = Math.min(yO, yC);
    const hgt = Math.max(minBody, Math.abs(yC - yO));
    ctx.fillStyle = col;
    ctx.fillRect(cx - candleW / 2, top, candleW, hgt);
  }

  // ── volume bars ──
  const volTop = PAD.t + chartH + 14;
  const bw = chartW / series.length;
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const isUp = s.c >= s.o;
    ctx.fillStyle = isUp ? "rgba(38,166,154,0.45)" : "rgba(239,83,80,0.45)";
    const vh = (s.v / volMax) * volH;
    ctx.fillRect(PAD.l + i * bw, volTop + volH - vh, Math.max(1, bw * 0.72), vh);
  }
  ctx.fillStyle = C.dim;
  ctx.font = "12px 'DejaVu Sans'";
  ctx.textAlign = "left";
  ctx.fillText(`Volume (max ${fmtVol(volMax)})`, PAD.l + 4, volTop + 14);

  // ── time axis ──
  ctx.fillStyle = C.dim;
  ctx.font = "12px 'DejaVu Mono'";
  ctx.textAlign = "center";
  const tickCount = Math.min(8, Math.max(3, Math.floor(chartW / 130)));
  const tickIdx = [];
  for (let i = 0; i < tickCount; i++) tickIdx.push(Math.floor((i * (series.length - 1)) / Math.max(1, tickCount - 1)));
  let prevLabel = null;
  for (const i of [...new Set(tickIdx)]) {
    const tx = x(i);
    const lbl = _timeTickLabel(series[i].t, quote.rangeKey);
    if (lbl !== prevLabel) {
      // dedupe repeated labels (e.g. same year on adjacent weekly ticks)
      ctx.textAlign = "center";
      ctx.fillText(lbl, tx, volTop + volH + 18);
      prevLabel = lbl;
    }
    ctx.strokeStyle = C.grid;
    ctx.beginPath(); ctx.moveTo(Math.round(tx) + 0.5, PAD.t); ctx.lineTo(Math.round(tx) + 0.5, volTop + volH); ctx.stroke();
  }

  // ── last price tag ──
  const ly = y(last);
  ctx.fillStyle = C.priceTag;
  ctx.fillRect(W - PAD.r + 2, ly - 11, PAD.r - 6, 22);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px 'DejaVu Mono'";
  ctx.textAlign = "left";
  ctx.fillText(fmtPrice(last, quote.currency), W - PAD.r + 8, ly + 4);

  // ── footer ──
  ctx.fillStyle = C.dim;
  ctx.font = "12px 'DejaVu Sans'";
  ctx.textAlign = "left";
  const genAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  ctx.fillText(`Source: Yahoo Finance  •  generated ${genAt}  •  ${quote.currency}`, PAD.l, H - 10);
  ctx.textAlign = "right";
  ctx.fillText("j stock", W - PAD.l, H - 10);

  return canvas.toBuffer("image/png");
}

function formatQuoteCaption(quote) {
  const last = quote.regularPrice ?? quote.series[quote.series.length - 1].c;
  const prev = quote.prevClose;
  const change = last - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  const up = change >= 0;
  const s = quote.series;
  const hi52 = Math.max(...s.map((r) => r.h));
  const lo52 = Math.min(...s.map((r) => r.l));
  const rangeNames = { "1d": "Past day", "5d": "Past 5 days", "1m": "Past month", "6m": "Past 6 months", "1y": "Past year", "5y": "Past 5 years" };
  let out = `📈 *${quote.name}* (${quote.symbol})\n`;
  out += `${up ? "🟢" : "🔴"} *${fmtPrice(last, quote.currency)}*  ${up ? "+" : "-"}${Math.abs(change).toFixed(2)} (${up ? "+" : "-"}${Math.abs(changePct).toFixed(2)}%)\n\n`;
  out += `• Period: ${rangeNames[quote.rangeKey] || quote.rangeKey} (${quote.interval} candles)\n`;
  out += `• Prev close: ${fmtPrice(prev, quote.currency)}\n`;
  out += `• Period range: ${fmtPrice(lo52, quote.currency)} - ${fmtPrice(hi52, quote.currency)}\n`;
  out += `• Last volume: ${fmtVol(s[s.length - 1].v)}\n`;
  out += `• Exchange: ${quote.exchange || "?"} • ${quote.currency}\n\n`;
  out += `_Live data via Yahoo Finance. Use \`${botConfig.getPrefix()} stock <ticker> 1d|5d|1m|6m|1y|5y\` for other periods._`;
  return out;
}

// ════════════════════════════════════════════
// COMMAND SURFACE
// ════════════════════════════════════════════

function parseStockArgs(raw) {
  // ".j stock", ".j stock AAPL 6m", ".j stock apple", ".j stock btc-usd 1y"
  const tokens = String(raw || "").trim().split(/\s+/).filter(Boolean);
  const out = { ticker: "", range: "1m", rangeExplicit: false };
  if (tokens.length && (RANGES[tokens[tokens.length - 1].toLowerCase()] || RANGE_ALIASES[tokens[tokens.length - 1].toLowerCase()])) {
    out.range = RANGES[tokens[tokens.length - 1].toLowerCase()] ? tokens[tokens.length - 1].toLowerCase() : RANGE_ALIASES[tokens[tokens.length - 1].toLowerCase()];
    out.rangeExplicit = true;
    tokens.pop();
  }
  out.ticker = tokens.join(" ").trim();
  return out;
}

async function handleStock(sock, chatId, senderJid, botMarker, m, rawArgs) {
  const prefix = botConfig.getPrefix();
  const parsed = parseStockArgs(rawArgs);
  if (!parsed.ticker) {
    return {
      handled: true,
      message: botMarker + `📈 *Real-world market lookup*

\`${prefix} stock AAPL\` - Apple, past month
\`${prefix} stock TSLA 1d\` - Tesla, past day (5m candles)
\`${prefix} stock NVDA 5y\` - Nvidia, 5 years
\`${prefix} stock "bitcoin" 1y\` - resolves names too

Ranges: 1d • 5d • 1m • 6m • 1y • 5y (default 1m)
Works with stocks, ETFs, crypto (BTC-USD), FX (EURUSD=X), futures (GC=F).

_The in-game market is separate: \`${prefix} stocks\`_`,
    };
  }

  // Resolution order: search FIRST (cheap + 6h-cached; handles names AND
  // abbreviations), then raw-symbol fallback for symbol-shaped input that
  // search doesn't know (new/OTC listings). Spaces => never a raw symbol.
  const resolved = await resolveSymbol(parsed.ticker);
  if (!resolved) {
    const symbolLike = /^[\w.\-=^]{1,12}$/.test(parsed.ticker);
    if (!symbolLike) {
      return { handled: true, message: botMarker + `❌ Couldn't resolve "${parsed.ticker}" to a ticker. Try the symbol directly, e.g. \`${prefix} stock AAPL\`.` };
    }
    // fall through with the raw symbol; fetchChart will 404 cleanly if bogus
    return await postChart(sock, chatId, botMarker, m, { symbol: parsed.ticker.toUpperCase(), name: parsed.ticker.toUpperCase() }, parsed);
  }
  return await postChart(sock, chatId, botMarker, m, resolved, parsed);
}

async function postChart(sock, chatId, botMarker, m, resolved, parsed) {
  const prefix = botConfig.getPrefix();
  try {
    const quote = await fetchChart(resolved.symbol, parsed.range);
    quote.name = resolved.name && resolved.name !== resolved.symbol ? resolved.name : quote.name;
    const img = await renderStockChart(quote);
    const caption = botMarker + formatQuoteCaption(quote);
    await sock.sendMessage(chatId, { image: img, caption }, { quoted: m });
    return { handled: true, silent: true };
  } catch (e) {
    if (e.code === "YF_NO_DATA") {
      return { handled: true, message: botMarker + `❌ No data for *${resolved.symbol}* (${parsed.range}): ${e.message}.` };
    }
    if (e.response?.status === 404) {
      return { handled: true, message: botMarker + `❌ *${resolved.symbol}* not found or delisted. Check the ticker and try again.` };
    }
    console.log("[Stock] lookup failed:", e?.message);
    return { handled: true, message: botMarker + `⚠️ Market data service error (${e.code || e.response?.status || "timeout"}). Try again shortly.` };
  }
}

module.exports = {
  handleStock,
  parseStockArgs,
  resolveSymbol,
  fetchChart,
  renderStockChart,
  formatQuoteCaption,
  RANGES,
  _internal: { fmtPrice, fmtVol, _axisTicks, _quoteCache, _searchCache },
};
