# Anime Search and Discovery Command Flow (`anime`, `search`)

## 1. Description
The Anime Search commands query the MyAnimeList database (via the Jikan v4 API) to retrieve details, rankings, news, trending lists, and episode links for anime. It supports complex multi-stage command responses where users search for a keyword and then reply with a number (e.g. `1` to `15`) to fetch the synopsis, ranking stats, and direct episode streaming links (resolved through Anime Kai).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j anime search Naruto" (or ".j search Naruto")
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── anime command matching (L5157)
            └── handleAnimeSearch(sock, chatId, query, m) (L297)
                └── axios.get("https://api.jikan.moe/v4/anime?q=...") (MAL API)
                └── global[`__${BOT_ID}_anime_search_cache_by_chat`].set(chatId, cacheData)
                └── global[`__${BOT_ID}_anime_search_cache_by_msgid`].set(msgId, cacheData)
                └── sock.sendMessage(chatId, { text: listMenu })

User replies to the search result list with "1"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Numeric selection matching (L4484)
            └── Retrieves cached results from `global.__<BOT_ID>_anime_search_cache_by_msgid/chat`
            └── getAnikaiBestMatch(animeTitle) (L285) (Resolves watch link)
            └── sendImageSafe(sock, chatId, imageUrl, caption)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Initial Keyword Query
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L297-L327)
* **Inputs**: Query keyword string (e.g. `Naruto`)
* **Outputs**: Array of up to 15 matching anime results from the Jikan API

```javascript
async function handleAnimeSearch(sock, chatId, query, m) {
  // Respects rate limits to Jikan API (3 requests/second)
  await new Promise((r) => setTimeout(r, 1000));
  
  // Queries Jikan API (falls back from got-scraping to standard Axios if blocked)
  const r = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}`);
  const list = r.data.data || [];
  
  if (!list.length) return reply("No results found.");
  // ... formats list menu with title and type metadata
}
```

---

### Step 2: Session Caching
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L335-L358)
* **Inputs**: Search results list array and message metadata
* **Outputs**: Updates global memory maps to remember search context for 5 minutes

```javascript
const cacheData = {
  ts: Date.now(),
  results: list,
  downloadFn: getAnikaiLink,
};
global[`__${BOT_ID}_anime_search_cache_by_chat`].set(chatId, cacheData);
global[`__${BOT_ID}_anime_search_cache_by_msgid`].set(sentMenu.key.id, cacheData);

// Automatically clears cache after 5 minutes
setTimeout(() => {
  global[`__${BOT_ID}_anime_search_cache_by_chat`].delete(chatId);
  global[`__${BOT_ID}_anime_search_cache_by_msgid`].delete(sentMenu.key.id);
}, 300000);
```

---

### Step 3: Resolving Selection Replies
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4483-L4507)
* **Inputs**: User sends a standalone number message (e.g. `1`) quoting the bot's search list
* **Outputs**: Retrieves matching index from the cache map

```javascript
const idx = parseInt(numOnly[1], 10);
let cached = null;
const quotedId = getQuotedMessageId(m);

if (quotedId && global[`__${BOT_ID}_anime_search_cache_by_msgid`].has(quotedId)) {
  cached = global[`__${BOT_ID}_anime_search_cache_by_msgid`].get(quotedId);
} else if (global[`__${BOT_ID}_anime_search_cache_by_chat`].has(chatId)) {
  cached = global[`__${BOT_ID}_anime_search_cache_by_chat`].get(chatId);
}
```

---

### Step 4: Scraping Streaming Links and Responding
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4509-L4540)
* **Inputs**: Cached result list and index selection
* **Outputs**: Fetches watch link from Anime Kai, downloads poster image, and replies to user

```javascript
if (cached && idx >= 1 && idx <= cached.results.length) {
  const a = cached.results[idx - 1];
  
  let downloadLink = "";
  try {
    downloadLink = await getAnikaiBestMatch(a.title); // Resolves watch link
  } catch (resErr) {
    // Fallback to slug generator if scraper fails
    downloadLink = `https://anikai.to/watch/${a.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}-episode-1`;
  }
  
  const caption = `🎬 *Title:* ${a.title}\n⭐ *Score:* ${a.score}\n📖 *Synopsis:* ${a.synopsis.slice(0, 400)}...\n📥 *WATCH:* ${downloadLink}`;
  const imageUrl = a.images?.jpg?.large_image_url;
  await sendImageSafe(sock, chatId, imageUrl, caption, m);
}
```

---

## 4. How to Modify
* **Search Session Timeout**: Modify the cache expiration delay (currently `300000` ms / 5 minutes) in [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L354).
* **Jikan API Rate Limits**: Change the rate-limiting delay between MAL API requests (currently `1000` ms) in [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L301).
* **Anime Kai Watch Link Slugs**: Modify how fallback watch URLs are structured inside `getAnikaiLink` in [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L275-L281).
* **Trending/Airing Display Limit**: Change Jikan limit parameter inside `handleAnimeTrending` (currently `20`) or `handleAnimeAiring` (currently `12`) inside [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L373).
