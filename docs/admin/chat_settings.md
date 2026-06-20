# Group Settings Moderation Flow (`welcome` / `setwelcome` / `bye` / `setbye` / `antilink` / `antispam` / `news` / `glock` / `gunlock`)

## 1. Description
These settings moderation commands allow group administrators to customize bot features for the active conversation chat:
- **`welcome` (on/off) / `setwelcome`**: Toggles greeting announcements when a new participant joins, and configures custom welcome message templates (supports tag interpolation like `{user}` or `{group}`).
- **`bye` (on/off) / `setbye`**: Toggles departure notifications when a participant leaves, and configures custom templates.
- **`antilink`**: Enables automatic link filters, deleting invitations, status links, or channel links based on configured actions (`delete`, `warn`, or `kick`).
- **`antispam`**: Restricts rapid message spamming from users.
- **`news`**: Toggles daily automated anime news updates inside the group conversation.
- **`glock` / `gunlock` (Group Lock)**: Restricts message permissions in the group so only admins can chat (or restores public chat access).

---

## 2. Hierarchical Execution Tree
```text
======================================================
⚙️ TOGGLE SETTINGS: User sends ".j welcome on"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: lowerTxt === ".j welcome on/off" (L7605)
            ├── verify isGroupChat (L7611)
            ├── verify canUseAdminCommands (L7617)
            ├── getGroupSettings(chatId) -> fetch active configuration cache Map (L7623)
            ├── Update setting value: settings.welcomeEnabled = true
            ├── Save configurations: saveGroupSettings() (L888) -> writes Map to System collection in DB
            └── sock.sendMessage(chatId, { text: successMsg })

======================================================
📝 CONFIGURE GREETING: User sends ".j setwelcome Hello {user}!"
======================================================
User command
└── core/engine.js
    └── Match check: lowerTxt === ".j setwelcome <msg>" (L7552)
        ├── verify isGroupChat & canUseAdminCommands
        ├── Extract template: txt.substring(commandPrefixLength) (L7580)
        ├── Update setting value: settings.welcomeMessage = welcomeMsg
        ├── saveGroupSettings()
        └── sock.sendMessage(chatId, { text: updateNotice })

======================================================
🛡️ FILTER LINK SPAM: User sends a link while antilink is ON
======================================================
Incoming user message
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Check message contents for link patterns (regex matches http/https/whatsapp)
            ├── Check if sender is group administrator -> Exempt from filter if true
            ├── getGroupSettings(chatId) -> verify antilink === true
            ├── Execute active settings.antilinkAction:
            │   ├── "delete" -> sock.sendMessage(chatId, { delete: m.key })
            │   ├── "warn"   -> addWarning(senderJid, chatId) & delete message
            │   └── "kick"   -> groupParticipantsUpdate(chatId, [senderJid], "remove")
            └── return early
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7552-L7563) / [L7605-L7610](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7605-L7610)
* **Line Numbers**: 7552-7563 (setwelcome) & 7605-7610 (welcome toggle)
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Directs logic to setting mutations

```javascript
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} welcomemessage` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} welcomemessage `,
                    ) ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} setwelcome` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} setwelcome `,
                    )
                  ) {
                      // ... (welcome template assignment)
                  }
```

---

### Step 3: Setting Mutation & Database Write Sync
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7597-L7602)
* **Line Numbers**: 7597-7602
* **Called From**: Setting commands blocks inside `engine.js`
* **Inputs**: Target setting values
* **Outputs**: Updates local settings map, triggers DB sync, replies with receipt

```javascript
                    settings.welcomeMessage = welcomeMsg;
                    saveGroupSettings();

                    return await sock.sendMessage(chatId, {
                      text: BOT_MARKER + `✅ Welcome message updated!`,
                    });
```

#### Explanation
1. Retrieves the active group's configuration object from the `groupSettings` cache Map. If group configurations are missing, `getGroupSettings()` initializes default properties.
2. Updates properties in the settings object (e.g. `settings.welcomeMessage` or `settings.welcomeEnabled`).
3. Calls the database synchronizer `saveGroupSettings()`, which serializes the cache Map using `Object.fromEntries(groupSettings)` and saves it to MongoDB via the `System` model under the key `${BOT_ID}_group_settings`.
4. Emits a configuration success notification back to WhatsApp.

---

## 4. How to Modify
- **Group Settings Default Values**: Edit properties initialized in `getGroupSettings()` at [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L894-L901).
- **Group Settings DB Persistence Key**: Locate the DB loading key `${BOT_ID}_group_settings` in `loadGroupSettings()` at [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L877).
- **Modify Template Interpolation Variables**: Adjust replacement rules where greeting messages are dispatched when users join/leave.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They can be thought of as labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // outputs: John
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: The variables `type` and `isRekeying` are used to store values that are then checked in conditional statements.
**Why it's used**: Variables are used to store values that need to be accessed and manipulated throughout the program.
**If you change/remove it**: If you remove the variables, the program will not be able to store and access the values, and the conditional statements will not work as expected.

---
### Concept 2: Event Listeners
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
**How it works here**: The event listener is used to respond to the "messages.upsert" event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to handle events that occur in a program and respond accordingly.
**If you change/remove it**: If you remove the event listener, the program will not be able to respond to the "messages.upsert" event, and the code inside the listener will not be executed.

---
### Concept 3: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions.
**General Example**
```javascript
let add = (a, b) => a + b;
console.log(add(2, 3)); // outputs: 5
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The arrow function is used to define a small function that is executed when the "messages.upsert" event is triggered.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used as event listeners or as arguments to other functions.
**If you change/remove it**: If you remove the arrow function, the event listener will not be able to execute the code inside the function, and the program will not be able to respond to the "messages.upsert" event.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions.
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
if (isRekeying) return;
```
**How it works here**: The conditional statements are used to check the values of `type` and `isRekeying` and execute different blocks of code based on the conditions.
**Why it's used**: Conditional statements are used to make decisions in a program and execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove the conditional statements, the program will not be able to make decisions based on the values of `type` and `isRekeying`, and the code will not be executed as expected.

---
### Concept 5: Array Methods
Array methods are used to manipulate and interact with arrays.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
numbers.map((num) => num * 2); // returns: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` method is used to iterate over the `messages` array and execute a block of code for each element.
**Why it's used**: Array methods are used to manipulate and interact with arrays, such as iterating over elements, filtering elements, and transforming elements.
**If you change/remove it**: If you remove the `map` method, the program will not be able to iterate over the `messages` array and execute the block of code for each element.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and ensure that code is executed in the correct order.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Operation complete!');
});
promise.then((result) => console.log(result)); // outputs: Operation complete!
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `Promise.all` method is used to wait for all the promises in the `messages` array to resolve before executing the next block of code.
**Why it's used**: Promises are used to handle asynchronous operations and ensure that code is executed in the correct order.
**If you change/remove it**: If you remove the `Promise.all` method, the program will not be able to wait for all the promises in the `messages` array to resolve, and the code may not be executed in the correct order.

---
### Concept 7: String Comparison
String comparison is used to compare two strings and determine if they are equal or not.
**General Example**
```javascript
let str1 = 'hello';
let str2 = 'hello';
if (str1 === str2) {
  console.log('The strings are equal!');
} else {
  console.log('The strings are not equal!');
}
```
**In Our Code**
```javascript
if (
  lowerTxt ===
    `${botConfig.getPrefix().toLowerCase()} welcomemessage` ||
  lowerTxt.startsWith(
    `${botConfig.getPrefix().toLowerCase()} welcomemessage `,
  ) ||
  lowerTxt ===
    `${botConfig.getPrefix().toLowerCase()} setwelcome` ||
  lowerTxt.startsWith(
    `${botConfig.getPrefix().toLowerCase()} setwelcome `,
  )
) {
  // ...
}
```
**How it works here**: The string comparison is used to compare the `lowerTxt` string with other strings and determine if they are equal or not.
**Why it's used**: String comparison is used to make decisions in a program based on the values of strings.
**If you change/remove it**: If you remove the string comparison, the program will not be able to make decisions based on the values of strings, and the code will not be executed as expected.

---
### Concept 8: Template Literals
Template literals are used to create strings that can contain expressions and variables.
**General Example**
```javascript
let name = 'John';
let age = 25;
let str = `My name is ${name} and I am ${age} years old.`;
console.log(str); // outputs: My name is John and I am 25 years old.
```
**In Our Code**
```javascript
if (
  lowerTxt ===
    `${botConfig.getPrefix().toLowerCase()} welcomemessage` ||
  lowerTxt.startsWith(
    `${botConfig.getPrefix().toLowerCase()} welcomemessage `,
  ) ||
  lowerTxt ===
    `${botConfig.getPrefix().toLowerCase()} setwelcome` ||
  lowerTxt.startsWith(
    `${botConfig.getPrefix().toLowerCase()} setwelcome `,
  )
) {
  // ...
}
```
**How it works here**: The template literals are used to create strings that contain expressions and variables, such as `botConfig.getPrefix().toLowerCase()`.
**Why it's used**: Template literals are used to create strings that can contain expressions and variables, making it easier to create dynamic strings.
**If you change/remove it**: If you remove the template literals, the program will not be able to create strings that contain expressions and variables, and the code will not be executed as expected.

---
### Concept 9: Destructuring
Destructuring is used to extract values from objects and arrays and assign them to variables.
**General Example**
```javascript
let obj = { name: 'John', age: 25 };
let { name, age } = obj;
console.log(name); // outputs: John
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The destructuring is used to extract the `messages` and `type` values from the object passed to the event listener.
**Why it's used**: Destructuring is used to extract values from objects and arrays and assign them to variables, making it easier to access and manipulate the values.
**If you change/remove it**: If you remove the destructuring, the program will not be able to extract the `messages` and `type` values from the object, and the code will not be executed as expected.

---
### Concept 10: Async/Await
Async/await is used to handle asynchronous operations and make the code look synchronous.
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
**How it works here**: The async/await is used to handle the asynchronous operation of waiting for the promises in the `messages` array to resolve.
**Why it's used**: Async/await is used to handle asynchronous operations and make the code look synchronous, making it easier to read and maintain.
**If you change/remove it**: If you remove the async/await, the program will not be able to handle the asynchronous operation, and the code will not be executed as expected.

---
### Concept 11: Object Properties
Object properties are used to access and manipulate the values of an object.
**General Example**
```javascript
let obj = { name: 'John', age: 25 };
console.log(obj.name); // outputs: John
console.log(obj.age); // outputs: 25
```
**In Our Code**
```javascript
settings.welcomeMessage = welcomeMsg;
```
**How it works here**: The object property `welcomeMessage` is used to access and manipulate the value of the `settings` object.
**Why it's used**: Object properties are used to access and manipulate the values of an object, making it easier to work with objects.
**If you change/remove it**: If you remove the object property, the program will not be able to access and manipulate the value of the `settings` object, and the code will not be executed as expected.

---
### Concept 12: Function Calls
Function calls are used to execute a function and pass arguments to it.
**General Example**
```javascript
function example(name) {
  console.log(`Hello, ${name}!`);
}
example('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
return await sock.sendMessage(chatId, {
  text: BOT_MARKER + ` Welcome message updated!`,
});
```
**How it works here**: The function call `sock.sendMessage` is used to execute the `sendMessage` function and pass arguments to it.
**Why it's used**: Function calls are used to execute a function and pass arguments to it, making it easier to reuse code and perform actions.
**If you change/remove it**: If you remove the function call, the program will not be able to execute the `sendMessage` function, and the code will not be executed as expected.
