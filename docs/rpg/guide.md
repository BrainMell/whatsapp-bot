# RPG Handbook & Guides Command Flow (`guide` / `handbook` / `lore`)

## 1. Description
The `guide` or `handbook` command acts as the central help system for the RPG database, providing explanations of combat mechanics, stat scaling, class paths, crafting systems, guild structures, raid configurations, and lore chapters. 

It handles:
- **`.j guide`** / **`.j handbook`**: Lists all help sub-topics.
- **`.j guide <topic>`**: Displays detailed guidance for specific topics (e.g. `combat`, `stats`, `classes`, `raids`, `pvp`, `economy`, `commands`).
- **`.j lore`**: Directs to `guildAdventure.showLore()` to output the full campaign back-story.

---

## 2. Hierarchical Execution Tree
```text
======================================================
📔 HANDBOOK / TOPICS: User sends ".j guide" or ".j guide combat"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match checks (L8876-8926)
            ├── If (.j guide / .j handbook) -> output main topics directory (L8915)
            ├── If (.j guide <topic>) -> evaluate topic string branches (L8934-9107)
            └── sock.sendMessage(chatId, { text: guideText })

======================================================
📜 WORLD LORE: User sends ".j lore"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "lore" || lowerTxt === ".j lore" (L5133 / L8855)
        └── core/rpg/guildAdventure.js
            └── showLore(sock, chatId)
                └── sock.sendMessage(chatId, { text: loreBookText })
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
- Listens to incoming message packets.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L8875-L8931)
* **Line Numbers**: 8875-8931
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Formats topic string or outputs main directory

```javascript
                    // RPG GUIDE SYSTEM - THE ULTIMATE HANDBOOK
                    if (
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} rpg guide` ||
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} guide` ||
                      lowerTxt ===
                        `${botConfig.getPrefix().toLowerCase()} handbook`
                    ) {
                      let msg = `╭───────────────────╮\n  📔 *RPG HANDBOOK* \n╰───────────────────╯\n\n` + ...;
                      await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
                      return;
                    }

                    if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guide `)) {
                      const topic = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} guide `.length).trim();
                      // ... (resolve topic branch)
                    }
```

#### Explanation
- If the exact command is `.j guide` or `.j handbook`, prints the main table of contents listing all available guide subtopics.
- If it starts with `.j guide `, strips the command prefix and extracts the topic parameter (e.g. `combat`, `stats`).

---

### Step 3: Resolving Topic Content & Sending Output
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L8932-L9112)
* **Line Numbers**: 8932-9112
* **Called From**: Parser block inside `engine.js`
* **Inputs**: `topic` JID parameter string
* **Outputs**: Delivers topic details to conversation room

```javascript
                      let msg = "";

                      if (topic === "combat") {
                        msg = `⚔️ *COMBAT MECHANICS*\n\n` + ...;
                      } else if (topic === "stats") {
                        msg = `📊 *ATTRIBUTES & STATS*\n\n` + ...;
                      } else if (topic === "classes") {
                        msg = `🎭 *EVOLUTION TIERS & REQS*\n\n` + ...;
                      } // ... other topics (fighter, scout, mage, support, monsters, items, etc.)
                      else {
                        msg = `❌ Topic not found. Use \`${botConfig.getPrefix()} guide\` for the main menu.`;
                      }

                      await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
```

#### Explanation
- Compares the `topic` argument with pre-defined keys using an `if/else` ladder.
- Formats detailed explanation sections for matching attributes.
- If none match, warns the user that the topic was not found.
- Sends the resulting text payload back to the conversation room.

---

## 4. How to Modify
- **Add New Guide Topics**: Add a new `else if (topic === "new_topic")` block inside [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L8934).
- **Edit World Lore Campaign**: Modify the response text in `showLore` inside [core/rpg/guildAdventure.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guildAdventure.js).
