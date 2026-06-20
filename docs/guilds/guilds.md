# RPG Subsystem: Factions & Guilds

## What it is
The Guilds and Factions Subsystem provides player association, cooperative milestones, daily challenges, and guild base building upgrades. Players can join or establish custom guilds classified under specific archetypes (such as Adventurer, Merchant, or Research archetypes). Guild systems cache mapping records inside memory blocks synced with MongoDB document structures (`guilds` and `systems` collections). The subsystem features dynamic daily guild boards that track members' monster kills, Zeni gains, and crafting completions to reward active participants with XP and bank fund payouts.

## How it works

**Guild Caches Hydration** — [guilds.js L74–124](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L74-L124)
```javascript
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
```
This module connects to MongoDB upon system launch to fetch and populate structural in-memory maps tracking user memberships, owners, pending requests, and guild upgrade milestones.

---

**Factions Guild Creation** — [guilds.js L216–285](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L216-L285)
```javascript
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
 
`
```
This is the guild creation entry point. It verifies that the requestor doesn't already own or belong to another faction, performs case-insensitive name uniqueness checks, initializes base statistics, builds default facility entries, generates a daily challenge board, and persists modifications.

---

**Daily Board Progress Updates** — [guilds.js L854–882](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L854-L882)
```javascript
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
```
This utility adjusts a guild's daily challenge progress counter when members trigger actions like defeating enemies or earning Zeni. It validates daily check-in windows, updates target objectives, checks if all board parameters are fulfilled, maps reward yields, and pushes edits to database instances.

## How to modify it

### Updating Archetype Parameters
To edit or customize faction perks, icons, or descriptions, modify `GUILD_ARCHETYPES` inside `core/rpg/guilds.js`.

**Before (core/rpg/guilds.js L21–28):**
```javascript
const GUILD_ARCHETYPES = {
  ADVENTURER: {
    name: 'Adventurers Guild',
    icon: '⚔️',
    description: 'Focuses on monster hunting and combat.',
    perks: 'Increases XP from monsters by 15%.',
    questType: 'KILL'
  },
```

**After (core/rpg/guilds.js L21–28):**
```javascript
const GUILD_ARCHETYPES = {
  ADVENTURER: {
    name: 'Adventurers Guild',
    icon: '⚔️',
    description: 'Focuses on monster hunting and combat.',
    perks: 'Increases XP from monsters by 25%.', // Modified XP bonus perk
    questType: 'KILL'
  },
```

### Expanding Initial Faction Building Slots
To append custom upgrade targets or change starting building levels when a guild is registered, modify the configuration block in `createGuild`.

**Before (core/rpg/guilds.js L267–271):**
```javascript
    buildings: {
      hall: { level: 1, name: 'Guild Hall' },
      training: { level: 0, name: 'Training Ground' },
      treasury: { level: 0, name: 'Treasury' }
    }
```

**After (core/rpg/guilds.js L267–271):**
```javascript
    buildings: {
      hall: { level: 1, name: 'Guild Hall' },
      training: { level: 0, name: 'Training Ground' },
      treasury: { level: 0, name: 'Treasury' },
      armory: { level: 0, name: 'Armory' } // Appended armory module slot
    }
```

## Common tasks
- **Modify archetype settings or icons** — Edit archetypes and perks maps in [guilds.js L21–43](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L21-L43).
- **Edit daily board challenge lifespan** — Adjust check interval thresholds for board generation resets in [guilds.js L859](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L859).
- **Adjust default building configurations** — Edit levels or name profiles of faction buildings in [guilds.js L267–271](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L267-L271).
- **Modify board completion XP rewards** — Update rewards payouts awarded upon daily milestone completions in [guilds.js L875–879](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L875-L879).
- **Tune registration verification loops** — Adjust member/ownership validation operations in [guilds.js L216–250](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L216-L250).










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
const sys = await System.findOne({ key: 'guild_system' }).lean();
const guilds = await GuildModel.find({}).lean();
```
**How it works here**: Variables are used to store the results of database queries, such as `sys` and `guilds`. 
**Why it's used**: Variables are used to store values that need to be used later in the program. 
**If you change/remove it**: If you remove the variable declarations, the program will throw an error because it won't know what `sys` and `guilds` are. If you change the variable names, you'll need to update all references to them in the code.

---
### Concept 2: Async/Await
Async/await is a way to write asynchronous code that's easier to read and understand. It allows you to write code that waits for a promise to resolve before continuing. 
**General Example**: 
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**:
```javascript
async function loadGuilds() {
  try {
    await connectDB();
    // ...
  } catch (err) {
    console.error("Error loading guilds from DB:", err.message);
  }
}
```
**How it works here**: Async/await is used to wait for the `connectDB` function to complete before loading the guilds. 
**Why it's used**: Async/await is used to make the code easier to read and understand, and to avoid using callbacks. 
**If you change/remove it**: If you remove the async/await, the code will throw an error because it won't wait for the `connectDB` function to complete. If you change the async/await to a callback, the code will still work, but it will be harder to read and understand.

---
### Concept 3: Conditional Statements
Conditional statements are used to make decisions in a program. They allow you to execute different blocks of code based on conditions. 
**General Example**: 
```javascript
if (x > 5) {
  console.log('x is greater than 5');
} else {
  console.log('x is less than or equal to 5');
}
```
**In Our Code**:
```javascript
if (sys && sys.value) {
  globalGuildData.memberGuilds = sys.value.memberGuilds || {};
  globalGuildData.guildOwners = sys.value.guildOwners || {};
  globalGuildData.guildInvites = sys.value.guildInvites || {};
}
```
**How it works here**: Conditional statements are used to check if the `sys` variable is truthy and if it has a `value` property. If it does, the code inside the if statement is executed. 
**Why it's used**: Conditional statements are used to make decisions in the program and to execute different blocks of code based on conditions. 
**If you change/remove it**: If you remove the conditional statement, the code will throw an error because it won't check if `sys` is truthy before trying to access its properties. If you change the condition, the code will execute different blocks of code based on the new condition.

---
### Concept 4: Loops
Loops are used to execute a block of code repeatedly. They allow you to iterate over arrays or objects and perform actions on each item. 
**General Example**: 
```javascript
for (let i = 0; i < 5; i++) {
  console.log(i);
}
```
**In Our Code**:
```javascript
for (const g of guilds) {
  const titles = {};
  const admins = [];
  const members = [];
  // ...
}
```
**How it works here**: Loops are used to iterate over the `guilds` array and perform actions on each guild. 
**Why it's used**: Loops are used to execute a block of code repeatedly and to iterate over arrays or objects. 
**If you change/remove it**: If you remove the loop, the code will only execute once and won't iterate over the `guilds` array. If you change the loop condition, the code will iterate over the array differently.

---
### Concept 5: Objects
Objects are used to store key-value pairs. They allow you to store data in a structured way and access it using keys. 
**General Example**: 
```javascript
const person = { name: 'John', age: 30 };
console.log(person.name); // Outputs: John
```
**In Our Code**:
```javascript
const guild = {
  members: [creatorJid],
  owner: creatorJid,
  admins: [],
  titles: {},
  // ...
};
```
**How it works here**: Objects are used to store guild data in a structured way and access it using keys. 
**Why it's used**: Objects are used to store data in a structured way and to access it using keys. 
**If you change/remove it**: If you remove the object, the code will throw an error because it won't know how to access the guild data. If you change the object structure, the code will need to be updated to access the data correctly.

---
### Concept 6: Functions
Functions are used to group a block of code together and execute it multiple times. They allow you to reuse code and make it more modular. 
**General Example**: 
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**:
```javascript
function createGuild(guildName, creatorJid, archetype = 'ADVENTURER') {
  // ...
}
```
**How it works here**: Functions are used to group a block of code together and execute it multiple times. The `createGuild` function is used to create a new guild. 
**Why it's used**: Functions are used to reuse code and make it more modular. 
**If you change/remove it**: If you remove the function, the code will throw an error because it won't know how to create a new guild. If you change the function signature, the code will need to be updated to call the function correctly.

---
### Concept 7: Array Methods
Array methods are used to perform actions on arrays. They allow you to iterate over arrays, filter them, and more. 
**General Example**: 
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map(n => n * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**:
```javascript
if (Object.keys(info.guilds).some(g => g.toLowerCase() === lowerName)) {
  return { success: false, message: "Guild name already taken!" };
}
```
**How it works here**: Array methods are used to iterate over the `info.guilds` object and check if a guild with the same name already exists. 
**Why it's used**: Array methods are used to perform actions on arrays and objects. 
**If you change/remove it**: If you remove the array method, the code will throw an error because it won't know how to check if a guild with the same name already exists. If you change the array method, the code will perform a different action on the array.

---
### Concept 8: Error Handling
Error handling is used to catch and handle errors that occur in a program. It allows you to prevent the program from crashing and provide a better user experience. 
**General Example**: 
```javascript
try {
  const data = fetchData();
} catch (err) {
  console.error(err);
}
```
**In Our Code**:
```javascript
try {
  await connectDB();
  // ...
} catch (err) {
  console.error("Error loading guilds from DB:", err.message);
}
```
**How it works here**: Error handling is used to catch and handle errors that occur when connecting to the database or loading guilds. 
**Why it's used**: Error handling is used to prevent the program from crashing and provide a better user experience. 
**If you change/remove it**: If you remove the error handling, the program will crash if an error occurs. If you change the error handling, the program will handle errors differently.

---
### Concept 9: Destructuring
Destructuring is used to extract values from objects and arrays. It allows you to assign values to variables in a concise way. 
**General Example**: 
```javascript
const person = { name: 'John', age: 30 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**:
```javascript
const { memberGuilds, guildOwners, guildInvites } = sys.value;
```
**How it works here**: Destructuring is used to extract values from the `sys.value` object and assign them to variables. 
**Why it's used**: Destructuring is used to extract values from objects and arrays in a concise way. 
**If you change/remove it**: If you remove the destructuring, the code will throw an error because it won't know how to extract the values. If you change the destructuring, the code will extract different values.

---
### Concept 10: Object Property Access
Object property access is used to access properties of an object. It allows you to access values using dot notation or bracket notation. 
**General Example**: 
```javascript
const person = { name: 'John', age: 30 };
console.log(person.name); // Outputs: John
console.log(person['age']); // Outputs: 30
```
**In Our Code**:
```javascript
globalGuildData.guilds[guildName] = {
  members: [creatorJid],
  owner: creatorJid,
  // ...
};
```
**How it works here**: Object property access is used to access properties of the `globalGuildData.guilds` object and assign values to them. 
**Why it's used**: Object property access is used to access properties of objects. 
**If you change/remove it**: If you remove the object property access, the code will throw an error because it won't know how to access the properties. If you change the object property access, the code will access different properties.

---
### Concept 11: Promises
Promises are used to handle asynchronous operations. They allow you to write code that waits for a promise to resolve before continuing. 
**General Example**: 
```javascript
const promise = new Promise((resolve, reject) => {
  // ...
});
promise.then((data) => {
  console.log(data);
});
```
**In Our Code**:
```javascript
const sys = await System.findOne({ key: 'guild_system' }).lean();
```
**How it works here**: Promises are used to handle the asynchronous operation of finding a document in the database. 
**Why it's used**: Promises are used to handle asynchronous operations and write code that waits for a promise to resolve before continuing. 
**If you change/remove it**: If you remove the promise, the code will throw an error because it won't know how to handle the asynchronous operation. If you change the promise, the code will handle the asynchronous operation differently.

---
### Concept 12: Database Operations
Database operations are used to interact with a database. They allow you to create, read, update, and delete data in a database. 
**General Example**: 
```javascript
const db = mongoose.connect('mongodb://localhost/mydb');
db.collection('users').find().then((users) => {
  console.log(users);
});
```
**In Our Code**:
```javascript
const guilds = await GuildModel.find({}).lean();
```
**How it works here**: Database operations are used to find all guilds in the database and retrieve their data. 
**Why it's used**: Database operations are used to interact with a database and perform CRUD (create, read, update, delete) operations. 
**If you change/remove it**: If you remove the database operation, the code will throw an error because it won't know how to interact with the database. If you change the database operation, the code will interact with the database differently.

---
### Concept 13: Modules and Imports
Modules and imports are used to organize code into reusable modules. They allow you to import functions and variables from other modules and use them in your code. 
**General Example**: 
```javascript
const math = require('./math');
console.log(math.add(2, 3)); // Outputs: 5
```
**In Our Code**:
```javascript
const GUILD_ARCHETYPES = {
  ADVENTURER: {
    name: 'Adventurers Guild',
    // ...
  },
};
```
**How it works here**: Modules and imports are not explicitly used in this code snippet, but the `GUILD_ARCHETYPES` object is defined in a separate module and imported into this code. 
**Why it's used**: Modules and imports are used to organize code into reusable modules and make it easier to maintain and update. 
**If you change/remove it**: If you remove the module or import, the code will throw an error because it won't know how to access the `GUILD_ARCHETYPES` object. If you change the module or import, the code will use a different module or import.

---
### Concept 14: Type Checking
Type checking is used to ensure that a value is of a certain type. It allows you to prevent errors and make your code more robust. 
**General Example**: 
```javascript
if (typeof x === 'number') {
  console.log('x is a number');
} else {
  console.log('x is not a number');
}
```
**In Our Code**:
```javascript
const type = GUILD_ARCHETYPES[archetype.toUpperCase()] ? archetype.toUpperCase() : 'ADVENTURER';
```
**How it works here**: Type checking is not explicitly used in this code snippet, but the `archetype.toUpperCase()` expression is used to ensure that the `archetype` value is a string. 
**Why it's used**: Type checking is used to prevent errors and make your code more robust. 
**If you change/remove it**: If you remove the type checking, the code may throw an error if the `archetype` value is not a string. If you change the type checking, the code will check the type of the `archetype` value differently.

---
### Concept 15: Object Literals
Object literals are used to create objects in a concise way. They allow you to define an object with a set of key-value pairs. 
**General Example**: 
```javascript
const person = { name: 'John', age: 30 };
console.log(person); // Outputs: { name: 'John', age: 30 }
```
**In Our Code**:
```javascript
const guild = {
  members: [creatorJid],
  owner: creatorJid,
  // ...
};
```
**How it works here**: Object literals are used to create a guild object with a set of key-value pairs. 
**Why it's used**: Object literals are used to create objects in a concise way. 
**If you change/remove it**: If you remove the object literal, the code will throw an error because it won't know how to create the guild object. If you change the object literal, the code will create a different object.

---
### Concept 16: Array Methods (some, every, filter, map)
Array methods are used to perform actions on arrays. They allow you to iterate over arrays, filter them, and more. 
**General Example**: 
```javascript
const numbers = [1, 2, 3, 4, 5];
const evenNumbers = numbers.filter(n => n % 2 === 0);
console.log(evenNumbers); // Outputs: [2, 4]
```
**In Our Code**:
```javascript
if (Object.keys(info.guilds).some(g => g.toLowerCase() === lowerName)) {
  return { success: false, message: "Guild name already taken!" };
}
```
**How it works here**: Array methods are used to iterate over the `info.guilds` object and check if a guild with the same name already exists. 
**Why it's used**: Array methods are used to perform actions on arrays and objects. 
**If you change/remove it**: If you remove the array method, the code will throw an error because it won't know how to check if a guild with the same name already exists. If you change the array method, the code will perform a different action on the array.

---
### Concept 17: Ternary Operator
The ternary operator is used to make decisions in a concise way. It allows you to execute different blocks of code based on a condition. 
**General Example**: 
```javascript
const x = 5;
const result = x > 10 ? 'x is greater than 10' : 'x is less than or equal to 10';
console.log(result); // Outputs: x is less than or equal to 10
```
**In Our Code**:
```javascript
const type = GUILD_ARCHETYPES[archetype.toUpperCase()] ? archetype.toUpperCase() : 'ADVENTURER';
```
**How it works here**: The ternary operator is used to make a decision based on whether the `archetype` value is a valid guild archetype. 
**Why it's used**: The ternary operator is used to make decisions in a concise way. 
**If you change/remove it**: If you remove the ternary operator, the code will throw an error because it won't know how to make the decision. If you change the ternary operator, the code will make a different decision.

---
### Concept 18: Date and Time
Date and time are used to work with dates and times in JavaScript. They allow you to create dates, calculate time differences, and more. 
**General Example**: 
```javascript
const date = new Date();
console.log(date); // Outputs: current date and time
```
**In Our Code**:
```javascript
const guild = {
  // ...
  createdAt: Date.now(),
  // ...
};
```
**How it works here**: Date and time are used to create a timestamp for when the guild was created. 
**Why it's used**: Date and time are used to work with dates and times in JavaScript. 
**If you change/remove it**: If you remove the date and time, the code will throw an error because it won't know how to create the timestamp. If you change the date and time, the
