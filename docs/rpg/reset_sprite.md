# Reset Sprite Command Flow (`reset sprite`)

## 1. Description
The `reset sprite` command allows registered RPG players to reroll their randomly assigned character sprite index (which ranges from 0 to 99). This changes the sprite image that appears during active quest adventures.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j reset sprite" or ".j sprite reset"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check (L16483-16488)
            ├── economy.isRegistered(senderJid)
            ├── economy.getUser(senderJid)
            ├── Modify spriteIndex: user.spriteIndex = Math.floor(Math.random() * 100) (L16496)
            ├── economy.saveUser(senderJid) (L16497)
            └── sock.sendMessage(chatId, { text: confirmationMsg }) (L16498)
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
- Receives the message payload from Baileys. Filters out background events.

---

### Step 2: Command Matching and Registration Check
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L16483-L16494)
* **Line Numbers**: 16483-16494
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and sender JID
* **Outputs**: Checks user registration, returns early if unregistered

```javascript
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} reset sprite` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} sprite reset`
                  ) {
                    if (!economy.isRegistered(senderJid)) {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `❌ You need to register first!`,
                      });
                      return;
                    }
```

#### Explanation
- Matches if the user typed `.j reset sprite` or `.j sprite reset`.
- Checks if the user is registered in the bot's system using `economy.isRegistered()`. If not, replies with a registration error and exits.

---

### Step 3: Rerolling Sprite Index & Saving
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L16495-L16504)
* **Line Numbers**: 16495-16504
* **Called From**: Command execution branch in `engine.js`
* **Inputs**: User JID
* **Outputs**: Rerolls `spriteIndex` integer, saves user document, sends WhatsApp reply

```javascript
                    const user = economy.getUser(senderJid);
                    user.spriteIndex = Math.floor(Math.random() * 100);
                    economy.saveUser(senderJid);
                    await sock.sendMessage(chatId, {
                      text:
                        BOT_MARKER +
                        `✅ *SPRITE RESET!* Your assigned sprite has been rerolled. It will appear in your next adventure!`,
                    });
                    return;
                  }
```

#### Explanation
1. Retrieves the active cached user document from the economy memory Map (`economy.getUser()`).
2. Rerolls the user's `spriteIndex` property to a new random integer between 0 and 99.
3. Invokes `economy.saveUser()` to schedule a database write sync back to MongoDB.
4. Sends a message notifying the player that their sprite has been successfully rerolled.

---

## 4. How to Modify
- **Change Sprite Count / Range**: The sprite index bounds can be modified by changing the multiplier `100` in the math equation at [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L16496).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They have a name, and you can assign a value to them.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const user = economy.getUser(senderJid);
```
**How it works here**: The `user` variable is used to store the result of the `economy.getUser(senderJid)` function, which retrieves a user's data from the economy system.
**Why it's used**: Variables are used to store and reuse values in the program, making the code more efficient and easier to read.
**If you change/remove it**: If you remove the `user` variable, you would not be able to access the user's data, and the code would throw an error when trying to access `user.spriteIndex`.

### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
let greet = (name) => {
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
**How it works here**: The arrow function is used as an event listener for the `messages.upsert` event. It takes an object with `messages` and `type` properties as an argument.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and easier to read.
**If you change/remove it**: If you remove the arrow function, the event listener would not be defined, and the code would not respond to the `messages.upsert` event.

### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are used to respond to user interactions, network requests, or other events.
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
**How it works here**: The event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events and update the program's state accordingly.
**If you change/remove it**: If you remove the event listener, the program would not respond to the `messages.upsert` event, and the code would not update the user's data.

### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions.
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
**How it works here**: The conditional statement is used to check if the `type` is either "notify" or "append". If it's not, the function returns immediately.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on conditions.
**If you change/remove it**: If you remove the conditional statement, the function would not check the `type` and would execute the code regardless of the `type` value.

### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubledNumbers = numbers.map((num) => num * 2);
console.log(doubledNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` method is used to transform the `messages` array into an array of promises, which are then awaited using `Promise.all`.
**Why it's used**: Array methods are used to manipulate and transform arrays, making it easier to work with data.
**If you change/remove it**: If you remove the `map` method, the code would not transform the `messages` array, and the `Promise.all` would not work as expected.

### Concept 6: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Result!');
});
promise.then((result) => {
  console.log(result); // Outputs: Result!
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
**How it works here**: The `Promise.all` is used to await an array of promises, which are created using the `map` method.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to write asynchronous code.
**If you change/remove it**: If you remove the `Promise.all`, the code would not wait for the promises to resolve, and the program would continue executing without waiting for the results.

### Concept 7: Destructuring
Destructuring is a way to extract values from objects or arrays and assign them to variables.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The destructuring is used to extract the `messages` and `type` values from the object passed to the event listener.
**Why it's used**: Destructuring is used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the destructuring, you would have to access the values using the object's properties, such as `obj.messages` and `obj.type`.

### Concept 8: Database Operations
Database operations are used to interact with a database, such as retrieving or updating data.
**General Example**
```javascript
let db = {
  users: [
    { id: 1, name: 'John' },
    { id: 2, name: 'Jane' },
  ],
};
let user = db.users.find((user) => user.id === 1);
console.log(user); // Outputs: { id: 1, name: 'John' }
```
**In Our Code**
```javascript
const user = economy.getUser(senderJid);
user.spriteIndex = Math.floor(Math.random() * 100);
economy.saveUser(senderJid);
```
**How it works here**: The database operations are used to retrieve a user's data, update the `spriteIndex` value, and save the updated data.
**Why it's used**: Database operations are used to interact with a database, making it possible to store and retrieve data.
**If you change/remove it**: If you remove the database operations, the program would not be able to store or retrieve data, and the user's data would not be updated.

---
### Concept 9: Math Operations
Math operations are used to perform mathematical calculations, such as generating random numbers.
**General Example**
```javascript
let randomNum = Math.floor(Math.random() * 100);
console.log(randomNum); // Outputs: a random number between 0 and 99
```
**In Our Code**
```javascript
user.spriteIndex = Math.floor(Math.random() * 100);
```
**How it works here**: The math operation is used to generate a random number between 0 and 99 and assign it to the `spriteIndex` value.
**Why it's used**: Math operations are used to perform mathematical calculations, making it possible to generate random numbers or perform other calculations.
**If you change/remove it**: If you remove the math operation, the `spriteIndex` value would not be updated with a random number, and the program would not work as expected.

---
### Concept 10: String Comparison
String comparison is used to compare two strings and determine if they are equal or not.
**General Example**
```javascript
let str1 = 'hello';
let str2 = 'hello';
if (str1 === str2) {
  console.log('The strings are equal!');
}
```
**In Our Code**
```javascript
if (
  lowerTxt ===
    `${botConfig.getPrefix().toLowerCase()} reset sprite` ||
  lowerTxt ===
    `${botConfig.getPrefix().toLowerCase()} sprite reset`
) {
  // ...
}
```
**How it works here**: The string comparison is used to check if the `lowerTxt` string matches one of the two possible commands.
**Why it's used**: String comparison is used to compare two strings and determine if they are equal or not, making it possible to implement command handling.
**If you change/remove it**: If you remove the string comparison, the program would not be able to determine if the `lowerTxt` string matches one of the commands, and the command handling would not work as expected.

---

## 5. Reference Manual

> All sprite ranges, commands, and requirements below are extracted directly from `core/engine.js`. A contributor should never need to look up those files to understand sprite reset limits or execution.

### 5.1 Sprite Reroll Rules & Constraints
* **Commands Supported**: `.j reset sprite` or `.j sprite reset`
* **Registration Constraint**: Player JID must be registered using `.j register` before rerolling.
* **Cost**: 0 Zeni (rerolling is completely free and has no cooldown).
* **Sprite Index Range**: `0` to `99` (exactly 100 possible sprite configurations).
* **Formula**: `user.spriteIndex = Math.floor(Math.random() * 100)`
* **Application**: The rerolled sprite will automatically display on the combat board during their next dungeon quest or duel.
