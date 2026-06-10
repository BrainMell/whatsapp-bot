# NSFW and Adult Search Command Flow (`nsfw` / `18+`)

## 💡 Noob-Friendly Explanation
* **What it does**: The bot has built-in image scrapers that search for adult/NSFW content on public platforms and deliver the images directly to your chat.
* **How to use it**:
  * **Rule34/General Search**: `.j nsfw 5 anime` (fetches up to 5 Rule34 results matching "anime").
  * **PornPics Search**: `.j 18+ cosplay` (fetches up to 10 PornPics results matching "cosplay").
* **Under the Hood (Simple)**: When you run these commands, the bot triggers custom web scrapers. The `18+` command queries PornPics, and the `nsfw` command queries Rule34. The bot downloads the image URLs, filters out any broken links, and posts them one by one to the WhatsApp chat using a short delay to avoid spamming the connection.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🔞 ADULT SEARCH: User sends ".j 18+ cosplay"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: primaryCmd === "18+" (L10593)
            ├── Extract search term: "cosplay" (L10600)
            ├── Trigger scraper: scrapePornPics(searchTerm, 10) (L10625)
            │   └── Fetches matches from PornPics site
            ├── Verify image results array size > 0 (L10627)
            └── Loop and send each image URL via socket (L10641)
                └── sock.sendMessage(chatId, { image: { url: img } })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Parsing the NSFW/18+ Request
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L10599-L10617)
* **Inputs**: Command parameters and search terms
* **Outputs**: Directs execution to target adult content scraper

```javascript
const searchTerm = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} 18+`, "").trim();
if (!searchTerm) {
  // Sends usage instructions if no search term provided
  return;
}
```

### Step 2: Triggering the PornPics/Rule34 Scraper
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L10625)
* **Inputs**: Query string and maximum count
* **Outputs**: Returns a listing of image file URLs

```javascript
const images = await scrapePornPics(searchTerm, 10);
if (images.length === 0) {
  return reply("❌ No results found.");
}
```

### Step 3: Paging and Emitting the Scraped Media
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L10641-L10652)
* **Inputs**: Binary array of URLs, WhatsApp client socket, and target JID
* **Outputs**: Sends image messages sequentially with a 150ms delay interval

```javascript
for (const img of images) {
  try {
    await sock.sendMessage(chatId, { image: { url: img } }, { quoted: m });
    await new Promise((res) => setTimeout(res, 150)); // prevent socket blocking
  } catch (e) {
    console.log("Skipping broken image...");
  }
}
```

---

## 4. How to Modify
* **Change Scraping Limit**: Modify the maximum count parameter (currently capped at 10) in `engine.js` around line 10705.
* **Customize Scraper Site Fallbacks**: Add new websites or custom endpoints inside `scrapePornPics` or `scrapeFromDefaultSite` functions within the scraper utils.
* **Toggle Safety Gate**: Add chat or user verification gates to prevent these commands from executing in specific family chats.
