# Register Command Flow (`register`)

## 1. Description
The Register command allows users to join the economy and RPG systems of the bot. It creates a default user document, assigns a random starter class, awards a starting balance, and schedules a database write to MongoDB.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j register [nickname]"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " register")) (L14397)
            └── core/rpg/economy.js
                └── registerUser(senderJid, nickname) (L110)
                    └── resolveJidHelper(userId) (L93)
                        └── core/utils/lidResolver.js -> resolveJid(userId)
                    └── isRegistered(resolvedId) (L104)
                    └── core/rpg/classSystem.js -> getRandomStarterClass()
                    └── STARTING_BALANCE initialization
                    └── logTransaction(resolvedId, "Registration Bonus", STARTING_BALANCE, user.wallet) (L240)
                    └── scheduleSave(resolvedId) (L29)
                        └── saveUser(resolvedId) (L76)
                            └── MongoDB: User.findOneAndUpdate() (L81)
            └── core/engine.js
                └── updateUserProfile(senderJid, { nickname }) (L14438)
                └── sock.sendMessage(chatId, { text: result.message }) (L14441)
                └── awardProgression(senderJid, chatId) (L14444)
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

### Step 2: Command Matching and Extracting Parameters
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14397-L14433)
* **Line Numbers**: 14397-14433
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: `nickname` string

```javascript
                  // ${botConfig.getPrefix().toLowerCase()} register [nickname] - Create economy account
                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} register`,
                    )
                  ) {
                    let nickname = txt
                      .substring(
                        `${botConfig.getPrefix().toLowerCase()} register`
                          .length,
                      )
                      .trim();

                    // Use WhatsApp display name if no nickname provided
                    if (!nickname) {
                      nickname =
                        m.pushName ||
                        `User_${senderJid.split("@")[0].slice(-4)}`;
                    }

                    if (nickname.length < 2) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Nickname must be at least 2 characters!`,
                      });
                      return;
                    }

                    if (nickname.length > 20) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          "❌ Nickname too long! Max 20 characters.",
                      });
                      return;
                    }
```

#### Explanation
- Compares the message to the prefix + `register` command.
- Extracts `nickname` by removing the command name prefix. If no nickname is typed by the user, uses the WhatsApp profile display name (`m.pushName`) or generates a fallback like `User_1234`.
- Validates the nickname length is between 2 and 20 characters.

---

### Step 3: Registration Logic, Starter Class Assignment, and Starting Balance
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L110-L236)
* **Line Numbers**: 110-236
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId, nickname)`
* **Outputs**: `{ success: boolean, message: string }`

```javascript
function registerUser(userId, nickname) {
  const resolvedId = resolveJidHelper(userId);
  if (isRegistered(resolvedId)) {
    return { success: false, message: `❌ *ALREADY REGISTERED*\n\n🎮 You're already in the game, ${nickname}!` };
  }

  // pick a random class for the newbie
  const classSystem = require('./classSystem');
  const starterClass = classSystem.getRandomStarterClass();

  const existingUser = economyData.get(resolvedId);
  const profile = existingUser?.profile || {
    whatsappName: null,
    nickname: nickname,
    notes: [],
    memories: {
      likes: [], dislikes: [], hobbies: [], personal: [], other: []
    },
    stats: {
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      messageCount: 0
    },
    relationships: {}
  };
  profile.nickname = nickname;

  const userData = {
    userId: resolvedId,
    wallet: STARTING_BALANCE,
    bank: 0,
    lastDaily: 0,
    lastRob: 0,
    jailUntil: 0,
    prisonUntil: 0,
    robberyStrikes: 0,
    lastClassChange: 0,
    registered: true,
    nickname: nickname,
    questGold: 0,
    class: starterClass.id,
    adventurerRank: 'F',
    questsCompleted: 0,
    questsWon: 0,
    questsFailed: 0,
    borrowedSkills: [],
    statBonuses: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
    inventory: {},
    equipment: {
        main_hand: null, off_hand: null, armor: null, helmet: null, boots: null, ring: null, amulet: null, cloak: null, gloves: null
    },
    professions: {
        mining: { level: 1, xp: 0 },
        crafting: { level: 1, xp: 0 }
    },
    completedTrials: [],
    portfolio: {},
    investments: [],
    membership: { tier: 'BASIC', expires: 0 },
    gamblingProfile: {
      dayKey: getTodayKey(),
      roundsToday: 0,
      entryWalletToday: STARTING_BALANCE,
      withdrawnToday: 0,
      netToday: 0
    },
    skills: {},
    profile: profile,
    spriteIndex: Math.floor(Math.random() * 100)
  };
  
  economyData.set(resolvedId, userData);
  logTransaction(resolvedId, "Registration Bonus", STARTING_BALANCE, userData.wallet);
  scheduleSave(resolvedId);
```

#### Explanation
1. **LID Resolution**: Converts user JID using the `resolveJidHelper()` and searches the active in-memory cache `economyData` (a Map) to verify if the user has already registered.
2. **Starter Class**: Imports and calls `classSystem.getRandomStarterClass()` to pick a random initial class.
3. **User Document Creation**: Prepares a comprehensive `userData` state object with the nickname, `STARTING_BALANCE` (1,000 Zeni), empty inventory, lvl 1 professions, empty stats, and default gambling parameters.
4. **Cache Insertion & Transaction Logging**: Inserts user state into the `economyData` cache, calls `logTransaction(...)` to record the starting bonus history, and calls `scheduleSave(...)` to enqueue the user for database persistence.

---

### Step 4: MongoDB Database Persistence
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L29-L41) & [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L76-L89)
* **Line Numbers**: 29-41 & 76-89
* **Called From**: `scheduleSave()` debouncer timer
* **Inputs**: `userId`
* **Outputs**: None

```javascript
function scheduleSave(userId) {
  pendingSaves.add(userId);
  if (!saveTimer) {
    saveTimer = setTimeout(async () => {
      const toSave = [...pendingSaves];
      pendingSaves.clear();
      saveTimer = null;
      for (const id of toSave) {
        await saveUser(id);
      }
    }, 500); // flush every 500ms
  }
}

async function saveUser(userId) {
    const data = economyData.get(userId);
    if (!data) return;

    try {
        await User.findOneAndUpdate(
            { userId: userId },
            { $set: data },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        console.error(`❌ Failed to save user ${userId}:`, err.message);
    }
}
```

#### Explanation
- `scheduleSave()` implements a debounce mechanism to collect unsaved user JIDs into a Set and execute a batch save every 500 milliseconds.
- `saveUser()` retrieves the in-memory user data from the Map cache, and uses Mongoose `User.findOneAndUpdate` with the `{ upsert: true }` option to overwrite or insert the document in the MongoDB database.

---

### Step 5: Replying to WhatsApp
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14434-L14446)
* **Line Numbers**: 14434-14446
* **Called From**: Command routing block in `engine.js`
* **Inputs**: Registration result object
* **Outputs**: Message sent to WhatsApp group

```javascript
                    const result = economy.registerUser(senderJid, nickname);

                    if (result.success) {
                      // Also update user profile with nickname
                      updateUserProfile(senderJid, { nickname });
                    }

                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                    });
                    await awardProgression(senderJid, chatId);
                    return;
```

#### Explanation
- Evaluates the success of `registerUser()`. If successful, calls `updateUserProfile` to update the global chat profile with the new nickname.
- Emits `sock.sendMessage(chatId, { text: BOT_MARKER + result.message })` to deliver the welcome message, assign stats, and display the lore.
- Calls `awardProgression` to grant XP/points to the registering user.

---

## 4. How to Modify
To adjust the starter configurations or limits:
- **Change Starting Balance**: Modify the value of `STARTING_BALANCE` in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L15):
  ```javascript
  const STARTING_BALANCE = 5000; // Give new players 5,000 Zeni upon registration
  ```
- **Change Registration Lore Text**: Edit the output string inside `registerUser` function in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L218-L234).
