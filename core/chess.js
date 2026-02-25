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
const activeGames = new Map();

// ============================================
// GAME STATE MANAGEMENT (PERSISTENT)
// ============================================

// Key for storing active games in the system module
const CHESS_GAME_KEY = 'active_chess_games';

// Load active games from the system module on initialization
function loadActiveGames() {
    const loadedGames = system.get(CHESS_GAME_KEY, {});
    for (const chatId in loadedGames) {
        // Re-initialize Chess.js game object from FEN
        loadedGames[chatId].chess = new Chess(loadedGames[chatId].fen);
        activeGames.set(chatId, loadedGames[chatId]);
    }
    console.log(`[Chess] Loaded ${activeGames.size} active games from DB.`);
}

// Save all active games to the system module
function saveActiveGames() {
    const gamesToSave = {};
    for (const [chatId, state] of activeGames.entries()) {
        gamesToSave[chatId] = {
            ...state,
            fen: state.chess.fen(), // Save FEN string instead of Chess object
            chess: null // Remove circular reference
        };
    }
    system.set(CHESS_GAME_KEY, gamesToSave);
}

function createGame(playerW, playerB, chatId, bet = 0) {
    const game = new Chess();
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
    const state = activeGames.get(chatId);
    if (state && state.chess === null && state.fen) {
        // Reconstruct Chess object if bot restarted
        state.chess = new Chess(state.fen);
    }
    return state;
}

function deleteGame(chatId) {
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

    const reserved = ['move', 'm', 'resign', 'board', 'show', 'moves', 'stats', 'top', 'help', 'stop', 'end', 'reset', 'fen', 'undo', 'draw'];

    // 1. CHALLENGE: .j chess @user [bet] or .j chess challenge @user
    if (!cmd || cmd === 'challenge' || (mentionedJids.length > 0 && !reserved.includes(cmd))) {
        if (activeGames.has(chatId)) {
            return sock.sendMessage(chatId, { text: botMarker + "❌ A game is already active in this chat! Finish it or use `" + prefix + " chess stop` to end it." });
        }

        if (mentionedJids.length === 0) {
            return sock.sendMessage(chatId, { text: botMarker + `♟️ *CHESS SYSTEM* ♟️\n\n` +
                `• \`${prefix} chess @user [bet]\` - Challenge\n` +
                `• \`${prefix} move <move>\` - Make move (e.g., e4, Nf3)\n` +
                `• \`${prefix} chess board\` - See board\n` +
                `• \`${prefix} chess help\` - Full command list` });
        }

        const opponentJid = mentionedJids[0];
        if (opponentJid === senderJid) {
            return sock.sendMessage(chatId, { text: botMarker + "❌ You cannot play against yourself!" });
        }

        // Bet can be 2nd or 3rd arg depending on if 'challenge' word was used
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

    // 2. MOVE: .j chess move <notation> or .j move <notation>
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

            if (gameEnded && state.bet > 0) {
                if (state.chess.isCheckmate()) {
                    economy.addMoney(currentPlayer, state.bet);
                    economy.removeMoney(isWhiteTurn ? state.playerB : state.playerW, state.bet);
                }
                deleteGame(chatId);
            } else if (gameEnded) {
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
            return sock.sendMessage(chatId, { text: botMarker + `❌ Invalid move: *${moveStr}*\n\n💡 Use standard algebraic notation (e4, Nf3, Bb5+).\n👉 Type \`${prefix} chess moves\` to see all possible moves.` });
        }
        return;
    }

    // 3. SHOW BOARD: .j chess board
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

    // 4. LEGAL MOVES: .j chess moves
    if (cmd === 'moves') {
        const state = getGame(chatId);
        if (!state) return;
        const moves = state.chess.moves();
        return sock.sendMessage(chatId, { text: botMarker + `📜 *LEGAL MOVES:*\n\n${moves.join(', ')}` });
    }

    // 5. STATS: .j chess stats [@user]
    if (cmd === 'stats') {
        const target = mentionedJids[0] || senderJid;
        const scores = system.get('chess_scores', {});
        const s = scores[target.split('@')[0]] || { wins: 0, losses: 0, draws: 0, elo: 1200 };
        const name = target === senderJid ? "Your" : `@${normalizeJid(target)}'s`;
        return sock.sendMessage(chatId, { text: botMarker + `🏆 *${name} CHESS STATS:*\n\n🥇 Wins: ${s.wins}\n💀 Losses: ${s.losses}\n⚖️ Draws: ${s.draws}\n📈 Elo: ${s.elo}`, contextInfo: { mentionedJid: [target] } });
    }

    // 6. LEADERBOARD: .j chess top
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
    if (cmd === 'stop' || cmd === 'end' || cmd === 'reset') {
        const state = getGame(chatId);
        if (!state) return sock.sendMessage(chatId, { text: botMarker + "❌ No active game to stop." });

        const isPlayer = (senderJid === state.playerW || senderJid === state.playerB);
        if (isPlayer || cmd === 'reset') {
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
        return sock.sendMessage(chatId, { text: botMarker + `🧩 *FEN:* \`${state.chess.fen()}\`` });
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

module.exports = { handleChess, getGame, activeGames, loadActiveGames };
