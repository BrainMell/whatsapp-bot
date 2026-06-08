# RPG Subsystem: Quests & Adventures

## What it is
The Quests & Adventures system runs the interactive PvE game loop for solo players and groups (parties). It provides multiplayer dungeon instance lobbies, tracks dynamic player signups, guides the group through procedural crossroads choice votes, manages environmental checks/trap calculations, runs instances of enemy wave combat, and triggers post-victory rewards (Zeni, XP, and inventory loot cards).

## How it works

### Snippet 1: Adventure Instance Initialization
```javascript
// File: core/guildAdventure.js (Lines 1867-1896)
async function initAdventure(sock, chatId, senderJid, difficulty = 'F', isSolo = false) {
  const sessionKey = getSessionKey(chatId, isSolo ? senderJid : null);
  
  if (gameStates.has(sessionKey)) {
    return { success: false, message: isSolo ? "❌ You already have an active Solo raid!" : "❌ A Group raid is already active in this chat!" };
  }

  const state = {
    chatId,
    sessionKey,
    solo: isSolo,
    difficulty,
    encounter: 0,
    maxEncounters: isSolo ? 4 : 5,
    players: [],
    votes: {},
    enemies: [],
    inCombat: false,
    voteProcessing: false,
    timers: {},
    phase: 'LOBBY',
    startTime: Date.now()
  };

  gameStates.set(sessionKey, state);
  await joinAdventure(sock, chatId, senderJid, isSolo ? senderJid : null);
  return { success: true, state };
}
```
* **Explanation**: Instantiates a new dungeon state map tied to the chat workspace. It registers parameters like current encounter count, maximum length, and sets the active phase to `'LOBBY'` before calling the participant registry flow.
* **DB Calls**: Reads player details from the `users` database during joining.
* **External HTTP Calls**: None.
* **Baileys API Used**: None directly (wrapped inside the lobby announce triggers).

### Snippet 2: Post-Victory Reward Calculations
```javascript
// File: core/guildAdventure.js (Lines 3815-3838)
  const alivePlayers = state.players.filter((p) => !p.isDead);
  const playerCount = Math.max(1, alivePlayers.length);
  const xpPerPlayer = Math.floor(totalXP / playerCount);
  const goldPerPlayer = Math.floor(totalGold / playerCount);

  let lootResults = { items: [], gold: totalGold, announcements: [] };
  if (victory && alivePlayers.length > 0) {
    try {
      lootResults = await lootSystem.distributeLoot(
        alivePlayers,
        state.currentEncounterType || "COMBAT",
        state.enemies[0]?.type || state.enemies[0]?.id || null,
        state.difficulty,
        totalGold,
      );
    } catch (lootErr) {
      console.error("Loot distribution failed:", lootErr.message);
    }
  }
```
* **Explanation**: Invoked upon successful raid completion. It identifies all surviving party members, divides the earned XP and gold pools evenly, and calls `lootSystem.distributeLoot` to determine item drop rolls.
* **DB Calls**: Updates progression stats (`questsCompleted`, `questsWon`, `wallet`, `progression.xp`) inside the `users` collection.
* **External HTTP Calls**: None.
* **Baileys API Used**: Calls `sock.sendMessage` inside the summary output block.

## How to modify it

To add a new difficulty tier, customize the encounters length, or change the end-boss mapping:
1. Locate `DUNGEON_RANKS` in [core/guildAdventure.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/guildAdventure.js).
2. Define a new tier object (e.g. `'Z'`) and customize its values.

### Before
```javascript
// File: core/guildAdventure.js (Line 31)
const DUNGEON_RANKS = {
  F: {
    name: "F-Rank",
    encounters: 3,
    minMobs: 1,
    maxMobs: 2,
    difficulty: 0.8,
    boss: "INFECTED_COLOSSUS",
    pool: 1,
    xpMult: 0.8,
  },
};
```

### After
```javascript
// File: core/guildAdventure.js (Line 31)
const DUNGEON_RANKS = {
  F: {
    name: "F-Rank",
    encounters: 3,
    minMobs: 1,
    maxMobs: 2,
    difficulty: 0.8,
    boss: "INFECTED_COLOSSUS",
    pool: 1,
    xpMult: 0.8,
  },
  Z: {
    name: "Z-Rank",
    encounters: 2,
    minMobs: 1,
    maxMobs: 1,
    difficulty: 0.4,
    boss: "WEAKENED_IMP",
    pool: 1,
    xpMult: 0.4,
  }
};
```

## Common tasks

* **Add a new adventure rank**: Insert a new configuration dictionary block into `DUNGEON_RANKS` in [core/guildAdventure.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/guildAdventure.js#L31).
* **Change the boss of a rank**: Edit the mapped boss ID string value (e.g., `'INFECTED_COLOSSUS'`) inside [core/guildAdventure.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/guildAdventure.js#L38).
* **Modify maximum encounter phases length for solo runs**: Adjust the `maxEncounters` assignment expression inside `initAdventure` in [core/guildAdventure.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/guildAdventure.js#L1889).
