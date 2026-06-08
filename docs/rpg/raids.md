# RPG Subsystem: Raids (Boss Battles)

## What it is
The Raids subsystem handles multiplayer boss battles within the guild adventure framework. When a raid is initiated, the bot establishes an in-memory game state lobby via the `gameStates` map. Players register using command prompts, bringing their level, base stats, equipment modifiers, and learned skills from their MongoDB cache (`economy.getUser`) into the local session object. Once the raid begins, players engage in turn-based combat against a boss managed by the `BossFightManager`. The boss employs a multi-phase system with enrage timers, soft-enrage stat boosts, summon summons AI, and phase transition thresholds. Outcomes are updated in the MongoDB user collections, and combat animations and log messages are sent directly to the WhatsApp chat using the Baileys WebSocket API.

## How it works

**Raid Lobby and Party Gathering** — [guildAdventure.js L4169-L4232](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/guildAdventure.js#L4169-L4232)
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

**Boss HP and Phase Transitions** — [guildAdventure.js L3629-L3671](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/guildAdventure.js#L3629-L3671)
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

**Boss Combat Turn Logic** — [bossMechanics.js L1144-L1179](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/bossMechanics.js#L1144-L1179)
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

## How to modify it

### Modify Raid Lobby Setup
To adjust the configuration parameters of a raid—such as changing the maximum party size or adjusting the registration lobby time limit—locate the configuration blocks in `core/guildAdventure.js`.

```javascript
// Before (core/guildAdventure.js L267-270)
const GAME_CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 6,
```

```javascript
// After (core/guildAdventure.js L267-270)
const GAME_CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10, // Increased max players for larger raids
```

### Modify Enrage Scaling Formulas
To scale or modify enrage mechanics, edit the turn loop inside the `BossFightManager` processor in `core/bossMechanics.js`.

```javascript
// Before (core/bossMechanics.js L1162-1166)
        if (this.boss.softEnrage && this.currentTurn >= this.boss.softEnrage.turnThreshold) {
            this.phaseManager.softEnrageStacks++;
            const effect = this.boss.softEnrage.effectPerStack;
            this.boss.stats[effect.stat] += effect.value;
        }
```

```javascript
// After (core/bossMechanics.js L1162-1166)
        if (this.boss.softEnrage && this.currentTurn >= this.boss.softEnrage.turnThreshold) {
            this.phaseManager.softEnrageStacks++;
            const effect = this.boss.softEnrage.effectPerStack;
            // Double the enrage effect stack growth for extra difficulty
            this.boss.stats[effect.stat] += (effect.value * 2);
        }
```

## Common tasks
- **Change the max raid player limit** — Adjust the registration size of the party by editing [guildAdventure.js L269](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/guildAdventure.js#L269).
- **Adjust the registration lobby duration** — Control the lobby timeout countdown via `REGISTRATION_TIME` in [guildAdventure.js L270](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/guildAdventure.js#L270).
- **Modify soft enrage stat growth** — Customize the stat growth of enraged bosses per turn in [bossMechanics.js L1162-1166](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/bossMechanics.js#L1162-L1166).
- **Define unique boss phase transition thresholds** — Set how the HP percentage triggers new boss phases in [bossMechanics.js L36](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/bossMechanics.js#L36).
- **Add custom phase effects** — Add or update boss buffs/heals upon transitioning phases in [bossMechanics.js L74-87](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/bossMechanics.js#L74-L87).
