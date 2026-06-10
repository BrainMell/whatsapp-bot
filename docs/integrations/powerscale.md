# Integrations Subsystem: Power Scaling & Stats Lookup

## What it is
The Power Scaling & Stats Lookup Subsystem integrates external fandom-based powerscaling metadata (specifically from the VS Battles Wiki) into the bot. It uses a Go-based helper service (`GoImageService`) to execute search and page-scraping requests, shielding the node runtime from high-memory scraping tasks. The system features a two-step conversational search flow: when a user queries a character name via commands (like `.ps` or `.powerscale`), the bot fetches search matches, presents a numbered list, and holds a temporary, chat-scoped state inside a `pendingSelections` Map. If the user replies with a matching list number within the timeout window, the bot scrapes the character profile page, parses their statistics (such as Tier, Attack Potency, and Speed), and formats a detailed summary message.

## How it works

**Powerscaling Search & Pending Selection** — [powerscale.js L18-L57](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/powerscale.js#L18-L57)
```javascript
async function getPowerScale(characterName, chatId) {
    try {
        console.log(`[Powerscale] Searching for: ${characterName}`);

        const data = await goService.searchPowerscale(characterName);
        console.log(`[Powerscale] Search response:`, JSON.stringify(data));

        if (!data || !data.characters || data.characters.length === 0) {
            return { success: false, error: `No results found for "${characterName}"` };
        }

        // Build character list message
        let message = `🔍 *Found ${data.characters.length} result(s) for "${characterName}":*\n\n`;
        data.characters.forEach(char => {
            message += `*${char.id}.* ${char.name}\n`;
        });
        message += `\n_Reply with a number (1-${data.characters.length}) within 5 minutes to get their powerscale._`;

        // Store pending selection for this chat
        pendingSelections.set(chatId, {
            characters: data.characters,
            timestamp: Date.now()
        });

        // Auto-cleanup after 5 minutes
        setTimeout(() => {
            pendingSelections.delete(chatId);
        }, SELECTION_TIMEOUT_MS);

        return {
            success: true,
            message,
            isPending: true
        };

    } catch (error) {
        console.error('[Powerscale] Search failed:', error.message);
        return { success: false, error: error.message };
    }
}
```
This function receives a user’s character query and requests search results from the Go Image Service. If matches are found, it generates a reply list, inserts the results into the `pendingSelections` Map under the current `chatId`, and schedules an automatic timeout callback to delete the pending data and free memory.

---

**Selection Handler & Page Scraper** — [powerscale.js L65-L135](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/powerscale.js#L65-L135)
```javascript
async function handlePowerscaleSelection(chatId, selection) {
    const pending = pendingSelections.get(chatId);
    if (!pending) return null; // no pending selection for this chat

    // Check timeout
    if (Date.now() - pending.timestamp > SELECTION_TIMEOUT_MS) {
        pendingSelections.delete(chatId);
        return { success: false, error: 'Selection timed out. Search again!' };
    }

    const idx = parseInt(selection, 10);
    if (isNaN(idx) || idx < 1 || idx > pending.characters.length) {
        return {
            success: false,
            error: `Invalid selection. Pick a number between 1 and ${pending.characters.length}.`
        };
    }

    const chosen = pending.characters[idx - 1];
    pendingSelections.delete(chatId); // clear pending

    console.log(`[Powerscale] User selected: ${chosen.name} (${chosen.url})`);

    try {
        const data = await goService.fetchPowerscalePage(chosen.url);
        console.log(`[Powerscale] Fetch response:`, JSON.stringify(data));

        if (!data || data.error) {
            return { success: false, error: data?.error || 'Failed to fetch character data' };
        }

        const stats = data.stats || {};
        let message = `[ POWER SCALING: ${data.name.toUpperCase()} ]\n\n`;

        if (data.summary && data.summary.length > 0) {
            message += `[ Summary ]\n${data.summary}\n\n`;
        }

        message += `[ POWER STATS ]\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;

        if (stats['Tier']) {
            message += `TIER: ${stats['Tier']}\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
        }
        if (stats['Attack Potency']) message += `Attack Potency: ${stats['Attack Potency']}\n\n`;
        if (stats['Speed'])          message += `Speed: ${stats['Speed']}\n\n`;
        if (stats['Durability'])     message += `Durability: ${stats['Durability']}\n\n`;
        if (stats['Stamina'])        message += `Stamina: ${stats['Stamina']}\n\n`;
        if (stats['Range'])          message += `Range: ${stats['Range']}\n\n`;
        if (stats['Striking Strength']) message += `Striking Strength: ${stats['Striking Strength']}\n\n`;
        if (stats['Lifting Strength'])  message += `Lifting Strength: ${stats['Lifting Strength']}\n\n`;
        if (stats['Intelligence'])   message += `Intelligence: ${stats['Intelligence']}\n\n`;
        if (stats['Standard Equipment']) message += `Equipment: ${stats['Standard Equipment']}\n\n`;

        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `Source: ${data.pageUrl}`;

        return {
            success: true,
            message,
            imageUrl: data.imageUrl,
            characterName: data.name,
            pageUrl: data.pageUrl
        };

    } catch (error) {
        console.error('[Powerscale] Fetch failed:', error.message);
        return { success: false, error: error.message };
    }
}
```
This handler executes when a user replies with a selection index. It verifies the selection matches a pending search entry, clears the entry, and commands the Go Service to parse the chosen character's profile URL. It then formats the return values—such as character descriptions, tiers, offensive stats, standard equipment, and source URLs—to be sent to the group chat.

---

**Selection Presence Checker** — [powerscale.js L140-L148](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/powerscale.js#L140-L148)
```javascript
function hasPendingSelection(chatId) {
    const pending = pendingSelections.get(chatId);
    if (!pending) return false;
    if (Date.now() - pending.timestamp > SELECTION_TIMEOUT_MS) {
        pendingSelections.delete(chatId);
        return false;
    }
    return true;
}
```
This utility checks if a chat is currently waiting for a powerscaling index selection. If a pending selection exists but its age exceeds the timeout interval, the selection is removed from memory and the checker returns `false`.

## How to modify it
To adjust selection expiration times or custom character stats formatting, developers can make modifications to `powerscale.js`.

```javascript
// BEFORE (powerscale.js L10)
const SELECTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
```
```javascript
// AFTER (powerscale.js L10)
const SELECTION_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes timeout
```

```javascript
// BEFORE (powerscale.js L117-L119)
        if (stats['Intelligence'])   message += `Intelligence: ${stats['Intelligence']}\n\n`;
        if (stats['Standard Equipment']) message += `Equipment: ${stats['Standard Equipment']}\n\n`;
```
```javascript
// AFTER (powerscale.js L117-L119)
        if (stats['Intelligence'])   message += `Intelligence: ${stats['Intelligence']}\n\n`;
        if (stats['Weaknesses'])     message += `Weaknesses: ${stats['Weaknesses']}\n\n`; // Added Weaknesses stat
        if (stats['Standard Equipment']) message += `Equipment: ${stats['Standard Equipment']}\n\n`;
```

## Common tasks
- **Change the selection timeout** — Adjust the expiration time for character choice selection in [powerscale.js L10](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/powerscale.js#L10).
- **Check pending search selections** — Read the active state verification function for pending lookups in [powerscale.js L140](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/powerscale.js#L140).
- **Modify formatting of power scaling stats** — Add or customize statistics displayed in the chat message response in [powerscale.js L106-L121](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/powerscale.js#L106-L121).
- **Inspect Go Service integration** — Examine search powerscale API calls inside [powerscale.js L22](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/powerscale.js#L22).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They have a name, and you can assign a value to them.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const SELECTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
```
**How it works here**: The variable `SELECTION_TIMEOUT_MS` is used to store a constant value representing the time in milliseconds for the selection timeout.
**Why it's used**: It's used to define a constant value that can be easily changed or referenced throughout the code.
**If you change/remove it**: If you change the value, the selection timeout will be adjusted accordingly. If you remove it, the code will throw an error because the variable is referenced in other parts of the code.

---
### Concept 2: Async/Await
Async/await is a way to write asynchronous code that's easier to read and maintain. It allows you to write code that waits for a promise to resolve before continuing.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
async function getPowerScale(characterName, chatId) {
  try {
    const data = await goService.searchPowerscale(characterName);
    // ...
  } catch (error) {
    // ...
  }
}
```
**How it works here**: The `getPowerScale` function uses async/await to wait for the `searchPowerscale` function to resolve before continuing.
**Why it's used**: It's used to handle asynchronous operations, such as API calls, in a more readable and maintainable way.
**If you change/remove it**: If you remove the async/await, the code will not wait for the promise to resolve, and the data may not be available when needed. If you change it to a different asynchronous approach, the code may become harder to read or maintain.

---
### Concept 3: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions.
**General Example**
```javascript
if (x > 5) {
  console.log('x is greater than 5');
} else {
  console.log('x is less than or equal to 5');
}
```
**In Our Code**
```javascript
if (!data || !data.characters || data.characters.length === 0) {
  return { success: false, error: `No results found for "${characterName}"` };
}
```
**How it works here**: The conditional statement checks if the `data` object is empty or if the `characters` array is empty. If either condition is true, it returns an error message.
**Why it's used**: It's used to handle different scenarios and provide feedback to the user.
**If you change/remove it**: If you remove the conditional statement, the code will not handle the case where no results are found, and the user may not receive feedback. If you change the condition, the code may not behave as expected.

---
### Concept 4: Loops
Loops are used to execute a block of code repeatedly for a specified number of times.
**General Example**
```javascript
for (let i = 0; i < 5; i++) {
  console.log(i);
}
```
**In Our Code**
```javascript
data.characters.forEach(char => {
  message += `*${char.id}.* ${char.name}\n`;
});
```
**How it works here**: The `forEach` loop iterates over the `characters` array and appends each character's name to the `message` string.
**Why it's used**: It's used to process each item in the array and build a message string.
**If you change/remove it**: If you remove the loop, the code will not process each character in the array, and the message string will be incomplete. If you change the loop to a different type of loop, the code may behave differently.

---
### Concept 5: Objects
Objects are used to store and organize data in a structured way.
**General Example**
```javascript
const person = {
  name: 'John',
  age: 30
};
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const pending = pendingSelections.get(chatId);
if (!pending) return null; // no pending selection for this chat
```
**How it works here**: The `pending` object is retrieved from the `pendingSelections` map, and its properties are accessed to determine if a pending selection exists.
**Why it's used**: It's used to store and manage data in a structured way.
**If you change/remove it**: If you remove the object, the code will not be able to access its properties, and the logic will break. If you change the object's structure, the code may not work as expected.

---
### Concept 6: Maps
Maps are used to store and manage key-value pairs.
**General Example**
```javascript
const map = new Map();
map.set('key', 'value');
console.log(map.get('key')); // Outputs: value
```
**In Our Code**
```javascript
pendingSelections.set(chatId, {
  characters: data.characters,
  timestamp: Date.now()
});
```
**How it works here**: The `pendingSelections` map stores key-value pairs, where the key is the `chatId` and the value is an object containing the `characters` array and a `timestamp`.
**Why it's used**: It's used to manage pending selections for each chat.
**If you change/remove it**: If you remove the map, the code will not be able to store or retrieve pending selections, and the logic will break. If you change the map's structure, the code may not work as expected.

---
### Concept 7: Parsing Numbers
Parsing numbers is used to convert a string to a number.
**General Example**
```javascript
const num = parseInt('123');
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const idx = parseInt(selection, 10);
if (isNaN(idx) || idx < 1 || idx > pending.characters.length) {
  return {
    success: false,
    error: `Invalid selection. Pick a number between 1 and ${pending.characters.length}.`
  };
}
```
**How it works here**: The `parseInt` function is used to convert the `selection` string to a number, and then it's checked if the number is valid.
**Why it's used**: It's used to validate user input and ensure it's a valid number.
**If you change/remove it**: If you remove the parsing, the code will not be able to validate the user input, and the logic may break. If you change the parsing to a different type, the code may behave differently.

---
### Concept 8: Error Handling
Error handling is used to catch and manage errors that occur during the execution of the code.
**General Example**
```javascript
try {
  // code that may throw an error
} catch (error) {
  console.error(error);
}
```
**In Our Code**
```javascript
try {
  const data = await goService.searchPowerscale(characterName);
  // ...
} catch (error) {
  console.error('[Powerscale] Search failed:', error.message);
  return { success: false, error: error.message };
}
```
**How it works here**: The `try` block contains code that may throw an error, and the `catch` block catches and handles the error.
**Why it's used**: It's used to prevent the code from crashing and provide feedback to the user when an error occurs.
**If you change/remove it**: If you remove the error handling, the code will crash when an error occurs, and the user will not receive feedback. If you change the error handling, the code may behave differently.
