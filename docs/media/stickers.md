# Media Subsystem: Sticker & GIF Conversion

## What it is
The Media Subsystem facilitates conversion between static/animated images, videos, GIFs, and WhatsApp stickers. It leverages FFmpeg installed on the host OS to execute fast transcoding operations (like encoding to H.264 MP4 or WebP formats). The subsystem runs dynamically when triggered by commands such as `.s`, `.sticker`, or user reaction categories (e.g., hugging, hitting) from the waifu/neko APIs. In-memory temporary files are created under a designated scratch directory during transcoding, and the completed files are delivered to the recipient over Baileys WebSockets before being discarded.

## How it works

**FFmpeg Image to Sticker Conversion** — [engine.js L1932-L1943](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1932-L1943)
```javascript
    async function imageToSticker(inputPath, outputPath) {
      try {
        const cmd = `${FFMPEG_PATH} -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1" -c:v libwebp -preset drawing -loop 0 -q:v 75 -an "${outputPath}"`;

        await execPromise(cmd);

        return true;
      } catch (err) {
        console.error("Error converting image to sticker, sum fucked up:", err);
        return false;
      }
    }
```
This utility function executes an FFmpeg process to resize and crop a static or animated image to a exact 512x512 canvas size (the standard size for WhatsApp stickers). It transcodes the file into the WebP format, stripping out any audio tracks (`-an`) and compressing the output at a quality factor of 75.

---

**Reaction GIF Fetching and Conversion** — [handler.js L153-L176](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/handler.js#L153-L176)
```javascript
    // Convert GIF to MP4 using FFmpeg (H.264 video encoding suitable for WhatsApp)
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
    await execPromise(toMp4);

    if (!fs.existsSync(tempVideo)) {
      throw new Error('FFmpeg conversion failed to produce an MP4 file');
    }

    if (targeted) {
      await sock.sendMessage(chatId, {
        video: { url: tempVideo },
        gifPlayback: true,
        caption: `@${cleanSender} ${type}s @${cleanTarget} ${emoji}`,
        mentions: [resolvedSender, targetJid]
      }, quoteOption);
    } else {
      await sock.sendMessage(chatId, {
        video: { url: tempVideo },
        gifPlayback: true,
        caption: `@${cleanSender} ${type} ${emoji}`,
        mentions: [resolvedSender]
      }, quoteOption);
    }
```
This snippet is located inside the reactions command handler. After downloading a raw animated GIF asset from Waifu.pics or Nekos.best APIs, it converts the GIF into an MP4 container file using H.264 visual encoding with a YUV420p pixel format. This specific format is required by Baileys and the WhatsApp client to correctly display the video as an inline looping GIF.

---

**Sticker Search (Klipy)** — [engine.js L2074-L2083](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L2074-L2083)
```javascript
    async function searchStickers(query, count = 10) {
      try {
        console.log(`🔍 Sticker Search (Go Service): ${query}`);
        const result = await goService.searchStickers(query, count);
        return result.stickers || [];
      } catch (err) {
        console.error("❌ Sticker Error:", err.message);
        return [];
      }
    }
```
This asynchronous routine communicates with a local/external Go Image Service proxy. It requests sticker results matching a user-specified search term. The search returns metadata containing URLs to sticker assets from the Klipy index, which are then passed down the pipeline for download and transcoding.

## How to modify it
To modify conversion quality or parameters, developers can alter command variables within the FFmpeg commands.

```javascript
// BEFORE (engine.js L1934)
const cmd = `${FFMPEG_PATH} -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1" -c:v libwebp -preset drawing -loop 0 -q:v 75 -an "${outputPath}"`;
```
```javascript
// AFTER (engine.js L1934)
const cmd = `${FFMPEG_PATH} -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1" -c:v libwebp -preset drawing -loop 0 -q:v 90 -an "${outputPath}"`; // Increased WebP quality to 90
```

```javascript
// BEFORE (handler.js L155)
const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
```
```javascript
// AFTER (handler.js L155)
const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:1.0:5:5:0.0" -y "${tempVideo}"`; // Added unsharp filter to enhance video details
```

## Common tasks
- **Modify FFmpeg WebP encoding quality** — Adjust the visual quality of the output sticker by changing the `-q:v` parameter in [engine.js L1934](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1934).
- **Adjust GIF to MP4 scaling filters** — Change the scaling and resolution parameters in the FFmpeg command within [handler.js L155](https://github.com/BrainMell/whatsapp-bot/blob/main/reactions/handler.js#L155).
- **Configure the Sticker search limit** — Adjust the default count of sticker results returned from Klipy in [engine.js L2074](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L2074).
- **Modify sticker conversion aspect ratio handling** — Edit the scale filter logic in [engine.js L1934](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1934).










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
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
```
**How it works here**: The `ffmpegPath` variable is used to store the path to the FFmpeg executable. If the `FFMPEG_PATH` environment variable is set, its value is used; otherwise, the default value `'ffmpeg'` is used.
**Why it's used**: Variables are used to make the code more readable and maintainable. In this case, the `ffmpegPath` variable makes it easy to change the path to the FFmpeg executable if needed.
**If you change/remove it**: If you remove the `ffmpegPath` variable, the code will throw an error when trying to use it. If you change its value to an invalid path, the FFmpeg command will fail to execute.

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
async function imageToSticker(inputPath, outputPath) {
  try {
    // ...
    await execPromise(cmd);
    // ...
  } catch (err) {
    // ...
  }
}
```
**How it works here**: The `imageToSticker` function is marked as `async`, which allows it to use the `await` keyword. The `await execPromise(cmd)` line waits for the `execPromise` function to resolve before continuing.
**Why it's used**: Async/await is used to make the code easier to read and maintain. It allows you to write asynchronous code that is easier to understand and debug.
**If you change/remove it**: If you remove the `async` keyword or the `await` keyword, the code will not wait for the promise to resolve before continuing, which can cause errors or unexpected behavior.

---
### Concept 3: Try/Catch Blocks
Try/catch blocks are used to handle errors in a program. They allow you to catch and handle errors that occur in a specific block of code.
**General Example**
```javascript
try {
  // code that might throw an error
} catch (err) {
  // handle the error
}
```
**In Our Code**
```javascript
try {
  const result = await goService.searchStickers(query, count);
  return result.stickers || [];
} catch (err) {
  console.error("Sticker Error:", err.message);
  return [];
}
```
**How it works here**: The `try` block contains the code that might throw an error. If an error occurs, the `catch` block is executed, which logs the error message and returns an empty array.
**Why it's used**: Try/catch blocks are used to handle errors and prevent the program from crashing. They allow you to provide a fallback or error message to the user.
**If you change/remove it**: If you remove the try/catch block, the program will crash if an error occurs. If you change the catch block to not handle the error, the program will still crash.

---
### Concept 4: Template Literals
Template literals are a way to create strings that can contain expressions. They are denoted by backticks (``) and allow you to embed expressions inside the string.
**General Example**
```javascript
const name = 'John';
const greeting = `Hello, ${name}!`;
console.log(greeting); // Outputs: Hello, John!
```
**In Our Code**
```javascript
const cmd = `${FFMPEG_PATH} -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1" -c:v libwebp -preset drawing -loop 0 -q:v 75 -an "${outputPath}"`;
```
**How it works here**: The `cmd` variable is created using a template literal. The expressions `FFMPEG_PATH`, `inputPath`, and `outputPath` are embedded inside the string.
**Why it's used**: Template literals are used to create strings that can contain dynamic values. They make the code more readable and easier to maintain.
**If you change/remove it**: If you remove the template literal, the code will not be able to create the command string with the dynamic values. If you change the expressions inside the template literal, the command string will be different.

---
### Concept 5: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions. They allow you to make decisions in your code.
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
if (targeted) {
  await sock.sendMessage(chatId, {
    video: { url: tempVideo },
    gifPlayback: true,
    caption: `@${cleanSender} ${type}s @${cleanTarget} ${emoji}`,
    mentions: [resolvedSender, targetJid]
  }, quoteOption);
} else {
  await sock.sendMessage(chatId, {
    video: { url: tempVideo },
    gifPlayback: true,
    caption: `@${cleanSender} ${type} ${emoji}`,
    mentions: [resolvedSender]
  }, quoteOption);
}
```
**How it works here**: The `if` statement checks the value of the `targeted` variable. If it's true, the first block of code is executed; otherwise, the second block is executed.
**Why it's used**: Conditional statements are used to make decisions in the code based on conditions. They allow you to execute different blocks of code based on the state of the program.
**If you change/remove it**: If you remove the conditional statement, the code will always execute the same block of code, regardless of the condition. If you change the condition, the code will execute a different block of code.

---
### Concept 6: Functions
Functions are reusable blocks of code that can take arguments and return values. They allow you to organize your code and make it more modular.
**General Example**
```javascript
function add(x, y) {
  return x + y;
}
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
async function imageToSticker(inputPath, outputPath) {
  // ...
}
```
**How it works here**: The `imageToSticker` function is defined with two arguments, `inputPath` and `outputPath`. It returns a promise that resolves to a boolean value.
**Why it's used**: Functions are used to organize the code and make it more modular. They allow you to reuse code and make it easier to maintain.
**If you change/remove it**: If you remove the function, the code will not be able to execute the block of code that is inside the function. If you change the function signature or the code inside the function, the behavior of the program will change.

---
### Concept 7: Environment Variables
Environment variables are values that are set outside of the code, usually in the operating system or in a configuration file. They allow you to configure the behavior of the program without changing the code.
**General Example**
```javascript
const port = process.env.PORT || 3000;
```
**In Our Code**
```javascript
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
```
**How it works here**: The `ffmpegPath` variable is set to the value of the `FFMPEG_PATH` environment variable, or to the default value `'ffmpeg'` if the variable is not set.
**Why it's used**: Environment variables are used to configure the behavior of the program without changing the code. They allow you to set values that are specific to the environment where the program is running.
**If you change/remove it**: If you remove the environment variable, the program will use the default value. If you change the value of the environment variable, the behavior of the program will change.

---
### Concept 8: Promises
Promises are a way to handle asynchronous operations in JavaScript. They allow you to write code that is easier to read and maintain.
**General Example**
```javascript
function delayedPromise() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('Hello, World!');
    }, 2000);
  });
}
delayedPromise().then((message) => {
  console.log(message);
});
```
**In Our Code**
```javascript
async function searchStickers(query, count = 10) {
  try {
    const result = await goService.searchStickers(query, count);
    return result.stickers || [];
  } catch (err) {
    console.error("Sticker Error:", err.message);
    return [];
  }
}
```
**How it works here**: The `searchStickers` function returns a promise that resolves to an array of stickers. The `await` keyword is used to wait for the promise to resolve before continuing.
**Why it's used**: Promises are used to handle asynchronous operations in a way that is easier to read and maintain. They allow you to write code that is more linear and easier to understand.
**If you change/remove it**: If you remove the promise, the code will not be able to handle the asynchronous operation. If you change the promise to not resolve or reject, the code will hang or throw an error.

---
### Concept 9: Error Handling
Error handling is the process of catching and handling errors that occur in a program. It allows you to provide a fallback or error message to the user.
**General Example**
```javascript
try {
  // code that might throw an error
} catch (err) {
  console.error(err);
}
```
**In Our Code**
```javascript
try {
  const result = await goService.searchStickers(query, count);
  return result.stickers || [];
} catch (err) {
  console.error("Sticker Error:", err.message);
  return [];
}
```
**How it works here**: The `try` block contains the code that might throw an error. If an error occurs, the `catch` block is executed, which logs the error message and returns an empty array.
**Why it's used**: Error handling is used to catch and handle errors that occur in a program. It allows you to provide a fallback or error message to the user.
**If you change/remove it**: If you remove the error handling, the program will crash if an error occurs. If you change the error handling to not catch the error, the program will still crash.

---
### Concept 10: String Interpolation
String interpolation is the process of inserting values into a string. It allows you to create strings that contain dynamic values.
**General Example**
```javascript
const name = 'John';
const greeting = `Hello, ${name}!`;
console.log(greeting); // Outputs: Hello, John!
```
**In Our Code**
```javascript
const cmd = `${FFMPEG_PATH} -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1" -c:v libwebp -preset drawing -loop 0 -q:v 75 -an "${outputPath}"`;
```
**How it works here**: The `cmd` variable is created using string interpolation. The values of `FFMPEG_PATH`, `inputPath`, and `outputPath` are inserted into the string.
**Why it's used**: String interpolation is used to create strings that contain dynamic values. It makes the code more readable and easier to maintain.
**If you change/remove it**: If you remove the string interpolation, the code will not be able to create the command string with the dynamic values. If you change the values that are inserted into the string, the command string will be different.
