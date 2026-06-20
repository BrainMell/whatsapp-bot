# Rich Command Flow (`rich`, `richest`, `lb money`)

## 1. Description
The Rich command (aliased as `richest` and `lb money`) queries user data, calculates total wealth (wallet + bank), sorts users in descending order, and displays the top 10 richest registered users in the chat.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j rich" or ".j richest" or ".j lb money"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "rich" || "richest" || "lb money") (L14875)
            └── core/rpg/economy.js
                └── getMoneyLeaderboard(10) (L1111)
                    └── Read economyData (in-memory Map cache)
                    └── Filter registered players
                    └── Map total wealth: (wallet + bank)
                    └── Sort array in descending order
                    └── Slice top 10 users
            └── Formatting: Map entries to text list with rankings and emojis (🥇, 🥈, 🥉)
            └── Resolve JID mentions to notify/tag ranked players
            └── sock.sendMessage(chatId, { text: text, mentions: mentions }) (L14926)
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14875-L14882)
* **Line Numbers**: 14875-14882
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Routes execution to the leaderboard block

```javascript
                  // rich - Show richest users (top 10)
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} rich` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} richest` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} lb money`
                  ) {
```

#### Explanation
- Detects the `.j rich`, `.j richest`, or `.j lb money` commands.

---

### Step 3: Fetch Leaderboard Data
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L1111-L1123)
* **Line Numbers**: 1111-1123
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(limit = 10)`
* **Outputs**: Sorted array of objects `{ userId, nickname, wallet, bank, total }`

```javascript
function getMoneyLeaderboard(limit = 10) {
  return Array.from(economyData.entries())
    .filter(([_, data]) => data.registered)
    .map(([userId, data]) => ({
      userId,
      nickname: data.nickname || userId.split('@')[0],
      wallet: data.wallet || 0,
      bank: data.bank || 0,
      total: (data.wallet || 0) + (data.bank || 0)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
```

#### Explanation
- Reads all elements from the `economyData` Map.
- Filters out non-registered users.
- Maps user entries to objects containing JID, nickname, wallet, bank, and calculated total wealth.
- Sorts the array in descending order based on `total` wealth.
- Slices the array to return only the top 10 richest players.

---

### Step 4: Formatting and Mention Processing
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14883-L14937)
* **Line Numbers**: 14883-14937
* **Called From**: `engine.js`
* **Inputs**: Sorted leaderboard array
* **Outputs**: Text payload and JID mentions array

```javascript
                      let text =
                        BOT_MARKER +
                        `╔═══════════════════╗
   💰 RICHEST USERS 💰
 ╚═══════════════════╝

 📊 Top ${leaderboard.length} by Total Wealth

 ━━━━━━━━━━━━━━━━━━
`;

                      const mentions = [];

                      leaderboard.forEach((user, i) => {
                        const medal =
                          i === 0
                            ? `🥇`
                            : i === 1
                              ? "🥈"
                              : i === 2
                                ? "🥉"
                                : `${i + 1}.`;
                        const nickname =
                          user.nickname || user.userId.split("@")[0];

                        text += `${medal} @${user.userId.split("@")[0]}\n`;
                        text += `   💎 ${economy.getZENI()}${user.total.toLocaleString()}\n`;
                        text += `   💵 Wallet: ${economy.getZENI()}${user.total - (user.bank || 0) >= 0 ? (user.total - (user.bank || 0)).toLocaleString() : "0"}\n`;
                        text += `━━━━━━━━━━━━━━━━━━\n`;

                        mentions.push(user.userId);
                      });

                      await sock.sendMessage(chatId, {
                        text: text,
                        mentions: mentions,
                      });
```

#### Explanation
- Constructs a formatted text layout with medal icons for ranks 1, 2, and 3.
- Resolves each player's username mention using their JID.
- Collects all displayed player JIDs into `mentions` so they are correctly linked/highlighted on WhatsApp.
- Sends the leaderboard list in a single text message.

---

## 4. How to Modify
To adjust leaderboard display capacity:
- **Change Limit Size**: Modify the argument passed to `getMoneyLeaderboard()` in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14884):
  ```javascript
  const leaderboard = economy.getMoneyLeaderboard(20); // Display top 20 users
  ```
- **Sort by Wallet Only**: To sort the ranking list solely based on active wallet cash instead of total wealth, change the sort mapping in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L1121):
  ```javascript
  .sort((a, b) => b.wallet - a.wallet)
  ```

---

## 5. Gambling Leaderboard (`gamblers` / `lb gamble`)
The **`gamblers`** command (also triggered via `.j leaderboard gamble` or `.j lb gamble`) renders the Top 10 Gamblers leaderboard.
* **Under the Hood**: It queries the economy cache via `economy.getGamblingLeaderboard(10)`. It calculates each user's win rate using `(gamesWon / (gamesWon + gamesLost)) * 100` and displays their net earnings.
* **How to Modify**: To change the sorting rules or limit, locate the matching block in `core/engine.js` at line 15846. You can increase the query limit from `10` to `20` or sort by total bets placed.










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
let text = BOT_MARKER + `╔═══════════════════╗...`;
let leaderboard = economy.getMoneyLeaderboard(20);
```
**How it works here**: Variables are used to store the text to be sent as a message and the leaderboard data.
**Why it's used**: Variables are used to store values that need to be used multiple times in the program, making the code more efficient and easier to read.
**If you change/remove it**: If you remove the variable declarations, the code will throw an error because the variables are being used later in the program. If you change the variable names, you need to update all the places where the variable is used.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
let greet = (name) => console.log(`Hello, ${name}!`);
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An arrow function is used as an event listener for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as event listeners or callbacks.
**If you change/remove it**: If you remove the arrow function, the event listener will not be defined, and the code will not respond to the `messages.upsert` event. If you change the arrow function syntax, the code may throw an error.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are used to respond to user interactions or other events in the program.
**General Example**
```javascript
document.addEventListener('click', () => console.log('Clicked!'));
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An event listener is used to respond to the `messages.upsert` event.
**Why it's used**: Event listeners are used to respond to user interactions or other events in the program, making the program more interactive and dynamic.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event. If you change the event listener, the program may respond differently to the event.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions in the program based on certain conditions. They are defined using the `if` or `switch` keywords.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult.');
} else {
  console.log('You are a minor.');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} rich`) {
  // ...
}
```
**How it works here**: Conditional statements are used to make decisions based on the `type` and `lowerTxt` variables.
**Why it's used**: Conditional statements are used to make decisions in the program, allowing it to respond differently to different conditions.
**If you change/remove it**: If you remove the conditional statements, the program may not respond correctly to different conditions. If you change the conditional statements, the program may make different decisions.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays. They are defined using the `map()`, `filter()`, `sort()`, and other methods.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
return Array.from(economyData.entries())
  .filter(([_, data]) => data.registered)
  .map(([userId, data]) => ({
    userId,
    nickname: data.nickname || userId.split('@')[0],
    wallet: data.wallet || 0,
    bank: data.bank || 0,
    total: (data.wallet || 0) + (data.bank || 0)
  }))
  .sort((a, b) => b.total - a.total)
  .slice(0, limit);
```
**How it works here**: Array methods are used to transform the `economyData` array into a leaderboard array.
**Why it's used**: Array methods are used to manipulate and transform arrays, making it easier to work with data in the program.
**If you change/remove it**: If you remove the array methods, the program will not be able to transform the `economyData` array into a leaderboard array. If you change the array methods, the program may produce different results.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations in the program. They are defined using the `Promise` constructor or the `async/await` syntax.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  setTimeout(() => resolve('Hello, World!'), 2000);
});
promise.then((message) => console.log(message)); // Outputs: Hello, World!
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: Promises are used to handle the asynchronous operations of sending messages.
**Why it's used**: Promises are used to handle asynchronous operations in the program, making it easier to write asynchronous code.
**If you change/remove it**: If you remove the promises, the program may not be able to handle asynchronous operations correctly. If you change the promises, the program may produce different results.

---
### Concept 7: Destructuring
Destructuring is used to extract values from arrays or objects and assign them to variables. It is defined using the `{}` or `[]` syntax.
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
**How it works here**: Destructuring is used to extract the `messages` and `type` values from the event object.
**Why it's used**: Destructuring is used to extract values from arrays or objects and assign them to variables, making the code more concise and easier to read.
**If you change/remove it**: If you remove the destructuring, the code will not be able to extract the `messages` and `type` values from the event object. If you change the destructuring, the code may not be able to extract the correct values.

---
### Concept 8: Template Literals
Template literals are used to create strings that can contain expressions. They are defined using the `` ` `` syntax.
**General Example**
```javascript
let name = 'John';
let age = 25;
let sentence = `My name is ${name} and I am ${age} years old.`;
console.log(sentence); // Outputs: My name is John and I am 25 years old.
```
**In Our Code**
```javascript
let text = BOT_MARKER + `╔═══════════════════╗...`;
```
**How it works here**: Template literals are used to create a string that contains the `BOT_MARKER` value.
**Why it's used**: Template literals are used to create strings that can contain expressions, making it easier to create dynamic strings.
**If you change/remove it**: If you remove the template literals, the code will not be able to create a string that contains the `BOT_MARKER` value. If you change the template literals, the code may produce different results.

---
### Concept 9: Async/Await
Async/await is used to write asynchronous code that is easier to read and maintain. It is defined using the `async` and `await` keywords.
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
  // ...
});
```
**How it works here**: Async/await is used to write asynchronous code that handles the `messages.upsert` event.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain, making it easier to handle complex asynchronous operations.
**If you change/remove it**: If you remove the async/await, the code will not be able to handle asynchronous operations correctly. If you change the async/await, the code may produce different results.

---
### Concept 10: Sorting
Sorting is used to arrange elements in an array in a specific order. It is defined using the `sort()` method.
**General Example**
```javascript
let numbers = [4, 2, 7, 1, 3];
numbers.sort((a, b) => a - b);
console.log(numbers); // Outputs: [1, 2, 3, 4, 7]
```
**In Our Code**
```javascript
.sort((a, b) => b.total - a.total)
```
**How it works here**: Sorting is used to arrange the leaderboard array in descending order based on the `total` value.
**Why it's used**: Sorting is used to arrange elements in an array in a specific order, making it easier to display data in a meaningful way.
**If you change/remove it**: If you remove the sorting, the leaderboard array will not be in the correct order. If you change the sorting, the leaderboard array may be in a different order.

---
### Concept 11: Slicing
Slicing is used to extract a subset of elements from an array. It is defined using the `slice()` method.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let subset = numbers.slice(1, 3);
console.log(subset); // Outputs: [2, 3]
```
**In Our Code**
```javascript
.slice(0, limit)
```
**How it works here**: Slicing is used to extract a subset of elements from the leaderboard array, up to the `limit` value.
**Why it's used**: Slicing is used to extract a subset of elements from an array, making it easier to display a limited amount of data.
**If you change/remove it**: If you remove the slicing, the leaderboard array will not be limited to the `limit` value. If you change the slicing, the leaderboard array may be limited to a different number of elements.

---
### Concept 12: Filtering
Filtering is used to create a new array with only the elements that pass a test. It is defined using the `filter()` method.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let evenNumbers = numbers.filter((num) => num % 2 === 0);
console.log(evenNumbers); // Outputs: [2, 4]
```
**In Our Code**
```javascript
.filter(([_, data]) => data.registered)
```
**How it works here**: Filtering is used to create a new array with only the elements that have a `registered` value of `true`.
**Why it's used**: Filtering is used to create a new array with only the elements that pass a test, making it easier to work with data that meets certain conditions.
**If you change/remove it**: If you remove the filtering, the leaderboard array will not be filtered to only include registered users. If you change the filtering, the leaderboard array may be filtered to include different users.

---
### Concept 13: Mapping
Mapping is used to create a new array with the results of applying a function to each element in the original array. It is defined using the `map()` method.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
.map(([userId, data]) => ({
  userId,
  nickname: data.nickname || userId.split('@')[0],
  wallet: data.wallet || 0,
  bank: data.bank || 0,
  total: (data.wallet || 0) + (data.bank || 0)
}))
```
**How it works here**: Mapping is used to create a new array with the results of applying a function to each element in the original array, transforming the data into a leaderboard format.
**Why it's used**: Mapping is used to create a new array with the results of applying a function to each element in the original array, making it easier to transform data into a different format.
**If you change/remove it**: If you remove the mapping, the leaderboard array will not be transformed into the correct format. If you change the mapping, the leaderboard array may be transformed into a different format.

---
### Concept 14: Entries
Entries is used to get an array of a given object's own enumerable property `[key, value]` pairs. It is defined using the `entries()` method.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let entries = Object.entries(person);
console.log(entries); // Outputs: [["name", "John"], ["age", 25]]
```
**In Our Code**
```javascript
Array.from(economyData.entries())
```
**How it works here**: Entries is used to get an array of the `economyData` object's own enumerable property `[key, value]` pairs.
**Why it's used**: Entries is used to get an array of an object's own enumerable property `[key, value]` pairs, making it easier to work with object data.
**If you change/remove it**: If you remove the entries, the code will not be able to get an array of the `economyData` object's own enumerable property `[key, value]` pairs. If you change the entries, the code may get a different array of property pairs.

---
### Concept 15: Array.from
Array.from is used to create a new array from an array-like object or an iterable. It is defined using the `Array.from()` method.
**General Example**
```javascript
let arrayLike = { 0: 'a', 1: 'b', 2: 'c', length: 3 };
let array = Array.from(arrayLike);
console.log(array); // Outputs: ["a", "b", "c"]
```
**In Our Code**
```javascript
Array.from(economyData.entries())
```
**How it works here**: Array.from is used to create a new array from the `economyData` object's entries.
**Why it's used**: Array.from is used to create a new array from an array-like object or an iterable, making it easier to work with data that is not in an array format.
**If you change/remove it**: If you remove the Array.from, the code will not be able to create a new array from the `economyData` object's entries. If you change the Array.from, the code may create a different array.
