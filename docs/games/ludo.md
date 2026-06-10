# Ludo Game Command Flow (`ludo`)

## 1. Description
The Ludo command operates a full multiplayer virtual Ludo board game for 2 to 4 players inside a group chat. The game features dice rolling, piece selection (1-4), player collision/capturing, home lanes, dynamic image generation representing board state, and automatic turn progression.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j ludo start @opponent1 @opponent2"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── ludo start command matching (L16689)
            └── core/games/ludo.js
                └── startGame(sock, chatId, starterJid, mentionedJids, BOT_MARKER, m) (L439)
                    └── new LudoGame(chatId, allPlayers, sock) (L461)
                    └── activeGames.set(chatId, gameInstance)
                    └── renderBoard(game, sock) (L129)
                    └── sock.sendMessage(chatId, { image: boardImage, caption })

User sends ".j ludo roll"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── ludo roll command matching (L1735)
            └── core/games/ludo.js
                └── rollDice(sock, chatId, senderJid, BOT_MARKER, m) (L507)
                    └── game.rollDice() (L215)
                    └── game.getMovablePieces(player) (L241)
                    └── game.movePiece(player, pieceToMove) (L314) (If only 1 piece is movable)
                    └── game.nextTurn() (L200) (If no moves available)
                    └── renderBoard(game, sock)
                    └── sock.sendMessage(chatId, { image: boardImage, caption })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Message Entry and Verification
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Called From**: Baileys socket connection event emitter
* **Inputs**: `{ messages, type }` event notification payload
* **Outputs**: Dispatched command matching loop

---

### Step 2: Command Matching and Routing
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L16688-L16732)
* **Inputs**: Command string `lowerTxt`
* **Outputs**: Direct call to `ludo.startGame` or other Ludo subcommands

```javascript
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ludo start`)) {
  let mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentionedJids.length === 0) {
    const target = getMentionOrReply(m);
    if (target) mentionedJids = [target];
  }
  const totalPlayers = mentionedJids.length + 1;
  if (totalPlayers < 2 || totalPlayers > 4) {
    return sendUsage("ludo start @friend");
  }
  const result = await ludo.startGame(sock, chatId, senderJid, mentionedJids, BOT_MARKER, m);
  return;
}
```

---

### Step 3: Game Initialization and Board Rendering
* **File Path**: [ludo.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/ludo.js#L439-L505)
* **Inputs**: `(sock, chatId, starterJid, mentionedJids, BOT_MARKER, m)`
* **Outputs**: Creates a session, registers color mappings, returns rendered image board

```javascript
startGame: async (sock, chatId, starterJid, mentionedJids, BOT_MARKER, m) => {
  const allPlayers = [starterJid, ...mentionedJids];
  const game = new LudoGame(chatId, allPlayers, sock);
  activeGames.set(chatId, game);
  
  const imageBuffer = await renderBoard(game, sock);
  // ... formats color emojis and players info, sends message
}
```

Inside the `LudoGame` constructor:
```javascript
class LudoGame {
  constructor(chatId, playerJids, sock) {
    this.chatId = chatId;
    const colors = ['red', 'green', 'yellow', 'blue'];
    this.players = playerJids.map((jid, idx) => ({
      fullJid: jid,
      color: colors[idx],
      pieces: [
        { id: 1, pos: -1, isHome: false },
        { id: 2, pos: -1, isHome: false },
        { id: 3, pos: -1, isHome: false },
        { id: 4, pos: -1, isHome: false },
      ]
    }));
    this.turnIndex = 0;
    this.lastRoll = null;
    // ... handles active turn state & game properties
  }
}
```

---

### Step 4: Turn Rolling and Piece Movements
* **File Path**: [ludo.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/ludo.js#L507-L635)
* **Inputs**: `(sock, chatId, senderJid, BOT_MARKER, m)` (via `rollDice` or `movePiece`)
* **Outputs**: Performs random rolls, moves pieces, handles wins and captures, renders updated board

```javascript
rollDice: async (sock, chatId, senderJid, BOT_MARKER, m) => {
  const game = activeGames.get(chatId);
  if (normalizeJid(game.getCurrentPlayer().fullJid) !== normalizeJid(senderJid)) return reply("Not your turn!");
  
  const rollResult = game.rollDice();
  const movablePieces = game.getMovablePieces(player);
  
  if (rollResult.burned) {
    game.nextTurn();
  } else if (movablePieces.length === 1) {
    // Auto-moves if only one piece is movable
    const moveResult = game.movePiece(player, movablePieces[0]);
    if (moveResult.won) {
      economy.addMoney(player.fullJid, 500); // 500 Zeni reward
      activeGames.delete(chatId);
    }
  }
  // ... renders and sends the new board canvas image to group
}
```

---

## 4. How to Modify
* **Winner Zeni Payout**: Edit reward amount paid upon victory in [ludo.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/ludo.js#L603):
  ```javascript
  const reward = 500;
  economy.addMoney(player.fullJid, reward);
  ```
* **Consecutive Sixes Rule**: Modify the consecutive 6s threshold or turn-burn check inside `rollDice()` in `LudoGame` (around line 215) in [ludo.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/ludo.js).
* **Board Rendering Visuals**: Update board size, slot colors, token drawing shapes, or path mapping in the canvas drawing sections of [ludo.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/ludo.js) (lines 129-199).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They allow the program to make decisions and respond accordingly.
**General Example**
```javascript
let x = 5;
if (x > 10) {
  console.log("x is greater than 10");
} else {
  console.log("x is less than or equal to 10");
}
```
**In Our Code**
```javascript
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ludo start`)) {
  // ...
}
```
**How it works here**: The code checks if the input message starts with a specific prefix and command. If it does, the code inside the if statement is executed.
**Why it's used**: Conditional statements are used to handle different scenarios and make decisions based on user input or other conditions.
**If you change/remove it**: If you remove this conditional statement, the code will not be able to check for the specific command and will not execute the corresponding code. If you change the condition, the code will respond differently to user input.

---
### Concept 2: Variables and Data Types
Variables are used to store and manipulate data in a program. JavaScript has various data types, including strings, numbers, booleans, arrays, and objects.
**General Example**
```javascript
let name = "John";
let age = 30;
let isAdmin = true;
```
**In Our Code**
```javascript
let mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
const totalPlayers = mentionedJids.length + 1;
```
**How it works here**: The code declares variables to store the mentioned JIDs, total players, and other data. The variables are used to store and manipulate the data throughout the code.
**Why it's used**: Variables are used to store and manipulate data, making it easier to write and understand the code.
**If you change/remove it**: If you remove or change a variable, the code may not work as expected, and errors may occur.

---
### Concept 3: Array Methods
Array methods are used to manipulate and interact with arrays in JavaScript. Common array methods include `map()`, `filter()`, and `length`.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(num => num * 2);
```
**In Our Code**
```javascript
const allPlayers = [starterJid, ...mentionedJids];
```
**How it works here**: The code uses the spread operator (`...`) to combine the `starterJid` and `mentionedJids` arrays into a new array `allPlayers`.
**Why it's used**: Array methods are used to manipulate and interact with arrays, making it easier to work with collections of data.
**If you change/remove it**: If you remove or change the array method, the code may not work as expected, and errors may occur.

---
### Concept 4: Classes and Objects
Classes and objects are used to define and create custom data types in JavaScript. Classes define the structure and behavior of an object, while objects are instances of a class.
**General Example**
```javascript
class Person {
  constructor(name, age) {
    this.name = name;
    this.age = age;
  }
}

let person = new Person("John", 30);
```
**In Our Code**
```javascript
class LudoGame {
  constructor(chatId, playerJids, sock) {
    // ...
  }
}
```
**How it works here**: The code defines a `LudoGame` class to represent a game of Ludo. The class has properties and methods that define the game's behavior.
**Why it's used**: Classes and objects are used to define and create custom data types, making it easier to organize and structure code.
**If you change/remove it**: If you remove or change the class, the code will not be able to create instances of the game, and errors may occur.

---
### Concept 5: Async/Await and Promises
Async/await and promises are used to handle asynchronous code in JavaScript. Promises represent a value that may not be available yet, while async/await provides a way to write asynchronous code that is easier to read and maintain.
**General Example**
```javascript
function delayedLog() {
  return new Promise(resolve => {
    setTimeout(() => {
      console.log("Delayed log");
      resolve();
    }, 2000);
  });
}

async function main() {
  await delayedLog();
  console.log("Main function finished");
}
```
**In Our Code**
```javascript
const result = await ludo.startGame(sock, chatId, senderJid, mentionedJids, BOT_MARKER, m);
```
**How it works here**: The code uses async/await to wait for the `startGame` method to complete before continuing with the rest of the code.
**Why it's used**: Async/await and promises are used to handle asynchronous code, making it easier to write and maintain code that interacts with external resources or performs time-consuming operations.
**If you change/remove it**: If you remove or change the async/await syntax, the code may not work as expected, and errors may occur.

---
### Concept 6: Destructuring
Destructuring is a syntax feature in JavaScript that allows you to extract values from arrays and objects and assign them to variables.
**General Example**
```javascript
let person = { name: "John", age: 30 };
let { name, age } = person;
```
**In Our Code**
```javascript
const { fullJid, color, pieces } = this.players[idx];
```
**How it works here**: The code uses destructuring to extract the `fullJid`, `color`, and `pieces` properties from the `players` array and assign them to variables.
**Why it's used**: Destructuring is used to simplify code and make it easier to extract values from complex data structures.
**If you change/remove it**: If you remove or change the destructuring syntax, the code may not work as expected, and errors may occur.

---
### Concept 7: Functions and Function Calls
Functions are reusable blocks of code that take arguments and return values. Function calls are used to invoke a function and pass arguments to it.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}

greet("John");
```
**In Our Code**
```javascript
const result = await ludo.startGame(sock, chatId, senderJid, mentionedJids, BOT_MARKER, m);
```
**How it works here**: The code calls the `startGame` function and passes arguments to it. The function returns a promise that is awaited using async/await syntax.
**Why it's used**: Functions and function calls are used to organize and reuse code, making it easier to write and maintain complex programs.
**If you change/remove it**: If you remove or change the function call, the code will not be able to invoke the function, and errors may occur.

---
### Concept 8: String Methods
String methods are used to manipulate and interact with strings in JavaScript. Common string methods include `startsWith()`, `toLowerCase()`, and `toUpperCase()`.
**General Example**
```javascript
let str = "Hello, World!";
if (str.startsWith("Hello")) {
  console.log("The string starts with Hello");
}
```
**In Our Code**
```javascript
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ludo start`)) {
  // ...
}
```
**How it works here**: The code uses the `startsWith()` method to check if the input message starts with a specific prefix and command.
**Why it's used**: String methods are used to manipulate and interact with strings, making it easier to work with text data.
**If you change/remove it**: If you remove or change the string method, the code may not work as expected, and errors may occur.

---
### Concept 9: Nullish Coalescing Operator
The nullish coalescing operator (`||`) is used to provide a default value when a variable or expression is null or undefined.
**General Example**
```javascript
let name = null;
let fullName = name || "Unknown";
```
**In Our Code**
```javascript
let mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
```
**How it works here**: The code uses the nullish coalescing operator to provide an empty array as a default value when `mentionedJid` is null or undefined.
**Why it's used**: The nullish coalescing operator is used to provide a default value and avoid null pointer exceptions.
**If you change/remove it**: If you remove or change the nullish coalescing operator, the code may throw a null pointer exception or produce unexpected results.

---
### Concept 10: Optional Chaining Operator
The optional chaining operator (`?.`) is used to access properties of an object that may be null or undefined.
**General Example**
```javascript
let person = { name: "John" };
let fullName = person?.name;
```
**In Our Code**
```javascript
let mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
```
**How it works here**: The code uses the optional chaining operator to access the `mentionedJid` property of the `contextInfo` object, which may be null or undefined.
**Why it's used**: The optional chaining operator is used to avoid null pointer exceptions and provide a safe way to access properties of an object.
**If you change/remove it**: If you remove or change the optional chaining operator, the code may throw a null pointer exception or produce unexpected results.
