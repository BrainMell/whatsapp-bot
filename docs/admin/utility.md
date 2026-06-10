# Bot Control and Utility Commands Flow (`on`, `off`, `reset`, `reveal`, `updateall`)

## 1. Description
The Utility commands manage the bot's runtime state, DMs/conversations memory caching, and view-once media extraction. 
* `on` / `off`: Toggles whether the bot processes commands in a specific chat.
* `reset`: Wipes the AI's conversation history cache for a chat.
* `reveal` (alias `unmask`): Intercepts view-once images/videos by downloading their raw streams and sending them back to the chat.
* `updateall`: Allows the owner to broadcast custom system updates to all enabled chats.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j reveal" (replying to view-once media)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── reveal/unmask command matching (L6097)
            └── extractViewOnce(quotedContent) (Checks if old/new view-once payload format)
            └── downloadMedia(mediaMsg, type) (L1920)
                └── downloadContentFromMessage(message, type) (From Baileys)
            └── sock.sendMessage(chatId, { [type]: buffer, caption }) (Sends revealed file)

User sends ".j on" / ".j off" (Admin only)
└── core/engine.js
    └── on / off command matching (L16403 / L16424)
        └── enabledChats.add(chatId) / enabledChats.delete(chatId)
        └── saveEnabledChats() (Persists status to system database)
        └── sock.sendMessage(chatId, { text: enabledStatusText })

User sends ".j reset"
└── core/engine.js
    └── reset command matching (L1507)
        └── conversationMemory.delete(memKey) (Clears text contexts)
        └── temporaryContext.delete(senderJid)
        └── aiResponseCache.delete(...) (Wipes AI cached answers)
        └── sock.sendMessage(chatId, { text: "Chat memory cleared." })

User sends ".j updateall Hello World" (Owner only)
└── core/engine.js
    └── updateall command matching (L16445)
        └── Loops through Array.from(enabledChats)
        └── sock.sendMessage(targetChatId, { text: broadcastMsg })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: View-Once Stealer (`reveal` / `unmask`)
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6097-L6198)
* **Inputs**: Quoted message context containing `viewOnce` properties
* **Outputs**: Delivers raw image/video file to the chat

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reveal` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} unmask`) {
  const quotedMsg = m.message?.extendedTextMessage?.contextInfo;
  const quotedContent = quotedMsg.quotedMessage;
  
  let type = null;
  let mediaMsg = null;

  // Handles both new (direct viewOnce flag) and old formats:
  if (quotedContent.imageMessage?.viewOnce) {
    type = "image";
    mediaMsg = quotedContent.imageMessage;
  } else if (quotedContent.videoMessage?.viewOnce) {
    type = "video";
    mediaMsg = quotedContent.videoMessage;
  } // ... fallback old format resolver (extractViewOnce)

  if (!type || !mediaMsg) return reply("Not a view-once message.");

  // Downloads hidden media stream chunks
  const buffer = await downloadMedia(mediaMsg, type);

  // Send back raw file attachment
  await sock.sendMessage(chatId, {
    [type]: buffer,
    caption: BOT_MARKER + "🎭 *Phantom Thief acquired your secret.*"
  });
}
```

---

### Step 2: Inactivity & Group Toggles (`on` / `off`)
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L16402-L16443)
* **Inputs**: Admin toggle commands
* **Outputs**: Writes active status array to MongoDB/wrapper system and toggles responder engine

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} on`) {
  if (!canUseAdminCommands) return reply("Admins only.");
  enabledChats.add(chatId);
  saveEnabledChats(); // Writes updated list to system db: system.set('enabled_chats', ...)
  await sock.sendMessage(chatId, { text: "🤖 AI is now enabled in this chat!" });
}
```

---

### Step 3: Conversation Memory Reset (`reset`)
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1507-L1530)
* **Inputs**: Text matching `reset` prefix command
* **Outputs**: Deletes cached history objects from local cache maps

```javascript
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} reset`)) {
  const memKey = `${senderJid}_${chatId || 'dm'}`;
  conversationMemory.delete(memKey);
  conversationMemory.delete(senderJid);
  temporaryContext.delete(senderJid);

  // Clear AI response cache for this chat
  if (chatId) {
    for (const key of aiResponseCache.keys()) {
      if (key.startsWith(`${chatId}_`)) aiResponseCache.delete(key);
    }
  }
  await sock.sendMessage(chatId, { text: "🗑️ Chat memory cleared." });
}
```

---

## 4. How to Modify
* **Customize View-Once Stolen Caption**: Modify the text returned with the revealed attachment in [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6180).
* **Broadcast Rate Limits**: Edit the loop interval or add concurrency limits to the broadcast loop in the `updateall` handler around line 16445 in [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js).
* **Reset Custom Keys**: If you add new memory profiles or contextual caching layers, make sure to clear them inside the `reset` command handler block in [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1507).
