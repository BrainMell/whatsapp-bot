# Message Actions Moderation Flow (`delete` / `tagall` / `hidetag` / `pin`)

## 1. Description
These moderation commands operate directly on messages:
- **`delete`**: Deletes a target message by replying to it.
- **`tagall`**: Mentions every user in the group in a single message layout.
- **`hidetag`**: Sends a message that mentions all group participants invisibly.
- **`pin`**: Pins a message inside the group by replying to it.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🗑️ DELETE MESSAGE: User replies to a message with ".j delete"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: lowerTxt === ".j delete" (L7285)
            ├── verify canUseAdminCommands & botIsAdmin
            ├── Extract contextInfo from reply payload: m.message.extendedTextMessage.contextInfo (L7306)
            ├── Resolve author target JID: contextInfo.participant
            ├── Resolve WhatsApp message identifier ID: contextInfo.stanzaId
            ├── Send delete request payload: sock.sendMessage(chatId, { delete: { remoteJid, fromMe: false, id, participant } }) (L7334)
            └── return

======================================================
📌 PIN MESSAGE: User replies to message with ".j pin"
======================================================
User command
└── core/engine.js
    └── Match check: lowerTxt === ".j pin" (L7441)
        ├── verify canUseAdminCommands & botIsAdmin
        ├── Extract contextInfo -> resolve stanzaId and participant
        ├── Send pin request payload: sock.sendMessage(chatId, { pin: { remoteJid, fromMe, id, participant } })
        └── return
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

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7284-L7294) / [L7441-L7450](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7441-L7450)
* **Line Numbers**: 7284-7294 (delete) & 7441-7450 (pin)
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Directs logic to message action mutations

```javascript
                   // .j delete
                   if (
                     lowerTxt === `${botConfig.getPrefix().toLowerCase()} delete`
                   ) {
                     if (!canUseAdminCommands) {
                       await sock.sendMessage(chatId, { text: BOT_MARKER + "Admin only!" });
                       return;
                     }
                     // ... (delete execution)
                   }
```

---

### Step 3: Executing Delete/Pin Requests via Baileys API
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7332-L7341)
* **Line Numbers**: 7332-7341
* **Called From**: `delete` command branch inside `engine.js`
* **Inputs**: `contextInfo` parameters
* **Outputs**: Socket request to delete target message on WhatsApp servers

```javascript
                    try {
                      // Try to delete the message
                      await sock.sendMessage(chatId, {
                        delete: {
                          remoteJid: chatId,
                          fromMe: false,
                          id: contextInfo.stanzaId,
                          participant: messageAuthor,
                        },
                      });
                    } catch (err) {
                        // error logger
                    }
```

#### Explanation
1. Resolves the quoted message context metadata `m.message.extendedTextMessage.contextInfo`. If not replying to any message, informs the user.
2. Extracts message author `participant` JID and unique message ID `stanzaId` from context.
3. Invokes the socket client `sendMessage()` by passing a `delete` payload specifying the `remoteJid` (group chat JID), the target message `id` (`stanzaId`), and the message owner (`participant` JID).
4. WhatsApp servers process the payload and evict the message.

---

## 4. How to Modify
- **Exemptions / Level Guards**: Add bypass rules for owners/mods to bypass delete restrictions.
- **Pin Duration Limits**: Look up the Baileys pin payload options to configure customized pin duration boundaries.










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
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: The variables `type` and `isRekeying` are used to store values that are then used in conditional statements to control the flow of the program.
**Why it's used**: Variables are used to store values that need to be accessed and manipulated throughout the program.
**If you change/remove it**: If you remove the variables, the program will not be able to store and access the values, and the conditional statements will not work as expected. If you change the variable names, you will need to update all references to the variable in the code.

---
### Concept 2: Conditional Statements
Conditional statements are used to control the flow of a program based on certain conditions. They allow you to execute different blocks of code depending on whether a condition is true or false.
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
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} delete`) {
  // ...
}
```
**How it works here**: The conditional statements are used to check the values of `type`, `isRekeying`, and `lowerTxt`, and execute different blocks of code based on the conditions.
**Why it's used**: Conditional statements are used to control the flow of the program and execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove the conditional statements, the program will not be able to control the flow of the program based on the conditions, and the program may not work as expected. If you change the conditions, the program may execute different blocks of code.

---
### Concept 3: Arrow Functions
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
**How it works here**: The arrow function is used to define a callback function that is executed when the `messages.upsert` event is triggered.
**Why it's used**: Arrow functions are used to define small, single-purpose functions in a concise way.
**If you change/remove it**: If you remove the arrow function, the program will not be able to define the callback function, and the event will not be handled. If you change the arrow function to a traditional function, the program will still work, but the syntax will be different.

---
### Concept 4: Event Listeners
Event listeners are used to respond to events that occur in a program, such as user interactions or network requests. They allow you to execute code when a specific event occurs.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('The document was clicked');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events that occur in a program, and execute code when a specific event occurs.
**If you change/remove it**: If you remove the event listener, the program will not be able to respond to the `messages.upsert` event, and the code will not be executed. If you change the event listener to listen for a different event, the program will respond to the new event instead.

---
### Concept 5: Array Methods
Array methods are used to manipulate and interact with arrays, such as iterating over the elements or transforming the data.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
numbers.forEach((number) => {
  console.log(number);
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
**How it works here**: The `map` method is used to transform the `messages` array into a new array of promises, which are then executed using `Promise.all`.
**Why it's used**: Array methods are used to manipulate and interact with arrays, and execute code for each element.
**If you change/remove it**: If you remove the array method, the program will not be able to manipulate the `messages` array, and the code will not be executed. If you change the array method to a different method, the program will behave differently.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries. They allow you to execute code when the operation is complete.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Operation complete');
});
promise.then((result) => {
  console.log(result);
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
**How it works here**: The `Promise.all` method is used to execute the promises returned by the `map` method, and wait for all of them to complete.
**Why it's used**: Promises are used to handle asynchronous operations, and execute code when the operation is complete.
**If you change/remove it**: If you remove the promise, the program will not be able to handle the asynchronous operation, and the code will not be executed. If you change the promise to a different type of asynchronous operation, the program will behave differently.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises, which allows you to write asynchronous code that looks like synchronous code.
**General Example**
```javascript
async function example() {
  let result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `await` keyword is used to wait for the promises returned by the `map` method to complete, and then execute the code that follows.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain.
**If you change/remove it**: If you remove the async/await syntax, the program will not be able to wait for the promises to complete, and the code will not be executed. If you change the async/await syntax to a different type of asynchronous operation, the program will behave differently.

---
### Concept 8: Destructuring
Destructuring is a syntax feature that allows you to extract values from objects or arrays and assign them to variables.
**General Example**
```javascript
let { name, age } = { name: 'John', age: 25 };
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The destructuring syntax is used to extract the `messages` and `type` values from the object passed to the event listener.
**Why it's used**: Destructuring is used to extract values from objects or arrays and assign them to variables in a concise way.
**If you change/remove it**: If you remove the destructuring syntax, the program will not be able to extract the values from the object, and the variables will not be assigned. If you change the destructuring syntax to a different type of assignment, the program will behave differently.

---
### Concept 9: Template Literals
Template literals are a syntax feature that allows you to embed expressions inside string literals.
**General Example**
```javascript
let name = 'John';
console.log(`Hello, ${name}!`); // Outputs: Hello, John!
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} delete`) {
  // ...
}
```
**How it works here**: The template literal syntax is used to embed the `botConfig.getPrefix().toLowerCase()` expression inside the string literal.
**Why it's used**: Template literals are used to embed expressions inside string literals in a concise way.
**If you change/remove it**: If you remove the template literal syntax, the program will not be able to embed the expression inside the string literal, and the code will not work as expected. If you change the template literal syntax to a different type of string concatenation, the program will behave differently.

---
### Concept 10: Error Handling
Error handling is used to catch and handle errors that occur in a program, such as network errors or database errors.
**General Example**
```javascript
try {
  // Code that may throw an error
} catch (error) {
  console.log(error);
}
```
**In Our Code**
```javascript
try {
  // Try to delete the message
  await sock.sendMessage(chatId, {
    delete: {
      remoteJid: chatId,
      fromMe: false,
      id: contextInfo.stanzaId,
      participant: messageAuthor,
    },
  });
} catch (err) {
  // error logger
}
```
**How it works here**: The try-catch block is used to catch any errors that occur when trying to delete the message.
**Why it's used**: Error handling is used to catch and handle errors that occur in a program, and prevent the program from crashing.
**If you change/remove it**: If you remove the error handling, the program will crash if an error occurs, and the error will not be logged. If you change the error handling to a different type of error handling, the program will behave differently.
