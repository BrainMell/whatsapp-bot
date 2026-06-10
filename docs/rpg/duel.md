# PvP Duel Command Flow (`duel` / `challenge` / `pvp`)

## 1. Description
The PvP/Duel system allows two registered players to challenge each other to a 1v1 battle in a chat. Players can optionally wage/stake Zeni. Fights are structured in turns, allowing each player to make choices like basic attacks (`attack` / `atk`), abilities/skills (`ability` / `skill`), or fleeing (`flee`). Fleeing carries a heavy penalty (losing 20% of XP points capped to level minimum, 50% of wallet Zeni, and a random item in the bag), while the staying player is awarded a victory. It features basic stat dampening/capping to prevent instant one-shots, handles combat turns, resolves stakes, and renders a final summary on completion.

---

## 2. Hierarchical Execution Tree
```text
======================================================
⚔️ DUEL INITIATION: User challenges @friend with wager
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check: primaryCmd === "duel" || "challenge" (L13526)
            └── core/rpg/pvpSystem.js
                └── challengePlayer(chatId, challengerJid, targetJid, stake) (L65)
                    ├── check activeDuels and existing pending invites (L66-73)
                    ├── economy.isRegistered check for challenger and target
                    ├── wallet check for stake compatibility (L87)
                    └── Register invite in duelInvites Map
            └── sock.sendMessage(chatId, { text: inviteBroadcast })

======================================================
✅ ACCEPT CHALLENGE: Challenger types ".j accept"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "accept" (L13400)
        └── core/rpg/pvpSystem.js
            └── acceptChallenge(sock, chatId, senderJid) (L106)
                ├── Retrieve invite from duelInvites (L108)
                ├── Verify stake affordability for both players (L124)
                ├── Deduct stakes gold: economy.removeMoney() (L133)
                ├── Build combat stats & cap extreme stats: capPvPStats() (L149)
                ├── Set duel structure state in activeDuels Map
                └── Send battle graphic buffer or start prompt

======================================================
⚡ COMBAT ACTION: Player types ".j pvp attack"
======================================================
User command
└── core/engine.js
    └── Match check: pvpDuel active intercept OR primaryCmd === "pvp" (L4903 / L13602)
        └── core/rpg/pvpSystem.js
            └── handlePvPAction(sock, chatId, senderJid, action, target, m) (L219)
                ├── Verify sender turn logic (L232)
                ├── Execute action logic (Attack, Skill, or Item)
                ├── Deduct stats (HP / Energy) (L340)
                ├── check victory condition (Hp <= 0)
                │   ├── award stakes to winner: economy.addMoney(winner, stake * 2) (L439)
                │   ├── delete chat session from activeDuels
                │   └── send battle completion log
                ├── Toggle active turn player
                └── Dispatch turn outcomes and updated stats
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
- Handles network notifications for new messages.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L13526-L13636)
* **Line Numbers**: 13526-13636
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Directs execution to `pvpSystem.challengePlayer()` or `pvpSystem.handlePvPAction()`

```javascript
                    // duel @user [stake] / challenge @user [stake]
                    if (
                      primaryCmd === "duel" ||
                      primaryCmd === "challenge"
                    ) {
                      const targetUser = getMentionOrReply(m);
                      let stake = parseInt(cmdArgs.find((a) => !isNaN(parseInt(a))));
                      
                      const result = pvpSystem.challengePlayer(
                        chatId,
                        senderJid,
                        targetUser,
                        stake || 0,
                      );
                      // ... (broadcast challenge message or error)
                      return;
                    }
```

#### Explanation
- Captures the challenge triggers, extracts targets and wager values, and forwards variables to `pvpSystem`.

---

### Step 3: Resolving PvP Actions & Turns
* **File Path**: [core/rpg/pvpSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/pvpSystem.js#L219-L260)
* **Line Numbers**: 219-260
* **Called From**: `handlePvPAction()`
* **Inputs**: `(sock, chatId, senderJid, action, target, m)`
* **Outputs**: Updates battle status, processes turn logs

```javascript
async function handlePvPAction(sock, chatId, senderJid, action, target, m) {
    const duel = activeDuels.get(chatId);
    if (!duel) return { success: false, message: '❌ No active duel in this chat!' };

    const resolvedSender = resolveJid(senderJid);
    const activePlayer = duel.players[duel.turnIndex];
    
    if (activePlayer.jid !== resolvedSender) {
        return { success: false, message: `❌ It's not your turn! Waiting for @${activePlayer.name}'s action.` };
    }

    duel.lastActionTimestamp = Date.now();
    const defender = duel.players[1 - duel.turnIndex];
    // process attack or skill execution ...
```

#### Explanation
1. Checks for active duels in the chat Map.
2. Validates that the message sender's JID matches the player whose turn it currently is.
3. Resets inactivity timers.
4. Identifies the defending player and routes to specific damage math sections.

---

### Step 4: Resolving Death & Stakes
* **File Path**: [core/rpg/pvpSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/pvpSystem.js#L425-L450)
* **Line Numbers**: 425-450
* **Called From**: `handlePvPAction()`
* **Inputs**: Combat damage variables
* **Outputs**: Awards winner wagers and completes the session

```javascript
    if (defender.stats.hp <= 0) {
        defender.stats.hp = 0;
        duel.status = 'COMPLETED';
        activeDuels.delete(chatId);
        
        // Stake Reward Dispatch
        let stakeMsg = '';
        if (duel.stake > 0) {
            const prizePool = duel.stake * 2;
            economy.addMoney(activePlayer.jid, prizePool, 'PvP Duel Win');
            stakeMsg = `\n\n🏆 @${activePlayer.name} wins the wager pool of *${botConfig.getCurrency().symbol}${prizePool.toLocaleString()}* Zeni!`;
        }
        
        await sock.sendMessage(chatId, { text: `⚔️ *DUEL FINISHED!* ⚔️\n\n@${activePlayer.name} has defeated @${defender.name}!${stakeMsg}` });
        return;
    }
```

#### Explanation
1. Checks if the defender's HP drops to 0 or below.
2. If dead, deletes the duel session from the `activeDuels` Map.
3. Computes the total prize pool (challenging wager * 2) and awards it to the winner's wallet using `economy.addMoney()`.
4. Outputs the final victory announcement to WhatsApp.

---

## 4. How to Modify
- **PvP Damage Mitigation Caps**: Adjust `PVP_DAMAGE_MULT` (currently 0.8) or `PVP_DEFENSE_CAP` (currently 0.5) constants at [core/rpg/pvpSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/pvpSystem.js#L31-L33).
- **Modify Challenge Timeout Duration**: Change `CHALLENGE_TIMEOUT` values (currently 120000ms/2 minutes).
- **Edit Combat Actions Vocabulary**: Add alias overrides to the command parser in [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4909).
- **Adjust Flee Penalties**: Modify XP, wallet, or item deduction formulas inside the `flee` block of `handlePvPAction` in [core/rpg/pvpSystem.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/pvpSystem.js).










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
const targetUser = getMentionOrReply(m);
let stake = parseInt(cmdArgs.find((a) => !isNaN(parseInt(a))));
```
**How it works here**: In the code, `targetUser` and `stake` are variables used to store the target user and the stake value, respectively.
**Why it's used**: Variables are used to store and reuse values in the program, making the code more efficient and easier to read.
**If you change/remove it**: If you remove the `targetUser` variable, the program won't be able to store the target user, and the duel functionality won't work. If you remove the `stake` variable, the program won't be able to store the stake value, and the wager pool calculation won't work.

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
**How it works here**: The arrow function is used to define an event listener for the `messages.upsert` event.
**Why it's used**: Arrow functions are used to define small, single-purpose functions, making the code more concise and easier to read.
**If you change/remove it**: If you remove the arrow function, the event listener won't be defined, and the program won't be able to handle the `messages.upsert` event.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events, such as user interactions or network requests. They are defined using the `on` method.
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
**How it works here**: The event listener is used to respond to the `messages.upsert` event, which is triggered when a new message is received.
**Why it's used**: Event listeners are used to respond to events, making the program interactive and dynamic.
**If you change/remove it**: If you remove the event listener, the program won't be able to respond to the `messages.upsert` event, and the duel functionality won't work.

---
### Concept 4: Array Methods
Array methods are used to manipulate and transform arrays. Examples include `map`, `find`, and `filter`.
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
**How it works here**: The `map` method is used to transform the `messages` array into an array of promises.
**Why it's used**: Array methods are used to manipulate and transform arrays, making the code more concise and efficient.
**If you change/remove it**: If you remove the `map` method, the program won't be able to transform the `messages` array, and the duel functionality won't work.

---
### Concept 5: Conditional Statements
Conditional statements are used to make decisions based on conditions. Examples include `if` and `switch` statements.
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
**How it works here**: The `if` statements are used to check conditions and return early if they are not met.
**Why it's used**: Conditional statements are used to make decisions based on conditions, making the code more dynamic and interactive.
**If you change/remove it**: If you remove the `if` statements, the program won't be able to check conditions, and the duel functionality may not work as expected.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations, such as network requests or database queries.
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
  })
);
```
**How it works here**: The `Promise.all` method is used to wait for an array of promises to resolve.
**Why it's used**: Promises are used to handle asynchronous operations, making the code more efficient and scalable.
**If you change/remove it**: If you remove the `Promise.all` method, the program won't be able to wait for the promises to resolve, and the duel functionality may not work as expected.

---
### Concept 7: Numbers Parsing
Numbers parsing is used to convert strings to numbers. Examples include `parseInt` and `parseFloat`.
**General Example**
```javascript
const string = '123';
const number = parseInt(string);
console.log(number); // Outputs: 123
```
**In Our Code**
```javascript
let stake = parseInt(cmdArgs.find((a) => !isNaN(parseInt(a))));
```
**How it works here**: The `parseInt` function is used to convert a string to a number.
**Why it's used**: Numbers parsing is used to convert strings to numbers, making the code more efficient and accurate.
**If you change/remove it**: If you remove the `parseInt` function, the program won't be able to convert the string to a number, and the stake value won't be calculated correctly.

---
### Concept 8: Destructuring
Destructuring is used to extract values from objects or arrays.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
const { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // ...
});
```
**How it works here**: The destructuring syntax is used to extract the `messages` and `type` values from the event object.
**Why it's used**: Destructuring is used to extract values from objects or arrays, making the code more concise and efficient.
**If you change/remove it**: If you remove the destructuring syntax, the program won't be able to extract the values, and the duel functionality won't work as expected.

---
### Concept 9: Async/Await
Async/await is used to handle asynchronous operations, making the code look more synchronous.
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
**How it works here**: The `await` keyword is used to wait for the promises to resolve.
**Why it's used**: Async/await is used to handle asynchronous operations, making the code more efficient and easier to read.
**If you change/remove it**: If you remove the `await` keyword, the program won't be able to wait for the promises to resolve, and the duel functionality may not work as expected.

---
### Concept 10: Object Properties
Object properties are used to access and manipulate values in objects.
**General Example**
```javascript
const person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const result = pvpSystem.challengePlayer(
  chatId,
  senderJid,
  targetUser,
  stake || 0,
);
```
**How it works here**: The object properties are used to access and manipulate values in the `pvpSystem` object.
**Why it's used**: Object properties are used to access and manipulate values in objects, making the code more efficient and accurate.
**If you change/remove it**: If you remove the object properties, the program won't be able to access and manipulate the values, and the duel functionality won't work as expected.
