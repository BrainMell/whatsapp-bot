# RPG Subsystem: Abilities & Skill Trees

## 1. Description
The Abilities and Skill Trees subsystem manages player combat abilities, active/passive skills, attribute increases, and lineage class evolutions. It tracks unspent skill points, applies attributes increments, defines lineage evolution routes, and validates requirements (such as level, items, or quest completion milestones) to handle class change pathways (e.g. from Fighter to Warrior, and then Ascended).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j evolve"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (primaryCmd === "evolve") (L4720)
            └── core/commands/skillCommands.js
                └── handleEvolve(sock, chatId, senderJid, senderName, args) (L485)
                    └── classSystem.getClassById(user.class)
                    └── classSystem.canEvolve(...)
                    └── progression.getLevel(senderJid)
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
- `cmdArgs[0]`: Assigns the first element as `primaryCmd` (e.g. `"evolve"`).

---

### Step 3: Command Routing for Evolve
* **File Path**: `core/engine.js`
* **Line Numbers**: Around 4720
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const skillCommands = require("./commands/skillCommands");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `senderName`, `cmdArgs`
* **Outputs**: Promise resolved by `skillCommands.handleEvolve`

```javascript
if (primaryCmd === "evolve") {
  const evolveArgs = cmdArgs.slice(1);
  await skillCommands.handleEvolve(sock, chatId, senderJid, senderName, evolveArgs);
  return;
}
```

#### Explanation
- `if (primaryCmd === "evolve")`: Matches the evolution request command.
- `skillCommands.handleEvolve(...)`: Routes the request with parameters to the skill handler module.

---

### Step 4: Evolution Gatekeeper Logic
* **File Path**: `core/commands/skillCommands.js`
* **Line Numbers**: 485-508
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/classSystem.js`, `core/rpg/economy.js`, `core/rpg/progression.js`
* **Inputs**: `(sock, chatId, senderJid, senderName, args)`
* **Outputs**: Validates user state and returns evolution choices

```javascript
async function handleEvolve(sock, chatId, senderJid, senderName, args) {
  const classSystem = require('../rpg/classSystem');
  const user = economy.getUser(senderJid);
  
  if (!user) {
    return reply("❌ Not registered!");
  }

  const currentClass = classSystem.getClassById(user.class);
  const level = progression.getLevel(senderJid);
  const questsDone = user.questsCompleted || 0;

  const evolutionCheck = classSystem.canEvolve(
    user.class, level, questsDone, user.stats?.dragonsKilled || 0, user.completedTrials || [], user.wallet || 0
  );

  if (!evolutionCheck.canEvolve) {
    if (currentClass?.tier === 'ASCENDED') {
      return reply(`✨ *${currentClass.name}* — You have peaked!`);
    }
    return reply(`❌ *Evolution Not Available*\n\n${evolutionCheck.reason}`);
  }
}
```

#### Explanation
- `classSystem.getClassById(user.class)`: Resolves structural config representing the player's active class type.
- `progression.getLevel(senderJid)`: Resolves current level threshold.
- `classSystem.canEvolve(...)`: Evaluates stats (such as level requirements, dragons killed, trials completed, or money constraints) against lineage rule mappings.
- Returns status details indicating either unlock options or reason why requirements are not met.

---

## 4. How to Modify
To modify skill point generation budgets, edit `calculateSkillPoints` inside `core/rpg/skillTree.js`:

```javascript
// BEFORE:
function calculateSkillPoints(level) {
    let basePoints = level;
    return basePoints;
}

// AFTER:
function calculateSkillPoints(level) {
    let basePoints = level * 2; // Double points per level
    return basePoints;
}
```
