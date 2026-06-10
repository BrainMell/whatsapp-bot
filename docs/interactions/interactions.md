# Animated Reaction & Interaction Commands Flow

## 1. Description
The Reaction/Interaction commands generate context-specific SFW anime reaction GIFs and deliver them to WhatsApp as autoplaying video clips (`gifPlayback: true`). The available commands are:
- `.j kiss @user` — Kiss someone.
- `.j hug @user` — Give someone a warm hug.
- `.j pat @user` — Pat someone on the head.
- `.j slap @user` — Slap someone.
- `.j kill @user` — Falsely murder someone.
- `.j wink` — Wink to express your vibes.
- `.j cry` — Cry out loud.
- `.j dance` — Start dancing.
- `.j smug` — Look smug.
- `.j eat @user` — Eat/Nom something or someone.
- `.j backflip` — Do a backflip.

The system dynamically pulls media links from public anime picture repositories (Nekos.best & Waifu.pics), converts the graphics format locally via FFmpeg, and cleans up residual temporary storage.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j kiss @user" (or ".j wink", etc.)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── reaction command lookup in REACTIONS (L4568)
            └── core/reactions/handler.js (Imported from 'reactions/handler')
                └── handleReaction(sock, msg, type, emoji, targeted, chatId, senderJid, senderName) (L83)
                    └── resolveTarget(msg) (L19)
                    └── fetchGifUrl(type) (L39)
                        └── axios.get("https://nekos.best/api/v2/...")
                        └── axios.get("https://api.waifu.pics/sfw/...") (Fallback)
                    └── fs.writeFileSync(tempGif, downloadBuffer) (L151)
                    └── execPromise("ffmpeg -i tempGif ... tempVideo") (L155)
                    └── sock.sendMessage(chatId, { video: tempVideo, gifPlayback: true, caption })
                    └── fs.unlinkSync(tempGif / tempVideo) (L183)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Request Ingestion and Mapping
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4567-L4581)
* **Inputs**: Command prefix and text string `lowerTxt`
* **Outputs**: Dispatches reaction attributes (type, emoji, targeting status) to the handler

```javascript
const reaction = REACTIONS.find((r) => r.type === primaryCmd);
if (reaction) {
  await handleReaction(
    sock,
    m,
    reaction.type,
    reaction.emoji,
    reaction.targeted,
    chatId,
    senderJid,
    senderName
  );
  return;
}
```

---

### Step 2: Target Resolution
* **File Path**: [handler.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/handler.js#L19-L34)
* **Inputs**: WhatsApp message object `msg`
* **Outputs**: Returns target phone JID or `null` if none found

```javascript
function resolveTarget(msg) {
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.length > 0) return mentions[0];

  const participant = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (participant) return participant;
  
  // ... fallbacks for DM chats
  return null;
}
```

---

### Step 3: Fetching Media Endpoint
* **File Path**: [handler.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/handler.js#L39-L78)
* **Inputs**: Clean reaction category string `type`
* **Outputs**: Returns public URL of SFW anime GIF

```javascript
async function fetchGifUrl(category) {
  // 1. Attempts Nekos.best API
  try {
    const nekosCat = NEKOS_BEST_MAP[category] || category;
    const res = await axios.get(`https://nekos.best/api/v2/${nekosCat}`);
    if (res.data?.results?.[0]?.url) return res.data.results[0].url;
  } catch (err) { /* ... fallback warn */ }

  // 2. Attempts Waifu.pics API
  try {
    const waifuCat = WAIFU_PICS_MAP[category] || category;
    const res = await axios.get(`https://api.waifu.pics/sfw/${waifuCat}`);
    if (res.data?.url) return res.data.url;
  } catch (err) { /* ... fallback warn */ }
  
  throw new Error('All GIF endpoints failed.');
}
```

---

### Step 4: Formatting Conversion (FFmpeg)
* **File Path**: [handler.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/handler.js#L127-L160)
* **Inputs**: Downloads the target URL buffer and writes it locally to `/tmp`
* **Outputs**: Transcodes GIF file to H.264 MP4 container

```javascript
// Downloads media file
const bufferResponse = await axios.get(gifUrl, { responseType: 'arraybuffer' });
fs.writeFileSync(tempGif, Buffer.from(bufferResponse.data));

// Encodes using ffmpeg to meet WhatsApp playback specs (YUV420P profile, even height/width scales)
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
await execPromise(toMp4);
```

---

### Step 5: Delivering Payload and Cleanup
* **File Path**: [handler.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/handler.js#L162-L188)
* **Outputs**: Transmits the message attachment and deletes temporary workspace contents

```javascript
if (targeted) {
  await sock.sendMessage(chatId, {
    video: { url: tempVideo },
    gifPlayback: true,
    caption: `@${cleanSender} ${type}s @${cleanTarget} ${emoji}`,
    mentions: [resolvedSender, targetJid]
  }, quoteOption);
}
// ... removes temp files from OS temp directories in finally block:
if (fs.existsSync(tempGif)) fs.unlinkSync(tempGif);
if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo);
```

---

## 4. How to Modify
* **Add Reactions / Action Commands**: Insert a new object defining command type, target state, and emoji to the mapping inside [config.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/config.js).
* **Category Mappings & Fallbacks**: Adjust fallback endpoint translation values in [fallbacks.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/fallbacks.js).
* **FFmpeg Conversion Options**: Alter resolution, frame-rate limits, scale properties, or format encoding parameters within the execution command in [handler.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/handler.js#L155).
* **Nekos.best / Waifu.pics API Timeouts**: Change duration limit thresholds inside `fetchGifUrl` in [handler.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/handler.js#L43).
