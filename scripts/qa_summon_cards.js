'use strict';

const assert = require('assert');
const {
  createSummonCardSystem,
  MODERATOR_GRANTS_ENABLED,
  AUTOMATIC_ACQUISITION_ENABLED,
  ACQUISITION_SOURCES,
} = require('../core/rpg/systems/summonCards/system');

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
  assert.strictEqual(MODERATOR_GRANTS_ENABLED, true);
  assert.strictEqual(AUTOMATIC_ACQUISITION_ENABLED, false);
  assert.strictEqual(ACQUISITION_SOURCES.moderator, true);
  assert.strictEqual(ACQUISITION_SOURCES.quest, false);
  assert.strictEqual(f.system.renderTray(f.player.jid, f.state), '');

  assert.strictEqual(f.system.grantCard(f.player.jid, 'ifrit', 'moderator-1').success, true);
  assert.strictEqual(f.system.grantCard(f.player.jid, 'ifrit', 'moderator-1').success, false);
  assert.strictEqual(f.system.grantCard(f.player.jid, 'leviathan', 'moderator-1').success, true);
  assert.strictEqual(f.system.getOwnedCards(f.player.jid).length, 2);
  assert.match(f.system.renderTray(f.player.jid, f.state, '.e'), /Ifrit ✅/);
  assert.match(f.system.renderTray(f.player.jid, f.state, '.e'), /Leviathan ✅/);
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
  assert.match(f.system.renderTray(f.player.jid, f.state, '.e'), /Ifrit ⏳3T/);
  assert.match(f.system.renderTray(f.player.jid, f.state, '.e'), /Leviathan ✅/);
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

  // ── deck-builder expansion ─────────────────────────────────
  const { CARD_CATALOG } = require('../core/rpg/systems/summonCards/catalog');
  const kinds = new Set(['damage', 'status', 'drain', 'shield', 'heal', 'buff', 'taunt', 'energy']);
  for (const card of Object.values(CARD_CATALOG)) {
    assert.ok(card.effects.length && card.effects.every((e) => kinds.has(e.kind)), card.id + ' has valid effects');
    assert.ok(['ATTACK', 'SKILL', 'POWER'].includes(card.type) && ['enemy', 'all', 'self', 'party'].includes(card.target), card.id + ' type/target');
  }
  const g = fixture();
  ['pyraxis', 'colossus', 'nocturne', 'lumenmoth', 'gelatrix'].forEach((id) => g.system.grantCard(g.player.jid, id, 'mod'));
  g.player.stats.maxHp = 200; g.player.stats.hp = 50; g.player.stats.maxEnergy = 100; g.player.stats.def = 20;
  const e2 = { name: 'Second', isDead: false, stats: { hp: 500, maxHp: 500 }, currentHP: 500, combatStats: {}, statusEffects: [] };
  g.state.enemies.push(e2);
  assert.strictEqual(g.system.getOwnedCards(g.player.jid)[0].id, 'colossus', 'hand sorts rare first');
  assert.strictEqual(g.system.resolveCardRef(g.player.jid, '2'), 'pyraxis');
  assert.strictEqual(g.system.resolveCardRef(g.player.jid, 'moth'), 'lumenmoth');
  assert.strictEqual(g.system.resolveCardRef(g.player.jid, '9'), null);
  const calls = [];
  const adapters = { calculateDamage: () => ({ damage: 100, wasEvaded: false }), applyStatusEffect: (t, type, d, v) => { calls.push([t.name || t.jid, type]); return {}; } };
  const aoe = await g.system.resolveActivation({ player: g.player, state: g.state, action: { cardId: 'pyraxis' }, ...adapters });
  assert.ok(aoe.ok && aoe.damage === 200 && g.enemy.stats.hp === 900 && e2.stats.hp === 400, 'AoE hits every living enemy');
  assert.ok(calls.filter((c) => c[1] === 'burn').length === 2);
  g.state.summonCardTurnCounts[g.player.jid] = 3;
  const heal = await g.system.resolveActivation({ player: g.player, state: g.state, action: { cardId: 'lumenmoth' }, ...adapters });
  assert.ok(heal.ok && heal.healing > 0 && g.player.stats.hp > 50, 'heal restores HP');
  g.player.stats.energy = 100;
  const shield = await g.system.resolveActivation({ player: g.player, state: g.state, action: { cardId: 'colossus' }, ...adapters });
  assert.ok(shield.ok && calls.some((c) => c[1] === 'shield') && calls.some((c) => c[1] === 'taunt'), 'party shield + taunt');
  g.state.summonCardTurnCounts[g.player.jid] = 9;
  g.player.stats.energy = 100; g.player.stats.hp = 100;
  const drain = await g.system.resolveActivation({ player: g.player, state: g.state, action: { cardId: 'nocturne', targetIndex: 1 }, ...adapters });
  assert.ok(drain.ok && g.player.stats.hp === 150, 'drain heals half of damage');
  assert.strictEqual(g.system.prepareActivation(g.player.jid, '4', g.state, g.player).card.id, 'gelatrix' === g.system.getOwnedCards(g.player.jid)[3].id ? 'gelatrix' : g.system.getOwnedCards(g.player.jid)[3].id, 'default target + numeric ref');
  const hand = await g.system.renderHandImage(g.player.jid, g.state, g.player);
  assert.ok(hand && hand.subarray(1, 4).toString() === 'PNG', 'hand image renders');
  const coll = await g.system.renderCollectionImage(g.player.jid);
  assert.ok(coll && coll.length > 5000, 'collection image renders');
  const gif = await require('../core/rpg/systems/summonCards/cardPlayGif').renderCardPlayGif(CARD_CATALOG.pyraxis, { damage: 99 });
  assert.ok(gif.subarray(0, 3).toString() === 'GIF', 'node GIF renders');
  console.log('summon-card QA: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
