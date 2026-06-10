# Member Management Moderation Flow (`kick` / `promote` / `demote` / `mute` / `unmute` / `warn` / `warnings` / `resetwarn`)

## 1. Description
These moderation commands allow group administrators to manage participants:
- **`kick`**: Instantly removes a target player from the group.
- **`promote` / `demote`**: Promotes a user to group administrator or demotes an admin back to a regular member.
- **`mute` / `unmute`**: Mutes a member for a parsed duration (e.g. `10s`, `5m`, `1h`), automatically deleting any messages they send until unmuted.
- **`warn` / `warnings` / `resetwarn`**: Adds a warning to a participant (5 warnings results in an automatic kick). Users can check active warnings or admins can reset them.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🥾 KICK MEMBER: User sends ".j kick @user"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: primaryCmd === "kick" (L7132)
            ├── verify canUseAdminCommands (caller must be admin)
            ├── verify botIsAdmin (bot must be admin in group)
            ├── targetUser = getMentionOrReply(m)
            ├── group participants update: sock.groupParticipantsUpdate(chatId, [targetUser], "remove")
            └── sock.sendMessage(chatId, { text: confirmationMsg })

======================================================
⚠️ WARN MEMBER: User sends ".j warn @user spamming"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "warn" (L7917)
        ├── verify canUseAdminCommands
        ├── targetUser = getMentionOrReply(m)
        ├── Extract reason string (removes command & mentions)
        ├── addWarning(targetUser, chatId, reason) -> increment warnings map & save (L7950)
        ├── Send warning notice: `${warnCount}/5 warnings`
        ├── If warnCount >= 5:
        │   ├── sock.groupParticipantsUpdate(chatId, [targetUser], "remove") (L7965)
        │   └── send auto-kick notice
        └── return

======================================================
🔇 MUTE MEMBER: User sends ".j mute @user 1h"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "mute" (L8192)
        ├── verify canUseAdminCommands
        ├── targetUser = getMentionOrReply(m)
        ├── verify targetUser is not self / owner / global mod (L8225-8244)
        ├── parseDuration(arg) -> duration in milliseconds (L8267)
        ├── muteUser(targetUser, chatId, duration) -> save to active mutes
        └── Send muted confirmation message
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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7132) (kick) / [L7917](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7917) (warn) / [L8192](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L8192) (mute)
* **Line Numbers**: 7132, 7917, 8192
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Executes target moderation block

```javascript
                  // .j kick
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} kick` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} kick ` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} kick `,
                    )
                  ) {
                    if (!canUseAdminCommands) {
                      await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Admin only!` });
                      return;
                    }
                    // ... (kick execution)
                  }
```

---

### Step 3: Executing Action via Baileys API
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7140-L7170)
* **Line Numbers**: 7140-7170
* **Called From**: `kick` command branch inside `engine.js`
* **Inputs**: JID targets
* **Outputs**: Socket request to remove user from WhatsApp group participants

```javascript
                    const targetUser = getMentionOrReply(m);
                    if (targetUser) {
                      if (!botIsAdmin) {
                        await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ I need to be an admin to kick users!" });
                        return;
                      }
                      
                      await sock.groupParticipantsUpdate(
                        chatId,
                        [targetUser],
                        "remove",
                      );
                      await sock.sendMessage(chatId, { text: BOT_MARKER + "✅ User removed." });
                    }
```

#### Explanation
1. Resolves the target participant JID from mentioned tags or the quoted reply message JID using `getMentionOrReply(m)`.
2. Validates that the bot possesses administrator privileges (`botIsAdmin`). If not, tells the user.
3. Invokes the socket Baileys client helper `groupParticipantsUpdate(chatId, [targetUser], "remove")` to request participant removal from the WhatsApp server.
4. Delivers confirmation text.

---

### Step 4: Warning Strike Persistence & Auto-Kick Gate
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7950-L7970)
* **Line Numbers**: 7950-7970
* **Called From**: `warn` command block
* **Inputs**: Target JID, chat room JID, reason string
* **Outputs**: Increments warning count, executes kick if strikes limit (5) is reached

```javascript
                      const warnCount = addWarning(targetUser, chatId, reason);
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `⚠️️ @${targetPhone} has been warned (${warnCount}/5 in THIS group)\n\n*Reason:* ${reason}`,
                        contextInfo: { mentionedJid: [targetUser] },
                      });

                      // if 5 warnings IN THIS GROUP, kick them out
                      if (warnCount >= 5 && botIsAdmin) {
                        await sock.sendMessage(chatId, {
                          text:
                            BOT_MARKER +
                            "5 warnings reached in this group. removing...",
                        });
                        await sock.groupParticipantsUpdate(
                          chatId,
                          [targetUser],
                          "remove",
                        );
                      }
```

#### Explanation
1. Calls the local helper function `addWarning()`, which saves a warning log containing the reason and timestamp in the `userWarnings` Map.
2. Invokes `saveUserWarnings()` to synchronize changes back to the MongoDB `System` collection under the configuration key `${BOT_ID}_user_warnings`.
3. If the warning count matches or exceeds the threshold (5), and the bot is admin, it triggers a participant update to remove the user.

---

## 4. How to Modify
- **Warnings Strike Limit**: Edit the threshold check value `5` at [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7959) and the description labels.
- **Warnings DB Persistence Key**: Locate the DB loading key `${BOT_ID}_user_warnings` in `loadUserWarnings()` at [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L953).
- **Modify Warning/Kick Messages**: Edit the response text strings in the respective command branches.
