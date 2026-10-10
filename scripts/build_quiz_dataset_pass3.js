#!/usr/bin/env node
/* build_quiz_dataset_pass3.js — movies scraper + imageinfo-based image rescue.
 * MOVIES (real scraping, keyless, no Wikidata):
 *   1. enwiki "List of Academy Award-winning films" + "List of highest-grossing films"
 *      -> wikitext via API -> parse title+year pairs
 *   2. infobox scrape (action=query&prop=revisions&rvprop=content) for directors
 *   3. posters via pageimages (pilicense=any)
 *   4. ALL images verified via enwiki imageinfo API (batch 50) — no downloads
 * GAMES: re-pull SteamSpy top names -> pageimages -> imageinfo verify (rescues pass-1/2 throttling losses)
 * Merges into data/quizDataset.json. */
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
      const r = await axios.get(url, { timeout: opts.timeout || 20000, headers: { "User-Agent": UA, ...(opts.headers || {}) }, maxContentLength: 60 * 1024 * 1024 });
      return r.data;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2500 + i * 3000);
    }
  }
}

// ── 1. film lists from enwiki wikitext ──
function parseWikitextTitles(wikitext, re) {
  const found = new Map(); // title -> year
  // match [[Film (year)|...]] or [[Film|Title (year)]] patterns inside table rows / links
  const linkRe = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = linkRe.exec(wikitext))) {
    const link = m[1].trim();
    const mm = /^(.*?)\s*\((\d{4})\s*(?:film)?\)$/.exec(link);
    if (mm) {
      const title = mm[1].replace(/''/g, "").trim();
      const year = +mm[2];
      if (title && title.length > 1 && year >= 1920 && year <= 2026 && !found.has(title)) found.set(title, year);
    }
  }
  return found;
}
async function scrapeFilmLists() {
  const out = new Map();
  const pages = [
    "List of Academy Award–winning films",
    "List of highest-grossing films",
    "List of highest-grossing animated films",
  ];
  for (const page of pages) {
    try {
      const d = await jget(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2`, { timeout: 30000 });
      const wt = d && d.parse && d.parse.wikitext || "";
      const found = parseWikitextTitles(wt);
      console.log(`[lists] ${page}: +${found.size} films`);
      for (const [t, y] of found) if (!out.has(t)) out.set(t, y);
    } catch (e) { console.log(`[lists] ${page} failed: ${String(e && e.message || e).slice(0, 80)}`); }
    await sleep(800);
  }
  return out;
}

// ── 2. infobox director scrape ──
async function scrapeDirectors(films) {
  // films: Map title->year. Returns Map title->director (single-name only)
  const out = new Map();
  const entries = [...films.entries()].slice(0, 400);
  for (const grp of chunk(entries, 10)) {
    const titles = grp.map(([t]) => t);
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "revisions", rvprop: "content", rvslots: "main", titles: titles.join("|"), redirects: "1" });
    try {
      const d = await jget(`https://en.wikipedia.org/w/api.php?${params}`, { timeout: 30000 });
      const pages = (d.query && d.query.pages) || [];
      const norm = new Map((((d.query || {}).normalized) || []).map((n) => [n.from, n.to]));
      const redir = new Map((((d.query || {}).redirects) || []).map((n) => [n.from, n.to]));
      for (const t of titles) {
        let want = norm.get(t) || t;
        want = redir.get(want) || want;
        const pg = pages.find((p) => p.title === want);
        const wt = pg && pg.revisions && pg.revisions[0] && pg.revisions[0].slots && pg.revisions[0].slots.main && pg.revisions[0].slots.main.content;
        if (!wt) continue;
        const im = /\|\s*director\s*=\s*([^\n]{2,120})/i.exec(wt);
        if (!im) continue;
        let dir = im[1];
        const lm = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(dir);
        if (lm) dir = lm[1];
        dir = dir.replace(/''*/g, "").replace(/<[^>]+>/g, "").split(/<br|\band\b|&/)[0].trim();
        if (dir && dir.length > 2 && dir.length < 40 && !/[{}|<>]/.test(dir)) out.set(t, dir.trim());
      }
    } catch { continue; }
    await sleep(400);
  }
  console.log(`[directors] ${out.size}/${entries.length} films with infobox director`);
  return out;
}

// ── 3+4. posters + imageinfo verify ──
async function pageImages(titles) {
  const out = new Map();
  for (const grp of chunk(titles, 20)) {
    const params = new URLSearchParams({ action: "query", format: "json", prop: "pageimages", piprop: "original|thumbnail", pithumbsize: "640", pilicense: "any", titles: grp.join("|"), redirects: "1" });
    try {
      const d = await jget(`https://en.wikipedia.org/w/api.php?${params}`, { timeout: 25000 });
      const pages = (d && d.query && d.query.pages) || [];
      const norm = new Map((((d.query || {}).normalized) || []).map((n) => [n.from, n.to]));
      const redir = new Map((((d.query || {}).redirects) || []).map((n) => [n.from, n.to]));
      for (const t of grp) {
        let want = norm.get(t) || t;
        want = redir.get(want) || want;
        const p = pages.find((pg) => pg.title === want);
        if (p && p.original && p.original.source) out.set(t, { original: p.original.source, thumb: p.thumbnail && p.thumbnail.source });
      }
    } catch { continue; }
    await sleep(350);
  }
  return out;
}
function fileTitleFromUploadUrl(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/");
    return decodeURIComponent(segs[segs.length - 1]);
  } catch { return null; }
}
// batch imageinfo on enwiki (and Commons fallback) — returns Map fileTitle -> working thumb url
async function imageinfoVerify(fileTitles) {
  const ok = new Map();
  for (const grp of chunk([...fileTitles], 50)) {
    for (const host of ["https://en.wikipedia.org", "https://commons.wikimedia.org"]) {
      if (!grp.length) break;
      const params = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "640", titles: grp.map((t) => "File:" + t).join("|"), redirects: "1" });
      try {
        const d = await jget(`${host}/w/api.php?${params}`, { timeout: 25000 });
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
            grp.splice(grp.indexOf(t), 1); // found on this host; don't retry on the other
          }
        }
      } catch { /* try next host */ }
      await sleep(250);
    }
  }
  return ok;
}

(async () => {
  // ── MOVIES ──
  const films = await scrapeFilmLists();
  console.log(`[films] total unique: ${films.size}`);
  if (films.size) {
    const directors = await scrapeDirectors(films);
    const titles = [...films.keys()];
    const years = [...new Set([...films.values()].map(String))];
    const dirPool = [...new Set(directors.values())];
    let n = 0;
    titles.forEach((t, i) => {
      const y = films.get(t);
      const diff = diffBand(i, titles.length);
      const ym = mcq(String(y), years);
      if (ym && addText("movies", `In which year was the movie "${t}" released?`, ym.options, ym.correct, diff, "Movies")) n++;
      const dir = directors.get(t);
      if (dir && dirPool.length > 10) {
        const dm = mcq(dir, dirPool);
        if (dm && addText("movies", `Who directed the movie "${t}"?`, dm.options, dm.correct, diff, "Movies")) n++;
      }
    });
    console.log(`[films] +${n} fact questions`);
    // posters
    const imgs = await pageImages(titles.slice(0, 700));
    console.log(`[posters] ${imgs.size}/${Math.min(titles.length, 700)}`);
    const ftitles = [...new Set([...imgs.values()].map((v) => fileTitleFromUploadUrl(v.thumb || v.original)).filter(Boolean))];
    const verified = await imageinfoVerify(ftitles);
    console.log(`[posters] imageinfo verified: ${verified.size}/${ftitles.length}`);
    const allTitles = titles;
    let added = 0, i = 0;
    for (const [t, v] of imgs) {
      const ft = fileTitleFromUploadUrl(v.thumb || v.original);
      const url = verified.get(ft);
      if (!url) continue;
      const m = mcq(t, allTitles);
      if (m && addImage("movies", { img: url, q: "Which movie is this poster from?", ...m, difficulty: diffBand(i++, imgs.size), topic: "Movies", subject: t, source: "enwiki-pageimage" })) added++;
    }
    console.log(`[posters] +${added} movie poster images`);
  }

  // ── GAMES covers rescue (imageinfo verification) ──
  const steam = [];
  for (let page = 0; page < 3; page++) {
    let d;
    try { d = await jget(`https://steamspy.com/api.php?request=all&page=${page}`, { timeout: 25000 }); } catch { break; }
    for (const g of Object.values(d || {})) if (g && g.name) steam.push(g.name);
    await sleep(500);
  }
  if (steam.length) {
    const imgs = await pageImages(steam.slice(0, 900));
    console.log(`[game-covers] pageimages: ${imgs.size}/900`);
    const ftitles = [...new Set([...imgs.values()].map((v) => fileTitleFromUploadUrl(v.thumb || v.original)).filter(Boolean))];
    const verified = await imageinfoVerify(ftitles);
    console.log(`[game-covers] imageinfo verified: ${verified.size}/${ftitles.length}`);
    let added = 0, i = 0;
    for (const [t, v] of imgs) {
      const ft = fileTitleFromUploadUrl(v.thumb || v.original);
      const url = verified.get(ft);
      if (!url) continue;
      const m = mcq(t, steam);
      if (m && addImage("games", { img: url, q: "Which video game is this the cover art of?", ...m, difficulty: diffBand(i++, imgs.size), topic: "Video Games", subject: t, source: "enwiki-pageimage" })) added++;
    }
    console.log(`[game-covers] +${added} game cover images`);
  }

  // ── COMICS: P18 characters, batched imageinfo verification (fast) ──
  try {
    const q = `SELECT ?c ?cLabel ?img WHERE { ?c wdt:P31/wdt:P279* wd:Q1114461 ; wikibase:sitelinks ?sl ; wdt:P18 ?img . FILTER(?sl >= 8) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?sl) LIMIT 400`;
    const r = await axios.post("https://query.wikidata.org/sparql?format=json", new URLSearchParams({ query: q }).toString(), { timeout: 90000, headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" } });
    const rows = (r.data && r.data.results && r.data.results.bindings) || [];
    const wv = (b, k) => (b[k] && (b[k].value || "")) || "";
    const entries = rows.map((b) => ({ name: wv(b, "cLabel"), img: wv(b, "img") })).filter((x) => x.name && x.img);
    console.log(`[comics] ${entries.length} rows`);
    const fileTitles = entries.map((e) => decodeURIComponent((/Special:FilePath\/(.+)$/.exec(e.img) || [])[1] || "")).filter(Boolean);
    const verified = await imageinfoVerify([...fileTitles]);
    console.log(`[comics] imageinfo verified: ${verified.size}/${fileTitles.length}`);
    const names = entries.map((e) => e.name);
    let added = 0, i = 0;
    for (const e of entries) {
      const ft = decodeURIComponent((/Special:FilePath\/(.+)$/.exec(e.img) || [])[1] || "");
      const url = verified.get(ft);
      if (!url) continue;
      const m = mcq(e.name, names);
      if (m && addImage("comics", { img: url, q: "Which comic character is this?", ...m, difficulty: diffBand(i++, entries.length), topic: "Comics", subject: e.name, source: "wikidata-p18" })) added++;
    }
    console.log(`[comics] +${added} character images`);
  } catch (e) { console.log(`[comics] skipped: ${String(e && e.message || e).slice(0, 80)}`); }

  // finalize
  for (const cat of Object.keys(DS.categories)) {
    DS.categories[cat].questions.forEach((q, i) => { q.id = i + 1; });
    DS.categories[cat].images.forEach((q, i) => { q.id = i + 1; });
    DS.counts[cat] = { text: DS.categories[cat].questions.length, images: DS.categories[cat].images.length };
  }
  DS.generatedAt = new Date().toISOString();
  DS.version = 3;
  const json = JSON.stringify(DS);
  fs.writeFileSync(OUT, json);
  let rep = `quizDataset v3 — ${DS.generatedAt}\n${Math.round(json.length / 1024)}KB\n`;
  for (const [c, n] of Object.entries(DS.counts)) rep += `${c}: text=${n.text} images=${n.images}\n`;
  rep += `sources: opentdb, the-trivia-api, steamspy, tvmaze, anilist, wikidata(p18), enwiki lists+infobox scrape, enwiki pageimages\n`;
  fs.writeFileSync(REPORT, rep);
  console.log(rep);
})().catch((e) => { console.log("PASS3_FAIL", e); process.exit(1); });
