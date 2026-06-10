# Allocate Command Flow (`allocate`)

## 1. Description
The Allocate command allows players to spend unspent stat points earned during XP level milestones. Spending points increases core attributes (HP, ATK, DEF, MAG, SPD, LUCK, CRIT) with scaling multipliers depending on the user's current class evolution tier (e.g. 2x boost for Evolved, 4x boost for Ascended classes).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j allocate atk 5"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "allocate") (L146)
            └── core/commands/progressionCommands.js
                └── handleAllocateCommand(sock, chatId, senderJid, args, m) (L360)
                    └── Parse args: stat (atk), amount (5)
                    └── If no args:
                        └── Retrieve statPoints available
                        └── Format allocation helper guide & cost returns
                    └── Else:
                        └── core/rpg/progression.js
                            └── allocateStatPoint(senderJid, stat, amount) (L300)
                                └── Verify stat points available >= amount
                                └── check validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit']
                                └── Fetch class evolution tier (Base, Evolved, Ascended)
                                └── Calculate gainedValue = baseStatValues[stat] * tierMultiplier * amount
                                └── user.allocatedStats[stat] += gainedValue
                                └── user.statPoints -= amount
                                └── saveProgression(senderJid)
            └── sock.sendMessage(chatId, { text: successMsg }) (L394)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
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

### Step 2: Command Matching
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L146)
* **Line Numbers**: Around 146
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Redirects execution to progressionCommands controller

```javascript
                    if (primaryCmd === "allocate") {
                      await progressionCommands.handleAllocateCommand(
                        sock,
                        chatId,
                        senderJid,
                        cmdArgs.slice(1),
                        m,
                      );
                      return;
                    }
```

#### Explanation
- Recognizes `.j allocate` and calls `progressionCommands.handleAllocateCommand`.

---

### Step 3: Argument Parsing and Usage Guide
* **File Path**: [core/commands/progressionCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/progressionCommands.js#L360-L382)
* **Line Numbers**: 360-382
* **Called From**: `handleAllocateCommand()`
* **Inputs**: `args` array
* **Outputs**: Prints points usage guide if no parameters are specified

```javascript
async function handleAllocateCommand(sock, chatId, senderJid, args, m) {
  try {
    const stat = args[0];
    const amount = parseInt(args[1]) || 1;

    if (!stat) {
      const sheet = progression.getCharacterSheet(senderJid);
      let msg = `✨ *STAT ALLOCATION* ✨\n\n`;
      msg += `Available Points: *${sheet.statPoints}*\n\n`;
      msg += `Spend points to increase your power:\n`;
      msg += `• *HP*: +15-60 HP\n`;
      msg += `• *ATK*: +3-12 Attack\n`;
      msg += `• *DEF*: +2-8 Defense\n`;
      msg += `• *MAG*: +3-12 Magic\n`;
      msg += `• *SPD*: +2-8 Speed\n`;
      msg += `• *LUCK*: +2-8 Luck\n`;
      msg += `• *CRIT*: +1-4% Crit\n\n`;
      msg += `💡 *Higher class tiers get more value per point!*\n\n`;
      msg += `Usage: \`${getPrefix()} allocate <stat> [amount]\`\n`;
      msg += `Example: \`${getPrefix()} allocate atk 5\``;
      
      return await sock.sendMessage(chatId, { text: getBotMarker() + msg }, { quoted: m });
    }
```

#### Explanation
- If no stat ID is specified (e.g. user just typed `.j allocate`), grabs the user's current sheet unspent points and prints a full stat benefits matrix.

---

### Step 4: Class Tier Scaling and Attributes Mutation
* **File Path**: [core/rpg/progression.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L300-L329)
* **Line Numbers**: 300-329
* **Called From**: `handleAllocateCommand()`
* **Inputs**: `(senderJid, stat, amount)`
* **Outputs**: Returns success state, updates points spent tracking, and mutates user stats

```javascript
function allocateStatPoint(userId, stat, amount = 1) {
    const user = getUser(userId);
    if (!user) return { success: false, message: "User not found" };
    if (user.statPoints < amount) return { success: false, message: `Not enough stat points! Have: ${user.statPoints}, Need: ${amount}` };
    
    const validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit'];
    const s = stat.toLowerCase();
    if (!validStats.includes(s)) return { success: false, message: `Invalid stat!` };
    
    const mainUser = economy.getUser(userId);
    const classSystem = require('./classSystem');
    const classData = mainUser ? classSystem.getClassById(mainUser.class) : null;
    
    let tierMultiplier = 1.0;
    if (classData?.tier === 'EVOLVED') tierMultiplier = 2.0;
    if (classData?.tier === 'ASCENDED') tierMultiplier = 4.0;
    
    const baseStatValues = { hp: 15, atk: 3, def: 2, mag: 3, spd: 2, luck: 2, crit: 1 };
    const gainedValue = Math.floor(baseStatValues[s] * tierMultiplier * amount);
    
    if (!user.allocatedStatPoints) user.allocatedStatPoints = {};
    user.allocatedStatPoints[s] = (user.allocatedStatPoints[s] || 0) + amount;
    
    user.allocatedStats[s] = (user.allocatedStats[s] || 0) + gainedValue;
    user.statPoints -= amount;
    saveProgression(userId);
```

#### Explanation
1. Checks that the stat points available are greater than or equal to the amount.
2. Asserts target stat ID is valid.
3. Queries user's active class information from the database:
   - **Base class**: 1x stats scaling.
   - **Evolved class**: 2x stats scaling.
   - **Ascended class**: 4x stats scaling.
4. Multiplies stat bases (e.g. HP: 15, ATK: 3) by the evolution multiplier and the amount of points spent.
5. Records the spent point allocation inside `user.allocatedStatPoints[stat]` (so they can be refunded upon stats reset).
6. Increments the actual stat value inside `user.allocatedStats[stat]`.
7. Subtracts the points from user available pool and saves to MongoDB.
8. Sends a success summary back to the WhatsApp thread.

---

## 4. How to Modify
To adjust stat allocation rules:
- **Change Base Stat Values**: Modify the `baseStatValues` object in [core/rpg/progression.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L318).
- **Change Class Tier Multipliers**: Adjust the multipliers inside [core/rpg/progression.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js#L314-L316).
- **Reset Stats cost**: If you want to charge players Zeni to reset their allocated stats, edit `resetStats` function in `core/rpg/progression.js`.
