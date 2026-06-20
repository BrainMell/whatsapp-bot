# Chess Game Command Flow (`chess`, `c`)

## 1. Description
The Chess game commands enable players to play full virtual chess matches directly within a WhatsApp group. Players can challenge a friend or the bot (AI mode) and can optionally wager Zeni on the match. Moves are parsed using standard algebraic notation (e.g., `e4`, `Nf3`) and visual boards are rendered as canvas images.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j chess @opponent [bet]" (or challenges bot)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── chess command matching (L17010)
            └── core/games/chess.js
                └── handleChess(sock, chatId, senderJid, args, m, botMarker) (L299)
                    └── createGame(senderJid, opponentJid, chatId, bet) (L69)
                        └── new Chess() (from 'chess.js' npm package)
                        └── activeGames.set(chatId, gameSession)
                    └── renderBoard(fen) (L231)
                    └── sock.sendMessage(chatId, { image: imageBuffer, caption })

User sends ".j move e4" (making a move)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── move command matching (L17035)
            └── checks if active chess game exists & looks like chess notation (L17048)
            └── core/games/chess.js
                └── handleChess(sock, chatId, senderJid, ["move", "e4"], m, botMarker) (L388)
                    └── processMove(sock, chatId, state, move, moveStr, botMarker, botJid) (L450)
                        └── checkGameEnd(sock, chatId, state, botMarker) (L500)
                            └── economy.transfer(...) / economy.addMoney(...)
                            └── activeGames.delete(chatId)
                        └── triggerAIMove(sock, chatId, state, botMarker, botJid) (L552)

User sends ".j chess resign" (surrendering)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── chess command matching (L17010)
            └── core/games/chess.js
                └── handleChess(sock, chatId, senderJid, ["resign"], m, botMarker) (L566)
                    └── resolve wagers & update scores (L574)
                    └── deleteGame(chatId) (L585)
                    └── sendMessage announcement (L587)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Ingestion
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: Dispatched command matching loop

---

### Step 2: Command Routing
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L17009-L17033)
* **Inputs**: Command string `lowerTxt`
* **Outputs**: Calls `chess.handleChess` with parsed arguments

```javascript
const prefix = botConfig.getPrefix().toLowerCase();
if (lowerTxt.startsWith(`${prefix} chess`) || lowerTxt.startsWith(`${prefix} c `)) {
  let rawArgs = lowerTxt.startsWith(`${prefix} chess`)
    ? lowerTxt.substring(`${prefix} chess`.length).trim()
    : lowerTxt.substring(`${prefix} c `.length).trim();
  const args = rawArgs.split(" ").filter((a) => a);
  return await chess.handleChess(sock, chatId, senderJid, args, m, BOT_MARKER);
}
```

---

### Step 3: Game Initialization and Challenge
* **File Path**: [chess.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/chess.js#L324-L384)
* **Inputs**: `(sock, chatId, senderJid, args, m, botMarker)`
* **Outputs**: Persists new game in memory map and returns rendered visual chess board

```javascript
if (!cmd || cmd === 'challenge' || (mentionedJids.length > 0 && !reserved.includes(cmd))) {
  let opponentJid = mentionedJids[0];
  if (isTaggingBot || isReplyingToBot) opponentJid = botJid; // AI Mode
  
  const bet = parseInt(betStr) || 0;
  // ... verifies wallet balances for bet amount
  const state = createGame(senderJid, opponentJid, chatId, bet);
  
  const imageBuffer = await renderBoard(state.chess.fen());
  // ... sends initial board configuration image
}
```

Inside `createGame`:
```javascript
function createGame(playerW, playerB, chatId, bet = 0) {
    const game = {
        chatId,
        playerW,
        playerB,
        bet,
        chess: new Chess(), // chess.js instance
        moves: [],
        lastActive: Date.now()
    };
    activeGamesMap.set(chatId, game);
    saveActiveGames();
    return game;
}
```

---

### Step 4: Making Chess Moves and Handling AI Turn
* **File Path**: [chess.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/chess.js#L388-L448)
* **Inputs**: `(sock, chatId, senderJid, ["move", moveNotation], m, botMarker)`
* **Outputs**: Attempts the chess.js move, updates the board canvas, triggers AI move if opponent is bot

```javascript
if (cmd === 'move' || cmd === 'm') {
  const state = getGame(chatId);
  // ... checks turn: matches senderJid with active color player
  
  try {
    let move = state.chess.move(moveStr); // checks valid moves via chess.js
    if (!move) throw new Error("Invalid move");
    
    await processMove(sock, chatId, state, move, moveStr, botMarker, botJid);
  } catch (e) {
    // ... sends error detailing movement notation
  }
}
```

Inside `processMove`:
```javascript
async function processMove(sock, chatId, state, move, moveStr, botMarker, botJid) {
  // Renders chess board and updates user message status.
  const ended = await checkGameEnd(sock, chatId, state, botMarker);
  
  if (!ended && state.playerB === botJid) {
    // Triggers AI move generator
    await triggerAIMove(sock, chatId, state, botMarker, botJid);
  }
}
```

---

## 4. How to Modify
* **Change AI Difficulty / Move Logic**: Modify the AI selection algorithm in `triggerAIMove` in [chess.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/chess.js#L552). It currently selects from legal moves using basic checks (e.g., picking capture moves first).
* **Chess Board Styling / Layout**: Edit the tile drawing colors, fonts, and piece sizes in the `renderBoard` function (around line 231) in [chess.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/chess.js).
* **Betting / Economy Multipliers**: Change how bets are validated and paid out in `checkGameEnd` in [chess.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/chess.js#L500).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They are like labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const prefix = botConfig.getPrefix().toLowerCase();
let rawArgs = lowerTxt.startsWith(`${prefix} chess`)
  ? lowerTxt.substring(`${prefix} chess`.length).trim()
  : lowerTxt.substring(`${prefix} c `.length).trim();
```
**How it works here**: Variables are used to store the prefix, raw arguments, and other values. The `const` keyword is used for values that don't change, while `let` is used for values that may change.
**Why it's used**: Variables are essential for storing and manipulating data in a program. They allow you to reuse values and perform operations on them.
**If you change/remove it**: If you remove the `const` or `let` keywords, the code will throw an error. If you change the variable names, you'll need to update all references to them in the code.

---
### Concept 2: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions. They are like forks in the road that determine which path to take.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult');
} else {
  console.log('You are a minor');
}
```
**In Our Code**
```javascript
if (lowerTxt.startsWith(`${prefix} chess`) || lowerTxt.startsWith(`${prefix} c `)) {
  // ...
}
if (!cmd || cmd === 'challenge' || (mentionedJids.length > 0 && !reserved.includes(cmd))) {
  // ...
}
```
**How it works here**: Conditional statements are used to check conditions and execute different blocks of code. The `if` statement checks a condition, and if it's true, the code inside the block is executed.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on conditions.
**If you change/remove it**: If you remove the conditional statement, the code will not be able to make decisions and execute different blocks of code. If you change the condition, the code will execute different blocks of code.

---
### Concept 3: String Methods
String methods are used to manipulate and transform strings. They are like tools that help you work with strings.
**General Example**
```javascript
let str = 'Hello World';
console.log(str.toLowerCase()); // Outputs: hello world
```
**In Our Code**
```javascript
const prefix = botConfig.getPrefix().toLowerCase();
let rawArgs = lowerTxt.substring(`${prefix} chess`.length).trim();
```
**How it works here**: String methods are used to manipulate and transform strings. The `toLowerCase()` method converts a string to lowercase, and the `substring()` method extracts a part of a string.
**Why it's used**: String methods are used to manipulate and transform strings, making it easier to work with them.
**If you change/remove it**: If you remove the string method, the code will not be able to manipulate and transform strings. If you change the string method, the code will produce different results.

---
### Concept 4: Array Methods
Array methods are used to manipulate and transform arrays. They are like tools that help you work with arrays.
**General Example**
```javascript
let arr = [1, 2, 3];
console.log(arr.filter(x => x > 1)); // Outputs: [2, 3]
```
**In Our Code**
```javascript
const args = rawArgs.split(" ").filter((a) => a);
```
**How it works here**: Array methods are used to manipulate and transform arrays. The `split()` method splits a string into an array, and the `filter()` method filters out elements that don't meet a condition.
**Why it's used**: Array methods are used to manipulate and transform arrays, making it easier to work with them.
**If you change/remove it**: If you remove the array method, the code will not be able to manipulate and transform arrays. If you change the array method, the code will produce different results.

---
### Concept 5: Functions
Functions are blocks of code that can be called multiple times from different parts of a program. They are like reusable recipes that can be used to perform a specific task.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
async function processMove(sock, chatId, state, move, moveStr, botMarker, botJid) {
  // ...
}
```
**How it works here**: Functions are used to perform specific tasks, such as processing a move or creating a game. The `async` keyword indicates that the function returns a promise.
**Why it's used**: Functions are used to organize code, make it reusable, and perform specific tasks.
**If you change/remove it**: If you remove the function, the code will not be able to perform the specific task. If you change the function, the code will produce different results.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, such as waiting for a response from a server or a database. They are like contracts that promise to deliver a result at some point in the future.
**General Example**
```javascript
function delayedGreet(name) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(`Hello, ${name}!`);
    }, 2000);
  });
}
delayedGreet('John').then(greeting => console.log(greeting)); // Outputs: Hello, John! after 2 seconds
```
**In Our Code**
```javascript
async function processMove(sock, chatId, state, move, moveStr, botMarker, botJid) {
  // ...
}
```
**How it works here**: Promises are used to handle asynchronous operations, such as waiting for a response from a server or a database. The `async` keyword indicates that the function returns a promise.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to write code that waits for responses from servers or databases.
**If you change/remove it**: If you remove the promise, the code will not be able to handle asynchronous operations. If you change the promise, the code will produce different results.

---
### Concept 7: Object Literals
Object literals are used to create objects, which are collections of key-value pairs. They are like dictionaries that store data in a structured way.
**General Example**
```javascript
let person = {
  name: 'John',
  age: 30
};
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const game = {
  chatId,
  playerW,
  playerB,
  bet,
  chess: new Chess(), // chess.js instance
  moves: [],
  lastActive: Date.now()
};
```
**How it works here**: Object literals are used to create objects, which store data in a structured way. The object is created with key-value pairs, such as `chatId` and `playerW`.
**Why it's used**: Object literals are used to create objects, making it easier to store and manipulate data in a structured way.
**If you change/remove it**: If you remove the object literal, the code will not be able to create the object. If you change the object literal, the code will produce different results.

---
### Concept 8: Map Data Structure
Map data structure is used to store key-value pairs, where each key is unique and maps to a specific value. It is like a dictionary that stores data in a structured way.
**General Example**
```javascript
let map = new Map();
map.set('name', 'John');
console.log(map.get('name')); // Outputs: John
```
**In Our Code**
```javascript
activeGamesMap.set(chatId, game);
```
**How it works here**: Map data structure is used to store key-value pairs, where each key is unique and maps to a specific value. The `set()` method adds a new key-value pair to the map, and the `get()` method retrieves the value associated with a key.
**Why it's used**: Map data structure is used to store key-value pairs, making it easier to store and manipulate data in a structured way.
**If you change/remove it**: If you remove the map data structure, the code will not be able to store key-value pairs. If you change the map data structure, the code will produce different results.

---
### Concept 9: Number Parsing
Number parsing is used to convert a string to a number. It is like a tool that helps you convert text to a numerical value.
**General Example**
```javascript
let str = '123';
let num = parseInt(str);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const bet = parseInt(betStr) || 0;
```
**How it works here**: Number parsing is used to convert a string to a number. The `parseInt()` function converts a string to an integer, and the `||` operator provides a default value if the conversion fails.
**Why it's used**: Number parsing is used to convert strings to numbers, making it easier to perform numerical operations.
**If you change/remove it**: If you remove the number parsing, the code will not be able to convert strings to numbers. If you change the number parsing, the code will produce different results.

---
### Concept 10: Conditional Operators
Conditional operators are used to make decisions based on conditions. They are like shortcuts that help you write more concise code.
**General Example**
```javascript
let age = 25;
let status = age >= 18 ? 'adult' : 'minor';
console.log(status); // Outputs: adult
```
**In Our Code**
```javascript
let rawArgs = lowerTxt.startsWith(`${prefix} chess`)
  ? lowerTxt.substring(`${prefix} chess`.length).trim()
  : lowerTxt.substring(`${prefix} c `.length).trim();
```
**How it works here**: Conditional operators are used to make decisions based on conditions. The `?` operator is used to provide a value if the condition is true, and the `:` operator is used to provide a value if the condition is false.
**Why it's used**: Conditional operators are used to make decisions based on conditions, making it easier to write more concise code.
**If you change/remove it**: If you remove the conditional operator, the code will not be able to make decisions based on conditions. If you change the conditional operator, the code will produce different results.
