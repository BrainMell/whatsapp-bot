# Debate Tracker Command Flow (`debate`, `judge`)

## 1. Description
The Debate system enables group admins to host structured, AI-judged debates between two participants. When a debate starts, the bot locks the group chat to announcements-only and temporarily promotes both debaters to admin, allowing only them to speak. During the debate, a background handler records their arguments. An admin can trigger the AI judge (`judge`) which uses a Groq LLM model to analyze the transcript and declare a winner, restoring the group settings afterward.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j debate on Messi vs Ronaldo @debater1 @debater2" (Admin only)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── debate command matching (L16537)
            └── core/games/debate.js
                └── startDebate(sock, chatId, topic, debater1, debater2, groupMetadata, BOT_MARKER, smartGroqCall, MODELS) (L54)
                    └── sock.groupSettingUpdate(chatId, 'announcement') (L98)
                    └── sock.groupParticipantsUpdate(chatId, [debater1, debater2], 'promote') (L101)
                    └── activeDebates[chatId] = { ... }
                    └── saveDebates()
                    └── sock.sendMessage(chatId, { text: startAnnouncement })

User sends messages (during debate)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── debate spectator & debater checks (L5361)
            └── debate.recordArgument(chatId, senderJid, text) (L5367)
            └── debate.isSpectator(chatId, senderJid) (Checks spectator passes) (L5370)
                └── debate.checkRelevance(txt, activeDebate, smartGroqCall, MODELS) (L5374)

User sends ".j judge" (Admin only - ending debate)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── judge command matching (L16667)
            └── core/games/debate.js
                └── judgeDebate(sock, chatId, BOT_MARKER, smartGroqCall, MODELS) (L190)
                    └── smartGroqCall(...) (Evaluates arguments via LLM)
                    └── sock.groupSettingUpdate(chatId, 'not_announcement') (Unlocks group chat)
                    └── sock.groupParticipantsUpdate(chatId, [...], 'demote') (Demotes debaters back if they weren't admins)
                    └── updateScoreboard(winner, name, score) (L374)
                    └── delete activeDebates[chatId]
                    └── sock.sendMessage(chatId, { text: verdictText })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Debate Initialization
* **File Path**: [debate.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/debate.js#L54-L136)
* **Inputs**: `(sock, chatId, topic, debater1Jid, debater2Jid, groupMetadata, BOT_MARKER, smartGroqCall, MODELS)`
* **Outputs**: Locks chat announcements, promotes participants, stores active debate session

```javascript
startDebate: async (sock, chatId, topic, debater1Jid, debater2Jid, groupMetadata, BOT_MARKER, smartGroqCall, MODELS) => {
  // Checks if debate is already active
  if (activeDebates[chatId]) return { success: false, message: "❌ Active debate already exists!" };
  
  // Promotes debaters so they can speak when group is locked
  await sock.groupSettingUpdate(chatId, 'announcement');
  await sock.groupParticipantsUpdate(chatId, [debater1Jid], 'promote');
  await sock.groupParticipantsUpdate(chatId, [debater2Jid], 'promote');
  
  activeDebates[chatId] = {
    topic,
    debater1: debater1Jid,
    debater2: debater2Jid,
    arguments: [],
    startTime: Date.now(),
    // ...
  };
  saveDebates();
}
```

---

### Step 2: Message Tracking
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5361-L5432)
* **Inputs**: Any incoming text message `txt` from participants in the group
* **Outputs**: Appends arguments or evaluates spectator contributions via AI

```javascript
if (chatId.endsWith("@g.us") && debate.isDebateActive(chatId)) {
  // 1. Records argument if message comes from debater
  debate.recordArgument(chatId, senderJid, txt);
  
  // 2. Spectator pass validation (deletes message if irrelevant)
  if (debate.isSpectator(chatId, senderJid)) {
    const relevance = await debate.checkRelevance(txt, activeDebate, smartGroqCall, MODELS);
    if (relevance.relevant) {
      await debate.removeSpectator(sock, chatId, senderJid, BOT_MARKER, "Contribution complete");
    } else {
      await sock.sendMessage(chatId, { delete: m.key });
      await debate.removeSpectator(sock, chatId, senderJid, BOT_MARKER, "Irrelevant content");
    }
  }
}
```

---

### Step 3: Verdict Evaluation (The AI Judge)
* **File Path**: [debate.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/debate.js#L190-L290)
* **Inputs**: `(sock, chatId, BOT_MARKER, smartGroqCall, MODELS)`
* **Outputs**: REST API Call to Groq, unlocks group chat, demotes participants, formats win results

```javascript
judgeDebate: async (sock, chatId, BOT_MARKER, smartGroqCall, MODELS) => {
  const debate = activeDebates[chatId];
  if (!debate) return { success: false, message: "❌ No active debate!" };
  
  // Compiles arguments list
  const transcript = debate.arguments.map(arg => `@${arg.debater.split('@')[0]}: ${arg.message}`).join("\n");
  
  // Call AI models to judge
  const prompt = `System judge instructions... Analyze transcript:\n${transcript}`;
  const response = await smartGroqCall(prompt);
  
  // Unlocks chat settings and demotes debaters (if they weren't originally admins)
  await sock.groupSettingUpdate(chatId, 'not_announcement');
  await sock.groupParticipantsUpdate(chatId, [debate.debater1], 'demote'); // etc.
  
  // Award score values and remove active session
  updateScoreboard(winnerJid, winnerName, 1);
  delete activeDebates[chatId];
}
```

---

## 4. How to Modify
* **Change System Prompt of AI Judge**: Modify the prompting context/criteria inside `judgeDebate` in [debate.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/debate.js#L206) (e.g., changing logic, parameters, or structured JSON schema parsed from Groq model output).
* **Restoration Delay / Timeouts**: Modify the default debate session expiration length in `DEBATE_DURATION_MS` in [debate.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/debate.js#L78):
  ```javascript
  const DEBATE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
  ```
* **Scoreboard Points**: Change point adjustments given to the winner inside `judgeDebate` in [debate.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/games/debate.js#L374).










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
const DEBATE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
```
**How it works here**: The variable `DEBATE_DURATION_MS` is used to store the duration of a debate in milliseconds.
**Why it's used**: It's used to define a constant value that can be used throughout the program.
**If you change/remove it**: If you change the value of `DEBATE_DURATION_MS`, the duration of the debate will be different. If you remove it, you will get an error when trying to use the variable.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
let greet = (name) => { console.log(`Hello, ${name}!`); };
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
startDebate: async (sock, chatId, topic, debater1Jid, debater2Jid, groupMetadata, BOT_MARKER, smartGroqCall, MODELS) => {
  // ...
}
```
**How it works here**: The `startDebate` function is defined as an arrow function that takes several parameters and performs a series of actions to start a debate.
**Why it's used**: It's used to define a function that can be called with a set of parameters to perform a specific task.
**If you change/remove it**: If you change the parameters or the body of the function, the behavior of the `startDebate` function will change. If you remove it, you will get an error when trying to call the function.

---
### Concept 3: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are defined using the `if` and `else` keywords.
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
if (chatId.endsWith("@g.us") && debate.isDebateActive(chatId)) {
  // ...
}
```
**How it works here**: The `if` statement checks two conditions: whether the `chatId` ends with `@g.us` and whether a debate is active. If both conditions are true, the code inside the block is executed.
**Why it's used**: It's used to execute different blocks of code based on certain conditions.
**If you change/remove it**: If you change the conditions or the code inside the block, the behavior of the program will change. If you remove it, the code inside the block will always be executed.

---
### Concept 4: Arrays and Array Methods
Arrays are used to store collections of values. Array methods are used to manipulate and interact with arrays.
**General Example**
```javascript
let fruits = ['apple', 'banana', 'orange'];
console.log(fruits.join(', ')); // Outputs: apple, banana, orange
```
**In Our Code**
```javascript
const transcript = debate.arguments.map(arg => `@${arg.debater.split('@')[0]}: ${arg.message}`).join("\n");
```
**How it works here**: The `map` method is used to transform the `arguments` array into a new array of strings, and the `join` method is used to concatenate the strings into a single string.
**Why it's used**: It's used to manipulate and interact with the `arguments` array.
**If you change/remove it**: If you change the transformation or the concatenation, the resulting string will be different. If you remove it, the `transcript` variable will be undefined.

---
### Concept 5: Async/Await and Promises
Async/await and promises are used to handle asynchronous code and ensure that it runs in a predictable and manageable way.
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
await sock.groupSettingUpdate(chatId, 'announcement');
```
**How it works here**: The `await` keyword is used to pause the execution of the code until the promise returned by `sock.groupSettingUpdate` is resolved.
**Why it's used**: It's used to handle asynchronous code and ensure that it runs in a predictable and manageable way.
**If you change/remove it**: If you change the promise or the `await` keyword, the behavior of the code will change. If you remove it, the code will not wait for the promise to be resolved and may produce unexpected results.

---
### Concept 6: Objects and Object Properties
Objects are used to store collections of key-value pairs. Object properties are used to access and manipulate the values stored in an object.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
activeDebates[chatId] = {
  topic,
  debater1: debater1Jid,
  debater2: debater2Jid,
  arguments: [],
  startTime: Date.now(),
  // ...
};
```
**How it works here**: The `activeDebates` object is used to store information about active debates, and the `chatId` is used as a key to access and manipulate the corresponding debate object.
**Why it's used**: It's used to store and manipulate data in a structured and organized way.
**If you change/remove it**: If you change the properties or the values of the debate object, the behavior of the code will change. If you remove it, the `activeDebates` object will not store any information about active debates.

---
### Concept 7: Functions and Function Calls
Functions are used to define reusable blocks of code that can be called with a set of parameters. Function calls are used to execute the code defined in a function.
**General Example**
```javascript
let greet = (name) => { console.log(`Hello, ${name}!`); };
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
await debate.recordArgument(chatId, senderJid, txt);
```
**How it works here**: The `recordArgument` function is called with a set of parameters to record an argument in a debate.
**Why it's used**: It's used to define and execute reusable blocks of code.
**If you change/remove it**: If you change the parameters or the code inside the `recordArgument` function, the behavior of the code will change. If you remove it, the argument will not be recorded.

---
### Concept 8: String Manipulation
String manipulation is used to transform and interact with strings.
**General Example**
```javascript
let name = 'John';
console.log(name.toUpperCase()); // Outputs: JOHN
```
**In Our Code**
```javascript
const prompt = `System judge instructions... Analyze transcript:\n${transcript}`;
```
**How it works here**: The `transcript` string is concatenated with other strings to create a new string.
**Why it's used**: It's used to transform and interact with strings.
**If you change/remove it**: If you change the transformation or the concatenation, the resulting string will be different. If you remove it, the `prompt` variable will be undefined.

---
### Concept 9: Date and Time
Date and time are used to represent and manipulate dates and times.
**General Example**
```javascript
let date = new Date();
console.log(date.getTime()); // Outputs: the current time in milliseconds
```
**In Our Code**
```javascript
startTime: Date.now(),
```
**How it works here**: The `Date.now()` function is used to get the current time in milliseconds.
**Why it's used**: It's used to represent and manipulate dates and times.
**If you change/remove it**: If you change the way the date and time are represented or manipulated, the behavior of the code will change. If you remove it, the `startTime` property will be undefined.

---
### Concept 10: Modules and Imports
Modules and imports are used to organize and reuse code in a program.
**General Example**
```javascript
let math = require('math');
console.log(math.pi); // Outputs: 3.14159
```
**In Our Code**
```javascript
smartGroqCall, MODELS
```
**How it works here**: The `smartGroqCall` and `MODELS` variables are imported from another module and used in the code.
**Why it's used**: It's used to organize and reuse code in a program.
**If you change/remove it**: If you change the way the modules are imported or used, the behavior of the code will change. If you remove it, the `smartGroqCall` and `MODELS` variables will be undefined.
