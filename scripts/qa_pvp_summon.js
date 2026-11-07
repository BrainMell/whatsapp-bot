// PvP summon-card adapter smoke test (no DB): node scripts/qa_pvp_summon.js
const sc = require('../core/rpg/systems/summonCards');
const pvp = require('../core/rpg/systems/pvp/pvpSystem');
const ids = Object.keys(sc.catalog);
const owned = new Set(); const orig = sc.getOwnedCards;
sc.getOwnedCards = (j) => (j === 'a' ? ids.map((i) => sc.catalog[i]) : []);
const mk = (jid) => ({ jid, name: jid, hp: 3000, maxHp: 3000, energy: 200, maxEnergy: 200, stats: { atk: 300, mag: 300, def: 100, spd: 50, evasion: 0 }, statusEffects: [], buffs: [], cooldowns: {} });
const duel = { players: [mk('a'), mk('b')], turn: 0 };
const r = pvp._resolveSummonCardPvp ? pvp._resolveSummonCardPvp : null;
if (!r) { console.log('export missing'); process.exit(1); }
let fails = 0;
for (const id of ids) {
  const d = { players: [mk('a'), mk('b')], turn: 0 };
  const res = r(d, d.players[0], d.players[1], id);
  if (!res.ok) { console.log('FAIL', id, res.message); fails++; continue; }
  const again = r(d, d.players[0], d.players[1], id);
  if (again.ok && sc.catalog[id].cooldownTurns >= 0) { console.log('FAIL no cooldown', id); fails++; }
}
console.log(fails ? 'FAIL' : 'PASS', ids.length, 'cards');
process.exit(fails ? 1 : 0);
