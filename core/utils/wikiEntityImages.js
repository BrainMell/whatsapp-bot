// ============================================
// WIKIPEDIA ENTITY IMAGES (2026-09-30) - the non-anime image source
// ============================================
// Owner brief: the image system must cover MOVIES + GAMES + TV, not just
// anime, and it must actually WORK (measured, not assumed). Box 1 network
// facts (scripts/wiki_entity_bakeoff.js, 2026-09-30, 286 characters x 33
// franchises of the live RANDOM_POOL):
//   Fandom API+CDN          API ok, CDN 403 (Cloudflare blocks the box IP)
//   en.wikipedia pageimages (pilicense=any) + upload.wikimedia.org  100% OK
//   bakeoff v4/v5           257/286 (90%) gated without identity checks,
//                           225/286 (79%) with strict identity gating
// vs the old Fandom chain: 0/60. This module is the production form of the
// bakeoff winner: entity-native, page-anchored, junk-proof.
//
// DESIGN - three identity tiers, strongest first:
//   1. CURATED EXACT ARTICLE: franchise registry below maps each franchise to
//      its notable characters' canonical en.wiki article titles. Batched
//      pageimages (redirects resolved) -> the article IS the identity.
//   2. SEARCH-ANCHORED ARTICLE: for misses, one search (name + franchise
//      qualifier) -> top article -> but only ACCEPTED if the identity gate
//      passes (see below). Searching may land on the franchise article whose
//      lead image is box art - showing that as "Melina?" is WRONG, so:
//   IDENTITY GATE (strict): accept a search hit only when
//      (a) article title == character base name AND the franchise qualifier
//          surfaces in title/filename (no qualifier -> accept plain matches)
//      (b) article title is "<base> (<something>)" - a disambiguated article
//          of exactly this subject (e.g. "Zhongli (Genshin Impact)")
//      (c) filename contains the base name AND the article title contains
//          the qualifier AND the filename has no product-junk words
//          (quest/cover/xbox/ps4/... - kills "Aragorn's Quest" covers)
//   3. Every accepted image still passes the production pixel gate
//      (imageGate, min 150px - fair-use art is capped at ~100k pixels) and
//      is disk-cached (quizPortraitCache, 30d) so a franchise pays its
//      resolution cost roughly once a month, then serves warm.
//
// RATE DISCIPLINE: upload.wikimedia 429-throttles bursts (measured). All
// downloads go through a 2-inflight / 220ms-gap / backoff-retry queue; all
// API calls are paced >=350ms with 429 backoff. Nominal full-franchise cold
// resolve: ~10-20s, warm: 0ms.
// ============================================

const crypto = require("crypto");
const axios = require("axios");
const imageGate = require("./imageGate");
const quizLore = require("../games/quizLore");
const portraitCache = require("./quizPortraitCache");

// Wikimedia asks for a descriptive UA on api/upload traffic (same policy
// shape as quizLore's _WP_UA)
const _WP_UA = { "User-Agent": "ZenithQuizBot/1.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" };
const _wpHttp = axios.create({ timeout: 15000, headers: _WP_UA });

// ── curated registry: slug -> { q: qualifier, names: [article titles] } ──
// Order matters: fame-descending (easy band = head, hard band = tail).
const W = {
  batman: { q: "Batman", names: ["Batman", "Joker (character)", "Robin (character)", "Catwoman", "Batgirl", "Nightwing", "Riddler", "Two-Face", "Harley Quinn", "Ra's al Ghul", "Bane (DC Comics)", "Penguin (character)", "Mr. Freeze", "Poison Ivy (character)"] },
  marvel: { q: "Marvel", names: ["Iron Man", "Captain America", "Thor (Marvel Comics)", "Hulk", "Spider-Man", "Black Widow (Natasha Romanova)", "Doctor Strange", "Thanos", "Loki (Marvel Comics)", "Black Panther (character)", "Wolverine", "Daredevil (Marvel Comics character)", "Ant-Man (Scott Lang)"] },
  dc: { q: "DC Comics", names: ["Superman", "Batman", "Wonder Woman", "The Flash", "Green Lantern", "Aquaman", "Lex Luthor", "Darkseid", "Green Arrow", "Supergirl", "Cyborg (comics)", "Black Adam"] },
  starwars: { q: "Star Wars", names: ["Darth Vader", "Luke Skywalker", "Leia Organa", "Han Solo", "Yoda", "Obi-Wan Kenobi", "Palpatine", "Boba Fett", "R2-D2", "C-3PO", "Chewbacca", "Anakin Skywalker", "Jabba the Hutt", "Kylo Ren", "Rey (Star Wars)"] },
  startrek: { q: "Star Trek", names: ["James T. Kirk", "Spock", "Leonard McCoy", "Jean-Luc Picard", "Data (Star Trek)", "William Riker", "Worf", "Kathryn Janeway", "Benjamin Sisko", "Q (Star Trek)", "Seven of Nine", "Deanna Troi"] },
  harrypotter: { q: "Harry Potter", names: ["Harry Potter", "Hermione Granger", "Ron Weasley", "Albus Dumbledore", "Lord Voldemort", "Severus Snape", "Rubeus Hagrid", "Draco Malfoy", "Sirius Black", "Dobby (Harry Potter)", "Neville Longbottom", "Luna Lovegood", "Bellatrix Lestrange", "Ginny Weasley"] },
  lotr: { q: "Lord of the Rings", names: ["Frodo Baggins", "Gandalf", "Aragorn", "Legolas", "Gimli (Middle-earth)", "Gollum", "Samwise Gamgee", "Saruman", "Sauron", "Boromir", "Galadriel", "Elrond", "Éowyn", "Treebeard"] },
  avatar: { q: "Avatar The Last Airbender", names: ["Aang", "Katara", "Sokka", "Toph Beifong", "Zuko", "Iroh", "Azula", "Korra", "Appa (Avatar: The Last Airbender)"] },
  spongebob: { q: "SpongeBob", names: ["SpongeBob SquarePants (character)", "Patrick Star", "Squidward Tentacles", "Eugene H. Krabs", "Sandy Cheeks", "Plankton and Karen", "Mrs. Puff", "Pearl Krabs"] },
  strangerthings: { q: "Stranger Things", names: ["Eleven (Stranger Things)", "Mike Wheeler", "Dustin Henderson", "Will Byers", "Lucas Sinclair", "Jim Hopper (Stranger Things)", "Joyce Byers", "Nancy Wheeler", "Steve Harrington", "Max Mayfield", "Demogorgon (Stranger Things)"] },
  breakingbad: { q: "Breaking Bad", names: ["Walter White (Breaking Bad)", "Jesse Pinkman", "Skyler White", "Hank Schrader", "Saul Goodman", "Gus Fring", "Mike Ehrmantraut", "Walter White Jr.", "Marie Schrader"] },
  gameofthrones: { q: "Game of Thrones", names: ["Jon Snow (character)", "Daenerys Targaryen", "Tyrion Lannister", "Cersei Lannister", "Jaime Lannister", "Arya Stark", "Sansa Stark", "Ned Stark", "Joffrey Baratheon", "Theon Greyjoy", "Sandor Clegane", "Tywin Lannister", "Brienne of Tarth", "Petyr Baelish"] },
  gravityfalls: { q: "Gravity Falls", names: ["Dipper Pines", "Mabel Pines", "Stan Pines", "Bill Cipher", "Ford Pines", "Wendy Corduroy", "Soos Ramirez", "Pacifica Northwest"] },
  adventuretime: { q: "Adventure Time", names: ["Finn the Human", "Jake the Dog", "Princess Bubblegum", "Marceline the Vampire Queen", "Ice King", "BMO", "Lady Rainicorn", "Lumpy Space Princess"] },
  "steven-universe": { q: "Steven Universe", names: ["Steven Universe (character)", "Garnet (Steven Universe)", "Amethyst (Steven Universe)", "Pearl (Steven Universe)", "Connie Maheswaran", "Peridot (Steven Universe)", "Lapis Lazuli (Steven Universe)", "Greg Universe"] },
  teentitans: { q: "Teen Titans", names: ["Robin (character)", "Starfire (Teen Titans)", "Raven (DC Comics)", "Cyborg (comics)", "Beast Boy", "Deathstroke", "Terra (comics)"] },
  ben10: { q: "Ben 10", names: ["Ben Tennyson", "Gwen Tennyson", "Vilgax", "Kevin Levin"] },
  zelda: { q: "The Legend of Zelda", names: ["Link (The Legend of Zelda)", "Princess Zelda", "Ganon", "Navi (The Legend of Zelda)", "Midna", "Sheik", "Impa", "Skull Kid", "Ghirahim", "Princess Ruto"] },
  minecraft: { q: "Minecraft", names: ["Steve (Minecraft)", "Creeper (Minecraft)", "Enderman", "Alex (Minecraft)", "Piglin", "Wither", "Ender Dragon", "Villager (Minecraft)"] },
  gta: { q: "Grand Theft Auto", names: ["Carl Johnson (Grand Theft Auto)", "Niko Bellic", "Trevor Philips", "Michael De Santa", "Franklin Clinton", "Tommy Vercetti"] },
  // NOTE: "Zeus (God of War)" deliberately omitted - the search resolves to
  // the MYTHOLOGY article whose lead image is a marble statue, wrong subject
  // for a God of War quiz. Same guard philosophy as the identity gate below.
  godofwar: { q: "God of War", names: ["Kratos (God of War)", "Atreus (God of War)", "Baldur (God of War)", "Mimir (God of War)", "Freya (God of War)"] },
  witcher: { q: "The Witcher", names: ["Geralt of Rivia", "Yennefer of Vengerberg", "Ciri", "Triss Merigold", "Vesemir", "Emhyr var Emreis"] },
  finalfantasy: { q: "Final Fantasy", names: ["Cloud Strife", "Sephiroth (Final Fantasy)", "Tifa Lockhart", "Aerith Gainsborough", "Squall Leonhart", "Kefka Palazzo", "Yuna (Final Fantasy)", "Lightning (Final Fantasy)", "Zidane Tribal", "Noctis Lucis Caelum"] },
  pokemon: { q: "Pokemon", names: ["Pikachu", "Charizard", "Bulbasaur", "Squirtle", "Mewtwo", "Mew (Pokémon)", "Eevee", "Snorlax", "Gengar", "Lucario", "Gyarados", "Jigglypuff", "Psyduck", "Greninja", "Mimikyu"] },
  "genshin-impact": { q: "Genshin Impact", names: ["Traveler (Genshin Impact)", "Paimon (Genshin Impact)", "Zhongli", "Venti (Genshin Impact)", "Raiden Shogun"] },
  leagueoflegends: { q: "League of Legends", names: ["Jinx (League of Legends)", "Vi (League of Legends)", "Caitlyn (League of Legends)", "Ahri", "Ekko", "Viego", "Lux (League of Legends)"] },
  cyberpunk: { q: "Cyberpunk 2077", names: ["Johnny Silverhand", "V (Cyberpunk 2077)", "Adam Smasher", "Alt Cunningham"] },
  fortnite: { q: "Fortnite", names: ["Jonesy (Fortnite)", "Peely"] },
  "among-us": { q: "Among Us", names: ["Crewmate (Among Us)"] },
  eldenring: { q: "Elden Ring", names: ["Melina (Elden Ring)", "Ranni the Witch", "Radahn", "Malenia, Blade of Miquella", "Godrick the Grafted", "Blaidd", "Iron Fist Alexander", "Rya (Elden Ring)"] },
  darksouls: { q: "Dark Souls", names: ["Solaire of Astora", "Gwyn, Lord of Cinder", "Artorias the Abysswalker", "Chosen Undead", "Ornstein and Smough", "Gravelord Nito"] },
  sekiro: { q: "Sekiro", names: ["Wolf (Sekiro)", "Genichiro Ashina", "Isshin Ashina", "Lady Butterfly"] },
  bloodborne: { q: "Bloodborne", names: ["Hunter (Bloodborne)", "Gehrman", "Lady Maria", "Micolash, Host of the Nightmare"] },
};

// ── pacing primitives (module-global, shared by everything below) ──
let _lastApi = 0;
async function _apiGap(ms = 350) {
  const gap = Date.now() - _lastApi;
  if (gap < ms) await new Promise((r) => setTimeout(r, ms - gap));
  _lastApi = Date.now();
}

let _dlInflight = 0;
const _dlWaiters = [];
let _lastDl = 0;
function _dlSlot() {
  if (_dlInflight < 2) { _dlInflight++; return Promise.resolve(); }
  return new Promise((r) => _dlWaiters.push(r));
}
function _dlFree() { _dlInflight--; const w = _dlWaiters.shift(); if (w) { _dlInflight++; w(); } }

// one paced, retried download (quizLore.downloadMedia returns {buf:null,
// transient} on failure; retries absorb wikimedia's transient 429/5xx
// throttling) - the last failure object is returned so callers can skip
// negative-caching transient errors
async function _download(url) {
  await _dlSlot();
  try {
    let last = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const gap = Date.now() - _lastDl;
      if (gap < 220) await new Promise((r) => setTimeout(r, 220 - gap));
      _lastDl = Date.now();
      const dl = await quizLore.downloadMedia(url, "image").catch(() => null);
      if (dl && dl.buf) return dl;
      last = dl;
      if (attempt < 3) await new Promise((r) => setTimeout(r, [1200, 2500, 4000][attempt] + Math.random() * 500));
    }
    return last;
  } finally { _dlFree(); }
}

// ── wiki API (en.wikipedia.org - quizLore.wikiApi is Fandom-only) ──
// 429/5xx get backoff retries (measured: wikimedia throttles API bursts too).
async function _wikiApi(params, retries = 2) {
  await _apiGap();
  const qs = new URLSearchParams(params).toString();
  const url = `https://en.wikipedia.org/w/api.php?${qs}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await _wpHttp.get(url);
      if (r.data && r.data.error) throw new Error(`wiki api: ${r.data.error.code}`);
      return r.data;
    } catch (e) {
      const status = e?.response?.status;
      if ((status === 429 || (status >= 500 && status < 600) || !status) && attempt < retries) {
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1) + Math.random() * 600));
        await _apiGap();
        continue;
      }
      return null;
    }
  }
}

async function pageimagesBatch(titles) {
  const data = await _wikiApi({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "pageimages|pageprops", ppprop: "disambiguation",
    piprop: "thumbnail", pithumbsize: "640",
    pilicense: "any", // fair-use character art - the default 'free' hides it
    titles: titles.join("|"),
  }).catch(() => null);
  const byTitle = new Map();
  const disambig = new Set();
  for (const p of data?.query?.pages || []) {
    byTitle.set(p.title, p.thumbnail?.source || null);
    if (p.pageprops?.disambiguation) disambig.add(p.title);
  }
  const redirectMap = new Map();
  for (const r of data?.query?.redirects || []) redirectMap.set(r.from, r.to);
  return { byTitle, redirectMap, disambig };
}

// article's own file list (identity is anchored by the ARTICLE; we then only
// pick files whose NAME names the subject) - rescues articles with no lead
// pageimage but with an infobox/section image of the character
async function articleNamedFile(article, name) {
  const data = await _wikiApi({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "images", imlimit: "30", titles: article,
  }).catch(() => null);
  const page = data?.query?.pages?.[0];
  const files = (page?.images || []).map((f) => f.title || "").filter((t) => /^File:/i.test(t));
  if (!files.length) return null;
  const toks = _norm(name).split(" ").filter((t) => t.length >= 3 && !_STOP.has(t));
  if (!toks.length) return null;
  const match = files.find((f) => {
    const fn = _norm(f.replace(/^File:/, ""));
    return toks.every((t) => fn.includes(t)) && !_JUNK_FILE.test(f) && !/(logo|icon|flag|map)/i.test(f);
  });
  if (!match) return null;
  const info = await _wikiApi({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "640", titles: match,
  }).catch(() => null);
  const ii = info?.query?.pages?.[0]?.imageinfo?.[0];
  if (!ii?.url) return null;
  if (ii.mime && !/image\/(jpeg|png|webp)/.test(ii.mime)) return null;
  // 2026-09: commons thumburls moved to thumb.wikimedia.org (thumbor) -
  // normalize to the classic upload.wikimedia.org host (both serve the same
  // path; upload is the stable, battle-tested one on this box)
  const u = String(ii.thumburl || ii.url).replace(/^https:\/\/thumb\.wikimedia\.org\//, "https://upload.wikimedia.org/");
  return { url: u, article, file: match };
}

async function searchResolve(name, qualifier) {
  // intitle-anchored search: only articles whose TITLE names the character
  // are considered ("Minecraft speedrunning" can never be a candidate for
  // "Enderman"; "Zhongli (Genshin Impact)" always is). Junk-product titles
  // are rejected; prefer disambiguated/qualifier-matching titles.
  const base = String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
  const data = await _wikiApi({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "pageimages|pageprops", ppprop: "disambiguation",
    piprop: "thumbnail", pithumbsize: "640", pilicense: "any",
    generator: "search", gsrsearch: `intitle:"${base}" ${qualifier || ""}`.trim(),
    gsrnamespace: "0", gsrlimit: "5",
  }).catch(() => null);
  const pages = (data?.query?.pages || []).filter((p) => p.thumbnail?.source && !p.pageprops?.disambiguation);
  pages.sort((a, b) => (a.index || 99) - (b.index || 99));
  const nb = _norm(base);
  const nq = _norm(qualifier);
  const scored = pages.map((p) => {
    const nt = _norm(p.title);
    const nf = _norm(_fileName(p.thumbnail.source));
    if (!nt.includes(nb) && !nf.includes(nb)) return null;
    const junk = _JUNK_TITLE.test(p.title) || _JUNK_FILE.test(_fileName(p.thumbnail.source));
    if (junk) return null;
    // strong: title carries the qualifier or an explicit disambiguator
    const strong = (nq && nt.includes(nq)) || /\([^)]+\)/.test(p.title);
    return { url: _normUpload(p.thumbnail.source), article: p.title, strong };
  }).filter(Boolean);
  scored.sort((a, b) => (b.strong ? 1 : 0) - (a.strong ? 1 : 0));
  return scored[0] || null;
}
const _JUNK_TITLE = /(speedrun|story mode|legends|movie|tv series|video game|soundtrack|album|board game|card game|novel|film series|quest|cover|remix|mod)/i;

// ── identity gate (strict - see header) ──
const _STOP = new Set(["the", "character", "game", "movie", "film", "tv", "series", "and", "from", "of"]);
const _JUNK_FILE = /(quest|cover|xbox|playstation|ps[2-5]|switch|boxart|box_art|gameplay|screenshot|poster)/i;
function _norm(s) { return String(s || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim(); }
// normalize thumbor host to the classic upload.wikimedia.org
function _normUpload(u) { return String(u || "").replace(/^https:\/\/thumb\.wikimedia\.org\//, "https://upload.wikimedia.org/"); }
function _fileName(url) {
  try { const last = decodeURIComponent(new URL(url).pathname).split("/").pop() || ""; return last.replace(/_/g, " "); } catch { return ""; }
}
function identityOk(name, article, imgUrl, qualifier) {
  const base = _norm(name);
  const toks = base.split(" ").filter((t) => t.length >= 3 && !_STOP.has(t));
  if (!toks.length) return false;
  const art = _norm(article);
  const file = _fileName(imgUrl).toLowerCase();
  const qToks = _norm(qualifier).split(" ").filter((t) => t.length >= 3 && !_STOP.has(t));
  // (a) exact article match - require qualifier context when one was given
  if (art === base && (!qToks.length || qToks.some((t) => (art + " " + file).includes(t)))) return true;
  // (b) disambiguated article of exactly this subject
  if (article && _norm(article).startsWith(base) && /\(/.test(article)) return true;
  // (c) filename names the subject AND article is franchise-scoped AND not
  //     a product/cover shot
  if (toks.every((t) => file.includes(t)) && qToks.length && qToks.some((t) => art.includes(t)) && !_JUNK_FILE.test(file)) return true;
  return false;
}

// ── resolution ──
const _sessionMemo = new Map(); // frKey -> portraits[] (process lifetime)

function _bandOrder(list, difficulty) {
  // curated lists are fame-descending; easy prefers head, hard prefers tail
  const order = difficulty === "hard" ? [...list].reverse() : difficulty === "medium"
    ? [...list].sort(() => Math.random() - 0.5)
    : list;
  return order;
}

/**
 * Resolve verified portrait bytes for a franchise's characters.
 * Returns [{ key, name, url, article, method, buf, mime, w, h }] (verified only).
 * Hot path: disk cache / session memo; cold: batched API + paced downloads.
 */
async function resolveFranchisePortraits(frSlug, qualifier, names, { difficulty = "easy", limit = 12, host = null } = {}) {
  if (!Array.isArray(names) || !names.length) return [];
  const memoKey = `${frSlug || qualifier}`;
  const memo = _sessionMemo.get(memoKey);
  if (memo && memo.length >= 4) return _bandOrder(memo, difficulty).slice(0, limit);

  const want = names.slice(0, 15);
  // 1) batch exact-title pageimages
  const byTitle = new Map();
  const redirectMap = new Map();
  let disambig = new Set();
  for (let i = 0; i < want.length; i += 20) {
    const r = await pageimagesBatch(want.slice(i, i + 20)).catch(() => null);
    if (!r) continue;
    for (const [k, v] of r.byTitle) byTitle.set(k, v);
    for (const [k, v] of r.redirectMap) redirectMap.set(k, v);
    disambig = new Set([...disambig, ...r.disambig]);
  }

  // 2) resolve each name: exact article -> article file hunt -> search. A
  // per-franchise URL dedup guards against redirect collisions (e.g. "Alex
  // (Minecraft)" redirecting into the Steve article and inheriting Steve's
  // lead image - two subjects must never share one picture).
  const resolved = [];
  const seenUrls = new Set();
  for (const raw of want) {
    const name = raw;
    const cacheKey = `wiki-${frSlug || "fr"}-${String(name).slice(0, 40)}`;
    const cached = portraitCache.getPortrait(cacheKey);
    if (cached) {
      resolved.push({ key: cacheKey, name, url: cached.url, article: null, method: "disk", buf: cached.buf, mime: cached.mime, w: cached.w, h: cached.h });
      continue;
    }
    if (portraitCache.hasNegative(cacheKey)) continue;
    const direct = redirectMap.get(raw) || raw;
    let url = _normUpload(byTitle.has(raw) ? byTitle.get(raw) : byTitle.get(direct));
    let article = direct;
    let method = "article";
    if (!url && (byTitle.has(raw) || byTitle.has(direct))) {
      // article exists but has no lead pageimage - hunt its own file list for
      // a file NAMED after the character (page-anchored, beats blind search)
      const nf = await articleNamedFile(direct, name).catch(() => null);
      if (nf) { url = nf.url; article = nf.article; method = "article-file"; }
    }
    if (!url) {
      const sr = await searchResolve(String(name).replace(/\s*\([^)]*\)\s*$/, ""), qualifier).catch(() => null);
      if (sr && identityOk(name, sr.article, sr.url, qualifier)) {
        url = sr.url; article = sr.article; method = "search";
      } else if (sr) {
        method = "identity-reject";
      }
    }
    if (!url) continue;
    const urlKey = String(url).split("?")[0];
    if (seenUrls.has(urlKey)) continue;
    // 3) download + pixel gate + disk cache
    const dl = await _download(url);
    if (dl && dl.buf) {
      const gate = await imageGate.inspectImageBuffer(dl.buf, { minW: 150, minH: 150, label: `wiki:${name}`.slice(0, 60) }).catch(() => ({ ok: false }));
      if (gate.ok) {
        seenUrls.add(urlKey);
        portraitCache.putPortrait(cacheKey, dl.buf, { mime: dl.mime, url, name, w: gate.width, h: gate.height });
        resolved.push({ key: cacheKey, name, url, article, method, buf: dl.buf, mime: dl.mime, w: gate.width, h: gate.height });
      } else {
        portraitCache.putNegative(cacheKey);
      }
    } else {
      // transient failures (429/5xx/timeouts) must not poison the 24h
      // negative cache - only deterministic rejections do
      if (!dl?.transient) portraitCache.putNegative(cacheKey);
    }
  }

  if (resolved.length >= 1) {
    _sessionMemo.set(memoKey, resolved);
    if (host && host._wikiPortraits) host._wikiPortraits.set(memoKey, resolved);
  }
  return _bandOrder(resolved, difficulty).slice(0, limit);
}

function hasRegistry(frSlug) {
  return !!W[frSlug];
}

function stats() {
  return { registryFranchises: Object.keys(W).length, memoized: _sessionMemo.size, ...portraitCache.stats() };
}

// 2026-09-30: characterResolver reuses the paced primitives (wikiApi,
// pageimagesBatch, articleNamedFile, searchResolve, identityOk, _normUpload)
// so the generic ANY-franchise pipeline inherits the same rate discipline.
module.exports = {
  W, hasRegistry, resolveFranchisePortraits, identityOk, stats,
  wikiApi: _wikiApi, pageimagesBatch, articleNamedFile, searchResolve,
  _normUpload, articleLinksModule: null,
};
