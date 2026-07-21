# Admin Subsystem: Commands & Moderation Controls

## What it is

The Admin and Moderation Controls subsystem provides group moderators, global bot moderators, and the bot owner with command interfaces to regulate chat groups and manage user warnings, strikes, participant permissions, and bot state overrides. Moderation commands allow for warning users (auto-kicking upon reaching warning limits), global moderator configuration, group locks, database resets, and administrative wipes.

---

## How it works

**Group Warnings and Auto-Kick** — [`engine.js` L7952–7989](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7952-L7989)

```javascript
// core/engine.js L7952–7989
const targetUser = getMentionOrReply(m);
if (targetUser) {
  // Remove command and mention from text to get reason
  let reason = txt
    .replace(
      new RegExp(`^.*?${botConfig.getPrefix()} warn`, "i"),
      "",
    )
    .trim();
  // Remove the target user mention if it exists in the string
  const targetPhone = targetUser.split("@")[0];
  reason = reason
    .replace(new RegExp(`@${targetPhone}`, "g"), "")
    .trim();

  if (!reason) reason = "No reason provided";

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
}
```

This snippet handles issuing warning strikes to group members. When a moderator calls `/warn @user <reason>`, it extracts the targeted JID, increments their strike count using `addWarning()`, and saves the strike to MongoDB. If they reach 5 strikes in the group, and the bot has admin permissions, the bot automatically sends a Baileys request to remove the participant.

---

**Warning Strike Storage and Resets** — [`engine.js` L995–1017](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L995-L1017)

```javascript
// core/engine.js L995–1017
function addWarning(userId, groupId, reason) {
  const key = userId + "_" + groupId;
  if (!userWarnings.has(key)) {
    userWarnings.set(key, []);
  }
  userWarnings.get(key).push({
    reason,
    timestamp: Date.now()
  });
  saveUserWarnings();
  return userWarnings.get(key).length;
}

function resetWarnings(userId, groupId) {
  const key = userId + "_" + groupId;
  userWarnings.delete(key);
  saveUserWarnings();
}
```

Warnings are mapped in a key-value format utilizing a combination of `userId` and `groupId` to track group-specific strikes. `addWarning` appends a structured record (including reason and timestamp) into the cached collection, while `resetWarnings` deletes the key and writes changes back to the system settings document in MongoDB.

---

**Owner-Only Gating (Moderator & Block Administration)** — [`engine.js` L7233–7257](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7233-L7257)

```javascript
// core/engine.js L7233–7257
if (
  lowerTxt.startsWith(
    `${botConfig.getPrefix().toLowerCase()} addmod`,
  )
) {
  if (!isOwner) {
    return await sock.sendMessage(chatId, {
      text:
        BOT_MARKER +
        "❌ Only the owner can add global moderators.",
    });
  }
  const target = getMentionOrReply(m);
  addGlobalMod(target);
}
```

This gating mechanism controls the following administrative commands:
- **`addmod` / `delmod`**: Add or delete global bot moderators (Owner OR global mod — global mods can manage other global mods).
- **`block` / `unblock`**: Prevent users from using bot commands, or lift the command block.
- **`cardmod`**: Add or delete card moderators (Owner OR global mod) for approving eshop deck listings.
- **`t2edeck`**: Manage the eShop event-card deck — add/remove slots, set prices, clear (Owner OR global mod).
- **`event start/stop`**: Start or stop the token event (Owner OR global mod).
- **`setprice`**: Set the zeni price of an eShop slot (Owner OR global mod).
- **`updateall`**: Broadcast a custom message to every enabled chat (Owner OR global mod).

As of audit Task ID 2, global mods are owner-equivalent across all of these commands. Global mods also bypass antispam detection and gambling-command cooldowns (same as owner).

---

**GM Admin Console & RPG Moderation Console** — [`core/commands/adminConsole.js`](file:///home/mellow/Desktop/Projects/Joker/whatsapp-bot/core/commands/adminConsole.js)

The RPG GM Admin Console allows owners, global moderators, and RPG moderators to perform administrative actions on player accounts and manage or test game content.

### Entry Points & Permission Gating
- Command Prefix: `.j` (or the configured bot prefix)
- Entry Command: `.j mod <subcommand>` (permission level: Owner, Global Mod, RPG Mod)
- Aliases: `.j modcom`, `.j admin`, `.j admin <subcommand>`
- Lightweight self class switch: `.j modclass <class_name_or_id>` (permission level: Owner, Global Mod, RPG Mod)

### Targeting Modes
When executing player commands, the target user can be specified in three ways:
1. **@mention**: Tag the target user (e.g. `.j admin setlevel @friend 50`).
2. **Quoted Reply**: Reply to a message sent by the target user and omit the mention (e.g. `.j admin setlevel 50`).
3. **Self-Targeting**: Omit both mention and quoted reply to target your own account (e.g. `.j admin setlevel 50` targets the mod running the command).

### Available Admin Console Commands

| Category | Command Syntax | Description | Example |
| :--- | :--- | :--- | :--- |
| **Player Management** | `setlevel <@user> <1-100>` | Directly sets user level, recalculates level XP, and awards stat points. | `.j admin setlevel 75` |
| | `setstat <@user> <stat> <value>` | Manually sets an individual stat (`hp`, `atk`, `def`, `mag`, `spd`, `luck`, `crit`). | `.j admin setstat @friend hp 5000` |
| | `setwallet <@user> <amount>` | Sets the player's wallet balance directly. | `.j admin setwallet 100000` |
| | `giveitem <@user> <item_name> [qty]` | Gives the specified item by name or ID. Default quantity is 1. | `.j admin giveitem legendary_enhancement_stone 10` |
| | `takeitem <@user> <item_name> [qty]` | Removes the specified quantity of an item from the player's bag. | `.j admin takeitem @friend healing_potion 5` |
| | `giveskill <@user> <skill_name> [level]` | Grants a skill directly, bypassing class/level requirements. | `.j admin giveskill @friend meteor 3` |
| | `revokeskill <@user> <skill_name>` | Removes the specified skill from the player. | `.j admin revokeskill flame_strike` |
| | `resetplayer <@user>` | Resets player stats to 0, revokes all skills, and refunds stat points. | `.j admin resetplayer` |
| | `forceevolve <@user> <class_name>` | Forces evolution to the specified class, bypassing prerequisites. | `.j admin forceevolve @friend Warlord` |
| | `givepoints <@user> <amount>` | Awards unspent stat points. | `.j admin givepoints 20` |
| | `givezeni <@user> <amount>` | Adds Zeni to the player's wallet (accumulates with existing balance). | `.j admin givezeni 50000` |
| | `setrank <@user> <rank>` | Direct override for adventurer rank (`F` through `GOD`). | `.j admin setrank SSS` |
| | `unstick <@user>` | Resets a player's stuck combat/action state. | `.j admin unstick @friend` |
| | `inspect <@user>` | Inspects the target's stats, active equipment, wallet, and skills. | `.j admin inspect` |
| **Content Tools** | `createskill` | Sends an interactive, fill-in-the-blank skill creation template. | `.j admin createskill` |
| | `createclass` | Sends an interactive, fill-in-the-blank class creation template. | `.j admin createclass` |
| | `disableskill <skill_name>` | Disables a skill node globally so players cannot learn or use it. | `.j admin disableskill barrage` |
| | `enableskill <skill_name>` | Re-enables a previously disabled skill. | `.j admin enableskill barrage` |
| **Mod Testing** | `modclass <class_name>` | Instantly switches the mod's own class. | `.j modclass Archmage` |

---

## How to modify it

**Changing the warning strike threshold:**
To change how many warnings a user needs before they are kicked, edit the check in `core/engine.js` at line 7978:

```javascript
// BEFORE
if (warnCount >= 5 && botIsAdmin) { ... }

// AFTER: Kick the user after 3 warnings instead of 5
if (warnCount >= 3 && botIsAdmin) { ... }
```

**Adding a new owner-only command:**
Insert a new condition checking the `isOwner` flag within the command dispatcher inside `core/engine.js`.

---

## Common tasks
 
 - **Modify warning strike limits** — Change the warning threshold checks at [engine.js L7978](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7978).
 - **Add a global bot moderator** — Edit moderator arrays using `addmod` or `addGlobalMod` in [engine.js L7257](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L7257).
 - **Remove a global bot moderator** — Use the `delmod` command to strip moderator rights.
 - **Manage user access (block/unblock)** — Use `block @user` or `unblock @user` to toggle command access.
 - **Set card moderators** — Use `cardmod add @user` or `cardmod del @user` to manage card approvals.
 - **Clear a user's warnings** — Call `resetWarnings` as shown in [engine.js L1013](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1013).
 - **Configure commands prefix** — Edit prefix mappings inside `botConfig.js` and reload contexts.
 - **Force evolve a player's character** — Use `.j admin forceevolve <@user> <class_name>` to bypass all criteria and transition their class.
 - **Compensate player level / stats / points** — Adjust individual properties using `.j admin setlevel`, `.j admin setstat`, or `.j admin givepoints`.
 - **Unstick a combat session** — If a group combat is locked/hanging, run `.j admin unstick <@user>` on the stuck player to clear their locks.
 - **Audit / Inspect player data** — Use `.j admin inspect <@user>` to get a complete dump of active inventory, levels, wallet, and skills.
 - **Change database warnings persistence key** — Modify the system key name mapping inside [engine.js L1007](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1007) and Mongoose schemas.











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
const targetUser = getMentionOrReply(m);
let reason = txt.replace(new RegExp(`^.*?${botConfig.getPrefix()} warn`, "i"), "").trim();
```
**How it works here**: Variables `targetUser` and `reason` are used to store the result of the `getMentionOrReply` function and the trimmed text after removing the command and mention.
**Why it's used**: Variables are used to store values that need to be used later in the program, making the code more readable and efficient.
**If you change/remove it**: If you remove the variables, the code will not be able to store the values, and the program will not work as expected. If you change the variable names, you will need to update all references to the variable in the code.

---
### Concept 2: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are used to make decisions in a program.
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
if (targetUser) { ... }
if (warnCount >= 5 && botIsAdmin) { ... }
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} addmod`)) { ... }
```
**How it works here**: Conditional statements are used to check if a target user exists, if the warning count has reached 5, and if the command is to add a moderator.
**Why it's used**: Conditional statements are used to control the flow of a program, making decisions based on certain conditions.
**If you change/remove it**: If you remove the conditional statements, the code will not be able to make decisions, and the program will not work as expected. If you change the conditions, the code will execute different blocks of code, potentially changing the program's behavior.

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
function addWarning(userId, groupId, reason) { ... }
function resetWarnings(userId, groupId) { ... }
function getMentionOrReply(m) { ... }
```
**How it works here**: Functions `addWarning`, `resetWarnings`, and `getMentionOrReply` are used to perform specific tasks, such as adding a warning, resetting warnings, and getting a mention or reply.
**Why it's used**: Functions are used to organize code, making it more readable and reusable.
**If you change/remove it**: If you remove a function, the code that calls it will not work as expected. If you change a function, the code that calls it may not work as expected, potentially breaking the program.

---
### Concept 4: Regular Expressions
Regular expressions are patterns used to match character combinations in strings. They are used for text searching and manipulation.
**General Example**
```javascript
let text = 'Hello, world!';
let regex = /world/;
console.log(text.match(regex)); // Outputs: ['world']
```
**In Our Code**
```javascript
let reason = txt.replace(new RegExp(`^.*?${botConfig.getPrefix()} warn`, "i"), "").trim();
reason = reason.replace(new RegExp(`@${targetPhone}`, "g"), "").trim();
```
**How it works here**: Regular expressions are used to remove the command and mention from the text, and to remove the target user mention from the reason.
**Why it's used**: Regular expressions are used to search and manipulate text, making it easier to extract and format data.
**If you change/remove it**: If you remove the regular expressions, the code will not be able to remove the command and mention, and the reason will not be formatted correctly. If you change the regular expressions, the code may not work as expected, potentially breaking the program.

---
### Concept 5: String Methods
String methods are used to manipulate and format strings. They are used to perform tasks such as trimming, replacing, and splitting strings.
**General Example**
```javascript
let text = '   Hello, world!   ';
console.log(text.trim()); // Outputs: 'Hello, world!'
```
**In Our Code**
```javascript
let reason = txt.replace(new RegExp(`^.*?${botConfig.getPrefix()} warn`, "i"), "").trim();
reason = reason.replace(new RegExp(`@${targetPhone}`, "g"), "").trim();
```
**How it works here**: String methods `replace` and `trim` are used to remove the command and mention from the text, and to remove the target user mention from the reason.
**Why it's used**: String methods are used to manipulate and format strings, making it easier to extract and format data.
**If you change/remove it**: If you remove the string methods, the code will not be able to remove the command and mention, and the reason will not be formatted correctly. If you change the string methods, the code may not work as expected, potentially breaking the program.

---
### Concept 6: Arrays and Array Methods
Arrays are collections of values, and array methods are used to manipulate and format arrays. They are used to perform tasks such as pushing, popping, and filtering arrays.
**General Example**
```javascript
let numbers = [1, 2, 3];
numbers.push(4);
console.log(numbers); // Outputs: [1, 2, 3, 4]
```
**In Our Code**
```javascript
userWarnings.get(key).push({ reason, timestamp: Date.now() });
```
**How it works here**: Array method `push` is used to add a new warning to the user's warnings array.
**Why it's used**: Arrays and array methods are used to store and manipulate collections of data, making it easier to extract and format data.
**If you change/remove it**: If you remove the array methods, the code will not be able to add new warnings to the user's warnings array. If you change the array methods, the code may not work as expected, potentially breaking the program.

---
### Concept 7: Objects and Object Methods
Objects are collections of key-value pairs, and object methods are used to manipulate and format objects. They are used to perform tasks such as getting and setting properties.
**General Example**
```javascript
let person = { name: 'John', age: 30 };
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const key = userId + "_" + groupId;
if (!userWarnings.has(key)) {
  userWarnings.set(key, []);
}
```
**How it works here**: Object methods `has` and `set` are used to check if a key exists in the `userWarnings` object, and to set a new value for the key if it does not exist.
**Why it's used**: Objects and object methods are used to store and manipulate collections of data, making it easier to extract and format data.
**If you change/remove it**: If you remove the object methods, the code will not be able to check if a key exists in the `userWarnings` object, and will not be able to set a new value for the key. If you change the object methods, the code may not work as expected, potentially breaking the program.

---
### Concept 8: Promises and Async/Await
Promises are used to handle asynchronous operations, and async/await is a syntax sugar on top of promises. They are used to perform tasks such as sending messages and updating group participants.
**General Example**
```javascript
async function sendMessage() {
  try {
    await sock.sendMessage(chatId, { text: 'Hello, world!' });
  } catch (error) {
    console.error(error);
  }
}
```
**In Our Code**
```javascript
await sock.sendMessage(chatId, {
  text: BOT_MARKER + `⚠️️ @${targetPhone} has been warned (${warnCount}/5 in THIS group)\n\n*Reason:* ${reason}`,
  contextInfo: { mentionedJid: [targetUser] },
});
```
**How it works here**: Async/await is used to send a message to the chat, and to update the group participants.
**Why it's used**: Promises and async/await are used to handle asynchronous operations, making it easier to write and read asynchronous code.
**If you change/remove it**: If you remove the async/await syntax, the code will not be able to handle asynchronous operations correctly, potentially breaking the program. If you change the async/await syntax, the code may not work as expected, potentially breaking the program.
