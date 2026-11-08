'use strict';
// Brute-force PvE simulation: every catalog card x edge scenarios. Asserts no throw / NaN / negative HP,
// energy deducted exactly on success, cooldown set, failures leave state untouched.
const { createSummonCardSystem } = require('../core/rpg/systems/summonCards/system');
const { CARD_CATALOG } = require('../core/rpg/systems/summonCards/catalog');
const jid = 'p@s.whatsapp.net';
const fails = []; let runs = 0;
const bad = (m) => fails.push(m);
function mk(opts = {}) {
  const user = { userId: jid, summonCards: [] };
  const sys = createSummonCardSystem({ getUser: () => user, scheduleSave() {} });
  Object.keys(CARD_CATALOG).forEach((id) => sys.grantCard(jid, id, 'mod'));
  const player = { jid, name: 'T', isDead: false, isEnemy: false,
    stats: { hp: opts.hp ?? 100, maxHp: 200, energy: opts.energy ?? 100, maxEnergy: 100, mag: 40, atk: 20, def: 10 }, combatStats: {} };
  const mkE = (n, hp, boss) => ({ name: n, isBoss: !!boss, isDead: false, stats: { hp, maxHp: hp }, currentHP: hp, combatStats: {}, statusEffects: [] });
  const enemies = (opts.enemies || [1000]).map((hp, i) => mkE('E' + i, hp, opts.boss && i === 0));
  const state = { inCombat: true, mode: 'PVE', players: [player], enemies, activeCombatant: player,
    summonCardTurnCounts: { [jid]: 1 }, summonCardCooldowns: {} };
  return { sys, player, state, enemies };
}
const adapters = (dmg) => ({ calculateDamage: () => ({ damage: dmg, wasEvaded: false }),
  applyStatusEffect: () => ({ synergyMsg: '' }), recordEnemyKill: () => {} });
const scenarios = {
  single: { enemies: [1000] }, multi: { enemies: [500, 500, 500] }, boss: { enemies: [5000], boss: true },
  lethal: { enemies: [1, 1] }, lowhp: { hp: 1 }, fullhp: { hp: 200 }, noenergy: { energy: 0 }, edge: { energy: 5 },
};
(async () => {
  for (const id of Object.keys(CARD_CATALOG)) for (const [sn, so] of Object.entries(scenarios)) for (const dmg of [0, 125, 99999]) {
    runs++; const tag = `${id}/${sn}/${dmg}`;
    try {
      const f = mk(so); const before = f.player.stats.energy;
      const hpBefore = f.enemies.map((e) => e.stats.hp);
      const r = await f.sys.resolveActivation({ player: f.player, state: f.state, action: { cardId: id, targetIndex: 0 }, ...adapters(dmg) });
      const vals = [f.player.stats.hp, f.player.stats.energy, ...f.enemies.map((e) => e.stats.hp)];
      if (vals.some((v) => !Number.isFinite(v) || v < 0)) bad(tag + ' bad stat ' + vals);
      if (r.ok) {
        if (f.player.stats.energy !== before - CARD_CATALOG[id].energyCost && !CARD_CATALOG[id].effects.some((e) => e.kind === 'energy')) bad(tag + ' energy ' + before + '->' + f.player.stats.energy);
        if (f.sys.cooldownFor(jid, id, f.state).ready) bad(tag + ' cooldown not set');
        if (f.player.stats.hp > f.player.stats.maxHp) bad(tag + ' hp over max');
      } else {
        if (f.player.stats.energy !== before) bad(tag + ' failed but energy changed');
        if (f.enemies.some((e, i) => e.stats.hp !== hpBefore[i])) bad(tag + ' failed but enemies changed');
        if (!r.message) bad(tag + ' fail without message');
        if (sn === 'single' || sn === 'multi' || sn === 'boss' || sn === 'lethal') bad(tag + ' unexpected fail: ' + r.message);
      }
      // second cast same turn must be refused (cooldown)
      if (r.ok) { const r2 = await f.sys.resolveActivation({ player: f.player, state: f.state, action: { cardId: id, targetIndex: 0 }, ...adapters(dmg) }); if (r2.ok) bad(tag + ' recast allowed'); }
    } catch (e) { bad(tag + ' THROW ' + e.message); }
  }
  // dead-target / bad-input
  const f = mk({ enemies: [100, 100] }); f.enemies[0].isDead = true; f.enemies[0].stats.hp = 0;
  for (const t of [undefined, null, -1, 9, 'x', 0, 1, 1.5]) for (const ref of ['1', 'ifrit', '', null, undefined, '99', 'ʕ•ᴥ•ʔ']) {
    runs++; try { const p = f.sys.prepareActivation(jid, ref, f.state, f.player, t); if (typeof p.ok !== 'boolean') bad('prep shape'); } catch (e) { bad(`prep THROW ${ref}/${t}: ${e.message}`); }
  }
  const none = mk({ enemies: [100] }); none.enemies[0].isDead = true; none.enemies[0].stats.hp = 0;
  const pr = none.sys.prepareActivation(jid, 'ifrit', none.state, none.player); if (pr.ok) bad('attack with no living enemy allowed');
  console.log(`runs=${runs} failures=${fails.length}`); fails.slice(0, 40).forEach((m) => console.log(' -', m));
  process.exit(fails.length ? 1 : 0);
})();
