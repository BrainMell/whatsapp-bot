// ULT-AOE-SPLASH round 2 harness — renders through the REAL Node card lane (Go layers + hitFx +
// combatCardNode) and saves JPEGs to /tmp/fxpass2_out/.
//  ult_aoe    : Annihilation (ult + aoe) vs a 3-player party -> screen nova + splash on BOTH
//               other players + fresh-wound segment on the primary's bar + rim pulses.
//  ult_single : ult WITHOUT aoe -> big nova on the primary only, no invented hits elsewhere.
//  hit_regress: plain basic attack -> NO nova at all (fx-pass round 1 look unchanged).
const fs = require('fs');
const { generateCombatImage } = require('../core/rpg/systems/combat/combatImageGenerator');

const mkPlayer = (name, spriteIndex, hp) => ({
  name, class: { id: 'RANGER' }, level: 42, currentHP: hp, maxHp: 1925,
  stats: { hp, maxHp: 1925, energy: 857, maxEnergy: 878, def: 120 },
  energy: 857, maxEnergy: 878, adventurerRank: 'A', spriteIndex, statusEffects: [],
  jid: 'qa@s.whatsapp.net',
});
const mkEnemy = (name, spriteIndex, hp) => ({
  name, isEnemy: true, level: 40, currentHP: hp, maxHp: 2400,
  stats: { hp, maxHp: 2400, level: 40 }, spriteIndex, statusEffects: [],
});

const players = [
  mkPlayer('thefirsttloser', 3, 1045),   // primary target: 1045 -> took 880 (fresh wound 1045..1925)
  mkPlayer('mellow', 7, 1620),           // AoE victim
  mkPlayer('vet', 12, 300),              // AoE victim, low HP
];
const enemies = [mkEnemy('Leviathan Spawn', 27, 2400), mkEnemy('Leviathan Spawn', 27, 1786)];

const base = { combatType: 'PVE', rank: 'A', floor: 0, summons: [], combatState: null, bypassQueue: true, hud: 'v2' };
const acts = {
  ult_aoe:    { attackerSide: 'enemy', attackerIndex: 0, targetSide: 'player', targetIndex: 0, skillName: 'Annihilation', element: 'dark', damage: 880, isCrit: false, missed: false, heal: 0, ult: true, aoe: true, attackSeed: 31 },
  ult_single: { attackerSide: 'enemy', attackerIndex: 0, targetSide: 'player', targetIndex: 0, skillName: 'Devouring Judgement', element: 'dark', damage: 640, isCrit: false, missed: false, heal: 0, ult: true, aoe: false, attackSeed: 33 },
  hit_regress:{ attackerSide: 'player', attackerIndex: 0, targetSide: 'enemy', targetIndex: 0, skillName: 'Basic Attack', element: 'physical', damage: 1114, isCrit: false, missed: false, heal: 0, attackSeed: 38 },
};

(async () => {
  fs.mkdirSync('/tmp/fxpass2_out', { recursive: true });
  for (const [k, action] of Object.entries(acts)) {
    const t0 = Date.now();
    try {
      const r = await Promise.race([
        generateCombatImage(players, enemies, { ...base, action }),
        new Promise((res) => setTimeout(() => res(null), 30000)),
      ]);
      if (r && r.success && Buffer.isBuffer(r.buffer)) {
        fs.writeFileSync(`/tmp/fxpass2_out/${k}.jpg`, r.buffer);
        console.log(`ok   ${k} ${r.buffer.length}B ${Date.now() - t0}ms`);
      } else {
        console.log(`FAIL ${k} ${Date.now() - t0}ms ${r && r.error}`);
      }
    } catch (e) {
      console.log(`ERR  ${k} ${e.message}`);
    }
  }
})();
