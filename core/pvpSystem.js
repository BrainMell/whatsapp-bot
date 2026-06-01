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
const botConfig = require('../botConfig');
const combatImageGenerator = require('./combatImageGenerator');

const activeDuels = new Map();  // chatId → duelState
const duelInvites = new Map();  // chatId → { challenger, target, stake, timestamp }

// ─── PvP Balance Constants ────────────────────
const PVP_DAMAGE_MULT   = 0.80;  // Base damage multiplier for basic attacks
const PVP_ENERGY_REGEN  = 20;    // Energy gained per turn
const PVP_DEFENSE_CAP   = 0.50;  // Max 50% damage reduction from DEF in PvP
const PVP_ABILITY_MULT  = 1.00;  // Ability damage multiplier in PvP
const PVP_CRIT_MULT     = 1.5;   // Crit multiplier in PvP
const PVP_TIMEOUT_MS    = 300000; // 5 minutes inactivity = expired duel
const CHALLENGE_TIMEOUT = 120000; // 2 minutes to accept challenge

function getDuel(chatId) {
    return activeDuels.get(chatId);
}

function getInvite(chatId, targetJid) {
    const invite = duelInvites.get(chatId);
    if (!invite) return null;
    if (invite.target === targetJid) return invite;
    return null;
}

function declineChallenge(chatId, targetJid) {
    const invite = duelInvites.get(chatId);
    if (invite && invite.target === targetJid) {
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

    if (!economy.isRegistered(challengerJid)) {
        return { success: false, message: '❌ You must be registered to challenge someone!' };
    }
    if (!economy.isRegistered(targetJid)) {
        return { success: false, message: '❌ The player you challenged is not registered!' };
    }

    if (stake > 0) {
        const user = economy.getUser(challengerJid);
        if ((user?.wallet || 0) < stake) {
            return { success: false, message: `❌ Insufficient funds! You need ${botConfig.getCurrency().symbol}${stake.toLocaleString()} to stake.` };
        }
    }

    duelInvites.set(chatId, {
        challenger: challengerJid,
        target: targetJid,
        stake,
        timestamp: Date.now(),
    });

    return { success: true };
}

// ==========================================
// ✅ ACCEPT CHALLENGE
// ==========================================

async function acceptChallenge(sock, chatId, targetJid) {
    const invite = duelInvites.get(chatId);
    if (!invite) return { success: false, message: '❌ No pending challenge found.' };
    if (invite.target !== targetJid) return { success: false, message: '❌ This challenge was not issued to you!' };
    if (Date.now() - invite.timestamp > CHALLENGE_TIMEOUT) {
        duelInvites.delete(chatId);
        return { success: false, message: '❌ Challenge expired! (2 min limit)' };
    }

    if (!economy.isRegistered(invite.challenger)) {
        return { success: false, message: '❌ Challenger is no longer registered!' };
    }
    if (!economy.isRegistered(targetJid)) {
        return { success: false, message: '❌ You need to register first before accepting a duel!' };
    }

    // Validate stakes
    if (invite.stake > 0) {
        const challenger = economy.getUser(invite.challenger);
        const target = economy.getUser(targetJid);
        if ((challenger?.wallet || 0) < invite.stake) {
            return { success: false, message: '❌ Challenger no longer has enough Zeni for the stake!' };
        }
        if ((target?.wallet || 0) < invite.stake) {
            return { success: false, message: `❌ You need ${botConfig.getCurrency().symbol}${invite.stake.toLocaleString()} to accept!` };
        }
        economy.removeMoney(invite.challenger, invite.stake);
        economy.removeMoney(targetJid, invite.stake);
    }

    duelInvites.delete(chatId);

    // Build duel state
    const p1Data = economy.getUser(invite.challenger);
    const p2Data = economy.getUser(targetJid);
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
        `╔════════════════════════╗\n` +
        `   🏟️   *PHANTOM STANDOFF*   🏟️\n` +
        `╚════════════════════════╝\n\n` +
        `🔴 *${p1.name}* \`Lv.${p1.level}\` (${p1.class?.name || 'Fighter'})\n` +
        `   ↳ ❤️ HP: \`${p1.hp}/${p1.maxHp}\` · ⚡ EN: \`${p1.energy}/${p1.maxEnergy}\`\n\n` +
        `🔵 *${p2.name}* \`Lv.${p2.level}\` (${p2.class?.name || 'Fighter'})\n` +
        `   ↳ ❤️ HP: \`${p2.hp}/${p2.maxHp}\` · ⚡ EN: \`${p2.energy}/${p2.maxEnergy}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 *${p1.name}* claims the initiative!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🗡️ \`${botConfig.getPrefix()} combat attack\`\n` +
        `🔮 \`${botConfig.getPrefix()} combat ability <n>\`\n` +
        `🏃 \`${botConfig.getPrefix()} combat flee\``;

    return { success: true, duel: duelState, image, message: startMsg };
}

function buildDuelPlayer(jid, userData, stats, idx) {
    const classData = economy.getUserClass(jid);
    return {
        jid,
        name: userData.nickname || jid.split('@')[0],
        hp: stats.maxHp || stats.hp,
        maxHp: stats.maxHp || stats.hp,
        energy: 100,
        maxEnergy: 100,
        stats,
        level: userData.level || 1,
        class: classData,
        spriteIndex: userData.spriteIndex || idx,
        statusEffects: [],
        cooldowns: {},
    };
}

// ==========================================
// ⚔️ HANDLE PVP ACTION
// ==========================================

async function handlePvPAction(sock, chatId, senderJid, action, target, m) {
    const duel = activeDuels.get(chatId);
    if (!duel) return { success: false, message: '❌ No active duel here!' };

    const currentPlayer = duel.players[duel.turn];
    const opponent = duel.players[1 - duel.turn];
    
    if (currentPlayer.jid !== senderJid) {
        return { success: false, message: `⏳ It's not your turn! Waiting on *${currentPlayer.name}*...` };
    }

    let actionResult = '';
    let damage = 0;
    let healing = 0;
    let isCrit = false;
    let missed = false;

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
            return { success: false, message: `❌ Please specify a valid ability number! Example: \`${require('../botConfig').getPrefix()} combat ability 1\`` };
        }
        const abilityIndex = parseInt(target) - 1;
        const learned = getLearnedAbilities(currentPlayer.jid, currentPlayer.class?.id);
        const ability = learned[abilityIndex];

        if (!ability) return { success: false, message: `❌ Ability #${parseInt(target)} not found! Use \`${require('../botConfig').getPrefix()} abilities\` to see your list.` };

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
        if (effect?.cooldown) currentPlayer.cooldowns[ability.id] = effect.cooldown;

        if (effect?.type === 'damage' || effect?.type === 'aoe') {
            const statBase = (effect.damageType === 'magic' ? currentPlayer.stats.mag : currentPlayer.stats.atk) || currentPlayer.stats.atk;
            damage = Math.floor(statBase * (effect.multiplier || 1.2) * PVP_ABILITY_MULT);
            // Partial defense mitigation
            const defReduction = Math.min(opponent.stats.def * 0.2, damage * PVP_DEFENSE_CAP);
            damage = Math.max(20, Math.floor(damage - defReduction));
            opponent.hp -= damage;
            actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💥 Deals *${damage}* damage to *${opponent.name}*!`;
            
        } else if (effect?.type === 'heal' || effect?.type === 'heal_team') {
            healing = Math.floor(effect.value || 80);
            currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + healing);
            actionResult = `💚 *${currentPlayer.name}* used *${ability.name}*!\nRestored *${healing}* HP! (${currentPlayer.hp}/${currentPlayer.maxHp})`;
            
        } else if (effect?.type === 'buff_self') {
            const statName = effect.buffType || 'atk';
            const buffVal = Math.floor((effect.value || 20) * 0.5); // Half buffs in PvP
            currentPlayer.stats[statName] = (currentPlayer.stats[statName] || 0) + buffVal;
            actionResult = `✨ *${currentPlayer.name}* used *${ability.name}*!\n📈 +${buffVal} ${statName.toUpperCase()} for ${effect.duration || 2} turns!`;
            
        } else if (effect?.type === 'damage_cc') {
            const statBase = currentPlayer.stats.atk;
            damage = Math.floor(statBase * (effect.multiplier || 1.0) * PVP_ABILITY_MULT);
            damage = Math.max(15, damage - Math.floor(opponent.stats.def * 0.15));
            opponent.hp -= damage;
            actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💥 *${damage}* damage`;
            if (Math.random() * 100 < (effect.ccChance || 30)) {
                if (!opponent.statusEffects) opponent.statusEffects = [];
                opponent.statusEffects.push({ type: effect.cc, duration: effect.ccDuration || 1 });
                actionResult += ` + *${effect.cc?.toUpperCase()}* applied!`;
            }
        } else {
            actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!`;
        }
        
    } else if (action === 'flee') {
        // Allow fleeing — no reward, no punishment
        activeDuels.delete(chatId);
        return { 
            success: true, 
            finished: true, 
            fled: true,
            message: `🏃 *${currentPlayer.name}* fled the duel!\n\n_The battle ends with no winner..._` 
        };
    } else {
        return { success: false, message: `❌ Unknown action. Use: \`attack\`, \`ability <n>\`, or \`flee\`` };
    }

    // ── Check for win ─────────────────────────────
    if (opponent.hp <= 0) {
        opponent.hp = 0;
        const result = await finishDuel(chatId, duel, currentPlayer, opponent);
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
        currentPlayer.cooldowns[skillId] = cd - 1;
        if (currentPlayer.cooldowns[skillId] <= 0) delete currentPlayer.cooldowns[skillId];
    }

    const nextPlayer = duel.players[duel.turn];

    const imageResult = await generateDuelImage(duel);
    
    let statusMsg = `╔════════════════════════╗\n` +
                    `   ⚔️   *COMBAT STATUS*   ⚔️\n` +
                    `╚════════════════════════╝\n\n` +
                    `${actionResult}\n\n` +
                    `🔴 *${currentPlayer.name}*\n` +
                    `   ↳ ❤️ HP: \`${Math.max(0, currentPlayer.hp)}/${currentPlayer.maxHp}\` · ⚡ EN: \`${Math.floor(currentPlayer.energy)}\`\n` +
                    `🔵 *${opponent.name}*\n` +
                    `   ↳ ❤️ HP: \`${Math.max(0, opponent.hp)}/${opponent.maxHp}\` · ⚡ EN: \`${Math.floor(opponent.energy)}\`\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🎯 *@${nextPlayer.jid.split('@')[0]}* — It's your turn!\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `🗡️ \`${botConfig.getPrefix()} combat attack\`\n` +
                    `🔮 \`${botConfig.getPrefix()} combat ability <n>\`\n` +
                    `🏃 \`${botConfig.getPrefix()} combat flee\``;

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
    // Evasion check
    if (Math.random() * 100 < (defender.stats.evasion || 0)) {
        return { damage: 0, isCrit: false, missed: true };
    }

    let damage = Math.floor(attacker.stats.atk * (0.85 + Math.random() * 0.3) * PVP_DAMAGE_MULT);
    
    // Crit
    const isCrit = Math.random() * 100 < (attacker.stats.crit || 5);
    if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);

    // Defense reduction (capped)
    const defReduction = Math.min(
        Math.floor(defender.stats.def * 0.25),
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

    let msg = `╔════════════════════════╗\n`;
    msg += `   🏆   *DUEL RESULT*   🏆\n`;
    msg += `╚════════════════════════╝\n\n`;
    msg += `👑 *Winner:* ${winner.name}\n`;
    msg += `💀 *Defeated:* ${loser.name}\n\n`;
    msg += `🎁 *Rewards:*\n`;
    msg += `   ↳ ${rewardMsg}\n`;
    msg += `   ↳ ⭐ +${xpGain} XP\n`;
    
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
            const engine = require('./engine');
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
