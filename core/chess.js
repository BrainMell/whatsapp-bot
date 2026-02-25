// ============================================
// ♟️ GOTEN-BOT CHESS SYSTEM
// Features: PvP, Betting, Image Board, Elo logic
// ============================================

const { Chess } = require('chess.js');
const economy = require('./economy');
const system = require('./system');
const botConfig = require('../botConfig');
const GoImageService = require('./goImageService');

const goService = new GoImageService();
// activeGames is now a Map of botIds -> Map of chatIds
const activeGamesMap = new Map();

function getActiveGames() {
    const botId = botConfig.getBotId();
    if (!activeGamesMap.has(botId)) {
        activeGamesMap.set(botId, new Map());
    }
    return activeGamesMap.get(botId);
}

// ============================================
// GAME STATE MANAGEMENT (PERSISTENT)
// ============================================

// Key for storing active games in the system module (Instance-specific)
const getChessKey = () => `active_chess_games_${botConfig.getBotId()}`;

// Load active games from the system module on initialization
function loadActiveGames() {
    try {
        const key = getChessKey();
        const activeGames = getActiveGames();
        const loadedGames = system.get(key, {});
        for (const chatId in loadedGames) {
            const state = loadedGames[chatId];
            if (state && state.fen) {
                // Re-initialize Chess.js game object from FEN
                state.chess = new Chess(state.fen);
                activeGames.set(chatId, state);
            }
        }
        console.log(`[Chess][${botConfig.getBotId()}] Loaded ${activeGames.size} active games from DB (${key}).`);
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
                fen: state.chess ? state.chess.fen() : state.fen, // Save FEN string
                chess: null // Remove circular reference
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
        playerW: playerW, // White
        playerB: playerB, // Black
        bet: bet,
        chatId: chatId,
        startTime: Date.now(),
        lastMove: null,
        status: 'active',
        fen: game.fen(), // Store current FEN
        history: [game.fen()]
    };
    activeGames.set(chatId, state);
    saveActiveGames(); // Persist immediately
    return state;
}

function getGame(chatId) {
    const activeGames = getActiveGames();
    const state = activeGames.get(chatId);
    if (state && !state.chess && state.fen) {
        try {
            // Reconstruct Chess object if bot restarted
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
    saveActiveGames(); // Persist deletion
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
    const cmd = args[0]?.toLowerCase();
    
    // Get mentioned JIDs or the participant of a replied message
    let mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
    if (mentionedJids.length === 0 && quotedParticipant && quotedParticipant !== sock.user.id) {
        mentionedJids = [quotedParticipant];
    }

    const reserved = ['move', 'm', 'resign', 'board', 'show', 'moves', 'stats', 'top', 'help', 'guide', 'stop', 'end', 'reset', 'force-reset', 'fen', 'undo', 'draw'];

    // 1. CHALLENGE: .j chess @user [bet] or .j chess challenge @user
    if (!cmd || cmd === 'challenge' || (mentionedJids.length > 0 && !reserved.includes(cmd))) {
        if (getActiveGames().has(chatId)) {
            console.log(`[Chess] Challenge rejected in ${chatId}: Game already active in Map.`);
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
            // Fall through to guide logic
        } else {
            const opponentJid = mentionedJids[0];
            if (opponentJid === senderJid) {
                return sock.sendMessage(chatId, { text: botMarker + "❌ You cannot play against yourself!" });
            }

            let betStr = cmd === 'challenge' ? args[2] : args[1];
            if (!betStr && mentionedJids.length > 0 && cmd !== 'challenge') {
                 betStr = args[1];
            }
            const bet = parseInt(betStr?.replace(/,/g, '')) || 0;

            if (bet > 0) {
                if (economy.getBalance(senderJid) < bet) return sock.sendMessage(chatId, { text: botMarker + "❌ You don't have enough Zeni for this bet!" });
                if (economy.getBalance(opponentJid) < bet) return sock.sendMessage(chatId, { text: botMarker + "❌ Your opponent doesn't have enough Zeni!" });
            }

            const state = createGame(senderJid, opponentJid, chatId, bet);
            
            const caption = botMarker + `♟️ *CHESS MATCH START!* ♟️\n\n` +
                `⚪ *White:* @${normalizeJid(senderJid)}\n` +
                `⚫ *Black:* @${normalizeJid(opponentJid)}\n` +
                `💰 *Bet:* ${bet.toLocaleString()} Zeni\n\n` +
                `👉 @${normalizeJid(senderJid)} to move!\n` +
                `Use: \`${prefix} move <notation>\` (e.g., \`e4\`, \`Nf3\`)`;

            const imageBuffer = await renderBoard(state.chess.fen());
            if (imageBuffer) {
                await sock.sendMessage(chatId, { 
                    image: imageBuffer, 
                    caption, 
                    contextInfo: { mentionedJid: [senderJid, opponentJid] } 
                });
            } else {
                const asciiBoard = "```\n" + state.chess.ascii() + "\n```";
                await sock.sendMessage(chatId, { 
                    text: caption + "\n\n" + asciiBoard, 
                    contextInfo: { mentionedJid: [senderJid, opponentJid] } 
                });
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

        if (senderJid !== currentPlayer) {
            return sock.sendMessage(chatId, { text: botMarker + `❌ It's not your turn! Wait for @${normalizeJid(currentPlayer)}`, contextInfo: { mentionedJid: [currentPlayer] } });
        }

        const moveStr = args.slice(1).join('').trim();
        if (!moveStr) return sock.sendMessage(chatId, { text: botMarker + "❌ Specify your move! (e.g., `e4` or `Nf3`)" });

        try {
            const move = state.chess.move(moveStr);
            if (!move) throw new Error("Invalid move");

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
                updateChessScore(isWhiteTurn ? state.playerB : state.playerW, 'loss');
            } else if (state.chess.isDraw()) {
                resultMsg = `⚖️ *DRAW!* The game ended in a draw.`;
                gameEnded = true;
                updateChessScore(state.playerW, 'draw');
                updateChessScore(state.playerB, 'draw');
            } else if (state.chess.isCheck()) {
                resultMsg = `⚠️ *CHECK!* @${normalizeJid(isWhiteTurn ? state.playerB : state.playerW)} is in check!`;
            }

            const nextPlayer = state.chess.turn() === 'w' ? state.playerW : state.playerB;
            const caption = botMarker + `♟️ *CHESS MOVE: ${moveStr}*\n\n` +
                (gameEnded ? resultMsg : (resultMsg ? resultMsg + "\n" : "") + `👉 Next turn: @${normalizeJid(nextPlayer)}`) +
                (state.bet > 0 && gameEnded ? `\n💰 @${normalizeJid(currentPlayer)} takes the ${(state.bet * 2).toLocaleString()} Zeni pot!` : "");

            if (gameEnded) {
                if (state.bet > 0 && state.chess.isCheckmate()) {
                    economy.addMoney(currentPlayer, state.bet);
                    economy.removeMoney(isWhiteTurn ? state.playerB : state.playerW, state.bet);
                }
                deleteGame(chatId);
            }

            const imageBuffer = await renderBoard(state.chess.fen(), move.from + move.to);
            if (imageBuffer) {
                await sock.sendMessage(chatId, { 
                    image: imageBuffer, 
                    caption, 
                    contextInfo: { mentionedJid: gameEnded ? [state.playerW, state.playerB] : [nextPlayer] } 
                });
            } else {
                const asciiBoard = "```\n" + state.chess.ascii() + "\n```";
                await sock.sendMessage(chatId, { 
                    text: caption + "\n\n" + asciiBoard, 
                    contextInfo: { mentionedJid: gameEnded ? [state.playerW, state.playerB] : [nextPlayer] } 
                });
            }

        } catch (e) {
            let errorText = botMarker + `❌ Invalid move: *${moveStr}*\n\n` +
                `💡 *How to move:* Use standard notation:\n` +
                `• *Pawns:* just the square (e.g., \`e4\`, \`d5\`)\n` +
                `• *Pieces:* Initial + square (e.g., \`Nf3\` for Knight, \`Bb5\` for Bishop)\n` +
                `• *Captures:* use 'x' (e.g., \`exd5\` or \`Nxf3\`)\n` +
                `• *Castling:* \`O-O\` (Kingside) or \`O-O-O\` (Queenside)\n\n` +
                `👉 Type \`${prefix} chess moves\` to see all possible legal moves right now.`;
            
            return sock.sendMessage(chatId, { text: errorText });
        }
        return;
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
        if (senderJid !== state.playerW && senderJid !== state.playerB) return;

        const loser = senderJid;
        const winner = (loser === state.playerW) ? state.playerB : state.playerW;

        if (state.bet > 0) {
            economy.addMoney(winner, state.bet);
            economy.removeMoney(loser, state.bet);
        }

        updateChessScore(winner, 'win');
        updateChessScore(loser, 'loss');
        deleteGame(chatId);

        return sock.sendMessage(chatId, { 
            text: botMarker + `🏳️ @${normalizeJid(loser)} resigned! @${normalizeJid(winner)} wins!`,
            contextInfo: { mentionedJid: [loser, winner] }
        });
    }

    // 8. STOP / END / RESET
    if (cmd === 'stop' || cmd === 'end' || cmd === 'reset' || cmd === 'force-reset') {
        const hasMapEntry = getActiveGames().has(chatId);
        const state = getGame(chatId);

        if (!hasMapEntry && !state) {
            return sock.sendMessage(chatId, { text: botMarker + "❌ No active game found in this chat." });
        }

        const isAdmin = m.key.fromMe || mentionedJids.includes(sock.user.id); // Simple check
        const isPlayer = state && (senderJid === state.playerW || senderJid === state.playerB);

        if (isPlayer || cmd === 'reset' || cmd === 'force-reset' || isAdmin) {
            console.log(`[Chess] Game force-terminated in ${chatId} by ${senderJid} (cmd: ${cmd})`);
            deleteGame(chatId);
            return sock.sendMessage(chatId, { text: botMarker + "🛑 Chess game has been terminated." });
        } else {
            return sock.sendMessage(chatId, { text: botMarker + "❌ Only players or admins can stop the game." });
        }
    }

    // 9. HELP
    if (cmd === 'help') {
        return sock.sendMessage(chatId, { text: botMarker + `♟️ *CHESS COMMANDS* ♟️\n\n` +
            `• \`${prefix} chess @user [bet]\` - Start a game\n` +
            `• \`${prefix} move <notation>\` - Make a move (e4, Nf3, O-O)\n` +
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
        if (senderJid !== state.playerW && senderJid !== state.playerB) return;

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
        if (senderJid !== state.playerW && senderJid !== state.playerB) return;

        if (state.drawOfferedBy && state.drawOfferedBy !== senderJid) {
            updateChessScore(state.playerW, 'draw');
            updateChessScore(state.playerB, 'draw');
            deleteGame(chatId);
            return sock.sendMessage(chatId, { text: botMarker + "🤝 *DRAW ACCEPTED!* The game ended in a draw." });
        } else {
            state.drawOfferedBy = senderJid;
            const opponent = senderJid === state.playerW ? state.playerB : state.playerW;
            return sock.sendMessage(chatId, { 
                text: botMarker + `⚖️ @${normalizeJid(senderJid)} offered a draw! @${normalizeJid(opponent)}, type \`${prefix} chess draw\` to accept.`,
                contextInfo: { mentionedJid: [senderJid, opponent] }
            });
        }
    }

    // 13. GUIDE
    if (cmd === 'guide') {
        const guideText = botMarker + `♟️ *HOW TO PLAY CHESS* ♟️\n\n` +
            `*1. Making Moves* 📝\n` +
            `This bot uses *Standard Algebraic Notation*. You don't pick the piece, you pick the square it moves to!\n\n` +
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
            `*3. General Rules* ⚖️\n` +
            `• The goal is to put the opponent's King in *Checkmate*.\n` +
            `• If you're stuck, type \`${prefix} chess moves\` to see all your possible legal moves.\n` +
            `• Use \`${prefix} chess undo\` if you made a mistake!`;
        
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
