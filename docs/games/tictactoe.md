# Tic-Tac-Toe Game Command Flow (`ttt`, `tttt`, `ttttt`)

## 1. Description
The Tic-Tac-Toe game commands allow users to play classic 3x3 (`ttt`), 8x8 (`tttt`), or 16x16 (`ttttt`) tic-tac-toe games directly in WhatsApp. Wins yield points and Zeni, while losses deduct points. The game renders the board dynamically using canvas-based image attachments or text fallback and tracks high scores via a global system.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j ttt @opponent"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── ttt / tttt / ttttt command matching (L16937)
            └── core/games/tictactoe.js
                └── handleStartGame(sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize) (L360)
                    └── createGame(senderJid, opponentJid, chatId, gridSize, sock, botMarker) (L66)
                        └── new TttGame(...)
                        └── activeGames.set(chatId, gameSession)
                    └── renderBoard(board, gridSize) (L180)
                    └── sock.sendMessage(chatId, { image: imageBuffer, caption })

User sends ".j move 4" (making a move in a ttt game)
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── move command matching (L17035)
            └── core/games/tictactoe.js
                └── handleMove(sock, chatId, senderJid, cellIndex, botMarker, m, senderName) (L387)
                    └── makeMove(chatId, senderJid, cellIndex) (L81)
                    └── renderBoard(board, gridSize, lastMoveIndex, winPattern) (L180)
                    └── updateScoreboard(winnerJid, name, points) (L279)
                    └── economy.addMoney(winnerJid, amount) (L410)
                    └── deleteGame(chatId) (L54)
                    └── sock.sendMessage(chatId, { image: imageBuffer, caption })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: Dispatched command matching loop

---

### Step 2: Command Matching and Routing
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L16937-L17006)
* **Inputs**: Command string `lowerTxt`
* **Outputs**: Direct call to `tictactoe.handleStartGame` or subcommands

```javascript
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ttt`)) {
  const args = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} ttt`.length).trim().split(" ");
  const command = args[0]?.toLowerCase();
  
  if (command === "end" || command === "stop") {
    await tictactoe.handleEndGame(sock, chatId, senderJid, BOT_MARKER, m);
    return;
  }
  // ... handles scores & board commands, then defaults to start:
  const opponent = getMentionOrReply(m);
  await tictactoe.handleStartGame(sock, chatId, senderJid, [opponent], BOT_MARKER, m, 3);
  return;
}
```

---

### Step 3: Game Initialization and Board Rendering
* **File Path**: [tictactoe.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/tictactoe.js#L360-L385)
* **Inputs**: `(sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize = 3)`
* **Outputs**: Persists new game in memory map and returns rendered visual board

```javascript
handleStartGame: async (sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize = 3) => {
  if (hasActiveGame(chatId)) return reply("Game in progress.");
  const opponentJid = mentionedJids[0];
  const game = createGame(senderJid, opponentJid, chatId, gridSize, sock, botMarker);
  
  const imageBuffer = await renderBoard(game.board, gridSize);
  // ... sends board image with cell annotations
}
```

Inside `createGame`:
```javascript
function createGame(playerA, playerB, chatId, gridSize, sock, botMarker) {
  const game = {
    chatId,
    playerA,
    playerB,
    gridSize,
    board: Array(gridSize * gridSize).fill(null),
    currentTurn: playerA,
    status: 'playing',
    // ... timeouts
  };
  activeGames.set(chatId, game);
  return game;
}
```

---

### Step 4: Making Game Moves and Scoring
* **File Path**: [tictactoe.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/tictactoe.js#L387-L445)
* **Inputs**: `(sock, chatId, senderJid, cellIndex, botMarker, m, senderName)`
* **Outputs**: Updates board cell, evaluates win condition, awards reward, deletes game session

```javascript
handleMove: async (sock, chatId, senderJid, cellIndex, botMarker, m, senderName = 'Player') => {
  const result = makeMove(chatId, senderJid, parseInt(cellIndex));
  if (!result.success) return reply(result.error);
  
  const imageBuffer = await renderBoard(result.game.board, result.game.gridSize, result.game.lastMoveIndex, result.winPattern);
  
  if (result.game.status === 'win') {
    updateScoreboard(result.game.winner, winnerName, points);
    updateScoreboard(loserJid, 'Player', -1);
    economy.addMoney(result.game.winner, points * 100);
    deleteGame(chatId);
  }
  // ... sends updated board image or text fallback to WhatsApp
}
```

---

## 4. How to Modify
* **Scoreboard Metrics**: Adjust points won/lost for different grid sizes in [tictactoe.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/tictactoe.js#L396):
  ```javascript
  const points = gridSize === 3 ? 1 : gridSize === 8 ? 2 : 3;
  ```
* **Adjust Wallet Reward**: Modify the multiplier for the winner in [tictactoe.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/tictactoe.js#L409):
  ```javascript
  const moneyReward = points * 100;
  ```
* **Alter Styling / Colors of Board Canvas**: Modify the canvas draw parameters (colors, fonts, line widths) in the `renderBoard` function (around line 180) in [tictactoe.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/tictactoe.js).
