# Withdraw Command Flow (`withdraw`, `with`)

## 1. Description
The Withdraw command moves Zeni from the user's secure Bank vault to their active Wallet. This command also logs the withdrawal in the daily gambling cap profile (`user.gamblingProfile.withdrawnToday`) to accurately offset net win computations.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j withdraw 500" or ".j with all"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "withdraw" || "with") (L15012)
            └── Parse amount or "all":
                └── if ("all") bankBalance = economy.getBankBalance(senderJid).bank (L15039)
                └── else amount = parseInt(amount) (L15042)
            └── core/rpg/economy.js
                └── withdraw(senderJid, amount) (L712)
                    └── getUser(senderJid)
                    └── bank -= amount, wallet += amount
                    └── Update gambling daily cap offset: gamblingProfile.withdrawnToday += amount (L744)
                    └── logTransaction(senderJid, "Bank Withdrawal", amount, wallet)
                    └── scheduleSave(senderJid)
            └── try: Generate graphic via Go service
                └── goService.generateTransactionCard(data) (L15056)
                └── sock.sendMessage(chatId, { image: cardBuffer, caption: ... })
            └── catch/fallback:
                └── sock.sendMessage(chatId, { text: result.message }) (L15080)
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L15012-L15050)
* **Line Numbers**: 15012-15050
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Numeric withdrawal `amount` or exits if invalid

```javascript
                  // withdraw <amount> / .joker with <amount>
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} withdraw` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} withdraw `,
                    ) ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} with` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} with `,
                    )
                  ) {
                    const args = txt.split(` `);
                    let amount = args[2];

                    if (!amount) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} withdraw <amount|all>\``,
                      });
                      return;
                    }

                    // Handle "all" keyword
                    if (amount.toLowerCase() === `all`) {
                      const bankData = economy.getBankBalance(senderJid);
                      amount = bankData.bank;
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
- Catches the trigger commands (`withdraw` or `with`).
- Extracts the quantity parameter. If the argument is `"all"`, it queries `economy.getBankBalance(senderJid)` to resolve the full quantity currently held in the user's bank.
- Validates that the amount parsed is a positive integer.

---

### Step 3: Bank Withdrawal Logic and Gambling Cap Synchronization
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L712-L749)
* **Line Numbers**: 712-749
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId, amount)`
* **Outputs**: `{ success: boolean, message: string, amount, wallet, bank, nickname }`

```javascript
function withdraw(userId, amount) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };
  
  if (amount <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be greater than ${getZENI()}0` };
  }
  
  if (user.bank < amount) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n🏦 Bank balance: ${getZENI()}${user.bank.toLocaleString()}\n📊 Attempting to withdraw: ${getZENI()}${amount.toLocaleString()}` };
  }
  
  user.bank -= amount;
  user.wallet += amount;

  const today = getTodayKey();
  if (!user.gamblingProfile) {
    user.gamblingProfile = {
      dayKey: today,
      roundsToday: 0,
      entryWalletToday: user.wallet || 0,
      withdrawnToday: 0,
      netToday: 0
    };
  }
  if (user.gamblingProfile.dayKey !== today) {
    user.gamblingProfile.dayKey = today;
    user.gamblingProfile.roundsToday = 0;
    user.gamblingProfile.entryWalletToday = user.wallet || 0;
    user.gamblingProfile.withdrawnToday = 0;
    user.gamblingProfile.netToday = 0;
  }
  user.gamblingProfile.withdrawnToday = (user.gamblingProfile.withdrawnToday || 0) + amount;
  
  logTransaction(userId, "Bank Withdrawal", amount, user.wallet);

  scheduleSave(userId);
```

#### Explanation
1. Validates that the user exists and has a bank balance greater than or equal to the requested withdrawal amount.
2. Deducts the Zeni amount from `user.bank` and adds it to `user.wallet`.
3. Checks or initializes `user.gamblingProfile` to ensure it is synchronized with the current date calendar key.
4. **Gambling Cap Correction**: Adds the withdrawn amount to `user.gamblingProfile.withdrawnToday`. This increases the daily wallet profit limit dynamically so that withdrawing funds doesn't trigger a forced gambling loss state.
5. Logs the event via `logTransaction` with the description `"Bank Withdrawal"`.
6. Triggers background persistence saving via `scheduleSave()`.

---

### Step 4: Rendering Transaction Confirmation Card
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L15053-L15083)
* **Line Numbers**: 15053-15083
* **Called From**: `engine.js`
* **Inputs**: Result transaction payload
* **Outputs**: Dispatches balance card image to WhatsApp group

```javascript
                    const result = economy.withdraw(senderJid, amount);
                    if (result.success) {
                      try {
                        const pfpUrl = await sock.profilePictureUrl(senderJid, 'image').catch(() => null);
                        const imgBuf = await goService.generateTransactionCard({
                          nickname: result.nickname,
                          type: "WITHDRAW",
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
- Upon successful execution of `withdraw()`, fetches the user's profile image and calls `goService.generateTransactionCard` with the type `"WITHDRAW"`.
- If successful, sends the transaction confirmation card graphic to the WhatsApp thread. If it fails, falls back to text.

---

## 5. How to Modify
To adjust limits or parameters:
- **Tax Withdrawal Processing (optional)**: You can deduct a bank processing fee (e.g. 2%) when withdrawing in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L724):
  ```javascript
  const fee = Math.floor(amount * 0.02);
  user.bank -= amount;
  user.wallet += (amount - fee); // Charges 2% processing fee
  ```










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and manipulate data in a program. They have a name, and you can assign a value to them.
**General Example**
```javascript
let name = 'John';
console.log(name); // outputs: John
```
**In Our Code**
```javascript
const args = txt.split(` `);
let amount = args[2];
```
**How it works here**: The code declares a variable `args` and assigns it the result of splitting the `txt` string into an array. Then, it declares another variable `amount` and assigns it the third element of the `args` array.
**Why it's used**: Variables are used to store the result of the string splitting operation and the amount value, so they can be used later in the code.
**If you change/remove it**: If you remove the `let amount = args[2];` line, the `amount` variable would not be declared, and the code would throw an error when trying to use it. If you change the value of `args[2]`, the `amount` variable would have a different value.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They have an implicit return statement.
**General Example**
```javascript
const greet = (name) => `Hello, ${name}!`;
console.log(greet('John')); // outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code defines an event listener for the `messages.upsert` event, and the event handler is an arrow function that takes an object with `messages` and `type` properties.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, like event handlers, in a concise way.
**If you change/remove it**: If you remove the arrow function, the event listener would not be defined, and the code would not respond to the `messages.upsert` event. If you change the arrow function to a traditional function, the code would still work, but it would be less concise.

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
**How it works here**: The code defines an event listener for the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events, like new messages, and perform actions accordingly.
**If you change/remove it**: If you remove the event listener, the code would not respond to the `messages.upsert` event, and the message processing logic would not be executed. If you change the event listener to listen for a different event, the code would respond to that event instead.

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
**How it works here**: The code checks the `type` variable and returns immediately if it's not `"notify"` or `"append"`. It also checks the `isRekeying` variable and returns immediately if it's true.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on conditions.
**If you change/remove it**: If you remove the conditional statements, the code would not check the `type` and `isRekeying` variables, and it would execute the following code regardless of their values. If you change the conditions, the code would make different decisions and execute different blocks of code.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The code uses the `map()` method to transform the `messages` array into an array of promises, and then uses `Promise.all()` to wait for all the promises to resolve.
**Why it's used**: Array methods are used to manipulate and transform arrays, like mapping over the `messages` array and creating an array of promises.
**If you change/remove it**: If you remove the `map()` method, the code would not transform the `messages` array, and it would not create an array of promises. If you change the `map()` method to a different array method, the code would transform the array differently.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, like network requests or database queries.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Success!');
});
promise.then((result) => {
  console.log(result); // outputs: Success!
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
**How it works here**: The code uses `Promise.all()` to wait for all the promises in the `messages` array to resolve.
**Why it's used**: Promises are used to handle asynchronous operations, like waiting for multiple promises to resolve.
**If you change/remove it**: If you remove the `Promise.all()` method, the code would not wait for all the promises to resolve, and it would continue executing the following code immediately. If you change the `Promise.all()` method to a different promise method, the code would handle the promises differently.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises, making it easier to write asynchronous code.
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
**How it works here**: The code defines an async function as the event handler for the `messages.upsert` event, allowing it to use the `await` keyword to wait for promises to resolve.
**Why it's used**: Async/await is used to make asynchronous code easier to read and write, by allowing the use of the `await` keyword to wait for promises to resolve.
**If you change/remove it**: If you remove the `async` keyword, the code would not be able to use the `await` keyword, and it would have to use the `then()` method to handle promises. If you change the `async` function to a traditional function, the code would not be able to use the `await` keyword.

---
### Concept 8: String Manipulation
String manipulation is used to transform and manipulate strings.
**General Example**
```javascript
const str = 'Hello, World!';
const upperCaseStr = str.toUpperCase();
console.log(upperCaseStr); // outputs: HELLO, WORLD!
```
**In Our Code**
```javascript
const lowerTxt = txt.toLowerCase();
```
**How it works here**: The code uses the `toLowerCase()` method to convert the `txt` string to lowercase.
**Why it's used**: String manipulation is used to transform and manipulate strings, like converting to lowercase or uppercase.
**If you change/remove it**: If you remove the `toLowerCase()` method, the code would not convert the `txt` string to lowercase, and it would use the original string. If you change the `toLowerCase()` method to a different string manipulation method, the code would transform the string differently.

---
### Concept 9: Object Destructuring
Object destructuring is used to extract properties from an object and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // outputs: John
console.log(age); // outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The code uses object destructuring to extract the `messages` and `type` properties from the object passed to the event handler.
**Why it's used**: Object destructuring is used to extract properties from an object and assign them to variables, making the code more concise and easier to read.
**If you change/remove it**: If you remove the object destructuring, the code would have to access the properties using the dot notation, like `obj.messages` and `obj.type`. If you change the object destructuring to a different syntax, the code would extract the properties differently.

---
### Concept 10: Numbers Parsing
Numbers parsing is used to convert strings to numbers.
**General Example**
```javascript
const str = '123';
const num = parseInt(str);
console.log(num); // outputs: 123
```
**In Our Code**
```javascript
amount = parseInt(amount);
```
**How it works here**: The code uses the `parseInt()` function to convert the `amount` string to a number.
**Why it's used**: Numbers parsing is used to convert strings to numbers, like converting the `amount` string to a number.
**If you change/remove it**: If you remove the `parseInt()` function, the code would not convert the `amount` string to a number, and it would use the original string. If you change the `parseInt()` function to a different numbers parsing function, the code would convert the string differently.

---
### Concept 11: Database Operations
Database operations are used to interact with a database, like storing or retrieving data.
**General Example**
```javascript
const db = require('db');
db.insert({ name: 'John', age: 25 });
```
**In Our Code**
```javascript
const user = getUser(userId);
user.bank -= amount;
user.wallet += amount;
```
**How it works here**: The code interacts with a database, like storing or retrieving user data, and updates the user's bank and wallet balances.
**Why it's used**: Database operations are used to interact with a database, like storing or retrieving data, and updating the user's balances.
**If you change/remove it**: If you remove the database operations, the code would not interact with the database, and it would not update the user's balances. If you change the database operations to a different syntax, the code would interact with the database differently.

---
### Concept 12: Error Handling
Error handling is used to catch and handle errors that occur during the execution of the code.
**General Example**
```javascript
try {
  // code that might throw an error
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
**How it works here**: The code catches any errors that occur during the execution of the `generateTransactionCard()` function and sends a message to the user with the error message.
**Why it's used**: Error handling is used to catch and handle errors that occur during the execution of the code, providing a better user experience.
**If you change/remove it**: If you remove the error handling, the code would not catch any errors that occur during the execution of the code, and it would crash or produce unexpected behavior. If you change the error handling to a different syntax, the code would handle errors differently.
