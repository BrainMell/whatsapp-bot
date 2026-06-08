# RPG Subsystem: Profile Cards

## What it is
The Profile Cards Subsystem manages compilation, rendering, and delivery of character sheets as graphical profile cards. When players execute profile commands, the system polls character info, stats, rank progression, and active gear assets from MongoDB collections (`users`, `inventories`). It compiles this data into a JSON payload and dispatches it via an HTTP POST request to an external Go image rendering microservice. The microservice processes the payload to construct a custom composite image (including the player's WhatsApp profile picture), returning the binary card stream, which is sent back to the chat using Baileys WebSockets.

## How it works

**JSON Card Data Compilation** — [profileHelper.js L8–77](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/profileHelper.js#L8-L77)
```javascript
async function buildCardData(userId, userName, pfpUrl = "") {
    // Initialize class if needed
    economy.initializeClass(userId);

    const sheet = progression.getCharacterSheet(userId);
    const economyUser = economy.getUser(userId);
    if (!sheet || !economyUser) {
        return null;
    }

    const classData = classSystem.getClassById(sheet.class);
    const stats = progression.getBaseStats(userId, sheet.class);
    const equipment = inventorySystem.getEquipment(userId);
    const equipStats = inventorySystem.getEquipmentStats(userId);

    // Update rank
    economy.updateAdventurerRank(userId);
    const rank = economyUser.adventurerRank || 'F';

    return {
        nickname: economyUser.nickname || userName,
        whatsappName: economyUser.profile?.whatsappName || userName,
        level: sheet.level || 1,
        xp: sheet.xpProgress || 0,
        xpNeeded: sheet.xpForThisLevel || 100,
        gp: sheet.gp || 0,
        rank: rank,
        class: classData?.name || "Adventurer",
        classIcon: classData?.icon || "🛡️",
        guildName: require('./guilds').getUserGuild(userId) || "",
        wallet: economyUser.wallet || 0,
        bank: economyUser.bank || 0,
        zeniSymbol: botConfig.getCurrency().symbol,
        questsWon: economyUser.questsWon || 0,
        gamesWon: economyUser.stats?.gamesWon || 0,
        messageCount: economyUser.profile?.stats?.messageCount || 0,
        pfpUrl: pfpUrl || "",
        title: economyUser.title || "",
        statPoints: sheet.statPoints || 0,

        // RPG Stats
        hp: stats?.hp || 100,
        atk: stats?.atk || 10,
        def: stats?.def || 10,
        mag: stats?.mag || 10,
        spd: stats?.spd || 10,
        luck: stats?.luck || 10,
        crit: stats?.crit || 0,
        evasion: stats?.evasion || 0,

        // Gear Stats
        equipHp: equipStats?.hp || 0,
        equipAtk: equipStats?.atk || 0,
        equipDef: equipStats?.def || 0,
        equipMag: equipStats?.mag || 0,
        equipSpd: equipStats?.spd || 0,
        equipLuck: equipStats?.luck || 0,

        // Gear Item Names
        gearMainHand: equipment?.main_hand ? (lootSystem.getItemInfo(equipment.main_hand.id)?.name || "None") : "None",
        gearOffHand: equipment?.off_hand ? (lootSystem.getItemInfo(equipment.off_hand.id)?.name || "None") : "None",
        gearArmor: equipment?.armor ? (lootSystem.getItemInfo(equipment.armor.id)?.name || "None") : "None",
        gearHelmet: equipment?.helmet ? (lootSystem.getItemInfo(equipment.helmet.id)?.name || "None") : "None",
        gearBoots: equipment?.boots ? (lootSystem.getItemInfo(equipment.boots.id)?.name || "None") : "None",
        gearRing: equipment?.ring ? (lootSystem.getItemInfo(equipment.ring.id)?.name || "None") : "None",
        gearAmulet: equipment?.amulet ? (lootSystem.getItemInfo(equipment.amulet.id)?.name || "None") : "None",
        gearCloak: equipment?.cloak ? (lootSystem.getItemInfo(equipment.cloak.id)?.name || "None") : "None",
        gearGloves: equipment?.gloves ? (lootSystem.getItemInfo(equipment.gloves.id)?.name || "None") : "None"
    };
}
```
This helper method gathers player details, attributes, rank, wallet contents, stat allocation milestones, and active inventory items. It formats these metrics into a structured configuration object ready for rendering.

---

**HTTP Image Rendering Call** — [goImageService.js L440–453](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/goImageService.js#L440-L453)
```javascript
  async generateProfileCard(data) {
    try {
      const response = await this.client.post("/api/cards/profile", data, {
        responseType: "arraybuffer",
        timeout: 45000,
      });
      const buf = Buffer.from(response.data);
      if (buf.length < 100) return null;
      return buf;
      return buf;
    } catch (error) {
      console.error("GoService Profile Card Error:", error.message);
      return null;
    }
  }
```
This service method handles the HTTP POST request to compile JSON card metrics onto a card asset. It transmits the payload to `/api/cards/profile`, specifying binary response formats, and returns the compiled image buffer.

---

**Command Handler Execution** — [rpgCommands.js L40–72](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/rpgCommands.js#L40-L72)
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
                let captionMsg = `👤 *Character:* ${cardData.nickname}\n`;
                captionMsg += `🛡️ *Class:* ${classData?.icon || '🛡️'} ${classData?.name || 'Adventurer'}\n`;
                captionMsg += `⭐ *Level:* ${sheet?.level || 1}  |  🏆 *Rank:* ${cardData.rank}\n`;
                captionMsg += `💰 *Zeni:* ${getCurrency().symbol}${(economyUser?.wallet || 0).toLocaleString()}\n\n`;
                captionMsg += `*STATS:*\n`;
                captionMsg += `❤️ HP: ${stats?.hp || 100}${equipStats?.hp ? `+${equipStats.hp}` : ''}  |  ⚔️ ATK: ${stats?.atk || 10}${equipStats?.atk ? `+${equipStats.atk}` : ''}\n`;
                captionMsg += `🛡️ DEF: ${stats?.def || 10}${equipStats?.def ? `+${equipStats.def}` : ''}  |  🔮 MAG: ${stats?.mag || 10}${equipStats?.mag ? `+${equipStats.mag}` : ''}\n`;
                captionMsg += `💨 SPD: ${stats?.spd || 10}${equipStats?.spd ? `+${equipStats.spd}` : ''}  |  🍀 LCK: ${stats?.luck || 10}${equipStats?.luck ? `+${equipStats.luck}` : ''}\n`;
                captionMsg += `💥 CRIT: ${stats?.crit || 0}%  |  🕊️ EVA: ${(stats?.evasion || 0).toFixed(1)}%\n`;
                if (cardData.statPoints > 0) {
                    captionMsg += `\n✨ *${cardData.statPoints} Stat Points available!*\nUse \`${getPrefix()} allocate <stat> <amount>\` to assign them.`;
                }
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
```
This is the core profile execution block inside the main RPG command routers. It requests the user's current WhatsApp avatar, builds the JSON packet, routes it to the rendering pipeline, builds a fallback text summary if the render fails, and delivers the message.

## How to modify it

### Adding Default Value Fallbacks
To insert fallback values or defaults for player cards (e.g. default titles or empty avatar fallbacks), edit `core/utils/profileHelper.js`.

**Before (core/utils/profileHelper.js L44–45):**
```javascript
        pfpUrl: pfpUrl || "",
        title: economyUser.title || "",
```

**After (core/utils/profileHelper.js L44–45):**
```javascript
        pfpUrl: pfpUrl || "https://example.com/default_avatar.png", // Added avatar fallback URL
        title: economyUser.title || "Novice Adventurer", // Set default title fallback
```

### Adjusting Image Rendering Timeouts
To adjust the timeout limits for profile card HTTP rendering request tasks, modify the configuration properties in `core/utils/goImageService.js`.

**Before (core/utils/goImageService.js L442–445):**
```javascript
      const response = await this.client.post("/api/cards/profile", data, {
        responseType: "arraybuffer",
        timeout: 45000,
      });
```

**After (core/utils/goImageService.js L442–445):**
```javascript
      const response = await this.client.post("/api/cards/profile", data, {
        responseType: "arraybuffer",
        timeout: 60000, // Raised request limit to 60 seconds
      });
```

## Common tasks
- **Modify Go service profile endpoint** — Edit target path routing configuration parameters in [goImageService.js L442](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/goImageService.js#L442).
- **Edit external HTTP service request timeout** — Adjust connection and rendering timeout parameters in [goImageService.js L444](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/goImageService.js#L444).
- **Update avatar fallback settings** — Set the default picture link if none is found in the user profile in [profileHelper.js L44](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/profileHelper.js#L44).
- **Adjust gear database lookup mapping** — Edit inventory weapon/armor mapping queries in [profileHelper.js L67–75](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/profileHelper.js#L67-L75).
- **Modify structural base stats payload** — Edit raw player metrics mappings in [profileHelper.js L49–56](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/profileHelper.js#L49-L56).
