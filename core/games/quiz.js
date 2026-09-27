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
const quizMediaMod = require("./quizMedia");   // 2026-09-27 logos + spot-the-song modes
const mediaWorker = require("../utils/mediaWorker"); // 2026-09-27 shared media job runner
const imageGate = require("../utils/imageGate");         // 2026-09-27 pixel-level gates
const visionVerify = require("../utils/visionVerify");   // 2026-09-27 subject-match verify (Box 2 provider)

// ── state ──
const activeQuizzes = new Map(); // chatId -> session (one live quiz per chat)
const pendingPicks = new Map();  // chatId -> { choices, ts, opts }
// chatId -> { cancelled, session, reassureTimerId, lockSince, askedBy } for a
// launch still generating in the background. Without this handle, `.quiz end`
// during prep could only drop the lock - the worker kept running and posted
// QUIZ STARTED minutes after the group was told it was cleaned up.
const pendingPrep = new Map();

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
  // anime
  "rezero", "naruto", "onepiece", "attackontitan", "jujutsu-kaisen", "dragonball",
  "fma", "deathnote", "onepunchman", "kimetsu-no-yaiba", "hunterxhunter", "bleach",
  "myheroacademia", "spyxfamily", "chainsawman", "swordartonline", "steins-gate",
  "codegeass", "tokyoghoul", "vinlandsaga", "solo-leveling", "blackclover",
  "dandadan", "fairytail", "berserk", "evangelion", "cowboybebop", "konosuba",
  // games
  "eldenring", "darksouls", "sekiro", "bloodborne", "zelda", "minecraft", "gta",
  "godofwar", "witcher", "finalfantasy", "pokemon", "gensin-impact", "leagueoflegends",
  "cyberpunk", "fortnite", "among-us",
  // tv / movies / comics / cartoons
  "batman", "marvel", "dc", "starwars", "startrek", "harrypotter", "lotr",
  "avatar", "ben10", "spongebob", "strangerthings", "breakingbad", "gameofthrones",
  "gravityfalls", "adventuretime", "steven-universe", "teentitans",
];
// display names for option lists (theme-song "which anime is this from?")
const RANDOM_TITLES = {
  rezero: "Re:Zero", naruto: "Naruto", onepiece: "One Piece", attackontitan: "Attack on Titan",
  "jujutsu-kaisen": "Jujutsu Kaisen", dragonball: "Dragon Ball", fma: "Fullmetal Alchemist",
  deathnote: "Death Note", onepunchman: "One Punch Man", "kimetsu-no-yaiba": "Demon Slayer",
  hunterxhunter: "Hunter x Hunter", bleach: "Bleach", myheroacademia: "My Hero Academia",
  spyxfamily: "Spy x Family", chainsawman: "Chainsaw Man", swordartonline: "Sword Art Online",
  "steins-gate": "Steins;Gate", codegeass: "Code Geass", tokyoghoul: "Tokyo Ghoul",
  vinlandsaga: "Vinland Saga", "solo-leveling": "Solo Leveling", blackclover: "Black Clover",
  dandadan: "Dandadan", fairytail: "Fairy Tail", berserk: "Berserk", evangelion: "Evangelion",
  cowboybebop: "Cowboy Bebop", konosuba: "Konosuba",
  eldenring: "Elden Ring", darksouls: "Dark Souls", sekiro: "Sekiro", bloodborne: "Bloodborne",
  zelda: "The Legend of Zelda", minecraft: "Minecraft", gta: "GTA",
  godofwar: "God of War", witcher: "The Witcher", finalfantasy: "Final Fantasy",
  pokemon: "Pokémon", "gensin-impact": "Genshin Impact", leagueoflegends: "League of Legends",
  cyberpunk: "Cyberpunk 2077", fortnite: "Fortnite", "among-us": "Among Us",
  batman: "Batman", marvel: "Marvel", dc: "DC Comics", starwars: "Star Wars", startrek: "Star Trek",
  harrypotter: "Harry Potter", lotr: "Lord of the Rings", avatar: "Avatar: The Last Airbender",
  ben10: "Ben 10", spongebob: "SpongeBob", strangerthings: "Stranger Things",
  breakingbad: "Breaking Bad", gameofthrones: "Game of Thrones", gravityfalls: "Gravity Falls",
  adventuretime: "Adventure Time", "steven-universe": "Steven Universe", teentitans: "Teen Titans",
};

// injected shared infra (P11): engine calls quizGame.setDeps once at boot
const deps = { goService: null, ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg", canStartQuiz: null, canManageQuiz: null };

// 💡 START PERMISSION GATE (2026-09-27 owner spec): only Quiz Mods, Global
// Mods and the bot owner may START quizzes. The engine injects the check via
// setDeps (module-level fns there - no circular require). When the hook is
// absent (sandbox tests, direct requires) the gate stays OPEN so the QA
// suites keep exercising the generation pipeline.
function _canStartQuiz(senderJid) {
  try { if (typeof deps.canStartQuiz === "function") return !!deps.canStartQuiz(senderJid); } catch { /* fail open */ }
  return true;
}
// 2026-09-28: denial bounces owners/mods confusingly (seen live: added on
// Joker, denied on Subaru 20s later, inside the 45s Set-refresh window).
// Before denying, refresh the shared mod Sets from MongoDB once and recheck.
async function _canStartQuizFresh(senderJid) {
  if (_canStartQuiz(senderJid)) return true;
  try { if (typeof deps.refreshModSets === "function") await deps.refreshModSets(); } catch { /* keep cached verdict */ }
  return _canStartQuiz(senderJid);
}
// Manage gate FAILS CLOSED when the hook is absent: legacy behaviour (starter
// or admins only) must keep holding in tests/direct-require contexts, and a
// missing hook in production must never widen permissions.
function _canManageQuiz(senderJid) {
  try { if (typeof deps.canManageQuiz === "function") return !!deps.canManageQuiz(senderJid); } catch { /* deny */ }
  return false;
}

// 2026-09-27 fairness fix: `arr.sort(() => Math.random() - 0.5)` is a biased
// shuffle (measured: option A carried the correct answer far above 25%).
// Every OPTION-ORDER shuffle in the media builders uses a real Fisher-Yates
// now; the correct index is still derived from the shuffled order.
function _fyShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
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

// 💡 IMAGE RELIABILITY (2026-09-27 owner brief §4): media-SCOPED character
// image lookup. Searching AniList globally by name would return same-named
// characters from OTHER shows; scoping by Media id pins the result to THIS
// franchise, so the returned image is the official art of exactly that
// character. This is a database lookup, not a web search - the source of the
// "asked for Zelda, got a man with his dog" class of bug was unanchored
// search results, which this eliminates for anime/manga franchises.
const ANILIST_CHAR_IMG_Q = `
query ($id: Int, $search: String) {
  Media(id: $id, type: ANIME) {
    characters(perPage: 3, search: $search) {
      edges { node { name { full } image { large } } }
    }
  }
}`;

async function anilistCharacterImage(anilistId, charName) {
  if (!anilistId || !charName) return null;
  const r = await _http.post("https://graphql.anilist.co", {
    query: ANILIST_CHAR_IMG_Q,
    variables: { id: anilistId, search: charName },
  });
  const edges = r.data?.data?.Media?.characters?.edges || [];
  const hit = edges.map((e) => e.node).find((n) => n && n.image && n.image.large);
  return hit ? { url: hit.image.large, source: "anilist-character" } : null;
}

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
    const order = _fyShuffle(options.map((_, i) => i)); // fair option order
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

  // P24b: PARALLEL ROUNDS. The sequential pipeline spent sum(N x LLM-latency)
  // wall clock: each slot's retrieve -> LLM -> validate ran strictly after the
  // previous slot finished. Same guarantees, new schedule:
  //   - lore RETRIEVAL stays serial (usedKeys claims must keep their order ->
  //     P15 no-chunk-twice invariant is decided here, exactly as before)
  //   - every LLM call + P12 validation of one round fires CONCURRENTLY
  //   - rejected/failed slots retry in later rounds: same lastReject feedback,
  //     same attempt index passed to the prompt, same 4-attempt cap
  // Acceptance criteria, retire-on-reject, plan order and final numbering are
  // byte-identical to the sequential pipeline.
  const slots = adjustedPlan.map((domain) => ({ domain, question: null, lastReject: null }));

  const retrieveForSlot = async (slot) => {
    const domain = slot.domain;
    try {
      if (domain === "characters") {
        const charPage = buckets ? quizLore.pickCharacterPage(buckets, difficulty) : null;
        let lore = await quizLore.retrieveCharacterLore(wiki, charPage, difficulty, usedKeys);
        if (!lore && charPage) lore = await quizLore.retrieveLore(wiki, charPage, "characters", difficulty, usedKeys);
        return lore;
      } else if (domain === "cosmology" || domain === "powerscaling") {
        let lore = await quizLore.retrieveCosmologyLore(wiki, franchiseTitle, difficulty, usedKeys, domain);
        if (!lore) lore = await quizLore.retrieveLore(wiki, franchiseTitle, domain, difficulty, usedKeys);
        return lore;
      }
      return await quizLore.retrieveLore(wiki, franchiseTitle, domain, difficulty, usedKeys);
    } catch (e) {
      console.log("[Quiz] lore retrieval failed:", e?.message);
      return null;
    }
  };

  const MAX_ATTEMPTS = 4; // unchanged sequential attempt cap
  // P24b: LLM burst cap - firing all N round calls at once trips Groq org
  // rate limits (measured: 429 storms + lost yield). A small worker pool
  // keeps the parallel win while pacing the request stream.
  const LLM_BURST = Math.max(1, parseInt(process.env.QUIZ_LLM_BURST, 10) || 3);

  const handleSlot = async ({ slot, lore }, attempt) => {
    try {
      const out = await quizLore.generateLoreQuestion(callLLM, franchiseTitle, lore, slot.domain, difficulty, slot.lastReject, attempt);
      if (!out) return;
      // P12 validation before acceptance
      const err = validateGeneratedQuestion(out.question, {
        franchiseTitle, wiki,
        loreText: lore.text || "",
        domain: slot.domain, mediaType: opts.mediaType || "anime",
        subjectNames: [lore.page, lore.section].filter(Boolean),
      });
      if (err) {
        console.log(`[Quiz] Q rejected (${slot.domain}): ${err}`);
        slot.lastReject = err;
        // retire this lore chunk so the retry sources DIFFERENT lore
        // (same-source retries just re-roll the same broken question)
        usedKeys.add(`${wiki}:${lore.page}:${lore.section}`);
        return;
      }
      const q = out.question;
      q.promptTok = out.promptTok;
      q.loreRef = { wiki, page: lore.page, section: lore.section };
      slot.question = q;
    } catch { /* slot retries in the next round */ }
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const pending = slots.filter((s) => !s.question);
    if (!pending.length) break;

    // serial retrieval round - ordered usedKeys claims, wiki cache does the rest
    const withLore = [];
    for (const slot of pending) {
      const lore = await retrieveForSlot(slot);
      if (lore) withLore.push({ slot, lore });
    }
    if (!withLore.length) continue;

    // bounded-parallel LLM + validation for the whole round
    const queue = [...withLore];
    await Promise.all(Array.from({ length: Math.min(LLM_BURST, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await handleSlot(item, attempt);
      }
    }));
  }

  const questions = slots.filter((s) => s.question).map((s) => s.question);
  slots.forEach((s, i) => {
    if (!s.question) return;
    const q = s.question;
    console.log(`[Quiz] Q${i + 1} ${s.domain}/${difficulty} ctx=${q.promptTok || "?"}tok src=${q.loreRef ? `${q.loreRef.page}/${q.loreRef.section}` : "?"}`);
  });
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

async function buildImageQuestion(wiki, franchiseTitle, charBuckets, usedKeys, difficulty = "easy", sessionRef = null) {
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
  // 2026-09-27: candidate pool 8 -> 14. Fandom thumbnails are missing/403 for
  // many subjects ("images don't even spawn half the time"); each extra
  // candidate is one more chance to land a verified asset.
  const candidates = [...uniq].sort((a, b) => (Math.random() - 0.7) + (bandRank(a.band) - bandRank(b.band)) * 0.4).slice(0, 14);

  // fetch + VERIFY an image for one candidate. 2026-09-27 owner brief §4:
  // every byte passes FOUR checks before it may enter a question:
  //   1. download succeeded (magic bytes, P13 - unchanged)
  //   2. pixel gate: decodes via sharp, big enough, not black/blank/flat/
  //      transparent-dominant, jpeg/png/webp only (imageGate)
  //   3. subject verification via the vision provider when one is configured
  //      (Box 2 CLIP verifier through VISION_ENDPOINT; absent -> skip)
  //   4. WhatsApp sendability = (1)+(2)+format whitelist
  // SOURCES, in order (canonical/anchored first - "Don't just search the web
  // and grab the first vaguely related image"):
  //   1. the franchise wiki's own pageimage (page-anchored)
  //   2. AniList MEDIA-SCOPED character art (anime/manga - database-anchored
  //      to this exact show, the strongest anchor there is)
  //   3. Wikipedia article image for "<character> <franchise>"
  //   4. Wikipedia File-namespace search (junk-filtered) - last resort
  const anilistId = sessionRef?.franchise?.anime?.id || null;
  const fetchVerifiedImage = async (subject) => {
    return mediaWorker.run(async () => {
      const trySource = async (tag, url) => {
        if (!url) return null;
        const dl = await quizLore.downloadMedia(url, "image").catch(() => null);
        if (!dl) return null;
        const gate = await imageGate.inspectImageBuffer(dl.buf, { label: `${tag}:${subject}`.slice(0, 60) }).catch(() => ({ ok: false, reason: "gate-crash" }));
        if (!gate.ok) return null; // black/blank/corrupt/tiny -> next source
        return { ...dl, url, source: tag };
      };
      // 1. Fandom pageimage (page-anchored, cannot cross subjects)
      let img = null;
      try { img = await quizLore.getPageImage(wiki, subject); } catch { img = null; }
      let hit = img && img.url ? await trySource("fandom", img.url) : null;
      if (hit) return hit;
      // 2. AniList media-scoped official character art (franchise-anchored)
      if (anilistId) {
        const al = await anilistCharacterImage(anilistId, subject).catch(() => null);
        if (al && al.url) {
          hit = await trySource("anilist-character", al.url);
          if (hit) return hit;
        }
      }
      // 3+4. Wikipedia (search-anchored, independent)
      for (const mode of ["article", "files"]) {
        const wp = await quizLore.wikipediaImage(`${subject} ${franchiseTitle}`, 700, mode).catch(() => null);
        if (wp && wp.url) {
          hit = await trySource(wp.source || `wikipedia-${mode}`, wp.url);
          if (hit) return hit;
        }
      }
      return null;
    }, { label: `imgq:${subject}`.slice(0, 60), timeoutMs: 45000 }).catch(() => null);
  };

  for (const ch of candidates) {
    const page = ch.name;
    if (usedKeys && usedKeys.has(`img:${page}`)) continue;
    let hit = await fetchVerifiedImage(page);
    // 💡 VISION VERIFY (owner brief §4): when a vision provider is configured
    // the accepted image must actually depict the requested subject; a
    // mismatch/NSFW verdict discards it and the loop moves to the next
    // candidate. "unknown" (no provider / flake) NEVER rejects - canonical
    // anchoring above remains the primary correctness lever.
    if (hit && visionVerify.providerConfigured()) {
      const v = await visionVerify.verifySubject(hit.buf, hit.mime, page, franchiseTitle).catch(() => ({ decision: "unknown" }));
      if (v.decision === "reject") {
        console.log(`[Quiz] vision rejected image for ${page} (${v.reason}) - trying next candidate`);
        if (usedKeys) usedKeys.add(`img:${page}`); // don't retry the same bad asset
        continue;
      }
    }
    if (!hit) continue;
    // P26: seed the shared asset cache with these verified bytes so the
    // post-time send reuses them - fresh image questions download their
    // image exactly ONCE (was: once at generation, again at post time).
    quizBank.putCachedAsset(hit.url, { buf: hit.buf, mime: hit.mime, kind: "image" });
    // options: correct + 3 same-franchise names (no cross-franchise options)
    const others = uniq
      .filter((x) => String(x.name).toLowerCase() !== String(ch.name).toLowerCase())
      .sort(() => Math.random() - 0.5).slice(0, 3);
    if (others.length < 3) continue;
    const optionsPool = [ch.name, ...others.map((o) => o.name)];
    const optOrder = _fyShuffle(optionsPool.map((_, i) => i)); // fair option order
    const q = {
      q: `Who is this character from ${franchiseTitle}?`,
      options: optOrder.map((i) => optionsPool[i]),
      correct: optOrder.indexOf(0),
      difficulty: ch.band || difficulty || "easy",
      topic: "Character ID",
      domain: "characters",
      type: "image",
      assetKey: hit.url,
      asset: { kind: "image", url: hit.url, mime: hit.mime, subject: page, source: hit.source, bytesHash: crypto.createHash("sha1").update(hit.buf).digest("hex").slice(0, 16) },
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
  try { songs = await quizLore.getThemeSongs(mediaType, animeId, { goService: deps.goService }); } catch { return null; }
  const pool = [...songs.openings, ...songs.endings].filter((s) => s && s.length >= 3);
  if (!pool.length) return null;

  // P29: options = correct media + 3 other well-known titles. Franchises
  // resolved wiki-first have empty otherTitles (candidates only populate on
  // the anime-pick path), which silently killed EVERY theme-song question -
  // fill the shortfall from the well-known franchise pool (P11 spec intent).
  const franchiseLower = String(franchise.title).toLowerCase();
  let others = (otherTitles || [])
    .filter((t) => String(t).toLowerCase() !== franchiseLower)
    .sort(() => Math.random() - 0.5).slice(0, 3);
  if (others.length < 3) {
    const pretty = (slug) => RANDOM_TITLES[slug] || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const extra = RANDOM_POOL
      .filter((slug) => pretty(slug).toLowerCase() !== franchiseLower && !others.some((o) => String(o).toLowerCase() === pretty(slug).toLowerCase()))
      .sort(() => Math.random() - 0.5)
      .map(pretty);
    for (const t of extra) {
      if (others.length >= 3) break;
      others.push(t);
    }
  }
  if (others.length < 3) return null;
  const optionsPool = [franchise.title, ...others];
  const order = _fyShuffle(optionsPool.map((_, i) => i)); // fair option order

  // P29: try up to 3 candidate songs - audio retrieval hits that fail P14
  // verification used to kill the whole question; every candidate still goes
  // through the exact same verification gates, only the pick is retried.
  const candidates = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  for (const song of candidates) {
    if (usedKeys && usedKeys.has(`song:${_normText(song)}`)) continue;

    // retrieval through the EXISTING audio infra (P11: no parallel fetch system).
    // P25: ask the service to hand back the clipped 30s/96k bytes directly - it
    // already downloaded + converted the track, so this kills the full-file
    // re-download AND the local ffmpeg spawn on this box. Same ffmpeg binary +
    // same args = same clip bytes/audio as the old local trim (1-byte LAME
    // metadata difference, zero effect: audio clips are never content-hashed).
    const info = await deps.goService.getAudioInfo(`${song} ${franchise.title} opening`, { clipSeconds: 30, clipBitrate: "96k" }).catch(() => null);
    if (!info || info.error || !info.audioURL || !info.metadata) continue;
    // P14 verification: the hit must actually belong to this media. A search
    // API hit alone is NOT verification - require title overlap with the song
    // name or the franchise title.
    const metaTitle = _normText(info.metadata.title);
    const songN = _normText(song);
    const franN = _normText(franchise.title || "");
    const overlap = (metaTitle.includes(songN.slice(0, Math.max(6, Math.floor(songN.length * 0.6)))) && songN.length >= 6)
      || (franN.length >= 5 && metaTitle.includes(franN.split(" ")[0]));
    if (!overlap) continue;

    // download + byte verification BEFORE the question is playable.
    // Acceptance gates match the legacy pipeline exactly: full file >= 50KB,
    // final clip > 20KB.
    let clip = null;
    if (info.clipped) {
      // P25 fast path: the service already trimmed (fullBytes gate mirrors the
      // old >=50KB check on the full file we used to download)
      const fullOk = !Number.isFinite(info.fullBytes) || info.fullBytes >= 50 * 1024;
      const dl = await mediaWorker.run(
        () => axios.get(info.audioURL, { responseType: "arraybuffer", timeout: 60000, maxContentLength: 20 * 1024 * 1024 }).catch(() => null),
        { label: `songclip:${_normText(song).slice(0, 40)}`, timeoutMs: 70000 },
      ).catch(() => null);
      if (fullOk && dl && dl.data && dl.data.length > 20 * 1024) clip = Buffer.from(dl.data);
    }
    if (!clip) {
      // legacy path: full file download + local ffmpeg trim (older Go build or
      // server-side clip failed) - unchanged behavior
      const dl = await axios.get(info.audioURL, { responseType: "arraybuffer", timeout: 60000, maxContentLength: 20 * 1024 * 1024 }).catch(() => null);
      if (!dl || !dl.data || dl.data.length < 50 * 1024) continue;
      clip = await _clipAudioBuffer(Buffer.from(dl.data), deps.ffmpegPath, 30);
    }
    if (!clip) continue;

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
  return null;
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
// P20: BOT-WIDE GENERATION GATE (prep-phase concurrency cap)
// Caps how many quizzes GENERATE at the same time across the whole bot
// (all instances share this one node process). Playing is never gated -
// only the initial prep phase (franchise resolution + section-1 build).
// Over the cap, launches WAIT in FIFO order (never dropped); if the wait
// exceeds GEN_QUEUE_TIMEOUT_MS they are deferred with a clear message.
// Normal traffic (1 group generating) never touches the queue.
// ════════════════════════════════════════════

const GEN_SLOTS = Math.max(1, parseInt(process.env.QUIZ_GEN_SLOTS, 10) || 2);
const GEN_QUEUE_TIMEOUT_MS = Math.max(30000, parseInt(process.env.QUIZ_GEN_QUEUE_TIMEOUT_MS, 10) || 10 * 60 * 1000);
const genGate = { active: 0, waiters: [] };

function acquireGenSlot(prep) {
  return new Promise((resolve) => {
    if (genGate.active < GEN_SLOTS && genGate.waiters.length === 0) {
      genGate.active += 1;
      resolve(true);
      return;
    }
    const waiter = { prep, resolve, timer: null };
    waiter.timer = setTimeout(() => {
      const i = genGate.waiters.indexOf(waiter);
      if (i >= 0) {
        genGate.waiters.splice(i, 1);
        resolve(false); // queue wait expired -> caller defers clearly
      }
    }, GEN_QUEUE_TIMEOUT_MS);
    genGate.waiters.push(waiter);
  });
}

function pumpGenGate() {
  // P20: purge cancelled waiters FIRST - they need no slot and must not sit
  // until their timeout ticks (endQuiz cancels can happen at zero free slots)
  for (let i = genGate.waiters.length - 1; i >= 0; i--) {
    const w = genGate.waiters[i];
    if (w.prep && w.prep.cancelled) {
      genGate.waiters.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(false);
    }
  }
  while (genGate.active < GEN_SLOTS && genGate.waiters.length) {
    const w = genGate.waiters.shift();
    clearTimeout(w.timer);
    if (w.prep && w.prep.cancelled) { w.resolve(false); continue; } // cancelled while queued
    genGate.active += 1;
    w.resolve(true);
  }
}

function releaseGenSlot() {
  genGate.active = Math.max(0, genGate.active - 1);
  pumpGenGate();
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

// 💡 RANDOM MODE = MIXED PLAYLIST (owner brief 2026-09-28): "random mode
// mixing different things" - a random quiz no longer draws ONLY lore
// sections. It now interleaves question TYPES: a Logo Round, a Spot the
// Song section, a Picture section (when the franchise has characters) and
// lore sections across random franchises. Standalone modes (.j quiz logos/
// song/audio) keep working exactly as before; this is about what `random`
// itself means.
function buildRandomMixedPlan(cfg, availability = {}) {
  const count = cfg.questionCount;
  const size = Math.max(3, cfg.sectionSize);
  // media share of the quiz (logos ~20%, songs ~15%, images ~10%)
  let logosN = Math.min(6, Math.max(3, Math.round(count * 0.2)));
  let songN = Math.min(5, Math.max(3, Math.round(count * 0.15)));
  let imgN = cfg.imageQuestionCount > 0
    ? cfg.imageQuestionCount
    : Math.min(3, Math.max(2, Math.round(count * 0.1)));
  if (!availability.characters) imgN = 0; // no character art source - skip pictures
  // lore keeps at least 40% and never drops below 6 questions
  const loreMin = Math.max(6, Math.ceil(count * 0.4));
  while (count - (logosN + songN + imgN) < loreMin) {
    if (logosN > 3) logosN--;
    else if (songN > 3) songN--;
    else if (imgN > 2) imgN--;
    else break;
  }
  const loreN = count - (logosN + songN + imgN);
  if (loreN < 6) return null; // too small for a real mix - caller falls back

  // lore blocks split into section-size chunks
  const loreChunks = [];
  let left = loreN;
  while (left > 0) { const give = Math.min(size, left); loreChunks.push(give); left -= give; }

  const plan = [];
  plan.push({ name: "Logo Round", domain: "logos", perSection: logosN, fixed: true });
  // first lore chunk right after logos (fast start: logos build in seconds)
  const loreDomains = () => ["plot", "characters", "cosmology", "mixed"];
  let li = 0;
  const pushLore = (n) => {
    // a chunk may exceed one section only via the size cap - split it
    let rem = n;
    while (rem > 0) {
      const give = Math.min(size, rem);
      const dom = loreDomains()[li % loreDomains().length];
      const tpl = LONG_SECTION_TEMPLATES.find((t) => t.domain === dom);
      plan.push({ name: tpl ? tpl.name : "Mixed Challenge", domain: dom, perSection: give, fixed: true });
      li++;
      rem -= give;
    }
  };
  pushLore(loreChunks.shift() || 0);
  // Spot the Song in the middle (audio retrieval is slow - it streams while
  // earlier sections play), then pictures, then the remaining lore.
  plan.push({ name: "Spot the Song", domain: "song", perSection: songN, fixed: true });
  if (imgN > 0) plan.push({ name: "Picture Round", domain: "images", perSection: imgN, fixed: true });
  pushLore(loreChunks.shift() || 0);
  while (loreChunks.length) pushLore(loreChunks.shift());
  return plan;
}

function buildSectionPlan(cfg, availability = {}) {
  const count = cfg.questionCount;
  const size = Math.max(3, cfg.sectionSize);
  // 2026-09-28: random mode mixes question types (see buildRandomMixedPlan)
  if (cfg.randomMode && count >= 9) {
    const mixed = buildRandomMixedPlan(cfg, availability);
    if (mixed) return mixed;
  }
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
  // (mixed random plans set exact perSection sizes - never redistributed)
  if (!plan.some((p) => p.fixed)) {
    let left = count;
    for (let i = 0; i < plan.length; i++) {
      const give = i === plan.length - 1 ? left : Math.min(size, left - Math.max(0, nSections - i - 1) * 3);
      plan[i].perSection = Math.max(3, give);
      left -= plan[i].perSection;
    }
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
  // 2026-09-27: standalone media modes bank under their own key so logo and
  // song questions reuse across sessions like lore questions do.
  if (session.mode === "logos") return "mode:logos";
  if (session.mode === "song") return "mode:songs";
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
  const mk = mediaKeyFor(session);

  // ── 2026-09-27: standalone media modes (logos / song) ──
  // LLM-free deterministic generation with real verified assets. Everything
  // downstream (READY state, banking, postQuestion) is shared with lore.
  if (section.domain === "logos") {
    const banked = quizBank.bankLookup(mk, loadSeen(mk).map((h) => h), sectionCount, { type: "image" });
    for (const b of banked) questions.push(b);
    if (questions.length < sectionCount) {
      const fresh = await mediaWorker.run(
        () => quizMediaMod.buildLogosQuestions({ count: sectionCount - questions.length, usedKeys, difficulty: cfg.difficulty }),
        { label: "logos:build", timeoutMs: 180000 },
      ).catch(() => []);
      for (const q of fresh || []) {
        if (questions.length >= sectionCount) break;
        if (q._cachedAsset) quizBank.putCachedAsset(q._cachedAsset.url, q._cachedAsset);
        delete q._cachedAsset;
        if (quizBank.bankPut(mk, q) || !questions.some((x) => x.assetKey === q.assetKey)) questions.push(q);
      }
    }
    section.state = SECTION_STATES.READY;
    section.questions = questions.slice(0, sectionCount);
    return section.questions;
  }
  if (section.domain === "song" || section.domain === "audio") {
    const isTheme = section.domain === "audio";
    const fresh = await mediaWorker.run(
      () => isTheme
        ? quizMediaMod.buildThemeSongQuestions({
            count: sectionCount, usedKeys, difficulty: cfg.difficulty,
            goService: deps.goService,
            trimFn: (buf, secs) => _clipAudioBuffer(buf, deps.ffmpegPath, secs || 25),
          })
        : quizMediaMod.buildSpotSongQuestions({
            count: sectionCount, usedKeys, difficulty: cfg.difficulty,
            goService: deps.goService,
            trimFn: (buf, secs) => _clipAudioBuffer(buf, deps.ffmpegPath, secs || 25),
          }),
      { label: `${section.domain}:build`, timeoutMs: 300000 },
    ).catch(() => []);
    for (const q of fresh || []) {
      if (questions.length >= sectionCount) break;
      questions.push(q); // audio carries live bytes; banking stores the URL-less asset minus buf
    }
    section.state = SECTION_STATES.READY;
    section.questions = questions.slice(0, sectionCount);
    return section.questions;
  }

  // 💡 RANDOM ACROSS FICTION (owner brief §2): in random mode every lore
  // section draws its OWN franchise. First section's context came from the
  // launch; sections 2+ resolve a fresh world here (network, cached per wiki).
  if (session.mode === "random" && !section.franchise) {
    const drawn = await drawSectionFranchise(session).catch(() => null);
    if (drawn) {
      section.franchise = drawn;
      section.name = drawn.title; // section card shows the new world
    }
  }
  const F = section.franchise || null; // null -> franchise-mode: session carries everything
  const fWiki = F?.wiki || session.wiki;
  const fTitle = F?.title || session.title;
  const fAnime = F?.anime || session.anime;
  const fChars = F?.characters || session.animeCharacters || [];
  const fMk = F ? `wiki:${F.wiki}` : mk;
  const fFranchise = F ? { title: F.title, wiki: F.wiki, anime: F.anime, mediaType: F.mediaType } : session.franchise;
  const fOther = F?.otherTitles || session.otherTitles || [];
  const fMediaType = F?.mediaType || cfg.mediaType;

  // lazy character index (per franchise wiki, cached once per session - P21)
  session.charIndexByWiki = session.charIndexByWiki || new Map();
  let charIdx = fWiki ? (session.charIndexByWiki.get(fWiki) || null) : null;
  if (fWiki && !charIdx) {
    try {
      charIdx = await quizLore.buildCharacterIndex(fWiki, fTitle, fChars);
      session.charIndexByWiki.set(fWiki, charIdx);
    } catch { charIdx = null; }
  }

  // 💡 random-mode Picture Round: an "images" section ALWAYS wants image
  // questions (cfg.imageQuestionCount is only set by the -images flag; the
  // auto-mixed plan adds picture sections without it)
  const wantsImages = section.domain === "images"
    ? (cfg.imageQuestionCount > 0 || session.mode === "random")
    : false;
  const needImages = wantsImages ? Math.min(cfg.imageQuestionCount > 0 ? cfg.imageQuestionCount : sectionCount, sectionCount) : 0;
  const needText = sectionCount - needImages;

  // P21: no wiki -> straight to domain-aware metadata fallbacks (no wasted
  // network retries against a nonexistent wiki)
  if (!fWiki) {
    const fbAll = buildFallbackQuestions(fAnime, fChars, cfg.difficulty, sectionCount + 6);
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
    const banked = quizBank.bankLookup(fMk, loadSeen(fMk).map((h) => h), needImages, { type: "image" });
    for (const b of banked) { questions.push(b); served++; }
    while (served < needImages) {
      const q = await buildImageQuestion(fWiki, fTitle, charIdx, usedKeys, cfg.difficulty, { franchise: fFranchise, mediaType: fMediaType }).catch(() => null);
      if (!q) break; // no verified images - graceful (text takes over below)
      // P15 dedup: skip if this asset already in bank
      if (quizBank.bankPut(fMk, q)) questions.push(q);
      else if (!questions.some((x) => x.assetKey === q.assetKey)) questions.push(q);
      served++;
    }
    // fill any image shortfall with text lore (never fake an image)
    while (questions.length < sectionCount) {
      const extra = await generateLoreQuestions(fWiki, fTitle, cfg.difficulty, sectionCount - questions.length, "characters", fChars, session.callLLM, { vaCap: 0, mediaType: fMediaType });
      if (!extra.length) break;
      questions.push(...extra.slice(0, sectionCount - questions.length));
    }
    section.state = SECTION_STATES.READY;
    section.questions = questions.slice(0, sectionCount);
    return section.questions;
  }

  // P24: theme-song retrieval starts IN PARALLEL with text generation (the
  // audio-service chain can take seconds-to-minutes; the text LLM path does
  // not depend on it). The result is still INSERTED at the same position
  // (after text questions), so ordering and content are unchanged.
  const tsPromise = (cfg.audioQuestionCount > 0 && section.canCarryAudio && cfg.themeSongQuestionCount > 0 && fFranchise)
    ? buildThemeSongQuestion(fFranchise, fOther, usedKeys).catch(() => null)
    : null;

  // text lore questions (with P12 validation inside generateLoreQuestions)
  let textQs = [];
  try {
    // forced section domain (non-mixed) -> 100% that domain inside the section
    const forcedDomain = cfg.categories ? cfg.categories[0] : (section.domain && section.domain !== "mixed" && section.domain !== "images" ? section.domain : null);
    textQs = await generateLoreQuestions(fWiki, fTitle, cfg.difficulty, needText, forcedDomain, fChars, session.callLLM, { vaCap: cfg.voiceActorQuestionLimit, mediaType: fMediaType, usedKeys: session.usedKeys });
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
    if (cfg.themeSongQuestionCount > 0 && fFranchise) {
      const ts = tsPromise ? await tsPromise : null; // P24: started above, ran alongside text gen
      if (ts) { questions.push(ts); audioLeft--; }
    }
    if (audioLeft > 0 && charIdx && questions.length) {
      // character voice audio: hunt on one of the section's character subjects
      const subj = questions.find((q) => q.loreRef && q.loreRef.page && q.domain === "characters");
      if (subj) {
        const audio = await quizLore.findAudioForPage(fWiki, subj.loreRef.page).catch(() => null);
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
    const fb = buildFallbackQuestions(fAnime, fChars, cfg.difficulty, shortfall + 4)
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
    if (questions.length < sectionCount && fWiki) {
      const extra = await generateLoreQuestions(fWiki, fTitle, cfg.difficulty, sectionCount - questions.length + 2, altDomain && altDomain !== "mixed" ? altDomain : null, fChars, session.callLLM, { vaCap: 0, mediaType: fMediaType, usedKeys: session.usedKeys }).catch(() => []);
      questions.push(...extra.slice(0, sectionCount - questions.length));
    }
  }

  section.state = SECTION_STATES.READY;
  section.questions = questions.slice(0, sectionCount);
  // bank every validated TEXT question (P15: reuse before regen next time).
  // 2026-09-27 fix: audio questions (theme/song/voice) carry LIVE BYTES in
  // asset.buf and are no longer banked - the old loop stored the full clip
  // into MongoDB per question (hundreds of KB per doc, pure bloat).
  for (const q of section.questions) {
    if (q && q.q && !q.fromBank && q.type !== "theme" && q.type !== "audio") {
      try { quizBank.bankPut(fMk, q); } catch { /* non-fatal */ }
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

// One total everywhere (start header, question cards, already-running msg):
// generated sections count their ACTUAL questions (validation may drop some),
// not-yet-generated sections use the plan estimate. Mixing the two formulas
// is what produced "8 questions" headers on "QUESTION 1/10" cards.
function plannedTotal(session) {
  return (session.sections || []).reduce((a, s) => a + (s.questions.length ? s.questions.length : (s.perSection || 0)), 0);
}

function formatQuestionCard(session, idx, q) {
  const prefix = botConfig.getPrefix();
  const secs = session.cfg.timePerQuestion;
  const total = plannedTotal(session);
  const section = session.sections[session.activeSection];
  const sectionLabel = session.sections.length > 1 && section && section.name ? `${section.name} • ` : "";
  let s = `🎯 *QUESTION ${session.questionNo}/${total}*  •  ${sectionLabel}${q.topic}  •  ${q.difficulty.toUpperCase()}\n\n`;
  s += `*${q.q}*\n\n`;
  q.options.forEach((o, i) => { s += `${LETTERS[i]}. ${o}\n`; });
  s += `\n⏱ ${secs}s  •  ${POINTS[q.difficulty]} Zeni (+20 speed bonus)  •  one answer each\n`;
  s += `Answer with: \`${prefix} b\` (letter) or type the option text`;
  return s;
}

// resolve a lazy media asset for structural image/audio questions
async function resolveQuestionMedia(session, q) {
  if (!q || !q.type || q.type === "text" || !q.asset) return null;
  // theme-song clips carry live bytes (never banked to disk)
  if (q.asset.buf) return { kind: q.asset.kind === "audio" ? "audio" : "image", buf: q.asset.buf, mime: q.asset.mime };
  if (q.asset.kind === "image" && q.asset.url) {
    const dl = await quizBank.getCachedAsset(q.asset.url, async (u) => {
      // 2026-09-27: post-time re-fetch goes through the shared media worker
      // (capped concurrency + hard timeout) and retries once on a transient
      // failure before the question is skipped.
      const fetchOnce = () => mediaWorker.run(
        () => quizLore.downloadMedia(u, "image").catch(() => null),
        { label: `resolve:${String(u).slice(0, 48)}`, timeoutMs: 30000 },
      );
      const d = await fetchOnce().catch(() => null) || await fetchOnce().catch(() => null);
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
  // 💡 SIMPLIFIED ANSWER FORMAT (2026-09-27): ".j b" (single letter) OR the
  // option TEXT (".j Subaru Natsuki"). The legacy ".j a b" form still works
  // because the engine strips the leading trigger letter before this runs.
  let idx = -1;
  if (/^[abcd]$/i.test(raw)) {
    idx = LETTERS.indexOf(raw.toUpperCase());
  } else {
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").replace(/\b(the|a|an)\b/g, " ").trim();
    const guess = norm(raw);
    if (guess) {
      idx = q.options.findIndex((o) => norm(o) === guess);
      if (idx < 0 && guess.length >= 4) {
        // tolerant full-text: exact words only, never a bare prefix -
        // "subaru natsuki" matches, "sub" does not
        idx = q.options.findIndex((o) => {
          const on = norm(o);
          return on.length && (on === guess || (guess.split(" ").length > 1 && on.split(" ").join("") === guess.split(" ").join("")));
        });
      }
    }
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
    // 💡 45s COMMAND TIMEOUT FIX (2026-09-27): reveal -> next question ->
    // section transition can LEGALLY take minutes (streaming section waits,
    // section breaks). Awaiting it inside the answer command used to hit the
    // engine's 45s generic command timeout (logged live: cmd="a" blocked
    // through a section change). The chain is fully self-contained - run it
    // detached so the command returns instantly.
    revealAndAdvance(sock, chatId, session, { jid: senderJid, name: senderName || "Player" }, false)
      .catch((e) => console.log("[Quiz] reveal chain failed:", e?.message));
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
  //   quiz logos 15            (2026-09-27: standalone media modes)
  //   quiz song 10             ("spot the song" alias)
  const out = { title: "", count: 10, difficulty: "medium", section: null, images: null, audio: null, randomMode: false, mode: null, notes: [] };
  let rest = String(raw || "").trim();
  if (!rest) return out;
  // standalone media modes (before random/quoted handling; "spot the song" is multi-word)
  const MODE_ALIASES = { logos: "logos", logo: "logos", brands: "logos", brand: "logos", company: "logos", companies: "logos" };
  const SONG_ALIASES = { song: "song", songs: "song", music: "song" };
  // 💡 FIX (owner brief §2): ".j quiz audio N" was never a registered alias -
  // "audio" fell through as a franchise TITLE and the mode errored out. Now:
  // audio = theme songs across shows / movies / games (different from
  // "song" = spot-the-song pop tracks).
  const AUDIO_ALIASES = { audio: "audio", audios: "audio", sound: "audio", sounds: "audio", themes: "audio" };
  const spotSong = rest.match(/^spot\s+the\s+song\b/i);
  const themeSong = rest.match(/^theme\s+songs?\b/i);
  const firstWord = rest.split(/\s+/)[0].toLowerCase();
  if (spotSong) {
    out.mode = "song";
    out.title = "__song__";
    rest = rest.replace(/^spot\s+the\s+song\b/i, "").trim();
  } else if (themeSong) {
    out.mode = "audio";
    out.title = "__audio__";
    rest = rest.replace(/^theme\s+songs?\b/i, "").trim();
  } else if (SONG_ALIASES[firstWord]) {
    out.mode = "song";
    out.title = "__song__";
    rest = rest.slice(firstWord.length).trim();
  } else if (AUDIO_ALIASES[firstWord]) {
    out.mode = "audio";
    out.title = "__audio__";
    rest = rest.slice(firstWord.length).trim();
  } else if (MODE_ALIASES[firstWord]) {
    out.mode = "logos";
    out.title = "__logos__";
    rest = rest.slice(firstWord.length).trim();
  }
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
// P24: bytes go through the shared asset cache - repeat quizzes for the same
// franchise skip the network entirely (same image, same bytes).
async function getFranchiseIntroImage(wiki, title) {
  if (!wiki) return null;
  try {
    const img = await quizLore.getPageImage(wiki, title);
    if (!img || !img.url) return null;
    const dl = await quizBank.getCachedAsset(img.url, async (u) => {
      const d = await quizLore.downloadMedia(u, "image").catch(() => null);
      return d ? { buf: d.buf, mime: d.mime, kind: "image" } : null;
    });
    if (!dl || !dl.buf) return null;
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
      // 2026-09-27: a parked (ready) quiz gets its own bounce text
      if (s.awaitingGo) {
        return {
          handled: true,
          message: botMarker + `✅ A *${s.title}* quiz is prepared here and waiting for ${mentionOf(s.askedBy)}.\n▶️ Start it: \`${botConfig.getPrefix()} quiz go\`  •  Cancel: \`${botConfig.getPrefix()} quiz end\``,
          mentions: s.askedBy ? [s.askedBy] : [],
        };
      }
      return {
        handled: true,
        message: botMarker + `🎯 A quiz is already running here: *${s.title}* (question ${s.questionNo}/${plannedTotal(s)}).\nFinish it, or use \`${botConfig.getPrefix()} quiz end\` to cancel.`,
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

Media modes (no LLM - fast!):
\`${prefix} quiz logos 15\` - 🏢 name the brand behind Wikipedia logos
\`${prefix} quiz song 10\` - 🎵 spot the song from a real audio clip
\`${prefix} quiz audio 10\` - 📺 theme songs from shows/movies/games

Options:
• count: up to 50 questions (default 10) - 40+ quizzes play in named sections
• difficulty: easy / medium / hard (default medium)
• section (optional): \`-s plot\` / \`-s characters\` / \`-s cosmology\` / \`-s powerscaling\` / \`-s production\` forces that topic
• \`-images <n>\` adds n picture questions (character ID)
• \`-audio <n>\` adds n audio questions (theme songs / voices)
• \`random\` mixes franchises across ALL of fiction, one per section

During the quiz, answer with \`${prefix} <letter>\` (e.g. \`${prefix} b\`) or type the option text. One answer per player per question!
Leaderboard: \`${prefix} quizboard\` • Cancel: \`${prefix} quiz end\` • Mods: \`${prefix} quizmod\``,
    };
  }

  // 💡 START GATE (2026-09-27): only Quiz Mods / Global Mods / bot owner.
  if (!(await _canStartQuizFresh(senderJid))) {
    return {
      handled: true,
      message: botMarker + `🔒 Starting quizzes is limited to *Quiz Mods*, *Global Mods* and the bot owner.\nAsk a General Mod to grant it: \`${botConfig.getPrefix()} addquizmod @user\``,
    };
  }

  // P3: acquire BEFORE any await - the two-users-at-once race dies here
  if (!acquireLifecycle(chatId)) {
    return {
      handled: true,
      message: botMarker + `⏳ A quiz is already being prepared here - hang on a few seconds! 🎯`,
    };
  }

  // P3b: prep handle registered in the SAME synchronous frame as the lock -
  // from this instant `.quiz end` can abort the launch (no unkillable window)
  const prep = createPrepHandle(chatId, senderJid);

  // P5: immediate loading message so nobody thinks the command failed
  await sock.sendMessage(chatId, {
    text: botMarker + `🎯 Gathering questions for your quiz... Please hold on.`,
  }, { quoted: m }).catch(() => {});

  // background launch - never block the command promise (45s timeout bypass)
  launchQuizAsync(sock, chatId, senderJid, botMarker, m, parsed, senderName, smartGroqCall, prep).catch((e) => {
    console.log("[Quiz] launch crashed:", e?.message);
    pendingPrep.delete(chatId);
    releaseLifecycle(chatId);
    sock.sendMessage(chatId, { text: botMarker + `❌ Quiz preparation failed unexpectedly. Please try again.` }).catch(() => {});
  });
  return { handled: true, silent: true };
}

// P3b: factory for the cancellable prep handle. Callers (startQuiz /
// pickCandidate) create it in the same synchronous frame as acquireLifecycle
// so there is no window where the lock exists but cancellation is impossible.
function createPrepHandle(chatId, senderJid) {
  const prep = {
    cancelled: false,
    session: null,
    reassureTimerId: null,
    heartbeatId: null, // 2026-09-27 planning mode: 60s "still preparing" pulse
    lockSince: lifecycle.get(chatId)?.since ?? null,
    askedBy: senderJid,
  };
  pendingPrep.set(chatId, prep);
  return prep;
}

// ── 2026-09-27 PLANNING MODE (owner spec) ──
// "When I start a quiz with images, audio, logos, etc. and it's going to
// take a while to prepare everything, make that known instead of just
// silently taking forever. Send a message every minute to remind them that
// it's still preparing and hasn't frozen. Tag the person who initiated the
// quiz and make them use a command when they're ready to actually start it."
const READY_TTL_MS = 10 * 60 * 1000;   // parked quizzes expire after 10 min
const HEARTBEAT_MS = 60 * 1000;        // "still preparing" pulse interval

function mentionOf(jid) { return jid ? `@${String(jid).split("@")[0]}` : ""; }

// heartbeat = one 25s nudge (lore research feels instant-failed without it)
// then a 60s pulse until prep resolves. Every pulse re-checks live state so
// a finished/cancelled prep never emits a ghost heartbeat.
function startPrepHeartbeat(prep, sock, chatId, botMarker, label) {
  const alive = () => !prep.cancelled
    && lifecycle.get(chatId)?.state === "generating"
    && !activeQuizzes.has(chatId);
  prep.reassureTimerId = setTimeout(() => {
    if (!alive()) return;
    sock.sendMessage(chatId, {
      text: botMarker + `🧠 Still researching the lore for *${label}* - good questions take a moment...`,
    }).catch(() => {});
    const startedAt = Date.now();
    prep.heartbeatId = setInterval(() => {
      if (!alive()) { clearInterval(prep.heartbeatId); prep.heartbeatId = null; return; }
      const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
      sock.sendMessage(chatId, {
        text: botMarker + `⏳ Still preparing *${label}*... (${mins} min elapsed) - the bot is working, not frozen.`,
      }).catch(() => {});
    }, HEARTBEAT_MS);
    prep.heartbeatId.unref?.();
  }, GEN_REASSURE_MS);
}

function stopPrepTimers(prep) {
  if (prep.reassureTimerId) { clearTimeout(prep.reassureTimerId); prep.reassureTimerId = null; }
  if (prep.heartbeatId) { clearInterval(prep.heartbeatId); prep.heartbeatId = null; }
}

// ── 2026-09-27 READY GATE ──
// A fully prepared media quiz parks here: the group sees "ready" + a tagged
// initiator, and the quiz only actually starts when the initiator (or a
// mod/admin) fires `.j quiz go`. Unclaimed preps expire after 10 minutes so
// a group is never blocked by an abandoned prep.
async function parkReadySession(sock, chatId, session, { head, introImage, botMarker, m, senderJid, prefix }) {
  session.awaitingGo = true;
  session.readyHead = head;
  session.readyIntroImage = introImage || null;
  session.readyAt = Date.now();
  activeQuizzes.set(chatId, session); // occupied chat: new .j quiz bounces
  promoteLifecycle(chatId);           // lock now mirrors the parked session
  const prep = pendingPrep.get(chatId);
  if (prep) stopPrepTimers(prep);
  pendingPrep.delete(chatId);         // prep phase over
  const mins = Math.round(READY_TTL_MS / 60000);
  const readyMsg = botMarker
    + `✅ *${session.title} quiz is ready!* ${mentionOf(session.askedBy)}\n\n`
    + `🎯 ${plannedTotal(session)} questions prepared${session.mode === "song" ? " with audio clips" : session.mode === "logos" ? " with logo images" : " (media included)"}.\n`
    + `▶️ Start it whenever your group is ready:\n\`${prefix} quiz go\`\n`
    + `(starter or mods - expires in ${mins} minutes)`;
  await sock.sendMessage(chatId, { text: readyMsg, mentions: session.askedBy ? [session.askedBy] : [] }, { quoted: m }).catch(() => {});
  session.readyTimerId = setTimeout(async () => {
    try {
      const cur = activeQuizzes.get(chatId);
      if (!cur || cur !== session || !cur.awaitingGo) return;
      cur.cancelled = true;
      activeQuizzes.delete(chatId);
      releaseLifecycle(chatId);
      await sock.sendMessage(chatId, {
        text: botMarker + `⌛ The prepared *${cur.title}* quiz expired without \`${prefix} quiz go\` - cleaned up. Start a fresh one any time: \`${prefix} quiz ...\``,
      }).catch(() => {});
      console.log(`[Quiz] ready-gate expired for ${chatId}`);
    } catch (e) {
      console.log("[Quiz] ready-gate expiry failed:", e?.message);
    }
  }, READY_TTL_MS);
  session.readyTimerId.unref?.();
}

// `.j quiz go` / `.j quiz start` - the initiator's starting gun for a parked
// (ready) quiz. Same permission rule as .quiz end: starter or admins.
async function confirmStart(sock, chatId, senderJid, botMarker, canUseAdminCommands) {
  const prefix = botConfig.getPrefix();
  const session = activeQuizzes.get(chatId);
  if (!session || !session.awaitingGo) {
    if (session) {
      return { handled: true, message: botMarker + `🎯 A quiz is already running here: *${session.title}* (question ${session.questionNo}/${plannedTotal(session)}).` };
    }
    return { handled: true, message: botMarker + `❌ No quiz is waiting to start here. Prepare one with \`${prefix} quiz ...\`` };
  }
  if (session.askedBy !== senderJid && !(await _canStartQuizFresh(senderJid))) {
    return { handled: true, message: botMarker + `🛑 Only ${mentionOf(session.askedBy)} - or a Quiz Mod / Global Mod - can start this quiz.`, mentions: [session.askedBy] };
  }
  if (session.readyTimerId) { clearTimeout(session.readyTimerId); session.readyTimerId = null; }
  session.awaitingGo = false;
  const head = session.readyHead || "";
  const introImage = session.readyIntroImage;
  session.readyHead = null;
  session.readyIntroImage = null;
  if (introImage && introImage.buf) {
    await sock.sendMessage(chatId, { image: introImage.buf, mimetype: introImage.mime, caption: BOT_SAFE(head) }).catch(async () => {
      await sock.sendMessage(chatId, { text: head }).catch(() => {});
    });
  } else {
    await sock.sendMessage(chatId, { text: head }).catch(() => {});
  }
  startSection(sock, chatId, session, 0);
  return { handled: true, silent: true };
}

async function launchQuizAsync(sock, chatId, senderJid, botMarker, m, parsed, senderName, smartGroqCall, prepArg = null) {
  const prefix = botConfig.getPrefix();
  // P3b: cancellable prep handle. `.quiz end` during prep must ABORT the
  // background worker, not just drop the lock - otherwise generation finishes
  // later and posts QUIZ STARTED into a group that was told it was cleaned up.
  // startQuiz/pickCandidate pass theirs in (created with the lock); a direct
  // call (tests) creates one here as a fallback.
  const prep = prepArg || createPrepHandle(chatId, senderJid);
  // this launch still owns the chat lock (endQuiz/TTL-reclaim may have freed it)
  const ownsLock = () => !prep.lockSince || lifecycle.get(chatId)?.since === prep.lockSince;
  const abortPrep = () => {
    stopPrepTimers(prep); // 2026-09-27: clears the 25s nudge AND the 60s heartbeat
    pendingPrep.delete(chatId);
    if (ownsLock()) releaseLifecycle(chatId); // never kill a NEWER launch's lock
  };
  // planning-mode pulse: one nudge at 25s, then every 60s until resolved
  startPrepHeartbeat(prep, sock, chatId, botMarker, parsed.randomMode ? "random mode" : parsed.title);
  prep.session = null;
  let ownsSlot = false; // P20: true only while this launch holds a generation slot

  try {
    // P20: bot-wide generation gate - FIFO wait when at cap, clear deferral
    // on queue timeout, never a silent drop. Released on EVERY exit below -
    // but ONLY if this launch actually received a slot (queued launches that
    // time out or are cancelled must not decrement someone else's slot).
    const gotSlot = await acquireGenSlot(prep);
    if (!gotSlot) {
      abortPrep();
      if (!prep.cancelled) {
        console.log("[Quiz] generation queue timeout - deferring launch");
        await sock.sendMessage(chatId, { text: botMarker + `⏳ The quiz generation queue is full right now - please try again in a few minutes.` }).catch(() => {});
      }
      return;
    }
    ownsSlot = true;

    const cfg = await quizConfigMod.buildQuizConfig(chatId, {
      count: parsed.count,
      difficulty: parsed.difficulty,
      categories: parsed.section ? [parsed.section] : null,
      images: parsed.images,
      audio: parsed.audio,
      randomMode: parsed.randomMode,
      requestedBy: senderJid,
    });
    // checkpoint 1: cancelled while building config
    if (prep.cancelled) { abortPrep(); return; }

    // ── 2026-09-27: standalone media modes (logos / song / audio) ──
    // No franchise resolution, no LLM: one media section is generated and
    // the normal READY/STARTED flow takes over.
    if (parsed.mode === "logos" || parsed.mode === "song" || parsed.mode === "audio") {
      const modeTitle = parsed.mode === "logos" ? "Logo Challenge" : parsed.mode === "song" ? "Spot the Song" : "Theme Song Challenge";
      const session = {
        cfg,
        title: modeTitle,
        wiki: null,
        anime: null,
        franchise: null,
        mediaType: parsed.mode,
        difficulty: cfg.difficulty,
        section: null,
        mode: parsed.mode,
        sections: [{
          name: modeTitle,
          domain: parsed.mode,
          perSection: cfg.questionCount,
          state: SECTION_STATES.GENERATING,
          questions: [],
          canCarryAudio: parsed.mode !== "logos",
        }],
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
        callLLM: null,
        animeCharacters: [],
        charIndex: null,
        otherTitles: [],
      };
      prep.session = session;
      if (prep.cancelled) { session.cancelled = true; abortPrep(); return; }
      const firstJob = ensureSectionGenerating(session, 0, sock, chatId);
      await firstJob;
      stopPrepTimers(prep);
      if (prep.cancelled || session.cancelled) { abortPrep(); return; }
      if (session.sections[0].state !== SECTION_STATES.READY || session.sections[0].questions.length < Math.min(3, session.sections[0].perSection)) {
        pendingPrep.delete(chatId);
        releaseLifecycle(chatId);
        await sock.sendMessage(chatId, {
          text: botMarker + `❌ Could not build a *${modeTitle}* quiz right now (not enough verified media). Try again in a minute.`,
        }, { quoted: m }).catch(() => {});
        return;
      }
      const totalQs = plannedTotal(session);
      let head = botMarker + `🎯 *QUIZ STARTED - ${modeTitle.toUpperCase()}* 🎯\n\n`;
      head += parsed.mode === "logos"
        ? `🏢 ${totalQs} logos • name the brand behind each one\n`
        : parsed.mode === "song"
          ? `🎵 ${totalQs} song clips • name the track behind each one\n`
          : `📺 ${totalQs} theme songs • name the show or movie behind each one\n`;
      head += `📚 ${cfg.difficulty.toUpperCase()} • ${POINTS[cfg.difficulty]} Zeni per correct (+20 speed bonus)\n`;
      head += `✍️ Answer with \`${prefix} <letter>\` or the option text - one answer per player per question\n`;
      head += `⏱ ${cfg.timePerQuestion}s per question\n`;
      head += `🛑 Cancel: \`${prefix} quiz end\`\n\n`;
      head += `Let's go! 🚀`;

      // 2026-09-27 planning mode: media modes ALWAYS park for the go command
      await parkReadySession(sock, chatId, session, { head, introImage: null, botMarker, m, senderJid, prefix });
      return;
    }

    const callLLM = normalizeSmartGroq(smartGroqCall);
    // 2026-09-27 PLANNING MODE: media quizzes announce themselves up front
    // ("make that known instead of just silently taking forever") and park
    // for `.j quiz go` once fully prepared (ready-gate below).
    // 2026-09-28: mixed random plans carry logo/song/picture sections -
    // announce + park them like every other media quiz.
    const mixedRandom = parsed.randomMode && cfg.questionCount >= 9;
    const mediaGate = cfg.imageQuestionCount > 0 || cfg.audioQuestionCount > 0 || mixedRandom;
    if (mediaGate) {
      const bits = [];
      if (mixedRandom) {
        // mirror buildRandomMixedPlan's math so the announcement is true
        const availChars = franchise ? !!franchise.characters?.length : true;
        let logosN = Math.min(6, Math.max(3, Math.round(cfg.questionCount * 0.2)));
        let songN = Math.min(5, Math.max(3, Math.round(cfg.questionCount * 0.15)));
        let imgN = cfg.imageQuestionCount > 0
          ? cfg.imageQuestionCount
          : Math.min(3, Math.max(2, Math.round(cfg.questionCount * 0.1)));
        if (!availChars) imgN = 0;
        const loreMin = Math.max(6, Math.ceil(cfg.questionCount * 0.4));
        while (cfg.questionCount - (logosN + songN + imgN) < loreMin) {
          if (logosN > 3) logosN--;
          else if (songN > 3) songN--;
          else if (imgN > 2) imgN--;
          else break;
        }
        bits.push(`🏢 ${logosN} logos`, `🎵 ${songN} song clips`);
        if (imgN > 0) bits.push(`🖼 ${imgN} pictures`);
        bits.push(`📚 lore from different worlds`);
      } else {
        if (cfg.imageQuestionCount > 0) bits.push(`🖼 ${cfg.imageQuestionCount} image question${cfg.imageQuestionCount > 1 ? "s" : ""}`);
        if (cfg.audioQuestionCount > 0) bits.push(`🎵 ${cfg.audioQuestionCount} audio question${cfg.audioQuestionCount > 1 ? "s" : ""}`);
      }
      await sock.sendMessage(chatId, {
        text: botMarker + `🛠 *QUIZ PLANNING* ${mentionOf(senderJid)}\nBuilding a ${cfg.questionCount}-question mixed quiz: ${bits.join(" • ")}.\nI'll tag you here the moment it's ready to start - the bot stays fully usable meanwhile.`,
        mentions: [senderJid],
      }, { quoted: m }).catch(() => {});
    }
    const franchise = await buildFranchiseContext(sock, chatId, botMarker, m, parsed);
    // checkpoint 2: cancelled during wiki/anime resolution (the slow network phase)
    if (prep.cancelled) { abortPrep(); return; }
    if (!franchise) {
      stopPrepTimers(prep);
      pendingPrep.delete(chatId);
      releaseLifecycle(chatId);
      return; // error already messaged
    }

    cfg.mediaType = franchise.mediaType || cfg.mediaType;
    cfg.imageQuestionCount = Math.max(0, Math.min(cfg.imageQuestionCount, franchise.hasImages ? cfg.imageQuestionCount : 0));
    // P24: intro-image fetch starts NOW (in parallel with section-1 generation)
    // instead of blocking the start card after generation completes.
    const introImagePromise = getFranchiseIntroImage(franchise.wiki, franchise.title).catch(() => null);
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
    prep.session = session; // cancellation now reaches the session too
    // if endQuiz fired while the session object was being built, honour it now
    if (prep.cancelled) { session.cancelled = true; abortPrep(); return; }

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
    // 💡 RANDOM ACROSS FICTION: the announced franchise plays the FIRST
    // LORE section (2026-09-28 mixed plans put the Logo Round first, and
    // logo/song sections never consume a franchise). Sections 2+ each draw
    // their own world inside generateSectionQuestions.
    if (parsed.randomMode) {
      const LORE_DOMAINS = new Set(["plot", "characters", "cosmology", "mixed", "production"]);
      const firstLore = session.sections.find((s) => LORE_DOMAINS.has(s.domain)) || session.sections[0];
      firstLore.franchise = {
        slug: franchise.slug, wiki: franchise.wiki, title: franchise.title,
        anime: franchise.anime, mediaType: franchise.mediaType,
        characters: franchise.characters || [], otherTitles: franchise.otherTitles || [],
      };
      if (franchise.slug && session.randomUsed) session.randomUsed.add(franchise.slug);
    }

    // P19: generate section 1 synchronously in the background worker (this
    // whole function IS the background), then stream the rest during play.
    const first = session.sections[0];
    first.state = SECTION_STATES.GENERATING;
    const job = ensureSectionGenerating(session, 0, sock, chatId);
    await job;

    stopPrepTimers(prep);
    // checkpoint 3: cancelled while section 1 was generating (the minutes-long phase)
    if (prep.cancelled || session.cancelled) { abortPrep(); return; }

    if (first.state !== SECTION_STATES.READY || first.questions.length < Math.min(3, first.perSection)) {
      // generation failed - release the lock, tell the group, never leave a zombie
      pendingPrep.delete(chatId);
      releaseLifecycle(chatId);
      await sock.sendMessage(chatId, {
        text: botMarker + `❌ Could not build a quiz for *${franchise.title}* (not enough lore data found). Try a better-known franchise.`,
      }, { quoted: m }).catch(() => {});
      return;
    }

    // P9: intro card with verified franchise image (graceful without).
    // P24: image was already downloading in parallel - just collect it.
    const introImage = await introImagePromise;
    // checkpoint 4 / FINAL GATE: cancelled while fetching the intro image, or
    // the chat was re-locked by a newer launch while this worker was paused -
    // a stale worker must NEVER post QUIZ STARTED over a newer prep.
    if (prep.cancelled || session.cancelled || !ownsLock()) { abortPrep(); return; }
    const totalQs = plannedTotal(session);
    let head = botMarker + `🎯 *QUIZ STARTED - ${parsed.randomMode ? "RANDOM • ACROSS FICTION" : String(franchise.title).toUpperCase()}* 🎯\n\n`;
    head += `📚 ${totalQs} questions • ${cfg.difficulty.toUpperCase()} • ${POINTS[cfg.difficulty]} Zeni per correct (+20 speed bonus)\n`;
    if (session.sections.length > 1) head += `📖 ${session.sections.length} sections\n`;
    if (parsed.section) head += `📚 Topic locked: ${parsed.section}\n`;
    head += `✍️ Answer with \`${prefix} <letter>\` or the option text - one answer per player per question\n`;
    head += `⏱ ${cfg.timePerQuestion}s per question\n`;
    head += `🛑 Cancel: \`${prefix} quiz end\`\n\n`;
    head += `Let's go! 🚀`;

    // 2026-09-27 PLANNING MODE ready-gate: media quizzes (images/audio/
    // logos/song) park here instead of auto-starting - the tagged initiator
    // fires the starting gun with `.j quiz go` when the group is ready.
    if (cfg.imageQuestionCount > 0 || cfg.audioQuestionCount > 0 || parsed.mode || mixedRandom) {
      await parkReadySession(sock, chatId, session, { head, introImage, botMarker, m, senderJid, prefix });
      return;
    }

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
    pendingPrep.delete(chatId); // prep phase over - handle no longer needed
    startSection(sock, chatId, session, 0);
  } catch (e) {
    stopPrepTimers(prep);
    pendingPrep.delete(chatId);
    if (!activeQuizzes.has(chatId) && ownsLock()) releaseLifecycle(chatId);
    console.log("[Quiz] launch failed:", e?.message);
    if (!prep.cancelled) {
      await sock.sendMessage(chatId, { text: botMarker + `❌ Quiz preparation failed (${String(e?.message || "error").slice(0, 80)}). Please try again.` }).catch(() => {});
    }
  } finally {
    if (ownsSlot) releaseGenSlot(); // P20: only a granted launch returns its slot
  }
}

// resolve the quiz's franchise context (title/wiki/anime/mediaType/characters)
// 💡 RANDOM ACROSS FICTION (owner brief §2): resolve ONE slug from the
// random pool into a full franchise context. Used for the quiz's first
// section AND for every further random section, so a multi-section random
// quiz spans many different worlds instead of one.
async function drawSectionFranchise(session) {
  const pool = session.randomPool && session.randomPool.length ? session.randomPool : [...RANDOM_POOL].sort(() => Math.random() - 0.5);
  if (!session.randomPool) session.randomPool = pool;
  if (!session.randomUsed) session.randomUsed = new Set();
  while (pool.length) {
    const slug = pool.shift();
    if (session.randomUsed.has(slug)) continue;
    session.randomUsed.add(slug);
    const wiki = await quizLore.resolveWiki(slug).catch(() => null);
    if (!wiki) continue;
    const titleGuess = slug.replace(/-/g, " ");
    const si = await quizLore.wikiApi(wiki, { action: "query", meta: "siteinfo", siprop: "sitename" }).catch(() => null);
    const site = String(si?.query?.sitename || "").replace(/\s*wiki$/i, "").trim() || (RANDOM_TITLES[slug] || titleGuess);
    const mediaDetect = await quizLore.detectMediaType(titleGuess).catch(() => ({ mediaType: "franchise" }));
    const anime = mediaDetect.mediaType === "anime" ? (await resolveAnime(titleGuess).catch(() => ({}))).anime : null;
    const characters = anime ? await fetchCharacters(anime).catch(() => []) : [];
    const otherTitles = RANDOM_POOL.filter((s) => s !== slug).sort(() => Math.random() - 0.5).slice(0, 6)
      .map((s) => RANDOM_TITLES[s] || s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    return {
      slug, usedAt: Date.now(),
      title: site, wiki, anime,
      mediaType: anime ? "anime" : mediaDetect.mediaType,
      characters,
      otherTitles,
      randomUsed: session.randomUsed,
    };
  }
  return null;
}

async function buildFranchiseContext(sock, chatId, botMarker, m, parsed) {
  // random mode: the FIRST section's franchise is drawn here; further sections
  // each draw their own via drawSectionFranchise (owner brief §2: "random
  // questions across all of fiction, not pick a random world and stay inside
  // it")
  if (parsed.randomMode) {
    const fctx = await drawSectionFranchise({ randomPool: [...RANDOM_POOL].sort(() => Math.random() - 0.5), randomUsed: new Set() }).catch(() => null);
    if (!fctx) return null;
    fctx.slug && fctx.randomUsed.add(fctx.slug);
    return { ...fctx, charIndex: null, hasImages: true, availability: null };
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
      pendingPicks.set(chatId, { choices: res.candidates, ts: Date.now(), askedBy: senderJid, opts: { count: parsed.count, difficulty: parsed.difficulty, section: parsed.section, images: parsed.images, audio: parsed.audio, randomMode: false } });
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

  // P22: media type detection ONCE, stored in the config context.
  // P24: media-type detection and character metadata are INDEPENDENT lookups -
  // run them concurrently (saves one serial API round-trip per quiz start).
  let mediaDetect, characters;
  if (anime) {
    const mdP = quizLore.detectMediaType(parsed.title).catch(() => ({ mediaType: "franchise" }));
    const chP = fetchCharacters(anime).catch(() => []);
    mediaDetect = await mdP;
    characters = await chP;
  } else {
    mediaDetect = await quizLore.detectMediaType(parsed.title).catch(() => ({ mediaType: "franchise" }));
    characters = [];
  }
  const mediaType = anime ? "anime" : (mediaDetect.mediaType === "franchise" ? (wiki ? "franchise" : "anime") : mediaDetect.mediaType);

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
  // 💡 START GATE (2026-09-27): the pick resolves into a quiz START - the
  // initiator or an authorized quiz starter must fire it.
  if (pending.askedBy && pending.askedBy !== senderJid && !(await _canStartQuizFresh(senderJid))) {
    return { handled: true, message: botMarker + `🛑 Only ${mentionOf(pending.askedBy)} - or a Quiz Mod / Global Mod - can pick and start this quiz.`, mentions: [pending.askedBy] };
  }
  const chosen = pending.choices[n - 1];
  pendingPicks.delete(chatId);
  // P3: pick now follows the same background/locked path as startQuiz
  if (!acquireLifecycle(chatId)) {
    return { handled: true, message: botMarker + `⏳ A quiz is already being prepared here - hang on a few seconds! 🎯` };
  }
  const prep = createPrepHandle(chatId, senderJid);
  await sock.sendMessage(chatId, { text: botMarker + `🎯 Gathering questions for your quiz... Please hold on.` }, { quoted: m }).catch(() => {});
  const parsed = { title: chosen.title, count: pending.opts.count, difficulty: pending.opts.difficulty, section: pending.opts.section || null, images: pending.opts.images || null, audio: pending.opts.audio || null, randomMode: false, notes: [] };
  // shortcut: we already know the anime - seed the resolution
  launchQuizAsync(sock, chatId, senderJid, botMarker, m, parsed, senderName, smartGroqCall, prep).catch((e) => {
    console.log("[Quiz] pick launch crashed:", e?.message);
    pendingPrep.delete(chatId);
    releaseLifecycle(chatId);
  });
  return { handled: true, silent: true };
}

async function endQuiz(sock, chatId, senderJid, botMarker, canUseAdminCommands) {
  const session = activeQuizzes.get(chatId);
  if (!session) {
    // P3b: a launch may still be generating in the background (no session yet,
    // only the lifecycle lock). Mark its prep handle cancelled so the worker
    // aborts at its next checkpoint - previously this branch only dropped the
    // lock and the worker went on to post QUIZ STARTED minutes later.
    const prep = pendingPrep.get(chatId);
    if (prep && !prep.cancelled) {
      if (prep.askedBy !== senderJid && !canUseAdminCommands && !_canManageQuiz(senderJid)) {
        return { handled: true, message: botMarker + `🛑 Only the quiz starter, admins or Quiz Mods can cancel the preparation.` };
      }
      prep.cancelled = true;
      if (prep.session) prep.session.cancelled = true;
      stopPrepTimers(prep);
      pendingPrep.delete(chatId);
      if (!prep.lockSince || lifecycle.get(chatId)?.since === prep.lockSince) releaseLifecycle(chatId);
      pumpGenGate(); // P20: wake a queued waiter if this prep was queued behind one
      console.log("[Quiz] prep cancelled via .quiz end");
      return { handled: true, message: botMarker + `🧹 Quiz preparation cancelled - nothing will start. You can begin a new one now.` };
    }
    // also release a stale "generating" lock so the group is never stuck
    if (lifecycle.has(chatId)) {
      releaseLifecycle(chatId);
      return { handled: true, message: botMarker + `🧹 A quiz was being prepared but got stuck - cleaned up. You can start a new one now.` };
    }
    return { handled: true, message: botMarker + `❌ No quiz running here.` };
  }
  if (session.askedBy !== senderJid && !canUseAdminCommands && !_canManageQuiz(senderJid)) {
    return { handled: true, message: botMarker + `🛑 Only the quiz starter, admins or Quiz Mods can end it early.` };
  }
  // 2026-09-27: a parked (ready-gate) quiz ends quietly - no finish card, no
  // scores, it never actually started.
  if (session.awaitingGo) {
    session.cancelled = true;
    if (session.readyTimerId) { clearTimeout(session.readyTimerId); session.readyTimerId = null; }
    session.awaitingGo = false;
    activeQuizzes.delete(chatId);
    releaseLifecycle(chatId);
    pendingPrep.delete(chatId);
    console.log("[Quiz] parked quiz cancelled via .quiz end");
    return { handled: true, message: botMarker + `🧹 The prepared *${session.title}* quiz was cancelled before starting. You can begin a new one now.` };
  }
  session.cancelled = true;
  pendingPrep.delete(chatId); // hygiene: a live session never has a prep handle
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

// P17: quizmod passthrough. Permission (2026-09-27): admins (legacy) OR
// Quiz Mods / Global Mods / owner via the engine-injected manage hook.
async function handleQuizMod(sock, chatId, senderJid, botMarker, args, canUseAdminCommands) {
  const allowed = canUseAdminCommands || _canManageQuiz(senderJid);
  return quizConfigMod.handleQuizMod(chatId, args, allowed, botConfig.getPrefix());
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
  confirmStart,
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
  _internal: { activeQuizzes, pendingPicks, lifecycle, revealAndAdvance, finishQuiz, postQuestion, startSection, ensureSectionGenerating, generateSectionQuestions, advanceToNextSection, mediaKeyFor, probeAvailability, launchQuizAsync, buildFranchiseContext, parkReadySession, READY_TTL_MS, genGate: { acquireGenSlot, releaseGenSlot, pumpGenGate, state: () => genGate, slots: () => GEN_SLOTS } },
};
