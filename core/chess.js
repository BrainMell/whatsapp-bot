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
// COMMAND HANDLERS
// ============================================

async function handleChess(sock, chatId, senderJid, args, m, botMarker) {
    const prefix = botConfig.getPrefix();
    const cmd = args[0]?.toLowerCase();

    // 1. CHALLENGE: .j chess @user [bet]
    if (!cmd || cmd === 'challenge') {
        if (activeGames.has(chatId)) {
            return sock.sendMessage(chatId, { text: botMarker + "❌ A game is already active in this chat! Finish it or resign." });
        }

        const mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentionedJids.length === 0) {
            return sock.sendMessage(chatId, { text: botMarker + `❌ Tag an opponent!
Example: `${prefix} chess @user 500`` });
        }

        const opponentJid = mentionedJids[0];
        if (opponentJid === senderJid) {
            return sock.sendMessage(chatId, { text: botMarker + "❌ You cannot play against yourself!" });
        }

        const bet = parseInt(args[2]) || parseInt(args[1]) || 0;
        if (bet > 0) {
            if (economy.getBalance(senderJid) < bet) return sock.sendMessage(chatId, { text: botMarker + "❌ You don't have enough Zeni for this bet!" });
            if (economy.getBalance(opponentJid) < bet) return sock.sendMessage(chatId, { text: botMarker + "❌ Your opponent doesn't have enough Zeni!" });
        }

        // Create game (White is challenger for now)
        const state = createGame(senderJid, opponentJid, chatId, bet);
        
        const caption = botMarker + `♟️ *CHESS MATCH START!* ♟️

` +
            `⚪ *White:* @${normalizeJid(senderJid)}
` +
            `⚫ *Black:* @${normalizeJid(opponentJid)}
` +
            `💰 *Bet:* ${bet.toLocaleString()} Zeni

` +
            `👉 @${normalizeJid(senderJid)} to move!
` +
            `Use: `${prefix} move <notation>` (e.g., `e4`, `Nf3`)`;

        const imageBuffer = await renderBoard(state.chess.fen());
        
        if (imageBuffer) {
            await sock.sendMessage(chatId, { image: imageBuffer, caption, contextInfo: { mentionedJid: [senderJid, opponentJid] } });
        } else {
            await sock.sendMessage(chatId, { text: caption + "

Board: " + state.chess.ascii(), contextInfo: { mentionedJid: [senderJid, opponentJid] } });
        }
        return;
    }

    // 2. MOVE: .j chess move <notation>
    if (cmd === 'move' || cmd === 'm') {
        const state = getGame(chatId);
        if (!state) return sock.sendMessage(chatId, { text: botMarker + "❌ No active game! Start one with `.j chess @user`" });

        const isWhiteTurn = state.chess.turn() === 'w';
        const currentPlayer = isWhiteTurn ? state.playerW : state.playerB;

        if (senderJid !== currentPlayer) {
            return sock.sendMessage(chatId, { text: botMarker + `❌ It's not your turn! Wait for @${normalizeJid(currentPlayer)}`, contextInfo: { mentionedJid: [currentPlayer] } });
        }

        const moveStr = args.slice(1).join('');
        if (!moveStr) return sock.sendMessage(chatId, { text: botMarker + "❌ Specify your move! (e.g., `e4`)" });

        try {
            const move = state.chess.move(moveStr);
            if (!move) throw new Error("Invalid move");

            let resultMsg = "";
            let gameEnded = false;

            if (state.chess.isCheckmate()) {
                resultMsg = `🏁 *CHECKMATE!* @${normalizeJid(currentPlayer)} wins!`;
                gameEnded = true;
            } else if (state.chess.isDraw()) {
                resultMsg = `⚖️ *DRAW!* The game ended in a draw.`;
                gameEnded = true;
            } else if (state.chess.isCheck()) {
                resultMsg = `⚠️ *CHECK!* @${normalizeJid(isWhiteTurn ? state.playerB : state.playerW)} is in check!`;
            }

            const nextPlayer = state.chess.turn() === 'w' ? state.playerW : state.playerB;
            const caption = botMarker + `♟️ *CHESS MOVE: ${moveStr}*

` +
                (gameEnded ? resultMsg : `👉 Next turn: @${normalizeJid(nextPlayer)}`) +
                (state.bet > 0 && gameEnded ? `
💰 @${normalizeJid(currentPlayer)} takes the ${state.bet * 2} Zeni pot!` : "");

            // Handle betting rewards
            if (gameEnded && state.bet > 0) {
                if (state.chess.isCheckmate()) {
                    const winner = currentPlayer;
                    const loser = winner === state.playerW ? state.playerB : state.playerW;
                    economy.addMoney(winner, state.bet);
                    economy.removeMoney(loser, state.bet);
                }
                deleteGame(chatId);
            } else if (gameEnded) {
                deleteGame(chatId);
            }

            const imageBuffer = await renderBoard(state.chess.fen(), move.lan); // Use LAN for highlight
            if (imageBuffer) {
                await sock.sendMessage(chatId, { image: imageBuffer, caption, contextInfo: { mentionedJid: gameEnded ? [state.playerW, state.playerB] : [nextPlayer] } });
            } else {
                await sock.sendMessage(chatId, { text: caption + "

" + state.chess.ascii(), contextInfo: { mentionedJid: gameEnded ? [state.playerW, state.playerB] : [nextPlayer] } });
            }

        } catch (e) {
            return sock.sendMessage(chatId, { text: botMarker + `❌ Invalid move: *${moveStr}*
Make sure to use valid algebraic notation.` });
        }
        return;
    }

    // 3. RESIGN
    if (cmd === 'resign') {
        const state = getGame(chatId);
        if (!state) return;
        
        const loser = senderJid;
        const winner = (loser === state.playerW) ? state.playerB : state.playerW;

        if (state.bet > 0) {
            economy.addMoney(winner, state.bet);
            economy.removeMoney(loser, state.bet);
        }

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
