# Member Management Moderation Flow (`kick` / `promote` / `demote` / `mute` / `unmute` / `warn` / `warnings` / `resetwarn`)

## 1. Description
These moderation commands allow group administrators to manage participants:
- **`kick`**: Instantly removes a target player from the group.
- **`promote` / `demote`**: Promotes a user to group administrator or demotes an admin back to a regular member.
- **`mute` / `unmute`**: Mutes a member for a parsed duration (e.g. `10s`, `5m`, `1h`), automatically deleting any messages they send until unmuted.
- **`warn` / `warnings` / `resetwarn`**: Adds a warning to a participant (5 warnings results in an automatic kick). Users can check active warnings or admins can reset them.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🥾 KICK MEMBER: User sends ".j kick @user"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: primaryCmd === "kick" (L7132)
            ├── verify canUseAdminCommands (caller must be admin)
            ├── verify botIsAdmin (bot must be admin in group)
            ├── targetUser = getMentionOrReply(m)
            ├── group participants update: sock.groupParticipantsUpdate(chatId, [targetUser], "remove")
            └── sock.sendMessage(chatId, { text: confirmationMsg })

======================================================
⚠️ WARN MEMBER: User sends ".j warn @user spamming"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "warn" (L7917)
        ├── verify canUseAdminCommands
        ├── targetUser = getMentionOrReply(m)
        ├── Extract reason string (removes command & mentions)
        ├── addWarning(targetUser, chatId, reason) -> increment warnings map & save (L7950)
        ├── Send warning notice: `${warnCount}/5 warnings`
        ├── If warnCount >= 5:
        │   ├── sock.groupParticipantsUpdate(chatId, [targetUser], "remove") (L7965)
        │   └── send auto-kick notice
        └── return

======================================================
🔇 MUTE MEMBER: User sends ".j mute @user 1h"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "mute" (L8192)
        ├── verify canUseAdminCommands
        ├── targetUser = getMentionOrReply(m)
        ├── verify targetUser is not self / owner / global mod (L8225-8244)
        ├── parseDuration(arg) -> duration in milliseconds (L8267)
        ├── muteUser(targetUser, chatId, duration) -> save to active mutes
        └── Send muted confirmation message
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7132) (kick) / [L7917](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7917) (warn) / [L8192](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L8192) (mute)
* **Line Numbers**: 7132, 7917, 8192
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Executes target moderation block

```javascript
                  // .j kick
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} kick` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} kick ` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} kick `,
                    )
                  ) {
                    if (!canUseAdminCommands) {
                      await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Admin only!` });
                      return;
                    }
                    // ... (kick execution)
                  }
```

---

### Step 3: Executing Action via Baileys API
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7140-L7170)
* **Line Numbers**: 7140-7170
* **Called From**: `kick` command branch inside `engine.js`
* **Inputs**: JID targets
* **Outputs**: Socket request to remove user from WhatsApp group participants

```javascript
                    const targetUser = getMentionOrReply(m);
                    if (targetUser) {
                      if (!botIsAdmin) {
                        await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ I need to be an admin to kick users!" });
                        return;
                      }
                      
                      await sock.groupParticipantsUpdate(
                        chatId,
                        [targetUser],
                        "remove",
                      );
                      await sock.sendMessage(chatId, { text: BOT_MARKER + "✅ User removed." });
                    }
```

#### Explanation
1. Resolves the target participant JID from mentioned tags or the quoted reply message JID using `getMentionOrReply(m)`.
2. Validates that the bot possesses administrator privileges (`botIsAdmin`). If not, tells the user.
3. Invokes the socket Baileys client helper `groupParticipantsUpdate(chatId, [targetUser], "remove")` to request participant removal from the WhatsApp server.
4. Delivers confirmation text.

---

### Step 4: Warning Strike Persistence & Auto-Kick Gate
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7950-L7970)
* **Line Numbers**: 7950-7970
* **Called From**: `warn` command block
* **Inputs**: Target JID, chat room JID, reason string
* **Outputs**: Increments warning count, executes kick if strikes limit (5) is reached

```javascript
                      const warnCount = addWarning(targetUser, chatId, reason);
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `⚠️️ @${targetPhone} has been warned (${warnCount}/5 in THIS group)\n\n*Reason:* ${reason}`,
                        contextInfo: { mentionedJid: [targetUser] },
                      });

                      // if 5 warnings IN THIS GROUP, kick them out
                      if (warnCount >= 5 && botIsAdmin) {
                        await sock.sendMessage(chatId, {
                          text:
                            BOT_MARKER +
                            "5 warnings reached in this group. removing...",
                        });
                        await sock.groupParticipantsUpdate(
                          chatId,
                          [targetUser],
                          "remove",
                        );
                      }
```

#### Explanation
1. Calls the local helper function `addWarning()`, which saves a warning log containing the reason and timestamp in the `userWarnings` Map.
2. Invokes `saveUserWarnings()` to synchronize changes back to the MongoDB `System` collection under the configuration key `${BOT_ID}_user_warnings`.
3. If the warning count matches or exceeds the threshold (5), and the bot is admin, it triggers a participant update to remove the user.

---

## 4. How to Modify
- **Warnings Strike Limit**: Edit the threshold check value `5` at [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7959) and the description labels.
- **Warnings DB Persistence Key**: Locate the DB loading key `${BOT_ID}_user_warnings` in `loadUserWarnings()` at [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L953).
- **Modify Warning/Kick Messages**: Edit the response text strings in the respective command branches.










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
const targetUser = getMentionOrReply(m);
```
**How it works here**: The `targetUser` variable is used to store the result of the `getMentionOrReply(m)` function, which returns the user to be kicked or warned.
**Why it's used**: Variables are used to store values that need to be used later in the program, making the code more readable and efficient.
**If you change/remove it**: If you remove the `targetUser` variable, the code will not be able to store the result of the `getMentionOrReply(m)` function, and the program will not be able to kick or warn the user.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` symbol.
**General Example**
```javascript
let greet = (name) => { console.log(`Hello, ${name}!`); };
greet('John'); // outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The arrow function is used to define a callback function that will be executed when the `messages.upsert` event is triggered.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be passed as arguments to other functions or used as event handlers.
**If you change/remove it**: If you remove the arrow function, the code will not be able to handle the `messages.upsert` event, and the program will not be able to process incoming messages.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program, such as user interactions or network requests. They are defined using the `on` method.
**General Example**
```javascript
document.addEventListener('click', () => { console.log('Clicked!'); });
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events that occur in a program, allowing the program to react to user interactions or network requests.
**If you change/remove it**: If you remove the event listener, the code will not be able to respond to the `messages.upsert` event, and the program will not be able to process incoming messages.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions in a program based on conditions or rules. They are defined using the `if` and `else` keywords.
**General Example**
```javascript
let age = 25;
if (age >= 18) { console.log('You are an adult.'); } else { console.log('You are a minor.'); }
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
```
**How it works here**: The conditional statement is used to check if the `type` variable is not equal to "notify" or "append", and if so, the function returns immediately.
**Why it's used**: Conditional statements are used to make decisions in a program based on conditions or rules, allowing the program to react differently to different situations.
**If you change/remove it**: If you remove the conditional statement, the code will not be able to filter out unwanted message types, and the program may process messages that it should not.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays in a program. They are defined using methods such as `map`, `filter`, and `reduce`.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` method is used to transform the `messages` array into a new array of promises, which are then awaited using the `Promise.all` method.
**Why it's used**: Array methods are used to manipulate and transform arrays in a program, allowing the program to perform complex operations on data.
**If you change/remove it**: If you remove the `map` method, the code will not be able to transform the `messages` array into a new array of promises, and the program will not be able to process the messages.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations in a program, allowing the program to wait for the completion of an operation before continuing.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  setTimeout(() => { resolve('Hello, world!'); }, 2000);
});
promise.then((message) => { console.log(message); });
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `Promise.all` method is used to wait for the completion of all the promises in the `messages` array, allowing the program to process the messages asynchronously.
**Why it's used**: Promises are used to handle asynchronous operations in a program, allowing the program to wait for the completion of an operation before continuing.
**If you change/remove it**: If you remove the `Promise.all` method, the code will not be able to wait for the completion of the promises in the `messages` array, and the program may not process the messages correctly.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that allows you to write asynchronous code that looks and feels like synchronous code.
**General Example**
```javascript
async function greet() {
  let message = await new Promise((resolve, reject) => {
    setTimeout(() => { resolve('Hello, world!'); }, 2000);
  });
  console.log(message);
}
greet();
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The `async` keyword is used to define an asynchronous function that can use the `await` keyword to wait for the completion of promises.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain, allowing the program to wait for the completion of operations before continuing.
**If you change/remove it**: If you remove the `async` keyword, the code will not be able to use the `await` keyword, and the program may not be able to wait for the completion of operations correctly.

---
### Concept 8: Destructuring
Destructuring is a syntax feature that allows you to extract values from arrays or objects and assign them to variables.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The destructuring syntax is used to extract the `messages` and `type` values from the object passed to the event listener.
**Why it's used**: Destructuring is used to extract values from arrays or objects and assign them to variables, making the code more concise and readable.
**If you change/remove it**: If you remove the destructuring syntax, the code will not be able to extract the `messages` and `type` values from the object, and the program may not be able to process the event correctly.

---
### Concept 9: String Methods
String methods are used to manipulate and transform strings in a program. They are defined using methods such as `toLowerCase`, `startsWith`, and `includes`.
**General Example**
```javascript
let text = 'Hello, world!';
console.log(text.toLowerCase()); // outputs: hello, world!
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} kick`) {
  // ...
}
```
**How it works here**: The `toLowerCase` method is used to convert the `botConfig.getPrefix()` value to lowercase, allowing the program to compare it with the `lowerTxt` value.
**Why it's used**: String methods are used to manipulate and transform strings in a program, allowing the program to perform complex operations on text data.
**If you change/remove it**: If you remove the `toLowerCase` method, the code will not be able to compare the `botConfig.getPrefix()` value with the `lowerTxt` value correctly, and the program may not be able to process the command correctly.

---
### Concept 10: Object Properties
Object properties are used to access and manipulate the values of an object.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // outputs: John
```
**In Our Code**
```javascript
if (!botIsAdmin) {
  await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ I need to be an admin to kick users!" });
  return;
}
```
**How it works here**: The `botIsAdmin` property is used to access the value of the `botIsAdmin` variable, which is used to determine whether the bot has admin privileges.
**Why it's used**: Object properties are used to access and manipulate the values of an object, allowing the program to perform complex operations on data.
**If you change/remove it**: If you remove the `botIsAdmin` property, the code will not be able to access the value of the `botIsAdmin` variable, and the program may not be able to determine whether the bot has admin privileges correctly.
