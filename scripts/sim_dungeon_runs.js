#!/usr/bin/env node
// Full-dungeon Monte-Carlo WITH healing: how often does a run end in a walkover / tense win / nail-biter / wipe, and how long is it (rounds)?
// Mirrors the live run structure (guildAdventure): F/E/D = all COMBAT then boss; C+ = 50% combat / 20% elite / 15% rest(+30% HP) / 15% non-combat.
// Player policy: drinks a potion (costs that round's action) when its HP < 35% (boss 40%). Kit by rank is an assumption (see KIT).
// Usage: node scripts/sim_dungeon_runs.js [--party 1] [--runs 600] [--build balanced|tank|glass] [--kit 1.0] [--legacy]
'use strict';
const EB = require('../core/rpg/systems/combat/enemyBalance');
const CE = require('../core/rpg/systems/combat/classEncounters');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PARTY = Number(arg('--party', 1)), RUNS = Number(arg('--runs', 600)), BUILD = arg('--build', 'balanced'), KITX = Number(arg('--kit', 1)), GEARX = Number(arg('--gear', 1));
const RANKS = [['F', 0.8, 5, 3, [1, 2]], ['E', 1.2, 12, 4, [2, 4]], ['D', 3.0, 22, 7, [2, 4]], ['C', 5.0, 32, 7, [2, 5]], ['B', 10.0, 42, 8, [3, 5]], ['A', 18.0, 52, 9, [3, 6]], ['S', 35.0, 72, 10, [4, 6]], ['SS', 75.0, 88, 11, [4, 7]], ['SSS', 80.0, 100, 13, [5, 8]]];
// potion kit per player (fractions of max HP) — roughly what loot tables hand out by rank
const KIT = { F: [0.15, 0.15], E: [0.15, 0.3], D: [0.3, 0.3, 0.6], C: [0.3, 0.3, 0.6], B: [0.3, 0.3, 0.6, 0.6], A: [0.3, 0.3, 0.6, 0.6], S: [0.3, 0.6, 0.6, 0.6, 1.0], SS: [0.3, 0.6, 0.6, 0.6, 1.0], SSS: [0.3, 0.6, 0.6, 0.6, 1.0, 1.0] };
const BUILDS = { tank: { hp: 1.5, def: 1.6, atk: 0.9 }, balanced: { hp: 1, def: 1, atk: 1 }, glass: { hp: 0.6, def: 0.5, atk: 1.4 } };
const TO = arg('--T', ''); for (const kv of TO.split(',').filter(Boolean)) { const [k, v] = kv.split('='); EB.T[k] = Number(v); }   // e.g. --T LOSS_BOSS=1.1,MOB_ACTIONS=1.3
const rnd = (a, b) => a + Math.random() * (b - a);
const mk = (lvl, rk) => { const r = EB.reference(lvl), b = BUILDS[BUILD]; const hp = r.hp * b.hp * GEARX, def = r.def * b.def * GEARX, mag = r.mag * (b.atk >= 1 ? 1 : 0.7) * GEARX;
  const kit = KIT[rk].slice(0, Math.max(0, Math.round(KIT[rk].length * KITX))); return { hp, maxHp: hp, def, mag, dr: Math.min(65, def * 0.55), atk: r.atk * b.atk * GEARX, kit }; };
const pass = (p, magic) => (100 / (100 + (magic ? p.mag * 0.5 : p.def))) * (1 - p.dr / 100);
function fight(party, foes, ri, isBoss, st) {
  let rounds = 0;
  while (rounds < 60) {
    rounds++; st.rounds++;
    for (const p of party) {
      if (p.hp <= 0) continue; const tgt = foes.find((f) => f.hp > 0); if (!tgt) return true;
      if (p.hp / p.maxHp < (isBoss ? 0.4 : 0.35) && p.kit.length) { const need = 1 - p.hp / p.maxHp; let k = p.kit.findIndex((x) => x >= need * 0.8); if (k < 0) k = p.kit.length - 1; p.hp = Math.min(p.maxHp, p.hp + p.kit.splice(k, 1)[0] * p.maxHp); st.potions++; continue; }
      const dm = p.atk * rnd(1.2, 2.8) * EB.RANK_BONUS(ri) * (100 / (100 + tgt.def)); tgt.hp -= dm;
      if (!isBoss) for (const o of foes) if (o !== tgt && o.hp > 0) o.hp -= dm * 0.4;
    }
    if (!foes.some((f) => f.hp > 0)) return true;
    for (const f of foes) {
      if (f.hp <= 0) continue; const alive = party.filter((p) => p.hp > 0); if (!alive.length) return false;
      const t = alive[Math.floor(Math.random() * alive.length)], roll = Math.random();
      const skill = isBoss ? (roll < 0.35 ? rnd(2.5, 4.5) : roll < 0.7 ? rnd(1.3, 2.0) : 1) : (roll < 0.3 ? rnd(1.5, 2.5) : 1), magic = Math.random() < 0.4;
      t.hp -= (magic ? f.mag : f.atk) * skill * pass(t, magic);
    }
    for (const p of party) if (p.hp > 0) st.minFrac = Math.min(st.minFrac, p.hp / p.maxHp);
    if (!party.some((p) => p.hp > 0)) return false;
  }
  return false;
}
const strip = (e) => e.enemies.map((x) => ({ hp: x.stats.hp, atk: x.stats.atk, mag: x.stats.mag, def: x.stats.def }));
function run(rk, v2) {
  process.env.ENEMY_BALANCE_V2 = v2 ? '1' : '0';
  const [name, diff, lvl, enc, [lo, hi]] = rk, ri = EB.rankIndexFor(diff), low = ['F', 'E', 'D'].includes(name);
  const party = Array.from({ length: PARTY }, () => mk(lvl, name)), players = party.map((p) => ({ level: lvl, stats: { spd: 20, maxHp: p.maxHp } }));
  const st = { rounds: 0, potions: 0, minFrac: 1 }; let fights = 0, bossRounds = 0, trashRounds = 0;
  for (let e = 1; e <= enc; e++) {
    const boss = e === enc; let type = boss ? 'BOSS' : low ? 'COMBAT' : (() => { const r = Math.random(); return r < 0.5 ? 'COMBAT' : r < 0.7 ? 'ELITE_COMBAT' : r < 0.85 ? 'REST' : 'NONE'; })();
    if (type === 'REST') { party.forEach((p) => { if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + 0.3 * p.maxHp); }); continue; } if (type === 'NONE') continue;
    const foes = strip(CE.generateEncounter(players, type, diff, { minMobs: lo, maxMobs: hi })), before = st.rounds;
    const win = fight(party, foes, ri, boss, st); fights++; (boss ? (bossRounds = st.rounds - before) : (trashRounds += st.rounds - before));
    if (!win) return { win: false, minFrac: 0, rounds: st.rounds, trash: trashRounds / Math.max(1, fights - (boss ? 1 : 0)), boss: bossRounds, potions: st.potions };
  }
  return { win: true, minFrac: st.minFrac, rounds: st.rounds, trash: trashRounds / Math.max(1, fights - 1), boss: bossRounds, potions: st.potions };
}
const rows = [];
for (const rk of RANKS) for (const v2 of (process.argv.includes('--legacy') ? [false, true] : [true])) {
  const rs = Array.from({ length: RUNS }, () => run(rk, v2)), n = rs.length, pct = (f) => Math.round(100 * rs.filter(f).length / n);
  const avg = (f) => +(rs.reduce((s, r) => s + f(r), 0) / n).toFixed(1);
  rows.push({ rank: rk[0], bal: v2 ? 'v2' : 'old', 'win%': pct((r) => r.win), 'wipe%': pct((r) => !r.win), 'walkover%(min>=50)': pct((r) => r.win && r.minFrac >= 0.5), 'tense%(20-50)': pct((r) => r.win && r.minFrac >= 0.2 && r.minFrac < 0.5), 'nailbiter%(<20)': pct((r) => r.win && r.minFrac < 0.2), 'trashRds/fight': avg((r) => r.trash), 'bossRds': avg((r) => r.boss), 'totalRds': avg((r) => r.rounds), 'potions': avg((r) => r.potions) });
}
console.log(`party=${PARTY} build=${BUILD} runs=${RUNS} kit=x${KITX} gear=x${GEARX}`); console.table(rows);
