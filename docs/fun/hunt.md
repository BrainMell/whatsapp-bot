# Hunt Command Flow (`hunt`)

## 1. Description
The Hunt command allows players to track and capture wilderness animals (Rabbits, Deers, Bears) for items and materials. Unlike fishing, hunting resolves instantly and does not impose a casting delay.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j hunt"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " hunt") (L5587)
            └── Check registration: economy.isRegistered(senderJid) (L5589)
            └── Send reaction "🏹" (L5593)
            └── Roll loot drop chance (weight table):
                └── rabbit_hide (60% weight)
                └── deer_antler (30% weight)
                └── bear_claw (10% weight)
            └── Roll 5% chance for "infected_shard" (L5612)
            └── add to inventory: inventorySystem.addItem(senderJid, itemKey, 1) (L5617)
            └── Calculate sell value based on item base value and rarity multiplier
            └── Send results message to chat (L5626)
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

### Step 2: Command Matching and Registration Check
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5586-L5595)
* **Line Numbers**: 5586-5595
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Returns early if player is unregistered

```javascript
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} hunt`
                  ) {
                    if (!economy.isRegistered(senderJid))
                      return await sock.sendMessage(chatId, {
                        text: BOT_MARKER + "❌ Register first!",
                      });
                    await sock.sendMessage(chatId, {
                      react: { text: "🏹", key: m.key },
                    });
```

#### Explanation
- Captures the `.j hunt` command trigger.
- Verifies registration and sends a confirmation reaction "🏹".

---

### Step 3: Payout Roll and Items Insertion
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5596-L5622)
* **Line Numbers**: 5596-5622
* **Called From**: `engine.js`
* **Imported From**: `core/rpg/inventorySystem` & `core/rpg/lootSystem`
* **Inputs**: Math.random() rolls
* **Outputs**: Loot item resolved, saved, and delivered

```javascript
                    const animals = [
                      { id: "rabbit_hide", emoji: "🐇", weight: 60 },
                      { id: "deer_antler", emoji: "🦌", weight: 30 },
                      { id: "bear_claw", emoji: "🐻", weight: 10 },
                    ];
                    let roll = Math.random() * 100;
                    let selected = animals[0];
                    for (const a of animals) {
                      roll -= a.weight;
                      if (roll <= 0) {
                        selected = a;
                        break;
                      }
                    }
                    let itemKey = selected.id;
                    let emoji = selected.emoji;
                    
                    // Infection Check (5%)
                    if (Math.random() < 0.05) {
                      itemKey = "infected_shard";
                      emoji = "☣️";
                    }
                    const item = lootSystem.getItemInfo(itemKey);
                    await inventorySystem.addItem(senderJid, itemKey, 1);
```

#### Explanation
1. Defines animal drops and their weights (Rabbit: 60%, Deer: 30%, Bear: 10%).
2. Loops through drop tables subtracting weights from a random 0-100 float to find the selected capture.
3. Checks an independent 5% chance that the target was infected and yields an `infected_shard` instead.
4. Adds the resulting item to the user's inventory database.

---

### Step 4: Formatting and Response dispatch
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5623-L5631)
* **Line Numbers**: 5623-5631
* **Called From**: `engine.js`
* **Inputs**: Resolved loot details
* **Outputs**: Dispatches summary to chat thread

```javascript
                    const rarityInfo = inventorySystem.ITEM_RARITY[item.rarity || 'COMMON'] || inventorySystem.ITEM_RARITY.COMMON;
                    const sellMultiplier = rarityInfo.sellMultiplier || 0.6;
                    const sellValue = Math.floor((item.value || 0) * sellMultiplier);

                    let msg =
                      GET_BANNER(`🏹 HUNTING`) +
                      `\n\nCaptured: ${emoji} *${item.name}*\n▫️ Rarity: ${item.rarity}\n▫️ Sell Value: ${ZENI}${sellValue.toLocaleString()}`;
                    return await sock.sendMessage(
                      chatId,
                      { text: msg },
                      { quoted: m },
                    );
```

#### Explanation
- Formats and displays the captured animal, rarity, and sell value.
- Sends the text back to the WhatsApp thread.

---

## 4. How to Modify

### How to Add a New Wild Animal / Hunt Loot
To add a new target animal to the hunting encounter pool:
1. **Define the Pelt/Drop Item**:
   * Open [core/rpg/lootSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js).
   * Register the hide or pelt in `ITEM_DATABASE` under the `// --- HUNTING ---` category:
     ```javascript
     'boar_tusk': { 
         name: '🐗 Boar Tusk', 
         description: 'A sharp tusk from a wild boar.', 
         rarity: 'UNCOMMON', 
         value: 500, 
         type: 'MATERIAL' 
     }
     ```
2. **Add to the Hunting Roll Table**:
   * Open [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js).
   * Locate the `.j hunt` handler block and find the `animals` array definition:
     ```javascript
     const animals = [
       { id: "rabbit_hide", emoji: "🐇", weight: 50 },
       { id: "deer_antler", emoji: "🦌", weight: 30 },
       { id: "bear_claw", emoji: "🐻", weight: 15 },
       { id: "boar_tusk", emoji: "🐗", weight: 25 }, // Add the new animal and roll weight
     ];
     ```
   * **Note on Weights**: The system sums up all animal weights in this local array and generates a random float between `0` and the `totalWeight`. The animal whose weighted range matches the float is selected. Adjust these weights to control creature spawn frequency.

---

### How to Adjust Hunting System Parameters
* **Change Mutation / Infection Rate**: Locate the check in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5612):
  ```javascript
  const isInfected = Math.random() < 0.05; // 5% chance. Change to 0.10 for 10%.
  ```
  This alters the probability that a captured animal is prefixed as corrupted/infected (affecting XP and value multipliers).
* **Add a Fatigue / Cooldown System**: To prevent infinite hunting spam, you can add a user tracking check in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js) inside the `hunt` command block:
  ```javascript
  const freshUser = economy.getUser(senderJid);
  freshUser.huntCount = (freshUser.huntCount || 0) + 1;
  if (freshUser.huntCount > 20) {
      return sock.sendMessage(chatId, { text: "❌ You are too tired to hunt! Rest a while." });
  }
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
const animals = [
  { id: "rabbit_hide", emoji: "🐇", weight: 60 },
  { id: "deer_antler", emoji: "🦌", weight: 30 },
  { id: "bear_claw", emoji: "🐻", weight: 10 },
];
```
**How it works here**: In the code, `animals` is a variable that holds an array of objects, each representing an animal with its id, emoji, and weight.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to manage and modify the code.
**If you change/remove it**: If you remove the `animals` variable, the program will throw an error when trying to access it. If you change its value, the program will use the new value, potentially changing the behavior of the program.

---
### Concept 2: Array Methods
Array methods are used to perform operations on arrays, such as mapping, filtering, and reducing.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(n => n * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    if (!m.message) return;
  })
);
```
**How it works here**: In the code, the `map` method is used to iterate over the `messages` array and perform an asynchronous operation on each message.
**Why it's used**: Array methods are used to simplify array operations and make the code more concise and readable.
**If you change/remove it**: If you remove the `map` method, the program will not iterate over the `messages` array. If you change it to a different method, the program will behave differently.

---
### Concept 3: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions.
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
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: In the code, conditional statements are used to check the `type` and `isRekeying` variables and return early if the conditions are not met.
**Why it's used**: Conditional statements are used to control the flow of the program and make decisions based on conditions.
**If you change/remove it**: If you remove the conditional statements, the program will not check the conditions and may behave unexpectedly. If you change the conditions, the program will make different decisions.

---
### Concept 4: Event Listeners
Event listeners are used to respond to events or actions that occur in the program, such as user input or network requests.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Button clicked');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the code, an event listener is used to respond to the `messages.upsert` event and perform an asynchronous operation.
**Why it's used**: Event listeners are used to respond to events and actions that occur in the program, making it interactive and dynamic.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event. If you change the event or the callback function, the program will behave differently.

---
### Concept 5: Object Destructuring
Object destructuring is used to extract properties from objects and assign them to variables.
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
**How it works here**: In the code, object destructuring is used to extract the `messages` and `type` properties from the event object and assign them to variables.
**Why it's used**: Object destructuring is used to simplify code and make it more readable by extracting properties from objects.
**If you change/remove it**: If you remove the object destructuring, the program will not extract the properties and will throw an error. If you change the properties, the program will extract different properties.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when the operation is complete.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Operation complete');
});
promise.then((result) => {
  console.log(result); // Outputs: Operation complete
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
**How it works here**: In the code, promises are used to handle the asynchronous operations performed on each message.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when the operation is complete.
**If you change/remove it**: If you remove the promises, the program will not handle the asynchronous operations and may behave unexpectedly. If you change the promises, the program will handle the operations differently.

---
### Concept 7: Math Operations
Math operations are used to perform mathematical calculations, such as random number generation.
**General Example**
```javascript
let randomNumber = Math.random() * 10;
console.log(randomNumber); // Outputs: a random number between 0 and 10
```
**In Our Code**
```javascript
let roll = Math.random() * 100;
```
**How it works here**: In the code, math operations are used to generate a random number between 0 and 100.
**Why it's used**: Math operations are used to perform mathematical calculations and generate random numbers.
**If you change/remove it**: If you remove the math operations, the program will not generate a random number. If you change the math operations, the program will generate a different random number.

---
### Concept 8: Array Iteration
Array iteration is used to iterate over arrays and perform operations on each element.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
for (let i = 0; i < numbers.length; i++) {
  console.log(numbers[i]); // Outputs: each number in the array
}
```
**In Our Code**
```javascript
for (const a of animals) {
  roll -= a.weight;
  if (roll <= 0) {
    selected = a;
    break;
  }
}
```
**How it works here**: In the code, array iteration is used to iterate over the `animals` array and perform an operation on each element.
**Why it's used**: Array iteration is used to perform operations on each element of an array.
**If you change/remove it**: If you remove the array iteration, the program will not perform the operation on each element. If you change the iteration, the program will perform a different operation.

---
### Concept 9: Conditional Assignment
Conditional assignment is used to assign a value to a variable based on a condition.
**General Example**
```javascript
let age = 25;
let status = age >= 18 ? 'adult' : 'minor';
console.log(status); // Outputs: adult
```
**In Our Code**
```javascript
let itemKey = selected.id;
let emoji = selected.emoji;
// ...
itemKey = "infected_shard";
emoji = "☣️";
```
**How it works here**: In the code, conditional assignment is used to assign a value to the `itemKey` and `emoji` variables based on a condition.
**Why it's used**: Conditional assignment is used to simplify code and make it more readable by assigning values based on conditions.
**If you change/remove it**: If you remove the conditional assignment, the program will not assign the values based on the condition. If you change the condition, the program will assign different values.

---
### Concept 10: String Concatenation
String concatenation is used to combine strings and create a new string.
**General Example**
```javascript
let name = 'John';
let greeting = 'Hello, ' + name;
console.log(greeting); // Outputs: Hello, John
```
**In Our Code**
```javascript
let msg =
  GET_BANNER(`🏹 HUNTING`) +
  `\n\nCaptured: ${emoji} *${item.name}*\n▫️ Rarity: ${item.rarity}\n▫️ Sell Value: ${ZENI}${sellValue.toLocaleString()}`;
```
**How it works here**: In the code, string concatenation is used to combine strings and create a new string.
**Why it's used**: String concatenation is used to create new strings by combining existing strings.
**If you change/remove it**: If you remove the string concatenation, the program will not create the new string. If you change the concatenation, the program will create a different string.
