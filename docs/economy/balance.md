# Balance Command Flow (`balance`, `bal`, `money`)

## 1. Description
The Balance command displays the user's current Wallet, Bank, Frozen Assets, and Total wealth. It renders a graphic balance card using an external image generation microservice (Go service) or falls back to text formatted with a local Zeni logo asset.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j balance" or ".j bal" or ".j money"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "balance" || "bal" || "money") (L14526)
            └── Check registration: economy.isRegistered(senderJid) (L14532)
            └── core/rpg/economy.js
                └── getBankBalance(senderJid) (L768)
                    └── getUser(senderJid) (L261)
            └── try: Generate graphic via Go service
                └── goService.generateEconomyCard(data) (L14564)
                └── sock.sendMessage(chatId, { image: cardBuffer, caption: ... })
            └── catch/fallback:
                └── Read local asset: fs.readFileSync("assets/zeni.png") (L14597)
                └── sock.sendMessage(chatId, { image: zeniImage, caption: balText })
                └── OR sock.sendMessage(chatId, { text: balText })
            └── awardProgression(senderJid, chatId) (L14607)
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

### Step 2: Command Matching and Registration Validation
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14526-L14539)
* **Line Numbers**: 14526-14539
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Rejects request if user is not registered

```javascript
                  // ${botConfig.getPrefix().toLowerCase()} balance / ${botConfig.getPrefix().toLowerCase()} bal - Check your balance
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} balance` ||
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} bal` ||
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} money`
                  ) {
                    if (!economy.isRegistered(senderJid)) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\``,
                      });
                      return;
                    }
```

#### Explanation
- Matches commands `.j balance`, `.j bal`, or `.j money`.
- Checks if the user is registered. If they are not registered in the system, it halts execution and replies with the registration guide.

---

### Step 3: Fetch Balance Details
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L768-L778)
* **Line Numbers**: 768-778
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId)`
* **Outputs**: `{ wallet: number, bank: number, total: number }`

```javascript
function getBankBalance(userId) {
  const user = getUser(userId);
  if (!user) return { wallet: 0, bank: 0, total: 0 };
  
  return {
    wallet: user.wallet,
    bank: user.bank,
    total: user.wallet + user.bank
  };
}
```

#### Explanation
- Retrieves the user state object from the cache.
- Extracts `wallet` and `bank` properties and returns the calculated sum as `total`.

---

### Step 4: Render Profile Card (Go Service Graphic Card)
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14557-L14586)
* **Line Numbers**: 14557-14586
* **Called From**: `engine.js`
* **Inputs**: Nickname, wallet, bank, total, frozen assets, rank, level, and profile picture URL
* **Outputs**: Formatted image buffer of the balance card

```javascript
                    // Try to use the Go image service for a beautiful economy card
                    try {
                      let pfpUrl = "";
                      try {
                        pfpUrl = await sock.profilePictureUrl(senderJid, "image");
                      } catch (e) {}

                      const cardBuffer = await goService.generateEconomyCard({
                        nickname: user.nickname || senderJid.split("@")[0],
                        wallet: balance.wallet || 0,
                        bank: balance.bank || 0,
                        total: balance.total || 0,
                        frozen:
                          (user.frozenAssets?.wallet || 0) +
                          (user.frozenAssets?.bank || 0),
                        zeniSymbol: economy.getZENI(),
                        rank: user.adventurerRank || "F",
                        level: progression.getLevel(senderJid),
                        pfpUrl: pfpUrl,
                      });
                      if (cardBuffer) {
                        await sock.sendMessage(chatId, {
                          image: cardBuffer,
                          caption:
                            BOT_MARKER + `💰 *${user.nickname || "Balance"}*`,
                          mentions: [senderJid],
                        });
                        await awardProgression(senderJid, chatId);
                        return;
                      }
                    } catch (imgErr) {
                      console.log(
                        "[Balance] Go image service unavailable, using fallback:",
                        imgErr.message,
                      );
                    }
```

#### Explanation
- Tries to fetch the user's WhatsApp profile picture URL.
- Contacts `goService.generateEconomyCard` (defined in Go backend helper) to generate an image card containing user stats and levels.
- Sends the image directly to WhatsApp. If the service fails, it falls back to the text/static asset method.

---

### Step 5: Fallback Message Rendering
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14593-L14609)
* **Line Numbers**: 14593-14609
* **Called From**: `engine.js` (Catch block of Go service)
* **Inputs**: Formatted text `balText`
* **Outputs**: Text message sent to WhatsApp group, optionally with Zeni asset image

```javascript
                    // Fallback: text or static image
                    const zeniPath = botConfig.getAssetPath("zeni.png");
                    if (fs.existsSync(zeniPath)) {
                      await sock.sendMessage(chatId, {
                        image: fs.readFileSync(zeniPath),
                        caption: BOT_MARKER + balText,
                        mentions: [senderJid],
                      });
                    } else {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + balText,
                        mentions: [senderJid],
                      });
                    }
                    await awardProgression(senderJid, chatId);
                    return;
```

#### Explanation
- Checks if a static `zeni.png` exists in the local assets.
- If it exists, sends that image with the balance text as a caption. Otherwise, sends the raw balance string.
- Grants player progression XP/points.

---

## 4. How to Modify
To adjust the presentation or change the image card styles:
- **Configure Balance Graphic Card Design**: Modify the balance card parameters sent to `generateEconomyCard` in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14564).
- **Modify Fallback Text Format**: Adjust the `balText` string layout in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14544-L14555).
- **Zeni Symbol Currency Override**: Change currency configurations in `botConfig.js`.










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
const user = getUser(userId);
```
**How it works here**: In the provided code snippets, variables are used to store values such as `user`, `balance`, `senderJid`, and `chatId`. These variables hold the values retrieved from functions or other parts of the code.
**Why it's used**: Variables are used to make the code more readable and easier to understand. They allow you to give a name to a value, making it easier to use and reuse throughout the code.
**If you change/remove it**: If you change or remove a variable, the code may break or produce unexpected results. For example, if you remove the `user` variable, the code will throw an error when trying to access `user.nickname`.

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
**How it works here**: In the provided code snippets, arrow functions are used as event listeners and as callbacks for promises. They define small, single-purpose functions that are executed when a specific event occurs or when a promise is resolved.
**Why it's used**: Arrow functions are used to make the code more concise and easier to read. They allow you to define small functions without the need for a separate `function` declaration.
**If you change/remove it**: If you change or remove an arrow function, the code may break or produce unexpected results. For example, if you remove the arrow function used as an event listener, the code will not respond to the `messages.upsert` event.

---
### Concept 3: Event Listeners
Event listeners are functions that are executed when a specific event occurs. They are used to respond to user interactions, network requests, and other events.
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
**How it works here**: In the provided code snippets, event listeners are used to respond to the `messages.upsert` event. When this event occurs, the event listener function is executed, allowing the code to process the new messages.
**Why it's used**: Event listeners are used to make the code interactive and responsive. They allow the code to respond to user interactions and other events, making the program more dynamic and engaging.
**If you change/remove it**: If you change or remove an event listener, the code may not respond to the event, or it may respond in an unexpected way. For example, if you remove the event listener for the `messages.upsert` event, the code will not process new messages.

---
### Concept 4: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions or decisions. They are used to make the code more flexible and adaptive.
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
```
**How it works here**: In the provided code snippets, conditional statements are used to make decisions based on the `type` variable. If the `type` is not "notify" or "append", the function returns immediately.
**Why it's used**: Conditional statements are used to make the code more flexible and adaptive. They allow the code to respond to different conditions and make decisions based on the input or context.
**If you change/remove it**: If you change or remove a conditional statement, the code may produce unexpected results or behave differently. For example, if you remove the conditional statement that checks the `type` variable, the code may process messages of any type, leading to unexpected behavior.

---
### Concept 5: Array Methods
Array methods are used to manipulate and process arrays. They are used to perform operations such as mapping, filtering, and reducing.
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
**How it works here**: In the provided code snippets, array methods are used to process the `messages` array. The `map` method is used to transform each message into a promise, and the `Promise.all` method is used to wait for all the promises to resolve.
**Why it's used**: Array methods are used to make the code more concise and efficient. They allow the code to perform complex operations on arrays in a simple and expressive way.
**If you change/remove it**: If you change or remove an array method, the code may produce unexpected results or behave differently. For example, if you remove the `map` method, the code will not transform each message into a promise, leading to unexpected behavior.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations. They represent a value that may not be available yet, but will be resolved at some point in the future.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // ...
  resolve('Hello, world!');
});
promise.then((message) => {
  console.log(message); // Outputs: Hello, world!
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
**How it works here**: In the provided code snippets, promises are used to handle asynchronous operations such as sending messages and processing user data. The `Promise.all` method is used to wait for all the promises to resolve.
**Why it's used**: Promises are used to make the code more asynchronous and efficient. They allow the code to perform complex operations in the background, without blocking the main thread.
**If you change/remove it**: If you change or remove a promise, the code may produce unexpected results or behave differently. For example, if you remove the `Promise.all` method, the code will not wait for all the promises to resolve, leading to unexpected behavior.

---
### Concept 7: Object Destructuring
Object destructuring is used to extract properties from an object and assign them to variables. It is a concise way to access object properties.
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
**How it works here**: In the provided code snippets, object destructuring is used to extract properties from the `sock.ev.on` event object. The `messages` and `type` properties are extracted and assigned to variables.
**Why it's used**: Object destructuring is used to make the code more concise and readable. It allows the code to access object properties in a simple and expressive way.
**If you change/remove it**: If you change or remove object destructuring, the code may produce unexpected results or behave differently. For example, if you remove the object destructuring, the code will not be able to access the `messages` and `type` properties, leading to unexpected behavior.

---
### Concept 8: Functions
Functions are used to group a set of statements together to perform a specific task. They are reusable and can be called multiple times.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function getBankBalance(userId) {
  // ...
}
```
**How it works here**: In the provided code snippets, functions are used to perform specific tasks such as getting the bank balance or processing user data. The functions are reusable and can be called multiple times.
**Why it's used**: Functions are used to make the code more modular and reusable. They allow the code to perform complex operations in a simple and expressive way.
**If you change/remove it**: If you change or remove a function, the code may produce unexpected results or behave differently. For example, if you remove the `getBankBalance` function, the code will not be able to get the bank balance, leading to unexpected behavior.

---
### Concept 9: Try-Catch Blocks
Try-catch blocks are used to handle errors and exceptions in the code. They allow the code to catch and handle errors in a specific way.
**General Example**
```javascript
try {
  // code that may throw an error
} catch (error) {
  console.log(`Error: ${error.message}`);
}
```
**In Our Code**
```javascript
try {
  let pfpUrl = "";
  try {
    pfpUrl = await sock.profilePictureUrl(senderJid, "image");
  } catch (e) {}
  // ...
} catch (imgErr) {
  console.log("[Balance] Go image service unavailable, using fallback:", imgErr.message);
}
```
**How it works here**: In the provided code snippets, try-catch blocks are used to handle errors and exceptions when getting the profile picture URL or generating the economy card. The code catches any errors that occur and logs a message to the console.
**Why it's used**: Try-catch blocks are used to make the code more robust and error-friendly. They allow the code to handle errors and exceptions in a specific way, making the program more reliable and stable.
**If you change/remove it**: If you change or remove a try-catch block, the code may produce unexpected results or behave differently. For example, if you remove the try-catch block, the code will not be able to handle errors and exceptions, leading to unexpected behavior.

---
### Concept 10: Async/Await
Async/await is used to write asynchronous code that is easier to read and maintain. It allows the code to pause and resume execution at specific points.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: In the provided code snippets, async/await is used to write asynchronous code that is easier to read and maintain. The code uses async/await to pause and resume execution at specific points, making the code more efficient and scalable.
**Why it's used**: Async/await is used to make the code more asynchronous and efficient. It allows the code to perform complex operations in the background, without blocking the main thread.
**If you change/remove it**: If you change or remove async/await, the code may produce unexpected results or behave differently. For example, if you remove the async/await, the code will not be able to pause and resume execution at specific points, leading to unexpected behavior.
