# Fish Command Flow (`fish`)

## 1. Description
The Fish command allows players to go scavenging at the coast for rare fish, junk, and shards. Fishing has a fatigue cooldown limit of 25 casts per hour and includes a 5-second wait timing during which inputs are locked.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j fish"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " fish") (L5467)
            └── Check if user is busy: busyUsers.has(senderJid)
            └── Check registration: economy.isRegistered(senderJid)
            └── Check fatigue: if (user.fishCount >= 25)
                └── Verify 1-hour reset cooldown: now - user.lastFishReset < 1 hour
            └── Set user busy: busyUsers.add(senderJid)
            └── Send cast reaction "🎣" and starting cast message (L5517)
            └── setTimeout (5000ms delay) (L5526)
                └── Increment fishCount: freshUser.fishCount += 1
                └── Calculate luck modifier: freshUser.stats.luck || 5
                └── Roll random number (0-100) + luck/5 (L5539)
                    └── common_fish (roll <= 85)
                    └── rare_fish (85 < roll <= 98)
                    └── mythic_fish (roll > 98)
                └── Roll 5% chance for "infected_fish"
                └── add to inventory: inventorySystem.addItem(senderJid, itemKey, 1)
                └── Calculate sell value based on item base value and rarity multiplier
                └── Send results message to chat
                └── awardProgression(senderJid, chatId)
                └── Remove user busy: busyUsers.delete(senderJid)
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

### Step 2: Command Matching and Cooldown/Fatigue Check
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5466-L5515)
* **Line Numbers**: 5466-5515
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Returns early if player is busy or has reached 25-cast fatigue limit

```javascript
                  // `${botConfig.getPrefix().toLowerCase()}` fish - go fishing
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} fish`
                  ) {
                    if (busyUsers.has(senderJid)) {
                      return await reply('⏳ Still processing your last action...');
                    }
                    busyUsers.add(senderJid);
                    try {
                      if (!economy.isRegistered(senderJid)) {
                        busyUsers.delete(senderJid);
                        return await sock.sendMessage(chatId, {
                          text:
                            BOT_MARKER +
                            "❌ Register first to start scavenging!",
                        });
                      }

                      const user = economy.getUser(senderJid);
                      const now = Date.now();
                      const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour
                      const MAX_FISH = 25;

                      // Check if 1-hour cooldown is active
                      if (user.fishCount >= MAX_FISH) {
                        const timePassed = now - (user.lastFishReset || 0);
                        if (timePassed < COOLDOWN_MS) {
                          const remainingMs = COOLDOWN_MS - timePassed;
                          const hours = Math.floor(
                            remainingMs / (60 * 60 * 1000),
                          );
                          const minutes = Math.floor(
                            (remainingMs % (60 * 60 * 1000)) / (60 * 1000),
                          );
                          busyUsers.delete(senderJid);
                          return await sock.sendMessage(
                            chatId,
                            {
                              text:
                                BOT_MARKER +
                                `🪣 *FISHING FATIGUE*\n\nYou've fished 25 times! Your arms are tired. Please rest for *${hours}h ${minutes}m* before casting again.`,
                            },
                            { quoted: m },
                          );
                        } else {
                          // Cooldown expired, reset count
                          user.fishCount = 0;
                          user.lastFishReset = now;
                        }
                      }
```

#### Explanation
- Confirms the command matches `.j fish`.
- Asserts player registration.
- Asserts that the player has not hit the daily/hourly limit of 25 fishing operations. If they have, computes the remaining wait time until fatigue resets.

---

### Step 3: Cast Event Initialization
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5517-L5525)
* **Line Numbers**: 5517-5525
* **Called From**: `engine.js`
* **Inputs**: Message state
* **Outputs**: Casts line, starts wait timing

```javascript
                      await sock.sendMessage(chatId, {
                        react: { text: "🎣", key: m.key },
                      });
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          "⏳ Casting your line... please wait 5s.",
                      });
```

#### Explanation
- Sends a reaction emoji "🎣" to the player's message.
- Delivers a casting lines notification.

---

### Step 4: 5-Second Delay Resolution and Payout roll
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5526-L5584)
* **Line Numbers**: 5526-5584
* **Called From**: `setTimeout()` block (5000ms)
* **Inputs**: Luck stat
* **Outputs**: Loot item resolved, saved, and delivered

```javascript
                      setTimeout(async () => {
                        try {
                          const freshUser = economy.getUser(senderJid);
                          freshUser.fishCount = (freshUser.fishCount || 0) + 1;
                          if (freshUser.fishCount === 1)
                            freshUser.lastFishReset = Date.now();
                          economy.saveUser(senderJid);

                          const luck = freshUser.stats?.luck || 5;

                          // Rarity Logic
                          let itemKey = "common_fish";
                          let emoji = "🐟";
                          const roll = Math.random() * 100 + luck / 5;

                          if (roll > 98) {
                            itemKey = "mythic_fish";
                            emoji = "🦑";
                          } else if (roll > 85) {
                            itemKey = "rare_fish";
                            emoji = "🐠";
                          }

                          // Infection Check (5%)
                          if (Math.random() < 0.05) {
                            itemKey = "infected_fish";
                            emoji = "☣️";
                          }

                          const item = lootSystem.getItemInfo(itemKey);
                          await inventorySystem.addItem(senderJid, itemKey, 1);
```

#### Explanation
1. Increments user's daily fishing count in memory and schedules database updates.
2. Extracts player's `luck` stat to give a slight boost to rare drop chances.
3. Performs a probability roll (0-100 + luck/5):
   - **Roll > 98**: Mythic Squid (`mythic_fish`).
   - **85 < Roll <= 98**: Rare Tropical Fish (`rare_fish`).
   - **Roll <= 85**: Common Fish (`common_fish`).
   - Checks an independent 5% chance that the catch is an `infected_fish` (representing the priming lore corruption).
4. Inserves the item to the user's inventory database.
5. Calculates the HQ sell value (base value * rarity sell multiplier).
6. Delivers rewards summary to chat and awards progression XP/points.
7. Unregisters user from the busy registry.

---

## 4. How to Modify
To adjust fishing configs:
- **Change cast wait time (default 5s)**: Modify the millisecond duration in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5526):
  ```javascript
  }, 3000); // Reduce cast wait to 3 seconds
  ```
- **Change max cast limit (default 25)**: Edit `MAX_FISH` variable in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5487).
- **Change fish drops details**: Edit properties inside `core/rpg/lootSystem.js` for key IDs `common_fish`, `rare_fish`, `mythic_fish`, `infected_fish`.










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
const user = economy.getUser(senderJid);
const now = Date.now();
```
**How it works here**: Variables are used to store the result of `economy.getUser(senderJid)` and the current time in milliseconds.
**Why it's used**: Variables are used to store values that need to be used later in the program.
**If you change/remove it**: If you remove the variable declarations, the program will throw an error because `user` and `now` will be undefined. If you change the variable names, you will need to update all references to the variables in the code.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
let add = (a, b) => a + b;
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An arrow function is used as the event handler for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as event handlers or callbacks.
**If you change/remove it**: If you remove the arrow function, the event handler will not be defined, and the program will not respond to the `messages.upsert` event. If you change the arrow function to a traditional function, the code will still work, but the syntax will be different.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program, such as a user clicking a button or a message being received.
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
**How it works here**: An event listener is used to respond to the `messages.upsert` event.
**Why it's used**: Event listeners are used to respond to events that occur in a program, allowing the program to react to user input or other events.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event. If you change the event listener to listen for a different event, the program will respond to the new event instead.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions in a program based on conditions or rules.
**General Example**
```javascript
let x = 5;
if (x > 10) {
  console.log('x is greater than 10');
} else {
  console.log('x is less than or equal to 10');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: Conditional statements are used to check the value of `type` and `isRekeying`, and return from the function if the conditions are not met.
**Why it's used**: Conditional statements are used to make decisions in a program based on conditions or rules.
**If you change/remove it**: If you remove the conditional statements, the program will not check the value of `type` and `isRekeying`, and may not behave as expected. If you change the conditions, the program will make different decisions based on the new conditions.

---
### Concept 5: Array Methods
Array methods are used to perform operations on arrays, such as mapping, filtering, or reducing.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(x => x * 2);
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
**How it works here**: The `map` method is used to transform each message in the `messages` array into a promise that resolves when the message is processed.
**Why it's used**: Array methods are used to perform operations on arrays, making it easier to work with collections of data.
**If you change/remove it**: If you remove the `map` method, the program will not process each message in the `messages` array. If you change the `map` method to a different array method, the program will perform a different operation on the array.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, allowing a program to continue executing while waiting for an operation to complete.
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
  })
);
```
**How it works here**: Promises are used to handle the asynchronous operation of processing each message in the `messages` array.
**Why it's used**: Promises are used to handle asynchronous operations, allowing a program to continue executing while waiting for an operation to complete.
**If you change/remove it**: If you remove the promise, the program will not wait for the asynchronous operation to complete, and may not behave as expected. If you change the promise to a different asynchronous handling mechanism, the program will use a different approach to handle the asynchronous operation.

---
### Concept 7: Destructuring
Destructuring is used to extract values from objects or arrays and assign them to variables.
**General Example**
```javascript
let person = { name: 'John', age: 30 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: Destructuring is used to extract the `messages` and `type` values from the object passed to the event handler.
**Why it's used**: Destructuring is used to extract values from objects or arrays and assign them to variables, making it easier to work with complex data structures.
**If you change/remove it**: If you remove the destructuring, the program will not extract the `messages` and `type` values from the object, and will need to access them using a different approach. If you change the destructuring to extract different values, the program will assign different values to the variables.

---
### Concept 8: Numbers and Math Operations
Numbers and math operations are used to perform calculations and manipulate numerical values.
**General Example**
```javascript
let x = 5;
let y = 3;
let result = x + y;
console.log(result); // Outputs: 8
```
**In Our Code**
```javascript
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour
const timePassed = now - (user.lastFishReset || 0);
const remainingMs = COOLDOWN_MS - timePassed;
```
**How it works here**: Numbers and math operations are used to calculate the cooldown time and the remaining time.
**Why it's used**: Numbers and math operations are used to perform calculations and manipulate numerical values, making it possible to implement logic and rules in the program.
**If you change/remove it**: If you remove the numbers and math operations, the program will not be able to calculate the cooldown time and the remaining time, and will not behave as expected. If you change the numbers or math operations, the program will calculate different values, and may behave differently.

---
### Concept 9: String Manipulation
String manipulation is used to work with strings, such as concatenating, splitting, or replacing text.
**General Example**
```javascript
let greeting = 'Hello, ';
let name = 'John';
let message = greeting + name;
console.log(message); // Outputs: Hello, John
```
**In Our Code**
```javascript
let lowerTxt = `${botConfig.getPrefix().toLowerCase()} fish`;
```
**How it works here**: String manipulation is used to concatenate the prefix and the command, and convert the result to lowercase.
**Why it's used**: String manipulation is used to work with strings, making it possible to implement text-based logic and rules in the program.
**If you change/remove it**: If you remove the string manipulation, the program will not be able to concatenate the prefix and the command, and will not behave as expected. If you change the string manipulation, the program will produce different text, and may behave differently.

---
### Concept 10: setTimeout Function
The `setTimeout` function is used to execute a function after a specified amount of time.
**General Example**
```javascript
setTimeout(() => {
  console.log('Hello, world!');
}, 2000);
```
**In Our Code**
```javascript
setTimeout(async () => {
  // ...
}, 3000);
```
**How it works here**: The `setTimeout` function is used to execute a function after 3 seconds, which processes the fishing result.
**Why it's used**: The `setTimeout` function is used to introduce a delay between the fishing action and the result, making the game more realistic.
**If you change/remove it**: If you remove the `setTimeout` function, the program will execute the function immediately, and the game will not have a delay between the fishing action and the result. If you change the delay time, the program will execute the function after a different amount of time.
