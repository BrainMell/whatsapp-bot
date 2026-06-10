# Deposit Command Flow (`deposit`, `dep`)

## 1. Description
The Deposit command moves Zeni from the user's active Wallet to their secure Bank account where it is safe from being stolen by other players via the `rob` command.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j deposit 500" or ".j dep all"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "deposit" || "dep") (L14940)
            └── Parse amount or "all":
                └── if ("all") balance = economy.getBalance(senderJid) (L14964)
                └── else amount = parseInt(amount) (L14968)
            └── core/rpg/economy.js
                └── deposit(senderJid, amount) (L675)
                    └── getUser(senderJid)
                    └── wallet -= amount, bank += amount
                    └── logTransaction(senderJid, "Bank Deposit", -amount, wallet)
                    └── scheduleSave(senderJid)
            └── try: Generate graphic via Go service
                └── goService.generateTransactionCard(data) (L14982)
                └── sock.sendMessage(chatId, { image: cardBuffer, caption: ... })
            └── catch/fallback:
                └── sock.sendMessage(chatId, { text: result.message }) (L15000)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
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
- Listens to incoming messages from Baileys. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching and Argument Extraction
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14940-L14976)
* **Line Numbers**: 14940-14976
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Numeric deposit `amount` or exits if invalid

```javascript
                  // deposit <amount> / .joker dep <amount>
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} deposit` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} deposit `,
                    ) ||
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} dep` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} dep `,
                    )
                  ) {
                    const args = txt.split(` `);
                    let amount = args[2];

                    if (!amount) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} deposit <amount|all>\``,
                      });
                      return;
                    }

                    // Handle "all" keyword
                    if (amount.toLowerCase() === `all`) {
                      const balance = economy.getBalance(senderJid);
                      amount = balance;
                    } else {
                      amount = parseInt(amount);
                    }

                    if (isNaN(amount) || amount <= 0) {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + "❌ Invalid amount!",
                      });
                      return;
                    }
```

#### Explanation
- Catches the trigger commands (`deposit` or `dep`).
- Extracts the balance amount argument. If the argument is `"all"`, it invokes `economy.getBalance(senderJid)` to resolve the full quantity currently held in the user's wallet.
- Validates that the amount parsed is a positive integer.

---

### Step 3: Deposit Transaction Handling
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L675-L710)
* **Line Numbers**: 675-710
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId, amount)`
* **Outputs**: `{ success: boolean, message: string, amount, wallet, bank, nickname }`

```javascript
function deposit(userId, amount) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };
  
  if (amount <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be greater than ${getZENI()}0` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n💰 Wallet balance: ${getZENI()}${user.wallet.toLocaleString()}\n📊 Attempting to deposit: ${getZENI()}${amount.toLocaleString()}` };
  }
  
  user.wallet -= amount;
  user.bank += amount;
  
  logTransaction(userId, "Bank Deposit", -amount, user.wallet);

  scheduleSave(userId);
  
  return { 
    success: true, 
    message: `... (Formatted text response) ...`,
    amount: amount,
    wallet: user.wallet,
    bank: user.bank,
    nickname: user.nickname || user.userId.split('@')[0]
  };
}
```

#### Explanation
1. Checks that the user exists and has a wallet balance greater than or equal to the requested deposit amount.
2. Deducts the Zeni amount from `user.wallet` and adds it to `user.bank`.
3. Calls `logTransaction` to record the change with description `"Bank Deposit"`.
4. Triggers background persistence saving via `scheduleSave()`.

---

### Step 4: Rendering Transaction Card
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14979-L15009)
* **Line Numbers**: 14979-15009
* **Called From**: `engine.js`
* **Inputs**: Result transaction payload
* **Outputs**: Dispatches balance card image to WhatsApp group

```javascript
                    const result = economy.deposit(senderJid, amount);
                    if (result.success) {
                      try {
                        const pfpUrl = await sock.profilePictureUrl(senderJid, 'image').catch(() => null);
                        const imgBuf = await goService.generateTransactionCard({
                          nickname: result.nickname,
                          type: "DEPOSIT",
                          amount: result.amount,
                          newWallet: result.wallet,
                          newBank: result.bank,
                          zeniSymbol: economy.getZENI(),
                          pfpUrl: pfpUrl
                        });
                        if (imgBuf) {
                          await sock.sendMessage(chatId, {
                            image: imgBuf,
                            caption: BOT_MARKER + result.message,
                          });
                        } else {
                          throw new Error("No image buffer");
                        }
                      } catch (e) {
                        await sock.sendMessage(chatId, {
                          text: BOT_MARKER + result.message,
                        });
                      }
                    } else {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + result.message,
                      });
                    }
```

#### Explanation
- Upon successful execution of `deposit()`, fetches the user's profile image and calls `goService.generateTransactionCard` with the type `"DEPOSIT"`.
- If successful, sends the transaction confirmation card graphic to the WhatsApp thread. If it fails, falls back to text.

---

## 4. How to Modify
To adjust limits or parameters:
- **Enforce Deposit Taxes (optional)**: You can deduct a bank processing fee (e.g. 5%) before depositing in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L687):
  ```javascript
  const tax = Math.floor(amount * 0.05);
  user.wallet -= amount;
  user.bank += (amount - tax); // Deposits amount minus 5% fee
  ```
- **Limit Bank Capacity**: Impose maximum limits on the bank balance depending on adventurer rank or user level by editing validations inside the `deposit` function in `core/rpg/economy.js`.










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
const args = txt.split(` `);
let amount = args[2];
```
**How it works here**: The code is declaring a constant variable `args` and assigning it the result of splitting the `txt` string into an array. Then, it declares a `let` variable `amount` and assigns it the third element of the `args` array.
**Why it's used**: Variables are used to store the result of the split operation and the amount value, so they can be used later in the code.
**If you change/remove it**: If you remove the `const args` declaration, the code will throw an error because `args` is not defined. If you remove the `let amount` declaration, the code will throw an error because `amount` is not defined.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They have an implicit return statement.
**General Example**
```javascript
const greet = (name) => `Hello, ${name}!`;
console.log(greet('John')); // Outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code is defining an event listener for the `messages.upsert` event, and the event listener is an arrow function that takes an object with `messages` and `type` properties as an argument.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, such as event listeners, in a concise way.
**If you change/remove it**: If you remove the arrow function, the code will throw an error because the event listener is not defined. If you change it to a regular function, the code will still work, but it will be less concise.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are used to respond to user interactions, network requests, and other events.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code is defining an event listener for the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events, such as receiving a new message, and perform actions accordingly.
**If you change/remove it**: If you remove the event listener, the code will not respond to the `messages.upsert` event. If you change the event name, the code will listen for a different event.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions.
**General Example**
```javascript
const age = 25;
if (age >= 18) {
  console.log('You are an adult!');
} else {
  console.log('You are a minor!');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: The code is checking two conditions: if the `type` is not "notify" or "append", and if `isRekeying` is true. If either condition is true, the function returns immediately.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on conditions.
**If you change/remove it**: If you remove the conditional statements, the code will not check for these conditions and may execute incorrectly. If you change the conditions, the code will make different decisions.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((num) => num * 2);
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
**How it works here**: The code is using the `map` method to transform the `messages` array into a new array of promises, and then using `Promise.all` to wait for all the promises to resolve.
**Why it's used**: Array methods are used to manipulate and transform arrays in a concise and efficient way.
**If you change/remove it**: If you remove the `map` method, the code will not transform the `messages` array. If you change the `map` method to a different method, the code will transform the array differently.

---
### Concept 6: Promise
A promise is a result object that is used to handle asynchronous operations.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Result!');
});
promise.then((result) => {
  console.log(result); // Outputs: Result!
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
**How it works here**: The code is using `Promise.all` to wait for all the promises in the `messages` array to resolve.
**Why it's used**: Promises are used to handle asynchronous operations and ensure that the code waits for the operations to complete before continuing.
**If you change/remove it**: If you remove the `Promise.all` statement, the code will not wait for the promises to resolve and may execute incorrectly. If you change the `Promise.all` statement to a different method, the code will handle the promises differently.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that makes asynchronous code look and feel synchronous.
**General Example**
```javascript
async function example() {
  const result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code is defining an async function that uses the `await` keyword to wait for promises to resolve.
**Why it's used**: Async/await is used to make asynchronous code look and feel synchronous, making it easier to read and write.
**If you change/remove it**: If you remove the `async` keyword, the code will not be able to use the `await` keyword. If you change the `await` keyword to a different method, the code will handle the promises differently.

---
### Concept 8: String Manipulation
String manipulation is used to transform and manipulate strings.
**General Example**
```javascript
const str = 'Hello, World!';
const upperCaseStr = str.toUpperCase();
console.log(upperCaseStr); // Outputs: HELLO, WORLD!
```
**In Our Code**
```javascript
const lowerTxt = txt.toLowerCase();
```
**How it works here**: The code is using the `toLowerCase` method to convert the `txt` string to lowercase.
**Why it's used**: String manipulation is used to transform and manipulate strings, making it easier to compare and process them.
**If you change/remove it**: If you remove the `toLowerCase` method, the code will not convert the `txt` string to lowercase. If you change the `toLowerCase` method to a different method, the code will transform the string differently.

---
### Concept 9: Number Parsing
Number parsing is used to convert strings to numbers.
**General Example**
```javascript
const str = '123';
const num = parseInt(str);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
amount = parseInt(amount);
```
**How it works here**: The code is using the `parseInt` function to convert the `amount` string to a number.
**Why it's used**: Number parsing is used to convert strings to numbers, making it possible to perform mathematical operations on them.
**If you change/remove it**: If you remove the `parseInt` function, the code will not convert the `amount` string to a number. If you change the `parseInt` function to a different method, the code will parse the string differently.

---
### Concept 10: Object Destructuring
Object destructuring is used to extract properties from objects and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code is using object destructuring to extract the `messages` and `type` properties from the object passed to the event listener.
**Why it's used**: Object destructuring is used to extract properties from objects and assign them to variables, making it easier to access and use the properties.
**If you change/remove it**: If you remove the object destructuring, the code will not extract the properties from the object. If you change the object destructuring to a different method, the code will extract the properties differently.

---
### Concept 11: Functions
Functions are reusable blocks of code that take arguments and return values.
**General Example**
```javascript
function add(a, b) {
  return a + b;
}
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
function deposit(userId, amount) {
  // ...
}
```
**How it works here**: The code is defining a function `deposit` that takes two arguments, `userId` and `amount`, and returns an object with the result of the deposit operation.
**Why it's used**: Functions are used to encapsulate code and make it reusable, making it easier to maintain and modify the code.
**If you change/remove it**: If you remove the function, the code will not be able to perform the deposit operation. If you change the function to a different implementation, the code will perform the deposit operation differently.

---
### Concept 12: Database Operations
Database operations are used to interact with a database, such as storing, retrieving, and updating data.
**General Example**
```javascript
const db = require('db');
db.insert({ name: 'John', age: 25 });
```
**In Our Code**
```javascript
const user = getUser(userId);
user.wallet -= amount;
user.bank += amount;
```
**How it works here**: The code is interacting with a database to retrieve a user's data, update the user's wallet and bank balance, and store the updated data.
**Why it's used**: Database operations are used to interact with a database, making it possible to store, retrieve, and update data.
**If you change/remove it**: If you remove the database operations, the code will not be able to interact with the database. If you change the database operations to a different implementation, the code will interact with the database differently.

---
### Concept 13: Error Handling
Error handling is used to catch and handle errors that occur during the execution of the code.
**General Example**
```javascript
try {
  // code that may throw an error
} catch (error) {
  console.log(error);
}
```
**In Our Code**
```javascript
try {
  const imgBuf = await goService.generateTransactionCard({
    // ...
  });
  // ...
} catch (e) {
  await sock.sendMessage(chatId, {
    text: BOT_MARKER + result.message,
  });
}
```
**How it works here**: The code is using a try-catch block to catch any errors that occur during the execution of the code, and handling the error by sending a message to the user.
**Why it's used**: Error handling is used to catch and handle errors, making it possible to provide a better user experience and prevent the code from crashing.
**If you change/remove it**: If you remove the error handling, the code will not be able to catch and handle errors, and may crash or behave unexpectedly. If you change the error handling to a different implementation, the code will handle errors differently.
