// ============================================
// JOKER TIC-TAC-TOE - ULTIMATE VERSION v2.0
// Features: 3x3, 4x4, 5x5 grids, proper scoring, better leaderboard
// ============================================

const { Jimp, loadFont } = require('jimp');
const { SANS_64_BLACK, SANS_32_BLACK, SANS_16_BLACK } = require('jimp/fonts');
const fs = require('fs');
const path = require('path');
const botConfig = require('../botConfig');
const economy = require('./economy');
const system = require('./system'); // NEW: Database System Module

// ============================================
// SCOREBOARD MANAGEMENT (UPGRADED)
// ============================================

function updateScoreboard(playerJid, playerName, points) {
    const scores = system.get('ttt_scores', {});
    const normalizedJid = normalizeJid(playerJid);
    
    if (!scores[normalizedJid]) {
        scores[normalizedJid] = {
            name: playerName !== 'Player' ? playerName : 'User',
            score: 0,
            fullJid: playerJid
        };
    }
    
    scores[normalizedJid].score += points;
    
    if (!scores[normalizedJid].fullJid) {
        scores[normalizedJid].fullJid = playerJid;
    }
    
    if (playerName !== 'Player' && playerName !== 'Opponent') {
        scores[normalizedJid].name = playerName;
    }
    
    system.set('ttt_scores', scores);
}

function getLeaderboardText() {
    const scores = system.get('ttt_scores', {});
    const sorted = Object.entries(scores)
        .sort(([, a], [, b]) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.name.localeCompare(b.name);
        })
        .slice(0, 10);
        
    if (sorted.length === 0) return "No scores recorded yet.";
    
    return sorted.map(([jid, data], i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const score = data.score >= 0 ? `+${data.score}` : data.score;
        return `${medal} @${jid.split('@')[0]} • ${score} pts`;
    }).join('\n');
}

async function renderLeaderboard() {
    try {
        const backgroundPath = botConfig.getAssetPath('scores.png');
        let image;
        
        if (fs.existsSync(backgroundPath)) {
            image = await Jimp.read(backgroundPath);
        } else {
            image = new Jimp({ width: 800, height: 1000, color: 0x1a1a2eff });
        }
        
        const buffer = await image.getBuffer('image/png');
        return buffer;
    } catch (err) {
        console.error('❌ Leaderboard rendering failed:', err);
        return null;
    }
}

function getAllScores() {
  return system.get('ttt_scores', {});
}

// ============================================
// GAME STATE MANAGEMENT
// ============================================

const activeGames = new Map();

// Winning patterns for different grid sizes
const WINNING_PATTERNS = {
  3: [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ],
  8: null,  // Generated dynamically (8x8 grid, 4-in-a-row)
  16: null, // Generated dynamically (16x16 grid, 5-in-a-row)
};

// Generate winning patterns for larger grids
function generateWinningPatterns(gridSize, winLength) {
  const patterns = [];
  
  // Rows - horizontal wins
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col <= gridSize - winLength; col++) {
      const pattern = [];
      for (let i = 0; i < winLength; i++) {
        pattern.push(row * gridSize + col + i);
      }
      patterns.push(pattern);
    }
  }
  
  // Columns - vertical wins
  for (let col = 0; col < gridSize; col++) {
    for (let row = 0; row <= gridSize - winLength; row++) {
      const pattern = [];
      for (let i = 0; i < winLength; i++) {
        pattern.push((row + i) * gridSize + col);
      }
      patterns.push(pattern);
    }
  }
  
  // Diagonals (top-left to bottom-right)
  for (let row = 0; row <= gridSize - winLength; row++) {
    for (let col = 0; col <= gridSize - winLength; col++) {
      const pattern = [];
      for (let i = 0; i < winLength; i++) {
        pattern.push((row + i) * gridSize + (col + i));
      }
      patterns.push(pattern);
    }
  }
  
  // Diagonals (top-right to bottom-left)
  for (let row = 0; row <= gridSize - winLength; row++) {
    for (let col = winLength - 1; col < gridSize; col++) {
      const pattern = [];
      for (let i = 0; i < winLength; i++) {
        pattern.push((row + i) * gridSize + (col - i));
      }
      patterns.push(pattern);
    }
  }
  
  return patterns;
}

// Initialize large grid patterns
WINNING_PATTERNS[8] = generateWinningPatterns(8, 4);   // 8x8, 4-in-a-row
WINNING_PATTERNS[16] = generateWinningPatterns(16, 5); // 16x16, 5-in-a-row

console.log(`✅ TTT Patterns: 3x3=${WINNING_PATTERNS[3].length}, 8x8=${WINNING_PATTERNS[8].length}, 16x16=${WINNING_PATTERNS[16].length}`);

function normalizeJid(jid) {
  if (!jid) return null;
  return jid.split('@')[0].split(':')[0];
}

function getPlayerMarker(game, playerJid) {
  const normalized = normalizeJid(playerJid);
  if (normalized === normalizeJid(game.playerA)) return 'X';
  if (normalized === normalizeJid(game.playerB)) return 'O';
  return null;
}

function checkWin(board, marker, gridSize) {
  const patterns = WINNING_PATTERNS[gridSize];
  for (const pattern of patterns) {
    if (pattern.every(index => board[index] === marker)) {
      return pattern;
    }
  }
  return null;
}

function isBoardFull(board) {
  return board.every(cell => cell !== null);
}

function canWin(board, marker, gridSize) {
  const patterns = WINNING_PATTERNS[gridSize];
  for (const pattern of patterns) {
    const cells = pattern.map(i => board[i]);
    const opponentMarker = marker === 'X' ? 'O' : 'X';
    const hasOpponent = cells.some(c => c === opponentMarker);
    if (!hasOpponent) return true;
  }
  return false;
}

function isDrawInevitable(board, gridSize) {
  if (isBoardFull(board)) return true;
  const xCanWin = canWin(board, 'X', gridSize);
  const oCanWin = canWin(board, 'O', gridSize);
  return !xCanWin && !oCanWin;
}

// ============================================
// GAME LOGIC
// ============================================

function createGame(playerAJid, playerBJid, chatId, gridSize = 3) {
  const boardSize = gridSize * gridSize;
  const gameState = {
    board: Array(boardSize).fill(null),
    playerA: playerAJid,
    playerB: playerBJid,
    currentTurn: playerAJid,
    status: 'active',
    winner: null,
    lastMoveIndex: null,
    chatId: chatId,
    gridSize: gridSize,
    createdAt: Date.now()
  };
  activeGames.set(chatId, gameState);
  return gameState;
}

function getGame(chatId) {
  return activeGames.get(chatId) || null;
}

function deleteGame(chatId) {
  activeGames.delete(chatId);
}

function hasActiveGame(chatId) {
  return activeGames.has(chatId);
}

function makeMove(chatId, playerJid, cellIndex) {
  const game = getGame(chatId);
  if (!game) return { success: false, error: 'No active game in this chat' };
  if (game.status !== 'active') return { success: false, error: 'Game already ended' };

  const normalizedPlayer = normalizeJid(playerJid);
  const normalizedCurrentTurn = normalizeJid(game.currentTurn);
  const maxCell = (game.gridSize * game.gridSize) - 1;

  if (normalizedPlayer !== normalizeJid(game.playerA) && normalizedPlayer !== normalizeJid(game.playerB)) {
    return { success: false, error: 'You are not in this game' };
  }
  if (normalizedPlayer !== normalizedCurrentTurn) return { success: false, error: 'Not your turn' };
  if (cellIndex < 0 || cellIndex > maxCell || game.board[cellIndex] !== null) {
    return { success: false, error: 'Invalid move' };
  }

  const marker = getPlayerMarker(game, playerJid);
  game.board[cellIndex] = marker;
  game.lastMoveIndex = cellIndex;

  const winPattern = checkWin(game.board, marker, game.gridSize);
  if (winPattern) {
    game.status = 'win';
    game.winner = playerJid;
    return { success: true, game, winPattern };
  }

  if (isDrawInevitable(game.board, game.gridSize)) {
    game.status = 'draw';
    return { success: true, game };
  }

  game.currentTurn = (game.currentTurn === game.playerA) ? game.playerB : game.playerA;
  return { success: true, game };
}

// ============================================
// IMAGE RENDERING (JIMP v1.x) - MULTI-GRID
// ============================================

const COLORS = {
  background: 0xECF0F1FF, 
  grid: 0x34495EFF,
  x: 0xE74C3CFF,
  o: 0x3498DBFF,
  highlight: 0xF39C12FF
};

async function renderBoard(board, gridSize = 3, lastMoveIndex = null, winPattern = null) {
  try {
    const size = 600;
    const cellSize = size / gridSize;
    
    const image = new Jimp({ width: size, height: size, color: COLORS.background });
    
    // ✅ FIXED: Load the correct font size based on grid BEFORE the loop!
    let font = null;
    let xOffset, yOffset;
    
    try {
        if (gridSize === 3) {
            font = await loadFont(SANS_64_BLACK);  // 64px font for 3x3
            xOffset = 85;
            yOffset = 70;
        } else if (gridSize === 8) {
            font = await loadFont(SANS_16_BLACK);  // 16px font for 8x8
            xOffset = 18;
            yOffset = 22;
        } else if (gridSize === 16) {
            font = await loadFont(SANS_16_BLACK);  // 16px font for 16x16 (smallest we have)
            xOffset = 8;
            yOffset = 10;
        } else {
            // Fallback: use 32px for medium grids
            font = await loadFont(SANS_32_BLACK);
            xOffset = Math.floor(cellSize / 5);
            yOffset = Math.floor(cellSize / 4);
        }
        console.log(`✅ Loaded font for ${gridSize}x${gridSize} grid`);
    } catch (e) {
        console.warn('⚠️ Font Load Error:', e.message);
    }

    const totalCells = gridSize * gridSize;
    for (let i = 0; i < totalCells; i++) {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      const x = col * cellSize;
      const y = row * cellSize;
      const centerX = x + cellSize / 2;
      const centerY = y + cellSize / 2;

      // Draw cell numbers for empty cells
      if (board[i] === null && font) {
          try {
              // Just print with the pre-loaded font and offsets
              image.print({
                  font: font,
                  x: Math.floor(x + xOffset),
                  y: Math.floor(y + yOffset),
                  text: i.toString()
              });
          } catch (printErr) {
              console.error('⚠️ Print Error:', printErr);
          }
      }

      // Highlight winning cells
      if (winPattern && winPattern.includes(i)) {
        drawRect(image, x + 2, y + 2, cellSize - 4, cellSize - 4, COLORS.highlight, true, 0.2);
      }
      // Highlight last move
      if (i === lastMoveIndex && !winPattern) {
        drawRect(image, x + 10, y + 10, cellSize - 20, cellSize - 20, COLORS.highlight, false, 1, 3);
      }

      // Draw X or O
      let symbolSize, circleRadius;
      if (gridSize === 3) {
        symbolSize = 70;
        circleRadius = 65;
      } else if (gridSize === 8) {
        symbolSize = 32;  // Fits well in 75px cells
        circleRadius = 28;
      } else if (gridSize === 16) {
        symbolSize = 16;  // Fits in 37.5px cells
        circleRadius = 14;
      } else {
        // Fallback for any size
        symbolSize = Math.floor(cellSize * 0.4);
        circleRadius = Math.floor(cellSize * 0.35);
      }
      
      if (board[i] === 'X') drawX(image, centerX, centerY, symbolSize, COLORS.x);
      else if (board[i] === 'O') drawCircle(image, centerX, centerY, circleRadius, COLORS.o);
    }

    // Draw grid lines
    for (let i = 1; i < gridSize; i++) {
      const pos = Math.floor(i * cellSize);
      drawThickLine(image, pos, 0, pos, size, COLORS.grid, 4);
      drawThickLine(image, 0, pos, size, pos, COLORS.grid, 4);
    }

    const buffer = await image.getBuffer('image/png');
    console.log('✅ Board rendered successfully');
    return buffer;
  } catch (err) {
    console.error('❌ Rendering failed:', err);
    return null;
  }
}

function drawX(image, centerX, centerY, size, color) {
  const offset = size / 2;
  drawThickLine(image, centerX - offset, centerY - offset, centerX + offset, centerY + offset, color, 10);
  drawThickLine(image, centerX + offset, centerY - offset, centerX - offset, centerY + offset, color, 10);
}

function drawCircle(image, centerX, centerY, radius, color) {
  const thickness = 8;
  for (let angle = 0; angle < 360; angle += 0.5) {
    const rad = (angle * Math.PI) / 180;
    for (let r = radius - thickness; r <= radius; r++) {
      const x = Math.round(centerX + r * Math.cos(rad));
      const y = Math.round(centerY + r * Math.sin(rad));
      if (x >= 0 && x < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
        image.setPixelColor(color, x, y);
      }
    }
  }
}

function drawThickLine(image, x1, y1, x2, y2, color, thickness = 1) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  const half = Math.floor(thickness / 2);

  while (true) {
    for (let ty = -half; ty <= half; ty++) {
      for (let tx = -half; tx <= half; tx++) {
        const px = x1 + tx;
        const py = y1 + ty;
        if (px >= 0 && px < image.bitmap.width && py >= 0 && py < image.bitmap.height) {
          image.setPixelColor(color, px, py);
        }
      }
    }
    if (x1 === x2 && y1 === y2) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x1 += sx; }
    if (e2 < dx) { err += dx; y1 += sy; }
  }
}

function drawRect(image, x, y, width, height, color, filled = true, alpha = 1, borderWidth = 1) {
  if (filled) {
    for (let py = y; py < y + height; py++) {
      for (let px = x; px < x + width; px++) {
        if (px >= 0 && px < image.bitmap.width && py >= 0 && py < image.bitmap.height) {
            const current = image.getPixelColor(px, py);
            image.setPixelColor(blendColors(current, color, alpha), px, py);
        }
      }
    }
  } else {
    drawThickLine(image, x, y, x + width, y, color, borderWidth);
    drawThickLine(image, x, y + height, x + width, y + height, color, borderWidth);
    drawThickLine(image, x, y, x, y + height, color, borderWidth);
    drawThickLine(image, x + width, y, x + width, y + height, color, borderWidth);
  }
}

function blendColors(c1, c2, alpha) {
  const r = Math.round(((c1 >> 24) & 0xFF) * (1 - alpha) + ((c2 >> 24) & 0xFF) * alpha);
  const g = Math.round(((c1 >> 16) & 0xFF) * (1 - alpha) + ((c2 >> 16) & 0xFF) * alpha);
  const b = Math.round(((c1 >> 8) & 0xFF) * (1 - alpha) + ((c2 >> 8) & 0xFF) * alpha);
  return (r << 24) | (g << 16) | (b << 8) | (c1 & 0xFF);
}

function getBoardText(board, gridSize, lastMoveIndex = null, winPattern = null) {
  const display = board.map((cell, i) => {
    if (winPattern && winPattern.includes(i)) return cell === 'X' ? '✖️' : '⭕';
    if (i === lastMoveIndex && !winPattern) return cell === 'X' ? '✖️' : '⭕';
    if (cell === 'X') return '❌';
    if (cell === 'O') return '⭕';
    return i.toString().padStart(gridSize === 5 ? 2 : 1, ' ');
  });
  
  let text = '';
  for (let row = 0; row < gridSize; row++) {
    const rowCells = display.slice(row * gridSize, (row + 1) * gridSize);
    text += rowCells.join(' │ ') + '\n';
    if (row < gridSize - 1) {
      text += '─'.repeat(gridSize * 4 - 1) + '\n';
    }
  }
  return text;
}

// ============================================
// WHATSAPP HANDLERS
// ============================================

module.exports = {
  getAllScores,
  handleStartGame: async (sock, chatId, senderJid, mentionedJids, botMarker, m, gridSize = 3) => {
    if (hasActiveGame(chatId)) return sock.sendMessage(chatId, { text: botMarker + `❌ Game in progress. Finish it first or use \`${botConfig.getPrefix()} ttt end\`` }, { quoted: m });
    if (!mentionedJids || mentionedJids.length === 0) return sock.sendMessage(chatId, { text: botMarker + `❌ Tag your opponent: \`${botConfig.getPrefix()} ${'t'.repeat(gridSize)} @opponent\`` }, { quoted: m });

    const opponentJid = mentionedJids[0];
    if (normalizeJid(senderJid) === normalizeJid(opponentJid)) return sock.sendMessage(chatId, { text: botMarker + '❌ You can\'t play against yourself' }, { quoted: m });

    const game = createGame(senderJid, opponentJid, chatId, gridSize);
    
    console.log(`🎮 Rendering ${gridSize}x${gridSize} board...`);
    const imageBuffer = await renderBoard(game.board, gridSize);
    
    const gridName = gridSize === 3 ? 'TIC-TAC-TOE' : gridSize === 8 ? 'MEGA 8x8 (4-in-a-row)' : '16x16 ULTRA (5-in-a-row)';
    const points = gridSize === 3 ? 1 : gridSize === 8 ? 2 : 3;
    const maxCell = (gridSize * gridSize) - 1;
    
    const caption = botMarker + `🎮 *${gridName}*\n\n❌ @${normalizeJid(senderJid)} (X)\n⭕ @${normalizeJid(opponentJid)} (O)\n\n@${normalizeJid(senderJid)}'s turn\nUse: \`${botConfig.getPrefix()} move <0-${maxCell}>\`\n\n🏆 Win = +${points} pts | Draw = 0 pts | Lose = -1 pt`;

    if (imageBuffer) {
      console.log('✅ Sending image board');
      await sock.sendMessage(chatId, { image: imageBuffer, caption, contextInfo: { mentionedJid: [senderJid, opponentJid] } });
    } else {
      console.log('⚠️ Falling back to text board');
      await sock.sendMessage(chatId, { text: caption + '\n\n' + getBoardText(game.board, gridSize), contextInfo: { mentionedJid: [senderJid, opponentJid] } });
    }
  },

  handleMove: async (sock, chatId, senderJid, cellIndex, botMarker, m, senderName = 'Player') => {
    const result = makeMove(chatId, senderJid, parseInt(cellIndex));
    if (!result.success) return sock.sendMessage(chatId, { text: botMarker + `❌ ${result.error}` }, { quoted: m });

    console.log(`🎮 Rendering move result for ${result.game.gridSize}x${result.game.gridSize} board...`);
    const imageBuffer = await renderBoard(result.game.board, result.game.gridSize, result.game.lastMoveIndex, result.winPattern);
    
    let caption, mentionedJid;
    const gridSize = result.game.gridSize;
    const points = gridSize === 3 ? 1 : gridSize === 8 ? 2 : 3;

    if (result.game.status === 'win') {
      const marker = getPlayerMarker(result.game, result.game.winner);
      const winnerName = normalizeJid(result.game.winner) === normalizeJid(senderJid) ? senderName : 'Opponent';
      const loserJid = result.game.winner === result.game.playerA ? result.game.playerB : result.game.playerA;
      
      // Update scores
      updateScoreboard(result.game.winner, winnerName, points);
      // UPDATE: Don't overwrite loser's name with "Player". 'Player' is passed but ignored by updateScoreboard if name exists.
      updateScoreboard(loserJid, 'Player', -1);
      
      // Award Money
      const moneyReward = points * 100; // 100, 200, 300
      economy.addMoney(result.game.winner, moneyReward);

      caption = botMarker + `🏆 *${marker === 'X' ? '❌' : '⭕'} @${normalizeJid(result.game.winner)} WINS!*\n\n+${points} points for winner!\n💰 +${moneyReward} Zeni\n-1 point for loser!`;
      mentionedJid = [result.game.playerA, result.game.playerB];
      deleteGame(chatId);
    } else if (result.game.status === 'draw') {
      // UPDATE: Add players to scoreboard with 0 points so they appear on leaderboard
      updateScoreboard(result.game.playerA, 'Player', 0);
      updateScoreboard(result.game.playerB, 'Player', 0);

      caption = botMarker + `⚖️ *DRAW!* No winning moves left.\n\nNo points awarded, but match recorded!`;
      mentionedJid = [result.game.playerA, result.game.playerB];
      deleteGame(chatId);
    } else {
      caption = botMarker + `${getPlayerMarker(result.game, result.game.currentTurn) === 'X' ? '❌' : '⭕'} @${normalizeJid(result.game.currentTurn)}'s turn`;
      mentionedJid = [result.game.currentTurn];
    }

    if (imageBuffer) {
      console.log('✅ Sending image result');
      await sock.sendMessage(chatId, { image: imageBuffer, caption, contextInfo: { mentionedJid } });
    } else {
      console.log('⚠️ Falling back to text result');
      await sock.sendMessage(chatId, { text: caption + '\n\n' + getBoardText(result.game.board, result.game.gridSize, result.game.lastMoveIndex, result.winPattern), contextInfo: { mentionedJid } });
    }
  },

  handleEndGame: async (sock, chatId, senderJid, botMarker, m) => {
    const game = getGame(chatId);
    if (!game) return sock.sendMessage(chatId, { text: botMarker + '❌ No active game.' }, { quoted: m });
    
    const sender = normalizeJid(senderJid);
    if (sender !== normalizeJid(game.playerA) && sender !== normalizeJid(game.playerB)) {
      return sock.sendMessage(chatId, { text: botMarker + '❌ Only players can end the game.' }, { quoted: m });
    }

    deleteGame(chatId);
    await sock.sendMessage(chatId, { text: botMarker + '🛑 Game ended by @' + sender, contextInfo: { mentionedJid: [senderJid] } });
  },

  handleScores: async (sock, chatId, botMarker, m) => {
    console.log('🏆 Rendering leaderboard image...');
    const imageBuffer = await renderLeaderboard();
    const leaderboardText = getLeaderboardText();
    
    let mentionedJids = [];
    try {
        const scores = system.get('ttt_scores', {});
        const sorted = Object.entries(scores)
            .sort(([, a], [, b]) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 10);
        
        mentionedJids = sorted.map(([jid, data]) => {
            return data.fullJid || `${jid}@s.whatsapp.net`;
        });
    } catch (e) {
        console.error('Error loading scores for mentions:', e);
    }
    
    // ✅ STYLED CAPTION with separator lines
    const caption = botMarker + `━━━━━━━━━━━━━━━━━
🎮 *TIC-TAC-TOE LEADERBOARD*
━━━━━━━━━━━━━━━━━

${leaderboardText}

━━━━━━━━━━━━━━━━━
💡 3x3=1pt • 8x8=2pts • 16x16=3pts
Draw=0pts • Loss=-1pt
`;
    
    if (imageBuffer) {
      console.log('✅ Sending leaderboard image');
      await sock.sendMessage(chatId, { 
        image: imageBuffer, 
        caption, 
        contextInfo: { mentionedJid: mentionedJids } 
      }, { quoted: m });
    } else {
      console.log('⚠️ Falling back to text leaderboard');
      await sock.sendMessage(chatId, { 
        text: caption, 
        contextInfo: { mentionedJid: mentionedJids } 
      }, { quoted: m });
    }
  },

  handleShowBoard: async (sock, chatId, botMarker, m) => {
    const game = getGame(chatId);
    if (!game) return sock.sendMessage(chatId, { text: botMarker + '❌ No active game.' }, { quoted: m });

    console.log(`🎮 Rendering current ${game.gridSize}x${game.gridSize} board...`);
    const imageBuffer = await renderBoard(game.board, game.gridSize, game.lastMoveIndex);
    const caption = botMarker + `${getPlayerMarker(game, game.currentTurn) === 'X' ? '❌' : '⭕'} @${normalizeJid(game.currentTurn)}'s turn`;

    if (imageBuffer) {
      console.log('✅ Sending current board image');
      await sock.sendMessage(chatId, { image: imageBuffer, caption, contextInfo: { mentionedJid: [game.currentTurn] } }, { quoted: m });
    } else {
      console.log('⚠️ Falling back to text board');
      await sock.sendMessage(chatId, { text: caption + '\n\n' + getBoardText(game.board, game.gridSize, game.lastMoveIndex), contextInfo: { mentionedJid: [game.currentTurn] } }, { quoted: m });
    }
  }
};
