#!/usr/bin/env node
/* build_quiz_dataset_pass4.js — final gentle movies image top-up.
 * Wikimedia throttled us earlier; this pass runs SLOW (2.5s between API
 * calls) so it fits the polite window. Adds: film poster images (pageimages,
 * verified via enwiki imageinfo batches) + infobox directors.
 * Merges into data/quizDataset.json (v4). */
'use strict';
const fs = require("fs");
let axios;
try { axios = require("axios"); } catch { axios = require("/home/ubuntu/whatsapp-bot/node_modules/axios"); }
const OUT = "/home/ubuntu/whatsapp-bot/data/quizDataset.json";
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
      const r = await axios.get(url, { timeout: 25000, headers: { "User-Agent": UA, ...(opts.headers || {}) }, maxContentLength: 60 * 1024 * 1024 });
      return r.data;
    } catch (e) {
      const status = e && e.response && e.response.status;
      if (status === 429) { console.log("  (429 - cooling 45s)"); await sleep(45000); continue; }
      if (i === tries - 1) throw e;
      await sleep(4000);
    }
  }
}
function fileTitleFromUploadUrl(url) {
  try { const u = new URL(url); const segs = u.pathname.split("/"); return decodeURIComponent(segs[segs.length - 1]); } catch { return null; }
}
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
      await sleep(2500);
    }
  }
  return ok;
}

(async () => {
  // 1. film lists (same sources as pass 3)
  const films = new Map();
  for (const page of ["List of Academy Award–winning films", "List of highest-grossing films", "List of highest-grossing animated films"]) {
    try {
      const d = await jget(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2`);
      const wt = (d && d.parse && d.parse.wikitext) || "";
      const linkRe = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
      let m;
      while ((m = linkRe.exec(wt))) {
        const mm = /^(.*?)\s*\((\d{4})\s*(?:film)?\)$/.exec(m[1].trim());
        if (mm) {
          const title = mm[1].replace(/''/g, "").trim();
          const year = +mm[2];
          if (title && title.length > 1 && year >= 1920 && year <= 2026 && !films.has(title)) films.set(title, year);
        }
      }
    } catch {}
    await sleep(2500);
  }
  console.log(`[films] ${films.size} titles`);
  const titles = [...films.keys()];

  // 2. directors (paced 2.5s per batch of 10)
  const directors = new Map();
  for (const grp of chunk(titles.slice(0, 350), 10)) {
    const t10 = grp.map(([t]) => t);
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "revisions", rvprop: "content", rvslots: "main", titles: t10.join("|"), redirects: "1" });
    try {
      const d = await jget(`https://en.wikipedia.org/w/api.php?${params}`);
      const pages = (d.query && d.query.pages) || [];
      const norm = new Map((((d.query || {}).normalized) || []).map((n) => [n.from, n.to]));
      const redir = new Map((((d.query || {}).redirects) || []).map((n) => [n.from, n.to]));
      for (const t of t10) {
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
        if (dir && dir.length > 2 && dir.length < 40 && !/[{}|<>]/.test(dir)) directors.set(t, dir.trim());
      }
    } catch {}
    await sleep(2500);
  }
  console.log(`[directors] ${directors.size}/${Math.min(titles.length, 350)}`);
  {
    const years = [...new Set([...films.values()].map(String))];
    const dirPool = [...new Set(directors.values())];
    let n = 0;
    titles.forEach((t, i) => {
      const y = films.get(t);
      const diff = diffBand(i, titles.length);
      if (y) { const ym = mcq(String(y), years); if (ym && addText("movies", `In which year was the movie "${t}" released?`, ym.options, ym.correct, diff, "Movies")) n++; }
      const dir = directors.get(t);
      if (dir && dirPool.length > 10) { const dm = mcq(dir, dirPool); if (dm && addText("movies", `Who directed the movie "${t}"?`, dm.options, dm.correct, diff, "Movies")) n++; }
    });
    console.log(`[films] +${n} fact questions (deduped)`);
  }

  // 3. posters (paced)
  const imgs = new Map();
  for (const grp of chunk(titles.slice(0, 500), 20)) {
    const params = new URLSearchParams({ action: "query", format: "json", prop: "pageimages", piprop: "original|thumbnail", pithumbsize: "640", pilicense: "any", titles: grp.join("|"), redirects: "1" });
    try {
      const d = await jget(`https://en.wikipedia.org/w/api.php?${params}`);
      const pages = (d.query && d.query.pages) || [];
      const norm = new Map((((d.query || {}).normalized) || []).map((n) => [n.from, n.to]));
      const redir = new Map((((d.query || {}).redirects) || []).map((n) => [n.from, n.to]));
      for (const t of grp) {
        let want = norm.get(t) || t;
        want = redir.get(want) || want;
        const p = pages.find((pg) => pg.title === want);
        if (p && p.original && p.original.source) imgs.set(t, { original: p.original.source, thumb: p.thumbnail && p.thumbnail.source });
      }
    } catch {}
    await sleep(2500);
  }
  console.log(`[posters] ${imgs.size}/${Math.min(titles.length, 500)}`);
  const ftitles = [...new Set([...imgs.values()].map((v) => fileTitleFromUploadUrl(v.thumb || v.original)).filter(Boolean))];
  const verified = await imageinfoVerify(ftitles);
  console.log(`[posters] verified: ${verified.size}/${ftitles.length}`);
  let added = 0, i = 0;
  for (const [t, v] of imgs) {
    const url = verified.get(fileTitleFromUploadUrl(v.thumb || v.original));
    if (!url) continue;
    const m = mcq(t, titles);
    if (m && addImage("movies", { img: url, q: "Which movie is this poster from?", ...m, difficulty: diffBand(i++, imgs.size), topic: "Movies", subject: t, source: "enwiki-pageimage" })) added++;
  }
  console.log(`[posters] +${added} movie poster images`);

  // finalize
  for (const cat of Object.keys(DS.categories)) {
    DS.categories[cat].questions.forEach((q, i2) => { q.id = i2 + 1; });
    DS.categories[cat].images.forEach((q, i2) => { q.id = i2 + 1; });
    DS.counts[cat] = { text: DS.categories[cat].questions.length, images: DS.categories[cat].images.length };
  }
  DS.generatedAt = new Date().toISOString();
  DS.version = 4;
  const json = JSON.stringify(DS);
  fs.writeFileSync(OUT, json);
  console.log(`SAVED v4: ${Math.round(json.length / 1024)}KB`);
  for (const [c, n] of Object.entries(DS.counts)) console.log(`${c}: text=${n.text} images=${n.images}`);
})().catch((e) => { console.log("PASS4_FAIL", e && e.message); process.exit(1); });
