# RPG Subsystem: Profile Cards

## 1. Description
The Profile Cards Subsystem manages compilation, rendering, and delivery of character sheets as graphical profile cards. When players execute profile commands, the system polls character info, stats, rank progression, and active gear assets from MongoDB collections (`users`, `inventories`). It compiles this data into a JSON payload and dispatches it via an HTTP POST request to an external Go image rendering microservice. The microservice processes the payload to construct a custom composite image (including the player's WhatsApp profile picture), returning the binary card stream, which is sent back to the chat using Baileys WebSockets.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j profile"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection (L4558)
        └── primaryCmd check: if (primaryCmd === "profile") (L4617)
            └── core/commands/rpgCommands.js
                └── displayProfile(sock, chatId, senderJid, senderName) (L40)
                    └── sock.profilePictureUrl(senderJid, 'image')
                    └── profileHelper.buildCardData(senderJid, senderName, pfpUrl)
                    └── goService.generateProfileCard(cardData)
                    └── sock.sendMessage(chatId, { image: cardBuffer, ... })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: `core/engine.js`
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Defined In**: `core/engine.js`
* **Inputs**: `{ messages, type }` payload from WhatsApp
* **Outputs**: None (passes control to inner map)

```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify" && type !== "append") return;
  if (isRekeying) return;

  await Promise.all(
    messages.map(async (m) => {
      if (!m.message) return;
```

#### Explanation
- `sock.ev.on("messages.upsert", ...)`: Registers a listener that fires whenever the bot receives new message notifications.
- `if (type !== "notify" && type !== "append") return`: Drops status updates or metadata modifications to only process actual incoming messages.
- `if (isRekeying) return`: Prevents processing when the session encryption keys are refreshing.
- `messages.map(...)`: Iterates over the batch of received messages to process them in parallel.

---

### Step 2: Command Matching
* **File Path**: `core/engine.js`
* **Line Numbers**: 4558-4564
* **Called From**: Inner message processor loop
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: `primaryCmd` and `cmdArgs` array

```javascript
if (lowerTxt.startsWith(currentPrefix)) {
  const cmdBody = lowerTxt
    .substring(currentPrefix.length)
    .trim();
  const cmdArgs = cmdBody.split(" ");
  const primaryCmd = cmdArgs[0];
```

#### Explanation
- `lowerTxt.startsWith(currentPrefix)`: Checks if the incoming text begins with the configured bot prefix (e.g. `.j`).
- `lowerTxt.substring(...)`: Strips the prefix from the message.
- `cmdBody.split(" ")`: Splits the command body by spaces to separate the command name from its arguments.
- `cmdArgs[0]`: Assigns the first element as `primaryCmd` (e.g. `"profile"`).

---

### Step 3: Command Routing for Profile
* **File Path**: `core/engine.js`
* **Line Numbers**: 4617-4623
* **Called From**: Command routing block in `engine.js`
* **Imported From**: `const rpgCommands = require("./commands/rpgCommands");`
* **Inputs**: `sock`, `chatId`, `senderJid`, `senderName`
* **Outputs**: Promise resolved by `rpgCommands.displayProfile`

```javascript
if (
  primaryCmd === "profile" ||
  primaryCmd === "me" ||
  primaryCmd === "whois"
) {
  await rpgCommands.displayProfile(sock, chatId, senderJid, senderName);
  return;
}
```

#### Explanation
- `if (primaryCmd === "profile" || ...)`: Matches the profile trigger keywords.
- `rpgCommands.displayProfile(...)`: Routes control to the RPG commands module with active session parameters.

---

### Step 4: Card Generation Orchestration
* **File Path**: `core/commands/rpgCommands.js`
* **Line Numbers**: Around 40-72
* **Called From**: `core/engine.js`
* **Imported From**: `core/utils/profileHelper.js`, `core/utils/goImageService.js`
* **Inputs**: `(sock, chatId, senderJid, senderName)`
* **Outputs**: Fetches properties, calls rendering pipeline, and sends image to chat

```javascript
async function displayProfile(sock, chatId, senderJid, senderName) {
  let pfpUrl;
  try { 
    pfpUrl = await sock.profilePictureUrl(senderJid, 'image');
  } catch (e) { 
    pfpUrl = null;
  }

  try {
    const cardData = await profileHelper.buildCardData(senderJid, senderName, pfpUrl);
    if (cardData) {
      const cardBuffer = await goService.generateProfileCard(cardData);
      if (cardBuffer) {
        return await sock.sendMessage(chatId, { 
          image: cardBuffer,
          caption: `👤 *Character:* ${cardData.nickname}`,
          mentions: [senderJid]
        });
      }
    }
  } catch (err) {
    console.error("Failed to generate profile card:", err.message);
  }
}
```

#### Explanation
- `sock.profilePictureUrl(...)`: Leverages Baileys client connection to fetch the user's public avatar URL from the WhatsApp CDN.
- `profileHelper.buildCardData(...)`: Compiles user database properties, levels, gear, stats, and Zeni into a flat JSON payload.
- `goService.generateProfileCard(...)`: Transmits the payload via HTTP POST to the Go image microservice, which returns the binary buffer representation of the card.
- `sock.sendMessage(...)`: Sends the resulting profile card image back to WhatsApp.

---

## 4. How to Modify
To adjust profile image generation timeouts or base paths, modify `goImageService.js`:

```javascript
// BEFORE:
const response = await this.client.post("/api/cards/profile", data, {
  timeout: 45000,
});

// AFTER:
const response = await this.client.post("/api/cards/profile", data, {
  timeout: 60000, // Extends rendering wait to 60 seconds
});
```
