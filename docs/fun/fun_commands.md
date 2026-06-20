# Fun Utility and AI Games Command Flow (`joke` / `truth` / `dare` / `roast` / `ship` / `fact` / `define` / `rate` / `8ball` / `motivate` / `meme` / `wyr` / `quote` / `weather` / `translate` / `crypto` / `trivia` / `qr` / `short` / `git` / `animequote` / `cat` / `dog` / `waifu`)

## 💡 Noob-Friendly Explanation
* **What it does**: The bot has a massive list of commands built for entertainment and quick utilities!
  * **AI Games & Interaction**: Ask the bot to roast a friend, get a funny dare, calculate love compatibility (ship), or answer an 8-ball question.
  * **Daily Facts & Knowledge**: Get random useless facts, dictionary definitions, translations, motivational quotes, or play a trivia quiz.
  * **Media & Utilities**: Fetch random memes, anime quotes, cat/dog/waifu pictures, generate QR codes, shorten URLs, or lookup crypto rates and weather data.
* **How to use it**:
  * Simply run commands like `.j joke`, `.j roast @friend`, `.j ship @alice @bob`, `.j weather London`, `.j translate es Hello world`, `.j qr Goten`, or `.j trivia`.
* **Under the Hood (Simple)**: For simple commands, the bot communicates with free public web services (like dictionary APIs, Coingecko, or Open Trivia DB) to fetch results. For commands requiring creative input (like dares, roasts, and ratings), the bot calls its AI model (Groq) to write a customized reply in its playful, sarcastic tone.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🔥 GENERATE AI ROAST: User sends ".j roast @target"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: primaryCmd === "roast" (L11470)
            ├── Resolve target user mention (L11478)
            ├── Build context profile from target data (L11481-L11490)
            ├── Send context payload to Groq API (L11495)
            │   └── Prompt: "Write a hilarious, lighthearted roast about this user..."
            ├── Award XP/Progress: awardProgression(senderJid, chatId) (L11516)
            └── Send roast text back to WhatsApp

======================================================
📖 DEFINE WORD: User sends ".j define logic"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "define" (L12161)
        ├── Extract target word: "logic" (L12168)
        ├── Fetch from public service: axios.get("https://api.dictionaryapi.dev/api/v2/entries/en/logic") (L12194)
        ├── Extract meanings, parts of speech, and definitions (L12195-L12204)
        └── Format text structure and reply (L12210)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Ingesting AI Roasts (`roast`)
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L11470-L11519)
* **Inputs**: Target JID from mention
* **Outputs**: Dispatched Groq completion response

```javascript
if (primaryCmd === "roast") {
  const targetUser = getMentionOrReply(m);
  const targetProfile = getUserProfile(targetUser);
  
  let roastContext = `Name: ${targetProfile?.nickname || targetUser.split("@")[0]}\n`;
  if (targetProfile?.memories) {
    roastContext += `Hobbies: ${targetProfile.memories.hobbies.join(", ")}\n`;
    roastContext += `Likes: ${targetProfile.memories.likes.join(", ")}\n`;
    roastContext += `Dislikes: ${targetProfile.memories.dislikes.join(", ")}\n`;
  }

  const res = await groq.chat.completions.create({
    messages: [
      { role: "system", content: "You are a witty, sarcastic comedian. Write a funny, lighthearted roast about this person based on their profile facts. Keep it safe and fun." },
      { role: "user", content: roastContext }
    ],
    model: "llama-3.1-8b-instant"
  });
  await reply(res.choices[0].message.content);
}
```

### Step 2: Querying External Web APIs (`define`)
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L12190-L12215)
* **Inputs**: Target lookup string
* **Outputs**: Decodes dictionary JSON payload and formats output message

```javascript
const word = cmdArgs.slice(1).join(" ");
const apiRes = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

if (apiRes.data && apiRes.data[0]) {
  const entry = apiRes.data[0];
  const mean = entry.meanings[0];
  const def = mean.definitions[0].definition;
  const example = mean.definitions[0].example || "";
  
  await reply(`📖 *${word.toUpperCase()}* (${mean.partOfSpeech})\n\nDefinition: ${def}\nExample: ${example}`);
}
```

---

## 4. How to Modify
* **Change AI Prompt Rules**: Adjust the instructions (e.g. system role prompt) sent to Groq for `roast`, `dare`, or `motivate` in `engine.js`.
* **Alter API Cooldowns / Fallbacks**: To change what happens if dictionary or fact services fail, edit the catch block logic under the respective command.
* **Integrate Custom Meme Subreddits**: Modify Reddit scraper endpoints within the `meme` command handler block.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They allow the program to make decisions and change its behavior accordingly.
**General Example**
```javascript
let x = 5;
if (x > 10) {
  console.log("x is greater than 10");
} else {
  console.log("x is less than or equal to 10");
}
```
**In Our Code**
```javascript
if (primaryCmd === "roast") {
  // code to handle the "roast" command
}
```
**How it works here**: The code checks if the `primaryCmd` variable is equal to the string "roast". If it is, the code inside the `if` block is executed.
**Why it's used**: Conditional statements are used to handle different commands or scenarios in the program. In this case, it's used to determine which command to execute based on the user's input.
**If you change/remove it**: If you remove the `if` statement, the code inside the block will always be executed, regardless of the value of `primaryCmd`. If you change the condition, the code will execute only when the new condition is met.

---
### Concept 2: Variables
Variables are used to store and manipulate data in a program. They have a name and a value, and can be used to store different types of data such as numbers, strings, and objects.
**General Example**
```javascript
let name = "John";
console.log(name); // outputs "John"
```
**In Our Code**
```javascript
const targetUser = getMentionOrReply(m);
const targetProfile = getUserProfile(targetUser);
```
**How it works here**: The code declares two variables, `targetUser` and `targetProfile`, and assigns them values using the `getMentionOrReply` and `getUserProfile` functions.
**Why it's used**: Variables are used to store and manipulate data in the program. In this case, they're used to store the target user's information and profile.
**If you change/remove it**: If you remove the variable declarations, the code will throw an error because the variables are used later in the code. If you change the variable names, you'll need to update all references to the variables in the code.

---
### Concept 3: Template Literals
Template literals are used to create strings that contain expressions or variables. They allow you to embed expressions inside string literals, making it easier to create dynamic strings.
**General Example**
```javascript
let name = "John";
let age = 30;
console.log(`My name is ${name} and I am ${age} years old.`);
```
**In Our Code**
```javascript
let roastContext = `Name: ${targetProfile?.nickname || targetUser.split("@")[0]}\n`;
```
**How it works here**: The code uses template literals to create a string that contains the target user's nickname or username.
**Why it's used**: Template literals are used to create dynamic strings that contain expressions or variables. In this case, it's used to create a string that contains the target user's information.
**If you change/remove it**: If you remove the template literal, the code will throw an error because the expression inside the template literal is used to create the `roastContext` string. If you change the template literal, you'll need to update the expression inside it to match the new template.

---
### Concept 4: Object Property Access
Object property access is used to access the properties of an object. You can access properties using dot notation or bracket notation.
**General Example**
```javascript
let person = { name: "John", age: 30 };
console.log(person.name); // outputs "John"
console.log(person["age"]); // outputs 30
```
**In Our Code**
```javascript
const mean = entry.meanings[0];
const def = mean.definitions[0].definition;
```
**How it works here**: The code accesses the properties of the `entry` object using dot notation and bracket notation.
**Why it's used**: Object property access is used to access the properties of an object. In this case, it's used to access the meanings and definitions of a word.
**If you change/remove it**: If you remove the object property access, the code will throw an error because the properties are used to access the word's meanings and definitions. If you change the property names, you'll need to update all references to the properties in the code.

---
### Concept 5: Array Methods
Array methods are used to manipulate and access arrays. There are many array methods available, such as `join`, `slice`, and `forEach`.
**General Example**
```javascript
let fruits = ["apple", "banana", "orange"];
console.log(fruits.join(", ")); // outputs "apple, banana, orange"
```
**In Our Code**
```javascript
roastContext += `Hobbies: ${targetProfile.memories.hobbies.join(", ")}\n`;
```
**How it works here**: The code uses the `join` array method to concatenate the hobbies array into a string.
**Why it's used**: Array methods are used to manipulate and access arrays. In this case, it's used to create a string that contains the target user's hobbies.
**If you change/remove it**: If you remove the array method, the code will throw an error because the method is used to create the `roastContext` string. If you change the array method, you'll need to update the code to match the new method.

---
### Concept 6: Async/Await
Async/await is used to write asynchronous code that's easier to read and maintain. It allows you to write code that's asynchronous, but looks synchronous.
**General Example**
```javascript
async function example() {
  let data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
const res = await groq.chat.completions.create({
  // options
});
```
**How it works here**: The code uses async/await to write asynchronous code that's easier to read and maintain. The `await` keyword is used to wait for the `groq.chat.completions.create` function to complete.
**Why it's used**: Async/await is used to write asynchronous code that's easier to read and maintain. In this case, it's used to wait for the `groq.chat.completions.create` function to complete before executing the next line of code.
**If you change/remove it**: If you remove the async/await, the code will throw an error because the `await` keyword is used to wait for the `groq.chat.completions.create` function to complete. If you change the async/await, you'll need to update the code to match the new asynchronous code.

---
### Concept 7: API Requests
API requests are used to send requests to a server and receive data in response. There are many libraries available to make API requests, such as Axios.
**General Example**
```javascript
import axios from "axios";
axios.get("https://api.example.com/data")
  .then(response => {
    console.log(response.data);
  })
  .catch(error => {
    console.error(error);
  });
```
**In Our Code**
```javascript
const apiRes = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
```
**How it works here**: The code uses Axios to make a GET request to the Dictionary API.
**Why it's used**: API requests are used to send requests to a server and receive data in response. In this case, it's used to retrieve the definition of a word from the Dictionary API.
**If you change/remove it**: If you remove the API request, the code will throw an error because the API request is used to retrieve the word's definition. If you change the API request, you'll need to update the code to match the new API endpoint and parameters.

---
### Concept 8: Optional Chaining
Optional chaining is used to access properties of an object that may be null or undefined. It allows you to access properties without throwing an error if the object is null or undefined.
**General Example**
```javascript
let person = { name: "John" };
console.log(person?.age); // outputs undefined
```
**In Our Code**
```javascript
let roastContext = `Name: ${targetProfile?.nickname || targetUser.split("@")[0]}\n`;
```
**How it works here**: The code uses optional chaining to access the `nickname` property of the `targetProfile` object. If the `targetProfile` object is null or undefined, the code will use the `targetUser` object instead.
**Why it's used**: Optional chaining is used to access properties of an object that may be null or undefined. In this case, it's used to access the `nickname` property of the `targetProfile` object without throwing an error if the object is null or undefined.
**If you change/remove it**: If you remove the optional chaining, the code will throw an error if the `targetProfile` object is null or undefined. If you change the optional chaining, you'll need to update the code to match the new property access.
