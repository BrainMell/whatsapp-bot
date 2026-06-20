# Guild Board Command Flow (`guild board`)

## 1. Description
The `guild board` command displays the daily quest board for a player's guild. It displays target progress bars (e.g. killing specific monsters, crafting items, or earning Zeni), lists shared rewards (Guild XP and Zeni), and automatically generates a new list of daily targets if the board is older than 24 hours.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j guild board" or ".j board"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check (L9278-9284)
            └── core/rpg/guilds.js
                └── displayGuildBoard(sock, chatId, senderJid) (L884)
                    ├── Retrieve player's guild: globalGuildData.memberGuilds[senderJid]
                    ├── If none found, return "not in guild" error (L888)
                    ├── Inspect last update duration (Date.now() - dailyBoard.lastUpdate > 86400000)
                    ├── If expired or empty, trigger generateDailyBoard(guildName) (L298)
                    │   ├── Determine targets (Zeni target for Merchant, Crafting for Research, Monster kills for others)
                    │   └── Save & Sync state: syncGuild(guildName)
                    ├── Retrieve GUILD_ARCHETYPES info and currency configurations
                    ├── Construct targets progress indicators & lists
                    └── sock.sendMessage(chatId, { text: boardStatusMsg })
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
- Receives message updates from WhatsApp events.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L9278-L9297)
* **Line Numbers**: 9278-9297
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Invokes `guilds.displayGuildBoard`

```javascript
                    // `${botConfig.getPrefix().toLowerCase()}` guild board
                    if (
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} guild board` ||
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} board`
                    ) {
                      try {
                        await guilds.displayGuildBoard(sock, chatId, senderJid);
                      } catch (err) {
                        console.error("Guild board error:", err);
                        await sock.sendMessage(chatId, {
                          text:
                            BOT_MARKER + "❌❌ Failed to fetch guild board!",
                        });
                      }
                      await awardProgression(senderJid, chatId);
                      return;
                    }
```

#### Explanation
- Catches the `.j guild board` or `.j board` command patterns.
- Invokes `displayGuildBoard` in `guilds.js`.
- Automatically grants conversational progression experience via `awardProgression()` afterwards.

---

### Step 3: Refreshing Targets & Rendering Layout
* **File Path**: [core/rpg/guilds.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L884-L936)
* **Line Numbers**: 884-936
* **Called From**: `displayGuildBoard()`
* **Inputs**: `(sock, chatId, userJid)`
* **Outputs**: Sends current board information to conversation room

```javascript
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
  // ... (append rewards section)
  await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
}
```

#### Explanation
1. Checks the player's active guild membership mapping in `globalGuildData.memberGuilds[userJid]`.
2. Verifies the date of the last board refresh against `86400000ms` (24 hours).
3. If expired, calls `generateDailyBoard(guildName)` to set up a new targets board.
4. Reads archetype configurations to customize target formats and renders progress bar segments dynamically.
5. Emits the daily target list text block back to WhatsApp.

---

### Step 4: Generating New Daily Targets
* **File Path**: [core/rpg/guilds.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L298-L331)
* **Line Numbers**: 298-331
* **Called From**: `generateDailyBoard()`
* **Inputs**: `(guildName)`
* **Outputs**: Reinitializes targets in the `globalGuildData` object and saves to disk

```javascript
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
```

#### Explanation
1. Measures targets requirements scaled by guild level and member size to keep difficulty balanced.
2. Selects goals according to the guild's specialization type:
   - **MERCHANT**: Accumulate Zeni targets.
   - **RESEARCH**: Craft a set amount of items.
   - **Others**: Kills 3 random monsters matching the level threshold.
3. Sets up reward scales for Guild XP and Zeni, sets `completed` to false, and writes the state to persistent files using `syncGuild()`.

---

## 4. How to Modify
- **Change Board Reset Duration**: Edit the 24h threshold check `86400000` in [core/rpg/guilds.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L897).
- **Scale Rewards Up/Down**: Adjust XP/Zeni coefficients in `dailyBoard.rewards` inside [core/rpg/guilds.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js#L324-L327).
- **Modify Monster Hunt Pools**: Adjust logic in `getAvailableTargets()` or the generation math loop.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They have a name and a value, and can be changed or updated as needed.
**General Example**
```javascript
let name = 'John';
console.log(name); // outputs: John
```
**In Our Code**
```javascript
const info = globalGuildData;
const guildName = info.memberGuilds[userJid];
```
**How it works here**: The code uses variables to store data about the guild and the user's guild membership. The `info` variable stores the global guild data, and the `guildName` variable stores the name of the user's guild.
**Why it's used**: Variables are used to store and manipulate data, making it easier to write and understand the code.
**If you change/remove it**: If you remove the `info` variable, the code will not be able to access the global guild data. If you remove the `guildName` variable, the code will not be able to determine the user's guild membership.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax and can be used as event handlers or as arguments to other functions.
**General Example**
```javascript
const greet = (name) => {
  console.log(`Hello, ${name}!`);
};
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code uses an arrow function as an event handler for the `messages.upsert` event. The function is called whenever a new message is received, and it processes the message data.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as event handlers or as arguments to other functions.
**If you change/remove it**: If you remove the arrow function, the code will not be able to handle the `messages.upsert` event. If you change the arrow function to a traditional function, the code will still work, but it may be less concise.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program, such as user input or network requests. They are defined using the `on` method and can be used to handle events in a flexible and modular way.
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
**How it works here**: The code uses an event listener to respond to the `messages.upsert` event. The event listener is defined using the `on` method and is called whenever a new message is received.
**Why it's used**: Event listeners are used to respond to events in a flexible and modular way, making it easier to write and maintain the code.
**If you change/remove it**: If you remove the event listener, the code will not be able to respond to the `messages.upsert` event. If you change the event listener to listen for a different event, the code will respond to the new event instead.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They are defined using the `if` and `else` keywords and can be used to control the flow of the program.
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
**How it works here**: The code uses conditional statements to make decisions based on the `type` and `isRekeying` variables. If the conditions are not met, the function returns early.
**Why it's used**: Conditional statements are used to make decisions in a program and control the flow of the code.
**If you change/remove it**: If you remove the conditional statements, the code will not be able to make decisions based on the `type` and `isRekeying` variables. If you change the conditions, the code will make different decisions.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays in a program. They are defined using the `map`, `filter`, and `reduce` methods and can be used to perform common operations on arrays.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubled = numbers.map((num) => num * 2);
console.log(doubled); // outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The code uses the `map` method to transform the `messages` array into a new array of promises. The `Promise.all` method is then used to wait for all the promises to resolve.
**Why it's used**: Array methods are used to manipulate and transform arrays in a program, making it easier to write and maintain the code.
**If you change/remove it**: If you remove the `map` method, the code will not be able to transform the `messages` array. If you change the `map` method to a different array method, the code will perform a different operation on the array.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations in a program. They are defined using the `Promise` constructor and can be used to wait for operations to complete.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Done!');
});
promise.then((result) => {
  console.log(result); // outputs: Done!
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
**How it works here**: The code uses promises to wait for the asynchronous operations to complete. The `Promise.all` method is used to wait for all the promises to resolve.
**Why it's used**: Promises are used to handle asynchronous operations in a program, making it easier to write and maintain the code.
**If you change/remove it**: If you remove the promises, the code will not be able to wait for the asynchronous operations to complete. If you change the promises to a different asynchronous handling mechanism, the code will use a different approach to handle asynchronous operations.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code. It is defined using the `async` and `await` keywords and can be used to write asynchronous code that is easier to read and maintain.
**General Example**
```javascript
async function example() {
  let result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
async function displayGuildBoard(sock, chatId, userJid) {
  // ...
}
```
**How it works here**: The code uses async/await to write asynchronous code that is easier to read and maintain. The `async` keyword is used to define an asynchronous function, and the `await` keyword is used to wait for promises to resolve.
**Why it's used**: Async/await is used to make asynchronous code easier to write and maintain, making it a more readable and maintainable codebase.
**If you change/remove it**: If you remove the async/await syntax, the code will not be able to write asynchronous code in a readable and maintainable way. If you change the async/await syntax to a different asynchronous handling mechanism, the code will use a different approach to handle asynchronous operations.

---
### Concept 8: Object Destructuring
Object destructuring is a syntax sugar that makes it easier to extract properties from objects. It is defined using the `{}` syntax and can be used to extract properties from objects in a concise way.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code uses object destructuring to extract the `messages` and `type` properties from the object passed to the event listener.
**Why it's used**: Object destructuring is used to make it easier to extract properties from objects in a concise way, making the code more readable and maintainable.
**If you change/remove it**: If you remove the object destructuring syntax, the code will not be able to extract properties from objects in a concise way. If you change the object destructuring syntax to a different property extraction mechanism, the code will use a different approach to extract properties from objects.

---
### Concept 9: Functions
Functions are used to encapsulate code that performs a specific task. They are defined using the `function` keyword and can be used to reuse code and make the codebase more modular.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
async function displayGuildBoard(sock, chatId, userJid) {
  // ...
}
```
**How it works here**: The code uses functions to encapsulate code that performs a specific task, such as displaying the guild board.
**Why it's used**: Functions are used to encapsulate code that performs a specific task, making it easier to reuse code and make the codebase more modular.
**If you change/remove it**: If you remove the function, the code will not be able to encapsulate the code that performs the specific task. If you change the function to a different code organization mechanism, the code will use a different approach to organize the code.

---
### Concept 10: Modules and Imports
Modules and imports are used to organize code into reusable modules and import them into other parts of the codebase. They are defined using the `import` and `export` keywords and can be used to make the codebase more modular and reusable.
**General Example**
```javascript
// module.js
export function greet(name) {
  console.log(`Hello, ${name}!`);
}

// main.js
import { greet } from './module.js';
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
const botConfig = require('./botConfig.js');
```
**How it works here**: The code uses modules and imports to organize the code into reusable modules and import them into other parts of the codebase.
**Why it's used**: Modules and imports are used to make the codebase more modular and reusable, making it easier to maintain and extend the code.
**If you change/remove it**: If you remove the modules and imports, the code will not be able to organize the code into reusable modules and import them into other parts of the codebase. If you change the modules and imports to a different code organization mechanism, the code will use a different approach to organize the code.
