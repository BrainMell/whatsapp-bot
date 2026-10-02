// ══════════════════════════════════════════════════════════════════════════
// CHARACTER RESOLVER (2026-09-30) - category-routed multi-source character
// + image pipeline for quiz image questions. Owner spec 2026-09-30 v3.
// ══════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS (audit of the previous system, all measured):
//   1. SAME ORDER EVERY RUN: AniList cast arrives FAVOURITES_DESC (deterministic),
//      the wiki registry is fame-ordered (deterministic), and every builder
//      iterated those lists head-first. The only "randomness" was the biased
//      sort(() => Math.random() - 0.5) comparator (see quiz.js line ~156:
//      "measured: option A carried the correct answer far above 25%").
//      -> replaced by per-quiz-instance Fisher-Yates over the whole verified pool.
//   2. HOLLOW KNIGHT FAILED: not in the curated registry (33 franchises) ->
//      dead Fandom CDN chain. -> generic Wikipedia pipeline below resolves ANY
//      franchise: list-article discovery + link extraction + batched pageimages
//      (pilicense=any) + identity gate. No curation required.
//   3. CATEGORY BLINDNESS: routing was "AniList id present? cast : registry : legacy".
//      -> category detection FIRST (anime/manga/game/movie/tv/comic/other),
//      then the category's provider chain, in order, with fallbacks.
//   4. ONE-SOURCE RELIANCE: Fandom CDN is Cloudflare-403 from this box (0/60).
//      -> 7 adapters, category-routed: anilist / jikan / tvmaze / wikipedia /
//      wikidata / tmdb (key-gated) / igdb (key-gated).
//
// UNIFIED CHARACTER RECORD (owner spec):
//   { name, aliases, franchise, category, description,
//     image_url, source, source_id, confidence }
//
// RANDOMIZATION (owner spec):
//   - pool of 10..500 metadata candidates per franchise (category sources)
//   - image-verified subset (URL present; bytes gated at pick time)
//   - crypto Fisher-Yates shuffle PER QUIZ INSTANCE (WeakMap on the session
//     object -> two groups starting the same quiz get different sequences)
//   - no repeats within a quiz (usedKeys + per-session bytes-hash dedup)
//   - cross-quiz recency file (last N picks per franchise avoided when the
//     pool is deep enough) so repeated quizzes stop recycling the same heads
//   - final option order inside each question is also Fisher-Yates
//
// CACHING (hybrid, owner spec):
//   - franchise POOL (metadata + image URLs) cached on disk 24h
//     core/data/quiz_pools/<hash>.json  - pool rebuilds are paced API work
//   - verified image BYTES cached by quizPortraitCache (30d, existing)
//   - negative cache 24h (existing) - dead sources are not re-hammered
//   - NOT pre-downloading every character: bytes download lazily per pick
// ══════════════════════════════════════════════════════════════════════════

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const imageGate = require("./imageGate");
const portraitCache = require("./quizPortraitCache");
const wikiEntityImages = require("./wikiEntityImages");
const imgSources = require("./quizImageSources");
const quizImagePipeline = require("./quizImagePipeline");

// ── shared http ──
const _UA = { "User-Agent": "ZenithQuizBot/1.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" };
const _http = axios.create({ timeout: 12000, headers: _UA });

// injected by quiz.js via setDeps to avoid a circular require
const _deps = { fetchFranchiseCast: null, detectMediaType: null, resolveAnime: null };
function setDeps(d) { Object.assign(_deps, d || {}); }

// ══════════════════════════════════════════
// RANDOM: crypto Fisher-Yates (unbiased, per-instance)
// ══════════════════════════════════════════
function fyShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1); // uniform, unbiased
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _norm(s) {
  return String(s || "").toLowerCase().replace(/\([^)]*\)/g, " ")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function recordKey(name) { return _norm(name).replace(/\s+/g, "-"); }

// ══════════════════════════════════════════
// UNIFIED RECORD FACTORY
// confidence: 1.0 database-anchored cast/art | 0.9 curated article |
//             0.8 list-article link | 0.7 search-anchored | 0.5 weak
// ══════════════════════════════════════════
function rec(p) {
  return {
    name: String(p.name || "").trim(),
    aliases: p.aliases || [],
    franchise: p.franchise || "",
    category: p.category || "other",
    description: p.description || "",
    image_url: p.image_url || null,
    source: p.source || "unknown",
    source_id: p.source_id || "",
    confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
    // resolver-internal fields (not in the owner-spec shape but needed):
    article: p.article || null, // wikipedia article title (identity anchor)
    method: p.method || null,
  };
}

// ══════════════════════════════════════════
// CATEGORY DETECTION (anime|manga|game|movie|tv|comic|other)
// order of evidence: explicit mediaType -> AniList probe -> TVMaze ->
// quizLore.detectMediaType (Wikipedia lead + TVMaze, already cached) ->
// "other". Cached per title 6h in-memory + rides the pool disk cache.
// ══════════════════════════════════════════
const _catCache = new Map(); // title -> { ts, category }
async function detectCategory(title, explicit) {
  const t = String(title || "").trim();
  const explicitMap = { anime: "anime", manga: "manga", game: "game", movie: "movie", tv: "tv", comic: "comic" };
  if (explicit && explicitMap[explicit]) return explicitMap[explicit];
  if (!t) return "other";
  const ck = t.toLowerCase();
  const hit = _catCache.get(ck);
  if (hit && Date.now() - hit.ts < 6 * 3600e3) return hit.category;
  let category = "other";
  // 1) AniList probe FIRST - the definitive anime/manga signal. TVMaze also
  // lists broadcast anime ("Naruto" is a TV show there too), so TVMaze alone
  // mis-routes anime franchises to the tv chain (measured regression).
  try {
    const q = `query($s:String){Page(perPage:5){media(search:$s,type:ANIME){id format title{romaji english}} } }`;
    const r = await _http.post("https://graphql.anilist.co", { query: q, variables: { s: t } }, { timeout: 8000 });
    const nt = _norm(t);
    // filter AFTER normalization - a title that normalizes to "" would make
    // nt.includes("") always-true and match an unrelated anime
    const media = (r.data?.data?.Page?.media || []).filter((m) => {
      const titles = [m.title?.romaji, m.title?.english].filter(Boolean).map((x) => _norm(x)).filter((x) => x && x.length >= 2);
      return titles.some((x) => x.includes(nt) || (nt.length >= 5 && nt.includes(x)));
    });
    if (media.length) {
      // 2026-10-02 format gate: the AniList ANIME-type search also returns
      // MUSIC entries ("Casablanca" id 107907 format=MUSIC misrouted the 1942
      // film to the anime chain). Only real media formats classify.
      const fmts = media.map((m) => m.format).filter((f) =>
        ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MANGA", "ONE_SHOT", "NOVEL"].includes(f));
      if (fmts.length) {
        if (fmts.includes("MANGA") && fmts.length === 1) category = "manga";
        else category = "anime";
      }
    }
  } catch { /* anilist unreachable - continue */ }
  // 2) TVMaze - type-aware: "Animation" routes to the cartoon chain (Ben 10
  // fix - cartoons are NOT live-action tv), everything else that matches is tv.
  // 2026-10-01: ONE retry on network failure - a flaky probe must not silently
  // drop the cartoon signal and let the Steam exact-name probe misroute a
  // cartoon franchise to the game chain (measured: Ben 10 -> game on a
  // transient TVMaze timeout).
  let tvmazeUnknown = false;
  if (category === "other") {
    for (let tryN = 0; tryN < 2; tryN++) {
      try {
        const r = await _http.get("https://api.tvmaze.com/singlesearch/shows", { params: { q: t }, timeout: 7000 });
        if (r.data && r.data.name && _norm(r.data.name).includes(_norm(t).slice(0, 6))) {
          category = String(r.data.type || "").toLowerCase() === "animation" ? "cartoon" : "tv";
        }
        tvmazeUnknown = false;
        break; // a 200 response is a definitive answer (hit or miss)
      } catch {
        tvmazeUnknown = true; // network failure - unknown, NOT negative
      }
    }
  }
  // 2b) Wikipedia lead classification - deterministic, independent of TVMaze
  // reachability (TVMaze ETIMEDOUTs intermittently from datacenter IPs;
  // measured Ben 10 -> game misroute when both TVMaze tries died).
  if (category === "other") {
    try {
      const d = await wikiEntityImages.wikiApi({
        action: "query", format: "json", formatversion: "2", redirects: "1",
        prop: "extracts", exintro: "1", explaintext: "1", exsentences: "3",
        titles: t,
      }).catch(() => null);
      const lead = String(d?.query?.pages?.[0]?.extract || "");
      const hint = _wikiLeadCategory(lead);
      if (hint) category = hint;
    } catch { /* wiki unreachable - continue */ }
  }
  // 2c) Steam storesearch - deterministic game signal (Elden Ring, Hollow
  // Knight...). Exact-name hits only; fuzzy matching would route movies with
  // game-adjacent names to the game chain. 2026-10-01 multi-source guard
  // (owner spec §6): cross-media franchises share exact names with their game
  // adaptations (Ben 10, SpongeBob...). If TVMaze was UNREACHABLE (not
  // negative), retry it once before committing to the game chain - an
  // Animation/TV signal outranks the Steam name collision.
  if (category === "other") {
    try {
      const probe = await imgSources.steamGameProbe(t);
      if (probe && _norm(probe.name) === _norm(t)) {
        if (tvmazeUnknown) {
          try {
            const r2 = await _http.get("https://api.tvmaze.com/singlesearch/shows", { params: { q: t }, timeout: 7000 });
            if (r2.data && r2.data.name && _norm(r2.data.name).includes(_norm(t).slice(0, 6))) {
              category = String(r2.data.type || "").toLowerCase() === "animation" ? "cartoon" : "tv";
            }
          } catch { /* steam hit stands */ }
        }
        if (category === "other") category = "game";
      }
    } catch { /* not game */ }
  }
  // 2c) iTunes media=movie probe - deterministic movie signal (Apollo 9 fix).
  if (category === "other") {
    try {
      const r = await _http.get("https://itunes.apple.com/search", { params: { term: t, media: "movie", limit: 3, country: "US" }, timeout: 7000 });
      if (r.status === 200 && (r.data?.resultCount || 0) > 0) {
        const nt = _norm(t);
        const hit = (r.data.results || []).some((x) => _norm(x.trackName || x.collectionName).includes(nt) && nt.length >= 4);
        if (hit) category = "movie";
      }
    } catch { /* not movie */ }
  }
  // 3) quizLore.detectMediaType (TVMaze + Wikipedia lead classification)
  if (category === "other" && typeof _deps.detectMediaType === "function") {
    try {
      const d = await _deps.detectMediaType(t);
      const m = String(d?.mediaType || "");
      if (["anime", "manga", "game", "movie", "tv", "comic"].includes(m)) category = m;
    } catch { /* keep other */ }
  }
  _catCache.set(ck, { ts: Date.now(), category });
  return category;
}

// ══════════════════════════════════════════
// ADAPTER: AniList cast (anime primary; identity is database-guaranteed)
// fetchFranchiseCast is injected by quiz.js (paced, single-flight, cached).
// ══════════════════════════════════════════
async function anilistPool(ctx) {
  let id = ctx.anilistId;
  if (!id && typeof _deps.resolveAnime === "function" && (ctx.category === "anime" || ctx.category === "manga")) {
    // owner-spec routing: anime/manga -> AniList even when the quiz context
    // arrived without a resolved media id (e.g. category detected late)
    try {
      const r = await _deps.resolveAnime(ctx.title);
      id = r?.anime?.id || r?.id || null;
    } catch { id = null; }
  }
  if (!id || typeof _deps.fetchFranchiseCast !== "function") return [];
  const cast = await _deps.fetchFranchiseCast(id, ctx.sessionRef).catch(() => null);
  if (!Array.isArray(cast)) return [];
  const seen = new Set();
  return cast.map((c) => rec({
    name: c.name,
    franchise: ctx.title,
    category: ctx.category,
    image_url: c.img || c.image || null,
    source: "anilist",
    source_id: `alchar-${c.id}`,
    confidence: 1.0,
    method: "cast",
    _band: c.band || null,
    _role: c.role || null,
  })).filter((r) => {
    if (!r.name) return false;
    // AniList serves a shared grey PLACEHOLDER for cast members without art -
    // N such records = N questions with the same picture = hash collisions
    if (!r.image_url) return true;
    if (/\/default\.|\/nostalgia\.|\/no_image/i.test(r.image_url)) { r.image_url = null; return true; }
    if (seen.has(r.image_url)) return false;
    seen.add(r.image_url);
    return true;
  });
}

// ══════════════════════════════════════════
// ADAPTER: Jikan/MyAnimeList (anime/manga fallback). Free, no key.
// Globally 504 during the 2026-09-30 audit - auto-skip with cooldown.
// ══════════════════════════════════════════
let _jikanCooldownUntil = 0;
async function jikanPool(ctx) {
  if (Date.now() < _jikanCooldownUntil) return [];
  try {
    const s = await _http.get("https://api.jikan.moe/v4/anime", { params: { q: ctx.title, limit: 1 }, timeout: 8000 });
    const malId = s.data?.data?.[0]?.mal_id;
    if (!malId) return [];
    await new Promise((r) => setTimeout(r, 450)); // jikan: 3 req/s, be polite
    const c = await _http.get(`https://api.jikan.moe/v4/anime/${malId}/characters`, { timeout: 9000 });
    const rows = c.data?.data || [];
    return rows.slice(0, 60).map((row) => rec({
      name: row.character?.name,
      franchise: ctx.title,
      category: ctx.category,
      image_url: row.character?.images?.jpg?.image_url || null,
      source: "jikan",
      source_id: `mal-${row.character?.mal_id || ""}`,
      confidence: 0.9,
      method: "cast",
    })).filter((r) => r.name);
  } catch (e) {
    const status = e?.response?.status;
    if (status === 503 || status === 504 || !status) _jikanCooldownUntil = Date.now() + 10 * 60e3;
    return [];
  }
}

// ══════════════════════════════════════════
// ADAPTER: TVMaze (tv primary). Free, no key. show cast carries images.
// ══════════════════════════════════════════
async function tvmazePool(ctx) {
  try {
    const s = await _http.get("https://api.tvmaze.com/singlesearch/shows", { params: { q: ctx.title }, timeout: 8000 });
    const showId = s.data?.id;
    if (!showId) return [];
    // 2026-09-30 FIX: /shows/{id}/characters is a 404 - the cast endpoint is
    // /shows/{id}/cast (rows = { character: {name,image,url}, person: {...} })
    const c = await _http.get(`https://api.tvmaze.com/shows/${showId}/cast`, { timeout: 9000 });
    const rows = c.data || [];
    return rows.map((row) => ({
      row,
      name: row.character?.name || row.person?.name,
    })).filter((x) => x.name).map(({ row, name }) => rec({
      name,
      franchise: ctx.title,
      category: ctx.category,
      image_url: row.character?.image?.original || row.character?.image?.medium || row.person?.image?.original || row.person?.image?.medium || null,
      source: "tvmaze",
      source_id: `tvmaze-${row.character?.id || row.person?.id || ""}`,
      confidence: 0.9,
      method: "cast",
      description: String(row.character?.url || ""),
    }));
  } catch { return []; }
}

// ══════════════════════════════════════════
// ADAPTER: TMDb (movie/tv) - REQUIRES TMDB_API_KEY in .env (free tier).
// Key-gated: adapter is silent when the key is absent (owner spec: multiple
// sources; the keyless chain must already be strong without it).
// ══════════════════════════════════════════
let _tmdbWarned = false;
async function tmdbPool(ctx) {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    if (!_tmdbWarned) { _tmdbWarned = true; console.log("[CharResolver] TMDB adapter: no TMDB_API_KEY in env - skipped (add key to enable)"); }
    return [];
  }
  try {
    const kind = ctx.category === "tv" ? "tv" : "movie";
    const s = await _http.get(`https://api.themoviedb.org/3/search/${kind}`, { params: { api_key: key, query: ctx.title }, timeout: 8000 });
    const hit = s.data?.results?.[0];
    if (!hit) return [];
    const c = await _http.get(`https://api.themoviedb.org/3/${kind}/${hit.id}/credits`, { params: { api_key: key }, timeout: 9000 });
    return (c.data?.cast || []).slice(0, 60).map((p) => rec({
      name: p.character || p.name,
      franchise: ctx.title,
      category: ctx.category,
      image_url: p.profile_path ? `https://image.tmdb.org/t/p/w342${p.profile_path}` : null,
      source: "tmdb",
      source_id: `tmdb-${p.credit_id || p.id}`,
      confidence: 0.85,
      method: "cast",
    })).filter((r) => r.name);
  } catch { return []; }
}

// ══════════════════════════════════════════
// ADAPTER: IGDB (game) - REQUIRES TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET.
// Key-gated, silent when absent.
// ══════════════════════════════════════════
let _igdb = { token: null, until: 0, warned: false };
async function igdbPool(ctx) {
  const cid = process.env.TWITCH_CLIENT_ID;
  const sec = process.env.TWITCH_CLIENT_SECRET;
  if (!cid || !sec) {
    if (!_igdb.warned) { _igdb.warned = true; console.log("[CharResolver] IGDB adapter: no TWITCH_CLIENT_ID/SECRET in env - skipped (add keys to enable)"); }
    return [];
  }
  try {
    if (!_igdb.token || Date.now() > _igdb.until) {
      const t = await _http.post("https://id.twitch.tv/oauth2/token", null, {
        params: { client_id: cid, client_secret: sec, grant_type: "client_credentials" }, timeout: 8000,
      });
      _igdb.token = t.data?.access_token;
      _igdb.until = Date.now() + Math.max(60e3, (t.data?.expires_in || 3600) * 900);
    }
    const g = await _http.post("https://api.igdb.com/v4/games", `search "${ctx.title}"; fields id,name; limit 1;`, {
      headers: { "Client-ID": cid, Authorization: `Bearer ${_igdb.token}` }, timeout: 8000,
    });
    const gameId = g.data?.[0]?.id;
    if (!gameId) return [];
    const c = await _http.post("https://api.igdb.com/v4/characters",
      `where games = ${gameId}; fields name,mug_shot.image_id; limit 60;`, {
      headers: { "Client-ID": cid, Authorization: `Bearer ${_igdb.token}` }, timeout: 9000,
    });
    return (c.data || []).map((ch) => rec({
      name: ch.name,
      franchise: ctx.title,
      category: ctx.category,
      image_url: ch.mug_shot?.image_id ? `https://images.igdb.com/igdb/image/upload/t_720p/${ch.mug_shot.image_id}.jpg` : null,
      source: "igdb",
      source_id: `igdb-${ch.id}`,
      confidence: 0.85,
      method: "cast",
    })).filter((r) => r.name);
  } catch { return []; }
}

// ══════════════════════════════════════════
// ADAPTER: Wikipedia generic pipeline (games/movies/tv/comics + ANY franchise)
// This is what makes Hollow Knight (and every uncurated franchise) work:
//   1. registry names when the slug is curated (33 franchises, fame-ordered)
//   2. list-article discovery: "List of <T> characters" / "<T> characters"
//   3. link extraction from the list article AND the base franchise article
//      (Hollow Knight keeps its cast as links inside the main article)
//   4. batched pageimages (pilicense=any - fair-use character art included)
//   5. identity: article-title anchoring + wikiEntityImages.identityOk gate
// All API/download discipline is inherited from wikiEntityImages.
// ══════════════════════════════════════════
const _JUNK_LINK = /(speedrun|gameplay|soundtrack|\bost\b|album|film series|category:|template:|portal:|development of|reception|expansion pack|downloadable content|season \d|episode list|video game series|novelization|comic book series)/i;

// ══════════════════════════════════════════
// CHARACTER CLASSIFIER (2026-09-30, measured fix)
// Raw article links are NOT characters: "Dragon Ball" article links its video
// games, "The Matrix" links OTHER films (Batman & Robin, Alien), the Hollow
// Knight article links the Unity engine and Team Cherry's staff. The old
// identityOk gate cannot catch these - the article IS about the named subject;
// the subject just is not a CHARACTER. Classification from the article LEAD:
//   accept  = character-signal AND NOT media/person/website-signal
//   fallback= title carries a franchise disambiguator "<Name> (<Franchise>)"
// Measured examples that MUST reject: "Dragon Ball Legends is a 2018 video
// game...", "$456,000 Squid Game in Real Life!", "Polygon (website)",
// "Matthew Griffin is a video game marketer", "Unity (game engine)".
// Measured examples that MUST pass: "Goku is a character and the main
// protagonist of the Dragon Ball manga", "Batman is a superhero appearing in
// American comic books", "Emilia is a fictional character in Re:Zero".
// ══════════════════════════════════════════
const _CHAR_PAT = /\bfictional\b|\bsuperhero\b|\bsupervillain\b|\bsuper villain\b|\btitle character\b|\bmain character\b|\bprotagonist\b|\bantagonist\b|\bdeuteragonist\b|\bplayable character\b|\bcharacter (in|from|of|created|and)|\bmecha\b|\bmascot\b|\bfictional (creature|being|entity|species|character|robot|android|monster|animal|deity)|\bboss (in|of)\b|\bvoice belongs\b|\bis voiced\b|\bportrayed by\b/i;
const _JUNK_LEAD = /\bis a \d{4} (video game|film|movie)\b|\bvideo game (developed|published|based|in the|series)\b|\bplatform game\b|\baction-adventure game\b|\brole-playing (video )?game\b|\bfighting game\b|\bracing game\b|\bpuzzle (video )?game\b|\bstrategy (video )?game\b|\broguelike\b|\bshooter game\b|\bhorror game\b|\bindie game\b|\bgame engine\b|\btelevision (series|show|miniseries) (created|developed|that|premiered|which)\b|\bweb series\b|\bfilm (directed|series|adaptation|that|based)\b|\bsuperhero film\b|\banimated (science |martial arts |fantasy |action |short )?film\b|\bcomedy film\b|\baction film\b|\bhorror film\b|\bscience fiction film\b|\bshort film\b|\b\d{1,2}(st|nd|rd|th) (film|movie)\b|\bepisode of\b|\bsong (by|recorded|written)\b|\balbum (by|recorded)\b|\bsingle by\b|\bis a website\b|\bwebcomic\b|\bYouTube (channel|video)\b|\b(is|was) an? (American|Japanese|British|English|Canadian|Australian|South Korean|Chinese|French|German|Spanish|Italian|Swedish|Dutch) (voice )?(actor|actress|singer|musician|writer|director|producer|designer|marketer|developer|programmer|journalist|artist|comedian)\b|\b(is|was) an? (video game|game) (developer|director|designer|producer|journalist|marketer|programmer|studio|company)\b|\bvideo game studio\b|\bvideo game developer\b|\bmanga series\b|\banime series\b|\blight novel series\b|\bmanga written\b|\bcomic (strip|book series)\b|\bnovel (by|written|series)\b|\bnon-player character\b|\bboss (battle|fight|level|stage)\b|\bmetroidvania\b|\bupcoming (video )?game\b|\bsequel to (the )?(video )?game\b|\bvoice (actor|actress|artist)\b|\bknown for (voicing|his voice|her voice|providing voices)\b/i;
// generic-concept articles that keep leaking into franchise link pools
// ("Boss (video games)", "Crossover (fiction)", "Cameo appearance", ...)
const _GENERIC_TITLE = /^(boss|crossover|cameo|villain|hero|sidekick|protagonist|antagonist|character|enemy|monster|species|non-player character)\b/i;
const _GENERIC_DISAMBIG = /\((video games?|fiction|concept|gaming|mechanic|trope|media|franchise)\)\s*$/i;
// ══════════════════════════════════════════
// WIKIPEDIA LEAD CATEGORY (2026-10-01 owner bug report §6: deterministic
// classification first). Independent of TVMaze reachability: the en.wiki
// intro of the franchise article states what the franchise IS.
//   "animated ... television series" / network identity (Cartoon Network,
//   Nickelodeon, Disney, PBS Kids - exclusively animated content) -> cartoon
//   "television series" -> tv | "video game" family -> game | film -> movie
// Measured: Ben 10 lead = "...media franchise... owned by The Cartoon
// Network, Inc." -> cartoon BEFORE Steam's exact-name "Ben 10" game can
// misroute it; Elden Ring lead = "action role-playing game" -> game.
// ══════════════════════════════════════════
function _wikiLeadCategory(lead) {
  const s = String(lead || "").toLowerCase();
  if (!s) return null;
  if (/animated (television |tv )?(series|show|sitcom|comedy|science fiction)/.test(s)
    || /\b(cartoon network|nickelodeon|nicktoons|disney (channel|xd)|pbs kids)\b/.test(s)) return "cartoon";
  if (/television (series|show|miniseries|sitcom)/.test(s)) return "tv";
  if (/video game|role-playing game|platform game|action-adventure game|puzzle game/.test(s)) return "game";
  if (/(animated )?(film|movie)\b/.test(s)) return "movie";
  return null;
}
function _classifyLead(lead, article, franchiseTitle) {
  const text = String(lead || "").slice(0, 600);
  if (!text) return false;
  if (_CHAR_PAT.test(text) && !_JUNK_LEAD.test(text)) return true;
  // disambiguator fallback: "Emilia (Re:Zero)" / "Hornet (Hollow Knight)" -
  // an article explicitly scoped to THIS franchise is a franchise entity;
  // combined with the junk check this stays clean (games use "(video game)")
  const m = /\(([^)]+)\)\s*$/.exec(article || "");
  if (m && !_JUNK_LEAD.test(text)) {
    const d = _norm(m[1]);
    const f = _norm(franchiseTitle);
    if (f && (d.includes(f) || f.includes(d))) return true;
  }
  return false;
}

async function _franchiseSearchTitle(title) {
  // resolve the canonical en.wiki article for the franchise itself
  const data = await wikiEntityImages.wikiApi({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "pageprops", ppprop: "disambiguation",
    generator: "search", gsrsearch: `intitle:"${title}"`, gsrnamespace: "0", gsrlimit: "5",
  }).catch(() => null);
  const pages = (data?.query?.pages || []).filter((p) => !p.pageprops?.disambiguation);
  pages.sort((a, b) => (a.index || 99) - (b.index || 99));
  const nt = _norm(title);
  return pages.find((p) => _norm(p.title).includes(nt))?.title || pages[0]?.title || null;
}

async function _articleLinks(article, cap = 130) {
  if (!article) return [];
  const names = [];
  let cont = null;
  for (let round = 0; round < 2 && names.length < cap; round++) {
    const params = {
      action: "query", format: "json", formatversion: "2", redirects: "1",
      prop: "links", plnamespace: "0", pllimit: "max", titles: article,
    };
    if (cont) params.plcontinue = cont;
    const data = await wikiEntityImages.wikiApi(params).catch(() => null);
    const page = data?.query?.pages?.[0];
    for (const l of page?.links || []) {
      const t = l.title || "";
      if (/^(List of|Index of)/i.test(t) || _JUNK_LINK.test(t)) continue;
      names.push(t);
      if (names.length >= cap) break;
    }
    cont = data?.continue?.plcontinue || null;
    if (!cont) break;
  }
  return names;
}

// section headings of an article - many games keep their cast as SECTION
// headings of the main article (Hollow Knight: The Knight, Hornet, Elderbug...
// with NO separate character articles). Those headings are character-name
// candidates (no article anchor - images come from the file-search fallback).
const _SECTION_JUNK = /^(references|external links|see also|notes|bibliography|further reading|gallery|gameplay|plot|story|development|release|reception|sales|sequel|legacy|references and notes|cast \(.*\)|credits|trivia|awards|adaptations|other media|merchandise|music|audio|downloadable content|expansions|sequels|prequel|prehistory|history|overview|synopsis|setting|franchise|related media|in other media|cancelled|canceled)\b/i;
async function _articleSections(article) {
  if (!article) return [];
  const data = await wikiEntityImages.wikiApi({
    action: "parse", format: "json", formatversion: "2", prop: "sections", page: article,
  }).catch(() => null);
  const sections = data?.parse?.sections || [];
  const out = [];
  for (const s of sections) {
    const t = String(s.line || "").replace(/<[^>]+>/g, "").replace(/\[edit\]/i, "").trim();
    if (!t || t.length > 40 || _SECTION_JUNK.test(t)) continue;
    if (/^(list of|index of)/i.test(t)) continue;
    out.push(t);
  }
  return out;
}

// rank raw candidate names by SOURCE: links from a wikipedia "List of X
// characters" article are curated-by-wikipedia character lists (tier 0);
// disambiguated franchise-scoped titles tier 1; base-article links last
// (they contain games/films/staff and rely on the lead classifier)
function _rankNames(names, title, registryNames) {
  const regSet = new Set((registryNames || []).map((n) => _norm(n)));
  const nq = _norm(title);
  const seen = new Set();
  const scored = [];
  for (const item of names) {
    const raw = typeof item === "string" ? item : item.name;
    const origin = typeof item === "string" ? 3 : (item.tier || 3);
    const key = _norm(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    let score = origin;
    if (regSet.has(key)) score = 0;
    else if (/\([^)]+\)/.test(raw) && nq && _norm(raw).includes(nq.split(" ")[0])) score = Math.min(score, 1);
    scored.push({ name: raw, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.name);
}

// combined batched query: lead extract + pageimage + disambiguation flag
// (one API call per 20 titles instead of two separate batches)
async function _batchLeadsAndImages(titles) {
  const data = await wikiEntityImages.wikiApi({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "extracts|pageimages|pageprops",
    exintro: "1", explaintext: "1", exlimit: "20",
    ppprop: "disambiguation",
    piprop: "thumbnail", pithumbsize: "640", pilicense: "any",
    titles: titles.join("|"),
  }).catch(() => null);
  const out = [];
  const redirectMap = new Map();
  for (const r of data?.query?.redirects || []) redirectMap.set(r.from, r.to);
  for (const p of data?.query?.pages || []) {
    out.push({
      title: p.title,
      thumb: wikiEntityImages._normUpload(p.thumbnail?.source || "") || null,
      lead: p.extract || "",
      disambig: !!p.pageprops?.disambiguation,
    });
  }
  return { pages: out, redirectMap };
}

async function wikipediaPool(ctx) {
  const registry = ctx.slug ? wikiEntityImages.W[ctx.slug] : null;
  const registryNames = registry?.names || [];
  const qualifier = registry?.q || ctx.title;
  // candidate names carry their tier: 0 = curated registry, 1 = list-article
  // links (wikipedia's own character lists), 3 = base-article links (needs
  // the lead classifier to strip games/films/staff)
  let named = registryNames.map((n) => ({ name: n, tier: 0 }));
  if (named.length < 40) {
    const baseArticle = await _franchiseSearchTitle(ctx.title).catch(() => null);
    // list-article discovery: known title patterns + intitle search fallback
    const listTries = [
      `List of ${ctx.title} characters`,
      `List of ${ctx.title} franchise characters`,
      `${ctx.title} characters`,
    ];
    const search = await wikiEntityImages.wikiApi({
      action: "query", format: "json", formatversion: "2", list: "search",
      srsearch: `intitle:"list of" intitle:"${ctx.title}"`, srnamespace: "0", srlimit: "6",
    }).catch(() => null);
    for (const s of search?.query?.search || []) {
      if (/^list of .*(characters|cast|people)/i.test(s.title || "")) listTries.push(s.title);
    }
    const batch = await wikiEntityImages.pageimagesBatch(listTries.slice(0, 5)).catch(() => null);
    const listArticles = new Set();
    if (batch) {
      for (const t of listTries) {
        const direct = batch.redirectMap.get(t) || t;
        if (batch.byTitle.has(t) || batch.byTitle.has(direct)) listArticles.add(direct);
      }
    }
    if (baseArticle) listArticles.add(baseArticle);
    // extract links per source article, keeping the tier per origin
    const links = [];
    for (const art of [...listArticles].slice(0, 4)) {
      const tier = /^list of /i.test(art) ? 1 : 3;
      const l = await _articleLinks(art, 120).catch(() => []);
      for (const name of l) links.push({ name, tier });
    }
    named.push(..._rankNames(links, ctx.title, registryNames).map((n) => ({
      name: n,
      tier: (links.find((x) => x.name === n) || {}).tier || 3,
    })));
    // section headings of the BASE article (games like Hollow Knight keep the
    // cast there) - tier 2: names without articles; images via file-search
    if (baseArticle) {
      const heads = await _articleSections(baseArticle).catch(() => []);
      for (const h of heads) named.push({ name: h, tier: 2 });
    }
  }
  if (!named.length) return [];
  // dedupe by normalized name, keep the BEST tier
  const byKey = new Map();
  for (const item of named) {
    const k = _norm(item.name);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev || item.tier < prev.tier) byKey.set(k, item);
  }
  const candidates = [...byKey.values()].sort((a, b) => a.tier - b.tier).slice(0, 120);

  // combined batches: lead + image + disambig per title; classify each
  const out = [];
  const seenUrls = new Set();
  for (let i = 0; i < candidates.length; i += 20) {
    const batchTitles = candidates.slice(i, i + 20).map((c) => c.name);
    const r = await _batchLeadsAndImages(batchTitles).catch(() => null);
    if (!r) continue;
    for (const c of candidates.slice(i, i + 20)) {
      // generic-concept titles ("Boss (video games)", "Crossover (fiction)",
      // "Cameo appearance") - reject BEFORE any page work
      if (_GENERIC_TITLE.test(c.name)) continue;
      // section-heading names have NO article anchor (article is null) - they
      // join the pool as metadata records; images come from the file-search
      // fallback at pick time. No page-dependent gates apply to them.
      const hasNoArticle = c.tier === 2;
      if (hasNoArticle) {
        out.push(rec({
          name: c.name,
          franchise: ctx.title,
          category: ctx.category,
          image_url: null,
          source: "wikipedia",
          source_id: `wiki-section-${recordKey(c.name)}`,
          confidence: 0.6,
          article: null,
          method: "section-heading",
        }));
        continue;
      }
      const direct = r.redirectMap.get(c.name) || c.name;
      const page = r.pages.find((p) => p.title === direct || p.title === c.name);
      if (!page || page.disambig || !page.thumb) continue;
      if (_GENERIC_DISAMBIG.test(direct)) continue;
      // identity anchoring by tier:
      //   tier 0 (curated registry) + tier 1 (wikipedia's own "List of X
      //   characters" membership) ARE the identity anchor - no extra gate
      //   ("Monkey D. Luffy" carries no franchise word and that is FINE)
      //   tier 3 (base-article links) needs the full identity gate
      const isRegistry = c.tier === 0;
      const isListTier = c.tier === 1;
      if (!isRegistry && !isListTier) {
        const ok = wikiEntityImages.identityOk(c.name.replace(/\s*\([^)]*\)\s*$/, ""), direct, page.thumb, qualifier);
        if (!ok) continue;
      }
      // lead classifier applies to every non-registry candidate
      if (!isRegistry && !_classifyLead(page.lead, direct, ctx.title)) continue;
      const urlKey = page.thumb.split("?")[0];
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);
      out.push(rec({
        name: c.name,
        franchise: ctx.title,
        category: ctx.category,
        image_url: page.thumb,
        source: "wikipedia",
        source_id: `wiki-${direct}`,
        confidence: isRegistry ? 0.9 : isListTier ? 0.8 : 0.7,
        article: direct,
        method: isRegistry ? "registry-article" : isListTier ? "list-article" : "link-article",
      }));
    }
  }
  return out;
}

// ══════════════════════════════════════════
// ADAPTER: Wikidata - cross-media fallback. Two uses:
//   pool(): thin (SPARQL fictional-character pools are sparse) - skipped
//   imageForRecord(): P18 via en.wiki sitelink when other sources came up
//   dry for a character we KNOW exists (article anchored) - free, no key
// ══════════════════════════════════════════
async function wikidataImageForArticle(article, thumbWidth = 640) {
  if (!article) return null;
  try {
    const d = await _http.get("https://www.wikidata.org/w/api.php", {
      params: {
        action: "wbgetentities", format: "json", sites: "enwiki",
        titles: article, props: "claims", languages: "en",
      }, timeout: 9000,
    });
    const ent = Object.values(d.data?.entities || {})[0];
    const p18 = ent?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!p18) return null;
    // Special:FilePath redirects to upload.wikimedia.org - reliable here
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}?width=${thumbWidth}`;
  } catch { return null; }
}

// ══════════════════════════════════════════
// POOL BUILDER (category-routed, merged, deduped, disk-cached 24h)
// ══════════════════════════════════════════
const POOLS_DIR = path.join(__dirname, "..", "data", "quiz_pools");
function _poolFile(title) {
  const h = crypto.createHash("sha1").update(_norm(title)).digest("hex").slice(0, 16);
  return path.join(POOLS_DIR, `pool-${h}.json`);
}
function _loadPoolDisk(title) {
  try {
    const f = _poolFile(title);
    if (!fs.existsSync(f)) return null;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    if (!j || !Array.isArray(j.records)) return null;
    if (Date.now() - j.ts > 24 * 3600e3) return null;
    return j;
  } catch { return null; }
}
function _savePoolDisk(title, category, records) {
  try {
    if (!fs.existsSync(POOLS_DIR)) fs.mkdirSync(POOLS_DIR, { recursive: true });
    fs.writeFileSync(_poolFile(title), JSON.stringify({
      ts: Date.now(), title, category,
      records: records.map((r) => ({ ...r, _dropBytes: undefined })),
    }));
  } catch { /* disk cache is best-effort */ }
}

function _mergeRecords(lists, ctx) {
  const byKey = new Map();
  for (const list of lists) {
    for (const r of list) {
      if (!r.name) continue;
      const k = recordKey(r.name);
      if (!k) continue;
      const prev = byKey.get(k);
      if (!prev) { byKey.set(k, r); continue; }
      // merge: prefer the record WITH an image, then higher confidence
      if (!prev.image_url && r.image_url) { byKey.set(k, { ...r, aliases: [...new Set([...(prev.aliases || []), prev.name])] }); }
      else if (prev.image_url && !r.image_url) { prev.aliases = [...new Set([...(prev.aliases || []), r.name])]; }
      else if (r.confidence > prev.confidence) byKey.set(k, r);
    }
  }
  return [...byKey.values()];
}

const CATEGORY_SOURCES = {
  // 2026-10-01 rewire (owner bug report §5): category chains rebuilt from
  // measured per-source yields. DB-anchored art first, wiki tier second,
  // entity-art for games/movies/tv, general search LAST (identity needs a
  // vision gate there).
  anime:   ["anilist", "jikan", "kitsu", "wikipedia", "fandomnames", "wikidata"],
  manga:   ["anilist", "jikan", "kitsu", "wikipedia", "fandomnames", "wikidata"],
  game:    ["steam", "anilist", "igdb", "speedrun", "wikipedia", "fandomnames", "wikidata"],
  movie:   ["tmdb", "itunes", "anilist", "wikipedia", "fandomnames", "wikidata"],
  tv:      ["anilist", "tvmaze", "tmdb", "itunes", "wikipedia", "fandomnames", "wikidata"],
  cartoon: ["anilist", "kitsu", "tvmaze", "tmdb", "itunes", "wikipedia", "fandomnames", "wikidata"],
  comic:   ["anilist", "wikipedia", "fandomnames", "wikidata"],
  other:   ["anilist", "wikipedia", "tvmaze", "fandomnames", "wikidata"],
};

// ══════════════════════════════════════════
// ADAPTER: Fandom community-wiki NAME lists (owner spec: "wiki/community
// sources can be used as additional fallbacks"). The Fandom API is reachable
// from this box (only its image CDN is Cloudflare-403) - so Fandom supplies
// CHARACTER NAMES (decoys + file-search subjects) while bytes come from
// Wikipedia's file namespace. Kicks in when the pool is thin (<12 records).
// ══════════════════════════════════════════
const _FANDOM_CATS = ["Category:Characters", "Category:Playable Characters", "Category:NPCs", "Category:Bosses", "Category:Antagonists", "Category:Bosses (Hollow Knight)"];
async function fandomNamesPool(ctx) {
  try {
    if (!quizLore) quizLore = require("../games/quizLore");
    const wiki = await quizLore.resolveWiki(ctx.title).catch(() => null)
      || await new Promise((r) => setTimeout(() => r(null), 1200)).then(() => quizLore.resolveWiki(ctx.title).catch(() => null));
    if (!wiki) return [];
    const names = [];
    for (const cat of _FANDOM_CATS) {
      const c = await quizLore.wikiApi(wiki, {
        action: "query", list: "categorymembers", cmtitle: cat,
        cmlimit: "50", cmtype: "page",
      }).catch(() => null);
      for (const m of c?.query?.categorymembers || []) {
        const t = String(m.title || "").trim();
        if (t && !t.includes("Category:") && t.length < 48) names.push(t);
      }
      if (names.length >= 30) break;
    }
    return [...new Set(names)].slice(0, 50).map((n) => rec({
      name: n,
      franchise: ctx.title,
      category: ctx.category,
      image_url: null, // Fandom CDN is IP-blocked; bytes come from en.wiki file search
      source: "fandom",
      source_id: `fandom-${recordKey(n)}`,
      confidence: 0.6,
      article: null,
      method: "fandom-category",
    }));
  } catch { return []; }
}

const _adapterLog = new Set();
async function buildPool(ctx) {
  // 1) disk cache
  const disk = _loadPoolDisk(ctx.title);
  if (disk) return { ...disk, cached: "disk" };
  const category = ctx.category || (await detectCategory(ctx.title));
  const chain = CATEGORY_SOURCES[category] || CATEGORY_SOURCES.other;
  const lists = [];
  const usedSources = [];
  for (const src of chain) {
    if (src === "wikidata") continue; // pool-thin: image-fallback only
    try {
      const rows = src === "anilist" ? await anilistPool(ctx)
        : src === "jikan" ? await jikanPool(ctx)
        : src === "kitsu" ? await imgSources.kitsuPool(ctx).then((rows) => rows.map((r) => rec({ ...r, franchise: ctx.title, category: ctx.category })))
        : src === "tvmaze" ? await tvmazePool(ctx)
        : src === "tmdb" ? await tmdbPool(ctx)
        : src === "igdb" ? await igdbPool(ctx)
        : src === "steam" ? await imgSources.steamEntityArt(ctx)
        : src === "speedrun" ? await imgSources.speedrunEntityArt(ctx)
        : src === "itunes" ? await imgSources.itunesEntityArt(ctx)
        : src === "wikipedia" ? await wikipediaPool(ctx)
        : src === "fandomnames" ? await fandomNamesPool(ctx)
        : [];
      if (rows.length) { lists.push(rows); usedSources.push(`${src}:${rows.length}`); }
    } catch (e) {
      const tag = `${src}:${String(e?.message || e).slice(0, 40)}`;
      if (!_adapterLog.has(tag)) { _adapterLog.add(tag); console.log(`[CharResolver] adapter ${src} error: ${tag}`); }
    }
  }
  const records = _mergeRecords(lists, { ...ctx, category });
  const withImages = records.filter((r) => r.image_url).length;
  _savePoolDisk(ctx.title, category, records);
  console.log(`[CharResolver] pool "${ctx.title}" cat=${category} records=${records.length} withImages=${withImages} sources=[${usedSources.join(", ")}]`);
  return { title: ctx.title, category, records, cached: "fresh" };
}

// ══════════════════════════════════════════
// IMAGE FALLBACK CHAIN (owner spec §retrieval) - for ONE record:
//   1. the record's own source image (primary API)
//   2. its wikipedia article's own file list (name-anchored hunt)
//   3. Wikidata P18 via the article's sitelink (cross-media fallback)
//   4. wikipedia search anchored on "name + franchise" + identityOk gate
// Every candidate: download (paced, retried) -> pixel gate -> bytes-hash
// dedup -> accepted. Tiny/broken/blank/logo files never pass the gate.
// ══════════════════════════════════════════
const _bytesDl = { inflight: 0, waiters: [], last: 0 };
async function _dlSlot() {
  if (_bytesDl.inflight < 2) { _bytesDl.inflight++; return; }
  await new Promise((r) => _bytesDl.waiters.push(r));
}
function _dlFree() { _bytesDl.inflight--; const w = _bytesDl.waiters.shift(); if (w) { _bytesDl.inflight++; w(); } }

async function _download(url) {
  await _dlSlot();
  try {
    let last = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const gap = Date.now() - _bytesDl.last;
      if (gap < 220) await new Promise((r) => setTimeout(r, 220 - gap));
      _bytesDl.last = Date.now();
      const dl = await quizLore.downloadMedia(url, "image").catch(() => null);
      if (dl && dl.buf) return dl;
      last = dl; // keep the failure object (carries .transient) for the caller
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1200 * (attempt + 1) + crypto.randomInt(0, 500)));
    }
    return last;
  } finally { _dlFree(); }
}

async function _gated(buf, label) {
  const gate = await imageGate.inspectImageBuffer(buf, { minW: 150, minH: 150, label: String(label).slice(0, 60) }).catch(() => ({ ok: false }));
  return gate.ok ? gate : null;
}

let quizLore = null; // injected (quizLore has heavy requires of its own)

const _FILE_JUNK = /(cosplay|sketch|screenshot|gameplay|boss fight|icon|logo|\.svg|\.pdf|map|poster|box.?art|cover|fan ?art|figurine|amiibo|toy|statue|convention|comicon|lucca|cosplayer)/i;
async function _fileNamespaceSearch(name, qualifier) {
  const base = String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
  const data = await wikiEntityImages.wikiApi({
    action: "query", format: "json", formatversion: "2", list: "search",
    srsearch: `${base} ${qualifier || ""}`.trim(), srnamespace: "6", srlimit: "10",
  }).catch(() => null);
  const files = (data?.query?.search || []).map((s) => s.title || "")
    .filter((t) => /^File:/i.test(t) && /\.(png|jpe?g|webp)$/i.test(t) && !_FILE_JUNK.test(t));
  if (!files.length) return null;
  const toks = _norm(base).split(" ").filter((t) => t.length >= 3);
  if (!toks.length) return null;
  // the file NAME must name the subject ("Hornet (Hollow Knight).png")
  const match = files.find((f) => {
    const fn = _norm(f.replace(/^File:/, ""));
    return toks.every((t) => fn.includes(t));
  }) || (toks.length === 1 ? files.find((f) => _norm(f.replace(/^File:/, "")).includes(toks[0])) : null);
  if (!match) return null;
  const info = await wikiEntityImages.wikiApi({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "640", titles: match,
  }).catch(() => null);
  const ii = info?.query?.pages?.[0]?.imageinfo?.[0];
  if (!ii?.url) return null;
  if (ii.mime && !/image\/(jpeg|png|webp)/.test(ii.mime)) return null;
  if ((ii.width || 0) < 150 || (ii.height || 0) < 150) return null;
  return wikiEntityImages._normUpload(ii.thumburl || ii.url);
}

async function resolveImageBytes(record, ctx) {
  if (!quizLore) quizLore = require("../games/quizLore");
  const attempts = [];
  if (record.image_url) attempts.push({ tag: record.source, url: record.image_url, anchored: true });
  if (record.alt_urls) for (const u of record.alt_urls.slice(0, 2)) attempts.push({ tag: record.source, url: u, anchored: true });
  if (record.article) {
    const nf = await wikiEntityImages.articleNamedFile(record.article, record.name).catch(() => null);
    if (nf) attempts.push({ tag: "wiki-article-file", url: nf.url, anchored: true });
  }
  if (record.article) {
    const wd = await wikidataImageForArticle(record.article).catch(() => null);
    if (wd) attempts.push({ tag: "wikidata-P18", url: wd, anchored: true });
  }
  // File-namespace search - rescues franchise characters kept as SECTION
  // HEADINGS of the base article (Hollow Knight's The Knight / Hornet etc.):
  // en.wiki hosts fair-use character renders as File:<Name>.png even when no
  // character article exists. Strict junk filter (cosplay/sketch/screenshots).
  if (ctx?.qualifier) {
    const fs_ = await _fileNamespaceSearch(record.name, ctx.qualifier).catch(() => null);
    if (fs_) attempts.push({ tag: "wiki-file-search", url: fs_, anchored: true });
  }
  if (ctx?.qualifier) {
    const sr = await wikiEntityImages.searchResolve(record.name.replace(/\s*\([^)]*\)\s*$/, ""), ctx.qualifier).catch(() => null);
    if (sr && wikiEntityImages.identityOk(record.name, sr.article, sr.url, ctx.qualifier)) {
      attempts.push({ tag: "wiki-search", url: sr.url, anchored: true });
    }
  }
  const ck = `cr-${record.source}-${recordKey(record.name)}`;
  const cached = portraitCache.getPortrait(ck);
  if (cached) return { ...cached, url: cached.url, hash: crypto.createHash("sha1").update(cached.buf).digest("hex") };
  for (const a of attempts) {
    if (!a.url) continue;
    if (portraitCache.hasNegative(ck)) break; // whole record failed earlier
    const out = await _dlGateNormalize(a.url, a.tag, record, ctx, ck);
    if (out) return out;
  }
  // GENERAL IMAGE SEARCH TIER (2026-10-01 owner bug report §4A) - LAST
  // fallback, after every anchored source. Identity is NOT database-guaranteed
  // here: every candidate must pass the vision gate when a provider is
  // configured (open/closed circuit handled inside visionVerify), otherwise
  // it is skipped in strict mode / allowed with pixel gates only in lenient
  // mode (VISION_UNANCHORED=1).
  const strictVision = !!process.env.VISION_ENDPOINT;
  const allowUnanchored = strictVision ? true : process.env.VISION_UNANCHORED === "1";
  if (allowUnanchored) {
    const ddgRows = await imgSources.ddgRecordImages(record.name, ctx?.qualifier || record.franchise).catch(() => []);
    for (const row of ddgRows.slice(0, 4)) {
      const out = await _dlGateNormalize(row.image_url, `ddg:${row.host}`, record, ctx, ck, { visionSubject: record.name, visionContext: ctx?.qualifier || record.franchise || "" });
      if (out) return out;
    }
    const ovRows = await imgSources.openverseImageSearch(`${record.name} ${ctx?.qualifier || record.franchise || ""}`.trim(), { limit: 4 }).catch(() => []);
    for (const row of ovRows.slice(0, 3)) {
      const out = await _dlGateNormalize(row.image_url, `openverse:${row.host}`, record, ctx, ck, { visionSubject: record.name, visionContext: ctx?.qualifier || record.franchise || "" });
      if (out) return out;
    }
  }
  return null;
}

// one URL through the full gauntlet: download -> pixel gate -> vision gate
// (unanchored only) -> NORMALIZE (white-bg flatten + uniform canvas) -> cache
async function _dlGateNormalize(url, tag, record, ctx, cacheKey, { visionSubject = null, visionContext = "" } = {}) {
  if (!imgSources.hostAllowed(url)) {
    // 2026-10-01: DENYLIST hits are deterministic -> negative-cache is right;
    // a 10-minute HOST COOLDOWN after a rate-limit burst is TRANSIENT - never
    // poison 24h of per-record negatives for it (measured: one wikipedia 429
    // burst negative-cached a whole franchise's cast for a day).
    if (imgSources.isDenied(url)) portraitCache.putNegative(cacheKey);
    return null;
  }
  const dl = await _download(url);
  if (!dl || !dl.buf) {
    imgSources.noteHostFailure(url);
    // deterministic failure (404/403/bad magic) -> negative-cache 24h;
    // transient failure (429/5xx/timeout) -> retry later, no negative
    if (!dl?.transient) portraitCache.putNegative(cacheKey);
    return null;
  }
  const gate = await _gated(dl.buf, `${tag}:${record.name}`);
  if (!gate) { imgSources.noteHostFailure(url); return null; }
  if (visionSubject) {
    const v = await imgSources.visionGate(dl.buf, dl.mime, visionSubject, visionContext);
    // visionVerify vocabulary: "reject" = wrong subject / nsfw -> drop the
    // candidate. "unknown" (no provider, breaker open, provider flake) keeps
    // the pixel-gate-only lenient path.
    if (v.decision === "reject" || v.decision === "mismatch") return null;
  }
  const norm = await quizImagePipeline.normalize(dl.buf, { url, label: `${tag}:${record.name}` }).catch(() => ({ ok: false, reason: "norm-crash" }));
  if (!norm.ok) return null;
  portraitCache.putPortrait(cacheKey, norm.buf, { mime: norm.mime, url, name: record.name, w: norm.width, h: norm.height });
  return { buf: norm.buf, mime: norm.mime, url, w: norm.width, h: norm.height, hash: crypto.createHash("sha1").update(norm.buf).digest("hex") };
}

// ══════════════════════════════════════════
// CROSS-QUIZ RECENCY (owner spec: "keep track of recently used character IDs
// so repeated quizzes don't constantly recycle the same few characters")
// JSON file: franchise -> [{ key, name, ts }]; 7-day window, cap 80.
// ══════════════════════════════════════════
const RECENT_FILE = path.join(__dirname, "..", "data", "quiz_recent_used.json");
function _loadRecent() {
  try { return JSON.parse(fs.readFileSync(RECENT_FILE, "utf8")) || {}; } catch { return {}; }
}
function _saveRecent(obj) {
  try { fs.writeFileSync(RECENT_FILE, JSON.stringify(obj)); } catch { /* best-effort */ }
}
function _recentKeys(frKey) {
  const all = _loadRecent();
  const now = Date.now();
  const rows = (all[frKey] || []).filter((r) => now - r.ts < 7 * 24 * 3600e3);
  all[frKey] = rows;
  return { map: new Map(rows.map((r) => [r.key, r.ts])), all };
}
function _recordRecent(frKey, record) {
  const all = _loadRecent();
  const now = Date.now();
  const rows = (all[frKey] || []).filter((r) => now - r.ts < 7 * 24 * 3600e3);
  rows.push({ key: recordKey(record.name), name: record.name, ts: now });
  all[frKey] = rows.slice(-80);
  _saveRecent(all);
}

// ══════════════════════════════════════════
// PER-SESSION STATE (WeakMap on the quiz session object -> two groups running
// the same quiz NEVER share a sequence; GC is automatic when a session dies)
// ══════════════════════════════════════════
const _sessions = new WeakMap(); // session -> { frKey -> { order, hashes } }

/**
 * Pick ONE verified image question for this franchise.
 * Mirrors quiz.js buildImageQuestion contract: returns the question object
 * (type "image", hideOptions true) or null.
 * ctx = { title, slug, category, anilistId, difficulty, usedKeys, sessionRef, qualifier }
 */
async function pickImageQuestion(ctx) {
  const session = ctx.sessionRef || null;
  const frKey = _norm(ctx.title);
  let state = session ? _sessions.get(session) : null;
  if (!state) { state = new Map(); if (session) _sessions.set(session, state); }
  let s = state.get(frKey);
  if (!s) {
    // build/load the pool ONCE per session per franchise, then shuffle ONCE
    const pool = await buildPool({ title: ctx.title, slug: ctx.slug, category: ctx.category, anilistId: ctx.anilistId, sessionRef: ctx.sessionRef });
    const verified = pool.records.filter((r) => r.image_url);
    // DEAD-POOL RESCUE (2026-10-02): obscure/non-media entities ("Apollo 9")
    // can end with 0 verified images while holding wiki metadata records.
    // Run the per-record fallback chain (article named-file -> wikidata P18
    // -> file-namespace search) on the closest-name records and adopt what
    // passes the gate. Rescued images are franchise-level topics -> entity
    // role, never "Who is this character?" clues.
    if (!verified.length) {
      const nt0 = _norm(ctx.title);
      const cands = pool.records
        .filter((r) => r.role !== "entity" && (r.article || r.name))
        .sort((a, b) => ((_norm(b.name || "").includes(nt0) ? 1 : 0) - (_norm(a.name || "").includes(nt0) ? 1 : 0)))
        .slice(0, 5);
      for (const r of cands) {
        const img = await resolveImageBytes(r, { qualifier: ctx.qualifier || ctx.title }).catch(() => null);
        if (img && img.url) {
          r.image_url = img.url;
          r.role = r.role || "entity";
          verified.push(r);
          if (verified.length >= 3) break;
        }
      }
      if (verified.length) console.log(`[Quiz] dead-pool rescue: +${verified.length} img(s) for "${ctx.title}" [${pool.category}]`);
    }
    const recent = _recentKeys(frKey);
    const deep = verified.length >= (ctx.count || 5) * 3; // only skip recency when the pool can afford it
    const fresh = deep ? verified.filter((r) => !recent.map.has(recordKey(r.name))) : verified;
    const use = fresh.length >= (ctx.count || 5) ? fresh : verified;
    s = { pool, order: fyShuffle(use), usedHashes: new Set(), meta: { category: pool.category, total: pool.records.length, verified: verified.length, recencySkipped: deep ? verified.length - fresh.length : 0 } };
    state.set(frKey, s);
  }
  const qualifier = ctx.qualifier || (ctx.slug && wikiEntityImages.W[ctx.slug]?.q) || ctx.title;
  const charVerified = s.pool && s.pool.records ? s.pool.records.filter((r) => r.image_url && r.role !== "entity").length : 0;
  // ENTITY-ART QUESTION (2026-10-01 owner bug report §5): movie/game/tv
  // franchises whose pool is character-poor can still serve a GREAT question
  // from their own artwork: "Which {movie|game|show} is this?" with same-
  // category decoy titles. Tried FIRST when the character pool is thin (<4
  // verified character images), and as the last resort when it exhausts.
  // Entity records are database-anchored (Steam/TMDB/itunes/speedrun) -
  // identity by construction. They are NEVER offered as "Who is this
  // character?" clues (a poster is not a character).
  const _entityQuestion = async (entityRecord) => {
    if (!entityRecord || !entityRecord.image_url) return null;
    if (ctx.usedKeys && (ctx.usedKeys.has(`img:${entityRecord.name}`) || ctx.usedKeys.has(`cr:${frKey}:${recordKey(entityRecord.name)}`))) return null;
    const img = await resolveImageBytes(entityRecord, { qualifier }).catch(() => null);
    if (!img || s.usedHashes.has(img.hash)) return null;
    s.usedHashes.add(img.hash);
    const decoyCat = entityRecord.entityKind === "show" ? "tv" : entityRecord.entityKind;
    let decoyPool = (imgSources.ENTITY_DECOYS[decoyCat] || []).filter((n) => _norm(n) !== _norm(entityRecord.name));
    if (decoyPool.length < 3) {
      // rescued/unknown-kind entities (dead-pool rescue): same-pool topic
      // names as decoys so non-media topics can still serve a question
      decoyPool = decoyPool.concat(
        ((s.pool && s.pool.records) || [])
          .map((r) => r.name)
          .filter((n) => n && n !== entityRecord.name && !decoyPool.includes(n))
      );
    }
    const others = fyShuffle(decoyPool).slice(0, 3);
    if (others.length < 3) return null;
    const kindLabel = decoyCat === "game" ? "game"
      : decoyCat === "movie" ? "movie"
      : decoyCat ? "TV show"
      : ({ anime: "anime", manga: "manga", game: "game", movie: "movie", tv: "TV show", cartoon: "cartoon", comic: "comic" }[s.pool.category] || "media");
    const optionsPool = [entityRecord.name, ...others];
    const optOrder = fyShuffle(optionsPool.map((_, i) => i));
    const q = {
      q: `Which ${kindLabel} is this artwork from?`,
      options: optOrder.map((i) => optionsPool[i]),
      correct: optOrder.indexOf(0),
      hideOptions: true,
      difficulty: ctx.difficulty || "easy",
      topic: "Media ID",
      domain: "characters",
      type: "image",
      assetKey: img.url,
      asset: { kind: "image", url: img.url, mime: img.mime, subject: entityRecord.name, source: entityRecord.source, bytesHash: img.hash.slice(0, 16) },
      loreRef: { wiki: null, page: entityRecord.name, section: `entity-art:${entityRecord.source}` },
      _resolver: { source: entityRecord.source, sourceId: entityRecord.source_id, confidence: entityRecord.confidence, category: s.pool.category, method: "entity-art" },
    };
    if (ctx.usedKeys) { ctx.usedKeys.add(`cr:${frKey}:${recordKey(entityRecord.name)}`); ctx.usedKeys.add(`img:${entityRecord.name}`); }
    _recordRecent(frKey, entityRecord);
    console.log(`[Quiz] image Q (entity-art): ${entityRecord.name} via ${entityRecord.source} [${ctx.title}]`);
    return q;
  };
  const _firstEntity = () => s.order.find((r) => r.role === "entity" && r.image_url && !(ctx.usedKeys && (ctx.usedKeys.has(`img:${r.name}`) || ctx.usedKeys.has(`cr:${frKey}:${recordKey(r.name)}`))));
  if (charVerified < 4) {
    const eq = await _entityQuestion(_firstEntity()).catch(() => null);
    if (eq) return eq;
  }
  for (const record of s.order) {
    if (record.role === "entity") continue; // a poster is not a character
    const k = recordKey(record.name);
    if (ctx.usedKeys && (ctx.usedKeys.has(`img:${record.name}`) || ctx.usedKeys.has(`cr:${frKey}:${k}`))) continue;
    const img = await resolveImageBytes(record, { qualifier }).catch(() => null);
    if (!img) continue;
    if (s.usedHashes.has(img.hash)) continue; // same bytes via another URL = same question
    s.usedHashes.add(img.hash);
    // decoys: same-franchise pool names (verified-image names preferred, then
    // metadata-only names) - the subject itself is excluded, and so is any
    // name that CONTAINS the subject's base name ("Hornet" must not decoy a
    // "Hornet (Hollow Knight)" subject - it would be a second correct answer)
    const subjBase = _norm(record.name);
    const nameSafe = (n) => {
      const nn = _norm(n);
      if (!nn || nn === subjBase) return false;
      // prefix-collision only when the shorter side is multi-token
      // ("Hornet" vs "Hornet (Hollow Knight)" already share a recordKey and
      // were merged; "The Knight" vs "Hollow Knight (character)" are distinct)
      if (subjBase.startsWith(nn) && nn.split(" ").length >= 2) return false;
      if (nn.startsWith(subjBase) && subjBase.split(" ").length >= 2) return false;
      return true;
    };
    const verifiedNames = s.order.filter((r) => r.image_url && r.name !== record.name && recordKey(r.name) !== k && nameSafe(r.name)).map((r) => r.name);
    const metaNames = s.pool.records.filter((r) => r.name !== record.name && recordKey(r.name) !== k && nameSafe(r.name)).map((r) => r.name);
    const decoyPool = verifiedNames.length >= 3 ? verifiedNames : [...verifiedNames, ...metaNames.filter((n) => !verifiedNames.includes(n))];
    const others = fyShuffle(decoyPool).slice(0, 3);
    if (others.length < 3) continue;
    const optionsPool = [record.name, ...others];
    const optOrder = fyShuffle(optionsPool.map((_, i) => i));
    const q = {
      q: `Who is this character from ${ctx.title}?`,
      options: optOrder.map((i) => optionsPool[i]),
      correct: optOrder.indexOf(0),
      hideOptions: true, // OWNER SPEC §7: the picture IS the question
      difficulty: ctx.difficulty || "easy",
      topic: "Character ID",
      domain: "characters",
      type: "image",
      assetKey: img.url,
      asset: { kind: "image", url: img.url, mime: img.mime, subject: record.name, source: record.source, bytesHash: img.hash.slice(0, 16) },
      loreRef: { wiki: null, page: record.article || record.name, section: `character-resolver:${record.source}` },
      _resolver: { source: record.source, sourceId: record.source_id, confidence: record.confidence, category: s.pool.category, method: record.method || "resolved" },
    };
    if (ctx.usedKeys) { ctx.usedKeys.add(`cr:${frKey}:${k}`); ctx.usedKeys.add(`img:${record.name}`); }
    _recordRecent(frKey, record);
    console.log(`[Quiz] image Q (resolver): ${record.name} via ${record.source}/${record.method} [${ctx.title}]`);
    return q;
  }
  // character pool exhausted -> entity artwork as the last resort
  const eqLate = await _entityQuestion(_firstEntity()).catch(() => null);
  if (eqLate) return eqLate;
  return null;
}

function stats() {
  let pools = 0;
  try { pools = fs.existsSync(POOLS_DIR) ? fs.readdirSync(POOLS_DIR).length : 0; } catch { /* noop */ }
  return { poolsOnDisk: pools, ...wikiEntityImages.stats() };
}

module.exports = {
  setDeps, fyShuffle, detectCategory, buildPool, pickImageQuestion,
  resolveImageBytes, wikidataImageForArticle, stats,
  _internal: { anilistPool, jikanPool, tvmazePool, tmdbPool, igdbPool, wikipediaPool, _mergeRecords, _rankNames, rec, recordKey },
};
