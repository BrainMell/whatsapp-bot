# Quests System Flow (`quest` / `solo` / `join` / `stop` / `vote`)

## 1. Description
The Quest system allows players to embark on solo or group adventures to explore dungeons, battle monsters, make crossroads voting choices, find treasure, and gain XP/Zeni. 

It covers:
- **`quest`**: Starts a group dungeon raid registration window (60s).
- **`solo`**: Instantly starts a private dungeon quest.
- **`join`**: Joins an active group quest registration.
- **`stop`**: Force-cancels an active quest in the chat (Admins only, or players aborting their own solo dungeon).
- **`vote`**: Casts a vote (1 or 2) when a non-combat crossroads option or dialogue scenario is encountered.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🗡️ QUEST INITIALIZATION: User sends ".j quest F" or ".j solo E"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check: primaryCmd === "quest" || "solo" (L4689)
            ├── economy.isRegistered(senderJid) check
            ├── Check if "stop" subcommand: cmdArgs[1] === "stop" -> stopQuest(...)
            ├── core/rpg/guildAdventure.js
            │   └── initAdventure(sock, chatId, groq, mode, isSolo, rank, senderJid, ...) (L3972)
            │       ├── checkChatLimits() & check active sessions in gameStates Map (L3984)
            │       ├── checkSpecialDungeons (Lineage & key checks for DRAGON lair) (L4020)
            │       ├── checkAdventurerRank restrictions (L4045)
            │       ├── select random DUNGEON_ENVIRONMENTS (L4068)
            │       ├── initialize state object (phase = "REGISTRATION") & set timers (L4149)
            │       ├── auto-join initiator for solo mode (L4109)
            │       └── Return setup response string
            ├── If solo: startQuest immediately. If group: broadcast raid invitation
            └── sock.sendMessage(chatId, { text: startMsg })

======================================================
⚔️ JOIN QUEST: User sends ".j join"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "join" (L4765)
        └── core/rpg/guildAdventure.js
            └── joinAdventure(chatId, senderJid, senderName) (L4169)
                ├── Verify active phase === "REGISTRATION"
                ├── Verify party is not full (< 5 players) & not already in party
                ├── Initialize player state object (Hp = 100, Energy = 100, class = null)
                └── Return success join message to WhatsApp

======================================================
🗳️ CAST VOTE: User sends ".j vote 1"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "vote" (L5000 / L13699)
        └── core/rpg/guildAdventure.js
            └── handleVote(chatId, senderJid, vote) (L6059)
                ├── Verify active vote window (isStandardVote or isBranchingVote)
                ├── Save vote: state.votes[senderJid] = choice
                ├── If all players voted:
                │   ├── clear timers
                │   └── setTimeout to processVotes() or processBranchChoice()
                └── Return vote acknowledgement
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
- Receives message objects from Baileys socket connection.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4688-L4762) / [L4999-L5006](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4999-L5006)
* **Line Numbers**: 4688-4762 (initiation) & 4999-5006 (vote routing)
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Redirects execution to `guildAdventure` core functions

```javascript
                    // .j quest / .j solo / .j adventure
                    if (
                      primaryCmd === "quest" ||
                      primaryCmd === "solo" ||
                      primaryCmd === "adventure"
                    ) {
                      // ... (verify registration)
                      const isSolo = primaryCmd === "solo";
                      const isHardcore = lowerTxt.includes("--hc");
                      const rank = cmdArgs.find((a) => ranks.includes(a.toLowerCase())) || null;

                      const result = await guildAdventure.initAdventure(
                        sock,
                        chatId,
                        groq,
                        isHardcore ? "PERMADEATH" : "NORMAL",
                        isSolo,
                        rank ? rank.toUpperCase() : null,
                        senderJid,
                        smartGroqCall,
                      );
                      // ... (start timers & broadcast response messages)
                      return;
                    }
```

#### Explanation
- Detects quest command inputs (`.j quest`, `.j solo`, `.j join`, `.j stop`, `.j vote`).
- Calls `initAdventure`, `joinAdventure`, `stopQuest`, or `handleVote` respectively.

---

### Step 3: Dungeon Setup & Gates Validation
* **File Path**: [core/rpg/guildAdventure.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guildAdventure.js#L3972-L4064)
* **Line Numbers**: 3972-4064
* **Called From**: `initAdventure()`
* **Inputs**: `(sock, chatId, groq, mode, solo, rankInput, senderJid, ...)`
* **Outputs**: Configured state or error payload

```javascript
  const sessionKey = solo ? `${chatId}_${senderJid}` : chatId;
  if (gameStates.has(sessionKey)) {
    return { success: false, msg: "❌ Adventure already active!" };
  }

  let upperRank = rankInput ? rankInput.toUpperCase() : "F";
  let rankData = DUNGEON_RANKS[upperRank];

  // Special Dungeon Key & Lineage Check
  if (rankData.isSpecial && senderJid) {
    if (upperRank === "DRAGON") {
      const currentClass = economy.getUserClass(senderJid);
      if (!classSystem.isFighterLineage(currentClass?.id)) {
        return { success: false, msg: "❌ *DRAGON HUNTER LINEAGE REQUIRED*" };
      }
      if (!inventorySystem.hasItem(senderJid, "dragon_key")) {
        return { success: false, msg: "❌ You need a Dragon Hunter Key!" };
      }
      inventorySystem.removeItem(senderJid, "dragon_key", 1);
    }
  }
```

#### Explanation
1. Checks for active quest sessions using `gameStates.has(sessionKey)`.
2. Validates requested dungeon ranks.
3. If entering special encounters like the `DRAGON` dungeon:
   - Validates class lineage compatibility (Fighter lineage required).
   - Validates key requirements, consuming 1 `dragon_key` from inventory.
4. If solo, validates adventurer rank bounds.

---

### Step 4: Casting Choices and Vote Triggers
* **File Path**: [core/rpg/guildAdventure.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guildAdventure.js#L6059-L6136)
* **Line Numbers**: 6059-6136
* **Called From**: `handleVote()`
* **Inputs**: `(chatId, jid, vote)`
* **Outputs**: Formats vote registry status, processes results once all votes are collected

```javascript
    const state = getGameState(chatId, jid);
    if (!state) return "❌ No active adventure!";

    const isStandardVote = !!(state.currentEncounter && state.currentEncounter.choices);
    const isBranchingVote = !!(state.isBranching || state.timers?.vote);

    if (!isStandardVote && !isBranchingVote) return "❌ No active choices.";

    state.votes[jid] = choice;

    // Check if all active players have voted
    const activePlayers = state.players.filter((p) => !p.isDead);
    const allVoted = activePlayers.every((p) => state.votes[p.jid] !== undefined);

    if (allVoted && state.isBranching) {
      // Process branch choice (Safe vs Danger path)
      clearTimeout(state.timers.vote);
      setTimeout(() => {
        processBranchChoice(sock, winner, sessionKey);
      }, 1000);
      return `🗳️ All votes in! Branching...`;
    }
```

#### Explanation
1. Resolves the current session state object.
2. Checks whether a vote window is open.
3. Registers the user's vote into `state.votes`.
4. Counts remaining live players. If all have voted, clears timers and triggers the resolution logic (e.g. `processBranchChoice()` or `processVotes()`) in a separate non-blocking execution thread.

---

## 4. How to Modify

### How to Add a New Dungeon Rank Difficulty
To configure a new dungeon level difficulty rank:
1. **Define the Rank Configuration**:
   * Open [core/rpg/guildAdventure.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guildAdventure.js).
   * Find the `DUNGEON_RANKS` definition and append your rank:
     ```javascript
     S: {
         name: 'S-Rank Abyss',
         reqLevel: 45,
         energyCost: 50,
         baseGold: 5000,
         baseXp: 8000,
         stages: 6, // Total combat encounters before boss
         boss: 'ABYSSAL_KRAKEN', // Boss ID
         mobs: ['shadow_fiend', 'void_cultist', 'lich_reaper'] // Pool of random mobs for non-boss stages
     }
     ```
2. **Configure Boss Statistics**:
   * Locate the boss mechanics mapping inside [core/rpg/bossMechanics.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/bossMechanics.js) or `guildAdventure.js`.
   * Add the boss characteristics, HP thresholds, special skills, and item drop rates in the `BOSS_TEMPLATES` mapping.

---

### How to Alter Class Trial Parameters
To adjust evolution trial bosses:
* Open [core/rpg/guildAdventure.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guildAdventure.js).
* Locate the `TRIAL` configurations inside `initAdventure()`.
* Change the default trial boss names or scale boss attributes:
  ```javascript
  const trialBosses = {
      MUTATION_PRIME: { hp: 5000, atk: 45, def: 20 },
      INFECTED_COLOSSUS: { hp: 8000, atk: 35, def: 40 },
  };
  ```

---

### How to Change Lobby Wait Intervals
To change the time allowed for guild members to vote or register to join an active quest adventure:
* Edit `GAME_CONFIG` constants at the top of [core/rpg/guildAdventure.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guildAdventure.js#L20):
  ```javascript
  const GAME_CONFIG = {
      REGISTRATION_TIME: 60 * 1000, // 60 seconds gathering window. Reduce to 30 * 1000 for 30s.
      VOTE_TIMEOUT: 45 * 1000 // 45 seconds to vote.
  };
  ```


---

# Multiplayer Boss Raids (Extension of Quest System)

## 1. Description
The Boss Raids/Adventure Boss system expands the Quest loop, allowing group parties to enter challenging turn-based encounters against high-HP boss creatures with phases and enrage mechanics.

## How it works

**Raid Lobby and Party Gathering** — [guildAdventure.js L4169-L4232](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guildAdventure.js#L4169-L4232)
```javascript
const joinAdventure = (chatId, senderJid, senderName) => {
  const state = getGameState(chatId);
  if (!state || !state.active || state.phase !== "REGISTRATION") {
    return "❌ Registration is closed!";
  }

  if (state.solo && state.players.length >= 1) {
    return "❌ This is a solo quest! You cannot join.";
  }

  if (state.players.length >= GAME_CONFIG.MAX_PLAYERS) {
    return "❌ Party is full!";
  }

  if (state.players.some((p) => p.jid === senderJid)) {
    return "⚠️ You're already in the party!";
  }

  const user = economy.getUser(senderJid);
  const adventurerRank = user?.adventurerRank || "F";

  // Initialize player with default stats (class assigned later)
  state.players.push({
    jid: senderJid,
    name: senderName || "Unknown Hero",
    class: null,
    level: 1,
    adventurerRank: adventurerRank,
    stats: {
      hp: 100,
      maxHp: 100,
      energy: 100,
      maxEnergy: 100,
      atk: 10,
      def: 10,
      mag: 10,
      spd: 10,
      luck: 10,
      crit: 5,
    },
    equipment: {
      weapon: null,
      armor: null,
      ring: null,
      amulet: null,
      boots: null,
      cloak: null,
    },
    inventory: [],
    statusEffects: [],
    buffs: [],
    isDead: false,
    xpEarned: 0,
    goldEarned: 0,
    combatStats: {
      damageDealt: 0,
      damageTaken: 0,
      healed: 0,
      kills: 0,
    },
  });

  return `✅ *${senderName}* has joined the adventure! (${state.players.length}/${state.solo ? 1 : GAME_CONFIG.MAX_PLAYERS})`;
};
```
This function handles player registration in the adventure/raid lobby. It retrieves the current active session from `gameStates` using `getGameState(chatId)`. It enforces session checks (ensuring registration is open, solo limits are respected, player caps are not exceeded, and duplicate entries are blocked). It pulls MongoDB-cached data via `economy.getUser(senderJid)` to determine the player's initial adventurer rank, pushes a comprehensive player record (defaulting stats and equipment structures) directly to the local memory array, and returns a confirmation message format.

---

**Boss HP and Phase Transitions** — [guildAdventure.js L3629-L3671](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/guildAdventure.js#L3629-L3671)
```javascript
async function checkBossPhase(sock, boss, chatId) {
  if (!boss.isBoss || !boss.phases) return null;

  const hpPct = (boss.stats.hp / (boss.stats.maxHp || boss.stats.hp)) * 100;
  const nextPhaseIdx = (boss.currentPhase || 0) + 1;
  const nextPhase = boss.phases[nextPhaseIdx];

  if (nextPhase && hpPct <= nextPhase.threshold) {
    boss.currentPhase = nextPhaseIdx;
    boss.abilities = nextPhase.abilities || boss.abilities;

    // Visual/Audio Feedback
    let msg = `🌟 *BOSS PHASE TRANSITION* 🌟\n\n`;
    msg += `${boss.icon} *${boss.name}*: ${nextPhase.message}\n`;

    // Apply phase effects
    if (nextPhase.effects) {
      nextPhase.effects.forEach((eff) => {
        if (eff.type === "stat_boost") {
          boss.stats[eff.stat] = Math.floor(
            boss.stats[eff.stat] * (1 + eff.value / 100),
          );
          msg += `\n📈 ${boss.name}'s ${eff.stat.toUpperCase()} increased!`;
        }
        if (eff.type === "heal") {
          boss.stats.hp = Math.min(boss.stats.maxHp, boss.stats.hp + eff.value);
          boss.currentHP = boss.stats.hp;
          msg += `\n💖 ${boss.name} recovered health!`;
        }
      });
    }

    try {
      await sock.sendMessage(chatId, { text: msg });
    } catch (err) {
      console.error(
        `[Combat] Failed to send boss phase message: ${err.message}`,
      );
    }
    return true;
  }
  return false;
}
```
This function is run during boss battles to evaluate phase progression. It computes the boss's HP percentage and checks if it has dropped below the threshold of the next phase. If triggered, it updates the boss's active abilities, applies stat boosts or heals, and broadcasts the event to players via Baileys WebSocket API using `sock.sendMessage(chatId, { text: msg })`.

---

**Boss Combat Turn Logic** — [bossMechanics.js L1144-L1179](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/bossMechanics.js#L1144-L1179)
```javascript
    processTurn() {
        this.currentTurn++;
        
        // Check phase transition
        const transition = this.phaseManager.checkPhaseTransition();
        if (transition) {
            return {
                type: 'phase_transition',
                data: transition
            };
        }
        
        // Check enrage
        if (this.boss.enrageTimer && this.currentTurn >= this.boss.enrageTimer) {
            return this.triggerEnrage();
        }
        
        // Process soft enrage stacks
        if (this.boss.softEnrage && this.currentTurn >= this.boss.softEnrage.turnThreshold) {
            this.phaseManager.softEnrageStacks++;
            const effect = this.boss.softEnrage.effectPerStack;
            this.boss.stats[effect.stat] += effect.value;
        }
        
        // Process active channels
        const channelResults = this.processChannels();
        if (channelResults.length > 0) {
            return { type: 'channel_complete', data: channelResults };
        }
        
        // Process summons AI
        this.processSummons();
        
        // Boss action
        return this.selectBossAction();
    }
```
The `BossFightManager` manages the active boss encounter turn loop. It increments the turn count, triggers phase transition validations in `BossPhaseManager`, checks if hard enrage limits are met, applies soft enrage stat growth, and processes active channeling or summoning mechanics. The final action chooses the next boss command.

---

