// ============================================
// JOKER TIC-TAC-TOE TOURNAMENT
// `.j tourney create|join|start|bracket|board|top|forfeit|leave|cancel`
// Single-elimination bracket, seeded by the TTT leaderboard, byes for odd fields,
// matches run in PARALLEL (moves go through the normal `.j move <cell>` - the bot finds
// your live match), best-of series, draws replay, AFK = forfeit, champion ceremony,
// prize pool + a persistent Hall of Champions.
// Grids: 3 (classic), 8 (mega, 4-in-a-row), 16 (ultra, 5-in-a-row) or MIXED
// (early rounds 3x3 -> semi-finals 8x8 -> final 16x16).
// ============================================
const botConfig = require('../../botConfig');
const economy = require('../rpg/economy');
const system = require('../utils/system');
const ttt = require('./tictactoe')._internal;
const render = require('./tourneyRender');

const tournaments = new Map(); // chatId -> tournament

const LOBBY_TTL_MS = 30 * 60 * 1000;
const MOVE_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_DRAWS_IN_A_ROW = 3;      // then the higher seed advances ("seed advantage")
const norm = (j) => ttt.normalizeJid(j);
const px = () => botConfig.getPrefix();
const tag = (j) => '@' + norm(j);
const GRID_PTS = { 3: 1, 8: 2, 16: 3 };

// ---------- helpers ----------
function seedOrder(n) { let o = [1, 2]; while (o.length < n) { const m = o.length * 2 + 1; o = o.flatMap((s) => [s, m - s]); } return o; }
function pow2(n) { let p = 2; while (p < n) p *= 2; return p; }
function displayName(jid, fallback) {
    try { const n = economy.getDisplayName(jid); if (n && !/^\d+$/.test(n)) return n; } catch (e) { /* ignore */ }
    return fallback || ('Player' + String(norm(jid) || '').slice(-4));
}
async function send(sock, chatId, buffer, caption, mentions = [], quoted) {
    try {
        if (buffer) return await sock.sendMessage(chatId, { image: buffer, caption, contextInfo: { mentionedJid: mentions } }, quoted ? { quoted } : undefined);
        return await sock.sendMessage(chatId, { text: caption, contextInfo: { mentionedJid: mentions } }, quoted ? { quoted } : undefined);
    } catch (e) { console.error('[Tourney] send failed:', e.message); }
}
function safeRender(fn, ...a) { try { return fn(...a); } catch (e) { console.error('[Tourney] render failed:', e.message); return null; } }

// ---------- Hall of Champions (persistent) ----------
function hall() { return system.get('ttt_tourney', {}); }
function hallRow(h, jid, name) {
    const k = norm(jid);
    if (!h[k]) h[k] = { name: name || 'User', fullJid: jid, titles: 0, finals: 0, semis: 0, played: 0, matchW: 0, matchL: 0, pts: 0 };
    if (name) h[k].name = name;
    return h[k];
}

// ---------- tournament construction ----------
function gridForRound(t, r) {
    if (t.grid !== 'mixed') return t.grid;
    const left = t.rounds.length - r;       // 1 = final
    return left === 1 ? 16 : left === 2 ? 8 : 3;
}

function buildBracket(t) {
    const ranked = t.players.slice().sort((a, b) => (b.score - a.score) || (a.joined - b.joined));
    ranked.forEach((p, i) => { p.seed = i + 1; });
    const size = pow2(ranked.length), R = Math.log2(size), order = seedOrder(size);
    t.rounds = [];
    for (let r = 0; r < R; r++) {
        const n = size / Math.pow(2, r + 1), row = [];
        for (let i = 0; i < n; i++) {
            row.push({ id: `${r + 1}-${i + 1}`, round: r, idx: i, a: null, b: null, wins: { a: 0, b: 0 }, status: 'pending', winner: null, bye: false, cur: null, gamesPlayed: 0, draws: 0, timer: null });
        }
        t.rounds.push(row);
    }
    for (let i = 0; i < size / 2; i++) {
        const m = t.rounds[0][i];
        m.a = ranked[order[i * 2] - 1] || null;
        m.b = ranked[order[i * 2 + 1] - 1] || null;
        if (!m.a && m.b) { m.a = m.b; m.b = null; }
        if (m.a && !m.b) { m.bye = true; m.status = 'done'; m.winner = m.a.jid; }
    }
    t.gridFor = (r) => gridForRound(t, r);
}

function view(t) { t.gridFor = (r) => gridForRound(t, r); return t; }

// ---------- match flow ----------
function matchLabel(t, m) { return `${render.roundName(m.round, t.rounds.length)} - Match ${m.idx + 1}`; }
function sideOf(m, jid) { return norm(m.a && m.a.jid) === norm(jid) ? 'a' : norm(m.b && m.b.jid) === norm(jid) ? 'b' : null; }
function opp(m, side) { return side === 'a' ? m.b : m.a; }
function findLiveMatch(t, jid) {
    for (const row of t.rounds) for (const m of row) if (m.status === 'live' && sideOf(m, jid)) return m;
    return null;
}
function stats(t, jid) { const k = norm(jid); return (t.stats[k] = t.stats[k] || { w: 0, l: 0 }); }

function armTimer(t, m, sock) {
    clearTimeout(m.timer);
    m.timer = setTimeout(async () => {
        try {
            if (m.status !== 'live' || !m.cur) return;
            const loserJid = m.cur.turn, side = sideOf(m, loserJid), winSide = side === 'a' ? 'b' : 'a';
            await send(sock, t.chatId, null, `${t.tag} ⌛ *AFK FORFEIT!* ${tag(loserJid)} did not move in ${Math.round(MOVE_TIMEOUT_MS / 60000)} minutes.\n${tag(opp(m, side).jid)} advances.`, [loserJid, opp(m, side).jid]);
            m.wins[winSide] = Math.max(m.wins[winSide], Math.ceil(t.bestOf / 2));
            await finishMatch(sock, t, m, opp(m, side).jid, 'forfeit');
        } catch (e) { console.error('[Tourney] timer error:', e.message); }
    }, MOVE_TIMEOUT_MS);
    if (m.timer.unref) m.timer.unref();
}

async function startGame(sock, t, m, announce = true) {
    const grid = gridForRound(t, m.round);
    const num = m.gamesPlayed + 1;
    // game 1: higher seed (lower number) takes X; afterwards the first move alternates
    const firstSide = !m.cur ? ((m.a.seed || 0) <= (m.b.seed || 0) ? 'a' : 'b') : (m.cur.firstSide === 'a' ? 'b' : 'a');
    const xp = firstSide === 'a' ? m.a : m.b, op = firstSide === 'a' ? m.b : m.a;
    m.cur = { grid, board: Array(grid * grid).fill(null), turn: xp.jid, x: xp.jid, o: op.jid, last: null, num, firstSide };
    m.status = 'live';
    armTimer(t, m, sock);
    if (!announce) return;
    const buf = await ttt.renderBoard(m.cur.board, grid);
    const need = Math.ceil(t.bestOf / 2);
    const cap = `${t.tag} ⚔️ *${matchLabel(t, m)}*\n` +
        `${grid === 3 ? '3x3 CLASSIC' : grid === 8 ? '8x8 MEGA (4 in a row)' : '16x16 ULTRA (5 in a row)'}` + (t.bestOf > 1 ? ` • Best of ${t.bestOf} (first to ${need}) • Game ${num}` : '') + `\n\n` +
        `❌ ${tag(xp.jid)}   vs   ⭕ ${tag(op.jid)}\n` +
        (t.bestOf > 1 ? `Series: ${m.wins.a}-${m.wins.b}\n` : '') +
        `\n${tag(xp.jid)} moves first!  Use \`${px()} move <0-${grid * grid - 1}>\`\n⏱️ ${Math.round(MOVE_TIMEOUT_MS / 60000)} min per move or you forfeit.`;
    await send(sock, t.chatId, buf, cap + (buf ? '' : '\n\n' + ttt.getBoardText(m.cur.board, grid)), [xp.jid, op.jid]);
}

async function launchReadyMatches(sock, t) {
    for (const row of t.rounds) for (const m of row) {
        if (m.status === 'pending' && m.a && m.b) await startGame(sock, t, m);
    }
}

async function finishMatch(sock, t, m, winnerJid, how) {
    clearTimeout(m.timer);
    if (m.status === 'done') return;
    m.status = 'done'; m.winner = winnerJid; m.cur = null;
    const wSide = sideOf(m, winnerJid), lSide = wSide === 'a' ? 'b' : 'a', W = m[wSide], L = m[lSide];
    stats(t, W.jid).w++; stats(t, L.jid).l++;
    L.out = m.round; // eliminated in this round
    const final = m.round === t.rounds.length - 1;
    const line = `🏁 ${tag(W.jid)} defeats ${tag(L.jid)}` + (t.bestOf > 1 ? ` *${m.wins[wSide]}-${m.wins[lSide]}*` : '') + (how === 'seed' ? ' (seed advantage after repeated draws)' : how === 'forfeit' ? ' (forfeit)' : '');
    if (final) { await finishTournament(sock, t, m, W, L, line); return; }
    // advance the winner
    const next = t.rounds[m.round + 1][Math.floor(m.idx / 2)];
    next[m.idx % 2 === 0 ? 'a' : 'b'] = W;
    const roundDone = t.rounds[m.round].every((x) => x.status === 'done');
    const waiting = next.a && !next.b ? `Waiting for the other ${render.roundName(m.round + 1, t.rounds.length).toLowerCase()} spot...` : '';
    await send(sock, t.chatId, null, `${t.tag} ${line}\n➡️ ${tag(W.jid)} advances to the ${render.roundName(m.round + 1, t.rounds.length)}!${waiting ? '\n' + waiting : ''}`, [W.jid, L.jid]);
    if (roundDone) {
        const buf = safeRender(render.renderBracket, view(t));
        await send(sock, t.chatId, buf, `${t.tag} 📊 *${render.roundName(m.round, t.rounds.length)} COMPLETE* - next up: *${render.roundName(m.round + 1, t.rounds.length)}* (${t.gridFor(m.round + 1) === 3 ? '3x3' : t.gridFor(m.round + 1) + 'x' + t.gridFor(m.round + 1)})`);
    }
    await launchReadyMatches(sock, t);
}

async function finishTournament(sock, t, finalMatch, champ, runnerUp, lastLine) {
    t.status = 'done'; t.champion = champ;
    t.rounds.forEach((row) => row.forEach((m) => clearTimeout(m.timer)));
    const n = t.players.length;
    // prizes
    const base = 400 + n * 150;
    const prizes = new Map();
    prizes.set(norm(champ.jid), Math.floor(base));
    prizes.set(norm(runnerUp.jid), Math.floor(base * 0.4));
    const semiLosers = [];
    if (t.rounds.length >= 2) t.rounds[t.rounds.length - 2].forEach((m) => { const l = m.a && m.b ? (m.winner === m.a.jid ? m.b : m.a) : null; if (l && !m.bye) semiLosers.push(l); });
    semiLosers.forEach((p) => prizes.set(norm(p.jid), Math.floor(base * 0.15)));
    for (const p of t.players) { const amt = prizes.get(norm(p.jid)); if (amt) { try { economy.addMoney(p.jid, amt, `TTT Tournament: ${t.name}`); } catch (e) { /* ignore */ } } }
    // hall of champions
    try {
        const h = hall();
        for (const p of t.players) {
            const r = hallRow(h, p.jid, p.name), st = t.stats[norm(p.jid)] || { w: 0, l: 0 };
            r.played++; r.matchW += st.w; r.matchL += st.l; r.pts += 1 + st.w;
            if (norm(p.jid) === norm(champ.jid)) { r.titles++; r.finals++; r.pts += 10; }
            else if (norm(p.jid) === norm(runnerUp.jid)) { r.finals++; r.pts += 6; }
            else if (semiLosers.some((s) => norm(s.jid) === norm(p.jid))) { r.semis++; r.pts += 3; }
        }
        system.set('ttt_tourney', h);
        // champion also gets bragging rights on the main TTT leaderboard
        ttt.updateScoreboard(champ.jid, champ.name, 5);
    } catch (e) { console.error('[Tourney] hall update failed:', e.message); }
    const cst = t.stats[norm(champ.jid)] || { w: 0, l: 0 };
    const podium = [{ name: champ.name, line: `${cst.w} wins - ${cst.l} losses` }, { name: runnerUp.name }, semiLosers[0] ? { name: semiLosers[0].name } : null];
    const buf = safeRender(render.renderChampion, view(t), [podium[0], podium[1], podium[2] || (semiLosers[1] ? { name: semiLosers[1].name } : null)]);
    const lines = [
        `${t.tag} ${lastLine}`, '',
        `🏆🏆 *${t.name.toUpperCase()} CHAMPION* 🏆🏆`,
        `👑 ${tag(champ.jid)}  ${cst.w}-${cst.l}`, `🥈 ${tag(runnerUp.jid)}`,
        ...semiLosers.map((p) => `🥉 ${tag(p.jid)}`), '',
        `💰 Prizes: 👑 ${prizes.get(norm(champ.jid))} • 🥈 ${prizes.get(norm(runnerUp.jid))}` + (semiLosers.length ? ` • 🥉 ${Math.floor(base * 0.15)}` : '') + ' Zeni',
        `📜 \`${px()} tourney top\` for the Hall of Champions`,
    ];
    await send(sock, t.chatId, buf, lines.join('\n'), t.players.map((p) => p.jid));
    const bracket = safeRender(render.renderBracket, view(t));
    await send(sock, t.chatId, bracket, `${t.tag} 🗺️ Final bracket`);
    setTimeout(() => { if (tournaments.get(t.chatId) === t) tournaments.delete(t.chatId); }, 10 * 60 * 1000).unref();
}

// ---------- moves ----------
function hasPlayerMatch(chatId, jid) {
    const t = tournaments.get(chatId);
    return !!(t && t.status === 'running' && findLiveMatch(t, jid));
}

async function handleMove(sock, chatId, senderJid, cellRaw, botMarker, m0) {
    const t = tournaments.get(chatId);
    const m = t && findLiveMatch(t, senderJid);
    if (!m) return false;
    const g = m.cur, cell = parseInt(cellRaw, 10);
    const reply = (text) => sock.sendMessage(chatId, { text: botMarker + text }, { quoted: m0 });
    if (norm(g.turn) !== norm(senderJid)) { await reply(`❌ Not your turn in *${matchLabel(t, m)}*.`); return true; }
    if (!Number.isInteger(cell) || cell < 0 || cell >= g.board.length || g.board[cell] !== null) { await reply(`❌ Invalid move. Pick a free cell 0-${g.board.length - 1}.`); return true; }
    const marker = norm(g.x) === norm(senderJid) ? 'X' : 'O';
    g.board[cell] = marker; g.last = cell;
    const side = sideOf(m, senderJid), other = opp(m, side);
    const win = ttt.checkWin(g.board, marker, g.grid);
    const need = Math.ceil(t.bestOf / 2);
    if (win) {
        m.wins[side]++; m.draws = 0; m.gamesPlayed++;
        const done = m.wins[side] >= need;
        const buf = await ttt.renderBoard(g.board, g.grid, cell, win);
        const cap = `${t.tag} ${marker === 'X' ? '❌' : '⭕'} *${matchLabel(t, m)}* — ${tag(senderJid)} wins` + (t.bestOf > 1 ? ` game ${g.num}!  Series ${m.wins.a}-${m.wins.b}` : '!');
        await send(sock, chatId, buf, cap + (buf ? '' : '\n\n' + ttt.getBoardText(g.board, g.grid, cell, win)), [m.a.jid, m.b.jid]);
        if (done) await finishMatch(sock, t, m, senderJid, 'win');
        else await startGame(sock, t, m);
        return true;
    }
    if (ttt.isDrawInevitable(g.board, g.grid)) {
        m.draws++; m.gamesPlayed++;
        const buf = await ttt.renderBoard(g.board, g.grid, cell);
        await send(sock, chatId, buf, `${t.tag} ⚖️ *${matchLabel(t, m)}* — DRAW!` + (m.draws >= MAX_DRAWS_IN_A_ROW ? ' Too many draws - the higher seed advances.' : ' Replaying - sides swap!') + (buf ? '' : '\n\n' + ttt.getBoardText(g.board, g.grid, cell)), [m.a.jid, m.b.jid]);
        if (m.draws >= MAX_DRAWS_IN_A_ROW) {
            const hi = (m.a.seed || 99) <= (m.b.seed || 99) ? m.a : m.b;
            await finishMatch(sock, t, m, hi.jid, 'seed');
        } else {
            m.gamesPlayed--; // a drawn game does not count toward the series length
            await startGame(sock, t, m);
        }
        return true;
    }
    g.turn = other.jid;
    armTimer(t, m, sock);
    const buf = await ttt.renderBoard(g.board, g.grid, cell);
    await send(sock, chatId, buf, `${t.tag} ${norm(g.x) === norm(g.turn) ? '❌' : '⭕'} ${tag(g.turn)}'s turn  •  ${matchLabel(t, m)}` + (t.bestOf > 1 ? `  •  Series ${m.wins.a}-${m.wins.b}` : '') + (buf ? '' : '\n\n' + ttt.getBoardText(g.board, g.grid, cell)), [g.turn]);
    return true;
}

// ---------- lobby / commands ----------
function parseCreate(args) {
    const o = { grid: 3, bestOf: 1, max: 8, name: [] };
    for (let i = 0; i < args.length; i++) {
        const a = args[i].toLowerCase();
        if (a === 'mixed' || a === 'mix' || a === 'escalate') o.grid = 'mixed';
        else if (['3', '3x3', 'classic', 'ttt'].includes(a)) o.grid = 3;
        else if (['8', '8x8', 'mega', 'tttt'].includes(a)) o.grid = 8;
        else if (['16', '16x16', 'ultra', 'ttttt'].includes(a)) o.grid = 16;
        else if (/^bo[135]$/.test(a)) o.bestOf = parseInt(a.slice(2), 10);
        else if (/^bestof[135]$/.test(a)) o.bestOf = parseInt(a.slice(6), 10);
        else if (a === 'max' && /^\d+$/.test(args[i + 1] || '')) { o.max = parseInt(args[i + 1], 10); i++; }
        else if (/^max\d+$/.test(a)) o.max = parseInt(a.slice(3), 10);
        else o.name.push(args[i]);
    }
    o.max = Math.max(2, Math.min(32, o.max));
    return o;
}

function helpText() {
    const p = px();
    return `🏟️ *TIC-TAC-TOE TOURNAMENT*\n\n` +
        `\`${p} tourney create [3|8|16|mixed] [bo1|bo3|bo5] [max N] [name]\`\n` +
        `   e.g. \`${p} tourney create mixed bo3 max 8 Friday Showdown\`\n` +
        `\`${p} tourney join\` • \`leave\` • \`start\` (host)\n` +
        `\`${p} tourney bracket\` • \`board\` • \`forfeit\` • \`cancel\` (host)\n` +
        `\`${p} tourney top\` — Hall of Champions\n\n` +
        `*Grids:* 3 = classic • 8 = mega (4-in-row) • 16 = ultra (5-in-row) • *mixed* = 3x3 early rounds → 8x8 semis → 16x16 final\n` +
        `*Play:* matches run side by side — just use \`${p} move <cell>\` when it's your turn.`;
}

async function handle(sock, chatId, senderJid, args, m, botMarker, senderName) {
    const sub = (args[0] || '').toLowerCase();
    const t = tournaments.get(chatId);
    const reply = (text, mentions = []) => sock.sendMessage(chatId, { text: botMarker + text, contextInfo: { mentionedJid: mentions } }, { quoted: m });
    const isHost = t && norm(t.host) === norm(senderJid);
    const myName = senderName && senderName !== 'Player' ? senderName : displayName(senderJid);

    if (!sub || sub === 'help') {
        if (t) await send(sock, chatId, safeRender(t.status === 'lobby' ? render.renderLobby : render.renderBracket, view(t)), botMarker + `🏟️ *${t.name}* is ${t.status === 'lobby' ? 'open for entry' : t.status === 'running' ? 'in progress' : 'finished'}.\n\n` + helpText(), [], m);
        else await reply(helpText());
        return;
    }

    if (sub === 'top' || sub === 'hall' || sub === 'leaderboard' || sub === 'scores') {
        const h = hall();
        const rows = Object.values(h).sort((a, b) => (b.titles - a.titles) || (b.pts - a.pts) || (b.matchW - a.matchW)).slice(0, 10);
        const buf = safeRender(render.renderHall, rows);
        const txt = rows.length ? rows.map((r, i) => `${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} @${norm(r.fullJid)} • 👑${r.titles} • ${r.pts} pts`).join('\n') : 'No tournaments played yet — be the first champion!';
        await send(sock, chatId, buf, botMarker + `📜 *HALL OF CHAMPIONS*\n\n${txt}\n\n🏅 Title +10 • Final +6 • Semi +3 • Entry +1 • each match win +1`, rows.map((r) => r.fullJid), m);
        return;
    }

    if (sub === 'create' || sub === 'new' || sub === 'host') {
        if (t && t.status !== 'done') { await reply(`❌ A tournament (*${t.name}*) is already ${t.status === 'lobby' ? 'open' : 'running'} here. \`${px()} tourney join\` or \`bracket\`.`); return; }
        const o = parseCreate(args.slice(1));
        const nt = {
            id: Date.now().toString(36), chatId, host: senderJid, name: (o.name.join(' ').trim() || 'Joker Open').slice(0, 26),
            grid: o.grid, bestOf: o.bestOf, maxPlayers: o.max, status: 'lobby', players: [], rounds: [], stats: {}, champion: null, createdAt: Date.now(),
        };
        nt.tag = '🏟️';
        const score = ttt.getAllScores()[norm(senderJid)];
        nt.players.push({ jid: senderJid, name: myName, score: score ? score.score : 0, joined: 1, seed: 0 });
        nt.lobbyTimer = setTimeout(() => { if (tournaments.get(chatId) === nt && nt.status === 'lobby') { tournaments.delete(chatId); sock.sendMessage(chatId, { text: botMarker + `⌛ *${nt.name}* was cancelled — nobody started it within 30 minutes.` }).catch(() => {}); } }, LOBBY_TTL_MS);
        if (nt.lobbyTimer.unref) nt.lobbyTimer.unref();
        tournaments.set(chatId, nt);
        const g = nt.grid === 'mixed' ? 'MIXED (3x3 → 8x8 semis → 16x16 final)' : nt.grid === 3 ? '3x3 classic' : nt.grid === 8 ? '8x8 mega' : '16x16 ultra';
        await send(sock, chatId, safeRender(render.renderLobby, view(nt)),
            botMarker + `🏟️ *${nt.name.toUpperCase()}* — registration open!\n\n🎯 ${g} • Best of ${nt.bestOf} • up to ${nt.maxPlayers} players\n👤 Host: ${tag(senderJid)}\n\n➡️ \`${px()} tourney join\` to enter\n▶️ Host: \`${px()} tourney start\` when ready (min 2)`, [senderJid]);
        return;
    }

    if (!t) { await reply(`❌ No tournament here. Start one: \`${px()} tourney create\``); return; }

    if (sub === 'join') {
        if (t.status !== 'lobby') { await reply('❌ Registration is closed — this tournament already started.'); return; }
        if (t.players.some((p) => norm(p.jid) === norm(senderJid))) { await reply('✅ You are already entered.'); return; }
        if (t.players.length >= t.maxPlayers) { await reply('❌ The tournament is full.'); return; }
        const score = ttt.getAllScores()[norm(senderJid)];
        t.players.push({ jid: senderJid, name: myName, score: score ? score.score : 0, joined: t.players.length + 1, seed: 0 });
        const full = t.players.length >= t.maxPlayers;
        await send(sock, chatId, safeRender(render.renderLobby, view(t)), botMarker + `✅ ${tag(senderJid)} entered! (${t.players.length}/${t.maxPlayers})` + (full ? `\n🔒 Full! Host: \`${px()} tourney start\`` : ''), t.players.map((p) => p.jid));
        return;
    }

    if (sub === 'leave') {
        if (t.status === 'lobby') {
            if (isHost) { await reply(`❌ Host can't leave — use \`${px()} tourney cancel\`.`); return; }
            const before = t.players.length;
            t.players = t.players.filter((p) => norm(p.jid) !== norm(senderJid));
            await reply(t.players.length < before ? `👋 ${tag(senderJid)} left the lobby (${t.players.length}/${t.maxPlayers}).` : '❌ You are not entered.', [senderJid]);
            return;
        }
        // running: leaving = forfeiting the live match
    }

    if (sub === 'forfeit' || sub === 'ff' || sub === 'leave') {
        if (t.status !== 'running') { await reply('❌ Nothing to forfeit right now.'); return; }
        const lm = findLiveMatch(t, senderJid);
        if (!lm) { await reply('❌ You have no live match.'); return; }
        const side = sideOf(lm, senderJid), o = opp(lm, side);
        await send(sock, chatId, null, `${t.tag} 🏳️ ${tag(senderJid)} forfeits! ${tag(o.jid)} advances.`, [senderJid, o.jid]);
        lm.wins[side === 'a' ? 'b' : 'a'] = Math.ceil(t.bestOf / 2);
        await finishMatch(sock, t, lm, o.jid, 'forfeit');
        return;
    }

    if (sub === 'start' || sub === 'begin') {
        if (!isHost) { await reply('❌ Only the host can start the tournament.'); return; }
        if (t.status !== 'lobby') { await reply('❌ Already started.'); return; }
        if (t.players.length < 2) { await reply('❌ Need at least 2 players.'); return; }
        clearTimeout(t.lobbyTimer);
        t.status = 'running';
        buildBracket(t);
        const R = t.rounds.length;
        const buf = safeRender(render.renderBracket, view(t));
        const byes = t.rounds[0].filter((x) => x.bye).map((x) => tag(x.a.jid));
        await send(sock, chatId, buf, `${t.tag} 🔔 *${t.name.toUpperCase()} BEGINS!*\n\n${t.players.length} contenders • ${R} round${R > 1 ? 's' : ''} • Best of ${t.bestOf}` + (t.grid === 'mixed' ? '\n📈 Escalating grids: 3x3 → 8x8 semis → 16x16 final' : '') + (byes.length ? `\n🎟️ Byes (top seeds): ${byes.join(' ')}` : '') + `\n\nSeeds were set from the TTT leaderboard. Matches start now — play with \`${px()} move <cell>\`.`, t.players.map((p) => p.jid));
        // byes may immediately fill round 2
        for (const bm of t.rounds[0].filter((x) => x.bye)) {
            if (R > 1) t.rounds[1][Math.floor(bm.idx / 2)][bm.idx % 2 === 0 ? 'a' : 'b'] = bm.a;
        }
        await launchReadyMatches(sock, t);
        return;
    }

    if (sub === 'bracket' || sub === 'map' || sub === 'status') {
        const buf = safeRender(t.status === 'lobby' ? render.renderLobby : render.renderBracket, view(t));
        const live = t.status === 'running' ? t.rounds.flat().filter((x) => x.status === 'live').map((x) => `• ${tag(x.a.jid)} vs ${tag(x.b.jid)} (${x.wins.a}-${x.wins.b})`) : [];
        await send(sock, chatId, buf, botMarker + `🗺️ *${t.name}*` + (live.length ? `\n\n🔴 Live now:\n${live.join('\n')}` : ''), t.rounds.flat().filter((x) => x.status === 'live').flatMap((x) => [x.a.jid, x.b.jid]), m);
        return;
    }

    if (sub === 'board') {
        const lm = t.status === 'running' && findLiveMatch(t, senderJid);
        if (!lm) { await reply('❌ You have no live match.'); return; }
        const g = lm.cur, buf = await ttt.renderBoard(g.board, g.grid, g.last);
        await send(sock, chatId, buf, botMarker + `${matchLabel(t, lm)} • ${norm(g.turn) === norm(g.x) ? '❌' : '⭕'} ${tag(g.turn)}'s turn` + (t.bestOf > 1 ? ` • Series ${lm.wins.a}-${lm.wins.b}` : '') + (buf ? '' : '\n\n' + ttt.getBoardText(g.board, g.grid, g.last)), [g.turn], m);
        return;
    }

    if (sub === 'cancel' || sub === 'end' || sub === 'stop') {
        if (!isHost) { await reply('❌ Only the host can cancel.'); return; }
        clearTimeout(t.lobbyTimer); t.rounds.forEach((row) => row.forEach((x) => clearTimeout(x.timer)));
        tournaments.delete(chatId);
        await reply(`🛑 *${t.name}* was cancelled by the host.`);
        return;
    }

    await reply(helpText());
}

module.exports = { handle, handleMove, hasPlayerMatch, _tournaments: tournaments, _build: buildBracket };
