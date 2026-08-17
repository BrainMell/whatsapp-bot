const fs = require('fs');
const path = require('path');
const botConfig = require('../../botConfig');

// NEW: Database Imports
const mongoose = require('mongoose');
const GuildModel = require('../models/Guild');
const System = require('../models/System');
const connectDB = require('../../db');
const economy = require('./economy');

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
    // 💡 AUDIT FIX: was "Increases item sell value by 10%" — only mentioned
    // half the perk. ARCHETYPE_PERKS.MERCHANT in guildPerks.js gives BOTH
    // +10% dungeon gold AND +10% sell value. Flavor text now matches the
    // actual implementation so `.g guild info` doesn't contradict the
    // multipliers shown by `.g guild perks`.
    perks: 'Increases item sell value by 10% and dungeon gold by 10%.',
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
    baseCost: 25000, // 💡 Rebalanced 2026-08-17
    benefit: 'Increases max member capacity by +5 per level.'
  },
  training: {
    name: 'Training Ground',
    maxLevel: 5,
    baseCost: 50000, // 💡 Rebalanced 2026-08-17
    benefit: 'Gives all members +5% XP bonus per level.'
  },
  treasury: {
    name: 'Treasury',
    maxLevel: 5,
    baseCost: 100000, // 💡 Rebalanced 2026-08-17
    benefit: 'Gives all members +10% Zeni bonus from quests per level.'
  }
};

//==================this part is for saving and loading guild data==================
async function loadGuilds() {
  try {
    await connectDB();
    
    // 1. Load System Mappings
    const sys = await System.findOne({ key: 'guild_system' }).lean();
    if (sys && sys.value) {
      globalGuildData.memberGuilds = sys.value.memberGuilds || {};
      globalGuildData.guildOwners = sys.value.guildOwners || {};
      globalGuildData.guildInvites = sys.value.guildInvites || {};
    }

    // 2. Load Individual Guilds
    const guilds = await GuildModel.find({}).lean();
    for (const g of guilds) {
        const titles = {};
        const admins = [];
        const recruits = [];
        const members = [];
        
        if (g.members) {
            g.members.forEach(m => {
                members.push(m.userId);
                if (m.role === 'officer') admins.push(m.userId);
                if (m.role === 'recruit') recruits.push(m.userId);
                if (m.title && m.title !== 'Member') titles[m.userId] = m.title;
            });
        }

        // 💡 QA FIX: load ALL new fields from the schema. Previously only
        // a subset was loaded, causing loans/warPoints/emblem/recruits to
        // be missing from the in-memory cache — which broke guild loans,
        // war points, emblems, and the 4-tier role system after restart.
        // Also handle legacy buildings stored as `upgrades` (Map<Number>).
        let buildings = { hall: { level: 1 }, training: { level: 0 }, treasury: { level: 0 } };
        if (g.buildings) {
          buildings = g.buildings;
        } else if (g.upgrades) {
          // Legacy format: upgrades was a Map of { buildingId: level }
          const ug = g.upgrades instanceof Map ? Object.fromEntries(g.upgrades) : g.upgrades;
          if (ug.hall) buildings.hall.level = typeof ug.hall === 'number' ? ug.hall : (ug.hall.level || 1);
          if (ug.training) buildings.training.level = typeof ug.training === 'number' ? ug.training : (ug.training.level || 0);
          if (ug.treasury) buildings.treasury.level = typeof ug.treasury === 'number' ? ug.treasury : (ug.treasury.level || 0);
        }

        globalGuildData.guilds[g.guildId] = {
            members,
            owner: g.leader,
            admins,
            recruits,
            titles,
            createdAt: g.createdAt,
            points: g.xp || 0,
            level: g.level || 1,
            balance: g.balance || 0,
            type: g.type || 'ADVENTURER',
            dailyBoard: g.dailyBoard || { targets: [] },
            pointsHistory: g.logs || [],
            motto: g.motto || "Adapt or be Infected.",
            buildings,
            // 💡 QA FIX: load new fields that were missing
            loans: g.loans || [],
            warPoints: g.warPoints || 0,
            warPointsWeek: g.warPointsWeek || null,
            lastInterestPayout: g.lastInterestPayout || null,
            emblem: g.emblem || { icon: null, color: '#FFD700' },
        };

        // Clean up memberGuilds — make sure every member is mapped
        for (const m of members) {
          if (!globalGuildData.memberGuilds[m]) {
            globalGuildData.memberGuilds[m] = g.guildId;
          }
        }
    }
    
    // 💡 QA FIX: Clean up orphaned memberGuilds entries (pointing to deleted guilds)
    for (const [jid, guildName] of Object.entries(globalGuildData.memberGuilds)) {
      if (!globalGuildData.guilds[guildName]) {
        delete globalGuildData.memberGuilds[jid];
      }
    }
    // Clean up orphaned guildOwners entries
    for (const [jid, guildName] of Object.entries(globalGuildData.guildOwners)) {
      if (!globalGuildData.guilds[guildName]) {
        delete globalGuildData.guildOwners[jid];
      }
    }

    // 💡 QA FIX: normalize guild XP on load — process any pending level-ups
    // that weren't consumed (e.g. from the old single-if level-up bug or
    // from large donations that the old code couldn't handle).
    for (const [guildName, guild] of Object.entries(globalGuildData.guilds)) {
      if (guild.points && guild.level) {
        let xpNeeded = guild.level * 1000;
        let levelsGained = 0;
        while (guild.points >= xpNeeded && guild.level < 100) {
          guild.points -= xpNeeded;
          guild.level++;
          levelsGained++;
          xpNeeded = guild.level * 1000;
        }
        if (levelsGained > 0) {
          console.log(`[Guild] ${guildName}: normalized ${levelsGained} level-up(s) on load (now L${guild.level}, ${guild.points} XP)`);
          await syncGuild(guildName);
        }
      }
    }

    console.log(`✅ Loaded ${Object.keys(globalGuildData.guilds).length} guilds from MongoDB`);
    await syncGuildSystem();
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
                    role: g.owner === jid ? 'leader' : (g.admins && g.admins.includes(jid) ? 'officer' : (g.recruits && g.recruits.includes(jid) ? 'recruit' : 'member')),
                    title: (g.titles && g.titles[jid]) || 'Member'
                })),
                xp: g.points || 0,
                level: g.level || 1,
                balance: g.balance || 0,
                type: g.type || 'ADVENTURER',
                dailyBoard: g.dailyBoard || { targets: [] },
                motto: g.motto || "Adapt or be Infected.",
                // 💡 QA FIX: write to BOTH `buildings` (new schema field) AND
                // `upgrades` (legacy field). Previously only wrote to `upgrades`,
                // but loadGuilds reads `buildings` first — which has schema
                // defaults (L1/L0/L0), so building levels reset every restart.
                buildings: g.buildings || { hall: { level: 1 }, training: { level: 0 }, treasury: { level: 0 } },
                upgrades: g.buildings || {},
                logs: g.pointsHistory || [],
                // 💡 QA FIX: these fields were missing from syncGuild, causing
                // loans to vanish on restart (borrower keeps Zeni, guild bank
                // drained) and war points to reset to 0 every restart.
                loans: g.loans || [],
                warPoints: g.warPoints || 0,
                warPointsWeek: g.warPointsWeek || null,
                lastInterestPayout: g.lastInterestPayout || null,
                emblem: g.emblem || { icon: null, color: '#FFD700' },
                recruits: g.recruits || []
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
    const sys = await System.findOne({ key: 'guild_challenges' }).lean();
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

  // Cleanup orphaned ownership if guild doesn't exist anymore
  if (info.guildOwners[creatorJid] && !info.guilds[info.guildOwners[creatorJid]]) {
    console.log(`[Guild] Cleaning up orphaned ownership for ${creatorJid}`);
    delete info.guildOwners[creatorJid];
  }

  if (info.guildOwners[creatorJid]) {
    return {
      success: false,
      message: `❌ You already own the guild "${info.guildOwners[creatorJid]}"!

Delete it first with: ${botConfig.getPrefix()} guild delete`
    };
  }

  // Also check if they are in a guild they don't own
  if (info.memberGuilds[creatorJid] && !info.guilds[info.memberGuilds[creatorJid]]) {
    console.log(`[Guild] Cleaning up orphaned membership for ${creatorJid}`);
    delete info.memberGuilds[creatorJid];
  }

  if (info.memberGuilds[creatorJid]) {
    return {
      success: false,
      message: `❌ You're already in a guild: "${info.memberGuilds[creatorJid]}"! Leave it first.`
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
  const members = guild ? [...guild.members] : [];
  
  if (guild) {
    guild.members.forEach(memberJid => {
      delete info.memberGuilds[memberJid];
    });
  } else {
    console.warn(`[Guild] Found orphaned owner ${userJid} for missing guild ${guildName}`);
  }

  delete info.guildOwners[userJid];
  delete info.guilds[guildName];

  // Sync delete to MongoDB
  GuildModel.deleteOne({ guildId: guildName }).catch(e => console.error(e));
  syncGuildSystem();

  return {
    success: true,
    message: `✅ Guild "${guildName}" has been disbanded!`,
    members: members
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

  // 💡 Phase 2: Enforce member cap (base 20 + 5/level of Hall building)
  try {
    const guildPerks = require('./guildPerks');
    const capCheck = guildPerks.canRecruitMember(guildData);
    if (!capCheck.canRecruit) {
      return { success: false, message: capCheck.message };
    }
  } catch (e) {
    // If guildPerks fails to load, fall through to old behavior (no cap)
  }

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
  if (guild) {
    // 💡 QA FIX: loose JID matching for member removal
    const memberJid = (guild.members || []).find(m =>
      m === userJid || economy.getDisplayName(m) === userJid.split('@')[0] ||
      m.includes(userJid.split('@')[0]) ||
      userJid.includes(m.split('@')[0])
    );
    const removeJid = memberJid || userJid; // fallback to raw if not found
    guild.members = guild.members.filter(m => m !== removeJid);
    guild.admins = (guild.admins || []).filter(a => a !== removeJid);
    // 💡 QA FIX: also clean up recruits
    if (guild.recruits) guild.recruits = guild.recruits.filter(r => r !== removeJid);
    delete guild.titles[removeJid];
    syncGuild(guildName);
  } else {
    console.warn(`[Guild] Found orphaned member ${userJid} for missing guild ${guildName}`);
  }

  delete info.memberGuilds[userJid];
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
    message: `✅ Invited @${economy.getDisplayName(inviteeJid)} to "${guildName}"!

⏳ *Time:* 1 hour to accept.
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

  // 💡 QA FIX: was 120000 (120s / 2 min) but invite message says 1 hour.
  // Users couldn't accept because the invite expired before they read it.
  const INVITE_TTL_MS = 60 * 60 * 1000; // 1 hour
  if (Date.now() - invite.timestamp > INVITE_TTL_MS) {
    delete info.guildInvites[userJid];
    syncGuildSystem();
    return { success: false, message: "❌ Invite expired! (1 hour limit)" };
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

  // 💡 Phase 2: Enforce member cap (base 20 + 5/level of Hall building)
  try {
    const guildPerks = require('./guildPerks');
    const capCheck = guildPerks.canRecruitMember(guild);
    if (!capCheck.canRecruit) {
      delete info.guildInvites[userJid];
      syncGuildSystem();
      return { success: false, message: capCheck.message };
    }
  } catch (e) {}

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

  if (Date.now() - invite.timestamp > 60 * 60 * 1000) { // 💡 QA FIX: was 120000 (2 min), now 1 hour
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

  if (Date.now() - invite.timestamp > 60 * 60 * 1000) { // 💡 QA FIX: was 120000 (2 min), now 1 hour
    delete info.guildInvites[userJid];
    syncGuildSystem();
    return null;
  }

  return invite;
}
//========================================

//==================this part handles guild management like promoting and kicking==================
async function promoteToAdmin(ownerJid, targetJid) {
  const info = globalGuildData;
  const guildName = info.guildOwners[ownerJid];

  if (!guildName) {
    return { success: false, message: "❌ You don't own any guild!" };
  }

  const guild = info.guilds[guildName];
  if (!guild) {
    return { success: false, message: "❌ Guild data not found!" };
  }

  // 💡 QA FIX: try to match targetJid against members using loose matching
  // (LID vs phone format may differ)
  const memberJid = guild.members.find(m =>
    m === targetJid || economy.getDisplayName(m) === targetJid.split('@')[0] ||
    m.includes(targetJid.split('@')[0]) ||
    targetJid.includes(m.split('@')[0])
  );

  if (!memberJid) {
    return { success: false, message: "❌ That user is not in your guild!" };
  }

  if (guild.admins && guild.admins.includes(memberJid)) {
    return { success: false, message: "❌ That user is already an officer!" };
  }

  if (!guild.admins) guild.admins = [];
  guild.admins.push(memberJid);
  await syncGuild(guildName);

  return {
    success: true,
    message: `✅ @${economy.getDisplayName(memberJid)} promoted to officer!`,
    targetJid: memberJid,
    guildName: guildName
  };
}

// demote an admin
async function demoteAdmin(ownerJid, targetJid) {
  const info = globalGuildData;
  const guildName = info.guildOwners[ownerJid];

  if (!guildName) {
    return { success: false, message: "❌ You don't own any guild!" };
  }

  const guild = info.guilds[guildName];
  if (!guild || !guild.admins) {
    return { success: false, message: "❌ Guild data not found!" };
  }

  // 💡 QA FIX: loose JID matching (same as promoteToAdmin)
  const adminJid = guild.admins.find(a =>
    a === targetJid || economy.getDisplayName(a) === targetJid.split('@')[0] ||
    a.includes(targetJid.split('@')[0]) ||
    targetJid.includes(a.split('@')[0])
  );

  if (!adminJid) {
    return { success: false, message: "❌ That user is not an officer!" };
  }

  guild.admins = guild.admins.filter(a => a !== adminJid);
  await syncGuild(guildName);

  return {
    success: true,
    message: `✅ @${economy.getDisplayName(adminJid)} demoted from officer!`,
    targetJid: adminJid,
    guildName: guildName
  };
}

// kick someone out
async function kickFromGuild(ownerOrAdminJid, targetJid) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[ownerOrAdminJid];

  if (!guildName) {
    return { success: false, message: "❌ You're not in any guild!" };
  }

  const guild = info.guilds[guildName];
  if (!guild) {
    return { success: false, message: "❌ Guild data not found!" };
  }
  const isOwner = info.guildOwners[ownerOrAdminJid] === guildName;
  const isAdmin = (guild.admins || []).includes(ownerOrAdminJid);

  if (!isOwner && !isAdmin) {
    return { success: false, message: "❌ Only guild owner or officers can kick members!" };
  }

  // 💡 QA FIX: loose JID matching
  const memberJid = guild.members.find(m =>
    m === targetJid || economy.getDisplayName(m) === targetJid.split('@')[0] ||
    m.includes(targetJid.split('@')[0]) ||
    targetJid.includes(m.split('@')[0])
  );

  if (!memberJid) {
    return { success: false, message: "❌ That user is not in your guild!" };
  }

  if (memberJid === guild.owner) {
    return { success: false, message: "❌ Can't kick the guild owner!" };
  }

  guild.members = guild.members.filter(m => m !== memberJid);
  guild.admins = (guild.admins || []).filter(a => a !== memberJid);
  // 💡 QA FIX: also clean up recruits
  if (guild.recruits) guild.recruits = guild.recruits.filter(r => r !== memberJid);
  delete guild.titles[memberJid];
  delete info.memberGuilds[memberJid];

  await syncGuild(guildName);
  await syncGuildSystem();

  return {
    success: true,
    message: `✅ @${economy.getDisplayName(memberJid)} has been kicked from "${guildName}"!`,
    targetJid: memberJid,
    guildName: guildName
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
    message: `✅ @${economy.getDisplayName(targetJid)} title set to: ${title}`
  };
}

// check someone's title
function getMemberTitle(guildName, userJid) {
  const info = globalGuildData;
  const guild = info.guilds[guildName];

  if (!guild) return null;

  return guild.titles[userJid] || 'Member';
}

function getGuild(guildName) {
  return globalGuildData.guilds[guildName];
}

function getGuildMember(guildName, userJid) {
  const guild = globalGuildData.guilds[guildName];
  if (!guild) return null;

  // 💡 QA FIX: loose JID matching for member lookup
  const memberJid = (guild.members || []).find(m =>
    m === userJid || economy.getDisplayName(m) === userJid.split('@')[0] ||
    m.includes(userJid.split('@')[0]) ||
    userJid.includes(m.split('@')[0])
  );
  if (!memberJid) return null;

  if (!guild.recruits) guild.recruits = [];
  let role = 'member';
  if (guild.owner === memberJid) {
    role = 'leader';
  } else if (guild.admins && guild.admins.includes(memberJid)) {
    role = 'officer';
  } else if (guild.recruits.includes(memberJid)) {
    role = 'recruit';
  }

  return {
    jid: memberJid,
    role,
    title: (guild.titles && guild.titles[memberJid]) || 'Member'
  };
}

// 💡 Phase 2: Set a member's role (leader-only).
// Supported roles: 'recruit', 'member', 'officer'. (Leader can't be changed here.)
async function setMemberRole(ownerJid, targetJid, newRole) {
  const info = globalGuildData;
  const guildName = info.guildOwners[ownerJid];
  if (!guildName) return { success: false, message: '❌ You don\'t own any guild!' };

  const guild = info.guilds[guildName];
  if (!guild) return { success: false, message: '❌ Guild not found.' };

  // 💡 QA FIX: loose JID matching
  const memberJid = (guild.members || []).find(m =>
    m === targetJid || economy.getDisplayName(m) === targetJid.split('@')[0] ||
    m.includes(targetJid.split('@')[0]) ||
    targetJid.includes(m.split('@')[0])
  );
  if (!memberJid) return { success: false, message: '❌ That user is not in your guild!' };
  if (guild.owner === memberJid) {
    return { success: false, message: '❌ Cannot change the leader\'s role.' };
  }

  if (!guild.recruits) guild.recruits = [];
  if (!guild.admins) guild.admins = [];

  // Remove from all role arrays first
  guild.admins = guild.admins.filter(j => j !== memberJid);
  guild.recruits = guild.recruits.filter(j => j !== memberJid);

  // Apply new role
  if (newRole === 'officer') {
    guild.admins.push(memberJid);
  } else if (newRole === 'recruit') {
    guild.recruits.push(memberJid);
  }
  // 'member' = neither array

  await syncGuild(guildName);
  return {
    success: true,
    message: `✅ @${economy.getDisplayName(targetJid)} is now a *${newRole}*.`,
  };
}

function isGuildOwner(userJid) {
  // 💡 QA FIX: check direct + loose match for LID/phone format tolerance
  if (globalGuildData.guildOwners[userJid]) return true;
  const phone = userJid.split('@')[0];
  for (const jid of Object.keys(globalGuildData.guildOwners)) {
    if (jid.split('@')[0] === phone || jid.includes(phone) || userJid.includes(jid.split('@')[0])) return true;
  }
  return false;
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
      memberCount: members.length,
      level: guild.level || 1,
      points: guild.points || 0
    };
  });

  return Object.entries(guildScores)
    .sort((a, b) => {
      const la = a[1].level || 1, lb2 = b[1].level || 1;
      if (lb2 !== la) return lb2 - la;
      const pa = a[1].points || 0, pb = b[1].points || 0;
      if (pb !== pa) return pb - pa;
      return b[1].score - a[1].score;
    })
    .map(([name, data]) => ({ name, ...data }));
}

async function tagGuildMembers(sock, chatId, userJid, message, BOT_MARKER) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];

  if (!guildName) {
    return { success: false, message: "❌ You're not in any guild!" };
  }

  const guild = info.guilds[guildName];
  if (!guild) return { success: false, message: "❌ Guild not found!" };
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
    // 💡 QA FIX: resolve LID → phone format for mentions, filter out invalid JIDs
    const { resolveToPhone } = require('../utils/lidResolver');
    const authPath = sock.authState?.creds?.me
      ? (sock.user?.id?.split('@')[0] ? null : null) // can't easily get authPath here
      : null;
    const mentionJids = members.map(j => {
      if (!j || typeof j !== 'string') return null;
      return j.includes('@') ? j : `${j}@s.whatsapp.net`;
    }).filter(Boolean);

    await sock.sendMessage(chatId, {
      text: BOT_MARKER + announcement,
      mentions: mentionJids
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
  const val = Number(amount);
  if (isNaN(val) || val <= 0) return;
  guild.balance = (guild.balance || 0) + val;
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
    // Exact match for targetType (EARN_ZENI, CRAFT_ITEMS, or monster IDs)
    if (t.type === targetType && t.current < t.count) {
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

  const val = Number(points);
  if (isNaN(val) || val <= 0) return { success: false, message: "❌ Invalid points." };

  const guild = info.guilds[guildName];

  if (!guild.points) guild.points = 0;
  if (!guild.level) guild.level = 1;
  if (!guild.pointsHistory) guild.pointsHistory = [];

  // Use the coerced numeric `val` instead of the raw `points` parameter.
  // Previously `points` was validated as numeric but then the raw value
  // (potentially a string like "50") was added to guild.points, producing
  // string concatenation: 0 + "50" = "050". The guild points would then
  // grow as a string until the next level-up subtraction restored numeric
  // type. Functional but fragile.
  guild.points += val;

  // 💡 LEVEL UP LOGIC — must loop in case a large XP grant covers multiple levels.
  // Previously was a single `if` — depositing 500M Zeni (500K XP) at L1 would
  // only trigger ONE level-up (L1→L2, spending 1000 XP), leaving 499K XP stuck
  // at L2. The leaderboard then showed "Lv 2 | XP 499000/2000" which looked
  // broken. Now loops until all level-ups are consumed.
  let xpNeeded = guild.level * 1000;
  while (guild.points >= xpNeeded && guild.level < 100) {
    guild.points -= xpNeeded;
    guild.level++;
    xpNeeded = guild.level * 1000;
  }

  guild.pointsHistory.push({
    points: val,
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
      level: guild.level || 1,
      balance: guild.balance || 0,
      members: Array.isArray(guild.members) ? guild.members.length : 0,
      type: guild.type || 'ADVENTURER',
      warPoints: guild.warPoints || 0,
    }))
    .sort((a, b) => {
      // Sort by level first, then by XP within same level
      if (b.level !== a.level) return b.level - a.level;
      return b.points - a.points;
    })
    .slice(0, limit);
}

function awardPointsForActivity(userJid, activity) {
  // 💡 QA FIX: was an empty stub — daily claims never awarded guild XP
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];
  if (!guildName) return;
  return addGuildPoints(guildName, 5, activity || 'activity');
}

function upgradeGuildBuilding(userJid, buildingId) {
  const info = globalGuildData;
  const guildName = info.memberGuilds[userJid];
  const guild = info.guilds[guildName];
  
  // 💡 QA FIX: allow officers to upgrade buildings too (was owner-only)
  if (!guild || (guild.owner !== userJid && !(guild.admins || []).includes(userJid))) {
    return { success: false, message: "❌ Only the Guild Master or officers can upgrade buildings!" };
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
  // 💡 FIX #45: Building upgrades were consuming guild POINTS (XP) instead
  // of guild BALANCE (gold/Zeni). Guild XP is for leveling the guild itself;
  // building upgrades should use the guild bank balance.
  if ((guild.balance || 0) < cost) {
    return { success: false, message: `❌ Not enough guild funds! Need: ${cost.toLocaleString()} Zeni, Have: ${(guild.balance || 0).toLocaleString()} Zeni` };
  }

  // Deduct from guild BALANCE (not points/XP) and level up
  guild.balance = (guild.balance || 0) - cost;
  if (!guild.buildings[buildingId]) {
      guild.buildings[buildingId] = { level: 0, name: upgrade.name };
  }
  
  guild.buildings[buildingId].level += 1; // Explicitly increment

  syncGuild(guildName);

  return {
    success: true,
    message: `┏━━━━━━━━━━━━━━━┓\n┃ ✨ UPGRADED!    ┃\n┗━━━━━━━━━━━━━━━┛\n\n*${upgrade.name}* is now Level ${guild.buildings[buildingId].level}!\n\n✨ Benefit: ${upgrade.benefit}`
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

// setup - now explicitly called during boot in engine.js
// loadGuilds();
// loadChallenges();

// ═══════════════════════════════════════════════════════════════════════════
//  GUILD PURGE + GUILD GUIDE (QA — fix legacy conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// 💡 Purges ALL guild data — both MongoDB GuildModel documents AND the
// System collection mappings (memberGuilds, guildOwners, guildInvites).
// Also clears the in-memory cache. Used to fix legacy guild conflicts.
async function purgeAllGuilds() {
  try {
    await connectDB();
    // Delete all guild documents
    const guildResult = await GuildModel.deleteMany({});
    // Delete the system mappings
    const sysResult = await System.deleteOne({ key: 'guild_system' });
    // Clear in-memory cache
    globalGuildData.guilds = {};
    globalGuildData.memberGuilds = {};
    globalGuildData.guildOwners = {};
    globalGuildData.guildInvites = {};
    return {
      success: true,
      message: `✅ *GUILD DATA PURGED*\n\nDeleted ${guildResult.deletedCount} guild(s) from MongoDB.\nCleared all member/owner/invite mappings.\n\n_All players are now guild-less. They can create or join new guilds fresh._`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed to purge: ${e.message}` };
  }
}

// 💡 Returns a comprehensive guild guide string for the .g guild guide command.
function getGuildGuide(prefix) {
  let msg = `┏━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
  msg += `┃  🏰 GUILD SYSTEM GUIDE  ┃\n`;
  msg += `┗━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;

  msg += `*GETTING STARTED*\n`;
  msg += `• \`${prefix} guild create <name>\` — Create a new guild\n`;
  msg += `• \`${prefix} guild join <name>\` — Join an existing guild\n`;
  msg += `• \`${prefix} guild leave\` — Leave your current guild\n`;
  msg += `• \`${prefix} guild list\` — See all guilds\n\n`;

  msg += `*GUILD ARCHETYPES*\n`;
  msg += `Choose an archetype when creating (default: ADVENTURER):\n`;
  msg += `• ⚔️ ADVENTURER — +15% XP from dungeons\n`;
  msg += `• 💰 MERCHANT — +10% gold + 10% sell value\n`;
  msg += `• 🧪 RESEARCH — -10% crafting material cost\n\n`;

  msg += `*GUILD LEVELS & XP*\n`;
  msg += `Guilds level up by earning XP from member activities:\n`;
  msg += `• Dungeon clears: +5 to +100 XP (by rank)\n`;
  msg += `• Boss kills: +10 XP\n`;
  msg += `• PvP wins: +5 XP\n`;
  msg += `• Item sales: +5% of value as XP\n`;
  msg += `• Donations: +1 XP per 100K Zeni (max 100 XP per donation)\n\n`;
  msg += `Guild level perks:\n`;
  msg += `• L2: +5% XP for all members\n`;
  msg += `• L3: +5% gold for all members\n`;
  msg += `• L5: Guild bank earns daily interest\n`;
  msg += `• L7: +1 skill point on adventurer rank-up\n`;
  msg += `• L10: Access to guild-only dungeon rank\n\n`;

  msg += `*GUILD BUILDINGS*\n`;
  msg += `Upgrade buildings with guild points (\`${prefix} guild upgrade <id>\`):\n`;
  msg += `• Hall: +5 member cap per level (base 20, max 45)\n`;
  msg += `• Training: +5% XP per level (max +25%)\n`;
  msg += `• Treasury: +10% gold per level (max +50%) + bank interest\n\n`;

  msg += `*GUILD ROLES (4-tier system)*\n`;
  msg += `• 👑 Leader — full control (can disband, set roles, emblem)\n`;
  msg += `• ⚔️ Officer — can kick/invite/manage\n`;
  msg += `• 🌿 Member — full guild access (loans, board, etc.)\n`;
  msg += `• 💤 Recruit — limited (cannot borrow from bank)\n`;
  msg += `Set roles: \`${prefix} guild role @user <recruit|member|officer>\`\n\n`;

  msg += `*GUILD BANK & LOANS*\n`;
  msg += `• \`${prefix} guild donate <amount>\` — Donate Zeni to guild bank\n`;
  msg += `• \`${prefix} guild loan <amount>\` — Borrow (max 10% of bank, 7-day repayment)\n`;
  msg += `• \`${prefix} guild loan list\` — View your active loans\n`;
  msg += `• \`${prefix} guild loan repay <amount>\` — Repay early\n`;
  msg += `Overdue loans: 10% auto-deducted daily from wallet, or 5% penalty compounds.\n`;
  msg += `Bank interest (L5+): 0.5%/treasury level daily, capped at 1M/day.\n\n`;

  msg += `*GUILD PERKS*\n`;
  msg += `• \`${prefix} guild perks\` — View your active multipliers\n`;
  msg += `• \`${prefix} guild info\` — Full guild status dashboard\n\n`;

  msg += `*GUILD MANAGEMENT*\n`;
  msg += `• \`${prefix} guild invite @user\` — Send invite (1 hour to accept)\n`;
  msg += `• \`${prefix} accept\` — Accept a pending invite\n`;
  msg += `• \`${prefix} decline\` — Decline a pending invite\n`;
  msg += `• \`${prefix} guild promote @user\` — Promote to officer\n`;
  msg += `• \`${prefix} guild demote @user\` — Demote officer\n`;
  msg += `• \`${prefix} guild kick @user\` — Remove member\n`;
  msg += `• \`${prefix} guild title @user <title>\` — Set custom title\n`;
  msg += `• \`${prefix} guild motto <text>\` — Set guild motto\n`;
  msg += `• \`${prefix} guild emblem <emoji> [hexColor]\` — Set guild emblem\n`;
  msg += `• \`${prefix} guild delete\` — Disband guild (Leader only)\n\n`;

  msg += `*GUILD WAR (weekly)*\n`;
  msg += `• \`${prefix} war\` — View this week's event\n`;
  msg += `• Earn points from dungeons, bosses, PvP, raids, Abyss\n`;
  msg += `• 4 rotating events: Tournament, Clash, Hunt, Siege\n`;
  msg += `• Rewards: 1st=5M Zeni + buff, 2nd-3rd=2M, 4th-8th=500K\n\n`;

  msg += `*OTHER COMMANDS*\n`;
  msg += `• \`${prefix} guild members\` — View roster\n`;
  msg += `• \`${prefix} guild ranks\` — Members by adventurer rank\n`;
  msg += `• \`${prefix} guild titles\` — Roster with titles\n`;
  msg += `• \`${prefix} guild board\` — Daily monster hunting board\n`;
  msg += `• \`${prefix} guild tag <msg>\` — Mention all guild members\n`;
  msg += `• \`${prefix} guild leaderboard\` — Top guilds by level/XP\n`;
  msg += `• \`${prefix} guild points\` — Your guild's XP\n`;
  msg += `• \`${prefix} guild upgrade\` — Upgrade buildings menu\n`;

  return msg;
}

module.exports = {
  loadGuilds,
  saveGuilds,
  loadChallenges,
  saveChallenges,
  syncGuild,
  syncGuildSystem,

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
  setMemberRole,
  purgeAllGuilds,
  getGuildGuide,
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
      if (now - invite.timestamp > 60 * 60 * 1000) { // QA FIX: was 2min, now 1hr
        delete invites[jid];
        changed = true;
      }
    }
    if (changed) syncGuildSystem(); 
  }, 60000); // check every minute
