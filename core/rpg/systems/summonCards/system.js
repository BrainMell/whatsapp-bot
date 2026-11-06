'use strict';

const { CARD_CATALOG, CARD_ALIASES, RARITY } = require('./catalog');
// Moderator grants are the only enabled acquisition path. Future sources stay
// explicitly disabled until their own progression/economy design is approved.
const MODERATOR_GRANTS_ENABLED = true;
const AUTOMATIC_ACQUISITION_ENABLED = false;
const ACQUISITION_SOURCES = Object.freeze({
  moderator: true, quest: false, boss_drop: false, event: false, shop: false, trade: false,
});

function normalizeCardId(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return CARD_CATALOG[key] ? key : (CARD_ALIASES[key] || null);
}

function createSummonCardSystem(economy) {
  if (!economy || typeof economy.getUser !== 'function') {
    throw new TypeError('SummonCards requires economy.getUser().');
  }

  function userFor(jid) { return jid ? economy.getUser(jid) : null; }

  function ownedFor(jid) {
    const user = userFor(jid);
    if (!user) return [];
    if (!Array.isArray(user.summonCards)) user.summonCards = [];
    return user.summonCards.filter((entry) =>
      entry && CARD_CATALOG[String(entry.cardId || '').toLowerCase()],
    );
  }

  function save(jid) {
    if (typeof economy.scheduleSave === 'function') economy.scheduleSave(jid);
    else if (typeof economy.saveUser === 'function') economy.saveUser(jid);
  }

  function getOwnedCards(jid) {
    return ownedFor(jid).map((entry) => ({
      ...CARD_CATALOG[String(entry.cardId).toLowerCase()],
      grantedAt: Number(entry.grantedAt) || 0,
      grantedBy: entry.grantedBy || null,
      source: entry.source || 'moderator',
    })).sort((x, y) => ((RARITY[y.rarity] || {}).rank || 0) - ((RARITY[x.rarity] || {}).rank || 0) || x.name.localeCompare(y.name));
  }

  function grantCard(jid, rawCardId, grantedBy) {
    const cardId = normalizeCardId(rawCardId);
    if (!cardId) {
      return { success: false, message: 'Unknown card. Valid IDs: ' + Object.keys(CARD_CATALOG).join(', ') + '.' };
    }
    const user = userFor(jid);
    if (!user) return { success: false, message: 'Player is not registered.' };
    const cards = ownedFor(jid);
    if (cards.some((entry) => String(entry.cardId).toLowerCase() === cardId)) {
      return { success: false, message: CARD_CATALOG[cardId].name + ' is already owned.' };
    }
    user.summonCards = cards.concat([{
      cardId, grantedAt: Date.now(), grantedBy: String(grantedBy || 'moderator'), source: 'moderator',
    }]);
    save(jid);
    return { success: true, card: CARD_CATALOG[cardId] };
  }

  function revokeCard(jid, rawCardId) {
    const user = userFor(jid);
    if (!user) return { success: false, removed: 0, message: 'Player is not registered.' };
    const cards = ownedFor(jid);
    const requested = String(rawCardId || '').trim().toLowerCase();
    if (!requested || requested === 'all') {
      const removed = cards.length;
      user.summonCards = [];
      if (removed) save(jid);
      return {
        success: true, removed,
        message: removed ? 'All summon cards revoked.' : 'Player owns no summon cards.',
      };
    }
    const cardId = normalizeCardId(requested);
    if (!cardId) return { success: false, removed: 0, message: 'Unknown summon card.' };
    const next = cards.filter((entry) => String(entry.cardId).toLowerCase() !== cardId);
    const removed = cards.length - next.length;
    if (removed) {
      user.summonCards = next;
      save(jid);
    }
    return {
      success: removed > 0, removed,
      message: removed ? CARD_CATALOG[cardId].name + ' revoked.' : 'Player does not own ' + CARD_CATALOG[cardId].name + '.',
    };
  }

  function acquireCard(jid, rawCardId, source, actor) {
    const normalizedSource = String(source || '').trim().toLowerCase();
    if (normalizedSource === 'moderator' && MODERATOR_GRANTS_ENABLED && ACQUISITION_SOURCES.moderator) {
      return grantCard(jid, rawCardId, actor);
    }
    if (!AUTOMATIC_ACQUISITION_ENABLED || !ACQUISITION_SOURCES[normalizedSource]) {
      return { success: false, message: 'Summon-card acquisition is currently moderator-only.' };
    }
    return { success: false, message: 'This acquisition source is not implemented.' };
  }

  function playerTurnFor(jid, state) {
    return Math.max(0, Number(state && state.summonCardTurnCounts && state.summonCardTurnCounts[String(jid)]) || 0);
  }

  function cooldownFor(jid, cardId, state) {
    const key = String(jid) + ':' + cardId;
    const turn = playerTurnFor(jid, state);
    const readyOnTurn = Math.max(0, Number(state && state.summonCardCooldowns && state.summonCardCooldowns[key]) || 0);
    return { ready: readyOnTurn <= turn, turnsLeft: Math.max(0, readyOnTurn - turn), readyOnTurn, currentTurn: turn };
  }

  // ── hand / references ───────────────────────────────────────
  // Cards are numbered 1..n in HAND ORDER (rarity desc, then name) - the same order the hand image shows.
  function resolveCardRef(jid, raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (/^\d+$/.test(text)) {
      const owned = getOwnedCards(jid);
      const card = owned[parseInt(text, 10) - 1];
      return card ? card.id : null;
    }
    return normalizeCardId(text);
  }

  function handEntries(jid, state, player) {
    const energy = player && player.stats ? Number(player.stats.energy) : NaN;
    return getOwnedCards(jid).map((card) => {
      const cd = cooldownFor(jid, card.id, state || {});
      return { card, ready: cd.ready, turnsLeft: cd.turnsLeft, affordable: !Number.isFinite(energy) || energy >= card.energyCost };
    });
  }

  async function renderHandImage(jid, state, player) {
    try {
      const entries = handEntries(jid, state, player);
      if (!entries.length) return null;
      const st = player && player.stats ? player.stats : {};
      return await require('./cardRenderer').renderHandPng(entries, { energy: st.energy, maxEnergy: st.maxEnergy, title: 'SUMMON HAND' });
    } catch (e) { console.warn('[SummonCards] hand render failed:', e.message); return null; }
  }

  async function renderCollectionImage(jid) {
    try {
      const entries = getOwnedCards(jid).map((card) => ({ card, ready: true, turnsLeft: 0, affordable: true }));
      if (!entries.length) return null;
      return await require('./cardRenderer').renderHandPng(entries, { title: 'YOUR SUMMON CARDS', scale: 0.78 });
    } catch (e) { console.warn('[SummonCards] collection render failed:', e.message); return null; }
  }

  function renderTray(jid, state, prefix) {
    const cards = getOwnedCards(jid);
    if (!cards.length) return '';
    const bits = cards.map((card, i) => {
      const cooldown = cooldownFor(jid, card.id, state || {});
      return (i + 1) + '. ' + card.icon + ' ' + card.name + ' ' + (cooldown.ready ? '✅' : '⏳' + cooldown.turnsLeft + 'T');
    });
    return '🃏 *SUMMON HAND*  ' + bits.join('  ·  ') +
      '\nPlay: ' + (prefix || (state && state.commandPrefix) || '.j') + ' combat summon <#|name> [enemy#]';
  }

  function livingEnemies(state) { return (Array.isArray(state && state.enemies) ? state.enemies : []).filter((e) => e && !e.isDead && Number(e.stats && e.stats.hp) > 0); }
  function livingPlayers(state) { return (Array.isArray(state && state.players) ? state.players : []).filter((p) => p && !p.isDead && !p.isEnemy && Number(p.stats && p.stats.hp) > 0); }

  function prepareActivation(jid, rawRef, state, player, targetIndex) {
    const cardId = resolveCardRef(jid, rawRef);
    if (!cardId) {
      const owned = getOwnedCards(jid);
      return { ok: false, message: owned.length
        ? '❌ Unknown card. Use a hand number (1-' + owned.length + ') or a card name.'
        : '❌ You do not own any summon cards. Ask a moderator to grant one.' };
    }
    const card = CARD_CATALOG[cardId];
    if (!state || !state.inCombat) {
      return { ok: false, message: '❌ Summon cards can only be activated during PvE combat.' };
    }
    if (String(state.mode || '').toUpperCase().includes('PVP') || state.isPvP || String(state.combatType || '').toUpperCase() === 'PVP') {
      return { ok: false, message: '❌ Summon cards are not enabled in PvP yet.' };
    }
    if (!player || player.isDead || player.isEnemy || String(player.jid || '') !== String(jid || '')) {
      return { ok: false, message: '❌ This combatant cannot activate a summon card.' };
    }
    if (!Array.isArray(state.players) || !state.players.some((entry) => entry && entry.jid === jid)) {
      return { ok: false, message: '❌ You are not an active player in this combat.' };
    }
    if (!state.activeCombatant || state.activeCombatant.jid !== jid) {
      return { ok: false, message: '❌ It is not your turn.' };
    }
    if (!ownedFor(jid).some((entry) => String(entry.cardId).toLowerCase() === cardId)) {
      return { ok: false, message: '❌ You do not own ' + card.name + '. Ask a moderator to grant it.' };
    }

    const enemies = Array.isArray(state.enemies) ? state.enemies : [];
    let targets = [];
    let firstIndex = -1;
    if (card.target === 'enemy') {
      let index = Number(targetIndex);
      if (targetIndex === undefined || targetIndex === null || Number.isNaN(index)) {
        index = enemies.findIndex((e) => e && !e.isDead && Number(e.stats && e.stats.hp) > 0);   // default: first living enemy
      }
      if (!Number.isInteger(index) || index < 0 || index >= enemies.length) {
        return { ok: false, message: '❌ Choose a valid enemy target. Example: .j combat summon ' + cardId + ' 1' };
      }
      const target = enemies[index];
      if (!target || target.isDead || !(Number(target.stats && target.stats.hp) > 0)) {
        return { ok: false, message: '❌ That enemy is no longer a valid target.' };
      }
      targets = [target]; firstIndex = index;
    } else if (card.target === 'all') {
      targets = livingEnemies(state);
      if (!targets.length) return { ok: false, message: '❌ There are no living enemies.' };
      firstIndex = enemies.indexOf(targets[0]);
    } else {
      firstIndex = enemies.findIndex((e) => e && !e.isDead && Number(e.stats && e.stats.hp) > 0);
    }
    const energy = Number(player.stats && player.stats.energy);
    if (!Number.isFinite(energy) || energy < card.energyCost) {
      return {
        ok: false,
        message: '❌ ' + card.name + ' needs ' + card.energyCost + ' energy; you have ' + Math.max(0, Math.floor(Number.isFinite(energy) ? energy : 0)) + '.',
      };
    }
    const cooldown = cooldownFor(jid, cardId, state);
    if (!cooldown.ready) {
      return { ok: false, message: '⏳ ' + card.name + ' is cooling down for ' + cooldown.turnsLeft + ' more of your turns.' };
    }
    return { ok: true, card, cardId, targets, target: targets[0] || null, targetIndex: firstIndex, energyCost: card.energyCost };
  }

  async function resolveActivation(args) {
    const { player, state, action } = args || {};
    const prepared = prepareActivation(
      player && player.jid, action && action.cardId, state, player, action && action.targetIndex,
    );
    if (!prepared.ok) return prepared;
    const { card, cardId, targets, energyCost } = prepared;
    if (typeof args.calculateDamage !== 'function' || typeof args.applyStatusEffect !== 'function') {
      return { ok: false, message: 'Summon-card combat adapters are unavailable.' };
    }
    const stats = player.stats;
    const magBase = Math.max(1, Number(stats.mag) || Number(stats.atk) || 1);
    const atkBase = Math.max(1, Number(stats.atk) || Number(stats.mag) || 1);
    const allies = card.target === 'self' ? [player] : (card.target === 'party' ? livingPlayers(state) : []);
    const lines = [];
    let totalDamage = 0, evadedCount = 0, healedTotal = 0;
    const defeated = [];
    const hitOne = new Set();

    stats.energy = Math.max(0, Number(stats.energy) - energyCost);
    player.currentEnergy = stats.energy;
    player.combatStats = player.combatStats || {};

    for (const eff of card.effects || []) {
      if (eff.kind === 'damage') {
        for (const target of targets) {
          if (target.isDead) continue;
          const base = Math.max(1, Math.floor((eff.stat === 'atk' ? atkBase : magBase) * eff.mult));
          // Shared combat calculator - this path never calls durabilitySystem.applyWear (summons must not wear gear).
          const calc = args.calculateDamage(player, target, base, eff.dmgType || 'magic', card.element, args.sessionKey, true) || {};
          if (calc.noDamageReason) { lines.push('🚫 ' + target.name + ': ' + calc.noDamageReason); continue; }
          if (calc.wasEvaded) { evadedCount++; lines.push('💨 ' + target.name + ' evades!'); continue; }
          const dmg = Math.max(0, Math.floor(Number(calc.damage) || 0));
          const before = Math.max(0, Number(target.stats.hp) || 0);
          target.stats.hp = Math.max(0, before - dmg); target.currentHP = target.stats.hp;
          player.combatStats.damageDealt = (player.combatStats.damageDealt || 0) + dmg;
          target.combatStats = target.combatStats || {}; target.combatStats.damageTaken = (target.combatStats.damageTaken || 0) + dmg;
          totalDamage += dmg; hitOne.add(target);
          lines.push('💥 ' + target.name + ' takes *' + dmg + '* ' + card.element.toLowerCase() + ' damage');
        }
      } else if (eff.kind === 'status') {
        for (const target of targets) {
          if (target.isDead || Number(target.stats.hp) <= 0) continue;
          if ((card.effects || []).some((x) => x.kind === 'damage') && !hitOne.has(target)) continue;   // a miss/evade also dodges the rider
          const r = args.applyStatusEffect(target, eff.type, eff.duration, eff.value, player.name);
          if (r && r.synergyMsg) lines.push(String(r.synergyMsg).trim());
          else if (r && r.applied !== false) lines.push('✨ ' + target.name + ' is afflicted: ' + eff.type);
        }
      } else if (eff.kind === 'drain') {
        const heal = Math.floor(totalDamage * (eff.pct || 0));
        if (heal > 0) { const b = stats.hp; stats.hp = Math.min(stats.maxHp, stats.hp + heal); player.currentHP = stats.hp; healedTotal += stats.hp - b; lines.push('🩸 You drain *' + (stats.hp - b) + '* HP'); }
      } else if (eff.kind === 'shield') {
        for (const ally of allies) {
          const amount = Math.max(10, Math.floor(((Number(stats.def) || 10) * eff.mult) + magBase * 0.5));
          args.applyStatusEffect(ally, 'shield', eff.duration || 3, amount, player.name);
        }
        lines.push('🛡️ ' + (card.target === 'party' ? 'The party is shielded' : 'You gain a shield'));
      } else if (eff.kind === 'heal') {
        let healedAny = 0;
        for (const ally of allies) {
          const amt = Math.max(1, Math.floor(magBase * eff.mult)); const b = ally.stats.hp;
          ally.stats.hp = Math.min(ally.stats.maxHp, ally.stats.hp + amt); ally.currentHP = ally.stats.hp; healedAny += ally.stats.hp - b;
        }
        healedTotal += healedAny; lines.push('💚 Restores *' + healedAny + '* HP' + (allies.length > 1 ? ' across the party' : ''));
      } else if (eff.kind === 'buff') {
        for (const ally of allies) args.applyStatusEffect(ally, eff.type, eff.duration, eff.value, player.name);
        lines.push('✨ ' + (card.target === 'party' ? 'Party' : 'You') + ' gain ' + eff.type);
      } else if (eff.kind === 'taunt') {
        for (const e of livingEnemies(state)) args.applyStatusEffect(e, 'taunt', eff.duration || 1, 0, player.name);
        lines.push('😠 Enemies are forced to attack you');
      } else if (eff.kind === 'energy') {
        stats.energy = Math.min(Number(stats.maxEnergy) || stats.energy + eff.amount, stats.energy + eff.amount); player.currentEnergy = stats.energy;
        lines.push('⚡ +' + eff.amount + ' energy refunded');
      }
    }

    if (!state.summonCardCooldowns) state.summonCardCooldowns = {};
    state.summonCardCooldowns[String(player.jid) + ':' + cardId] = playerTurnFor(player.jid, state) + card.cooldownTurns + 1;

    for (const target of targets) {
      if (target.stats.hp <= 0 && !target.isDead) {
        target.isDead = true; target.justDied = true; target.stats.hp = 0; target.currentHP = 0;
        player.combatStats.kills = (player.combatStats.kills || 0) + 1;
        defeated.push(target);
        if (typeof args.recordEnemyKill === 'function') args.recordEnemyKill(state, target);
        lines.push('💀 *' + target.name + '* defeated!');
      } else if (!target.isDead && target.isBoss && hitOne.has(target) && typeof args.onBossPhase === 'function') {
        await args.onBossPhase(target);
      }
    }
    if (totalDamage > 0 && typeof args.generateThreat === 'function') args.generateThreat(player, totalDamage);

    const damaging = (card.effects || []).some((x) => x.kind === 'damage');
    const wasEvaded = damaging && targets.length > 0 && evadedCount >= targets.length;
    const message = card.icon + ' *' + card.name + '* — ' + card.abilityName + '!\n' + lines.join('\n');
    return {
      ok: true, card, target: prepared.target, targets, targetIndex: prepared.targetIndex, damage: totalDamage, healing: healedTotal,
      wasEvaded, defeated: defeated.length > 0, defeatedList: defeated, energyCost, message,
    };
  }

  function buildInventoryText(jid, prefix) {
    const cards = getOwnedCards(jid);
    if (!cards.length) {
      return '🃏 *SUMMON CARDS*\n\nYou do not own any summon cards yet.\nCards are special finds - ask a moderator.';
    }
    const lines = cards.map((card, index) =>
      (index + 1) + '. ' + card.icon + ' *' + card.name + '* _(' + card.rarity.toLowerCase() + ' ' + card.type.toLowerCase() + ')_\n   ' +
      card.abilityName + ' · ' + card.energyCost + ' EN · ' + card.cooldownTurns + '-turn cooldown\n   _' + card.description + '_',
    );
    return '🃏 *SUMMON CARDS* (' + cards.length + ')\n━━━━━━━━━━━━━━\n' + lines.join('\n\n') +
      '\n\nIn PvE combat: ' + (prefix || '.j') + ' combat summon <#|name> [enemy#]';
  }

  return {
    catalog: CARD_CATALOG, getOwnedCards, grantCard, revokeCard, acquireCard,
    prepareActivation, resolveActivation, renderTray, buildInventoryText, cooldownFor,
    resolveCardRef, renderHandImage, renderCollectionImage, handEntries,
  };
}

module.exports = {
  CARD_CATALOG, CARD_ALIASES, MODERATOR_GRANTS_ENABLED,
  AUTOMATIC_ACQUISITION_ENABLED, ACQUISITION_SOURCES, normalizeCardId, createSummonCardSystem,
};
