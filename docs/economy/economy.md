# Economy Command Flow (`economy`)

## 1. Description
The Economy command aggregates the wallet and bank balances of all registered users to produce global financial statistics, market capitalizations, loan indices, and wealth inequality metrics (Gini-like shares for the Top 1% and Top 10%).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j economy"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " economy") (L13788)
            └── core/rpg/economy.js
                └── getGlobalEconomyStats() (L1125)
                    └── Read all users from economyData Map
                    └── Sum wallet, bank, frozen assets
                    └── Count premium/diamond members based on rank (S, SS, SSS)
                    └── Sort users to find richest user and Top 1% / Top 10% shares
            └── core/rpg/loans.js
                └── getTotalDebt() (L98)
                    └── Sum totalRepayment for all activeLoans
            └── core/rpg/stockMarket.js
                └── getMarketCap()
            └── Formatting: Map metrics into global dashboard template
            └── sock.sendMessage(chatId, { text: msg }) (L13816)
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

### Step 2: Command Matching
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13787-L13790)
* **Line Numbers**: 13787-13790
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Redirects to global statistics resolver

```javascript
                  if (
                    lowerTxt ===
                    `${botConfig.getPrefix().toLowerCase()} economy`
                  ) {
```

#### Explanation
- Identifies the `.j economy` command trigger.

---

### Step 3: Resolving Global Stats
* **File Path**: [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L1125-L1171)
* **Line Numbers**: 1125-1171
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: None
* **Outputs**: Aggregated JSON metrics containing user totals, averages, memberships, and shares

```javascript
function getGlobalEconomyStats() {
  const users = Array.from(economyData.values());
  const totalUsers = users.length;
  
  let totalWallet = 0;
  let totalBank = 0;
  let totalFrozen = 0;
  let premiumMembers = 0;
  let diamondMembers = 0;
  
  users.forEach(u => {
    totalWallet += (u.wallet || 0);
    totalBank += (u.bank || 0);
    totalFrozen += (u.frozenAssets?.wallet || 0) + (u.frozenAssets?.bank || 0);
    
    if (u.adventurerRank === 'S' || u.adventurerRank === 'SS') premiumMembers++;
    if (u.adventurerRank === 'SSS') diamondMembers++;
  });

  const totalWealth = totalWallet + totalBank;
  const avgWealth = totalUsers > 0 ? Math.floor(totalWealth / totalUsers) : 0;
  
  const sorted = [...users].sort((a, b) => ((b.wallet||0)+(b.bank||0)) - ((a.wallet||0)+(a.bank||0)));
  const richest = sorted[0];
  
  const top1Count = Math.max(1, Math.ceil(totalUsers * 0.01));
  const top1Wealth = sorted.slice(0, top1Count).reduce((s, u) => s + (u.wallet||0) + (u.bank||0), 0);
  const top1Share = totalWealth > 0 ? (top1Wealth / totalWealth * 100).toFixed(1) : 0;

  const top10Count = Math.max(1, Math.ceil(totalUsers * 0.1));
  const top10Wealth = sorted.slice(0, top10Count).reduce((s, u) => s + (u.wallet||0) + (u.bank||0), 0);
  const top10Share = totalWealth > 0 ? (top10Wealth / totalWealth * 100).toFixed(1) : 0;

  return {
    totalUsers, totalWealth, totalWallet, totalBank, totalFrozen,
    premiumMembers, diamondMembers, avgWealth, top1Share, top10Share,
    richest: richest ? { name: richest.nickname, amount: (richest.wallet||0)+(richest.bank||0) } : null
  };
}
```

#### Explanation
- Reads all loaded users from memory cache.
- Aggregates wallet cash, savings deposits, and jailed/defaulted frozen capital.
- Flags membership metrics based on player's adventurer ranks (`S`, `SS` count as Premium; `SSS` counts as Diamond).
- Calculates the Gini index proxy (Top 1% and Top 10% total holdings versus global sum).
- Finds the richest player in the cache.

---

### Step 4: Resolving Loans Debt and Stocks Valuation
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13791-L13817)
* **Line Numbers**: 13791-13817
* **Called From**: `engine.js`
* **Imported From**: [core/rpg/loans.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/loans.js) & [core/rpg/stockMarket.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/stockMarket.js)
* **Inputs**: Global aggregates
* **Outputs**: Dispatches summary overview to WhatsApp group

```javascript
                     const stats = economy.getGlobalEconomyStats();
                     const loans = require('./rpg/loans');
                     const stockMarket = require('./rpg/stockMarket');
                     const totalDebt = loans.getTotalDebt();
                     const marketCap = stockMarket.getMarketCap();

                     let msg = `📊 *Global Economy Statistics*\n`;
                     msg += `​Total Users: ${stats.totalUsers}\n`;
                     msg += `​Total Wealth: ${stats.totalWealth.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​In Wallets: ${stats.totalWallet.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​In Banks: ${stats.totalBank.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​Premium Members: ${stats.premiumMembers}\n`;
                     msg += `​Diamond Members: ${stats.diamondMembers}\n`;
                     msg += `​Active Businesses: 0\n`;
                     msg += `​Outstanding Loan Debt: ${totalDebt.toLocaleString()} ${economy.getZENI()}\n\n`;

                     msg += `​🔍 *Deep Insights*\n`;
                     msg += `​Avg Wealth: ${stats.avgWealth.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​Frozen Assets: ${stats.totalFrozen.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​Market Cap (Stocks): ${marketCap.toLocaleString()} ${economy.getZENI()}\n`;
                     msg += `​Business Valuation: 0 ${economy.getZENI()}\n`;
                     msg += `​Wealth Share (Top 1%): ${stats.top1Share}%\n`;
                     msg += `​Wealth Share (Top 10%): ${stats.top10Share}%\n`;
                     msg += `​Richest User: ${stats.richest ? `${stats.richest.name} with ${stats.richest.amount.toLocaleString()} ${economy.getZENI()}` : "None"}\n`;

                     await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
```

#### Explanation
- Assembles total debt by querying active loans.
- Resolves stock market cap value by invoking stockMarket controller.
- Constructs and logs the dashboard response to WhatsApp.

---

## 4. How to Modify
To adjust criteria:
- **Change Premium Membership Definitions**: Adjust the rank checks inside [core/rpg/economy.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/economy.js#L1140):
  ```javascript
  // Treat rank 'A' and above as premium members
  if (['A', 'S', 'SS'].includes(u.adventurerRank)) premiumMembers++;
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
const stats = economy.getGlobalEconomyStats();
const loans = require('./rpg/loans');
```
**How it works here**: Variables are used to store the results of function calls, such as `economy.getGlobalEconomyStats()` and `require('./rpg/loans')`.
**Why it's used**: Variables are used to store values that can be used later in the program, making the code more readable and efficient.
**If you change/remove it**: If you remove the variable declarations, the code will throw an error because the values will not be stored. If you change the variable names, the code will still work as long as the new names are used consistently.

---
### Concept 2: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are like decision-making tools that help the program decide what to do next.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult');
} else {
  console.log('You are a minor');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
if (['A', 'S', 'SS'].includes(u.adventurerRank)) premiumMembers++;
```
**How it works here**: Conditional statements are used to check conditions such as the type of message, whether the system is rekeying, and the user's adventurer rank.
**Why it's used**: Conditional statements are used to control the flow of the program and make decisions based on certain conditions.
**If you change/remove it**: If you remove the conditional statements, the code will not be able to make decisions and will execute all blocks of code. If you change the conditions, the code will make different decisions and may produce incorrect results.

---
### Concept 3: Functions
Functions are reusable blocks of code that perform a specific task. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function getGlobalEconomyStats() {
  // ...
}
const stats = economy.getGlobalEconomyStats();
```
**How it works here**: Functions are used to perform tasks such as getting global economy statistics and sending messages.
**Why it's used**: Functions are used to organize code, reduce repetition, and make the program more modular.
**If you change/remove it**: If you remove a function, the code that calls it will throw an error. If you change a function, the code that calls it may produce incorrect results.

---
### Concept 4: Event Listeners
Event listeners are used to respond to events such as user interactions or network requests. They are like listeners that wait for something to happen and then execute a block of code.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('You clicked the document!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An event listener is used to respond to the "messages.upsert" event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events and perform actions based on user interactions or network requests.
**If you change/remove it**: If you remove the event listener, the code will not respond to the event. If you change the event listener, the code may respond to a different event or perform a different action.

---
### Concept 5: Array Methods
Array methods are used to perform operations on arrays such as mapping, filtering, and reducing.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
const doubleNumbers = numbers.map((number) => number * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
const sorted = [...users].sort((a, b) => ((b.wallet||0)+(b.bank||0)) - ((a.wallet||0)+(a.bank||0)));
const top1Wealth = sorted.slice(0, top1Count).reduce((s, u) => s + (u.wallet||0) + (u.bank||0), 0);
```
**How it works here**: Array methods are used to sort the users array, slice the top 1% of users, and reduce the wealth of the top 1% of users.
**Why it's used**: Array methods are used to perform operations on arrays and manipulate data.
**If you change/remove it**: If you remove the array methods, the code will not be able to perform the desired operations on the arrays. If you change the array methods, the code may produce incorrect results.

---
### Concept 6: Imports
Imports are used to bring in external modules or files into the current file.
**General Example**
```javascript
const math = require('mathjs');
console.log(math.sqrt(16)); // Outputs: 4
```
**In Our Code**
```javascript
const loans = require('./rpg/loans');
const stockMarket = require('./rpg/stockMarket');
```
**How it works here**: Imports are used to bring in the loans and stockMarket modules.
**Why it's used**: Imports are used to bring in external modules or files and make their functions and variables available in the current file.
**If you change/remove it**: If you remove the imports, the code will throw an error because the modules will not be available. If you change the imports, the code may use different modules or files.

---
### Concept 7: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when an operation is complete.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // ...
  resolve('Hello, World!');
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
**How it works here**: Promises are used to handle the asynchronous operation of sending messages.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when an operation is complete.
**If you change/remove it**: If you remove the promises, the code will not be able to handle asynchronous operations and may produce incorrect results. If you change the promises, the code may handle asynchronous operations differently.

---
### Concept 8: Async/Await
Async/await is a syntax sugar on top of promises that makes it easier to write asynchronous code.
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
**How it works here**: Async/await is used to write asynchronous code that is easier to read and maintain.
**Why it's used**: Async/await is used to make asynchronous code look and feel like synchronous code.
**If you change/remove it**: If you remove the async/await syntax, the code will not be able to handle asynchronous operations and may produce incorrect results. If you change the async/await syntax, the code may handle asynchronous operations differently.

---
### Concept 9: Destructuring
Destructuring is a syntax feature that allows you to extract values from arrays or objects and assign them to variables.
**General Example**
```javascript
const person = { name: 'John', age: 30 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 30
```
**In Our Code**
```javascript
const { totalUsers, totalWealth, totalWallet, totalBank, totalFrozen } = stats;
```
**How it works here**: Destructuring is used to extract values from the stats object and assign them to variables.
**Why it's used**: Destructuring is used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the destructuring syntax, the code will not be able to extract values from the stats object and may produce incorrect results. If you change the destructuring syntax, the code may extract different values or assign them to different variables.

---
### Concept 10: Template Literals
Template literals are a syntax feature that allows you to create strings with embedded expressions.
**General Example**
```javascript
const name = 'John';
const age = 30;
const sentence = `My name is ${name} and I am ${age} years old.`;
console.log(sentence); // Outputs: My name is John and I am 30 years old.
```
**In Our Code**
```javascript
let msg = `📊 *Global Economy Statistics*\n`;
msg += `​Total Users: ${stats.totalUsers}\n`;
```
**How it works here**: Template literals are used to create strings with embedded expressions that display the global economy statistics.
**Why it's used**: Template literals are used to make the code more concise and easier to read.
**If you change/remove it**: If you remove the template literals, the code will not be able to create strings with embedded expressions and may produce incorrect results. If you change the template literals, the code may create different strings or display different values.
