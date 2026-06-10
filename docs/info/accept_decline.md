# Accept and Decline Commands Flow (`accept`, `decline`)

## 1. Description
The `accept` and `decline` commands act as global action confirmations. When a user receives an invite (such as an RPG Duel challenge, a Guild invite, or a Bank Loan proposal), they can reply with `.j accept` or `.j decline` to resolve the pending invite.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j accept"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── accept command matching (L13401)
            └── 1. Check Duel invites (pvpSystem.getInvite)
                └── pvpSystem.acceptChallenge(...) (L13408)
            └── 2. Check Guild invites (guilds.checkGuildInvite)
                └── guilds.acceptGuildInvite(...) (L13435)
            └── 3. Check Loan invites (loans.getPendingRequest)
                └── loans.acceptLoan(...) (L13454)
            └── sock.sendMessage(chatId, { text: resultMessage })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

---

### Step 2: Accept Invites Checking Sequence
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13400-L13474)
* **Inputs**: Command string `accept`
* **Outputs**: Resolves the highest-priority pending invitation

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} accept`) {
  // 1. Check PvP Duel Invites
  const duelInvite = pvpSystem.getInvite(chatId, senderJid);
  if (duelInvite) {
    const result = await pvpSystem.acceptChallenge(sock, chatId, senderJid);
    return;
  }

  // 2. Check Guild Invites
  const guildInvite = guilds.checkGuildInvite(senderJid);
  if (guildInvite) {
    const result = guilds.acceptGuildInvite(senderJid);
    return;
  }

  // 3. Check Loan Invites
  const loanRequest = loans.getPendingRequest(senderJid);
  if (loanRequest) {
    const result = loans.acceptLoan(loanRequest.lenderJid);
    return;
  }
}
```

---

### Step 3: Decline Invites Checking Sequence
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13476-L13500)
* **Inputs**: Command string `decline`
* **Outputs**: Rejects the highest-priority pending invitation

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} decline`) {
  // 1. Check Duel
  const duelInvite = pvpSystem.getInvite(chatId, senderJid);
  if (duelInvite) {
    pvpSystem.declineChallenge(chatId, senderJid);
    await sock.sendMessage(chatId, { text: "⚔️ Duel invitation declined." });
    return;
  }

  // 2. Check Guild
  const guildInvite = guilds.checkGuildInvite(senderJid);
  if (guildInvite) {
    const result = guilds.declineGuildInvite(senderJid);
    await sock.sendMessage(chatId, { text: result.message });
    return;
  }
}
```

---

## 4. How to Modify
* **Change Invitation Expiry Timeouts**: Invite lifetimes (e.g., 5-minute duel limits) are managed inside their respective subsystem files:
  - PvP Duels: [pvpSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/pvpSystem.js)
  - Guilds: [guilds.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guilds.js)
  - Loans: [loans.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/loans.js) (or within database flow systems).
* **Prioritization of Invites**: Change the order of checks inside [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13400) to prioritize guild invites or loans over duels.










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
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} accept`) {
  // code to execute
}
```
**How it works here**: The code checks if the `lowerTxt` variable is equal to a specific string. If the condition is true, it executes the code inside the if block.
**Why it's used**: Conditional statements are used to handle different scenarios and make decisions based on user input or other factors.
**If you change/remove it**: If you remove the conditional statement, the code inside the if block will always be executed, regardless of the condition. If you change the condition, the code may not work as expected.

---
### Concept 2: Template Literals
Template literals are used to create strings that can contain expressions. They allow you to embed variables or expressions inside string literals.
**General Example**
```javascript
let name = "John";
let age = 30;
console.log(`My name is ${name} and I am ${age} years old.`);
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} accept`) {
  // code to execute
}
```
**How it works here**: The code uses template literals to create a string that contains the result of the `botConfig.getPrefix().toLowerCase()` expression.
**Why it's used**: Template literals are used to create dynamic strings that can contain variables or expressions.
**If you change/remove it**: If you remove the template literal, the code will not be able to create a dynamic string. If you change the expression inside the template literal, the resulting string may not be what you expect.

---
### Concept 3: Functions
Functions are reusable blocks of code that can take arguments and return values. They allow you to organize your code and make it more modular.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet("John");
```
**In Our Code**
```javascript
const result = await pvpSystem.acceptChallenge(sock, chatId, senderJid);
```
**How it works here**: The code calls the `acceptChallenge` function and passes arguments to it. The function returns a value that is stored in the `result` variable.
**Why it's used**: Functions are used to organize code and make it more reusable.
**If you change/remove it**: If you remove the function call, the code will not execute the function. If you change the function name or arguments, the code may not work as expected.

---
### Concept 4: Async/Await
Async/await is a syntax for working with promises. It allows you to write asynchronous code that is easier to read and maintain.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
const result = await pvpSystem.acceptChallenge(sock, chatId, senderJid);
```
**How it works here**: The code uses async/await to call the `acceptChallenge` function and wait for its result.
**Why it's used**: Async/await is used to simplify asynchronous code and make it easier to read.
**If you change/remove it**: If you remove the async/await syntax, the code will not wait for the result of the function call. If you change the function to a non-async function, the code may not work as expected.

---
### Concept 5: Variables
Variables are used to store values in a program. They can be used to store numbers, strings, objects, and other types of data.
**General Example**
```javascript
let x = 5;
console.log(x);
```
**In Our Code**
```javascript
const duelInvite = pvpSystem.getInvite(chatId, senderJid);
```
**How it works here**: The code declares a variable `duelInvite` and assigns it the result of the `getInvite` function.
**Why it's used**: Variables are used to store and manipulate data in a program.
**If you change/remove it**: If you remove the variable declaration, the code will not be able to store the result of the function call. If you change the variable name or type, the code may not work as expected.

---
### Concept 6: Object Methods
Object methods are functions that are part of an object. They can be used to perform actions on the object or its properties.
**General Example**
```javascript
let person = {
  name: "John",
  age: 30,
  greet: function() {
    console.log(`Hello, my name is ${this.name} and I am ${this.age} years old.`);
  }
};
person.greet();
```
**In Our Code**
```javascript
const guildInvite = guilds.checkGuildInvite(senderJid);
```
**How it works here**: The code calls the `checkGuildInvite` method on the `guilds` object and passes an argument to it.
**Why it's used**: Object methods are used to perform actions on an object or its properties.
**If you change/remove it**: If you remove the method call, the code will not be able to perform the action. If you change the method name or arguments, the code may not work as expected.

---
### Concept 7: Return Statements
Return statements are used to exit a function and return a value to the caller.
**General Example**
```javascript
function add(x, y) {
  return x + y;
}
console.log(add(2, 3));
```
**In Our Code**
```javascript
const result = guilds.acceptGuildInvite(senderJid);
```
**How it works here**: The code calls the `acceptGuildInvite` function and stores its return value in the `result` variable.
**Why it's used**: Return statements are used to exit a function and return a value to the caller.
**If you change/remove it**: If you remove the return statement, the function will not return a value. If you change the return value, the code may not work as expected.

---
### Concept 8: Comparison Operators
Comparison operators are used to compare values and return a boolean result.
**General Example**
```javascript
let x = 5;
let y = 10;
console.log(x > y);
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} accept`) {
  // code to execute
}
```
**How it works here**: The code uses the `===` operator to compare the `lowerTxt` variable with a string literal.
**Why it's used**: Comparison operators are used to compare values and make decisions based on the result.
**If you change/remove it**: If you remove the comparison operator, the code will not be able to compare the values. If you change the operator, the code may not work as expected.
