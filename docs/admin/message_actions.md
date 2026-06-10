# Message Actions Moderation Flow (`delete` / `tagall` / `hidetag` / `pin`)

## 1. Description
These moderation commands operate directly on messages:
- **`delete`**: Deletes a target message by replying to it.
- **`tagall`**: Mentions every user in the group in a single message layout.
- **`hidetag`**: Sends a message that mentions all group participants invisibly.
- **`pin`**: Pins a message inside the group by replying to it.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🗑️ DELETE MESSAGE: User replies to a message with ".j delete"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: lowerTxt === ".j delete" (L7285)
            ├── verify canUseAdminCommands & botIsAdmin
            ├── Extract contextInfo from reply payload: m.message.extendedTextMessage.contextInfo (L7306)
            ├── Resolve author target JID: contextInfo.participant
            ├── Resolve WhatsApp message identifier ID: contextInfo.stanzaId
            ├── Send delete request payload: sock.sendMessage(chatId, { delete: { remoteJid, fromMe: false, id, participant } }) (L7334)
            └── return

======================================================
📌 PIN MESSAGE: User replies to message with ".j pin"
======================================================
User command
└── core/engine.js
    └── Match check: lowerTxt === ".j pin" (L7441)
        ├── verify canUseAdminCommands & botIsAdmin
        ├── Extract contextInfo -> resolve stanzaId and participant
        ├── Send pin request payload: sock.sendMessage(chatId, { pin: { remoteJid, fromMe, id, participant } })
        └── return
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

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7284-L7294) / [L7441-L7450](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7441-L7450)
* **Line Numbers**: 7284-7294 (delete) & 7441-7450 (pin)
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Directs logic to message action mutations

```javascript
                   // .j delete
                   if (
                     lowerTxt === `${botConfig.getPrefix().toLowerCase()} delete`
                   ) {
                     if (!canUseAdminCommands) {
                       await sock.sendMessage(chatId, { text: BOT_MARKER + "Admin only!" });
                       return;
                     }
                     // ... (delete execution)
                   }
```

---

### Step 3: Executing Delete/Pin Requests via Baileys API
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7332-L7341)
* **Line Numbers**: 7332-7341
* **Called From**: `delete` command branch inside `engine.js`
* **Inputs**: `contextInfo` parameters
* **Outputs**: Socket request to delete target message on WhatsApp servers

```javascript
                    try {
                      // Try to delete the message
                      await sock.sendMessage(chatId, {
                        delete: {
                          remoteJid: chatId,
                          fromMe: false,
                          id: contextInfo.stanzaId,
                          participant: messageAuthor,
                        },
                      });
                    } catch (err) {
                        // error logger
                    }
```

#### Explanation
1. Resolves the quoted message context metadata `m.message.extendedTextMessage.contextInfo`. If not replying to any message, informs the user.
2. Extracts message author `participant` JID and unique message ID `stanzaId` from context.
3. Invokes the socket client `sendMessage()` by passing a `delete` payload specifying the `remoteJid` (group chat JID), the target message `id` (`stanzaId`), and the message owner (`participant` JID).
4. WhatsApp servers process the payload and evict the message.

---

## 4. How to Modify
- **Exemptions / Level Guards**: Add bypass rules for owners/mods to bypass delete restrictions.
- **Pin Duration Limits**: Look up the Baileys pin payload options to configure customized pin duration boundaries.
