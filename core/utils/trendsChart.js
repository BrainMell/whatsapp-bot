// ============================================
// GOOGLE TRENDS (.j trends "kw1" "kw2" [range])
// Unofficial Trends endpoints driven through got-scraping (browser-like TLS
// fingerprint + header generation) - plain axios is 429-blocked here.
// Values are RELATIVE search interest (0-100) normalized within the query,
// exactly like trends.google.com displays them.
// Cache: node-cache 10 min per (keywords, range, geo).
// ============================================

const NodeCache = require("node-cache");
const { CookieJar } = require("tough-cookie");
const botConfig = require("../../botConfig");

const _cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
let _gotScraping = null; // lazily imported (ESM)

const TRENDS = "https://trends.google.com";
const GEO_DEFAULT = "";

// Verified time tokens (research 2026-09-25)
const RANGES = {
  "1h": { token: "now 1-H", label: "Past hour" },
  "4h": { token: "now 4-H", label: "Past 4 hours" },
  "1d": { token: "now 1-d", label: "Past day" },
  "7d": { token: "now 7-d", label: "Past 7 days" },
  "30d": { token: "today 1-m", label: "Past 30 days" },
  "90d": { token: "today 3-m", label: "Past 90 days" },
  "12m": { token: "today 12-m", label: "Past 12 months" },
  "5y": { token: "today 5-y", label: "Past 5 years" },
};
const RANGE_ALIASES = { "24h": "1d", "1w": "7d", week: "7d", "1m": "30d", month: "30d", "3m": "90d", "1y": "12m", year: "12m" };
const MAX_KEYWORDS = 5;

const SERIES_COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853", "#A142F4"];

function parseTrendsBody(body) {
  const idx = body.indexOf("{");
  if (idx < 0) throw new Error("no JSON in Trends response");
  return JSON.parse(body.slice(idx));
}

async function getGot() {
  if (!_gotScraping) ({ gotScraping: _gotScraping } = await import("got-scraping"));
  return _gotScraping;
}

const _genOpts = { browsers: [{ name: "chrome" }], devices: ["desktop"], locale: "en-US" };

async function _explore(cookieJar, keywords, timeToken, geo) {
  const got = await getGot();
  const req = {
    comparisonItem: keywords.map((kw) => ({ keyword: kw, time: timeToken, geo: geo || "" })),
    category: 0,
    property: "",
  };
  const r = await got({
    url: `${TRENDS}/trends/api/explore`,
    searchParams: { hl: "en-US", tz: 0, req: JSON.stringify(req) },
    responseType: "text",
    cookieJar,
    timeout: { request: 25000 },
    headerGeneratorOptions: _genOpts,
  });
  if (r.statusCode !== 200) throw Object.assign(new Error(`Trends explore failed (${r.statusCode})`), { code: "TRENDS_HTTP", status: r.statusCode });
  return parseTrendsBody(r.body);
}

async function _multiline(cookieJar, widget) {
  const got = await getGot();
  const r = await got({
    url: `${TRENDS}/trends/api/widgetdata/multiline`,
    searchParams: { hl: "en-US", tz: 0, req: JSON.stringify(widget.request), token: widget.token },
    responseType: "text",
    cookieJar,
    timeout: { request: 25000 },
    headerGeneratorOptions: _genOpts,
  });
  if (r.statusCode !== 200) throw Object.assign(new Error(`Trends data failed (${r.statusCode})`), { code: "TRENDS_HTTP" });
  return parseTrendsBody(r.body);
}

async function newSession() {
  const got = await getGot();
  const jar = new CookieJar();
  const pre = await got({
    url: `${TRENDS}/trends/explore?hl=en-US`,
    responseType: "text",
    cookieJar: jar,
    timeout: { request: 20000 },
    headerGeneratorOptions: _genOpts,
  });
  if (pre.statusCode !== 200) throw Object.assign(new Error(`Trends preflight failed (${pre.statusCode})`), { code: "TRENDS_HTTP", status: pre.statusCode });
  return jar;
}

// ── shared session + pacing (Google throttles rapid dances on one IP) ──
// The cookie jar is reused for 30 min (one preflight instead of one per
// lookup) and explores are globally spaced >= 1.3s apart.
// 💡 FIX 2026-09-25 (owner: ".j trends keeps saying try again in a couple of
// minutes"): datacenter IPs are 429-blocked by Google's TLS fingerprinting for
// HOURS, so the old flow burned the command budget on tier-1 retries + cooldowns
// before even starting the browser, and the browser fallback itself failed
// whenever the host had no Playwright browsers installed - which made the bot
// answer "try again" on EVERY call. Now: tier-1 is one fast attempt that gets
// disabled adaptively once this IP is known-burned; the real-browser fallback
// resolves bundled chromium -> system chrome candidates -> one background
// self-heal install; and errors tell the operator exactly what is missing.
let _jar = null;
let _jarTs = 0;
let _lastExplore = 0;
const JAR_TTL_MS = 30 * 60 * 1000;

async function _spaced() {
  const wait = _lastExplore + 1300 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastExplore = Date.now();
}

async function _getJar() {
  if (_jar && Date.now() - _jarTs < JAR_TTL_MS) return _jar;
  _jar = await newSession();
  _jarTs = Date.now();
  return _jar;
}
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// ── TIER 2: real-browser fallback ──
// Google 429-blocks datacenter TLS fingerprints for hours. A real headless
// Chromium navigates trends.google.com once, then the same explore/multiline
// calls run INSIDE the page (same-origin fetch -> genuine browser TLS +
// cookies). Launched lazily, closed after 5 idle minutes.
let _bp = null; // { browser, page, ts }
let _bpIdleTimer = null;
// adaptive tier-1 circuit breaker: after 2 consecutive throttles this IP is
// burned for ~30 min - go straight to the browser instead of wasting time
let _tier1Fails = 0;
let _tier1DisabledUntil = 0;
const TIER1_SKIP_MS = 30 * 60 * 1000;

function _scheduleBrowserIdleClose() {
  if (_bpIdleTimer) clearTimeout(_bpIdleTimer);
  _bpIdleTimer = setTimeout(async () => {
    if (_bp) { try { await _bp.browser.close(); } catch {} _bp = null; }
  }, 5 * 60 * 1000);
  if (_bpIdleTimer.unref) _bpIdleTimer.unref();
}

// one background `playwright install chromium` attempt per process when the
// bundled browser binary is missing (self-heal for fresh deploys)
let _selfHealStarted = false;
function _scheduleBrowserSelfHeal(reason) {
  if (_selfHealStarted) return;
  _selfHealStarted = true;
  try {
    const { spawn } = require("child_process");
    const child = spawn("npx", ["playwright", "install", "chromium"], {
      detached: true, stdio: "ignore", cwd: process.cwd(),
    });
    child.on("error", () => {});
    if (child.unref) child.unref();
    console.log(`[Trends] bundled Chromium unavailable (${reason}) - background self-heal started: npx playwright install chromium`);
  } catch (e) {
    console.log("[Trends] self-heal spawn failed:", e?.message);
  }
}

// system chrome candidates for hosts without the playwright download
const _SYSTEM_CHROMES = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
];

let _launchOptsCache = null;
async function _resolveLaunchOpts() {
  if (_launchOptsCache) return _launchOptsCache;
  const gfs = require("fs");
  const optsList = [];
  let bundledMissing = false;
  try {
    const { chromium } = require("playwright");
    const p = chromium.executablePath();
    if (p && gfs.existsSync(p)) optsList.push({});
    else bundledMissing = true;
  } catch (e) {
    bundledMissing = true;
  }
  for (const p of _SYSTEM_CHROMES) {
    if (gfs.existsSync(p)) optsList.push({ executablePath: p });
  }
  if (!optsList.length) {
    // let playwright attempt anyway (its error message is actionable)
    optsList.push({});
    if (bundledMissing) _scheduleBrowserSelfHeal("not downloaded on this host");
  }
  _launchOptsCache = optsList;
  return optsList;
}

async function _launchBrowser() {
  const { chromium } = require("playwright");
  const optsList = await _resolveLaunchOpts();
  let lastErr = null;
  for (const opts of optsList) {
    try {
      return await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        ...opts,
      });
    } catch (e) {
      lastErr = e;
      console.log("[Trends] browser launch failed", Object.keys(opts).length ? `(${opts.executablePath})` : "(bundled)", e?.message?.split("\n")[0]);
    }
  }
  throw Object.assign(
    new Error(`no usable Chromium on this host (${(lastErr?.message || "launch failed").split("\n")[0]}). Fix with: npx playwright install chromium`),
    { code: "TRENDS_NO_BROWSER" },
  );
}

async function _browserPage() {
  if (_bp && Date.now() - _bp.ts < 5 * 60 * 1000) {
    _bp.ts = Date.now();
    _scheduleBrowserIdleClose();
    return _bp.page;
  }
  if (_bp) { try { await _bp.browser.close(); } catch {} _bp = null; }
  const browser = await _launchBrowser();
  const page = await browser.newPage();
  await page.goto(`${TRENDS}/trends/explore?hl=en-US`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1800); // let consent/cookie bootstrapping settle
  // EU hosts may land on consent.google.com - accept once so /trends/api/*
  // same-origin fetches carry consent cookies (best-effort, no-op elsewhere)
  try {
    if (/consent\./.test(page.url() || "")) {
      await page.click('button:has-text("Accept all"), button:has-text("I agree"), button[jsname="bWV0Yg"]', { timeout: 5000 });
      await page.waitForTimeout(1500);
      console.log("[Trends] consent page accepted");
    }
  } catch { /* no consent wall - fine */ }
  _bp = { browser, page, ts: Date.now() };
  _scheduleBrowserIdleClose();
  return page;
}

async function _inPageJson(page, pathAndQuery) {
  return await page.evaluate(async (u) => {
    const res = await fetch(u, { headers: { accept: "application/json" } });
    return { status: res.status, body: await res.text() };
  }, pathAndQuery);
}

async function _browserTrends(keywords, timeToken, geo) {
  const req = {
    comparisonItem: keywords.map((kw) => ({ keyword: kw, time: timeToken, geo: geo || "" })),
    category: 0,
    property: "",
  };
  const exploreUrl = `/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(req))}`;
  let page = await _browserPage();
  let ex;
  try {
    ex = await _inPageJson(page, exploreUrl);
  } catch (e) {
    // dead page (navigated away / crashed): rebuild once
    _bp = null;
    page = await _browserPage();
    ex = await _inPageJson(page, exploreUrl);
  }
  if (ex.status === 429 || ex.status === 403) {
    // one gentle in-page retry (fresh page cookies, never hammer Google)
    await page.waitForTimeout(2500);
    ex = await _inPageJson(page, exploreUrl);
  }
  if (ex.status !== 200) throw Object.assign(new Error(`browser explore ${ex.status}`), { code: "TRENDS_HTTP", status: ex.status });
  const exploreData = parseTrendsBody(ex.body);
  const tsWidget = (exploreData.widgets || []).find((w) => w.id === "TIMESERIES");
  if (!tsWidget) throw Object.assign(new Error("no timeseries widget"), { code: "TRENDS_SHAPE" });
  const mlUrl = `/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(tsWidget.request))}&token=${encodeURIComponent(tsWidget.token)}`;
  let ml = await _inPageJson(page, mlUrl);
  if (ml.status === 429 || ml.status === 403) {
    await page.waitForTimeout(2500);
    ml = await _inPageJson(page, mlUrl);
  }
  if (ml.status !== 200) throw Object.assign(new Error(`browser multiline ${ml.status}`), { code: "TRENDS_HTTP", status: ml.status });
  return parseTrendsBody(ml.body);
}

// ── public data API ──
// returns { keywords, rangeKey, label, points: [{t, values[]}], max }
async function getTrends(keywords, rangeKey = "30d", geo = GEO_DEFAULT) {
  const ck = `trends:${geo || "W"}:${rangeKey}:${keywords.join("|").toLowerCase()}`;
  const hit = _cache.get(ck);
  if (hit) return hit;

  const timeToken = (RANGES[rangeKey] || RANGES["30d"]).token;
  let lastErr = null;

  // TIER 1: got-scraping (cheap path) - ONE attempt, skipped entirely while
  // this IP is in the adaptive cool-down. 429s no longer burn the command
  // budget: the browser fallback is the production path for burned IPs.
  if (Date.now() >= _tier1DisabledUntil) {
    try {
      const jar = await _getJar();
      await _spaced();
      const exploreData = await _explore(jar, keywords, timeToken, geo);
      const tsWidget = (exploreData.widgets || []).find((w) => w.id === "TIMESERIES");
      if (!tsWidget) throw Object.assign(new Error("no timeseries widget"), { code: "TRENDS_SHAPE" });
      const ml = await _multiline(jar, tsWidget);
      const tl = ml?.default?.timelineData || [];
      if (!tl.length) throw Object.assign(new Error("empty timeline"), { code: "TRENDS_EMPTY" });
      _tier1Fails = 0;
      return _buildOut(ck, keywords, rangeKey, tl);
    } catch (e) {
      lastErr = e;
      if (e.code === "TRENDS_EMPTY") throw e; // genuinely empty - no fallback needed
      if (e.status === 429 || e.status === 403 || e.code === "TRENDS_SHAPE") {
        _jar = null; // jar may be poisoned
        if (e.status === 429 || e.status === 403) {
          _tier1Fails++;
          if (_tier1Fails >= 2) _tier1DisabledUntil = Date.now() + TIER1_SKIP_MS;
        }
      }
      // other tier-1 errors fall through to the browser too
    }
  }

  // TIER 2: real browser (survives IP-level TLS throttling)
  for (let bAttempt = 0; bAttempt < 2; bAttempt++) {
    try {
      const ml = await _browserTrends(keywords, timeToken, geo);
      const tl = ml?.default?.timelineData || [];
      if (!tl.length) throw Object.assign(new Error("empty timeline"), { code: "TRENDS_EMPTY" });
      console.log("[Trends] served via browser fallback (tier-1 throttled)");
      return _buildOut(ck, keywords, rangeKey, tl);
    } catch (e2) {
      lastErr = e2;
      if (e2.code === "TRENDS_EMPTY") throw e2;
      if (e2.code === "TRENDS_NO_BROWSER") break; // nothing to retry with
      _bp = null; // rebuild browser on next attempt
      await sleepMs(1500);
    }
  }
  throw lastErr || new Error("Trends lookup failed");
}

function _buildOut(ck, keywords, rangeKey, tl) {
  // ⚠️ Google marks no-data points with value=100 + hasData=false (observed
  // on zero-interest keywords) - those MUST read as 0, otherwise a garbage
  // keyword renders a fake spike and dodges the all-zero guard.
  const points = tl.map((p) => ({
    t: (p.time || 0) * 1000,
    values: keywords.map((_, s) => {
      if (Array.isArray(p.hasData) && p.hasData[s] === false) return 0;
      return (p.value && p.value[s]) || 0;
    }),
  }));
  const max = Math.max(...points.flatMap((p) => p.values));
  const out = {
    keywords: [...keywords],
    rangeKey,
    label: (RANGES[rangeKey] || RANGES["30d"]).label,
    points,
    max,
    allZero: max === 0,
  };
  if (out.allZero) {
    // don't cache zero-results long - the keyword may just be too niche
    _cache.set(ck, out, 120);
  } else {
    _cache.set(ck, out);
  }
  return out;
}

// ── argument parsing ──
// supports: trends "one piece" "naruto" 12m | trends python java 90d | trends "dragon ball"
function parseTrendsArgs(raw) {
  let rest = String(raw || "").trim();
  const out = { keywords: [], range: "30d", error: null };
  if (!rest) return out;
  const rangeNames = { ...RANGES, ...Object.fromEntries(Object.entries(RANGE_ALIASES).map(([a, r]) => [a, RANGES[r]])) };
  // pop trailing range token (quoted or bare)
  const rangeMatch = rest.match(/\s+("([^"]+)"|(\S+))\s*$/);
  if (rangeMatch) {
    const cand = (rangeMatch[2] || rangeMatch[3] || "").toLowerCase();
    if (rangeNames[cand]) {
      out.range = RANGES[cand] ? cand : RANGE_ALIASES[cand];
      rest = rest.slice(0, rangeMatch.index).trim();
    }
  }
  // quoted keywords first
  const quoted = [...rest.matchAll(/"([^"]{1,80})"/g)].map((mm) => mm[1].trim()).filter(Boolean);
  let bare = rest;
  for (const q of quoted) {
    const i = bare.indexOf(`"${q}"`);
    if (i >= 0) bare = bare.slice(0, i) + bare.slice(i + q.length + 2);
  }
  const bareKws = bare.split(/\s+/).map((s) => s.replace(/[,]/g, "").trim()).filter(Boolean);
  const combined = [...quoted, ...bareKws];
  if (combined.length > MAX_KEYWORDS) out.error = `max ${MAX_KEYWORDS} keywords`;
  out.keywords = combined.slice(0, MAX_KEYWORDS);
  if (!out.keywords.length) out.error = "no keywords";
  return out;
}

// ════════════════════════════════════════════
// CHART (node-canvas multi-line, Google palette)
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
    console.log("[Trends] font registration failed:", e?.message);
    _fontsRegistered = true;
  }
}

const T = { bg: "#10131a", panel: "#141822", grid: "#212734", text: "#e8eaed", dim: "#9aa0a6" };

function _timeLabel(t, rangeKey) {
  const d = new Date(t);
  if (rangeKey === "1h" || rangeKey === "4h" || rangeKey === "1d") {
    return d.toLocaleString("en-US", { hour: "numeric", hour12: true }).replace(" ", "");
  }
  if (rangeKey === "12m" || rangeKey === "5y") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function renderTrendsChart(data) {
  ensureFonts();
  const { createCanvas } = require("canvas");
  const W = 1080, H = 680;
  const PAD = { l: 64, r: 36, t: 128, b: 112 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const pts = data.points;
  const n = pts.length;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  // header
  const headGrad = ctx.createLinearGradient(0, 0, 0, PAD.t);
  headGrad.addColorStop(0, "#171c28");
  headGrad.addColorStop(1, T.bg);
  ctx.fillStyle = headGrad;
  ctx.fillRect(0, 0, W, PAD.t);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px 'DejaVu Sans'";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const kws = data.keywords;
  const title = kws.length === 1 ? `"${kws[0]}"` : kws.length === 2 ? `"${kws[0]}" vs "${kws[1]}"` : `"${kws[0]}" + ${kws.length - 1} more`;
  ctx.fillText(`Google Trends: ${title}`, PAD.l - 26, 46);
  ctx.fillStyle = T.dim;
  ctx.font = "16px 'DejaVu Sans'";
  ctx.fillText(`${data.label}  •  ${n} data points  •  relative search interest (0-100)`, PAD.l - 26, 74);

  // grid + y axis
  ctx.strokeStyle = T.grid;
  ctx.lineWidth = 1;
  ctx.font = "13px 'DejaVu Mono'";
  ctx.fillStyle = T.dim;
  for (let v = 0; v <= 100; v += 25) {
    const yv = PAD.t + (100 - v) / 100 * chartH;
    ctx.beginPath(); ctx.moveTo(PAD.l, Math.round(yv) + 0.5); ctx.lineTo(W - PAD.r, Math.round(yv) + 0.5); ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(String(v), PAD.l - 10, yv + 4);
  }

  // x scale + vertical grid
  const x = (i) => PAD.l + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  ctx.textAlign = "center";
  const tickCount = Math.min(7, Math.max(3, Math.floor(chartW / 150)));
  for (let k = 0; k < tickCount; k++) {
    const i = Math.floor((k * (n - 1)) / Math.max(1, tickCount - 1));
    const tx = Math.round(x(i)) + 0.5;
    ctx.strokeStyle = T.grid;
    ctx.beginPath(); ctx.moveTo(tx, PAD.t); ctx.lineTo(tx, PAD.t + chartH); ctx.stroke();
    ctx.fillStyle = T.dim;
    ctx.fillText(_timeLabel(pts[i].t, data.rangeKey), tx, PAD.t + chartH + 24);
  }

  // series
  for (let s = 0; s < kws.length; s++) {
    const color = SERIES_COLORS[s % SERIES_COLORS.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = pts[i].values[s] ?? 0;
      const yv = PAD.t + (100 - Math.min(v, 100)) / 100 * chartH;
      if (!started) { ctx.moveTo(x(i), yv); started = true; }
      else ctx.lineTo(x(i), yv);
    }
    ctx.stroke();
    // soft fill under line
    ctx.globalAlpha = 0.08;
    ctx.lineTo(x(n - 1), PAD.t + chartH);
    ctx.lineTo(x(0), PAD.t + chartH);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // legend
  ctx.textAlign = "left";
  ctx.font = "15px 'DejaVu Sans'";
  let lx = PAD.l;
  let ly = PAD.t + chartH + 48;
  for (let s = 0; s < kws.length; s++) {
    const color = SERIES_COLORS[s % SERIES_COLORS.length];
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly - 12, 26, 5);
    ctx.fillStyle = T.text;
    const label = `"${kws[s]}"`;
    ctx.fillText(label, lx + 34, ly - 2);
    lx += 34 + ctx.measureText(label).width + 30;
    if (lx > W - 220) { lx = PAD.l; ly += 26; }
  }

  // footer
  ctx.fillStyle = T.dim;
  ctx.font = "12.5px 'DejaVu Sans'";
  ctx.fillText("Values are relative search interest (0-100), normalized within this comparison - not absolute search counts.", PAD.l - 26, H - 26);
  ctx.fillText("Source: Google Trends (trends.google.com)", PAD.l - 26, H - 10);
  ctx.textAlign = "right";
  ctx.fillText("j trends", W - PAD.r, H - 10);

  return canvas.toBuffer("image/png");
}

function formatTrendsCaption(data) {
  const kws = data.keywords;
  const lastIdx = data.points.length - 1;
  const avgOf = (s) => {
    const vals = data.points.map((p) => p.values[s] ?? 0);
    return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  };
  const peakOf = (s) => {
    let best = { v: -1, i: 0 };
    data.points.forEach((p, i) => { if ((p.values[s] ?? 0) > best.v) best = { v: p.values[s] ?? 0, i }; });
    return best;
  };
  let out = `📊 *Google Trends - ${data.label}*\n\n`;
  const ranks = kws.map((k, s) => ({ k, avg: avgOf(s), last: data.points[lastIdx].values[s] ?? 0 })).sort((a, b) => b.avg - a.avg);
  ranks.forEach((r, i) => {
    out += `${["🥇", "🥈", "🥉"][i] || "•"} "${r.k}" - avg ${r.avg.toFixed(0)}, now ${r.last}/100\n`;
  });
  out += `\n`;
  kws.forEach((k, s) => {
    const peak = peakOf(s);
    if (peak.v > 0) out += `• "${k}" peaked at ${peak.v}/100 (${_timeLabel(data.points[peak.i].t, data.rangeKey)})\n`;
  });
  out += `\n_Relative search interest 0-100 (normalized within this comparison), not absolute search counts._\n`;
  out += `_Compare more: \`${botConfig.getPrefix()} trends "kw1" "kw2" 90d\`_`;
  return out;
}

// ════════════════════════════════════════════
// COMMAND SURFACE
// ════════════════════════════════════════════

async function handleTrends(sock, chatId, senderJid, botMarker, m, rawArgs) {
  const prefix = botConfig.getPrefix();
  if (!String(rawArgs || "").trim()) {
    const ranges = Object.keys(RANGES).join(" • ");
    return {
      handled: true,
      message: botMarker + `📊 *Google Trends lookup*

\`${prefix} trends "Dragon Ball"\`
\`${prefix} trends "Dragon Ball" 30d\`
\`${prefix} trends "Dragon Ball" "Naruto" 90d\`
\`${prefix} trends "Python" "Java" "C#" 12m\`

Ranges: ${ranges} (default 30d)
Up to ${MAX_KEYWORDS} keywords compared in one graph.

_Google Trends values are RELATIVE search interest, not absolute search counts._`,
    };
  }
  const parsed = parseTrendsArgs(rawArgs);
  if (parsed.error) {
    // "no keywords" only happens when rawArgs was quotes/symbols only
    return { handled: true, message: botMarker + `❌ ${parsed.error === "no keywords" ? `Tell me what to look up, e.g. \`${prefix} trends "Dragon Ball"\`` : `Google Trends compares at most ${MAX_KEYWORDS} keywords at once.`}` };
  }

  try {
    const data = await getTrends(parsed.keywords, parsed.range);
    if (data.allZero) {
      return {
        handled: true,
        message: botMarker + `🤷 No meaningful search interest found for ${parsed.keywords.map((k) => `"${k}"`).join(", ")} in the ${data.label.toLowerCase()}. Try a broader spelling or a longer range.`,
      };
    }
    const img = await renderTrendsChart(data);
    const caption = botMarker + formatTrendsCaption(data);
    await sock.sendMessage(chatId, { image: img, caption }, { quoted: m });
    return { handled: true, silent: true };
  } catch (e) {
    console.log("[Trends] lookup failed:", e?.message);
    // both real-world "no data" shapes: empty timeline AND all-zero values
    if (e.code === "TRENDS_EMPTY") {
      return { handled: true, message: botMarker + `🤷 No meaningful search interest found for ${parsed.keywords.map((k) => `"${k}"`).join(", ")} in the ${(RANGES[parsed.range] || RANGES["30d"]).label.toLowerCase()}. Try a broader spelling or a longer range.` };
    }
    const reason = e.code === "TRENDS_NO_BROWSER"
      ? "the browser fallback is unavailable on the bot host - the operator needs to run `npx playwright install chromium` once"
      : e.code === "TRENDS_HTTP"
        ? `Google is throttling this server (HTTP ${e.status || "?"})`
        : `unexpected error (${e.code || e.message?.slice(0, 60) || "unknown"})`;
    return { handled: true, message: botMarker + `⚠️ Google Trends could not be reached right now - ${reason}. Try again in a few minutes.` };
  }
}

module.exports = {
  handleTrends,
  parseTrendsArgs,
  getTrends,
  renderTrendsChart,
  formatTrendsCaption,
  RANGES,
  _internal: { parseTrendsBody, _cache, SERIES_COLORS, MAX_KEYWORDS, _browserTrends, _launchBrowser, _resolveLaunchOpts, getTier1State: () => ({ fails: _tier1Fails, disabledUntil: _tier1DisabledUntil }) },
};
