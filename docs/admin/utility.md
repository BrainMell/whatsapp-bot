# Bot Control and Utility Commands Flow (`on`, `off`, `reset`, `reveal`, `updateall`)

## 1. Description
The Utility commands manage the bot's runtime state, DMs/conversations memory caching, and view-once media extraction. 
* `on` / `off`: Toggles whether the bot processes commands in a specific chat.
* `reset`: Wipes the AI's conversation history cache for a chat.
* `reveal` (alias `unmask`): Intercepts view-once images/videos by downloading their raw streams and sending them back to the chat.
* `updateall`: Allows the owner to broadcast custom system updates to all enabled chats.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j reveal" (replying to view-once media)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── reveal/unmask command matching (L6097)
            └── extractViewOnce(quotedContent) (Checks if old/new view-once payload format)
            └── downloadMedia(mediaMsg, type) (L1920)
                └── downloadContentFromMessage(message, type) (From Baileys)
            └── sock.sendMessage(chatId, { [type]: buffer, caption }) (Sends revealed file)

User sends ".j on" / ".j off" (Admin only)
└── core/engine.js
    └── on / off command matching (L16403 / L16424)
        └── enabledChats.add(chatId) / enabledChats.delete(chatId)
        └── saveEnabledChats() (Persists status to system database)
        └── sock.sendMessage(chatId, { text: enabledStatusText })

User sends ".j reset"
└── core/engine.js
    └── reset command matching (L1507)
        └── conversationMemory.delete(memKey) (Clears text contexts)
        └── temporaryContext.delete(senderJid)
        └── aiResponseCache.delete(...) (Wipes AI cached answers)
        └── sock.sendMessage(chatId, { text: "Chat memory cleared." })

User sends ".j updateall Hello World" (Owner only)
└── core/engine.js
    └── updateall command matching (L16445)
        └── Loops through Array.from(enabledChats)
        └── sock.sendMessage(targetChatId, { text: broadcastMsg })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: View-Once Stealer (`reveal` / `unmask`)
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L6097-L6198)
* **Inputs**: Quoted message context containing `viewOnce` properties
* **Outputs**: Delivers raw image/video file to the chat

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reveal` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} unmask`) {
  const quotedMsg = m.message?.extendedTextMessage?.contextInfo;
  const quotedContent = quotedMsg.quotedMessage;
  
  let type = null;
  let mediaMsg = null;

  // Handles both new (direct viewOnce flag) and old formats:
  if (quotedContent.imageMessage?.viewOnce) {
    type = "image";
    mediaMsg = quotedContent.imageMessage;
  } else if (quotedContent.videoMessage?.viewOnce) {
    type = "video";
    mediaMsg = quotedContent.videoMessage;
  } // ... fallback old format resolver (extractViewOnce)

  if (!type || !mediaMsg) return reply("Not a view-once message.");

  // Downloads hidden media stream chunks
  const buffer = await downloadMedia(mediaMsg, type);

  // Send back raw file attachment
  await sock.sendMessage(chatId, {
    [type]: buffer,
    caption: BOT_MARKER + "🎭 *Phantom Thief acquired your secret.*"
  });
}
```

---

### Step 2: Inactivity & Group Toggles (`on` / `off`)
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L16402-L16443)
* **Inputs**: Admin toggle commands
* **Outputs**: Writes active status array to MongoDB/wrapper system and toggles responder engine

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} on`) {
  if (!canUseAdminCommands) return reply("Admins only.");
  enabledChats.add(chatId);
  saveEnabledChats(); // Writes updated list to system db: system.set('enabled_chats', ...)
  await sock.sendMessage(chatId, { text: "🤖 AI is now enabled in this chat!" });
}
```

---

### Step 3: Conversation Memory Reset (`reset`)
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1507-L1530)
* **Inputs**: Text matching `reset` prefix command
* **Outputs**: Deletes cached history objects from local cache maps

```javascript
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} reset`)) {
  const memKey = `${senderJid}_${chatId || 'dm'}`;
  conversationMemory.delete(memKey);
  conversationMemory.delete(senderJid);
  temporaryContext.delete(senderJid);

  // Clear AI response cache for this chat
  if (chatId) {
    for (const key of aiResponseCache.keys()) {
      if (key.startsWith(`${chatId}_`)) aiResponseCache.delete(key);
    }
  }
  await sock.sendMessage(chatId, { text: "🗑️ Chat memory cleared." });
}
```

---

## 4. How to Modify
* **Customize View-Once Stolen Caption**: Modify the text returned with the revealed attachment in [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L6180).
* **Broadcast Rate Limits**: Edit the loop interval or add concurrency limits to the broadcast loop in the `updateall` handler around line 16445 in [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js).
* **Reset Custom Keys**: If you add new memory profiles or contextual caching layers, make sure to clear them inside the `reset` command handler block in [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1507).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They allow the program to make decisions and take different paths.
**General Example**
```javascript
let x = 5;
if (x > 10) {
  console.log("x is greater than 10");
} else {
  console.log("x is less than or equal to 10");
}
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reveal` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} unmask`) {
  // code here
}
```
**How it works here**: The code checks if the `lowerTxt` variable matches certain conditions, and if it does, it executes the code inside the if block.
**Why it's used**: It's used to determine which action to take based on the user's input.
**If you change/remove it**: If you remove this conditional statement, the code inside it will always be executed, regardless of the user's input. If you change the condition, the code may not be executed when it's supposed to.

---
### Concept 2: Variables
Variables are used to store and manipulate data in a program. They can hold different types of values such as numbers, strings, and objects.
**General Example**
```javascript
let name = "John";
console.log(name); // outputs "John"
```
**In Our Code**
```javascript
const quotedMsg = m.message?.extendedTextMessage?.contextInfo;
const quotedContent = quotedMsg.quotedMessage;
```
**How it works here**: The code declares two variables, `quotedMsg` and `quotedContent`, and assigns them values from the `m.message` object.
**Why it's used**: It's used to store and manipulate data from the user's message.
**If you change/remove it**: If you remove these variables, the code will not be able to access the data from the user's message. If you change the variable names, the code may not work as expected.

---
### Concept 3: Object Properties
Object properties are used to access and manipulate data stored in objects. They can be accessed using dot notation or bracket notation.
**General Example**
```javascript
let person = { name: "John", age: 30 };
console.log(person.name); // outputs "John"
```
**In Our Code**
```javascript
const quotedContent = quotedMsg.quotedMessage;
let type = null;
if (quotedContent.imageMessage?.viewOnce) {
  type = "image";
  mediaMsg = quotedContent.imageMessage;
}
```
**How it works here**: The code accesses the `quotedMessage` property of the `quotedMsg` object and then accesses the `imageMessage` property of the `quotedContent` object.
**Why it's used**: It's used to access and manipulate data stored in objects.
**If you change/remove it**: If you remove these object properties, the code will not be able to access the data stored in the objects. If you change the property names, the code may not work as expected.

---
### Concept 4: Nullish Coalescing Operator
The nullish coalescing operator (`?.`) is used to access properties of an object that may be null or undefined. It returns `undefined` if the object is null or undefined.
**General Example**
```javascript
let person = { name: "John" };
console.log(person?.age); // outputs undefined
```
**In Our Code**
```javascript
const quotedMsg = m.message?.extendedTextMessage?.contextInfo;
```
**How it works here**: The code uses the nullish coalescing operator to access the `extendedTextMessage` property of the `m.message` object, and then accesses the `contextInfo` property of the resulting object.
**Why it's used**: It's used to prevent null pointer exceptions when accessing properties of objects that may be null or undefined.
**If you change/remove it**: If you remove the nullish coalescing operator, the code may throw a null pointer exception if the `m.message` object is null or undefined.

---
### Concept 5: Async/Await
Async/await is used to write asynchronous code that is easier to read and maintain. It allows the program to pause execution until a promise is resolved or rejected.
**General Example**
```javascript
async function example() {
  let data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
const buffer = await downloadMedia(mediaMsg, type);
await sock.sendMessage(chatId, {
  [type]: buffer,
  caption: BOT_MARKER + "🎭 *Phantom Thief acquired your secret.*"
});
```
**How it works here**: The code uses async/await to download media and send a message. The `downloadMedia` function returns a promise that is awaited, and the `sendMessage` function is also awaited.
**Why it's used**: It's used to write asynchronous code that is easier to read and maintain.
**If you change/remove it**: If you remove the async/await keywords, the code will not wait for the promises to be resolved or rejected, and may not work as expected.

---
### Concept 6: Template Literals
Template literals are used to create strings that can contain expressions. They are denoted by backticks (`) and can contain placeholders for expressions.
**General Example**
```javascript
let name = "John";
console.log(`Hello, ${name}!`); // outputs "Hello, John!"
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reveal` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} unmask`) {
  // code here
}
```
**How it works here**: The code uses template literals to create strings that contain expressions. The `botConfig.getPrefix().toLowerCase()` expression is evaluated and inserted into the string.
**Why it's used**: It's used to create strings that can contain dynamic values.
**If you change/remove it**: If you remove the template literals, the code will not be able to insert dynamic values into the strings. If you change the expressions inside the template literals, the code may not work as expected.

---
### Concept 7: Sets
Sets are used to store unique values in a collection. They can be used to keep track of unique values and to perform set operations.
**General Example**
```javascript
let uniqueValues = new Set();
uniqueValues.add("John");
uniqueValues.add("Jane");
console.log(uniqueValues.size); // outputs 2
```
**In Our Code**
```javascript
enabledChats.add(chatId);
```
**How it works here**: The code uses a set to store unique chat IDs. The `add` method is used to add a new chat ID to the set.
**Why it's used**: It's used to keep track of unique chat IDs and to perform set operations.
**If you change/remove it**: If you remove the set, the code will not be able to keep track of unique chat IDs. If you change the set operations, the code may not work as expected.

---
### Concept 8: Functions
Functions are used to encapsulate code that can be reused. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet("John"); // outputs "Hello, John!"
```
**In Our Code**
```javascript
async function downloadMedia(mediaMsg, type) {
  // code here
}
```
**How it works here**: The code defines a function `downloadMedia` that takes two arguments, `mediaMsg` and `type`. The function is asynchronous and returns a promise.
**Why it's used**: It's used to encapsulate code that can be reused and to perform asynchronous operations.
**If you change/remove it**: If you remove the function, the code will not be able to download media. If you change the function signature or implementation, the code may not work as expected.

---
### Concept 9: Promises
Promises are used to handle asynchronous operations. They can be used to wait for a value to be available or to handle errors.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // code here
});
promise.then((value) => {
  console.log(value);
}).catch((error) => {
  console.error(error);
});
```
**In Our Code**
```javascript
const buffer = await downloadMedia(mediaMsg, type);
```
**How it works here**: The code uses a promise to wait for the `downloadMedia` function to complete. The `await` keyword is used to pause execution until the promise is resolved or rejected.
**Why it's used**: It's used to handle asynchronous operations and to wait for values to be available.
**If you change/remove it**: If you remove the promise, the code will not be able to handle asynchronous operations. If you change the promise implementation, the code may not work as expected.

---
### Concept 10: Object Destructuring
Object destructuring is used to extract properties from an object and assign them to variables.
**General Example**
```javascript
let person = { name: "John", age: 30 };
let { name, age } = person;
console.log(name); // outputs "John"
console.log(age); // outputs 30
```
**In Our Code**
```javascript
let type = null;
let mediaMsg = null;
if (quotedContent.imageMessage?.viewOnce) {
  type = "image";
  mediaMsg = quotedContent.imageMessage;
}
```
**How it works here**: The code does not use object destructuring explicitly, but it assigns properties of an object to variables.
**Why it's used**: It's used to extract properties from an object and assign them to variables.
**If you change/remove it**: If you remove the variable assignments, the code will not be able to access the properties of the object. If you change the variable names, the code may not work as expected.
