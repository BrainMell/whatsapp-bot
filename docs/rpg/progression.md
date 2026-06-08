# RPG Subsystem: Character Progression & Leveling

## What it is
The Character Progression Subsystem manages player experience points (XP), leveling calculations, class-based stat growth, stat point allocations, and character restarts/resets. XP is awarded through quest completions, bosses, combat encounters, and message activity. When XP triggers a level milestone, the player gains structural Stat Points and Skill Points. Manual point assignments scale dynamically based on the user's current class evolution tier (e.g. Base, Evolved, or Ascended). Progression details are stored inside user document fields and persisted in MongoDB.

## How it works

**XP Injection & Level Verification** — [progression.js L206–244](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L206-L244)
```javascript
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
```
This is the progression engine's main update gateway. It increments raw XP counters, checks level progression loops against experience tables, rewards players with stat and skill points (with bonuses for 10-level increments), updates the MongoDB state, and formats outputs.

---

**Attribute Point Allocation** — [progression.js L300–329](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L300-L329)
```javascript
function allocateStatPoint(userId, stat, amount = 1) {
    const user = getUser(userId);
    if (!user) return { success: false, message: "User not found" };
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
    if (classData?.tier === 'ASCENDED') tierMultiplier = 4.0; // Massive leap
    
    const baseStatValues = { hp: 15, atk: 3, def: 2, mag: 3, spd: 2, luck: 2, crit: 1 };
    const gainedValue = Math.floor(baseStatValues[s] * tierMultiplier * amount);
    
    // Track points spent per stat so resetStats can refund correctly
    if (!user.allocatedStatPoints) user.allocatedStatPoints = {};
    user.allocatedStatPoints[s] = (user.allocatedStatPoints[s] || 0) + amount;
    
    user.allocatedStats[s] = (user.allocatedStats[s] || 0) + gainedValue;
    user.statPoints -= amount;
    saveProgression(userId);
    return { success: true, stat: stat.toUpperCase(), pointsSpent: amount, valueGained: gainedValue, remainingPoints: user.statPoints };
}
```
This utility allocates earned stat points to a player's core attributes. It checks point availability, scales stats based on class evolution level multipliers (e.g. 2x for evolved class tier, 4x for ascended class tier), increments stats, and logs points allocated for refund tracking.

---

**Character Stat Reset** — [progression.js L331–343](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L331-L343)
```javascript
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
```
This method resets all character stat points allocated by the player. It sums up points spent across attributes, reverts stats to baseline values, refunds the unspent points pool, and persists changes to MongoDB.

## How to modify it

### Updating XP Level Scaling Parameters
To configure maximum player levels or adjust progression XP curves, update the parameters in `XP_CONFIG` inside `core/rpg/progression.js`.

**Before (core/rpg/progression.js L12–15):**
```javascript
const XP_CONFIG = {
    BASE_XP: 250,           // XP needed for level 2
    SCALING_FACTOR: 1.18,   // XP increases by 18% per level
    MAX_LEVEL: 100,         // Level cap
```

**After (core/rpg/progression.js L12–15):**
```javascript
const XP_CONFIG = {
    BASE_XP: 300,           // Increased base XP requirement
    SCALING_FACTOR: 1.15,   // Reduced scaling factor from 1.18 to 1.15
    MAX_LEVEL: 150,         // Raised cap to level 150
```

### Adjusting Attribute Allocation Yields
To customize the baseline statistics gained per point allocated, modify the mapping dictionary in `allocateStatPoint`.

**Before (core/rpg/progression.js L318–319):**
```javascript
    const baseStatValues = { hp: 15, atk: 3, def: 2, mag: 3, spd: 2, luck: 2, crit: 1 };
    const gainedValue = Math.floor(baseStatValues[s] * tierMultiplier * amount);
```

**After (core/rpg/progression.js L318–319):**
```javascript
    const baseStatValues = { hp: 20, atk: 4, def: 3, mag: 4, spd: 3, luck: 3, crit: 2 }; // Increased base stat payouts
    const gainedValue = Math.floor(baseStatValues[s] * tierMultiplier * amount);
```

## Common tasks
- **Modify maximum level cap** — Change level cap parameters in [progression.js L15](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L15).
- **Edit XP scaling factor** — Adjust leveling curve steepness parameters in [progression.js L14](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L14).
- **Adjust base quest XP rewards** — Tune standard quest experience payouts in [progression.js L18](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L18).
- **Alter level-up statutory rewards** — Modify points awarded upon leveling up in [progression.js L225–233](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L225-L233).
- **Update manual stat allocation yields** — Adjust base stats yields from allocated points in [progression.js L318](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L318).
- **Tweak evolution tier multipliers** — Adjust the multiplier values for Evolved or Ascended class tiers in [progression.js L314–316](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L314-L316).
