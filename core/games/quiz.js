// ============================================
// QUIZ GAME - LORE EDITION (.j quiz)  [2026-09-26 audit rework]
// ============================================
// Fandom/MediaWiki lore RAG pipeline (2026-09-25) retained; this pass adds
// the audit fixes:
//   P1  one attempt per player per question (.j a/b/c/d kept, scoped parser)
//   P2  timer = config value (quizmod), default 15s
//   P3  atomic per-group lifecycle lock - two quizzes can never interleave,
//       lock releases on every exit path (success/failure/timeout/restart)
//   P4  quiz answers exempt from the engine's global cooldown (engine side)
//   P5  generation runs in BACKGROUND with a loading message - the 45s
//       generic command timeout can no longer kill long generation
//   P6  categories ride the QuizConfig object through the whole pipeline;
//       fallback questions are domain-aware (no more VA/studio drift)
//   P7  quizzes up to 50 questions; 40+ split into named sections
//   P8  image questions via -images N (image IS the clue, verified asset)
//   P9  quiz intro card carries the franchise's verified main image
//   P10 voice-actor questions hard-capped (QuizConfig.voiceActorQuestionLimit)
//   P11 theme-song audio reuses goService.getAudioInfo (the .j audio infra)
//       + ffmpeg 30s clip; missing audio skips gracefully
//   P12 media-contamination validation (franchise relevance + fact check)
//   P13/14 image/audio question validation before banking
//   P15 stable-identity dedup + validated bank reuse (quizBank.js)
//   P16 centralized QuizConfig (quizConfig.js) at every stage
//   P19 streaming sections: next section generates while current plays
//       (states GENERATING/READY/ACTIVE/COMPLETED/FAILED, one job/section)
//   P21 speed: bank reuse first, cached wiki calls, parallel media fetch
//   P22 media-type detection + Wikipedia/TVMaze sources (quizLore.js)
// Sessions, answers, rewards, dedup and the per-chat leaderboard remain.
// ============================================

const axios = require("axios");
const crypto = require("crypto");
const { execFile } = require("child_process");
const botConfig = require("../../botConfig");
const economy = require("../rpg/economy");
const system = require("../utils/system");
const quizLore = require("./quizLore");
const quizConfigMod = require("./quizConfig"); // P16 central config + quizmod
const quizBank = require("./quizBank");        // P15 stable-identity bank

// ── state ──
const activeQuizzes = new Map(); // chatId -> session (one live quiz per chat)
const pendingPicks = new Map();  // chatId -> { choices, ts, opts }

// P3: lifecycle lock. chatId -> { state: "generating"|"active", since }.
// "generating" is acquired SYNCHRONOUSLY on .j quiz (before any await) so
// two simultaneous commands cannot both pass the check, and released in a
// finally block on every exit path. "active" mirrors an existing session.
const lifecycle = new Map();
const GENERATING_LOCK_TTL_MS = 8 * 60 * 1000; // crashed generation can't lock forever

// ── constants ──
const NEXT_DELAY_MS = 4500;
const PICK_TTL_MS = 5 * 60 * 1000;
const POINTS = { easy: 50, medium: 100, hard: 150 };
const WINNER_BONUS = 250;
const LETTERS = ["A", "B", "C", "D"];
const SECTION_STATES = { PENDING: "PENDING", GENERATING: "GENERATING", READY: "READY", ACTIVE: "ACTIVE", COMPLETED: "COMPLETED", FAILED: "FAILED" };
const GEN_REASSURE_MS = 25000; // "still working..." nudge while generating
const SECTION_WAIT_CAP_MS = 120000; // never wait longer for a section to be ready

// P7 long-quiz section templates (audit example structure). A section plan
// picks from these based on what the franchise actually has data for.
const LONG_SECTION_TEMPLATES = [
  { name: "Story / Plot", domain: "plot" },
  { name: "Character Lore", domain: "characters" },
  { name: "World & Cosmology", domain: "cosmology" },
  { name: "Character Identification", domain: "images" },
  { name: "Production / General", domain: "production" },
  { name: "Mixed Challenge", domain: "mixed" },
];

// P11/P19 random mode: diverse curated pool (anime/game/comic/cartoon/movie).
// Each random SECTION draws one franchise from here (validated before use).
const RANDOM_POOL = [
  "rezero", "naruto", "onepiece", "attackontitan", "jujutsu-kaisen", "dragonball",
  "fma", "deathnote", "onepunchman", "kimetsu-no-yaiba", "hunterxhunter", "bleach",
  "eldenring", "darksouls", "zelda", "minecraft", "witcher", "godofwar",
  "batman", "marvel", "dc", "ben10", "avatar", "starwars", "harrypotter", "lotr",
];
// display names for option lists (theme-song "which anime is this from?")
const RANDOM_TITLES = {
  rezero: "Re:Zero", naruto: "Naruto", onepiece: "One Piece", attackontitan: "Attack on Titan",
  "jujutsu-kaisen": "Jujutsu Kaisen", dragonball: "Dragon Ball", fma: "Fullmetal Alchemist",
  deathnote: "Death Note", onepunchman: "One Punch Man", "kimetsu-no-yaiba": "Demon Slayer",
  hunterxhunter: "Hunter x Hunter", bleach: "Bleach", eldenring: "Elden Ring",
  darksouls: "Dark Souls", zelda: "The Legend of Zelda", minecraft: "Minecraft",
  witcher: "The Witcher", godofwar: "God of War", batman: "Batman", marvel: "Marvel",
  dc: "DC Comics", ben10: "Ben 10", avatar: "Avatar: The Last Airbender",
  starwars: "Star Wars", harrypotter: "Harry Potter", lotr: "Lord of the Rings",
};

// injected shared infra (P11): engine calls quizGame.setDeps once at boot
const deps = { goService: null, ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg" };
function setDeps(d) { Object.assign(deps, d || {}); }

// BOT_MARKER comes from the engine as a zero-width prefix; keep a module
// constant instead of importing engine (avoid circular require).
const MARKER = "\u200B";
function BOT_SAFE(text) { return MARKER + text; }

// ════════════════════════════════════════════
// ANIME DATA (AniList GraphQL primary, Jikan v4 fallback)
// family:4 everywhere - this box resolves AAAA first and Node aborts the
// IPv4 attempt at 250ms while some hosts need ~280ms (see research notes).
// ════════════════════════════════════════════

const ANILIST_SEARCH_Q = `
query ($search: String, $limit: Int) {
  Page(page: 1, perPage: $limit) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id idMal
      title { romaji english native }
      synonyms
      episodes averageScore popularity seasonYear
      format
      genres
      studios(isMain: true) { nodes { name } }
      description(asHtml: false)
    }
  }
}`;

const ANILIST_CHARS_Q = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    characters(perPage: 10, sort: [ROLE, FAVOURITES_DESC]) {
      edges { role node { name { full } favourites } voiceActors(language: JAPANESE) { name { full } } }
    }
  }
}`;

const _http = axios.create({ timeout: 15000, family: 4, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" } });

function _cleanDesc(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/\(Source:.*?\)/g, "")
    .trim();
}

async function anilistSearch(q) {
  const r = await _http.post("https://graphql.anilist.co", {
    query: ANILIST_SEARCH_Q,
    variables: { search: q, limit: 6 },
  });
  const media = (r.data?.data?.Page?.media || []).filter((m) => m && m.title);
  // Re-rank: SEARCH_MATCH sometimes surfaces unreleased/obscure entries first.
  // Canonical = strong popularity + released + TV/MOVIE + title-ish match.
  const needle = q.toLowerCase().replace(/[^a-z0-9]/g, "");
  const titleNames = (m) =>
    [m.title.romaji, m.title.english, m.title.native, ...(m.synonyms || [])]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, ""));
  const score = (m) => {
    let s = Math.log10(Math.max(m.popularity || 0, 10)) * 30;
    if (m.format === "TV") s += 25;
    else if (m.format === "MOVIE") s += 15;
    else if (m.format === "TV_SHORT" || m.format === "OVA" || m.format === "SPECIAL") s -= 20;
    if (m.averageScore) s += m.averageScore / 4;
    if (m.seasonYear && m.seasonYear <= new Date().getFullYear()) s += 10;
    const names = titleNames(m);
    if (names.some((n) => n === needle)) s += 200;
    else if (needle.length >= 4 && names.some((n) => n.includes(needle))) s += 60;
    return s;
  };
  const ranked = [...media].sort((a, b) => score(b) - score(a));
  return ranked.map((m) => ({
    source: "anilist",
    id: m.id,
    idMal: m.idMal || null,
    title: m.title.english || m.title.romaji,
    titleRomaji: m.title.romaji,
    titleNative: m.title.native,
    synonyms: (m.synonyms || []).slice(0, 8),
    type: m.format || "TV",
    episodes: m.episodes || null,
    score: m.averageScore ? m.averageScore / 10 : null,
    year: m.seasonYear || null,
    popularity: m.popularity || 0,
    studio: (m.studios?.nodes || []).map((s) => s.name)[0] || null,
    genres: (m.genres || []).slice(0, 6),
    synopsis: _cleanDesc(m.description).slice(0, 700),
  }));
}

async function anilistCharacters(id) {
  const r = await _http.post("https://graphql.anilist.co", {
    query: ANILIST_CHARS_Q,
    variables: { id },
  });
  const edges = r.data?.data?.Media?.characters?.edges || [];
  return edges
    .map((e) => ({
      name: e.node?.name?.full || "Unknown",
      role: e.role === "MAIN" ? "main" : "supporting",
      favourites: e.node?.favourites || 0,
      va: e.voiceActors && e.voiceActors[0] ? e.voiceActors[0].name?.full || null : null,
    }))
    .filter((c) => c.name !== "Unknown");
}

async function jikanSearch(q) {
  const r = await _http.get("https://api.jikan.moe/v4/anime", {
    params: { q, limit: 6, order_by: "members", sort: "desc" },
  });
  return (r.data?.data || []).map((m) => ({
    source: "jikan",
    id: m.mal_id,
    idMal: m.mal_id,
    title: m.title_english || m.title,
    titleRomaji: m.title,
    titleNative: m.title_japanese,
    synonyms: (m.synonyms || []).slice(0, 8),
    type: m.type || "TV",
    episodes: m.episodes || null,
    score: m.score || null,
    year: m.year || (m.aired?.prop?.from?.year) || null,
    popularity: m.members || 0,
    studio: (m.studios || []).map((s) => s.name)[0] || null,
    genres: (m.genres || []).map((g) => g.name).slice(0, 6),
    synopsis: _cleanDesc(m.synopsis).slice(0, 700),
  }));
}

async function jikanCharacters(idMal) {
  const r = await _http.get(`https://api.jikan.moe/v4/anime/${idMal}/characters`);
  return (r.data?.data || [])
    .sort((a, b) => (b.favorites || 0) - (a.favorites || 0))
    .slice(0, 10)
    .map((c) => ({
      name: c.character?.name || "Unknown",
      role: c.role === "Main" ? "main" : "supporting",
      favourites: c.favorites || 0,
      va: c.voices && c.voices[0] ? c.voices[0].person?.name || null : null,
    }))
    .filter((c) => c.name !== "Unknown");
}

// Resolve a user-typed title to one anime. Returns {anime, candidates} or {error}.
async function resolveAnime(query) {
  let list = [];
  try {
    list = await anilistSearch(query);
  } catch (e1) {
    try {
      list = await jikanSearch(query);
    } catch (e2) {
      return { error: `Both anime databases are unreachable right now (AniList: ${(e1.code || e1.response?.status || "error")}, Jikan: ${(e2.code || e2.response?.status || "error")}). Try again in a moment.` };
    }
  }
  if (!list.length) return { error: `No anime found for "${query}". Check the spelling, or try the romaji title.`, candidates: [] };
  return { anime: list[0], candidates: list.slice(0, 5) };
}

async function fetchCharacters(anime) {
  try {
    if (anime.source === "anilist") {
      const chars = await anilistCharacters(anime.id);
      if (chars.length) return chars;
      if (anime.idMal) return await jikanCharacters(anime.idMal);
      return [];
    }
    return await jikanCharacters(anime.idMal || anime.id);
  } catch {
    return []; // characters are optional - fact questions still work
  }
}

// ════════════════════════════════════════════
// QUESTION GENERATION (shared helpers)
// ════════════════════════════════════════════

function qhash(stem) {
  return crypto.createHash("sha1").update(String(stem).toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
}

// Extract the first complete JSON object from a possibly messy LLM reply
function extractJsonObject(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* keep going */ }
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* fall through */ }
  }
  let t = s.slice(start);
  if (inStr) t += '"';
  const opens = (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
  t += (inStr ? '"' : "") + "}".repeat(Math.max(opens, 0));
  try { return JSON.parse(t); } catch { return null; }
}

// Coerce raw AI questions into strict shape; returns [] when nothing usable.
function coerceQuestions(raw, difficulty) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.questions) ? raw.questions : [];
  const out = [];
  const seenStems = new Set();
  for (const q of arr) {
    if (!q || typeof q !== "object") continue;
    const stem = String(q.q || q.question || "").trim();
    if (stem.length < 12 || stem.length > 320) continue;
    const key = qhash(stem);
    if (seenStems.has(key)) continue;
    seenStems.add(key);
    let options = Array.isArray(q.options) ? q.options.map((o) => String(o || "").trim()).filter(Boolean) : [];
    options = [...new Set(options)].slice(0, 4);
    if (options.length !== 4) continue;
    if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue;
    let ans = String(q.answer ?? q.correct ?? "").trim().toUpperCase();
    let idx = LETTERS.includes(ans) ? LETTERS.indexOf(ans) : parseInt(ans, 10) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) idx = -1;
    if (idx < 0) continue;
    out.push({
      q: stem,
      options,
      correct: idx,
      difficulty,
      topic: String(q.topic || q.category || "Anime").trim().slice(0, 24) || "Anime",
      domain: q.domain || null,
      type: q.type || "text",
    });
  }
  return out;
}

// ── P6: DOMAIN-AWARE deterministic fallback ──
// The old generator was VA/studio/episode-heavy, which is exactly the
// "category drift" the audit caught: every failed lore retrieval got topped
// up with production trivia. Now each candidate question carries its domain
// and the caller only accepts domains that belong in THIS quiz (weighted mix
// or forced section). VA/studio items only exist under the production
// domain and can never exceed the configured cap (P10).
function buildFallbackQuestions(anime, characters, difficulty, count) {
  const qs = [];
  const wrong = (pool, correct, n) => {
    const poolUniq = [...new Set(pool.filter((x) => x && String(x).toLowerCase() !== String(correct).toLowerCase()))];
    const shuffled = poolUniq.sort(() => Math.random() - 0.5).slice(0, n);
    return shuffled;
  };
  const push = (stem, correct, distractors, topic, domain) => {
    if (!correct || distractors.length < 3) return;
    const options = [String(correct), ...distractors.map(String)];
    const order = options.map((_, i) => i).sort(() => Math.random() - 0.5);
    qs.push({
      q: stem,
      options: order.map((i) => options[i]),
      correct: order.indexOf(0),
      difficulty,
      topic,
      domain: domain || "plot",
      type: "text",
      fallback: true,
    });
  };

  const franchise = anime?.title || "this series";
  if (characters.length >= 4) {
    // CHARACTER domain (lore-shape: who is in the cast - never VA)
    const names = characters.map((c) => c.name);
    for (const c of characters.slice(0, 4)) {
      push(
        `Which of these characters appears in ${franchise}?`,
        c.name,
        wrong(["Askeladd", "Mikasa Ackerman", "Light Yagami", "Rintarou Okabe", "Saitama", "Tanjiro Kamado", "L Lawliet", "Violet Evergarden", "Gon Freecss", "Erza Scarlet"], c.name, 3),
        "Characters",
        "characters",
      );
    }
    // per-character role questions - unique stems, ground-truth answers, and
    // they rebuild the fallback pool depth the VA cap removed (P10)
    for (const c of characters.slice(0, 3)) {
      push(
        `In ${franchise}, ${c.name} is best described as…`,
        c.role === "main" ? "a main character" : "a supporting character",
        wrong(["a main character", "a supporting character", "a villain who never appears on screen", "a narrator only"], c.role === "main" ? "a main character" : "a supporting character", 3),
        "Characters",
        "characters",
      );
    }
    const mains = characters.filter((c) => c.role === "main");
    if (mains.length) {
      push(
        `Who is a MAIN character in ${franchise}?`,
        mains[0].name,
        wrong(names.filter((n) => n !== mains[0].name), mains[0].name, 3),
        "Characters",
        "characters",
      );
    }
    // PRODUCTION domain only (respect the VA cap at build time; the plan
    // filters production down to the configured cap anyway)
    const withVA = characters.filter((c) => c.va);
    if (withVA.length) {
      push(
        `In ${franchise}, who voices ${withVA[0].name}?`,
        withVA[0].va,
        wrong(withVA.filter((x) => x.name !== withVA[0].name).map((x) => x.va), withVA[0].va, 3),
        "Voice actors",
        "production",
      );
    }
  }
  if (anime?.studio) {
    push(
      `Which studio animated ${franchise}?`,
      anime.studio,
      wrong(["Studio Ghibli", "MAPPA", "Ufotable", "Kyoto Animation", "Madhouse", "Wit Studio", "Toei Animation", "A-1 Pictures", "Shaft", "Production I.G"], anime.studio, 3),
      "Studios",
      "production",
    );
  }
  if (anime?.episodes) {
    push(
      `How many episodes does ${franchise} have?`,
      String(anime.episodes),
      wrong([String(anime.episodes + 12), String(Math.max(1, anime.episodes - 13)), String(anime.episodes + 24), String(Math.max(1, anime.episodes - 5)), String(anime.episodes + 1)], String(anime.episodes), 3),
      "Facts",
      "production",
    );
  }
  if (anime?.year) {
    push(
      `What year did ${franchise} premiere?`,
      String(anime.year),
      wrong([String(anime.year + 1), String(anime.year - 1), String(anime.year + 3), String(anime.year - 4)], String(anime.year), 3),
      "Facts",
      "production",
    );
  }
  if (anime?.genres && anime.genres.length) {
    push(
      `Which of these is a genre of ${franchise}?`,
      anime.genres[0],
      wrong(["Mecha", "Sports", "Psychological", "Isekai", "Slice of Life", "Music", "Horror", "Romance"], anime.genres[0], 3),
      "Genres",
      "production",
    );
  }
  // P10 (structural): the production domain is HARD-CAPPED at ONE question
  // whenever lore questions exist - metadata fallbacks must never out-produce
  // lore. Exception: an anime with NO character data has nothing but metadata
  // (wiki-less metadata-only quiz) - the cap would leave it unplayable.
  const production = qs.filter((q) => q.domain === "production");
  const loreOnly = qs.filter((q) => q.domain !== "production");
  const prodCap = loreOnly.length > 0 ? 1 : count;
  const keptProduction = production.sort(() => Math.random() - 0.5).slice(0, prodCap);
  const finalQs = [...loreOnly, ...keptProduction];
  // dedupe by stem, cap at count
  const seen = new Set();
  return finalQs.filter((q) => {
    const k = qhash(q.q);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, count);
}

// ── LLM adapter: engine's smartGroqCall returns the RAW Groq response object
// normalizeSmartGroq accepts a response object, a string, or {content}.
function normalizeSmartGroq(smartGroqCall) {
  if (typeof smartGroqCall !== "function") return null;
  return async (opts) => {
    const r = await smartGroqCall(opts);
    return quizLore.normalizeLLMReply(r);
  };
}

// ════════════════════════════════════════════
// P12: MEDIA-CONTAMINATION / FACT VALIDATION
// "Valid JSON from the AI is not itself validation." Every generated question
// must pass ALL of these before it can enter a quiz or the bank:
//   1. schema (done by coerceOne upstream)
//   2. FACT CHECK - the correct answer must be supported by the retrieved
//      source text (normalized containment). Hallucinated answers die here.
//   3. MEDIA RELEVANCE - the stem must reference THIS franchise (its title,
//      its wiki page, one of its characters/places) - or be a structural
//      media question (image/audio clue).
//   4. FOREIGN-FRANCHISE blocklist - stems mentioning another known franchise
//      from the cross-contamination list are rejected.
//   5. NUMBER GUARD - "how many chapters/volumes/episodes" questions need the
//      number present in the source (kills the "Sword Demon Love Song
//      chapter count" class of hallucination).
function _normText(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// number words -> digits so "a hundred years" and "100 years" match
const _NUMWORDS = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", dozen: "12", twenty: "20", thirty: "30", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90", hundred: "100", thousand: "1000", million: "1000000" };
function _numNormTokens(s) {
  return _normText(s).split(" ").map((w) => _NUMWORDS[w] || w);
}

// franchises that must never leak into each other (stem-level check)
const FOREIGN_MEDIA_BLOCKLIST = [
  "one piece", "naruto", "bleach", "attack on titan", "demon slayer", "jujutsu kaisen",
  "dragon ball", "my hero academia", "sword art online", "re zero", "rezero",
  "fullmetal alchemist", "death note", "hunter x hunter", "one punch man",
  "tokyo ghoul", "code geass", "steins gate", "berserk", "vinland saga",
  "pokemon", "digimon", "yu gi oh", "fairy tail", "black clover", "dr stone",
  "elden ring", "dark souls", "sekiro", "bloodborne", "zelda", "minecraft",
  "batman", "superman", "spider man", "ben 10", "avatar", "star wars",
  "harry potter", "lord of the rings", "witcher", "genshin", "solo leveling",
  "chainsaw man", "spy x family", "dandadan", "kaiju no 8", "mushoku tensei",
  "sword demon love song", "love song",
];

function validateGeneratedQuestion(q, ctx) {
  // ctx: { franchiseTitle, wiki, loreText, domain, mediaType, structural }
  if (!q || !Array.isArray(q.options)) return "malformed";
  const stemL = _normText(q.q);
  const correctText = _normText(q.options[q.correct]);

  // 2. fact check against the source that produced the question
  //    (skipped for structural media questions - their source is the
  //    verified image/audio asset itself, validated in its own pipeline)
  //    Pass = full-phrase containment OR every content token of the answer
  //    exists in the source (number-word normalized, order-free) - tolerant
  //    to paraphrase ("a hundred years" vs "100 years"), still source-bound.
  if (!ctx.structural && ctx.loreText && correctText.length >= 3) {
    const loreN = _normText(ctx.loreText);
    const supported = loreN.includes(correctText);
    if (!supported) {
      const loreToks = new Set(_numNormTokens(ctx.loreText));
      const ansToks = _numNormTokens(q.options[q.correct]).filter((t) => t.length >= 2 || /^\d+$/.test(t));
      const missing = ansToks.filter((t) => !loreToks.has(t));
      if (missing.length) {
        return `fact-check: answer not supported by source (missing: ${missing.slice(0, 3).join(", ")})`;
      }
    }
  }

  // 4. foreign-franchise leakage (skip for structural media questions whose
  // OPTIONS are intentionally other titles, e.g. "which anime is this OP from")
  if (!ctx.structural) {
    const hit = FOREIGN_MEDIA_BLOCKLIST.find((f) => stemL.includes(_normText(f)));
    const ownL = _normText(ctx.franchiseTitle || "");
    const ownHit = ownL && (stemL.includes(ownL.split(" ")[0]) && ownL.split(" ")[0].length >= 4);
    if (hit && !ownHit && !stemL.includes(ownL)) {
      return `contamination: stem references "${hit}"`;
    }
  }

  // 3. media relevance: the stem must anchor to THIS franchise somehow -
  // franchise title, the wiki subject it came from, or ANY content word
  // shared with the retrieved lore (the lore itself is franchise-sourced,
  // so stem↔lore overlap proves on-topic generation, not a memory dump)
  if (!ctx.structural && ctx.franchiseTitle) {
    const loreN = ctx.loreText ? _normText(ctx.loreText) : "";
    const loreWords = new Set(loreN.split(" ").filter((w) => w.length >= 5));
    const stemWords = stemL.split(" ").filter((w) => w.length >= 5);
    const ownTokens = _normText(ctx.franchiseTitle).split(" ").filter((t) => t.length >= 4);
    const subjectTokens = (ctx.subjectNames || []).flatMap((n) => _normText(n).split(" ")).filter((t) => t.length >= 4);
    const anchored =
      stemWords.some((w) => loreWords.has(w)) ||
      ownTokens.some((t) => stemL.includes(t)) ||
      subjectTokens.some((t) => stemL.includes(t));
    if ((loreWords.size || ownTokens.length || subjectTokens.length) && !anchored) {
      return "relevance: stem does not reference the selected media";
    }
  }

  // 5. number guard for adaptation-count questions
  if (/\bhow many\b/.test(stemL) && /\b(chapters?|volumes?|episodes?|seasons?)\b/.test(stemL) && ctx.loreText) {
    const m = q.q.match(/\b(\d{1,4})\b/g);
    const loreN = _normText(ctx.loreText);
    const supported = (m || []).some((num) => loreN.includes(num));
    if (!supported) return "number-guard: count not present in source";
  }

  return null; // passed
}

// ════════════════════════════════════════════
// LORE QUESTION PIPELINE (per-section worker)
// plan domain -> [bank reuse first] -> retrieve Fandom section -> RAG (Groq)
// -> strict JSON -> P12 validation -> bank store. Media attaches at post
// time for structural image/audio questions only.
// ════════════════════════════════════════════

async function generateLoreQuestions(wiki, franchiseTitle, difficulty, count, sectionOverride, animeCharacters, callLLM, opts = {}) {
  const vaCap = Number.isInteger(opts.vaCap) ? opts.vaCap : 1; // P10 hard cap
  const plan = quizLore.buildQuestionPlan(count, difficulty, sectionOverride);
  // P10: enforce the voice-actor/production cap across the whole batch
  let productionLeft = vaCap;
  const adjustedPlan = plan.map((d) => {
    if (d === "production") {
      if (productionLeft > 0) { productionLeft--; return d; }
      return "plot"; // production over cap -> reassign to plot lore
    }
    return d;
  });

  // P21: callers (section workers) share their session-level usedKeys so
  // later sections never re-research the same lore or replay a question
  const usedKeys = opts.usedKeys || new Set();
  let buckets = null;
  if (adjustedPlan.includes("characters")) {
    try { buckets = await quizLore.buildCharacterIndex(wiki, franchiseTitle, animeCharacters || []); } catch { buckets = null; }
  }
  const questions = [];
  for (let i = 0; i < adjustedPlan.length; i++) {
    const domain = adjustedPlan[i];
    let generated = null;
    let lastReject = null; // fed back into the retry prompt (source-grounding nudge)
    for (let attempt = 0; attempt < 4 && !generated; attempt++) {
      let lore = null;
      try {
        if (domain === "characters") {
          const charPage = buckets ? quizLore.pickCharacterPage(buckets, difficulty) : null;
          lore = await quizLore.retrieveCharacterLore(wiki, charPage, difficulty, usedKeys);
          if (!lore && charPage) lore = await quizLore.retrieveLore(wiki, charPage, "characters", difficulty, usedKeys);
        } else if (domain === "cosmology" || domain === "powerscaling") {
          lore = await quizLore.retrieveCosmologyLore(wiki, franchiseTitle, difficulty, usedKeys, domain);
          if (!lore) lore = await quizLore.retrieveLore(wiki, franchiseTitle, domain, difficulty, usedKeys);
        } else {
          lore = await quizLore.retrieveLore(wiki, franchiseTitle, domain, difficulty, usedKeys);
        }
      } catch (e) {
        console.log("[Quiz] lore retrieval failed:", e?.message);
        continue;
      }
      if (!lore) continue;
      const out = await quizLore.generateLoreQuestion(callLLM, franchiseTitle, lore, domain, difficulty, lastReject, attempt);
      if (out) {
        // P12 validation before acceptance
        const err = validateGeneratedQuestion(out.question, {
          franchiseTitle, wiki,
          loreText: lore.text || "",
          domain, mediaType: opts.mediaType || "anime",
          subjectNames: [lore.page, lore.section].filter(Boolean),
        });
        if (err) {
          console.log(`[Quiz] Q rejected (${domain}): ${err}`);
          lastReject = err;
          // retire this lore chunk so the retry sources DIFFERENT lore
          // (same-source retries just re-roll the same broken question)
          usedKeys.add(`${wiki}:${lore.page}:${lore.section}`);
          continue;
        }
        const q = out.question;
        q.promptTok = out.promptTok;
        q.loreRef = { wiki, page: lore.page, section: lore.section };
        console.log(`[Quiz] Q${questions.length + 1} ${domain}/${difficulty} ctx=${out.promptTok}tok src=${lore.page}/${lore.section}`);
        generated = q;
      }
    }
    if (generated) questions.push(generated);
  }
  return questions;
}

// ════════════════════════════════════════════
// P8/P13: IMAGE QUESTIONS (character identification)
// The image IS the clue. Asset verification pipeline:
//   intended subject (character from THIS wiki's index) -> page image via
//   pageimages (page-anchored, cannot cross subjects) -> real download with
//   magic-byte verification -> question whose options are characters FROM
//   THE SAME franchise -> stable-identity dedup via the image URL.
// Returns the question with {type:"image", asset:{url,...}} or null.
// Bytes are fetched lazily at post time (bank stores the verified URL).
// ════════════════════════════════════════════

async function buildImageQuestion(wiki, franchiseTitle, charBuckets, usedKeys, difficulty = "easy") {
  if (!wiki || !charBuckets) return null;
  // flatten the popularity buckets (easy=top10% famous ... hard=obscure) and
  // prefer the band matching the quiz difficulty, falling back outwards
  const uniq = [];
  const seen = new Set();
  const push = (name, band) => { if (name && !seen.has(String(name).toLowerCase())) { seen.add(String(name).toLowerCase()); uniq.push({ name, band }); } };
  (charBuckets.easy || []).forEach((n) => push(n, "easy"));
  (charBuckets.medium || []).forEach((n) => push(n, "medium"));
  (charBuckets.hard || []).forEach((n) => push(n, "hard"));
  if (uniq.length < 4) return null;
  const order = difficulty === "hard" ? ["hard", "medium", "easy"] : difficulty === "easy" ? ["easy", "medium", "hard"] : ["medium", "easy", "hard"];
  const bandRank = (band) => order.indexOf(band);
  const candidates = [...uniq].sort((a, b) => (Math.random() - 0.7) + (bandRank(a.band) - bandRank(b.band)) * 0.4).slice(0, 8);
  for (const ch of candidates) {
    const page = ch.name;
    if (usedKeys && usedKeys.has(`img:${page}`)) continue;
    let img = null;
    try { img = await quizLore.getPageImage(wiki, page); } catch { img = null; }
    if (!img || !img.url) continue;
    // P13 verification: download + magic bytes NOW (a URL alone is not proof)
    const dl = await quizLore.downloadMedia(img.url, "image").catch(() => null);
    if (!dl) continue;
    // options: correct + 3 same-franchise names (no cross-franchise options)
    const others = uniq
      .filter((x) => String(x.name).toLowerCase() !== String(ch.name).toLowerCase())
      .sort(() => Math.random() - 0.5).slice(0, 3);
    if (others.length < 3) continue;
    const optionsPool = [ch.name, ...others.map((o) => o.name)];
    const optOrder = optionsPool.map((_, i) => i).sort(() => Math.random() - 0.5);
    const q = {
      q: `Who is this character from ${franchiseTitle}?`,
      options: optOrder.map((i) => optionsPool[i]),
      correct: optOrder.indexOf(0),
      difficulty: ch.band || difficulty || "easy",
      topic: "Character ID",
      domain: "characters",
      type: "image",
      assetKey: img.url,
      asset: { kind: "image", url: img.url, mime: dl.mime, subject: page, bytesHash: crypto.createHash("sha1").update(dl.buf).digest("hex").slice(0, 16) },
      loreRef: { wiki, page, section: "page-image" },
    };
    if (usedKeys) usedKeys.add(`img:${page}`);
    return q;
  }
  return null;
}

// ════════════════════════════════════════════
// P11/P14: THEME-SONG AUDIO QUESTION (reuses .j audio infra)
// Chain: MEDIA -> theme song name (Jikan/MAL) -> goService.getAudioInfo
// (the SAME retrieval .j audio uses) -> verify the hit actually matches the
// song/media -> download -> ffmpeg 30s clip -> verify bytes -> question.
// Any failure returns null and the quiz simply continues without it.
// ════════════════════════════════════════════

function _clipAudioBuffer(buf, ffmpegPath, seconds = 30) {
  return new Promise((resolve) => {
    const tmp = require("os").tmpdir();
    const fs = require("fs");
    const inPath = `${tmp}/qsong_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const outPath = `${inPath}.mp3`;
    try {
      fs.writeFileSync(inPath, buf);
      // re-encode (not -c copy) so every codec lands as a clean mp3
      execFile(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-i", inPath, "-t", String(seconds), "-b:a", "96k", outPath], { timeout: 60000 }, (err) => {
        try {
          if (err) { fs.unlink(inPath, () => {}); return resolve(null); }
          const out = fs.readFileSync(outPath);
          fs.unlink(inPath, () => {});
          fs.unlink(outPath, () => {});
          resolve(out.length > 20 * 1024 ? out : null);
        } catch { resolve(null); }
      });
    } catch { resolve(null); }
  });
}

async function buildThemeSongQuestion(franchise, otherTitles, usedKeys) {
  if (!deps.goService || typeof deps.goService.getAudioInfo !== "function") return null;
  const mediaType = franchise.mediaType || "anime";
  const animeId = franchise.anime?.idMal || franchise.anime?.id;
  let songs = { openings: [], endings: [] };
  try { songs = await quizLore.getThemeSongs(mediaType, animeId); } catch { return null; }
  const pool = [...songs.openings, ...songs.endings].filter((s) => s && s.length >= 3);
  if (!pool.length) return null;
  const song = pool.sort(() => Math.random() - 0.5)[0];
  if (usedKeys && usedKeys.has(`song:${_normText(song)}`)) return null;

  // retrieval through the EXISTING audio infra (P11: no parallel fetch system)
  const info = await deps.goService.getAudioInfo(`${song} ${franchise.title} opening`).catch(() => null);
  if (!info || info.error || !info.audioURL || !info.metadata) return null;
  // P14 verification: the hit must actually belong to this media. A search
  // API hit alone is NOT verification - require title overlap with the song
  // name or the franchise title.
  const metaTitle = _normText(info.metadata.title);
  const songN = _normText(song);
  const franN = _normText(franchise.title || "");
  const overlap = (metaTitle.includes(songN.slice(0, Math.max(6, Math.floor(songN.length * 0.6)))) && songN.length >= 6)
    || (franN.length >= 5 && metaTitle.includes(franN.split(" ")[0]));
  if (!overlap) return null;

  // download + 30s clip + byte verification BEFORE the question is playable
  const dl = await axios.get(info.audioURL, { responseType: "arraybuffer", timeout: 60000, maxContentLength: 20 * 1024 * 1024 }).catch(() => null);
  if (!dl || !dl.data || dl.data.length < 50 * 1024) return null;
  const clip = await _clipAudioBuffer(Buffer.from(dl.data), deps.ffmpegPath, 30);
  if (!clip) return null;

  // options: correct media + 3 other well-known titles (structural question)
  const others = (otherTitles || []).filter((t) => String(t).toLowerCase() !== String(franchise.title).toLowerCase()).sort(() => Math.random() - 0.5).slice(0, 3);
  if (others.length < 3) return null;
  const optionsPool = [franchise.title, ...others];
  const order = optionsPool.map((_, i) => i).sort(() => Math.random() - 0.5);
  if (usedKeys) usedKeys.add(`song:${_normText(song)}`);
  return {
    q: `🔊 Which anime is this opening from?`,
    options: order.map((i) => optionsPool[i]),
    correct: order.indexOf(0),
    difficulty: "easy",
    topic: "Theme Song",
    domain: "production",
    type: "theme",
    assetKey: `song:${_normText(song)}:${_normText(franchise.title)}`,
    asset: { kind: "audio", buf: clip, mime: "audio/mpeg", subject: song },
    song,
    loreRef: { wiki: franchise.wiki || null, page: franchise.title, section: "theme-song" },
  };
}

// ════════════════════════════════════════════
// P3: LIFECYCLE LOCK (atomic, always released)
// acquire is SYNCHRONOUS - the generation-vs-generation race and the
// generation-vs-active-session race both die here. Released on: success,
// generation failure, API failure, AI failure, image failure, DB failure,
// timeout, cancellation, restart (in-memory) - plus a TTL safety net.
// ════════════════════════════════════════════

function acquireLifecycle(chatId) {
  const cur = lifecycle.get(chatId);
  if (cur) {
    // TTL safety net: a 'generating' lock older than the TTL is stale
    // (crashed worker / orphaned promise) - reclaim it.
    if (cur.state === "generating" && Date.now() - cur.since > GENERATING_LOCK_TTL_MS) {
      console.log("[Quiz] stale generating lock reclaimed (TTL)");
    } else {
      return false;
    }
  }
  lifecycle.set(chatId, { state: "generating", since: Date.now() });
  return true;
}

function promoteLifecycle(chatId) {
  const cur = lifecycle.get(chatId);
  if (cur && cur.state === "generating") cur.state = "active";
}

function releaseLifecycle(chatId) {
  lifecycle.delete(chatId);
}

// ════════════════════════════════════════════
// P15: SEEN + BANK GLUE
// ════════════════════════════════════════════

const _seenKey = (animeKey) => `quiz_seen:${animeKey}`;

function loadSeen(animeKey) {
  const v = system.get(_seenKey(animeKey), null);
  return Array.isArray(v) ? v : [];
}

function saveSeen(animeKey, hashes) {
  const merged = [...new Set([...loadSeen(animeKey), ...hashes])];
  while (merged.length > 300) merged.shift();
  system.set(_seenKey(animeKey), merged);
}

function partitionFresh(questions, animeKey) {
  const seen = new Set(loadSeen(animeKey));
  const fresh = [], repeat = [];
  for (const q of questions) (seen.has(qhash(q.q)) ? repeat : fresh).push(q);
  return { fresh, repeat };
}

// ════════════════════════════════════════════
// PERSISTENT SCOREBOARD (unchanged)
// ════════════════════════════════════════════

const _scoreKey = (chatId) => `quiz_scores:${chatId}`;

function loadScores(chatId) {
  if (chatId) return system.get(_scoreKey(chatId), {});
  return system.get(_scoreKey("global"), {});
}

function saveScores(chatId, scores) {
  system.set(_scoreKey(chatId), scores);
}

function recordSessionResults(chatId, entries, winnerJid) {
  const chat = loadScores(chatId) || {};
  for (const e of entries) {
    const cur = chat[e.jid] || { name: e.name, correct: 0, points: 0, games: 0, wins: 0 };
    cur.name = e.name || cur.name;
    cur.correct += e.correct;
    cur.points += e.points;
    cur.games = (cur.games || 0) + 1;
    if (e.jid === winnerJid) cur.wins = (cur.wins || 0) + 1;
    chat[e.jid] = cur;
  }
  saveScores(chatId, chat);
}

function topOf(chatScores, field, n) {
  return Object.entries(chatScores || {})
    .map(([jid, s]) => ({ jid, ...s }))
    .sort((a, b) => (b[field] || 0) - (a[field] || 0))
    .slice(0, n);
}

// ════════════════════════════════════════════
// P7: SECTION PLAN (long quizzes split by available data)
// count <= sectionSize  -> single implicit section (no ceremony)
// count >  sectionSize  -> named sections; specialized sections are only
// included when the franchise actually has data for them (redistribution,
// not filler). The last section is always the Mixed Challenge.
// ════════════════════════════════════════════

function buildSectionPlan(cfg, availability = {}) {
  const count = cfg.questionCount;
  const size = Math.max(3, cfg.sectionSize);
  if (count <= size) {
    return [{ name: null, domain: cfg.categories ? cfg.categories[0] : "mixed", perSection: count }];
  }
  const nSections = Math.ceil(count / size);
  const plan = [];
  const forced = cfg.categories ? cfg.categories[0] : null;
  if (forced) {
    for (let i = 0; i < nSections; i++) plan.push({ name: `${forced[0].toUpperCase()}${forced.slice(1)} Part ${i + 1}`, domain: forced, perSection: 0 });
  } else {
    // ordered candidates filtered by real availability
    const wanted = [];
    if (cfg.imageQuestionCount > 0 && availability.characters) wanted.push("images");
    wanted.push("plot");
    if (availability.characters) wanted.push("characters");
    if (availability.cosmology) wanted.push("cosmology");
    wanted.push("mixed"); // guaranteed fallback slot
    for (let i = 0; i < nSections; i++) {
      const domain = wanted[i % wanted.length];
      const tpl = LONG_SECTION_TEMPLATES.find((t) => t.domain === domain) || LONG_SECTION_TEMPLATES[5];
      plan.push({ name: i === nSections - 1 ? "Mixed Challenge" : tpl.name, domain, perSection: 0 });
    }
    // avoid two identical non-mixed sections back to back when variety exists
    for (let i = 1; i < plan.length - 1; i++) {
      if (plan[i].domain === plan[i - 1].domain && wanted.length > 2) {
        const alt = wanted.find((d) => d !== plan[i].domain && d !== plan[i - 1].domain) || "mixed";
        const tpl = LONG_SECTION_TEMPLATES.find((t) => t.domain === alt) || LONG_SECTION_TEMPLATES[5];
        plan[i] = { name: tpl.name, domain: alt, perSection: 0 };
      }
    }
  }
  // distribute the real count: first sections get full size, last absorbs remainder
  let left = count;
  for (let i = 0; i < plan.length; i++) {
    const give = i === plan.length - 1 ? left : Math.min(size, left - Math.max(0, nSections - i - 1) * 3);
    plan[i].perSection = Math.max(3, give);
    left -= plan[i].perSection;
  }
  return plan;
}

// availability probe (cheap, cached by quizLore's wiki cache):
// characters = the character index resolved; cosmology = a cosmology-ish page exists
async function probeAvailability(wiki, franchiseTitle, animeCharacters) {
  const availability = { characters: false, cosmology: false };
  try {
    const idx = await quizLore.buildCharacterIndex(wiki, franchiseTitle, animeCharacters || []);
    availability.characters = !!(idx && (idx.easy || []).length + (idx.medium || []).length + (idx.hard || []).length >= 4);
  } catch { /* stays false */ }
  try {
    const d = await quizLore.wikiApi(wiki, { action: "query", list: "search", srsearch: "cosmology OR world OR realms OR dimensions", srlimit: 5, srnamespace: 0 });
    availability.cosmology = (d?.query?.search || []).length > 0;
  } catch { /* stays false */ }
  return availability;
}

// ════════════════════════════════════════════
// P19: SECTION GENERATION WORKERS (streaming)
// Exactly ONE generation job per section (session.sectionJobs guard).
// Full pipeline per question: source data -> AI -> schema -> P12 validation
// -> dedup -> media prep where needed -> bank store -> READY.
// ════════════════════════════════════════════

function mediaKeyFor(session) {
  return session.wiki
    ? `wiki:${session.wiki}`
    : `${session.anime?.source || "x"}:${session.anime?.id || session.title}`;
}

// domain mix inside one section (respects forced categories + VA cap)
// (kept for clarity: forced sections are single-domain; mixed uses the
// quizLore weighted plan with the production cap applied by the caller)
function planSectionDomains(section, cfg) {
  const n = section.perSection;
  const forced = cfg.categories;
  if (forced) return Array(n).fill(forced[0]);
  if (section.domain === "images") return Array(n).fill("characters");
  if (section.domain && section.domain !== "mixed") return Array(n).fill(section.domain);
  return quizLore.buildQuestionPlan(n, cfg.difficulty, null);
}

async function generateSectionQuestions(session, section, sock, chatId) {
  const cfg = session.cfg;
  const sectionCount = section.perSection;
  const questions = [];
  const usedKeys = session.usedKeys;

  // lazy character index (built once per session, reused everywhere - P21)
  if (!session.charIndex && session.wiki) {
    try { session.charIndex = await quizLore.buildCharacterIndex(session.wiki, session.title, session.animeCharacters || []); } catch { session.charIndex = null; }
  }

  const mk = mediaKeyFor(session);
  const wantsImages = cfg.imageQuestionCount > 0 && section.domain === "images";
  const needImages = wantsImages ? Math.min(cfg.imageQuestionCount, sectionCount) : 0;
  const needText = sectionCount - needImages;

  // P21: no wiki -> straight to domain-aware metadata fallbacks (no wasted
  // network retries against a nonexistent wiki)
  if (!session.wiki) {
    const fbAll = buildFallbackQuestions(session.anime, session.animeCharacters || [], cfg.difficulty, sectionCount + 6);
    const allowedDomains = cfg.categories ? new Set(cfg.categories) : null;
    let prodBudget = cfg.voiceActorQuestionLimit;
    for (const f of fbAll) {
      if (questions.length >= sectionCount) break;
      if (!allowedDomains || allowedDomains.has(f.domain)) {
        if (f.domain === "production") {
          if (prodBudget <= 0) continue;
          prodBudget--;
        }
        questions.push(f);
      }
    }
    section.state = SECTION_STATES.READY;
    section.questions = questions.slice(0, sectionCount);
    return section.questions;
  }

  if (needImages > 0) {
    let served = 0;
    // bank-served image questions (asset re-verified at post time)
    const banked = quizBank.bankLookup(mk, loadSeen(mk).map((h) => h), needImages, { type: "image" });
    for (const b of banked) { questions.push(b); served++; }
    while (served < needImages) {
      const q = await buildImageQuestion(session.wiki, session.title, session.charIndex, usedKeys, cfg.difficulty).catch(() => null);
      if (!q) break; // no verified images - graceful (text takes over below)
      // P15 dedup: skip if this asset already in bank
      if (quizBank.bankPut(mk, q)) questions.push(q);
      else if (!questions.some((x) => x.assetKey === q.assetKey)) questions.push(q);
      served++;
    }
    // fill any image shortfall with text lore (never fake an image)
    while (questions.length < sectionCount) {
      const extra = await generateLoreQuestions(session.wiki, session.title, cfg.difficulty, sectionCount - questions.length, "characters", session.animeCharacters || [], session.callLLM, { vaCap: 0, mediaType: cfg.mediaType });
      if (!extra.length) break;
      questions.push(...extra.slice(0, sectionCount - questions.length));
    }
    section.state = SECTION_STATES.READY;
    section.questions = questions.slice(0, sectionCount);
    return section.questions;
  }

  // text lore questions (with P12 validation inside generateLoreQuestions)
  let textQs = [];
  try {
    // forced section domain (non-mixed) -> 100% that domain inside the section
    const forcedDomain = cfg.categories ? cfg.categories[0] : (section.domain && section.domain !== "mixed" && section.domain !== "images" ? section.domain : null);
    textQs = await generateLoreQuestions(session.wiki, session.title, cfg.difficulty, needText, forcedDomain, session.animeCharacters || [], session.callLLM, { vaCap: cfg.voiceActorQuestionLimit, mediaType: cfg.mediaType, usedKeys: session.usedKeys });
  } catch (e) {
    console.log("[Quiz] section generation error:", e?.message);
  }
  // P6: keep only domains that belong to this quiz's category mix
  const allowedDomains = cfg.categories ? new Set(cfg.categories) : null;
  const filtered = textQs.filter((q) => !allowedDomains || allowedDomains.has(q.domain) || q.domain === "mixed");
  questions.push(...filtered);

  // audio questions (theme song / voice) when this section should carry them
  if (cfg.audioQuestionCount > 0 && section.canCarryAudio) {
    let audioLeft = cfg.audioQuestionCount;
    if (cfg.themeSongQuestionCount > 0 && session.franchise) {
      const ts = await buildThemeSongQuestion(session.franchise, session.otherTitles, usedKeys).catch(() => null);
      if (ts) { questions.push(ts); audioLeft--; }
    }
    if (audioLeft > 0 && session.charIndex && questions.length) {
      // character voice audio: hunt on one of the section's character subjects
      const subj = questions.find((q) => q.loreRef && q.loreRef.page && q.domain === "characters");
      if (subj) {
        const audio = await quizLore.findAudioForPage(session.wiki, subj.loreRef.page).catch(() => null);
        if (audio && audio.buf) {
          // attach to the EXISTING lore question (audio cue plays, then card)
          subj.type = "audio";
          subj.asset = { kind: "audio", buf: audio.buf, mime: audio.mime, subject: subj.loreRef.page };
        }
      }
    }
  }

  // P6/P10: if the section still falls short and a forced category failed,
  // top up with lore from the ALLOWED domains only (never production filler)
  if (questions.length < sectionCount) {
    const shortfall = sectionCount - questions.length;
    const altDomain = cfg.categories ? cfg.categories[0] : (section.domain && section.domain !== "mixed" ? section.domain : null);
    const fb = buildFallbackQuestions(session.anime, session.animeCharacters || [], cfg.difficulty, shortfall + 4)
      .filter((q) => !allowedDomains || allowedDomains.has(q.domain));
    // production fallback respects the VA cap
    const prodCount = questions.filter((q) => q.domain === "production").length;
    let prodBudget = Math.max(0, cfg.voiceActorQuestionLimit - prodCount);
    for (const f of fb) {
      if (questions.length >= sectionCount) break;
      if (f.domain === "production") {
        if (prodBudget <= 0) continue;
        prodBudget--;
      }
      questions.push(f);
    }
    if (questions.length < sectionCount && session.wiki) {
      const extra = await generateLoreQuestions(session.wiki, session.title, cfg.difficulty, sectionCount - questions.length + 2, altDomain && altDomain !== "mixed" ? altDomain : null, session.animeCharacters || [], session.callLLM, { vaCap: 0, mediaType: cfg.mediaType, usedKeys: session.usedKeys }).catch(() => []);
      questions.push(...extra.slice(0, sectionCount - questions.length));
    }
  }

  section.state = SECTION_STATES.READY;
  section.questions = questions.slice(0, sectionCount);
  // bank every validated text question (P15: reuse before regen next time)
  for (const q of section.questions) {
    if (q && q.q && !q.fromBank) {
      try { quizBank.bankPut(mk, q); } catch { /* non-fatal */ }
    }
  }
  return section.questions;
}

// Kick (exactly once) the background generation for section i
function ensureSectionGenerating(session, i, sock, chatId) {
  const section = session.sections[i];
  if (!section) return null;
  if (session.sectionJobs[i]) return session.sectionJobs[i];
  if (section.state === SECTION_STATES.GENERATING) {
    session.sectionJobs[i] = generateSectionQuestions(session, section, sock, chatId)
      .then((qs) => {
        if (session.cancelled) return qs;
        if (!qs || qs.length < Math.min(3, section.perSection)) {
          section.state = SECTION_STATES.FAILED;
          console.log(`[Quiz] section ${i + 1} FAILED (only ${qs ? qs.length : 0} questions)`);
        } else {
          console.log(`[Quiz] section ${i + 1} READY (${qs.length}q)`);
        }
        return qs;
      })
      .catch((e) => {
        section.state = SECTION_STATES.FAILED;
        console.log(`[Quiz] section ${i + 1} generation crashed:`, e?.message);
        return [];
      });
    return session.sectionJobs[i];
  }
  return null;
}

// ════════════════════════════════════════════
// LIVE SESSION RUNTIME
// ════════════════════════════════════════════

function getSession(chatId) {
  return activeQuizzes.get(chatId) || null;
}

function hasActive(chatId) {
  return activeQuizzes.has(chatId);
}

function formatQuestionCard(session, idx, q) {
  const prefix = botConfig.getPrefix();
  const secs = session.cfg.timePerQuestion;
  const total = session.sections.reduce((a, s) => a + (s.perSection || s.questions.length), 0);
  const section = session.sections[session.activeSection];
  const sectionLabel = session.sections.length > 1 && section && section.name ? `${section.name} • ` : "";
  let s = `🎯 *QUESTION ${session.questionNo}/${total}*  •  ${sectionLabel}${q.topic}  •  ${q.difficulty.toUpperCase()}\n\n`;
  s += `*${q.q}*\n\n`;
  q.options.forEach((o, i) => { s += `${LETTERS[i]}. ${o}\n`; });
  s += `\n⏱ ${secs}s  •  ${POINTS[q.difficulty]} Zeni (+20 speed bonus)  •  one answer each\n`;
  s += `Answer with: \`${prefix} a <letter>\` (or b/c/d)`;
  return s;
}

// resolve a lazy media asset for structural image/audio questions
async function resolveQuestionMedia(session, q) {
  if (!q || !q.type || q.type === "text" || !q.asset) return null;
  // theme-song clips carry live bytes (never banked to disk)
  if (q.asset.buf) return { kind: q.asset.kind === "audio" ? "audio" : "image", buf: q.asset.buf, mime: q.asset.mime };
  if (q.asset.kind === "image" && q.asset.url) {
    const dl = await quizBank.getCachedAsset(q.asset.url, async (u) => {
      const d = await quizLore.downloadMedia(u, "image").catch(() => null);
      return d ? { buf: d.buf, mime: d.mime, kind: "image" } : null;
    }).catch(() => null);
    if (dl) return { kind: "image", buf: dl.buf, mime: dl.mime };
  }
  return null; // missing media -> graceful text fallback (never fake)
}

async function postQuestion(sock, chatId, session) {
  const section = session.sections[session.activeSection];
  const q = section.questions[session.idx];
  if (!q) { await advanceToNextSection(sock, chatId, session); return; }
  session.questionNo += 1;
  session.qStartedAt = Date.now();
  session.qOpenUntil = Date.now() + session.cfg.timePerQuestion * 1000;
  session.answeredBy = new Map(); // P1: fresh attempt map per question
  const card = formatQuestionCard(session, session.idx, q);

  // lazy media resolution (image = clue in caption; audio cue before card)
  if (!q.mediaTried) {
    q.mediaTried = true;
    try { q.media = await resolveQuestionMedia(session, q); } catch { q.media = null; }
  }
  if (q.media && q.media.kind === "image" && q.type === "image") {
    // image IS the clue: question lives in the caption (audit P8)
    await sock.sendMessage(chatId, {
      image: q.media.buf,
      mimetype: q.media.mime,
      caption: BOT_SAFE(card),
    }).catch(async () => {
      // P8: without the image the question is unanswerable - one retry, then
      // SKIP it (never attach an unrelated image, never fake it)
      const retry = await resolveQuestionMedia(session, q).catch(() => null);
      if (retry && retry.buf) {
        q.media = retry;
        await sock.sendMessage(chatId, { image: retry.buf, mimetype: retry.mime, caption: BOT_SAFE(card) }).catch(() => {});
      } else {
        console.log("[Quiz] image asset failed at post time - skipping question");
        session.idx += 1;
        if (session.idx < section.questions.length && session.questionNo < session.cfg.questionCount) {
          return postQuestion(sock, chatId, session);
        }
        section.state = SECTION_STATES.COMPLETED;
        return advanceToNextSection(sock, chatId, session);
      }
    });
  } else {
    if (q.media && q.media.kind === "audio" && (q.type === "audio" || q.type === "theme")) {
      await sock.sendMessage(chatId, {
        audio: q.media.buf,
        mimetype: q.media.mime,
        ptt: false,
      }).catch(() => {}); // clip fails -> card still carries the question
    }
    await sock.sendMessage(chatId, { text: BOT_SAFE(card) }).catch(() => {});
  }
  // P2: deadline timer driven by config; invalidated by session.token
  session.timerId = setTimeout(async () => {
    try {
      const cur = activeQuizzes.get(chatId);
      if (!cur || cur.token !== session.token) return;
      await revealAndAdvance(sock, chatId, session, null, true);
    } catch (e) { console.log("[Quiz] deadline tick failed:", e?.message); }
  }, session.cfg.timePerQuestion * 1000);
}

function formatStandings(session) {
  const entries = [...session.scores.entries()]
    .map(([jid, s]) => ({ jid, ...s }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct);
  if (!entries.length) return "_No one has scored yet._";
  return entries.slice(0, 10).map((e, i) => {
    const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    return `${medal} ${e.name}: ${e.points} Zeni (${e.correct} correct)`;
  }).join("\n");
}

async function safeAddMoney(jid, amount, reason) {
  try { await economy.addMoney(jid, amount, reason); return true; } catch (e) { console.log("[Quiz] addMoney failed:", e?.message); return false; }
}

async function revealAndAdvance(sock, chatId, session, winner, timedOut) {
  if (session.timerId) { clearTimeout(session.timerId); session.timerId = null; }
  const section = session.sections[session.activeSection];
  const q = section.questions[session.idx];
  const correctText = `${LETTERS[q.correct]}. ${q.options[q.correct]}`;
  session.qOpenUntil = 0; // question closed - late answers ignored

  if (winner) {
    const elapsed = (Date.now() - session.qStartedAt) / 1000;
    const pts = POINTS[q.difficulty] + (elapsed <= 10 ? 20 : 0);
    const sc = session.scores.get(winner.jid) || { name: winner.name, points: 0, correct: 0 };
    sc.points += pts;
    sc.correct += 1;
    session.scores.set(winner.jid, sc);
    session.revealed.push({ q: q.q, correct: correctText, winner: winner.name, timedOut: false });
    await sock.sendMessage(chatId, {
      text: BOT_SAFE(`✅ *Correct!* ${winner.name} answered ${LETTERS[q.correct]} (+${pts} Zeni)\nThe answer was: *${correctText}*`),
    }).catch(() => {});
  } else if (timedOut) {
    session.revealed.push({ q: q.q, correct: correctText, winner: null, timedOut: true });
    const tried = session.answeredBy ? session.answeredBy.size : 0;
    await sock.sendMessage(chatId, {
      text: BOT_SAFE(`⏰ *Time's up!*${tried ? ` (${tried} tried)` : ""}\nThe answer was: *${correctText}*`),
    }).catch(() => {});
  }

  // persist seen hashes (dedup across sessions) + idx advance
  const mk = mediaKeyFor(session);
  saveSeen(mk, [qhash(q.q)]);

  session.idx += 1;
  if (session.idx >= section.questions.length) {
    section.state = SECTION_STATES.COMPLETED;
    await advanceToNextSection(sock, chatId, session);
    return;
  }
  session.nextTimerId = setTimeout(async () => {
    try {
      const cur = activeQuizzes.get(chatId);
      if (!cur || cur.token !== session.token) return;
      await postQuestion(sock, chatId, session);
    } catch (e) { console.log("[Quiz] next tick failed:", e?.message); }
  }, NEXT_DELAY_MS);
}

// P19: section transitions - next ready -> start immediately; still
// generating -> short loading message then auto-continue; failed ->
// recover once, else end the quiz gracefully (never restart from scratch).
async function advanceToNextSection(sock, chatId, session) {
  if (session.cancelled) return;
  const nextIdx = session.activeSection + 1;
  if (nextIdx >= session.sections.length) {
    await finishQuiz(sock, chatId, session);
    return;
  }
  const next = session.sections[nextIdx];
  const multiSection = session.sections.length > 1;
  let hadToWait = false; // players already waited on loading - skip the break then

  if (next.state === SECTION_STATES.FAILED) {
    // one recovery attempt
    await sock.sendMessage(chatId, { text: BOT_SAFE(`⚠️ I'm having trouble preparing the next section. Give me a moment...`) }).catch(() => {});
    next.state = SECTION_STATES.GENERATING;
    delete session.sectionJobs[nextIdx];
  }
  if (next.state === SECTION_STATES.GENERATING) {
    hadToWait = true;
    if (multiSection) {
      await sock.sendMessage(chatId, { text: BOT_SAFE(`⏳ Section complete! I'm loading the next section now, please stand by...`) }).catch(() => {});
    }
    const job = ensureSectionGenerating(session, nextIdx, sock, chatId);
    const startWait = Date.now();
    let waited = 0;
    while (job && next.state === SECTION_STATES.GENERATING && waited < SECTION_WAIT_CAP_MS && !session.cancelled) {
      await new Promise((r) => setTimeout(r, 1500));
      waited = Date.now() - startWait;
    }
    if (session.cancelled) return;
    if (next.state !== SECTION_STATES.READY) {
      next.state = SECTION_STATES.FAILED;
      await sock.sendMessage(chatId, { text: BOT_SAFE(`⚠️ The next section couldn't be prepared. Ending the quiz here - thanks for playing!`) }).catch(() => {});
      await finishQuiz(sock, chatId, session);
      return;
    }
  }
  // section break (configurable; skipped when players just waited on loading)
  if (multiSection && !hadToWait && session.cfg.sectionBreakDuration > 0 && next.state === SECTION_STATES.READY) {
    await sock.sendMessage(chatId, { text: BOT_SAFE(`📚 Section break - next section starts in ${session.cfg.sectionBreakDuration}s!` +
      `${next.name ? `\nUp next: *${next.name}*` : ""}`) }).catch(() => {});
    await new Promise((r) => setTimeout(r, session.cfg.sectionBreakDuration * 1000));
    if (session.cancelled) return;
  }
  startSection(sock, chatId, session, nextIdx);
}

function startSection(sock, chatId, session, idx) {
  const section = session.sections[idx];
  session.activeSection = idx;
  section.state = SECTION_STATES.ACTIVE;
  session.idx = 0;
  if (session.sections.length > 1) {
    sock.sendMessage(chatId, { text: BOT_SAFE(`📖 *Section ${idx + 1}/${session.sections.length}${section.name ? `: ${section.name}` : ""}*`) }).catch(() => {});
  }
  // kick the NEXT section's generation while this one plays (P19 buffer)
  if (session.cfg.streamingGeneration) {
    const nIdx = idx + 1;
    if (nIdx < session.sections.length && session.sections[nIdx].state === SECTION_STATES.PENDING) {
      session.sections[nIdx].state = SECTION_STATES.GENERATING;
      ensureSectionGenerating(session, nIdx, sock, chatId);
    }
  }
  postQuestion(sock, chatId, session).catch((e) => console.log("[Quiz] postQuestion failed:", e?.message));
}

async function finishQuiz(sock, chatId, session, opts = {}) {
  activeQuizzes.delete(chatId);
  releaseLifecycle(chatId); // P3: every exit path frees the group
  session.cancelled = true;
  session.token += 1;
  if (session.timerId) clearTimeout(session.timerId);
  if (session.nextTimerId) clearTimeout(session.nextTimerId);
  if (session.reassureTimerId) clearTimeout(session.reassureTimerId);

  const entries = [...session.scores.entries()]
    .map(([jid, s]) => ({ jid, ...s }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct);
  const winner = entries[0] || null;

  let out = `🏁 *QUIZ FINISHED - ${String(session.title || "QUIZ").toUpperCase()}*\n\n`;
  out += formatStandings(session) + "\n\n";
  const totalAnswered = session.revealed.filter((r) => r.winner).length;
  const totalQs = session.sections.reduce((a, s) => a + s.questions.length, 0);
  out += `📊 ${totalAnswered}/${totalQs} questions claimed\n`;
  out += `🎯 Difficulty: ${session.cfg.difficulty.toUpperCase()}\n`;

  for (const e of entries) {
    await safeAddMoney(e.jid, e.points, `Quiz reward (${session.title || "quiz"})`);
  }
  if (winner) {
    await safeAddMoney(winner.jid, WINNER_BONUS, "Quiz winner bonus");
    out += `\n👑 Winner: *${winner.name}* (+${WINNER_BONUS} bonus)\n`;
    out += `💰 All points paid out in Zeni!\n`;
  }
  out += `\nPlay again: \`${botConfig.getPrefix()} quiz "<title>"\``;

  recordSessionResults(chatId, entries, winner ? winner.jid : null);
  await sock.sendMessage(chatId, { text: BOT_SAFE(out) }).catch(() => {});
}

// ════════════════════════════════════════════
// P1: ANSWER HANDLING
// - parser scoped: only fires for the ACTIVE quiz + OPEN question
// - ONE attempt per player per question: the first answer locks (wrong =
//   out for this question); other players answer normally
// - accepts .j a/b/c/d + ".j answer" (engine routes all five here)
// - no answers accepted after the question closes (claim or timer)
// ════════════════════════════════════════════

// shared with the engine cooldown block (P4): is this text a quiz answer?
function isQuizAnswerText(lowerTxt) {
  const pfx = String(botConfig.getPrefix() || ".").toLowerCase();
  const t = String(lowerTxt || "");
  if (t === `${pfx} answer` || t.startsWith(`${pfx} answer `)) return true;
  const first = t.slice(pfx.length).trim().split(/\s+/)[0] || "";
  if (!/^[abcd]$/.test(first)) return false;
  return t === `${pfx} ${first}` || t.startsWith(`${pfx} ${first} `);
}

async function handleAnswer(sock, chatId, senderJid, answerText, botMarker, m, senderName) {
  const session = activeQuizzes.get(chatId);
  if (!session || session.cancelled) return { handled: false }; // no quiz -> let other handlers run
  const section = session.sections[session.activeSection];
  const q = section && section.questions[session.idx];
  if (!q) return { handled: true, silent: true };
  // question must be OPEN (posted and inside its timer window). During the
  // between-questions window (qOpenUntil === 0) answers are ignored - a
  // premature answer must never register against the upcoming question.
  if (!session.qOpenUntil || Date.now() > session.qOpenUntil) return { handled: true, silent: true };
  if (!session.answeredBy) session.answeredBy = new Map();

  const raw = String(answerText || "").trim();
  if (!raw) return { handled: true, silent: true };
  let idx = LETTERS.indexOf(raw.toUpperCase().slice(0, 1));
  if (raw.length > 1 && LETTERS.indexOf(raw.toUpperCase()) < 0) {
    // full option text is accepted too ("Subaru Natsuki")
    idx = q.options.findIndex((o) => o.toLowerCase() === raw.toLowerCase());
  }
  if (idx < 0) {
    await sock.sendMessage(chatId, { react: { text: "🤔", key: m.key } }).catch(() => {});
    return { handled: true, silent: true };
  }

  // P1: one attempt per player - first answer locks, later replies ignored
  if (session.answeredBy.has(senderJid)) {
    return { handled: true, silent: true };
  }
  session.answeredBy.set(senderJid, { letter: idx, correct: idx === q.correct, at: Date.now() });

  if (idx === q.correct) {
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } }).catch(() => {});
    await revealAndAdvance(sock, chatId, session, { jid: senderJid, name: senderName || "Player" }, false);
  } else {
    // wrong first answer = out for this question; others keep playing
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } }).catch(() => {});
  }
  return { handled: true, silent: true };
}

// ════════════════════════════════════════════
// HANDLERS
// ════════════════════════════════════════════

function parseQuizArgs(raw) {
  // Supports:
  //   quiz "Fullmetal Alchemist Brotherhood" 10 hard
  //   quiz fmab 5 easy
  //   quiz "One Piece"
  //   quiz "Dragon Ball" 3 hard -s cosmology
  //   quiz "Re:Zero" 20 hard -images 5
  //   quiz random 20 -images 5 -audio 3
  const out = { title: "", count: 10, difficulty: "medium", section: null, images: null, audio: null, randomMode: false, notes: [] };
  let rest = String(raw || "").trim();
  if (!rest) return out;
  // random mode?
  if (/^random\b/i.test(rest)) {
    out.randomMode = true;
    out.title = "__random__";
    rest = rest.replace(/^random\b/i, "").trim();
  }
  const quoted = rest.match(/"([^"]{2,})"/);
  if (quoted) {
    out.title = out.randomMode ? out.title : quoted[1].trim();
    rest = (rest.slice(0, quoted.index) + " " + rest.slice(quoted.index + quoted[0].length)).trim();
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  const diffTokens = { easy: "easy", e: "easy", medium: "medium", m: "medium", normal: "medium", hard: "hard", h: "hard", insane: "hard" };
  // pop -s/--section <domain>, -images <n>, -audio <n> (may sit anywhere)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    if ((t === "-s" || t === "--section" || t === "--topic") && tokens[i + 1]) {
      const dom = tokens[i + 1].toLowerCase();
      const mapped = quizLore.SECTION_ALIASES[dom];
      if (mapped) out.section = mapped;
      else out.notes.push(`Unknown section "${tokens[i + 1]}" - valid: plot, characters, cosmology, powerscaling, production.`);
      tokens.splice(i, 2);
      i--;
    } else if ((t === "-images" || t === "--images" || t === "-i") && tokens[i + 1]) {
      out.images = tokens[i + 1];
      tokens.splice(i, 2);
      i--;
    } else if ((t === "-audio" || t === "--audio") && tokens[i + 1]) {
      out.audio = tokens[i + 1];
      tokens.splice(i, 2);
      i--;
    }
  }
  // pop trailing difficulty/count tokens
  while (tokens.length) {
    const last = tokens[tokens.length - 1].toLowerCase();
    if (tokens.length && /^\d{1,3}$/.test(last)) {
      const n = parseInt(last, 10);
      if (n < 1) { out.notes.push(`Count must be at least 1 - using 1.`); out.count = 1; }
      else out.count = n; // clamped against cfg.maxQuestions later (P16)
      tokens.pop();
      continue;
    }
    if (tokens.length && diffTokens[last]) {
      out.difficulty = diffTokens[last];
      tokens.pop();
      continue;
    }
    break;
  }
  if (!out.title) {
    out.title = tokens.join(" ").trim();
  } else if (tokens.length && !out.randomMode) {
    out.notes.push(`Ignored extra words after the quoted title: "${tokens.join(" ")}".`);
  }
  if (out.randomMode) out.title = "__random__";
  return out;
}

// resolve a user-typed title to a franchise: Fandom wiki FIRST (lore source),
// AniList for anime display metadata + character popularity.
async function resolveFranchise(query) {
  let wiki = null;
  let wikiValidated = false;
  try { wiki = await quizLore.resolveWiki(query); } catch { wiki = null; }
  if (wiki) {
    try {
      const d = await quizLore.wikiApi(wiki, { action: "query", list: "search", srsearch: query, srlimit: 5, srnamespace: 0 });
      const hits = (d?.query?.search || []).map((h) => h.title);
      const needle = String(query).toLowerCase().replace(/[^a-z0-9]+/g, "");
      const relevant = hits.some((t) => {
        const hay = t.toLowerCase().replace(/[^a-z0-9]+/g, "");
        return hay.includes(needle) || needle.includes(hay) || (needle.length >= 4 && hay.includes(needle.slice(0, 4)));
      });
      wikiValidated = relevant || hits.length > 0;
      if (!relevant && hits.length > 0) {
        const si = await quizLore.wikiApi(wiki, { action: "query", meta: "siteinfo", siprop: "sitename" }).catch(() => null);
        const site = String(si?.query?.sitename || "").toLowerCase();
        wikiValidated = needle.length >= 4 && (site.includes(needle.slice(0, Math.min(needle.length, 12))) || needle.includes(site.replace(/[^a-z0-9]/g, "").slice(0, 6)));
      }
    } catch { wikiValidated = false; }
    if (!wikiValidated) wiki = null;
  }
  if (wiki) {
    return { wiki };
  }
  // no wiki: fall back to the anime pick flow (resolves + disambiguates)
  const res = await resolveAnime(query);
  if (res.error) return res;
  const top = res.anime;
  for (const t of [top.titleRomaji, top.title, ...(top.synonyms || [])]) {
    if (!t) continue;
    const s = await quizLore.resolveWiki(t).catch(() => null);
    if (s) return { wiki: s, anime: top, candidates: res.candidates };
  }
  return { anime: top, candidates: res.candidates, wiki: null };
}

// P9: verified franchise image for the intro card (page-anchored download)
async function getFranchiseIntroImage(wiki, title) {
  if (!wiki) return null;
  try {
    const img = await quizLore.getPageImage(wiki, title);
    if (!img || !img.url) return null;
    const dl = await quizLore.downloadMedia(img.url, "image").catch(() => null);
    if (!dl) return null;
    return { buf: dl.buf, mime: dl.mime, url: img.url };
  } catch { return null; }
}

// P5: startQuiz returns FAST - generation runs in background. The engine's
// 45s generic timeout can never kill a quiz again, and users get an
// immediate "gathering questions" message instead of silence.
async function startQuiz(sock, chatId, senderJid, botMarker, m, rawArgs, senderName, smartGroqCall, MODELS) {
  // P3: atomic lock check - covers live session AND in-flight generation
  const lifecycleNow = lifecycle.get(chatId);
  if (activeQuizzes.has(chatId) || (lifecycleNow && lifecycleNow.state === "generating")) {
    const s = activeQuizzes.get(chatId);
    if (s) {
      return {
        handled: true,
        message: botMarker + `🎯 A quiz is already running here: *${s.title}* (question ${s.questionNo}/${s.sections.reduce((a, x) => a + x.questions.length, 0)}).\nFinish it, or use \`${botConfig.getPrefix()} quiz end\` to cancel.`,
      };
    }
    return {
      handled: true,
      message: botMarker + `⏳ A quiz is already being prepared here - hang on a few seconds! 🎯`,
    };
  }

  const parsed = parseQuizArgs(rawArgs);
  if (!parsed.title) {
    const prefix = botConfig.getPrefix();
    return {
      handled: true,
      message: botMarker + `🎯 *Lore Quiz*

Test your knowledge of a show, game, comic or movie - its story, characters, cosmology and world-building.

Start one:
\`${prefix} quiz "Fullmetal Alchemist Brotherhood"\`
\`${prefix} quiz "One Piece" 5 hard\`
\`${prefix} quiz "Elden Ring" 5 hard -s cosmology\`
\`${prefix} quiz "Re:Zero" 20 hard -images 5\`
\`${prefix} quiz random 20 -images 5 -audio 3\`

Options:
• count: up to 50 questions (default 10) - 40+ quizzes play in named sections
• difficulty: easy / medium / hard (default medium)
• section (optional): \`-s plot\` / \`-s characters\` / \`-s cosmology\` / \`-s powerscaling\` / \`-s production\` forces that topic
• \`-images <n>\` adds n picture questions (character ID)
• \`-audio <n>\` adds n audio questions (theme songs / voices)
• \`random\` mixes random franchises, images and audio

During the quiz, answer with \`${prefix} a <letter>\` (or b/c/d). One answer per player per question!
Leaderboard: \`${prefix} quizboard\` • Cancel: \`${prefix} quiz end\` • Mods: \`${prefix} quizmod\``,
    };
  }

  // P3: acquire BEFORE any await - the two-users-at-once race dies here
  if (!acquireLifecycle(chatId)) {
    return {
      handled: true,
      message: botMarker + `⏳ A quiz is already being prepared here - hang on a few seconds! 🎯`,
    };
  }

  // P5: immediate loading message so nobody thinks the command failed
  await sock.sendMessage(chatId, {
    text: botMarker + `🎯 Gathering questions for your quiz... Please hold on.`,
  }, { quoted: m }).catch(() => {});

  // background launch - never block the command promise (45s timeout bypass)
  launchQuizAsync(sock, chatId, senderJid, botMarker, m, parsed, senderName, smartGroqCall).catch((e) => {
    console.log("[Quiz] launch crashed:", e?.message);
    releaseLifecycle(chatId);
    sock.sendMessage(chatId, { text: botMarker + `❌ Quiz preparation failed unexpectedly. Please try again.` }).catch(() => {});
  });
  return { handled: true, silent: true };
}

async function launchQuizAsync(sock, chatId, senderJid, botMarker, m, parsed, senderName, smartGroqCall) {
  const prefix = botConfig.getPrefix();
  let reassured = false;
  // reassurance if generation runs long (P5: no spam - one nudge)
  const reassureTimerId = setTimeout(() => {
    if (!activeQuizzes.has(chatId) && lifecycle.get(chatId)?.state === "generating") {
      reassured = true;
      sock.sendMessage(chatId, { text: botMarker + `🧠 Still researching the lore for *${parsed.randomMode ? "random mode" : parsed.title}* - good questions take a moment...` }).catch(() => {});
    }
  }, GEN_REASSURE_MS);

  try {
    const cfg = await quizConfigMod.buildQuizConfig(chatId, {
      count: parsed.count,
      difficulty: parsed.difficulty,
      categories: parsed.section ? [parsed.section] : null,
      images: parsed.images,
      audio: parsed.audio,
      randomMode: parsed.randomMode,
      requestedBy: senderJid,
    });

    const callLLM = normalizeSmartGroq(smartGroqCall);
    const franchise = await buildFranchiseContext(sock, chatId, botMarker, m, parsed);
    if (!franchise) {
      clearTimeout(reassureTimerId);
      releaseLifecycle(chatId);
      return; // error already messaged
    }

    cfg.mediaType = franchise.mediaType || cfg.mediaType;
    cfg.imageQuestionCount = Math.max(0, Math.min(cfg.imageQuestionCount, franchise.hasImages ? cfg.imageQuestionCount : 0));
    const totalQuestions = cfg.questionCount;
    await sock.sendMessage(chatId, {
      text: botMarker + `✅ *${franchise.title}*${parsed.section ? `\n📚 Section locked: *${parsed.section}*` : ""}\n🧠 Building ${totalQuestions} ${cfg.difficulty} lore questions…`,
    }, { quoted: m }).catch(() => {});

    const session = {
      cfg,
      title: franchise.title,
      wiki: franchise.wiki,
      anime: franchise.anime,
      franchise,
      mediaType: cfg.mediaType,
      difficulty: cfg.difficulty,
      section: parsed.section || null,
      mode: parsed.randomMode ? "random" : "franchise",
      sections: [],
      sectionJobs: {},
      activeSection: 0,
      idx: 0,
      questionNo: 0,
      scores: new Map(),
      revealed: [],
      answeredBy: new Map(),
      usedKeys: new Set(),
      askedBy: senderJid,
      askedByName: senderName,
      startedAt: Date.now(),
      token: 0,
      cancelled: false,
      timerId: null,
      nextTimerId: null,
      reassureTimerId: null,
      qStartedAt: Date.now(),
      qOpenUntil: 0,
      callLLM,
      animeCharacters: franchise.characters || [],
      charIndex: franchise.charIndex || null,
      otherTitles: franchise.otherTitles || [],
    };

    // P7: section plan from real availability
    const availability = franchise.availability || await probeAvailability(franchise.wiki, franchise.title, franchise.characters || []);
    const plan = buildSectionPlan(cfg, availability);
    session.sections = plan.map((p, i) => ({
      name: p.name,
      domain: p.domain,
      perSection: p.perSection,
      state: SECTION_STATES.PENDING,
      questions: [],
      canCarryAudio: i === 0 || parsed.randomMode, // audio spawns early in the quiz
    }));

    // P19: generate section 1 synchronously in the background worker (this
    // whole function IS the background), then stream the rest during play.
    const first = session.sections[0];
    first.state = SECTION_STATES.GENERATING;
    const job = ensureSectionGenerating(session, 0, sock, chatId);
    await job;

    clearTimeout(reassureTimerId);
    if (session.cancelled) { releaseLifecycle(chatId); return; }

    if (first.state !== SECTION_STATES.READY || first.questions.length < Math.min(3, first.perSection)) {
      // generation failed - release the lock, tell the group, never leave a zombie
      releaseLifecycle(chatId);
      await sock.sendMessage(chatId, {
        text: botMarker + `❌ Could not build a quiz for *${franchise.title}* (not enough lore data found). Try a better-known franchise.`,
      }, { quoted: m }).catch(() => {});
      return;
    }

    // P9: intro card with verified franchise image (graceful without)
    const introImage = await getFranchiseIntroImage(franchise.wiki, franchise.title).catch(() => null);
    const totalQs = session.sections.reduce((a, s) => a + s.questions.length, 0);
    let head = botMarker + `🎯 *QUIZ STARTED - ${String(franchise.title).toUpperCase()}* 🎯\n\n`;
    head += `📚 ${totalQs} questions • ${cfg.difficulty.toUpperCase()} • ${POINTS[cfg.difficulty]} Zeni per correct (+20 speed bonus)\n`;
    if (session.sections.length > 1) head += `📖 ${session.sections.length} sections\n`;
    if (parsed.section) head += `📚 Topic locked: ${parsed.section}\n`;
    head += `✍️ Answer with \`${prefix} a <letter>\` (A/B/C/D) - one answer per player per question\n`;
    head += `⏱ ${cfg.timePerQuestion}s per question\n`;
    head += `🛑 Cancel: \`${prefix} quiz end\`\n\n`;
    head += `Let's go! 🚀`;
    if (introImage) {
      await sock.sendMessage(chatId, { image: introImage.buf, mimetype: introImage.mime, caption: BOT_SAFE(head) }).catch(async () => {
        await sock.sendMessage(chatId, { text: head }).catch(() => {});
      });
    } else {
      await sock.sendMessage(chatId, { text: head }, { quoted: m }).catch(() => {});
    }

    // register + promote - the group is now "active", other .j quiz calls
    // bounce off the session check with a friendly message
    activeQuizzes.set(chatId, session);
    promoteLifecycle(chatId);
    startSection(sock, chatId, session, 0);
  } catch (e) {
    clearTimeout(reassureTimerId);
    releaseLifecycle(chatId);
    console.log("[Quiz] launch failed:", e?.message);
    await sock.sendMessage(chatId, { text: botMarker + `❌ Quiz preparation failed (${String(e?.message || "error").slice(0, 80)}). Please try again.` }).catch(() => {});
  }
}

// resolve the quiz's franchise context (title/wiki/anime/mediaType/characters)
async function buildFranchiseContext(sock, chatId, botMarker, m, parsed) {
  // random mode: draw a random franchise per quiz start (full randomization)
  if (parsed.randomMode) {
    const pool = [...RANDOM_POOL].sort(() => Math.random() - 0.5);
    for (const slug of pool) {
      const wiki = await quizLore.resolveWiki(slug).catch(() => null);
      if (!wiki) continue;
      const titleGuess = slug.replace(/-/g, " ");
      const si = await quizLore.wikiApi(wiki, { action: "query", meta: "siteinfo", siprop: "sitename" }).catch(() => null);
      const site = String(si?.query?.sitename || "").replace(/\s*wiki$/i, "").trim() || titleGuess;
      const mediaDetect = await quizLore.detectMediaType(titleGuess).catch(() => ({ mediaType: "franchise" }));
      const anime = mediaDetect.mediaType === "anime" ? (await resolveAnime(titleGuess).catch(() => ({}))).anime : null;
      const characters = anime ? await fetchCharacters(anime).catch(() => []) : [];
      return {
        title: site, wiki, anime, mediaType: anime ? "anime" : mediaDetect.mediaType,
        characters, charIndex: null,
        otherTitles: RANDOM_POOL.filter((s) => s !== slug).sort(() => Math.random() - 0.5).slice(0, 6).map((s) => RANDOM_TITLES[s] || s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())),
        hasImages: true, availability: null,
      };
    }
    return null;
  }

  const res = await resolveFranchise(parsed.title);
  if (res.error) {
    const friendly = res.error.includes("No anime found")
      ? `Couldn't find a Fandom wiki or anime entry for "${parsed.title}". Check the spelling, or try the franchise's common name.`
      : res.error;
    await sock.sendMessage(chatId, { text: botMarker + `❌ ${friendly}` }).catch(() => {});
    return null;
  }

  // ambiguous anime pick flow (wiki could not resolve directly)
  if (res.candidates && res.candidates.length > 1 && !res.wiki) {
    const top = res.anime;
    const second = res.candidates[1];
    const strongAuto =
      !second ||
      (top.popularity >= 100000 && second.popularity < top.popularity / 3) ||
      (top.synonyms || []).some((s) => s.toLowerCase() === parsed.title.toLowerCase()) ||
      (top.title || "").toLowerCase() === parsed.title.toLowerCase() ||
      (top.titleRomaji || "").toLowerCase() === parsed.title.toLowerCase();
    if (!strongAuto) {
      // store the pick and ask - the user replies ".j quiz pick <n>"
      pendingPicks.set(chatId, { choices: res.candidates, ts: Date.now(), opts: { count: parsed.count, difficulty: parsed.difficulty, section: parsed.section, images: parsed.images, audio: parsed.audio, randomMode: false } });
      let msg = botMarker + `🤔 *"${parsed.title}"* is ambiguous. Which one?\n\n`;
      res.candidates.forEach((c, i) => {
        msg += `*${i + 1}.* ${c.title} (${c.type}${c.year ? `, ${c.year}` : ""}) - ${c.popularity.toLocaleString()} members\n`;
      });
      msg += `\nReply: \`${botConfig.getPrefix()} quiz pick <number>\` (5 min)`;
      releaseLifecycle(chatId); // waiting on the user - don't hold the lock
      await sock.sendMessage(chatId, { text: msg }).catch(() => {});
      return null;
    }
  }

  let anime = res.anime || null;
  let wiki = res.wiki || null;
  let title = anime?.title || parsed.title;
  if (!anime && wiki) {
    try {
      const r2 = await resolveAnime(parsed.title);
      if (r2.anime) { anime = r2.anime; }
    } catch { /* metadata optional */ }
    if (!anime) {
      try {
        const si = await quizLore.wikiApi(wiki, { action: "query", meta: "siteinfo", siprop: "sitename" });
        const site = String(si?.query?.sitename || "").replace(/\s*wiki$/i, "").trim();
        if (site) title = site;
      } catch { /* keep parsed title */ }
    }
  }

  // P22: media type detection ONCE, stored in the config context
  const mediaDetect = await quizLore.detectMediaType(parsed.title).catch(() => ({ mediaType: "franchise" }));
  const mediaType = anime ? "anime" : (mediaDetect.mediaType === "franchise" ? (wiki ? "franchise" : "anime") : mediaDetect.mediaType);

  // anime metadata (character popularity for the bucket index) - optional
  const characters = anime ? await fetchCharacters(anime).catch(() => []) : [];
  const otherTitles = (res.candidates || []).map((c) => c.title).filter(Boolean).slice(0, 5);

  return {
    title, wiki, anime, mediaType, characters, otherTitles,
    charIndex: null, // built lazily by section generation
    hasImages: true, availability: null,
  };
}

async function pickCandidate(sock, chatId, senderJid, botMarker, m, numStr, senderName, smartGroqCall, MODELS) {
  const pending = pendingPicks.get(chatId);
  if (!pending) {
    return { handled: true, message: botMarker + `❌ No pending anime selection. Start a quiz first: \`${botConfig.getPrefix()} quiz "<title>"\`` };
  }
  if (Date.now() - pending.ts > PICK_TTL_MS) {
    pendingPicks.delete(chatId);
    return { handled: true, message: botMarker + `⌛ That selection expired. Start the quiz again.` };
  }
  const n = parseInt(String(numStr || "").trim(), 10);
  if (!Number.isInteger(n) || n < 1 || n > pending.choices.length) {
    return { handled: true, message: botMarker + `❌ Pick a number between 1 and ${pending.choices.length}.` };
  }
  const chosen = pending.choices[n - 1];
  pendingPicks.delete(chatId);
  // P3: pick now follows the same background/locked path as startQuiz
  if (!acquireLifecycle(chatId)) {
    return { handled: true, message: botMarker + `⏳ A quiz is already being prepared here - hang on a few seconds! 🎯` };
  }
  await sock.sendMessage(chatId, { text: botMarker + `🎯 Gathering questions for your quiz... Please hold on.` }, { quoted: m }).catch(() => {});
  const parsed = { title: chosen.title, count: pending.opts.count, difficulty: pending.opts.difficulty, section: pending.opts.section || null, images: pending.opts.images || null, audio: pending.opts.audio || null, randomMode: false, notes: [] };
  // shortcut: we already know the anime - seed the resolution
  launchQuizAsync(sock, chatId, senderJid, botMarker, m, parsed, senderName, smartGroqCall).catch((e) => {
    console.log("[Quiz] pick launch crashed:", e?.message);
    releaseLifecycle(chatId);
  });
  return { handled: true, silent: true };
}

async function endQuiz(sock, chatId, senderJid, botMarker, canUseAdminCommands) {
  const session = activeQuizzes.get(chatId);
  if (!session) {
    // also release a stale "generating" lock so the group is never stuck
    if (lifecycle.has(chatId)) {
      releaseLifecycle(chatId);
      return { handled: true, message: botMarker + `🧹 A quiz was being prepared but got stuck - cleaned up. You can start a new one now.` };
    }
    return { handled: true, message: botMarker + `❌ No quiz running here.` };
  }
  if (session.askedBy !== senderJid && !canUseAdminCommands) {
    return { handled: true, message: botMarker + `🛑 Only the quiz starter or admins can end it early.` };
  }
  session.cancelled = true;
  if (session.nextTimerId) clearTimeout(session.nextTimerId);
  await finishQuiz(sock, chatId, session);
  return { handled: true, silent: true };
}

async function showLeaderboard(sock, chatId, senderJid, botMarker, m) {
  const chat = loadScores(chatId) || {};
  const topPoints = topOf(chat, "points", 10);
  if (!topPoints.length) {
    return { handled: true, message: botMarker + `🏆 No quiz scores here yet! Start one: \`${botConfig.getPrefix()} quiz "<title>"\`` };
  }
  let out = `🏆 *QUIZ LEADERBOARD (this chat)*\n\n`;
  topPoints.forEach((e, i) => {
    const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    out += `${medal} ${e.name || e.jid.slice(0, 12)}: *${e.points} Zeni* • ${e.correct} correct • ${e.games} quizzes${e.wins ? ` • ${e.wins} wins 👑` : ""}\n`;
  });
  return { handled: true, message: out };
}

// P17: quizmod passthrough (permission enforced inside)
async function handleQuizMod(sock, chatId, senderJid, botMarker, args, canUseAdminCommands) {
  return quizConfigMod.handleQuizMod(chatId, args, canUseAdminCommands, botConfig.getPrefix());
}

// ── back-compat exports (old QA harnesses / external pinning) ──
const QUESTION_SECONDS = quizConfigMod.DEFAULTS.timePerQuestion; // P2: now config-driven
const MAX_QUESTIONS = quizConfigMod.DEFAULTS.maxQuestions;       // P7: now 50

// compat: legacy lazy media attach - superseded by resolveQuestionMedia
// (image questions verify at GENERATION time now); kept for tests.
async function attachMedia(q) {
  if (!q || !q.loreRef || !q.loreRef.wiki || !q.loreRef.page) return null;
  try {
    const img = await quizLore.getPageImage(q.loreRef.wiki, q.loreRef.page);
    if (!img || !img.url) return null;
    const dl = await quizLore.downloadMedia(img.url, "image").catch(() => null);
    if (dl) return { kind: "image", buf: dl.buf, mime: dl.mime };
  } catch { /* fall through */ }
  return null;
}

module.exports = {
  hasActive,
  getSession,
  startQuiz,
  pickCandidate,
  endQuiz,
  handleAnswer,
  handleQuizMod,
  showLeaderboard,
  isQuizAnswerText,
  setDeps,
  // test surface:
  parseQuizArgs,
  coerceQuestions,
  extractJsonObject,
  buildFallbackQuestions,
  buildSectionPlan,
  buildImageQuestion,
  buildThemeSongQuestion,
  validateGeneratedQuestion,
  qhash,
  resolveAnime,
  resolveFranchise,
  anilistSearch,
  fetchCharacters,
  loadSeen,
  partitionFresh,
  saveSeen,
  loadScores,
  recordSessionResults,
  generateLoreQuestions,
  getFranchiseIntroImage,
  normalizeSmartGroq,
  acquireLifecycle,
  releaseLifecycle,
  attachMedia,
  POINTS,
  QUESTION_SECONDS,
  MAX_QUESTIONS,
  SECTION_STATES,
  FOREIGN_MEDIA_BLOCKLIST,
  RANDOM_POOL,
  _internal: { activeQuizzes, pendingPicks, lifecycle, revealAndAdvance, finishQuiz, postQuestion, startSection, ensureSectionGenerating, generateSectionQuestions, advanceToNextSection, mediaKeyFor, probeAvailability, launchQuizAsync, buildFranchiseContext },
};
