#!/usr/bin/env node
/* build_quiz_dataset_topup.js — pass 2: fills the gaps pass 1 left.
 *  A) OpenTDB with FIXED pagination (token reset only on exhaustion) -> thousands more
 *  B) the-trivia-api re-pulls (deduped vs existing file)
 *  C) Films via leaner Wikidata SPARQL (director/year facts + titles)
 *  D) Movie posters via enwiki pageimages (pilicense=any)
 *  E) Game covers re-pull (enwiki pageimages) — HEAD-verified (cheap)
 *  F) Comic characters P18 re-pull — verified via Commons/enwiki imageinfo API (no renders)
 *  Merges into the EXISTING data/quizDataset.json (dedupe by stem/url). */
'use strict';
const fs = require("fs");
let axios;
try { axios = require("axios"); } catch { axios = require("/home/ubuntu/whatsapp-bot/node_modules/axios"); }
const OUT = "/home/ubuntu/whatsapp-bot/data/quizDataset.json";
const REPORT = "/home/ubuntu/whatsapp-bot/data/quizDataset.report.txt";
const UA = "quiz-dataset-builder/1.0 (whatsapp-bot maintenance)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function _sh(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
function decodeHtml(s) {
  if (!s) return s;
  return String(s).replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&hellip;/g, "...").replace(/&rsquo;/g, "'").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"');
}
function mcq(answer, distractors) {
  const d = _sh([...new Set(distractors.filter((x) => x && normKey(x) !== normKey(answer)))].map(String)).slice(0, 3);
  if (d.length < 3) return null;
  const options = _sh([String(answer), ...d]);
  return { options, correct: options.findIndex((o) => normKey(o) === normKey(answer)) };
}
function diffBand(rank, total) { const p = rank / Math.max(1, total); return p < 0.3 ? "easy" : p < 0.7 ? "medium" : "hard"; }

const DS = JSON.parse(fs.readFileSync(OUT, "utf8"));
const seenStems = new Set();
const seenImg = new Set();
for (const c of Object.keys(DS.categories)) {
  for (const q of DS.categories[c].questions || []) seenStems.add(normKey(q.q));
  for (const q of DS.categories[c].images || []) seenImg.add(q.img);
}
function addText(cat, q, options, correct, difficulty, topic) {
  q = decodeHtml(String(q || "")).replace(/\s+/g, " ").trim();
  options = (options || []).map((o) => decodeHtml(String(o || "")).replace(/\s+/g, " ").trim());
  if (!q || q.length < 8 || q.length > 240) return false;
  if (options.length !== 4 || new Set(options.map(normKey)).size !== 4) return false;
  if (!(correct >= 0 && correct < 4)) return false;
  const key = normKey(q);
  if (!key || seenStems.has(key)) return false;
  seenStems.add(key);
  DS.categories[cat].questions.push({ q, options, correct, difficulty: ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium", topic: topic || cat });
  return true;
}
function addImage(cat, entry) {
  if (!entry || !entry.img || seenImg.has(entry.img)) return false;
  if (!entry.q || !entry.options || entry.options.length !== 4 || entry.correct == null) return false;
  if (new Set(entry.options.map(normKey)).size !== 4) return false;
  seenImg.add(entry.img);
  DS.categories[cat].images.push({ ...entry, difficulty: ["easy", "medium", "hard"].includes(entry.difficulty) ? entry.difficulty : "medium" });
  return true;
}
async function jget(url, opts = {}, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await axios.get(url, { timeout: opts.timeout || 20000, headers: { "User-Agent": UA, ...(opts.headers || {}) }, maxContentLength: 60 * 1024 * 1024 });
      return r.data;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2000 + i * 3000);
    }
  }
}

// A) OpenTDB — proper pagination
async function topOpenTDB() {
  const CATS = { 15: "games", 11: "movies", 14: "series", 29: "comics", 31: "series", 32: "series" };
  const TOPIC = { 15: "Video Games", 11: "Movies", 14: "TV Series", 29: "Comics", 31: "Anime & Manga", 32: "Cartoons" };
  let token = null, n = 0;
  try { token = (await jget("https://opentdb.com/api_token.php?command=request", { timeout: 15000 })).token; } catch {}
  for (const [cid, cat] of Object.entries(CATS)) {
    let exhausted = false;
    for (let page = 0; page < 40 && !exhausted; page++) {
      const url = `https://opentdb.com/api.php?amount=50&category=${cid}&type=multiple${token ? `&token=${token}` : ""}`;
      let d;
      try { d = await jget(url, { timeout: 15000 }); } catch { break; }
      if (!d || !Array.isArray(d.results)) break;
      if (d.response_code === 1) break;                    // no results left
      if (d.response_code === 3 && token) {                // token exhausted -> reset once, retry same page
        try { await jget(`https://opentdb.com/api_token.php?command=reset&token=${token}`, { timeout: 10000 }); } catch {}
        continue;
      }
      if (d.response_code !== 0) break;
      for (const r of d.results) {
        const opts = [r.correct_answer, ...(r.incorrect_answers || [])];
        const options = _sh([0, 1, 2, 3]).map((i) => opts[i]);
        const correct = options.findIndex((o) => o === r.correct_answer);
        if (addText(cat, r.question, options, correct, r.difficulty, TOPIC[cid])) n++;
      }
      await sleep(600);
    }
  }
  console.log(`[opentdb-topup] +${n}`);
}

// B) the-trivia-api — more pulls (random sets, dedupe via seenStems)
async function topTrivia() {
  let n = 0;
  for (const c of ["video_games", "film_and_tv"]) {
    for (const diff of ["easy", "medium", "hard"]) {
      for (let k = 0; k < 6; k++) {
        let d;
        try { d = await jget(`https://the-trivia-api.com/v2/questions?categories=${c}&limit=50&difficulty=${diff}`, { timeout: 15000 }); } catch { break; }
        if (!Array.isArray(d) || !d.length) break;
        for (const r of d) {
          const cat = c === "video_games" ? "games" : (/\btv\b|television|series|episode|sitcom|netflix/i.test(r.question) ? "series" : "movies");
          const opts = _sh([r.correctAnswer, ...(r.incorrectAnswers || [])]);
          const correct = opts.findIndex((o) => o === r.correctAnswer);
          if (addText(cat, r.question, opts, correct, r.difficulty, c === "video_games" ? "Video Games" : "Film & TV")) n++;
        }
        await sleep(350);
      }
    }
  }
  console.log(`[trivia-topup] +${n}`);
}

// C) Films — leaner SPARQL (director/year + titles for posters)
async function wdQuery(sparql) {
  const r = await axios.post("https://query.wikidata.org/sparql?format=json", new URLSearchParams({ query: sparql }).toString(),
    { timeout: 90000, headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" }, maxContentLength: 80 * 1024 * 1024 });
  return r.data;
}
const wdVal = (b, k) => (b[k] && (b[k].value || "")) || "";
async function topFilms() {
  let rows = [];
  for (const LIMIT of [500, 300]) {
    try {
      const q = `SELECT ?f ?fLabel ?dirLabel ?year WHERE {
        ?f wdt:P31/wdt:P279* wd:Q11424 ; wikibase:sitelinks ?sl ; wdt:P577 ?date .
        FILTER(?sl >= 30) OPTIONAL { ?f wdt:P57 ?dir }
        BIND(YEAR(?date) AS ?year) FILTER(?year >= 1930 && ?year <= 2025)
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      } ORDER BY DESC(?sl) LIMIT ${LIMIT}`;
      rows = (wdQuery && (await wdQuery(q)).results.bindings) || [];
      if (rows.length) break;
    } catch (e) { console.log(`[films] limit ${LIMIT} failed: ${String(e && e.message || e).slice(0, 80)}`); await sleep(8000); }
  }
  if (!rows.length) return console.log("[films] no rows - skipped");
  console.log(`[films] ${rows.length} rows`);
  const dirs = rows.map((r) => wdVal(r, "dirLabel")).filter(Boolean);
  const years = rows.map((r) => wdVal(r, "year")).filter(Boolean);
  const titles = rows.map((r) => wdVal(r, "fLabel")).filter(Boolean);
  global.__filmTitles = titles;
  let n = 0;
  rows.forEach((r, i) => {
    const name = wdVal(r, "fLabel"), dir = wdVal(r, "dirLabel"), yr = wdVal(r, "year");
    const diff = diffBand(i, rows.length);
    if (dir && dirs.length > 10) { const m = mcq(dir, dirs); if (m && addText("movies", `Who directed the movie "${name}"?`, m.options, m.correct, diff, "Movies")) n++; }
    if (yr) { const m = mcq(yr, years); if (m && addText("movies", `In which year was the movie "${name}" released?`, m.options, m.correct, diff, "Movies")) n++; }
  });
  console.log(`[films] +${n} fact questions`);
}

// enwiki pageimages (as pass 1)
async function enwikiPageImages(titles) {
  const out = new Map();
  for (const grp of chunk(titles, 20)) {
    const params = new URLSearchParams({ action: "query", format: "json", prop: "pageimages", piprop: "original|thumbnail", pithumbsize: "640", pilicense: "any", titles: grp.join("|"), redirects: "1" });
    let d;
    try { d = await jget(`https://en.wikipedia.org/w/api.php?${params}`, { timeout: 20000 }); } catch { continue; }
    const pages = (d && d.query && d.query.pages) || {};
    const normalized = new Map(((d.query && d.query.normalized) || []).map((n) => [n.from, n.to]));
    const redirected = new Map(((d.query && d.query.redirects) || []).map((n) => [n.from, n.to]));
    for (const t of grp) {
      let want = normalized.get(t) || t;
      want = redirected.get(want) || want;
      const p = Object.values(pages).find((pg) => pg.title === want);
      if (p && p.original && p.original.source) out.set(t, { original: p.original.source, thumb: p.thumbnail && p.thumbnail.source, page: p.title });
    }
    await sleep(350);
  }
  return out;
}
async function headOk(url) {
  try {
    const r = await axios.get(url, { timeout: 15000, maxContentLength: 8 * 1024 * 1024, responseType: "arraybuffer", headers: { "User-Agent": UA } });
    const buf = Buffer.from(r.data);
    const mime = String(r.headers["content-type"] || "");
    const magic = buf.length > 4 && (buf[0] === 0x89 || buf[0] === 0xff || buf.slice(0, 3).toString() === "GIF" || buf.slice(0, 4).toString() === "RIFF");
    return buf.length >= 2000 && (mime.startsWith("image/") || magic);
  } catch { return false; }
}

// D) movie posters + E) game covers — HEAD-verified this time (cheap, no render storm)
async function topPosters() {
  const steam = [];
  for (let page = 0; page < 3; page++) {
    let d;
    try { d = await jget(`https://steamspy.com/api.php?request=all&page=${page}`, { timeout: 25000 }); } catch { break; }
    for (const g of Object.values(d || {})) if (g && g.name) steam.push(g.name);
    await sleep(500);
  }
  let gn = 0;
  if (steam.length) {
    const imgs = await enwikiPageImages(steam.slice(0, 900));
    console.log(`[games-covers] ${imgs.size}/${Math.min(steam.length, 900)}`);
    let i = 0;
    for (const [title, info] of imgs) {
      const url = info.thumb || info.original;
      const m = mcq(title, steam);
      if (!m) continue;
      if (await headOk(url)) { if (addImage("games", { img: url, q: "Which video game is this the cover art of?", ...m, difficulty: diffBand(i++, imgs.size), topic: "Video Games", subject: title, source: "enwiki-pageimage" })) gn++; }
      await sleep(150);
    }
    console.log(`[games-covers] +${gn}`);
  }
  const films = global.__filmTitles || [];
  let fn = 0;
  if (films.length) {
    const imgs = await enwikiPageImages(films.slice(0, 700));
    console.log(`[film-posters] ${imgs.size}/${Math.min(films.length, 700)}`);
    let i = 0;
    for (const [title, info] of imgs) {
      const url = info.thumb || info.original;
      const m = mcq(title, films);
      if (!m) continue;
      if (await headOk(url)) { if (addImage("movies", { img: url, q: "Which movie is this poster from?", ...m, difficulty: diffBand(i++, imgs.size), topic: "Movies", subject: title, source: "enwiki-pageimage" })) fn++; }
      await sleep(150);
    }
    console.log(`[film-posters] +${fn}`);
  }
}

// F) comic characters re-pull with API-imageinfo verification (no renders)
async function fileOk(fileTitle) {
  // try commons then enwiki via imageinfo API (batched inside caller; single fallback here)
  for (const host of ["https://commons.wikimedia.org", "https://en.wikipedia.org"]) {
    const params = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "640", titles: "File:" + fileTitle, redirects: "1" });
    try {
      const d = await jget(`${host}/w/api.php?${params}`, { timeout: 15000 });
      const pages = Object.values((d.query && d.query.pages) || {});
      const ii = pages[0] && pages[0].imageinfo && pages[0].imageinfo[0];
      if (ii && ii.mime && ii.mime.startsWith("image/") && (ii.width || 0) >= 48) {
        return ii.thumburl || ii.url;
      }
    } catch {}
  }
  return null;
}
async function topComics() {
  let rows = [];
  try {
    const q = `SELECT ?c ?cLabel ?img WHERE { ?c wdt:P31/wdt:P279* wd:Q1114461 ; wikibase:sitelinks ?sl ; wdt:P18 ?img . FILTER(?sl >= 8) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?sl) LIMIT 400`;
    rows = (await wdQuery(q)).results.bindings;
  } catch (e) { return console.log(`[comics] sparql failed: ${String(e && e.message || e).slice(0, 80)}`); }
  const entries = rows.map((r) => ({ name: wdVal(r, "cLabel"), img: wdVal(r, "img") })).filter((x) => x.name && x.img);
  console.log(`[comics] ${entries.length} rows`);
  const names = entries.map((e) => e.name);
  let n = 0, i = 0;
  for (const e of entries) {
    // img looks like http://commons.wikimedia.org/wiki/Special:FilePath/<file>
    const m0 = /Special:FilePath\/(.+)$/.exec(e.img);
    if (!m0) continue;
    const fileTitle = decodeURIComponent(m0[1]);
    const url = await fileOk(fileTitle);
    if (!url) continue;
    const m = mcq(e.name, names);
    if (m && addImage("comics", { img: url, q: "Which comic character is this?", ...m, difficulty: diffBand(i++, entries.length), topic: "Comics", subject: e.name, source: "wikidata-p18" })) n++;
    await sleep(120);
  }
  console.log(`[comics] +${n} character images`);
}

(async () => {
  const steps = [["opentdb", topOpenTDB], ["trivia", topTrivia], ["films", topFilms], ["posters", topPosters], ["comics", topComics]];
  for (const [name, fn] of steps) {
    try { await fn(); } catch (e) { console.log(`[${name}] FATAL-SKIP: ${String(e && e.message || e).slice(0, 120)}`); }
    await sleep(2000);
  }
  for (const cat of Object.keys(DS.categories)) {
    DS.categories[cat].questions.forEach((q, i) => { q.id = i + 1; });
    DS.categories[cat].images.forEach((q, i) => { q.id = i + 1; });
    DS.counts[cat] = { text: DS.categories[cat].questions.length, images: DS.categories[cat].images.length };
  }
  DS.generatedAt = new Date().toISOString();
  DS.version = 2;
  const json = JSON.stringify(DS);
  fs.writeFileSync(OUT, json);
  let rep = `quizDataset v2 — ${DS.generatedAt}\n${Math.round(json.length / 1024)}KB\n`;
  for (const [c, n] of Object.entries(DS.counts)) rep += `${c}: text=${n.text} images=${n.images}\n`;
  fs.writeFileSync(REPORT, rep);
  console.log(rep);
})().catch((e) => { console.log("TOPUP_FAIL", e); process.exit(1); });
