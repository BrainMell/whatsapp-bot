// ============================================
// 📊 COMPLETE RPG PROGRESSION SYSTEM
// ============================================
// Handles XP, leveling, stat growth, and character progression

const economy = require('./economy'); // Integrated with MongoDB

// ==========================================
// 📈 XP AND LEVELING CONFIGURATION
// ==========================================

const XP_CONFIG = {
    BASE_XP: 250,           // Base XP per level (used as floor for the exponential curve)
    SCALING_FACTOR: 1.18,   // XP increases by 18% per level
    MAX_LEVEL: 100,         // Level cap

    // XP Sources
    QUEST_BASE_XP: 100,     // Base XP per quest encounter
    QUEST_COMPLETION: 300,  // Bonus for completing a full quest

    // Level Milestones — these are TIERED REPLACEMENTS, not stacks.
    // At level 75, only the 1.8x multiplier applies (not 1.2*1.3*1.5*1.8=4.21x).
    // Previously the multipliers stacked, making late-game XP requirements
    // astronomical (220M XP for L75->L76) and effectively unobtainable.
    MILESTONES: {
        10: 1.2,  // 20% more XP needed per level from L10 onward
        25: 1.3,  // 30% more XP needed per level from L25 onward (replaces 1.2x)
        50: 1.5,  // 50% more XP needed per level from L50 onward (replaces 1.3x)
        75: 1.8   // 80% more XP needed per level from L75 onward (replaces 1.5x)
    }
};

// ==========================================
// 💪 STAT GROWTH PER LEVEL
// ==========================================

const STAT_GROWTH = {
    // Base values that scale up at higher levels
    getBaseGrowth: (level) => {
        const factor = 1 + Math.floor(level / 15); // Increase base growth every 15 levels
        return {
            hp: 15 * factor, 
            atk: 2.5 * factor, 
            def: 2.0 * factor, 
            mag: 2.5 * factor, 
            spd: 1.5 * factor, 
            luck: 1.2 * factor, 
            crit: 0.6 * factor
        };
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
        CHRONOMANCER: { hp: 0.8, atk: 0.9, def: 0.8, mag: 1.4, spd: 1.6, luck: 1.3, crit: 1.2 },
        DRAGONSLAYER: { hp: 1.7, atk: 1.8, def: 1.4, mag: 0.6, spd: 1.0, luck: 1.2, crit: 1.5 },
        SAMURAI: { hp: 1.2, atk: 1.7, def: 1.0, mag: 0.4, spd: 1.4, luck: 1.2, crit: 1.8 },
        NINJA: { hp: 0.9, atk: 1.6, def: 0.7, mag: 1.0, spd: 2.2, luck: 1.4, crit: 2.0 },
        BARD: { hp: 1.1, atk: 0.8, def: 0.9, mag: 1.2, spd: 1.3, luck: 1.8, crit: 1.0 },
        ARTIFICER: { hp: 1.2, atk: 1.1, def: 1.3, mag: 1.1, spd: 0.9, luck: 1.4, crit: 0.8 },
        // --- ASCENDED CLASSES ---
        ARCHMAGE: { hp: 1.0, atk: 0.8, def: 1.2, mag: 2.2, spd: 1.2, luck: 1.5, crit: 1.5 },
        WARLORD: { hp: 2.0, atk: 1.6, def: 2.0, mag: 0.5, spd: 0.9, luck: 1.2, crit: 1.2 },
        DOOMSLAYER: { hp: 2.2, atk: 2.0, def: 1.2, mag: 0.4, spd: 1.2, luck: 1.0, crit: 1.8 },
        TEMPLAR: { hp: 1.8, atk: 1.4, def: 2.2, mag: 1.2, spd: 0.8, luck: 1.3, crit: 1.0 },
        NIGHTBLADE: { hp: 1.2, atk: 2.0, def: 0.8, mag: 0.8, spd: 2.5, luck: 1.8, crit: 2.8 },
        ZENMASTER: { hp: 1.5, atk: 1.6, def: 1.2, mag: 1.2, spd: 2.0, luck: 1.5, crit: 1.8 },
        VOIDWALKER: { hp: 1.2, atk: 1.0, def: 1.2, mag: 2.0, spd: 1.2, luck: 1.2, crit: 1.5 },
        AVATAR: { hp: 1.4, atk: 1.2, def: 1.4, mag: 2.0, spd: 1.4, luck: 1.4, crit: 1.6 },
        LICH: { hp: 1.5, atk: 1.0, def: 1.5, mag: 2.1, spd: 1.0, luck: 1.2, crit: 1.5 },
        TIMELORD: { hp: 1.2, atk: 1.2, def: 1.2, mag: 1.8, spd: 2.5, luck: 1.5, crit: 1.5 },
        SAINT: { hp: 1.8, atk: 1.0, def: 1.8, mag: 1.8, spd: 1.2, luck: 1.8, crit: 1.2 },
        ARCHDRUID: { hp: 1.8, atk: 1.4, def: 1.6, mag: 1.8, spd: 1.4, luck: 1.5, crit: 1.4 },
        TYCOON: { hp: 1.5, atk: 1.5, def: 1.5, mag: 1.5, spd: 1.5, luck: 3.5, crit: 1.5 },
        DRAGON_GOD: { hp: 2.5, atk: 2.2, def: 2.2, mag: 1.5, spd: 1.5, luck: 1.8, crit: 1.8 },
        SHOGUN: { hp: 1.8, atk: 2.0, def: 1.5, mag: 0.8, spd: 1.8, luck: 1.5, crit: 2.2 },
        KAGE: { hp: 1.4, atk: 2.2, def: 1.0, mag: 1.2, spd: 2.8, luck: 2.0, crit: 3.0 },
        VIRTUOSO: { hp: 1.4, atk: 1.2, def: 1.2, mag: 1.8, spd: 1.6, luck: 2.5, crit: 1.5 },
        GRAND_INVENTOR: { hp: 1.6, atk: 1.4, def: 1.8, mag: 1.5, spd: 1.2, luck: 1.8, crit: 1.2 }
    },
    STAT_POINTS_PER_LEVEL: 5, // Restored from 3
    MILESTONE_BONUSES: { 10: 10, 25: 20, 50: 40, 75: 60, 100: 100 } // Restored bonuses
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

    // --- LEGACY XP FIX ---
    // If formula changed and user has negative progress, boost their total XP to match their level
    const minXPForLevel = getXPForLevel(p.level);
    const xpForNext = getXPForLevel(p.level + 1) - minXPForLevel;
    
    if ((p.xp || 0) < minXPForLevel) {
        // Boost them to 5% progress into their current level so they see a positive number
        const adjustment = (minXPForLevel + Math.floor(xpForNext * 0.05)) - (p.xp || 0);
        console.log(`[Progression] Legacy XP adjustment for ${userId} (Lv.${p.level}): +${adjustment}`);
        p.xp = (p.xp || 0) + adjustment;
        p.totalXPEarned = (p.totalXPEarned || 0) + adjustment;
        // ⚠️ FIX (audit Task 3 Q3 root cause #2): drop the redundant fire-and-forget
        // save here. The forward level-up sync below will save once after all
        // mutations are applied. The previous save captured PRE-sync state and
        // could race with the post-sync save in addXP, reverting level on restart.
    }

    // --- FORWARD LEVEL-UP SYNC (audit Task ID 3 BUG 1) ---
    // If the user's XP is enough for one or more level-ups but level hasn't
    // been bumped (e.g. an out-of-band write set progression.level=63 while
    // leaving progression.xp=103M, or a fire-and-forget save race reverted
    // the post-loop level), reconcile here. This makes the bug SELF-HEALING:
    // the next time the user opens their profile (.g me, .g stats, etc.),
    // getUser() runs and the level is corrected. Awards the same stat +
    // skill points the regular addXP path would have.
    //
    // Coerce to numbers first — defense against type-coercion bugs where
    // level/xp was written as a string (e.g. via .lean() skipping Mongoose
    // type casting on cache load — audit Task 3 Q3 root cause #3).
    p.level = Number(p.level) || 1;
    p.xp = Number(p.xp) || 0;
    if (p.level < 1) p.level = 1;
    if (p.level >= XP_CONFIG.MAX_LEVEL) {
        // At cap — clamp XP to the cap's threshold so the "416% progress"
        // display stops showing for max-level players.
        const capXP = getXPForLevel(XP_CONFIG.MAX_LEVEL);
        if (p.xp > capXP) p.xp = capXP;
    } else if (p.xp >= getXPForLevel(p.level + 1)) {
        const oldLevel = p.level;
        const levelUps = [];
        while (p.level < XP_CONFIG.MAX_LEVEL && p.xp >= getXPForLevel(p.level + 1)) {
            p.level++;
            levelUps.push(p.level);
        }
        if (levelUps.length > 0) {
            let statPointsGained = levelUps.length * STAT_GROWTH.STAT_POINTS_PER_LEVEL;
            let skillPointsGained = levelUps.length;
            for (const level of levelUps) {
                if (STAT_GROWTH.MILESTONE_BONUSES[level]) statPointsGained += STAT_GROWTH.MILESTONE_BONUSES[level];
                if (level % 10 === 0) skillPointsGained += 2;
            }
            p.statPoints = (p.statPoints || 0) + statPointsGained;
            p.totalLevelsGained = (p.totalLevelsGained || 0) + levelUps.length;
            const mainUser2 = economy.getUser(userId);
            if (mainUser2) {
                mainUser2.skillPoints = (mainUser2.skillPoints || 0) + skillPointsGained;
            }
            console.log(`[Progression] Forward level-up sync for ${userId}: Lv.${oldLevel} → Lv.${p.level} (+${levelUps.length} levels, +${statPointsGained} stat pts, +${skillPointsGained} skill pts)`);
            economy.saveUser(userId);
        }
    }

    return p;
}

// ==========================================
// 📊 XP CALCULATIONS
// ==========================================

function getXPForLevel(level) {
    if (level <= 1) return 0;

    // Overrides for early levels (2-5) to make early progression much faster
    const earlyXP = {
        2: 80,       // Level 2 (80 XP total)
        3: 200,      // Level 3 (200 XP total)
        4: 400,      // Level 4 (400 XP total)
        5: 700       // Level 5 (700 XP total)
    };
    if (earlyXP[level] !== undefined) return earlyXP[level];

    let totalXP = earlyXP[5];
    for (let i = 5; i < level; i++) {
        let xpNeeded = Math.floor(XP_CONFIG.BASE_XP * Math.pow(XP_CONFIG.SCALING_FACTOR, i - 1));
        // Apply milestone multipliers as TIERED REPLACEMENTS (not stacks).
        // Pick the single highest milestone tier that `i` has reached.
        // Stacking 1.2*1.3*1.5*1.8 = 4.21x at L75 makes late-game XP mathematically
        // unobtainable (~220M XP per level), so this was a critical balance bug.
        let milestoneMult = 1.0;
        for (const [tier, mult] of Object.entries(XP_CONFIG.MILESTONES)) {
            if (i >= Number(tier)) milestoneMult = mult;
        }
        xpNeeded = Math.floor(xpNeeded * milestoneMult);

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
    
    // NEW: Non-linear base growth
    const currentBaseGrowth = STAT_GROWTH.getBaseGrowth(user.level);
    for (const [stat, baseVal] of Object.entries(currentBaseGrowth)) {
        baseStats[stat] = (baseStats[stat] || 0) + Math.floor(baseVal * (classModifier[stat] || 1.0) * levelsGained);
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
    baseStats.maxEnergy = 100 + (levelsGained * 15) + (Math.floor(baseStats.mag * 3));
    baseStats.evasion = Math.min(45, (baseStats.spd * 0.12)); // Increased evasion cap
    baseStats.dmgReduction = Math.min(65, (baseStats.def * 0.55)); // Cap reduced from 80 → 65 to stop DEF over-stacking making enemies irrelevant
    baseStats.rareDropRate = (baseStats.luck * 0.06);
    
    return baseStats;
}

function allocateStatPoint(userId, stat, amount = 1) {
    const user = getUser(userId);
    if (!user) return { success: false, message: "User not found" };

    // Validate amount: must be a positive finite integer. Previously a
    // negative `amount` would slip past the `user.statPoints < amount`
    // check (e.g. statPoints=0, amount=-5: 0 < -5 is false, so it passes),
    // then `user.statPoints -= amount` would ADD stat points (0 - -5 = 5)
    // while `user.allocatedStats[s] += gainedValue` would SUBTRACT stats
    // (gainedValue = 3 * 1 * -5 = -15). The user could then reallocate
    // those free stat points elsewhere — a stat-point duplication exploit.
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
        return { success: false, message: "Amount must be a positive whole number!" };
    }
    amount = amt;

    if (user.statPoints < amount) return { success: false, message: `Not enough stat points! Have: ${user.statPoints}, Need: ${amount}` };
    
    const validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit'];
    const s = stat.toLowerCase();
    if (!validStats.includes(s)) return { success: false, message: `Invalid stat!` };
    
    // NEW: Tier-based scaling for point values
    const mainUser = economy.getUser(userId);
    const classSystem = require('./classSystem');
    const classData = mainUser ? classSystem.getClassById(mainUser.class) : null;
    
    let tierMultiplier = 1.0;
    if (classData?.tier === 'EVOLVED') tierMultiplier = 2.0; // Significant boost
    if (classData?.tier === 'ASCENDED') tierMultiplier = 2.0; // Balanced — was 4.0, halved to prevent stat explosion
    
    const baseStatValues = { hp: 15, atk: 3, def: 2, mag: 3, spd: 2, luck: 2, crit: 1 };
    
    // Soft cap: after 20 points invested in a single stat, each additional point
    // is worth only half. This discourages pure min-maxing without blocking it.
    const pointsAlreadyInStat = (user.allocatedStatPoints?.[s] || 0);
    const SOFT_CAP = 20;
    let effectiveMult = tierMultiplier;
    if (pointsAlreadyInStat >= SOFT_CAP) {
        effectiveMult = tierMultiplier * 0.5; // half-value after soft cap
    } else if (pointsAlreadyInStat + amount > SOFT_CAP) {
        // Partial: some points land below cap, some above
        const below = SOFT_CAP - pointsAlreadyInStat;
        const above = amount - below;
        const belowGain = Math.floor(baseStatValues[s] * tierMultiplier * below);
        const aboveGain = Math.floor(baseStatValues[s] * tierMultiplier * 0.5 * above);
        const gainedValue = belowGain + aboveGain;
        if (!user.allocatedStatPoints) user.allocatedStatPoints = {};
        user.allocatedStatPoints[s] = (user.allocatedStatPoints[s] || 0) + amount;
        user.allocatedStats[s] = (user.allocatedStats[s] || 0) + gainedValue;
        user.statPoints -= amount;
        saveProgression(userId);
        return { success: true, stat: stat.toUpperCase(), pointsSpent: amount, valueGained: gainedValue, remainingPoints: user.statPoints };
    }
    const gainedValue = Math.floor(baseStatValues[s] * effectiveMult * amount);
    
    // Track points spent per stat so resetStats can refund correctly
    if (!user.allocatedStatPoints) user.allocatedStatPoints = {};
    user.allocatedStatPoints[s] = (user.allocatedStatPoints[s] || 0) + amount;
    
    user.allocatedStats[s] = (user.allocatedStats[s] || 0) + gainedValue;
    user.statPoints -= amount;
    saveProgression(userId);
    return { success: true, stat: stat.toUpperCase(), pointsSpent: amount, valueGained: gainedValue, remainingPoints: user.statPoints };
}

function resetStats(userId) {
    const user = getUser(userId);
    if (!user) return { success: false, message: "User not found" };
    // Use tracked points spent if available; fall back to legacy approximation
    const totalPointsSpent = user.allocatedStatPoints
        ? Object.values(user.allocatedStatPoints).reduce((sum, v) => sum + v, 0)
        : Object.values(user.allocatedStats).reduce((sum, val) => sum + Math.floor(val / 3), 0);
    user.allocatedStats = { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 };
    user.allocatedStatPoints = { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 };
    user.statPoints += totalPointsSpent;
    saveProgression(userId);
    return { success: true, pointsRefunded: totalPointsSpent, totalPoints: user.statPoints };
}

// ==========================================
// 📈 LEADERBOARDS & RANKINGS
// ==========================================

function getLeaderboard(type = 'level', limit = 10) {
    const allUsers = Array.from(economy.economyData.values());
    if (type === 'pvp') {
        const leaderboard = allUsers.map(u => ({
            userId: u.userId,
            pvpWins: u.pvpWins || 0,
            pvpLosses: u.pvpLosses || 0
        }));
        leaderboard.sort((a, b) => (b.pvpWins || 0) - (a.pvpWins || 0));
        return leaderboard.slice(0, limit);
    }
    const leaderboard = allUsers.filter(u => u.progression).map(u => ({ userId: u.userId, ...u.progression }));
    const sortField = type === 'level' ? 'level' : 'totalXPEarned';
    leaderboard.sort((a, b) => (b[sortField] || 0) - (a[sortField] || 0));
    return leaderboard.slice(0, limit);
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
        totalLevelsGained: user.totalLevelsGained, class: mainUser.class, adventurerRank: mainUser.adventurerRank || 'F',
        gp: user.gp || 0, totalGP: user.totalGP || 0
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

function getGPLeaderboard(limit = 10) {
    // Previously this was a stub returning []. Now it actually queries the economy
    // cache and returns the top users by lifetime GP (totalGP).
    const allUsers = Array.from(economy.economyData.values());
    const leaderboard = allUsers
        .filter(u => u.registered && u.progression)
        .map(u => ({
            userId: u.userId,
            nickname: u.nickname || u.userId.split('@')[0],
            gp: u.progression.gp || 0,
            totalGP: u.progression.totalGP || 0,
        }))
        .sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0))
        .slice(0, limit);
    return leaderboard;
}

module.exports = {
    loadProgression, saveProgression, getUser, addXP, awardXP: addXP, awardGP,
    getLevel, getGP, getXPForLevel, getXPForNextLevel,
    getBaseStats, allocateStatPoint, resetStats, getUserStats, getUserRank,
    ACHIEVEMENTS, checkLevelAchievements, checkCommandAchievements, checkGPAchievements,
    getCharacterSheet, getLeaderboard,
    getXPLeaderboard: (limit) => getLeaderboard('xp', limit),
    getGPLeaderboard,
    getLevelDisplay, getProgressBar, getRankEmoji,
    XP_CONFIG, STAT_GROWTH
};
