# Level Command Flow (`level`)

## 1. Description
The Level command displays the user's current RPG level, XP progress bar, total XP accumulated, target XP required for the next level, Guild Points (GP), commands usage count, and recent achievements. It can also query another user's progress by tagging them.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j level" or ".j level @UserB"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "level") (L146)
            └── core/commands/progressionCommands.js
                └── handleLevelCommand(sock, chatId, senderJid, args, m) (L100)
                    └── Resolve target JID: if (args[0]) -> targetJid = args[0]
                    └── core/rpg/progression.js
                        └── getUserStats(targetJid) (L176)
                        └── getUserRank(targetJid) (L188)
                        └── getProgressBar(progress, 15) (L166)
                        └── getLevelDisplay(level) (L134)
            └── sock.sendMessage(chatId, { text: msg, mentions: [...] }) (L141)
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
* **Outputs**: Redirects to progression command handler

```javascript
                    if (primaryCmd === "level") {
                      await progressionCommands.handleLevelCommand(
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
- Captures the `.j level` command and routes execution to progressionCommands controller.

---

### Step 3: Fetch User Progress Statistics
* **File Path**: [core/commands/progressionCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/progressionCommands.js#L100-L109) & [core/rpg/progression.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L176-L200)
* **Line Numbers**: 100-109 (routing) & 176-200 (stats helpers)
* **Called From**: `progressionCommands.js`
* **Imported From**: `core/rpg/progression`
* **Inputs**: Target JID (either senderJid or tagged userJid)
* **Outputs**: `{ level, xp: { current, required, total, progress, nextLevel }, gp: { current, total }, commands, achievements }`

```javascript
// Inside core/rpg/progression.js
function getUserStats(userId) {
    const user = getUser(userId);
    if (!user) return null;
    
    const xpNeeded = getXPForLevel(user.level + 1);
    const xpBase = getXPForLevel(user.level);
    const relativeXP = user.xp - xpBase;
    const relativeNeeded = xpNeeded - xpBase;
    const progressPercent = Math.min(100, Math.floor(relativeXP / relativeNeeded * 100));
    
    return {
        level: user.level,
        xp: {
            current: relativeXP,
            required: relativeNeeded,
            total: user.xp,
            progress: progressPercent,
            nextLevel: xpNeeded - user.xp
        },
        gp: {
            current: user.gp || 0,
            total: user.totalGP || 0
        },
        commands: user.commandsUsed || 0,
        achievements: user.achievements || []
    };
}
```

#### Explanation
1. Resolves the target JID. If the user mentions another player, queries that player's JID.
2. Queries the `progression` db model cache to pull the player's level, XP, achievements, and GP.
3. Computes the relative XP percentage progress between their current level and the next level using `getXPForLevel()`.

---

### Step 4: Render Leaderboard Rank and Percentile
* **File Path**: [core/rpg/progression.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L188-L199)
* **Line Numbers**: 188-199
* **Called From**: `handleLevelCommand()`
* **Inputs**: `userId`
* **Outputs**: `{ rank: number, totalUsers: number, percentile: number }`

```javascript
function getUserRank(userId) {
    const allUsers = Array.from(economy.economyData.values())
        .filter(u => u.registered)
        .map(u => ({ userId: u.userId, level: u.progression?.level || 1, totalXP: u.progression?.totalXPEarned || 0 }))
        .sort((a, b) => b.totalXP - a.totalXP);
        
    const rank = allUsers.findIndex(u => u.userId === userId) + 1;
    const totalUsers = allUsers.length;
    const percentile = totalUsers > 0 ? Math.floor((rank / totalUsers) * 100) : 100;
    
    return { rank, totalUsers, percentile };
}
```

#### Explanation
- Compiles all registered users, sorts them by total accumulated XP in descending order, finds the target user's index (rank = index + 1), and calculates their relative percentile.

---

### Step 5: Formatting and Reply
* **File Path**: [core/commands/progressionCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/progressionCommands.js#L110-L151)
* **Line Numbers**: 110-151
* **Called From**: `handleLevelCommand()`
* **Inputs**: User stats and rank payload
* **Outputs**: Sends progress card text back to the WhatsApp thread

```javascript
    let message = `╔═══════════════════╗\n`;
    message += `║  📊 *${displayName.toUpperCase()} LEVEL* 📊  ║\n`;
    message += `╚═══════════════════╝\n\n`;
    
    message += `${progression.getLevelDisplay(stats.level)}\n`;
    message += `🏆 *Rank:* #${rank.rank} / ${rank.totalUsers} (Top ${100 - rank.percentile}%)\n\n`;
    ...
    await sock.sendMessage(chatId, {
      text: getBotMarker() + message,
      contextInfo: { mentionedJid }
    }, { quoted: m });
```

#### Explanation
- Formats progress bar and displays achievements.
- Sends the message using the Baileys WebSocket emitter, mentioning the target user.

---

## 4. How to Modify
To adjust leveling speed or milestones:
- **Configure Experience Curves**: Modify the leveling algorithm inside `getXPForLevel` in `core/rpg/progression.js`:
  ```javascript
  // Edit base multiplier to make leveling faster/slower
  ```
- **Change Progress Bar Character Width**: Change the second argument passed to `getProgressBar` in [core/commands/progressionCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/progressionCommands.js#L105) (defaults to 15 character divisions).










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
let message = `╔═══════════════════╗\n`;
```
**How it works here**: The `message` variable is used to store a string that will be sent as a message.
**Why it's used**: Variables are used to store values that can be used later in the program.
**If you change/remove it**: If you remove the `message` variable, the program will not be able to store and send the message. If you change it, the message sent will be different.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` symbol.
**General Example**
```javascript
let add = (a, b) => a + b;
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
```
**How it works here**: The arrow function is used to define a callback function that will be executed when the `messages.upsert` event is triggered.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as callbacks or event handlers.
**If you change/remove it**: If you remove the arrow function, the program will not be able to handle the `messages.upsert` event. If you change it, the behavior of the event handler will be different.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program, such as user input or network requests. They are defined using the `on` method.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
```
**How it works here**: The event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events that occur in a program, allowing the program to react to user input or other events.
**If you change/remove it**: If you remove the event listener, the program will not be able to respond to the `messages.upsert` event. If you change it, the behavior of the event handler will be different.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions in a program based on conditions or rules. They are defined using the `if` or `switch` statements.
**General Example**
```javascript
let x = 5;
if (x > 10) {
  console.log('x is greater than 10');
} else {
  console.log('x is less than or equal to 10');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
```
**How it works here**: The conditional statement is used to check if the `type` variable is not equal to "notify" or "append". If it is not, the function returns immediately.
**Why it's used**: Conditional statements are used to make decisions in a program based on conditions or rules.
**If you change/remove it**: If you remove the conditional statement, the program will not be able to check the `type` variable and may behave incorrectly. If you change it, the behavior of the program will be different.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays in a program. They are defined using methods such as `map`, `filter`, and `reduce`.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(x => x * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
```
**How it works here**: The `map` method is used to transform the `messages` array into a new array of promises.
**Why it's used**: Array methods are used to manipulate and transform arrays in a program.
**If you change/remove it**: If you remove the `map` method, the program will not be able to transform the `messages` array. If you change it, the behavior of the program will be different.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations in a program, such as network requests or database queries. They are defined using the `Promise` constructor.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('Hello, World!');
  }, 2000);
});
promise.then((message) => {
  console.log(message); // Outputs: Hello, World!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
```
**How it works here**: The `Promise.all` method is used to wait for all the promises in the `messages` array to resolve.
**Why it's used**: Promises are used to handle asynchronous operations in a program.
**If you change/remove it**: If you remove the `Promise.all` method, the program will not be able to wait for all the promises to resolve. If you change it, the behavior of the program will be different.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code. It is defined using the `async` and `await` keywords.
**General Example**
```javascript
async function example() {
  let data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
```
**How it works here**: The `async` keyword is used to define an asynchronous function, and the `await` keyword is used to wait for the promises to resolve.
**Why it's used**: Async/await is used to make asynchronous code easier to read and write.
**If you change/remove it**: If you remove the `async` and `await` keywords, the program will not be able to handle asynchronous operations correctly. If you change it, the behavior of the program will be different.

---
### Concept 8: Destructuring
Destructuring is a syntax feature that allows you to extract values from arrays or objects and assign them to variables. It is defined using the `{}` or `[]` syntax.
**General Example**
```javascript
let person = { name: 'John', age: 30 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
```
**How it works here**: The destructuring syntax is used to extract the `messages` and `type` values from the object passed to the event handler.
**Why it's used**: Destructuring is used to make code more concise and easier to read.
**If you change/remove it**: If you remove the destructuring syntax, the program will not be able to extract the values from the object. If you change it, the behavior of the program will be different.

---
### Concept 9: Functions
Functions are reusable blocks of code that take arguments and return values. They are defined using the `function` keyword.
**General Example**
```javascript
function add(a, b) {
  return a + b;
}
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
function getUserStats(userId) {
```
**How it works here**: The `getUserStats` function is used to calculate the user's stats based on their ID.
**Why it's used**: Functions are used to organize code and make it reusable.
**If you change/remove it**: If you remove the `getUserStats` function, the program will not be able to calculate the user's stats. If you change it, the behavior of the program will be different.

---
### Concept 10: Object Properties
Object properties are used to store values in an object. They are defined using the dot notation or bracket notation.
**General Example**
```javascript
let person = { name: 'John', age: 30 };
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const xpNeeded = getXPForLevel(user.level + 1);
```
**How it works here**: The `user` object has properties such as `level` and `xp`.
**Why it's used**: Object properties are used to store values in an object.
**If you change/remove it**: If you remove the `user` object or its properties, the program will not be able to access the values. If you change it, the behavior of the program will be different.

---
### Concept 11: Math Operations
Math operations are used to perform calculations in a program. They are defined using operators such as `+`, `-`, `*`, `/`, etc.
**General Example**
```javascript
let x = 5;
let y = 3;
let result = x + y;
console.log(result); // Outputs: 8
```
**In Our Code**
```javascript
const progressPercent = Math.min(100, Math.floor(relativeXP / relativeNeeded * 100));
```
**How it works here**: The math operations are used to calculate the progress percent based on the `relativeXP` and `relativeNeeded` values.
**Why it's used**: Math operations are used to perform calculations in a program.
**If you change/remove it**: If you remove the math operations, the program will not be able to calculate the progress percent. If you change it, the behavior of the program will be different.

---
### Concept 12: String Concatenation
String concatenation is used to combine strings in a program. It is defined using the `+` operator or template literals.
**General Example**
```javascript
let name = 'John';
let greeting = 'Hello, ' + name;
console.log(greeting); // Outputs: Hello, John
```
**In Our Code**
```javascript
message += `║  📊 *${displayName.toUpperCase()} LEVEL* 📊  ║\n`;
```
**How it works here**: The string concatenation is used to combine the `message` string with the `displayName` value.
**Why it's used**: String concatenation is used to combine strings in a program.
**If you change/remove it**: If you remove the string concatenation, the program will not be able to combine the strings. If you change it, the behavior of the program will be different.

---
### Concept 13: Template Literals
Template literals are used to create strings with embedded expressions. They are defined using the `` ` `` syntax.
**General Example**
```javascript
let name = 'John';
let greeting = `Hello, ${name}`;
console.log(greeting); // Outputs: Hello, John
```
**In Our Code**
```javascript
message += `╔═══════════════════╗\n`;
```
**How it works here**: The template literal is used to create a string with embedded expressions.
**Why it's used**: Template literals are used to create strings with embedded expressions.
**If you change/remove it**: If you remove the template literal, the program will not be able to create the string. If you change it, the behavior of the program will be different.

---
### Concept 14: Database Operations
Database operations are used to interact with a database in a program. They are defined using methods such as `get` or `set`.
**General Example**
```javascript
let db = { users: [] };
db.users.push({ name: 'John', age: 30 });
console.log(db.users); // Outputs: [{ name: 'John', age: 30 }]
```
**In Our Code**
```javascript
const allUsers = Array.from(economy.economyData.values())
```
**How it works here**: The database operations are used to interact with the `economy.economyData` database.
**Why it's used**: Database operations are used to interact with a database in a program.
**If you change/remove it**: If you remove the database operations, the program will not be able to interact with the database. If you change it, the behavior of the program will be different.

---
### Concept 15: Sorting
Sorting is used to arrange data in a specific order. It is defined using methods such as `sort`.
**General Example**
```javascript
let numbers = [4, 2, 7, 1, 3];
numbers.sort((a, b) => a - b);
console.log(numbers); // Outputs: [1, 2, 3, 4, 7]
```
**In Our Code**
```javascript
const allUsers = Array.from(economy.economyData.values())
  .filter(u => u.registered)
  .map(u => ({ userId: u.userId, level: u.progression?.level || 1, totalXP: u.progression?.totalXPEarned || 0 }))
  .sort((a, b) => b.totalXP - a.totalXP);
```
**How it works here**: The sorting is used to arrange the `allUsers` array in descending order based on the `totalXP` value.
**Why it's used**: Sorting is used to arrange data in a specific order.
**If you change/remove it**: If you remove the sorting, the program will not be able to arrange the data in the correct order. If you change it, the behavior of the program will be different.
