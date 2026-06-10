# Chess Game Command Flow (`chess`, `c`)

## 1. Description
The Chess game commands enable players to play full virtual chess matches directly within a WhatsApp group. Players can challenge a friend or the bot (AI mode) and can optionally wager Zeni on the match. Moves are parsed using standard algebraic notation (e.g., `e4`, `Nf3`) and visual boards are rendered as canvas images.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j chess @opponent [bet]" (or challenges bot)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── chess command matching (L17010)
            └── core/games/chess.js
                └── handleChess(sock, chatId, senderJid, args, m, botMarker) (L299)
                    └── createGame(senderJid, opponentJid, chatId, bet) (L69)
                        └── new Chess() (from 'chess.js' npm package)
                        └── activeGames.set(chatId, gameSession)
                    └── renderBoard(fen) (L231)
                    └── sock.sendMessage(chatId, { image: imageBuffer, caption })

User sends ".j move e4" (making a move)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── move command matching (L17035)
            └── checks if active chess game exists & looks like chess notation (L17048)
            └── core/games/chess.js
                └── handleChess(sock, chatId, senderJid, ["move", "e4"], m, botMarker) (L388)
                    └── processMove(sock, chatId, state, move, moveStr, botMarker, botJid) (L450)
                        └── checkGameEnd(sock, chatId, state, botMarker) (L500)
                            └── economy.transfer(...) / economy.addMoney(...)
                            └── activeGames.delete(chatId)
                        └── triggerAIMove(sock, chatId, state, botMarker, botJid) (L552)

User sends ".j chess resign" (surrendering)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── chess command matching (L17010)
            └── core/games/chess.js
                └── handleChess(sock, chatId, senderJid, ["resign"], m, botMarker) (L566)
                    └── resolve wagers & update scores (L574)
                    └── deleteGame(chatId) (L585)
                    └── sendMessage announcement (L587)
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Ingestion
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: Dispatched command matching loop

---

### Step 2: Command Routing
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L17009-L17033)
* **Inputs**: Command string `lowerTxt`
* **Outputs**: Calls `chess.handleChess` with parsed arguments

```javascript
const prefix = botConfig.getPrefix().toLowerCase();
if (lowerTxt.startsWith(`${prefix} chess`) || lowerTxt.startsWith(`${prefix} c `)) {
  let rawArgs = lowerTxt.startsWith(`${prefix} chess`)
    ? lowerTxt.substring(`${prefix} chess`.length).trim()
    : lowerTxt.substring(`${prefix} c `.length).trim();
  const args = rawArgs.split(" ").filter((a) => a);
  return await chess.handleChess(sock, chatId, senderJid, args, m, BOT_MARKER);
}
```

---

### Step 3: Game Initialization and Challenge
* **File Path**: [chess.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/chess.js#L324-L384)
* **Inputs**: `(sock, chatId, senderJid, args, m, botMarker)`
* **Outputs**: Persists new game in memory map and returns rendered visual chess board

```javascript
if (!cmd || cmd === 'challenge' || (mentionedJids.length > 0 && !reserved.includes(cmd))) {
  let opponentJid = mentionedJids[0];
  if (isTaggingBot || isReplyingToBot) opponentJid = botJid; // AI Mode
  
  const bet = parseInt(betStr) || 0;
  // ... verifies wallet balances for bet amount
  const state = createGame(senderJid, opponentJid, chatId, bet);
  
  const imageBuffer = await renderBoard(state.chess.fen());
  // ... sends initial board configuration image
}
```

Inside `createGame`:
```javascript
function createGame(playerW, playerB, chatId, bet = 0) {
    const game = {
        chatId,
        playerW,
        playerB,
        bet,
        chess: new Chess(), // chess.js instance
        moves: [],
        lastActive: Date.now()
    };
    activeGamesMap.set(chatId, game);
    saveActiveGames();
    return game;
}
```

---

### Step 4: Making Chess Moves and Handling AI Turn
* **File Path**: [chess.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/chess.js#L388-L448)
* **Inputs**: `(sock, chatId, senderJid, ["move", moveNotation], m, botMarker)`
* **Outputs**: Attempts the chess.js move, updates the board canvas, triggers AI move if opponent is bot

```javascript
if (cmd === 'move' || cmd === 'm') {
  const state = getGame(chatId);
  // ... checks turn: matches senderJid with active color player
  
  try {
    let move = state.chess.move(moveStr); // checks valid moves via chess.js
    if (!move) throw new Error("Invalid move");
    
    await processMove(sock, chatId, state, move, moveStr, botMarker, botJid);
  } catch (e) {
    // ... sends error detailing movement notation
  }
}
```

Inside `processMove`:
```javascript
async function processMove(sock, chatId, state, move, moveStr, botMarker, botJid) {
  // Renders chess board and updates user message status.
  const ended = await checkGameEnd(sock, chatId, state, botMarker);
  
  if (!ended && state.playerB === botJid) {
    // Triggers AI move generator
    await triggerAIMove(sock, chatId, state, botMarker, botJid);
  }
}
```

---

## 4. How to Modify
* **Change AI Difficulty / Move Logic**: Modify the AI selection algorithm in `triggerAIMove` in [chess.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/chess.js#L552). It currently selects from legal moves using basic checks (e.g., picking capture moves first).
* **Chess Board Styling / Layout**: Edit the tile drawing colors, fonts, and piece sizes in the `renderBoard` function (around line 231) in [chess.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/chess.js).
* **Betting / Economy Multipliers**: Change how bets are validated and paid out in `checkGameEnd` in [chess.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/chess.js#L500).
