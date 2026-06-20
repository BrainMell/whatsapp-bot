# Admin Subsystem: Security & Spam Controls

## What it is

The Security and Spam Controls subsystem intercepts group messages to enforce chat rules, detect links, block malicious status mentions, and apply auto-moderation penalties. It allows groups to prevent unauthorized external links, WhatsApp channel advertisements, group invite links, and broadcast/status mention exploits. When violations occur, the bot deletes the message and issues warnings or removes (kicks) the offending user based on group preferences.

---

## How it works

**Moderation Guard and Admin Bypass** — [`security.js` L11–50](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/security.js#L11-L50)

```javascript
// core/utils/security.js L11–50
handleSecurity: async function(sock, msg, groupSettings, addWarning, getWarningCount, cachedMetadata = null, cachedAdminSet = null) {
    try {
        if (!msg || !msg.message) return;
        const chatId = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        // Only work in group chats
        if (!chatId.endsWith('@g.us')) return;

        // Get group settings
        const settings = groupSettings.get(chatId);
        if (!settings || !settings.antilink) return;

        // Get group metadata (prefer cached)
        const groupMetadata = cachedMetadata || await sock.groupMetadata(chatId).catch(() => null);
        if (!groupMetadata) return;

        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const lidResolver = require('./lidResolver');
        const botConfig = require('../botConfig');
        const authPath = botConfig.getAuthPath();

        const normalizedSender = jidNormalizedUser(sender);
        const senderPhone = lidResolver.resolveToPhone(normalizedSender, authPath);
        const resolvedSender = lidResolver.resolveLidToPhone(normalizedSender, authPath);

        // O(1) admin check using pre-built Set from engine.js (avoids loop over 1k participants)
        let senderIsAdmin = false;
        if (cachedAdminSet) {
            senderIsAdmin = cachedAdminSet.has(senderPhone) || cachedAdminSet.has(normalizedSender);
        } else {
            // Fallback: linear scan (only if Set wasn't passed in)
            senderIsAdmin = groupMetadata.participants.some(
                p => {
                    const normalizedParticipant = jidNormalizedUser(p.id);
                    return lidResolver.resolveToPhone(normalizedParticipant, authPath) === senderPhone && (p.admin === 'admin' || p.admin === 'superadmin');
                }
            );
        }
```

This entry point checks if the message was sent in a group chat with the `antilink` security setting enabled. It checks if the sender is an admin or the bot owner using an $O(1)$ pre-cached Set of administrator numbers. If they are an admin, the scanner immediately returns, bypassing security scans.

---

**Antilink & Status Mention Interceptor** — [`security.js` L102–143](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/security.js#L102-L143)

```javascript
// core/utils/security.js L102–143
const allText = extractAllText(msg.message).join(' ');
const lowerText = allText.toLowerCase();

// 🎯 3. STATUS CHECKS (Text & Mentioned JIDs)
if (lowerText.includes('@status') || lowerText.includes('@broadcast') || lowerText.includes('status@broadcast')) {
    violations.push('📢 status mention');
}

const contextInfo = msg.message.extendedTextMessage?.contextInfo || 
                     msg.message.imageMessage?.contextInfo || 
                     msg.message.videoMessage?.contextInfo ||
                     msg.message.documentMessage?.contextInfo;

if (contextInfo) {
    const mentionedJids = contextInfo.mentionedJid || [];
    if (mentionedJids.some(jid => jid.includes('status@broadcast') || jid.includes('broadcast'))) {
        violations.push('📢 status mention');
    }
    
    // Group Mentions
    if (contextInfo.groupMentions?.some(gm => (gm.groupJid || gm) === chatId)) {
        violations.push('📢 group status mention');
    }

    // Check externalAdReply (sometimes contains links)
    if (contextInfo.externalAdReply) {
        const ad = contextInfo.externalAdReply;
        const adText = (ad.title || '') + ' ' + (ad.body || '') + ' ' + (ad.sourceUrl || '');
        if (/(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel)/gi.test(adText)) {
            violations.push('🔗 link (ad)');
        }
    }
}

// 🎯 4. COMPREHENSIVE LINK DETECTION
// This regex covers: http/https, www, group invites, wa.me, and channels
const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel\/)[^\s]{2,}/gi;
if (linkRegex.test(allText)) {
    if (allText.includes('chat.whatsapp.com')) violations.push('👥 group invite');
    else if (allText.includes('whatsapp.com/channel')) violations.push('📺 channel link');
    else violations.push('🔗 link');
}
```

The message contents are flattened to raw strings and recursively searched. The algorithm checks text content, mentioned JIDs, and `externalAdReply` preview payloads to detect `@status` broadcast mentions or links. When regex patterns detect URLs, it classifies the violation (e.g. `group invite`, `channel link`, or `link`).

---

**Auto Action Penalties** — [`security.js` L149–180](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/security.js#L149-L180)

```javascript
// core/utils/security.js L149–180
if (violations.length > 0) {
    const violationType = [...new Set(violations)].join(', ');
    const userName = resolvedSender.split('@')[0];
    const action = settings.antilinkAction || 'delete';

    // Delete first
    try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}

    // Warn/Kick logic
    let warningCount = 0;
    if (addWarning && getWarningCount) {
        warningCount = addWarning(resolvedSender, chatId, `Antilink violation: ${violationType}`);
    }

    const participantJid = groupMetadata.participants.find(
        p => lidResolver.resolveToPhone(jidNormalizedUser(p.id), authPath) === senderPhone
    )?.id || normalizedSender;

    if (action === 'kick') {
        const kickMsg = `*🚨 ANTILINK VIOLATION 🚨*\n\n*User:* @${userName}\n*Type:* ${violationType}\n*Action:* REMOVED`;
        await sock.sendMessage(chatId, { text: kickMsg, contextInfo: { mentionedJid: [participantJid] } });
        setTimeout(() => sock.groupParticipantsUpdate(chatId, [participantJid], 'remove').catch(() => {}), 1000);
    } 
    else if (action === 'warn') {
        const strike = '⚠️'.repeat(Math.min(warningCount, 3));
        const warnMsg = `*${strike} WARNING ${strike}*\n\n*User:* @${userName}\n*Type:* ${violationType}\n*Count:* ${warningCount}/3\n\n_Don't send links or mention status._`;
        await sock.sendMessage(chatId, { text: warnMsg, contextInfo: { mentionedJid: [participantJid] } });
        if (warningCount >= 3) {
            setTimeout(() => sock.groupParticipantsUpdate(chatId, [participantJid], 'remove').catch(() => {}), 2000);
        }
    }
}
```

If violations are present, the bot issues a Baileys deletion command. It then queries the configured punishment action (`warn` or `kick`). The warn branch logs warnings to MongoDB and kicks the user on the 3rd strike, while the kick branch executes user removal immediately.

---

## How to modify it

**Whitelisting a specific domain:**
To prevent the antilink filter from triggering on links from a specific domain (e.g. `youtube.com` or `mywebsite.com`), add a bypass check in the link scanner block in `core/utils/security.js` at line 139:

```javascript
// BEFORE
if (linkRegex.test(allText)) {

// AFTER: Bypass checks if the message includes white-listed domains
if (linkRegex.test(allText) && !allText.includes('youtube.com') && !allText.includes('youtu.be')) {
```

**Changing the warn kick threshold:**
To change how many warnings are allowed before a user is removed under the `warn` action, modify line 176:

```javascript
// BEFORE
if (warningCount >= 3) { ... }

// AFTER: Allow 5 warnings instead of 3
if (warningCount >= 5) { ... }
```

---

## Common tasks

- **Change punishment type (delete/warn/kick)** — Edit the `antilinkAction` field inside group settings documents in MongoDB.
- **Whitelist a domain** — Add domain bypass checks at [security.js L139](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/security.js#L139).
- **Modify status mention detection regex** — Edit the broadcast check conditionals at [security.js L106](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/security.js#L106).
- **Configure anti-spam warn threshold** — Edit warning limit conditionals at [security.js L176](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/security.js#L176).
- **Add custom warning text** — Modify `warnMsg` at [security.js L174](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/security.js#L174).










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
const chatId = msg.key.remoteJid;
const sender = msg.key.participant || msg.key.remoteJid;
```
**How it works here**: In the provided code snippets, variables are used to store values such as `chatId` and `sender`. These values are then used throughout the code to make decisions and perform actions.
**Why it's used**: Variables are used to make the code more readable and maintainable. Instead of repeating the same value multiple times, you can store it in a variable and use the variable name.
**If you change/remove it**: If you remove the variables, the code will not be able to store and use the values, which will cause errors. If you change the variable names, you will need to update all references to the variable in the code.

---
### Concept 2: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They allow you to execute different blocks of code depending on whether a condition is true or false.
**General Example**
```javascript
let age = 25;
if (age > 18) {
  console.log('You are an adult');
} else {
  console.log('You are a minor');
}
```
**In Our Code**
```javascript
if (!msg || !msg.message) return;
if (!chatId.endsWith('@g.us')) return;
if (linkRegex.test(allText)) {
  // code to handle link detection
}
```
**How it works here**: In the provided code snippets, conditional statements are used to check conditions such as whether a message exists, whether the chat is a group chat, and whether a link is detected in the message. Based on these conditions, the code executes different blocks of code.
**Why it's used**: Conditional statements are used to make the code more flexible and dynamic. They allow you to handle different scenarios and make decisions based on changing conditions.
**If you change/remove it**: If you remove the conditional statements, the code will not be able to make decisions and will execute the same block of code regardless of the conditions. If you change the conditions, you will need to update the code to handle the new conditions.

---
### Concept 3: Functions
Functions are reusable blocks of code that perform a specific task. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
handleSecurity: async function(sock, msg, groupSettings, addWarning, getWarningCount, cachedMetadata = null, cachedAdminSet = null) {
  // code to handle security
}
```
**How it works here**: In the provided code snippets, functions are used to perform tasks such as handling security and sending messages. The `handleSecurity` function takes several arguments and performs a series of tasks to handle security.
**Why it's used**: Functions are used to make the code more modular and reusable. They allow you to break down complex tasks into smaller, manageable blocks of code.
**If you change/remove it**: If you remove the functions, the code will not be able to perform the tasks and will cause errors. If you change the function names or arguments, you will need to update all references to the function in the code.

---
### Concept 4: Imports
Imports are used to bring in external code or modules into your program. They allow you to use functions, variables, and classes from other files or libraries.
**General Example**
```javascript
const math = require('mathjs');
console.log(math.add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const lidResolver = require('./lidResolver');
const botConfig = require('../botConfig');
```
**How it works here**: In the provided code snippets, imports are used to bring in external modules such as `@whiskeysockets/baileys`, `lidResolver`, and `botConfig`. These modules provide functions and variables that are used in the code.
**Why it's used**: Imports are used to make the code more modular and reusable. They allow you to use external code and libraries without having to duplicate the code.
**If you change/remove it**: If you remove the imports, the code will not be able to use the external modules and will cause errors. If you change the import statements, you will need to update the code to use the new modules or functions.

---
### Concept 5: Array Methods
Array methods are used to perform operations on arrays, such as iterating over the elements, filtering, and mapping.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
numbers.forEach((number) => {
  console.log(number);
});
```
**In Our Code**
```javascript
const mentionedJids = contextInfo.mentionedJid || [];
if (mentionedJids.some(jid => jid.includes('status@broadcast') || jid.includes('broadcast'))) {
  violations.push('📢 status mention');
}
```
**How it works here**: In the provided code snippets, array methods such as `some` are used to iterate over the elements of the `mentionedJids` array and check if any of the elements match a certain condition.
**Why it's used**: Array methods are used to make the code more concise and efficient. They allow you to perform operations on arrays without having to use loops.
**If you change/remove it**: If you remove the array methods, the code will not be able to perform the operations on the arrays and will cause errors. If you change the array methods, you will need to update the code to use the new methods or functions.

---
### Concept 6: Regular Expressions
Regular expressions are used to match patterns in strings. They allow you to search for and validate strings based on certain rules.
**General Example**
```javascript
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
console.log(emailRegex.test('john@example.com')); // Outputs: true
```
**In Our Code**
```javascript
const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel\/)[^\s]{2,}/gi;
if (linkRegex.test(allText)) {
  // code to handle link detection
}
```
**How it works here**: In the provided code snippets, regular expressions are used to match patterns in strings, such as links in the `allText` string.
**Why it's used**: Regular expressions are used to make the code more flexible and powerful. They allow you to search for and validate strings based on complex rules.
**If you change/remove it**: If you remove the regular expressions, the code will not be able to match patterns in strings and will cause errors. If you change the regular expressions, you will need to update the code to use the new patterns.

---
### Concept 7: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries. They allow you to write code that is easier to read and maintain.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // code to perform asynchronous operation
  resolve('result');
});
promise.then((result) => {
  console.log(result);
});
```
**In Our Code**
```javascript
const groupMetadata = cachedMetadata || await sock.groupMetadata(chatId).catch(() => null);
```
**How it works here**: In the provided code snippets, promises are used to handle asynchronous operations, such as retrieving group metadata.
**Why it's used**: Promises are used to make the code more readable and maintainable. They allow you to write code that is easier to understand and debug.
**If you change/remove it**: If you remove the promises, the code will not be able to handle asynchronous operations and will cause errors. If you change the promises, you will need to update the code to use the new promises or functions.

---
### Concept 8: Destructuring
Destructuring is used to extract values from objects or arrays and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 30 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**
```javascript
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
```
**How it works here**: In the provided code snippets, destructuring is used to extract values from objects, such as the `jidNormalizedUser` function from the `@whiskeysockets/baileys` module.
**Why it's used**: Destructuring is used to make the code more concise and readable. It allows you to extract values from objects or arrays and assign them to variables in a single line of code.
**If you change/remove it**: If you remove the destructuring, the code will not be able to extract values from objects or arrays and will cause errors. If you change the destructuring, you will need to update the code to use the new variables or functions.

---
### Concept 9: Async/Await
Async/await is used to write asynchronous code that is easier to read and maintain. It allows you to write code that is asynchronous, but looks synchronous.
**General Example**
```javascript
async function example() {
  const result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
handleSecurity: async function(sock, msg, groupSettings, addWarning, getWarningCount, cachedMetadata = null, cachedAdminSet = null) {
  // code to handle security
}
```
**How it works here**: In the provided code snippets, async/await is used to write asynchronous code that is easier to read and maintain. The `handleSecurity` function is an async function that uses await to wait for promises to resolve.
**Why it's used**: Async/await is used to make the code more readable and maintainable. It allows you to write asynchronous code that is easier to understand and debug.
**If you change/remove it**: If you remove the async/await, the code will not be able to handle asynchronous operations and will cause errors. If you change the async/await, you will need to update the code to use the new async/await syntax or functions.

---
### Concept 10: Set Data Structure
A Set is a data structure that stores unique values. It is used to keep track of unique elements, such as a set of admin users.
**General Example**
```javascript
const adminSet = new Set();
adminSet.add('john');
adminSet.add('jane');
console.log(adminSet.size); // Outputs: 2
```
**In Our Code**
```javascript
let senderIsAdmin = false;
if (cachedAdminSet) {
  senderIsAdmin = cachedAdminSet.has(senderPhone) || cachedAdminSet.has(normalizedSender);
}
```
**How it works here**: In the provided code snippets, a Set is used to store unique admin users. The `cachedAdminSet` is used to check if a user is an admin.
**Why it's used**: A Set is used to make the code more efficient. It allows you to keep track of unique elements and check if an element exists in constant time.
**If you change/remove it**: If you remove the Set, the code will not be able to keep track of unique admin users and will cause errors. If you change the Set, you will need to update the code to use the new Set or data structure.
