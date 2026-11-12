#!/usr/bin/env node
// Monte-Carlo dungeon-pressure sim: legacy vs balance-v2 enemy scaling, per rank, for tank/balanced/glass builds.
// Usage: node scripts/sim_enemy_balance.js [--party 1|3] [--runs 400] [--gear 1.3]
'use strict';
const EB = require('../core/rpg/systems/combat/enemyBalance');
const CE = require('../core/rpg/systems/combat/classEncounters');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const PARTY = arg('--party', 1), RUNS = arg('--runs', 300), GEAR = arg('--gear', 1.0);
const RANKS = [['F', 0.8, 5, 3, [1, 2]], ['E', 1.2, 12, 4, [2, 4]], ['D', 3.0, 22, 7, [2, 4]], ['C', 5.0, 32, 7, [2, 5]], ['B', 10.0, 42, 8, [3, 5]], ['A', 18.0, 52, 9, [3, 6]], ['S', 35.0, 72, 10, [4, 6]], ['SS', 75.0, 88, 11, [4, 7]], ['SSS', 80.0, 100, 13, [5, 8]]];
const BUILDS = { tank: { hp: 1.5, def: 1.6, atk: 0.9 }, balanced: { hp: 1, def: 1, atk: 1 }, glass: { hp: 0.6, def: 0.5, atk: 1.4 } };
const rnd = (a, b) => a + Math.random() * (b - a);
function mk(level, b, gear) {
  const r = EB.reference(level);                              // reference already includes typical gear; --gear scales it (0.6 = undergeared)
  const hp = r.hp * b.hp * gear, def = r.def * b.def * gear, mag = r.mag * (b.atk >= 1 ? 1 : 0.7) * gear;
  return { hp, maxHp: hp, def, mag, dr: Math.min(65, def * 0.55), atk: r.atk * b.atk * gear };
}
const pass = (p, magic) => (100 / (100 + (magic ? p.mag * 0.5 : p.def))) * (1 - p.dr / 100);
function fight(party, foes, rankIdx, isBoss) {
  let rounds = 0;
  while (rounds++ < 80) {
    for (const p of party) {                                   // each player acts once: skill-mix average mult 2.0 (+/- variance)
      if (p.hp <= 0) continue; const tgt = foes.find((f) => f.hp > 0); if (!tgt) return true;
      const dm = p.atk * rnd(1.2, 2.8) * EB.RANK_BONUS(rankIdx) * (100 / (100 + tgt.def)); tgt.hp -= dm;
      if (!isBoss) for (const o of foes) if (o !== tgt && o.hp > 0) o.hp -= dm * 0.4;          // cleave: AoE / summons / passives hit the rest of the pack
    }
    if (!foes.some((f) => f.hp > 0)) return true;
    for (const f of foes) {
      if (f.hp <= 0) continue; const alive = party.filter((p) => p.hp > 0); if (!alive.length) return false;
      const t = alive[Math.floor(Math.random() * alive.length)];
      const roll = Math.random(), skill = isBoss ? (roll < 0.35 ? rnd(2.5, 4.5) : roll < 0.7 ? rnd(1.3, 2.0) : 1) : (roll < 0.3 ? rnd(1.5, 2.5) : 1);
      const magic = Math.random() < 0.4;
      t.hp -= (magic ? f.mag : f.atk) * skill * pass(t, magic);
    }
    if (!party.some((p) => p.hp > 0)) return false;
  }
  return false;
}
function runDungeon(rk, build, v2) {
  process.env.ENEMY_BALANCE_V2 = v2 ? '1' : '0';
  const [name, diff, lvl, enc, [lo, hi]] = rk, ri = EB.rankIndexFor(diff), b = BUILDS[build];
  const party = Array.from({ length: PARTY }, () => mk(lvl, b, GEAR)); const players = party.map(() => ({ level: lvl, stats: { spd: 20 } }));
  const mobLoss = []; let died = false, bossWin = null, bossLeft = null;
  for (let e = 0; e < enc - 1 && !died; e++) {                         // no healing between fights = worst case "attrition" view
    const foes = CE.generateEncounter(players, 'COMBAT', diff, { minMobs: lo, maxMobs: hi }).enemies.map((x) => ({ hp: x.stats.hp, atk: x.stats.atk, mag: x.stats.mag, def: x.stats.def }));
    const before = party.reduce((s, p) => s + Math.max(0, p.hp), 0); const win = fight(party, foes, ri, false);
    mobLoss.push(100 * (before - party.reduce((s, p) => s + Math.max(0, p.hp), 0)) / party.reduce((s, p) => s + p.maxHp, 0)); if (!win) died = true;
  }
  const hpAtBoss = party.reduce((s, p) => s + Math.max(0, p.hp), 0) / party.reduce((s, p) => s + p.maxHp, 0);
  // boss fight with a freshly-healed party (players heal before the boss room) - measures the boss itself
  party.forEach((p) => { p.hp = p.maxHp; });
  const bs = CE.generateEncounter(players, 'BOSS', diff).enemies.map((x) => ({ hp: x.stats.hp, atk: x.stats.atk, mag: x.stats.mag, def: x.stats.def }));
  bossWin = fight(party, bs, ri, true); bossLeft = party.reduce((s, p) => s + Math.max(0, p.hp), 0) / party.reduce((s, p) => s + p.maxHp, 0);
  return { mobLossAvg: mobLoss.reduce((a, b2) => a + b2, 0) / (mobLoss.length || 1), diedInTrash: died, hpAtBoss, bossWin, bossLeft };
}
const rows = [];
for (const rk of RANKS) for (const build of Object.keys(BUILDS)) for (const v2 of [false, true]) {
  const rs = Array.from({ length: RUNS }, () => runDungeon(rk, build, v2)); const m = (f) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  rows.push({ rank: rk[0], build, bal: v2 ? 'v2' : 'old', 'trashLoss%/fight': +m((r) => r.mobLossAvg).toFixed(1), 'trashDeath%': +(100 * m((r) => (r.diedInTrash ? 1 : 0))).toFixed(0), 'bossWin%': +(100 * m((r) => (r.bossWin ? 1 : 0))).toFixed(0), 'bossHPleft%': +(100 * m((r) => r.bossLeft)).toFixed(0) });
}
console.log(`party=${PARTY} runs=${RUNS} gear=${GEAR}`); console.table(rows);
