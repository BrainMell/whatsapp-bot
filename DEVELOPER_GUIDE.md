# 📜 Goten Bot: The Ultimate Developer Manual

This document is a comprehensive, technical deep-dive into the Goten Bot codebase. It is designed to provide a developer with complete autonomy over the system, explaining every variable, function, and logic flow in detail.

---

## 🏗️ 1. System Architecture & Lifecycle

The bot operates on a modular architecture, where the connection logic is decoupled from the message processing engine.

### A. The Execution Chain
1.  **`index.js` (The Entry Point)**
    *   **Role**: Initializes the WhatsApp connection using `@whiskeysockets/baileys`.
    *   **Key Functions**:
        *   `startBot()`: Recursive function that maintains the connection loop. It handles QR code generation and session file management (`auth_info_baileys`).
        *   `connection.update`: Event listener that detects disconnects (e.g., `401 Unauthorized`, `515 Restart Required`) and triggers re-connection logic.
    *   **Logic Flow**: `startBot()` -> `makeWASocket()` -> `sock.ev.on('messages.upsert')` -> `engine.handleMessage()`.

2.  **`core/engine.js` (The Brain)**
    *   **Role**: The central router. It receives every raw message object and determines if it's a command, a reply, or noise.
    *   **The Pipeline**:
        ```javascript
        // Simplified Logic Flow in engine.js
        sock.ev.on('messages.upsert', async (m) => {
            // 1. Extraction: Get raw text, sender JID, and Chat ID
            const { txt, senderJid, chatId } = extractMessageDetails(m);
            
            // 2. Sanitation: Lowercase text for matching
            const lowerTxt = txt.toLowerCase();
            
            // 3. Routing: Massive if/else block checking prefixes
            if (lowerTxt.startsWith(PREFIX + ' command')) {
                // 4. Execution: Call specific module function
                await specificModule.handleCommand(sock, chatId, senderJid, args);
            }
        });
        ```

3.  **`core/` Modules (The Limbs)**
    *   These files contain the actual business logic (e.g., `gambling.js`, `economy.js`, `guildAdventure.js`). They **never** listen for messages directly; they only execute what `engine.js` tells them to.

---

## 💾 2. Data Persistence Layer (The "Economy")

The most critical part of the bot is how it handles data. It uses a **Write-Through Cache** strategy to prevent database locking.

### A. The Caching Mechanism (`core/economy.js`)
Instead of querying MongoDB for every single message (which would be slow), the bot loads **everything** into RAM on startup.

*   **`economyData` (Map)**: A global variable holding every user object.
    *   *Key*: `senderJid` (string)
    *   *Value*: `User` Object (see below)
*   **`getUser(userId)`**: Returns the reference to the object in `economyData`.
    *   *Critical Note*: Modifying this object modifies it in RAM immediately.
*   **`scheduleSave(userId)`**: The "Debouncer".
    *   When you modify a user, you call this.
    *   It adds the `userId` to a `pendingSaves` Set.
    *   Every 500ms, a timer wakes up, writes all pending users to MongoDB in bulk, and clears the Set.

### B. The User Object Structure
This is exactly what is stored in the database and RAM.

```javascript
const UserSchema = {
    userId: String,       // "123456789@s.whatsapp.net"
    wallet: Number,       // Liquid cash. Vulnerable to robbery.
    bank: Number,         // Safe cash. Protected from robbery.
    level: Number,        // RPG Level. Determines stats.
    xp: Number,           // Current XP towards next level.
    adventurerRank: String, // "F" to "SSS". Unlocks dungeon tiers.
    
    // Inventory System
    inventory: {
        "health_potion": 5,          // Consumables store quantity
        "steel_sabre": {             // Equipment stores metadata
            id: "steel_sabre",
            type: "EQUIPMENT",
            stats: { atk: 25 }
        }
    },
    
    // RPG Class Data
    class: {
        id: "WARRIOR",
        name: "Warrior",
        tier: "STARTER" // STARTER -> EVOLVED -> ASCENDED
    },
    
    // Skill Tree
    skills: {
        "slash": 1,        // Skill ID : Level
        "guard": 5
    },
    
    // Statistics
    stats: {
        totalEarned: Number,
        monstersKilled: Number,
        questsCompleted: Number
    }
};
```

---

## ⚔️ 3. The RPG Engine (`core/guildAdventure.js`)

This is the most complex file (~3600 lines). It manages turn-based combat using a "Tick System" similar to Final Fantasy's ATB.

### A. State Management
*   **`gameStates` (Map)**: Holds the active dungeon state for every group chat.
    *   *Key*: `chatId` (Group JID)
    *   *Value*: The `State` Object.

### B. The Combat Loop (Tick System)
The combat does not run on strict rounds (Player 1 -> Player 2 -> Enemy). It runs on **Action Points (AP)**.

1.  **Initialization**:
    *   Every entity (Player/Enemy) starts with `actionGauge = 0`.
    *   Each entity has a `spd` (Speed) stat.

2.  **The Loop (`processCombatTurn`)**:
    ```javascript
    while (combatIsActive) {
        // Increment everyone's gauge by their speed
        for (entity of entities) {
            entity.actionGauge += entity.stats.spd;
            
            // Threshold Check
            if (entity.actionGauge >= 100) {
                // IT IS THIS ENTITY'S TURN
                activeActor = entity;
                entity.actionGauge -= 100; // Reset gauge
                break; // Stop loop to let them act
            }
        }
    }
    ```

3.  **Handling Turns**:
    *   **If Enemy**: `performEnemyAction()` is called immediately. It picks a random skill or attacks a random player.
    *   **If Player**: `promptPlayerAction()` is called. The loop **PAUSES** and waits for a message command (`.j combat attack`).

### C. Combat Flowchart
1.  User types `.j combat attack`.
2.  `handleCombatAction()` validates it's their turn.
3.  `performAction()` calculates damage and applies it.
4.  `nextTurn()` checks for victory/defeat conditions.
5.  If not over, calls `processCombatTurn()` to resume the tick loop.

---

## 🧪 4. Skill & Class System

### A. Skill Definitions (`core/skillTree.js`)
Skills are purely data-driven. The logic in `guildAdventure.js` reads these objects to determine what to do.

```javascript
const SKILL_DB = {
    "fireball": {
        name: "Fireball",
        type: "damage",      // Logic handler to use
        damageType: "magic", // Uses MAG stat instead of ATK
        multiplier: 2.0,     // 200% Damage
        cost: 15,            // Energy cost
        effect: "burn",      // Status effect ID
        duration: 3          // Effect turns
    }
};
```

### B. Class Inheritance (`core/classSystem.js`)
Classes are defined in a hierarchy.
*   **Roles**: TANK, DPS, MAGE, HEALER.
*   **Evolution**:
    *   `STARTER` (Lvl 1-10) -> `EVOLVED` (Lvl 10-30) -> `ASCENDED` (Lvl 30+)
    *   Example: `FIGHTER` -> `WARRIOR` -> `WARLORD`.

---

## 🎲 5. Gambling Anti-Cheat & Mathematics

The gambling games in `core/gambling.js` use pseudo-randomness but have rigorous checks to prevent economy inflation.

### A. The "Crash" Algorithm
To prevent the "Martingale Strategy" (doubling bet after every loss), the Crash game has modified odds:
*   **3% Chance**: Instant Crash at 1.00x (House takes all).
*   **47% Chance**: Low Crash (1.01x - 1.50x).
*   **30% Chance**: Medium (1.50x - 3.00x).
*   **20% Chance**: High Multiplier (3.00x+).

### B. Global Limits
Defined at the top of `gambling.js`:
```javascript
const GLOBAL_MAX_BET = 100000; // Hard cap. No one can bet more than 100k.
const GLOBAL_MIN_BET = 100;    // Prevents spamming micro-bets to farm XP.
```

---

## 🛠️ 6. Advanced: Implementing a New Feature

Let's say you want to add a **"Bank Heist"** feature. Here is exactly where code needs to go.

### Step 1: The Logic (`core/economy.js`)
```javascript
// Add this function
function attemptHeist(userId) {
    const user = getUser(userId);
    if (user.wallet < 5000) return { success: false, msg: "Need 5k to buy tools!" };
    
    const success = Math.random() < 0.10; // 10% chance
    if (success) {
        const take = 500000;
        user.wallet += take;
        return { success: true, amount: take };
    } else {
        user.wallet = 0; // Lost everything
        return { success: false };
    }
    saveUser(userId); // CRITICAL: Save changes!
}
// Export it at the bottom
module.exports = { ..., attemptHeist };
```

### Step 2: The Command (`core/engine.js`)
Search for `// ECONOMY COMMANDS` and add:
```javascript
if (lowerTxt === `${PREFIX} heist`) {
    const result = economy.attemptHeist(senderJid);
    if (result.success) {
        await sock.sendMessage(chatId, { text: `💰 HEIST SUCCESS! You stole ${result.amount}!` });
    } else {
        await sock.sendMessage(chatId, { text: `🚔 BUSTED! The police took all your cash.` });
    }
    return;
}
```

### Step 3: Registry (`core/commandRegistry.js`)
Add to the `ECONOMY` array:
```javascript
{ cmd: 'heist', desc: 'Attempt a risky bank robbery.', usage: 'heist' }
```

---

## 🚨 7. Common Pitfalls & Solutions

1.  **"My changes disappeared after restart!"**
    *   **Cause**: You edited the MongoDB directly or used a script while the bot was running.
    *   **Fix**: The bot's RAM cache overwrote your DB changes. **ALWAYS STOP THE BOT** before running maintenance scripts like `wipe_users.js`.

2.  **"Code Leaks in Chat" (`${prefix} buy`)**
    *   **Cause**: Using single quotes `'` instead of backticks `` ` ``.
    *   **Fix**: Variables like `${...}` only work inside backticks.

3.  **"Bot is ignoring messages"**
    *   **Cause**: The `messages.upsert` event often fires for status updates or history syncing.
    *   **Fix**: Check `engine.js` line ~50. We ignore messages where `m.key.fromMe` is true or if it's a protocol message.

4.  **"Combat stuck / No Image"**
    *   **Cause**: The Go Image Service (port 8080) crashed or timed out.
    *   **Fix**: The new code has a `try/catch` in `nextTurn()`. It will now skip the image and send text if the image generation fails, ensuring the game continues.

---

## 📦 8. External Dependencies

*   **MongoDB**: Stores permanent data.
*   **Go Image Service**: A separate microservice (compiled binary) that generates the RPG images. It must be running for images to appear.
*   **Baileys**: The library that talks to WhatsApp servers.
