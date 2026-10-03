// gcActivity.js - DAILY GC ACTIVITY (2026-09-22, owner's ".j activity" order)
//
// Owner's findings that drove this module:
//   1. "the .j activity is broken, counts seem wrong" - the old bare command
//      summed the ALL-TIME ChatActivity counters and labeled it "this session".
//      Nothing was wrong with the writes; the label and the semantics were.
//   2. "the default today shouldn't be the last 24 hours, but since midnight" -
//      day windows now start at MIDNIGHT in the bot's day timezone, not at
//      now-24h.
//   3. "the .j activity for that day says 600k all the time" - there was no
//      per-day command at all; date questions fell through to the AI chat,
//      which simply made numbers up. This module gives the command REAL data:
//      messages / images / videos / stickers / audio / documents / contacts /
//      locations / polls / links deleted / joined / left / kicked / promote /
//      demote, plus the top posters of the day.
//
// Own-module design (gcOwners.js pattern): QA can runtime-test the real
// logic without booting the engine. The engine command handler is a thin
// wrapper over accraDayRangeFromArg() + getDailyBreakdown() + formatCard().

const ACTIVITY_TZ = 'Africa/Accra'; // owner's timezone - the "day" the GC lives in

// ── Timezone helpers (Intl-based, no deps, no server-TZ dependence) ─────────

// Offset (ms) a zone is AHEAD of UTC at the given instant.
function tzOffsetMs(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    (+parts.hour) % 24, +parts.minute, +parts.second,
  );
  return asUTC - date.getTime();
}

// YYYY-MM-DD of `date` as seen in the activity timezone (en-CA = ISO order).
function dayKey(date, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || ACTIVITY_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// [start, end) Date range of the local day `key` (YYYY-MM-DD) in the zone.
function dayRange(key, tz) {
  const zone = tz || ACTIVITY_TZ;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d, 12)); // noon probe avoids DST edges
  const off = tzOffsetMs(zone, probe);
  const start = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) - off);
  const end = new Date(Date.UTC(y, mo - 1, d + 1, 0, 0, 0) - off);
  return { start, end };
}

// ── Argument parsing ─────────────────────────────────────────────────────────

// Accepts: (nothing) | today | yesterday | YYYY-MM-DD | DD-MM-YYYY |
// DD/MM/YYYY | DD-MM | DD/MM | a bare day-of-month number.
// Returns { start, end, label } or { error } (usage text lives in engine).
function dayRangeFromArg(arg) {
  const now = new Date();
  const todayKey = dayKey(now);

  const fromKey = (key, label) => {
    const range = dayRange(key);
    if (!range) return { error: true };
    return { ...range, label: label || key };
  };

  const shiftKey = (key, days) => {
    const [y, mo, d] = key.split('-').map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d + days, 12));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  };

  const raw = String(arg || '').trim().toLowerCase();

  if (!raw || raw === 'today') return fromKey(todayKey, 'today (since midnight)');
  if (raw === 'yesterday' || raw === 'yday') {
    return fromKey(shiftKey(todayKey, -1), 'yesterday');
  }

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (m) {
    const key = `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
    return fromKey(key);
  }

  // DD/MM/YYYY or DD-MM-YYYY (day-first - the owner writes it that way)
  m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(raw);
  if (m) {
    const key = `${m[3]}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    return fromKey(key);
  }

  // DD/MM or DD-MM (current year)
  m = /^(\d{1,2})[\/\-](\d{1,2})$/.exec(raw);
  if (m) {
    const key = `${todayKey.slice(0, 4)}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    return fromKey(key);
  }

  // Bare number = day of the current month
  m = /^(\d{1,2})$/.exec(raw);
  if (m) {
    const key = `${todayKey.slice(0, 7)}-${String(+m[1]).padStart(2, '0')}`;
    return fromKey(key);
  }

  return { error: true };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

// One pass over ActivityLog for a chat between [start, end). Returns counts
// per type, top posters (message type), and the join/left/kicked rosters.
async function getDailyBreakdown(ActivityLogModel, chatId, start, end) {
  const match = { chatId, timestamp: { $gte: start, $lt: end } };

  const [byType, topRows, eventRows] = await Promise.all([
    ActivityLogModel.aggregate([
      { $match: match },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    ActivityLogModel.aggregate([
      { $match: { ...match, type: 'message' } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 3 },
    ]),
    ActivityLogModel.aggregate([
      { $match: { ...match, type: { $in: ['join', 'left', 'kicked', 'promote', 'demote'] } } },
      { $group: { _id: { t: '$type', u: '$userId' } } },
      { $sort: { '_id.u': 1 } },
    ]),
  ]);

  const counts = {};
  for (const row of byType) counts[row._id || 'message'] = row.count;

  const events = { join: [], left: [], kicked: [], promote: [], demote: [] };
  for (const row of eventRows) {
    const t = row._id && row._id.t;
    if (events[t] && events[t].length < 25) events[t].push(row._id.u);
  }

  return {
    counts,
    top: topRows.map((r) => ({ userId: r._id, count: r.count })),
    events,
    totalEvents: byType.reduce((s, r) => s + r.count, 0),
  };
}

// ── Card formatting ──────────────────────────────────────────────────────────

// displayName(jid) -> "@mentionable" is injected by the engine (keeps this
// module free of the economy import); mentionResolver collects the JIDs.
function formatCard(bd, label, displayName) {
  const name = (jid) => {
    try { return displayName(jid); } catch { return String(jid).split('@')[0]; }
  };
  const c = (t) => bd.counts[t] || 0;

  const lines = [];
  lines.push(`📊 *GC ACTIVITY* — ${label}`);
  lines.push('');
  lines.push(`💬 Messages: *${c('message')}*`);
  lines.push(`🖼️ Images: *${c('image')}*`);
  lines.push(`🎥 Videos: *${c('video')}*`);
  lines.push(`🎨 Stickers: *${c('sticker')}*`);
  lines.push(`🎵 Audio/Voice: *${c('audio')}*`);
  lines.push(`📄 Documents: *${c('document')}*`);
  lines.push(`👤 Contacts: *${c('contact')}*`);
  lines.push(`📍 Locations: *${c('location')}*`);
  lines.push(`🗳️ Polls: *${c('poll')}*`);
  lines.push(`🔗 Links deleted: *${c('link_deleted')}*`);

  const roster = (list, cap) =>
    list.length
      ? list.slice(0, cap).map(name).join(', ') + (list.length > cap ? ` +${list.length - cap} more` : '')
      : null;

  const joined = roster(bd.events.join, 8);
  const left = roster(bd.events.left, 8);
  const kicked = roster(bd.events.kicked, 8);
  lines.push(`➕ Joined: *${bd.events.join.length}*${joined ? ` (${joined})` : ''}`);
  lines.push(`➖ Left: *${bd.events.left.length}*${left ? ` (${left})` : ''}`);
  lines.push(`👢 Kicked: *${bd.events.kicked.length}*${kicked ? ` (${kicked})` : ''}`);
  lines.push(`🧮 Total events: *${bd.totalEvents}*`);

  if (bd.top.length) {
    lines.push('');
    lines.push('🏆 *Top posters:*');
    const medals = ['🥇', '🥈', '🥉'];
    bd.top.forEach((u, i) => {
      lines.push(`${medals[i] || `${i + 1}.`} @${name(u.userId)} — *${u.count}* msg${u.count !== 1 ? 's' : ''}`);
    });
  }

  return lines.join('\n');
}

// Mentions used by the card (top posters + join/left/kicked rosters).
function collectMentions(bd) {
  const out = [];
  for (const u of bd.top || []) if (u.userId) out.push(u.userId);
  for (const key of Object.keys(bd.events || {})) {
    for (const jid of bd.events[key]) if (jid && jid.includes('@')) out.push(jid);
  }
  return [...new Set(out)];
}

module.exports = {
  ACTIVITY_TZ,
  tzOffsetMs,
  dayKey,
  dayRange,
  dayRangeFromArg,
  getDailyBreakdown,
  formatCard,
  collectMentions,
};
