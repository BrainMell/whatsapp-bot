# Blackjack Command Flow (`bj`)

## 1. Description
The Blackjack command operates a full virtual card game of 21. Players can start a match by placing a bet, then request cards via `bj hit` or maintain their hand value with `bj stand`.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j bj 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "bj") (L4825)
            └── core/gambling.js
                └── startBlackjack(senderJid, amount, economy) (L531)
                    └── deck creation & shuffling (L477)
                    └── Deal two cards to player and dealer
                    └── calculateHandValue (L502)
                    └── check for natural blackjack (21)
                    └── activeBlackjackGames.set(userId, gameSession)
                    └── user.wallet -= amount
                    └── economy.saveUser(senderJid)
                    └── reply layout/cards to WhatsApp
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
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
- Receives message arrays from Baileys and routes valid notify payloads downstream.

---

### Step 2: Command Matching and Extraction
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Message parser block
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: `primaryCmd` and `cmdArgs` array

```javascript
if (lowerTxt.startsWith(currentPrefix)) {
  const cmdBody = lowerTxt
    .substring(currentPrefix.length)
    .trim();
  const cmdArgs = cmdBody.split(" ");
  const primaryCmd = cmdArgs[0];
```

#### Explanation
- Extracts prefix details and resolves parameters.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4825
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.startBlackjack` or subcommands

```javascript
if (primaryCmd === "bj") {
  const action = cmdArgs[1] || "";
  if (action === "hit") {
    const result = gambling.blackjackHit(senderJid, economy);
    return await reply(result.message);
  } else if (action === "stand") {
    const result = gambling.blackjackStand(senderJid, economy);
    return await reply(result.message);
  } else {
    const betAmount = parseInt(action, 10);
    const result = gambling.startBlackjack(senderJid, betAmount, economy);
    return await reply(result.message);
  }
}
```

#### Explanation
- Identifies if the subcommand is `"hit"`, `"stand"`, or a numeric bet to initialize a new game.

---

### Step 4: Game Initialization
* **File Path**: `core/gambling.js`
* **Line Numbers**: 531-600
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function startBlackjack(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds." };
  
  if (activeBlackjackGames.has(userId)) {
    return { success: false, message: "❌ Active game already exists!" };
  }
  
  user.wallet -= amount;
  const ctx = beginGamblingRound(user);
  
  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  
  const playerValue = calculateHandValue(playerHand);
  
  if (playerValue === 21) {
    // Natural Blackjack payout
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount * 2.5, ctx));
    user.wallet += gain;
    economyModule.saveUser(userId);
    return { success: true, won: true, message: "Natural Blackjack payout message" };
  }
  
  activeBlackjackGames.set(userId, {
    deck,
    playerHand,
    dealerHand,
    bet: amount,
    ctx
  });
  
  economyModule.saveUser(userId);
  return { success: true, message: "Display current hands" };
}
```

#### Explanation
- Deducts the initial bet amount from the wallet.
- Generates a full card deck and shuffles it.
- Deals 2 cards to the player and 2 cards to the dealer (with one hidden).
- Evaluates hand values. If the player rolls a natural 21 (Ace + Face card), returns a 3:2 payout (`amount * 2.5`). Otherwise, registers the session key map inside `activeBlackjackGames`.

---

## 5. How to Modify
To adjust blackjack dealer behavior or payout rules:
- Edit natural blackjack payout multiplier in `core/gambling.js` (around line 562):
  ```javascript
  // Change 2.5x to 2.0x or another ratio:
  const rawPayout = Math.floor(amount * 2.0);
  ```










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
const cmdBody = lowerTxt
  .substring(currentPrefix.length)
  .trim();
const primaryCmd = cmdArgs[0];
```
**How it works here**: Variables like `cmdBody` and `primaryCmd` are used to store the results of string operations and array indexing, allowing the program to use these values later.
**Why it's used**: Variables are essential for storing and manipulating data in a program. Without them, the program would not be able to remember or use the results of previous operations.
**If you change/remove it**: If you remove or change these variables, the program would not be able to store or use the results of the string operations and array indexing, leading to errors or unexpected behavior.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax and can be used as callbacks or event handlers.
**General Example**
```javascript
const greet = (name) => {
  console.log(`Hello, ${name}!`);
};
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The arrow function is used as an event handler for the `messages.upsert` event. When the event is triggered, the function is called with the event data as an argument.
**Why it's used**: Arrow functions are used here because they provide a concise way to define small, single-purpose functions. They are also used to define asynchronous functions using the `async` keyword.
**If you change/remove it**: If you remove or change this arrow function, the event handler would not be defined, and the program would not be able to respond to the `messages.upsert` event.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events or changes in a program. They are defined using the `on` method and are called when the event is triggered.
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
**How it works here**: The event listener is used to respond to the `messages.upsert` event. When the event is triggered, the event listener calls the arrow function defined above.
**Why it's used**: Event listeners are used here because they provide a way to respond to events or changes in the program. In this case, the event listener is used to process incoming messages.
**If you change/remove it**: If you remove or change this event listener, the program would not be able to respond to the `messages.upsert` event, and the message processing logic would not be executed.

---
### Concept 4: Array Methods
Array methods are used to manipulate and transform arrays. They can be used to iterate over arrays, filter elements, and perform other operations.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` method is used to iterate over the `messages` array and perform an asynchronous operation on each element.
**Why it's used**: Array methods are used here because they provide a concise way to manipulate and transform arrays. In this case, the `map` method is used to iterate over the `messages` array and perform an asynchronous operation on each element.
**If you change/remove it**: If you remove or change this array method, the program would not be able to iterate over the `messages` array and perform the asynchronous operation, leading to errors or unexpected behavior.

---
### Concept 5: Conditional Statements
Conditional statements are used to make decisions in a program based on conditions or criteria. They can be used to execute different blocks of code depending on the condition.
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
if (primaryCmd === "bj") {
  // ...
} else {
  // ...
}
```
**How it works here**: The conditional statement is used to check if the `primaryCmd` variable is equal to `"bj"`. If it is, the program executes the block of code inside the `if` statement.
**Why it's used**: Conditional statements are used here because they provide a way to make decisions in the program based on conditions or criteria. In this case, the conditional statement is used to determine which block of code to execute based on the value of `primaryCmd`.
**If you change/remove it**: If you remove or change this conditional statement, the program would not be able to make decisions based on the value of `primaryCmd`, leading to errors or unexpected behavior.

---
### Concept 6: String Methods
String methods are used to manipulate and transform strings. They can be used to extract substrings, trim whitespace, and perform other operations.
**General Example**
```javascript
const greeting = '   Hello, World!   ';
const trimmedGreeting = greeting.trim();
console.log(trimmedGreeting); // Outputs: Hello, World!
```
**In Our Code**
```javascript
const cmdBody = lowerTxt
  .substring(currentPrefix.length)
  .trim();
```
**How it works here**: The `substring` and `trim` methods are used to extract a substring from `lowerTxt` and remove whitespace from the result.
**Why it's used**: String methods are used here because they provide a way to manipulate and transform strings. In this case, the `substring` and `trim` methods are used to extract the command body from the input text.
**If you change/remove it**: If you remove or change these string methods, the program would not be able to extract the command body correctly, leading to errors or unexpected behavior.

---
### Concept 7: Numbers Parsing
Numbers parsing is used to convert strings to numbers. This can be done using the `parseInt` function or the `Number` function.
**General Example**
```javascript
const string = '123';
const number = parseInt(string);
console.log(number); // Outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(action, 10);
```
**How it works here**: The `parseInt` function is used to convert the `action` string to a number.
**Why it's used**: Numbers parsing is used here because it provides a way to convert strings to numbers. In this case, the `parseInt` function is used to convert the `action` string to a number, which is then used as the bet amount.
**If you change/remove it**: If you remove or change this numbers parsing, the program would not be able to convert the `action` string to a number, leading to errors or unexpected behavior.

---
### Concept 8: Promises
Promises are used to handle asynchronous operations in a program. They provide a way to execute code when an operation is complete.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Operation complete!');
});
promise.then((result) => {
  console.log(result); // Outputs: Operation complete!
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
**How it works here**: The `Promise.all` function is used to wait for all the asynchronous operations in the `messages` array to complete.
**Why it's used**: Promises are used here because they provide a way to handle asynchronous operations in a program. In this case, the `Promise.all` function is used to wait for all the asynchronous operations in the `messages` array to complete.
**If you change/remove it**: If you remove or change this promise, the program would not be able to wait for the asynchronous operations to complete, leading to errors or unexpected behavior.

---
### Concept 9: Destructuring
Destructuring is used to extract values from objects or arrays. It provides a concise way to assign values to variables.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
const { messages, type } = sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The destructuring syntax is used to extract the `messages` and `type` values from the event data object.
**Why it's used**: Destructuring is used here because it provides a concise way to extract values from objects or arrays. In this case, the destructuring syntax is used to extract the `messages` and `type` values from the event data object.
**If you change/remove it**: If you remove or change this destructuring, the program would not be able to extract the `messages` and `type` values correctly, leading to errors or unexpected behavior.

---
### Concept 10: Database Operations
Database operations are used to interact with a database. They can be used to store, retrieve, or update data in a database.
**General Example**
```javascript
const db = require('db');
db.saveUser({ name: 'John', age: 25 });
```
**In Our Code**
```javascript
economyModule.saveUser(userId);
```
**How it works here**: The `saveUser` function is used to save the user data to the database.
**Why it's used**: Database operations are used here because they provide a way to interact with a database. In this case, the `saveUser` function is used to save the user data to the database.
**If you change/remove it**: If you remove or change this database operation, the program would not be able to save the user data to the database, leading to errors or unexpected behavior.
