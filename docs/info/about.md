# About and Tutorial Commands Flow (`about`, `tutorial`)

## 1. Description
The `about` command displays general information about the bot, its features, creator details, and listed gambling games. The `tutorial` command provides a quick-start guide to the RPG Adventure systems (registration, level-up points allocation, skill learning, combat moves, and evolutions).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j about"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── about command matching (L5852)
            └── sendMenuWithBanner(sock, chatId, aboutText)
                └── sock.sendMessage(chatId, { text: formattedAboutMessage })

User sends ".j tutorial"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── tutorial command matching (L5342)
            └── sock.sendMessage(chatId, { text: formattedTutorialMessage })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

---

### Step 2: About Command Execution
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5852-L5889)
* **Inputs**: Text matching `about` prefix command
* **Outputs**: Formats and displays the dynamic Bot Profile details

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} about`) {
  const aboutText = GET_BANNER(`🃏 ${botConfig.getBotName().toUpperCase()} v${botConfig.getVersion()}`) + `\n\n` +
    `*Created by:* Mellow\n\n` +
    `*About:*\n${botConfig.getBotName()} is your all-in-one companion...\n\n` +
    `✨ *Key Features:*\n` +
    `• 🏰 Guild System\n` +
    `• 💰 Economy\n` +
    `• 🎰 Gambling\n...`;
  
  await sendMenuWithBanner(sock, chatId, aboutText);
  return;
}
```

---

### Step 3: Tutorial Command Execution
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5342-L5357)
* **Inputs**: Text matching `tutorial` prefix command
* **Outputs**: Formats and displays the quick start RPG steps list

```javascript
if (primaryCmd === "tutorial") {
  let msg = `🎓 *RPG ADVENTURE GUIDE* 🎓\n\n`;
  msg += `Welcome to the legend! Here is how to navigate your new life:\n\n`;
  msg += `1️⃣ *REGISTER:* \`${currentPrefix} register <nickname>\` to start.\n`;
  msg += `2️⃣ *LEVEL UP:* Do \`${currentPrefix} quest\` or \`${currentPrefix} solo\`...\n`;
  // ... steps 3-6
  await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
  return;
}
```

---

## 4. How to Modify
* **Customize About Details**: Edit bot capabilities description, key features, or layout inside [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5855).
* **Tutorial Steps Content**: Modify the quick tips, step guidelines, or formatting inside [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L5344).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They allow the program to make decisions and respond accordingly.
#### General Example
```javascript
let x = 5;
if (x > 10) {
  console.log("x is greater than 10");
} else {
  console.log("x is less than or equal to 10");
}
```
#### In Our Code
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} about`) {
  // code to be executed
}
```
#### How it works here
The code checks if the `lowerTxt` variable is equal to the prefix of the bot followed by the string "about". If the condition is true, it executes the code inside the if block.
#### Why it's used
Conditional statements are used to handle different scenarios and make decisions based on user input or other factors.
#### If you change/remove it
If you remove the conditional statement, the code inside the if block will be executed regardless of the condition, which can lead to unexpected behavior. If you change the condition, the code will respond differently based on the new condition.

---
### Concept 2: Template Literals
Template literals are used to create strings that can contain expressions and variables. They are denoted by backticks (``) and allow for easy string interpolation.
#### General Example
```javascript
let name = "John";
let age = 30;
console.log(`My name is ${name} and I am ${age} years old.`);
```
#### In Our Code
```javascript
const aboutText = GET_BANNER(`🃏 ${botConfig.getBotName().toUpperCase()} v${botConfig.getVersion()}`) + `\n\n` +
  `*Created by:* Mellow\n\n` +
  `*About:*\n${botConfig.getBotName()} is your all-in-one companion...\n\n` +
  `✨ *Key Features:*\n` +
  `• 🏰 Guild System\n` +
  `• 💰 Economy\n` +
  `• 🎰 Gambling\n...`;
```
#### How it works here
The code uses template literals to create a string that contains expressions and variables, such as `botConfig.getBotName()` and `botConfig.getVersion()`.
#### Why it's used
Template literals are used to create complex strings with ease and make the code more readable.
#### If you change/remove it
If you remove the template literals, the code will not be able to create the desired string with expressions and variables. If you change the template literals, the code will create a different string based on the new template.

---
### Concept 3: String Concatenation
String concatenation is used to combine two or more strings into a single string. It can be done using the `+` operator or template literals.
#### General Example
```javascript
let str1 = "Hello";
let str2 = "World";
console.log(str1 + " " + str2);
```
#### In Our Code
```javascript
const aboutText = GET_BANNER(`🃏 ${botConfig.getBotName().toUpperCase()} v${botConfig.getVersion()}`) + `\n\n` +
  `*Created by:* Mellow\n\n` +
  `*About:*\n${botConfig.getBotName()} is your all-in-one companion...\n\n` +
  `✨ *Key Features:*\n` +
  `• 🏰 Guild System\n` +
  `• 💰 Economy\n` +
  `• 🎰 Gambling\n...`;
```
#### How it works here
The code uses the `+` operator to concatenate the strings and create a single string.
#### Why it's used
String concatenation is used to combine multiple strings into a single string, making it easier to create complex strings.
#### If you change/remove it
If you remove the string concatenation, the code will not be able to combine the strings into a single string. If you change the string concatenation, the code will create a different string based on the new concatenation.

---
### Concept 4: Functions
Functions are blocks of code that can be executed multiple times from different parts of the program. They can take arguments and return values.
#### General Example
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet("John");
```
#### In Our Code
```javascript
await sendMenuWithBanner(sock, chatId, aboutText);
```
#### How it works here
The code calls the `sendMenuWithBanner` function, passing in the `sock`, `chatId`, and `aboutText` variables as arguments.
#### Why it's used
Functions are used to organize code, reduce repetition, and make the program more modular.
#### If you change/remove it
If you remove the function call, the code will not execute the function and the program will not work as expected. If you change the function call, the code will execute a different function or pass different arguments, which can affect the program's behavior.

---
### Concept 5: Async/Await
Async/await is a syntax for writing asynchronous code that is easier to read and maintain. It allows the program to pause and resume execution at specific points.
#### General Example
```javascript
async function example() {
  let data = await fetchData();
  console.log(data);
}
```
#### In Our Code
```javascript
await sendMenuWithBanner(sock, chatId, aboutText);
await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
```
#### How it works here
The code uses the `await` keyword to pause execution until the `sendMenuWithBanner` and `sendMessage` functions complete.
#### Why it's used
Async/await is used to write asynchronous code that is easier to read and maintain, and to avoid callback hell.
#### If you change/remove it
If you remove the `await` keyword, the code will not pause execution and the program may not work as expected. If you change the `await` keyword, the code will pause execution at a different point or not pause at all, which can affect the program's behavior.

---
### Concept 6: Variables
Variables are used to store and manipulate data in a program. They can be declared using the `let`, `const`, or `var` keywords.
#### General Example
```javascript
let name = "John";
console.log(name);
```
#### In Our Code
```javascript
let msg = `🎓 *RPG ADVENTURE GUIDE* 🎓\n\n`;
const aboutText = GET_BANNER(`🃏 ${botConfig.getBotName().toUpperCase()} v${botConfig.getVersion()}`) + `\n\n` +
  `*Created by:* Mellow\n\n` +
  `*About:*\n${botConfig.getBotName()} is your all-in-one companion...\n\n` +
  `✨ *Key Features:*\n` +
  `• 🏰 Guild System\n` +
  `• 💰 Economy\n` +
  `• 🎰 Gambling\n...`;
```
#### How it works here
The code declares variables using the `let` and `const` keywords to store and manipulate data.
#### Why it's used
Variables are used to store and manipulate data in a program, making it easier to write and maintain code.
#### If you change/remove it
If you remove a variable, the code will not be able to store or manipulate the data, which can lead to errors. If you change a variable, the code will store or manipulate different data, which can affect the program's behavior.

---
### Concept 7: Object Properties
Object properties are used to access and manipulate data stored in an object. They can be accessed using the dot notation or bracket notation.
#### General Example
```javascript
let person = { name: "John", age: 30 };
console.log(person.name);
```
#### In Our Code
```javascript
const aboutText = GET_BANNER(`🃏 ${botConfig.getBotName().toUpperCase()} v${botConfig.getVersion()}`) + `\n\n` +
  `*Created by:* Mellow\n\n` +
  `*About:*\n${botConfig.getBotName()} is your all-in-one companion...\n\n` +
  `✨ *Key Features:*\n` +
  `• 🏰 Guild System\n` +
  `• 💰 Economy\n` +
  `• 🎰 Gambling\n...`;
```
#### How it works here
The code accesses object properties using the dot notation, such as `botConfig.getBotName()` and `botConfig.getVersion()`.
#### Why it's used
Object properties are used to access and manipulate data stored in an object, making it easier to write and maintain code.
#### If you change/remove it
If you remove an object property, the code will not be able to access or manipulate the data, which can lead to errors. If you change an object property, the code will access or manipulate different data, which can affect the program's behavior.

---
### Concept 8: Functions as Properties
Functions can be stored as properties of an object, allowing them to be called like methods.
#### General Example
```javascript
let person = {
  name: "John",
  greet: function() {
    console.log(`Hello, my name is ${this.name}!`);
  }
};
person.greet();
```
#### In Our Code
```javascript
const aboutText = GET_BANNER(`🃏 ${botConfig.getBotName().toUpperCase()} v${botConfig.getVersion()}`) + `\n\n` +
  `*Created by:* Mellow\n\n` +
  `*About:*\n${botConfig.getBotName()} is your all-in-one companion...\n\n` +
  `✨ *Key Features:*\n` +
  `• 🏰 Guild System\n` +
  `• 💰 Economy\n` +
  `• 🎰 Gambling\n...`;
```
#### How it works here
The code calls functions stored as properties of an object, such as `botConfig.getBotName()` and `botConfig.getVersion()`.
#### Why it's used
Functions as properties are used to organize code, reduce repetition, and make the program more modular.
#### If you change/remove it
If you remove a function as a property, the code will not be able to call the function, which can lead to errors. If you change a function as a property, the code will call a different function or pass different arguments, which can affect the program's behavior.
