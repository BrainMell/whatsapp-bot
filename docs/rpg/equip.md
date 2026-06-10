# Equip & Unequip Commands Flow (`equip` / `unequip`)

## 1. Description
The `equip` and `unequip` commands allow users to manage their character's equipment. Equipping an item verifies level requirements, checks equipment category validity, ensures slot-type compatibility (e.g. you can't equip boots to the helmet slot), resolves two-handed weapon constraints, removes the item from the user's inventory bag, and attaches it to the respective equipment slot. Unequipping does the reverse, moving items back into the inventory after ensuring space availability.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🛡️ EQUIP FLOW: User sends ".j equip 3 helmet" or ".j equip iron_sword"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check: primaryCmd === "equip" (L4964 / L13726)
            └── core/commands/rpgCommands.js
                └── equipItem(sock, chatId, senderJid, itemId, slot) (L392)
                    ├── inventorySystem.getEquipment(senderJid)
                    ├── Resolves index (e.g., "3") to targetItemId
                    ├── core/rpg/inventorySystem.js
                    │   └── equipItem(senderJid, targetItemId, slot) (L342)
                    │       ├── Retrieve user inventory & level
                    │       ├── Check level requirements (L367)
                    │       ├── Resolve slot type compatibilities (L400-427)
                    │       ├── Check Two-Handed weapon overrides (L431-454)
                    │       ├── removeItem(userId, itemId, 1) (L435)
                    │       ├── addItem(userId, oldItem.id, 1, oldItem) (L459) [if old equipment exists]
                    │       └── economy.saveUser(userId)
                    └── sock.sendMessage(chatId, { text: successMessage })

======================================================
🛡️ UNEQUIP FLOW: User sends ".j unequip weapon"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: primaryCmd === "unequip" (L4976 / L13758)
            └── core/commands/rpgCommands.js
                └── unequipItem(sock, chatId, senderJid, slot) (L436)
                    └── core/rpg/inventorySystem.js
                        └── unequipItem(senderJid, slot) (L474)
                            ├── getEquipment(userId) & check existence
                            ├── Check if inventory is full (L496)
                            ├── addItem(userId, item.id, 1, item) (L503)
                            ├── Remove from slot: equipment[slotName] = null
                            └── economy.saveUser(userId)
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
- Receives the message payload from Baileys, checks status codes, and distributes keys to command-routing loops.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13724-L13766)
* **Line Numbers**: 13724-13766
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and arguments
* **Outputs**: Redirects execution to `rpgCommands.equipItem` or `rpgCommands.unequipItem`

```javascript
                  // EQUIPMENT COMMANDS
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} equip`
                  ) {
                    await rpgCommands.equipItem(sock, chatId, senderJid);
                    return;
                  }
                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} equip `,
                    )
                  ) {
                    const args = txt.trim().split(/\s+/).slice(2);
                    const slot = args[1];
                    await rpgCommands.equipItem(
                      sock,
                      chatId,
                      senderJid,
                      args[0],
                      slot,
                    );
                    return;
                  }
                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} unequip `,
                    )
                  ) {
                    const slot = txt
                      .substring(
                        `${botConfig.getPrefix().toLowerCase()} unequip `.length,
                      )
                      .trim();
                    await rpgCommands.unequipItem(
                      sock,
                      chatId,
                      senderJid,
                      slot,
                    );
                    return;
                  }
```

#### Explanation
- Evaluates the incoming message command prefix.
- If matches `.j equip`, it splits args: `args[0]` represents target itemId or index; `args[1]` specifies an optional custom slot override.
- Invokes the corresponding wrapper in `rpgCommands.js`.

---

### Step 3: Resolving Item ID and Calling Backend Core
* **File Path**: [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L392-L450)
* **Line Numbers**: 392-450
* **Called From**: `equipItem()` or `unequipItem()`
* **Inputs**: `(sock, chatId, senderJid, itemId, slot)` / `(sock, chatId, senderJid, slot)`
* **Outputs**: Invokes `inventorySystem` functions, returns message to WhatsApp client

```javascript
async function equipItem(sock, chatId, senderJid, itemId, slot) { 
    const equipment = inventorySystem.getEquipment(senderJid);
    if (!equipment) return;

    if (!itemId) { 
        // ... (Lists equipped slots and tutorial guide)
        return;
    }

    let targetItemId = itemId;
    if (!isNaN(parseInt(itemId))) { 
        const inventory = inventorySystem.formatInventory(senderJid);
        const index = parseInt(itemId) - 1;
        if (!inventory.isEmpty && inventory.items[index]) { 
            targetItemId = inventory.items[index].id;
        }
    }

    const result = await inventorySystem.equipItem(senderJid, targetItemId, slot);
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.equipped);
    await sock.sendMessage(chatId, { text: `✅ Equipped ${itemInfo.name} to *${result.slot}* slot!` });
}
```

#### Explanation
- Translates inventory indices (e.g. `1`, `2`) into actual item JIDs (e.g., `iron_shield`).
- Offloads actual processing and validation to `inventorySystem.js`.
- Updates the user interface via text messages on completion status.

---

### Step 4: Core Equipment Management and Constraints Check
* **File Path**: [core/rpg/inventorySystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/inventorySystem.js#L342-L510)
* **Line Numbers**: 342-510
* **Called From**: `inventorySystem.equipItem()` / `inventorySystem.unequipItem()`
* **Inputs**: `(userId, itemId, slot)` / `(userId, slot)`
* **Outputs**: `{ success: boolean, message/equipped/slot: any }`

```javascript
async function equipItem(userId, itemId, slot) {
    const inventory = getInventory(userId);
    const equipment = getEquipment(userId);
    const progression = require('./progression');
    
    // Checks item presence in user's inventory...
    const itemToEquip = inventory[targetItemId];
    const itemInfo = lootSystem.getItemInfo(targetItemId);
    const playerLevel = progression.getLevel(userId);

    // level check
    const reqLevel = itemToEquip.reqLevel || itemInfo.reqLevel || 1;
    if (playerLevel < reqLevel) {
        return { success: false, message: `❌ Level too low! Need Level ${reqLevel} to use this.` };
    }
    
    // verify category compatibility
    if (itemInfo.type !== 'EQUIPMENT') {
        return { success: false, message: `❌ Not equipment!` };
    }

    // slot assignment compatibility checks
    const itemSlot = (itemToEquip.slot || itemInfo.slot || '').toLowerCase();
    // (Compatibility match logic checks: main_hand, off_hand, armor, boots, etc.)
    
    // TWO-HANDED weapon logic overrides:
    // If equipping a two-handed weapon to main_hand, automatically unequip off_hand
    if (isTwoHanded && slotName === 'main_hand' && equipment.off_hand) {
        const offHand = equipment.off_hand;
        equipment.off_hand = null;
        await addItem(userId, offHand.id, 1, offHand);
    }

    // remove new item from inventory bag
    removeItem(userId, itemId, 1);

    // put old item back in inventory bag
    const oldItem = equipment[slotName];
    if (oldItem) {
        await addItem(userId, oldItem.id, 1, oldItem);
    }
    
    // mount new item in slot
    equipment[slotName] = { ...itemToEquip };
    delete equipment[slotName].quantity;
    
    await economy.saveUser(userId);
    return { success: true, equipped: itemId, slot: slotName };
}
```

#### Explanation
1. **Level Check**: Compares player level with the item's `reqLevel`.
2. **Type Check**: Verifies the item category is `EQUIPMENT`.
3. **Slot Match**: Prevents players from equipping armor to ring slots, etc.
4. **Two-Handed Override**: If a user equips a two-handed weapon to `main_hand`, any shield/weapon in `off_hand` is unequipped. Conversely, if a two-handed weapon is equipped, a shield cannot be attached to `off_hand`.
5. **Inventory Update**: Deducts the equipped item count, returns previous equipment in that slot to the inventory bag, and saves the new states in the cache via `economy.saveUser()`.

---

## 4. How to Modify
- **Add Custom Slots**: Update the `EQUIPMENT_SLOTS` enum mapping in [core/rpg/inventorySystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/inventorySystem.js#L26).
- **Adjust Base Level Requirements**: Modify the `reqLevel` variable in item definitions inside [core/rpg/lootSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/lootSystem.js).
- **Modify Equipment Slot Icons**: Edit the `getSlotIcon` function inside [core/commands/rpgCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/rpgCommands.js#L469).










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
const equipment = inventorySystem.getEquipment(senderJid);
const itemInfo = lootSystem.getItemInfo(result.equipped);
```
**How it works here**: Variables are used to store the result of function calls, such as `inventorySystem.getEquipment(senderJid)` and `lootSystem.getItemInfo(result.equipped)`.
**Why it's used**: Variables are used to make the code more readable and to avoid repeating complex expressions.
**If you change/remove it**: If you remove the variable declarations, the code will throw an error because the variables will not be defined. If you change the variable names, the code will still work as long as the new names are used consistently.

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to define small, single-purpose functions. They are defined using the `=>` syntax.
**General Example**
```javascript
let greet = (name) => { console.log(`Hello, ${name}!`); };
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: An arrow function is used as the event handler for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions that can be passed as arguments to other functions or used as event handlers.
**If you change/remove it**: If you remove the arrow function, the event handler will not be defined, and the code will not respond to the `messages.upsert` event. If you change the arrow function to a traditional function, the code will still work, but the syntax will be different.

---
### Concept 3: Event Listeners
Event listeners are functions that are called in response to a specific event, such as a user clicking a button or a message being received.
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
**How it works here**: An event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to user interactions or other events that occur in the program.
**If you change/remove it**: If you remove the event listener, the program will not respond to the `messages.upsert` event. If you change the event listener to respond to a different event, the program will respond to the new event instead.

---
### Concept 4: Array Methods
Array methods are functions that can be called on arrays to perform operations such as mapping, filtering, and reducing.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map((num) => num * 2);
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
**How it works here**: The `map` method is used to transform each message in the `messages` array into a promise that can be awaited.
**Why it's used**: Array methods are used to perform operations on arrays in a concise and expressive way.
**If you change/remove it**: If you remove the `map` method, the code will not transform each message into a promise, and the `Promise.all` method will not work correctly. If you change the `map` method to a different array method, the code will perform a different operation on the array.

---
### Concept 5: Conditional Statements
Conditional statements are used to execute different blocks of code based on conditions such as true or false values.
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
**How it works here**: Conditional statements are used to check the `type` and `isRekeying` variables and return early if certain conditions are met.
**Why it's used**: Conditional statements are used to make decisions in the code based on conditions.
**If you change/remove it**: If you remove the conditional statements, the code will not check the `type` and `isRekeying` variables, and the program may behave incorrectly. If you change the conditions, the code will make different decisions based on the new conditions.

---
### Concept 6: Numbers Parsing
Numbers parsing is the process of converting a string into a number.
**General Example**
```javascript
let str = '123';
let num = parseInt(str);
console.log(num); // Outputs: 123
```
**In Our Code**
```javascript
if (!isNaN(parseInt(itemId))) { 
  const index = parseInt(itemId) - 1;
  // ...
}
```
**How it works here**: The `parseInt` function is used to parse the `itemId` string into a number.
**Why it's used**: Numbers parsing is used to convert strings into numbers so that they can be used in numerical operations.
**If you change/remove it**: If you remove the `parseInt` function, the code will not be able to convert the `itemId` string into a number, and the program may behave incorrectly. If you change the `parseInt` function to a different parsing function, the code will use a different parsing algorithm.

---
### Concept 7: Imports
Imports are used to bring in external modules or functions into the current scope.
**General Example**
```javascript
import { greet } from './greet.js';
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
const progression = require('./progression');
```
**How it works here**: The `require` function is used to import the `progression` module.
**Why it's used**: Imports are used to bring in external modules or functions into the current scope so that they can be used in the code.
**If you change/remove it**: If you remove the import statement, the code will not be able to use the `progression` module, and the program may behave incorrectly. If you change the import statement to import a different module, the code will use the new module instead.

---
### Concept 8: Destructuring
Destructuring is a way to extract values from arrays or objects into separate variables.
**General Example**
```javascript
let arr = [1, 2, 3];
let [a, b, c] = arr;
console.log(a, b, c); // Outputs: 1 2 3
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: Destructuring is used to extract the `messages` and `type` values from the object passed to the event handler.
**Why it's used**: Destructuring is used to extract values from arrays or objects into separate variables in a concise and expressive way.
**If you change/remove it**: If you remove the destructuring, the code will not be able to extract the `messages` and `type` values, and the program may behave incorrectly. If you change the destructuring to extract different values, the code will use the new values instead.

---
### Concept 9: Promises
Promises are used to handle asynchronous operations in a concise and expressive way.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // ...
});
promise.then((value) => {
  console.log(value);
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
**How it works here**: Promises are used to handle the asynchronous operations of mapping over the `messages` array and awaiting the results.
**Why it's used**: Promises are used to handle asynchronous operations in a concise and expressive way.
**If you change/remove it**: If you remove the promises, the code will not be able to handle the asynchronous operations, and the program may behave incorrectly. If you change the promises to use a different asynchronous handling mechanism, the code will use the new mechanism instead.

---
### Concept 10: Database Operations
Database operations are used to interact with a database, such as reading or writing data.
**General Example**
```javascript
let db = require('./db.js');
db.insert({ name: 'John', age: 25 });
```
**In Our Code**
```javascript
const equipment = inventorySystem.getEquipment(senderJid);
const itemInfo = lootSystem.getItemInfo(result.equipped);
```
**How it works here**: Database operations are used to interact with the inventory system and loot system databases.
**Why it's used**: Database operations are used to store and retrieve data in a persistent way.
**If you change/remove it**: If you remove the database operations, the code will not be able to interact with the databases, and the program may behave incorrectly. If you change the database operations to use a different database or storage mechanism, the code will use the new mechanism instead.
