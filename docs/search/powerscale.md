# VS Battles Powerscaling Command Flow (`powerscale`)

## 1. Description
The `powerscale` command allows users to look up power tiers, speed, stamina, durability, attack potency, and equipment details for fictional characters from the VS Battles Wiki. The process consists of a keyword search returning a list of character matches, followed by a numerical reply selection that triggers scraping of the character's detailed wiki stats and poster image.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j powerscale Goku"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── powerscale command matching (L5286)
            └── core/utils/powerscale.js
                └── getPowerScale(characterName, chatId) (L18)
                    └── goService.searchPowerscale(characterName) (Queries VSB Search)
                    └── pendingSelections.set(chatId, { characters, timestamp })
                    └── sock.sendMessage(chatId, { text: resultListMenu })

User replies with standalone number "1"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── numOnly matching (L4420)
            └── hasPendingSelection(chatId) (L140)
            └── handlePowerscaleSelection(chatId, selectedNumber) (L65)
                └── goService.fetchPowerscalePage(characterUrl) (Scrapes character stats)
                └── pendingSelections.delete(chatId) (Cleans session)
            └── axios.get(result.imageUrl, { responseType: "arraybuffer" }) (Downloads image)
            └── sock.sendMessage(chatId, { image: imageBuffer, caption: statsText })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Query Execution and Search
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5286-L5339)
* **Inputs**: Target character string `character`
* **Outputs**: Returns list of character records matching the query from the VS Battles Wiki search API

```javascript
if (primaryCmd === "powerscale") {
  const character = cmdArgs.slice(1).join(" ").trim();
  // ... sends "Searching VS Battles Wiki..." reaction and message
  const result = await getPowerScale(character, chatId);
  // ... sends results list to WhatsApp
  return;
}
```

Inside `getPowerScale`:
```javascript
async function getPowerScale(characterName, chatId) {
  const data = await goService.searchPowerscale(characterName);
  if (!data || !data.characters.length) return { success: false, error: "No results found." };
  
  // Format list items: 1. Goku (Universe 7), 2. Goku Black, etc.
  pendingSelections.set(chatId, {
    characters: data.characters,
    timestamp: Date.now()
  });
  // ... schedules automatic cleanup timeout after 5 minutes
  return { success: true, message, isPending: true };
}
```

---

### Step 2: Session Interception
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4420-L4432)
* **Inputs**: standalone numeric message `selectedNumber`
* **Outputs**: Directs matching input to selection handler

```javascript
if (numOnly) {
  if (hasPendingSelection(chatId)) {
    const selectedNumber = numOnly[1];
    const result = await handlePowerscaleSelection(chatId, selectedNumber);
    // ...
  }
}
```

---

### Step 3: Statistics Scraping
* **File Path**: [powerscale.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L65-L135)
* **Inputs**: `(chatId, selection)`
* **Outputs**: JSON object consisting of character attributes parsed from the VS Battles Wiki page

```javascript
async function handlePowerscaleSelection(chatId, selection) {
  const pending = pendingSelections.get(chatId);
  // ... validates selection index
  const chosen = pending.characters[idx - 1];
  pendingSelections.delete(chatId); // clear pending
  
  // Queries crawler to scrape statistics of the character URL
  const data = await goService.fetchPowerscalePage(chosen.url);
  const stats = data.stats || {};
  
  let message = `[ POWER SCALING: ${data.name.toUpperCase()} ]\n\n`;
  if (stats['Tier']) message += `TIER: ${stats['Tier']}\n`;
  if (stats['Attack Potency']) message += `Attack Potency: ${stats['Attack Potency']}\n`;
  // ... Appends Speed, Durability, Stamina, Equipment
  
  return { success: true, message, imageUrl: data.imageUrl };
}
```

---

### Step 4: Display Poster and Stats
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4441-L4468)
* **Inputs**: Result payload including `imageUrl` and formatted `message`
* **Outputs**: Sends image file with stats caption, and updates progression rewards

```javascript
if (result.imageUrl) {
  const imageResponse = await axios.get(result.imageUrl, { responseType: "arraybuffer", timeout: 15000 });
  await sock.sendMessage(chatId, {
    image: Buffer.from(imageResponse.data),
    caption: BOT_MARKER + result.message,
  });
}
await awardProgression(senderJid, chatId);
```

---

## 4. How to Modify
* **Selection Expiry Timeout**: Modify selection lifetime (currently `5 * 60 * 1000` ms / 5 minutes) in [powerscale.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L10).
* **Displayed Stat Attributes**: Modify which properties are shown or customize their headers in `handlePowerscaleSelection` in [powerscale.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L106-L121).
* **Vessel/Web Scraping Base**: VSB search query and extraction are processed by the scraper service. Edit [goImageService.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/goImageService.js) to configure backend routes.
