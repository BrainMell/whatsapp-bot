// ============================================
// ♟️ GOTEN-BOT CHESS SYSTEM  (v2 - 2026-11-13)
// PvP + bets (with accept), real AI (4 levels, worker-thread engine), board themes + piece sets (per chat),
// beginner helpers (hint / show legal moves / coordinate moves), real Elo leaderboard.
// ============================================

const { Chess } = require('chess.js');
const economy = require('../rpg/systems/economy/economy');
const system = require('../utils/system');
const botConfig = require('../../botConfig');
const goService = require('../utils/goImageService'); // 💡 singleton (PERF PATCH 2026-07-27)
const chessAI = require('./chessAI');

// ── constants ───────────────────────────────────────────────────────────────
const BOARDS = ['classic', 'walnut', 'marble', 'midnight', 'dungeon', 'inferno', 'sakura'];
const BOARD_LABEL = { classic: 'Classic Green', walnut: 'Walnut Wood', marble: 'Royal Marble', midnight: 'Midnight Neon', dungeon: 'Dungeon Keep (RPG)', inferno: 'Inferno Forge (RPG)', sakura: 'Sakura Garden' };
const BOARD_ALIAS = { default: 'classic', green: 'classic', old: 'classic', wood: 'walnut', wooden: 'walnut', dark: 'midnight', neon: 'midnight', rpg: 'dungeon', stone: 'dungeon', keep: 'dungeon', lava: 'inferno', fire: 'inferno', forge: 'inferno', pink: 'sakura', garden: 'sakura' };
const PIECES = ['classic', 'chessnut', 'fantasy', 'celtic', 'spatial', 'rhosgfx'];
const PIECE_LABEL = { classic: 'Classic', chessnut: 'Chessnut', fantasy: 'Fantasy (RPG)', celtic: 'Celtic', spatial: 'Spatial', rhosgfx: 'Candy Wood' };
const PIECE_ALIAS = { default: 'classic', rpg: 'fantasy', wood: 'rhosgfx', candy: 'rhosgfx', nut: 'chessnut' };
const AI_LEVELS = ['easy', 'medium', 'hard', 'insane'];
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const GAME_EXPIRE_MS = 24 * 60 * 60 * 1000;   // an abandoned game stops blocking the chat after a day
const IDLE_STOP_MS = 30 * 60 * 1000;          // after 30 idle minutes anyone in the chat may clear it
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// activeGames is a Map of botIds -> Map of chatIds
const activeGamesMap = new Map();
const pendingChallenges = new Map(); // `${botId}|${chatId}` -> challenge
const chatLocks = new Map();         // chatId -> Promise chain (serialises moves in one chat)

function cleanJid(jid) {
    if (!jid) return '';
    return String(jid).split('@')[0].split(':')[0];
}
const normalizeJid = cleanJid;
const sameJid = (a, b) => !!a && !!b && cleanJid(a) === cleanJid(b);

function getActiveGames() {
    const botId = botConfig.getBotId() || 'global';
    if (!activeGamesMap.has(botId)) activeGamesMap.set(botId, new Map());
    return activeGamesMap.get(botId);
}
const pendKey = (chatId) => `${botConfig.getBotId() || 'global'}|${chatId}`;

// run fn after any earlier work for this chat has finished (double-sent moves can no longer interleave)
function withLock(chatId, fn) {
    const prev = chatLocks.get(chatId) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    chatLocks.set(chatId, next);
    next.finally(() => { if (chatLocks.get(chatId) === next) chatLocks.delete(chatId); }).catch(() => {});
    return next;
}

// ============================================
// GAME STATE (PERSISTENT)
// ============================================
const getChessKey = () => `active_chess_games_${botConfig.getBotId() || 'global'}`;

// Rebuild a Chess from stored SAN history so threefold-repetition / 50-move counters survive restarts and undo.
function rebuildChess(state) {
    if (Array.isArray(state.moves) && state.moves.length) {
        try {
            const c = new Chess();
            for (const san of state.moves) c.move(san);
            return c;
        } catch (e) { /* fall through to FEN */ }
    }
    return new Chess(state.fen || START_FEN);
}

function loadActiveGames() {
    try {
        const key = getChessKey();
        const activeGames = getActiveGames();
        const loaded = system.get(key, {});
        activeGames.clear();
        for (const chatId in loaded) {
            const state = loaded[chatId];
            if (!state || !state.fen) continue;
            try {
                state.chess = rebuildChess(state);
                state.aiThinking = false;
                state.lastActivity = state.lastActivity || state.startTime || Date.now();
                if (!state.id) state.id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
                if (!state.moves) state.moves = [];
                activeGames.set(chatId, state);
            } catch (e) { console.error(`[Chess] Failed to load game for ${chatId}:`, e.message); }
        }
        console.log(`[Chess][${botConfig.getBotId()}] Initialized: ${activeGames.size} games from DB (${key}).`);
    } catch (err) { console.error('[Chess] Failed to load active games:', err.message); }
}

function saveActiveGames() {
    const out = {};
    for (const [chatId, state] of getActiveGames().entries()) {
        try {
            const { chess, aiThinking, ...rest } = state;
            out[chatId] = { ...rest, fen: chess ? chess.fen() : state.fen };
        } catch (e) { console.error(`[Chess] Failed to prepare game for save (${chatId}):`, e.message); }
    }
    system.set(getChessKey(), out);
}

function newId() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

function createGame(playerW, playerB, chatId, opts = {}) {
    const game = new Chess();
    const prefs = getPrefs(chatId); // style is the chat's (group-wide), not the starting player's
    const state = {
        id: newId(), chess: game, playerW, playerB, bet: opts.bet || 0, chatId,
        startTime: Date.now(), lastActivity: Date.now(), lastMove: null, status: 'active',
        fen: game.fen(), moves: [], ai: opts.ai || null, // ai: { level, color:'w'|'b' }
        style: { board: prefs.board, pieces: prefs.pieces },
        drawOfferedBy: null, undoOfferedBy: null,
    };
    getActiveGames().set(chatId, state);
    saveActiveGames();
    return state;
}

function getGame(chatId) {
    const activeGames = getActiveGames();
    const state = activeGames.get(chatId);
    if (!state) return state;
    if (state.lastActivity && Date.now() - state.lastActivity > GAME_EXPIRE_MS) { // abandoned
        activeGames.delete(chatId); saveActiveGames();
        return undefined;
    }
    if (!state.chess) {
        try { state.chess = rebuildChess(state); } catch (e) { console.error(`[Chess] Failed to reconstruct game for ${chatId}:`, e.message); }
    }
    return state;
}

function deleteGame(chatId) { getActiveGames().delete(chatId); saveActiveGames(); }

// ============================================
// PREFERENCES (board theme + piece set, per chat: one shared look per GC; DMs key on the DM chat id)
// ============================================
const DEFAULT_PREFS = { board: 'classic', pieces: 'classic' };
function getPrefs(chatId) {
    const all = system.get('chess_prefs', {});
    const p = all[String(chatId)] || {};
    return { board: BOARDS.includes(p.board) ? p.board : DEFAULT_PREFS.board, pieces: PIECES.includes(p.pieces) ? p.pieces : DEFAULT_PREFS.pieces };
}
function setPref(chatId, field, value) {
    const all = system.get('chess_prefs', {});
    const k = String(chatId);
    all[k] = { ...(all[k] || {}), [field]: value };
    system.set('chess_prefs', all);
}
function resolveChoice(arg, list, alias) {
    const a = String(arg || '').toLowerCase().trim();
    if (!a) return null;
    if (/^\d+$/.test(a)) return list[parseInt(a, 10) - 1] || null;
    if (alias[a]) return alias[a];
    if (list.includes(a)) return a;
    return list.find((k) => k.startsWith(a)) || null;
}

// ============================================
// SCORES + ELO  (PvP only; AI games are tracked separately and never touch Elo)
// ============================================
const emptyScore = () => ({ wins: 0, losses: 0, draws: 0, elo: 1200, ai: { wins: 0, losses: 0, draws: 0 } });
function getScoreRow(scores, jid) {
    const k = cleanJid(jid);
    if (!scores[k]) {
        // legacy rows were keyed with split('@')[0] (may still carry a :device suffix)
        const legacy = Object.keys(scores).find((x) => cleanJid(x) === k);
        scores[k] = legacy ? scores[legacy] : emptyScore();
        if (legacy && legacy !== k) delete scores[legacy];
    }
    const s = scores[k];
    if (!s.ai) s.ai = { wins: 0, losses: 0, draws: 0 };
    if (typeof s.elo !== 'number') s.elo = 1200;
    return s;
}

// result: 'w' | 'b' | 'd'  (winner colour or draw).  Returns { eloDelta: {w,b} } for display (PvP only).
function recordResult(state, result) {
    const scores = system.get('chess_scores', {});
    const out = { delta: null };
    if (state.ai) {
        const human = state.ai.color === 'w' ? state.playerB : state.playerW;
        const humanColor = state.ai.color === 'w' ? 'b' : 'w';
        const s = getScoreRow(scores, human);
        if (result === 'd') s.ai.draws++; else if (result === humanColor) s.ai.wins++; else s.ai.losses++;
        system.set('chess_scores', scores);
        return out;
    }
    const W = getScoreRow(scores, state.playerW), B = getScoreRow(scores, state.playerB);
    const sw = result === 'w' ? 1 : result === 'b' ? 0 : 0.5;
    const ew = 1 / (1 + Math.pow(10, (B.elo - W.elo) / 400));
    const dW = Math.round(32 * (sw - ew)), dB = -dW;
    W.elo += dW; B.elo += dB;
    if (result === 'd') { W.draws++; B.draws++; } else if (result === 'w') { W.wins++; B.losses++; } else { B.wins++; W.losses++; }
    system.set('chess_scores', scores);
    out.delta = { w: dW, b: dB };
    return out;
}

function nameOf(jid) {
    try {
        const n = economy.getDisplayName(jid);
        if (n && !/^\d{6,}$/.test(String(n).replace(/^@/, ''))) return String(n).replace(/^@/, '');
    } catch (e) { /* fall through */ }
    return `Player ${cleanJid(jid).slice(-4)}`;
}

// ============================================
// MOVE PARSING (beginner-friendly)
// ============================================
// Accepts SAN (e4, Nf3, exd5, O-O, e8=Q), and coordinates (e2e4, e2 e4, e2-e4, e7e8q).
function tryMove(chess, arg) {
    try { return chess.move(arg); } catch (e) { return null; }
}
function parseMove(chess, raw) {
    let s = String(raw || '').trim().replace(/[!?]+$/g, '');
    if (!s) return null;
    const castle = s.toLowerCase().replace(/0/g, 'o');
    if (/^o-o(-o)?[+#]?$/.test(castle)) return tryMove(chess, castle.toUpperCase().replace(/[+#]$/, ''));

    const uci = s.replace(/[\s-]/g, '').toLowerCase().match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (uci) {
        const base = { from: uci[1], to: uci[2] };
        let m = uci[3] ? tryMove(chess, { ...base, promotion: uci[3] }) : tryMove(chess, base);
        if (!m && !uci[3]) m = tryMove(chess, { ...base, promotion: 'q' }); // pawn reaching the last rank: default queen
        if (m) return m;
    }
    const compact = s.replace(/\s+/g, '');
    const variants = [compact];
    // "nf3" -> "Nf3" ONLY after the as-typed form failed, so "bxc3" stays a pawn capture
    if (/^[nbrqk]/i.test(compact) && compact.length >= 3) variants.push(compact[0].toUpperCase() + compact.slice(1));
    variants.push(compact.toLowerCase());
    for (const v of variants) { const m = tryMove(chess, v); if (m) return m; }
    if (/[a-h][18]$/i.test(compact)) { const m = tryMove(chess, `${compact}=Q`); if (m) return m; }
    return null;
}

// ============================================
// RENDERING
// ============================================
function kingSquareInCheck(chess) {
    if (!chess.inCheck()) return '';
    const turn = chess.turn();
    const b = chess.board();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const p = b[r][f];
        if (p && p.type === 'k' && p.color === turn) return `${'abcdefgh'[f]}${8 - r}`;
    }
    return '';
}

function boardRequest(state, extra = {}) {
    const humanIsBlack = state.ai && state.ai.color === 'w';
    return {
        fen: state.chess.fen(), lastMove: state.lastMove || '', board: state.style?.board || 'classic', pieces: state.style?.pieces || 'classic',
        flip: !!humanIsBlack, check: kingSquareInCheck(state.chess), ...extra,
    };
}

async function renderBoard(req) {
    try { return await goService.generateChessBoard(req); }
    catch (e) { console.error('Chess render failed:', e.message); return null; }
}

async function sendBoard(sock, chatId, state, caption, mentions = [], extra = {}) {
    const img = await renderBoard(boardRequest(state, extra));
    const contextInfo = mentions.length ? { mentionedJid: mentions } : undefined;
    if (img) return sock.sendMessage(chatId, { image: img, caption, contextInfo });
    return sock.sendMessage(chatId, { text: caption + '\n\n```\n' + state.chess.ascii() + '\n```', contextInfo });
}

// ============================================
// GAME END + SETTLEMENT
// ============================================
function describeDraw(chess) {
    if (chess.isStalemate()) return 'Stalemate - the side to move has no legal move but is not in check';
    if (chess.isInsufficientMaterial()) return 'Draw - not enough pieces left to checkmate';
    if (chess.isThreefoldRepetition()) return 'Draw - same position three times';
    if (chess.isDrawByFiftyMoves && chess.isDrawByFiftyMoves()) return 'Draw - 50 moves without a capture or pawn move';
    return 'The game ended in a draw';
}

// result: 'w' | 'b' | 'd'. reason: text. Handles Elo/AI stats, bet payout, social bump, deletion. Returns caption block.
function settleGame(state, result, reason) {
    const aiGame = !!state.ai;
    const rec = recordResult(state, result);
    let txt = '';
    const winnerJid = result === 'w' ? state.playerW : result === 'b' ? state.playerB : null;
    const loserJid = result === 'w' ? state.playerB : result === 'b' ? state.playerW : null;
    if (result === 'd') txt += `⚖️ *DRAW!* ${reason}`;
    else txt += `🏁 *${reason}* ${aiGame && sameJid(winnerJid, aiJid(state)) ? '🤖 The AI wins!' : `@${cleanJid(winnerJid)} wins!`}`;

    if (rec.delta) {
        const f = (n) => (n >= 0 ? `+${n}` : `${n}`);
        txt += `\n📈 Elo: @${cleanJid(state.playerW)} ${f(rec.delta.w)}  |  @${cleanJid(state.playerB)} ${f(rec.delta.b)}`;
    }
    // 💡 checked bet settlement (2026-10-31): removeMoney false -> payout VOID, never mint Zeni.
    if (state.bet > 0 && winnerJid && !aiGame) {
        const paid = economy.removeMoney(loserJid, state.bet);
        if (paid) { economy.addMoney(winnerJid, state.bet); txt += `\n💰 @${cleanJid(winnerJid)} wins ${state.bet.toLocaleString()} Zeni from @${cleanJid(loserJid)}!`; }
        else { txt += `\n⚠️ @${cleanJid(loserJid)} couldn't cover the bet - payout VOIDED!`; console.warn(`[Chess] bet VOIDED: loser ${loserJid} cannot cover ${state.bet}`); }
    }
    if (!aiGame) {
        try { require('../rpg/systems/meta/socialSystem').incrementRelationship(state.playerW, state.playerB, result === 'd' ? 4 : 6); } catch (e) { /* optional */ }
    }
    state.status = 'finished';
    deleteGame(state.chatId);
    return txt;
}

const aiJid = (state) => (state.ai ? (state.ai.color === 'w' ? state.playerW : state.playerB) : null);
const isAiTurn = (state) => !!state.ai && state.chess.turn() === state.ai.color;

// ============================================
// APPLY A MOVE (shared by humans and the AI)
// ============================================
async function applyMove(sock, chatId, state, move, botMarker) {
    state.moves.push(move.san);
    state.fen = state.chess.fen();
    state.lastMove = move.from + move.to;
    state.lastActivity = Date.now();
    state.drawOfferedBy = null;
    state.undoOfferedBy = null;

    const mover = move.color; // colour that just moved
    let header = `♟️ *${move.san}*  (${mover === 'w' ? '⚪ White' : '⚫ Black'})`;
    let gameEnded = false, body = '';

    if (state.chess.isCheckmate()) {
        gameEnded = true;
        body = settleGame(state, mover, 'CHECKMATE!');
    } else if (state.chess.isDraw()) {
        gameEnded = true;
        body = settleGame(state, 'd', describeDraw(state.chess));
    } else {
        saveActiveGames();
        const next = state.chess.turn() === 'w' ? state.playerW : state.playerB;
        const nextIsAi = isAiTurn(state);
        if (state.chess.inCheck()) body += `⚠️ *CHECK!* `;
        body += nextIsAi ? `🤖 AI is thinking...` : `👉 Next: @${cleanJid(next)}`;
    }

    const mentions = gameEnded ? [state.playerW, state.playerB].filter((j) => !state.ai || !sameJid(j, aiJid(state))) : (isAiTurn(state) ? [] : [state.chess.turn() === 'w' ? state.playerW : state.playerB]);
    await sendBoard(sock, chatId, state, botMarker + header + '\n\n' + body, mentions);

    if (!gameEnded && isAiTurn(state)) scheduleAI(sock, chatId, state, botMarker);
}

// ============================================
// AI TURN
// ============================================
function scheduleAI(sock, chatId, state, botMarker) {
    if (state.aiThinking || !isAiTurn(state)) return;
    state.aiThinking = true;
    const id = state.id, ply = state.moves.length;
    (async () => {
        let pick = null;
        try { pick = await chessAI.bestMoveAsync(state.chess.fen(), state.ai.level); }
        catch (e) {
            console.error('[Chess][AI] engine failed, playing a random legal move:', e.message);
            const all = state.chess.moves();
            if (all.length) pick = { san: all[Math.floor(Math.random() * all.length)] };
        }
        await new Promise((r) => setTimeout(r, 700)); // brief "thinking" beat so the reply doesn't feel instant
        await withLock(chatId, async () => {
            state.aiThinking = false;
            const cur = getActiveGames().get(chatId);
            // ghost-move guard: the game was stopped / replaced / moved on while the engine was thinking
            if (cur !== state || state.id !== id || state.moves.length !== ply || !isAiTurn(state) || !pick) return;
            const move = tryMove(state.chess, pick.san);
            if (!move) return;
            await applyMove(sock, chatId, state, move, botMarker);
        });
    })().catch((e) => { state.aiThinking = false; console.error('[Chess][AI] turn failed:', e); });
}

// ============================================
// CONSTANTS FOR TEXT
// ============================================
const RESERVED = ['move', 'm', 'resign', 'board', 'show', 'moves', 'stats', 'top', 'lb', 'leaderboard', 'help', 'guide', 'stop', 'end', 'reset', 'force-reset', 'fen', 'undo', 'draw', 'ai', 'bot', 'accept', 'decline', 'cancel', 'hint', 'theme', 'themes', 'board-theme', 'pieces', 'style', 'challenge'];

function levelLine() { return AI_LEVELS.map((l) => `\`${l}\``).join(' · '); }

// ============================================
// COMMAND HANDLER
// ============================================
async function handleChess(sock, chatId, senderJid, args, m, botMarker) {
    const prefix = botConfig.getPrefix();
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const send = (text, mentions) => sock.sendMessage(chatId, { text: botMarker + text, contextInfo: mentions ? { mentionedJid: mentions } : undefined });

    if (args[0]?.toLowerCase() === 'chess') args.shift();
    const cmd = args[0]?.toLowerCase();

    let mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
    const isReplyingToBot = !!quotedParticipant && sameJid(quotedParticipant, botJid);
    const isTaggingBot = mentionedJids.some((j) => sameJid(j, botJid));
    if (mentionedJids.length === 0 && quotedParticipant && !sameJid(quotedParticipant, sock.user.id)) mentionedJids = [quotedParticipant];

    // A game restored after a restart may owe the AI a move
    const live = getGame(chatId);
    if (live && live.ai && isAiTurn(live) && !live.aiThinking && cmd !== 'stop' && cmd !== 'end') scheduleAI(sock, chatId, live, botMarker);

    // ── 0. THEMES / PIECES (work any time, no game needed) ────────────────────
    if (cmd === 'theme' || cmd === 'themes' || cmd === 'board-theme' || cmd === 'pieces' || cmd === 'style') {
        const isPieces = cmd === 'pieces';
        const prefs = getPrefs(chatId);
        const g = live && (sameJid(senderJid, live.playerW) || sameJid(senderJid, live.playerB)) ? live : null;
        const cur = g ? g.style : prefs;
        const arg = args.slice(1).join(' ');
        if (!arg) {
            try {
                const sheet = await goService.generateChessThemes(isPieces
                    ? { kind: 'pieces', board: cur.board, current: cur.pieces, hint: `${prefix} chess pieces <name or #>` }
                    : { kind: 'boards', pieces: cur.pieces, current: cur.board, hint: `${prefix} chess theme <name or #>` });
                const names = (isPieces ? PIECES.map((k, i) => `${i + 1}. ${PIECE_LABEL[k]}`) : BOARDS.map((k, i) => `${i + 1}. ${BOARD_LABEL[k]}`)).join('\n');
                return sock.sendMessage(chatId, { image: sheet, caption: botMarker + `🎨 *${isPieces ? 'PIECE SETS' : 'BOARD THEMES'}*\n\n${names}\n\n👉 \`${prefix} chess ${isPieces ? 'pieces' : 'theme'} <name or #>\`\n_Also: \`${prefix} chess ${isPieces ? 'theme' : 'pieces'}\`_` });
            } catch (e) {
                return send(`🎨 *${isPieces ? 'PIECE SETS' : 'BOARD THEMES'}*\n\n${(isPieces ? PIECES : BOARDS).map((k, i) => `${i + 1}. ${k}`).join('\n')}\n\n👉 \`${prefix} chess ${isPieces ? 'pieces' : 'theme'} <name or #>\``);
            }
        }
        const choice = isPieces ? resolveChoice(arg, PIECES, PIECE_ALIAS) : resolveChoice(arg, BOARDS, BOARD_ALIAS);
        if (!choice) return send(`❌ Unknown ${isPieces ? 'piece set' : 'theme'} _${arg}_. Send \`${prefix} chess ${isPieces ? 'pieces' : 'theme'}\` to see the list.`);
        setPref(chatId, isPieces ? 'pieces' : 'board', choice);
        if (g) { g.style[isPieces ? 'pieces' : 'board'] = choice; saveActiveGames(); }
        const label = isPieces ? PIECE_LABEL[choice] : BOARD_LABEL[choice];
        const preview = g || { chess: new Chess(), lastMove: '', style: { ...prefs, [isPieces ? 'pieces' : 'board']: choice } };
        return sendBoard(sock, chatId, preview, botMarker + `✅ ${isPieces ? 'Pieces' : 'Board'} set to *${label}*${g ? ' (this game updated too)' : ''}\n_Saved for this chat - games here will use it._`);
    }

    // ── 1. LEADERBOARD ────────────────────────────────────────────────────────
    if (cmd === 'top' || cmd === 'lb' || cmd === 'leaderboard') {
        const scores = system.get('chess_scores', {});
        const bot = cleanJid(botJid);
        const rows = Object.entries(scores)
            .filter(([k, s]) => cleanJid(k) !== bot && (s.wins + s.losses + s.draws) > 0)
            .map(([k, s]) => ({ jid: cleanJid(k), name: nameOf(`${cleanJid(k)}@s.whatsapp.net`), elo: s.elo || 1200, wins: s.wins || 0, losses: s.losses || 0, draws: s.draws || 0 }))
            .sort((a, b) => b.elo - a.elo || b.wins - a.wins)
            .slice(0, 10);
        try {
            const img = await goService.generateChessLeaderboard({ entries: rows });
            return sock.sendMessage(chatId, { image: img, caption: botMarker + `🏆 *CHESS LEADERBOARD*\n_Ranked by Elo - player-vs-player games only. Beat the AI for practice, beat friends for rank!_` });
        } catch (e) {
            if (!rows.length) return send('🏆 *CHESS LEADERBOARD*\n\nNo ranked games yet - challenge someone with `' + prefix + ' chess @user`!');
            const medals = ['🥇', '🥈', '🥉'];
            return send('🏆 *CHESS LEADERBOARD*\n\n' + rows.map((r, i) => `${medals[i] || `${i + 1}.`} *${r.name}* - ${r.elo} Elo  (${r.wins}W ${r.losses}L ${r.draws}D)`).join('\n'));
        }
    }

    // ── 2. STATS ──────────────────────────────────────────────────────────────
    if (cmd === 'stats') {
        const target = mentionedJids[0] || senderJid;
        const scores = system.get('chess_scores', {});
        const s = getScoreRow(JSON.parse(JSON.stringify(scores)), target);
        const games = s.wins + s.losses + s.draws;
        const ranked = Object.entries(scores).filter(([k, x]) => cleanJid(k) !== cleanJid(botJid) && (x.wins + x.losses + x.draws) > 0).sort(([, a], [, b]) => (b.elo || 1200) - (a.elo || 1200));
        const pos = ranked.findIndex(([k]) => cleanJid(k) === cleanJid(target));
        const prefs = getPrefs(chatId);
        const ai = s.ai || { wins: 0, losses: 0, draws: 0 };
        return send(`🏆 *${sameJid(target, senderJid) ? 'YOUR' : `@${cleanJid(target)}'S`} CHESS STATS*\n\n` +
            `📈 Elo: *${s.elo}*${pos >= 0 ? `  (rank #${pos + 1})` : ''}\n` +
            `⚔️ PvP: ${s.wins}W · ${s.losses}L · ${s.draws}D${games ? `  (${Math.round((s.wins / games) * 100)}% wins)` : ''}\n` +
            `🤖 vs AI: ${ai.wins}W · ${ai.losses}L · ${ai.draws}D\n` +
            `🎨 Chat style: ${BOARD_LABEL[prefs.board]} / ${PIECE_LABEL[prefs.pieces]}`, [target]);
    }

    // ── 3. HELP / GUIDE ───────────────────────────────────────────────────────
    if (cmd === 'help') {
        return send(`♟️ *CHESS COMMANDS* ♟️\n\n` +
            `*Play*\n• \`${prefix} chess @user [bet]\` - challenge a friend\n• \`${prefix} chess ai [${AI_LEVELS.join('/')}] [white/black]\` - play the AI\n• \`${prefix} chess accept\` / \`decline\` - answer a challenge\n• \`${prefix} move <move>\` - e.g. \`e4\`, \`Nf3\` or just \`e2e4\`\n\n` +
            `*Help while playing*\n• \`${prefix} chess moves [square]\` - legal moves (add a square like \`e2\` to see them drawn on the board)\n• \`${prefix} chess hint\` - the AI suggests a move (no-bet games)\n• \`${prefix} chess board\` - show board · \`undo\` · \`draw\` · \`resign\` · \`stop\`\n\n` +
            `*Style*\n• \`${prefix} chess theme\` - 7 boards (RPG ones included)\n• \`${prefix} chess pieces\` - 6 piece sets\n\n` +
            `*Ranks*\n• \`${prefix} chess top\` - Elo leaderboard · \`${prefix} chess stats [@user]\`\n• \`${prefix} chess guide\` - how to play`);
    }
    if (cmd === 'guide') {
        return send(`♟️ *HOW TO PLAY CHESS* ♟️\n\n` +
            `*Goal:* trap the enemy King (checkmate). White moves first.\n\n` +
            `*Easiest way to move* 🎯\nType the square you start on and the square you land on: \`${prefix} move e2e4\` (or \`e2 e4\`). That's it!\n_Tip: \`${prefix} chess moves e2\` draws every place the piece on e2 can go._\n\n` +
            `*Classic notation* 📝\n• Pawn: just the square - \`e4\`\n• Piece: letter + square - \`Nf3\` (Knight) \`Bc4\` (Bishop) \`Rd1\` (Rook) \`Qh5\` (Queen) \`Ke2\` (King)\n• Capture: add x - \`Nxf3\`, \`exd5\`\n• Castling: \`O-O\` / \`O-O-O\`\n• Promotion: \`e8=Q\` (or just \`e8\` for a Queen)\n\n` +
            `*How the pieces move*\n♙ Pawn: 1 forward (2 on its first move), captures diagonally\n♘ Knight: L-shape, jumps over pieces\n♗ Bishop: diagonals · ♖ Rook: straight lines\n♕ Queen: both · ♔ King: 1 square any way\n\n` +
            `*Stuck?* \`${prefix} chess hint\` asks the AI for a good move. \`${prefix} chess moves\` lists everything legal.\n*Practice:* \`${prefix} chess ai easy\`.`);
    }

    // ── 4. CHALLENGE ACCEPT / DECLINE / CANCEL ───────────────────────────────
    if (cmd === 'accept' || cmd === 'decline' || cmd === 'cancel') {
        const ch = pendingChallenges.get(pendKey(chatId));
        if (!ch || Date.now() - ch.at > CHALLENGE_TTL_MS) { pendingChallenges.delete(pendKey(chatId)); return send('❌ No pending chess challenge here (they expire after 2 minutes).'); }
        if (cmd === 'cancel') {
            if (!sameJid(senderJid, ch.from)) return send('❌ Only the challenger can cancel.');
            pendingChallenges.delete(pendKey(chatId));
            return send('🛑 Challenge cancelled.');
        }
        if (!sameJid(senderJid, ch.to)) return send(`❌ This challenge is for @${cleanJid(ch.to)}.`, [ch.to]);
        pendingChallenges.delete(pendKey(chatId));
        if (cmd === 'decline') return send(`🙅 @${cleanJid(ch.to)} declined the chess challenge.`, [ch.to, ch.from]);
        if (getActiveGames().has(chatId)) return send('❌ A game is already active in this chat!');
        if (ch.bet > 0) {
            if (economy.getBalance(ch.from) < ch.bet) return send('❌ The challenger no longer has enough Zeni for the bet!');
            if (economy.getBalance(ch.to) < ch.bet) return send("❌ You don't have enough Zeni for this bet!");
        }
        const white = Math.random() < 0.5 ? ch.from : ch.to; // fair colours
        const black = white === ch.from ? ch.to : ch.from;
        const state = createGame(white, black, chatId, { bet: ch.bet });
        return sendBoard(sock, chatId, state, botMarker + `♟️ *CHESS MATCH START!* ♟️\n\n⚪ *White:* @${cleanJid(white)}\n⚫ *Black:* @${cleanJid(black)}\n💰 *Bet:* ${ch.bet.toLocaleString()} Zeni\n🎨 ${BOARD_LABEL[state.style.board]}\n\n👉 @${cleanJid(white)} to move!\nUse \`${prefix} move e2e4\` or \`${prefix} move e4\` - new? send \`${prefix} chess guide\``, [white, black]);
    }

    // ── 5. START A GAME: PvP challenge / AI ──────────────────────────────────
    const aiWord = cmd === 'ai' || cmd === 'bot';
    if (!cmd || cmd === 'challenge' || aiWord || (mentionedJids.length > 0 && !RESERVED.includes(cmd))) {
        if (getGame(chatId)) return send(`❌ A game is already active in this chat! Finish it or use \`${prefix} chess stop\`.`);
        const wantsAi = aiWord || isTaggingBot || isReplyingToBot;
        if (!wantsAi && mentionedJids.length === 0) {
            return send(`♟️ *CHESS* ♟️\n\n• \`${prefix} chess @user [bet]\` - challenge a friend\n• \`${prefix} chess ai [easy/medium/hard/insane]\` - play the AI\n• \`${prefix} move e2e4\` - make a move\n• \`${prefix} chess theme\` - boards (incl. RPG)\n• \`${prefix} chess top\` - leaderboard\n• \`${prefix} chess guide\` - never played? start here\n• \`${prefix} chess help\` - all commands`);
        }
        if (wantsAi) {
            const rest = args.slice(aiWord ? 1 : 0).map((a) => a.toLowerCase());
            const level = rest.find((a) => AI_LEVELS.includes(a)) || 'medium';
            let side = rest.find((a) => ['white', 'black', 'random', 'w', 'b'].includes(a)) || 'white';
            if (side === 'random') side = Math.random() < 0.5 ? 'white' : 'black';
            const humanWhite = side === 'white' || side === 'w';
            const state = createGame(humanWhite ? senderJid : botJid, humanWhite ? botJid : senderJid, chatId, { ai: { level, color: humanWhite ? 'b' : 'w' } });
            const cap = botMarker + `♟️ *CHESS vs AI* 🤖\n\n⚪ *White:* ${humanWhite ? `@${cleanJid(senderJid)}` : '🤖 AI'}\n⚫ *Black:* ${humanWhite ? '🤖 AI' : `@${cleanJid(senderJid)}`}\n🧠 *Level:* ${level}  _(${levelLine()})_\n🎨 ${BOARD_LABEL[state.style.board]}\n\n` + (humanWhite ? `👉 You move first! \`${prefix} move e2e4\` or \`${prefix} move e4\`\nStuck? \`${prefix} chess hint\` · New? \`${prefix} chess guide\`` : '🤖 AI opens...');
            await sendBoard(sock, chatId, state, cap, [senderJid]);
            if (isAiTurn(state)) scheduleAI(sock, chatId, state, botMarker);
            return;
        }
        // PvP: needs the opponent's OK before anything (esp. a bet) is on the table
        const opponentJid = mentionedJids[0];
        if (sameJid(opponentJid, senderJid)) return send('❌ You cannot play against yourself!');
        const betStr = cmd === 'challenge' ? args[2] : args[1];
        const bet = Math.max(0, parseInt(String(betStr || '').replace(/,/g, '')) || 0);
        if (bet > 0) {
            if (economy.getBalance(senderJid) < bet) return send("❌ You don't have enough Zeni for this bet!");
            if (economy.getBalance(opponentJid) < bet) return send("❌ Your opponent doesn't have enough Zeni!");
        }
        pendingChallenges.set(pendKey(chatId), { from: senderJid, to: opponentJid, bet, at: Date.now() });
        setTimeout(() => { const c = pendingChallenges.get(pendKey(chatId)); if (c && Date.now() - c.at >= CHALLENGE_TTL_MS) pendingChallenges.delete(pendKey(chatId)); }, CHALLENGE_TTL_MS + 500).unref?.();
        return send(`♟️ *CHESS CHALLENGE!*\n\n@${cleanJid(senderJid)} challenges @${cleanJid(opponentJid)}${bet ? ` for *${bet.toLocaleString()} Zeni*` : ''}!\n\n👉 @${cleanJid(opponentJid)}: \`${prefix} chess accept\` or \`${prefix} chess decline\` _(2 min)_\n_Colours are drawn at random._`, [senderJid, opponentJid]);
    }

    // ── everything below needs a live game ───────────────────────────────────
    const state = getGame(chatId);
    const needGame = ['move', 'm', 'board', 'show', 'moves', 'hint', 'undo', 'draw', 'resign', 'fen', 'stop', 'end', 'reset', 'force-reset'];
    if (!state && needGame.includes(cmd)) {
        if (cmd === 'stop' || cmd === 'end' || cmd === 'reset' || cmd === 'force-reset') {
            if (pendingChallenges.delete(pendKey(chatId))) return send('🛑 Pending challenge cleared.');
        }
        return send(`❌ No active game! Challenge someone with \`${prefix} chess @user\` or play the AI: \`${prefix} chess ai\``);
    }
    if (state) saveGuard(state);
    const isPlayer = !!state && (sameJid(senderJid, state.playerW) || sameJid(senderJid, state.playerB));
    const myColor = !state ? null : sameJid(senderJid, state.playerW) ? 'w' : 'b';

    // MOVE
    if (cmd === 'move' || cmd === 'm') {
        const raw = args.slice(1).join(' ').trim();
        if (!raw) return send(`❌ Specify your move! e.g. \`${prefix} move e2e4\` or \`${prefix} move Nf3\``);
        return withLock(chatId, async () => {
            const st = getGame(chatId);
            if (!st) return;
            if (st.aiThinking && isAiTurn(st)) return send('🤖 Hold on - the AI is still thinking!');
            const turnJid = st.chess.turn() === 'w' ? st.playerW : st.playerB;
            if (!sameJid(senderJid, turnJid)) return send(`❌ It's not your turn! Waiting for @${cleanJid(turnJid)}`, [turnJid]);
            const move = parseMove(st.chess, raw);
            if (!move) {
                const sq = raw.toLowerCase().match(/^[a-h][1-8]$/) ? raw.toLowerCase() : null;
                const legal = st.chess.moves();
                const near = sq ? legal.filter((x) => x.includes(sq)).slice(0, 8) : [];
                return send(`❌ *Can't play* \`${raw}\`\n\n` + (near.length ? `Did you mean: ${near.map((x) => `\`${x}\``).join(', ')}?\n\n` : '') +
                    `💡 Easiest: type start+end square, e.g. \`${prefix} move e2e4\`\n👉 \`${prefix} chess moves\` lists everything legal · \`${prefix} chess guide\` explains it all`);
            }
            return applyMove(sock, chatId, st, move, botMarker);
        });
    }

    // BOARD
    if (cmd === 'board' || cmd === 'show') {
        const turnJid = state.chess.turn() === 'w' ? state.playerW : state.playerB;
        const who = state.ai && isAiTurn(state) ? '🤖 AI' : `@${cleanJid(turnJid)}`;
        return sendBoard(sock, chatId, state, botMarker + `♟️ *CURRENT BOARD*  (move ${Math.floor(state.moves.length / 2) + 1})\n\n👉 Turn: *${state.chess.turn() === 'w' ? 'White' : 'Black'}* (${who})${state.bet ? `\n💰 Bet: ${state.bet.toLocaleString()} Zeni` : ''}`, state.ai && isAiTurn(state) ? [] : [turnJid]);
    }

    // MOVES (all legal, or one piece drawn on the board)
    if (cmd === 'moves') {
        const sq = (args[1] || '').toLowerCase();
        if (/^[a-h][1-8]$/.test(sq)) {
            const list = state.chess.moves({ square: sq, verbose: true });
            if (!list.length) return send(`❌ No legal moves from *${sq}* (empty square, the other side's piece, or it's blocked).`);
            return sendBoard(sock, chatId, state, botMarker + `🎯 *Moves from ${sq}:* ${list.map((x) => x.san).join(', ')}\n_Dots = free squares, rings = captures._`, [], { moves: list.map((x) => x.to) });
        }
        const grouped = {};
        for (const x of state.chess.moves({ verbose: true })) (grouped[x.from] = grouped[x.from] || []).push(x.san);
        const lines = Object.entries(grouped).map(([from, sans]) => `${from}: ${sans.join(', ')}`).join('\n');
        return send(`📜 *LEGAL MOVES* (${state.chess.turn() === 'w' ? 'White' : 'Black'})\n\n${lines}\n\n_See one piece on the board: \`${prefix} chess moves e2\`_`);
    }

    // HINT
    if (cmd === 'hint') {
        if (!isPlayer) return send('❌ Only the players can ask for a hint.');
        if (state.bet > 0) return send('❌ No hints in bet matches!');
        if (!sameJid(senderJid, state.chess.turn() === 'w' ? state.playerW : state.playerB)) return send("❌ It's not your turn.");
        if (state.aiThinking) return send('🤖 Hold on - the AI is thinking!');
        let r;
        try { r = await chessAI.bestMoveAsync(state.chess.fen(), 'hard'); } catch (e) { return send('❌ Could not think of a hint right now.'); }
        if (!r) return send('❌ No legal moves.');
        return sendBoard(sock, chatId, state, botMarker + `💡 *HINT:* try \`${r.san}\`  _(${r.from} → ${r.to})_`, [], { moves: [r.to], lastMove: r.from + r.to });
    }

    // FEN
    if (cmd === 'fen') return send(`🧩 *FEN:* \`${state.chess.fen()}\``);

    // RESIGN
    if (cmd === 'resign') {
        if (!isPlayer) return send('❌ Only the players can resign.');
        return withLock(chatId, async () => {
            const st = getGame(chatId);
            if (!st) return;
            const winnerColor = myColor === 'w' ? 'b' : 'w';
            const winner = winnerColor === 'w' ? st.playerW : st.playerB;
            const txt = settleGame(st, winnerColor, `@${cleanJid(senderJid)} RESIGNED.`).replace(/^🏁 \*(.*?)\*\s+/, '🏳️ *$1* ');
            return send(txt, [st.playerW, st.playerB].filter((j) => !st.ai || !sameJid(j, aiJid(st))));
        });
    }

    // DRAW
    if (cmd === 'draw') {
        if (!isPlayer) return send('❌ Only the players can offer a draw.');
        return withLock(chatId, async () => {
            const st = getGame(chatId);
            if (!st) return;
            if (st.ai) {
                const ev = chessAI.evaluate(st.chess); // side-to-move POV
                const aiPov = st.chess.turn() === st.ai.color ? ev : -ev;
                if (st.moves.length >= 40 && aiPov < 60) { const t = settleGame(st, 'd', 'The AI accepts your draw offer.'); return send(t, [senderJid]); }
                return send('🤖 The AI declines the draw - it thinks it can still win. Play on!');
            }
            if (st.drawOfferedBy && !sameJid(st.drawOfferedBy, senderJid)) { const t = settleGame(st, 'd', 'DRAW ACCEPTED!'); return send(t, [st.playerW, st.playerB]); }
            if (sameJid(st.drawOfferedBy, senderJid)) return send('⏳ You already offered a draw - waiting for your opponent.');
            st.drawOfferedBy = senderJid; saveActiveGames();
            const opp = sameJid(senderJid, st.playerW) ? st.playerB : st.playerW;
            return send(`⚖️ @${cleanJid(senderJid)} offers a draw! @${cleanJid(opp)}, send \`${prefix} chess draw\` to accept (any move cancels it).`, [senderJid, opp]);
        });
    }

    // UNDO (PvP: opponent must agree; vs AI: takes back your last move + the AI reply; never in bet games)
    if (cmd === 'undo') {
        if (!isPlayer) return send('❌ Only the players can undo.');
        if (state.bet > 0) return send('❌ No takebacks in bet matches!');
        return withLock(chatId, async () => {
            const st = getGame(chatId);
            if (!st || !st.moves.length) return send('❌ No moves to undo!');
            if (st.aiThinking) return send('🤖 Wait for the AI to finish its move first.');
            const doUndo = (plies) => {
                for (let i = 0; i < plies && st.moves.length; i++) { st.chess.undo(); st.moves.pop(); }
                st.fen = st.chess.fen(); st.lastMove = null; st.drawOfferedBy = null; st.undoOfferedBy = null; st.lastActivity = Date.now(); saveActiveGames();
            };
            if (st.ai) {
                const humanColor = st.ai.color === 'w' ? 'b' : 'w';
                const lastWasAi = st.chess.history({ verbose: true }).slice(-1)[0]?.color === st.ai.color;
                const plies = lastWasAi ? Math.min(2, st.moves.length) : 1;
                if (st.chess.turn() !== humanColor && !lastWasAi) return send('❌ Nothing to undo yet.');
                doUndo(plies);
                if (isAiTurn(st)) scheduleAI(sock, chatId, st, botMarker); // undid down to the AI's turn (human was black, AI opened)
                return sendBoard(sock, chatId, st, botMarker + `↩️ *MOVE UNDONE!*\n\n👉 Your turn.`, [senderJid]);
            }
            const last = st.chess.history({ verbose: true }).slice(-1)[0];
            const lastMoverJid = last.color === 'w' ? st.playerW : st.playerB;
            if (sameJid(st.undoOfferedBy, senderJid) || (!st.undoOfferedBy && sameJid(senderJid, lastMoverJid))) {
                if (!sameJid(st.undoOfferedBy, senderJid)) { st.undoOfferedBy = senderJid; saveActiveGames(); }
                const opp = sameJid(senderJid, st.playerW) ? st.playerB : st.playerW;
                return send(`↩️ @${cleanJid(senderJid)} asks to take back their last move. @${cleanJid(opp)}, send \`${prefix} chess undo\` to allow it (any move cancels the request).`, [senderJid, opp]);
            }
            if (st.undoOfferedBy && !sameJid(st.undoOfferedBy, senderJid)) {
                doUndo(1);
                return sendBoard(sock, chatId, st, botMarker + `↩️ *MOVE UNDONE!* (both players agreed)\n\n👉 Turn: @${cleanJid(st.chess.turn() === 'w' ? st.playerW : st.playerB)}`, [st.chess.turn() === 'w' ? st.playerW : st.playerB]);
            }
            return send(`❌ Only the player who just moved can ask for a takeback (the opponent then confirms).`);
        });
    }

    // STOP / END / RESET
    if (cmd === 'stop' || cmd === 'end' || cmd === 'reset' || cmd === 'force-reset') {
        const isAdmin = !!m.key?.fromMe || mentionedJids.some((j) => sameJid(j, sock.user.id));
        const idle = Date.now() - (state.lastActivity || state.startTime || 0) > IDLE_STOP_MS;
        const ok = isPlayer || isAdmin || (idle && !(state.bet > 0));
        if (!ok) return send(`❌ Only the players can stop the game${state.bet > 0 ? '' : ' (anyone can after 30 idle minutes)'}.`);
        return withLock(chatId, async () => {
            const st = getGame(chatId);
            if (!st) return;
            let forfeit = '';
            if (isPlayer && st.bet > 0 && !st.ai) { // 💡 forfeit rule (2026-10-31): a player stopping a live bet match forfeits it
                const winnerColor = myColor === 'w' ? 'b' : 'w';
                const winner = winnerColor === 'w' ? st.playerW : st.playerB;
                const paid = economy.removeMoney(senderJid, st.bet);
                if (paid) { economy.addMoney(winner, st.bet); forfeit = `\n💰 Forfeit: @${cleanJid(winner)} wins ${st.bet.toLocaleString()} Zeni.`; } else forfeit = `\n⚠️ Bet VOIDED (forfeiting player can't cover it).`;
                recordResult(st, winnerColor);
            }
            st.status = 'stopped';
            deleteGame(chatId);
            return send(`🛑 Chess game ${isAdmin && !isPlayer ? 'FORCE CLEARED by admin' : 'terminated'}.${forfeit}`, [senderJid]);
        });
    }

    // unknown subcommand
    return send(`❓ Unknown chess command. Try \`${prefix} chess help\``);
}

function saveGuard(state) { if (!state.moves) state.moves = []; if (!state.style) state.style = { ...DEFAULT_PREFS }; if (!state.id) state.id = newId(); }

module.exports = { handleChess, getGame, activeGamesMap, loadActiveGames, _parseMove: parseMove };
