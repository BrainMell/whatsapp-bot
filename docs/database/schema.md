# Database & Schema Configurations

## What it is
The Database Subsystem manages persistent storage for the bot. It uses Mongoose (a MongoDB object modeling tool) to connect to a MongoDB cluster and enforce document schemas. It maintains collection models for players (`User`), system configuration flags (`System`), guild records (`Guild`), loan documents (`Loan`), and card deck settings (`UserCard`). Connection initialization is managed by `db.js`, which features auto-retry logic to guarantee availability during network interruptions. The database acts as the primary data store for the bot’s text commands, RPG modules, in-game economies, and session sync tokens.

## How it works

**MongoDB Mongoose Connection** — [db.js L6-21](https://github.com/BrainMell/whatsapp-bot/blob/main/db.js#L6-21)
```javascript
const connectDB = async () => {
  if (isConnected) return;

  while (!isConnected) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI);
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      isConnected = true;
      return;
    } catch (error) {
      console.error(`❌ Error connecting to MongoDB: ${error.message}`);
      console.log("🔁 Retrying in 5 seconds...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};
```
This module establishes a connection to MongoDB using the URI specified in the environment variables. If the database is not initially reachable, it enters a while loop, logging errors and retrying the connection attempt every 5 seconds until a successful connection is made.

---

**User Schema Definition (Partial)** — [User.js L3-47](https://github.com/BrainMell/whatsapp-bot/blob/main/core/models/User.js#L3-47)
```javascript
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  
  // Basic Econ
  wallet: { type: Number, default: 1000 },
  bank: { type: Number, default: 0 },
  registered: { type: Boolean, default: false },
  nickname: { type: String, default: 'Adventurer' },

  // Timers
  lastDaily: { type: Number, default: 0 },
  lastRob: { type: Number, default: 0 },
  jailUntil: { type: Number, default: 0 },
  prisonUntil: { type: Number, default: 0 },
  robberyStrikes: { type: Number, default: 0 },
  lastClassChange: { type: Number, default: 0 },
  lastFishReset: { type: Number, default: 0 },
  fishCount: { type: Number, default: 0 },
  classChangeCount: { type: Number, default: 0 },
  lastClassChangeReset: { type: Number, default: 0 },

  // RPG Stats
  class: { type: String, default: null },
  adventurerRank: { type: String, default: 'F' },
  spriteIndex: { type: Number, default: 0 },
  
  questGold: { type: Number, default: 0 },
  questsCompleted: { type: Number, default: 0 },
  questsWon: { type: Number, default: 0 },
  questsFailed: { type: Number, default: 0 },
  
  // Flexible Objects
  inventory: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  
  equipment: {
    main_hand: { type: Object, default: null },
    off_hand: { type: Object, default: null },
    armor: { type: Object, default: null },
    helmet: { type: Object, default: null },
    boots: { type: Object, default: null },
    ring: { type: Object, default: null },
    amulet: { type: Object, default: null },
    cloak: { type: Object, default: null },
    gloves: { type: Object, default: null }
  },
```
This portion of the User Mongoose Schema specifies standard keys for player statistics and states. It stores basic economy variables (such as wallet and bank balances), adventure stats (classes and ranks), item containers (inventory map), and currently equipped gear.

---

**System Key-Value Schema** — [System.js L3-8](https://github.com/BrainMell/whatsapp-bot/blob/main/core/models/System.js#L3-L8)
```javascript
const SystemSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // e.g., 'blocked_users', 'muted_users', 'group_settings'
    value: { type: mongoose.Schema.Types.Mixed, required: true } // Flexible data
}, { timestamps: true });

module.exports = mongoose.model('System', SystemSchema);
```
The system model defines a simple schema containing a unique index key and a mixed-type value property. This enables the bot to store arbitrary dynamic data structures (such as arrays of blacklisted users or command rate limits) directly in MongoDB without modifying Mongoose collection definitions.

## How to modify it
To change database properties or adjust default schema settings, developers can update the Mongoose initialization values.

```javascript
// BEFORE (db.js L18)
      await new Promise(resolve => setTimeout(resolve, 5000));
```
```javascript
// AFTER (db.js L18)
      await new Promise(resolve => setTimeout(resolve, 10000)); // Increase retry interval to 10 seconds
```

```javascript
// BEFORE (User.js L7)
  wallet: { type: Number, default: 1000 },
```
```javascript
// AFTER (User.js L7)
  wallet: { type: Number, default: 5000 }, // Increase starting wallet balance for new users
```

## Common tasks
- **Change starting wallet balance** — Modify the default value of the wallet key in the user model in [User.js L7](https://github.com/BrainMell/whatsapp-bot/blob/main/core/models/User.js#L7).
- **Adjust the database connection retry delay** — Configure how long the bot waits before attempting to reconnect to MongoDB in [db.js L18](https://github.com/BrainMell/whatsapp-bot/blob/main/db.js#L18).
- **Define system parameters schema** — Customize system storage fields and keys for flexible dynamic settings in [System.js L3-6](https://github.com/BrainMell/whatsapp-bot/blob/main/core/models/System.js#L3-L6).
- **Change default user nickname** — Modify the fallback nickname string for unregistered users in [User.js L10](https://github.com/BrainMell/whatsapp-bot/blob/main/core/models/User.js#L10).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They have a name, and you can assign a value to them.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const isConnected = true;
const UserSchema = new mongoose.Schema({
  // ...
});
```
**How it works here**: Variables are used to store the connection status and the schema definition for the User model.
**Why it's used**: Variables are used to store values that can be used throughout the program, making it easier to manage and modify the code.
**If you change/remove it**: If you remove the `isConnected` variable, the connection status will not be tracked, and the program may not work as expected. If you remove the `UserSchema` variable, the schema definition will not be available, and the program will throw an error.

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
const connectDB = async () => {
  // ...
};
```
**How it works here**: An arrow function is used to define the `connectDB` function, which connects to the MongoDB database.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be used throughout the program.
**If you change/remove it**: If you remove the `connectDB` function, the program will not be able to connect to the database, and will throw an error.

---
### Concept 3: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They are defined using the `if` and `else` keywords.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult.');
} else {
  console.log('You are a minor.');
}
```
**In Our Code**
```javascript
if (isConnected) return;
```
**How it works here**: A conditional statement is used to check if the database is already connected, and if so, the function returns immediately.
**Why it's used**: Conditional statements are used to execute different blocks of code based on certain conditions, making the program more flexible and dynamic.
**If you change/remove it**: If you remove the conditional statement, the function will not check if the database is already connected, and may attempt to connect multiple times, leading to errors.

---
### Concept 4: Loops
Loops are used to execute a block of code repeatedly for a specified number of times. They are defined using the `while` and `for` keywords.
**General Example**
```javascript
let i = 0;
while (i < 5) {
  console.log(i);
  i++;
}
```
**In Our Code**
```javascript
while (!isConnected) {
  // ...
}
```
**How it works here**: A loop is used to repeatedly attempt to connect to the database until a connection is established.
**Why it's used**: Loops are used to execute a block of code repeatedly, making it easier to perform tasks that require repetition.
**If you change/remove it**: If you remove the loop, the program will not attempt to reconnect to the database if the initial connection attempt fails, and will throw an error.

---
### Concept 5: Try-Catch Blocks
Try-catch blocks are used to handle errors that may occur during the execution of a block of code. They are defined using the `try` and `catch` keywords.
**General Example**
```javascript
try {
  let x = 5 / 0;
} catch (error) {
  console.log('Error:', error.message);
}
```
**In Our Code**
```javascript
try {
  const conn = await mongoose.connect(process.env.MONGO_URI);
  // ...
} catch (error) {
  console.error(`Error connecting to MongoDB: ${error.message}`);
  // ...
}
```
**How it works here**: A try-catch block is used to handle any errors that may occur during the connection to the MongoDB database.
**Why it's used**: Try-catch blocks are used to handle errors and prevent the program from crashing.
**If you change/remove it**: If you remove the try-catch block, the program will crash if an error occurs during the connection attempt, and will not be able to recover.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, such as connecting to a database or making an API request. They are defined using the `Promise` constructor.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('Hello, world!');
  }, 2000);
});
promise.then((message) => {
  console.log(message);
});
```
**In Our Code**
```javascript
await new Promise(resolve => setTimeout(resolve, 5000));
```
**How it works here**: A promise is used to delay the execution of the code for a specified amount of time, allowing the program to wait for a certain condition to be met before continuing.
**Why it's used**: Promises are used to handle asynchronous operations, making it easier to write code that is asynchronous and non-blocking.
**If you change/remove it**: If you remove the promise, the program will not wait for the specified amount of time, and may attempt to connect to the database too quickly, leading to errors.

---
### Concept 7: Mongoose Schemas
Mongoose schemas are used to define the structure of a MongoDB document. They are defined using the `mongoose.Schema` constructor.
**General Example**
```javascript
let userSchema = new mongoose.Schema({
  name: String,
  age: Number
});
```
**In Our Code**
```javascript
const UserSchema = new mongoose.Schema({
  // ...
});
```
**How it works here**: A mongoose schema is used to define the structure of the User document, including the fields and their data types.
**Why it's used**: Mongoose schemas are used to define the structure of a MongoDB document, making it easier to work with the data and ensure data consistency.
**If you change/remove it**: If you remove the schema, the program will not be able to define the structure of the User document, and will throw an error.

---
### Concept 8: MongoDB Models
MongoDB models are used to interact with a MongoDB collection. They are defined using the `mongoose.model` function.
**General Example**
```javascript
let User = mongoose.model('User', userSchema);
```
**In Our Code**
```javascript
module.exports = mongoose.model('System', SystemSchema);
```
**How it works here**: A MongoDB model is used to interact with the System collection, allowing the program to perform CRUD operations.
**Why it's used**: MongoDB models are used to interact with a MongoDB collection, making it easier to work with the data and perform common operations.
**If you change/remove it**: If you remove the model, the program will not be able to interact with the System collection, and will throw an error.

---
### Concept 9: Environment Variables
Environment variables are used to store values that are specific to the environment in which the program is running. They are defined using the `process.env` object.
**General Example**
```javascript
let apiUrl = process.env.API_URL;
```
**In Our Code**
```javascript
const conn = await mongoose.connect(process.env.MONGO_URI);
```
**How it works here**: An environment variable is used to store the MongoDB connection URI, allowing the program to connect to the database.
**Why it's used**: Environment variables are used to store values that are specific to the environment, making it easier to manage and deploy the program.
**If you change/remove it**: If you remove the environment variable, the program will not be able to connect to the database, and will throw an error.

---
### Concept 10: Object Literals
Object literals are used to create objects in a concise way. They are defined using the `{}` syntax.
**General Example**
```javascript
let person = {
  name: 'John',
  age: 30
};
```
**In Our Code**
```javascript
const UserSchema = new mongoose.Schema({
  // ...
});
```
**How it works here**: An object literal is used to define the User schema, including the fields and their data types.
**Why it's used**: Object literals are used to create objects in a concise way, making it easier to define and work with data.
**If you change/remove it**: If you remove the object literal, the program will not be able to define the User schema, and will throw an error.

---
### Concept 11: Maps
Maps are used to store key-value pairs in a collection. They are defined using the `Map` constructor.
**General Example**
```javascript
let map = new Map();
map.set('name', 'John');
map.set('age', 30);
```
**In Our Code**
```javascript
inventory: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
```
**How it works here**: A map is used to store the inventory of a user, allowing the program to store and retrieve items.
**Why it's used**: Maps are used to store key-value pairs in a collection, making it easier to work with data that has a complex structure.
**If you change/remove it**: If you remove the map, the program will not be able to store the inventory of a user, and will throw an error.

---
### Concept 12: Timestamps
Timestamps are used to store the date and time of a document's creation or update. They are defined using the `timestamps` option in a mongoose schema.
**General Example**
```javascript
let schema = new mongoose.Schema({
  // ...
}, { timestamps: true });
```
**In Our Code**
```javascript
const SystemSchema = new mongoose.Schema({
  // ...
}, { timestamps: true });
```
**How it works here**: Timestamps are used to store the date and time of a System document's creation or update, allowing the program to track changes.
**Why it's used**: Timestamps are used to store the date and time of a document's creation or update, making it easier to track changes and manage data.
**If you change/remove it**: If you remove the timestamps, the program will not be able to track changes to the System documents, and will not be able to provide accurate information about when documents were created or updated.
