# Animated Reaction & Interaction Commands Flow

## 1. Description
The Reaction/Interaction commands generate context-specific SFW anime reaction GIFs and deliver them to WhatsApp as autoplaying video clips (`gifPlayback: true`). The available commands are:
- `.j kiss @user` — Kiss someone.
- `.j hug @user` — Give someone a warm hug.
- `.j pat @user` — Pat someone on the head.
- `.j slap @user` — Slap someone.
- `.j kill @user` — Falsely murder someone.
- `.j wink` — Wink to express your vibes.
- `.j cry` — Cry out loud.
- `.j dance` — Start dancing.
- `.j smug` — Look smug.
- `.j eat @user` — Eat/Nom something or someone.
- `.j backflip` — Do a backflip.

The system dynamically pulls media links from public anime picture repositories (Nekos.best & Waifu.pics), converts the graphics format locally via FFmpeg, and cleans up residual temporary storage.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j kiss @user" (or ".j wink", etc.)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── reaction command lookup in REACTIONS (L4568)
            └── core/reactions/handler.js (Imported from 'reactions/handler')
                └── handleReaction(sock, msg, type, emoji, targeted, chatId, senderJid, senderName) (L83)
                    └── resolveTarget(msg) (L19)
                    └── fetchGifUrl(type) (L39)
                        └── axios.get("https://nekos.best/api/v2/...")
                        └── axios.get("https://api.waifu.pics/sfw/...") (Fallback)
                    └── fs.writeFileSync(tempGif, downloadBuffer) (L151)
                    └── execPromise("ffmpeg -i tempGif ... tempVideo") (L155)
                    └── sock.sendMessage(chatId, { video: tempVideo, gifPlayback: true, caption })
                    └── fs.unlinkSync(tempGif / tempVideo) (L183)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Request Ingestion and Mapping
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4567-L4581)
* **Inputs**: Command prefix and text string `lowerTxt`
* **Outputs**: Dispatches reaction attributes (type, emoji, targeting status) to the handler

```javascript
const reaction = REACTIONS.find((r) => r.type === primaryCmd);
if (reaction) {
  await handleReaction(
    sock,
    m,
    reaction.type,
    reaction.emoji,
    reaction.targeted,
    chatId,
    senderJid,
    senderName
  );
  return;
}
```

---

### Step 2: Target Resolution
* **File Path**: [handler.js](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/handler.js#L19-L34)
* **Inputs**: WhatsApp message object `msg`
* **Outputs**: Returns target phone JID or `null` if none found

```javascript
function resolveTarget(msg) {
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.length > 0) return mentions[0];

  const participant = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (participant) return participant;
  
  // ... fallbacks for DM chats
  return null;
}
```

---

### Step 3: Fetching Media Endpoint
* **File Path**: [handler.js](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/handler.js#L39-L78)
* **Inputs**: Clean reaction category string `type`
* **Outputs**: Returns public URL of SFW anime GIF

```javascript
async function fetchGifUrl(category) {
  // 1. Attempts Nekos.best API
  try {
    const nekosCat = NEKOS_BEST_MAP[category] || category;
    const res = await axios.get(`https://nekos.best/api/v2/${nekosCat}`);
    if (res.data?.results?.[0]?.url) return res.data.results[0].url;
  } catch (err) { /* ... fallback warn */ }

  // 2. Attempts Waifu.pics API
  try {
    const waifuCat = WAIFU_PICS_MAP[category] || category;
    const res = await axios.get(`https://api.waifu.pics/sfw/${waifuCat}`);
    if (res.data?.url) return res.data.url;
  } catch (err) { /* ... fallback warn */ }
  
  throw new Error('All GIF endpoints failed.');
}
```

---

### Step 4: Formatting Conversion (FFmpeg)
* **File Path**: [handler.js](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/handler.js#L127-L160)
* **Inputs**: Downloads the target URL buffer and writes it locally to `/tmp`
* **Outputs**: Transcodes GIF file to H.264 MP4 container

```javascript
// Downloads media file
const bufferResponse = await axios.get(gifUrl, { responseType: 'arraybuffer' });
fs.writeFileSync(tempGif, Buffer.from(bufferResponse.data));

// Encodes using ffmpeg to meet WhatsApp playback specs (YUV420P profile, even height/width scales)
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
await execPromise(toMp4);
```

---

### Step 5: Delivering Payload and Cleanup
* **File Path**: [handler.js](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/handler.js#L162-L188)
* **Outputs**: Transmits the message attachment and deletes temporary workspace contents

```javascript
if (targeted) {
  await sock.sendMessage(chatId, {
    video: { url: tempVideo },
    gifPlayback: true,
    caption: `@${cleanSender} ${type}s @${cleanTarget} ${emoji}`,
    mentions: [resolvedSender, targetJid]
  }, quoteOption);
}
// ... removes temp files from OS temp directories in finally block:
if (fs.existsSync(tempGif)) fs.unlinkSync(tempGif);
if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo);
```

---

## 4. How to Modify
* **Add Reactions / Action Commands**: Insert a new object defining command type, target state, and emoji to the mapping inside [config.js](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/config.js).
* **Category Mappings & Fallbacks**: Adjust fallback endpoint translation values in [fallbacks.js](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/fallbacks.js).
* **FFmpeg Conversion Options**: Alter resolution, frame-rate limits, scale properties, or format encoding parameters within the execution command in [handler.js](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/handler.js#L155).
* **Nekos.best / Waifu.pics API Timeouts**: Change duration limit thresholds inside `fetchGifUrl` in [handler.js](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/handler.js#L43).










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
const reaction = REACTIONS.find((r) => r.type === primaryCmd);
```
**How it works here**: The code declares a constant variable `reaction` and assigns it the result of the `find` method called on the `REACTIONS` array.
**Why it's used**: Variables are used to store the result of the `find` method so that it can be used later in the code.
**If you change/remove it**: If you remove the `reaction` variable, the code will not be able to store the result of the `find` method and will throw an error when trying to use it.

---
### Concept 2: Array Methods
Array methods are functions that can be called on arrays to perform specific operations, such as finding an element or filtering the array.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let foundNumber = numbers.find((n) => n === 3);
console.log(foundNumber); // Outputs: 3
```
**In Our Code**
```javascript
const reaction = REACTIONS.find((r) => r.type === primaryCmd);
```
**How it works here**: The code uses the `find` method to search for an object in the `REACTIONS` array that matches the `primaryCmd` condition.
**Why it's used**: The `find` method is used to search for a specific reaction in the `REACTIONS` array.
**If you change/remove it**: If you remove the `find` method, the code will not be able to search for the reaction and will throw an error.

---
### Concept 3: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions.
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
if (targeted) {
  await sock.sendMessage(chatId, {
    video: { url: tempVideo },
    gifPlayback: true,
    caption: `@${cleanSender} ${type}s @${cleanTarget} ${emoji}`,
    mentions: [resolvedSender, targetJid]
  }, quoteOption);
}
```
**How it works here**: The code checks if the `targeted` variable is true, and if so, sends a message using the `sock.sendMessage` method.
**Why it's used**: The conditional statement is used to determine whether to send a targeted message or not.
**If you change/remove it**: If you remove the conditional statement, the code will always send a message, regardless of the value of `targeted`.

---
### Concept 4: Functions
Functions are blocks of code that can be called multiple times from different parts of a program.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
async function fetchGifUrl(category) {
  // ...
}
```
**How it works here**: The code defines an asynchronous function `fetchGifUrl` that takes a `category` parameter and returns a GIF URL.
**Why it's used**: The function is used to encapsulate the logic for fetching a GIF URL and make it reusable.
**If you change/remove it**: If you remove the function, the code will not be able to fetch a GIF URL and will throw an error.

---
### Concept 5: Asynchronous Programming
Asynchronous programming is a technique that allows code to execute without blocking other tasks.
**General Example**
```javascript
async function delayedLog() {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log('Delayed log');
}
delayedLog();
console.log('Immediate log'); // Outputs: Immediate log, then Delayed log after 2 seconds
```
**In Our Code**
```javascript
async function fetchGifUrl(category) {
  // ...
}
```
**How it works here**: The code uses asynchronous programming to fetch a GIF URL without blocking other tasks.
**Why it's used**: Asynchronous programming is used to improve the performance and responsiveness of the code.
**If you change/remove it**: If you remove the asynchronous programming, the code will block other tasks and may become unresponsive.

---
### Concept 6: Error Handling
Error handling is a technique that allows code to handle and recover from errors.
**General Example**
```javascript
try {
  let x = 1 / 0;
} catch (error) {
  console.log('Error caught:', error);
}
```
**In Our Code**
```javascript
try {
  const res = await axios.get(`https://nekos.best/api/v2/${nekosCat}`);
  // ...
} catch (err) { /* ... fallback warn */ }
```
**How it works here**: The code uses a try-catch block to catch and handle any errors that occur during the execution of the code.
**Why it's used**: Error handling is used to prevent the code from crashing and to provide a fallback or warning message instead.
**If you change/remove it**: If you remove the error handling, the code will crash and throw an error if an exception occurs.

---
### Concept 7: Object Destructuring
Object destructuring is a technique that allows code to extract properties from an object and assign them to variables.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
```
**How it works here**: The code uses object destructuring to extract the `mentionedJid` property from the `contextInfo` object and assign it to the `mentions` variable.
**Why it's used**: Object destructuring is used to simplify the code and make it more readable.
**If you change/remove it**: If you remove the object destructuring, the code will not be able to extract the `mentionedJid` property and will throw an error.

---
### Concept 8: Optional Chaining
Optional chaining is a technique that allows code to access properties of an object without throwing an error if the property does not exist.
**General Example**
```javascript
let person = { name: 'John' };
console.log(person?.age); // Outputs: undefined
```
**In Our Code**
```javascript
const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
```
**How it works here**: The code uses optional chaining to access the `mentionedJid` property of the `contextInfo` object without throwing an error if it does not exist.
**Why it's used**: Optional chaining is used to prevent the code from throwing an error and to provide a default value instead.
**If you change/remove it**: If you remove the optional chaining, the code will throw an error if the `mentionedJid` property does not exist.

---
### Concept 9: File System Operations
File system operations are used to interact with the file system, such as reading and writing files.
**General Example**
```javascript
const fs = require('fs');
fs.writeFileSync('example.txt', 'Hello, world!');
```
**In Our Code**
```javascript
fs.writeFileSync(tempGif, Buffer.from(bufferResponse.data));
```
**How it works here**: The code uses the `writeFileSync` method to write the contents of the `bufferResponse.data` buffer to a file.
**Why it's used**: File system operations are used to store and retrieve data from files.
**If you change/remove it**: If you remove the file system operations, the code will not be able to store or retrieve data from files and will throw an error.

---
### Concept 10: Executing Shell Commands
Executing shell commands is used to run external commands or programs from within a Node.js program.
**General Example**
```javascript
const childProcess = require('child_process');
childProcess.exec('ls -l', (error, stdout, stderr) => {
  console.log(stdout);
});
```
**In Our Code**
```javascript
const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
await execPromise(toMp4);
```
**How it works here**: The code uses the `execPromise` function to execute the `ffmpeg` command and convert the GIF to an MP4 video.
**Why it's used**: Executing shell commands is used to leverage the capabilities of external programs or commands.
**If you change/remove it**: If you remove the execution of shell commands, the code will not be able to convert the GIF to an MP4 video and will throw an error.
