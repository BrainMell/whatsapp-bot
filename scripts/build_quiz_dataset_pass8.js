#!/usr/bin/env node
/* build_quiz_dataset_pass8.js — dataset v8 (owner 2026-10-10):
 *   "Get more questions ... investigate better ... make most of the questions
 *    type the answer instead of the ABCD ... allow multiple answers, not just
 *    the one"
 *
 * Stage A: convert suitable existing MCQs -> typed (fmt:"typed"): options
 *          collapse to [answer], correct:0, alts:[] (quiz.js matcher adds
 *          typo tolerance). ~80% of text + ~50% of image questions convert;
 *          option-referential stems and long answers stay MC.
 * Stage B: TVMaze show synopses -> "Which TV series matches this plot?" typed
 * Stage C: AniList anime + manga descriptions -> typed title questions with
 *          REAL alternative answers (romaji/english/synonyms) as alts
 * Stage D: Fandom wiki extracts (23 wikis) -> "who or what is being
 *          described" typed lore + character-art image questions (GET-verified)
 * Compose: v8 with per-category counts, lore% (>=90 enforced), typed% report.
 * Backup: data/quizDataset.json.bak-v8. Checkpoints in /tmp/pass8_*.json.
 */
'use strict';
const fs = require("fs");
const BOT = "/home/ubuntu/whatsapp-bot";
const OUT = `${BOT}/data/quizDataset.json`;
const REPORT = `${BOT}/data/quizDataset.report.txt`;
const UA = "quiz-dataset-builder/1.0 (whatsapp-bot maintenance)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

function decodeHtml(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"');
}
const stripHtml = (s) => decodeHtml(String(s || "")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
// mask every case-insensitive occurrence of any variant so the answer never leaks
function maskAll(text, variants) {
  let out = String(text || "");
  for (const v of variants) {
    if (!v || v.length < 3) continue;
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s]+/g, "[\\s]+");
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9])(${esc})(?=[^A-Za-z0-9]|$)`, "gi"), "$1____");
  }
  return out.replace(/\s+/g, " ").replace(/(\s*_{2,}\s*){2,}/g, " ____ ").trim();
}

let axios;
async function jget(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await axios.get(url, { timeout: 25000, headers: { "User-Agent": UA }, maxContentLength: 80 * 1024 * 1024 }); return r.data; }
    catch (e) {
      const st = e && e.response && e.response.status;
      if (i === tries - 1) throw e;
      await sleep(st === 429 ? 8000 : 1500 + i * 2500);
    }
  }
}

// ── existing stems for dedupe ──
const DS = JSON.parse(fs.readFileSync(OUT, "utf8"));
const seenStems = new Set();
for (const c of Object.values(DS.categories)) {
  for (const x of (c.questions || [])) seenStems.add(normKey(x.q));
  for (const x of (c.images || [])) seenStems.add(normKey(x.q + "|" + (x.subject || x.options[x.correct])));
}
const seenAns = new Set(); // plot questions: one per work
function dedupeKey(q) { return normKey(q.q + "|" + (q.alts && q.alts[0] || q.options[q.correct])); }

// ════════ STAGE A — convert existing MCQs to typed ════════
const OPT_REF = /\b(of (these|the following)|the following|which option|options?\b|one of the)\b/i;
function convertQ(x, forceKeep) {
  const ans = String(x.options[x.correct]);
  if (x.fmt === "typed") return x; // already v8
  if (forceKeep || OPT_REF.test(x.q) || ans.length > 40 || !ans.trim()) return { ...x, fmt: "mc" };
  // every 5th stays MC for variety (~20% MC target); deterministic by id
  if (typeof x.id === "number" && x.id % 5 === 0) return { ...x, fmt: "mc" };
  return { ...x, fmt: "typed", options: [ans], correct: 0, alts: [] };
}

// ════════ STAGE B — TVMaze plot questions ════════
async function tvmazePlots(cap) {
  const ck = "/tmp/pass8_tvmaze.json";
  if (fs.existsSync(ck)) { const j = JSON.parse(fs.readFileSync(ck, "utf8")); if (j.items) return j.items; }
  const items = [];
  for (let page = 0; page < 14 && items.length < cap; page++) {
    let shows;
    try { shows = await jget(`https://api.tvmaze.com/shows?page=${page}`); } catch { break; }
    if (!Array.isArray(shows)) break;
    for (const s of shows) {
      if (items.length >= cap) break;
      const name = String(s.name || "").trim();
      const sum = stripHtml(s.summary || "");
      if (!name || sum.length < 150) continue;
      const masked = maskAll(sum, [name]);
      if (masked.includes(name)) continue;
      if (/\b(season \d|episode \d|s\d{2}e\d{2})\b/i.test(masked)) continue;
      const snip = masked.length > 320 ? masked.slice(0, 320).replace(/[,;:.!?\s]+\S*$/, "") + "…" : masked;
      const q = `Which TV series matches this plot: "${snip}"?`;
      if (seenStems.has(normKey(q))) continue;
      if (seenAns.has("tvz:" + normKey(name))) continue;
      seenStems.add(normKey(q)); seenAns.add("tvz:" + normKey(name));
      items.push({ cat: "series", topic: "TV Series", q, options: [name], correct: 0, alts: [], fmt: "typed", cls: "lore", difficulty: "medium", source: "tvmaze:plot", id: null });
    }
    await sleep(400);
    console.log(`[tvmaze] page ${page} total ${items.length}`);
  }
  fs.writeFileSync(ck, JSON.stringify({ generatedAt: new Date().toISOString(), items }));
  return items;
}

// ════════ STAGE C — AniList plot questions (anime + manga, real alts) ════════
async function anilistPlots(type, cat, label, cap) {
  const ck = `/tmp/pass8_anilist_${type}.json`;
  if (fs.existsSync(ck)) { const j = JSON.parse(fs.readFileSync(ck, "utf8")); if (j.items) return j.items; }
  const items = [];
  const QUERY = `query ($page: Int) { Page(page: $page, perPage: 50) {
    media(type: ${type}, sort: POPULARITY_DESC, isAdult: false) {
      id title { english romaji native } synonyms description
    } } }`;
  for (let page = 1; page <= Math.ceil(cap / 40) + 2 && items.length < cap; page++) {
    let data;
    try {
      const r = await axios.post("https://graphql.anilist.co", { query: QUERY, variables: { page } },
        { timeout: 30000, headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json" } });
      data = r.data && r.data.data && r.data.data.Page && r.data.data.Page.media;
    } catch (e) { await sleep(6000); continue; }
    if (!Array.isArray(data) || !data.length) break;
    for (const m of data) {
      if (items.length >= cap) break;
      const desc = stripHtml(m.description || "");
      if (desc.length < 160) continue;
      const t = m.title || {};
      const variants = [t.english, t.romaji, t.native, ...(m.synonyms || [])].map((x) => String(x || "").trim()).filter(Boolean);
      const primary = (t.english || t.romaji || "").trim();
      if (!primary) continue;
      const masked = maskAll(desc, variants);
      if (masked.includes(primary)) continue;
      if (/\b(second season of|continuation of the anime|sequel to the anime)\b/i.test(masked)) continue;
      const snip = masked.length > 330 ? masked.slice(0, 330).replace(/[,;:.!?\s]+\S*$/, "") + "…" : masked;
      const isAnime = type === "ANIME";
      const q = `Which ${isAnime ? "anime" : "manga"} matches this plot: "${snip}"?`;
      if (seenStems.has(normKey(q))) continue;
      const akey = (isAnime ? "anl:" : "mng:") + normKey(primary);
      if (seenAns.has(akey)) continue;
      seenStems.add(normKey(q)); seenAns.add(akey);
      const alts = [...new Set(variants.map((v) => v.trim()).filter((v) => v && normKey(v) !== normKey(primary)))].slice(0, 4);
      items.push({ cat, topic: isAnime ? "Anime" : "Manga", q, options: [primary], correct: 0, alts, fmt: "typed", cls: "lore", difficulty: alts.length > 1 ? "easy" : "medium", source: isAnime ? "anilist:plot" : "anilist:plot-manga", id: null });
    }
    await sleep(900);
    console.log(`[anilist-${type.toLowerCase()}] page ${page} total ${items.length}`);
  }
  fs.writeFileSync(ck, JSON.stringify({ generatedAt: new Date().toISOString(), items }));
  return items;
}

// ════════ STAGE D — Fandom extracts + character art ════════
const WIKIS = [
  { id: "onepiece", host: "onepiece.fandom.com", name: "One Piece", cat: "comics", topic: "Manga" },
  { id: "dragonball", host: "dragonball.fandom.com", name: "Dragon Ball", cat: "comics", topic: "Manga" },
  { id: "aot", host: "attackontitan.fandom.com", name: "Attack on Titan", cat: "comics", topic: "Manga" },
  { id: "jojo", host: "jojo.fandom.com", name: "JoJo's Bizarre Adventure", cat: "comics", topic: "Manga" },
  { id: "bleach", host: "bleach.fandom.com", name: "Bleach", cat: "comics", topic: "Manga" },
  { id: "naruto", host: "naruto.fandom.com", name: "Naruto", cat: "comics", topic: "Manga" },
  { id: "marvel", host: "marvel.fandom.com", name: "Marvel Comics", cat: "comics", topic: "Comics" },
  { id: "dc", host: "dc.fandom.com", name: "DC Comics", cat: "comics", topic: "Comics" },
  { id: "got", host: "gameofthrones.fandom.com", name: "Game of Thrones", cat: "series", topic: "TV Series" },
  { id: "breakingbad", host: "breakingbad.fandom.com", name: "Breaking Bad", cat: "series", topic: "TV Series" },
  { id: "strangerthings", host: "strangerthings.fandom.com", name: "Stranger Things", cat: "series", topic: "TV Series" },
  { id: "twd", host: "walkingdead.fandom.com", name: "The Walking Dead", cat: "series", topic: "TV Series" },
  { id: "avatar", host: "avatar.fandom.com", name: "Avatar: The Last Airbender", cat: "series", topic: "Cartoons" },
  { id: "simpsons", host: "simpsons.fandom.com", name: "The Simpsons", cat: "series", topic: "Cartoons" },
  { id: "starwars", host: "starwars.fandom.com", name: "Star Wars", cat: "movies", topic: "Movies" },
  { id: "mcu", host: "marvelcinematicuniverse.fandom.com", name: "Marvel Cinematic Universe", cat: "movies", topic: "Movies" },
  { id: "harrypotter", host: "harrypotter.fandom.com", name: "Harry Potter", cat: "movies", topic: "Movies" },
  { id: "lotr", host: "lotr.fandom.com", name: "The Lord of the Rings", cat: "movies", topic: "Movies" },
  { id: "jurassicpark", host: "jurassicpark.fandom.com", name: "Jurassic Park", cat: "movies", topic: "Movies" },
  { id: "godzilla", host: "godzilla.fandom.com", name: "Godzilla", cat: "movies", topic: "Movies" },
  { id: "zelda", host: "zelda.fandom.com", name: "The Legend of Zelda", cat: "games", topic: "Video Games" },
  { id: "minecraft", host: "minecraft.fandom.com", name: "Minecraft", cat: "games", topic: "Video Games" },
  { id: "gta", host: "gta.fandom.com", name: "Grand Theft Auto", cat: "games", topic: "Video Games" },
  { id: "overwatch", host: "overwatch.fandom.com", name: "Overwatch", cat: "games", topic: "Video Games" },
  { id: "lol", host: "leagueoflegends.fandom.com", name: "League of Legends", cat: "games", topic: "Video Games" },
  { id: "fallout", host: "fallout.fandom.com", name: "Fallout", cat: "games", topic: "Video Games" },
  { id: "elderscrolls", host: "elderscrolls.fandom.com", name: "The Elder Scrolls", cat: "games", topic: "Video Games" },
  { id: "masseffect", host: "masseffect.fandom.com", name: "Mass Effect", cat: "games", topic: "Video Games" },
];
const EXTRACT_CAP = 30;   // lore text questions per wiki
const ART_CAP = 16;       // art image questions per wiki

function magicOk(buf) {
  if (!buf || buf.length < 3000) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;                                  // jpeg
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // png
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;               // gif
  if (buf.length > 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return true;
  return false;
}
async function getBin(url) {
  try { const r = await axios.get(url, { timeout: 20000, responseType: "arraybuffer", headers: { "User-Agent": UA }, maxContentLength: 12 * 1024 * 1024 }); return Buffer.from(r.data); } catch { return null; }
}

async function fandomExtracts() {
  const ck = "/tmp/pass8_fandom.json";
  if (fs.existsSync(ck)) { const j = JSON.parse(fs.readFileSync(ck, "utf8")); if (j.items) return j.items; }
  const items = [];
  for (const w of WIKIS) {
    let members;
    try {
      members = await jget(`https://${w.host}/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent("Category:Characters")}&cmlimit=400&cmtype=page&format=json&formatversion=2`);
    } catch { continue; }
    const titles = shuffle(((members || {}).query || {}).pages || []).map((p) => p.title).filter(Boolean);
    if (!titles.length) { console.log(`[fandom] ${w.id}: no members`); continue; }
    let ex = 0, art = 0;
    const batches = [];
    for (let i = 0; i < titles.length && (ex < EXTRACT_CAP || art < ART_CAP); i += 20) batches.push(titles.slice(i, i + 20));
    for (const batch of batches) {
      if (ex >= EXTRACT_CAP && art >= ART_CAP) break;
      let data;
      try {
        data = await jget(`https://${w.host}/api.php?action=query&prop=extracts%7Cpageimages&exintro=1&explaintext=1&exlimit=20&piprop=thumbnail&pithumbsize=400&titles=${batch.map((t) => encodeURIComponent(t.replace(/ /g, "_"))).join("%7C")}&redirects=1&format=json&formatversion=2`);
      } catch { continue; }
      const pages = ((data || {}).query || {}).pages || [];
      for (const p of pages) {
        const title = String(p.title || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
        if (!title || title.length > 40) continue;
        if (BAD_NAME_RE.test(title)) continue;
        // ── art image question (GET-verified thumbnail) ──
        const thumb = p.thumbnail && p.thumbnail.source;
        if (art < ART_CAP && thumb) {
          const buf = await getBin(thumb);
          if (buf && magicOk(buf)) {
            const q = `In ${w.name}, who or what is this?`;
            const dkey = normKey(q + "|" + title);
            if (!seenStems.has(dkey)) {
              seenStems.add(dkey);
              items.push({ cat: w.cat, topic: w.topic, q, options: [title], correct: 0, alts: [], fmt: "typed", img: thumb, subject: title, cls: "lore", difficulty: "medium", source: `fandom-art:${w.id}`, id: null });
              art++;
            }
          }
          await sleep(150);
        }
        // ── extract lore question ──
        if (ex < EXTRACT_CAP) {
          const raw = stripHtml(p.extract || "");
          if (raw.length < 140) continue;
          const masked = maskAll(raw, [title, title.replace(/\s+/g, "")]);
          if (masked.includes(title)) continue;
          const snip = masked.length > 300 ? masked.slice(0, 300).replace(/[,;:.!?\s]+\S*$/, "") + "…" : masked;
          if ((snip.match(/____/g) || []).length > 3) continue; // over-masked = unreadable
          const q = `In ${w.name}: "${snip}" — who or what is being described?`;
          if (seenStems.has(normKey(q))) continue;
          seenStems.add(normKey(q));
          items.push({ cat: w.cat, topic: w.topic, q, options: [title], correct: 0, alts: [], fmt: "typed", cls: "lore", difficulty: "medium", source: `fandom-extract:${w.id}`, id: null });
          ex++;
        }
      }
      await sleep(500);
    }
    console.log(`[fandom] ${w.id}: +${ex} extracts, +${art} art`);
  }
  fs.writeFileSync(ck, JSON.stringify({ generatedAt: new Date().toISOString(), items }));
  return items;
}
const BAD_NAME_RE = /^(unknown|unnamed|tba|various|n\/?a|unidentified).*$/i;

// ════════ COMPOSE v8 ════════
(async () => {
  axios = require("axios");
  fs.copyFileSync(OUT, `${OUT}.bak-v8`);
  console.log("backup written: quizDataset.json.bak-v8");

  console.log("stage B: tvmaze plots...");
  const tvz = await tvmazePlots(900);
  console.log("stage C: anilist plots...");
  const anA = await anilistPlots("ANIME", "series", "anime", 700);
  const anM = await anilistPlots("MANGA", "comics", "manga", 550);
  console.log("stage D: fandom extracts...");
  const fan = await fandomExtracts();

  const newByText = { games: [], comics: [], movies: [], series: [] };
  for (const it of [...tvz, ...anA, ...anM, ...fan]) if (newByText[it.cat]) newByText[it.cat].push(it);
  const newArt = { games: [], comics: [], movies: [], series: [] };
  for (const it of fan) if (it.img && newArt[it.cat]) newArt[it.cat].push(it);

  const V8 = { generatedAt: new Date().toISOString(), version: 8, counts: {}, categories: {} };
  const lines = [];
  for (const cat of Object.keys(DS.categories)) {
    const old = DS.categories[cat];
    const convertedText = (old.questions || []).map((x) => convertQ(x, false));
    const convertedImg = (old.images || []).map((x, i) => {
      const ans = String(x.options[x.correct]);
      // obscure-poster typed is brutal: keep half the image pool as MC
      if (x.fmt === "typed") return x;
      if (OPT_REF.test(x.q) || ans.length > 32 || i % 2 === 1) return { ...x, fmt: "mc" };
      return { ...x, fmt: "typed", options: [x.subject || ans], correct: 0, alts: [] };
    });
    // merge art questions into image pool (dedupe by img url)
    const imgUrls = new Set(convertedImg.map((x) => x.img));
    for (const a of newArt[cat]) if (!imgUrls.has(a.img)) { imgUrls.add(a.img); convertedImg.push(a); }
    // dedupe new text vs converted stems (rebuild set per cat from final pool)
    const stemSet = new Set(convertedText.map((x) => normKey(x.q)));
    const fresh = newByText[cat].filter((x) => !stemSet.has(normKey(x.q)));
    for (const x of fresh) stemSet.add(normKey(x.q));
    const loreText = shuffle([...fresh, ...convertedText.filter((x) => x.cls !== "prod")]);
    const prod = convertedText.filter((x) => x.cls === "prod");
    const maxProd = Math.floor(loreText.length / 9);
    const keepers = prod.slice(0, Math.max(0, Math.min(maxProd, prod.length)));
    const questions = [...loreText, ...keepers].map((x, i) => ({ ...x, id: i + 1 }));
    V8.categories[cat] = { questions, images: convertedImg };
    const typedN = questions.filter((x) => x.fmt === "typed").length;
    const loreN = loreText.length;
    V8.counts[cat] = {
      text: questions.length, lore: loreN, prod: keepers.length,
      prodPct: Number(((keepers.length / questions.length) * 100).toFixed(1)),
      typedPct: Number(((typedN / questions.length) * 100).toFixed(1)),
      typedImg: convertedImg.filter((x) => x.fmt === "typed").length,
      images: convertedImg.length,
    };
    lines.push(`${cat.padEnd(8)} text=${String(questions.length).padStart(5)} typed=${String(typedN).padStart(5)} (${V8.counts[cat].typedPct}%) lore=${loreN} prod=${keepers.length} (${V8.counts[cat].prodPct}%) images=${convertedImg.length} (typed ${V8.counts[cat].typedImg})`);
  }
  fs.writeFileSync(OUT, JSON.stringify(V8));
  const T = Object.values(V8.counts).reduce((m, c) => ({ text: m.text + c.text, typed: m.typed + (c.typedPct / 100) * c.text, lore: m.lore + c.lore, img: m.img + c.images, ti: m.ti + c.typedImg }), { text: 0, typed: 0, lore: 0, img: 0, ti: 0 });
  const summary = `\n=== v8 typed+lore rebuild ${V8.generatedAt} ===\ntotal text=${T.text} typed≈${Math.round(T.typed)} (${((T.typed / T.text) * 100).toFixed(1)}%) lore=${T.lore} (${((T.lore / T.text) * 100).toFixed(1)}%) images=${T.img} (typed ${T.ti})\nnew: tvmaze=${tvz.length} anilist-anime=${anA.length} anilist-manga=${anM.length} fandom=${fan.length}\n${lines.join("\n")}\n`;
  fs.appendFileSync(REPORT, summary);
  console.log(summary);
  const bad = Object.entries(V8.counts).filter(([, n]) => n.prodPct > 10.5);
  if (bad.length) { console.error("RATIO FAIL:", JSON.stringify(bad)); process.exit(2); }
  console.log("OK: v8 composed within production cap");
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
