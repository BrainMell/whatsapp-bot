# Tic-Tac-Toe Game Command Flow (`ttt`, `tttt`, `ttttt`)

## 1. Description
The Tic-Tac-Toe game commands allow users to play classic 3x3 (`ttt`), 8x8 (`tttt`), or 16x16 (`ttttt`) tic-tac-toe games directly in WhatsApp. Wins yield points and Zeni, while losses deduct points. The game renders the board dynamically using canvas-based image attachments or text fallback and tracks high scores via a global system.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j ttt @opponent"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── ttt / tttt / ttttt command matching (L16937)
            └── core/games/tictactoe.js
                └── handleStartGame(sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize) (L360)
                    └── createGame(senderJid, opponentJid, chatId, gridSize, sock, botMarker) (L66)
                        └── new TttGame(...)
                        └── activeGames.set(chatId, gameSession)
                    └── renderBoard(board, gridSize) (L180)
                    └── sock.sendMessage(chatId, { image: imageBuffer, caption })

User sends ".j move 4" (making a move in a ttt game)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── move command matching (L17035)
            └── core/games/tictactoe.js
                └── handleMove(sock, chatId, senderJid, cellIndex, botMarker, m, senderName) (L387)
                    └── makeMove(chatId, senderJid, cellIndex) (L81)
                    └── renderBoard(board, gridSize, lastMoveIndex, winPattern) (L180)
                    └── updateScoreboard(winnerJid, name, points) (L279)
                    └── economy.addMoney(winnerJid, amount) (L410)
                    └── deleteGame(chatId) (L54)
                    └── sock.sendMessage(chatId, { image: imageBuffer, caption })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: Dispatched command matching loop

---

### Step 2: Command Matching and Routing
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L16937-L17006)
* **Inputs**: Command string `lowerTxt`
* **Outputs**: Direct call to `tictactoe.handleStartGame` or subcommands

```javascript
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ttt`)) {
  const args = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} ttt`.length).trim().split(" ");
  const command = args[0]?.toLowerCase();
  
  if (command === "end" || command === "stop") {
    await tictactoe.handleEndGame(sock, chatId, senderJid, BOT_MARKER, m);
    return;
  }
  // ... handles scores & board commands, then defaults to start:
  const opponent = getMentionOrReply(m);
  await tictactoe.handleStartGame(sock, chatId, senderJid, [opponent], BOT_MARKER, m, 3);
  return;
}
```

---

### Step 3: Game Initialization and Board Rendering
* **File Path**: [tictactoe.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/tictactoe.js#L360-L385)
* **Inputs**: `(sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize = 3)`
* **Outputs**: Persists new game in memory map and returns rendered visual board

```javascript
handleStartGame: async (sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize = 3) => {
  if (hasActiveGame(chatId)) return reply("Game in progress.");
  const opponentJid = mentionedJids[0];
  const game = createGame(senderJid, opponentJid, chatId, gridSize, sock, botMarker);
  
  const imageBuffer = await renderBoard(game.board, gridSize);
  // ... sends board image with cell annotations
}
```

Inside `createGame`:
```javascript
function createGame(playerA, playerB, chatId, gridSize, sock, botMarker) {
  const game = {
    chatId,
    playerA,
    playerB,
    gridSize,
    board: Array(gridSize * gridSize).fill(null),
    currentTurn: playerA,
    status: 'playing',
    // ... timeouts
  };
  activeGames.set(chatId, game);
  return game;
}
```

---

### Step 4: Making Game Moves and Scoring
* **File Path**: [tictactoe.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/tictactoe.js#L387-L445)
* **Inputs**: `(sock, chatId, senderJid, cellIndex, botMarker, m, senderName)`
* **Outputs**: Updates board cell, evaluates win condition, awards reward, deletes game session

```javascript
handleMove: async (sock, chatId, senderJid, cellIndex, botMarker, m, senderName = 'Player') => {
  const result = makeMove(chatId, senderJid, parseInt(cellIndex));
  if (!result.success) return reply(result.error);
  
  const imageBuffer = await renderBoard(result.game.board, result.game.gridSize, result.game.lastMoveIndex, result.winPattern);
  
  if (result.game.status === 'win') {
    updateScoreboard(result.game.winner, winnerName, points);
    updateScoreboard(loserJid, 'Player', -1);
    economy.addMoney(result.game.winner, points * 100);
    deleteGame(chatId);
  }
  // ... sends updated board image or text fallback to WhatsApp
}
```

---

## 4. How to Modify
* **Scoreboard Metrics**: Adjust points won/lost for different grid sizes in [tictactoe.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/tictactoe.js#L396):
  ```javascript
  const points = gridSize === 3 ? 1 : gridSize === 8 ? 2 : 3;
  ```
* **Adjust Wallet Reward**: Modify the multiplier for the winner in [tictactoe.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/tictactoe.js#L409):
  ```javascript
  const moneyReward = points * 100;
  ```
* **Alter Styling / Colors of Board Canvas**: Modify the canvas draw parameters (colors, fonts, line widths) in the `renderBoard` function (around line 180) in [tictactoe.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/tictactoe.js).










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
const opponent = getMentionOrReply(m);
const game = createGame(senderJid, opponentJid, chatId, gridSize, sock, botMarker);
```
**How it works here**: Variables are used to store values such as the opponent's ID, the game object, and the chat ID. These values are then used in the program to perform various operations.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to write and understand the code.
**If you change/remove it**: If you remove or change a variable, the program may not work as expected. For example, if you remove the `opponent` variable, the program will not know who the opponent is and will throw an error.

---
### Concept 2: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They allow the program to execute different blocks of code depending on whether a condition is true or false.
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
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ttt`)) {
  // ...
  if (command === "end" || command === "stop") {
    await tictactoe.handleEndGame(sock, chatId, senderJid, BOT_MARKER, m);
    return;
  }
  // ...
}
```
**How it works here**: Conditional statements are used to check if the input text starts with a certain prefix, and if so, execute a block of code. They are also used to check if the command is "end" or "stop" and execute a different block of code.
**Why it's used**: Conditional statements are used to make decisions in the program and execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove or change a conditional statement, the program may not work as expected. For example, if you remove the `if (lowerTxt.startsWith(...))` statement, the program will not check if the input text starts with the prefix and will not execute the corresponding block of code.

---
### Concept 3: Functions
Functions are reusable blocks of code that perform a specific task. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
handleStartGame: async (sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize = 3) => {
  // ...
}
```
**How it works here**: Functions are used to perform specific tasks such as handling the start of a game, handling a move, and creating a game object.
**Why it's used**: Functions are used to organize the code and make it reusable. They allow the program to perform complex tasks by breaking them down into smaller, manageable functions.
**If you change/remove it**: If you remove or change a function, the program may not work as expected. For example, if you remove the `handleStartGame` function, the program will not know how to handle the start of a game and will throw an error.

---
### Concept 4: Arrays
Arrays are collections of values that can be of any data type, including strings, numbers, and objects.
**General Example**
```javascript
let colors = ['red', 'green', 'blue'];
console.log(colors[0]); // outputs: red
```
**In Our Code**
```javascript
const args = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} ttt`.length).trim().split(" ");
const command = args[0]?.toLowerCase();
```
**How it works here**: Arrays are used to store the arguments passed to the program, and then access the first argument using `args[0]`.
**Why it's used**: Arrays are used to store and manipulate collections of values.
**If you change/remove it**: If you remove or change an array, the program may not work as expected. For example, if you remove the `args` array, the program will not know how to access the arguments passed to it.

---
### Concept 5: Object Literals
Object literals are used to create objects in a concise way. They consist of key-value pairs enclosed in curly brackets.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // outputs: John
```
**In Our Code**
```javascript
const game = {
  chatId,
  playerA,
  playerB,
  gridSize,
  board: Array(gridSize * gridSize).fill(null),
  currentTurn: playerA,
  status: 'playing',
  // ...
};
```
**How it works here**: Object literals are used to create game objects with various properties such as chat ID, player IDs, grid size, and board.
**Why it's used**: Object literals are used to create objects in a concise way and make the code more readable.
**If you change/remove it**: If you remove or change an object literal, the program may not work as expected. For example, if you remove the `game` object, the program will not know how to store and access the game data.

---
### Concept 6: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code. It allows the program to pause and resume execution at specific points.
**General Example**
```javascript
async function example() {
  let data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
handleStartGame: async (sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize = 3) => {
  // ...
  const imageBuffer = await renderBoard(game.board, gridSize);
  // ...
}
```
**How it works here**: Async/await is used to handle asynchronous operations such as rendering the game board and sending the image buffer.
**Why it's used**: Async/await is used to make the code more readable and easier to understand by avoiding the use of callbacks and promises.
**If you change/remove it**: If you remove or change the async/await syntax, the program may not work as expected. For example, if you remove the `await` keyword, the program will not pause and resume execution at the correct points, and may throw errors.

---
### Concept 7: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // ...
  resolve('Success');
});
promise.then((data) => {
  console.log(data);
});
```
**In Our Code**
```javascript
const result = makeMove(chatId, senderJid, parseInt(cellIndex));
if (!result.success) return reply(result.error);
```
**How it works here**: Promises are used to handle the result of making a move, and provide a way to execute code when the promise is resolved or rejected.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when a promise is resolved or rejected.
**If you change/remove it**: If you remove or change the promise, the program may not work as expected. For example, if you remove the `makeMove` function, the program will not know how to handle the result of making a move.

---
### Concept 8: Parsing Numbers
Parsing numbers is the process of converting a string to a number.
**General Example**
```javascript
let string = '123';
let number = parseInt(string);
console.log(number); // outputs: 123
```
**In Our Code**
```javascript
const cellIndex = parseInt(cellIndex);
```
**How it works here**: Parsing numbers is used to convert the cell index from a string to a number.
**Why it's used**: Parsing numbers is used to convert strings to numbers, which is necessary for performing mathematical operations.
**If you change/remove it**: If you remove or change the parsing of numbers, the program may not work as expected. For example, if you remove the `parseInt` function, the program will not know how to convert the cell index to a number.

---
### Concept 9: Destructuring
Destructuring is a syntax sugar that allows you to extract values from objects and arrays and assign them to variables.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
const { chatId, playerA, playerB, gridSize, board, currentTurn, status } = game;
```
**How it works here**: Destructuring is used to extract values from the game object and assign them to variables.
**Why it's used**: Destructuring is used to make the code more readable and easier to understand by avoiding the use of dot notation.
**If you change/remove it**: If you remove or change the destructuring, the program may not work as expected. For example, if you remove the destructuring, the program will not know how to extract the values from the game object.

---
### Concept 10: Default Parameters
Default parameters are used to provide a default value for a function parameter if no value is passed.
**General Example**
```javascript
function greet(name = 'World') {
  console.log(`Hello, ${name}!`);
}
greet(); // outputs: Hello, World!
```
**In Our Code**
```javascript
handleStartGame: async (sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize = 3) => {
  // ...
}
```
**How it works here**: Default parameters are used to provide a default value for the grid size if no value is passed.
**Why it's used**: Default parameters are used to make the code more flexible and easier to use by providing a default value for a parameter.
**If you change/remove it**: If you remove or change the default parameter, the program may not work as expected. For example, if you remove the default value for the grid size, the program will throw an error if no value is passed.
