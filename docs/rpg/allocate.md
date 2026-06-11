# Allocate Command Flow (`allocate`)

## 1. Description
The Allocate command allows players to spend unspent stat points earned during XP level milestones. Spending points increases core attributes (HP, ATK, DEF, MAG, SPD, LUCK, CRIT) with scaling multipliers depending on the user's current class evolution tier (e.g. 2x boost for Evolved, 4x boost for Ascended classes).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j allocate atk 5"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "allocate") (L146)
            └── core/commands/progressionCommands.js
                └── handleAllocateCommand(sock, chatId, senderJid, args, m) (L360)
                    └── Parse args: stat (atk), amount (5)
                    └── If no args:
                        └── Retrieve statPoints available
                        └── Format allocation helper guide & cost returns
                    └── Else:
                        └── core/rpg/progression.js
                            └── allocateStatPoint(senderJid, stat, amount) (L300)
                                └── Verify stat points available >= amount
                                └── check validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit']
                                └── Fetch class evolution tier (Base, Evolved, Ascended)
                                └── Calculate gainedValue = baseStatValues[stat] * tierMultiplier * amount
                                └── user.allocatedStats[stat] += gainedValue
                                └── user.statPoints -= amount
                                └── saveProgression(senderJid)
            └── sock.sendMessage(chatId, { text: successMsg }) (L394)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

```javascript
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
          if (type !== "notify" && type !== "append") return;
          if (isRekeying) return;

          await Promise.all(
            messages.map(async (m) => {
              if (!m.message) return;
```

#### Explanation
- Listens to incoming messages from Baileys. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L146)
* **Line Numbers**: Around 146
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Redirects execution to progressionCommands controller

```javascript
                    if (primaryCmd === "allocate") {
                      await progressionCommands.handleAllocateCommand(
                        sock,
                        chatId,
                        senderJid,
                        cmdArgs.slice(1),
                        m,
                      );
                      return;
                    }
```

#### Explanation
- Recognizes `.j allocate` and calls `progressionCommands.handleAllocateCommand`.

---

### Step 3: Argument Parsing and Usage Guide
* **File Path**: [core/commands/progressionCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/progressionCommands.js#L360-L382)
* **Line Numbers**: 360-382
* **Called From**: `handleAllocateCommand()`
* **Inputs**: `args` array
* **Outputs**: Prints points usage guide if no parameters are specified

```javascript
async function handleAllocateCommand(sock, chatId, senderJid, args, m) {
  try {
    const stat = args[0];
    const amount = parseInt(args[1]) || 1;

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
```

#### Explanation
- If no stat ID is specified (e.g. user just typed `.j allocate`), grabs the user's current sheet unspent points and prints a full stat benefits matrix.

---

### Step 4: Class Tier Scaling and Attributes Mutation
* **File Path**: [core/rpg/progression.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L300-L329)
* **Line Numbers**: 300-329
* **Called From**: `handleAllocateCommand()`
* **Inputs**: `(senderJid, stat, amount)`
* **Outputs**: Returns success state, updates points spent tracking, and mutates user stats

```javascript
function allocateStatPoint(userId, stat, amount = 1) {
    const user = getUser(userId);
    if (!user) return { success: false, message: "User not found" };
    if (user.statPoints < amount) return { success: false, message: `Not enough stat points! Have: ${user.statPoints}, Need: ${amount}` };
    
    const validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit'];
    const s = stat.toLowerCase();
    if (!validStats.includes(s)) return { success: false, message: `Invalid stat!` };
    
    const mainUser = economy.getUser(userId);
    const classSystem = require('./classSystem');
    const classData = mainUser ? classSystem.getClassById(mainUser.class) : null;
    
    let tierMultiplier = 1.0;
    if (classData?.tier === 'EVOLVED') tierMultiplier = 2.0;
    if (classData?.tier === 'ASCENDED') tierMultiplier = 4.0;
    
    const baseStatValues = { hp: 15, atk: 3, def: 2, mag: 3, spd: 2, luck: 2, crit: 1 };
    const gainedValue = Math.floor(baseStatValues[s] * tierMultiplier * amount);
    
    if (!user.allocatedStatPoints) user.allocatedStatPoints = {};
    user.allocatedStatPoints[s] = (user.allocatedStatPoints[s] || 0) + amount;
    
    user.allocatedStats[s] = (user.allocatedStats[s] || 0) + gainedValue;
    user.statPoints -= amount;
    saveProgression(userId);
```

#### Explanation
1. Checks that the stat points available are greater than or equal to the amount.
2. Asserts target stat ID is valid.
3. Queries user's active class information from the database:
   - **Base class**: 1x stats scaling.
   - **Evolved class**: 2x stats scaling.
   - **Ascended class**: 4x stats scaling.
4. Multiplies stat bases (e.g. HP: 15, ATK: 3) by the evolution multiplier and the amount of points spent.
5. Records the spent point allocation inside `user.allocatedStatPoints[stat]` (so they can be refunded upon stats reset).
6. Increments the actual stat value inside `user.allocatedStats[stat]`.
7. Subtracts the points from user available pool and saves to MongoDB.
8. Sends a success summary back to the WhatsApp thread.

---

## 4. How to Modify
To adjust stat allocation rules:
- **Change Base Stat Values**: Modify the `baseStatValues` object in [core/rpg/progression.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L318).
- **Change Class Tier Multipliers**: Adjust the multipliers inside [core/rpg/progression.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L314-L316).
- **Reset Stats cost**: If you want to charge players Zeni to reset their allocated stats, edit `resetStats` function in `core/rpg/progression.js`.










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
const stat = args[0];
const amount = parseInt(args[1]) || 1;
```
**How it works here**: In the code, `stat` and `amount` are variables used to store the values of the first and second arguments passed to the `handleAllocateCommand` function.
**Why it's used**: Variables are used to store and manipulate data in the program. In this case, they are used to store the stat and amount values.
**If you change/remove it**: If you remove the variables, the program will not be able to store and manipulate the stat and amount values, and will likely result in errors.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
let greet = (name) => { console.log(`Hello, ${name}!`); };
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the code, an arrow function is used as an event listener for the `messages.upsert` event. The function is called whenever the event is triggered, and it receives the `messages` and `type` parameters.
**Why it's used**: Arrow functions are used to define small, single-purpose functions. In this case, it is used to define an event listener.
**If you change/remove it**: If you remove the arrow function, the event listener will not be defined, and the program will not respond to the `messages.upsert` event.

---
### Concept 3: Event Listeners
Event listeners are functions that are called in response to specific events or actions. They are used to handle user interactions, network requests, and other events.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the code, an event listener is used to listen for the `messages.upsert` event. When the event is triggered, the event listener function is called.
**Why it's used**: Event listeners are used to handle user interactions and other events. In this case, it is used to handle the `messages.upsert` event.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event, and will not be able to handle the event.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are defined using the `if` and `else` keywords.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult!');
} else {
  console.log('You are a minor!');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: In the code, conditional statements are used to check the `type` and `isRekeying` variables. If the conditions are not met, the function returns immediately.
**Why it's used**: Conditional statements are used to execute different blocks of code based on certain conditions. In this case, they are used to filter out certain events.
**If you change/remove it**: If you remove the conditional statements, the function will not filter out certain events, and may execute unnecessary code.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They are defined using the `map`, `filter`, and `reduce` keywords.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubledNumbers = numbers.map((num) => num * 2);
console.log(doubledNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: In the code, the `map` method is used to transform the `messages` array into an array of promises. The `Promise.all` method is then used to wait for all the promises to resolve.
**Why it's used**: Array methods are used to manipulate and transform arrays. In this case, they are used to transform the `messages` array into an array of promises.
**If you change/remove it**: If you remove the array method, the code will not be able to transform the `messages` array, and will not be able to wait for all the promises to resolve.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations. They are defined using the `Promise` keyword.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Success!');
});
promise.then((result) => {
  console.log(result); // Outputs: Success!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: In the code, promises are used to handle the asynchronous operations of sending messages. The `Promise.all` method is used to wait for all the promises to resolve.
**Why it's used**: Promises are used to handle asynchronous operations. In this case, they are used to handle the asynchronous operations of sending messages.
**If you change/remove it**: If you remove the promises, the code will not be able to handle the asynchronous operations of sending messages, and will likely result in errors.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises. It is used to write asynchronous code that is easier to read and maintain.
**General Example**
```javascript
async function example() {
  let result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
async function handleAllocateCommand(sock, chatId, senderJid, args, m) {
  // ...
}
```
**How it works here**: In the code, async/await is used to define the `handleAllocateCommand` function. The `await` keyword is used to wait for the promises to resolve.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain. In this case, it is used to define the `handleAllocateCommand` function.
**If you change/remove it**: If you remove the async/await syntax, the code will not be able to handle the asynchronous operations, and will likely result in errors.

---
### Concept 8: Destructuring
Destructuring is a syntax sugar that allows you to extract values from arrays and objects.
**General Example**
```javascript
let [name, age] = ['John', 25];
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the code, destructuring is used to extract the `messages` and `type` values from the event object.
**Why it's used**: Destructuring is used to extract values from arrays and objects. In this case, it is used to extract the `messages` and `type` values from the event object.
**If you change/remove it**: If you remove the destructuring syntax, the code will not be able to extract the `messages` and `type` values, and will likely result in errors.

---
### Concept 9: Imports
Imports are used to import modules and functions from other files.
**General Example**
```javascript
import { example } from './example.js';
example();
```
**In Our Code**
```javascript
const classSystem = require('./classSystem');
```
**How it works here**: In the code, the `require` function is used to import the `classSystem` module from the `classSystem.js` file.
**Why it's used**: Imports are used to import modules and functions from other files. In this case, it is used to import the `classSystem` module.
**If you change/remove it**: If you remove the import statement, the code will not be able to use the `classSystem` module, and will likely result in errors.

---
### Concept 10: Number Parsing
Number parsing is used to convert strings to numbers.
**General Example**
```javascript
let num = parseInt('123');
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const amount = parseInt(args[1]) || 1;
```
**How it works here**: In the code, the `parseInt` function is used to convert the `args[1]` string to a number. If the conversion fails, the `||` operator is used to default to 1.
**Why it's used**: Number parsing is used to convert strings to numbers. In this case, it is used to convert the `args[1]` string to a number.
**If you change/remove it**: If you remove the number parsing, the code will not be able to convert the `args[1]` string to a number, and will likely result in errors.

---
### Concept 11: Database Operations
Database operations are used to interact with a database.
**General Example**
```javascript
let db = require('./db.js');
db.save('example', { name: 'John' });
```
**In Our Code**
```javascript
saveProgression(userId);
```
**How it works here**: In the code, the `saveProgression` function is used to save the user's progression to the database.
**Why it's used**: Database operations are used to interact with a database. In this case, it is used to save the user's progression to the database.
**If you change/remove it**: If you remove the database operation, the code will not be able to save the user's progression, and will likely result in data loss.

---

## 5. Reference Manual

> All values below are extracted directly from `core/rpg/progression.js`. A contributor should never need to open that file to understand allocatable stats or stat point economy.

---

### Allocatable Stat Keys

These are the only valid stat identifiers for `.j allocate <stat> <points>`:

| Stat Key | Description | Effect |
|---|---|---|
| `hp` | Health Points | Increases max HP |
| `atk` | Attack | Increases physical damage |
| `def` | Defense | Reduces physical damage received |
| `mag` | Magic | Increases magical damage output |
| `spd` | Speed | Improves turn order, dodge chance |
| `luck` | Luck | Improves drop rates, crit bonus |
| `crit` | Critical Hit Rate | Increases chance of dealing double damage |

---

### Stat Points Economy

| Source | Points Gained |
|---|---|
| Per level-up | **5 stat points** |
| Level 10 milestone | +10 bonus stat points |
| Level 25 milestone | +20 bonus stat points |
| Level 50 milestone | +40 bonus stat points |
| Level 75 milestone | +60 bonus stat points |
| Level 100 milestone | +100 bonus stat points |

---

### Base Stat Growth Per Level

Every level-up grants automatic stat growth **before** allocated points, scaling every 15 levels:

```
factor = 1 + floor(level / 15)
hp_growth  = 15 × factor  (per level)
atk_growth = 2.5 × factor
def_growth = 2.0 × factor
mag_growth = 2.5 × factor
spd_growth = 1.5 × factor
luck_growth= 1.2 × factor
crit_growth= 0.6 × factor
```

This growth is then multiplied by the class's **stat modifier** (see below).

---

### Class Stat Modifiers

Each class multiplies base growth by these factors:

| Class | HP | ATK | DEF | MAG | SPD | LUCK | CRIT |
|---|---|---|---|---|---|---|---|
| `FIGHTER` | ×1.5 | ×1.3 | ×1.2 | ×0.5 | ×1.0 | ×1.0 | ×1.0 |
| `SCOUT` | ×0.9 | ×1.1 | ×0.8 | ×0.6 | ×1.5 | ×1.3 | ×1.5 |
| `APPRENTICE` | ×0.7 | ×0.6 | ×0.7 | ×1.6 | ×1.0 | ×1.1 | ×1.0 |
| `ACOLYTE` | ×1.0 | ×0.8 | ×1.0 | ×1.3 | ×1.0 | ×1.2 | ×0.8 |
| `WARRIOR` | ×1.7 | ×1.4 | ×1.5 | ×0.4 | ×0.8 | ×1.0 | ×0.9 |
| `BERSERKER` | ×1.8 | ×1.6 | ×1.0 | ×0.3 | ×1.1 | ×0.9 | ×1.4 |
| `PALADIN` | ×1.6 | ×1.2 | ×1.7 | ×1.1 | ×0.7 | ×1.1 | ×0.7 |
| `ROGUE` | ×1.0 | ×1.8 | ×0.5 | ×0.3 | ×2.0 | ×1.5 | ×2.5 |
| `MONK` | ×1.2 | ×1.4 | ×0.8 | ×0.6 | ×1.8 | ×1.0 | ×1.5 |
| `MAGE` | ×0.6 | ×0.5 | ×0.6 | ×1.8 | ×1.0 | ×1.2 | ×1.1 |
| `WARLOCK` | ×0.7 | ×0.6 | ×0.7 | ×1.7 | ×1.1 | ×1.0 | ×1.2 |
| `ELEMENTALIST` | ×0.8 | ×0.7 | ×0.8 | ×1.6 | ×1.2 | ×1.1 | ×1.0 |
| `CLERIC` | ×1.2 | ×0.7 | ×1.1 | ×1.4 | ×1.0 | ×1.3 | ×0.8 |
| `DRUID` | ×1.1 | ×1.0 | ×1.0 | ×1.3 | ×1.1 | ×1.2 | ×0.9 |
| `NECROMANCER` | ×0.9 | ×0.8 | ×0.9 | ×1.5 | ×0.9 | ×1.0 | ×1.3 |
| `MERCHANT` | ×1.0 | ×1.0 | ×1.0 | ×1.0 | ×1.0 | ×2.0 | ×1.0 |
| `DRAGONSLAYER` | ×1.7 | ×1.8 | ×1.4 | ×0.6 | ×1.0 | ×1.2 | ×1.5 |
| `SAMURAI` | ×1.2 | ×1.7 | ×1.0 | ×0.4 | ×1.4 | ×1.2 | ×1.8 |
| `NINJA` | ×0.9 | ×1.6 | ×0.7 | ×1.0 | ×2.2 | ×1.4 | ×2.0 |
| `BARD` | ×1.1 | ×0.8 | ×0.9 | ×1.2 | ×1.3 | ×1.8 | ×1.0 |
| `ARCHMAGE` | ×1.0 | ×0.8 | ×1.2 | ×2.2 | ×1.2 | ×1.5 | ×1.5 |
| `WARLORD` | ×2.0 | ×1.6 | ×2.0 | ×0.5 | ×0.9 | ×1.2 | ×1.2 |
| `DOOMSLAYER` | ×2.2 | ×2.0 | ×1.2 | ×0.4 | ×1.2 | ×1.0 | ×1.8 |
| `NIGHTBLADE` | ×1.2 | ×2.0 | ×0.8 | ×0.8 | ×2.5 | ×1.8 | ×2.8 |
| `TYCOON` | ×1.5 | ×1.5 | ×1.5 | ×1.5 | ×1.5 | ×3.5 | ×1.5 |
| `DRAGON_GOD` | ×2.5 | ×2.2 | ×2.2 | ×1.5 | ×1.5 | ×1.8 | ×1.8 |
| `KAGE` | ×1.4 | ×2.2 | ×1.0 | ×1.2 | ×2.8 | ×2.0 | ×3.0 |

---

### How to Reset Allocated Stats

Allocated stats can be refunded by purchasing a **Skill Reset Scroll** from the shop:
- **Command**: `.j buy skill_reset`
- **Cost**: 1,000 Zeni
- **Effect**: All invested `allocatedStats` are set to 0 and `statPoints` are fully refunded.
