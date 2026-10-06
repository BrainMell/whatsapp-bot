#!/usr/bin/env node
// gw_band_audit_probe.js — READ-ONLY prod probe (owner 2026-10-06 20:01Z:
// "first monsters had 4x my HP and could 2-shot me — is the band ladder live?")
// Dumps: recent events (bands field, players, hostGroupId) + per-player REAL
// progression levels + seeded spawn levels in combat rooms. NO WRITES.
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

function lvlOf(u) { return (u && u.progression && u.progression.level) || (u && u.level) || 1; }

async function findUserLevel(db, jid) {
  const phone = String(jid || '').split('@')[0].split(':')[0];
  if (!phone) return { jid, level: null, nick: null };
  const or = [
    { jid: { $regex: phone, $options: 'i' } },
    { phone: { $regex: phone, $options: 'i' } },
    { id: { $regex: phone, $options: 'i' } },
  ];
  try { or.push({ _id: { $regex: phone, $options: 'i' } }); } catch (e) {}
  const u = await db.collection('users').findOne({ $or: or }, { projection: { nickname: 1, level: 1, progression: 1, jid: 1, id: 1 } });
  return { jid, level: u ? lvlOf(u) : null, nick: u ? (u.nickname || u.id || u.jid || '?') : null };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const events = db.collection('guildwarevents');

  const evs = await events.find({}).sort({ updatedAt: -1 }).limit(6).toArray();
  console.log(`== ${evs.length} most recent events ==`);
  for (const ev of evs) {
    const players = ev.players || [];
    console.log(`\nEVENT ${ev.eventId} state=${ev.state} host=${ev.hostGroupId || 'NULL'} world=${ev.deadWorld || '?'} bands=${JSON.stringify(ev.bands || null)} players=${players.length}`);
    for (const p of players.slice(0, 12)) {
      const real = await findUserLevel(db, p.jid);
      console.log(`  player ${p.name || '?'} jid=…${String(p.jid || '').slice(-8)} room=${p.roomId || '?'} status=${p.status || '?'} PROG_LVL=${real.level}${real.nick ? ' (' + String(real.nick).slice(0, 14) + ')' : ''}`);
    }
    // seeded spawns in combat-ish rooms
    const rooms = ev.rooms || [];
    const combatRooms = rooms.filter((r) => r && ['combat', 'secret', 'core', 'coop'].includes(r.type));
    for (const r of combatRooms.slice(0, 10)) {
      const pl = r.payload || {};
      const spawns = pl.spawns || pl.enemies || null;
      const lvls = Array.isArray(spawns) ? spawns.map((s) => s && s.level) : null;
      console.log(`  room ${r.key} type=${r.type} ring=${r.ring} state=${r.state} seededLvls=${JSON.stringify(lvls)} boss=${!!pl.boss} core=${!!pl.coreGuardian} coop=${!!pl.coopEncounter}`);
    }
  }

  // owner's solo-enter check: any event created in the last 24h?
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const recent = evs.filter((e) => (e.startedAt || 0) > dayAgo || (e.registrationEndsAt || 0) > dayAgo);
  console.log(`\n== events with activity in last 24h: ${recent.length} ==`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error('PROBE FAIL:', e.message); process.exit(1); });
