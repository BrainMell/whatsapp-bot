// ============================================ 
// ⚔️ PVP DUEL SYSTEM V2.0 - PHANTOM STANDOFF
// ============================================ 

const economy = require('./economy');
const progression = require('./progression');
const skillTree = require('./skillTree');
const botConfig = require('../botConfig');
const combatImageGenerator = require('./combatImageGenerator');
const fs = require('fs');

const activeDuels = new Map(); // chatId -> duelState
const duelInvites = new Map(); // chatId -> { challenger, target, stake, timestamp }

function getDuel(chatId) {
    return activeDuels.get(chatId);
}

/**
 * Challenge another player
 */
function challengePlayer(chatId, challengerJid, targetJid, stake = 0) {
    if (activeDuels.has(chatId)) return { success: false, message: "❌ A duel is already active in this chat!" };
    
    // Check if target is already challenged
    const existing = duelInvites.get(chatId);
    if (existing && (Date.now() - existing.timestamp < 120000)) {
        return { success: false, message: "❌ There is already a pending challenge in this chat!" };
    }

    // Check stakes
    if (stake > 0) {
        const user = economy.getUser(challengerJid);
        if (user.wallet < stake) return { success: false, message: `❌ You don't have ${botConfig.getCurrency().symbol}${stake.toLocaleString()} to stake!` };
    }

    duelInvites.set(chatId, {
        challenger: challengerJid,
        target: targetJid,
        stake: stake,
        timestamp: Date.now()
    });

    return { success: true };
}

/**
 * Accept a challenge
 */
async function acceptChallenge(sock, chatId, targetJid) {
    const invite = duelInvites.get(chatId);
    if (!invite) return { success: false, message: "❌ No pending challenge found." };
    if (invite.target !== targetJid) return { success: false, message: "❌ This challenge was not meant for you!" };
    if (Date.now() - invite.timestamp > 120000) {
        duelInvites.delete(chatId);
        return { success: false, message: "❌ Challenge expired! (120s limit)" };
    }

    // Check stakes again
    if (invite.stake > 0) {
        const challenger = economy.getUser(invite.challenger);
        const target = economy.getUser(targetJid);
        if (challenger.wallet < invite.stake) return { success: false, message: "❌ Challenger no longer has enough Zeni for the stake!" };
        if (target.wallet < invite.stake) return { success: false, message: `❌ You need ${botConfig.getCurrency().symbol}${invite.stake.toLocaleString()} to accept this duel!` };
        
        // Lock the stakes
        economy.removeMoney(invite.challenger, invite.stake);
        economy.removeMoney(targetJid, invite.stake);
    }

    duelInvites.delete(chatId);
    
    // Initialize Duel
    const p1 = economy.getUser(invite.challenger);
    const p2 = economy.getUser(targetJid);
    const p1Stats = progression.getBaseStats(invite.challenger, p1.class);
    const p2Stats = progression.getBaseStats(targetJid, p2.class);

    const duelState = {
        chatId,
        stake: invite.stake,
        players: [
            {
                jid: invite.challenger,
                name: p1.nickname || invite.challenger.split('@')[0],
                hp: p1Stats.hp,
                maxHp: p1Stats.hp,
                energy: 100,
                maxEnergy: 100,
                stats: p1Stats,
                level: p1.level || 1,
                class: economy.getUserClass(invite.challenger),
                spriteIndex: p1.spriteIndex || 0
            },
            {
                jid: targetJid,
                name: p2.nickname || targetJid.split('@')[0],
                hp: p2Stats.hp,
                maxHp: p2Stats.hp,
                energy: 100,
                maxEnergy: 100,
                stats: p2Stats,
                level: p2.level || 1,
                class: economy.getUserClass(targetJid),
                spriteIndex: p2.spriteIndex || 0
            }
        ],
        turn: 0,
        round: 1,
        history: [],
        lastAction: Date.now()
    };

    activeDuels.set(chatId, duelState);
    
    // Generate initial image
    const image = await generateDuelImage(duelState);
    
    return { success: true, duel: duelState, image };
}

/**
 * Generate image with PIVOT camera logic
 */
async function generateDuelImage(duel) {
    const attacker = duel.players[duel.turn];
    const defender = duel.players[1 - duel.turn];
    
    // Pass to generator: [Attacker (Left), Defender (Right)]
    const result = await combatImageGenerator.generateCombatImage(
        [attacker, defender], 
        [], 
        { combatType: 'PVP' }
    );
    return result;
}

async function handlePvPAction(sock, chatId, senderJid, action, target, m) {
    const duel = activeDuels.get(chatId);
    if (!duel) return { success: false, message: "❌ No active duel in this chat!" };

    const currentPlayer = duel.players[duel.turn];
    if (currentPlayer.jid !== senderJid) return { success: false, message: "⏳ It's not your turn!" };

    const opponent = duel.players[1 - duel.turn];
    let actionResult = "";
    let damage = 0;
    
    // DAMPENER: PvP damage is reduced to prevent one-shots
    const PVP_MULTIPLIER = 0.4;

    if (action === 'attack') {
        // Evasion Check
        if (Math.random() * 100 < (opponent.stats.evasion || 0)) {
            actionResult = `💨 *MISS!* *${opponent.name}* evaded the attack!`;
        } else {
            damage = Math.floor(currentPlayer.stats.atk * (0.8 + Math.random() * 0.4) * PVP_MULTIPLIER);
            
            // Crit Check
            if (Math.random() * 100 < (currentPlayer.stats.crit || 0)) {
                damage = Math.floor(damage * 1.5);
                actionResult = `⚔️ *${currentPlayer.name}* Slashed *${opponent.name}*! 💥 *CRIT!*`;
            } else {
                actionResult = `⚔️ *${currentPlayer.name}* Attacked *${opponent.name}*!`;
            }

            // Defense
            const defense = Math.floor(opponent.stats.def * 0.3);
            damage = Math.max(5, damage - defense);
            opponent.hp -= damage;
        }
    } else if (action === 'ability') {
        const abilityIndex = parseInt(target) - 1;
        const learned = getLearnedAbilities(currentPlayer.jid, currentPlayer.class.id);
        const ability = learned[abilityIndex];

        if (!ability) return { success: false, message: "❌ Invalid ability number!" };
        
        const skillLevel = economy.getUser(currentPlayer.jid).skills[ability.id] || 1;
        const effect = skillTree.getSkillEffect(ability, skillLevel);
        const energyCost = effect.cost || 20;

        if (currentPlayer.energy < energyCost) return { success: false, message: `❌ Not enough energy! (Need ${energyCost})` };

        currentPlayer.energy -= energyCost;
        
        if (effect.type === 'damage' || effect.type === 'aoe') {
            damage = Math.floor((currentPlayer.stats.mag || currentPlayer.stats.atk) * (effect.multiplier || 1.2) * PVP_MULTIPLIER);
            opponent.hp -= damage;
            actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*! 💥 Deals *${damage}* damage!`;
        } else if (effect.type === 'buff_self') {
            // Handle buffs
            actionResult = `✨ *${currentPlayer.name}* used *${ability.name}*! Stats increased!`;
            // Simple buff logic for now
            currentPlayer.stats.def = Math.floor(currentPlayer.stats.def * 1.2);
        }
    }

    // Check Win
    if (opponent.hp <= 0) {
        opponent.hp = 0;
        const result = await finishDuel(chatId, duel, currentPlayer, opponent);
        activeDuels.delete(chatId);
        return { success: true, finished: true, message: actionResult + "\n\n" + result };
    }

    // Update state
    duel.turn = 1 - duel.turn;
    if (duel.turn === 0) duel.round++;
    duel.lastAction = Date.now();
    currentPlayer.energy = Math.min(currentPlayer.maxEnergy, currentPlayer.energy + 15);

    // Generate NEW PIVOTED image
    const imageResult = await generateDuelImage(duel);
    
    let statusMsg = actionResult + `\n\n🎯 *Turn:* @${duel.players[duel.turn].jid.split('@')[0]}\n`;
    statusMsg += `❤️ *Target HP:* ${opponent.hp}/${opponent.maxHp}`;

    return { 
        success: true, 
        finished: false, 
        message: statusMsg, 
        image: imageResult,
        mentions: [duel.players[duel.turn].jid]
    };
}

function getLearnedAbilities(userId, classId) {
    const user = economy.getUser(userId);
    const tree = skillTree.SKILL_TREES[classId.toUpperCase()];
    const learned = [];
    if (tree) {
        for (const t of Object.values(tree.trees)) {
            for (const [id, s] of Object.entries(t.skills)) {
                if (user.skills && user.skills[id]) learned.push({ id, ...s });
            }
        }
    }
    return learned;
}

async function finishDuel(chatId, duel, winner, loser) {
    const totalPot = duel.stake * 2;
    const winnerData = economy.getUser(winner.jid);
    const xpGain = 100 + (loser.level * 20);
    
    let rewardMsg = "";
    if (duel.stake > 0) {
        economy.addMoney(winner.jid, totalPot);
        rewardMsg = `💰 *Stake Won:* ${botConfig.getCurrency().symbol}${totalPot.toLocaleString()}`;
    } else {
        const goldBonus = 200 + (loser.level * 50);
        economy.addMoney(winner.jid, goldBonus);
        rewardMsg = `💰 *Prize:* ${botConfig.getCurrency().symbol}${goldBonus.toLocaleString()}`;
    }

    progression.addXP(winner.jid, xpGain, "PvP Victory");
    
    let msg = `[1m[4m┏━━━━━━━━━━━━━━━┓
`;
    msg += `┃   🏆 VICTORY!   ┃
`;
    msg += `┗━━━━━━━━━━━━━━━┛[0m

`;
    msg += `👑 *Winner:* ${winner.name}
`;
    msg += `💀 *Loser:* ${loser.name}

`;
    msg += `🎁 *Rewards:*
${rewardMsg}
⭐ +${xpGain} XP`;
    
    return msg;
}

// Periodic sweeper for memory optimization
setInterval(() => {
    const now = Date.now();
  
    // Expire unclaimed invites older than 2 min
    for (const [chatId, invite] of duelInvites.entries()) {
      if (now - invite.timestamp > 120000) {
        duelInvites.delete(chatId);
      }
    }
  
    // Expire abandoned duels with no action in 5 min
    for (const [chatId, duel] of activeDuels.entries()) {
      if (now - duel.lastAction > 300000) {
        activeDuels.delete(chatId);
      }
    }
  }, 60000); // check every minute

module.exports = {
    getDuel,
    challengePlayer,
    acceptChallenge,
    handlePvPAction
};
