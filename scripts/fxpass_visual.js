// FX-PASS 2026-11-08 visual harness — renders the six promised turn cards through the REAL
// Node card lane (Go layers + hitFx composite) and saves JPEGs to /tmp/fxpass_out/.
const fs = require('fs');
const { generateCombatImage } = require('../core/rpg/systems/combat/combatImageGenerator');

const mkPlayer = (name, spriteIndex) => ({
  name, class: { id: 'RANGER' }, level: 42, currentHP: 1722, maxHp: 1925,
  stats: { hp: 1722, maxHp: 1925, energy: 857, maxEnergy: 878, def: 120 },
  energy: 857, maxEnergy: 878, adventurerRank: 'A', spriteIndex, statusEffects: [],
  jid: 'qa@s.whatsapp.net',
});
const mkEnemy = (name, spriteIndex, hp) => ({
  name, isEnemy: true, level: 40, currentHP: hp, maxHp: 2400,
  stats: { hp, maxHp: 2400, level: 40 }, spriteIndex, statusEffects: [],
});

const players = [mkPlayer('thefirsttloser', 3)];
const enemies = [mkEnemy('Leviathan Spawn', 27, 2400), mkEnemy('Leviathan Spawn', 27, 1786)];

const base = { combatType: 'PVE', rank: 'A', floor: 0, summons: [], combatState: null, bypassQueue: true };
const acts = {
  t38_hit:  { attackerSide: 'player', attackerIndex: 0, targetSide: 'enemy', targetIndex: 0, skillName: 'Basic Attack', element: 'physical', damage: 1114, isCrit: false, missed: false, heal: 0, attackSeed: 38 },
  t39_crit: { attackerSide: 'player', attackerIndex: 0, targetSide: 'enemy', targetIndex: 1, skillName: 'Basic Attack', element: 'physical', damage: 2380, isCrit: true, missed: false, heal: 0, attackSeed: 39 },
  t52_miss: { attackerSide: 'player', attackerIndex: 0, targetSide: 'enemy', targetIndex: 1, skillName: 'Quick Shot', element: 'physical', damage: 0, isCrit: false, missed: true, heal: 0, attackSeed: 52 },
  t51_guard:{ attackerSide: 'player', attackerIndex: 0, targetSide: 'player', targetIndex: 0, skillName: 'Defend', element: 'none', damage: 0, isCrit: false, missed: false, heal: 0, kind: 'guard', attackSeed: 51 },
  t48_heal: { attackerSide: 'player', attackerIndex: 0, targetSide: 'player', targetIndex: 0, skillName: 'Full Restore', element: 'none', damage: 0, isCrit: false, missed: false, heal: 517, attackSeed: 48 },
  t31_ult:  { attackerSide: 'enemy', attackerIndex: 0, targetSide: 'player', targetIndex: 0, skillName: 'Annihilation', element: 'dark', damage: 880, isCrit: false, missed: false, heal: 0, ult: true, attackSeed: 31 },
};

(async () => {
  fs.mkdirSync('/tmp/fxpass_out', { recursive: true });
  for (const [k, action] of Object.entries(acts)) {
    const t0 = Date.now();
    try {
      const r = await Promise.race([
        generateCombatImage(players, enemies, { ...base, hud: 'v2', action }),
        new Promise((res) => setTimeout(() => res(null), 25000)),
      ]);
      if (r && r.success && Buffer.isBuffer(r.buffer)) {
        fs.writeFileSync(`/tmp/fxpass_out/${k}.jpg`, r.buffer);
        console.log(`ok   ${k} ${r.buffer.length}B ${Date.now() - t0}ms`);
      } else {
        console.log(`FAIL ${k} ${Date.now() - t0}ms ${r && r.error}`);
      }
    } catch (e) {
      console.log(`ERR  ${k} ${e.message}`);
    }
  }
})();
