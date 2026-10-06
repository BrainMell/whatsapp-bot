#!/usr/bin/env node
// gw_level_census.js — read-only census of player power (level + gear score)
// among ALL users and among live GuildWar participants. Grounds the
// fixed-vs-adaptive balance discussion in real numbers.
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
process.env.GW_TEST = '';
const mongoose = require('mongoose');

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const col = db.collection('users');

  const all = await col.find({}, { projection: { level: 1, nickname: 1, progression: 1 } }).toArray();
  const lvls = all.map(u => (u.progression?.level ?? u.level) || 1).sort((a, b) => a - b);
  const n = lvls.length;
  const census = {
    users: n,
    min: lvls[0], p10: pct(lvls, 10), p25: pct(lvls, 25), median: pct(lvls, 50),
    p75: pct(lvls, 75), p90: pct(lvls, 90), p99: pct(lvls, 99), max: lvls[n - 1],
  };
  console.log('ALL USERS:', JSON.stringify(census));
  const withProg = all.filter(u => u.progression && Number(u.progression.level) > 1);
  console.log('users with progression.level>1:', withProg.length, '/', n);
  console.log('top levels:', all.map(u => ({ n: (u.nickname || '').slice(0, 12), l: (u.progression?.level ?? u.level) || 1 })).sort((a, b) => b.l - a.l).slice(0, 10).map(u => `${u.n}:${u.l}`).join(', '));

  // live guild war events: participants' levels
  const events = db.collection('guildwarevents');
  const evs = await events.find({ state: { $in: ['ACTIVE', 'INITIATED', 'REGISTRATION'] } }).toArray();
  for (const ev of evs.slice(0, 3)) {
    const pl = (ev.players || []).map(p => (p.level ?? p.progression?.level) || 1).sort((a, b) => a - b);
    if (!pl.length) { console.log(`EVENT ${ev.eventId} (${ev.state}): no players`); continue; }
    console.log(`EVENT ${ev.eventId} (${ev.state}) players=${pl.length}:`,
      JSON.stringify({ min: pl[0], p25: pct(pl, 25), median: pct(pl, 50), p75: pct(pl, 75), max: pl[pl.length - 1] }));
    // spread inside ONE event = the real balance problem
    const spread = pl[pl.length - 1] / Math.max(1, pl[0]);
    console.log(`  → strongest/weakest ratio inside this event: ${spread.toFixed(1)}x`);
  }

  // recent finished events too (last 5)
  const done = await events.find({ state: 'COMPLETED' }, { sort: { updatedAt: -1 }, limit: 5, projection: { eventId: 1, players: 1, state: 1 } }).toArray();
  for (const ev of done) {
    const pl = (ev.players || []).map(p => (p.level ?? p.progression?.level) || 1).sort((a, b) => a - b);
    if (pl.length) console.log(`DONE ${ev.eventId} n=${pl.length}: min ${pl[0]} / med ${pct(pl, 50)} / max ${pl[pl.length - 1]} (${(pl[pl.length - 1] / Math.max(1, pl[0])).toFixed(1)}x spread)`);
  }

  await mongoose.disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
