# Cups Command Flow (`cups`)

> [!IMPORTANT]
> **Code Modification Quick-Reference**:
> * **Game Logic & Payouts**: If you want to modify how the game works (adjust payouts, change the number of cups, or modify odds), go directly to **Step 4: Cups Logic** in [core/gambling.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/gambling.js#L2251).
> * **Command Routing & Parser**: If you want to change the command prefix, alias, or command detection, check **Step 3: Command Routing** in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L15785).

## 1. Description
The Cups command places a ball under one of three cups. The player picks a cup (1-3). Correct guesses reward a 4x payout.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j cups 1000 2"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "cups") (L15788)
            └── core/gambling.js
                └── cupGame(senderJid, amount, choice, economy) (L2251)
                    └── beginGamblingRound(user)
                    └── Math.floor(Math.random() * 3) + 1 (1-3 cup draw)
                    └── maybeForceLoss(ctx)
                    └── user.wallet = user.wallet - amount + winnings
                    └── economy.saveUser(senderJid)
                    └── reply visual cups layout / result to WhatsApp
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
* **Line Numbers**: 15785-15814
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.cupGame`

```javascript
if (primaryCmd === "cups") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const choice = cmdArgs[2] || "";
  const result = gambling.cupGame(senderJid, betAmount, choice, economy);
  return await reply(result.message);
}
```

#### Explanation
- Routes execution to `gambling.cupGame` with the parsed choice cup number.

---

### Step 4: Cups Logic
* **File Path**: `core/gambling.js`
* **Line Numbers**: 2251-2327
* **Called From**: `core/engine.js`
* **Inputs**: `(userId, amount, choice, economyModule)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function cupGame(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  const cup = parseInt(choice);
  if (isNaN(cup) || cup < 1 || cup > 3) return { success: false, message: "❌ Choose cup 1, 2, or 3!" };

  const ctx = beginGamblingRound(user);
  const ball = Math.floor(Math.random() * 3) + 1; // ball position
  const won = cup === ball && !maybeForceLoss(ctx);

  const rawPayout = amount * 4;
  const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(rawPayout, ctx)) : 0;
  
  user.wallet = user.wallet - amount + winnings;

  economyModule.saveUser(userId);
}
```

#### Explanation
- Asserts that the choice is between 1, 2, or 3.
- Rolls a position index from 1 to 3 representing the ball.
- Evaluates winning matches (and forces losses if limits are hit).
- Deducts wagers, awards payouts, updates stats, and writes back to MongoDB.

---

## 5. How to Modify
To adjust Cups payout multipliers or count:
- Edit the payout multiplier in `core/gambling.js` (around line 2270):
  ```javascript
  const rawPayout = amount * 3; // Reduced payout to 3x (breaks even with odds)
  ```
- Change the cups count limit (e.g. 4 cups):
  ```javascript
  if (isNaN(cup) || cup < 1 || cup > 4) { ... } // Adjust range
  const ball = Math.floor(Math.random() * 4) + 1; // Adjust rolls
  ```
Prefixes, limits, and house edges can be customized directly in the same block.










---










# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

---

### Concept 1: Event Listeners (Triggering Actions)

In programming, we often want our code to wait for something to happen (like a user sending a message) and then run a specific action. This is called an **Event Listener**.

#### General Example:
```javascript
// Waiting for someone to click a button
button.on("click", () => {
  console.log("Button was clicked!");
});
```

#### In Our Code:
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // Code to handle incoming messages...
});
```
* **How it works here**: The variable `sock` represents the connection to WhatsApp. We tell it to listen for the event `"messages.upsert"` (which means a new message has arrived). When that happens, it runs the code block we provided.
* **Why it's used**: This ensures our bot is reactive. It sits quietly and only runs code when someone actually sends a message.
* **If you change/remove it**: If you delete or misspell `"messages.upsert"`, the bot will completely ignore all incoming messages and will not respond to any commands.

---

### Concept 2: Asynchronous Programming (`async` and `await`)

By default, programs run sequentially (line-by-line). If one line takes a long time (like looking up information in a database or fetching data from the web), the whole program freezes. Asynchronous programming tells the program: *"Start this task, and while you wait, you can do other things."*
* `async` is a keyword placed before a function to show it will perform asynchronous tasks.
* `await` is used inside that function to pause and wait for a specific task to finish before moving to the next line.

#### General Example:
```javascript
async function makeBreakfast() {
  console.log("Boiling water...");
  await boilWater(); // Pause here until water is boiled
  console.log("Water is ready, making tea!");
}
```

#### In Our Code:
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  ...
  await Promise.all(
    messages.map(async (m) => {
      ...
```
* **How it works here**: The function is marked `async` because finding users and updating wagers requires talking to our database (which takes time). We use `await` with `Promise.all` to make sure we wait for all messages in a batch to finish processing.
* **Why it's used**: It keeps the bot highly responsive. While the database is saving one player's wager, the bot can still receive other messages.
* **If you change/remove it**: If you remove `async` or `await`, JavaScript will try to run the next line of code before the database operations finish, causing empty balances, broken games, and crashes.

---

### Concept 3: Destructuring (Unpacking Data)

Often, data is passed around inside "Objects" (which are collections of properties, like a profile card containing a name, age, and location). Instead of writing long lines to extract each property, we can unpack them directly into variables.

#### General Example:
```javascript
const person = { name: "Mellow", age: 25 };

// Without destructuring:
const name = person.name;
const age = person.age;

// With destructuring (much cleaner!):
const { name, age } = person;
```

#### In Our Code:
```javascript
async ({ messages, type }) => {
```
* **How it works here**: When WhatsApp notifies the bot about a message event, it sends a large object. Instead of taking the whole object and typing `event.messages` and `event.type`, we directly extract `messages` and `type` inside the function's arguments.
* **Why it's used**: It keeps the code clean, readable, and short.
* **If you change/remove it**: If you remove the curly braces, the bot will treat the argument as a single object (e.g. `event`), and you'll get errors unless you rewrite all references to use `event.messages` and `event.type`.

---

### Concept 4: Comparison (`!==`) and Logical AND (`&&`)

We use operators to compare values and combine decisions.
* `!==` checks if two things are **not equal**.
* `&&` (AND) ensures that **both** conditions on the left and right must be true for the whole decision to be true.

#### General Example:
```javascript
const isSunny = true;
const temperature = 90;

if (isSunny && temperature > 80) {
  console.log("It's a hot, sunny day!");
}
```

#### In Our Code:
```javascript
if (type !== "notify" && type !== "append") return;
```
* **How it works here**: We check if the incoming message event type is *not* `"notify"` AND is *not* `"append"`. If it's something else (like someone editing a message or a status indicator), we ignore it.
* **Why it's used**: Filters out background noise so the bot doesn't waste energy processing non-message updates.
* **If you change/remove it**: Changing this would make the bot trigger on random actions (like when a friend starts typing), resulting in crashes and spam.

---

### Concept 5: Early Return (`return`)

Normally, a function runs until it hits the bottom. A `return` statement immediately stops the function and exits. When we use it to exit early when something is invalid, it is called an "early return".

#### General Example:
```javascript
function enterClub(age) {
  if (age < 18) {
    console.log("Too young!");
    return; // Stop the function here!
  }
  console.log("Welcome inside!");
}
```

#### In Our Code:
```javascript
if (isRekeying) return;
```
* **How it works here**: If the bot is currently refreshing its connection keys (`isRekeying` is true), we stop immediately and exit.
* **Why it's used**: It prevents the bot from attempting to process messages when it is in an unstable state. It also avoids wrapping the rest of our code in giant, messy `if/else` structures.
* **If you change/remove it**: The bot would try to process messages while rekeying, leading to decryption errors or connection crashes.

---

### Concept 6: Array Mapping (`map`) and Parallel Execution (`Promise.all`)

An **Array** is a list of items.
* `.map()` takes a list, performs a function on every item in that list, and creates a new list with the results.
* `Promise.all()` takes a list of tasks (promises) and runs them all at the exact same time (in parallel) instead of waiting for one to finish before starting the next.

#### General Example:
```javascript
const numbers = [1, 2, 3];
const doubled = numbers.map(x => x * 2); // Result: [2, 4, 6]
```

#### In Our Code:
```javascript
await Promise.all(
  messages.map(async (m) => {
    if (!m.message) return;
    // process message...
  })
);
```
* **How it works here**: When multiple messages arrive at once, we map each message to an asynchronous processing task. Then, `Promise.all` executes all of those tasks simultaneously.
* **Why it's used**: High performance. If ten people message the bot at once, it processes all ten messages in parallel rather than queueing them up.
* **If you change/remove it**: If you process them one-by-one, the bot would become extremely slow and laggy under heavy chat volume.

---

### Concept 7: String Manipulation (`startsWith`, `substring`, `trim`, `split`)

Strings are just text values. JavaScript provides tools to inspect and change text.
* `startsWith(text)`: Checks if text starts with a specific word/character.
* `substring(index)`: Cuts off the beginning of the text up to `index`.
* `trim()`: Shaves off accidental empty spaces at the start and end of the text.
* `split(separator)`: Chops a single string into a list of strings wherever the separator is found.

#### General Example:
```javascript
const message = "  .hello world  ";
const clean = message.trim(); // ".hello world"
const words = clean.split(" "); // [".hello", "world"]
```

#### In Our Code:
```javascript
if (lowerTxt.startsWith(currentPrefix)) {
  const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
  const cmdArgs = cmdBody.split(" ");
  const primaryCmd = cmdArgs[0];
```
* **How it works here**:
  1. We check if the player's message starts with our command prefix (like `.`).
  2. We slice off the prefix (leaving just `cups 1000 2`).
  3. We remove any leading or trailing spaces.
  4. We split the string by spaces, giving us `["cups", "1000", "2"]`.
  5. The first item in that list (`cmdArgs[0]`) is our command name: `"cups"`.
* **Why it's used**: Computer programs cannot read raw human sentences directly. We must parse the sentence into a structured format so the bot knows what command is being requested and what arguments were passed.
* **If you change/remove it**: The bot won't be able to separate the command prefix, name, or arguments. For example, typing `.cups 100` might do nothing because it can't tell where the command ends and the wager begins.

---

### Concept 8: Variables (`const` vs `let`)

Variables are containers for storing information.
* `const` (constant) means the variable's value cannot be changed once it is set.
* `let` allows you to reassign the variable to a new value later.

#### General Example:
```javascript
const eyeColor = "brown"; // This cannot change!
let age = 20;
age = 21; // This is allowed!
```

#### In Our Code:
```javascript
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
```
* **How it works here**: We store the text after the prefix in `cmdBody` using `const` because the command body should remain unchanged throughout the execution of this message.
* **Why it's used**: Using `const` is a safety best-practice. It guarantees that our code won't accidentally overwrite crucial data later in the file.
* **If you change/remove it**: If you change it to `let`, the code functions the same but loses safety checks. If you remove it, the computer won't remember what the command body was.

---

### Concept 9: Number Parsing (`parseInt` and `isNaN`)

When a user types something, the bot reads it as **text (a string)**, not a number. Even if they type `1000`, Javascript sees it as `"1000"`.
* `parseInt(text, 10)` translates a string of text into a real mathematical number (base 10).
* `isNaN(value)` stands for "is Not-a-Number". It checks if a value failed to parse into a valid number (for instance, trying to turn `"hello"` into a number).

#### General Example:
```javascript
const textPrice = "50";
const realPrice = parseInt(textPrice, 10); // Now it's the number 50
const badValue = parseInt("apple", 10); // This results in NaN

console.log(isNaN(badValue)); // True!
```

#### In Our Code:
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
...
if (isNaN(cup) || cup < 1 || cup > 3) ...
```
* **How it works here**: We take the player's wager argument (like `"1000"`) and convert it to the number `1000`. In the cups game, we parse the cup choice (`"2"`) to the number `2` and check if it's a valid choice between 1 and 3.
* **Why it's used**: You cannot perform mathematical operations or compare balances using text strings. For example, in text, `"2" > "10"` is true because it sorts alphabetically, but as numbers, `2 > 10` is false.
* **If you change/remove it**: Players could type text like `"abc"` as their wager or choice, causing math errors, server crashes, or infinite money exploits.

---

### Concept 10: Logical OR for Fallbacks (`||`)

We can use the `||` operator to specify a default value if the first value doesn't exist (is "falsy", like `undefined` or an empty string).

#### General Example:
```javascript
const chosenUsername = "";
const username = chosenUsername || "Guest"; // Defaults to "Guest"
```

#### In Our Code:
```javascript
const choice = cmdArgs[2] || "";
```
* **How it works here**: If the player forgot to type a choice (e.g. they typed `.j cups 1000` instead of `.j cups 1000 2`), the variable `choice` will default to an empty string `""` instead of breaking.
* **Why it's used**: Prevents the bot from crashing when users don't provide all the optional or required command arguments.
* **If you change/remove it**: The bot would pass `undefined` to the game logic, causing errors like `Cannot read property of undefined` and crashing the session.

---

### Concept 11: Randomization (`Math.random` and `Math.floor`)

To make games of chance work, we need a way to generate random outcomes.
* `Math.random()` generates a random decimal number between `0` (inclusive) and `1` (exclusive), like `0.5829...`
* `Math.floor(number)` rounds any decimal number down to the nearest whole integer.

#### General Example:
```javascript
// Rolling a 6-sided die
const roll = Math.floor(Math.random() * 6) + 1; // Generates 1 to 6
```

#### In Our Code:
```javascript
const ball = Math.floor(Math.random() * 3) + 1; // ball position
```
* **How it works here**:
  1. `Math.random() * 3` gives a decimal between `0` and `2.999...`
  2. `Math.floor(...)` rounds it down to `0`, `1`, or `2`.
  3. Adding `1` shifts the range to `1`, `2`, or `3`.
  This represents which cup (1, 2, or 3) contains the ball.
* **Why it's used**: It ensures the ball location is completely unpredictable and fair for each round.
* **If you change/remove it**: If you hardcode this value (e.g. `const ball = 2;`), the ball will always be under cup 2, allowing players to win every single game.

---

### Concept 12: Ternary Operator (Shortcut `if-else`)

The ternary operator is a quick, one-line way to choose between two values based on a condition.
* Syntax: `condition ? value_if_true : value_if_false`

#### General Example:
```javascript
const score = 85;
const result = score >= 50 ? "Pass" : "Fail";
```

#### In Our Code:
```javascript
const winnings = won ? capPayoutByDailyLimit(user, applyEdgeToAmount(rawPayout, ctx)) : 0;
```
* **How it works here**: If `won` is true, we calculate their payout based on limits and edge settings. If `won` is false, they win `0`.
* **Why it's used**: Keeps simple decision assignments compact and clean without needing a full 5-line `if-else` statement.
* **If you change/remove it**: You would have to rewrite it using standard `if` and `else` blocks. The functionality remains the same, but the code becomes longer and more cluttered.

---

### Concept 13: Database Persistence (Saving State)

When we change values in memory (like modifying `user.wallet`), those changes only exist in the server's temporary RAM. If the server restarts or reloads, those changes are lost. We must write the changes back to our database (MongoDB) to save them forever.

#### General Example:
```javascript
user.name = "New Name";
await database.save(user); // Now saved to the disk!
```

#### In Our Code:
```javascript
user.wallet = user.wallet - amount + winnings;
economyModule.saveUser(userId);
```
* **How it works here**: After we calculate the new balance by subtracting the bet and adding any winnings, we call `economyModule.saveUser(userId)` to write this update back to the database.
* **Why it's used**: Ensures that players' balances are saved permanently, so they don't lose their winnings (or get their lost money back) when the bot restarts.
* **If you change/remove it**: If you don't save the user, their balance will revert back to their original database balance the next time a command is run, leading to bugs and infinite money exploits.

