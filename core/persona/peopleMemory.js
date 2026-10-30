'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  PEOPLE MEMORY v3 (owner 2026-10-30: "the old system for saving details on people
//  is really dumb and never worked ... redesign it with all the complexity needed").
//
//  Why the old one failed: it only knew what a person typed into .likes/.note/.hobby
//  by hand (nobody does), so .roast and the AI saw an empty "ghost". This one learns
//  by WATCHING, for free, on every message, and keeps one dossier per PERSON (not per
//  chat), so what Joker learns in one group carries to the next.
//
//  A dossier holds:
//    facts    - what they said about themselves / were told to us. Each fact has a slot
//               (lives_in, job, main:<game>...) so a NEW answer replaces the OLD one
//               instead of piling up contradictions, a confidence that grows when it is
//               repeated, and recency decay so stale stuff fades.
//    traits   - behaviour measured from how they type: volume, message length, caps,
//               laughter, questions, active hours, favourite words.
//    quotes   - memorable lines, kept VERBATIM, scored for how roast/callback-worthy
//               they are (loud, absurd, oversure, cringe).
//    moments  - things that happened (game wins/losses, bot events) pushed in by the engine.
//    ties     - who they talk to most.
//    voice    - a one-line "how this person talks / who they are" written by a throttled LLM pass.
//  Retrieval is relevance-ranked and tiny, so prompts get a few good lines, not a dump.
//  Old .likes/.note/.hobby profiles are imported automatically the first time a person is seen.
// ═══════════════════════════════════════════════════════════════════════════
const KEY = 'people_mem_v3';
const TZ = process.env.PERSONA_TZ || 'Africa/Accra';
const CAP = { facts: 60, quotes: 25, moments: 20, words: 150 };
const CAT_W = { bio: 3, relationship: 2.6, pref: 2, game: 1.8, joke: 1.6, event: 1.5, habit: 1.2, other: 1 };
const CONSOLIDATE_EVERY = 14;          // own messages before a per-person LLM pass
const CONSOLIDATE_COOLDOWN = 12 * 60 * 1000;
const CONSOLIDATE_DAILY_CAP = 80;

// never auto-store: health, religion, politics, sexuality, money amounts, IDs, minors, self-harm, legal
const SENSITIVE = /\b(sick|illness|cancer|diabet|depress|anxiety|therap|medic|pills?|disorder|suicid|self.?harm|kill myself|religio|christian|muslim|islam|jesus|allah|church|atheis|trump|biden|vote|election|gay|lesbian|bisexual|trans(gender)?|lgbt|sex(ual)?|porn|virgin|salary|paid \$|owe|debt|loan|bank|password|pin code|otp|ssn|passport|id number|\d{9,}|years? old|\b1[0-7]\s?(yo|y\/o)\b|im 1[0-7]\b|i'?m 1[0-7]\b|police|arrest|jail|prison|abuse|rape|illegal)\b/i;

const STOP = new Set('the and for that this with you your are was have has not but its just like what when who how why they them their there from about been will can does did dont cant yeah yes nah the then than into over also more some very much even only still well here would could should one two get got out all any too now see say said going gonna want need know think make made let lets thing things really people guys bro dude man lol lmao omg wtf okay ok hey yo bruh fam ngl tbh idk rn fr'.split(' '));
const SLANG_KEEP = new Set(['bro', 'bruh', 'fr', 'ngl', 'tbh', 'lowkey', 'highkey', 'deadass', 'cooked', 'cracked', 'mid', 'cap', 'ong', 'bet', 'sus', 'nah', 'wallahi', 'abeg', 'omo', 'chale', 'eish']);
const SWEAR = /\b(fuck|fucking|shit|damn|bitch|ass|wtf|stfu|bastard|dumb|stupid|idiot)\b/i;
const OVERSURE = /\b(i swear|no way|literally|never|always|every ?time|100%|guaranteed|trust me|im (so )?sure|obviously|easy|facts)\b/i;

let deps = { system: null, canonical: (j) => j, oldProfile: null, gameFacts: null, llm: null, nameOf: null };
let db = null, saveTimer = null;
const recent = new Map();      // jid -> last lines (memory only, never persisted)
const pending = new Map();     // jid -> own msgs since last consolidation
const lastRun = new Map();
let busy = false, dayKey = '', dayCount = 0;

function init(d) { deps = { ...deps, ...d }; db = null; }
const canon = (j) => { try { return String(deps.canonical(String(j || '')) || j || ''); } catch { return String(j || ''); } };

function _db() {
  if (db) return db;
  try { db = (deps.system && deps.system.get(KEY, {})) || {}; } catch { db = {}; }
  if (typeof db !== 'object') db = {};
  return db;
}
function _save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { deps.system && deps.system.set(KEY, _db()); } catch (e) { console.error('[people] save failed:', e.message); }
  }, 15000);
  if (saveTimer.unref) saveTimer.unref();
}
function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } try { deps.system && deps.system.set(KEY, _db()); } catch { /* best effort */ } }

function dossier(jid, create = true) {
  const k = canon(jid); if (!k) return null;
  const all = _db();
  let d = all[k];
  if (!d && !create) return null;
  if (!d) {
    d = all[k] = { facts: [], quotes: [], moments: [], ties: {}, words: {}, voice: '', imported: false,
      t: { msgs: 0, words: 0, caps: 0, laugh: 0, q: 0, excl: 0, emoji: 0, swear: 0, hours: Array(24).fill(0), first: Date.now(), last: Date.now() } };
  }
  if (!d.imported) { d.imported = true; _importOld(k, d, jid); }
  return d;
}

// ── import the old hand-filled .likes/.note/.hobby profile once ─────────────
function _importOld(k, d, rawJid) {
  try {
    const p = deps.oldProfile && deps.oldProfile(rawJid);
    if (!p) return;
    const mem = p.memories || {};
    const add = (arr, fmt, cat) => (arr || []).forEach((x) => _addFact(d, fmt(String(x)), { cat, src: 'profile', conf: 0.9 }));
    add(mem.likes, (x) => `likes ${x}`, 'pref'); add(mem.dislikes, (x) => `dislikes ${x}`, 'pref'); add(mem.hobbies, (x) => `into ${x}`, 'pref');
    add(mem.personal, (x) => x, 'bio'); add(mem.other, (x) => x, 'other');
    (p.notes || []).slice(-8).forEach((n) => _addFact(d, typeof n === 'object' ? n.content : n, { cat: 'other', src: 'profile', conf: 0.8 }));
  } catch (_) { /* old profile is optional */ }
}

// ── facts ───────────────────────────────────────────────────────────────────
const tok = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
function similar(a, b) {
  const A = new Set(tok(a)), B = new Set(tok(b));
  if (!A.size || !B.size) return String(a).toLowerCase() === String(b).toLowerCase();
  let i = 0; A.forEach((w) => B.has(w) && i++);
  return i / Math.min(A.size, B.size) >= 0.7;
}
function _score(f, now, q) {
  const age = Math.max(0, (now - (f.last || now)) / 86400000);
  let s = (CAT_W[f.cat] || 1) * (f.conf || 0.6) + Math.min(1.2, (f.n || 1) * 0.15) - Math.min(2.5, age / 25) + (f.pin ? 5 : 0);
  if (q) tok(f.t).forEach((w) => q.has(w) && (s += 2.2));
  return s;
}
function _addFact(d, text, { cat = 'other', src = 'auto', conf = 0.6, slot = null, chatId = null } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (t.length < 4 || SENSITIVE.test(t)) return false;
  const now = Date.now();
  // same slot -> newer answer REPLACES the old one (lives in X -> lives in Y)
  if (slot) {
    const old = d.facts.find((f) => f.slot === slot);
    if (old) {
      if (similar(old.t, t)) { old.n = (old.n || 1) + 1; old.last = now; old.conf = Math.min(1, old.conf + 0.1); return false; }
      old.t = t; old.last = now; old.conf = Math.max(conf, 0.7); old.n = 1; old.src = src; return true;
    }
  }
  const dup = d.facts.find((f) => similar(f.t, t));
  if (dup) {
    dup.n = (dup.n || 1) + 1; dup.last = now; dup.conf = Math.min(1, Math.max(dup.conf || 0, conf) + 0.08);
    if (t.length >= dup.t.length) dup.t = t;
    if ((CAT_W[cat] || 1) > (CAT_W[dup.cat] || 1)) dup.cat = cat;
    return false;
  }
  d.facts.push({ t, cat: CAT_W[cat] ? cat : 'other', src, conf, slot, n: 1, first: now, last: now, chat: chatId || undefined });
  if (d.facts.length > CAP.facts) { d.facts.sort((a, b) => _score(b, now) - _score(a, now)); d.facts.length = CAP.facts; }
  return true;
}
/** Teach a fact about a person (from a command, the owner, a tool call, an LLM pass). */
function learn(jid, text, opts = {}) {
  const d = dossier(jid); if (!d) return false;
  const r = _addFact(d, text, { conf: opts.src === 'said' ? 0.9 : 0.7, ...opts });
  _save(); return r;
}
function forget(jid) { const k = canon(jid); const a = _db(); const n = a[k] ? a[k].facts.length : 0; delete a[k]; _save(); return n; }
function pin(jid, text) { const d = dossier(jid); const f = d && d.facts.find((x) => similar(x.t, text)); if (f) { f.pin = true; _save(); return true; } return false; }

// ── deterministic self-statement extraction (free) ──────────────────────────
const clip = (s, n = 40) => String(s || '').trim().replace(/\s+(and|but|so|because|cuz|tho|though|lol|lmao|rn|now|then)\b.*$/i, '').slice(0, n).trim();
const SELF = [
  [/\bi (?:really |actually |just |kinda |lowkey )?(love|like|enjoy|prefer) (?!to\b|when\b|that\b|how\b|it\b|this\b|you\b|him\b|her\b|them\b)([a-z0-9' -]{3,40})/i, 'pref', (m) => `${m[1].toLowerCase()}s ${clip(m[2])}`, (m) => `pref:${clip(m[2]).toLowerCase()}`],
  [/\bi (?:really |actually |just )?(hate|dislike|can'?t stand|cant stand) (?!when\b|that\b|how\b|it\b|this\b|you\b|him\b|her\b)([a-z0-9' -]{3,40})/i, 'pref', (m) => `${/hate/i.test(m[1]) ? 'hates' : 'dislikes'} ${clip(m[2])}`, (m) => `pref:${clip(m[2]).toLowerCase()}`],
  [/\bmy (?:fav|favorite|favourite) ([a-z ]{2,20}?) (?:is|are) ([a-z0-9' -]{2,30})/i, 'pref', (m) => `favorite ${m[1].toLowerCase()} is ${clip(m[2], 30)}`, (m) => `fav:${m[1].toLowerCase()}`],
  [/\bi (?:main|play as|use) ([a-z0-9' -]{3,25}?)(?: in | on | for |$|[.,!?])/i, 'game', (m) => `mains ${clip(m[1], 25)}`, () => 'main'],
  [/\bi(?:'m| am|m) from ([a-z][a-z .'-]{2,25})/i, 'bio', (m) => `from ${clip(m[1], 25)}`, () => 'from'],
  [/\bi live in ([a-z][a-z .'-]{2,25})/i, 'bio', (m) => `lives in ${clip(m[1], 25)}`, () => 'lives'],
  [/\bi(?:'m| am|m) (?:moving|moved) to ([a-z][a-z .'-]{2,25})/i, 'bio', (m) => `lives in ${clip(m[1], 25)}`, () => 'lives'],
  [/\bmy (?:birthday|bday) is ([a-z0-9 ,'-]{3,25})/i, 'bio', (m) => `birthday is ${clip(m[1], 25)}`, () => 'bday'],
  [/\bi (work|study) (as|at|in) ([a-z0-9 ,'-]{3,30})/i, 'bio', (m) => `${/study/i.test(m[1]) ? 'studies' : 'works'} ${m[2]} ${clip(m[3], 30)}`, (m) => (/study/i.test(m[1]) ? 'study' : 'job')],
  [/\bi(?:'m| am|m) (?:a|an) ([a-z][a-z -]{3,25}?)(?:[.,!?]|$| and | but | lol)/i, 'bio', (m) => `is a ${clip(m[1], 25)}`, () => 'identity'],
  [/\bmy (dog|cat|brother|sister|bf|gf|girlfriend|boyfriend|roommate|bestie|best friend) (?:is )?(?:named|called) ([A-Z][a-zA-Z]{2,15})/, 'relationship', (m) => `has a ${m[1].toLowerCase()} named ${m[2]}`, (m) => `rel:${m[1].toLowerCase()}`],
  [/\bi (?:got|have|own|just bought|just got) (?:a|an|the) ((?:new )?[a-z0-9' -]{3,30}?)(?:[.,!?]|$| and | but | lol)/i, 'event', (m) => `has ${clip(m[1], 30)}`, null],
  [/\bi (?:always|never|keep|can'?t stop|cant stop) ([a-z0-9' -]{4,35})/i, 'habit', (m) => `${/never/i.test(m[0]) ? 'never' : 'always'} ${clip(m[1], 35)}`, null],
];
function extractSelf(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 300 || /\?\s*$/.test(t) || /^[.!/]\w/.test(t)) return [];
  const out = [];
  for (const [re, cat, fmt, slotFn] of SELF) {
    const m = re.exec(t); if (!m) continue;
    const fact = fmt(m).replace(/\s+/g, ' ').trim();
    if (fact.length >= 6 && !SENSITIVE.test(fact)) out.push({ fact, cat, slot: slotFn ? slotFn(m) : null });
  }
  return out.slice(0, 2);
}

// ── observe a message (free, every message) ─────────────────────────────────
function _hour(ts) { try { return +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date(ts)) % 24; } catch { return new Date(ts).getUTCHours(); } }
function _quoteScore(t) {
  const n = t.length; if (n < 18 || n > 160) return 0;
  let s = 0;
  if (/!{2,}/.test(t)) s++;
  if ((t.match(/\b[A-Z]{3,}\b/g) || []).length >= 1) s++;
  if (SWEAR.test(t)) s++;
  if (OVERSURE.test(t)) s += 2;
  if (/\bi (am|was|will|can|could|would) (the )?(best|goat|unbeatable|undefeated|going to win|about to)\b|\b(easy|too easy|ez)\b/i.test(t)) s += 2;
  if (/\b(i (forgot|lost|died|fell|failed|messed|missed|crashed)|why (did|is|does|am)|how (did|is) (i|this)|cooked|im done|im dead)\b/i.test(t)) s += 1;
  if (/[😭💀🤡]/.test(t)) s++;
  return s;
}
function ingest({ jid, chatId, text, ts = Date.now(), replyToJid = null }) {
  if (!jid || typeof text !== 'string') return;
  const raw = text.trim(); if (!raw) return;
  if (/^[.!/]\w/.test(raw)) return; // bot commands say nothing about the person
  const d = dossier(jid); if (!d) return;
  const t = d.t;
  const words = raw.split(/\s+/).length;
  t.msgs++; t.words += words; t.last = ts;
  if (raw.length > 6 && raw === raw.toUpperCase() && /[A-Z]{3}/.test(raw)) t.caps++;
  if (/\b(lol|lmao|lmfao|haha+|hehe+)\b|[😭💀🤣😂]/i.test(raw)) t.laugh++;
  if (/\?/.test(raw)) t.q++;
  if (/!/.test(raw)) t.excl++;
  if (/[\u{1F300}-\u{1FAFF}]/u.test(raw)) t.emoji++;
  if (SWEAR.test(raw)) t.swear++;
  t.hours[_hour(ts)]++;
  // favourite words / signature slang
  for (const w of new Set(raw.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/))) {
    if (w.length < 3 || w.length > 14 || (STOP.has(w) && !SLANG_KEEP.has(w))) continue;
    d.words[w] = (d.words[w] || 0) + 1;
  }
  const wk = Object.keys(d.words);
  if (wk.length > 400) { wk.sort((a, b) => d.words[b] - d.words[a]); for (const w of wk.slice(CAP.words)) delete d.words[w]; }
  // memorable verbatim lines
  const qs = _quoteScore(raw);
  if (qs >= 2 && !SENSITIVE.test(raw)) {
    if (!d.quotes.some((q) => similar(q.t, raw))) {
      d.quotes.push({ t: raw.slice(0, 160), s: qs, ts, chat: chatId });
      if (d.quotes.length > CAP.quotes) { d.quotes.sort((a, b) => (b.s + (b.ts / 1e13)) - (a.s + (a.ts / 1e13))); d.quotes.length = CAP.quotes; }
    }
  }
  // who they talk to
  if (replyToJid) { const r = canon(replyToJid); if (r && r !== canon(jid)) { d.ties[r] = (d.ties[r] || 0) + 1; const tk = Object.keys(d.ties); if (tk.length > 25) { tk.sort((a, b) => d.ties[a] - d.ties[b]); delete d.ties[tk[0]]; } } }
  // self statements -> facts
  for (const f of extractSelf(raw)) _addFact(d, f.fact, { cat: f.cat, src: 'said', conf: 0.85, slot: f.slot, chatId });
  // buffer for the LLM pass (memory only)
  const rb = recent.get(canon(jid)) || []; rb.push(raw.slice(0, 160)); while (rb.length > 30) rb.shift(); recent.set(canon(jid), rb);
  pending.set(canon(jid), (pending.get(canon(jid)) || 0) + 1);
  _maybeConsolidate(jid);
  _save();
}
function moment(jid, text, kind = 'game') {
  const d = dossier(jid); if (!d || !text || SENSITIVE.test(text)) return;
  d.moments.push({ t: String(text).slice(0, 110), kind, ts: Date.now() });
  if (d.moments.length > CAP.moments) d.moments.shift();
  _save();
}

// ── throttled per-person LLM pass: durable facts + a one-line voice ─────────
function _maybeConsolidate(jid) {
  const k = canon(jid);
  if ((pending.get(k) || 0) < CONSOLIDATE_EVERY || busy || !deps.llm) return;
  if (Date.now() - (lastRun.get(k) || 0) < CONSOLIDATE_COOLDOWN) return;
  const day = new Date().toISOString().slice(0, 10);
  if (day !== dayKey) { dayKey = day; dayCount = 0; }
  if (dayCount >= CONSOLIDATE_DAILY_CAP) return;
  consolidate(jid).catch(() => {});
}
async function consolidate(jid) {
  const k = canon(jid), d = dossier(jid); const lines = recent.get(k) || [];
  if (!d || lines.length < 8 || busy || !deps.llm) return false;
  busy = true; dayCount++; lastRun.set(k, Date.now()); pending.set(k, 0);
  try {
    const known = d.facts.slice().sort((a, b) => _score(b, Date.now()) - _score(a, Date.now())).slice(0, 14).map((f) => f.t).join('; ') || 'nothing yet';
    const name = (deps.nameOf && deps.nameOf(jid)) || 'this person';
    const out = await deps.llm([
      { role: 'system', content: 'You keep private notes about one member of a friend group chat so a friend-bot can remember them. From THEIR recent messages output ONLY compact JSON: {"facts":[{"t":"short durable fact in 3rd person, max 14 words","cat":"bio|pref|game|relationship|habit|joke|event","slot":"optional key like lives|job|study|from|main"}],"voice":"max 18 words: how they talk and what theyre like, concrete not generic"}. Rules: only things they actually said or clearly showed, never guess; skip one-off moods and anything about health, religion, politics, sexuality, money, age, crime; skip what is already known; max 4 facts; if nothing durable return {"facts":[],"voice":""}.' },
      { role: 'user', content: `Person: ${name}\nAlready known: ${known}\n\nTheir recent messages:\n${lines.slice(-25).map((x) => '- ' + x).join('\n')}` },
    ]);
    const mm = String(out || '').match(/\{[\s\S]*\}/); if (!mm) return false;
    const j = JSON.parse(mm[0]);
    for (const f of (Array.isArray(j.facts) ? j.facts.slice(0, 4) : [])) if (f && f.t) _addFact(d, f.t, { cat: String(f.cat || 'other'), src: 'auto', conf: 0.6, slot: f.slot ? String(f.slot).toLowerCase().slice(0, 20) : null });
    if (j.voice && typeof j.voice === 'string' && !SENSITIVE.test(j.voice) && j.voice.length > 8) d.voice = j.voice.slice(0, 140);
    _save(); return true;
  } catch (e) { console.error('[people] consolidate failed silently:', e.message); return false; } finally { busy = false; }
}

// ── derived habits (pure stats -> human phrases) ────────────────────────────
function habits(d) {
  const t = d.t, out = [];
  if (t.msgs < 20) return out;
  const avg = t.words / t.msgs;
  if (avg <= 3) out.push(`writes tiny messages (avg ${avg.toFixed(1)} words)`);
  else if (avg >= 14) out.push(`writes essays in a group chat (avg ${Math.round(avg)} words)`);
  if (t.caps / t.msgs > 0.08) out.push('types in all caps a lot');
  if (t.laugh / t.msgs > 0.2) out.push('laughs at their own messages');
  if (t.q / t.msgs > 0.35) out.push('asks questions constantly');
  if (t.swear / t.msgs > 0.12) out.push('swears a lot');
  const total = t.hours.reduce((a, b) => a + b, 0) || 1;
  const night = (t.hours[0] + t.hours[1] + t.hours[2] + t.hours[3] + t.hours[4]) / total;
  if (night > 0.22) out.push('always up in the middle of the night');
  const early = (t.hours[5] + t.hours[6] + t.hours[7]) / total;
  if (early > 0.25) out.push('texts at dawn like a psychopath');
  if (t.msgs > 400) out.push(`${t.msgs} messages deep, never shuts up`);
  const fw = Object.entries(d.words).sort((a, b) => b[1] - a[1]).filter(([w, c]) => c >= 8 && (SLANG_KEEP.has(w) || c / t.msgs > 0.06)).slice(0, 3).map(([w]) => w);
  if (fw.length) out.push(`says "${fw.join('", "')}" constantly`);
  return out;
}

// ── retrieval ───────────────────────────────────────────────────────────────
/** compact ranked strings for a prompt: facts first, then voice + habits */
function recall(jid, { query = '', max = 6, withHabits = true } = {}) {
  const d = dossier(jid, false); if (!d) return [];
  const now = Date.now(), q = new Set(tok(query));
  const out = d.facts.slice().sort((a, b) => _score(b, now, q) - _score(a, now, q)).slice(0, max).map((f) => f.t);
  if (withHabits) {
    if (d.voice) out.push(`vibe: ${d.voice}`);
    const h = habits(d); if (h.length) out.push(h.slice(0, 2).join(', '));
  }
  return out;
}
/** text block for the old "profileText" slot (askAI / persona) */
function profileText(jid, query = '') {
  const r = recall(jid, { query, max: 7 });
  return r.length ? r.map((x) => `- ${x}`).join('\n') : '';
}
/** everything .roast needs: specific, verifiable hooks, best first */
function roastKit(jid, { max = 6 } = {}) {
  const d = dossier(jid, false);
  const kit = { facts: [], quotes: [], habits: [], moments: [], game: [], voice: '', msgs: 0 };
  if (!d) return kit;
  const now = Date.now();
  kit.msgs = d.t.msgs; kit.voice = d.voice || '';
  kit.facts = d.facts.filter((f) => ['pref', 'bio', 'game', 'habit', 'event', 'joke', 'relationship', 'other'].includes(f.cat))
    .sort((a, b) => _score(b, now) - _score(a, now)).slice(0, 5).map((f) => f.t);
  kit.quotes = d.quotes.slice().sort((a, b) => b.s - a.s || b.ts - a.ts).slice(0, 3).map((q) => q.t);
  kit.habits = habits(d).slice(0, 3);
  kit.moments = d.moments.slice(-3).map((m) => m.t);
  try { kit.game = (deps.gameFacts && deps.gameFacts(jid)) || []; } catch { kit.game = []; }
  const tie = Object.entries(d.ties).sort((a, b) => b[1] - a[1])[0];
  if (tie && tie[1] >= 8 && deps.nameOf) { const n = deps.nameOf(tie[0]); if (n) kit.habits.push(`replies to ${n} way more than anyone else`); }
  void max;
  return kit;
}
const stats = () => ({ people: Object.keys(_db()).length });

module.exports = { init, ingest, learn, forget, pin, moment, recall, profileText, roastKit, consolidate, extractSelf, flush, stats, dossier, habits };
