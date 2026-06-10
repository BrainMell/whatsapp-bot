# Menu and Help Command Flow (`menu`, `help`)

## 1. Description
The `menu` and `help` commands provide users with a complete list of bot commands organized by category. The commands support querying a specific category (e.g., `.j menu rpg`) to see list commands inside, or querying a specific command (e.g., `.j menu balance`) to view description and usage details for that individual command.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j menu" (or ".j help")
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── menu/help command matching (L4609)
            └── sendBotMenu(sock, chatId, BOT_MARKER, menuArgs, senderJid) (L3163)
                └── require('./utils/commandRegistry') (L3070)
                └── Match target command or category from COMMAND_REGISTRY
                └── sendMenuWithBanner(sock, chatId, msgText) (L3217 / L3230 / L3272)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

---

### Step 2: Command Matching and Routing
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4609-L4613)
* **Inputs**: `cmdArgs` array containing arguments
* **Outputs**: Direct call to `sendBotMenu` helper function

```javascript
if (primaryCmd === "menu" || primaryCmd === "help") {
  const menuArgs = cmdArgs.slice(1);
  await sendBotMenu(sock, chatId, BOT_MARKER, menuArgs, senderJid);
  return;
}
```

---

### Step 3: Parsing and Formatting Menu Layout
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L3163-L3275)
* **Inputs**: `(sock, chatId, botMarker, args, senderJid)`
* **Outputs**: Sends menu layout matching the query to the group chat

```javascript
async function sendBotMenu(sock, chatId, botMarker, args = [], senderJid) {
  const botName = botConfig.getBotName() || "Mellow's Bot";
  const prefix = botConfig.getPrefix() || ".j";
  const showHidden = args.includes("-h");
  const cleanArgs = args.filter((a) => !a.startsWith("-"));
  const categoryOrCommandInput = cleanArgs.join(" ").toLowerCase().trim();
  
  // 1. COMMAND EXPLAIN MODE (.j menu <command>)
  // Looks up command in COMMAND_REGISTRY
  if (targetCommand) {
    let explainMsg = GET_BANNER(`...`) + `\n\n*Command:* \`${prefix} ${targetCommand.cmd}\` ...`;
    return await sendMenuWithBanner(sock, chatId, explainMsg);
  }

  // 2. CATEGORY DETAIL (.j menu <category>)
  if (targetCategory) {
    let catMsg = GET_BANNER(`...`) + `\n\n`;
    visibleCmds.forEach((c) => { catMsg += `➤ \`${prefix} ${c.cmd}\` – ${c.desc}\n`; });
    return await sendMenuWithBanner(sock, chatId, catMsg);
  }

  // 3. MAIN MENU (.j menu)
  // Generates complete categories list using two-column formatting
  let mainMsg = GET_BANNER(`...`) + `\n\n Prefix: ${prefix} \n📂 Categories ...`;
  // ... loops visibleCategories
  await sendMenuWithBanner(sock, chatId, mainMsg);
}
```

---

## 4. How to Modify
* **Add Commands or Categories**: Update [commandRegistry.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/commandRegistry.js) to append commands, update description/usages, or structure new categories.
* **Category Emojis**: Update the `CATEGORY_EMOJIS` mapping inside [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js) to customize the emoji icons displayed next to category names.
* **Header Banner Style**: Update `GET_BANNER()` helper or change version formatting inside `sendBotMenu` around line 3240.
