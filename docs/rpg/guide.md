# RPG Handbook & Guides Command Flow (`guide` / `handbook` / `lore`)

## 1. Description
The `guide` or `handbook` command acts as the central help system for the RPG database, providing explanations of combat mechanics, stat scaling, class paths, crafting systems, guild structures, raid configurations, and lore chapters. 

It handles:
- **`.j guide`** / **`.j handbook`**: Lists all help sub-topics.
- **`.j guide <topic>`**: Displays detailed guidance for specific topics (e.g. `combat`, `stats`, `classes`, `raids`, `pvp`, `economy`, `commands`).
- **`.j lore`**: Directs to `guildAdventure.showLore()` to output the full campaign back-story.

---

## 2. Hierarchical Execution Tree
```text
======================================================
📔 HANDBOOK / TOPICS: User sends ".j guide" or ".j guide combat"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match checks (L8876-8926)
            ├── If (.j guide / .j handbook) -> output main topics directory (L8915)
            ├── If (.j guide <topic>) -> evaluate topic string branches (L8934-9107)
            └── sock.sendMessage(chatId, { text: guideText })

======================================================
📜 WORLD LORE: User sends ".j lore"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "lore" || lowerTxt === ".j lore" (L5133 / L8855)
        └── core/rpg/guildAdventure.js
            └── showLore(sock, chatId)
                └── sock.sendMessage(chatId, { text: loreBookText })
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
- Listens to incoming message packets.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L8875-L8931)
* **Line Numbers**: 8875-8931
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Formats topic string or outputs main directory

```javascript
                    // RPG GUIDE SYSTEM - THE ULTIMATE HANDBOOK
                    if (
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} rpg guide` ||
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} guide` ||
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} handbook`
                    ) {
                      let msg = `╭───────────────────╮\n  📔 *RPG HANDBOOK* \n╰───────────────────╯\n\n` + ...;
                      await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
                      return;
                    }

                    if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guide `)) {
                      const topic = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} guide `.length).trim();
                      // ... (resolve topic branch)
                    }
```

#### Explanation
- If the exact command is `.j guide` or `.j handbook`, prints the main table of contents listing all available guide subtopics.
- If it starts with `.j guide `, strips the command prefix and extracts the topic parameter (e.g. `combat`, `stats`).

---

### Step 3: Resolving Topic Content & Sending Output
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L8932-L9112)
* **Line Numbers**: 8932-9112
* **Called From**: Parser block inside `engine.js`
* **Inputs**: `topic` JID parameter string
* **Outputs**: Delivers topic details to conversation room

```javascript
                      let msg = "";

                      if (topic === "combat") {
                        msg = `⚔️ *COMBAT MECHANICS*\n\n` + ...;
                      } else if (topic === "stats") {
                        msg = `📊 *ATTRIBUTES & STATS*\n\n` + ...;
                      } else if (topic === "classes") {
                        msg = `🎭 *EVOLUTION TIERS & REQS*\n\n` + ...;
                      } // ... other topics (fighter, scout, mage, support, monsters, items, etc.)
                      else {
                        msg = `❌ Topic not found. Use \`${botConfig.getPrefix()} guide\` for the main menu.`;
                      }

                      await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
```

#### Explanation
- Compares the `topic` argument with pre-defined keys using an `if/else` ladder.
- Formats detailed explanation sections for matching attributes.
- If none match, warns the user that the topic was not found.
- Sends the resulting text payload back to the conversation room.

---

## 4. How to Modify
- **Add New Guide Topics**: Add a new `else if (topic === "new_topic")` block inside [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L8934).
- **Edit World Lore Campaign**: Modify the response text in `showLore` inside [core/rpg/guildAdventure.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guildAdventure.js).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They can be thought of as labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // outputs: John
```
**In Our Code**
```javascript
let msg = "";
let isRekeying;
```
**How it works here**: In the provided code snippets, variables are used to store messages, flags, and other values. For example, `msg` is used to store the message to be sent, and `isRekeying` is used to track the rekeying status.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to manage and modify the code.
**If you change/remove it**: If you remove the `msg` variable, the code will throw an error when trying to send the message. If you remove the `isRekeying` variable, the code will not be able to track the rekeying status, potentially causing issues with the program's functionality.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
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
**How it works here**: In the provided code snippets, arrow functions are used as event listeners and as arguments to the `map` method. For example, the arrow function passed to `sock.ev.on` is called when the "messages.upsert" event is triggered.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as event listeners or as arguments to other functions.
**If you change/remove it**: If you remove the arrow function passed to `sock.ev.on`, the code will not be able to listen for the "messages.upsert" event, and the program will not be able to respond to incoming messages.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are used to respond to user interactions, network requests, and other events.
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
**How it works here**: In the provided code snippets, event listeners are used to respond to incoming messages and other events. For example, the event listener passed to `sock.ev.on` is called when the "messages.upsert" event is triggered.
**Why it's used**: Event listeners are used to respond to events and user interactions, allowing the program to react to changes and updates.
**If you change/remove it**: If you remove the event listener passed to `sock.ev.on`, the code will not be able to respond to incoming messages, and the program will not be able to process and respond to user input.

---
### Concept 4: Array Methods
Array methods are functions that can be called on arrays to perform operations such as mapping, filtering, and reducing.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: In the provided code snippets, array methods are used to process and transform data. For example, the `map` method is used to transform the `messages` array into an array of promises.
**Why it's used**: Array methods are used to perform operations on arrays, making it easier to process and transform data.
**If you change/remove it**: If you remove the `map` method, the code will not be able to transform the `messages` array, and the program will not be able to process and respond to incoming messages.

---
### Concept 5: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions.
**General Example**
```javascript
const age = 25;
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
**How it works here**: In the provided code snippets, conditional statements are used to make decisions and execute different blocks of code. For example, the `if` statement checks the `type` variable and returns if it's not "notify" or "append".
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on conditions or decisions.
**If you change/remove it**: If you remove the `if` statement, the code will not be able to make decisions and execute different blocks of code, potentially causing issues with the program's functionality.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // ...
  resolve('Hello, World!');
});
promise.then((message) => {
  console.log(message); // outputs: Hello, World!
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
**How it works here**: In the provided code snippets, promises are used to handle asynchronous operations and execute code when a promise is resolved or rejected. For example, the `Promise.all` method is used to wait for all the promises in the `messages` array to be resolved.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**If you change/remove it**: If you remove the `Promise.all` method, the code will not be able to wait for all the promises in the `messages` array to be resolved, potentially causing issues with the program's functionality.

---
### Concept 7: Destructuring
Destructuring is a way to extract values from objects and arrays and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the provided code snippets, destructuring is used to extract values from objects and assign them to variables. For example, the `messages` and `type` variables are extracted from the object passed to the event listener.
**Why it's used**: Destructuring is used to extract values from objects and arrays and assign them to variables, making it easier to access and use the values.
**If you change/remove it**: If you remove the destructuring, the code will not be able to extract the values from the object, and the program will not be able to access and use the values.

---
### Concept 8: String Comparison
String comparison is used to compare two strings and determine if they are equal or not.
**General Example**
```javascript
const str1 = 'hello';
const str2 = 'hello';
if (str1 === str2) {
  console.log('The strings are equal!');
} else {
  console.log('The strings are not equal!');
}
```
**In Our Code**
```javascript
if (
  lowerTxt ===
    `${botConfig.getPrefix().toLowerCase()} rpg guide` ||
  lowerTxt ===
    `${botConfig.getPrefix().toLowerCase()} guide` ||
  lowerTxt ===
    `${botConfig.getPrefix().toLowerCase()} handbook`
) {
  // ...
}
```
**How it works here**: In the provided code snippets, string comparison is used to compare the `lowerTxt` variable with different strings and determine if they are equal or not.
**Why it's used**: String comparison is used to compare two strings and determine if they are equal or not, making it easier to make decisions and execute different blocks of code.
**If you change/remove it**: If you remove the string comparison, the code will not be able to determine if the `lowerTxt` variable is equal to the different strings, and the program will not be able to make decisions and execute different blocks of code.

---
### Concept 9: Template Literals
Template literals are used to create strings that can contain expressions and variables.
**General Example**
```javascript
const name = 'John';
const age = 25;
const str = `My name is ${name} and I am ${age} years old.`;
console.log(str); // outputs: My name is John and I am 25 years old.
```
**In Our Code**
```javascript
let msg = `╭───────────────────╮\n  📔 *RPG HANDBOOK* \n╰───────────────────╯\n\n` + ...;
```
**How it works here**: In the provided code snippets, template literals are used to create strings that can contain expressions and variables. For example, the `msg` variable is created using a template literal that contains a string with expressions and variables.
**Why it's used**: Template literals are used to create strings that can contain expressions and variables, making it easier to create and manipulate strings.
**If you change/remove it**: If you remove the template literal, the code will not be able to create the `msg` variable with the desired string, and the program will not be able to send the message.

---
### Concept 10: Async/Await
Async/await is used to write asynchronous code that is easier to read and maintain.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the provided code snippets, async/await is used to write asynchronous code that is easier to read and maintain. For example, the event listener passed to `sock.ev.on` is defined as an async function that uses await to wait for the promises to be resolved.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain, making it easier to handle asynchronous operations and execute code when a promise is resolved or rejected.
**If you change/remove it**: If you remove the async/await, the code will not be able to write asynchronous code that is easier to read and maintain, and the program will not be able to handle asynchronous operations and execute code when a promise is resolved or rejected.

---

## 5. Reference Manual

> All guide topics and command routing below are configured directly in `core/engine.js`. A contributor should never need to look up source code routes to know what guide topics are supported or what text is returned for each.

### 5.1 Guide Command Syntax
* **Primary Command**: `.j guide` or `.j handbook` (displays the handbook directory).
* **Topic Routing**: `.j guide <topic>` or `.j handbook <topic>` (displays the specific help message).
* **Lore Command**: `.j lore` (directs to campaign back-story).

### 5.2 Supported Guide Topics Catalog
The table below lists all valid topic keys, their descriptions, and the exact messages returned:

| Topic Key | Display Title | Description / Content Summary |
|:---|:---|:---|
| `combat` | ⚔️ COMBAT MECHANICS | Covers SPD initiative, resting to restore Energy (+15), damage types (Physical/Magical/True), enemy telegraph warning hits, and party synergy. |
| `stats` | 📊 ATTRIBUTES & STATS | Explains primary attributes: HP, Energy, ATK (Physical), MAG (Magical & healing), DEF, SPD, and LUCK. |
| `classes` | 🎭 EVOLUTION TIERS & REQS | Summarizes Starter, Evolved (Lv.10+, 3 Quests, 5k Zeni, T2 stone), and Ascended (Lv.30+, 15 Quests, 50k Zeni, T3 stone) requirements and path routing. |
| `fighter` | 🔴 FIGHTER EVOLUTIONS | Details Fighter paths (Warrior/Warlord, Berserker/Doomslayer, Paladin/Templar, Dragonslayer/Dragon God) and their role as the frontline vanguard. |
| `scout` | 🟢 SCOUT EVOLUTIONS | Details Scout paths (Rogue/Nightblade, Monk/Zenmaster, Samurai/Shogun, Ninja/Kage) and their role as high-speed strikers. |
| `mage` | 🔵 APPRENTICE EVOLUTIONS | Details Apprentice paths (Mage/Archmage, Warlock/Voidwalker, Necromancer/Lich, Elementalist/Avatar, Chronomancer/Timelord, Reaper/Death Lord) and their magic role. |
| `support` | 🟡 ACOLYTE EVOLUTIONS | Details Acolyte paths (Cleric/Saint, Bard/Virtuoso, Merchant/Tycoon, Artificer/Grand Inventor, God Hand/Divine Fist, Druid/Archdruid) and their healing/buffing role. |
| `dragons` | 🐲 DRAGONSLAYER LEGACY | Details the step-by-step questline to unlock Dragonslayer (Tier 2) and Dragon God (Tier 3), including buying Dragon Seal Ring (20k Zeni) and key (15k Zeni). |
| `monsters` | 👹 MONSTER ARCHETYPES | Outlines monster roles (Guardians/Tanks, Ravagers/Brutes, Acolytes/Casters, Stalkers/Assassins). |
| `lore` | 📜 WORLD LORE: THE DIVINE SPARK | Explains the backstory of the Divine Architect, Primordial Chaos, and the Infected. |
| `mastery` | 💎 PROFESSION MASTERY | Discusses Masterwork items (10% chance at high Crafting levels to get +20% stats), mining nodes, and dismantling gear. |
| `advanced` | 🚀 ADVANCED MECHANICS | Details Hardcore Mode XP loss, party synergy benefits, dynamic titles, and marriage systems. |
| `items` | 🎒 EQUIPMENT & LOOT | Explains gear rarity tiers (Common ➔ Uncommon ➔ Rare ➔ Epic ➔ Legendary ➔ Mythic), slots, and the material pouch. |
| `work` | ⚒️ PROFESSIONS GUIDE | Outlines Mining, Crafting, Brewing, and Stamina (Energy) consumption. |
| `guilds` | 🏰 GUILD SYSTEM | Explains guild creation, guild archetypes (Adventurer, Merchant, Research), and benefits. |
| `raids` | 👹 DUNGEONS & RAIDS | Distinguishes between Solo, Dungeons (3-player), Raids (World Bosses), and secret dungeons. |
| `special` | ✨ SPECIAL DUNGEONS | Outlines secret dungeons such as the Dragon's Lair, keys required, and unique rewards. |
| `pvp` | 🏟️ PVP & DUELS | Covers arena duels, stakes/wagers, and seasonal leaderboards. |
| `economy` | 💰 ECONOMY & INVESTMENTS | Explains Zeni currency, Stock Market/Bank investments, material market price changes, and loans. |
| `ranks` | ⭐ ADVENTURER PROGRESSION | Explains letter grades (F to SSS), milestone unlocks, and level-up points. |
| `commands` | 📜 COMMAND LIST | Lists commands by category (Basic, Action, Social, Growth, Misc). |
