# RPG Subsystem: Economy

## What it is
The Economy Subsystem controls all cash flow, financial operations, peer-to-peer money transfers, daily rewards, bank vaults, and shop purchases. Players earn Zeni through daily check-ins, quests, combat encounters, and mini-games. This currency is held either in the player's immediate wallet or stored in their bank account. The system reads and writes to user data objects in MongoDB, persisting balances via scheduled saves, and processes shop commands using purchase verification gates before deducting funds.

## How it works

**Peer-to-Peer Transfer Operation** — [economy.js L631–670](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L631-L670)
```javascript
function transferMoney(fromUserId, toUserId, amount) {
  const sender = getUser(fromUserId);
  const receiver = getUser(toUserId);
  
  if (!sender || !receiver) {
    return { success: false, message: `❌ *TRANSFER FAILED*\n\n⚠️ Both users must be registered to transfer money!` };
  }
  
  const val = Number(amount);
  if (isNaN(val) || val <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be a valid positive number.` };
  }
  
  if (sender.wallet < val) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n💰 Your wallet: ${getZENI()}${sender.wallet.toLocaleString()}\n📊 Needed: ${getZENI()}${val.toLocaleString()}\n⚠️ Short by: ${getZENI()}${(val - sender.wallet).toLocaleString()}` };
  }
  
  sender.wallet -= val;
  receiver.wallet += val;
  
  logTransaction(fromUserId, `Transfer to @${toUserId.split('@')[0]}`, -val, sender.wallet);
  logTransaction(toUserId, `Transfer from @${fromUserId.split('@')[0]}`, val, receiver.wallet);

  scheduleSave(fromUserId);
  scheduleSave(toUserId);
  
  return {
    success: true,
    message: `✅ *TRANSFER SUCCESSFUL!*
 
━━━━━━━━━━━━━━━━
💸 *Sent:* ${getZENI()}${amount.toLocaleString()}
👤 *To:* @${toUserId.split('@')[0]}
━━━━━━━━━━━━━━━━
 
💰 *Your New Balance:* ${getZENI()}${sender.wallet.toLocaleString()}`,
    receiver: toUserId,
    amount: val,
    wallet: sender.wallet,
    bank: sender.bank,
```
This function validates user registration, parses the transfer amount, check if the sender has enough wallet funds, adjusts wallet fields for both users, logs transactions, and schedules a database write.

---

**Daily Reward Claims** — [economy.js L779–824](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L779-L824)
```javascript
function claimDaily(userId) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };
  
  const now = Date.now();
  const dayInMs = 86400000;
  
  if (now - user.lastDaily < dayInMs) {
    const timeLeft = dayInMs - (now - user.lastDaily);
    const hoursLeft = Math.floor(timeLeft / 3600000);
    const minsLeft = Math.floor((timeLeft % 3600000) / 60000);
    
    return {
      success: false,
      message: `⏰ *DAILY ALREADY CLAIMED!*
 
━━━━━━━━━━━━━━━
🕐 Come back in:
   *${hoursLeft}h ${minsLeft}m*
 ━━━━━━━━━━━━━━━
 
💡 _Check back tomorrow for your reward!_`
    };
  }
  
  user.wallet += DAILY_REWARD;
  user.lastDaily = now;
  user.stats.totalEarned += DAILY_REWARD;
  
  logTransaction(userId, "Daily Reward", DAILY_REWARD, user.wallet);
 
  scheduleSave(userId);
  
  return {
    success: true,
    message: `🎁 *DAILY REWARD CLAIMED!*
 
━━━━━━━━━━━━━━━
💰 *Reward:* +${getZENI()}${DAILY_REWARD.toLocaleString()}
━━━━━━━━━━━━━━━
 
💵 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}
 
✨ _Come back in 24 hours for another reward!_`
  };
}
```
This handler verifies if the user's daily check-in timestamp cooldown (24 hours) has elapsed. If valid, the system increments the user's wallet, updates the last claimed timestamp, logs the transaction, and schedules database updates.

---

**Shop Purchase Balance Gate** — [shopCommands.js L166–211](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/shopCommands.js#L166-L211)
```javascript
    // Check balance
    const balance = economy.getBalance(senderJid);
    if (balance < item.cost) {
        await sock.sendMessage(chatId, {
            text: `❌ Insufficient funds!\n\nNeed: ${getZENI()}${item.cost.toLocaleString()}\nYou have: ${getZENI()}${balance.toLocaleString()}`
        });
        return;
    }
    
    // Handle different item types
    let result;
    
    switch (item.type) {
        case 'CLASS_CHANGE':
            result = await handleClassChange(senderJid);
            break;
        case 'EVOLUTION':
        case 'ASCENSION':
            result = await handleConsumable(senderJid, item);
            break;
        case 'RESET':
            result = await handleReset(senderJid);
            break;
        case 'STAT_BOOST':
        case 'STAT_BOOST_PERM':
            result = await handleStatBoost(senderJid, item);
            break;
        case 'EQUIPMENT':
            result = await handleEquipment(senderJid, item);
            break;
        case 'CONSUMABLE':
        case 'BOOSTER':
        case 'SPECIAL_KEY':
            result = await handleConsumable(senderJid, item);
            break;
        default:
            result = { success: false, message: `❌ Unknown item type: ${item.type}` };
    }
    
    if (result.success) {
        // 💡 BUG FIX: Only deduct money if inventory add was successful
        economy.removeMoney(senderJid, item.cost);
        
        await sock.sendMessage(chatId, {
            text: `✅ *PURCHASE SUCCESSFUL!*\n\n${result.message}\n\n💸 Paid: ${getZENI()}${item.cost.toLocaleString()}`
```
This is the core purchase gate. It checks the player's wallet balance against the shop item's value, runs specific item integrations, and deducts the price from the player's wallet via the economy manager only upon purchase success.

## How to modify it

### Tweaking Daily Reward Amount
To adjust the quantity of Zeni awarded for daily login claims, edit the `DAILY_REWARD` constant in `core/rpg/economy.js`.

**Before (core/rpg/economy.js L16):**
```javascript
const DAILY_REWARD = 500;
```

**After (core/rpg/economy.js L16):**
```javascript
const DAILY_REWARD = 1000; // Increased daily reward amount
```

### Expanding Class Shop Purchase Restrictions
To expand the restrictions on specific shop items (like restricting key purchases to multiple lineages), modify the lineage checks in `core/commands/shopCommands.js`.

**Before (core/commands/shopCommands.js L159–164):**
```javascript
    if (itemId === 'dragon_key') {
        const currentClass = economy.getUserClass(senderJid);
        if (!classSystem.isFighterLineage(currentClass?.id)) {
            return sock.sendMessage(chatId, { text: `❌ *DRAGON HUNTER LINEAGE REQUIRED*\n\nOnly members of the *Fighter* lineage can purchase this key. Dragonslayers are born from true warriors!` });
        }
    }
```

**After (core/commands/shopCommands.js L159–164):**
```javascript
    if (itemId === 'dragon_key') {
        const currentClass = economy.getUserClass(senderJid);
        if (!classSystem.isFighterLineage(currentClass?.id) && !classSystem.isMageLineage(currentClass?.id)) { // Allowed Fighters and Mages
            return sock.sendMessage(chatId, { text: `❌ *DRAGON HUNTER LINEAGE REQUIRED*\n\nOnly members of the *Fighter* or *Mage* lineage can purchase this key.` });
        }
    }
```

## Common tasks
- **Modify daily check-in rewards** — Change the amount awarded daily to users in [economy.js L16](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L16).
- **Edit money transfer parameters** — Adjust balance checks and verification messages in [economy.js L631–670](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L631-L670).
- **Tune daily reward cooldown** — Modify the claiming cooldown duration (default 24 hours) in [economy.js L784](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L784).
- **Update shop purchase balance checks** — Customize purchase validation messages and requirements in [shopCommands.js L166–173](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/shopCommands.js#L166-L173).
- **Modify post-purchase money deduction** — Adjust wallet deductions after successful transaction completions in [shopCommands.js L207](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/shopCommands.js#L207).
