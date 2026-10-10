#!/usr/bin/env node
/**
 * logo_tier_classify.js — group all logoDataset brands into easy/medium/hard
 * by how likely an average person is to recognise them (owner 2026-10-10:
 * "Group the logos into the easy medium and hard, with which is more likely
 * to be known, brands and what not").
 *
 * Signals (all keyless):
 *   pv90 — enwiki pageviews, sum of the last 3 available MONTHS (REST
 *          per-article, monthly, globally paced at ~1 req/s — the per-IP
 *          adaptive limiter punishes bursts, verified 200s at 1 req/s).
 *   sl   — Wikidata sitelinks = number of language editions covering the
 *          brand = global (not just anglo) recognition.
 * MEGA  — curated household-name safety net so Coke/Nike/Apple can never
 *         land below easy even if their signals dip.
 *
 * Usage:
 *   node logo_tier_classify.js            # dry run: collect + report only
 *   node logo_tier_classify.js --apply    # also write tiers into data/logoDataset.json
 * Checkpoint: scripts/tier_ckpt.json (resume-safe, per-brand).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPO = "/home/ubuntu/whatsapp-bot";
const DS_PATH = path.join(REPO, "data", "logoDataset.json");
const CKPT = path.join(__dirname, "tier_ckpt.json");
const REPORT = path.join(__dirname, "logoDataset.tiers.report.txt");
const UA = "wa-quiz-logo-tiers/1.0 (bot ops; contact: owner)";
const APPLY = process.argv.includes("--apply");
const end = new Date(Date.now() - 86400e3);
const fmt = (d) => d.toISOString().slice(0, 10);

// ── curated household names (norm: lowercase a-z0-9) — forced EASY ──
// Safety net so the most famous brands can never rank below easy even if
// their pageviews/sitelinks dip. Everything not listed here is judged purely
// by its signals.
const MEGA = new Set([
  // food & drink
  "cocacola", "pepsi", "mcdonalds", "burgerking", "kfc", "subway", "starbucks", "dominos", "pizzahut",
  "nestle", "oreo", "kitkat", "snickers", "mars", "pringles", "lays", "doritos", "fanta", "sprite", "drpepper",
  "redbull", "monsterenergy", "budweiser", "heineken", "corona", "jackdaniels", "johnniewalker", "smirnoff",
  "nutella", "ferrero", "toblerone", "lindt", "hersheys", "milka", "twix", "skittles", "haribo", "chupa",
  "kelloggs", "heinz", "danone", "quaker",
  // fashion & retail
  "nike", "adidas", "puma", "reebok", "newbalance", "underarmour", "vans", "converse", "crocs",
  "zara", "hm", "gucci", "louisvuitton", "chanel", "prada", "versace", "burberry", "dior", "rolex",
  "cartier", "tiffany", "swatch", "seiko", "casio", "rayban", "oakley", "levis", "ralphlauren",
  "calvinklein", "tommyhilfiger", "lacoste", "thenorthface", "decathlon", "ikea", "walmart", "target",
  "costco", "tesco", "aldi", "lidl", "carrefour", "macys",
  // consumer care
  "unilever", "proctergamble", "johnsonjohnson", "colgate", "gillette", "nivea", "loreal", "maybelline",
  "garnier", "dove", "vaseline", "dettol", "pantene", "headshoulders", "sunsilk", "listerine", "sensodyne",
  "clorox", "wrigley",
  // tech & internet
  "apple", "google", "android", "microsoft", "windows", "amazon", "meta", "facebook", "instagram",
  "whatsapp", "youtube", "tiktok", "snapchat", "twitter", "linkedin", "pinterest", "reddit", "discord",
  "twitch", "telegram", "spotify", "netflix", "disney", "pixar", "hbo", "hulu", "paypal", "visa",
  "mastercard", "americanexpress", "adobe", "zoom", "slack", "dropbox", "uber", "lyft", "airbnb", "ebay",
  "shopify", "binance", "coinbase", "cashapp", "venmo", "westernunion", "chase", "hsbc", "barclays",
  "santander", "bankofamerica", "wellsfargo", "citibank", "discover", "klarna", "revolut", "wise",
  "samsung", "sony", "lg", "panasonic", "philips", "nokia", "motorola", "siemens", "toshiba", "hitachi",
  "sharp", "fujitsu", "lenovo", "huawei", "xiaomi", "oppo", "vivo", "oneplus", "realme", "asus", "acer",
  "dell", "intel", "amd", "nvidia", "ibm", "oracle", "cisco", "ericsson",
  // automotive
  "toyota", "honda", "ford", "bmw", "mercedesbenz", "audi", "volkswagen", "porsche", "ferrari",
  "lamborghini", "maserati", "bentley", "rollsroyce", "tesla", "nissan", "mazda", "subaru", "mitsubishi",
  "suzuki", "kia", "hyundai", "volvo", "jaguar", "landrover", "lexus", "bugatti", "mclaren", "peugeot",
  "renault", "citroen", "fiat", "alfaromeo", "chevrolet", "dodge", "jeep", "chrysler", "cadillac",
  "gmc", "buick", "harleydavidson", "yamaha", "ktm", "ducati",
  // gaming
  "playstation", "nintendo", "xbox", "sega", "steam", "roblox", "minecraft", "epicgames", "rockstar",
  "ubisoft", "tencent", "pubg", "fortnite", "callofduty", "leagueoflegends", "amongus", "gta",
  "valorant", "genshinimpact",
  // knowledge / orgs everyone in a quiz audience knows
  "wikipedia", "wikimedia", "youtube" /* youtube also in tech */,
  // sports & orgs
  "fifa", "uefa", "nba", "nfl", "nhl", "mlb", "wwe", "ufc", "ioc",
  "realmadrid", "fcbarcelona", "manchesterunited", "manchestercity", "liverpool", "arsenal", "chelsea",
  "tottenham", "bayernmunich", "psg", "juventus", "acmilan", "ajax", "celtic", "borussiadortmund",
  "benfica", "porto", "galatasaray", "fenerbahce",
  // travel & media
  "booking", "expedia", "tripadvisor", "trivago", "ryanair", "easyjet", "emirates", "lufthansa",
  "britishairways", "airfrance", "klm", "delta", "united", "southwest", "jetblue", "turkishairlines",
  "singaporeairlines", "qatarairways", "etihad", "airindia", "indigo", "soundcloud", "deezer", "primevideo",
  "disneyplus", "appletv", "crunchyroll", "hotstar", "bilibili", "warnerbros", "paramount",
  // telecom
  "jio", "airtel", "vodafone", "verizon", "tmobile", "sprint", "orange", "softbank", "sky", "virgin",
  "comcast", "att", "citi",
]);

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── tiny concurrency pool ──
async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await fn(items[idx], idx); } catch (e) { /* keep going */ }
    }
  });
  await Promise.all(workers);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getJson(url, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status >= 500) { throttles++; await sleep((BASE_BACKOFF_MS || 600) * t * t); continue; }
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { await sleep(500 * t); }
  }
  return null;
}

// ── 2026-10-10 pass-3 repair: burst throttling diagnosis ──
// pass 1 (concurrency 12) -> 339/2153 pv; pass 2 (concurrency 6) -> only
// +322/1814, and manual probes from this box return clean 200s at 1 req/s.
// So the per-IP adaptive limiter punishes BURSTS, not volume. Pageview
// fetches now go through a global pacing gate (one request every ~1.1s)
// with 5 hard retries on 429/5xx.
let throttles = 0;
const BASE_BACKOFF_MS = 1200;
let nextStart = 0;
async function paced() {
  const now = Date.now();
  if (now < nextStart) await sleep(nextStart - now);
  nextStart = Math.max(Date.now(), nextStart) + 1000 + Math.floor(Math.random() * 200); // ~1 req/s, burst-proof
}

// ── 1. load dataset ──
const ds = JSON.parse(fs.readFileSync(DS_PATH, "utf8"));
const brands = ds.brands || [];
console.log(`[tier] dataset loaded: ${brands.length} brands (version=${ds.version})`);

// ── 2. checkpoint ──
let ckpt = { byName: {} };
try { ckpt = JSON.parse(fs.readFileSync(CKPT, "utf8")); } catch { }
const have = new Set(Object.keys(ckpt.byName));

// date window: pageviews data lags the wall clock and some wiki titles are
// redirects (per-article API does NOT follow them), so: resolve every brand to
// its canonical article title first, then request ~21 months of MONTHLY data
// and sum the LAST 3 MONTHS THAT ACTUALLY HAVE DATA (robust to API lag).
const PV_START = "20250101";
const PV_END = fmt(end).replace(/-/g, ""); // REST API needs BOTH dates compact (mixed = 400)
const MONTHLY_WIN = `${PV_START}/${PV_END}`;

// ── 3-5: network phases — SKIPPED entirely when the checkpoint already
// covers every brand (offline re-score after a dump/api merge), or when
// TIER_OFFLINE=1 / --offline is passed (hard guarantee: never touch the API) ──
const FORCE_OFFLINE = process.env.TIER_OFFLINE === "1" || process.argv.includes("--offline");
const FULLY_CACHED = FORCE_OFFLINE || have.size >= brands.length;

// ── 3. resolve missing qids via enwiki pageprops (batch 50) ──
const needQid = FULLY_CACHED ? [] : brands.filter((b) => !b.qid && (b.wiki || b.name));
console.log(`[tier] resolving qids for ${needQid.length} entries without one...`);
for (let i = 0; i < needQid.length; i += 50) {
  const chunk = needQid.slice(i, i + 50);
  const titles = chunk.map((b) => (b.wiki || b.name).replace(/ /g, "_")).join("|");
  const j = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=${encodeURIComponent(titles)}`);
  if (!j || !j.query) continue;
  const maps = [...(j.query.redirects || []), ...(j.query.normalized || [])];
  const mapFrom = (t) => { let cur = t; for (const m of maps) if (m.from === cur) cur = m.to; return cur; };
  for (const p of Object.values(j.query.pages || {})) {
    const q = p.pageprops && p.pageprops.wikibase_item;
    if (!q) continue;
    const srcTitle = mapFrom(p.title);
    for (const b of chunk) {
      const t = (b.wiki || b.name).replace(/ /g, "_");
      if (p.title === srcTitle || p.title === t || mapFrom(t) === p.title) { b._qid = q; break; }
    }
  }
}
const withQid = brands.filter((b) => b.qid || b._qid);
console.log(`[tier] qid coverage: ${withQid.length}/${brands.length}`);

// ── 3b. canonical article titles (redirects resolved) for ALL brands ──
console.log(`[tier] resolving canonical titles for ${FULLY_CACHED ? 0 : brands.length} brands...`);
const canonByName = {};
for (let i = 0; FULLY_CACHED === false && i < brands.length; i += 50) {
  const chunk = brands.slice(i, i + 50);
  const titles = chunk.map((b) => (b.wiki || b.name).replace(/ /g, "_")).join("|");
  const j = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=info&redirects=1&titles=${encodeURIComponent(titles)}`);
  if (!j || !j.query) continue;
  const maps = [...(j.query.redirects || []), ...(j.query.normalized || [])];
  const mapFrom = (t) => { let cur = t; for (const m of maps) if (m.from === cur) cur = m.to; return cur; };
  const pageByTitle = new Map(Object.values(j.query.pages || {}).map((p) => [p.title, p]));
  for (const b of chunk) {
    const raw = (b.wiki || b.name).replace(/_/g, " ");
    const canon = mapFrom(raw);
    const p = pageByTitle.get(canon);
    if (p && !p.missing) { canonByName[norm(b.name)] = p.title; b._canon = p.title; }
  }
  await sleep(150);
}
const canonCount = Object.keys(canonByName).length;
console.log(`[tier] canonical titles resolved for ${canonCount}/${brands.length}`);

// ── 3c. AUTHORITATIVE canonical titles via Wikidata sitelinks (2026-10-10
// repair: the enwiki prop=info burst above collapsed after one batch - only
// 50/2153 resolved - so most pageview calls then hit redirect-404s and
// returned 0. Wikidata stores each entity's CANONICAL enwiki article title,
// so wbgetentities(props=sitelinks) sidesteps redirect resolution entirely.)
const qidList3c = FULLY_CACHED ? [] : [...new Set(withQid.map((b) => b.qid || b._qid))];
console.log(`[tier] sitelink-title resolution for ${qidList3c.length} qids...`);
const enwikiByQid = {};
for (let i = 0; i < qidList3c.length; i += 50) {
  const chunk = qidList3c.slice(i, i + 50);
  const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&ids=${chunk.join("%7C")}`, 4);
  for (const [q, ent] of Object.entries((j && j.entities) || {})) {
    const t = ent.sitelinks && ent.sitelinks.enwiki && ent.sitelinks.enwiki.title;
    if (t) enwikiByQid[q] = t;
  }
  await sleep(200);
}
let slTitleFixes = 0;
for (const b of brands) {
  const q = b.qid || b._qid;
  const t = q && enwikiByQid[q];
  if (t) { b._canon = t; canonByName[norm(b.name)] = t; slTitleFixes++; }
}
console.log(`[tier] canonical titles after sitelink pass: ${Object.keys(canonByName).length}/${brands.length} (+${slTitleFixes} from Wikidata)`);

// ── 4. sitelinks via WDQS (chunks of 300) ──
const qids = FULLY_CACHED ? [] : [...new Set(withQid.map((b) => b.qid || b._qid))];
console.log(`[tier] fetching sitelinks for ${qids.length} qids...`);
const slByQid = {};
for (let i = 0; i < qids.length; i += 300) {
  const chunk = qids.slice(i, i + 300);
  const sparql = `SELECT ?item ?sl WHERE { VALUES ?item { ${chunk.map((q) => "wd:" + q).join(" ")} } ?item wikibase:sitelinks ?sl }`;
  const j = await getJson("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), 4);
  for (const bnd of (j && j.results && j.results.bindings) || []) {
    const q = (bnd.item.value || "").split("/").pop();
    slByQid[q] = parseInt(bnd.sl.value, 10) || 0;
  }
  await sleep(300);
}
console.log(`[tier] sitelinks resolved for ${Object.keys(slByQid).length} qids`);

// ── 5. pageviews (per-article monthly, globally paced ~1 req/s, checkpoint) ──
// 2026-10-10 repair: zero-pv checkpoint entries are DROPPED before this
// pass so they re-fetch with the corrected canonical titles (sitelink
// pass). Genuinely article-less brands just cost one request and land at
// 0 again.
if (!FULLY_CACHED) {
  for (const [k, v] of Object.entries(ckpt.byName)) {
    if (!v || !(v.pv90 > 0)) delete ckpt.byName[k];
  }
}
const todo = FULLY_CACHED ? [] : brands.filter((b) => !(ckpt.byName[norm(b.name)] && ckpt.byName[norm(b.name)].pv90 > 0)); // fully cached = fully offline re-score (dump-verified zeros are legitimate: no matching article)
console.log(`[tier] pageviews to fetch: ${todo.length} (cached good: ${brands.length - todo.length})${FULLY_CACHED ? " — checkpoint complete, OFFLINE re-score" : ""}`);
let done = 0;
await pool(todo, 4, async (b) => {
  const key = norm(b.name);
  const title = encodeURIComponent((b._canon || b.wiki || b.name).replace(/ /g, "_"));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${title}/monthly/${MONTHLY_WIN}`;
  await paced();
  const j = await getJson(url, 5);
  let pv = 0;
  if (j && Array.isArray(j.items) && j.items.length) {
    // last 3 months that actually have data (API data lags the wall clock)
    const recent = j.items.slice(-3);
    for (const it of recent) pv += it.views || 0;
  }
  const qid = b.qid || b._qid || null;
  ckpt.byName[key] = { pv90: pv, sl: qid ? (slByQid[qid] || 0) : 0, qid, wiki: b.wiki || null };
  done++;
  if (done % 150 === 0) { fs.writeFileSync(CKPT, JSON.stringify(ckpt)); console.log(`[tier] progress ${done}/${todo.length}`); }
});
fs.writeFileSync(CKPT, JSON.stringify(ckpt));
console.log(`[tier] pageviews done: ${done} fetched, ${Object.keys(ckpt.byName).length} cached, 429/5xx hits: ${throttles}`);

// ── 6. score + classify ──
const rows = brands.map((b) => {
  const c = ckpt.byName[norm(b.name)] || { pv90: 0, sl: 0 };
  return { b, name: b.name, cat: b.cat || "?", pv90: c.pv90 || 0, sl: c.sl || 0, source: b.source || "?" };
});
const logv = (x) => Math.log10(x + 1);
const maxPv = Math.max(...rows.map((r) => logv(r.pv90)), 1);
const maxSl = Math.max(...rows.map((r) => logv(r.sl)), 1);
for (const r of rows) r.score = 0.65 * (logv(r.pv90) / maxPv) + 0.35 * (logv(r.sl) / maxSl);

const byScore = [...rows].sort((a, b2) => b2.score - a.score);
const N = byScore.length;
const nEasy = Math.round(N * 0.35), nMed = Math.round(N * 0.40);
byScore.forEach((r, i) => { r._pct = i < nEasy ? "easy" : i < nEasy + nMed ? "medium" : "hard"; });

// overrides: household names always easy; near-invisible always hard
for (const r of rows) {
  if (MEGA.has(norm(r.name))) r.tier = "easy";
  else if (r.pv90 < 300 && r.sl < 8) r.tier = "hard";
  else r.tier = r._pct;
}
// de-dup risk: pv90==0 && sl==0 && no article → hard regardless of percentile
for (const r of rows) if (r.pv90 === 0 && r.sl === 0 && !MEGA.has(norm(r.name))) r.tier = "hard";
// fame floor (2026-10-10 QA): the dump sampling (7 hourly files ×103) is
// noisy in the mid tail, shoving 20k+-view brands (Culver's, Qualcomm,
// Tim Hortons, even Wikipedia) below the hard cutoff. Nothing with 20k+
// monthly-scale views is genuinely "hard" — floor those at medium.
for (const r of rows) if (r.tier === "hard" && r.pv90 >= 20000) r.tier = "medium";

const tiers = { easy: [], medium: [], hard: [] };
for (const r of rows) tiers[r.tier].push(r);
const dist = { easy: tiers.easy.length, medium: tiers.medium.length, hard: tiers.hard.length };

// ── 7. report ──
const samples = (arr, n) => arr.slice(0, n).map((r) => `${r.name}(${r.pv90})`).join(", ");
const L = [];
L.push(`LOGO TIER REPORT — ${new Date().toISOString()}`);
L.push(`brands: ${N} | easy ${dist.easy} (${(100 * dist.easy / N).toFixed(1)}%) | medium ${dist.medium} (${(100 * dist.medium / N).toFixed(1)}%) | hard ${dist.hard} (${(100 * dist.hard / N).toFixed(1)}%)`);
L.push(`method: pv90 = sum of the last 3 available MONTHS of enwiki pageviews (REST per-article, monthly, all-access/user, paced ~1 req/s after burst-429 diagnosis; canonical titles pre-resolved via Wikidata sitelinks); score=0.65*norm(log10(pv90+1))+0.35*norm(log10(sitelinks+1)); top35% easy / mid40% medium / bottom25% hard; overrides: MEGA list -> easy, (pv90<300 && sl<8) -> hard, zero-signal -> hard`);
L.push("");
L.push(`EASY samples: ${samples(tiers.easy, 15)}`);
L.push(`MEDIUM samples: ${samples(tiers.medium, 15)}`);
L.push(`HARD samples: ${samples(tiers.hard, 15)}`);
L.push("");
L.push("per-category tier counts:");
const cats = {};
for (const r of rows) { cats[r.cat] = cats[r.cat] || { easy: 0, medium: 0, hard: 0 }; cats[r.cat][r.tier]++; }
for (const [c, t] of Object.entries(cats).sort((a, b2) => b2[1].easy - a[1].easy)) L.push(`  ${c}: easy ${t.easy} / medium ${t.medium} / hard ${t.hard}`);
L.push("");
L.push("MEGA override sanity (should all be easy):");
for (const probe of ["Coca-Cola", "Nike", "Apple", "McDonald's", "PUBG", "Bitcoin"]) {
  const r = rows.find((x) => norm(x.name) === norm(probe));
  L.push(`  ${probe}: ${r ? r.tier + " pv90=" + r.pv90 + " sl=" + r.sl : "NOT IN DATASET"}`);
}
const rep = L.join("\n");
fs.writeFileSync(REPORT, rep);
console.log("\n" + rep);

// ── 8. apply ──
if (APPLY) {
  const bak = `${DS_PATH}.bak-tier-${Date.now()}`;
  fs.copyFileSync(DS_PATH, bak);
  const tierByName = new Map(rows.map((r) => [norm(r.name), r]));
  let changed = 0;
  for (const b of ds.brands) {
    const r = tierByName.get(norm(b.name));
    if (!r) continue;
    b.difficulty = r.tier;
    b.pv90 = r.pv90;
    b.sl = r.sl;
    changed++;
  }
  ds.tieredAt = new Date().toISOString();
  ds.tiers = { ...dist, method: "pv90 (last-3-months enwiki pageviews, paced REST) + sitelinks; score 0.65/0.35, top35/40/25 + MEGA/low-signal overrides" };
  ds.version = (ds.version || "logo") + "+tiers-1";
  const tmp = DS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(ds));
  fs.renameSync(tmp, DS_PATH);
  console.log(`[tier] APPLIED to ${changed}/${ds.brands.length} brands; backup: ${path.basename(bak)}`);
} else {
  console.log("[tier] dry run — re-run with --apply to write the dataset");
}
