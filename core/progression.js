// ============================================
// 📊 COMPLETE RPG PROGRESSION SYSTEM
// ============================================
// Handles XP, leveling, stat growth, and character progression

const economy = require('./economy'); // Integrated with MongoDB

// ==========================================
// 📈 XP AND LEVELING CONFIGURATION
// ==========================================

const XP_CONFIG = {
    BASE_XP: 100,           // XP needed for level 2
    SCALING_FACTOR: 1.15,   // XP increases by 15% per level
    MAX_LEVEL: 100,         // Level cap
    
    // XP Sources
    QUEST_BASE_XP: 150,     // Base XP per quest encounter
    BOSS_MULTIPLIER: 3.0,   // Bosses give 3x XP
    QUEST_COMPLETION: 500,  // Bonus for completing full quest
    
    // Level Milestones (bonus XP needed)
    MILESTONES: {
        10: 1.2,  // 20% more XP needed
        25: 1.3,  // 30% more XP needed
        50: 1.5,  // 50% more XP needed
        75: 1.8   // 80% more XP needed
    }
};

// ==========================================
// 💪 STAT GROWTH PER LEVEL
// ==========================================

const STAT_GROWTH = {
    BASE: {
        hp: 10, atk: 2, def: 1, mag: 1, spd: 1, luck: 1, crit: 0.5
    },
    CLASS_MODIFIERS: {
        FIGHTER: { hp: 1.5, atk: 1.3, def: 1.2, mag: 0.5, spd: 1.0, luck: 1.0, crit: 1.0 },
        SCOUT: { hp: 0.9, atk: 1.1, def: 0.8, mag: 0.6, spd: 1.5, luck: 1.3, crit: 1.5 },
        APPRENTICE: { hp: 0.7, atk: 0.6, def: 0.7, mag: 1.6, spd: 1.0, luck: 1.1, crit: 1.0 },
        ACOLYTE: { hp: 1.0, atk: 0.8, def: 1.0, mag: 1.3, spd: 1.0, luck: 1.2, crit: 0.8 },
        WARRIOR: { hp: 1.7, atk: 1.4, def: 1.5, mag: 0.4, spd: 0.8, luck: 1.0, crit: 0.9 },
        BERSERKER: { hp: 1.8, atk: 1.6, def: 1.0, mag: 0.3, spd: 1.1, luck: 0.9, crit: 1.4 },
        PALADIN: { hp: 1.6, atk: 1.2, def: 1.7, mag: 1.1, spd: 0.7, luck: 1.1, crit: 0.7 },
        ROGUE: { hp: 1.0, atk: 1.8, def: 0.5, mag: 0.3, spd: 2.0, luck: 1.5, crit: 2.5 },
        MONK: { hp: 1.2, atk: 1.4, def: 0.8, mag: 0.6, spd: 1.8, luck: 1.0, crit: 1.5 },
        MAGE: { hp: 0.6, atk: 0.5, def: 0.6, mag: 1.8, spd: 1.0, luck: 1.2, crit: 1.1 },
        WARLOCK: { hp: 0.7, atk: 0.6, def: 0.7, mag: 1.7, spd: 1.1, luck: 1.0, crit: 1.2 },
        ELEMENTALIST: { hp: 0.8, atk: 0.7, def: 0.8, mag: 1.6, spd: 1.2, luck: 1.1, crit: 1.0 },
        CLERIC: { hp: 1.2, atk: 0.7, def: 1.1, mag: 1.4, spd: 1.0, luck: 1.3, crit: 0.8 },
        DRUID: { hp: 1.1, atk: 1.0, def: 1.0, mag: 1.3, spd: 1.1, luck: 1.2, crit: 0.9 },
        NECROMANCER: { hp: 0.9, atk: 0.8, def: 0.9, mag: 1.5, spd: 0.9, luck: 1.0, crit: 1.3 },
        MERCHANT: { hp: 1.0, atk: 1.0, def: 1.0, mag: 1.0, spd: 1.0, luck: 2.0, crit: 1.0 },
        CHRONOMANCER: { hp: 0.8, atk: 0.9, def: 0.8, mag: 1.4, spd: 1.6, luck: 1.3, crit: 1.2 }
    },
    STAT_POINTS_PER_LEVEL: 3,
    MILESTONE_BONUSES: { 10: 5, 25: 10, 50: 15, 75: 20 }
};

// ==========================================
// 💾 DATA MANAGEMENT
// ==========================================

function loadProgression() {} // Managed by economy.js

function saveProgression(userId) {
    if (userId) economy.saveUser(userId);
}

function getUser(userId) {
    const mainUser = economy.getUser(userId);
    if (!mainUser) return null;

    if (!mainUser.progression) {
        mainUser.progression = {
            xp: 0, level: 1, gp: 0, totalGP: 0, commandsUsed: 0, statPoints: 0,
            allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
            totalXPEarned: 0, totalLevelsGained: 0, achievements: []
        };
        economy.saveUser(userId);
    }
    
    const p = mainUser.progression;
    if (!p.allocatedStats) p.allocatedStats = { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 };
    if (p.statPoints === undefined) p.statPoints = 0;
    if (p.gp === undefined) p.gp = 0;
    if (p.totalGP === undefined) p.totalGP = 0;
    if (p.commandsUsed === undefined) p.commandsUsed = 0;
    if (!p.achievements) p.achievements = [];
    
    return p;
}

// ==========================================
// 📊 XP CALCULATIONS
// ==========================================

function getXPForLevel(level) {
    if (level <= 1) return 0;
    let totalXP = 0;
    for (let i = 1; i < level; i++) {
        let xpNeeded = Math.floor(XP_CONFIG.BASE_XP * Math.pow(XP_CONFIG.SCALING_FACTOR, i - 1));
        for (const [milestone, multiplier] of Object.entries(XP_CONFIG.MILESTONES)) {
            if (i >= parseInt(milestone)) xpNeeded = Math.floor(xpNeeded * multiplier);
        }
        totalXP += xpNeeded;
    }
    return totalXP;
}

function getXPForNextLevel(userId) {
    const user = getUser(userId);
    if (!user) return 100;
    return getXPForLevel(user.level + 1) - getXPForLevel(user.level);
}

function getLevel(userId) {
    const user = getUser(userId);
    return user ? user.level : 1;
}

function getGP(userId) {
    const user = getUser(userId);
    return user ? (user.gp || 0) : 0;
}

function awardGP(userId, isGuildMember = false) {
    if (!isGuildMember) return { awarded: false };
    const user = getUser(userId);
    if (!user) return { awarded: false };
    const amount = 5;
    user.gp = (user.gp || 0) + amount;
    user.totalGP = (user.totalGP || 0) + amount;
    saveProgression(userId);
    return { awarded: true, gpGained: amount };
}

// ==========================================
// ⬆️ LEVEL UP SYSTEM
// ==========================================

function addXP(userId, amount = 10, source = 'Unknown') {
    const user = getUser(userId);
    if (!user) return { leveledUp: false, xpGained: 0 };

    const oldLevel = user.level;
    user.xp += amount;
    user.totalXPEarned += amount;
    user.commandsUsed = (user.commandsUsed || 0) + 1;
    
    const levelUps = [];
    while (user.level < XP_CONFIG.MAX_LEVEL) {
        if (user.xp >= getXPForLevel(user.level + 1)) {
            user.level++;
            levelUps.push(user.level);
        } else break;
    }
    
    saveProgression(userId);
    
    if (levelUps.length > 0) {
        let statPointsGained = levelUps.length * STAT_GROWTH.STAT_POINTS_PER_LEVEL;
        let skillPointsGained = levelUps.length;
        for (const level of levelUps) {
            if (STAT_GROWTH.MILESTONE_BONUSES[level]) statPointsGained += STAT_GROWTH.MILESTONE_BONUSES[level];
            if (level % 10 === 0) skillPointsGained += 2;
        }
        user.statPoints += statPointsGained;
        user.totalLevelsGained += levelUps.length;
        
        const mainUser = economy.getUser(userId);
        if (mainUser) {
            mainUser.skillPoints = (mainUser.skillPoints || 0) + skillPointsGained;
            economy.saveUser(userId);
        }
        
        return { leveledUp: true, oldLevel, newLevel: user.level, levelsGained: levelUps.length, statPointsGained, skillPointsGained, xpGained: amount, source };
    }
    return { leveledUp: false, xpGained: amount, source };
}

const ACHIEVEMENTS = {
    BEGINNER: { id: 'lvl_1', name: 'Newbie', icon: '🐣', desc: 'Reached Level 1' }
};

function checkLevelAchievements(userId, level) { return []; }
function checkCommandAchievements(userId) { return []; }
function checkGPAchievements(userId) { return []; }

// ==========================================
// 💪 STAT CALCULATION & ALLOCATION
// ==========================================

function getBaseStats(userId, classId) {
    const user = getUser(userId);
    const classSystem = require('./classSystem');
    const inventorySystem = require('./inventorySystem');
    
    if (!user) return { hp: 100, atk: 10, def: 10, mag: 10, spd: 10, luck: 10, crit: 5 };

    const classData = classSystem.getClassById(classId);
    if (!classData) return { hp: 100, atk: 10, def: 10, mag: 10, spd: 10, luck: 10, crit: 5 };
    
    const baseStats = { ...classData.stats };
    const classModifier = STAT_GROWTH.CLASS_MODIFIERS[classId] || STAT_GROWTH.CLASS_MODIFIERS.FIGHTER;
    const levelsGained = user.level - 1;
    
    for (const [stat, baseGrowth] of Object.entries(STAT_GROWTH.BASE)) {
        baseStats[stat] = (baseStats[stat] || 0) + Math.floor(baseGrowth * (classModifier[stat] || 1.0) * levelsGained);
    }
    
    const allocated = user.allocatedStats || {};
    for (const [stat, points] of Object.entries(allocated)) baseStats[stat] = (baseStats[stat] || 0) + points;
    
    const mainUser = economy.getUser(userId);
    if (mainUser && mainUser.statBonuses) {
        for (const [stat, bonus] of Object.entries(mainUser.statBonuses)) baseStats[stat] = (baseStats[stat] || 0) + bonus;
    }

    const equipStats = inventorySystem.getEquipmentStats(userId);
    for (const [stat, bonus] of Object.entries(equipStats)) {
        if (typeof baseStats[stat] !== 'undefined') baseStats[stat] += bonus;
    }
    
    baseStats.maxHp = baseStats.hp;
    baseStats.evasion = Math.min(40, (baseStats.spd * 0.1));
    baseStats.dmgReduction = Math.min(75, (baseStats.def * 0.5));
    baseStats.rareDropRate = (baseStats.luck * 0.05);
    
    return baseStats;
}

function allocateStatPoint(userId, stat, amount = 1) {
    const user = getUser(userId);
    if (!user) return { success: false, message: "User not found" };
    if (user.statPoints < amount) return { success: false, message: `Not enough stat points! Have: ${user.statPoints}, Need: ${amount}` };
    
    const validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit'];
    if (!validStats.includes(stat.toLowerCase())) return { success: false, message: `Invalid stat!` };
    
    const statValues = { hp: 15, atk: 3, def: 2, mag: 3, spd: 2, luck: 2, crit: 1 };
    user.allocatedStats[stat] = (user.allocatedStats[stat] || 0) + (statValues[stat] * amount);
    user.statPoints -= amount;
    saveProgression(userId);
    return { success: true, stat: stat.toUpperCase(), pointsSpent: amount, valueGained: statValues[stat] * amount, remainingPoints: user.statPoints };
}

function resetStats(userId) {
    const user = getUser(userId);
    if (!user) return { success: false, message: "User not found" };
    const totalPointsSpent = Object.values(user.allocatedStats).reduce((sum, val) => sum + Math.floor(val / 3), 0);
    user.allocatedStats = { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 };
    user.statPoints += totalPointsSpent;
    saveProgression(userId);
    return { success: true, pointsRefunded: totalPointsSpent, totalPoints: user.statPoints };
}

// ==========================================
// 📈 LEADERBOARDS & RANKINGS
// ==========================================

function getLeaderboard(type = 'level', limit = 10) {
    const allUsers = Array.from(economy.economyData.values());
    const leaderboard = allUsers.filter(u => u.progression).map(u => ({ userId: u.userId, ...u.progression }));
    const sortField = type === 'level' ? 'level' : 'totalXPEarned';
    leaderboard.sort((a, b) => (b[sortField] || 0) - (a[sortField] || 0));
    return leaderboard.slice(0, limit);
}

function calculateQuestXP(encounterType, difficulty, playerLevel) {
    let baseXP = XP_CONFIG.QUEST_BASE_XP;
    const encounterMultipliers = { 'COMBAT': 1.0, 'ELITE_COMBAT': 1.5, 'BOSS': XP_CONFIG.BOSS_MULTIPLIER, 'TRAP': 0.8, 'PUZZLE': 0.9, 'MERCHANT': 0.5, 'TREASURE': 0.7, 'EVENT': 0.8 };
    baseXP *= (encounterMultipliers[encounterType] || 1.0);
    baseXP *= difficulty;
    baseXP = Math.floor(baseXP * (1 + (playerLevel * 0.05)));
    return Math.max(50, baseXP);
}

function getCharacterSheet(userId) {
    const user = getUser(userId);
    const mainUser = economy.getUser(userId);
    if (!user || !mainUser) return null;
    const stats = getBaseStats(userId, mainUser.class);
    const xpProgress = user.xp - getXPForLevel(user.level);
    const xpForThisLevel = getXPForLevel(user.level + 1) - getXPForLevel(user.level);
    return {
        level: user.level, xp: user.xp, xpNeeded: getXPForLevel(user.level + 1) - user.xp,
        xpProgress, xpForThisLevel, progressPercent: Math.floor((xpProgress / xpForThisLevel) * 100),
        stats, statPoints: user.statPoints, totalXPEarned: user.totalXPEarned,
        totalLevelsGained: user.totalLevelsGained, class: mainUser.class, adventurerRank: mainUser.adventurerRank || 'F'
    };
}

function getLevelDisplay(level) {
    const icons = ['🌑', '🌘', '🌗', '🌖', '🌕', '☀️', '⭐', '🌟', '✨', '👑'];
    return `${icons[Math.min(Math.floor(level / 10), icons.length - 1)]} Level ${level}`;
}

function getProgressBar(percent, length = 10) {
    const filled = Math.floor((Math.max(0, Math.min(100, percent)) / 100) * length);
    return `[${'█'.repeat(filled)}${'░'.repeat(Math.max(0, length - filled))}]`;
}

function getUserStats(userId) {
    const user = getUser(userId);
    const sheet = getCharacterSheet(userId);
    if (!sheet) return { level: 1, xp: { current: 0, required: 100, total: 0, progress: 0, nextLevel: 100 }, gp: { current: 0, total: 0 }, commands: 0, achievements: [] };
    return {
        level: sheet.level,
        xp: { current: sheet.xpProgress, required: sheet.xpForThisLevel, total: sheet.xp, progress: sheet.progressPercent, nextLevel: sheet.xpNeeded },
        gp: { current: user.gp || 0, total: user.totalGP || 0 },
        commands: user.commandsUsed || 0, achievements: user.achievements || []
    };
}

function getUserRank(userId) {
    const leaderboard = getLeaderboard('xp', 1000);
    const index = leaderboard.findIndex(u => u.userId === userId);
    const totalUsers = economy.economyData.size || 1;
    const rank = index === -1 ? totalUsers : index + 1;
    return { rank, totalUsers, percentile: Math.floor(((totalUsers - rank) / totalUsers) * 100) };
}

function getRankEmoji(rank) { return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅'; }

module.exports = {
    loadProgression, saveProgression, getUser, addXP, awardXP: addXP, awardGP,
    getLevel, getGP, getXPForLevel, getXPForNextLevel, calculateQuestXP,
    getBaseStats, allocateStatPoint, resetStats, getUserStats, getUserRank,
    ACHIEVEMENTS, checkLevelAchievements, checkCommandAchievements, checkGPAchievements,
    getCharacterSheet, getLeaderboard, getXPLeaderboard: (limit) => getLeaderboard('xp', limit),
    getGPLeaderboard: (limit) => [], getLevelDisplay, getProgressBar, getRankEmoji,
    XP_CONFIG, STAT_GROWTH
};
