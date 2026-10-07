const progression = require('../rpg/progression');
const economy = require('../rpg/economy');
const guilds = require('../rpg/guilds');
const botConfig = require('../../botConfig');

const getPrefix = () => botConfig.getPrefix();
const getBotMarker = () => `🃏 *${botConfig.getBotName()}*\n\n`;

// Compact number formatter for the .rank card (12,340 -> "12.3K").
function fmtCompact(n) {
  n = Math.floor(Number(n) || 0);
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

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
      levelUpMsg += `@${economy.getDisplayName(userId)} reached ${progression.getLevelDisplay(xpResult.newLevel)}!\n\n`;
      
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
    const displayName = isOwnProfile ? 'Your' : `@${economy.getDisplayName(targetJid)}'s`;
    
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
      message += `   @${economy.getDisplayName(jid)}\n`;
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
      message += `   @${economy.getDisplayName(jid)}\n`;
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
    const displayName = isOwnProfile ? 'Your' : `@${economy.getDisplayName(targetJid)}'s`;
    
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
 * 2026-09-14 (owner: "make the .rank an image card and include your level
 * and xp left to progress"): renders the ADVENTURER portrait card (Go
 * service, bg_RANK - big LEVEL line, rank pill, XP bar with the exact XP
 * left to progress, standings). Falls back to the legacy text layout if
 * the Go render fails for any reason.
 */
async function handleRankCommand(sock, chatId, senderJid, m, gateRows = []) {
  try {
    // 🎯 LIVE PROMOTION CHECK (owner live-test report #12): looking at your
    // rank must APPLY anything you've already earned — the auto-claim inside
    // updateAdventurerRank completes a fully-met gate trial and promotes in
    // the same call. The card is then rendered from the post-promotion doc,
    // so `.j rank` is both the check and the moment the rank moves.
    try { await economy.updateAdventurerRank(senderJid); } catch (e) {
      console.error('[rank] pre-card promotion check failed:', e.message);
    }
    const stats = progression.getUserStats(senderJid);
    const rank = progression.getUserRank(senderJid);
    const sheet = progression.getCharacterSheet(senderJid);
    const xpLeaderboard = progression.getXPLeaderboard(100);
    const gpLeaderboard = progression.getGPLeaderboard(100);

    // Find positions
    const xpPosition = xpLeaderboard.findIndex(u => u.userId === senderJid) + 1;
    const gpPosition = gpLeaderboard.findIndex(u => u.userId === senderJid) + 1;

    // ── portrait card (primary) ──
    const rankLetter = String(sheet?.adventurerRank || 'F').toUpperCase();
    const xp = stats.xp || {};
    const nickname = economy.getDisplayName(senderJid);
    const atMax = !xp.nextLevel || xp.nextLevel <= 0;

    // 2026-09-14 r6 (owner: "the rank card still doesn't show the
    // requirements needed to progress … make the requirements into a
    // progress bar / progress section"): the rank gates are no longer plain
    // text rows - they are computed here as structured PROGRESSION bars
    // (level, quests, gate-mission objectives) so the card can render each
    // requirement as a fill bar: done vs still-needed at a glance.
    const totalUsers = rank.totalUsers || 0;
    const topPct = Math.max(1, Math.min(99, 100 - (rank.percentile || 0)));
    const standing = [
      // r6: values kept compact so the 3×2 standing grid never kisses the
      // label - "#4/4234 · TOP 9%" fits the half-column width.
      { label: 'XP STANDING', value: xpPosition > 0 ? `#${xpPosition}/${totalUsers} · TOP ${topPct}%` : `-/${totalUsers}` },
      { label: 'GP STANDING', value: gpPosition > 0 ? `#${gpPosition}/${totalUsers}` : 'UNRANKED' },
      { label: 'TOTAL XP', value: fmtCompact(stats.xp?.total || 0) },
      { label: 'TOTAL GP', value: fmtCompact(stats.gp?.total || 0) },
      { label: 'COMMANDS', value: String(stats.commands || 0) },
      { label: 'ACHIEVEMENTS', value: String((stats.achievements || []).length) },
    ];
    const gates = Array.isArray(gateRows) ? gateRows : [];

    // ── structured progression bars (Go RANK card) ──
    const classSystem = require('../rpg/classSystem');
    const userDoc = economy.getUser(senderJid);
    const curRank = String(userDoc?.adventurerRank || rankLetter || 'F').toUpperCase();
    const nextRankInfo = (() => {
      try { return classSystem.getNextRankRequirements(curRank); } catch { return null; }
    })();
    const progress = [];
    if (nextRankInfo) {
      const req = nextRankInfo.requirements || {};
      const lvl = stats.level || 1;
      if (req.level > 0) {
        progress.push({
          label: 'LEVEL',
          cur: Math.min(lvl, req.level),
          max: req.level,
          done: lvl >= req.level,
          valueText: `${lvl}/${req.level}`,
        });
      }
      const qc = userDoc?.questsCompleted || 0;
      if (req.questsCompleted > 0) {
        progress.push({
          label: 'QUESTS',
          cur: Math.min(qc, req.questsCompleted),
          max: req.questsCompleted,
          done: qc >= req.questsCompleted,
          valueText: `${qc}/${req.questsCompleted}`,
        });
      }
      // gate-mission objectives - each becomes its own bar
      // ⚔️ RANK CARD TRUTH FIX (owner live-test report #12, 2026-10-07:
      // thefirstloser "aren't moving from D rank even tho you've meet the
      // requirements"): two lies stacked on this card.
      //   1. pvpWins lives at the TOP LEVEL of the user doc (pvpSystem writes
      //      user.pvpWins), but checkMissionProgress was handed user.stats —
      //      so the "Win 3 PvP duels" objective read 0 FOREVER, even for a
      //      player with wins. The snapshot now merges the top-level counter.
      //   2. The Go RANK template draws only the FIRST THREE progress bars —
      //      the mission's remaining objective bars (bosses/duels) were
      //      computed, silently dropped from the IMAGE, and absent from the
      //      caption too. The player saw LEVEL ✓ QUESTS ✓ WIN 20 QUESTS ✓ and
      //      concluded the rank was broken. Overflow bars now ride the
      //      caption, and an unfinished trial is spelled out there.
      const gateMission = (() => {
        try { return classSystem.getGateMissionForRank(curRank); } catch { return null; }
      })();
      if (gateMission) {
        const doneMissions = userDoc?.completedRankMissions || [];
        if (doneMissions.includes(gateMission.id)) {
          progress.push({ label: 'RANK MISSION', cur: 1, max: 1, done: true, valueText: 'DONE' });
        } else {
          const missionStats = {
            ...(userDoc?.stats || {}),
            questsWon: Math.max(userDoc?.stats?.questsWon || 0, userDoc?.questsWon || 0),
            pvpWins: Math.max(userDoc?.stats?.pvpWins || 0, userDoc?.pvpWins || 0),
          };
          let mp = { progress: [] };
          try { mp = classSystem.checkMissionProgress(gateMission.id, missionStats); } catch {}
          const bars = mp.progress.map((o) => ({
            label: String(o.label || o.id || 'OBJECTIVE').toUpperCase(),
            cur: Math.min(o.current || 0, o.target || 0),
            max: o.target || 0,
            done: !!o.done,
            valueText: `${o.current || 0}/${o.target || 0}`,
          }));
          // ⚔️ IMAGE SLOTS TELL THE TRUTH (follow-up to the 1f54fa75 card
          // fix): the Go RANK template draws only the FIRST THREE bars —
          // with objectives in mission order an all-met pair of level/quest
          // bars plus the first (met) objective filled every slot green and
          // the UNMET objective hid in the caption yap. Unmet objectives now
          // take the image slots first; met ones overflow to the caption.
          bars.sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
          progress.push(...bars);
        }
      }
    }

    // ⚔️ RANK CARD TRUTH: the trial line spells out the gate mission in
    // plain words (image bars + caption) — no player ever again reads an
    // all-green card as "requirements met, rank still stuck".
    const trialLine = (() => {
      try {
        if (!nextRankInfo) return '';
        const gm = classSystem.getGateMissionForRank(curRank);
        if (!gm) return '';
        const doneMissions = userDoc?.completedRankMissions || [];
        if (doneMissions.includes(gm.id)) return '';
        const ms = {
          ...(userDoc?.stats || {}),
          questsWon: Math.max(userDoc?.stats?.questsWon || 0, userDoc?.questsWon || 0),
          pvpWins: Math.max(userDoc?.stats?.pvpWins || 0, userDoc?.pvpWins || 0),
        };
        const mp = classSystem.checkMissionProgress(gm.id, ms);
        const parts = mp.progress.map((o) => `${o.done ? '✅' : '▫️'} ${o.label} ${Math.min(o.current || 0, o.target)}/${o.target}`).join(' · ');
        const allDone = mp.progress.every((o) => o.done);
        return allDone
          ? `⚔️ *${gm.icon || ''} ${gm.name}* — ${parts}\n▫️ Every objective earned — your rank advances the moment you check it.`
          : `⚔️ *${gm.icon || ''} ${gm.name}* — ${parts}\n▫️ Earn every objective and your rank advances automatically.`;
      } catch { return ''; }
    })();

    // 🔧 HOTFIX 2026-10-07 ("can't even check rank anymore"): gateCaption
    // was declared INSIDE the card-render try block but the image caption
    // below reads it — every SUCCESSFUL render threw ReferenceError and the
    // outer catch turned the whole command into "Failed to fetch rank
    // data." Hoisted to function scope; value unchanged.
    const gateCaption = progress.slice(3)
      .map((p) => `${p.label} ${p.valueText}`)
      .join(' | ');
    let buffer = null;
    try {
      const goService = require('../utils/goImageService');
      // The Go RANK template draws the first THREE progress bars (verified
      // against the live card 2026-10-07); anything beyond rides in the
      // caption so no requirement info is ever dropped.
      const shownProgress = progress.slice(0, 3);
      buffer = await goService.generatePortraitCard({
        kind: 'RANK',
        // 🧩 SPRITE CONSISTENCY 2026-09-17: themed styles draw the hero from
        // playerClass+playerIndex - RANK never sent them, so every player
        // rendered as Fighter variant 0 regardless of class/assigned sprite.
        playerClass: String((userDoc && userDoc.class) || '').toUpperCase(),
        playerIndex: Math.max(0, Math.floor(Number(userDoc && userDoc.spriteIndex) || 0)),
        style: (() => { try { const u = economy.getUser(senderJid); return (u && u.cardStyle) || 0; } catch (e) { return 0; } })(),
        nickname,
        caption: atMax
          ? ('the peak - no level left to climb' + (gateCaption ? ` · ${gateCaption}` : ''))
          : (`${fmtCompact(xp.nextLevel)} xp to level ${(stats.level || 1) + 1}` + (gateCaption ? ` · ${gateCaption}` : '')),
        sealText: rankLetter,
        level: stats.level || 1,
        rankLetter,
        xpNow: `${fmtCompact(xp.current || 0)} / ${fmtCompact(xp.required || 0)} XP`,
        xpLeft: atMax ? 'MAX LEVEL' : `${fmtCompact(xp.nextLevel)} XP TO LEVEL ${(stats.level || 1) + 1}`,
        xpPercent: Math.max(0, Math.min(100, Math.floor(xp.progress || 0))),
        standing,
        progressTitle: nextRankInfo
          ? `PROGRESSION - NEXT RANK ${String(nextRankInfo.rank).toUpperCase()}`
          : 'MAX RANK ACHIEVED',
        progress: shownProgress,
      });
    } catch (cardErr) {
      console.error('[rank] card render failed:', cardErr.message);
    }

    if (buffer && buffer.length > 100) {
      const caption = getBotMarker() +
        `👑 *Level ${stats.level || 1}* · ${rankLetter}-Rank\n` +
        (atMax
          ? `⚡ ${fmtCompact(xp.current || 0)} total XP - maximum level reached`
          : `⚡ ${fmtCompact(xp.current || 0)} / ${fmtCompact(xp.required || 0)} XP - *${fmtCompact(xp.nextLevel)} left to progress*`) +
        (gateCaption ? `\n▫️ Also required: ${gateCaption}` : '') +
        (trialLine ? `\n${trialLine}` : '');
      await sock.sendMessage(chatId, {
        image: buffer,
        caption,
        mimetype: 'image/jpeg',
      }, { quoted: m });
      return;
    }

    // ── fallback: legacy text version ──
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

    // 2026-09-14: keep the adventurer-rank gate info in the text fallback too
    if (gates.length) {
      message += `━━━━━━━━━━━━━━━\n\n`;
      for (const g of gates) {
        message += `🎯 *${g.label}:* ${g.value}\n`;
      }
      message += `\n`;
    }
    // ⚔️ RANK CARD TRUTH: the gate mission spelled out in the text fallback
    if (trialLine) {
      message += `━━━━━━━━━━━━━━━\n\n${trialLine}\n\n`;
    }

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
      const sheet = progression.getCharacterSheet(senderJid) || {};

      // 💡 2026-09-15: image-card UI for the allocation overview, rendered
      // with the same design language as the profile cards (Royal Decree
      // palette + type). Falls back to the text panel below on any render
      // failure so the command can never dead-end.
      try {
        // 💡 2026-09-15 (owner: "use the style/assets with different
        // orientation used across the entire rpg"): the card is now a member
        // of the Go PORTRAIT FAMILY - bg_ALLOCATE.png, 600x1000, the exact
        // bake geometry of DUEL/QUEST/TRIAL/RANK (banner ribbon, name plate,
        // THE POINTS/THE ALLOCATION parchment panels, wax seal). Rendered by
        // the Go service; text panel below stays as the fallback.
        const classSystem = require('../rpg/classSystem');
        const allocUser = economy.getUser(senderJid);
        const allocClass = allocUser ? classSystem.getClassById(allocUser.class) : null;
        const allocTier = allocClass?.tier || 'STARTER';
        // 💡 TICKET #b4f78f (2026-09-21): the per-point rates shown on this
        // card come from progression.previewAllocation - the EXACT function
        // the backend pays with, mirroring the owner contract (every point
        // delivers base × tier; the soft cap was removed by owner ruling
        // 2026-09-20). UI and backend read one math source, so they can never
        // disagree again.
        const allocBase = { hp: 15, atk: 3, def: 2, mag: 3, spd: 2, luck: 2, crit: 1 };
        const allocPerPoint = {};
        for (const k of Object.keys(allocBase)) {
          const pv = progression.previewAllocation(senderJid, k, 1);
          allocPerPoint[k.toUpperCase()] = Math.max(1, pv.nextSinglePointValue || pv.perPoint || 1);
        }
        const allocProg = progression.getUser(senderJid) || {};
        const allocInvRaw = allocProg.allocatedStatPoints || {};
        const allocInv = {};
        for (const [k, v] of Object.entries(allocInvRaw)) allocInv[String(k).toLowerCase()] = Number(v) || 0;
        const allocAvail = Number(sheet.statPoints) || 0;
        const allocSpent = Object.values(allocInv).reduce((a, b) => a + b, 0);
        const allocRows = Object.keys(allocBase).map((s) => ({
          label: s.toUpperCase(),
          value: String(allocInv[s] || 0),
          sub: `+${allocPerPoint[s.toUpperCase()] || 1}/pt`,
        }));
        const goService = require('../utils/goImageService');
        const cardBuffer = await goService.generatePortraitCard({
          kind: 'ALLOCATE',
          style: (allocUser && allocUser.cardStyle) || 0,
          // 🧩 SPRITE CONSISTENCY 2026-09-17: send class + assigned sprite.
          playerClass: String((allocClass && allocClass.id) || (allocUser && allocUser.class) || '').toUpperCase(),
          playerIndex: Math.max(0, Math.floor(Number(allocUser && allocUser.spriteIndex) || 0)),
          nickname: economy.getDisplayName(senderJid),
          pointsBig: `${allocAvail} POINTS`,
          pill: `${allocClass?.name || 'Adventurer'} · ${allocTier === 'STARTER' ? 'STARTER TIER' : allocTier}`,
          spentPercent: (allocSpent + allocAvail) > 0 ? Math.round((allocSpent / (allocSpent + allocAvail)) * 100) : 0,
          spentNow: `SPENT ${allocSpent}`,
          spentLeft: allocAvail > 0 ? `${allocAvail} LEFT TO SPEND` : 'FULLY ALLOCATED',
          ctaLabel: `${getPrefix()}allocate <stat> [amount]`,
          ctaSub: `e.g. ${getPrefix()}allocate ATK 5  |  ${getPrefix()}allocate HP 3`,
          sealText: String(Math.min(allocAvail, 999)),
          caption: 'spent points are permanent - choose wisely',
          rows: allocRows,
        });
        if (cardBuffer && cardBuffer.length > 0) {
          let cap = `✨ *STAT ALLOCATION* ✨\n`;
          cap += `Available Points: *${Number(sheet.statPoints) || 0}*\n\n`;
          cap += `🎯 *How to allocate - every point delivers the exact value shown:*\n`;
          for (const allocS of ["hp", "atk", "def", "mag", "spd", "luck", "crit"]) {
            // 💡 TICKET #b4f78f: show what 5 points ACTUALLY buy (base × tier,
            // from the same function the backend pays with).
            const allocPreview = progression.previewAllocation(senderJid, allocS, 5);
            cap += `• \`${getPrefix()} allocate ${allocS} 5\` → +${allocPreview.gainedValue} ${allocS.toUpperCase()}\n`;
          }
          cap += `\n💡 *EVOLVED and ASCENDED classes earn double per point!*`;
          return await sock.sendMessage(chatId, { image: cardBuffer, caption: getBotMarker() + cap }, { quoted: m });
        }
      } catch (cardErr) {
        console.error('[allocate] card render failed, using text fallback:', cardErr.message);
      }

      let msg = `✨ *STAT ALLOCATION* ✨\n\n`;
      msg += `Available Points: *${sheet.statPoints}*\n\n`;
      msg += `Every point delivers exactly:\n`;
      msg += `• *HP*: +15 per point\n`;
      msg += `• *ATK*: +3 per point\n`;
      msg += `• *DEF*: +2 per point\n`;
      msg += `• *MAG*: +3 per point\n`;
      msg += `• *SPD*: +2 per point\n`;
      msg += `• *LUCK*: +2 per point\n`;
      msg += `• *CRIT*: +1 per point\n\n`;
      msg += `💡 *EVOLVED and ASCENDED classes earn double per point!*\n\n`;
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
    // 💡 Phase B TUTORIAL: allocation lesson advances on a REAL spend
    // (no-op unless a tutorial session is active).
    try { require('../rpg/tutorial').notify(senderJid, 'allocate', { sock, chatId }).catch(() => {}); } catch (e) {}

  } catch (err) {
    console.error("Error in handleAllocateCommand:", err.message);
    await sock.sendMessage(chatId, { text: getBotMarker() + "❌ Error allocating points." }, { quoted: m });
  }
}

/*
 * Handle ${getPrefix()} respec - reset allocated stat points for Zeni
 * 💡 ECONOMY SINK (Item #4): Previously stat allocation was permanent
 * (no way to undo). Now players can pay Zeni to respec. Cost scales
 * with level so it's a meaningful sink at high levels:
 *   level 10 = 10K, level 50 = 50K, level 100 = 100K Zeni.
 */
async function handleRespecCommand(sock, chatId, senderJid, m) {
  try {
    const economy = require('../rpg/economy');
    const level = progression.getLevel(senderJid);

    // Check if there's anything to respec
    const user = progression.getUser(senderJid);
    if (!user) {
      return await sock.sendMessage(chatId, {
        text: getBotMarker() + '❌ User not found.'
      }, { quoted: m });
    }

    const allocatedStats = user.allocatedStats || {};
    const hasAllocated = Object.values(allocatedStats).some(v => (Number(v) || 0) > 0);
    if (!hasAllocated) {
      return await sock.sendMessage(chatId, {
        text: getBotMarker() + '❌ You have no allocated stat points to respec.'
      }, { quoted: m });
    }

    // Cost: 1K × level. Level 10 = 10K, level 50 = 50K, level 100 = 100K.
    const RESPEC_COST = 1000 * Math.max(1, level); // 💡 Rebalanced 2026-08-17: 100K×L at L50 = 5M (impossible). 1K×L at L50 = 50K (~2 days).
    const balance = economy.getBalance(senderJid);

    if (balance < RESPEC_COST) {
      return await sock.sendMessage(chatId, {
        text: getBotMarker() + `❌ Not enough Zeni!\n\nRespec Cost: ${RESPEC_COST.toLocaleString()}\nYour Balance: ${balance.toLocaleString()}\n\n_Respec cost scales with level: 1K × level._`
      }, { quoted: m });
    }

    // Deduct Zeni first (sink)
    economy.removeMoney(senderJid, RESPEC_COST, 'Stat respec');

    // Now reset stats
    const result = progression.resetStats(senderJid);
    if (!result.success) {
      // Refund on failure
      economy.addMoney(senderJid, RESPEC_COST, 'Respec refund');
      return await sock.sendMessage(chatId, {
        text: getBotMarker() + `❌ Respec failed: ${result.message}. Zeni refunded.`
      }, { quoted: m });
    }

    let successMsg = `🔄 *STAT RESPEC COMPLETE!*\n\n`;
    successMsg += `💰 Cost: ${RESPEC_COST.toLocaleString()} Zeni\n`;
    successMsg += `📊 Points Refunded: ${result.pointsRefunded}\n`;
    successMsg += `💎 Total Points Available: ${result.totalPoints}\n\n`;
    successMsg += `Use \`${getPrefix()} allocate <stat> [amount]\` to reinvest.`;

    await sock.sendMessage(chatId, { text: getBotMarker() + successMsg }, { quoted: m });
  } catch (err) {
    console.error('Error in handleRespecCommand:', err.message);
    await sock.sendMessage(chatId, {
      text: getBotMarker() + '❌ Error during respec.'
    }, { quoted: m });
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
  handleAllocateCommand,
  handleRespecCommand
};


