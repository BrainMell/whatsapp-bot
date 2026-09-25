// ============================================
// QUIZ GAME - LORE EDITION (.j quiz)
// 2026-09-25 OVERHAUL: questions are generated from the franchise's FANDOM
// WIKI (MediaWiki API, targeted section retrieval) via RAG - they test the
// show/game/comic's STORY, CHARACTERS, COSMOLOGY and WORLD-building, not
// production metadata. Weighted domains: 45% plot, 35% characters,
// 15% cosmology/powerscaling, 5% production. -s/--section forces a domain.
// Images/audio spawn dynamically from the chosen lore when a REAL asset
// exists. Groq provides the LLM step (injected smartGroqCall) with a
// deterministic fallback. Sessions, answers, rewards, dedup and the
// persistent per-chat leaderboard are unchanged.
// ============================================

const axios = require("axios");
const crypto = require("crypto");
const botConfig = require("../../botConfig");
const economy = require("../rpg/economy");
const system = require("../utils/system");
const quizLore = require("./quizLore"); // 📖 Fandom lore retrieval + RAG helpers (2026-09-25)

// ── state ──
// One active quiz per chat (Map keyed by chatId). Sessions are in-memory,
// like tictactoe/wordle: a restart clears them, which is safe.
const activeQuizzes = new Map(); // chatId -> session
const pendingPicks = new Map(); // chatId -> { choices: [...], ts, opts: {count, difficulty} }

const QUESTION_SECONDS = 30;
const NEXT_DELAY_MS = 4500;
const PICK_TTL_MS = 5 * 60 * 1000;
const MAX_QUESTIONS = 15;
const POINTS = { easy: 50, medium: 100, hard: 150 };
const WINNER_BONUS = 250;
const LETTERS = ["A", "B", "C", "D"];

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
// QUESTION GENERATION
// ════════════════════════════════════════════

function qhash(stem) {
  return crypto.createHash("sha1").update(String(stem).toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
}

// Extract the first complete JSON object from a possibly messy LLM reply
// (same philosophy as debate.extractVerdictJson: fence strip -> whole parse
// -> balanced scan -> truncate-repair).
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
  // last resort: close truncated JSON
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
    });
  }
  return out;
}

// Deterministic questions straight from ground-truth facts - the quiz must
// work even when the AI is down / returns garbage.
function buildFallbackQuestions(anime, characters, difficulty, count) {
  const qs = [];
  const wrong = (pool, correct, n) => {
    const poolUniq = [...new Set(pool.filter((x) => x && String(x).toLowerCase() !== String(correct).toLowerCase()))];
    const shuffled = poolUniq.sort(() => Math.random() - 0.5).slice(0, n);
    return shuffled;
  };
  const push = (stem, correct, distractors, topic) => {
    if (!correct || distractors.length < 3) return;
    const options = [String(correct), ...distractors.map(String)];
    const order = options.map((_, i) => i).sort(() => Math.random() - 0.5);
    qs.push({
      q: stem,
      options: order.map((i) => options[i]),
      correct: order.indexOf(0),
      difficulty,
      topic,
    });
  };

  if (characters.length >= 4) {
    const withVA = characters.filter((c) => c.va);
    for (const c of withVA.slice(0, 4)) {
      push(
        `In ${anime.title}, who is the voice actor of ${c.name}?`,
        c.va,
        wrong(withVA.filter((x) => x.name !== c.name).map((x) => x.va), c.va, 3),
        "Voice actors",
      );
    }
    const names = characters.map((c) => c.name);
    for (const c of characters.slice(0, 3)) {
      push(
        `Which of these characters appears in ${anime.title}?`,
        c.name,
        wrong(["Askeladd", "Mikasa Ackerman", "Light Yagami", "Rintarou Okabe", "Saitama", "Tanjiro Kamado", "L Lawliet", "Violet Evergarden", "Gon Freecss", "Erza Scarlet"], c.name, 3),
        "Characters",
      );
    }
    const mains = characters.filter((c) => c.role === "main");
    if (mains.length) {
      push(
        `Who is a MAIN character in ${anime.title}?`,
        mains[0].name,
        wrong(names.filter((n) => n !== mains[0].name), mains[0].name, 3),
        "Characters",
      );
    }
  }
  if (anime.studio) {
    push(
      `Which studio animated ${anime.title}?`,
      anime.studio,
      wrong(["Studio Ghibli", "MAPPA", "Ufotable", "Kyoto Animation", "Madhouse", "Wit Studio", "Toei Animation", "A-1 Pictures", "Shaft", "Production I.G"], anime.studio, 3),
      "Studios",
    );
  }
  if (anime.episodes) {
    push(
      `How many episodes does ${anime.title} have?`,
      String(anime.episodes),
      wrong([String(anime.episodes + 12), String(Math.max(1, anime.episodes - 13)), String(anime.episodes + 24), String(Math.max(1, anime.episodes - 5)), String(anime.episodes + 1)], String(anime.episodes), 3),
      "Facts",
    );
  }
  if (anime.year) {
    push(
      `What year did ${anime.title} premiere?`,
      String(anime.year),
      wrong([String(anime.year + 1), String(anime.year - 1), String(anime.year + 3), String(anime.year - 4)], String(anime.year), 3),
      "Facts",
    );
  }
  if (anime.genres && anime.genres.length) {
    push(
      `Which of these is a genre of ${anime.title}?`,
      anime.genres[0],
      wrong(["Mecha", "Sports", "Psychological", "Isekai", "Slice of Life", "Music", "Horror", "Romance"], anime.genres[0], 3),
      "Genres",
    );
  }
  // dedupe by stem, cap at count
  const seen = new Set();
  return qs.filter((q) => {
    const k = qhash(q.q);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, count);
}

async function generateQuestionsWithAI(anime, characters, difficulty, count, smartGroqCall, MODELS) {
  // legacy entry point kept for compatibility/tests - wraps the lore pipeline
  // with the anime's own title. New code calls generateLoreQuestions directly.
  const wiki = await quizLore.resolveWiki(anime.titleRomaji || anime.title || "").catch(() => null);
  if (!wiki) return [];
  return generateLoreQuestions(
    wiki, anime.title, difficulty, count, null, characters,
    normalizeSmartGroq(smartGroqCall),
  );
}

// ── LLM adapter: engine's smartGroqCall returns the RAW Groq response object
// (a long-standing bug made quiz.js feed that object straight into JSON
// parsing, so the AI path silently NEVER worked and every quiz fell back to
// the VA/studio generator). normalizeSmartGroq accepts a response object,
// a string, or {content} and always yields text.
function normalizeSmartGroq(smartGroqCall) {
  if (typeof smartGroqCall !== "function") return null;
  return async (opts) => {
    const r = await smartGroqCall(opts);
    return quizLore.normalizeLLMReply(r);
  };
}

// ════════════════════════════════════════════
// LORE QUESTION PIPELINE (2026-09-25)
// per-question: plan domain -> retrieve Fandom section -> RAG (Groq) ->
// strict JSON -> attach to the session. Media attaches lazily at post time.
// ════════════════════════════════════════════

async function generateLoreQuestions(wiki, franchiseTitle, difficulty, count, sectionOverride, animeCharacters, callLLM) {
  const plan = quizLore.buildQuestionPlan(count, difficulty, sectionOverride);
  const usedKeys = new Set();
  let buckets = null;
  if (plan.includes("characters")) {
    try { buckets = await quizLore.buildCharacterIndex(wiki, franchiseTitle, animeCharacters || []); } catch { buckets = null; }
  }
  const questions = [];
  for (let i = 0; i < plan.length; i++) {
    const domain = plan[i];
    let generated = null;
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
      const out = await quizLore.generateLoreQuestion(callLLM, franchiseTitle, lore, domain, difficulty);
      if (out) {
        generated = out.question;
        generated.promptTok = out.promptTok;
        generated.loreRef = { wiki, page: lore.page, section: lore.section };
        console.log(`[Quiz] Q${questions.length + 1} ${domain}/${difficulty} ctx=${out.promptTok}tok src=${lore.page}/${lore.section}`);
      }
    }
    if (generated) questions.push(generated);
  }
  return questions;
}

// ── lazy media attachment (spec: media spawns from ANY domain when a real
// asset exists; image = question in the caption, audio = played before the
// question). Cached per wiki-page so a session never re-downloads.
const _mediaCache = new Map();

async function attachMedia(q) {
  if (!q || !q.loreRef || !q.loreRef.wiki || !q.loreRef.page) return null;
  const key = `${q.loreRef.wiki}:${q.loreRef.page}`;
  let entry = _mediaCache.get(key);
  if (!entry) {
    entry = { triedAt: 0, image: null, audio: null };
    const [img, audio] = await Promise.all([
      quizLore.getPageImage(q.loreRef.wiki, q.loreRef.page).catch(() => null),
      // audio is rare on Fandom - hunt only for character pages, cheap guard
      q.domain === "characters" && Math.random() < 0.5
        ? quizLore.findAudioForPage(q.loreRef.wiki, q.loreRef.page).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (img) entry.image = await quizLore.downloadMedia(img.url, "image").catch(() => null);
    entry.audio = audio; // already verified bytes inside findAudioForPage
    entry.triedAt = Date.now();
    _mediaCache.set(key, entry);
    if (_mediaCache.size > 120) _mediaCache.delete(_mediaCache.keys().next().value);
  }
  if (entry.audio) return { kind: "audio", buf: entry.audio.buf, mime: entry.audio.mime };
  if (entry.image) return { kind: "image", buf: entry.image.buf, mime: entry.image.mime };
  return null;
}

// ════════════════════════════════════════════
// DEDUP (persistent, per anime)
// Per-anime KV keys (not one big map) so concurrent chats/instances never
// clobber each other's seen-lists on read-modify-write.
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
// PERSISTENT SCOREBOARD
// Per-chat KV keys - same clobber-safety argument as the seen lists.
// ════════════════════════════════════════════

const _scoreKey = (chatId) => `quiz_scores:${chatId}`;

function loadScores(chatId) {
  if (chatId) return system.get(_scoreKey(chatId), {});
  return system.get(_scoreKey("global"), {}); // not used for writes
}

function saveScores(chatId, scores) {
  system.set(_scoreKey(chatId), scores);
}

function recordSessionResults(chatId, entries, winnerJid) {
  // entries: [{jid, name, correct, points}]
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
// LIVE SESSION
// ════════════════════════════════════════════

function getSession(chatId) {
  return activeQuizzes.get(chatId) || null;
}

function hasActive(chatId) {
  return activeQuizzes.has(chatId);
}

function shuffleQuestions(qs) {
  return [...qs].sort(() => Math.random() - 0.5);
}

function formatQuestionCard(session, idx, q) {
  const prefix = botConfig.getPrefix();
  let s = `🎯 *QUESTION ${idx + 1}/${session.questions.length}*  •  ${q.topic}  •  ${q.difficulty.toUpperCase()}\n\n`;
  s += `*${q.q}*\n\n`;
  q.options.forEach((o, i) => { s += `${LETTERS[i]}. ${o}\n`; });
  s += `\n⏱ ${QUESTION_SECONDS}s  •  first correct wins ${POINTS[q.difficulty]} Zeni\n`;
  s += `Answer with: \`${prefix} a <letter>\``;
  return s;
}

// audio questions: the clip plays first, then the question card (spec §7)
async function postQuestion(sock, chatId, session) {
  const q = session.questions[session.idx];
  session.qStartedAt = Date.now();
  session.claimedBy = null;
  const card = formatQuestionCard(session, session.idx, q);
  // lazy media attach (only when a REAL verified asset exists - else text)
  if (!q.mediaTried) {
    q.mediaTried = true;
    try { q.media = await attachMedia(q); } catch { q.media = null; }
  }
  if (q.media && q.media.kind === "image") {
    // question lives in the image caption (spec §6)
    await sock.sendMessage(chatId, {
      image: q.media.buf,
      mimetype: q.media.mime,
      caption: BOT_SAFE(card),
    }).catch(async () => {
      // broken media must never kill the question - text fallback
      await sock.sendMessage(chatId, { text: BOT_SAFE(card) }).catch(() => {});
    });
  } else {
    if (q.media && q.media.kind === "audio") {
      await sock.sendMessage(chatId, {
        audio: q.media.buf,
        mimetype: q.media.mime,
        ptt: false,
      }).catch(() => {}); // clip fails -> card still carries the question
    }
    await sock.sendMessage(chatId, { text: BOT_SAFE(card) }).catch(() => {});
  }
  // deadline timer (invalidated by session.token on end)
  session.timerId = setTimeout(async () => {
    try {
      const cur = activeQuizzes.get(chatId);
      if (!cur || cur.token !== session.token) return;
      await revealAndAdvance(sock, chatId, session, null, true);
    } catch (e) { console.log("[Quiz] deadline tick failed:", e?.message); }
  }, QUESTION_SECONDS * 1000);
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

// BOT_MARKER comes from the engine as a zero-width prefix; keep a module
// constant instead of importing engine (avoid circular require).
const MARKER = "\u200B";
function BOT_SAFE(text) { return MARKER + text; }

async function revealAndAdvance(sock, chatId, session, winner, timedOut) {
  if (session.timerId) { clearTimeout(session.timerId); session.timerId = null; }
  const q = session.questions[session.idx];
  const correctText = `${LETTERS[q.correct]}. ${q.options[q.correct]}`;

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
    await sock.sendMessage(chatId, {
      text: BOT_SAFE(`⏰ *Time's up!* Nobody got it.\nThe answer was: *${correctText}*`),
    }).catch(() => {});
  } else {
    // wrong-answer close-out never happens (only timeout or correct close a question)
  }

  session.idx += 1;
  if (session.idx >= session.questions.length) {
    await finishQuiz(sock, chatId, session);
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

async function finishQuiz(sock, chatId, session) {
  activeQuizzes.delete(chatId);
  session.token += 1;
  if (session.timerId) clearTimeout(session.timerId);
  if (session.nextTimerId) clearTimeout(session.nextTimerId);

  const entries = [...session.scores.entries()]
    .map(([jid, s]) => ({ jid, ...s }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct);
  const winner = entries[0] || null;

  let out = `🏁 *QUIZ FINISHED - ${String(session.title || session.anime?.title || "QUIZ").toUpperCase()}*\n\n`;
  out += formatStandings(session) + "\n\n";
  const totalAnswered = session.revealed.filter((r) => r.winner).length;
  out += `📊 ${totalAnswered}/${session.questions.length} questions claimed\n`;
  out += `🎯 Difficulty: ${session.difficulty.toUpperCase()}\n`;

  // Zeni rewards: per-correct points were already computed on the fly;
  // award those plus the winner bonus.
  for (const e of entries) {
    await safeAddMoney(e.jid, e.points, `Quiz reward (${session.title || session.anime?.title || "quiz"})`);
  }
  if (winner) {
    await safeAddMoney(winner.jid, WINNER_BONUS, "Quiz winner bonus");
    out += `\n👑 Winner: *${winner.name}* (+${WINNER_BONUS} bonus)\n`;
    out += `💰 All points paid out in Zeni!\n`;
  }
  out += `\nPlay again: \`${botConfig.getPrefix()} quiz "<title>"\``;

  recordSessionResults(chatId, entries, winner ? winner.jid : null);
  await sock.sendMessage(chatId, { text: out }).catch(() => {});
}

// ════════════════════════════════════════════
// HANDLERS
// ════════════════════════════════════════════

function parseQuizArgs(raw) {
  // raw = everything after ".j quiz". Supports:
  //   quiz "Fullmetal Alchemist Brotherhood" 10 hard
  //   quiz fmab 5 easy
  //   quiz "One Piece"
  //   quiz "Dragon Ball" 3 hard -s cosmology
  //   quiz "Re:Zero" 5 medium --section characters
  const out = { title: "", count: 10, difficulty: "medium", section: null, notes: [] };
  let rest = String(raw || "").trim();
  if (!rest) return out;
  const quoted = rest.match(/"([^"]{2,})"/);
  if (quoted) {
    out.title = quoted[1].trim();
    rest = (rest.slice(0, quoted.index) + " " + rest.slice(quoted.index + quoted[0].length)).trim();
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  const diffTokens = { easy: "easy", e: "easy", medium: "medium", m: "medium", normal: "medium", hard: "hard", h: "hard", insane: "hard" };
  // pop -s/--section <domain> first (may sit anywhere after the title)
  for (let i = 0; i < tokens.length - 0; i++) {
    const t = tokens[i].toLowerCase();
    if ((t === "-s" || t === "--section" || t === "--topic") && tokens[i + 1]) {
      const dom = tokens[i + 1].toLowerCase();
      const mapped = quizLore.SECTION_ALIASES[dom];
      if (mapped) out.section = mapped;
      else out.notes.push(`Unknown section "${tokens[i + 1]}" - valid: plot, characters, cosmology, powerscaling, production.`);
      tokens.splice(i, 2);
      i--;
    }
  }
  // pop trailing difficulty/count tokens
  while (tokens.length) {
    const last = tokens[tokens.length - 1].toLowerCase();
    if (tokens.length && /^\d{1,2}$/.test(last)) {
      const n = parseInt(last, 10);
      if (n < 1) { out.notes.push(`Count must be at least 1 - using 1.`); out.count = 1; }
      else if (n > MAX_QUESTIONS) { out.notes.push(`Max ${MAX_QUESTIONS} questions per quiz - using ${MAX_QUESTIONS}.`); out.count = MAX_QUESTIONS; }
      else out.count = n;
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
    // no quoted title: the bare tokens ARE the title
    out.title = tokens.join(" ").trim();
  } else if (tokens.length) {
    // quoted title wins; any leftover bare tokens were neither count nor
    // difficulty - note them instead of silently mangling the title
    out.notes.push(`Ignored extra words after the quoted title: "${tokens.join(" ")}".`);
  }
  return out;
}

// resolve a user-typed title to a franchise: Fandom wiki FIRST (lore source),
// AniList for anime display metadata + character popularity. Wiki relevance is
// validated so "Unknown Franchise XYZ" never resolves to a wrong wiki.
async function resolveFranchise(query) {
  let wiki = null;
  let wikiValidated = false;
  try { wiki = await quizLore.resolveWiki(query); } catch { wiki = null; }
  if (wiki) {
    // relevance check: the wiki must have content matching the title
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
        // sitename contains the title? ("Re:Zero Wiki")
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
  // try the wiki by the anime's canonical titles/synonyms
  for (const t of [top.titleRomaji, top.title, ...(top.synonyms || [])]) {
    if (!t) continue;
    const s = await quizLore.resolveWiki(t).catch(() => null);
    if (s) return { wiki: s, anime: top, candidates: res.candidates };
  }
  // anime with no wiki at all: metadata-only quiz (fallback questions)
  return { anime: top, candidates: res.candidates, wiki: null };
}

async function startQuiz(sock, chatId, senderJid, botMarker, m, rawArgs, senderName, smartGroqCall, MODELS) {
  if (activeQuizzes.has(chatId)) {
    const s = activeQuizzes.get(chatId);
    return {
      handled: true,
      message: botMarker + `🎯 A quiz is already running here: *${s.title}* (question ${s.idx + 1}/${s.questions.length}).\nFinish it, or use \`${botConfig.getPrefix()} quiz end\` to cancel.`,
    };
  }

  const parsed = parseQuizArgs(rawArgs);
  if (!parsed.title) {
    const prefix = botConfig.getPrefix();
    return {
      handled: true,
      message: botMarker + `🎯 *Lore Quiz*

Test your knowledge of a show, game or comic - its story, characters, cosmology and world-building.

Start one:
\`${prefix} quiz "Fullmetal Alchemist Brotherhood"\`
\`${prefix} quiz "One Piece" 5 hard\`
\`${prefix} quiz "Elden Ring" 5 hard -s cosmology\`

Options:
• count: 1-${MAX_QUESTIONS} questions (default 10)
• difficulty: easy / medium / hard (default medium)
• section (optional): \`-s plot\` / \`-s characters\` / \`-s cosmology\` / \`-s powerscaling\` / \`-s production\` forces all questions into that topic

During the quiz, answer with \`${prefix} a <letter>\`. First correct answer wins the points!
Leaderboard: \`${prefix} quizboard\` • Cancel: \`${prefix} quiz end\``,
    };
  }

  const notes = parsed.notes.length ? `\n\n⚠️ ${parsed.notes.join(" ")}` : "";
  await sock.sendMessage(chatId, {
    text: botMarker + `🔍 Searching for *"${parsed.title}"*…${notes}`,
  }, { quoted: m }).catch(() => {});

  const res = await resolveFranchise(parsed.title);
  if (res.error) {
    const friendly = res.error.includes("No anime found")
      ? `Couldn't find a Fandom wiki or anime entry for "${parsed.title}". Check the spelling, or try the franchise's common name.`
      : res.error;
    return { handled: true, message: botMarker + `❌ ${friendly}` };
  }

  // Anime pick flow only when the franchise could not be resolved directly
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
      pendingPicks.set(chatId, { choices: res.candidates, ts: Date.now(), opts: { count: parsed.count, difficulty: parsed.difficulty, section: parsed.section } });
      let msg = botMarker + `🤔 *"${parsed.title}"* is ambiguous. Which one?\n\n`;
      res.candidates.forEach((c, i) => {
        msg += `*${i + 1}.* ${c.title} (${c.type}${c.year ? `, ${c.year}` : ""}) - ${c.popularity.toLocaleString()} members\n`;
      });
      msg += `\nReply: \`${botConfig.getPrefix()} quiz pick <number>\` (5 min)`;
      return { handled: true, message: msg };
    }
  }

  return await launchWith(sock, chatId, senderJid, botMarker, m, res, parsed, senderName, smartGroqCall, MODELS);
}

async function launchWith(sock, chatId, senderJid, botMarker, m, franchise, parsed, senderName, smartGroqCall, MODELS) {
  pendingPicks.delete(chatId);
  const prefix = botConfig.getPrefix();
  const callLLM = normalizeSmartGroq(smartGroqCall);

  // anime metadata (display title + character popularity) is optional but we
  // try it even for wiki-resolved franchises (powers fallback questions +
  // AniList favourites for the character popularity index)
  let anime = franchise.anime || null;
  if (!anime) {
    try {
      const r2 = await resolveAnime(parsed.title);
      if (r2.anime) { anime = r2.anime; franchise.anime = anime; franchise.candidates = r2.candidates; }
    } catch { /* metadata is optional */ }
  }
  let title = anime?.title || parsed.title;
  if (!anime && franchise.wiki) {
    // derive a clean display title from the wiki's sitename
    try {
      const si = await quizLore.wikiApi(franchise.wiki, { action: "query", meta: "siteinfo", siprop: "sitename" });
      const site = String(si?.query?.sitename || "").replace(/\s*wiki$/i, "").trim();
      if (site) title = site;
    } catch { /* keep parsed title */ }
  }

  await sock.sendMessage(chatId, {
    text: botMarker + `✅ *${title}*${parsed.section ? `\n📚 Section locked: *${parsed.section}*` : ""}\n🧠 Generating ${parsed.count} ${parsed.difficulty} lore questions…`,
  }, { quoted: m }).catch(() => {});

  // character popularity data (AniList favourites when it's an anime)
  const characters = anime ? await fetchCharacters(anime) : [];

  let questions = [];
  if (franchise.wiki) {
    try {
      questions = await generateLoreQuestions(
        franchise.wiki, title, parsed.difficulty, parsed.count, parsed.section,
        characters, callLLM,
      );
    } catch (e) {
      console.log("[Quiz] lore pipeline crashed:", e?.message);
      questions = [];
    }
  }

  const seenKey = franchise.wiki
    ? `wiki:${franchise.wiki}`
    : `${anime?.source || "x"}:${anime?.id || parsed.title}`;
  if (!anime && franchise.wiki) {
    // non-anime franchise: synthesize minimal metadata for the fallback generator
    anime = { title, titleRomaji: title, type: "Franchise", episodes: null, year: null, studio: null, genres: [], synopsis: "", source: "wiki", id: franchise.wiki };
  }

  const { fresh, repeat } = partitionFresh(questions, seenKey);
  let chosen = shuffleQuestions(fresh);
  if (chosen.length < Math.min(parsed.count, 3)) {
    // not enough fresh lore questions -> top up with fallback, then repeats
    const fb = shuffleQuestions(buildFallbackQuestions(anime, characters, parsed.difficulty, parsed.count));
    const fbFresh = partitionFresh(fb, seenKey).fresh;
    chosen = [...chosen, ...fbFresh];
    if (chosen.length < Math.min(parsed.count, 3)) chosen = [...chosen, ...repeat];
    if (chosen.length < Math.min(parsed.count, 3)) chosen = [...chosen, ...fb];
  }
  chosen = chosen.slice(0, parsed.count);
  if (chosen.length < 3) {
    return {
      handled: true,
      message: botMarker + `❌ Could not build a quiz for *${title}* (not enough lore data found). Try a better-known franchise.`,
    };
  }
  saveSeen(seenKey, chosen.map((q) => qhash(q.q)));

  const session = {
    title,
    wiki: franchise.wiki || null,
    anime,
    difficulty: parsed.difficulty,
    section: parsed.section || null,
    questions: chosen,
    idx: 0,
    scores: new Map(),
    revealed: [],
    askedBy: senderJid,
    askedByName: senderName,
    startedAt: Date.now(),
    token: 0,
    timerId: null,
    nextTimerId: null,
    qStartedAt: Date.now(),
    claimedBy: null,
  };
  activeQuizzes.set(chatId, session);

  let head = botMarker + `🎯 *QUIZ STARTED - ${String(title).toUpperCase()}* 🎯\n\n`;
  head += `📚 ${chosen.length} questions • ${parsed.difficulty.toUpperCase()} • ${POINTS[parsed.difficulty]} Zeni per correct (+20 speed bonus)\n`;
  if (parsed.section) head += `📚 Topic locked: ${parsed.section}\n`;
  head += `✍️ Answer with \`${prefix} a <letter>\` (A/B/C/D) - first correct answer wins\n`;
  head += `⏱ ${QUESTION_SECONDS}s per question\n`;
  head += `🛑 Cancel: \`${prefix} quiz end\`\n\n`;
  head += `Let's go! 🚀`;
  await sock.sendMessage(chatId, { text: head }, { quoted: m }).catch(() => {});
  await postQuestion(sock, chatId, session);
  return { handled: true, silent: true };
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
  // re-resolve the wiki for the picked anime (launchWith is franchise-shaped now)
  const franchise = { anime: chosen, candidates: pending.choices, wiki: null };
  for (const t of [chosen.titleRomaji, chosen.title, ...(chosen.synonyms || [])]) {
    if (!t) continue;
    const s = await quizLore.resolveWiki(t).catch(() => null);
    if (s) { franchise.wiki = s; break; }
  }
  return await launchWith(sock, chatId, senderJid, botMarker, m, franchise, { count: pending.opts.count, difficulty: pending.opts.difficulty, section: pending.opts.section || null, notes: [] }, senderName, smartGroqCall, MODELS);
}

async function endQuiz(sock, chatId, senderJid, botMarker, canUseAdminCommands) {
  const session = activeQuizzes.get(chatId);
  if (!session) return { handled: true, message: botMarker + `❌ No quiz running here.` };
  if (session.askedBy !== senderJid && !canUseAdminCommands) {
    return { handled: true, message: botMarker + `🛑 Only the quiz starter or admins can end it early.` };
  }
  if (session.nextTimerId) clearTimeout(session.nextTimerId);
  await finishQuiz(sock, chatId, session);
  return { handled: true, silent: true };
}

async function handleAnswer(sock, chatId, senderJid, answerText, botMarker, m, senderName) {
  const session = activeQuizzes.get(chatId);
  if (!session) return { handled: false }; // no quiz -> let other handlers run
  const q = session.questions[session.idx];
  if (!q || session.claimedBy) return { handled: true, silent: true };

  const raw = String(answerText || "").trim();
  let idx = LETTERS.indexOf(raw.toUpperCase());
  if (idx < 0) {
    // accept full option text too
    idx = q.options.findIndex((o) => o.toLowerCase() === raw.toLowerCase());
  }
  if (idx < 0) {
    await sock.sendMessage(chatId, { react: { text: "🤔", key: m.key } }).catch(() => {});
    return { handled: true, silent: true };
  }
  if (idx === q.correct) {
    session.claimedBy = { jid: senderJid, name: senderName || "Player" };
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } }).catch(() => {});
    await revealAndAdvance(sock, chatId, session, session.claimedBy, false);
  } else {
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } }).catch(() => {});
  }
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

module.exports = {
  hasActive,
  getSession,
  startQuiz,
  pickCandidate,
  endQuiz,
  handleAnswer,
  showLeaderboard,
  // test surface:
  parseQuizArgs,
  coerceQuestions,
  extractJsonObject,
  buildFallbackQuestions,
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
  attachMedia,
  normalizeSmartGroq,
  POINTS,
  QUESTION_SECONDS,
  MAX_QUESTIONS,
  _internal: { activeQuizzes, pendingPicks, generateQuestionsWithAI, revealAndAdvance, finishQuiz, postQuestion },
};
