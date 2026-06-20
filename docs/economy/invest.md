# Investment Command Flow (`invest`, `claim`)

## 1. Description
The Investment system allows users to purchase fixed-deposit investment plans (Bonds, Mutual Funds, Growth Shares, Venture Capitals) with custom interest yields, risk variables, and lockup periods. Users check plans using the `invest` command, buy plans using `invest <plan_name> <amount>`, and claim matured returns via `invest claim` or the shortcut `claim`.

---

## 2. Hierarchical Execution Tree

### Listing Investment Plans
```text
User sends ".j invest"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " invest") (L13853)
            └── core/rpg/investment.js
                └── INVESTMENT_PLANS iteration
            └── sock.sendMessage(chatId, { text: msg }) (L13863)
```

### Starting an Investment
```text
User sends ".j invest bond 1000"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " invest ")) (L13867)
            └── Parse args: action (bond), amount (1000) (L13873)
            └── core/rpg/investment.js
                └── startInvestment(senderJid, planId, amount) (L14)
                    └── Fetch user, validate active count <= 3
                    └── Validate amount >= minDeposit & amount <= 50% of user wallet balance (anti-exploit)
                    └── economy.removeMoney(senderJid, amount, description)
                    └── Create investment metadata object (expected payout, endTime)
                    └── user.investments.push(investment)
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L13897)
```

### Claiming Matured Investments
```text
User sends ".j invest claim" or ".j claim"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt === prefix + " claim" || "invest claim") (L13904)
            └── core/rpg/investment.js
                └── claimInvestment(senderJid) (L65)
                    └── Filter matured investments (now >= endTime)
                    └── Process risk calculations: Math.random() < inv.risk
                    └── Success -> totalPayout += expectedPayout, economy.addMoney(totalPayout)
                    └── Default/Loss -> totalLoss += amount
                    └── user.investments = remaining active array
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: result.message }) (L13910)
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

### Step 2: Command Matching and Route Redirection
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13851-L13920)
* **Line Numbers**: 13851-13920
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Directs execution to investment handler functions

```javascript
                  // INVESTMENT COMMANDS
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} invest`
                  ) {
                    const invest = require('./rpg/investment');
                    ...
                  }

                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} invest `,
                    )
                  ) {
                    const invest = require('./rpg/investment');
                    const parts = lowerTxt.split(" ");
                    const action = parts[2];

                    if (action?.toLowerCase() === "claim") {
                      const result = invest.claimInvestment(senderJid);
                      return sock.sendMessage(chatId, {
                        text: BOT_MARKER + result.message,
                      });
                    }

                    const amount = parseInt(parts[3]);
                    ...
                    const result = invest.startInvestment(
                      senderJid,
                      action,
                      amount,
                    );
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                    });
                    return;
                  }
```

#### Explanation
- Recognizes `.j invest` or `.j invest [plan] [amount]` or `.j invest claim` / `.j claim`.
- Imports `core/rpg/investment.js` dynamically and invokes the corresponding module handler.

---

### Step 3: Starting a Fixed Deposit Plan
* **File Path**: [core/rpg/investment.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/investment.js#L14-L56)
* **Line Numbers**: 14-56
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/investment`
* **Inputs**: `(userId, planId, amount)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function startInvestment(userId, planId, amount) {
    const user = economy.getUser(userId);
    const plan = INVESTMENT_PLANS[planId.toUpperCase()];
    
    if (!plan) return { success: false, message: "❌ Invalid investment plan!" };
    
    // ANTI-EXPLOIT: Max 3 active investments
    if (user.investments && user.investments.length >= 3) {
        return { success: false, message: "❌ You already have 3 active investments! Claim them first." };
    }

    if (amount < plan.minDeposit) return { success: false, message: `❌ Minimum deposit for this plan is ${economy.getZENI()}${plan.minDeposit.toLocaleString()}` };
    if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds in wallet!" };
    
    // ANTI-EXPLOIT: Max 50% of current Zeni
    const maxAllowed = Math.floor(user.wallet * 0.5);
    if (amount > maxAllowed) {
        return { success: false, message: `❌ Risk management: You can only invest up to 50% of your wallet (${economy.getZENI()}${maxAllowed.toLocaleString()}).` };
    }

    // Deduct money
    economy.removeMoney(userId, amount, `Invested in ${plan.name}`);
    
    // Create investment
    if (!user.investments) user.investments = [];
    
    const investment = {
        planId: planId.toUpperCase(),
        amount: amount,
        startTime: Date.now(),
        endTime: Date.now() + (plan.durationHours * 60 * 60 * 1000),
        expectedPayout: Math.floor(amount * (1 + plan.interest)),
        risk: plan.risk
    };
    
    user.investments.push(investment);
    economy.saveUser(userId);
```

#### Explanation
1. Checks that the selected plan ID exists and verifies the user doesn't already have 3 active locked plans.
2. Implements a 50% wallet ceiling check to prevent players from going "all-in" on high-risk options.
3. Deducts the cash from the user wallet.
4. Generates an investment record containing the plan details, expected payout (deposit + interest), maturity expiration date, and risk probability index.
5. Saves changes back to MongoDB.

---

### Step 4: Claiming Mature Assets
* **File Path**: [core/rpg/investment.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/investment.js#L65-L108)
* **Line Numbers**: 65-108
* **Called From**: `claimInvestment()`
* **Inputs**: `userId`
* **Outputs**: Returns results message detailing yield success and failures

```javascript
function claimInvestment(userId) {
    const user = economy.getUser(userId);
    if (!user || !user.investments || user.investments.length === 0) return { success: false, message: "❌ You have no active investments." };
    
    const now = Date.now();
    let totalPayout = 0;
    let totalLoss = 0;
    const active = [];
    const matured = [];
    
    user.investments.forEach(inv => {
        if (now >= inv.endTime) {
            // Check risk
            const roll = Math.random();
            if (roll < (inv.risk || 0)) {
                totalLoss += inv.amount;
            } else {
                totalPayout += inv.expectedPayout;
            }
            matured.push(inv);
        } else {
            active.push(inv);
        }
    });
    
    if (matured.length === 0) {
        return { success: false, message: "⏳ None of your investments have matured yet!" };
    }
    
    user.investments = active;
    let msg = `📊 *CLAIM SUMMARY*\n\n`;
    
    if (totalPayout > 0) {
        economy.addMoney(userId, totalPayout, "Matured Investment Payout");
        msg += `✅ *Success:* Received ${economy.getZENI()}${totalPayout.toLocaleString()}\n`;
    }
    
    if (totalLoss > 0) {
        msg += `❌ *Loss:* ${economy.getZENI()}${totalLoss.toLocaleString()} lost to market volatility.\n`;
    }
    
    economy.saveUser(userId);
    return { success: true, message: msg };
}
```

#### Explanation
1. Checks that the user has existing investments.
2. Iterates over active investments:
   - **Matured (`now >= inv.endTime`)**: Runs a probability risk roll. If the roll is less than the plan risk, the principal is lost. If the roll is cleared, the expected payout is accumulated.
   - **Locked**: Preserves the item in the active investments queue.
3. Decrements/overwrites `user.investments` with the active (unmatured) list.
4. Adds payout funds back to the user's wallet.
5. Saves changes to MongoDB.

---

## 4. How to Modify
To adjust investment configurations or rules:
- **Add or Modify Investment Plans**: Edit properties inside the `INVESTMENT_PLANS` dictionary in [core/rpg/investment.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/investment.js#L7-L12):
  ```javascript
  // Change VENTURE profit and risk margins
  'VENTURE': { name: 'Venture Capital', durationHours: 24, interest: 1.20, minDeposit: 50000, risk: 0.20 } // 20% risk, 120% interest (2.2x payout)
  ```
- **Adjust Active Limit (default 3)**: Change limit validation inside `startInvestment` in [core/rpg/investment.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/investment.js#L21):
  ```javascript
  if (user.investments && user.investments.length >= 5) { // Allow up to 5 concurrent plans
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
const user = economy.getUser(userId);
const plan = INVESTMENT_PLANS[planId.toUpperCase()];
```
**How it works here**: Variables are used to store the result of function calls, such as `economy.getUser(userId)` and `INVESTMENT_PLANS[planId.toUpperCase()]`.
**Why it's used**: Variables are used to make the code more readable and to avoid repeating complex expressions.
**If you change/remove it**: If you remove the variables, you would have to repeat the complex expressions everywhere, making the code harder to read and maintain. If you change the variable names, you would have to update all references to the variable.

---
### Concept 2: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. The most common type of conditional statement is the `if` statement.
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
if (!plan) return { success: false, message: "❌ Invalid investment plan!" };
```
**How it works here**: Conditional statements are used to check the type of message, the rekeying status, and the validity of the investment plan.
**Why it's used**: Conditional statements are used to control the flow of the program and to make decisions based on certain conditions.
**If you change/remove it**: If you remove the conditional statements, the program would not be able to make decisions based on certain conditions, and it would execute the code without checking the conditions. If you change the conditions, the program would make different decisions.

---
### Concept 3: Functions
Functions are reusable blocks of code that take arguments and return values. They are used to organize the code and to avoid repeating the same code.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
function startInvestment(userId, planId, amount) {
  // ...
}
function claimInvestment(userId) {
  // ...
}
```
**How it works here**: Functions are used to start an investment and to claim an investment.
**Why it's used**: Functions are used to organize the code and to make it more reusable.
**If you change/remove it**: If you remove the functions, the code would not be able to start or claim an investment. If you change the function names or the function parameters, you would have to update all references to the function.

---
### Concept 4: Object Properties
Object properties are used to store and access data in an object. They are used to represent the characteristics of an object.
**General Example**
```javascript
let person = {
  name: 'John',
  age: 25
};
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const user = economy.getUser(userId);
const plan = INVESTMENT_PLANS[planId.toUpperCase()];
```
**How it works here**: Object properties are used to access the user's data and the investment plan's data.
**Why it's used**: Object properties are used to represent the characteristics of an object and to access the data in an object.
**If you change/remove it**: If you remove the object properties, you would not be able to access the data in the object. If you change the property names, you would have to update all references to the property.

---
### Concept 5: Array Methods
Array methods are used to manipulate and access data in an array. The most common array methods are `map`, `filter`, and `forEach`.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map(number => number * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
user.investments.forEach(inv => {
  // ...
});
```
**How it works here**: Array methods are used to iterate over the user's investments and to access the investment data.
**Why it's used**: Array methods are used to manipulate and access data in an array.
**If you change/remove it**: If you remove the array methods, you would not be able to iterate over the array or access the data in the array. If you change the array method, you would have to update the code to use the new method.

---
### Concept 6: Event Listeners
Event listeners are used to respond to events in a program. They are used to execute code when a certain event occurs.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('The document was clicked');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: Event listeners are used to respond to the `messages.upsert` event and to execute code when the event occurs.
**Why it's used**: Event listeners are used to respond to events in a program and to execute code when a certain event occurs.
**If you change/remove it**: If you remove the event listener, the code would not be able to respond to the event. If you change the event listener, you would have to update the code to use the new event listener.

---
### Concept 7: Promises
Promises are used to handle asynchronous code in a program. They are used to execute code when a certain operation is complete.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // ...
});
promise.then(() => {
  console.log('The promise was resolved');
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
**How it works here**: Promises are used to handle the asynchronous code in the `messages.map` method.
**Why it's used**: Promises are used to handle asynchronous code in a program and to execute code when a certain operation is complete.
**If you change/remove it**: If you remove the promises, the code would not be able to handle the asynchronous code. If you change the promises, you would have to update the code to use the new promises.

---
### Concept 8: Imports
Imports are used to import modules or functions from other files in a program. They are used to reuse code and to make the code more modular.
**General Example**
```javascript
import { greet } from './greet.js';
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
const invest = require('./rpg/investment');
```
**How it works here**: Imports are used to import the `investment` module from the `./rpg/investment` file.
**Why it's used**: Imports are used to reuse code and to make the code more modular.
**If you change/remove it**: If you remove the imports, the code would not be able to use the imported modules or functions. If you change the imports, you would have to update the code to use the new imports.

---
### Concept 9: Destructuring
Destructuring is used to extract data from an object or an array. It is used to make the code more readable and to avoid repeating the same code.
**General Example**
```javascript
let person = {
  name: 'John',
  age: 25
};
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
const { messages, type } = await sock.ev.on("messages.upsert");
```
**How it works here**: Destructuring is used to extract the `messages` and `type` data from the `sock.ev.on` method.
**Why it's used**: Destructuring is used to make the code more readable and to avoid repeating the same code.
**If you change/remove it**: If you remove the destructuring, the code would not be able to extract the data from the object or array. If you change the destructuring, you would have to update the code to use the new destructuring.

---
### Concept 10: Numbers Parsing
Numbers parsing is used to convert a string to a number. It is used to make the code more readable and to avoid repeating the same code.
**General Example**
```javascript
let number = parseInt('123');
console.log(number); // Outputs: 123
```
**In Our Code**
```javascript
const amount = parseInt(parts[3]);
```
**How it works here**: Numbers parsing is used to convert the `parts[3]` string to a number.
**Why it's used**: Numbers parsing is used to make the code more readable and to avoid repeating the same code.
**If you change/remove it**: If you remove the numbers parsing, the code would not be able to convert the string to a number. If you change the numbers parsing, you would have to update the code to use the new numbers parsing.

---
### Concept 11: Database Operations
Database operations are used to interact with a database. They are used to store, retrieve, and update data in a database.
**General Example**
```javascript
let db = {
  users: []
};
db.users.push({ name: 'John', age: 25 });
console.log(db.users); // Outputs: [{ name: 'John', age: 25 }]
```
**In Our Code**
```javascript
economy.getUser(userId);
economy.addMoney(userId, totalPayout, "Matured Investment Payout");
economy.saveUser(userId);
```
**How it works here**: Database operations are used to interact with the economy database.
**Why it's used**: Database operations are used to store, retrieve, and update data in a database.
**If you change/remove it**: If you remove the database operations, the code would not be able to interact with the database. If you change the database operations, you would have to update the code to use the new database operations.
