# AI Profile and Group Memory Command Flow (`nickname` / `note` / `likes` / `dislikes` / `hobby` / `personal` / `forget me` / `remembergroup` / `groupmemory` / `forgetgroup`)

## 💡 Noob-Friendly Explanation
* **What it does**: The bot has a brain! It can remember personal facts about you (your hobbies, things you like or hate, or general notes) and group-wide memories (like inside jokes or group trivia). Once remembered, the bot will automatically reference these facts in its chat conversation! You can also set a custom nickname for yourself, or ask the bot to wipe its memory of you or the group.
* **How to use it**:
  * **Personal**: `.j nickname Joker`, `.j note I love coding`, `.j likes cats`, `.j dislikes onions`, `.j hobby gaming`, `.j personal I speak 3 languages`.
  * **Wipe Personal**: `.j forget me`.
  * **Group**: `.j remembergroup Bob fell off his chair today`, `.j groupmemory` (shows all group facts), `.j forgetgroup Bob`.
* **Under the Hood (Simple)**: When you run these commands, the bot saves the text directly into your profile in the database. When you speak to the bot later, it pulls these facts from the database and inserts them into the hidden instructions it sends to the AI (Groq LLM), making it appear as if the bot actually remembers you and your chat history!

---

## 2. Hierarchical Execution Tree
```text
======================================================
👤 SAVE USER MEMORY: User sends ".j hobby coding"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Match check: startsWith(".j hobby ") (L14179)
            ├── Extract memory value: "coding" (L14184)
            ├── Call helper: addUserMemory(senderJid, "hobbies", "coding") (L14197)
            │   └── updateUserProfile(jid, { memory: { category, content } }) (L2389)
            │       ├── Fetch user profile from database: economy.getUser(jid)
            │       ├── Push value to profile.memories.hobbies array (L2371)
            │       └── Save changes: economy.saveUser(jid) (L2385)
            └── sock.sendMessage(chatId, { text: "cool." })

======================================================
👥 SAVE GROUP MEMORY: User sends ".j remembergroup Bob's birthday is May 5"
======================================================
User command
└── core/engine.js
    └── Match check: startsWith(".j remembergroup ") (L14260)
        ├── Extract fact text (L14265)
        ├── Query GroupProfile database model (L14281)
        ├── Push record: groupProfile.groupFacts.push({ fact, timestamp }) (L14285)
        ├── Save document: groupProfile.save() (L14290)
        └── sock.sendMessage(chatId, { text: "got it. added to group facts." })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: User Profile Mutation Gateway (`updateUserProfile`)
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L2331)
* **Inputs**: User JID and updates object (e.g. `{ nickname: "Name" }` or `{ memory: { category, content } }`)
* **Outputs**: Returns modified profile object and writes back to MongoDB Mongoose cache

```javascript
function updateUserProfile(jid, updates = {}) {
  const user = economy.getUser(jid);
  if (!user) return null;

  if (!user.profile) {
    user.profile = initializeUserProfile(jid);
  }
  const profile = user.profile;

  // Handle Nickname update
  if (updates.nickname !== undefined) {
    profile.nickname = updates.nickname;
    user.nickname = updates.nickname; // sync RPG
  }

  // Handle Notes update
  if (updates.note) {
    profile.notes.push({ content: updates.note, timestamp: new Date().toISOString() });
  }

  // Handle Memory updates (likes, dislikes, hobbies, etc.)
  if (updates.memory) {
    const { category, content } = updates.memory;
    if (!profile.memories) profile.memories = { likes: [], dislikes: [], hobbies: [], personal: [], other: [] };
    if (profile.memories[category]) {
      if (!profile.memories[category].includes(content)) {
        profile.memories[category].push(content);
      }
    }
  }
  economy.saveUser(jid);
  return profile;
}
```

### Step 2: Ingesting Group Facts (`remembergroup`)
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14280-L14293)
* **Inputs**: Chat identifier and fact content string
* **Outputs**: Saves group-specific memories in the MongoDB `GroupProfile` collection

```javascript
const GroupProfile = require("./models/GroupProfile");
let groupProfile = await GroupProfile.findOne({ chatId });
if (!groupProfile) {
  groupProfile = new GroupProfile({ chatId });
}
groupProfile.groupFacts.push({
  fact: content,
  confidence: 1.0,
  timestamp: new Date()
});
await groupProfile.save();
```

---

## 4. How to Modify
* **Add New Memory Categories**: To track another type of preference (e.g. `favourite_color`), update the structure initialization inside `updateUserProfile` at line 2362 and add the command routing match.
* **Customize Response Confirmation**: Change the text responses (e.g. `"cool."`, `"got it."`) in `engine.js` around line 14199.
* **Integrate with Groq Prompts**: Check how memories are assembled for the AI context builder in the prompt generation engine (`PromptBuilder.js` or `engine.js` around line 2520).
