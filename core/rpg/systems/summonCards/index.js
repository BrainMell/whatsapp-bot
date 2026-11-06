'use strict';
const CARD_CATALOG = Object.freeze({
  ifrit: Object.freeze({
    id: 'ifrit', name: 'Ifrit', icon: '🔥', element: 'FIRE',
    abilityName: 'Inferno Rend', description: 'A focused flame strike that leaves the target burning.',
    energyCost: 30, cooldownTurns: 3, damageMultiplier: 1.75,
    status: { type: 'burn', duration: 2, value: 14 }, sprite: 'ifrit_fire.png', vfx: 'fire',
  }),
  leviathan: Object.freeze({
    id: 'leviathan', name: 'Leviathan', icon: '🌊', element: 'WATER',
    abilityName: 'Tidal Prison', description: 'A crushing surge that slows the target.',
    energyCost: 36, cooldownTurns: 4, damageMultiplier: 1.55,
    status: { type: 'slow', duration: 2, value: 25 }, sprite: 'leviathan_water.png', vfx: 'water',
  }),
  shiva: Object.freeze({
    id: 'shiva', name: 'Shiva', icon: '❄️', element: 'ICE',
    abilityName: 'Absolute Zero', description: 'A piercing frost strike that can freeze the target.',
    energyCost: 42, cooldownTurns: 5, damageMultiplier: 1.45,
    status: { type: 'freeze', duration: 1, value: 0 }, sprite: 'shiva_ice.png', vfx: 'ice',
  }),
});
const CARD_ALIASES = Object.freeze({ flame: 'ifrit', fire: 'ifrit', inferno: 'ifrit', tide: 'leviathan', water: 'leviathan', ice: 'shiva', frost: 'shiva' });
const ACQUISITION_ENABLED = false;
const ACQUISITION_SOURCES = Object.freeze({ moderator: true, quest: false, boss_drop: false, event: false, shop: false, trade: false });

function normalizeCardId(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return CARD_CATALOG[key] ? key : (CARD_ALIASES[key] || null);
}
function createSummonCardSystem(economy) {
  if (!economy || typeof economy.getUser !== 'function') throw new TypeError('SummonCards requires economy.getUser().');
  function userFor(jid) { return jid ? economy.getUser(jid) : null; }
  function ownedFor(jid) {
    const user = userFor(jid);
    if (!user) return [];
    if (!Array.isArray(user.summonCards)) user.summonCards = [];
    return user.summonCards.filter((e) => e && CARD_CATALOG[String(e.cardId || '').toLowerCase()]);
  }
  function save(jid) {
    if (typeof economy.scheduleSave === 'function') economy.scheduleSave(jid);
    else if (typeof economy.saveUser === 'function') economy.saveUser(jid);
  }
  function getOwnedCards(jid) {
    return ownedFor(jid).map((e) => ({
      ...CARD_CATALOG[String(e.cardId).toLowerCase()],
      grantedAt: Number(e.grantedAt) || 0, grantedBy: e.grantedBy || null, source: e.source || 'moderator',
    }));
  }
  function grantCard(jid, rawCardId, grantedBy) {
    const cardId = normalizeCardId(rawCardId);
    if (!cardId) return { success: false, message: 'Unknown card. Valid IDs: ' + Object.keys(CARD_CATALOG).join(', ') + '.' };
    const user = userFor(jid);
    if (!user) return { success: false, message: 'Player is not registered.' };
    const cards = ownedFor(jid);
    if (cards.some((e) => String(e.cardId).toLowerCase() === cardId)) return { success: false, message: CARD_CATALOG[cardId].name + ' is already owned.' };
    user.summonCards = cards.concat([{ cardId, grantedAt: Date.now(), grantedBy: String(grantedBy || 'moderator'), source: 'moderator' }]);
    save(jid);
    return { success: true, card: CARD_CATALOG[cardId] };
  }
  function revokeCard(jid, rawCardId) {
    const user = userFor(jid);
    if (!user) return { success: false, removed: 0, message: 'Player is not registered.' };
    const cards = ownedFor(jid);
    const requested = String(rawCardId || '').trim().toLowerCase();
    if (!requested || requested === 'all') {
      const removed = cards.length; user.summonCards = []; if (removed) save(jid);
      return { success: true, removed, message: removed ? 'All summon cards revoked.' : 'Player owns no summon cards.' };
    }
    const cardId = normalizeCardId(requested);
    if (!cardId) return { success: false, removed: 0, message: 'Unknown summon card.' };
    const next = cards.filter((e) => String(e.cardId).toLowerCase() !== cardId);
    const removed = cards.length - next.length;
    if (removed) { user.summonCards = next; save(jid); }
    return { success: removed > 0, removed, message: removed ? CARD_CATALOG[cardId].name + ' revoked.' : 'Player does not own ' + CARD_CATALOG[cardId].name + '.' };
  }
  function acquireCard(jid, rawCardId, source, actor) {
    const normalizedSource = String(source || '').trim().toLowerCase();
    if (!ACQUISITION_ENABLED || !ACQUISITION_SOURCES[normalizedSource] || normalizedSource !== 'moderator') {
      return { success: false, message: 'Summon-card acquisition is currently moderator-only.' };
    }
    return grantCard(jid, rawCardId, actor);
  }
  function cooldownFor(jid, cardId, state) {
    const key = String(jid) + ':' + cardId;
    const turn = Math.max(0, Number(state && state.turnCount) || 0);
    const readyOnTurn = Math.max(0, Number(state && state.summonCardCooldowns && state.summonCardCooldowns[key]) || 0);
    return { ready: readyOnTurn <= turn, turnsLeft: Math.max(0, readyOnTurn - turn), readyOnTurn };
  }
  function renderTray(jid, state) {
    const cards = getOwnedCards(jid);
    if (!cards.length) return '';
    const bits = cards.map((card) => {
      const cd = cooldownFor(jid, card.id, state || {});
      return card.icon + ' ' + card.name + ' ' + (cd.ready ? 'READY' : '⏳ ' + cd.turnsLeft + 'T');
    });
    return '🃏 *SUMMON CARDS*  ' + bits.join('  ·  ') + '\nUse ' + ((state && state.commandPrefix) || '.j') + ' combat summon <card> <enemy#>';
  }
  function prepareActivation(jid, rawCardId, state, player, targetIndex) {
    const cardId = normalizeCardId(rawCardId);
    if (!cardId) return { ok: false, message: '❌ Unknown summon card. Valid IDs: ' + Object.keys(CARD_CATALOG).join(', ') + '.' };
    const card = CARD_CATALOG[cardId];
    if (!state || !state.inCombat) return { ok: false, message: '❌ Summon cards can only be activated during PvE combat.' };
    if (state.mode === 'PVP' || state.isPvP || String(state.combatType || '').toUpperCase() === 'PVP') return { ok: false, message: '❌ Summon cards are not enabled in PvP yet.' };
    if (!player || player.isDead || player.isEnemy) return { ok: false, message: '❌ This combatant cannot activate a summon card.' };
    if (!state.activeCombatant || state.activeCombatant.jid !== jid) return { ok: false, message: '❌ It is not your turn.' };
    if (!ownedFor(jid).some((e) => String(e.cardId).toLowerCase() === cardId)) return { ok: false, message: '❌ You do not own ' + card.name + '. Ask a moderator to grant it.' };
    const enemies = Array.isArray(state.enemies) ? state.enemies : [];
    const index = Number(targetIndex);
    if (!Number.isInteger(index) || index < 0 || index >= enemies.length) return { ok: false, message: '❌ Choose a valid enemy target. Example: .j combat summon ' + cardId + ' 1' };
    const target = enemies[index];
    if (!target || target.isDead || !target.stats || Number(target.stats.hp) <= 0) return { ok: false, message: '❌ That enemy is no longer a valid target.' };
    const energy = Number(player.stats && player.stats.energy) || 0;
    if (energy < card.energyCost) return { ok: false, message: '❌ ' + card.name + ' needs ' + card.energyCost + ' energy; you have ' + Math.floor(energy) + '.' };
    const cd = cooldownFor(jid, cardId, state);
    if (!cd.ready) return { ok: false, message: '⏳ ' + card.name + ' is cooling down for ' + cd.turnsLeft + ' more turn(s).' };
    return { ok: true, card, cardId, target, targetIndex: index, energyCost: card.energyCost };
  }
  async function resolveActivation(args) {
    const { player, state, action } = args || {};
    const prepared = prepareActivation(player && player.jid, action && action.cardId, state, player, action && action.targetIndex);
    if (!prepared.ok) return prepared;
    const { card, cardId, target, targetIndex, energyCost } = prepared;
    if (typeof args.calculateDamage !== 'function' || typeof args.applyStatusEffect !== 'function') return { ok: false, message: 'Summon-card combat adapters are unavailable.' };
    const baseStat = Math.max(1, Number(player.stats.mag) || Number(player.stats.atk) || 1);
    const baseDamage = Math.max(1, Math.floor(baseStat * card.damageMultiplier));
    const calc = args.calculateDamage(player, target, baseDamage, 'magic', card.element, args.sessionKey) || {};
    if (calc.noDamageReason) return { ok: false, message: '❌ ' + calc.noDamageReason };
    const wasEvaded = !!calc.wasEvaded;
    const damage = wasEvaded ? 0 : Math.max(0, Math.floor(Number(calc.damage) || 0));
    player.stats.energy = Math.max(0, Number(player.stats.energy || 0) - energyCost);
    target.stats.hp = Math.max(0, Number(target.stats.hp || 0) - damage);
    target.currentHP = target.stats.hp;
    if (player.combatStats) player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + damage;
    target.combatStats = target.combatStats || { damageTaken: 0 };
    target.combatStats.damageTaken = (target.combatStats.damageTaken || 0) + damage;
    let statusMessage = '';
    if (!wasEvaded && target.stats.hp > 0 && card.status) {
      const s = args.applyStatusEffect(target, card.status.type, card.status.duration, card.status.value, player.name);
      if (s && s.synergyMsg) statusMessage = ' ' + s.synergyMsg;
    }
    if (!state.summonCardCooldowns) state.summonCardCooldowns = {};
    state.summonCardCooldowns[String(player.jid) + ':' + cardId] = Math.max(0, Number(state.turnCount) || 0) + card.cooldownTurns + 1;
    let defeated = false;
    if (target.stats.hp <= 0 && !target.isDead) {
      defeated = true; target.isDead = true; target.justDied = true; target.stats.hp = 0; target.currentHP = 0;
      if (player.combatStats) player.combatStats.kills = (player.combatStats.kills || 0) + 1;
      if (typeof args.recordEnemyKill === 'function') args.recordEnemyKill(state, target);
    } else if (target.isBoss && typeof args.onBossPhase === 'function') await args.onBossPhase(target);
    if (damage > 0 && typeof args.generateThreat === 'function') args.generateThreat(player, damage);
    const message = wasEvaded
      ? card.icon + ' *' + card.abilityName + '* misses ' + target.name + '!'
      : card.icon + ' *' + card.abilityName + '* hits ' + target.name + ' for *' + damage + '* ' + card.element.toLowerCase() + ' damage.' +
        (statusMessage ? '\n' + statusMessage.trim() : '') + (defeated ? '\n💀 *' + target.name + '* defeated!' : '');
    return { ok: true, card, target, targetIndex, damage, wasEvaded, defeated, energyCost, message };
  }
  function buildInventoryText(jid, prefix) {
    const cards = getOwnedCards(jid);
    if (!cards.length) return '🃏 *SUMMON CARDS*\n\nYou do not own any summon cards yet.\nInitial grants are moderator-only.';
    const lines = cards.map((card, index) => (index + 1) + '. ' + card.icon + ' *' + card.name + '*\n   ' +
      card.abilityName + ' · ' + card.energyCost + ' EN · ' + card.cooldownTurns + '-turn cooldown\n   _' + card.description + '_');
    return '🃏 *SUMMON CARDS*\n━━━━━━━━━━━━━━\n' + lines.join('\n\n') + '\n\nDuring PvE combat: ' + (prefix || '.j') + ' combat summon <card> <enemy#>';
  }
  return { catalog: CARD_CATALOG, getOwnedCards, grantCard, revokeCard, acquireCard, prepareActivation, resolveActivation, renderTray, buildInventoryText };
}
const defaultSystem = createSummonCardSystem(require('../economy/economy'));
module.exports = { ...defaultSystem, CARD_CATALOG, CARD_ALIASES, ACQUISITION_ENABLED, ACQUISITION_SOURCES, normalizeCardId, createSummonCardSystem };
