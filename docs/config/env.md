# Configuration & Environment Setup

## What it is
The Configuration Subsystem initializes runtime settings and handles global secret parameters. It reads environment variables from a `.env` configuration file at startup. It utilizes the `BotConfig` class to load and isolate instance-specific options (such as bot name, ID, command prefix, currency symbol, and directories) for multiple threads or running instances. It uses Node.js `AsyncLocalStorage` to store the active configuration context across asynchronous calls, allowing multi-instance scaling.

## How it works

**Thread-Local Instance Configuration** — [botConfig.js L3-L33](https://github.com/BrainMell/whatsapp-bot/blob/main/botConfig.js#L3-L33)
```javascript
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

class BotConfig {
  constructor(instancePath) {
    this.instancePath = instancePath;
    this.defaults = {
      botId: "bot1",
      botName: "Joker",
      prefix: ".j",
      version: "5.3.2",
      symbol: ".",
      currency: {
        symbol: "Ꞩ",
        name: "Zeni"
      },
      contentDescription: "You are Joker from Persona 5."
    };
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configPath = path.join(this.instancePath, 'botConfig.json');
      if (fs.existsSync(configPath)) {
        return { ...this.defaults, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
      }
    } catch (e) {}
    return this.defaults;
  }
}
```
This class manages the lifecycle of a bot instance config. It specifies fallbacks for prefixes and currencies, maps them to an absolute instance path, reads local json configs if they exist, and links them to an `AsyncLocalStorage` thread-local context.

---

**Environment Variables Catalog** — [.env L1-L15](https://github.com/BrainMell/whatsapp-bot/blob/main/.env#L1-L15)
```ini
# Database Connection
MONGO_URI="mongodb+srv://..."

# External Microservice endpoint
GO_IMAGE_SERVICE_URL="https://..."

# LLM APIs Keys (Comma-separated for key rotation)
GROQ_API_KEYS=gsk_...,gsk_...

# Cloudinary Integration (for slideshow media uploads)
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```
This is the schema mapping for the system environment settings file. It exposes database clusters, microservice endpoints, LLM API keys for rotation, and Cloudinary media cloud integrations.

---

**Configuration Proxy Resolvers** — [botConfig.js L61-L80](https://github.com/BrainMell/whatsapp-bot/blob/main/botConfig.js#L61-L80)
```javascript
module.exports = {
  BotConfig,
  storage,
  // Helper to get active config
  get: () => storage.getStore(),
  
  // Proxy for legacy support (require('./botConfig').getBotName())
  getBotId: () => (storage.getStore()?.getBotId() || "global"),
  getBotName: () => (storage.getStore()?.getBotName() || "Bot"),
  getPrefix: () => (storage.getStore()?.getPrefix() || ".j"),
  getVersion: () => (storage.getStore()?.getVersion() || "5.3.2"),
  getCurrency: () => (storage.getStore()?.getCurrency() || { symbol: "Ꞩ", name: "Zeni" }),
  getSymbol: () => (storage.getStore()?.getSymbol() || "."),
  getContentDescription: () => (storage.getStore()?.getContentDescription() || ""),
  getAssetPath: (p) => storage.getStore()?.getAssetPath(p),
  getStickerPath: (p) => storage.getStore()?.getStickerPath(p),
  getAuthPath: () => storage.getStore()?.getAuthPath(),
  getDataPath: (p) => storage.getStore()?.getDataPath(p),
  getRPGAssetPath: (p) => storage.getStore()?.getRPGAssetPath(p)
};
```
This exports block exposes wrapper methods acting as proxy resolvers. They forward property requests directly to the current thread-scoped `AsyncLocalStorage` object, maintaining compatibility with legacy static exports.

## How to modify it
To change system defaults or credentials parameters, developers can alter initialization definitions.

```javascript
// BEFORE (botConfig.js L10-L14)
    this.defaults = {
      botId: "bot1",
      botName: "Joker",
      prefix: ".j",
```
```javascript
// AFTER (botConfig.js L10-L14)
    this.defaults = {
      botId: "bot1",
      botName: "Oracle", // Changed botName
      prefix: ".o",      // Changed prefix
```

```javascript
// BEFORE (botConfig.js L16-L19)
      currency: {
        symbol: "Ꞩ",
        name: "Zeni"
      },
```
```javascript
// AFTER (botConfig.js L16-L19)
      currency: {
        symbol: "$",       // Changed currency symbol
        name: "Credits"    // Changed currency name
      },
```

## Common tasks
- **Change the default bot prefix** — Modify the command prefix default property value in [botConfig.js L13](https://github.com/BrainMell/whatsapp-bot/blob/main/botConfig.js#L13).
- **Change default currency settings** — Adjust the currency symbol and name defaults in [botConfig.js L16-L19](https://github.com/BrainMell/whatsapp-bot/blob/main/botConfig.js#L16-L19).
- **Configure bot nickname default** — Change the name property of the bot configuration defaults in [botConfig.js L12](https://github.com/BrainMell/whatsapp-bot/blob/main/botConfig.js#L12).
- **Update system version string** — Customize the fallback version identifier in [botConfig.js L14](https://github.com/BrainMell/whatsapp-bot/blob/main/botConfig.js#L14).










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
this.defaults = {
  botId: "bot1",
  botName: "Joker",
  prefix: ".j",
  // ...
};
```
**How it works here**: Variables are used to store configuration values, such as `botId`, `botName`, and `prefix`.
**Why it's used**: Variables are used to make the code more readable and maintainable, by giving a name to a value.
**If you change/remove it**: If you remove a variable, the code will throw an error when trying to access it. If you change the value of a variable, the code will use the new value.

---
### Concept 2: Objects
Objects are used to store a collection of key-value pairs. They are defined using curly brackets `{}`.
**General Example**
```javascript
let person = { name: 'John', age: 30 };
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
this.defaults = {
  botId: "bot1",
  botName: "Joker",
  prefix: ".j",
  // ...
};
```
**How it works here**: Objects are used to store configuration values, such as `botId`, `botName`, and `prefix`.
**Why it's used**: Objects are used to group related values together, making it easier to access and manipulate them.
**If you change/remove it**: If you remove an object, the code will throw an error when trying to access it. If you change the value of an object property, the code will use the new value.

---
### Concept 3: Classes
Classes are used to define a blueprint for creating objects. They are defined using the `class` keyword.
**General Example**
```javascript
class Person {
  constructor(name, age) {
    this.name = name;
    this.age = age;
  }
}
let person = new Person('John', 30);
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
class BotConfig {
  constructor(instancePath) {
    this.instancePath = instancePath;
    this.defaults = {
      // ...
    };
    this.config = this.loadConfig();
  }
  // ...
}
```
**How it works here**: A class is used to define a `BotConfig` object, which has properties and methods.
**Why it's used**: Classes are used to encapsulate data and behavior, making it easier to create and manage complex objects.
**If you change/remove it**: If you remove a class, the code will throw an error when trying to create an instance of it. If you change the class definition, the code will use the new definition.

---
### Concept 4: Constructors
Constructors are special methods that are called when an object is created. They are used to initialize the object's properties.
**General Example**
```javascript
class Person {
  constructor(name, age) {
    this.name = name;
    this.age = age;
  }
}
let person = new Person('John', 30);
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
class BotConfig {
  constructor(instancePath) {
    this.instancePath = instancePath;
    this.defaults = {
      // ...
    };
    this.config = this.loadConfig();
  }
  // ...
}
```
**How it works here**: The constructor is used to initialize the `BotConfig` object's properties, such as `instancePath` and `defaults`.
**Why it's used**: Constructors are used to ensure that objects are created with the necessary properties and values.
**If you change/remove it**: If you remove a constructor, the code will throw an error when trying to create an instance of the class. If you change the constructor, the code will use the new initialization logic.

---
### Concept 5: Methods
Methods are functions that are defined inside a class or object. They are used to perform actions on the object's data.
**General Example**
```javascript
class Person {
  constructor(name, age) {
    this.name = name;
    this.age = age;
  }
  sayHello() {
    console.log(`Hello, my name is ${this.name}!`);
  }
}
let person = new Person('John', 30);
person.sayHello(); // Outputs: Hello, my name is John!
```
**In Our Code**
```javascript
class BotConfig {
  // ...
  loadConfig() {
    try {
      const configPath = path.join(this.instancePath, 'botConfig.json');
      if (fs.existsSync(configPath)) {
        return { ...this.defaults, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
      }
    } catch (e) {}
    return this.defaults;
  }
}
```
**How it works here**: The `loadConfig` method is used to load the configuration data from a file.
**Why it's used**: Methods are used to encapsulate behavior and make it easier to reuse code.
**If you change/remove it**: If you remove a method, the code will throw an error when trying to call it. If you change the method implementation, the code will use the new logic.

---
### Concept 6: Importing Modules
Importing modules allows you to use functions and variables defined in other files.
**General Example**
```javascript
const fs = require('fs');
fs.readFile('file.txt', (err, data) => {
  console.log(data);
});
```
**In Our Code**
```javascript
const { AsyncLocalStorage } = require('async_hooks');
const storage = new AsyncLocalStorage();
```
**How it works here**: The `async_hooks` module is imported to use the `AsyncLocalStorage` class.
**Why it's used**: Importing modules allows you to reuse code and make your program more modular.
**If you change/remove it**: If you remove an import statement, the code will throw an error when trying to use the imported module. If you change the import statement, the code will use the new module.

---
### Concept 7: Exporting Modules
Exporting modules allows you to make functions and variables defined in your file available to other files.
**General Example**
```javascript
module.exports = {
  add: (a, b) => a + b,
};
```
**In Our Code**
```javascript
module.exports = {
  BotConfig,
  storage,
  // ...
};
```
**How it works here**: The `BotConfig` class and `storage` object are exported to make them available to other files.
**Why it's used**: Exporting modules allows you to reuse code and make your program more modular.
**If you change/remove it**: If you remove an export statement, the code will throw an error when trying to import the module. If you change the export statement, the code will use the new module.

---
### Concept 8: Arrow Functions
Arrow functions are a concise way to define functions. They are defined using the `=>` syntax.
**General Example**
```javascript
const add = (a, b) => a + b;
console.log(add(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
get: () => storage.getStore(),
```
**How it works here**: An arrow function is used to define a getter function for the `get` property.
**Why it's used**: Arrow functions are used to make the code more concise and easier to read.
**If you change/remove it**: If you remove an arrow function, the code will throw an error when trying to call it. If you change the arrow function implementation, the code will use the new logic.

---
### Concept 9: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions. They are defined using the `if` and `else` keywords.
**General Example**
```javascript
let x = 5;
if (x > 10) {
  console.log('x is greater than 10');
} else {
  console.log('x is less than or equal to 10');
}
```
**In Our Code**
```javascript
if (fs.existsSync(configPath)) {
  return { ...this.defaults, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
}
```
**How it works here**: A conditional statement is used to check if a file exists and load its contents if it does.
**Why it's used**: Conditional statements are used to make decisions based on conditions and execute different blocks of code.
**If you change/remove it**: If you remove a conditional statement, the code will always execute the same block of code. If you change the conditional statement, the code will make different decisions based on the new condition.

---
### Concept 10: Try-Catch Blocks
Try-catch blocks are used to handle errors that occur during the execution of code. They are defined using the `try` and `catch` keywords.
**General Example**
```javascript
try {
  let x = 5 / 0;
} catch (e) {
  console.log('Error:', e);
}
```
**In Our Code**
```javascript
try {
  const configPath = path.join(this.instancePath, 'botConfig.json');
  if (fs.existsSync(configPath)) {
    return { ...this.defaults, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  }
} catch (e) {}
```
**How it works here**: A try-catch block is used to handle errors that occur when loading the configuration file.
**Why it's used**: Try-catch blocks are used to handle errors and prevent the program from crashing.
**If you change/remove it**: If you remove a try-catch block, the code will throw an error when an error occurs. If you change the try-catch block, the code will handle errors differently.
