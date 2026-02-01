// ============================================
// AFRICAN LUDO - FIXED WITH WORKING LOGIC
// Based on proven HTML version coordinates
// ============================================

const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');
const botConfig = require('../botConfig');
const axios = require('axios');
const economy = require('./economy');

// ============================================
// PROFILE PICTURE MANAGEMENT
// ============================================

const getPfpDir = () => botConfig.getDataPath('pfp');

async function fetchProfilePicture(sock, jid) {
  try {
    const normalizedJid = jid.split('@')[0].split(':')[0];
    const pfpPath = path.join(getPfpDir(), `${normalizedJid}.jpg`);
    
    if (fs.existsSync(pfpPath)) {
      console.log(`✅ Using cached PFP for ${normalizedJid}`);
      return pfpPath;
    }
    
    console.log(`📸 Fetching PFP for ${normalizedJid}...`);
    
    try {
      const pfpUrl = await sock.profilePictureUrl(jid, 'image');
      
      if (pfpUrl) {
        const response = await axios.get(pfpUrl, { 
          responseType: 'arraybuffer',
          timeout: 10000 
        });
        
        fs.writeFileSync(pfpPath, Buffer.from(response.data));
        console.log(`✅ Cached PFP for ${normalizedJid}`);
        return pfpPath;
      }
    } catch (pfpErr) {
      console.log(`⚠️ PFP not available for ${normalizedJid}: ${pfpErr.message}`);
    }
    
    return null;
    
  } catch (err) {
    console.error(`❌ Error fetching PFP: ${err.message}`);
    return null;
  }
}

// ============================================
// BOARD CONFIGURATION - USING PROVEN COORDS
// ============================================

const COLORS = {
  RED: 'red',
  BLUE: 'blue',
  YELLOW: 'yellow',
  GREEN: 'green'
};

const COLOR_HEX = {
  red: (0xFF4D4DFF >>> 0),
  blue: (0x3498DBFF >>> 0),
  yellow: (0xF1C40FFF >>> 0),
  green: (0x2ECC71FF >>> 0),
  white: (0xFFFFFFFF >>> 0),
  black: (0x000000FF >>> 0),
  gray: (0xCCCCCCFF >>> 0),
  lightgray: (0xF0F2F5FF >>> 0),
  darkgray: (0x333333FF >>> 0),
  border: (0x333333FF >>> 0)
};

const BOARD_SIZE = 900;
const CELL_SIZE = 60;
const GRID_SIZE = 15;

// ✅ PROVEN WORKING TRACK - From HTML version (converted to 0-indexed)
// Grid is 15x15, coordinates are [row, col] starting from 0
const MAIN_TRACK = [
  // Red straight (moving right)
  [6,1], [6,2], [6,3], [6,4], [6,5],
  // Up towards Green
  [5,6], [4,6], [3,6], [2,6], [1,6], [0,6],
  [0,7], [0,8], // Green top turn
  // Green straight (moving down)
  [1,8], [2,8], [3,8], [4,8], [5,8],
  // Right towards Yellow
  [6,9], [6,10], [6,11], [6,12], [6,13], [6,14],
  [7,14], [8,14], // Yellow right turn
  // Yellow straight (moving left)
  [8,13], [8,12], [8,11], [8,10], [8,9],
  // Down towards Blue
  [9,8], [10,8], [11,8], [12,8], [13,8], [14,8],
  [14,7], [14,6], // Blue bottom turn
  // Blue straight (moving up)
  [13,6], [12,6], [11,6], [10,6], [9,6],
  // Left towards Red
  [8,5], [8,4], [8,3], [8,2], [8,1], [8,0],
  [7,0], // Red left turn
  [6,0]  // 51st position (index 51) - connects back to start
];

// ✅ HOME PATHS - 6 squares each, last square is the winning position
const HOME_PATHS = {
  red: [[7,1], [7,2], [7,3], [7,4], [7,5], [7,6]],      // Moving right to center
  green: [[1,7], [2,7], [3,7], [4,7], [5,7], [6,7]],    // Moving down to center
  yellow: [[7,13], [7,12], [7,11], [7,10], [7,9], [7,8]], // Moving left to center
  blue: [[13,7], [12,7], [11,7], [10,7], [9,7], [8,7]]  // Moving up to center
};

// ✅ START POSITIONS - Where pieces enter the main track
const START_POSITIONS = {
  red: 0,      // Enters at [6,1]
  green: 13,   // Enters at [1,8]
  yellow: 26,  // Enters at [8,13]
  blue: 39     // Enters at [13,6]
};

// ✅ HOME ENTRANCE - Turn-off points to enter colored home path
// Formula: (StartIndex + 50) % 52
const HOME_ENTRANCE = {
  red: 50,     // (0 + 50) % 52 = 50
  green: 11,   // (13 + 50) % 52 = 11
  yellow: 24,  // (26 + 50) % 52 = 24
  blue: 37     // (39 + 50) % 52 = 37
};

const CENTER_FINISH = [7, 7];

// Safe squares (star positions)
const SAFE_SQUARES = [0, 13, 26, 39]; // Starting positions are safe

// Base positions (where pieces start before entering)
const BASES = {
  red: [[2, 2], [2, 4], [4, 2], [4, 4]],
  green: [[2, 10], [2, 12], [4, 10], [4, 12]],
  yellow: [[10, 10], [10, 12], [12, 10], [12, 12]],
  blue: [[10, 2], [10, 4], [12, 2], [12, 4]]
};

// ============================================
// GAME STATE MANAGEMENT
// ============================================

const activeGames = new Map();

class LudoGame {
  constructor(chatId, playerJids) {
    this.chatId = chatId;
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
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
  }

  getPlayerByJid(jid) {
    return this.players.find(p => p.jid === jid || p.fullJid === jid);
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

    // Check if move would overshoot home
    if (piece.onHomePath) {
      const newIndex = piece.homePathIndex + this.lastRoll;
      return newIndex <= 5; // Home path is 0-5 (6 squares)
    }

    return true;
  }

  checkWall(position, excludePlayer = null) {
    const piecesAtPosition = [];
    
    this.players.forEach(player => {
      if (excludePlayer && player.jid === excludePlayer.jid) return;
      
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

    // ✅ Entering from base with a 6
    if (piece.inBase && roll === 6) {
      const startPos = START_POSITIONS[player.color];
      piece.position = startPos;
      piece.inBase = false;
      
      const captureResult = this.checkCapture(player, startPos);
      if (captureResult.captured) {
        captured = true;
      }
      
      return { 
        success: true, 
        fromBase: true, 
        captured, 
        extraTurn: true
      };
    }

    // ✅ Moving on home path
    if (piece.onHomePath) {
      const newIndex = piece.homePathIndex + roll;
      
      if (newIndex > 5) {
        return { success: false, error: 'Cannot move - would overshoot home!' };
      }
      
      piece.homePathIndex = newIndex;
      
      // Check if reached winning position (index 5 = last square)
      if (newIndex === 5) {
        piece.inHome = true;
        piece.onHomePath = false;
        reachedHome = true;
        
        const allHome = player.pieces.every(p => p.inHome);
        if (allHome) {
          this.gameOver = true;
          this.winner = player.fullJid;
        }
        
        return { 
          success: true, 
          reachedHome: true, 
          won: allHome,
          extraTurn: true
        };
      }
      
      return { success: true };
    }

    // ✅ Moving on main track
    const currentPos = piece.position;
    const turnOffIndex = HOME_ENTRANCE[player.color];
    
    let stepsRemaining = roll;
    let newPos = currentPos;
    
    // Simulate movement step by step
    while (stepsRemaining > 0) {
      // Check if we're at the turn-off point
      if (newPos === turnOffIndex) {
        // Enter home path!
        piece.onHomePath = true;
        piece.position = -1;
        piece.homePathIndex = 0;
        stepsRemaining--;
        
        // Continue moving on home path with remaining steps
        while (stepsRemaining > 0) {
          piece.homePathIndex++;
          
          if (piece.homePathIndex > 5) {
            return { success: false, error: 'Cannot move - would overshoot home!' };
          }
          
          if (piece.homePathIndex === 5) {
            piece.inHome = true;
            piece.onHomePath = false;
            reachedHome = true;
            
            const allHome = player.pieces.every(p => p.inHome);
            if (allHome) {
              this.gameOver = true;
              this.winner = player.fullJid;
            }
            
            return { 
              success: true, 
              reachedHome: true, 
              enteredHomePath: true,
              won: allHome,
              extraTurn: true
            };
          }
          
          stepsRemaining--;
        }
        
        return { success: true, enteredHomePath: true };
      } else {
        // Normal movement on track
        newPos = (newPos + 1) % 52;
        stepsRemaining--;
      }
    }

    // Check for walls
    const wall = this.checkWall(newPos, player);
    if (wall.isWall && wall.color !== player.color) {
      return { success: false, error: `🛡️ WALL BLOCKED! ${wall.color.toUpperCase()} wall!` };
    }

    piece.position = newPos;

    // Check for captures (not on safe squares)
    if (!SAFE_SQUARES.includes(newPos)) {
      const captureResult = this.checkCapture(player, newPos);
      if (captureResult.captured) {
        captured = true;
      }
    }

    this.updateWalls();

    return { 
      success: true, 
      captured, 
      extraTurn: captured
    };
  }

  checkCapture(currentPlayer, position) {
    let captured = false;
    
    this.players.forEach(player => {
      if (player.jid === currentPlayer.jid) return;
      
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
// RENDERING WITH IMPROVED DESIGN
// ============================================

async function renderBoard(game, sock = null) {
  try {
    const image = new Jimp({ 
      width: BOARD_SIZE, 
      height: BOARD_SIZE, 
      color: COLOR_HEX.lightgray 
    });

    drawBackgroundAreas(image);
    drawGrid(image);
    drawHomePaths(image);
    drawSafeSquares(image);
    drawCenterFinish(image);
    drawPlayerBases(image);
    await drawPieces(image, game);
    drawWalls(image, game);
    await drawDice(image, game);
    
    if (sock) {
      await drawProfilePictures(image, game, sock);
    }

    const buffer = await image.getBuffer('image/png');
    return buffer;
  } catch (err) {
    console.error('❌ Board rendering failed:', err);
    return null;
  }
}

function drawBackgroundAreas(image) {
  const cornerSize = 6 * CELL_SIZE;
  
  // Base corners with slight transparency
  fillRect(image, 0, 0, cornerSize, cornerSize, COLOR_HEX.red, 0.35);
  fillRect(image, BOARD_SIZE - cornerSize, 0, cornerSize, cornerSize, COLOR_HEX.green, 0.15);
  fillRect(image, BOARD_SIZE - cornerSize, BOARD_SIZE - cornerSize, cornerSize, cornerSize, COLOR_HEX.yellow, 0.15);
  fillRect(image, 0, BOARD_SIZE - cornerSize, cornerSize, cornerSize, COLOR_HEX.blue, 0.15);
  
  // Draw white inner areas for bases
  const innerSize = cornerSize * 0.7;
  const innerOffset = (cornerSize - innerSize) / 2;
  
  fillRect(image, innerOffset, innerOffset, innerSize, innerSize, COLOR_HEX.white, 1);
  fillRect(image, BOARD_SIZE - cornerSize + innerOffset, innerOffset, innerSize, innerSize, COLOR_HEX.white, 1);
  fillRect(image, BOARD_SIZE - cornerSize + innerOffset, BOARD_SIZE - cornerSize + innerOffset, innerSize, innerSize, COLOR_HEX.white, 1);
  fillRect(image, innerOffset, BOARD_SIZE - cornerSize + innerOffset, innerSize, innerSize, COLOR_HEX.white, 1);
}

function drawGrid(image) {
  const gridColor = COLOR_HEX.darkgray;
  const thickness = 5; // Increased thickness (1px + 4px)
  
  // Vertical lines
  for (let i = 0; i <= GRID_SIZE; i++) {
    const x = i * CELL_SIZE;
    fillRect(image, x - Math.floor(thickness/2), 0, thickness, BOARD_SIZE, gridColor);
  }
  
  // Horizontal lines
  for (let i = 0; i <= GRID_SIZE; i++) {
    const y = i * CELL_SIZE;
    fillRect(image, 0, y - Math.floor(thickness/2), BOARD_SIZE, thickness, gridColor);
  }
}

function drawHomePaths(image) {
  for (const [color, path] of Object.entries(HOME_PATHS)) {
    const colorHex = COLOR_HEX[color];
    
    path.forEach(([row, col]) => {
      const x = col * CELL_SIZE;
      const y = row * CELL_SIZE;
      fillRect(image, x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4, colorHex, 0.4);
    });
  }
}

function drawSafeSquares(image) {
  SAFE_SQUARES.forEach(index => {
    const [row, col] = MAIN_TRACK[index];
    const x = col * CELL_SIZE + CELL_SIZE / 2;
    const y = row * CELL_SIZE + CELL_SIZE / 2;
    
    // Draw star
    drawStar(image, x, y, 15, COLOR_HEX.yellow);
  });
}

function drawCenterFinish(image) {
  const center = 7.5 * CELL_SIZE;
  const triangleSize = CELL_SIZE * 1.5;
  
  const triangles = [
    { color: COLOR_HEX.red, points: [[center, center], [center - triangleSize, center], [center, center - triangleSize]] },
    { color: COLOR_HEX.green, points: [[center, center], [center, center - triangleSize], [center + triangleSize, center]] },
    { color: COLOR_HEX.yellow, points: [[center, center], [center + triangleSize, center], [center, center + triangleSize]] },
    { color: COLOR_HEX.blue, points: [[center, center], [center, center + triangleSize], [center - triangleSize, center]] }
  ];
  
  triangles.forEach(({ color, points }) => {
    fillTriangle(image, points, color);
  });
}

function drawPlayerBases(image) {
  for (const [color, positions] of Object.entries(BASES)) {
    const colorHex = COLOR_HEX[color];
    
    positions.forEach(([row, col]) => {
      const x = col * CELL_SIZE + CELL_SIZE / 2;
      const y = row * CELL_SIZE + CELL_SIZE / 2;
      
      // ✅ FIX: Only draw outline, no filled circle (prevents ghost pieces)
      drawCircleOutline(image, x, y, 22, colorHex, 3);
    });
  }
}

async function drawPieces(image, game) {
  for (const player of game.players) {
    const colorHex = COLOR_HEX[player.color];
    
    for (const piece of player.pieces) {
      if (piece.inHome) continue;

      let gridPos;
      
      if (piece.inBase) {
        const basePositions = BASES[player.color];
        gridPos = basePositions[piece.id - 1];
      } else if (piece.onHomePath) {
        const homePath = HOME_PATHS[player.color];
        gridPos = homePath[piece.homePathIndex];
      } else {
        gridPos = MAIN_TRACK[piece.position];
      }

      const [row, col] = gridPos;
      const x = col * CELL_SIZE + CELL_SIZE / 2;
      const y = row * CELL_SIZE + CELL_SIZE / 2;

      // Draw piece
      drawFilledCircle(image, x, y, 18, colorHex);
      drawCircleOutline(image, x, y, 18, COLOR_HEX.white, 2);
      
      // Draw piece number
      drawPieceNumber(image, x, y, piece.id);
    }
  }
}

function drawWalls(image, game) {
  for (const wall of game.walls) {
    const gridPos = MAIN_TRACK[wall.position];
    const [row, col] = gridPos;
    const x = col * CELL_SIZE + CELL_SIZE / 2;
    const y = row * CELL_SIZE + CELL_SIZE / 2;
    
    drawShield(image, x, y, 25, COLOR_HEX.blue);
  }
}

async function drawDice(image, game) {
  if (game.lastRoll > 0) {
    const centerX = 7.5 * CELL_SIZE;
    const centerY = 7.5 * CELL_SIZE;
    
    // Draw dice
    fillRect(image, centerX - 30, centerY - 30, 60, 60, COLOR_HEX.white, 1);
    drawRect(image, centerX - 30, centerY - 30, 60, 60, COLOR_HEX.black, 2);
    
    drawDiceDots(image, centerX, centerY, game.lastRoll);
  }
}

async function drawProfilePictures(image, game, sock) {
  const cornerPositions = {
    red: { x: 90, y: 90 },
    green: { x: 810, y: 90 },
    yellow: { x: 810, y: 810 },
    blue: { x: 90, y: 810 }
  };
  
  const pfpSize = 120;
  const placeholderPath = botConfig.getAssetPath('placeholder.png');
  
  for (const player of game.players) {
    const position = cornerPositions[player.color];
    if (!position) continue;
    
    try {
      const pfpPath = await fetchProfilePicture(sock, player.fullJid);
      
      let pfpToUse = null;
      
      // Try to load player's actual PFP
      if (pfpPath && fs.existsSync(pfpPath)) {
        pfpToUse = await Jimp.read(pfpPath);
      } 
      // Fall back to placeholder if no PFP or doesn't exist
      else if (fs.existsSync(placeholderPath)) {
        pfpToUse = await Jimp.read(placeholderPath);
        console.log(`⚠️ Using placeholder for ${player.color} player`);
      }
      
      // If we have an image (either real or placeholder)
      if (pfpToUse) {
        pfpToUse.resize({ w: pfpSize, h: pfpSize });
        pfpToUse.circle();
        
        // Draw colored border
        const borderColor = COLOR_HEX[player.color];
        const borderThickness = 6;
        const radius = pfpSize / 2;
        
        for (let angle = 0; angle < 360; angle += 1) {
          const rad = (angle * Math.PI) / 180;
          for (let t = 0; t < borderThickness; t++) {
            const r = radius + t;
            const bx = Math.round(position.x + r * Math.cos(rad));
            const by = Math.round(position.y + r * Math.sin(rad));
            if (bx >= 0 && bx < image.bitmap.width && by >= 0 && by < image.bitmap.height) {
              image.setPixelColor(borderColor, bx, by);
            }
          }
        }
        
        image.composite(pfpToUse, position.x - pfpSize / 2, position.y - pfpSize / 2);
        console.log(`✅ Placed PFP for ${player.color} player`);
      } else {
        // Last resort: draw basic placeholder if image file is missing
        drawProfilePlaceholder(image, position.x, position.y, pfpSize / 2, COLOR_HEX[player.color]);
        console.log(`⚠️ Using drawn placeholder for ${player.color} player`);
      }
    } catch (err) {
      console.error(`❌ Error drawing PFP for ${player.color}:`, err.message);
      // Try to use placeholder.png on error
      try {
        if (fs.existsSync(placeholderPath)) {
          const placeholder = await Jimp.read(placeholderPath);
          placeholder.resize({ w: pfpSize, h: pfpSize });
          placeholder.circle();
          
          const borderColor = COLOR_HEX[player.color];
          const borderThickness = 6;
          const radius = pfpSize / 2;
          
          for (let angle = 0; angle < 360; angle += 1) {
            const rad = (angle * Math.PI) / 180;
            for (let t = 0; t < borderThickness; t++) {
              const r = radius + t;
              const bx = Math.round(position.x + r * Math.cos(rad));
              const by = Math.round(position.y + r * Math.sin(rad));
              if (bx >= 0 && bx < image.bitmap.width && by >= 0 && by < image.bitmap.height) {
                image.setPixelColor(borderColor, bx, by);
              }
            }
          }
          
          image.composite(placeholder, position.x - pfpSize / 2, position.y - pfpSize / 2);
        } else {
          // Final fallback: draw basic placeholder
          drawProfilePlaceholder(image, position.x, position.y, pfpSize / 2, COLOR_HEX[player.color]);
        }
      } catch (placeholderErr) {
        // If even placeholder fails, draw basic placeholder
        drawProfilePlaceholder(image, position.x, position.y, pfpSize / 2, COLOR_HEX[player.color]);
      }
    }
  }
}

// ============================================
// DRAWING UTILITIES
// ============================================

function drawFilledCircle(image, centerX, centerY, radius, color) {
  for (let angle = 0; angle < 360; angle += 1) {
    const rad = (angle * Math.PI) / 180;
    for (let r = 0; r <= radius; r++) {
      const x = Math.round(centerX + r * Math.cos(rad));
      const y = Math.round(centerY + r * Math.sin(rad));
      if (x >= 0 && x < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
        image.setPixelColor(color, x, y);
      }
    }
  }
}

function drawCircleOutline(image, centerX, centerY, radius, color, thickness = 2) {
  for (let angle = 0; angle < 360; angle += 0.5) {
    const rad = (angle * Math.PI) / 180;
    for (let t = 0; t < thickness; t++) {
      const r = radius - t;
      const x = Math.round(centerX + r * Math.cos(rad));
      const y = Math.round(centerY + r * Math.sin(rad));
      if (x >= 0 && x < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
        image.setPixelColor(color, x, y);
      }
    }
  }
}

function fillRect(image, x, y, width, height, color, alpha = 1) {
  for (let i = x; i < x + width; i++) {
    for (let j = y; j < y + height; j++) {
      if (i >= 0 && i < image.bitmap.width && j >= 0 && j < image.bitmap.height) {
        if (alpha < 1) {
          const existing = image.getPixelColor(i, j);
          const blended = blendColors(existing, color, alpha);
          image.setPixelColor(blended, i, j);
        } else {
          image.setPixelColor(color, i, j);
        }
      }
    }
  }
}

function drawRect(image, x, y, width, height, color, thickness = 1) {
  for (let t = 0; t < thickness; t++) {
    for (let i = x; i < x + width; i++) {
      if (i >= 0 && i < image.bitmap.width) {
        if (y + t >= 0 && y + t < image.bitmap.height) image.setPixelColor(color, i, y + t);
        if (y + height - t >= 0 && y + height - t < image.bitmap.height) image.setPixelColor(color, i, y + height - t);
      }
    }
    for (let j = y; j < y + height; j++) {
      if (j >= 0 && j < image.bitmap.height) {
        if (x + t >= 0 && x + t < image.bitmap.width) image.setPixelColor(color, x + t, j);
        if (x + width - t >= 0 && x + width - t < image.bitmap.width) image.setPixelColor(color, x + width - t, j);
      }
    }
  }
}

function drawLine(image, x1, y1, x2, y2, color) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x1 >= 0 && x1 < image.bitmap.width && y1 >= 0 && y1 < image.bitmap.height) {
      image.setPixelColor(color, x1, y1);
    }

    if (x1 === x2 && y1 === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y1 += sy;
    }
  }
}

function drawStar(image, centerX, centerY, size, color) {
  const outerRadius = size;
  const innerRadius = size / 2;
  const points = 5;
  
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    
    if (i === 0) continue;
    
    const prevAngle = ((i - 1) * Math.PI) / points - Math.PI / 2;
    const prevRadius = (i - 1) % 2 === 0 ? outerRadius : innerRadius;
    const prevX = centerX + Math.cos(prevAngle) * prevRadius;
    const prevY = centerY + Math.sin(prevAngle) * prevRadius;
    
    drawLine(image, Math.round(prevX), Math.round(prevY), Math.round(x), Math.round(y), color);
  }
}

function drawShield(image, centerX, centerY, size, color) {
  drawCircleOutline(image, centerX, centerY, size, color, 3);
  drawLine(image, centerX - size/2, centerY - size/2, centerX + size/2, centerY + size/2, color);
  drawLine(image, centerX - size/2, centerY + size/2, centerX + size/2, centerY - size/2, color);
}

function fillTriangle(image, points, color) {
  const [[x1, y1], [x2, y2], [x3, y3]] = points;
  
  let minX = Math.min(x1, x2, x3);
  let maxX = Math.max(x1, x2, x3);
  let minY = Math.min(y1, y2, y3);
  let maxY = Math.max(y1, y2, y3);
  
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (isPointInTriangle(x, y, x1, y1, x2, y2, x3, y3)) {
        if (x >= 0 && x < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
          image.setPixelColor(color, Math.round(x), Math.round(y));
        }
      }
    }
  }
}

function isPointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
  const area = Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1));
  const area1 = Math.abs((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py));
  const area2 = Math.abs((x2 - px) * (y3 - py) - (x3 - px) * (y2 - py));
  const area3 = Math.abs((x3 - px) * (y1 - py) - (x1 - px) * (y3 - py));
  return Math.abs(area - (area1 + area2 + area3)) < 1;
}

function drawPieceNumber(image, centerX, centerY, number) {
  const numberStr = number.toString();
  
  const patterns = {
    '1': [[1,0],[1,1],[1,2],[1,3]],
    '2': [[0,0],[1,0],[2,0],[2,1],[0,2],[1,2],[2,2],[0,3],[1,3],[2,3]],
    '3': [[0,0],[1,0],[2,0],[2,1],[0,2],[1,2],[2,2],[2,3],[0,3],[1,3],[2,3]],
    '4': [[0,0],[0,1],[0,2],[1,2],[2,2],[2,0],[2,1],[2,3]]
  };
  
  const pattern = patterns[numberStr] || patterns['1'];
  pattern.forEach(([dx, dy]) => {
    const x = Math.round(centerX - 4 + dx * 3);
    const y = Math.round(centerY - 6 + dy * 3);
    if (x >= 0 && x < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
      image.setPixelColor(COLOR_HEX.black, x, y);
    }
  });
}

function drawDiceDots(image, centerX, centerY, value) {
  const dotSize = 5;
  const spacing = 14;
  
  const dotPatterns = {
    1: [[0, 0]],
    2: [[-spacing, -spacing], [spacing, spacing]],
    3: [[-spacing, -spacing], [0, 0], [spacing, spacing]],
    4: [[-spacing, -spacing], [-spacing, spacing], [spacing, -spacing], [spacing, spacing]],
    5: [[-spacing, -spacing], [-spacing, spacing], [0, 0], [spacing, -spacing], [spacing, spacing]],
    6: [[-spacing, -spacing], [-spacing, 0], [-spacing, spacing], [spacing, -spacing], [spacing, 0], [spacing, spacing]]
  };
  
  const pattern = dotPatterns[value] || dotPatterns[1];
  pattern.forEach(([dx, dy]) => {
    drawFilledCircle(image, centerX + dx, centerY + dy, dotSize, COLOR_HEX.black);
  });
}

function drawProfilePlaceholder(image, centerX, centerY, radius, color) {
  drawFilledCircle(image, centerX, centerY, radius, color);
  
  const borderThickness = 6;
  for (let angle = 0; angle < 360; angle += 1) {
    const rad = (angle * Math.PI) / 180;
    for (let t = 0; t < borderThickness; t++) {
      const r = radius + t;
      const x = Math.round(centerX + r * Math.cos(rad));
      const y = Math.round(centerY + r * Math.sin(rad));
      if (x >= 0 && x < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
        image.setPixelColor(COLOR_HEX.white, x, y);
      }
    }
  }
  
  const headRadius = radius * 0.3;
  const shoulderRadius = radius * 0.5;
  
  drawFilledCircle(image, centerX, centerY - radius * 0.15, headRadius, COLOR_HEX.white);
  
  for (let angle = 0; angle < 180; angle += 2) {
    const rad = (angle * Math.PI) / 180;
    for (let r = shoulderRadius - 10; r <= shoulderRadius; r++) {
      const x = Math.round(centerX + r * Math.cos(rad));
      const y = Math.round(centerY + radius * 0.3 + r * Math.sin(rad));
      if (x >= 0 && x < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
        image.setPixelColor(COLOR_HEX.white, x, y);
      }
    }
  }
}

function blendColors(color1, color2, alpha) {
  const r1 = (color1 >> 24) & 0xFF;
  const g1 = (color1 >> 16) & 0xFF;
  const b1 = (color1 >> 8) & 0xFF;
  
  const r2 = (color2 >> 24) & 0xFF;
  const g2 = (color2 >> 16) & 0xFF;
  const b2 = (color2 >> 8) & 0xFF;
  
  const r = Math.round(r1 * (1 - alpha) + r2 * alpha);
  const g = Math.round(g1 * (1 - alpha) + g2 * alpha);
  const b = Math.round(b1 * (1 - alpha) + b2 * alpha);
  
  return ((r << 24) | (g << 16) | (b << 8) | 0xFF) >>> 0;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
      startGame: async (sock, chatId, starterJid, mentionedJids, BOT_MARKER, m) => {
          if (activeGames.has(chatId)) {
              return {
                  success: false,
                  message: BOT_MARKER + `❌ A Ludo game is already in progress!\nUse \`${botConfig.getPrefix()} ludo end\` to stop it.`
              };
          }
    const allPlayers = [starterJid, ...mentionedJids];
    
    if (allPlayers.length < 2 || allPlayers.length > 4) {
      return { 
        success: false, 
        message: BOT_MARKER + "❌ Ludo needs 2-4 players!" 
      };
    }

    const game = new LudoGame(chatId, allPlayers);
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
      await sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: message,
        mentions: mentions
      }, { quoted: m });
    } else {
      await sock.sendMessage(chatId, {
        text: message,
        mentions: mentions
      }, { quoted: m });
    }

    return { success: true };
  },

  rollDice: async (sock, chatId, senderJid, BOT_MARKER, m) => {
    const game = activeGames.get(chatId);
    
    if (!game) {
      return { 
        success: false, 
        message: BOT_MARKER + "❌ No active Ludo game!" 
      };
    }

    if (game.getCurrentPlayer().fullJid !== senderJid) {
      return { 
        success: false, 
        message: BOT_MARKER + "❌ Not your turn!" 
      };
    }

    const rollResult = game.rollDice();
    const player = game.getCurrentPlayer();
    const movablePieces = game.getMovablePieces(player);

    let message = BOT_MARKER + `🎲 *DICE ROLL*\n\n`;
    message += `@${player.fullJid.split('@')[0]} rolled: *${rollResult.roll}*\n\n`;

    if (rollResult.burned) {
      message += `⚡ *BURNED!* ⚡\n3 consecutive 6s! Turn skipped!\n\n`;
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
      
      if (moveResult.captured) {
        message += `⚔️ *CAPTURED!* ⚔️\nOpponent sent back to base!\n\n`;
      }
      
      if (moveResult.reachedHome) {
        message += `🏠 *PIECE HOME!* 🏠\n\n`;
      }
      
      if (moveResult.won) {
        // Award Money
        const reward = 500;
        economy.addMoney(player.fullJid, reward);

        message += `👑 *VICTORY!* 👑\n@${player.fullJid.split('@')[0]} wins!\n`;
        message += `💰 *Reward:* +${reward} Zeni\n\n`;
        message += `🎉 All pieces home! 🎉`;
        activeGames.delete(chatId);
      } else {
        if (moveResult.extraTurn || game.hasExtraTurn) {
          message += `🔥 Extra turn! Roll again!\n`;
          message += `Use: \`${botConfig.getPrefix()} ludo roll\``;
          game.hasExtraTurn = false;
        } else {
          game.nextTurn();
          message += `Next turn: @${game.getCurrentPlayer().fullJid.split('@')[0]}\n`;
          message += `Use: \`${botConfig.getPrefix()} ludo roll\``;
        }
      }
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
      await sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: message,
        mentions: mentions
      }, { quoted: m });
    } else {
      await sock.sendMessage(chatId, {
        text: message,
        mentions: mentions
      }, { quoted: m });
    }

    return { success: true };
  },

  movePiece: async (sock, chatId, senderJid, pieceNum, BOT_MARKER, m) => {
    const game = activeGames.get(chatId);
    
    if (!game) {
      return { 
        success: false, 
        message: BOT_MARKER + "❌ No active Ludo game!" 
      };
    }

    const player = game.getPlayerByJid(senderJid);
    if (!player) {
      return { 
        success: false, 
        message: BOT_MARKER + "❌ You're not in this game!" 
      };
    }

    if (game.getCurrentPlayer().fullJid !== senderJid) {
      return { 
        success: false, 
        message: BOT_MARKER + "❌ Not your turn!" 
      };
    }

    const moveResult = game.movePiece(player, pieceNum);

    if (!moveResult.success) {
      await sock.sendMessage(chatId, {
        text: BOT_MARKER + `❌ ${moveResult.error}`
      }, { quoted: m });
      return { success: false };
    }

    let message = BOT_MARKER + `🎮 *MOVE COMPLETE*\n\n`;
    message += `@${player.fullJid.split('@')[0]} moved piece ${pieceNum}\n\n`;

    if (moveResult.captured) {
      message += `⚔️ *CAPTURED!* ⚔️\nOpponent sent back to base!\n\n`;
    }

    if (moveResult.reachedHome) {
      message += `🏠 *PIECE HOME!* 🏠\n\n`;
    }

    if (moveResult.won) {
      // Award Money
      const reward = 500;
      economy.addMoney(player.fullJid, reward);

      message += `👑 *VICTORY!* 👑\n@${player.fullJid.split('@')[0]} wins!\n`;
      message += `💰 *Reward:* +${reward} Zeni\n\n`;
      message += `🎉 All pieces home! 🎉`;
      
      activeGames.delete(chatId);
    } else {
      if (moveResult.extraTurn || game.hasExtraTurn) {
        message += `🔥 Extra turn! Roll again!\n`;
        message += `Use: \`${botConfig.getPrefix()} ludo roll\``;
        game.hasExtraTurn = false;
      } else {
        game.nextTurn();
        message += `Next turn: @${game.getCurrentPlayer().fullJid.split('@')[0]}\n`;
        message += `Use: \`${botConfig.getPrefix()} ludo roll\``;
      }
    }

    const imageBuffer = await renderBoard(game, sock);
    const mentions = [player.fullJid, game.getCurrentPlayer()?.fullJid].filter(Boolean);

    if (imageBuffer) {
      await sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: message,
        mentions: mentions
      }, { quoted: m });
    } else {
      await sock.sendMessage(chatId, {
        text: message,
        mentions: mentions
      }, { quoted: m });
    }

    return { success: true };
  },

  showBoard: async (sock, chatId, BOT_MARKER, m) => {
    const game = activeGames.get(chatId);
    
    if (!game) {
      return { 
        success: false, 
        message: BOT_MARKER + "❌ No active Ludo game!" 
      };
    }

    const imageBuffer = await renderBoard(game, sock);
    const currentPlayer = game.getCurrentPlayer();

    const message = BOT_MARKER + `🎲 *LUDO BOARD*\n\nCurrent turn: @${currentPlayer.fullJid.split('@')[0]}\nLast roll: ${game.lastRoll || 'None'}\n\nUse: \`${botConfig.getPrefix()} ludo roll\``;

    if (imageBuffer) {
      await sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: message,
        mentions: [currentPlayer.fullJid]
      }, { quoted: m });
    } else {
      await sock.sendMessage(chatId, {
        text: message,
        mentions: [currentPlayer.fullJid]
      }, { quoted: m });
    }

    return { success: true };
  },

  endGame: async (sock, chatId, senderJid, BOT_MARKER, m) => {
    const game = activeGames.get(chatId);
    
    if (!game) {
      return { 
        success: false, 
        message: BOT_MARKER + "❌ No active Ludo game!" 
      };
    }

    activeGames.delete(chatId);

    await sock.sendMessage(chatId, {
      text: BOT_MARKER + "✅ Ludo game ended!"
    }, { quoted: m });

    return { success: true };
  }
};
