# Phantom Thief Command Flow (`reveal` / `unmask`)

## 💡 Noob-Friendly Explanation
* **What it does**: When someone sends a "view-once" photo or video in a chat, you can reply to it with `.j reveal` or `.j unmask`, and the bot will send it back as a normal, permanent photo or video that anyone can see, save, or forward.
* **How to use it**: Reply to any view-once image or video message with `.j reveal` or `.j unmask`.
* **Under the Hood (Simple)**: When WhatsApp sends a view-once message, it still transmits the actual image or video file data to the bot. Normally, the WhatsApp app hides the file after you look at it once. The bot simply downloads that file data, ignores the "hide" flag, and posts it back to the group as a regular, open attachment.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j reveal" (replying to a view-once message)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── Match check: primaryCmd === "reveal" || "unmask" (L6097)
            ├── Extract quoted message content: quotedContent (L6100)
            ├── Identify view-once flags: imageMessage.viewOnce or videoMessage.viewOnce
            ├── Download media stream: downloadMedia(mediaMsg, type) (L6140)
            │   └── Baileys library: downloadContentFromMessage()
            ├── Send back raw media: sock.sendMessage(chatId, { [type]: buffer, caption }) (L6178)
            └── Finish processing
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Command Detection and Extraction
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6097)
* **Inputs**: Message payload `m`, command string `lowerTxt`
* **Outputs**: Directs execution to the view-once extraction block

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reveal` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} unmask`) {
  const quotedMsg = m.message?.extendedTextMessage?.contextInfo;
  const quotedContent = quotedMsg?.quotedMessage;
```

### Step 2: Media Type Identification and Verification
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6105-L6125)
* **Inputs**: Quoted message contents
* **Outputs**: Resolves the type of media (image/video) and extracts the media metadata object

```javascript
  let type = null;
  let mediaMsg = null;

  if (quotedContent.imageMessage?.viewOnce) {
    type = "image";
    mediaMsg = quotedContent.imageMessage;
  } else if (quotedContent.videoMessage?.viewOnce) {
    type = "video";
    mediaMsg = quotedContent.videoMessage;
  }
```

### Step 3: Downloading the Media Buffer
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6135-L6150)
* **Inputs**: Media metadata object and media type
* **Outputs**: Returns the raw binary buffer of the media file

```javascript
  const buffer = await downloadMedia(mediaMsg, type);
```

### Step 4: Dispatching the Permanent Media Message
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6175-L6190)
* **Inputs**: Socket client, target chatId, binary media buffer, and caption string
* **Outputs**: Delivers the permanent media file to WhatsApp

```javascript
  await sock.sendMessage(chatId, {
    [type]: buffer,
    caption: BOT_MARKER + "🎭 *Phantom Thief acquired your secret.*"
  }, { quoted: m });
}
```

---

## 4. How to Modify
* **Change the Caption**: You can customize the message that the bot sends along with the revealed image/video in `engine.js` around line 6178.
* **Add Log or Alert Notification**: If you want to log whenever a user reveals a message, you can add a `console.log` or warning system inside the command handler.
