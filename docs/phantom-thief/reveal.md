# Phantom Thief Command Flow (`reveal` / `unmask`)

## 💡 Noob-Friendly Explanation
* **What it does**: When someone sends a "view-once" photo or video in a chat, you can reply to it with `.j reveal` or `.j unmask`, and the bot will send it back as a normal, permanent photo or video that anyone can see, save, or forward.
* **How to use it**: Reply to any view-once image or video message with `.j reveal` or `.j unmask`.
* **Under the Hood (Simple)**: When WhatsApp sends a view-once message, it still transmits the actual image or video file data to the bot. Normally, the WhatsApp app hides the file after you look at it once. The bot simply downloads that file data, ignores the "hide" flag, and posts it back to the group as a regular, open attachment.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j reveal" (replying to a view-once message)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── Match check: primaryCmd === "reveal" || "unmask" (L6097)
            ├── Extract quoted message content: quotedContent (L6100)
            ├── Identify view-once flags: imageMessage.viewOnce or videoMessage.viewOnce
            ├── Download media stream: downloadMedia(mediaMsg, type) (L6140)
            │   └── Baileys library: downloadContentFromMessage()
            ├── Send back raw media: sock.sendMessage(chatId, { [type]: buffer, caption }) (L6178)
            └── Finish processing
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Command Detection and Extraction
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L6097)
* **Inputs**: Message payload `m`, command string `lowerTxt`
* **Outputs**: Directs execution to the view-once extraction block

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reveal` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} unmask`) {
  const quotedMsg = m.message?.extendedTextMessage?.contextInfo;
  const quotedContent = quotedMsg?.quotedMessage;
```

### Step 2: Media Type Identification and Verification
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L6105-L6125)
* **Inputs**: Quoted message contents
* **Outputs**: Resolves the type of media (image/video) and extracts the media metadata object

```javascript
  let type = null;
  let mediaMsg = null;

  if (quotedContent.imageMessage?.viewOnce) {
    type = "image";
    mediaMsg = quotedContent.imageMessage;
  } else if (quotedContent.videoMessage?.viewOnce) {
    type = "video";
    mediaMsg = quotedContent.videoMessage;
  }
```

### Step 3: Downloading the Media Buffer
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L6135-L6150)
* **Inputs**: Media metadata object and media type
* **Outputs**: Returns the raw binary buffer of the media file

```javascript
  const buffer = await downloadMedia(mediaMsg, type);
```

### Step 4: Dispatching the Permanent Media Message
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L6175-L6190)
* **Inputs**: Socket client, target chatId, binary media buffer, and caption string
* **Outputs**: Delivers the permanent media file to WhatsApp

```javascript
  await sock.sendMessage(chatId, {
    [type]: buffer,
    caption: BOT_MARKER + "🎭 *Phantom Thief acquired your secret.*"
  }, { quoted: m });
}
```

---

## 4. How to Modify
* **Change the Caption**: You can customize the message that the bot sends along with the revealed image/video in `engine.js` around line 6178.
* **Add Log or Alert Notification**: If you want to log whenever a user reveals a message, you can add a `console.log` or warning system inside the command handler.










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Conditional Statements
Conditional statements are used to execute different blocks of code based on certain conditions. They allow the program to make decisions and respond accordingly.
**General Example**
```javascript
let x = 5;
if (x > 10) {
  console.log("x is greater than 10");
} else {
  console.log("x is less than or equal to 10");
}
```
**In Our Code**
```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reveal` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} unmask`) {
  ...
}
```
**How it works here**: The code checks if the `lowerTxt` variable matches either of the two specified strings. If it does, the code inside the `if` block is executed.
**Why it's used**: Conditional statements are used to control the flow of the program and respond to different inputs or situations.
**If you change/remove it**: If you remove this conditional statement, the code inside the `if` block would be executed unconditionally, which could lead to unexpected behavior. If you change the condition, the code would respond to different inputs, which could be intended or not, depending on the context.

---
### Concept 2: Variable Declaration and Assignment
Variables are used to store and manipulate data in a program. They can be declared and assigned values using the `let`, `const`, or `var` keywords.
**General Example**
```javascript
let name = "John";
const age = 30;
```
**In Our Code**
```javascript
let type = null;
let mediaMsg = null;
```
**How it works here**: The code declares two variables, `type` and `mediaMsg`, and assigns them initial values of `null`.
**Why it's used**: Variables are used to store and manipulate data in the program, making it possible to write dynamic and interactive code.
**If you change/remove it**: If you remove these variable declarations, the code would throw an error when trying to access or assign values to these variables. If you change the initial values, the code would start with different values, which could affect the program's behavior.

---
### Concept 3: Object Property Access
Object property access is used to retrieve or modify the values of properties within an object.
**General Example**
```javascript
const person = { name: "John", age: 30 };
console.log(person.name); // outputs "John"
```
**In Our Code**
```javascript
const quotedMsg = m.message?.extendedTextMessage?.contextInfo;
const quotedContent = quotedMsg?.quotedMessage;
```
**How it works here**: The code accesses the `extendedTextMessage` and `contextInfo` properties of the `m.message` object, and then accesses the `quotedMessage` property of the `quotedMsg` object.
**Why it's used**: Object property access is used to retrieve or modify the values of properties within an object, making it possible to work with complex data structures.
**If you change/remove it**: If you remove these property accesses, the code would not be able to retrieve the necessary data, leading to errors or unexpected behavior. If you change the property names, the code would access different properties, which could be intended or not, depending on the context.

---
### Concept 4: Nullish Coalescing Operator (?.)
The nullish coalescing operator (?.) is used to access properties of an object that may be null or undefined, without throwing an error.
**General Example**
```javascript
const person = { name: "John" };
console.log(person?.age); // outputs undefined
```
**In Our Code**
```javascript
const quotedMsg = m.message?.extendedTextMessage?.contextInfo;
const quotedContent = quotedMsg?.quotedMessage;
```
**How it works here**: The code uses the nullish coalescing operator to access the `extendedTextMessage` and `contextInfo` properties of the `m.message` object, and then accesses the `quotedMessage` property of the `quotedMsg` object, without throwing an error if any of these properties are null or undefined.
**Why it's used**: The nullish coalescing operator is used to prevent errors when accessing properties of objects that may be null or undefined, making the code more robust and reliable.
**If you change/remove it**: If you remove the nullish coalescing operator, the code would throw an error if any of the accessed properties are null or undefined. If you change the operator, the code would behave differently, depending on the context.

---
### Concept 5: Async/Await and Promises
Async/await and promises are used to handle asynchronous operations, such as network requests or database queries, in a more readable and manageable way.
**General Example**
```javascript
async function fetchData() {
  const response = await fetch("https://example.com/data");
  const data = await response.json();
  console.log(data);
}
```
**In Our Code**
```javascript
const buffer = await downloadMedia(mediaMsg, type);
```
**How it works here**: The code uses the `await` keyword to wait for the `downloadMedia` function to complete, and then assigns the result to the `buffer` variable.
**Why it's used**: Async/await and promises are used to handle asynchronous operations in a more readable and manageable way, making it possible to write asynchronous code that is easier to understand and maintain.
**If you change/remove it**: If you remove the `await` keyword, the code would not wait for the `downloadMedia` function to complete, leading to unexpected behavior. If you change the `downloadMedia` function, the code would behave differently, depending on the context.

---
### Concept 6: Object Literals
Object literals are used to create objects in a concise and readable way.
**General Example**
```javascript
const person = { name: "John", age: 30 };
```
**In Our Code**
```javascript
await sock.sendMessage(chatId, {
  [type]: buffer,
  caption: BOT_MARKER + "🎭 *Phantom Thief acquired your secret.*"
}, { quoted: m });
```
**How it works here**: The code creates an object with two properties, `[type]` and `caption`, and passes it to the `sendMessage` function.
**Why it's used**: Object literals are used to create objects in a concise and readable way, making it possible to write more efficient and maintainable code.
**If you change/remove it**: If you remove the object literal, the code would not pass the necessary data to the `sendMessage` function, leading to errors or unexpected behavior. If you change the property names or values, the code would behave differently, depending on the context.

---
### Concept 7: Template Literals
Template literals are used to create strings that contain expressions or variables.
**General Example**
```javascript
const name = "John";
console.log(`Hello, ${name}!`);
```
**In Our Code**
```javascript
caption: BOT_MARKER + "🎭 *Phantom Thief acquired your secret.*"
```
**How it works here**: The code uses template literals to create a string that contains the `BOT_MARKER` variable and a fixed string.
**Why it's used**: Template literals are used to create strings that contain expressions or variables, making it possible to write more dynamic and flexible code.
**If you change/remove it**: If you remove the template literal, the code would not include the `BOT_MARKER` variable in the string, leading to unexpected behavior. If you change the variable or the fixed string, the code would behave differently, depending on the context.

---
### Concept 8: Computed Property Names
Computed property names are used to create object properties with dynamic names.
**General Example**
```javascript
const propName = "name";
const person = { [propName]: "John" };
```
**In Our Code**
```javascript
[type]: buffer,
```
**How it works here**: The code uses a computed property name to create an object property with a dynamic name, based on the value of the `type` variable.
**Why it's used**: Computed property names are used to create object properties with dynamic names, making it possible to write more flexible and adaptable code.
**If you change/remove it**: If you remove the computed property name, the code would not create the object property with the dynamic name, leading to unexpected behavior. If you change the variable or the property value, the code would behave differently, depending on the context.
