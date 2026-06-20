# Loan Command Flow (`loan`, `accept`, `decline`)

## 1. Description
The Loan command allows a user to request Zeni from another user with a custom interest rate and duration. The lender must approve the request using the `accept` command or decline it using the `decline` command within 120 seconds. An automatic scheduler processes due loans periodically, automatically deducting the debt from the borrower or seizing and freezing their assets in case of default.

---

## 2. Hierarchical Execution Tree

### Requesting a Loan
```text
User A (Borrower) sends ".j loan @UserB 1000 10% 60m"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " loan ")) (L14453)
            └── Get lender JID: getMentionOrReply(m) (L14460)
            └── Parse args: amount (1000), interest (10%), duration (60m) (L14470-L14500)
            └── core/rpg/loans.js
                └── requestLoan(borrowerJid, lenderJid, amount, interest, duration) (L106)
                    └── Check lender balance: economy.getBankBalance(lenderJid)
                    └── Check borrower status: isLoanBlocked(borrowerJid)
                    └── Store pending request: pendingLoans.set(lenderJid, request)
            └── sock.sendMessage(chatId, { text: res.msg, mentions: [lenderJid] }) (L1518)
```

### Accepting a Loan
```text
User B (Lender) sends ".j accept"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt === prefix + " accept") (L13437)
            └── Check Guild Invite (None)
            └── Check pending loan request: loans.getPendingRequest(senderJid) (L13452)
            └── core/rpg/loans.js
                └── acceptLoan(lenderJid) (L148)
                    └── Fetch pending loan request
                    └── Verify lender wallet balance >= request.amount (L159)
                    └── economy.removeMoney(lenderJid, amount)
                    └── economy.addMoney(borrowerJid, amount)
                    └── Create loanObj and push to activeLoans
                    └── saveLoan(loanObj) -> LoanModel.updateOne() (MongoDB)
                    └── pendingLoans.delete(lenderJid)
            └── sock.sendMessage(chatId, { text: successMsg }) (L13459)
```

### Declining a Loan
```text
User B (Lender) sends ".j decline"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt === prefix + " decline") (L13479)
            └── Check pending loan request: loans.getPendingRequest(senderJid) (L13502)
            └── core/rpg/loans.js
                └── declineLoan(lenderJid) (L200)
                    └── pendingLoans.delete(lenderJid)
            └── sock.sendMessage(chatId, { text: "❌ Loan request declined." }) (L13505)
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

### Step 2: Request Parsing and Initiation
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L14452-L14523)
* **Line Numbers**: 14452-14523
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Dispatches loan request proposal

```javascript
                    // Clean split
                    const parts = txt.trim().split(/\s+/);

                    let amount = null;
                    let interest = null;
                    let duration = null;

                    for (const part of parts) {
                      // Skip command keywords and mentions
                      if (
                        part.startsWith(botConfig.getPrefix()) ||
                        part.toLowerCase() === "loan" ||
                        part.includes("@")
                      )
                        continue;

                      const lowerPart = part.toLowerCase();

                      if (lowerPart.endsWith("%")) {
                        interest = parseInt(lowerPart.replace("%", ""));
                      } else if (
                        lowerPart.endsWith("m") ||
                        lowerPart.endsWith("min") ||
                        lowerPart.endsWith("mins")
                      ) {
                        duration = parseInt(lowerPart.replace(/mins?|m/, ""));
                      } else if (!isNaN(parseInt(part))) {
                        // Assume plain number is amount
                        amount = parseInt(part);
                      }
                    }
```

#### Explanation
- Identifies commands starting with `loan ` (ignoring sub-keywords like `accept` and `decline`).
- Extracts the lender JID via mentions or replies.
- Parses input arguments for:
  - Interest rate (ends with `%`).
  - Duration (ends with `m`, `min`, `mins`).
  - Loan amount (plain number).
- Calls `loans.requestLoan()` to validate and register the proposal in-memory under `pendingLoans`.

---

### Step 3: Accept / Decline Invitation Check
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13451-L13467) & [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13501-L13509)
* **Line Numbers**: 13451-13467 (accept) & 13501-13509 (decline)
* **Called From**: Command routing block in `engine.js`
* **Inputs**: Sender ID
* **Outputs**: Invokes loan transaction acceptance/rejection

```javascript
                      // 3. Check Loan Invites
                      const loanRequest = loans.getPendingRequest(senderJid);
                      if (loanRequest) {
                        const result = loans.acceptLoan(loanRequest.lenderJid);
                        if (result.success) {
                          await sock.sendMessage(chatId, {
                            text:
                              BOT_MARKER +
                              `✅ Loan of ${ZENI}${result.amount.toLocaleString()} accepted! funds transferred to your wallet.`,
                          });
                        } else {
                          await sock.sendMessage(chatId, {
                            text: BOT_MARKER + result.msg,
                          });
                        }
                        return;
                      }
```

#### Explanation
- If the lender types `.j accept` or `.j decline`, the bot checks `loans.getPendingRequest(senderJid)` (which looks for a record in the `pendingLoans` Map where the sender is listed as the lender).
- On **Accept**: Checks lender wallet balances. If valid, transfers the money (`economy.removeMoney` from lender, `economy.addMoney` to borrower), creates an active loan object, saves it to MongoDB via `saveLoan()`, and deletes it from the pending cache.
- On **Decline**: Removes the request from the pending cache.

---

### Step 4: Loan Repayment Check (Automatic Scheduler Background Process)
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L1591-L1620) & [core/rpg/loans.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/loans.js#L229-L316)
* **Line Numbers**: 1591-1620 (engine timer) & 229-316 (repayment checks)
* **Called From**: `engine.js` background scheduler (every 60 seconds)
* **Inputs**: Current timestamp
* **Outputs**: Broadcasts loan payment status or defaults

```javascript
// Inside core/rpg/loans.js:checkDueLoans()
      if (borrowerBal.total >= loan.totalRepayment) {
        // Scenario A: Borrower has money -> Pay lender
        let remaining = loan.totalRepayment;
        if (borrowerBal.wallet >= remaining) {
            economy.removeMoney(loan.borrower, remaining);
        } else {
            remaining -= borrowerBal.wallet;
            economy.removeMoney(loan.borrower, borrowerBal.wallet);
            const user = economy.getUser(loan.borrower);
            user.bank -= remaining;
            economy.saveUser(loan.borrower);
        }
        economy.addMoney(loan.lender, loan.totalRepayment);
        loan.status = 'paid';
        saveLoan(loan);
      } else {
        // Scenario B: Borrower defaults -> Seize assets & block
        const seizedAmount = borrowerBal.total;
        const user = economy.getUser(loan.borrower);
        if (user) {
            if (!user.frozenAssets) user.frozenAssets = { wallet: 0, bank: 0, reason: "" };
            user.frozenAssets.wallet += user.wallet || 0;
            user.frozenAssets.bank += user.bank || 0;
            user.frozenAssets.reason = "Unpaid Loan Default";
            user.wallet = 0;
            user.bank = 0;
            economy.saveUser(loan.borrower);
        }
        if (seizedAmount > 0) {
            economy.addMoney(loan.lender, seizedAmount);
        }
        const unpaid = loan.totalRepayment - seizedAmount;
        const blockMinutes = Math.max(60, Math.ceil(unpaid / 10)); 
        const unblockTime = Date.now() + (blockMinutes * 60 * 1000);
        loanBlocks.set(loan.borrower, unblockTime);
        syncLoanBlocks();
        loan.status = 'defaulted';
        saveLoan(loan);
      }
```

#### Explanation
- A background scheduler runs `checkDueLoans()` every 60 seconds.
- Iterates over `activeLoans` to find past-due items:
  - **Sufficient Funds**: Automatically deducts the repayment (wallet first, then bank) and awards it to the lender JID.
  - **Default**: Empties the borrower's wallet/bank, moves whatever they had to the lender, locks the remaining balance in `user.frozenAssets`, blocks the borrower from using the economy for a duration calculated based on the unpaid amount, and sets their database block timestamp in MongoDB.

---

## 4. How to Modify
To adjust loan interest rates, limits, or parameters:
- **Set Minimum/Maximum Loan Amounts**: Change the limits inside `requestLoan` in [core/rpg/loans.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/loans.js#L106-L122).
- **Default Penalty Scale**: Change the blocking duration formula in [core/rpg/loans.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/loans.js#L291):
  ```javascript
  const blockMinutes = Math.max(120, Math.ceil(unpaid / 5)); // Higher penalty multiplier
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
let amount = null;
let interest = null;
let duration = null;
```
**How it works here**: These variables are used to store the values of the loan amount, interest rate, and duration.
**Why it's used**: Variables are used to store values that will be used later in the program, making it easier to access and modify them.
**If you change/remove it**: If you remove these variables, the program will not be able to store the loan details, and the program will throw an error when trying to access these variables.

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
**How it works here**: This arrow function is used as an event listener for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and easier to read.
**If you change/remove it**: If you remove this arrow function, the program will not be able to listen for the `messages.upsert` event, and the program will not be able to process incoming messages.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events that occur in a program, such as a user clicking a button or a message being received.
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
**How it works here**: This event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events that occur in a program, making it possible to interact with the user and other parts of the program.
**If you change/remove it**: If you remove this event listener, the program will not be able to respond to the `messages.upsert` event, and the program will not be able to process incoming messages.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They are defined using the `if` and `else` keywords.
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
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: These conditional statements are used to check the type of message and the rekeying status, and return if the conditions are not met.
**Why it's used**: Conditional statements are used to make decisions in a program based on certain conditions, making it possible to control the flow of the program.
**If you change/remove it**: If you remove these conditional statements, the program will not be able to check the type of message and the rekeying status, and the program may not work as expected.

---
### Concept 5: Array Methods
Array methods are used to perform operations on arrays, such as iterating over the elements or filtering the elements.
**General Example**
```javascript
const numbers = [1, 2, 3, 4, 5];
numbers.forEach((number) => {
  console.log(number);
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
**How it works here**: The `map` method is used to iterate over the messages and perform an operation on each message.
**Why it's used**: Array methods are used to perform operations on arrays, making it possible to work with collections of data.
**If you change/remove it**: If you remove this array method, the program will not be able to iterate over the messages, and the program will not be able to process the messages.

---
### Concept 6: String Manipulation
String manipulation is used to perform operations on strings, such as splitting or replacing characters.
**General Example**
```javascript
const text = 'Hello, world!';
const parts = text.split(',');
console.log(parts); // Outputs: ['Hello', ' world!']
```
**In Our Code**
```javascript
const parts = txt.trim().split(/\s+/);
```
**How it works here**: The `split` method is used to split the text into parts based on the whitespace characters.
**Why it's used**: String manipulation is used to perform operations on strings, making it possible to work with text data.
**If you change/remove it**: If you remove this string manipulation, the program will not be able to split the text into parts, and the program will not be able to process the text.

---
### Concept 7: Regular Expressions
Regular expressions are used to match patterns in strings.
**General Example**
```javascript
const text = 'Hello, world!';
const match = text.match(/world/);
console.log(match); // Outputs: ['world']
```
**In Our Code**
```javascript
const parts = txt.trim().split(/\s+/);
```
**How it works here**: The regular expression `/\s+/` is used to match one or more whitespace characters.
**Why it's used**: Regular expressions are used to match patterns in strings, making it possible to work with complex text data.
**If you change/remove it**: If you remove this regular expression, the program will not be able to split the text into parts based on the whitespace characters, and the program will not be able to process the text.

---
### Concept 8: Number Parsing
Number parsing is used to convert strings to numbers.
**General Example**
```javascript
const text = '123';
const number = parseInt(text);
console.log(number); // Outputs: 123
```
**In Our Code**
```javascript
amount = parseInt(part);
```
**How it works here**: The `parseInt` function is used to convert the string to a number.
**Why it's used**: Number parsing is used to convert strings to numbers, making it possible to work with numerical data.
**If you change/remove it**: If you remove this number parsing, the program will not be able to convert the string to a number, and the program will not be able to process the numerical data.

---
### Concept 9: Object Properties
Object properties are used to access and modify the properties of an object.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const loanRequest = loans.getPendingRequest(senderJid);
```
**How it works here**: The `getPendingRequest` method is used to access the pending loan request property of the `loans` object.
**Why it's used**: Object properties are used to access and modify the properties of an object, making it possible to work with complex data structures.
**If you change/remove it**: If you remove this object property, the program will not be able to access the pending loan request, and the program will not be able to process the loan request.

---
### Concept 10: Promises
Promises are used to handle asynchronous operations, such as sending a message or making a database query.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // Asynchronous operation
  resolve('Result');
});
promise.then((result) => {
  console.log(result); // Outputs: Result
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
**How it works here**: The `Promise.all` method is used to wait for all the promises to resolve before continuing with the execution of the program.
**Why it's used**: Promises are used to handle asynchronous operations, making it possible to work with asynchronous data.
**If you change/remove it**: If you remove this promise, the program will not be able to wait for the asynchronous operation to complete, and the program may not work as expected.

---
### Concept 11: Database Operations
Database operations are used to interact with a database, such as adding, removing, or modifying data.
**General Example**
```javascript
const db = { users: [] };
db.users.push({ name: 'John', age: 25 });
console.log(db.users); // Outputs: [{ name: 'John', age: 25 }]
```
**In Our Code**
```javascript
economy.addMoney(loan.lender, loan.totalRepayment);
```
**How it works here**: The `addMoney` method is used to add money to the lender's account in the economy database.
**Why it's used**: Database operations are used to interact with a database, making it possible to store and retrieve data.
**If you change/remove it**: If you remove this database operation, the program will not be able to add money to the lender's account, and the program will not be able to process the loan repayment.

---
### Concept 12: Math Operations
Math operations are used to perform mathematical calculations, such as addition, subtraction, multiplication, and division.
**General Example**
```javascript
const result = 2 + 2;
console.log(result); // Outputs: 4
```
**In Our Code**
```javascript
const blockMinutes = Math.max(120, Math.ceil(unpaid / 5));
```
**How it works here**: The `Math.max` and `Math.ceil` functions are used to calculate the block minutes based on the unpaid amount.
**Why it's used**: Math operations are used to perform mathematical calculations, making it possible to work with numerical data.
**If you change/remove it**: If you remove this math operation, the program will not be able to calculate the block minutes, and the program will not be able to process the loan default.
