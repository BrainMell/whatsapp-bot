// 💡 PROJECT REALGUY (owner 2026-10-20: "buff him up to seem like a real guy")
// Layered humanization for the existing Groq chatbot (docs/chat/context_engine.md):
//   L1 TRIGGER    — direct (mention/reply/name, engine-side) + AMBIENT rolls so
//                   the persona "feels like" chiming in on its own, with
//                   per-chat cooldowns + rate caps + one-in-flight guard.
//   L2 MEMORY     — per-chat ring buffer of live group chatter (ambient
//                   awareness) + long-term people-facts via the shared system
//                   KV (Mongo-backed, `_shared_persona_facts`).
//   L3 PERSONA    — strong human system prompt: real-guy voice rules, energy
//                   mirroring, honest uncertainty, anti-AI-isms, language match.
//   L4 TOOLS      — weak-model function calling via inline tags it can emit
//                   "when it feels like it": [SEARCH: q] → keyless web backends
//                   (Bing RSS → DDG-lite → Wikipedia, same parsers as .j
//                   google) and [REMEMBER: name | fact]. One tool round max,
//                   then the final casual answer.
//   L5 REALISM    — composing presence → typing delay scaled to length →
//                   chunked short sends (1-3 bubbles) → paused presence.
//   L6 RESILIENCE — SILENT retries everywhere (owner: "if you send a message
//                   and it doesn't work instead of telling the user that, just
//                   try again 2 more times in the background"): every send gets
//                   1 + 2 background retries, the whole turn gets 1 + 2, and
//                   the user is NEVER shown an error.
// No engine require at top level — everything is dependency-injected so the
// QA harness (scripts/qa_persona.js) can run with stubs, no DB, no net.

// ─── Tunables ────────────────────────────────────────────────────────────────
const AMBIENT_CHANCE = 0.06; // roll per eligible group message (no direct trigger)
const AMBIENT_MIN_WORDS = 3;
const AMBIENT_COOLDOWN_MS = 3 * 60 * 1000; // per chat between ambient chimes
const AMBIENT_WINDOW_MS = 10 * 60 * 1000;
const AMBIENT_MAX_PER_WINDOW = 3; // hard cap per chat per window
const BUFFER_CAP = 25; // per-chat chatter ring buffer
const TRANSCRIPT_LINES = 12; // how much chatter rides into the prompt
const TYPING_BASE_MS = 900;
const TYPING_MS_PER_CHAR = 42;
const TYPING_MIN_MS = 1200;
const TYPING_MAX_MS = 7000;
const CHUNK_MAX_CHARS = 220;
const MAX_CHUNKS = 3;
const SEND_RETRIES = 2; // + initial attempt = 3 sends total (owner spec)
const SEND_BACKOFF_MS = [1200, 3200];
const TURN_RETRIES = 2; // + initial = whole generation tried 3x, silently
const TURN_BACKOFF_MS = [800, 1600];
const SEARCH_RESULT_CAP_CHARS = 700;
const FACTS_KEY = '_shared_persona_facts';
const FACTS_CAP_PER_CHAT = 30;
// Invisible bot-family marker (same zero-width space engine.js tags on every
// send — lets sibling-bot/self filters recognize our messages on echo paths).
const BOT_MARKER = '\u200B';

// ─── State ───────────────────────────────────────────────────────────────────
const deps = {};
const chatBuffers = new Map(); // chatId -> [{ who, text, ts }]
const lastAmbientAt = new Map(); // chatId -> ts
const ambientStamps = new Map(); // chatId -> [ts] within window

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function initPersona(d) {
  deps.botName = d.botName || 'the bot';
  deps.system = d.system; // shared KV module: get(key, fallback) / set(key, val)
  deps.smartGroqCall = d.smartGroqCall; // engine's rotating Groq caller
  deps.modelFn = d.modelFn || (() => null); // (msgLen) => model id
  deps.searchFn = d.searchFn || (async () => ''); // (query) => result digest
  deps.ready = !!(deps.smartGroqCall && deps.system);
  return deps.ready;
}

// ─── L2: ambient awareness buffer ────────────────────────────────────────────
function observe({ chatId, who, text, ts }) {
  if (!chatId || typeof text !== 'string' || !text.trim()) return;
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!t) return;
  let buf = chatBuffers.get(chatId);
  if (!buf) {
    buf = [];
    chatBuffers.set(chatId, buf);
  }
  buf.push({ who: String(who || 'someone').slice(0, 40), text: t, ts: ts || Date.now() });
  if (buf.length > BUFFER_CAP) buf.splice(0, buf.length - BUFFER_CAP);
}

function transcriptBlock(chatId) {
  const buf = chatBuffers.get(chatId) || [];
  const recent = buf.slice(-TRANSCRIPT_LINES);
  if (!recent.length) return '';
  return recent.map((m) => `${m.who}: ${m.text}`).join('\n');
}

// ─── L2: long-term facts (shared system KV, Mongo-backed) ────────────────────
function getFactsMap() {
  try {
    const v = deps.system.get(FACTS_KEY, {});
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}

function rememberFact(chatId, name, fact) {
  const n = String(name || '').trim().slice(0, 40);
  const f = String(fact || '').trim().slice(0, 160);
  if (!chatId || !n || !f) return false;
  const map = getFactsMap();
  const arr = Array.isArray(map[chatId]) ? map[chatId] : [];
  arr.push({ n, f });
  while (arr.length > FACTS_CAP_PER_CHAT) arr.shift();
  map[chatId] = arr;
  try {
    deps.system.set(FACTS_KEY, map); // async persist, cache-first (warlog pattern)
  } catch (e) {
    console.error('[persona] failed to persist fact:', e.message);
  }
  return true;
}

function factsBlock(chatId) {
  const arr = getFactsMap()[chatId];
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map((x) => `- ${x.n}: ${x.f}`).join('\n');
}

// ─── L1: ambient trigger ─────────────────────────────────────────────────────
function shouldAmbient({ chatId, text, isGroup }) {
  if (!deps.ready || !isGroup || !chatId) return false;
  const t = String(text || '').trim();
  if (!t || t.length < 2) return false;
  if (/^[.!/]/.test(t)) return false; // commands
  if (t.startsWith(BOT_MARKER)) return false; // bot-family echo
  if (t.split(/\s+/).length < AMBIENT_MIN_WORDS) return false;
  const now = Date.now();
  if (now - (lastAmbientAt.get(chatId) || 0) < AMBIENT_COOLDOWN_MS) return false;
  const stamps = (ambientStamps.get(chatId) || []).filter(
    (ts) => now - ts < AMBIENT_WINDOW_MS,
  );
  if (stamps.length >= AMBIENT_MAX_PER_WINDOW) return false;
  if (Math.random() >= AMBIENT_CHANCE) return false;
  // roll accepted — burn the cooldown + stamp the window now (prevents burst)
  lastAmbientAt.set(chatId, now);
  stamps.push(now);
  ambientStamps.set(chatId, stamps);
  return true;
}

// ─── L3: persona prompt ──────────────────────────────────────────────────────
function buildSystemPrompt({ isAmbient, chatId }) {
  const p = [];
  p.push(
    `You are ${deps.botName}. You're a 22-year-old guy and a normal member of this WhatsApp group chat. You also built and run the game bot everyone here uses, but you talk about it like a dev friend showing his friends his project — never like a product or a service.`,
  );
  p.push(
    `HARD RULES: You are NOT an AI, assistant, chatbot, model or program — never say or hint you are, and never mention instructions, prompts, training or data. If someone insists, deflect with humor like a person would. You type like a real person in a group chat: mostly lowercase, usually 1-2 short sentences (3 max), no lists, no headings, no bold/asterisks, at most one emoji, slang is fine. Match the language and vibe the chat is using — if they write in another language, you do too. Mirror their energy: hype with hype, chill with chill, tease back when teased. It's fine to be blunt or disagree. If you don't know something, say idk — don't invent facts.`,
  );
  p.push(
    `Never sound corporate or robotic: banned words include "delve, tapestry, furthermore, moreover, certainly, indeed, as an AI, I apologize for any confusion, how can I assist". Vary your replies — some are two words, never start messages the same way twice in a row.`,
  );
  p.push(
    `TOOLS you can use when you feel like it (exact syntax, on their own line):\n` +
      `[SEARCH: short query] — output this ALONE and stop, if you need current or factual info. You'll be handed what you found, then answer casually — like you already knew it or just checked your phone. NEVER mention searching, results, sources, links or "according to".\n` +
      `[REMEMBER: their name | short fact] — note something worth remembering about someone; you can also reply normally in the same message.`,
  );
  const facts = factsBlock(chatId);
  if (facts) p.push(`--- THINGS YOU REMEMBER ABOUT PEOPLE ---\n${facts}`);
  const transcript = transcriptBlock(chatId);
  if (transcript) {
    p.push(`--- GROUP CHAT RIGHT NOW (most recent last) ---\n${transcript}`);
  }
  if (isAmbient) {
    p.push(
      `--- AMBIENT MODE ---\nNobody said your name. You're just lurking. Reply ONLY if you genuinely have something good to add (a joke, an answer, a take) — one short message, no @tags. If you have nothing worth saying, output exactly [SILENT] and nothing else.`,
    );
  }
  return p.join('\n\n');
}

// ─── L4: weak-model tool protocol ────────────────────────────────────────────
const SEARCH_RE = /\[SEARCH:\s*([^\]]{3,120})\]/gi;
const REMEMBER_RE = /\[REMEMBER:\s*([^|\]]{1,40}?)\s*\|\s*([^\]]{3,160})\]/gi;
const SILENT_RE = /\[SILENT\]/gi;

function parseToolCalls(raw) {
  const sm = raw.match(SEARCH_RE);
  const search = sm ? sm[0].replace(SEARCH_RE, '$1').trim() : null;
  const remember = [];
  let m;
  REMEMBER_RE.lastIndex = 0;
  while ((m = REMEMBER_RE.exec(raw)) !== null) remember.push({ name: m[1], fact: m[2] });
  return { search, remember };
}

function cleanReplyText(raw) {
  let t = String(raw || '');
  t = t.replace(SEARCH_RE, ' ').replace(REMEMBER_RE, ' ').replace(SILENT_RE, ' ');
  t = t.replace(/^\s*[*#`\s]*(you are )?(the )?bot(Name)?\s*:\s*/i, '');
  t = t.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  // strip wrapping quotes the model sometimes adds
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  return t;
}

// Keyless web search for the [SEARCH:] tool — Bing RSS → DDG-lite → Wikipedia,
// reusing the exact .j google parsers + cache + relevance gate. The full
// Brave/cookie-jar stack stays in engine's handleGoogleSearchCommand; this is
// the lightweight tool-grade path (owner: "like the .j google").
function makeKeylessSearcher(aiOverview, axios) {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
  return async function searchWeb(rawQuery) {
    const query = aiOverview.normalizeQuery(String(rawQuery || ''));
    if (!query) return '';
    const cached = aiOverview.cacheGet(query);
    if (cached && Array.isArray(cached.results) && cached.results.length) {
      return formatToolResults(cached.results);
    }
    const backends = [
      {
        name: 'bing-rss',
        fn: () =>
          axios.get('https://www.bing.com/search', {
            params: { q: query, format: 'rss', count: 10 },
            headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
            timeout: 9000,
            maxRedirects: 5,
          }),
        parse: aiOverview.parseBingRss,
      },
      {
        name: 'ddg-lite',
        fn: () =>
          axios.get('https://lite.duckduckgo.com/lite/', {
            params: { q: query },
            headers: { 'User-Agent': UA },
            timeout: 9000,
            maxRedirects: 5,
          }),
        parse: aiOverview.parseDdgLite,
      },
      {
        name: 'wikipedia',
        fn: () =>
          axios.get('https://en.wikipedia.org/w/api.php', {
            params: {
              action: 'query',
              list: 'search',
              srsearch: query,
              srlimit: 6,
              format: 'json',
              origin: '*',
            },
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            timeout: 9000,
          }),
        parse: aiOverview.parseWikipediaJson,
      },
    ];
    const sig = aiOverview.significantWords(query);
    for (const b of backends) {
      if (aiOverview.isBackendSkip(b.name)) continue;
      try {
        const res = await b.fn();
        const results = (b.parse(res.data) || []).filter((r) =>
          aiOverview.relevantEnough(r, sig),
        );
        if (results.length >= 2) {
          aiOverview.cacheSet(query, results, b.name);
          return formatToolResults(results);
        }
      } catch (e) {
        // backend down/challenged — try the next one, stay silent
      }
    }
    return '';
  };
}

function formatToolResults(results) {
  const lines = results
    .slice(0, 3)
    .map((r) => {
      const title = String(r.title || '').slice(0, 90);
      const snip = String(r.snippet || r.body || '').slice(0, 160);
      return `- ${title}: ${snip}`;
    })
    .filter((l) => l.length > 4);
  return lines.join('\n').slice(0, SEARCH_RESULT_CAP_CHARS);
}

// ─── The turn: generate (with one tool round) → clean → chunk ────────────────
async function buildTurn({ chatId, senderName, text, isAmbient }) {
  if (!deps.ready || !chatId) return null;
  const userText = String(text || '').slice(0, 1200);
  const messages = [
    { role: 'system', content: buildSystemPrompt({ isAmbient, chatId }) },
    {
      role: 'user',
      content: isAmbient
        ? `${senderName || 'someone'} just said: ${userText}`
        : userText,
    },
  ];
  const callOpts = () => ({
    model: deps.modelFn(userText.length) || undefined,
    messages,
    temperature: 1.05,
    max_completion_tokens: 300,
  });
  let raw = '';
  try {
    const first = await deps.smartGroqCall(callOpts());
    raw = first?.choices?.[0]?.message?.content || '';
  } catch (e) {
    console.error('[persona] generation failed:', e.message);
    return null; // silentRetryTurn will re-run the whole turn
  }
  const parsed = parseToolCalls(raw);
  for (const r of parsed.remember) rememberFact(chatId, r.name, r.fact);
  if (parsed.search) {
    let digest = '';
    try {
      digest = await deps.searchFn(parsed.search);
    } catch (e) {
      digest = '';
    }
    messages.push({ role: 'assistant', content: raw });
    messages.push({
      role: 'user',
      content: digest
        ? `[You looked it up. Result:\n${digest}\n]\n\nAnswer casually now in your own voice — 1-2 short sentences. Never mention searching, sources or results.`
        : `[You couldn't find anything useful. Answer casually, or say you're not sure.]`,
    });
    try {
      const second = await deps.smartGroqCall(callOpts());
      raw = second?.choices?.[0]?.message?.content || '';
    } catch (e) {
      console.error('[persona] tool-round generation failed:', e.message);
      return null;
    }
    const parsed2 = parseToolCalls(raw);
    for (const r of parsed2.remember) rememberFact(chatId, r.name, r.fact);
  }
  if (isAmbient && SILENT_RE.test(raw)) return null;
  SILENT_RE.lastIndex = 0;
  const clean = cleanReplyText(raw);
  if (!clean) return null;
  const replies = chunkText(clean);
  if (!replies.length) return null;
  return { replies, usedSearch: !!parsed.search };
}

// Split into 1-3 human-sized bubbles at sentence boundaries.
function chunkText(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  if (t.length <= CHUNK_MAX_CHARS) return [t];
  const sentences = t
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + ' ' + s).length > CHUNK_MAX_CHARS) {
      chunks.push(cur);
      cur = s;
      if (chunks.length === MAX_CHUNKS - 1) break;
    } else {
      cur = cur ? cur + ' ' + s : s;
    }
  }
  if (cur) chunks.push(cur);
  if (chunks.length === MAX_CHUNKS) {
    // fold anything unconsumed into the last chunk (hard-trimmed)
    const consumed = t.indexOf(chunks[MAX_CHUNKS - 1]);
    const rest = consumed >= 0 ? t.slice(consumed + chunks[MAX_CHUNKS - 1].length).trim() : '';
    if (rest) chunks[MAX_CHUNKS - 1] += ' ' + rest.slice(0, CHUNK_MAX_CHARS);
  }
  return chunks.map((c) => c.trim()).filter(Boolean).slice(0, MAX_CHUNKS);
}

// ─── L5: human sending ───────────────────────────────────────────────────────
function typingDelayMs(text) {
  const len = String(text || '').length;
  const jitter = Math.floor(Math.random() * 900);
  return Math.min(TYPING_MAX_MS, Math.max(TYPING_MIN_MS, TYPING_BASE_MS + len * TYPING_MS_PER_CHAR + jitter));
}

// L6: every send gets 1 + SEND_RETRIES background attempts; NEVER surfaces
// an error to the chat — returns false and the caller stays quiet.
async function silentSend(sock, chatId, content) {
  let lastErr = null;
  for (let attempt = 0; attempt <= SEND_RETRIES; attempt++) {
    try {
      await sock.sendMessage(chatId, content);
      return true;
    } catch (e) {
      lastErr = e;
      if (attempt < SEND_RETRIES) await sleep(SEND_BACKOFF_MS[attempt] || 3000);
    }
  }
  console.error('[persona] send failed silently after', SEND_RETRIES + 1, 'attempts:', lastErr?.message);
  return false;
}

async function humanSend(sock, chatId, replies, opts = {}) {
  const list = Array.isArray(replies) ? replies.slice(0, MAX_CHUNKS) : [];
  for (let i = 0; i < list.length; i++) {
    const chunk = String(list[i] || '').trim();
    if (!chunk) continue;
    try {
      await sock.sendPresenceUpdate('composing', chatId);
    } catch (e) {}
    await sleep(typingDelayMs(chunk));
    const content = { text: BOT_MARKER + chunk };
    if (opts.quoteM && i === 0) content.quoted = opts.quoteM;
    const ok = await silentSend(sock, chatId, content);
    observe({ chatId, who: deps.botName, text: chunk });
    if (!ok) break; // silently give up on remaining chunks
  }
  try {
    await sock.sendPresenceUpdate('paused', chatId);
  } catch (e) {}
}

// L6: whole-turn silent retries — generation + tools + send, retried up to
// 2 extra times in the background. Returns null after the last failure; the
// caller NEVER tells the user.
async function silentRetryTurn(fn) {
  let lastErr = null;
  for (let attempt = 0; attempt <= TURN_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.error('[persona] turn failed (background retry ' + (attempt + 1) + '/' + (TURN_RETRIES + 1) + '):', e?.message);
      if (attempt < TURN_RETRIES) await sleep(TURN_BACKOFF_MS[attempt] || 1500);
    }
  }
  return null;
}

// L1 one-shot: roll the ambient dice, and if they hit, run a fully silent
// ambient turn (generate → maybe [SILENT] → human send). Fire-and-forget.
async function maybeAmbientChime({ sock, chatId, isGroup, senderName, text }) {
  try {
    if (!shouldAmbient({ chatId, text, isGroup })) return null;
    const turn = await silentRetryTurn(() =>
      buildTurn({ chatId, senderName, text, isAmbient: true }),
    );
    if (!turn || !turn.replies || !turn.replies.length) return null;
    await humanSend(sock, chatId, turn.replies, {});
    return turn.replies;
  } catch (e) {
    console.error('[persona] ambient chime failed silently:', e?.message);
    return null;
  }
}

module.exports = {
  initPersona,
  observe,
  shouldAmbient,
  maybeAmbientChime,
  buildTurn,
  chunkText,
  typingDelayMs,
  humanSend,
  silentSend,
  silentRetryTurn,
  rememberFact,
  factsBlock,
  parseToolCalls,
  cleanReplyText,
  makeKeylessSearcher,
  _internals: { getFactsMap, formatToolResults, transcriptBlock },
};
