# Support Command Flow (`support`)

## 1. Description
The `support` command provides users with a direct line of contact to the bot creator. To prevent abuse and spam, the bot limits each user to 5 support requests per session. If a user exceeds this limit, they are blocked from using the support command. The command also tags the bot creator's contact card when executed.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j support"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── support command matching (L5891)
            └── checkSupportUsage(senderJid) (L924)
                └── Retrieve counts from system DB (system.get)
            └── incrementSupportUsage(senderJid) (L928)
                └── Save updated count to system DB (system.set)
            └── sendMenuWithBanner(sock, chatId, supportMsg, [creatorJid]) (L5925)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Ingestion
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

---

### Step 2: Spam Check and Usage Tracking
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5891-L5930)
* **Inputs**: Message text `support`
* **Outputs**: Evaluates current user support usage count

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} support`) {
  const usage = checkSupportUsage(senderJid);
  
  if (usage >= 5) {
    await sendMenuWithBanner(sock, chatId, GET_BANNER(`🚫 BLOCKED`) + `\n\nYou've used the support command too many times (5/5).`);
    return;
  }
  
  const newUsage = incrementSupportUsage(senderJid);
  const remaining = 5 - newUsage;
  
  let warningText = "";
  if (newUsage >= 3) {
    warningText = `\n\n⚠️️ *WARNING:* ${remaining} uses remaining before you're blocked!`;
  }
  
  const supportMsg = GET_BANNER(`🛠️ SUPPORT`) + `\n\nFor help or issues, contact:\n@0201487480\n\n━━━━━━━━━━━━━━━\nUsage: ${newUsage}/5${warningText}`;
  await sendMenuWithBanner(sock, chatId, supportMsg, ["0201487480@s.whatsapp.net"]);
  return;
}
```

---

### Step 3: Persistence and Database Updates
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L924-L933)
* **Inputs**: `(userId)`
* **Outputs**: Saves the incremented values to MongoDB/system database wrapper

```javascript
function checkSupportUsage(userId) {
  return supportUsage.get(userId) || 0;
}

function incrementSupportUsage(userId) {
  const count = (supportUsage.get(userId) || 0) + 1;
  supportUsage.set(userId, count);
  saveSupportUsage(); // Writes system.set(BOT_ID + "_support_usage", ...)
  return count;
}
```

---

## 4. How to Modify
* **Change Creator Contact JID**: Update the phone number and WhatsApp JID inside [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5920-L5926).
* **Adjust Support Ticket Limits**: Change the hard lockout threshold (currently `5`) inside the command handler in [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5897).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They allow the program to make decisions and respond accordingly.
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
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} support`) {
  ...
}
```
**How it works here**: The code checks if the `lowerTxt` variable is equal to the support command prefix. If it is, the code inside the if statement is executed.
**Why it's used**: Conditional statements are used to handle different scenarios and make decisions based on user input.
**If you change/remove it**: If you remove this conditional statement, the code will not be able to check for the support command and will not execute the corresponding code. If you change the condition, the code may not work as intended or may execute the wrong block of code.

---
### Concept 2: Variables
Variables are used to store and manipulate data in a program. They can be reassigned and updated as needed.
**General Example**
```javascript
let name = "John";
console.log(name); // outputs "John"
name = "Jane";
console.log(name); // outputs "Jane"
```
**In Our Code**
```javascript
const usage = checkSupportUsage(senderJid);
const newUsage = incrementSupportUsage(senderJid);
let warningText = "";
```
**How it works here**: The code uses variables to store the result of function calls and to store a warning message.
**Why it's used**: Variables are used to store and manipulate data, making it easier to write and understand the code.
**If you change/remove it**: If you remove a variable, the code will throw an error because it is trying to use a non-existent variable. If you change a variable's value, the code may not work as intended or may produce unexpected results.

---
### Concept 3: Functions
Functions are reusable blocks of code that perform a specific task. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet("John"); // outputs "Hello, John!"
```
**In Our Code**
```javascript
function checkSupportUsage(userId) {
  return supportUsage.get(userId) || 0;
}
function incrementSupportUsage(userId) {
  ...
}
```
**How it works here**: The code defines two functions: `checkSupportUsage` and `incrementSupportUsage`. These functions are used to retrieve and update the support usage count for a given user.
**Why it's used**: Functions are used to organize and reuse code, making it easier to maintain and understand.
**If you change/remove it**: If you remove a function, the code will throw an error because it is trying to call a non-existent function. If you change a function's implementation, the code may not work as intended or may produce unexpected results.

---
### Concept 4: Object Methods
Object methods are functions that are attached to an object and can be used to perform operations on that object.
**General Example**
```javascript
let person = {
  name: "John",
  greet: function() {
    console.log(`Hello, my name is ${this.name}!`);
  }
}
person.greet(); // outputs "Hello, my name is John!"
```
**In Our Code**
```javascript
const usage = checkSupportUsage(senderJid);
const newUsage = incrementSupportUsage(senderJid);
```
**How it works here**: The code uses object methods to retrieve and update the support usage count for a given user.
**Why it's used**: Object methods are used to encapsulate data and behavior, making it easier to write and understand the code.
**If you change/remove it**: If you remove an object method, the code will throw an error because it is trying to call a non-existent method. If you change an object method's implementation, the code may not work as intended or may produce unexpected results.

---
### Concept 5: Template Literals
Template literals are a way to embed expressions inside string literals, using backticks (``) instead of quotes.
**General Example**
```javascript
let name = "John";
console.log(`Hello, ${name}!`); // outputs "Hello, John!"
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} support`) {
  ...
}
```
**How it works here**: The code uses template literals to construct a string that includes the result of a function call.
**Why it's used**: Template literals are used to make it easier to embed expressions inside string literals, making the code more readable and concise.
**If you change/remove it**: If you remove the template literal, the code will not be able to construct the string correctly. If you change the template literal, the code may not work as intended or may produce unexpected results.

---
### Concept 6: Async/Await
Async/await is a way to write asynchronous code that is easier to read and understand. It allows you to write code that looks synchronous, but is actually asynchronous.
**General Example**
```javascript
async function example() {
  let result = await someAsyncFunction();
  console.log(result);
}
```
**In Our Code**
```javascript
await sendMenuWithBanner(sock, chatId, supportMsg, ["0201487480@s.whatsapp.net"]);
```
**How it works here**: The code uses async/await to send a message to the user and wait for the result.
**Why it's used**: Async/await is used to make it easier to write asynchronous code, making it more readable and maintainable.
**If you change/remove it**: If you remove the async/await, the code will not be able to wait for the result of the asynchronous operation, and may produce unexpected results. If you change the async/await, the code may not work as intended or may produce unexpected results.

---
### Concept 7: Data Storage
Data storage refers to the way data is stored and retrieved in a program. In this case, the code uses a data structure called a Map to store the support usage count for each user.
**General Example**
```javascript
let data = new Map();
data.set("key", "value");
console.log(data.get("key")); // outputs "value"
```
**In Our Code**
```javascript
const usage = checkSupportUsage(senderJid);
const newUsage = incrementSupportUsage(senderJid);
```
**How it works here**: The code uses a Map to store the support usage count for each user, and retrieves and updates the count using the `checkSupportUsage` and `incrementSupportUsage` functions.
**Why it's used**: Data storage is used to store and retrieve data in a program, making it easier to write and understand the code.
**If you change/remove it**: If you remove the data storage, the code will not be able to store and retrieve the support usage count, and may produce unexpected results. If you change the data storage, the code may not work as intended or may produce unexpected results.

---
### Concept 8: String Concatenation
String concatenation is the process of combining two or more strings into a single string.
**General Example**
```javascript
let str1 = "Hello, ";
let str2 = "world!";
console.log(str1 + str2); // outputs "Hello, world!"
```
**In Our Code**
```javascript
const supportMsg = GET_BANNER(`🛠️ SUPPORT`) + `\n\nFor help or issues, contact:\n@0201487480\n\n━━━━━━━━━━━━━━━\nUsage: ${newUsage}/5${warningText}`;
```
**How it works here**: The code uses string concatenation to combine multiple strings into a single string, which is then sent to the user.
**Why it's used**: String concatenation is used to combine multiple strings into a single string, making it easier to write and understand the code.
**If you change/remove it**: If you remove the string concatenation, the code will not be able to combine the strings correctly, and may produce unexpected results. If you change the string concatenation, the code may not work as intended or may produce unexpected results.

---
### Concept 9: Ternary Operator
The ternary operator is a shorthand way to write a simple if-else statement.
**General Example**
```javascript
let x = 5;
let result = x > 10 ? "x is greater than 10" : "x is less than or equal to 10";
console.log(result); // outputs "x is less than or equal to 10"
```
**In Our Code**
```javascript
return supportUsage.get(userId) || 0;
```
**How it works here**: The code uses the ternary operator to return the value of `supportUsage.get(userId)` if it is truthy, or 0 if it is falsy.
**Why it's used**: The ternary operator is used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the ternary operator, the code will not be able to handle the case where `supportUsage.get(userId)` is falsy, and may produce unexpected results. If you change the ternary operator, the code may not work as intended or may produce unexpected results.

---
### Concept 10: Modules and Imports
Modules and imports are used to organize and reuse code in a program.
**General Example**
```javascript
// module.js
export function add(x, y) {
  return x + y;
}

// main.js
import { add } from './module.js';
console.log(add(2, 3)); // outputs 5
```
**In Our Code**
```javascript
const usage = checkSupportUsage(senderJid);
const newUsage = incrementSupportUsage(senderJid);
```
**How it works here**: The code uses modules and imports to organize and reuse code, making it easier to write and understand the program.
**Why it's used**: Modules and imports are used to make the code more modular and reusable, making it easier to maintain and understand.
**If you change/remove it**: If you remove the modules and imports, the code will not be able to organize and reuse code, and may produce unexpected results. If you change the modules and imports, the code may not work as intended or may produce unexpected results.
