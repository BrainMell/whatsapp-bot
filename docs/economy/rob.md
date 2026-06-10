# Rob Command Flow (`rob`, `steal`)

## 1. Description
The Rob command allows a registered user to attempt to steal money from another registered user's Wallet. Success rate is 40%. A failed attempt results in a police fine and accumulating "robbery strikes" that lead to temporary command bans (jail/prison).

---

## 2. Hierarchical Execution Tree
```text
User A (Thief) sends ".j rob @UserB" or ".j steal @UserB"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " rob ") || "steal ") (L14728)
            └── Check registration: economy.isRegistered(senderJid)
            └── Resolve victim: getMentionOrReply(m) (L14746)
            └── Validate target is registered & not the thief & not the bot
            └── core/rpg/economy.js
                └── robUser(thiefId, victimId) (L1200)
                    └── Check jail/prison active bans
                    └── Check 30-minute cooldown: lastRob
                    └── Check victim wallet >= 500 Zeni (L1227)
                    └── Decrement social relationship: socialSystem.incrementRelationship(...) (L1236)
                    └── Determine outcome: Math.random() < 0.4 (L1231)
                    └── If Success:
                        └── Steal percentage: 10% to 30% of victim wallet
                        └── victim.wallet -= amount, thief.wallet += amount
                        └── logTransaction for both users
                        └── scheduleSave for both users
                    └── If Busted:
                        └── Calculate fine (1% of thief wallet, min 500)
                        └── Increment robberyStrikes
                        └── Apply jail (30 min) on strike 2 or prison (24 hrs) on strike 3
                        └── logTransaction for thief
                        └── scheduleSave for thief
            └── sock.sendMessage(chatId, { text: result.message }) (L1776)
            └── awardProgression(senderJid, chatId) (L1780)
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

### Step 2: Command Matching and Parameter Validation
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14728-L14782)
* **Line Numbers**: 14728-14782
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Target recipient `victim` JID

```javascript
                    const victim = getMentionOrReply(m);

                    if (!victim) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: \`${botConfig.getPrefix()} rob @user\` or reply to their message.`,
                      });
                      return;
                    }

                    if (victim === senderJid) {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `❌ You can't rob yourself.`,
                      });
                      return;
                    }

                    // Check if target is the bot
                    const botJid =
                      sock.user.id.split(":")[0] + "@s.whatsapp.net";
                    const botLid = sock.authState.creds?.me?.lid;
                    if (victim === botJid || victim === botLid) {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `❌ you cant rob the bot`,
                      });
                      return;
                    }
```

#### Explanation
- Captures commands beginning with `rob ` or `steal `.
- Fetches target user via mention or reply.
- Validates that the thief is not trying to rob themselves or the bot.

---

### Step 3: Robbery Cooldown and Ban Validations
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L1211-L1229)
* **Line Numbers**: 1211-1229
* **Called From**: `core/engine.js`
* **Inputs**: `(thiefId, victimId)`
* **Outputs**: Returns early with error message if limits are active

```javascript
  if (thief.prisonUntil && thief.prisonUntil > now) {
    const mins = Math.ceil((thief.prisonUntil - now) / 60000);
    return { success: false, message: `⛓️ *PRISON BAN*\n\nYou are banned from bot commands for ${mins} minute(s).` };
  }

  if (thief.jailUntil && thief.jailUntil > now) {
    const mins = Math.ceil((thief.jailUntil - now) / 60000);
    return { success: false, message: `🚔 *JAIL BAN*\n\nYou are banned from bot commands for ${mins} minute(s).` };
  }

  if (thief.lastRob && (now - thief.lastRob < cooldown)) {
    const timeLeft = cooldown - (now - thief.lastRob);
    const mins = Math.ceil(timeLeft / 60000);
    return { success: false, message: `👮 *POLICE ALERT*\n\nYou're laying low! Wait ${mins} minutes before robbing again.` };
  }
  
  if (victim.wallet < 500) {
    return { success: false, message: `❌ They are too poor to rob!` };
  }
```

#### Explanation
- **Prison Ban**: Checks if the user has a long-term prison ban active.
- **Jail Ban**: Checks if the user is currently jailed for previous robbery offenses.
- **Police Cooldown**: Checks if the 30-minute robbery cooldown is active (`thief.lastRob`).
- **Victim Wealth**: Checks that the victim has at least 500 Zeni in their wallet.

---

### Step 4: Relationship Adjustment & Success Evaluation
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L1230-L1282)
* **Line Numbers**: 1230-1282
* **Called From**: `robUser()` helper
* **Inputs**: Outcomes of probability roll
* **Outputs**: Mutated state, logged transactions, and results payload

```javascript
  const success = Math.random() < 0.4;
  thief.lastRob = now;

  try {
    const socialSystem = require('./socialSystem');
    socialSystem.incrementRelationship(thiefId, victimId, -15);
  } catch (socialErr) {}
  
  if (success) {
    const percent = Math.floor(Math.random() * 20) + 10;
    const amount = Math.floor(victim.wallet * (percent / 100));
    
    victim.wallet -= amount;
    thief.wallet += amount;
    
    logTransaction(thiefId, `Robbed @${victimId.split('@')[0]}`, amount, thief.wallet);
    logTransaction(victimId, `Robbed by @${thiefId.split('@')[0]}`, -amount, victim.wallet);

    scheduleSave(thiefId);
    scheduleSave(victimId);
    return { 
      success: true, 
      message: `🥷 *ROBBERY SUCCESSFUL*\n\nYou stole ${getZENI()}${amount.toLocaleString()} from @${victimId.split('@')[0]}!` 
    };
  } else {
    const fine = Math.max(500, Math.floor(thief.wallet * 0.01));
    thief.wallet = Math.max(0, thief.wallet - fine);

    thief.robberyStrikes = (thief.robberyStrikes || 0) + 1;

    let penaltyLine = `💸 Fine paid: ${getZENI()}${fine.toLocaleString()}.`;
    if (thief.robberyStrikes === 1) {
      penaltyLine += `\n⚠️ First offense: fine only.`;
    } else if (thief.robberyStrikes === 2) {
      thief.jailUntil = now + jailDuration;
      penaltyLine += `\n🚔 Second offense: 30-minute jail ban.`;
    } else {
      thief.prisonUntil = now + prisonDuration;
      thief.jailUntil = 0;
      thief.robberyStrikes = 0;
      penaltyLine += `\n⛓️ Third offense: 1-day prison ban.`;
    }
    
    logTransaction(thiefId, "Robbery Fine (Police)", -fine, thief.wallet);
    scheduleSave(thiefId);
```

#### Explanation
1. Rolls outcome: 40% success rate.
2. Invokes `socialSystem.incrementRelationship` to penalize the relationship between both users by 15 points.
3. **Outcome - SUCCESS**:
   - Computes transfer amount (random 10% to 30% of victim wallet).
   - Updates wallets, logs the transactions, and saves both documents to MongoDB.
4. **Outcome - FAILURE (Busted)**:
   - Deducts fine (1% of thief wallet, min 500 Zeni).
   - Increments robbery strikes. If strike 2, applies a 30-minute jail ban. If strike 3+, applies a 24-hour prison ban.
   - Saves changes to MongoDB.

---

## 4. How to Modify
To adjust the robbery rules:
- **Change Success Rate**: Edit [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L1231):
  ```javascript
  const success = Math.random() < 0.3; // Reduce success rate to 30%
  ```
- **Change Cooldown Duration**: Change `cooldown` variable in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L1207):
  ```javascript
  const cooldown = 60 * 60 * 1000; // Change to 1 hour cooldown
  ```
- **Change Payout Percentage**: Change the percentage calculation in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L1240):
  ```javascript
  const percent = Math.floor(Math.random() * 10) + 5; // Steal 5% to 15% instead
  ```
- **Custom Guards / Shield Items**: Check if the victim owns a specific shield item in their inventory to block robberies entirely.
