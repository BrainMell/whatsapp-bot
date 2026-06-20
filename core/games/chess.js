// ============================================
// ♟️ GOTEN-BOT CHESS SYSTEM
// Features: PvP, Betting, Image Board, Elo logic
// ============================================

const { Chess } = require('chess.js');
const economy = require('../rpg/economy');
const system = require('../utils/system');
const botConfig = require('../../botConfig');
const GoImageService = require('../utils/goImageService');

const goService = new GoImageService();
// ============================================
// AI LOGIC (BASIC EVALUATION + MINIMAX)
// ============================================

const PIECE_VALUES = {
    'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000,
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
};

// Simplified Piece-Square Tables
const PST = {
    'p': [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5,  5, 10, 25, 25, 10,  5,  5],
        [0,  0,  0, 20, 20,  0,  0,  0],
        [5, -5,-10,  0,  0,-10, -5,  5],
        [5, 10, 10,-20,-20, 10, 10,  5],
        [0,  0,  0,  0,  0,  0,  0,  0]
    ],
    'n': [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ],
    'b': [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    'r': [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [0,  0,  0,  5,  5,  0,  0,  0]
    ],
    'q': [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [-5,  0,  5,  5,  5,  5,  0, -5],
        [0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ],
    'k': [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [20, 20,  0,  0,  0,  0, 20, 20],
        [20, 30, 10,  0,  0, 10, 30, 20]
    ]
};

// Mirror PST for White
const PST_W = {};
for (const p in PST) {
    PST_W[p.toUpperCase()] = [...PST[p]].reverse();
}
const ALL_PST = { ...PST, ...PST_W };

function evaluateBoard(game) {
    let totalEvaluation = 0;
    const board = game.board();

    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const piece = board[i][j];
            if (piece) {
                const val = PIECE_VALUES[piece.type] || 0;
                const pstVal = ALL_PST[piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase()]?.[i][j] || 0;
                const multiplier = piece.color === 'w' ? 1 : -1;
                totalEvaluation += (val + pstVal) * multiplier;
            }
        }
    }
    return totalEvaluation;
}

function minimax(game, depth, alpha, beta, isMaximisingPlayer) {
    if (depth === 0) return -evaluateBoard(game);

    const possibleMoves = game.moves();

    if (isMaximisingPlayer) {
        let bestEval = -99999;
        for (const move of possibleMoves) {
            game.move(move);
            bestEval = Math.max(bestEval, minimax(game, depth - 1, alpha, beta, !isMaximisingPlayer));
            game.undo();
            alpha = Math.max(alpha, bestEval);
            if (beta <= alpha) return bestEval;
        }
        return bestEval;
    } else {
        let bestEval = 99999;
        for (const move of possibleMoves) {
            game.move(move);
            bestEval = Math.min(bestEval, minimax(game, depth - 1, alpha, beta, !isMaximisingPlayer));
            game.undo();
            beta = Math.min(beta, bestEval);
            if (beta <= alpha) return bestEval;
        }
        return bestEval;
    }
}

function getBestMove(game) {
    const possibleMoves = game.moves();
    if (possibleMoves.length === 0) return null;

    let bestMove = null;
    let bestValue = -99999;

    // Randomize equal moves a bit
    possibleMoves.sort(() => Math.random() - 0.5);

    for (const move of possibleMoves) {
        game.move(move);
        const boardValue = minimax(game, 2, -100000, 100000, false);
        game.undo();
        if (boardValue > bestValue) {
            bestValue = boardValue;
            bestMove = move;
        }
    }

    return bestMove;
}

// activeGames is now a Map of botIds -> Map of chatIds
const activeGamesMap = new Map();

// Helper to normalize JIDs for comparison (removes @s.whatsapp.net etc)
function cleanJid(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0];
}

function getActiveGames() {
    const botId = botConfig.getBotId() || "global";
    if (!activeGamesMap.has(botId)) {
        activeGamesMap.set(botId, new Map());
    }
    return activeGamesMap.get(botId);
}

// ============================================
// GAME STATE MANAGEMENT (PERSISTENT)
// ============================================

// Key for storing active games in the system module (Instance-specific)
const getChessKey = () => `active_chess_games_${botConfig.getBotId() || "global"}`;

// Load active games from the system module on initialization
function loadActiveGames() {
    try {
        const key = getChessKey();
        const activeGames = getActiveGames();
        const loadedGames = system.get(key, {});
        
        activeGames.clear(); // Clear current memory to avoid duplicates
        
        for (const chatId in loadedGames) {
            const state = loadedGames[chatId];
            if (state && state.fen) {
                try {
                    state.chess = new Chess(state.fen);
                    activeGames.set(chatId, state);
                } catch (e) {
                    console.error(`[Chess] Failed to load game for ${chatId}:`, e.message);
                }
            }
        }
        console.log(`[Chess][${botConfig.getBotId()}] Initialized: ${activeGames.size} games from DB (${key}).`);
    } catch (err) {
        console.error("[Chess] Failed to load active games:", err.message);
    }
}

// Save all active games to the system module
function saveActiveGames() {
    const key = getChessKey();
    const activeGames = getActiveGames();
    const gamesToSave = {};
    for (const [chatId, state] of activeGames.entries()) {
        try {
            gamesToSave[chatId] = {
                ...state,
                fen: state.chess ? state.chess.fen() : state.fen, 
                chess: null, 
                drawOfferedBy: state.drawOfferedBy || null
            };
        } catch (e) {
            console.error(`[Chess] Failed to prepare game for save (${chatId}):`, e.message);
        }
    }
    system.set(key, gamesToSave);
}

function createGame(playerW, playerB, chatId, bet = 0) {
    const game = new Chess();
    const activeGames = getActiveGames();
    const state = {
        chess: game,
        playerW: playerW, 
        playerB: playerB, 
        bet: bet,
        chatId: chatId,
        startTime: Date.now(),
        lastMove: null,
        status: 'active',
        fen: game.fen(), 
        history: [game.fen()]
    };
    activeGames.set(chatId, state);
    saveActiveGames(); 
    return state;
}

function getGame(chatId) {
    const activeGames = getActiveGames();
    const state = activeGames.get(chatId);
    if (state && !state.chess && state.fen) {
        try {
            state.chess = new Chess(state.fen);
        } catch (e) {
            console.error(`[Chess] Failed to reconstruct game for ${chatId}:`, e.message);
        }
    }
    return state;
}

function deleteGame(chatId) {
    const activeGames = getActiveGames();
    activeGames.delete(chatId);
    saveActiveGames(); 
}

function normalizeJid(jid) {
    if (!jid) return null;
    return jid.split('@')[0].split(':')[0];
}

// ============================================
// SCOREBOARD MANAGEMENT
// ============================================

function updateChessScore(playerJid, result) {
    const scores = system.get('chess_scores', {});
    const normalizedJid = playerJid.split('@')[0];
    
    if (!scores[normalizedJid]) {
        scores[normalizedJid] = { wins: 0, losses: 0, draws: 0, elo: 1200 };
    }
    
    if (result === 'win') scores[normalizedJid].wins++;
    else if (result === 'loss') scores[normalizedJid].losses++;
    else if (result === 'draw') scores[normalizedJid].draws++;
    
    system.set('chess_scores', scores);
}

// ============================================
// COMMAND HANDLERS
// ============================================

async function handleChess(sock, chatId, senderJid, args, m, botMarker) {
    const prefix = botConfig.getPrefix();
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    
    // Safety check: if first arg is 'chess', shift it (prevents parsing mismatch)
    if (args[0]?.toLowerCase() === 'chess') {
        args.shift();
    }
    
    const cmd = args[0]?.toLowerCase();
    
    let mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
    
    // Check if replying to the bot or tagging the bot
    const isReplyingToBot = quotedParticipant === botJid;
    const isTaggingBot = mentionedJids.includes(botJid);

    if (mentionedJids.length === 0 && quotedParticipant && quotedParticipant !== sock.user.id) {
        mentionedJids = [quotedParticipant];
    }

    const reserved = ['move', 'm', 'resign', 'board', 'show', 'moves', 'stats', 'top', 'help', 'guide', 'stop', 'end', 'reset', 'force-reset', 'fen', 'undo', 'draw'];

    // 1. CHALLENGE: .j chess @user [bet] or .j chess challenge @user
    if (!cmd || cmd === 'challenge' || (mentionedJids.length > 0 && !reserved.includes(cmd))) {
        if (getActiveGames().has(chatId)) {
            return sock.sendMessage(chatId, { text: botMarker + "❌ A game is already active in this chat! Finish it or use `" + prefix + " chess stop` to end it." });
        }

        if (mentionedJids.length === 0 && cmd !== 'guide') {
            return sock.sendMessage(chatId, { text: botMarker + `♟️ *CHESS SYSTEM* ♟️\n\n` +
                `• \`${prefix} chess @user [bet]\` - Challenge\n` +
                `• \`${prefix} move <move>\` - Make move (e.g., e4, Nf3)\n` +
                `• \`${prefix} chess board\` - See board\n` +
                `• \`${prefix} chess help\` - Commands\n` +
                `• \`${prefix} chess guide\` - How to play` });
        }

        if (cmd === 'guide') {
            // Handled below
        } else {
            let opponentJid = mentionedJids[0];
            
            // If tagging bot or no one tagged (and not guide), assume AI mode? 
            // Actually user said "when u tag the bot ofcourse, or mention the bots number or reply to the bot"
            if (isTaggingBot || isReplyingToBot) {
                opponentJid = botJid;
            }

            if (cleanJid(opponentJid) === cleanJid(senderJid)) {
                return sock.sendMessage(chatId, { text: botMarker + "❌ You cannot play against yourself!" });
            }

            let betStr = cmd === 'challenge' ? args[2] : args[1];
            if (!betStr && mentionedJids.length > 0 && cmd !== 'challenge') {
                 betStr = args[1];
            }
            const bet = parseInt(betStr?.replace(/,/g, '')) || 0;

            if (bet > 0) {
                if (opponentJid === botJid) {
                    return sock.sendMessage(chatId, { text: botMarker + "❌ You cannot bet against the AI!" });
                }
                if (economy.getBalance(senderJid) < bet) return sock.sendMessage(chatId, { text: botMarker + "❌ You don't have enough Zeni for this bet!" });
                if (economy.getBalance(opponentJid) < bet) return sock.sendMessage(chatId, { text: botMarker + "❌ Your opponent doesn't have enough Zeni!" });
            }

            const state = createGame(senderJid, opponentJid, chatId, bet);
            
            const caption = botMarker + `♟️ *CHESS MATCH START!* ♟️\n\n` +
                `⚪ *White:* @${normalizeJid(senderJid)}\n` +
                `⚫ *Black:* @${normalizeJid(opponentJid)} ${opponentJid === botJid ? '(🤖 AI MODE)' : ''}\n` +
                `💰 *Bet:* ${bet.toLocaleString()} Zeni\n\n` +
                `👉 @${normalizeJid(senderJid)} to move!\n` +
                `Use: \`${prefix} move <notation>\` (e.g., \`e4\`, \`Nf3\`)`;

            const imageBuffer = await renderBoard(state.chess.fen());
            if (imageBuffer) {
                await sock.sendMessage(chatId, { image: imageBuffer, caption, contextInfo: { mentionedJid: [senderJid, opponentJid] } });
            } else {
                const asciiBoard = "```\n" + state.chess.ascii() + "\n```";
                await sock.sendMessage(chatId, { text: caption + "\n\n" + asciiBoard, contextInfo: { mentionedJid: [senderJid, opponentJid] } });
            }
            return;
        }
    }

    // 2. MOVE
    if (cmd === 'move' || cmd === 'm') {
        const state = getGame(chatId);
        if (!state) return sock.sendMessage(chatId, { text: botMarker + "❌ No active game! Challenge someone with `" + prefix + " chess @user`" });

        const isWhiteTurn = state.chess.turn() === 'w';
        const currentPlayer = isWhiteTurn ? state.playerW : state.playerB;

        if (cleanJid(senderJid) !== cleanJid(currentPlayer)) {
            return sock.sendMessage(chatId, { text: botMarker + `❌ It's not your turn! Wait for @${normalizeJid(currentPlayer)}`, contextInfo: { mentionedJid: [currentPlayer] } });
        }

        let moveStr = args.slice(1).join('').trim();
        if (!moveStr) return sock.sendMessage(chatId, { text: botMarker + "❌ Specify your move! (e.g., `e4` or `Nf3`)" });

        // Normalize move notation: 
        // 1. Pawn moves (e.g., e4, E4 -> e4)
        if (moveStr.length === 2) {
            moveStr = moveStr.toLowerCase();
        }
        // 2. Piece moves (e.g., nf3 -> Nf3, qh5 -> Qh5)
        else if (moveStr.length >= 3 && /^[rnkbq]/i.test(moveStr[0])) {
            moveStr = moveStr[0].toUpperCase() + moveStr.slice(1);
        }
        // 3. Castling (e.g., o-o -> O-O)
        else if (moveStr.toLowerCase() === 'o-o' || moveStr.toLowerCase() === 'o-o-o') {
            moveStr = moveStr.toUpperCase().replace(/0/g, 'O');
        }

        try {
            // Attempt the move
            let move = state.chess.move(moveStr);
            
            // If failed, check if it's a missing promotion (e.g., e8 or a1 for pawn)
            if (!move && moveStr.length >= 2) {
                const targetSquare = moveStr.slice(-2);
                const isPromotionRank = targetSquare[1] === '8' || targetSquare[1] === '1';
                if (isPromotionRank) {
                    // Try with promotion to Queen
                    const promoMove = moveStr.includes('=') ? moveStr : moveStr + '=Q';
                    move = state.chess.move(promoMove);
                    if (move) moveStr = promoMove;
                }
            }

            if (!move) throw new Error("Invalid move");

            await processMove(sock, chatId, state, move, moveStr, botMarker, botJid);

        } catch (e) {
            let errorText = botMarker + `❌ *Invalid move:* \`${moveStr}\`\n\n` +
                `💡 *How to move:* This bot uses standard notation:\n` +
                `• *Pawns:* just the square (e.g., \`e4\`, \`d5\`)\n` +
                `• *Pieces:* Initial + square (e.g., \`Nf3\` for Knight, \`Bb5\` for Bishop)\n` +
                `• *Captures:* use 'x' (e.g., \`exd5\` or \`Nxf3\`)\n` +
                `• *Castling:* \`O-O\` (Kingside) or \`O-O-O\` (Queenside)\n\n` +
                `👉 Type \`${prefix} chess moves\` to see all possible legal moves right now.\n` +
                `👉 Type \`${prefix} chess guide\` for a full tutorial.`;
            return sock.sendMessage(chatId, { text: errorText });
        }
        return;
    }

    async function processMove(sock, chatId, state, move, moveStr, botMarker, botJid) {
    const isWhiteTurn = state.chess.turn() === 'w';
    const currentPlayer = !isWhiteTurn ? state.playerW : state.playerB; // Turn already flipped in chess.js

    // 💡 FIX: Clear stale draw offers whenever a move is made. Previously
    // a draw offer would persist after the offering player moved, allowing
    // the opponent to accept a stale offer on a changed position.
    state.drawOfferedBy = null;

    state.fen = state.chess.fen(); 
    if (!state.history) state.history = [];
    state.history.push(state.fen);
    saveActiveGames(); 

    let resultMsg = "";
    let gameEnded = false;

    if (state.chess.isCheckmate()) {
        resultMsg = `🏁 *CHECKMATE!* @${normalizeJid(currentPlayer)} wins!`;
        gameEnded = true;
        updateChessScore(currentPlayer, 'win');
        updateChessScore(!isWhiteTurn ? state.playerB : state.playerW, 'loss');
        try {
            const socialSystem = require('../rpg/socialSystem');
            socialSystem.incrementRelationship(state.playerW, state.playerB, 6);
        } catch (socialErr) {}
    } else if (state.chess.isDraw()) {
        resultMsg = `⚖️ *DRAW!* The game ended in a draw.`;
        gameEnded = true;
        updateChessScore(state.playerW, 'draw');
        updateChessScore(state.playerB, 'draw');
        try {
            const socialSystem = require('../rpg/socialSystem');
            socialSystem.incrementRelationship(state.playerW, state.playerB, 4);
        } catch (socialErr) {}
    } else if (state.chess.isCheck()) {
        resultMsg = `⚠️ *CHECK!* @${normalizeJid(state.chess.turn() === 'w' ? state.playerW : state.playerB)} is in check!`;
    }

    const nextPlayer = state.chess.turn() === 'w' ? state.playerW : state.playerB;
    const caption = botMarker + `♟️ *CHESS MOVE: ${moveStr}*\n\n` +
        (gameEnded ? resultMsg : (resultMsg ? resultMsg + "\n" : "") + `👉 Next turn: @${normalizeJid(nextPlayer)}`) +
        (state.bet > 0 && gameEnded ? `\n💰 @${normalizeJid(currentPlayer)} takes the ${(state.bet * 2).toLocaleString()} Zeni pot!` : "");

    if (gameEnded) {
        if (state.bet > 0 && state.chess.isCheckmate()) {
            economy.addMoney(currentPlayer, state.bet);
            economy.removeMoney(!isWhiteTurn ? state.playerB : state.playerW, state.bet);
        }
        deleteGame(chatId);
    }

    const imageBuffer = await renderBoard(state.chess.fen(), move.from + move.to);
    if (imageBuffer) {
        await sock.sendMessage(chatId, { image: imageBuffer, caption, contextInfo: { mentionedJid: gameEnded ? [state.playerW, state.playerB] : [nextPlayer] } });
    } else {
        const asciiBoard = "```\n" + state.chess.ascii() + "\n```";
        await sock.sendMessage(chatId, { text: caption + "\n\n" + asciiBoard, contextInfo: { mentionedJid: gameEnded ? [state.playerW, state.playerB] : [nextPlayer] } });
    }

    // AI MOVE TRIGGER
    if (!gameEnded && nextPlayer === botJid) {
        setTimeout(async () => {
            const aiMove = getBestMove(state.chess);
            if (aiMove) {
                const moveResult = state.chess.move(aiMove);
                if (moveResult) {
                    await processMove(sock, chatId, state, moveResult, aiMove, botMarker, botJid);
                }
            }
        }, 1500);
    }
}

// 3. SHOW BOARD
    if (cmd === 'board' || cmd === 'show') {
        const state = getGame(chatId);
        if (!state) return sock.sendMessage(chatId, { text: botMarker + "❌ No active game." });

        const turn = state.chess.turn() === 'w' ? 'White' : 'Black';
        const player = state.chess.turn() === 'w' ? state.playerW : state.playerB;
        const caption = botMarker + `♟️ *CURRENT BOARD*\n\n👉 Turn: *${turn}* (@${normalizeJid(player)})`;

        const imageBuffer = await renderBoard(state.chess.fen());
        if (imageBuffer) {
            return sock.sendMessage(chatId, { image: imageBuffer, caption, contextInfo: { mentionedJid: [player] } });
        } else {
            const asciiBoard = "```\n" + state.chess.ascii() + "\n```";
            return sock.sendMessage(chatId, { text: caption + "\n\n" + asciiBoard, contextInfo: { mentionedJid: [player] } });
        }
    }

    // 4. LEGAL MOVES
    if (cmd === 'moves') {
        const state = getGame(chatId);
        if (!state) return;
        const moves = state.chess.moves();
        return sock.sendMessage(chatId, { text: botMarker + `📜 *LEGAL MOVES:*\n\n${moves.join(', ')}` });
    }

    // 5. STATS
    if (cmd === 'stats') {
        const target = mentionedJids[0] || senderJid;
        const scores = system.get('chess_scores', {});
        const s = scores[target.split('@')[0]] || { wins: 0, losses: 0, draws: 0, elo: 1200 };
        const name = target === senderJid ? "Your" : `@${normalizeJid(target)}'s`;
        return sock.sendMessage(chatId, { text: botMarker + `🏆 *${name} CHESS STATS:*\n\n🥇 Wins: ${s.wins}\n💀 Losses: ${s.losses}\n⚖️ Draws: ${s.draws}\n📈 Elo: ${s.elo}`, contextInfo: { mentionedJid: [target] } });
    }

    // 6. LEADERBOARD
    if (cmd === 'top') {
        const scores = system.get('chess_scores', {});
        const sorted = Object.entries(scores).sort(([, a], [, b]) => b.wins - a.wins).slice(0, 10);
        let msg = botMarker + `🏆 *CHESS LEADERBOARD*\n\n`;
        sorted.forEach(([jid, s], i) => {
            msg += `${i + 1}. @${jid} - ${s.wins} wins\n`;
        });
        return sock.sendMessage(chatId, { text: msg, contextInfo: { mentionedJid: sorted.map(([jid]) => jid + '@s.whatsapp.net') } });
    }

    // 7. RESIGN
    if (cmd === 'resign') {
        const state = getGame(chatId);
        if (!state) return;
        if (cleanJid(senderJid) !== cleanJid(state.playerW) && cleanJid(senderJid) !== cleanJid(state.playerB)) return;

        const loser = senderJid;
        const winner = (cleanJid(loser) === cleanJid(state.playerW)) ? state.playerB : state.playerW;

        if (state.bet > 0) {
            economy.addMoney(winner, state.bet);
            economy.removeMoney(loser, state.bet);
        }

        updateChessScore(winner, 'win');
        updateChessScore(loser, 'loss');
        try {
            const socialSystem = require('../rpg/socialSystem');
            socialSystem.incrementRelationship(state.playerW, state.playerB, 4);
        } catch (socialErr) {}
        deleteGame(chatId);

        return sock.sendMessage(chatId, { 
            text: botMarker + `🏳️ @${normalizeJid(loser)} resigned! @${normalizeJid(winner)} wins!`,
            contextInfo: { mentionedJid: [loser, winner] }
        });
    }

    // 8. STOP / END / RESET
    if (cmd === 'stop' || cmd === 'end' || cmd === 'reset' || cmd === 'force-reset') {
        const activeGames = getActiveGames();
        const state = activeGames.get(chatId);

        // Normalize JIDs for permission check
        const isPlayer = state && (cleanJid(senderJid) === cleanJid(state.playerW) || cleanJid(senderJid) === cleanJid(state.playerB));
        const isAdmin = m.key.fromMe || mentionedJids.includes(sock.user.id);
        // 💡 FIX: 'reset'/'force-reset' should also require admin — previously
        // any user could grief ongoing games (including bet matches) by typing
        // '.chess reset'. Now only players in the game or admins can clear it.
        const isForce = (cmd === 'reset' || cmd === 'force-reset') && isAdmin;

        if (isPlayer || isForce || isAdmin) {
            console.log(`[Chess] Termination triggered in ${chatId} by ${senderJid} (cmd: ${cmd})`);
            deleteGame(chatId);
            activeGames.delete(chatId); // Double-ensure memory is wiped

            const msg = isForce ? "🛑 Chess game has been FORCE CLEARED by admin." : "🛑 Chess game has been terminated.";
            return sock.sendMessage(chatId, { text: botMarker + msg });
        } else {
            return sock.sendMessage(chatId, { text: botMarker + "❌ Only players or admins can stop the game." });
        }
    }

    // 9. HELP
    if (cmd === 'help') {
        return sock.sendMessage(chatId, { text: botMarker + `♟️ *CHESS COMMANDS* ♟️\n\n` +
            `• \`${prefix} chess @user [bet]\` - Start a game\n` +
            `• \`${prefix} move <notation>\` - Make a move (e.g., e4, Nf3, O-O)\n` +
            `• \`${prefix} chess board\` - Show the current board\n` +
            `• \`${prefix} chess moves\` - Show legal moves\n` +
            `• \`${prefix} chess guide\` - Learn how to play\n` +
            `• \`${prefix} chess undo\` - Revert last move\n` +
            `• \`${prefix} chess draw\` - Offer/Accept a draw\n` +
            `• \`${prefix} chess fen\` - Show FEN notation\n` +
            `• \`${prefix} chess resign\` - Forfeit the game\n` +
            `• \`${prefix} chess stop\` - End game without result\n` +
            `• \`${prefix} chess stats [@user]\` - View stats\n` +
            `• \`${prefix} chess top\` - Leaderboard` });
    }

    // 10. FEN
    if (cmd === 'fen') {
        const state = getGame(chatId);
        if (!state) return;
        return sock.sendMessage(chatId, { text: botMarker + `🧩 *FEN:* \`${state.chess ? state.chess.fen() : state.fen}\`` });
    }

    // 11. UNDO
    if (cmd === 'undo') {
        const state = getGame(chatId);
        if (!state) return;
        if (cleanJid(senderJid) !== cleanJid(state.playerW) && cleanJid(senderJid) !== cleanJid(state.playerB)) return;

        if (!state.history || state.history.length <= 1) {
            return sock.sendMessage(chatId, { text: botMarker + "❌ No moves to undo!" });
        }

        state.history.pop(); 
        const lastFen = state.history[state.history.length - 1];
        state.chess = new Chess(lastFen);
        state.fen = lastFen;
        saveActiveGames();

        const turn = state.chess.turn() === 'w' ? 'White' : 'Black';
        const player = state.chess.turn() === 'w' ? state.playerW : state.playerB;
        const caption = botMarker + `↩️ *MOVE UNDONE!*\n\n👉 Turn: *${turn}* (@${normalizeJid(player)})`;

        const imageBuffer = await renderBoard(state.chess.fen());
        if (imageBuffer) {
            return sock.sendMessage(chatId, { image: imageBuffer, caption, contextInfo: { mentionedJid: [player] } });
        } else {
            const asciiBoard = "```\n" + state.chess.ascii() + "\n```";
            return sock.sendMessage(chatId, { text: caption + "\n\n" + asciiBoard, contextInfo: { mentionedJid: [player] } });
        }
    }

    // 12. DRAW
    if (cmd === 'draw') {
        const state = getGame(chatId);
        if (!state) return;
        if (cleanJid(senderJid) !== cleanJid(state.playerW) && cleanJid(senderJid) !== cleanJid(state.playerB)) return;

        if (state.drawOfferedBy && cleanJid(state.drawOfferedBy) !== cleanJid(senderJid)) {
            updateChessScore(state.playerW, 'draw');
            updateChessScore(state.playerB, 'draw');
            deleteGame(chatId);
            return sock.sendMessage(chatId, { text: botMarker + "🤝 *DRAW ACCEPTED!* The game ended in a draw." });
        } else {
            state.drawOfferedBy = senderJid;
            const opponent = cleanJid(senderJid) === cleanJid(state.playerW) ? state.playerB : state.playerW;
            return sock.sendMessage(chatId, { 
                text: botMarker + `⚖️ @${normalizeJid(senderJid)} offered a draw! @${normalizeJid(opponent)}, type \`${prefix} chess draw\` to accept.`,
                contextInfo: { mentionedJid: [senderJid, opponent] }
            });
        }
    }

    // 13. GUIDE
    if (cmd === 'guide') {
        const guideText = botMarker + `♟️ *THE ULTIMATE CHESS GUIDE* ♟️\n\n` +
            `*1. Making Moves* 📝\n` +
            `This bot uses *Standard Algebraic Notation*. You don't pick the piece first; you pick the square it moves to!\n\n` +
            `• *Pawns:* Just the square (e.g., \`e4\`, \`d5\`)\n` +
            `• *Knight:* \`N\` + square (e.g., \`Nf3\`)\n` +
            `• *Bishop:* \`B\` + square (e.g., \`Bc4\`)\n` +
            `• *Rook:* \`R\` + square (e.g., \`Rd1\`)\n` +
            `• *Queen:* \`Q\` + square (e.g., \`Qh5\`)\n` +
            `• *King:* \`K\` + square (e.g., \`Ke2\`)\n\n` +
            `*2. Special Moves* ✨\n` +
            `• *Capture:* Add \`x\` (e.g., \`exd5\` or \`Nxf3\`)\n` +
            `• *Castling:* \`O-O\` (Kingside) or \`O-O-O\` (Queenside)\n` +
            `• *Check:* Add \`+\` (e.g., \`Bb5+\`)\n` +
            `• *Promotion:* Square + \`=\` + Piece (e.g., \`e8=Q\`)\n\n` +
            `*3. How to Play* 🎮\n` +
            `1. Challenge someone: \`.g chess @user [bet]\`\n` +
            `2. The board will be rendered. White moves first.\n` +
            `3. Type \`.g move e4\` to make your opening move.\n` +
            `4. The bot will highlight the last move on the board.\n\n` +
            `*4. Pro Tips* ⚖️\n` +
            `• The goal is to put the opponent's King in *Checkmate*.\n` +
            `• If you're stuck, type \`${prefix} chess moves\` to see all your possible legal moves.\n` +
            `• Use \`${prefix} chess undo\` if you made a mistake (both players must agree in spirit!)\n` +
            `• If a game gets stuck, use \`${prefix} chess stop\` to clear it.`;
        
        return sock.sendMessage(chatId, { text: guideText });
    }
}

// ============================================
// RENDERING
// ============================================

async function renderBoard(fen, lastMove = "") {
    try {
        const buffer = await goService.generateChessBoard({ fen, lastMove });
        return buffer;
    } catch (e) {
        console.error("Chess render failed:", e.message);
        return null;
    }
}

module.exports = { handleChess, getGame, activeGamesMap, loadActiveGames };
