# Stock Market Command Flow (`stocks`, `market`)

## 1. Description
The Stock Market system allows users to view stock prices, buy shares, sell shares, and view their stock portfolios. Five core companies are simulated with volatile prices updated dynamically over time.

---

## 2. Hierarchical Execution Tree

### Listing Stocks
```text
User sends ".j stocks" or ".j market"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " stocks" || "market") (L13924)
            └── core/rpg/stockMarket.js
                └── STOCKS constants iteration
            └── sock.sendMessage(chatId, { text: msg }) (L13937)
```

### Viewing Stock Portfolio
```text
User sends ".j stocks portfolio" or ".j stocks me"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " stocks ")) (L13941)
            └── Parse action: "portfolio" (L13947)
            └── core/rpg/stockMarket.js
                └── getPortfolio(senderJid) (L79)
                    └── Map shares in user.portfolio against STOCKS prices
            └── Formatting: Map shares details and total portfolio valuation
            └── sock.sendMessage(chatId, { text: msg }) (L13964)
```

### Buying Stocks
```text
User sends ".j stocks buy ARCH 10"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " stocks ")) (L13941)
            └── Parse args: action (buy), symbol (ARCH), amount (10) (L13969-L13970)
            └── core/rpg/stockMarket.js
                └── buyStock(senderJid, "ARCH", 10) (L35)
                    └── Fetch user, validate cost <= user.wallet
                    └── economy.removeMoney(senderJid, cost, description)
                    └── user.portfolio["ARCH"] += 10
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L13986)
```

### Selling Stocks
```text
User sends ".j stocks sell ARCH 10"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " stocks ")) (L13941)
            └── Parse args: action (sell), symbol (ARCH), amount (10) (L13969-L13970)
            └── core/rpg/stockMarket.js
                └── sellStock(senderJid, "ARCH", 10) (L57)
                    └── Fetch user, validate portfolio shares >= 10
                    └── Calculate payout = ARCH.price * 10
                    └── user.portfolio["ARCH"] -= 10
                    └── economy.addMoney(senderJid, payout, description)
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L13995)
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

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13923-L13945)
* **Line Numbers**: 13923-13945
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Redirects to stock market actions (Buy, Sell, Portfolio, List)

```javascript
                  // STOCK MARKET COMMANDS
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} stocks` ||
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} market`
                  ) {
                    let msg = `📈 *GLOBAL STOCK MARKET* 📈\n\n`;
                    for (const [symbol, stock] of Object.entries(
                      stockMarket.STOCKS,
                    )) {
                      msg += `• *${stock.name}* (\`${symbol}\`)\n  Price: ${economy.getZENI()}${stock.price.toLocaleString()}\n\n`;
                    }
                    ...
                    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
                    return;
                  }

                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} stocks `,
                    )
                  ) {
                    const parts = lowerTxt.split(" ");
                    const action = parts[2]?.toLowerCase();
                    ...
```

#### Explanation
- Recognizes stock market commands. If listing, loops through the in-memory `stockMarket.STOCKS` object to render prices and ticks.

---

### Step 3: Buy / Sell Transactions
* **File Path**: [core/rpg/stockMarket.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/stockMarket.js#L35-L77)
* **Line Numbers**: 35-77
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/stockMarket`
* **Inputs**: `(userId, symbol, amount)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function buyStock(userId, symbol, amount) {
    const user = economy.getUser(userId);
    const stock = STOCKS[symbol.toUpperCase()];
    
    if (!stock) return { success: false, message: "❌ Invalid stock symbol!" };
    if (amount <= 0) return { success: false, message: "❌ Amount must be positive!" };
    
    const cost = stock.price * amount;
    if (user.wallet < cost) return { success: false, message: `❌ Insufficient funds! Need ${economy.getZENI()}${cost.toLocaleString()}` };
    
    // Deduct money
    economy.removeMoney(userId, cost, `Bought ${amount} ${symbol}`);
    
    // Add to portfolio
    if (!user.portfolio) user.portfolio = {};
    if (!user.portfolio[symbol]) user.portfolio[symbol] = 0;
    user.portfolio[symbol] += amount;
    
    economy.saveUser(userId);
    return { success: true, message: `✅ Bought ${amount} shares of *${stock.name}* for ${economy.getZENI()}${cost.toLocaleString()}!` };
}
```

#### Explanation
- **Buy Shares**:
  - Validates stock symbol availability.
  - Multiplies company stock price by quantity to calculate the checkout cost.
  - Verifies the user has enough money, deducts wallet balance, updates the user's `portfolio` object, and saves user settings to MongoDB.
- **Sell Shares**:
  - Validates the user owns enough shares.
  - Multiplies company stock price by quantity to calculate the payout sum.
  - Subtracts shares from the user's `portfolio` (deletes key if shares drop to 0), deposits wallet cash, and saves user settings to MongoDB.

---

### Step 4: Price Ticking (Background Price Shifts)
* **File Path**: [core/rpg/stockMarket.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/stockMarket.js#L19-L33)
* **Line Numbers**: 19-33
* **Called From**: System price updater interval (configured in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js))
* **Inputs**: None
* **Outputs**: Mutated in-memory stock prices

```javascript
function updatePrices() {
    for (const symbol in STOCKS) {
        const s = STOCKS[symbol];
        // Dynamic trend shift (occasionally change direction)
        if (Math.random() < 0.1) s.trend *= -1;
        
        const variance = (Math.random() * 2 - 1) * s.volatility;
        const change = variance + s.trend;
        
        s.price = Math.max(10, Math.floor(s.price * (1 + change)));
        
        // Cap price at 1M
        if (s.price > 1000000) s.price = 1000000;
    }
}
```

#### Explanation
- Updates stock market rates periodically:
  - Generates price movements by combining standard market trends (`s.trend`) and random volatility factors (`s.volatility`).
  - Has a 10% chance of reversing the current upward/downward stock trend completely.
  - Capped between 10 Zeni minimum and 1,000,000 Zeni maximum.

---

## 5. How to Modify
To adjust stocks configurations:
- **Add New Stocks / Adjust Volatility**: Add new keys to the `STOCKS` dictionary in [core/rpg/stockMarket.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/stockMarket.js#L7-L13):
  ```javascript
  // Add a new speculative crypto asset with huge volatility
  'JOKE': { name: 'Joker Coin', price: 10, volatility: 0.50, trend: 0.05 }
  ```
- **Adjust Price Update Period**: Change the stock updates tick frequency in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js).










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
const user = economy.getUser(userId);
const stock = STOCKS[symbol.toUpperCase()];
```
**How it works here**: Variables are used to store the user and stock objects, which are then used to access their properties and methods.
**Why it's used**: Variables are used to make the code more readable and to avoid repeating the same value or expression multiple times.
**If you change/remove it**: If you remove the variable declarations, the code will throw an error because the variables `user` and `stock` will be undefined. If you change the variable names, you will need to update all the references to those variables in the code.

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
**How it works here**: An arrow function is used as the event handler for the `messages.upsert` event. It takes an object with `messages` and `type` properties as an argument.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be passed as arguments to other functions or used as event handlers.
**If you change/remove it**: If you remove the arrow function, the event handler will not be defined, and the code will not respond to the `messages.upsert` event. If you change the arrow function to a traditional function expression, the code will still work, but the syntax will be different.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program, such as user interactions or network requests. They are defined using the `on` method.
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
**Why it's used**: Event listeners are used to respond to events that occur in a program, allowing the code to react to user interactions or other events.
**If you change/remove it**: If you remove the event listener, the code will not respond to the `messages.upsert` event, and the program will not update when a new message is received. If you change the event listener to listen for a different event, the code will respond to that event instead.

---
### Concept 4: Array Methods
Array methods are used to manipulate and transform arrays. They are defined using methods such as `map`, `filter`, and `reduce`.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((number) => number * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  }),
);
```
**How it works here**: The `map` method is used to transform the `messages` array into an array of promises, which are then awaited using `Promise.all`.
**Why it's used**: Array methods are used to manipulate and transform arrays, making it easier to work with data.
**If you change/remove it**: If you remove the `map` method, the code will not transform the `messages` array, and the promises will not be awaited. If you change the `map` method to a different array method, such as `filter`, the code will transform the array in a different way.

---
### Concept 5: Conditional Statements
Conditional statements are used to make decisions in a program based on conditions or rules. They are defined using `if` and `else` statements.
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
**How it works here**: Conditional statements are used to check the `type` and `isRekeying` variables, and return from the function if the conditions are not met.
**Why it's used**: Conditional statements are used to make decisions in a program, allowing the code to respond to different conditions or rules.
**If you change/remove it**: If you remove the conditional statements, the code will not check the `type` and `isRekeying` variables, and the function will not return early. If you change the conditions, the code will make different decisions based on the new conditions.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries. They are defined using the `Promise` constructor.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Success!');
});
promise.then((result) => {
  console.log(result); // Outputs: Success!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // ...
  }),
);
```
**How it works here**: Promises are used to handle the asynchronous operations of processing the `messages` array, allowing the code to wait for the operations to complete before continuing.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to write asynchronous code.
**If you change/remove it**: If you remove the promises, the code will not wait for the asynchronous operations to complete, and the program may not work as expected. If you change the promises to use a different asynchronous handling mechanism, such as callbacks, the code will handle asynchronous operations differently.

---
### Concept 7: Object Destructuring
Object destructuring is used to extract properties from an object and assign them to variables. It is defined using the `{}` syntax.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
const { messages, type } = async ({ messages, type }) => {
  // ...
};
```
**How it works here**: Object destructuring is used to extract the `messages` and `type` properties from the object passed to the arrow function, and assign them to variables.
**Why it's used**: Object destructuring is used to make the code more concise and easier to read, by extracting properties from objects and assigning them to variables.
**If you change/remove it**: If you remove the object destructuring, the code will not extract the `messages` and `type` properties, and the variables will not be assigned. If you change the object destructuring to use a different syntax, such as using the `.` notation, the code will access the properties differently.

---
### Concept 8: Database Operations
Database operations are used to interact with a database, such as reading or writing data. They are defined using methods such as `getUser` and `saveUser`.
**General Example**
```javascript
const db = {
  users: [],
  getUser: (id) => {
    return db.users.find((user) => user.id === id);
  },
  saveUser: (user) => {
    db.users.push(user);
  },
};
```
**In Our Code**
```javascript
const user = economy.getUser(userId);
economy.saveUser(userId);
```
**How it works here**: Database operations are used to interact with the economy database, such as reading user data and saving user data.
**Why it's used**: Database operations are used to store and retrieve data, making it possible to persist data between program runs.
**If you change/remove it**: If you remove the database operations, the code will not interact with the database, and the data will not be stored or retrieved. If you change the database operations to use a different database or syntax, the code will interact with the database differently.

---
### Concept 9: Numbers and Parsing
Numbers and parsing are used to work with numerical data, such as parsing strings to numbers or formatting numbers as strings.
**General Example**
```javascript
const number = parseInt('123');
console.log(number); // Outputs: 123
```
**In Our Code**
```javascript
const cost = stock.price * amount;
```
**How it works here**: Numbers and parsing are used to work with numerical data, such as calculating the cost of a stock.
**Why it's used**: Numbers and parsing are used to work with numerical data, making it possible to perform calculations and display data in a readable format.
**If you change/remove it**: If you remove the numbers and parsing, the code will not work with numerical data, and the calculations will not be performed. If you change the numbers and parsing to use a different syntax or method, the code will work with numerical data differently.

---
### Concept 10: String Interpolation
String interpolation is used to insert values into a string, making it possible to create dynamic strings.
**General Example**
```javascript
const name = 'John';
const greeting = `Hello, ${name}!`;
console.log(greeting); // Outputs: Hello, John!
```
**In Our Code**
```javascript
let msg = `📈 *GLOBAL STOCK MARKET* 📈\n\n`;
msg += `• *${stock.name}* (\`${symbol}\`)\n  Price: ${economy.getZENI()}${stock.price.toLocaleString()}\n\n`;
```
**How it works here**: String interpolation is used to insert values into a string, making it possible to create dynamic strings that display data.
**Why it's used**: String interpolation is used to create dynamic strings, making it possible to display data in a readable format.
**If you change/remove it**: If you remove the string interpolation, the code will not insert values into the string, and the string will not be dynamic. If you change the string interpolation to use a different syntax or method, the code will create dynamic strings differently.
