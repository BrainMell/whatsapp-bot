# Fun Utility and AI Games Command Flow (`joke` / `truth` / `dare` / `roast` / `ship` / `fact` / `define` / `rate` / `8ball` / `motivate` / `meme` / `wyr` / `quote` / `weather` / `translate` / `crypto` / `trivia` / `qr` / `short` / `git` / `animequote` / `cat` / `dog` / `waifu`)

## 💡 Noob-Friendly Explanation
* **What it does**: The bot has a massive list of commands built for entertainment and quick utilities!
  * **AI Games & Interaction**: Ask the bot to roast a friend, get a funny dare, calculate love compatibility (ship), or answer an 8-ball question.
  * **Daily Facts & Knowledge**: Get random useless facts, dictionary definitions, translations, motivational quotes, or play a trivia quiz.
  * **Media & Utilities**: Fetch random memes, anime quotes, cat/dog/waifu pictures, generate QR codes, shorten URLs, or lookup crypto rates and weather data.
* **How to use it**:
  * Simply run commands like `.j joke`, `.j roast @friend`, `.j ship @alice @bob`, `.j weather London`, `.j translate es Hello world`, `.j qr Goten`, or `.j trivia`.
* **Under the Hood (Simple)**: For simple commands, the bot communicates with free public web services (like dictionary APIs, Coingecko, or Open Trivia DB) to fetch results. For commands requiring creative input (like dares, roasts, and ratings), the bot calls its AI model (Groq) to write a customized reply in its playful, sarcastic tone.

---

## 2. Hierarchical Execution Tree
```text
======================================================
🔥 GENERATE AI ROAST: User sends ".j roast @target"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: primaryCmd === "roast" (L11470)
            ├── Resolve target user mention (L11478)
            ├── Build context profile from target data (L11481-L11490)
            ├── Send context payload to Groq API (L11495)
            │   └── Prompt: "Write a hilarious, lighthearted roast about this user..."
            ├── Award XP/Progress: awardProgression(senderJid, chatId) (L11516)
            └── Send roast text back to WhatsApp

======================================================
📖 DEFINE WORD: User sends ".j define logic"
======================================================
User command
└── core/engine.js
    └── Match check: primaryCmd === "define" (L12161)
        ├── Extract target word: "logic" (L12168)
        ├── Fetch from public service: axios.get("https://api.dictionaryapi.dev/api/v2/entries/en/logic") (L12194)
        ├── Extract meanings, parts of speech, and definitions (L12195-L12204)
        └── Format text structure and reply (L12210)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Ingesting AI Roasts (`roast`)
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L11470-L11519)
* **Inputs**: Target JID from mention
* **Outputs**: Dispatched Groq completion response

```javascript
if (primaryCmd === "roast") {
  const targetUser = getMentionOrReply(m);
  const targetProfile = getUserProfile(targetUser);
  
  let roastContext = `Name: ${targetProfile?.nickname || targetUser.split("@")[0]}\n`;
  if (targetProfile?.memories) {
    roastContext += `Hobbies: ${targetProfile.memories.hobbies.join(", ")}\n`;
    roastContext += `Likes: ${targetProfile.memories.likes.join(", ")}\n`;
    roastContext += `Dislikes: ${targetProfile.memories.dislikes.join(", ")}\n`;
  }

  const res = await groq.chat.completions.create({
    messages: [
      { role: "system", content: "You are a witty, sarcastic comedian. Write a funny, lighthearted roast about this person based on their profile facts. Keep it safe and fun." },
      { role: "user", content: roastContext }
    ],
    model: "llama-3.1-8b-instant"
  });
  await reply(res.choices[0].message.content);
}
```

### Step 2: Querying External Web APIs (`define`)
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L12190-L12215)
* **Inputs**: Target lookup string
* **Outputs**: Decodes dictionary JSON payload and formats output message

```javascript
const word = cmdArgs.slice(1).join(" ");
const apiRes = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

if (apiRes.data && apiRes.data[0]) {
  const entry = apiRes.data[0];
  const mean = entry.meanings[0];
  const def = mean.definitions[0].definition;
  const example = mean.definitions[0].example || "";
  
  await reply(`📖 *${word.toUpperCase()}* (${mean.partOfSpeech})\n\nDefinition: ${def}\nExample: ${example}`);
}
```

---

## 4. How to Modify
* **Change AI Prompt Rules**: Adjust the instructions (e.g. system role prompt) sent to Groq for `roast`, `dare`, or `motivate` in `engine.js`.
* **Alter API Cooldowns / Fallbacks**: To change what happens if dictionary or fact services fail, edit the catch block logic under the respective command.
* **Integrate Custom Meme Subreddits**: Modify Reddit scraper endpoints within the `meme` command handler block.
