const fs = require('fs');
const path = require('path');
const botConfig = require('../botConfig');

// NEW: Database Imports
const mongoose = require('mongoose');
const GuildModel = require('./models/Guild');
const System = require('./models/System');
const connectDB = require('../db');

const BOT_MARKER = `*${botConfig.getBotName()}*\n\n`;

// memory caches for fast access
let globalGuildData = {
  guilds: {},
  memberGuilds: {},
  guildOwners: {},
  guildInvites: {}
};

const GUILD_ARCHETYPES = {
  ADVENTURER: {
    name: 'Adventurers Guild',
    icon: '⚔️',
    description: 'Focuses on monster hunting and combat.',
    perks: 'Increases XP from monsters by 15%.',
    questType: 'KILL'
  },
  MERCHANT: {
    name: 'Merchants Guild',
    icon: '💰',
    description: 'Focuses on commerce and wealth.',
    perks: 'Increases item sell value by 10%.',
    questType: 'EARN'
  },
  RESEARCH: {
    name: 'Research Institute',
    icon: '🧪',
    description: 'Focuses on study and craft.',
    perks: 'Reduces crafting material costs by 10%.',
    questType: 'CRAFT'
  }
};

const activeChallenges = new Map();

// types of challenges guilds can throw at each other
const CHALLENGE_TYPES = {
// ... existing challenge types ...
};

const GUILD_UPGRADES = {
  hall: {
    name: 'Guild Hall',
    maxLevel: 5,
    baseCost: 500,
    benefit: 'Increases max member capacity by +5 per level.'
  },
  training: {
    name: 'Training Ground',
    maxLevel: 5,
    baseCost: 1000,
    benefit: 'Gives all members +5% XP bonus per level.'
  },
  treasury: {
    name: 'Treasury',
    maxLevel: 5,
    baseCost: 1500,
    benefit: 'Gives all members +10% Zeni bonus from quests per level.'
  }
};

//==================this part is for saving and loading guild data==================
async function loadGuilds() {
  try {
    await connectDB();
    
    // 1. Load System Mappings
    const sys = await System.findOne({ key: 'guild_system' });
    if (sys && sys.value) {
      globalGuildData.memberGuilds = sys.value.memberGuilds || {};
      globalGuildData.guildOwners = sys.value.guildOwners || {};
      globalGuildData.guildInvites = sys.value.guildInvites || {};
    }

    // 2. Load Individual Guilds
    const guilds = await GuildModel.find({});
    for (const g of guilds) {
        const titles = {};
        const admins = [];
        const members = [];
        
        if (g.members) {
            g.members.forEach(m => {
                members.push(m.userId);
                if (m.role === 'officer' || m.role === 'leader') {
                    if (m.role === 'officer') admins.push(m.userId);
                }
                if (m.title && m.title !== 'Member') titles[m.userId] = m.title;
            });
        }

        globalGuildData.guilds[g.guildId] = {
            members,
            owner: g.leader,
            admins,
            titles,
            createdAt: g.createdAt,
            points: g.xp || 0,
            level: g.level || 1,
            balance: g.balance || 0,
            type: g.type || 'ADVENTURER',
            dailyBoard: g.dailyBoard || { targets: [] },
            pointsHistory: g.logs || [],
            motto: g.motto || "Adapt or be Infected.",
            buildings: g.upgrades ? (g.upgrades instanceof Map ? Object.fromEntries(g.upgrades) : g.upgrades) : {}
        };
    }
    
    // console.log(`✅ Loaded ${guilds.length} guilds from MongoDB`);
  } catch (err) {
    console.error("Error loading guilds from DB:", err.message);
  }
}

// NEW: Sync system mappings
async function syncGuildSystem() {
    try {
        await System.updateOne(
            { key: 'guild_system' },
            { 
                $set: { 
                    value: {
                        memberGuilds: globalGuildData.memberGuilds,
                        guildOwners: globalGuildData.guildOwners,
                        guildInvites: globalGuildData.guildInvites
                    } 
                } 
            },
            { upsert: true }
        );
    } catch (err) {
        console.error("Error syncing guild system:", err.message);
    }
}

// NEW: Sync specific guild
async function syncGuild(guildName) {
    const g = globalGuildData.guilds[guildName];
    if (!g) return;

    try {
        await GuildModel.updateOne(
            { guildId: guildName },
            {
                leader: g.owner,
                members: g.members.map(jid => ({
                    userId: jid,
                    role: g.owner === jid ? 'leader' : (g.admins.includes(jid) ? 'officer' : 'member'),
                    title: g.titles[jid] || 'Member'
                })),
                xp: g.points || 0,
                level: g.level || 1,
                balance: g.balance || 0,
                type: g.type || 'ADVENTURER',
                dailyBoard: g.dailyBoard || { targets: [] },
                motto: g.motto || "Adapt or be Infected.",
                upgrades: g.buildings || {},
                logs: g.pointsHistory || []
            },
            { upsert: true }
        );
    } catch (err) {
        console.error(`Error syncing guild ${guildName}:`, err.message);
    }
}

function saveGuilds() {
  // No-op: We now use syncGuildSystem and syncGuild
}

async function loadChallenges() {
  try {
    const sys = await System.findOne({ key: 'guild_challenges' });
    if (sys && sys.value) {
      for (const [id, chall] of Object.entries(sys.value)) {
        activeChallenges.set(id, chall);
      }
      console.log("✅ Loaded guild challenges from MongoDB");
    }
  } catch (err) {
    console.error("Error loading challenges:", err.message);
  }
}

async function saveChallenges() {
  try {
    const data = Object.fromEntries(activeChallenges);
    await System.updateOne(
        { key: 'guild_challenges' },
        { $set: { value: data } },
        { upsert: true }
    );
  } catch (err) {
    console.error("Error saving challenges:", err.message);
  }
}
//========================================

//==================this part handles core guild operations like creating and joining==================
function getGuildInfo() {
  return globalGuildData;
}

// make a new guild
function createGuild(guildName, creatorJid, archetype = 'ADVENTURER') {
  const info = globalGuildData;

  if (info.guildOwners[creatorJid]) {
    return {
      success: false,
      message: `❌ You already own the guild "${info.guildOwners[creatorJid]}"!

Delete it first with: ${botConfig.getPrefix()} guild delete`
    };
  }

  const lowerName = guildName.toLowerCase();
  if (Object.keys(info.guilds).some(g => g.toLowerCase() === lowerName)) {
    return { success: false, message: "❌ Guild name already taken!" };
  }

  const type = GUILD_ARCHETYPES[archetype.toUpperCase()] ? archetype.toUpperCase() : 'ADVENTURER';

  info.guilds[guildName] = {
    members: [creatorJid],
    owner: creatorJid,
    admins: [],
    titles: {},
    createdAt: Date.now(),
    points: 0,
    level: 1,
    type: type,
    dailyBoard: { lastUpdate: Date.now(), targets: [] },
    pointsHistory: [],
    motto: "Adapt or be Infected.",
    // 💡 GUILD BUILDINGS
    buildings: {
      hall: { level: 1, name: 'Guild Hall' },
      training: { level: 0, name: 'Training Ground' },
      treasury: { level: 0, name: 'Treasury' }
    }
  };

  info.memberGuilds[creatorJid] = guildName;
  info.guildOwners[creatorJid] = guildName;

  generateDailyBoard(guildName);
  saveGuilds();
  syncGuild(guildName);
  syncGuildSystem();

  return {
    success: true,
    message: `✅ Guild "${guildName}" created!

🏰 You are the Guild Master!`
  };
}

function getAvailableTargets(level) {
  if (level < 15) return ['FLAME', 'DROWNED_ONE', 'TIDE_LURKER', 'MIST_WALKER'];
  if (level < 30) return ['STONE_HULK', 'CRYSTAL_CORRUPTED', 'EARTH_WARDEN'];
  if (level < 45) return ['FROST_GHOUL', 'GLACIAL_BEAST', 'BLIZZARD_WRAITH'];
  if (level < 60) return ['MAGMA_BRUTE', 'HELLFIRE_DEMON', 'ABYSSAL_HORROR', 'TSUNAMI_WALKER'];
  return ['OBSIDIAN_JUGGERNAUT', 'DIAMOND_SENTINEL', 'FLESH_ABOMINATION', 'CHIMERA_BEAST'];
}

function generateDailyBoard(guildName) {
  const guild = globalGuildData.guilds[guildName];
  if (!guild) return;

  const avgLevel = (guild.level || 1) * 5; 
  const targets = [];
  
  if (guild.type === 'MERCHANT') {
    const targetZeni = Math.floor((guild.level * 5000) + (guild.members.length * 2000));
    targets.push({ type: 'EARN_ZENI', count: targetZeni, current: 0, label: 'Earn Zeni' });
  } else if (guild.type === 'RESEARCH') {
    const targetItems = Math.floor((guild.level * 2) + guild.members.length);
    targets.push({ type: 'CRAFT_ITEMS', count: targetItems, current: 0, label: 'Craft Items' });
  } else {
    const targetPool = getAvailableTargets(avgLevel);
    for (let i = 0; i < 3; i++) {
      const type = targetPool[Math.floor(Math.random() * targetPool.length)];
      const count = Math.floor(Math.random() * 5 * guild.members.length) + 5;
      targets.push({ type, count, current: 0, label: `Kill ${type}` });
    }
  }

  guild.dailyBoard = {
    lastUpdate: Date.now(),
    targets: targets,
    completed: false,
    rewards: {
      xp: 500 * (guild.level || 1),
      gold: 1000 * (guild.level || 1)
    }
  };

  syncGuild(guildName);
}

// update guild motto
function setGuildMotto(userJid, newMotto) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];
  const guild = info.guilds[guildName];
  
  if (!guild || guild.owner !== userJid) {
    return { success: false, message: "❌ Only the Guild Master can set the motto!" };
  }

  if (newMotto.length > 50) {
    return { success: false, message: "❌ Motto too long! Max 50 characters." };
  }

  guild.motto = newMotto;
  syncGuild(guildName); 
  return { success: true, message: `✅ Guild motto updated to: "${newMotto}"` };
}

// disband the guild
function deleteGuild(userJid) {
  const info = globalGuildData;
  const guildName = info.guildOwners[userJid];

  if (!guildName) {
    return { success: false, message: "❌ You don't own any guild!" };
  }

  const guild = info.guilds[guildName];

  guild.members.forEach(memberJid => {
    delete info.memberGuilds[memberJid];
  });

  delete info.guildOwners[userJid];
  delete info.guilds[guildName];

  // Sync delete to MongoDB
  GuildModel.deleteOne({ guildId: guildName }).catch(e => console.error(e));
  syncGuildSystem();

  return {
    success: true,
    message: `✅ Guild "${guildName}" has been disbanded!`
  };
}

// join a guild
function joinGuild(guildName, userJid) {
  const info = globalGuildData;

  if (info.memberGuilds[userJid]) {
    return {
      success: false,
      message: `❌ You're already in "${info.memberGuilds[userJid]}"!

Leave first with: ${botConfig.getPrefix()} guild leave`
    };
  }

  const guild = Object.entries(info.guilds).find(
    ([name]) => name.toLowerCase() === guildName.toLowerCase()
  );

  if (!guild) {
    return { success: false, message: "❌ Guild doesn't exist!" };
  }

  const [realGuildName, guildData] = guild;

  guildData.members.push(userJid);
  info.memberGuilds[userJid] = realGuildName;

  syncGuild(realGuildName);
  syncGuildSystem();

  addGuildPoints(realGuildName, 5, 'member joined');

  return {
    success: true,
    message: `✅ Joined guild "${realGuildName}"!

👥 Members: ${guildData.members.length}`
  };
}

// leave your current guild
function leaveGuild(userJid) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];

  if (!guildName) {
    return { success: false, message: "❌ You're not in any guild!" };
  }

  if (info.guildOwners[userJid]) {
    return {
      success: false,
      message: `❌ You're the guild owner! Delete the guild instead with: ${botConfig.getPrefix()} guild delete`
    };
  }

  const guild = info.guilds[guildName];

  guild.members = guild.members.filter(m => m !== userJid);
  guild.admins = guild.admins.filter(a => a !== userJid);
  delete guild.titles[userJid];
  delete info.memberGuilds[userJid];

  syncGuild(guildName);
  syncGuildSystem();

  return {
    success: true,
    message: `✅ Left guild "${guildName}"!`
  };
}
//========================================

//==================this part handles guild invites and acceptance==================
function inviteToGuild(inviterJid, inviteeJid) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[inviterJid];

  if (!guildName) {
    return { success: false, message: "❌ You're not in any guild!" };
  }

  if (info.memberGuilds[inviteeJid]) {
    return {
      success: false,
      message: `❌ This user is already in "${info.memberGuilds[inviteeJid]}"!`
    };
  }

  if (info.guildInvites[inviteeJid]) {
    return { success: false, message: "❌ This user already has a pending invite!" };
  }

  info.guildInvites[inviteeJid] = {
    guildName: guildName,
    inviter: inviterJid,
    timestamp: Date.now()
  };

  syncGuildSystem();

  return {
    success: true,
    message: `✅ Invited @${inviteeJid.split('@')[0]} to "${guildName}"!

⏳ *Time:* 120s to accept.
They can accept with: ${botConfig.getPrefix()} accept`
  };
}

// accept an invite
function acceptGuildInvite(userJid) {
  const info = globalGuildData;
  const invite = info.guildInvites[userJid];

  if (!invite) {
    return { success: false, message: "❌ You don't have any pending invites!" };
  }

  if (Date.now() - invite.timestamp > 120000) {
    delete info.guildInvites[userJid];
    syncGuildSystem();
    return { success: false, message: "❌ Invite expired! (120s limit)" };
  }

  if (info.memberGuilds[userJid]) {
    delete info.guildInvites[userJid];
    syncGuildSystem();
    return {
      success: false,
      message: `❌ You're already in "${info.memberGuilds[userJid]}"!`
    };
  }

  const guildName = invite.guildName;
  const guild = info.guilds[guildName];

  if (!guild) {
    delete info.guildInvites[userJid];
    syncGuildSystem();
    return { success: false, message: "❌ That guild no longer exists!" };
  }

  guild.members.push(userJid);
  info.memberGuilds[userJid] = guildName;

  const inviter = invite.inviter;
  delete info.guildInvites[userJid];

  syncGuild(guildName);
  syncGuildSystem();

  addGuildPoints(guildName, 5, 'member joined');

  return {
    success: true,
    guild: guildName,
    inviter: inviter,
    memberCount: guild.members.length,
    message: `✅ Joined guild "${guildName}"!

💥 Members: ${guild.members.length}`
  };
}

// decline an invite
function declineGuildInvite(userJid) {
  const info = globalGuildData;
  const invite = info.guildInvites[userJid];

  if (!invite) {
    return { success: false, message: "❌ You don't have any pending invites!" };
  }

  if (Date.now() - invite.timestamp > 120000) {
      delete info.guildInvites[userJid];
      syncGuildSystem();
      return { success: false, message: "❌ Invite already expired." };
  }

  const guildName = invite.guildName;
  delete info.guildInvites[userJid];
  syncGuildSystem();

  return {
    success: true,
    message: `✅ Declined invite to "${guildName}"`
  };
}

// check pending invites
function checkGuildInvite(userJid) {
  const info = globalGuildData;
  const invite = info.guildInvites[userJid];

  if (!invite) {
    return null;
  }

  if (Date.now() - invite.timestamp > 120000) {
    delete info.guildInvites[userJid];
    syncGuildSystem();
    return null;
  }

  return invite;
}
//========================================

//==================this part handles guild management like promoting and kicking==================
function promoteToAdmin(ownerJid, targetJid) {
  const info = globalGuildData;
  const guildName = info.guildOwners[ownerJid];

  if (!guildName) {
    return { success: false, message: "❌ You don't own any guild!" };
  }

  const guild = info.guilds[guildName];

  if (!guild.members.includes(targetJid)) {
    return { success: false, message: "❌ That user is not in your guild!" };
  }

  if (guild.admins.includes(targetJid)) {
    return { success: false, message: "❌ That user is already an admin!" };
  }

  guild.admins.push(targetJid);
  syncGuild(guildName);

  return {
    success: true,
    message: `✅ @${targetJid.split('@')[0]} promoted to admin!`
  };
}

// demote an admin
function demoteAdmin(ownerJid, targetJid) {
  const info = globalGuildData;
  const guildName = info.guildOwners[ownerJid];

  if (!guildName) {
    return { success: false, message: "❌ You don't own any guild!" };
  }

  const guild = info.guilds[guildName];

  if (!guild.admins.includes(targetJid)) {
    return { success: false, message: "❌ That user is not an admin!" };
  }

  guild.admins = guild.admins.filter(a => a !== targetJid);
  syncGuild(guildName);

  return {
    success: true,
    message: `✅ @${targetJid.split('@')[0]} demoted from admin!`
  };
}

// kick someone out
function kickFromGuild(ownerOrAdminJid, targetJid) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[ownerOrAdminJid];

  if (!guildName) {
    return { success: false, message: "❌ You're not in any guild!" };
  }

  const guild = info.guilds[guildName];
  const isOwner = info.guildOwners[ownerOrAdminJid] === guildName;
  const isAdmin = guild.admins.includes(ownerOrAdminJid);

  if (!isOwner && !isAdmin) {
    return { success: false, message: "❌ Only guild owner or admins can kick members!" };
  }

  if (!guild.members.includes(targetJid)) {
    return { success: false, message: "❌ That user is not in your guild!" };
  }

  if (targetJid === guild.owner) {
    return { success: false, message: "❌ Can't kick the guild owner!" };
  }

  guild.members = guild.members.filter(m => m !== targetJid);
  guild.admins = guild.admins.filter(a => a !== targetJid);
  delete guild.titles[targetJid];
  delete info.memberGuilds[targetJid];

  syncGuild(guildName);
  syncGuildSystem();

  return {
    success: true,
    message: `✅ @${targetJid.split('@')[0]} has been kicked from "${guildName}"!`
  };
}

// give someone a special title
function setMemberTitle(ownerJid, targetJid, title) {
  const info = globalGuildData;
  const guildName = info.guildOwners[ownerJid];

  if (!guildName) {
    return { success: false, message: "❌ You don't own any guild!" };
  }

  const guild = info.guilds[guildName];

  if (!guild.members.includes(targetJid)) {
    return { success: false, message: "❌ That user is not in your guild!" };
  }

  guild.titles[targetJid] = title;
  syncGuild(guildName);

  return {
    success: true,
    message: `✅ @${targetJid.split('@')[0]} title set to: ${title}`
  };
}

// check someone's title
function getMemberTitle(guildName, userJid) {
  const info = globalGuildData;
  const guild = info.guilds[guildName];

  if (!guild) return null;

  return guild.titles[userJid] || 'Member';
}

function getUserGuild(userJid) {
  return globalGuildData.memberGuilds[userJid];
}

function getGuild(guildName) {
  return globalGuildData.guilds[guildName];
}

function getGuildMember(guildName, userJid) {
  const guild = globalGuildData.guilds[guildName];
  if (!guild || !guild.members.includes(userJid)) return null;

  return {
    jid: userJid,
    role: guild.owner === userJid ? 'leader' : (guild.admins.includes(userJid) ? 'officer' : 'member'),
    title: guild.titles[userJid] || 'Member'
  };
}

function isGuildOwner(userJid) {
  return !!globalGuildData.guildOwners[userJid];
}

function isGuildAdmin(userJid) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];

  if (!guildName) return false;

  const guild = info.guilds[guildName];
  return guild.admins.includes(userJid);
}
//========================================

//==================this part handles extra guild features like leaderboards and tags==================
function getGuildLeaderboard(wordle, tictactoe, economyModule) {
  const info = globalGuildData;
  const guildScores = {};

  Object.entries(info.guilds).forEach(([guildName, guild]) => {
    const members = Array.isArray(guild.members) ? guild.members : [];

    let wordleWins = 0;
    let tttWins = 0;
    let gamblingWins = 0;

    members.forEach(jid => {
      const normalizedJid = jid.split('@')[0].split(':')[0];

      if (wordle && wordle[normalizedJid]) {
        wordleWins += wordle[normalizedJid].wins || 0;
      }

      if (tictactoe && tictactoe[normalizedJid]) {
        tttWins += tictactoe[normalizedJid].wins || 0;
      }

      const userData = economyModule.getUser(jid);
      if (userData && userData.stats) {
        gamblingWins += userData.stats.gamesWon || 0;
      }
    });

    const totalScore = (wordleWins * 10) + (tttWins * 5) + (gamblingWins * 3);

    guildScores[guildName] = {
      score: totalScore,
      wordleWins,
      tttWins,
      gamblingWins,
      totalWins: wordleWins + tttWins + gamblingWins,
      memberCount: members.length
    };
  });

  return Object.entries(guildScores)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([name, data]) => ({ name, ...data }));
}

async function tagGuildMembers(sock, chatId, userJid, message, BOT_MARKER) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];

  if (!guildName) {
    return { success: false, message: "❌ You're not in any guild!" };
  }

  const guild = info.guilds[guildName];
  const members = Array.isArray(guild.members) ? guild.members : [];

  if (members.length === 0) {
    return { success: false, message: "❌ Guild has no members!" };
  }

  const announcement = `┏━━━━━━━━━━━━━━━┓
┃   🏰 ANNOUNCE   ┃
┗━━━━━━━━━━━━━━━┛

📢 *${guildName}*

${message || 'Guild members, gather!'}

━━━━━━━━━━━━━━━
👥 Members: ${members.length}`;

  try {
    await sock.sendMessage(chatId, {
      text: BOT_MARKER + announcement,
      mentions: members
    });
    return { success: true };
  } catch (err) {
    return { success: false, message: "❌ Failed to send message!" };
  }
}
//========================================

//==================this part handles guild points and activity rewards==================
function getUserGuild(userJid) {
  return globalGuildData.memberGuilds[userJid];
}

function addGuildBalance(guildName, amount) {
  const guild = globalGuildData.guilds[guildName];
  if (!guild) return;
  guild.balance = (guild.balance || 0) + amount;
  syncGuild(guildName);
}

function updateBoardProgress(guildName, targetType, amount) {
  const guild = globalGuildData.guilds[guildName];
  if (!guild || !guild.dailyBoard || !guild.dailyBoard.targets) return;

  // Check if reset needed
  if (Date.now() - guild.dailyBoard.lastUpdate > 86400000) {
    generateDailyBoard(guildName);
    return;
  }

  let boardUpdated = false;
  guild.dailyBoard.targets.forEach(t => {
    // Match EARN_ZENI for Merchant, CRAFT_ITEMS for Research, or specific monster IDs for Adventurer
    const isMatch = (t.type === targetType) || (t.type === 'CRAFT_ITEMS' && targetType === 'CRAFT');
    
    if (isMatch && t.current < t.count) {
      t.current = Math.min(t.count, t.current + amount);
      boardUpdated = true;
    }
  });

  if (boardUpdated) {
    const allDone = guild.dailyBoard.targets.every(t => t.current >= t.count);
    if (allDone && !guild.dailyBoard.completed) {
        guild.dailyBoard.completed = true;
        addGuildPoints(guildName, guild.dailyBoard.rewards.xp, "Board Completed");
        addGuildBalance(guildName, guild.dailyBoard.rewards.gold);
    }
    syncGuild(guildName);
  }
}

async function displayGuildBoard(sock, chatId, userJid) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];
  
  if (!guildName) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ You are not in a guild!" });
    return;
  }

  const guild = info.guilds[guildName];
  if (!guild.dailyBoard) guild.dailyBoard = { lastUpdate: 0, targets: [] };
  
  const lastUpdate = guild.dailyBoard.lastUpdate || 0;
  if (Date.now() - lastUpdate > 86400000 || !guild.dailyBoard.targets || guild.dailyBoard.targets.length === 0) {
    generateDailyBoard(guildName);
  }

  const archetype = GUILD_ARCHETYPES[guild.type] || GUILD_ARCHETYPES.ADVENTURER;
  const currencySymbol = botConfig.getCurrency().symbol;
  
  let msg = `📜 *${guildName.toUpperCase()} BOARD* 📜\n`;
  msg += `🏛️ Rank: ${guild.level} | Type: ${archetype.name}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  msg += `📍 *DAILY TARGETS:*\n`;
  
  guild.dailyBoard.targets.forEach((t, i) => {
    const progress = Math.min(100, Math.floor((t.current / t.count) * 100));
    const bar = "█".repeat(Math.floor(progress / 10)) + "░".repeat(10 - Math.floor(progress / 10));
    
    let targetDesc = t.label || t.type;
    let progressDesc = `${t.current}/${t.count}`;
    
    if (t.type === 'EARN_ZENI') {
        progressDesc = `${currencySymbol}${t.current.toLocaleString()} / ${currencySymbol}${t.count.toLocaleString()}`;
    }

    msg += `${i + 1}. ${targetDesc}\n`;
    msg += `   [${bar}] ${progress}% (${progressDesc})\n\n`;
  });
  
  if (guild.dailyBoard.completed) {
      msg += `✅ *STATUS:* COMPLETED!\n\n`;
  } else {
      msg += `🎁 *REWARDS (Shared):*\n`;
      msg += `💰 ${guild.dailyBoard.rewards.gold} Zeni\n`;
      msg += `⭐ ${guild.dailyBoard.rewards.xp} Guild XP\n\n`;
  }
  
  msg += `⏰ _Board refreshes daily._`;

  await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
}

function addGuildPoints(guildName, points, reason) {
  const info = globalGuildData;

  if (!info.guilds[guildName]) {
    return { success: false, message: "❌ Guild doesn't exist!" };
  }

  const guild = info.guilds[guildName];

  if (!guild.points) guild.points = 0;
  if (!guild.level) guild.level = 1;
  if (!guild.pointsHistory) guild.pointsHistory = [];

  guild.points += points;
  
  // 💡 LEVEL UP LOGIC
  const xpNeeded = guild.level * 1000;
  if (guild.points >= xpNeeded) {
    guild.points -= xpNeeded;
    guild.level++;
  }

  guild.pointsHistory.push({
    points,
    reason,
    timestamp: Date.now()
  });

  if (guild.pointsHistory.length > 50) {
    guild.pointsHistory = guild.pointsHistory.slice(-50);
  }

  syncGuild(guildName);

  return { success: true, newTotal: guild.points, level: guild.level };
}

function getGuildPoints(guildName) {
  const info = globalGuildData;

  if (!info.guilds[guildName]) {
    return null;
  }

  const guild = info.guilds[guildName];
  return {
    points: guild.points || 0,
    history: guild.pointsHistory || []
  };
}

function getGuildPointsLeaderboard(limit = 10) {
  const info = globalGuildData;

  return Object.entries(info.guilds)
    .map(([name, guild]) => ({
      name,
      points: guild.points || 0,
      members: guild.members.length
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

function awardPointsForActivity(userJid, activity) {
// ...
}

function upgradeGuildBuilding(userJid, buildingId) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];
  const guild = info.guilds[guildName];
  
  if (!guild || guild.owner !== userJid) {
    return { success: false, message: "❌ Only the Guild Master can upgrade buildings!" };
  }

  const upgrade = GUILD_UPGRADES[buildingId];

  if (!upgrade) {
    return { success: false, message: "❌ Invalid building ID!" };
  }

  const currentLevel = guild.buildings[buildingId]?.level || 0;
  if (currentLevel >= upgrade.maxLevel) {
    return { success: false, message: "❌ Building is already at maximum level!" };
  }

  const cost = upgrade.baseCost * (currentLevel + 1);
  if ((guild.points || 0) < cost) {
    return { success: false, message: `❌ Not enough Guild Points! Need: ${cost}, Have: ${guild.points}` };
  }

  // Deduct points and level up
  guild.points -= cost;
  if (!guild.buildings[buildingId]) guild.buildings[buildingId] = { level: 0, name: upgrade.name };
  guild.buildings[buildingId].level++;

  syncGuild(guildName);

  return {
    success: true,
    message: `┏━━━━━━━━━━━━━━━┓\n┃ ✨ UPGRADED!    ┃\n┗━━━━━━━━━━━━━━━┛\n\n*${upgrade.name}* is now Level ${guild.buildings[buildingId].level}!

✨ Benefit: ${upgrade.benefit}`
  };
}
//========================================

//==================this part handles guild vs guild challenges==================
function getChallengeTypes() {
  return CHALLENGE_TYPES;
}

function createChallenge(challengerJid, targetGuildName, type) {
  const info = globalGuildData;
  const challengerGuild = info.memberGuilds[challengerJid];

  if (!challengerGuild) {
    return { success: false, message: "❌ You must be in a guild to issue a challenge!" };
  }

  if (!CHALLENGE_TYPES[type]) {
    return { success: false, message: "❌ Invalid challenge type!" };
  }

  const targetGuild = Object.keys(info.guilds).find(
    g => g.toLowerCase() === targetGuildName.toLowerCase()
  );

  if (!targetGuild) {
    return { success: false, message: "❌ Target guild doesn't exist!" };
  }

  if (targetGuild === challengerGuild) {
    return { success: false, message: "❌ You can't challenge your own guild!" };
  }

  const challengeId = `${challengerGuild}_vs_${targetGuild}_${Date.now()}`;
  const challenge = {
    id: challengeId,
    challenger: challengerGuild,
    target: targetGuild,
    type: type,
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000)
  };

  activeChallenges.set(challengeId, challenge);
  saveChallenges();

  return {
    success: true,
    message: `┏━━━━━━━━━━━━━━━┓\n┃   ⚔️ CHALLENGE  ┃\n┗━━━━━━━━━━━━━━━┛\n\n🏰 *${challengerGuild}* has challenged *${targetGuild}* to a *${CHALLENGE_TYPES[type].name}*!\n\nTarget guild members must accept with: \n${botConfig.getPrefix()} guild accept challenge ${challengeId}`
  };
}

function getChallenges() {
  return Array.from(activeChallenges.values());
}
//========================================

// setup
loadGuilds();
loadChallenges();

module.exports = {
  loadGuilds,
  saveGuilds,
  loadChallenges,
  saveChallenges,

  getGuildInfo,
  createGuild,
  setGuildMotto,
  deleteGuild,
  joinGuild,
  leaveGuild,

  inviteToGuild,
  acceptGuildInvite,
  declineGuildInvite,
  checkGuildInvite,

  promoteToAdmin,
  demoteAdmin,
  kickFromGuild,
  setMemberTitle,
  getMemberTitle,
  getUserGuild,
  getGuild,
  getGuildMember,
  isGuildOwner,
  isGuildAdmin,

  getGuildLeaderboard,
  tagGuildMembers,

  addGuildPoints,
  addGuildBalance,
  updateBoardProgress,
  displayGuildBoard,
  getGuildPoints,
  getGuildPointsLeaderboard,
  awardPointsForActivity,

  getChallengeTypes,
  createChallenge,
  getChallenges,
  upgradeGuildBuilding,
  GUILD_UPGRADES,

  globalGuildData,
  activeChallenges
};

// Periodic sweeper for memory optimization
setInterval(() => {
    const now = Date.now();
    const invites = globalGuildData.guildInvites || {};
    let changed = false;
    for (const [jid, invite] of Object.entries(invites)) {
      if (now - invite.timestamp > 120000) {
        delete invites[jid];
        changed = true;
      }
    }
    if (changed) syncGuildSystem(); 
  }, 60000); // check every minute
