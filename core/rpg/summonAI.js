// ============================================
// 🧠 SUMMON AI — combat behavior for summons
// ============================================
// Mirrors performEnemyAction but with personality modifiers,
// behavior tracking (for personality shifts), loyalty decay,
// and the rare betrayal mechanic.
//
// Reuses monsterSkills.evaluateAction for base AI decisions,
// then applies personality overrides.
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md

const monsterSkills = require('./monsterSkills');
const summonSystem = require('./summonSystem');
const registry = require('./summonRegistry');

// ─────────────────────────────────────────────────────────────
// PERSONALITY SHIFT CONFIG
// ─────────────────────────────────────────────────────────────

const PERSONALITY_SHIFT_THRESHOLD = 20;  // score at which personality shifts

// ─────────────────────────────────────────────────────────────
// BEHAVIOR TRACKING — increments behaviorScore based on action taken
// ─────────────────────────────────────────────────────────────

/**
 * Track summon behavior for personality development.
 * Called after each summon action.
 * @param {object} summonEntity - Combat entity (mutated)
 * @param {object} decision - The decision that was executed
 */
function trackBehavior(summonEntity, decision) {
  if (!summonEntity || !decision || !summonEntity.behaviorScore) return;

  // Attack actions → aggressive
  if (decision.action === 'attack') {
    summonEntity.behaviorScore.aggressive = (summonEntity.behaviorScore.aggressive || 0) + 1;
  }
  // Skill actions — depends on skill type
  else if (decision.action === 'skill' && decision.skill) {
    const skillType = decision.skill.type || '';
    if (['attack', 'aoe', 'execute'].includes(skillType)) {
      summonEntity.behaviorScore.aggressive = (summonEntity.behaviorScore.aggressive || 0) + 1;
    } else if (['buff_self', 'buff_team', 'heal', 'heal_team', 'revive'].includes(skillType)) {
      summonEntity.behaviorScore.curious = (summonEntity.behaviorScore.curious || 0) + 1;
    } else if (['debuff_target', 'taunt'].includes(skillType)) {
      summonEntity.behaviorScore.protective = (summonEntity.behaviorScore.protective || 0) + 1;
    }
  }
  // Guard/defend actions → protective
  else if (decision.action === 'guard' || decision.action === 'defend') {
    summonEntity.behaviorScore.protective = (summonEntity.behaviorScore.protective || 0) + 2;
  }
  // Skip/flee → volatile
  else if (decision.action === 'skip' || decision.action === 'flee') {
    summonEntity.behaviorScore.volatile = (summonEntity.behaviorScore.volatile || 0) + 1;
  }
}

/**
 * Check if a summon's personality should shift based on behaviorScore.
 * Shifts when any score exceeds the threshold.
 * @param {object} summonEntity - Combat entity (mutated)
 * @returns {string|null} - New personality if shifted, null otherwise
 */
function checkPersonalityShift(summonEntity) {
  if (!summonEntity || !summonEntity.behaviorScore) return null;

  const scores = summonEntity.behaviorScore;
  const currentPersonality = summonEntity.personality;

  // Find the highest score
  let highestKey = null;
  let highestVal = 0;
  for (const [key, val] of Object.entries(scores)) {
    if (val > highestVal) {
      highestVal = val;
      highestKey = key;
    }
  }

  // Only shift if score exceeds threshold AND the new personality is different
  if (highestVal >= PERSONALITY_SHIFT_THRESHOLD) {
    const newPersonality = highestKey.toUpperCase();  // 'aggressive' → 'AGGRESSIVE'
    if (newPersonality !== currentPersonality && registry.PERSONALITY_MODIFIERS[newPersonality]) {
      summonEntity.personality = newPersonality;
      return newPersonality;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// PERSONALITY MODIFIERS — override base AI decisions
// ─────────────────────────────────────────────────────────────

/**
 * Apply personality modifier to a base AI decision.
 * @param {object} decision - Base decision from monsterSkills.evaluateAction
 * @param {object} summonEntity - Summon combat entity
 * @param {array} enemies - Living enemies
 * @param {array} players - Living players (for protective guarding)
 * @returns {object} - Modified decision
 */
function applyPersonalityModifier(decision, summonEntity, enemies, players) {
  if (!summonEntity || !summonEntity.personality) return decision;

  const personalityConfig = registry.getPersonalityModifier(summonEntity.personality);
  if (!personalityConfig || !personalityConfig.aiOverride) return decision;

  const override = personalityConfig.aiOverride;
  const summoner = players.find(p => p.jid === summonEntity.summonerJid && !p.isDead);

  // VOLATILE: 30% chance to do something random
  if (override.randomActionChance && Math.random() < override.randomActionChance) {
    const randomActions = ['attack', 'guard', 'skip'];
    if (enemies.length > 0) {
      const randomTarget = enemies[Math.floor(Math.random() * enemies.length)];
      return {
        action: 'attack',
        target: randomTarget,
        msg: `${summonEntity.name} acts erratically!`
      };
    }
    return { action: 'skip', msg: `${summonEntity.name} hesitates...` };
  }

  // AGGRESSIVE: 70% chance to override buff/heal with attack on lowest-HP enemy
  if (override.overrideBuffHeal && override.attackLowestHpChance &&
      Math.random() < override.attackLowestHpChance &&
      decision.action === 'skill' && decision.skill) {
    const skillType = decision.skill.type || '';
    if (['buff_self', 'buff_team', 'heal', 'heal_team', 'revive'].includes(skillType)) {
      // Find lowest-HP enemy
      const livingEnemies = enemies.filter(e => e.stats && e.stats.hp > 0);
      if (livingEnemies.length > 0) {
        const lowestHp = livingEnemies.reduce((min, e) =>
          (e.stats.hp < min.stats.hp) ? e : min, livingEnemies[0]);
        return {
          action: 'attack',
          target: lowestHp,
          msg: `${summonEntity.name}'s aggression flares — attacking the weakest enemy!`
        };
      }
    }
  }

  // PROTECTIVE: 50% chance to guard summoner instead of attacking
  if (override.guardSummonerChance && summoner &&
      Math.random() < override.guardSummonerChance &&
      decision.action === 'attack') {
    return {
      action: 'guard',
      target: summoner,
      interceptPct: override.interceptDamagePct || 30,
      msg: `${summonEntity.name} moves to protect ${summoner.name}!`
    };
  }

  // CURIOUS: 60% chance to prefer utility skills over damage
  // (This is a pre-decision modifier — would need to hook into evaluateAction.
  // For simplicity, we just don't override here. The base AI already picks
  // skills based on archetype, and curious summons often have utility skills.)
  // Future enhancement: pass a "preferUtility" flag to evaluateAction.

  return decision;
}

// ─────────────────────────────────────────────────────────────
// MAIN: performSummonAction
// ─────────────────────────────────────────────────────────────

/**
 * Execute a summon's turn in combat.
 * Mirrors performEnemyAction but with personality + behavior tracking + loyalty.
 *
 * @param {object} sock - WhatsApp socket
 * @param {object} summonEntity - Summon combat entity (from buildCombatEntity)
 * @param {string} sessionKey - Combat session key
 */
async function performSummonAction(sock, summonEntity, sessionKey) {
  // Lazy-require guildAdventure to avoid circular dependency
  // (guildAdventure requires summonAI at top, summonAI needs gameStates from guildAdventure)
  const guildAdventure = require('./guildAdventure');
  const state = guildAdventure.gameStates?.get(sessionKey);
  if (!state) {
    console.error('[SummonAI] No game state for session:', sessionKey);
    return;
  }
  const chatId = state.chatId;

  // 1. Check loyalty — if 0, summon refuses to fight (or betrays)
  if (summonEntity.loyalty <= 0) {
    // 5% betrayal chance per combat when loyalty is 0
    if (Math.random() < 0.05) {
      return await performBetrayal(sock, summonEntity, sessionKey, state);
    }
    // Otherwise, summon just skips
    try {
      await sock.sendMessage(chatId, {
        text: `${summonEntity.icon} ${summonEntity.name}'s loyalty is depleted. It refuses to act.`
      });
    } catch (e) {}
    return;
  }

  // 2. Apply loyalty decay for this action
  summonSystem.applyLoyaltyDecay(summonEntity);

  // 3. Gather targets + allies for AI
  const enemies = (state.enemies || []).filter(e => e.stats && e.stats.hp > 0 && !e.isDead);
  const players = (state.players || []).filter(p => !p.isDead);
  const allies = [...players, ...(state.summons || []).filter(s => s !== summonEntity && s.stats.hp > 0)];

  if (enemies.length === 0) {
    // No enemies to fight — summon skips
    return;
  }

  // 4. Base AI decision (reuses monsterSkills.evaluateAction)
  let decision;
  try {
    decision = monsterSkills.evaluateAction(summonEntity, enemies, allies);
  } catch (e) {
    console.error('[SummonAI] evaluateAction failed:', e?.message || e);
    // Fallback: basic attack on random enemy
    decision = {
      action: 'attack',
      target: enemies[Math.floor(Math.random() * enemies.length)]
    };
  }

  // 5. Apply personality modifier
  decision = applyPersonalityModifier(decision, summonEntity, enemies, players);

  // 6. Execute the decision
  let actionMsg = '';
  if (decision.msg) actionMsg += decision.msg + '\n';

  // 💡 FIX #2 (2026-08-15): Clear any previous guard this summon had set.
  // The guard lasts only until the summon's next turn — if the summon chooses
  // a different action, the old guard is removed. This prevents stale guards
  // from persisting across multiple turns.
  if (state && state.players) {
    for (const p of state.players) {
      if (p.guardedBy === summonEntity.id) {
        delete p.guardedBy;
        delete p.guardInterceptPct;
      }
    }
  }

  if (decision.action === 'guard' && decision.target) {
    // Guard mode: summon intercepts damage for the target
    decision.target.guardedBy = summonEntity.id;
    decision.target.guardInterceptPct = decision.interceptPct || 30;
    actionMsg += `🛡️ ${summonEntity.icon} ${summonEntity.name} is guarding ${decision.target.name} — intercepting ${decision.interceptPct || 30}% of incoming damage!`;
  } else if (decision.action === 'attack' && decision.target) {
    // Basic attack — use calculateDamage from guildAdventure
    try {
      const damage = guildAdventure.calculateDamage(
        summonEntity, decision.target, 1.0, 'physical', null, chatId, false
      );
      if (damage && damage.damage) {
        decision.target.stats.hp = Math.max(0, decision.target.stats.hp - damage.damage);
        decision.target.currentHP = decision.target.stats.hp;
        actionMsg += `⚔️ ${summonEntity.icon} ${summonEntity.name} attacks ${decision.target.name} for ${damage.damage} damage!`;
        // 💡 FIX #6: Generate threat for the summon (0.7× multiplier — lower
        // than tanks so tanks hold aggro better, but summons still pull some)
        try { require('./threatSystem').generateThreat(summonEntity, damage.damage); } catch(e) {}
        if (decision.target.stats.hp <= 0) {
          actionMsg += `\n💀 ${decision.target.name} was defeated!`;
          await guildAdventure.handleDeath(sock, decision.target, sessionKey, summonEntity.name);
        }
      }
    } catch (e) {
      console.error('[SummonAI] attack failed:', e?.message || e);
      actionMsg += `⚔️ ${summonEntity.name} attacks but misses!`;
    }
  } else if (decision.action === 'skill' && decision.skill && decision.target) {
    // 💡 FIX 2026-08-07: Full skill execution via applyAbilityEffect (was a stub).
    // Previously only read effect.multiplier — buffs/debuffs/CC/heals didn't work.
    // Now delegates to the same applyAbilityEffect used by players and enemies.
    try {
      const skill = decision.skill;
      const effect = skill.currentEffect ||
        (typeof skill.effect === 'function' ? skill.effect(summonEntity.level || 1) : skill.effect);
      if (effect) {
        // Consume mana + set cooldown (same as performEnemyAction)
        if (typeof skill.cost === 'number' && skill.cost > 0) {
          summonEntity.mana = Math.max(0, (summonEntity.mana ?? 100) - skill.cost);
        }
        if (typeof skill.cooldown === 'number' && skill.cooldown > 0) {
          summonEntity.cooldowns = summonEntity.cooldowns || {};
          summonEntity.cooldowns[skill.id] = skill.cooldown;
        }
        const targetIndex = state.enemies.indexOf(decision.target);
        const abilityRes = await guildAdventure.applyAbilityEffect(
          sock, summonEntity, skill, effect, targetIndex, chatId
        );
        if (abilityRes && abilityRes.msg) {
          actionMsg += abilityRes.msg;
        } else {
          actionMsg += `✨ ${summonEntity.icon} ${summonEntity.name} uses ${skill.name || 'a skill'}!`;
        }
        // Check for kills
        if (decision.target.stats && decision.target.stats.hp <= 0) {
          actionMsg += `\n💀 ${decision.target.name} was defeated!`;
          await guildAdventure.handleDeath(sock, decision.target, sessionKey, summonEntity.name);
        }
      } else {
        actionMsg += `✨ ${summonEntity.name} uses ${skill.name || 'a skill'}!`;
      }
    } catch (e) {
      console.error('[SummonAI] skill failed:', e?.message || e);
      actionMsg += `✨ ${summonEntity.name} attempts a skill but fumbles!`;
    }
  } else if (decision.action === 'skip') {
    actionMsg += `${summonEntity.icon} ${summonEntity.name} ${decision.msg || 'waits...'}`;
  } else {
    actionMsg += `${summonEntity.icon} ${summonEntity.name} hesitates.`;
  }

  // 7. Send the action message + generate combat image
  if (actionMsg.trim()) {
    try {
      await sock.sendMessage(chatId, { text: actionMsg.trim() });
    } catch (e) {
      console.error('[SummonAI] sendMessage failed:', e?.message || e);
    }
  }

  // 💡 NEW 2026-08-07: Generate combat image for the summon's turn.
  // Previously summon turns were text-only — no visual feedback. Now we
  // build a turnInfo and call nextTurn to render the combat scene with
  // the summon as the active actor (turn indicator under the summon).
  try {
    const turnInfo = {
      actor: summonEntity,
      action: { name: decision.skill?.name || (decision.action === 'attack' ? 'Attack' : decision.action) },
      target: decision.target,
      damage: 0,
      healing: 0,
      effects: [],
      turnNumber: state.turnCount || 0,
    };
    await guildAdventure.nextTurn(sock, turnInfo, sessionKey);
  } catch (e) {
    console.error('[SummonAI] nextTurn (image) failed:', e?.message || e);
    // Non-fatal — combat continues without the image
  }

  // 8. Track behavior for personality development
  trackBehavior(summonEntity, decision);

  // 9. Check for personality shift
  const newPersonality = checkPersonalityShift(summonEntity);
  if (newPersonality) {
    try {
      await sock.sendMessage(chatId, {
        text: `💫 ${summonEntity.icon} ${summonEntity.name}'s personality shifted to **${newPersonality}**!`
      });
    } catch (e) {}
  }
}

// ─────────────────────────────────────────────────────────────
// BETRAYAL — when loyalty hits 0, summon may attack the player
// ─────────────────────────────────────────────────────────────

/**
 * Perform a betrayal action — summon attacks its summoner.
 * Rare (5% chance per combat when loyalty = 0).
 * @param {object} sock
 * @param {object} summonEntity
 * @param {string} sessionKey
 * @param {object} state
 */
async function performBetrayal(sock, summonEntity, sessionKey, state) {
  const chatId = state.chatId;
  const summoner = (state.players || []).find(p => p.jid === summonEntity.summonerJid && !p.isDead);

  if (!summoner) {
    // No summoner to betray — summon just leaves
    summonEntity.isDead = true;
    summonEntity.stats.hp = 0;
    try {
      await sock.sendMessage(chatId, {
        text: `💔 ${summonEntity.icon} ${summonEntity.name}'s bond is broken. It vanishes into the ether.`
      });
    } catch (e) {}
    return;
  }

  // Summon attacks summoner
  const guildAdventure = require('./guildAdventure');
  try {
    const damage = Math.floor((summonEntity.stats.atk || 20) * 1.5);  // 1.5× damage on betrayal
    summoner.stats.hp = Math.max(0, summoner.stats.hp - damage);
    summoner.currentHP = summoner.stats.hp;
    try {
      await sock.sendMessage(chatId, {
        text: `💔 ${summonEntity.icon} ${summonEntity.name} BETRAYS ${summoner.name}! Dealt ${damage} damage to its former master!`
      });
    } catch (e) {}

    if (summoner.stats.hp <= 0) {
      await guildAdventure.handleDeath(sock, summoner, sessionKey, summonEntity.name);
    }
  } catch (e) {
    console.error('[SummonAI] betrayal failed:', e?.message || e);
  }

  // Summon leaves after betrayal
  summonEntity.isDead = true;
  summonEntity.stats.hp = 0;
}

// ─────────────────────────────────────────────────────────────
// SOUL ECHO — apply buff to summoner on summon death
// ─────────────────────────────────────────────────────────────

/**
 * Apply a summon's Soul Echo to its summoner on death.
 * @param {object} summoner - Player entity (mutated)
 * @param {object} summonEntity - The summon that died
 * @returns {string} - Echo message for combat log
 */
function applySoulEcho(summoner, summonEntity) {
  if (!summoner || !summonEntity || !summonEntity.echoId) return '';

  const echo = registry.getEcho(summonEntity.echoId);
  if (!echo || !echo.buff) return '';

  // Apply the buff to the summoner
  if (!summoner.buffs) summoner.buffs = [];

  // Remove any existing echo buff (only one echo active at a time)
  summoner.buffs = summoner.buffs.filter(b => !b.isEcho);

  // 💡 FIX P2 (2026-08-16): Handle different buff types from the ECHOES dict.
  // Some echoes buff the summoner, some debuff enemies, some deal damage.
  const buffType = echo.buff.type;

  if (buffType === 'enemy_damage') {
    // Shrapnel Echo — deal instant damage to all enemies (no buff, just damage)
    // The actual damage application happens in guildAdventure's handleDeath
    // where applySoulEcho is called. We store the damage on the summoner
    // so the caller can apply it.
    summoner.pendingEchoDamage = echo.buff.value;
    return `💫 ${summonEntity.name} falls — ${summoner.name} absorbs the **${echo.name}**! ${echo.icon} ${echo.desc}`;
  }

  if (buffType === 'enemy_debuff_def') {
    // Dragon Fear — debuff all enemies' DEF
    // Store the debuff for the caller to apply to enemies
    summoner.pendingEchoEnemyDebuff = { stat: 'def', value: echo.buff.value, duration: echo.buff.duration };
    return `💫 ${summonEntity.name} falls — ${summoner.name} absorbs the **${echo.name}**! ${echo.icon} ${echo.desc}`;
  }

  if (buffType === 'shield') {
    // Void Shield — add a shield status effect to the summoner
    if (!summoner.statusEffects) summoner.statusEffects = [];
    summoner.statusEffects.push({
      type: 'shield',
      value: echo.buff.value,
      duration: echo.buff.duration,
      icon: echo.icon,
    });
    return `💫 ${summonEntity.name} falls — ${summoner.name} absorbs the **${echo.name}**! ${echo.icon} ${echo.desc}`;
  }

  // Standard buff types (atk, defense, magic_damage, spd, all)
  const buff = {
    type: buffType,
    value: echo.buff.value,
    duration: echo.buff.duration,
    icon: echo.icon,
    name: echo.name,
    isEcho: true,
    justApplied: true,
  };
  summoner.buffs.push(buff);

  return `💫 ${summonEntity.name} falls — ${summoner.name} absorbs the **${echo.name}**! ${echo.icon} ${echo.desc}`;
}

// ─────────────────────────────────────────────────────────────
// POST-COMBAT PERSISTENCE — save loyalty/personality changes
// ─────────────────────────────────────────────────────────────

/**
 * Persist combat state changes back to the Summon document.
 * Called at end of combat for each summon that participated.
 * @param {object} summonEntity - Combat entity
 */
async function persistSummonChanges(summonEntity) {
  if (!summonEntity || !summonEntity._summonDoc) return;

  const doc = summonEntity._summonDoc;
  doc.loyalty = summonEntity.loyalty || doc.loyalty;
  doc.personality = summonEntity.personality || doc.personality;
  doc.behaviorScore = summonEntity.behaviorScore || doc.behaviorScore;
  doc.lastUsedAt = new Date();

  // 💡 PHASE 4 (2026-08-01): add bond XP for participating in combat.
  // 1-3 bond XP per combat (randomized). 10 bond XP = 1 bond level.
  try {
    const summonBondTraits = require('./summonBondTraits');
    const bondXP = 1 + Math.floor(Math.random() * 3); // 1-3
    summonBondTraits.addBondXP(doc, bondXP);
  } catch (e) {}

  try {
    await doc.save();
  } catch (e) {
    console.error('[SummonAI] persistSummonChanges failed:', e?.message || e);
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  performSummonAction,
  trackBehavior,
  checkPersonalityShift,
  applyPersonalityModifier,
  applySoulEcho,
  persistSummonChanges,
  performBetrayal,
  PERSONALITY_SHIFT_THRESHOLD
};
