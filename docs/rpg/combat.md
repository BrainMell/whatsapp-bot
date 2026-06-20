# RPG Subsystem: Combat & Battle Engine

## What it is
The Combat subsystem drives turn-based encounters (PvE and PvP) in the RPG module. It operates as an orchestrator between game states, combat AI, and a Go-based rendering microservice. When combat is triggered, player stats (retrieved from their MongoDB cache via `economy.getUser`) are normalized in memory along with enemy mob definitions. During each turn:
1. Active players submit commands (attacks, skills, items).
2. Mobs process their actions using AI decision-making (charging up actions, casting custom spells, or running default attacks).
3. The resulting state updates are handled in memory inside the `gameStates` structure.
4. The system updates the board graphic via the Go Image Service rendering client and pushes the generated buffer with a text summary back to the WhatsApp chat using the Baileys WebSocket connection (`sock.sendMessage`).

## How it works

**Payload Creation for Combat Renderer** — [combatImageGenerator.js L13-L48](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/combatImageGenerator.js#L13-L48)
```javascript
async function generateCombatImage(players, enemies, options = {}) {
    try {
        const payload = {
            players: players.map(p => ({
                name: String(p.name || 'Unknown'),
                class: String(p.class?.id || p.class || 'FIGHTER'),
                level: Math.floor(Number(p.level) || 1),
                hp: Math.floor(Number(p.hp || 0)),
                maxHp: Math.floor(Number(p.stats?.maxHp || p.maxHp || 100)),
                currentHP: Math.floor(Number(p.currentHP !== undefined ? p.currentHP : (p.hp || 0))),
                energy: Math.floor(Number(p.stats?.energy || p.energy || 100)),
                maxEnergy: Math.floor(Number(p.stats?.maxEnergy || p.maxEnergy || 100)),
                adventurerRank: String(p.adventurerRank || 'F'),
                spriteIndex: Math.floor(Number(p.spriteIndex) || 0)
            })),
            enemies: enemies.map(e => ({
                name: String(e.name || 'Enemy'),
                currentHP: Math.floor(Number(e.currentHP !== undefined ? e.currentHP : (e.stats?.hp || 0))),
                maxHp: Math.floor(Number(e.stats?.maxHp || e.stats?.hp || 100)),
                isBoss: Boolean(e.isBoss),
                justDied: Boolean(e.justDied),
                spriteIndex: Math.floor(Number(e.spriteIndex) || 0)
            })),
            combatType: String(options.combatType || 'PVE'),
            rank: String(options.rank || 'F'),
            background: String(options.backgroundPath ? options.backgroundPath.split(/[\/\\]/).pop() : 'forest1.png')
        };

        const imageBuffer = await goService.generateCombatImage(payload);
        
        return { success: true, buffer: imageBuffer };
    } catch (error) {
        console.error('❌ Combat image generation failed:', error.message);
        return { success: false, error: error.message };
    }
}
```
This function normalizes in-memory player attributes (levels, HP status, energy, ranks, sprites) and active enemy stats (isBoss, HP details, death indicator) to build a structured payload. It then queries the external Go rendering service to retrieve a buffer containing the combat layout graphic.

---

**Enemy AI Turn Resolution** — [performEnemyAction_new.js L1-L43](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/performEnemyAction_new.js#L1-L43)
```javascript
async function performEnemyAction(sock, enemy, sessionKey) {
    const state = gameStates.get(sessionKey);
    if (!state || !state.inCombat) return;

    const chatId = state.chatId;
    const turnDelay = state.solo ? 0 : GAME_CONFIG.ENEMY_TURN_TIME;

    return new Promise(async (resolve) => {
        try {
            // 🧠 AI DECISION MAKING
            const decision = monsterSkills.evaluateAction(enemy, state.players, state.enemies);

            let turnInfo = {
                actor: enemy,
                action: { name: 'Action' },
                target: null,
                damage: 0,
                effects: []
            };

            // --- RELEASE CHARGE ---
            if (decision.action === 'release_charge') {
                const followUpSkill = decision.skill;
                const target = decision.target;
                
                try {
                    await sock.sendMessage(chatId, { text: `💥 *${enemy.name}* UNLEASHES THE CHARGE!` });
                } catch (err) {}
                
                const effect = followUpSkill.currentEffect || (typeof followUpSkill.effect === 'function' ? followUpSkill.effect(enemy.level || 1) : followUpSkill.effect);
                await applyAbilityEffect(sock, enemy, followUpSkill, effect, state.players.indexOf(target), chatId);
                
                turnInfo.action.name = followUpSkill.name;
                turnInfo.target = target;
                enemy.isCharging = false;
                enemy.chargingSkill = null;
                enemy.chargeTarget = null;

                setTimeout(async () => {
                    await nextTurn(sock, turnInfo, sessionKey);
                    resolve();
                }, turnDelay);
                return;
            }
```
This function runs the enemy combat turn. It checks if the battle is active, queries the monster's skillset to evaluate moves, and executes actions. If the monster has a charged skill ready, it discharges it, applying the ability's effect, and progresses the turn state.

---

**Combat Scene rendering** — [combatIntegration.js L26-L39](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/combatIntegration.js#L26-L39)
```javascript
async function renderCombatTurn(players, enemies, turnInfo, options = {}) {
    try {
        const playersToShow = players.filter(p => p.currentHP > 0 || p.justDied);
        const enemiesToShow = enemies.filter(e => e.currentHP > 0 || e.justDied);
        const result = await combatImageGen.updateCombatImage(
            playersToShow, enemiesToShow, turnInfo,
            { rank: options.rank, backgroundPath: options.backgroundPath }
        );
        return result;
    } catch (error) {
        console.error('Combat turn render error:', error);
        return { success: false, error: error.message };
    }
}
```
This function acts as an integration layer between the combat engine and the rendering module. It filters out dead participants, preserving only alive players and enemies (along with those who just died to render their death animation), and updates the combat image using the generated image microservice.

---

## How to modify it

### Add Custom Weapon Verbs
To expand the list of active combat verbs when players hit with custom weapon types, edit `core/rpg/combatIntegration.js`.

```javascript
// Before (core/rpg/combatIntegration.js L83-91)
    let actionVerb = actor?.isEnemy ? 'unleashes' : 'uses';
    if (actor?.equipment?.main_hand) {
        const wName = actor.equipment.main_hand.name?.toLowerCase() || '';
        if (/hammer|club|mace|maul/.test(wName)) actionVerb = '🔨 *SMASHES* with';
        else if (/sword|blade|sabre|falchion/.test(wName)) actionVerb = '⚔️ *SLASHES* with';
        else if (/dagger|knife|spear|lance/.test(wName)) actionVerb = '🗡️ *PIERCES* with';
        else if (/staff|wand|rod/.test(wName)) actionVerb = '🔮 *CASTS* via';
        else if (/bow|crossbow/.test(wName)) actionVerb = '🏹 *SHOOTS* with';
    }
```

```javascript
// After (core/rpg/combatIntegration.js L83-91)
    let actionVerb = actor?.isEnemy ? 'unleashes' : 'uses';
    if (actor?.equipment?.main_hand) {
        const wName = actor.equipment.main_hand.name?.toLowerCase() || '';
        if (/hammer|club|mace|maul/.test(wName)) actionVerb = '🔨 *SMASHES* with';
        else if (/sword|blade|sabre|falchion/.test(wName)) actionVerb = '⚔️ *SLASHES* with';
        else if (/dagger|knife|spear|lance/.test(wName)) actionVerb = '🗡️ *PIERCES* with';
        else if (/staff|wand|rod/.test(wName)) actionVerb = '🔮 *CASTS* via';
        else if (/bow|crossbow/.test(wName)) actionVerb = '🏹 *SHOOTS* with';
        else if (/axe|halberd|cleaver/.test(wName)) actionVerb = '🪓 *CHOPS* with'; // Custom axe verb added
    }
```

### Alter Turn Delay Behaviors
To change the pace of combat actions, modify the delay logic inside `core/rpg/performEnemyAction_new.js`.

```javascript
// Before (core/rpg/performEnemyAction_new.js L5-7)
    const chatId = state.chatId;
    const turnDelay = state.solo ? 0 : GAME_CONFIG.ENEMY_TURN_TIME;
```

```javascript
// After (core/rpg/performEnemyAction_new.js L5-7)
    const chatId = state.chatId;
    const turnDelay = state.solo ? 0 : 2000; // Force a 2-second enemy turn delay regardless of config
```

## Common tasks
- **Add custom combat action verbs** — Customize the weapon type regex checks and action descriptions in [combatIntegration.js L84-91](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/combatIntegration.js#L84-L91).
- **Alter enemy AI turn delays** — Change the amount of time the bot waits before taking enemy combat turns in [performEnemyAction_new.js L6-8](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/performEnemyAction_new.js#L6-L8).
- **Modify normalized player properties payload** — Add or update fields passed from player data to the combat graphics generator in [combatImageGenerator.js L15-26](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/combatImageGenerator.js#L15-L26).
- **Modify normalized enemy properties payload** — Add or update fields passed from enemy data to the combat graphics generator in [combatImageGenerator.js L27-35](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/combatImageGenerator.js#L27-L35).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They can be thought of as labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const payload = {
    players: players.map(p => ({
        name: String(p.name || 'Unknown'),
        // ...
    })),
    // ...
};
```
**How it works here**: Variables are used to store values such as `payload`, `players`, and `enemies`. These variables are then used to store and manipulate data.
**Why it's used**: Variables are used to make the code more readable and maintainable. They allow us to give meaningful names to values and use them throughout the program.
**If you change/remove it**: If you remove the `payload` variable, the code will throw an error because it is used later in the program. If you change the variable name, you will need to update all references to it.

---
### Concept 2: Functions
Functions are blocks of code that can be called multiple times from different parts of a program. They are used to perform a specific task.
**General Example**
```javascript
function greet(name) {
    console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
async function generateCombatImage(players, enemies, options = {}) {
    // ...
}
```
**How it works here**: Functions are used to define reusable blocks of code, such as `generateCombatImage` and `performEnemyAction`. These functions take in parameters and return values.
**Why it's used**: Functions are used to make the code more modular and reusable. They allow us to break down a large program into smaller, manageable pieces.
**If you change/remove it**: If you remove the `generateCombatImage` function, the code will throw an error because it is called later in the program. If you change the function name, you will need to update all references to it.

---
### Concept 3: Async/Await
Async/await is a way to write asynchronous code that is easier to read and maintain. It allows us to write code that waits for a promise to resolve before continuing.
**General Example**
```javascript
async function example() {
    const data = await fetchData();
    console.log(data);
}
```
**In Our Code**
```javascript
async function generateCombatImage(players, enemies, options = {}) {
    try {
        const imageBuffer = await goService.generateCombatImage(payload);
        // ...
    } catch (error) {
        // ...
    }
}
```
**How it works here**: Async/await is used to wait for the `goService.generateCombatImage` promise to resolve before continuing with the rest of the code.
**Why it's used**: Async/await is used to make the code easier to read and maintain. It allows us to write asynchronous code that is easier to understand and debug.
**If you change/remove it**: If you remove the `async` keyword, the code will throw an error because it is using `await`. If you change the `await` expression, you will need to update the code to handle the new promise.

---
### Concept 4: Object Destructuring
Object destructuring is a way to extract values from an object and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 30 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**
```javascript
const state = gameStates.get(sessionKey);
if (!state || !state.inCombat) return;
const { chatId } = state;
```
**How it works here**: Object destructuring is used to extract the `chatId` value from the `state` object.
**Why it's used**: Object destructuring is used to make the code more concise and readable. It allows us to extract values from an object without having to use the dot notation.
**If you change/remove it**: If you remove the object destructuring, you will need to use the dot notation to access the `chatId` value. If you change the variable name, you will need to update all references to it.

---
### Concept 5: Array Methods
Array methods are functions that can be called on an array to perform a specific operation.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map(n => n * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
const playersToShow = players.filter(p => p.currentHP > 0 || p.justDied);
```
**How it works here**: Array methods are used to filter the `players` array and create a new array `playersToShow`.
**Why it's used**: Array methods are used to make the code more concise and readable. They allow us to perform common operations on arrays without having to use loops.
**If you change/remove it**: If you remove the array method, you will need to use a loop to perform the same operation. If you change the array method, you will need to update the code to handle the new operation.

---
### Concept 6: Conditional Statements
Conditional statements are used to execute different blocks of code based on a condition.
**General Example**
```javascript
const age = 25;
if (age >= 18) {
    console.log('You are an adult');
} else {
    console.log('You are a minor');
}
```
**In Our Code**
```javascript
if (decision.action === 'release_charge') {
    // ...
} else {
    // ...
}
```
**How it works here**: Conditional statements are used to execute different blocks of code based on the `decision.action` value.
**Why it's used**: Conditional statements are used to make the code more dynamic and responsive to different conditions.
**If you change/remove it**: If you remove the conditional statement, the code will always execute the same block of code. If you change the condition, you will need to update the code to handle the new condition.

---
### Concept 7: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when the operation is complete.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
    // asynchronous operation
    resolve('Success');
});
promise.then(result => console.log(result)); // Outputs: Success
```
**In Our Code**
```javascript
return new Promise(async (resolve) => {
    try {
        // ...
        resolve();
    } catch (error) {
        // ...
    }
});
```
**How it works here**: Promises are used to handle the asynchronous operation of the `performEnemyAction` function.
**Why it's used**: Promises are used to make the code more asynchronous and responsive to different conditions.
**If you change/remove it**: If you remove the promise, the code will not be able to handle the asynchronous operation. If you change the promise, you will need to update the code to handle the new promise.

---
### Concept 8: Error Handling
Error handling is used to catch and handle errors that occur during the execution of the code.
**General Example**
```javascript
try {
    // code that may throw an error
} catch (error) {
    console.error(error);
}
```
**In Our Code**
```javascript
try {
    const imageBuffer = await goService.generateCombatImage(payload);
    // ...
} catch (error) {
    console.error('❌ Combat image generation failed:', error.message);
    return { success: false, error: error.message };
}
```
**How it works here**: Error handling is used to catch and handle errors that occur during the execution of the `generateCombatImage` function.
**Why it's used**: Error handling is used to make the code more robust and responsive to different conditions.
**If you change/remove it**: If you remove the error handling, the code will throw an error and stop executing. If you change the error handling, you will need to update the code to handle the new error.

---
### Concept 9: String Interpolation
String interpolation is used to insert values into a string.
**General Example**
```javascript
const name = 'John';
const greeting = `Hello, ${name}!`;
console.log(greeting); // Outputs: Hello, John!
```
**In Our Code**
```javascript
try {
    await sock.sendMessage(chatId, { text: `💥 *${enemy.name}* UNLEASHES THE CHARGE!` });
} catch (err) {}
```
**How it works here**: String interpolation is used to insert the `enemy.name` value into the string.
**Why it's used**: String interpolation is used to make the code more concise and readable. It allows us to insert values into a string without having to use concatenation.
**If you change/remove it**: If you remove the string interpolation, you will need to use concatenation to insert the value into the string. If you change the string interpolation, you will need to update the code to handle the new value.

---
### Concept 10: Regular Expressions
Regular expressions are used to match patterns in strings.
**General Example**
```javascript
const regex = /hello/i;
const string = 'Hello World';
console.log(regex.test(string)); // Outputs: true
```
**In Our Code**
```javascript
if (/hammer|club|mace|maul/.test(wName)) actionVerb = '🔨 *SMASHES* with';
```
**How it works here**: Regular expressions are used to match patterns in the `wName` string.
**Why it's used**: Regular expressions are used to make the code more concise and readable. They allow us to match patterns in strings without having to use multiple `if` statements.
**If you change/remove it**: If you remove the regular expression, you will need to use multiple `if` statements to match the patterns. If you change the regular expression, you will need to update the code to handle the new pattern.

---

## 5. Reference Manual

> All scaling formulas, status effects, and boss mechanics below are extracted directly from `core/rpg/classEncounters.js`, `core/rpg/guildAdventure.js`, and `core/rpg/bossMechanics.js`. A contributor should never need to open those files to understand how combat stats are scaled, what status effects exist, or how boss phases function.

### 5.1 Dynamic Scaling Formulas

All enemies are scaled dynamically to match the player party size, character levels, and dungeon difficulty:

#### Standard Enemy Scaling (`scaleEnemyStats`)
* **Party Size Factor**: `1 + (partySize - 1) * 0.20` (+20% HP/ATK/MAG/DEF per extra player in the party).
* **Difficulty Scaling** (Rank Index = difficulty multiplier):
  * **Damage (ATK/MAG/DEF)**: `1 + (RankIndex * 0.12)` (+12% per difficulty rank index).
  * **Defense**: `1 + (RankIndex * 0.08)` (+8% per difficulty rank index).
  * **HP**: `1 + (RankIndex * 0.15)` (+15% per difficulty rank index).
  * **Speed**: `1 + (RankIndex * 0.10)` (+10% base speed per difficulty rank index).
* **Elite Scaling**: If the enemy ID contains `ELITE`, `KING`, `BOSS` or matches special elites, they gain:
  * `+25%` HP
  * `+20%` Speed
* **Rubber-Banding Speed Blending**:
  * Base target speed: Average player speed.
  * Archetype overrides:
    * `STALKER` / `ASSASSIN`: `averagePlayerSpeed * 1.5`
    * `TANK` / `BRUTE`: `averagePlayerSpeed * 0.95`
  * Level adjustments:
    * Level > 50: Speed is multiplied by `0.98` (-2%).
    * Level < 15: Speed is multiplied by `1.30` (+30%).
  * final scaled speed = `Math.floor((baseSpeed * 0.4) + (targetSpeed * 0.6))`

#### Boss scaling (`scaleBossStats`)
* **Party Size Factor**: `1 + (partySize - 1) * 0.20`.
* **Difficulty Scaling** (Rank Index):
  * **Damage (ATK/MAG)**: `1 + (RankIndex * 0.15)` (+15% per difficulty rank index).
  * **Defense**: `1 + (RankIndex * 0.10)` (+10% per difficulty rank index).
  * **HP**: `1 + (RankIndex * 0.30)` (+30% per difficulty rank index).
  * **Speed**: `1 + (RankIndex * 0.08)` (+8% base speed per difficulty rank index).
* **Rubber-Banding Speed Blending**:
  * Target speed = `averagePlayerSpeed * 1.05`
  * Level adjustment: Level > 60 reduces target speed by 5% (multiplied by `0.95`).
  * final scaled speed = `Math.floor((baseSpeed * 0.5) + (targetSpeed * 0.5))`

---

### 5.2 Status Effects Catalog

These status effects can be applied to players or enemies during combat turns:

| ID | Name | Icon | Type / Effect | Default Values |
|---|---|---|---|---|
| `poison` | Poison | 🧪 | Damage over time | 10 per turn |
| `burn` | Burn | 🔥 | Damage over time | 15 per turn |
| `bleed` | Bleed | 🩸 | Damage over time | 12 per turn |
| `shock` | Shock | ⚡ | Damage over time | 15 per turn |
| `regen` | Regeneration | 💚 | Heal over time | 10 per turn |
| `freeze` | Freeze | ❄️ | Skip turn | Duration: 1 turn |
| `stun` | Stun | 💫 | Skip turn | Duration: 1 turn |
| `sleep` | Sleep | 😴 | Skip turn | Wakes up on damage |
| `root` | Root | 🌿 | Cannot move | Can still attack |
| `silence` | Silence | 🤐 | Cannot cast | Lock abilities |
| `slow` | Slow | 🐌 | Reduce speed | -50% speed |
| `haste` | Haste | ⚡ | Increase speed | +30% speed |
| `curse` | Curse | 💀 | Reduce stats | -20% stats |
| `weak` | Weakened | 😵 | Reduce stats | -20% stats |
| `vulnerability` | Vulnerable | 💔 | Reduce defense | -30% defense |
| `shield` | Shield | 🛡️ | Absorb damage | 50 points flat |
| `blessing` | Blessing | ✨ | Increase stats | +20% stats |
| `berserk` | Berserk | 😡 | Increase dmg | +50% damage / -30% defense |
| `taunt` | Taunted | 😠 | Force target | Must attack the taunter |
| `charm` | Charmed | 💖 | Change side | Duration: 2 turns |
| `wet` | Wet | 💧 | Primer | Element synergy primer |
| `oil` | Oiled | 🛢️ | Primer | Element synergy primer |
| `brittle` | Brittle | ❄️💔 | Damage amp | +50% physical damage taken |

---

### 5.3 Boss Mechanics Framework

Boss encounters operate under advanced mechanics tracked by `BossPhaseManager` and `BossFightManager`:

* **Multi-Phase Transitions**: Triggers automatically at configured boss HP percentages:
  * Triggers transition to phase index `i` if `bossHP <= phase[i].threshold`.
  * Phase changes update active `boss.abilities` list and trigger custom phase messages.
* **Phase Effects**:
  * `stat_boost`: Additive stat growth (e.g., `boss.stats[stat] += Math.floor(baseStat * value / 100)`).
  * `heal`: Heals boss by a flat amount or percentage of max HP.
  * `summon`: Spawns add monsters to support the boss.
* **Enrage Mechanics**:
  * **Hard Enrage**: Instant death trigger if turn count exceeds `boss.enrageTimer`.
  * **Soft Enrage**: Stacking stat growth (`boss.stats[effect.stat] += effect.value`) per turn after the turn threshold `boss.softEnrage.turnThreshold` is met.
