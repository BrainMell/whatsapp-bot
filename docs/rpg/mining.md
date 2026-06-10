# RPG Subsystem: Mining

## 1. Description
The Mining subsystem allows users to gather ore and resources from different locations. Users consume energy to mine, which grants them Mining experience (XP) and items (ores, gems, and salvage materials) based on randomized drop tables. Access to mining zones is gated by player level, adventurer rank, and mining level.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j mine shimmering_caves"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (primaryCmd === "mine") (L5126)
            └── core/commands/rpgCommands.js
                └── mineOre(sock, chatId, senderJid, locationId) (L531)
                    └── craftingSystem.getMiningLocations() (L535)
                    └── economy.addProfessionXP(senderJid, 'mining', xpGained)
                    └── inventorySystem.addItem(senderJid, item.id, qty)
                    └── sock.sendMessage(chatId, { text: ... })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
* **Inputs**: `{ messages, type }` payload from WhatsApp
* **Outputs**: None (passes control to inner map)

```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify" && type !== "append") return;
  if (isRekeying) return;

  await Promise.all(
    messages.map(async (m) => {
      if (!m.message) return;
```

#### Explanation
- `sock.ev.on("messages.upsert", ...)`: Registers a listener that fires whenever the bot receives new message notifications.
- `if (type !== "notify" && type !== "append") return`: Drops status updates or metadata modifications to only process actual incoming messages.
- `if (isRekeying) return`: Prevents processing when the session encryption keys are refreshing.
- `messages.map(...)`: Iterates over the batch of received messages to process them in parallel.

---

### Step 2: Command Matching
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Inner message processor loop
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: `primaryCmd` and `cmdArgs` array

```javascript
if (lowerTxt.startsWith(currentPrefix)) {
  const cmdBody = lowerTxt
    .substring(currentPrefix.length)
    .trim();
  const cmdArgs = cmdBody.split(" ");
  const primaryCmd = cmdArgs[0];
```

#### Explanation
- `lowerTxt.startsWith(currentPrefix)`: Checks if the incoming text begins with the configured bot prefix (e.g. `.j`).
- `lowerTxt.substring(...)`: Strips the prefix from the message.
- `cmdBody.split(" ")`: Splits the command body by spaces to separate the command name from its arguments.
- `cmdArgs[0]`: Assigns the first element as `primaryCmd` (e.g. `"mine"`).

---

### Step 3: Command Routing
* **File Path**: `core/engine.js`
* **Line Numbers**: 5126-5130
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const rpgCommands = require("./commands/rpgCommands");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `cmdArgs`
* **Outputs**: Promise resolved by `rpgCommands.mineOre`

```javascript
if (primaryCmd === "mine") {
  const locationId = cmdArgs[1];
  await rpgCommands.mineOre(sock, chatId, senderJid, locationId);
  return;
}
```

#### Explanation
- `if (primaryCmd === "mine")`: Matches the mining trigger command.
- `cmdArgs[1]`: Extracts the mining location argument (e.g. `"shimmering_caves"`).
- `rpgCommands.mineOre(...)`: Passes execution control to the RPG commands module with session references.

---

### Step 4: Mining Core Logic
* **File Path**: `core/commands/rpgCommands.js`
* **Line Numbers**: Around 531-600
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/craftingSystem.js`, `core/rpg/economy.js`, `core/rpg/inventorySystem.js`
* **Inputs**: `(sock, chatId, senderJid, locationId)`
* **Outputs**: Updates user profile state in DB and sends a message to WhatsApp

```javascript
async function mineOre(sock, chatId, senderJid, locationId) {
  const sheet = await progression.getCharacterSheet(senderJid);
  const locations = craftingSystem.getMiningLocations();
  
  if (!locationId) {
    // Return list of locations if none specified
    return displayLocations(sock, chatId, locations);
  }

  const loc = locations[locationId.toLowerCase()];
  if (!loc) return reply("❌ Invalid location.");

  // Validation
  const user = economy.getUser(senderJid);
  const miningLevel = user.professions?.mining?.level || 1;
  if (sheet.level < loc.req.level || miningLevel < loc.req.miningLevel) {
    return reply("❌ Location locked due to level/rank requirements.");
  }

  // Deduct energy & roll rewards
  const energyCost = Math.max(5, loc.energyCost - Math.floor(miningLevel / 2));
  if (user.energy < energyCost) return reply("❌ Not enough energy.");

  user.energy -= energyCost;
  const xpGained = Math.floor(loc.energyCost * 20 + miningLevel * 5);
  const levelUp = economy.addProfessionXP(senderJid, 'mining', xpGained);

  // Rewards roll
  const rewards = rollDrops(loc.drops);
  for (const reward of rewards) {
    await inventorySystem.addItem(senderJid, reward.id, reward.qty);
  }

  await economy.saveUser(user);
  return reply(`⛏️ Mined successfully in ${loc.name}! Used ${energyCost} energy.`);
}
```

#### Explanation
- `progression.getCharacterSheet(...)`: Retrieves the character statistics for the sender to validate overall rank and base level.
- `craftingSystem.getMiningLocations()`: Loads the static list of mining areas and unlock criteria.
- `if (sheet.level < loc.req.level || ...)`: Ensures the user has unlocked the zone.
- `Math.max(5, loc.energyCost - Math.floor(miningLevel / 2))`: Dynamic energy cost formula. The higher the user's mining level, the less energy they consume (capped at a minimum of 5).
- `economy.addProfessionXP(...)`: Increments user profession progress.
- `rollDrops(loc.drops)`: Evaluates random ranges against probabilities defined in the location configuration.
- `inventorySystem.addItem(...)`: Adds the rolled ores/gems to the MongoDB inventory collection.

---

## 4. How to Modify
To add a new mining location, edit `core/rpg/craftingSystem.js` where locations are mapped:

```javascript
// BEFORE:
const MINING_LOCATIONS = {
  shimmering_caves: { name: "Shimmering Caves", energyCost: 15, req: { level: 1 } }
};

// AFTER:
const MINING_LOCATIONS = {
  shimmering_caves: { name: "Shimmering Caves", energyCost: 15, req: { level: 1 } },
  abyssal_abyss: { name: "Abyssal Abyss", energyCost: 30, req: { level: 40, miningLevel: 10 } }
};
```
