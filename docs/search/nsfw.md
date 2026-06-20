# NSFW and Adult Search Command Flow (`nsfw` / `18+`)

## 💡 Noob-Friendly Explanation
* **What it does**: The bot has built-in image scrapers that search for adult/NSFW content on public platforms and deliver the images directly to your chat.
* **How to use it**:
  * **Rule34/General Search**: `.j nsfw 5 anime` (fetches up to 5 Rule34 results matching "anime").
  * **PornPics Search**: `.j 18+ cosplay` (fetches up to 10 PornPics results matching "cosplay").
* **Under the Hood (Simple)**: When you run these commands, the bot triggers custom web scrapers. The `18+` command queries PornPics, and the `nsfw` command queries Rule34. The bot downloads the image URLs, filters out any broken links, and posts them one by one to the WhatsApp chat using a short delay to avoid spamming the connection.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🔞 ADULT SEARCH: User sends ".j 18+ cosplay"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: primaryCmd === "18+" (L10593)
            ├── Extract search term: "cosplay" (L10600)
            ├── Trigger scraper: scrapePornPics(searchTerm, 10) (L10625)
            │   └── Fetches matches from PornPics site
            ├── Verify image results array size > 0 (L10627)
            └── Loop and send each image URL via socket (L10641)
                └── sock.sendMessage(chatId, { image: { url: img } })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Parsing the NSFW/18+ Request
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L10599-L10617)
* **Inputs**: Command parameters and search terms
* **Outputs**: Directs execution to target adult content scraper

```javascript
const searchTerm = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} 18+`, "").trim();
if (!searchTerm) {
  // Sends usage instructions if no search term provided
  return;
}
```

### Step 2: Triggering the PornPics/Rule34 Scraper
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L10625)
* **Inputs**: Query string and maximum count
* **Outputs**: Returns a listing of image file URLs

```javascript
const images = await scrapePornPics(searchTerm, 10);
if (images.length === 0) {
  return reply("❌ No results found.");
}
```

### Step 3: Paging and Emitting the Scraped Media
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L10641-L10652)
* **Inputs**: Binary array of URLs, WhatsApp client socket, and target JID
* **Outputs**: Sends image messages sequentially with a 150ms delay interval

```javascript
for (const img of images) {
  try {
    await sock.sendMessage(chatId, { image: { url: img } }, { quoted: m });
    await new Promise((res) => setTimeout(res, 150)); // prevent socket blocking
  } catch (e) {
    console.log("Skipping broken image...");
  }
}
```

---

## 4. How to Modify
* **Change Scraping Limit**: Modify the maximum count parameter (currently capped at 10) in `engine.js` around line 10705.
* **Customize Scraper Site Fallbacks**: Add new websites or custom endpoints inside `scrapePornPics` or `scrapeFromDefaultSite` functions within the scraper utils.
* **Toggle Safety Gate**: Add chat or user verification gates to prevent these commands from executing in specific family chats.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They can be thought of as labeled boxes where you can store a value.
**General Example**
```javascript
let name = "John";
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const searchTerm = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} 18+`, "").trim();
```
**How it works here**: The `searchTerm` variable is used to store the result of removing a specific prefix from the `lowerTxt` string and then trimming any whitespace.
**Why it's used**: Variables are used to store values that need to be used later in the program. In this case, the `searchTerm` variable is used to store the search term that the user provided.
**If you change/remove it**: If you remove the `searchTerm` variable, the program will not be able to store the search term and will not be able to use it later. If you change the variable name, you will need to update all references to it in the code.

---
### Concept 2: String Methods
String methods are used to manipulate and modify strings. Examples of string methods include `replace()`, `trim()`, and `toLowerCase()`.
**General Example**
```javascript
let str = " Hello World ";
console.log(str.trim()); // Outputs: "Hello World"
```
**In Our Code**
```javascript
const searchTerm = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} 18+`, "").trim();
```
**How it works here**: The `replace()` method is used to remove a specific prefix from the `lowerTxt` string, and the `trim()` method is used to remove any whitespace from the result.
**Why it's used**: String methods are used to manipulate and modify strings to get the desired output. In this case, the `replace()` and `trim()` methods are used to remove a prefix and whitespace from the search term.
**If you change/remove it**: If you remove the `replace()` or `trim()` method, the program will not be able to remove the prefix or whitespace from the search term. If you change the method, you will need to update the code to handle the new method.

---
### Concept 3: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. Examples of conditional statements include `if` and `if-else` statements.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log("You are an adult");
} else {
  console.log("You are a minor");
}
```
**In Our Code**
```javascript
if (!searchTerm) {
  // Sends usage instructions if no search term provided
  return;
}
```
**How it works here**: The `if` statement is used to check if the `searchTerm` variable is empty. If it is, the program sends usage instructions and returns.
**Why it's used**: Conditional statements are used to execute different blocks of code based on certain conditions. In this case, the `if` statement is used to check if the search term is empty and send usage instructions if it is.
**If you change/remove it**: If you remove the `if` statement, the program will not be able to check if the search term is empty and will not send usage instructions. If you change the condition, you will need to update the code to handle the new condition.

---
### Concept 4: Async/Await and Promises
Async/await and promises are used to handle asynchronous code. Async/await is a syntax sugar on top of promises that makes it easier to read and write asynchronous code.
**General Example**
```javascript
async function example() {
  let data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
const images = await scrapePornPics(searchTerm, 10);
```
**How it works here**: The `await` keyword is used to wait for the `scrapePornPics()` function to return a promise that resolves to an array of images.
**Why it's used**: Async/await and promises are used to handle asynchronous code. In this case, the `await` keyword is used to wait for the `scrapePornPics()` function to return a promise that resolves to an array of images.
**If you change/remove it**: If you remove the `await` keyword, the program will not be able to wait for the `scrapePornPics()` function to return a promise and will not be able to get the array of images. If you change the function, you will need to update the code to handle the new function.

---
### Concept 5: Loops
Loops are used to execute a block of code repeatedly. Examples of loops include `for` and `while` loops.
**General Example**
```javascript
for (let i = 0; i < 5; i++) {
  console.log(i);
}
```
**In Our Code**
```javascript
for (const img of images) {
  try {
    await sock.sendMessage(chatId, { image: { url: img } }, { quoted: m });
    await new Promise((res) => setTimeout(res, 150)); // prevent socket blocking
  } catch (e) {
    console.log("Skipping broken image...");
  }
}
```
**How it works here**: The `for` loop is used to iterate over the array of images and send each image to the chat.
**Why it's used**: Loops are used to execute a block of code repeatedly. In this case, the `for` loop is used to iterate over the array of images and send each image to the chat.
**If you change/remove it**: If you remove the `for` loop, the program will not be able to iterate over the array of images and send each image to the chat. If you change the loop, you will need to update the code to handle the new loop.

---
### Concept 6: Error Handling
Error handling is used to catch and handle errors that occur in the code. Examples of error handling include `try-catch` blocks.
**General Example**
```javascript
try {
  let data = fetchData();
  console.log(data);
} catch (e) {
  console.log("Error occurred: " + e);
}
```
**In Our Code**
```javascript
try {
  await sock.sendMessage(chatId, { image: { url: img } }, { quoted: m });
  await new Promise((res) => setTimeout(res, 150)); // prevent socket blocking
} catch (e) {
  console.log("Skipping broken image...");
}
```
**How it works here**: The `try-catch` block is used to catch any errors that occur when sending the image to the chat.
**Why it's used**: Error handling is used to catch and handle errors that occur in the code. In this case, the `try-catch` block is used to catch any errors that occur when sending the image to the chat and log a message to skip the broken image.
**If you change/remove it**: If you remove the `try-catch` block, the program will not be able to catch and handle errors that occur when sending the image to the chat. If you change the error handling, you will need to update the code to handle the new error handling.
