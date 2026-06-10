# Debate Tracker Command Flow (`debate`, `judge`)

## 1. Description
The Debate system enables group admins to host structured, AI-judged debates between two participants. When a debate starts, the bot locks the group chat to announcements-only and temporarily promotes both debaters to admin, allowing only them to speak. During the debate, a background handler records their arguments. An admin can trigger the AI judge (`judge`) which uses a Groq LLM model to analyze the transcript and declare a winner, restoring the group settings afterward.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j debate on Messi vs Ronaldo @debater1 @debater2" (Admin only)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── debate command matching (L16537)
            └── core/games/debate.js
                └── startDebate(sock, chatId, topic, debater1, debater2, groupMetadata, BOT_MARKER, smartGroqCall, MODELS) (L54)
                    └── sock.groupSettingUpdate(chatId, 'announcement') (L98)
                    └── sock.groupParticipantsUpdate(chatId, [debater1, debater2], 'promote') (L101)
                    └── activeDebates[chatId] = { ... }
                    └── saveDebates()
                    └── sock.sendMessage(chatId, { text: startAnnouncement })

User sends messages (during debate)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── debate spectator & debater checks (L5361)
            └── debate.recordArgument(chatId, senderJid, text) (L5367)
            └── debate.isSpectator(chatId, senderJid) (Checks spectator passes) (L5370)
                └── debate.checkRelevance(txt, activeDebate, smartGroqCall, MODELS) (L5374)

User sends ".j judge" (Admin only - ending debate)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── judge command matching (L16667)
            └── core/games/debate.js
                └── judgeDebate(sock, chatId, BOT_MARKER, smartGroqCall, MODELS) (L190)
                    └── smartGroqCall(...) (Evaluates arguments via LLM)
                    └── sock.groupSettingUpdate(chatId, 'not_announcement') (Unlocks group chat)
                    └── sock.groupParticipantsUpdate(chatId, [...], 'demote') (Demotes debaters back if they weren't admins)
                    └── updateScoreboard(winner, name, score) (L374)
                    └── delete activeDebates[chatId]
                    └── sock.sendMessage(chatId, { text: verdictText })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Debate Initialization
* **File Path**: [debate.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/debate.js#L54-L136)
* **Inputs**: `(sock, chatId, topic, debater1Jid, debater2Jid, groupMetadata, BOT_MARKER, smartGroqCall, MODELS)`
* **Outputs**: Locks chat announcements, promotes participants, stores active debate session

```javascript
startDebate: async (sock, chatId, topic, debater1Jid, debater2Jid, groupMetadata, BOT_MARKER, smartGroqCall, MODELS) => {
  // Checks if debate is already active
  if (activeDebates[chatId]) return { success: false, message: "❌ Active debate already exists!" };
  
  // Promotes debaters so they can speak when group is locked
  await sock.groupSettingUpdate(chatId, 'announcement');
  await sock.groupParticipantsUpdate(chatId, [debater1Jid], 'promote');
  await sock.groupParticipantsUpdate(chatId, [debater2Jid], 'promote');
  
  activeDebates[chatId] = {
    topic,
    debater1: debater1Jid,
    debater2: debater2Jid,
    arguments: [],
    startTime: Date.now(),
    // ...
  };
  saveDebates();
}
```

---

### Step 2: Message Tracking
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5361-L5432)
* **Inputs**: Any incoming text message `txt` from participants in the group
* **Outputs**: Appends arguments or evaluates spectator contributions via AI

```javascript
if (chatId.endsWith("@g.us") && debate.isDebateActive(chatId)) {
  // 1. Records argument if message comes from debater
  debate.recordArgument(chatId, senderJid, txt);
  
  // 2. Spectator pass validation (deletes message if irrelevant)
  if (debate.isSpectator(chatId, senderJid)) {
    const relevance = await debate.checkRelevance(txt, activeDebate, smartGroqCall, MODELS);
    if (relevance.relevant) {
      await debate.removeSpectator(sock, chatId, senderJid, BOT_MARKER, "Contribution complete");
    } else {
      await sock.sendMessage(chatId, { delete: m.key });
      await debate.removeSpectator(sock, chatId, senderJid, BOT_MARKER, "Irrelevant content");
    }
  }
}
```

---

### Step 3: Verdict Evaluation (The AI Judge)
* **File Path**: [debate.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/debate.js#L190-L290)
* **Inputs**: `(sock, chatId, BOT_MARKER, smartGroqCall, MODELS)`
* **Outputs**: REST API Call to Groq, unlocks group chat, demotes participants, formats win results

```javascript
judgeDebate: async (sock, chatId, BOT_MARKER, smartGroqCall, MODELS) => {
  const debate = activeDebates[chatId];
  if (!debate) return { success: false, message: "❌ No active debate!" };
  
  // Compiles arguments list
  const transcript = debate.arguments.map(arg => `@${arg.debater.split('@')[0]}: ${arg.message}`).join("\n");
  
  // Call AI models to judge
  const prompt = `System judge instructions... Analyze transcript:\n${transcript}`;
  const response = await smartGroqCall(prompt);
  
  // Unlocks chat settings and demotes debaters (if they weren't originally admins)
  await sock.groupSettingUpdate(chatId, 'not_announcement');
  await sock.groupParticipantsUpdate(chatId, [debate.debater1], 'demote'); // etc.
  
  // Award score values and remove active session
  updateScoreboard(winnerJid, winnerName, 1);
  delete activeDebates[chatId];
}
```

---

## 4. How to Modify
* **Change System Prompt of AI Judge**: Modify the prompting context/criteria inside `judgeDebate` in [debate.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/debate.js#L206) (e.g., changing logic, parameters, or structured JSON schema parsed from Groq model output).
* **Restoration Delay / Timeouts**: Modify the default debate session expiration length in `DEBATE_DURATION_MS` in [debate.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/debate.js#L78):
  ```javascript
  const DEBATE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
  ```
* **Scoreboard Points**: Change point adjustments given to the winner inside `judgeDebate` in [debate.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/debate.js#L374).
