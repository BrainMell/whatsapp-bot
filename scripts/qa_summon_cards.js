'use strict';

const assert = require('assert');
const {
  createSummonCardSystem,
  ACQUISITION_ENABLED,
  ACQUISITION_SOURCES,
} = require('../core/rpg/systems/summonCards');

function fixture() {
  const users = new Map();
  const saved = [];
  const economy = {
    getUser(jid) { return users.get(jid) || null; },
    scheduleSave(jid) { saved.push(jid); },
  };
  const system = createSummonCardSystem(economy);
  const jid = 'player@s.whatsapp.net';
  const user = { userId: jid, summonCards: [] };
  users.set(jid, user);
  const player = {
    jid, isDead: false, isEnemy: false, name: 'Tester',
    stats: { hp: 100, energy: 100, mag: 40, atk: 20 },
    combatStats: { damageDealt: 0, kills: 0 },
    equipment: { main_hand: { id: 'test-sword', durability: 73, maxDurability: 100 } },
  };
  const enemy = {
    name: 'Training Dummy', isDead: false, isBoss: false,
    stats: { hp: 1000, maxHp: 1000 }, currentHP: 1000,
    combatStats: { damageTaken: 0 }, statusEffects: [],
  };
  const state = {
    inCombat: true, mode: 'PVE', players: [player], enemies: [enemy],
    activeCombatant: player,
    summonCardTurnCounts: { [jid]: 1 },
    summonCardCooldowns: {},
  };
  return { system, user, player, enemy, state, saved };
}

async function main() {
  const f = fixture();
  assert.strictEqual(ACQUISITION_ENABLED, true);
  assert.strictEqual(ACQUISITION_SOURCES.moderator, true);
  assert.strictEqual(ACQUISITION_SOURCES.quest, false);
  assert.strictEqual(f.system.renderTray(f.player.jid, f.state), '');

  assert.strictEqual(f.system.grantCard(f.player.jid, 'ifrit', 'moderator-1').success, true);
  assert.strictEqual(f.system.grantCard(f.player.jid, 'ifrit', 'moderator-1').success, false);
  assert.strictEqual(f.system.grantCard(f.player.jid, 'leviathan', 'moderator-1').success, true);
  assert.strictEqual(f.system.getOwnedCards(f.player.jid).length, 2);
  assert.match(f.system.renderTray(f.player.jid, f.state, '.e'), /Ifrit READY/);
  assert.match(f.system.renderTray(f.player.jid, f.state, '.e'), /Leviathan READY/);
  assert.match(f.system.renderTray(f.player.jid, f.state, '.e'), /\.e combat summon/);
  assert.strictEqual(f.system.acquireCard(f.player.jid, 'shiva', 'quest', 'system').success, false);

  assert.strictEqual(f.system.prepareActivation(f.player.jid, 'ifrit', f.state, f.player, 0).ok, true);
  assert.strictEqual(f.system.prepareActivation('other@s.whatsapp.net', 'ifrit', f.state, f.player, 0).ok, false);
  assert.strictEqual(f.system.prepareActivation(f.player.jid, 'ifrit', f.state, f.player, 9).ok, false);
  assert.strictEqual(f.system.prepareActivation(f.player.jid, 'shiva', f.state, f.player, 0).ok, false);
  const lowEnergyPlayer = { ...f.player, stats: { ...f.player.stats, energy: 1 } };
  assert.strictEqual(f.system.prepareActivation(f.player.jid, 'ifrit', f.state, lowEnergyPlayer, 0).ok, false);
  assert.strictEqual(f.system.prepareActivation(f.player.jid, 'ifrit', { ...f.state, isPvP: true }, f.player, 0).ok, false);
  assert.strictEqual(f.system.prepareActivation(f.player.jid, 'ifrit', { ...f.state, activeCombatant: { jid: 'other' } }, f.player, 0).ok, false);

  let appliedStatus = null;
  const result = await f.system.resolveActivation({
    player: f.player, state: f.state,
    action: { cardId: 'ifrit', targetIndex: 0 },
    calculateDamage: () => ({ damage: 125, wasEvaded: false }),
    applyStatusEffect: (...args) => { appliedStatus = args; return { synergyMsg: '' }; },
    recordEnemyKill: () => { throw new Error('non-lethal test should not record a kill'); },
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.damage, 125);
  assert.strictEqual(f.player.stats.energy, 70);
  assert.strictEqual(f.enemy.stats.hp, 875);
  assert.strictEqual(appliedStatus[1], 'burn');
  assert.strictEqual(f.player.equipment.main_hand.durability, 73, 'summon casts must not wear weapon durability');

  f.state.summonCardTurnCounts[f.player.jid] = 2;
  assert.strictEqual(f.system.cooldownFor(f.player.jid, 'ifrit', f.state).turnsLeft, 3);
  assert.strictEqual(f.system.cooldownFor(f.player.jid, 'leviathan', f.state).ready, true);
  assert.match(f.system.renderTray(f.player.jid, f.state, '.e'), /Ifrit ⏳ 3T/);
  assert.match(f.system.renderTray(f.player.jid, f.state, '.e'), /Leviathan READY/);
  f.state.summonCardTurnCounts[f.player.jid] = 4;
  assert.strictEqual(f.system.cooldownFor(f.player.jid, 'ifrit', f.state).ready, false);
  f.state.summonCardTurnCounts[f.player.jid] = 5;
  assert.strictEqual(f.system.cooldownFor(f.player.jid, 'ifrit', f.state).ready, true);
  assert.strictEqual(f.system.cooldownFor(f.player.jid, 'shiva', f.state).ready, true);

  f.state.mode = 'PVP';
  assert.strictEqual(f.system.prepareActivation(f.player.jid, 'ifrit', f.state, f.player, 0).ok, false);
  f.state.mode = 'PVE';

  assert.ok(f.saved.includes(f.player.jid), 'moderator grant should persist ownership');
  assert.strictEqual(f.system.revokeCard(f.player.jid, 'all').removed, 2);
  assert.strictEqual(f.system.renderTray(f.player.jid, f.state), '');
  console.log('summon-card QA: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
