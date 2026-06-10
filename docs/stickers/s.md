# Stickers Creation and Media Conversion Flow

## 1. Description
The Stickers module provides a full suite of sticker creation and media conversion capabilities. It allows users to convert images/videos to static or animated stickers (`s`) with complex filters (e.g. crop-center, circle masks, blurred background overlay, and slow spin animation). It also allows stickers to be converted back into standard images (`toimg`) or videos (`tovid`), and supports customized metadata naming (`setpack`, `setauthor`).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j s" (or .j s -bb, -spin, etc. by replying to media)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── sticker matching: if (lowerTxt === ".j s" || startsWith(".j s -")) (L6206)
            └── downloadMediaMessage(quotedMsg, "buffer") (L6301)
            └── fs.writeFileSync(inputPath, buffer) (L6334)
            └── FFmpeg processing based on flag (L6351 - L6435)
                └── circle mask geq alpha rewrite (L6412)
                └── background blur complex overlay (L6358)
                └── transposition / spin loops (L6368 / L6407)
            └── new Sticker(processedBuffer, metadata) (L6456)
            └── sock.sendMessage(chatId, stickerMessage) (L6463)
            └── fs.unlinkSync(inputPath / outputPath)

User sends ".j toimg" (replying to sticker)
└── core/engine.js
    └── toimg command matching (L6658)
        └── downloadMediaMessage(...) (L6689)
        └── execPromise("ffmpeg -i tempSticker -vframes 1 tempImage") (L6720)
        └── sock.sendMessage(chatId, { image: tempImage }) (L6723)
        └── fs.unlinkSync(tempSticker / tempImage)

User sends ".j tovid" (replying to sticker)
└── core/engine.js
    └── tovid command matching (L6757)
        └── downloadMediaMessage(...) (L6787)
        └── execPromise("ffmpeg -i tempSticker -vf fps=20... tempGif") (L6820)
        └── execPromise("ffmpeg -i tempGif ... tempVideo") (L6833)
        └── sock.sendMessage(chatId, { video: tempVideo, gifPlayback: true }) (L6837)
        └── fs.unlinkSync(tempSticker / tempGif / tempVideo)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Sticker Request Parsing and Flags Extraction
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6206-L6288)
* **Inputs**: Command string `lowerTxt` and message media attachments
* **Outputs**: Maps formatting flags (`isCircle`, `isBlurBg`, `isSpin`, etc.) and triggers download pipeline

```javascript
const flagPart = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} s`, "").trim();
const isFull = flagPart === "-f";
const isCropCenter = flagPart === "-c";
const isBlurBg = flagPart === "-bb";
const isCircle = flagPart === "-r";
const isSpin = flagPart === "-spin"; // ... maps all remaining flags
```

---

### Step 2: Media Download and File Writing
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6295-L6334)
* **Inputs**: Quoted message context or main message
* **Outputs**: Writes media buffer to `./temp` directory

```javascript
let buffer = await downloadMediaMessage(downloadMsg, "buffer", {}, { reuploadRequest: sock.updateMediaMessage });
// ... fallback to downloadContentFromMessage stream reader if direct buffer failed
const inputPath = `./temp/stick_in_${ts}${type === "image" ? ".jpg" : ".mp4"}`;
const outputPath = `./temp/stick_out_${ts}.webp`;
fs.writeFileSync(inputPath, buffer);
```

---

### Step 3: FFmpeg Transcoding and Complex Filter Graphs
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6336-L6445)
* **Inputs**: Path of downloaded media input file
* **Outputs**: Compiles and executes FFmpeg command producing standard WebP outputs

* **For Circle Mask (`isCircle`)**:
  ```javascript
  filter = [
    "format=rgba",
    "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
    "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*lte((X-256)*(X-256)+(Y-256)*(Y-256),65536)'"
  ].join(",");
  ```
* **For Blurred Background Overlay (`isBlurBg`)**:
  ```javascript
  const cf = `[0:v]scale=512:512:force_original_aspect_ratio=increase,crop=512:512,boxblur=20:20[bg];` +
             `[0:v]scale=512:512:force_original_aspect_ratio=decrease[fg];` +
             `[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=12[out]`;
  ```
* **Executes compiler block**:
  ```javascript
  ffmpegCmd = `"${FFMPEG_PATH}" -i "${inputPath}" ${vf} -vframes 1 -c:v libwebp -pix_fmt yuva420p -lossless 0 -compression_level 6 -q:v 75 -y "${outputPath}"`;
  await execPromise(ffmpegCmd);
  ```

---

### Step 4: Metadata Overlay and Response Delivery
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6447-L6477)
* **Inputs**: Output WebP file path and custom pack settings from system database
* **Outputs**: Formats sticker metadata and posts sticker payload to group chat

```javascript
const customPack = system.get(`sticker_pack_name_${BOT_ID}`);
const customAuthor = system.get(`sticker_author_name_${BOT_ID}`);

const sticker = new Sticker(buffer, {
  pack: customPack || `${botConfig.getBotName()} Pack 🃏`,
  author: customAuthor || m.pushName || `${botConfig.getBotName()} User`,
  type: StickerTypes.DEFAULT,
  quality: 70,
});

await sock.sendMessage(chatId, await sticker.toMessage(), { quoted: m });
```

---

### Step 5: Sticker to Image/Video Reversions
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6657-L6869)
* **Inputs**: Quoted WebP sticker message
* **Outputs**: Returns extracted PNG file or H.264 MP4 loop

* **Extracting Static Frame (`toimg`)**:
  ```javascript
  const cmd = `"${FFMPEG_PATH}" -i "${tempSticker}" -vf "scale=512:512:force_original_aspect_ratio=decrease" -vframes 1 -y "${tempImage}"`;
  await execPromise(cmd);
  ```
* **Converting WebP Animation (`tovid`)**:
  ```javascript
  const toGif = `"${FFMPEG_PATH}" -i "${tempSticker}" -vf "fps=20,scale=512:-1:flags=lanczos" -y "${tempGif}"`;
  await execPromise(toGif);
  const toMp4 = `"${FFMPEG_PATH}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
  await execPromise(toMp4);
  ```

---

## 4. How to Modify
* **Customize Global Default Metadata**: Modify the database values using commands `.j setpack <name>` and `.j setauthor <author>`. These settings write to keys `sticker_pack_name_${BOT_ID}` and `sticker_author_name_${BOT_ID}` inside [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6626).
* **Adjust Output WebP Quality**: Change WebP quality factor (currently `70`) inside [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6460).
* **Change Video Sticker Duration Limits**: Modify the clip length duration parameter `-t 5` (currently 5 seconds maximum) inside [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6363).
* **Adjust WebP-to-GIF Conversion Frame-Rate**: Modify `fps=20` to higher/lower values inside `tovid` block in [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6820).
