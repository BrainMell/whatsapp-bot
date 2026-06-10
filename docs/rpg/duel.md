# PvP Duel Command Flow (`duel` / `challenge` / `pvp`)

## 1. Description
The PvP/Duel system allows two registered players to challenge each other to a 1v1 battle in a chat. Players can optionally wage/stake Zeni. Fights are structured in turns, allowing each player to make choices like basic attacks (`attack` / `atk`), abilities/skills (`ability` / `skill`), or items (`item`). It features basic stat dampening/capping to prevent instant one-shots, handles combat turns, resolves stakes, and renders a final summary on completion.

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
- Handles network notifications for new messages.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13526-L13636)
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
* **File Path**: [core/rpg/pvpSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/pvpSystem.js#L219-L260)
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
* **File Path**: [core/rpg/pvpSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/pvpSystem.js#L425-L450)
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
- **PvP Damage Mitigation Caps**: Adjust `PVP_DAMAGE_MULT` (currently 0.8) or `PVP_DEFENSE_CAP` (currently 0.5) constants at [core/rpg/pvpSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/pvpSystem.js#L31-L33).
- **Modify Challenge Timeout Duration**: Change `CHALLENGE_TIMEOUT` values (currently 120000ms/2 minutes).
- **Edit Combat Actions Vocabulary**: Add alias overrides to the command parser in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4909).
