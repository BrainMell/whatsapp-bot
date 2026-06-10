# About and Tutorial Commands Flow (`about`, `tutorial`)

## 1. Description
The `about` command displays general information about the bot, its features, creator details, and listed gambling games. The `tutorial` command provides a quick-start guide to the RPG Adventure systems (registration, level-up points allocation, skill learning, combat moves, and evolutions).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j about"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── about command matching (L5852)
            └── sendMenuWithBanner(sock, chatId, aboutText)
                └── sock.sendMessage(chatId, { text: formattedAboutMessage })

User sends ".j tutorial"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── tutorial command matching (L5342)
            └── sock.sendMessage(chatId, { text: formattedTutorialMessage })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

---

### Step 2: About Command Execution
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5852-L5889)
* **Inputs**: Text matching `about` prefix command
* **Outputs**: Formats and displays the dynamic Bot Profile details

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} about`) {
  const aboutText = GET_BANNER(`🃏 ${botConfig.getBotName().toUpperCase()} v${botConfig.getVersion()}`) + `\n\n` +
    `*Created by:* Mellow\n\n` +
    `*About:*\n${botConfig.getBotName()} is your all-in-one companion...\n\n` +
    `✨ *Key Features:*\n` +
    `• 🏰 Guild System\n` +
    `• 💰 Economy\n` +
    `• 🎰 Gambling\n...`;
  
  await sendMenuWithBanner(sock, chatId, aboutText);
  return;
}
```

---

### Step 3: Tutorial Command Execution
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5342-L5357)
* **Inputs**: Text matching `tutorial` prefix command
* **Outputs**: Formats and displays the quick start RPG steps list

```javascript
if (primaryCmd === "tutorial") {
  let msg = `🎓 *RPG ADVENTURE GUIDE* 🎓\n\n`;
  msg += `Welcome to the legend! Here is how to navigate your new life:\n\n`;
  msg += `1️⃣ *REGISTER:* \`${currentPrefix} register <nickname>\` to start.\n`;
  msg += `2️⃣ *LEVEL UP:* Do \`${currentPrefix} quest\` or \`${currentPrefix} solo\`...\n`;
  // ... steps 3-6
  await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
  return;
}
```

---

## 4. How to Modify
* **Customize About Details**: Edit bot capabilities description, key features, or layout inside [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5855).
* **Tutorial Steps Content**: Modify the quick tips, step guidelines, or formatting inside [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5344).
