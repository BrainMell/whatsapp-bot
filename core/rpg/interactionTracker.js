// ============================================
// ⚡ INTERACTION TRACKER - tags / mentions / replies per pair
// ============================================
// Owner directive (2026-09-17): the ship Match Meter needs a MAJOR factor
// based on who actually tags, mentions and replies to whom. Silent pairs
// must NOT coast to 60% on name vibes alone.
// Owner directive v2 (2026-09-17): the bond is RELATIVE - "percentage of
// interaction with this person compared to interaction with everyone else",
// not raw volume. Someone who spends 80% of their interaction time on one
// person ships high with them; a one-off tag among 40 partners does not.
//
// What counts as an interaction:
//   * @-tagging someone (mentionedJid, any message type with contextInfo)
//   * replying / quoting someone's message (contextInfo.participant)
// Recorded BOTH directions (A stores B, B stores A) so either side can
// score the pair. Each entry keeps initiator semantics:
//   c   = total events involving the pair (as seen by this user)
//   out = events INITIATED by this user (drives the .j history arrows)
//   t   = last event ts, to = last user-initiated ts
//   h   = newest-first ring [{y:'m'|'r', t, d:1|0}] (d=1 owner initiated)
//
// MEMORY MANAGEMENT (deliberate):
//   * only REGISTERED users are tracked (economy.getUser returns null for
//     lurkers - no profiles are created for them)
//   * per-user cap of MAX_PAIRS pairs (evict lowest-count, oldest-first)
//   * per-pair count capped at MAX_COUNT (log curve saturates anyway)
//   * per-pair recent-event ring capped at HIST_CAP entries
//   * writes are in-memory only; a single setInterval flushes dirty users
//     to Mongo every FLUSH_MS (survives via the normal saveUser path)
//   * recordMessage is synchronous, allocation-light and swallows every
//     error - it can NEVER break or slow the message pipeline

const economy = require('./economy');

const MAX_PAIRS = 40;
const MAX_COUNT = 300;
const HIST_CAP = 5;
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
// Total interaction volume of a user across ALL their partners (relative
// share denominator). One pass over <= 40 small entries.
function mapTotal(map) {
  if (!map) return 0;
  let sum = 0;
  const entries = typeof map.entries === 'function' ? [...map.entries()] : Object.entries(map);
  for (const [, v] of entries) sum += (v && v.c) || 0;
  return sum;
}

function ensureMap(user) {
  if (!user.profile) user.profile = {};
  if (!user.profile.interactions) user.profile.interactions = {};
  return user.profile.interactions;
}

// Copy-on-write bump: always set a NEW object so Mongoose change detection
// (Mixed values inside a Map) notices the mutation.
// type: 'm' = tagged/mentioned, 'r' = replied/quoted.
// initiated: true when THIS user performed the action, false when they
// received it (the reciprocal write).
function bump(user, otherJid, now, type, initiated) {
  const map = ensureMap(user);
  const k = esc(otherJid);
  const prev = mapGet(map, k);
  const c = Math.min(MAX_COUNT, ((prev && prev.c) || 0) + 1);
  const out = ((prev && typeof prev.out === 'number') ? prev.out : 0) + (initiated ? 1 : 0);
  const prevH = prev && Array.isArray(prev.h) ? prev.h : [];
  const h = [{ y: type === 'r' ? 'r' : 'm', t: now, d: initiated ? 1 : 0 }, ...prevH].slice(0, HIST_CAP);
  mapSet(map, k, {
    c,
    out,
    t: now,
    to: initiated ? now : ((prev && prev.to) || 0),
    h,
  });

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
    const mentioned = new Set();
    const replied = new Set();
    for (const type of Object.keys(m.message)) {
      const node = m.message[type];
      if (!node || typeof node !== 'object' || !node.contextInfo) continue;
      const ci = node.contextInfo;
      if (Array.isArray(ci.mentionedJid)) {
        for (const j of ci.mentionedJid) mentioned.add(j);
      }
      if (ci.participant) replied.add(ci.participant);
    }
    const targets = new Set([...mentioned, ...replied]);
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

      // A reply is the stronger signal - when a target is both mentioned
      // and replied-to in the same message, log it as a reply.
      const type = replied.has(raw) ? 'r' : 'm';

      const u = economy.getUser(sender); // registered users only
      if (!u) return;
      bump(u, t, now, type, true);
      dirty.add(sender);

      const other = economy.getUser(t);
      if (other) {
        bump(other, sender, now, type, false);
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
 *
 * RELATIVE (owner v2 directive): the dominant term is how much of each
 * user's total interaction activity involves the OTHER person
 * (mutualShare = min of the two shares - both sides must focus on each
 * other). A small absolute-volume term keeps 2-message pairs from maxing
 * out, and a dampener scales tiny samples down.
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

  // RELATIVE focus: what fraction of each user's whole interaction life
  // involves this partner. min() = mutual focus (kills one-sided stalking).
  const totA = mapTotal(interOf(p1));
  const totB = mapTotal(interOf(p2));
  const shareA = totA > 0 ? ((a && a.c) || 0) / totA : 0;
  const shareB = totB > 0 ? ((b && b.c) || 0) / totB : 0;
  const mutualShare = Math.min(shareA, shareB);          // 0..1
  const relScore = 100 * Math.sqrt(mutualShare);         // 100% -> 100, 50% -> 71, 10% -> 32
  const volume = Math.min(100, 28 * Math.log(1 + n));    // absolute floor
  const damp = Math.min(1, n / 10);                      // tiny samples can't max out
  const base = relScore * damp * 0.7 + volume * 0.3;
  return Math.max(2, Math.min(100, Math.round(base * rec)));
}

/**
 * Full structured history for a pair (raw data - used by the .j history
 * command and tests). Accepts full users or bare profiles, either may be
 * null (unregistered side). Returns { aToB, bToA, total, lastTs, score,
 * shareA, shareB }.
 */
function getPairHistory(p1, p2, jid1, jid2) {
  const interOf = (p) => (p && ((p.profile && p.profile.interactions) || p.interactions)) || null;
  const grab = (p, other) => {
    const map = interOf(p);
    if (!map || !other) return null;
    const rec = mapGet(map, esc(other));
    return rec && rec.c > 0 ? rec : null;
  };
  const aToB = grab(p1, jid2);
  const bToA = grab(p2, jid1);
  // max() = true event count (both directions mirror the same events when
  // both sides are registered; sum() would double-count).
  const total = Math.max((aToB && aToB.c) || 0, (bToA && bToA.c) || 0);
  const lastTs = Math.max((aToB && aToB.t) || 0, (bToA && bToA.t) || 0);
  const score = total > 0 ? getInteractionScore(p1, p2, jid1, jid2) : null;
  const totA = mapTotal(interOf(p1));
  const totB = mapTotal(interOf(p2));
  return {
    aToB, bToA, total, lastTs, score,
    shareA: totA > 0 ? Math.round((((aToB && aToB.c) || 0) / totA) * 100) : 0,
    shareB: totB > 0 ? Math.round((((bToA && bToA.c) || 0) / totB) * 100) : 0,
  };
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Render the .j history card. Resolves display names via economy, reads
 * the tracked pair data, returns { ok, text } - engine just sends text.
 */
function renderPairHistory(jid1, jid2) {
  try {
    if (!jid1 || !jid2) {
      return { ok: false, text: '❌ Tag two people (or reply to one) — e.g. `.j history @a @b`' };
    }
    if (jid1 === jid2) {
      return { ok: false, text: '❌ Tag two *different* people to see their interaction history.' };
    }
    const name1 = economy.getDisplayName(jid1);
    const name2 = economy.getDisplayName(jid2);
    const u1 = economy.getUser(jid1);
    const u2 = economy.getUser(jid2);
    const hist = getPairHistory(u1, u2, jid1, jid2);

    if (!hist || hist.total === 0) {
      return {
        ok: true,
        text: [
          '🤝 *INTERACTION HISTORY*',
          `*${name1} × ${name2}*`,
          '',
          '📭 No logged interactions yet.',
          '',
          'Tags, mentions and replies are tracked automatically. Once these two start talking, this fills up — and their ship score climbs with it (silent pairs ship LOW).',
        ].join('\n'),
      };
    }

    const a = hist.aToB || { c: 0, out: 0 };
    const b = hist.bToA || { c: 0, out: 0 };
    const outA = a.out || 0;
    const outB = b.out || 0;
    const outTotal = outA + outB;
    const hasOutA = typeof a.out === 'number';
    const hasOutB = typeof b.out === 'number';
    // Legacy (pre-v3) entries have no initiator data - show the raw count
    // without a direction claim instead of a misleading "0 initiated".
    const dirLine = (fromName, toName, rec) => {
      if (!rec || !rec.c) return `💬 *${fromName} → ${toName}*: 0 initiated`;
      if (typeof rec.out === 'number') {
        return `💬 *${fromName} → ${toName}*: ${rec.out} initiated · last ${timeAgo(rec.to || rec.t)}`;
      }
      return `💬 *${fromName} → ${toName}*: ${rec.c} logged · last ${timeAgo(rec.t)}`;
    };

    const lines = [
      '🤝 *INTERACTION HISTORY*',
      `*${name1} × ${name2}*`,
      '',
      dirLine(name1, name2, a),
      dirLine(name2, name1, b),
      `📊 Total events: *${hist.total}*`,
    ];
    if (hasOutA && hasOutB && outTotal > 0 && outA > 0 && outB > 0) {
      const pa = Math.round((outA / outTotal) * 100);
      lines.push(
        `⚖️ Balance: ${pa}% / ${100 - pa}% ` +
        (outA === outB
          ? '(perfectly mutual)'
          : pa > 50 ? `(${name1} initiates more)` : `(${name2} initiates more)`),
      );
    } else if (hasOutA && hasOutB && (outA === 0 || outB === 0)) {
      lines.push('⚖️ One-sided so far — only one of them has been initiating.');
    }
    lines.push(
      `🔗 Relative focus: ${name1} spends *${hist.shareA}%* of their interaction time on ${name2} · ${name2} spends *${hist.shareB}%* on ${name1}`,
    );
    lines.push(
      `💫 Bond strength: *${hist.score == null ? 0 : hist.score}/100* — major factor (40%) of the ship score`,
    );

    // Recent events: merge both directions' rings, newest first. d=1 means
    // the map owner initiated - flip names accordingly.
    const events = [];
    const pushH = (rec, ownerName, otherName) => {
      if (rec && Array.isArray(rec.h)) {
        for (const ev of rec.h) {
          if (ev && ev.t) {
            events.push({
              t: ev.t,
              text: ev.d === 1
                ? `${ownerName} ${ev.y === 'r' ? 'replied to' : 'tagged'} ${otherName}`
                : `${otherName} ${ev.y === 'r' ? 'replied to' : 'tagged'} ${ownerName}`,
            });
          }
        }
      }
    };
    pushH(hist.aToB, name1, name2);
    pushH(hist.bToA, name2, name1);
    events.sort((x, y) => y.t - x.t);
    if (events.length > 0) {
      lines.push('', '🕘 *Recent*');
      for (const ev of events.slice(0, HIST_CAP)) {
        lines.push(`• ${ev.text} · ${timeAgo(ev.t)}`);
      }
    }
    return { ok: true, text: lines.join('\n') };
  } catch (e) {
    return { ok: false, text: '❌ Could not read the interaction log right now.' };
  }
}

module.exports = { recordMessage, flush, getInteractionScore, getPairHistory, renderPairHistory };
