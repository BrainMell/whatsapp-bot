// yo this is the economy file, handles all the bread and getZENI()
const fs = require('fs');
const botConfig = require('../../botConfig');
const classSystem = require('./classSystem');

// NEW: Database Imports
const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../../db');

// currency shi
const getCurrency = () => botConfig.getCurrency();
const getZENI = () => getCurrency().symbol;
const getPlaceholderPFP = () => botConfig.getAssetPath("placeholder.png");
const STARTING_BALANCE = 1000;
const DAILY_REWARD = 500;

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

// CACHE: Stores all active user data in memory for instant access
const economyData = new Map();

// Debounced saving to prevent MongoDB flooding
const pendingSaves = new Set();
let saveTimer = null;

function scheduleSave(userId) {
  pendingSaves.add(userId);
  if (!saveTimer) {
    saveTimer = setTimeout(async () => {
      const toSave = [...pendingSaves];
      pendingSaves.clear();
      saveTimer = null;
      for (const id of toSave) {
        await saveUser(id);
      }
    }, 500); // flush every 500ms
  }
}

//==================this part handles all the data loading and saving==================
async function loadEconomy() {
  try {
    await connectDB();
    const users = await User.find({}).lean();
    
    for (const user of users) {
      // With lean() it's already a plain object.
      // Convert Map fields to plain objects if they are somehow still Maps.
      if (user.inventory && user.inventory instanceof Map) {
          user.inventory = Object.fromEntries(user.inventory);
      }
      if (user.skills && user.skills instanceof Map) {
          user.skills = Object.fromEntries(user.skills);
      }
      if (user.portfolio && user.portfolio instanceof Map) {
          user.portfolio = Object.fromEntries(user.portfolio);
      }

      economyData.set(user.userId, user);
    }
    console.log(`✅ Loaded ${users.length} users from MongoDB`);
  } catch (err) {
    console.error("Error loading economy from DB:", err.message);
  }
}

// Deprecated: No longer writes to file. Used as a placeholder for old calls.
function saveEconomy() {
    // No-op: We now save specific users asynchronously
}

// NEW: Save specific user to MongoDB (Background Sync)
async function saveUser(userId) {
    const data = economyData.get(userId);
    if (!data) return;

    try {
        await User.findOneAndUpdate(
            { userId: userId },
            { $set: data },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        console.error(`❌ Failed to save user ${userId}:`, err.message);
    }
}

// 💡 Force-reload a user from MongoDB, overwriting the in-memory cache.
// Used when an external script modifies the DB directly (e.g. stat point
// grants, enhancement recovery) and the bot's in-memory cache is stale.
// Without this, any saveUser() call would overwrite the DB change with
// the stale in-memory value.
async function reloadUserFromDB(userId) {
    const resolvedId = resolveJidHelper(userId);
    try {
        const dbUser = await User.findOne({ userId: resolvedId });
        if (!dbUser) return false;
        const userData = dbUser.toObject();
        economyData.set(resolvedId, userData);
        console.log(`🔄 Reloaded user ${resolvedId} from DB (statPoints: ${userData?.progression?.statPoints})`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to reload user ${resolvedId} from DB:`, err.message);
        return false;
    }
}
//========================================

//==================this part handles new players and thier classes==================
function resolveJidHelper(userId) {
  if (!userId) return userId;
  try {
    const lidResolver = require('../utils/lidResolver');
    return lidResolver.resolveJid(userId);
  } catch (e) {
    console.error("Error resolving JID in resolveJidHelper:", e.message);
    return userId;
  }
}

function isRegistered(userId) {
  const resolvedId = resolveJidHelper(userId);
  const user = economyData.get(resolvedId);
  return user && user.registered === true;
}

function registerUser(userId, nickname) {
  const resolvedId = resolveJidHelper(userId);
  if (isRegistered(resolvedId)) {
    return { success: false, message: `❌ *ALREADY REGISTERED*\n\n🎮 You're already in the game, ${nickname}!` };
  }

  // pick a random class for the newbie
  const classSystem = require('./classSystem');
  const starterClass = classSystem.getRandomStarterClass();

  const existingUser = economyData.get(resolvedId);
  const profile = existingUser?.profile || {
    whatsappName: null,
    nickname: nickname,
    notes: [],
    memories: {
      likes: [],
      dislikes: [],
      hobbies: [],
      personal: [],
      other: []
    },
    stats: {
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      messageCount: 0
    },
    relationships: {}
  };
  profile.nickname = nickname;

  const userData = {
    userId: resolvedId, // Ensure userId is stored in the object
    wallet: STARTING_BALANCE,
    bank: 0,
    lastDaily: 0,
    lastRob: 0,
    jailUntil: 0,
    prisonUntil: 0,
    robberyStrikes: 0,
    lastClassChange: 0,
    registered: true,
    nickname: nickname,
    
    // quest gold
    questGold: 0,
    
    // rpg stats and shi
    class: starterClass.id,
    adventurerRank: 'F',
    questsCompleted: 0,
    questsWon: 0,
    questsFailed: 0,
    pvpWins: 0,
    pvpLosses: 0,
    borrowedSkills: [],
    
    // buffs from the shop
    statBonuses: {
      hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0
    },
    
    // NEW: Proper inventory system
            inventory: {},
            equipment: {
                main_hand: null,
                off_hand: null,
                armor: null,
                helmet: null,
                boots: null,
                ring: null,
                amulet: null,
                cloak: null,
                gloves: null
            },
            // 💡 FINANCIAL & PROFESSION SYSTEM
            professions: {
                mining: { level: 1, xp: 0 },
                crafting: { level: 1, xp: 0 }
            },
            completedTrials: [],
            portfolio: {}, // Stocks
            investments: [], // Fixed Deposits
            membership: {
                tier: 'BASIC', // BASIC, PREMIUM, DIAMOND
                expires: 0
            },
            gamblingProfile: {
              dayKey: getTodayKey(),
              roundsToday: 0,
              entryWalletToday: STARTING_BALANCE,
              withdrawnToday: 0,
              netToday: 0
            },
            skills: {},
            profile: profile,
    
    // NEW: Sprite assignment
    spriteIndex: Math.floor(Math.random() * 100)
  };
  
  economyData.set(resolvedId, userData);
  
  // log the bonus
  logTransaction(resolvedId, "Registration Bonus", STARTING_BALANCE, userData.wallet);
  
  scheduleSave(resolvedId);
  
  return {
    success: true,
    message: `🌌 *THE AWAKENING* 🌌

"Long ago, the realms were forged in a delicate balance between the *Divine Architect* and *Primordial Chaos*. For eons they coexisted, but the Chaos grew envious, seeping into the world and twisting living beings into mindless husks—*The Infected*.

To save creation, the Divine bestowed fragments of celestial power upon chosen mortals. You, ${nickname}, are one of those chosen *Adventurers*."

👤 *Player:* ${nickname}
💰 *Starting Balance:* ${getZENI()}${STARTING_BALANCE.toLocaleString()}

${starterClass.icon} *Class Assigned:* ${starterClass.name}
📝 ${starterClass.desc}
🏆 *Adventurer Rank:* F-Rank

━━━━━━━━━━━━━━━
⚔️ *MISSION:*
Cleanse the corruption!
━━━━━━━━━━━━━━━`
  };
}
//========================================

//==================this part is for getZENI() and gold transactions==================
function logTransaction(userId, description, amount, newBalance) {
  const user = getUser(userId);
  if (!user) return;
  
  if (!user.history) user.history = [];
  
  const entry = {
    desc: description,
    amount: amount,
    balance: newBalance,
    time: Date.now()
  };
  
  user.history.unshift(entry);
  
  // only keep last 50, dont want the file to be huge
  if (user.history.length > 50) {
    user.history = user.history.slice(0, 50);
  }
}

function getUser(userId) {
  const resolvedId = resolveJidHelper(userId);
  if (!economyData.has(resolvedId)) {
    return null;
  }
  const user = economyData.get(resolvedId);
  if (user && user.registered !== true) {
    return null;
  }
  
  // 💡 Ensure all fields exist (Lazy Migration)
  if (!user.stats) {
    user.stats = {
      totalEarned: user.wallet || 0,
      totalSpent: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      questsCompleted: user.questsCompleted || 0
    };
  }
  if (user.bank === undefined) user.bank = 0;
  if (user.jailUntil === undefined) user.jailUntil = 0;
  if (user.prisonUntil === undefined) user.prisonUntil = 0;
  if (user.robberyStrikes === undefined) user.robberyStrikes = 0;
  if (!user.gamblingProfile) {
    user.gamblingProfile = {
      dayKey: getTodayKey(),
      roundsToday: 0,
      entryWalletToday: user.wallet || 0,
      withdrawnToday: 0,
      netToday: 0
    };
  }
  const today = getTodayKey();
  if (user.gamblingProfile.dayKey !== today) {
    user.gamblingProfile.dayKey = today;
    user.gamblingProfile.roundsToday = 0;
    user.gamblingProfile.entryWalletToday = user.wallet || 0;
    user.gamblingProfile.withdrawnToday = 0;
    user.gamblingProfile.netToday = 0;
  }
  if (!user.frozenAssets) {
    user.frozenAssets = {
      wallet: 0,
      bank: 0,
      reason: ""
    };
  }

  // Lazy migration: eventTokens (added for token event system)
  if (user.eventTokens === undefined) user.eventTokens = 0;

  // Lazy migration: rank mission tracking
  if (!user.completedRankMissions) user.completedRankMissions = [];
  if (!user.stats) user.stats = {};
  if (user.stats.questsWon === undefined) user.stats.questsWon = user.questsWon || 0;
  if (user.stats.bossesDefeated === undefined) user.stats.bossesDefeated = 0;
  if (user.stats.itemsCrafted === undefined) user.stats.itemsCrafted = 0;
  if (user.stats.itemsEquipped === undefined) user.stats.itemsEquipped = 0;

  return user;
}

function getOrCreateUser(userId, defaultNickname = "Adventurer") {
  const resolvedId = resolveJidHelper(userId);
  if (!economyData.has(resolvedId)) {
    const newUser = {
      userId: resolvedId,
      wallet: 0,
      bank: 0,
      registered: false,
      nickname: defaultNickname,
      profile: {
        whatsappName: null,
        nickname: defaultNickname,
        notes: [],
        memories: {
          likes: [],
          dislikes: [],
          hobbies: [],
          personal: [],
          other: []
        },
        stats: {
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          messageCount: 0
        },
        relationships: {}
      }
    };
    economyData.set(resolvedId, newUser);
    scheduleSave(resolvedId);
  }
  const user = economyData.get(resolvedId);
  
  // 💡 Ensure all fields exist (Lazy Migration)
  if (!user.profile) {
    user.profile = {
      whatsappName: null,
      nickname: user.nickname || defaultNickname,
      notes: [],
      memories: {
        likes: [],
        dislikes: [],
        hobbies: [],
        personal: [],
        other: []
      },
      stats: {
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        messageCount: 0
      },
      relationships: {}
    };
  }
  if (!user.stats) {
    user.stats = {
      totalEarned: user.wallet || 0,
      totalSpent: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      questsCompleted: user.questsCompleted || 0
    };
  }
  if (user.bank === undefined) user.bank = 0;
  if (user.jailUntil === undefined) user.jailUntil = 0;
  if (user.prisonUntil === undefined) user.prisonUntil = 0;
  if (user.robberyStrikes === undefined) user.robberyStrikes = 0;
  if (!user.gamblingProfile) {
    user.gamblingProfile = {
      dayKey: getTodayKey(),
      roundsToday: 0,
      entryWalletToday: user.wallet || 0,
      withdrawnToday: 0,
      netToday: 0
    };
  }
  const today = getTodayKey();
  if (user.gamblingProfile.dayKey !== today) {
    user.gamblingProfile.dayKey = today;
    user.gamblingProfile.roundsToday = 0;
    user.gamblingProfile.entryWalletToday = user.wallet || 0;
    user.gamblingProfile.withdrawnToday = 0;
    user.gamblingProfile.netToday = 0;
  }
  if (!user.frozenAssets) {
    user.frozenAssets = {
      wallet: 0,
      bank: 0,
      reason: ""
    };
  }
  
  return user;
}

function getBalance(userId) {
  const user = getUser(userId);
  return user ? user.wallet : 0;
}

function addMoney(userId, amount, description = "Money Added") {
  const user = getUser(userId);
  if (!user) return false;

  // Floor to integer — Zeni doesn't have fractional units, and floating-point
  // math would otherwise accumulate rounding errors over many transactions.
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return false;

  user.wallet += val;
  user.stats.totalEarned += val;

  logTransaction(userId, description, val, user.wallet);

  scheduleSave(userId);
  return user.wallet;
}

function removeMoney(userId, amount, description = "Money Removed") {
  const user = getUser(userId);
  if (!user) return false;

  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return false;
  if (user.wallet < val) return false;

  user.wallet -= val;
  user.stats.totalSpent += val;

  logTransaction(userId, description, -val, user.wallet);

  scheduleSave(userId);
  return true;
}

function getGold(userId) {
  // 💡 QA FIX: was returning user.questGold (always 0) instead of user.wallet.
  // This broke bounty placement, crafting costs, guild donations, guild loan
  // repayments, rune market purchases, and loan auto-processing.
  const user = getUser(userId);
  return user ? (user.wallet || 0) : 0;
}

function addGold(userId, amount) {
  const user = getUser(userId);
  if (!user) return false;
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return false;
  user.questGold = (user.questGold || 0) + val;
  scheduleSave(userId);
  return true;
}

function removeGold(userId, amount) {
  const user = getUser(userId);
  if (!user) return false;
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return false;
  if ((user.questGold || 0) < val) return false;
  user.questGold -= val;
  scheduleSave(userId);
  return true;
}

// ================== EVENT TOKENS ==================
// Token currency for the token event system. Earned by claiming cards
// (1 token per ~2 card claims), spent in the eShop to buy event cards.

function getTokens(userId) {
  const user = getUser(userId);
  return user ? (user.eventTokens || 0) : 0;
}

function addTokens(userId, amount) {
  const user = getUser(userId);
  if (!user) return false;
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return false;
  user.eventTokens = (user.eventTokens || 0) + val;
  scheduleSave(userId);
  return true;
}

function removeTokens(userId, amount) {
  const user = getUser(userId);
  if (!user) return false;
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return false;
  if ((user.eventTokens || 0) < val) return false;
  user.eventTokens -= val;
  scheduleSave(userId);
  return true;
}
//========================================

//==================this part handles the inventory and items==================
const ITEMS = {
    'gold': { name: 'Gold', icon: '💰', value: 15, type: 'currency' },
    'herb': { name: 'Medicinal Herb', icon: '🌿', value: 50, type: 'common' },
    'wood': { name: 'Ironwood Log', icon: '🪵', value: 80, type: 'common' },
    'stone': { name: 'Runestone', icon: '🪨', value: 100, type: 'common' },
    'dagger': { name: 'Rusted Dagger', icon: '🗡️', value: 250, type: 'uncommon' },
    'map': { name: 'Treasure Map', icon: '📜', value: 400, type: 'uncommon' },
    'pottery': { name: 'Ancient Vase', icon: '⚱️', value: 600, type: 'uncommon' },
    'sapphire': { name: 'Deep Sapphire', icon: '💎', value: 1500, type: 'rare' },
    'goldbar': { name: 'Gold Bar', icon: '🥇', value: 3000, type: 'rare' },
    'scale': { name: 'Dragon Scale', icon: '🐉', value: 5000, type: 'rare' },
    'crown': { name: 'Lost King\'s Crown', icon: '👑', value: 15000, type: 'legendary' },
    'orb': { name: 'Void Orb', icon: '🔮', value: 25000, type: 'legendary' }
};

// add item to inventory
function addItem(userId, itemId, quantity = 1) {
    const user = getUser(userId);
    if (!user) return false;
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return false;
    
    if (!user.inventory) user.inventory = {};
    
    // Get base item data if it exists in the registry
    const baseItem = ITEMS[itemId] || {};
    
    // Check if it's the new structure (object) or old (number)
    if (user.inventory[itemId]) {
        if (typeof user.inventory[itemId] === 'number') {
             // Migrate on the fly
             user.inventory[itemId] = {
                 id: itemId,
                 quantity: user.inventory[itemId] + quantity,
                 acquiredAt: Date.now(),
                 ...baseItem
             };
        } else {
             user.inventory[itemId].quantity = (user.inventory[itemId].quantity || 0) + quantity;
             // Ensure base properties are present
             Object.assign(user.inventory[itemId], { ...baseItem, id: itemId });
        }
    } else {
        user.inventory[itemId] = {
            id: itemId,
            quantity: quantity,
            acquiredAt: Date.now(),
            ...baseItem
        };
    }
    
    scheduleSave(userId);
    return true;
}

// remove item from inventory
function removeItem(userId, itemId, quantity = 1) {
    const user = getUser(userId);
    if (!user || !user.inventory || !user.inventory[itemId]) return false;

    // 💡 FIX: reject negative/zero/NaN quantity — was exploitable to GAIN items
    // by passing quantity=-N (the < check would pass, then -= would ADD)
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return false;

    let currentQty = 0;
    if (typeof user.inventory[itemId] === 'number') {
        currentQty = user.inventory[itemId];
    } else {
        currentQty = user.inventory[itemId].quantity || 0;
    }

    if (currentQty < qty) return false;

    if (typeof user.inventory[itemId] === 'number') {
        user.inventory[itemId] -= qty;
        if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
    } else {
        user.inventory[itemId].quantity -= qty;
        if (user.inventory[itemId].quantity <= 0) delete user.inventory[itemId];
    }
    
    scheduleSave(userId);
    return true;
}

// sell items for bread
function sellItem(userId, itemId, quantity = 1) {
    const user = getUser(userId);
    if (!user || !ITEMS[itemId]) return { success: false, msg: "❌ Invalid item." };

    // 💡 FIX: reject negative/zero/NaN quantity — was exploitable to gain items
    // AND drain money by passing quantity=-N
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return { success: false, msg: '❌ Invalid quantity.' };
    
    if (itemId === 'all') {
        if (!user.inventory || Object.keys(user.inventory).length === 0) return { success: false, msg: "❌ Inventory is empty!" };
        
        let total = 0;
        let count = 0;
        for (const [id, item] of Object.entries(user.inventory)) {
            let qty = 0;
            if (typeof item === 'number') qty = item;
            else qty = item.quantity || 0;
            
            if (ITEMS[id] && qty > 0) {
                const val = ITEMS[id].value * qty;
                total += val;
                count += qty;
                delete user.inventory[id];
            }
        }
        user.wallet += total;
        user.stats.totalEarned += total;
        scheduleSave(userId);
        return { success: true, msg: `💰 Sold ${count} items for ${getZENI()}${total.toLocaleString()}` };
    }

    if (!user.inventory || !user.inventory[itemId]) {
        return { success: false, msg: "❌ You don't have that item!" };
    }

    let currentQty = 0;
    if (typeof user.inventory[itemId] === 'number') {
        currentQty = user.inventory[itemId];
    } else {
        currentQty = user.inventory[itemId].quantity || 0;
    }

    if (currentQty < qty) {
        return { success: false, msg: "❌ You don't have enough of that item!" };
    }

    // 💡 Phase 2: Apply guild MERCHANT sell bonus (+10% if in a MERCHANT guild)
    let sellMult = 1.0;
    try {
      const guildPerks = require('./guildPerks');
      sellMult = guildPerks.getSellMultiplier(userId);
    } catch (e) {}
    const value = Math.floor(ITEMS[itemId].value * qty * sellMult);
    user.wallet += value;
    user.stats.totalEarned += value;
    
    // 💡 GUILD CONTRIBUTION
    const guilds = require('./guilds');
    const userGuild = guilds.getUserGuild(userId);
    let guildMsg = "";
    if (userGuild) {
        const contribution = Math.floor(value / 1000); // 1 XP per 1000 Zeni // 5% goes to guild
        guilds.addGuildPoints(userGuild, contribution, `item sold: ${itemId}`);
        guilds.addGuildBalance(userGuild, Math.floor(contribution / 2));
        guilds.updateBoardProgress(userGuild, 'EARN_ZENI', value); // Track earning progress
        guildMsg = `\n🏛️ *${userGuild}* bought your loot for the guild house! (+${contribution} XP)`;
    }

    if (typeof user.inventory[itemId] === 'number') {
        user.inventory[itemId] -= qty;
        if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
    } else {
        user.inventory[itemId].quantity -= qty;
        if (user.inventory[itemId].quantity <= 0) delete user.inventory[itemId];
    }
    
    scheduleSave(userId);
    return { success: true, msg: `💰 Sold ${qty}x ${ITEMS[itemId].icon} ${ITEMS[itemId].name} for ${getZENI()}${value.toLocaleString()}${guildMsg}` };
}

// get user's bag
function getInventory(userId) {
    const user = getUser(userId);
    if (!user || !user.inventory) return [];
    
    return Object.entries(user.inventory).map(([id, qty]) => {
        return { id, qty, ...ITEMS[id] };
    }).filter(i => i.name); 
}
//========================================

//==================this part handles the bank and daily bread==================
function transferMoney(fromUserId, toUserId, amount) {
  const sender = getUser(fromUserId);
  const receiver = getUser(toUserId);
  
  if (!sender || !receiver) {
    return { success: false, message: `❌ *TRANSFER FAILED*\n\n⚠️ Both users must be registered to transfer money!` };
  }
  
  const val = Number(amount);
  if (isNaN(val) || val <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be a valid positive number.` };
  }
  
  if (sender.wallet < val) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n💰 Your wallet: ${getZENI()}${sender.wallet.toLocaleString()}\n📊 Needed: ${getZENI()}${val.toLocaleString()}\n⚠️ Short by: ${getZENI()}${(val - sender.wallet).toLocaleString()}` };
  }
  
  sender.wallet -= val;
  receiver.wallet += val;
  
  logTransaction(fromUserId, `Transfer to @${toUserId.split('@')[0]}`, -val, sender.wallet);
  logTransaction(toUserId, `Transfer from @${fromUserId.split('@')[0]}`, val, receiver.wallet);

  scheduleSave(fromUserId);
  scheduleSave(toUserId);
  
  return {
    success: true,
    message: `✅ *TRANSFER SUCCESSFUL!*

━━━━━━━━━━━━━━━━
💸 *Sent:* ${getZENI()}${amount.toLocaleString()}
👤 *To:* @${toUserId.split('@')[0]}
━━━━━━━━━━━━━━━━

💰 *Your New Balance:* ${getZENI()}${sender.wallet.toLocaleString()}`,
    receiver: toUserId,
    amount: val,
    wallet: sender.wallet,
    bank: sender.bank,
    nickname: sender.nickname || sender.userId.split('@')[0]
  };
}

function deposit(userId, amount) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };

  // Coerce amount: non-numeric input would slip past `amount <= 0` (NaN
  // comparisons are always false) and then `user.wallet -= amount` would
  // produce NaN, permanently corrupting the wallet.
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be a positive whole number greater than ${getZENI()}0` };
  }

  if (user.wallet < val) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n💰 Wallet balance: ${getZENI()}${user.wallet.toLocaleString()}\n📊 Attempting to deposit: ${getZENI()}${val.toLocaleString()}` };
  }

  user.wallet -= val;
  user.bank += val;

  logTransaction(userId, "Bank Deposit", -val, user.wallet);

  scheduleSave(userId);

  return {
    success: true,
    message: `✅ *DEPOSIT SUCCESSFUL!*

━━━━━━━━━━━━━━━
💵 *Deposited:* ${getZENI()}${val.toLocaleString()}
━━━━━━━━━━━━━━━

💰 *Wallet:* ${getZENI()}${user.wallet.toLocaleString()}
🏦 *Bank:* ${getZENI()}${user.bank.toLocaleString()}
📊 *Total:* ${getZENI()}${(user.wallet + user.bank).toLocaleString()}`,
    amount: val,
    wallet: user.wallet,
    bank: user.bank,
    nickname: user.nickname || user.userId.split('@')[0]
  };
}

function withdraw(userId, amount) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };

  // Same coercion as deposit — protects against NaN corruption.
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be a positive whole number greater than ${getZENI()}0` };
  }

  if (user.bank < val) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n🏦 Bank balance: ${getZENI()}${user.bank.toLocaleString()}\n📊 Attempting to withdraw: ${getZENI()}${val.toLocaleString()}` };
  }

  user.bank -= val;
  user.wallet += val;

  const today = getTodayKey();
  if (!user.gamblingProfile) {
    user.gamblingProfile = {
      dayKey: today,
      roundsToday: 0,
      entryWalletToday: user.wallet || 0,
      withdrawnToday: 0,
      netToday: 0
    };
  }
  if (user.gamblingProfile.dayKey !== today) {
    user.gamblingProfile.dayKey = today;
    user.gamblingProfile.roundsToday = 0;
    user.gamblingProfile.entryWalletToday = user.wallet || 0;
    user.gamblingProfile.withdrawnToday = 0;
    user.gamblingProfile.netToday = 0;
  }
  user.gamblingProfile.withdrawnToday = (user.gamblingProfile.withdrawnToday || 0) + val;

  logTransaction(userId, "Bank Withdrawal", val, user.wallet);

  scheduleSave(userId);

  return {
    success: true,
    message: `✅ *WITHDRAWAL SUCCESSFUL!*

━━━━━━━━━━━━━━━
💵 *Withdrew:* ${getZENI()}${val.toLocaleString()}
━━━━━━━━━━━━━━━

💰 *Wallet:* ${getZENI()}${user.wallet.toLocaleString()}
🏦 *Bank:* ${getZENI()}${user.bank.toLocaleString()}
📊 *Total:* ${getZENI()}${(user.wallet + user.bank).toLocaleString()}`,
    amount: val,
    wallet: user.wallet,
    bank: user.bank,
    nickname: user.nickname || user.userId.split('@')[0]
  };
}

function getBankBalance(userId) {
  const user = getUser(userId);
  if (!user) return { wallet: 0, bank: 0, total: 0 };
  
  return {
    wallet: user.wallet,
    bank: user.bank,
    total: user.wallet + user.bank
  };
}

function claimDaily(userId) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };

  const now = Date.now();
  const dayInMs = 86400000;

  if (now - user.lastDaily < dayInMs) {
    const timeLeft = dayInMs - (now - user.lastDaily);
    const hoursLeft = Math.floor(timeLeft / 3600000);
    const minsLeft = Math.floor((timeLeft % 3600000) / 60000);

    return {
      success: false,
      message: `⏰ *DAILY ALREADY CLAIMED!*

━━━━━━━━━━━━━━━
🕐 Come back in:
   *${hoursLeft}h ${minsLeft}m*
━━━━━━━━━━━━━━━

💡 _Check back tomorrow for your reward!_`
    };
  }

  // 💡 MEMBERSHIP DAILY BONUS — previously the membership tiers defined
  // a `dailyBonus` field (1000 for PREMIUM, 5000 for DIAMOND) but it was
  // never actually granted. Players paid 50k-250k for membership and got
  // the same daily reward as free players.
  let bonus = 0;
  let membershipLabel = '';
  if (user.membership && user.membership.expires > now) {
    const tier = MEMBERSHIP_TIERS[user.membership.tier];
    if (tier) {
      bonus = tier.dailyBonus || 0;
      membershipLabel = ` (${tier.name})`;
    }
  } else if (user.membership) {
    // Membership expired — reset to BASIC
    user.membership.tier = 'BASIC';
    user.membership.expires = 0;
  }

  const totalReward = DAILY_REWARD + bonus;
  user.wallet += totalReward;
  user.lastDaily = now;
  user.stats.totalEarned += totalReward;

  logTransaction(userId, `Daily Reward${membershipLabel}`, totalReward, user.wallet);

  scheduleSave(userId);

  const bonusLine = bonus > 0
    ? `💰 *Base:* +${getZENI()}${DAILY_REWARD.toLocaleString()}\n💎 *Membership Bonus:* +${getZENI()}${bonus.toLocaleString()}${membershipLabel}`
    : `💰 *Reward:* +${getZENI()}${DAILY_REWARD.toLocaleString()}`;

  return {
    success: true,
    message: `🎁 *DAILY REWARD CLAIMED!*

━━━━━━━━━━━━━━━
${bonusLine}
*Total:* +${getZENI()}${totalReward.toLocaleString()}
━━━━━━━━━━━━━━━

💵 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}

✨ _Come back in 24 hours for another reward!_`
  };
}
//========================================

//==================this part handles class and rank integration==================
function initializeClass(userId) {
  const user = getUser(userId);
  if (!user) return false;
  
  if (!user.class) {
    const starterClass = classSystem.getRandomStarterClass();
    user.class = starterClass.id;
    user.questGold = user.questGold || 0;
    user.adventurerRank = 'F';
    user.questsCompleted = user.questsCompleted || 0;
    user.questsWon = user.questsWon || 0;
    user.questsFailed = user.questsFailed || 0;
    user.spriteIndex = Math.floor(Math.random() * 100);
    user.statBonuses = user.statBonuses || {
      hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0
    };
    scheduleSave(userId);
    return true;
  }
  return false;
}

function getUserClass(userId) {
  const user = getUser(userId);
  if (!user || !user.class) return null;
  
  const classData = classSystem.getClassById(user.class);
  return classData;
}

function addProfessionXP(userId, profession, amount) {
    const user = getUser(userId);
    if (!user || !user.professions) return null;
    const val = Math.floor(Number(amount));
    if (!Number.isFinite(val) || val <= 0) return null;
    
    const prof = user.professions[profession];
    if (!prof) return null;
    
    prof.xp += val;
    
    // Leveling logic: 100 * level^1.5
    const nextLevelXP = Math.floor(100 * Math.pow(prof.level, 1.5));
    let leveledUp = false;
    
    if (prof.xp >= nextLevelXP) {
        prof.level++;
        prof.xp -= nextLevelXP;
        leveledUp = true;
    }
    
    scheduleSave(userId);
    return { leveledUp, newLevel: prof.level };
}

function getProfessionLevel(userId, profession) {
    const user = getUser(userId);
    return user?.professions?.[profession]?.level || 1;
}

const MEMBERSHIP_TIERS = {
    'PREMIUM': { name: 'Premium Adventurer', cost: 50000, durationDays: 30, dailyBonus: 1000, bankTax: 0.02 },
    'DIAMOND': { name: 'Diamond Legend', cost: 250000, durationDays: 30, dailyBonus: 5000, bankTax: 0 }
};

function buyMembership(userId, tierId) {
    const user = getUser(userId);
    const tier = MEMBERSHIP_TIERS[tierId.toUpperCase()];
    
    if (!tier) return { success: false, message: "❌ Invalid membership tier!" };
    if (user.wallet < tier.cost) return { success: false, message: `❌ Need ${getZENI()}${tier.cost.toLocaleString()} to upgrade!` };
    
    removeMoney(userId, tier.cost, `Bought ${tier.name}`);
    
    const now = Date.now();
    const durationMs = tier.durationDays * 24 * 60 * 60 * 1000;
    
    if (!user.membership) user.membership = { tier: 'BASIC', expires: 0 };
    
    // Extend or replace
    if (user.membership.tier === tierId.toUpperCase() && user.membership.expires > now) {
        user.membership.expires += durationMs;
    } else {
        user.membership.tier = tierId.toUpperCase();
        user.membership.expires = now + durationMs;
    }
    
    scheduleSave(userId);
    return { success: true, message: `💎 *UPGRADED!*\n\nYou are now a *${tier.name}*!\nExpires: ${new Date(user.membership.expires).toLocaleDateString()}` };
}

function getUserStats(userId) {
  const user = getUser(userId);
  if (!user) return null;
  
  const classData = getUserClass(userId);
  if (!classData) return null;
  
  const bonuses = user.statBonuses || {};
  
  return {
    hp: (classData.stats.hp || 0) + (bonuses.hp || 0),
    atk: (classData.stats.atk || 0) + (bonuses.atk || 0),
    def: (classData.stats.def || 0) + (bonuses.def || 0),
    mag: (classData.stats.mag || 0) + (bonuses.mag || 0),
    spd: (classData.stats.spd || 0) + (bonuses.spd || 0),
    luck: (classData.stats.luck || 0) + (bonuses.luck || 0),
    crit: (classData.stats.crit || 0) + (bonuses.crit || 0)
  };
}

function changeClass(userId) {
  const user = getUser(userId);
  if (!user) return { success: false, message: '❌ User not found!' };
  
  const currentClass = getUserClass(userId);
  
  if (currentClass && (currentClass.tier === 'EVOLVED' || currentClass.tier === 'ASCENDED')) {
    return { success: false, message: '❌ Cannot reroll an evolved or ascended class! Use Skill Reset Scroll first.' };
  }
  
  const newClass = classSystem.getRandomStarterClass();
  user.class = newClass.id;
  user.spriteIndex = Math.floor(Math.random() * 100);
  user.lastClassChange = Date.now();
  scheduleSave(userId);
  
  return {
    success: true,
    message: `✅ Class changed!\n\n${newClass.icon} *New Class:* ${newClass.name}\n📝 ${newClass.desc}`
  };
}

// 💡 DELETED: evolveClass(userId, evolutionId) — was dead code (zero callers
// in the entire codebase). The actual evolution logic lives inline in
// skillCommands.handleEvolve (non-trial path) and guildAdventure.endAdventure
// (trial path), both of which were hardened in prior commits. Keeping this
// orphan function around was a maintenance hazard — anyone reading economy.js
// might assume it was the canonical evolution entry point.

function resetClass(userId) {
  const user = getUser(userId);
  if (!user) return { success: false, message: '❌ User not found!' };
  
  const currentClass = getUserClass(userId);
  if (!currentClass) {
    return { success: false, message: '❌ No class assigned!' };
  }
  
  if (currentClass.tier !== 'EVOLVED') {
    return { success: false, message: '❌ Already a starter class!' };
  }
  
  const originalStarter = currentClass.evolvedFrom;
  const starterClass = classSystem.getClassById(originalStarter);
  
  if (!starterClass) {
    return { success: false, message: '❌ Error finding starter class!' };
  }
  
  const refund = Math.floor(currentClass.evolutionCost * 0.5);
  user.wallet += refund;
  user.class = starterClass.id;
  user.spriteIndex = Math.floor(Math.random() * 100);
  scheduleSave(userId);
  
  return {
    success: true,
    message: `♻️ *CLASS RESET!*

${starterClass.icon} Back to *${starterClass.name}*
💰 Refunded: ${getZENI()}${refund.toLocaleString()}`
  };
}

async function updateAdventurerRank(userId) {
  const user = getUser(userId);
  if (!user) return null;

  const progression = require('./progression');
  const level = progression.getLevel(userId);
  const gp = progression.getGP(userId);
  const questsCompleted = user.questsCompleted || 0;

  const calculatedRank = classSystem.calculateAdventurerRank(level, questsCompleted, gp);
  const oldRank = user.adventurerRank || 'F';

  // 💡 CRITICAL FIX: NEVER downgrade an existing rank.
  const rankOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'GOD'];
  const oldIdx = rankOrder.indexOf(oldRank);
  const newIdx = rankOrder.indexOf(calculatedRank);

  if (newIdx > oldIdx) {
    // 💡 RANK MISSION GATE: Check if the promotion from oldRank requires
    // a rank mission to be completed. If it does and the player hasn't
    // completed it yet, DON'T promote — they need to finish the mission first.
    const completedMissions = user.completedRankMissions || [];
    const eligibility = classSystem.checkRankPromotionEligibility(oldRank, completedMissions);

    if (!eligibility.canPromote) {
      // Player meets level/quest requirements but hasn't completed the
      // rank mission. Don't promote — they need to finish the mission.
      return {
        ranked_up: false,
        rank: oldRank,
        blocked_by_mission: eligibility.mission,
        mission_id: eligibility.blockedByMission,
      };
    }

    // Mission completed (or no mission required) → promote!
    user.adventurerRank = calculatedRank;
    // 💡 FIX #50: Use saveUser (immediate MongoDB write) instead of
    // scheduleSave (debounced 500ms). If the bot restarts before the
    // debounced save fires, the rank promotion is lost.
    await saveUser(userId);

    const rankData = classSystem.ADVENTURER_RANKS[calculatedRank];
    return {
      ranked_up: true,
      old_rank: oldRank,
      new_rank: calculatedRank,
      rank_data: rankData
    };
  }

  // No upgrade (rank stays the same, or calculated rank is lower —
  // in which case we PRESERVE the existing rank, not downgrade).
  return { ranked_up: false, rank: oldRank };
}

/**
 * Get the player's current rank mission status — what mission they need
 * to complete next, their progress on each objective, and whether they
 * can claim it.
 */
function getRankMissionStatus(userId) {
  const user = getUser(userId);
  if (!user) return null;

  const currentRank = user.adventurerRank || 'F';
  const gateMission = classSystem.getGateMissionForRank(currentRank);

  if (!gateMission) {
    return {
      hasGate: false,
      mission: null,
      progress: [],
      canClaim: false,
      message: 'No rank mission required for your next promotion. Keep leveling up!',
    };
  }

  // Check if already completed
  const completed = (user.completedRankMissions || []).includes(gateMission.id);
  if (completed) {
    return {
      hasGate: true,
      mission: gateMission,
      progress: [],
      canClaim: false,
      alreadyCompleted: true,
      message: `You have already completed the ${gateMission.name}! Your next promotion is unlocked.`,
    };
  }

  // Check progress
  const playerStats = {
    questsWon: user.stats?.questsWon || user.questsWon || 0,
    bossesDefeated: user.stats?.bossesDefeated || 0,
    pvpWins: user.pvpWins || 0,
    dragonsKilled: user.stats?.dragonsKilled || 0,
    itemsCrafted: user.stats?.itemsCrafted || 0,
    itemsEquipped: user.stats?.itemsEquipped || 0,
  };

  const { complete, progress } = classSystem.checkMissionProgress(gateMission.id, playerStats);

  return {
    hasGate: true,
    mission: gateMission,
    progress,
    canClaim: complete,
    alreadyCompleted: false,
    message: complete
      ? `✅ You have completed all objectives for the ${gateMission.name}! Use \`.g rank mission claim\` to claim your reward and unlock promotion.`
      : `📊 Progress for ${gateMission.name}:`,
  };
}

/**
 * Claim a completed rank mission. Marks it as completed on the user
 * and triggers a rank update check.
 */
async function claimRankMission(userId) {
  const user = getUser(userId);
  if (!user) return { success: false, message: 'User not found.' };

  const currentRank = user.adventurerRank || 'F';
  const gateMission = classSystem.getGateMissionForRank(currentRank);

  if (!gateMission) {
    return { success: false, message: '❌ No rank mission required for your current rank. Keep leveling up!' };
  }

  if (!user.completedRankMissions) user.completedRankMissions = [];
  if (user.completedRankMissions.includes(gateMission.id)) {
    return { success: false, message: `❌ You have already completed the ${gateMission.name}.` };
  }

  // Verify all objectives are actually met
  const playerStats = {
    questsWon: user.stats?.questsWon || user.questsWon || 0,
    bossesDefeated: user.stats?.bossesDefeated || 0,
    pvpWins: user.pvpWins || 0,
    dragonsKilled: user.stats?.dragonsKilled || 0,
    itemsCrafted: user.stats?.itemsCrafted || 0,
    itemsEquipped: user.stats?.itemsEquipped || 0,
  };
  const { complete, progress } = classSystem.checkMissionProgress(gateMission.id, playerStats);

  if (!complete) {
    let msg = `❌ You haven't completed all objectives for the ${gateMission.name} yet!\n\n📊 Progress:\n`;
    progress.forEach(p => {
      msg += `${p.done ? '✅' : '❌'} ${p.label} (${p.current}/${p.target})\n`;
    });
    return { success: false, message: msg };
  }

  // Mark mission as completed
  user.completedRankMissions.push(gateMission.id);
  // 💡 FIX #50: immediate save, same as rank promotion
  await saveUser(userId);

  // Now try to promote (this will check mission eligibility — which should pass now)
  const rankResult = await updateAdventurerRank(userId);

  let msg = `🎉 *MISSION COMPLETE!* 🎉\n\n`;
  msg += `${gateMission.icon} *${gateMission.name}*\n`;
  msg += `All objectives cleared!\n\n`;

  if (rankResult.ranked_up) {
    msg += `⬆️ *RANK UP!* ${rankResult.old_rank} → ${rankResult.new_rank}\n`;
    msg += `You are now ${rankResult.rank_data?.name || rankResult.new_rank + '-Rank'}!`;
  } else if (rankResult.blocked_by_mission) {
    msg += `✅ Mission complete, but you still need to meet the level/quest requirements for the next rank.`;
  } else {
    msg += `✅ Mission recorded! You'll rank up when you meet the level/quest requirements.`;
  }

  return { success: true, message: msg, rankResult };
}

/**
 * Track a stat for rank mission progress.
 * Called by various game systems (quest completion, boss kills, etc.)
 */
function trackMissionStat(userId, statKey, amount = 1) {
  const user = getUser(userId);
  if (!user || !user.stats) return;
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return;
  user.stats[statKey] = (user.stats[statKey] || 0) + val;
  // 💡 FIX: was scheduleSave(userId) — debounced 500ms. If the bot
  // restarted within 500ms of the stat increment, the DB write was
  // lost and the player's progress vanished on next load. Rank-mission
  // stats (itemsCrafted, itemsEquipped, bossesDefeated, etc.) are
  // high-stakes — losing them means re-doing the work. Use immediate
  // saveUser (which is async but we don't need to await it here — the
  // in-memory mutation is already done, the DB write is just persistence).
  saveUser(userId).catch(e => console.error(`[trackMissionStat] saveUser failed for ${userId}:`, e.message));
}

function addStatBonus(userId, stat, value) {
  const user = getUser(userId);
  if (!user) return false;

  // Validate inputs. Without this, a non-numeric `value` would concatenate
  // as a string (0 + "5" = "05"), and an invalid `stat` would create a
  // garbage property on statBonuses that progression.getBaseStats wouldn't
  // read (so the bonus would silently do nothing).
  const validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit'];
  const s = String(stat || '').toLowerCase();
  if (!validStats.includes(s)) {
    console.warn(`[economy.addStatBonus] Invalid stat: ${stat}`);
    return false;
  }
  const v = Number(value);
  if (!Number.isFinite(v)) {
    console.warn(`[economy.addStatBonus] Non-numeric value: ${value}`);
    return false;
  }

  if (!user.statBonuses) {
    user.statBonuses = { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 };
  }

  user.statBonuses[s] = (user.statBonuses[s] || 0) + v;
  scheduleSave(userId);
  return true;
}

function incrementQuestCounter(userId, won = true) {
  return addQuestProgress(userId, 1.0, won);
}

function incrementDragonKills(userId, amount = 1) {
  const user = getUser(userId);
  if (!user) return;
  const val = Math.floor(Number(amount));
  if (!Number.isFinite(val) || val <= 0) return;
  if (!user.stats) user.stats = {};
  user.stats.dragonsKilled = (user.stats.dragonsKilled || 0) + val;
  scheduleSave(userId);
}

async function addQuestProgress(userId, amount, won = true) {
  const user = getUser(userId);
  if (!user) return;
  const val = Number(amount);
  if (!Number.isFinite(val)) return;

  // 💡 FIX #41: Use Math.round instead of Math.ceil for fractional
  // quest progress. Math.ceil(0.05) = 1, meaning every combat
  // encounter in a dungeon added 1 to questsCompleted — the same
  // as completing a full quest. This caused inconsistent rank
  // calculations between players who did the same dungeon but had
  // different numbers of combat encounters (more encounters = more
  // questsCompleted = higher calculated rank).
  //
  // ⚠️ NOTE: Because the rounded value is written back to
  // user.questsCompleted each call, the running total is ALWAYS an
  // integer. Each call recomputes Math.round(integer + 0.05) = integer.
  // The fractional part is discarded every call — it does NOT
  // accumulate. 20 × addQuestProgress(0.05) yields 0, not 1. Only
  // calls with amount >= 0.5 (e.g. 1.0 for boss kills, 0.2 doesn't
  // round up) actually move the counter. This is under-counting
  // fractional progress, which is acceptable — questsCompleted is
  // meant to track COMPLETED quests, not partial progress. The
  // questsWon counter (incremented by 1 on every win) is the
  // authoritative metric for rank missions.
  user.questsCompleted = Math.round((parseFloat(user.questsCompleted) || 0) + amount);
  if (won) {
    user.questsWon = (user.questsWon || 0) + 1;
    // 💡 Track for rank missions
    if (user.stats) {
      user.stats.questsWon = (user.stats.questsWon || 0) + 1;
    }
  }
  // 💡 QA FIX: only increment questsFailed on actual failures (amount <= 0),
  // not on successful combat encounters that pass won=false for XP-tracking
  // purposes. Previously, every combat encounter with won=false incremented
  // questsFailed, making the counter meaningless.
  if (!won && amount <= 0) {
    user.questsFailed = (user.questsFailed || 0) + 1;
  }

  scheduleSave(userId);
  
  return await updateAdventurerRank(userId);
}

function hasItem(userId, itemId) {
  const user = getUser(userId);
  if (!user || !user.inventory || !user.inventory[itemId]) return false;
  // Inventory items can be either a plain number (legacy) or an object with
  // a `quantity` field (current shape). Handle both.
  const entry = user.inventory[itemId];
  const qty = typeof entry === 'number' ? entry : (entry?.quantity || 0);
  return qty > 0;
}

//==================this part handles leaderboards and user profiles==================
function getMoneyLeaderboard(limit = 10) {
  return Array.from(economyData.entries())
    .filter(([_, data]) => data.registered)
    .map(([userId, data]) => ({
      userId,
      nickname: data.nickname || userId.split('@')[0],
      wallet: data.wallet || 0,
      bank: data.bank || 0,
      total: (data.wallet || 0) + (data.bank || 0)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function getGlobalEconomyStats() {
  const users = Array.from(economyData.values());
  const totalUsers = users.length;
  
  let totalWallet = 0;
  let totalBank = 0;
  let totalFrozen = 0;
  let premiumMembers = 0;
  let diamondMembers = 0;
  
  users.forEach(u => {
    totalWallet += (u.wallet || 0);
    totalBank += (u.bank || 0);
    totalFrozen += (u.frozenAssets?.wallet || 0) + (u.frozenAssets?.bank || 0);
    
    if (u.adventurerRank === 'S' || u.adventurerRank === 'SS') premiumMembers++;
    if (u.adventurerRank === 'SSS') diamondMembers++;
  });

  const totalWealth = totalWallet + totalBank;
  const avgWealth = totalUsers > 0 ? Math.floor(totalWealth / totalUsers) : 0;
  
  const sorted = [...users].sort((a, b) => ((b.wallet||0)+(b.bank||0)) - ((a.wallet||0)+(a.bank||0)));
  const richest = sorted[0];
  
  const top1Count = Math.max(1, Math.ceil(totalUsers * 0.01));
  const top1Wealth = sorted.slice(0, top1Count).reduce((s, u) => s + (u.wallet||0) + (u.bank||0), 0);
  const top1Share = totalWealth > 0 ? (top1Wealth / totalWealth * 100).toFixed(1) : 0;

  const top10Count = Math.max(1, Math.ceil(totalUsers * 0.1));
  const top10Wealth = sorted.slice(0, top10Count).reduce((s, u) => s + (u.wallet||0) + (u.bank||0), 0);
  const top10Share = totalWealth > 0 ? (top10Wealth / totalWealth * 100).toFixed(1) : 0;

  return {
    totalUsers,
    totalWealth,
    totalWallet,
    totalBank,
    totalFrozen,
    premiumMembers,
    diamondMembers,
    avgWealth,
    top1Share,
    top10Share,
    richest: richest ? { name: richest.nickname, amount: (richest.wallet||0)+(richest.bank||0) } : null
  };
}

function getGamblingLeaderboard(limit = 10) {
  return Array.from(economyData.entries())
    .filter(([_, data]) => data.registered && data.stats)
    .map(([userId, data]) => ({
      userId,
      nickname: data.nickname || userId.split('@')[0],
      stats: data.stats
    }))
    .sort((a, b) => (b.stats.gamesWon || 0) - (a.stats.gamesWon || 0))
    .slice(0, limit);
}

function getUserProfile(userId) {
  const user = getUser(userId);
  if (!user) return null;
  
  return {
    nickname: user.nickname,
    wallet: user.wallet,
    bank: user.bank,
    frozenAssets: user.frozenAssets || { wallet: 0, bank: 0, reason: "" },
    total: (user.wallet || 0) + (user.bank || 0),
    stats: user.stats,
    history: user.history || []
  };
}

function robUser(thiefId, victimId) {
  const thief = getUser(thiefId);
  const victim = getUser(victimId);
  
  if (!thief || !victim) return { success: false, message: `❌ Both users must be registered!` };
  
  const now = Date.now();
  const cooldown = 30 * 60 * 1000;
  const jailDuration = 30 * 60 * 1000;
  const prisonDuration = 24 * 60 * 60 * 1000;

  if (thief.prisonUntil && thief.prisonUntil > now) {
    const mins = Math.ceil((thief.prisonUntil - now) / 60000);
    return { success: false, message: `⛓️ *PRISON BAN*\n\nYou are banned from bot commands for ${mins} minute(s).` };
  }

  if (thief.jailUntil && thief.jailUntil > now) {
    const mins = Math.ceil((thief.jailUntil - now) / 60000);
    return { success: false, message: `🚔 *JAIL BAN*\n\nYou are banned from bot commands for ${mins} minute(s).` };
  }

  if (thief.lastRob && (now - thief.lastRob < cooldown)) {
    const timeLeft = cooldown - (now - thief.lastRob);
    const mins = Math.ceil(timeLeft / 60000);
    return { success: false, message: `👮 *POLICE ALERT*\n\nYou're laying low! Wait ${mins} minutes before robbing again.` };
  }
  
  if (victim.wallet < 500) {
    return { success: false, message: `❌ They are too poor to rob!` };
  }

  const success = Math.random() < 0.4;
  thief.lastRob = now;

  try {
    const socialSystem = require('./socialSystem');
    socialSystem.incrementRelationship(thiefId, victimId, -15);
  } catch (socialErr) {}
  
  if (success) {
    const percent = Math.floor(Math.random() * 20) + 10;
    const amount = Math.floor(victim.wallet * (percent / 100));
    
    victim.wallet -= amount;
    thief.wallet += amount;
    
    logTransaction(thiefId, `Robbed @${victimId.split('@')[0]}`, amount, thief.wallet);
    logTransaction(victimId, `Robbed by @${thiefId.split('@')[0]}`, -amount, victim.wallet);

    scheduleSave(thiefId);
    scheduleSave(victimId);
    return { 
      success: true, 
      message: `🥷 *ROBBERY SUCCESSFUL*\n\nYou stole ${getZENI()}${amount.toLocaleString()} from @${victimId.split('@')[0]}!` 
    };
  } else {
    const fine = Math.max(500, Math.floor(thief.wallet * 0.01));
    thief.wallet = Math.max(0, thief.wallet - fine);

    thief.robberyStrikes = (thief.robberyStrikes || 0) + 1;

    let penaltyLine = `💸 Fine paid: ${getZENI()}${fine.toLocaleString()}.`;
    if (thief.robberyStrikes === 1) {
      penaltyLine += `\n⚠️ First offense: fine only.`;
    } else if (thief.robberyStrikes === 2) {
      thief.jailUntil = now + jailDuration;
      penaltyLine += `\n🚔 Second offense: 30-minute jail ban.`;
    } else {
      thief.prisonUntil = now + prisonDuration;
      thief.jailUntil = 0;
      thief.robberyStrikes = 0;
      penaltyLine += `\n⛓️ Third offense: 1-day prison ban.`;
    }
    
    logTransaction(thiefId, "Robbery Fine (Police)", -fine, thief.wallet);

    scheduleSave(thiefId);
    return { 
      success: false, 
      message: `🚓 *BUSTED*\n\nThe police caught you!\n${penaltyLine}` 
    };
  }
}

function getPunishmentStatus(userId) {
  const user = getUser(userId);
  if (!user) return { blocked: false };

  const now = Date.now();
  if (user.prisonUntil && user.prisonUntil > now) {
    return { blocked: true, type: 'prison', msLeft: user.prisonUntil - now };
  }
  if (user.jailUntil && user.jailUntil > now) {
    return { blocked: true, type: 'jail', msLeft: user.jailUntil - now };
  }
  return { blocked: false };
}

async function syncUserFromDB(userId) {
  const resolvedId = resolveJidHelper(userId);
  const cachedUser = economyData.get(resolvedId);
  if (cachedUser && cachedUser.registered === true) {
    return;
  }

  try {
    const user = await User.findOne({ userId: resolvedId }).lean();
    if (user) {
      if (user.inventory && user.inventory instanceof Map) {
          user.inventory = Object.fromEntries(user.inventory);
      }
      if (user.skills && user.skills instanceof Map) {
          user.skills = Object.fromEntries(user.skills);
      }
      if (user.portfolio && user.portfolio instanceof Map) {
          user.portfolio = Object.fromEntries(user.portfolio);
      }
      economyData.set(resolvedId, user);
    }
  } catch (err) {
    console.error("Error syncing user from DB:", err.message);
  }
}

//========================================
// 💡 WEALTH TAX (Phase 1 — Economy Rebalance)
//========================================
// Weekly auto-deduction on bank balances to combat Zeni inflation.
// - 1% on bank balances over 10M
// - 2% on bank balances over 50M
// Wallet (cash on hand) is NOT taxed — only bank. This encourages spending
// or investing rather than hoarding. Tax revenue is deleted from the economy
// (not redistributed) — it's a pure sink.
//
// Runs automatically every Monday 00:00 UTC via the scheduler in index.js.
// Can also be triggered manually by the owner via `.g wealthtax run` for
// testing or catch-up after downtime.

const WEALTH_TAX_BRACKETS = [
  { threshold: 50000000, rate: 0.02 },  // 2% over 50M
  { threshold: 10000000, rate: 0.01 },  // 1% over 10M
];

async function runWealthTax() {
  console.log('[WealthTax] Running weekly wealth tax...');
  let totalTaxed = 0;
  let playersTaxed = 0;
  const report = [];

  for (const [userId, user] of economyData.entries()) {
    if (!user) continue;
    const bankBalance = user.bank || 0;
    if (bankBalance < 10000000) continue; // below first bracket

    // Find applicable bracket (highest first)
    let tax = 0;
    let bracketLabel = '';
    for (const bracket of WEALTH_TAX_BRACKETS) {
      if (bankBalance >= bracket.threshold) {
        tax = Math.floor(bankBalance * bracket.rate);
        bracketLabel = `${(bracket.rate * 100).toFixed(0)}% over ${bracket.threshold.toLocaleString()}`;
        break;
      }
    }

    if (tax <= 0) continue;

    // Deduct
    user.bank = Math.max(0, bankBalance - tax);
    scheduleSave(userId);
    totalTaxed += tax;
    playersTaxed++;

    if (playersTaxed <= 10) {
      report.push(`  ${user.nickname || userId}: -${tax.toLocaleString()} (${bracketLabel})`);
    }
  }

  console.log(`[WealthTax] Done. Taxed ${playersTaxed} players, removed ${totalTaxed.toLocaleString()} Zeni from economy.`);
  return {
    playersTaxed,
    totalTaxed,
    report: report.slice(0, 10),
  };
}

// Schedule the weekly tax — call from index.js on bot startup.
// Runs every Monday at 00:00 UTC.
function scheduleWealthTax() {
  const now = new Date();
  const nextMonday = new Date(now);
  const daysUntilMonday = (1 + 7 - now.getDay()) % 7; // 1 = Monday
  nextMonday.setDate(now.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
  nextMonday.setHours(0, 0, 0, 0);

  const msUntilNext = nextMonday.getTime() - now.getTime();
  console.log(`[WealthTax] Scheduled. Next run: ${nextMonday.toISOString()} (in ${Math.round(msUntilNext / 3600000)}h)`);

  setTimeout(() => {
    runWealthTax().catch(e => console.error('[WealthTax] Run failed:', e.message));
    // Re-schedule for next week (7 days = 604800000 ms)
    setInterval(() => {
      runWealthTax().catch(e => console.error('[WealthTax] Run failed:', e.message));
    }, 7 * 24 * 60 * 60 * 1000);
  }, msUntilNext);
}
//========================================

module.exports = {
  getZENI,
  STARTING_BALANCE,
  getPlaceholderPFP,
  
  isRegistered,
  registerUser,
  syncUserFromDB,
  
  loadEconomy,
  saveUser,
  reloadUserFromDB,
  scheduleSave,
  getUser,
  getOrCreateUser,
  logTransaction,
  
  getBalance,
  addMoney,
  removeMoney,
  transferMoney,
  robUser,
  getPunishmentStatus,
  getGold,
  addGold,
  removeGold,
  
  deposit,
  withdraw,
  getBankBalance,
  
  claimDaily,
  
  getMoneyLeaderboard,
  getGlobalEconomyStats,
  buyMembership,
  MEMBERSHIP_TIERS,
  getGamblingLeaderboard,
  
  getUserProfile,
  economyData,

  // 💡 Wealth tax (Phase 1)
  runWealthTax,
  scheduleWealthTax,

  ITEMS,
  addItem,
  removeItem,
  sellItem,
  getInventory,

  initializeClass,
  getUserClass,
      addProfessionXP,
      getProfessionLevel,
      getUserStats,  changeClass,
  // 💡 evolveClass removed — was dead code (zero callers)
  resetClass,
  updateAdventurerRank,
  addStatBonus,
  incrementQuestCounter,
  incrementDragonKills,
  addQuestProgress,
  hasItem,
  getGold,
  getZENI,
  getCurrency,

  // Event Tokens
  getTokens,
  addTokens,
  removeTokens,

  // Rank Mission System
  getRankMissionStatus,
  claimRankMission,
  trackMissionStat,
};

// Auto-load disabled - now called by index.js startBot()
// loadEconomy();

