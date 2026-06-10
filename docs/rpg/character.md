# Character Command Flow (`character` / `char` / `stats`)

## 1. Description
The Character command allows players to inspect their RPG character stats, current level, progress, equipped gear, Zeni balance, and adventurer rank. It dynamically generates a graphical profile card using an image generation service if available, otherwise it falls back to a clean text-based message containing the player profile.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j character", ".j char", or ".j stats"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match checks (L6875-6885)
            └── core/commands/rpgCommands.js
                └── displayCharacterSheet(sock, chatId, senderJid, senderName) (L24)
                    ├── progression.getCharacterSheet(senderJid)
                    ├── economy.getUser(senderJid)
                    ├── classSystem.getClassById(sheet.class)
                    ├── progression.getBaseStats(senderJid, sheet.class)
                    ├── inventorySystem.getEquipment(senderJid)
                    ├── inventorySystem.getEquipmentStats(senderJid)
                    ├── profileHelper.buildCardData(senderJid, senderName, pfpUrl)
                    ├── goService.generateProfileCard(cardData)
                    └── sock.sendMessage(chatId, { image: cardBuffer, caption: msg, mentions })
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
- Listens to incoming WhatsApp messages. It filters for new notifications and maps them for validation and routing.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L6875-L6907)
* **Line Numbers**: 6875-6907
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and sender info
* **Outputs**: Redirects execution to `rpgCommands.displayCharacterSheet`

```javascript
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} character` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} char` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} stats` ||
                    isClassCmd
                  ) {
                    // ... (if isClassCmd logic)
                    await rpgCommands.displayCharacterSheet(
                      sock,
                      chatId,
                      senderJid,
                      senderName,
                    );
                    return;
                  }
```

#### Explanation
- Catches the prefix combined with `character`, `char`, or `stats`.
- Directs the execution flow to `rpgCommands.displayCharacterSheet()` by passing the active socket client, active chat JID, sender's WhatsApp JID, and sender's formatted profile name.

---

### Step 3: Fetching Profile Data
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L24-L39)
* **Line Numbers**: 24-39
* **Called From**: `displayCharacterSheet()`
* **Inputs**: `(sock, chatId, senderJid, senderName)`
* **Outputs**: Profile details (`sheet`, `economyUser`, `classData`, `stats`, `equipment`, `equipStats`)

```javascript
async function displayCharacterSheet(sock, chatId, senderJid, senderName) {
    const sheet = progression.getCharacterSheet(senderJid);
    const economyUser = economy.getUser(senderJid);
    
    if (!sheet || !economyUser) { 
        await sock.sendMessage(chatId, { 
            text: `❌ Not registered! Use \`${getPrefix()} register\` first.` 
        });
        return;
    }
    
    const classData = classSystem.getClassById(sheet.class);
    const stats = progression.getBaseStats(senderJid, sheet.class);
    const equipment = inventorySystem.getEquipment(senderJid);
    const equipStats = inventorySystem.getEquipmentStats(senderJid);
```

#### Explanation
1. Checks the player sheet inside the in-memory Cache mapping `progression.getCharacterSheet()`.
2. Inspects `economy.getUser()` to find the player's wallet balances.
3. If either check is missing, tells the user to register first.
4. Queries class metadata, base stats, and equipped items along with their stat modifiers.

---

### Step 4: Card Generation & Output Delivery
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L40-L151)
* **Line Numbers**: 40-151
* **Called From**: `displayCharacterSheet()`
* **Inputs**: Fetched profile objects and JID
* **Outputs**: Dispatches image or formatted text to WhatsApp chat JID

```javascript
    // Handle PFP
    let pfpUrl;
    try { 
        pfpUrl = await sock.profilePictureUrl(senderJid, 'image');
    } catch (e) { 
        pfpUrl = null;
    }

    // Try Go Image Service first
    try {
        const cardData = await profileHelper.buildCardData(senderJid, senderName, pfpUrl);
        if (cardData) {
            const cardBuffer = await goService.generateProfileCard(cardData);
            if (cardBuffer) {
                let captionMsg = `👤 *Character:* ${cardData.nickname}\n` + ...;
                await sock.sendMessage(chatId, { 
                    image: cardBuffer,
                    caption: captionMsg,
                    mentions: [senderJid]
                });
                return;
            }
        }
    } catch (err) {
        console.error("Failed to generate Go character card:", err.message);
    }
    // Fallback text rendering if image generation fails...
```

#### Explanation
1. Obtains the player's current WhatsApp avatar JID URL.
2. Formats all statistics and invokes the Go Image Service (`goService.generateProfileCard()`) via HTTP/gRPC.
3. Sends the generated PNG image with a comprehensive statistics summary caption.
4. If image rendering fails, formats the details as a textual template and outputs it to the target conversation.

---

## 4. How to Modify
- **Base Level Scaling & Math**: Adjust base stat formulas inside [core/rpg/progression.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js).
- **Modify Go Profile Layout/Design**: The layout configuration for Go cards resides in [core/utils/goImageService.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/goImageService.js) and the associated profile card generation endpoint.
- **Change Class Modifiers**: Adjust stats and icons in [core/rpg/classSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/classSystem.js).










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
const sheet = progression.getCharacterSheet(senderJid);
const economyUser = economy.getUser(senderJid);
```
**How it works here**: In the code, `sheet` and `economyUser` are variables that store the result of the `getCharacterSheet` and `getUser` functions, respectively.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to read and maintain the code.
**If you change/remove it**: If you remove the variables, you would have to call the functions every time you need the values, making the code more verbose and harder to read. If you change the variable names, you would have to update all references to the variables in the code.

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
**How it works here**: The arrow function is used as an event listener for the `messages.upsert` event. When the event is triggered, the function is called with the `messages` and `type` parameters.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as event listeners or callbacks.
**If you change/remove it**: If you remove the arrow function, the event listener would not be defined, and the code would not respond to the `messages.upsert` event. If you change the arrow function to a traditional function, the code would still work, but it would be less concise.

---
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
**Why it's used**: Event listeners are used to respond to user interactions or other events in the program.
**If you change/remove it**: If you remove the event listener, the program would not respond to the `messages.upsert` event, and the code would not be executed. If you change the event listener to listen for a different event, the code would respond to the new event instead.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions.
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
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: The conditional statements are used to check the `type` and `isRekeying` variables and return from the function if the conditions are not met.
**Why it's used**: Conditional statements are used to make decisions in the program and execute different blocks of code based on those decisions.
**If you change/remove it**: If you remove the conditional statements, the function would not check the `type` and `isRekeying` variables, and the code would not return early. If you change the conditions, the function would make different decisions and execute different blocks of code.

---
### Concept 5: Array Methods
Array methods are used to manipulate and interact with arrays.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
numbers.map((num) => num * 2); // [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` method is used to transform the `messages` array into a new array of promises, which are then awaited using `Promise.all`.
**Why it's used**: Array methods are used to manipulate and interact with arrays in the program.
**If you change/remove it**: If you remove the `map` method, the code would not transform the `messages` array, and the `Promise.all` method would not be called. If you change the `map` method to a different array method, the code would behave differently.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when an operation is complete.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Success!');
});
promise.then((result) => {
  console.log(result); // Outputs: Success!
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
**How it works here**: The `Promise.all` method is used to await an array of promises, which are created using the `map` method.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when an operation is complete.
**If you change/remove it**: If you remove the `Promise.all` method, the code would not await the promises, and the function would not wait for the asynchronous operations to complete. If you change the `Promise.all` method to a different promise method, the code would behave differently.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code.
**General Example**
```javascript
async function example() {
  const result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
async function displayCharacterSheet(sock, chatId, senderJid, senderName) {
  // ...
}
```
**How it works here**: The `async` keyword is used to define an asynchronous function, and the `await` keyword is used to wait for promises to resolve.
**Why it's used**: Async/await is used to make asynchronous code easier to read and write.
**If you change/remove it**: If you remove the `async` keyword, the function would not be asynchronous, and the `await` keyword would not be valid. If you change the `await` keyword to a different syntax, the code would behave differently.

---
### Concept 8: Object Destructuring
Object destructuring is a syntax feature that allows you to extract properties from an object and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The object destructuring syntax is used to extract the `messages` and `type` properties from the object passed to the event listener.
**Why it's used**: Object destructuring is used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the object destructuring syntax, the code would have to access the properties using the dot notation, making the code more verbose. If you change the property names, the code would access different properties.

---
### Concept 9: Try-Catch Blocks
Try-catch blocks are used to handle errors and exceptions in the code.
**General Example**
```javascript
try {
  // code that might throw an error
} catch (error) {
  console.log(error);
}
```
**In Our Code**
```javascript
try {
  const cardBuffer = await goService.generateProfileCard(cardData);
  // ...
} catch (err) {
  console.error("Failed to generate Go character card:", err.message);
}
```
**How it works here**: The try-catch block is used to catch any errors that might occur when generating the profile card.
**Why it's used**: Try-catch blocks are used to handle errors and exceptions in the code, making it more robust and reliable.
**If you change/remove it**: If you remove the try-catch block, the code would not catch any errors that might occur, and the program would crash. If you change the catch block to handle a different type of error, the code would behave differently.

---
### Concept 10: String Interpolation
String interpolation is a feature that allows you to embed expressions inside string literals.
**General Example**
```javascript
const name = 'John';
console.log(`Hello, ${name}!`); // Outputs: Hello, John!
```
**In Our Code**
```javascript
let captionMsg = `👤 *Character:* ${cardData.nickname}\n` + // ...
```
**How it works here**: The string interpolation syntax is used to embed the `cardData.nickname` expression inside the string literal.
**Why it's used**: String interpolation is used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the string interpolation syntax, the code would have to use concatenation or other methods to build the string, making the code more verbose. If you change the expression inside the string literal, the code would embed a different value.
