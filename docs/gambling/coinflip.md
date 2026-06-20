# Coinflip Command Flow (`cf`, `flip`)

## 1. Description
The Coinflip command allows players to bet a specified amount of Zeni on Heads or Tails. The outcome is generated randomly with a built-in house edge calculation and capped by the daily profit limits.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j cf 1000 heads"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "cf" || primaryCmd === "flip") (L4801)
            └── core/gambling.js
                └── coinflip(senderJid, amount, choice, economy) (L129)
                    └── ensureGamblingProfile(user)
                    └── beginGamblingRound(user)
                    └── maybeForceLoss(ctx)
                    └── capPayoutByDailyLimit(user, payoutAmount)
                    └── user.wallet +/-= amount
                    └── economy.saveUser(senderJid)
                    └── reply text/visual to WhatsApp
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
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

#### Explanation
- intercepts the incoming WebSocket payload from WhatsApp. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching and Extraction
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Message parser block
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: `primaryCmd` and `cmdArgs` array

```javascript
if (lowerTxt.startsWith(currentPrefix)) {
  const cmdBody = lowerTxt
    .substring(currentPrefix.length)
    .trim();
  const cmdArgs = cmdBody.split(" ");
  const primaryCmd = cmdArgs[0];
```

#### Explanation
- Validates the trigger prefix (e.g. `.j`). If found, strips it, splits the remaining string by spaces to get arguments, and extracts the primary command index.

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4801
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const gambling = require("./gambling");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `gambling.coinflip`

```javascript
if (primaryCmd === "cf" || primaryCmd === "flip") {
  const betAmount = parseInt(cmdArgs[1], 10);
  const choice = cmdArgs[2] || "";
  const result = gambling.coinflip(senderJid, betAmount, choice, economy);
  return await reply(result.message);
}
```

#### Explanation
- Catches the coinflip keywords, parses the second argument as a numeric bet amount, and passes execution to `gambling.coinflip` before responding.

---

### Step 4: Coinflip Evaluation and Balance Mutations
* **File Path**: `core/gambling.js`
* **Line Numbers**: 129-222
* **Called From**: `core/engine.js`
* **Imported From**: `core/gambling.js`
* **Inputs**: `(userId, amount, choice, economyModule)`
* **Outputs**: `{ success: boolean, message: string }` status object

```javascript
function coinflip(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first!` };
  
  if (amount < GLOBAL_MIN_BET || amount > GLOBAL_MAX_BET) {
    return { success: false, message: "❌ Invalid bet range." };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: "❌ Insufficient wallet balance." };
  }
  
  const normalizedChoice = choice.toLowerCase();
  const userChoice = normalizedChoice.startsWith('h') ? 'heads' : 'tails';
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const ctx = beginGamblingRound(user);
  const won = userChoice === result && !maybeForceLoss(ctx);

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount, ctx));
    user.wallet += gain;
    trackDailyNet(user, gain);
  } else {
    user.wallet -= amount;
    trackDailyNet(user, -amount);
  }
  economyModule.saveUser(userId);
}
```

#### Explanation
- Compares user wallet balance and amount bounds against the global variables `GLOBAL_MIN_BET` and `GLOBAL_MAX_BET`.
- Rolls a 50/50 probability (`Math.random() < 0.5`).
- Executes `beginGamblingRound` and `maybeForceLoss` to apply house-edge scaling and daily win caps.
- Mutates the `user.wallet` value and schedules saving changes back to the database.

---

## 5. How to Modify
To adjust Coinflip payouts or alter the coin flip probability:
- Modify the probability evaluation range in `core/gambling.js`:
  ```javascript
  // Change 0.5 to another float (e.g. 0.48 to give the house a 52/48 edge natively)
  const result = Math.random() < 0.48 ? 'heads' : 'tails';
  ```










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
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
const primaryCmd = cmdArgs[0];
```
**How it works here**: In the code, variables like `cmdBody` and `primaryCmd` are used to store the result of certain operations, such as extracting a substring or accessing an array element.
**Why it's used**: Variables are used to make the code more readable and easier to understand. They allow you to break down complex operations into smaller, more manageable parts.
**If you change/remove it**: If you remove or rename a variable, the code will break, and you will get an error message. For example, if you remove the `cmdBody` variable, the code will throw an error when trying to access `cmdArgs[0]`.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
const greet = (name) => {
  console.log(`Hello, ${name}!`);
};
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the code, an arrow function is used as an event listener for the `messages.upsert` event. The function is called whenever the event is triggered, and it receives the `messages` and `type` parameters.
**Why it's used**: Arrow functions are used to make the code more concise and easier to read. They are particularly useful for defining small, single-purpose functions.
**If you change/remove it**: If you remove the arrow function, the event listener will not be triggered, and the code will not respond to the `messages.upsert` event.

---
### Concept 3: Event Listeners
Event listeners are functions that are triggered in response to a specific event, such as a user clicking a button or a message being received.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Button clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the code, an event listener is used to respond to the `messages.upsert` event. When the event is triggered, the listener function is called, and it processes the received messages.
**Why it's used**: Event listeners are used to make the code interactive and responsive to user input or other events.
**If you change/remove it**: If you remove the event listener, the code will not respond to the `messages.upsert` event, and the program will not process received messages.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions based on certain conditions. They are defined using the `if` and `else` keywords.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult!');
} else {
  console.log('You are a minor!');
}
```
**In Our Code**
```javascript
if (primaryCmd === "cf" || primaryCmd === "flip") {
  // ...
}
```
**How it works here**: In the code, a conditional statement is used to check if the `primaryCmd` variable matches a certain value. If it does, the code inside the `if` block is executed.
**Why it's used**: Conditional statements are used to make decisions based on certain conditions and to execute different blocks of code accordingly.
**If you change/remove it**: If you remove the conditional statement, the code will not make decisions based on the `primaryCmd` variable, and the program will not behave as expected.

---
### Concept 5: Array Methods
Array methods are used to manipulate and process arrays. They are defined using the `map()`, `filter()`, and `reduce()` methods, among others.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: In the code, the `map()` method is used to process an array of messages. The `map()` method applies a function to each element of the array and returns a new array with the results.
**Why it's used**: Array methods are used to manipulate and process arrays in a concise and efficient way.
**If you change/remove it**: If you remove the `map()` method, the code will not process the array of messages, and the program will not behave as expected.

---
### Concept 6: Promise
A promise is a result object that is used to handle asynchronous operations. It represents a value that may not be available yet, but will be resolved at some point in the future.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('Hello, World!');
  }, 2000);
});
promise.then((message) => {
  console.log(message); // Outputs: Hello, World!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: In the code, a promise is used to handle the asynchronous processing of an array of messages. The `Promise.all()` method is used to wait for all the promises to resolve before continuing with the execution of the code.
**Why it's used**: Promises are used to handle asynchronous operations in a concise and efficient way.
**If you change/remove it**: If you remove the promise, the code will not handle the asynchronous processing of the array of messages, and the program will not behave as expected.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code. It allows you to write asynchronous code that looks and feels like synchronous code.
**General Example**
```javascript
async function greet() {
  let message = await Promise.resolve('Hello, World!');
  console.log(message); // Outputs: Hello, World!
}
greet();
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the code, async/await is used to handle the asynchronous processing of the `messages.upsert` event. The `async` keyword is used to define an asynchronous function, and the `await` keyword is used to wait for the resolution of a promise.
**Why it's used**: Async/await is used to make asynchronous code easier to read and write.
**If you change/remove it**: If you remove the async/await syntax, the code will not handle the asynchronous processing of the `messages.upsert` event, and the program will not behave as expected.

---
### Concept 8: String Methods
String methods are used to manipulate and process strings. They are defined using the `substring()`, `trim()`, and `split()` methods, among others.
**General Example**
```javascript
let str = '   Hello, World!   ';
let trimmedStr = str.trim();
console.log(trimmedStr); // Outputs: Hello, World!
```
**In Our Code**
```javascript
const cmdBody = lowerTxt.substring(currentPrefix.length).trim();
const cmdArgs = cmdBody.split(" ");
```
**How it works here**: In the code, string methods are used to manipulate and process the `lowerTxt` string. The `substring()` method is used to extract a substring, and the `trim()` method is used to remove whitespace characters. The `split()` method is used to split the string into an array of substrings.
**Why it's used**: String methods are used to manipulate and process strings in a concise and efficient way.
**If you change/remove it**: If you remove the string methods, the code will not manipulate and process the `lowerTxt` string, and the program will not behave as expected.

---
### Concept 9: Number Parsing
Number parsing is the process of converting a string to a number. It is defined using the `parseInt()` function.
**General Example**
```javascript
let str = '123';
let num = parseInt(str);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
const betAmount = parseInt(cmdArgs[1], 10);
```
**How it works here**: In the code, number parsing is used to convert the `cmdArgs[1]` string to a number. The `parseInt()` function is used to parse the string and return a number.
**Why it's used**: Number parsing is used to convert strings to numbers in a concise and efficient way.
**If you change/remove it**: If you remove the number parsing, the code will not convert the `cmdArgs[1]` string to a number, and the program will not behave as expected.

---
### Concept 10: Object Properties
Object properties are used to access and manipulate the properties of an object. They are defined using the dot notation or bracket notation.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const user = economyModule.getUser(userId);
if (!user) return { success: false, message: ` Register first!` };
```
**How it works here**: In the code, object properties are used to access and manipulate the properties of the `user` object. The dot notation is used to access the `getUser()` method of the `economyModule` object.
**Why it's used**: Object properties are used to access and manipulate the properties of an object in a concise and efficient way.
**If you change/remove it**: If you remove the object properties, the code will not access and manipulate the properties of the `user` object, and the program will not behave as expected.

---
### Concept 11: Math Random
Math random is a function that generates a random number between 0 and 1. It is defined using the `Math.random()` function.
**General Example**
```javascript
let randomNum = Math.random();
console.log(randomNum); // Outputs: a random number between 0 and 1
```
**In Our Code**
```javascript
const result = Math.random() < 0.5 ? 'heads' : 'tails';
```
**How it works here**: In the code, math random is used to generate a random number between 0 and 1. The `Math.random()` function is used to generate the random number, and the ternary operator is used to determine the result based on the random number.
**Why it's used**: Math random is used to generate random numbers in a concise and efficient way.
**If you change/remove it**: If you remove the math random, the code will not generate a random number, and the program will not behave as expected.

---
### Concept 12: Ternary Operator
The ternary operator is a shorthand way of writing an if-else statement. It is defined using the `condition ? trueValue : falseValue` syntax.
**General Example**
```javascript
let age = 25;
let status = age >= 18 ? 'adult' : 'minor';
console.log(status); // Outputs: adult
```
**In Our Code**
```javascript
const result = Math.random() < 0.5 ? 'heads' : 'tails';
```
**How it works here**: In the code, the ternary operator is used to determine the result based on the random number generated by `Math.random()`. If the random number is less than 0.5, the result is 'heads', otherwise it is 'tails'.
**Why it's used**: The ternary operator is used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the ternary operator, the code will not determine the result based on the random number, and the program will not behave as expected.

---
### Concept 13: Conditional Assignment
Conditional assignment is a shorthand way of writing an if-else statement to assign a value to a variable. It is defined using the `variable = condition ? trueValue : falseValue` syntax.
**General Example**
```javascript
let age = 25;
let status = age >= 18 ? 'adult' : 'minor';
console.log(status); // Outputs: adult
```
**In Our Code**
```javascript
const userChoice = normalizedChoice.startsWith('h') ? 'heads' : 'tails';
```
**How it works here**: In the code, conditional assignment is used to assign a value to the `userChoice` variable based on the `normalizedChoice` string. If the `normalizedChoice` string starts with 'h', the `userChoice` variable is assigned 'heads', otherwise it is assigned 'tails'.
**Why it's used**: Conditional assignment is used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the conditional assignment, the code will not assign a value to the `userChoice` variable based on the `normalizedChoice` string, and the program will not behave as expected.

---
### Concept 14: Function Calls
Function calls are used to invoke a function and execute its code. They are defined using the `functionName()` syntax.
**General Example**
```javascript
function greet() {
  console.log('Hello, World!');
}
greet(); // Outputs: Hello, World!
```
**In Our Code**
```javascript
const result = gambling.coinflip(senderJid, betAmount, choice, economy);
return await reply(result.message);
```
**How it works here**: In the code, function calls are used to invoke the `coinflip()` function and execute its code. The `coinflip()` function is called with the `senderJid`, `betAmount`, `choice`, and `economy` variables as arguments.
**Why it's used**: Function calls are used to invoke a function and execute its code in a concise and efficient way.
**If you change/remove it**: If you remove the function call, the code will not invoke the `coinflip()` function, and the program will not behave as expected.

---
### Concept 15: Return Statements
Return statements are used to exit a function and return a value to the caller. They are defined using the `return` keyword.
**General Example**
```javascript
function greet() {
  return 'Hello, World!';
}
console.log(greet()); // Outputs: Hello, World!
```
**In Our Code**
```javascript
return await reply(result.message);
```
**How it works here**: In the code, a return statement is used to exit the function and return a value to the caller. The `reply()` function is called with the `result.message` variable as an argument, and the result is returned to the caller.
**Why it's used**: Return statements are used to exit a function and return a value to the caller in a concise and efficient way.
**If you change/remove it**: If you remove the return statement, the code will not exit the function and return a value to the caller, and the program will not behave as expected.
