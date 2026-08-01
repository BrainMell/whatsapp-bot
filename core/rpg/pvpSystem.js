// ============================================ 
// ⚔️ PVP DUEL SYSTEM — PHANTOM STANDOFF
// ============================================ 
// Balance notes:
//   PvP damage is dampened to prevent one-shots.
//   Energy regenerates each turn to make ability use meaningful.
//   Defense mitigation is capped to keep fights dynamic.
// ============================================ 

const economy = require('./economy');
const progression = require('./progression');
const skillTree = require('./skillTree');
const botConfig = require('../../botConfig');
const combatImageGenerator = require('./combatImageGenerator');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');

const activeDuels = new Map();  // chatId → duelState
const duelInvites = new Map();  // chatId → { challenger, target, stake, timestamp }

function resolveJid(jid) {
    if (!jid) return jid;
    try {
        const lidResolver = require('../utils/lidResolver');
        const resolved = lidResolver.resolveJid(jid);
        // 💡 FIX: if resolveJid returned the original (mapping miss), try
        // the OTHER format in the economy cache. Fixes PvP after Oracle
        // migration where LID mappings may be incomplete.
        if (resolved === jid || !economy.economyData.has(resolved)) {
            if (typeof jid === 'string') {
                if (jid.endsWith('@lid')) {
                    const phoneJid = jid.replace('@lid', '@s.whatsapp.net');
                    if (economy.economyData.has(phoneJid)) return phoneJid;
                } else if (jid.endsWith('@s.whatsapp.net')) {
                    const lidJid = jid.replace('@s.whatsapp.net', '@lid');
                    if (economy.economyData.has(lidJid)) return lidJid;
                }
            }
        }
        return resolved;
    } catch (e) {
        console.error("Error resolving JID in pvpSystem:", e.message);
        return jid;
    }
}

function getBuffIcon(buffType) {
    const icons = {
        atk: "⚔️",
        attack: "⚔️",
        def: "🛡️",
        defense: "🛡️",
        spd: "💨",
        speed: "💨",
        mag: "✨",
        magic: "✨",
        evasion: "💫",
        shield: "🔷",
        crit: "🎯",
        luck: "🍀",
    };
    return icons[buffType] || "✨";
}

function getDebuffIcon(debuffType) {
    const icons = {
        vulnerability: "💀",
        blind: "🌫️",
        slow: "🐌",
        weak: "😵",
        curse: "🔮",
        poison: "🧪",
        burn: "🔥",
        bleed: "🩸",
        stun: "💫",
        freeze: "❄️",
        sleep: "💤",
    };
    return icons[debuffType] || "💀";
}

function applyBuff(player, type, value, duration) {
    if (!player.buffs) player.buffs = [];
    player.buffs.push({
        type,
        value,
        duration,
        icon: getBuffIcon(type)
    });
}

function applyStatusEffect(player, type, duration, value) {
    if (!player.statusEffects) player.statusEffects = [];
    player.statusEffects.push({
        type,
        duration,
        value,
        icon: getDebuffIcon(type)
    });
}

function getEffectiveStats(player) {
    const stats = { ...player.stats };
    
    // Apply buffs from player.buffs
    if (player.buffs) {
        for (const buff of player.buffs) {
            const statName = buff.type;
            if (statName === 'all') {
                stats.atk = (stats.atk || 0) + buff.value;
                stats.def = (stats.def || 0) + buff.value;
                stats.spd = (stats.spd || 0) + buff.value;
            } else if (statName) {
                stats[statName] = (stats[statName] || 0) + buff.value;
            }
        }
    }
    
    // Apply status effect multipliers
    if (player.statusEffects) {
        for (const effect of player.statusEffects) {
            if (effect.type === 'shield') {
                stats.def = Math.floor((stats.def || 0) * 1.5);
            }
            if (effect.type === 'vulnerability') {
                stats.def = Math.floor((stats.def || 0) * 0.7);
            }
            if (effect.type === 'curse' || effect.type === 'weak') {
                stats.def = Math.floor((stats.def || 0) * 0.8);
                stats.atk = Math.floor((stats.atk || 0) * 0.8);
            }
            if (effect.type === 'slow') {
                stats.spd = Math.floor((stats.spd || 0) * 0.8);
            }
        }
    }
    
    return stats;
}

function getPlayerEffectsString(player) {
    let effectsStr = '';
    const icons = [];
    if (player.buffs && player.buffs.length > 0) {
        for (const buff of player.buffs) {
            icons.push(buff.icon || getBuffIcon(buff.type));
        }
    }
    if (player.statusEffects && player.statusEffects.length > 0) {
        for (const effect of player.statusEffects) {
            icons.push(effect.icon || getDebuffIcon(effect.type));
        }
    }
    if (icons.length > 0) {
        effectsStr = ' [' + icons.join('') + ']';
    }
    return effectsStr;
}

// ─── PvP Balance Constants ────────────────────
const PVP_DAMAGE_MULT   = 0.80;  // Base damage multiplier for basic attacks
const PVP_ENERGY_REGEN  = 25;    // Energy gained per turn. FIX: bumped from 20 so ultimate-cost skills (capped at 100) are still usable alongside basic actions.
const PVP_DEFENSE_CAP   = 0.50;  // Max 50% damage reduction from DEF in PvP
const PVP_ABILITY_MULT  = 0.45;  // Ability damage multiplier in PvP
const PVP_CRIT_MULT     = 1.5;   // Crit multiplier in PvP
const PVP_TIMEOUT_MS    = 300000; // 5 minutes inactivity = expired duel
const CHALLENGE_TIMEOUT = 120000; // 2 minutes to accept challenge

function getDuel(chatId) {
    return activeDuels.get(chatId);
}

function getInvite(chatId, targetJid) {
    const resolvedTarget = resolveJid(targetJid);
    const invite = duelInvites.get(chatId);
    if (!invite) return null;
    if (invite.target === resolvedTarget) return invite;
    return null;
}

function declineChallenge(chatId, targetJid) {
    const resolvedTarget = resolveJid(targetJid);
    const invite = duelInvites.get(chatId);
    if (invite && invite.target === resolvedTarget) {
        duelInvites.delete(chatId);
        return true;
    }
    return false;
}

// ==========================================
// 🗡️ CHALLENGE SYSTEM
// ==========================================

function challengePlayer(chatId, challengerJid, targetJid, stake = 0) {
    if (activeDuels.has(chatId)) {
        return { success: false, message: '❌ A duel is already active in this chat!' };
    }

    const existing = duelInvites.get(chatId);
    if (existing && (Date.now() - existing.timestamp < CHALLENGE_TIMEOUT)) {
        return { success: false, message: '❌ A challenge is already pending! Accept or wait for it to expire.' };
    }

    const resolvedChallenger = resolveJid(challengerJid);
    const resolvedTarget = resolveJid(targetJid);

    // Block self-challenges — previously a user could challenge themselves,
    // which would create a nonsensical 1-player duel.
    if (resolvedChallenger === resolvedTarget) {
        return { success: false, message: '❌ You cannot challenge yourself!' };
    }

    if (!economy.isRegistered(resolvedChallenger)) {
        return { success: false, message: '❌ You must be registered to challenge someone!' };
    }
    if (!economy.isRegistered(resolvedTarget)) {
        return { success: false, message: '❌ The player you challenged is not registered!' };
    }

    if (stake > 0) {
        const user = economy.getUser(resolvedChallenger);
        if ((user?.wallet || 0) < stake) {
            return { success: false, message: `❌ Insufficient funds! You need ${botConfig.getCurrency().symbol}${stake.toLocaleString()} to stake.` };
        }
        // Also check the target's wallet upfront — if they obviously can't
        // afford the stake, refuse the challenge instead of wasting 2 minutes
        // of the challenger's time before the target gets the accept-time
        // rejection. This is a soft check; the target's wallet could change
        // between challenge and accept, so we still re-verify at accept time.
        const target = economy.getUser(resolvedTarget);
        if ((target?.wallet || 0) < stake) {
            return { success: false, message: `❌ ${target?.nickname || resolvedTarget.split('@')[0]} doesn't have enough Zeni to match that stake!` };
        }
    }

    duelInvites.set(chatId, {
        challenger: resolvedChallenger,
        target: resolvedTarget,
        stake,
        timestamp: Date.now(),
    });

    return { success: true };
}

// ==========================================
// ✅ ACCEPT CHALLENGE
// ==========================================

async function acceptChallenge(sock, chatId, targetJid) {
    const resolvedTarget = resolveJid(targetJid);
    const invite = duelInvites.get(chatId);
    if (!invite) return { success: false, message: '❌ No pending challenge found.' };
    if (invite.target !== resolvedTarget) return { success: false, message: '❌ This challenge was not issued to you!' };
    if (Date.now() - invite.timestamp > CHALLENGE_TIMEOUT) {
        duelInvites.delete(chatId);
        return { success: false, message: '❌ Challenge expired! (2 min limit)' };
    }

    // Clean up the invite on ANY failure path so the challenger isn't locked
    // out for 2 minutes when the target can't accept (e.g. insufficient funds,
    // or one of the players unregistered in the meantime). Previously the
    // invite stayed in `duelInvites` and blocked all new challenges in that
    // chat until the 2-minute timeout elapsed — bad UX.
    const cleanupAndFail = (msg) => {
        duelInvites.delete(chatId);
        return { success: false, message: msg };
    };

    if (!economy.isRegistered(invite.challenger)) {
        return cleanupAndFail('❌ Challenger is no longer registered!');
    }
    if (!economy.isRegistered(resolvedTarget)) {
        return cleanupAndFail('❌ You need to register first before accepting a duel!');
    }

    // Validate stakes
    if (invite.stake > 0) {
        const challenger = economy.getUser(invite.challenger);
        const target = economy.getUser(resolvedTarget);
        if ((challenger?.wallet || 0) < invite.stake) {
            return cleanupAndFail('❌ Challenger no longer has enough Zeni for the stake!');
        }
        if ((target?.wallet || 0) < invite.stake) {
            return cleanupAndFail(`❌ You need ${botConfig.getCurrency().symbol}${invite.stake.toLocaleString()} to accept!`);
        }
        economy.removeMoney(invite.challenger, invite.stake);
        economy.removeMoney(resolvedTarget, invite.stake);
    }

    duelInvites.delete(chatId);

    // Build duel state
    const p1Data = economy.getUser(invite.challenger);
    const p2Data = economy.getUser(resolvedTarget);
    if (!p1Data || !p2Data) {
        return { success: false, message: '❌ Failed to load player data for the duel!' };
    }

    const p1Stats = progression.getBaseStats(invite.challenger, p1Data.class);
    const p2Stats = progression.getBaseStats(targetJid, p2Data.class);

    // Cap extreme stat differences to make PvP more fair
    function capPvPStats(stats) {
        return {
            ...stats,
            atk:  Math.min(stats.atk,  1200),
            def:  Math.min(stats.def,  500),
            mag:  Math.min(stats.mag,  1200),
            spd:  Math.min(stats.spd,  200),
            crit: Math.min(stats.crit, 80),
            evasion: Math.min(stats.evasion || 0, 55),
        };
    }

    const duelState = {
        chatId,
        stake: invite.stake,
        round: 1,
        turn: 0, // index into players[]
        lastAction: Date.now(),
        history: [],
        players: [
            buildDuelPlayer(invite.challenger, p1Data, capPvPStats(p1Stats), 0),
            buildDuelPlayer(targetJid, p2Data, capPvPStats(p2Stats), 1),
        ],
    };

    activeDuels.set(chatId, duelState);
    const image = await generateDuelImage(duelState);

    const p1 = duelState.players[0];
    const p2 = duelState.players[1];
    const startMsg =
        `🏟️ *PHANTOM STANDOFF* 🏟️\n` +
        `———————————\n` +
        `🔴 *${p1.name}* \`Lv.${p1.level}\` (${p1.class?.name || 'Fighter'})\n` +
        `   ↳ ❤️ HP: \`${p1.hp}/${p1.maxHp}\` · ⚡ EN: \`${p1.energy}/${p1.maxEnergy}\`\n` +
        `🔵 *${p2.name}* \`Lv.${p2.level}\` (${p2.class?.name || 'Fighter'})\n` +
        `   ↳ ❤️ HP: \`${p2.hp}/${p2.maxHp}\` · ⚡ EN: \`${p2.energy}/${p2.maxEnergy}\`\n\n` +
        `🎯 *${p1.name}* claims the initiative!\n` +
        `———————————\n` +
        `🗡️ \`${botConfig.getPrefix()} combat attack\`\n` +
        `🔮 \`${botConfig.getPrefix()} combat ability <n>\`\n` +
        `🎒 \`${botConfig.getPrefix()} combat item\`\n` +
        `🏃 \`${botConfig.getPrefix()} combat flee\` *(⚠️ Deducts 20% XP, 50% Wallet, and 1 random item!)*`;

    return { success: true, duel: duelState, image, message: startMsg };
}

function buildDuelPlayer(jid, userData, stats, idx) {
    const classData = economy.getUserClass(jid);
    const progData = progression.getUser(jid);
    // 💡 FIX §2.9: was capping energy at 100 in PvP, but several ultimate
    // abilities (Singularity, Total War, etc.) cost 110-162 energy — making
    // them permanently unusable in PvP. Now uses the player's actual
    // maxEnergy from their stats (which accounts for level + MAG scaling
    // via progression.getBaseStats). Falls back to 200 if missing so all
    // ultimates are castable.
    const maxEnergy = stats.maxEnergy || 200;
    return {
        jid,
        name: userData.nickname || jid.split('@')[0],
        hp: stats.maxHp || stats.hp,
        maxHp: stats.maxHp || stats.hp,
        energy: maxEnergy,
        maxEnergy: maxEnergy,
        stats,
        level: progData?.level || 1,
        class: classData,
        spriteIndex: userData.spriteIndex || idx,
        statusEffects: [],
        buffs: [],
        cooldowns: {},
    };
}

// ==========================================
// ⚔️ HANDLE PVP ACTION
// ==========================================

async function handlePvPAction(sock, chatId, senderJid, action, target, m) {
    const resolvedSender = resolveJid(senderJid);
    const duel = activeDuels.get(chatId);
    if (!duel) return { success: false, message: '❌ No active duel here!' };

    const currentPlayer = duel.players[duel.turn];
    const opponent = duel.players[1 - duel.turn];
    
    if (currentPlayer.jid !== resolvedSender) {
        return { success: false, message: `⏳ It's not your turn! Waiting on *${currentPlayer.name}*...` };
    }

    // Tick current player's status effects at the beginning of their turn
    let statusLog = [];
    let skipTurn = false;
    
    if (currentPlayer.statusEffects && currentPlayer.statusEffects.length > 0) {
        for (let i = currentPlayer.statusEffects.length - 1; i >= 0; i--) {
            const effect = currentPlayer.statusEffects[i];
            
            // Damage over time: poison, burn, bleed
            if (effect.type === 'poison' || effect.type === 'burn' || effect.type === 'bleed') {
                const dmg = effect.dotDamage || (effect.type === 'poison' ? 10 : effect.type === 'burn' ? 15 : 12);
                currentPlayer.hp = Math.max(0, currentPlayer.hp - dmg);
                statusLog.push(`🩸 *${effect.type.toUpperCase()}* dealt *${dmg}* damage to *${currentPlayer.name}*!`);
            }
            // Regen
            else if (effect.type === 'regen') {
                const heal = effect.value || 15;
                currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + heal);
                statusLog.push(`💚 *REGEN* healed *${currentPlayer.name}* for *${heal}* HP!`);
            }
            // Stun / Freeze / Sleep
            else if (effect.type === 'stun' || effect.type === 'freeze' || effect.type === 'sleep') {
                skipTurn = true;
                statusLog.push(`💫 *${effect.type.toUpperCase()}* active! *${currentPlayer.name}*'s turn is skipped!`);
            }
            
            effect.duration--;
            if (effect.duration <= 0) {
                currentPlayer.statusEffects.splice(i, 1);
                statusLog.push(`✨ *${effect.type.toUpperCase()}* has worn off.`);
            }
        }
    }

    // Tick buffs
    if (currentPlayer.buffs && currentPlayer.buffs.length > 0) {
        for (let i = currentPlayer.buffs.length - 1; i >= 0; i--) {
            const buff = currentPlayer.buffs[i];
            buff.duration--;
            if (buff.duration <= 0) {
                currentPlayer.buffs.splice(i, 1);
                statusLog.push(`✨ *${buff.type.toUpperCase()}* buff has worn off.`);
            }
        }
    }

    if (currentPlayer.hp <= 0) {
        currentPlayer.hp = 0;
        const statusMsg = statusLog.join('\n');
        const result = await finishDuel(chatId, duel, opponent, currentPlayer);
        activeDuels.delete(chatId);
        return { success: true, finished: true, message: statusMsg + '\n\n💀 *' + currentPlayer.name + '* died from status effects!\n\n' + result };
    }

    if (skipTurn) {
        // Tick cooldowns
        for (const [skillId, cd] of Object.entries(currentPlayer.cooldowns)) {
            currentPlayer.cooldowns[skillId] = cd - 1;
            if (currentPlayer.cooldowns[skillId] <= 0) delete currentPlayer.cooldowns[skillId];
        }
        
        // Advance turn
        duel.turn = 1 - duel.turn;
        if (duel.turn === 0) duel.round++;
        duel.lastAction = Date.now();
        
        // Energy regen
        currentPlayer.energy = Math.min(currentPlayer.maxEnergy, currentPlayer.energy + PVP_ENERGY_REGEN);
        
        const nextPlayer = duel.players[duel.turn];
        const imageResult = await generateDuelImage(duel);
        
        const statusMsg = statusLog.join('\n');
        let roundMsg = `⚔️ *PVP DUEL · ROUND ${duel.round}*\n` +
                        `———————————\n` +
                        `${statusMsg}\n\n` +
                        `🔴 *${currentPlayer.name}*${getPlayerEffectsString(currentPlayer)}: \`${Math.max(0, currentPlayer.hp)}/${currentPlayer.maxHp}\` HP · \`${Math.floor(currentPlayer.energy)}\` EN\n` +
                        `🔵 *${opponent.name}*${getPlayerEffectsString(opponent)}: \`${Math.max(0, opponent.hp)}/${opponent.maxHp}\` HP · \`${Math.floor(opponent.energy)}\` EN\n\n` +
                        `🎯 *@${nextPlayer.jid.split('@')[0]}* — It's your turn!\n` +
                        `———————————\n` +
                        `🗡️ \`${botConfig.getPrefix()} combat attack\`\n` +
                        `🔮 \`${botConfig.getPrefix()} combat ability <n>\`\n` +
                        `🎒 \`${botConfig.getPrefix()} combat item\`\n` +
                        `🏃 \`${botConfig.getPrefix()} combat flee\``;

        return {
            success: true,
            finished: false,
            message: roundMsg,
            image: imageResult,
            mentions: [nextPlayer.jid],
        };
    }

    let actionResult = '';
    let damage = 0;
    let healing = 0;
    let isCrit = false;
    let missed = false;
    let abilityObj = null;

    if (action === 'attack') {
        const result = resolveBasicAttack(currentPlayer, opponent);
        damage = result.damage;
        isCrit = result.isCrit;
        missed = result.missed;
        
        if (missed) {
            actionResult = `💨 *MISS!* ${opponent.name} dodged the attack!`;
        } else if (isCrit) {
            opponent.hp -= damage;
            actionResult = `⚔️ *${currentPlayer.name}* attacks *${opponent.name}*!\n💢 ★ *CRITICAL HIT!* ★ — ${damage} damage!`;
        } else {
            opponent.hp -= damage;
            actionResult = `⚔️ *${currentPlayer.name}* attacks *${opponent.name}*! — *${damage}* damage`;
        }

    } else if (action === 'ability') {
        if (!target || isNaN(parseInt(target))) {
            return { success: false, message: `❌ Please specify a valid ability number! Example: \`${require('../../botConfig').getPrefix()} combat ability 1\`` };
        }
        const abilityIndex = parseInt(target) - 1;
        const learned = getLearnedAbilities(currentPlayer.jid, currentPlayer.class?.id);
        const ability = learned[abilityIndex];
        abilityObj = ability;

        if (!ability) return { success: false, message: `❌ Ability #${parseInt(target)} not found! Use \`${require('../../botConfig').getPrefix()} abilities\` to see your list.` };

        const skillLevel = economy.getUser(currentPlayer.jid)?.skills?.[ability.id] || 1;
        const effect = skillTree.getSkillEffect(ability, skillLevel);
        const energyCost = effect?.cost || 20;

        if (currentPlayer.energy < energyCost) {
            return { success: false, message: `❌ Not enough energy! Need ${energyCost}, have ${Math.floor(currentPlayer.energy)}.` };
        }

        // Check cooldown
        if (currentPlayer.cooldowns[ability.id]) {
            return { success: false, message: `⏱️ *${ability.name}* is on cooldown! (${currentPlayer.cooldowns[ability.id]} turns left)` };
        }

        currentPlayer.energy -= energyCost;
        const cooldownVal = effect?.cooldown !== undefined ? effect.cooldown : ability.cooldown;
        if (cooldownVal) currentPlayer.cooldowns[ability.id] = cooldownVal;

        let hasResolved = false;
        const attackerStats = getEffectiveStats(currentPlayer);
        const defenderStats = getEffectiveStats(opponent);

        if (effect?.type === 'damage' || effect?.type === 'aoe' || effect?.type === 'damage_dot' || effect?.type === 'multi_hit' || effect?.type === 'damage_heal') {
            const statBase = (effect.damageType === 'magic' ? attackerStats.mag : attackerStats.atk) || attackerStats.atk;
            damage = Math.floor(statBase * (effect.multiplier || 1.2) * PVP_ABILITY_MULT);
            // Partial defense mitigation
            const defReduction = Math.min(defenderStats.def * 0.2, damage * PVP_DEFENSE_CAP);
            damage = Math.max(20, Math.floor(damage - defReduction));
            // Crit Check
            isCrit = Math.random() * 100 < (attackerStats.crit || 5);
            if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);
            opponent.hp -= damage;
            if (isCrit) {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💢 ★ *CRITICAL HIT!* ★ — Deals *${damage}* damage to *${opponent.name}*!`;
            } else {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💥 Deals *${damage}* damage to *${opponent.name}*!`;
            }
        } else if (effect?.type === 'execute') {
            const hpPercent = (opponent.hp / opponent.maxHp) * 100;
            const mult = hpPercent <= (effect.threshold || 30) ? 2.5 : 1.0;
            const statBase = (effect.damageType === 'magic' ? attackerStats.mag : attackerStats.atk) || attackerStats.atk;
            damage = Math.floor(statBase * (effect.multiplier || 1.2) * mult * PVP_ABILITY_MULT);
            const defReduction = Math.min(defenderStats.def * 0.2, damage * PVP_DEFENSE_CAP);
            damage = Math.max(20, Math.floor(damage - defReduction));
            // Crit Check
            isCrit = Math.random() * 100 < (attackerStats.crit || 5);
            if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);
            opponent.hp -= damage;
            if (isCrit) {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💢 ★ *CRITICAL HIT!* ★ — Deals *${damage}* damage to *${opponent.name}*!`;
            } else {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💥 Deals *${damage}* damage to *${opponent.name}*!`;
            }
            if (mult > 1.0) {
                actionResult += `\n⚡ *EXECUTE THRESHOLD TRIGGERED!* ⚡`;
            }
        } else if (effect?.type === 'damage_cc') {
            const statBase = attackerStats.atk;
            damage = Math.floor(statBase * (effect.multiplier || 1.0) * PVP_ABILITY_MULT);
            damage = Math.max(15, damage - Math.floor(defenderStats.def * 0.15));
            // Crit Check
            isCrit = Math.random() * 100 < (attackerStats.crit || 5);
            if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);
            opponent.hp -= damage;
            if (isCrit) {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💢 ★ *CRITICAL HIT!* ★ — *${damage}* damage`;
            } else {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💥 *${damage}* damage`;
            }
        } else {
            actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!`;
        }

        // Process resolved effects
        if (effect?.resolvedEffects && Object.keys(effect.resolvedEffects).length > 0) {
            hasResolved = true;
            for (const [effId, effData] of Object.entries(effect.resolvedEffects)) {
                if (effId === 'heal' || effId === 'heal_team' || effId === 'heal_self') {
                    const healVal = effData.value || 80;
                    const healAmt = Math.min(healVal, currentPlayer.maxHp - currentPlayer.hp);
                    currentPlayer.hp += healAmt;
                    actionResult += `\n💚 Restored *${healAmt}* HP! (${currentPlayer.hp}/${currentPlayer.maxHp})`;
                }
                else if (effId === 'buff_self' || effId === 'buff_team' || effId === 'buff_target' || effId === 'shield' || effId === 'evasion' || effId === 'critBuff') {
                    const rawStat = effData.stat || (effId === 'shield' ? 'defense' : effId === 'critBuff' ? 'crit' : effId === 'evasion' ? 'evasion' : 'atk');
                    const statName = rawStat === 'attack' ? 'atk' : rawStat === 'defense' ? 'def' : rawStat === 'speed' ? 'spd' : rawStat === 'magic' ? 'mag' : rawStat;
                    const buffVal = Math.floor((effData.value || 20) * 0.5); // Half buffs in PvP
                    applyBuff(currentPlayer, statName, buffVal, effData.duration || 2);
                    actionResult += `\n✨ +${buffVal} ${statName.toUpperCase()} for ${effData.duration || 2} turns!`;
                }
                else if (effId === 'stun' || effId === 'freeze' || effId === 'sleep' || effId === 'charm' || effId === 'cc') {
                    const chance = effData.chance || 100;
                    if (Math.random() * 100 < chance) {
                        applyStatusEffect(opponent, effId, effData.duration || 1);
                        actionResult += `\n💫 *${effId.toUpperCase()}* applied to *${opponent.name}* for ${effData.duration || 1} turn!`;
                    }
                }
                else if (effId === 'dot' || effId === 'burn' || effId === 'poison' || effId === 'bleed') {
                    applyStatusEffect(opponent, effId, effData.duration || 3, effData.value || 10);
                    actionResult += `\n🔥 *${effId.toUpperCase()}* applied to *${opponent.name}* for ${effData.duration || 3} turns!`;
                }
                else if (effId === 'haste') {
                    const buffVal = Math.floor((effData.value || 20) * 0.5);
                    applyBuff(currentPlayer, 'spd', buffVal, effData.duration || 3);
                    actionResult += `\n⚡ Haste applied! +${buffVal} SPD for ${effData.duration || 3} turns!`;
                }
            }
        }

        // Fallbacks for legacy/flattened root effects
        if (!hasResolved) {
            if (effect?.type === 'damage_dot' && effect.dot) {
                applyStatusEffect(opponent, effect.dot, effect.dotDuration || 2, effect.dotDamage || 10);
                actionResult += `\n🔥 *${effect.dot.toUpperCase()}* applied to *${opponent.name}* for ${effect.dotDuration || 2} turns!`;
            }
            if (effect?.type === 'damage_heal') {
                const healVal = Math.floor(damage * (effect.healPercent || 30) / 100);
                currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + healVal);
                actionResult += `\n💚 Healed self for *${healVal}* HP!`;
            }
            if (effect?.type === 'heal' || effect?.type === 'heal_team' || effect?.type === 'heal_self') {
                healing = Math.floor(effect.value || 80);
                currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + healing);
                actionResult += `\n💚 Restored *${healing}* HP! (${currentPlayer.hp}/${currentPlayer.maxHp})`;
            }
            if (effect?.type === 'buff_self') {
                const statName = effect.buffType || 'atk';
                const buffVal = Math.floor((effect.value || 20) * 0.5); // Half buffs in PvP
                applyBuff(currentPlayer, statName, buffVal, effect.duration || 2);
                actionResult += `\n✨ +${buffVal} ${statName.toUpperCase()} for ${effect.duration || 2} turns!`;
            }
            if (effect?.type === 'damage_cc') {
                if (Math.random() * 100 < (effect.ccChance || 30)) {
                    applyStatusEffect(opponent, effect.cc, effect.ccDuration || 1);
                    actionResult += ` + *${effect.cc?.toUpperCase()}* applied!`;
                }
            }
        }
        
    } else if (action === 'flee') {
        // Player who flees gets penalized, opponent wins.
        const fleeingJid = currentPlayer.jid;
        const stayingJid = opponent.jid;

        const fleeingUser = economy.getUser(fleeingJid);
        const stayingUser = economy.getUser(stayingJid);

        // Calculate and apply Flee Penalties:
        // 1. XP Loss: 20% of total XP (capped to level minimum)
        let xpLost = 0;
        if (fleeingUser && fleeingUser.progression) {
            const prog = fleeingUser.progression;
            const minXP = progression.getXPForLevel(prog.level);
            xpLost = Math.floor((prog.xp || 0) * 0.20);
            if (xpLost > 0) {
                const oldXP = prog.xp;
                prog.xp = Math.max(minXP, prog.xp - xpLost);
                xpLost = oldXP - prog.xp; // actual XP lost after clamp
                prog.totalXPEarned = Math.max(0, (prog.totalXPEarned || 0) - xpLost);
            }
        }

        // 2. Money Loss: 50% of wallet
        let moneyLost = 0;
        if (fleeingUser) {
            moneyLost = Math.floor((fleeingUser.wallet || 0) * 0.50);
            if (moneyLost > 0) {
                economy.removeMoney(fleeingJid, moneyLost, "PvP Flee Penalty");
            }
        }

        // 3. Random Item Loss: 1 item from bag
        let itemLostName = "None (Bag Empty)";
        const inventory = inventorySystem.getInventory(fleeingJid);
        const itemKeys = Object.keys(inventory || {}).filter(key => {
            const val = inventory[key];
            const qty = typeof val === 'number' ? val : (val?.quantity || 0);
            return qty > 0;
        });
        if (itemKeys.length > 0) {
            const randomKey = itemKeys[Math.floor(Math.random() * itemKeys.length)];
            const itemInfo = lootSystem.getItemInfo(randomKey);
            itemLostName = itemInfo?.name || randomKey;
            inventorySystem.removeItem(fleeingJid, randomKey, 1);
        }

        // Update PvP wins/losses
        if (stayingUser) {
            stayingUser.pvpWins = (stayingUser.pvpWins || 0) + 1;
            economy.saveUser(stayingJid);
            // 💡 Phase 2: Award guild XP + war points for PvP win
            try {
                const guildPerks = require('./guildPerks');
                guildPerks.awardGuildXp(stayingJid, 5, 'PvP win');
                guildPerks.awardWarPoints(stayingJid, 5, 'pvp');
            } catch (e) {}
            // 💡 Phase 6: Check if the loser had an active bounty — claim it
            // (bounty message stored and appended to rewardMsg below)
            duel._bountyClaimMsg = '';
            try {
                const bountySystem = require('./bountySystem');
                const bountyCheck = await bountySystem.getBountiesOnTarget(fleeingJid);
                if (bountyCheck.length > 0) {
                    const claimResult = await bountySystem.claimBounty(stayingJid, fleeingJid);
                    if (claimResult.claimed) {
                        duel._bountyClaimMsg = '\n\n' + claimResult.message;
                    }
                }
            } catch (e) {
                console.error('[BountyClaim] Failed:', e.message);
            }
        }
        if (fleeingUser) {
            fleeingUser.pvpLosses = (fleeingUser.pvpLosses || 0) + 1;
            economy.saveUser(fleeingJid);
            // 💡 AUDIT FIX 2026-08-01 (Round 1): call failedHuntPenalty in the
            // FLEE scenario too. If the player who STAYED had an active bounty
            // and the FLEEING player was the hunter, the fleeing hunter pays
            // the penalty + the stayer's defendersWon increments.
            try {
                const bountySystem = require('./bountySystem');
                const bountyCheckOnStayer = await bountySystem.getBountiesOnTarget(stayingJid);
                if (bountyCheckOnStayer.length > 0) {
                    const penaltyResult = await bountySystem.failedHuntPenalty(fleeingJid, stayingJid);
                    if (penaltyResult.success && penaltyResult.penaltyPaid > 0) {
                        let fleePenaltyMsg = `\n\n💸 *BOUNTY HUNT FAILED:* ${fleeingUser.nickname || fleeingJid.split('@')[0]} paid ${penaltyResult.penaltyPaid.toLocaleString()} ${ZENI} penalty for fleeing.`;
                        if (penaltyResult.defendedBounties && penaltyResult.defendedBounties.length > 0) {
                            fleePenaltyMsg += `\n🛡️ *BOUNTY DEFENDED!* 3 challengers defeated — bounty cleared!`;
                        }
                        duel._bountyClaimMsg = (duel._bountyClaimMsg || '') + fleePenaltyMsg;
                    }
                }
            } catch (e) {
                console.error('[FailedHuntPenalty flee] Failed:', e.message);
            }
        }

        // Give the standard win rewards to the staying player
        const ZENI = botConfig.getCurrency().symbol;
        let rewardMsg = '';
        if (duel.stake > 0) {
            const pot = duel.stake * 2;
            economy.addMoney(stayingJid, pot);
            rewardMsg = `💰 Won ${ZENI}${pot.toLocaleString()} (staked pot)`;
        } else {
            const goldBonus = Math.floor(150 + (currentPlayer.level * 40));
            economy.addMoney(stayingJid, goldBonus);
            rewardMsg = `💰 ${ZENI}${goldBonus.toLocaleString()} prize`;
        }

        const xpGain = Math.floor(80 + (currentPlayer.level * 15));
        progression.addXP(stayingJid, xpGain, 'PvP Victory (Opponent Fled)');

        activeDuels.delete(chatId);

        let fleeMsg = `🏃 *${currentPlayer.name}* has fled from the duel!\n\n` +
                      `⚠️ *Flee Penalties Applied to ${currentPlayer.name}:*\n` +
                      `   ↳ ⭐ XP Lost: \`-${xpLost}\` XP (capped at level minimum)\n` +
                      `   ↳ 💵 Wallet Lost: \`-${ZENI}${moneyLost.toLocaleString()}\` (50% of wallet)\n` +
                      `   ↳ 🎒 Item Lost: \`${itemLostName}\` (random item from bag)\n\n` +
                      `👑 *Winner:* *${opponent.name}* by forfeit!\n` +
                      `🎁 *Rewards for ${opponent.name}:*\n` +
                      `   ↳ ${rewardMsg}\n` +
                      `   ↳ ⭐ +${xpGain} XP` +
                      (duel._bountyClaimMsg || '');

        return { 
            success: true, 
            finished: true, 
            fled: true,
            message: fleeMsg 
        };
    } else if (action === 'item') {
        const inventory = inventorySystem.formatInventory(currentPlayer.jid);
        if (inventory.isEmpty) {
            return { success: false, message: '❌ Your combat bag is empty!' };
        }
        
        const { CONSUMABLES } = require('./guildAdventure');
        const usableItems = inventory.items.filter((item) => {
            const info = lootSystem.getItemInfo(item.id);
            return (info && info.usable) || !!CONSUMABLES[item.id];
        });
        
        if (usableItems.length === 0) {
            return { success: false, message: '❌ You have no usable items in your bag!' };
        }
        
        if (!target || target.trim() === '') {
            // List usable combat items (does not consume turn)
            let msg = `🎒 *${currentPlayer.name}'s COMBAT BAG* 🎒\n━━━━━━━━━━━━━━━━\n`;
            usableItems.forEach((item, i) => {
                const info = lootSystem.getItemInfo(item.id);
                msg += `*${i + 1}.* ${info.name} x${item.quantity}\n_${info.description || ''}_\n\n`;
            });
            msg += `━━━━━━━━━━━━━━━━\n💡 *Usage:* \`${botConfig.getPrefix()} combat item <number>\` (e.g. \`combat item 1\`)`;
            return { success: true, message: msg };
        }
        
        const itemIndex = parseInt(target) - 1;
        if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= usableItems.length) {
            return { success: false, message: `❌ Invalid item number! Type \`${botConfig.getPrefix()} combat item\` to see all usable items.` };
        }
        
        const selectedItem = usableItems[itemIndex];
        const itemKey = selectedItem.id;
        const itemInfo = lootSystem.getItemInfo(itemKey);
        const shopInfo = CONSUMABLES[itemKey] || {};
        const item = {
            ...itemInfo,
            ...shopInfo,
            usable: (itemInfo && itemInfo.usable) || !!shopInfo
        };
        
        if (!item || !item.usable) {
            return { success: false, message: '❌ This item is not usable in combat!' };
        }

        // Remove 1 item — verify removal succeeded BEFORE applying the effect.
        // Previously the return value was ignored, so a failed removeItem
        // (e.g. item already gone) would silently let the player use the
        // item's effect for free.
        const removeResult = inventorySystem.removeItem(currentPlayer.jid, itemKey, 1);
        if (!removeResult.success) {
            return { success: false, message: `❌ Failed to use item: ${removeResult.message || 'insufficient quantity'}` };
        }

        actionResult = `🎒 *${currentPlayer.name}* used *${item.name}*!`;
        
        const isNegative = [
            "damage_aoe",
            "aoe_damage",
            "aoe_debuff_damage",
            "apply_poison",
            "freeze_enemy",
            "percent_hp_damage"
        ].includes(item.effect);
        
        const itemTarget = isNegative ? opponent : currentPlayer;
        
        switch (item.effect) {
            case "heal":
                const healVal = item.effectValue || 0.35;
                const healAmt = Math.floor(itemTarget.maxHp * healVal);
                const actualHeal = Math.min(healAmt, itemTarget.maxHp - itemTarget.hp);
                itemTarget.hp += actualHeal;
                actionResult += `\n💖 Restored *${actualHeal}* HP! (${Math.round(healVal * 100)}%)`;
                
                if (itemKey === "elixir" || item.cureStatus) {
                    if (itemTarget.statusEffects && itemTarget.statusEffects.length > 0) {
                        const negativeEffects = ["poison", "burn", "bleed", "freeze", "stun", "sleep", "root", "slow", "curse", "weak", "vulnerability"];
                        const beforeCount = itemTarget.statusEffects.length;
                        itemTarget.statusEffects = itemTarget.statusEffects.filter(s => !negativeEffects.includes(s.type));
                        const clearedCount = beforeCount - itemTarget.statusEffects.length;
                        if (clearedCount > 0) {
                            actionResult += `\n✨ Cured *${clearedCount}* status effects!`;
                        }
                    }
                }
                break;
            case "cure_status":
                if (itemTarget.statusEffects && itemTarget.statusEffects.length > 0) {
                    const negativeEffects = ["poison", "burn", "bleed", "freeze", "stun", "sleep", "root", "slow", "curse", "weak", "vulnerability"];
                    const beforeCount = itemTarget.statusEffects.length;
                    itemTarget.statusEffects = itemTarget.statusEffects.filter(s => !negativeEffects.includes(s.type));
                    const clearedCount = beforeCount - itemTarget.statusEffects.length;
                    if (clearedCount > 0) {
                        actionResult += `\n✨ Cured *${clearedCount}* status effects!`;
                    } else {
                        actionResult += `\n(No negative status effects to cure)`;
                    }
                } else {
                    actionResult += `\n(No negative status effects to cure)`;
                }
                break;
            case "regen":
                const regVal = item.effectValue || 0.1;
                const regAmt = Math.floor(itemTarget.maxHp * regVal);
                if (!itemTarget.statusEffects) itemTarget.statusEffects = [];
                itemTarget.statusEffects.push({ type: 'regen', duration: item.duration || 3, value: regAmt });
                actionResult += `\n🧴 Applied regeneration! (+${regAmt} HP/turn)`;
                break;
            case "restore_energy":
                const enVal = item.effectValue || 0.4;
                const enAmt = Math.floor(itemTarget.maxEnergy * enVal);
                itemTarget.energy = Math.min(itemTarget.maxEnergy, itemTarget.energy + enAmt);
                actionResult += `\n⚡ Restored *${enAmt}* energy! (${Math.round(enVal * 100)}%)`;
                break;
            case "buff_atk": {
                const buffVal = Math.floor((item.effectValue || 20) * 0.5);
                applyBuff(itemTarget, 'atk', buffVal, item.duration || 3);
                actionResult += `\n💪 Buffed attack! (+${buffVal} ATK)`;
                break;
            }
            case "buff_def": {
                const buffVal = Math.floor((item.effectValue || 20) * 0.5);
                applyBuff(itemTarget, 'def', buffVal, item.duration || 3);
                actionResult += `\n🛡️ Buffed defense! (+${buffVal} DEF)`;
                break;
            }
            case "buff_spd": {
                const buffVal = Math.floor((item.effectValue || 20) * 0.5);
                applyBuff(itemTarget, 'spd', buffVal, item.duration || 3);
                actionResult += `\n⚡ Buffed speed! (+${buffVal} SPD)`;
                break;
            }
            case "buff_luck": {
                const buffVal = Math.floor((item.effectValue || 20) * 0.5);
                applyBuff(itemTarget, 'luck', buffVal, item.duration || 3);
                actionResult += `\n🍀 Buffed luck! (+${buffVal} LUCK)`;
                break;
            }
            case "buff_all": {
                applyBuff(itemTarget, 'atk', 10, item.duration || 3);
                applyBuff(itemTarget, 'def', 10, item.duration || 3);
                applyBuff(itemTarget, 'spd', 10, item.duration || 3);
                actionResult += `\n✨ Overflowing with power! (+10 to All Stats)`;
                break;
            }
            case "buff_all_damage": {
                applyBuff(itemTarget, 'atk', 20, item.duration || 3);
                actionResult += `\n💥 Enters a BERSERKER RAGE! (+20 ATK)`;
                break;
            }
            case "shield_max":
                applyStatusEffect(itemTarget, 'shield', 5, 100);
                actionResult += `\n🛡️ Encased in a massive energy barrier!`;
                break;
            case "damage_aoe":
            case "aoe_damage":
            case "aoe_debuff_damage":
                const dmg = item.effectValue || 80;
                itemTarget.hp = Math.max(0, itemTarget.hp - dmg);
                actionResult += `\n💥 Deals *${dmg}* damage to *${itemTarget.name}*!`;
                if (item.effect === "aoe_debuff_damage") {
                    if (!itemTarget.statusEffects) itemTarget.statusEffects = [];
                    itemTarget.statusEffects.push({ type: 'vulnerability', duration: 3, value: 20 });
                    actionResult += ` and weakened them!`;
                }
                break;
            case "percent_hp_damage":
                const finalDmg = Math.floor(itemTarget.maxHp * (item.effectValue || 0.25));
                itemTarget.hp = Math.max(0, itemTarget.hp - finalDmg);
                actionResult += `\n💥 Deals *${finalDmg}* TRUE damage to *${itemTarget.name}*!`;
                break;
            case "flee":
                actionResult += `\n💨 Used smoke bomb! Escape from PvP is not allowed this way (use regular flee).`;
                break;
            default:
                actionResult += `\n(Item effect activated)`;
        }
    } else {
        return { success: false, message: `❌ Unknown action. Use: \`attack\`, \`ability <n>\`, \`item\`, or \`flee\`` };
    }

    if (statusLog.length > 0) {
        actionResult = statusLog.join('\n') + '\n\n' + actionResult;
    }

    // ── Check for win ─────────────────────────────
    if (opponent.hp <= 0 || currentPlayer.hp <= 0) {
        let winner = currentPlayer;
        let loser = opponent;
        if (currentPlayer.hp <= 0 && opponent.hp > 0) {
            winner = opponent;
            loser = currentPlayer;
        } else if (currentPlayer.hp <= 0 && opponent.hp <= 0) {
            winner = opponent;
            loser = currentPlayer;
        }
        loser.hp = 0;
        const result = await finishDuel(chatId, duel, winner, loser);
        activeDuels.delete(chatId);
        return { success: true, finished: true, message: actionResult + '\n\n' + result };
    }

    // ── Advance turn ──────────────────────────────
    duel.turn = 1 - duel.turn;
    if (duel.turn === 0) duel.round++;
    duel.lastAction = Date.now();

    // Energy regen for attacker
    currentPlayer.energy = Math.min(currentPlayer.maxEnergy, currentPlayer.energy + PVP_ENERGY_REGEN);

    // Tick cooldowns
    for (const [skillId, cd] of Object.entries(currentPlayer.cooldowns)) {
        if (action === 'ability' && abilityObj && skillId === abilityObj.id) {
            continue; // Do not decrement cooldown on the turn it is applied
        }
        currentPlayer.cooldowns[skillId] = cd - 1;
        if (currentPlayer.cooldowns[skillId] <= 0) delete currentPlayer.cooldowns[skillId];
    }

    const nextPlayer = duel.players[duel.turn];

    const imageResult = await generateDuelImage(duel);
    
    let statusMsg = `⚔️ *PVP DUEL · ROUND ${duel.round}*\n` +
                    `———————————\n` +
                    `${actionResult}\n\n` +
                    `🔴 *${currentPlayer.name}*${getPlayerEffectsString(currentPlayer)}: \`${Math.max(0, currentPlayer.hp)}/${currentPlayer.maxHp}\` HP · \`${Math.floor(currentPlayer.energy)}\` EN\n` +
                    `🔵 *${opponent.name}*${getPlayerEffectsString(opponent)}: \`${Math.max(0, opponent.hp)}/${opponent.maxHp}\` HP · \`${Math.floor(opponent.energy)}\` EN\n\n` +
                    `🎯 *@${nextPlayer.jid.split('@')[0]}* — It's your turn!\n` +
                    `———————————\n` +
                    `🗡️ \`${botConfig.getPrefix()} combat attack\`\n` +
                    `🔮 \`${botConfig.getPrefix()} combat ability <n>\`\n` +
                    `🎒 \`${botConfig.getPrefix()} combat item\`\n` +
                    `🏃 \`${botConfig.getPrefix()} combat flee\` *(⚠️ Deducts 20% XP, 50% Wallet, and 1 random item!)*`;

    return {
        success: true,
        finished: false,
        message: statusMsg,
        image: imageResult,
        mentions: [nextPlayer.jid],
    };
}

// ==========================================
// 🔧 COMBAT HELPERS
// ==========================================

function resolveBasicAttack(attacker, defender) {
    const attackerStats = getEffectiveStats(attacker);
    const defenderStats = getEffectiveStats(defender);

    // Evasion check
    if (Math.random() * 100 < (defenderStats.evasion || 0)) {
        return { damage: 0, isCrit: false, missed: true };
    }

    let damage = Math.floor(attackerStats.atk * (0.85 + Math.random() * 0.3) * PVP_DAMAGE_MULT);
    
    // Crit
    const isCrit = Math.random() * 100 < (attackerStats.crit || 5);
    if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);

    // Defense reduction (capped)
    const defReduction = Math.min(
        Math.floor(defenderStats.def * 0.25),
        Math.floor(damage * PVP_DEFENSE_CAP)
    );
    damage = Math.max(15, damage - defReduction);

    return { damage, isCrit, missed: false };
}

function getLearnedAbilities(userId, classId) {
    const user = economy.getUser(userId);
    if (!user?.skills) return [];
    
    const classSystem = require('./classSystem');
    const userClassData = economy.getUserClass(userId);
    const lineage = classSystem.getLineage(userClassData?.id || classId || '');
    
    const learned = [];
    const seen = new Set();
    
    for (const cId of lineage) {
        const tree = skillTree.SKILL_TREES[cId.toUpperCase()];
        if (!tree) continue;
        for (const [, treeData] of Object.entries(tree.trees)) {
            for (const [sId, skill] of Object.entries(treeData.skills)) {
                if (!seen.has(sId) && (user.skills[sId] || 0) > 0) {
                    seen.add(sId);
                    learned.push({ id: sId, ...skill });
                }
            }
        }
    }
    
    // Add mirrored skills
    if (user.borrowedSkills) {
        for (const s of user.borrowedSkills) {
            if (!seen.has(s.id)) {
                seen.add(s.id);
                learned.push(s);
            }
        }
    }
    
    return learned;
}

// ==========================================
// 🏆 FINISH DUEL
// ==========================================

async function finishDuel(chatId, duel, winner, loser) {
    const ZENI = botConfig.getCurrency().symbol;
    const xpGain = Math.floor(80 + (loser.level * 15));
    
    let rewardMsg = '';
    if (duel.stake > 0) {
        const pot = duel.stake * 2;
        economy.addMoney(winner.jid, pot);
        rewardMsg = `💰 Won ${ZENI}${pot.toLocaleString()} (staked pot)`;
    } else {
        const goldBonus = Math.floor(150 + (loser.level * 40));
        economy.addMoney(winner.jid, goldBonus);
        rewardMsg = `💰 ${ZENI}${goldBonus.toLocaleString()} prize`;
    }

    progression.addXP(winner.jid, xpGain, 'PvP Victory');

    // Update PvP stats
    const winnerUser = economy.getUser(winner.jid);
    const loserUser = economy.getUser(loser.jid);
    let bountyClaimMsg = '';
    if (winnerUser) {
        winnerUser.pvpWins = (winnerUser.pvpWins || 0) + 1;
        economy.saveUser(winner.jid);
        // 💡 Phase 2: Award guild XP + war points for PvP win
        try {
            const guildPerks = require('./guildPerks');
            guildPerks.awardGuildXp(winner.jid, 5, 'PvP win');
            guildPerks.awardWarPoints(winner.jid, 5, 'pvp');
        } catch (e) {}
        // 💡 Phase 6: Check if loser had an active bounty — claim it
        try {
            const bountySystem = require('./bountySystem');
            const bountyCheck = await bountySystem.getBountiesOnTarget(loser.jid);
            if (bountyCheck.length > 0) {
                const claimResult = await bountySystem.claimBounty(winner.jid, loser.jid);
                if (claimResult.claimed) {
                    bountyClaimMsg = '\n' + claimResult.message;
                }
            }
        } catch (e) {
            console.error('[BountyClaim] Failed:', e.message);
        }
    }
    if (loserUser) {
        loserUser.pvpLosses = (loserUser.pvpLosses || 0) + 1;
        economy.saveUser(loser.jid);
        // 💡 AUDIT FIX 2026-08-01 (Round 1): call failedHuntPenalty when the
        // LOSER was the hunter (i.e. the WINNER had an active bounty on them).
        // This was NEVER called — the function existed but no code invoked it.
        // Consequences:
        //   1. Hunter paid 0 penalty for losing (should pay 10% of bounty)
        //   2. defendersWon counter never incremented
        //   3. Bounty never auto-terminated by defender wins (the feature I
        //      added in the prior pass was dead code without this call)
        // Now: if the winner had an active bounty, the loser (hunter) pays
        // the penalty + the winner's defendersWon counter increments.
        let failedHuntMsg = '';
        try {
            const bountySystem = require('./bountySystem');
            const bountyCheckOnWinner = await bountySystem.getBountiesOnTarget(winner.jid);
            if (bountyCheckOnWinner.length > 0) {
                // The winner was a bounty target who just defeated a hunter
                const penaltyResult = await bountySystem.failedHuntPenalty(loser.jid, winner.jid);
                if (penaltyResult.success && penaltyResult.penaltyPaid > 0) {
                    failedHuntMsg = `\n💸 *BOUNTY HUNT FAILED:* ${loser.name} paid ${penaltyResult.penaltyPaid.toLocaleString()} ${ZENI} penalty to ${winner.name}.`;
                    if (penaltyResult.defendedBounties && penaltyResult.defendedBounties.length > 0) {
                        failedHuntMsg += `\n🛡️ *BOUNTY DEFENDED!* ${winner.name} defeated 3 challengers — bounty cleared!`;
                    }
                }
            }
        } catch (e) {
            console.error('[FailedHuntPenalty] Failed:', e.message);
        }
        bountyClaimMsg += failedHuntMsg;
    }

    let msg = `🏆 *DUEL RESULT* 🏆\n`;
    msg += `———————————\n`;
    msg += `👑 *Winner:* ${winner.name}\n`;
    msg += `💀 *Defeated:* ${loser.name}\n\n`;
    msg += `🎁 *Rewards:*\n`;
    msg += `   ↳ ${rewardMsg}\n`;
    msg += `   ↳ ⭐ +${xpGain} XP\n` + bountyClaimMsg;
    
    return msg;
}

// ==========================================
// 🎨 IMAGE GENERATION
// ==========================================

async function generateDuelImage(duel) {
    const attacker = duel.players[duel.turn];
    const defender = duel.players[1 - duel.turn];
    
    return await combatImageGenerator.generateCombatImage(
        [attacker, defender], [], { combatType: 'PVP' }
    );
}

// ==========================================
// ⏱️ MAINTENANCE SWEEPER
// ==========================================

setInterval(() => {
    const now = Date.now();
    
    for (const [chatId, invite] of duelInvites.entries()) {
        if (now - invite.timestamp > CHALLENGE_TIMEOUT) {
            duelInvites.delete(chatId);
        }
    }
    
    for (const [chatId, duel] of activeDuels.entries()) {
        if (now - duel.lastAction > PVP_TIMEOUT_MS) {
            activeDuels.delete(chatId);
            const engine = require('../engine');
            const sock = engine.getSock();
            if (sock) {
                sock.sendMessage(chatId, { 
                    text: `⌛ *DUEL EXPIRED!*\n\nThe duel was cancelled due to ${Math.floor(PVP_TIMEOUT_MS / 60000)} minutes of inactivity.`
                }).catch(() => {});
            }
        }
    }
}, 60000);


module.exports = {
    getDuel,
    getInvite,
    challengePlayer,
    acceptChallenge,
    declineChallenge,
    handlePvPAction,
};
