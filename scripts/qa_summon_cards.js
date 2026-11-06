'use strict';
const assert = require('assert');
const { CARD_CATALOG, ACQUISITION_ENABLED, createSummonCardSystem } = require('../core/rpg/systems/summonCards');
const users = new Map();
let saves = 0;
const economy = { getUser(jid) { return users.get(jid) || null; }, scheduleSave() { saves += 1; } };
const sys = createSummonCardSystem(economy);
const jid = 'player@s.whatsapp.net';
const player = {
  jid, isDead: false, isEnemy: false, name: 'Tester',
  stats: { mag: 100, atk: 80, energy: 100 },
  combatStats: { damageDealt: 0, kills: 0 },
  equipment: { main_hand: { id: 'test_sword', durability: 100 } },
};
const target = { name: 'Target', isBoss: false, stats: { hp: 500, maxHp: 500 }, currentHP: 500, statusEffects: [] };
const state = { inCombat: true, turnCount: 4, activeCombatant: { jid }, players: [player], enemies: [target] };
users.set(jid, { registered: true, summonCards: [] });
assert.strictEqual(sys.grantCard(jid, 'ifrit', 'moderator').success, true);
assert.strictEqual(sys.getOwnedCards(jid).length, 1);
assert.strictEqual(sys.grantCard(jid, 'ifrit', 'moderator').success, false);
assert.strictEqual(ACQUISITION_ENABLED, false);
assert.strictEqual(sys.acquireCard(jid, 'shiva', 'boss_drop', 'boss').success, false);
assert.strictEqual(sys.prepareActivation('other@s.whatsapp.net', 'ifrit', state, player, 0).ok, false);
assert.strictEqual(sys.prepareActivation(jid, 'ifrit', state, player, 5).ok, false);
assert.strictEqual(sys.prepareActivation(jid, 'ifrit', { ...state, activeCombatant: { jid: 'other' } }, player, 0).ok, false);
assert.strictEqual(sys.prepareActivation(jid, 'ifrit', { ...state, isPvP: true }, player, 0).ok, false);
const durability = player.equipment.main_hand.durability;
const applied = [];
Promise.resolve(sys.resolveActivation({
  player, state, action: { cardId: 'ifrit', targetIndex: 0 }, sessionKey: 'session-1',
  calculateDamage: (_p, _t, baseDamage) => ({ damage: baseDamage, wasEvaded: false }),
  applyStatusEffect: (_target, type) => { applied.push(type); return {}; },
  recordEnemyKill: () => {},
})).then(() => {
  assert(target.stats.hp < 500);
  assert.strictEqual(player.stats.energy, 70);
  assert.deepStrictEqual(applied, ['burn']);
  assert.strictEqual(player.equipment.main_hand.durability, durability);
  assert.strictEqual(sys.prepareActivation(jid, 'ifrit', state, player, 0).ok, false);
  assert.strictEqual(sys.grantCard(jid, 'leviathan', 'moderator').success, true);
  assert.strictEqual(sys.prepareActivation(jid, 'leviathan', state, player, 0).ok, true);
  const tray = sys.renderTray(jid, state);
  assert(tray.includes('Ifrit') && tray.includes('Leviathan') && tray.includes('READY') && tray.includes('T'));
  assert.strictEqual(sys.revokeCard(jid, 'ifrit').removed, 1);
  assert.strictEqual(sys.revokeCard(jid, 'all').removed, 1);
  assert.strictEqual(sys.getOwnedCards(jid).length, 0);
  assert(saves >= 4);
  assert(Object.keys(CARD_CATALOG).length >= 3);
  console.log('summon-card QA: PASS');
}).catch((err) => { console.error(err); process.exitCode = 1; });
