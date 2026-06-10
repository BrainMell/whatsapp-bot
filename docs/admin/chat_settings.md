# Group Settings Moderation Flow (`welcome` / `setwelcome` / `bye` / `setbye` / `antilink` / `antispam` / `news` / `glock` / `gunlock`)

## 1. Description
These settings moderation commands allow group administrators to customize bot features for the active conversation chat:
- **`welcome` (on/off) / `setwelcome`**: Toggles greeting announcements when a new participant joins, and configures custom welcome message templates (supports tag interpolation like `{user}` or `{group}`).
- **`bye` (on/off) / `setbye`**: Toggles departure notifications when a participant leaves, and configures custom templates.
- **`antilink`**: Enables automatic link filters, deleting invitations, status links, or channel links based on configured actions (`delete`, `warn`, or `kick`).
- **`antispam`**: Restricts rapid message spamming from users.
- **`news`**: Toggles daily automated anime news updates inside the group conversation.
- **`glock` / `gunlock` (Group Lock)**: Restricts message permissions in the group so only admins can chat (or restores public chat access).

---

## 2. Hierarchical Execution Tree
```text
======================================================
⚙️ TOGGLE SETTINGS: User sends ".j welcome on"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: lowerTxt === ".j welcome on/off" (L7605)
            ├── verify isGroupChat (L7611)
            ├── verify canUseAdminCommands (L7617)
            ├── getGroupSettings(chatId) -> fetch active configuration cache Map (L7623)
            ├── Update setting value: settings.welcomeEnabled = true
            ├── Save configurations: saveGroupSettings() (L888) -> writes Map to System collection in DB
            └── sock.sendMessage(chatId, { text: successMsg })

======================================================
📝 CONFIGURE GREETING: User sends ".j setwelcome Hello {user}!"
======================================================
User command
└── core/engine.js
    └── Match check: lowerTxt === ".j setwelcome <msg>" (L7552)
        ├── verify isGroupChat & canUseAdminCommands
        ├── Extract template: txt.substring(commandPrefixLength) (L7580)
        ├── Update setting value: settings.welcomeMessage = welcomeMsg
        ├── saveGroupSettings()
        └── sock.sendMessage(chatId, { text: updateNotice })

======================================================
🛡️ FILTER LINK SPAM: User sends a link while antilink is ON
======================================================
Incoming user message
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Check message contents for link patterns (regex matches http/https/whatsapp)
            ├── Check if sender is group administrator -> Exempt from filter if true
            ├── getGroupSettings(chatId) -> verify antilink === true
            ├── Execute active settings.antilinkAction:
            │   ├── "delete" -> sock.sendMessage(chatId, { delete: m.key })
            │   ├── "warn"   -> addWarning(senderJid, chatId) & delete message
            │   └── "kick"   -> groupParticipantsUpdate(chatId, [senderJid], "remove")
            └── return early
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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7552-L7563) / [L7605-L7610](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7605-L7610)
* **Line Numbers**: 7552-7563 (setwelcome) & 7605-7610 (welcome toggle)
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Directs logic to setting mutations

```javascript
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} welcomemessage` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} welcomemessage `,
                    ) ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} setwelcome` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} setwelcome `,
                    )
                  ) {
                      // ... (welcome template assignment)
                  }
```

---

### Step 3: Setting Mutation & Database Write Sync
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7597-L7602)
* **Line Numbers**: 7597-7602
* **Called From**: Setting commands blocks inside `engine.js`
* **Inputs**: Target setting values
* **Outputs**: Updates local settings map, triggers DB sync, replies with receipt

```javascript
                    settings.welcomeMessage = welcomeMsg;
                    saveGroupSettings();

                    return await sock.sendMessage(chatId, {
                      text: BOT_MARKER + `✅ Welcome message updated!`,
                    });
```

#### Explanation
1. Retrieves the active group's configuration object from the `groupSettings` cache Map. If group configurations are missing, `getGroupSettings()` initializes default properties.
2. Updates properties in the settings object (e.g. `settings.welcomeMessage` or `settings.welcomeEnabled`).
3. Calls the database synchronizer `saveGroupSettings()`, which serializes the cache Map using `Object.fromEntries(groupSettings)` and saves it to MongoDB via the `System` model under the key `${BOT_ID}_group_settings`.
4. Emits a configuration success notification back to WhatsApp.

---

## 4. How to Modify
- **Group Settings Default Values**: Edit properties initialized in `getGroupSettings()` at [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L894-L901).
- **Group Settings DB Persistence Key**: Locate the DB loading key `${BOT_ID}_group_settings` in `loadGroupSettings()` at [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L877).
- **Modify Template Interpolation Variables**: Adjust replacement rules where greeting messages are dispatched when users join/leave.
