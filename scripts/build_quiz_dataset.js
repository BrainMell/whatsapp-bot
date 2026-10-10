#!/usr/bin/env node
/* build_quiz_dataset.js — dataset builder for the quiz overhaul (owner 2026-10-10).
 * Categories: games | comics | movies | series
 * Sources (keyless): OpenTDB, the-trivia-api, SteamSpy (games facts), TVMaze
 * (series posters + cast), AniList GraphQL (anime/manga covers + characters),
 * Wikidata SPARQL (film/game/comic facts + image file titles), en.wikipedia
 * pageimages (non-free cover art / posters via pilicense=any).
 * jservice.io is probed but optional (service currently down).
 * Every image URL is verified by real download at build time.
 * Output: data/quizDataset.json + data/quizDataset.report.txt
 */
'use strict';
const fs = require("fs");
const path = require("path");

const OUT = "/home/ubuntu/whatsapp-bot/data/quizDataset.json";
const REPORT = "/home/ubuntu/whatsapp-bot/data/quizDataset.report.txt";
const UA = "quiz-dataset-builder/1.0 (whatsapp-bot maintenance)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pool(items, conc, fn) {
  const q = items.slice(); const out = [];
  await Promise.all(Array.from({ length: conc }, async () => {
    while (q.length) { const it = q.shift(); try { out.push(await fn(it)); } catch (e) { out.push({ __err: String(e && e.message || e) }); } }
  }));
  return out;
}
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

function decodeHtml(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"');
}
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

let axios;
async function jget(url, opts = {}, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await axios.get(url, { timeout: opts.timeout || 20000, headers: { "User-Agent": UA, ...(opts.headers || {}) }, maxContentLength: 60 * 1024 * 1024 });
      return r.data;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 + i * 2500);
    }
  }
}

// ── dataset accumulators ──
const DS = { generatedAt: null, version: 1, counts: {}, categories: {} };
for (const c of ["games", "comics", "movies", "series"]) DS.categories[c] = { questions: [], images: [] };
const seenStems = new Set();     // dedupe text questions by norm stem
const seenImg = new Set();       // dedupe images by url

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
  // entry: {img, q, options, correct, difficulty, topic, subject, source}
  if (!entry || !entry.img || seenImg.has(entry.img)) return false;
  seenImg.add(entry.img);
  if (!entry.q || !entry.options || entry.options.length !== 4 || entry.correct == null) return false;
  if (new Set(entry.options.map(normKey)).size !== 4) return false;
  DS.categories[cat].images.push({ ...entry, difficulty: ["easy", "medium", "hard"].includes(entry.difficulty) ? entry.difficulty : "medium" });
  return true;
}
// shuffle helper (Fisher-Yates)
function _sh(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
// build MCQ options: answer + 3 unique distractors, returns {options, correct}
function mcq(answer, distractors) {
  const d = _sh([...new Set(distractors.filter((x) => x && normKey(x) !== normKey(answer)))].map(String)).slice(0, 3);
  if (d.length < 3) return null;
  const options = _sh([String(answer), ...d]);
  return { options, correct: options.findIndex((o) => normKey(o) === normKey(answer)) };
}
function diffBand(rank, total) { const p = rank / Math.max(1, total); return p < 0.3 ? "easy" : p < 0.7 ? "medium" : "hard"; }

// ════════════════════════════════════════════
// 1) OpenTDB (keyless, session token)
// ════════════════════════════════════════════
async function srcOpenTDB() {
  const CATS = { 15: "games", 11: "movies", 14: "series", 29: "comics", 31: "series", 32: "series" };
  const TOPIC = { 15: "Video Games", 11: "Movies", 14: "TV Series", 29: "Comics", 31: "Anime & Manga", 32: "Cartoons" };
  let token = null;
  try { token = (await jget("https://opentdb.com/api_token.php?command=request", { timeout: 15000 })).token; } catch { token = null; }
  let n = 0;
  for (const [cid, cat] of Object.entries(CATS)) {
    for (let page = 0; page < 30; page++) {
      const url = `https://opentdb.com/api.php?amount=50&category=${cid}&type=multiple${token ? `&token=${token}` : ""}`;
      let d;
      try { d = await jget(url, { timeout: 15000 }); } catch { break; }
      if (!d || d.response_code !== 0 || !Array.isArray(d.results) || !d.results.length) break;
      let added = 0;
      for (const r of d.results) {
        const opts = [r.correct_answer, ...(r.incorrect_answers || [])];
        const order = _sh([0, 1, 2, 3]);
        const options = order.map((i) => opts[i]);
        const correct = options.findIndex((o) => o === r.correct_answer);
        if (addText(cat, r.question, options, correct, r.difficulty, TOPIC[cid])) added++;
      }
      n += added;
      if (token) { try { await jget(`https://opentdb.com/api_token.php?command=reset&token=${token}`, { timeout: 10000 }); } catch {} }
      if (d.results.length < 50) break;
      await sleep(700);
    }
  }
  console.log(`[opentdb] +${n} text questions`);
}

// ════════════════════════════════════════════
// 2) the-trivia-api (keyless)
// ════════════════════════════════════════════
async function srcTriviaApi() {
  const TV_RE = /\btv\b|television|series|episode|sitcom|streaming|netflix|season/i;
  const FILM_RE = /film|movie|cinema|director|actor|actress|oscars?\b|hollywood|box.?office/i;
  let n = 0;
  for (const [c, catHint] of [["video_games", "games"], ["film_and_tv", "split"], ["music", null], ["general_knowledge", null]]) {
    if (!catHint) continue; // only media categories per owner spec
    for (const diff of ["easy", "medium", "hard"]) {
      for (let page = 1; page <= 6; page++) {
        let d;
        try { d = await jget(`https://the-trivia-api.com/v2/questions?categories=${c}&limit=50&difficulty=${diff}&page=${page}`, { timeout: 15000 }); } catch { break; }
        if (!Array.isArray(d) || !d.length) break;
        for (const r of d) {
          const cat = catHint === "split" ? (TV_RE.test(r.question) ? "series" : FILM_RE.test(r.question) ? "movies" : "movies") : catHint;
          const opts = _sh([r.correctAnswer, ...(r.incorrectAnswers || [])]);
          const correct = opts.findIndex((o) => o === r.correctAnswer);
          if (addText(cat, r.question, opts, correct, r.difficulty, c === "video_games" ? "Video Games" : "Film & TV")) n++;
        }
        await sleep(400);
      }
    }
  }
  console.log(`[trivia-api] +${n} text questions`);
}

// ════════════════════════════════════════════
// 3) jservice.io (optional — service often down)
// ════════════════════════════════════════════
async function srcJservice() {
  try {
    await jget("https://jservice.io/api/random?count=1", { timeout: 8000 }, 1);
  } catch {
    console.log("[jservice] unreachable — skipping");
    return;
  }
  // discover entertainment categories then pull clues
  const want = /video game|comic|film|movie|televis|cartoon|animated|anime|disney|sitcom/i;
  const catIds = [];
  for (let off = 0; off < 20000 && catIds.length < 120; off += 500) {
    let d;
    try { d = await jget(`https://jservice.io/api/categories?count=500&offset=${off}`, { timeout: 12000 }); } catch { break; }
    if (!Array.isArray(d) || !d.length) break;
    for (const c of d) if (want.test(c.title || "")) catIds.push({ id: c.id, title: c.title });
    await sleep(300);
  }
  const CATMAP = { game: "games", comic: "comics", film: "movies", movie: "movies", televis: "series", cartoon: "series", animated: "series", anime: "series", disney: "series", sitcom: "series" };
  const poolByCat = { games: [], comics: [], movies: [], series: [] };
  for (const c of catIds.slice(0, 60)) {
    const key = Object.keys(CATMAP).find((k) => (c.title || "").toLowerCase().includes(k));
    if (!key) continue;
    for (let off = 0; off < 200; off += 100) {
      let d;
      try { d = await jget(`https://jservice.io/api/clues?category=${c.id}&offset=${off}`, { timeout: 12000 }); } catch { break; }
      if (!Array.isArray(d) || !d.length) break;
      for (const clue of d) {
        const q = decodeHtml(clue.question || "").replace(/<[^>]+>/g, "").trim();
        const a = decodeHtml(clue.answer || "").replace(/<[^>]+>/g, "").replace(/^"/, "").replace(/"$/, "").replace(/\\'/g, "'").trim();
        if (!q || !a || q.includes("href=") || q.length < 15 || q.length > 220) continue;
        if (/[():]/.test(a) || a.length > 40) continue;
        poolByCat[CATMAP[key]].push({ q: a, value: clue.value || 200, cat: CATMAP[key] });
      }
      await sleep(250);
    }
  }
  // turn clue answers into MCQs: "clue is the answer; stem = question" — distractors = same-category answers of similar length
  let n = 0;
  for (const cat of Object.keys(poolByCat)) {
    const arr = poolByCat[cat];
    const answers = arr.map((x) => x.q);
    for (const clue of arr) {
      const near = answers.filter((a) => Math.abs(a.length - clue.q.length) <= 8 && normKey(a) !== normKey(clue.q));
      const m = mcq(clue.q, _sh(near));
      if (!m) continue;
      const diff = clue.value >= 800 ? "hard" : clue.value >= 400 ? "medium" : "easy";
      if (addText(cat, clue.q, m.options, m.correct, diff, cat === "games" ? "Video Games" : cat === "comics" ? "Comics" : cat === "movies" ? "Movies" : "TV Series")) n++;
    }
  }
  console.log(`[jservice] +${n} text questions`);
}

// ════════════════════════════════════════════
// 4) SteamSpy — top games: developer/publisher facts
// ════════════════════════════════════════════
async function srcSteamSpy() {
  const games = [];
  for (let page = 0; page < 3; page++) {
    let d;
    try { d = await jget(`https://steamspy.com/api.php?request=all&page=${page}`, { timeout: 25000 }); } catch { break; }
    for (const [appid, g] of Object.entries(d || {})) {
      if (!g || !g.name) continue;
      games.push({ appid, name: g.name, developer: g.developer || "", publisher: g.publisher || "", owners: g.owners || "", rank: games.length });
    }
    await sleep(600);
  }
  console.log(`[steamspy] ${games.length} games fetched`);
  global.__steamGames = games; // reused by image stage + wikidata merge
  const devs = games.map((g) => g.developer).filter((v) => v && !/unknown/i.test(v) && v.split(/[,;]/).length === 1);
  const pubs = games.map((g) => g.publisher).filter((v) => v && !/unknown/i.test(v) && v.split(/[,;]/).length === 1);
  let n = 0;
  const cap = Math.min(games.length, 700);
  for (let i = 0; i < cap; i++) {
    const g = games[i];
    const diff = diffBand(i, cap);
    if (g.developer && !/unknown/i.test(g.developer) && g.developer.split(/[,;]/).length === 1) {
      const m = mcq(g.developer, devs);
      if (m && addText("games", `Which studio developed the game "${g.name}"?`, m.options, m.correct, diff, "Video Games")) n++;
    }
    if (g.publisher && !/unknown/i.test(g.publisher) && g.publisher.split(/[,;]/).length === 1 && normKey(g.publisher) !== normKey(g.developer || "")) {
      const m = mcq(g.publisher, pubs);
      if (m && addText("games", `Which company published "${g.name}"?`, m.options, m.correct, diff, "Video Games")) n++;
    }
  }
  console.log(`[steamspy] +${n} text questions`);
}

// ════════════════════════════════════════════
// 5) TVMaze — series posters, premiere years, cast
// ════════════════════════════════════════════
async function srcTVMaze() {
  const shows = [];
  for (let page = 0; page < 14; page++) {
    let d;
    try { d = await jget(`https://api.tvmaze.com/shows?page=${page}`, { timeout: 25000 }); } catch { break; }
    if (!Array.isArray(d) || !d.length) break;
    for (const s of d) {
      if (!s.name || !s.image || !s.image.original) continue;
      if (String(s.language || "") !== "English") continue;
      shows.push({ id: s.id, name: s.name, img: s.image.original, premiered: s.premiered ? +String(s.premiered).slice(0, 4) : null, rating: s.rating && s.rating.average || 0, genres: s.genres || [], type: s.type || "" });
    }
    await sleep(500);
  }
  console.log(`[tvmaze] ${shows.length} shows fetched`);
  global.__tvShows = shows;
  const years = shows.map((s) => s.premiered).filter(Boolean);
  const names = shows.map((s) => s.name);
  // image questions: poster → name
  let n = 0;
  const imgCount = Math.min(shows.length, 1400);
  for (let i = 0; i < imgCount; i++) {
    const s = shows[i];
    const m = mcq(s.name, names);
    if (!m) continue;
    if (addImage("series", { img: s.img, q: "Which TV series is this poster from?", ...m, difficulty: diffBand(i, imgCount), topic: s.type === "Animation" ? "Cartoons" : "TV Series", subject: s.name, source: "tvmaze" })) n++;
  }
  // premiere year questions
  let y = 0;
  const yCap = Math.min(shows.length, 900);
  for (let i = 0; i < yCap; i++) {
    const s = shows[i];
    if (!s.premiered || s.premiered < 1950 || s.premiered > 2025) continue;
    const m = mcq(String(s.premiered), years);
    if (!m) continue;
    if (addText("series", `In which year did the series "${s.name}" premiere?`, m.options, m.correct, diffBand(i, yCap), "TV Series")) y++;
  }
  console.log(`[tvmaze] +${n} images, +${y} year questions`);
  // cast: "Who plays <character> in <show>?" — actor photo as clue
  const top = shows.filter((s) => s.rating >= 7).slice(0, 450);
  const castShows = [];
  await pool(top, 6, async (s) => {
    let d;
    try { d = await jget(`https://api.tvmaze.com/shows/${s.id}/cast`, { timeout: 15000 }); } catch { return; }
    if (!Array.isArray(d) || d.length < 4) return;
    const members = d.slice(0, 8)
      .map((c) => ({ character: c.character && c.character.name, actor: c.person && c.person.name, actorImg: c.person && c.person.image && (c.person.image.original || c.person.image.medium), charImg: c.character && c.character.image && (c.character.image.original || c.character.image.medium) }))
      .filter((m) => m.character && m.actor && m.actorImg);
    if (members.length >= 4) castShows.push({ show: s.name, members });
    await sleep(120);
  });
  let cn = 0, chn = 0;
  for (const cs of castShows) {
    const actors = cs.members.map((m) => m.actor);
    const chars = cs.members.map((m) => m.character);
    for (const m of cs.members) {
      const am = mcq(m.actor, actors);
      if (am && addImage("series", { img: m.actorImg, q: `Who plays "${m.character}" in ${cs.show}?`, ...am, difficulty: "medium", topic: "TV Series", subject: `${m.actor} (${cs.show})`, source: "tvmaze-cast" })) cn++;
      if (m.charImg) {
        const cm = mcq(m.character, chars);
        if (cm && addImage("series", { img: m.charImg, q: `Which character (from ${cs.show}) is this?`, ...cm, difficulty: "medium", topic: "TV Series", subject: `${m.character} (${cs.show})`, source: "tvmaze-cast" })) chn++;
      }
    }
  }
  console.log(`[tvmaze] +${cn} cast images, +${chn} character images (from ${castShows.length} shows)`);
}

// ════════════════════════════════════════════
// 6) AniList — anime posters + characters, manga covers
// ════════════════════════════════════════════
async function anilistPost(query, variables) {
  const r = await axios.post("https://graphql.anilist.co", { query, variables }, { timeout: 20000, headers: { "Content-Type": "application/json", "User-Agent": UA } });
  return r.data;
}
async function srcAniList() {
  const MEDIA_Q = `query ($page: Int, $type: MediaType) { Page(page: $page, perPage: 50) { media(type: $type, sort: POPULARITY_DESC, isAdult: false) { id title { romaji english } coverImage { large } startDate { year } studios(isMain: true) { nodes { name } } genres } } }`;
  const anime = [], manga = [];
  for (let p = 1; p <= 6; p++) {
    let d;
    try { d = await anilistPost(MEDIA_Q, { page: p, type: "ANIME" }); } catch { break; }
    const ms = d?.data?.Page?.media || [];
    for (const m of ms) if (m.coverImage && m.coverImage.large) anime.push({ name: m.title.english || m.title.romaji, img: m.coverImage.large, year: m.startDate && m.startDate.year, studio: m.studios && m.studios.nodes && m.studios.nodes[0] && m.studios.nodes[0].name, genres: m.genres || [] });
    if (ms.length < 50) break;
    await sleep(2200); // ~30/min ceiling
  }
  for (let p = 1; p <= 4; p++) {
    let d;
    try { d = await anilistPost(MEDIA_Q, { page: p, type: "MANGA" }); } catch { break; }
    const ms = d?.data?.Page?.media || [];
    for (const m of ms) if (m.coverImage && m.coverImage.large) manga.push({ name: m.title.english || m.title.romaji, img: m.coverImage.large, year: m.startDate && m.startDate.year });
    if (ms.length < 50) break;
    await sleep(2200);
  }
  console.log(`[anilist] ${anime.length} anime, ${manga.length} manga`);
  global.__anime = anime; global.__manga = manga;
  // anime → series: poster + year + studio
  let n = 0, y = 0, st = 0;
  const years = anime.map((a) => a.year).filter(Boolean).map(String);
  const studios = [...new Set(anime.map((a) => a.studio).filter(Boolean))];
  const namesA = anime.map((a) => a.name);
  const cap = Math.min(anime.length, 300);
  for (let i = 0; i < cap; i++) {
    const a = anime[i];
    const diff = diffBand(i, cap);
    const m = mcq(a.name, namesA);
    if (m && addImage("series", { img: a.img, q: "Which anime series is this poster from?", ...m, difficulty: diff, topic: "Anime", subject: a.name, source: "anilist" })) n++;
    if (a.year && a.year >= 1960 && a.year <= 2025) { const ym = mcq(String(a.year), years); if (ym && addText("series", `In which year did the anime "${a.name}" premiere?`, ym.options, ym.correct, diff, "Anime")) y++; }
    if (a.studio && studios.length > 10) { const sm = mcq(a.studio, studios); if (sm && addText("series", `Which animation studio produced "${a.name}"?`, sm.options, sm.correct, diff, "Anime")) st++; }
  }
  // manga → comics covers + year
  let mn = 0, my = 0;
  const namesM = manga.map((m) => m.name);
  const mcap = Math.min(manga.length, 250);
  for (let i = 0; i < mcap; i++) {
    const m0 = manga[i];
    const diff = diffBand(i, mcap);
    const m = mcq(m0.name, namesM);
    if (m && addImage("comics", { img: m0.img, q: "Which manga is this cover from?", ...m, difficulty: diff, topic: "Manga", subject: m0.name, source: "anilist" })) mn++;
    if (m0.year && m0.year >= 1950 && m0.year <= 2025) { const ym = mcq(String(m0.year), years); if (ym && addText("comics", `In which year was the manga "${m0.name}" first published?`, ym.options, ym.correct, diff, "Manga")) my++; }
  }
  console.log(`[anilist] +${n} anime posters, +${y} anime years, +${st} studios, +${mn} manga covers, +${my} manga years`);
  // characters for top anime: "Which character is this?" options from same show
  const CHAR_Q = `query ($id: Int) { Media(id: $id, type: ANIME) { characters(sort: FAVOURITES_DESC, perPage: 8) { edges { node { name { full } image { large } } } } } }`;
  let cn = 0;
  const topIds = [];
  for (let p = 1; p <= 2; p++) {
    let d;
    try { d = await anilistPost(`query ($page: Int) { Page(page: $page, perPage: 50) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { id } } }`, { page: p }); } catch { break; }
    for (const m of (d?.data?.Page?.media || [])) topIds.push(m.id);
    await sleep(2200);
  }
  // we need names again for subject; refetch minimal for the ids we use
  for (const id of topIds.slice(0, 60)) {
    let d;
    try { d = await anilistPost(CHAR_Q, { id }); } catch { await sleep(2200); continue; }
    const edges = (d?.data?.Media?.characters?.edges || []).map((e) => e.node).filter((c) => c && c.image && c.image.large && c.name && c.name.full);
    const show = (global.__anime || []).find((a) => a._id === id);
    if (edges.length >= 4) {
      const chars = edges.map((c) => c.name.full);
      for (const c of edges) {
        const m = mcq(c.name.full, chars);
        if (m && addImage("series", { img: c.image.large, q: `Which character is this?`, ...m, difficulty: "medium", topic: "Anime", subject: c.name.full, source: "anilist-characters" })) cn++;
      }
    }
    await sleep(2200);
  }
  console.log(`[anilist] +${cn} character images`);
}

// ════════════════════════════════════════════
// 7) Wikidata SPARQL — film facts + comic characters w/ images
// ════════════════════════════════════════════
async function wdQuery(sparql) {
  const url = "https://query.wikidata.org/sparql?format=json";
  const d = await axios.post(url, new URLSearchParams({ query: sparql }).toString(), { timeout: 60000, headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" }, maxContentLength: 80 * 1024 * 1024 });
  return d.data;
}
function wdRows(d) { return (d && d.results && d.results.bindings) || []; }
const wdVal = (b, k) => (b[k] && (b[k].value || "")) || "";

async function srcWikidata() {
  // 7a. popular films: director + year facts (labels service)
  try {
    const q = `SELECT ?f ?fLabel ?dirLabel ?year WHERE {
      ?f wdt:P31/wdt:P279* wd:Q11424 ; wikibase:sitelinks ?sl ; wdt:P577 ?date .
      FILTER(?sl >= 25) OPTIONAL { ?f wdt:P57 ?dir }
      BIND(YEAR(?date) AS ?year) FILTER(?year >= 1930 && ?year <= 2025)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY DESC(?sl) LIMIT 700`;
    const rows = wdRows(await wdQuery(q));
    console.log(`[wikidata] ${rows.length} film rows`);
    const dirs = rows.map((r) => wdVal(r, "dirLabel")).filter(Boolean);
    const years = rows.map((r) => wdVal(r, "year")).filter(Boolean);
    const filmTitles = rows.map((r) => wdVal(r, "fLabel"));
    global.__filmTitles = filmTitles;
    let n = 0;
    rows.forEach((r, i) => {
      const name = wdVal(r, "fLabel"); const dir = wdVal(r, "dirLabel"); const yr = wdVal(r, "year");
      const diff = diffBand(i, rows.length);
      if (dir && dirs.length > 10) { const m = mcq(dir, dirs); if (m && addText("movies", `Who directed the movie "${name}"?`, m.options, m.correct, diff, "Movies")) n++; }
      if (yr) { const m = mcq(yr, years); if (m && addText("movies", `In which year was the movie "${name}" released?`, m.options, m.correct, diff, "Movies")) n++; }
    });
    console.log(`[wikidata] +${n} film fact questions`);
  } catch (e) { console.log(`[wikidata] films failed: ${String(e && e.message || e).slice(0, 90)}`); }
  await sleep(6000);
  // 7b. comic characters with images (P18)
  try {
    const q = `SELECT ?c ?cLabel ?img WHERE {
      ?c wdt:P31/wdt:P279* wd:Q1114461 ; wikibase:sitelinks ?sl ; wdt:P18 ?img .
      FILTER(?sl >= 8)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY DESC(?sl) LIMIT 400`;
    const rows = wdRows(await wdQuery(q));
    console.log(`[wikidata] ${rows.length} comic character rows`);
    const names = rows.map((r) => wdVal(r, "cLabel")).filter(Boolean);
    global.__comicChars = rows.map((r) => ({ name: wdVal(r, "cLabel"), img: wdVal(r, "img") })).filter((x) => x.name && x.img);
    let n = 0;
    global.__comicChars.forEach((c, i) => {
      const m = mcq(c.name, names);
      if (m && addImage("comics", { img: c.img, q: "Which comic character is this?", ...m, difficulty: diffBand(i, global.__comicChars.length), topic: "Comics", subject: c.name, source: "wikidata-p18" })) n++;
    });
    console.log(`[wikidata] +${n} comic character images`);
  } catch (e) { console.log(`[wikidata] comics failed: ${String(e && e.message || e).slice(0, 90)}`); }
  await sleep(6000);
  // 7c. comic book series covers (P18) → comics
  try {
    const q = `SELECT ?s ?sLabel ?img ?pubLabel WHERE {
      { ?s wdt:P31 wd:Q747544 } UNION { ?s wdt:P31 wd:Q1004 } UNION { ?s wdt:P31/wdt:P279* wd:Q1046307 }
      ?s wdt:P18 ?img ; wikibase:sitelinks ?sl .
      FILTER(?sl >= 6)
      OPTIONAL { ?s wdt:P123 ?pub }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY DESC(?sl) LIMIT 300`;
    const rows = wdRows(await wdQuery(q));
    const pubs = rows.map((r) => wdVal(r, "pubLabel")).filter(Boolean);
    let n = 0, p = 0;
    const series = rows.map((r) => ({ name: wdVal(r, "sLabel"), img: wdVal(r, "img"), pub: wdVal(r, "pubLabel") })).filter((x) => x.name && x.img);
    series.forEach((s, i) => {
      const m = mcq(s.name, series.map((x) => x.name));
      if (m && addImage("comics", { img: s.img, q: "Which comic series is this cover from?", ...m, difficulty: diffBand(i, series.length), topic: "Comics", subject: s.name, source: "wikidata-p18" })) n++;
      if (s.pub && pubs.length > 10) { const pm = mcq(s.pub, pubs); if (pm && addText("comics", `Which publisher is behind the comic "${s.name}"?`, pm.options, pm.correct, "medium", "Comics")) p++; }
    });
    console.log(`[wikidata] +${n} comic covers, +${p} publisher questions`);
  } catch (e) { console.log(`[wikidata] comic series failed: ${String(e && e.message || e).slice(0, 90)}`); }
}

// ════════════════════════════════════════════
// 8) en.wikipedia pageimages — game covers + film posters (non-free OK)
// ════════════════════════════════════════════
async function enwikiPageImages(titles) {
  // batches of 20; returns Map title -> {original, thumb}
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
    await sleep(300);
  }
  return out;
}
async function srcEnwikiImages() {
  // 8a. game covers from top SteamSpy names
  const games = global.__steamGames || [];
  const gTitles = games.slice(0, 900).map((g) => g.name);
  const gImgs = await enwikiPageImages(gTitles);
  console.log(`[enwiki] ${gImgs.size}/${gTitles.length} game page images`);
  const gameNames = games.map((g) => g.name);
  let n = 0, i = 0;
  for (const [title, info] of gImgs) {
    const m = mcq(title, gameNames);
    if (m && addImage("games", { img: info.thumb || info.original, q: "Which video game is this the cover art of?", ...m, difficulty: diffBand(i++, gImgs.size), topic: "Video Games", subject: title, source: "enwiki-pageimage" })) n++;
  }
  console.log(`[enwiki] +${n} game cover images`);
  // 8b. film posters from Wikidata film titles
  const films = global.__filmTitles || [];
  const fImgs = await enwikiPageImages(films.slice(0, 800));
  console.log(`[enwiki] ${fImgs.size}/${Math.min(films.length, 800)} film page images`);
  let fn = 0, fi = 0;
  for (const [title, info] of fImgs) {
    const m = mcq(title, films);
    if (m && addImage("movies", { img: info.thumb || info.original, q: "Which movie is this poster from?", ...m, difficulty: diffBand(fi++, fImgs.size), topic: "Movies", subject: title, source: "enwiki-pageimage" })) fn++;
  }
  console.log(`[enwiki] +${fn} movie poster images`);
}

// ════════════════════════════════════════════
// 9) verify every image URL by real download
// ════════════════════════════════════════════
async function verifyImages() {
  let total = 0, dropped = 0;
  for (const cat of Object.keys(DS.categories)) {
    const imgs = DS.categories[cat].images;
    const results = await pool(imgs, 10, async (e) => {
      try {
        const r = await axios.get(e.img, { timeout: 20000, maxContentLength: 8 * 1024 * 1024, responseType: "arraybuffer", headers: { "User-Agent": UA } });
        const buf = Buffer.from(r.data);
        const mime = String(r.headers["content-type"] || "");
        const magic = buf.length > 8 && (buf[0] === 0x89 || buf[0] === 0xff || buf.slice(0, 3).toString() === "GIF" || buf.slice(0, 4).toString() === "RIFF");
        if (buf.length >= 2500 && (mime.startsWith("image/") || magic)) return { e, ok: true };
        return { e, ok: false };
      } catch { return { e, ok: false }; }
    });
    const kept = results.filter((r) => r.ok).map((r) => r.e);
    dropped += imgs.length - kept.length;
    total += kept.length;
    DS.categories[cat].images = kept;
    console.log(`[verify] ${cat}: kept ${kept.length}/${imgs.length}`);
  }
  console.log(`[verify] total kept ${total}, dropped ${dropped}`);
}

// ════════════════════════════════════════════
// main
// ════════════════════════════════════════════
(async () => {
  const t0 = Date.now();
  try { axios = require("axios"); } catch { try { axios = require("/home/ubuntu/whatsapp-bot/node_modules/axios"); } catch { console.log("FATAL: axios missing"); process.exit(1); } }
  const steps = [
    ["opentdb", srcOpenTDB], ["trivia-api", srcTriviaApi], ["jservice", srcJservice],
    ["steamspy", srcSteamSpy], ["tvmaze", srcTVMaze], ["anilist", srcAniList],
    ["wikidata", srcWikidata], ["enwiki-images", srcEnwikiImages],
  ];
  for (const [name, fn] of steps) {
    try { await fn(); } catch (e) { console.log(`[${name}] FATAL-SKIP: ${String(e && e.message || e).slice(0, 120)}`); }
    await sleep(1000);
  }
  await verifyImages();
  // assign stable ids + counts
  for (const cat of Object.keys(DS.categories)) {
    DS.categories[cat].questions.forEach((q, i) => { q.id = i + 1; });
    DS.categories[cat].images.forEach((q, i) => { q.id = i + 1; });
    DS.counts[cat] = { text: DS.categories[cat].questions.length, images: DS.categories[cat].images.length };
  }
  DS.generatedAt = new Date().toISOString();
  const json = JSON.stringify(DS);
  fs.writeFileSync(OUT, json);
  let rep = `quizDataset v1 — ${DS.generatedAt}\nbuilt in ${Math.round((Date.now() - t0) / 1000)}s, ${Math.round(json.length / 1024)}KB\n`;
  for (const [c, n] of Object.entries(DS.counts)) rep += `${c}: text=${n.text} images=${n.images}\n`;
  rep += `sources: opentdb, the-trivia-api, jservice(optional), steamspy, tvmaze, anilist, wikidata, enwiki-pageimages\n`;
  fs.writeFileSync(REPORT, rep);
  console.log(rep);
})().catch((e) => { console.log("BUILD_FAIL", e); process.exit(1); });
