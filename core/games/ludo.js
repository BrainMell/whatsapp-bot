// ============================================
// AFRICAN LUDO - GO SERVICE INTEGRATION
// ============================================

const fs = require('fs');
const path = require('path');
const botConfig = require('../../botConfig');
const axios = require('axios');
const economy = require('../rpg/economy');
const goService = require('../utils/goImageService'); // 💡 singleton (PERF PATCH 2026-07-27)
const { fetchPfp: fetchPfpCached } = require('../utils/pfpCache'); // 💡 PERF PATCH 2026-07-27: cached + 8s-timeout PFP fetcher

let globalSock = null;

const normalizeJid = (jid) => {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0];
};

const promiseWithTimeout = (promise, ms) => {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise
  ]);
};

// ============================================
// PROFILE PICTURE MANAGEMENT
// ============================================

const getPfpDir = () => botConfig.getDataPath('pfp');

async function cleanPfpCache() {
  const dir = getPfpDir();
  if (!fs.existsSync(dir)) return;
  try {
    const files = fs.readdirSync(dir)
      .map(f => {
        const filePath = path.join(dir, f);
        return { name: f, path: filePath, mtime: fs.statSync(filePath).mtime };
      })
      .filter(f => f.name.endsWith('.jpg'))
      .sort((a, b) => a.mtime - b.mtime); // oldest first

    if (files.length > 100) {
      const toDelete = files.slice(0, files.length - 100);
      toDelete.forEach(f => {
        try { fs.unlinkSync(f.path); } catch(e) {}
      });
      console.log(`🧹 [Ludo] Cleaned ${toDelete.length} old PFPs from cache.`);
    }
  } catch (err) {}
}

async function fetchProfilePicture(sock, jid) {
  try {
    const normalizedJid = jid.split('@')[0].split(':')[0];
    const pfpPath = path.join(getPfpDir(), `${normalizedJid}.jpg`);

    if (fs.existsSync(pfpPath)) {
      return pfpPath; // Use cached if available
    }

    // Clean cache before adding new ones
    await cleanPfpCache();

    try {
      // 💡 PERF PATCH 2026-07-27: was sock.profilePictureUrl(jid, 'image')
      // with NO timeout — could hang for 90s on LID jids. Now uses the
      // shared pfpCache helper: 8s timeout + 5min positive / 60s negative cache.
      const pfpUrl = await fetchPfpCached(sock, jid);
      if (pfpUrl) {
        return pfpUrl; // Return URL for Go service
      }
    } catch (pfpErr) {
      console.log(`⚠️ PFP not available for ${normalizedJid}: ${pfpErr.message}`);
    }
    
    return null;
  } catch (err) {
    return null;
  }
}

// ============================================
// BOARD CONFIGURATION
// ============================================

const COLORS = {
  RED: 'red',
  BLUE: 'blue',
  YELLOW: 'yellow',
  GREEN: 'green'
};

// Tracks and paths logic
const MAIN_TRACK = [
  [6,1], [6,2], [6,3], [6,4], [6,5],
  [5,6], [4,6], [3,6], [2,6], [1,6], [0,6],
  [0,7], [0,8],
  [1,8], [2,8], [3,8], [4,8], [5,8],
  [6,9], [6,10], [6,11], [6,12], [6,13], [6,14],
  [7,14], [8,14],
  [8,13], [8,12], [8,11], [8,10], [8,9],
  [9,8], [10,8], [11,8], [12,8], [13,8], [14,8],
  [14,7], [14,6],
  [13,6], [12,6], [11,6], [10,6], [9,6],
  [8,5], [8,4], [8,3], [8,2], [8,1], [8,0],
  [7,0], [6,0]
];

const HOME_PATHS = {
  red: [[7,1], [7,2], [7,3], [7,4], [7,5], [7,6]],
  green: [[1,7], [2,7], [3,7], [4,7], [5,7], [6,7]],
  yellow: [[7,13], [7,12], [7,11], [7,10], [7,9], [7,8]],
  blue: [[13,7], [12,7], [11,7], [10,7], [9,7], [8,7]]
};

const START_POSITIONS = {
  red: 0, green: 13, yellow: 26, blue: 39
};

const HOME_ENTRANCE = {
  red: 50, green: 11, yellow: 24, blue: 37
};

const SAFE_SQUARES = [0, 13, 26, 39];

// ============================================
// GAME STATE MANAGEMENT
// ============================================

const activeGames = new Map();

class LudoGame {
  constructor(chatId, playerJids, sock = null) {
    this.chatId = chatId;
    this.sock = sock;
    this.players = [];

    const availableColors = [COLORS.RED, COLORS.GREEN, COLORS.YELLOW, COLORS.BLUE];
    playerJids.forEach((jid, i) => {
      this.players.push({
        jid: jid,
        fullJid: jid,
        color: availableColors[i],
        pieces: [
          { id: 1, position: -1, inBase: true, inHome: false, onHomePath: false, homePathIndex: -1 },
          { id: 2, position: -1, inBase: true, inHome: false, onHomePath: false, homePathIndex: -1 },
          { id: 3, position: -1, inBase: true, inHome: false, onHomePath: false, homePathIndex: -1 },
          { id: 4, position: -1, inBase: true, inHome: false, onHomePath: false, homePathIndex: -1 }
        ]
      });
    });

    this.currentTurnIndex = 0;
    this.lastRoll = 0;
    this.consecutiveSixes = 0;
    this.hasExtraTurn = false;
    this.diceHistory = [];
    this.walls = [];
    this.gameOver = false;
    this.winner = null;
    this.created = Date.now();
    this.lastAction = Date.now();
    this.timeout = setTimeout(async () => {
      if (activeGames.has(chatId)) {
        activeGames.delete(chatId);
        const botMarker = `*${botConfig.getBotName()}*\n\n`;
        try {
          const clientSock = this.sock || globalSock;
          if (clientSock) await clientSock.sendMessage(chatId, { 
            text: botMarker + "⌛ *LUDO GAME OVER* ⌛\n\nThe game has ended due to inactivity (30 minutes of no actions)." 
          });
        } catch (e) {}
      }
    }, 30 * 60 * 1000); // 30 minutes for Ludo
  }

  resetTimeout(sock = null) {
    if (sock) this.sock = sock;
    if (this.timeout) clearTimeout(this.timeout);
    this.lastAction = Date.now();
    this.timeout = setTimeout(async () => {
      if (activeGames.has(this.chatId)) {
        activeGames.delete(this.chatId);
        const botMarker = `*${botConfig.getBotName()}*\n\n`;
        try {
          const clientSock = this.sock || globalSock;
          if (clientSock) await clientSock.sendMessage(this.chatId, { 
            text: botMarker + "⌛ *LUDO GAME OVER* ⌛\n\nThe game has ended due to inactivity (30 minutes of no actions)." 
          });
        } catch (e) {}
      }
    }, 30 * 60 * 1000);
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
  }

  getPlayerByJid(jid) {
    const target = normalizeJid(jid);
    return this.players.find(p => normalizeJid(p.jid) === target || normalizeJid(p.fullJid) === target);
  }

  rollDice() {
    const roll = Math.floor(Math.random() * 6) + 1;
    this.lastRoll = roll;
    this.diceHistory.push({ player: this.getCurrentPlayer().fullJid, roll, time: Date.now() });

    if (roll === 6) {
      this.consecutiveSixes++;
      if (this.consecutiveSixes >= 3) {
        return { roll, burned: true, extraTurn: false };
      }
      return { roll, burned: false, extraTurn: true };
    } else {
      this.consecutiveSixes = 0;
      return { roll, burned: false, extraTurn: false };
    }
  }

  canMovePiece(player, pieceId) {
    const piece = player.pieces.find(p => p.id === pieceId);
    if (!piece) return false;
    if (piece.inHome) return false;
    if (piece.inBase && this.lastRoll !== 6) return false;
    if (piece.onHomePath) {
      const newIndex = piece.homePathIndex + this.lastRoll;
      return newIndex <= 5;
    }
    return true;
  }

  checkWall(position, excludePlayer = null) {
    const piecesAtPosition = [];
    this.players.forEach(player => {
      if (excludePlayer && normalizeJid(player.jid) === normalizeJid(excludePlayer.jid)) return;
      player.pieces.forEach(piece => {
        if (!piece.inBase && !piece.inHome && !piece.onHomePath && piece.position === position) {
          piecesAtPosition.push({ player, piece });
        }
      });
    });
    const colorGroups = {};
    piecesAtPosition.forEach(({ player, piece }) => {
      if (!colorGroups[player.color]) colorGroups[player.color] = [];
      colorGroups[player.color].push({ player, piece });
    });
    for (const color in colorGroups) {
      if (colorGroups[color].length >= 2) {
        return { isWall: true, color, pieces: colorGroups[color] };
      }
    }
    return { isWall: false };
  }

  movePiece(player, pieceId) {
    const piece = player.pieces.find(p => p.id === pieceId);
    if (!piece || !this.canMovePiece(player, pieceId)) {
      return { success: false, error: 'Cannot move this piece!' };
    }

    const roll = this.lastRoll;
    let captured = false;
    let reachedHome = false;

    if (piece.inBase && roll === 6) {
      const startPos = START_POSITIONS[player.color];
      piece.position = startPos;
      piece.inBase = false;
      const captureResult = this.checkCapture(player, startPos);
      if (captureResult.captured) captured = true;
      return { success: true, fromBase: true, captured, extraTurn: true };
    }

    if (piece.onHomePath) {
      const newIndex = piece.homePathIndex + roll;
      if (newIndex > 5) return { success: false, error: 'Cannot move - would overshoot home!' };
      piece.homePathIndex = newIndex;
      if (newIndex === 5) {
        piece.inHome = true;
        piece.onHomePath = false;
        reachedHome = true;
        const allHome = player.pieces.every(p => p.inHome);
        if (allHome) {
          this.gameOver = true;
          this.winner = player.fullJid;
        }
        return { success: true, reachedHome: true, won: allHome, extraTurn: true };
      }
      return { success: true };
    }

    const currentPos = piece.position;
    const turnOffIndex = HOME_ENTRANCE[player.color];
    let stepsRemaining = roll;
    let newPos = currentPos;
    
    while (stepsRemaining > 0) {
      if (newPos === turnOffIndex) {
        piece.onHomePath = true;
        piece.position = -1;
        piece.homePathIndex = 0;
        stepsRemaining--;
        while (stepsRemaining > 0) {
          piece.homePathIndex++;
          if (piece.homePathIndex > 5) return { success: false, error: 'Cannot move - would overshoot home!' };
          if (piece.homePathIndex === 5) {
            piece.inHome = true;
            piece.onHomePath = false;
            reachedHome = true;
            const allHome = player.pieces.every(p => p.inHome);
            if (allHome) {
              this.gameOver = true;
              this.winner = player.fullJid;
            }
            return { success: true, reachedHome: true, enteredHomePath: true, won: allHome, extraTurn: true };
          }
          stepsRemaining--;
        }
        return { success: true, enteredHomePath: true };
      } else {
        newPos = (newPos + 1) % 52;
        stepsRemaining--;
      }
    }

    const wall = this.checkWall(newPos, player);
    if (wall.isWall && wall.color !== player.color) {
      return { success: false, error: `🛡️ WALL BLOCKED! ${wall.color.toUpperCase()} wall!` };
    }

    piece.position = newPos;
    if (!SAFE_SQUARES.includes(newPos)) {
      const captureResult = this.checkCapture(player, newPos);
      if (captureResult.captured) captured = true;
    }
    this.updateWalls();
    return { success: true, captured, extraTurn: captured };
  }

  checkCapture(currentPlayer, position) {
    let captured = false;
    this.players.forEach(player => {
      if (normalizeJid(player.jid) === normalizeJid(currentPlayer.jid)) return;
      player.pieces.forEach(piece => {
        if (!piece.inBase && !piece.inHome && !piece.onHomePath && piece.position === position) {
          piece.position = -1;
          piece.inBase = true;
          piece.onHomePath = false;
          piece.homePathIndex = -1;
          captured = true;
        }
      });
    });
    return { captured };
  }

  updateWalls() {
    this.walls = [];
    for (let pos = 0; pos < 52; pos++) {
      const wall = this.checkWall(pos);
      if (wall.isWall) {
        this.walls.push({ position: pos, color: wall.color });
      }
    }
  }

  getMovablePieces(player) {
    return player.pieces
      .filter(piece => this.canMovePiece(player, piece.id))
      .map(piece => piece.id);
  }

  nextTurn() {
    if (this.hasExtraTurn) {
      this.hasExtraTurn = false;
      return;
    }
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
    this.consecutiveSixes = 0;
  }
}

// ============================================
// RENDERING WITH GO SERVICE
// ============================================

async function renderBoard(game, sock = null) {
  try {
    const pfpUrls = {};
    if (sock) {
      const pfpPromises = game.players.map(async (player) => {
        try {
          const pfp = await promiseWithTimeout(fetchProfilePicture(sock, player.fullJid), 3000);
          if (pfp) pfpUrls[player.fullJid] = pfp;
        } catch (e) {}
      });
      await Promise.all(pfpPromises);
    }

    const payload = {
      players: game.players.map(p => ({
        jid: p.fullJid,
        color: p.color,
        pfpUrl: pfpUrls[p.fullJid] || '',
        pieces: p.pieces.map(piece => ({
          id: piece.id,
          position: piece.position,
          inBase: piece.inBase,
          inHome: piece.inHome,
          onHomePath: piece.onHomePath,
          homePathIndex: piece.homePathIndex
        }))
      })),
      lastRoll: game.lastRoll || 0
    };

    const buffer = await goService.renderLudoBoard(payload);
    return buffer;
  } catch (err) {
    console.error('❌ Board rendering failed via Go Service:', err.message);
    return null;
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  startGame: async (sock, chatId, starterJid, mentionedJids, BOT_MARKER, m) => {
    globalSock = sock;
    if (activeGames.has(chatId)) {
      return {
        success: false,
        message: BOT_MARKER + `❌ A Ludo game is already in progress!\nUse \`${botConfig.getPrefix()} ludo end\` to stop it.`
      };
    }
    const uniquePlayers = [];
    const seen = new Set();
    for (const jid of [starterJid, ...mentionedJids]) {
      const norm = normalizeJid(jid);
      if (!seen.has(norm)) {
        seen.add(norm);
        uniquePlayers.push(jid);
      }
    }
    const allPlayers = uniquePlayers;
    if (allPlayers.length < 2 || allPlayers.length > 4) {
      return { success: false, message: BOT_MARKER + "❌ Ludo needs 2-4 players!" };
    }

    const game = new LudoGame(chatId, allPlayers, sock);
    activeGames.set(chatId, game);

    const colorEmojis = ['🔴', '🟢', '🟡', '🔵'];
    const playerList = game.players.map((p, i) => {
      const phone = p.fullJid.split('@')[0];
      return `${colorEmojis[i]} @${phone} (${p.color.toUpperCase()})`;
    }).join('\n');

    const imageBuffer = await renderBoard(game, sock);
    const message = BOT_MARKER + `┌───────────────┐
🎲 *LUDO STARTED!* 🎲
└───────────────┘

👥 *PLAYERS:*
${playerList}

┌───────────────┐
🎯 Current Turn: @${game.getCurrentPlayer().fullJid.split('@')[0]}

📜 *RULES:*
• Roll 6 to enter
• 3 consecutive 6s = BURNED! ⚡
• 2 pieces = WALL 🛡️
• Capture = Extra turn 🔥
• Home = Extra turn 🏠
• Pieces show numbers 1-4

🎮 *COMMANDS:*
• \`${botConfig.getPrefix()} ludo roll\`
• \`${botConfig.getPrefix()} ludo move <1-4>\`
• \`${botConfig.getPrefix()} ludo board\`
• \`${botConfig.getPrefix()} ludo end\`

Type \`${botConfig.getPrefix()} ludo roll\` to start!
└───────────────┘`;

    const mentions = game.players.map(p => p.fullJid);
    if (imageBuffer) {
      await sock.sendMessage(chatId, { image: imageBuffer, caption: message, mentions: mentions }, { quoted: m });
    } else {
      await sock.sendMessage(chatId, { text: message, mentions: mentions }, { quoted: m });
    }
    return { success: true };
  },

  rollDice: async (sock, chatId, senderJid, BOT_MARKER, m) => {
    globalSock = sock;
    const game = activeGames.get(chatId);
    if (!game) return { success: false, message: BOT_MARKER + "❌ No active Ludo game!" };
    if (normalizeJid(game.getCurrentPlayer().fullJid) !== normalizeJid(senderJid)) return { success: false, message: BOT_MARKER + "❌ Not your turn!" };

    const rollResult = game.rollDice();
    game.resetTimeout(sock);
    const player = game.getCurrentPlayer();
    const movablePieces = game.getMovablePieces(player);

    let message = BOT_MARKER + `🎲 *DICE ROLL*\n\n`;
    message += `@${player.fullJid.split('@')[0]} rolled: *${rollResult.roll}*\n\n`;

    if (rollResult.burned) {
      message += `⚡ *BURNED!* ⚡\n3 consecutive 6s! Turn skipped!\n\n`;
      // 💡 FIX: Force-clear extra turn before calling nextTurn — previously
      // if hasExtraTurn was true from a previous six, nextTurn() would
      // just clear the flag without advancing the turn, giving the player
      // another roll despite being burned.
      game.hasExtraTurn = false;
      game.nextTurn();
      message += `Next turn: @${game.getCurrentPlayer().fullJid.split('@')[0]}`;
    } else if (movablePieces.length === 0) {
      message += `❌ No movable pieces!\n\n`;
      if (rollResult.extraTurn) {
        message += `🎲 But you rolled a 6! Roll again!`;
        game.hasExtraTurn = true;
      } else {
        game.nextTurn();
        message += `Next turn: @${game.getCurrentPlayer().fullJid.split('@')[0]}`;
      }
    } else if (movablePieces.length === 1) {
      const pieceToMove = movablePieces[0];
      message += `✅ Only piece ${pieceToMove} can move - Auto-moving!\n\n`;
      const moveResult = game.movePiece(player, pieceToMove);
      // 💡 FIX: Check if auto-move actually succeeded — previously if the
      // move failed (e.g., wall block), the turn advanced anyway.
      if (!moveResult.success) {
        message += `❌ Move blocked! ${moveResult.error || 'Cannot move there.'}\n\n`;
        game.hasExtraTurn = false;
        game.nextTurn();
        message += `Next turn: @${game.getCurrentPlayer().fullJid.split('@')[0]}`;
      } else {
      if (moveResult.captured) message += `⚔️ *CAPTURED!* ⚔️\nOpponent sent back to base!\n\n`;
      if (moveResult.reachedHome) message += `🏠 *PIECE HOME!* 🏠\n\n`;
      if (moveResult.won) {
        const reward = 500;
        economy.addMoney(player.fullJid, reward);
        message += `👑 *VICTORY!* 👑\n@${player.fullJid.split('@')[0]} wins!\n💰 *Reward:* +${reward} Zeni\n\n🎉 All pieces home! 🎉`;
        try {
          const socialSystem = require('../rpg/socialSystem');
          const gamePlayers = game.players.map(p => p.fullJid);
          for (let i = 0; i < gamePlayers.length; i++) {
            for (let j = i + 1; j < gamePlayers.length; j++) {
              socialSystem.incrementRelationship(gamePlayers[i], gamePlayers[j], 5);
            }
          }
        } catch (socialErr) {}
        if (game.timeout) clearTimeout(game.timeout);
        activeGames.delete(chatId);
      } else {
        if (moveResult.extraTurn || game.hasExtraTurn) {
          message += `🔥 Extra turn! Roll again!\nUse: \`${botConfig.getPrefix()} ludo roll\``;
          game.hasExtraTurn = false;
        } else {
          game.nextTurn();
          message += `Next turn: @${game.getCurrentPlayer().fullJid.split('@')[0]}\nUse: \`${botConfig.getPrefix()} ludo roll\``;
        }
      }
      } // end of else (moveResult.success)
    } else {
      message += `✅ Movable pieces: ${movablePieces.join(', ')}\n\n`;
      message += `Use: \`${botConfig.getPrefix()} ludo move <piece>\``;
      if (rollResult.extraTurn) {
        message += `\n\n🔥 Rolled a 6! Extra turn after move!`;
        game.hasExtraTurn = true;
      }
    }

    const imageBuffer = await renderBoard(game, sock);
    const mentions = [player.fullJid, game.getCurrentPlayer().fullJid].filter((v, i, a) => a.indexOf(v) === i);
    if (imageBuffer) {
      await sock.sendMessage(chatId, { image: imageBuffer, caption: message, mentions: mentions }, { quoted: m });
    } else {
      await sock.sendMessage(chatId, { text: message, mentions: mentions }, { quoted: m });
    }
    return { success: true };
  },

  movePiece: async (sock, chatId, senderJid, pieceNum, BOT_MARKER, m) => {
    globalSock = sock;
    const game = activeGames.get(chatId);
    if (!game) return { success: false, message: BOT_MARKER + "❌ No active Ludo game!" };
    const player = game.getPlayerByJid(senderJid);
    if (!player) return { success: false, message: BOT_MARKER + "❌ You're not in this game!" };
    if (normalizeJid(game.getCurrentPlayer().fullJid) !== normalizeJid(senderJid)) return { success: false, message: BOT_MARKER + "❌ Not your turn!" };

    const moveResult = game.movePiece(player, pieceNum);
    game.resetTimeout(sock);
    if (!moveResult.success) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ ${moveResult.error}` }, { quoted: m });
      return { success: false };
    }

    let message = BOT_MARKER + `🎮 *MOVE COMPLETE*\n\n`;
    message += `@${player.fullJid.split('@')[0]} moved piece ${pieceNum}\n\n`;
    if (moveResult.captured) message += `⚔️ *CAPTURED!* ⚔️\nOpponent sent back to base!\n\n`;
    if (moveResult.reachedHome) message += `🏠 *PIECE HOME!* 🏠\n\n`;
    if (moveResult.won) {
      const reward = 500;
      economy.addMoney(player.fullJid, reward);
      message += `👑 *VICTORY!* 👑\n@${player.fullJid.split('@')[0]} wins!\n💰 *Reward:* +${reward} Zeni\n\n🎉 All pieces home! 🎉`;
      try {
        const socialSystem = require('../rpg/socialSystem');
        const gamePlayers = game.players.map(p => p.fullJid);
        for (let i = 0; i < gamePlayers.length; i++) {
          for (let j = i + 1; j < gamePlayers.length; j++) {
            socialSystem.incrementRelationship(gamePlayers[i], gamePlayers[j], 5);
          }
        }
      } catch (socialErr) {}
      if (game.timeout) clearTimeout(game.timeout);
      activeGames.delete(chatId);
    } else {
      if (moveResult.extraTurn || game.hasExtraTurn) {
        message += `🔥 Extra turn! Roll again!\nUse: \`${botConfig.getPrefix()} ludo roll\``;
        game.hasExtraTurn = false;
      } else {
        game.nextTurn();
        message += `Next turn: @${game.getCurrentPlayer().fullJid.split('@')[0]}\nUse: \`${botConfig.getPrefix()} ludo roll\``;
      }
    }

    const imageBuffer = await renderBoard(game, sock);
    const mentions = [player.fullJid, game.getCurrentPlayer()?.fullJid].filter(Boolean);
    if (imageBuffer) {
      await sock.sendMessage(chatId, { image: imageBuffer, caption: message, mentions: mentions }, { quoted: m });
    } else {
      await sock.sendMessage(chatId, { text: message, mentions: mentions }, { quoted: m });
    }
    return { success: true };
  },

  showBoard: async (sock, chatId, BOT_MARKER, m) => {
    globalSock = sock;
    const game = activeGames.get(chatId);
    if (!game) return { success: false, message: BOT_MARKER + "❌ No active Ludo game!" };
    const imageBuffer = await renderBoard(game, sock);
    const currentPlayer = game.getCurrentPlayer();
    const message = BOT_MARKER + `🎲 *LUDO BOARD*\n\nCurrent turn: @${currentPlayer.fullJid.split('@')[0]}\nLast roll: ${game.lastRoll || 'None'}\n\nUse: \`${botConfig.getPrefix()} ludo roll\``;
    if (imageBuffer) {
      await sock.sendMessage(chatId, { image: imageBuffer, caption: message, mentions: [currentPlayer.fullJid] }, { quoted: m });
    } else {
      await sock.sendMessage(chatId, { text: message, mentions: [currentPlayer.fullJid] }, { quoted: m });
    }
    return { success: true };
  },

  endGame: async (sock, chatId, senderJid, BOT_MARKER, m) => {
    globalSock = sock;
    const game = activeGames.get(chatId);
    if (!game) return { success: false, message: BOT_MARKER + "❌ No active Ludo game!" };
    // 💡 FIX: Only players or admins can end the game — previously any user
    // could grief an ongoing game by typing '.ludo end'.
    const isPlayer = game.players && game.players.some(p => normalizeJid(p.jid) === normalizeJid(senderJid));
    if (!isPlayer) {
      // Allow if sender is admin (check via sock if needed — for now block non-players)
      return { success: false, message: BOT_MARKER + "❌ Only players in the game can end it!" };
    }
    if (game.timeout) clearTimeout(game.timeout);
    activeGames.delete(chatId);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "✅ Ludo game ended!" }, { quoted: m });
    return { success: true };
  }
};