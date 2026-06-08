# Media Subsystem: Sticker & GIF Conversion

## What it is
The Media Subsystem facilitates conversion between static/animated images, videos, GIFs, and WhatsApp stickers. It leverages FFmpeg installed on the host OS to execute fast transcoding operations (like encoding to H.264 MP4 or WebP formats). The subsystem runs dynamically when triggered by commands such as `.s`, `.sticker`, or user reaction categories (e.g., hugging, hitting) from the waifu/neko APIs. In-memory temporary files are created under a designated scratch directory during transcoding, and the completed files are delivered to the recipient over Baileys WebSockets before being discarded.

## How it works

**FFmpeg Image to Sticker Conversion** — [engine.js L1932-L1943](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1932-L1943)
```javascript
    async function imageToSticker(inputPath, outputPath) {
      try {
        const cmd = `${FFMPEG_PATH} -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1" -c:v libwebp -preset drawing -loop 0 -q:v 75 -an "${outputPath}"`;

        await execPromise(cmd);

        return true;
      } catch (err) {
        console.error("Error converting image to sticker, sum fucked up:", err);
        return false;
      }
    }
```
This utility function executes an FFmpeg process to resize and crop a static or animated image to a exact 512x512 canvas size (the standard size for WhatsApp stickers). It transcodes the file into the WebP format, stripping out any audio tracks (`-an`) and compressing the output at a quality factor of 75.

---

**Reaction GIF Fetching and Conversion** — [handler.js L153-L176](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/handler.js#L153-L176)
```javascript
    // Convert GIF to MP4 using FFmpeg (H.264 video encoding suitable for WhatsApp)
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
    await execPromise(toMp4);

    if (!fs.existsSync(tempVideo)) {
      throw new Error('FFmpeg conversion failed to produce an MP4 file');
    }

    if (targeted) {
      await sock.sendMessage(chatId, {
        video: { url: tempVideo },
        gifPlayback: true,
        caption: `@${cleanSender} ${type}s @${cleanTarget} ${emoji}`,
        mentions: [resolvedSender, targetJid]
      }, quoteOption);
    } else {
      await sock.sendMessage(chatId, {
        video: { url: tempVideo },
        gifPlayback: true,
        caption: `@${cleanSender} ${type} ${emoji}`,
        mentions: [resolvedSender]
      }, quoteOption);
    }
```
This snippet is located inside the reactions command handler. After downloading a raw animated GIF asset from Waifu.pics or Nekos.best APIs, it converts the GIF into an MP4 container file using H.264 visual encoding with a YUV420p pixel format. This specific format is required by Baileys and the WhatsApp client to correctly display the video as an inline looping GIF.

---

**Sticker Search (Klipy)** — [engine.js L2074-L2083](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L2074-L2083)
```javascript
    async function searchStickers(query, count = 10) {
      try {
        console.log(`🔍 Sticker Search (Go Service): ${query}`);
        const result = await goService.searchStickers(query, count);
        return result.stickers || [];
      } catch (err) {
        console.error("❌ Sticker Error:", err.message);
        return [];
      }
    }
```
This asynchronous routine communicates with a local/external Go Image Service proxy. It requests sticker results matching a user-specified search term. The search returns metadata containing URLs to sticker assets from the Klipy index, which are then passed down the pipeline for download and transcoding.

## How to modify it
To modify conversion quality or parameters, developers can alter command variables within the FFmpeg commands.

```javascript
// BEFORE (engine.js L1934)
const cmd = `${FFMPEG_PATH} -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1" -c:v libwebp -preset drawing -loop 0 -q:v 75 -an "${outputPath}"`;
```
```javascript
// AFTER (engine.js L1934)
const cmd = `${FFMPEG_PATH} -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1" -c:v libwebp -preset drawing -loop 0 -q:v 90 -an "${outputPath}"`; // Increased WebP quality to 90
```

```javascript
// BEFORE (handler.js L155)
const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
```
```javascript
// AFTER (handler.js L155)
const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:1.0:5:5:0.0" -y "${tempVideo}"`; // Added unsharp filter to enhance video details
```

## Common tasks
- **Modify FFmpeg WebP encoding quality** — Adjust the visual quality of the output sticker by changing the `-q:v` parameter in [engine.js L1934](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1934).
- **Adjust GIF to MP4 scaling filters** — Change the scaling and resolution parameters in the FFmpeg command within [handler.js L155](file:///home/mellow/Desktop/Joker/whatsapp-bot/reactions/handler.js#L155).
- **Configure the Sticker search limit** — Adjust the default count of sticker results returned from Klipy in [engine.js L2074](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L2074).
- **Modify sticker conversion aspect ratio handling** — Edit the scale filter logic in [engine.js L1934](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1934).
