# Wordle Game Command Flow (`wordle`)

## 1. Description
The Wordle game command allows players to start a 5-letter word guessing game directly inside WhatsApp. Players get 6 attempts to guess a randomly chosen word. Each guess receives color-coded feedback indicating letter correctness and position. Winning games awards Zeni (economy currency).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j wordle start" (or e/m/h)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── wordle command matching (L17155)
            └── core/games/wordle.js
                └── startGame(sock, chatId, senderJid, botMarker, m, playerName, difficulty) (L491)
                    └── createGame(...) (L125)
                        └── loadWordsFromTXT() / FALLBACK_WORDS (L19)
                        └── new WordleGame(...) (L129)
                        └── activeGames.set(playerJid, gameInstance)
                    └── sock.sendMessage(chatId, { text: boardMessage })

User sends ".j wordle CRANE" (making a guess)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── wordle guess matching (L17205)
            └── core/games/wordle.js
                └── makeGuess(sock, chatId, senderJid, guessWord, botMarker, m) (L533)
                    └── game.makeGuess(word) (L195)
                    └── economy.addMoney(senderJid, rewardAmount) (L561)
                    └── deleteGame(senderJid) (L570)
                    └── sock.sendMessage(chatId, { text: resultMessage })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Ingestion and Pre-Processing
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Called From**: Baileys socket connection event emitter (`sock.ev.on`)
* **Inputs**: `{ messages, type }` event notification payload
* **Outputs**: Dispatched message processing loop

```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify" && type !== "append") return;
  // ... maps and iterates each message object
```

---

### Step 2: Command Matching and Triggering
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L17155-L17202)
* **Inputs**: Parsed prefix and text string `lowerTxt`
* **Outputs**: Calls `wordle.startGame` or `wordle.makeGuess` depending on arguments

```javascript
if (
  lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle start` ||
  lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle` ||
  // ... (easy, medium, hard matching)
) {
  let difficulty = "medium";
  if (lowerTxt.includes("easy") || lowerTxt.endsWith(" e")) {
    difficulty = "easy";
  } // ... sets difficulty
  const result = await wordle.startGame(sock, chatId, senderJid, BOT_MARKER, m, senderName, difficulty);
  return;
}
```

If guess command is triggered:
```javascript
if (
  lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} wordle `) &&
  lowerTxt.length > `${botConfig.getPrefix().toLowerCase()} wordle `.length
) {
  const guess = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} wordle `.length).trim();
  // Checks if it is a reserved subcommand. If not, guesses:
  const result = await wordle.makeGuess(sock, chatId, senderJid, guess, BOT_MARKER, m);
  return;
}
```

---

### Step 3: Game Initialization and Word Selection
* **File Path**: [wordle.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/wordle.js#L491-L531)
* **Inputs**: `(sock, chatId, senderJid, botMarker, m, playerName, difficulty)`
* **Outputs**: Starts a session and responds with the initial board state

```javascript
startGame: async (sock, chatId, senderJid, botMarker, m, playerName = 'Player', difficulty = 'medium') => {
  if (getGame(senderJid)) {
    return { success: false, message: botMarker + `❌ You already have an active game!` };
  }
  const game = createGame(senderJid, playerName, difficulty, chatId, sock, botMarker);
  // ... formats and builds message with game.getBoard()
  await sock.sendMessage(chatId, { text: message }, { quoted: m });
  return { success: true };
}
```

Inside `createGame`:
```javascript
function createGame(playerJid, playerName, difficulty, chatId, sock, botMarker) {
  const words = WORD_LIST.length > 0 ? WORD_LIST : FALLBACK_WORDS;
  const randomIndex = Math.floor(Math.random() * words.length);
  const targetWord = words[randomIndex];
  
  const game = new WordleGame(playerJid, playerName, targetWord, difficulty);
  activeGames.set(normalizeJid(playerJid), game);
  // ... sets up automatic idle expiration timeout
  return game;
}
```

---

### Step 4: Making a Guess and Awarding Prizes
* **File Path**: [wordle.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/wordle.js#L533-L579)
* **Inputs**: `(sock, chatId, senderJid, word, botMarker, m)`
* **Outputs**: Validates the guess, updates the board, determines victory, pays reward

```javascript
makeGuess: async (sock, chatId, senderJid, word, botMarker, m) => {
  const game = getGame(senderJid);
  if (!game) return { success: false, message: "❌ No active game!" };
  
  const result = game.makeGuess(word);
  // ... handles guess evaluation
  if (result.gameOver) {
    if (result.won) {
      const rewards = { easy: 100, medium: 200, hard: 300 };
      const amount = rewards[game.difficulty] || 200;
      economy.addMoney(senderJid, amount); // Updates user wallet
      message += `💰 *Reward:* +${amount} Zeni\n\n`;
    }
    deleteGame(senderJid); // Cleans state map
  }
  await sock.sendMessage(chatId, { text: message }, { quoted: m });
  return { success: true };
}
```

---

## 4. How to Modify
* **Adjust Difficulty Rewards**: Modify reward amounts in [wordle.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/wordle.js#L559):
  ```javascript
  const rewards = { easy: 100, medium: 200, hard: 300 };
  ```
* **Alter Game Inactivity Expiry**: Modify the game expiration timeout in `createGame` or `resetTimeout` inside [wordle.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/wordle.js).
* **Add/Update Word Sources**: Words are loaded from `core/Ldatabase/words.txt`. Update that file to change the target game words pool.










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
let difficulty = "medium";
```
**How it works here**: The variable `difficulty` is used to store the level of difficulty for the Wordle game.
**Why it's used**: Variables are used to store values that can be used later in the program, making it easier to manage and modify the code.
**If you change/remove it**: If you remove the `difficulty` variable, the game would not be able to store the level of difficulty, and the game would not function as expected. If you change the value of `difficulty`, the game would use the new value to determine the level of difficulty.

---
### Concept 2: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They can be thought of as "if-then" statements.
**General Example**
```javascript
let age = 25;
if (age > 18) {
  console.log('You are an adult');
} else {
  console.log('You are a minor');
}
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle start` ||
  lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle` ||
  // ... (easy, medium, hard matching)
) {
  // ...
}
```
**How it works here**: The conditional statement is used to check if the user's input matches certain commands, and if so, it executes the code inside the block.
**Why it's used**: Conditional statements are used to make decisions in a program based on certain conditions, allowing the program to respond differently to different inputs.
**If you change/remove it**: If you remove the conditional statement, the program would not be able to make decisions based on the user's input, and the game would not function as expected. If you change the conditions, the program would respond differently to different inputs.

---
### Concept 3: Functions
Functions are blocks of code that can be called multiple times from different parts of a program. They can be thought of as reusable pieces of code.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
startGame: async (sock, chatId, senderJid, botMarker, m, playerName = 'Player', difficulty = 'medium') => {
  // ...
}
```
**How it works here**: The `startGame` function is used to start a new game of Wordle, and it takes in several parameters such as the socket, chat ID, sender's JID, and more.
**Why it's used**: Functions are used to organize code into reusable blocks, making it easier to manage and modify the code.
**If you change/remove it**: If you remove the `startGame` function, the program would not be able to start a new game of Wordle. If you change the function, the program would behave differently when starting a new game.

---
### Concept 4: Event Listeners
Event listeners are used to respond to events that occur in a program, such as user input or network requests.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('The document was clicked');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The event listener is used to respond to the "messages.upsert" event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events that occur in a program, allowing the program to react to user input or other events.
**If you change/remove it**: If you remove the event listener, the program would not be able to respond to the "messages.upsert" event, and the game would not function as expected. If you change the event listener, the program would respond differently to the event.

---
### Concept 5: Array Methods
Array methods are used to manipulate and interact with arrays, such as filtering, mapping, or reducing.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((number) => number * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
const words = WORD_LIST.length > 0 ? WORD_LIST : FALLBACK_WORDS;
const randomIndex = Math.floor(Math.random() * words.length);
const targetWord = words[randomIndex];
```
**How it works here**: The array method is used to select a random word from the `words` array.
**Why it's used**: Array methods are used to manipulate and interact with arrays, making it easier to work with data.
**If you change/remove it**: If you remove the array method, the program would not be able to select a random word, and the game would not function as expected. If you change the array method, the program would select a different word.

---
### Concept 6: Object Literals
Object literals are used to create objects, which are collections of key-value pairs.
**General Example**
```javascript
const person = {
  name: 'John',
  age: 25
};
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const rewards = { easy: 100, medium: 200, hard: 300 };
```
**How it works here**: The object literal is used to create an object that maps difficulty levels to reward amounts.
**Why it's used**: Object literals are used to create objects, making it easier to work with data.
**If you change/remove it**: If you remove the object literal, the program would not be able to map difficulty levels to reward amounts, and the game would not function as expected. If you change the object literal, the program would use different reward amounts.

---
### Concept 7: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // ...
});
promise.then((result) => {
  console.log(result);
});
```
**In Our Code**
```javascript
const result = await wordle.startGame(sock, chatId, senderJid, BOT_MARKER, m, senderName, difficulty);
```
**How it works here**: The promise is used to handle the asynchronous operation of starting a new game of Wordle.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to work with asynchronous code.
**If you change/remove it**: If you remove the promise, the program would not be able to handle the asynchronous operation, and the game would not function as expected. If you change the promise, the program would behave differently when starting a new game.

---
### Concept 8: Async/Await
Async/await is a syntax for working with promises, making it easier to write asynchronous code.
**General Example**
```javascript
async function example() {
  const result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
startGame: async (sock, chatId, senderJid, botMarker, m, playerName = 'Player', difficulty = 'medium') => {
  // ...
}
```
**How it works here**: The async/await syntax is used to handle the asynchronous operation of starting a new game of Wordle.
**Why it's used**: Async/await is used to make it easier to write asynchronous code, making it more readable and maintainable.
**If you change/remove it**: If you remove the async/await syntax, the program would not be able to handle the asynchronous operation, and the game would not function as expected. If you change the async/await syntax, the program would behave differently when starting a new game.

---
### Concept 9: Destructuring
Destructuring is a syntax for extracting values from objects or arrays.
**General Example**
```javascript
const person = {
  name: 'John',
  age: 25
};
const { name, age } = person;
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The destructuring syntax is used to extract the `messages` and `type` values from the object passed to the event listener.
**Why it's used**: Destructuring is used to make it easier to extract values from objects or arrays, making the code more readable and maintainable.
**If you change/remove it**: If you remove the destructuring syntax, the program would not be able to extract the values, and the game would not function as expected. If you change the destructuring syntax, the program would extract different values.

---
### Concept 10: Modules and Imports
Modules and imports are used to organize code into reusable modules, making it easier to manage and maintain the code.
**General Example**
```javascript
import { example } from './example.js';
```
**In Our Code**
```javascript
const botConfig = require('./botConfig.js');
```
**How it works here**: The module is imported, making its functions and variables available for use in the code.
**Why it's used**: Modules and imports are used to organize code into reusable modules, making it easier to manage and maintain the code.
**If you change/remove it**: If you remove the import, the program would not be able to use the functions and variables from the module, and the game would not function as expected. If you change the import, the program would use different functions and variables.
