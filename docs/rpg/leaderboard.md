# Leaderboard Command Flow (`leaderboard` / `lb`)

## 1. Description
The `leaderboard` or `lb` command allows players to see the rankings of the top 10 players based on either character Level or Total XP earned. It retrieves active records from the in-memory cache and formats them into a leaderboard.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j leaderboard [level | xp | pvp]" or ".j lb [level | xp | pvp]"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check (L7043-7062)
            └── core/commands/rpgCommands.js
                └── displayLeaderboard(sock, chatId, type) (L306)
                    ├── core/rpg/progression.js
                    │   └── getLeaderboard(type, 10) (L349)
                    │       ├── Retrieve all users from economy.economyData cache
                    │       ├── Sort by 'level', 'totalXPEarned', or 'pvpWins'
                    │       └── Return top 10 rows
                    ├── Loop top 10 players and query nicknames via economy.getUser()
                    └── sock.sendMessage(chatId, { text: leaderboardText })
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
- Receives message inputs from socket connections.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7043-L7062)
* **Line Numbers**: 7043-7062
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Calls `rpgCommands.displayLeaderboard`

```javascript
                  // .j leaderboard - View leaderboard
                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} leaderboard`,
                    ) ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} lb`,
                    ) ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} top`,
                    )
                  ) {
                    let type = "level";
                    const parts = lowerTxt.split(/\s+/);
                    if (parts.length > 2) {
                      const arg = parts[2].trim().toLowerCase();
                      if (arg === "xp") {
                        type = "xp";
                      } else if (arg === "pvp") {
                        type = "pvp";
                      } else if (arg === "level") {
                        type = "level";
                      }
                    }
                    await rpgCommands.displayLeaderboard(sock, chatId, type);
                    return;
                  }
```

#### Explanation
- Catches the `.j leaderboard`, `.j lb`, or `.j top` command patterns.
- Parses sub-arguments (like `xp` and `pvp`) to select the sorting type, defaulting to `"level"`.
- Invokes `displayLeaderboard` with the resolved parameter.

---

### Step 3: Resolving Leaderboard Rows
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L306-L329)
* **Line Numbers**: 306-329
* **Called From**: `displayLeaderboard()`
* **Inputs**: `(sock, chatId, type)`
* **Outputs**: Dispatches the top list layout back to the chat

```javascript
async function displayLeaderboard(sock, chatId, type = 'level') { 
    const leaderboard = progression.getLeaderboard(type, 10);
    
    if (leaderboard.length === 0) { 
        await sock.sendMessage(chatId, { text: '❌ No data available!' });
        return;
    }
    
    let msg = `🏆 TOP 10\n\n`;
    if (type === 'pvp') {
        msg += `⚔️ PvP Leaderboard (Wins / Losses)\n\n`;
        for (let i = 0; i < leaderboard.length; i++) { 
            const player = leaderboard[i];
            const economyUser = economy.getUser(player.userId);
            const name = economyUser?.nickname || player.userId.split('@')[0];
            
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            msg += `${medal} *${name}*\n   ⚔️ Wins: \`${player.pvpWins || 0}\` | 💀 Losses: \`${player.pvpLosses || 0}\``;
            msg += `\n\n`;
        }
    } else {
        msg += `📊 Ranking by: ${type === 'level' ? 'Level' : 'Total XP'}\n\n`;
        for (let i = 0; i < leaderboard.length; i++) { 
            const player = leaderboard[i];
            const economyUser = economy.getUser(player.userId);
            const name = economyUser?.nickname || player.userId.split('@')[0];
            
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            msg += `${medal} *${name}*\n   Level ${player.level}`;
            if (type === 'xp') msg += ` | ${player.totalXPEarned.toLocaleString()} XP`;
            msg += `\n\n`;
        }
    }
    
    await sock.sendMessage(chatId, { text: msg });
}
```

#### Explanation
1. Calls `progression.getLeaderboard(type, 10)` to compute the top 10 users.
2. Checks if there is any data. If not, alerts the user.
3. Loops through each entry, retrieves the cached user profile to display custom user-set nicknames, and formats ranks with custom trophy emojis for ranks 1-3.
4. Delivers the text layout back to the WhatsApp room.

---

### Step 4: Core Ranking Calculations
* **File Path**: [core/rpg/progression.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L349-L355)
* **Line Numbers**: 349-355
* **Called From**: `progression.getLeaderboard()`
* **Inputs**: `(type, limit)`
* **Outputs**: Filtered and sorted array of player documents

```javascript
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
```

#### Explanation
1. Retrieves a flat array of all registered users from `economyData` (in-memory Map cache).
2. If `type` is `"pvp"`, maps and sorts the array by `pvpWins` descending.
3. Otherwise, filters out any documents that don't have valid `.progression` data properties initialized and sorts records descending based on `level` or `totalXPEarned`.
4. Returns the top slice array (length matching the limit argument, default 10).

---

## 4. How to Modify
- **Increase List Limit**: Change the argument `10` passed to `getLeaderboard` in [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L307).
- **Format Rank Layout**: Customize emojis or spacing directly inside [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L322).
- **Add Ranking Categories**: Update the `getLeaderboard` function in [core/rpg/progression.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js#L349) to add more types, and update `displayLeaderboard` in [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L306) to format them.










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
const leaderboard = progression.getLeaderboard(type, 10);
```
**How it works here**: The `leaderboard` variable is used to store the result of the `getLeaderboard` function, which returns a list of top players.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to write and understand the code.
**If you change/remove it**: If you remove the `leaderboard` variable, the program will not be able to store the result of the `getLeaderboard` function, and the code will throw an error.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` symbol.
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
**How it works here**: The arrow function is used to define a callback function that will be executed when the `messages.upsert` event is triggered.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be passed as arguments to other functions or used as event handlers.
**If you change/remove it**: If you remove the arrow function, the program will not be able to handle the `messages.upsert` event, and the code will not work as expected.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events or actions that occur in a program, such as a user clicking a button or a message being received.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Button clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events or actions that occur in a program, allowing the program to interact with the user or other systems.
**If you change/remove it**: If you remove the event listener, the program will not be able to respond to the `messages.upsert` event, and the code will not work as expected.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions in a program based on conditions or rules. They are defined using the `if` and `else` keywords.
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
```
**How it works here**: The conditional statement is used to check if the `type` variable is not equal to "notify" or "append", and if so, the function returns immediately.
**Why it's used**: Conditional statements are used to make decisions in a program based on conditions or rules, allowing the program to adapt to different situations.
**If you change/remove it**: If you remove the conditional statement, the program will not be able to check the `type` variable, and the code may not work as expected.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays in a program. They are defined using the `map`, `filter`, and `sort` keywords.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
const leaderboard = allUsers.filter(u => u.progression).map(u => ({ userId: u.userId, ...u.progression }));
```
**How it works here**: The `filter` and `map` methods are used to transform the `allUsers` array into a new array that contains only the users with a `progression` property, and then maps each user to a new object that contains the `userId` and `progression` properties.
**Why it's used**: Array methods are used to manipulate and transform arrays in a program, making it easier to work with data.
**If you change/remove it**: If you remove the array methods, the program will not be able to transform the `allUsers` array, and the code will not work as expected.

---
### Concept 6: Async/Await
Async/await is a way to write asynchronous code that is easier to read and understand. It is defined using the `async` and `await` keywords.
**General Example**
```javascript
async function fetchData() {
  let response = await fetch('https://api.example.com/data');
  let data = await response.json();
  console.log(data);
}
```
**In Our Code**
```javascript
async function displayLeaderboard(sock, chatId, type = 'level') {
  // ...
}
```
**How it works here**: The `async` and `await` keywords are used to define an asynchronous function that can wait for promises to resolve before continuing execution.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and understand, making it easier to work with promises and asynchronous operations.
**If you change/remove it**: If you remove the async/await keywords, the program will not be able to wait for promises to resolve, and the code will not work as expected.

---
### Concept 7: Promises
Promises are used to represent asynchronous operations that may not have completed yet. They are defined using the `Promise` keyword.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Data fetched!');
});
promise.then((data) => console.log(data));
```
**In Our Code**
```javascript
await sock.sendMessage(chatId, { text: msg });
```
**How it works here**: The `sendMessage` function returns a promise that resolves when the message is sent, and the `await` keyword is used to wait for the promise to resolve before continuing execution.
**Why it's used**: Promises are used to represent asynchronous operations that may not have completed yet, making it easier to work with asynchronous code.
**If you change/remove it**: If you remove the promise, the program will not be able to wait for the asynchronous operation to complete, and the code will not work as expected.

---
### Concept 8: Destructuring
Destructuring is a way to extract values from objects and arrays into separate variables. It is defined using the `{}` and `[]` keywords.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
async ({ messages, type }) => {
  // ...
}
```
**How it works here**: The destructuring syntax is used to extract the `messages` and `type` properties from the object passed to the function.
**Why it's used**: Destructuring is used to extract values from objects and arrays into separate variables, making it easier to work with data.
**If you change/remove it**: If you remove the destructuring syntax, the program will not be able to extract the values from the object, and the code will not work as expected.

---
### Concept 9: Functions
Functions are reusable blocks of code that can be called multiple times with different inputs. They are defined using the `function` keyword.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function getLeaderboard(type = 'level', limit = 10) {
  // ...
}
```
**How it works here**: The `getLeaderboard` function is defined to return a list of top players based on the `type` and `limit` parameters.
**Why it's used**: Functions are used to organize code into reusable blocks that can be called multiple times with different inputs, making it easier to write and maintain code.
**If you change/remove it**: If you remove the `getLeaderboard` function, the program will not be able to retrieve the list of top players, and the code will not work as expected.

---
### Concept 10: Object Properties
Object properties are used to store and access values in objects. They are defined using the `.` keyword.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
console.log(person.age); // Outputs: 25
```
**In Our Code**
```javascript
const economyUser = economy.getUser(player.userId);
const name = economyUser?.nickname || player.userId.split('@')[0];
```
**How it works here**: The object properties are used to access the `nickname` property of the `economyUser` object, and the `userId` property of the `player` object.
**Why it's used**: Object properties are used to store and access values in objects, making it easier to work with data.
**If you change/remove it**: If you remove the object properties, the program will not be able to access the values in the objects, and the code will not work as expected.

---
### Concept 11: Nullish Coalescing Operator
The nullish coalescing operator is used to provide a default value when a variable is null or undefined. It is defined using the `??` keyword.
**General Example**
```javascript
let name = null;
let fullName = name ?? 'Unknown';
console.log(fullName); // Outputs: Unknown
```
**In Our Code**
```javascript
const name = economyUser?.nickname || player.userId.split('@')[0];
```
**How it works here**: The nullish coalescing operator is not used explicitly, but the optional chaining operator `?.` is used to access the `nickname` property of the `economyUser` object, and the `||` operator is used to provide a default value if the `nickname` property is null or undefined.
**Why it's used**: The nullish coalescing operator is used to provide a default value when a variable is null or undefined, making it easier to work with data.
**If you change/remove it**: If you remove the nullish coalescing operator, the program will not be able to provide a default value when a variable is null or undefined, and the code may throw an error.

---
### Concept 12: Template Literals
Template literals are used to create strings that can contain expressions and variables. They are defined using the `` ` `` keyword.
**General Example**
```javascript
let name = 'John';
let age = 25;
let sentence = `My name is ${name} and I am ${age} years old.`;
console.log(sentence); // Outputs: My name is John and I am 25 years old.
```
**In Our Code**
```javascript
let msg = `🏆 TOP 10\n\n`;
msg += `📊 Ranking by: ${type === 'level' ? 'Level' : 'Total XP'}\n\n`;
```
**How it works here**: The template literals are used to create strings that contain expressions and variables, making it easier to create dynamic strings.
**Why it's used**: Template literals are used to create strings that can contain expressions and variables, making it easier to work with strings.
**If you change/remove it**: If you remove the template literals, the program will not be able to create dynamic strings, and the code will not work as expected.

---
### Concept 13: Ternary Operator
The ternary operator is used to make decisions in a program based on a condition. It is defined using the `?` and `:` keywords.
**General Example**
```javascript
let age = 25;
let status = age >= 18 ? 'Adult' : 'Minor';
console.log(status); // Outputs: Adult
```
**In Our Code**
```javascript
msg += `📊 Ranking by: ${type === 'level' ? 'Level' : 'Total XP'}\n\n`;
```
**How it works here**: The ternary operator is used to make a decision based on the `type` variable, and assign a value to the string.
**Why it's used**: The ternary operator is used to make decisions in a program based on a condition, making it easier to write concise code.
**If you change/remove it**: If you remove the ternary operator, the program will not be able to make a decision based on the `type` variable, and the code will not work as expected.

---
### Concept 14: Sorting
Sorting is used to arrange elements in an array in a specific order. It is defined using the `sort` method.
**General Example**
```javascript
let numbers = [4, 2, 7, 1, 3];
numbers.sort((a, b) => a - b);
console.log(numbers); // Outputs: [1, 2, 3, 4, 7]
```
**In Our Code**
```javascript
leaderboard.sort((a, b) => (b[sortField] || 0) - (a[sortField] || 0));
```
**How it works here**: The `sort` method is used to arrange the elements in the `leaderboard` array in descending order based on the `sortField` property.
**Why it's used**: Sorting is used to arrange elements in an array in a specific order, making it easier to work with data.
**If you change/remove it**: If you remove the sorting, the program will not be able to arrange the elements in the `leaderboard` array in a specific order, and the code will not work as expected.

---
### Concept 15: Slicing
Slicing is used to extract a subset of elements from an array. It is defined using the `slice` method.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let subset = numbers.slice(1, 3);
console.log(subset); // Outputs: [2, 3]
```
**In Our Code**
```javascript
return leaderboard.slice(0, limit);
```
**How it works here**: The `slice` method is used to extract a subset of elements from the `leaderboard` array, starting from the first element and ending at the `limit` index.
**Why it's used**: Slicing is used to extract a subset of elements from an array, making it easier to work with data.
**If you change/remove it**: If you remove the slicing, the program will not be able to extract a subset of elements from the `leaderboard` array, and the code will not work as expected.
