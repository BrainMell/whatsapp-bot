# Balance Command Flow (`balance`, `bal`, `money`)

## 1. Description
The Balance command displays the user's current Wallet, Bank, Frozen Assets, and Total wealth. It renders a graphic balance card using an external image generation microservice (Go service) or falls back to text formatted with a local Zeni logo asset.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j balance" or ".j bal" or ".j money"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "balance" || "bal" || "money") (L14526)
            └── Check registration: economy.isRegistered(senderJid) (L14532)
            └── core/rpg/economy.js
                └── getBankBalance(senderJid) (L768)
                    └── getUser(senderJid) (L261)
            └── try: Generate graphic via Go service
                └── goService.generateEconomyCard(data) (L14564)
                └── sock.sendMessage(chatId, { image: cardBuffer, caption: ... })
            └── catch/fallback:
                └── Read local asset: fs.readFileSync("assets/zeni.png") (L14597)
                └── sock.sendMessage(chatId, { image: zeniImage, caption: balText })
                └── OR sock.sendMessage(chatId, { text: balText })
            └── awardProgression(senderJid, chatId) (L14607)
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
- Listens to incoming messages from Baileys. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching and Registration Validation
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14526-L14539)
* **Line Numbers**: 14526-14539
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Rejects request if user is not registered

```javascript
                  // ${botConfig.getPrefix().toLowerCase()} balance / ${botConfig.getPrefix().toLowerCase()} bal - Check your balance
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} balance` ||
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} bal` ||
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} money`
                  ) {
                    if (!economy.isRegistered(senderJid)) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\``,
                      });
                      return;
                    }
```

#### Explanation
- Matches commands `.j balance`, `.j bal`, or `.j money`.
- Checks if the user is registered. If they are not registered in the system, it halts execution and replies with the registration guide.

---

### Step 3: Fetch Balance Details
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L768-L778)
* **Line Numbers**: 768-778
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId)`
* **Outputs**: `{ wallet: number, bank: number, total: number }`

```javascript
function getBankBalance(userId) {
  const user = getUser(userId);
  if (!user) return { wallet: 0, bank: 0, total: 0 };
  
  return {
    wallet: user.wallet,
    bank: user.bank,
    total: user.wallet + user.bank
  };
}
```

#### Explanation
- Retrieves the user state object from the cache.
- Extracts `wallet` and `bank` properties and returns the calculated sum as `total`.

---

### Step 4: Render Profile Card (Go Service Graphic Card)
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14557-L14586)
* **Line Numbers**: 14557-14586
* **Called From**: `engine.js`
* **Inputs**: Nickname, wallet, bank, total, frozen assets, rank, level, and profile picture URL
* **Outputs**: Formatted image buffer of the balance card

```javascript
                    // Try to use the Go image service for a beautiful economy card
                    try {
                      let pfpUrl = "";
                      try {
                        pfpUrl = await sock.profilePictureUrl(senderJid, "image");
                      } catch (e) {}

                      const cardBuffer = await goService.generateEconomyCard({
                        nickname: user.nickname || senderJid.split("@")[0],
                        wallet: balance.wallet || 0,
                        bank: balance.bank || 0,
                        total: balance.total || 0,
                        frozen:
                          (user.frozenAssets?.wallet || 0) +
                          (user.frozenAssets?.bank || 0),
                        zeniSymbol: economy.getZENI(),
                        rank: user.adventurerRank || "F",
                        level: progression.getLevel(senderJid),
                        pfpUrl: pfpUrl,
                      });
                      if (cardBuffer) {
                        await sock.sendMessage(chatId, {
                          image: cardBuffer,
                          caption:
                            BOT_MARKER + `💰 *${user.nickname || "Balance"}*`,
                          mentions: [senderJid],
                        });
                        await awardProgression(senderJid, chatId);
                        return;
                      }
                    } catch (imgErr) {
                      console.log(
                        "[Balance] Go image service unavailable, using fallback:",
                        imgErr.message,
                      );
                    }
```

#### Explanation
- Tries to fetch the user's WhatsApp profile picture URL.
- Contacts `goService.generateEconomyCard` (defined in Go backend helper) to generate an image card containing user stats and levels.
- Sends the image directly to WhatsApp. If the service fails, it falls back to the text/static asset method.

---

### Step 5: Fallback Message Rendering
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14593-L14609)
* **Line Numbers**: 14593-14609
* **Called From**: `engine.js` (Catch block of Go service)
* **Inputs**: Formatted text `balText`
* **Outputs**: Text message sent to WhatsApp group, optionally with Zeni asset image

```javascript
                    // Fallback: text or static image
                    const zeniPath = botConfig.getAssetPath("zeni.png");
                    if (fs.existsSync(zeniPath)) {
                      await sock.sendMessage(chatId, {
                        image: fs.readFileSync(zeniPath),
                        caption: BOT_MARKER + balText,
                        mentions: [senderJid],
                      });
                    } else {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + balText,
                        mentions: [senderJid],
                      });
                    }
                    await awardProgression(senderJid, chatId);
                    return;
```

#### Explanation
- Checks if a static `zeni.png` exists in the local assets.
- If it exists, sends that image with the balance text as a caption. Otherwise, sends the raw balance string.
- Grants player progression XP/points.

---

## 4. How to Modify
To adjust the presentation or change the image card styles:
- **Configure Balance Graphic Card Design**: Modify the balance card parameters sent to `generateEconomyCard` in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14564).
- **Modify Fallback Text Format**: Adjust the `balText` string layout in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14544-L14555).
- **Zeni Symbol Currency Override**: Change currency configurations in `botConfig.js`.
