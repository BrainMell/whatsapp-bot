// ============================================
// QUIZ GAME - ANIME EDITION (.j quiz)
// Real anime data (AniList primary / Jikan fallback) + AI question generation
// (groq via injected smartGroqCall) with a deterministic fallback generator,
// per-question timing, first-correct scoring, Zeni rewards and persistent
// per-chat leaderboards (System KV).
// ============================================

const axios = require("axios");
const crypto = require("crypto");
const botConfig = require("../../botConfig");
const economy = require("../rpg/economy");
const system = require("../utils/system");

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
  if (typeof smartGroqCall !== "function") return [];
  const facts = {
    title: anime.title,
    romaji: anime.titleRomaji,
    type: anime.type,
    episodes: anime.episodes,
    year: anime.year,
    studio: anime.studio,
    genres: anime.genres,
    score: anime.score,
    synopsis: anime.synopsis,
    characters: characters.slice(0, 10).map((c) => ({ name: c.name, role: c.role, va: c.va })),
  };
  const prompt = `You are writing a multiple-choice anime quiz about ONE specific anime. Use ONLY the facts provided - do not invent facts you are not sure about.

ANIME FACTS (ground truth):
${JSON.stringify(facts, null, 1)}

Write ${count} ${difficulty}-difficulty multiple-choice questions about this anime.
Difficulty guide: easy = very famous basics any casual fan knows; medium = well-known plot/characters/production; hard = details (dates, names, minor characters, production specifics).
Rules:
- EVERY question must be answerable from the ground-truth facts above (or be universally known canon about this exact anime).
- Exactly 4 options each, exactly 1 correct, options short (under 60 chars), no "all of the above".
- Vary the topics: characters, voice actors, plot, production, numbers.
- No trick or opinion questions.

Reply with ONE JSON object ONLY: {"questions":[{"q":"...","options":["...","...","...","..."],"answer":"A"|"B"|"C"|"D","topic":"Characters"}]}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = await smartGroqCall({
        model: (MODELS && MODELS.FAST) || "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: "You output ONLY valid JSON. No markdown, no commentary." },
          { role: "user", content: prompt },
        ],
        temperature: attempt === 0 ? 0.7 : 0.4,
        max_tokens: 2600,
        response_format: { type: "json_object" },
      });
      const parsed = extractJsonObject(reply);
      const qs = coerceQuestions(parsed, difficulty);
      if (qs.length >= Math.min(count, 3)) return qs.slice(0, count);
    } catch (e) {
      console.log("[Quiz] AI generation attempt", attempt + 1, "failed:", e?.message);
    }
  }
  return [];
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

async function postQuestion(sock, chatId, session) {
  const q = session.questions[session.idx];
  session.qStartedAt = Date.now();
  session.claimedBy = null;
  await sock.sendMessage(chatId, {
    text: BOT_SAFE(formatQuestionCard(session, session.idx, q)),
  }).catch(() => {});
  // deadline timer (invalidated by session.token on end)
  session.timerId = setTimeout(async () => {
    try {
      const cur = activeQuizzes.get(chatId);
      if (!cur || cur.token !== session.token) return;
      await revealAndAdvance(sock, chatId, session, null, true);
    } catch (e) { console.log("[Quiz] deadline tick failed:", e?.message); }
  }, QUESTION_SECONDS * 1000);
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

  let out = `🏁 *QUIZ FINISHED - ${session.anime.title.toUpperCase()}*\n\n`;
  out += formatStandings(session) + "\n\n";
  const totalAnswered = session.revealed.filter((r) => r.winner).length;
  out += `📊 ${totalAnswered}/${session.questions.length} questions claimed\n`;
  out += `🎯 Difficulty: ${session.difficulty.toUpperCase()}\n`;

  // Zeni rewards: per-correct points were already computed on the fly;
  // award those plus the winner bonus.
  for (const e of entries) {
    await safeAddMoney(e.jid, e.points, `Quiz reward (${session.anime.title})`);
  }
  if (winner) {
    await safeAddMoney(winner.jid, WINNER_BONUS, "Quiz winner bonus");
    out += `\n👑 Winner: *${winner.name}* (+${WINNER_BONUS} bonus)\n`;
    out += `💰 All points paid out in Zeni!\n`;
  }
  out += `\nPlay again: \`${botConfig.getPrefix()} quiz "<anime>"\``;

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
  const out = { title: "", count: 10, difficulty: "medium", notes: [] };
  let rest = String(raw || "").trim();
  if (!rest) return out;
  const quoted = rest.match(/"([^"]{2,})"/);
  if (quoted) {
    out.title = quoted[1].trim();
    rest = (rest.slice(0, quoted.index) + " " + rest.slice(quoted.index + quoted[0].length)).trim();
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  const diffTokens = { easy: "easy", e: "easy", medium: "medium", m: "medium", normal: "medium", hard: "hard", h: "hard", insane: "hard" };
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

async function startQuiz(sock, chatId, senderJid, botMarker, m, rawArgs, senderName, smartGroqCall, MODELS) {
  if (activeQuizzes.has(chatId)) {
    const s = activeQuizzes.get(chatId);
    return {
      handled: true,
      message: botMarker + `🎯 A quiz is already running here: *${s.anime.title}* (question ${s.idx + 1}/${s.questions.length}).\nFinish it, or use \`${botConfig.getPrefix()} quiz end\` to cancel.`,
    };
  }

  const parsed = parseQuizArgs(rawArgs);
  if (!parsed.title) {
    const prefix = botConfig.getPrefix();
    return {
      handled: true,
      message: botMarker + `🎯 *Anime Quiz*

Start one:
\`${prefix} quiz "Fullmetal Alchemist Brotherhood"\`
\`${prefix} quiz "One Piece" 5 hard\`
\`${prefix} quiz fmab 10\`

Options:
• count: 1-${MAX_QUESTIONS} questions (default 10)
• difficulty: easy / medium / hard (default medium)

During the quiz, answer with \`${prefix} a <letter>\`. First correct answer wins the points!
Leaderboard: \`${prefix} quizboard\` • Cancel: \`${prefix} quiz end\``,
    };
  }

  const notes = parsed.notes.length ? `\n\n⚠️ ${parsed.notes.join(" ")}` : "";
  await sock.sendMessage(chatId, {
    text: botMarker + `🔍 Searching for *"${parsed.title}"*…${notes}`,
  }, { quoted: m }).catch(() => {});

  const res = await resolveAnime(parsed.title);
  if (res.error) {
    return { handled: true, message: botMarker + `❌ ${res.error}` };
  }

  // Ambiguous title -> numbered pick list (self-contained, no engine state)
  const top = res.anime;
  const second = res.candidates[1];
  const strongAuto =
    !second ||
    (top.popularity >= 100000 && second.popularity < top.popularity / 3) ||
    (top.synonyms || []).some((s) => s.toLowerCase() === parsed.title.toLowerCase()) ||
    (top.title || "").toLowerCase() === parsed.title.toLowerCase() ||
    (top.titleRomaji || "").toLowerCase() === parsed.title.toLowerCase();
  if (!strongAuto) {
    pendingPicks.set(chatId, { choices: res.candidates, ts: Date.now(), opts: { count: parsed.count, difficulty: parsed.difficulty } });
    let msg = botMarker + `🤔 *"${parsed.title}"* is ambiguous. Which one?\n\n`;
    res.candidates.forEach((c, i) => {
      msg += `*${i + 1}.* ${c.title} (${c.type}${c.year ? `, ${c.year}` : ""}) - ${c.popularity.toLocaleString()} members\n`;
    });
    msg += `\nReply: \`${botConfig.getPrefix()} quiz pick <number>\` (5 min)`;
    return { handled: true, message: msg };
  }

  return await launchWith(sock, chatId, senderJid, botMarker, m, top, parsed, senderName, smartGroqCall, MODELS);
}

async function launchWith(sock, chatId, senderJid, botMarker, m, anime, parsed, senderName, smartGroqCall, MODELS) {
  pendingPicks.delete(chatId);
  const prefix = botConfig.getPrefix();
  await sock.sendMessage(chatId, {
    text: botMarker + `✅ *${anime.title}* (${anime.type}${anime.year ? `, ${anime.year}` : ""})\n🧠 Generating ${parsed.count} ${parsed.difficulty} questions…`,
  }, { quoted: m }).catch(() => {});

  const characters = await fetchCharacters(anime);
  let questions = [];
  try {
    questions = await generateQuestionsWithAI(anime, characters, parsed.difficulty, parsed.count, smartGroqCall, MODELS);
  } catch (e) {
    console.log("[Quiz] AI path crashed:", e?.message);
    questions = [];
  }

  const animeKey = `${anime.source}:${anime.id}`;
  const { fresh, repeat } = partitionFresh(questions, animeKey);
  let chosen = shuffleQuestions(fresh);
  if (chosen.length < Math.min(parsed.count, 3)) {
    // not enough fresh AI questions -> top up with fallback, then repeats
    const fb = shuffleQuestions(buildFallbackQuestions(anime, characters, parsed.difficulty, parsed.count));
    const fbFresh = partitionFresh(fb, animeKey).fresh;
    chosen = [...chosen, ...fbFresh];
    if (chosen.length < Math.min(parsed.count, 3)) chosen = [...chosen, ...repeat];
    if (chosen.length < Math.min(parsed.count, 3)) chosen = [...chosen, ...fb];
  }
  chosen = chosen.slice(0, parsed.count);
  if (chosen.length < 3) {
    return {
      handled: true,
      message: botMarker + `❌ Could not build a quiz for *${anime.title}* (not enough ground-truth data). Try a better-known anime.`,
    };
  }
  saveSeen(animeKey, chosen.map((q) => qhash(q.q)));

  const session = {
    anime,
    difficulty: parsed.difficulty,
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

  let head = botMarker + `🎯 *QUIZ STARTED - ${anime.title.toUpperCase()}* 🎯\n\n`;
  head += `📚 ${chosen.length} questions • ${parsed.difficulty.toUpperCase()} • ${POINTS[parsed.difficulty]} Zeni per correct (+20 speed bonus)\n`;
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
  return await launchWith(sock, chatId, senderJid, botMarker, m, pending.choices[n - 1], { count: pending.opts.count, difficulty: pending.opts.difficulty, notes: [] }, senderName, smartGroqCall, MODELS);
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
    return { handled: true, message: botMarker + `🏆 No quiz scores here yet! Start one: \`${botConfig.getPrefix()} quiz "<anime>"\`` };
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
  anilistSearch,
  fetchCharacters,
  loadSeen,
  partitionFresh,
  saveSeen,
  loadScores,
  recordSessionResults,
  POINTS,
  QUESTION_SECONDS,
  MAX_QUESTIONS,
  _internal: { activeQuizzes, pendingPicks, generateQuestionsWithAI, revealAndAdvance, finishQuiz, postQuestion },
};
