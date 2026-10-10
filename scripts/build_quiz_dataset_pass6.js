#!/usr/bin/env node
/* build_quiz_dataset_pass6.js — games covers + facts (Wikidata), comics boost
 * (Kitsu + AniList manga extension). Merges into data/quizDataset.json (v5).
 * Keyless throughout; images verified at build time (download or imageinfo). */
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
function mcq(answer, distractors) {
  const d = _sh([...new Set(distractors.filter((x) => x && normKey(x) !== normKey(answer)))].map(String)).slice(0, 3);
  if (d.length < 3) return null;
  const options = _sh([String(answer), ...d]);
  return { options, correct: options.findIndex((o) => normKey(o) === normKey(answer)) };
}
function diffBand(rank, total) { const p = rank / Math.max(1, total); return p < 0.3 ? "easy" : p < 0.7 ? "medium" : "hard"; }

const DS = JSON.parse(fs.readFileSync(OUT, "utf8"));
const seenStems = new Set(), seenImg = new Set();
for (const c of Object.keys(DS.categories)) {
  for (const q of DS.categories[c].questions || []) seenStems.add(normKey(q.q));
  for (const q of DS.categories[c].images || []) seenImg.add(q.img);
}
function addText(cat, q, options, correct, difficulty, topic) {
  q = String(q || "").replace(/\s+/g, " ").trim();
  options = (options || []).map((o) => String(o || "").replace(/\s+/g, " ").trim());
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
      const r = await axios.get(url, { timeout: opts.timeout || 25000, headers: { "User-Agent": UA, ...(opts.headers || {}) }, maxContentLength: 60 * 1024 * 1024 });
      return r.data;
    } catch (e) {
      const status = e && e.response && e.response.status;
      if (status === 429) { console.log("  (429 - cooling 40s)"); await sleep(40000); continue; }
      if (i === tries - 1) throw e;
      await sleep(4000);
    }
  }
}
function fileTitleFromUploadUrl(url) {
  try { const u = new URL(url); const segs = u.pathname.split("/"); return decodeURIComponent(segs[segs.length - 1]); } catch { return null; }
}
// batch imageinfo on enwiki + Commons; returns Map fileTitle -> working 640px url
async function imageinfoVerify(fileTitles) {
  const ok = new Map();
  for (const grp of chunk([...fileTitles], 50)) {
    for (const host of ["https://en.wikipedia.org", "https://commons.wikimedia.org"]) {
      if (!grp.length) break;
      const params = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "640", titles: grp.map((t) => "File:" + t).join("|"), redirects: "1" });
      try {
        const d = await jget(`${host}/w/api.php?${params}`);
        const pages = (d.query && d.query.pages) || [];
        const norm = new Map((((d.query || {}).normalized) || []).map((n) => [n.from, n.to]));
        const redir = new Map((((d.query || {}).redirects) || []).map((n) => [n.from, n.to]));
        const byTitle = new Map(pages.map((p) => [p.title.replace(/^File:/i, ""), p]));
        for (const t of [...grp]) {
          let want = norm.get("File:" + t) || "File:" + t;
          want = redir.get(want) || want;
          const p = byTitle.get(want.replace(/^File:/i, ""));
          const ii = p && p.imageinfo && p.imageinfo[0];
          if (ii && ii.mime && ii.mime.startsWith("image/") && (ii.width || 0) >= 48 && (ii.size || 0) >= 2000) {
            ok.set(t, ii.thumburl || ii.url);
            grp.splice(grp.indexOf(t), 1);
          }
        }
      } catch {}
      await sleep(2200);
    }
  }
  return ok;
}
async function wdQuery(sparql) {
  const r = await axios.post("https://query.wikidata.org/sparql?format=json", new URLSearchParams({ query: sparql }).toString(), { timeout: 90000, headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" }, maxContentLength: 80 * 1024 * 1024 });
  return r.data;
}
const wdRows = (d) => (d && d.results && d.results.bindings) || [];
const wdVal = (b, k) => (b[k] && (b[k].value || "")) || "";

// ── 1. GAMES: covers/logos + release year + developer (Wikidata) ──
async function gamesWikidata() {
  const rowsAll = [];
  for (const [prop, kind] of [["P18", "cover art"], ["P154", "logo"]]) {
    try {
      const q = `SELECT ?g ?gLabel ?img ?year ?devLabel WHERE {
        ?g wdt:P31/wdt:P279* wd:Q7889 ; wikibase:sitelinks ?sl ; wdt:${prop} ?img .
        FILTER(?sl >= 10)
        OPTIONAL { ?g wdt:P577 ?d . BIND(YEAR(?d) AS ?year) }
        OPTIONAL { ?g wdt:P178 ?dev }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      } ORDER BY DESC(?sl) LIMIT 700`;
      const rows = wdRows(await wdQuery(q));
      console.log(`[wd-games] ${prop}: ${rows.length} rows`);
      for (const b of rows) rowsAll.push({ name: wdVal(b, "gLabel"), img: wdVal(b, "img"), year: wdVal(b, "year"), dev: wdVal(b, "devLabel"), kind });
    } catch (e) { console.log(`[wd-games] ${prop} failed: ${String(e && e.message || e).slice(0, 90)}`); }
    await sleep(6000);
  }
  const entries = rowsAll.filter((x) => x.name && x.img);
  console.log(`[wd-games] ${entries.length} image rows`);
  const fileTitles = [...new Set(entries.map((e) => fileTitleFromUploadUrl(e.img)).filter(Boolean))];
  const verified = await imageinfoVerify(fileTitles);
  console.log(`[wd-games] imageinfo verified: ${verified.size}/${fileTitles.length}`);
  const names = entries.map((e) => e.name);
  const years = [...new Set(entries.map((e) => e.year).filter((y) => y >= 1975 && y <= 2026).map(String))];
  const devs = [...new Set(entries.map((e) => e.dev).filter((v) => v && !v.includes("http")))];
  let im = 0, ty = 0, td = 0, i = 0;
  for (const e of entries) {
    const url = verified.get(fileTitleFromUploadUrl(e.img));
    if (!url) continue;
    const m = mcq(e.name, names);
    if (m && addImage("games", { img: url, q: `Which video game is this the ${e.kind} of?`, ...m, difficulty: diffBand(i++, entries.length), topic: "Video Games", subject: e.name, source: "wikidata" })) im++;
    if (e.year >= 1975 && e.year <= 2026) {
      const ym = mcq(String(e.year), years);
      if (ym && addText("games", `In which year was the video game "${e.name}" released?`, ym.options, ym.correct, diffBand(i, entries.length), "Video Games")) ty++;
    }
    if (e.dev && devs.length > 10) {
      const dm = mcq(e.dev, devs);
      if (dm && addText("games", `Which studio developed the game "${e.name}"?`, dm.options, dm.correct, "medium", "Video Games")) td++;
    }
  }
  console.log(`[wd-games] +${im} cover/logo images, +${ty} year facts, +${td} developer facts`);
}

// ── 2. COMICS: Kitsu manga (covers + years) ──
async function comicsKitsu() {
  const manga = [];
  for (let off = 0; off < 600 && manga.length < 600; off += 20) {
    let d;
    try { d = await jget(`https://kitsu.io/api/edge/manga?page%5Blimit%5D=20&page%5Boffset%5D=${off}&sort=-userCount`, { timeout: 20000 }); } catch { break; }
    const arr = (d && d.data) || [];
    if (!arr.length) break;
    for (const m of arr) {
      const a = m.attributes || {};
      const name = (a.titles && (a.titles.en || a.titles.en_jp)) || a.canonicalTitle;
      const img = a.posterImage && (a.posterImage.large || a.posterImage.original || a.posterImage.medium);
      if (name && img) manga.push({ name, img, year: a.startDate ? +String(a.startDate).slice(0, 4) : null, pop: a.userCount || 0 });
    }
    await sleep(350);
  }
  console.log(`[kitsu] ${manga.length} manga`);
  const names = manga.map((m) => m.name);
  const years = [...new Set(manga.map((m) => m.year).filter((y) => y >= 1940 && y <= 2026).map(String))];
  let im = 0, ty = 0;
  manga.forEach((m0, i) => {
    const m = mcq(m0.name, names);
    if (m && addImage("comics", { img: m0.img, q: "Which manga is this cover from?", ...m, difficulty: diffBand(i, manga.length), topic: "Manga", subject: m0.name, source: "kitsu" })) im++;
    if (m0.year >= 1940 && m0.year <= 2026) {
      const ym = mcq(String(m0.year), years);
      if (ym && addText("comics", `In which year was the manga "${m0.name}" first published?`, ym.options, ym.correct, diffBand(i, manga.length), "Manga")) ty++;
    }
  });
  console.log(`[kitsu] +${im} covers, +${ty} year questions`);
}

// ── 3. COMICS: AniList manga extension (pages 5-10 popularity) ──
async function anilistPost(query, variables) {
  const r = await axios.post("https://graphql.anilist.co", { query, variables }, { timeout: 20000, headers: { "Content-Type": "application/json", "User-Agent": UA } });
  return r.data;
}
async function comicsAniListExt() {
  const MEDIA_Q = `query ($page: Int) { Page(page: $page, perPage: 50) { media(type: MANGA, sort: POPULARITY_DESC, isAdult: false) { title { romaji english } coverImage { large } startDate { year } } } }`;
  const manga = [];
  for (let p = 5; p <= 10; p++) {
    let d;
    try { d = await anilistPost(MEDIA_Q, { page: p }); } catch { break; }
    const ms = (d && d.data && d.data.Page && d.data.Page.media) || [];
    for (const m of ms) {
      const name = (m.title && (m.title.english || m.title.romaji)) || "";
      const img = m.coverImage && m.coverImage.large;
      if (name && img) manga.push({ name, img, year: m.startDate && m.startDate.year });
    }
    if (ms.length < 50) break;
    await sleep(2400); // AniList ~30/min ceiling
  }
  console.log(`[anilist-manga] ${manga.length} from pages 5-10`);
  const names = manga.map((m) => m.name);
  const years = [...new Set(manga.map((m) => m.year).filter((y) => y >= 1940 && y <= 2026).map(String))];
  let im = 0, ty = 0;
  manga.forEach((m0, i) => {
    const m = mcq(m0.name, names);
    if (m && addImage("comics", { img: m0.img, q: "Which manga is this cover from?", ...m, difficulty: diffBand(i, manga.length), topic: "Manga", subject: m0.name, source: "anilist" })) im++;
    if (m0.year >= 1940 && m0.year <= 2026) {
      const ym = mcq(String(m0.year), years);
      if (ym && addText("comics", `In which year was the manga "${m0.name}" first published?`, ym.options, ym.correct, diffBand(i, manga.length), "Manga")) ty++;
    }
  });
  console.log(`[anilist-manga] +${im} covers, +${ty} year questions`);
}

// ── verify only NEW image entries by download (kitsu/anilist direct urls) ──
async function verifyNewImages() {
  let total = 0, dropped = 0;
  for (const cat of Object.keys(DS.categories)) {
    const imgs = DS.categories[cat].images;
    const todo = imgs.filter((e) => e.source === "kitsu" || e.source === "anilist");
    if (!todo.length) continue;
    const results = new Map();
    const q = todo.slice();
    await Promise.all(Array.from({ length: 10 }, async () => {
      while (q.length) {
        const e = q.shift();
        try {
          const r = await axios.get(e.img, { timeout: 20000, maxContentLength: 8 * 1024 * 1024, responseType: "arraybuffer", headers: { "User-Agent": UA } });
          const buf = Buffer.from(r.data);
          const magic = buf.length > 8 && (buf[0] === 0x89 || buf[0] === 0xff || buf.slice(0, 3).toString() === "GIF" || buf.slice(0, 4).toString() === "RIFF");
          results.set(e.img, buf.length >= 2500 && (String(r.headers["content-type"] || "").startsWith("image/") || magic));
        } catch { results.set(e.img, false); }
      }
    }));
    const kept = imgs.filter((e) => (e.source === "kitsu" || e.source === "anilist") ? results.get(e.img) : true);
    dropped += imgs.length - kept.length;
    total += kept.length;
    DS.categories[cat].images = kept;
    console.log(`[verify-new] ${cat}: kept ${kept.length}/${imgs.length}`);
  }
  console.log(`[verify-new] total ${total}, dropped ${dropped}`);
}

(async () => {
  const t0 = Date.now();
  for (const [name, fn] of [["wd-games", gamesWikidata], ["kitsu", comicsKitsu], ["anilist-ext", comicsAniListExt]]) {
    try { await fn(); } catch (e) { console.log(`[${name}] FATAL-SKIP: ${String(e && e.message || e).slice(0, 120)}`); }
    await sleep(2000);
  }
  await verifyNewImages();
  for (const cat of Object.keys(DS.categories)) {
    DS.categories[cat].questions.forEach((q, i) => { q.id = i + 1; });
    DS.categories[cat].images.forEach((q, i) => { q.id = i + 1; });
    DS.counts[cat] = { text: DS.categories[cat].questions.length, images: DS.categories[cat].images.length };
  }
  DS.generatedAt = new Date().toISOString();
  DS.version = 6;
  const json = JSON.stringify(DS);
  fs.writeFileSync(OUT, json);
  let rep = `quizDataset v5 — ${DS.generatedAt}\n${Math.round(json.length / 1024)}KB, built in ${Math.round((Date.now() - t0) / 1000)}s\n`;
  for (const [c, n] of Object.entries(DS.counts)) rep += `${c}: text=${n.text} images=${n.images}\n`;
  rep += `sources: opentdb, the-trivia-api, steamspy, tvmaze, anilist(+manga ext), kitsu, wikidata(p18+p154 games), enwiki lists+infobox scrape, enwiki pageimages\n`;
  fs.writeFileSync(REPORT, rep);
  console.log(rep);
})().catch((e) => { console.log("PASS5_FAIL", e && e.message); process.exit(1); });

