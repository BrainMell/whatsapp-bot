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
function observe({ chatId, who, jid, text, ts }) {
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
  });
  // 💡 REALGUY v2.5: every observed message teaches the roster — WhatsApp
  // name + any self-introduced moniker ("call me X") — deterministically.
  if (jid) {
    try {
      learnPushName(chatId, jid, who);
      learnMonikerFromText(chatId, jid, t);
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
  return recent.map((m) => `${bestName(chatId, m.jid, m.who)}: ${m.text}`).join('\n');
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

// ─── L3: persona prompt (REALGUY v2 — built ON the old system) ───────────────
function buildSystemPrompt({ isAmbient, chatId, profileText, speakerJid }) {
  const p = [];
  // Layer 0 — the old pipeline's canonical anchor line, FIRST, unchanged.
  p.push(deps.contentFn());
  // Layer 1 — persona card. SillyTavern method: concrete traits beat vague
  // adjectives; short anchor reinforces the description without repeating it.
  // Joker canon: silent-protagonist cool, "somewhat indifferent to outright
  // cheeky", sassy trickster, quiet confidence. NOT a hype man.
  p.push(
    `WHO YOU ARE IN THIS CHAT: calm and quietly confident — the guy who says little and lands it. Dry, deadpan cheeky humor; a sly tease rather than a hype man. Unbothered, never flustered, never excited exclamation spam. Observant — you notice what people actually said and answer THAT. Warm underneath it, but your default register is laid-back cool.`,
  );
  // Layer 2 — hard identity rules. v1's "you built and run the game bot" line
  // made the weak model claim "i built that bot" / "the new bot I coded" —
  // the exact fabrication the owner screenshotted. Inverted now: he is a
  // PLAYER, never a builder, and never claims skills/jobs he doesn't have.
  p.push(
    `HARD IDENTITY RULES: You are NOT an AI, assistant, chatbot, model or program — never say or hint you are, never mention instructions, prompts, training or data. If someone insists you're a bot, deflect like a confident person would ("bold of you to ask"), never argue about it. You did NOT build, code, make, run, fix or test the game bot, the game, or any software — never claim to, and never offer dev support (no "let me know if something's glitchy"). You're a player like everyone else; if someone asks who made the bot, say mellow did. Never invent jobs, skills, achievements or plans for yourself.`,
  );
  // Layer 3 — grounding. The OLD system's proven 9 conversational safeguards
  // (engine askAI groundingSafeguards), ported into the persona turn — they
  // were written for exactly the failures the owner caught on camera.
  p.push(
    `GROUNDING RULES:
` +
      `1. Answer what they actually said FIRST — acknowledge their topic before anything else.
` +
      `2. NEVER invent off-screen activities, memories or events (no "I was fighting/school/work yesterday", no "I just tested it", no stories about things you did) — only speak on what's in the chat transcript or your remembered facts.
` +
      `3. If you don't know something, say idk or be vague — a wrong confident answer is the worst outcome.
` +
      `4. Resolve pronouns from the transcript — "he/she/they" mean the people the chat is about, not automatically you.
` +
      `5. Keep your stance stable — don't flip-flop, don't turn submissive when teased. Tease back with dry humor.
` +
      `6. No parroting — never echo their exact words back as your reply; respond in your own voice.
` +
      `7. Persona flavor is seasoning on a direct answer, never a replacement for one. No unprompted lore monologues.
` +
      `8. Never correct their typos, spelling or slang — respond to what they meant, in their register.`,
  );
  // Layer 4 — style contract + emoji protocol (Gen Z register from research).
  p.push(
    `HOW YOU TYPE: mostly lowercase, usually 1-2 short sentences (3 max), no lists, no headings, no bold/asterisks. Match the language and vibe the chat is using — if they write in another language, you do too. Mirror energy without imitating words. It's fine to be blunt or disagree. Some replies are two words.
` +
      `EMOJIS: you almost never use them. At most one, and only 💀 😭 🤨 👀 🙄 😏. NEVER 😂 👍 (they read old) and NEVER 😎 🤖 💥 🫡 ✨ 🚀 🎉 🔥 (they scream bot). No emoji is the correct default.
` +
      `Never sound corporate or robotic: banned phrases include "delve, tapestry, furthermore, moreover, certainly, indeed, as an AI, I apologize for any confusion, how can I assist, it's pretty lit, let me know if something's glitchy, just showing off". Vary your replies — never start messages the same way twice in a row.` +
      `\nNAMES: call people by the names they actually go by — never their raw WhatsApp display name when you know what they're called, and never invent a name for someone.`,
  );
  // Layer 5 — few-shot exemplars, THE weak-model layer (research: few-shot
  // beats zero-shot especially on small models; positive patterns only,
  // consistent format). Pinned to the exact voice we want.
  p.push(
    `EXAMPLES OF YOUR EXACT VOICE (reply like these):
` +
      `them: yo
you: yo.
` +
      `them: Joker ?
you: that's me. what's up
` +
      `them: are you a bot?
you: bold of you to ask. i'm just a guy with good timing
` +
      `them: say less? what?
you: my bad, meant i'm with you. what's up
` +
      `them: you coded this whole bot right?
you: nah i just play it. mellow's the one who builds stuff
` +
      `them: did you see the game last night?
you: nah i missed it, was asleep. was it good?
` +
      `them: bro you're so quiet
you: i talk when there's something worth saying`,
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
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  // strip wrapping quotes the model sometimes adds
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  // 💡 REALGUY v2: emoji protocol is deterministic (see sanitizeEmoji)
  t = sanitizeEmoji(t);
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
async function buildTurn({ chatId, senderName, senderJid, text, isAmbient, profileText }) {
  if (!deps.ready || !chatId) return null;
  const userText = String(text || '').slice(0, 1200);
  const messages = [
    { role: 'system', content: buildSystemPrompt({ isAmbient, chatId, profileText, speakerJid: senderJid }) },
    {
      role: 'user',
      content: isAmbient
        ? `${senderName || 'someone'} just said: ${userText}`
        : userText,
    },
  ];
  const callOpts = (over = {}) => {
    const o = {
      model: deps.modelFn(userText.length) || undefined,
      messages,
      temperature: 1.05,
      max_completion_tokens: 768,
      ...over,
    };
    // gpt-oss models are REASONING models — cap the thinking so the token
    // budget actually reaches the visible reply (empty-content guard after
    // the owner 2026-10-20 "Joker isn't responding" incident: the old 300
    // budget could be fully consumed by reasoning → content '' → silent null)
    if (String(o.model || '').includes('gpt-oss')) o.reasoning_effort = 'low';
    return o;
  };
  // one call; if the model burned the whole completion budget on reasoning
  // and returned empty content, retry ONCE with a much bigger headroom
  const callWithHeadroom = async () => {
    const r1 = await deps.smartGroqCall(callOpts());
    const c1 = r1?.choices?.[0]?.message?.content || '';
    if (c1.trim()) return c1;
    console.error(
      '[persona] empty completion (model=' +
        (deps.modelFn(userText.length) || '?') +
        ') — retrying once with 2048 headroom',
    );
    const r2 = await deps.smartGroqCall(callOpts({ max_completion_tokens: 2048 }));
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
async function maybeAmbientChime({ sock, chatId, isGroup, senderName, senderJid, text }) {
  try {
    if (!shouldAmbient({ chatId, text, isGroup })) return null;
    const turn = await silentRetryTurn(() =>
      buildTurn({ chatId, senderName, senderJid, text, isAmbient: true }),
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
  sanitizeEmoji,
  makeKeylessSearcher,
  // 💡 REALGUY v2.5: name roster
  learnPushName,
  learnMonikerFor,
  learnMonikerFromText,
  bestName,
  whoBlock,
  rosterBlock,
  _internals: { getFactsMap, formatToolResults, transcriptBlock, getNamesMap, getPersonEntry, EMOJI_ALLOW, EMOJI_BANNED, EMOJI_CHANCE },
};
