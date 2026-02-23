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
// GAME STATE MANAGEMENT
// ============================================

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
        status: 'active'
    };
    activeGames.set(chatId, state);
    return state;
}

function getGame(chatId) {
    return activeGames.get(chatId);
}

function deleteGame(chatId) {
    activeGames.delete(chatId);
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
    const mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    // 1. CHALLENGE: .j chess @user [bet] or .j chess challenge @user
    if (!cmd || cmd === 'challenge' || mentionedJids.length > 0) {
        // If cmd is 'move' or 'resign' etc, skip challenge logic
        const reserved = ['move', 'm', 'resign', 'board', 'show', 'moves', 'stats', 'top', 'help'];
        if (reserved.includes(cmd)) {
            // fall through
        } else {
            if (activeGames.has(chatId)) {
                return sock.sendMessage(chatId, { text: botMarker + "❌ A game is already active in this chat! Finish it or resign." });
            }

            if (mentionedJids.length === 0) {
                return sock.sendMessage(chatId, { text: botMarker + `♟️ *CHESS SYSTEM* ♟️\n\n` +
                    `• \`${prefix} chess @user [bet]\` - Challenge\n` +
                    `• \`${prefix} move <move>\` - Make move\n` +
                    `• \`${prefix} chess board\` - See board\n` +
                    `• \`${prefix} chess moves\` - Legal moves\n` +
                    `• \`${prefix} chess resign\` - Forfeit\n` +
                    `• \`${prefix} chess stats\` - Your score\n` +
                    `• \`${prefix} chess top\` - Leaderboard` });
            }

            const opponentJid = mentionedJids[0];
            if (opponentJid === senderJid) {
                return sock.sendMessage(chatId, { text: botMarker + "❌ You cannot play against yourself!" });
            }

            // Bet can be 2nd or 3rd arg depending on if 'challenge' word was used
            let betStr = cmd === 'challenge' ? args[2] : args[1];
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
            await sock.sendMessage(chatId, { 
                image: imageBuffer || Buffer.alloc(0), 
                caption, 
                contextInfo: { mentionedJid: [senderJid, opponentJid] } 
            });
            return;
        }
    }

    // 2. MOVE: .j chess move <notation> or .j move <notation>
    if (cmd === 'move' || cmd === 'm') {
        const state = getGame(chatId);
        if (!state) return sock.sendMessage(chatId, { text: botMarker + "❌ No active game! Challenge someone with `.j chess @user`" });

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
            await sock.sendMessage(chatId, { 
                image: imageBuffer || Buffer.alloc(0), 
                caption, 
                contextInfo: { mentionedJid: gameEnded ? [state.playerW, state.playerB] : [nextPlayer] } 
            });

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
        return sock.sendMessage(chatId, { image: imageBuffer || Buffer.alloc(0), caption, contextInfo: { mentionedJid: [player] } });
    }

    // 4. LEGAL MOVES: .j chess moves
    if (cmd === 'moves') {
        const state = getGame(chatId);
        if (!state) return;
        const moves = state.chess.moves();
        return sock.sendMessage(chatId, { text: botMarker + `📜 *LEGAL MOVES:*\n\n${moves.join(', ')}` });
    }

    // 5. STATS: .j chess stats
    if (cmd === 'stats') {
        const scores = system.get('chess_scores', {});
        const s = scores[senderJid.split('@')[0]] || { wins: 0, losses: 0, draws: 0, elo: 1200 };
        return sock.sendMessage(chatId, { text: botMarker + `🏆 *CHESS STATS:*\n\n🥇 Wins: ${s.wins}\n💀 Losses: ${s.losses}\n⚖️ Draws: ${s.draws}\n📈 Elo: ${s.elo}` });
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

module.exports = { handleChess, getGame, activeGames };
