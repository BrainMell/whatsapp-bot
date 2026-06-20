# Register Command Flow (`register`)

## 1. Description
The Register command allows users to join the economy and RPG systems of the bot. It creates a default user document, assigns a random starter class, awards a starting balance, and schedules a database write to MongoDB.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j register [nickname]"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " register")) (L14397)
            └── core/rpg/economy.js
                └── registerUser(senderJid, nickname) (L110)
                    └── resolveJidHelper(userId) (L93)
                        └── core/utils/lidResolver.js -> resolveJid(userId)
                    └── isRegistered(resolvedId) (L104)
                    └── core/rpg/classSystem.js -> getRandomStarterClass()
                    └── STARTING_BALANCE initialization
                    └── logTransaction(resolvedId, "Registration Bonus", STARTING_BALANCE, user.wallet) (L240)
                    └── scheduleSave(resolvedId) (L29)
                        └── saveUser(resolvedId) (L76)
                            └── MongoDB: User.findOneAndUpdate() (L81)
            └── core/engine.js
                └── updateUserProfile(senderJid, { nickname }) (L14438)
                └── sock.sendMessage(chatId, { text: result.message }) (L14441)
                └── awardProgression(senderJid, chatId) (L14444)
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

### Step 2: Command Matching and Extracting Parameters
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14397-L14433)
* **Line Numbers**: 14397-14433
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: `nickname` string

```javascript
                  // ${botConfig.getPrefix().toLowerCase()} register [nickname] - Create economy account
                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} register`,
                    )
                  ) {
                    let nickname = txt
                      .substring(
                        `${botConfig.getPrefix().toLowerCase()} register`
                          .length,
                      )
                      .trim();

                    // Use WhatsApp display name if no nickname provided
                    if (!nickname) {
                      nickname =
                        m.pushName ||
                        `User_${senderJid.split("@")[0].slice(-4)}`;
                    }

                    if (nickname.length < 2) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Nickname must be at least 2 characters!`,
                      });
                      return;
                    }

                    if (nickname.length > 20) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          "❌ Nickname too long! Max 20 characters.",
                      });
                      return;
                    }
```

#### Explanation
- Compares the message to the prefix + `register` command.
- Extracts `nickname` by removing the command name prefix. If no nickname is typed by the user, uses the WhatsApp profile display name (`m.pushName`) or generates a fallback like `User_1234`.
- Validates the nickname length is between 2 and 20 characters.

---

### Step 3: Registration Logic, Starter Class Assignment, and Starting Balance
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L110-L236)
* **Line Numbers**: 110-236
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId, nickname)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function registerUser(userId, nickname) {
  const resolvedId = resolveJidHelper(userId);
  if (isRegistered(resolvedId)) {
    return { success: false, message: `❌ *ALREADY REGISTERED*\n\n🎮 You're already in the game, ${nickname}!` };
  }

  // pick a random class for the newbie
  const classSystem = require('./classSystem');
  const starterClass = classSystem.getRandomStarterClass();

  const existingUser = economyData.get(resolvedId);
  const profile = existingUser?.profile || {
    whatsappName: null,
    nickname: nickname,
    notes: [],
    memories: {
      likes: [], dislikes: [], hobbies: [], personal: [], other: []
    },
    stats: {
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      messageCount: 0
    },
    relationships: {}
  };
  profile.nickname = nickname;

  const userData = {
    userId: resolvedId,
    wallet: STARTING_BALANCE,
    bank: 0,
    lastDaily: 0,
    lastRob: 0,
    jailUntil: 0,
    prisonUntil: 0,
    robberyStrikes: 0,
    lastClassChange: 0,
    registered: true,
    nickname: nickname,
    questGold: 0,
    class: starterClass.id,
    adventurerRank: 'F',
    questsCompleted: 0,
    questsWon: 0,
    questsFailed: 0,
    borrowedSkills: [],
    statBonuses: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
    inventory: {},
    equipment: {
        main_hand: null, off_hand: null, armor: null, helmet: null, boots: null, ring: null, amulet: null, cloak: null, gloves: null
    },
    professions: {
        mining: { level: 1, xp: 0 },
        crafting: { level: 1, xp: 0 }
    },
    completedTrials: [],
    portfolio: {},
    investments: [],
    membership: { tier: 'BASIC', expires: 0 },
    gamblingProfile: {
      dayKey: getTodayKey(),
      roundsToday: 0,
      entryWalletToday: STARTING_BALANCE,
      withdrawnToday: 0,
      netToday: 0
    },
    skills: {},
    profile: profile,
    spriteIndex: Math.floor(Math.random() * 100)
  };
  
  economyData.set(resolvedId, userData);
  logTransaction(resolvedId, "Registration Bonus", STARTING_BALANCE, userData.wallet);
  scheduleSave(resolvedId);
```

#### Explanation
1. **LID Resolution**: Converts user JID using the `resolveJidHelper()` and searches the active in-memory cache `economyData` (a Map) to verify if the user has already registered.
2. **Starter Class**: Imports and calls `classSystem.getRandomStarterClass()` to pick a random initial class.
3. **User Document Creation**: Prepares a comprehensive `userData` state object with the nickname, `STARTING_BALANCE` (1,000 Zeni), empty inventory, lvl 1 professions, empty stats, and default gambling parameters.
4. **Cache Insertion & Transaction Logging**: Inserts user state into the `economyData` cache, calls `logTransaction(...)` to record the starting bonus history, and calls `scheduleSave(...)` to enqueue the user for database persistence.

---

### Step 4: MongoDB Database Persistence
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L29-L41) & [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L76-L89)
* **Line Numbers**: 29-41 & 76-89
* **Called From**: `scheduleSave()` debouncer timer
* **Inputs**: `userId`
* **Outputs**: None

```javascript
function scheduleSave(userId) {
  pendingSaves.add(userId);
  if (!saveTimer) {
    saveTimer = setTimeout(async () => {
      const toSave = [...pendingSaves];
      pendingSaves.clear();
      saveTimer = null;
      for (const id of toSave) {
        await saveUser(id);
      }
    }, 500); // flush every 500ms
  }
}

async function saveUser(userId) {
    const data = economyData.get(userId);
    if (!data) return;

    try {
        await User.findOneAndUpdate(
            { userId: userId },
            { $set: data },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        console.error(`❌ Failed to save user ${userId}:`, err.message);
    }
}
```

#### Explanation
- `scheduleSave()` implements a debounce mechanism to collect unsaved user JIDs into a Set and execute a batch save every 500 milliseconds.
- `saveUser()` retrieves the in-memory user data from the Map cache, and uses Mongoose `User.findOneAndUpdate` with the `{ upsert: true }` option to overwrite or insert the document in the MongoDB database.

---

### Step 5: Replying to WhatsApp
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14434-L14446)
* **Line Numbers**: 14434-14446
* **Called From**: Command routing block in `engine.js`
* **Inputs**: Registration result object
* **Outputs**: Message sent to WhatsApp group

```javascript
                    const result = economy.registerUser(senderJid, nickname);

                    if (result.success) {
                      // Also update user profile with nickname
                      updateUserProfile(senderJid, { nickname });
                    }

                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                    });
                    await awardProgression(senderJid, chatId);
                    return;
```

#### Explanation
- Evaluates the success of `registerUser()`. If successful, calls `updateUserProfile` to update the global chat profile with the new nickname.
- Emits `sock.sendMessage(chatId, { text: BOT_MARKER + result.message })` to deliver the welcome message, assign stats, and display the lore.
- Calls `awardProgression` to grant XP/points to the registering user.

---

## 4. How to Modify
To adjust the starter configurations or limits:
- **Change Starting Balance**: Modify the value of `STARTING_BALANCE` in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L15):
  ```javascript
  const STARTING_BALANCE = 5000; // Give new players 5,000 Zeni upon registration
  ```
- **Change Registration Lore Text**: Edit the output string inside `registerUser` function in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L218-L234).










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
const resolvedId = resolveJidHelper(userId);
const nickname = txt.substring(`${botConfig.getPrefix().toLowerCase()} register`.length).trim();
```
**How it works here**: Variables are used to store values such as `resolvedId` and `nickname` which are then used in the program.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to write and understand the code.
**If you change/remove it**: If you remove the variable declarations, the program will throw an error because it will not know what `resolvedId` and `nickname` are. If you change the variable names, you will need to update all references to the variable in the code.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
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
**How it works here**: An arrow function is used as an event handler for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and easier to read.
**If you change/remove it**: If you remove the arrow function, the event handler will not be defined, and the program will not respond to the `messages.upsert` event. If you change the arrow function to a traditional function, the code will still work, but it will be less concise.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program, such as a user clicking a button or a message being received.
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
**How it works here**: An event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events that occur in a program, making it interactive and dynamic.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event, and the message will not be processed. If you change the event listener to listen for a different event, the program will respond to the new event instead.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions in a program based on conditions or rules.
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
if (!m.message) return;
```
**How it works here**: Conditional statements are used to check the type of message and the presence of a message, and to return early if the conditions are not met.
**Why it's used**: Conditional statements are used to make decisions in a program, allowing it to respond differently to different situations.
**If you change/remove it**: If you remove the conditional statements, the program will not check the type of message and the presence of a message, and may process messages incorrectly. If you change the conditions, the program will make different decisions based on the new conditions.

---
### Concept 5: Array Methods
Array methods are used to manipulate and interact with arrays, such as mapping, filtering, and reducing.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  }),
);
```
**How it works here**: The `map` method is used to transform each message in the `messages` array into a promise, and `Promise.all` is used to wait for all the promises to resolve.
**Why it's used**: Array methods are used to manipulate and interact with arrays, making it easier to work with collections of data.
**If you change/remove it**: If you remove the array method, the program will not be able to process the messages in the array. If you change the array method to a different one, the program will behave differently.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, such as waiting for a response from a server or a database.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('Hello, world!');
  }, 2000);
});
promise.then((message) => {
  console.log(message); // Outputs: Hello, world!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  }),
);
```
**How it works here**: Promises are used to wait for the messages to be processed, and `await` is used to pause the execution of the code until the promises are resolved.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to write concurrent code.
**If you change/remove it**: If you remove the promises, the program will not be able to wait for the messages to be processed, and may behave incorrectly. If you change the promises to a different asynchronous mechanism, the program will behave differently.

---
### Concept 7: Database Operations
Database operations are used to interact with a database, such as creating, reading, updating, and deleting data.
**General Example**
```javascript
let db = require('db');
db.insert({ name: 'John', age: 25 });
```
**In Our Code**
```javascript
await User.findOneAndUpdate(
  { userId: userId },
  { $set: data },
  { upsert: true, returnDocument: 'after' }
);
```
**How it works here**: Database operations are used to update the user data in the database, and to create a new user if one does not exist.
**Why it's used**: Database operations are used to interact with a database, making it possible to store and retrieve data.
**If you change/remove it**: If you remove the database operations, the program will not be able to store or retrieve data, and will not function correctly. If you change the database operations to a different database or mechanism, the program will behave differently.

---
### Concept 8: Imports
Imports are used to bring in external code or modules into a program, making it possible to reuse code and avoid duplication.
**General Example**
```javascript
let math = require('math');
console.log(math.add(2, 2)); // Outputs: 4
```
**In Our Code**
```javascript
const classSystem = require('./classSystem');
```
**How it works here**: An import is used to bring in the `classSystem` module, making it possible to use its functions and data.
**Why it's used**: Imports are used to bring in external code or modules, making it possible to reuse code and avoid duplication.
**If you change/remove it**: If you remove the import, the program will not be able to use the `classSystem` module, and will throw an error. If you change the import to a different module, the program will behave differently.

---
### Concept 9: Destructuring
Destructuring is used to extract values from an object or array, making it easier to work with complex data structures.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
const { messages, type } = sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: Destructuring is used to extract the `messages` and `type` values from the event object, making it easier to work with the data.
**Why it's used**: Destructuring is used to extract values from complex data structures, making it easier to work with the data.
**If you change/remove it**: If you remove the destructuring, the program will not be able to extract the values, and will throw an error. If you change the destructuring to extract different values, the program will behave differently.

---
### Concept 10: Numbers and Parsing
Numbers and parsing are used to work with numerical data, such as converting strings to numbers or parsing numbers from strings.
**General Example**
```javascript
let num = parseInt('123');
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const STARTING_BALANCE = 5000;
```
**How it works here**: A number is used to define the starting balance, and is used in the program to calculate the user's balance.
**Why it's used**: Numbers and parsing are used to work with numerical data, making it possible to perform calculations and comparisons.
**If you change/remove it**: If you remove the number, the program will not be able to calculate the user's balance, and will throw an error. If you change the number to a different value, the program will behave differently.

---
### Concept 11: Objects and Properties
Objects and properties are used to store and manipulate data, such as creating objects, accessing properties, and updating values.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
person.age = 30;
console.log(person.age); // Outputs: 30
```
**In Our Code**
```javascript
const userData = {
  userId: resolvedId,
  wallet: STARTING_BALANCE,
  bank: 0,
  // ...
};
```
**How it works here**: An object is used to store the user's data, and properties are accessed and updated to calculate the user's balance and other values.
**Why it's used**: Objects and properties are used to store and manipulate data, making it possible to create complex data structures and perform calculations.
**If you change/remove it**: If you remove the object, the program will not be able to store or manipulate the user's data, and will throw an error. If you change the object's properties or values, the program will behave differently.

---
### Concept 12: Functions
Functions are used to encapsulate code and perform tasks, such as calculating values, validating input, and updating data.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function registerUser(userId, nickname) {
  // ...
}
```
**How it works here**: A function is used to register a new user, and performs tasks such as validating input, updating data, and calculating values.
**Why it's used**: Functions are used to encapsulate code and perform tasks, making it possible to reuse code and avoid duplication.
**If you change/remove it**: If you remove the function, the program will not be able to register new users, and will throw an error. If you change the function's code or parameters, the program will behave differently.
