# RPG Subsystem: Character Progression & Leveling

## What it is
The Character Progression Subsystem manages player experience points (XP), leveling calculations, class-based stat growth, stat point allocations, and character restarts/resets. XP is awarded through quest completions, bosses, combat encounters, and message activity. When XP triggers a level milestone, the player gains structural Stat Points and Skill Points. Manual point assignments scale dynamically based on the user's current class evolution tier (e.g. Base, Evolved, or Ascended). Progression details are stored inside user document fields and persisted in MongoDB.

## How it works

**XP Injection & Level Verification** — [progression.js L206–244](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L206-L244)
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

**Attribute Point Allocation** — [progression.js L300–329](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L300-L329)
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

**Character Stat Reset** — [progression.js L331–343](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L331-L343)
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
- **Modify maximum level cap** — Change level cap parameters in [progression.js L15](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L15).
- **Edit XP scaling factor** — Adjust leveling curve steepness parameters in [progression.js L14](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L14).
- **Adjust base quest XP rewards** — Tune standard quest experience payouts in [progression.js L18](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L18).
- **Alter level-up statutory rewards** — Modify points awarded upon leveling up in [progression.js L225–233](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L225-L233).
- **Update manual stat allocation yields** — Adjust base stats yields from allocated points in [progression.js L318](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L318).
- **Tweak evolution tier multipliers** — Adjust the multiplier values for Evolved or Ascended class tiers in [progression.js L314–316](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L314-L316).

---

## 5. Other Progression Commands

The progression subsystem also controls the following leaderboards, logs, and achievements:
* **`rank`**: Displays your current Adventurer Rank (e.g. F, E, D, C, B, A, S, SS) and the requirements (level, quests completed) needed to rank up.
* **`xptop`**: Leaderboard showing the top users ranked by experience points (XP).
* **`gptop`**: Leaderboard showing the top users ranked by guild points (GP contributed to their guild).
* **`achievements`**: Lists the accomplishments you have unlocked through milestones (like message count, money, bosses killed).
* **`graveyard`**: Lists hardcore characters who have perished, showing their JID, class, level, and cause of death.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They have a name, and you can assign a value to them. 
**General Example**: 
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**:
```javascript
const user = getUser(userId);
const oldLevel = user.level;
```
**How it works here**: Variables are used to store the result of the `getUser(userId)` function and the user's level. 
**Why it's used**: Variables are used to make the code more readable and to store values that will be used later in the program. 
**If you change/remove it**: If you remove the variable declarations, the code will throw an error because `user` and `oldLevel` will be undefined. If you change the variable names, you will need to update all references to the variable in the code.

---
### Concept 2: Functions
Functions are blocks of code that can be called multiple times from different parts of a program. They can take arguments and return values. 
**General Example**: 
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**:
```javascript
function addXP(userId, amount = 10, source = 'Unknown') {
  // ...
}
```
**How it works here**: The `addXP` function takes three arguments: `userId`, `amount`, and `source`. It uses these arguments to update the user's experience points and level. 
**Why it's used**: Functions are used to organize the code and make it reusable. 
**If you change/remove it**: If you remove the `addXP` function, the code will throw an error when it tries to call the function. If you change the function name or arguments, you will need to update all references to the function in the code.

---
### Concept 3: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions. 
**General Example**: 
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult.');
} else {
  console.log('You are a minor.');
}
```
**In Our Code**:
```javascript
if (!user) return { leveledUp: false, xpGained: 0 };
```
**How it works here**: The `if` statement checks if the `user` variable is falsy. If it is, the function returns an object with `leveledUp` set to `false` and `xpGained` set to `0`. 
**Why it's used**: Conditional statements are used to make decisions in the code and execute different blocks of code based on conditions. 
**If you change/remove it**: If you remove the `if` statement, the code will not check if the `user` variable is falsy, and it may throw an error or produce unexpected results. If you change the condition, you will need to update the code accordingly.

---
### Concept 4: Loops
Loops are used to execute a block of code repeatedly for a specified number of times. 
**General Example**: 
```javascript
for (let i = 0; i < 5; i++) {
  console.log(i);
}
```
**In Our Code**:
```javascript
while (user.level < XP_CONFIG.MAX_LEVEL) {
  if (user.xp >= getXPForLevel(user.level + 1)) {
    user.level++;
    levelUps.push(user.level);
  } else break;
}
```
**How it works here**: The `while` loop checks if the user's level is less than the maximum level. If it is, the loop checks if the user's experience points are greater than or equal to the experience points required for the next level. If they are, the user's level is incremented, and the new level is added to the `levelUps` array. 
**Why it's used**: Loops are used to execute a block of code repeatedly for a specified number of times. 
**If you change/remove it**: If you remove the `while` loop, the code will not update the user's level or add new levels to the `levelUps` array. If you change the condition or the loop type, you will need to update the code accordingly.

---
### Concept 5: Arrays
Arrays are used to store collections of values. 
**General Example**: 
```javascript
let colors = ['red', 'green', 'blue'];
console.log(colors[0]); // Outputs: red
```
**In Our Code**:
```javascript
const levelUps = [];
// ...
levelUps.push(user.level);
```
**How it works here**: The `levelUps` array is used to store the new levels that the user has achieved. The `push` method is used to add new levels to the array. 
**Why it's used**: Arrays are used to store collections of values. 
**If you change/remove it**: If you remove the `levelUps` array, the code will not store the new levels that the user has achieved. If you change the array name or the method used to add new levels, you will need to update the code accordingly.

---
### Concept 6: Objects
Objects are used to store collections of key-value pairs. 
**General Example**: 
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
```
**In Our Code**:
```javascript
const user = getUser(userId);
console.log(user.level);
```
**How it works here**: The `user` object is used to store the user's data, including their level. 
**Why it's used**: Objects are used to store collections of key-value pairs. 
**If you change/remove it**: If you remove the `user` object, the code will not have access to the user's data. If you change the object name or the property names, you will need to update the code accordingly.

---
### Concept 7: Imports
Imports are used to bring in external code or modules into a program. 
**General Example**: 
```javascript
const math = require('mathjs');
console.log(math.sqrt(16)); // Outputs: 4
```
**In Our Code**:
```javascript
const classSystem = require('./classSystem');
const classData = mainUser ? classSystem.getClassById(mainUser.class) : null;
```
**How it works here**: The `classSystem` module is imported, and its `getClassById` function is used to get the class data for the user. 
**Why it's used**: Imports are used to bring in external code or modules into a program. 
**If you change/remove it**: If you remove the import statement, the code will not have access to the `classSystem` module. If you change the import statement or the module name, you will need to update the code accordingly.

---
### Concept 8: Destructuring
Destructuring is used to extract values from arrays or objects into separate variables. 
**General Example**: 
```javascript
let arr = [1, 2, 3];
let [a, b, c] = arr;
console.log(a); // Outputs: 1
```
**In Our Code**:
No explicit example, but the concept is used implicitly in the code.

---
### Concept 9: Tier-based Scaling
Tier-based scaling is used to adjust the value of a stat based on the user's tier or level. 
**General Example**: 
```javascript
let tier = 'bronze';
let statValue = 10;
if (tier === 'bronze') {
  statValue *= 1.0;
} else if (tier === 'silver') {
  statValue *= 1.5;
}
console.log(statValue);
```
**In Our Code**:
```javascript
let tierMultiplier = 1.0;
if (classData?.tier === 'EVOLVED') tierMultiplier = 2.0;
if (classData?.tier === 'ASCENDED') tierMultiplier = 4.0;
const gainedValue = Math.floor(baseStatValues[s] * tierMultiplier * amount);
```
**How it works here**: The `tierMultiplier` variable is used to adjust the value of the stat based on the user's tier. 
**Why it's used**: Tier-based scaling is used to make the game more challenging or rewarding based on the user's progress. 
**If you change/remove it**: If you remove the tier-based scaling, the stat values will not be adjusted based on the user's tier. If you change the tier multipliers or the conditions, you will need to update the code accordingly.

---
### Concept 10: Base Stat Values
Base stat values are used to determine the initial value of a stat. 
**General Example**: 
```javascript
let baseStatValues = { hp: 10, atk: 5, def: 3 };
console.log(baseStatValues.hp); // Outputs: 10
```
**In Our Code**:
```javascript
const baseStatValues = { hp: 15, atk: 3, def: 2, mag: 3, spd: 2, luck: 2, crit: 1 };
const gainedValue = Math.floor(baseStatValues[s] * tierMultiplier * amount);
```
**How it works here**: The `baseStatValues` object is used to determine the initial value of a stat. 
**Why it's used**: Base stat values are used to make the game more balanced or challenging. 
**If you change/remove it**: If you remove the base stat values, the stat values will not be determined. If you change the base stat values or the conditions, you will need to update the code accordingly.
