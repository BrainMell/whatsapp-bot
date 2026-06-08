# RPG Subsystem: Mining

## 1. What it is
The Mining subsystem allows users to gather ore and resources from different locations. Users consume energy to mine, which grants them Mining experience (XP) and items (ores, gems, and salvage materials) based on randomized drop tables. Access to mining zones is gated by player level, adventurer rank, and mining level.

---

## 2. Local Scope, Context & Dependencies
Any developer wishing to modify the mining subsystem can understand the inputs, outputs, state mutations, and dependencies right here.

### Inputs
* **Command Arguments**: `locationId` (e.g. `shimmering_caves`), passed as the second argument after `.mine`.
* **Sender JID**: The phone number JID identifying the player.
* **Database State**: Queries the player's character sheet (level, rank) and profession profile (current mining level/XP).

### Outputs
* **WhatsApp Message**: Success/failure response sent using `sock.sendMessage()`.
* **Inventory Additions**: Items pushed directly to the user's bag.

### State Mutations
* **Energy Deduction**: Deducts player energy based on location cost (mitigated by mining level):
  `energyCost = Math.max(5, loc.energyCost - Math.floor(miningLevel / 2))`
* **XP Allocation**: Increases the user's mining experience and triggers level-ups:
  `xpGained = Math.floor(loc.energyCost * 20 + miningLevel * 5)`
* **Energy Recovery**: A 25% chance to recover `8-22` energy on successful mines.

### Key Dependencies
* `core/commands/rpgCommands.js`: Entry point implementation containing `mineOre()`.
* `core/rpg/craftingSystem.js`: Provides mining locations config via `getMiningLocations()`.
* `core/rpg/economy.js`: Resolves player profiles, updates energy, and administers profession XP.
* `core/rpg/progression.js`: Provides user adventurer levels and ranks via character sheets.

---

## 3. Step-by-Step Code Trace
Here is the exact linear execution path when a user executes a mine command:

### Step 1: Entry Point Trigger
In [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5131):
When the user types `.j mine shimmering_caves`, the message goes through formatting sanitization. Outer format underscores are stripped, but word-internal underscores are preserved:
`const cleanTxt = txt.replace(/[*~]/g, "").replace(/(?<!\w)_|_(?!\w)/g, "");`
The engine checks:
```javascript
if (primaryCmd === "mine") {
  const locationId = cmdArgs[1]; // Resolves to "shimmering_caves"
  await rpgCommands.mineOre(sock, chatId, senderJid, locationId);
  return;
}
```

### Step 2: Location and Level Validation
In `mineOre` ([core/commands/rpgCommands.js L531](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L531)):
1. Checks if the player is registered using `progression.getCharacterSheet(senderJid)`.
2. Fetches location configs using `craftingSystem.getMiningLocations()`.
3. If no `locationId` is provided, displays the list of mining zones, cost requirements, and unlock states.
4. If a `locationId` is provided, looks it up case-insensitively:
   `const loc = locations[locationId.toLowerCase()];`
5. Validates level requirements:
   ```javascript
   if (sheet.level < loc.req.level || userRankIdx < reqRankIdx || miningLevel < miningLevelReq) {
       return await sock.sendMessage(chatId, { text: `❌ LOCATION LOCKED...` });
   }
   ```

### Step 3: Energy and State Updates
1. Calculates dynamic energy cost:
   `const energyCost = Math.max(5, loc.energyCost - Math.floor(miningLevel/2));`
2. Verifies the user has sufficient energy:
   `if (currentEnergy < energyCost) return reply("❌ Not enough energy!");`
3. Deducts energy and awards profession experience:
   ```javascript
   user.energy = Math.max(0, currentEnergy - energyCost);
   const xpGained = Math.floor(loc.energyCost * 20 + miningLevel * 5);
   const levelUp = economy.addProfessionXP(senderJid, 'mining', xpGained);
   ```

### Step 4: Drop Calculation and Item Delivery
1. Randomly selects item rewards based on location drop tables.
2. Appends the rewarded items to the user's inventory:
   `await inventorySystem.addItem(senderJid, item.id, qty, ...)`
3. Constructs a success message containing the rewards, XP gained, remaining energy, and any profession level-ups, then returns it using `sock.sendMessage()`.

---

## 4. How to Modify it

### Add a New Mining Location
1. Open [core/rpg/craftingSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/craftingSystem.js).
2. Locate the mining locations object/getter (usually `miningLocations` map).
3. Add a new configuration entry:
   ```javascript
   mystic_depths: {
       id: 'mystic_depths',
       name: '🔮 Mystic Depths',
       desc: 'A cavern filled with glowing crystals and volatile magical ores.',
       energyCost: 25,
       req: { level: 30, rank: 'B', miningLevel: 10 },
       drops: [
           { id: 'crystal_ore', chance: 0.70, min: 1, max: 3 },
           { id: 'mana_gem', chance: 0.15, min: 1, max: 1 }
       ]
   }
   ```
   *The engine and routing logic automatically register, unlock, and paginate the new location.*
