# Character Command Flow (`character` / `char` / `stats`)

## 1. Description
The Character command allows players to inspect their RPG character stats, current level, progress, equipped gear, Zeni balance, and adventurer rank. It dynamically generates a graphical profile card using an image generation service if available, otherwise it falls back to a clean text-based message containing the player profile.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j character", ".j char", or ".j stats"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match checks (L6875-6885)
            └── core/commands/rpgCommands.js
                └── displayCharacterSheet(sock, chatId, senderJid, senderName) (L24)
                    ├── progression.getCharacterSheet(senderJid)
                    ├── economy.getUser(senderJid)
                    ├── classSystem.getClassById(sheet.class)
                    ├── progression.getBaseStats(senderJid, sheet.class)
                    ├── inventorySystem.getEquipment(senderJid)
                    ├── inventorySystem.getEquipmentStats(senderJid)
                    ├── profileHelper.buildCardData(senderJid, senderName, pfpUrl)
                    ├── goService.generateProfileCard(cardData)
                    └── sock.sendMessage(chatId, { image: cardBuffer, caption: msg, mentions })
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

#### Explanation
- Listens to incoming WhatsApp messages. It filters for new notifications and maps them for validation and routing.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6875-L6907)
* **Line Numbers**: 6875-6907
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and sender info
* **Outputs**: Redirects execution to `rpgCommands.displayCharacterSheet`

```javascript
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} character` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} char` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} stats` ||
                    isClassCmd
                  ) {
                    // ... (if isClassCmd logic)
                    await rpgCommands.displayCharacterSheet(
                      sock,
                      chatId,
                      senderJid,
                      senderName,
                    );
                    return;
                  }
```

#### Explanation
- Catches the prefix combined with `character`, `char`, or `stats`.
- Directs the execution flow to `rpgCommands.displayCharacterSheet()` by passing the active socket client, active chat JID, sender's WhatsApp JID, and sender's formatted profile name.

---

### Step 3: Fetching Profile Data
* **File Path**: [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L24-L39)
* **Line Numbers**: 24-39
* **Called From**: `displayCharacterSheet()`
* **Inputs**: `(sock, chatId, senderJid, senderName)`
* **Outputs**: Profile details (`sheet`, `economyUser`, `classData`, `stats`, `equipment`, `equipStats`)

```javascript
async function displayCharacterSheet(sock, chatId, senderJid, senderName) {
    const sheet = progression.getCharacterSheet(senderJid);
    const economyUser = economy.getUser(senderJid);
    
    if (!sheet || !economyUser) { 
        await sock.sendMessage(chatId, { 
            text: `❌ Not registered! Use \`${getPrefix()} register\` first.` 
        });
        return;
    }
    
    const classData = classSystem.getClassById(sheet.class);
    const stats = progression.getBaseStats(senderJid, sheet.class);
    const equipment = inventorySystem.getEquipment(senderJid);
    const equipStats = inventorySystem.getEquipmentStats(senderJid);
```

#### Explanation
1. Checks the player sheet inside the in-memory Cache mapping `progression.getCharacterSheet()`.
2. Inspects `economy.getUser()` to find the player's wallet balances.
3. If either check is missing, tells the user to register first.
4. Queries class metadata, base stats, and equipped items along with their stat modifiers.

---

### Step 4: Card Generation & Output Delivery
* **File Path**: [core/commands/rpgCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L40-L151)
* **Line Numbers**: 40-151
* **Called From**: `displayCharacterSheet()`
* **Inputs**: Fetched profile objects and JID
* **Outputs**: Dispatches image or formatted text to WhatsApp chat JID

```javascript
    // Handle PFP
    let pfpUrl;
    try { 
        pfpUrl = await sock.profilePictureUrl(senderJid, 'image');
    } catch (e) { 
        pfpUrl = null;
    }

    // Try Go Image Service first
    try {
        const cardData = await profileHelper.buildCardData(senderJid, senderName, pfpUrl);
        if (cardData) {
            const cardBuffer = await goService.generateProfileCard(cardData);
            if (cardBuffer) {
                let captionMsg = `👤 *Character:* ${cardData.nickname}\n` + ...;
                await sock.sendMessage(chatId, { 
                    image: cardBuffer,
                    caption: captionMsg,
                    mentions: [senderJid]
                });
                return;
            }
        }
    } catch (err) {
        console.error("Failed to generate Go character card:", err.message);
    }
    // Fallback text rendering if image generation fails...
```

#### Explanation
1. Obtains the player's current WhatsApp avatar JID URL.
2. Formats all statistics and invokes the Go Image Service (`goService.generateProfileCard()`) via HTTP/gRPC.
3. Sends the generated PNG image with a comprehensive statistics summary caption.
4. If image rendering fails, formats the details as a textual template and outputs it to the target conversation.

---

## 4. How to Modify
- **Base Level Scaling & Math**: Adjust base stat formulas inside [core/rpg/progression.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js).
- **Modify Go Profile Layout/Design**: The layout configuration for Go cards resides in [core/utils/goImageService.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/goImageService.js) and the associated profile card generation endpoint.
- **Change Class Modifiers**: Adjust stats and icons in [core/rpg/classSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/classSystem.js).
