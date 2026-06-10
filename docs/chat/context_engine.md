# Chat Subsystem: Context-Aware AI Engine & Summaries

## What it is
The Context-Aware AI Engine is designed to process and store chat memories, jokes, and facts about group participants, as well as generate automated summaries of group conversations. It operates by listening to all incoming text messages, buffering them in memory, and executing trigger scans to detect relevant facts or topics. The module integrates with the Groq API for large language model (LLM) completions. It stores its working memory state in circular buffers managed per-chat by `BufferManager`, and persists long-term extracted user and group facts to a MongoDB database (via economy modules and Mongoose schemas). It is triggered by incoming messages that hit specific keywords or commands (like `.j summary` or `.j recap`).

## How it works

**AI Group Summary Generation** — [engine.js L1131-L1185](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1131-L1185)
```javascript
    // Create AI-powered summary with user mentions
    async function createGroupSummary(messages) {
      try {
        let chatContext = "";
        const nameToJid = new Map();

        // Build context using only actual names from THIS chat
        messages.forEach((msg) => {
          // Clean the name so the AI doesn’t get confused
          const cleanName = msg.senderName.replace(/[^a-zA-Z0-9]/g, "");
          nameToJid.set(cleanName, msg.sender);
          chatContext += `${cleanName}: ${msg.text}\n`;
        });

        const participants = Array.from(nameToJid.keys()).join(", ");

        const res = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You summarize chats. Stick to facts, keep it short, and use @Name when mentioning people. No roleplay, no extra fluff.",
            },
            {
              role: "user",
              content: `Participants: ${participants}

Chat:
${chatContext}

What to do:
1. Summarize the main points.
2. Call out key people using @Name.
3. Keep it direct.`,
            },
          ],
          model: "llama-3.1-8b-instant",
        });

        let summaryText = res.choices[0].message.content;
        const mentionedJids = [];

        // Swap @Name with real WhatsApp-style @numbers
        for (const [name, jid] of nameToJid.entries()) {
          const tag = `@${name}`;
          if (summaryText.includes(tag)) {
            const phone = jid.split("@")[0];
            summaryText = summaryText.split(tag).join(`@${phone}`);
            mentionedJids.push(jid);
          }
        }

        return { text: summaryText, mentions: mentionedJids };
      } catch (err) {
        return { text: "Summary failed.", mentions: [] };
      }
    }
```
This function aggregates recent chat messages, formats them into a dialogue script, and calls the Groq completion API to produce a structured summary. Once generated, it scans the response text for `@Name` placeholders and replaces them with WhatsApp-style telephone number mentions (e.g., `@1234567890`), gathering the associated JIDs to allow the Baileys WebSocket API to properly tag users.

---

**Context-Aware Memory Extraction Trigger** — [Engine.js L27-L65](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/Engine.js#L27-L65)
```javascript
    async onMessage(rawMsg, body) {
        // 1. Normalize message
        const msg = {
            id: rawMsg.key.id,
            chatId: rawMsg.key.remoteJid,
            userId: jidNormalizedUser(rawMsg.key.participant || rawMsg.key.remoteJid),
            username: rawMsg.pushName || "Unknown",
            content: body || "",
            timestamp: new Date(),
            replyTo: rawMsg.message?.extendedTextMessage?.contextInfo?.stanzaId || null
        };

        if (!msg.content) return;

        // 2. Buffer message
        bufferManager.addMessage(msg);

        // 3. Detect Triggers
        const triggers = triggerDetector.detect(msg.content);

        if (triggers.length > 0) {
            // 4. Get Context
            const context = bufferManager.getContext(msg.chatId, msg.id, 15, 3);

            // 5. Segment Topics
            const segments = topicSegmenter.segmentConversation(context);
            const relevant = topicSegmenter.findRelevantSegment(msg.id, segments);

            // 6. Enqueue for batching
            const task = {
                timestamp: msg.timestamp,
                message: msg,
                context: relevant.length > 0 ? relevant : context,
                triggerTypes: triggers
            };

            await adaptiveProcessor.enqueue(task);
        }
    }
```
This method processes every incoming message by normalising raw data, updating the in-memory circular buffer via `BufferManager`, and scanning the message text with `TriggerDetector`. When context-relevant keywords are matched, it queries nearby buffered context, segments it by topic flow, and enqueues a memory extraction task in the batch queue.

---

**Saving Group-Wide Context Results** — [Engine.js L169-L222](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/Engine.js#L169-L222)
```javascript
        // Save group-wide context
        const chatId = batch && batch.length > 0 ? batch[0].message.chatId : null;
        if (chatId && chatId.endsWith("@g.us") && data.group) {
            try {
                const GroupProfile = require('../../models/GroupProfile');
                let groupProfile = await GroupProfile.findOne({ chatId });
                if (!groupProfile) {
                    groupProfile = new GroupProfile({ chatId });
                }
                
                let groupChanges = 0;
                
                if (data.group.insideJokes && Array.isArray(data.group.insideJokes)) {
                    if (!groupProfile.insideJokes) groupProfile.insideJokes = [];
                    data.group.insideJokes.forEach(j => {
                        if (j.joke && j.joke.trim()) {
                            const exists = groupProfile.insideJokes.some(existing => existing.joke.toLowerCase() === j.joke.toLowerCase());
                            if (!exists) {
                                groupProfile.insideJokes.push({
                                    joke: j.joke.trim(),
                                    establishedBy: j.establishedBy || "Unknown",
                                    timestamp: new Date()
                                });
                                groupChanges++;
                            }
                        }
                    });
                }
                
                if (data.group.groupFacts && Array.isArray(data.group.groupFacts)) {
                    if (!groupProfile.groupFacts) groupProfile.groupFacts = [];
                    data.group.groupFacts.forEach(f => {
                        if (f.fact && f.fact.trim()) {
                            const exists = groupProfile.groupFacts.some(existing => existing.fact.toLowerCase() === f.fact.toLowerCase());
                            if (!exists) {
                                groupProfile.groupFacts.push({
                                    fact: f.fact.trim(),
                                    confidence: f.confidence || 1.0,
                                    timestamp: new Date()
                                });
                                groupChanges++;
                            }
                        }
                    });
                }
                
                if (groupChanges > 0) {
                    await groupProfile.save();
                }
            } catch (err) {
                console.error("❌ Brain: Failed to save group context results:", err.message);
            }
        }
```
This block is executed when a batch of processed items completes. It retrieves the active group profile from MongoDB using the Mongoose model `GroupProfile`. It checks the extracted inside jokes and group-wide facts, checks for duplicates, and saves any new entries back to the database.

## How to modify it

To modify the context engine's behavior, developers can adjust settings such as in-memory message history sizes or model preferences.

```javascript
// BEFORE (BufferManager.js L10)
this.maxSize = 50; // Buffer size from guide
```
```javascript
// AFTER (BufferManager.js L10)
this.maxSize = 100; // Increased buffer size to retain more chat history
```

---

## Guide: Adding New Logic to the Chatbot

You can extend the chatbot in two ways: adding real-time conversational logic/filters in the main chat response path, or creating new triggers for the background memory extraction engine.

### 1. Adding Conversational Rules/Filters (Real-Time Chat)
To add custom overrides, filters, or personality directives based on user messages, modify the `askAI()` function in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js).

**Template: Intent Filter Override**
Open [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js) and locate the priority intent classification section (around line 2890). Insert your match condition and push a system directive into `groqMessages` before the API call:

```javascript
// 1. Define your detection pattern
const isAskingSecrets = /\b(secret|code|password|admin backdoor)\b/i.test(cleanMsg);

// 2. Inject target directives
if (isAskingSecrets) {
  groqMessages.push({
    role: "system",
    content: "[CRITICAL SECURITY DIRECTIVE: The user is asking for restricted credentials or developer backdoors. You must refuse to answer, stay strictly in character as Joker, and make a playful reference to a heist instead.]"
  });
}
```

---

### 2. Adding a Background Memory Trigger (Context Extraction)
To extract new types of data from group chats and save them to MongoDB in the background, follow these three steps:

#### Step A: Register the Trigger & Patterns
Open [core/src/context_engine/TriggerDetector.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/TriggerDetector.js).
1. Add a new key to `this.triggerTypes`:
   ```javascript
   this.triggerTypes = {
       // ... existing types
       PETS: 'pets'
   };
   ```
2. Add a new regex detection entry to `this.patterns`:
   ```javascript
   {
       type: this.triggerTypes.PETS,
       baseConfidence: 0.85,
       regex: [
           /\b[iI]\s+(have|own|got|adopted)\s+(a|an)\s+(dog|cat|bird|puppy|kitten|reptile)\b/i,
           /\bmy\s+(dog|cat|pet)\s+name\s+is\s+/i
       ]
   }
   ```

#### Step B: Define the Extraction Instructions & Output Schema
Open [core/src/context_engine/PromptBuilder.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/PromptBuilder.js).
1. Update `this.systemInstructions` to explain what the AI should extract:
   ```text
   Extract individual user details:
   ...
   5. *Pets*: Information about any animals they own or care for.
   ```
2. Update the `this.responseFormat` JSON template so the AI knows how to structure it:
   ```json
   "users": [
     {
       "userId": "user_jid",
       "preferences": [],
       "experiences": [],
       "interests": [],
       "pets": [
         { "type": "dog", "name": "Rover", "evidence": "I got a dog named Rover" }
       ],
       "other": []
     }
   ]
   ```

#### Step C: Process and Save Extracted Data to MongoDB
Open [core/src/context_engine/Engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/Engine.js) and locate the `saveResults()` method. Update the loop to parse the new field and save it to the MongoDB user document:

```javascript
// Inside saveResults() user processing loop (Engine.js L113):
if (userData.pets && Array.isArray(userData.pets)) {
    if (!user.profile.memories.pets) {
        user.profile.memories.pets = [];
    }
    userData.pets.forEach(pet => {
        const petInfo = `${pet.type} named ${pet.name}`;
        if (!user.profile.memories.pets.includes(petInfo)) {
            user.profile.memories.pets.push(petInfo);
            changes++; // Increments the save changes counter
        }
    });
}
```

---

## Common tasks
- **Change the maximum buffer size** — Adjust the maximum number of messages stored in the circular buffer in [BufferManager.js L10](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/BufferManager.js#L10).
- **Modify the TTL for stale windows** — Adjust how long message history is cached in [BufferManager.js L11](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/BufferManager.js#L11).
- **Change the Groq LLM model used for chat summaries** — Update the model identifier in [engine.js L1166](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1166).
- **Adjust the summary context range size** — Modify how many preceding messages are fetched for context triggers in [Engine.js L49](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/Engine.js#L49).
- **Modify the system instructions for summaries** — Edit the developer system prompt for Groq completions in [engine.js L1148-L1152](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1148-L1152).
- **Add custom response triggers** — Edit rules in [engine.js L2888-L2905](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L2888).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They have a name, and you can assign a value to them.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
let chatContext = "";
const nameToJid = new Map();
```
**How it works here**: Variables are used to store the chat context and a map of names to JIDs.
**Why it's used**: Variables are used to store data that needs to be accessed and manipulated throughout the program.
**If you change/remove it**: If you remove the variables, the program will not be able to store and manipulate the chat context and name-to-JID map, and will likely result in errors.

---
### Concept 2: Async/Await
Async/await is a way to write asynchronous code that is easier to read and maintain. It allows you to write code that waits for a promise to resolve before continuing.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
async function createGroupSummary(messages) {
  try {
    // ...
    const res = await groq.chat.completions.create({
      // ...
    });
    // ...
  } catch (err) {
    // ...
  }
}
```
**How it works here**: Async/await is used to wait for the `groq.chat.completions.create` promise to resolve before continuing with the rest of the function.
**Why it's used**: Async/await is used to make the code easier to read and maintain, and to avoid callbacks.
**If you change/remove it**: If you remove the async/await, the code will not wait for the promise to resolve, and will likely result in errors or unexpected behavior.

---
### Concept 3: Maps
Maps are a data structure that stores key-value pairs. They are similar to objects, but with some key differences.
**General Example**
```javascript
const map = new Map();
map.set('key', 'value');
console.log(map.get('key')); // Outputs: value
```
**In Our Code**
```javascript
const nameToJid = new Map();
nameToJid.set(cleanName, msg.sender);
```
**How it works here**: A map is used to store the name-to-JID mapping.
**Why it's used**: Maps are used to store key-value pairs, and to look up values by their keys.
**If you change/remove it**: If you remove the map, the program will not be able to store and look up the name-to-JID mapping, and will likely result in errors.

---
### Concept 4: Array Methods
Array methods are functions that can be called on arrays to perform various operations, such as filtering, mapping, and reducing.
**General Example**
```javascript
const arr = [1, 2, 3];
const doubleArr = arr.map(x => x * 2);
console.log(doubleArr); // Outputs: [2, 4, 6]
```
**In Our Code**
```javascript
const participants = Array.from(nameToJid.keys()).join(", ");
```
**How it works here**: The `Array.from` method is used to convert the map keys to an array, and the `join` method is used to concatenate the array elements into a string.
**Why it's used**: Array methods are used to perform various operations on arrays, such as filtering, mapping, and reducing.
**If you change/remove it**: If you remove the array method, the program will not be able to perform the desired operation, and will likely result in errors.

---
### Concept 5: Conditional Statements
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
if (summaryText.includes(tag)) {
  const phone = jid.split("@")[0];
  summaryText = summaryText.split(tag).join(`@${phone}`);
  mentionedJids.push(jid);
}
```
**How it works here**: A conditional statement is used to check if the summary text includes a certain tag, and if so, to replace the tag with the corresponding phone number.
**Why it's used**: Conditional statements are used to execute different blocks of code based on certain conditions.
**If you change/remove it**: If you remove the conditional statement, the program will not be able to check the condition and execute the corresponding block of code, and will likely result in errors.

---
### Concept 6: Error Handling
Error handling is used to catch and handle errors that occur during the execution of a program.
**General Example**
```javascript
try {
  // code that might throw an error
} catch (err) {
  console.log('An error occurred:', err);
}
```
**In Our Code**
```javascript
try {
  // ...
} catch (err) {
  return { text: "Summary failed.", mentions: [] };
}
```
**How it works here**: Error handling is used to catch any errors that occur during the execution of the `createGroupSummary` function, and to return a default response if an error occurs.
**Why it's used**: Error handling is used to prevent the program from crashing when an error occurs, and to provide a default response instead.
**If you change/remove it**: If you remove the error handling, the program will crash when an error occurs, and will not provide a default response.

---
### Concept 7: Functions
Functions are blocks of code that can be called multiple times from different parts of a program.
**General Example**
```javascript
function add(x, y) {
  return x + y;
}
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
async function createGroupSummary(messages) {
  // ...
}
```
**How it works here**: A function is used to define a block of code that can be called multiple times to create a group summary.
**Why it's used**: Functions are used to organize code, to reduce duplication, and to make the code more reusable.
**If you change/remove it**: If you remove the function, the program will not be able to create a group summary, and will likely result in errors.

---
### Concept 8: Imports
Imports are used to bring in external code or modules into a program.
**General Example**
```javascript
const fs = require('fs');
fs.readFile('file.txt', (err, data) => {
  console.log(data);
});
```
**In Our Code**
```javascript
const GroupProfile = require('../../models/GroupProfile');
```
**How it works here**: An import is used to bring in the `GroupProfile` model from a separate file.
**Why it's used**: Imports are used to bring in external code or modules into a program, and to make the code more modular and reusable.
**If you change/remove it**: If you remove the import, the program will not be able to access the `GroupProfile` model, and will likely result in errors.

---
### Concept 9: Database Operations
Database operations are used to interact with a database, such as creating, reading, updating, and deleting data.
**General Example**
```javascript
const db = require('db');
db.insert({ name: 'John', age: 30 });
```
**In Our Code**
```javascript
let groupProfile = await GroupProfile.findOne({ chatId });
if (!groupProfile) {
  groupProfile = new GroupProfile({ chatId });
}
// ...
await groupProfile.save();
```
**How it works here**: Database operations are used to interact with the `GroupProfile` model, such as finding, creating, and saving data.
**Why it's used**: Database operations are used to store and retrieve data in a program, and to make the data persistent.
**If you change/remove it**: If you remove the database operations, the program will not be able to store and retrieve data, and will likely result in errors.

---
### Concept 10: Regular Expressions
Regular expressions are used to match patterns in strings.
**General Example**
```javascript
const regex = /\bhello\b/i;
console.log(regex.test('hello world')); // Outputs: true
```
**In Our Code**
```javascript
const isAskingSecrets = /\b(secret|code|password|admin backdoor)\b/i.test(cleanMsg);
```
**How it works here**: A regular expression is used to match a pattern in the `cleanMsg` string, and to check if the message is asking for secrets.
**Why it's used**: Regular expressions are used to match patterns in strings, and to perform validation and filtering.
**If you change/remove it**: If you remove the regular expression, the program will not be able to match the pattern, and will likely result in errors.

---
### Concept 11: Object Properties
Object properties are used to access and manipulate the properties of an object.
**General Example**
```javascript
const obj = { name: 'John', age: 30 };
console.log(obj.name); // Outputs: John
```
**In Our Code**
```javascript
const msg = {
  id: rawMsg.key.id,
  chatId: rawMsg.key.remoteJid,
  userId: jidNormalizedUser(rawMsg.key.participant || rawMsg.key.remoteJid),
  // ...
};
```
**How it works here**: Object properties are used to access and manipulate the properties of the `msg` object.
**Why it's used**: Object properties are used to access and manipulate the properties of an object, and to make the code more readable and maintainable.
**If you change/remove it**: If you remove the object properties, the program will not be able to access and manipulate the properties, and will likely result in errors.

---
### Concept 12: Array Filtering
Array filtering is used to create a new array with only the elements that pass a test.
**General Example**
```javascript
const arr = [1, 2, 3, 4, 5];
const evenArr = arr.filter(x => x % 2 === 0);
console.log(evenArr); // Outputs: [2, 4]
```
**In Our Code**
```javascript
if (data.group.insideJokes && Array.isArray(data.group.insideJokes)) {
  data.group.insideJokes.forEach(j => {
    // ...
  });
}
```
**How it works here**: Array filtering is not explicitly used, but the `forEach` method is used to iterate over the `insideJokes` array.
**Why it's used**: Array filtering is used to create a new array with only the elements that pass a test, and to make the code more readable and maintainable.
**If you change/remove it**: If you remove the array filtering, the program will not be able to filter the array, and will likely result in errors.

---
### Concept 13: Buffer Management
Buffer management is used to manage the size of a buffer, which is a region of memory used to store data temporarily.
**General Example**
```javascript
const buffer = [];
buffer.push('item1');
buffer.push('item2');
console.log(buffer); // Outputs: ['item1', 'item2']
```
**In Our Code**
```javascript
this.maxSize = 100; // Increased buffer size to retain more chat history
```
**How it works here**: Buffer management is used to manage the size of the buffer, which is used to store chat history.
**Why it's used**: Buffer management is used to prevent the buffer from growing too large, and to make the program more efficient.
**If you change/remove it**: If you remove the buffer management, the program will not be able to manage the size of the buffer, and will likely result in errors or performance issues.

---
### Concept 14: Trigger Detection
Trigger detection is used to detect certain patterns or keywords in a message, and to trigger a response or action.
**General Example**
```javascript
const trigger = 'hello';
if (message.includes(trigger)) {
  console.log('Trigger detected!');
}
```
**In Our Code**
```javascript
const triggers = triggerDetector.detect(msg.content);
```
**How it works here**: Trigger detection is used to detect certain patterns or keywords in the message content, and to trigger a response or action.
**Why it's used**: Trigger detection is used to detect certain patterns or keywords in a message, and to trigger a response or action.
**If you change/remove it**: If you remove the trigger detection, the program will not be able to detect triggers, and will likely result in errors or unexpected behavior.

---
### Concept 15: Topic Segmentation
Topic segmentation is used to segment a conversation into different topics or segments.
**General Example**
```javascript
const conversation = ['message1', 'message2', 'message3'];
const segments = segmentConversation(conversation);
console.log(segments); // Outputs: [['message1', 'message2'], ['message3']]
```
**In Our Code**
```javascript
const segments = topicSegmenter.segmentConversation(context);
const relevant = topicSegmenter.findRelevantSegment(msg.id, segments);
```
**How it works here**: Topic segmentation is used to segment the conversation into different topics or segments, and to find the relevant segment for the current message.
**Why it's used**: Topic segmentation is used to segment the conversation into different topics or segments, and to make the program more efficient and effective.
**If you change/remove it**: If you remove the topic segmentation, the program will not be able to segment the conversation, and will likely result in errors or unexpected behavior.
