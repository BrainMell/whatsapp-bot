# Media Search and Downloading Commands Flow (`audio`, `img`, `nsfw`, `18+`)

## 1. Description
The Media Search commands enable users to search, scrape, and download audio files and images from public online platforms (YouTube, Pinterest, Rule34, and PornPics) using an internal Go-based image and scrape service helper. 

---

## 2. Hierarchical Execution Tree
```text
User sends ".j audio Starboy"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── audio command matching (L5218)
            └── handleAudioCommand(sock, chatId, query, m) (L625)
                └── goService.getAudioInfo(query) (Queries YouTube Go service)
                └── axios.get(audioURL, { responseType: "arraybuffer" }) (Downloads audio)
                └── axios.get(metadata.thumbnail, { responseType: "arraybuffer" }) (Downloads cover)
                └── sock.sendMessage(chatId, { audio: audioBuffer, externalAdReply: { title, thumbnail, ... } })

User sends ".j img Goku"
└── core/engine.js
    └── img command matching (L5235)
        └── handleImgCommand(sock, chatId, query, m) (L684)
            └── goService.searchPinterest(query, 5) (Queries Pinterest crawler)
            └── Loops URLs: sock.sendMessage(chatId, { image: { url: imageUrl } })

User sends ".j nsfw tag" / ".j 18+ tag" (Age-restricted)
└── core/engine.js
    └── nsfw / 18+ command matching (L5251 / L5269)
        └── handleNsfwCommand(...) / handleAdultCommand(...) (L709 / L734)
            └── goService.searchRule34(query, 5) / goService.searchPornPics(query, 5)
            └── Loops URLs: sock.sendMessage(chatId, { image: { url: imageUrl } })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Audio Search and Download
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L625-L682)
* **Inputs**: Query string (e.g. song name `Starboy`)
* **Outputs**: Returns raw MP3 audio file with formatted audio player card metadata

```javascript
async function handleAudioCommand(sock, chatId, query, m) {
  // Queries YouTube video search and obtains converted MP3 stream download link
  const data = await goService.getAudioInfo(query);
  const { metadata, audioURL } = data;
  
  // Downloads audio stream buffer
  const response = await axios.get(audioURL, { responseType: "arraybuffer", timeout: 60000 });
  const audioBuffer = Buffer.from(response.data);

  // Fetch thumbnail to render in player card
  const thumbRes = await axios.get(metadata.thumbnail, { responseType: "arraybuffer" });
  const thumbnailBuffer = Buffer.from(thumbRes.data);

  await sock.sendMessage(chatId, {
    audio: audioBuffer,
    mimetype: "audio/mpeg",
    fileName: `${metadata.title}.mp3`,
    contextInfo: {
      externalAdReply: {
        title: metadata.title,
        body: `${metadata.author} | ${metadata.duration}`,
        thumbnail: thumbnailBuffer,
        mediaType: 2,
        mediaUrl: metadata.url,
        sourceUrl: metadata.url,
      }
    }
  }, { quoted: m });
}
```

---

### Step 2: Pinterest Image Scraping
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L684-L707)
* **Inputs**: Pinterest search term (e.g. `Goku`)
* **Outputs**: Posts up to 5 matching picture links as standard image attachments

```javascript
async function handleImgCommand(sock, chatId, query, m) {
  const data = await goService.searchPinterest(query, 5);
  const images = data.images || [];
  
  // Iterates and downloads each image url to post to group
  for (const img of images.slice(0, 5)) {
    await sock.sendMessage(chatId, { image: { url: img } }, { quoted: m });
  }
}
```

---

### Step 3: Adult Content Scrapers (NSFW / 18+)
* **File Path**: [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L709-L757)
* **Inputs**: NSFW keyword query tag
* **Outputs**: Scraping and delivering up to 3 age-restricted images

* **For Rule34 (`nsfw`)**:
  ```javascript
  const data = await goService.searchRule34(query, 5);
  const images = data.images || [];
  for (const img of images.slice(0, 3)) {
    await sock.sendMessage(chatId, { image: { url: img } }, { quoted: m });
  }
  ```
* **For PornPics (`18+`)**:
  ```javascript
  const data = await goService.searchPornPics(query, 5);
  const images = data.images || [];
  for (const img of images.slice(0, 3)) {
    await sock.sendMessage(chatId, { image: { url: img } }, { quoted: m });
  }
  ```

---

## 4. How to Modify
* **Customize Image / Scraped Limit count**: Modify the slice parameters (currently `5` for Pinterest, and `3` for NSFW/Adult content) inside their respective handlers in [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L693).
* **Audio Download Timeout**: Adjust the axios download timeout duration (currently `60000` ms / 60 seconds) in [engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L643).
* **Service Endpoint Mappings**: The internal crawl pathways are handled by `GoImageService` imported from [goImageService.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/goImageService.js). Inspect that file to alter base scrape URLs.
