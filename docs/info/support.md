# Support Command Flow (`support`)

## 1. Description
The `support` command provides users with a direct line of contact to the bot creator. To prevent abuse and spam, the bot limits each user to 5 support requests per session. If a user exceeds this limit, they are blocked from using the support command. The command also tags the bot creator's contact card when executed.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j support"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── support command matching (L5891)
            └── checkSupportUsage(senderJid) (L924)
                └── Retrieve counts from system DB (system.get)
            └── incrementSupportUsage(senderJid) (L928)
                └── Save updated count to system DB (system.set)
            └── sendMenuWithBanner(sock, chatId, supportMsg, [creatorJid]) (L5925)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Ingestion
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

---

### Step 2: Spam Check and Usage Tracking
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5891-L5930)
* **Inputs**: Message text `support`
* **Outputs**: Evaluates current user support usage count

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} support`) {
  const usage = checkSupportUsage(senderJid);
  
  if (usage >= 5) {
    await sendMenuWithBanner(sock, chatId, GET_BANNER(`🚫 BLOCKED`) + `\n\nYou've used the support command too many times (5/5).`);
    return;
  }
  
  const newUsage = incrementSupportUsage(senderJid);
  const remaining = 5 - newUsage;
  
  let warningText = "";
  if (newUsage >= 3) {
    warningText = `\n\n⚠️️ *WARNING:* ${remaining} uses remaining before you're blocked!`;
  }
  
  const supportMsg = GET_BANNER(`🛠️ SUPPORT`) + `\n\nFor help or issues, contact:\n@0201487480\n\n━━━━━━━━━━━━━━━\nUsage: ${newUsage}/5${warningText}`;
  await sendMenuWithBanner(sock, chatId, supportMsg, ["0201487480@s.whatsapp.net"]);
  return;
}
```

---

### Step 3: Persistence and Database Updates
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L924-L933)
* **Inputs**: `(userId)`
* **Outputs**: Saves the incremented values to MongoDB/system database wrapper

```javascript
function checkSupportUsage(userId) {
  return supportUsage.get(userId) || 0;
}

function incrementSupportUsage(userId) {
  const count = (supportUsage.get(userId) || 0) + 1;
  supportUsage.set(userId, count);
  saveSupportUsage(); // Writes system.set(BOT_ID + "_support_usage", ...)
  return count;
}
```

---

## 4. How to Modify
* **Change Creator Contact JID**: Update the phone number and WhatsApp JID inside [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5920-L5926).
* **Adjust Support Ticket Limits**: Change the hard lockout threshold (currently `5`) inside the command handler in [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5897).
