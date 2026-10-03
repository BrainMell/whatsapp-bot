#!/usr/bin/env node
/* Probe: create an abyss run then immediately re-query it; print the doc. */
try { require('dotenv').config(); } catch (e) {}
const connectDB = require('../db');
const P1 = '19998887761@s.whatsapp.net';
async function main() {
  await connectDB();
  const abyss = require('../core/rpg/abyssSystem');
  const prog = require('../core/rpg/progression');
  const eco = require('../core/rpg/economy');
  eco.registerUser(P1, 'E2EH chilling');
  const cls = eco.getUserClass(P1) || {};
  const bs = prog.getBaseStats(P1, cls.id || 'FIGHTER');
  const stats = { ...bs, hp: bs.hp * 5, maxHp: bs.hp * 5, atk: bs.atk * 5, def: bs.def * 5, mag: bs.mag * 5, spd: bs.spd + 50, luck: bs.luck, crit: bs.crit, dmgReduction: 0, evasion: 0, energy: 200, maxEnergy: 200 };
  const r = await abyss.startRun(P1, stats);
  console.log('startRun ->', JSON.stringify({ success: r.success, msg: r.message, floor: r.run && r.run.currentFloor, status: r.run && r.run.status, type: r.run && r.run.currentEncounterType }).slice(0, 200));
  await new Promise(res => setTimeout(res, 1500));
  const mongoose = require('mongoose');
  const raw = await mongoose.connection.db.collection('abyssruns').find({ userId: P1 }).toArray();
  for (const d of raw) console.log('RAW DOC:', JSON.stringify({ status: d.status, userId: d.userId, floor: d.currentFloor, type: d.currentEncounterType, enemy: !!d.currentEnemy }));
  const gs = await abyss.getRunStatus(P1);
  console.log('getRunStatus ->', gs ? `floor=${gs.currentFloor} status=${gs.status} type=${gs.currentEncounterType}` : 'NULL');
  process.exit(0);
}
main().catch(e => { console.error('PROBE ERR:', e.message); process.exit(1); });
