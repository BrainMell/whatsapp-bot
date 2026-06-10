# Wordle Game Command Flow (`wordle`)

## 1. Description
The Wordle game command allows players to start a 5-letter word guessing game directly inside WhatsApp. Players get 6 attempts to guess a randomly chosen word. Each guess receives color-coded feedback indicating letter correctness and position. Winning games awards Zeni (economy currency).

---

## 2. Hierarchical Execution Tree
```text
User sends ".j wordle start" (or e/m/h)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── wordle command matching (L17155)
            └── core/games/wordle.js
                └── startGame(sock, chatId, senderJid, botMarker, m, playerName, difficulty) (L491)
                    └── createGame(...) (L125)
                        └── loadWordsFromTXT() / FALLBACK_WORDS (L19)
                        └── new WordleGame(...) (L129)
                        └── activeGames.set(playerJid, gameInstance)
                    └── sock.sendMessage(chatId, { text: boardMessage })

User sends ".j wordle CRANE" (making a guess)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── wordle guess matching (L17205)
            └── core/games/wordle.js
                └── makeGuess(sock, chatId, senderJid, guessWord, botMarker, m) (L533)
                    └── game.makeGuess(word) (L195)
                    └── economy.addMoney(senderJid, rewardAmount) (L561)
                    └── deleteGame(senderJid) (L570)
                    └── sock.sendMessage(chatId, { text: resultMessage })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Ingestion and Pre-Processing
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Called From**: Baileys socket connection event emitter (`sock.ev.on`)
* **Inputs**: `{ messages, type }` event notification payload
* **Outputs**: Dispatched message processing loop

```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify" && type !== "append") return;
  // ... maps and iterates each message object
```

---

### Step 2: Command Matching and Triggering
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L17155-L17202)
* **Inputs**: Parsed prefix and text string `lowerTxt`
* **Outputs**: Calls `wordle.startGame` or `wordle.makeGuess` depending on arguments

```javascript
if (
  lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle start` ||
  lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle` ||
  // ... (easy, medium, hard matching)
) {
  let difficulty = "medium";
  if (lowerTxt.includes("easy") || lowerTxt.endsWith(" e")) {
    difficulty = "easy";
  } // ... sets difficulty
  const result = await wordle.startGame(sock, chatId, senderJid, BOT_MARKER, m, senderName, difficulty);
  return;
}
```

If guess command is triggered:
```javascript
if (
  lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} wordle `) &&
  lowerTxt.length > `${botConfig.getPrefix().toLowerCase()} wordle `.length
) {
  const guess = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} wordle `.length).trim();
  // Checks if it is a reserved subcommand. If not, guesses:
  const result = await wordle.makeGuess(sock, chatId, senderJid, guess, BOT_MARKER, m);
  return;
}
```

---

### Step 3: Game Initialization and Word Selection
* **File Path**: [wordle.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/wordle.js#L491-L531)
* **Inputs**: `(sock, chatId, senderJid, botMarker, m, playerName, difficulty)`
* **Outputs**: Starts a session and responds with the initial board state

```javascript
startGame: async (sock, chatId, senderJid, botMarker, m, playerName = 'Player', difficulty = 'medium') => {
  if (getGame(senderJid)) {
    return { success: false, message: botMarker + `❌ You already have an active game!` };
  }
  const game = createGame(senderJid, playerName, difficulty, chatId, sock, botMarker);
  // ... formats and builds message with game.getBoard()
  await sock.sendMessage(chatId, { text: message }, { quoted: m });
  return { success: true };
}
```

Inside `createGame`:
```javascript
function createGame(playerJid, playerName, difficulty, chatId, sock, botMarker) {
  const words = WORD_LIST.length > 0 ? WORD_LIST : FALLBACK_WORDS;
  const randomIndex = Math.floor(Math.random() * words.length);
  const targetWord = words[randomIndex];
  
  const game = new WordleGame(playerJid, playerName, targetWord, difficulty);
  activeGames.set(normalizeJid(playerJid), game);
  // ... sets up automatic idle expiration timeout
  return game;
}
```

---

### Step 4: Making a Guess and Awarding Prizes
* **File Path**: [wordle.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/wordle.js#L533-L579)
* **Inputs**: `(sock, chatId, senderJid, word, botMarker, m)`
* **Outputs**: Validates the guess, updates the board, determines victory, pays reward

```javascript
makeGuess: async (sock, chatId, senderJid, word, botMarker, m) => {
  const game = getGame(senderJid);
  if (!game) return { success: false, message: "❌ No active game!" };
  
  const result = game.makeGuess(word);
  // ... handles guess evaluation
  if (result.gameOver) {
    if (result.won) {
      const rewards = { easy: 100, medium: 200, hard: 300 };
      const amount = rewards[game.difficulty] || 200;
      economy.addMoney(senderJid, amount); // Updates user wallet
      message += `💰 *Reward:* +${amount} Zeni\n\n`;
    }
    deleteGame(senderJid); // Cleans state map
  }
  await sock.sendMessage(chatId, { text: message }, { quoted: m });
  return { success: true };
}
```

---

## 4. How to Modify
* **Adjust Difficulty Rewards**: Modify reward amounts in [wordle.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/wordle.js#L559):
  ```javascript
  const rewards = { easy: 100, medium: 200, hard: 300 };
  ```
* **Alter Game Inactivity Expiry**: Modify the game expiration timeout in `createGame` or `resetTimeout` inside [wordle.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/wordle.js).
* **Add/Update Word Sources**: Words are loaded from `core/Ldatabase/words.txt`. Update that file to change the target game words pool.
