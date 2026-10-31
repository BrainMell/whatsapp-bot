'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  Naturalness layer (owner 2026-10-30: "make it sound more natural and human,
//  add more capabilities: context, memory..."). Pure local heuristics, zero
//  extra model calls. Gives Joker the things a real person has for free:
//   • a sense of TIME  (late night / morning / weekend)
//   • a sense of the OTHER PERSON  (how often they talk to him, how long since,
//     are they hyped / annoyed / typing in caps, how long was their message)
//   • a sense of what HE ALREADY SAID  (no stock phrases, no repeated openers)
//   • the CHAT'S OWN SLANG  (words this group keeps using, so he sounds local)
//   • length matching  (short message in -> short message out, deterministically)
// ═══════════════════════════════════════════════════════════════════════════

const TZ = process.env.PERSONA_TZ || 'Africa/Accra';
const SOCIAL_KEY = '_shared_persona_social_v1';
const OWN_RING = 10;

const STOP = new Set('the and for that this with you your are was have has not but its just like what when who how why they them their there from about been will can does did dont cant yeah this that then than into over also have more some very much even only still well here would could should one two get got out all any too now see say said going gonna want need know think make made let lets thing things really people guys lol lmao bro dude man yes nah yep nope okay ok hey yo how why were where which while after before because'.split(' '));

let store = null;           // { load(): obj, save(obj) }
let social = null;          // { [chatId]: { [jid]: {n, first, last, tone} } }
let dirty = false, saveTimer = null;
const own = new Map();      // chatId -> [recent own replies]
const slang = new Map();    // chatId -> Map(word -> count)
const lastTalk = new Map(); // chatId -> ts of last message from anyone

function init(s) { store = s || null; social = null; }
function _social() {
  if (social) return social;
  try { social = (store && store.load && store.load()) || {}; } catch { social = {}; }
  if (!social || typeof social !== 'object') social = {};
  return social;
}
function _persist() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return; dirty = false;
    try { store && store.save && store.save(social); } catch { /* best effort */ }
  }, 20000);
  if (saveTimer.unref) saveTimer.unref();
}

// ── observe every message (called from persona.observe) ─────────────────────
function noteMessage(chatId, jid, text, ts = Date.now()) {
  if (!chatId) return;
  const t = String(text || '');
  lastTalk.set(chatId, ts);
  // chat slang: lowercase-ish words used repeatedly in THIS chat
  let sm = slang.get(chatId); if (!sm) { sm = new Map(); slang.set(chatId, sm); }
  for (const w of new Set(t.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/))) {
    if (w.length < 3 || w.length > 12 || STOP.has(w)) continue;
    sm.set(w, (sm.get(w) || 0) + 1);
  }
  if (sm.size > 600) { // decay so it tracks the CURRENT mood of the chat
    for (const [w, c] of sm) { if (c <= 1) sm.delete(w); else sm.set(w, c - 1); }
  }
  if (!jid) return;
  const s = _social(); const c = (s[chatId] = s[chatId] || {});
  const p = (c[jid] = c[jid] || { n: 0, first: ts, last: ts, caps: 0 });
  // gap since we last heard from them (only meaningful if it was a real while ago)
  p._seen = ts - p.last > 3600000 ? p.last : (p._seen && ts - p._seen < 6 * 3600000 ? p._seen : null);
  p.n++; p.last = ts;
  if (t.length > 6 && t === t.toUpperCase() && /[A-Z]/.test(t)) p.caps++;
  const keys = Object.keys(c);
  if (keys.length > 150) delete c[keys.sort((a, b) => c[a].last - c[b].last)[0]]; // LRU
  _persist();
}

function noteOwnReply(chatId, text) {
  if (!chatId || !text) return;
  const a = own.get(chatId) || []; a.push(String(text).toLowerCase().trim());
  while (a.length > OWN_RING) a.shift();
  own.set(chatId, a);
}

// ── repetition guard ────────────────────────────────────────────────────────
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
function repetition(chatId, reply) {
  const prev = own.get(chatId) || [];
  if (!prev.length) return null;
  const rw = words(reply); if (!rw.length) return null;
  const set = new Set(rw);
  const recent = prev.slice(-6);
  // 1) near-duplicate of something already said
  for (const p of recent) {
    const pw = new Set(words(p)); if (!pw.size) continue;
    let inter = 0; for (const w of set) if (pw.has(w)) inter++;
    if (set.size >= 3 && inter / (set.size + pw.size - inter) >= 0.6) return 'same as something you already said';
  }
  // 2) same opener twice in the last few texts
  const open = rw.slice(0, 2).join(' ');
  if (open && recent.filter((p) => words(p).slice(0, 2).join(' ') === open).length >= 1 && rw.length > 2) return `you keep starting with "${open}"`;
  // 3) any 3-word phrase already used 2+ times lately (stock phrases)
  const tri = (ws) => { const o = []; for (let i = 0; i + 2 < ws.length; i++) o.push(ws.slice(i, i + 3).join(' ')); return o; };
  for (const g of tri(rw)) { if (recent.filter((p) => tri(words(p)).includes(g)).length >= 2) return `you keep saying "${g}"`; }
  // 4) same closing word/signoff
  const end = rw[rw.length - 1];
  if (end && end.length > 2 && recent.slice(-3).filter((p) => words(p).slice(-1)[0] === end).length >= 2) return `you keep ending texts with "${end}"`;
  return null;
}

// ── situational awareness block ─────────────────────────────────────────────
function _clock(now) {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false, weekday: 'long' }).formatToParts(new Date(now));
    return { h: +f.find((x) => x.type === 'hour').value % 24, day: f.find((x) => x.type === 'weekday').value };
  } catch { const d = new Date(now); return { h: d.getUTCHours(), day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] }; }
}
function _ago(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return null; const h = Math.round(m / 60);
  if (h < 36) return `${h} hours`; const d = Math.round(h / 24);
  return d < 14 ? `${d} days` : `${Math.round(d / 7)} weeks`;
}
function situation({ chatId, jid, name, text, isAmbient, now = Date.now() }) {
  const out = [];
  const { h, day } = _clock(now);
  const part = h < 5 ? 'its the middle of the night' : h < 9 ? 'its early morning' : h < 12 ? 'its morning' : h < 17 ? 'its afternoon' : h < 21 ? 'its evening' : 'its late at night';
  out.push(`${part} (${day}). only mention the time if it actually fits, like being sleepy at 3am`);

  const t = String(text || '');
  const wc = words(t).length;
  const caps = t.length > 6 && t === t.toUpperCase() && /[A-Z]/.test(t);
  const mood = [];
  if (caps || /!{3,}/.test(t)) mood.push('theyre hyped or yelling');
  if (/\b(lol|lmao|lmfao|haha+|😭|💀)\b|😭|💀/i.test(t)) mood.push('theyre laughing');
  if (/\b(wtf|stfu|ffs|stupid|trash|useless|annoying|hate)\b/i.test(t)) mood.push('theyre annoyed, dont get defensive or preachy');
  if (/\b(sad|tired|exhausted|stressed|bad day|rough)\b/i.test(t)) mood.push('theyre low, be a decent friend about it, no jokes at their expense');
  if (/\?\s*$/.test(t) && !mood.length) mood.push('they asked a question, answer it first');
  if (mood.length) out.push(mood.join(', '));
  // length matching
  const target = wc <= 3 ? 'one short line, under 8 words' : wc <= 10 ? 'one line, under 15 words' : wc <= 30 ? 'one or two short lines' : 'two or three short lines max';
  out.push(`they wrote ${wc} word${wc === 1 ? '' : 's'}, so reply with ${target}`);

  // the person
  if (jid && !isAmbient) {
    const p = (_social()[chatId] || {})[jid];
    if (p) {
      const since = p._seen ? _ago(now - p._seen) : null;
      if (p.n <= 3) out.push(`${name || 'they'} barely talks in this chat so far, you dont know them well yet`);
      else if (p.n > 150) out.push(`${name || 'they'} is one of the regulars, you two are comfortable, tease freely`);
      else if (p.n > 40) out.push(`you know ${name || 'them'} a bit from this chat`);
      if (since && p._seen) out.push(`you havent seen ${name || 'them'} around for about ${since}, a quick "yo where you been" is natural if it fits`);
    }
  }
  // chat slang
  const sm = slang.get(chatId);
  if (sm && sm.size > 20) {
    const top = [...sm.entries()].filter(([, c]) => c >= 4).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
    if (top.length >= 3) out.push(`words this chat uses a lot lately: ${top.join(', ')}. use them only if natural, never force`);
  }
  // what he already said
  const prev = (own.get(chatId) || []).slice(-3);
  if (prev.length) out.push(`your last texts here were: ${prev.map((x) => `"${x.slice(0, 60)}"`).join(' | ')}. say something different, new words, new opener`);
  return out.join('\n');
}

// ── deterministic length clamp ──────────────────────────────────────────────
function clampLength(reply, userText) {
  const wc = words(userText).length;
  const limit = wc <= 3 ? 14 : wc <= 10 ? 26 : 60;
  const lines = String(reply).split('\n').filter(Boolean);
  let total = 0; const keep = [];
  for (const l of lines) {
    const n = words(l).length;
    if (keep.length && total + n > limit) break;
    keep.push(l); total += n;
  }
  let out = keep.join('\n');
  if (words(out).length > limit * 1.6) { // one monster line: cut at the first sentence end
    const m = out.match(/^(.{20,}?[.!?])(\s|$)/);
    if (m) out = m[1];
  }
  return out;
}


// ── filler limiter + owner bans (owner 2026-10-30: "you really like saying lol", it never stopped) ──
// Telling a model to stop saying a word doesn't work reliably, so it is enforced in code:
//   * stock fillers (lol, lmao, bro...) are allowed at most once per ~6 of his replies per chat
//   * words the owner told him to drop are removed from every reply, for a day (persisted)
const FILLERS = ['lol', 'lmao', 'lmfao', 'haha', 'bro', 'dude', 'bruh', 'fr', 'ngl', 'tbh', 'lowkey', 'fam'];
const BANS_KEY = '_shared_persona_word_bans';
const BAN_TTL = 24 * 3600 * 1000;
function bans() {
  try {
    const v = (store && store.loadBans && store.loadBans()) || [];
    return (Array.isArray(v) ? v : []).filter((b) => Date.now() - b.ts < BAN_TTL);
  } catch { return []; }
}
function addBan(word) {
  const w = String(word || '').toLowerCase().replace(/[^a-z']/g, '');
  if (w.length < 2 || w.length > 14) return false;
  const list = bans().filter((b) => b.w !== w); list.push({ w, ts: Date.now() });
  try { store && store.saveBans && store.saveBans(list.slice(-20)); } catch (_) {}
  return true;
}
/** owner said "stop saying X" / "turn it down" -> ban the word (or his most overused filler) */
function learnBansFromOwner(chatId, text) {
  const t = String(text || '').toLowerCase();
  let hit = false;
  const m = /\b(?:stop|quit|dont|don't|do not|never|no more|enough)\s+(?:with\s+)?(?:saying|using|typing|spamming|say|use)\s+(?:the word\s+|so much\s+|that\s+)?["'“]?([a-z']{2,14})/.exec(t);
  if (m && !/^(that|it|this|the|so|too|those|these)$/.test(m[1])) hit = addBan(m[1]) || hit;
  if (!hit && /\b(turn (it|that|them) down|tone (it|that) down|too (much|many)|so (much|many)|less of (it|that)|ease off|calm down with|cut (it|that) out|overdoing|over ?using|keep saying)\b/.test(t)) {
    // which filler has he been overusing lately? ban that one
    const prev = (own.get(chatId) || []).slice(-8).join(' ');
    const named = FILLERS.find((f) => new RegExp(`\\b${f}\\b`).test(t)); // owner named it ("saying lol so much")
    let pick = named;
    if (!pick) {
      const counts = FILLERS.map((f) => [f, (prev.match(new RegExp(`\\b${f}\\b`, 'g')) || []).length]).sort((a, b) => b[1] - a[1]);
      if (counts[0][1] >= 1) pick = counts[0][0];
    }
    if (pick) hit = addBan(pick) || hit;
  }
  return hit;
}
function _stripWord(t, w) { return t.replace(new RegExp(`(^|[\\s,.!?])${w}(?=$|[\\s,.!?])[,.!?]*`, 'gi'), '$1'); }
/** deterministic pass over a finished reply */
function limitFillers(chatId, text) {
  let t = String(text || '');
  for (const b of bans()) t = _stripWord(t, b.w);
  const prev = (own.get(chatId) || []).slice(-6).join(' ');
  for (const f of FILLERS) {
    const re = new RegExp(`\\b${f}\\b`, 'gi');
    const inReply = (t.match(re) || []).length; if (!inReply) continue;
    const recentUse = (prev.match(re) || []).length;
    if (recentUse >= 1 || inReply > 1) t = _stripWord(t, f); // used lately (or twice in one reply): drop it
  }
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])(?=\s|$)/g, '$1').replace(/^[,.\s]+(?!j\b)/, '').trim();
}

module.exports = { limitFillers, learnBansFromOwner, addBan, init, noteMessage, noteOwnReply, repetition, situation, clampLength, SOCIAL_KEY };
