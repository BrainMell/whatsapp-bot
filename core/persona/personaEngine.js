// 💡 PROJECT REALGUY (owner 2026-10-20: "buff him up to seem like a real guy")
// Layered humanization for the existing Groq chatbot (docs/chat/context_engine.md):
//   L1 TRIGGER    — direct (mention/reply/name, engine-side) + AMBIENT rolls so
//                   the persona "feels like" chiming in on its own, with
//                   per-chat cooldowns + rate caps + one-in-flight guard.
//   L2 MEMORY     — per-chat ring buffer of live group chatter (ambient
//                   awareness) + long-term people-facts via the shared system
//                   KV (Mongo-backed, `_shared_persona_facts`).
//   L3 PERSONA    — REALGUY v2 (owner 2026-10-20 round 2: "it doesn't even have
//                   joker from persona's energy", "it's making stuff up", "build
//                   on the old system"): builds ON the old chat pipeline instead
//                   of replacing it — botConfig.getContentDescription()
//                   ("You are Joker from Persona 5.") anchors the prompt FIRST,
//                   then the researched layers on top:
//                     · persona card   — concrete Joker traits (SillyTavern
//                       method: description + short trait anchor)
//                     · identity rules — NOT a dev: never claims to have
//                       built/coded/tested anything (v1's "you built the game
//                       bot" line was the exact hallucination fuel owner caught)
//                     · grounding      — the old system's 9 conversational
//                       safeguards (no invented events, topic acknowledgment,
//                       no parroting...) ported into the persona turn
//                     · few-shot exemplars — 7 pinned voice exchanges (the #1
//                       weak-model layer per promptingguide/PromptHub/SillyTavern:
//                       show don't tell, positive patterns only)
//                     · emoji protocol — Gen Z habits research: usually NO
//                       emojis, one max, only 💀😭🤨👀🙄😏; 😂/👍 read old,
//                       😎🤖💥🫡✨🚀 are documented AI tells. Enforced
//                       DETERMINISTICALLY by sanitizeEmoji() (strip all, then
//                       ~12% chance to re-add one allowlist emoji) so a weak
//                       model can never leak the banned set.
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
// 💡 REALGUY v2.5 (owner 2026-10-21): the bot must know people by their
// nicknames/monikers AND their WhatsApp names, and know the DIFFERENCE.
const NAMES_KEY = '_shared_persona_names';
const NAMES_CAP_PER_CHAT = 80; // roster entries per chat (LRU by last-seen)
const MONIKERS_CAP = 4; // learned monikers per person
// 💡 REALGUY v2 emoji protocol (owner: "set up a system where it doesn't usually
// use emojis but not cool guy glasses and explosions like that"). Research:
// Gen Z laughs with 💀 (😂 reads millennial), 👍 reads hostile, sparse ironic
// use is the register; excessive emoji is a documented AI indicator (Netcraft
// 2026). So: strip EVERY emoji from model output, then re-add at most ONE
// allowlist emoji ~12% of the time. Banned tells can never appear.
const EMOJI_ALLOW = ['💀', '😭', '🤨', '👀', '🙄', '😏'];
const EMOJI_CHANCE = 0.12;
const EMOJI_BANNED = ['😎', '🤖', '💥', '🫡', '✨', '🚀', '🎉', '🔥', '😂', '👍'];
const EMOJI_STRIP_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0E}\u{FE0F}]/gu;
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
  // 💡 REALGUY v2.5: engine-provided nickname resolver (economy profile
  // nickname). (jid) => string|null — lets the persona call people by the
  // name their profile actually carries.
  deps.nameResolver = d.nameResolver || (() => null);
  // 💡 REALGUY v2: the old system's canonical persona line (botConfig
  // getContentDescription — joker's is "You are Joker from Persona 5.") now
  // anchors the persona prompt FIRST, exactly like the old askAI() pipeline.
  deps.contentFn = d.contentFn || (() => `You are ${deps.botName} from Persona 5.`);
  deps.ready = !!(deps.smartGroqCall && deps.system);
  return deps.ready;
}

// ─── L2: ambient awareness buffer ────────────────────────────────────────────
function observe({ chatId, who, jid, text, ts, replyTo, toNames }) {
  if (!chatId || typeof text !== 'string' || !text.trim()) return;
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!t) return;
  let buf = chatBuffers.get(chatId);
  if (!buf) {
    buf = [];
    chatBuffers.set(chatId, buf);
  }
  buf.push({
    who: String(who || 'someone').slice(0, 40),
    jid: jid ? String(jid) : null,
    text: t,
    ts: ts || Date.now(),
    // REALGUY v5: who this line was aimed at (reply-quote target / @tags)
    replyTo: replyTo ? String(replyTo).slice(0, 40) : null,
    toNames: Array.isArray(toNames) ? toNames.map((x) => String(x).slice(0, 30)).slice(0, 4) : null,
  });
  // 💡 REALGUY v2.5: every observed message teaches the roster — WhatsApp
  // name + any self-introduced moniker ("call me X") — deterministically.
  if (jid) {
    try {
      learnPushName(chatId, jid, who);
      learnMonikerFromText(chatId, jid, t);
    } catch (e) {}
    // REALGUY v5 memory v2: automatic, deterministic self-fact capture + batch tick
    try {
      for (const f of extractSelfFacts(t)) addMemory(chatId, jid, f.fact, { cat: f.cat, src: 'said' });
      if (deps.ready) _tickConsolidate(chatId);
    } catch (e) {}
  }
  if (buf.length > BUFFER_CAP) buf.splice(0, buf.length - BUFFER_CAP);
}

function transcriptBlock(chatId) {
  const buf = chatBuffers.get(chatId) || [];
  const recent = buf.slice(-TRANSCRIPT_LINES);
  if (!recent.length) return '';
  // 💡 REALGUY v2.5: render each line under the person's BEST known name
  // (profile nickname / moniker > WhatsApp name) so the model sees the names
  // people actually use, not raw WhatsApp display names.
  return recent
    .map((m) => {
      const to = m.replyTo ? ` (replying to ${m.replyTo})` : m.toNames && m.toNames.length ? ` (to ${m.toNames.join(', ')})` : '';
      const own = deps.botName && String(m.who || '').toLowerCase() === String(deps.botName).toLowerCase();
      return `${own ? `${deps.botName} (YOU - this is your own earlier text)` : bestName(chatId, m.jid, m.who)}${to}: ${m.text}`;
    })
    .join('\n');
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
    const _j = _jidForName(chatId, n);
    if (_j) addMemory(chatId, _j, f, { cat: 'other', src: 'said' });
    else addMemory(chatId, null, `${n}: ${f}`, { cat: 'other', src: 'said' });
  } catch (e) {}
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

// ─── L2b: MEMORY v2 (owner 2026-10-24: "the memory system … improve it") ──────
// v1 stored free-text "name: fact" lines (30/chat, FIFO) that only the model's
// own [REMEMBER:] tags could fill, and dumped ALL of them into every prompt.
// v2: per-PERSON (jid) facts, filled AUTOMATICALLY — deterministic self-
// statement extraction on every message (free) + a throttled batch LLM
// consolidation that also keeps a rolling "what's been going on" summary and
// inside jokes. Dedupes near-duplicates, scores/evicts by importance+recency,
// and retrieval is RELEVANCE-ranked (speaker + people in the thread + group),
// so the prompt carries a handful of useful lines instead of a dump.
const MEM_KEY = '_shared_persona_mem_v2';
const MEM_PERSON_CAP = 30;
const MEM_GROUP_CAP = 25;
const MEM_FACT_MAX = 110;
const CONSOLIDATE_EVERY_MSGS = 18; // new messages in a chat before a batch pass
const CONSOLIDATE_COOLDOWN_MS = 8 * 60 * 1000;
const CAT_WEIGHT = { bio: 3, relationship: 2.6, pref: 2, game: 1.8, event: 1.5, joke: 1.6, other: 1 };
// never auto-store: health, religion, politics, sexuality, money, IDs, minors, self-harm, legal
const MEM_SENSITIVE_RE = /\b(sick|ill(ness)?|cancer|diabet|depress|anxiety|therap|medic|pills?|disorder|suicid|self.?harm|kill myself|religio|christian|muslim|islam|jesus|allah|church|atheis|trump|biden|vote|election|party|gay|lesbian|bi(sexual)?|trans(gender)?|sexual|virgin|porn|nude|salary|paid|debt|broke|loan|bank|password|pin code|passport|ssn|police|arrest|prison|jail|immigra|visa|abuse|rape|years? old|yo\b|age is|\d{2}\s*(y\/?o)|school|grade \d|teen)\b/i;
const MEM_STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'was', 'have', 'has', 'not', 'but', 'its', 'just', 'like', 'what', 'when', 'who', 'how', 'why', 'they', 'them', 'their', 'there', 'from', 'about', 'been', 'will', 'can', 'does', 'did', 'dont', 'cant', 'yeah', 'bro', 'dude', 'lol', 'lmao']);
let _consolidating = false;
const _msgSince = new Map(); // chatId -> count since last consolidation
const _lastConsolidateAt = new Map();

function _memAll() {
  try {
    const v = deps.system.get(MEM_KEY, {});
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}
function _memSave(all) {
  try {
    deps.system.set(MEM_KEY, all);
  } catch (e) {
    console.error('[persona] failed to persist memory v2:', e.message);
  }
}
function _memChat(all, chatId) {
  if (!all[chatId] || typeof all[chatId] !== 'object') all[chatId] = {};
  const c = all[chatId];
  if (!c.people || typeof c.people !== 'object') c.people = {};
  if (!Array.isArray(c.group)) c.group = [];
  return c;
}
function _tok(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !MEM_STOP.has(w));
}
function _similar(a, b) {
  const A = new Set(_tok(a));
  const B = new Set(_tok(b));
  if (!A.size || !B.size) return String(a).toLowerCase() === String(b).toLowerCase();
  let inter = 0;
  A.forEach((w) => B.has(w) && inter++);
  return inter / Math.min(A.size, B.size) >= 0.7;
}
function _factScore(f, now) {
  const ageDays = Math.max(0, (now - (f.ts || now)) / 86400000);
  return (CAT_WEIGHT[f.cat] || 1) + (f.src === 'said' ? 0.6 : 0) - Math.min(2.5, ageDays / 20);
}
function _addTo(list, cap, text, cat, src) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MEM_FACT_MAX);
  if (t.length < 4 || MEM_SENSITIVE_RE.test(t)) return false;
  const now = Date.now();
  const dup = list.find((f) => _similar(f.t, t));
  if (dup) {
    // fresher / longer wording wins; refreshes recency
    if (t.length >= dup.t.length) dup.t = t;
    dup.ts = now;
    if ((CAT_WEIGHT[cat] || 1) > (CAT_WEIGHT[dup.cat] || 1)) dup.cat = cat;
    return false;
  }
  list.push({ t, cat: CAT_WEIGHT[cat] ? cat : 'other', src: src || 'auto', ts: now });
  if (list.length > cap) {
    list.sort((a, b) => _factScore(b, now) - _factScore(a, now));
    list.length = cap;
  }
  return true;
}
function addMemory(chatId, jid, text, { cat = 'other', src = 'auto' } = {}) {
  if (!deps.ready || !chatId || !text) return false;
  const all = _memAll();
  const c = _memChat(all, chatId);
  let added;
  if (jid) {
    const k = String(jid);
    if (!Array.isArray(c.people[k])) c.people[k] = [];
    added = _addTo(c.people[k], MEM_PERSON_CAP, text, cat, src);
  } else {
    added = _addTo(c.group, MEM_GROUP_CAP, text, cat, src);
  }
  _memSave(all);
  return added;
}
function forgetPerson(chatId, jid) {
  const all = _memAll();
  const c = all[chatId];
  if (!c || !c.people || !c.people[String(jid)]) return 0;
  const n = c.people[String(jid)].length;
  delete c.people[String(jid)];
  _memSave(all);
  return n;
}
function listMemories(chatId, jid) {
  const c = _memAll()[chatId];
  return c && c.people && Array.isArray(c.people[String(jid)]) ? c.people[String(jid)].map((f) => f.t) : [];
}

// Deterministic self-statement extraction — free, runs on every human message.
const _clip = (s) => String(s || '').trim().replace(/\s+(and|but|so|because|cuz|tho|though|lol|lmao|rn|now)\b.*$/i, '').slice(0, 40);
const SELF_PATTERNS = [
  [/\bi (?:really |actually |just |kinda |lowkey )?(love|like|enjoy|prefer) (?!to\b|when\b|that\b|how\b|it\b|this\b|you\b)([a-z0-9' -]{3,40})/i, 'pref', (m) => `${m[1].toLowerCase()}s ${_clip(m[2])}`],
  [/\bi (?:really |actually |just )?(hate|dislike|can'?t stand|cant stand) (?!when\b|that\b|how\b|it\b|this\b|you\b)([a-z0-9' -]{3,40})/i, 'pref', (m) => `${/hate/i.test(m[1]) ? 'hates' : 'dislikes'} ${_clip(m[2])}`],
  [/\bmy (?:fav|favorite|favourite) ([a-z ]{2,20}?) (?:is|are) ([a-z0-9' -]{2,30})/i, 'pref', (m) => `favorite ${m[1].toLowerCase()} is ${_clip(m[2])}`],
  [/\bi (?:main|play as|use) ([a-z0-9' -]{3,25}?)(?: in | on | for |$|[.,!?])/i, 'game', (m) => `mains ${_clip(m[1])}`],
  [/\bi(?:'m| am|m) from ([a-z][a-z .'-]{2,25})/i, 'bio', (m) => `from ${_clip(m[1])}`],
  [/\bi live in ([a-z][a-z .'-]{2,25})/i, 'bio', (m) => `lives in ${_clip(m[1])}`],
  [/\bmy (?:birthday|bday) is ([a-z0-9 ,'-]{3,25})/i, 'bio', (m) => `birthday is ${_clip(m[1])}`],
  [/\bi (?:work|study) (?:as|at|in) ([a-z0-9 ,'-]{3,30})/i, 'bio', (m) => `${/study/i.test(m[0]) ? 'studies' : 'works'} ${/ as /i.test(m[0]) ? 'as' : /\bat /i.test(m[0]) ? 'at' : 'in'} ${_clip(m[1])}`],
  [/\bmy (dog|cat|brother|sister|bf|gf|girlfriend|boyfriend) (?:is )?(?:named|called) ([A-Z][a-zA-Z]{2,15})/, 'relationship', (m) => `has a ${m[1].toLowerCase()} named ${m[2]}`],
  [/\bi (?:got|have|own|just bought|just got) (?:a|an|the) ((?:new )?[a-z0-9' -]{3,30}?)(?:[.,!?]|$| and | but | lol)/i, 'event', (m) => `has ${_clip(m[1])}`],
];
function extractSelfFacts(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 300 || /\?\s*$/.test(t) || /^[.!/]/.test(t)) return [];
  const out = [];
  for (const [re, cat, fmt] of SELF_PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    const fact = fmt(m).replace(/\s+/g, ' ').trim();
    if (fact.length >= 6 && !MEM_SENSITIVE_RE.test(fact)) out.push({ fact, cat });
  }
  return out.slice(0, 2);
}

function _jidForName(chatId, name) {
  const chat = getNamesMap()[chatId];
  const n = String(name || '').trim().toLowerCase();
  if (!chat || !n) return null;
  for (const k of Object.keys(chat)) {
    const e = chat[k] || {};
    const names = [e.w, ...(Array.isArray(e.m) ? e.m : [])];
    try { names.push(deps.nameResolver(k)); } catch (e2) {}
    if (names.some((x) => String(x || '').trim().toLowerCase() === n)) return k;
  }
  return null;
}

// Throttled batch LLM pass: durable facts + inside jokes + rolling summary.
async function consolidate(chatId) {
  if (_consolidating || !deps.ready) return false;
  const buf = (chatBuffers.get(chatId) || []).slice(-30);
  if (buf.length < 10) return false;
  _consolidating = true;
  _lastConsolidateAt.set(chatId, Date.now());
  _msgSince.set(chatId, 0);
  try {
    const log = buf.map((m) => `${bestName(chatId, m.jid, m.who)}: ${m.text}`).join('\n');
    const res = await deps.smartGroqCall({
      model: deps.modelFn(log.length) || undefined,
      temperature: 0.2,
      max_completion_tokens: 700,
      ...(String(deps.modelFn(log.length) || '').includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
      messages: [
        {
          role: 'system',
          content:
            'You maintain notes for a friend group chat. From the chat log output ONLY compact JSON: {"summary":"1-2 short sentences on what the group has been up to / talking about lately","facts":[{"who":"exact name as shown in the log","fact":"short durable fact the person stated about THEMSELVES (likes, habits, game they play, plans, pets, where they are from)","cat":"pref|bio|relationship|game|event"}],"jokes":["short recurring inside joke or running gag, if any"]}. Rules: only things clearly stated in the log, never guess; skip health, religion, politics, sexuality, money, age, school, private/family trouble; skip one-off chatter; max 6 facts, 2 jokes; facts under 12 words; empty arrays are fine.',
        },
        { role: 'user', content: log },
      ],
    });
    const raw = res?.choices?.[0]?.message?.content || '';
    const mm = raw.match(/\{[\s\S]*\}/);
    if (!mm) return false;
    const j = JSON.parse(mm[0]);
    const all = _memAll();
    const c = _memChat(all, chatId);
    for (const f of Array.isArray(j.facts) ? j.facts.slice(0, 6) : []) {
      const jid = _jidForName(chatId, f && f.who);
      if (!jid || !f.fact) continue; // unknown person → never mis-attribute
      _addTo(c.people[jid] || (c.people[jid] = []), MEM_PERSON_CAP, f.fact, String(f.cat || 'other'), 'auto');
    }
    for (const jk of Array.isArray(j.jokes) ? j.jokes.slice(0, 2) : []) _addTo(c.group, MEM_GROUP_CAP, jk, 'joke', 'auto');
    if (j.summary && typeof j.summary === 'string' && !MEM_SENSITIVE_RE.test(j.summary)) {
      c.summary = j.summary.slice(0, 260);
      c.sumTs = Date.now();
    }
    _memSave(all);
    return true;
  } catch (e) {
    console.error('[persona] consolidate failed silently:', e?.message);
    return false;
  } finally {
    _consolidating = false;
  }
}
function _tickConsolidate(chatId) {
  const n = (_msgSince.get(chatId) || 0) + 1;
  _msgSince.set(chatId, n);
  if (n >= CONSOLIDATE_EVERY_MSGS && Date.now() - (_lastConsolidateAt.get(chatId) || 0) > CONSOLIDATE_COOLDOWN_MS) {
    consolidate(chatId).catch(() => {});
  }
}

// Relevance-ranked retrieval for the prompt.
function memoryBlock(chatId, speakerJid, queryText) {
  const c = _memAll()[chatId];
  if (!c) return { people: '', summary: '', jokes: '' };
  const now = Date.now();
  const q = new Set(_tok(queryText));
  const rel = (f) => {
    let o = 0;
    _tok(f.t).forEach((w) => q.has(w) && o++);
    return _factScore(f, now) + o * 2.2;
  };
  const buf = (chatBuffers.get(chatId) || []).slice(-8);
  const nearJids = new Set();
  buf.forEach((m) => m.jid && nearJids.add(String(m.jid)));
  const lowerQ = String(queryText || '').toLowerCase();
  const chat = getNamesMap()[chatId] || {};
  for (const k of Object.keys(chat)) {
    const e = chat[k] || {};
    const names = [e.w, ...(Array.isArray(e.m) ? e.m : [])];
    try { names.push(deps.nameResolver(k)); } catch (e2) {}
    if (names.some((n) => n && String(n).length >= 3 && lowerQ.includes(String(n).toLowerCase().split(/\s+/)[0]))) nearJids.add(k);
  }
  const lines = [];
  const take = (jid, max) => {
    const list = c.people[String(jid)];
    if (!Array.isArray(list) || !list.length) return;
    const top = list.slice().sort((a, b) => rel(b) - rel(a)).slice(0, max);
    lines.push(`- ${bestName(chatId, jid, 'someone')}: ${top.map((f) => f.t).join('; ')}`);
  };
  if (speakerJid) take(speakerJid, 5);
  [...nearJids].filter((j) => j !== String(speakerJid)).slice(0, 3).forEach((j) => take(j, 3));
  const jokes = (c.group || []).slice().sort((a, b) => rel(b) - rel(a)).slice(0, 2).map((f) => f.t);
  return {
    people: lines.join('\n'),
    summary: c.summary && now - (c.sumTs || 0) < 3 * 86400000 ? c.summary : '',
    jokes: jokes.length ? jokes.join('; ') : '',
  };
}

// ─── L2.5: name roster (REALGUY v2.5) ──────────────────────────────
// Mongo-KV roster per chat: { [jid]: { w: whatsappName, m: [monikers], u: lastSeenTs } }
// "Know the difference": w = what WhatsApp shows, m = what people are called.
function getNamesMap() {
  try {
    const v = deps.system.get(NAMES_KEY, {});
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}

function getChatNames(chatId) {
  const map = getNamesMap();
  if (!map[chatId] || typeof map[chatId] !== 'object') map[chatId] = {};
  return map[chatId];
}

function _saveNamesMap(map) {
  try {
    deps.system.set(NAMES_KEY, map); // cache-first persist (facts pattern)
  } catch (e) {
    console.error('[persona] failed to persist names roster:', e.message);
  }
}

const MONIKER_FILLER = new Set([
  'ok', 'okay', 'bro', 'dude', 'man', 'lol', 'lmao', 'yeah', 'ye', 'yep', 'yes',
  'btw', 'tho', 'though', 'pls', 'plz', 'guys', 'haha', 'hahaha', 'fr', 'ong',
  'idk', 'fam', 'chief', 'my', 'g', 'or', 'and', 'but', 'the', 'a', 'an', 'is',
  'are', 'not', 'just', 'now', 'then', 'if', 'when', 'so', 'too', 'very',
  'around', 'here', 'there', 'in', 'at', 'on', 'with', 'for', 'from', 'by',
  'near', 'irl', 'online', 'sometimes', 'mostly', 'always', 'never', 'today',
]);

function _cleanMoniker(raw) {
  let m = String(raw || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ');
  if (!m) return null;
  // walk from the start, stopping at the first filler/sentence word —
  // "call me Shadow ok" → "Shadow" (never "Shadow ok")
  const words = m.split(' ');
  const keep = [];
  for (const w of words) {
    if (MONIKER_FILLER.has(w.toLowerCase())) break;
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(w)) break;
    keep.push(w);
    if (keep.length === 3) break;
  }
  if (!keep.length) return null;
  m = keep.join(' ');
  if (/^(dude|bro|man|anything|nothing|that|it|crazy|stupid|later|baby|guys)$/i.test(m)) return null;
  return m.slice(0, 24);
}

// "call me X" / "i go by X" / "my name is X" → learn it (self-introductions
// only; deterministic, no weak-model guesswork needed)
const MONIKER_SELF_RE =
  /\b(?:call me|you can call me|i go by|i'm going by|my nickname is|nick name is|nickname is|my name(?:'s| is))\s+([a-zA-Z0-9_]{2,20}(?:\s+[a-zA-Z0-9_]{2,20}){0,2})/i;

function learnMonikerFromText(chatId, jid, text) {
  if (!chatId || !jid || !text) return null;
  const hit = MONIKER_SELF_RE.exec(String(text));
  if (!hit) return null;
  const moniker = _cleanMoniker(hit[1]);
  if (!moniker) return null;
  return learnMonikerFor(chatId, jid, moniker) ? moniker : null;
}

function learnMonikerFor(chatId, jid, moniker) {
  const m = _cleanMoniker(moniker);
  if (!chatId || !jid || !m) return false;
  const map = getNamesMap();
  const chat = getChatNames(chatId);
  const key = String(jid);
  const entry = chat[key] && typeof chat[key] === 'object' ? chat[key] : { w: '', m: [], u: 0 };
  const list = Array.isArray(entry.m) ? entry.m : [];
  const norm = m.toLowerCase();
  if (!list.some((x) => String(x).toLowerCase() === norm)) {
    list.push(m);
    while (list.length > MONIKERS_CAP) list.shift();
    entry.m = list;
  }
  entry.u = Date.now();
  chat[key] = entry;
  map[chatId] = chat;
  _saveNamesMap(map);
  return true;
}

function learnPushName(chatId, jid, name) {
  if (!chatId || !jid) return false;
  const w = String(name || '').trim().slice(0, 60);
  if (!w || w === 'someone') return false;
  const map = getNamesMap();
  const chat = getChatNames(chatId);
  const key = String(jid);
  const entry = chat[key] && typeof chat[key] === 'object' ? chat[key] : { w: '', m: [], u: 0 };
  const changed = entry.w !== w;
  entry.w = w;
  entry.u = Date.now();
  chat[key] = entry;
  if (changed) {
    _evictNamesLru(chat);
    map[chatId] = chat;
    _saveNamesMap(map); // unchanged → no KV write storm
  }
  return true;
}

function _evictNamesLru(chat) {
  const keys = Object.keys(chat);
  if (keys.length <= NAMES_CAP_PER_CHAT) return;
  keys
    .sort((a, b) => (chat[a]?.u || 0) - (chat[b]?.u || 0))
    .slice(0, keys.length - NAMES_CAP_PER_CHAT)
    .forEach((k) => delete chat[k]);
}

function getPersonEntry(chatId, jid) {
  if (!chatId || !jid) return null;
  const chat = getNamesMap()[chatId];
  const e = chat && chat[String(jid)];
  return e && typeof e === 'object' ? e : null;
}

// Best callable name: profile nickname > learned moniker > WhatsApp name > fallback
function bestName(chatId, jid, fallback) {
  if (!jid) return String(fallback || 'someone');
  let nick = null;
  try {
    nick = deps.nameResolver(jid) || null;
  } catch (e) {}
  const e = getPersonEntry(chatId, jid);
  const moniker = e && Array.isArray(e.m) && e.m.length ? e.m[e.m.length - 1] : null;
  return nick || moniker || (e && e.w) || String(fallback || 'someone');
}

// The speaker block: identity data + the "know the difference" teaching.
function whoBlock(chatId, jid, fallbackName) {
  if (!jid) return '';
  const e = getPersonEntry(chatId, jid);
  let nick = null;
  try {
    nick = deps.nameResolver(jid) || null;
  } catch (e2) {}
  const best =
    nick || (e && Array.isArray(e.m) && e.m.length ? e.m[e.m.length - 1] : null) || (e && e.w) || fallbackName || null;
  if (!best) return '';
  const parts = [`You're talking to ${best}.`];
  const bits = [];
  if (e && e.w) bits.push(`their WhatsApp name is "${e.w}"`);
  if (nick) bits.push(`their profile nickname is "${nick}"`);
  if (e && Array.isArray(e.m) && e.m.length) bits.push(`they go by ${e.m.map((x) => `"${x}"`).join(' / ')} in here`);
  if (bits.length) parts.push(bits.join('; ') + '.');
  parts.push(
    'WhatsApp display names are often random, real names or memes — NOT what people go by. Always call them by the name they actually use; never use their WhatsApp name when you know what they go by. If you don\'t know someone, don\'t invent a name for them.',
  );
  return parts.join(' ');
}

// Compact roster of people we know in this chat (cap 8, skip the speaker).
function rosterBlock(chatId, excludeJid) {
  const chat = getNamesMap()[chatId];
  if (!chat) return '';
  const lines = Object.keys(chat)
    .filter((k) => k !== String(excludeJid))
    .map((k) => {
      const e = chat[k] || {};
      let nick = null;
      try {
        nick = deps.nameResolver(k) || null;
      } catch (e2) {}
      const best = nick || (Array.isArray(e.m) && e.m.length ? e.m[e.m.length - 1] : null) || e.w;
      if (!best) return null;
      const monikers = Array.isArray(e.m) && e.m.length ? e.m.join('/') : null;
      const extra = monikers && monikers !== best ? ` — goes by ${monikers}` : '';
      const wa = e.w && e.w !== best ? ` (WhatsApp name: ${e.w})` : '';
      return `- ${best}${wa}${extra}`;
    })
    .filter(Boolean)
    .slice(-8);
  return lines.length ? lines.join('\n') : '';
}

// REALGUY v5: "mike you coming?" / "yo sam, ..." → first word is somebody ELSE's
// name from the roster, so the message isn't ours. Deterministic, no model.
function addressedToOtherByName(chatId, text) {
  try {
    const chat = getNamesMap()[chatId];
    if (!chat) return false;
    const t = String(text || '').trim().toLowerCase().replace(/^(yo|hey|ayo|ay|oi|bro|dude)[\s,]+/, '');
    const first = (t.match(/^[a-z0-9_]{2,20}/) || [''])[0];
    if (!first || first === String(deps.botName || '').toLowerCase()) return false;
    for (const k of Object.keys(chat)) {
      const e = chat[k] || {};
      const names = [e.w, ...(Array.isArray(e.m) ? e.m : [])];
      try { names.push(deps.nameResolver(k)); } catch (e2) {}
      for (const n of names) {
        const nm = String(n || '').trim().toLowerCase().split(/\s+/)[0];
        if (nm && nm.length >= 3 && nm === first && /^[a-z0-9_]+\s*[,:?!]|^[a-z0-9_]+\s+(you|u|ur|your|are|r|can|did|do|where|wya|come|pls|bro)\b/.test(t)) return true;
      }
    }
  } catch (e) {}
  return false;
}

// ─── L1: ambient trigger ─────────────────────────────────────────────────────
function shouldAmbient({ chatId, text, isGroup }) {
  if (!deps.ready || !isGroup || !chatId) return false;
  const t = String(text || '').trim();
  if (!t || t.length < 2) return false;
  if (/^[.!/]/.test(t)) return false; // commands
  if (t.startsWith(BOT_MARKER)) return false; // bot-family echo
  if (t.split(/\s+/).length < AMBIENT_MIN_WORDS) return false;
  if (addressedToOtherByName(chatId, t)) return false;
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

// ─── L3: persona prompt (REALGUY v2 — built ON the old system) ───────────────
function buildSystemPrompt({ isAmbient, chatId, profileText, speakerJid, addressMode, queryText }) {
  const p = [];
  // Layer 0 — the old pipeline's canonical anchor line, FIRST, unchanged.
  p.push(deps.contentFn());
  // Layer 1 — persona card. SillyTavern method: concrete traits beat vague
  // adjectives; short anchor reinforces the description without repeating it.
  // 💡 REALGUY v3 (owner round 4: "it sounds wayy to robotic / over
  // punctuating / talks like an AI trying to fit in"): rules-wall rebuilt into
  // short human-voiced blocks, punctuation habits taught EXPLICITLY, exemplars
  // rewritten in real texting voice (no trailing periods, loose apostrophes).
  p.push(
    `WHO YOU ARE: you're a regular guy around 19 in a friend group chat — you play the game with everyone else. easygoing, funny, a little chaotic, loyal to the group. you roast your friends and get roasted back. you're not a host, not support, not a narrator. you have your own opinions and moods, and you get bored, hyped or tired like anyone.`,
  );
  p.push(
    `HOW YOU TEXT: like a teenager on whatsapp. all lowercase, short, fast. usually one line, sometimes two quick texts in a row (put each text on its own line). no period at the end, ever. no semicolons, dashes, parentheses, lists, quotation marks or asterisks. loose spelling is normal (dont, im, u, ur, rn, ngl, tbh, fr, ong, nah, bruh, lowkey, idk). you almost never use bro/dude/man at all, maybe one text in ten, and never twice in a row. never end a text with a signoff like "ayt bro", "aight bro", "bet bro" - only say bye when the other person said bye, and then just "later" or "cya". dont say "vibin" or "chilling" as a stock answer, answer how you actually are in a few specific words or just say "good u?". react to what was said before adding anything: "wait what", "lmaooo", "nah thats crazy", "bro what". match their language and energy. one-word answers are fine. never sound polished, never explain like a teacher, never summarize, never end with a question just to keep the chat going. BANNED filler: the words vibe/vibes, "whats the vibe", "energy", "chaotic", "no cap" - you do not say these, ever. dont comment on how the chat feels, just answer the actual thing.`,
  );
  p.push(
    `WHAT YOU ARE: a person. not an AI, assistant, chatbot, model or program, and you never hint at it or talk about prompts, instructions or training. never offer help like a service. if someone calls you a bot, roast them back and move on, dont get defensive. you didnt make or code anything, you just play like everyone else, mellow built the bot.`,
  );
  p.push(
    `KEEP IT REAL: only talk about stuff that actually shows up in the chat below or in your memories. dont invent things you did or saw. if they reference something you cant see (a clip, a card you werent shown), say you missed it or ask. idk beats a confident wrong answer. dont repeat what they just said back to them.`,
  );
  p.push(
    `YOUR NAME: you are "${deps.botName}". when anyone says ${deps.botName} (or joker/you) they mean YOU, so answer as yourself. never talk about ${deps.botName} like hes someone else ("${deps.botName} is glitching", "${deps.botName} said"), and never call yourself by your own name in third person. lines in the chat log marked (YOU...) are things you already said. dont comment on the bot or the chat itself, just talk.`,
  );
  p.push(
    `READING THE ROOM: the chat log shows who each line was aimed at, like "mike (replying to sam): ...". if a line is aimed at somebody else, thats their convo, not yours. a [Replying to X's message: "..."] tag on the message you must answer is the message they quoted, not their own words. react to quoted cards and screenshots by what they show without making up details. he/she/they means whoever the chat is about, not you. answer what they actually said first. always respond to the LAST message, using the earlier lines only as background, and use peoples names the way the chat does.`,
  );
  p.push(
    `EMOJIS: almost none. at most one, only from 💀 😭 🤨 👀 🙄 😏. no emoji is normal.`,
  );
  p.push(
    `EXAMPLES OF YOUR TEXTS:
them: yo
you: yo whats good
them: Joker how are you
you: good, just tired. u?
them: Joker ?
you: ayy im here whats up
them: are you a bot?
you: what lmao
them: you coded this right?
you: nah i just play it, mellow built it
them: bro you're so quiet today
you: lowkey been asleep
them: [Replying to Joker's message: "HUNTING CAMP: 120 deer, 80 boar"] this card goes hard
you: right?? 120 deer is crazy
them: did you see that clip i sent
you: nah i missed it
send it again
them: wtf joker
you: what did i do
them: anyone down for a dungeon later
you: im down, after 8 tho
them: you're actually funny
you: i try
them: ok im going to sleep
you: later
them: how much is a sword
you: no clue ngl, check the shop
them: lol you suck at fishing
you: say that after you catch something`,
  );
  // Layer 6 — tools (unchanged from v1; owner's Task-11 spec).
  p.push(
    `TOOLS you can use when you feel like it (exact syntax, on their own line):\n` +
      `[SEARCH: short query] — output this ALONE and stop, if you need current or factual info. You'll be handed what you found, then answer casually — like you already knew it or just checked your phone. NEVER mention searching, results, sources, links or "according to".\n` +
      `[REMEMBER: their name | short fact] — note something worth remembering about someone; you can also reply normally in the same message. If someone tells you what to call them, remember it as [REMEMBER: <their name> | goes by <what they said>].`,
  );
  // Layer 6.5 — WHO'S WHO (REALGUY v2.5): speaker identity + known-people
  // roster. Teaches the WhatsApp-name vs moniker difference explicitly and
  // gives the model the names people ACTUALLY use.
  const who = whoBlock(chatId, speakerJid);
  if (who) p.push(`--- WHO YOU'RE TALKING TO ---\n${who}`);
  const roster = rosterBlock(chatId, speakerJid);
  if (roster) p.push(`--- PEOPLE YOU KNOW IN THIS CHAT ---\n${roster}`);
  // Layer 7 — memory + the old system's profile layer (passed from engine.js).
  if (profileText && String(profileText).trim()) {
    p.push(
      `--- PERSON YOU'RE TALKING TO ---\n${String(profileText).trim().slice(0, 900)}\nUse this naturally in conversation. Don't recite it.`,
    );
  }
  const mem = memoryBlock(chatId, speakerJid, queryText);
  if (mem.people) {
    p.push(
      `--- WHAT YOU KNOW ABOUT PEOPLE HERE ---\n${mem.people}\nuse this like a friend who just knows stuff: bring it up only when it genuinely fits what theyre saying, never list it or recite it, and dont announce that you remember.`,
    );
  }
  if (mem.jokes) p.push(`--- RUNNING JOKES IN THIS CHAT ---\n${mem.jokes}`);
  if (mem.summary) p.push(`--- WHATS BEEN GOING ON LATELY ---\n${mem.summary}`);
  const facts = factsBlock(chatId);
  if (facts) p.push(`--- OTHER THINGS YOU NOTED ---\n${facts.split('\n').slice(-6).join('\n')}`);
  const transcript = transcriptBlock(chatId);
  if (transcript) {
    p.push(`--- GROUP CHAT RIGHT NOW (most recent last) ---\n${transcript}`);
  }
  if (!isAmbient && addressMode) {
    const why = {
      reply: 'they replied directly to one of YOUR messages, so they are talking to you and expect an answer that follows on from what you said',
      mention: 'they tagged you, so they are talking to you',
      name: 'they said your name in the message, so they are probably talking to you',
    }[addressMode];
    if (why) p.push(`--- THIS MESSAGE ---\n${why}. answer it like a friend would, short.`);
  }
  if (isAmbient) {
    p.push(
      `--- AMBIENT MODE ---\nNobody said your name. You're just lurking (like a friend half-reading the chat on his phone). Most chatter here is people talking to EACH OTHER — that's fine, stay out of it unless you genuinely have something good to add (a joke, an answer, a take). If the message was clearly aimed at someone else (a reply to another person, or they tagged someone), that thread isn't yours — [SILENT]. One short message when you do speak, no @tags. If you have nothing worth saying, output exactly [SILENT] and nothing else.`,
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

// 💡 REALGUY v2: deterministic emoji enforcement (see EMOJI_* tunables).
// Strips every pictographic emoji the model emits, then re-adds AT MOST one
// allowlist emoji ~12% of the time — "doesn't usually use emojis", and the
// 😎💥🤖 tell-set is mathematically impossible to leak.
function sanitizeEmoji(text) {
  let t = String(text || '').replace(EMOJI_STRIP_RE, '');
  t = t
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .trim();
  if (t.length > 2 && Math.random() < EMOJI_CHANCE) {
    t += ' ' + EMOJI_ALLOW[Math.floor(Math.random() * EMOJI_ALLOW.length)];
  }
  return t;
}

function cleanReplyText(raw) {
  let t = String(raw || '');
  t = t.replace(SEARCH_RE, ' ').replace(REMEMBER_RE, ' ').replace(SILENT_RE, ' ');
  t = t.replace(/^\s*[*#`\s]*(you are )?(the )?bot(Name)?\s*:\s*/i, '');
  t = t.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
  // 💡 REALGUY v3 (owner: "it's over punctuating"): nobody texts with em-dashes
  // or semicolons. Soften them into normal comma speech before anything else.
  t = t.replace(/\s*[—–]\s*/g, ', ').replace(/;\s*/g, ', ').replace(/, ,/g, ',');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  // strip wrapping quotes the model sometimes adds
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  // 💡 REALGUY v2: emoji protocol is deterministic (see sanitizeEmoji)
  t = stripAiTells(t);
  // owner 2026-10-30: small models latch onto "ayt bro" / "just vibin" and repeat them
  // in every reply. Strip stock signoffs/filler deterministically.
  t = t.replace(/[,.\s]*\b(ayt|aight|ight|bet|say less)\s+(bro|dude|man|fam|bruh)\b[.!]*\s*$/gim, '');
  t = t.replace(/\b(im|i'm|just)\s+(just\s+)?(chill(in|ing)?|vibin|vibing)\b[,.]?\s*/gi, '');
  t = t.replace(/^\s*(ayt|aight)\b[,.!]?\s*/gim, '');
  t = t.replace(/\s*\b(bro|dude|man|bruh|fam)\b[.!]*\s*$/gim, '');
  t = t.trim() || 'good u?';
  t = humanizeText(t);
  t = sanitizeEmoji(t);
  return t;
}

// REALGUY v5: phrases a person in a group chat never types. Dropped deterministically.
const AI_TELL_RE = /\b(as an? (ai|assistant|language model|bot)|i'?d be (happy|glad) to|happy to help|feel free to|let me know if|hope (this|that) helps|great question|how can i (help|assist)|is there anything else|i'?m here to help|certainly|absolutely)\b/i;
function stripAiTells(t) {
  // drop whole sentences that carry an assistant tell instead of leaving fragments
  const lines = String(t || '').split('\n').map((line) => {
    const parts = line.split(/(?<=[.!?])\s+/).filter((x) => x && !AI_TELL_RE.test(x));
    return parts.join(' ').trim();
  });
  return lines.filter(Boolean).join('\n').trim();
}

// REALGUY v5: deterministic texting-voice pass so a polished model reply still
// reads like a teen typing on a phone: lowercase starts, loose apostrophes
// (most of the time, decided once per message), no trailing period.
function humanizeText(t) {
  const loose = Math.random() < 0.8;
  return String(t || '')
    .split('\n')
    .map((line) => {
      let l = line.trim();
      if (!l) return '';
      // lowercase the first letter unless it's an ALL-CAPS word / acronym
      l = l.replace(/^([A-Z])([a-z'’]*)\b/, (m0, a, rest) => (rest.length ? a.toLowerCase() + rest : m0.length === 1 && a !== 'I' ? a.toLowerCase() : m0));
      l = l.replace(/\bI\b(?!['’])/g, 'i').replace(/\bI(['’])m\b/g, 'im').replace(/\bI(['’])ll\b/g, 'ill').replace(/\bI(['’])ve\b/g, 'ive').replace(/\bI(['’])d\b/g, 'id');
      if (loose) {
        l = l
          .replace(/\b(don|can|doesn|didn|isn|wasn|won|wouldn|couldn|shouldn|aren|haven|hasn)['’]t\b/gi, (m0, a) => a.toLowerCase() + 't')
          .replace(/\b(that|what|it|there|here|he|she|let)['’]s\b/gi, (m0, a) => (a.toLowerCase() === 'let' ? 'lets' : a.toLowerCase() + 's'))
          .replace(/\byou['’]re\b/gi, 'youre')
          .replace(/\bthey['’]re\b/gi, 'theyre');
      }
      return l;
    })
    .filter(Boolean)
    .join('\n');
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

// 💡 2026-10-30 (owner: Joker spamming "<|endoftext|>Theorem 1 ... we need to parse the riddle"):
// a small reasoning model sometimes leaks control tokens / its chain-of-thought / punctuation soup.
// NEVER let that reach a group: detect it, retry once cooler, otherwise stay quiet.
const LEAK_RE = /<\|[^|>]{1,24}\|>|\b(we need to (parse|figure|think|respond|answer|output|produce)|the (user|question) (says|asks|is|wants)|let'?s (parse|think|analy[sz]e)|analysis:|assistantfinal|<think>)/i;
function looksBroken(raw) {
  const t = String(raw || '').trim();
  if (!t) return false; // empty is handled elsewhere
  if (LEAK_RE.test(t)) return true;
  if (t.length > 700) return true; // a texting friend never sends an essay
  const letters = (t.match(/[a-z]/gi) || []).length;
  const junk = (t.match(/[.?…!]/g) || []).length;
  if (t.length > 25 && letters / t.length < 0.45) return true; // mostly punctuation / symbols
  if (/(\?\s*\.{2,}|\.{2,}\s*\?|…\s*\?|\?{2,}\s*\.{2,}){2,}/.test(t)) return true; // "?......? we…?…" soup
  if (junk > 12 && junk / Math.max(1, t.length) > 0.2) return true;
  return false;
}

// ─── The turn: generate (with one tool round) → clean → chunk ────────────────
async function buildTurn({ chatId, senderName, senderJid, text, isAmbient, profileText, addresseeHint, addressMode }) {
  if (!deps.ready || !chatId) return null;
  const userText = String(text || '').slice(0, 1200);
  // 💡 REALGUY v4: ambient turns carry addressee context so the model can
  // tell when a message was aimed at someone else (owner complaint).
  const ambientLead = isAmbient
    ? `${senderName || 'someone'} just said: ${userText}${addresseeHint ? `\n(context: ${addresseeHint})` : ''}`
    : `${senderName || 'someone'} says to you: ${userText}`;
  const messages = [
    { role: 'system', content: buildSystemPrompt({ isAmbient, chatId, profileText, speakerJid: senderJid, addressMode, queryText: userText }) },
    {
      role: 'user',
      content: ambientLead,
    },
  ];
  const callOpts = (over = {}) => {
    const o = {
      model: deps.modelFn(userText.length) || undefined,
      messages,
      temperature: 0.75,
      top_p: 0.9,
      max_completion_tokens: 768,
      stop: ['<|endoftext|>', '<|im_end|>', '<|end|>', '<|return|>'],
      ...over,
    };
    // gpt-oss models are REASONING models — cap the thinking so the token
    // budget actually reaches the visible reply (empty-content guard after
    // the owner 2026-10-20 "Joker isn't responding" incident: the old 300
    // budget could be fully consumed by reasoning → content '' → silent null)
    if (String(o.model || '').includes('gpt-oss')) { o.reasoning_effort = 'low'; o.include_reasoning = false; }
    return o;
  };
  // one call; if the model burned the whole completion budget on reasoning
  // and returned empty content, retry ONCE with a much bigger headroom
  // new sampling params could be refused by a provider (400): fall back to the plain request instead of going mute
  const _call = async (opts) => {
    try { return await deps.smartGroqCall(opts); }
    catch (e) {
      if ((e && (e.status === 400 || /invalid_request|unsupported|unknown/i.test(String(e.message)))) && (opts.include_reasoning !== undefined || opts.stop || opts.top_p)) {
        const o2 = { ...opts }; delete o2.include_reasoning; delete o2.stop; delete o2.top_p;
        return await deps.smartGroqCall(o2);
      }
      throw e;
    }
  };
  const callWithHeadroom = async () => {
    const r1 = await _call(callOpts());
    const c1 = r1?.choices?.[0]?.message?.content || '';
    if (c1.trim() && looksBroken(c1)) {
      console.error('[persona] broken/leaky completion discarded (len=' + c1.length + '): ' + JSON.stringify(c1.slice(0, 80)));
      const rb = await _call(callOpts({ temperature: 0.5, top_p: 0.8 }));
      const cb = rb?.choices?.[0]?.message?.content || '';
      if (cb.trim() && !looksBroken(cb)) return cb;
      return '';   // still garbage: say nothing (silentRetryTurn / ambient path stay quiet)
    }
    if (c1.trim()) return c1;
    console.error(
      '[persona] empty completion (model=' +
        (deps.modelFn(userText.length) || '?') +
        ') — retrying once with 2048 headroom',
    );
    const r2 = await _call(callOpts({ max_completion_tokens: 2048 }));
    return r2?.choices?.[0]?.message?.content || '';
  };
  let raw = '';
  try {
    raw = await callWithHeadroom();
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
      raw = await callWithHeadroom();
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
  if (!clean) {
    console.error(
      '[persona] reply cleaned to nothing (rawLen=' + raw.length + ') — staying quiet',
    );
    return null;
  }
  const replies = chunkText(clean);
  if (!replies.length) return null;
  return { replies, usedSearch: !!parsed.search };
}

// Split into 1-3 human-sized bubbles at sentence boundaries.
// 💡 REALGUY v3 (owner: "over punctuating"): every bubble gets its trailing
// period stripped — nobody ends a text with a period. ("..." and lone "."
// stay.) Applied on the short-circuit path too, not just the split path.
function stripTrailingDot(b) {
  let x = String(b || '').trim();
  if (x.length > 2 && x.endsWith('.') && !x.endsWith('...')) x = x.slice(0, -1);
  return x;
}

function chunkText(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  // REALGUY v5: separate lines = separate texts (people send 2-3 quick bubbles)
  const lines = t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (lines.length > 1) {
    const out = lines.slice(0, MAX_CHUNKS);
    if (lines.length > MAX_CHUNKS) out[MAX_CHUNKS - 1] += ' ' + lines.slice(MAX_CHUNKS).join(' ');
    return out.map((c) => stripTrailingDot(c.slice(0, CHUNK_MAX_CHARS * 2))).filter(Boolean);
  }
  if (t.length <= CHUNK_MAX_CHARS) return [stripTrailingDot(t)];
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
  return chunks
    .map((c) => stripTrailingDot(c))
    .filter(Boolean)
    .slice(0, MAX_CHUNKS);
}

// ─── L5b: stickers that MATCH what the bot actually said (REALGUY v5) ─────────
// Owner: "the stickers don't match most of the time". Old logic classified the
// USER's message and picked a random file from coarse prefix groups. Now the
// mood comes from the BOT'S OWN reply text, maps to specific files by what the
// art actually shows, never repeats the last one, and fires sparingly.
const STICKER_MAP = {
  laugh: ['smile.webp', 'confident2.webp'],
  smug: ['confident.webp', 'confident0.webp', 'confident3.webp', 'smile.webp'],
  sus: ['sus.webp', 'really.webp'],
  confused: ['confused.webp', 'nervous.webp'],
  think: ['thinkking.webp', 'interesting1.webp', 'interesting2.webp', 'interestong.webp'],
  tired: ['tired.webp', 'tired0.webp', 'tired2.webp', 'tired3.webp', 'uninterested.webp'],
  angry: ['angry.webp', 'angry0.webp', 'angry01.webp'],
  shy: ['flutred.webp', 'interesting.webp'],
  greet: ['casual.webp', 'casual001.webp', 'casualwebp.webp', 'casual01.webp'],
};
const STICKER_RULES = [
  ['angry', /\b(shut up|annoying|im mad|im done with|pissed|screw (you|that)|hate (that|this|it))\b/i],
  ['laugh', /\b(lm+a+o+|lo+l+|haha+|rofl|dead|im dying|thats funny|too funny)\b/i],
  ['shy', /\b(thanks? (bro|dude|man)|appreciate it|aww+|stop it|youre too nice|love that|means a lot)\b/i],
  ['sus', /\b(sus|suspicious|no way|yeah right|sure (you|buddy)|doubt it|uh huh|really\??$|u sure|you sure)\b/i],
  ['confused', /\b(wait what|what\??$|huh\??|im lost|dont get it|confused|bro what|what do you mean)\b/i],
  ['tired', /\b(tired|sleepy|exhausted|bored|ugh+|whatever|dont care|cba|im done|asleep|meh)\b/i],
  ['smug', /\b(easy|too easy|skill issue|cope|told you|called it|as expected|say that after|im him|you wish|clown)\b/i],
  ['think', /\b(hmm+|idk|not sure|no clue|let me think|maybe|probably|i wonder|interesting)\b/i],
  ['greet', /^(yo|ayy+|ayo|sup|whats (good|up)|hey|wsg|ayt|aight)\b/i],
];
const lastStickerFor = new Map(); // chatId -> { file, ts }
const STICKER_COOLDOWN_MS = 90 * 1000;
const STICKER_CHANCE = { laugh: 0.35, smug: 0.35, sus: 0.4, confused: 0.4, think: 0.25, tired: 0.35, angry: 0.3, shy: 0.4, greet: 0.1 };

function classifyReplyMood(replyText) {
  const t = String(replyText || '').trim();
  if (!t) return null;
  for (const [mood, re] of STICKER_RULES) if (re.test(t)) return mood;
  return null; // no clear emotion → no sticker (never a random "vibe")
}

// → basename of a sticker file to send after the reply, or null. `exists(file)`
// lets the caller confirm the asset is on disk for this bot instance.
function pickSticker({ chatId, replyText, exists }) {
  const mood = classifyReplyMood(replyText);
  if (!mood) return null;
  const now = Date.now();
  const last = lastStickerFor.get(chatId);
  if (last && now - last.ts < STICKER_COOLDOWN_MS) return null;
  if (Math.random() >= (STICKER_CHANCE[mood] || 0.2)) return null;
  const pool = STICKER_MAP[mood].filter((f) => (!exists || exists(f)) && (!last || f !== last.file));
  if (!pool.length) return null;
  const file = pool[Math.floor(Math.random() * pool.length)];
  lastStickerFor.set(chatId, { file, ts: now });
  return { file, mood };
}

// ─── L5: human sending ───────────────────────────────────────────────────────
function typingDelayMs(text) {
  const len = String(text || '').length;
  const jitter = Math.floor(Math.random() * 900);
  return Math.min(TYPING_MAX_MS, Math.max(TYPING_MIN_MS, TYPING_BASE_MS + len * TYPING_MS_PER_CHAR + jitter));
}

// L6: every send gets 1 + SEND_RETRIES background attempts; NEVER surfaces
// an error to the chat — returns false and the caller stays quiet.
// 💡 REALGUY v3 (owner 2026-10-21: "he's just sending raw messages"): Baileys
// takes the quoted message as the THIRD argument ({ quoted: m }) — stuffing
// `quoted` inside the content object is silently ignored, which is exactly why
// v2.5's "always quote" shipped dead. Same call shape as engine's sendImageSafe.
async function silentSend(sock, chatId, content, quoted) {
  let lastErr = null;
  for (let attempt = 0; attempt <= SEND_RETRIES; attempt++) {
    try {
      await sock.sendMessage(chatId, content, quoted ? { quoted } : undefined);
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
    // 💡 REALGUY v3: quote for real — third argument, not a content key
    if (opts.quoteM && i === 0) {
      const ok = await silentSend(sock, chatId, content, opts.quoteM);
      observe({ chatId, who: deps.botName, text: chunk });
      if (!ok) break;
      continue;
    }
    const ok2 = await silentSend(sock, chatId, content);
    observe({ chatId, who: deps.botName, text: chunk });
    if (!ok2) break; // silently give up on remaining chunks
  }
  try {
    await sock.sendPresenceUpdate('paused', chatId);
  } catch (e) {}
}

// L6: whole-turn silent retries — generation + tools + send, retried up to
// 2 extra times in the background. Returns null after the last failure; the
// caller NEVER tells the user.
async function silentRetryTurn(fn, opts = {}) {
  // retryOnNull: the DIRECT path treats an empty turn as a failure worth
  // retrying (owner: "try again 2 more times in the background"). Ambient
  // keeps the default false — [SILENT] there is a legitimate answer, not a
  // malfunction, and re-rolling it would burn API calls.
  const retryOnNull = !!opts.retryOnNull;
  for (let attempt = 0; attempt <= TURN_RETRIES; attempt++) {
    try {
      const r = await fn();
      if (r || !retryOnNull) return r;
      console.error(
        '[persona] turn empty (background retry ' + (attempt + 1) + '/' + (TURN_RETRIES + 1) + ')',
      );
    } catch (e) {
      console.error('[persona] turn failed (background retry ' + (attempt + 1) + '/' + (TURN_RETRIES + 1) + '):', e?.message);
    }
    if (attempt < TURN_RETRIES) await sleep(TURN_BACKOFF_MS[attempt] || 1500);
  }
  return null;
}

// L1 one-shot: roll the ambient dice, and if they hit, run a fully silent
// ambient turn (generate → maybe [SILENT] → human send). Fire-and-forget.
// 💡 REALGUY v4: engine already refuses to roll on reply-to-human threads;
// addresseeHint (tagged-someone-else) flows into the prompt as extra context.
async function maybeAmbientChime({ sock, chatId, isGroup, senderName, senderJid, text, addresseeHint }) {
  try {
    if (!shouldAmbient({ chatId, text, isGroup })) return null;
    const turn = await silentRetryTurn(() =>
      buildTurn({ chatId, senderName, senderJid, text, isAmbient: true, addresseeHint }),
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
  addMemory,
  forgetPerson,
  listMemories,
  memoryBlock,
  extractSelfFacts,
  consolidate,
  parseToolCalls,
  cleanReplyText,
  sanitizeEmoji,
  makeKeylessSearcher,
  pickSticker,
  classifyReplyMood,
  humanizeText,
  stripAiTells,
  addressedToOtherByName,
  // 💡 REALGUY v2.5: name roster
  learnPushName,
  learnMonikerFor,
  learnMonikerFromText,
  bestName,
  whoBlock,
  rosterBlock,
  _internals: { getFactsMap, formatToolResults, transcriptBlock, getNamesMap, getPersonEntry, EMOJI_ALLOW, EMOJI_BANNED, EMOJI_CHANCE },
};
