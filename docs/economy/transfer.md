# Transfer Command Flow (`transfer`, `send`)

## 1. Description
The Transfer (also aliased as `send`) command allows registered users to transfer Zeni from their Wallet directly into another registered user's Wallet.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j transfer @user 100" or ".j send @user 100"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "transfer" || "send") (L14784)
            └── Get target recipient: getMentionOrReply(m) (L14802)
            └── Parse amount: parseInt(args[args.length - 1]) (L14820)
            └── Validate positive amount
            └── core/rpg/economy.js
                └── transferMoney(senderJid, receiverJid, amount) (L631)
                    └── getUser(senderJid), getUser(receiverJid)
                    └── sender.wallet -= amount, receiver.wallet += amount
                    └── logTransaction(senderJid, `Transfer to @recipient`, -amount, sender.wallet)
                    └── logTransaction(receiverJid, `Transfer from @sender`, amount, receiver.wallet)
                    └── scheduleSave(senderJid)
                    └── scheduleSave(receiverJid)
            └── try: Generate graphic via Go service
                └── goService.generateTransactionCard(data) (L14840)
                └── sock.sendMessage(chatId, { image: cardBuffer, caption: ... })
            └── catch/fallback:
                └── sock.sendMessage(chatId, { text: result.message }) (L14859)
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

### Step 2: Command Matching and Parameter Extraction
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14784-L14830)
* **Line Numbers**: 14784-14830
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Resolved `receiver` target JID and parsed `amount`

```javascript
                  // transfer @user <amount> / .joker send @user <amount>
                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} transfer`,
                    ) ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} send`,
                    )
                  ) {
                    if (!economy.isRegistered(senderJid)) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\` nudge`,
                      });
                      return;
                    }

                    const receiver = getMentionOrReply(m);

                    if (!receiver) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Tag someone or reply to them to send money! ... (Usage)`,
                      });
                      return;
                    }

                    const args = txt.split(` `);
                    const amount = parseInt(args[args.length - 1]); // Last arg is amount

                    if (isNaN(amount) || amount <= 0) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          "❌ Invalid amount! Must be a positive number.",
                      });
                      return;
                    }
```

#### Explanation
- Identifies commands starting with `transfer` or `send`.
- Validates the sender is registered.
- Extracts target user JID using `getMentionOrReply(m)` which reads the mentioned user list or reply message context.
- Reads the last word of the message text as the transfer amount and validates that it is a positive integer.

---

### Step 3: Core Transfer Transactions
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L631-L673)
* **Line Numbers**: 631-673
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(fromUserId, toUserId, amount)`
* **Outputs**: `{ success: boolean, message: string, receiver, amount, wallet, bank, nickname }`

```javascript
function transferMoney(fromUserId, toUserId, amount) {
  const sender = getUser(fromUserId);
  const receiver = getUser(toUserId);
  
  if (!sender || !receiver) {
    return { success: false, message: `❌ *TRANSFER FAILED*\n\n⚠️ Both users must be registered to transfer money!` };
  }
  
  const val = Number(amount);
  if (isNaN(val) || val <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be a valid positive number.` };
  }
  
  if (sender.wallet < val) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n💰 Your wallet: ${getZENI()}${sender.wallet.toLocaleString()}\n📊 Needed: ${getZENI()}${val.toLocaleString()}\n⚠️ Short by: ${getZENI()}${(val - sender.wallet).toLocaleString()}` };
  }
  
  sender.wallet -= val;
  receiver.wallet += val;
  
  logTransaction(fromUserId, `Transfer to @${toUserId.split('@')[0]}`, -val, sender.wallet);
  logTransaction(toUserId, `Transfer from @${fromUserId.split('@')[0]}`, val, receiver.wallet);

  scheduleSave(fromUserId);
  scheduleSave(toUserId);
```

#### Explanation
1. Checks that both the sender and the receiver profiles exist in the `economyData` cache.
2. Validates that the sender has enough money in their wallet to cover the transaction value.
3. Decrements `sender.wallet` and increments `receiver.wallet`.
4. Logs two distinct transaction events: one negative record on the sender's log and one positive record on the receiver's log.
5. Schedules asynchronous MongoDB updates for both user documents.

---

### Step 4: confirmation Card Render and Response dispatch
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14837-L14872)
* **Line Numbers**: 14837-14872
* **Called From**: `engine.js`
* **Inputs**: Result payload
* **Outputs**: Confirms transfer back to WhatsApp

```javascript
                    if (result.success) {
                      try {
                        const pfpUrl = await sock.profilePictureUrl(senderJid, 'image').catch(() => null);
                        const imgBuf = await goService.generateTransactionCard({
                          nickname: result.nickname,
                          type: "TRANSFER",
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
                            contextInfo: { mentionedJid: [result.receiver] },
                          });
                        } else {
                          throw new Error("No image buffer");
                        }
                      } catch (e) {
                        await sock.sendMessage(chatId, {
                          text: BOT_MARKER + result.message,
                          contextInfo: { mentionedJid: [result.receiver] },
                        });
                      }
                    } else {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + result.message,
                      });
                    }
```

#### Explanation
- Invokes the transaction card service to draw a visual receipt.
- Sends the graphic (or fallback text) back to WhatsApp, mentioning/tagging the recipient.
- Triggers progression rewards for the sender.

---

## 4. How to Modify
To adjust transfer limitations:
- **Set Minimum/Maximum Transfer Limits**: Enforce boundaries in the `transferMoney` function in [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L642):
  ```javascript
  if (val < 100) return { success: false, message: "❌ Minimum transfer amount is 100 Zeni!" };
  ```
- **Introduce Transaction tax**: Enforce processing fees on peer transfers by updating [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L648):
  ```javascript
  const transferTax = Math.floor(val * 0.03); // 3% fee
  sender.wallet -= val;
  receiver.wallet += (val - transferTax);
  ```










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
const sender = getUser(fromUserId);
const receiver = getUser(toUserId);
```
**How it works here**: Variables `sender` and `receiver` are used to store the user objects retrieved from the `getUser` function.
**Why it's used**: Variables are used to store and reuse values in the program, making the code more readable and efficient.
**If you change/remove it**: If you remove the variables, you would have to repeat the `getUser` function calls everywhere you need the user objects, making the code more verbose and prone to errors.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They have an implicit return statement and can be defined with or without parameters.
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
**How it works here**: An arrow function is used as an event listener for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and readable.
**If you change/remove it**: If you remove the arrow function, the event listener would not be defined, and the code would not respond to the `messages.upsert` event.

---
### Concept 3: Event Listeners
Event listeners are functions that are called when a specific event occurs. They are used to respond to user interactions, network requests, or other events.
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
**How it works here**: An event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events and update the program state accordingly.
**If you change/remove it**: If you remove the event listener, the program would not respond to the `messages.upsert` event, and the code would not update the message state.

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
**How it works here**: Conditional statements are used to check the `type` and `isRekeying` variables and return early if the conditions are not met.
**Why it's used**: Conditional statements are used to make decisions and execute different blocks of code based on conditions.
**If you change/remove it**: If you remove the conditional statements, the code would not check the `type` and `isRekeying` variables, and the program might execute incorrect code paths.

---
### Concept 5: Array Methods
Array methods are used to manipulate and transform arrays.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map((num) => num * 2);
console.log(doubled); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: The `map` method is used to transform the `messages` array into an array of promises, which are then awaited using `Promise.all`.
**Why it's used**: Array methods are used to manipulate and transform arrays, making the code more concise and efficient.
**If you change/remove it**: If you remove the `map` method, the code would not transform the `messages` array, and the program might not execute the correct code path.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when an operation is complete.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Done!');
});
promise.then((result) => {
  console.log(result); // Outputs: Done!
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
**How it works here**: Promises are used to handle the asynchronous operations of processing the `messages` array.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when an operation is complete.
**If you change/remove it**: If you remove the promises, the code would not handle the asynchronous operations correctly, and the program might not execute the correct code path.

---
### Concept 7: Async/Await
Async/await is a syntax sugar on top of promises that makes asynchronous code look and feel like synchronous code.
**General Example**
```javascript
async function example() {
  const result = await promise;
  console.log(result);
}
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  })
);
```
**How it works here**: Async/await is used to handle the asynchronous operations of processing the `messages` array.
**Why it's used**: Async/await is used to make asynchronous code look and feel like synchronous code, making it easier to read and maintain.
**If you change/remove it**: If you remove the async/await syntax, the code would not handle the asynchronous operations correctly, and the program might not execute the correct code path.

---
### Concept 8: String Methods
String methods are used to manipulate and transform strings.
**General Example**
```javascript
const str = 'Hello, World!';
const lower = str.toLowerCase();
console.log(lower); // Outputs: hello, world!
```
**In Our Code**
```javascript
const lowerTxt = txt.toLowerCase();
```
**How it works here**: The `toLowerCase` method is used to convert the `txt` string to lowercase.
**Why it's used**: String methods are used to manipulate and transform strings, making the code more concise and efficient.
**If you change/remove it**: If you remove the `toLowerCase` method, the code would not convert the `txt` string to lowercase, and the program might not execute the correct code path.

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
const amount = parseInt(args[args.length - 1]);
```
**How it works here**: The `parseInt` function is used to convert the last argument to a number.
**Why it's used**: Number parsing is used to convert strings to numbers, making the code more concise and efficient.
**If you change/remove it**: If you remove the `parseInt` function, the code would not convert the last argument to a number, and the program might not execute the correct code path.

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
const { messages, type } = sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: Object destructuring is used to extract the `messages` and `type` properties from the event object.
**Why it's used**: Object destructuring is used to extract properties from objects and assign them to variables, making the code more concise and efficient.
**If you change/remove it**: If you remove the object destructuring, the code would not extract the `messages` and `type` properties, and the program might not execute the correct code path.

---
### Concept 11: Functions
Functions are reusable blocks of code that take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function transferMoney(fromUserId, toUserId, amount) {
  // ...
}
```
**How it works here**: A function is defined to transfer money from one user to another.
**Why it's used**: Functions are used to encapsulate reusable code and make the program more modular and maintainable.
**If you change/remove it**: If you remove the function, the code would not have a reusable block of code to transfer money, and the program might not execute the correct code path.

---
### Concept 12: Error Handling
Error handling is used to catch and handle errors that occur during the execution of the program.
**General Example**
```javascript
try {
  // Code that might throw an error
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
    contextInfo: { mentionedJid: [result.receiver] },
  });
}
```
**How it works here**: Error handling is used to catch and handle errors that occur during the generation of the transaction card.
**Why it's used**: Error handling is used to catch and handle errors, making the program more robust and reliable.
**If you change/remove it**: If you remove the error handling, the program would not catch and handle errors, and the program might crash or produce unexpected behavior.
