const progression = require('../rpg/progression');
const economy = require('../rpg/economy');
const guilds = require('../rpg/guilds');
const botConfig = require('../../botConfig');

const getPrefix = () => botConfig.getPrefix();
const getBotMarker = () => `🃏 *${botConfig.getBotName()}*\n\n`;

// ============================================
// PROGRESSION COMMAND HANDLERS
// ============================================

/*
 * Award XP and GP when a user uses a command
 * Call this from the main bot for every command execution
 */
async function handleCommandReward(sock, userId, chatId, hasGuildRole = false) {
  try {
    // Award XP (always)
    const xpResult = progression.awardXP(userId);
    
    // Award GP (only if user has guild role)
    let gpResult = null;
    if (hasGuildRole) {
      gpResult = progression.awardGP(userId, true);
      
      // Check for new GP achievements
      const gpAchievements = progression.checkGPAchievements(userId);
      if (gpAchievements.length > 0) {
        // Notify about achievements later to avoid spam
      }
    }
    
    // Check for new command achievements
    const cmdAchievements = progression.checkCommandAchievements(userId);
    
    // If user leveled up, send a celebration message
    if (xpResult.leveledUp) {
      const newAchievements = progression.checkLevelAchievements(userId, xpResult.newLevel);
      
      let levelUpMsg = `🎉 *LEVEL UP!* 🎉\n\n`;
      levelUpMsg += `@${userId.split('@')[0]} reached ${progression.getLevelDisplay(xpResult.newLevel)}!\n\n`;
      
      if (xpResult.levelsGained > 1) {
        levelUpMsg += `📈 *Jumped ${xpResult.levelsGained} levels!*\n\n`;
      }
      
      levelUpMsg += `✨ *+${xpResult.xpGained} XP*\n`;
      
      if (gpResult && gpResult.awarded) {
        levelUpMsg += `🎖️ *+${gpResult.gpGained} GP* (Guild Bonus)\n`;
      }
      
      // Add achievement notifications
      if (newAchievements.length > 0) {
        levelUpMsg += `\n🏆 *NEW ACHIEVEMENTS!*\n`;
        newAchievements.forEach(ach => {
          levelUpMsg += `${ach.icon} ${ach.name}\n`;
        });
      }
      
      await sock.sendMessage(chatId, {
        text: getBotMarker() + levelUpMsg,
        contextInfo: { mentionedJid: [userId] }
      });
    }
    
    return {
      xp: xpResult,
      gp: gpResult
    };
  } catch (err) {
    console.error("Error in handleCommandReward:", err.message);
    return null;
  }
}

/*
 * Check if user has a guild role
 */
function checkUserGuildRole(userId) {
  try {
    const guildName = guilds.getUserGuild(userId);
    if (!guildName) return false;
    
    const member = guilds.getGuildMember(guildName, userId);
    if (!member) return false;
    
    // User has a guild role if they're not just a regular member
    return member.role !== 'member' || member.role === 'leader' || member.role === 'officer';
  } catch (err) {
    return false;
  }
}

/*
 * Handle ${getPrefix()} level command - show user's level and XP
 */
async function handleLevelCommand(sock, chatId, senderJid, args, m) {
  try {
    // Check if looking up another user
    const targetJid = args[0]?.includes('@') ? args[0] : senderJid;
    const stats = progression.getUserStats(targetJid);
    const rank = progression.getUserRank(targetJid);
    const progressBar = progression.getProgressBar(stats.xp.progress, 15);
    
    const isOwnProfile = targetJid === senderJid;
    const displayName = isOwnProfile ? 'Your' : `@${targetJid.split('@')[0]}'s`;
    
    let message = `╔═══════════════════╗\n`;
    message += `║  📊 *${displayName.toUpperCase()} LEVEL* 📊  ║\n`;
    message += `╚═══════════════════╝\n\n`;
    
    message += `${progression.getLevelDisplay(stats.level)}\n`;
    message += `🏆 *Rank:* #${rank.rank} / ${rank.totalUsers} (Top ${100 - rank.percentile}%)\n\n`;
    
    message += `━━━━━━━━━━━━━━━\n`;
    message += `⚡ *XP PROGRESS*\n`;
    message += `${progressBar} ${stats.xp.progress}%\n\n`;
    message += `📈 ${stats.xp.current.toLocaleString()} / ${stats.xp.required.toLocaleString()} XP\n`;
    message += `🎯 ${stats.xp.nextLevel.toLocaleString()} XP to Level ${stats.level + 1}\n`;
    message += `📊 Total XP: ${stats.xp.total.toLocaleString()}\n`;
    message += `━━━━━━━━━━━━━━━\n\n`;
    
    message += `🎖️ *GP (Guild Points):* ${stats.gp.current.toLocaleString()}\n`;
    message += `💎 *Total GP Earned:* ${stats.gp.total.toLocaleString()}\n\n`;
    
    message += `📱 *Commands Used:* ${stats.commands.toLocaleString()}\n\n`;
    
    if (stats.achievements.length > 0) {
      message += `🏅 *ACHIEVEMENTS* (${stats.achievements.length})\n`;
      stats.achievements.slice(0, 5).forEach(ach => {
        message += `${ach.icon} ${ach.name}\n`;
      });
      if (stats.achievements.length > 5) {
        message += `_...and ${stats.achievements.length - 5} more_\n`;
      }
    }
    
    const mentionedJid = isOwnProfile ? [senderJid] : [targetJid];
    await sock.sendMessage(chatId, {
      text: getBotMarker() + message,
      contextInfo: { mentionedJid }
    }, { quoted: m });
    
  } catch (err) {
    console.error("Error in handleLevelCommand:", err.message);
    await sock.sendMessage(chatId, {
      text: getBotMarker() + "❌ Failed to fetch level data."
    }, { quoted: m });
  }
}

/*
 * Handle ${getPrefix()} xptop command - XP leaderboard
 */
async function handleXPTopCommand(sock, chatId, m) {
  try {
    const leaderboard = progression.getXPLeaderboard(10);
    
    if (leaderboard.length === 0) {
      await sock.sendMessage(chatId, {
        text: getBotMarker() + "📊 No users have earned XP yet!"
      }, { quoted: m });
      return;
    }
    
    let message = `╔═══════════════╗\n`;
    message += `║  🏆 *XP LEADERBOARD* 🏆  ║\n`;
    message += `╚═══════════════╝\n\n`;
    
    const mentions = [];
    leaderboard.forEach((user, index) => {
      const rankEmoji = progression.getRankEmoji(index + 1);
      const jid = user.userId;
      mentions.push(jid);
      
      message += `${rankEmoji} *#${index + 1}* | ${progression.getLevelDisplay(user.level)}\n`;
      message += `   @${jid.split('@')[0]}\n`;
      message += `   💎 ${user.totalXP.toLocaleString()} XP | 📱 ${user.commandCount} cmds\n\n`;
    });
    
    message += `━━━━━━━━━━━━━━━\n`;
    message += `💡 _Use ${getPrefix()} level to check your rank!_`;
    
    await sock.sendMessage(chatId, {
      text: getBotMarker() + message,
      contextInfo: { mentionedJid: mentions }
    }, { quoted: m });
    
  } catch (err) {
    console.error("Error in handleXPTopCommand:", err.message);
    await sock.sendMessage(chatId, {
      text: getBotMarker() + "❌ Failed to fetch XP leaderboard."
    }, { quoted: m });
  }
}

/*
 * Handle ${getPrefix()} gptop command - GP leaderboard
 */
async function handleGPTopCommand(sock, chatId, m) {
  try {
    const leaderboard = progression.getGPLeaderboard(10);
    
    if (leaderboard.length === 0) {
      await sock.sendMessage(chatId, {
        text: getBotMarker() + "🎖️ No users have earned GP yet!\n\n💡 _GP is earned by guild members with roles when using commands._"
      }, { quoted: m });
      return;
    }
    
    let message = `╔═══════════════════╗\n`;
    message += `║  🎖️ *GP LEADERBOARD* 🎖️  ║\n`;
    message += `╚═══════════════════╝\n\n`;
    
    const mentions = [];
    leaderboard.forEach((user, index) => {
      const rankEmoji = progression.getRankEmoji(index + 1);
      const jid = user.userId;
      mentions.push(jid);
      
      message += `${rankEmoji} *#${index + 1}* | ${progression.getLevelDisplay(user.level)}\n`;
      message += `   @${jid.split('@')[0]}\n`;
      message += `   🎖️ ${user.totalGP.toLocaleString()} Total GP\n`;
      message += `   💰 ${user.gp.toLocaleString()} Current GP\n\n`;
    });
    
    message += `━━━━━━━━━━━━━━━\n`;
    message += `💡 _GP is the rarest stat! Join a guild and earn a role to collect GP._`;
    
    await sock.sendMessage(chatId, {
      text: getBotMarker() + message,
      contextInfo: { mentionedJid: mentions }
    }, { quoted: m });
    
  } catch (err) {
    console.error("Error in handleGPTopCommand:", err.message);
    await sock.sendMessage(chatId, {
      text: getBotMarker() + "❌ Failed to fetch GP leaderboard."
    }, { quoted: m });
  }
}

/*
 * Handle ${getPrefix()} achievements command
 */
async function handleAchievementsCommand(sock, chatId, senderJid, args, m) {
  try {
    const targetJid = args[0]?.includes('@') ? args[0] : senderJid;
    const stats = progression.getUserStats(targetJid);
    const isOwnProfile = targetJid === senderJid;
    const displayName = isOwnProfile ? 'Your' : `@${targetJid.split('@')[0]}'s`;
    
    let message = `╔═══════════════════╗\n`;
    message += `║  🏅 *${displayName.toUpperCase()} ACHIEVEMENTS* 🏅  ║\n`;
    message += `╚═══════════════════╝\n\n`;
    
    if (stats.achievements.length === 0) {
      message += `❌ No achievements unlocked yet!\n\n`;
      message += `💡 *HOW TO EARN ACHIEVEMENTS:*\n`;
      message += `• Level up to unlock level achievements\n`;
      message += `• Earn GP for guild achievements\n`;
      message += `• Use commands for activity achievements\n`;
    } else {
      message += `🎖️ *Unlocked: ${stats.achievements.length}*\n\n`;
      
      stats.achievements.forEach(ach => {
        message += `${ach.icon} *${ach.name}*\n`;
        message += `   _${ach.desc}_\n\n`;
      });
    }
    
    // Show locked achievements as teasers
    const allAchievements = Object.values(progression.ACHIEVEMENTS);
    const locked = allAchievements.filter(ach => 
      !stats.achievements.some(a => a.id === ach.id)
    ).slice(0, 3);
    
    if (locked.length > 0) {
      message += `━━━━━━━━━━━━━━━\n`;
      message += `🔒 *LOCKED ACHIEVEMENTS*\n\n`;
      locked.forEach(ach => {
        message += `${ach.icon} ${ach.name}\n`;
        message += `   _${ach.desc}_\n\n`;
      });
    }
    
    const mentionedJid = isOwnProfile ? [senderJid] : [targetJid];
    await sock.sendMessage(chatId, {
      text: getBotMarker() + message,
      contextInfo: { mentionedJid }
    }, { quoted: m });
    
  } catch (err) {
    console.error("Error in handleAchievementsCommand:", err.message);
    await sock.sendMessage(chatId, {
      text: getBotMarker() + "❌ Failed to fetch achievements."
    }, { quoted: m });
  }
}

/*
 * Handle ${getPrefix()} rank command - show detailed rank info
 */
async function handleRankCommand(sock, chatId, senderJid, m) {
  try {
    const stats = progression.getUserStats(senderJid);
    const rank = progression.getUserRank(senderJid);
    const xpLeaderboard = progression.getXPLeaderboard(100);
    const gpLeaderboard = progression.getGPLeaderboard(100);
    
    // Find positions
    const xpPosition = xpLeaderboard.findIndex(u => u.userId === senderJid) + 1;
    const gpPosition = gpLeaderboard.findIndex(u => u.userId === senderJid) + 1;
    
    let message = `╔═══════════════════╗\n`;
    message += `║  👑 *YOUR RANK* 👑  ║\n`;
    message += `╚═══════════════════╝\n\n`;
    
    message += `${progression.getLevelDisplay(stats.level)}\n\n`;
    
    message += `━━━━━━━━━━━━━━━\n`;
    message += `📊 *RANKINGS*\n\n`;
    
    message += `⚡ *XP Rank:* #${xpPosition || 'Unranked'}\n`;
    message += `   Top ${100 - rank.percentile}% of ${rank.totalUsers} users\n\n`;
    
    if (gpPosition > 0) {
      message += `🎖️ *GP Rank:* #${gpPosition}\n\n`;
    } else {
      message += `🎖️ *GP Rank:* Unranked\n`;
      message += `   _Join a guild to earn GP!_\n\n`;
    }
    
    message += `━━━━━━━━━━━━━━━\n\n`;
    
    message += `💎 *Total XP:* ${stats.xp.total.toLocaleString()}\n`;
    message += `🎖️ *Total GP:* ${stats.gp.total.toLocaleString()}\n`;
    message += `📱 *Commands:* ${stats.commands.toLocaleString()}\n`;
    message += `🏅 *Achievements:* ${stats.achievements.length}\n\n`;
    
    message += `💡 _Use ${getPrefix()} level for detailed progress_`;
    
    await sock.sendMessage(chatId, {
      text: getBotMarker() + message
    }, { quoted: m });
    
  } catch (err) {
    console.error("Error in handleRankCommand:", err.message);
    await sock.sendMessage(chatId, {
      text: getBotMarker() + "❌ Failed to fetch rank data."
    }, { quoted: m });
  }
}

/*
 * Handle ${getPrefix()} allocate <stat> [amount]
 */
async function handleAllocateCommand(sock, chatId, senderJid, args, m) {
  try {
    const stat = args[0];
    // Validate amount up-front. `parseInt(args[1]) || 1` would silently
    // default non-numeric input to 1, hiding typos from the user. Also
    // reject 0 and negative values explicitly.
    let amount = 1;
    if (args[1] !== undefined) {
      const parsed = parseInt(args[1], 10);
      if (isNaN(parsed) || parsed <= 0) {
        return await sock.sendMessage(chatId, {
          text: getBotMarker() + `❌ Amount must be a positive whole number! Got: \`${args[1]}\``
        }, { quoted: m });
      }
      amount = parsed;
    }

    if (!stat) {
      const sheet = progression.getCharacterSheet(senderJid);
      let msg = `✨ *STAT ALLOCATION* ✨\n\n`;
      msg += `Available Points: *${sheet.statPoints}*\n\n`;
      msg += `Spend points to increase your power:\n`;
      msg += `• *HP*: +15-60 HP\n`;
      msg += `• *ATK*: +3-12 Attack\n`;
      msg += `• *DEF*: +2-8 Defense\n`;
      msg += `• *MAG*: +3-12 Magic\n`;
      msg += `• *SPD*: +2-8 Speed\n`;
      msg += `• *LUCK*: +2-8 Luck\n`;
      msg += `• *CRIT*: +1-4% Crit\n\n`;
      msg += `💡 *Higher class tiers get more value per point!*\n\n`;
      msg += `Usage: \`${getPrefix()} allocate <stat> [amount]\`\n`;
      msg += `Example: \`${getPrefix()} allocate atk 5\``;
      
      return await sock.sendMessage(chatId, { text: getBotMarker() + msg }, { quoted: m });
    }

    const result = progression.allocateStatPoint(senderJid, stat, amount);
    if (!result.success) {
      return await sock.sendMessage(chatId, { text: getBotMarker() + result.message }, { quoted: m });
    }

    let successMsg = `✅ *ALLOCATION SUCCESSFUL!*\n\n`;
    successMsg += `Spent *${result.pointsSpent}* points on *${result.stat}*.\n`;
    successMsg += `Gained: *+${result.valueGained}* ${result.stat}!\n`;
    successMsg += `Remaining Points: *${result.remainingPoints}*`;

    await sock.sendMessage(chatId, { text: getBotMarker() + successMsg }, { quoted: m });

  } catch (err) {
    console.error("Error in handleAllocateCommand:", err.message);
    await sock.sendMessage(chatId, { text: getBotMarker() + "❌ Error allocating points." }, { quoted: m });
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  handleCommandReward,
  checkUserGuildRole,
  handleLevelCommand,
  handleXPTopCommand,
  handleGPTopCommand,
  handleAchievementsCommand,
  handleRankCommand,
  handleAllocateCommand
};


