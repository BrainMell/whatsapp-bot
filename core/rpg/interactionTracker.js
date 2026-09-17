// ============================================
// ⚡ INTERACTION TRACKER - tags / mentions / replies per pair
// ============================================
// Owner directive (2026-09-17): the ship Match Meter needs a MAJOR factor
// based on who actually tags, mentions and replies to whom. Silent pairs
// must NOT coast to 60% on name vibes alone.
//
// What counts as an interaction:
//   * @-tagging someone (mentionedJid, any message type with contextInfo)
//   * replying / quoting someone's message (contextInfo.participant)
// Recorded BOTH directions (A stores B, B stores A) so either side can
// score the pair.
//
// MEMORY MANAGEMENT (deliberate):
//   * only REGISTERED users are tracked (economy.getUser returns null for
//     lurkers - no profiles are created for them)
//   * per-user cap of MAX_PAIRS pairs (evict lowest-count, oldest-first)
//   * per-pair count capped at MAX_COUNT (log curve saturates anyway)
//   * writes are in-memory only; a single setInterval flushes dirty users
//     to Mongo every FLUSH_MS (survives via the normal saveUser path)
//   * recordMessage is synchronous, allocation-light and swallows every
//     error - it can NEVER break or slow the message pipeline
//
// Scores (getInteractionScore): log-scaled combined counts with a recency
// multiplier on the last interaction (1.0 <=3d ... 0.3 >30d).

const economy = require('./economy');

const MAX_PAIRS = 40;
const MAX_COUNT = 300;
const FLUSH_MS = 5 * 60 * 1000;

const dirty = new Set();
let _flushTimer = null;

const esc = (jid) => String(jid || '').replace(/\./g, '_');

function mapGet(map, k) {
  if (!map) return undefined;
  return typeof map.get === 'function' ? map.get(k) : map[k];
}
function mapSet(map, k, v) {
  if (typeof map.set === 'function') map.set(k, v);
  else map[k] = v;
}
function mapSize(map) {
  if (!map) return 0;
  return typeof map.size === 'number' ? map.size : Object.keys(map).length;
}

function ensureMap(user) {
  if (!user.profile) user.profile = {};
  if (!user.profile.interactions) user.profile.interactions = {};
  return user.profile.interactions;
}

// Copy-on-write bump: always set a NEW object so Mongoose change detection
// (Mixed values inside a Map) notices the mutation.
function bump(user, otherJid, now) {
  const map = ensureMap(user);
  const k = esc(otherJid);
  const prev = mapGet(map, k);
  const c = Math.min(MAX_COUNT, ((prev && prev.c) || 0) + 1);
  mapSet(map, k, { c, t: now });

  // evict beyond cap: lowest count first, oldest as tie-break
  if (mapSize(map) > MAX_PAIRS) {
    let evictKey = null, evictC = Infinity, evictT = Infinity;
    const entries = typeof map.entries === 'function'
      ? [...map.entries()]
      : Object.entries(map);
    for (const [ek, ev] of entries) {
      const c2 = (ev && ev.c) || 0;
      const t2 = (ev && ev.t) || 0;
      if (c2 < evictC || (c2 === evictC && t2 < evictT)) {
        evictKey = ek; evictC = c2; evictT = t2;
      }
    }
    if (evictKey && evictKey !== k) {
      if (typeof map.delete === 'function') map.delete(evictKey);
      else delete map[evictKey];
    }
  }
}

/**
 * Record tags/mentions/replies from one incoming message.
 * opts: { isGroup, botJid, botLid, normalize }
 */
function recordMessage(m, senderJid, chatId, opts = {}) {
  try {
    if (!opts.isGroup || !m || !m.message || !senderJid) return;
    const norm = opts.normalize || (j => j);
    const targets = new Set();
    for (const type of Object.keys(m.message)) {
      const node = m.message[type];
      if (!node || typeof node !== 'object' || !node.contextInfo) continue;
      const ci = node.contextInfo;
      if (Array.isArray(ci.mentionedJid)) {
        for (const j of ci.mentionedJid) targets.add(j);
      }
      if (ci.participant) targets.add(ci.participant);
    }
    if (targets.size === 0) return;

    const now = Date.now();
    const sender = norm(senderJid);
    for (const raw of targets) {
      let t = norm(raw);
      if (!t || !t.includes('@')) continue;
      if (t.endsWith('@g.us') || t.endsWith('@newsletter') || t.endsWith('@broadcast')) continue;
      if (opts.botJid && t === opts.botJid) continue;
      if (opts.botLid && t === opts.botLid) continue;
      if (t === sender) continue;

      const u = economy.getUser(sender); // registered users only
      if (!u) return;
      bump(u, t, now);
      dirty.add(sender);

      const other = economy.getUser(t);
      if (other) {
        bump(other, sender, now);
        dirty.add(t);
      }
    }
  } catch (e) {
    // NEVER break the message pipeline
  } finally {
    ensureFlushTimer();
  }
}

async function flush() {
  if (dirty.size === 0) return 0;
  const jids = [...dirty];
  dirty.clear();
  let saved = 0;
  for (const j of jids) {
    try { await economy.saveUser(j); saved++; } catch (e) {}
  }
  return saved;
}

function ensureFlushTimer() {
  if (_flushTimer) return;
  _flushTimer = setInterval(() => { flush().catch(() => {}); }, FLUSH_MS);
  if (_flushTimer.unref) _flushTimer.unref();
}

/**
 * Interaction score for a pair from BOTH user objects (either shape:
 * full user or bare profile). Returns 0..100, or null when the pair has
 * zero recorded interactions in both directions.
 */
function getInteractionScore(p1, p2, jid1, jid2) {
  const interOf = (p) => (p && ((p.profile && p.profile.interactions) || p.interactions)) || null;
  const grab = (p, other) => {
    const map = interOf(p);
    if (!map || !other) return null;
    const rec = mapGet(map, esc(other));
    return rec && rec.c > 0 ? rec : null;
  };
  const a = grab(p1, jid2);
  const b = grab(p2, jid1);
  if (!a && !b) return null;
  const n = ((a && a.c) || 0) + ((b && b.c) || 0);
  const last = Math.max((a && a.t) || 0, (b && b.t) || 0);
  const days = last ? (Date.now() - last) / 86400000 : 999;
  const rec = days <= 3 ? 1.0 : days <= 7 ? 0.8 : days <= 14 ? 0.65 : days <= 30 ? 0.45 : 0.3;
  return Math.min(100, Math.round(28 * Math.log(1 + n) * rec));
}

module.exports = { recordMessage, flush, getInteractionScore };
