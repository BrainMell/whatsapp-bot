# Ludo Game Command Flow (`ludo`)

## 1. Description
The Ludo command operates a full multiplayer virtual Ludo board game for 2 to 4 players inside a group chat. The game features dice rolling, piece selection (1-4), player collision/capturing, home lanes, dynamic image generation representing board state, and automatic turn progression.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j ludo start @opponent1 @opponent2"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── ludo start command matching (L16689)
            └── core/games/ludo.js
                └── startGame(sock, chatId, starterJid, mentionedJids, BOT_MARKER, m) (L439)
                    └── new LudoGame(chatId, allPlayers, sock) (L461)
                    └── activeGames.set(chatId, gameInstance)
                    └── renderBoard(game, sock) (L129)
                    └── sock.sendMessage(chatId, { image: boardImage, caption })

User sends ".j ludo roll"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── ludo roll command matching (L1735)
            └── core/games/ludo.js
                └── rollDice(sock, chatId, senderJid, BOT_MARKER, m) (L507)
                    └── game.rollDice() (L215)
                    └── game.getMovablePieces(player) (L241)
                    └── game.movePiece(player, pieceToMove) (L314) (If only 1 piece is movable)
                    └── game.nextTurn() (L200) (If no moves available)
                    └── renderBoard(game, sock)
                    └── sock.sendMessage(chatId, { image: boardImage, caption })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Message Entry and Verification
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Called From**: Baileys socket connection event emitter
* **Inputs**: `{ messages, type }` event notification payload
* **Outputs**: Dispatched command matching loop

---

### Step 2: Command Matching and Routing
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L16688-L16732)
* **Inputs**: Command string `lowerTxt`
* **Outputs**: Direct call to `ludo.startGame` or other Ludo subcommands

```javascript
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ludo start`)) {
  let mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentionedJids.length === 0) {
    const target = getMentionOrReply(m);
    if (target) mentionedJids = [target];
  }
  const totalPlayers = mentionedJids.length + 1;
  if (totalPlayers < 2 || totalPlayers > 4) {
    return sendUsage("ludo start @friend");
  }
  const result = await ludo.startGame(sock, chatId, senderJid, mentionedJids, BOT_MARKER, m);
  return;
}
```

---

### Step 3: Game Initialization and Board Rendering
* **File Path**: [ludo.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/ludo.js#L439-L505)
* **Inputs**: `(sock, chatId, starterJid, mentionedJids, BOT_MARKER, m)`
* **Outputs**: Creates a session, registers color mappings, returns rendered image board

```javascript
startGame: async (sock, chatId, starterJid, mentionedJids, BOT_MARKER, m) => {
  const allPlayers = [starterJid, ...mentionedJids];
  const game = new LudoGame(chatId, allPlayers, sock);
  activeGames.set(chatId, game);
  
  const imageBuffer = await renderBoard(game, sock);
  // ... formats color emojis and players info, sends message
}
```

Inside the `LudoGame` constructor:
```javascript
class LudoGame {
  constructor(chatId, playerJids, sock) {
    this.chatId = chatId;
    const colors = ['red', 'green', 'yellow', 'blue'];
    this.players = playerJids.map((jid, idx) => ({
      fullJid: jid,
      color: colors[idx],
      pieces: [
        { id: 1, pos: -1, isHome: false },
        { id: 2, pos: -1, isHome: false },
        { id: 3, pos: -1, isHome: false },
        { id: 4, pos: -1, isHome: false },
      ]
    }));
    this.turnIndex = 0;
    this.lastRoll = null;
    // ... handles active turn state & game properties
  }
}
```

---

### Step 4: Turn Rolling and Piece Movements
* **File Path**: [ludo.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/ludo.js#L507-L635)
* **Inputs**: `(sock, chatId, senderJid, BOT_MARKER, m)` (via `rollDice` or `movePiece`)
* **Outputs**: Performs random rolls, moves pieces, handles wins and captures, renders updated board

```javascript
rollDice: async (sock, chatId, senderJid, BOT_MARKER, m) => {
  const game = activeGames.get(chatId);
  if (normalizeJid(game.getCurrentPlayer().fullJid) !== normalizeJid(senderJid)) return reply("Not your turn!");
  
  const rollResult = game.rollDice();
  const movablePieces = game.getMovablePieces(player);
  
  if (rollResult.burned) {
    game.nextTurn();
  } else if (movablePieces.length === 1) {
    // Auto-moves if only one piece is movable
    const moveResult = game.movePiece(player, movablePieces[0]);
    if (moveResult.won) {
      economy.addMoney(player.fullJid, 500); // 500 Zeni reward
      activeGames.delete(chatId);
    }
  }
  // ... renders and sends the new board canvas image to group
}
```

---

## 4. How to Modify
* **Winner Zeni Payout**: Edit reward amount paid upon victory in [ludo.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/ludo.js#L603):
  ```javascript
  const reward = 500;
  economy.addMoney(player.fullJid, reward);
  ```
* **Consecutive Sixes Rule**: Modify the consecutive 6s threshold or turn-burn check inside `rollDice()` in `LudoGame` (around line 215) in [ludo.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/ludo.js).
* **Board Rendering Visuals**: Update board size, slot colors, token drawing shapes, or path mapping in the canvas drawing sections of [ludo.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/games/ludo.js) (lines 129-199).
